import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import { registerThreadsRoutes } from '../../dist-server/routes-threads.js'

const originalToken = process.env.CRM_THREADS_API_TOKEN
test.afterEach(() => {
  if (originalToken === undefined) delete process.env.CRM_THREADS_API_TOKEN
  else process.env.CRM_THREADS_API_TOKEN = originalToken
})
const status = { connected: true, account: { id: '123', username: 'empresa', expiresAt: null, checkedAt: null }, capabilities: { publish: true, insights: false } }
async function fixture(t, fetch, authenticated = true) {
  const app = Fastify()
  registerThreadsRoutes(app, { fetch, requireAuth: async (_request, reply) => {
    if (authenticated) return { tenant_id: 'company-session' }
    reply.code(401).send({ error: 'authentication_required' }); return null
  } })
  t.after(() => app.close())
  process.env.CRM_THREADS_API_TOKEN = 'a'.repeat(40)
  return app
}
test('usa exclusivamente o tenant da sessão e filtra campos secretos do upstream', async t => {
  const calls = []
  const app = await fixture(t, async (url, init) => { calls.push({ url, init }); return Response.json({ ...status, token: 'never-expose', account: { ...status.account, token: 'never-expose' } }) })
  const response = await app.inject('/api/integrations/threads/status?tenant=other&organizationId=other')
  assert.equal(response.statusCode, 200)
  assert.equal(calls[0].url.searchParams.get('tenant'), 'company-session')
  assert.equal(calls[0].url.origin, 'https://app.avilaops.com')
  assert.equal(calls[0].init.redirect, 'error')
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(response.json(), status)
})
test('sem autenticação não consulta o serviço', async t => {
  const app = await fixture(t, () => assert.fail('unexpected request'), false)
  assert.equal((await app.inject('/api/integrations/threads/status')).statusCode, 401)
})
test('sem credencial informa indisponibilidade e não inventa conexão', async t => {
  const app = await fixture(t, () => assert.fail('unexpected request'))
  delete process.env.CRM_THREADS_API_TOKEN
  assert.equal((await app.inject('/api/integrations/threads/status')).statusCode, 503)
})
test('empresa sem autorização mantém a negação', async t => {
  const app = await fixture(t, async () => Response.json({ token: 'secret' }, { status: 403 }))
  const response = await app.inject('/api/integrations/threads/status')
  assert.equal(response.statusCode, 403)
  assert.equal(response.body.includes('secret'), false)
})
test('resposta inválida ou erro de transporte não expõe dados do provedor', async t => {
  for (const fetch of [async () => Response.json({ token: 'secret' }), async () => { throw new Error('secret') }]) {
    const app = await fixture(t, fetch)
    const response = await app.inject('/api/integrations/threads/insights')
    assert.equal(response.statusCode, 502)
    assert.equal(response.body.includes('secret'), false)
  }
})
test('consulta métricas preservando períodos e valores retornados', async t => {
  const insights = { since: '2026-10-25', until: '2026-11-01', readAt: '2026-11-01', metrics: [{ name: 'views', period: 'day', total: null, values: [{ value: 7, endTime: null }] }] }
  const app = await fixture(t, async url => {
    assert.equal(url.searchParams.get('insights'), '1')
    return Response.json({ ...status, insights })
  })
  const response = await app.inject('/api/integrations/threads/insights')
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().insights, insights)
})
