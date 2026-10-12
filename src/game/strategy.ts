import { createResearch, normalizeResearch, researchMods, researchCostText, startResearch } from './research'
import cityRoutes from '../../server/city-routes.json'
import { GENERAL_SKILLS, SKILL_MORALE_CAP, SKILL_TYPE_META, activeSkillName, baseMoraleDamage, bondFor, isAwakened, skillCooldownFor, skillDefFor, type SkillType } from './skills'
import { neutralRaidPower, resolveNeutralRaid } from '../../server/neutral-raid.mjs'
export type Section = 'overview' | 'recruit' | 'roster' | 'codex' | 'formation' | 'equipment' | 'territory' | 'research' | 'battle' | 'duel' | 'shop' | 'rank' | 'board' | 'updates' | 'account' | 'admin'
export type Role = '기병' | '궁병' | '책사' | '보병'
export type Grade = 1 | 2 | 3 | 4 | 5
export type ResourceKey = 'grain' | 'silver' | 'wood' | 'iron' | 'influence'
export type CityOwner = '촉한' | '위나라' | '오나라' | '중립'
export type Faction = Exclude<CityOwner, '중립'>
export type BuildingKind = 'agriculture' | 'commerce' | 'barracks' | 'workshop' | 'academy'
export type EquipmentType = 'weapon' | 'armor' | 'accessory'
export type EquipmentGrade = 'normal' | 'rare' | 'unique' | 'legendary' | 'mythic'
export type EquipmentSet = 'command' | 'martial' | 'stratagem' | 'speed'
export type EquipmentStat = 'leadership' | 'martial' | 'stratagem' | 'speed'
export type EquipmentSpecialtyId = string

export interface EquipmentSpecialty {
  id: EquipmentSpecialtyId
  label: string
  type: EquipmentType
  stat: EquipmentStat
  value: number
  description: string
}

export interface Resources {
  grain: number
  silver: number
  wood: number
  iron: number
  influence: number
}

export interface CityBuilding {
  id: string
  name: string
  kind: BuildingKind
  level: number
  maxLevel: number
  description: string
}

export interface City {
  id: string
  name: string
  chineseName: string
  region: string
  owner: CityOwner
  level: number
  prosperity: number
  defense: number
  buildings: CityBuilding[]
  conquestProgress?: number
  garrisons?: CityGarrison[]
  defendersDefeated?: number
  battleLogs?: CityBattleLog[]
}

export interface CityGarrison {
  id: string
  generalIds: string[]
  averageLevel: number
  power: number
  source: 'player' | 'dummy'
  label: string
}

export interface CityBattleLog {
  id: string
  timestamp: number
  attackerName: string
  attackerKind: 'user' | 'ai'
  defenderName: string
  won: boolean
  damage: number
  note: string
}

export const FACTION_CAPITALS: Record<Faction, string> = { 촉한: 'chengdu', 위나라: 'ye', 오나라: 'jianye' }
export const AI_CAPITAL_ID = 'xiangyang'
export const LUOYANG_ID = 'luoyang'
export const MAX_CITY_GARRISONS = 100
export const CITY_DEFENSE_BY_LEVEL: Record<Grade, number> = { 1: 10_000, 2: 20_000, 3: 50_000, 4: 100_000, 5: 1_000_000 }
// 정식 출시 전 테스트 기간에는 최대 방어력의 90%를 약화하고 10%를 최저 방어도로 유지한다.
// 구버전 저장 데이터 복구에만 사용하는 이전 10% 하한 비율이다.
export const TERRITORY_TEST_WEAKENING_ENABLED = true
export const TERRITORY_TEST_WEAKENING_RATIO = 0.10
export const DUMMY_GARRISON_LEVEL_BY_CITY_LEVEL: Record<Grade, number> = { 1: 10, 2: 15, 3: 20, 4: 25, 5: 30 }
export const CITY_PRODUCTION_MULTIPLIER: Record<Grade, number> = { 1: 1, 2: 3, 3: 5, 4: 10, 5: 20 }
export const CITY_INCOME_REWARD_MULTIPLIER = 10
export function cityDefenseForLevel(level: number): number {
  return CITY_DEFENSE_BY_LEVEL[level as Grade] ?? CITY_DEFENSE_BY_LEVEL[5]
}
export function cityBreachThreshold(_city: Pick<City, 'level'>): number {
  // 약화는 방어력에 가하는 피해량을 뜻하며, 방어도 하한을 만들지 않는다.
  // 수비병을 모두 격파한 뒤 방어도가 0이 되면 최종 세력전을 진행한다.
  return 0
}
export function dummyGarrisonLevelForCityLevel(level: number): number {
  return DUMMY_GARRISON_LEVEL_BY_CITY_LEVEL[level as Grade] ?? DUMMY_GARRISON_LEVEL_BY_CITY_LEVEL[5]
}
export const FACTION_WAR_HONOR_COST: Record<number, number> = { 1: 100, 2: 2000, 3: 3000, 4: 4000, 5: 5000 }
export const FACTION_WAR_GOLD_REWARD: Record<number, number> = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 }
// 도시 진군로: server/city-routes.json(클라이언트·서버 공용 단일 원본)에서 만든 양방향 인접 목록.
// 낙양은 일요일 저녁에 모든 진영이 직접 출정하는 독립 전선이라 연결이 없다.
export const CITY_ADJACENCY: Readonly<Record<string, readonly string[]>> = buildAdjacency(cityRoutes.edges as Array<[string, string]>, cityRoutes.isolated)

export function buildAdjacency(edges: ReadonlyArray<readonly [string, string]>, isolated: readonly string[] = []): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const id of isolated) map[id] = []
  for (const [a, b] of edges) {
    (map[a] ??= []).push(b)
    ;(map[b] ??= []).push(a)
  }
  return map
}

export interface FactionTerritorySnapshot {
  cityId: string
  owner: CityOwner
  conquestProgress: number
  defense: number
  prosperity: number
  battleLogs?: CityBattleLog[]
  version?: number
  updatedAt?: string | Date
  /** 서버에 저장된 진영 공용 수비대 (server/021_city_garrisons.sql). 구버전 서버에는 없다. */
  garrisons?: { list: Array<{ id: string; power: number; averageLevel: number; label: string }>; defeated: number }
  /** 가장 최근 중립 습격 결과 */
  lastRaid?: { at: number; attackerCityId: string; attackerLevel: number; raidPower: number; attackerWon: boolean; damage: number; defenderLabel: string | null; captured: boolean } | null
}

export interface ResearchNode {
  id: string
  name: string
  branch: '부국' | '강병' | '지략' | '제패' | '인재'
  tier: 1 | 2 | 3 | 4 | 5 | 6
  description: string
  cost: Partial<Record<ResourceKey, number>>
  /** 갈림길: 같은 단계의 a/b 중 하나만 */
  choice?: 'a' | 'b'
  durationMs: number
  /** 진행 중이면 시작·완료 시각(ms) */
  startedAt?: number
  endsAt?: number
  prerequisite?: string
  unlocked: boolean
}

export interface Equipment {
  id: string
  quantity?: number
  name: string
  type: EquipmentType
  set: EquipmentSet
  grade: EquipmentGrade
  level: number
  mainStat: EquipmentStat
  baseValue: number
  skillName: string
  skillDescription: string
  mythicEventOnly?: boolean
  specialty?: EquipmentSpecialtyId
}

export interface General {
  id: string
  name: string
  epithet: string
  role: Role
  grade: Grade
  stars: number
  level: number
  attack: number
  defense: number
  command: number
  leadership: number
  martial: number
  stratagem: number
  speed: number
  skillName: string
  skillDescription: string
  skillUnlocked: boolean
  skillRank?: number
  skillPower?: number
  accent: string
  portrait: string
  portraitPath?: string
}

export interface StrategyState {
  section: Section
  faction: Faction
  factionConfirmed: boolean
  honor: number
  silver: number
  gold: number
  manuals: number
  generals: General[]
  formation: string[]
  lastRecruit: General | null
  lastNotice: string
  wins: number
  battleScore: number
  resources: Resources
  cities: City[]
  selectedCityId: string
  research: ResearchNode[]
  lastConquest: { cityId: string; cityName: string; captured: boolean; damage: number } | null
  luoyangBoxes: number
  lastLuoyangReward?: number
  luoyangRewardWeekKey?: string
  lastIncomeCollectedAt?: number
  lastConquestAt?: number
  lastDefenseAt?: number
  lastFactionBattleAt?: number
  factionWarScore: number
  equipmentInventory: Equipment[]
  equipmentLoadouts: Record<string, Partial<Record<EquipmentType, string>>>
  selectedEquipmentGeneralId: string
  lastEquipmentDraw: Equipment[]
  mythicFragments: number
  /** 낙양 강화석: 주간 낙양전 승리 진영 유저에게 주 1개. 신화장비 강화는 이것으로만(1개 = 1회) */
  mythicStones: number
  duelAttemptsToday: number
  duelDayKey: string
  prelaunchGoldDayKey: string
  scenarioCleared: string[]
}

export const INCOME_COOLDOWN_MS = 24 * 60 * 60 * 1000
export const CONQUEST_COOLDOWN_MS = 8 * 1000
export const DEFENSE_COOLDOWN_MS = 10 * 1000
export const FACTION_BATTLE_COOLDOWN_MS = 12 * 1000
export const DUEL_DAILY_LIMIT = 5
export const MYTHIC_FRAGMENT_COST = 20

export interface GoldPackage {
  id: string
  name: string
  gold: number
  priceKRW: number
  description: string
}

export interface ResourceShopPackage {
  id: string
  name: string
  resource: ResourceKey
  amount: number
  goldCost: number
  description: string
}

export interface HonorShopPackage {
  id: string
  name: string
  honor: number
  goldCost: number
  description: string
}

export const GOLD_PACKAGES: GoldPackage[] = [3, 10, 20, 50, 100].map(gold => ({
  id: `gold-${gold}`,
  name: `금화 ${gold}개 충전`,
  gold,
  priceKRW: gold * 1500,
  description: '금화 1개당 1,500원 기준 충전 패키지',
}))

const RESOURCE_PACKAGE_AMOUNTS: Record<ResourceKey, [number, number, number, number, number]> = {
  grain: [5000, 18000, 40000, 110000, 250000],
  silver: [3500, 12000, 28000, 80000, 180000],
  wood: [2500, 9000, 21000, 60000, 140000],
  iron: [1200, 4500, 10000, 30000, 70000],
  influence: [600, 2200, 5000, 15000, 36000],
}

export const RESOURCE_SHOP_PACKAGES: ResourceShopPackage[] = (Object.entries(RESOURCE_PACKAGE_AMOUNTS) as Array<[ResourceKey, [number, number, number, number, number]]>).flatMap(([resource, amounts]) => [3, 10, 20, 50, 100].map((goldCost, index) => ({
  id: `resource-${resource}-${goldCost}`,
  name: `${resource} ${goldCost}금화 패키지`,
  resource,
  amount: amounts[index],
  goldCost,
  description: '금화로 교환하는 자원 보급 패키지',
})))

export const HONOR_SHOP_PACKAGES: HonorShopPackage[] = [3, 5, 10, 20, 50, 100].map(goldCost => ({
  id: `honor-${goldCost}`,
  name: `명망 ${goldCost}금화 패키지`,
  honor: goldCost * 100,
  goldCost,
  description: '금화 1개당 명망 100개로 교환하는 패키지',
}))

