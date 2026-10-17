import { describe, expect, it } from 'vitest'
import { MAX_GENERAL_LEVEL, affordableUpgrades, clampGeneralLevels, createInitialState, statsAt, templateGeneral, upgrade, upgradeMany } from '../src/game/strategy'

const rich = () => { const state = createInitialState(); state.silver = 1e9; state.resources.silver = state.silver; state.manuals = 1e7; return state }

describe('무장 최고 레벨 60', () => {
  it('Lv.60에서는 더 강화되지 않고 재료도 쓰지 않는다', () => {
    const state = rich()
    const general = state.generals[0]
    general.level = MAX_GENERAL_LEVEL - 1
    expect(upgrade(state, general.id).ok).toBe(true)
    expect(general.level).toBe(60)
    const before = { silver: state.silver, manuals: state.manuals }
    const result = upgrade(state, general.id)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('최고 레벨')
    expect(general.level).toBe(60)
    expect({ silver: state.silver, manuals: state.manuals }).toEqual(before)
    expect(affordableUpgrades(state, general.id, 10)).toBe(0)
  })
  it('연속 강화는 60에서 멈춘다', () => {
    const state = rich()
    const general = state.generals[0]
    general.level = 55
    expect(affordableUpgrades(state, general.id, 10)).toBe(5)
    expect(upgradeMany(state, general.id, 10).ok).toBe(true)
    expect(general.level).toBe(60)
  })
  it('예전에 60을 넘긴 무장은 60으로 맞추고 넘은 레벨에 쓴 은전·병서를 돌려준다', () => {
    const state = createInitialState()
    const general = state.generals[0]
    general.level = 62
    const silver = state.silver, manuals = state.manuals
    const out = clampGeneralLevels(state)
    expect(general.level).toBe(60)
    // Lv60→61, 61→62 두 번의 강화 비용(연구 할인 전)
    expect(out.silver).toBe((650 + 60 * 350) + (650 + 61 * 350))
    expect(out.manuals).toBe((12 + 60 * 2) + (12 + 61 * 2))
    expect(state.silver).toBe(silver + out.silver)
    expect(state.manuals).toBe(manuals + out.manuals)
    expect(general.attack).toBe(statsAt(templateGeneral(general.id)!, 60, general.stars).attack)
    // 두 번 불러도 같다
    expect(clampGeneralLevels(state).generals).toHaveLength(0)
  })
})
