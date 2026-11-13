import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import { createEvolutionClient, evolutionConfig, registerEvolutionRoutes } from '../../dist-server/evolution.js'

const tenantId = '11111111-1111-4111-8111-111111111111'
const configuration = { baseUrl: 'https://evolution.example', apiKey: 'secret-test-only', tenantId, instanceName: 'crm-test' }

test('cadastros de empresas diferentes recebem instâncias diferentes sem vínculo manual', () => {
  const previous = { ...process.env }
  try {
    process.env.EVOLUTION_API_URL = configuration.baseUrl
    process.env.EVOLUTION_API_KEY = configuration.apiKey
    delete process.env.EVOLUTION_TENANT_ID
    delete process.env.EVOLUTION_INSTANCE_NAME
    const other = '22222222-2222-4222-8222-222222222222'
    assert.notEqual(evolutionConfig(tenantId).instanceName, evolutionConfig(other).instanceName)
    assert.equal(evolutionConfig(tenantId).instanceName, evolutionConfig(tenantId).instanceName)
    process.env.EVOLUTION_TENANT_ID = tenantId
    process.env.EVOLUTION_INSTANCE_NAME = 'status'
    assert.equal(evolutionConfig(other), null)
  } finally {
    for (const key of ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'EVOLUTION_TENANT_ID', 'EVOLUTION_INSTANCE_NAME']) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})

test('envio usa contrato v2 e não inventa sucesso após falha ou timeout', async () => {
  const calls = []
  const client = createEvolutionClient(configuration, async (url, init) => {
    calls.push({ url, init })
    return Response.json({ key: { id: 'real-message' } })
  })
  assert.equal(await client.sendText('5511999999999', 'Olá'), 'real-message')
  assert.equal(JSON.parse(calls[0].init.body).text, 'Olá')
  assert.equal(calls[0].init.headers.apikey, configuration.apiKey)
  assert.equal(calls[0].init.redirect, 'error')
  await assert.rejects(createEvolutionClient(configuration, async () => Response.json({ secret: 'raw' }, { status: 401 })).sendText('55', 'texto'), /Evolution/)
  await assert.rejects(createEvolutionClient(configuration, async () => { throw Error('private network detail') }).sendText('55', 'texto'), /Evolution/)
  await assert.rejects(createEvolutionClient(configuration, async () => Response.json({})).sendText('55', 'texto'), /Evolution/)
})

test('rotas exigem sessão, gestão e vínculo da empresa antes de acessar a API', async () => {
  for (const [user, expected] of [[null, 401], [{ tenant_id: 'foreign', role: 'admin' }, 403], [{ tenant_id: tenantId, role: 'atendente' }, 403]]) {
    const app = Fastify()
    let called = false
    registerEvolutionRoutes(app, {
      config: () => configuration,
      requireAuth: async (_, reply) => { if (!user) { reply.code(401).send({ error: 'auth' }); return null } return user },
      canManage: (u) => u.role === 'admin',
      fetch: async () => { called = true; return Response.json({}) },
    })
    const response = await app.inject({ method: 'POST', url: '/api/integrations/evolution/connect' })
    assert.equal(response.statusCode, expected)
    assert.equal(called, false)
    await app.close()
  }
})

test('estado não expõe chave e não usa uma instância de outra empresa', async () => {
  const app = Fastify()
  registerEvolutionRoutes(app, {
    config: () => configuration,
    requireAuth: async () => ({ tenant_id: tenantId, role: 'admin' }),
    canManage: () => true,
    fetch: async (url) => url.includes('connectionState') ? Response.json({ instance: { state: 'open' } }) : Response.json([{ name: 'crm-test', ownerJid: '5511999999999@s.whatsapp.net' }]),
    query: async () => ({ rows: [{ id: 'channel' }], rowCount: 1 }),
  })
  const response = await app.inject('/api/integrations/evolution/status')
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().state, 'connected')
  assert.ok(!response.body.includes(configuration.apiKey))
  await app.close()
})

test('pareamento usa exclusivamente QR retornado pela API e não desconecta instância aberta', async () => {
  const paths = []
  const client = createEvolutionClient(configuration, async (url) => {
    paths.push(url)
    if (url.includes('connectionState')) return Response.json({ instance: { state: 'open' } })
    return Response.json([{ name: configuration.instanceName, ownerJid: '5511999999999@s.whatsapp.net' }])
  })
  assert.equal((await client.connect()).state, 'connected')
  assert.ok(!paths.some((url) => url.includes('/connect/') || url.includes('/logout/')))
  const qr = 'data:image/png;base64,aGVsbG8='
  const pairing = createEvolutionClient(configuration, async (url) => {
    if (url.includes('connectionState')) return Response.json({ instance: { state: 'close' } })
    if (url.includes('fetchInstances')) return Response.json([{ name: configuration.instanceName }])
    return Response.json({ base64: qr })
  })
  assert.equal((await pairing.connect()).qrCode, qr)
})

