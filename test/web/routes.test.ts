import assert from 'node:assert/strict'
import test from 'node:test'
import { hashFor, hashFromPathname, isSettingsPage, parseHash, pageToPath, resolvePath } from '../../src/routes'

test('cada página tem um endereço único', () => {
  const paths = Object.values(pageToPath)
  assert.equal(new Set(paths).size, paths.length)
})

test('endereço conhecido abre a própria página, sem redirecionar', () => {
  assert.deepEqual(parseHash('#/settings/channels/whatsapp/'), {
    route: { page: 'whatsapp-channel' },
    path: '/settings/channels/whatsapp/',
    redirected: false,
  })
  assert.equal(parseHash('#/leads/pipeline').route.page, 'pipeline')
  assert.equal(parseHash('').route.page, 'home')
})

test('endereços antigos das Configurações levam à tela nova', () => {
  const cases: [string, string, string][] = [
    ['/settings/communications/', 'chat-settings', '/settings/channels/rules/'],
    ['/mail/settings/', 'mail-settings', '/settings/channels/email/'],
    ['/settings/pipeline/leads/', 'channels', '/settings/channels/'],
  ]
  for (const [old, page, path] of cases) {
    const resolved = resolvePath(old)
    assert.equal(resolved.route.page, page, old)
    assert.equal(resolved.path, path, old)
    assert.equal(resolved.redirected, true, old)
  }
})

test('/settings/ deixou de ser "Configurações de trabalho" e virou a lista', () => {
  assert.equal(resolvePath('/settings/').route.page, 'settings')
  assert.equal(resolvePath('/settings/general/').route.page, 'workspace-settings')
})

test('auditoria mora só dentro de Configurações', () => {
  assert.equal(resolvePath('/settings/audit-logs/').route.page, 'audit-logs')
  assert.equal(isSettingsPage('audit-logs'), true)
})

test('a conversa aberta fica no endereço e volta igual', () => {
  const id = '2b9f1c64-7d1e-4a43-9a8e-3f6a0d6c1e55'
  const resolved = parseHash(`#/communications/inbox/${id}/`)
  assert.deepEqual(resolved.route, { page: 'chat-inbox', param: id })
  assert.equal(hashFor(resolved.route), `#/communications/inbox/${id}/`)
  assert.equal(hashFor({ page: 'chat-inbox' }), '#/communications/inbox/')
})

test('segundo nível só existe onde foi previsto', () => {
  assert.equal(resolvePath('/settings/profile/extra/').route.page, 'home')
  assert.equal(resolvePath('/communications/inbox/a/b/').route.page, 'home')
  assert.equal(hashFor({ page: 'contacts', param: 'x' }), '#/lists/contacts/')
})

test('endereço desconhecido cai no Início e pede correção da barra', () => {
  const resolved = resolvePath('/nao-existe/')
  assert.equal(resolved.route.page, 'home')
  assert.equal(resolved.redirected, true)
})

test('link sem # (colado ou de favorito) vira hash na raiz do app', () => {
  assert.equal(hashFromPathname('/leads/pipeline/', '/'), '#/leads/pipeline/')
  assert.equal(hashFromPathname('/leads/pipeline', '/'), '#/leads/pipeline/')
  assert.equal(hashFromPathname('/', '/'), null)
  assert.equal(hashFromPathname('/agenda/lists/contacts/', '/agenda/'), '#/lists/contacts/')
  assert.equal(hashFromPathname('/agenda/', '/agenda/'), null)
})
