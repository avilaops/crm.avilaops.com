import { query } from "./db.js";
import {
  describeError,
  fetchMailBody,
  listMailbox,
  loadMailAccount,
  recordMailError,
  rememberSenders,
  type MailAccount,
} from "./mail.js";
import { normalizeEmail, renderCampaign, sendCampaign, signupUrl, unsubscribeUrl } from "./newsletter.js";
import { sendMail } from "./mail.js";

/**
 * Motor de automação do e-mail.
 *
 * Roda dentro do próprio servidor, num laço com relógio de um minuto. Três
 * tarefas: ler a caixa, tratar o que voltou e despachar campanha agendada.
 *
 * Duas travas existem de propósito:
 *
 * 1. `automation_settings.enabled` começa **desligado**. Quem liga é a tela.
 * 2. `AUTOMATION_DISABLED=true` no ambiente desliga tudo sem passar pelo banco
 *    — é o freio de mão para quando algo estiver saindo errado em produção.
 *
 * Campanha em rascunho nunca é despachada: só entra no motor a que uma pessoa
 * agendou ou mandou enviar. Automação não decide sozinha o que vai para a rua.
 */

const TICK_MS = 60_000;

export type Settings = {
  tenant_id: string;
  enabled: boolean;
  mailbox_sync_minutes: number;
  send_batch_size: number;
  send_interval_seconds: number;
  daily_cap: number;
};

type Dependencies = {
  decryptSecret: (value: string | null) => string | null;
  log?: (mensagem: string, detalhe?: unknown) => void;
};

export async function readSettings(tenantId: string): Promise<Settings> {
  const existente = await query<Settings>("select * from automation_settings where tenant_id = $1", [tenantId]);
  if (existente.rows[0]) return existente.rows[0];

  const criado = await query<Settings>(
    "insert into automation_settings (tenant_id) values ($1) on conflict (tenant_id) do nothing returning *",
    [tenantId],
  );
  return criado.rows[0] ?? (await query<Settings>("select * from automation_settings where tenant_id = $1", [tenantId])).rows[0];
}

export async function saveSettings(tenantId: string, patch: Partial<Omit<Settings, "tenant_id">>) {
  const atual = await readSettings(tenantId);
  const proximo = { ...atual, ...patch };
  await query(
    `update automation_settings
        set enabled = $2, mailbox_sync_minutes = $3, send_batch_size = $4,
            send_interval_seconds = $5, daily_cap = $6, updated_at = now()
      where tenant_id = $1`,
    [
      tenantId,
      proximo.enabled,
      proximo.mailbox_sync_minutes,
      proximo.send_batch_size,
      proximo.send_interval_seconds,
      proximo.daily_cap,
    ],
  );
  return readSettings(tenantId);
}

async function registrar(tenantId: string, job: string, status: "ok" | "error" | "skipped", detail: unknown) {
  await query(
    `insert into automation_runs (tenant_id, job, status, detail, finished_at)
     values ($1, $2, $3, $4::jsonb, now())`,
    [tenantId, job, status, JSON.stringify(detail ?? {})],
  );
}

async function rodouRecentemente(tenantId: string, job: string, minutos: number) {
  const resultado = await query<{ existe: boolean }>(
    `select exists (
       select 1 from automation_runs
        where tenant_id = $1 and job = $2 and status <> 'error'
          and started_at > now() - make_interval(mins => $3)
     ) as existe`,
    [tenantId, job, minutos],
  );
  return resultado.rows[0]?.existe ?? false;
}

/** Quanto já saiu hoje. O teto diário protege a reputação do domínio. */
export async function enviadosHoje(tenantId: string) {
  const resultado = await query<{ total: string }>(
    `select count(*)::text as total from newsletter_deliveries
      where tenant_id = $1 and status = 'sent' and sent_at >= date_trunc('day', now())`,
    [tenantId],
  );
  return Number(resultado.rows[0]?.total ?? 0);
}

const REMETENTES_DE_RETORNO = ["mailer-daemon", "postmaster", "mail-delivery", "no-reply@dmarc"];

/**
 * Extrai o endereço que falhou de uma mensagem de retorno.
 *
 * Prefere o cabeçalho `Final-Recipient` do relatório padrão (RFC 3464); quando
 * ele não vem, cai no primeiro endereço citado no corpo. Nunca devolve o
 * endereço da própria caixa: senão o primeiro retorno descadastraria a gente.
 */