export function dayKey(now = Date.now()): string {
  const date = new Date(now)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const PRELAUNCH_DAILY_GOLD = 100
export const PRELAUNCH_GOLD_ENABLED = true
// 정식 출시 지시를 받으면 이 값을 true로 전환한다.
export const GOLD_PURCHASE_ENABLED = false

export function ensurePrelaunchDailyGold(state: StrategyState, now = Date.now()): boolean {
  if (typeof state.gold !== 'number' || !Number.isFinite(state.gold)) state.gold = 0
  if (typeof state.prelaunchGoldDayKey !== 'string') state.prelaunchGoldDayKey = ''
  const today = dayKey(now)
  if (!PRELAUNCH_GOLD_ENABLED || state.prelaunchGoldDayKey === today) return false
  state.gold += PRELAUNCH_DAILY_GOLD
  state.prelaunchGoldDayKey = today
  state.lastNotice = `정식 출시 전 매일 금화 ${PRELAUNCH_DAILY_GOLD}개를 지급했습니다.`
  return true
}

export function ensureDuelDailyState(state: StrategyState, now = Date.now()): void {
  const today = dayKey(now)
  if (state.duelDayKey !== today) {
    state.duelDayKey = today
    state.duelAttemptsToday = 0
  }
  state.duelAttemptsToday = Math.max(0, Math.min(DUEL_DAILY_LIMIT, Math.trunc(state.duelAttemptsToday || 0)))
}

export function duelAttemptsRemaining(state: StrategyState, now = Date.now()): number {
  ensureDuelDailyState(state, now)
  return Math.max(0, DUEL_DAILY_LIMIT - state.duelAttemptsToday)
}

export function consumeDuelAttempt(state: StrategyState, now = Date.now()): UpgradeResult {
  ensureDuelDailyState(state, now)
  if (state.duelAttemptsToday >= DUEL_DAILY_LIMIT) return { ok: false, message: '오늘 유저 대련 가능 횟수를 모두 사용했습니다. 내일 다시 도전하십시오.' }
  state.duelAttemptsToday += 1
  return { ok: true, message: `오늘 유저 대련 ${DUEL_DAILY_LIMIT - state.duelAttemptsToday}회 남음` }
}

export function cooldownRemaining(lastAt: number | undefined, cooldownMs: number, now = Date.now()): number {
  return lastAt === undefined ? 0 : Math.max(0, cooldownMs - (now - lastAt))
}

export function incomeCooldownRemaining(state: StrategyState, now = Date.now()): number {
  return cooldownRemaining(state.lastIncomeCollectedAt, INCOME_COOLDOWN_MS * (1 - researchMods(state).incomeCooldown), now)
}

export function conquestCooldownRemaining(state: StrategyState, now = Date.now()): number {
  return cooldownRemaining(state.lastConquestAt, CONQUEST_COOLDOWN_MS * (1 - researchMods(state).siegeCooldown), now)
}

export function defenseCooldownRemaining(state: StrategyState, now = Date.now()): number {
  return cooldownRemaining(state.lastDefenseAt, DEFENSE_COOLDOWN_MS, now)
}

export function factionBattleCooldownRemaining(state: StrategyState, now = Date.now()): number {
  return cooldownRemaining(state.lastFactionBattleAt, FACTION_BATTLE_COOLDOWN_MS, now)
}

export const GRADE_META: Record<Grade, { label: string; color: string; rate: string }> = {
  5: { label: '천명', color: '#f6c56d', rate: '2%' },
  4: { label: '명장', color: '#52e0c4', rate: '8%' },
  3: { label: '정예', color: '#8da9ff', rate: '20%' },
  2: { label: '용사', color: '#c59bf5', rate: '35%' },
  1: { label: '신병', color: '#a9b1b8', rate: '35%' },
}

// 등급 자체가 전투력과 스킬 성능에 반영되는 공통 보정입니다.
// 같은 레벨·성급·능력치라면 항상 5등급 > 4등급 > 3등급 순서가 됩니다.
export const GRADE_POWER_MULTIPLIER: Record<Grade, number> = {
  1: 0.82,
  2: 0.91,
  3: 1,
  4: 1.12,
  5: 1.28,
}

const BUILDING_LIBRARY: Omit<CityBuilding, 'level'>[] = [
  { id: 'farm', name: '둔전 농장', kind: 'agriculture', maxLevel: 5, description: '식량 생산량과 도시의 민생을 높입니다.' },
  { id: 'market', name: '교역 시장', kind: 'commerce', maxLevel: 5, description: '은전과 영향력 수입을 늘립니다.' },
  { id: 'barracks', name: '정예 병영', kind: 'barracks', maxLevel: 5, description: '도시 방어도와 출정 준비를 강화합니다.' },
  { id: 'workshop', name: '병기 공방', kind: 'workshop', maxLevel: 5, description: '목재와 철 생산을 확보합니다.' },
  { id: 'academy', name: '태학 서원', kind: 'academy', maxLevel: 5, description: '연구 영향력과 병서 수급을 높입니다.' },
]

function createBuildings(level = 1): CityBuilding[] {
  return BUILDING_LIBRARY.map(building => ({ ...building, level }))
}

export function createCities(): City[] {
  return [
    { id: 'chengdu', name: '성도', chineseName: '成都', region: '익주 중심', owner: '촉한', level: 3, prosperity: 82, defense: 74, buildings: createBuildings(2) },
    { id: 'hanzhong', name: '한중', chineseName: '漢中', region: '검각 북문', owner: '중립', level: 2, prosperity: 64, defense: 86, buildings: createBuildings(1) },
    { id: 'xiangyang', name: '양양', chineseName: '襄陽', region: '형주 중앙 인공지능 수도', owner: '중립', level: 4, prosperity: 78, defense: 90, buildings: createBuildings(3) },
    { id: 'jianye', name: '건업', chineseName: '建業', region: '강동 수운', owner: '오나라', level: 3, prosperity: 76, defense: 70, buildings: createBuildings(2) },
    { id: 'xuchang', name: '허창', chineseName: '許昌', region: '중원 관문', owner: '중립', level: 3, prosperity: 79, defense: 81, buildings: createBuildings(2) },
    { id: 'luoyang', name: '낙양', chineseName: '洛陽', region: '황하 수도권', owner: '중립', level: 5, prosperity: 94, defense: 100, buildings: createBuildings(5) },
    { id: 'ye', name: '업', chineseName: '鄴', region: '기주 북부', owner: '위나라', level: 4, prosperity: 84, defense: 86, buildings: createBuildings(3) },
    { id: 'chenliu', name: '진류', chineseName: '陳留', region: '연주 평원', owner: '중립', level: 2, prosperity: 61, defense: 57, buildings: createBuildings(1) },
    { id: 'puyang', name: '복양', chineseName: '濮陽', region: '연주 동문', owner: '중립', level: 2, prosperity: 58, defense: 64, buildings: createBuildings(1) },
    { id: 'wancheng', name: '완성', chineseName: '宛城', region: '남양 요충', owner: '중립', level: 2, prosperity: 67, defense: 70, buildings: createBuildings(1) },
    { id: 'jiangling', name: '강릉', chineseName: '江陵', region: '형주 수운', owner: '중립', level: 3, prosperity: 73, defense: 76, buildings: createBuildings(2) },
    { id: 'yiling', name: '이릉', chineseName: '夷陵', region: '삼협 관문', owner: '중립', level: 2, prosperity: 55, defense: 68, buildings: createBuildings(1) },
    { id: 'changsha', name: '장사', chineseName: '長沙', region: '형남 동부', owner: '중립', level: 3, prosperity: 71, defense: 63, buildings: createBuildings(2) },
    { id: 'lingling', name: '영릉', chineseName: '零陵', region: '형남 남부', owner: '중립', level: 1, prosperity: 49, defense: 46, buildings: createBuildings(1) },
    { id: 'guiyang', name: '계양', chineseName: '桂陽', region: '남령 북쪽', owner: '중립', level: 1, prosperity: 45, defense: 52, buildings: createBuildings(1) },
    { id: 'wujun', name: '오군', chineseName: '吳郡', region: '강동 동부', owner: '중립', level: 3, prosperity: 78, defense: 73, buildings: createBuildings(2) },
    { id: 'kuaiji', name: '회계', chineseName: '會稽', region: '동남 해안', owner: '중립', level: 2, prosperity: 69, defense: 66, buildings: createBuildings(1) },
    { id: 'poyang', name: '파양', chineseName: '鄱陽', region: '강동 호수길', owner: '중립', level: 2, prosperity: 62, defense: 59, buildings: createBuildings(1) },
    { id: 'hefei', name: '합비', chineseName: '合肥', region: '회남 전선', owner: '중립', level: 3, prosperity: 64, defense: 88, buildings: createBuildings(2) },
    { id: 'shouchun', name: '수춘', chineseName: '壽春', region: '회남 중심', owner: '중립', level: 3, prosperity: 68, defense: 79, buildings: createBuildings(2) },
    { id: 'jiujiang', name: '시상', chineseName: '柴桑', region: '장강 수운 · 오의 거점', owner: '중립', level: 2, prosperity: 57, defense: 55, buildings: createBuildings(1) },
    { id: 'tianshui', name: '천수', chineseName: '天水', region: '농서 동문', owner: '중립', level: 2, prosperity: 53, defense: 71, buildings: createBuildings(1) },
    { id: 'wuwei', name: '무위', chineseName: '武威', region: '하서 회랑', owner: '중립', level: 1, prosperity: 42, defense: 61, buildings: createBuildings(1) },
    { id: 'fucheng', name: '부성', chineseName: '涪城', region: '익주 북방', owner: '중립', level: 2, prosperity: 51, defense: 58, buildings: createBuildings(1) },
    { id: 'xindu', name: '신도', chineseName: '新都', region: '익주 동북', owner: '중립', level: 1, prosperity: 47, defense: 49, buildings: createBuildings(1) },
    { id: 'changan', name: '장안', chineseName: '長安', region: '관중 중심', owner: '중립', level: 4, prosperity: 86, defense: 88, buildings: createBuildings(3) },
    { id: 'meixian', name: '미현', chineseName: '郿縣', region: '관중 서부', owner: '중립', level: 2, prosperity: 55, defense: 64, buildings: createBuildings(1) },
    { id: 'anding', name: '안정', chineseName: '安定', region: '농서 북부', owner: '중립', level: 2, prosperity: 48, defense: 62, buildings: createBuildings(1) },
    { id: 'jinyang', name: '진양', chineseName: '晉陽', region: '병주 중심', owner: '중립', level: 3, prosperity: 63, defense: 75, buildings: createBuildings(2) },
    { id: 'pingyuan', name: '평원', chineseName: '平原', region: '청주 서부', owner: '중립', level: 2, prosperity: 59, defense: 58, buildings: createBuildings(1) },
    { id: 'beihai', name: '북해', chineseName: '北海', region: '청주 동부', owner: '중립', level: 2, prosperity: 61, defense: 60, buildings: createBuildings(1) },
    { id: 'langya', name: '낭야', chineseName: '琅邪', region: '서주 동부', owner: '중립', level: 2, prosperity: 57, defense: 63, buildings: createBuildings(1) },
    { id: 'xiapi', name: '하비', chineseName: '下邳', region: '서주 중심', owner: '중립', level: 3, prosperity: 70, defense: 72, buildings: createBuildings(2) },
    { id: 'guangling', name: '광릉', chineseName: '廣陵', region: '회남 동부', owner: '중립', level: 2, prosperity: 65, defense: 61, buildings: createBuildings(1) },
    { id: 'lujiang', name: '여강', chineseName: '廬江', region: '강동 서북', owner: '중립', level: 2, prosperity: 60, defense: 66, buildings: createBuildings(1) },
    { id: 'shangyong', name: '상용', chineseName: '上庸', region: '한중 동남', owner: '중립', level: 2, prosperity: 52, defense: 70, buildings: createBuildings(1) },
    { id: 'xinye', name: '신야', chineseName: '新野', region: '남양 남부', owner: '중립', level: 2, prosperity: 58, defense: 59, buildings: createBuildings(1) },
    { id: 'jiangxia', name: '강하', chineseName: '江夏', region: '형주 동부', owner: '중립', level: 2, prosperity: 64, defense: 65, buildings: createBuildings(1) },
    { id: 'wuling', name: '무릉', chineseName: '武陵', region: '형남 서부', owner: '중립', level: 1, prosperity: 46, defense: 50, buildings: createBuildings(1) },
    { id: 'badong', name: '파동', chineseName: '巴東', region: '삼협 서부', owner: '중립', level: 2, prosperity: 50, defense: 67, buildings: createBuildings(1) },
    { id: 'jianning', name: '건녕', chineseName: '建寧', region: '익주 남부', owner: '중립', level: 1, prosperity: 42, defense: 54, buildings: createBuildings(1) },
    { id: 'yunnan', name: '운남', chineseName: '雲南', region: '익주 남서', owner: '중립', level: 1, prosperity: 39, defense: 52, buildings: createBuildings(1) },
    { id: 'jiaozhi', name: '교지', chineseName: '交趾', region: '남방 해안', owner: '중립', level: 1, prosperity: 44, defense: 48, buildings: createBuildings(1) },
    { id: 'shixing', name: '시흥', chineseName: '始興', region: '영남 북부', owner: '중립', level: 1, prosperity: 41, defense: 47, buildings: createBuildings(1) },
    { id: 'nanhai', name: '남해', chineseName: '南海', region: '영남 남부', owner: '중립', level: 1, prosperity: 43, defense: 45, buildings: createBuildings(1) },
  // 약화 디버프는 공성 피해의 최저선이지 시작 방어도가 아니다.
  // 도시는 최대 방어도로 시작하고, 공격을 받을 때만 10% 하한까지 내려간다.
  ].map(city => ({ ...city, defense: cityDefenseForLevel(city.level) })) as City[]
}

export function ensureCityRoster(state: StrategyState): void {
  const template = new Map(createCities().map(city => [city.id, city]))
  // 저장된 도시도 이름·한자·지역 설명은 최신 정의를 따른다(예: 구강 九江 → 시상 柴桑 지명 정정).
  state.cities.forEach(city => {
    const latest = template.get(city.id)
    if (latest) { city.name = latest.name; city.chineseName = latest.chineseName; city.region = latest.region }
  })
  const existing = new Set(state.cities.map(city => city.id))
  const fresh = [...template.values()].filter(city => !existing.has(city.id))
  state.cities.push(...fresh)
}
function dummyDefenseLevel(city: City): number {
  return dummyGarrisonLevelForCityLevel(city.level)
}
export function createDummyCityGarrisons(city: City): CityGarrison[] {
  const targetLevel = dummyDefenseLevel(city)
  const generals = allGenerals().sort((left, right) => right.grade - left.grade).slice(0, 9)
  return Array.from({ length: 3 }, (_, index) => {
    const squad = generals.slice(index * 3, index * 3 + 3)
    const power = squad.reduce((total, general) => total + combatPower({ ...general, level: targetLevel, stars: 1 }), 0)
    return {
      id: `dummy-${city.id}-${index + 1}`,
      generalIds: squad.map(general => general.id),
      averageLevel: targetLevel,
      power,
      source: 'dummy',
      label: `인공지능 더미 수비대 ${index + 1}`,
    }
  })
}
export function ensureCityGarrisons(state: StrategyState): void {
  state.cities.forEach(city => {
    if (!Array.isArray(city.garrisons)) city.garrisons = city.owner === '중립' ? createDummyCityGarrisons(city) : []
    city.garrisons = city.garrisons.slice(0, MAX_CITY_GARRISONS)
    city.defendersDefeated = Math.max(0, Math.min(city.garrisons.length, Math.trunc(city.defendersDefeated ?? 0)))
    // 구버전 저장 데이터가 약화 하한에서 시작하던 경우만 새 시즌 초기값으로 복구한다.
    // 이미 공성 진전이 있는 도시는 현재 진행도를 보존한다.
    const legacyWeakeningFloor = Math.ceil(cityWallCapacity(city) * TERRITORY_TEST_WEAKENING_RATIO)
    if (city.defense === legacyWeakeningFloor && (city.conquestProgress ?? 0) === 0) city.defense = cityWallCapacity(city)
    if (!Array.isArray(city.battleLogs)) city.battleLogs = []
    city.battleLogs = city.battleLogs.filter(log => log && typeof log.timestamp === 'number').slice(-30)
  })
}
function addCityBattleLog(city: City, log: Omit<CityBattleLog, 'id'>): void {
  city.battleLogs ??= []
  city.battleLogs.push({ ...log, id: `${city.id}-battle-${log.timestamp}-${city.battleLogs.length}` })
  city.battleLogs = city.battleLogs.slice(-30)
}
function defenseLineForCity(city: City): CityGarrison[] {
  return Array.isArray(city.garrisons) && city.garrisons.length ? city.garrisons : createDummyCityGarrisons(city)
}
export interface CityGarrisonResult { ok: boolean; message: string; count: number }
export function deployCityGarrison(state: StrategyState, cityId: string): CityGarrisonResult {
  const city = findCity(state, cityId)
  if (!city) return { ok: false, message: '해당 도시를 찾을 수 없습니다.', count: 0 }
  if (city.owner !== state.faction) return { ok: false, message: '아군 도시에서만 자신의 덱을 수비병으로 세울 수 있습니다.', count: city.garrisons?.length ?? 0 }
  ensureCityGarrisons(state)
  if ((city.garrisons?.length ?? 0) >= MAX_CITY_GARRISONS) return { ok: false, message: `수비병은 한 도시에 최대 ${MAX_CITY_GARRISONS}부대까지 세울 수 있습니다.`, count: MAX_CITY_GARRISONS }
  const generalIds = state.formation.slice(0, 3)
  if (!generalIds.length) return { ok: false, message: '먼저 출전 진형에 무장을 편성하십시오.', count: city.garrisons?.length ?? 0 }
  const generals = generalIds.map(id => findGeneral(state, id)).filter((general): general is General => Boolean(general))
  const power = Math.round(generals.reduce((total, general) => total + combatPower(general), 0) * (1 + researchMods(state).newGarrison))
  const averageLevel = Math.round(generals.reduce((total, general) => total + general.level, 0) / generals.length)
  city.garrisons ??= []
  city.garrisons.push({ id: `player-${city.id}-${Date.now()}-${city.garrisons.length}`, generalIds, averageLevel, power, source: 'player', label: `${state.faction} 수비 진형 ${city.garrisons.length + 1}` })
  city.defendersDefeated = 0
  state.lastNotice = `${city.name}에 현재 진형을 수비병으로 배치했습니다. (${city.garrisons.length}/${MAX_CITY_GARRISONS})`
  return { ok: true, message: state.lastNotice, count: city.garrisons.length }
}
export function normalizeInitialSeasonTerritories(state: StrategyState): boolean {
  const hasProgress = state.cities.some(city => typeof city.conquestProgress === 'number' && city.conquestProgress > 0)
  const hasLegacyFactionOwnership = state.cities.some(city => city.owner !== '중립' && city.id !== 'chengdu' && city.id !== 'ye' && city.id !== 'jianye')
  if (hasProgress || !hasLegacyFactionOwnership) return false
  let changed = false
  state.cities.forEach(city => {
    if (city.id === 'chengdu' || city.id === 'ye' || city.id === 'jianye') return
    if (city.owner !== '중립') {
      city.owner = '중립'
      city.conquestProgress = 0
      changed = true
    }
  })
  return changed
}
/** 저장된 연구를 새 30개 체계에 맞춘다(예전 연구 완료분은 자원 환급). 환급이 있으면 그 내역을 돌려준다. */
export function ensureResearchRoster(state: StrategyState): Partial<Record<ResourceKey, number>> | null {
  return normalizeResearch(state)
}

// Historical figures from the late Eastern Han and Three Kingdoms period.
// Epithets and skills are game descriptions, not claims about a canonical game adaptation.
const CORE_LIBRARY: General[] = [
  {
    id: 'guan-yu', name: '관우', epithet: '운장의 청룡언월도', role: '기병', grade: 5, stars: 1, level: 14,
    attack: 94, defense: 72, command: 90, leadership: 96, martial: 98, stratagem: 72, speed: 86, skillName: '오관참장', skillDescription: '전열을 가르며 적의 사기를 크게 낮춘다.', skillUnlocked: true, accent: '#52e0c4', portrait: '관', portraitPath: '/assets/generals/guan-yu.webp',
  },
  {
    id: 'zhao-yun', name: '조운', epithet: '상산의 상산 용기', role: '기병', grade: 5, stars: 1, level: 12,
    attack: 91, defense: 76, command: 87, leadership: 93, martial: 95, stratagem: 70, speed: 98, skillName: '장판 돌파', skillDescription: '위험한 측면을 돌파하고 아군 전열로 복귀한다.', skillUnlocked: true, accent: '#78d9d3', portrait: '조', portraitPath: '/assets/generals/zhao-yun.webp',
  },
  {
    id: 'zhuge-liang', name: '제갈량', epithet: '와룡의 출사표', role: '책사', grade: 5, stars: 1, level: 11,
    attack: 62, defense: 58, command: 99, leadership: 99, martial: 58, stratagem: 100, speed: 62, skillName: '팔진도', skillDescription: '아군 전체의 다음 전술 명령에 보정을 더한다.', skillUnlocked: true, accent: '#d0a5ff', portrait: '제', portraitPath: '/assets/generals/zhuge-liang.webp',
  },
  {
    id: 'lu-bu', name: '여포', epithet: '봉선의 방천화극', role: '기병', grade: 5, stars: 1, level: 1,
    attack: 100, defense: 63, command: 76, leadership: 76, martial: 100, stratagem: 42, speed: 90, skillName: '무쌍 돌격', skillDescription: '단일 적진에 압도적인 돌격을 가한다.', skillUnlocked: false, accent: '#ff8066', portrait: '여', portraitPath: '/assets/generals/lu-bu.webp',
  },
  {
    id: 'zhang-fei', name: '장비', epithet: '익덕의 장판교 포효', role: '보병', grade: 4, stars: 1, level: 8,
    attack: 89, defense: 79, command: 83, leadership: 83, martial: 94, stratagem: 48, speed: 58, skillName: '장판 포효', skillDescription: '적의 전열을 흔들고 중앙 돌파의 위력을 높인다.', skillUnlocked: false, accent: '#7bd6e8', portrait: '장',
  },
  {
    id: 'huang-zhong', name: '황충', epithet: '한승의 백발 명궁', role: '궁병', grade: 4, stars: 1, level: 8,
    attack: 88, defense: 51, command: 82, leadership: 82, martial: 90, stratagem: 68, speed: 64, skillName: '백발 연사', skillDescription: '가장 먼 적을 정확히 노려 연속 피해를 준다.', skillUnlocked: false, accent: '#f6c56d', portrait: '황',
  },
  {
    id: 'ma-chao', name: '마초', epithet: '맹기의 서량 철기', role: '기병', grade: 4, stars: 1, level: 1,
    attack: 93, defense: 59, command: 78, leadership: 78, martial: 95, stratagem: 55, speed: 94, skillName: '철기 쇄도', skillDescription: '측면 기동을 선택하면 공격력이 크게 오른다.', skillUnlocked: false, accent: '#e6a1ba', portrait: '마',
  },
  {
    id: 'zhou-yu', name: '주유', epithet: '공근의 적벽 화계', role: '책사', grade: 4, stars: 1, level: 1,
    attack: 69, defense: 55, command: 94, leadership: 94, martial: 70, stratagem: 98, speed: 72, skillName: '적벽 화공', skillDescription: '적 사기를 태워 전장의 흐름을 바꾼다.', skillUnlocked: false, accent: '#ff9c65', portrait: '주', portraitPath: '/assets/generals/zhou-yu.webp',
  },
  {
    id: 'simayi', name: '사마의', epithet: '중달의 기산 책략', role: '책사', grade: 5, stars: 1, level: 1,
    attack: 64, defense: 61, command: 96, leadership: 96, martial: 57, stratagem: 99, speed: 54, skillName: '천변 만기', skillDescription: '적의 다음 명령을 읽고 아군의 방어를 보강한다.', skillUnlocked: false, accent: '#b7b9ff', portrait: '사',
  },
  {
    id: 'xiahou-dun', name: '하후돈', epithet: '원양의 맹진', role: '보병', grade: 3, stars: 1, level: 1,
    attack: 76, defense: 78, command: 73, leadership: 73, martial: 80, stratagem: 52, speed: 56, skillName: '맹진 방진', skillDescription: '전열을 고정해 아군이 받는 피해를 줄인다.', skillUnlocked: false, accent: '#9bd4bc', portrait: '하',
  },
  {
    id: 'taishi-ci', name: '태사자', epithet: '자의의 신정 궁기', role: '궁병', grade: 3, stars: 1, level: 1,
    attack: 81, defense: 49, command: 75, leadership: 75, martial: 83, stratagem: 61, speed: 79, skillName: '신정 쌍궁', skillDescription: '거리를 유지할수록 궁병의 피해가 증가한다.', skillUnlocked: false, accent: '#8da9ff', portrait: '태',
  },
  {
    id: 'wei-yan', name: '위연', epithet: '문장의 자오곡 기습', role: '보병', grade: 3, stars: 1, level: 1,
    attack: 79, defense: 65, command: 70, leadership: 70, martial: 81, stratagem: 57, speed: 72, skillName: '자오곡 기습', skillDescription: '좌측 기동 후 적의 사기를 추가로 깎는다.', skillUnlocked: false, accent: '#a7d88f', portrait: '위',
  },
  {
    id: 'gao-shun', name: '고순', epithet: '함진영의 불퇴 전열', role: '보병', grade: 2, stars: 1, level: 1,
    attack: 63, defense: 76, command: 69, leadership: 69, martial: 64, stratagem: 48, speed: 44, skillName: '함진영', skillDescription: '짧은 시간 동안 방어선을 단단히 유지한다.', skillUnlocked: false, accent: '#c59bf5', portrait: '고',
  },
  {
    id: 'wen-ping', name: '문빙', epithet: '강하를 지킨 수문장', role: '궁병', grade: 2, stars: 1, level: 1,
    attack: 66, defense: 62, command: 68, leadership: 68, martial: 66, stratagem: 62, speed: 58, skillName: '강하 수비', skillDescription: '적의 중앙 돌파를 견제하고 아군을 보호한다.', skillUnlocked: false, accent: '#88c9e8', portrait: '문',
  },
  {
    id: 'song-xian', name: '송헌', epithet: '여포군의 전열 장수', role: '보병', grade: 1, stars: 1, level: 1,
    attack: 48, defense: 55, command: 49, leadership: 49, martial: 49, stratagem: 34, speed: 41, skillName: '기치 수호', skillDescription: '작전 초반 아군의 대열 붕괴를 늦춘다.', skillUnlocked: false, accent: '#a9b1b8', portrait: '송',
  },
]

type ExpansionSpec = [string, string, string, Role, Grade, string, string, string]

const EXPANSION_SPECS: ExpansionSpec[] = [
  ['liu-bei', '유비', '현덕의 인덕과 쌍검', '보병', 5, '인덕의 결집', '아군 전체의 사기를 끌어올리고 전열을 회복한다.', '유'],
  ['cao-cao', '조조', '맹덕의 천하 제패', '기병', 5, '위무의 질주', '적의 약한 측면을 포착해 전군의 공격력을 높인다.', '조'],
  ['sun-quan', '손권', '중모의 강동 수호', '궁병', 4, '강동의 결의', '아군 궁병의 사거리와 명중률을 강화한다.', '손'],
  ['sun-ce', '손책', '백부의 소패왕', '기병', 5, '소패왕 돌격', '중앙의 적을 밀어내고 기동 속도를 크게 높인다.', '손'],
  ['sun-jian', '손견', '문대의 옥새 선봉', '보병', 4, '강동 선봉', '첫 공격에 추가 피해를 더하고 적 사기를 낮춘다.', '손'],
  ['pang-tong', '방통', '사원의 봉추 연환', '책사', 4, '연환계', '적 부대를 묶어 다음 충격파 피해를 증폭한다.', '방'],
  ['xu-shu', '서서', '원직의 단기 유랑', '책사', 3, '단기묘책', '좌우 기동 명령의 재사용 대기시간을 줄인다.', '서'],
  ['fa-zheng', '법정', '효직의 한중 책략', '책사', 4, '한중 반격', '방어 중인 아군이 받는 피해를 반격으로 전환한다.', '법'],
  ['meng-huo', '맹획', '남만왕의 칠종칠금', '보병', 3, '칠종칠금', '쓰러지지 않는 전열을 만들고 방어력을 높인다.', '맹'],
  ['zhu-rong', '축융', '남만의 비도 여왕', '궁병', 3, '비도 화염', '적 후방에 불꽃을 남겨 지속 피해를 입힌다.', '축'],
  ['huang-gai', '황개', '공복의 고육지계', '보병', 4, '고육지계', '자신을 희생해 적 진형에 큰 사기 피해를 준다.', '황'],
  ['gan-ning', '감녕', '흥패의 백기 수적', '기병', 4, '백기 야습', '전투 초반 적의 시야를 흔들고 측면을 급습한다.', '감'],
  ['ling-tong', '능통', '공적의 강동 맹장', '보병', 3, '필사의 연격', '연속 명령 시 두 번째 공격의 위력이 상승한다.', '능'],
  ['lu-su', '노숙', '자경의 동맹 책략', '책사', 4, '강동 동맹', '아군의 명령 자원을 보존하고 사기를 안정시킨다.', '노'],
  ['lu-meng', '여몽', '자명의 백의 도독', '보병', 4, '백의 도하', '적이 방심한 순간 방어선을 뚫고 점령한다.', '여'],
  ['lu-xun', '육손', '백언의 이릉 화진', '책사', 5, '이릉 화진', '넓은 범위에 화염을 일으켜 적 사기를 태운다.', '육'],
  ['zhang-liao', '장료', '문원의 합비 질풍', '기병', 5, '합비 질풍', '적 중앙에 돌입해 적의 공격 순서를 끊는다.', '장'],
  ['xu-chu', '허저', '중강의 호치 위력', '보병', 4, '호치 난무', '근접한 적에게 강력한 연속 타격을 가한다.', '허'],
  ['dian-wei', '전위', '악래의 쌍극 수호', '보병', 4, '쌍극 수호', '지정한 장수를 지키며 피해를 대신 받는다.', '전'],
  ['cao-ren', '조인', '자효의 번성 철벽', '보병', 4, '번성 철벽', '거점을 지키는 동안 방어력이 크게 오른다.', '조'],
  ['cao-hong', '조홍', '자렴의 급행 원군', '기병', 3, '급행 원군', '위험한 아군에게 빠르게 합류해 전열을 보충한다.', '조'],
  ['guo-jia', '곽가', '봉효의 십승십패', '책사', 5, '십승십패', '적의 약점을 간파해 스킬 피해를 극대화한다.', '곽'],
  ['xun-yu', '순욱', '문약의 왕좌 보좌', '책사', 4, '왕좌의 보좌', '아군 지휘력과 사기를 동시에 높인다.', '순'],
  ['xun-you', '순유', '공달의 기묘한 계책', '책사', 3, '기묘한 계책', '다음 전술 명령을 한 번 더 사용할 기회를 만든다.', '순'],
  ['jia-xu', '가후', '문화의 독계', '책사', 5, '독계', '적의 분노를 역이용해 스스로 무너지게 한다.', '가'],
  ['cheng-yu', '정욱', '중덕의 태산 책략', '보병', 3, '태산 책략', '전열이 밀리지 않도록 지휘 방어를 강화한다.', '정'],
  ['pang-de', '방덕', '영명의 관문 백마', '기병', 4, '백마 관문', '적 기병의 돌격을 정면에서 받아친다.', '방'],
  ['xu-huang', '서황', '공명의 양양 대승', '보병', 4, '양양 대승', '적의 보급선을 끊어 시간이 지날수록 강해진다.', '서'],
  ['yue-jin', '악진', '문겸의 선등 돌파', '보병', 3, '선등 돌파', '가장 먼저 진입해 아군의 첫 명령을 강화한다.', '악'],
  ['li-dian', '이전', '만성의 학문 장수', '궁병', 3, '학문 진형', '아군 진형의 빈틈을 메워 모든 능력치를 보정한다.', '이'],
  ['yu-jin', '우금', '문칙의 군율 철벽', '보병', 3, '군율 철벽', '부대의 사기가 낮아질수록 방어력이 증가한다.', '우'],
  ['zhang-he', '장합', '준예의 유연한 기동', '기병', 4, '유연한 기동', '적의 명령을 읽고 반대 측면으로 재배치한다.', '장'],
  ['wen-chou', '문추', '문대의 하북 맹돌', '기병', 3, '하북 맹돌', '전방의 적에게 직선 돌격으로 큰 피해를 준다.', '문'],
  ['yan-liang', '안량', '문추와 나란한 선봉', '기병', 3, '선봉 참격', '적 지휘관을 우선 공격해 사기를 크게 흔든다.', '안'],
  ['yuan-shao', '원소', '본초의 사세삼공', '궁병', 4, '사세삼공', '대규모 원군을 불러 전장의 수적 우세를 만든다.', '원'],
  ['yuan-shu', '원술', '공로의 중원 야심', '책사', 2, '중원 야심', '자원을 소모해 단기간에 전투력을 끌어올린다.', '원'],
  ['gongsun-zan', '공손찬', '백마의 의종', '기병', 3, '백마의종', '기병 부대의 이동과 측면 공격을 강화한다.', '공'],
  ['chen-gong', '진궁', '공대의 여포 모사', '책사', 3, '계중계', '적이 준비한 전술을 역으로 이용한다.', '진'],
  ['zhang-lu', '장로', '오두미도의 군량', '책사', 2, '군량 비축', '전투가 길어질수록 아군의 사기를 회복한다.', '장'],
  ['ma-teng', '마등', '수성의 서량 철기', '기병', 3, '서량 철기', '기병의 돌격력과 이동 속도를 높인다.', '마'],
  ['han-sui', '한수', '문약의 서량 노장', '보병', 2, '서량 연합', '인접한 장수들의 방어를 함께 보강한다.', '한'],
  ['wang-ping', '왕평', '자균의 한중 수비', '궁병', 3, '한중 수비', '고지에서 적의 돌파를 정확히 저격한다.', '왕'],
  ['guan-ping', '관평', '관문의 청룡 계승', '기병', 3, '청룡 계승', '아군 선봉 장수와 연계해 추가 피해를 준다.', '관'],
  ['guan-xing', '관흥', '안국의 춘추 계승', '기병', 3, '춘추 계승', '쓰러진 적이 많을수록 공격력이 상승한다.', '관'],
  ['zhang-bao', '장포', '중진의 장판 유산', '보병', 3, '장판 유산', '보병 진형의 충격 저항을 높인다.', '장'],
  ['ma-dai', '마대', '금성의 서량 추격', '기병', 2, '서량 추격', '후퇴하는 적에게 추가 피해를 입힌다.', '마'],
  ['dong-zhuo', '동탁', '중영의 폭정 철기', '보병', 4, '폭정의 압박', '적의 사기를 짓누르지만 아군 속도는 낮아진다.', '동'],
  ['diao-chan', '초선', '폐월의 연환 미혹', '책사', 4, '연환 미혹', '적 지휘관을 혼란시켜 다음 행동을 지연한다.', '초'],
  ['cai-wenji', '채문희', '문희의 호가 귀환', '책사', 2, '호가 귀환', '전투 기록을 되살려 아군 사기를 회복한다.', '채'],
  ['da-qiao', '대교', '강동의 옥련', '궁병', 3, '옥련의 가호', '아군 장수의 스킬 재사용 대기시간을 줄인다.', '대'],
  // 황건적 (donto333/1에서 가져옴: 이름·등급·병종·초상화가 같다)
  ['zhang-jiao', '장각', '천공장군의 황천 개벽', '책사', 5, '태평요술', '', '각'],
  ['zhang-bo', '장보', '지공장군의 부적 계략', '책사', 4, '부적 계략', '', '보'],
  ['zhang-liang', '장량', '인공장군의 황건 선봉', '보병', 4, '황건 선봉', '', '량'],
  ['guan-hai', '관해', '황건의 백파 맹장', '보병', 3, '백파 격돌', '', '관'],
  ['zhou-cang', '주창', '황건을 거친 충직한 장수', '기병', 3, '황건 추격', '', '주'],
]

function makeExpansionGeneral([id, name, epithet, role, grade, skillName, skillDescription, portrait]: ExpansionSpec): General {
  const base = ({ 1: 42, 2: 50, 3: 60, 4: 72, 5: 84 } as Record<Grade, number>)[grade]
  const roleBonus = ({ 기병: [8, -2, -6, 12], 궁병: [2, -4, 4, 8], 책사: [-6, -2, 14, -4], 보병: [2, 10, -2, -6] } as Record<Role, [number, number, number, number]>)[role]
  return {
    id, name, epithet, role, grade, stars: 1, level: 1,
    attack: base + roleBonus[0], defense: base + roleBonus[1], command: base + 2,
    leadership: base + 4, martial: base + roleBonus[0], stratagem: base + roleBonus[2], speed: base + roleBonus[3],
    skillName, skillDescription, skillUnlocked: false, skillRank: 1, skillPower: 100, accent: GRADE_META[grade].color, portrait,
  }
}

const EXPANSION_GENERALS = EXPANSION_SPECS.map(makeExpansionGeneral)
// 스킬 이름·설명은 skills.ts(스킬 재구성안)가 단일 원본이다.
const withSkillText = (general: General): General => {
  const def = GENERAL_SKILLS[general.id]
  return def ? { ...general, skillName: def.active.name, skillDescription: def.active.desc } : general
}
const LIBRARY: General[] = [...CORE_LIBRARY, ...EXPANSION_GENERALS].map(withSkillText)

/** 도감(Lv1) 원형. 성장 전 능력치가 필요한 스킬 공식에서 쓴다. */
export function templateGeneral(id: string): General | undefined {
  const found = LIBRARY.find(general => general.id === id)
  return found ? { ...found } : undefined
}

/** 적 무장 성장: 아군 강화·성급 상승과 같은 공식으로 능력치를 올린다. */
export function scaleGeneral(general: General, level: number, stars: number): General {
  const scaled = { ...general }
  const targetStars = Math.max(1, Math.min(5, Math.trunc(stars)))
  const targetLevel = Math.max(1, Math.trunc(level))
  for (let star = scaled.stars + 1; star <= targetStars; star += 1) {
    scaled.attack += 4 + star; scaled.defense += 3 + Math.floor(star / 2); scaled.command += 3 + Math.floor(star / 2)
    scaled.leadership += 3 + star; scaled.martial += 4 + star; scaled.stratagem += 2 + Math.floor(star / 2); scaled.speed += 2 + Math.floor(star / 2)
  }
  scaled.stars = Math.max(scaled.stars, targetStars)
  scaled.skillRank = scaled.stars
  for (let next = scaled.level + 1; next <= targetLevel; next += 1) {
    scaled.attack += 6 + scaled.stars; scaled.defense += 4 + Math.floor(scaled.stars / 2); scaled.command += 3; scaled.leadership += 3
    scaled.martial += 6 + scaled.stars; scaled.stratagem += 2; scaled.speed += 2
  }
  scaled.level = Math.max(scaled.level, targetLevel)
  scaled.skillUnlocked = scaled.level >= skillUnlockLevel(scaled)
  return scaled
}

/** 저장된 무장의 스킬 이름·설명을 현재 정의에 맞춘다(각성 이름 포함). */
export function syncGeneralSkills(state: StrategyState): void {
  state.generals.forEach(general => {
    const def = GENERAL_SKILLS[general.id]
    if (!def) return
    general.skillName = activeSkillName(general)
    general.skillDescription = isAwakened(general) && def.awaken ? `${def.active.desc} · 각성: ${def.awaken.desc}` : def.active.desc
  })
}

function copyGeneral(general: General): General {
  return { ...general }
}

function randomStarterGenerals(count = 3): General[] {
  const pool = LIBRARY.filter(general => general.grade === 3).map(copyGeneral)
  const selected: General[] = []
  while (selected.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length)
    const [general] = pool.splice(index, 1)
    if (general) selected.push({ ...general, level: 1, stars: 1, skillUnlocked: false, skillRank: 1, skillPower: 100 })
  }
  return selected
}

