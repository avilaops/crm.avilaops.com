import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { extname, join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { query } from "./db.js";
import { enviadosHoje, readSettings, saveSettings } from "./automation.js";
import {
  checkMailAccount,
  describeError,
  fetchMailBody,
  listMailbox,
  loadMailAccount,
  readMailAccountView,
  recordMailError,
  rememberSenders,
  saveMailAccount,
  sendMail,
} from "./mail.js";
import {
  assertSendable,
  audience,
  confirmSignup,
  normalizeEmail,
  parseContactList,
  renderCampaign,
  sendCampaign,
  unsubscribeUrl,
  unsubscribeEmail,
  verifySignupToken,
  verifyUnsubscribeToken,
  type CampaignRow,
} from "./newsletter.js";

type AuthUser = { id: string; tenant_id: string; name: string; email: string; role: string };

type Dependencies = {
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>;
  encryptSecret: (value: string | null) => string | null;
  decryptSecret: (value: string | null) => string | null;
  recordEvent: (
    tenantId: string,
    entityType: string,
    eventType: string,
    payload: Record<string, unknown>,
    actorUserId?: string | null,
    entityId?: string | null,
    requestId?: string | null,
  ) => Promise<void>;
};

const IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function storageRoot() {
  return process.env.NEWSLETTER_STORAGE_PATH?.trim() || join(process.cwd(), "storage", "newsletter");
}

const accountSchema = z.object({
  imapHost: z.string().trim().min(3).max(200),
  imapPort: z.coerce.number().int().min(1).max(65535),
  smtpHost: z.string().trim().min(3).max(200),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  user: z.string().trim().email(),
  password: z.string().max(400).optional(),
  fromName: z.string().trim().max(120).default("Ávila Ops"),
  fromEmail: z.string().trim().email(),
});

const campaignSchema = z.object({
  name: z.string().trim().max(160).default(""),
  subject: z.string().trim().min(1).max(200),
  previewText: z.string().trim().max(300).default(""),
  format: z.enum(["html", "text", "image"]).default("html"),
  html: z.string().max(400_000).default(""),
  text: z.string().max(100_000).default(""),
  imageUrl: z.string().trim().max(500).default(""),
  imageAlt: z.string().trim().max(300).default(""),
  imageLinkUrl: z.string().trim().max(500).default(""),
  audienceTags: z.array(z.string().trim().toLowerCase().max(40)).max(10).default([]),
});

function campaignValues(input: z.infer<typeof campaignSchema>) {
  return [
    input.name || input.subject,
    input.subject,
    input.previewText || null,
    input.format,
    input.html || null,
    input.text || null,
    input.imageUrl || null,
    input.imageAlt || null,
    input.imageLinkUrl || null,
    input.audienceTags,
  ];
}

function toRenderable(input: z.infer<typeof campaignSchema>): CampaignRow {
  return {
    id: "",
    tenant_id: "",
    name: input.name,
    subject: input.subject,
    preview_text: input.previewText || null,
    format: input.format,
    html: input.html || null,
    body_text: input.text || null,
    image_url: input.imageUrl || null,
    image_alt: input.imageAlt || null,
    image_link_url: input.imageLinkUrl || null,
    audience_tags: input.audienceTags,
    status: "draft",
    recipient_count: 0,
    sent_count: 0,
    failed_count: 0,
    sent_at: null,
    created_at: "",
  };
}

function unsubscribePage(title: string, body: string, form = "") {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} — Ávila Ops</title><style>body{margin:0;background:#f3f3f3;font-family:system-ui,Arial,sans-serif;color:#1e293b}main{max-width:460px;margin:14vh auto 0;background:#fff;padding:40px;border-radius:12px;box-shadow:0 10px 40px rgba(15,23,42,.08)}h1{font-size:22px;margin:0 0 14px}p{color:#475569;line-height:1.6;margin:0 0 10px}button{margin-top:18px;padding:12px 22px;border:0;border-radius:8px;background:#dc2626;color:#fff;font-size:15px;cursor:pointer}small{display:block;margin-top:26px;color:#94a3b8}</style></head><body><main><h1>${title}</h1>${body}${form}<small>Ávila Ops · crm.avilaops.com</small></main></body></html>`;
}

export function registerMailRoutes(app: FastifyInstance, deps: Dependencies) {
  const { requireAuth, encryptSecret, decryptSecret, recordEvent } = deps;

  // ── Conta de e-mail ──────────────────────────────────────────────────────

  app.get("/api/mail/account", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    return { account: await readMailAccountView(user.tenant_id) };
  });

  app.post("/api/mail/account", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const input = accountSchema.parse(request.body);
    await saveMailAccount(user.tenant_id, input, encryptSecret);
    await recordEvent(user.tenant_id, "integration", "mail.account_saved", { user: input.user }, user.id, null, null);

    const account = await loadMailAccount(user.tenant_id, decryptSecret);
    const check = account ? await checkMailAccount(account) : null;
    await recordMailError(user.tenant_id, check && !check.imap.ok ? check.imap.detail : "");
    return { account: await readMailAccountView(user.tenant_id), check };
  });

  app.post("/api/mail/test", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const account = await loadMailAccount(user.tenant_id, decryptSecret);
    if (!account) return reply.code(409).send({ error: "Cadastre a conta de e-mail primeiro." });

    const check = await checkMailAccount(account);
    await recordMailError(user.tenant_id, check.imap.ok ? "" : check.imap.detail);
    return { check };
  });

  // ── Caixa de entrada ─────────────────────────────────────────────────────

  app.get("/api/mail/messages", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filters = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(40),
        offset: z.coerce.number().int().min(0).default(0),
        mailbox: z.string().trim().max(80).default("INBOX"),
      })
      .parse(request.query);

    const account = await loadMailAccount(user.tenant_id, decryptSecret);
    if (!account) return reply.code(409).send({ error: "Cadastre a conta de e-mail em Configurações de email." });

    try {
      const result = await listMailbox(account, filters);
      await rememberSenders(user.tenant_id, result.messages, [account.user, account.fromEmail]);
      await recordMailError(user.tenant_id, "");
      return result;
    } catch (error) {
      const detail = describeError(error);
      await recordMailError(user.tenant_id, detail);
      return reply.code(502).send({ error: `Não foi possível ler a caixa: ${detail}` });
    }
  });

  app.get("/api/mail/messages/:uid", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { uid } = z.object({ uid: z.coerce.number().int().positive() }).parse(request.params);
    const { mailbox } = z.object({ mailbox: z.string().trim().max(80).default("INBOX") }).parse(request.query);

    const account = await loadMailAccount(user.tenant_id, decryptSecret);
    if (!account) return reply.code(409).send({ error: "Cadastre a conta de e-mail em Configurações de email." });

    try {
      return await fetchMailBody(account, uid, mailbox);
    } catch (error) {
      return reply.code(502).send({ error: `Não foi possível abrir a mensagem: ${describeError(error)}` });
    }
  });

  /** Remetentes vistos na caixa, com o que falta virar contato aparecendo primeiro. */
  app.get("/api/mail/senders", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filters = z
      .object({ status: z.enum(["new", "registered", "ignored", "todos"]).default("new"), limit: z.coerce.number().int().min(1).max(200).default(100) })
      .parse(request.query);

    const params: unknown[] = [user.tenant_id];
    let statusFilter = "";
    if (filters.status !== "todos") {
      params.push(filters.status);
      statusFilter = `and status = $${params.length}`;
    }
    params.push(filters.limit);

    const result = await query(
      `select id, email, name, message_count, last_subject, last_seen_at, status, contact_id
         from mail_senders
        where tenant_id = $1 ${statusFilter}
        order by last_seen_at desc
        limit $${params.length}`,
      params,
    );
    return { senders: result.rows };
  });

  /** Vira contato do CRM. É o "cadastrar corretamente": nome, empresa e etiquetas são revisados na tela. */
  app.post("/api/mail/senders/:id/contact", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        name: z.string().trim().min(1).max(160),
        company: z.string().trim().max(160).default(""),
        phone: z.string().trim().max(40).default(""),
        tags: z.array(z.string().trim().toLowerCase().max(40)).max(10).default([]),
      })
      .parse(request.body);

    const sender = await query<{ email: string }>("select email from mail_senders where tenant_id = $1 and id = $2", [user.tenant_id, id]);
    const email = sender.rows[0]?.email;
    if (!email) return reply.code(404).send({ error: "Remetente não encontrado." });

    const existing = await query<{ id: string }>("select id from contacts where tenant_id = $1 and lower(email) = $2 limit 1", [
      user.tenant_id,
      email,
    ]);

    let contactId = existing.rows[0]?.id;
    if (contactId) {
      await query(
        `update contacts
            set name = $3, company = nullif($4, ''), phone = coalesce(nullif($5, ''), phone),
                tags = (select array(select distinct unnest(tags || $6::text[]))), updated_at = now()
          where tenant_id = $1 and id = $2`,
        [user.tenant_id, contactId, input.name, input.company, input.phone, input.tags],
      );
    } else {
      const created = await query<{ id: string }>(
        `insert into contacts (tenant_id, name, email, phone, company, source, tags)
         values ($1, $2, $3, nullif($4, ''), nullif($5, ''), 'email', $6)
         returning id`,
        [user.tenant_id, input.name, email, input.phone, input.company, input.tags],
      );
      contactId = created.rows[0].id;
    }

    await query("update mail_senders set status = 'registered', contact_id = $3 where tenant_id = $1 and id = $2", [
      user.tenant_id,
      id,
      contactId,
    ]);
    await recordEvent(user.tenant_id, "contact", "mail.sender_registered", { email }, user.id, contactId, null);

    return { ok: true, contactId };
  });

  app.post("/api/mail/senders/:id/ignore", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await query("update mail_senders set status = 'ignored' where tenant_id = $1 and id = $2", [user.tenant_id, id]);
    return { ok: true };
  });

  // ── Newsletter ───────────────────────────────────────────────────────────

  app.get("/api/newsletter/overview", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const [metrics, tags, campaigns, contacts] = await Promise.all([
      query<{ subscribed: string; unsubscribed: string; total: string }>(
        `select
           count(*) filter (where newsletter_status = 'subscribed' and email is not null and email <> '')::text as subscribed,
           count(*) filter (where newsletter_status = 'unsubscribed')::text as unsubscribed,
           count(*) filter (where email is not null and email <> '')::text as total
         from contacts where tenant_id = $1`,
        [user.tenant_id],
      ),
      query<{ tag: string; count: string }>(
        `select tag, count(*)::text as count
           from contacts, unnest(tags) as tag
          where tenant_id = $1 and newsletter_status = 'subscribed'
          group by tag order by count(*) desc limit 30`,
        [user.tenant_id],
      ),
      query(
        `select id, name, subject, format, status, recipient_count, sent_count, failed_count, audience_tags, created_at, sent_at
           from newsletter_campaigns where tenant_id = $1 order by created_at desc limit 25`,
        [user.tenant_id],
      ),
      query(
        `select id, name, email, company, source, tags, newsletter_status, created_at
           from contacts
          where tenant_id = $1 and email is not null and email <> ''
          order by updated_at desc limit 25`,
        [user.tenant_id],
      ),
    ]);

    return {
      metrics: {
        subscribed: Number(metrics.rows[0]?.subscribed ?? 0),
        unsubscribed: Number(metrics.rows[0]?.unsubscribed ?? 0),
        total: Number(metrics.rows[0]?.total ?? 0),
      },
      tags: tags.rows.map((row) => ({ tag: row.tag, count: Number(row.count) })),
      campaigns: campaigns.rows,
      contacts: contacts.rows,
    };
  });

  /**
   * Busca na base. Um texto só cobre nome, e-mail, empresa e etiqueta porque
   * é assim que se procura de verdade: ora pelo nome da empresa, ora pelo
   * setor, ora por um pedaço do endereço.
   */
  app.get("/api/newsletter/contacts", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filtros = z
      .object({
        search: z.string().trim().max(120).default(""),
        tag: z.string().trim().toLowerCase().max(40).default(""),
        status: z.enum(["subscribed", "unsubscribed", "todos"]).default("todos"),
        withEmail: z.enum(["sim", "nao", "todos"]).default("sim"),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(request.query);

    const params: unknown[] = [user.tenant_id];
    const where = ["tenant_id = $1"];

    if (filtros.withEmail === "sim") where.push("email is not null and email <> ''");
    if (filtros.withEmail === "nao") where.push("(email is null or email = '')");
    if (filtros.status !== "todos") {
      params.push(filtros.status);
      where.push(`newsletter_status = $${params.length}`);
    }
    if (filtros.tag) {
      params.push([filtros.tag]);
      where.push(`tags && $${params.length}::text[]`);
    }
    if (filtros.search) {
      params.push(`%${filtros.search}%`);
      const alvo = `$${params.length}`;
      where.push(
        `(name ilike ${alvo} or email ilike ${alvo} or company ilike ${alvo} or phone ilike ${alvo}
          or exists (select 1 from unnest(tags) as t where t ilike ${alvo}))`,
      );
    }

    const filtro = where.join(" and ");
    const contagem = await query<{ total: string }>(`select count(*)::text as total from contacts where ${filtro}`, params);

    params.push(filtros.pageSize, (filtros.page - 1) * filtros.pageSize);
    const resultado = await query(
      `select id, name, email, phone, company, source, tags, newsletter_status, created_at
         from contacts
        where ${filtro}
        order by updated_at desc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );

    return {
      contacts: resultado.rows,
      pagination: { page: filtros.page, pageSize: filtros.pageSize, total: Number(contagem.rows[0]?.total ?? 0) },
    };
  });

  app.post("/api/newsletter/contacts/import", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const input = z
      .object({
        raw: z.string().max(200_000).default(""),
        tags: z.array(z.string().trim().toLowerCase().max(40)).max(10).default([]),
      })
      .parse(request.body);

    const entries = parseContactList(input.raw);
    if (entries.length === 0) return reply.code(400).send({ error: "Nenhum e-mail válido na lista." });

    let created = 0;
    let updated = 0;

    for (const entry of entries) {
      const existing = await query<{ id: string }>("select id from contacts where tenant_id = $1 and lower(email) = $2 limit 1", [
        user.tenant_id,
        entry.email,
      ]);

      if (existing.rows[0]) {
        // Reimportar não ressuscita quem saiu: só completa nome e etiquetas.
        await query(
          `update contacts
              set name = case when name = '' or name is null then $3 else name end,
                  tags = (select array(select distinct unnest(tags || $4::text[]))),
                  updated_at = now()
            where tenant_id = $1 and id = $2`,
          [user.tenant_id, existing.rows[0].id, entry.name ?? entry.email, input.tags],
        );
        updated += 1;
        continue;
      }

      await query(
        `insert into contacts (tenant_id, name, email, source, tags)
         values ($1, $2, $3, 'newsletter', $4)`,
        [user.tenant_id, entry.name ?? entry.email, entry.email, input.tags],
      );
      created += 1;
    }

    await recordEvent(user.tenant_id, "contact", "newsletter.contacts_imported", { created, updated }, user.id, null, null);
    return { summary: { created, updated, total: entries.length } };
  });

  /** Cadastro manual de um contato - o caminho de quem tem o endereco na mao. */
  app.post("/api/newsletter/contacts", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const input = z
      .object({
        name: z.string().trim().min(1).max(160),
        email: z.string().trim().max(254).default(""),
        phone: z.string().trim().max(40).default(""),
        company: z.string().trim().max(160).default(""),
        tags: z.array(z.string().trim().toLowerCase().max(40)).max(10).default([]),
      })
      .parse(request.body);

    const email = input.email ? normalizeEmail(input.email) : null;
    if (input.email && !email) return reply.code(400).send({ error: "E-mail invalido." });
    if (!email && !input.phone) return reply.code(400).send({ error: "Informe ao menos e-mail ou telefone." });

    if (email) {
      const existente = await query<{ id: string }>(
        "select id from contacts where tenant_id = $1 and lower(email) = $2 limit 1",
        [user.tenant_id, email],
      );
      if (existente.rows[0]) return reply.code(409).send({ error: "Ja existe contato com esse e-mail." });
    }

    const criado = await query(
      `insert into contacts (tenant_id, name, email, phone, company, source, tags)
       values ($1, $2, $3, nullif($4, ''), nullif($5, ''), 'manual', $6)
       returning id, name, email, phone, company, source, tags, newsletter_status, created_at`,
      [user.tenant_id, input.name, email, input.phone, input.company, input.tags],
    );
    await recordEvent(user.tenant_id, "contact", "newsletter.contact_created", { email }, user.id, criado.rows[0].id, null);
    return reply.code(201).send({ contact: criado.rows[0] });
  });

  /**
   * Acao em lote. Com milhares de contatos, corrigir etiqueta um a um nao e
   * trabalho - e desistencia. `action` decide se a etiqueta entra, sai, ou se
   * a situacao muda.
   */
  app.post("/api/newsletter/contacts/bulk", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const input = z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        action: z.enum(["tag", "untag", "subscribe", "unsubscribe"]),
        tag: z.string().trim().toLowerCase().max(40).default(""),
      })
      .parse(request.body);

    if ((input.action === "tag" || input.action === "untag") && !input.tag) {
      return reply.code(400).send({ error: "Informe a etiqueta." });
    }

    let sql: string;
    const params: unknown[] = [user.tenant_id, input.ids];

    if (input.action === "tag") {
      params.push([input.tag]);
      sql = `update contacts set tags = (select array(select distinct unnest(tags || $3::text[]))), updated_at = now()
              where tenant_id = $1 and id = any($2::uuid[])`;
    } else if (input.action === "untag") {
      params.push(input.tag);
      sql = `update contacts set tags = array_remove(tags, $3::text), updated_at = now()
              where tenant_id = $1 and id = any($2::uuid[])`;
    } else {
      const assinado = input.action === "subscribe";
      params.push(assinado ? "subscribed" : "unsubscribed");
      sql = `update contacts set newsletter_status = $3,
                    unsubscribed_at = ${assinado ? "null" : "now()"}, updated_at = now()
              where tenant_id = $1 and id = any($2::uuid[])`;
    }

    const resultado = await query(sql, params);
    await recordEvent(
      user.tenant_id,
      "contact",
      "newsletter.contacts_bulk",
      { action: input.action, tag: input.tag, total: resultado.rowCount },
      user.id,
      null,
      null,
    );
    return { updated: resultado.rowCount ?? 0 };
  });

  app.patch("/api/newsletter/contacts/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        name: z.string().trim().min(1).max(160).optional(),
        company: z.string().trim().max(160).optional(),
        phone: z.string().trim().max(40).optional(),
        newsletterStatus: z.enum(["subscribed", "unsubscribed"]).optional(),
        tags: z.array(z.string().trim().toLowerCase().max(40)).max(10).optional(),
      })
      .parse(request.body);

    const result = await query(
      `update contacts
          set name = coalesce($3, name),
              company = case when $4::text is null then company else nullif($4, '') end,
              phone = case when $5::text is null then phone else nullif($5, '') end,
              newsletter_status = coalesce($6, newsletter_status),
              unsubscribed_at = case when $6 = 'unsubscribed' then now() when $6 = 'subscribed' then null else unsubscribed_at end,
              tags = coalesce($7::text[], tags),
              updated_at = now()
        where tenant_id = $1 and id = $2
        returning id, name, email, phone, company, source, tags, newsletter_status, created_at`,
      [
        user.tenant_id,
        id,
        input.name ?? null,
        input.company ?? null,
        input.phone ?? null,
        input.newsletterStatus ?? null,
        input.tags ?? null,
      ],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Contato não encontrado." });
    return { contact: result.rows[0] };
  });

  app.post("/api/newsletter/preview", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const input = campaignSchema.parse(request.body);
    const rendered = renderCampaign(toRenderable(input), `${process.env.NEWSLETTER_PUBLIC_BASE_URL ?? "https://crm.avilaops.com"}/nl/descadastro?token=exemplo`);
    const recipients = await audience(user.tenant_id, input.audienceTags);
    return { html: rendered.html, text: rendered.text, recipients: recipients.length };
  });

  /** Abre a campanha para edicao - sem isso, rascunho salvo vira beco sem saida. */
  app.get("/api/newsletter/campaigns/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const resultado = await query<CampaignRow>("select * from newsletter_campaigns where tenant_id = $1 and id = $2", [
      user.tenant_id,
      id,
    ]);
    if (!resultado.rows[0]) return reply.code(404).send({ error: "Campanha nao encontrada." });
    return { campaign: resultado.rows[0] };
  });

  /** Quem recebeu, quem falhou e por que. E a prestacao de contas do envio. */
  app.get("/api/newsletter/campaigns/:id/deliveries", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const filtros = z
      .object({
        status: z.enum(["pending", "sent", "failed", "skipped", "todos"]).default("todos"),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(request.query);

    const params: unknown[] = [user.tenant_id, id];
    let filtroStatus = "";
    if (filtros.status !== "todos") {
      params.push(filtros.status);
      filtroStatus = `and d.status = $${params.length}`;
    }
    params.push(filtros.limit);

    const [linhas, resumo] = await Promise.all([
      query(
        `select d.id, d.email, d.status, d.error, d.sent_at, c.name as contact_name, c.company
           from newsletter_deliveries d
           left join contacts c on c.id = d.contact_id
          where d.tenant_id = $1 and d.campaign_id = $2 ${filtroStatus}
          order by d.status, d.email
          limit $${params.length}`,
        params,
      ),
      query<{ status: string; total: string }>(
        `select status, count(*)::text as total from newsletter_deliveries
          where tenant_id = $1 and campaign_id = $2 group by status`,
        [user.tenant_id, id],
      ),
    ]);

    return {
      deliveries: linhas.rows,
      summary: Object.fromEntries(resumo.rows.map((linha) => [linha.status, Number(linha.total)])),
    };
  });

  app.post("/api/newsletter/campaigns", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const input = campaignSchema.parse(request.body);

    const result = await query<CampaignRow>(
      `insert into newsletter_campaigns
         (tenant_id, name, subject, preview_text, format, html, body_text, image_url, image_alt, image_link_url, audience_tags, created_by_user_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning *`,
      [user.tenant_id, ...campaignValues(input), user.id],
    );
    return { campaign: result.rows[0] };
  });

  app.put("/api/newsletter/campaigns/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = campaignSchema.parse(request.body);

    const current = await query<{ status: string }>("select status from newsletter_campaigns where tenant_id = $1 and id = $2", [
      user.tenant_id,
      id,
    ]);
    if (!current.rows[0]) return reply.code(404).send({ error: "Campanha não encontrada." });
    // Campanha enviada é registro do que saiu: editar apagaria a prova.
    if (current.rows[0].status !== "draft" && current.rows[0].status !== "failed") {
      return reply.code(409).send({ error: "Campanha em envio ou enviada não pode ser editada." });
    }

    const result = await query<CampaignRow>(
      `update newsletter_campaigns
          set name = $3, subject = $4, preview_text = $5, format = $6, html = $7, body_text = $8,
              image_url = $9, image_alt = $10, image_link_url = $11, audience_tags = $12, updated_at = now()
        where tenant_id = $1 and id = $2
        returning *`,
      [user.tenant_id, id, ...campaignValues(input)],
    );
    return { campaign: result.rows[0] };
  });

  app.delete("/api/newsletter/campaigns/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query("delete from newsletter_campaigns where tenant_id = $1 and id = $2 and status in ('draft', 'failed')", [
      user.tenant_id,
      id,
    ]);
    if (!result.rowCount) return reply.code(409).send({ error: "Só rascunho pode ser apagado." });
    return { ok: true };
  });

  app.post("/api/newsletter/campaigns/:id/test", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ to: z.string().trim().email().optional() }).parse(request.body ?? {});
    const to = normalizeEmail(input.to ?? user.email);
    if (!to) return reply.code(400).send({ error: "Informe um e-mail válido para o teste." });

    const account = await loadMailAccount(user.tenant_id, decryptSecret);
    if (!account) return reply.code(409).send({ error: "Cadastre a conta de e-mail em Configurações de email." });

    const campaign = await query<CampaignRow>("select * from newsletter_campaigns where tenant_id = $1 and id = $2", [user.tenant_id, id]);
    if (!campaign.rows[0]) return reply.code(404).send({ error: "Campanha não encontrada." });

    try {
      assertSendable(campaign.rows[0]);
      const rendered = renderCampaign(campaign.rows[0], unsubscribeUrl(to));
      await sendMail(account, { to, subject: `[teste] ${campaign.rows[0].subject}`, html: rendered.html, text: rendered.text });
      return { ok: true, to };
    } catch (error) {
      return reply.code(400).send({ error: describeError(error) });
    }
  });

  app.post("/api/newsletter/campaigns/:id/send", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const account = await loadMailAccount(user.tenant_id, decryptSecret);
    if (!account) return reply.code(409).send({ error: "Cadastre a conta de e-mail em Configurações de email." });

    try {
      const result = await sendCampaign(user.tenant_id, id, account);
      await recordEvent(user.tenant_id, "newsletter", "newsletter.campaign_sent", { ...result }, user.id, id, null);
      return { result };
    } catch (error) {
      return reply.code(400).send({ error: describeError(error) });
    }
  });

  /**
   * Upload da imagem da campanha em base64. Evita uma dependência de multipart
   * só para isso; o limite de corpo desta rota é local, não global.
   */
  app.post("/api/newsletter/images", { bodyLimit: 12 * 1024 * 1024 }, async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const input = z
      .object({ contentType: z.string().trim().max(80), dataBase64: z.string().min(16).max(11_000_000) })
      .parse(request.body);

    const extension = IMAGE_TYPES[input.contentType];
    if (!extension) return reply.code(400).send({ error: "Use PNG, JPG, WEBP ou GIF." });

    const bytes = Buffer.from(input.dataBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) {
      return reply.code(400).send({ error: "A imagem deve ter até 8 MB." });
    }

    const fileName = `${randomBytes(16).toString("hex")}${extension}`;
    await mkdir(storageRoot(), { recursive: true });
    await writeFile(join(storageRoot(), fileName), bytes);

    const base = process.env.NEWSLETTER_PUBLIC_BASE_URL?.trim() || process.env.PUBLIC_BASE_URL?.trim() || "https://crm.avilaops.com";
    return { url: `${base.replace(/\/+$/, "")}/nl/img/${fileName}`, fileName };
  });

  // ── Automação ────────────────────────────────────────────────────────────

  app.get("/api/automation/settings", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const [config, hoje] = await Promise.all([readSettings(user.tenant_id), enviadosHoje(user.tenant_id)]);
    return { settings: config, sentToday: hoje, hardDisabled: process.env.AUTOMATION_DISABLED === "true" };
  });

  app.put("/api/automation/settings", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const input = z
      .object({
        enabled: z.boolean().optional(),
        mailboxSyncMinutes: z.coerce.number().int().min(1).max(1440).optional(),
        sendBatchSize: z.coerce.number().int().min(1).max(200).optional(),
        sendIntervalSeconds: z.coerce.number().int().min(0).max(3600).optional(),
        dailyCap: z.coerce.number().int().min(0).max(5000).optional(),
      })
      .parse(request.body);

    const config = await saveSettings(user.tenant_id, {
      enabled: input.enabled,
      mailbox_sync_minutes: input.mailboxSyncMinutes,
      send_batch_size: input.sendBatchSize,
      send_interval_seconds: input.sendIntervalSeconds,
      daily_cap: input.dailyCap,
    });
    await recordEvent(user.tenant_id, "automation", "automation.settings_saved", { ...input }, user.id, null, null);
    return { settings: config };
  });

  /** Diario de bordo: o que o motor fez, inclusive quando nao fez nada. */
  app.get("/api/automation/runs", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(40) }).parse(request.query);
    const resultado = await query(
      `select id, job, status, detail, started_at, finished_at
         from automation_runs where tenant_id = $1 order by started_at desc limit $2`,
      [user.tenant_id, limit],
    );
    return { runs: resultado.rows };
  });

  /**
   * Agenda a campanha (ou solta para o motor mandar ja, quando `when` vem
   * vazio). Rascunho so vira envio por aqui: o motor nunca decide sozinho.
   */
  app.post("/api/newsletter/campaigns/:id/schedule", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({ when: z.string().datetime().optional() }).parse(request.body ?? {});

    const atual = await query<CampaignRow>("select * from newsletter_campaigns where tenant_id = $1 and id = $2", [
      user.tenant_id,
      id,
    ]);
    const campanha = atual.rows[0];
    if (!campanha) return reply.code(404).send({ error: "Campanha nao encontrada." });
    if (campanha.status === "sent") return reply.code(409).send({ error: "Campanha ja enviada." });

    try {
      assertSendable(campanha);
    } catch (erro) {
      return reply.code(400).send({ error: describeError(erro) });
    }

    const destinatarios = await audience(user.tenant_id, campanha.audience_tags);
    if (destinatarios.length === 0) return reply.code(409).send({ error: "Nenhum contato inscrito para este publico." });

    const quando = input.when ?? null;
    const resultado = await query<CampaignRow>(
      `update newsletter_campaigns
          set status = $3, scheduled_at = $4, recipient_count = $5, updated_at = now()
        where tenant_id = $1 and id = $2
        returning *`,
      [user.tenant_id, id, quando ? "scheduled" : "sending", quando, destinatarios.length],
    );
    await recordEvent(user.tenant_id, "newsletter", "newsletter.campaign_scheduled", { when: quando }, user.id, id, null);
    return { campaign: resultado.rows[0], recipients: destinatarios.length };
  });

  /** Pausa o envio em andamento sem perder o que ja saiu. */
  app.post("/api/newsletter/campaigns/:id/pause", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const resultado = await query(
      `update newsletter_campaigns set status = 'paused', updated_at = now()
        where tenant_id = $1 and id = $2 and status in ('scheduled', 'sending')`,
      [user.tenant_id, id],
    );
    if (!resultado.rowCount) return reply.code(409).send({ error: "So campanha agendada ou em envio pode ser pausada." });
    await recordEvent(user.tenant_id, "newsletter", "newsletter.campaign_paused", {}, user.id, id, null);
    return { ok: true };
  });

  /** Pedidos de inscricao vindos do site, para a tela acompanhar. */
  app.get("/api/newsletter/signups", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filtros = z
      .object({ status: z.enum(["pending", "confirmed", "expired", "todos"]).default("todos") })
      .parse(request.query);

    const params: unknown[] = [user.tenant_id];
    let filtro = "";
    if (filtros.status !== "todos") {
      params.push(filtros.status);
      filtro = `and status = $${params.length}`;
    }

    const [linhas, resumo] = await Promise.all([
      query(
        `select id, email, name, source, tags, status, confirmation_sent_at, confirmed_at, expires_at, created_at
           from newsletter_signups where tenant_id = $1 ${filtro}
          order by created_at desc limit 100`,
        params,
      ),
      query<{ status: string; total: string }>(
        "select status, count(*)::text as total from newsletter_signups where tenant_id = $1 group by status",
        [user.tenant_id],
      ),
    ]);

    return {
      signups: linhas.rows,
      summary: Object.fromEntries(resumo.rows.map((linha) => [linha.status, Number(linha.total)])),
    };
  });

  // ── Rotas públicas (sem sessão) ──────────────────────────────────────────

  /**
   * Formulario de inscricao do site. Publico e sem sessao, entao:
   *
   * - responde CORS para o navegador do visitante poder postar de outro dominio;
   * - nunca envia e-mail aqui: quem manda a confirmacao e o motor, no proximo
   *   ciclo. Endpoint publico que dispara e-mail na hora vira canhao de spam
   *   nas maos de qualquer um com um laco de repeticao;
   * - responde igual para endereco novo e repetido, para nao virar consulta de
   *   "fulano esta na lista de voces?".
   */
  app.options("/nl/inscrever", async (_request, reply) => {
    return reply
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Headers", "content-type")
      .header("Access-Control-Allow-Methods", "POST, OPTIONS")
      .code(204)
      .send();
  });

  app.post("/nl/inscrever", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    const corpo = (request.body ?? {}) as Record<string, unknown>;
    const email = normalizeEmail(corpo.email);
    const nome = typeof corpo.name === "string" ? corpo.name.trim().slice(0, 160) : "";
    const origem = typeof corpo.source === "string" ? corpo.source.trim().slice(0, 40) : "site";

    if (!email) return reply.code(400).send({ error: "Informe um e-mail valido." });

    const tenant = await query<{ id: string }>("select id from tenants where slug = $1", [
      process.env.DEFAULT_TENANT_SLUG ?? "avila-ops",
    ]);
    if (!tenant.rows[0]) return reply.code(503).send({ error: "Captacao indisponivel." });

    const ip = (request.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? request.ip;
    const agente = String(request.headers["user-agent"] ?? "").slice(0, 300);

    await query(
      `insert into newsletter_signups (tenant_id, email, name, source, tags, request_ip, user_agent)
       values ($1, $2, nullif($3, ''), $4, array['site'], $5, $6)
       on conflict (tenant_id, email) do update
         set name = coalesce(nullif(excluded.name, ''), newsletter_signups.name),
             status = case when newsletter_signups.status = 'confirmed' then 'confirmed' else 'pending' end,
             confirmation_sent_at = case when newsletter_signups.status = 'confirmed' then newsletter_signups.confirmation_sent_at else null end,
             expires_at = now() + interval '7 days'`,
      [tenant.rows[0].id, email, nome, origem, ip, agente],
    );

    return reply.send({ ok: true, message: "Quase la: confirme pelo link que enviamos por e-mail." });
  });

  /** Confirmacao do link. E aqui que o pedido vira contato de verdade. */
  app.get("/nl/confirmar", async (request, reply) => {
    const { token } = z.object({ token: z.string().max(512).optional() }).parse(request.query);
    const email = verifySignupToken(token);
    reply.type("text/html; charset=utf-8");

    if (!email) {
      return reply
        .code(404)
        .send(unsubscribePage("Link invalido", "<p>Este link de confirmacao nao confere ou ja expirou.</p>"));
    }

    const resultado = await confirmSignup(email);
    if (!resultado) {
      return reply
        .code(404)
        .send(unsubscribePage("Pedido nao encontrado", "<p>Nao achamos um pedido de inscricao para este endereco.</p>"));
    }

    await recordEvent(resultado.tenantId, "contact", "newsletter.signup_confirmed", { email }, null, resultado.contactId, null);
    return reply.send(
      unsubscribePage(
        "Inscricao confirmada",
        `<p><strong>${email}</strong> passa a receber a newsletter da Avila Ops.</p><p>Todo e-mail traz o link de descadastro no rodape.</p>`,
      ),
    );
  });

  /** A imagem da campanha precisa abrir no cliente de e-mail, que não tem cookie. */
  app.get("/nl/img/:fileName", async (request, reply) => {
    const { fileName } = z.object({ fileName: z.string().max(80) }).parse(request.params);
    if (!/^[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(fileName)) return reply.code(404).send({ error: "Imagem não encontrada." });

    try {
      const bytes = await readFile(join(storageRoot(), fileName));
      const extension = extname(fileName).slice(1);
      return reply
        .header("Content-Type", extension === "jpg" ? "image/jpeg" : `image/${extension}`)
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .send(bytes);
    } catch {
      return reply.code(404).send({ error: "Imagem não encontrada." });
    }
  });

  /**
   * Descadastro. O GET só confirma — filtro de spam e pré-visualização abrem
   * links sozinhos, e um GET que remove tiraria da lista quem nunca clicou.
   */
  app.get("/nl/descadastro", async (request, reply) => {
    const { token, ok } = z.object({ token: z.string().max(512).optional(), ok: z.string().optional() }).parse(request.query);
    const email = verifyUnsubscribeToken(token);
    reply.type("text/html; charset=utf-8");

    if (!email) {
      return reply
        .code(404)
        .send(unsubscribePage("Link inválido", "<p>Este link de descadastro não confere. Use o link mais recente que você recebeu por e-mail.</p>"));
    }
    if (ok === "1") {
      return reply.send(
        unsubscribePage("Inscrição cancelada", `<p><strong>${email}</strong> não vai mais receber nossos e-mails.</p>`),
      );
    }
    return reply.send(
      unsubscribePage(
        "Cancelar inscrição?",
        `<p>Vamos parar de enviar e-mails para <strong>${email}</strong>.</p>`,
        `<form method="post" action="/nl/descadastro?token=${encodeURIComponent(token ?? "")}"><button type="submit">Confirmar descadastro</button></form>`,
      ),
    );
  });

  app.post("/nl/descadastro", async (request, reply) => {
    const { token } = z.object({ token: z.string().max(512).optional() }).parse(request.query);
    const body = (request.body ?? {}) as { token?: string; "List-Unsubscribe"?: string };
    const email = verifyUnsubscribeToken(token ?? body.token);
    const oneClick = body["List-Unsubscribe"] === "One-Click";

    if (!email) {
      if (oneClick) return reply.code(404).send({ error: "invalid_token" });
      reply.type("text/html; charset=utf-8");
      return reply.code(404).send(unsubscribePage("Link inválido", "<p>Este link de descadastro não confere.</p>"));
    }

    await unsubscribeEmail(email);
    if (oneClick) return reply.send({ unsubscribed: true });
    return reply.redirect(`/nl/descadastro?token=${encodeURIComponent(token ?? body.token ?? "")}&ok=1`, 303);
  });
}