export function extrairEnderecoDeRetorno(texto: string, proprios: string[]): string | null {
  const meus = new Set(proprios.map((endereco) => endereco.toLowerCase()));

  const finalRecipient = texto.match(/final-recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/i);
  const candidato = finalRecipient?.[1] ?? texto.match(/<([^\s<>]+@[^\s<>]+)>/)?.[1] ?? null;

  const email = normalizeEmail(candidato ?? "");
  if (!email || meus.has(email)) return null;
  return email;
}

/** Lê o topo da caixa e registra quem escreveu — insumo da tela de cadastro. */
async function sincronizarCaixa(tenantId: string, conta: MailAccount) {
  const caixa = await listMailbox(conta, { limit: 60 });
  await rememberSenders(tenantId, caixa.messages, [conta.user, conta.fromEmail]);
  await recordMailError(tenantId, "");
  return { total: caixa.total, lidas: caixa.messages.length };
}

/**
 * Trata o que voltou. Endereço que o servidor do destinatário recusou vira
 * `email-invalido` e sai da lista — sem isso, a mesma falha se repete em toda
 * campanha e a reputação cai junto.
 */
async function tratarRetornos(tenantId: string, conta: MailAccount) {
  const caixa = await listMailbox(conta, { limit: 60 });
  const retornos = caixa.messages.filter((mensagem) =>
    REMETENTES_DE_RETORNO.some((padrao) => mensagem.fromEmail.includes(padrao)),
  );

  let marcados = 0;
  for (const retorno of retornos) {
    let corpo: string;
    try {
      const conteudo = await fetchMailBody(conta, retorno.uid);
      corpo = `${conteudo.text}\n${conteudo.html ?? ""}`;
    } catch {
      continue;
    }

    const email = extrairEnderecoDeRetorno(corpo, [conta.user, conta.fromEmail]);
    if (!email) continue;

    const atualizado = await query(
      `update contacts
          set newsletter_status = 'unsubscribed',
              unsubscribed_at = coalesce(unsubscribed_at, now()),
              tags = (select array(select distinct unnest(tags || array['email-invalido']))),
              updated_at = now()
        where tenant_id = $1 and lower(email) = $2 and newsletter_status <> 'unsubscribed'`,
      [tenantId, email],
    );
    if (atualizado.rowCount) marcados += 1;
  }

  return { retornos: retornos.length, marcados };
}

/**
 * Despacha campanha agendada e continua a que está no meio do envio.
 *
 * O intervalo entre lotes e o teto diário são o que separa "enviar" de "ser
 * bloqueado": uma caixa hospedada não gosta de rajada, e domínio novo menos
 * ainda.
 */
async function despacharCampanhas(tenantId: string, conta: MailAccount, config: Settings) {
  const cap = config.daily_cap;
  const jaSaiu = await enviadosHoje(tenantId);
  if (cap > 0 && jaSaiu >= cap) return { pulado: "teto diário atingido", jaSaiu, cap };

  // Agendada cuja hora chegou entra na fila de envio.
  await query(
    `update newsletter_campaigns set status = 'sending', updated_at = now()
      where tenant_id = $1 and status = 'scheduled' and scheduled_at <= now()`,
    [tenantId],
  );

  const proxima = await query<{ id: string; name: string }>(
    `select id, name from newsletter_campaigns
      where tenant_id = $1 and status = 'sending'
        and (last_dispatch_at is null or last_dispatch_at <= now() - make_interval(secs => $2))
      order by coalesce(scheduled_at, created_at)
      limit 1`,
    [tenantId, config.send_interval_seconds],
  );

  const campanha = proxima.rows[0];
  if (!campanha) return { pulado: "nenhuma campanha pronta" };

  const espaco = cap > 0 ? Math.max(cap - jaSaiu, 0) : config.send_batch_size;
  const lote = Math.min(config.send_batch_size, espaco);
  if (lote === 0) return { pulado: "teto diário atingido", jaSaiu, cap };

  const resultado = await sendCampaign(tenantId, campanha.id, conta, { batchSize: lote });
  await query("update newsletter_campaigns set last_dispatch_at = now() where tenant_id = $1 and id = $2", [
    tenantId,
    campanha.id,
  ]);

  return { campanha: campanha.name, lote, ...resultado };
}

/**
 * Envia as confirmacoes de inscricao pendentes.
 *
 * E transacional, nao marketing: fica fora do teto diario de campanha, mas
 * respeita um limite proprio para o formulario publico nao virar canhao.
 */
