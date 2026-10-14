// 1·2·3군 편성. 1군은 지금까지의 출전 편성(state.formation)이고, 2·3군은 state.reserveSquads에 둔다.
// - 한 무장은 한 군에만 설 수 있다(장비가 무장에 붙어 있으므로). 1군에 넣으면 2·3군에서 빠진다
// - 2·3군은 레이드에서 1군 뒤로 이어 싸운다(누적 피해 합계)
import { GENERAL_SKILLS, bondFor } from './skills'
import { autoEquip, combatPower, equipmentPower, findGeneral, formatNumber, frontLineOrder, type General, type StrategyState } from './strategy'

export const SQUAD_COUNT = 3
export const SQUAD_LABELS = ['1군', '2군', '3군']

/** 저장된 2·3군을 정리한다: 보유하지 않은 무장·1군 무장·중복 제거, 군마다 최대 3명 */
export function ensureSquads(state: StrategyState): string[][] {
  const owned = new Set(state.generals.map(general => general.id))
  const taken = new Set(state.formation)
  const raw = Array.isArray(state.reserveSquads) ? state.reserveSquads : []
  const next = Array.from({ length: SQUAD_COUNT - 1 }, (_, index) => {
    const list = Array.isArray(raw[index]) ? raw[index] : []
    const kept: string[] = []
    for (const id of list) {
      if (typeof id !== 'string' || !owned.has(id) || taken.has(id) || kept.length >= 3) continue
      kept.push(id)
      taken.add(id)
    }
    return kept
  })
  // 같은 배열을 고쳐 쓴다(다른 곳에서 잡아 둔 참조가 끊기지 않게)
  if (!Array.isArray(state.reserveSquads)) state.reserveSquads = []
  state.reserveSquads.length = 0
  state.reserveSquads.push(...next)
  return state.reserveSquads
}

/** 군 번호(0=1군, 1=2군, 2=3군)의 무장 id */
export function squadIds(state: StrategyState, squad: number): string[] {
  if (squad <= 0) return state.formation
  return ensureSquads(state)[squad - 1] ?? []
}

/** 무장이 속한 군(없으면 -1) */
export function squadOf(state: StrategyState, id: string): number {
  if (state.formation.includes(id)) return 0
  const reserves = ensureSquads(state)
  const index = reserves.findIndex(list => list.includes(id))
  return index < 0 ? -1 : index + 1
}

export interface SquadResult { ok: boolean; message: string }

/** 2·3군에 넣거나 뺀다. 다른 군에 있던 무장은 옮겨 온다(1군의 마지막 1명은 옮길 수 없다) */
export function toggleSquadMember(state: StrategyState, squad: number, id: string, slot?: number): SquadResult {
  if (squad < 1 || squad >= SQUAD_COUNT) return { ok: false, message: '2군·3군만 여기서 편성합니다.' }
  const general = findGeneral(state, id)
  if (!general) return { ok: false, message: '무장을 찾을 수 없습니다.' }
  const from = squadOf(state, id)
  const reserves = ensureSquads(state)
  const list = reserves[squad - 1]
  if (list.includes(id) && slot === undefined) {
    reserves[squad - 1] = list.filter(item => item !== id)
    state.lastNotice = `${general.name} · ${SQUAD_LABELS[squad]}에서 뺐습니다.`
    return { ok: true, message: state.lastNotice }
  }
  if (from === 0) {
    if (state.formation.length <= 1) return { ok: false, message: '1군에는 최소 1명이 있어야 합니다.' }
    state.formation = state.formation.filter(item => item !== id)
  } else if (from > 0) reserves[from - 1] = reserves[from - 1].filter(item => item !== id)
  const target = reserves[squad - 1].filter(item => item !== id)
  if (slot !== undefined && slot >= 0 && slot < 3 && target[slot]) target[slot] = id
  else if (target.length >= 3) target[2] = id
  else target.push(id)
  reserves[squad - 1] = target
  state.lastNotice = `${general.name} · ${SQUAD_LABELS[squad]} 편성${from >= 0 && from !== squad ? ` (${SQUAD_LABELS[from]}에서 옮김)` : ''}`
  return { ok: true, message: state.lastNotice }
}

