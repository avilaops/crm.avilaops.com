import assert from "node:assert/strict";
import test from "node:test";

const { AuthMetaError, buscarConexaoMeta, canaisDeAtivos, paginaDaMeta, precisaRenovar } = await import("../../dist-server/auth-meta.js");

const original = globalThis.fetch;
const env = { ...process.env };

function comAuth(resposta) {
  const chamadas = [];
  process.env.AUTH_META_CLIENT_ID = "crm";
  process.env.AUTH_META_CLIENT_SECRET = "segredo-de-teste";
  process.env.SSO_BASE_URL = "https://auth.exemplo.test/";
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), headers: init?.headers ?? {} });
    return resposta();
  };
  return chamadas;
}

test.afterEach(() => {
  globalThis.fetch = original;
  for (const nome of ["AUTH_META_CLIENT_ID", "AUTH_META_CLIENT_SECRET", "SSO_BASE_URL"]) {
    if (env[nome] === undefined) delete process.env[nome];
    else process.env[nome] = env[nome];
  }
});

const conexao = {
  conta: { id: "c1", email: "dono@loja.test" },
  meta: { usuarioId: "fb1", nome: "Dona da Loja", escopos: ["whatsapp_business_management"], expiraEm: "2026-12-01T00:00:00.000Z" },
  token: "token-de-teste",
  ativos: [],
};

test("busca a conexão com Basic do CRM e o e-mail em minúsculas", async () => {
  const chamadas = comAuth(() => Response.json(conexao));
  const lida = await buscarConexaoMeta("  Dono@Loja.test ");
  assert.equal(lida.token, "token-de-teste");
  assert.equal(lida.meta.nome, "Dona da Loja");
  assert.equal(chamadas[0].url, "https://auth.exemplo.test/api/meta/ativos?email=dono%40loja.test");
  assert.equal(chamadas[0].headers.authorization, `Basic ${Buffer.from("crm:segredo-de-teste").toString("base64")}`);
  assert.equal(paginaDaMeta(), "https://auth.exemplo.test/conta/meta");
});

test("cada resposta do auth vira um código que a tela sabe explicar", async () => {
  for (const [status, codigo] of [[404, "nao_conectada"], [409, "vencida"], [401, "nao_configurado"], [403, "nao_configurado"], [429, "indisponivel"], [503, "indisponivel"]]) {
    comAuth(() => Response.json({ error: "x" }, { status }));
    await assert.rejects(buscarConexaoMeta("dono@loja.test"), (erro) => erro instanceof AuthMetaError && erro.codigo === codigo, `status ${status}`);
  }
});

test("rede fora, resposta sem token e ambiente sem credencial não passam por conexão", async () => {
  comAuth(() => { throw new Error("ECONNREFUSED"); });
  await assert.rejects(buscarConexaoMeta("dono@loja.test"), { codigo: "indisponivel" });

  comAuth(() => Response.json({ ...conexao, token: "" }));
  await assert.rejects(buscarConexaoMeta("dono@loja.test"), { codigo: "indisponivel" });

  const chamadas = comAuth(() => Response.json(conexao));
  delete process.env.AUTH_META_CLIENT_SECRET;
  await assert.rejects(buscarConexaoMeta("dono@loja.test"), { codigo: "nao_configurado", status: 503 });
  assert.equal(chamadas.length, 0);
});

test("um canal por número, com o rótulo só quando as listas casam", () => {
  const ativos = [
    { tipo: "pagina", externoId: "p1", nome: "Página", detalhe: null, token: "t" },
    { tipo: "whatsapp", externoId: "waba1", nome: "Loja", detalhe: { negocio: "Loja Ltda", numeros: "+55 16 99234-0000, +55 16 3333-0000", numeroIds: "111,222" }, token: null },
    { tipo: "whatsapp", externoId: "waba2", nome: "Filial", detalhe: { numeros: "+55 11 90000-0000", numeroIds: "333,444" }, token: null },
    { tipo: "whatsapp", externoId: "waba3", nome: "Sem número", detalhe: { numeros: null, numeroIds: null }, token: null },
    { tipo: "whatsapp", externoId: "waba4", nome: "Sem telefone", detalhe: { numeros: "555", numeroIds: "555" }, token: null },
  ];
  assert.deepEqual(canaisDeAtivos(ativos), [
    { numeroId: "111", numero: "+55 16 99234-0000", wabaId: "waba1", wabaNome: "Loja", negocio: "Loja Ltda" },
    { numeroId: "222", numero: "+55 16 3333-0000", wabaId: "waba1", wabaNome: "Loja", negocio: "Loja Ltda" },
    { numeroId: "333", numero: null, wabaId: "waba2", wabaNome: "Filial", negocio: null },
    { numeroId: "444", numero: null, wabaId: "waba2", wabaNome: "Filial", negocio: null },
    { numeroId: "555", numero: null, wabaId: "waba4", wabaNome: "Sem telefone", negocio: null },
  ]);
  assert.deepEqual(canaisDeAtivos([]), []);
});

test("renova em segundo plano com o token válido e espera só quando ele venceu", () => {
  const agora = Date.UTC(2026, 9, 8, 12, 0, 0);
  const haUmaHora = new Date(agora - 60 * 60 * 1000).toISOString();
  const ontem = new Date(agora - 24 * 60 * 60 * 1000).toISOString();
  const futuro = new Date(agora + 30 * 24 * 60 * 60 * 1000).toISOString();
  const doAuth = { origem: "auth", auth_email: "dono@loja.test" };

  assert.equal(precisaRenovar({ ...doAuth, sincronizado_em: haUmaHora }, futuro, agora), "nao");
  assert.equal(precisaRenovar({ ...doAuth, sincronizado_em: ontem }, futuro, agora), "segundo_plano");
  assert.equal(precisaRenovar(doAuth, futuro, agora), "segundo_plano");
  assert.equal(precisaRenovar({ ...doAuth, sincronizado_em: haUmaHora }, ontem, agora), "agora");
  // Conexão antiga do próprio CRM, ou sem conexão: nunca vai ao auth.
  assert.equal(precisaRenovar({ meta_user_id: "fb1" }, ontem, agora), "nao");
  assert.equal(precisaRenovar(null, null, agora), "nao");
  // O auth já disse que caiu: quem resolve é a pessoa, não uma nova tentativa.
  assert.equal(precisaRenovar({ ...doAuth, auth_estado: "vencida", sincronizado_em: ontem }, null, agora), "nao");
});
