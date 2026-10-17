import { describe, expect, it } from 'vitest'
import { BATTLE_RULES, BattleCore, HARD_RULE_EFFECT } from '../src/game/battle-core'
import { HARD_LEVEL_BONUS, SCENARIOS, clearedScenarioCount, hardClearReward, hardCleared, hardClearedCount, hardScenarioStars, hardUnlocked, markHardCleared, recordHardStars, scenarioEnemyLevel, scenarioEnemyLevelFor, scenarioEnemyStars, scenarioHardRule, scenarioStars } from '../src/game/scenarios'
import { scaleGeneral, templateGeneral } from '../src/game/strategy'

const deck = (ids: string[], level: number) => ids.map(id => ({ ...scaleGeneral({ ...templateGeneral(id)!, level: 1, stars: 1 }, level, 3), skillUnlocked: true }))

describe('시나리오 어려움 단계', () => {
  it('적은 Lv+10(최대 60) · 별 +1(최대 5)', () => {
    const first = SCENARIOS[0]
    expect(scenarioEnemyLevelFor(first, 'hard')).toBe(scenarioEnemyLevel(first) + HARD_LEVEL_BONUS)
    expect(scenarioEnemyLevelFor(first, 'normal')).toBe(scenarioEnemyLevel(first))
    expect(scenarioEnemyStars(first, 'hard')).toBe(scenarioEnemyStars(first, 'normal') + 1)
    const last = SCENARIOS[SCENARIOS.length - 1]
    expect(scenarioEnemyLevelFor(last, 'hard')).toBeLessThanOrEqual(60)
    expect(scenarioEnemyStars(last, 'hard')).toBe(5)
  })

  it('보통을 깨고 앞 단계 어려움을 깨야 열린다', () => {
    const cleared: string[] = []
    expect(hardUnlocked(cleared, SCENARIOS[0])).toBe(false)
    cleared.push(SCENARIOS[0].id, SCENARIOS[1].id)
    expect(hardUnlocked(cleared, SCENARIOS[0])).toBe(true)
    expect(hardUnlocked(cleared, SCENARIOS[1])).toBe(false)
    markHardCleared(cleared, SCENARIOS[0].id)
    expect(hardUnlocked(cleared, SCENARIOS[1])).toBe(true)
  })

  it('기록은 보통과 따로: 별·클리어 수가 섞이지 않는다', () => {
    const id = SCENARIOS[0].id
    const cleared = [id]
    recordHardStars(cleared, id, 2)
    markHardCleared(cleared, id)
    markHardCleared(cleared, id)
    expect(hardScenarioStars(cleared, id)).toBe(2)
    expect(scenarioStars(cleared, id)).toBe(0)
    expect(recordHardStars(cleared, id, 1)).toBe(false)
    expect(recordHardStars(cleared, id, 3)).toBe(true)
    expect(hardScenarioStars(cleared, id)).toBe(3)
    expect(hardCleared(cleared, id)).toBe(true)
    expect(hardClearedCount(cleared)).toBe(1)
    expect(clearedScenarioCount(cleared)).toBe(1)
  })

  it('첫 클리어 보상: 금화 없음 · 옥패 1.5배 · 은전·병서 절반 · 한 번만', () => {
    const scenario = SCENARIOS[10]
    const reward = hardClearReward(scenario, [])!
    expect(reward.gold).toBe(0)
    expect(reward.honor).toBe(Math.round(scenario.reward.honor * 1.5))
    expect(reward.silver).toBe(Math.round(scenario.reward.silver * 0.5))
    expect(reward.manuals).toBe(Math.round(scenario.reward.manuals * 0.5))
    expect(reward.grain).toBe(scenario.reward.grain)
    const cleared: string[] = []
    markHardCleared(cleared, scenario.id)
    expect(hardClearReward(scenario, cleared)).toBeNull()
  })

  it('특수 규칙 네 가지가 돌아가며 붙는다', () => {
    const rules = new Set(SCENARIOS.map(scenarioHardRule))
    expect([...rules].sort()).toEqual(['fog', 'iron', 'nofire', 'swift'])
  })

  it('속전은 60초, 철벽은 적 사기 +20, 화공 금지는 화상이 걸리지 않는다', () => {
    const players = deck(['zhou-yu', 'lu-xun', 'huang-gai'], 30)
    const enemies = deck(['cao-cao', 'cao-ren', 'zhang-liao'], 30)
    const normal = new BattleCore(players, enemies, { mode: 'scenario' })
    expect(normal.timeLimit).toBe(BATTLE_RULES.timeLimit)
    expect(new BattleCore(players, enemies, { mode: 'scenario', hardRule: 'swift' }).timeLimit).toBe(HARD_RULE_EFFECT.swiftTime)
    expect(new BattleCore(players, enemies, { mode: 'scenario', hardRule: 'iron' }).moraleMax).toBe(normal.moraleMax + HARD_RULE_EFFECT.ironMorale)
    const noFire = new BattleCore(players, enemies, { mode: 'scenario', hardRule: 'nofire' })
    noFire.addEffect('debuff', 'burning', 5)
    expect(noFire.debuffs.some(effect => effect.id === 'burning')).toBe(false)
    normal.addEffect('debuff', 'burning', 5)
    expect(normal.debuffs.some(effect => effect.id === 'burning')).toBe(true)
  })

  it('속전 전투는 60초가 지나면 끝난다', () => {
    const core = new BattleCore(deck(['guan-hai', 'zhou-cang', 'zhang-liang'], 1), deck(['simayi', 'zhang-he', 'xu-huang'], 60), { mode: 'scenario', hardRule: 'swift' })
    while (core.active && core.t < 100) { core.tick(0.1); core.drainEvents() }
    expect(core.t).toBeLessThanOrEqual(HARD_RULE_EFFECT.swiftTime + 0.2)
  })
})