test('sincronização limita a instância, isola tenant e ignora duplicatas, grupos e mídia sem texto', async () => {
  const app = Fastify()
  const seen = new Set()
  const writes = []
  const updates = []
  const events = []
  const now = Math.floor(Date.now() / 1000)
  const message = { key: { id: 'm1', fromMe: false, remoteJid: '5511999999999@s.whatsapp.net' }, messageTimestamp: now, pushName: 'Contato', message: { conversation: 'Olá' } }
  registerEvolutionRoutes(app, {
    config: () => configuration,
    requireAuth: async () => ({ tenant_id: tenantId, role: 'admin' }),
    canManage: () => true,
    fetch: async (url) => {
      assert.ok(!url.includes('foreign'))
      if (url.includes('connectionState')) return Response.json({ instance: { state: 'open' } })
      if (url.includes('fetchInstances')) return Response.json([{ name: configuration.instanceName }])
      return Response.json({ messages: { records: [message, { ...message, key: { id: 'group', remoteJid: '123@g.us' } }, { ...message, key: { id: 'media', remoteJid: '5511999999999@s.whatsapp.net' }, message: { imageMessage: {} } }] } })
    },
    query: async (sql, params) => {
      assert.equal(params[0], tenantId)
      if (sql.startsWith('select id from messages')) return { rows: seen.has(params[1]) ? [{ id: 'existing' }] : [] }
      if (sql.includes('insert into messages')) { writes.push(params); seen.add(params[2]); return { rows: [{ id: 'saved' }], rowCount: 1 } }
      if (sql.startsWith('update conversations')) { updates.push(sql); return { rows: [{ id: 'conversation', unread_count: 1, status: 'waiting' }] } }
      return { rows: [{ id: 'channel' }], rowCount: 1 }
    },
    upsertContact: async (tenant) => { assert.equal(tenant, tenantId); return 'contact' },
    conversation: async (tenant) => { assert.equal(tenant, tenantId); return 'conversation' },
    publish: (event) => events.push(event),
  })
  const first = await app.inject({ method: 'POST', url: '/api/integrations/evolution/sync' })
  assert.equal(first.statusCode, 200, first.body)
  assert.equal(first.json().imported, 1)
  assert.equal((await app.inject({ method: 'POST', url: '/api/integrations/evolution/sync' })).json().imported, 0)
  assert.equal(writes.length, 1)
  assert.match(updates[0], /unread_count/)
  assert.match(updates[0], /waiting/)
  assert.equal(events.filter((event) => event.type === 'conversation.updated').length, 1)
  assert.equal(events.find((event) => event.type === 'conversation.updated').data.unread_count, 1)
  await app.close()
})

test('a consulta automática continua após desconexão temporária', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const previous = process.env.EVOLUTION_SYNC_ENABLED
  process.env.EVOLUTION_SYNC_ENABLED = 'true'
  const app = Fastify()
  const states = []
  let cycles = 0
  try {
    registerEvolutionRoutes(app, {
      config: () => configuration, background: true,
      requireAuth: async () => ({ tenant_id: tenantId, role: 'admin' }), canManage: () => true,
      fetch: async (url) => {
        if (url.includes('connectionState')) return Response.json({ instance: { state: cycles === 1 ? 'close' : 'open' } })
        if (url.includes('fetchInstances')) return Response.json([{ name: configuration.instanceName }])
        return Response.json({ messages: { records: [] } })
      },
      query: async (sql, params) => {
        if (sql.startsWith('select tenant_id')) {
          assert.match(sql, /disconnected/)
          cycles++
          return { rows: [{ tenant_id: tenantId, external_id: configuration.instanceName }] }
        }
        if (sql.includes('insert into channels')) states.push(params[3])
        return { rows: [{ id: 'channel' }] }
      },
      upsertContact: async () => 'contact', conversation: async () => 'conversation',
    })
    t.mock.timers.tick(15_000)
    await new Promise(setImmediate)
    t.mock.timers.tick(15_000)
    await new Promise(setImmediate)
    assert.deepEqual(states, ['disconnected', 'connected'])
  } finally {
    await app.close()
    t.mock.timers.reset()
    if (previous === undefined) delete process.env.EVOLUTION_SYNC_ENABLED
    else process.env.EVOLUTION_SYNC_ENABLED = previous
  }
})