export function migrateLegacyStarterRoster(state: StrategyState): boolean {
  const legacyLevels: Record<string, number> = { 'guan-yu': 14, 'zhao-yun': 12, 'zhuge-liang': 11 }
  const legacyIds = Object.keys(legacyLevels)
  const isLegacyStarter = state.generals.length === 3
    && state.generals.every(general => legacyIds.includes(general.id) && general.grade === 5 && general.level === legacyLevels[general.id])
    && new Set(state.generals.map(general => general.id)).size === 3
    && state.formation.length === 3
    && new Set(state.formation).size === 3
    && state.formation.every(id => legacyIds.includes(id))
  if (!isLegacyStarter) return false
  const generals = randomStarterGenerals()
  const starterIds = generals.map(general => general.id)
  if (generals.length !== 3) return false
  state.generals = generals
  state.formation = starterIds
  state.equipmentLoadouts = {
    [starterIds[0]]: { weapon: 'starter-weapon' },
    [starterIds[1]]: { armor: 'starter-armor' },
    [starterIds[2]]: { accessory: 'starter-accessory' },
  }
  state.selectedEquipmentGeneralId = starterIds[0]
  state.lastNotice = '새로운 지휘관의 무장 3명을 무작위로 배치했습니다.'
  return true
}

export const EQUIPMENT_TYPE_META: Record<EquipmentType, { label: string; icon: string }> = {
  weapon: { label: '무기', icon: '⚔' },
  armor: { label: '갑옷', icon: '◈' },
  accessory: { label: '장신구', icon: '✦' },
}

