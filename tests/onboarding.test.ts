import { describe, expect, it } from 'vitest'
import { createInitialState, recruit, HONOR_SHOP_PACKAGES } from '../src/game/strategy'
import { ensureMissions, onboardingPending } from '../src/game/missions'
import { ONBOARD_GEAR_COST, ONBOARD_HONOR_PACKAGE, ONBOARD_STEPS } from '../src/ui/onboarding'

describe('첫 입장 튜토리얼', () => {
  it('정해진 순서: 상점 → 모집 → 장비 뽑기 → 자동 편성 → 무장 강화 → 장비 강화 → 시나리오 → 마무리', () => {
    expect(ONBOARD_STEPS.map(step => step.id)).toEqual(['welcome', 'shop', 'recruit', 'gear', 'formation', 'upgrade', 'enhance', 'scenario', 'finale'])
    expect(ONBOARD_STEPS.at(-1)?.body).toBe('무장을 성장시켜 천하를 제패하세요.')
    expect(HONOR_SHOP_PACKAGES.some(item => item.id === ONBOARD_HONOR_PACKAGE)).toBe(true)
  })
  it('무료 10회 모집은 명망을 쓰지 않고 5등급 무장이 반드시 한 명 이상 나온다', () => {
    for (let run = 0; run < 200; run += 1) {
      const state = createInitialState()
      const honor = state.honor
      const result = recruit(state, 10, { free: true, guaranteeGrade: 5 })
      expect(result.ok).toBe(true)
      expect(state.honor).toBe(honor)
      expect(result.rewards.some(general => general.grade === 5)).toBe(true)
    }
  })
  it('새 계정은 튜토리얼이 남아 있고, 이미 전투를 이긴 계정은 건너뛴다', () => {
    const fresh = createInitialState()
    expect(onboardingPending(fresh)).toBe(true)
    const veteran = createInitialState()
    veteran.scenarioCleared = ['scenario-184-1-1']
    delete (veteran as { missions?: unknown }).missions
    expect(ensureMissions(veteran).onboardDone).toBe(true)
  })
  it('튜토리얼 자원 흐름: 금화 100 → 명망 1,000을 사면 장비 10회 뽑기 비용을 낼 수 있다', () => {
    const state = createInitialState()
    const pack = HONOR_SHOP_PACKAGES.find(item => item.id === ONBOARD_HONOR_PACKAGE)!
    expect(pack.goldCost).toBeLessThanOrEqual(100)
    expect(state.honor + pack.honor).toBeGreaterThanOrEqual(ONBOARD_GEAR_COST)
  })
})
