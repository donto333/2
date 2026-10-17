import { describe, expect, it } from 'vitest'
import { allGenerals, createInitialState, grantAllGenerals } from '../src/game/strategy'

describe('미리보기 계정', () => {
  it('모든 무장을 한 명씩 보유하고, 다시 불러도 중복되지 않는다', () => {
    const state = createInitialState()
    const before = state.generals.length
    const added = grantAllGenerals(state)
    expect(added).toBe(allGenerals().length - before)
    expect(new Set(state.generals.map(g => g.id)).size).toBe(allGenerals().length)
    expect(state.formation.length).toBe(3)
    expect(grantAllGenerals(state)).toBe(0)
  })
})
