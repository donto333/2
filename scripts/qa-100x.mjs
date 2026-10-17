// 100배속 실제 플레이 테스트: 실제 브라우저에서 게임을 열고(게스트), 실제 콜백 흐름 그대로
// 시나리오 전체 · 일반 전투 · 대련 · 레이드 · 모든 무장 모델을 연속으로 싸운다. 전투 시간만 100배로 돌린다.
// 사용: node scripts/qa-100x.mjs <게임 주소> <결과 폴더> [--quick]
// 결과: <폴더>/qa-report.json · qa-report.md · 스크린샷
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const [, , baseUrl = 'http://127.0.0.1:4173/', outDir = 'qa-out', ...flags] = process.argv
const quick = flags.includes('--quick')
const SPEED = 100
mkdirSync(outDir, { recursive: true })

const launchArgs = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc']
const browser = await chromium.launch({ args: launchArgs, executablePath: process.env.CHROME_PATH || undefined })
const report = { startedAt: new Date().toISOString(), url: baseUrl, speed: SPEED, battles: [], errors: [], failedRequests: [], warnings: [], memory: [], checks: [] }
const check = (name, ok, detail = '') => { report.checks.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }

async function openGame(query = '') {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ko-KR' })
  // 첫 실행 안내(전투 코치 · 소개)는 전투를 멈추고 손을 기다리므로 본 것으로 표시해 둔다
  await ctx.addInitScript(() => { try { localStorage.setItem('cheonharo.coach.battle', '["all"]'); localStorage.setItem('cheonharo.coach.menus', '["all"]'); localStorage.setItem('cheonharo.intro.seen', '1') } catch { /* */ } })
  const page = await ctx.newPage()
  page.on('console', m => {
    const t = m.text()
    if (/GL Driver|swiftshader|GroupMarker|WebGL-|GPU stall|Automatic fallback/i.test(t)) return
    // 미리보기 서버에는 온라인 기능(/api) 서버가 없어 502가 난다: 게임 오류가 아니다
    if (m.type() === 'error' && /status of 50[234]/.test(t)) return
    if (m.type() === 'error') report.errors.push({ where: page.url(), text: t.slice(0, 400) })
    else if (m.type() === 'warning') report.warnings.push(t.slice(0, 300))
  })
  page.on('pageerror', e => report.errors.push({ where: 'pageerror', text: `${e.message}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`.slice(0, 600) }))
  page.on('requestfailed', r => { if (!/\/api\//.test(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED') report.failedRequests.push({ url: r.url(), why: r.failure()?.errorText }) })
  page.on('response', r => { if (r.status() >= 400 && !/\/api\//.test(r.url())) report.failedRequests.push({ url: r.url(), status: r.status() }) })
  const t0 = Date.now()
  await page.goto(baseUrl + query, { waitUntil: 'load', timeout: 60_000 })
  await page.waitForFunction(() => Boolean(window.__strategy), null, { timeout: 60_000 })
  report.loadMs ??= Date.now() - t0
  // 게스트 입장 → 진영 선택 → 안내 창 닫기(실제 콜백)
  await page.evaluate(() => {
    const s = window.__strategy, cb = s.ui.callbacks
    if (!s.state.factionConfirmed) { cb.onGuestLogin(); cb.onFactionSelect('촉한') }
    cb.onTutorial?.(true)
  })
  await page.waitForTimeout(1500)
  await closeModals(page)
  return { ctx, page }
}

async function closeModals(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.result-modal, .notice-modal, .coach-overlay, .modal-backdrop, .dialog-backdrop').forEach(n => n.remove())
    const s = window.__strategy
    if (s.state.section === 'battle' && !s.arena.getSnapshot().active) { s.state.section = 'overview'; s.ui.render(s.state) }
  })
}

/** 지금 열린 전투를 100배속 자동으로 끝까지. 끝난 결과를 돌려준다 */
async function runBattle(page, label, opts = {}) {
  const started = await page.evaluate(({ speed }) => {
    const { arena } = window.__strategy
    const snap = arena.getSnapshot()
    if (!snap.active) return false
    arena.speed = speed
    if (arena.core && !arena.core.autoPilot) arena.core.autoPilot = { accuracy: 0.85, reaction: [0.6, 1.2] }
    window.__qaFrames = 0; window.__qaFrameMax = 0
    let last = performance.now()
    const tick = () => { const now = performance.now(); window.__qaFrameMax = Math.max(window.__qaFrameMax, now - last); last = now; window.__qaFrames += 1; if (window.__strategy.arena.getSnapshot().active) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    return true
  }, { speed: SPEED })
  if (!started) { report.battles.push({ label, ok: false, error: '전투가 시작되지 않음' }); return null }
  const t0 = Date.now()
  let done = false, midShot = false
  while (Date.now() - t0 < (opts.timeoutMs ?? 300_000)) {
    await page.waitForTimeout(250)
    if (opts.shot && !midShot && Date.now() - t0 > 1500) { midShot = true; await page.screenshot({ path: join(outDir, `${opts.shot}-mid.png`) }) }
    done = await page.evaluate(() => {
      const { arena } = window.__strategy, snap = arena.getSnapshot()
      if (snap.active && snap.paused) { arena.setPaused(false); window.__qaUnpaused = (window.__qaUnpaused ?? 0) + 1 }
      return !snap.active
    })
    if (done) break
  }
  const wallMs = Date.now() - t0
  await page.waitForTimeout(300)
  if (opts.shot) await page.screenshot({ path: join(outDir, `${opts.shot}.png`) })
  const info = await page.evaluate(() => {
    const { arena, state } = window.__strategy
    const r = arena.renderer?.info
    const modal = document.querySelector('.result-modal .result-mark')?.textContent ?? ''
    return {
      result: modal, notice: state.lastNotice,
      frames: window.__qaFrames, frameMaxMs: Math.round(window.__qaFrameMax),
      geometries: r?.memory.geometries, textures: r?.memory.textures, programs: r?.programs?.length,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      sceneObjects: (() => { let n = 0; arena.scene?.traverse(() => { n += 1 }); return n })(),
    }
  })
  const entry = { label, ok: done, wallMs, ...info }
  if (!done) entry.error = '시간 안에 끝나지 않음(멈춤)'
  report.battles.push(entry)
  console.log(`${done ? '  ' : '!!'} ${label}: ${info.result || '결과 없음'} · ${(wallMs / 1000).toFixed(1)}s · 프레임 ${info.frames} · 최대 ${info.frameMaxMs}ms · 지오메트리 ${info.geometries} · 텍스처 ${info.textures} · 힙 ${info.heapMB}MB · 씬 ${info.sceneObjects}`)
  await closeModals(page)
  return entry
}

// ── 1) 시나리오 전체(실제 진행: 시작 → 자동 전투 → 보상 · 저장) ───────────────
const { page } = await openGame()
let ids = await page.evaluate(() => window.__strategy.catalog?.scenarios ?? [])
check('시나리오 목록 읽기', ids.length > 0, `${ids.length}개`)
if (quick) ids = ids.slice(0, 4)
for (const [i, id] of ids.entries()) {
  await page.evaluate(id => window.__strategy.ui.callbacks.onScenarioStart(id), id)
  await page.waitForTimeout(200)
  await runBattle(page, `시나리오 ${i + 1} (${id})`, { shot: i === 0 ? 'scenario-first' : i === ids.length - 1 ? 'scenario-last' : undefined })
  if (i % 10 === 0) report.memory.push(await page.evaluate(i => ({ at: `시나리오 ${i + 1}`, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, geometries: window.__strategy.arena.renderer?.info.memory.geometries, textures: window.__strategy.arena.renderer?.info.memory.textures }), i))
}
const cleared = await page.evaluate(() => window.__strategy.state.scenarioCleared.length)
check('시나리오 진행 기록 저장', cleared > 0, `클리어 ${cleared}개`)
const saved = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('cheonharo')).length)
check('로컬 저장', saved > 0, `${saved}개 키`)

// ── 2) 일반 전투 · 대련 · 레이드 ─────────────────────────────────
await page.evaluate(() => window.__strategy.ui.callbacks.onBattleStart())
await page.waitForTimeout(200)
const normal = await runBattle(page, '일반 전투', { shot: 'normal' })
check('일반 전투', Boolean(normal?.ok))

await page.evaluate(() => { const cb = window.__strategy.ui.callbacks; cb.onDuelRefresh(); })
await page.waitForTimeout(500)
await page.evaluate(() => window.__strategy.ui.callbacks.onDuelStart(''))
await page.waitForTimeout(300)
const duel = await runBattle(page, '대련', { shot: 'duel' })
check('대련', Boolean(duel?.ok))

await page.evaluate(() => window.__strategy.ui.callbacks.onRaidStart())
await page.waitForTimeout(800)
await page.evaluate(() => document.querySelector('[data-raid-choice="fill"], [data-action="raid-fill"]')?.click())
await page.waitForTimeout(500)
let raidRounds = 0
for (let k = 0; k < 4; k += 1) {
  const active = await page.evaluate(() => window.__strategy.arena.getSnapshot().active)
  if (!active) {
    // 다음 군 출전 버튼
    const next = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /출전|다음 군|계속/.test(x.textContent ?? '') && x.offsetParent); b?.click(); return Boolean(b) })
    await page.waitForTimeout(600)
    if (!next || !(await page.evaluate(() => window.__strategy.arena.getSnapshot().active))) break
  }
  const r = await runBattle(page, `레이드 ${k + 1}군`, { shot: k === 0 ? 'raid' : undefined })
  if (r?.ok) raidRounds += 1
}
check('레이드', raidRounds > 0, `${raidRounds}군 진행`)

