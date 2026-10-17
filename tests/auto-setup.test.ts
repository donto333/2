import { describe, expect, it } from 'vitest'
import { allGenerals, autoEquip, autoFormation, combatPower, createInitialState, drawEquipment, equipmentPower, scaleGeneral, totalPower } from '../src/game/strategy'

const catalog = allGenerals()
const own = (state: ReturnType<typeof createInitialState>, ids: string[], level = 10) => {
  state.generals = ids.map(id => scaleGeneral({ ...catalog.find(general => general.id === id)!, level: 1, stars: 1 }, level, 1))
  state.formation = [ids[0]]
}

describe('자동 편성', () => {
  it('picks three generals and is at least as strong as the strongest three by power', () => {
    const state = createInitialState()
    own(state, ['song-xian', 'gao-shun', 'wen-ping', 'guan-yu', 'zhao-yun', 'lu-bu', 'cao-ren', 'zhuge-liang'])
    const result = autoFormation(state)
    expect(result.ok).toBe(true)
    expect(state.formation).toHaveLength(3)
    expect(new Set(state.formation).size).toBe(3)
    const top3 = [...state.generals].sort((left, right) => combatPower(right) - combatPower(left)).slice(0, 3)
    const top3Power = top3.reduce((sum, general) => sum + combatPower(general), 0)
    // 수호형(전열)을 넣으면 가산점이 있어 순수 전투력 상위 3명보다 조금 낮을 수 있다
    expect(totalPower(state)).toBeGreaterThanOrEqual(top3Power * 0.9)
    expect(state.formation).not.toContain('song-xian')
  })

  it('prefers a bond when the trio is close in power', () => {
    const state = createInitialState()
    own(state, ['liu-bei', 'guan-yu', 'zhang-fei', 'xu-chu'], 10)
    autoFormation(state)
    expect([...state.formation].sort()).toEqual(['guan-yu', 'liu-bei', 'zhang-fei'])
  })

  it('places a guardian (or else the sturdiest general) in the center lane (front line)', () => {
    const state = createInitialState()
    own(state, ['cao-ren', 'guan-yu', 'ma-chao'], 10)
    autoFormation(state)
    expect(state.formation[1]).toBe('cao-ren')
    const noTank = createInitialState()
    own(noTank, ['lu-bu', 'guan-yu', 'ma-chao'], 10)
    autoFormation(noTank)
    const center = noTank.generals.find(general => general.id === noTank.formation[1])!
    expect(noTank.generals.every(general => center.defense + center.leadership >= general.defense + general.leadership)).toBe(true)
  })
})

describe('자동 장착', () => {
  it('fills the formation with the best gear and never gives one item to two generals', () => {
    const state = createInitialState()
    state.gold = 1e6; state.honor = 1e7
    for (let i = 0; i < 8; i += 1) drawEquipment(state, 10)
    const before = state.formation.reduce((sum, id) => sum + equipmentPower(state, id), 0)
    const result = autoEquip(state)
    expect(result.ok).toBe(true)
    const after = state.formation.reduce((sum, id) => sum + equipmentPower(state, id), 0)
    expect(after).toBeGreaterThanOrEqual(before)
    const worn = Object.values(state.equipmentLoadouts).flatMap(loadout => Object.values(loadout))
    expect(new Set(worn).size).toBe(worn.length)
    state.formation.forEach(id => expect(Object.keys(state.equipmentLoadouts[id] ?? {}).length).toBe(3))
  })

  it('reports nothing to do when already optimal', () => {
    const state = createInitialState()
    autoEquip(state)
    expect(autoEquip(state).changed).toBe(0)
  })
})