export const EQUIPMENT_GRADE_META: Record<EquipmentGrade, { label: string; color: string; base: number; drawWeight: number }> = {
  normal: { label: '노멀', color: '#a9b1b8', base: 6, drawWeight: 55 },
  rare: { label: '레어', color: '#6eb8ff', base: 12, drawWeight: 28 },
  unique: { label: '유니크', color: '#c59bf5', base: 21, drawWeight: 12 },
  legendary: { label: '전설', color: '#f6c56d', base: 34, drawWeight: 5 },
  mythic: { label: '신화', color: '#ff8066', base: 52, drawWeight: 0 },
}

export const EQUIPMENT_SPECIALTIES: Record<EquipmentType, EquipmentSpecialty[]> = {
  weapon: ([
    ['bravery', '용맹', 'martial', 9, '무력 +9 · 공격 피해 보정'], ['tactics', '기책', 'stratagem', 9, '모략 +9 · 전술 피해 보정'], ['swift-strike', '신속', 'speed', 9, '속도 +9 · 선제 행동 보정'], ['rapid-assault', '속공', 'martial', 7, '무력 +7 · 연계 피해 보정'], ['change', '천변', 'stratagem', 7, '모략 +7 · 적 약화 보정'], ['guarding', '비호', 'leadership', 7, '통솔 +7 · 받는 피해 감소 보정'], ['clear-sight', '천안', 'speed', 7, '속도 +7 · 명중 보정'], ['exorcism', '모산', 'stratagem', 6, '모략 +6 · 상태 효과 보정'], ['siege', '포위', 'martial', 6, '무력 +6 · 방어 돌파 보정'], ['heaven-aid', '천우', 'leadership', 6, '통솔 +6 · 위기 대응 보정'],
  ] as Array<[string, string, EquipmentStat, number, string]>).map(([id, label, stat, value, description]) => ({ id: `weapon-${id}`, label, type: 'weapon' as const, stat: stat as EquipmentStat, value: value as number, description })),
  armor: ([
    ['bravery', '용맹', 'martial', 7, '무력 +7 · 반격 보정'], ['tactics', '기책', 'stratagem', 7, '모략 +7 · 상태 저항 보정'], ['swift-strike', '신속', 'speed', 7, '속도 +7 · 행동 순환 보정'], ['rapid-assault', '속공', 'speed', 6, '속도 +6 · 재사용 대기시간 보정'], ['change', '천변', 'stratagem', 9, '모략 +9 · 적 제어 저항 보정'], ['guarding', '비호', 'leadership', 10, '통솔 +10 · 방어 보정'], ['clear-sight', '천안', 'speed', 6, '속도 +6 · 회피 보정'], ['exorcism', '모산', 'stratagem', 6, '모략 +6 · 디버프 지속시간 감소'], ['siege', '포위', 'martial', 6, '무력 +6 · 포위 피해 저항'], ['heaven-aid', '천우', 'leadership', 8, '통솔 +8 · 위기 방어 보정'],
  ] as Array<[string, string, EquipmentStat, number, string]>).map(([id, label, stat, value, description]) => ({ id: `armor-${id}`, label, type: 'armor' as const, stat: stat as EquipmentStat, value: value as number, description })),
  accessory: ([
    ['bravery', '용맹', 'martial', 6, '무력 +6 · 기술 피해 보정'], ['tactics', '기책', 'stratagem', 10, '모략 +10 · 전술 게이지 보정'], ['swift-strike', '신속', 'speed', 8, '속도 +8 · 행동 순환 보정'], ['rapid-assault', '속공', 'speed', 7, '속도 +7 · 연계 유지 보정'], ['change', '천변', 'stratagem', 8, '모략 +8 · 적 약화 보정'], ['guarding', '비호', 'leadership', 6, '통솔 +6 · 아군 보호 보정'], ['clear-sight', '천안', 'speed', 10, '속도 +10 · 명중·치명 보정'], ['exorcism', '모산', 'stratagem', 8, '모략 +8 · 정화 효과 보정'], ['siege', '포위', 'martial', 8, '무력 +8 · 방어 돌파 보정'], ['heaven-aid', '천우', 'leadership', 8, '통솔 +8 · 회복 효과 보정'],
  ] as Array<[string, string, EquipmentStat, number, string]>).map(([id, label, stat, value, description]) => ({ id: `accessory-${id}`, label, type: 'accessory' as const, stat: stat as EquipmentStat, value: value as number, description })),
}

export function equipmentSpecialty(item: Equipment): EquipmentSpecialty | undefined {
  return item.specialty ? Object.values(EQUIPMENT_SPECIALTIES).flat().find(specialty => specialty.id === item.specialty) : undefined
}

function mythicSpecialty(type: EquipmentType, set: EquipmentSet): EquipmentSpecialtyId {
  const index = ({ command: 0, martial: 1, stratagem: 2, speed: 3 } as Record<EquipmentSet, number>)[set] * 2 + (type === 'weapon' ? 0 : type === 'armor' ? 1 : 2)
  return EQUIPMENT_SPECIALTIES[type][index % 10].id
}

export const EQUIPMENT_SET_META: Record<EquipmentSet, { label: string; stat: EquipmentStat; skillName: string; skillDescription: string; twoPiece: string; threePiece: string }> = {
  command: { label: '천군 세트', stat: 'leadership', skillName: '군령의 깃발', skillDescription: '통솔 기반 편성 전투력 보정', twoPiece: '통솔 +10', threePiece: '전투 시작 시 아군 방어 +8%' },
  martial: { label: '패왕 세트', stat: 'martial', skillName: '파천의 일격', skillDescription: '무력 기반 공격 효율 보정', twoPiece: '무력 +10', threePiece: '전투 시작 시 공격 피해 +8%' },
  stratagem: { label: '천책 세트', stat: 'stratagem', skillName: '귀모의 진', skillDescription: '모략 기반 전술 게이지 보정', twoPiece: '모략 +10', threePiece: '전술 게이지 충전 +12%' },
  speed: { label: '질풍 세트', stat: 'speed', skillName: '유성 보법', skillDescription: '속도 기반 행동 순환 보정', twoPiece: '속도 +10', threePiece: '행동 순환 속도 +8%' },
}

function starterEquipment(): Equipment[] {
  return [
    { id: 'starter-weapon', name: '청동 장검', type: 'weapon', set: 'martial', grade: 'normal', level: 1, mainStat: 'martial', baseValue: 6, skillName: '파천의 일격', skillDescription: '무력 기반 공격 효율 보정' },
    { id: 'starter-armor', name: '철린 갑주', type: 'armor', set: 'command', grade: 'normal', level: 1, mainStat: 'leadership', baseValue: 6, skillName: '군령의 깃발', skillDescription: '통솔 기반 편성 전투력 보정' },
    { id: 'starter-accessory', name: '옥패 부적', type: 'accessory', set: 'stratagem', grade: 'normal', level: 1, mainStat: 'stratagem', baseValue: 6, skillName: '귀모의 진', skillDescription: '모략 기반 전술 게이지 보정' },
  ]
}

export const MYTHIC_EVENT_EQUIPMENT: Equipment = {
  id: 'event-mythic-heavenblade', name: '천명·용천검', type: 'weapon', set: 'martial', grade: 'mythic', level: 1, mainStat: 'martial', baseValue: EQUIPMENT_GRADE_META.mythic.base, skillName: '용천 개벽', skillDescription: '이벤트 지급 전용 신화 무기 · 전투 개시 시 아군의 무력을 크게 끌어올립니다.', mythicEventOnly: true, specialty: mythicSpecialty('weapon', 'martial'),
}

export const MYTHIC_SHOP_EQUIPMENT: Equipment[] = [
  { id: 'shop-mythic-command-weapon', name: '신화·천군명검', type: 'weapon', set: 'command', grade: 'mythic', level: 1, mainStat: 'leadership', baseValue: 52, specialty: mythicSpecialty('weapon', 'command'), skillName: '천군의 칼날', skillDescription: '통솔 기반 지휘 효율을 크게 높입니다.' },
  { id: 'shop-mythic-command-armor', name: '신화·천군용갑', type: 'armor', set: 'command', grade: 'mythic', level: 1, mainStat: 'leadership', baseValue: 52, specialty: mythicSpecialty('armor', 'command'), skillName: '천군 철벽', skillDescription: '통솔 기반 방어 효율을 크게 높입니다.' },
  { id: 'shop-mythic-command-accessory', name: '신화·군령옥패', type: 'accessory', set: 'command', grade: 'mythic', level: 1, mainStat: 'leadership', baseValue: 52, specialty: mythicSpecialty('accessory', 'command'), skillName: '군령의 성좌', skillDescription: '통솔 기반 편성 보정을 크게 높입니다.' },
  { id: 'shop-mythic-martial-weapon', name: '신화·적룡천극', type: 'weapon', set: 'martial', grade: 'mythic', level: 1, mainStat: 'martial', baseValue: 52, specialty: mythicSpecialty('weapon', 'martial'), skillName: '적룡 파천', skillDescription: '무력 기반 공격 효율을 크게 높입니다.' },
  { id: 'shop-mythic-martial-armor', name: '신화·패왕철갑', type: 'armor', set: 'martial', grade: 'mythic', level: 1, mainStat: 'martial', baseValue: 52, specialty: mythicSpecialty('armor', 'martial'), skillName: '패왕 강체', skillDescription: '무력 기반 돌파력을 크게 높입니다.' },
  { id: 'shop-mythic-martial-accessory', name: '신화·무쌍호패', type: 'accessory', set: 'martial', grade: 'mythic', level: 1, mainStat: 'martial', baseValue: 52, specialty: mythicSpecialty('accessory', 'martial'), skillName: '무쌍의 혼', skillDescription: '무력 기반 연계 피해를 크게 높입니다.' },
  { id: 'shop-mythic-stratagem-weapon', name: '신화·천책선검', type: 'weapon', set: 'stratagem', grade: 'mythic', level: 1, mainStat: 'stratagem', baseValue: 52, specialty: mythicSpecialty('weapon', 'stratagem'), skillName: '천책 개문', skillDescription: '모략 기반 전술 효율을 크게 높입니다.' },
  { id: 'shop-mythic-stratagem-armor', name: '신화·귀모도포', type: 'armor', set: 'stratagem', grade: 'mythic', level: 1, mainStat: 'stratagem', baseValue: 52, specialty: mythicSpecialty('armor', 'stratagem'), skillName: '귀모 환영', skillDescription: '모략 기반 적 약화 효율을 크게 높입니다.' },
  { id: 'shop-mythic-stratagem-accessory', name: '신화·천책옥패', type: 'accessory', set: 'stratagem', grade: 'mythic', level: 1, mainStat: 'stratagem', baseValue: 52, specialty: mythicSpecialty('accessory', 'stratagem'), skillName: '천책 귀모', skillDescription: '모략 기반 전술 게이지를 크게 높입니다.' },
  { id: 'shop-mythic-speed-weapon', name: '신화·질풍유성창', type: 'weapon', set: 'speed', grade: 'mythic', level: 1, mainStat: 'speed', baseValue: 52, specialty: mythicSpecialty('weapon', 'speed'), skillName: '유성 관통', skillDescription: '속도 기반 선제 공격 효율을 크게 높입니다.' },
  { id: 'shop-mythic-speed-armor', name: '신화·질풍경갑', type: 'armor', set: 'speed', grade: 'mythic', level: 1, mainStat: 'speed', baseValue: 52, specialty: mythicSpecialty('armor', 'speed'), skillName: '질풍 보법', skillDescription: '속도 기반 행동 순환을 크게 높입니다.' },
  { id: 'shop-mythic-speed-accessory', name: '신화·유성환', type: 'accessory', set: 'speed', grade: 'mythic', level: 1, mainStat: 'speed', baseValue: 52, specialty: mythicSpecialty('accessory', 'speed'), skillName: '유성 잔상', skillDescription: '속도 기반 회피와 연계 효율을 크게 높입니다.' },
]

