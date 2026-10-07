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
  await page.waitForSelector('.access-gate', { timeout: 30_000 })
  if (await page.locator('[data-action="guest-login"]').count() !== 1) throw new Error('guest login choice is missing')
  await page.click('[data-action="guest-login"]')
  await page.waitForSelector('.app-shell', { timeout: 30_000 })
  await page.reload()
  await page.waitForSelector('.app-shell', { timeout: 30_000 })
  if (await page.locator('.access-gate').count() !== 0) throw new Error('guest access was lost after reload')
  await page.waitForSelector('[data-action="section"][data-section="battle"]')
  if (await page.locator('[data-action="section"][data-section="admin"]').count() !== 0) throw new Error('admin navigation is visible to a non-admin guest')
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
  await page.evaluate(() => {
    window.__strategy.ui.setAuth({ status: 'authenticated', name: '스모크 관리자' })
    window.__strategy.ui.setAccount({ id: 1, openId: 'smoke-admin', name: '스모크 관리자', email: 'admin@example.com', loginMethod: 'smoke', role: 'admin', createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() })
    window.__strategy.ui.render(window.__strategy.state)
  })
  if (await page.locator('[data-action="section"][data-section="admin"]').count() !== 1) throw new Error('admin navigation is hidden for an admin account')
  await page.click('[data-action="section"][data-section="recruit"]')
  if (!(await page.locator('[data-auth-button]').textContent())?.includes('스모크 관리자')) throw new Error('auth button reset after menu navigation')
  await page.click('[data-action="section"][data-section="overview"]')

  await page.click('[data-action="section"][data-section="duel"]')
  await page.waitForSelector('.duel-list .duel-opponent')
  if (await page.locator('.duel-opponent').count() < 1) throw new Error('duel opponent list is empty')
  if (!(await page.locator('.duel-daily-limit').textContent())?.includes('오늘 남은 대련')) throw new Error('daily duel limit is missing')
  await page.locator('[data-action="duel-start"]').first().click()
  await page.waitForFunction(() => window.__strategy.arena.getSnapshot().difficulty === '유저 대련' && window.__strategy.arena.getSnapshot().active, null, { timeout: 5000 })
  if ((await page.evaluate(() => window.__strategy.arena.getSnapshot().opponentDeck.length)) !== 3) throw new Error('duel opponent deck was not loaded')
  await page.click('[data-action="section"][data-section="shop"]')
  await page.waitForSelector('.page-section--shop .shop-item')
  if (await page.locator('.page-section--shop .shop-item--resource').count() !== 5) throw new Error('resource shop does not show five non-fragment products')
  const beforeGrain = await page.evaluate(() => window.__strategy.state.resources.grain)
  await page.click('[data-action="cash-shop-purchase"][data-product-id="cash-grain-50k"]')
  if (await page.evaluate(() => window.__strategy.state.resources.grain) !== beforeGrain + 50000) throw new Error('resource shop test purchase did not grant grain')
  await page.click('[data-action="shop-tab"][data-shop-tab="mythic"]')
  if (await page.locator('.page-section--shop .shop-item').count() !== 12) throw new Error('mythic shop does not show twelve stat-specific equipment items')
  if (await page.locator('.page-section--shop .shop-specialty').count() !== 12) throw new Error('mythic shop specialty labels are incomplete')
  if (await page.locator('.page-section--shop .shop-item-icon img').count() !== 12) throw new Error('mythic shop equipment artwork is incomplete')
  await page.evaluate(() => { window.__strategy.state.mythicFragments = 20; window.__strategy.ui.render(window.__strategy.state) })
  await page.click('[data-action="shop-purchase"][data-equipment-id="shop-mythic-command-weapon"]')
  if (await page.evaluate(() => window.__strategy.state.mythicFragments) !== 0) throw new Error('mythic fragment purchase did not consume twenty fragments')
  if (!(await page.evaluate(() => window.__strategy.state.equipmentInventory.at(-1)?.specialty))) throw new Error('purchased mythic equipment lost its specialty')

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
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('manus-auth-change', { detail: { status: 'logged_out', user: null } })))
  await page.waitForTimeout(100)
  if (await page.evaluate(() => window.__strategy.state.section) !== 'battle' || !(await page.evaluate(() => window.__strategy.arena.getSnapshot().active))) throw new Error('auth refresh reset the active expedition battle')
  await page.evaluate(() => {
    window.__strategy.ui.setAuth({ status: 'authenticated', name: '스모크 관리자' })
    window.__strategy.ui.setAccount({ id: 1, openId: 'smoke-admin', name: '스모크 관리자', email: 'admin@example.com', loginMethod: 'smoke', role: 'admin', createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() })
  })
  const battle = await page.evaluate(() => window.__strategy.arena.getSnapshot())
  if (!battle.active || battle.elapsed <= 0.25) throw new Error(`battle clock did not start (${battle.elapsed.toFixed(2)}s)`)
  await page.waitForFunction(() => {
    const scene = window.__strategy.arena.scene
    let loaded = 0
    scene.traverse(node => {
      if (!node.name.startsWith('realistic-squad-')) return
      node.traverse(child => {
        const material = child.material
        if (material && !Array.isArray(material) && material.map) loaded += 1
      })
    })
    return loaded >= 5
  }, null, { timeout: 5000 })
  await page.click('[data-action="move"][data-index="1"]')
  await page.click('[data-action="battle-skill"]')
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}/03-battle.png` })
  await page.evaluate(() => window.__strategy.arena.dispose())
  if (await page.locator('.result-modal.is-visible').count()) await page.click('[data-action="close-result"]')

  await page.click('[data-action="section"][data-section="rank"]')
  await page.waitForSelector('[data-rank-list]')
  await page.click('[data-action="section"][data-section="updates"]')
  await page.waitForSelector('.page-section--updates')
  if (await page.locator('.page-section--updates .update-entry').count() < 10) throw new Error('update history entries are incomplete')
  if (!(await page.locator('.page-section--updates').textContent())?.includes('유저 대련 실제 덱 연동')) throw new Error('real-deck update is missing from in-game history')
  if (!(await page.locator('.page-section--updates').textContent())?.includes('전투 병사 모델링 개선')) throw new Error('soldier-model update is missing from in-game history')
  if (!(await page.locator('.page-section--updates').textContent())?.includes('천하영토 진영별 유저 점령 연동')) throw new Error('territory faction sync plan is missing from in-game history')
  if (!(await page.locator('.page-section--updates').textContent())?.includes('로그아웃 후 로그인 첫 페이지 이동')) throw new Error('logout login-page plan is missing from in-game history')
  await page.click('[data-action="section"][data-section="codex"]')
  await page.waitForSelector('.codex-grid')
  if (await page.locator('.codex-card').count() !== 65) throw new Error('general codex does not show all 65 generals')
  if (await page.locator('.codex-card:not(.codex-card--locked) .skill-detail-panel').count() < 1) throw new Error('codex skill detail panel is missing')
  await page.click('[data-action="section"][data-section="roster"]')
  await page.waitForSelector('select[data-action="roster-sort"]')
  if (await page.locator('.general-card .skill-detail-grid').count() < 1) throw new Error('owned roster skill detail panel is missing')
  const skillCategories = await page.locator('.general-card .skill-category').allTextContents()
  if (!skillCategories.some(text => text.includes('버프')) || !skillCategories.some(text => text.includes('디버프')) || !skillCategories.some(text => text.includes('정화'))) throw new Error('skill concept categories are not visible')
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
  if (await page.locator('.page-section--equipment [data-action="equipment-draw"]').count() !== 0) throw new Error('equipment management menu still exposes draw controls')
  await page.locator('select[data-action="equipment-general"]').selectOption('zhao-yun')
  await page.waitForTimeout(100)
  if (await page.locator('.page-section--equipment .equipment-slot-unequip').count() < 1) throw new Error('equipment management slot unequip control missing')
  await page.locator('select[data-action="equipment-sort"]').selectOption('grade')
  await page.click('[data-action="equipment-sort-direction"]')
  await page.click('[data-action="section"][data-section="recruit"]')
  await page.click('[data-action="summon-tab"][data-summon-tab="equipment"]')
  await page.waitForSelector('.summon-tab.is-active[data-summon-tab="equipment"]')
  await page.waitForSelector('.equipment-slots')
  if (await page.locator('.equipment-card').count() < 4) throw new Error('starter equipment inventory missing')
  if (await page.locator('.equipment-card .equipment-image').count() < 4) throw new Error('equipment inventory artwork is missing')
  if (await page.locator('.set-bonus-card').count() !== 4) throw new Error('equipment set bonus panel missing')
  await page.click('[data-action="equipment-draw"][data-count="1"]')
  if (await page.locator('.equipment-card').count() < 5) throw new Error('equipment draw did not add an item')
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
  if (await page.locator('.city-marker').count() !== 25) throw new Error('territory city marker count is incomplete')
  if (await page.locator('.city-marker-castle img').count() !== 25) throw new Error('territory city castle art is incomplete')
  if (await page.locator('.city-marker-castle img').evaluateAll(images => images.some(image => !image.complete || image.naturalWidth === 0))) throw new Error('territory castle art failed to load')
  await page.locator('.map-canvas').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/03-territory.png` })
  await page.evaluate(() => { window.__strategy.state.section = 'admin'; window.__strategy.ui.render(window.__strategy.state) })
  await page.waitForSelector('.page-section--admin')
  if ((await page.locator('.admin-kpi').count()) !== 4) throw new Error('admin overview KPIs missing')
  await page.click('[data-action="admin-tab"][data-admin-tab="accounts"]')
  await page.waitForSelector('.admin-account-toolbar')
  if ((await page.locator('.admin-account-toolbar').count()) !== 1) throw new Error('admin account management panel missing for admin preview')
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
