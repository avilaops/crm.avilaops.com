/**
 * Importação de contatos por arquivo.
 *
 * Três passos, cada um uma rota: a prévia lê o arquivo e mostra o que vai
 * acontecer sem gravar nada; a importação grava num lote identificado; e o
 * lote pode ser desfeito por 24 horas. Origem, base legal e responsável ficam
 * registrados no lote e em cada contato criado (LGPD, art. 7º e 37).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { query, transaction } from "./db.js";
import {
  buildEntries,
  guessMapping,
  LEGAL_BASES,
  normalizeEmail,
  parseContactFile,
  phoneKey,
  type ImportEntry,
  type ImportMapping,
} from "./contact-import.js";

type AuthUser = { id: string; tenant_id: string; name: string; email: string; role: string };

export type ImportRouteDeps = {
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>;
  canManage: (user: AuthUser) => boolean;
  recordEvent: (
    tenantId: string,
    entityType: string,
    eventType: string,
    payload: unknown,
    actorUserId?: string | null,
    entityId?: string | null,
    requestId?: string | null,
  ) => Promise<void>;
};

/** 8 MB de texto: bem acima de uma planilha de 10 mil contatos. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 20_000;
const UNDO_HOURS = 24;
const LOTE = 1000;

const mappingSchema = z
  .object({
    name: z.number().int().min(0).optional(),
    phone: z.number().int().min(0).optional(),
    email: z.number().int().min(0).optional(),
    company: z.number().int().min(0).optional(),
    tags: z.number().int().min(0).optional(),
  })
  .strict();

const fileSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(MAX_FILE_BYTES),
  mapping: mappingSchema.optional(),
});

const importSchema = fileSchema.extend({
  mapping: mappingSchema,
  legalBasis: z.enum(LEGAL_BASES),
  originNote: z.string().trim().min(3).max(300),
  onDuplicate: z.enum(["update", "keep"]),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(10).default([]),
});

type Existing = { id: string };

/** O que já está na base, indexado do jeito que o arquivo vai ser comparado. */
async function loadExisting(tenantId: string) {
  const result = await query<{ id: string; phone: string | null; email: string | null }>("select id, phone, email from contacts where tenant_id = $1", [tenantId]);
  const byPhone = new Map<string, Existing>();
  const byEmail = new Map<string, Existing>();
  for (const row of result.rows) {
    // Telefone antigo em formato que não normaliza ainda casa pelos dígitos.
    const chave = phoneKey(row.phone) ?? (row.phone?.replace(/\D/g, "") || null);
    if (chave) byPhone.set(chave, { id: row.id });
    const email = normalizeEmail(row.email);
    if (email && !byEmail.has(email)) byEmail.set(email, { id: row.id });
  }
  return { byPhone, byEmail };
}

function matchExisting(entry: ImportEntry, existing: Awaited<ReturnType<typeof loadExisting>>) {
  const chave = phoneKey(entry.phone);
  return (chave ? existing.byPhone.get(chave) : undefined) ?? (entry.email ? existing.byEmail.get(entry.email) : undefined) ?? null;
}

function readFile(input: z.infer<typeof fileSchema>) {
  const file = parseContactFile(input.fileName, input.content);
  const mapping: ImportMapping = input.mapping ?? guessMapping(file.columns);
  return { file, mapping };
}

