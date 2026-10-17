import { describe, expect, it } from 'vitest'
import { packageBonus, shopNeeds, shopPackages } from '../src/game/shop'
import { createInitialState } from '../src/game/strategy'

describe('상점 도우미', () => {
  it('shows bigger bundles as better value', () => {
    const grain = shopPackages().filter(item => item.resource === 'grain')
    expect(packageBonus(grain[0])).toBe(0)
    expect(packageBonus(grain[grain.length - 1])).toBeGreaterThan(0.4)
  })
  it('recommends the smallest bundle that covers a shortfall', () => {
    const state = createInitialState()
    state.resources.influence = 200
    state.honor = 400
    const needs = shopNeeds(state)
    const influence = needs.find(need => need.resource === 'influence')
    expect(influence?.short).toBe(400)
    expect(influence?.item?.amount).toBeGreaterThanOrEqual(400)
    expect(influence?.item?.goldCost).toBe(3)
    expect(needs.find(need => need.resource === 'honor')?.short).toBe(500)
  })
})
