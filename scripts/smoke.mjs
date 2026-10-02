// End-to-end smoke test for 천하: 패왕의 시대.
// Builds must already exist in dist/ (`pnpm build`). The test serves the production
// output, checks the command screens, recruits a general, starts a battle and
// verifies responsive navigation without requiring a logged-in account.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const guard = setTimeout(() => fail('timed out'), 120_000)

function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}

async function fail(message) {
  console.error(`smoke: FAIL — ${message}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('preview server did not start')
}

async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', message => message.type() === 'error' && !message.text().includes('Failed to load resource') && errors.push(message.text()))
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => response.status() >= 400 && !response.url().includes('/api') && errors.push(`HTTP ${response.status()} ${response.url()}`))
  await page.goto(url)
  await page.waitForSelector('.app-shell', { timeout: 30_000 })
  await page.waitForSelector('[data-action="section"][data-section="battle"]')
  return page
}

try {
  await waitForServer()
  const errors = []
  const executablePath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'
  const launchOptions = { args: ['--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] }
  if (existsSync(executablePath)) launchOptions.executablePath = executablePath
  browser = await chromium.launch(launchOptions)

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ko-KR' })
  const page = await openGame(desktop, errors)
  await page.screenshot({ path: `${out}/01-overview.png` })

  const title = await page.locator('.brand-title').textContent()
  if (title?.trim() !== '천하') throw new Error(`unexpected title: ${title}`)
  if (await page.locator('canvas#game').count() !== 1) throw new Error('3D battlefield canvas missing')
  await page.evaluate(() => window.__strategy.ui.setAuth({ status: 'authenticated', name: '스모크 관리자' }))
  await page.click('[data-action="section"][data-section="recruit"]')
  if (!(await page.locator('[data-auth-button]').textContent())?.includes('스모크 관리자')) throw new Error('auth button reset after menu navigation')
  await page.click('[data-action="section"][data-section="overview"]')

  await page.click('[data-action="section"][data-section="recruit"]')
  await page.waitForSelector('[data-action="recruit"][data-count="1"]')
  await page.click('[data-action="recruit"][data-count="1"]')
  await page.waitForSelector('[data-action="close-summon"]', { timeout: 10_000 })
  await page.screenshot({ path: `${out}/02-recruit.png` })
  await page.click('[data-action="close-summon"]')
  await page.waitForTimeout(500)
  await page.click('[data-action="recruit"][data-count="10"]')
  await page.waitForSelector('[data-action="close-summon"]', { timeout: 10_000 })
  await page.click('[data-action="close-summon"]')
  await page.waitForSelector('.recruit-results.is-visible', { timeout: 10_000 })
  if (await page.locator('.recruit-result-card').count() !== 10) throw new Error('ten-pull did not show ten rewards')
  await page.screenshot({ path: `${out}/02-ten-pull.png` })
  await page.click('[data-action="reroll-recruit"]')
  await page.waitForSelector('[data-action="close-summon"]', { timeout: 10_000 })
  await page.click('[data-action="close-summon"]')
  await page.waitForSelector('.recruit-results.is-visible', { timeout: 10_000 })
  if (await page.locator('.recruit-result-card').count() !== 10) throw new Error('reroll did not show ten rewards')
  await page.click('[data-action="close-recruit-results"]')

  await page.click('[data-action="section"][data-section="battle"]')
  await page.waitForSelector('[data-action="battle-start"]')
  await page.click('[data-action="battle-start"]')
  await page.waitForFunction(() => window.__strategy.arena.getSnapshot().elapsed > 0.25, null, { timeout: 5000 })
  const battle = await page.evaluate(() => window.__strategy.arena.getSnapshot())
  if (!battle.active || battle.elapsed <= 0.25) throw new Error(`battle clock did not start (${battle.elapsed.toFixed(2)}s)`)
  await page.click('[data-action="move"][data-index="1"]')
  await page.click('[data-action="battle-skill"]')
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}/03-battle.png` })
  await page.evaluate(() => window.__strategy.arena.dispose())
  if (await page.locator('.result-modal.is-visible').count()) await page.click('[data-action="close-result"]')

  await page.click('[data-action="section"][data-section="rank"]')
  await page.waitForSelector('[data-rank-list]')
  await page.click('[data-action="section"][data-section="codex"]')
  await page.waitForSelector('.codex-grid')
  if (await page.locator('.codex-card').count() !== 65) throw new Error('general codex does not show all 65 generals')
  await page.click('[data-action="section"][data-section="roster"]')
  await page.waitForSelector('select[data-action="roster-sort"]')
  await page.locator('select[data-action="roster-sort"]').selectOption('level')
  await page.click('[data-action="roster-sort-direction"]')
  await page.click('[data-action="section"][data-section="formation"]')
  await page.waitForSelector('.formation-slots')
  if (await page.locator('.formation-slot--filled').count() !== 3) throw new Error('formation screen does not show three active slots')
  if (await page.locator('.formation-unequip').count() < 1) throw new Error('formation equipment unequip controls missing')
  await page.locator('.formation-unequip').first().click()
  await page.waitForTimeout(100)
  if (await page.locator('.formation-bench-card').count() > 0) {
    await page.click('.formation-bench-card [data-action="formation"]')
    if (await page.locator('.formation-slot--filled').count() !== 3) throw new Error('formation reserve selection did not preserve three slots')
  }
  if (await page.locator('.result-modal.is-visible').count()) await page.click('[data-action="close-result"]')
  await page.click('[data-action="section"][data-section="equipment"]')
  await page.waitForSelector('select[data-action="equipment-sort"]')
  await page.locator('select[data-action="equipment-sort"]').selectOption('grade')
  await page.click('[data-action="equipment-sort-direction"]')
  await page.click('[data-action="section"][data-section="recruit"]')
  await page.click('[data-action="summon-tab"][data-summon-tab="equipment"]')
  await page.waitForSelector('.summon-tab.is-active[data-summon-tab="equipment"]')
  await page.waitForSelector('.equipment-slots')
  if (await page.locator('.equipment-card').count() !== 3) throw new Error('starter equipment inventory missing')
  if (await page.locator('.set-bonus-card').count() !== 4) throw new Error('equipment set bonus panel missing')
  await page.click('[data-action="equipment-draw"][data-count="1"]')
  if (await page.locator('.equipment-card').count() !== 4) throw new Error('equipment draw did not add an item')
  await page.waitForSelector('.recruit-results.is-visible')
  if (await page.locator('.equipment-result-card').count() !== 1) throw new Error('equipment draw result modal missing')
  if (await page.locator('[data-action="extra-equipment-draw"]').count() !== 2) throw new Error('equipment result modal missing extra draw buttons')
  await page.click('[data-action="extra-equipment-draw"][data-count="1"]')
  await page.waitForSelector('.recruit-results.is-visible')
  if (await page.locator('.equipment-result-card').count() !== 1) throw new Error('extra equipment draw did not show a result modal')
  await page.click('[data-action="close-recruit-results"]')
  await page.click('.equipment-card:first-of-type [data-action="equipment-enhance"]')
  await page.click('.equipment-card:first-of-type [data-action="equipment-equip"]')
  if (await page.locator('.equipment-slot.is-filled').count() < 1) throw new Error('equipment slot did not render an equipped item')
  await page.click('[data-action="section"][data-section="territory"]')
  await page.waitForSelector('.territory-map')
  if (await page.locator('.city-marker-castle img').count() !== 25) throw new Error('territory city castle art is incomplete')
  if (await page.locator('.city-marker-castle img').evaluateAll(images => images.some(image => !image.complete || image.naturalWidth === 0))) throw new Error('territory castle art failed to load')
  await page.locator('.map-canvas').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/03-territory.png` })
  await page.click('[data-action="section"][data-section="admin"]')
  await page.waitForSelector('.page-section--admin')
  if ((await page.locator('.admin-kpi').count()) !== 4) throw new Error('admin overview KPIs missing')
  await page.click('[data-action="admin-tab"][data-admin-tab="accounts"]')
  await page.waitForSelector('.admin-account-toolbar')
  if ((await page.locator('.admin-account-gate').count()) !== 1) throw new Error('admin account access gate missing for logged-out preview')
  await page.click('[data-action="admin-tab"][data-admin-tab="generals"]')
  await page.waitForSelector('.admin-general-table')
  await page.click('[data-action="admin-filter"][data-admin-filter="legendary"]')
  if ((await page.locator('.admin-general-row').count()) === 0) throw new Error('admin general filter returned no rows')
  await page.click('[data-action="admin-tab"][data-admin-tab="season"]')
  await page.waitForSelector('.season-banner')
  await page.screenshot({ path: `${out}/05-admin.png` })
  await desktop.close()

  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR' })
  const phonePage = await openGame(phone, errors)
  await phonePage.evaluate(() => window.__strategy.ui.showBattleResult(true, 8962))
  await phonePage.waitForSelector('.result-modal.is-visible')
  await phonePage.tap('[data-action="close-result"]')
  await phonePage.waitForSelector('.result-modal', { state: 'detached' })
  await phonePage.screenshot({ path: `${out}/04-phone.png` })
  await phone.close()

  if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — screenshots in ${out}/`)
} catch (error) {
  await fail(error?.message ?? String(error))
}
