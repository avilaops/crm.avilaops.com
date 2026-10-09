import assert from "node:assert/strict";
import test from "node:test";

const { CONVITE_DESLIGADO, convidarPelaContaAvila, entradaDoCrm } = await import("../../dist-server/auth-convite.js");

const original = globalThis.fetch;
const env = { ...process.env };
const NOMES = ["AUTH_META_CLIENT_ID", "AUTH_META_CLIENT_SECRET", "SSO_BASE_URL", "CRM_BASE_URL"];

function comAuth(resposta) {
  const chamadas = [];
  process.env.AUTH_META_CLIENT_ID = "crm";
  process.env.AUTH_META_CLIENT_SECRET = "segredo-de-teste";
  process.env.SSO_BASE_URL = "https://auth.exemplo.test/";
  process.env.CRM_BASE_URL = "https://crm.exemplo.test/";
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), method: init?.method, headers: init?.headers ?? {}, body: JSON.parse(init?.body ?? "null") });
    return resposta();
  };
  return chamadas;
}

const json = (status, corpo) => () => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

test.afterEach(() => {
  globalThis.fetch = original;
  for (const nome of NOMES) {
    if (env[nome] === undefined) delete process.env[nome];
    else process.env[nome] = env[nome];
  }
});

const pedido = { email: " Ana@Empresa.Test ", nome: "Ana Souza", empresa: "Acme", slugDaEmpresa: "acme", convidadoPor: "Rogerio" };

test("sem credencial o convite fica pendente e ninguem e chamado", async () => {
  delete process.env.AUTH_META_CLIENT_ID;
  delete process.env.AUTH_META_CLIENT_SECRET;
  let chamou = false;
  globalThis.fetch = async () => {
    chamou = true;
    return new Response("{}");
  };
  assert.deepEqual(await convidarPelaContaAvila(pedido), { status: "pendente", detalhe: CONVITE_DESLIGADO });
  assert.equal(chamou, false);
});

test("pede o convite com Basic, e-mail em minusculas e a entrada do CRM ja na empresa", async () => {
  const chamadas = comAuth(json(201, { email: "ana@empresa.test", criada: true, convite: null, envio: "enviado" }));
  assert.deepEqual(await convidarPelaContaAvila(pedido), { status: "enviado", detalhe: "com o endereco para criar a senha" });

  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, "https://auth.exemplo.test/api/provisionamento/acessos");
  assert.equal(chamadas[0].method, "POST");
  assert.equal(chamadas[0].headers.authorization, `Basic ${Buffer.from("crm:segredo-de-teste").toString("base64")}`);
  assert.deepEqual(chamadas[0].body, {
    email: "ana@empresa.test",
    nome: "Ana Souza",
    enviarConvite: true,
    empresa: "Acme",
    convidadoPor: "Rogerio",
    destino: "https://crm.exemplo.test/api/auth/sso?tenantSlug=acme",
  });
});

test("quem ja tinha conta recebe so o endereco do sistema", async () => {
  comAuth(json(200, { criada: false, convite: null, envio: "enviado" }));
  assert.deepEqual(await convidarPelaContaAvila(pedido), { status: "enviado", detalhe: "a pessoa ja tinha conta Avila Ops" });
});

test("e-mail que nao saiu vira falha com o motivo, e o endereco da senha nunca aparece", async () => {
  const link = "https://auth.exemplo.test/recuperar/abc123";
  for (const envio of ["sem_email", "limite", "falhou", "outro"]) {
    comAuth(json(201, { criada: true, convite: link, envio }));
    const resultado = await convidarPelaContaAvila(pedido);
    assert.equal(resultado.status, "falhou");
    assert.ok(resultado.detalhe.length > 0 && !JSON.stringify(resultado).includes("recuperar"));
  }
});

test("recusas do auth: credencial, conta desligada, erro e rede", async () => {
  comAuth(json(401, { error: "Cliente ou segredo invalidos." }));
  assert.match((await convidarPelaContaAvila(pedido)).detalhe, /recusou a credencial/);

  comAuth(json(409, { error: "Esta conta esta desligada no login unico." }));
  assert.deepEqual(await convidarPelaContaAvila(pedido), { status: "falhou", detalhe: "Esta conta esta desligada no login unico." });

  comAuth(json(500, {}));
  assert.match((await convidarPelaContaAvila(pedido)).detalhe, /respondeu 500/);

  comAuth(() => {
    throw new Error("sem rede");
  });
  assert.equal((await convidarPelaContaAvila(pedido)).status, "falhou");
});

test("a entrada do CRM leva o codigo da empresa escapado", () => {
  process.env.CRM_BASE_URL = "https://crm.exemplo.test";
  assert.equal(entradaDoCrm("minha loja"), "https://crm.exemplo.test/api/auth/sso?tenantSlug=minha%20loja");
});
