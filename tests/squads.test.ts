import { describe, expect, it } from 'vitest'
import { applySquadCombo, autoEquipSquad, autoSquad, ensureSquads, squadIds, squadOf, swapWithFirstSquad, toggleSquadMember } from '../src/game/squads'
import { createInitialState, equipEquipment, makeEquipment, templateGeneral } from '../src/game/strategy'

const withRoster = () => {
  const state = createInitialState()
  for (const id of ['guan-yu', 'zhang-fei', 'zhao-yun', 'cao-ren', 'xu-chu', 'sima-yi']) if (!state.generals.some(general => general.id === id)) state.generals.push({ ...templateGeneral(id)!, level: 5 })
  return state
}

describe('1·2·3군 편성', () => {
  it('추천 덱을 2군에 세우면 다른 군에서 옮겨 오고, 1군은 최소 1명 남긴다', () => {
    const state = withRoster()
    expect(toggleSquadMember(state, 2, 'zhao-yun').ok).toBe(true)
    expect(applySquadCombo(state, 1, ['guan-yu', 'zhang-fei', 'zhao-yun']).ok).toBe(true)
    expect(squadIds(state, 1)).toEqual(['guan-yu', 'zhang-fei', 'zhao-yun'])
    expect(squadIds(state, 2)).not.toContain('zhao-yun')
    state.formation = ['cao-ren']
    expect(applySquadCombo(state, 2, ['cao-ren', 'xu-chu', 'guan-yu']).ok).toBe(false)
    expect(applySquadCombo(state, 2, ['nobody', 'xu-chu', 'guan-yu']).ok).toBe(false)
    expect(state.formation).toEqual(['cao-ren'])
  })
  it('한 무장은 한 군에만 선다: 다른 군에서 옮겨 오고, 1군에 넣으면 2·3군에서 빠진다', () => {
    const state = withRoster()
    expect(toggleSquadMember(state, 1, 'guan-yu').ok).toBe(true)
    expect(squadOf(state, 'guan-yu')).toBe(1)
    expect(toggleSquadMember(state, 2, 'guan-yu').ok).toBe(true)
    expect(squadIds(state, 1)).not.toContain('guan-yu')
    expect(squadIds(state, 2)).toContain('guan-yu')
    state.formation = [...state.formation.slice(0, 2), 'guan-yu']
    ensureSquads(state)
    expect(squadIds(state, 2)).not.toContain('guan-yu')
    // 1군 무장을 2군으로 옮기면 1군에서 빠진다(마지막 1명은 못 옮김)
    const first = state.formation[0]
    expect(toggleSquadMember(state, 1, first).ok).toBe(true)
    expect(state.formation).not.toContain(first)
  })
  it('자동 편성은 다른 군에 없는 무장으로 짜고, 1군과 바꿀 수 있다', () => {
    const state = withRoster()
    expect(autoSquad(state, 1).ok).toBe(true)
    expect(autoSquad(state, 2).ok).toBe(true)
    const all = [state.formation, squadIds(state, 1), squadIds(state, 2)].flat()
    expect(new Set(all).size).toBe(all.length)
    const before = [...state.formation], second = [...squadIds(state, 1)]
    expect(swapWithFirstSquad(state, 1).ok).toBe(true)
    expect(state.formation).toEqual(second)
    expect(squadIds(state, 1)).toEqual(before)
  })
  it('2군 자동 장착은 1군 무장이 낀 장비를 빼앗지 않는다', () => {
    const state = withRoster()
    state.equipmentInventory.push({ ...makeEquipment('weapon', 'martial', 'legendary', 1), id: 'best' })
    expect(equipEquipment(state, state.formation[0], 'best').ok).toBe(true)
    autoSquad(state, 1)
    autoEquipSquad(state, 1)
    expect(state.equipmentLoadouts[state.formation[0]].weapon).toBe('best')
    for (const id of squadIds(state, 1)) expect(state.equipmentLoadouts[id]?.weapon).not.toBe('best')
  })
})
