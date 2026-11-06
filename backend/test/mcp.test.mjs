import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import Fastify from "fastify";
import { registerMcpRoutes } from "../../dist-server/routes-mcp.js";
const token = "test-only-credential-".repeat(3);
const tenantId = "c94252fd-b204-4512-80cb-52d522269e1e";
async function fixture(t, options = {}) {
  const calls = [];
  const app = Fastify();
  registerMcpRoutes(app, {
    requireAuth: async (_request, reply) => { if (options.user) return options.user; reply.code(401).send({ error: "authentication_required" }); return null; },
    config: () => ({ tokenHash: createHash("sha256").update(token).digest("hex"), tenantId, origin: "https://crm.avilaops.com", ...options.config }),
    query: async (sql, params) => { calls.push({ sql, params }); if (options.fail) throw new Error("database-password-secret"); return { rows: [] }; },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  t.after(() => app.close());
  const url = "http://127.0.0.1:" + app.server.address().port + "/mcp";
  const rpc = (method, params = {}, headers = {}) => fetch(url, { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return { calls, rpc, url };
}
test("MCP initialize and tools/list expose only four read-only tools", async t => {
  const { rpc } = await fixture(t);
  const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  assert.equal(init.status, 200);
  assert.equal((await init.json()).result.serverInfo.name, "avila-crm");
  const tools = (await (await rpc("tools/list")).json()).result.tools;
  assert.equal(tools.length, 4);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
});
test("missing/wrong credential, disabled config and foreign origin never reach DB", async t => {
  const { rpc, calls, url } = await fixture(t);
  assert.equal((await rpc("tools/list", {}, { authorization: "" })).status, 401);
  assert.equal((await rpc("tools/list", {}, { authorization: "Bearer " + "x".repeat(50) })).status, 401);
  assert.equal((await rpc("tools/list", {}, { origin: "https://other.example" })).status, 403);
  assert.equal((await fetch(url, { headers: { authorization: "Bearer " + token } })).status, 405);
  assert.equal(calls.length, 0);
  const disabled = await fixture(t, { config: { tokenHash: undefined } });
  assert.equal((await disabled.rpc("tools/list")).status, 503);
});
test("every tool scopes SQL to credential tenant and pagination is parameterized", async t => {
  const { rpc, calls } = await fixture(t);
  for (const [name, args] of [
    ["crm_search_contacts", { search: "';drop table contacts;--", limit: 10, offset: 20 }],
    ["crm_get_contact", { contact_id: tenantId }],
    ["crm_list_conversations", { contact_id: tenantId }],
    ["crm_list_messages", { conversation_id: tenantId }],
  ]) {
    const r = await rpc("tools/call", { name, arguments: args });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).result.isError, undefined);
    assert.equal(calls.at(-1).params[0], tenantId);
    assert.match(calls.at(-1).sql, /tenant_id = \$1/);
    assert.ok(!calls.at(-1).sql.includes("drop table"));
  }
  assert.deepEqual(calls[0].params.slice(-2), [10, 20]);
});
test("foreign tenant argument and invalid pagination are rejected before SQL", async t => {
  const { rpc, calls } = await fixture(t);
  for (const args of [{ tenant_id: "other" }, { limit: 101 }, { offset: -1 }]) {
    const r = await (await rpc("tools/call", { name: "crm_search_contacts", arguments: args })).json();
    assert.ok(r.error || r.result?.isError);
  }
  assert.equal(calls.length, 0);
});
test("database errors return a bounded tool error without internal secrets", async t => {
  const { rpc } = await fixture(t, { fail: true });
  const r = await rpc("tools/call", { name: "crm_search_contacts", arguments: {} });
  const body = await r.text();
  assert.equal(JSON.parse(body).result.isError, true);
  assert.ok(!body.includes("database-password-secret"));
});

test("credential retrieval requires an administrator in exactly the configured tenant", async t => {
  const previous = process.env.CRM_MCP_TOKEN;
  process.env.CRM_MCP_TOKEN = token;
  t.after(() => { if (previous === undefined) delete process.env.CRM_MCP_TOKEN; else process.env.CRM_MCP_TOKEN = previous; });
  for (const [user, status] of [
    [undefined, 401],
    [{ role: "manager", tenant_id: tenantId }, 403],
    [{ role: "admin", tenant_id: "other" }, 403],
    [{ role: "admin", tenant_id: tenantId }, 200],
  ]) {
    const { url } = await fixture(t, { user });
    const response = await fetch(url.replace("/mcp", "/api/integrations/mcp/credential"));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    if (status === 200) assert.equal(data.token, token);
    else assert.equal(data.token, undefined);
  }
});
