import { describe, expect, it } from 'vitest'
import { RAZE_REBUILD_MS, WANDERER_DAILY_PLUNDER, changeFaction, cityDefenseForLevel, cityYield, collectIncome, conquestEligibility, createInitialState, findCity, launchConquest, launchFactionBattle, rebuildRazedWalls, resolveConquestBattle, upgradeBuilding, wandererPlunderLeft, homeCityId, mergeFactionTerritories } from '../src/game/strategy'
import { ensureMissions } from '../src/game/missions'

const wanderer = () => { const state = createInitialState(); ensureMissions(state); state.faction = '재야'; state.factionConfirmed = true; state.selectedCityId = homeCityId('재야'); state.resources = { ...state.resources, grain: 1e7, iron: 1e7 }; state.silver = 1e7; state.resources.silver = state.silver; return state }

describe('재야(중립 진영)', () => {
  it('국경과 상관없이 모든 도시(수도 · 양양 포함)를 공성할 수 있고, 낙양은 세 진영 규칙(일요일 저녁)을 따른다', () => {
    const state = wanderer()
    for (const id of ['chengdu', 'ye', 'jianye', 'xiangyang', 'jiaozhi', 'wuwei']) expect(conquestEligibility(state, id).allowed).toBe(true)
    const monday = Date.UTC(2026, 9, 12, 3)
    expect(conquestEligibility(state, 'luoyang', monday).allowed).toBe(false)
  })

  it('공성에서 이기면 성벽이 깎이고 그 성 하루 생산량의 25%를 약탈한다 · 0이 되면 내정 건물 초기화 · 더 공성 불가', () => {
    const state = wanderer()
    const city = findCity(state, 'jiaozhi')!
    city.buildings[0].level = 3
    const expected = Math.round(cityYield(city, state).grain * 0.25)
    expect(launchConquest(state, city.id, 1000).ok).toBe(true)
    expect(city.owner).toBe('중립')
    const grain = state.resources.grain
    const result = resolveConquestBattle(state, city.id, true, 1000)
    expect(result.ok).toBe(true)
    expect(state.resources.grain - grain).toBe(expected)
    // 성벽을 끝까지 무너뜨린다
    city.defense = 5
    let now = 100000
    launchConquest(state, city.id, now); resolveConquestBattle(state, city.id, true, now)
    expect(city.defense).toBe(0)
    expect(city.owner).toBe('중립')
    expect(city.buildings.every(building => building.level <= 1)).toBe(true)
    expect(city.razedAt).toBe(now)
    expect(conquestEligibility(state, city.id, now + 1000).allowed).toBe(false)
    // 하루 뒤 성벽 재건
    rebuildRazedWalls(state, now + RAZE_REBUILD_MS)
    expect(city.defense).toBe(cityDefenseForLevel(city.level))
    expect(conquestEligibility(state, city.id, now + RAZE_REBUILD_MS).allowed).toBe(true)
  })

  it('최종 세력전 · 내정(수확 · 건물)은 할 수 없다', () => {
    const state = wanderer()
    const city = findCity(state, 'fucheng')!
    city.defense = 0
    expect(launchFactionBattle(state, city.id, 5000).ok).toBe(false)
    expect(collectIncome(state).ok).toBe(false)
    expect(upgradeBuilding(state, 'chengdu', state.cities.find(c => c.id === 'chengdu')!.buildings[0].id).ok).toBe(false)
  })

  it('하루 약탈 횟수에 한도가 있다', () => {
    const state = wanderer()
    expect(wandererPlunderLeft(state)).toBe(WANDERER_DAILY_PLUNDER)
  })

  it('다른 재야가 무너뜨린 성(서버 razedAt)은 주인의 내정 건물이 초기화된다', () => {
    const state = createInitialState()
    const city = findCity(state, 'chengdu')!
    city.buildings[0].level = 4
    mergeFactionTerritories(state, [{ cityId: 'chengdu', owner: '촉한', conquestProgress: 0, defense: 0, prosperity: 80, razedAt: 12345 }])
    expect(city.buildings[0].level).toBe(1)
    expect(city.razedAt).toBe(12345)
    city.buildings[0].level = 2
    mergeFactionTerritories(state, [{ cityId: 'chengdu', owner: '촉한', conquestProgress: 0, defense: 0, prosperity: 80, razedAt: 12345 }])
    expect(city.buildings[0].level).toBe(2)
  })

  it('진영은 30일에 한 번 바꿀 수 있다', () => {
    const state = createInitialState()
    ensureMissions(state)
    expect(changeFaction(state, '재야', 1000).ok).toBe(true)
    expect(state.faction).toBe('재야')
    expect(changeFaction(state, '오나라', 2000).ok).toBe(false)
    expect(changeFaction(state, '오나라', 1000 + 30 * 86400000).ok).toBe(true)
    expect(state.faction).toBe('오나라')
  })
})