export function createInitialState(): StrategyState {
  const generals = randomStarterGenerals()
  const starterIds = generals.map(general => general.id)
  const equipmentInventory = starterEquipment()
  const equipmentLoadouts: StrategyState['equipmentLoadouts'] = {
    [starterIds[0]]: { weapon: 'starter-weapon' },
    [starterIds[1]]: { armor: 'starter-armor' },
    [starterIds[2]]: { accessory: 'starter-accessory' },
  }
  const state: StrategyState = {
    section: 'overview', faction: '촉한', factionConfirmed: false, honor: 2480, silver: 12500, gold: 0, manuals: 180, generals,
    formation: starterIds, lastRecruit: null, lastNotice: '전장에 오신 것을 환영합니다. 첫 진형을 준비하십시오.', wins: 7, battleScore: 18460,
    resources: { grain: 18200, silver: 12500, wood: 8200, iron: 3900, influence: 2480 },
    cities: createCities(), selectedCityId: 'chengdu', research: createResearch(), lastConquest: null, luoyangBoxes: 0, lastLuoyangReward: undefined, luoyangRewardWeekKey: undefined, lastIncomeCollectedAt: undefined, lastConquestAt: undefined, lastDefenseAt: undefined, lastFactionBattleAt: undefined, factionWarScore: 0,
    equipmentInventory, equipmentLoadouts, selectedEquipmentGeneralId: starterIds[0], lastEquipmentDraw: [], mythicFragments: 0, mythicStones: 0, duelAttemptsToday: 0, duelDayKey: dayKey(), prelaunchGoldDayKey: '', scenarioCleared: [],
  }
  ensurePrelaunchDailyGold(state)
  ensureCityGarrisons(state)
  return state
}

export function mergeFactionTerritories(state: StrategyState, snapshots: FactionTerritorySnapshot[]): number {
  const byCityId = new Map(snapshots.map(snapshot => [snapshot.cityId, snapshot]))
  let merged = 0
  state.cities.forEach(city => {
    const snapshot = byCityId.get(city.id)
    if (!snapshot) return
    const wasAlly = city.owner === state.faction
    city.owner = snapshot.owner
    city.conquestProgress = Math.max(0, Math.min(100, Math.trunc(snapshot.conquestProgress)))
    city.defense = Math.max(0, Math.min(cityDefenseForLevel(city.level), Math.trunc(snapshot.defense)))
    city.prosperity = Math.max(0, Math.min(100, Math.trunc(snapshot.prosperity)))
    mergeServerGarrisons(state, city, snapshot, wasAlly)
    mergeLastRaid(state, city, snapshot)
    if (Array.isArray(snapshot.battleLogs) && snapshot.battleLogs.length) {
      const existing = Array.isArray(city.battleLogs) ? city.battleLogs : []
      const knownIds = new Set(existing.map(log => log.id))
      // 같은 습격이 lastRaid로 이미 기록됐으면(같은 시각의 AI 기록) 다시 넣지 않는다.
      const knownAiTimes = new Set(existing.filter(log => log.attackerKind === 'ai').map(log => log.timestamp))
      city.battleLogs = [...existing, ...snapshot.battleLogs.filter(log => !knownIds.has(log.id) && !(log.attackerKind === 'ai' && knownAiTimes.has(log.timestamp)))]
        .sort((left, right) => left.timestamp - right.timestamp)
        .slice(-30)
    }
    merged += 1
  })
  return merged
}

/** 아군 도시의 수비대는 서버(진영 공용)가 기준이다. 다른 진영·중립 도시의 공성 진행(격파 수)은 건드리지 않는다. */
function mergeServerGarrisons(state: StrategyState, city: City, snapshot: FactionTerritorySnapshot, wasAlly: boolean): void {
  if (!snapshot.garrisons) return // 구버전 서버: 로컬 수비대 유지
  if (city.owner === state.faction) {
    const local = new Map((city.garrisons ?? []).map(garrison => [garrison.id, garrison]))
    city.garrisons = snapshot.garrisons.list.slice(0, MAX_CITY_GARRISONS).map(garrison => ({
      id: garrison.id,
      generalIds: local.get(garrison.id)?.generalIds ?? [],
      averageLevel: garrison.averageLevel,
      power: garrison.power,
      source: 'player' as const,
      label: garrison.label,
    }))
    city.defendersDefeated = Math.max(0, Math.min(city.garrisons.length, Math.trunc(snapshot.garrisons.defeated)))
  } else if (wasAlly) {
    // 아군 도시를 잃었다: 우리 수비대는 사라지고 새 주인의 수비 라인이 선다.
    city.garrisons = city.owner === '중립' ? createDummyCityGarrisons(city) : []
    city.defendersDefeated = 0
  }
}

function raidAttackerName(cityId: string, state: StrategyState): string {
  if (cityId === 'drill') return '중립 인공지능 습격대'
  const attacker = state.cities.find(city => city.id === cityId)
  return attacker ? `${attacker.name} 중립 습격대` : '중립 인공지능 습격대'
}

/** 서버 자동 습격 결과를 우리 도시 전투 기록에 한 번만 남긴다. */
function mergeLastRaid(state: StrategyState, city: City, snapshot: FactionTerritorySnapshot): void {
  const raid = snapshot.lastRaid
  if (!raid || typeof raid.at !== 'number' || raid.attackerCityId === 'drill') return
  if (city.owner !== state.faction && !raid.captured) return
  city.battleLogs ??= []
  if (city.battleLogs.some(log => log.attackerKind === 'ai' && log.timestamp === raid.at)) return
  const note = !raid.attackerWon
    ? `${raid.defenderLabel ?? '수비대'} 방어 성공 · 성벽 방어도 유지`
    : raid.captured ? `수비 실패 · 도시를 빼앗겼습니다 (성벽 -${raid.damage})`
    : `${raid.defenderLabel ? `${raid.defenderLabel} 격파 · ` : '수비대 없음 · '}성벽 방어도 -${raid.damage}`
  addCityBattleLog(city, { timestamp: raid.at, attackerName: raidAttackerName(raid.attackerCityId, state), attackerKind: 'ai', defenderName: state.faction, won: raid.attackerWon, damage: raid.damage, note })
}

export function allGenerals(): General[] {
  return LIBRARY.map(copyGeneral)
}

export function findGeneral(state: StrategyState, id: string): General | undefined {
  return state.generals.find(general => general.id === id)
}

export function combatPower(general: General): number {
  const basePower = general.leadership * 1.15 + general.martial * 1.25 + general.stratagem * 0.9 + general.speed * 0.65 + general.defense * 0.25
  return Math.round(basePower * GRADE_POWER_MULTIPLIER[general.grade] * (1 + (general.level - 1) * 0.035) * (1 + (general.stars - 1) * 0.06))
}

export function skillUnlockLevel(general: General): number {
  return Math.max(6, 10 - Math.max(0, general.stars - 1))
}

export function skillRank(general: General): number {
  return general.skillRank ?? Math.max(1, general.stars)
}

/** 스킬 1회 사기 피해(버프·인연 제외, 상한 40 적용). 스킬 재구성안의 공식. */
export function skillPower(general: General): number {
  const template = templateGeneral(general.id)
  return Math.round(Math.min(SKILL_MORALE_CAP, baseMoraleDamage(general, template ?? general)) * 10) / 10
}

export interface GeneralSkillDetail {
  category: '공격' | '버프' | '디버프' | '정화·치료' | '방어·제어'
  type: SkillType
  trigger: string
  target: string
  effect: string
  duration: string
  cooldown: string
  passive: string
  awaken: string
  weakness: string
}

const TYPE_CATEGORY: Record<SkillType, GeneralSkillDetail['category']> = { 돌격: '공격', 사격: '공격', 계략: '디버프', 통솔: '버프', 수호: '방어·제어', 치유: '정화·치료' }
const TYPE_TARGET: Record<SkillType, string> = { 돌격: '같은 레인의 적(없으면 앞의 적)', 사격: '병력 비율이 가장 낮은 적', 계략: '적 전체', 통솔: '아군 전체', 수호: '아군', 치유: '아군' }

export function skillDetail(general: General): GeneralSkillDetail {
  const def = skillDefFor(general.id, general.role, general.skillName, general.skillDescription)
  const template = templateGeneral(general.id) ?? general
  const power = skillPower(general)
  const awakened = isAwakened(general)
  const unlock = general.grade >= 3 ? 3 : 0
  return {
    category: TYPE_CATEGORY[def.type],
    type: def.type,
    trigger: '무장 버튼을 길게 눌러 발동 (무장별 쿨다운)',
    target: TYPE_TARGET[def.type],
    effect: `${activeSkillName(general)} · ${def.active.desc}${SKILL_TYPE_META[def.type].base > 0 ? ` · 적 사기 −${power}` : ''}${awakened && def.awaken ? ` · 각성: ${def.awaken.desc}` : ''}`,
    duration: `${def.type} 유형 · ${SKILL_TYPE_META[def.type].label}${general.stars >= 4 ? ' · 효과 지속 +1초' : ''}`,
    cooldown: `${skillCooldownFor(general, template)}초`,
    passive: def.passive ? `${def.passive.name} — ${def.passive.desc}${unlock && general.stars < unlock ? ' (3성에서 열림)' : ''}` : '',
    awaken: def.awaken ? `${def.awaken.name} — ${def.awaken.desc}${awakened ? '' : ' (5성 각성)'}` : '',
    weakness: def.weakness?.desc ?? '',
  }
}

export function totalPower(state: StrategyState): number {
  return state.formation.reduce((sum, id) => sum + (findGeneral(state, id) ? combatPower(findGeneral(state, id)!) + equipmentPower(state, id) : 0), 0)
}

export function ensureEquipmentState(state: StrategyState): void {
  syncGeneralSkills(state)
  if (!Array.isArray(state.equipmentInventory)) state.equipmentInventory = starterEquipment()
  state.equipmentInventory.forEach(item => {
    item.quantity = Math.max(1, Math.trunc(item.quantity ?? 1))
    if (item.grade === 'mythic' && !item.specialty) item.specialty = mythicSpecialty(item.type, item.set)
  })
  mergeEquipmentStacks(state)
  if (!state.equipmentLoadouts || typeof state.equipmentLoadouts !== 'object') state.equipmentLoadouts = {}
  if (!state.selectedEquipmentGeneralId || !state.generals.some(general => general.id === state.selectedEquipmentGeneralId)) state.selectedEquipmentGeneralId = state.generals[0]?.id ?? ''
  if (!Array.isArray(state.lastEquipmentDraw)) state.lastEquipmentDraw = []
  if (typeof state.mythicFragments !== 'number') state.mythicFragments = 0
  if (typeof state.mythicStones !== 'number' || !Number.isFinite(state.mythicStones)) state.mythicStones = 0
  ensureDuelDailyState(state)
}

function equipmentStackKey(item: Equipment): string {
  return [item.name, item.type, item.set, item.grade, item.level, item.mainStat, item.baseValue, item.skillName, item.skillDescription, item.mythicEventOnly ? 'event' : '', item.specialty ?? ''].join('|')
}

function mergeEquipmentStacks(state: StrategyState): void {
  const stacks = new Map<string, Equipment>()
  const redirects = new Map<string, string>()
  const merged: Equipment[] = []
  state.equipmentInventory.forEach(item => {
    const existing = stacks.get(equipmentStackKey(item))
    if (!existing) {
      stacks.set(equipmentStackKey(item), item)
      merged.push(item)
      return
    }
    existing.quantity = (existing.quantity ?? 1) + (item.quantity ?? 1)
    redirects.set(item.id, existing.id)
  })
  if (redirects.size) {
    Object.values(state.equipmentLoadouts ?? {}).forEach(loadout => {
      ;(Object.keys(loadout) as EquipmentType[]).forEach(type => {
        const itemId = loadout[type]
        const redirected = itemId ? redirects.get(itemId) : undefined
        if (redirected) loadout[type] = redirected
      })
    })
  }
  state.equipmentInventory = merged
}

function addEquipmentToInventory(state: StrategyState, item: Equipment): Equipment {
  const existing = state.equipmentInventory.find(candidate => equipmentStackKey(candidate) === equipmentStackKey(item))
  if (existing) {
    existing.quantity = (existing.quantity ?? 1) + (item.quantity ?? 1)
    return existing
  }
  item.quantity = Math.max(1, Math.trunc(item.quantity ?? 1))
  state.equipmentInventory.push(item)
  return item
}

export function equipmentInventoryCount(state: StrategyState): number {
  ensureEquipmentState(state)
  return state.equipmentInventory.reduce((total, item) => total + (item.quantity ?? 1), 0)
}

export function equipmentValue(item: Equipment): number {
  return Math.round(item.baseValue * (1 + (item.level - 1) * 0.14))
}

/** 장비 목록이 주는 능력치(주 능력치·신화 특성·세트 효과). 게임과 밸런스 테스트가 같이 쓴다. */
export function equipmentBonusFromItems(items: Equipment[]): Record<EquipmentStat, number> {
  const bonus: Record<EquipmentStat, number> = { leadership: 0, martial: 0, stratagem: 0, speed: 0 }
  const setCounts: Partial<Record<EquipmentSet, number>> = {}
  items.forEach(item => {
    bonus[item.mainStat] += equipmentValue(item)
    const specialty = equipmentSpecialty(item)
    if (specialty) bonus[specialty.stat] += specialty.value
    setCounts[item.set] = (setCounts[item.set] ?? 0) + 1
  })
  ;(Object.entries(setCounts) as Array<[EquipmentSet, number]>).forEach(([set, count]) => {
    if (count >= 2) bonus[EQUIPMENT_SET_META[set].stat] += 10
    if (count >= 3) bonus[EQUIPMENT_SET_META[set].stat] += 8
  })
  return bonus
}

export function equipmentBonus(state: StrategyState, generalId: string): Record<EquipmentStat, number> {
  ensureEquipmentState(state)
  const loadout = state.equipmentLoadouts[generalId] ?? {}
  const items = Object.values(loadout).map(itemId => state.equipmentInventory.find(candidate => candidate.id === itemId)).filter((item): item is Equipment => Boolean(item))
  return equipmentBonusFromItems(items)
}

/** 전투에 들어가는 무장 능력치: 장비 보너스를 더하고 공격·방어에도 일부 반영한다. */
export function withEquipmentStats(general: General, bonus: Record<EquipmentStat, number>): General {
  return {
    ...general,
    leadership: general.leadership + bonus.leadership,
    martial: general.martial + bonus.martial,
    stratagem: general.stratagem + bonus.stratagem,
    speed: general.speed + bonus.speed,
    attack: general.attack + Math.round(bonus.martial * 0.45),
    defense: general.defense + Math.round(bonus.leadership * 0.35),
  }
}

/** 지정한 종류·세트·등급·강화 레벨의 장비 한 개(밸런스 테스트용) */
export function makeEquipment(type: EquipmentType, set: EquipmentSet, grade: EquipmentGrade, level = 1): Equipment {
  const setMeta = EQUIPMENT_SET_META[set]
  return {
    id: `test-${type}-${set}-${grade}-${level}`, name: `${EQUIPMENT_GRADE_META[grade].label} ${setMeta.label} ${EQUIPMENT_TYPE_META[type].label}`,
    type, set, grade, level: Math.max(1, Math.min(20, Math.trunc(level))), mainStat: setMeta.stat, baseValue: EQUIPMENT_GRADE_META[grade].base,
    skillName: setMeta.skillName, skillDescription: setMeta.skillDescription, specialty: grade === 'mythic' ? mythicSpecialty(type, set) : undefined,
  }
}

export function equipmentSetCounts(state: StrategyState, generalId: string): Partial<Record<EquipmentSet, number>> {
  ensureEquipmentState(state)
  const counts: Partial<Record<EquipmentSet, number>> = {}
  Object.values(state.equipmentLoadouts[generalId] ?? {}).forEach(itemId => {
    const item = state.equipmentInventory.find(candidate => candidate.id === itemId)
    if (item) counts[item.set] = (counts[item.set] ?? 0) + 1
  })
  return counts
}

export function equipmentPower(state: StrategyState, generalId: string): number {
  const bonus = equipmentBonus(state, generalId)
  return Math.round(bonus.leadership * 1.15 + bonus.martial * 1.25 + bonus.stratagem * 0.9 + bonus.speed * 0.65)
}

