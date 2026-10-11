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

  it('uses the PDF character placement for each scenario instead of a chapter-wide deck', () => {
    const byYear = new Map(SCENARIOS.map(scenario => [scenario.year, scenario]))
    expect(byYear.get(184)?.deck).toEqual(['장량', '관해', '주창'])
    expect(byYear.get(195)?.deck).toEqual(['손책', '주유', '태사자'])
    expect(byYear.get(219)?.deck).toEqual(['관우', '여몽', '육손'])
    expect(byYear.get(234)?.deck).toEqual(['제갈량', '사마의', '조운'])
    expect(SCENARIOS.every(scenario => scenario.deck.length === 3)).toBe(true)
  })

  it('raises scenario difficulty from the opening episode to the finale', () => {
    const opening = SCENARIOS[0].difficulty
    const finale = SCENARIOS.at(-1)!.difficulty
    expect(opening.stage).toBe(1)
    expect(finale.stage).toBe(8)
    expect(opening.tier).toBe(1)
    expect(finale.tier).toBe(5)
    expect(opening.enemyLevel).toBe(1)
    expect(finale.enemyLevel).toBe(30)
    expect(finale.pressure).toBeGreaterThan(opening.pressure)
    for (let chapter = 1; chapter <= 8; chapter += 1) {
      const entries = SCENARIOS.filter(scenario => scenario.difficulty.stage === chapter)
      expect(entries.length).toBeGreaterThan(0)
      expect(entries.every(scenario => scenario.difficulty.enemyLevel === entries[0].difficulty.enemyLevel)).toBe(true)
      if (chapter > 1) expect(entries[0].difficulty.enemyLevel).toBeGreaterThan(SCENARIOS.filter(scenario => scenario.difficulty.stage === chapter - 1)[0].difficulty.enemyLevel)
    }
  })
})
