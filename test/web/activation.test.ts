import assert from 'node:assert/strict'
import test from 'node:test'
import { activationProgress, activationSteps, hasOfficialWhatsApp, type ActivationSnapshot } from '../../src/lib/activation'

const empty: ActivationSnapshot = { channels: [], activeUsers: 1, contacts: 0, welcomeMessage: null, aiAutonomousReply: false }

test('conta nova: os quatro itens pendentes, na ordem de valor', () => {
  const steps = activationSteps(empty)
  assert.deepEqual(steps.map((step) => step.id), ['whatsapp', 'equipe', 'contatos', 'boas-vindas'])
  assert.ok(steps.every((step) => !step.done))
  assert.deepEqual(activationProgress(steps), { done: 0, total: 4, complete: false })
})

test('QR Code (WhatsApp Web) não conta como WhatsApp conectado', () => {
  assert.equal(hasOfficialWhatsApp([{ provider: 'qrcode', status: 'connecting' }]), false)
  assert.equal(hasOfficialWhatsApp([{ provider: 'evolution', status: 'connected' }]), false)
  assert.equal(hasOfficialWhatsApp([{ provider: 'messageria', status: 'connected' }]), true)
  assert.equal(hasOfficialWhatsApp([{ provider: 'whatsapp', status: 'connected' }]), true)
  assert.equal(hasOfficialWhatsApp([{ provider: 'messageria', status: 'error' }]), false)
})

test('número só descoberto na conta da Meta não fecha o item: ele ainda não recebe', () => {
  assert.equal(hasOfficialWhatsApp([{ provider: 'whatsapp', status: 'connected', metadata: { origem: 'auth' } }]), false)
})

test('cada item fecha pelo dado real da conta', () => {
  const steps = activationSteps({
    channels: [{ provider: 'messageria', status: 'connected' }],
    activeUsers: 2,
    contacts: 4435,
    welcomeMessage: '   ',
    aiAutonomousReply: false,
  })
  assert.deepEqual(
    steps.map((step) => [step.id, step.done]),
    [
      ['whatsapp', true],
      ['equipe', true],
      ['contatos', true],
      // Mensagem só com espaços não é mensagem.
      ['boas-vindas', false],
    ],
  )
})

test('recepcionista com IA ligada também resolve as boas-vindas', () => {
  const steps = activationSteps({ ...empty, aiAutonomousReply: true })
  assert.equal(steps.find((step) => step.id === 'boas-vindas')?.done, true)
})

test('cada item leva à tela onde se resolve', () => {
  const pages = Object.fromEntries(activationSteps(empty).map((step) => [step.id, step.action.page]))
  assert.deepEqual(pages, { whatsapp: 'whatsapp-channel', equipe: 'users', contatos: 'contacts', 'boas-vindas': 'chat-settings' })
})
