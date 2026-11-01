import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:https";
import { gunzipSync } from "node:zlib";
import { destinoLangfuseSeguro, langfuseConfigurado, rastrearIa, usoTokens, encerrarLangfuse } from "../../dist-server/langfuse.js";

test("configuração exige opt-in, HTTPS sem credenciais e bloqueia headers OTLP ambientais", () => {
  const env = { LANGFUSE_ENABLED: "true", LANGFUSE_BASE_URL: "https://langfuse.example/", LANGFUSE_PUBLIC_KEY: "public", LANGFUSE_SECRET_KEY: "secret" };
  assert.equal(langfuseConfigurado(env), true);
  assert.equal(langfuseConfigurado({}), false);
  for (const key of Object.keys(env)) assert.equal(langfuseConfigurado({ ...env, [key]: " " }), false);
  assert.equal(langfuseConfigurado({ ...env, LANGFUSE_TRACING_ENABLED: "false" }), false);
  for (const key of ["OTEL_EXPORTER_OTLP_HEADERS", "OTEL_EXPORTER_OTLP_TRACES_HEADERS"]) {
    assert.equal(langfuseConfigurado({ ...env, [key]: "Authorization=unrelated" }), false);
  }
  for (const value of ["http://example.com", "https://user:pass@example.com", "https://example.com?secret=a", "https://example.com#secret", "invalid"]) {
    assert.equal(destinoLangfuseSeguro(value), null);
  }
  assert.equal(destinoLangfuseSeguro(env.LANGFUSE_BASE_URL), "https://langfuse.example");
});

test("tokens ausentes não são estimados e valores inválidos são omitidos", () => {
  assert.deepEqual(usoTokens(10, 4), { input: 10, output: 4 });
  assert.deepEqual(usoTokens(0, 0), { input: 0, output: 0 });
  assert.deepEqual(usoTokens(), {});
  assert.deepEqual(usoTokens(-1, Infinity), {});
  assert.deepEqual(usoTokens(NaN, undefined), {});
});

test("desligado preserva identidade de resposta/erro e executa uma única vez", async () => {
  const previous = process.env.LANGFUSE_ENABLED;
  process.env.LANGFUSE_ENABLED = "false";
  try {
    let calls = 0;
    const result = { private: "do not export" };
    assert.equal(await rastrearIa("triagem", "model", async () => { calls++; return result; }), result);
    const error = new Error("private error");
    await assert.rejects(rastrearIa("triagem", "model", async () => { calls++; throw error; }), (received) => received === error);
    assert.equal(calls, 2);
  } finally {
    if (previous === undefined) delete process.env.LANGFUSE_ENABLED;
    else process.env.LANGFUSE_ENABLED = previous;
  }
});

test("exporta OTLP dos caminhos reais sem payload, áudio, IDs ou erro bruto", { timeout: 20_000 }, async () => {
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  const dir = mkdtempSync(join(tmpdir(), "crm-langfuse-"));
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  const payloads = [];
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    const body = Buffer.concat(parts);
    payloads.push((req.headers["content-encoding"] === "gzip" ? gunzipSync(body) : body).toString());
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let pool;
  let originalQuery;
  try {
    Object.assign(process.env, {
      LANGFUSE_ENABLED: "true", LANGFUSE_TRACING_ENABLED: "true",
      LANGFUSE_BASE_URL: `https://127.0.0.1:${server.address().port}`,
      LANGFUSE_PUBLIC_KEY: "public-test", LANGFUSE_SECRET_KEY: "secret-test",
      // Apenas este processo de teste usa um coletor efêmero em loopback.
      NODE_TLS_REJECT_UNAUTHORIZED: "0", IA_API_KEY: "PRIVATE-IA-KEY",
      OTEL_RESOURCE_ATTRIBUTES: "customer=PRIVATE-RESOURCE",
    });
    delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS;
    const { executar, testarConfig } = await import("../../dist-server/ai.js");
    ({ pool } = await import("../../dist-server/db.js"));
    originalQuery = pool.query;
    pool.query = async () => ({ rows: [], rowCount: 0 });
    const { transcrever } = await import("../../dist-server/transcricao.js");
    const config = { provider: "openai", baseUrl: "https://provider.invalid", model: "test-model", apiKey: "PRIVATE-API-KEY" };
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ choices: [{ message: { content: '{"text":"PRIVATE-OUTPUT"}' } }], usage: { prompt_tokens: 10, completion_tokens: 4 } });
    };
    assert.deepEqual(await executar("PRIVATE-TENANT", "PRIVATE-USER", config, "triagem", [{ role: "user", content: "PRIVATE-PROMPT" }], {}), { text: "PRIVATE-OUTPUT" });
    assert.deepEqual(await testarConfig(config), { ok: true, detail: "openai respondeu com o modelo test-model" });
    globalThis.fetch = async () => { calls++; return Response.json({ status: "concluido", resultado: { texto: "PRIVATE-TRANSCRIPT", duracao_segundos: 2 } }); };
    assert.equal((await transcrever(Buffer.from("PRIVATE-AUDIO"), "PRIVATE-CONTEXT")).texto, "PRIVATE-TRANSCRIPT");
    globalThis.fetch = async () => { calls++; return Response.json({ error: { message: "PRIVATE-ERROR" } }, { status: 429 }); };
    assert.deepEqual(await testarConfig(config), { ok: false, detail: "PRIVATE-ERROR" });
    const error = new Error("PRIVATE-EXCEPTION");
    globalThis.fetch = async () => { calls++; throw error; };
    await assert.rejects(testarConfig(config), (received) => received === error);
    assert.equal(calls, 5);
    await encerrarLangfuse();
    const spans = payloads.flatMap((body) => JSON.parse(body).resourceSpans.flatMap((resource) => resource.scopeSpans.flatMap((scope) => scope.spans)));
    assert.equal(spans.length, 5);
    assert.deepEqual(spans.map((span) => span.name), ["crm.ai.triagem", "crm.ai.teste-provedor", "crm.ai.transcricao", "crm.ai.teste-provedor", "crm.ai.teste-provedor"]);
    const attr = (span, key) => span.attributes.find((entry) => entry.key === key)?.value.stringValue;
    assert.equal(attr(spans[0], "langfuse.observation.type"), "generation");
    assert.equal(attr(spans[2], "langfuse.observation.type"), "tool");
    assert.equal(attr(spans[0], "langfuse.observation.model.name"), "test-model");
    assert.deepEqual(JSON.parse(attr(spans[0], "langfuse.observation.usage_details")), { input: 10, output: 4 });
    assert.equal(attr(spans[3], "langfuse.observation.level"), "ERROR");
    assert.equal(attr(spans[4], "langfuse.observation.level"), "ERROR");
    assert.doesNotMatch(payloads.join("\n"), /PRIVATE-|secret-test/);
  } finally {
    if (pool && originalQuery) pool.query = originalQuery;
    await encerrarLangfuse();
    globalThis.fetch = originalFetch;
    process.env = previous;
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
