import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * `state` de OAuth amarrado à sessão que começou o fluxo.
 *
 * O formato é `<nonce>.<expira-em-ms>.<hmac>`, com o HMAC sobre o propósito
 * ("google"), o hash do token da sessão, o nonce e a validade. Não guarda nada
 * no servidor — vale com mais de uma instância — e só confere na volta se o
 * navegador trouxer a mesma sessão: um link de retorno forjado por outra pessoa
 * não passa, nem um `state` copiado de outra sessão, nem um vencido.
 */

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function mac(key: Buffer | string, purpose: string, sessionHash: string, nonce: string, expiresAt: number) {
  return createHmac("sha256", key).update(`${purpose}:${sessionHash}:${nonce}:${expiresAt}`).digest("hex");
}

export function signOAuthState(key: Buffer | string, purpose: string, sessionHash: string, now = Date.now()) {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = now + OAUTH_STATE_TTL_MS;
  return `${nonce}.${expiresAt}.${mac(key, purpose, sessionHash, nonce, expiresAt)}`;
}

export function verifyOAuthState(key: Buffer | string, purpose: string, state: string, sessionHash: string, now = Date.now()) {
  const [nonce, expiresAtRaw, received, ...rest] = state.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (rest.length > 0 || !/^[a-f0-9]{32}$/.test(nonce ?? "") || !/^[a-f0-9]{64}$/.test(received ?? "") || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + OAUTH_STATE_TTL_MS) return false;
  const expected = mac(key, purpose, sessionHash, nonce, expiresAt);
  // `timingSafeEqual` lança com tamanhos diferentes; conferir antes.
  return expected.length === received.length && timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
}

