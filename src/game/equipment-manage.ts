// 장비 보관·관리: 잠금, 분해(옥패·철 환급), 일괄 분해, 무장별 장비 프리셋.
// - 장착 중인 장비(묶음의 장착분)·잠긴 장비·신화장비는 분해되지 않는다
// - 일괄 분해는 강화하지 않은(Lv.1) 장비만 대상으로 한다(강화한 장비는 하나씩 확인하고 분해)
import { EQUIPMENT_GRADE_META, equipEquipment, formatNumber, type Equipment, type EquipmentGrade, type EquipmentType, type StrategyState } from './strategy'

export const DISMANTLE_YIELD: Record<Exclude<EquipmentGrade, 'mythic'>, { honor: number; iron: number }> = {
  normal: { honor: 6, iron: 30 },
  rare: { honor: 15, iron: 60 },
  unique: { honor: 40, iron: 120 },
  legendary: { honor: 100, iron: 250 },
}
/** 강화한 장비를 분해하면 강화에 쓴 은전·철의 이만큼을 돌려준다 */
export const DISMANTLE_ENHANCE_REFUND = 0.5
/** 보관 장비 줄 수가 이보다 많으면 정리를 권한다(강제 한도 없음) */
export const EQUIPMENT_STORAGE_WARN = 300
export const EQUIPMENT_PRESET_SLOTS = 3

export type Loadout = Partial<Record<EquipmentType, string>>
export type EquipmentPresets = Record<string, Array<Loadout | null>>
const GRADE_ORDER: EquipmentGrade[] = ['normal', 'rare', 'unique', 'legendary', 'mythic']

/** 장비 id → 장착한 무장 id */
export function equipmentOwners(state: StrategyState): Map<string, string> {
  const owners = new Map<string, string>()
  Object.entries(state.equipmentLoadouts ?? {}).forEach(([generalId, loadout]) => Object.values(loadout ?? {}).forEach(itemId => { if (itemId) owners.set(itemId, generalId) }))
  return owners
}

/** 이 묶음에서 분해할 수 있는 개수(장착분 1개 제외, 잠금·신화는 0) */
export function dismantlableCount(state: StrategyState, item: Equipment, owners = equipmentOwners(state)): number {
  if (item.locked || item.grade === 'mythic') return 0
  return Math.max(0, (item.quantity ?? 1) - (owners.has(item.id) ? 1 : 0))
}

/** 강화(Lv.1 → 지금 레벨)에 쓴 은전·철(연구 할인 전 기준) */
function enhanceSpend(item: Equipment): { silver: number; iron: number } {
  let silver = 0, iron = 0
  for (let level = 1; level < item.level; level += 1) { silver += 420 + level * 260; iron += 100 + level * 75 }
  return { silver, iron }
}

/** 장비 1개를 분해했을 때 받는 것 */
export function dismantleYield(item: Equipment): { honor: number; iron: number; silver: number } {
  if (item.grade === 'mythic') return { honor: 0, iron: 0, silver: 0 }
  const base = DISMANTLE_YIELD[item.grade]
  const spent = enhanceSpend(item)
  return { honor: base.honor, iron: base.iron + Math.round(spent.iron * DISMANTLE_ENHANCE_REFUND), silver: Math.round(spent.silver * DISMANTLE_ENHANCE_REFUND) }
}

function grant(state: StrategyState, gain: { honor: number; iron: number; silver: number }): void {
  state.honor += gain.honor
  state.silver += gain.silver
  state.resources.silver = state.silver
  state.resources.iron = (state.resources.iron ?? 0) + gain.iron
}

function removeCopies(state: StrategyState, item: Equipment, count: number): void {
  const left = (item.quantity ?? 1) - count
  if (left > 0) item.quantity = left
  else state.equipmentInventory = state.equipmentInventory.filter(candidate => candidate !== item)
}

const gainText = (gain: { honor: number; iron: number; silver: number }) => [`옥패 +${formatNumber(gain.honor)}`, `철 +${formatNumber(gain.iron)}`, gain.silver ? `은전 +${formatNumber(gain.silver)}` : ''].filter(Boolean).join(' · ')

