import assert from "node:assert/strict";
import test from "node:test";

const { OAUTH_STATE_TTL_MS, signOAuthState, verifyOAuthState } = await import("../../dist-server/oauth-state.js");

const chave = "chave-de-teste-com-pelo-menos-32-caracteres";
const sessao = "hash-da-sessao-que-comecou";
const agora = Date.UTC(2026, 9, 2, 12, 0, 0);

test("state assinado confere na volta, com a mesma sessão", () => {
  const state = signOAuthState(chave, "google", sessao, agora);
  assert.equal(verifyOAuthState(chave, "google", state, sessao, agora + 60_000), true);
});

test("state de outra sessão não confere: o link de retorno forjado não liga a conta", () => {
  const state = signOAuthState(chave, "google", "sessao-de-quem-forjou", agora);
  assert.equal(verifyOAuthState(chave, "google", state, sessao, agora), false);
});

test("state vencido, adulterado ou de outro propósito não confere", () => {
  const state = signOAuthState(chave, "google", sessao, agora);
  assert.equal(verifyOAuthState(chave, "google", state, sessao, agora + OAUTH_STATE_TTL_MS + 1), false);

  const [nonce, expira, mac] = state.split(".");
  assert.equal(verifyOAuthState(chave, "google", `${nonce}.${Number(expira) + 3_600_000}.${mac}`, sessao, agora), false);
  assert.equal(verifyOAuthState(chave, "google", `${nonce}.${expira}.${mac.slice(0, -2)}00`, sessao, agora), false);
  assert.equal(verifyOAuthState(chave, "microsoft", state, sessao, agora), false);
  assert.equal(verifyOAuthState("outra-chave-com-pelo-menos-32-caracteres", "google", state, sessao, agora), false);
});

test("o id do tenant, que era o state antigo, não passa", () => {
  assert.equal(verifyOAuthState(chave, "google", "11111111-1111-4111-8111-111111111111", sessao, agora), false);
  assert.equal(verifyOAuthState(chave, "google", "", sessao, agora), false);
  assert.equal(verifyOAuthState(chave, "google", "a.b.c.d", sessao, agora), false);
});


test("state malformado Unicode e validade limite são rejeitados sem lançar", () => {
  const state = signOAuthState(chave, "google", sessao, agora);
  const [nonce, expires] = state.split(".");
  assert.equal(verifyOAuthState(chave, "google", `${nonce}.${expires}.${"é".repeat(64)}`, sessao, agora), false);
  assert.equal(verifyOAuthState(chave, "google", state, sessao, agora + OAUTH_STATE_TTL_MS), false);
  assert.equal(verifyOAuthState(chave, "google", state, sessao, agora - 1), false);
});
