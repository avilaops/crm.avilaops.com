import { ImapFlow, type FetchMessageObject } from "imapflow";
import nodemailer from "nodemailer";
import { query } from "./db.js";

/**
 * Conta de e-mail do CRM: IMAP para ler a caixa, SMTP para enviar.
 *
 * A conta é cadastrada pela tela (`/mail/settings/`) e guardada em
 * `integrations` com a senha criptografada — do mesmo jeito que o token da
 * Meta. Variável de ambiente aqui seria pior: trocar a senha da caixa não pode
 * exigir deploy, e cada tenant tem a sua conta.
 */

export const MAIL_PROVIDER = "mail";

export type MailAccount = {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

export type MailAccountView = Omit<MailAccount, "password"> & {
  hasPassword: boolean;
  connectedAt: string | null;
  lastError: string | null;
};

type IntegrationRow = {
  app_id: string | null;
  app_secret: string | null;
  user_name: string | null;
  metadata: Record<string, unknown>;
  connected_at: string | null;
};

function metadataString(metadata: Record<string, unknown>, key: string, fallback = "") {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function metadataNumber(metadata: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(metadata[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function loadMailAccount(
  tenantId: string,
  decrypt: (value: string | null) => string | null,
): Promise<MailAccount | null> {
  const result = await query<IntegrationRow>(
    "select app_id, app_secret, user_name, metadata, connected_at from integrations where tenant_id = $1 and provider = $2",
    [tenantId, MAIL_PROVIDER],
  );
  const row = result.rows[0];
  if (!row?.user_name || !row.app_secret) return null;

  const metadata = row.metadata ?? {};
  return {
    imapHost: metadataString(metadata, "imapHost", "imap.porkbun.com"),
    imapPort: metadataNumber(metadata, "imapPort", 993),
    smtpHost: metadataString(metadata, "smtpHost", "smtp.porkbun.com"),
    smtpPort: metadataNumber(metadata, "smtpPort", 587),
    user: row.user_name,
    password: decrypt(row.app_secret) ?? "",
    fromName: metadataString(metadata, "fromName", "Ávila Ops"),
    fromEmail: metadataString(metadata, "fromEmail", row.user_name),
  };
}

export async function readMailAccountView(
  tenantId: string,
): Promise<MailAccountView | null> {
  const result = await query<IntegrationRow>(
    "select app_id, app_secret, user_name, metadata, connected_at from integrations where tenant_id = $1 and provider = $2",
    [tenantId, MAIL_PROVIDER],
  );
  const row = result.rows[0];
  if (!row) return null;
  const metadata = row.metadata ?? {};

  return {
    imapHost: metadataString(metadata, "imapHost", "imap.porkbun.com"),
    imapPort: metadataNumber(metadata, "imapPort", 993),
    smtpHost: metadataString(metadata, "smtpHost", "smtp.porkbun.com"),
    smtpPort: metadataNumber(metadata, "smtpPort", 587),
    user: row.user_name ?? "",
    fromName: metadataString(metadata, "fromName", "Ávila Ops"),
    fromEmail: metadataString(metadata, "fromEmail", row.user_name ?? ""),
    hasPassword: Boolean(row.app_secret),
    connectedAt: row.connected_at,
    lastError: metadataString(metadata, "lastError") || null,
  };
}

export async function saveMailAccount(
  tenantId: string,
  input: Omit<MailAccount, "password"> & { password?: string },
  encrypt: (value: string | null) => string | null,
) {
  const metadata = {
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
  };

  // Senha em branco significa "mantém a que já está lá": a tela nunca recebe a
  // senha de volta, então reenviar vazio é o caminho normal de quem só mudou
  // a porta ou o nome do remetente.
  await query(
    `insert into integrations (tenant_id, provider, user_name, app_secret, metadata, connected_at, updated_at)
     values ($1, $2, $3, $4, $5::jsonb, now(), now())
     on conflict (tenant_id, provider) do update
       set user_name = excluded.user_name,
           app_secret = coalesce(excluded.app_secret, integrations.app_secret),
           metadata = integrations.metadata || excluded.metadata,
           updated_at = now()`,
    [tenantId, MAIL_PROVIDER, input.user, input.password ? encrypt(input.password) : null, JSON.stringify(metadata)],
  );
}

export async function recordMailError(tenantId: string, message: string | null) {
  await query(
    `update integrations
        set metadata = metadata || jsonb_build_object('lastError', $3::text),
            updated_at = now()
      where tenant_id = $1 and provider = $2`,
    [tenantId, MAIL_PROVIDER, message ?? ""],
  );
}

function imapClient(account: MailAccount) {
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapPort === 993,
    auth: { user: account.user, pass: account.password },
    logger: false,
    connectionTimeout: 20_000,
    socketTimeout: 30_000,
  });
}

export type MailboxMessage = {
  uid: number;
  subject: string;
  fromName: string;
  fromEmail: string;
  to: string[];
  date: string | null;
  seen: boolean;
  preview: string;
};

function addressOf(value: { name?: string; address?: string } | undefined) {
  return {
    name: value?.name?.trim() ?? "",
    email: (value?.address ?? "").trim().toLowerCase(),
  };
}

function envelopeToMessage(message: FetchMessageObject): MailboxMessage {
  const from = addressOf(message.envelope?.from?.[0]);
  return {
    uid: message.uid,
    subject: message.envelope?.subject?.trim() || "(sem assunto)",
    fromName: from.name,
    fromEmail: from.email,
    to: (message.envelope?.to ?? []).map((entry) => addressOf(entry).email).filter(Boolean),
    date: message.envelope?.date ? new Date(message.envelope.date).toISOString() : null,
    seen: Boolean(message.flags?.has("\\Seen")),
    preview: "",
  };
}

/** Lista o topo da caixa. Só envelope: corpo só é buscado ao abrir a mensagem. */
export async function listMailbox(
  account: MailAccount,
  options: { mailbox?: string; limit?: number; offset?: number } = {},
): Promise<{ total: number; messages: MailboxMessage[] }> {
  const mailbox = options.mailbox ?? "INBOX";
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const client = imapClient(account);
  await client.connect();
  try {
    const box = await client.mailboxOpen(mailbox, { readOnly: true });
    const total = box.exists;
    if (total === 0) return { total: 0, messages: [] };

    const end = Math.max(total - offset, 0);
    const start = Math.max(end - limit + 1, 1);
    if (end < start) return { total, messages: [] };

    const messages: MailboxMessage[] = [];
    for await (const message of client.fetch(`${start}:${end}`, { envelope: true, flags: true, uid: true })) {
      messages.push(envelopeToMessage(message));
    }
    messages.sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""));
    return { total, messages };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function fetchMailBody(
  account: MailAccount,
  uid: number,
  mailbox = "INBOX",
): Promise<{ message: MailboxMessage; text: string; html: string | null }> {
  const client = imapClient(account);
  await client.connect();
  try {
    await client.mailboxOpen(mailbox, { readOnly: true });
    const message = await client.fetchOne(String(uid), { envelope: true, flags: true, source: true, uid: true }, { uid: true });
    if (!message) throw new Error("Mensagem não encontrada.");

    const raw = message.source?.toString("utf8") ?? "";
    const { text, html } = splitMimeBody(raw);
    return { message: envelopeToMessage(message), text, html };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/**
 * Extrator MIME mínimo: separa a primeira parte text/plain e a primeira
 * text/html, decodifica base64/quoted-printable e ignora anexos. Não é um
 * parser completo — é o suficiente para ler o que chegou sem trazer uma
 * dependência de parsing inteira para dentro do CRM.
 */
export function splitMimeBody(raw: string): { text: string; html: string | null } {
  const separator = raw.indexOf("\r\n\r\n") >= 0 ? "\r\n\r\n" : "\n\n";
  const headerBlock = raw.slice(0, raw.indexOf(separator));
  const body = raw.slice(raw.indexOf(separator) + separator.length);

  const boundaryMatch = headerBlock.match(/boundary="?([^";\r\n]+)"?/i);
  if (!boundaryMatch) {
    const decoded = decodePart(headerBlock, body);
    const isHtml = /content-type:\s*text\/html/i.test(headerBlock);
    return isHtml ? { text: stripHtml(decoded), html: decoded } : { text: decoded, html: null };
  }

  const parts = body.split(`--${boundaryMatch[1]}`);
  let text = "";
  let html: string | null = null;

  for (const part of parts) {
    const trimmed = part.replace(/^\r?\n/, "");
    if (!trimmed || trimmed.startsWith("--")) continue;
    const partSeparator = trimmed.indexOf("\r\n\r\n") >= 0 ? "\r\n\r\n" : "\n\n";
    const index = trimmed.indexOf(partSeparator);
    if (index < 0) continue;

    const partHeaders = trimmed.slice(0, index);
    if (/content-disposition:\s*attachment/i.test(partHeaders)) continue;
    const decoded = decodePart(partHeaders, trimmed.slice(index + partSeparator.length));

    if (/content-type:\s*text\/html/i.test(partHeaders) && html === null) html = decoded;
    else if (/content-type:\s*text\/plain/i.test(partHeaders) && !text) text = decoded;
  }

  if (!text && html) text = stripHtml(html);
  return { text: text.trim(), html };
}

function decodePart(headers: string, body: string): string {
  const encoding = headers.match(/content-transfer-encoding:\s*([^\s;\r\n]+)/i)?.[1]?.toLowerCase();
  if (encoding === "base64") {
    return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  }
  if (encoding === "quoted-printable") {
    return body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  }
  return body;
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
};

export function mailTransport(account: MailAccount) {
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: { user: account.user, pass: account.password },
    connectionTimeout: 20_000,
  });
}

export async function sendMail(account: MailAccount, email: OutgoingEmail): Promise<string> {
  const info = await mailTransport(account).sendMail({
    from: { name: account.fromName, address: account.fromEmail },
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: email.headers,
  });
  return info.messageId ?? "";
}

export type MailCheck = { imap: { ok: boolean; detail: string }; smtp: { ok: boolean; detail: string } };

/** Testa as duas pontas separadamente: ler e enviar falham por motivos diferentes. */
export async function checkMailAccount(account: MailAccount): Promise<MailCheck> {
  const check: MailCheck = { imap: { ok: false, detail: "" }, smtp: { ok: false, detail: "" } };

  const client = imapClient(account);
  try {
    await client.connect();
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    check.imap = { ok: true, detail: `INBOX com ${box.exists} mensagens` };
    await client.logout();
  } catch (error) {
    check.imap = { ok: false, detail: describeError(error) };
    client.close();
  }

  try {
    await mailTransport(account).verify();
    check.smtp = { ok: true, detail: `${account.smtpHost}:${account.smtpPort} autenticado` };
  } catch (error) {
    check.smtp = { ok: false, detail: describeError(error) };
  }

  return check;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    const response = (error as { responseText?: string }).responseText;
    return [code, response ?? error.message].filter(Boolean).join(" — ").slice(0, 300);
  }
  return String(error).slice(0, 300);
}

/**
 * Registra remetentes vistos na caixa. É o insumo da tela: quem escreveu,
 * quantas vezes e quando — para virar contato com um clique.
 */
export async function rememberSenders(tenantId: string, messages: MailboxMessage[], ownAddresses: string[]) {
  const mine = new Set(ownAddresses.map((address) => address.toLowerCase()));

  for (const message of messages) {
    if (!message.fromEmail || mine.has(message.fromEmail)) continue;
    await query(
      `insert into mail_senders (tenant_id, email, name, message_count, last_subject, last_seen_at)
       values ($1, $2, $3, 1, $4, coalesce($5::timestamptz, now()))
       on conflict (tenant_id, email) do update
         set message_count = mail_senders.message_count + 1,
             name = coalesce(nullif(mail_senders.name, ''), excluded.name),
             last_subject = excluded.last_subject,
             last_seen_at = greatest(mail_senders.last_seen_at, excluded.last_seen_at)`,
      [tenantId, message.fromEmail, message.fromName || null, message.subject, message.date],
    );
  }
}
