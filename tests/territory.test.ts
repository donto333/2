import { describe, expect, it } from 'vitest'
import { CITY_DEFENSE_BY_LEVEL, CITY_INCOME_REWARD_MULTIPLIER, CITY_PRODUCTION_MULTIPLIER, cityBreachThreshold, CONQUEST_COOLDOWN_MS, DEFENSE_COOLDOWN_MS, DUMMY_GARRISON_LEVEL_BY_CITY_LEVEL, FACTION_BATTLE_COOLDOWN_MS, FACTION_WAR_GOLD_REWARD, FACTION_WAR_HONOR_COST, INCOME_COOLDOWN_MS, MAX_CITY_GARRISONS, cityIncome, collectIncome, conquestCost, conquestEligibility, conquestPower, createInitialState, defendCity, deployCityGarrison, ensureCityRoster, findCity, isLuoyangSiegeWindow, launchConquest, launchFactionBattle, mergeFactionTerritories, normalizeInitialSeasonTerritories, resolveConquestBattle, unlockResearch, upgradeBuilding } from '../src/game/strategy'

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
    expect(state.research).toHaveLength(40)
  })

  it('starts cities at maximum defense and allows siege damage to reach zero', () => {
    const state = createInitialState()
    for (const city of state.cities) {
      expect(city.defense).toBe(CITY_DEFENSE_BY_LEVEL[city.level as 1 | 2 | 3 | 4 | 5])
      expect(cityBreachThreshold(city)).toBe(0)
      if (city.owner === '중립') expect(city.garrisons?.every(garrison => garrison.averageLevel === DUMMY_GARRISON_LEVEL_BY_CITY_LEVEL[city.level as 1 | 2 | 3 | 4 | 5])).toBe(true)
      else expect(city.garrisons).toHaveLength(0)
    }
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

  it('follows the historical routes: Jinniu road, Three Gorges, Wu inland road', () => {
    const state = createInitialState()
    // 금우도: 부성 → 한중
    findCity(state, 'fucheng')!.owner = state.faction
    expect(conquestEligibility(state, 'hanzhong').allowed).toBe(true)
    // 삼협: 이릉은 파동을 거쳐야 한다(부성에서 바로 갈 수 없음)
    expect(conquestEligibility(state, 'yiling').allowed).toBe(false)
    findCity(state, 'badong')!.owner = state.faction
    expect(conquestEligibility(state, 'yiling').allowed).toBe(true)
    // 오의 내륙길: 회계 → 파양
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

  it('merges server neutral AI battle logs into the selected city history', () => {
    const state = createInitialState()
    const merged = mergeFactionTerritories(state, [{
      cityId: 'chengdu', owner: '촉한', conquestProgress: 0, defense: 9000, prosperity: 48,
      battleLogs: [{ id: 'server-ai-17', timestamp: 1000, attackerName: '중립 인공지능 습격대 · hanzhong', attackerKind: 'ai', defenderName: '촉한', won: true, damage: 1500, note: '성벽 방어도 -1500' }],
    }])
    expect(merged).toBe(1)
    expect(findCity(state, 'chengdu')?.battleLogs?.at(-1)).toMatchObject({ attackerKind: 'ai', damage: 1500, note: '성벽 방어도 -1500' })
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

  it('scales every city production resource by the requested grade multiplier', () => {
    const state = createInitialState()
    const template = findCity(state, 'hanzhong')!
    const production = ([1, 2, 3, 4, 5] as const).map(level => cityIncome({ ...template, owner: '촉한', level, prosperity: 50, buildings: template.buildings.map(building => ({ ...building, level: 1 })) }))
    for (const key of ['grain', 'silver', 'wood', 'iron', 'influence'] as const) {
      expect(production[1][key]).toBe(production[0][key] * CITY_PRODUCTION_MULTIPLIER[2])
      expect(production[2][key]).toBe(production[0][key] * CITY_PRODUCTION_MULTIPLIER[3])
      expect(production[3][key]).toBe(production[0][key] * CITY_PRODUCTION_MULTIPLIER[4])
      expect(production[4][key]).toBe(production[0][key] * CITY_PRODUCTION_MULTIPLIER[5])
    }
  })

  it('applies the tenfold city income reward multiplier before collection', () => {
    const state = createInitialState()
    const city = findCity(state, 'hanzhong')!
    const income = cityIncome({ ...city, owner: '촉한', level: 1, prosperity: 50, buildings: city.buildings.map(building => ({ ...building, level: 1 })) })
    expect(CITY_INCOME_REWARD_MULTIPLIER).toBe(10)
    expect(income).toEqual({ grain: 4900, silver: 3450, wood: 2000, iron: 1270, influence: 1070 })
  })

  it('upgrades a selected allied building and rejects enemy cities', () => {
    const state = createInitialState()
    const city = findCity(state, 'chengdu')!
    const beforeLevel = city.buildings.find(building => building.id === 'farm')!.level
    expect(upgradeBuilding(state, 'chengdu', 'farm').ok).toBe(true)
    expect(city.buildings.find(building => building.id === 'farm')!.level).toBe(beforeLevel + 1)
    expect(upgradeBuilding(state, 'xuchang', 'farm').ok).toBe(false)
  })

  it('requires a tier-one research before starting its tier-two research', () => {
    const state = createInitialState()
    expect(unlockResearch(state, 'army-2', 0).ok).toBe(false)
    expect(unlockResearch(state, 'army-1', 0).ok).toBe(true)
    expect(state.research.find(node => node.id === 'army-1')?.endsAt).toBe(5 * 60_000)
  })

  it('weakens the wall and leaves capture to the final faction battle', () => {
    const state = createInitialState()
    const city = findCity(state, 'fucheng')!
    expect(conquestPower(state)).toBeGreaterThan(0)
    expect(conquestCost(city).grain).toBe(1150)
    city.defense = 8
    city.garrisons = [1, 2].map(index => ({ id: `neutral-${index}`, generalIds: [], averageLevel: 10, power: 1, source: 'dummy' as const, label: '중립 더미 수비대' }))
    let now = 1000
    let result = launchConquest(state, city.id, now)
    expect(result.ok).toBe(true)
    const blocked = launchConquest(state, city.id, now)
    expect(blocked.ok).toBe(false)
    now += CONQUEST_COOLDOWN_MS
    result = launchConquest(state, city.id, now)
    expect(result.ok).toBe(true)
    expect(city.owner).toBe('중립')
    expect(city.defense).toBeGreaterThanOrEqual(0)
    expect(city.defense).toBeLessThan(CITY_DEFENSE_BY_LEVEL[2])
    expect(city.conquestProgress).toBe(100)
    expect(result.captured).toBe(false)
    const goldBefore = state.gold
    const final = launchFactionBattle(state, city.id, now + FACTION_BATTLE_COOLDOWN_MS)
    expect(final.ok).toBe(true)
    expect(final.won).toBe(true)
    expect(city.owner).toBe('촉한')
    expect(state.gold).toBe(goldBefore + FACTION_WAR_GOLD_REWARD[2])
  })

  it('requires every deployed garrison to be defeated before capture', () => {
    const state = createInitialState()
    const city = findCity(state, 'fucheng')!
    city.owner = '위나라'
    city.defense = 8
    const attackPower = conquestPower(state)
    city.garrisons = [1, 2].map(index => ({
      id: `player-defense-${index}`,
      generalIds: state.formation,
      averageLevel: 1,
      power: attackPower,
      source: 'player' as const,
      label: `위나라 수비 진형 ${index}`,
    }))
    let now = 1000
    const first = launchConquest(state, city.id, now)
    expect(first.ok).toBe(true)
    expect(first.captured).toBe(false)
    expect(city.owner).toBe('위나라')
    expect(city.defendersDefeated).toBe(1)
    expect(first.message).toContain('1부대 남음')

    now += CONQUEST_COOLDOWN_MS
    const second = launchConquest(state, city.id, now)
    expect(second.ok).toBe(true)
    expect(second.captured).toBe(false)
    expect(city.owner).toBe('위나라')
    expect(city.defense).toBeGreaterThanOrEqual(0)
    expect(city.defense).toBeLessThan(CITY_DEFENSE_BY_LEVEL[2])
    expect(city.garrisons).toHaveLength(2)
    const final = launchFactionBattle(state, city.id, now + FACTION_BATTLE_COOLDOWN_MS)
    expect(final.ok).toBe(true)
    expect(final.won).toBe(true)
    expect(city.owner).toBe('촉한')
    expect(city.garrisons).toEqual([])
    expect(city.defendersDefeated).toBe(0)
  })

  it('applies wall damage when the 3D siege wins after a zero-damage preflight', () => {
    const state = createInitialState()
    const city = findCity(state, 'hanzhong')!
    city.defense = cityBreachThreshold(city) + 3_000
    city.garrisons = [{ id: 'strong-dummy', generalIds: [], averageLevel: 30, power: 999999999, source: 'dummy', label: '강화 더미 수비대' }]
    state.lastConquest = { cityId: city.id, cityName: city.name, captured: false, damage: 0 }
    const before = city.defense
    const resolved = resolveConquestBattle(state, city.id, true, 2000)
    expect(resolved.damage).toBeGreaterThan(0)
    expect(city.defense).toBeLessThan(before)
    const afterFirstResolution = city.defense
    expect(resolveConquestBattle(state, city.id, true, 3000).damage).toBe(resolved.damage)
    expect(city.defense).toBe(afterFirstResolution)
  })

  it('protects each faction capital and blocks remote conquest', () => {
    const state = createInitialState()
    expect(conquestEligibility(state, 'chengdu').allowed).toBe(false)
    expect(conquestEligibility(state, 'ye').reason).toContain('위나라의 본성')
    expect(conquestEligibility(state, 'luoyang').allowed).toBe(false)
    expect(conquestEligibility(state, 'fucheng').allowed).toBe(true)
    expect(conquestEligibility(state, 'hanzhong').allowed).toBe(false) // 부성을 거쳐야 하는 원거리
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
    expect(conquestEligibility(state, 'xinye').allowed).toBe(true)
    expect(conquestEligibility(state, 'jiangling').allowed).toBe(true)
    expect(conquestEligibility(state, 'wancheng').allowed).toBe(false) // 신야를 거쳐야 한다
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
    expect(city.battleLogs).toHaveLength(1)
    expect(city.battleLogs?.[0].attackerKind).toBe('ai')
    expect(defendCity(state, city.id, 1000).ok).toBe(false)
    expect(defendCity(state, city.id, 1000 + DEFENSE_COOLDOWN_MS).ok).toBe(true)
    expect(city.battleLogs).toHaveLength(2)
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
    // 한국 시간 일요일 20:00 = UTC 11:00, 24:00 = UTC 15:00 (기기 시간대와 무관)
    expect(isLuoyangSiegeWindow(Date.UTC(2026, 9, 11, 10, 59))).toBe(false)
    expect(isLuoyangSiegeWindow(Date.UTC(2026, 9, 11, 11, 0))).toBe(true)
    expect(isLuoyangSiegeWindow(Date.UTC(2026, 9, 11, 14, 59))).toBe(true)
    expect(isLuoyangSiegeWindow(Date.UTC(2026, 9, 11, 15, 0))).toBe(false)
    expect(conquestEligibility(state, 'luoyang', Date.UTC(2026, 9, 11, 10, 59)).reason).toContain('일요일 저녁 8시')
    expect(conquestEligibility(state, 'luoyang', Date.UTC(2026, 9, 11, 11, 0)).allowed).toBe(true)
    state.faction = '오나라'
    expect(conquestEligibility(state, 'luoyang', Date.UTC(2026, 9, 11, 11, 0)).allowed).toBe(true)
  })

  it('requires a broken wall and consumes tiered honor for faction warfare', () => {
    const state = createInitialState()
    const city = findCity(state, 'fucheng')!
    const blocked = launchFactionBattle(state, city.id, 2000)
    expect(blocked.ok).toBe(false)
    city.defense = 0
    city.garrisons = [{ id: 'defeated', generalIds: state.formation, averageLevel: 1, power: 1, source: 'player' as const, label: '격파된 수비대' }]
    city.defendersDefeated = 3
    const beforeHonor = state.honor
    const beforeGold = state.gold
    const result = launchFactionBattle(state, city.id, 2000)
    expect(result.ok).toBe(true)
    expect(result.won).toBe(true)
    expect(city.battleLogs?.at(-1)?.attackerKind).toBe('user')
    expect(state.honor).toBe(beforeHonor - FACTION_WAR_HONOR_COST[2])
    expect(state.gold).toBe(beforeGold + FACTION_WAR_GOLD_REWARD[2])
  })
})
