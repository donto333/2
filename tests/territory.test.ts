import { describe, expect, it } from 'vitest'
import { CONQUEST_COOLDOWN_MS, DEFENSE_COOLDOWN_MS, FACTION_BATTLE_COOLDOWN_MS, INCOME_COOLDOWN_MS, MAX_CITY_GARRISONS, collectIncome, conquestCost, conquestEligibility, conquestPower, createInitialState, defendCity, deployCityGarrison, ensureCityRoster, findCity, isLuoyangSiegeWindow, launchConquest, launchFactionBattle, mergeFactionTerritories, normalizeInitialSeasonTerritories, unlockResearch, upgradeBuilding } from '../src/game/strategy'

describe('territory and governance', () => {
  it('starts with only the three faction capitals owned', () => {
    const state = createInitialState()
    expect(state.cities.filter(city => city.owner !== '중립').map(city => [city.id, city.owner])).toEqual([
      ['chengdu', '촉한'],
      ['jianye', '오나라'],
      ['ye', '위나라'],
    ])
    expect(state.cities).toHaveLength(45)
    expect(state.resources.grain).toBeGreaterThan(0)
    expect(state.research).toHaveLength(58)
  })

  it('backfills the 40 new cities into legacy five-city saves', () => {
    const state = createInitialState()
    state.cities = state.cities.slice(0, 5)
    ensureCityRoster(state)
    expect(state.cities).toHaveLength(45)
    expect(findCity(state, 'luoyang')?.owner).toBe('중립')
    expect(findCity(state, 'fucheng')?.region).toBe('익주 북방')
  })

  it('normalizes an untouched legacy season while preserving progressed conquests', () => {
    const state = createInitialState()
    findCity(state, 'hanzhong')!.owner = '촉한'
    expect(normalizeInitialSeasonTerritories(state)).toBe(true)
    expect(findCity(state, 'hanzhong')?.owner).toBe('중립')
    const progressed = createInitialState()
    findCity(progressed, 'hanzhong')!.owner = '촉한'
    findCity(progressed, 'hanzhong')!.conquestProgress = 100
    expect(normalizeInitialSeasonTerritories(progressed)).toBe(false)
    expect(findCity(progressed, 'hanzhong')?.owner).toBe('촉한')
  })

  it('opens the requested frontline links between Bu-seong, Hanzhong, Yiling, Poyang, and Kuaiji', () => {
    const state = createInitialState()
    findCity(state, 'hanzhong')!.owner = state.faction
    expect(conquestEligibility(state, 'yiling').allowed).toBe(true)
    findCity(state, 'hanzhong')!.owner = '중립'
    findCity(state, 'fucheng')!.owner = state.faction
    expect(conquestEligibility(state, 'yiling').allowed).toBe(true)
    findCity(state, 'kuaiji')!.owner = state.faction
    expect(conquestEligibility(state, 'poyang').allowed).toBe(true)
  })

  it('merges server ownership while preserving personal city buildings', () => {
    const state = createInitialState()
    const farm = findCity(state, 'xiangyang')!.buildings.find(building => building.id === 'farm')!
    farm.level = 4
    const merged = mergeFactionTerritories(state, [{ cityId: 'xiangyang', owner: '촉한', conquestProgress: 100, defense: 41, prosperity: 72 }])
    expect(merged).toBe(1)
    expect(findCity(state, 'xiangyang')?.owner).toBe('촉한')
    expect(findCity(state, 'xiangyang')?.conquestProgress).toBe(100)
    expect(findCity(state, 'xiangyang')?.defense).toBe(41)
    expect(findCity(state, 'xiangyang')?.buildings.find(building => building.id === 'farm')?.level).toBe(4)
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
    const city = findCity(state, 'hanzhong')!
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

  it('protects each faction capital and blocks remote conquest', () => {
    const state = createInitialState()
    expect(conquestEligibility(state, 'chengdu').allowed).toBe(false)
    expect(conquestEligibility(state, 'ye').reason).toContain('위나라의 본성')
    expect(conquestEligibility(state, 'luoyang').allowed).toBe(false)
    expect(conquestEligibility(state, 'hanzhong').allowed).toBe(true)
    const beforeGrain = state.resources.grain
    expect(launchConquest(state, 'ye', 1000).ok).toBe(false)
    expect(launchConquest(state, 'luoyang', 1000).ok).toBe(false)
    expect(state.resources.grain).toBe(beforeGrain)
  })

  it('opens only the next connected front after a neighboring city is captured', () => {
    const state = createInitialState()
    const xiangyang = findCity(state, 'xiangyang')!
    xiangyang.owner = state.faction
    xiangyang.conquestProgress = 100
    expect(conquestEligibility(state, 'wancheng').allowed).toBe(true)
    expect(conquestEligibility(state, 'jiangling').allowed).toBe(true)
    expect(conquestEligibility(state, 'puyang').allowed).toBe(false)
  })

  it('does not start a siege when the march resources are missing', () => {
    const state = createInitialState()
    state.resources.grain = 0
    const result = launchConquest(state, 'hanzhong')
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

  it('deploys the current deck as allied city garrisons up to the 100-unit cap', () => {
    const state = createInitialState()
    const city = findCity(state, 'chengdu')!
    expect(deployCityGarrison(state, city.id).ok).toBe(true)
    expect(city.garrisons).toHaveLength(1)
    city.garrisons = Array.from({ length: MAX_CITY_GARRISONS }, (_, index) => ({
      id: `test-${index}`, generalIds: state.formation, averageLevel: 1, power: 100, source: 'player' as const, label: '테스트 수비대',
    }))
    expect(deployCityGarrison(state, city.id).ok).toBe(false)
    expect(city.garrisons).toHaveLength(MAX_CITY_GARRISONS)
  })

  it('keeps Xiangyang and Luoyang protected by their special rules', () => {
    const state = createInitialState()
    expect(conquestEligibility(state, 'xiangyang').reason).toContain('인공지능 진영의 수도')
    expect(isLuoyangSiegeWindow(Date.UTC(2026, 9, 11, 19, 59))).toBe(false)
    expect(isLuoyangSiegeWindow(Date.UTC(2026, 9, 11, 20, 0))).toBe(true)
    expect(isLuoyangSiegeWindow(Date.UTC(2026, 9, 12, 0, 0))).toBe(false)
    expect(conquestEligibility(state, 'luoyang', Date.UTC(2026, 9, 11, 19, 59)).reason).toContain('일요일 저녁 8시')
    expect(conquestEligibility(state, 'luoyang', Date.UTC(2026, 9, 11, 20, 0)).allowed).toBe(true)
    state.faction = '오나라'
    expect(conquestEligibility(state, 'luoyang', Date.UTC(2026, 9, 11, 20, 0)).allowed).toBe(true)
  })

  it('starts faction warfare against an enemy city and throttles repeats', () => {
    const state = createInitialState()
    const city = findCity(state, 'hanzhong')!
    const result = launchFactionBattle(state, city.id, 2000)
    expect(result.ok).toBe(true)
    expect(state.factionWarScore).toBeGreaterThanOrEqual(0)
    expect(launchFactionBattle(state, city.id, 2000).ok).toBe(false)
    expect(launchFactionBattle(state, city.id, 2000 + FACTION_BATTLE_COOLDOWN_MS).ok).toBe(true)
  })
})
