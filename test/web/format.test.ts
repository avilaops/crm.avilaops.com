import assert from 'node:assert/strict'
import test from 'node:test'
import { digitsOnly, formatPhoneBR } from '../../src/lib/format'

test('telefone brasileiro em E.164 vira (DDD) número', () => {
  assert.equal(formatPhoneBR('+5516992348303'), '(16) 99234-8303')
  assert.equal(formatPhoneBR('+55 17 99105-3597'), '(17) 99105-3597')
  assert.equal(formatPhoneBR('5511987654321'), '(11) 98765-4321')
})

test('fixo, número sem código do país e DDD 55 também', () => {
  assert.equal(formatPhoneBR('+551633334444'), '(16) 3333-4444')
  assert.equal(formatPhoneBR('16992348303'), '(16) 99234-8303')
  assert.equal(formatPhoneBR('55991234567'), '(55) 99123-4567')
  assert.equal(formatPhoneBR('+55 55 99123-4567'), '(55) 99123-4567')
})

test('número de fora do Brasil ou estranho volta como veio', () => {
  assert.equal(formatPhoneBR('+1 555-147-4741'), '+1 555-147-4741')
  assert.equal(formatPhoneBR('Aguardando leitura'), 'Aguardando leitura')
  assert.equal(formatPhoneBR('12345'), '12345')
  assert.equal(formatPhoneBR(null), '')
  assert.equal(formatPhoneBR(undefined), '')
})

test('só dígitos', () => {
  assert.equal(digitsOnly('+55 (16) 99234-8303'), '5516992348303')
  assert.equal(digitsOnly(null), '')
})
