import { OFFICIAL_LAUNCH } from '../../server/launch.mjs'
import { SQUAD_LABELS, squadIds, squadOf, squadPower } from '../game/squads'
import { raidBossDeck, raidBossFor } from '../game/raid'
import { RAID_REWARDS, raidWeekKey } from '../../server/raid.mjs'
import { EQUIPMENT_PRESET_SLOTS, EQUIPMENT_STORAGE_WARN, bulkDismantlePreview, dismantlableCount, dismantleYield, equipmentOwners } from '../game/equipment-manage'
import { TUTORIAL_REWARD, TUTORIAL_STEPS, nextTutorialStep, tutorialFinished, DAILY_BONUS, DAILY_BONUS_ID, MISSIONS, dailyBonusReady, ensureMissions, missionStatus, rewardText, type MissionDef } from '../game/missions'
import { packageBonus, shopNeeds, shopPackages, type ShopPackage, type ShopResource } from '../game/shop'
import { effectsSetting, muteSetting, musicSetting, qualitySetting, setEffectsSetting, setMusicSetting, setMuteSetting, setQualitySetting, setSfxSetting, sfxSetting, type EffectsSetting, type QualitySetting, type SoundLevel } from '../game/settings'
import { sound } from '../engine/sound'
import { RESEARCH_BRANCHES, canPay, activeResearch, formatDuration, researchStatus, researchSummary, rushCost } from '../game/research'
import { LEVEL_RESET_GOLD, levelResetRefund, growthWeights, affordableUpgrades, upgradeCost, templateGeneral, MYTHIC_FRAGMENT_COST, dayKey, CITY_ADJACENCY, FACTION_CAPITALS, EQUIPMENT_GRADE_META, EQUIPMENT_SET_META, EQUIPMENT_TYPE_META, FACTION_WAR_GOLD_REWARD, FACTION_WAR_HONOR_COST, GOLD_PACKAGES, GOLD_PURCHASE_ENABLED, GRADE_META, MYTHIC_EVENT_EQUIPMENT, MYTHIC_SHOP_EQUIPMENT, capitalFactionForCity, cityWallCapacity, conquestEligibility, duelAttemptsRemaining, RESOURCE_META, allGenerals, equipmentInventoryCount, equipmentSetCounts, equipmentSpecialty, skillDetail, type City, type CityBuilding, type Equipment, type EquipmentGrade, type EquipmentType, type Faction, type General, type Role, type ResearchNode, type Section, type StrategyState, buildingCost, buildingDurationMs, cityIncome, combatPower, conquestCost, conquestPower, equipmentBonus, equipmentCost, recruitCost, equipmentValue, formatNumber, incomeCooldownRemaining, researchCost, skillPower, skillRank, skillUnlockLevel, MAX_GENERAL_LEVEL, isMaxLevel } from '../game/strategy'
import type { BattleOpponent, BattleSnapshot, UnitEffectChip } from '../game/arena'
import { ATTENDANCE_REWARDS, type AttendanceReward } from '../../server/attendance.mjs'
import { HARD_LEVEL_BONUS, HARD_RULE_INFO, SCENARIOS, hardClearReward, hardCleared, hardClearedCount, hardScenarioStars, hardUnlocked, scenarioEnemyIds, scenarioEnemyLevel, scenarioEnemyLevelFor, scenarioHardRule, scenarioStars, type ScenarioDifficulty } from '../game/scenarios'
import { matchup, type BattleResult } from '../game/battle-core'
import { BATTLE_EFFECTS, type BattleEffectId } from '../game/battle-effects'
import { skillDefFor, type SkillFx } from '../game/skills'
import { ARCHETYPE_META, recommendDecks, type ComboAdvice } from '../game/formation-advice'
import { ensureIconSprite, icon, type IconName } from './icons'
import { playForgeCeremony, playSummonCeremony } from './summon-ceremony'

const POWER_MARK_KEY = 'cheonharo.powerMark'
import { TerritoryMapController, type MapCity } from './territory-map'
import { isEnglish, locale, setLang } from '../i18n/lang'
import { tr } from '../i18n/translate'
import { maybeShowIntro } from './coach'

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character))
const equipmentImage = (type: EquipmentType): string => `/assets/equipment/${type}.webp`
/** 상점 구매 기록(이 기기 · 최근 10건) */
export function readPurchaseLog(): Array<{ text: string; at: number }> {
  try { const value = JSON.parse(localStorage.getItem('cheonharo.purchases') ?? '[]'); return Array.isArray(value) ? value.slice(0, 10) : [] } catch { return [] }
}
export function recordPurchase(text: string): void {
  try { localStorage.setItem('cheonharo.purchases', JSON.stringify([{ text, at: Date.now() }, ...readPurchaseLog()].slice(0, 10))) } catch { /* 저장 불가 */ }
}
const STAT_LABEL: Record<string, string> = { leadership: '통솔', martial: '무력', stratagem: '모략', speed: '속도' }
type RosterSort = 'power' | 'level' | 'grade' | 'name' | 'role'
type EquipmentSort = 'grade' | 'level' | 'name'
type FormationSort = 'power' | 'grade'

// 도시 위치: 삼국시대 치소의 실제 경위도를 지도 그림 좌표(%)로 옮긴 값.
// scripts/map/geo-fit.py가 해안·섬·강·분지 기준점 18곳으로 그림의 원근 왜곡을 맞춰 계산한다.
// 예외: 신도(xindu)는 실제로는 성도 바로 옆이라 성이 겹쳐, 성도 동남쪽으로 떼어 놓았다(손으로 고친 값).
// 예외: 남해(nanhai)는 그림의 주강 하구에, 건안(jianan)은 그림의 해안선에 맞춰 손으로 옮겼다(2026.10.17).
// 예외: 성이 겹쳐 이름이 가려지던 곳(운남·영창, 낭야, 수춘·합비·여강, 완성·신야·양양, 복양, 광릉)은 조금씩 떼어 놓았다(2026.10.17).
const CITY_MAP_POSITIONS: Readonly<Record<string, { x: number; y: number }>> = {
  chengdu: { x: 29.8, y: 44.7 }, xindu: { x: 33.6, y: 46.8 }, fucheng: { x: 31.8, y: 42.0 }, hanzhong: { x: 37.5, y: 37.2 }, badong: { x: 44.8, y: 48.2 },
  jianning: { x: 27.4, y: 65.8 }, yunnan: { x: 20.5, y: 62.5 }, yongchang: { x: 16.0, y: 64.8 }, jiaozhi: { x: 32.9, y: 85.7 }, nanhai: { x: 61.0, y: 81.5 }, shixing: { x: 59.1, y: 75.6 },
  guiyang: { x: 57.0, y: 72.2 }, lingling: { x: 52.3, y: 69.6 }, changsha: { x: 56.1, y: 63.1 }, wuling: { x: 51.9, y: 58.9 }, jiangling: { x: 53.2, y: 53.3 },
  yiling: { x: 50.3, y: 51.0 }, jiangxia: { x: 59.7, y: 53.1 }, xiangyang: { x: 53.8, y: 45.8 }, xinye: { x: 51.4, y: 41.8 }, wancheng: { x: 55.4, y: 38.6 },
  shangyong: { x: 46.6, y: 43.1 }, xuchang: { x: 58.0, y: 33.6 }, luoyang: { x: 53.8, y: 30.8 }, chenliu: { x: 60.8, y: 29.7 }, puyang: { x: 62.9, y: 26.0 },
  ye: { x: 60.2, y: 22.3 }, jinyang: { x: 52.9, y: 17.3 }, pingyuan: { x: 66.3, y: 19.9 }, bohai: { x: 67.1, y: 16.8 }, beihai: { x: 75.1, y: 22.0 }, langya: { x: 74.2, y: 28.2 },
  xiapi: { x: 71.5, y: 33.2 }, guangling: { x: 77.4, y: 38.6 }, jianye: { x: 74.3, y: 42.5 }, wujun: { x: 80.9, y: 45.7 }, kuaiji: { x: 81.5, y: 51.8 }, jianan: { x: 80.3, y: 69.6 },
  hefei: { x: 70.4, y: 42.4 }, shouchun: { x: 66.5, y: 40.0 }, lujiang: { x: 68.6, y: 47.8 }, jiujiang: { x: 65.4, y: 54.4 }, poyang: { x: 67.9, y: 56.6 },
  changan: { x: 41.9, y: 33.0 }, meixian: { x: 38.9, y: 32.6 }, anding: { x: 37.0, y: 26.1 }, tianshui: { x: 32.4, y: 29.0 }, wuwei: { x: 23.9, y: 14.4 },
}

// 후한 말 13주(州) 이름표 위치 (같은 방식으로 계산)
const MAP_REGION_LABELS: ReadonlyArray<{ id: string; name: string; hanja: string; x: number; y: number }> = [
  { id: 'liangzhou', name: '양주', hanja: '涼州', x: 22.2, y: 17.8 },
  { id: 'yongzhou', name: '옹주', hanja: '雍州', x: 38.2, y: 28.4 },
  { id: 'bingzhou', name: '병주', hanja: '幷州', x: 52.2, y: 14.5 },
  { id: 'jizhou', name: '기주', hanja: '冀州', x: 63.4, y: 17.7 },
  { id: 'qingzhou', name: '청주', hanja: '青州', x: 72.0, y: 21.2 },
  { id: 'sili', name: '사례', hanja: '司隷', x: 50.4, y: 30.3 },
  { id: 'yanzhou', name: '연주', hanja: '兗州', x: 65.8, y: 26.1 },
  { id: 'yuzhou', name: '예주', hanja: '豫州', x: 61.6, y: 35.6 },
  { id: 'xuzhou', name: '서주', hanja: '徐州', x: 73.6, y: 34.0 },
  { id: 'yangzhou', name: '양주', hanja: '揚州', x: 72.1, y: 49.9 },
  { id: 'jingzhou', name: '형주', hanja: '荊州', x: 52.1, y: 56.5 },
  { id: 'yizhou', name: '익주', hanja: '益州', x: 32.6, y: 52.4 },
  { id: 'jiaozhou', name: '교주', hanja: '交州', x: 48.1, y: 81.0 },
]

/** 휴대폰 하단 탭에 늘 보이는 메뉴(나머지는 ‘더보기’) */
const MOBILE_TABS: Section[] = ['overview', 'roster', 'formation', 'recruit', 'battle']
/** 휴대폰에서 쓰는 짧은 메뉴 이름(한·영을 직접 고른다: ‘장비’ 같은 말이 사전에서 인물 이름으로 바뀌지 않게) */
const SHORT_NAV: Record<string, [string, string]> = {
  overview: ['본영', 'Base'], roster: ['무장', 'Generals'], codex: ['도감', 'Codex'], formation: ['편성', 'Lineup'], recruit: ['모집', 'Recruit'], equipment: ['장비', 'Gear'], research: ['연구', 'Research'], territory: ['영토', 'Territory'],
  battle: ['전투', 'Battle'], duel: ['대련', 'Duel'], raid: ['레이드', 'Raid'], rank: ['랭킹', 'Ranks'], board: ['게시판', 'Board'], shop: ['상점', 'Shop'], updates: ['소식', 'News'], account: ['계정', 'Account'], admin: ['관리', 'Admin'], balance: ['밸런스', 'Balance'],
}
/** 무장 사진 테두리·카드 강조색: 무장마다 다르던 색 대신 등급색으로 통일 */
const gradeColor = (general: Pick<General, 'grade' | 'accent'>) => GRADE_META[general.grade]?.color ?? general.accent
const shortNavLabel = (key: string) => { const pair = SHORT_NAV[key]; return pair ? `<span class="nav-short" data-no-tr>${isEnglish() ? pair[1] : pair[0]}</span>` : '' }

/** 사용자가 쓴 글·이름: 번역하지 않는다 */
const ugc = (text: string) => `<span data-no-tr>${escapeHtml(text)}</span>`

/** 상단 재화: 10만 이상은 만·억 단위로 짧게(정확한 값은 마우스를 올리면 보인다) */
function compactNumber(value: number): string {
  const n = Math.floor(value)
  if (n < 100_000) return formatNumber(n)
  if (isEnglish()) return n < 1_000_000 ? `${Math.floor(n / 1000)}K` : `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}M`
  if (n < 100_000_000) return `${(n / 10_000).toFixed(n < 1_000_000 ? 1 : 0).replace(/\.0$/, '')}만`
  return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, '')}억`
}

/** 로그인 버튼 안쪽: 이름은 길면 말줄임, 로그아웃은 항상 보인다 */
function authButtonInner(auth: { status: string; name?: string | null }): string {
  if (auth.status === 'authenticated') return `<span class="auth-name"${auth.name ? ' data-no-tr' : ''}>${escapeHtml(auth.name ?? '장군')}</span><span class="auth-out">로그아웃</span>`
  return auth.status === 'offline' ? '오프라인 모드' : 'Manus 로그인'
}

export interface LuoyangHistory {
  weeks: Array<{ weekKey: string; winnerFaction: '촉한' | '위나라' | '오나라' | null }>
  factions: Array<{ faction: '촉한' | '위나라' | '오나라'; damage: number; battles: number }>
  top: Array<{ displayName: string; faction: string; totalDamage: number }>
}

export interface AuthView {
  status: 'authenticated' | 'logged_out' | 'offline'
  name: string | null
}

export interface AccountView {
  id: number
  openId: string
  name: string
  email: string
  loginMethod: string
  role: string
  createdAt: string | Date
  updatedAt: string | Date
  lastSignedIn: string | Date
  /** 운영자(관리자 권한) 계정: 랭킹 · 영토전에 반영되지 않는다 */
  operator?: boolean
}

/** 관리자가 고칠 수 있는 숫자 칸 */
export const ADMIN_GAME_FIELDS = [
  ['재화', [['honor', '옥패'], ['silver', '은전'], ['gold', '금화'], ['manuals', '병서']]],
  ['신화 장비', [['mythicFragments', '신화 조각'], ['mythicStones', '낙양 강화석']]],
  ['전적 · 세력전', [['wins', '승리'], ['battleScore', '최고 점수'], ['factionWarScore', '세력전 공헌도'], ['luoyangBoxes', '낙양 상자']]],
  ['내정 자원', [['grain', '식량'], ['wood', '목재'], ['iron', '철'], ['influence', '영향력']]],
] as const
export type AdminGameField = typeof ADMIN_GAME_FIELDS[number][1][number][0]
export type AdminGameEdit = { userId: number; faction?: '촉한' | '위나라' | '오나라' } & Partial<Record<AdminGameField, number>>

export interface GameAccountView extends AccountView {
  game: {
    userId: number
    honor: number
    silver: number
    gold: number
    manuals: number
    wins: number
    battleScore: number
    grain: number
    wood: number
    iron: number
    influence: number
    mythicFragments?: number
    mythicStones?: number
    factionWarScore?: number
    luoyangBoxes?: number
    faction?: '촉한' | '위나라' | '오나라'
    factionChosen?: boolean
    generalCount?: number
    maxLevel?: number
    scenarioCleared?: number
    hardCleared?: number
    updatedAt: string | Date
  }
}

export interface RankEntry {
  rank: number
  displayName: string
  score: number
}

export interface BoardPost {
  id: number
  board: '전체' | Faction
  title: string
  content: string
  authorName: string
  authorFaction: Faction
  createdAt: string | Date
  canDelete?: boolean
}

export interface AdminBoardState {
  postingEnabled: boolean
  posts: BoardPost[]
}
export interface CityDamageRanking {
  userId: number
  faction: Faction
  displayName: string
  totalDamage: number
  battleCount: number
  updatedAt: string | Date
}

export interface RaidInfoView {
  weekKey: string
  bossLevel: number
  registered: number
  participants: number
  attemptsLeft: number
  dailyLimit: number
  totalDamage: number
  bestDamage: number
  attempts: number
  rank: number
  lastWeek: { weekKey: string; totalDamage: number; rank: number; reward: { gold: number; stones: number }; claimed: boolean } | null
  /** 게스트·서버 연결 실패: 연습 모드 */
  offline: boolean
  resetIn: number
}
export interface RaidView {
  loading: boolean
  info: RaidInfoView | null
  ranking: Array<{ rank: number; displayName: string; totalDamage: number; attempts: number; isMe: boolean }>
  message: string
}

export interface DuelOpponent {
  id: string
  displayName: string
  score: number
  isDummy: boolean
  /** 덱 전력(server/duel-match.mjs) */
  power?: number
  /** 난이도(승리 보상: 쉬움 1 · 보통 2 · 어려움 3 조각) */
  tier?: 'easy' | 'normal' | 'hard'
  deck?: General[]
  /** 훈련 상대 설명(난이도 · 평균 레벨) */
  note?: string
}

export interface StrategyUiCallbacks {
  onSection: (section: Section) => void
  onRecruit: (count: number) => void
  onUpgrade: (id: string) => void
  onSkill: (id: string) => void
  onFormation: (id: string) => void
  onFormationSlot: (id: string, slot: number) => void
  onUpgradeMany: (id: string) => void
  /** 레벨 초기화(금화 10 · 재화 80% 반환) */
  onLevelReset: (id: string) => void
  onAutoFormation: (withEquipment: boolean) => void
  onAutoEquip: () => void
  /** 추천 덱으로 편성(좌·중·우 순서) */
  onApplyCombo: (ids: string[], squad?: number) => void
  onEquipmentDraw: (count: number) => void
  onEquipmentEnhance: (id: string) => void
  onEquipmentEquip: (generalId: string, itemId: string) => void
  onEquipmentUnequip: (generalId: string, type: EquipmentType) => void
  onEquipmentLock: (id: string) => void
  onSquadToggle: (squad: number, id: string) => void
  onRaidStart: () => void
  onRaidRefresh: () => void
  onRaidClaim: () => void
  onSquadAuto: (squad: number, withEquipment: boolean) => void
  onSquadEquip: (squad: number) => void
  onSquadSwap: (squad: number) => void
  onEquipmentDismantle: (id: string, count: number) => void
  onEquipmentBulkDismantle: (grade: 'normal' | 'rare' | 'unique') => void
  onEquipmentPreset: (generalId: string, slot: number, mode: 'save' | 'apply') => void
  onEquipmentSelectGeneral: (id: string) => void
  onCitySelect: (id: string) => void
  onCityDamageRankingRefresh: (cityId: string) => void
  onTerritoryRefresh: () => void
  onConquest: (id: string) => void
  onDefense: (id: string) => void
  onGarrisonDeploy: (id: string) => void
  onFactionBattle: (id: string) => void
  onCollectIncome: () => void
  onBuildingUpgrade: (cityId: string, buildingId: string) => void
  onBuildingRush: (cityId: string) => void
  onBuildingCancel: (cityId: string) => void
  onResearch: (id: string) => void
  onResearchCancel: () => void
  onMissionClaim: (id: string) => void
  /** 처음 시작 안내: 보상 받기(false) · 닫기(true) */
  onTutorial: (skip: boolean) => void
  /** 전투 효과 설정이 바뀜 */
  onEffectsSetting?: () => void
  onResearchRush: () => void
  onBattleStart: () => void
  onScenarioStart: (id: string, difficulty?: ScenarioDifficulty) => void
  onBattleMove: (index: number) => void
  onBattleSkill: (index?: number) => void
  onBattleSpeed: (speed: number) => void
  onBattleAuto: (on: boolean) => void
  onBattleAutoSkill: (on: boolean) => void
  onBattlePause: (on: boolean) => void
  /** 전투 규칙 그림 설명 열기 */
  onBattleGuide: () => void
  /** 따라하기 안내를 처음부터 다시 */
  onCoachReset: () => void
  /** 이 기기의 게스트 기록을 지우고 처음부터 */
  onGuestReset: () => void
  onBattleStop: () => void
  onBattleTactic: (tactic: 'guard' | 'feint' | 'charge') => void
  onDuelRefresh: () => void
  onDuelStart: (opponentId: string) => void
  onFactionSelect: (faction: Faction) => void
  onGuestLogin: () => void
  /** 서버 없이 이 기기에만 저장하는 게스트(서버에 연결할 수 없을 때) */
  onLocalGuestLogin: () => void
  onLogin: () => void
  onLogout: () => void
  onAccountRefresh: () => void
  onAccountSave: (name: string) => void
  onRankRefresh: () => void
  onBoardRefresh: (board: BoardPost['board']) => void
  onBoardPost: (board: BoardPost['board'], title: string, content: string, password: string) => void
  onBoardDelete: (id: number, password: string) => void
  onStore: () => void
  onShopPurchase: (equipmentId: string) => void
  onCashShopPurchase: (productId: string) => void
  onHonorShopPurchase: (packageId: string) => void
  onGoldPurchase: (packageId: string) => void
  onAdminAction: (action: string) => void
  onAdminAccountsRefresh: (search?: string) => void
  onAdminRoleChange: (id: number, role: 'user' | 'admin') => void
  onAdminGameDataRefresh: () => void
  onAdminGameDataSave: (data: AdminGameEdit) => void
  onAdminBoardRefresh: () => void
  onAdminBoardPostingToggle: (enabled: boolean) => void
  onAdminBoardDelete: (id: number) => void
}

type CityFilter = 'all' | 'front' | 'ally' | 'enemy' | 'neutral'

/** 보유 무장 능력치 설명(누르면 펼쳐짐) — battle-core.ts의 계산과 맞춘다 */
const STAT_INFO = {
  leadership: { title: '통솔', body: '최대 병력이 늘어나고 일반 공격에도 조금 더해집니다. 통솔 · 수호 · 치유형 스킬의 위력과 통솔형 무장의 일반 공격은 통솔로 정해집니다. 장비로 오른 통솔은 방어력도 높입니다.' },
  martial: { title: '무력', body: '돌격 · 사격 · 수호형 무장의 일반 공격 피해가 커지고, 돌격 · 사격형 스킬의 위력이 무력으로 정해집니다. 장비로 오른 무력은 공격력도 높입니다.' },
  stratagem: { title: '모략', body: '계략 · 치유형 무장의 일반 공격 피해가 커지고, 계략형 스킬(화계 · 혼란 같은 디버프)의 위력이 모략으로 정해집니다.' },
  speed: { title: '속도', body: '일반 공격 간격이 짧아집니다(빠를수록 줄어드는 폭은 조금씩 작아짐). 전장 평균보다 빠르면 전투 시작 때 첫 스킬이 더 빨리 준비됩니다.' },
} as const

export class StrategyUI {
  private readonly root: HTMLElement
  private readonly callbacks: StrategyUiCallbacks
  private ranks: RankEntry[] = []
  private boardPosts: BoardPost[] = []
  private boardTab: BoardPost['board'] = '전체'
  private duelOpponents: DuelOpponent[] = []
  private raidView: RaidView = { loading: false, info: null, ranking: [], message: '' }
  private duelMyPower = 0
  private latestBattle: BattleSnapshot | null = null
  private unitLocator: ((side: 'player' | 'enemy', lane: number) => { x: number; y: number } | null) | null = null
  private recruitAnimationActive = false
  private auth: AuthView = { status: 'logged_out', name: null }
  private account: AccountView | null = null
  private adminTab = 'overview'
  private adminFilter = 'all'
  private adminPublished = true
  private adminAccounts: AccountView[] = []
  private adminAccountsError: string | null = null
  private adminAccountSearch = ''
  private adminGameAccounts: GameAccountView[] = []
  private adminGameDataError: string | null = null
  private adminGameSearch = ''
  private adminBoard: AdminBoardState = { postingEnabled: true, posts: [] }
  private cityDamageRankings: CityDamageRanking[] = []
  private luoyangHistory: LuoyangHistory | null = null
  /** 처음 시작 안내: 다음에 가야 할 메뉴(반짝임) */
  private coachSection: string | null = null
  private cityDamageRankingCityId = ''
  private rosterSort: RosterSort = 'power'
  private rosterSortDescending = true
  private rosterFilter: 'all' | '5' | '4' | Role = 'all'
  private codexFilter: 'all' | 'owned' | 'missing' | '5' | '4' | Role = 'all'
  private codexQuery = ''
  private formationSort: FormationSort = 'power'
  private formationSortDescending = true
  /** 편성 화면에서 보는 군(0=1군, 1=2군, 2=3군) */
  private formationSquad = 0
  /** 추천 덱을 볼 무장(없으면 출전 첫 무장) */
  private comboAnchorId: string | null = null
  private comboCache = new Map<string, ComboAdvice[]>()
  private renderedState: StrategyState | null = null
  private summonTab: 'generals' | 'equipment' = 'generals'
  private equipmentSort: EquipmentSort = 'grade'
  private equipmentSortDescending = true
  /** 보관함 필터: 부위 · 세트 · 등급 · 장착 여부 */
  private equipmentFilter: { type: string; set: string; grade: string; owner: string } = { type: 'all', set: 'all', grade: 'all', owner: 'all' }
  /** 장비 관리: 접어 둔 칸(프리셋 · 세트 능력 / 필터 · 일괄 분해)을 펼쳤는가 — 다시 그려도 유지 */
  private equipmentMoreOpen = false
  private equipmentFilterOpen = false
  private equipmentScrollTop = 0
  private equipmentScrollFrame: number | null = null
  private equipmentIndexSource: Equipment[] | null = null
  private equipmentIndex = new Map<string, Equipment>()
  private equipmentSortCache: { key: string; items: Equipment[] } | null = null
  private readonly equipmentRowHeight = 168
  private shopTab: 'gold' | 'resources' | 'mythic' = 'resources'
  /** 튜토리얼: 10회 모집을 무료로 보여 준다 */
  private freeRecruit = false
  private territorySyncText = '영토 정보 확인 전'
  private scenarioSelectedId = SCENARIOS[0]?.id ?? ''
  /** 이번 접속에서 시나리오를 직접 골랐는지(안 골랐으면 다음에 깰 시나리오를 자동 선택) */
  private scenarioPicked = false
  /** 시나리오 화면에서 마지막으로 본 클리어 수(새로 깨면 다음 단계로 넘어간다). -1이면 처음 */
  private scenarioClearedSeen = -1
  private scenarioListOpen = false
  /** 시나리오 난이도 보기(보통 · 어려움) */
  private scenarioDifficulty: ScenarioDifficulty = 'normal'
  private lastSection = ''
  private boardComposeOpen = false
  private battleViewActive = false
  // 영토 지도: 확대·이동 상태는 다시 그려도 유지된다.
  private readonly territoryMap = new TerritoryMapController(id => {
    this.citySheetOpen = true
    this.callbacks.onCitySelect(id)
  })
  private citySheetOpen = false
  private battleAutoAvailable = false
  private battleLogOpen = false
  private noticeSeen: string | undefined
  private noticeAt = 0
  private powerMarked = false
  private longPressTimer = 0
  private suppressMoveUntil = 0
  private stopConfirmUntil = 0
  private cityFilter: CityFilter = 'all'
  private cityQuery = ''

  constructor(root: HTMLElement, callbacks: StrategyUiCallbacks) {
    this.root = root
    this.callbacks = callbacks
    root.addEventListener('click', this.handleClick)
    root.addEventListener('change', this.handleChange)
    root.addEventListener('submit', this.handleSubmit)
    root.addEventListener('scroll', this.handleScroll, true)
    root.addEventListener('input', this.handleInput)
    root.addEventListener('pointerdown', this.handleUnitPress)
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(type, this.cancelUnitPress)
    root.addEventListener('contextmenu', event => { if ((event.target as HTMLElement).closest('[data-bt-unit]')) event.preventDefault() })
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.territoryMap.fullscreen) this.territoryMap.setFullscreen(false)
    })
  }

  /** 연구 화면의 남은 시간·진행 막대·즉시 완료 비용만 고친다(전체 다시 그리기 없음) */
  /** 내정 공사 남은 시간만 갱신(1초마다) */
  updateBuildTimers(): void {
    const now = Date.now()
    this.root.querySelectorAll<HTMLElement>('[data-build-left]').forEach(el => { el.textContent = formatDuration(Math.max(0, Number(el.dataset.buildLeft) - now)) })
    this.root.querySelectorAll<HTMLElement>('[data-build-bar]').forEach(el => { const left = Math.max(0, Number(el.dataset.buildBar) - now); el.style.width = `${Math.min(100, (1 - left / Math.max(1, Number(el.dataset.buildTotal))) * 100).toFixed(1)}%` })
    this.root.querySelectorAll<HTMLElement>('[data-build-rush]').forEach(el => { el.textContent = `즉시 완공 · 금화 ${rushCost(Math.max(0, Number(el.dataset.buildRush) - now))}` })
  }

  updateResearchTimer(state: StrategyState): void {
    const active = activeResearch(state)
    if (!active || active.endsAt === undefined) return
    const remaining = Math.max(0, active.endsAt - Date.now())
    const remainingEl = this.root.querySelector<HTMLElement>('[data-research-remaining]')
    if (!remainingEl) return
    remainingEl.textContent = formatDuration(remaining)
    const bar = this.root.querySelector<HTMLElement>('[data-research-progress]')
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, (1 - remaining / active.durationMs) * 100)).toFixed(1)}%`
    const rush = this.root.querySelector<HTMLElement>('[data-research-rush]')
    if (rush) rush.textContent = `즉시 완료 · 금화 ${rushCost(remaining)}`
    const card = this.root.querySelector<HTMLElement>('.research-node.is-active .research-running')
    if (card) card.textContent = `연구 중 · ${formatDuration(remaining)}`
  }

  render(state: StrategyState): void {
    // 효과 줄임 설정을 CSS에서도 알 수 있게(카드 오라 등 반복 효과를 멈춘다)
    document.documentElement.dataset.fx = effectsSetting()
    this.coachSection = nextTutorialStep(state)?.section ?? null
    if (this.noticeSeen !== undefined && this.noticeSeen !== state.lastNotice) this.noticeAt = Date.now()
    this.noticeSeen = state.lastNotice
    const previousSection = this.renderedState?.section
    this.renderedState = state
    if (previousSection === 'equipment' && state.section === 'equipment') {
      const section = this.root.querySelector<HTMLElement>('.page-section--equipment')
      if (section) {
        const scroll = this.root.querySelector<HTMLElement>('[data-equipment-scroll]')
        const scrollTop = scroll?.scrollTop ?? this.equipmentScrollTop
        section.outerHTML = this.equipmentSection(state)
        window.requestAnimationFrame(() => {
          const nextScroll = this.root.querySelector<HTMLElement>('[data-equipment-scroll]')
          if (nextScroll) nextScroll.scrollTop = scrollTop
        })
        return
      }
    }
    // ‘모집 · 장비’ 메뉴에 새로 들어오면 언제나 무장 모집 탭부터
    if (state.section === 'recruit' && this.lastSection !== 'recruit') this.summonTab = 'generals'
    if (state.section !== 'equipment') this.equipmentScrollTop = 0
    if (state.section !== 'battle') this.battleViewActive = false
    else if (this.latestBattle?.active) this.battleViewActive = true // 전투가 진행 중이면 그리는 순서와 관계없이 전투 화면
    const enteringScenario = state.section === 'battle' && this.lastSection !== 'battle'
    // 상태 객체를 그대로 고쳐 쓰므로 이전 메뉴는 따로 기억해 둔 값으로 비교한다
    const sameSection = this.lastSection === state.section
    this.lastSection = state.section
    if (enteringScenario && !this.scenarioPicked) this.scenarioSelectedId = this.nextScenario(state)?.id ?? this.scenarioSelectedId
    // 같은 메뉴 안에서 버튼을 눌러 다시 그릴 때는 보던 자리(스크롤)와 펼친 칸을 그대로 둔다
    const kept = sameSection ? this.captureView() : null
    this.root.innerHTML = this.shell(state)
    if (kept) this.restoreView(kept)
    ensureIconSprite()
    // 시나리오 목록에 들어오면 고른(다음에 깰) 시나리오가 보이게 스크롤
    if (enteringScenario) window.requestAnimationFrame(() => this.root.querySelector('.scenario-card.is-selected')?.scrollIntoView({ block: 'center' }))
    this.attachTerritoryMap(state)
    const shell = this.root.querySelector<HTMLElement>('.app-shell')
    if (shell && !sameSection) {
      shell.classList.add('is-entering')
      window.requestAnimationFrame(() => shell.classList.remove('is-entering'))
    }
    if (this.latestBattle) this.updateBattle(this.latestBattle)
    this.watchTopbar()
    this.tidyChrome()
  }

  /** 꾸밈 기호(→ ↗ ✦ ↻ …)를 버튼에서 걷어 내고, 제목 아래 설명 문장은 (i) 안으로 접는다 */
  private tidyChrome(): void {
    const ornament = /^[\s→↗✦↻✎⚒⌁⌖›»]+$/
    this.root.querySelectorAll<HTMLElement>('.main-content button, .main-content a.action-button, .topbar button').forEach(button => {
      if (button.closest('.page-section--battle .bt-tactic-row, [data-bt-unit], .bt-hud, .bt-callout, [data-keep-glyph]')) return
      button.querySelectorAll('span, b, em').forEach(node => { if (node.childElementCount === 0 && ornament.test(node.textContent ?? '')) node.remove() })
      for (const node of [...button.childNodes]) {
        if (node.nodeType !== Node.TEXT_NODE) continue
        const text = node.textContent ?? ''
        const cleaned = text.replace(/\s*[→↗↻›»]\s*$/, '').replace(/^\s*[✦⚒✎]\s+/, '')
        if (cleaned !== text) node.textContent = cleaned
      }
    })
    this.root.querySelectorAll<HTMLElement>('.section-heading, .summon-menu-head').forEach(heading => {
      const copy = heading.querySelector<HTMLElement>('.heading-copy')
      const title = heading.querySelector('h1')
      if (!copy || !title || heading.querySelector('.heading-info')) return
      const info = document.createElement('button')
      info.className = 'heading-info'
      info.type = 'button'
      info.setAttribute('aria-label', '설명 보기')
      info.textContent = 'i'
      info.addEventListener('click', event => { event.stopPropagation(); heading.classList.toggle('is-info-open') })
      title.appendChild(info)
    })
  }


  /** 화면 상태 기록: 스크롤 위치(세로·가로)와 펼친 칸 */
  private captureView(): { scroll: Array<[string, number, number]>; open: string[]; windowY: number } {
    const scroll: Array<[string, number, number]> = []
    const keyOf = (element: Element) => {
      const parts: string[] = []
      for (let node: Element | null = element; node && node !== this.root; node = node.parentElement) {
        const parent: Element | null = node.parentElement
        const index = parent ? Array.prototype.indexOf.call(parent.children, node) : 0
        parts.unshift(`${node.tagName}.${(node.getAttribute('class') ?? '').split(' ')[0]}:${index}`)
      }
      return parts.join('>')
    }
    this.root.querySelectorAll<HTMLElement>('*').forEach(element => {
      if (element.scrollTop > 0 || element.scrollLeft > 0) scroll.push([keyOf(element), element.scrollTop, element.scrollLeft])
    })
    const open = [...this.root.querySelectorAll('details[open]')].map(keyOf)
    return { scroll, open, windowY: window.scrollY }
  }

  private restoreView(view: { scroll: Array<[string, number, number]>; open: string[]; windowY: number }): void {
    const find = (key: string): HTMLElement | null => {
      let node: Element | null = this.root
      for (const part of key.split('>')) {
        const index = Number(part.slice(part.lastIndexOf(':') + 1))
        node = node?.children[index] ?? null
        if (!node) return null
      }
      return node as HTMLElement
    }
    view.open.forEach(key => { const element = find(key); if (element instanceof HTMLDetailsElement) element.open = true })
    const apply = () => {
      view.scroll.forEach(([key, top, left]) => { const element = find(key); if (element) { element.scrollTop = top; element.scrollLeft = left } })
      if (view.windowY) window.scrollTo(0, view.windowY)
    }
    apply()
    // 그림·글꼴이 늦게 자리를 잡아도 한 번 더 맞춘다
    window.requestAnimationFrame(apply)
  }

  private topbarObserver: ResizeObserver | null = null
  /** 휴대폰 상단 바 높이(글자 크기·줄바꿈에 따라 달라짐)를 본문 위 여백에 반영한다 */
  private watchTopbar(): void {
    const topbar = this.root.querySelector<HTMLElement>('.topbar')
    if (!topbar || typeof ResizeObserver === 'undefined') return
    const apply = () => document.documentElement.style.setProperty('--mobile-top', `${Math.ceil(topbar.getBoundingClientRect().height)}px`)
    this.topbarObserver?.disconnect()
    this.topbarObserver = new ResizeObserver(apply)
    this.topbarObserver.observe(topbar)
    apply()
  }

  setAuth(auth: AuthView): void {
    this.auth = auth
    if (auth.status !== 'authenticated') this.account = null
    const button = this.root.querySelector<HTMLElement>('[data-auth-button]')
    if (button) {
      button.innerHTML = authButtonInner(auth)
      button.title = auth.status === 'authenticated' ? `${auth.name ?? '장군'} · 로그아웃` : ''
      button.dataset.action = auth.status === 'authenticated' ? 'logout' : 'login'
    }
    const status = this.root.querySelector<HTMLElement>('[data-auth-status]')
      if (status) status.textContent = auth.status === 'authenticated' ? `${auth.name ?? '장군'} 계정으로 전적을 동기화합니다.` : auth.status === 'offline' ? '독립 실행 중 · 전투와 모집은 로컬에서 이용할 수 있습니다.' : '로그인하면 순위표에 이름을 올릴 수 있습니다.'
  }

  showAccessGate(): void {
    this.renderedState = null
    this.root.innerHTML = this.accessGate()
  }

  /** 게스트: 처음 들어올 때 아이디(표시 이름)를 정한다. onSubmit이 오류 문구를 돌려주면 그대로 보여 준다 */
  enterLocalGuest(): void { this.callbacks.onLocalGuestLogin() }

  /** 출석 체크 창: 접속하면 저절로 뜬다(오늘 받은 보상 + 37일 달력) */
  /** 출석 보상 그림: 무장은 초상, 재화는 재화 그림, 뽑기권은 옥패 · 장비 그림 */
  private attendanceArt(reward: AttendanceReward): string {
    const img = (src: string, cls = '') => `<img class="${cls}" src="${src}" alt="" loading="lazy" decoding="async" draggable="false">`
    if (reward.general) return img(`/assets/generals-realistic-webp/${reward.general}.webp`, 'is-portrait')
    if (reward.randomLegend) return `${img('/assets/ui/recruit-montage.webp', 'is-portrait')}<i class="attendance-day__mystery">?</i>`
    if (reward.freeRecruits) return `${img('/assets/ui/jade-summon.svg')}<i class="attendance-day__count">×${reward.freeRecruits}</i>`
    if (reward.freeDraws) return `${img('/assets/equipment/weapon.webp')}<i class="attendance-day__count">×${reward.freeDraws}</i>`
    if (reward.resources) return `<span class="attendance-day__trio">${img('/assets/currency/grain.webp')}${img('/assets/currency/wood.webp')}${img('/assets/currency/iron.webp')}</span>`
    const currency = reward.gold ? 'gold' : reward.silver ? 'silver' : reward.honor ? 'honor' : reward.manuals ? 'manuals' : reward.fragments ? 'mythic' : reward.stones ? 'mythic' : ''
    return currency ? img(`/assets/currency/${currency}.webp`, reward.stones ? 'is-stone' : '') : ''
  }

  showAttendance(day: number, label: string): void {
    document.querySelector('.attendance-modal')?.remove()
    const layer = document.createElement('div')
    layer.className = 'attendance-modal'
    const cell = (reward: AttendanceReward) => `<li class="attendance-day ${reward.day < day ? 'is-done' : reward.day === day ? 'is-today' : ''} ${reward.general || reward.randomLegend ? 'is-hero' : ''}"><b>${reward.day}일</b><span class="attendance-day__art">${this.attendanceArt(reward)}</span><span class="attendance-day__label">${escapeHtml(reward.label)}</span></li>`
    layer.innerHTML = `<div class="attendance-modal__panel glass-card" role="dialog" aria-label="출석 체크"><span class="eyebrow">출석 체크 이벤트 · ${day}일째</span><h2>${escapeHtml(label)}</h2><p>접속할 때마다 하루에 한 번 다음 날짜의 보상을 받습니다(한국 시간 자정에 바뀜). 첫 7일 뒤 30일 동안 이어집니다.</p><h3>첫 7일</h3><ol class="attendance-grid attendance-grid--week">${ATTENDANCE_REWARDS.filter(reward => reward.day <= 7).map(cell).join('')}</ol><h3>이어지는 30일</h3><ol class="attendance-grid">${ATTENDANCE_REWARDS.filter(reward => reward.day > 7).map(cell).join('')}</ol><button class="action-button action-button--primary attendance-modal__ok" type="button">받기 완료 <span>→</span></button></div>`
    document.body.appendChild(layer)
    layer.querySelector('.attendance-modal__ok')?.addEventListener('click', () => layer.remove())
    layer.addEventListener('click', event => { if (event.target === layer) layer.remove() })
    window.setTimeout(() => layer.querySelector('.attendance-day.is-today')?.scrollIntoView({ block: 'nearest' }), 60)
  }

  showGuestSignup(onSubmit: (name: string) => Promise<string | null>, onCancel?: () => void): void {
    document.querySelector('.guest-signup')?.remove()
    const layer = document.createElement('div')
    layer.className = 'guest-signup'
    layer.innerHTML = `<form class="guest-signup__panel glass-card"><span class="eyebrow">게스트 시작</span><h2>아이디를 정하십시오</h2><p>아이디만 정하면 회원처럼 서버에 저장되고 랭킹 · 영토전 · 대련 · 레이드 · 게시판을 모두 쓸 수 있습니다. 한글 · 영문 · 숫자 · 밑줄(_) 2~12자.</p><label><span>아이디</span><input name="name" maxlength="12" autocomplete="nickname" required placeholder="예: 상산조자룡"></label><small class="guest-signup__error" role="alert"></small><div class="guest-signup__actions">${onCancel ? '<button type="button" class="ghost-button" data-guest-cancel>뒤로</button>' : ''}<button type="submit" class="action-button action-button--primary">시작하기 <span>→</span></button></div><small class="guest-signup__note">이 기기에 게스트 계정 정보가 보관됩니다. 브라우저 데이터를 지우면 이 계정으로 다시 들어올 수 없습니다.</small></form>`
    document.body.appendChild(layer)
    const form = layer.querySelector('form')!
    const input = form.querySelector<HTMLInputElement>('input')!
    const error = form.querySelector<HTMLElement>('.guest-signup__error')!
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
    window.setTimeout(() => input.focus(), 50)
    layer.querySelector('[data-guest-cancel]')?.addEventListener('click', () => { layer.remove(); onCancel?.() })
    form.addEventListener('submit', event => {
      event.preventDefault()
      submit.disabled = true
      error.textContent = ''
      void onSubmit(input.value.trim()).then(message => {
        if (message) { error.textContent = message; submit.disabled = false; return }
        layer.remove()
      })
    })
  }

  showFactionSelection(): void {
    this.renderedState = null
    this.root.innerHTML = this.factionSelection()
    maybeShowIntro()
  }

  /** 운영자 계정이면 랭킹 · 영토전에 반영되지 않는다는 안내 */
  private operatorNote(where: string): string {
    const account = this.account
    if (!account || !(account.operator || account.role === 'admin')) return ''
    return `<p class="operator-note">운영자 계정 · ${where}</p>`
  }

  setAccount(account: AccountView | null): void {
    this.account = account
  }
  setTerritorySync(text: string): void {
    this.territorySyncText = text
    const status = this.root.querySelector<HTMLElement>('[data-territory-sync]')
    if (status) status.textContent = text
  }
  private isAdmin(): boolean {
    return this.account?.role === 'admin'
  }

  /** 밸런스 테스트 페이지: 정식 출시 전엔 모두, 출시 후엔 운영자만 */
  private canOpenBalance(): boolean {
    return !OFFICIAL_LAUNCH || this.isAdmin()
  }

  setAdminAccounts(accounts: AccountView[], error: string | null = null): void {
    this.adminAccounts = accounts
    this.adminAccountsError = error
  }

  setAdminGameAccounts(accounts: GameAccountView[], error: string | null = null): void {
    this.adminGameAccounts = accounts
    this.adminGameDataError = error
  }

  setAdminBoard(state: AdminBoardState): void {
    this.adminBoard = state
  }

  /** 신화장비 강화 성공 연출 */
  showMythicEnhance(item: Equipment): void {
    document.querySelector('.mythic-enhance-fx')?.remove()
    const overlay = document.createElement('div')
    overlay.className = 'mythic-enhance-fx'
    overlay.innerHTML = `<div class="mythic-enhance-fx__ring"></div><div class="mythic-enhance-fx__card"><img src="${equipmentImage(item.type)}" alt="" width="96" height="96"><span>신화 강화 성공</span><strong>${escapeHtml(item.name)} · Lv.${item.level}</strong><em>${STAT_LABEL[item.mainStat] ?? item.mainStat} +${equipmentValue(item)}</em></div>`
    document.body.appendChild(overlay)
    overlay.addEventListener('click', () => overlay.remove())
    window.setTimeout(() => overlay.classList.add('is-leaving'), 1900)
    window.setTimeout(() => overlay.remove(), 2400)
  }

  setLuoyangHistory(history: LuoyangHistory): void {
    this.luoyangHistory = history
    if (this.renderedState?.section === 'territory') this.render(this.renderedState)
  }

  /** 낙양전 기록 카드 */
  private luoyangHistoryCard(state: StrategyState): string {
    const history = this.luoyangHistory
    if (!history) return '<div class="glass-card luoyang-history"><div class="card-header"><div><span class="eyebrow">낙양전 기록</span><h3>역대 낙양 주인</h3></div></div><p class="luoyang-history__empty">로그인하면 역대 낙양전 결과와 진영별 공헌을 볼 수 있습니다.</p></div>'
    const totals = new Map(history.factions.map(row => [row.faction, row]))
    const max = Math.max(1, ...history.factions.map(row => Number(row.damage) || 0))
    const factions = (['촉한', '위나라', '오나라'] as const).map(faction => {
      const row = totals.get(faction)
      const damage = Number(row?.damage) || 0
      const wins = history.weeks.filter(week => week.winnerFaction === faction).length
      return `<li class="${faction === state.faction ? 'is-mine' : ''}"><span>${faction}${faction === state.faction ? ' (내 진영)' : ''}</span><i><b style="width:${damage / max * 100}%"></b></i><em>성벽 피해 ${formatNumber(damage)} · 출정 ${formatNumber(Number(row?.battles) || 0)} · 최근 ${wins}승</em></li>`
    }).join('')
    const weeks = history.weeks.length ? history.weeks.map(week => `<li><span>${week.weekKey.slice(5).replace('-', '월 ')}일</span><b class="${week.winnerFaction === state.faction ? 'is-mine' : ''}">${week.winnerFaction ?? '주인 없음'}</b></li>`).join('') : '<li><span>아직 결과가 없습니다</span></li>'
    const top = history.top.length ? history.top.map((row, index) => `<li><span>${index + 1}. ${ugc(row.displayName)}</span><small>${row.faction} · ${formatNumber(Number(row.totalDamage) || 0)}</small></li>`).join('') : ''
    return `<div class="glass-card luoyang-history"><div class="card-header"><div><span class="eyebrow">낙양전 기록</span><h3>역대 낙양 주인 · 진영 공헌</h3></div><span class="rate-note">최근 12주</span></div><ul class="luoyang-history__factions">${factions}</ul><div class="luoyang-history__cols"><div><h4>주간 승자</h4><ul class="luoyang-history__weeks">${weeks}</ul></div>${top ? `<div><h4>공헌 상위 장수</h4><ul class="luoyang-history__top">${top}</ul></div>` : ''}</div></div>`
  }

  setCityDamageRankings(cityId: string, rankings: CityDamageRanking[]): void {
    this.cityDamageRankingCityId = cityId
    this.cityDamageRankings = rankings
    if (this.renderedState?.section === 'territory') this.render(this.renderedState)
  }

  setRanks(ranks: RankEntry[]): void {
    this.ranks = ranks
    const panel = this.root.querySelector<HTMLElement>('[data-rank-list]')
    if (panel) panel.innerHTML = this.rankRows()
  }
  setBoardPosts(posts: BoardPost[], board: BoardPost['board']): void {
    this.boardPosts = posts
    this.boardTab = board
    if (this.renderedState?.section === 'board') this.render(this.renderedState)
  }

  setRaidView(view: RaidView): void {
    this.raidView = view
    if (this.renderedState?.section === 'raid') this.render(this.renderedState)
  }

  setDuelOpponents(opponents: DuelOpponent[], myPower = 0): void {
    this.duelOpponents = opponents
    this.duelMyPower = myPower
    if (this.renderedState?.section === 'duel') this.render(this.renderedState)
  }

  notify(message: string, tone: 'jade' | 'ember' = 'jade'): void {
    const toast = this.root.querySelector<HTMLElement>('[data-toast]')
    if (!toast) return
    toast.textContent = message
    toast.dataset.tone = tone
    if (tone === 'ember') sound.play('error')
    toast.classList.remove('is-visible')
    void toast.offsetWidth
    toast.classList.add('is-visible')
    window.setTimeout(() => toast.classList.remove('is-visible'), 3300)
  }

  /** 무장 모집 연출(옥패 의식 → 5등급이면 천명 강림) */
  celebrateRecruit(rewards: General[]): Promise<void> {
    return playSummonCeremony(rewards, general => this.portraitAsset(general))
  }

  /** 장비 뽑기 연출(대장간 불꽃 → 전설·신화면 등장) */
  celebrateDraw(items: Equipment[]): Promise<void> {
    return playForgeCeremony(items, item => equipmentImage(item.type), item => ({ type: EQUIPMENT_TYPE_META[item.type].label, set: EQUIPMENT_SET_META[item.set].label }))
  }

  playRecruitAnimation(general: General, count: number, revealNow = false): Promise<void> {
    if (this.recruitAnimationActive) return Promise.resolve()
    this.recruitAnimationActive = true
    const meta = GRADE_META[general.grade]
    const overlay = document.createElement('div')
    overlay.className = 'summon-ritual'
    overlay.innerHTML = `<div class="ritual-backdrop"></div><div class="ritual-orbit ritual-orbit--one"></div><div class="ritual-orbit ritual-orbit--two"></div><div class="ritual-stage"><div class="ritual-heading"><span class="eyebrow">${count === 10 ? '10회 연속 모집 · 대표 등장' : '1회 모집 · 옥패의 응답'}</span><strong>천명이 인장을 깨운다</strong></div><div class="ritual-seal"><span>✦</span><i>옥패의 응답</i></div><div class="ritual-reveal" style="--grade:${meta.color};--accent:${gradeColor(general)}"><span class="ritual-grade">${meta.label} · ${general.grade}등급</span>${this.ritualPortrait(general)}<h2>${general.name}</h2><p>${general.epithet}</p><small>${general.role} · Lv.${general.level} · ${general.stars}성</small><div class="ritual-skill"><b>${general.skillName}</b><span>${general.skillDescription}</span></div></div><button class="action-button action-button--primary ritual-continue" data-action="close-summon">결과 확인 <span>→</span></button></div>`
    this.root.appendChild(overlay)

    return new Promise(resolve => {
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        overlay.classList.remove('is-visible')
        window.setTimeout(() => {
          overlay.remove()
          this.recruitAnimationActive = false
          resolve()
        }, 380)
      }
      overlay.querySelector('[data-action="close-summon"]')?.addEventListener('click', finish, { once: true })
      requestAnimationFrame(() => overlay.classList.add('is-visible'))
      window.setTimeout(() => overlay.classList.add('is-revealed'), revealNow ? 60 : 980)
      window.setTimeout(finish, 5200)
    })
  }

  showRecruitResults(rewards: General[]): void {
    this.root.querySelector('.recruit-results')?.remove()
    const overlay = document.createElement('div')
    overlay.className = 'recruit-results'
    const cards = rewards.map((general, index) => `<div class="recruit-result-card ${general.grade === 5 ? 'recruit-result-card--five-star' : ''}" style="--grade:${GRADE_META[general.grade].color};--accent:${gradeColor(general)};--reveal-delay:${Math.min(index, 9) * 70}ms"><span class="recruit-result-index">${String(index + 1).padStart(2, '0')}</span>${this.ritualPortrait(general)}<div><b>${escapeHtml(general.name)}</b><small>${general.grade}등급 · ${GRADE_META[general.grade].label} · Lv.${general.level}</small></div></div>`).join('')
    overlay.innerHTML = `<div class="recruit-results-backdrop"></div><div class="recruit-results-panel"><div class="recruit-results-heading"><div><span class="eyebrow">10회 모집 결과</span><h2>열 명의 무장이 응답했습니다</h2><p>획득한 무장은 도감에 기록되고, 중복 인장은 성급 성장에 사용됩니다.</p></div><button class="mini-action" data-action="close-recruit-results">닫기</button></div><div class="recruit-results-grid">${cards}</div><div class="recruit-results-actions"><button class="action-button action-button--outline" data-action="reroll-recruit"><span>10명 다시 뽑기</span><b class="cost">${icon('honor', 'gi--cost')}${this.renderedState ? formatNumber(recruitCost(this.renderedState, 10)) : '900'}</b></button><button class="action-button action-button--primary" data-action="close-recruit-results">결과 확인 완료 <span>→</span></button></div></div>`
    this.root.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('is-visible'))
  }

  showEquipmentResults(rewards: Equipment[]): void {
    this.root.querySelector('.recruit-results')?.remove()
    const overlay = document.createElement('div')
    overlay.className = 'recruit-results'
    const cards = rewards.map((item, index) => { const specialty = equipmentSpecialty(item); return `<div class="recruit-result-card equipment-result-card equipment-result-card--${item.grade}" style="--grade:${EQUIPMENT_GRADE_META[item.grade].color};--reveal-delay:${Math.min(index, 9) * 70}ms"><span class="recruit-result-index">${String(index + 1).padStart(2, '0')}</span><div class="equipment-result-icon"><img src="${equipmentImage(item.type)}" alt="${EQUIPMENT_TYPE_META[item.type].label}" /></div><div><b>${escapeHtml(item.name)}</b><small>${EQUIPMENT_GRADE_META[item.grade].label} · ${EQUIPMENT_TYPE_META[item.type].label} · +${equipmentValue(item)}</small><em>${escapeHtml(EQUIPMENT_SET_META[item.set].label)} · ${escapeHtml(item.skillName)}</em>${specialty ? `<strong class="equipment-specialty-badge">특기 · ${escapeHtml(specialty.label)}</strong>` : ''}</div></div>` }).join('')
    overlay.innerHTML = `<div class="recruit-results-backdrop"></div><div class="recruit-results-panel"><div class="recruit-results-heading"><div><span class="eyebrow">장비 획득 결과</span><h2>${rewards.length}개의 장비를 획득했습니다</h2><p>획득한 장비는 보유 장비에 추가되며, 무장에게 장착하거나 강화할 수 있습니다.</p></div><button class="mini-action" data-action="close-recruit-results">닫기</button></div><div class="recruit-results-grid equipment-results-grid">${cards}</div><div class="recruit-results-actions"><button class="action-button action-button--outline" data-action="extra-equipment-draw" data-count="1"><span>1회 추가 뽑기</span><b class="cost">${icon('honor', 'gi--cost')}240</b></button><button class="action-button action-button--outline" data-action="extra-equipment-draw" data-count="10"><span>10회 추가 뽑기</span><b class="cost">${icon('honor', 'gi--cost')}2,200</b></button><button class="action-button action-button--primary" data-action="close-recruit-results">결과 확인 완료 <span>→</span></button></div></div>`
    this.root.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('is-visible'))
  }

  /** 튜토리얼이 화면을 옮길 때 모집·상점 탭과 무료 모집 표시를 맞춘다 */
  setOnboarding(options: { summonTab?: 'generals' | 'equipment'; shopTab?: 'resources'; freeRecruit?: boolean }): void {
    if (options.summonTab) this.summonTab = options.summonTab
    if (options.shopTab) this.shopTab = options.shopTab
    if (options.freeRecruit !== undefined) this.freeRecruit = options.freeRecruit
  }

  setBattleAutoAvailable(available: boolean): void {
    this.battleAutoAvailable = available
  }

  /** 무장 버튼을 길게 누르면 스킬(0.42초). 짧게 누르면 기동(클릭). */
  private handleUnitPress = (event: PointerEvent): void => {
    const unit = (event.target as HTMLElement).closest<HTMLElement>('[data-bt-unit]')
    if (!unit || (event.target as HTMLElement).closest('[data-action="battle-skill"]')) return
    window.clearTimeout(this.longPressTimer)
    const index = Number(unit.dataset.btUnit ?? 0)
    this.longPressTimer = window.setTimeout(() => {
      this.suppressMoveUntil = Date.now() + 700
      unit.classList.add('is-long-pressed')
      window.setTimeout(() => unit.classList.remove('is-long-pressed'), 260)
      this.callbacks.onBattleSkill(index)
    }, 420)
  }

  private cancelUnitPress = (): void => {
    window.clearTimeout(this.longPressTimer)
  }

  updateBattle(snapshot: BattleSnapshot): void {
    if (snapshot.active && !this.powerMarked && this.renderedState) {
      this.powerMarked = true
      try { localStorage.setItem(POWER_MARK_KEY, JSON.stringify({ power: totalPower(this.renderedState), at: Date.now() })) } catch { /* 저장 못 해도 진행 */ }
    } else if (!snapshot.active) this.powerMarked = false
    this.latestBattle = snapshot
    if (snapshot.active) this.battleViewActive = true
    else if (this.renderedState?.section === 'battle') this.battleViewActive = false
    const q = <T extends HTMLElement = HTMLElement>(selector: string) => this.root.querySelector<T>(selector)
    // 전투 전체화면(Manus 개선안): 전투 중에는 좌측 메뉴·상단 재화를 숨기고, 끝나면 되돌린다.
    this.root.querySelector('.app-shell')?.classList.toggle('app-shell--battle', this.battleViewActive && this.renderedState?.section === 'battle')
    const section = q('.page-section--battle')
    if (!section) return
    const set = (selector: string, raw: string) => { const node = q(selector); const text = tr(raw); if (node && node.textContent !== text) node.textContent = text }
    const width = (selector: string, value: number) => { const node = q(selector); if (node) node.style.width = `${Math.max(0, Math.min(100, value))}%` }
    set('[data-bt-status]', snapshot.status)
    set('[data-bt-time]', snapshot.active || snapshot.result ? `남은 ${Math.ceil(snapshot.timeLeft)}초` : `제한 ${snapshot.hardRule === 'swift' ? 60 : 90}초`)
    if (snapshot.mode === 'raid') set('[data-bt-raid]', formatNumber(snapshot.raidDamage ?? 0))
    q('[data-bt-time]')?.classList.toggle('is-urgent', snapshot.active && snapshot.timeLeft <= 20)
    set('[data-bt-phase]', `${snapshot.phaseName}`)
    set('[data-bt-morale-text]', `적 사기 ${snapshot.moraleValue} / ${snapshot.moraleMax}`)
    width('[data-bt-morale]', snapshot.morale)
    // 아군 사기 = 100 − 위협도(계산은 그대로, 화면만 사기로 보여 준다)
    const allyMorale = Math.max(0, 100 - snapshot.threat)
    width('[data-bt-threat]', allyMorale)
    set('[data-bt-threat-text]', `${allyMorale}`)
    q('.bt-hud-row--threat')?.classList.toggle('is-low', allyMorale <= 30)
    set('[data-bt-collapse]', `사기 붕괴 ${snapshot.collapses}/2`)
    q('[data-bt-collapse]')?.classList.toggle('is-danger', snapshot.collapses > 0)
    set('[data-bt-combo]', `연계 ${snapshot.combo}`)
    set('[data-bt-pressure]', `적 압박 ×${snapshot.difficultyMultiplier.toFixed(2)}`)
    set('[data-bt-bond]', snapshot.bond ? `인연 · ${snapshot.bond}` : '인연 없음')
    const pattern = snapshot.pattern
    const callout = q('[data-bt-callout]')
    callout?.classList.toggle('is-open', Boolean(pattern))
    callout?.classList.toggle('is-guard', pattern?.kind === 'guard')
    callout?.classList.toggle('is-hold', pattern?.kind === 'hold')
    set('[data-bt-pattern]', pattern ? pattern.label : snapshot.active ? '다음 예고 대기' : '전투 시작 전')
    width('[data-bt-window]', pattern ? pattern.timeLeft / pattern.window * 100 : 0)
    this.root.querySelectorAll<HTMLElement>('[data-bt-lane]').forEach(node => node.classList.toggle('is-target', Boolean(pattern && pattern.kind !== 'guard' && pattern.lanes.includes(Number(node.dataset.btLane)))))
    const warn = q('[data-bt-enemy-warn]')
    if (warn) {
      warn.hidden = !snapshot.enemyWarning
      if (snapshot.enemyWarning) warn.textContent = `적장 스킬 예고 · ${snapshot.enemyWarning.general}의 ‘${snapshot.enemyWarning.name}’`
    }
    section.classList.toggle('is-enemy-warning', Boolean(snapshot.enemyWarning))
    snapshot.units.forEach(unit => {
      const node = q(`[data-bt-unit="${unit.lane}"]`)
      if (!node) return
      const pct = unit.maxTroops ? unit.troops / unit.maxTroops * 100 : 0
      const bar = node.querySelector<HTMLElement>('[data-bt-unit-troops]')
      if (bar) bar.style.width = `${pct}%`
      const edge = node.querySelector<HTMLElement>('[data-bt-unit-edge]')
      if (edge) {
        edge.hidden = !unit.edge
        edge.className = `bt-unit-edge ${unit.edge === 'adv' ? 'is-adv' : unit.edge === 'dis' ? 'is-dis' : ''}`
        const text = unit.edge === 'adv' ? '상성 유리' : unit.edge === 'dis' ? '상성 불리' : ''
        if (edge.textContent !== tr(text)) edge.textContent = tr(text)
      }
      const cd = node.querySelector<HTMLElement>('[data-bt-unit-cd]')
      const ratio = unit.cooldownMax ? Math.min(1, unit.cooldown / unit.cooldownMax) : 0
      node.style.setProperty('--cd', `${Math.round(ratio * 360)}deg`)
      if (cd) cd.textContent = !unit.skillUnlocked ? '스킬 잠김' : !snapshot.active ? unit.skillName : unit.ready ? '스킬 준비' : `${unit.cooldown.toFixed(1)}초`
      node.classList.toggle('is-ready', unit.ready)
      node.classList.toggle('is-down', !unit.alive)
      node.classList.toggle('is-target', Boolean(pattern && pattern.kind !== 'guard' && pattern.lanes.includes(unit.lane)))
      node.classList.toggle('is-selected', unit.lane === snapshot.selectedUnit)
      const skill = node.querySelector<HTMLButtonElement>('[data-action="battle-skill"]')
      if (skill) skill.disabled = !unit.ready
    })
    width('[data-bt-gauge]', snapshot.tacticGauge)
    set('[data-bt-gauge-text]', `전술 게이지 ${snapshot.tacticGauge}`)
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="battle-tactic"]').forEach(button => {
      const tactic = (button.dataset.tactic ?? 'guard') as keyof BattleSnapshot['tacticCosts']
      const cost = snapshot.tacticCosts[tactic]
      button.disabled = !snapshot.active || snapshot.tacticGauge < cost
      const label = button.querySelector('em')
      if (label) label.textContent = String(cost)
      button.classList.toggle('is-called', tactic === 'guard' && (pattern?.kind === 'guard' || Boolean(snapshot.enemyWarning)))
    })
    q('[data-bt-guard]')?.classList.toggle('is-on', snapshot.guardActive)
    // 버프 · 디버프: 무장 이름 옆 아이콘
    const fx = (node: HTMLElement | null, chips: UnitEffectChip[] = []) => {
      if (!node) return
      const html = this.unitEffectIcons(chips)
      if (node.dataset.html !== html) { node.innerHTML = html; node.dataset.html = html }
    }
    snapshot.units.forEach(unit => fx(q(`[data-bt-unit="${unit.lane}"] [data-bt-unit-fx]`), snapshot.unitEffects.player[unit.lane]))
    snapshot.opponentDeck.forEach((_, index) => fx(q(`[data-bt-enemy="${index}"] [data-bt-enemy-fx]`), snapshot.unitEffects.enemy[index]))
    snapshot.troopStatus.filter(unit => unit.side === 'enemy').forEach(unit => {
      const card = q(`[data-bt-enemy="${unit.index}"]`)
      if (!card) return
      card.classList.toggle('is-down', !unit.alive)
      const bar = card.querySelector<HTMLElement>('i')
      if (bar) bar.style.width = `${unit.maxTroops ? unit.troops / unit.maxTroops * 100 : 0}%`
    })
    const enemies = q('[data-bt-enemies]')
    if (enemies && snapshot.opponentDeck.length && !enemies.dataset.filled) { enemies.innerHTML = this.enemyHudMarkup(snapshot.opponentDeck); enemies.dataset.filled = '1' }
    const log = q('[data-bt-log]')
    if (log) {
      const lines = this.battleLogOpen ? snapshot.log.slice(-8) : snapshot.log.slice(-2)
      const html = lines.map(line => `<li>${escapeHtml(line)}</li>`).join('') || '<li>전투 기록이 여기에 표시됩니다.</li>'
      if (log.dataset.html !== html) { log.innerHTML = html; log.dataset.html = html }
    }
    q('[data-bt-speed]')?.classList.toggle('is-on', snapshot.speed >= 2)
    set('[data-bt-pause]', snapshot.paused ? '▶ 계속' : '❚❚ 멈춤')
    q('[data-bt-pause]')?.classList.toggle('is-on', snapshot.paused)
    const paused = q('[data-bt-paused]')
    if (paused) paused.hidden = !snapshot.paused
    section.classList.toggle('is-paused', snapshot.paused)
    const stop = q('[data-bt-stop]')
    if (stop) stop.textContent = Date.now() < this.stopConfirmUntil ? '한 번 더 누르면 중지' : '■ 전투 중지'
    q('[data-bt-auto]')?.classList.toggle('is-on', snapshot.autoPlay)
    const autoSkillButton = q('[data-bt-auto-skill]')
    autoSkillButton?.classList.toggle('is-on', snapshot.autoSkill)
    autoSkillButton?.setAttribute('aria-pressed', String(snapshot.autoSkill))
    const startButton = q('[data-action="battle-start"]')
    if (startButton) startButton.style.display = snapshot.active ? 'none' : 'inline-flex'
  }

  /** 스킬 사용: 그 무장 머리 위에 초상 · 스킬 이름이 솟아올랐다 사라진다(무장이 움직이면 따라간다) */
  showSkillCutIn(info: { side: 'player' | 'enemy'; lane: number; id: string; name: string; skill: string }): void {
    const key = `skill-pop-${info.side}-${info.lane}`
    document.getElementById(key)?.remove()
    const pop = document.createElement('div')
    pop.id = key
    pop.className = `skill-pop skill-pop--${info.side}`
    pop.setAttribute('aria-live', 'polite')
    pop.innerHTML = `<div class="skill-pop__card"><span class="skill-pop__face" style="background-image:url('/assets/generals-realistic-webp/${info.id}.webp')"></span><span class="skill-pop__text"><small>${escapeHtml(info.name)}</small><strong>${escapeHtml(info.skill)}</strong></span></div>`
    document.body.appendChild(pop)
    const started = performance.now()
    let last: { x: number; y: number } | null = null
    const place = () => {
      if (!pop.isConnected) return
      const point = this.unitLocator?.(info.side, info.lane) ?? last
      if (point) {
        last = point
        // 화면 가장자리에서 잘리지 않게 안쪽으로
        const half = Math.min(pop.offsetWidth / 2, window.innerWidth / 2)
        const x = Math.max(half + 4, Math.min(window.innerWidth - half - 4, point.x))
        const y = Math.max(pop.offsetHeight + 4, point.y - 6)
        pop.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
        pop.classList.add('is-placed')
      }
      if (performance.now() - started < 1700) requestAnimationFrame(place)
      else pop.remove()
    }
    place()
  }

  /** 전장 무장의 화면 위치를 알려 주는 함수(전투 화면이 넣어 준다) */
  setUnitLocator(locate: ((side: 'player' | 'enemy', lane: number) => { x: number; y: number } | null) | null): void {
    this.unitLocator = locate
  }

  showBattleResult(result: BattleResult, notice = '', factors: Array<{ label: string; text: string; tone: 'good' | 'bad' | 'neutral' }> = []): void {
    const stars = [1, 2, 3].map(index => `<i class="${index <= result.stars ? 'is-on' : ''}">★</i>`).join('')
    const reason = { morale: '3막 적 사기를 무너뜨렸습니다', wipe: '적 병력을 전멸시켰습니다', timeout: '90초 안에 끝내지 못했습니다', troops: '아군 병력이 전멸했습니다', collapse: '아군 사기가 두 번 무너졌습니다', ratio: '남은 병력 비율로 판정했습니다', raid: `레이드 종료 · 누적 피해 ${(result.raidDamage ?? 0).toLocaleString('ko-KR')}` }[result.reason]
    const rows = [
      ['예고 파훼', `${result.breaks} / ${result.patterns}`],
      ['최대 연계', String(result.maxCombo)],
      ['남은 병력', `${Math.round(result.troopRatio * 100)}%`],
      ['사기 붕괴', `${result.collapses}회`],
      ['전투 시간', `${Math.round(result.durationMs / 1000)}초`],
    ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('')
    const checks = result.won ? `<ul class="result-checks"><li class="is-on">승리</li><li class="${result.troopRatio >= 0.5 ? 'is-on' : ''}">병력 50% 이상</li><li class="${result.collapses === 0 ? 'is-on' : ''}">사기 붕괴 없음</li></ul>` : ''
    const modal = document.createElement('div')
    modal.className = 'result-modal'
    modal.innerHTML = `<div class="result-card"><span class="eyebrow">작전 결과</span><div class="result-mark">${result.won ? '승리' : '패배'}</div>${result.won ? `<div class="result-stars">${stars}</div>` : ''}<h2>${escapeHtml(reason)}</h2>${checks}<div class="result-grid">${rows}</div>${factors.length ? `<div class="result-factors"><span class="eyebrow">승패 요인</span><ul>${factors.map(item => `<li class="is-${item.tone}"><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.text)}</span></li>`).join('')}</ul></div>` : ''}${notice ? `<p>${escapeHtml(notice)}</p>` : ''}<div class="result-score"><span>작전 점수</span><strong>${formatNumber(result.score)}</strong></div><button class="action-button action-button--primary" data-action="close-result">확인</button></div>`
    this.root.appendChild(modal)
    requestAnimationFrame(() => modal.classList.add('is-visible'))
  }

  private accessGate(): string {
    const offline = this.auth.status === 'offline'
    return `<section class="access-gate"><div class="access-gate__backdrop"></div><div class="access-gate__panel"><div class="access-gate__art" aria-hidden="true"></div><div class="access-gate__seal"><span>✦</span></div><span class="eyebrow">천하 · 패왕의 시대</span><h1>천하: 패왕의 시대</h1><p class="access-gate__lead">무장을 모으고, 진형을 지휘하고,<br>당신의 이름을 전장에 새기십시오.</p><div class="access-gate__divider"><i></i><span>접속 방식 선택</span><i></i></div><div class="access-gate__actions"><button class="access-choice access-choice--member" data-action="login"><strong>회원 로그인</strong><span>계정·전적·랭킹을 안전하게 저장합니다.</span><b>Manus 계정으로 계속 <em>→</em></b></button><button class="access-choice access-choice--guest" data-action="guest-login"><strong>게스트 로그인</strong><span>아이디만 정하고 바로 시작합니다.</span><b>${offline ? '이 기기에서만 로컬 저장' : '서버에 저장 · 모든 콘텐츠 이용'} <em>→</em></b></button></div><p class="access-gate__note">${offline ? '현재 회원 인증 서버에 연결할 수 없습니다. 게스트 모드로 플레이할 수 있습니다.' : '회원 로그인 후에도 기존 게스트 진행 데이터는 이 기기에 보존됩니다.'}</p><div class="setting-seg access-gate__lang" data-no-tr><button class="setting-seg__btn ${isEnglish() ? '' : 'is-active'}" data-action="set-lang" data-value="ko">한국어</button><button class="setting-seg__btn ${isEnglish() ? 'is-active' : ''}" data-action="set-lang" data-value="en">English</button></div></div></section>`
  }

  private factionSelection(): string {
    const factions: Array<{ id: Faction; name: string; capital: string; region: string; color: string; description: string }> = [
      { id: '위나라', name: '위', capital: '업', region: '중원 · 북방', color: '#8da9ff', description: '넓은 중원과 강한 성벽을 바탕으로 천하의 중심을 지휘합니다.' },
      { id: '촉한', name: '촉', capital: '성도', region: '익주 · 서부', color: '#52e0c4', description: '험준한 산악과 정예 군세로 서부의 전선을 지켜냅니다.' },
      { id: '오나라', name: '오', capital: '건업', region: '강동 · 동남', color: '#f6c56d', description: '강과 수운을 장악하고 빠른 기동으로 동남을 넓혀갑니다.' },
    ]
    return `<section class="faction-selection"><div class="faction-selection__backdrop"></div><div class="faction-selection__panel"><span class="eyebrow">진영 선택</span><h1>어느 진영으로 천하를 이끌겠습니까?</h1><p class="faction-selection__lead">선택한 진영의 본성과 영토는 아군으로 표시되고,<br>나머지 진영의 도시는 적군 전선으로 구분됩니다.</p><div class="faction-selection__cards">${factions.map(faction => `<button class="faction-choice faction-choice--${faction.id === '위나라' ? 'wei' : faction.id === '촉한' ? 'shu' : 'wu'}" style="--faction-color:${faction.color}" data-action="faction-select" data-faction="${faction.id}"><span class="faction-choice__crest">${faction.name}</span><span class="faction-choice__copy"><strong>${faction.id}</strong><small>${faction.region} · 본성 ${faction.capital}</small><em>${faction.description}</em></span><b>이 진영으로 시작 <i>→</i></b></button>`).join('')}</div><p class="faction-selection__note">진영 선택 후 영토 지도에서 아군·적군·중립 도시를 확인할 수 있습니다. 선택은 계정과 이 기기에 저장됩니다.</p></div></section>`
  }

  private shell(state: StrategyState): string {
    return `
      <div class="app-shell${state.section === 'battle' && this.battleViewActive ? ' app-shell--battle' : ''}">
        <header class="topbar">
          <div class="brand-lockup"><div class="brand-seal brand-seal--img"><img src="/assets/ui/brand-seal.svg" alt="천하 인장" width="40" height="40" draggable="false"></div><div><div class="brand-title">천하</div><div class="brand-subtitle">패왕의 시대</div></div></div>
          <div class="topbar-center"><button type="button" class="topbar-chapter" data-action="section" data-section="battle" title="시나리오로 이동"><span class="season-dot"></span><span>${this.chapterLabel(state)}</span></button><span class="topbar-divider"></span><div class="topbar-resources"><span class="topbar-resource topbar-resource--gold" title="금화">${icon('gold')}<small>금화</small><strong>${formatNumber(state.gold)}</strong></span><span class="topbar-resource topbar-resource--silver" title="은전">${icon('silver')}<small>은전</small><strong title="${formatNumber(state.silver)}">${compactNumber(state.silver)}</strong></span><span class="topbar-resource topbar-resource--honor" title="옥패">${icon('honor')}<small>옥패</small><strong title="${formatNumber(state.honor)}">${compactNumber(state.honor)}</strong></span><span class="topbar-resource topbar-resource--influence" title="영향력">${icon('influence')}<small>영향력</small><strong title="${formatNumber(state.resources.influence)}">${compactNumber(state.resources.influence)}</strong></span><span class="topbar-resource topbar-resource--grain" title="식량">${icon('grain')}<small>식량</small><strong title="${formatNumber(state.resources.grain)}">${compactNumber(state.resources.grain)}</strong></span><span class="topbar-resource topbar-resource--wood" title="목재">${icon('wood')}<small>목재</small><strong title="${formatNumber(state.resources.wood)}">${compactNumber(state.resources.wood)}</strong></span><span class="topbar-resource topbar-resource--iron" title="철">${icon('iron')}<small>철</small><strong title="${formatNumber(state.resources.iron)}">${compactNumber(state.resources.iron)}</strong></span></div></div>
          ${state.section === 'battle' && this.battleViewActive ? this.battleTopControls() : ''}
          <div class="topbar-actions"><button class="lang-toggle sound-toggle ${muteSetting() ? 'is-muted' : ''}" data-action="sound-toggle" data-no-tr title="${muteSetting() ? '소리 켜기' : '소리 끄기'}" aria-label="${muteSetting() ? '소리 켜기' : '소리 끄기'}">${muteSetting() ? '🔇' : '🔊'}</button><button class="lang-toggle" data-action="set-lang" data-value="${isEnglish() ? 'ko' : 'en'}" data-no-tr title="언어 / Language">${isEnglish() ? '한국어' : 'EN'}</button><button class="auth-button" data-auth-button data-action="${this.auth.status === 'authenticated' ? 'logout' : this.auth.status === 'offline' ? 'offline' : 'login'}" title="${this.auth.status === 'authenticated' ? `${escapeHtml(this.auth.name ?? '장군')} · 로그아웃` : ''}">${authButtonInner(this.auth)}</button></div>
        </header>
        <aside class="sidebar">
          ${this.navGroup('본진')}
          ${this.navButton('overview', icon('overview'), '본영', state.section)}
          ${this.navButton('roster', icon('roster'), '보유 무장', state.section, `${state.generals.length}`)}
          ${this.navButton('codex', icon('codex'), '무장 도감', state.section, `${allGenerals().length}`)}
          ${this.navButton('formation', icon('formation'), '출전 편성', state.section, `${state.formation.length}/3`)}
          ${this.navGroup('육성')}
          ${this.navButton('recruit', icon('recruit'), '모집 · 장비', state.section, state.lastRecruit ? 'NEW' : '')}
          ${this.navButton('equipment', icon('equipment'), '장비 관리', state.section, `${equipmentInventoryCount(state)}`)}
          ${this.navButton('research', icon('research'), '기술 연구', state.section)}
          ${this.navButton('territory', icon('territory'), '영토 · 내정', state.section, `${state.cities.filter(city => city.owner === state.faction).length}`)}
          ${this.navGroup('전투')}
          ${this.navButton('battle', icon('battle'), '시나리오', state.section)}
          ${this.navButton('duel', icon('duel'), '유저 대련', state.section, `${duelAttemptsRemaining(state)}/5`)}
          ${this.navButton('raid', icon('raid'), '주간 레이드', state.section, this.raidView.info ? `${this.raidView.info.attemptsLeft}/${this.raidView.info.dailyLimit}` : '')}
          ${this.navButton('rank', icon('rank'), '천하 랭킹', state.section)}
          ${this.navGroup('소통')}
          ${this.navButton('board', icon('board'), '진영 게시판', state.section)}
          ${this.navButton('shop', icon('shop'), '상점', state.section)}
          ${this.navButton('updates', icon('updates'), '업데이트 기록', state.section, 'NEW')}
          ${this.navButton('account', icon('account'), '계정 관리', state.section)}
          ${this.canOpenBalance() || this.isAdmin() ? `<div class="nav-ops">${this.canOpenBalance() ? `<a class="nav-button nav-button--link nav-button--ops" href="./balance.html" data-nav><span class="nav-icon">${icon('balance')}</span><span class="nav-label">밸런스 테스트</span>${shortNavLabel('balance')}</a>` : ''}${this.isAdmin() ? this.navButton('admin', icon('admin'), '관리자 센터', state.section).replace('class="nav-button ', 'class="nav-button nav-button--ops ') : ''}</div>` : ''}
          ${this.navMoreButton(state)}
          <div class="sidebar-spacer"></div>
          <div class="sidebar-profile"><div class="profile-orb">${state.faction.slice(0, 1)}</div><div><strong>${state.faction} 진영</strong><small>무장 ${state.generals.length}명 · 영토 ${state.cities.filter(city => city.owner === state.faction).length}성</small></div></div>
        </aside>
        <main class="main-content">
          ${this.renderSection(state)}
        </main>
        <div class="ambient-vignette"></div>
        <div class="toast" data-toast></div>
      </div>`
  }

  private navButton(section: Section, icon: string, label: string, current: Section, badge = ''): string {
    // 배지: 숫자는 금테 작은 상자, 새 소식(NEW)은 붉은 ‘새’ 표시
    const mark = !badge ? '' : badge === 'NEW' ? '<b class="nav-badge nav-badge--new">새</b>' : `<b class="nav-badge">${badge}</b>`
    const coach = this.coachSection === section && current !== section ? 'nav-coach' : ''
    const primary = MOBILE_TABS.includes(section) ? 'nav-button--primary' : ''
    return `<button class="nav-button ${primary} ${current === section ? 'is-active' : ''} ${coach}" data-action="section" data-section="${section}" data-nav><span class="nav-icon">${icon}</span><span class="nav-label">${label}</span>${shortNavLabel(section)}${mark}</button>`
  }

  /** 휴대폰 하단 탭의 ‘더보기’: 주요 5개 밖의 메뉴를 펼친다 */
  private navMoreButton(state: StrategyState): string {
    const outside = !MOBILE_TABS.includes(state.section)
    const coach = this.coachSection && !MOBILE_TABS.includes(this.coachSection as Section) && this.coachSection !== state.section ? 'nav-coach' : ''
    return `<div class="nav-more-rule" aria-hidden="true"></div><button class="nav-button nav-button--primary nav-button--more ${outside ? 'is-active' : ''} ${coach}" data-action="nav-more" aria-label="더보기"><span class="nav-icon"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><span class="nav-short">${isEnglish() ? 'More' : '더보기'}</span></button>`
  }

  /** 메뉴 분류 패(칠기 목패 위 금박 패) */
  private navGroup(label: string): string {
    return `<div class="nav-group"><span>${label}</span></div>`
  }

  private renderSection(state: StrategyState): string {
    if (state.section === 'equipment') return this.equipmentSection(state)
    if (state.section === 'recruit') return this.summoningSection(state)
    if (state.section === 'roster') return this.rosterSection(state)
    if (state.section === 'codex') return this.codexSection(state)
    if (state.section === 'formation') return this.formationSection(state)
    if (state.section === 'territory') return this.territorySection(state)
    if (state.section === 'research') return this.researchSection(state)
    if (state.section === 'battle') return this.battleViewActive ? this.battleSection(state) : this.scenarioSection(state)
    if (state.section === 'duel') return this.duelSection(state)
    if (state.section === 'raid') return this.raidSection(state)
    if (state.section === 'shop') return this.shopSection(state)
    if (state.section === 'rank') return this.rankSection(state)
    if (state.section === 'board') return this.boardSection(state)
    if (state.section === 'updates') return this.updatesSection()
    if (state.section === 'account') return this.accountSection()
    if (state.section === 'admin') return this.isAdmin() ? this.adminSection(state) : this.overviewSection(state)
    return this.overviewSection(state)
  }

  /** 다음에 깰 시나리오(모두 깼으면 마지막 시나리오) */
  private nextScenario(state: StrategyState) {
    return SCENARIOS.find(scenario => !state.scenarioCleared.includes(scenario.id)) ?? SCENARIOS[SCENARIOS.length - 1]
  }

  /** 위쪽 막대·본영 꼬리글에 함께 쓰는 지금의 장 이름 */
  private chapterLabel(state: StrategyState): string {
    const next = this.nextScenario(state)
    // 다음에 치를 시나리오(누르면 시나리오 화면으로)
    return next ? `다음 전투 · ${next.year}년 ${next.title}` : '모든 시나리오 완료'
  }


  /** 작전 전투력 변화: 마지막 전투를 시작할 때의 전투력과 비교(이 기기 기준) */
  private powerDelta(power: number): string {
    let mark = 0
    try { mark = Number(JSON.parse(localStorage.getItem(POWER_MARK_KEY) ?? 'null')?.power) || 0 } catch { mark = 0 }
    if (!mark) return ''
    const diff = power - mark
    if (Math.abs(diff) < 1) return ''
    return `<span class="stat-delta ${diff < 0 ? 'stat-delta--down' : ''}" title="지난 전투 대비">${diff > 0 ? '▲' : '▼'} ${formatNumber(Math.abs(Math.round(diff)))}</span>`
  }

  private noticeTime(): string {
    if (!this.noticeAt) return '최근 소식'
    const minutes = Math.floor((Date.now() - this.noticeAt) / 60000)
    if (minutes < 1) return '방금 전'
    if (minutes < 60) return `${minutes}분 전`
    return `${Math.floor(minutes / 60)}시간 전`
  }

  private overviewSection(state: StrategyState): string {
    const next = this.nextScenario(state)
    const allCleared = SCENARIOS.every(scenario => state.scenarioCleared.includes(scenario.id))
    const stars = next ? scenarioStars(state.scenarioCleared, next.id) : 0
    const power = totalPower(state)
    // 로비: 대표 무장(출전 중 전투력 1위) 그림 + 다음 전투 + 큰 출전 버튼 + 아이콘 바로가기
    const leader = state.formation.map(id => state.generals.find(item => item.id === id)).filter((item): item is General => Boolean(item)).sort((a, b) => combatPower(b) - combatPower(a))[0] ?? state.generals[0]
    const shortcuts: Array<[Section, IconName, string, string]> = [
      ['recruit', 'recruit', '모집', ''],
      ['formation', 'formation', '편성', `${state.formation.length}/3`],
      ['research', 'research', '연구', ''],
      ['territory', 'territory', '영토', ''],
      ['duel', 'duel', '대련', `${duelAttemptsRemaining(state)}`],
      ['shop', 'shop', '상점', ''],
    ]
    const stage = next ? `<div class="lobby-stage">${leader ? `<div class="lobby-leader" style="--portrait:url('${this.portraitAsset(leader)}')" role="img" aria-label="${escapeHtml(leader.name)}"></div>` : ''}<div class="lobby-info"><span class="lobby-chapter">${allCleared ? '다시 도전' : `${next.year}년`}</span><h2>${escapeHtml(next.title)}</h2><div class="lobby-enemy"><span>적 Lv.${scenarioEnemyLevel(next)}</span><span class="lobby-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span></div><div class="lobby-power"><small>전투력</small><strong>${formatNumber(power)}</strong>${this.powerDelta(power)}</div><button class="action-button action-button--primary lobby-march" data-action="section" data-section="battle" data-scenario-id="${next.id}">출전</button></div></div>` : ''
    const shortcutRow = `<nav class="lobby-shortcuts">${shortcuts.map(([section, name, label, badge]) => `<button class="lobby-shortcut" data-action="section" data-section="${section}"><span class="lobby-shortcut__icon">${icon(name)}</span><span>${label}</span>${badge ? `<b>${badge}</b>` : ''}</button>`).join('')}</nav>`
    return `<section class="page-section page-section--overview page-section--lobby">${stage}${shortcutRow}
      ${this.tutorialCard(state)}${this.missionCard(state)}
      <div class="overview-grid"><div class="glass-card formation-card"><div class="card-header"><div><span class="eyebrow">편성</span><h3>출전 진형</h3></div><button class="text-button" data-action="section" data-section="roster">편성 변경</button></div><div class="formation-row">${state.formation.map(id => { const general = state.generals.find(item => item.id === id); return general ? this.miniGeneral(general) : '' }).join('')}</div><div class="formation-footer"><span><i class="status-dot"></i> ${state.formation.length >= 3 ? '출전 준비 완료' : '빈 자리가 있습니다'}</span><span class="muted">${state.formation.length}/3 자리</span></div></div><div class="glass-card notice-card"><h3>최근 소식</h3><p class="notice-text">${escapeHtml(state.lastNotice)}</p><div class="notice-meta"><span>${this.noticeTime()}</span><button class="text-button" data-action="section" data-section="updates">업데이트 기록</button></div></div></div>
      <div class="section-footnote"><span class="footnote-line"></span><span>${this.chapterLabel(state)}</span><span class="footnote-line"></span></div></section>`
  }

  /** 본영: 처음 시작 안내(6단계 · 모두 마치면 보상) */
  private tutorialCard(state: StrategyState): string {
    const missions = ensureMissions(state)
    if (missions.tutorialDone) return ''
    const done = new Set(missions.tutorial ?? [])
    const next = nextTutorialStep(state)
    const steps = TUTORIAL_STEPS.map((step, index) => `<li class="${done.has(step.id) ? 'is-done' : next?.id === step.id ? 'is-next' : ''}"><span class="tut-num">${done.has(step.id) ? '✓' : index + 1}</span><div><strong>${step.label}</strong><small>${step.hint}</small></div>${!done.has(step.id) ? `<button class="mini-action" ${step.section === 'overview' ? 'data-action="scroll-missions"' : `data-action="section" data-section="${step.section}"`}>바로 가기</button>` : ''}</li>`).join('')
    const finished = tutorialFinished(state)
    return `<div class="glass-card tutorial-card"><div class="card-header"><div><span class="eyebrow">처음 시작 안내 · ${done.size}/${TUTORIAL_STEPS.length}</span><h3>${finished ? '모든 안내를 마쳤습니다!' : `다음: ${next?.label ?? ''}`}</h3></div><button class="text-button" data-action="tutorial-skip">안내 닫기</button></div><ol class="tutorial-steps">${steps}</ol><div class="tutorial-reward"><span>모두 마치면 · ${rewardText(TUTORIAL_REWARD)}</span><button class="mini-action mini-action--research" data-action="tutorial-claim" ${finished ? '' : 'disabled'}>보상 받기</button></div></div>`
  }

  /** 바뀐 규칙 안내(접속 때 한 번) */
  showNoticePopup(items: Array<[string, string]>, onClose: () => void): void {
    document.querySelector('.notice-popup')?.remove()
    const popup = document.createElement('div')
    popup.className = 'notice-popup'
    popup.innerHTML = `<div class="notice-popup__card"><span class="eyebrow">새로 바뀐 점</span><h2>이렇게 달라졌습니다</h2><ul>${items.map(([title, text]) => `<li><b>${escapeHtml(title)}</b><span>${escapeHtml(text)}</span></li>`).join('')}</ul><div class="notice-popup__actions"><button class="action-button action-button--outline" data-notice-more>업데이트 기록 보기</button><button class="action-button action-button--primary" data-notice-close>확인</button></div></div>`
    const close = () => { popup.remove(); onClose() }
    popup.querySelector('[data-notice-close]')?.addEventListener('click', close)
    popup.querySelector('[data-notice-more]')?.addEventListener('click', () => { close(); this.callbacks.onSection('updates') })
    document.body.appendChild(popup)
  }

  /** 본영: 일일·주간 임무 */
  private missionCard(state: StrategyState): string {
    const missions = ensureMissions(state)
    const row = (mission: MissionDef) => {
      const status = missionStatus(state, mission)
      const progress = Math.min(mission.goal, missions.progress[mission.id] ?? 0)
      const button = status === 'claimed' ? '<span class="mission-done">받음</span>' : `<button class="mini-action ${status === 'ready' ? 'mini-action--research' : ''}" data-action="mission-claim" data-mission="${mission.id}" ${status === 'ready' ? '' : 'disabled'}>${status === 'ready' ? '보상 받기' : `${progress}/${mission.goal}`}</button>`
      return `<li class="mission-row is-${status}"><div><strong>${mission.label}</strong><small>${rewardText(mission.reward)}</small><span class="mission-bar"><i style="width:${progress / mission.goal * 100}%"></i></span></div>${button}</li>`
    }
    const daily = MISSIONS.filter(mission => mission.scope === 'daily')
    const weekly = MISSIONS.filter(mission => mission.scope === 'weekly')
    const bonusDone = missions.claimed.includes(DAILY_BONUS_ID)
    const bonus = `<div class="mission-bonus ${dailyBonusReady(state) ? 'is-ready' : ''}"><span>일일 임무 모두 완료 · ${rewardText(DAILY_BONUS)}</span>${bonusDone ? '<span class="mission-done">받음</span>' : `<button class="mini-action mini-action--research" data-action="mission-claim" data-mission="${DAILY_BONUS_ID}" ${dailyBonusReady(state) ? '' : 'disabled'}>추가 보상</button>`}</div>`
    return `<div class="glass-card mission-card"><div class="card-header"><div><span class="eyebrow">일일 · 주간 임무</span><h3>오늘의 임무</h3></div><span class="rate-note">일일은 매일 0시, 주간은 월요일 0시(한국 시간)에 새로 시작</span></div><div class="mission-cols"><div><h4>일일</h4><ul>${daily.map(row).join('')}</ul>${bonus}</div><div><h4>주간</h4><ul>${weekly.map(row).join('')}</ul></div></div></div>`
  }

  private summoningSection(state: StrategyState): string {
    const active = this.summonTab
    return `<section class="page-section page-section--summoning"><div class="summon-menu-head"><div><span class="eyebrow">육성</span><h1>모집 · 장비</h1><p class="heading-copy">무장과 병장기를 한 곳에서 모집하고, 결과를 확인한 뒤 바로 성장시키십시오.</p></div><div class="summon-tabs"><button class="summon-tab ${active === 'generals' ? 'is-active' : ''}" data-action="summon-tab" data-summon-tab="generals">✦ 무장 모집</button><button class="summon-tab ${active === 'equipment' ? 'is-active' : ''}" data-action="summon-tab" data-summon-tab="equipment">⚒ 장비 뽑기</button></div></div>${active === 'equipment' ? this.equipmentDrawSection(state) : this.recruitSection(state)}</section>`
  }

  private recruitSection(state: StrategyState): string {
    const result = state.lastRecruit
    const freeRecruits = state.missions?.freeRecruits ?? 0
    return `<section class="page-section page-section--recruit"><div class="section-heading section-heading--compact"><div><span class="eyebrow">육성</span><h1>무장 모집</h1><p class="heading-copy">한 장의 인장이 진형 전체를 바꿉니다.</p></div><div class="section-counter"><span>보유 무장</span><strong>${state.generals.length}<small> / ${allGenerals().length}</small></strong></div></div><div class="recruit-layout"><div class="recruit-pedestal glass-card"><div class="pedestal-glow"></div><div class="summon-banner" role="img" aria-label="옥패의 부름에 응답하는 삼국의 무장들"><figure class="summon-banner__slide summon-banner__slide--solo"><img src="/assets/ui/recruit-montage.webp" alt="" width="720" height="900" draggable="false"><figcaption><b>군웅할거</b><span>천하의 영웅이 모인다</span></figcaption></figure><img class="summon-banner__jade" src="/assets/ui/jade-summon.svg" alt="" width="64" height="80" draggable="false"></div><div class="recruit-copy"><span class="pill pill--gold">무료 게임 내 재화</span><h2>옥패의 부름</h2><p>역사 속 무장들이 인장 너머에서 응답합니다.<br>중복 무장은 즉시 성급으로 전환됩니다.</p></div><div class="recruit-actions"><button class="action-button action-button--primary" data-action="recruit" data-count="1"><span>1회 모집</span><b class="cost">${freeRecruits >= 1 ? '무료권' : `${icon('honor', 'gi--cost')}${formatNumber(recruitCost(state, 1))}`}</b></button><button class="action-button action-button--outline" data-action="recruit" data-count="10"><span>${this.freeRecruit ? '무료 10회 모집' : '10회 연속 모집'}</span><b>${this.freeRecruit ? '5등급 1명 확정' : freeRecruits >= 10 ? '무료권' : `<span class="cost">${icon('honor', 'gi--cost')}${formatNumber(recruitCost(state, 10))}</span>`}</b></button></div>${freeRecruits > 0 ? `<p class="free-ticket-note">출석 보상 무료 모집권 <b>${freeRecruits}회</b> 남음 · 모집하면 먼저 쓰입니다</p>` : ''}<div class="fair-play-note"><span>◎</span><span>현금 결제 없음 · 모집 확률 상시 공개</span></div></div><div class="recruit-side"><div class="glass-card rate-card"><div class="card-header"><div><span class="eyebrow">확률표</span><h3>모집 확률</h3></div><span class="rate-note">1회 기준</span></div>${([5, 4, 3, 2, 1] as const).map(grade => `<div class="rate-row"><span class="grade-dot" style="--grade:${GRADE_META[grade].color}"></span><span>${grade}등급 <small>${GRADE_META[grade].label}</small></span><strong>${GRADE_META[grade].rate}</strong><div class="rate-track"><i style="width:${GRADE_META[grade].rate}"></i></div></div>`).join('')}<div class="rate-footnote">* 중복 획득 시 해당 무장의 성급이 +1 상승합니다. 최대 5성.${state.research.some(node => node.id === 'talent-3a' && node.unlocked) ? '<br>* 명장 발굴 연구 적용 중: 5등급 3%, 4등급 10%' : ''}</div></div>${result ? `<div class="glass-card recruit-result"><span class="eyebrow">최근 획득</span><div class="result-card-row">${this.portrait(result, 'general-portrait--large')}<div><h3>${result.name}<span class="star-row">${'★'.repeat(result.stars)}${'☆'.repeat(5 - result.stars)}</span></h3><p>${result.epithet}</p><small>${result.grade}등급 · ${result.role} · Lv.${result.level}</small></div></div><p class="result-note">${state.lastNotice}</p></div>` : '<div class="glass-card empty-result"><span class="empty-rune">✦</span><p>모집 결과가 이곳에 기록됩니다.</p></div>'}</div></div></section>`
  }

  /** 출전 자리가 꽉 찼을 때: 어느 자리와 바꿀지 고르는 창 */
  private openSlotPicker(state: StrategyState, id: string): void {
    const incoming = state.generals.find(general => general.id === id)
    if (!incoming) return
    document.querySelector('.slot-picker')?.remove()
    const layer = document.createElement('div')
    layer.className = 'slot-picker'
    const slots = state.formation.map((current, index) => {
      const general = state.generals.find(item => item.id === current)
      return `<button class="slot-picker__slot" data-slot="${index}"><span>${['↙ 좌측', '↑ 중앙 · 전열', '↘ 우측'][index]}</span>${general ? this.portrait(general, 'slot-picker__portrait') : ''}<strong>${escapeHtml(general?.name ?? '빈 자리')}</strong><small>${general ? `${general.role} · Lv.${general.level}` : ''}</small><em>이 자리에 넣기</em></button>`
    }).join('')
    layer.innerHTML = `<div class="slot-picker__card glass-card"><span class="eyebrow">출전 교체</span><h3>${escapeHtml(incoming.name)}을(를) 어느 자리에 넣을까요?</h3><p>고른 자리의 무장은 대기로 돌아갑니다.</p><div class="slot-picker__slots">${slots}</div><button class="text-button" data-slot-cancel>취소</button></div>`
    const close = () => layer.remove()
    layer.addEventListener('click', event => {
      const target = event.target as HTMLElement
      const slot = target.closest<HTMLElement>('[data-slot]')
      if (slot) { close(); this.callbacks.onFormationSlot(id, Number(slot.dataset.slot)) }
      else if (target === layer || target.closest('[data-slot-cancel]')) close()
    })
    document.body.appendChild(layer)
  }

  private rosterSection(state: StrategyState): string {
    const sortOptions: Array<[RosterSort, string]> = [['power', '전투력'], ['level', '레벨'], ['grade', '등급'], ['name', '이름'], ['role', '병과']]
    const match = (general: General) => this.rosterFilter === 'all' ? true : this.rosterFilter === '5' ? general.grade === 5 : this.rosterFilter === '4' ? general.grade === 4 : general.role === this.rosterFilter
    // 출전 무장은 좌·중·우 순서로 맨 앞에 고정, 나머지는 고른 정렬
    const deployed = state.formation.map(id => state.generals.find(general => general.id === id)).filter((general): general is General => Boolean(general) && match(general!))
    // 2군·3군도 따로 묶어 보여 준다(편성 순서대로), 대기는 어느 군에도 없는 무장
    const squadGroups = [1, 2].map(squad => ({ squad, list: squadIds(state, squad).map(id => state.generals.find(general => general.id === id)).filter((general): general is General => Boolean(general) && match(general!)) }))
    const inSquad = new Set([1, 2].flatMap(squad => squadIds(state, squad)))
    const reserve = this.sortedOwnedGenerals(state).filter(general => !state.formation.includes(general.id) && !inSquad.has(general.id) && match(general))
    const filters: Array<[typeof this.rosterFilter, string, number]> = [
      ['all', '전체', state.generals.length], ['5', '천명', state.generals.filter(g => g.grade === 5).length], ['4', '명장', state.generals.filter(g => g.grade === 4).length],
      ...(['기병', '보병', '궁병', '책사'] as Role[]).map(role => [role, role, state.generals.filter(g => g.role === role).length] as [Role, string, number]),
    ]
    const scale = Math.max(100, ...state.generals.flatMap(g => [g.leadership, g.martial, g.stratagem, g.speed])) * 1.04
    const cards = (list: General[]) => list.map(general => this.generalCard(state, general, scale)).join('')
    const empty = !deployed.length && !reserve.length ? '<div class="roster-empty">이 조건에 맞는 무장이 없습니다.</div>' : ''
    return `<section class="page-section page-section--roster"><div class="section-heading section-heading--compact"><div><span class="eyebrow">본진</span><h1>보유 무장</h1><p class="heading-copy">무장을 키우고 장비를 갖춰 출전 진형에 배치하십시오.</p></div><div class="section-counter"><span>출전 전투력</span><strong>${formatNumber(totalPower(state))}</strong></div></div><div class="roster-toolbar roster-toolbar--expanded"><div class="filter-tabs">${filters.map(([id, label, count]) => `<button class="filter-tab ${this.rosterFilter === id ? 'is-active' : ''}" data-action="roster-filter" data-filter="${id}">${label} <b>${count}</b></button>`).join('')}</div><div class="roster-sort-controls"><label>정렬 <select data-action="roster-sort">${sortOptions.map(([value, label]) => `<option value="${value}" ${this.rosterSort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="sort-direction" data-action="roster-sort-direction" title="정렬 방향">${this.rosterSortDescending ? '↓' : '↑'}</button><button class="ghost-button ghost-button--small" data-action="section" data-section="formation">편성 화면 →</button></div></div>
      <div class="roster-summary"><span>보유 ${state.generals.length}명 · 1군 ${state.formation.length}/3 · 2군 ${squadIds(state, 1).length}/3 · 3군 ${squadIds(state, 2).length}/3 · 은전 ${formatNumber(state.silver)} · 병서 ${formatNumber(state.manuals)}</span><span>대기 무장은 ${this.sortLabel()} ${this.rosterSortDescending ? '높은 순' : '낮은 순'}</span></div>
      <nav class="roster-squad-jump">${SQUAD_LABELS.map((label, index) => `<button class="roster-squad-chip" data-action="roster-jump" data-squad="${index}" ${squadIds(state, index).length ? '' : 'disabled'}>${label} <b>${squadIds(state, index).length}/3</b><small>${formatNumber(squadPower(state, index))}</small></button>`).join('')}<button class="text-button" data-action="section" data-section="formation">편성 바꾸기 →</button></nav>
      ${deployed.length ? `<h2 class="roster-group" id="roster-squad-0">1군 · 출전 중</h2><div class="roster-grid">${cards(deployed)}</div>` : ''}${squadGroups.map(group => group.list.length ? `<h2 class="roster-group" id="roster-squad-${group.squad}">${SQUAD_LABELS[group.squad]} <small>레이드에서 ${group.squad === 1 ? '1군' : '2군'} 다음으로 출전</small></h2><div class="roster-grid">${cards(group.list)}</div>` : '').join('')}${reserve.length ? `<h2 class="roster-group">대기</h2><div class="roster-grid">${cards(reserve)}</div>` : ''}${empty}</section>`
  }

  /** 도감 이름 찾기: 다시 그리지 않고 카드만 숨긴다(입력 칸 초점 유지) */
  private applyCodexSearch(): void {
    const query = this.codexQuery.trim()
    let shown = 0
    this.root.querySelectorAll<HTMLElement>('[data-codex-name]').forEach(card => {
      const name = card.dataset.codexName ?? ''
      const match = !query || (!card.classList.contains('codex-card--locked') && name.includes(query))
      card.hidden = !match
      if (match) shown += 1
    })
    const empty = this.root.querySelector<HTMLElement>('[data-codex-empty]')
    if (empty) empty.hidden = shown > 0
  }

  private codexSection(state: StrategyState): string {
    const catalog = allGenerals()
    const owned = new Map(state.generals.map(general => [general.id, general]))
    const ownedCount = catalog.filter(general => owned.has(general.id)).length
    const f = this.codexFilter
    const visible = catalog.filter(general => (f === 'all' ? true : f === 'owned' ? owned.has(general.id) : f === 'missing' ? !owned.has(general.id) : f === '5' ? general.grade === 5 : f === '4' ? general.grade === 4 : general.role === f)).filter(general => !this.codexQuery.trim() || (owned.has(general.id) && general.name.includes(this.codexQuery.trim())))
    const filters: Array<[typeof f, string, number]> = [['all', '전체', catalog.length], ['owned', '영입', ownedCount], ['missing', '미영입', catalog.length - ownedCount], ['5', '천명', catalog.filter(g => g.grade === 5).length], ['4', '명장', catalog.filter(g => g.grade === 4).length], ...(['기병', '보병', '궁병', '책사'] as Role[]).map(role => [role, role, catalog.filter(g => g.role === role).length] as [Role, string, number])]
    return `<section class="page-section page-section--codex"><div class="section-heading section-heading--compact"><div><span class="eyebrow">본진</span><h1>무장 도감</h1><p class="heading-copy">천하에 이름을 남긴 ${catalog.length}명의 무장과 영입 현황입니다.</p></div><div class="section-counter"><span>수집 현황</span><strong>${ownedCount}<small> / ${catalog.length}</small></strong></div></div><div class="codex-toolbar"><div class="filter-tabs">${filters.map(([id, label, count]) => `<button class="filter-tab ${f === id ? 'is-active' : ''}" data-action="codex-filter" data-filter="${id}">${label} <b>${count}</b></button>`).join('')}</div><label class="codex-search"><span>찾기</span><input data-codex-search type="search" placeholder="무장 이름" value="${escapeHtml(this.codexQuery)}"></label><div class="codex-progress"><i><b style="width:${(ownedCount / catalog.length) * 100}%"></b></i><small>${Math.round((ownedCount / catalog.length) * 100)}% · ${ownedCount}명 영입</small></div></div><div class="codex-grid">${visible.map(general => this.codexCard(owned.get(general.id) ?? general, owned.has(general.id))).join('')}</div><div class="roster-empty" data-codex-empty ${visible.length ? 'hidden' : ''}>조건에 맞는 무장이 없습니다.</div></section>`
  }


  /** 1·2·3군 탭 */
  private squadTabs(state: StrategyState): string {
    return `<div class="squad-tabs" role="tablist">${SQUAD_LABELS.map((label, index) => { const count = squadIds(state, index).length; return `<button class="squad-tab ${this.formationSquad === index ? 'is-active' : ''}" role="tab" aria-selected="${this.formationSquad === index}" data-action="squad-tab" data-squad="${index}"><strong>${label}</strong><span>${count}/3 · ${formatNumber(squadPower(state, index))}</span></button>` }).join('')}<p class="squad-tabs__note">2군·3군은 레이드에서 1군 다음으로 이어 싸웁니다. 한 무장은 한 군에만 설 수 있습니다.</p></div>`
  }

  /** 2군·3군 편성 화면: 1군과 같은 짜임(자리 · 상성 · 전열 · 장착 장비 · 추천 덱 · 대기 무장). 상성은 이번 주 레이드 보스 기준 */
  private reserveSquadSection(state: StrategyState, squad: number): string {
    const ids = squadIds(state, squad)
    const label = SQUAD_LABELS[squad]
    const bench = this.sortedFormationBench(state, squad)
    const sortOptions: Array<[FormationSort, string]> = [['power', '전투력'], ['grade', '등급']]
    const boss = raidBossFor(this.raidView.info?.weekKey ?? raidWeekKey())
    return `<section class="page-section page-section--formation"><div class="section-heading section-heading--compact"><div><span class="eyebrow">본진</span><h1>출전 편성</h1><p class="heading-copy">${label}은 레이드에서 1군 다음으로 출전합니다. 좌·중·우 자리와 전열 규칙은 1군과 같습니다. 한 무장은 한 군에만 설 수 있어, 다른 군 무장을 넣으면 그 군에서 옮겨 옵니다.</p><div class="auto-actions"><button class="action-button action-button--primary" data-action="squad-auto" data-squad="${squad}" data-with-equipment="1">${label} 자동 편성 + 장착 <span>✦</span></button><button class="action-button action-button--outline" data-action="squad-auto" data-squad="${squad}">자동 편성</button><button class="action-button action-button--outline" data-action="squad-equip" data-squad="${squad}">자동 장착</button><button class="action-button action-button--outline" data-action="squad-swap" data-squad="${squad}">1군과 바꾸기</button></div></div><div class="section-counter"><span>${label} 편성 전투력</span><strong>${formatNumber(squadPower(state, squad))}</strong></div></div>${this.squadTabs(state)}<div class="formation-screen glass-card"><div class="formation-screen-head"><div><span class="eyebrow">${label} · 레이드 출전</span><h3>${label} 진형 · ${ids.length}/3</h3><p>상성은 이번 주 레이드 보스 ‘${escapeHtml(boss.name)}’ 기준입니다. 기병은 궁병에, 궁병은 보병에, 보병은 기병에 강합니다.</p></div><span class="formation-readiness">${ids.length >= 3 ? '출정 준비 완료' : ids.length ? '빈 자리가 있습니다' : '비어 있음 · 레이드에서 건너뜁니다'}</span></div><div class="formation-slots">${[0, 1, 2].map(index => this.formationSlot(state, index, squad)).join('')}</div></div>${this.comboAdvice(state, squad)}<div class="formation-bench-head"><div><span class="eyebrow">대기 무장</span><h3>${label}에 넣을 무장</h3></div><div class="roster-sort-controls formation-sort-controls"><label>정렬 <select data-action="formation-sort">${sortOptions.map(([value, text]) => `<option value="${value}" ${this.formationSort === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label><button class="sort-direction" data-action="formation-sort-direction" title="정렬 방향">${this.formationSortDescending ? '↓' : '↑'}</button></div></div><div class="formation-bench">${bench.length ? bench.map(general => this.formationBenchCard(general, squad, state)).join('') : '<div class="formation-empty glass-card">더 넣을 무장이 없습니다.</div>'}</div></section>`
  }

  private formationSection(state: StrategyState): string {
    if (this.formationSquad > 0) return this.reserveSquadSection(state, this.formationSquad)
    const bench = this.sortedFormationBench(state)
    const sortOptions: Array<[FormationSort, string]> = [['power', '전투력'], ['grade', '등급']]
    return `<section class="page-section page-section--formation"><div class="section-heading section-heading--compact"><div><span class="eyebrow">본진</span><h1>출전 편성</h1><p class="heading-copy">좌·중·우 세 자리에 무장을 배치하십시오. 같은 자리의 적장과 병종 상성이 맞으면 유리하고, 가운데(전열)에는 수호형이나 단단한 무장을 세우면 좌우 공격수가 오래 살아남습니다.</p><div class="auto-actions"><button class="action-button action-button--primary" data-action="auto-formation" data-with-equipment="1">자동 편성 + 장착 <span>✦</span></button><button class="action-button action-button--outline" data-action="auto-formation">자동 편성</button><button class="action-button action-button--outline" data-action="auto-equip">자동 장착</button></div></div><div class="section-counter"><span>현재 편성 전투력</span><strong>${formatNumber(totalPower(state))}</strong></div></div>${this.squadTabs(state)}<div class="formation-screen glass-card"><div class="formation-screen-head"><div><span class="eyebrow">1군 · 출전 중</span><h3>출전 진형 · ${state.formation.length}/3</h3><p>${this.formationEnemyNote(state)}</p></div><span class="formation-readiness">${state.formation.length >= 3 ? '출정 준비 완료' : '빈 자리가 있습니다'}</span></div><div class="formation-slots">${[0, 1, 2].map(index => this.formationSlot(state, index)).join('')}</div></div>${this.comboAdvice(state)}<div class="formation-bench-head"><div><span class="eyebrow">대기 무장</span><h3>대기 중인 보유 무장</h3></div><div class="roster-sort-controls formation-sort-controls"><label>정렬 <select data-action="formation-sort">${sortOptions.map(([value, label]) => `<option value="${value}" ${this.formationSort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="sort-direction" data-action="formation-sort-direction" title="정렬 방향">${this.formationSortDescending ? '↓' : '↑'}</button></div></div><div class="formation-bench">${bench.length ? bench.map(general => this.formationBenchCard(general, 0, state)).join('') : '<div class="formation-empty glass-card">모든 보유 무장이 편성되었습니다.</div>'}</div></section>`
  }

  private equipmentSection(state: StrategyState): string {
    const selected = state.generals.find(general => general.id === state.selectedEquipmentGeneralId) ?? state.generals[0]
    const selectableGenerals = this.sortedEquipmentGenerals(state)
    const loadout = selected ? state.equipmentLoadouts[selected.id] ?? {} : {}
    const equipped = new Set(Object.values(loadout))
    const setCounts = equipmentSetCounts(state, selected?.id ?? '')
    const activeSets = (Object.keys(EQUIPMENT_SET_META) as Array<keyof typeof EQUIPMENT_SET_META>).filter(set => (setCounts[set] ?? 0) >= 2)
    const managementOnly = state.section === 'equipment'
    const recent = !managementOnly && state.lastEquipmentDraw.length ? `<div class="equipment-draw-results glass-card"><div class="card-header"><div><span class="eyebrow">최근 획득</span><h3>이번 뽑기 결과</h3></div><span class="rate-note">${state.lastEquipmentDraw.length}개 획득</span></div><div class="equipment-mini-row">${state.lastEquipmentDraw.map(item => this.equipmentMiniCard(item)).join('')}</div><div class="equipment-extra-draw"><span>더 뽑으시겠습니까?</span><button class="mini-action" data-action="equipment-draw" data-count="1">1회 추가 뽑기 <span class="cost">${icon('honor', 'gi--cost')}240</span></button><button class="mini-action" data-action="equipment-draw" data-count="10">10회 추가 뽑기 <span class="cost">${icon('honor', 'gi--cost')}2,200</span></button></div></div>` : ''
    const setBonusPanel = `<div class="equipment-set-bonuses glass-card"><div class="card-header"><div><span class="eyebrow">세트 효과</span><h3>종류별 세트 능력</h3></div><span class="rate-note">${selected?.name ?? '무장'} 기준</span></div><div class="set-bonus-grid">${(Object.keys(EQUIPMENT_SET_META) as Array<keyof typeof EQUIPMENT_SET_META>).map(set => { const count = setCounts[set] ?? 0; const meta = EQUIPMENT_SET_META[set]; return `<div class="set-bonus-card ${count >= 2 ? 'is-active' : ''}" style="--set-color:${EQUIPMENT_GRADE_META.legendary.color}"><strong>${meta.label}</strong><span>${count}/3 장착</span><small>2세트 · ${meta.twoPiece}</small><small>3세트 · ${meta.threePiece}</small></div>` }).join('')}</div>${activeSets.length ? `<p class="set-active-note">활성 세트: ${activeSets.map(set => EQUIPMENT_SET_META[set].label).join(' · ')}</p>` : '<p class="set-active-note is-muted">같은 세트 장비를 2개 이상 장착하면 세트 능력이 활성화됩니다.</p>'}</div>`
    const equipmentHero = managementOnly ? `<div class="equipment-hero glass-card equipment-management-hero"><div class="equip-overview"><div class="equip-overview__head"><h2>출전 무장 장비 현황</h2><span class="mythic-stone-note">낙양 강화석 <b>${state.mythicStones}</b>개 · 신화장비 강화 1회에 1개</span></div><div class="equip-overview__rows">${state.formation.map((id, index) => { const general = state.generals.find(item => item.id === id); if (!general) return ''; const filled = Object.values(state.equipmentLoadouts[id] ?? {}).filter(Boolean).length; const sets = Object.entries(equipmentSetCounts(state, id)).filter(([, count]) => (count ?? 0) >= 2).map(([set, count]) => `${EQUIPMENT_SET_META[set as keyof typeof EQUIPMENT_SET_META].label} ${count}`).join(' · '); return `<button class="equip-overview__row ${general.id === selected?.id ? 'is-active' : ''} ${filled < 3 ? 'is-missing' : ''}" data-action="equip-general" data-id="${general.id}"><span>${['좌측', '중앙', '우측'][index]}</span><strong>${general.name}</strong><em>장비 ${filled}/3</em><small>${sets || '세트 효과 없음'}</small></button>` }).join('')}</div></div></div>` : `<div class="equipment-hero glass-card"><div><span class="pill pill--gold">장비 뽑기</span><h2>천하의 병장기</h2><p>노멀부터 전설까지 획득할 수 있습니다. 신화 장비는 추후 이벤트로만 지급됩니다.</p></div><div class="equipment-draw-actions"><button class="action-button action-button--primary" data-action="equipment-draw" data-count="1"><span>1회 뽑기</span><b class="cost">${icon('honor', 'gi--cost')}240</b></button><button class="action-button action-button--outline" data-action="equipment-draw" data-count="10"><span>10회 연속</span><b class="cost">${icon('honor', 'gi--cost')}2,200</b></button></div></div>`
    if (managementOnly) return this.equipmentManageSection(state, selected, selectableGenerals, loadout, equipped, setBonusPanel, activeSets)
    return `<section class="page-section page-section--equipment"><div class="section-heading section-heading--compact"><div><span class="eyebrow">육성</span><h1>장비 관리</h1><p class="heading-copy">무기·갑옷·장신구를 장착하고 강화해 무장의 네 가지 전투 능력과 세트 능력을 끌어올리십시오.</p></div><div class="section-counter"><span>보유 장비</span><strong>${equipmentInventoryCount(state)}</strong></div></div>${equipmentHero}<div class="equipment-layout"><div><div class="equipment-toolbar glass-card"><div><span class="eyebrow">장착 무장</span><h3>장착 무장</h3><small>장비 반영 전투력 높은 순</small></div><button class="mini-action mini-action--deploy equipment-auto" data-action="auto-equip" title="출전 무장 3명에게 가장 좋은 장비 조합을 장착">출전 무장 자동 장착</button><select data-action="equipment-general">${selectableGenerals.map(general => `<option value="${general.id}" ${general.id === selected?.id ? 'selected' : ''}>${general.name} · ${formatNumber(combatPower(general) + equipmentPowerForUi(state, general.id))}</option>`).join('')}</select></div><div class="equipment-slots glass-card">${(['weapon', 'armor', 'accessory'] as EquipmentType[]).map(type => this.equipmentSlot(type, loadout[type], state, selected?.id ?? '')).join('')}</div>${selected ? this.equipmentPresetBar(state, selected.id) : ''}${setBonusPanel}${recent}</div><div><div class="equipment-inventory"><div class="equipment-inventory-toolbar"><div class="card-header"><div><span class="eyebrow">보관 장비</span><h3>보유 장비</h3></div><span class="rate-note">${state.equipmentInventory.length}줄 · ${formatNumber(equipmentInventoryCount(state))}개</span></div><div class="equipment-sort-controls"><label>정렬 <select data-action="equipment-sort"><option value="grade" ${this.equipmentSort === 'grade' ? 'selected' : ''}>등급</option><option value="level" ${this.equipmentSort === 'level' ? 'selected' : ''}>강화 레벨</option><option value="name" ${this.equipmentSort === 'name' ? 'selected' : ''}>이름</option></select></label><button class="sort-direction" data-action="equipment-sort-direction">${this.equipmentSortDescending ? '↓' : '↑'}</button></div></div><div class="equipment-manage">${this.equipmentManageBar(state)}</div>${this.equipmentVirtualList(state, selected?.id ?? '', equipped)}</div></div></div></section>`
  }

  /** 장비 관리(간단히 보기): 무장 고르기 → 장비 3칸 → 보유 장비. 프리셋 · 세트 능력 · 필터는 접어 둔다 */
  private equipmentManageSection(state: StrategyState, selected: General | undefined, selectable: General[], loadout: Partial<Record<EquipmentType, string>>, equipped: Set<string>, setBonusPanel: string, activeSets: Array<keyof typeof EQUIPMENT_SET_META>): string {
    const lanes = ['좌측', '중앙', '우측']
    const chips = state.formation.map((id, index) => {
      const general = state.generals.find(item => item.id === id)
      if (!general) return ''
      const filled = Object.values(state.equipmentLoadouts[id] ?? {}).filter(Boolean).length
      return `<button class="equip-chip ${general.id === selected?.id ? 'is-active' : ''} ${filled < 3 ? 'is-missing' : ''}" data-action="equip-general" data-id="${general.id}">${this.portrait(general, 'equip-chip__face')}<span class="equip-chip__text"><small>${lanes[index] ?? ''}</small><strong>${escapeHtml(general.name)}</strong><em>장비 ${filled}/3</em></span></button>`
    }).join('')
    const others = selectable.filter(general => !state.formation.includes(general.id))
    const picker = `<div class="equip-picker glass-card"><div class="equip-picker__head"><h3>무장 선택</h3><span class="mythic-stone-note">낙양 강화석 <b>${state.mythicStones}</b></span><button class="mini-action mini-action--deploy equipment-auto" data-action="auto-equip" title="출전 무장 3명에게 가장 좋은 장비 조합을 장착">출전 무장 자동 장착</button></div><div class="equip-picker__chips">${chips}</div>${others.length ? `<select class="equip-picker__others" data-action="equipment-general" aria-label="다른 무장"><option value="" ${state.formation.includes(selected?.id ?? '') ? 'selected' : ''} disabled>다른 무장 고르기 (${others.length}명)</option>${others.map(general => `<option value="${general.id}" ${general.id === selected?.id ? 'selected' : ''}>${general.name} · ${formatNumber(combatPower(general) + equipmentPowerForUi(state, general.id))}</option>`).join('')}</select>` : ''}</div>`
    const setLine = activeSets.length ? `<p class="equip-set-line">세트 효과 · ${activeSets.map(set => EQUIPMENT_SET_META[set].label).join(' · ')}</p>` : '<p class="equip-set-line is-muted">같은 세트를 2개 이상 끼면 세트 효과가 붙습니다</p>'
    const slots = `<div class="equipment-slots glass-card"><div class="equip-slots__head"><h3>${escapeHtml(selected?.name ?? '무장')}의 장비</h3>${selected ? `<b>전투력 ${formatNumber(combatPower(selected) + equipmentPowerForUi(state, selected.id))}</b>` : ''}</div><div class="equip-slots__row">${(['weapon', 'armor', 'accessory'] as EquipmentType[]).map(type => this.equipmentSlot(type, loadout[type], state, selected?.id ?? '')).join('')}</div>${setLine}</div>`
    const more = `<details class="equipment-more glass-card" ${this.equipmentMoreOpen ? 'open' : ''}><summary data-action="equipment-more">프리셋 · 세트 능력 자세히 보기</summary>${selected ? this.equipmentPresetBar(state, selected.id) : ''}${setBonusPanel}</details>`
    const f = this.equipmentFilter
    const applied = [f.set, f.grade, f.owner].filter(value => value !== 'all').length
    const tabs = `<div class="equip-type-tabs setting-seg" role="group" aria-label="부위">${([['all', '전체'], ['weapon', EQUIPMENT_TYPE_META.weapon.label], ['armor', EQUIPMENT_TYPE_META.armor.label], ['accessory', EQUIPMENT_TYPE_META.accessory.label]] as Array<[string, string]>).map(([value, label]) => `<button class="setting-seg__btn ${f.type === value ? 'is-active' : ''}" data-action="equipment-type-tab" data-type="${value}">${label}</button>`).join('')}</div>`
    const filterMore = `<details class="equipment-filter-more" ${this.equipmentFilterOpen ? 'open' : ''}><summary data-action="equipment-filter-more">필터 · 일괄 분해${applied ? ` <b>${applied}개 적용</b>` : ''}</summary><div class="equipment-manage">${this.equipmentManageBar(state, false)}</div></details>`
    const inventory = `<div class="equipment-inventory"><div class="equipment-inventory-toolbar"><div class="card-header"><div><h3>보유 장비</h3></div><span class="rate-note">${formatNumber(equipmentInventoryCount(state))}개</span></div><div class="equipment-sort-controls"><label>정렬 <select data-action="equipment-sort"><option value="grade" ${this.equipmentSort === 'grade' ? 'selected' : ''}>등급</option><option value="level" ${this.equipmentSort === 'level' ? 'selected' : ''}>강화 레벨</option><option value="name" ${this.equipmentSort === 'name' ? 'selected' : ''}>이름</option></select></label><button class="sort-direction" data-action="equipment-sort-direction">${this.equipmentSortDescending ? '↓' : '↑'}</button></div></div>${tabs}${filterMore}${this.equipmentVirtualList(state, selected?.id ?? '', equipped)}</div>`
    return `<section class="page-section page-section--equipment page-section--equipment-simple"><div class="section-heading section-heading--compact"><div><span class="eyebrow">육성</span><h1>장비 관리</h1><p class="heading-copy">무장을 고르고, 장비 칸을 채우고, 아래 목록에서 장착 · 강화합니다.</p></div><div class="section-counter"><span>보유 장비</span><strong>${equipmentInventoryCount(state)}</strong></div></div>${picker}<div class="equipment-layout"><div>${slots}${more}</div><div>${inventory}</div></div></section>`
  }

  /** 모집 · 장비 > 장비 뽑기: 뽑기만(장착·강화·보유 목록은 ‘장비 관리’에서). 무장 모집과 같은 짜임 */
  private equipmentDrawSection(state: StrategyState): string {
    const rates: Array<[EquipmentGrade, string]> = [['legendary', '5%'], ['unique', '12%'], ['rare', '28%'], ['normal', '55%']]
    const rank: Record<EquipmentGrade, number> = { normal: 1, rare: 2, unique: 3, legendary: 4, mythic: 5 }
    const best = [...state.lastEquipmentDraw].sort((a, b) => rank[b.grade] - rank[a.grade])[0]
    const recent = best ? `<div class="glass-card recruit-result gear-draw-recent"><span class="eyebrow">최근 획득</span><div class="result-card-row"><div class="gear-draw-recent__icon" style="--grade:${EQUIPMENT_GRADE_META[best.grade].color}"><img src="${equipmentImage(best.type)}" alt="" width="72" height="72"></div><div><h3>${escapeHtml(best.name)}</h3><p>${EQUIPMENT_GRADE_META[best.grade].label} · ${EQUIPMENT_TYPE_META[best.type].label} · ${escapeHtml(EQUIPMENT_SET_META[best.set].label)}</p><small>이번에 ${state.lastEquipmentDraw.length}개 획득</small></div></div><div class="equipment-mini-row">${state.lastEquipmentDraw.slice(0, 10).map(item => this.equipmentMiniCard(item)).join('')}</div></div>` : ''
    const freeDraws = state.missions?.freeDraws ?? 0
    return `<section class="page-section page-section--recruit page-section--gear-draw"><div class="section-heading section-heading--compact"><div><span class="eyebrow">육성</span><h1>장비 뽑기</h1><p class="heading-copy">무기·갑옷·장신구를 뽑습니다. 장착과 강화는 장비 관리에서 합니다.</p></div><div class="section-counter"><span>보유 장비</span><strong>${equipmentInventoryCount(state)}</strong></div></div><div class="recruit-layout"><div class="recruit-pedestal glass-card"><div class="pedestal-glow"></div><div class="summon-banner" role="img" aria-label="대장간에서 갓 나온 천하의 병장기"><figure class="summon-banner__slide summon-banner__slide--solo"><img src="/assets/ui/forge-montage.webp" alt="" width="720" height="900" draggable="false"><figcaption><b>명장의 병기</b><span>천하의 병장기가 모인다</span></figcaption></figure><img class="summon-banner__jade" src="/assets/ui/jade-summon.svg" alt="" width="64" height="80" draggable="false"></div><div class="recruit-copy"><span class="pill pill--gold">무료 게임 내 재화</span><h2>천하의 병장기</h2><p>대장간의 불꽃이 새 병기를 벼려 냅니다.<br>같은 세트 3개를 모으면 세트 능력이 붙습니다.</p></div><div class="recruit-actions"><button class="action-button action-button--primary" data-action="equipment-draw" data-count="1"><span>1회 뽑기</span><b class="cost">${freeDraws >= 1 ? '무료권' : `${icon('honor', 'gi--cost')}240`}</b></button><button class="action-button action-button--outline" data-action="equipment-draw" data-count="10"><span>10회 연속 뽑기</span><b class="cost">${freeDraws >= 10 ? '무료권' : `${icon('honor', 'gi--cost')}2,200`}</b></button></div>${freeDraws > 0 ? `<p class="free-ticket-note">출석 보상 무료 뽑기권 <b>${freeDraws}회</b> 남음 · 뽑으면 먼저 쓰입니다</p>` : ''}<div class="fair-play-note"><span>◎</span><span>현금 결제 없음 · 뽑기 확률 상시 공개</span></div></div><div class="recruit-side"><div class="glass-card rate-card"><div class="card-header"><div><span class="eyebrow">확률표</span><h3>뽑기 확률</h3></div><span class="rate-note">1회 기준</span></div>${rates.map(([grade, rate]) => `<div class="rate-row"><span class="grade-dot" style="--grade:${EQUIPMENT_GRADE_META[grade].color}"></span><span>${EQUIPMENT_GRADE_META[grade].label}</span><strong>${rate}</strong><div class="rate-track"><i style="width:${rate};background:${EQUIPMENT_GRADE_META[grade].color}"></i></div></div>`).join('')}<div class="rate-footnote">* 신화 장비(${escapeHtml(MYTHIC_EVENT_EQUIPMENT.name)})는 이벤트로만 지급되며 뽑기로는 나오지 않습니다.</div></div>${recent}<button class="action-button action-button--outline gear-draw-manage" data-action="section" data-section="equipment">장비 관리로 · 장착 · 강화</button></div></div></section>`
  }

  private equipmentVirtualList(state: StrategyState, generalId: string, equipped: Set<string>): string {
    // 이 무장이 낀 장비 → 아무도 안 낀 장비 → 다른 무장이 낀 장비 순
    const others = new Set(Object.entries(state.equipmentLoadouts ?? {}).filter(([owner]) => owner !== generalId).flatMap(([, loadout]) => Object.values(loadout ?? {})))
    const rank = (item: Equipment) => equipped.has(item.id) ? 0 : others.has(item.id) ? 2 : 1
    const owners = equipmentOwners(state)
    const f = this.equipmentFilter
    const items = this.sortedEquipment(state)
      .filter(item => (f.type === 'all' || item.type === f.type) && (f.set === 'all' || item.set === f.set) && (f.grade === 'all' || item.grade === f.grade) && (f.owner === 'all' || (f.owner === 'equipped' ? owners.has(item.id) : f.owner === 'locked' ? Boolean(item.locked) : !owners.has(item.id))))
      .map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(entry => entry.item)
    this.equipmentOwnerNames = new Map([...owners].map(([itemId, generalId]) => [itemId, state.generals.find(general => general.id === generalId)?.name ?? '']))
    if (!items.length) return '<div class="rank-empty equipment-empty">조건에 맞는 장비가 없습니다. 필터를 바꿔 보십시오.</div>'
    const start = Math.max(0, Math.floor(this.equipmentScrollTop / this.equipmentRowHeight) - 3)
    const count = Math.ceil(720 / this.equipmentRowHeight) + 6
    const visible = items.slice(start, start + count)
    return `<div class="equipment-inventory-scroll" data-equipment-scroll><div class="equipment-virtual-list" style="height:${items.length * this.equipmentRowHeight}px"><div class="equipment-virtual-window" style="transform:translateY(${start * this.equipmentRowHeight}px)">${visible.map(item => this.equipmentCard(item, generalId, equipped.has(item.id))).join('')}</div></div></div>`
  }

  private equipmentSlot(type: EquipmentType, itemId: string | undefined, state: StrategyState, generalId: string): string {
    const item = itemId ? this.equipmentById(state).get(itemId) : undefined
    const action = item ? `<button class="equipment-slot-unequip" data-action="equipment-unequip" data-equipment-type="${type}" data-general-id="${generalId}">장착 해제</button>` : ''
    const specialty = item ? equipmentSpecialty(item) : undefined
    return `<div class="equipment-slot ${item ? 'is-filled' : ''}"><span class="equipment-slot-icon"><img src="${equipmentImage(type)}" alt="${EQUIPMENT_TYPE_META[type].label}" /></span><div><small>${EQUIPMENT_TYPE_META[type].label}</small>${item ? `<strong style="--grade:${EQUIPMENT_GRADE_META[item.grade].color}">${item.name}</strong><em>Lv.${item.level} · ${EQUIPMENT_GRADE_META[item.grade].label}</em>${specialty ? `<b class="equipment-specialty-line">특기 · ${escapeHtml(specialty.label)}</b>` : ''}${action}` : '<strong>비어 있음</strong><em>보유 장비를 선택하십시오</em>'}</div></div>`
  }

  private equipmentCard(item: Equipment, generalId: string, equipped: boolean): string {
    const grade = EQUIPMENT_GRADE_META[item.grade]
    const set = EQUIPMENT_SET_META[item.set]
    const specialty = equipmentSpecialty(item)
    return `<article class="equipment-card ${equipped ? 'is-equipped' : ''}" style="--grade:${grade.color}"><div class="equipment-card-top"><span class="equipment-type"><img loading="lazy" decoding="async" width="21" height="21" src="${equipmentImage(item.type)}" alt="" /> ${EQUIPMENT_TYPE_META[item.type].label}</span><span class="equipment-grade">${grade.label}${(item.quantity ?? 1) > 1 ? ` · ×${item.quantity}` : ''}</span><button class="equipment-lock ${item.locked ? 'is-locked' : ''}" data-action="equipment-lock" data-equipment-id="${item.id}" title="${item.locked ? '잠금 해제' : '잠그면 분해되지 않습니다'}" aria-label="${item.locked ? '잠금 해제' : '잠금'}">${item.locked ? '🔒' : '🔓'}</button></div>${this.equipmentOwnerNames.get(item.id) ? `<span class="equipment-owner">${escapeHtml(this.equipmentOwnerNames.get(item.id) ?? '')} 장착</span>` : ''}<img loading="lazy" decoding="async" width="72" height="72" class="equipment-image ${item.grade === 'mythic' ? 'equipment-image--mythic' : ''}" src="${equipmentImage(item.type)}" alt="${EQUIPMENT_TYPE_META[item.type].label}" /><h4>${item.name}</h4><p>${set.label} · ${item.skillName}</p><div class="equipment-stat"><b>${STAT_LABEL[item.mainStat] ?? item.mainStat}</b><strong>+${equipmentValue(item)}</strong><span>Lv.${item.level}/20</span></div><small>${item.skillDescription}</small>${specialty ? `<div class="equipment-specialty"><b>특기 · ${escapeHtml(specialty.label)}</b><span>${escapeHtml(specialty.description)}</span></div>` : ''}<div class="equipment-card-actions">${item.grade === 'mythic' ? `<div class="mythic-preview">${item.level >= 20 ? `최고 단계 · ${STAT_LABEL[item.mainStat] ?? item.mainStat} +${equipmentValue(item)}` : `강화 시 ${STAT_LABEL[item.mainStat] ?? item.mainStat} +${equipmentValue(item)} → <b>+${equipmentValue({ ...item, level: item.level + 1 })}</b> · 최대(Lv.20) +${equipmentValue({ ...item, level: 20 })}`}</div><button class="mini-action mini-action--mythic" data-action="equipment-enhance" data-equipment-id="${item.id}" title="신화장비는 낙양 강화석으로만 강화합니다(낙양 점령 1회당 1개)" ${item.level >= 20 || (this.renderedState?.mythicStones ?? 0) < 1 ? 'disabled' : ''}>${item.level >= 20 ? '최고 단계' : `강화 · 낙양 강화석 1 (보유 ${this.renderedState?.mythicStones ?? 0})`}</button>` : `<button class="mini-action" data-action="equipment-enhance" data-equipment-id="${item.id}">강화 <span class="cost">${icon('silver', 'gi--cost')}${compactNumber(equipmentCost(item, this.renderedState ?? undefined).silver ?? 0)}</span><span class="cost">${icon('iron', 'gi--cost')}${compactNumber(equipmentCost(item, this.renderedState ?? undefined).iron ?? 0)}</span></button>`}${equipped ? `<button class="mini-action" data-action="equipment-unequip" data-equipment-type="${item.type}" data-general-id="${generalId}">장착 해제</button>` : `<button class="mini-action" data-action="equipment-equip" data-equipment-id="${item.id}" data-general-id="${generalId}">장착</button>`}${item.grade !== 'mythic' && !item.locked && (item.quantity ?? 1) - (this.equipmentOwnerNames.has(item.id) ? 1 : 0) > 0 ? `<button class="mini-action mini-action--ghost" data-action="equipment-dismantle" data-equipment-id="${item.id}">분해</button>` : ''}</div></article>`
  }

  private equipmentOwnerNames = new Map<string, string>()

  /** 보관함 필터·일괄 분해·보관 경고 */
  private equipmentManageBar(state: StrategyState, withType = true): string {
    const f = this.equipmentFilter
    const opt = (key: keyof typeof f, value: string, label: string) => `<option value="${value}" ${f[key] === value ? 'selected' : ''}>${label}</option>`
    const filters = `<div class="equipment-filters">
      ${withType ? `<select data-action="equipment-filter" data-key="type" aria-label="부위">${opt('type', 'all', '부위 전체')}${(['weapon', 'armor', 'accessory'] as EquipmentType[]).map(type => opt('type', type, EQUIPMENT_TYPE_META[type].label)).join('')}</select>` : ''}
      <select data-action="equipment-filter" data-key="set" aria-label="세트">${opt('set', 'all', '세트 전체')}${(Object.keys(EQUIPMENT_SET_META) as Array<keyof typeof EQUIPMENT_SET_META>).map(set => opt('set', set, EQUIPMENT_SET_META[set].label)).join('')}</select>
      <select data-action="equipment-filter" data-key="grade" aria-label="등급">${opt('grade', 'all', '등급 전체')}${(['mythic', 'legendary', 'unique', 'rare', 'normal'] as EquipmentGrade[]).map(grade => opt('grade', grade, EQUIPMENT_GRADE_META[grade].label)).join('')}</select>
      <select data-action="equipment-filter" data-key="owner" aria-label="장착">${opt('owner', 'all', '장착 전체')}${opt('owner', 'equipped', '장착 중')}${opt('owner', 'free', '미장착')}${opt('owner', 'locked', '잠금')}</select>
    </div>`
    const bulk = (['normal', 'rare'] as const).map(grade => { const preview = bulkDismantlePreview(state, grade); return `<button class="mini-action equipment-bulk" data-action="equipment-bulk-dismantle" data-grade="${grade}" ${preview.count ? '' : 'disabled'}>${EQUIPMENT_GRADE_META[grade].label}${grade === 'normal' ? '' : ' 이하'} 일괄 분해 <span>${formatNumber(preview.count)}개</span></button>` }).join('')
    const warn = state.equipmentInventory.length > EQUIPMENT_STORAGE_WARN ? `<p class="equipment-storage-warn">보관 장비가 ${formatNumber(state.equipmentInventory.length)}줄로 많습니다. 일괄 분해로 정리하면 옥패·철을 돌려받습니다.</p>` : ''
    return `${filters}<div class="equipment-bulk-row">${bulk}<small>잠금·장착·강화한 장비와 신화장비는 빠집니다</small></div>${warn}`
  }

  /** 선택한 무장의 장비 프리셋 3칸(저장 · 장착) */
  private equipmentPresetBar(state: StrategyState, generalId: string): string {
    const list = state.equipmentPresets?.[generalId] ?? []
    const names = this.equipmentById(state)
    const slots = Array.from({ length: EQUIPMENT_PRESET_SLOTS }, (_, slot) => {
      const preset = list[slot]
      const items = preset ? Object.values(preset).map(id => names.get(id ?? '')).filter((item): item is Equipment => Boolean(item)) : []
      const summary = preset ? (items.length ? items.map(item => `${EQUIPMENT_TYPE_META[item.type].label} ${EQUIPMENT_GRADE_META[item.grade].label}`).join(' · ') : '장비 없음') : '비어 있음'
      return `<div class="equipment-preset ${preset ? 'is-filled' : ''}"><strong>프리셋 ${slot + 1}</strong><small>${escapeHtml(summary)}</small><div><button class="mini-action" data-action="equipment-preset" data-mode="apply" data-slot="${slot}" data-general-id="${generalId}" ${preset ? '' : 'disabled'}>장착</button><button class="mini-action mini-action--ghost" data-action="equipment-preset" data-mode="save" data-slot="${slot}" data-general-id="${generalId}">지금 장비 저장</button></div></div>`
    }).join('')
    return `<div class="equipment-presets glass-card"><div class="card-header"><div><span class="eyebrow">장비 프리셋</span><h3>상황별 장비 조합</h3></div><span class="rate-note">시나리오·대련·공성용으로 저장해 두고 한 번에 바꿉니다</span></div><div class="equipment-preset-grid">${slots}</div></div>`
  }

  private equipmentMiniCard(item: Equipment): string {
    const grade = EQUIPMENT_GRADE_META[item.grade]
    return `<span class="equipment-mini-card" style="--grade:${grade.color}"><img src="${equipmentImage(item.type)}" alt="" /><b>${grade.label}</b><strong>${item.name}</strong><small>${EQUIPMENT_TYPE_META[item.type].label} · +${equipmentValue(item)}${(item.quantity ?? 1) > 1 ? ` · x${item.quantity}` : ''}</small></span>`
  }

  private sortedEquipment(state: StrategyState): Equipment[] {
    const gradeRank: Record<EquipmentGrade, number> = { normal: 1, rare: 2, unique: 3, legendary: 4, mythic: 5 }
    const direction = this.equipmentSortDescending ? -1 : 1
    const levelSum = state.equipmentInventory.reduce((sum, item) => sum + item.level, 0)
    const key = `${state.equipmentInventory.length}:${levelSum}:${this.equipmentSort}:${this.equipmentSortDescending}`
    if (this.equipmentSortCache?.key === key) return this.equipmentSortCache.items
    const items = [...state.equipmentInventory].sort((a, b) => {
      const left = this.equipmentSort === 'grade' ? gradeRank[a.grade] : this.equipmentSort === 'level' ? a.level : a.name
      const right = this.equipmentSort === 'grade' ? gradeRank[b.grade] : this.equipmentSort === 'level' ? b.level : b.name
      if (left < right) return -1 * direction
      if (left > right) return 1 * direction
      return a.name.localeCompare(b.name, 'ko')
    })
    this.equipmentSortCache = { key, items }
    return items
  }

  private equipmentById(state: StrategyState): Map<string, Equipment> {
    if (this.equipmentIndexSource !== state.equipmentInventory || this.equipmentIndex.size !== state.equipmentInventory.length) {
      this.equipmentIndexSource = state.equipmentInventory
      this.equipmentIndex = new Map(state.equipmentInventory.map(item => [item.id, item]))
    }
    return this.equipmentIndex
  }

  private handleScroll = (event: Event): void => {
    const target = event.target as HTMLElement
    if (!target.matches('[data-equipment-scroll]') || !this.renderedState || this.renderedState.section !== 'equipment') return
    this.equipmentScrollTop = target.scrollTop
    if (this.equipmentScrollFrame !== null) return
    this.equipmentScrollFrame = window.requestAnimationFrame(() => {
      this.equipmentScrollFrame = null
      const state = this.renderedState
      if (!state || state.section !== 'equipment') return
      const selected = state.generals.find(general => general.id === state.selectedEquipmentGeneralId) ?? state.generals[0]
      const loadout = selected ? state.equipmentLoadouts[selected.id] ?? {} : {}
      const windowNode = target.querySelector<HTMLElement>('.equipment-virtual-window')
      if (windowNode) windowNode.outerHTML = this.equipmentVirtualWindow(state, selected?.id ?? '', new Set(Object.values(loadout)))
    })
  }

  private equipmentVirtualWindow(state: StrategyState, generalId: string, equipped: Set<string>): string {
    const items = this.sortedEquipment(state)
    const start = Math.max(0, Math.floor(this.equipmentScrollTop / this.equipmentRowHeight) - 3)
    const count = Math.ceil(720 / this.equipmentRowHeight) + 6
    return `<div class="equipment-virtual-window" style="transform:translateY(${start * this.equipmentRowHeight}px)">${items.slice(start, start + count).map(item => this.equipmentCard(item, generalId, equipped.has(item.id))).join('')}</div>`
  }

  private sortedOwnedGenerals(state: StrategyState): General[] {
    return [...state.generals].sort((a, b) => {
      const direction = this.rosterSortDescending ? -1 : 1
      const values: Record<RosterSort, [string | number, string | number]> = {
        power: [combatPower(a) + equipmentPowerForUi(state, a.id), combatPower(b) + equipmentPowerForUi(state, b.id)], level: [a.level, b.level], grade: [a.grade, b.grade], name: [a.name, b.name], role: [a.role, b.role],
      }
      const [left, right] = values[this.rosterSort]
      if (left < right) return -1 * direction
      if (left > right) return 1 * direction
      return a.name.localeCompare(b.name, 'ko')
    })
  }

  private sortedEquipmentGenerals(state: StrategyState): General[] {
    return [...state.generals].sort((a, b) => {
      const powerDifference = (combatPower(b) + equipmentPowerForUi(state, b.id)) - (combatPower(a) + equipmentPowerForUi(state, a.id))
      if (powerDifference !== 0) return powerDifference
      if (b.grade !== a.grade) return b.grade - a.grade
      if (b.level !== a.level) return b.level - a.level
      return a.name.localeCompare(b.name, 'ko')
    })
  }

  private sortedFormationBench(state: StrategyState, squad = 0): General[] {
    const direction = this.formationSortDescending ? -1 : 1
    const members = squadIds(state, squad)
    return state.generals.filter(general => !members.includes(general.id)).sort((a, b) => {
      const left = this.formationSort === 'power' ? combatPower(a) + equipmentPowerForUi(state, a.id) : a.grade
      const right = this.formationSort === 'power' ? combatPower(b) + equipmentPowerForUi(state, b.id) : b.grade
      if (left < right) return -1 * direction
      if (left > right) return 1 * direction
      return a.name.localeCompare(b.name, 'ko')
    })
  }

  private sortLabel(): string {
    return ({ power: '전투력', level: '레벨', grade: '등급', name: '이름', role: '병과' } as Record<RosterSort, string>)[this.rosterSort]
  }


  private territorySection(state: StrategyState): string {
    const selected = state.cities.find(city => city.id === state.selectedCityId) ?? state.cities[0]
    const income = selected ? cityIncome(selected, state) : { grain: 0, silver: 0, wood: 0, iron: 0, influence: 0 }
    const owned = state.cities.filter(city => city.owner === state.faction).length
    const contested = state.cities.filter(city => city.owner !== state.faction).length
    const incomeWait = incomeCooldownRemaining(state)
    const incomeLabel = incomeWait ? `오늘 수확 완료 · ${Math.ceil(incomeWait / 3600000)}시간 후` : '오늘의 내정 수확'
    return `<section class="page-section page-section--territory${this.citySheetOpen ? ' is-sheet-open' : ''}"><div class="section-heading section-heading--compact"><div><span class="eyebrow">육성</span><h1>영토 · 내정</h1><p class="heading-copy">내정을 키운 군세로 전선을 열고, 성벽을 무너뜨려 천하를 점령하십시오.</p>${this.operatorNote('공성 · 점령 · 수비병 · 도시 피해 순위가 영토전에 반영되지 않습니다.')}</div><div class="territory-heading-actions"><button class="action-button action-button--outline" data-action="territory-refresh">영토 새로고침 <span>↻</span></button><button class="action-button action-button--primary" data-action="collect-income">${incomeLabel} <span>✦</span></button></div></div><div class="conquest-overview glass-card"><div><span class="eyebrow">공략 전선</span><h3>영토 점령전</h3><p>출정할 때마다 식량·은전·철을 소모합니다. 공성 진전을 100%까지 쌓으면 ${state.faction}의 전선이 됩니다.</p></div><div class="conquest-overview-stats"><span><b>${owned}</b><small>아군 도시</small></span><span><b>${contested}</b><small>남은 전선</small></span><span><b>${formatNumber(conquestPower(state))}</b><small>출정 전투력</small></span><span><b>${formatNumber(state.factionWarScore)}</b><small>세력전 공헌도</small></span></div></div><div class="territory-layout"><div class="glass-card territory-map"><div class="card-header"><div><span class="eyebrow">삼국 영토</span><h3>천하 영토</h3></div><button class="sync-label sync-label--button" data-action="territory-refresh" data-territory-sync>${this.territorySyncText}</button></div>${this.mapViewport(state)}<div class="map-legend"><span><i class="legend-dot legend-dot--ally"></i>${state.faction} 영토</span><span><i class="legend-dot legend-dot--neutral"></i>중립</span><span><i class="legend-dot legend-dot--enemy"></i>타 세력</span><span><i class="legend-line"></i>연결 전선</span></div>${this.mobileCitySelector(state)}</div>${selected ? this.cityManagementCard(selected, income, state) : ''}</div></section>`
  }

  private mapCities(state: StrategyState): MapCity[] {
    const capitals = new Set(Object.values(FACTION_CAPITALS))
    const own = FACTION_CAPITALS[state.faction]
    return state.cities.map(city => {
      const pos = CITY_MAP_POSITIONS[city.id] ?? { x: 50, y: 50 }
      const group = this.cityGroup(city, state)
      const priority = (city.id === own ? 90 : capitals.has(city.id) ? 80 : 0) + (group === 'ally' ? 40 : group === 'front' ? 30 : 0) + city.level * 5
      return { id: city.id, name: city.name, x: pos.x, y: pos.y, priority }
    })
  }

  /** 아군 / 전선(아군 도시와 맞닿은 다른 세력·중립 도시) / 적 / 중립 */
  private cityGroup(city: City, state: StrategyState): Exclude<CityFilter, 'all'> {
    if (city.owner === state.faction) return 'ally'
    const touchesAlly = (CITY_ADJACENCY[city.id] ?? []).some(id => state.cities.find(c => c.id === id)?.owner === state.faction)
    if (touchesAlly) return 'front'
    return city.owner === '중립' ? 'neutral' : 'enemy'
  }

  private mapViewport(state: StrategyState): string {
    const home = FACTION_CAPITALS[state.faction]
    return `<div class="map-viewport" data-map-viewport data-lod="far"><div class="map-world map-canvas" data-map-world><div class="map-river"></div>${this.frontlineLines(state)}${state.cities.map(city => this.cityMarker(city, state.selectedCityId, state.faction)).join('')}${MAP_REGION_LABELS.map(region => `<span class="map-label map-label--province" style="left:${region.x}%;top:${region.y}%">${region.name}</span>`).join('')}</div><div class="map-controls"><button type="button" data-map-action="zoom-in" data-map-zoom-in aria-label="확대">+</button><button type="button" data-map-action="zoom-out" data-map-zoom-out aria-label="축소">−</button><button type="button" data-map-action="home" data-home="${home}" aria-label="내 영토로">◎</button><button type="button" data-map-action="fullscreen" aria-label="지도 전체 화면">${this.territoryMap.fullscreen ? '✕' : '□'}</button></div><div class="map-hint"><span class="hint-touch">두 손가락으로 확대 · 끌어서 이동 · 눌러서 도시 선택</span><span class="hint-mouse">휠로 확대 · 끌어서 이동 · 눌러서 도시 선택</span></div></div>`
  }

  private attachTerritoryMap(state: StrategyState): void {
    const viewport = this.root.querySelector<HTMLElement>('[data-map-viewport]')
    if (state.section !== 'territory' || !viewport) {
      this.territoryMap.detach()
      if (this.territoryMap.fullscreen) this.territoryMap.setFullscreen(false)
      this.citySheetOpen = false
      return
    }
    this.territoryMap.attach(viewport, this.mapCities(state), state.selectedCityId, FACTION_CAPITALS[state.faction])
    this.applyCityFinder()
  }

  private mobileCitySelector(state: StrategyState): string {
    const order: Record<Exclude<CityFilter, 'all'>, number> = { front: 0, ally: 1, enemy: 2, neutral: 3 }
    const rows = state.cities
      .map(city => ({ city, group: this.cityGroup(city, state) }))
      .sort((a, b) => order[a.group] - order[b.group] || b.city.level - a.city.level || a.city.name.localeCompare(b.city.name, 'ko'))
    const counts = { all: rows.length, front: 0, ally: 0, enemy: 0, neutral: 0 }
    rows.forEach(row => { counts[row.group] += 1 })
    const labels: Record<CityFilter, string> = { all: '전체', front: '전선', ally: '내 도시', enemy: '적', neutral: '중립' }
    const groupLabel: Record<Exclude<CityFilter, 'all'>, string> = { front: '전선', ally: '아군', enemy: '적', neutral: '중립' }
    const chips = (['all', 'front', 'ally', 'enemy', 'neutral'] as CityFilter[]).map(key => `<button type="button" class="city-filter-chip city-filter-chip--${key}" data-action="city-filter" data-filter="${key}">${labels[key]} <b>${counts[key]}</b></button>`).join('')
    const list = rows.map(({ city, group }) => `<button type="button" class="city-finder-row is-${group} ${state.selectedCityId === city.id ? 'is-selected' : ''}" data-action="city-find" data-city="${city.id}" data-group="${group}" data-name="${escapeHtml(city.name)}"><span class="city-finder-dot"></span><strong>${escapeHtml(city.name)}</strong><small>${groupLabel[group]} · ${escapeHtml(city.owner)}</small><em>Lv.${city.level}</em></button>`).join('')
    return `<div class="mobile-city-selector city-finder" data-city-finder><div class="city-finder-head"><span class="eyebrow">도시 찾기</span><small data-city-finder-count>${rows.length}개 도시</small></div><input class="city-finder-search" type="search" placeholder="도시 이름 검색" value="${escapeHtml(this.cityQuery)}" data-city-search enterkeyhint="search"><div class="city-finder-filters">${chips}</div><div class="city-finder-list">${list}</div><p class="city-finder-empty" data-city-finder-empty hidden>조건에 맞는 도시가 없습니다.</p></div>`
  }

  /** 검색어·필터를 목록에 바로 반영한다(화면 전체를 다시 그리지 않음). */
  private applyCityFinder(): void {
    const finder = this.root.querySelector<HTMLElement>('[data-city-finder]')
    if (!finder) return
    const query = this.cityQuery.trim()
    let shown = 0
    finder.querySelectorAll<HTMLElement>('.city-finder-row').forEach(row => {
      const visible = (this.cityFilter === 'all' || row.dataset.group === this.cityFilter) && (!query || (row.dataset.name ?? '').includes(query))
      row.hidden = !visible
      if (visible) shown += 1
    })
    finder.querySelectorAll<HTMLElement>('.city-filter-chip').forEach(chip => chip.classList.toggle('is-active', chip.dataset.filter === this.cityFilter))
    const count = finder.querySelector<HTMLElement>('[data-city-finder-count]')
    if (count) count.textContent = `${shown}개 도시`
    const empty = finder.querySelector<HTMLElement>('[data-city-finder-empty]')
    if (empty) empty.hidden = shown > 0
  }

  private handleInput = (event: Event): void => {
    const input = event.target as HTMLInputElement
    if (input.matches('[data-codex-search]')) { this.codexQuery = input.value; this.applyCodexSearch(); return }
    if (input.matches('[data-game-field]')) {
      // 관리자 게임 데이터: 바꾼 칸 표시
      input.classList.toggle('is-changed', input.value !== input.dataset.original)
      const row = input.closest<HTMLElement>('[data-game-user]')
      const changed = row?.querySelectorAll('[data-game-field].is-changed').length ?? 0
      const note = row?.querySelector<HTMLElement>('[data-game-changed]')
      if (note) note.textContent = changed ? `바꾼 칸 ${changed}개 · 저장을 눌러 반영하십시오` : '바꾼 칸만 저장됩니다.'
      return
    }
    if (!input.matches('[data-city-search]')) return
    this.cityQuery = input.value
    this.applyCityFinder()
  }

  private frontlineLines(state: StrategyState): string {
    const cities = new Map(state.cities.map(city => [city.id, city]))
    const drawn = new Set<string>()
    const lines: string[] = []
    Object.entries(CITY_ADJACENCY).forEach(([fromId, neighbors]) => {
      neighbors.forEach(toId => {
        const key = [fromId, toId].sort().join(':')
        if (drawn.has(key)) return
        drawn.add(key)
        const from = CITY_MAP_POSITIONS[fromId]
        const to = CITY_MAP_POSITIONS[toId]
        if (!from || !to) return
        const fromCity = cities.get(fromId)
        const toCity = cities.get(toId)
        if (!fromCity || !toCity) return
        const className = fromCity.owner === state.faction && toCity.owner === state.faction ? 'territory-frontline territory-frontline--owned' : fromCity.owner !== toCity.owner ? 'territory-frontline territory-frontline--contested' : 'territory-frontline territory-frontline--regional'
        lines.push(`<line class="${className}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`)
      })
    })
    return `<svg class="territory-frontlines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="도시 연결 전선">${lines.join('')}</svg>`
  }

  private cityMarker(city: City, selectedId: string, faction: StrategyState['faction']): string {
    const ownerClass = city.owner === faction ? 'is-ally' : city.owner === '중립' ? 'is-neutral' : 'is-enemy'
    const mapPosition = CITY_MAP_POSITIONS[city.id] ?? { x: 50, y: 50 }
    const position = `left:${mapPosition.x}%;top:${mapPosition.y}%`
    const castle = city.level >= 3 ? 'castle-city-major' : city.level === 2 ? 'castle-city-medium' : 'castle-city-minor'
    return `<button class="city-marker city-marker--lv${Math.min(city.level, 3)} ${ownerClass} ${selectedId === city.id ? 'is-selected' : ''}" data-action="city-select" data-city="${city.id}" style="${position}"><span class="city-marker-castle"><img src="/assets/territory/${castle}.webp" alt="${city.name} 성채" loading="eager"></span><span class="city-marker-level">${city.level}</span><strong>${city.name}</strong></button>`
  }

  /** 전투 기록 결과 표시: 중립 습격은 방어하는 우리 입장(방어 성공/실패), 유저 공격은 공격 성공/실패 */
  private battleLogBadge(log: { won: boolean; attackerKind: 'user' | 'ai' }): string {
    const good = log.attackerKind === 'ai' ? !log.won : log.won
    const label = log.attackerKind === 'ai' ? (log.won ? '방어 실패' : '방어 성공') : (log.won ? '공격 성공' : '공격 실패')
    return `<span class="city-battle-log-result ${good ? 'is-win' : 'is-loss'}">${label}</span>`
  }

  private cityManagementCard(city: City, income: ReturnType<typeof cityIncome>, state: StrategyState): string {
    const canManage = city.owner === state.faction
    const capitalFaction = capitalFactionForCity(city.id)
    const eligibility = conquestEligibility(state, city.id)
    const defense = Math.min(100, city.defense)
    const wallCapacity = cityWallCapacity(city)
    const metrics = [['민심', city.prosperity], ['성벽', defense], ['도시 등급', city.level * 20]] as const
    const siege = Math.min(100, city.conquestProgress ?? 0)
    const conquest = canManage ? this.defenseCard(city, state) : this.conquestCard(city, state, siege, eligibility)
    const panelClass = canManage ? 'city-management--owned' : 'city-management--frontline'
    const capitalBadge = capitalFaction ? `<span class="capital-badge">${capitalFaction} 본성 · 점령 불가</span>` : ''
    const frontierNote = canManage ? '내정 핵심지 · 방어선 유지' : eligibility.allowed ? `접경 전선 · ${eligibility.reason}` : '원거리 전선 · 진군 경로 차단'
    return `<div class="glass-card city-management ${panelClass}"><div class="city-sheet-bar"><span class="city-sheet-grip"></span><button class="city-sheet-close" data-action="city-sheet-close" aria-label="도시 정보 닫기">✕</button></div><div class="city-management-head"><div><span class="eyebrow">도시 관리 · ${city.region}</span><h2>${city.name}${city.id === 'luoyang' ? this.luoyangRulesMenu() : ''}</h2><p>${city.region} · ${city.owner === state.faction ? '아군 직할령' : `${city.owner} 관할`}</p></div><div class="city-management-status"><span class="city-level">Lv.${city.level}</span>${capitalBadge}</div></div><div class="city-map-context"><span>인접 전선</span><strong>${frontierNote}</strong><small>인접 도시 ${eligibility.neighborNames.length ? eligibility.neighborNames.join(' · ') : '독립 성 · 연결 전선 없음'}</small></div><div class="city-metrics">${metrics.map(([label, value]) => `<div><span>${label}</span><i><b style="width:${Math.min(value, 100)}%"></b></i><em>${value}</em></div>`).join('')}</div><p class="wall-status">성벽 방어도 ${formatNumber(city.defense)} / ${formatNumber(wallCapacity)} · 성벽을 0으로 깨고 수비병을 모두 물리치면 점령할 수 있습니다.</p>${conquest}${city.id === 'luoyang' ? this.luoyangHistoryCard(state) : ''}${this.cityDamageRankingCard(city)}${this.battleLogCard(city)}<div class="city-yield"><div class="card-header"><div><span class="eyebrow">예상 수확</span><h3>도시 생산량</h3></div><span class="rate-note">${canManage ? '수확 1회 기준' : '점령 후 활성화'}</span></div><div class="yield-grid">${(['grain', 'silver', 'wood', 'iron', 'influence'] as const).map(key => `<span style="--resource-color:${RESOURCE_META[key].color}">${icon(key, 'gi--inline')} ${RESOURCE_META[key].label} +${formatNumber(income[key])}</span>`).join('')}</div></div><div class="building-list"><div class="card-header"><div><span class="eyebrow">건물</span><h3>내정 건물</h3></div><span class="rate-note">${canManage ? '건물마다 생산 특화' : '정찰 정보'}</span></div>${city.buildings.map(building => this.buildingRow(city, building, canManage)).join('')}</div>${canManage ? '<p class="management-tip">병영을 강화하면 성벽이 더 튼튼해지고 방어도 회복 한도가 오릅니다.</p>' : '<p class="management-tip management-tip--warn">성벽을 깨고 수비병을 모두 물리친 뒤, 마지막 세력전에서 이기면 점령합니다.</p>'}</div>`
  }

  private cityDamageRankingCard(city: City): string {
    const rankings = this.cityDamageRankingCityId === city.id ? this.cityDamageRankings : []
    const rows = rankings.length ? rankings.map((entry, index) => `<li><span class="damage-rank-number">${index + 1}</span><strong>${ugc(entry.displayName)}</strong><small>${escapeHtml(entry.faction)} · ${entry.battleCount}회 참여</small><b>${formatNumber(entry.totalDamage)}</b></li>`).join('') : '<li class="city-damage-ranking-empty">아직 기록된 공성 피해 기여가 없습니다.</li>'
    return `<details class="city-damage-ranking" open><summary><span><span class="eyebrow">공성 기여</span><strong>공성 피해 기여 랭킹</strong></span><b>상위 ${rankings.length}명</b></summary><p>이 도시의 성벽 방어도를 가장 많이 깎은 유저 순위입니다.</p><ol>${rows}</ol></details>`
  }

  private battleLogCard(city: City): string {
    const logs = [...(city.battleLogs ?? [])].reverse()
    const entries = logs.length ? logs.map(log => `<li class="city-battle-log-entry">${this.battleLogBadge(log)}<div><strong>${escapeHtml(log.attackerName)} → ${escapeHtml(log.defenderName)}</strong><small>${log.attackerKind === 'ai' ? '인공지능 공격' : '유저 공격'} · 피해 ${formatNumber(log.damage)} · ${escapeHtml(log.note)}</small></div><time>${new Intl.DateTimeFormat(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(log.timestamp)}</time></li>`).join('') : '<li class="city-battle-log-empty">아직 기록된 전투가 없습니다. 수비덱을 배치한 뒤 공격을 받으면 이곳에 기록됩니다.</li>'
    return `<details class="city-battle-log" ${logs.length ? 'open' : ''}><summary><span><span class="eyebrow">도시 전투 기록</span><strong>성 전투 기록</strong></span><b>${logs.length}건</b></summary><p>이 성의 공성전·세력전과 인공지능 습격 결과를 최근 30건까지 보관합니다.</p><ul>${entries}</ul></details>`
  }

  private luoyangRulesMenu(): string {
    return `<details class="luoyang-rules"><summary>낙양전 설명</summary><div class="luoyang-rules-body"><strong>주간 낙양전</strong><p>매주 일요일 20:00에 열리고 24:00 정각에 종료됩니다.</p><ul><li>낙양은 모든 전선과 분리된 독립 성입니다.</li><li>점령 창이 열린 동안 촉·위·오 모든 진영이 직접 출정할 수 있습니다.</li><li>종료 시점까지 낙양을 점령하고 수비한 진영이 승자가 됩니다.</li><li>승리 진영은 다음 점령 창까지 낙양을 영토로 유지합니다.</li><li>승리 진영의 유저는 주 1회 낙양 상자, 금화 10~100개, 낙양 강화석 1개를 받습니다.</li><li>신화장비는 낙양 강화석으로만 강화할 수 있으며, 강화석 1개로 1회(+1단계) 강화합니다.</li></ul></div></details>`
  }

  private conquestCard(city: City, state: StrategyState, siege: number, eligibility: ReturnType<typeof conquestEligibility>): string {
    const cost = conquestCost(city, state)
    const power = conquestPower(state)
    const costText = `${icon('grain', 'gi--inline')} ${formatNumber(cost.grain ?? 0)} · ${icon('silver', 'gi--inline')} ${formatNumber(cost.silver ?? 0)} · ${icon('iron', 'gi--inline')} ${formatNumber(cost.iron ?? 0)}`
    const garrisonCount = city.garrisons?.length ?? 3
    const defeated = Math.min(garrisonCount, city.defendersDefeated ?? 0)
    const remaining = Math.max(0, garrisonCount - defeated)
    const finalReady = city.defense <= 0 && remaining === 0
    // 버튼이 잠긴 까닭을 바로 보여 준다(방어도 · 남은 수비병)
    const finalWait = [city.defense > 0 ? `성벽 방어도 ${formatNumber(city.defense)} 남음(0이 되어야 함)` : '', remaining > 0 ? `수비병 ${remaining}부대 남음` : ''].filter(Boolean).join(' · ') || '준비 완료'
    const honorCost = FACTION_WAR_HONOR_COST[city.level] ?? FACTION_WAR_HONOR_COST[5]
    const goldReward = FACTION_WAR_GOLD_REWARD[city.level] ?? FACTION_WAR_GOLD_REWARD[5]
    const actions = eligibility.allowed ? `<div class="territory-actions"><button class="action-button action-button--primary conquest-button" data-action="conquer" data-city="${city.id}">공성 출정 <span>${costText}</span></button><button class="action-button action-button--outline conquest-button" data-action="faction-battle" data-city="${city.id}" ${finalReady ? '' : 'disabled'} title="${escapeHtml(finalWait)}">최종 세력전 <span>옥패 ${formatNumber(honorCost)} · 금화 +${goldReward}</span></button></div>${finalReady ? '' : `<p class="final-war-wait">최종 세력전 조건: ${escapeHtml(finalWait)}</p>`}` : `<div class="frontier-lock"><strong>진군 경로 차단</strong><span>${eligibility.reason}</span><small>국경 전선: ${eligibility.neighborNames.length ? eligibility.neighborNames.join(' · ') : '연결된 아군 도시 없음'}</small></div>`
    return `<div class="conquest-card"><div class="conquest-card-head"><div><span class="eyebrow">진영전 · ${city.owner}</span><h3>성벽 방어도 ${formatNumber(city.defense)} · 점령 진전 ${siege}%</h3></div><strong>${formatNumber(power)} 전투력</strong></div><div class="conquest-progress"><i style="width:${siege}%"></i></div><p>수비병 ${defeated}/${garrisonCount}부대 격파 · 덱 전투력에 따라 성벽 방어도가 감소합니다. 방어도 0·수비병 전멸 후 최종 세력전을 실행하십시오.</p>${actions}</div>`
  }
  private defenseCard(city: City, state: StrategyState): string {
    const power = conquestPower(state)
    const cost = `${icon('grain', 'gi--inline')} ${formatNumber(280 + city.level * 90)} · ${icon('iron', 'gi--inline')} ${formatNumber(100 + city.level * 55)}`
    const garrisonCount = city.garrisons?.length ?? 0
    const canDeploy = garrisonCount < 100
    return `<div class="conquest-card defense-card"><div class="conquest-card-head"><div><span class="eyebrow">성 방어</span><h3>방어병 ${garrisonCount}/100부대</h3></div><strong>${formatNumber(power)} 전투력</strong></div><p>현재 출전 진형을 이 도시에 수비병으로 세울 수 있습니다. 상대는 배치된 수비병을 모두 격파해야 점령할 수 있습니다.</p><div class="territory-actions"><button class="action-button action-button--primary conquest-button" data-action="garrison-deploy" data-city="${city.id}" ${canDeploy ? '' : 'disabled'}>현재 덱 수비병 배치</button><button class="action-button action-button--outline conquest-button" data-action="defense" data-city="${city.id}">수비전 출격 <span>${cost}</span></button></div></div>`
  }
  private buildingRow(city: City, building: CityBuilding, canManage: boolean): string {
    const cost = buildingCost(building, this.renderedState ?? undefined)
    const costText = `${icon('silver', 'gi--inline')} ${formatNumber(cost.silver ?? 0)} · ${icon('wood', 'gi--inline')} ${formatNumber(cost.wood ?? 0)} · ${icon('iron', 'gi--inline')} ${formatNumber(cost.iron ?? 0)}`
    const maxed = building.level >= building.maxLevel
    // 공사 중: 남은 시간 · 즉시 완공(금화) · 취소, 같은 도시의 다른 건물은 기다린다
    const busyBuilding = city.buildings.find(item => item.endsAt !== undefined)
    if (building.endsAt !== undefined) {
      const left = Math.max(0, building.endsAt - Date.now())
      const total = Math.max(1, building.endsAt - (building.startedAt ?? building.endsAt - 1))
      return `<div class="building-row is-building"><div class="building-glyph">${icon(building.kind === 'agriculture' ? 'grain' : building.kind === 'commerce' ? 'silver' : building.kind === 'barracks' ? 'duel' : building.kind === 'workshop' ? 'iron' : 'research')}</div><div class="building-copy"><strong>${building.name} <em class="building-next">→ ${building.level + 1}단계 공사 중</em></strong><small>남은 시간 <b data-build-left="${building.endsAt}">${formatDuration(left)}</b></small><span class="building-progress"><i data-build-bar="${building.endsAt}" data-build-total="${total}" style="width:${Math.min(100, (1 - left / total) * 100).toFixed(1)}%"></i></span></div><div class="building-actions"><button class="mini-action" data-action="building-rush" data-city="${city.id}" data-build-rush="${building.endsAt}" ${canManage ? '' : 'disabled'}>즉시 완공 · 금화 ${rushCost(left)}</button><button class="mini-action" data-action="building-cancel" data-city="${city.id}" ${canManage ? '' : 'disabled'}>취소</button></div></div>`
    }
    const waitOther = Boolean(busyBuilding && !maxed)
    return `<div class="building-row"><div class="building-glyph">${icon(building.kind === 'agriculture' ? 'grain' : building.kind === 'commerce' ? 'silver' : building.kind === 'barracks' ? 'duel' : building.kind === 'workshop' ? 'iron' : 'research')}</div><div class="building-copy"><strong>${building.name}</strong><small>${building.description}</small><span class="building-level">${'◆'.repeat(building.level)}${'◇'.repeat(building.maxLevel - building.level)}</span></div><button class="mini-action ${maxed ? 'is-maxed' : ''}" data-action="building-upgrade" data-city="${city.id}" data-building="${building.id}" ${!canManage || maxed || waitOther ? 'disabled' : ''} title="${waitOther ? '이 도시는 다른 건물을 짓는 중입니다' : ''}">${maxed ? '최고 단계' : waitOther ? `다른 공사 중 · ${costText}` : `강화 · ${formatDuration(buildingDurationMs(building))} · ${costText}`}</button></div>`
  }

  private researchSection(state: StrategyState): string {
    const now = Date.now()
    const active = activeResearch(state)
    const doneCount = state.research.filter(node => node.unlocked).length
    const effects = researchSummary(state)
    const activePanel = active && active.endsAt !== undefined
      ? (() => {
        const remaining = Math.max(0, active.endsAt - now)
        const progress = Math.min(100, Math.max(0, (1 - remaining / active.durationMs) * 100))
        return `<div class="research-active glass-card is-running"><div class="research-active__copy"><span class="eyebrow">진행 중인 연구 · ${active.branch} ${active.tier}단계</span><h3>${active.name}</h3><p>${active.description}</p></div><div class="research-active__timer"><strong data-research-remaining>${formatDuration(remaining)}</strong><small>남음 · 전체 ${formatDuration(active.durationMs)}</small><div class="research-progress"><i data-research-progress style="width:${progress.toFixed(1)}%"></i></div></div><div class="research-active__actions"><button class="mini-action mini-action--rush" data-action="research-rush"><span data-research-rush>즉시 완료 · 금화 ${rushCost(remaining)}</span></button><button class="mini-action" data-action="research-cancel">연구 취소 (전액 환급)</button></div></div>`
      })()
      : (() => {
        const options = state.research.filter(node => researchStatus(state, node) === 'available')
        const pick = options.filter(node => canPay(state, node.cost)).sort((a, b) => a.tier - b.tier || a.durationMs - b.durationMs)[0] ?? options.sort((a, b) => a.tier - b.tier)[0]
        if (!pick) return `<div class="research-active glass-card is-idle"><div class="research-active__copy"><span class="eyebrow">연구소</span><h3>${doneCount >= 30 ? '모든 연구를 마쳤습니다' : '지금 시작할 수 있는 연구가 없습니다'}</h3></div></div>`
        const affordable = canPay(state, pick.cost)
        return `<div class="research-active glass-card is-idle"><div class="research-active__copy"><span class="eyebrow">연구소가 비어 있습니다 · 추천 연구</span><h3>${pick.branch} ${pick.tier}단계 · ${pick.name}</h3><p>${pick.description}</p></div><div class="research-active__timer"><strong>${formatDuration(pick.durationMs)}</strong><small class="${affordable ? '' : 'is-short'}">${researchCost(pick)}${affordable ? '' : ' · 자원 부족'}</small></div><div class="research-active__actions"><button class="mini-action mini-action--research" data-action="research" data-research="${pick.id}" ${affordable ? '' : 'disabled'}>추천 연구 시작 →</button></div></div>`
      })()
    const columns = RESEARCH_BRANCHES.map(branch => {
      const nodes = state.research.filter(node => node.branch === branch.id)
      const done = nodes.filter(node => node.unlocked).length
      const tiers = [1, 2, 3, 4, 5, 6].map(tier => {
        const row = nodes.filter(node => node.tier === tier)
        if (row.length > 1) return `<div class="research-choice"><span class="research-choice__label">${tier}단계 갈림길 · 둘 중 하나</span><div class="research-choice__pair">${row.map(node => this.researchCard(node, state, now)).join('<i class="research-choice__or">또는</i>')}</div></div>`
        return row.map(node => this.researchCard(node, state, now)).join('')
      }).join('')
      return `<div class="glass-card research-branch research-branch--${branch.prefix}"><div class="research-branch-head"><span class="branch-rune">${icon(branch.prefix === 'econ' ? 'grain' : branch.prefix === 'army' ? 'battle' : branch.prefix === 'strat' ? 'research' : branch.prefix === 'realm' ? 'territory' : 'rank')}</span><div><span class="eyebrow">${branch.hint}</span><h3>${branch.id} · ${done}/6단계</h3></div></div><div class="research-nodes">${tiers}</div></div>`
    }).join('')
    const summary = `<details class="research-summary glass-card" ${effects.length ? 'open' : ''}><summary>적용 중인 연구 효과 · ${effects.length}개</summary>${effects.length ? `<ul>${effects.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : '<p>아직 완료한 연구가 없습니다.</p>'}</details>`
    return `<section class="page-section page-section--research"><div class="section-heading section-heading--compact"><div><span class="eyebrow">육성</span><h1>기술 연구</h1><p class="heading-copy">다섯 분야를 6단계씩 연구합니다. 한 번에 하나씩, 단계가 오를수록 오래 걸리며(5분 → 8시간) 3·6단계는 둘 중 하나를 고릅니다.</p></div><div class="section-counter"><span>완료 단계</span><strong>${doneCount}<small> / 30</small></strong></div></div>${activePanel}<div class="research-grid research-grid--five">${columns}</div>${summary}</section>`
  }

  private researchCard(node: ResearchNode, state: StrategyState, now: number): string {
    const status = researchStatus(state, node)
    const footer = status === 'done' ? '<span class="research-check">✓ 적용 중</span>'
      : status === 'active' ? `<span class="research-running">연구 중 · ${formatDuration(Math.max(0, (node.endsAt ?? now) - now))}</span>`
      : status === 'locked' ? `<span class="research-lock">${node.tier - 1}단계 완료 필요</span>`
      : status === 'busy' ? '<span class="research-lock">다른 연구 진행 중</span>'
      : `<button class="mini-action mini-action--research" data-action="research" data-research="${node.id}">${status === 'switch' ? '이쪽으로 바꾸기' : '연구 시작'} <span>→</span></button>`
    return `<article class="research-node is-${status}"><div class="research-node-top"><span class="research-tier">${node.tier}단계${node.choice ? ` · ${node.choice === 'a' ? '갑' : '을'}` : ''}</span><span class="research-time">${formatDuration(node.durationMs)}</span></div><h4>${node.name}</h4><p>${node.description}</p><div class="research-node-footer"><span class="research-cost ${status === 'available' && !canPay(state, node.cost) ? 'is-short' : ''}">${researchCost(node)}</span>${footer}</div>${status === 'switch' ? '<small class="research-switch-note">바꾸면 같은 단계의 다른 연구 효과는 사라집니다.</small>' : ''}</article>`
  }


  private portraitAsset(general: General): string {
    return `/assets/generals-realistic-webp/${general.id}.webp`
  }

  private portrait(general: General, className = ''): string {
    const portraitPath = this.portraitAsset(general)
    const imageClass = ' has-portrait'
    const imageStyle = `--portrait:url('${portraitPath}');`
    return `<div class="general-portrait${className ? ` ${className}` : ''}${imageClass}" style="--accent:${gradeColor(general)};${imageStyle}"><span>${general.portrait}</span><i></i></div>`
  }

  private ritualPortrait(general: General): string {
    const portraitPath = this.portraitAsset(general)
    const imageClass = ' has-portrait'
    const imageStyle = `--portrait:url('${portraitPath}');`
    return `<div class="ritual-portrait${imageClass}" style="--accent:${gradeColor(general)};${imageStyle}"><span>${general.portrait}</span><i></i></div>`
  }

  /** 무장 이름 옆 버프 · 디버프 아이콘(최대 4개, 넘치면 +개수). 남은 시간은 1초 단위로만 바꿔 다시 그리기를 줄인다 */
  private unitEffectIcons(chips: UnitEffectChip[]): string {
    const shown = chips.slice(0, 4)
    const more = chips.length - shown.length
    return shown.map(chip => `<i class="bt-fx__icon is-${chip.kind}" title="${escapeHtml(`${tr(chip.name)} · ${tr(chip.description)} · ${Math.ceil(chip.remaining)}${tr('초')}`)}" aria-label="${escapeHtml(tr(chip.name))}">${chip.icon}</i>`).join('') + (more > 0 ? `<i class="bt-fx__more">+${more}</i>` : '')
  }

  private attributeRows(general: General, scale = 0): string {
    const stats = [
      ['통솔', general.leadership, 'leadership'],
      ['무력', general.martial, 'martial'],
      ['모략', general.stratagem, 'stratagem'],
      ['속도', general.speed, 'speed'],
    ] as const
    // 기준값(보유 무장 중 가장 높은 능력치) 대비 비율. 이 무장의 가장 높은 능력치는 강조
    const top = Math.max(...stats.map(([, value]) => value))
    const base = scale || Math.max(100, top)
    // 유형별 성장: 레벨업 때 가장 많이 오르는 능력치(무력형=무력, 책사형=모략, 방어·지휘형=통솔)
    const weights = growthWeights(general)
    const grow = stats.reduce((best, row) => weights[row[2]] > weights[best[2]] ? row : best)[2]
    return stats.map(([label, value, key]) => `<div class="${value === top ? 'is-top' : ''}${key === grow ? ' is-grow' : ''} stat-row--info" data-action="stat-info" data-stat="${key}" role="button" tabindex="0" title="눌러서 ${label} 설명 보기"><span>${label}${key === grow ? '<sup title="레벨업 때 가장 많이 오릅니다">▲</sup>' : ''}</span><i><b style="width:${Math.min(100, value / base * 100).toFixed(1)}%"></b></i><em>${value}</em></div>`).join('') + '<p class="stat-info" data-stat-info hidden></p>'
  }

  /** 스킬이 거는 버프 · 디버프: 누르면 아래에 효과 설명이 펼쳐진다 */
  private skillEffectChips(general: General): string {
    const def = skillDefFor(general.id, general.role, general.skillName, general.skillDescription)
    const chips = new Map<string, { id: BattleEffectId; sec: number; awaken: boolean }>()
    const collect = (fx: SkillFx[] = [], awaken: boolean) => fx.forEach(part => {
      if ((part.k === 'buff' || part.k === 'debuff') && BATTLE_EFFECTS[part.id] && !chips.has(part.id)) chips.set(part.id, { id: part.id, sec: part.sec, awaken })
    })
    collect(def.active.fx, false)
    collect(def.awaken?.fx, true)
    if (!chips.size) return ''
    const buttons = [...chips.values()].map(chip => {
      const effect = BATTLE_EFFECTS[chip.id]
      return `<button type="button" class="skill-fx-chip is-${effect.kind}" data-action="effect-info" data-effect="${chip.id}" data-sec="${chip.sec}" data-awaken="${chip.awaken ? '1' : ''}"><b>${effect.icon}</b>${escapeHtml(effect.name)}${chip.awaken ? '<small>각성</small>' : ''}</button>`
    }).join('')
    return `<div class="skill-detail-wide skill-fx"><small>버프 · 디버프 <em>눌러서 효과 보기</em></small><div class="skill-fx-chips">${buttons}</div><p class="skill-fx-info" data-effect-info hidden></p></div>`
  }

  private skillDetailPanel(general: General): string {
    const detail = skillDetail(general)
    const extra = [
      detail.passive ? `<div class="skill-detail-wide"><small>패시브 (3성)</small><strong>${escapeHtml(detail.passive)}</strong></div>` : '',
      detail.awaken ? `<div class="skill-detail-wide"><small>각성 (5성)</small><strong>${escapeHtml(detail.awaken)}</strong></div>` : '',
      detail.weakness ? `<div class="skill-detail-wide skill-detail-weak"><small>약점</small><strong>${escapeHtml(detail.weakness)}</strong></div>` : '',
      this.skillEffectChips(general),
    ].join('')
    return `<div class="skill-detail-panel skill-detail-panel--${detail.category === '정화·치료' ? 'cleanse' : detail.category === '버프' ? 'buff' : detail.category === '디버프' ? 'debuff' : 'combat'}"><div class="skill-detail-title"><span>◈ 스킬 상세 <b class="skill-category">${detail.type}</b></span><b>${skillRank(general)}성 · 사기 −${skillPower(general)}</b></div><div class="skill-detail-grid"><div><small>발동</small><strong>${escapeHtml(detail.trigger)}</strong></div><div><small>대상</small><strong>${escapeHtml(detail.target)}</strong></div><div class="skill-detail-wide"><small>효과</small><strong>${escapeHtml(detail.effect)}</strong></div><div><small>유형</small><strong>${escapeHtml(detail.duration)}</strong></div><div><small>쿨다운</small><strong>${escapeHtml(detail.cooldown)}</strong></div>${extra}</div></div>`
  }


  private generalCard(state: StrategyState, general: General, scale: number): string {
    const meta = GRADE_META[general.grade]
    const lane = state.formation.indexOf(general.id)
    const inFormation = lane >= 0
    const detail = skillDetail(general)
    const cost = upgradeCost(state, general)
    const canUpgrade = state.silver >= cost.silver && state.manuals >= cost.manuals
    const many = affordableUpgrades(state, general.id, 10)
    const unlockAt = skillUnlockLevel(general)
    const loadout = state.equipmentLoadouts?.[general.id] ?? {}
    const gear = (['weapon', 'armor', 'accessory'] as EquipmentType[]).map(type => {
      const item = state.equipmentInventory.find(candidate => candidate.id === loadout[type])
      return item ? `<span class="gcard-gear__slot is-on" style="--grade:${EQUIPMENT_GRADE_META[item.grade].color}" title="${escapeHtml(item.name)} +${item.level}"><img class="gear-glyph" src="${equipmentImage(type)}" alt="" width="18" height="18" draggable="false"><small>+${item.level}</small></span>` : `<span class="gcard-gear__slot" title="${EQUIPMENT_TYPE_META[type].label} 비어 있음"><img class="gear-glyph" src="${equipmentImage(type)}" alt="" width="18" height="18" draggable="false"></span>`
    }).join('')
    const sets = Object.entries(equipmentSetCounts(state, general.id)).filter(([, count]) => (count ?? 0) >= 2).map(([set, count]) => `${EQUIPMENT_SET_META[set as keyof typeof EQUIPMENT_SET_META].label} ${count}`).join(' · ')
    const gearPower = equipmentPowerForUi(state, general.id)
    const skillState = general.skillUnlocked
      ? `<span class="gcard-skill-state is-on">스킬 ${skillRank(general)}성</span>`
      : general.level >= unlockAt
        ? `<button class="mini-action mini-action--skill gcard-unlock" data-action="skill" data-id="${general.id}" ${state.silver >= 1500 ? '' : 'disabled'}>스킬 해금 · 은전 1,500</button>`
        : `<span class="gcard-skill-state">해금까지 ${unlockAt - general.level}레벨 (Lv.${unlockAt})</span>`
    return `<article class="gcard ${general.grade >= 4 ? `gcard--aura gcard--g${general.grade}` : ''} ${inFormation ? 'is-deployed' : ''} ${!general.skillUnlocked && general.level >= unlockAt ? 'is-unlockable' : ''}" style="--accent:${gradeColor(general)};--grade:${meta.color}">
      <div class="gcard-portrait" style="--portrait:url('${this.portraitAsset(general)}')"><span class="gcard-grade">${general.grade} · ${meta.label}</span>${inFormation ? `<span class="gcard-lane">1군 · ${['좌측', '중앙', '우측'][lane]}</span>` : (() => { const where = squadOf(state, general.id); return where > 0 ? `<span class="gcard-lane gcard-lane--reserve">${SQUAD_LABELS[where]} · ${['좌측', '중앙', '우측'][squadIds(state, where).indexOf(general.id)] ?? ''}</span>` : '' })()}</div>
      <div class="gcard-body">
        <div class="gcard-head"><div><h3>${general.name}<span class="star-row">${'★'.repeat(general.stars)}${'☆'.repeat(5 - general.stars)}</span></h3><p>${escapeHtml(general.epithet)}</p></div><span class="role-tag">${general.role}</span></div>
        <div class="level-line"><span>Lv.${general.level}</span><span>전투력 <b>${formatNumber(combatPower(general) + gearPower)}</b>${gearPower ? `<small> (장비 +${formatNumber(gearPower)})</small>` : ''}</span></div>
        <div class="stat-bars stat-bars--attributes">${this.attributeRows(general, scale)}</div>
        <details class="gcard-skill"><summary><span>◈ ${escapeHtml(general.skillName)}</span><em>${detail.type}</em>${skillState}</summary><p>${escapeHtml(general.skillDescription)}</p>${this.skillDetailPanel(general)}</details>
        <button class="gcard-gear" data-action="equip-general" data-id="${general.id}" title="이 무장의 장비 화면으로">${gear}<span>${sets || (gearPower ? '세트 효과 없음' : '장비 없음')}</span><b>장착</b></button>
        <div class="gcard-actions"><button class="mini-action mini-action--deploy" data-action="formation" data-id="${general.id}">${inFormation ? '편성 해제' : squadOf(state, general.id) > 0 ? '1군으로' : '출전 편성'}</button>${isMaxLevel(general) ? `<button class="mini-action gcard-up is-max" disabled title="최고 레벨입니다. 성급을 올리면 더 강해집니다.">최고 레벨 Lv.${MAX_GENERAL_LEVEL}<small class="cost-row">성급으로 더 강해집니다</small></button>` : `<button class="mini-action gcard-up" data-action="upgrade" data-id="${general.id}" ${canUpgrade ? '' : 'disabled'} title="은전 ${formatNumber(cost.silver)} · 병서 ${formatNumber(cost.manuals)}">강화 Lv.${general.level + 1}<small class="cost-row"><span class="cost ${state.silver < cost.silver ? 'is-short' : ''}">${icon('silver', 'gi--cost')}${compactNumber(cost.silver)}</span><span class="cost ${state.manuals < cost.manuals ? 'is-short' : ''}">${icon('manuals', 'gi--cost')}${formatNumber(cost.manuals)}</span></small></button>`}${many >= 2 ? `<button class="mini-action gcard-up-many" data-action="upgrade-many" data-id="${general.id}">${many}회 강화</button>` : ''}${general.level > 1 ? `<button class="mini-action gcard-reset" data-action="level-reset" data-id="${general.id}" ${state.gold < LEVEL_RESET_GOLD ? 'disabled' : ''} title="금화 ${LEVEL_RESET_GOLD}개 · 레벨에 쓴 은전 · 병서 80% 반환">레벨 초기화<small class="cost-row"><span class="cost ${state.gold < LEVEL_RESET_GOLD ? 'is-short' : ''}">${icon('gold', 'gi--cost')}${LEVEL_RESET_GOLD}</span><span>80% 반환</span></small></button>` : ''}</div>
      </div></article>`
  }

  private codexCard(general: General, owned: boolean): string {
    const meta = GRADE_META[general.grade]
    const hidden = owned ? '' : ' codex-card--locked'
    const body = owned
      ? `<div class="codex-stat-line"><span>Lv.${general.level} · ${'★'.repeat(general.stars)}</span><b>${formatNumber(combatPower(general))}</b></div><details class="gcard-skill"><summary><span>◈ ${escapeHtml(general.skillName)}</span><em>${skillDetail(general).type}</em></summary><p>${escapeHtml(general.skillDescription)}</p>${this.skillDetailPanel(general)}</details>`
      : `<div class="codex-lock-note">무장 모집에서 획득할 수 있습니다. (${meta.label} 등급 확률 ${meta.rate})</div>`
    return `<article class="codex-card${hidden}${general.grade >= 4 ? ` gcard--aura gcard--g${general.grade}` : ''}" data-codex-name="${escapeHtml(general.name)}" style="--accent:${gradeColor(general)};--grade:${meta.color}"><div class="codex-card-art">${this.portrait(general, 'codex-portrait')}<span class="codex-grade">${general.grade} · ${meta.label}</span><span class="codex-state">${owned ? '영입 완료' : '미영입'}</span></div><div class="codex-card-body"><div class="codex-card-heading"><div><h3>${owned ? general.name : '???'}</h3><p>${owned ? escapeHtml(general.epithet) : `${general.role} · ${meta.label}`}</p></div><span>${general.role}</span></div>${body}</div></article>`
  }


  /** 출전 편성 비교 대상: 다음 시나리오의 같은 자리 적장 */
  /**
   * 무장별 추천 덱: 무장을 고르면 그 무장이 들어간 이상적인 조합을 유형마다 하나씩(스킬 연계·버티기·초반 끝내기·디버프·유틸) 보여 준다.
   * 지금 키운 정도는 따지지 않고 스킬 설계와 전열 규칙만 본다. 70명 전체에서 고르므로 없는 무장은 미보유로 표시한다.
   */
  private comboAdvice(state: StrategyState, squad = 0): string {
    const members = squadIds(state, squad)
    const owned = new Set(state.generals.map(general => general.id))
    const catalog = allGenerals()
    const byId = new Map(catalog.map(general => [general.id, general]))
    const ownedFirst = [...catalog].sort((left, right) => Number(owned.has(right.id)) - Number(owned.has(left.id)) || right.grade - left.grade)
    const anchorId = (this.comboAnchorId && byId.has(this.comboAnchorId) ? this.comboAnchorId : null) ?? members[1] ?? members[0] ?? state.formation[1] ?? ownedFirst[0].id
    const anchor = byId.get(anchorId)!
    let combos = this.comboCache.get(anchorId)
    if (!combos) { combos = recommendDecks(anchorId); this.comboCache.set(anchorId, combos) }
    const current = members.join(',')
    const chips = ownedFirst.map(general => `<button class="combo-chip ${general.id === anchorId ? 'is-active' : ''} ${owned.has(general.id) ? '' : 'is-unowned'}" data-action="combo-anchor" data-id="${general.id}" style="--accent:${gradeColor(general)}" aria-pressed="${general.id === anchorId}">${this.portrait(general, 'combo-chip__portrait')}<span>${escapeHtml(general.name)}</span></button>`).join('')
    const lanes = ['↙ 좌측', '↑ 전열', '↘ 우측']
    const rows = combos.map(combo => {
      const meta = ARCHETYPE_META[combo.archetype]
      const missing = combo.ids.filter(id => !owned.has(id))
      const members = combo.ids.map((id, lane) => {
        const general = byId.get(id)!
        const has = owned.has(id)
        return `<div class="combo-member ${id === anchorId ? 'is-anchor' : ''} ${has ? '' : 'is-unowned'}" style="--accent:${gradeColor(general)}">${this.portrait(general, 'combo-member__portrait')}<div><small>${lanes[lane]}</small><strong>${escapeHtml(general.name)}</strong><span>${general.role} · ${GRADE_META[general.grade].label}</span>${has ? '' : '<em class="combo-edge is-dis">미보유</em>'}</div></div>`
      }).join('')
      const tags = [combo.bond ? `<span class="combo-tag combo-tag--bond">인연 ‘${escapeHtml(combo.bond.name)}’</span>` : '', ...combo.keys.map(key => `<span class="combo-tag">${escapeHtml(key)}</span>`)].join('')
      const isCurrent = combo.ids.join(',') === current
      const action = isCurrent ? '<span class="combo-current">현재 편성</span>' : missing.length ? `<span class="combo-missing">미보유 ${missing.length}명</span>` : `<button class="mini-action mini-action--deploy" data-action="apply-combo" data-squad="${squad}" data-ids="${combo.ids.join(',')}">${squad > 0 ? `${SQUAD_LABELS[squad]}에 ` : ''}이 덱으로 편성</button>`
      return `<li class="combo-row combo-row--${combo.archetype} ${isCurrent ? 'is-current' : ''}"><div class="combo-type"><b>${meta.label}</b><small>${meta.desc}</small></div><div class="combo-members">${members}</div><div class="combo-side"><div class="combo-tags">${tags}</div>${action}</div></li>`
    }).join('')
    return `<div class="combo-advice glass-card"><div class="card-header"><div><span class="eyebrow">추천 덱</span><h3>무장별 추천 덱</h3><p class="combo-note">무장을 고르면 그 무장이 들어간 이상적인 조합을 유형마다 하나씩 보여 드립니다. 지금 키운 정도는 따지지 않고 스킬 연계·인연과 전열 규칙만 보며, 가운데(전열)에는 수호형이나 단단한 무장을 세웁니다. 아직 없는 무장도 미보유로 함께 보여 줍니다.</p></div></div><div class="combo-anchor-row" role="group" aria-label="추천 덱을 볼 무장">${chips}</div><div class="combo-anchor-name"><b>${escapeHtml(anchor.name)}</b> 추천 덱</div><ol class="combo-list">${rows}</ol></div>`
  }

  private formationEnemies(state: StrategyState): Array<General | undefined> {
    const next = this.nextScenario(state)
    return next ? scenarioEnemyIds(next, state.faction).map(id => templateGeneral(id)) : []
  }

  /** 2·3군 상성 기준: 이번 주 레이드 보스 덱(좌·중·우) */
  private raidEnemies(): General[] {
    const info = this.raidView.info
    return raidBossDeck(info?.bossLevel ?? 30, info?.weekKey ?? raidWeekKey())
  }

  private formationEnemyNote(state: StrategyState): string {
    const next = this.nextScenario(state)
    return next ? `상성은 다음 시나리오 ‘${escapeHtml(next.title)}’의 적장 기준입니다. 기병은 궁병에, 궁병은 보병에, 보병은 기병에 강합니다.` : '대기 무장의 편성 버튼으로 빈 자리를 채우십시오.'
  }

  private formationSlot(state: StrategyState, index: number, squad = 0): string {
    const lane = ['↙ 좌측', '↑ 중앙 · 전열', '↘ 우측'][index]
    const enemy = (squad > 0 ? this.raidEnemies() : this.formationEnemies(state))[index]
    const id = squadIds(state, squad)[index]
    const general = id ? state.generals.find(item => item.id === id) : undefined
    // 가운데는 전열: 적의 30%가 먼저 노리고 받는 피해 −20%, 수호형이면 도발 + 피해 −40%
    const tank = general ? skillDetail(general).type === '수호' : false
    const frontNote = index === 1 ? `<div class="formation-front ${tank ? 'is-tank' : ''}"><b>전열</b><span>${tank ? '수호형 · 적을 더 끌어당기고 받는 피해 −40%' : '적이 먼저 노림 · 받는 피해 −20% · 수호형을 세우면 더 단단'}</span></div>` : ''
    const enemyLine = (edge: number) => enemy ? `<div class="formation-enemy ${edge > 1 ? 'is-adv' : edge < 1 ? 'is-dis' : ''}"><span>상대 ${escapeHtml(enemy.name)} · ${enemy.role}</span><b>${edge > 1 ? '상성 유리' : edge < 1 ? '상성 불리' : '상성 보통'}</b></div>` : ''
    if (!general) return `<div class="formation-slot formation-slot--empty ${index === 1 ? 'formation-slot--front' : ''}"><span class="formation-slot-index">${lane}</span><strong>빈 자리</strong><small>${index === 1 ? '전열 자리: 수호형이나 단단한 무장을 세우십시오.' : '아래 대기 무장의 편성 버튼을 누르십시오.'}</small>${enemy ? `<div class="formation-enemy"><span>상대 ${escapeHtml(enemy.name)} · ${enemy.role}</span></div>` : ''}</div>`
    const loadout = state.equipmentLoadouts[general.id] ?? {}
    const equipment = (['weapon', 'armor', 'accessory'] as EquipmentType[]).map(type => {
      const itemId = loadout[type]
      const item = itemId ? this.equipmentById(state).get(itemId) : undefined
      return item
        ? `<div class="formation-equipment-chip is-equipped"><span><img class="gear-glyph" src="${equipmentImage(type)}" alt="" width="18" height="18" draggable="false"></span><strong>${escapeHtml(item.name)}</strong><button class="formation-unequip" data-action="equipment-unequip" data-equipment-type="${type}" data-general-id="${general.id}">해제</button></div>`
        : `<div class="formation-equipment-chip"><span><img class="gear-glyph" src="${equipmentImage(type)}" alt="" width="18" height="18" draggable="false"></span><strong>${EQUIPMENT_TYPE_META[type].label} 없음</strong><button class="formation-unequip formation-equip" data-action="equip-general" data-id="${general.id}">장착하기</button></div>`
    }).join('')
    return `<div class="formation-slot formation-slot--filled ${index === 1 ? 'formation-slot--front' : ''}" style="--accent:${gradeColor(general)}"><div class="formation-slot-main"><span class="formation-slot-index">${lane}</span>${this.portrait(general, 'formation-portrait')}<strong>${general.name}</strong><small>${general.role} · Lv.${general.level}</small><b>${formatNumber(combatPower(general) + equipmentPowerForUi(state, general.id))}</b><button class="text-button formation-release" ${squad > 0 ? `data-action="squad-toggle" data-squad="${squad}"` : 'data-action="formation"'} data-id="${general.id}">편성 해제</button></div>${enemyLine(enemy ? matchup(general.role, enemy.role) : 1)}${frontNote}<div class="formation-equipment"><span class="formation-equipment-label">장착 장비</span>${equipment}</div></div>`
  }

  private formationBenchCard(general: General, squad = 0, state?: StrategyState): string {
    // 다른 군에 있는 무장은 어느 군에서 옮겨 오는지 알려 준다
    const where = state ? squadOf(state, general.id) : -1
    const button = squad > 0
      ? `<button class="mini-action mini-action--deploy" data-action="squad-toggle" data-squad="${squad}" data-id="${general.id}">${where >= 0 ? `${SQUAD_LABELS[where]}에서 옮기기` : '편성'}</button>`
      : `<button class="mini-action mini-action--deploy" data-action="formation" data-id="${general.id}">${where > 0 ? `${SQUAD_LABELS[where]}에서 옮기기` : '편성'}</button>`
    return `<article class="formation-bench-card ${where >= 0 && where !== squad ? 'is-assigned' : ''}" style="--accent:${gradeColor(general)}">${this.portrait(general, 'formation-bench-portrait')}<div><strong>${general.name}</strong><small>${general.role} · ${GRADE_META[general.grade].label} · Lv.${general.level}${where >= 0 && where !== squad ? ` · ${SQUAD_LABELS[where]}` : ''}</small></div><b>${formatNumber(combatPower(general) + (state ? equipmentPowerForUi(state, general.id) : 0))}</b>${button}</article>`
  }

  /** 추천 무장: 가졌으면 ✓, 없으면 같은 병과의 내 무장 중 가장 강한 무장을 대신 추천 */
  private recommendedDeck(state: StrategyState, names: string[]): string {
    const catalog = allGenerals()
    const used = new Set<string>()
    const rows = names.map(name => {
      const template = catalog.find(general => general.name === name)
      const mine = state.generals.find(general => general.name === name)
      if (mine) { used.add(mine.id); return `<li class="is-owned"><b>✓</b>${escapeHtml(name)}<small>${mine.role} · Lv.${mine.level}</small></li>` }
      const alt = state.generals.filter(general => !used.has(general.id) && general.role === template?.role && !names.includes(general.name)).sort((a, b) => combatPower(b) - combatPower(a))[0]
      if (alt) used.add(alt.id)
      return `<li><b>✕</b>${escapeHtml(name)}<small>미보유${alt ? ` → 대신 <em>${escapeHtml(alt.name)}</em> (${alt.role} · Lv.${alt.level})` : template ? ` · ${template.role}` : ''}</small></li>`
    }).join('')
    return `<ul class="scenario-recommend">${rows}</ul>`
  }

  private scenarioSection(state: StrategyState): string {
    // 연대기를 한 단계씩: 지금 단계(다음 미완료)가 크게 보이고, 깨면 다음 단계로 넘어간다. 전체 목록은 접어 둔다
    // 어려움: 보통을 깬 시나리오를 적 Lv+10 · 특수 규칙으로 다시(앞 단계 어려움을 깨야 다음이 열린다)
    const normalCleared = SCENARIOS.filter(scenario => state.scenarioCleared.includes(scenario.id)).length
    const hardOpen = normalCleared > 0
    const hard = hardOpen && this.scenarioDifficulty === 'hard'
    const difficulty: ScenarioDifficulty = hard ? 'hard' : 'normal'
    const done = (id: string) => hard ? hardCleared(state.scenarioCleared, id) : state.scenarioCleared.includes(id)
    const starsOf = (id: string) => hard ? hardScenarioStars(state.scenarioCleared, id) : scenarioStars(state.scenarioCleared, id)
    const next = hard ? (SCENARIOS.find(scenario => !hardCleared(state.scenarioCleared, scenario.id)) ?? SCENARIOS[SCENARIOS.length - 1]) : this.nextScenario(state)
    const reachable = Math.max(0, SCENARIOS.findIndex(scenario => scenario.id === next?.id))
    const cleared = SCENARIOS.filter(scenario => done(scenario.id)).length
    // 새로 깬 단계가 있으면 다음 단계로 자동 이동
    const seenKey = cleared + (hard ? 1000 : 0)
    if (seenKey !== this.scenarioClearedSeen) { if (this.scenarioClearedSeen >= 0 && seenKey > this.scenarioClearedSeen && seenKey - this.scenarioClearedSeen < 1000) { this.scenarioSelectedId = next?.id ?? this.scenarioSelectedId; this.scenarioPicked = false } this.scenarioClearedSeen = seenKey }
    let index = SCENARIOS.findIndex(scenario => scenario.id === this.scenarioSelectedId)
    if (index < 0 || index > reachable) index = reachable
    const selected = SCENARIOS[index] ?? SCENARIOS[0]
    const selectedCleared = Boolean(selected && done(selected.id))
    // 어려움인데 이 시나리오의 보통을 아직 못 깼으면 출전할 수 없다
    const blocked = Boolean(hard && selected && !hardUnlocked(state.scenarioCleared, selected))
    const reward = selected ? (hard ? hardClearReward(selected, []) : selected.reward) : null
    const stars = selected ? starsOf(selected.id) : 0
    const rule = hard && selected ? scenarioHardRule(selected) : null
    const chapterNo = (selected?.chapterIndex ?? 0) + 1
    const inChapter = SCENARIOS.filter(scenario => scenario.chapter === selected?.chapter)
    const chapterPos = inChapter.findIndex(scenario => scenario.id === selected?.id) + 1
    const prev = SCENARIOS[index - 1]
    const after = SCENARIOS[index + 1]
    const nextLocked = !after || index + 1 > reachable
    const chapters = [...new Set(SCENARIOS.map(scenario => scenario.chapter))]
    const list = chapters.map(chapter => {
      const items = SCENARIOS.filter(scenario => scenario.chapter === chapter)
      const head = items[0]
      return `<div class="scenario-mini-chapter"><div class="scenario-mini-head"><b>제${(head?.chapterIndex ?? 0) + 1}장</b><span>${escapeHtml(head?.era ?? '')}</span><small>${items.filter(scenario => done(scenario.id)).length}/${items.length}</small></div>${items.map(scenario => { const at = SCENARIOS.indexOf(scenario); const locked = at > reachable; const isDone = done(scenario.id); return `<button class="scenario-mini ${scenario.id === selected?.id ? 'is-selected' : ''} ${isDone ? 'is-cleared' : ''} ${locked ? 'is-locked' : ''}" data-action="scenario-select" data-scenario-id="${scenario.id}" ${locked ? 'disabled' : ''}><span>${scenario.year}</span><strong>${escapeHtml(scenario.title)}</strong><em>${locked ? '🔒' : isDone ? '★'.repeat(starsOf(scenario.id)) : '도전'}</em></button>` }).join('')}</div>`
    }).join('')
    const hardCount = hardClearedCount(state.scenarioCleared)
    const toggle = `<div class="setting-seg scenario-difficulty" role="group" aria-label="난이도"><button class="setting-seg__btn ${hard ? '' : 'is-active'}" data-action="scenario-difficulty" data-difficulty="normal" aria-pressed="${!hard}">보통 <small>${normalCleared}/${SCENARIOS.length}</small></button><button class="setting-seg__btn ${hard ? 'is-active' : ''}" data-action="scenario-difficulty" data-difficulty="hard" aria-pressed="${hard}" ${hardOpen ? '' : 'disabled'} title="${hardOpen ? '적 Lv+10 · 별 +1 · 특수 규칙' : '보통 시나리오를 하나 깨면 열립니다'}">${hardOpen ? '' : '🔒 '}어려움 <small>${hardCount}/${SCENARIOS.length}</small></button></div>`
    const ruleBox = rule ? `<div class="scenario-rule"><span class="eyebrow">어려움 특수 규칙</span><strong>${escapeHtml(HARD_RULE_INFO[rule].label)}</strong><small>${escapeHtml(HARD_RULE_INFO[rule].desc)} · 적 Lv+${HARD_LEVEL_BONUS} · 적 별 +1</small></div>` : ''
    const rewardText = hard ? `옥패 +${formatNumber(reward?.honor ?? 0)} · 은전 +${formatNumber(reward?.silver ?? 0)} · 병서 +${formatNumber(reward?.manuals ?? 0)}` : `금화 +${formatNumber(reward?.gold ?? 0)} · 옥패 +${formatNumber(reward?.honor ?? 0)} · 은전 +${formatNumber(reward?.silver ?? 0)} · 병서 +${formatNumber(reward?.manuals ?? 0)}`
    const startLabel = blocked ? '🔒 보통을 먼저 깨십시오' : selectedCleared ? '다시 전투하기' : hard ? '어려움 출전' : '시나리오 출전'
    return `<section class="page-section page-section--scenario ${hard ? 'is-hard' : ''}"><div class="section-heading section-heading--compact"><div><span class="eyebrow">전투 · 제${chapterNo}장 ${escapeHtml(selected?.era ?? '')}${hard ? ' · 어려움' : ''}</span><h1>시나리오</h1></div><div class="section-counter"><button class="action-button action-button--outline scenario-guide-button" data-action="battle-guide">? 전투 규칙</button><span>${hard ? '어려움 진행' : '연대기 진행'}</span><strong>${cleared}<small> / ${SCENARIOS.length}</small></strong></div></div>
      ${toggle}
      <div class="scenario-progress" aria-hidden="true"><i style="width:${(cleared / Math.max(1, SCENARIOS.length) * 100).toFixed(1)}%"></i></div>
      <div class="scenario-stepper"><button class="action-button action-button--outline" data-action="scenario-select" data-scenario-id="${prev?.id ?? ''}" ${prev ? '' : 'disabled'}>← 이전</button><div><strong>${index + 1} / ${SCENARIOS.length}</strong><small>제${chapterNo}장 ${chapterPos}/${inChapter.length}단계</small></div><button class="action-button action-button--outline" data-action="scenario-select" data-scenario-id="${after?.id ?? ''}" ${nextLocked ? 'disabled' : ''} title="${nextLocked && after ? '이번 단계를 깨면 열립니다' : ''}">${nextLocked && after ? '🔒 다음' : '다음 →'}</button></div>
      <article class="scenario-detail scenario-main glass-card ${selectedCleared ? 'is-cleared' : 'is-current'}"><span class="pill ${hard ? 'pill--ember' : 'pill--jade'}">${selected?.year ?? ''} · ${escapeHtml(selected?.era ?? '')}${hard ? ' · 어려움' : ''}</span>${selectedCleared ? `<span class="scenario-main__done">완료 ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>` : '<span class="scenario-main__done is-new">이번 단계</span>'}<h2>${escapeHtml(selected?.title ?? '')}</h2><p class="scenario-story">${escapeHtml(selected?.story ?? '')}</p>${ruleBox}<div class="scenario-deck"><span class="eyebrow">추천 편성</span>${selected ? this.recommendedDeck(state, selected.deck) : '—'}</div><div class="scenario-deck scenario-enemy"><span class="eyebrow">적군 · 평균 Lv.${selected ? scenarioEnemyLevelFor(selected, difficulty) : 1}</span><strong>${selected ? scenarioEnemyIds(selected, state.faction).map(id => escapeHtml(templateGeneral(id)?.name ?? id)).join(' · ') : '—'}</strong><small class="scenario-stars">${selected ? `최고 기록 ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}` : ''}</small></div><div class="scenario-reward"><span class="eyebrow">${hard ? '어려움 최초 클리어 보상' : '최초 클리어 보상'}${selectedCleared ? ' · 획득 완료' : ''}</span><p>${rewardText}</p><small>식량 +${formatNumber(reward?.grain ?? 0)} · 목재 +${formatNumber(reward?.wood ?? 0)} · 철 +${formatNumber(reward?.iron ?? 0)} · 영향력 +${formatNumber(reward?.influence ?? 0)}</small></div>
        <div class="scenario-main__actions"><button class="action-button action-button--primary scenario-start-button" data-action="scenario-start" data-scenario-id="${selected?.id ?? ''}" data-difficulty="${difficulty}" ${blocked ? 'disabled' : ''}>${startLabel} <span>→</span></button>${selectedCleared && next && next.id !== selected?.id ? `<button class="action-button action-button--outline" data-action="scenario-select" data-scenario-id="${next.id}">이번 단계로 (${next.year} ${escapeHtml(next.title)}) →</button>` : ''}</div></article>
      <details class="scenario-all glass-card" ${this.scenarioListOpen ? 'open' : ''}><summary data-action="scenario-list-toggle">전체 시나리오 목록 <small>${cleared}/${SCENARIOS.length} 클리어 · 다시 전투할 단계를 고르십시오</small></summary><div class="scenario-mini-list">${list}</div></details></section>`
  }


  private battleSection(state: StrategyState): string {
    const battle = this.latestBattle
    const active = Boolean(battle?.active)
    const lanes = ['↙ 좌측', '↑ 전열', '↘ 우측']
    // 지금 전장에 나선 무장(레이드 2 · 3군처럼 1군 편성과 다를 수 있다) — 전투 전이면 1군 편성
    const fielded = battle?.units?.length ? battle.units.map(unit => unit.id) : state.formation
    const units = fielded.map((id, index) => {
      const general = state.generals.find(item => item.id === id)
      if (!general) return ''
      const live = battle?.units[index]
      const pct = live && live.maxTroops ? live.troops / live.maxTroops * 100 : 100
      const detail = skillDetail(general)
      return `<div class="bt-unit ${live?.ready ? 'is-ready' : ''} ${live && !live.alive ? 'is-down' : ''}" data-bt-unit="${index}" style="--accent:${gradeColor(general)}"><button class="bt-unit-main" data-action="move" data-index="${index}" aria-label="${general.name} 기동 · 길게 누르면 스킬">${this.portrait(general, 'bt-portrait')}<span class="bt-unit-lane">${lanes[index] ?? ''}</span><strong class="bt-name-row"><span class="bt-name">${general.name}</span><span class="bt-fx" data-bt-unit-fx></span></strong><small>${general.role} · Lv.${general.level} · ${detail.type}</small><span class="bt-unit-troops"><i data-bt-unit-troops style="width:${pct}%"></i></span><span class="bt-unit-edge" data-bt-unit-edge hidden></span></button><button class="bt-unit-skill" data-action="battle-skill" data-index="${index}" ${live?.ready ? '' : 'disabled'}><b>${escapeHtml(live?.skillName ?? general.skillName)}</b><small data-bt-unit-cd>${general.skillUnlocked ? (active ? '대기' : '스킬') : '스킬 잠김'}</small></button></div>`
    }).join('')
    const modeLabel = battle?.mode === 'scenario' ? (battle.hardRule ? `시나리오 어려움 · ${HARD_RULE_INFO[battle.hardRule].label}` : '시나리오 전투') : battle?.mode === 'siege' ? '공성전' : battle?.mode === 'duel' ? '유저 대련' : battle?.mode === 'raid' ? `주간 레이드${this.raidSquadLabel ? ` · ${this.raidSquadLabel}` : ''}` : '일반 전투'
    const tactic = (id: 'guard' | 'feint' | 'charge', icon: string, label: string, note: string) => `<button class="bt-tactic bt-tactic--${id}" title="${label} · ${note}" data-action="battle-tactic" data-tactic="${id}" ${id === 'guard' ? 'data-bt-guard' : ''} disabled><span>${icon}</span><strong>${label}</strong><small>${note}</small><em>${battle?.tacticCosts[id] ?? { guard: 35, feint: 50, charge: 65 }[id]}</em></button>`
    return `<section class="page-section page-section--battle">
<div class="bt-top">
<div class="bt-hud glass-card"><div class="bt-hud-row"><span class="bt-phase" data-bt-phase>${battle?.phaseName ?? '1막 · 서전'}</span><b data-bt-morale-text>적 사기 ${battle?.moraleValue ?? 80} / ${battle?.moraleMax ?? 80}</b></div><div class="bt-bar bt-bar--morale"><i data-bt-morale style="width:${battle?.morale ?? 100}%"></i></div><div class="bt-hud-row bt-hud-row--threat"><span>아군 사기 <b data-bt-threat-text>${100 - (battle?.threat ?? 0)}</b></span><div class="bt-bar bt-bar--threat bt-bar--ally-morale"><i data-bt-threat style="width:${100 - (battle?.threat ?? 0)}%"></i></div><b class="bt-collapse" data-bt-collapse>사기 붕괴 ${battle?.collapses ?? 0}/2</b></div><div class="bt-hud-meta"><span class="bt-mode">${modeLabel}</span>${battle?.mode === 'raid' ? `<span class="bt-raid-damage">누적 피해 <b data-bt-raid>${formatNumber(battle?.raidDamage ?? 0)}</b></span>` : ''}<span data-bt-status>${battle?.status ?? '대기 중'}</span><span class="bt-time" data-bt-time>제한 90초</span><span data-bt-combo>연계 ${battle?.combo ?? 0}</span><span data-bt-pressure>적 압박 ×1.00</span><span data-bt-bond>${escapeHtml(battle?.bond ? `인연 · ${battle.bond}` : '인연 없음')}</span></div></div>
<div class="bt-enemies glass-card"><span class="bt-enemies-label">상대 무장</span><div class="bt-enemy-row" data-bt-enemies>${this.enemyHudMarkup(battle?.opponentDeck)}</div></div>
</div>
<div class="bt-stage"><div class="bt-paused" data-bt-paused hidden><strong>일시 정지</strong><small>전투 시간과 적의 행동이 멈췄습니다.</small><button class="action-button action-button--primary" data-action="battle-pause">▶ 계속하기</button></div><div class="bt-callout" data-bt-callout><span class="eyebrow">적 전술 예고</span><strong data-bt-pattern>${active ? '다음 예고 대기' : '전투 시작 전'}</strong><div class="bt-lanes"><span data-bt-lane="0">↙ 좌</span><span data-bt-lane="1">↑ 중</span><span data-bt-lane="2">↘ 우</span></div><div class="bt-bar bt-bar--window"><i data-bt-window style="width:0%"></i></div></div><div class="bt-enemy-warn" data-bt-enemy-warn hidden></div><div class="bt-feed"><ul class="bt-log" data-bt-log><li>전투 기록이 여기에 표시됩니다.</li></ul><button class="bt-log-toggle" data-action="battle-log">${this.battleLogOpen ? '접기' : '더 보기'}</button></div></div>
<div class="bt-controls glass-card"><div class="bt-units">${units}</div><div class="bt-tactic-row"><div class="bt-gauge"><span data-bt-gauge-text>전술 게이지 ${battle?.tacticGauge ?? 0}</span><div class="bt-bar bt-bar--gauge"><i data-bt-gauge style="width:${battle?.tacticGauge ?? 0}%"></i></div></div>${tactic('guard', '▣', '철벽 태세', '위협·적장 스킬 억제')}${tactic('feint', '⌁', '유인책', '연계 +2')}${tactic('charge', '⚔', '전군 돌격', '연계를 사기 피해로')}</div>${active ? '' : '<button class="action-button action-button--primary battle-start" data-action="battle-start">전투 시작 <span>→</span></button>'}</div>
</section>`
  }

  /** 전투 중 상단 바: 멈춤 · ×2 배속 · 자동(별 3개 시나리오) · 전투 중지 */
  private battleTopControls(): string {
    const battle = this.latestBattle
    return `<div class="topbar-battle"><button class="tb-btn" data-action="battle-pause" data-bt-pause aria-label="일시 정지">${battle?.paused ? '▶ 계속' : '❚❚ 멈춤'}</button><button class="tb-btn ${(battle?.speed ?? 1) >= 2 ? 'is-on' : ''}" data-action="battle-speed" data-bt-speed aria-label="2배속">×2 배속</button>${this.battleAutoAvailable ? `<button class="tb-btn ${battle?.autoPlay ? 'is-on' : ''}" data-action="battle-auto" data-bt-auto title="자동 전투: 예고 대응 정확도 70% · 스킬은 한 박자 늦게. 직접 하는 것보다 약합니다.">자동</button>` : ''}${battle?.duelMode ? `<button class="tb-btn ${battle.autoSkill ? 'is-on' : ''}" data-action="battle-auto-skill" data-bt-auto-skill aria-pressed="${battle.autoSkill}" title="스킬이 준비되면 알아서 씁니다. 예고 대응은 직접 하세요.">스킬 자동</button>` : ''}<button class="tb-btn" data-action="battle-guide" aria-label="전투 규칙">? 규칙</button><button class="tb-btn tb-btn--stop" data-action="battle-stop" data-bt-stop>■ 전투 중지</button></div>`
  }

  /** 상단 HUD의 적 무장 카드(초상·레벨·병력 막대) — Manus 전투 HUD 개선안 */
  private enemyHudMarkup(opponents: BattleOpponent[] = []): string {
    return opponents.length
      ? opponents.map((opponent, index) => `<div class="bt-enemy" data-bt-enemy="${index}"><div class="general-portrait bt-enemy-portrait has-portrait" style="--portrait:url('/assets/generals-realistic-webp/${opponent.id}.webp')"><span>${escapeHtml(opponent.name.slice(0, 1))}</span></div><div><strong class="bt-name-row"><span class="bt-name">${escapeHtml(opponent.name)}</span><span class="bt-fx" data-bt-enemy-fx></span></strong><small>${opponent.role} · Lv.${opponent.level}</small><span class="bt-enemy-troops"><i style="width:100%"></i></span></div></div>`).join('')
      : '<span class="bt-enemies-empty">전투 시작 시 적 무장이 배치됩니다.</span>'
  }


  /** 이 기기 설정: 그래픽 품질(새로고침 후) · 전투 효과(바로 적용) */
  private deviceSettingsCard(): string {
    const quality = qualitySetting(), effects = effectsSetting()
    const seg = (action: string, current: string, items: Array<[string, string]>) => `<div class="setting-seg">${items.map(([value, label]) => `<button class="setting-seg__btn ${current === value ? 'is-active' : ''}" data-action="${action}" data-value="${value}">${label}</button>`).join('')}</div>`
    return `<div class="glass-card device-settings"><div class="card-header"><div><span class="eyebrow">이 기기 설정</span><h3>화면 · 소리 · 전투 효과</h3></div></div><div class="setting-row"><div><strong>언어 / Language</strong><small>게임 전체 글자를 한국어 또는 영어로 보여 줍니다. 바꾸면 화면을 다시 불러옵니다.</small></div><div class="setting-seg" data-no-tr><button class="setting-seg__btn ${isEnglish() ? '' : 'is-active'}" data-action="set-lang" data-value="ko">한국어</button><button class="setting-seg__btn ${isEnglish() ? 'is-active' : ''}" data-action="set-lang" data-value="en">English</button></div></div><div class="setting-row"><div><strong>따라하기 안내</strong><small>게임 소개, 메뉴 짚어 주기, 첫 전투 따라하기를 처음부터 다시 봅니다.</small></div><button class="mini-action" data-action="coach-reset">안내 다시 보기</button></div><div class="setting-row"><div><strong>배경음악</strong><small>본영 · 전투 · 대련 · 레이드마다 다른 곡이 흐릅니다. 위쪽 🔊 버튼으로 모든 소리를 한 번에 끌 수 있습니다.</small></div>${seg('setting-music', muteSetting() ? 'off' : musicSetting(), [['off', '끔'], ['low', '작게'], ['mid', '보통'], ['high', '크게']])}</div><div class="setting-row"><div><strong>효과음</strong><small>버튼 · 강화 · 장비 · 전투(공격 · 스킬 · 승패) 소리입니다.</small></div>${seg('setting-sfx', muteSetting() ? 'off' : sfxSetting(), [['off', '끔'], ['low', '작게'], ['mid', '보통'], ['high', '크게']])}</div><div class="setting-row"><div><strong>그래픽 품질</strong><small>낮음은 빛 번짐·그림자를 끄고 병사 수를 줄입니다. 새로고침하면 적용됩니다.</small></div>${seg('setting-quality', quality, [['auto', '자동'], ['high', '높음'], ['low', '낮음']])}</div><div class="setting-row"><div><strong>전투 효과</strong><small>줄임은 불꽃·화살 수와 화면 흔들림을 줄입니다. 바로 적용됩니다. 자동은 화면이 버벅이면 스스로 줄입니다.</small></div>${seg('setting-effects', effects, [['auto', '자동'], ['full', '전체'], ['reduced', '줄임']])}</div>${this.account && !this.account.openId.startsWith('guest_') ? '' : `<div class="setting-row setting-row--danger"><div><strong>게스트 기록 초기화</strong><small>${this.account ? '이 게스트 아이디의 진행(무장 · 재화 · 튜토리얼 · 출석 · 안내 기록)을 서버에서도 모두 지우고 처음부터 다시 시작합니다. 아이디는 그대로 씁니다.' : '이 기기에 저장된 게스트 진행(무장·재화·튜토리얼·안내 기록)을 모두 지우고 접속 화면부터 다시 시작합니다. 회원 계정 기록은 지워지지 않습니다.'}</small></div><button class="mini-action mini-action--danger" data-action="guest-reset">초기화</button></div>`}</div>`
  }

  private accountSection(): string {
    const html = this.accountMain()
    // 로그인 전에는 바로 쓸 수 있는 기기 설정을 위에, 로그인 안내를 아래에
    if (this.auth.status !== 'authenticated') {
      const head = html.indexOf('<div class="glass-card account-gate">')
      if (head > 0) return `${html.slice(0, head)}${this.deviceSettingsCard()}${html.slice(head)}`
    }
    const at = html.lastIndexOf('</section>')
    return at < 0 ? html : `${html.slice(0, at)}${this.deviceSettingsCard()}${html.slice(at)}`
  }

  private accountMain(): string {
    if (this.auth.status !== 'authenticated') {
      return `<section class="page-section page-section--account"><div class="section-heading section-heading--compact"><div><span class="eyebrow">소통</span><h1>계정 관리</h1><p class="heading-copy">계정 정보를 확인하고 전적 동기화에 사용할 표시 이름을 관리합니다.</p></div></div><div class="glass-card account-gate"><div class="account-gate-mark">◎</div><h2>로그인하면 더 좋아집니다</h2><ul class="account-benefits"><li>다른 기기에서도 진행 상황 이어 하기</li><li>천하 랭킹에 이름 올리기 · 유저 대련 참가</li><li>매일 금화와 진영전 보상 받기</li></ul><button class="action-button action-button--primary" data-action="login">Manus 로그인 <span>→</span></button></div></section>`
    }
    if (!this.account) {
      return `<section class="page-section page-section--account"><div class="section-heading section-heading--compact"><div><span class="eyebrow">소통</span><h1>계정 관리</h1><p class="heading-copy">로그인 계정 정보를 불러오는 중입니다.</p></div><button class="ghost-button" data-action="account-refresh">새로고침 ↻</button></div><div class="glass-card account-loading">계정 정보를 안전하게 불러오고 있습니다…</div></section>`
    }
    const account = this.account
    const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
    const date = (value: string | Date) => new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    return `<section class="page-section page-section--account"><div class="section-heading section-heading--compact"><div><span class="eyebrow">소통</span><h1>계정 관리</h1><p class="heading-copy">계정 정보는 로그인한 사용자 본인만 조회하고 수정할 수 있습니다.</p></div><div class="account-badge"><span class="status-dot"></span> 보호된 계정</div></div><div class="account-layout"><div class="glass-card account-profile"><div class="account-profile-head"><div class="account-avatar">${escape(account.name.slice(0, 1) || '장')} </div><div><span class="eyebrow">로그인 정보</span><h2>${escape(account.name || '장군')}</h2><p>${escape(account.loginMethod)} · ${escape(account.role)}</p></div></div><div class="account-facts"><div><span>계정 번호</span><strong>#${account.id}</strong></div><div><span>가입일</span><strong>${date(account.createdAt)}</strong></div><div><span>최근 로그인</span><strong>${date(account.lastSignedIn)}</strong></div><div><span>마지막 변경</span><strong>${date(account.updatedAt)}</strong></div></div></div><div class="glass-card account-editor"><div class="card-header"><div><span class="eyebrow">프로필 편집</span><h3>계정 정보 편집</h3></div><span class="sync-label">본인만 수정</span></div><form data-account-form><label class="account-field"><span>표시 이름</span><input name="name" value="${escape(account.name)}" maxlength="32" required autocomplete="nickname"><small>천하 랭킹과 전적에 표시되는 이름입니다. 1~32자로 입력할 수 있습니다.</small></label><label class="account-field"><span>이메일</span><input value="${escape(account.email || 'OAuth 제공자에서 비공개')}" readonly><small>인증 제공자가 관리하는 정보는 게임에서 변경하지 않습니다.</small></label><div class="account-editor-actions"><span data-account-feedback>변경 사항을 저장하면 다음 로그인부터도 유지됩니다.</span><button class="action-button action-button--primary" type="submit">변경 저장 <span>→</span></button></div></form></div></div></section>`
  }

  private adminSection(state: StrategyState): string {
    const catalog = allGenerals()
    const filtered = catalog.filter(general => this.adminFilter === 'all' || (this.adminFilter === 'legendary' && general.grade === 5) || (this.adminFilter === 'officer' && general.role === '책사') || (this.adminFilter === 'deployed' && state.formation.includes(general.id))).slice(0, 8)
    const tabs = [['overview', '운영 개요'], ['accounts', '로그인 계정'], ['game-data', '게임 데이터'], ['board', '게시판 관리'], ['generals', '장수 콘텐츠'], ['season', '시즌 운영'], ['audit', '변경 기록']] as const
    const filters = [['all', '전체'], ['legendary', '천명'], ['officer', '책사'], ['deployed', '출전 중']] as const
    const activity: Array<[string, string, string, string]> = [
      ['08:04', '장수 도감', '삼국지 장수 50명 콘텐츠 팩 등록', 'jade'],
      ['07:24', '게임 밸런스', '모집 풀 70명 및 등급 확률 검증 완료', 'gold'],
      ['07:07', '전투 연출', '화살 궤적·검기·충격파 VFX 배포', 'jade'],
      ['06:52', '시즌 운영', '제1장 황혼의 관문 활성화', 'muted'],
    ]
    const tabMarkup = tabs.map(([id, label]) => `<button class="admin-tab ${this.adminTab === id ? 'is-active' : ''}" data-action="admin-tab" data-admin-tab="${id}">${label}</button>`).join('')
    let body = ''
    if (this.adminTab === 'overview') {
      body = `<div class="admin-kpis"><div class="glass-card admin-kpi"><span>도감 콘텐츠</span><strong>${catalog.length}</strong><small>전체 등록 장수</small><b class="kpi-up">+50 이번 업데이트</b></div><div class="glass-card admin-kpi"><span>활성 영토</span><strong>${state.cities.filter(city => city.owner === state.faction).length}<em> / ${state.cities.length}</em></strong><small>시즌 01 점령 상태</small><b class="kpi-neutral">정상 운영</b></div><div class="glass-card admin-kpi"><span>출전 진형</span><strong>${state.formation.length}<em> / 3</em></strong><small>현재 배치 장수</small><b class="kpi-up">전투 준비</b></div><div class="glass-card admin-kpi"><span>최고 전투 점수</span><strong>${formatNumber(state.battleScore)}</strong><small>${state.wins}승 · 개인 기록</small><b class="kpi-gold">로컬 기록</b></div></div><div class="admin-grid"><div class="glass-card admin-panel"><div class="card-header"><div><span class="eyebrow">서비스 상태</span><h3>서비스 상태</h3></div><span class="sync-label">실시간</span></div><div class="health-row"><span><i class="health-dot"></i> 게임 클라이언트</span><b>정상</b><small>Three.js · Vite</small></div><div class="health-row"><span><i class="health-dot"></i> 전투 시뮬레이션</span><b>정상</b><small>Rapier · 실시간</small></div><div class="health-row"><span><i class="health-dot"></i> 온라인 랭킹</span><b class="health-warn">대기</b><small>로그인 연결 시 활성</small></div><button class="action-button action-button--outline admin-action" data-action="admin-refresh">상태 새로고침 ↻</button></div><div class="glass-card admin-panel"><div class="card-header"><div><span class="eyebrow">최근 작전</span><h3>최근 운영 기록</h3></div><span class="rate-note">최근 24시간</span></div><div class="admin-activity">${activity.map(([time, category, message, tone]) => `<div class="activity-row"><time>${time}</time><span class="activity-mark activity-mark--${tone}"></span><div><b>${category}</b><p>${message}</p></div></div>`).join('')}</div></div></div>`
    } else if (this.adminTab === 'generals') {
      body = `<div class="glass-card admin-panel admin-content-panel"><div class="admin-panel-top"><div><span class="eyebrow">무장 자료</span><h3>장수 콘텐츠 관리</h3><p>총 ${catalog.length}명의 장수 카드와 모집 등급을 확인합니다.</p></div><div class="admin-filters">${filters.map(([id, label]) => `<button class="admin-filter ${this.adminFilter === id ? 'is-active' : ''}" data-action="admin-filter" data-admin-filter="${id}">${label}</button>`).join('')}</div></div><div class="admin-general-table"><div class="admin-table-head"><span>장수</span><span>역할</span><span>등급</span><span>레벨</span><span>상태</span></div>${filtered.map(general => `<div class="admin-general-row"><div class="admin-general-name">${this.portrait(general, 'admin-portrait')}<span><b>${general.name}</b><small>${general.skillName}</small></span></div><span>${general.role}</span><strong style="color:${GRADE_META[general.grade].color}">${general.grade} · ${GRADE_META[general.grade].label}</strong><span>Lv.${general.level}</span><em>${state.formation.includes(general.id) ? '출전 중' : '대기'}</em></div>`).join('')}</div><div class="admin-table-foot">표시 ${filtered.length}명 · 전체 도감은 무장 관리에서 확인할 수 있습니다.</div></div>`
    } else if (this.adminTab === 'accounts') {
      const accountRows = this.adminAccounts.map(account => `<div class="admin-account-row"><div class="admin-account-identity"><span class="admin-account-avatar">${escapeHtml((account.name || '장').slice(0, 1))}</span><span><b>${escapeHtml(account.name || '이름 없음')}</b><small>${escapeHtml(account.email || account.openId)}</small></span></div><span>#${account.id}</span><span>${escapeHtml(account.loginMethod)}</span><span class="admin-account-last">${new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(new Date(account.lastSignedIn))}</span><span class="admin-role admin-role--${account.role}">${account.role === 'admin' ? '관리자' : '일반 사용자'}</span><button class="mini-action" data-action="admin-role" data-account-id="${account.id}" data-account-role="${account.role === 'admin' ? 'user' : 'admin'}">${account.role === 'admin' ? '일반으로' : '관리자로'}</button></div>`).join('')
      body = `<div class="glass-card admin-panel admin-content-panel"><div class="admin-panel-top"><div><span class="eyebrow">가입 유저 목록</span><h3>로그인 계정 관리</h3><p>Manus OAuth로 로그인한 사용자와 관리자 권한을 관리합니다.</p></div><button class="ghost-button" data-action="admin-accounts-refresh">계정 새로고침 ↻</button></div><div class="admin-account-toolbar"><label><span>계정 검색</span><input data-admin-account-search value="${escapeHtml(this.adminAccountSearch)}" placeholder="이름·이메일·Open ID 검색"></label><button class="action-button action-button--outline" data-action="admin-account-search">검색</button><span class="admin-directory-count">${this.adminAccounts.length}명 표시</span></div>${this.adminAccountsError ? `<div class="admin-account-gate"><div class="account-gate-mark">◎</div><h3>관리자 권한이 필요합니다</h3><p>${escapeHtml(this.adminAccountsError)}</p><small>현재 계정의 role이 admin인지 확인한 뒤 다시 시도하십시오.</small></div>` : `<div class="admin-account-table"><div class="admin-table-head"><span>계정</span><span>ID</span><span>로그인 방식</span><span>최근 로그인</span><span>권한</span><span>작업</span></div>${accountRows || '<div class="admin-empty-row">표시할 로그인 계정이 없습니다.</div>'}</div><div class="admin-table-foot">계정 목록은 서버의 관리자 전용 라우터에서 조회됩니다. 권한 변경은 데이터베이스에 저장됩니다.</div>`}</div>`
    } else if (this.adminTab === 'board') {
      const boardRows = this.adminBoard.posts.map(post => `<article class="admin-board-row"><div><span class="pill pill--jade">${escapeHtml(post.board)}</span><strong>${ugc(post.title)}</strong><small>${ugc(post.authorName)} · ${escapeHtml(post.authorFaction)}</small></div><button class="mini-action" data-action="admin-board-delete" data-post-id="${post.id}">관리자 삭제</button></article>`).join('')
      body = `<div class="glass-card admin-panel admin-content-panel"><div class="admin-panel-top"><div><span class="eyebrow">게시판 관리</span><h3>게시판 운영 관리</h3><p>관리자는 모든 게시글을 삭제할 수 있고, 일반 사용자의 새 글 작성을 제한할 수 있습니다.</p></div><button class="ghost-button" data-action="admin-board-refresh">게시판 새로고침 ↻</button></div><div class="admin-board-control"><div><strong>일반 사용자 글 작성</strong><small>${this.adminBoard.postingEnabled ? '현재 허용 중입니다.' : '현재 제한 중입니다.'}</small></div><button class="action-button ${this.adminBoard.postingEnabled ? 'action-button--outline' : 'action-button--primary'}" data-action="admin-board-posting" data-enabled="${this.adminBoard.postingEnabled ? 'false' : 'true'}">${this.adminBoard.postingEnabled ? '작성 제한하기' : '작성 허용하기'}</button></div><div class="admin-board-list">${boardRows || '<div class="admin-empty-row">현재 게시글이 없습니다.</div>'}</div></div>`
    } else if (this.adminTab === 'game-data') {
      const search = this.adminGameSearch.toLocaleLowerCase('ko-KR')
      const shown = this.adminGameAccounts.filter(account => !search || `${account.name} ${account.email} ${account.openId} #${account.id}`.toLocaleLowerCase('ko-KR').includes(search))
      const stateRows = shown.map(account => {
        const game = account.game
        const chips = [`진영 ${game.faction ?? '—'}${game.factionChosen === false ? '(미선택)' : ''}`, `무장 ${formatNumber(game.generalCount ?? 0)}명`, `최고 Lv.${game.maxLevel ?? 0}`, `시나리오 ${game.scenarioCleared ?? 0}/${SCENARIOS.length}`, `어려움 ${game.hardCleared ?? 0}/${SCENARIOS.length}`]
        const groups = ADMIN_GAME_FIELDS.map(([title, fields]) => `<fieldset class="game-data-group"><legend>${title}</legend>${fields.map(([field, label]) => { const value = Number(game[field as keyof typeof game] ?? 0); return `<label><span>${label}</span><input type="number" min="0" step="1" inputmode="numeric" data-game-field="${field}" data-original="${value}" value="${value}"></label>` }).join('')}</fieldset>`).join('')
        const faction = `<fieldset class="game-data-group"><legend>진영</legend><label><span>소속</span><select data-game-field="faction" data-original="${game.faction ?? '촉한'}">${(['촉한', '위나라', '오나라'] as const).map(option => `<option value="${option}" ${game.faction === option ? 'selected' : ''}>${option}</option>`).join('')}</select></label></fieldset>`
        return `<article class="game-data-row" data-game-user="${account.id}"><header class="game-data-head"><div class="admin-account-identity"><span class="admin-account-avatar">${escapeHtml((account.name || '장').slice(0, 1))}</span><span><b>${escapeHtml(account.name || '이름 없음')} <small>#${account.id}</small></b><small>${escapeHtml(account.email || account.openId)}</small></span></div>${account.operator ? '<span class="admin-role admin-role--admin" title="랭킹 · 영토전 · 레이드 순위 · 대련 상대에 반영되지 않습니다">운영자 · 순위 제외</span>' : ''}<div class="game-data-chips">${chips.map(chip => `<span>${escapeHtml(chip)}</span>`).join('')}</div></header><div class="game-data-fields">${groups}${faction}</div><footer class="game-data-foot"><small data-game-changed>바꾼 칸만 저장됩니다.</small><button class="ghost-button" data-action="admin-game-reset">되돌리기</button><button class="action-button action-button--primary game-data-save" data-action="admin-game-save" data-account-id="${account.id}">저장</button></footer></article>`
      }).join('')
      body = `<div class="glass-card admin-panel admin-content-panel"><div class="admin-panel-top"><div><span class="eyebrow">계정 진행 상황</span><h3>게임 계정 데이터 편집</h3><p>계정별 재화 · 신화 장비 재료 · 전적 · 내정 자원 · 진영을 고칩니다. 금화 · 신화 조각 · 낙양 강화석(서버 원장)도 적은 값 그대로 저장됩니다.</p></div><button class="ghost-button" data-action="admin-game-refresh">데이터 새로고침 ↻</button></div>${this.adminGameDataError ? `<div class="admin-account-gate"><div class="account-gate-mark">◎</div><h3>관리자 권한이 필요합니다</h3><p>${escapeHtml(this.adminGameDataError)}</p></div>` : `<div class="game-data-legend"><span>저장 방식</span><b>바꾼 칸만 서버에 저장</b><small>그 유저가 접속 중이면 다음 저장 때 게임 화면에도 바로 반영됩니다(10분 안). 운영자 계정은 랭킹 · 영토전 · 레이드 순위 · 대련 상대에서 빠집니다.</small></div><div class="admin-account-toolbar"><label><span>계정 검색</span><input data-admin-game-search value="${escapeHtml(this.adminGameSearch)}" placeholder="이름 · 이메일 · #번호"></label><button class="action-button action-button--outline" data-action="admin-game-search">검색</button><span class="admin-directory-count">${shown.length} / ${this.adminGameAccounts.length}명</span></div><div class="game-data-list">${stateRows || '<div class="admin-empty-row">게임 계정 데이터가 없습니다.</div>'}</div>`}</div>`
    } else if (this.adminTab === 'season') {
      body = `<div class="admin-grid"><div class="glass-card admin-panel season-control"><div class="card-header"><div><span class="eyebrow">시즌 관리</span><h3>시즌 01 · 황혼의 관문</h3></div><span class="admin-state-chip ${this.adminPublished ? 'is-on' : 'is-off'}">${this.adminPublished ? '게시 중' : '비공개'}</span></div><div class="season-banner"><span>시즌 1</span><strong>황혼의 관문</strong><small>실시간 전술 전략 캠페인</small></div><div class="season-meta"><span>시작일 <b>2026.10.01</b></span><span>콘텐츠 <b>정상</b></span><span>모집 풀 <b>${allGenerals().length}명</b></span></div><button class="action-button action-button--primary admin-action" data-action="admin-toggle-publish">${this.adminPublished ? '시즌 비공개 전환' : '시즌 게시 재개'} <span>→</span></button></div><div class="glass-card admin-panel"><div class="card-header"><div><span class="eyebrow">공지</span><h3>운영 공지</h3></div><span class="rate-note">시즌 배너</span></div><label class="admin-field"><span>현재 공지 문구</span><input value="황혼의 관문 · 삼국지 장수 50명 업데이트" readonly></label><button class="action-button action-button--outline admin-action" data-action="admin-announce">공지 미리보기 표시</button><p class="admin-note">이 화면의 시즌 변경은 로컬 관리자 미리보기 상태이며 서버 게시 권한을 대신하지 않습니다.</p></div></div>`
    } else {
      body = `<div class="glass-card admin-panel admin-audit"><div class="card-header"><div><span class="eyebrow">작업 기록</span><h3>변경 기록</h3></div><span class="sync-label">최근 작업</span></div>${activity.concat([['06:31', '품질 검증', '타입 검사·38개 테스트·프로덕션 빌드 통과', 'jade'] as const]).map(([time, category, message, tone]) => `<div class="audit-row"><time>${time}</time><span class="activity-mark activity-mark--${tone}"></span><div><b>${category}</b><p>${message}</p></div><small>검증됨</small></div>`).join('')}</div>`
    }
    return `<section class="page-section page-section--admin"><div class="admin-heading"><div><span class="eyebrow">관리자</span><h1>관리자 센터</h1><p class="heading-copy">게임 콘텐츠와 시즌 운영 상태를 한 화면에서 점검합니다.</p></div><div class="admin-live-badge"><i></i><span>운영 콘솔 · 로컬 상태</span></div><a class="admin-balance-link" href="./balance.html">⚖ 밸런스 조정 테스트 열기</a></div><div class="admin-tabs">${tabMarkup}</div>${body}</section>`
  }

  private shopSection(state: StrategyState): string {
    const statLabels: Record<string, string> = { leadership: '통솔', martial: '무력', stratagem: '모략', speed: '속도' }
    const nameOf = (resource: ShopResource) => resource === 'honor' ? '옥패' : resource === 'manuals' ? '병서' : RESOURCE_META[resource].label
    const iconOf = (resource: ShopResource) => icon(resource)
    const holdingOf = (resource: ShopResource) => resource === 'honor' ? state.honor : resource === 'manuals' ? state.manuals : resource === 'silver' ? state.silver : state.resources[resource]
    const all = shopPackages()
    const buyButton = (item: ShopPackage, label = `${item.goldCost}금화`) => {
      const short = item.goldCost - state.gold
      const bonus = packageBonus(item, all)
      const action = item.kind === 'honor' ? 'honor-shop-purchase' : 'cash-shop-purchase'
      const idAttr = item.kind === 'honor' ? `data-package-id="${item.id}"` : `data-product-id="${item.id}"`
      return `<button class="shop-buy ${bonus >= 0.4 ? 'is-best' : ''}" data-action="${action}" ${idAttr} data-cost="${item.goldCost}" data-label="${escapeHtml(`${nameOf(item.resource)} +${formatNumber(item.amount)}`)}" ${short > 0 ? 'disabled' : ''}><b>${label}</b><span>+${formatNumber(item.amount)}</span>${bonus >= 0.05 ? `<em>+${Math.round(bonus * 100)}% 이득</em>` : '<em class="is-plain">기본</em>'}${short > 0 ? `<small>금화 ${short}개 부족</small>` : ''}</button>`
    }
    const balances = `<div class="shop-balances shop-balances--strip glass-card"><span>${icon('gold', 'gi--inline')} 금화 <b>${formatNumber(state.gold)}</b></span><span>${icon('honor', 'gi--inline')} 옥패 <b>${formatNumber(state.honor)}</b></span><span>${icon('mythic', 'gi--inline')} 신화 조각 <b>${state.mythicFragments}</b></span><span>낙양 강화석 <b>${state.mythicStones}</b></span></div>`
    const tabs = `<div class="shop-tabs shop-tabs--row" role="tablist"><button class="shop-tab ${this.shopTab === 'resources' ? 'is-active' : ''}" data-action="shop-tab" data-shop-tab="resources">자원·옥패</button><button class="shop-tab ${this.shopTab === 'mythic' ? 'is-active' : ''}" data-action="shop-tab" data-shop-tab="mythic">신화 장비</button><button class="shop-tab ${this.shopTab === 'gold' ? 'is-active' : ''}" data-action="shop-tab" data-shop-tab="gold">금화 충전</button></div>`
    let body = ''
    if (this.shopTab === 'gold') {
      if (GOLD_PURCHASE_ENABLED) body = `<div class="shop-grid">${GOLD_PACKAGES.map(goldPackage => `<article class="shop-item shop-item--gold glass-card"><div class="shop-item-icon shop-item-icon--gold">${icon('gold')}</div><div class="shop-item-copy"><span class="pill pill--mythic">금화 충전</span><h2>${escapeHtml(goldPackage.name)}</h2><small>금화 +${goldPackage.gold}개 · 1개당 1,500원</small></div><button class="action-button action-button--primary" data-action="gold-purchase" data-package-id="${goldPackage.id}">₩ ${goldPackage.priceKRW.toLocaleString(locale())} · 충전</button></article>`).join('')}</div>`
      else {
        const gotToday = state.prelaunchGoldDayKey === dayKey()
        body = `<div class="glass-card shop-prelaunch"><span class="eyebrow">정식 출시 전</span><h2>매일 금화 100개를 드립니다</h2><p>금화 충전은 정식 출시 때 열립니다. 그 전까지는 접속하면 하루 한 번 금화 100개가 지급됩니다.</p><strong class="${gotToday ? 'is-done' : ''}">${gotToday ? '오늘 금화를 받았습니다' : '오늘 금화는 접속·동기화 때 자동으로 지급됩니다'}</strong></div>`
      }
    } else if (this.shopTab === 'resources') {
      const needs = shopNeeds(state)
      const needCard = needs.length ? `<div class="glass-card shop-needs"><div class="card-header"><div><span class="eyebrow">지금 필요한 것</span><h3>모자란 자원 추천</h3></div></div><ul>${needs.map(need => `<li><div><strong>${escapeHtml(need.reason)}</strong><small>${nameOf(need.resource)} ${formatNumber(need.short)} 부족 · 보유 ${formatNumber(holdingOf(need.resource))}</small></div>${need.item ? buyButton(need.item) : '<small class="shop-needs__none">묶음 하나로는 부족합니다</small>'}</li>`).join('')}</ul></div>` : '<div class="glass-card shop-needs shop-needs--ok"><span class="eyebrow">지금 필요한 것</span><p>다음 무장 레벨업·연구·건물 강화·10회 모집에 필요한 재화가 모두 충분합니다.</p></div>'
      const resources: ShopResource[] = ['manuals', 'honor', 'silver', 'iron', 'grain', 'wood', 'influence']
      const rows = resources.map(resource => `<div class="shop-row"><div class="shop-row__head">${iconOf(resource)}<div><strong>${nameOf(resource)}</strong><small>보유 ${formatNumber(holdingOf(resource))}</small></div></div><div class="shop-row__buys">${all.filter(item => item.resource === resource).map(item => buyButton(item)).join('')}</div></div>`).join('')
      body = `${needCard}<div class="shop-notice glass-card"><strong>교환 안내</strong><span>금화로 병서(무장 레벨업)·옥패(무장 모집)·자원을 삽니다. 큰 묶음일수록 이득이고, 20금화 이상은 한 번 더 묻습니다.</span></div><div class="glass-card shop-table">${rows}</div>${this.purchaseLogCard()}`
    } else {
      const fragments = state.mythicFragments
      const progress = Math.min(1, fragments / MYTHIC_FRAGMENT_COST)
      const duelsLeft = duelAttemptsRemaining(state)
      const formation = state.formation.map(id => state.generals.find(general => general.id === id)).filter((general): general is General => Boolean(general))
      const preview = (item: Equipment) => {
        // 출전 무장 중 이 종류 칸이 가장 약한 무장에게 끼웠을 때
        const options = formation.map(general => {
          const currentId = state.equipmentLoadouts[general.id]?.[item.type]
          const current = currentId ? state.equipmentInventory.find(entry => entry.id === currentId) : undefined
          return { general, current, gain: equipmentValue(item) - (current && current.mainStat === item.mainStat ? equipmentValue(current) : 0) }
        }).sort((x, y) => y.gain - x.gain)
        const best = options[0]
        return best ? `<p class="shop-preview">${escapeHtml(best.general.name)}에게 장착 시 ${statLabels[item.mainStat]} <b>+${best.gain}</b> <small>(지금 ${EQUIPMENT_TYPE_META[item.type].label}: ${best.current ? escapeHtml(best.current.name) : '비어 있음'})</small></p>` : ''
      }
      const cards = MYTHIC_SHOP_EQUIPMENT.map(item => { const specialty = equipmentSpecialty(item); return `<article class="shop-item shop-item--${item.set} glass-card"><div class="shop-item-icon"><img class="equipment-image--mythic" src="${equipmentImage(item.type)}" alt="${EQUIPMENT_TYPE_META[item.type].label}" /></div><div class="shop-item-copy"><span class="pill pill--mythic">신화 · ${EQUIPMENT_TYPE_META[item.type].label}</span><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.skillDescription)}</p><small>${escapeHtml(EQUIPMENT_SET_META[item.set].label)} · ${statLabels[item.mainStat]} +${item.baseValue} · ${escapeHtml(item.skillName)}</small>${specialty ? `<strong class="shop-specialty">특기 · ${escapeHtml(specialty.label)} · ${escapeHtml(specialty.description)}</strong>` : ''}${preview(item)}<span class="shop-progress"><i style="width:${progress * 100}%"></i><em>조각 ${Math.min(fragments, MYTHIC_FRAGMENT_COST)}/${MYTHIC_FRAGMENT_COST}</em></span></div><button class="action-button action-button--primary" data-action="shop-purchase" data-equipment-id="${item.id}" data-cost-fragments="${MYTHIC_FRAGMENT_COST}" data-label="${escapeHtml(item.name)}" ${fragments < MYTHIC_FRAGMENT_COST ? 'disabled' : ''}>${fragments < MYTHIC_FRAGMENT_COST ? `조각 ${MYTHIC_FRAGMENT_COST - fragments}개 더 필요` : `조각 ${MYTHIC_FRAGMENT_COST}개로 교환`}</button></article>` }).join('')
      body = `<div class="glass-card shop-mythic-guide"><div class="shop-mythic-guide__bar"><span>신화 조각 <b>${fragments}</b> / ${MYTHIC_FRAGMENT_COST}</span><i><b style="width:${progress * 100}%"></b></i></div><p>유저 대련 승리 = 조각 쉬움 1 · 보통 2 · 어려움 3개 · 하루 5회 · 오늘 남은 대련 <b>${duelsLeft}회</b></p><p class="shop-mythic-guide__stone">신화장비는 낙양 강화석으로만 강화합니다(낙양 점령 1회당 1개 · 보유 ${state.mythicStones}개).</p><button class="action-button action-button--outline" data-action="section" data-section="duel">유저 대련 하러 가기 →</button></div><div class="shop-grid">${cards}</div>${this.purchaseLogCard()}`
    }
    const description = this.shopTab === 'gold' ? '금화 충전 안내' : this.shopTab === 'resources' ? '금화로 자원과 옥패를 바꿉니다. 지금 모자란 것을 먼저 추천합니다.' : '유저 대련에서 모은 신화 조각으로 신화장비를 교환합니다.'
    return `<section class="page-section page-section--shop"><div class="section-heading section-heading--compact"><div><span class="eyebrow">소통</span><h1>상점</h1><p class="heading-copy">${description}</p></div></div>${balances}${tabs}${body}</section>`
  }

  /** 이 기기에서 최근 구매 10건 */
  private purchaseLogCard(): string {
    const log = readPurchaseLog()
    if (!log.length) return ''
    return `<div class="glass-card shop-log"><span class="eyebrow">최근 구매</span><ul>${log.map(entry => `<li><span>${escapeHtml(entry.text)}</span><small>${new Intl.DateTimeFormat(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.at))}</small></li>`).join('')}</ul></div>`
  }

  /** 구매 확인 창(금화 20개 이상 · 신화 조각 교환) */
  private raidStepTimer: number | null = null
  /** 지금 싸우는 레이드 군(예: 2군 2/3) */
  raidSquadLabel = ''

  /** 레이드 군 사이: 방금 군의 피해와 다음 출전 군(5초 뒤 자동 출전) */
  showRaidStep(info: { finishedLabel: string; damage: number; total: number; nextLabel: string; nextNames: string[]; step: number; count: number }, onGo: () => void): void {
    this.closeRaidStep()
    const modal = document.createElement('div')
    modal.className = 'shop-confirm raid-step'
    let left = 5
    let done = false
    const go = () => { if (done) return; done = true; this.closeRaidStep(); onGo() }
    modal.innerHTML = `<div class="shop-confirm__card"><span class="eyebrow">주간 레이드 · ${info.step - 1}/${info.count} 완료</span><h2>${escapeHtml(info.finishedLabel)} 피해 ${formatNumber(info.damage)}</h2><p>지금까지 합계 ${formatNumber(info.total)}</p><div class="raid-step__next"><small>다음 출전</small><strong>${escapeHtml(info.nextLabel)} (${info.step}/${info.count})</strong><span>${info.nextNames.map(escapeHtml).join(' · ')}</span></div><div class="shop-confirm__actions"><button class="action-button action-button--primary" data-raid-go>${escapeHtml(info.nextLabel)} 출전 <b data-raid-count>${left}</b></button></div></div>`
    modal.querySelector('[data-raid-go]')?.addEventListener('click', go)
    document.body.appendChild(modal)
    this.raidStepTimer = window.setInterval(() => {
      left -= 1
      const count = modal.querySelector('[data-raid-count]')
      if (count) count.textContent = String(Math.max(0, left))
      if (left <= 0) go()
    }, 1000)
  }

  closeRaidStep(): void {
    if (this.raidStepTimer !== null) { window.clearInterval(this.raidStepTimer); this.raidStepTimer = null }
    document.querySelector('.raid-step')?.remove()
  }

  /** 2·3군이 비어 있을 때: 남은 무장으로 채울지, 그대로 출전할지, 편성으로 갈지 */
  askRaidSquads(emptyLabels: string[], spare: number, onChoose: (choice: 'fill' | 'go' | 'edit') => void): void {
    document.querySelector('.shop-confirm')?.remove()
    const modal = document.createElement('div')
    modal.className = 'shop-confirm'
    modal.innerHTML = `<div class="shop-confirm__card"><span class="eyebrow">주간 레이드</span><h2>${escapeHtml(emptyLabels.join('·'))}이 비어 있습니다</h2><p>레이드는 1군 → 2군 → 3군의 피해 합계로 순위를 겨룹니다. 대기 무장 ${spare}명으로 빈 군을 자동 편성·장착하고 출전할까요?</p><div class="shop-confirm__actions raid-ask"><button class="action-button action-button--primary" data-raid-choice="fill">자동 편성 후 출전</button><button class="action-button action-button--outline" data-raid-choice="go">이대로 출전</button><button class="action-button action-button--outline" data-raid-choice="edit">편성하러 가기</button></div></div>`
    const close = () => modal.remove()
    modal.addEventListener('click', event => {
      const target = event.target as HTMLElement
      const choice = target.closest<HTMLElement>('[data-raid-choice]')?.dataset.raidChoice as 'fill' | 'go' | 'edit' | undefined
      if (choice) { close(); onChoose(choice) }
      else if (target === modal) close()
    })
    document.body.appendChild(modal)
  }

  private confirmPurchase(title: string, detail: string, onOk: () => void, labels: { eyebrow?: string; ok?: string } = {}): void {
    document.querySelector('.shop-confirm')?.remove()
    const modal = document.createElement('div')
    modal.className = 'shop-confirm'
    modal.innerHTML = `<div class="shop-confirm__card"><span class="eyebrow">${escapeHtml(labels.eyebrow ?? '구매 확인')}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p><div class="shop-confirm__actions"><button class="action-button action-button--outline" data-confirm-no>취소</button><button class="action-button action-button--primary" data-confirm-yes>${escapeHtml(labels.ok ?? '구매')}</button></div></div>`
    const close = () => modal.remove()
    modal.addEventListener('click', event => { if (event.target === modal) close() })
    modal.querySelector('[data-confirm-no]')?.addEventListener('click', close)
    modal.querySelector('[data-confirm-yes]')?.addEventListener('click', () => { close(); onOk() })
    document.body.appendChild(modal)
  }

  private updatesSection(): string {
    // 지금까지의 업데이트를 주제별로 요약(새 항목은 맨 위에 더한다)
    const completed = [
      ['2026.10.17', '새 도시 영창 · 발해, 지도 위치 정리', '운남 서쪽에 영창(1단계), 평원 북쪽에 발해(2단계) 중립 도시가 생겨 운남–영창, 평원–발해로 이어집니다. 남해는 지도 그림의 강 하구로, 건안은 해안선으로 옮겼고, 성이 겹쳐 이름이 가려지던 도시(낭야 · 수춘 · 합비 · 여강 · 완성 · 신야 · 양양 · 복양 · 광릉 · 운남)를 조금씩 떼어 놓았습니다.', '완료', 'jade'],
      ['2026.10.17', '진군로 추가 · 건안', '신도–파동, 신도–건녕, 하비–수춘 진군로가 이어졌습니다. 회계와 남해 사이 해안에 1단계 중립 도시 건안이 생겨 회계–건안–남해로 이어집니다.', '완료', 'jade'],
      ['2026.10.17', '출석 체크 그림', '출석 체크 창의 날짜마다 보상 그림이 들어갑니다. 무장은 초상, 재화는 재화 그림, 무료 뽑기는 횟수 표시와 함께 보이고, 받은 날은 ✓, 오늘 받을 칸은 반짝입니다.', '완료', 'jade'],
      ['2026.10.17', '아군 사기 · 대련 훈련 상대', '전투 화면의 위협도를 아군 사기(100에서 시작해 깎이는 막대)로 바꿔 보여 줍니다. 계산은 그대로이며, 0이 되면 사기 붕괴(병력 감소)가 일어나고 두 번이면 패배합니다. 스킬 · 효과 설명도 아군 사기 기준으로 고쳤습니다. 유저 대련의 훈련 상대(더미 덱)는 난이도를 10% 낮췄습니다(내 덱 전력의 77% · 90% · 104%).', '완료', 'jade'],
      ['2026.10.17', '중립 도시 수비 강화 · 무장 관리 편의', '영토 중립 도시 수비대의 평균 레벨이 2배가 되었습니다(도시 단계별 Lv.20~60, 공성 전투의 적도 같은 레벨). 보유 무장에 레벨 초기화 버튼이 생겨 금화 10개로 Lv.1로 되돌리고 레벨에 쓴 은전 · 병서의 80%를 돌려받습니다(성급 · 장비 · 스킬 해금은 유지). 능력치(통솔 · 무력 · 모략 · 속도)를 누르면 설명이, 스킬 상세의 버프 · 디버프를 누르면 효과가 나옵니다. 장비 관리는 무장 선택 → 장비 3칸 → 보유 장비 순으로 간단해졌고, 프리셋 · 세트 능력 · 필터는 접어 두었습니다.', '완료', 'jade'],
      ['2026.10.17', '전투 화면: 스킬 · 효과 표시', '스킬을 쓰면 화면 가운데 띠 대신 그 무장 머리 위에 초상과 스킬 이름이 떠오릅니다(무장이 움직이면 따라감). 버프 · 디버프는 아군 · 적 무장 카드의 이름 옆 아이콘으로 보여 주고, 아이콘에 마우스를 올리면 효과와 남은 시간이 나옵니다. 혼란처럼 한 명에게 걸린 효과는 그 무장에게만 표시됩니다.', '완료', 'jade'],
      ['2026.10.17', '게스트 계정 초기화', '아이디를 정한 게스트 계정에서 설정의 게스트 기록 초기화가 듣지 않던 문제를 고쳤습니다. 이제 서버에 저장된 진행(무장 · 재화 · 튜토리얼 · 출석)까지 지우고 같은 아이디로 처음부터 시작합니다. 회원 계정에는 이 버튼이 보이지 않습니다.', '완료', 'jade'],
      ['2026.10.17', '혼란: 적과 아군을 가리지 않고', '혼란에 빠진 무장은 공격과 스킬마다 반반 확률로 상대편 또는 같은 편을 노립니다. 혼란 무장만 모은 덱이 지나치게 쉽게 이기던 문제를 줄였습니다.', '완료', 'jade'],
      ['2026.10.17', '출석 창 · 튜토리얼 정리', '처음 들어올 때 튜토리얼 안내에 막혀 출석 창의 받기 완료 버튼이 눌리지 않던 문제를 고쳤습니다. 출석 창은 세력을 고른 뒤에 뜨고, 그동안 튜토리얼은 잠시 기다립니다.', '완료', 'jade'],
      ['2026.10.17', '출석 체크 이벤트', '게임에 접속하면 하루에 한 번 출석 보상 창이 저절로 뜨고 보상을 받습니다(한국 시간 자정 기준, 빠진 날이 있어도 다음 날짜로 이어짐). 첫 7일: 조인 · 무장 뽑기 무료 50회 · 장비 뽑기 무료 50회 · 금화 100 · 은전 5만 · 병서 500 · 조운. 이어지는 30일: 옥패 · 은전 · 병서 · 자원 · 무료 뽑기 · 금화 · 신화장비 조각 · 낙양 강화석, 마지막 날 천명 무장 1명. 무료 뽑기권은 모집 · 장비 뽑기에서 옥패보다 먼저 쓰입니다.', '완료', 'jade'],
      ['2026.10.16', '게스트도 서버 계정', '게스트로 들어오면 처음에 아이디(한글 · 영문 · 숫자 · 밑줄 2~12자)를 정합니다. 그러면 서버에 계정이 생겨 회원과 똑같이 저장 · 천하 랭킹 · 영토전 · 유저 대련 · 주간 레이드 · 게시판을 모두 쓸 수 있습니다. 이 기기의 예전 게스트 진행은 새 계정으로 옮겨집니다(금화 · 신화 재료는 서버 기준). 서버에 연결할 수 없을 때만 예전처럼 이 기기에만 저장합니다.', '완료', 'jade'],
      ['2026.10.16', '도시 관리 버튼 정리', '영토의 도시 관리 칸에서 공성 출정 · 최종 세력전 버튼이 오른쪽으로 잘리던 것을 고쳤습니다. 좁은 칸에서는 비용이 아래 줄로 내려가고, 잠긴 버튼과 전투 기록의 어두운 글자를 밝게 바꿨습니다.', '완료', 'jade'],
      ['2026.10.16', '혼란 효과 변경', '혼란에 빠진 무장 1명은 5~6초 동안 일반 공격과 스킬로 같은 편을 공격합니다. 스킬은 준비되는 대로 저절로 쓰이며(직접 쓸 수 없음), 혼란이 풀리거나 해제되면 바로 돌아옵니다. 제갈량 · 초선 · 장각 · 장보의 스킬은 노린 적장 1명을, 적의 혼란 계략은 같은 레인의 아군 1명을 혼란에 빠뜨립니다. 예전 효과(위협도 증감 · 적 공격 감소)는 없앴습니다.', '완료', 'jade'],
      ['2026.10.16', '내정 건물 공사 시간 · 점령 시 초기화', '내정 건물 강화가 연구처럼 시간이 걸립니다(1→2단계 10분 · 2→3단계 30분 · 3→4단계 1시간 30분 · 4→5단계 4시간). 도시마다 한 번에 하나씩 지으며, 금화로 즉시 완공하거나(남은 10분마다 금화 1개) 취소하고 자원을 돌려받을 수 있습니다. 아군 도시를 상대에게 점령당하면 그 도시의 건물이 모두 1단계로 돌아가고 공사도 사라집니다.', '완료', 'jade'],
      ['2026.10.16', '최종 세력전 버튼', '최종 세력전 버튼이 잠겨 있으면 그 아래에 남은 조건(성벽 방어도 · 남은 수비병)을 보여 줍니다. 운영자 계정은 영토전에 반영되지 않는 대신, 직접 공격한 도시의 공성 진행을 이 기기에서 이어 갈 수 있어 최종 세력전까지 시험할 수 있습니다(연습 모드).', '완료', 'jade'],
      ['2026.10.16', '서버 보상 금화가 사라지던 문제', '매일 금화 · 시나리오 첫 클리어 금화 · 세력전 금화 · 대련 신화 조각 · 레이드와 낙양전 보상을 받는 순간 게임 저장이 겹치면 받은 보상이 사라질 수 있던 문제를 고쳤습니다. 이제 보상 지급과 저장이 차례대로 처리됩니다. 정식 출시 전 매일 금화 100개는 정식 출시 스위치를 켜면 자동으로 멈춥니다.', '완료', 'jade'],
      ['2026.10.16', '배경음 정리', '화면마다 곡이 따로 흐릅니다. 본영은 ‘강의 흐름’, 모집 메뉴와 천하영토는 각각 전용 곡, 시나리오 · 대련 전투와 주간 레이드도 각자의 곡을 씁니다. 전투에서 이기면 전투 곡이 꺼지고 원래 화면의 곡으로 돌아갑니다(공성 뒤에는 천하영토 곡).', '완료', 'jade'],
      ['2026.10.16', '효과음 정리', '버튼 · 스킬 효과음을 새 녹음으로 바꾸고, 승리 때 병사 함성, 전투 처음 3초 말발굽, 전투 초반 말 울음 한 번을 넣었습니다. 맞을 때 나던 소리와 큰북 · 징 · 뿔나팔 · 합성 함성은 뺐습니다. 무장 모집은 대박 획득 효과음만 들리고(그동안 다른 소리는 꺼짐), 뽑기 연출의 기 모으기 · 균열 · 징 · 팡파르 소리는 없앴습니다.', '완료', 'jade'],
      ['2026.10.16', '시나리오 어려움 단계', '보통으로 깬 시나리오 58개를 적 Lv+10 · 별 +1과 특수 규칙 하나(철벽 · 속전 · 짙은 안개 · 화공 금지)로 다시 도전합니다. 앞 단계를 깨야 다음이 열리고 별 기록은 따로 남습니다. 첫 클리어 보상은 옥패 1.5배 · 은전과 병서 절반 · 자원입니다(금화 없음).', '완료', 'jade'],
      ['2026.10.16', '자동 전투', '유저 대련을 뺀 모든 전투에서 ‘자동’을 켤 수 있고, 켜 두면 다음 전투에도 유지됩니다. 직접 하는 것보다 약합니다(예고 대응 정확도 70% · 스킬은 한 박자 늦게). 수호 · 치유형 스킬도 준비되고 4초쯤 지나면 씁니다.', '완료', 'jade'],
      ['2026.10.16', '운영자 계정 · 관리자 편집', '관리자 권한 계정은 천하 랭킹 · 레이드 순위 · 도시 피해 순위 · 영토전 · 대련 상대에서 빠집니다. 관리자 화면에서 계정별로 재화 · 신화 재료 · 전적 · 자원 · 진영을 고칠 수 있고, 바꾼 칸만 저장되며 접속 중인 게임에도 반영됩니다.', '완료', 'jade'],
      ['2026.10.16', '전투 화면 · 최적화', '한 레인에 명령하면 다른 레인 부대가 그쪽으로 몸을 틉니다. 피해 숫자는 큰 타격에만 띄우고, 전장 배경을 실사풍으로, 기병 병사에게 장도를 쥐여 주었습니다. 다리 떨림과 레이드 2 · 3군 무장 표시를 고쳤고, 3D 모델을 압축해 내려받는 용량을 약 24MB에서 8MB로 줄였습니다. 전투 규칙에 강화 · 약화 효과 설명을 더했습니다.', '완료', 'jade'],
      ['2026.10.15', '무장 · 밸런스', '무장 최고 레벨을 Lv.60으로 정했습니다. 동탁 · 손권 · 조조는 전열을 맡는 수호형, 조운은 통솔형이 되었고, 황개는 주유 · 육손과 짝을 이루는 적벽 탱커가 되었습니다. 이에 맞춰 시나리오 난이도를 다시 맞췄습니다.', '완료', 'jade'],
      ['2026.10.15', '전투 연출', '병사 부대가 무장 뒤에서 함께 싸우고, 선두 무장은 모두 말을 탑니다. 천명 무장은 전용 연출과 실사풍 모습을 갖췄고, 실사 모델에 뼈대 애니메이션을 넣었습니다. 창병 두 손 찌르기, 책사 화염구, 적군 피격 모션을 더하고 맞을 때 떨림과 스킬 때 카메라 확대를 없앴습니다.', '완료', 'jade'],
      ['2026.10.15', '천하영토 · 편성 · 모바일', '천하영토 지도를 4배 해상도로 바꾸고, 칼 표시를 없애고, 건녕–교지 전선을 잇고 신도 위치를 옮겼습니다. 2 · 3군 편성 화면을 1군과 같게 바꾸고, 휴대폰에서 한글 줄바꿈과 부대 배치를 다듬었습니다.', '완료', 'jade'],
      ['2026.10.14', '1 · 2 · 3군 · 주간 레이드', '출전 편성에 1 · 2 · 3군이 생기고, 보유 무장에서 군별로 볼 수 있습니다. 주간 레이드는 세 군이 차례로 보스와 싸워 피해 합계로 순위를 겨룹니다.', '완료', 'jade'],
      ['2026.10.14', '유저 대련', '덱을 저장한 지휘관이 20명 이상이면 전력이 비슷한 실제 유저 덱과 겨룹니다. 스킬 자동 버튼과 난이도별 보상이 생겼고, 신화장비 1개에 필요한 조각은 100개로 바뀌었습니다.', '완료', 'jade'],
      ['2026.10.14', '진형 · 성장 개편', '가운데 자리가 전열이 되고, 무장 유형에 맞는 능력치가 크게 자랍니다. 통솔형 강화, 속도 · 장비 세트 개편, 무장별 추천 덱, 등급 재설정을 했습니다.', '완료', 'jade'],
      ['2026.10.14', '무장 카드 · 뽑기 연출', '무장 사진을 고해상도로 바꾸고 테두리를 등급색으로, 명장 · 천명 카드에 오라를 넣었습니다. 무장 모집 · 장비 뽑기에 연출이 생기고, 장비 뽑기 화면과 장비 보관함 필터를 정리했습니다.', '완료', 'jade'],
      ['2026.10.14', '화면 편의', '휴대폰 가로 화면, 모바일 아래쪽 잘림, 버튼을 눌러도 화면이 튀지 않게 고쳤습니다. 시나리오는 단계별로 진행하고, 로그인 화면 그림을 넣었으며 고레벨 전투 끊김을 고쳤습니다.', '완료', 'jade'],
      ['2026.10.13', '튜토리얼 · 영문판', '처음 들어오면 튜토리얼이 시작되고(첫 전투는 쉽게), 본영에 시작 안내와 바뀐 점 안내가 생겼습니다. 게임 전체를 한국어 또는 영어로 볼 수 있고, 게스트 기록을 초기화할 수 있습니다.', '완료', 'jade'],
      ['2026.10.13', '재화 · 상점 · 임무', '시나리오 보상을 금화 중심으로 바꾸고 금화로 병서를 살 수 있습니다. 명망을 옥패로 이름을 바꾸고 재화 그림을 넣었으며 상점을 개편했습니다. 금화 · 신화 조각 · 낙양 강화석은 서버가 관리하고, 일일 · 주간 임무가 생겼습니다.', '완료', 'jade'],
      ['2026.10.13', '화면 개편', '본영 · 보유 무장 · 무장 도감 · 출전 편성 화면을 새로 짜고, 모든 기기에서 같은 한글 글꼴로 보이게 했습니다. 예고를 잘 받으면 레벨 차를 뒤집을 수 있게 전투 밸런스를 다듬었습니다.', '완료', 'jade'],
      ['2026.10.12', '전투 · 스킬 개편', '적 사기를 무너뜨려 3막을 넘기면 이기는 전투(제한 90초)로 바꿨습니다. 무장 70명에게 고유 스킬 · 3성 패시브 · 5성 각성 · 인연을 주고 황건적 무장 5명이 합류했습니다. 전투 상단 바, 자동 편성 · 장착, 밸런스 테스트 페이지를 더했습니다.', '완료', 'jade'],
      ['2026.10.12', '실사 3D · 메뉴 · 연구', '실사 3D 모델과 전장, 병종별 공격 동작을 넣고 전투 화면을 전면 개편했습니다. 왼쪽 메뉴와 상단바를 새로 꾸미고, 기술 연구를 5분야 6단계로 다시 짰습니다.', '완료', 'jade'],
      ['2026.10.11', '영토 · 보상 조정', '도시 내정 수확과 시나리오 첫 클리어 보상(금화 제외)을 10배로 올리고, 재전투 중복 보상을 막았습니다. 세력전 점령 동기화와 방어도 규칙을 고치고, 상단바에 재화를 실시간으로 보여 줍니다.', '완료', 'jade'],
      ['2026.10.07', '장비 · 상점 · 표기', '신화 장비 특기와 장비 그림을 넣고 상점을 하나로 합쳤습니다. 무장 스킬 설명을 자세히 하고, 화면의 한자 표기를 한글로 바꿨습니다. 유저 대련은 실제 저장 덱과 겨루고, 천하영토의 25개 성을 모두 표시합니다.', '완료', 'jade'],
      ['2026.10.06', '첫 기반', '장비 관리(뽑기 · 장착 · 강화 · 세트 효과)와 신화 상점, 전투 연출, 로그인 화면, 관리자 센터 접근 제한을 갖췄습니다.', '완료', 'jade'],
    ] as const
    const completedLatestFirst = [...completed].sort((left, right) => right[0].localeCompare(left[0]))
    const completedMarkup = completedLatestFirst.map(([date, title, detail, status, tone]) => `<article class="update-entry"><time>${date}</time><span class="update-mark update-mark--${tone}"></span><div class="update-entry-copy"><div><h3>${title}</h3><span class="update-status update-status--${tone}">${status}</span></div><p>${detail}</p></div></article>`).join('')
    return `<section class="page-section page-section--updates"><div class="section-heading section-heading--compact"><div><span class="eyebrow">소통</span><h1>업데이트 기록</h1><p class="heading-copy">지금까지 반영된 변경사항을 주제별로 요약했습니다.</p></div><div class="updates-summary glass-card"><span>요약 항목</span><strong>${completed.length}<small>건</small></strong><em>최신 적용순</em></div></div><div class="updates-layout updates-layout--single"><div class="glass-card updates-panel"><div class="card-header"><div><span class="eyebrow">배포된 업데이트</span><h2>적용된 업데이트</h2></div><span class="sync-label">최신순</span></div><div class="update-list">${completedMarkup}</div></div></div><div class="updates-footnote"><span class="status-dot"></span><span>적용된 업데이트는 최신 날짜순으로 표시됩니다.</span><span class="muted">현재 버전 · 2026.10</span></div></section>`
  }

  private rankSection(state: StrategyState): string {
    const loggedIn = this.auth.status === 'authenticated'
    const me = this.ranks.find(entry => entry.displayName === this.auth.name)
    return `<section class="page-section page-section--rank"><div class="section-heading section-heading--compact"><div><span class="eyebrow">전투</span><h1>천하 랭킹</h1><p class="heading-copy">전투에서 얻은 전적 점수로 순위를 다툽니다.</p>${this.operatorNote('전적이 순위표에 기록되지 않습니다.')}</div><button class="ghost-button" data-action="rank-refresh">순위 새로고침 ↻</button></div><div class="rank-layout"><div class="glass-card rank-hero"><div class="rank-hero-bg">★</div><span class="pill pill--jade">이번 시즌 전적</span><h2>나의 기록</h2><p>전투에서 이길수록, 높은 별로 이길수록 점수가 오릅니다.<br>로그인하면 순위표에 이름이 올라갑니다.</p><div class="my-record"><span>나의 전적 점수</span><strong>${state.battleScore ? formatNumber(state.battleScore) : '기록 없음'}</strong><small>${state.wins}승${me ? ` · 현재 ${me.rank}위` : loggedIn ? ' · 순위표 밖' : ''}</small></div><div class="auth-status" data-auth-status>${loggedIn ? '로그인 중 · 전적이 순위표에 기록됩니다.' : '로그인하면 순위표에 이름을 올릴 수 있습니다.'}</div></div><div class="glass-card rank-table"><div class="card-header"><div><span class="eyebrow">순위표</span><h3>상위 지휘관</h3></div><span class="sync-label">${this.ranks.length ? `${this.ranks.length}명` : ''}</span></div><div data-rank-list>${this.rankRows()}</div><div class="rank-footnote">* 순위는 들어올 때와 새로고침할 때 서버에서 받아 옵니다.</div></div></div></section>`
  }

  private boardSection(state: StrategyState): string {
    const tabs: BoardPost['board'][] = ['전체', state.faction]
    const posts = this.boardPosts.filter(post => post.board === this.boardTab)
    const formatDate = (value: string | Date) => new Intl.DateTimeFormat(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
    return `<section class="page-section page-section--board"><div class="section-heading section-heading--compact"><div><span class="eyebrow">소통</span><h1>진영 게시판</h1><p class="heading-copy">전체 지휘관과 ${escapeHtml(state.faction)} 진영 동료에게 작전 소식을 전하십시오.</p></div><button class="ghost-button" data-action="board-refresh">게시글 새로고침 ↻</button></div><div class="board-tabs">${tabs.map(tab => `<button class="filter-tab ${this.boardTab === tab ? 'is-active' : ''}" data-action="board-tab" data-board="${tab}">${tab} 게시판</button>`).join('')}</div><div class="board-layout"><div class="glass-card board-list"><div class="card-header"><div><span class="eyebrow">${this.boardTab} 게시판</span><h2>최근 게시글</h2></div><span class="sync-label">최대 100건</span></div>${posts.length ? posts.map(post => `<article class="board-post"><div class="board-post__meta"><span class="pill pill--jade">${escapeHtml(post.authorFaction)}</span><strong>${ugc(post.authorName)}</strong><time>${formatDate(post.createdAt)}</time></div><h3>${ugc(post.title)}</h3><p>${ugc(post.content).replace(/\n/g, '<br>')}</p>${post.canDelete ? `<form class="board-delete-form" data-board-delete-form><input type="hidden" name="postId" value="${post.id}"><input name="password" type="password" minlength="4" maxlength="64" placeholder="삭제 비밀번호" required><button class="text-button" type="submit">내 글 삭제</button></form>` : ''}</article>`).join('') : '<div class="board-empty">아직 게시글이 없습니다.<br><small>오른쪽 ‘새 글 쓰기’로 첫 소식을 남겨 보십시오.</small></div>'}</div><div class="glass-card board-compose ${this.boardComposeOpen ? 'is-open' : ''}"><div class="card-header"><div><span class="eyebrow">글쓰기</span><h2>새 글 작성</h2></div><button class="text-button board-compose-toggle" data-action="board-compose">${this.boardComposeOpen ? '접기' : '새 글 쓰기 ✎'}</button></div><form data-board-form><label>게시판<select name="board">${tabs.map(tab => `<option value="${tab}" ${this.boardTab === tab ? 'selected' : ''}>${tab} 게시판</option>`).join('')}</select></label><label>제목<input name="title" maxlength="120" placeholder="작전 제목을 입력하세요" required></label><label>내용<textarea name="content" rows="7" maxlength="4000" placeholder="진영에 전할 내용을 작성하세요" required></textarea></label><label>삭제 비밀번호<input name="password" type="password" minlength="4" maxlength="64" placeholder="4자 이상 · 삭제할 때 필요" required></label><button class="action-button action-button--primary" type="submit">게시글 올리기 <span>→</span></button></form><p class="board-note">삭제 비밀번호를 알아야만 글을 지울 수 있습니다.</p></div></div></section>`
  }
  private raidSection(state: StrategyState): string {
    const view = this.raidView
    const info = view.info
    const weekKey = info?.weekKey ?? raidWeekKey()
    const boss = raidBossFor(weekKey)
    const level = info?.bossLevel ?? 30
    const bossDeck = raidBossDeck(level, weekKey)
    const squads = [0, 1, 2].map(index => ({ index, ids: squadIds(state, index), power: squadPower(state, index) }))
    const ready = squads.filter(squad => squad.ids.length)
    const days = info ? Math.floor(info.resetIn / 86400000) : 0, hours = info ? Math.floor(info.resetIn / 3600000) % 24 : 0
    const left = info?.attemptsLeft ?? 0
    const fmt = (n: number) => formatNumber(Math.round(n))
    const bossCards = bossDeck.map((general, lane) => `<div class="raid-boss__unit" style="--accent:${gradeColor(general)}">${this.portrait(general, 'raid-boss__portrait')}<span>${['좌측', '중앙 · 전열', '우측'][lane]}</span><strong>${escapeHtml(general.name)}</strong><small>Lv.${general.level} · ${'★'.repeat(general.stars)}</small></div>`).join('')
    const squadRows = squads.map(squad => `<li class="${squad.ids.length ? '' : 'is-empty'}"><b>${SQUAD_LABELS[squad.index]}</b><span>${squad.ids.length ? squad.ids.map(id => escapeHtml(state.generals.find(general => general.id === id)?.name ?? '')).join(' · ') : '비어 있음 · 건너뜀'}</span><em>${squad.ids.length ? fmt(squad.power) : '-'}</em></li>`).join('')
    const rewardRows = RAID_REWARDS.map(row => `<tr class="${info && !info.offline && info.rank && info.rank >= row.from && info.rank <= row.to ? 'is-me' : ''}"><td>${row.from === row.to ? `${row.from}위` : row.to === Infinity ? `${row.from}위~` : `${row.from}~${row.to}위`}</td><td>금화 ${row.gold}</td><td>${row.stones ? `낙양 강화석 ${row.stones}` : '-'}</td></tr>`).join('')
    const ranking = info?.offline ? '<div class="rank-empty">연습 모드에서는 순위가 기록되지 않습니다.</div>' : view.ranking.length ? `<ol class="raid-ranking">${view.ranking.map(row => `<li class="${row.isMe ? 'is-me' : ''}"><b>${row.rank}</b><span>${ugc(row.displayName)}</span><em>${fmt(row.totalDamage)}</em><small>${row.attempts}회</small></li>`).join('')}</ol>` : '<div class="rank-empty">이번 주 기록이 아직 없습니다. 첫 기록의 주인공이 되십시오.</div>'
    const last = info?.lastWeek
    const claim = last ? `<div class="raid-claim glass-card"><div><span class="eyebrow">지난주 결과</span><strong>${last.rank}위 · 피해 ${fmt(last.totalDamage)}</strong><small>보상 · 금화 ${last.reward.gold}${last.reward.stones ? ` · 낙양 강화석 ${last.reward.stones}` : ''}</small></div><button class="action-button action-button--primary" data-action="raid-claim" ${last.claimed ? 'disabled' : ''}>${last.claimed ? '받음' : '보상 받기'}</button></div>` : ''
    return `<section class="page-section page-section--raid"><div class="section-heading section-heading--compact"><div><span class="eyebrow">전투</span><h1>주간 레이드</h1><p class="heading-copy">끝없는 병력의 보스에게 1군 → 2군 → 3군이 차례로 90초씩 맞서 준 피해의 합계로 순위를 겨룹니다. 매주 월요일 0시 초기화 · 하루 ${info?.dailyLimit ?? 3}회.</p>${this.operatorNote('레이드 순위와 순위 보상에서 빠집니다.')}</div><button class="ghost-button" data-action="raid-refresh">새로고침 ↻</button></div>
      ${view.message ? `<p class="raid-message">${escapeHtml(view.message)}</p>` : ''}${claim}
      <div class="raid-layout"><div class="raid-main">
        <div class="raid-boss glass-card"><div class="raid-boss__head"><div><span class="pill pill--ember">이번 주 보스 · 무한 병력</span><h2>${escapeHtml(boss.name)}</h2><p>${escapeHtml(boss.desc)} · 보스 Lv.${level}${info && !info.offline ? (info.registered > 20 ? ` (상위 지휘관 평균)` : ' (기본 레벨)') : ''}</p></div><div class="raid-boss__reset"><small>초기화까지</small><strong>${days}일 ${hours}시간</strong></div></div><div class="raid-boss__units">${bossCards}</div><p class="raid-boss__note">보스의 병력은 줄지 않습니다. 3막 사기를 무너뜨릴 때마다 큰 피해 보너스가 붙고 보스가 사기를 다시 세웁니다. 아군이 전멸하거나 전열이 두 번 무너지면 그 군의 전투가 끝납니다.</p></div>
        <div class="raid-start glass-card"><div><span class="eyebrow">출전 군</span><ul class="raid-squads">${squadRows}</ul><button class="text-button" data-action="section" data-section="formation">2군·3군 편성하기 →</button></div><div class="raid-start__cta"><strong>오늘 남은 도전 ${left}/${info?.dailyLimit ?? 3}</strong><small>도전을 시작하면 1회가 차감됩니다</small><button class="action-button action-button--primary raid-go" data-action="raid-start" ${left > 0 && ready.length && !view.loading ? '' : 'disabled'}>${ready.length}개 군 출전 <span>⚔</span></button></div></div>
        <div class="raid-me glass-card"><div><small>이번 주 누적 피해</small><strong>${fmt(info?.totalDamage ?? 0)}</strong></div><div><small>${info?.offline ? '연습 최고 기록' : '1회 최고'}</small><strong>${fmt(info?.bestDamage ?? 0)}</strong></div><div><small>내 순위</small><strong>${info?.offline ? '-' : info?.rank ? `${info.rank}위` : '기록 없음'}</strong></div><div><small>참여 지휘관</small><strong>${info?.offline ? '-' : fmt(info?.participants ?? 0)}</strong></div></div>
      </div><div class="raid-side">
        <div class="glass-card raid-rewards"><div class="card-header"><div><span class="eyebrow">주간 보상</span><h3>순위 보상</h3></div><span class="rate-note">월요일 0시 정산 · 다음 주에 받기</span></div><table><tbody>${rewardRows}</tbody></table></div>
        <div class="glass-card"><div class="card-header"><div><span class="eyebrow">이번 주</span><h3>누적 피해 순위</h3></div><span class="rate-note">상위 100명</span></div>${view.loading ? '<div class="rank-empty">불러오는 중…</div>' : ranking}</div>
      </div></div></section>`
  }

  private duelSection(state: StrategyState): string {
    const formationReady = state.formation.length >= 3
    const opponents = this.duelOpponents
    return `<section class="page-section page-section--duel"><div class="section-heading section-heading--compact"><div><span class="eyebrow">전투</span><h1>유저 대련</h1><p class="heading-copy">다른 지휘관의 전력을 분석하고, 선택한 상대의 덱과 실시간으로 겨루십시오.</p></div><button class="ghost-button" data-action="duel-refresh">상대 새로고침 ↻</button></div><div class="duel-hero glass-card"><div><span class="pill pill--jade">실시간 대련 · ${formationReady ? '출전 준비 완료' : '편성 필요'}</span><h2>상대 덱을 선택하십시오</h2><p>${opponents.some(opponent => !opponent.isDummy) ? '내 덱 전력과 비슷한 지휘관이 저장한 출전 덱과 겨룹니다.' : '덱을 저장한 지휘관이 20명이 될 때까지는 내 덱 전력에 맞춘 훈련 상대와 겨룹니다.'}${this.duelMyPower ? ` <b>내 덱 전력 ${formatNumber(this.duelMyPower)}</b>` : ''}</p><div class="duel-daily-limit"><strong>오늘 남은 대련 ${duelAttemptsRemaining(state)}회</strong><span>매일 5회 · 승리 시 신화장비 조각 쉬움 +1 · 보통 +2 · 어려움 +3 (신화장비 1개 = 조각 ${MYTHIC_FRAGMENT_COST}개)</span></div></div><div class="duel-hero-mark">⚔</div></div><div class="duel-list">${opponents.length ? '' : '<div class="rank-empty">상대를 찾는 중입니다…</div>'}${opponents.map((opponent, index) => `<article class="duel-opponent glass-card ${opponent.isDummy ? 'is-dummy' : ''}"><div class="duel-rank">${String(index + 1).padStart(2, '0')}</div><div class="duel-avatar">${escapeHtml(opponent.displayName.slice(0, 1))}</div><div class="duel-opponent-copy"><strong>${ugc(opponent.displayName)}</strong><span>${opponent.isDummy ? `훈련 상대 · ${escapeHtml(opponent.note ?? '')}` : `지휘관 · 전력 ${formatNumber(opponent.power ?? 0)}${this.duelMyPower && opponent.power ? ` (내 덱 대비 ${opponent.power >= this.duelMyPower ? '+' : '−'}${Math.round(Math.abs(opponent.power / this.duelMyPower - 1) * 100)}%)` : ''} · 전적 점수 ${formatNumber(opponent.score)}`}</span></div><span class="duel-reward duel-reward--${opponent.tier ?? 'normal'}">${{ easy: '쉬움', normal: '보통', hard: '어려움' }[opponent.tier ?? 'normal']} · 조각 +${{ easy: 1, normal: 2, hard: 3 }[opponent.tier ?? 'normal']}</span><button class="action-button action-button--primary" data-action="duel-start" data-opponent-id="${escapeHtml(opponent.id)}">대련 신청 <span>→</span></button></article>`).join('')}</div></section>`
  }

  private rankRows(): string {
    const rows = this.ranks
    if (!rows.length) return '<div class="rank-empty">아직 순위 기록이 없습니다.<br><small>로그인한 지휘관이 전투를 치르면 이곳에 순위가 표시됩니다.</small></div>'
    return rows.map(entry => `<div class="rank-row"><span class="rank-number rank-number--${entry.rank}">${entry.rank.toString().padStart(2, '0')}</span><span class="rank-avatar">${entry.displayName.slice(0, 1)}</span><strong>${entry.displayName}</strong><span class="rank-score">${formatNumber(entry.score)}</span></div>`).join('')
  }

  private miniGeneral(general: General): string {
    return `<div class="mini-general">${this.portrait(general)}<div><strong>${general.name}</strong><small>Lv.${general.level} · ${general.role}</small></div><b>${general.stars}★</b></div>`
  }

  /** 누를 때 소리: 메뉴·탭은 현 한 번, 그 밖은 나무 딱. 뽑기는 연출이 따로 소리를 낸다 */
  private clickSound(action: string | undefined, button: HTMLElement): void {
    if (!action || button.hasAttribute('disabled')) return
    if (['recruit', 'equipment-draw', 'extra-equipment-draw', 'reroll-recruit', 'sound-toggle'].includes(action)) return
    const tab = action === 'section' || action === 'nav-more' || action === 'roster-jump' || action === 'scenario-select' || /-(tab|filter)$/.test(action)
    sound.play(tab ? 'tab' : 'click')
  }

  private handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement
    const button = target.closest<HTMLElement>('[data-action]')
    // ‘더보기’를 펼친 채 다른 곳을 누르면 닫는다
    const openMore = this.root.querySelector('.sidebar.is-more-open')
    if (openMore && !target.closest('.sidebar')) openMore.classList.remove('is-more-open')
    if (!button) return
    const action = button.dataset.action
    this.clickSound(action, button)
    if (button.dataset.opponentId) {
      this.callbacks.onDuelStart(button.dataset.opponentId)
      return
    }
    if (action === 'scroll-missions') {
      // 같은 화면(본영)의 임무 칸으로 내려가 받을 수 있는 보상을 깜빡여 보여 준다
      const card = this.root.querySelector<HTMLElement>('.mission-card')
      card?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      card?.querySelectorAll<HTMLElement>('[data-action="mission-claim"]:not([disabled])').forEach(item => { item.classList.remove('is-flash'); void item.offsetWidth; item.classList.add('is-flash') })
      return
    }
    if (action === 'nav-more') { this.root.querySelector('.sidebar')?.classList.toggle('is-more-open'); return }
    if (action === 'section') { this.root.querySelector('.sidebar')?.classList.remove('is-more-open') }
    if (action === 'section') { if (button.dataset.scenarioId) { this.scenarioSelectedId = button.dataset.scenarioId; this.scenarioPicked = true; this.scenarioDifficulty = 'normal' } this.callbacks.onSection((button.dataset.section ?? 'overview') as Section) }
    else if (action === 'summon-tab') {
      this.summonTab = button.dataset.summonTab === 'equipment' ? 'equipment' : 'generals'
      if (this.renderedState) this.render(this.renderedState)
    }
    else if (action === 'recruit') this.callbacks.onRecruit(Number(button.dataset.count ?? 1))
    else if (action === 'upgrade') this.callbacks.onUpgrade(button.dataset.id ?? '')
    else if (action === 'skill') this.callbacks.onSkill(button.dataset.id ?? '')
    else if (action === 'formation') {
      const id = button.dataset.id ?? ''
      const state = this.renderedState
      // 3명이 모두 출전 중이면 누구와 바꿀지 고르게 한다
      if (state && !state.formation.includes(id) && state.formation.length >= 3) this.openSlotPicker(state, id)
      else this.callbacks.onFormation(id)
    }
    else if (action === 'upgrade-many') this.callbacks.onUpgradeMany(button.dataset.id ?? '')
    else if (action === 'level-reset') {
      const general = this.renderedState?.generals.find(item => item.id === button.dataset.id)
      if (!general || !this.renderedState) return
      const refund = levelResetRefund(this.renderedState, general)
      if (window.confirm(tr(`${general.name}을(를) Lv.${general.level}에서 Lv.1로 되돌립니다.\n금화 ${LEVEL_RESET_GOLD}개를 쓰고 은전 ${formatNumber(refund.silver)} · 병서 ${formatNumber(refund.manuals)}(레벨에 쓴 재화의 80%)를 돌려받습니다.\n성급 · 장비 · 스킬 해금은 그대로입니다. 계속하시겠습니까?`))) this.callbacks.onLevelReset(general.id)
    }
    else if (action === 'equipment-more') this.equipmentMoreOpen = !(button.closest('details') as HTMLDetailsElement | null)?.open
    else if (action === 'equipment-filter-more') this.equipmentFilterOpen = !(button.closest('details') as HTMLDetailsElement | null)?.open
    else if (action === 'equipment-type-tab') {
      this.equipmentFilter.type = button.dataset.type ?? 'all'
      this.equipmentScrollTop = 0
      if (this.renderedState) this.render(this.renderedState)
    }
    else if (action === 'equip-general') { this.callbacks.onEquipmentSelectGeneral(button.dataset.id ?? ''); this.callbacks.onSection('equipment') }
    else if (action === 'board-compose') { this.boardComposeOpen = !this.boardComposeOpen; if (this.renderedState) this.render(this.renderedState) }
    else if (action === 'codex-filter') { this.codexFilter = (button.dataset.filter ?? 'all') as typeof this.codexFilter; if (this.renderedState) this.render(this.renderedState); this.applyCodexSearch() }
    else if (action === 'roster-filter') { this.rosterFilter = (button.dataset.filter ?? 'all') as typeof this.rosterFilter; if (this.renderedState) this.render(this.renderedState) }
    else if (action === 'auto-formation') this.callbacks.onAutoFormation(button.dataset.withEquipment === '1')
    else if (action === 'auto-equip') this.callbacks.onAutoEquip()
    else if (action === 'equipment-draw') this.callbacks.onEquipmentDraw(Number(button.dataset.count ?? 1))
    else if (action === 'equipment-enhance') this.callbacks.onEquipmentEnhance(button.dataset.equipmentId ?? '')
    else if (action === 'equipment-equip') this.callbacks.onEquipmentEquip(button.dataset.generalId ?? '', button.dataset.equipmentId ?? '')
    else if (action === 'equipment-unequip') this.callbacks.onEquipmentUnequip(button.dataset.generalId ?? '', (button.dataset.equipmentType ?? 'weapon') as EquipmentType)
    else if (action === 'equipment-lock') this.callbacks.onEquipmentLock(button.dataset.equipmentId ?? '')
    else if (action === 'raid-start') this.callbacks.onRaidStart()
    else if (action === 'raid-refresh') this.callbacks.onRaidRefresh()
    else if (action === 'raid-claim') this.callbacks.onRaidClaim()
    else if (action === 'roster-jump') this.root.querySelector(`#roster-squad-${button.dataset.squad ?? '0'}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else if (action === 'squad-tab') { this.formationSquad = Math.max(0, Math.min(2, Number(button.dataset.squad ?? 0))); if (this.renderedState) this.render(this.renderedState) }
    else if (action === 'squad-toggle') this.callbacks.onSquadToggle(Number(button.dataset.squad ?? 1), button.dataset.id ?? '')
    else if (action === 'squad-auto') this.callbacks.onSquadAuto(Number(button.dataset.squad ?? 1), button.dataset.withEquipment === '1')
    else if (action === 'squad-equip') this.callbacks.onSquadEquip(Number(button.dataset.squad ?? 1))
    else if (action === 'squad-swap') this.callbacks.onSquadSwap(Number(button.dataset.squad ?? 1))
    else if (action === 'equipment-preset') this.callbacks.onEquipmentPreset(button.dataset.generalId ?? '', Number(button.dataset.slot ?? 0), button.dataset.mode === 'save' ? 'save' : 'apply')
    else if (action === 'equipment-dismantle') {
      const state = this.renderedState
      const item = state?.equipmentInventory.find(candidate => candidate.id === button.dataset.equipmentId)
      if (state && item) {
        const free = dismantlableCount(state, item)
        const gain = dismantleYield(item)
        const count = free
        this.confirmPurchase(`${EQUIPMENT_GRADE_META[item.grade].label} ${item.name}${count > 1 ? ` ${count}개` : ''} 분해`, `옥패 +${formatNumber(gain.honor * count)} · 철 +${formatNumber(gain.iron * count)}${gain.silver ? ` · 은전 +${formatNumber(gain.silver * count)}` : ''}${item.level > 1 ? ` · 강화 Lv.${item.level} (강화 비용의 50% 환급)` : ''} · 되돌릴 수 없습니다`, () => this.callbacks.onEquipmentDismantle(item.id, count), { eyebrow: '분해 확인', ok: '분해' })
      }
    }
    else if (action === 'equipment-bulk-dismantle') {
      const state = this.renderedState
      const grade = (button.dataset.grade === 'rare' ? 'rare' : 'normal') as 'normal' | 'rare'
      if (state) {
        const preview = bulkDismantlePreview(state, grade)
        this.confirmPurchase(`${EQUIPMENT_GRADE_META[grade].label}${grade === 'normal' ? '' : ' 이하'} 장비 ${formatNumber(preview.count)}개 일괄 분해`, `옥패 +${formatNumber(preview.honor)} · 철 +${formatNumber(preview.iron)} · 잠금·장착·강화한 장비는 남깁니다 · 되돌릴 수 없습니다`, () => this.callbacks.onEquipmentBulkDismantle(grade), { eyebrow: '분해 확인', ok: '일괄 분해' })
      }
    }
    else if (action === 'roster-sort') {
      this.rosterSort = (button as HTMLSelectElement).value as RosterSort
      if (this.renderedState) this.render(this.renderedState)
    } else if (action === 'roster-sort-direction') {
      this.rosterSortDescending = !this.rosterSortDescending
      if (this.renderedState) this.render(this.renderedState)
    } else if (action === 'combo-anchor') {
      this.comboAnchorId = button.dataset.id ?? null
      if (this.renderedState) this.render(this.renderedState)
    } else if (action === 'apply-combo') {
      this.callbacks.onApplyCombo((button.dataset.ids ?? '').split(',').filter(Boolean), Number(button.dataset.squad ?? 0))
    } else if (action === 'formation-sort-direction') {
      this.formationSortDescending = !this.formationSortDescending
      if (this.renderedState) this.render(this.renderedState)
    } else if (action === 'equipment-sort-direction') {
      this.equipmentSortDescending = !this.equipmentSortDescending
      if (this.renderedState) this.render(this.renderedState)
    }
    else if (action === 'city-select') {
      const cityId = button.dataset.city ?? ''
      this.citySheetOpen = true
      this.callbacks.onCitySelect(cityId)
      this.callbacks.onCityDamageRankingRefresh(cityId)
    }
    else if (action === 'city-find') {
      const id = button.dataset.city ?? ''
      this.citySheetOpen = true
      this.territoryMap.queueFocus(id)
      if (this.territoryMap.fullscreen) this.territoryMap.setFullscreen(false)
      this.callbacks.onCitySelect(id)
      this.callbacks.onCityDamageRankingRefresh(id)
      this.root.querySelector('[data-map-viewport]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    else if (action === 'city-filter') { this.cityFilter = (button.dataset.filter as CityFilter) || 'all'; this.applyCityFinder() }
    else if (action === 'city-sheet-close') {
      this.citySheetOpen = false
      this.root.querySelector('.page-section--territory')?.classList.remove('is-sheet-open')
    }
    else if (action === 'territory-refresh') this.callbacks.onTerritoryRefresh()
    else if (action === 'conquer') this.callbacks.onConquest(button.dataset.city ?? '')
    else if (action === 'defense') this.callbacks.onDefense(button.dataset.city ?? '')
    else if (action === 'garrison-deploy') this.callbacks.onGarrisonDeploy(button.dataset.city ?? '')
    else if (action === 'faction-battle') this.callbacks.onFactionBattle(button.dataset.city ?? '')
    else if (action === 'collect-income') this.callbacks.onCollectIncome()
    else if (action === 'building-upgrade') this.callbacks.onBuildingUpgrade(button.dataset.city ?? '', button.dataset.building ?? '')
    else if (action === 'building-rush') this.callbacks.onBuildingRush(button.dataset.city ?? '')
    else if (action === 'building-cancel') this.callbacks.onBuildingCancel(button.dataset.city ?? '')
    else if (action === 'research') this.callbacks.onResearch(button.dataset.research ?? '')
    else if (action === 'battle-guide') this.callbacks.onBattleGuide()
    else if (action === 'coach-reset') this.callbacks.onCoachReset()
    else if (action === 'stat-info') {
      const key = button.dataset.stat as keyof typeof STAT_INFO
      const info = STAT_INFO[key]
      const box = button.parentElement?.querySelector<HTMLElement>('[data-stat-info]')
      if (!info || !box) return
      const same = box.dataset.stat === key && !box.hidden
      button.parentElement?.querySelectorAll('[data-action="stat-info"]').forEach(row => row.classList.toggle('is-open', !same && row === button))
      box.hidden = same
      box.dataset.stat = key
      box.innerHTML = `<b>${escapeHtml(tr(info.title))}</b> ${escapeHtml(tr(info.body))}`
    }
    else if (action === 'effect-info') {
      const effect = BATTLE_EFFECTS[button.dataset.effect as BattleEffectId]
      const box = button.closest('.skill-fx')?.querySelector<HTMLElement>('[data-effect-info]')
      if (!effect || !box) return
      const same = box.dataset.effect === effect.id && !box.hidden
      button.closest('.skill-fx')?.querySelectorAll('.skill-fx-chip').forEach(chip => chip.classList.toggle('is-open', !same && chip === button))
      box.hidden = same
      box.dataset.effect = effect.id
      box.className = `skill-fx-info is-${effect.kind}`
      box.innerHTML = `<b>${effect.icon} ${escapeHtml(tr(effect.name))}</b> <span>${tr(effect.kind === 'buff' ? '버프 · 아군에게' : '디버프 · 적에게')} · ${button.dataset.sec ?? effect.duration}${tr('초')}${button.dataset.awaken ? ` · ${tr('5성 각성 시')}` : ''}</span><br>${escapeHtml(tr(effect.description))}`
    }
    else if (action === 'guest-reset') { if (window.confirm(tr(this.account ? '이 게스트 아이디의 진행 기록을 서버에서도 모두 지우고 처음부터 시작합니다. 되돌릴 수 없습니다. 계속하시겠습니까?' : '이 기기의 게스트 진행 기록을 모두 지우고 처음부터 시작합니다. 되돌릴 수 없습니다. 계속하시겠습니까?'))) this.callbacks.onGuestReset() }
    else if (action === 'set-lang') setLang(button.dataset.value === 'en' ? 'en' : 'ko')
    else if (action === 'setting-quality') { setQualitySetting((button.dataset.value ?? 'auto') as QualitySetting); this.notify('그래픽 품질을 바꿨습니다. 새로고침하면 적용됩니다.', 'jade'); if (this.renderedState) this.render(this.renderedState) }
    else if (action === 'setting-music') { setMusicSetting((button.dataset.value ?? 'mid') as SoundLevel); if (muteSetting()) setMuteSetting(false); sound.unlock(); sound.applyVolumes(); if (this.renderedState) this.render(this.renderedState) }
    else if (action === 'setting-sfx') { setSfxSetting((button.dataset.value ?? 'mid') as SoundLevel); if (muteSetting()) setMuteSetting(false); sound.unlock(); sound.applyVolumes(); sound.play('success'); if (this.renderedState) this.render(this.renderedState) }
    else if (action === 'sound-toggle') { setMuteSetting(!muteSetting()); sound.unlock(); sound.applyVolumes(); if (!muteSetting()) sound.play('tab'); if (this.renderedState) this.render(this.renderedState) }
    else if (action === 'setting-effects') { setEffectsSetting((button.dataset.value ?? 'auto') as EffectsSetting); this.callbacks.onEffectsSetting?.(); if (this.renderedState) this.render(this.renderedState) }
    else if (action === 'mission-claim') this.callbacks.onMissionClaim(button.dataset.mission ?? '')
    else if (action === 'tutorial-claim') this.callbacks.onTutorial(false)
    else if (action === 'tutorial-skip') this.callbacks.onTutorial(true)
    else if (action === 'research-cancel') this.callbacks.onResearchCancel()
    else if (action === 'research-rush') this.callbacks.onResearchRush()
    else if (action === 'scenario-select') { if (!button.dataset.scenarioId) return; this.scenarioSelectedId = button.dataset.scenarioId; this.scenarioPicked = true; if (this.renderedState) this.render(this.renderedState); this.root.querySelector('.scenario-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
    else if (action === 'scenario-list-toggle') { event.preventDefault(); this.scenarioListOpen = !this.scenarioListOpen; if (this.renderedState) this.render(this.renderedState) }
    else if (action === 'scenario-start') this.callbacks.onScenarioStart(button.dataset.scenarioId ?? '', button.dataset.difficulty === 'hard' ? 'hard' : 'normal')
    else if (action === 'scenario-difficulty') { this.scenarioDifficulty = button.dataset.difficulty === 'hard' ? 'hard' : 'normal'; this.scenarioPicked = false; this.scenarioSelectedId = ''; if (this.renderedState) this.render(this.renderedState) }
    else if (action === 'battle-start') this.callbacks.onBattleStart()
    else if (action === 'battle-unit' || action === 'move') { if (Date.now() >= this.suppressMoveUntil) this.callbacks.onBattleMove(Number(button.dataset.index ?? 0)) }
    else if (action === 'battle-skill') this.callbacks.onBattleSkill(button.dataset.index === undefined ? undefined : Number(button.dataset.index))
    else if (action === 'battle-speed') this.callbacks.onBattleSpeed((this.latestBattle?.speed ?? 1) >= 2 ? 1 : 2)
    else if (action === 'battle-pause') this.callbacks.onBattlePause(!this.latestBattle?.paused)
    else if (action === 'battle-stop') {
      // 실수로 누르는 것을 막기 위해 3초 안에 한 번 더 눌러야 중지한다.
      if (Date.now() < this.stopConfirmUntil) { this.stopConfirmUntil = 0; this.callbacks.onBattleStop() }
      else { this.stopConfirmUntil = Date.now() + 3000; button.textContent = '한 번 더 누르면 중지'; button.classList.add('is-confirm'); window.setTimeout(() => { button.classList.remove('is-confirm'); if (Date.now() >= this.stopConfirmUntil) button.textContent = '■ 전투 중지' }, 3050) }
    }
    else if (action === 'battle-auto') this.callbacks.onBattleAuto(!this.latestBattle?.autoPlay)
    else if (action === 'battle-auto-skill') this.callbacks.onBattleAutoSkill(!this.latestBattle?.autoSkill)
    else if (action === 'battle-log') { this.battleLogOpen = !this.battleLogOpen; button.textContent = this.battleLogOpen ? '접기' : '전체 기록'; const log = this.root.querySelector<HTMLElement>('[data-bt-log]'); if (log) log.dataset.html = ''; if (this.latestBattle) this.updateBattle(this.latestBattle) }
    else if (action === 'battle-tactic') this.callbacks.onBattleTactic((button.dataset.tactic ?? 'guard') as 'guard' | 'feint' | 'charge')
    else if (action === 'duel-refresh') this.callbacks.onDuelRefresh()
    else if (action === 'duel-start') this.callbacks.onDuelStart(button.dataset.opponentId ?? '')
    else if (action === 'faction-select' && (button.dataset.faction === '촉한' || button.dataset.faction === '위나라' || button.dataset.faction === '오나라')) this.callbacks.onFactionSelect(button.dataset.faction)
    else if (action === 'guest-login') this.callbacks.onGuestLogin()
    else if (action === 'login') this.callbacks.onLogin()
    else if (action === 'logout') this.callbacks.onLogout()
    else if (action === 'account-refresh') this.callbacks.onAccountRefresh()
    else if (action === 'rank-refresh') this.callbacks.onRankRefresh()
    else if (action === 'board-refresh') this.callbacks.onBoardRefresh((button.dataset.board ?? this.boardTab) as BoardPost['board'])
    else if (action === 'board-tab') this.callbacks.onBoardRefresh((button.dataset.board ?? '전체') as BoardPost['board'])
    else if (action === 'store') this.callbacks.onStore()
    else if (action === 'shop-purchase') {
      const id = button.dataset.equipmentId ?? 'shop-mythic-martial-weapon'
      const remain = (this.renderedState?.mythicFragments ?? 0) - MYTHIC_FRAGMENT_COST
      this.confirmPurchase(`${button.dataset.label ?? '신화장비'} 교환`, `신화 조각 ${MYTHIC_FRAGMENT_COST}개를 씁니다 · 교환 후 ${Math.max(0, remain)}개 남음`, () => this.callbacks.onShopPurchase(id))
    }
    else if (action === 'cash-shop-purchase' || action === 'honor-shop-purchase') {
      const cost = Number(button.dataset.cost ?? 0)
      const buy = () => action === 'cash-shop-purchase' ? this.callbacks.onCashShopPurchase(button.dataset.productId ?? '') : this.callbacks.onHonorShopPurchase(button.dataset.packageId ?? '')
      if (cost >= 20) this.confirmPurchase(`금화 ${cost}개 → ${button.dataset.label ?? ''}`, `구매 후 금화 ${Math.max(0, (this.renderedState?.gold ?? 0) - cost)}개 남음`, buy)
      else buy()
    }
    else if (action === 'gold-purchase') this.callbacks.onGoldPurchase(button.dataset.packageId ?? '')
    else if (action === 'shop-tab') {
      this.shopTab = button.dataset.shopTab === 'mythic' ? 'mythic' : button.dataset.shopTab === 'resources' ? 'resources' : 'gold'
      if (this.renderedState) this.render(this.renderedState)
    }
    else if (action === 'admin-tab') {
      this.adminTab = button.dataset.adminTab ?? 'overview'
      this.callbacks.onAdminAction(`관리자 탭을 ‘${button.textContent?.trim() ?? '운영 개요'}’로 전환했습니다.`)
    } else if (action === 'admin-filter') {
      this.adminFilter = button.dataset.adminFilter ?? 'all'
      this.callbacks.onAdminAction('장수 콘텐츠 필터를 적용했습니다.')
    } else if (action === 'admin-toggle-publish') {
      this.adminPublished = !this.adminPublished
      this.callbacks.onAdminAction(this.adminPublished ? '시즌 01 게시를 재개했습니다. (로컬 미리보기)' : '시즌 01을 비공개 상태로 전환했습니다. (로컬 미리보기)')
    } else if (action === 'admin-announce') {
      this.callbacks.onAdminAction('운영 공지 미리보기를 표시했습니다.')
    } else if (action === 'admin-refresh') {
      this.callbacks.onAdminAction('서비스 상태를 새로고침했습니다.')
    } else if (action === 'admin-accounts-refresh') {
      this.callbacks.onAdminAccountsRefresh(this.adminAccountSearch)
    } else if (action === 'admin-account-search') {
      const input = this.root.querySelector<HTMLInputElement>('[data-admin-account-search]')
      this.adminAccountSearch = input?.value.trim() ?? ''
      this.callbacks.onAdminAccountsRefresh(this.adminAccountSearch)
    } else if (action === 'admin-game-refresh') {
      this.callbacks.onAdminGameDataRefresh()
    } else if (action === 'admin-board-refresh') {
      this.callbacks.onAdminBoardRefresh()
    } else if (action === 'admin-board-posting') {
      this.callbacks.onAdminBoardPostingToggle(button.dataset.enabled === 'true')
    } else if (action === 'admin-board-delete') {
      const id = Number(button.dataset.postId ?? 0)
      if (id && window.confirm(tr('이 게시글을 관리자 권한으로 삭제하시겠습니까?'))) this.callbacks.onAdminBoardDelete(id)
    } else if (action === 'admin-game-search') {
      this.adminGameSearch = this.root.querySelector<HTMLInputElement>('[data-admin-game-search]')?.value.trim() ?? ''
      if (this.renderedState) this.render(this.renderedState)
    } else if (action === 'admin-game-reset') {
      button.closest<HTMLElement>('[data-game-user]')?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-game-field]').forEach(input => { input.value = input.dataset.original ?? input.value; input.classList.remove('is-changed') })
    } else if (action === 'admin-game-save') {
      const row = button.closest<HTMLElement>('[data-game-user]')
      const userId = Number(button.dataset.accountId)
      const edit: AdminGameEdit = { userId }
      let bad = ''
      row?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-game-field]').forEach(input => {
        const field = input.dataset.gameField ?? ''
        if (input.value === input.dataset.original) return
        if (field === 'faction') { edit.faction = input.value as AdminGameEdit['faction']; return }
        const value = Number(input.value)
        if (!Number.isInteger(value) || value < 0 || value > 2_000_000_000) { bad = input.closest('label')?.querySelector('span')?.textContent ?? field; return }
        ;(edit as unknown as Record<string, number>)[field] = value
      })
      if (bad) { this.notify(`${bad}: 0 이상 20억 이하의 정수만 저장할 수 있습니다.`, 'ember'); return }
      if (Object.keys(edit).length <= 1) { this.notify('바꾼 칸이 없습니다.'); return }
      if (Number.isInteger(userId) && userId > 0) this.callbacks.onAdminGameDataSave(edit)
    } else if (action === 'admin-role') {
      const id = Number(button.dataset.accountId)
      const role = button.dataset.accountRole === 'admin' ? 'admin' : 'user'
      if (Number.isInteger(id) && id > 0) this.callbacks.onAdminRoleChange(id, role)
    }
    else if (action === 'close-result') button.closest('.result-modal')?.remove()
    else if (action === 'close-recruit-results') button.closest('.recruit-results')?.remove()
    else if (action === 'reroll-recruit') {
      button.closest('.recruit-results')?.remove()
      this.callbacks.onRecruit(10)
    }
    else if (action === 'extra-equipment-draw') {
      button.closest('.recruit-results')?.remove()
      this.callbacks.onEquipmentDraw(Number(button.dataset.count ?? 1))
    }
  }
  private handleChange = (event: Event): void => {
    const select = event.target as HTMLSelectElement
    if (select.matches('[data-action="roster-sort"]')) {
      this.rosterSort = select.value as RosterSort
      if (this.renderedState) this.render(this.renderedState)
    } else if (select.matches('[data-action="formation-sort"]')) {
      this.formationSort = select.value as FormationSort
      if (this.renderedState) this.render(this.renderedState)
    } else if (select.matches('[data-action="equipment-filter"]')) {
      const key = select.dataset.key as keyof typeof this.equipmentFilter
      if (key in this.equipmentFilter) this.equipmentFilter[key] = select.value
      this.equipmentScrollTop = 0
      if (this.renderedState) this.render(this.renderedState)
    } else if (select.matches('[data-action="equipment-sort"]')) {
      this.equipmentSort = select.value as EquipmentSort
      if (this.renderedState) this.render(this.renderedState)
    } else if (select.matches('[data-action="equipment-general"]')) {
      this.callbacks.onEquipmentSelectGeneral(select.value)
    }
  }
  private handleSubmit = (event: SubmitEvent): void => {
    const form = event.target as HTMLFormElement
    if (form.matches('[data-board-form]')) {
      event.preventDefault()
      const data = new FormData(form)
      this.callbacks.onBoardPost((String(data.get('board') ?? '전체')) as BoardPost['board'], String(data.get('title') ?? ''), String(data.get('content') ?? ''), String(data.get('password') ?? ''))
      return
    }
    if (form.matches('[data-board-delete-form]')) {
      event.preventDefault()
      const data = new FormData(form)
      this.callbacks.onBoardDelete(Number(data.get('postId') ?? 0), String(data.get('password') ?? ''))
      return
    }
    if (!form.matches('[data-account-form]')) return
    event.preventDefault()
    const input = form.elements.namedItem('name') as HTMLInputElement | null
    if (input) this.callbacks.onAccountSave(input.value)
  }
}

function totalPower(state: StrategyState): number {
  return state.formation.reduce((sum, id) => {
    const general = state.generals.find(item => item.id === id)
    return sum + (general ? combatPower(general) + equipmentPowerForUi(state, general.id) : 0)
  }, 0)
}

function equipmentPowerForUi(state: StrategyState, generalId: string): number {
  const bonus = equipmentBonus(state, generalId)
  return Math.round(bonus.leadership * 1.15 + bonus.martial * 1.25 + bonus.stratagem * 0.9 + bonus.speed * 0.65)
}
