import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { query } from "./db.js";
import { publishRealtimeAsync } from "./realtime.js";

/**
 * Midia do WhatsApp nos dois sentidos.
 *
 * O binario vai para o volume `/app/storage`, nao para o Postgres: uma semana
 * de audios de atendimento pesa mais que o resto do banco inteiro e faria o
 * `pg_dump` dos scripts de backup demorar o suficiente para alguem desistir de
 * rodar. No banco fica so o que a tela precisa para decidir o que desenhar
 * antes de baixar o arquivo.
 *
 * A Meta entrega midia em duas etapas — primeiro o metadado com uma URL
 * assinada de curta duracao, depois o download com o token — e essa URL nao
 * pode ir para o navegador: ela vaza o acesso a conta. Por isso guardamos a
 * copia e servimos por uma rota autenticada.
 */

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, "..");

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

export const WHATSAPP_MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker", "voice"]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "audio/aac": "aac",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
};

export function mediaDir() {
  return process.env.MEDIA_DIR ?? join(rootDir, "storage", "media");
}

export function maxMediaBytes() {
  const raw = Number(process.env.MEDIA_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_BYTES;
}

function extensionFor(mimeType: string, fallbackName?: string | null) {
  const known = EXTENSION_BY_MIME[mimeType.split(";")[0].trim().toLowerCase()];
  if (known) return known;
  const fromName = fallbackName?.split(".").pop();
  if (fromName && /^[a-z0-9]{1,8}$/i.test(fromName)) return fromName.toLowerCase();
  return "bin";
}

/** `image`, `audio`, `video` ou `document` — e o campo que a Graph espera no envio. */
export function whatsappTypeFor(mimeType: string) {
  const base = mimeType.split("/")[0]?.toLowerCase();
  if (base === "image") return "image";
  if (base === "audio") return "audio";
  if (base === "video") return "video";
  return "document";
}

/** Nome seguro para o `Content-Disposition`: aspas e quebras quebram o header. */
function safeFileName(name: string | null | undefined, fallback: string) {
  const clean = (name ?? "").replace(/[^\w.\- ]+/g, "_").trim();
  return clean.length > 0 && clean.length <= 180 ? clean : fallback;
}

/** Impede que um `storage_path` adulterado no banco leia fora do volume. */
function resolveInsideMediaDir(storagePath: string) {
  const base = resolve(mediaDir());
  const full = resolve(base, storagePath);
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}

type MediaRow = {
  id: string;
  mime_type: string;
  file_name: string | null;
  file_size: number | null;
  storage_path: string | null;
  status: string;
};

async function persistBytes(tenantId: string, bytes: Buffer, mimeType: string, fileName: string | null) {
  const relativeDir = tenantId;
  const relativePath = join(relativeDir, `${randomUUID()}.${extensionFor(mimeType, fileName)}`);
  const absolute = join(mediaDir(), relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  return { relativePath, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/**
 * Baixa a midia recebida e vincula a mensagem.
 *
 * Roda sem `await` no webhook, pelo mesmo motivo da transcricao: a Meta
 * reentrega o evento se a resposta demorar, e baixar um video leva segundos. A
 * mensagem ja entrou no inbox; o anexo aparece assim que termina, por evento.
 */
export async function ingestInboundMedia(input: {
  tenantId: string;
  conversationId: string;
  messageId: string;
  mediaId: string;
  mimeTypeHint?: string | null;
  fileNameHint?: string | null;
  caption?: string | null;
  accessToken: string;
  graphVersion: string;
}) {
  const inserted = await query<{ id: string }>(
    `insert into message_media (tenant_id, conversation_id, direction, external_id, mime_type, file_name, caption, status)
     values ($1, $2, 'inbound', $3, $4, $5, $6, 'pending')
     on conflict (tenant_id, external_id) do update set updated_at = now()
     returning id`,
    [
      input.tenantId,
      input.conversationId,
      input.mediaId,
      input.mimeTypeHint ?? "application/octet-stream",
      input.fileNameHint ?? null,
      input.caption ?? null,
    ],
  );
  const mediaRowId = inserted.rows[0]?.id;
  if (!mediaRowId) return null;

  await query("update messages set media_id = $2 where id = $1", [input.messageId, mediaRowId]);

  const fail = async (message: string) => {
    await query("update message_media set status = 'failed', error_message = $2, updated_at = now() where id = $1", [mediaRowId, message.slice(0, 500)]);
    publishRealtimeAsync({ type: "message.updated", tenantId: input.tenantId, conversationId: input.conversationId, data: { id: input.messageId, media_status: "failed" } });
    return null;
  };

  const headers = { Authorization: `Bearer ${input.accessToken}` };
  const metaResponse = await fetch(`https://graph.facebook.com/${input.graphVersion}/${input.mediaId}`, { headers });
  if (!metaResponse.ok) return fail(`Metadado da midia indisponivel (HTTP ${metaResponse.status}).`);

  const metadata = (await metaResponse.json()) as { url?: string; mime_type?: string; sha256?: string; file_size?: number };
  if (!metadata.url) return fail("A Meta nao devolveu a URL da midia.");

  const limit = maxMediaBytes();
  if (typeof metadata.file_size === "number" && metadata.file_size > limit) {
    return fail(`Arquivo de ${metadata.file_size} bytes acima do limite de ${limit}.`);
  }

  const binaryResponse = await fetch(metadata.url, { headers });
  if (!binaryResponse.ok) return fail(`Download da midia falhou (HTTP ${binaryResponse.status}).`);

  const bytes = Buffer.from(await binaryResponse.arrayBuffer());
  if (bytes.byteLength > limit) return fail(`Arquivo de ${bytes.byteLength} bytes acima do limite de ${limit}.`);

  const mimeType = metadata.mime_type ?? input.mimeTypeHint ?? "application/octet-stream";
  const stored = await persistBytes(input.tenantId, bytes, mimeType, input.fileNameHint ?? null);

  await query(
    `update message_media
     set mime_type = $2, file_size = $3, sha256 = $4, storage_path = $5, status = 'ready', error_message = null, updated_at = now()
     where id = $1`,
    [mediaRowId, mimeType, bytes.byteLength, metadata.sha256 ?? stored.sha256, stored.relativePath],
  );

  publishRealtimeAsync({
    type: "message.updated",
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    data: { id: input.messageId, media_id: mediaRowId, media_status: "ready", media_mime_type: mimeType, media_file_size: bytes.byteLength },
  });

  return { mediaRowId, mimeType, size: bytes.byteLength };
}

type AuthUser = { id: string; tenant_id: string; name: string; role: string };
type RequireAuth = (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>;
type RecordEvent = (
  tenantId: string,
  entityType: string,
  eventType: string,
  payload: unknown,
  actorUserId?: string | null,
  entityId?: string | null,
  requestId?: string | null,
) => Promise<void>;

export type MediaRouteDeps = {
  requireAuth: RequireAuth;
  recordEvent: RecordEvent;
  getMetaIntegration: (tenantId: string) => Promise<{ tenantId: string; integration: { access_token: string | null } | null }>;
  graphVersion: string;
  assertSendWindow: (tenantId: string, conversationId: string) => Promise<{ allowed: boolean; reason?: string; expiresAt?: string | null }>;
  touchConversationAfterSend: (tenantId: string, conversationId: string, status: string) => Promise<void>;
};

export function registerWhatsAppMediaRoutes(app: FastifyInstance, deps: MediaRouteDeps) {
  /** Serve a copia guardada. A URL assinada da Meta nunca chega ao navegador. */
  app.get("/api/media/:id/content", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const result = await query<MediaRow>(
      "select id, mime_type, file_name, file_size, storage_path, status from message_media where tenant_id = $1 and id = $2",
      [user.tenant_id, id],
    );
    const media = result.rows[0];
    if (!media) return reply.code(404).send({ error: "Midia nao encontrada." });
    if (media.status !== "ready" || !media.storage_path) return reply.code(409).send({ error: "Midia ainda nao esta disponivel.", status: media.status });

    const absolute = resolveInsideMediaDir(media.storage_path);
    if (!absolute) return reply.code(404).send({ error: "Midia nao encontrada." });

    try {
      await stat(absolute);
    } catch {
      return reply.code(404).send({ error: "Arquivo da midia nao esta mais no volume." });
    }

    const inline = ["image", "audio", "video"].includes(whatsappTypeFor(media.mime_type));
    const fileName = safeFileName(media.file_name, `${media.id}.${extensionFor(media.mime_type, media.file_name)}`);

    reply.header("Content-Type", media.mime_type);
    reply.header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${fileName}"`);
    // Conteudo enviado por terceiros: sem script, sem frame, sem plugin.
    reply.header("Content-Security-Policy", "default-src 'none'; sandbox");
    if (media.file_size) reply.header("Content-Length", String(media.file_size));
    return reply.send(createReadStream(absolute));
  });

  /** Envia um anexo pela conversa: sobe para a Meta e grava a mensagem. */
  app.post("/api/conversations/:id/media", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    const requestId = (request as FastifyRequest & { requestId?: string }).requestId;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const uploaded = await (request as FastifyRequest & { file?: () => Promise<UploadedFile | undefined> }).file?.();
    if (!uploaded) return reply.code(400).send({ error: "Envie o arquivo no campo 'file' de um formulario multipart." });

    const limit = maxMediaBytes();
    const bytes = await uploaded.toBuffer();
    if (uploaded.file?.truncated || bytes.byteLength > limit) {
      return reply.code(413).send({ error: `Arquivo acima do limite de ${Math.floor(limit / 1024 / 1024)} MB.` });
    }
    if (bytes.byteLength === 0) return reply.code(400).send({ error: "Arquivo vazio." });

    // `fields` so traz o que veio antes do arquivo no fluxo multipart, entao a
    // legenda precisa ser enviada antes dele. A query string fica como saida
    // para quem montar o formulario na ordem inversa.
    const fromField = typeof uploaded.fields?.caption === "object" && uploaded.fields.caption && "value" in uploaded.fields.caption
      ? String((uploaded.fields.caption as { value?: unknown }).value ?? "")
      : "";
    const fromQuery = z.object({ caption: z.string().max(1024).optional() }).parse(request.query).caption ?? "";
    const caption = (fromField || fromQuery).slice(0, 1024);

    const conversation = await query<{ id: string; contact_phone: string | null; channel_external_id: string | null; channel_provider: string | null }>(
      `select c.id, ct.phone as contact_phone, ch.external_id as channel_external_id, ch.provider as channel_provider
       from conversations c
       left join contacts ct on ct.id = c.contact_id
       left join channels ch on ch.id = c.channel_id
       where c.tenant_id = $1 and c.id = $2`,
      [user.tenant_id, id],
    );
    const row = conversation.rows[0];
    if (!row) return reply.code(404).send({ error: "Conversa nao encontrada." });
    if (!row.channel_external_id || !row.contact_phone) return reply.code(400).send({ error: "Conversa sem canal ou telefone valido." });
    if (row.channel_provider !== "whatsapp") return reply.code(400).send({ error: "Envio de midia disponivel apenas em canais WhatsApp oficiais." });

    const windowCheck = await deps.assertSendWindow(user.tenant_id, id);
    if (!windowCheck.allowed) {
      return reply.code(409).send({ error: windowCheck.reason, code: "window_closed", windowExpiresAt: windowCheck.expiresAt ?? null });
    }

    const { integration } = await deps.getMetaIntegration(user.tenant_id);
    if (!integration?.access_token) return reply.code(400).send({ error: "Meta ainda nao conectada." });

    const mimeType = uploaded.mimetype || "application/octet-stream";
    const whatsappType = whatsappTypeFor(mimeType);

    const upload = new FormData();
    upload.set("messaging_product", "whatsapp");
    upload.set("type", mimeType);
    upload.set("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), uploaded.filename || `arquivo.${extensionFor(mimeType, uploaded.filename)}`);

    const uploadResponse = await fetch(`https://graph.facebook.com/${deps.graphVersion}/${row.channel_external_id}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${integration.access_token}` },
      body: upload,
    });
    const uploadData = (await uploadResponse.json()) as { id?: string; error?: { message?: string } };
    if (!uploadResponse.ok || !uploadData.id) {
      const message = uploadData.error?.message ?? "Falha ao subir o arquivo para a Meta.";
      await deps.recordEvent(user.tenant_id, "message", "meta.media_upload_failed", { conversation_id: id, error: message }, user.id, null, requestId);
      return reply.code(502).send({ error: message });
    }

    // Audio e sticker nao aceitam legenda na Graph; mandar o campo derruba o envio.
    const payloadMedia: Record<string, unknown> = { id: uploadData.id };
    if (caption && (whatsappType === "image" || whatsappType === "video" || whatsappType === "document")) payloadMedia.caption = caption;
    if (whatsappType === "document" && uploaded.filename) payloadMedia.filename = uploaded.filename;

    const sendResponse = await fetch(`https://graph.facebook.com/${deps.graphVersion}/${row.channel_external_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: row.contact_phone, type: whatsappType, [whatsappType]: payloadMedia }),
    });
    const sendData = (await sendResponse.json()) as { messages?: Array<{ id?: string }>; error?: { message?: string } };

    const stored = await persistBytes(user.tenant_id, bytes, mimeType, uploaded.filename ?? null);
    const failed = !sendResponse.ok || !sendData.messages?.[0]?.id;
    const errorMessage = failed ? sendData.error?.message ?? "Falha ao enviar a midia pela Meta." : null;

    if (failed) {
      // O arquivo so existe para ser servido ao lado da mensagem enviada; sem
      // envio ele seria lixo permanente no volume.
      await unlink(join(mediaDir(), stored.relativePath)).catch(() => {});
    }

    const mediaRow = failed
      ? null
      : (
          await query<{ id: string }>(
            `insert into message_media (tenant_id, conversation_id, direction, external_id, mime_type, file_name, file_size, sha256, storage_path, caption, status)
             values ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, $9, 'ready')
             returning id`,
            [user.tenant_id, id, uploadData.id, mimeType, uploaded.filename ?? null, bytes.byteLength, stored.sha256, stored.relativePath, caption || null],
          )
        ).rows[0];

    const saved = await query(
      `insert into messages (tenant_id, conversation_id, external_id, direction, sender_name, body, message_type, metadata, status, idempotency_key, error_message, request_id, media_id, sent_at)
       values ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
       returning id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, status, sent_at, created_at, error_message, request_id, media_id`,
      [
        user.tenant_id,
        id,
        sendData.messages?.[0]?.id ?? null,
        user.name,
        caption || null,
        whatsappType,
        JSON.stringify({ graph: sendData, upload_media_id: uploadData.id }),
        failed ? "failed" : "sent",
        randomUUID(),
        errorMessage,
        requestId ?? null,
        mediaRow?.id ?? null,
      ],
    );

    await deps.touchConversationAfterSend(user.tenant_id, id, failed ? "failed" : "sent");
    await deps.recordEvent(
      user.tenant_id,
      "message",
      failed ? "message.outbound_media_failed" : "message.outbound_media_sent",
      { conversation_id: id, mime_type: mimeType, bytes: bytes.byteLength },
      user.id,
      saved.rows[0].id,
      requestId,
    );

    publishRealtimeAsync({ type: "message.created", tenantId: user.tenant_id, conversationId: id, data: saved.rows[0] });

    if (failed) return reply.code(502).send({ error: errorMessage, message: saved.rows[0], requestId });
    return { message: saved.rows[0], requestId };
  });
}

type UploadedFile = {
  filename?: string;
  mimetype?: string;
  fields?: Record<string, unknown>;
  file?: { truncated?: boolean };
  toBuffer: () => Promise<Buffer>;
};
