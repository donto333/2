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

  it('첫 시나리오 보상: 금화 중심(명망·은전·병서는 작게), 내정 자원은 그대로', () => {
    const reward = SCENARIOS[0].reward
    expect(reward).toEqual({ gold: 11, honor: 200, silver: 2000, manuals: 20, grain: 8000, wood: 5000, iron: 3000, influence: 1200 })
  })
})
