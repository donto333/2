import { describe, expect, it } from 'vitest'
import { CONQUEST_COOLDOWN_MS, DEFENSE_COOLDOWN_MS, FACTION_BATTLE_COOLDOWN_MS, INCOME_COOLDOWN_MS, collectIncome, conquestCost, conquestPower, createInitialState, defendCity, ensureCityRoster, findCity, launchConquest, launchFactionBattle, unlockResearch, upgradeBuilding } from '../src/game/strategy'

describe('territory and governance', () => {
  it('starts with owned cities and a full resource inventory', () => {
    const state = createInitialState()
    expect(state.cities.filter(city => city.owner === '촉한')).toHaveLength(2)
    expect(state.cities).toHaveLength(25)
    expect(state.resources.grain).toBeGreaterThan(0)
    expect(state.research).toHaveLength(58)
  })

  it('backfills the 20 new cities into legacy five-city saves', () => {
    const state = createInitialState()
    state.cities = state.cities.slice(0, 5)
    ensureCityRoster(state)
    expect(state.cities).toHaveLength(25)
    expect(findCity(state, 'luoyang')?.owner).toBe('위나라')
    expect(findCity(state, 'fucheng')?.region).toBe('익주 북방')
  })

  it('collects production from owned cities without collecting enemy yields', () => {
    const state = createInitialState()
    const before = { ...state.resources }
    const result = collectIncome(state, 0)
    expect(result.ok).toBe(true)
    expect(state.resources.grain).toBeGreaterThan(before.grain)
    expect(state.resources.silver).toBe(state.silver)
    expect(result.gain.grain).toBeGreaterThan(0)
    const blocked = collectIncome(state, 1)
    expect(blocked.ok).toBe(false)
    expect(blocked.gain.grain).toBe(0)
    expect(collectIncome(state, INCOME_COOLDOWN_MS + 1).ok).toBe(true)
  })

  it('upgrades a selected allied building and rejects enemy cities', () => {
    const state = createInitialState()
    const city = findCity(state, 'chengdu')!
    const beforeLevel = city.buildings.find(building => building.id === 'farm')!.level
    expect(upgradeBuilding(state, 'chengdu', 'farm').ok).toBe(true)
    expect(city.buildings.find(building => building.id === 'farm')!.level).toBe(beforeLevel + 1)
    expect(upgradeBuilding(state, 'xuchang', 'farm').ok).toBe(false)
  })

  it('requires a tier-one research before unlocking its tier-two branch', () => {
    const state = createInitialState()
    expect(unlockResearch(state, 'granary').ok).toBe(false)
    expect(unlockResearch(state, 'irrigation').ok).toBe(true)
    expect(unlockResearch(state, 'granary').ok).toBe(true)
    expect(state.research.find(node => node.id === 'granary')?.unlocked).toBe(true)
  })

  it('stages a frontline siege and captures a neutral city with rewards', () => {
    const state = createInitialState()
    const city = findCity(state, 'xiangyang')!
    const beforeHonor = state.honor
    expect(conquestPower(state)).toBeGreaterThan(0)
    expect(conquestCost(city).grain).toBe(1150)
    let now = 1000
    let result = launchConquest(state, city.id, now)
    expect(result.ok).toBe(true)
    const blocked = launchConquest(state, city.id, now)
    expect(blocked.ok).toBe(false)
    while (!result.captured) {
      now += CONQUEST_COOLDOWN_MS
      result = launchConquest(state, city.id, now)
    }
    expect(city.owner).toBe('촉한')
    expect(city.conquestProgress).toBe(100)
    expect(state.honor).toBeGreaterThan(beforeHonor)
    expect(state.lastConquest?.captured).toBe(true)
  })

  it('does not start a siege when the march resources are missing', () => {
    const state = createInitialState()
    state.resources.grain = 0
    const result = launchConquest(state, 'xiangyang')
    expect(result.ok).toBe(false)
    expect(findCity(state, 'xiangyang')?.conquestProgress).toBeUndefined()
  })

  it('runs a defense battle with a recovery window', () => {
    const state = createInitialState()
    const city = findCity(state, 'chengdu')!
    const result = defendCity(state, city.id, 1000)
    expect(result.ok).toBe(true)
    expect(state.lastDefenseAt).toBe(1000)
    expect(defendCity(state, city.id, 1000).ok).toBe(false)
    expect(defendCity(state, city.id, 1000 + DEFENSE_COOLDOWN_MS).ok).toBe(true)
  })

  it('starts faction warfare against an enemy city and throttles repeats', () => {
    const state = createInitialState()
    const city = findCity(state, 'xuchang')!
    const result = launchFactionBattle(state, city.id, 2000)
    expect(result.ok).toBe(true)
    expect(state.factionWarScore).toBeGreaterThanOrEqual(0)
    expect(launchFactionBattle(state, city.id, 2000).ok).toBe(false)
    expect(launchFactionBattle(state, city.id, 2000 + FACTION_BATTLE_COOLDOWN_MS).ok).toBe(true)
  })
})