async function enviarConfirmacoes(tenantId: string, conta: MailAccount) {
  const pendentes = await query<{ id: string; email: string; name: string | null }>(
    `select id, email, name from newsletter_signups
      where tenant_id = $1 and status = 'pending' and confirmation_sent_at is null and expires_at > now()
      order by created_at limit 20`,
    [tenantId],
  );

  let enviadas = 0;
  for (const pedido of pendentes.rows) {
    const link = signupUrl(pedido.email);
    const corpo = [
      `Ola${pedido.name ? `, ${pedido.name}` : ""}.`,
      "",
      "Recebemos um pedido de inscricao na newsletter da Avila Ops com este endereco.",
      "Para confirmar, e so abrir o link abaixo. Se nao foi voce, ignore este e-mail: sem o clique, nada acontece.",
      "",
      link,
    ].join("\n");

    const renderizado = renderCampaign(
      {
        subject: "Confirme sua inscricao - Avila Ops",
        preview_text: "Um clique e voce passa a receber.",
        format: "text",
        html: null,
        body_text: corpo,
        image_url: null,
        image_alt: null,
        image_link_url: null,
      },
      unsubscribeUrl(pedido.email),
    );

    try {
      await sendMail(conta, {
        to: pedido.email,
        subject: "Confirme sua inscricao - Avila Ops",
        html: renderizado.html,
        text: renderizado.text,
      });
      await query("update newsletter_signups set confirmation_sent_at = now() where id = $1", [pedido.id]);
      enviadas += 1;
    } catch {
      // Deixa pendente: o proximo ciclo tenta de novo.
    }
  }

  // Pedido que ninguem confirmou nao fica pendente para sempre.
  const expirados = await query(
    "update newsletter_signups set status = 'expired' where tenant_id = $1 and status = 'pending' and expires_at <= now()",
    [tenantId],
  );

  return { pendentes: pendentes.rowCount ?? 0, enviadas, expirados: expirados.rowCount ?? 0 };
}

async function processarTenant(tenantId: string, deps: Dependencies) {
  const config = await readSettings(tenantId);
  if (!config.enabled) return;

  const conta = await loadMailAccount(tenantId, deps.decryptSecret);
  if (!conta) {
    await registrar(tenantId, "mailbox_sync", "skipped", { motivo: "conta de e-mail não cadastrada" });
    return;
  }

  if (!(await rodouRecentemente(tenantId, "mailbox_sync", config.mailbox_sync_minutes))) {
    try {
      await registrar(tenantId, "mailbox_sync", "ok", await sincronizarCaixa(tenantId, conta));
    } catch (erro) {
      await registrar(tenantId, "mailbox_sync", "error", { erro: describeError(erro) });
    }

    try {
      await registrar(tenantId, "bounce_scan", "ok", await tratarRetornos(tenantId, conta));
    } catch (erro) {
      await registrar(tenantId, "bounce_scan", "error", { erro: describeError(erro) });
    }
  }

  try {
    const confirmacoes = await enviarConfirmacoes(tenantId, conta);
    if (confirmacoes.pendentes > 0 || confirmacoes.expirados > 0) {
      await registrar(tenantId, "signup_confirmations", "ok", confirmacoes);
    }
  } catch (erro) {
    await registrar(tenantId, "signup_confirmations", "error", { erro: describeError(erro) });
  }

  try {
    const resultado = await despacharCampanhas(tenantId, conta, config);
    await registrar(tenantId, "campaign_send", "pulado" in resultado ? "skipped" : "ok", resultado);
  } catch (erro) {
    await registrar(tenantId, "campaign_send", "error", { erro: describeError(erro) });
  }
}

export function startAutomation(deps: Dependencies) {
  if (process.env.AUTOMATION_DISABLED === "true") {
    deps.log?.("automação desligada por AUTOMATION_DISABLED");
    return () => undefined;
  }

  let rodando = false;

  const tick = async () => {
    if (rodando) return; // um ciclo lento não pode empilhar outro por cima
    rodando = true;
    try {
      const tenants = await query<{ tenant_id: string }>("select tenant_id from automation_settings where enabled = true");
      for (const linha of tenants.rows) {
        await processarTenant(linha.tenant_id, deps).catch((erro) => deps.log?.("falha no tenant", describeError(erro)));
      }
    } catch (erro) {
      deps.log?.("falha no ciclo de automação", describeError(erro));
    } finally {
      rodando = false;
    }
  };

  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref?.();
  deps.log?.(`automação ativa: ciclo a cada ${TICK_MS / 1000}s`);
  return () => clearInterval(timer);
}