/** 신화장비 강화 1회에 드는 낙양 강화석 */
export const MYTHIC_STONE_COST = 1

export function equipmentCost(item: Equipment, state?: StrategyState): Partial<Record<ResourceKey, number>> {
  const cut = 1 - (state ? researchMods(state).enhanceCost : 0)
  return { silver: Math.round((420 + item.level * 260) * cut), iron: Math.round((100 + item.level * 75) * cut) }
}

export function enhanceEquipment(state: StrategyState, id: string): UpgradeResult {
  ensureEquipmentState(state)
  const item = state.equipmentInventory.find(candidate => candidate.id === id)
  if (!item) return { ok: false, message: '장비를 찾을 수 없습니다.' }
  if (item.level >= 20) return { ok: false, message: '장비가 이미 최고 강화 레벨입니다.' }
  if (item.grade === 'mythic') {
    // 신화장비는 은전·철로 강화할 수 없고, 낙양 강화석 1개로 1회 강화한다.
    if (state.mythicStones < MYTHIC_STONE_COST) return { ok: false, message: '낙양 강화석이 없습니다. 신화장비는 낙양 강화석으로만 강화할 수 있습니다(낙양 점령 1회당 1개).' }
    state.mythicStones -= MYTHIC_STONE_COST
  } else {
    const cost = equipmentCost(item, state)
    if (!spendResources(state, cost)) return { ok: false, message: `강화 재화가 부족합니다. 은전 ${formatNumber(cost.silver ?? 0)} · 철 ${formatNumber(cost.iron ?? 0)} 필요` }
  }
  const quantity = item.quantity ?? 1
  if (quantity > 1) {
    item.quantity = quantity - 1
    const enhanced = { ...item, id: `${item.id}-enhanced-${Date.now()}`, quantity: 1, level: item.level + 1 }
    addEquipmentToInventory(state, enhanced)
    state.lastNotice = `${item.name} 1개 강화 완료 · Lv.${enhanced.level} · ${enhanced.mainStat} +${equipmentValue(enhanced)}`
    return { ok: true, message: state.lastNotice }
  }
  item.level += 1
  state.lastNotice = `${item.name} 강화 완료 · Lv.${item.level} · ${item.mainStat} +${equipmentValue(item)}${item.grade === 'mythic' ? ` · 낙양 강화석 남은 ${state.mythicStones}개` : ''}`
  return { ok: true, message: state.lastNotice }
}

export function equipEquipment(state: StrategyState, generalId: string, itemId: string): UpgradeResult {
  ensureEquipmentState(state)
  if (!findGeneral(state, generalId)) return { ok: false, message: '장착할 무장을 찾을 수 없습니다.' }
  const item = state.equipmentInventory.find(candidate => candidate.id === itemId)
  if (!item) return { ok: false, message: '장비를 찾을 수 없습니다.' }
  Object.values(state.equipmentLoadouts).forEach(loadout => {
    Object.keys(loadout).forEach(type => { if (loadout[type as EquipmentType] === itemId) delete loadout[type as EquipmentType] })
  })
  state.equipmentLoadouts[generalId] = { ...(state.equipmentLoadouts[generalId] ?? {}), [item.type]: item.id }
  state.selectedEquipmentGeneralId = generalId
  state.lastNotice = `${findGeneral(state, generalId)?.name}에게 ${item.name}을(를) 장착했습니다.`
  return { ok: true, message: state.lastNotice }
}

export function unequipEquipment(state: StrategyState, generalId: string, type: EquipmentType): UpgradeResult {
  ensureEquipmentState(state)
  const general = findGeneral(state, generalId)
  if (!general) return { ok: false, message: '장착 해제할 무장을 찾을 수 없습니다.' }
  const loadout = state.equipmentLoadouts[generalId] ?? {}
  const itemId = loadout[type]
  if (!itemId) return { ok: false, message: `${EQUIPMENT_TYPE_META[type].label} 슬롯이 비어 있습니다.` }
  const item = state.equipmentInventory.find(candidate => candidate.id === itemId)
  delete loadout[type]
  state.equipmentLoadouts[generalId] = loadout
  state.lastNotice = item ? `${general.name}에게서 ${item.name}을(를) 장착 해제했습니다.` : `${general.name}의 ${EQUIPMENT_TYPE_META[type].label}을(를) 장착 해제했습니다.`
  return { ok: true, message: state.lastNotice }
}

function rollEquipmentGrade(legendaryBonus = 0): EquipmentGrade {
  const roll = Math.random() * 100
  if (roll < 5 + legendaryBonus) return 'legendary'
  if (roll < 17 + legendaryBonus) return 'unique'
  if (roll < 45) return 'rare'
  return 'normal'
}

function createDrawnEquipment(index: number, legendaryBonus = 0): Equipment {
  const type = (['weapon', 'armor', 'accessory'] as EquipmentType[])[Math.floor(Math.random() * 3)]
  const sets = Object.keys(EQUIPMENT_SET_META) as EquipmentSet[]
  const set = sets[Math.floor(Math.random() * sets.length)]
  const grade = rollEquipmentGrade(legendaryBonus)
  const meta = EQUIPMENT_GRADE_META[grade]
  const setMeta = EQUIPMENT_SET_META[set]
  const names: Record<EquipmentType, string[]> = { weapon: ['청룡 장도', '패왕 철극', '유성 비수'], armor: ['현무 중갑', '백린 갑주', '천군 전포'], accessory: ['옥패 부적', '군령 인장', '천책 죽간'] }
  return { id: `equipment-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`, name: names[type][Math.floor(Math.random() * names[type].length)], type, set, grade, level: 1, mainStat: setMeta.stat, baseValue: meta.base, skillName: setMeta.skillName, skillDescription: setMeta.skillDescription }
}

export interface EquipmentDrawResult { ok: boolean; message: string; rewards: Equipment[] }

export interface MythicShopResult { ok: boolean; message: string; item?: Equipment }

export interface GoldPurchaseResult { ok: boolean; message: string; package?: GoldPackage }
export interface ResourceShopResult { ok: boolean; message: string; package?: ResourceShopPackage }
export interface HonorShopResult { ok: boolean; message: string; package?: HonorShopPackage }

export function purchaseGoldPackage(state: StrategyState, packageId: string): GoldPurchaseResult {
  if (!GOLD_PURCHASE_ENABLED) return { ok: false, message: '금화 충전은 정식 출시 전까지 잠겨 있습니다.' }
  const goldPackage = GOLD_PACKAGES.find(item => item.id === packageId)
  if (!goldPackage) return { ok: false, message: '해당 금화 충전 패키지를 찾을 수 없습니다.' }
  state.gold += goldPackage.gold
  state.lastNotice = `${goldPackage.name} 지급 완료 · 테스트 충전`
  return { ok: true, message: state.lastNotice, package: goldPackage }
}

export function purchaseResourcePackage(state: StrategyState, packageId: string): ResourceShopResult {
  const resourcePackage = RESOURCE_SHOP_PACKAGES.find(item => item.id === packageId)
  if (!resourcePackage) return { ok: false, message: '해당 자원 패키지를 찾을 수 없습니다.' }
  if (state.gold < resourcePackage.goldCost) return { ok: false, message: `금화가 부족합니다. ${resourcePackage.goldCost}개가 필요합니다.` }
  state.gold -= resourcePackage.goldCost
  if (resourcePackage.resource === 'silver') state.silver += resourcePackage.amount
  else state.resources[resourcePackage.resource] += resourcePackage.amount
  state.resources.silver = state.silver
  state.lastNotice = `${RESOURCE_META[resourcePackage.resource].label} ${resourcePackage.amount.toLocaleString('ko-KR')} 지급 완료 · 금화 -${resourcePackage.goldCost}`
  return { ok: true, message: state.lastNotice, package: resourcePackage }
}

export function purchaseHonorPackage(state: StrategyState, packageId: string): HonorShopResult {
  const honorPackage = HONOR_SHOP_PACKAGES.find(item => item.id === packageId)
  if (!honorPackage) return { ok: false, message: '해당 명망 패키지를 찾을 수 없습니다.' }
  if (state.gold < honorPackage.goldCost) return { ok: false, message: `금화가 부족합니다. ${honorPackage.goldCost}개가 필요합니다.` }
  state.gold -= honorPackage.goldCost
  state.honor += honorPackage.honor
  state.lastNotice = `명망 ${honorPackage.honor.toLocaleString('ko-KR')} 지급 완료 · 금화 -${honorPackage.goldCost}`
  return { ok: true, message: state.lastNotice, package: honorPackage }
}

export function purchaseMythicEquipment(state: StrategyState, equipmentId: string): MythicShopResult {
  ensureEquipmentState(state)
  if (state.mythicFragments < MYTHIC_FRAGMENT_COST) return { ok: false, message: `신화장비 조각이 부족합니다. ${MYTHIC_FRAGMENT_COST}개가 필요합니다.` }
  // Legacy callers may still provide a slot type; new shop cards always use the unique template id.
  const template = MYTHIC_SHOP_EQUIPMENT.find(item => item.id === equipmentId)
    ?? MYTHIC_SHOP_EQUIPMENT.find(item => item.type === equipmentId)
  if (!template) return { ok: false, message: '해당 신화장비를 찾을 수 없습니다.' }
  state.mythicFragments -= MYTHIC_FRAGMENT_COST
  const item = { ...template, id: `${template.id}-${Date.now()}-${state.equipmentInventory.length}` }
  addEquipmentToInventory(state, item)
  state.lastNotice = `${item.name}을(를) 구매했습니다. 신화장비 조각 -${MYTHIC_FRAGMENT_COST}`
  return { ok: true, message: state.lastNotice, item }
}

export function drawEquipment(state: StrategyState, count = 1): EquipmentDrawResult {
  ensureEquipmentState(state)
  const cost = count === 10 ? 2200 : 240
  if (state.honor < cost) return { ok: false, message: `명망이 부족합니다. 장비 뽑기에는 ${formatNumber(cost)} 명망이 필요합니다.`, rewards: [] }
  state.honor -= cost
  const legendaryBonus = researchMods(state).legendaryRate
  const rewards = Array.from({ length: count }, (_, index) => createDrawnEquipment(index, legendaryBonus))
  rewards.forEach(item => addEquipmentToInventory(state, item))
  state.lastEquipmentDraw = rewards
  state.lastNotice = `${count}회 장비 뽑기 완료 · ${rewards.map(item => `${EQUIPMENT_GRADE_META[item.grade].label} ${item.name}`).join(', ')}`
  return { ok: true, message: state.lastNotice, rewards }
}

function weightedGrade(boosted = false): Grade {
  const roll = Math.random() * 100
  if (roll < (boosted ? 3 : 2)) return 5
  if (roll < (boosted ? 13 : 10)) return 4
  if (roll < 30) return 3
  if (roll < 65) return 2
  return 1
}

function pickFromGrade(grade: Grade): General {
  const candidates = LIBRARY.filter(general => general.grade === grade)
  return copyGeneral(candidates[Math.floor(Math.random() * candidates.length)] ?? LIBRARY[LIBRARY.length - 1])
}

function createSummonedGeneral(grade: Grade): General {
  const general = pickFromGrade(grade)
  return { ...general, level: 1, stars: 1, skillUnlocked: false, skillRank: 1, skillPower: 100 }
}

export interface RecruitResult {
  ok: boolean
  message: string
  general: General | null
  rewards: General[]
}

/** 무장 모집 명망 비용(구현령 −10%) */
export function recruitCost(state: StrategyState, count = 1): number {
  return Math.round((count === 10 ? 900 : 100) * (1 - researchMods(state).recruitCost))
}

export function recruit(state: StrategyState, count = 1): RecruitResult {
  const cost = recruitCost(state, count)
  const boosted = researchMods(state).recruitRate
  if (state.honor < cost) return { ok: false, message: '명망이 부족합니다. 전투에서 명망을 모아 다시 시도하십시오.', general: null, rewards: [] }
  state.honor -= cost
  const rewards: General[] = []
  for (let index = 0; index < count; index += 1) {
    const reward = createSummonedGeneral(weightedGrade(boosted))
    rewards.push(reward)
    const owned = findGeneral(state, reward.id)
    if (owned) {
      const previousStars = owned.stars
      if (previousStars < 5) {
        owned.stars += 1
        owned.attack += 4 + owned.stars
        owned.defense += 3 + Math.floor(owned.stars / 2)
        owned.command += 3 + Math.floor(owned.stars / 2)
        owned.leadership += 3 + owned.stars
        owned.martial += 4 + owned.stars
        owned.stratagem += 2 + Math.floor(owned.stars / 2)
        owned.speed += 2 + Math.floor(owned.stars / 2)
        owned.skillRank = Math.min(5, (owned.skillRank ?? previousStars) + 1)
        owned.skillPower = (owned.skillPower ?? 100) + 18
      } else {
        state.manuals += Math.round(8 * (1 + researchMods(state).manuals))
      }
    } else {
      state.generals.push(reward)
      state.formation = state.formation.length < 3 ? [...state.formation, reward.id] : state.formation
    }
  }
  const preferredReward = [...rewards].reverse().find(reward => reward.grade === 5) ?? rewards.reduce((highest, reward) => reward.grade > highest.grade ? reward : highest, rewards[0])
  const featured = preferredReward ? findGeneral(state, preferredReward.id) ?? preferredReward : null
  const duplicates = rewards.filter(reward => state.generals.some(general => general.id === reward.id && general.id !== featured?.id)).length
  const tail = count === 10 ? ` 10회 모집 완료 · ${duplicates}장의 중복 인장이 성장 재료로 전환되었습니다.` : ''
  state.lastRecruit = featured ? copyGeneral(featured) : null
  state.lastNotice = featured ? `${featured.name} — ${featured.stars}성으로 응답했습니다.${tail}` : '모집 결과를 확인하십시오.'
  return { ok: true, message: state.lastNotice, general: featured, rewards: rewards.map(reward => copyGeneral(findGeneral(state, reward.id) ?? reward)) }
}

export interface UpgradeResult { ok: boolean; message: string }

export function upgrade(state: StrategyState, id: string): UpgradeResult {
  const general = findGeneral(state, id)
  if (!general) return { ok: false, message: '무장을 찾을 수 없습니다.' }
  const levelCut = 1 - researchMods(state).levelCost
  const silverCost = Math.round((650 + general.level * 350) * levelCut)
  const manualCost = Math.round((12 + general.level * 2) * levelCut)
  if (state.silver < silverCost || state.manuals < manualCost) return { ok: false, message: `강화 재료가 부족합니다. 은전 ${formatNumber(silverCost)} · 병서 ${manualCost} 필요` }
  state.silver -= silverCost
  state.resources.silver = state.silver
  state.manuals -= manualCost
  general.level += 1
  general.attack += 6 + general.stars
  general.defense += 4 + Math.floor(general.stars / 2)
  general.command += 3
  general.leadership += 3
  general.martial += 6 + general.stars
  general.stratagem += 2
  general.speed += 2
  general.skillPower = (general.skillPower ?? 100) + 3
  if (general.level >= skillUnlockLevel(general) && !general.skillUnlocked) state.lastNotice = `${general.name}이(가) Lv.${general.level}에 도달했습니다. ${general.stars}성 스킬 해금이 가능합니다.`
  else state.lastNotice = `${general.name} 강화 완료 · Lv.${general.level}`
  return { ok: true, message: state.lastNotice }
}

export function unlockSkill(state: StrategyState, id: string): UpgradeResult {
  const general = findGeneral(state, id)
  if (!general) return { ok: false, message: '무장을 찾을 수 없습니다.' }
  if (general.skillUnlocked) return { ok: false, message: '이미 해금된 스킬입니다.' }
  if (general.level < skillUnlockLevel(general)) return { ok: false, message: `${general.stars}성 무장은 레벨 ${skillUnlockLevel(general)}에서 스킬을 해금할 수 있습니다.` }
  if (state.silver < 1500) return { ok: false, message: '은전이 부족합니다. 전투 보상으로 은전을 확보하십시오.' }
  state.silver -= 1500
  state.resources.silver = state.silver
  general.skillUnlocked = true
  general.skillRank = Math.max(1, general.skillRank ?? general.stars)
  general.skillPower = general.skillPower ?? 100
  state.lastNotice = `${general.name}의 「${general.skillName}」이(가) 해금되었습니다.`
  return { ok: true, message: state.lastNotice }
}

