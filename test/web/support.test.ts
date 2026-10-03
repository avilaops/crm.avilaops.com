import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSupportContact } from '../../src/lib/supportConfig'

test('contato ausente ou inválido não gera destino assistido', () => {
  assert.deepEqual(parseSupportContact(), { whatsapp: null, email: null })
  for (const phone of ['abc12345678', '+5517997149702', '0', '1234567890123456']) assert.equal(parseSupportContact(phone).whatsapp, null)
  for (const email of ['a@b.com?bcc=evil@example.com', 'a@b.com\r\nBcc:x@y.com', 'a@b.com,evil@example.com', 'invalid']) assert.equal(parseSupportContact(undefined, email).email, null)
  assert.deepEqual(parseSupportContact('5517997149702', ' suporte@example.com '), { whatsapp: '5517997149702', email: 'suporte@example.com' })
});
