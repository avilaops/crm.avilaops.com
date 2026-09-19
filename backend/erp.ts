import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "./db.js";

/**
 * PONTE COM O ERP — crm.avilaops.com ↔ erp.avilaops.com
 *
 * ## O problema de conciliação
 *
 * Os dois sistemas falam da mesma empresa e das mesmas pessoas com palavras
 * diferentes, e duas dessas palavras colidem com sentidos opostos:
 *
 * | Conceito              | ERP                    | CRM (aqui)          |
 * | :-------------------- | :--------------------- | :------------------ |
 * | Locatário             | `Tenant` (por domínio) | `tenants` (slug)    |
 * | Empresa **emitente**  | `Company` (CNPJ nosso) | — (não modela)      |
 * | Empresa **cliente**   | — (não modela)         | `companies`         |
 * | Pessoa                | `Customer`             | `contacts`          |
 * | Oportunidade          | — (não modela)         | `leads`             |
 * | Transação             | `Order` + `Payment*`   | — (não modela)      |
 *
 * `Company` no ERP é **quem emite a nota**; `companies` aqui é **para quem se
 * vende**. Tratar os dois como a mesma coisa por terem o mesmo nome seria o
 * erro mais caro possível nesta ponte, e é por isso que este mapa existe.
 *
 * ## Regra de ownership (§7.6 do blueprint do ERP)
 *
 * - **ERP é dono** de: catálogo, estoque, pedido, pagamento, fiscal, financeiro.
 * - **CRM é dono** de: conversa, funil, tarefa, responsável, origem do lead.
 * - **Pessoa é compartilhada**, com donos por campo: o CRM manda em nome de
 *   tratamento, origem e responsável; o ERP manda em CPF/CNPJ, limite de
 *   crédito e segmento RFM. Nenhum lado sobrescreve campo do outro — é o que
 *   impede a sincronização de virar cabo de guerra, com os dois sistemas
 *   revertendo a alteração um do outro em loop.
 *
 * ## Direção do fluxo
 *
 * ERP → CRM por webhook assinado (este arquivo, `handleErpEvent`).
 * CRM → ERP por chamada autenticada com chave de API (`pushContactToErp`).
 */

export const ERP_PROVIDER = "erp";
const SIGNATURE_TOLERANCE_SECONDS = 300;

export type ErpConnection = {
  tenant_id: string;
  base_url: string;
  api_key: string | null;
  webhook_secret: string | null;
  erp_tenant_id: string | null;
  settings: ErpSettings;
};

export type ErpSettings = {
  /**
   * Marca o lead como ganho quando um pedido do contato é confirmado.
   *
   * Padrão `false` de propósito: nem todo pedido nasce de um lead do funil —
   * uma recompra no PDV não deveria fechar a negociação aberta de outro
   * produto. Quem quer o automatismo liga explicitamente.
   */
  autoWinLeadOnOrder?: boolean;
  /** Cria contato para cliente que o CRM ainda não conhece. */
  createMissingContacts?: boolean;
};

const DEFAULT_SETTINGS: ErpSettings = { autoWinLeadOnOrder: false, createMissingContacts: true };

// ── Assinatura ──────────────────────────────────────────────────────────────

/**
 * Confere a assinatura `t=<epoch>,v1=<hmac>` produzida pelo ERP.
 *
 * O timestamp entra no que é assinado, e não como header solto: sem isso um
 * corpo capturado hoje continuaria válido para sempre, e a repetição
 * maliciosa seria indistinguível da reentrega legítima.
 *
 * A comparação é `timingSafeEqual` — `===` sobre string vaza, pelo tempo de
 * resposta, quantos caracteres iniciais estavam certos.
 */
