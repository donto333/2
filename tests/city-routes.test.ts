import { describe, expect, it } from 'vitest'
import cityRoutes from '../server/city-routes.json'
import { CITY_ADJACENCY, FACTION_CAPITALS, createInitialState } from '../src/game/strategy'

const cityIds = createInitialState().cities.map(city => city.id)

describe('city routes', () => {
  it('only names real cities and has no duplicate or self routes', () => {
    const seen = new Set<string>()
    for (const [a, b] of cityRoutes.edges as Array<[string, string]>) {
      expect(cityIds.includes(a) && cityIds.includes(b)).toBe(true)
      expect(a === b).toBe(false)
      const key = [a, b].sort().join(':')
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('is two-way: every route can be travelled in both directions', () => {
    for (const [from, neighbors] of Object.entries(CITY_ADJACENCY)) {
      for (const to of neighbors) expect(CITY_ADJACENCY[to]?.includes(from)).toBe(true)
    }
  })

  it('connects every city except the independent Luoyang front', () => {
    const reached = new Set<string>()
    const stack = [FACTION_CAPITALS['촉한']]
    while (stack.length) {
      const id = stack.pop()!
      if (reached.has(id)) continue
      reached.add(id)
      stack.push(...(CITY_ADJACENCY[id] ?? []))
    }
    expect(cityIds.filter(id => !reached.has(id))).toEqual(['luoyang'])
    expect(CITY_ADJACENCY.luoyang).toEqual([])
  })

  it('gives every faction capital at least three ways out', () => {
    for (const capital of Object.values(FACTION_CAPITALS)) expect((CITY_ADJACENCY[capital]?.length ?? 0) >= 3).toBe(true)
  })
})