export interface ManageResult { ok: boolean; message: string; count?: number; gain?: { honor: number; iron: number; silver: number } }

/** 장비 분해(묶음에서 count개) */
export function dismantleEquipment(state: StrategyState, itemId: string, count = 1): ManageResult {
  const item = state.equipmentInventory.find(candidate => candidate.id === itemId)
  if (!item) return { ok: false, message: '장비를 찾을 수 없습니다.' }
  if (item.grade === 'mythic') return { ok: false, message: '신화장비는 분해할 수 없습니다.' }
  if (item.locked) return { ok: false, message: '잠긴 장비입니다. 잠금을 풀어야 분해할 수 있습니다.' }
  const available = dismantlableCount(state, item)
  if (available <= 0) return { ok: false, message: '장착 중인 장비는 분해할 수 없습니다. 먼저 장착을 해제하십시오.' }
  const n = Math.max(1, Math.min(available, Math.trunc(count)))
  const one = dismantleYield(item)
  const gain = { honor: one.honor * n, iron: one.iron * n, silver: one.silver * n }
  grant(state, gain)
  removeCopies(state, item, n)
  state.lastNotice = `${EQUIPMENT_GRADE_META[item.grade].label} ${item.name} ${n}개 분해 · ${gainText(gain)}`
  return { ok: true, message: state.lastNotice, count: n, gain }
}

/** 일괄 분해 대상: 이 등급 이하 · 강화 안 함 · 잠금/장착분 제외 */
export function bulkDismantleTargets(state: StrategyState, maxGrade: Exclude<EquipmentGrade, 'legendary' | 'mythic'>): Array<{ item: Equipment; count: number }> {
  const owners = equipmentOwners(state)
  const limit = GRADE_ORDER.indexOf(maxGrade)
  return state.equipmentInventory
    .filter(item => GRADE_ORDER.indexOf(item.grade) <= limit && item.level <= 1)
    .map(item => ({ item, count: dismantlableCount(state, item, owners) }))
    .filter(entry => entry.count > 0)
}

export function bulkDismantlePreview(state: StrategyState, maxGrade: Exclude<EquipmentGrade, 'legendary' | 'mythic'>): { count: number; honor: number; iron: number } {
  return bulkDismantleTargets(state, maxGrade).reduce((sum, { item, count }) => {
    const one = dismantleYield(item)
    return { count: sum.count + count, honor: sum.honor + one.honor * count, iron: sum.iron + one.iron * count }
  }, { count: 0, honor: 0, iron: 0 })
}

export function bulkDismantle(state: StrategyState, maxGrade: Exclude<EquipmentGrade, 'legendary' | 'mythic'>): ManageResult {
  const targets = bulkDismantleTargets(state, maxGrade)
  if (!targets.length) return { ok: false, message: '분해할 장비가 없습니다(잠금·장착·강화한 장비는 제외).' }
  const gain = { honor: 0, iron: 0, silver: 0 }
  let count = 0
  targets.forEach(({ item, count: n }) => {
    const one = dismantleYield(item)
    gain.honor += one.honor * n; gain.iron += one.iron * n; gain.silver += one.silver * n
    count += n
    removeCopies(state, item, n)
  })
  grant(state, gain)
  state.lastNotice = `${EQUIPMENT_GRADE_META[maxGrade].label} 이하 장비 ${formatNumber(count)}개 일괄 분해 · ${gainText(gain)}`
  return { ok: true, message: state.lastNotice, count, gain }
}

export function toggleEquipmentLock(state: StrategyState, itemId: string): ManageResult {
  const item = state.equipmentInventory.find(candidate => candidate.id === itemId)
  if (!item) return { ok: false, message: '장비를 찾을 수 없습니다.' }
  item.locked = !item.locked
  state.lastNotice = `${item.name} ${item.locked ? '잠금 · 분해되지 않습니다' : '잠금 해제'}`
  return { ok: true, message: state.lastNotice }
}

/** 신화장비는 처음부터 잠근다(사용자가 풀 수는 있음) */
export function lockMythicByDefault(state: StrategyState): void {
  state.equipmentInventory.forEach(item => { if (item.grade === 'mythic' && item.locked === undefined) item.locked = true })
}