export function toggleFormation(state: StrategyState, id: string): void {
  if (!state.generals.some(general => general.id === id)) return
  if (state.formation.includes(id)) {
    if (state.formation.length > 1) state.formation = state.formation.filter(item => item !== id)
    return
  }
  if (state.formation.length >= 3) state.formation = [...state.formation.slice(0, 2), id]
  else state.formation = [...state.formation, id]
  state.lastNotice = '출전 진형이 갱신되었습니다.'
}

export const RESOURCE_META: Record<ResourceKey, { label: string; icon: string; color: string }> = {
  grain: { label: '식량', icon: '▦', color: '#d6b66d' },
  silver: { label: '은전', icon: '◈', color: '#c8d6dc' },
  wood: { label: '목재', icon: '⌁', color: '#9bc68f' },
  iron: { label: '철', icon: '◆', color: '#9db9d8' },
  influence: { label: '영향력', icon: '✦', color: '#52e0c4' },
}

export function findCity(state: StrategyState, id = state.selectedCityId): City | undefined {
  return state.cities.find(city => city.id === id)
}

export interface ConquestEligibility {
  allowed: boolean
  reason: string
  neighborNames: string[]
}

export function capitalFactionForCity(cityId: string): Faction | undefined {
  return (Object.entries(FACTION_CAPITALS) as Array<[Faction, string]>).find(([, capitalId]) => capitalId === cityId)?.[0]
}
export function isLuoyangSiegeWindow(now = Date.now()): boolean {
  const date = new Date(now)
  return date.getDay() === 0 && date.getHours() >= 20 && date.getHours() < 24
}
export function conquestEligibility(state: StrategyState, cityId: string, now = Date.now()): ConquestEligibility {
  const city = findCity(state, cityId)
  if (!city) return { allowed: false, reason: '해당 도시를 찾을 수 없습니다.', neighborNames: [] }
  const neighborNames = (CITY_ADJACENCY[city.id] ?? []).map(id => findCity(state, id)).filter((neighbor): neighbor is City => Boolean(neighbor)).map(neighbor => neighbor.name)
  if (city.owner === state.faction) return { allowed: false, reason: `이미 ${state.faction}이(가) 지배하는 도시입니다.`, neighborNames }
  const capitalFaction = capitalFactionForCity(city.id)
  if (capitalFaction) return { allowed: false, reason: `${city.name}은(는) ${capitalFaction}의 본성이라 점령할 수 없습니다.`, neighborNames }
  if (city.id === AI_CAPITAL_ID) return { allowed: false, reason: '양양은 중립 인공지능 진영의 수도라 점령할 수 없습니다.', neighborNames }
  if (city.id === LUOYANG_ID && !isLuoyangSiegeWindow(now)) return { allowed: false, reason: '낙양은 일요일 저녁 8시에만 점령할 수 있습니다.', neighborNames }
  if (city.id === LUOYANG_ID) return { allowed: true, reason: '낙양 독립 전선 · 점령 창이 열린 동안 모든 진영이 직접 출정할 수 있습니다.', neighborNames }
  const borderNeighbors = (CITY_ADJACENCY[city.id] ?? []).map(id => findCity(state, id)).filter((neighbor): neighbor is City => Boolean(neighbor)).filter(neighbor => neighbor.owner === state.faction)
  if (borderNeighbors.length === 0) return { allowed: false, reason: '아군 국경과 맞닿은 도시만 점령할 수 있습니다. 원거리 점령은 불가능합니다.', neighborNames }
  return { allowed: true, reason: `${borderNeighbors.map(neighbor => neighbor.name).join(' · ')}에서 연결되는 국경 전선입니다.`, neighborNames }
}

function buildingLevel(city: City, kind: BuildingKind): number {
  return city.buildings.find(building => building.kind === kind)?.level ?? 0
}

export function cityWallCapacity(city: City): number {
  return cityDefenseForLevel(city.level)
}
function wallDamageFromPower(power: number): number {
  return Math.max(1, Math.min(CITY_DEFENSE_BY_LEVEL[5], Math.trunc(power)))
}

export function cityIncome(city: City, state?: StrategyState): Resources {
  if (city.owner !== (state?.faction ?? '촉한')) return { grain: 0, silver: 0, wood: 0, iron: 0, influence: 0 }
  const productionMultiplier = CITY_PRODUCTION_MULTIPLIER[city.level as Grade] ?? CITY_PRODUCTION_MULTIPLIER[5]
  const farm = buildingLevel(city, 'agriculture')
  const market = buildingLevel(city, 'commerce')
  const workshop = buildingLevel(city, 'workshop')
  const academy = buildingLevel(city, 'academy')
  const mods = state ? researchMods(state) : null
  const all = 1 + (mods?.allIncome ?? 0)
  const grainBonus = (1 + (mods?.grain ?? 0)) * all
  const silverBonus = (1 + (mods?.silver ?? 0)) * all
  const materialBonus = (1 + (mods?.woodIron ?? 0)) * all
  const influenceBonus = (1 + (mods?.influence ?? 0)) * all
  return {
    grain: Math.round((170 + farm * 210 + city.prosperity * 2.2) * productionMultiplier * grainBonus * CITY_INCOME_REWARD_MULTIPLIER),
    silver: Math.round((120 + market * 155 + city.prosperity * 1.4) * productionMultiplier * silverBonus * CITY_INCOME_REWARD_MULTIPLIER),
    wood: Math.round((80 + workshop * 120) * productionMultiplier * materialBonus * CITY_INCOME_REWARD_MULTIPLIER),
    iron: Math.round((45 + workshop * 82) * productionMultiplier * materialBonus * CITY_INCOME_REWARD_MULTIPLIER),
    influence: Math.round((35 + market * 28 + academy * 44) * productionMultiplier * influenceBonus * CITY_INCOME_REWARD_MULTIPLIER),
  }
}

export function conquestPower(state: StrategyState): number {
  const formationPower = totalPower(state)
  return formationPower + state.cities.filter(city => city.owner === state.faction).length * 35
}

export function conquestCost(city: City, state?: StrategyState): Partial<Record<ResourceKey, number>> {
  const cut = 1 - (state ? researchMods(state).siegeCost : 0)
  return {
    grain: Math.round((650 + city.level * 250) * cut),
    silver: Math.round((550 + city.level * 250) * cut),
    iron: Math.round((180 + city.level * 120) * cut),
  }
}

export interface ConquestResult {
  ok: boolean
  captured: boolean
  message: string
  damage: number
}

export interface TerritoryBattleResult {
  ok: boolean
  won: boolean
  message: string
  damage: number
}

function territoryBattleCost(city: City): Partial<Record<ResourceKey, number>> {
  return { grain: 280 + city.level * 90, silver: 220 + city.level * 80, iron: 100 + city.level * 55 }
}

/** 이 도시를 칠 수 있는 중립 습격대의 레벨: 맞닿은 중립 도시 중 가장 높은 레벨 (없으면 도시 자신의 레벨). 서버와 같은 기준. */
export function neutralRaidLevelFor(state: StrategyState, cityId: string): number {
  const levels = (CITY_ADJACENCY[cityId] ?? []).map(id => findCity(state, id)).filter((city): city is City => Boolean(city) && city!.owner === '중립').map(city => city.level)
  return levels.length ? Math.max(...levels) : (findCity(state, cityId)?.level ?? 1)
}

/**
 * 방어전: 중립 습격대가 아군 도시를 친다. 판정은 서버 자동 습격과 같은 규칙(server/neutral-raid.mjs).
 * 결과의 won은 '우리 수비대가 막아냈는가'이다. 방어전으로는 도시를 잃지 않는다.
 */
export function defendCity(state: StrategyState, cityId: string, now = Date.now()): TerritoryBattleResult {
  const city = findCity(state, cityId)
  if (!city) return { ok: false, won: false, message: '해당 도시를 찾을 수 없습니다.', damage: 0 }
  if (city.owner !== state.faction) return { ok: false, won: false, message: '아군 도시에서만 방어전을 지휘할 수 있습니다.', damage: 0 }
  const wait = defenseCooldownRemaining(state, now)
  if (wait > 0) return { ok: false, won: false, message: `수비대가 재정비 중입니다. ${Math.ceil(wait / 1000)}초 후 방어전을 시작할 수 있습니다.`, damage: 0 }
  const cost = territoryBattleCost(city)
  if (!spendResources(state, cost)) return { ok: false, won: false, message: '방어전 보급품이 부족합니다.', damage: 0 }
  state.lastDefenseAt = now
  const garrisons = (city.garrisons ?? []).filter(garrison => garrison.source === 'player')
  const raidPower = neutralRaidPower(neutralRaidLevelFor(state, city.id))
  const mods = researchMods(state)
  const result = resolveNeutralRaid({ raidPower, garrisonPowers: garrisons.map(garrison => garrison.power * (1 + mods.raidGarrison)), defeated: city.defendersDefeated ?? 0, defense: city.defense, allowCapture: false })
  if (result.attackerWon && mods.raidWallDamage < 1) {
    // 성벽 보강·철옹성: 성벽이 받는 피해를 줄인다
    const reduced = Math.round(result.damage * mods.raidWallDamage)
    result.defense = Math.min(city.defense, result.defense + (result.damage - reduced))
    result.damage = reduced
  }
  const defender = result.defenderIndex >= 0 ? garrisons[result.defenderIndex] : undefined
  const held = !result.attackerWon
  city.garrisons = garrisons
  city.defendersDefeated = result.defeated
  city.defense = result.defense
  if (held) {
    state.factionWarScore += 100
    state.lastNotice = `${city.name} 방어 성공 · ${defender?.label ?? '수비대'}가 습격대(전력 ${formatNumber(raidPower)})를 막았습니다 · 성벽 방어도 유지 · 세력전 공헌 +100`
  } else {
    city.prosperity = Math.max(20, city.prosperity - Math.round(4 * (1 - mods.prosperityLoss)))
    state.lastNotice = defender
      ? `${city.name} 방어 실패 · ${defender.label} 격파 · 성벽 방어도 -${formatNumber(result.damage)} · 남은 수비대 ${result.remaining}`
      : `${city.name} 수비대가 없어 성벽이 습격당했습니다 · 성벽 방어도 -${formatNumber(result.damage)} · 아군 진형을 수비병으로 세우십시오`
  }
  addCityBattleLog(city, { timestamp: now, attackerName: '중립 인공지능 습격대', attackerKind: 'ai', defenderName: state.faction, won: result.attackerWon, damage: result.damage, note: held ? `${defender?.label ?? '수비대'} 방어 성공 · 성벽 방어도 유지` : defender ? `${defender.label} 격파 · 성벽 방어도 -${result.damage}` : `수비대 없음 · 성벽 방어도 -${result.damage}` })
  return { ok: true, won: held, message: state.lastNotice, damage: result.damage }
}

export function launchFactionBattle(state: StrategyState, cityId: string, now = Date.now()): TerritoryBattleResult {
  const city = findCity(state, cityId)
  if (!city) return { ok: false, won: false, message: '해당 전선을 찾을 수 없습니다.', damage: 0 }
  ensureCityGarrisons(state)
  if (city.owner === state.faction) return { ok: false, won: false, message: '아군 도시에는 세력전 공격을 할 수 없습니다.', damage: 0 }
  const eligibility = conquestEligibility(state, cityId, now)
  if (!eligibility.allowed) return { ok: false, won: false, message: eligibility.reason, damage: 0 }
  const remainingGarrisons = Math.max(0, (city.garrisons?.length ?? 0) - (city.defendersDefeated ?? 0))
  const breachThreshold = cityBreachThreshold(city)
  if (city.defense > breachThreshold || remainingGarrisons > 0) return { ok: false, won: false, message: `최종 세력전은 성벽 방어도 약화 한계(${breachThreshold.toLocaleString()})와 수비병 전멸 후에만 실행할 수 있습니다. 현재 방어도 ${city.defense} · 남은 수비병 ${remainingGarrisons}부대`, damage: 0 }
  const wait = factionBattleCooldownRemaining(state, now)
  if (wait > 0) return { ok: false, won: false, message: `세력전 부대가 재편성 중입니다. ${Math.ceil(wait / 1000)}초 후 다시 공격할 수 있습니다.`, damage: 0 }
  const honorCost = FACTION_WAR_HONOR_COST[city.level] ?? FACTION_WAR_HONOR_COST[5]
  const goldReward = Math.round((FACTION_WAR_GOLD_REWARD[city.level] ?? FACTION_WAR_GOLD_REWARD[5]) * (1 + researchMods(state).factionGold))
  if (state.honor < honorCost) return { ok: false, won: false, message: `최종 세력전에 필요한 명망이 부족합니다. 명망 ${honorCost} 필요`, damage: 0 }
  state.honor -= honorCost
  state.lastFactionBattleAt = now
  const attackPower = conquestPower(state) + state.cities.filter(item => item.owner === state.faction).length * 70
  const factionPower = 300 + city.level * 250 + (city.owner === '위나라' ? 100 : city.owner === '오나라' ? 70 : 0)
  const won = attackPower >= factionPower * 0.75
  addCityBattleLog(city, { timestamp: now, attackerName: state.faction, attackerKind: 'user', defenderName: city.owner, won, damage: 0, note: won ? `최종 세력전 승리 · 명망 -${honorCost} · 금화 +${goldReward}` : `최종 세력전 패배 · 명망 -${honorCost}` })
  if (won) {
    city.owner = state.faction
    city.garrisons = []
    city.defendersDefeated = 0
    city.conquestProgress = 100
    state.gold += goldReward
    state.factionWarScore += 150
    if (city.id === LUOYANG_ID) state.lastNotice = `${city.name} 최종 세력전 승리 · 금화 +${goldReward} · 자정까지 수비한 진영이 주간 승자가 됩니다.`
    else state.lastNotice = `${city.name} 최종 세력전 승리 · 금화 +${goldReward} · 적 세력을 몰아내고 영토를 확보했습니다.`
  } else {
    state.factionWarScore = Math.max(0, state.factionWarScore - 40)
    state.lastNotice = `${city.name} 최종 세력전 패배 · 명망 ${honorCost}를 소모했지만 적 세력이 성을 지켰습니다.`
  }
  return { ok: true, won, message: state.lastNotice, damage: 0 }
}

export function launchConquest(state: StrategyState, cityId: string, now = Date.now()): ConquestResult {
  const city = findCity(state, cityId)
  if (!city) return { ok: false, captured: false, message: '해당 도시를 찾을 수 없습니다.', damage: 0 }
  ensureCityGarrisons(state)
  if (city.owner === state.faction) return { ok: false, captured: false, message: `이미 ${state.faction}이(가) 지배하는 도시입니다.`, damage: 0 }
  const eligibility = conquestEligibility(state, cityId, now)
  if (!eligibility.allowed) return { ok: false, captured: false, message: eligibility.reason, damage: 0 }
  const conquestWait = conquestCooldownRemaining(state, now)
  if (conquestWait > 0) return { ok: false, captured: false, message: `공성 준비 중입니다. ${Math.ceil(conquestWait / 1000)}초 후 다시 출정할 수 있습니다.`, damage: 0 }
  const cost = city.defense <= 55 ? {} : conquestCost(city, state)
  if (!spendResources(state, cost)) return { ok: false, captured: false, message: `출정 자원이 부족합니다. 식량 ${formatNumber(cost.grain ?? 0)} · 은전 ${formatNumber(cost.silver ?? 0)} · 철 ${formatNumber(cost.iron ?? 0)} 필요`, damage: 0 }
  state.lastConquestAt = now
  const power = conquestPower(state)
  const defenseLine = defenseLineForCity(city)
  if (!city.garrisons?.length) city.garrisons = defenseLine
  const defeated = Math.max(0, Math.min(defenseLine.length, city.defendersDefeated ?? 0))
  const currentGarrison = defenseLine[defeated]
  const defenseScore = currentGarrison?.power ?? (city.defense * 5 + city.level * 180)
  const advantage = power / Math.max(defenseScore, 1)
  // Repeated failed assaults weaken the wall; once it reaches the breach threshold,
  // even a low-power roster can finally break the current garrison.
  const won = advantage >= 0.72 || city.defense <= cityWallCapacity(city) * 0.55
  const damage = Math.round(wallDamageFromPower(power) * (1 + researchMods(state).siegeDamage))
  addCityBattleLog(city, { timestamp: now, attackerName: state.faction, attackerKind: 'user', defenderName: city.owner, won, damage: won ? damage : 0, note: won ? '공성 성공 · 수비병 격파와 점령 진전이 반영되었습니다.' : '공성 실패 · 성벽만 약화되었습니다.' })
  if (!won) {
    state.lastConquest = { cityId: city.id, cityName: city.name, captured: false, damage: 0 }
    state.lastNotice = `${city.name} 수비대 ${defeated + 1}부대에 패배했습니다. 수비병이 전선을 지켰습니다.`
    return { ok: true, captured: false, message: state.lastNotice, damage: 0 }
  }
  city.defendersDefeated = defeated + 1
  const breachThreshold = cityBreachThreshold(city)
  city.defense = Math.max(breachThreshold, city.defense - damage)
  const progress = Math.min(100, Math.round((city.defendersDefeated / defenseLine.length) * 100))
  city.conquestProgress = progress
  state.selectedCityId = city.id
  state.lastConquest = { cityId: city.id, cityName: city.name, captured: false, damage }
  const remaining = defenseLine.length - city.defendersDefeated
  const finalReady = city.defense <= breachThreshold && remaining <= 0
  state.lastNotice = finalReady
    ? `${city.name} 수비병 전멸 · 성벽 방어도 약화 한계(${breachThreshold.toLocaleString()}) · 최종 세력전을 실행해 점령하십시오.`
    : `${city.name} 수비병 ${city.defendersDefeated}부대 격파 · 성벽 방어도 -${damage} · ${remaining}부대 남음`
  return { ok: true, captured: false, message: state.lastNotice, damage }
}

