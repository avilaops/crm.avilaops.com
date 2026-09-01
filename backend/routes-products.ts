import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { query } from "./db.js";

type AuthUser = { id: string; tenant_id: string; name: string; email: string; role: string };

type Dependencies = {
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>;
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

export type Product = {
  id: string;
  tenant_id: string;
  name: string;
  sku: string | null;
  category: string;
  price_cents: number;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const ProductInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  sku: z.string().trim().max(100).nullable().optional(),
  category: z.string().trim().max(100).default("Geral"),
  price_cents: z.number().int().min(0).default(0),
  description: z.string().trim().max(2000).nullable().optional(),
  active: z.boolean().default(true),
});

export function registerProductRoutes(app: FastifyInstance, deps: Dependencies) {
  const { requireAuth, recordEvent } = deps;

  // Listar produtos
  app.get("/api/products", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const schema = z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      active: z.enum(["true", "false", "all"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    });

    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).send({ error: "Parâmetros inválidos.", details: parsed.error.issues });
      return;
    }

    const { search, category, active = "all", page, pageSize } = parsed.data;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [user.tenant_id];

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      conditions.push(`(lower(name) like $${params.length} or lower(sku) like $${params.length} or lower(description) like $${params.length})`);
    }

    if (category && category.trim()) {
      params.push(category.trim());
      conditions.push(`category = $${params.length}`);
    }

    if (active === "true") {
      conditions.push("active = true");
    } else if (active === "false") {
      conditions.push("active = false");
    }

    const whereClause = conditions.join(" and ");

    const [totalResult, listResult, categoriesResult] = await Promise.all([
      query<{ count: string }>(`select count(*)::text as count from products where ${whereClause}`, params),
      query<Product>(
        `select * from products where ${whereClause} order by name asc limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, offset],
      ),
      query<{ category: string; total: string }>(
        `select category, count(*)::text as total from products where tenant_id = $1 group by category order by category asc`,
        [user.tenant_id],
      ),
    ]);

    const total = Number(totalResult.rows[0]?.count ?? 0);

    return {
      products: listResult.rows,
      categories: categoriesResult.rows.map((r) => ({ name: r.category, total: Number(r.total) })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  });

  // Criar produto
  app.post("/api/products", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const parsed = ProductInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Dados inválidos.", details: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const result = await query<Product>(
      `insert into products (tenant_id, name, sku, category, price_cents, description, active)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [user.tenant_id, data.name, data.sku ?? null, data.category, data.price_cents, data.description ?? null, data.active],
    );

    const product = result.rows[0];
    await recordEvent(user.tenant_id, "product", "product_created", { product_id: product.id, name: product.name }, user.id, product.id);

    reply.code(201).send({ product });
  });

  // Atualizar produto
  app.put("/api/products/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      reply.code(400).send({ error: "ID de produto inválido." });
      return;
    }

    const parsed = ProductInputSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Dados inválidos.", details: parsed.error.issues });
      return;
    }

    const existing = await query<Product>("select * from products where id = $1 and tenant_id = $2", [
      paramsParsed.data.id,
      user.tenant_id,
    ]);

    if (!existing.rows[0]) {
      reply.code(404).send({ error: "Produto não encontrado." });
      return;
    }

    const data = parsed.data;

    const updated = await query<Product>(
      `update products
       set name = coalesce($3, name),
           sku = coalesce($4, sku),
           category = coalesce($5, category),
           price_cents = coalesce($6, price_cents),
           description = coalesce($7, description),
           active = coalesce($8, active),
           updated_at = now()
       where id = $1 and tenant_id = $2
       returning *`,
      [
        paramsParsed.data.id,
        user.tenant_id,
        data.name,
        data.sku,
        data.category,
        data.price_cents,
        data.description,
        data.active,
      ],
    );

    const product = updated.rows[0];
    await recordEvent(user.tenant_id, "product", "product_updated", { product_id: product.id, name: product.name }, user.id, product.id);

    return { product };
  });

  // Excluir produto
  app.delete("/api/products/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      reply.code(400).send({ error: "ID de produto inválido." });
      return;
    }

    const result = await query<{ id: string; name: string }>(
      `delete from products where id = $1 and tenant_id = $2 returning id, name`,
      [paramsParsed.data.id, user.tenant_id],
    );

    if (!result.rows[0]) {
      reply.code(404).send({ error: "Produto não encontrado." });
      return;
    }

    await recordEvent(user.tenant_id, "product", "product_deleted", { product_id: result.rows[0].id, name: result.rows[0].name }, user.id, result.rows[0].id);

    return { success: true };
  });
}

