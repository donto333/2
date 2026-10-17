import { describe, expect, it } from 'vitest'
import { battleResearch, cancelResearch, normalizeResearch, researchMods, researchStatus, rushCost, rushResearch, settleResearch, startResearch, RESEARCH_MINUTES } from '../src/game/research'
import { createInitialState, recruitCost, type StrategyState } from '../src/game/strategy'

function rich(): StrategyState {
  const state = createInitialState()
  state.resources = { grain: 1e6, silver: 1e6, wood: 1e6, iron: 1e6, influence: 1e6 }
  state.silver = 1e6
  state.gold = 1000
  return state
}
function finish(state: StrategyState, id: string, now: number): number {
  expect(startResearch(state, id, now).ok).toBe(true)
  const node = state.research.find(item => item.id === id)!
  const end = node.endsAt!
  expect(settleResearch(state, end).map(item => item.id)).toEqual([id])
  return end
}

describe('timed research', () => {
  it('uses longer research times for higher tiers', () => {
    expect(RESEARCH_MINUTES).toEqual([5, 20, 60, 120, 240, 480])
    const state = createInitialState()
    for (const node of state.research) expect(node.durationMs).toBe(RESEARCH_MINUTES[node.tier - 1] * 60_000)
  })

  it('charges on start, finishes only after the timer, and allows one at a time', () => {
    const state = rich()
    const before = state.resources.influence
    expect(startResearch(state, 'econ-1', 1000).ok).toBe(true)
    expect(state.resources.influence).toBe(before - 600)
    expect(startResearch(state, 'army-1', 1000).ok).toBe(false)
    expect(researchStatus(state, state.research.find(node => node.id === 'army-1')!)).toBe('busy')
    expect(settleResearch(state, 1000 + 5 * 60_000 - 1)).toHaveLength(0)
    expect(settleResearch(state, 1000 + 5 * 60_000)).toHaveLength(1)
    expect(researchMods(state).grain).toBeCloseTo(0.15)
    expect(startResearch(state, 'army-1', 400_000).ok).toBe(true)
  })

  it('refunds everything on cancel', () => {
    const state = rich()
    const snapshot = { ...state.resources }
    startResearch(state, 'realm-1', 0)
    expect(cancelResearch(state).ok).toBe(true)
    expect(state.resources).toEqual(snapshot)
    expect(state.research.every(node => node.endsAt === undefined)).toBe(true)
  })

  it('rushes with gold: one gold per 10 minutes left', () => {
    expect(rushCost(1)).toBe(1)
    expect(rushCost(10 * 60_000)).toBe(1)
    expect(rushCost(10 * 60_000 + 1)).toBe(2)
    expect(rushCost(8 * 3_600_000)).toBe(48)
    const state = rich()
    startResearch(state, 'talent-1', 0)
    expect(rushResearch(state, 60_000).ok).toBe(true)
    expect(state.gold).toBe(999)
    expect(state.research.find(node => node.id === 'talent-1')!.unlocked).toBe(true)
  })

  it('keeps only one side of a tier-3 choice', () => {
    const state = rich()
    let now = finish(state, 'talent-1', 0)
    now = finish(state, 'talent-2', now)
    expect(recruitCost(state, 1)).toBe(90)
    now = finish(state, 'talent-3a', now)
    expect(researchMods(state).recruitRate).toBe(true)
    expect(researchStatus(state, state.research.find(node => node.id === 'talent-3b')!)).toBe('switch')
    finish(state, 'talent-3b', now)
    expect(researchMods(state).recruitRate).toBe(false)
    expect(researchMods(state).enhanceCost).toBeCloseTo(0.15)
    // 3단계가 하나라도 끝났으므로 4단계는 열려 있다
    expect(researchStatus(state, state.research.find(node => node.id === 'talent-4')!)).toBe('available')
  })

  it('feeds battle modifiers to the battle core', () => {
    const state = rich()
    let now = finish(state, 'army-1', 0)
    now = finish(state, 'army-2', now)
    finish(state, 'army-3b', now)
    const battle = battleResearch(state)
    expect(battle.troops).toBeCloseTo(0.08)
    expect(battle.archerAtk).toBeCloseTo(0.12)
    expect(battle.damageTaken).toBeCloseTo(0.1)
    expect(battle.chargeSkill).toBe(0)
  })

  it('refunds legacy unlocked research and keeps a running timer through reload', () => {
    const state = rich()
    startResearch(state, 'strat-1', 0)
    const influence = state.resources.influence
    state.research.push({ id: 'irrigation', name: '관개', branch: '부국', tier: 1, description: '', cost: { influence: 300, grain: 500 }, durationMs: 0, unlocked: true })
    const refund = normalizeResearch(state)
    expect(refund).toEqual({ influence: 300, grain: 500 })
    expect(state.resources.influence).toBe(influence + 300)
    expect(state.research).toHaveLength(40)
    expect(state.research.find(node => node.id === 'strat-1')!.endsAt).toBe(5 * 60_000)
    expect(normalizeResearch(state)).toBeNull()
  })
})
