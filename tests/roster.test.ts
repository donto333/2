import { describe, expect, it } from 'vitest'
import { affordableUpgrades, createInitialState, setFormationSlot, upgradeCost, upgradeMany } from '../src/game/strategy'

describe('보유 무장: 자리 교체·연속 강화', () => {
  it('출전 중인 무장끼리는 자리를 맞바꾸고, 대기 무장은 고른 자리에 들어간다', () => {
    const state = createInitialState()
    const [a, b, c] = state.formation
    setFormationSlot(state, c, 0)
    expect(state.formation).toEqual([c, b, a])
    const reserve = { ...state.generals[0], id: 'test-reserve', name: '시험' }
    state.generals.push(reserve)
    setFormationSlot(state, 'test-reserve', 1)
    expect(state.formation).toEqual([c, 'test-reserve', a])
  })
  it('연속 강화는 재료가 되는 만큼만, 최대 10회', () => {
    const state = createInitialState()
    const id = state.formation[0]
    const general = state.generals.find(g => g.id === id)!
    state.silver = 1e9; state.resources.silver = state.silver; state.manuals = 1e6
    expect(affordableUpgrades(state, id)).toBe(10)
    const before = general.level
    expect(upgradeMany(state, id).ok).toBe(true)
    expect(general.level).toBe(before + 10)
    const cost = upgradeCost(state, general)
    state.silver = cost.silver * 2; state.resources.silver = state.silver
    expect(affordableUpgrades(state, id)).toBeLessThanOrEqual(2)
  })
})
