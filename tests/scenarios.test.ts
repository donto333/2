import { describe, expect, it } from 'vitest'
import { SCENARIOS, firstClearReward } from '../src/game/scenarios'

describe('scenario replay rewards', () => {
  it('defines the complete 58-episode chronicle', () => {
    expect(SCENARIOS).toHaveLength(58)
    expect(new Set(SCENARIOS.map(scenario => scenario.id)).size).toBe(58)
  })

  it('grants a reward only on the first clear and allows replay without reward', () => {
    const scenario = SCENARIOS[0]
    expect(firstClearReward(scenario, [])).toEqual(scenario.reward)
    expect(firstClearReward(scenario, [scenario.id])).toBeNull()
  })
})
