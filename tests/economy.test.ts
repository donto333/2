import { describe, expect, it } from 'vitest'
import { MANUAL_PACKAGE_AMOUNTS, SCENARIO_GOLD_BY_CHAPTER, scenarioGold } from '../server/economy.mjs'
import { SCENARIOS } from '../src/game/scenarios'
import { createInitialState, purchaseResourcePackage, MANUAL_SHOP_PACKAGES } from '../src/game/strategy'
import { ensureMissions } from '../src/game/missions'
import { dailyFreeIncome, summarizeWalls } from '../src/balance/progression'

describe('재화 밸런스', () => {
  it('시나리오 금화는 서버와 같은 장별 표를 쓰고, 뒤 장일수록 줄지 않는다', () => {
    SCENARIOS.forEach(scenario => expect(scenario.reward.gold).toBe(scenarioGold(scenario.chapterIndex)))
    for (let i = 1; i < SCENARIO_GOLD_BY_CHAPTER.length; i += 1) expect(SCENARIO_GOLD_BY_CHAPTER[i]).toBeGreaterThanOrEqual(SCENARIO_GOLD_BY_CHAPTER[i - 1])
    expect(scenarioGold(99)).toBe(SCENARIO_GOLD_BY_CHAPTER[SCENARIO_GOLD_BY_CHAPTER.length - 1])
  })
  it('병서는 금화로 산다(큰 묶음일수록 금화당 더 많이)', () => {
    const state = createInitialState()
    state.gold = 20
    const before = state.manuals
    expect(purchaseResourcePackage(state, 'manuals-10').ok).toBe(true)
    expect(state.manuals).toBe(before + MANUAL_SHOP_PACKAGES[1].manuals)
    expect(state.gold).toBe(10)
    const rates = MANUAL_PACKAGE_AMOUNTS.map(([gold, manuals]) => manuals / gold)
    for (let i = 1; i < rates.length; i += 1) expect(rates[i]).toBeGreaterThan(rates[i - 1])
  })
  it('일반 전투 보상 횟수는 날이 바뀌면 0으로', () => {
    const state = createInitialState()
    const missions = ensureMissions(state, Date.UTC(2026, 9, 13, 3))
    missions.repeatWins = 5
    ensureMissions(state, Date.UTC(2026, 9, 14, 3))
    expect(state.missions?.repeatWins).toBe(0)
  })
  it('무료 플레이 하루 수입과 정체 요약', () => {
    const daily = dailyFreeIncome()
    expect(daily.manuals).toBeGreaterThan(0)
    expect(daily.honor).toBeGreaterThan(0)
    const row = (chapter: number, added: number) => ({ n: 1, chapter, title: '', enemyLevel: 1, winRate: 1, teamLevel: 1, team: '', goldEarned: 0, added })
    const walls = summarizeWalls([{ rows: [row(4, 40)], scenarioGold: 0, added: 40 }, { rows: [row(4, 0)], scenarioGold: 0, added: 0 }, { rows: [row(4, 60)], scenarioGold: 0, added: 60 }], 15)
    expect(walls[3].median).toBe(40)
    expect(walls[3].stuckShare).toBeCloseTo(2 / 3)
  })
})
