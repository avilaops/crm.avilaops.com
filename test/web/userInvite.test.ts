import assert from 'node:assert/strict'
import test from 'node:test'
import { afterInvite, inviteLine } from '../../src/lib/userInvite'

const base = { name: 'Ana Souza', email: 'ana@empresa.test', invite_at: '2026-10-09T14:01:00Z' }

test('quem nunca foi convidado não ganha linha na lista', () => {
  assert.equal(inviteLine({ ...base, invite_status: null, invite_detail: null, invite_at: null }), null)
})

test('convite enviado: a lista diz quando e o quê, com acento', () => {
  const line = inviteLine({ ...base, invite_status: 'enviado', invite_detail: 'com o endereco para criar a senha' })
  assert.ok(line?.startsWith('Convite enviado em ') && line.endsWith(': com o endereço para criar a senha'))
})

test('convite que não saiu: a lista mostra o motivo que o servidor deu', () => {
  const line = inviteLine({ ...base, invite_status: 'falhou', invite_detail: 'A conta Avila Ops respondeu 500.' })
  assert.ok(line?.startsWith('Convite não enviado') && line.includes('respondeu 500'))
})

test('aviso depois de adicionar: enviado é sucesso e diz para qual e-mail', () => {
  const notice = afterInvite({ ...base, invite_status: 'enviado', invite_detail: 'a pessoa ja tinha conta Avila Ops' }, 'adicionada')
  assert.equal(notice.tone, 'success')
  assert.ok(notice.text.includes('ana@empresa.test') && notice.text.includes('já tinha conta Ávila Ops'))
})

test('aviso depois de adicionar: convite que não saiu é atenção, e a pessoa continua adicionada', () => {
  const notice = afterInvite({ ...base, invite_status: 'pendente', invite_detail: 'O convite por e-mail ainda nao esta ligado neste ambiente.' }, 'adicionada')
  assert.equal(notice.tone, 'warning')
  assert.ok(notice.text.startsWith('Ana Souza foi adicionada, mas o convite não saiu.'))
})

test('aviso com senha inicial: sem convite, a pessoa entra com a senha combinada', () => {
  const notice = afterInvite({ ...base, invite_status: null, invite_detail: null }, 'adicionada')
  assert.deepEqual(notice, { tone: 'success', text: 'Ana Souza já pode entrar no CRM com a senha inicial.' })
})