/** 이 군과 1군을 통째로 바꾼다 */
export function swapWithFirstSquad(state: StrategyState, squad: number): SquadResult {
  const reserves = ensureSquads(state)
  const list = reserves[squad - 1]
  if (!list?.length) return { ok: false, message: `${SQUAD_LABELS[squad]}이 비어 있습니다.` }
  reserves[squad - 1] = [...state.formation]
  state.formation = [...list]
  state.lastNotice = `${SQUAD_LABELS[squad]}과 1군을 바꿨습니다.`
  return { ok: true, message: state.lastNotice }
}

/** 다른 군에 서지 않은 무장 중 가장 좋은 3명으로 이 군을 짠다(인연·수호형 전열·병과 다양성 가산) */
export function autoSquad(state: StrategyState, squad: number): SquadResult {
  if (squad < 1 || squad >= SQUAD_COUNT) return { ok: false, message: '2군·3군만 여기서 편성합니다.' }
  const reserves = ensureSquads(state)
  const others = new Set([...state.formation, ...reserves.flatMap((list, index) => index === squad - 1 ? [] : list)])
  const power = (general: General) => combatPower(general) + equipmentPower(state, general.id)
  const pool = state.generals.filter(general => !others.has(general.id)).sort((left, right) => power(right) - power(left)).slice(0, 10)
  if (!pool.length) return { ok: false, message: '다른 군에 서지 않은 무장이 없습니다.' }
  let best = pool.slice(0, Math.min(3, pool.length))
  let bestScore = -1
  const consider = (combo: General[]) => {
    const ids = combo.map(general => general.id)
    const roles = new Set(combo.map(general => general.role)).size
    const tank = combo.some(general => GENERAL_SKILLS[general.id]?.type === '수호') ? 1.06 : 1
    const score = combo.reduce((sum, general) => sum + power(general), 0) * (bondFor(ids) ? 1.08 : 1) * (1 + 0.03 * Math.max(0, roles - 1)) * tank
    if (score > bestScore) { bestScore = score; best = combo }
  }
  if (pool.length >= 3) for (let a = 0; a < pool.length; a += 1) for (let b = a + 1; b < pool.length; b += 1) for (let c = b + 1; c < pool.length; c += 1) consider([pool[a], pool[b], pool[c]])
  const ordered = frontLineOrder(best, power)
  reserves[squad - 1] = ordered.map(general => general.id)
  state.lastNotice = `${SQUAD_LABELS[squad]} 자동 편성 · ${ordered.map(general => general.name).join(' · ')} · 전투력 ${formatNumber(squadPower(state, squad))}`
  return { ok: true, message: state.lastNotice }
}

/** 이 군 무장에게 자동 장착(다른 군 무장이 낀 장비는 건드리지 않는다) */
export function autoEquipSquad(state: StrategyState, squad: number): SquadResult {
  const ids = squadIds(state, squad)
  const protectedIds = new Set(Array.from({ length: SQUAD_COUNT }, (_, index) => index === squad ? [] : squadIds(state, index)).flat())
  const result = autoEquip(state, ids, protectedIds)
  return { ok: result.ok, message: result.message.replace('출전 무장', `${SQUAD_LABELS[squad]} 무장`) }
}

/** 군 전투력(장비 포함) */
export function squadPower(state: StrategyState, squad: number): number {
  return squadIds(state, squad).reduce((sum, id) => {
    const general = findGeneral(state, id)
    return sum + (general ? combatPower(general) + equipmentPower(state, id) : 0)
  }, 0)
}

/** 저장: 2·3군 */
export function packSquads(state: StrategyState): string[][] {
  return ensureSquads(state).map(list => [...list])
}
