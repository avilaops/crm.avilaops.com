import assert from "node:assert/strict";
import test from "node:test";

// O motor de automação envia sem ninguém olhando. Estes testes cobrem as
// funções puras que ele usa no caminho do envio — token, render e leitura de
// retorno —, que são exatamente as que, quebrando em silêncio, colocam e-mail
// errado na rua.
process.env.NEWSLETTER_SECRET = "segredo-de-teste-com-mais-de-16-caracteres";
process.env.NEWSLETTER_PUBLIC_BASE_URL = "https://crm.exemplo.test";

const {
  normalizeEmail,
  parseContactList,
  renderCampaign,
  signupToken,
  unsubscribeToken,
  verifySignupToken,
  verifyUnsubscribeToken,
  UNSUBSCRIBE_PLACEHOLDER,
} = await import("../../dist-server/newsletter.js");
const { extrairEnderecoDeRetorno } = await import("../../dist-server/automation.js");

test("normalizeEmail aceita endereço válido e recusa o resto", () => {
  assert.equal(normalizeEmail("  Nicolas@AvilaOps.com "), "nicolas@avilaops.com");
  assert.equal(normalizeEmail("mailto:contato@empresa.com.br"), "contato@empresa.com.br");
  assert.equal(normalizeEmail("sem-arroba"), null);
  assert.equal(normalizeEmail("dois@@arrobas.com"), null);
  assert.equal(normalizeEmail(42), null);
});

test("parseContactList entende linha, vírgula e Nome <email>, sem repetir", () => {
  const lista = parseContactList("um@a.com\nDois Nomes <dois@b.com.br>, um@a.com\n\n; tres@c.com");
  assert.deepEqual(
    lista.map((contato) => contato.email),
    ["um@a.com", "dois@b.com.br", "tres@c.com"],
  );
  assert.equal(lista[1].name, "Dois Nomes");
  assert.equal(lista[0].name, null);
});

test("token de descadastro volta o endereço e resiste a adulteração", () => {
  const token = unsubscribeToken("Cliente@Empresa.com");
  assert.equal(verifyUnsubscribeToken(token), "cliente@empresa.com");
  assert.equal(verifyUnsubscribeToken(`${token}x`), null);
  assert.equal(verifyUnsubscribeToken("qualquer.coisa.aqui"), null);
  assert.equal(verifyUnsubscribeToken(undefined), null);
});

test("token de inscrição não vale como descadastro, nem o contrário", () => {
  const inscricao = signupToken("novo@cliente.com");
  const descadastro = unsubscribeToken("novo@cliente.com");

  assert.equal(verifySignupToken(inscricao), "novo@cliente.com");
  assert.equal(verifySignupToken(descadastro), null);
  assert.equal(verifyUnsubscribeToken(inscricao), null);
});

test("campanha em HTML troca o marcador pelo link do destinatário", () => {
  const { html } = renderCampaign(
    { subject: "Assunto", preview_text: "", format: "html", html: `<p>Oi</p><a href="${UNSUBSCRIBE_PLACEHOLDER}">sair</a>`, body_text: null, image_url: null, image_alt: null, image_link_url: null },
    "https://crm.exemplo.test/nl/descadastro?token=abc",
  );
  assert.ok(html.includes("https://crm.exemplo.test/nl/descadastro?token=abc"));
  assert.ok(!html.includes(UNSUBSCRIBE_PLACEHOLDER));
});

test("HTML sem marcador ganha rodapé de descadastro assim mesmo", () => {
  const { html } = renderCampaign(
    { subject: "Assunto", preview_text: "", format: "html", html: "<p>Sem rodapé</p>", body_text: null, image_url: null, image_alt: null, image_link_url: null },
    "https://crm.exemplo.test/nl/descadastro?token=xyz",
  );
  assert.ok(html.includes("Cancelar inscrição"));
  assert.ok(html.includes("token=xyz"));
});

test("mensagem em texto vira parágrafos e mantém o link no corpo alternativo", () => {
  const { html, text } = renderCampaign(
    { subject: "Assunto", preview_text: "prévia", format: "text", html: null, body_text: "Primeiro.\n\nSegundo.", image_url: null, image_alt: null, image_link_url: null },
    "https://crm.exemplo.test/nl/descadastro?token=t",
  );
  assert.equal(html.match(/<p /g).length, 2);
  assert.ok(text.includes("Cancelar inscrição: https://crm.exemplo.test/nl/descadastro?token=t"));
});

test("campanha de imagem envolve a arte no link quando há destino", () => {
  const { html } = renderCampaign(
    { subject: "Promo", preview_text: "", format: "image", html: null, body_text: null, image_url: "https://crm.exemplo.test/nl/img/a.png", image_alt: "Arte", image_link_url: "https://avilaops.com" },
    "https://crm.exemplo.test/nl/descadastro?token=t",
  );
  assert.ok(html.includes('<a href="https://avilaops.com"'));
  assert.ok(html.includes('alt="Arte"'));
});

test("retorno de entrega devolve o destinatário que falhou, não a própria caixa", () => {
  const relatorio = [
    "Your message wasn't delivered to fulano@clienteinexistente.com.br",
    "Reporting-MTA: dns; smtp.porkbun.com",
    "Final-Recipient: rfc822; fulano@clienteinexistente.com.br",
    "Action: failed",
  ].join("\n");

  assert.equal(
    extrairEnderecoDeRetorno(relatorio, ["nicolas@avilaops.com"]),
    "fulano@clienteinexistente.com.br",
  );
});

test("retorno sem Final-Recipient cai no endereço citado no corpo", () => {
  const corpo = "A mensagem para <outro@dominio.com> nao pode ser entregue.";
  assert.equal(extrairEnderecoDeRetorno(corpo, ["nicolas@avilaops.com"]), "outro@dominio.com");
});

test("retorno que cita apenas a própria caixa não descadastra ninguém", () => {
  const corpo = "Final-Recipient: rfc822; nicolas@avilaops.com";
  assert.equal(extrairEnderecoDeRetorno(corpo, ["nicolas@avilaops.com"]), null);
});