export function verifyErpSignature(
  secret: string,
  rawBody: Buffer,
  header: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): { valid: boolean; reason?: string } {
  if (!header) return { valid: false, reason: "Assinatura ausente" };

  const parts = Object.fromEntries(
    header
      .split(",")
      .map((piece) => piece.trim().split("="))
      .filter((pair): pair is [string, string] => pair.length === 2),
  );

  const timestamp = Number(parts.t);
  const received = parts.v1;
  if (!Number.isFinite(timestamp) || !received) return { valid: false, reason: "Assinatura malformada" };
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { valid: false, reason: "Assinatura fora da janela de tolerancia" };
  }

  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex"),
    "utf8",
  );
  const provided = Buffer.from(received, "utf8");

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { valid: false, reason: "Assinatura invalida" };
  }
  return { valid: true };
}

// ── Vínculos ────────────────────────────────────────────────────────────────

export async function linkExternal(
  tenantId: string,
  entityType: string,
  entityId: string,
  externalId: string,
  metadata: Record<string, unknown> = {},
) {
  await query(
    `insert into external_references (tenant_id, system, entity_type, entity_id, external_id, metadata, synced_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (tenant_id, system, entity_type, entity_id)
     do update set external_id = excluded.external_id, metadata = excluded.metadata, synced_at = now()`,
    [tenantId, ERP_PROVIDER, entityType, entityId, externalId, JSON.stringify(metadata)],
  );
}

export async function internalIdOf(tenantId: string, entityType: string, externalId: string): Promise<string | null> {
  const result = await query<{ entity_id: string }>(
    `select entity_id from external_references
     where tenant_id = $1 and system = $2 and entity_type = $3 and external_id = $4`,
    [tenantId, ERP_PROVIDER, entityType, externalId],
  );
  return result.rows[0]?.entity_id ?? null;
}

export async function externalIdOf(tenantId: string, entityType: string, entityId: string): Promise<string | null> {
  const result = await query<{ external_id: string }>(
    `select external_id from external_references
     where tenant_id = $1 and system = $2 and entity_type = $3 and entity_id = $4`,
    [tenantId, ERP_PROVIDER, entityType, entityId],
  );
  return result.rows[0]?.external_id ?? null;
}

// ── Conexão ─────────────────────────────────────────────────────────────────

/**
 * Localiza a conexão pelo tenant **do ERP**, que é o que chega no header da
 * entrega. É o vínculo de identidade entre os dois locatários: o ERP não
 * conhece o uuid daqui, e aceitar o tenant do corpo deixaria o remetente
 * escolher em qual base gravar antes de a assinatura ser conferida.
 */
