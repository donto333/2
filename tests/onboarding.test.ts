import { describe, expect, it } from 'vitest'
import { allGenerals, createInitialState, recruit, scaleGeneral, HONOR_SHOP_PACKAGES } from '../src/game/strategy'
import { simulateBattle } from '../src/game/battle-core'
import { SCENARIOS, scenarioEnemyIds, scenarioEnemyLevel } from '../src/game/scenarios'
import { ensureMissions, onboardingPending } from '../src/game/missions'
import { ONBOARD_GEAR_COST, ONBOARD_HONOR_PACKAGE, ONBOARD_STEPS } from '../src/ui/onboarding'

describe('첫 입장 튜토리얼', () => {
  it('정해진 순서: 상점 → 모집 → 장비 뽑기 → 자동 편성 → 무장 강화 → 장비 강화 → 시나리오 → 마무리', () => {
    expect(ONBOARD_STEPS.map(step => step.id)).toEqual(['welcome', 'shop', 'recruit', 'gear', 'formation', 'upgrade', 'enhance', 'scenario', 'finale'])
    expect(ONBOARD_STEPS.at(-1)?.body).toBe('무장을 성장시켜 천하를 제패하세요.')
    expect(HONOR_SHOP_PACKAGES.some(item => item.id === ONBOARD_HONOR_PACKAGE)).toBe(true)
  })
  it('무료 10회 모집은 옥패를 쓰지 않고 5등급 무장이 반드시 한 명 이상 나온다', () => {
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
  it('튜토리얼 자원 흐름: 금화 100 → 옥패 1,000을 사면 장비 10회 뽑기 비용을 낼 수 있다', () => {
    const state = createInitialState()
    const pack = HONOR_SHOP_PACKAGES.find(item => item.id === ONBOARD_HONOR_PACKAGE)!
    expect(pack.goldCost).toBeLessThanOrEqual(100)
    expect(state.honor + pack.honor).toBeGreaterThanOrEqual(ONBOARD_GEAR_COST)
  })
  it('튜토리얼 첫 시나리오는 쉬운 전투: 5등급 1명이 있는 편성이면 경고를 못 막아도 이긴다', () => {
    const lib = new Map(allGenerals().map(general => [general.id, general]))
    const scenario = SCENARIOS[0]
    const level = scenarioEnemyLevel(scenario)
    const make = (id: string, lv: number) => ({ ...scaleGeneral({ ...lib.get(id)!, level: 1, stars: 1 }, lv, 1), skillUnlocked: false })
    let seed = 11
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    let easyWins = 0, normalWins = 0
    for (let run = 0; run < 40; run += 1) {
      const enemies = () => scenarioEnemyIds(scenario, '촉한').map((id, index) => make(id, Math.max(1, level + index - 1)))
      const team = () => [make('lu-xun', 2), make('taishi-ci', 1), make('xu-shu', 1)]
      if (simulateBattle(team(), enemies(), { mode: 'scenario', rng, easy: true }).won) easyWins += 1
      // 쉬운 전투가 실제로 쉬운지: 5등급 없는 편성으로 보통 전투와 비교한다(첫 적장 등급이 내려가 5등급 편성은 보통 전투도 이긴다)
      const plain = () => [make('xu-shu', 2), make('taishi-ci', 1), make('wang-ping', 1)]
      if (simulateBattle(plain(), enemies(), { mode: 'scenario', rng }).won) normalWins += 1
    }
    expect(easyWins).toBe(40)
    expect(normalWins).toBeLessThan(easyWins)
  })
})
