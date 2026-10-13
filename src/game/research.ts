// 기술 연구: 5분야 × 6단계(30단계, 갈림길 포함 40개). 3·6단계는 둘 중 하나를 고르는 갈림길.
// 연구에는 단계별 시간이 걸리고 한 번에 하나만 진행한다. 금화로 즉시 완료하거나 취소(전액 환급)할 수 있다.
// 이 파일은 strategy.ts의 타입만 가져다 쓴다(실행 시 순환 참조 없음).
import type { ResearchNode, ResourceKey, StrategyState } from './strategy'
import { locale } from '../i18n/lang'

export type ResearchBranch = '부국' | '강병' | '지략' | '제패' | '인재'

export const RESEARCH_BRANCHES: Array<{ id: ResearchBranch; prefix: string; hint: string; resource: ResourceKey }> = [
  { id: '부국', prefix: 'econ', hint: '내정 수확·건물·수확 주기', resource: 'grain' },
  { id: '강병', prefix: 'army', hint: '전투 병력·피해·전열 붕괴', resource: 'iron' },
  { id: '지략', prefix: 'strat', hint: '예고 대응·스킬·전술 명령', resource: 'silver' },
  { id: '제패', prefix: 'realm', hint: '공성·수비대·세력전', resource: 'wood' },
  { id: '인재', prefix: 'talent', hint: '병서·모집·강화·장비', resource: 'silver' },
]

/** 단계별 연구 시간(분): 5분 → 20분 → 1시간 → 2시간 → 4시간 → 8시간 */
export const RESEARCH_MINUTES = [5, 20, 60, 120, 240, 480] as const
const INFLUENCE_COST = [600, 1400, 3000, 5200, 8500, 13000]
const RESOURCE_COST = [1200, 2800, 6000, 10500, 17000, 26000]

type Def = [id: string, tier: number, choice: '' | 'a' | 'b', name: string, description: string]
const DEFS: Record<ResearchBranch, Def[]> = {
  부국: [
    ['econ-1', 1, '', '둔전제', '모든 아군 도시의 식량 수확 +15%'],
    ['econ-2', 2, '', '상평창', '은전 수확 +15%'],
    ['econ-3a', 3, 'a', '염철 전매', '철·목재 수확 +25%'],
    ['econ-3b', 3, 'b', '호시 교역', '영향력 수확 +20%'],
    ['econ-4', 4, '', '도량형 통일', '건물 강화 비용 −15%'],
    ['econ-5', 5, '', '역참망', '내정 수확 대기 시간 −20%'],
    ['econ-6a', 6, 'a', '천하 곳간', '모든 수확 +10%'],
    ['econ-6b', 6, 'b', '구휼 제도', '방어전 패배 때 번영도 하락 절반, 식량 수확 +5%'],
  ],
  강병: [
    ['army-1', 1, '', '오부 훈련', '전투 아군 최대 병력 +8%'],
    ['army-2', 2, '', '연노 제식', '궁병 무장의 병력 공격 +12%'],
    ['army-3a', 3, 'a', '철기 돌격', '돌격형 스킬 사기 피해 +10%'],
    ['army-3b', 3, 'b', '방패 진형', '아군이 받는 병력 피해 −10%'],
    ['army-4', 4, '', '군량 보급', '전투 시작 전술 게이지 +20'],
    ['army-5', 5, '', '정예 징집', '전열 붕괴 때 병력 손실 20% → 12%'],
    ['army-6a', 6, 'a', '패왕의 군세', '3막 적 사기 최대치 −10%'],
    ['army-6b', 6, 'b', '불패 진형', '전투마다 첫 전열 붕괴 1회를 막아냄'],
  ],
  지략: [
    ['strat-1', 1, '', '손자병법 주해', '예고 대응에 성공하면 위협도 추가 −4'],
    ['strat-2', 2, '', '천문 관측', '적 전술 예고 대응 시간 +0.3초'],
    ['strat-3a', 3, 'a', '팔진 연구', '계략·통솔형 스킬 쿨다운 −10%'],
    ['strat-3b', 3, 'b', '화공 연구', '화계로 깎이는 적 사기 +25%'],
    ['strat-4', 4, '', '간자 운용', '적장 스킬 예고를 0.5초 일찍'],
    ['strat-5', 5, '', '묘책', '전술 명령 비용 −15%'],
    ['strat-6a', 6, 'a', '와룡의 지혜', '스킬 1회 사기 피해 상한 40 → 44'],
    ['strat-6b', 6, 'b', '연환계', '연계 피해 증폭 +10%'],
  ],
  제패: [
    ['realm-1', 1, '', '성벽 보강', '방어전에서 성벽이 받는 피해 −15%'],
    ['realm-2', 2, '', '공성 병기', '공성 성벽 피해 +15%'],
    ['realm-3a', 3, 'a', '봉화대', '방어전 수비대 전력 +15%'],
    ['realm-3b', 3, 'b', '운제 공성', '공성 출정 비용 −25%'],
    ['realm-4', 4, '', '둔병제', '새로 세우는 수비대 전력 +10%'],
    ['realm-5', 5, '', '기동 군단', '공성 재출정 대기 −25%'],
    ['realm-6a', 6, 'a', '천하 통일', '세력전 승리 금화 +20%'],
    ['realm-6b', 6, 'b', '철옹성', '방어전에서 성벽이 받는 피해 추가 −30%'],
  ],
  인재: [
    ['talent-1', 1, '', '인재 등용', '수확할 때 병서 획득(영향력 200당 1), 모든 병서 획득 +20%'],
    ['talent-2', 2, '', '구현령', '무장 모집 명망 비용 −10%'],
    ['talent-3a', 3, 'a', '명장 발굴', '모집 확률: 5등급 2% → 3%, 4등급 8% → 10%'],
    ['talent-3b', 3, 'b', '장인 공방', '장비 강화 비용 −15%'],
    ['talent-4', 4, '', '사관 교육', '무장 레벨업 비용 −10%'],
    ['talent-5', 5, '', '역사 편찬', '전투 승리 명망 +15%'],
    ['talent-6a', 6, 'a', '천하 인재', '출전 무장 3명의 능력치 +3%'],
    ['talent-6b', 6, 'b', '명품 제련', '장비 뽑기 전설 확률 5% → 8%'],
  ],
}