// ── 3) 모든 무장(모델 · 의상 · 무기)을 한 번씩 전장에 세운다 ─────────────
const everyone = await page.evaluate(() => window.__strategy.catalog.generals().map(g => g.id))
check('무장 목록', everyone.length > 0, `${everyone.length}명`)
const groups = []
for (let i = 0; i < everyone.length; i += 3) groups.push(everyone.slice(i, i + 3))
for (const [gi, group] of (quick ? groups.slice(0, 2) : groups).entries()) {
  const ok = await page.evaluate(ids => {
    const { arena, state } = window.__strategy
    const deck = ids.map(id => state.generals.find(g => g.id === id) ?? window.__strategy.catalog.generals().find(g => g.id === id)).filter(Boolean)
    if (deck.length === 0) return false
    arena.setOpponentDeck(null)
    arena.setGenerals(deck)
    state.section = 'battle'
    arena.startBattle()
    return true
  }, group)
  if (!ok) continue
  await page.waitForTimeout(1500) // 모델 불러오기
  await runBattle(page, `무장 ${group.join(', ')}`, { shot: gi % 6 === 0 ? `generals-${gi}` : undefined })
}

// ── 4) 메모리: 반복 뒤 정리되는지 ───────────────────────────
await page.evaluate(() => { try { window.gc?.() } catch { /* */ } })
await page.waitForTimeout(1500)
report.memory.push(await page.evaluate(() => ({ at: '끝', heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, geometries: window.__strategy.arena.renderer?.info.memory.geometries, textures: window.__strategy.arena.renderer?.info.memory.textures })))

