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

  it('첫 시나리오 보상: 금화 중심(옥패·은전·병서는 작게), 내정 자원은 그대로', () => {
    const reward = SCENARIOS[0].reward
    expect(reward).toEqual({ gold: 11, honor: 200, silver: 2000, manuals: 20, grain: 8000, wood: 5000, iron: 3000, influence: 1200 })
  })
})

describe('시나리오 내용', () => {
  it('모든 시나리오에 100자 이내 내용이 있고 한자를 쓰지 않는다', () => {
    SCENARIOS.forEach(scenario => {
      expect(scenario.story.length).toBeGreaterThan(20)
      expect(scenario.story.length).toBeLessThanOrEqual(100)
      expect(/[一-鿿]/.test(scenario.story)).toBe(false)
    })
  })
})

describe('시나리오 영문판', () => {
  it('모든 시나리오에 영문 제목과 내용이 있다', () => {
    SCENARIOS.forEach(scenario => {
      expect(scenario.titleEn.length).toBeGreaterThan(3)
      expect(scenario.storyEn.length).toBeGreaterThan(40)
      expect(scenario.storyEn.length).toBeLessThanOrEqual(200)
      expect(/[가-힣一-鿿]/.test(scenario.titleEn + scenario.storyEn)).toBe(false)
    })
  })
})