export function createResearch(): ResearchNode[] {
  return RESEARCH_BRANCHES.flatMap(branch => DEFS[branch.id].map(([id, tier, choice, name, description]) => ({
    id, name, branch: branch.id, tier: tier as ResearchNode['tier'], description,
    choice: choice || undefined,
    cost: { influence: INFLUENCE_COST[tier - 1], [branch.resource]: RESOURCE_COST[tier - 1] } as Partial<Record<ResourceKey, number>>,
    durationMs: RESEARCH_MINUTES[tier - 1] * 60_000,
    unlocked: false,
  })))
}

const DEF_IDS = new Set(Object.values(DEFS).flat().map(def => def[0]))

/**
 * 저장된 연구를 새 구성에 맞춘다. 예전 연구(58개 체계)를 완료했다면 들인 자원을 돌려준다.
 * 반환값: 환급한 자원(없으면 null)
 */
export function normalizeResearch(state: StrategyState): Partial<Record<ResourceKey, number>> | null {
  const saved = Array.isArray(state.research) ? state.research : []
  const refund: Partial<Record<ResourceKey, number>> = {}
  let refunded = false
  for (const node of saved) {
    if (!node || DEF_IDS.has(node.id) || !node.unlocked) continue
    for (const [key, value] of Object.entries(node.cost ?? {})) {
      refund[key as ResourceKey] = (refund[key as ResourceKey] ?? 0) + (value ?? 0)
      refunded = true
    }
  }
  const byId = new Map(saved.filter(node => node && DEF_IDS.has(node.id)).map(node => [node.id, node]))
  state.research = createResearch().map(node => {
    const old = byId.get(node.id)
    return old ? { ...node, unlocked: Boolean(old.unlocked), endsAt: old.unlocked ? undefined : old.endsAt, startedAt: old.unlocked ? undefined : old.startedAt } : node
  })
  // 진행 중 연구는 하나만
  let active = false
  for (const node of state.research) {
    if (node.endsAt === undefined) continue
    if (active || node.unlocked) { node.endsAt = undefined; node.startedAt = undefined } else active = true
  }
  if (!refunded) return null
  for (const [key, value] of Object.entries(refund)) {
    if (key === 'silver') { state.silver += value ?? 0; state.resources.silver = state.silver } else state.resources[key as ResourceKey] += value ?? 0
  }
  return refund
}

export function researchDone(state: StrategyState, id: string): boolean {
  return state.research.some(node => node.id === id && node.unlocked)
}
export function activeResearch(state: StrategyState): ResearchNode | null {
  return state.research.find(node => node.endsAt !== undefined && !node.unlocked) ?? null
}
function sibling(state: StrategyState, node: ResearchNode): ResearchNode | undefined {
  if (!node.choice) return undefined
  return state.research.find(other => other.branch === node.branch && other.tier === node.tier && other.id !== node.id)
}
function tierDone(state: StrategyState, branch: string, tier: number): boolean {
  return state.research.some(node => node.branch === branch && node.tier === tier && node.unlocked)
}

