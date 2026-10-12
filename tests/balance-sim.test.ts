import { describe, expect, it } from 'vitest'
import { buildGeneral, defaultConfig, previewSlot, runBatch, runSingle, sanitizeConfig } from '../src/balance/sim'
import { balanceAccess } from '../server/launch.mjs'

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

describe('밸런스 테스트 설정', () => {
  it('fixes unknown generals and out-of-range numbers', () => {
    const config = sanitizeConfig({ ally: [{ id: 'nobody', level: 999, stars: -3, gear: { weapon: { set: 'x', grade: 'mythic', level: 50 } } }], settings: { mode: 'boss', runs: 5, accuracy: 3 } })
    expect(config.ally[0].id).toBe('guan-yu')
    expect(config.ally[0].level).toBe(60)
    expect(config.ally[0].stars).toBe(1)
    expect(config.ally[0].gear.weapon).toEqual({ set: 'none', grade: 'mythic', level: 20 })
    expect(config.enemy).toHaveLength(3)
    expect(config.settings).toMatchObject({ mode: 'normal', runs: 10, accuracy: 1 })
  })

  it('gear and level raise the general built for battle', () => {
    const slot = defaultConfig().ally[0]
    const bare = buildGeneral(slot)
    const geared = buildGeneral({ ...slot, gear: { weapon: { set: 'martial', grade: 'legendary', level: 10 }, armor: { set: 'command', grade: 'legendary', level: 10 }, accessory: { set: 'speed', grade: 'legendary', level: 10 } } })
    const higher = buildGeneral({ ...slot, level: slot.level + 20 })
    expect(geared.martial).toBeGreaterThan(bare.martial)
    expect(geared.attack).toBeGreaterThan(bare.attack)
    expect(geared.defense).toBeGreaterThan(bare.defense)
    expect(higher.attack).toBeGreaterThan(bare.attack)
    expect(previewSlot(slot).morale).toBeGreaterThan(0)
  })
})

describe('밸런스 시뮬레이션', () => {
  it('runs a batch and a stronger team wins more', async () => {
    const config = defaultConfig()
    config.settings.runs = 20
    const even = await runBatch(config, undefined, { rng: seeded(7) })
    expect(even.runs).toBe(20)
    expect(even.stars.reduce((a, b) => a + b, 0)).toBe(20)
    const strong = { ...config, ally: config.ally.map(slot => ({ ...slot, level: 50, stars: 5 })) }
    const strongResult = await runBatch(strong, undefined, { rng: seeded(7) })
    expect(strongResult.winRate).toBeGreaterThanOrEqual(even.winRate)
    expect(strongResult.ally.some(lane => lane.casts > 0)).toBe(true)
  })

  it('records a timeline for one battle', () => {
    const { result, timeline } = runSingle(defaultConfig(), seeded(3))
    expect(result.durationMs).toBeGreaterThan(0)
    expect(timeline.length).toBeGreaterThan(3)
  })
})

describe('열람 권한', () => {
  it('is open to everyone before launch', () => {
    expect(balanceAccess(false, null)).toMatchObject({ allowed: true, reason: 'prelaunch' })
  })
  it('is operator-only after launch', () => {
    expect(balanceAccess(true, null)).toMatchObject({ allowed: false, reason: 'login_required' })
    expect(balanceAccess(true, { role: 'user', email: 'a@b.c' })).toMatchObject({ allowed: false, reason: 'not_operator' })
    expect(balanceAccess(true, { role: 'admin' })).toMatchObject({ allowed: true, reason: 'operator' })
    expect(balanceAccess(true, { role: 'user', email: 'Op@X.com' }, 'op@x.com')).toMatchObject({ allowed: true })
  })
})
