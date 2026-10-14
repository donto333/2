// 무장별 추천 조합: 고른 무장을 반드시 넣은 3인 조합을 점수순으로 추천한다.
// 점수 = 전투력 합(장비 포함) × 인연(+8%) × 병종 다양성(종류마다 +3%) × 다음 시나리오 적장과의 자리별 상성
// 자리(좌·중·우)는 여섯 가지 배치를 모두 따져 상성이 가장 좋은 배치를, 같으면 가운데에 방어·통솔이 높은 무장을 둔다.
import { matchup } from './battle-core'
import { bondFor, type BondDef } from './skills'
import { combatPower, equipmentPower, formatNumber, type General, type StrategyState } from './strategy'

export interface ComboAdvice {
  /** 좌·중·우 순서 */
  ids: string[]
  power: number
  bond: BondDef | null
  roles: number
  /** 자리별 상성 배율(적장이 없으면 1) */
  edges: number[]
  score: number
}

const PERMUTATIONS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]

/** 이 조합의 가장 좋은 자리 배치 */
function bestOrder(combo: General[], enemies: Array<General | undefined>): { order: General[]; edges: number[]; edge: number } {
  let best = { order: combo, edges: [1, 1, 1], edge: -1, tank: -1 }
  for (const perm of PERMUTATIONS) {
    const order = perm.map(index => combo[index])
    const edges = order.map((general, lane) => (enemies[lane] ? matchup(general.role, enemies[lane]!.role) : 1))
    const edge = edges.reduce((product, value) => product * value, 1)
    const tank = order[1].defense + order[1].leadership
    if (edge > best.edge + 1e-9 || (Math.abs(edge - best.edge) < 1e-9 && tank > best.tank)) best = { order, edges, edge, tank }
  }
  return best
}

/**
 * 고른 무장이 들어간 추천 조합(기본 5개). 보유 무장이 3명보다 적으면 빈 목록.
 * enemies: 다음 시나리오의 좌·중·우 적장(없으면 상성을 따지지 않는다)
 */
export function recommendCombos(state: StrategyState, anchorId: string, enemies: Array<General | undefined> = [], count = 5): ComboAdvice[] {
  const anchor = state.generals.find(general => general.id === anchorId)
  if (!anchor || state.generals.length < 3) return []
  const power = new Map(state.generals.map(general => [general.id, combatPower(general) + equipmentPower(state, general.id)]))
  // 계산량을 줄이려 함께 설 후보는 전투력 상위 24명까지만(인연 상대는 항상 포함)
  const others = state.generals.filter(general => general.id !== anchorId)
  const ranked = [...others].sort((left, right) => (power.get(right.id) ?? 0) - (power.get(left.id) ?? 0))
  const bondMates = new Set(others.filter(general => bondFor([anchorId, general.id]) || ranked.slice(0, 24).includes(general)).map(general => general.id))
  const pool = others.filter(general => bondMates.has(general.id) || ranked.indexOf(general) < 24)
  const results: ComboAdvice[] = []
  for (let a = 0; a < pool.length; a += 1) {
    for (let b = a + 1; b < pool.length; b += 1) {
      const combo = [anchor, pool[a], pool[b]]
      const { order, edges, edge } = bestOrder(combo, enemies)
      const ids = order.map(general => general.id)
      const bond = bondFor(ids)
      const roles = new Set(combo.map(general => general.role)).size
      const total = combo.reduce((sum, general) => sum + (power.get(general.id) ?? 0), 0)
      const score = total * (bond ? 1.08 : 1) * (1 + 0.03 * Math.max(0, roles - 1)) * edge
      results.push({ ids, power: total, bond, roles, edges, score })
    }
  }
  return results.sort((left, right) => right.score - left.score).slice(0, count)
}

/** 추천 조합으로 편성한다 */
export function applyCombo(state: StrategyState, ids: string[]): { ok: boolean; message: string } {
  const owned = ids.map(id => state.generals.find(general => general.id === id))
  if (ids.length !== 3 || owned.some(general => !general) || new Set(ids).size !== 3) return { ok: false, message: '이 조합의 무장을 모두 보유하고 있지 않습니다.' }
  state.formation = [...ids]
  const bond = bondFor(ids)
  state.lastNotice = `추천 조합으로 편성 · ${owned.map(general => general!.name).join(' · ')}${bond ? ` · 인연 「${bond.name}」` : ''} · 전투력 ${formatNumber(owned.reduce((sum, general) => sum + combatPower(general!) + equipmentPower(state, general!.id), 0))}`
  return { ok: true, message: state.lastNotice }
}