/**
 * Finalizes a 3D siege result. The pre-battle conquest check may return an
 * accepted but losing assault so the arena can still show the siege scene.
 * If that scene is won, apply the wall damage exactly once here.
 */
export function resolveConquestBattle(state: StrategyState, cityId: string, battleWon: boolean, now = Date.now()): ConquestResult {
  const city = findCity(state, cityId)
  if (!city) return { ok: false, captured: false, message: '해당 도시를 찾을 수 없습니다.', damage: 0 }
  const previous = state.lastConquest?.cityId === city.id ? state.lastConquest.damage : 0
  if (!battleWon || previous > 0) return { ok: true, captured: false, message: state.lastConquest?.cityId === city.id ? state.lastNotice : `${city.name} 공성전에서 방어도가 감소하지 않았습니다.`, damage: previous }
  if (!Array.isArray(city.garrisons)) city.garrisons = defenseLineForCity(city)
  const defenseLine = defenseLineForCity(city)
  const defeated = Math.max(0, Math.min(defenseLine.length, city.defendersDefeated ?? 0))
  const damage = Math.round(wallDamageFromPower(conquestPower(state)) * (1 + researchMods(state).siegeDamage))
  city.defendersDefeated = Math.min(defenseLine.length, defeated + 1)
  const breachThreshold = cityBreachThreshold(city)
  city.defense = Math.max(breachThreshold, city.defense - damage)
  city.conquestProgress = Math.min(100, Math.round((city.defendersDefeated / Math.max(defenseLine.length, 1)) * 100))
  const remaining = defenseLine.length - city.defendersDefeated
  const finalReady = city.defense <= breachThreshold && remaining <= 0
  state.lastConquestAt = now
  state.selectedCityId = city.id
  state.lastConquest = { cityId: city.id, cityName: city.name, captured: false, damage }
  state.lastNotice = finalReady
    ? `${city.name} 3D 공성전 승리 · 성벽 방어도 -${damage} · 수비병 전멸 · 최종 세력전을 실행하십시오.`
    : `${city.name} 3D 공성전 승리 · 성벽 방어도 -${damage} · ${remaining}부대 남음`
  addCityBattleLog(city, { timestamp: now, attackerName: state.faction, attackerKind: 'user', defenderName: city.owner, won: true, damage, note: '3D 공성전 승리 · 성벽 방어도 감소가 확정되었습니다.' })
  return { ok: true, captured: false, message: state.lastNotice, damage }
}

function availableResource(state: StrategyState, key: ResourceKey): number {
  return key === 'silver' ? state.silver : state.resources[key]
}

function spendResources(state: StrategyState, cost: Partial<Record<ResourceKey, number>>): boolean {
  if (Object.entries(cost).some(([key, value]) => availableResource(state, key as ResourceKey) < (value ?? 0))) return false
  Object.entries(cost).forEach(([key, value]) => {
    const resource = key as ResourceKey
    if (resource === 'silver') state.silver -= value ?? 0
    else state.resources[resource] -= value ?? 0
  })
  state.resources.silver = state.silver
  return true
}

export function collectIncome(state: StrategyState, now = Date.now()): { ok: boolean; message: string; gain: Resources } {
  const incomeWait = incomeCooldownRemaining(state, now)
  if (incomeWait > 0) return { ok: false, message: `금일 내정 수확은 이미 완료했습니다. ${Math.ceil(incomeWait / 3600000)}시간 후 다시 수확할 수 있습니다.`, gain: { grain: 0, silver: 0, wood: 0, iron: 0, influence: 0 } }
  state.lastIncomeCollectedAt = now
  const gain = state.cities.reduce((total, city) => {
    const income = cityIncome(city, state)
    return {
      grain: total.grain + income.grain,
      silver: total.silver + income.silver,
      wood: total.wood + income.wood,
      iron: total.iron + income.iron,
      influence: total.influence + income.influence,
    }
  }, { grain: 0, silver: 0, wood: 0, iron: 0, influence: 0 })
  state.resources.grain += gain.grain
  state.silver += gain.silver
  state.resources.silver = state.silver
  state.resources.wood += gain.wood
  state.resources.iron += gain.iron
  state.resources.influence += gain.influence
  state.honor += Math.floor(gain.influence / 4)
  const harvestMods = researchMods(state)
  if (harvestMods.harvestManuals) state.manuals += Math.round(Math.max(1, Math.floor(gain.influence / 200)) * (1 + harvestMods.manuals))
  state.lastNotice = `내정 수확 완료 · 식량 +${formatNumber(gain.grain)} · 은전 +${formatNumber(gain.silver)} · 영향력 +${formatNumber(gain.influence)}`
  return { ok: true, message: state.lastNotice, gain }
}

export function selectCity(state: StrategyState, id: string): { ok: boolean; message: string } {
  const city = findCity(state, id)
  if (!city) return { ok: false, message: '해당 도시를 찾을 수 없습니다.' }
  state.selectedCityId = city.id
  state.lastNotice = `${city.name}(${city.chineseName})을(를) 내정 중심지로 선택했습니다.`
  return { ok: true, message: state.lastNotice }
}

export function buildingCost(building: CityBuilding, state?: StrategyState): Partial<Record<ResourceKey, number>> {
  const level = building.level
  const cut = 1 - (state ? researchMods(state).buildingCost : 0)
  return {
    silver: Math.round((420 + level * 280) * cut),
    wood: Math.round((260 + level * 190) * cut),
    iron: Math.round((building.kind === 'barracks' || building.kind === 'workshop' ? 210 + level * 135 : 80 + level * 45) * cut),
  }
}

export function upgradeBuilding(state: StrategyState, cityId: string, buildingId: string): { ok: boolean; message: string } {
  const city = findCity(state, cityId)
  if (!city) return { ok: false, message: '도시를 찾을 수 없습니다.' }
  if (city.owner !== state.faction) return { ok: false, message: '아군 영토의 도시만 내정을 지휘할 수 있습니다.' }
  const building = city.buildings.find(item => item.id === buildingId)
  if (!building) return { ok: false, message: '건물을 찾을 수 없습니다.' }
  if (building.level >= building.maxLevel) return { ok: false, message: `${building.name}은(는) 이미 최고 단계입니다.` }
  const cost = buildingCost(building, state)
  if (!spendResources(state, cost)) return { ok: false, message: `내정 자원이 부족합니다. 은전 ${formatNumber(cost.silver ?? 0)} · 목재 ${formatNumber(cost.wood ?? 0)} · 철 ${formatNumber(cost.iron ?? 0)} 필요` }
  building.level += 1
  city.prosperity = Math.min(100, city.prosperity + (building.kind === 'agriculture' || building.kind === 'commerce' ? 4 : 2))
  if (building.kind === 'barracks') city.defense = Math.min(100, city.defense + 7)
  state.selectedCityId = city.id
  state.lastNotice = `${city.name} · ${building.name} ${building.level}단계 완공`
  return { ok: true, message: state.lastNotice }
}

export function researchCost(node: ResearchNode): string {
  return researchCostText(node.cost, Object.fromEntries(Object.entries(RESOURCE_META).map(([key, meta]) => [key, meta.label])) as Record<ResourceKey, string>)
}

/** 연구 시작(시간이 걸린다). 예전 이름을 유지해 화면·저장 흐름을 그대로 쓴다. */
export function unlockResearch(state: StrategyState, id: string, now = Date.now()): { ok: boolean; message: string } {
  return startResearch(state, id, now)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value)
}

// ── 자동 편성 · 자동 장착 ──────────────────────────────────────────

const EQUIPMENT_TYPES: EquipmentType[] = ['weapon', 'armor', 'accessory']

/** 무장에게 맞는 능력치 가중치: 기본 전투력 공식에 스킬 주 능력치를 20% 더 얹는다. */
function statWeights(general: General): Record<EquipmentStat, number> {
  const weights: Record<EquipmentStat, number> = { leadership: 1.15, martial: 1.25, stratagem: 0.9, speed: 0.65 }
  const stat = SKILL_TYPE_META[skillDefFor(general.id, general.role).type].stat
  weights[stat] *= 1.2
  return weights
}

/** 장비 묶음(최대 3개)의 가치: 주 능력치·특성·세트 효과를 equipmentBonus와 같은 규칙으로 계산 */
function loadoutScore(items: Equipment[], weights: Record<EquipmentStat, number>): number {
  const bonus: Record<EquipmentStat, number> = { leadership: 0, martial: 0, stratagem: 0, speed: 0 }
  const sets: Partial<Record<EquipmentSet, number>> = {}
  items.forEach(item => {
    bonus[item.mainStat] += equipmentValue(item)
    const specialty = equipmentSpecialty(item)
    if (specialty) bonus[specialty.stat] += specialty.value
    sets[item.set] = (sets[item.set] ?? 0) + 1
  })
  ;(Object.entries(sets) as Array<[EquipmentSet, number]>).forEach(([set, count]) => {
    if (count >= 2) bonus[EQUIPMENT_SET_META[set].stat] += 10
    if (count >= 3) bonus[EQUIPMENT_SET_META[set].stat] += 8
  })
  return (Object.keys(bonus) as EquipmentStat[]).reduce((sum, stat) => sum + bonus[stat] * weights[stat], 0)
}

export interface AutoResult extends UpgradeResult { changed: number }

/**
 * 자동 장착: 출전 무장(전투력 높은 순)부터 슬롯별 후보 상위 6개를 모두 조합해 가장 좋은 묶음을 고른다.
 * 출전하지 않은 무장이 끼고 있던 장비도 가져올 수 있다. 한 장비는 한 무장만 낀다.
 */
export function autoEquip(state: StrategyState, generalIds: string[] = state.formation): AutoResult {
  ensureEquipmentState(state)
  const targets = generalIds.map(id => findGeneral(state, id)).filter((general): general is General => Boolean(general))
    .sort((left, right) => combatPower(right) - combatPower(left))
  if (!targets.length) return { ok: false, message: '장비를 장착할 출전 무장이 없습니다.', changed: 0 }
  if (!state.equipmentInventory.length) return { ok: false, message: '보유한 장비가 없습니다. 모집·장비에서 장비를 얻으십시오.', changed: 0 }
  const targetIds = new Set(targets.map(general => general.id))
  // 다른 무장(비출전)이 낀 장비는 후보에 넣되, 출전 무장끼리는 이번 계산 결과로 다시 나눈다.
  const used = new Set<string>()
  let changed = 0
  const before = JSON.stringify(targets.map(general => state.equipmentLoadouts[general.id] ?? {}))
  targets.forEach(general => {
    const weights = statWeights(general)
    const pool = state.equipmentInventory.filter(item => !used.has(item.id))
    const bySlot = EQUIPMENT_TYPES.map(type => [undefined, ...pool.filter(item => item.type === type)
      .sort((left, right) => loadoutScore([right], weights) - loadoutScore([left], weights)).slice(0, 6)])
    let best: Array<Equipment | undefined> = [undefined, undefined, undefined]
    let bestScore = -1
    for (const weapon of bySlot[0]) for (const armor of bySlot[1]) for (const accessory of bySlot[2]) {
      const items = [weapon, armor, accessory].filter((item): item is Equipment => Boolean(item))
      const score = loadoutScore(items, weights)
      if (score > bestScore) { bestScore = score; best = [weapon, armor, accessory] }
    }
    const loadout: Partial<Record<EquipmentType, string>> = {}
    best.forEach((item, index) => {
      if (!item) return
      used.add(item.id)
      loadout[EQUIPMENT_TYPES[index]] = item.id
    })
    // 이 장비를 끼고 있던 비출전 무장에게서는 뺀다.
    Object.entries(state.equipmentLoadouts).forEach(([ownerId, owned]) => {
      if (targetIds.has(ownerId)) return
      EQUIPMENT_TYPES.forEach(type => { if (owned[type] && used.has(owned[type]!)) delete owned[type] })
    })
    state.equipmentLoadouts[general.id] = loadout
  })
  const after = JSON.stringify(targets.map(general => state.equipmentLoadouts[general.id] ?? {}))
  if (before !== after) changed = targets.length
  const power = targets.reduce((sum, general) => sum + equipmentPower(state, general.id), 0)
  state.lastNotice = changed
    ? `자동 장착 완료 · 출전 무장 ${targets.length}명에게 가장 좋은 장비 조합을 장착했습니다 (장비 전투력 합계 ${formatNumber(power)})`
    : '이미 가장 좋은 장비를 장착하고 있습니다.'
  return { ok: true, message: state.lastNotice, changed }
}

/**
 * 자동 편성: 전투력 상위 10명 안에서 3명 조합을 모두 따져
 * 전투력 합 × (인연 +8%) × (병종이 다양할수록 +3%씩)이 가장 높은 조합을 고른다.
 * 레인은 가운데에 방어·통솔이 높은 무장, 좌우에 나머지를 둔다(적은 같은 레인의 아군을 먼저 친다).
 */
export function autoFormation(state: StrategyState): AutoResult {
  if (state.generals.length === 0) return { ok: false, message: '보유한 무장이 없습니다.', changed: 0 }
  const power = (general: General) => combatPower(general) + equipmentPower(state, general.id)
  const pool = [...state.generals].sort((left, right) => power(right) - power(left)).slice(0, 10)
  const size = Math.min(3, pool.length)
  let best: General[] = pool.slice(0, size)
  let bestScore = -1
  const consider = (combo: General[]) => {
    const ids = combo.map(general => general.id)
    const roles = new Set(combo.map(general => general.role)).size
    const score = combo.reduce((sum, general) => sum + power(general), 0) * (bondFor(ids) ? 1.08 : 1) * (1 + 0.03 * Math.max(0, roles - 1))
    if (score > bestScore) { bestScore = score; best = combo }
  }
  if (size < 3) consider(pool.slice(0, size))
  else for (let a = 0; a < pool.length; a += 1) for (let b = a + 1; b < pool.length; b += 1) for (let c = b + 1; c < pool.length; c += 1) consider([pool[a], pool[b], pool[c]])
  const tank = [...best].sort((left, right) => (right.defense + right.leadership) - (left.defense + left.leadership))[0]
  const flanks = best.filter(general => general !== tank).sort((left, right) => power(right) - power(left))
  const ordered = best.length === 3 ? [flanks[0], tank, flanks[1]] : best
  const next = ordered.map(general => general.id)
  const changed = next.join() !== state.formation.join() ? 1 : 0
  state.formation = next
  const bond = bondFor(next)
  state.lastNotice = `자동 편성 완료 · ${ordered.map(general => general.name).join(' · ')}${bond ? ` · 인연 「${bond.name}」` : ''} · 편성 전투력 ${formatNumber(totalPower(state))}`
  return { ok: true, message: state.lastNotice, changed }
}