export async function findConnectionByErpTenant(
  erpTenantId: string,
  decrypt: (value: string | null) => string | null,
): Promise<ErpConnection | null> {
  const result = await query<{
    tenant_id: string;
    app_secret: string | null;
    access_token: string | null;
    metadata: Record<string, unknown>;
  }>(
    `select tenant_id, app_secret, access_token, metadata
     from integrations
     where provider = $1 and metadata->>'erp_tenant_id' = $2
     limit 1`,
    [ERP_PROVIDER, erpTenantId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    tenant_id: row.tenant_id,
    base_url: String(row.metadata?.base_url ?? ""),
    api_key: decrypt(row.access_token),
    webhook_secret: decrypt(row.app_secret),
    erp_tenant_id: erpTenantId,
    settings: { ...DEFAULT_SETTINGS, ...((row.metadata?.settings as ErpSettings) ?? {}) },
  };
}

export async function getConnection(
  tenantId: string,
  decrypt: (value: string | null) => string | null,
): Promise<ErpConnection | null> {
  const result = await query<{
    tenant_id: string;
    app_secret: string | null;
    access_token: string | null;
    metadata: Record<string, unknown>;
  }>(
    `select tenant_id, app_secret, access_token, metadata
     from integrations where tenant_id = $1 and provider = $2`,
    [tenantId, ERP_PROVIDER],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    tenant_id: row.tenant_id,
    base_url: String(row.metadata?.base_url ?? ""),
    api_key: decrypt(row.access_token),
    webhook_secret: decrypt(row.app_secret),
    erp_tenant_id: (row.metadata?.erp_tenant_id as string) ?? null,
    settings: { ...DEFAULT_SETTINGS, ...((row.metadata?.settings as ErpSettings) ?? {}) },
  };
}

// ── Entrada: eventos do ERP ─────────────────────────────────────────────────

export type ErpEventEnvelope = {
  id: string;
  type: string;
  tenantId: string;
  aggregate: { type: string; id: string };
  occurredAt: string;
  data: Record<string, unknown>;
};

/** Normaliza telefone para comparar: o ERP grava com máscara, o WhatsApp não. */
function digitsOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * Encontra o contato que já representa esta pessoa.
 *
 * A ordem das tentativas é a ordem de confiança da chave:
 *
 * 1. **vínculo explícito** — já conciliado antes, não há dúvida;
 * 2. **CPF/CNPJ** — documento é único por pessoa, é a chave do ERP;
 * 3. **telefone** — forte no Brasil, e é como o WhatsApp identifica;
 * 4. **e-mail** — o mais fraco: casal que compartilha caixa e endereço
 *    corporativo de contato fundiriam duas pessoas numa só.
 *
 * Não casar nada é resultado aceitável: cria-se um contato novo. Fundir dois
 * contatos por engano é muito mais caro de desfazer do que ter um duplicado.
 */
async function findContact(
  tenantId: string,
  erpCustomerId: string,
  data: Record<string, unknown>,
): Promise<string | null> {
  const linked = await internalIdOf(tenantId, "customer", erpCustomerId);
  if (linked) return linked;

  const cpfCnpj = digitsOnly(data.cpfCnpj);
  if (cpfCnpj) {
    const byDoc = await query<{ id: string }>(
      `select id from contacts
       where tenant_id = $1 and regexp_replace(coalesce(cpf_cnpj, ''), '\\D', '', 'g') = $2
       limit 1`,
      [tenantId, cpfCnpj],
    );
    if (byDoc.rows[0]) return byDoc.rows[0].id;
  }

  const phone = digitsOnly(data.phone);
  if (phone) {
    const byPhone = await query<{ id: string }>(
      `select id from contacts
       where tenant_id = $1 and regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = $2
       limit 1`,
      [tenantId, phone],
    );
    if (byPhone.rows[0]) return byPhone.rows[0].id;
  }

  if (typeof data.email === "string" && data.email.includes("@")) {
    const byEmail = await query<{ id: string }>(
      `select id from contacts where tenant_id = $1 and lower(email) = lower($2) limit 1`,
      [tenantId, data.email],
    );
    if (byEmail.rows[0]) return byEmail.rows[0].id;
  }

  return null;
}

/**
 * Concilia o cliente do ERP com o contato do CRM.
 *
 * `coalesce(contatos.campo, novo)` em vez de sobrescrever: o CRM é dono do
 * nome de tratamento e da origem, e uma sincronização não pode apagar o que o
 * vendedor anotou. O documento é a exceção — dele o ERP é dono, porque é ele
 * que emite a nota.
 */
export async function reconcileCustomer(
  connection: ErpConnection,
  erpCustomerId: string,
  data: Record<string, unknown>,
): Promise<{ contactId: string | null; created: boolean }> {
  const tenantId = connection.tenant_id;
  const existing = await findContact(tenantId, erpCustomerId, data);

  if (existing) {
    await query(
      `update contacts
          set name = coalesce(nullif(name, ''), $3),
              email = coalesce(email, $4),
              phone = coalesce(phone, $5),
              cpf_cnpj = coalesce($6, cpf_cnpj),
              updated_at = now()
        where tenant_id = $1 and id = $2`,
      [tenantId, existing, data.name ?? null, data.email ?? null, data.phone ?? null, data.cpfCnpj ?? null],
    );
    await linkExternal(tenantId, "customer", existing, erpCustomerId, { source: "erp" });
    return { contactId: existing, created: false };
  }

  if (!connection.settings.createMissingContacts) return { contactId: null, created: false };

  const inserted = await query<{ id: string }>(
    `insert into contacts (tenant_id, name, email, phone, cpf_cnpj, source)
     values ($1, $2, $3, $4, $5, 'erp')
     on conflict (tenant_id, phone) do update set updated_at = now()
     returning id`,
    [
      tenantId,
      typeof data.name === "string" && data.name.length > 0 ? data.name : "Cliente sem nome",
      data.email ?? null,
      data.phone ?? null,
      data.cpfCnpj ?? null,
    ],
  );

  const contactId = inserted.rows[0]?.id ?? null;
  if (contactId) await linkExternal(tenantId, "customer", contactId, erpCustomerId, { source: "erp" });

  return { contactId, created: Boolean(contactId) };
}

/**
 * Fecha o lead aberto do contato quando um pedido dele é confirmado.
 *
 * Só age com `autoWinLeadOnOrder` ligado, e escolhe o lead aberto mais
 * recente. Fechar todos seria pior: um cliente pode ter duas negociações
 * distintas em aberto, e o pedido corresponde a uma delas.
 */
async function winLeadForContact(
  tenantId: string,
  contactId: string,
  orderId: string,
  totalCents: number,
): Promise<string | null> {
  const lead = await query<{ id: string }>(
    `update leads
        set status = 'won',
            erp_order_id = $3,
            value_cents = case when $4 > 0 then $4 else value_cents end,
            won_at = now(),
            updated_at = now()
      where id = (
        select id from leads
         where tenant_id = $1 and contact_id = $2 and status = 'open'
         order by updated_at desc
         limit 1
      )
      returning id`,
    [tenantId, contactId, orderId, totalCents],
  );
  return lead.rows[0]?.id ?? null;
}

export type HandleResult = { action: string; contactId?: string | null; leadId?: string | null };

/**
 * Aplica um evento do ERP.
 *
 * O que chega e o que é feito com cada um:
 *
 * - `customer.upserted` → concilia a pessoa;
 * - `order.confirmed`   → concilia a pessoa e registra a venda na linha do
 *                         tempo; opcionalmente fecha o lead;
 * - `payment.*`         → registra na linha do tempo, porque quem atende
 *                         precisa saber se o cliente pagou antes de cobrar;
 * - resto              → registrado como visto, não como erro. Evento sem
 *                         tratamento é canal ainda não implementado, e
 *                         devolver erro faria o ERP reentregar para sempre.
 */
export async function handleErpEvent(
  connection: ErpConnection,
  event: ErpEventEnvelope,
  recordEvent: (
    tenantId: string,
    entityType: string,
    eventType: string,
    payload: unknown,
    actorUserId?: string | null,
    entityId?: string | null,
  ) => Promise<void>,
): Promise<HandleResult> {
  const tenantId = connection.tenant_id;
  const data = event.data ?? {};

  if (event.type === "customer.upserted") {
    const { contactId, created } = await reconcileCustomer(connection, event.aggregate.id, data);
    await recordEvent(tenantId, "contact", `erp.${created ? "contact_created" : "contact_linked"}`, {
      erp_customer_id: event.aggregate.id,
      event_id: event.id,
    }, null, contactId);
    return { action: created ? "contact_created" : "contact_updated", contactId };
  }

  if (event.type === "order.confirmed") {
    const erpCustomerId = typeof data.customerId === "string" ? data.customerId : null;
    let contactId: string | null = null;

    // Pedido sem cliente identificado é rotina de balcão. Registra-se assim
    // mesmo, sem contato — perder a venda do histórico seria pior.
    if (erpCustomerId) {
      contactId = (await reconcileCustomer(connection, erpCustomerId, data)).contactId;
    }

    const totalCents = Math.round(Number(data.totalAmount ?? 0) * 100);
    await linkExternal(tenantId, "order", event.aggregate.id, event.aggregate.id, {
      number: data.number ?? null,
      channel: data.channel ?? null,
    });

    let leadId: string | null = null;
    if (contactId && connection.settings.autoWinLeadOnOrder) {
      leadId = await winLeadForContact(tenantId, contactId, event.aggregate.id, totalCents);
    }

    await recordEvent(tenantId, "lead", "erp.order_confirmed", {
      erp_order_id: event.aggregate.id,
      number: data.number ?? null,
      channel: data.channel ?? null,
      total_cents: totalCents,
      lead_id: leadId,
      event_id: event.id,
    }, null, leadId ?? contactId);

    return { action: "order_recorded", contactId, leadId };
  }

  if (event.type.startsWith("payment.")) {
    const orderId = typeof data.orderId === "string" ? data.orderId : null;
    const contactId = orderId ? await internalIdOf(tenantId, "order", orderId) : null;

    await recordEvent(tenantId, "lead", `erp.${event.type.replace(".", "_")}`, {
      erp_order_id: orderId,
      erp_payment_id: event.aggregate.id,
      method: data.method ?? null,
      amount: data.amount ?? null,
      event_id: event.id,
    }, null, contactId);

    return { action: "payment_recorded" };
  }

  await recordEvent(tenantId, "integration", "erp.event_unhandled", {
    type: event.type,
    event_id: event.id,
  });
  return { action: "ignored" };
}

// ── Saída: chamadas ao ERP ──────────────────────────────────────────────────

export class ErpRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Chama a API do ERP com a chave de máquina.
 *
 * A chave vai em `X-Api-Key` e não em `Authorization: Bearer`: o ERP aceita as
 * duas formas, e usar a dedicada deixa claro em log e em captura de tráfego
 * que a credencial é de integração, não de usuário.
 */
export async function erpFetch<T>(
  connection: ErpConnection,
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  if (!connection.base_url || !connection.api_key) {
    throw new ErpRequestError("Conexao com o ERP nao configurada.", 409);
  }

  const response = await fetch(new URL(path, connection.base_url), {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      "x-api-key": connection.api_key,
      ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  const parsed = text.length > 0 ? (JSON.parse(text) as { success?: boolean; data?: T; message?: string }) : null;

  if (!response.ok) {
    throw new ErpRequestError(parsed?.message ?? `ERP respondeu ${response.status}`, response.status);
  }

  return (parsed?.data ?? parsed) as T;
}

/**
 * Promove um contato do CRM a cliente do ERP.
 *
 * Fecha o ciclo no sentido oposto ao do webhook: o lead nasce numa conversa de
 * WhatsApp, e quando vira venda é preciso existir um `Customer` lá para o
 * pedido apontar. O CPF/CNPJ é exigido porque sem ele o ERP não emite nota —
 * e um cliente que não pode ser faturado não é um cliente para o ERP.
 *
 * A `idempotencyKey` é derivada do id do contato: reenviar o mesmo contato não
 * cria o segundo cadastro.
 */
export async function pushContactToErp(
  connection: ErpConnection,
  contact: { id: string; name: string; email: string | null; phone: string | null; cpf_cnpj: string | null },
): Promise<{ erpCustomerId: string; alreadyLinked: boolean }> {
  const existing = await externalIdOf(connection.tenant_id, "customer", contact.id);
  if (existing) return { erpCustomerId: existing, alreadyLinked: true };

  if (!contact.cpf_cnpj) {
    throw new ErpRequestError("Contato precisa de CPF/CNPJ para virar cliente no ERP.", 400);
  }

  const created = await erpFetch<{ id: string }>(connection, "/api/v1/customers", {
    method: "POST",
    idempotencyKey: `crm-contact-${contact.id}`,
    body: {
      cpfCnpj: contact.cpf_cnpj,
      name: contact.name,
      email: contact.email ?? undefined,
      phone: contact.phone ?? undefined,
    },
  });

  await linkExternal(connection.tenant_id, "customer", contact.id, created.id, { source: "crm" });
  return { erpCustomerId: created.id, alreadyLinked: false };
}
