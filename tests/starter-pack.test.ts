import { describe, expect, it } from 'vitest'
import { STARTER_PACKS, claimStarterPack, createInitialState, starterPackBought } from '../src/game/strategy'
import { ensureMissions } from '../src/game/missions'

describe('신규유저 패키지', () => {
  it('정식 출시 전에는 무료로 계정당 1회씩 받는다', () => {
    const state = createInitialState()
    ensureMissions(state)
    const before = { generals: state.generals.length, grain: state.resources.grain, silver: state.silver, manuals: state.manuals }
    expect(claimStarterPack(state, 'starter-1', false).ok).toBe(true)
    expect(state.generals.length).toBeGreaterThanOrEqual(before.generals)
    expect(claimStarterPack(state, 'starter-2', false).ok).toBe(true)
    expect(state.missions!.freeRecruits).toBe(50)
    expect(claimStarterPack(state, 'starter-3', false).ok).toBe(true)
    expect(state.missions!.freeDraws).toBe(50)
    expect(claimStarterPack(state, 'starter-4', false).ok).toBe(true)
    expect(state.resources.grain).toBe(before.grain + 100000)
    expect(state.silver).toBe(before.silver + 100000)
    expect(state.manuals).toBe(before.manuals + 500)
    expect(STARTER_PACKS.every(pack => starterPackBought(state, pack.id))).toBe(true)
    expect(claimStarterPack(state, 'starter-2', false).ok).toBe(false)
    expect(state.missions!.freeRecruits).toBe(50)
  })
  it('가격은 4,900 · 9,900 · 9,900 · 9,900원, 출시 후에는 결제 연동 전까지 잠김', () => {
    expect(STARTER_PACKS.map(pack => pack.priceKRW)).toEqual([4900, 9900, 9900, 9900])
    const state = createInitialState()
    ensureMissions(state)
    expect(claimStarterPack(state, 'starter-1', true).ok).toBe(false)
    expect(starterPackBought(state, 'starter-1')).toBe(false)
  })
})
