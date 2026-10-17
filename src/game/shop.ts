// 상점 도우미: 묶음별 이득(금화당 효율), 지금 모자란 자원과 그것을 채울 가장 작은 묶음 추천.
import { researchStatus } from './research'
import { HONOR_SHOP_PACKAGES, MANUAL_SHOP_PACKAGES, RESOURCE_SHOP_PACKAGES, buildingCost, conquestCost, recruitCost, upgradeCost, MAX_GENERAL_LEVEL, type ResourceKey, type StrategyState } from './strategy'

export type ShopResource = ResourceKey | 'honor' | 'manuals'
export interface ShopPackage { id: string; resource: ShopResource; amount: number; goldCost: number; kind: 'resource' | 'honor' | 'manuals' }

export function shopPackages(): ShopPackage[] {
  return [
    ...RESOURCE_SHOP_PACKAGES.map(item => ({ id: item.id, resource: item.resource as ShopResource, amount: item.amount, goldCost: item.goldCost, kind: 'resource' as const })),
    ...HONOR_SHOP_PACKAGES.map(item => ({ id: item.id, resource: 'honor' as const, amount: item.honor, goldCost: item.goldCost, kind: 'honor' as const })),
    ...MANUAL_SHOP_PACKAGES.map(item => ({ id: item.id, resource: 'manuals' as const, amount: item.manuals, goldCost: item.goldCost, kind: 'manuals' as const })),
  ]
}

/** 같은 자원의 가장 작은 묶음 대비 금화당 얼마나 더 받는지(0.25 = 25% 이득) */
export function packageBonus(item: ShopPackage, all = shopPackages()): number {
  const same = all.filter(other => other.resource === item.resource)
  const base = Math.min(...same.map(other => other.amount / other.goldCost))
  return Math.max(0, item.amount / item.goldCost / base - 1)
}

function holding(state: StrategyState, resource: ShopResource): number {
  if (resource === 'honor') return state.honor
  if (resource === 'manuals') return state.manuals
  if (resource === 'silver') return state.silver
  return state.resources[resource]
}

export interface ShopNeed {
  /** 무엇 때문에 모자란지(예: 기술 연구 ‘오부 훈련’) */
  reason: string
  resource: ShopResource
  short: number
  /** 부족분을 채우는 가장 작은 묶음 */
  item: ShopPackage | null
}

/** 다음 연구·건물 강화·공성·10회 모집에 모자란 자원(많아야 4개) */
export function shopNeeds(state: StrategyState): ShopNeed[] {
  const needs: ShopNeed[] = []
  const all = shopPackages()
  const add = (reason: string, cost: Partial<Record<ShopResource, number>>) => {
    for (const [key, value] of Object.entries(cost) as Array<[ShopResource, number | undefined]>) {
      const short = (value ?? 0) - holding(state, key)
      if (short <= 0 || needs.some(need => need.resource === key)) continue
      const item = all.filter(other => other.resource === key && other.amount >= short).sort((a, b) => a.goldCost - b.goldCost)[0] ?? null
      needs.push({ reason, resource: key, short, item })
    }
  }
  // 출전 무장 중 가장 낮은 레벨 무장의 다음 레벨업(병서·은전)
  const lowest = state.formation.map(id => state.generals.find(general => general.id === id)).filter((general): general is NonNullable<typeof general> => Boolean(general) && general!.level < MAX_GENERAL_LEVEL).sort((a, b) => a.level - b.level)[0]
  if (lowest) add(`${lowest.name} Lv.${lowest.level + 1} 강화`, upgradeCost(state, lowest))
  // 다음에 시작할 수 있는 연구 중 가장 싼 것
  const research = state.research
    .filter(node => { const status = researchStatus(state, node); return status === 'available' || status === 'busy' })
    .sort((a, b) => (a.cost.influence ?? 0) - (b.cost.influence ?? 0))[0]
  if (research) add(`기술 연구 ‘${research.name}’`, research.cost)
  // 내 도시에서 가장 싼 다음 건물 강화
  const buildings = state.cities.filter(city => city.owner === state.faction).flatMap(city => city.buildings.filter(building => building.level < building.maxLevel).map(building => ({ city, building, cost: buildingCost(building, state) })))
  const cheapest = buildings.sort((a, b) => (a.cost.silver ?? 0) - (b.cost.silver ?? 0))[0]
  if (cheapest) add(`${cheapest.city.name} ${cheapest.building.name} 강화`, cheapest.cost)
  // 고른 도시가 아군 땅이 아니면 그 공성
  const target = state.cities.find(city => city.id === state.selectedCityId)
  if (target && target.owner !== state.faction) add(`${target.name} 공성 출정`, conquestCost(target, state))
  add('무장 10회 모집', { honor: recruitCost(state, 10) })
  return needs.slice(0, 5)
}