export type ResearchStatus = 'done' | 'active' | 'available' | 'switch' | 'locked' | 'busy'
/** 화면 표시용 상태: switch = 갈림길의 다른 쪽을 이미 완료(다시 고르면 그쪽 효과는 사라진다) */
export function researchStatus(state: StrategyState, node: ResearchNode): ResearchStatus {
  if (node.unlocked) return 'done'
  if (node.endsAt !== undefined) return 'active'
  if (node.tier > 1 && !tierDone(state, node.branch, node.tier - 1)) return 'locked'
  if (activeResearch(state)) return 'busy'
  const other = sibling(state, node)
  if (other?.unlocked) return 'switch'
  return 'available'
}

export function researchCostText(cost: Partial<Record<ResourceKey, number>>, labels: Record<ResourceKey, string>): string {
  return Object.entries(cost).map(([key, value]) => `${labels[key as ResourceKey]} ${new Intl.NumberFormat(locale()).format(value ?? 0)}`).join(' · ')
}

export function canPay(state: StrategyState, cost: Partial<Record<ResourceKey, number>>): boolean {
  return Object.entries(cost).every(([key, value]) => (key === 'silver' ? state.silver : state.resources[key as ResourceKey]) >= (value ?? 0))
}
function pay(state: StrategyState, cost: Partial<Record<ResourceKey, number>>, sign: 1 | -1): void {
  for (const [key, value] of Object.entries(cost)) {
    if (key === 'silver') state.silver -= sign * (value ?? 0)
    else state.resources[key as ResourceKey] -= sign * (value ?? 0)
  }
  state.resources.silver = state.silver
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  if (h) return `${h}시간${m ? ` ${m}분` : ''}`
  if (m) return `${m}분${s && m < 10 ? ` ${s}초` : ''}`
  return `${s}초`
}

export function startResearch(state: StrategyState, id: string, now = Date.now()): { ok: boolean; message: string } {
  settleResearch(state, now)
  const node = state.research.find(item => item.id === id)
  if (!node) return { ok: false, message: '연구 항목을 찾을 수 없습니다.' }
  const status = researchStatus(state, node)
  if (status === 'done') return { ok: false, message: '이미 완료한 연구입니다.' }
  if (status === 'active') return { ok: false, message: '이미 진행 중인 연구입니다.' }
  if (status === 'locked') return { ok: false, message: `앞 단계(${node.tier - 1}단계) 연구를 먼저 완료하십시오.` }
  if (status === 'busy') return { ok: false, message: `다른 연구가 진행 중입니다 · ${activeResearch(state)?.name}` }
  if (!canPay(state, node.cost)) return { ok: false, message: '연구 자원이 부족합니다.' }
  pay(state, node.cost, 1)
  node.startedAt = now
  node.endsAt = now + node.durationMs
  state.lastNotice = `연구 시작 · ${node.name} · ${formatDuration(node.durationMs)} 후 완료`
  return { ok: true, message: state.lastNotice }
}

export function cancelResearch(state: StrategyState): { ok: boolean; message: string } {
  const node = activeResearch(state)
  if (!node) return { ok: false, message: '진행 중인 연구가 없습니다.' }
  pay(state, node.cost, -1)
  node.endsAt = undefined
  node.startedAt = undefined
  state.lastNotice = `연구 취소 · ${node.name} · 자원을 모두 돌려받았습니다.`
  return { ok: true, message: state.lastNotice }
}

/** 남은 시간 10분마다 금화 1개(최소 1개) */
export function rushCost(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / 600_000))
}

export function rushResearch(state: StrategyState, now = Date.now()): { ok: boolean; message: string } {
  const node = activeResearch(state)
  if (!node || node.endsAt === undefined) return { ok: false, message: '진행 중인 연구가 없습니다.' }
  const cost = rushCost(node.endsAt - now)
  if (state.gold < cost) return { ok: false, message: `금화가 부족합니다. 즉시 완료에 금화 ${cost}개가 필요합니다.` }
  state.gold -= cost
  complete(state, node)
  state.lastNotice = `즉시 완료 · ${node.name} (금화 −${cost})`
  return { ok: true, message: state.lastNotice }
}

function complete(state: StrategyState, node: ResearchNode): void {
  node.unlocked = true
  node.endsAt = undefined
  node.startedAt = undefined
  const other = sibling(state, node)
  if (other) other.unlocked = false // 갈림길은 한쪽만
}

