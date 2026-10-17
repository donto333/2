import { describe, expect, it } from 'vitest'
import { DUMMY_GARRISON_LEVEL_BY_CITY_LEVEL, LEVEL_RESET_GOLD, createInitialState, ensureCityGarrisons, levelResetRefund, resetGeneralLevel, upgrade } from '../src/game/strategy'

describe('무장 레벨 초기화', () => {
  it('금화 10개를 쓰고 Lv.1로, 레벨에 쓴 은전 · 병서의 80%를 돌려준다', () => {
    const state = createInitialState()
    state.gold = 50; state.silver = 10_000_000; state.manuals = 100_000
    const general = state.generals[0]
    const before = { silver: state.silver, manuals: state.manuals, stats: general.martial }
    for (let i = 0; i < 19; i += 1) expect(upgrade(state, general.id).ok).toBe(true)
    const spent = { silver: before.silver - state.silver, manuals: before.manuals - state.manuals }
    expect(levelResetRefund(state, general)).toEqual({ silver: Math.floor(spent.silver * 0.8), manuals: Math.floor(spent.manuals * 0.8) })
    const result = resetGeneralLevel(state, general.id)
    expect(result.ok).toBe(true)
    expect(general.level).toBe(1)
    expect(general.martial).toBe(before.stats)
    expect(state.gold).toBe(50 - LEVEL_RESET_GOLD)
    expect(state.silver).toBe(before.silver - spent.silver + Math.floor(spent.silver * 0.8))
  })

  it('금화가 모자라거나 이미 Lv.1이면 하지 않는다', () => {
    const state = createInitialState()
    const general = state.generals[0]
    state.gold = 100
    expect(resetGeneralLevel(state, general.id).ok).toBe(general.level > 1)
    general.level = 10; state.gold = 9
    expect(resetGeneralLevel(state, general.id).ok).toBe(false)
    expect(general.level).toBe(10)
  })
})

describe('중립 도시 수비대', () => {
  it('옛 저장의 수비대 레벨도 새 기준(2배)으로 맞춘다', () => {
    const state = createInitialState()
    ensureCityGarrisons(state)
    const city = state.cities.find(item => item.owner === '중립')!
    city.garrisons = city.garrisons!.map(garrison => ({ ...garrison, averageLevel: 5 }))
    city.defendersDefeated = 1
    ensureCityGarrisons(state)
    expect(city.garrisons!.every(garrison => garrison.averageLevel === DUMMY_GARRISON_LEVEL_BY_CITY_LEVEL[city.level as 1])).toBe(true)
    expect(city.defendersDefeated).toBe(1)
    expect(DUMMY_GARRISON_LEVEL_BY_CITY_LEVEL[1]).toBe(20)
  })
})
