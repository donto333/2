// Minimal smoke test for 천하: 패왕의 시대.
// Keeps only the highest-value regressions: guest access, siege routing,
// siege-result return to the city management card, and admin board controls.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
let finished = false
const stop = () => { try { server.kill('SIGTERM') } catch {} }
const fail = async message => {
  if (finished) return
  finished = true
  console.error(`smoke: FAIL — ${message}`)
  await browser?.close().catch(() => {})
  stop()
  process.exit(1)
}
const guard = setTimeout(() => void fail('timed out'), 45_000)

try {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(url)).ok) break
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
    if (attempt === 39) throw new Error('preview server did not start')
  }

  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ko-KR' })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) consoleErrors.push(message.text()) })
  page.on('pageerror', error => consoleErrors.push(String(error)))

  await page.goto(url)
  await page.waitForSelector('.access-gate', { timeout: 10_000 })
  await page.click('[data-action="guest-login"]')
  await page.waitForSelector('.faction-selection, .app-shell', { timeout: 10_000 })
  if (await page.locator('.faction-selection').count()) {
    await page.locator('[data-action="faction-select"][data-faction="촉한"]').evaluate(button => button.click())
  }
  await page.waitForSelector('.app-shell', { timeout: 10_000 })

  await page.locator('[data-action="section"][data-section="territory"]').evaluate(button => button.click())
  await page.waitForSelector('.territory-map')
  await page.locator('.city-marker[data-action="city-select"][data-city="fucheng"]').evaluate(button => button.click())
  await page.evaluate(() => {
    window.__strategy.state.resources.grain = 999999
    window.__strategy.state.resources.silver = 999999
    window.__strategy.state.resources.iron = 999999
    window.__strategy.ui.render(window.__strategy.state)
  })
  await page.locator('[data-action="conquer"][data-city="fucheng"]').evaluate(button => button.click())
  await page.waitForSelector('.page-section--battle', { timeout: 10_000 })
  if (await page.locator('.page-section--scenario').count()) throw new Error('siege opened the scenario list')
  if (!(await page.evaluate(() => window.__strategy.arena.getSnapshot().active))) throw new Error('siege did not start the 3D battle')

  await page.evaluate(() => {
    window.__strategy.state.section = 'territory'
    window.__strategy.state.selectedCityId = 'fucheng'
    window.__strategy.ui.render(window.__strategy.state)
    window.__strategy.ui.showBattleResult(true, 8962)
  })
  await page.waitForSelector('.city-management', { timeout: 10_000 })
  await page.waitForSelector('.city-damage-ranking', { timeout: 10_000 })
  if ((await page.locator('.city-management h2').textContent())?.includes('부성') !== true) throw new Error('siege result did not return to the attacked city menu')
  if (await page.locator('.result-modal.is-visible').count()) await page.locator('[data-action="close-result"]').evaluate(button => button.click())

  await page.evaluate(() => {
    window.__strategy.ui.setAuth({ status: 'authenticated', name: '스모크 관리자' })
    window.__strategy.ui.setAccount({ id: 1, openId: 'smoke-admin', name: '스모크 관리자', email: 'admin@example.com', loginMethod: 'smoke', role: 'admin', createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() })
    window.__strategy.state.section = 'admin'
    window.__strategy.ui.render(window.__strategy.state)
  })
  await page.waitForSelector('.page-section--admin')
  await page.locator('[data-action="admin-tab"][data-admin-tab="board"]').evaluate(button => button.click())
  await page.waitForSelector('.admin-board-control')
  if (await page.locator('[data-action="admin-board-posting"]').count() !== 1) throw new Error('admin board posting control is missing')

  if (consoleErrors.length) throw new Error(`console errors: ${consoleErrors.join(' | ')}`)
  await browser.close()
  clearTimeout(guard)
  stop()
  finished = true
  console.log('smoke: OK — minimal core flow')
} catch (error) {
  await fail(error instanceof Error ? error.message : String(error))
}
