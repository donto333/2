import { describe, expect, it } from 'vitest'
import { BATTLE_RULES, BattleCore, simulateBattle } from '../src/game/battle-core'
import { allGenerals, scaleGeneral, type General } from '../src/game/strategy'

const catalog = allGenerals()
const pick = (ids: string[], level = 1, stars = 1, unlocked = false): General[] =>
  ids.map(id => ({ ...scaleGeneral({ ...catalog.find(general => general.id === id)!, level: 1, stars: 1 }, level, stars), skillUnlocked: unlocked }))
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const run = (core: BattleCore, seconds: number) => { for (let t = 0; t < seconds && core.active; t += 0.05) core.tick(0.05) }

describe('battle core (전투 개선안)', () => {
  it('judges only the first input for each callout, so mashing cannot farm combo', () => {
    const core = new BattleCore(pick(['xu-shu', 'wei-yan', 'meng-huo']), pick(['song-xian', 'wen-ping', 'gao-shun']), { rng: seeded(7) })
    run(core, BATTLE_RULES.firstPatternAt + 0.05)
    const lane = core.pattern!.def.kind === 'lane' ? core.pattern!.def.lanes[0] : 0
    for (let i = 0; i < 10; i += 1) core.command(lane)
    expect(core.combo).toBeLessThanOrEqual(1)
    expect(core.pattern!.judged).toBe(true)
  })

  it('advances the act when enemy morale reaches zero and wins after act 3', () => {
    const core = new BattleCore(pick(['xu-shu', 'wei-yan', 'meng-huo']), pick(['song-xian', 'wen-ping', 'gao-shun']), { rng: seeded(3) })
    expect(core.moraleMax).toBe(80)
    core.morale = 0
    core.tick(0.05)
    expect(core.phase).toBe(1)
    expect(core.moraleMax).toBe(100)
    core.morale = 0; core.tick(0.05)
    expect(core.phase).toBe(2)
    core.morale = 0; core.tick(0.05)
    expect(core.active).toBe(false)
    expect(core.result?.won).toBe(true)
    expect(core.result?.reason).toBe('morale')
  })

  it('collapses the line at threat 100 and loses on the second collapse', () => {
    const core = new BattleCore(pick(['xu-shu', 'wei-yan', 'meng-huo']), pick(['song-xian', 'wen-ping', 'gao-shun']), { rng: seeded(5) })
    const before = core.players.map(unit => unit.troops)
    core.threat = 99.5
    ;(core as unknown as { raiseThreat: (n: number, c: string) => void }).raiseThreat(5, 'raw')
    expect(core.collapses).toBe(1)
    expect(core.threat).toBe(50)
    core.players.forEach((unit, index) => expect(unit.troops).toBeLessThan(before[index]))
    core.threat = 99.5
    ;(core as unknown as { raiseThreat: (n: number, c: string) => void }).raiseThreat(5, 'raw')
    core.tick(0.05)
    expect(core.result?.won).toBe(false)
    expect(core.result?.reason).toBe('collapse')
  })

  it('loses on the 90 second limit except in duels, which compare troop ratios', () => {
    const slow = new BattleCore(pick(['xu-shu', 'wei-yan', 'meng-huo']), pick(['song-xian', 'wen-ping', 'gao-shun']), { rng: seeded(9) })
    slow.t = BATTLE_RULES.timeLimit; slow.tick(0.01)
    expect(slow.result?.reason).toBe('timeout')
    const duel = new BattleCore(pick(['xu-shu', 'wei-yan', 'meng-huo']), pick(['song-xian', 'wen-ping', 'gao-shun']), { mode: 'duel', rng: seeded(9) })
    duel.t = BATTLE_RULES.timeLimit; duel.tick(0.01)
    expect(duel.result?.reason).toBe('ratio')
  })

  it('casts per-general skills on separate cooldowns', () => {
    const core = new BattleCore(pick(['guan-yu', 'zhuge-liang', 'liu-bei'], 20, 3, true), pick(['song-xian', 'wen-ping', 'gao-shun'], 20, 3), { rng: seeded(11) })
    core.players.forEach(unit => { unit.cd = 0 })
    expect(core.castSkill(0)).toBe(true)
    expect(core.players[0].cd).toBeGreaterThan(0)
    expect(core.castSkill(1)).toBe(true)
    expect(core.castSkill(0)).toBe(false)
    expect(core.debuffs.some(effect => effect.id === 'armor-break')).toBe(true)
    expect(core.debuffs.some(effect => effect.id === 'confusion')).toBe(true)
  })

  it('applies the peach garden bond for Liu Bei, Guan Yu and Zhang Fei', () => {
    const core = new BattleCore(pick(['liu-bei', 'guan-yu', 'zhang-fei']), pick(['song-xian', 'wen-ping', 'gao-shun']))
    expect(core.bond?.id).toBe('peach-garden')
  })

  it('lets a careful starter deck beat Lv1 enemies far more often than an idle one', () => {
    const rng = seeded(42)
    const starters = ['xu-shu', 'wei-yan', 'meng-huo', 'taishi-ci', 'xiahou-dun', 'guan-ping']
    const enemies = ['song-xian', 'wen-ping', 'gao-shun', 'han-sui', 'ma-dai', 'yuan-shu']
    let idle = 0, careful = 0
    for (let i = 0; i < 40; i += 1) {
      const players = pick([starters[i % 6], starters[(i + 2) % 6], starters[(i + 4) % 6]])
      const foes = pick([enemies[i % 6], enemies[(i + 1) % 6], enemies[(i + 3) % 6]])
      if (simulateBattle(players, foes, { rng }).won) idle += 1
      if (simulateBattle(players, foes, { rng, autoPilot: { accuracy: 0.9, reaction: [0.6, 1.2] } }).won) careful += 1
    }
    expect(careful).toBeGreaterThan(idle + 15)
  })
})