/** 시간이 다 된 연구를 완료 처리한다. 완료한 연구 목록을 돌려준다. */
export function settleResearch(state: StrategyState, now = Date.now()): ResearchNode[] {
  const done: ResearchNode[] = []
  for (const node of state.research) {
    if (node.endsAt !== undefined && !node.unlocked && now >= node.endsAt) { complete(state, node); done.push(node) }
  }
  if (done.length) state.lastNotice = `연구 완료 · ${done.map(node => node.name).join(' · ')}`
  return done
}

// ── 효과 ─────────────────────────────────────────────────────
export interface ResearchMods {
  grain: number; silver: number; woodIron: number; influence: number; allIncome: number
  buildingCost: number; incomeCooldown: number; prosperityLoss: number
  raidWallDamage: number; siegeDamage: number; raidGarrison: number; siegeCost: number; newGarrison: number; siegeCooldown: number; factionGold: number
  harvestManuals: boolean; manuals: number; recruitCost: number; recruitRate: boolean; enhanceCost: number; levelCost: number; battleHonor: number; formationStats: number; legendaryRate: number
  battle: BattleResearch
}

/** 전투 규칙(battle-core)에 넘기는 아군 보정 */
export interface BattleResearch {
  troops?: number
  archerAtk?: number
  chargeSkill?: number
  damageTaken?: number
  startGauge?: number
  collapseLoss?: number
  finalActMorale?: number
  ignoreFirstCollapse?: boolean
  breakThreat?: number
  window?: number
  strategistCd?: number
  fire?: number
  enemyWarn?: number
  tacticCost?: number
  capBonus?: number
  combo?: number
}

export function researchMods(state: StrategyState): ResearchMods {
  const has = (id: string) => researchDone(state, id)
  return {
    grain: (has('econ-1') ? 0.15 : 0) + (has('econ-6b') ? 0.05 : 0),
    silver: has('econ-2') ? 0.15 : 0,
    woodIron: has('econ-3a') ? 0.25 : 0,
    influence: has('econ-3b') ? 0.2 : 0,
    allIncome: has('econ-6a') ? 0.1 : 0,
    buildingCost: has('econ-4') ? 0.15 : 0,
    incomeCooldown: has('econ-5') ? 0.2 : 0,
    prosperityLoss: has('econ-6b') ? 0.5 : 0,
    raidWallDamage: 1 - (has('realm-1') ? 0.15 : 0) - (has('realm-6b') ? 0.3 : 0),
    siegeDamage: has('realm-2') ? 0.15 : 0,
    raidGarrison: has('realm-3a') ? 0.15 : 0,
    siegeCost: has('realm-3b') ? 0.25 : 0,
    newGarrison: has('realm-4') ? 0.1 : 0,
    siegeCooldown: has('realm-5') ? 0.25 : 0,
    factionGold: has('realm-6a') ? 0.2 : 0,
    harvestManuals: has('talent-1'),
    manuals: has('talent-1') ? 0.2 : 0,
    recruitCost: has('talent-2') ? 0.1 : 0,
    recruitRate: has('talent-3a'),
    enhanceCost: has('talent-3b') ? 0.15 : 0,
    levelCost: has('talent-4') ? 0.1 : 0,
    battleHonor: has('talent-5') ? 0.15 : 0,
    formationStats: has('talent-6a') ? 0.03 : 0,
    legendaryRate: has('talent-6b') ? 3 : 0,
    battle: battleResearch(state),
  }
}

export function battleResearch(state: Pick<StrategyState, 'research'>): BattleResearch {
  const has = (id: string) => state.research.some(node => node.id === id && node.unlocked)
  return {
    troops: has('army-1') ? 0.08 : 0,
    archerAtk: has('army-2') ? 0.12 : 0,
    chargeSkill: has('army-3a') ? 0.1 : 0,
    damageTaken: has('army-3b') ? 0.1 : 0,
    startGauge: has('army-4') ? 20 : 0,
    collapseLoss: has('army-5') ? 0.12 : undefined,
    finalActMorale: has('army-6a') ? 0.1 : 0,
    ignoreFirstCollapse: has('army-6b'),
    breakThreat: has('strat-1') ? 4 : 0,
    window: has('strat-2') ? 0.3 : 0,
    strategistCd: has('strat-3a') ? 0.1 : 0,
    fire: has('strat-3b') ? 0.25 : 0,
    enemyWarn: has('strat-4') ? 0.5 : 0,
    tacticCost: has('strat-5') ? 0.15 : 0,
    capBonus: has('strat-6a') ? 4 : 0,
    combo: has('strat-6b') ? 0.1 : 0,
  }
}

/** 화면에 보일 효과 요약(완료한 연구) */
export function researchSummary(state: StrategyState): string[] {
  return state.research.filter(node => node.unlocked).map(node => `${node.name} · ${node.description}`)
}
