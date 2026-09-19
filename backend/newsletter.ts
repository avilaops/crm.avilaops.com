import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "./db.js";
import { sendMail, type MailAccount } from "./mail.js";

/**
 * Newsletter do CRM.
 *
 * O público são os próprios contatos do CRM — a base já está aqui, criada por
 * conversa de WhatsApp, por lead ou pela caixa de entrada. Não existe segunda
 * lista paralela: `contacts.newsletter_status` decide quem recebe, e um
 * descadastro vale para todas as campanhas.
 */

export const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe}}";

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

export type CampaignRow = {
  id: string;
  tenant_id: string;
  name: string;
  subject: string;
  preview_text: string | null;
  format: string;
  html: string | null;
  body_text: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_link_url: string | null;
  audience_tags: string[];
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  sent_at: string | null;
  created_at: string;
};

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^mailto:/i, "").toLowerCase();
  if (!trimmed || trimmed.length > 254) return null;
  return EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

export type ParsedContact = { email: string; name: string | null };

/** Aceita lista colada: uma por linha, vírgula, ou `Nome <email@dominio>`. */
export function parseContactList(raw: string): ParsedContact[] {
  const seen = new Set<string>();
  const entries: ParsedContact[] = [];

  for (const chunk of raw.split(/[\n\r;,]+/)) {
    const line = chunk.trim();
    if (!line) continue;
    const angled = line.match(/^(.*?)<([^>]+)>$/);
    const email = normalizeEmail(angled ? angled[2] : line);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const name = angled ? angled[1].trim().replace(/^["']|["']$/g, "") : "";
    entries.push({ email, name: name || null });
  }

  return entries;
}

function secret() {
  const value = process.env.NEWSLETTER_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || process.env.APP_JWT_SECRET?.trim();
  if (!value || value.length < 16) {
    throw new Error("Configure NEWSLETTER_SECRET para assinar os links de descadastro.");
  }
  return value;
}

export function publicBaseUrl() {
  const base = process.env.NEWSLETTER_PUBLIC_BASE_URL?.trim() || process.env.PUBLIC_BASE_URL?.trim() || "https://crm.avilaops.com";
  return base.replace(/\/+$/, "");
}

export function unsubscribeToken(email: string) {
  const payload = Buffer.from(email.toLowerCase(), "utf8").toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function verifyUnsubscribeToken(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(createHmac("sha256", secret()).update(payload).digest("base64url"), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const conteudo = Buffer.from(payload, "base64url").toString("utf8");
    // Token com propósito (`inscricao:...`) não vale aqui. Sem esta guarda o
    // endereço pseudo-válido "inscricao:alguem@dominio.com" passaria pelo
    // formato de e-mail e um link de confirmação viraria link de descadastro.
    if (conteudo.includes(":")) return null;
    return normalizeEmail(conteudo);
  } catch {
    return null;
  }
}

/**
 * Token de confirmacao de inscricao.
 *
 * Assinado com o mesmo segredo do descadastro, mas com proposito embutido no
 * payload: um token de descadastro nao vale como confirmacao, e vice-versa.
 */
export function signupToken(email: string) {
  const payload = Buffer.from(`inscricao:${email.toLowerCase()}`, "utf8").toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function verifySignupToken(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const esperado = Buffer.from(createHmac("sha256", secret()).update(payload).digest("base64url"), "utf8");
  const recebido = Buffer.from(signature, "utf8");
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;

  try {
    const conteudo = Buffer.from(payload, "base64url").toString("utf8");
    if (!conteudo.startsWith("inscricao:")) return null;
    return normalizeEmail(conteudo.slice("inscricao:".length));
  } catch {
    return null;
  }
}

export function signupUrl(email: string) {
  return `${publicBaseUrl()}/nl/confirmar?token=${signupToken(email)}`;
}

export function unsubscribeUrl(email: string) {
  return `${publicBaseUrl()}/nl/descadastro?token=${unsubscribeToken(email)}`;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type Renderable = Pick<
  CampaignRow,
  "subject" | "preview_text" | "format" | "html" | "body_text" | "image_url" | "image_alt" | "image_link_url"
>;

function shell(inner: string, campaign: Renderable, unsubscribe: string) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(campaign.subject)}</title></head>
<body style="margin:0;background:#f3f4f6;color:#17202a;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(campaign.preview_text ?? "")}</div>
<table role="presentation" width="100%" style="border-collapse:collapse;background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" style="border-collapse:collapse;width:100%;max-width:600px;background:#ffffff">
<tr><td style="padding:32px 40px;border-top:5px solid #0b6b57">
<div style="color:#0b6b57;font-size:19px;font-weight:700;margin-bottom:24px">ÁVILA OPS</div>
${inner}
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.55">
Ávila Ops · Brasil · <a href="${unsubscribe}" style="color:#6b7280">Cancelar inscrição</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="color:#374151;font-size:16px;line-height:1.65;margin:0 0 16px">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("\n");
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Monta o e-mail de um destinatário. O descadastro entra sempre — no marcador ou no rodapé. */
export function renderCampaign(campaign: Renderable, unsubscribe: string): { html: string; text: string } {
  if (campaign.format === "image") {
    const alt = escapeHtml(campaign.image_alt ?? campaign.subject);
    const image = `<img src="${campaign.image_url ?? ""}" alt="${alt}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:6px">`;
    const inner = campaign.image_link_url ? `<a href="${campaign.image_link_url}" style="text-decoration:none">${image}</a>` : image;
    return {
      html: shell(inner, campaign, unsubscribe),
      text: `${campaign.image_alt ?? campaign.subject}\n${campaign.image_link_url ?? ""}\n\nCancelar inscrição: ${unsubscribe}`,
    };
  }

  if (campaign.format === "text") {
    const body = campaign.body_text ?? "";
    return {
      html: shell(textToHtml(body), campaign, unsubscribe),
      text: `${body}\n\n--\nCancelar inscrição: ${unsubscribe}`,
    };
  }

  const source = campaign.html ?? "";
  const html = source.includes(UNSUBSCRIBE_PLACEHOLDER)
    ? source.replaceAll(UNSUBSCRIBE_PLACEHOLDER, unsubscribe)
    : `${source}\n<p style="color:#6b7280;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-align:center;padding:16px">Ávila Ops · <a href="${unsubscribe}" style="color:#6b7280">Cancelar inscrição</a></p>`;

  return { html, text: `${campaign.body_text?.trim() || htmlToText(html)}\n\n--\nCancelar inscrição: ${unsubscribe}` };
}

export function assertSendable(campaign: Renderable) {
  if (!campaign.subject.trim()) throw new Error("Informe o assunto do e-mail.");
  if (campaign.format === "html" && !campaign.html?.trim()) throw new Error("Cole o HTML da campanha.");
  if (campaign.format === "text" && !campaign.body_text?.trim()) throw new Error("Escreva a mensagem da campanha.");
  if (campaign.format === "image" && !campaign.image_url?.trim()) throw new Error("Envie a imagem da campanha.");
}

type AudienceRow = { id: string; email: string };

export async function audience(tenantId: string, tags: string[]): Promise<AudienceRow[]> {
  const params: unknown[] = [tenantId];
  let filter = "";
  if (tags.length > 0) {
    params.push(tags);
    filter = `and tags && $${params.length}::text[]`;
  }

  const result = await query<AudienceRow>(
    `select id, lower(email) as email
       from contacts
      where tenant_id = $1
        and email is not null
        and email <> ''
        and newsletter_status = 'subscribed'
        ${filter}
      order by updated_at desc`,
    params,
  );

  const seen = new Set<string>();
  return result.rows.filter((row) => {
    if (!normalizeEmail(row.email) || seen.has(row.email)) return false;
    seen.add(row.email);
    return true;
  });
}

export type SendResult = { sent: number; failed: number; remaining: number; status: string; lastError: string | null };

/**
 * Envia (ou retoma) uma campanha, no máximo `batchSize` por chamada.
 *
 * O corte existe para a tela não ficar pendurada num envio grande: a resposta
 * diz quantos faltam e o botão continua de onde parou. Como a chave única é
 * (campanha, e-mail), retomar nunca duplica.
 */
export async function sendCampaign(
  tenantId: string,
  campaignId: string,
  account: MailAccount,
  options: { batchSize?: number } = {},
): Promise<SendResult> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 40, 1), 200);
  const campaign = await query<CampaignRow>(
    "select * from newsletter_campaigns where tenant_id = $1 and id = $2",
    [tenantId, campaignId],
  );
  const row = campaign.rows[0];
  if (!row) throw new Error("Campanha não encontrada.");
  if (row.status === "sent") throw new Error("Esta campanha já foi enviada.");
  assertSendable(row);

  const recipients = await audience(tenantId, row.audience_tags);
  if (recipients.length === 0) throw new Error("Nenhum contato inscrito para este público.");

  for (const recipient of recipients) {
    await query(
      `insert into newsletter_deliveries (tenant_id, campaign_id, contact_id, email)
       values ($1, $2, $3, $4)
       on conflict (campaign_id, email) do nothing`,
      [tenantId, row.id, recipient.id, recipient.email],
    );
  }

  await query("update newsletter_campaigns set status = 'sending', recipient_count = $3, updated_at = now() where tenant_id = $1 and id = $2", [
    tenantId,
    row.id,
    recipients.length,
  ]);

  const pending = await query<{ id: string; email: string }>(
    `select id, email from newsletter_deliveries
      where campaign_id = $1 and status in ('pending', 'failed')
      order by created_at
      limit $2`,
    [row.id, batchSize],
  );

  let lastError: string | null = null;

  for (const delivery of pending.rows) {
    const contact = await query<{ newsletter_status: string }>(
      "select newsletter_status from contacts where tenant_id = $1 and lower(email) = $2 limit 1",
      [tenantId, delivery.email],
    );
    if (contact.rows[0] && contact.rows[0].newsletter_status !== "subscribed") {
      await query("update newsletter_deliveries set status = 'skipped', error = 'contato descadastrado' where id = $1", [delivery.id]);
      continue;
    }

    const link = unsubscribeUrl(delivery.email);
    const rendered = renderCampaign(row, link);

    try {
      const providerId = await sendMail(account, {
        to: delivery.email,
        subject: row.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          "List-Unsubscribe": `<${link}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await query("update newsletter_deliveries set status = 'sent', provider_id = $2, error = null, sent_at = now() where id = $1", [
        delivery.id,
        providerId || null,
      ]);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await query("update newsletter_deliveries set status = 'failed', error = $2 where id = $1", [delivery.id, lastError.slice(0, 500)]);
    }
  }

  const totals = await query<{ sent: string; failed: string; remaining: string }>(
    `select
       count(*) filter (where status = 'sent')::text as sent,
       count(*) filter (where status = 'failed')::text as failed,
       count(*) filter (where status = 'pending')::text as remaining
     from newsletter_deliveries where campaign_id = $1`,
    [row.id],
  );

  const sent = Number(totals.rows[0]?.sent ?? 0);
  const failed = Number(totals.rows[0]?.failed ?? 0);
  const remaining = Number(totals.rows[0]?.remaining ?? 0);
  const status = remaining > 0 ? "sending" : failed > 0 && sent === 0 ? "failed" : "sent";

  await query(
    `update newsletter_campaigns
        set status = $3, sent_count = $4, failed_count = $5,
            sent_at = case when $3 = 'sent' then now() else sent_at end,
            updated_at = now()
      where tenant_id = $1 and id = $2`,
    [tenantId, row.id, status, sent, failed],
  );

  return { sent, failed, remaining, status, lastError };
}

export async function unsubscribeEmail(email: string) {
  const result = await query(
    `update contacts
        set newsletter_status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
      where lower(email) = $1 and newsletter_status <> 'unsubscribed'`,
    [email.toLowerCase()],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Efetiva a inscricao confirmada: o pedido vira contato do CRM.
 *
 * Confirmar tambem ressuscita quem estava descadastrado - foi a propria pessoa
 * que pediu para voltar, e ignorar isso seria pior do que respeitar a lista.
 */
export async function confirmSignup(email: string) {
  const pedido = await query<{ id: string; tenant_id: string; name: string | null; tags: string[]; status: string }>(
    "select id, tenant_id, name, tags, status from newsletter_signups where lower(email) = $1 order by created_at desc limit 1",
    [email.toLowerCase()],
  );
  const linha = pedido.rows[0];
  if (!linha) return null;

  await query(
    "update newsletter_signups set status = 'confirmed', confirmed_at = now() where id = $1",
    [linha.id],
  );

  const existente = await query<{ id: string }>(
    "select id from contacts where tenant_id = $1 and lower(email) = $2 limit 1",
    [linha.tenant_id, email.toLowerCase()],
  );

  if (existente.rows[0]) {
    await query(
      `update contacts
          set newsletter_status = 'subscribed', unsubscribed_at = null,
              tags = (select array(select distinct unnest(tags || $3::text[]))),
              updated_at = now()
        where tenant_id = $1 and id = $2`,
      [linha.tenant_id, existente.rows[0].id, linha.tags],
    );
    return { tenantId: linha.tenant_id, contactId: existente.rows[0].id, novo: false };
  }

  const criado = await query<{ id: string }>(
    `insert into contacts (tenant_id, name, email, source, tags)
     values ($1, $2, $3, 'site', $4) returning id`,
    [linha.tenant_id, linha.name || email, email.toLowerCase(), linha.tags],
  );
  return { tenantId: linha.tenant_id, contactId: criado.rows[0].id, novo: true };
}
