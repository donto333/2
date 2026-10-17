import { describe, expect, it } from 'vitest'
import { neutralRaidPower, resolveNeutralRaid } from '../server/neutral-raid.mjs'
import { createInitialState, defendCity, deployCityGarrison, findCity, mergeFactionTerritories, type FactionTerritorySnapshot } from '../src/game/strategy'

describe('neutral raid rules (shared by server AI and client defense)', () => {
  const raidPower = neutralRaidPower(2) // 1900

  it('keeps the wall intact when the garrison wins', () => {
    const result = resolveNeutralRaid({ raidPower, garrisonPowers: [5000], defeated: 0, defense: 20000 })
    expect(result.attackerWon).toBe(false)
    expect(result.damage).toBe(0)
    expect(result.defense).toBe(20000)
    expect(result.defeated).toBe(0)
  })

  it('defeats one garrison and damages the wall when the raid wins, but cannot take the city while defenders remain', () => {
    const result = resolveNeutralRaid({ raidPower, garrisonPowers: [100, 100], defeated: 0, defense: 500 })
    expect(result.attackerWon).toBe(true)
    expect(result.defeated).toBe(1)
    expect(result.defense).toBe(1) // 남은 수비대가 있어 0까지 떨어지지 않음
    expect(result.captured).toBe(false)
    expect(result.remaining).toBe(1)
  })

  it('captures an undefended city only when capture is allowed', () => {
    expect(resolveNeutralRaid({ raidPower, garrisonPowers: [], defeated: 0, defense: 1000 }).captured).toBe(true)
    const drill = resolveNeutralRaid({ raidPower, garrisonPowers: [], defeated: 0, defense: 1000, allowCapture: false })
    expect(drill.captured).toBe(false)
    expect(drill.defense).toBe(1)
  })

  it('fights the next standing garrison after earlier ones fell', () => {
    const result = resolveNeutralRaid({ raidPower, garrisonPowers: [10, 9000], defeated: 1, defense: 8000 })
    expect(result.defenderIndex).toBe(1)
    expect(result.attackerWon).toBe(false)
    expect(result.defense).toBe(8000)
  })
})

describe('defendCity with deployed garrisons', () => {
  const setup = (power: number) => {
    const state = createInitialState()
    const city = findCity(state, 'chengdu')!
    state.resources = { grain: 1e7, silver: 1e7, wood: 1e7, iron: 1e7, influence: 1e7 }
    state.silver = 1e7
    expect(deployCityGarrison(state, city.id).ok).toBe(true)
    city.garrisons![0].power = power
    return { state, city }
  }

  it('a winning garrison keeps defense and prosperity and earns war score', () => {
    const { state, city } = setup(99999)
    const before = { defense: city.defense, prosperity: city.prosperity, war: state.factionWarScore }
    const result = defendCity(state, city.id, 1000)
    expect(result.ok && result.won).toBe(true)
    expect(city.defense).toBe(before.defense)
    expect(city.prosperity).toBe(before.prosperity)
    expect(state.factionWarScore).toBe(before.war + 100)
    expect(result.message).toContain('방어 성공')
  })

  it('a losing garrison is defeated, the wall is damaged and no war score is given', () => {
    const { state, city } = setup(10)
    const before = { defense: city.defense, war: state.factionWarScore }
    const result = defendCity(state, city.id, 1000)
    expect(result.ok).toBe(true)
    expect(result.won).toBe(false)
    expect(city.defense).toBeLessThan(before.defense)
    expect(city.defendersDefeated).toBe(1)
    expect(state.factionWarScore).toBe(before.war)
    expect(result.message).toContain('방어 실패')
  })
})

describe('merging server garrisons and raids', () => {
  const snapshot = (state: ReturnType<typeof createInitialState>, extra: Partial<FactionTerritorySnapshot>): FactionTerritorySnapshot[] =>
    state.cities.map(city => ({ cityId: city.id, owner: city.owner, conquestProgress: city.conquestProgress ?? 0, defense: city.defense, prosperity: city.prosperity, ...(city.id === 'chengdu' ? extra : {}) }))

  it('uses the faction-shared garrisons from the server and logs an AI raid once', () => {
    const state = createInitialState()
    const raid = { at: 5000, attackerCityId: 'xindu', attackerLevel: 1, raidPower: 1400, attackerWon: false, damage: 0, defenderLabel: '촉한 수비 진형 1', captured: false }
    const snaps = snapshot(state, { garrisons: { list: [{ id: 'g1', power: 4000, averageLevel: 5, label: '촉한 수비 진형 1' }], defeated: 0 }, lastRaid: raid })
    mergeFactionTerritories(state, snaps)
    mergeFactionTerritories(state, snaps)
    const city = findCity(state, 'chengdu')!
    expect(city.garrisons?.map(g => g.id)).toEqual(['g1'])
    expect(city.battleLogs?.filter(log => log.timestamp === 5000)).toHaveLength(1)
    expect(city.battleLogs?.at(-1)?.note).toContain('방어 성공')
  })

  it('does not touch siege progress on cities the player does not own', () => {
    const state = createInitialState()
    const target = findCity(state, 'fucheng')!
    target.defendersDefeated = 2
    mergeFactionTerritories(state, state.cities.map(city => ({ cityId: city.id, owner: city.owner, conquestProgress: 0, defense: city.defense, prosperity: city.prosperity, garrisons: { list: [], defeated: 0 } })))
    expect(target.defendersDefeated).toBe(2)
  })
})
