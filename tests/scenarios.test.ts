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

  it('multiplies every scenario reward except gold by ten', () => {
    const reward = SCENARIOS[0].reward
    expect(reward).toEqual({ gold: 10, honor: 800, silver: 5000, manuals: 200, grain: 8000, wood: 5000, iron: 3000, influence: 1200 })
  })
})