// ── 5) 휴대폰 화면(저사양 그래픽)으로 한 번 더 ─────────────────
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR' })
await mobile.addInitScript(() => { try { localStorage.setItem('cheonharo.coach.battle', '["all"]'); localStorage.setItem('cheonharo.coach.menus', '["all"]'); localStorage.setItem('cheonharo.intro.seen', '1') } catch { /* */ } })
const mp = await mobile.newPage()
mp.on('pageerror', e => report.errors.push({ where: 'mobile pageerror', text: e.message.slice(0, 400) }))
await mp.goto(baseUrl, { waitUntil: 'load', timeout: 60_000 })
await mp.waitForFunction(() => Boolean(window.__strategy), null, { timeout: 60_000 })
await mp.evaluate(() => { const cb = window.__strategy.ui.callbacks; cb.onGuestLogin(); cb.onFactionSelect('위나라'); cb.onTutorial?.(true) })
await mp.waitForTimeout(1000)
await closeModals(mp)
await mp.evaluate(() => window.__strategy.ui.callbacks.onBattleStart())
await mp.waitForTimeout(300)
const mob = await runBattle(mp, '휴대폰 화면 전투', { shot: 'mobile' })
check('휴대폰 화면 전투', Boolean(mob?.ok))

// ── 정리 ────────────────────────────────────────────────
const failed = report.battles.filter(b => !b.ok)
check('멈춘 전투 없음', failed.length === 0, failed.map(b => b.label).join(', '))
check('스크립트 오류 없음', report.errors.length === 0, `${report.errors.length}건`)
check('파일 404 없음', report.failedRequests.length === 0, `${report.failedRequests.length}건`)
const geo = report.battles.map(b => b.geometries).filter(n => typeof n === 'number')
if (geo.length > 6) {
  const early = geo.slice(2, 6).reduce((a, b) => a + b, 0) / 4, late = geo.slice(-4).reduce((a, b) => a + b, 0) / 4
  check('지오메트리 누수 없음', late < early * 1.6 + 50, `초반 ${Math.round(early)} → 후반 ${Math.round(late)}`)
}
const tex = report.battles.map(b => b.textures).filter(n => typeof n === 'number')
if (tex.length > 6) {
  const early = tex.slice(2, 6).reduce((a, b) => a + b, 0) / 4, late = tex.slice(-4).reduce((a, b) => a + b, 0) / 4
  check('텍스처 누수 없음', late < early * 1.5 + 20, `초반 ${Math.round(early)} → 후반 ${Math.round(late)}`)
}
report.finishedAt = new Date().toISOString()
writeFileSync(join(outDir, 'qa-report.json'), JSON.stringify(report, null, 1))
const md = [`# 100배속 실제 플레이 테스트`, ``, `- 주소: ${baseUrl}`, `- 첫 로딩: ${report.loadMs}ms`, `- 전투: ${report.battles.length}회 (실패 ${failed.length})`, ``, `## 점검`, ...report.checks.map(c => `- ${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`), ``, `## 오류`, ...(report.errors.length ? [...new Map(report.errors.map(e => [e.text, e])).values()].slice(0, 40).map(e => `- [${e.where}] ${e.text.replace(/\n/g, ' ⏎ ')}`) : ['- 없음']), ``, `## 실패한 파일 요청`, ...(report.failedRequests.length ? report.failedRequests.slice(0, 40).map(f => `- ${f.status ?? f.why} ${f.url}`) : ['- 없음']), ``, `## 메모리`, ...report.memory.map(m => `- ${m.at}: 힙 ${m.heapMB}MB · 지오메트리 ${m.geometries} · 텍스처 ${m.textures}`), ``, `## 전투`, '| 전투 | 결과 | 걸린 시간 | 프레임 | 최대 프레임 | 지오메트리 | 텍스처 | 힙 |', '|---|---|---|---|---|---|---|---|', ...report.battles.map(b => `| ${b.label} | ${b.ok ? b.result || '-' : '❌ ' + (b.error ?? '')} | ${((b.wallMs ?? 0) / 1000).toFixed(1)}s | ${b.frames ?? '-'} | ${b.frameMaxMs ?? '-'}ms | ${b.geometries ?? '-'} | ${b.textures ?? '-'} | ${b.heapMB ?? '-'}MB |`)].join('\n')
writeFileSync(join(outDir, 'qa-report.md'), md + '\n')
await browser.close()
console.log(`\n결과: ${join(outDir, 'qa-report.md')}`)
process.exit(report.checks.some(c => !c.ok) ? 1 : 0)
