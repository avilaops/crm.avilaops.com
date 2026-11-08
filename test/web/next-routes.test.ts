import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import test from 'node:test'
import { pageToPath } from '../../src/routes'
import { resolveNextLocation } from '../../src/lib/nextRoutes'

test('todas as telas do CRM possuem página MDX no App Router', async () => {
  for (const path of Object.values(pageToPath)) {
    await access(new URL(`../../src/app${path}page.mdx`, import.meta.url))
  }
  await access(new URL('../../src/app/communications/inbox/[conversationId]/page.mdx', import.meta.url))
})

test('links antigos com hash preservam conversa e redirecionam para rotas nativas', () => {
  assert.equal(resolveNextLocation('/', '#/communications/inbox/abc/').path, '/communications/inbox/abc/')
  assert.equal(resolveNextLocation('/mail/settings/', '').path, '/settings/channels/email/')
  assert.equal(resolveNextLocation('/lists/contacts/', '').route.page, 'contacts')
})
