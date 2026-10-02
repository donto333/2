import { describe, expect, it } from 'vitest'
import { allGenerals, combatPower, createInitialState, ensureResearchRoster, findGeneral, recruit, skillPower, skillUnlockLevel, toggleFormation, upgrade, unlockResearch, unlockSkill } from '../src/game/strategy'

describe('commander attributes', () => {
  it('starts with the four battle attributes and uses them in combat power', () => {
    const state = createInitialState()
    const guanYu = findGeneral(state, 'guan-yu')!
    expect(guanYu.leadership).toBe(96)
    expect(guanYu.martial).toBe(98)
    expect(guanYu.stratagem).toBe(72)
    expect(guanYu.speed).toBe(86)
    expect(combatPower(guanYu)).toBeGreaterThan(0)
  })

  it('raises the four attributes when a general is upgraded', () => {
    const state = createInitialState()
    const guanYu = findGeneral(state, 'guan-yu')!
    const before = { leadership: guanYu.leadership, martial: guanYu.martial, stratagem: guanYu.stratagem, speed: guanYu.speed }
    const result = upgrade(state, 'guan-yu')
    expect(result.ok).toBe(true)
    expect(guanYu.leadership).toBe(before.leadership + 3)
    expect(guanYu.martial).toBe(before.martial + 7)
    expect(guanYu.stratagem).toBe(before.stratagem + 2)
    expect(guanYu.speed).toBe(before.speed + 2)
  })

  it('makes higher stars unlock skills earlier and strengthen skill power', () => {
    const state = createInitialState()
    const general = allGenerals().find(item => item.id === 'lu-bu')!
    state.generals.push(general)
    general.stars = 3
    general.level = skillUnlockLevel(general)
    const beforePower = skillPower(general)
    expect(skillUnlockLevel(general)).toBe(8)
    expect(unlockSkill(state, general.id).ok).toBe(true)
    expect(general.skillUnlocked).toBe(true)
    expect(skillPower(general)).toBe(beforePower)
    general.skillRank = 4
    general.skillPower = skillPower(general) + 18
    expect(skillPower(general)).toBeGreaterThan(beforePower)
  })

  it('applies the current star tier to every future level-up stat gain', () => {
    const state = createInitialState()
    const general = findGeneral(state, 'guan-yu')!
    general.stars = 4
    const beforeAttack = general.attack
    const beforeMartial = general.martial
    expect(upgrade(state, general.id).ok).toBe(true)
    expect(general.attack - beforeAttack).toBe(10)
    expect(general.martial - beforeMartial).toBe(10)
  })

  it('includes the original roster plus 50 new Three Kingdoms generals', () => {
    const generals = allGenerals()
    expect(generals).toHaveLength(65)
    expect(new Set(generals.map(general => general.id)).size).toBe(65)
    expect(generals.some(general => general.id === 'liu-bei')).toBe(true)
    expect(generals.some(general => general.id === 'da-qiao')).toBe(true)
  })

  it('returns ten visible rewards for a ten-pull and charges the ten-pull cost', () => {
    const state = createInitialState()
    const before = state.honor
    const result = recruit(state, 10)
    expect(result.ok).toBe(true)
    expect(result.rewards).toHaveLength(10)
    expect(state.honor).toBe(before - 900)
  })

  it('keeps formation at three slots and replaces the last slot when full', () => {
    const state = createInitialState()
    state.generals.push(findGeneral({ ...state, generals: allGenerals() } as typeof state, 'liu-bei')!)
    toggleFormation(state, 'liu-bei')
    expect(state.formation).toEqual(['guan-yu', 'zhao-yun', 'liu-bei'])
    toggleFormation(state, 'zhuge-liang')
    expect(state.formation).toHaveLength(3)
    expect(state.formation[2]).toBe('zhuge-liang')
  })

  it('starts with 58 technologies across four branches', () => {
    const state = createInitialState()
    expect(state.research).toHaveLength(58)
    expect(new Set(state.research.map(node => node.id)).size).toBe(58)
    expect(state.research.filter(node => node.branch === '농정')).toHaveLength(14)
    expect(state.research.filter(node => node.branch === '군제')).toHaveLength(15)
  })

  it('backfills the 50 new technologies into legacy eight-node saves', () => {
    const state = createInitialState()
    state.research = state.research.slice(0, 8)
    ensureResearchRoster(state)
    expect(state.research).toHaveLength(58)
    expect(state.research.some(node => node.id === 'military-13')).toBe(true)
  })

  it('requires the expanded research chain before unlocking a later technology', () => {
    const state = createInitialState()
    expect(unlockResearch(state, 'agri-2').ok).toBe(false)
    expect(unlockResearch(state, 'irrigation').ok).toBe(true)
    expect(unlockResearch(state, 'granary').ok).toBe(true)
    expect(unlockResearch(state, 'agri-1').ok).toBe(true)
    expect(unlockResearch(state, 'agri-2').ok).toBe(true)
  })
})