// ── 장비 프리셋 ───────────────────────────────────────────
export function ensureEquipmentPresets(state: StrategyState): EquipmentPresets {
  if (!state.equipmentPresets || typeof state.equipmentPresets !== 'object') state.equipmentPresets = {}
  return state.equipmentPresets
}

export function saveEquipmentPreset(state: StrategyState, generalId: string, slot: number): ManageResult {
  if (slot < 0 || slot >= EQUIPMENT_PRESET_SLOTS) return { ok: false, message: '프리셋 칸이 올바르지 않습니다.' }
  const loadout = state.equipmentLoadouts[generalId] ?? {}
  if (!Object.values(loadout).some(Boolean)) return { ok: false, message: '장착한 장비가 없어 저장할 것이 없습니다.' }
  const presets = ensureEquipmentPresets(state)
  const list = presets[generalId] ?? Array(EQUIPMENT_PRESET_SLOTS).fill(null)
  list[slot] = { ...loadout }
  presets[generalId] = list
  const name = state.generals.find(general => general.id === generalId)?.name ?? '무장'
  state.lastNotice = `${name} 장비 프리셋 ${slot + 1} 저장`
  return { ok: true, message: state.lastNotice }
}

/** 프리셋 장비를 장착한다(다른 무장이 끼고 있으면 옮겨 온다). 없어진 장비는 건너뛴다 */
export function applyEquipmentPreset(state: StrategyState, generalId: string, slot: number): ManageResult {
  const preset = ensureEquipmentPresets(state)[generalId]?.[slot]
  if (!preset) return { ok: false, message: `프리셋 ${slot + 1}이 비어 있습니다.` }
  const owners = equipmentOwners(state)
  let equipped = 0, missing = 0
  const moved: string[] = []
  ;(Object.entries(preset) as Array<[EquipmentType, string]>).forEach(([, itemId]) => {
    if (!state.equipmentInventory.some(item => item.id === itemId)) { missing += 1; return }
    const owner = owners.get(itemId)
    if (owner === generalId) { equipped += 1; return }
    if (owner) moved.push(state.generals.find(general => general.id === owner)?.name ?? owner)
    if (equipEquipment(state, generalId, itemId).ok) equipped += 1
  })
  const name = state.generals.find(general => general.id === generalId)?.name ?? '무장'
  state.lastNotice = `${name} 프리셋 ${slot + 1} 장착 · ${equipped}부위${moved.length ? ` · ${moved.join('·')}에게서 옮겨 옴` : ''}${missing ? ` · 없어진 장비 ${missing}개 제외` : ''}`
  return { ok: equipped > 0, message: state.lastNotice }
}

/** 서버 저장: 장착 정보 JSON 안에 프리셋을 함께 담는다(서버 칸을 새로 만들지 않기 위해) */
const PRESET_KEY = '__presets'
/** 2군·3군도 함께 담는다: 서버에 squadData 칸이 생기기 전에도(옛 서버) 계정에 남도록 */
const SQUAD_KEY = '__squads'
export function packLoadouts(state: StrategyState): Record<string, unknown> {
  return { ...state.equipmentLoadouts, [PRESET_KEY]: ensureEquipmentPresets(state), [SQUAD_KEY]: state.reserveSquads ?? [] }
}
export function unpackLoadouts(raw: unknown): { loadouts: StrategyState['equipmentLoadouts']; presets: EquipmentPresets | null; squads: string[][] | null } {
  if (!raw || typeof raw !== 'object') return { loadouts: {}, presets: null, squads: null }
  const { [PRESET_KEY]: presets, [SQUAD_KEY]: squads, ...loadouts } = raw as Record<string, unknown>
  return {
    loadouts: loadouts as StrategyState['equipmentLoadouts'],
    presets: presets && typeof presets === 'object' ? presets as EquipmentPresets : null,
    squads: Array.isArray(squads) ? squads.filter(Array.isArray).map(list => (list as unknown[]).filter((id): id is string => typeof id === 'string')) : null,
  }
}
