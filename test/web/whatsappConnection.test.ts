import assert from 'node:assert/strict'
import test from 'node:test'
import { describeWhatsAppConnection } from '../../src/lib/whatsappConnection'

const qr = { id: 'q1', provider: 'qrcode', status: 'connecting', phone_number: 'Aguardando leitura', display_name: 'WhatsApp Web QR' }
const fromAccount = { id: 'a1', provider: 'whatsapp', status: 'connected', phone_number: '+55 16 99234-0000', display_name: 'WhatsApp', metadata: { origem: 'auth' } }
const direct = { id: 'w1', provider: 'whatsapp', status: 'connected', phone_number: '+55 17 99105-3597', display_name: 'WhatsApp' }

test('sem Messageria e sem canal oficial: desconectado', () => {
  const view = describeWhatsAppConnection({ connected: false }, [])
  assert.equal(view.state, 'disconnected')
  assert.equal(view.via, null)
})

test('canal por QR parado em "connecting" não vira conectado, vira aviso', () => {
  const view = describeWhatsAppConnection({ connected: false }, [qr])
  assert.equal(view.state, 'disconnected')
  assert.deepEqual(view.unofficial, [{ id: 'q1', label: 'WhatsApp Web QR', neverCompleted: true }])
})

test('Messageria com número de produção e recebimento registrado: conectado', () => {
  const view = describeWhatsAppConnection(
    { connected: true, baseUrl: 'https://sms.avilaops.com', canalId: 'c1', assinaturaRegistrada: true, canais: [{ id: 'c1', numero: '+5517991053597', padrao: true }] },
    [],
  )
  assert.equal(view.state, 'connected')
  assert.equal(view.reason, null)
  assert.deepEqual(view.numbers, [{ id: 'c1', label: '(17) 99105-3597', isDefault: true, isTest: false }])
})

test('chave que a Messageria recusa: erro, com o motivo', () => {
  const view = describeWhatsAppConnection({ connected: true, baseUrl: 'https://sms.avilaops.com', canalId: null, erro: 'Chave invalida.' }, [])
  assert.equal(view.state, 'error')
  assert.match(view.reason ?? '', /Chave invalida/)
})

test('envia mas não recebe: com restrição', () => {
  const view = describeWhatsAppConnection(
    { connected: true, baseUrl: 'x', canalId: 'c1', assinaturaRegistrada: false, canais: [{ id: 'c1', numero: '+5517991053597' }] },
    [],
  )
  assert.equal(view.state, 'degraded')
  assert.match(view.reason ?? '', /não chegam/)
})

test('só o número de teste da Meta: com restrição', () => {
  const view = describeWhatsAppConnection(
    { connected: true, baseUrl: 'x', canalId: 't1', assinaturaRegistrada: true, canais: [{ id: 't1', numero: '+1 555-147-4741', teste: true }] },
    [],
  )
  assert.equal(view.state, 'degraded')
  assert.equal(view.numbers[0].isTest, true)
  assert.equal(view.numbers[0].label, '+1 555-147-4741')
})

test('conta ligada sem número ainda: com restrição', () => {
  const view = describeWhatsAppConnection({ connected: true, baseUrl: 'x', canalId: null, assinaturaRegistrada: true, canais: [] }, [])
  assert.equal(view.state, 'degraded')
})

test('número vindo da conta da Meta: aparece, mas sem dizer que está conectado', () => {
  const view = describeWhatsAppConnection({ connected: false }, [fromAccount])
  assert.equal(view.state, 'degraded')
  assert.equal(view.via, 'conta-meta')
  assert.match(view.reason ?? '', /recebimento/)
  assert.equal(view.numbers[0].label, '(16) 99234-0000')
})

test('número da conta da Meta desligado não aparece', () => {
  const view = describeWhatsAppConnection(null, [{ ...fromAccount, status: 'disconnected' }])
  assert.equal(view.state, 'disconnected')
})

test('caminho antigo direto na Meta aparece, mas como pendência', () => {
  const view = describeWhatsAppConnection(null, [direct])
  assert.equal(view.state, 'degraded')
  assert.equal(view.via, 'meta-direta')
  assert.equal(view.numbers[0].label, '(17) 99105-3597')
})
