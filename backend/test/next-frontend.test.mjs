import assert from 'node:assert/strict'
import test from 'node:test'

process.env.CRM_TEST_MODE = '1'
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/crm_test_unused'
const { buildApp } = await import('../../dist-server/server.js')

test('o servidor delega páginas ao Next e mantém APIs desconhecidas em JSON', async (t) => {
  const paths = []
  const app = await buildApp({
    background: false,
    frontendHandler: async (request, response) => {
      paths.push(request.url)
      response.setHeader('content-type', 'text/html')
      response.end('<main>Next MDX</main>')
    },
  })
  t.after(() => app.close())
  const page = await app.inject('/lists/contacts/')
  assert.equal(page.statusCode, 200)
  assert.equal(page.body, '<main>Next MDX</main>')
  assert.equal(page.headers['x-frame-options'], 'DENY')
  assert.equal(page.headers['x-content-type-options'], 'nosniff')
  assert.equal(page.headers['referrer-policy'], 'strict-origin-when-cross-origin')
  assert.equal(page.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()')
  assert.ok(page.headers['x-request-id'])
  const api = await app.inject('/api/does-not-exist')
  assert.equal(api.statusCode, 404)
  assert.equal(api.json().error, 'Rota nao encontrada.')
  assert.deepEqual(paths, ['/lists/contacts/'])
})