export function registerImportRoutes(app: FastifyInstance, deps: ImportRouteDeps) {
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return null;
    if (!deps.canManage(user)) {
      reply.code(403).send({ error: "Importar contatos em massa e uma acao de quem administra a conta." });
      return null;
    }
    return user;
  };

  app.post("/api/contacts/import/preview", { bodyLimit: MAX_FILE_BYTES + 64 * 1024 }, async (request, reply) => {
    const user = await guard(request, reply);
    if (!user) return;
    const input = fileSchema.parse(request.body);
    const { file, mapping } = readFile(input);
    if (file.rows.length === 0) return reply.code(400).send({ error: "O arquivo nao tem nenhum contato." });
    if (file.rows.length > MAX_ROWS) return reply.code(400).send({ error: `O arquivo passa de ${MAX_ROWS} linhas. Divida em partes.` });
    if (mapping.phone === undefined && mapping.email === undefined) {
      // Sem telefone nem e-mail mapeado ainda não há o que contar: a tela pede as colunas.
      return { kind: file.kind, columns: file.columns, mapping, sample: file.rows.slice(0, 5), totals: null };
    }

    const { entries, rejected, repeatedInFile } = buildEntries(file, mapping);
    const existing = await loadExisting(user.tenant_id);
    const jaExistem = entries.filter((entry) => matchExisting(entry, existing)).length;
    return {
      kind: file.kind,
      columns: file.columns,
      mapping,
      sample: file.rows.slice(0, 5),
      totals: {
        rows: file.rows.length,
        novos: entries.length - jaExistem,
        jaExistem,
        repetidosNoArquivo: repeatedInFile,
        invalidos: rejected.length,
      },
      rejected: rejected.slice(0, 200),
    };
  });

  app.post("/api/contacts/import", { bodyLimit: MAX_FILE_BYTES + 64 * 1024 }, async (request, reply) => {
    const user = await guard(request, reply);
    if (!user) return;
    const input = importSchema.parse(request.body);
    const { file, mapping } = readFile(input);
    if (file.rows.length > MAX_ROWS) return reply.code(400).send({ error: `O arquivo passa de ${MAX_ROWS} linhas. Divida em partes.` });
    const { entries, rejected, repeatedInFile } = buildEntries(file, mapping);
    if (entries.length === 0) return reply.code(400).send({ error: "Nenhum contato do arquivo tem telefone ou e-mail valido." });

    const result = await transaction(async () => {
      // Duas importações ao mesmo tempo na mesma empresa criariam o mesmo
      // contato duas vezes: a segunda espera a primeira terminar.
      await query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`contact-import:${user.tenant_id}`]);
      const existing = await loadExisting(user.tenant_id);
      const novos: ImportEntry[] = [];
      const repetidos: Array<ImportEntry & { id: string }> = [];
      for (const entry of entries) {
        const match = matchExisting(entry, existing);
        if (match) repetidos.push({ ...entry, id: match.id });
        else novos.push(entry);
      }

      const lote = await query<{ id: string; created_at: string }>(
        `insert into contact_imports (tenant_id, user_id, file_name, source_kind, legal_basis, origin_note, on_duplicate)
         values ($1, $2, $3, $4, $5, $6, $7) returning id, created_at`,
        [user.tenant_id, user.id, input.fileName, file.kind, input.legalBasis, input.originNote, input.onDuplicate],
      );
      const importId = lote.rows[0].id;

      let created = 0;
      for (let i = 0; i < novos.length; i += LOTE) {
        const parte = novos.slice(i, i + LOTE).map((entry) => ({ ...entry, tags: [...new Set([...entry.tags, ...input.tags])] }));
        const inserted = await query(
          `insert into contacts (tenant_id, name, phone, email, company, tags, source, import_id, legal_basis)
           select $1, x.name, x.phone, x.email, x.company, array(select jsonb_array_elements_text(x.tags)), 'importacao', $2, $3
           from jsonb_to_recordset($4::jsonb) as x(name text, phone text, email text, company text, tags jsonb)
           on conflict (tenant_id, phone) do nothing
           returning id`,
          [user.tenant_id, importId, input.legalBasis, JSON.stringify(parte)],
        );
        created += inserted.rowCount ?? 0;
      }

      let updated = 0;
      if (input.onDuplicate === "update") {
        for (let i = 0; i < repetidos.length; i += LOTE) {
          const parte = repetidos.slice(i, i + LOTE).map((entry) => ({ ...entry, tags: [...new Set([...entry.tags, ...input.tags])] }));
          // Completa o que falta e soma etiquetas. Nunca troca nome, telefone ou
          // e-mail que a equipe já tinha: o arquivo pode ser mais velho que a base.
          const changed = await query(
            `update contacts c
             set email = coalesce(c.email, x.email), company = coalesce(c.company, x.company),
               tags = (select array(select distinct unnest(c.tags || array(select jsonb_array_elements_text(x.tags))))),
               legal_basis = coalesce(c.legal_basis, $3), updated_at = now()
             from jsonb_to_recordset($2::jsonb) as x(id uuid, email text, company text, tags jsonb)
             where c.tenant_id = $1 and c.id = x.id`,
            [user.tenant_id, JSON.stringify(parte), input.legalBasis],
          );
          updated += changed.rowCount ?? 0;
        }
      }

      const summary = {
        created,
        updated,
        kept: input.onDuplicate === "keep" ? repetidos.length : 0,
        // Telefone que outra linha do mesmo lote já tinha criado (formatos diferentes do mesmo número).
        skipped: novos.length - created,
        invalid: rejected.length,
        repeatedInFile,
      };
      await query("update contact_imports set created_count = $2, updated_count = $3, skipped_count = $4, invalid_count = $5 where id = $1", [
        importId,
        summary.created,
        summary.updated,
        summary.kept + summary.skipped,
        summary.invalid,
      ]);
      await deps.recordEvent(
        user.tenant_id,
        "contact",
        "contact.imported",
        { import_id: importId, file_kind: file.kind, legal_basis: input.legalBasis, ...summary },
        user.id,
        null,
        (request as FastifyRequest & { requestId?: string }).requestId,
      );
      return { importId, createdAt: lote.rows[0].created_at, summary };
    });

    return reply.code(201).send({ ...result, rejected: rejected.slice(0, 2000), undoUntil: new Date(Date.parse(result.createdAt) + UNDO_HOURS * 3600 * 1000).toISOString() });
  });

  app.get("/api/contacts/imports", async (request, reply) => {
    const user = await guard(request, reply);
    if (!user) return;
    const result = await query(
      `select i.id, i.file_name, i.source_kind, i.legal_basis, i.origin_note, i.on_duplicate, i.created_count, i.updated_count,
         i.skipped_count, i.invalid_count, i.created_at, i.undone_at, u.name as user_name,
         (i.undone_at is null and i.created_at > now() - make_interval(hours => $2)) as can_undo
       from contact_imports i left join users u on u.id = i.user_id and u.tenant_id = i.tenant_id
       where i.tenant_id = $1 order by i.created_at desc limit 20`,
      [user.tenant_id, UNDO_HOURS],
    );
    return { imports: result.rows };
  });

  /**
   * Desfaz um lote: apaga os contatos que ele criou e que ninguém tocou depois.
   *
   * Contato que já tem conversa ou negócio, ou que foi editado, fica: apagar
   * levaria junto trabalho da equipe. O que o lote só completou em contatos que
   * já existiam (e-mail, etiquetas) também fica, e a resposta diz quantos.
   */
  app.post("/api/contacts/imports/:id/undo", async (request, reply) => {
    const user = await guard(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const outcome = await transaction(async () => {
      const lote = await query<{ updated_count: number }>(
        `update contact_imports set undone_at = now()
         where id = $1 and tenant_id = $2 and undone_at is null and created_at > now() - make_interval(hours => $3)
         returning updated_count`,
        [id, user.tenant_id, UNDO_HOURS],
      );
      if (!lote.rows[0]) return null;
      const removed = await query(
        `delete from contacts c
         where c.tenant_id = $1 and c.import_id = $2 and c.updated_at = c.created_at
           and not exists (select 1 from conversations v where v.tenant_id = c.tenant_id and v.contact_id = c.id)
           and not exists (select 1 from leads l where l.tenant_id = c.tenant_id and l.contact_id = c.id)`,
        [user.tenant_id, id],
      );
      const kept = await query<{ n: number }>("select count(*)::int as n from contacts where tenant_id = $1 and import_id = $2", [user.tenant_id, id]);
      const summary = { removed: removed.rowCount ?? 0, keptInUse: kept.rows[0]?.n ?? 0, updatedNotReverted: lote.rows[0].updated_count };
      await deps.recordEvent(user.tenant_id, "contact", "contact.import_undone", { import_id: id, ...summary }, user.id, null, (request as FastifyRequest & { requestId?: string }).requestId);
      return summary;
    });
    if (!outcome) return reply.code(409).send({ error: "Esta importacao nao pode mais ser desfeita (passou de 24 horas ou ja foi desfeita)." });
    return outcome;
  });
}
