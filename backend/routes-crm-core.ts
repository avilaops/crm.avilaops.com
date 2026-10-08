import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { query, transaction } from "./db.js";

type User = { id: string; tenant_id: string; role: string };
type Deps = { requireAuth: (req: FastifyRequest, rep: FastifyReply) => Promise<User | null> };
const idSchema = z.object({ id: z.string().uuid() });
const stageSchema = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#3b82f6"),
  required_fields: z.array(z.enum(["contact_id", "company_id", "assigned_user_id", "value_cents"])).default([]),
});
const pipelineSchema = z.object({ name: z.string().trim().min(1).max(120), stages: z.array(stageSchema).min(1).max(30) });
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

async function audit(user: User, type: string, id: string, action: string) {
  await query("insert into events (tenant_id, actor_user_id, entity_type, entity_id, event_type) values ($1,$2,$3,$4,$5)", [user.tenant_id, user.id, type, id, action]);
}

export function registerCrmCoreRoutes(app: FastifyInstance, { requireAuth }: Deps) {
  app.get("/api/pipelines", async (req, rep) => {
    const user = await requireAuth(req, rep); if (!user) return;
    const rows = await query("select p.*, coalesce(jsonb_agg(s order by s.position) filter (where s.id is not null), '[]') as stages from pipelines p left join pipeline_stages s on s.pipeline_id = p.id where p.tenant_id = $1 group by p.id order by p.created_at", [user.tenant_id]);
    return { pipelines: rows.rows };
  });

  for (const method of ["POST", "PUT"] as const) app.route({ method, url: method === "POST" ? "/api/pipelines" : "/api/pipelines/:id", handler: async (req, rep) => {
    const user = await requireAuth(req, rep); if (!user) return;
    if (!["admin", "gerente", "manager"].includes(user.role)) return rep.code(403).send({ error: "Permissao insuficiente." });
    const body = pipelineSchema.parse(req.body);
    const ids = body.stages.flatMap(s => s.id ? [s.id] : []);
    if (new Set(ids).size !== ids.length) throw fail("Etapas duplicadas.");
    const pipeline = await transaction(async () => {
      let id: string;
      if (method === "POST") {
        if (ids.length) throw fail("Um novo funil deve conter novas etapas.");
        const created = await query<{ id: string }>("insert into pipelines(tenant_id,name) values($1,$2) returning id", [user.tenant_id, body.name]);
        id = created.rows[0].id;
      } else {
        id = idSchema.parse(req.params).id;
        const exists = await query("select id from pipelines where tenant_id=$1 and id=$2 for update", [user.tenant_id, id]);
        if (!exists.rowCount) throw fail("Funil nao encontrado.", 404);
        const old = await query<{ id: string }>("select id from pipeline_stages where pipeline_id=$1 for update", [id]);
        if (ids.some(stage => !old.rows.some(row => row.id === stage))) throw fail("Etapa nao pertence ao funil.");
        const removed = old.rows.filter(row => !ids.includes(row.id)).map(row => row.id);
        const used = await query("select id from leads where tenant_id=$1 and stage_id=any($2::uuid[]) limit 1", [user.tenant_id, removed]);
        if (used.rowCount) throw fail("Mova as oportunidades antes de excluir uma etapa.", 409);
        await query("delete from pipeline_stages where pipeline_id=$1 and id=any($2::uuid[])", [id, removed]);
        await query("update pipelines set name=$3 where tenant_id=$1 and id=$2", [user.tenant_id, id, body.name]);
        // Free positive positions before reorder to respect the unique constraint.
        await query("update pipeline_stages set position=-position-1000 where pipeline_id=$1", [id]);
      }
      for (const [position, stage] of body.stages.entries()) {
        if (stage.id) await query("update pipeline_stages set name=$3,color=$4,position=$5,required_fields=$6 where pipeline_id=$1 and id=$2", [id, stage.id, stage.name, stage.color, position, stage.required_fields]);
        else await query("insert into pipeline_stages(pipeline_id,name,color,position,required_fields) values($1,$2,$3,$4,$5)", [id, stage.name, stage.color, position, stage.required_fields]);
      }
      await audit(user, "pipeline", id, method === "POST" ? "pipeline.created" : "pipeline.updated");
      const stages = await query("select * from pipeline_stages where pipeline_id=$1 order by position", [id]);
      return { id, name: body.name, stages: stages.rows };
    });
    return rep.code(method === "POST" ? 201 : 200).send({ pipeline });
  }});

  app.delete("/api/pipelines/:id", async (req, rep) => {
    const user = await requireAuth(req, rep); if (!user) return;
    if (!["admin", "gerente", "manager"].includes(user.role)) throw fail("Permissao insuficiente.", 403);
    const { id } = idSchema.parse(req.params);
    await transaction(async () => {
      const exists = await query("select id from pipelines where tenant_id=$1 and id=$2 for update", [user.tenant_id,id]);
      if (!exists.rowCount) throw fail("Funil nao encontrado.",404);
      const used = await query("select l.id from leads l join pipeline_stages s on s.id=l.stage_id where l.tenant_id=$1 and s.pipeline_id=$2 limit 1", [user.tenant_id,id]);
      if (used.rowCount) throw fail("Mova as oportunidades antes de excluir o funil.",409);
      await query("delete from pipelines where tenant_id=$1 and id=$2", [user.tenant_id,id]);
      await audit(user,"pipeline",id,"pipeline.deleted");
    });
    return { ok: true };
  });

  app.get("/api/leads/:id/timeline", async (req, rep) => {
    const user = await requireAuth(req, rep); if (!user) return;
    const { id } = idSchema.parse(req.params);
    const lead = await query("select * from leads where tenant_id=$1 and id=$2", [user.tenant_id,id]);
    if (!lead.rowCount) throw fail("Oportunidade nao encontrada.",404);
    const events = await query("select id,event_type,payload,created_at from events where tenant_id=$1 and entity_id=$2 order by created_at desc limit 100", [user.tenant_id,id]);
    const tasks = await query("select * from tasks where tenant_id=$1 and lead_id=$2 order by due_at nulls last limit 100", [user.tenant_id,id]);
    return { lead: lead.rows[0], events: events.rows, tasks: tasks.rows };
  });

  app.get("/api/companies/:id", async (req, rep) => {
    const user = await requireAuth(req, rep); if (!user) return;
    const { id } = idSchema.parse(req.params);
    const company = await query("select * from companies where tenant_id=$1 and id=$2", [user.tenant_id,id]);
    if (!company.rowCount) throw fail("Empresa nao encontrada.",404);
    const contacts = await query("select id,name,email,phone from contacts where tenant_id=$1 and company_id=$2 order by name limit 100", [user.tenant_id,id]);
    const leads = await query("select id,title,value_cents,status from leads where tenant_id=$1 and company_id=$2 order by updated_at desc limit 100", [user.tenant_id,id]);
    return { company: company.rows[0], contacts: contacts.rows, leads: leads.rows };
  });

  app.get("/api/tasks/reminders", async (req, rep) => {
    const user = await requireAuth(req, rep); if (!user) return;
    const tasks = await query("select * from tasks where tenant_id=$1 and assigned_user_id=$2 and status='open' and reminder_at <= now() and reminder_dismissed_at is null order by reminder_at limit 100", [user.tenant_id,user.id]);
    return { tasks: tasks.rows };
  });
  app.post("/api/tasks/:id/dismiss-reminder", async (req, rep) => {
    const user = await requireAuth(req, rep); if (!user) return;
    const { id } = idSchema.parse(req.params);
    const result = await query("update tasks set reminder_dismissed_at=now() where tenant_id=$1 and id=$2 and assigned_user_id=$3 returning id", [user.tenant_id,id,user.id]);
    if (!result.rowCount) throw fail("Lembrete nao encontrado.",404);
    return { ok:true };
  });
}
