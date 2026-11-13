import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { routeApi } from './fixtures.mjs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined })
const qr = `data:image/png;base64,${(await readFile('output/evolution/whatsapp-qr.png')).toString('base64')}`
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/evolution/status')) return route.fulfill({ json: { configured: true, instanceName: 'crm_test', state: 'connecting', phone: null } })
    if (url.pathname.endsWith('/evolution/connect')) return route.fulfill({ json: { state: 'connecting', qrCode: qr } })
    return route.fulfill({ json: routeApi(url, route.request().method()) })
  })
  await page.goto('http://localhost:5173/settings/channels/whatsapp/', { timeout: 90_000 })
  await page.getByRole('heading', { name: 'Conecte seu WhatsApp por QR Code' }).waitFor()
  await page.getByRole('button', { name: 'Conectar WhatsApp Web', exact: true }).click()
  await page.getByRole('img', { name: 'QR Code de pareamento do WhatsApp Web' }).waitFor()
  assert.equal(await page.getByRole('img', { name: 'QR Code de pareamento do WhatsApp Web' }).getAttribute('src'), qr)
  assert.ok(await page.getByRole('button', { name: 'Atualizar QR', exact: true }).isVisible())
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  assert.deepEqual(errors, [])
  await mkdir('output/evolution', { recursive: true })
  await page.screenshot({ path: 'output/evolution/crm-whatsapp-mobile.png', fullPage: true })
  console.log('OK: QR como opção padrão, pareamento, atualização e largura de celular')
} finally { await browser.close() }
