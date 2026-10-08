// Verificação visual das telas nos tamanhos reais de uso.
//
// Abre o SPA com a API simulada (fixtures.mjs), percorre as telas em 375, 390,
// 768, 1024 e 1440 px, salva uma captura de cada e confere o que dá para medir:
// rolagem horizontal, campo cortado, campo com fonte abaixo de 16 px no celular
// (o Safari do iPhone dá zoom) e alvo de toque abaixo de 44 px.
//
// Uso, com o Vite rodando (`npm run dev`):
//
//   node scripts/telas/verificar.mjs [pasta] [filtro-de-tela] [larguras]
//   node scripts/telas/verificar.mjs telas-capturas 'config' 375,390
//
// Precisa do Playwright com o Chromium (`npm i -D playwright && npx playwright
// install chromium`); PLAYWRIGHT_MODULE aponta para outra instalação se for o
// caso. Sai com código 1 se alguma tela do celular ou do tablet rolar para o
// lado ou cortar campo — os critérios de aceite do plano de refatoração.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { routeApi } from './fixtures.mjs'

let chromium
try {
  ;({ chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright'))
} catch {
  console.error('Playwright não encontrado. Instale com: npm i -D playwright && npx playwright install chromium')
  process.exit(2)
}

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173/'
const OUT = process.argv[2] ?? 'telas-capturas'
const onlyScreen = process.argv[3] ? new RegExp(process.argv[3]) : null
const onlyViewport = process.argv[4] ? process.argv[4].split(',') : null

const viewports = {
  375: { width: 375, height: 667 },
  390: { width: 390, height: 844 },
  768: { width: 768, height: 1024 },
  1024: { width: 1024, height: 768 },
  1440: { width: 1440, height: 900 },
}

const screens = [
  { name: 'inicio', hash: '#/' },
  { name: 'inbox', hash: '#/communications/inbox/' },
  { name: 'inbox-conversa', hash: '#/communications/inbox/c1/' },
  { name: 'equipe', hash: '#/communications/team/' },
  { name: 'funil', hash: '#/leads/pipeline/' },
  { name: 'leads', hash: '#/leads/list/' },
  { name: 'contatos', hash: '#/lists/contacts/' },
  { name: 'empresas', hash: '#/lists/companies/' },
  { name: 'produtos', hash: '#/lists/products/' },
  { name: 'config', hash: '#/settings/' },
  { name: 'config-perfil', hash: '#/settings/profile/' },
  { name: 'config-seguranca', hash: '#/settings/security/' },
  { name: 'config-geral', hash: '#/settings/general/' },
  { name: 'config-usuarios', hash: '#/settings/users/' },
  { name: 'config-canais', hash: '#/settings/channels/' },
  { name: 'config-whatsapp', hash: '#/settings/channels/whatsapp/' },
  { name: 'config-regras', hash: '#/settings/channels/rules/' },
  { name: 'config-email', hash: '#/settings/channels/email/' },
  { name: 'config-integracoes', hash: '#/settings/integrations/' },
  { name: 'config-ia', hash: '#/settings/ai/' },
  { name: 'config-faturamento', hash: '#/settings/pay/' },
  { name: 'config-auditoria', hash: '#/settings/audit-logs/' },
]

function measure(viewportWidth) {
  const visible = (element) => {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const style = getComputedStyle(element)
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return null
    return rect
  }
  const label = (element) =>
    (element.getAttribute('aria-label') || element.textContent || element.getAttribute('placeholder') || element.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)

  // Campo dentro de um contêiner que rola sozinho (o quadro do funil, uma
  // tabela) não está cortado: a página não rola, o contêiner sim.
  const insideScroller = (element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowX
      if (overflow === 'auto' || overflow === 'scroll') return true
    }
    return false
  }

  const fields = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')]
  const cut = []
  const smallFont = []
  for (const field of fields) {
    const rect = visible(field)
    if (!rect) continue
    if ((rect.right > viewportWidth + 1 || rect.left < -1) && !insideScroller(field)) cut.push(label(field))
    if (parseFloat(getComputedStyle(field).fontSize) < 16) smallFont.push(label(field))
  }

  const smallTargets = []
  for (const target of document.querySelectorAll('button, a[href], [role=button], select, summary')) {
    const rect = visible(target)
    if (!rect) continue
    if (rect.height < 43.5 || rect.width < 43.5) smallTargets.push(`${label(target)} (${Math.round(rect.width)}x${Math.round(rect.height)})`)
  }

  return {
    // No celular emulado o navegador afasta o zoom para caber o conteúdo, e o
    // innerWidth acompanha: a régua é a largura configurada, não a da janela.
    overflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - viewportWidth,
    cut,
    smallFont,
    smallTargets,
  }
}

const browser = await chromium.launch()
const report = []
mkdirSync(OUT, { recursive: true })

for (const [name, viewport] of Object.entries(viewports)) {
  if (onlyViewport && !onlyViewport.includes(name)) continue
  const width = Number(name)
  const context = await browser.newContext({ viewport, isMobile: width < 768, hasTouch: width < 1024 })
  await context.route('**/api/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/realtime') {
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: 'event: ready\ndata: {}\n\n' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(routeApi(url, request.method())) })
  })

  for (const screen of screens) {
    if (onlyScreen && !onlyScreen.test(screen.name)) continue
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto(`${BASE}${screen.hash}`)
    await page.waitForTimeout(900)
    const metrics = await page.evaluate(measure, width)
    await page.screenshot({ path: join(OUT, `${screen.name}-${name}.png`), fullPage: true })
    report.push({ screen: screen.name, viewport: width, ...metrics, errors })
    await page.close()
  }
  await context.close()
}

await browser.close()
writeFileSync(join(OUT, 'relatorio.json'), JSON.stringify(report, null, 2))

let failed = false
for (const row of report) {
  const problems = []
  const phoneOrTablet = row.viewport < 1024
  if (row.overflowX > 0) problems.push(`rolagem horizontal +${row.overflowX}px`)
  if (row.cut.length) problems.push(`${row.cut.length} campo(s) cortado(s)`)
  if (row.viewport < 840 && row.smallFont.length) problems.push(`${row.smallFont.length} campo(s) com menos de 16px`)
  if (phoneOrTablet && row.smallTargets.length) problems.push(`${row.smallTargets.length} alvo(s) com menos de 44px`)
  if (row.errors.length) problems.push(`erro: ${row.errors.join(' | ')}`)
  if (phoneOrTablet && (row.overflowX > 0 || row.cut.length || row.errors.length)) failed = true
  console.log(`${row.screen.padEnd(20)} ${String(row.viewport).padStart(4)}  ${problems.join('; ') || 'ok'}`)
}
process.exit(failed ? 1 : 0)
