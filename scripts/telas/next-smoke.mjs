import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { routeApi } from './fixtures.mjs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined })
const base = process.env.BASE ?? 'http://localhost:5173'
const errors = []
const paths = [
  '/', '/communications/inbox/', '/communications/inbox/c1/', '/mail/inbox/',
  '/mail/newsletter/', '/communications/team/', '/leads/pipeline/', '/leads/list/',
  '/calendar/', '/segments/', '/lists/contacts/', '/lists/companies/', '/lists/all/',
  '/lists/media/', '/lists/products/', '/ai-agent/', '/automations/', '/settings/',
  '/settings/profile/', '/settings/security/', '/settings/general/', '/settings/users/',
  '/settings/channels/', '/settings/channels/whatsapp/', '/settings/channels/email/',
  '/settings/channels/rules/', '/settings/integrations/', '/settings/ai/',
  '/settings/ai/knowledge/', '/settings/pay/', '/settings/audit-logs/',
]
let sessionCalls = 0
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await context.route('**/api/**', (route) => {
  const url = new URL(route.request().url())
  if (url.pathname === '/api/auth/session') sessionCalls++
  if (url.pathname === '/api/realtime') return route.fulfill({ contentType: 'text/event-stream', body: 'event: ready\ndata: {}\n\n' })
  return route.fulfill({ json: routeApi(url, route.request().method()) })
})
const page = await context.newPage()
page.setDefaultNavigationTimeout(90_000)
page.on('pageerror', (error) => errors.push(error.message))
try {
  const readyUntil = Date.now() + 60_000
  while (true) {
    try {
      const response = await context.request.get(base, { timeout: 2000 })
      if (response.ok()) break
    } catch {
      // O processo pode ainda estar preparando o servidor Next/Fastify.
    }
    if (Date.now() >= readyUntil) throw new Error('O servidor não ficou disponível em 60 segundos')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  for (const path of paths) {
    const response = await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
    assert.equal(response.status(), 200, path)
    await page.locator('[data-slot="sidebar"] nav[aria-label="Principal"]').waitFor()
    assert.ok(!(await page.locator('body').innerText()).includes('Application error'), path)
    console.log('OK', path)
  }
  await page.goto(`${base}/`)
  const sidebar = page.locator('[data-slot="sidebar"]')
  await sidebar.getByRole('button', { name: 'Recolher menu', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state') === 'collapsed')
  await sidebar.getByRole('button', { name: 'Contatos', exact: true }).click()
  await sidebar.getByRole('button', { name: 'Pessoas', exact: true }).click()
  await page.waitForURL('**/lists/contacts/')
  assert.equal(await sidebar.getAttribute('data-state'), 'expanded')
  const callsBefore = sessionCalls
  await sidebar.getByRole('button', { name: 'Agenda', exact: true }).click()
  await page.waitForURL('**/calendar/')
  assert.equal(sessionCalls, callsBefore, 'sessão compartilhada entre rotas')
  await page.goto(`${base}/#/leads/list/`)
  await page.waitForURL('**/leads/list/')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).last().click()
  const dialog = page.getByRole('dialog', { name: 'Menu do CRM' })
  await dialog.waitFor()
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Abrir menu')
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).last().click()
  await dialog.getByRole('button', { name: 'Contatos', exact: true }).click()
  await dialog.getByRole('button', { name: 'Pessoas', exact: true }).click()
  await page.waitForURL('**/lists/contacts/')
  await dialog.waitFor({ state: 'hidden' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${base}/`)
  await sidebar.waitFor()
  await page.keyboard.press('Control+b')
  await page.waitForFunction(() => document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state') === 'collapsed')
  await page.keyboard.press('Control+b')
  await page.waitForFunction(() => document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state') === 'expanded')
  await mkdir('output/next-mdx', { recursive: true })
  await page.screenshot({ path: 'output/next-mdx/crm-desktop.png', fullPage: true })
  for (const [path, title] of [['docs', 'Documentação Avila CRM'], ['privacidade', 'Privacidade'], ['termos', 'Termos de uso']]) {
    await page.goto(`${base}/${path}/`)
    await page.getByRole('heading', { name: title, exact: true }).waitFor()
  }
  const viewer = await browser.newContext()
  const viewerCalls = []
  await viewer.route('**/api/**', (route) => {
    const url = new URL(route.request().url())
    viewerCalls.push(url.pathname)
    const response = routeApi(url, route.request().method())
    if (url.pathname === '/api/auth/session') response.user = { ...response.user, role: 'atendente' }
    return route.fulfill({ json: response })
  })
  const viewerPage = await viewer.newPage()
  await viewerPage.goto(`${base}/settings/users/`)
  await viewerPage.getByText('Só administradores e gerentes', { exact: true }).waitFor()
  assert.ok(!viewerCalls.includes('/api/users'), 'a tela administrativa não é montada sem permissão')
  await viewer.close()
  assert.deepEqual(errors, [], 'sem erros de renderização no navegador')
  console.log('OK: todas as telas, navegação nativa, hash legado, sessão, menu móvel, foco e páginas públicas')
} finally {
  await browser.close()
}
