import './styles/main.css'
import './styles/theme-color.css'
import './styles/territory-map.css'
import { ManusAuth } from '../manus-auth.js'
import { createLeaderboardClient, type Result, type RunTicket } from '../leaderboard.js'
import { Arena } from './game/arena'
import { isSteamDesktop, syncSteamAchievements } from './platform/steam'
import {
  createInitialState,
  allGenerals,
  collectIncome,
  launchConquest,
  resolveConquestBattle,
  defendCity,
  launchFactionBattle,
  deployCityGarrison,
  drawEquipment,
  enhanceEquipment,
  equipmentBonus,
  ensureEquipmentState,
  purchaseMythicEquipment,
  purchaseGoldPackage,
  purchaseHonorPackage,
  purchaseResourcePackage,
  consumeDuelAttempt,
  ensureDuelDailyState,
  equipEquipment,
  unequipEquipment,
  ensureCityRoster,
  normalizeInitialSeasonTerritories,
  ensureResearchRoster,
  mergeFactionTerritories,
  migrateLegacyStarterRoster,
  ensurePrelaunchDailyGold,
  FACTION_CAPITALS,
  findGeneral,
  recruit,
  selectCity,
  toggleFormation,
  unlockResearch,
  unlockSkill,
  upgrade,
  upgradeBuilding,
  type Section,
  type StrategyState,
  type FactionTerritorySnapshot,
  type Faction,
} from './game/strategy'
import { StrategyUI, type AccountView, type AdminBoardState, type AuthView, type BoardPost, type CityDamageRanking, type DuelOpponent, type GameAccountView } from './ui/strategy-ui'
import { clearedScenarioCount, firstClearReward, recordScenarioStars, scenarioById, scenarioEnemyIds, scenarioEnemyLevel, scenarioStars, type ScenarioDefinition } from './game/scenarios'
import { autoEquip, autoFormation, withEquipmentStats, cityDefenseForLevel, scaleGeneral, templateGeneral } from './game/strategy'

const root = document.querySelector<HTMLElement>('#ui')
const canvas = document.querySelector<HTMLCanvasElement>('#game')

if (!root || !canvas) throw new Error('Strategy game shell is incomplete')

const LOCAL_GAME_SAVE_KEY = 'cheonharo.strategy.save.member.v2'
const GUEST_GAME_SAVE_KEY = 'cheonharo.strategy.save.guest.v2'
const GUEST_ACCESS_KEY = 'cheonharo.access.guest.v1'
const PENDING_TERRITORY_BATTLES_KEY = 'cheonharo.territory.pending-battles.v1'
const state: StrategyState = createInitialState()

// Steam 데스크톱 버전: 진행도에 따라 업적을 해금한다 (웹에서는 아무 일도 하지 않음).
function syncSteam(): void {
  syncSteamAchievements({ wins: state.wins, generalCount: state.generals.length, scenarioClearedCount: clearedScenarioCount(state.scenarioCleared) })
}
if (isSteamDesktop()) window.setInterval(syncSteam, 5000)
let localSaveDirty = false

type PendingTerritoryBattle = { cityId: string; damage: number; won: boolean; captured: boolean }

function readPendingTerritoryBattles(): PendingTerritoryBattle[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(PENDING_TERRITORY_BATTLES_KEY) ?? '[]') as unknown
    return Array.isArray(value) ? value.filter(item => item && typeof item.cityId === 'string' && typeof item.damage === 'number' && typeof item.won === 'boolean' && typeof item.captured === 'boolean') as PendingTerritoryBattle[] : []
  } catch {
    return []
  }
}

function writePendingTerritoryBattles(battles: PendingTerritoryBattle[]): void {
  try {
    window.localStorage.setItem(PENDING_TERRITORY_BATTLES_KEY, JSON.stringify(battles.slice(-20)))
  } catch {
    // Local storage may be unavailable; the live state still remains playable.
  }
}

function enqueueTerritoryBattle(battle: PendingTerritoryBattle): void {
  writePendingTerritoryBattles([...readPendingTerritoryBattles(), battle])
}

function persistLocalGame(): void {
  try {
    const saveKey = gameAccess === 'guest' ? GUEST_GAME_SAVE_KEY : LOCAL_GAME_SAVE_KEY
    window.localStorage.setItem(saveKey, JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      honor: state.honor,
      silver: state.silver,
      gold: state.gold,
      manuals: state.manuals,
      factionConfirmed: state.factionConfirmed,
      wins: state.wins,
      battleScore: state.battleScore,
      faction: state.faction,
      resources: state.resources,
      generals: state.generals,
      formation: state.formation,
      cities: state.cities,
      research: state.research,
      selectedCityId: state.selectedCityId,
      lastIncomeCollectedAt: state.lastIncomeCollectedAt,
      lastConquestAt: state.lastConquestAt,
      luoyangBoxes: state.luoyangBoxes,
      lastLuoyangReward: state.lastLuoyangReward,
      luoyangRewardWeekKey: state.luoyangRewardWeekKey,
      factionWarScore: state.factionWarScore,
      equipmentInventory: state.equipmentInventory,
      equipmentLoadouts: state.equipmentLoadouts,
      selectedEquipmentGeneralId: state.selectedEquipmentGeneralId,
      mythicFragments: state.mythicFragments,
      duelAttemptsToday: state.duelAttemptsToday,
      duelDayKey: state.duelDayKey,
      prelaunchGoldDayKey: state.prelaunchGoldDayKey,
      scenarioCleared: state.scenarioCleared,
    }))
  } catch {
    // Private browsing and quota restrictions should not stop gameplay.
  }
}

function restoreLocalGame(saveKey = LOCAL_GAME_SAVE_KEY): void {
  try {
    const raw = window.localStorage.getItem(saveKey)
    if (!raw) return
    const saved = JSON.parse(raw) as Partial<StrategyState> & { version?: number; resources?: StrategyState['resources']; savedAt?: number }
    if (saved.version !== undefined && saved.version !== 2) return
    Object.assign(state, {
      honor: saved.honor,
      silver: saved.silver,
      gold: saved.gold,
      manuals: saved.manuals,
      wins: saved.wins,
      battleScore: saved.battleScore,
      faction: saved.faction ?? '촉한',
      factionConfirmed: saved.factionConfirmed === true,
      resources: saved.resources,
      generals: saved.generals,
      formation: saved.formation,
      cities: saved.cities,
      research: saved.research,
      selectedCityId: saved.selectedCityId,
      lastIncomeCollectedAt: saved.lastIncomeCollectedAt,
      lastConquestAt: saved.lastConquestAt,
      luoyangBoxes: saved.luoyangBoxes,
      lastLuoyangReward: saved.lastLuoyangReward,
      luoyangRewardWeekKey: saved.luoyangRewardWeekKey,
      factionWarScore: saved.factionWarScore,
      equipmentInventory: saved.equipmentInventory,
      equipmentLoadouts: saved.equipmentLoadouts,
      selectedEquipmentGeneralId: saved.selectedEquipmentGeneralId,
      mythicFragments: saved.mythicFragments,
      duelAttemptsToday: saved.duelAttemptsToday,
      duelDayKey: saved.duelDayKey,
      prelaunchGoldDayKey: saved.prelaunchGoldDayKey,
      scenarioCleared: Array.isArray(saved.scenarioCleared) ? saved.scenarioCleared.filter((id): id is string => typeof id === 'string') : [],
    })
  } catch {
    // Corrupt local data is ignored and replaced by the normal starter state.
  }
}

ensureCityRoster(state)
ensureResearchRoster(state)
ensureEquipmentState(state)
let arena: Arena
let pendingTicket: RunTicket | null = null
let authView: AuthView = { status: 'logged_out', name: null }
let accountView: AccountView | null = null
let saveTimer: number | null = null
let saveInFlight = false
let saveQueued = false
let saveRetryCount = 0
let saveRevision = 0
let authGeneration = 0
let duelActive = false
let scenarioActive = false
let activeScenario: ScenarioDefinition | null = null
let gameAccess: 'member' | 'guest' | null = window.localStorage.getItem(GUEST_ACCESS_KEY) === '1' ? 'guest' : null
const duelDecks = new Map<string, ReturnType<typeof allGenerals>>()
let pendingSiege: { cityId: string; result: ReturnType<typeof launchConquest> } | null = null

function restoreAccessState(mode: 'member' | 'guest'): void {
  const currentSection = state.section
  const fresh = createInitialState()
  Object.assign(state, fresh)
  state.section = currentSection
  gameAccess = mode
  // 회원 데이터는 계정별 서버 원장을 기준으로 한다. 공용 회원 로컬 저장본을
  // 먼저 복원하면 다른 계정의 진행 상태가 새 계정에 재사용될 수 있다.
  if (mode === 'guest') restoreLocalGame(GUEST_GAME_SAVE_KEY)
  ensureCityRoster(state)
  const normalizedTerritories = normalizeInitialSeasonTerritories(state)
  ensureResearchRoster(state)
  ensureEquipmentState(state)
  const receivedDailyGold = ensurePrelaunchDailyGold(state)
  const migratedStarter = migrateLegacyStarterRoster(state)
  if (receivedDailyGold || migratedStarter || normalizedTerritories) persistLocalGame()
  localSaveDirty = (receivedDailyGold || migratedStarter || normalizedTerritories) && mode === 'guest'
}

function resetAccountSavePipeline(): void {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
  saveQueued = false
  saveRetryCount = 0
  saveRevision += 1
  localSaveDirty = false
}

function battleGenerals(): NonNullable<ReturnType<typeof findGeneral>>[] {
  return state.formation.map(id => {
    const general = findGeneral(state, id)
    return general ? withEquipmentStats(general, equipmentBonus(state, id)) : null
  }).filter((general): general is NonNullable<typeof general> => Boolean(general))
}

const leaderboard = createLeaderboardClient({
  identity: 'account',
  boardId: 'war-score-v1',
  rulesVersion: 'v1',
  auth: ManusAuth,
  storage: window.localStorage,
})

function duelDeckFor(opponent: DuelOpponent): ReturnType<typeof allGenerals> {
  if (opponent.deck?.length) return opponent.deck.map(general => ({ ...general }))
  const catalog = allGenerals()
  const seed = [...opponent.id].reduce((sum, character) => sum + character.charCodeAt(0), opponent.score)
  const deck = [0, 1, 2].map(index => catalog[(seed + index * 17) % catalog.length])
  return deck.map(general => scaleGeneral({ ...general, level: 1, stars: 1 }, Math.max(1, Math.min(30, Math.round(opponent.score / 1800) + (general.grade - 2))), Math.max(1, Math.min(5, general.stars))))
}

function siegeDeckFor(cityId: string): ReturnType<typeof allGenerals> {
  const city = state.cities.find(item => item.id === cityId)
  const catalog = allGenerals()
  const seed = [...cityId].reduce((sum, character) => sum + character.charCodeAt(0), (city?.level ?? 1) * 31)
  return [0, 1, 2].map(index => {
    const template = catalog[(seed + index * 13) % catalog.length]
    const level = Math.max(1, Math.min(30, (city?.level ?? 1) * 5 + index * 2))
    const scaled = scaleGeneral({ ...template, level: 1, stars: 1 }, level, Math.max(1, Math.min(5, city?.level ?? 1)))
    return { ...scaled, id: template.id, skillUnlocked: true }
  })
}

/** 공성: 성벽 방어도가 남아 있을수록 적 사기 최대치 +0~50 */
function siegeMoraleBonus(cityId: string): number {
  const city = state.cities.find(item => item.id === cityId)
  if (!city) return 0
  return Math.round(50 * Math.max(0, Math.min(1, city.defense / Math.max(1, cityDefenseForLevel(city.level)))))
}

const DUMMY_DUEL_STORAGE_KEY = 'cheonharo.duel.dummy-opponents.v1'

function dummyDuelOpponents(): DuelOpponent[] {
  const defaults: DuelOpponent[] = [
    { id: 'dummy-iron-gate', displayName: '철벽 관문의 더미', score: 16800, isDummy: true },
    { id: 'dummy-jade-banner', displayName: '청람 진형 더미', score: 22100, isDummy: true },
    { id: 'dummy-wind-tactician', displayName: '질풍 책사 더미', score: 27600, isDummy: true },
  ]
  try {
    const saved = JSON.parse(window.localStorage.getItem(DUMMY_DUEL_STORAGE_KEY) ?? 'null') as unknown
    if (Array.isArray(saved) && saved.length === defaults.length && saved.every(item => item && typeof item.id === 'string' && typeof item.displayName === 'string' && typeof item.score === 'number' && item.isDummy === true)) {
      return saved as DuelOpponent[]
    }
    window.localStorage.setItem(DUMMY_DUEL_STORAGE_KEY, JSON.stringify(defaults))
  } catch {
    // Private browsing or malformed legacy storage: keep the deterministic defaults.
  }
  return defaults
}

function installDummyDuelOpponents(): void {
  const opponents = dummyDuelOpponents()
  duelDecks.clear()
  opponents.forEach(opponent => duelDecks.set(opponent.id, duelDeckFor(opponent)))
  ui.setDuelOpponents(opponents)
}

async function refreshDuelOpponents(): Promise<void> {
  if (authView.status === 'authenticated') {
    try {
      const opponents = await ManusAuth.query('duel.listOpponents', { limit: 12 }) as DuelOpponent[]
      if (opponents.length) {
        duelDecks.clear()
        opponents.forEach(opponent => duelDecks.set(opponent.id, duelDeckFor(opponent)))
        ui.setDuelOpponents(opponents)
        ui.notify('저장된 실제 유저 덱을 불러왔습니다.')
        return
      }
    } catch {
      // An unavailable authenticated endpoint falls through to the safe training roster.
    }
    installDummyDuelOpponents()
    ui.notify('실제 유저 덱이 없어 훈련용 더미 덱을 준비했습니다.')
    return
  }
  installDummyDuelOpponents()
  ui.notify('게스트 모드에서는 훈련용 더미 덱을 사용합니다.')
}

async function refreshFactionTerritories(notify = false): Promise<void> {
  if (authView.status !== 'authenticated') {
    ui.setTerritorySync('로컬 영토 · 로그인 후 동기화')
    return
  }
  ui.setTerritorySync('서버 원장 확인 중…')
  try {
    const pending = readPendingTerritoryBattles()
    const remaining: PendingTerritoryBattle[] = []
    let retried = 0
    for (const battle of pending) {
      try {
        const retryPayload = { ...battle, damage: Math.max(0, Math.min(1_000_000, Math.trunc(battle.damage))) }
        const snapshots = await ManusAuth.mutate('territory.recordBattle', retryPayload) as FactionTerritorySnapshot[]
        mergeFactionTerritories(state, snapshots)
        retried += 1
      } catch {
        remaining.push(battle)
      }
    }
    writePendingTerritoryBattles(remaining)
    const snapshots = await ManusAuth.query('territory.list') as FactionTerritorySnapshot[]
    const merged = mergeFactionTerritories(state, snapshots)
    persistLocalGame()
    ui.setTerritorySync(`서버 원장 · ${new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`)
    ui.render(state)
    if (notify) ui.notify(`전역 영토 원장 동기화 완료 · ${merged}개 도시 반영${retried ? ` · 대기 전투 ${retried}건 재기록` : ''}`, 'jade')
  } catch {
    ui.setTerritorySync('서버 원장 연결 대기')
    if (notify) ui.notify('서버 원장 연결이 지연되고 있습니다. 로컬 작전 결과는 보존되며 다시 시도합니다.', 'jade')
  }
}

// 수비대·방어전은 진영 공용이라 서버가 기준이다. 서버가 판정한 결과로 로컬 화면을 맞춘다.
async function syncFactionGarrison(cityId: string, garrison: { id: string; power: number; averageLevel: number; label: string }): Promise<void> {
  if (authView.status !== 'authenticated') return
  try {
    const snapshots = await ManusAuth.mutate('territory.deployGarrison', { cityId, garrisonId: garrison.id.slice(0, 96), power: Math.max(0, Math.min(2_000_000, Math.round(garrison.power))), averageLevel: Math.max(1, Math.min(999, Math.round(garrison.averageLevel))), label: garrison.label.slice(0, 40) }) as FactionTerritorySnapshot[]
    mergeFactionTerritories(state, snapshots)
    persistLocalGame()
    ui.render(state)
  } catch (error) {
    ui.notify(`수비병 서버 등록 보류 · ${error instanceof Error ? error.message.slice(0, 60) : '연결 지연'}`, 'ember')
  }
}

async function syncFactionDefense(cityId: string): Promise<void> {
  if (authView.status !== 'authenticated') return
  try {
    const response = await ManusAuth.mutate('territory.recordDefense', { cityId }) as { outcome: { attackerWon: boolean; damage: number } | null; territories: FactionTerritorySnapshot[] }
    mergeFactionTerritories(state, response.territories)
    persistLocalGame()
    ui.render(state)
    if (response.outcome) {
      ui.notify(response.outcome.attackerWon ? `서버 판정 · 방어 실패 · 성벽 방어도 -${response.outcome.damage}` : '서버 판정 · 방어 성공 · 성벽 방어도 유지', response.outcome.attackerWon ? 'ember' : 'jade')
    }
  } catch {
    // 구버전 서버이거나 연결이 지연되면 로컬 결과만 남는다. 다음 영토 동기화 때 서버 값으로 맞춰진다.
  }
}

async function recordFactionTerritoryBattle(cityId: string, outcome: { damage: number; won: boolean; captured: boolean }): Promise<void> {
  if (authView.status !== 'authenticated') return
  const payload = { cityId, damage: Math.max(0, Math.min(1_000_000, Math.trunc(outcome.damage))), won: outcome.won, captured: outcome.captured }
  try {
    const snapshots = await ManusAuth.mutate('territory.recordBattle', payload) as FactionTerritorySnapshot[]
    mergeFactionTerritories(state, snapshots)
    persistLocalGame()
    ui.setTerritorySync(`서버 원장 · ${new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`)
    ui.render(state)
  } catch {
    enqueueTerritoryBattle(payload)
    ui.setTerritorySync('서버 기록 재시도 대기')
    ui.notify('전투 결과는 로컬에 반영되었습니다. 서버 기록은 다음 영토 동기화에서 자동 재시도합니다.', 'jade')
  }
}
async function refreshCityDamageRankings(cityId: string): Promise<void> {
  ui.setCityDamageRankings(cityId, [])
  if (authView.status !== 'authenticated' || !cityId) return
  try {
    const rankings = await ManusAuth.query('territory.damageRanking', { cityId }) as CityDamageRanking[]
    ui.setCityDamageRankings(cityId, rankings)
  } catch {
    ui.setCityDamageRankings(cityId, [])
  }
}
async function refreshBoard(board: BoardPost['board'] = '전체'): Promise<void> {
  if (authView.status !== 'authenticated') {
    ui.notify('게시판은 회원 로그인 후 이용할 수 있습니다.', 'ember')
    return
  }
  try {
    const posts = await ManusAuth.query('board.list', { board }) as BoardPost[]
    ui.setBoardPosts(posts, board)
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : '게시판을 불러오지 못했습니다.', 'ember')
  }
}
async function createBoardPost(board: BoardPost['board'], title: string, content: string, password: string): Promise<void> {
  if (authView.status !== 'authenticated') {
    ui.notify('게시글 작성은 회원 로그인 후 이용할 수 있습니다.', 'ember')
    return
  }
  try {
    await ManusAuth.mutate('board.create', { board, title: title.trim(), content: content.trim(), password })
    ui.notify('게시글을 올렸습니다.', 'jade')
    await refreshBoard(board)
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : '게시글 작성에 실패했습니다.', 'ember')
  }
}
async function deleteBoardPost(id: number, password: string): Promise<void> {
  try {
    await ManusAuth.mutate('board.delete', { id, password })
    ui.notify('게시글을 삭제했습니다.', 'jade')
    await refreshBoard()
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : '게시글 삭제에 실패했습니다.', 'ember')
  }
}
const ui = new StrategyUI(root, {
  onSection: (section: Section) => {
    if (section === 'board' && authView.status !== 'authenticated') {
      ui.notify('진영 게시판은 회원 로그인 후 이용할 수 있습니다.', 'ember')
      return
    }
    if (section === 'admin' && accountView?.role !== 'admin') {
      state.section = 'overview'
      ui.render(state)
      ui.notify('관리자 권한이 있는 계정만 관리자센터를 이용할 수 있습니다.', 'ember')
      return
    }
    if (scenarioActive && section !== 'battle') {
      scenarioActive = false
      activeScenario = null
      arena.stopBattle()
    }
    if (duelActive && section !== 'battle') {
      duelActive = false
      arena.stopBattle()
    }
    if (pendingSiege && section !== 'battle') {
      const siege = pendingSiege
      pendingSiege = null
      arena.stopBattle()
      queueAccountSave(true)
      void recordFactionTerritoryBattle(siege.cityId, { damage: siege.result.damage, won: siege.result.damage > 0, captured: siege.result.captured })
      ui.notify('공성 전투를 종료하고 전황을 저장했습니다.', 'jade')
    }
    state.section = section
    if (section === 'battle' && !scenarioActive) { duelActive = false; arena.setOpponentDeck(null); arena.setGenerals(battleGenerals()); ui.updateBattle(arena.getSnapshot()) }
    if (section === 'duel') {
      installDummyDuelOpponents()
      void refreshDuelOpponents()
    }
    if (section === 'board') void refreshBoard()
    if (section === 'territory') void refreshCityDamageRankings(state.selectedCityId)
    ui.render(state)
    if (section === 'account') void refreshAccount()
    if (section === 'admin') {
      void refreshAdminAccounts()
      void refreshAdminGameData()
      void refreshAdminBoard()
    }
  },
  onRecruit: count => {
    const result = recruit(state, count)
    ui.render(state)
    if (result.ok) syncSteam()
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
    if (result.ok && count === 10) ui.showRecruitResults(result.rewards)
    else if (result.ok && result.general) void ui.playRecruitAnimation(result.general, count)
  },
  onUpgrade: id => {
    const result = upgrade(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onSkill: id => {
    const result = unlockSkill(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onFormation: id => {
    toggleFormation(state, id)
    arena.setGenerals(battleGenerals())
    ui.render(state)
    ui.notify(state.lastNotice)
    queueAccountSave()
  },
  onEquipmentDraw: count => {
    const result = drawEquipment(state, count)
    if (result.ok) queueAccountSave(true)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) {
      ui.showEquipmentResults(result.rewards)
    }
  },
  onEquipmentEnhance: id => {
    const result = enhanceEquipment(state, id)
    if (result.ok) queueAccountSave(true)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
  },
  onAutoFormation: withEquipment => {
    const formed = autoFormation(state)
    const equipped = withEquipment && formed.ok ? autoEquip(state) : null
    arena.setGenerals(battleGenerals())
    ui.render(state)
    ui.notify(equipped?.ok ? `${formed.message} · ${equipped.message}` : formed.message, formed.ok ? 'jade' : 'ember')
    if (formed.ok) queueAccountSave()
  },
  onAutoEquip: () => {
    const result = autoEquip(state)
    arena.setGenerals(battleGenerals())
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok && result.changed) queueAccountSave()
  },
  onEquipmentEquip: (generalId, itemId) => {
    const result = equipEquipment(state, generalId, itemId)
    if (result.ok) queueAccountSave(true)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
  },
  onEquipmentUnequip: (generalId, type) => {
    const result = unequipEquipment(state, generalId, type)
    if (result.ok) queueAccountSave(true)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
  },
  onEquipmentSelectGeneral: id => {
    state.selectedEquipmentGeneralId = id
    ui.render(state)
  },
  onCitySelect: id => {
    const result = selectCity(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onCityDamageRankingRefresh: id => {
    void refreshCityDamageRankings(id)
  },
  onTerritoryRefresh: () => {
    void refreshFactionTerritories(true)
  },
  onConquest: id => {
    const result = launchConquest(state, id)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) {
      pendingSiege = { cityId: id, result }
      duelActive = false
      state.section = 'battle'
      ui.setBattleAutoAvailable(false)
      arena.setSiegeDeck(siegeDeckFor(id), siegeMoraleBonus(id))
      arena.setGenerals(battleGenerals())
      arena.startBattle()
      // 전투 스냅샷을 먼저 반영해야 battleViewActive가 켜진 상태로 렌더링된다.
      // 순서를 뒤집으면 공성 출정도 시나리오 목록으로 다시 표시된다.
      ui.updateBattle(arena.getSnapshot())
      ui.render(state)
      ui.updateBattle(arena.getSnapshot())
      ui.notify('공성출정을 시작했습니다. 성문을 돌파하고 전황을 확인하십시오.', 'jade')
    } else {
      ui.render(state)
    }
  },
  onDefense: id => {
    const result = defendCity(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok && result.won ? 'jade' : 'ember')
    if (result.ok) {
      queueAccountSave()
      void syncFactionDefense(id)
    }
  },
  onGarrisonDeploy: id => {
    const result = deployCityGarrison(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) {
      queueAccountSave()
      const city = state.cities.find(entry => entry.id === id)
      const garrison = city?.garrisons?.at(-1)
      if (garrison) void syncFactionGarrison(id, garrison)
    }
  },
  onFactionBattle: id => {
    const result = launchFactionBattle(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok && result.won ? 'jade' : 'ember')
    if (result.ok) {
      queueAccountSave()
      void recordFactionTerritoryBattle(id, { damage: result.damage, won: result.won, captured: result.won })
    }
  },
  onCollectIncome: () => {
    const result = collectIncome(state)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onBuildingUpgrade: (cityId, buildingId) => {
    const result = upgradeBuilding(state, cityId, buildingId)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onResearch: id => {
    const result = unlockResearch(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onScenarioStart: id => {
    const scenario = scenarioById(id)
    if (!scenario) return
    scenarioActive = true
    activeScenario = scenario
    duelActive = false
    state.section = 'battle'
    // 적 덱: 그 시대에 실제로 맞섰던 상대(진영별), 장 안에서 뒤 사건일수록 강해진다.
    const enemyLevel = scenarioEnemyLevel(scenario)
    const deck = scenarioEnemyIds(scenario, state.faction).map((id, index) => {
      const base = templateGeneral(id) ?? allGenerals()[index]
      return { ...scaleGeneral({ ...base, level: 1, stars: 1 }, enemyLevel + index - 1, Math.min(5, 1 + Math.floor(enemyLevel / 12))), skillUnlocked: enemyLevel >= 6 }
    })
    arena.setOpponentDeck(deck, 'scenario')
    arena.setGenerals(battleGenerals())
    arena.startBattle()
    ui.setBattleAutoAvailable(scenarioStars(state.scenarioCleared, scenario.id) >= 3)
    ui.updateBattle(arena.getSnapshot())
    ui.render(state)
    ui.updateBattle(arena.getSnapshot())
    ui.notify(`${scenario.year}년 ${scenario.title} · 대화형 시나리오 전투를 시작합니다.`, 'jade')
  },
  onBattleStart: () => {
    ui.setBattleAutoAvailable(false)
    scenarioActive = false
    activeScenario = null
    duelActive = false
    arena.setOpponentDeck(null)
    state.section = 'battle'
    arena.setGenerals(battleGenerals())
    arena.startBattle()
    pendingTicket = null
    if (!duelActive) void leaderboard.beginRun().then(result => {
      if (result.ok) pendingTicket = result.value
      else if (authView.status === 'authenticated') ui.notify(`온라인 기록을 시작하지 못했습니다 · ${result.error}`, 'ember')
    })
    ui.updateBattle(arena.getSnapshot())
    ui.render(state)
    ui.updateBattle(arena.getSnapshot())
    ui.notify('작전 개시 · 지휘 명령을 선택하십시오.')
  },
  onBattleMove: index => {
    arena.commandMove(index)
    ui.updateBattle(arena.getSnapshot())
  },
  onBattleSkill: index => {
    arena.castSkill(index)
    ui.updateBattle(arena.getSnapshot())
  },
  onBattleSpeed: speed => {
    arena.setSpeed(speed)
    ui.updateBattle(arena.getSnapshot())
  },
  onBattlePause: on => {
    arena.setPaused(on)
    ui.updateBattle(arena.getSnapshot())
  },
  onBattleStop: () => {
    // 전투 중지: 결과·보상 없이 끝내고 시나리오 목록(전투 메뉴 첫 화면)으로 돌아간다.
    const siege = pendingSiege
    arena.stopBattle()
    scenarioActive = false
    activeScenario = null
    duelActive = false
    pendingTicket = null
    if (siege) {
      pendingSiege = null
      queueAccountSave(true)
      void recordFactionTerritoryBattle(siege.cityId, { damage: siege.result.damage, won: siege.result.damage > 0, captured: siege.result.captured })
    }
    state.section = 'battle'
    ui.updateBattle(arena.getSnapshot())
    ui.render(state)
    ui.notify('전투를 중지했습니다. 시나리오 목록으로 돌아갑니다. (보상 없음)')
  },
  onBattleAuto: on => {
    arena.setAutoPlay(on)
    ui.updateBattle(arena.getSnapshot())
  },
  onBattleTactic: tactic => {
    arena.useTactic(tactic)
    ui.updateBattle(arena.getSnapshot())
  },

  onDuelRefresh: () => {
    void refreshDuelOpponents()
  },
  onDuelStart: opponentId => {
    ensureDuelDailyState(state)
    const attempt = consumeDuelAttempt(state)
    if (!attempt.ok) {
      ui.notify(attempt.message, 'ember')
      return
    }
    let deck = duelDecks.get(opponentId)
    if (!deck) {
      const fallback: DuelOpponent = { id: opponentId || 'dummy-fallback', displayName: '훈련용 더미 덱', score: 18000, isDummy: true }
      deck = duelDeckFor(fallback)
      duelDecks.set(opponentId || fallback.id, deck)
    }
    duelActive = true
    state.section = 'battle'
    ui.setBattleAutoAvailable(false)
    arena.setOpponentDeck(deck, 'duel')
    arena.setGenerals(battleGenerals())
    arena.startBattle()
    ui.render(state)
    ui.updateBattle(arena.getSnapshot())
    ui.notify('유저 대련을 시작했습니다. 상대 덱의 전력을 돌파하십시오.')
  },
  onFactionSelect: faction => {
    state.faction = faction as Faction
    state.factionConfirmed = true
    state.selectedCityId = FACTION_CAPITALS[state.faction]
    state.section = 'overview'
    persistLocalGame()
    ui.render(state)
    ui.notify(`${state.faction} 진영을 선택했습니다. 본성 ${state.selectedCityId === 'chengdu' ? '성도' : state.selectedCityId === 'ye' ? '업' : '건업'}에서 천하를 시작합니다.`, 'jade')
    if (authView.status === 'authenticated') queueAccountSave()
    void refreshFactionTerritories()
  },
  onGuestLogin: () => {
    restoreAccessState('guest')
    window.localStorage.setItem(GUEST_ACCESS_KEY, '1')
    if (state.factionConfirmed) ui.render(state)
    else ui.showFactionSelection()
    ui.notify(state.factionConfirmed ? '게스트 모드로 입장했습니다. 진행 데이터는 이 기기에 저장됩니다.' : '게스트 모드로 입장했습니다. 먼저 진영을 선택하십시오.')
  },
  onLogin: () => {
    void ManusAuth.login().catch(() => ui.notify('로그인은 저장된 체크포인트의 온라인 화면에서 사용할 수 있습니다.', 'ember'))
  },
  onLogout: () => {
    void ManusAuth.logout().then(session => {
      gameAccess = null
      window.localStorage.removeItem(GUEST_ACCESS_KEY)
      Object.assign(state, createInitialState())
      ensureCityRoster(state)
      ensureResearchRoster(state)
      ensureEquipmentState(state)
      localSaveDirty = false
      authView = { status: session.status, name: session.user?.name ?? null }
      accountView = null
      ui.setAccount(null)
      ui.setAuth(authView)
      ui.showAccessGate()
      ui.notify('로그아웃했습니다.')
    }).catch(() => ui.notify('로그아웃을 완료하지 못했습니다.', 'ember'))
  },
  onAccountRefresh: () => {
    void refreshAccount()
  },
  onAccountSave: name => {
    void saveAccountName(name)
  },
  onRankRefresh: () => {
    void refreshLeaderboard()
  },
  onBoardRefresh: board => {
    void refreshBoard(board)
  },
  onBoardPost: (board, title, content, password) => {
    void createBoardPost(board, title, content, password)
  },
  onBoardDelete: (id, password) => {
    void deleteBoardPost(id, password)
  },
  onStore: () => {
    state.section = 'shop'
    ui.render(state)
  },
  onShopPurchase: equipmentId => {
    const result = purchaseMythicEquipment(state, equipmentId)
    if (result.ok) queueAccountSave(true)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
  },
  onCashShopPurchase: productId => {
    const result = purchaseResourcePackage(state, productId)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onHonorShopPurchase: packageId => {
    const result = purchaseHonorPackage(state, packageId)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onGoldPurchase: packageId => {
    const result = purchaseGoldPackage(state, packageId)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onAdminAction: message => {
    ui.render(state)
    ui.notify(message)
  },
  onAdminAccountsRefresh: search => {
    void refreshAdminAccounts(search)
  },
  onAdminRoleChange: (id, role) => {
    void changeAdminRole(id, role)
  },
  onAdminGameDataRefresh: () => {
    void refreshAdminGameData()
  },
  onAdminGameDataSave: data => {
    void saveAdminGameData(data)
  },
  onAdminBoardRefresh: () => {
    void refreshAdminBoard()
  },
  onAdminBoardPostingToggle: enabled => {
    void setAdminBoardPosting(enabled)
  },
  onAdminBoardDelete: id => {
    void deleteAdminBoardPost(id)
  },
})

arena = new Arena(canvas, {
  onEvent: message => ui.notify(message),
  onBattleEnd: result => {
    state.battleScore = Math.max(state.battleScore, result.score)
    const siege = pendingSiege
    const wasSiege = Boolean(siege)
    const wasScenario = Boolean(scenarioActive && activeScenario)
    const wasDuel = !wasSiege && (duelActive || arena.isDuelBattle())
    if (wasSiege && siege) {
      // The arena result is authoritative for the visible siege scene. A
      // pre-battle check can have returned damage 0 while still opening the
      // scene, so resolve the wall damage from the actual 3D victory once.
      if (result.won) {
        const resolved = resolveConquestBattle(state, siege.cityId, true)
        siege.result = { ...siege.result, damage: resolved.damage, message: resolved.message }
      }
      state.lastNotice = siege.result.message
      // 공성 결과 뒤에는 시나리오 목록이 아니라 방금 공격한 도시의
      // 공성 메뉴(도시 관리 카드)로 바로 돌아가도록 전투 맥락을 보존한다.
      state.selectedCityId = siege.cityId
      state.section = 'territory'
      pendingSiege = null
    } else if (result.won) {
      state.wins += 1
      // 반복 전투 보상은 별 수에 비례(3개 100% · 2개 80% · 1개 60%). 시나리오는 최초 클리어 보상만.
      const rate = [0, 0.6, 0.8, 1][result.stars] ?? 0.6
      const honor = Math.round((wasDuel ? 120 : 180) * rate)
      const silver = Math.round((wasDuel ? 600 : 1200) * rate)
      if (!wasScenario) {
        state.honor += honor
        state.silver += silver
        state.resources.silver = state.silver
      }
      if (wasDuel) state.mythicFragments += 1
      if (scenarioActive && activeScenario) {
        const improved = recordScenarioStars(state.scenarioCleared, activeScenario.id, result.stars)
        const starText = `별 ${result.stars}개${improved && result.stars >= 3 ? ' · 자동 전투 해금' : ''}`
        const reward = firstClearReward(activeScenario, state.scenarioCleared)
        if (reward) {
          state.scenarioCleared.push(activeScenario.id)
          state.gold += reward.gold; state.honor += reward.honor; state.silver += reward.silver; state.manuals += reward.manuals
          state.resources = { ...state.resources, grain: state.resources.grain + reward.grain, silver: state.resources.silver + reward.silver, wood: state.resources.wood + reward.wood, iron: state.resources.iron + reward.iron, influence: state.resources.influence + reward.influence }
          state.lastNotice = `시나리오 ${activeScenario.year}년 ${activeScenario.title} 클리어 · ${starText} · 금화 +${reward.gold} · 모든 재화 보상 획득`
        } else state.lastNotice = `시나리오 ${activeScenario.year}년 ${activeScenario.title} 재전투 승리 · ${starText}`
      } else state.lastNotice = wasDuel ? `유저 대련 승리 · 별 ${result.stars}개 · 명망 +${honor} · 은전 +${silver} · 신화장비 조각 +1` : `전투 승리 · 별 ${result.stars}개 · 명망 +${honor} · 은전 +${silver.toLocaleString('ko-KR')}`
    } else {
      state.lastNotice = '전투 패배 · 보상 없음 · 무장 배치와 성장 상태를 다시 점검하십시오.'
    }
    scenarioActive = false
    activeScenario = null
    duelActive = false
    if (wasScenario) queueAccountSave(true)
    // Arena가 비활성 상태가 된 것을 먼저 UI에 전달한다. 시나리오·대련처럼
    // state.section이 battle로 남는 전투도 결과 모달 전에 전체화면을 종료한다.
    ui.updateBattle(arena.getSnapshot())
    ui.render(state)
    ui.showBattleResult(result, state.lastNotice)
    syncSteam()
    if (siege) {
      queueAccountSave(true)
      void recordFactionTerritoryBattle(siege.cityId, { damage: siege.result.damage, won: siege.result.damage > 0, captured: siege.result.captured })
      ui.notify(siege.result.message, siege.result.captured ? 'jade' : 'ember')
    }
    if (pendingTicket) {
      void leaderboard.submitRun(pendingTicket, result.score, result.durationMs).then((submission: Result<unknown>) => {
        if (submission.ok) ui.notify('작전 점수가 천하 랭킹에 기록되었습니다.')
        else ui.notify(`랭킹 기록 보류 · ${submission.error}`, 'ember')
      })
    } else if (authView.status === 'authenticated') {
      ui.notify('온라인 작전 티켓을 받지 못해 이번 점수는 로컬 기록으로 남았습니다.', 'ember')
    }
    pendingTicket = null
    queueAccountSave()
  },
})

ui.setAuth(authView)
if (gameAccess) {
  restoreAccessState(gameAccess)
  if (state.factionConfirmed) ui.render(state)
  else ui.showFactionSelection()
} else ui.showAccessGate()

window.setInterval(() => {
  const snapshot = arena.getSnapshot()
  if (snapshot.active || state.section === 'battle') ui.updateBattle(snapshot)
}, 160)

window.addEventListener('manus-auth-change', (event: Event) => {
  const detail = (event as CustomEvent<{ status: AuthView['status']; user: { name: string | null } | null }>).detail
  authGeneration += 1
  resetAccountSavePipeline()
  authView = { status: detail.status, name: detail.user?.name ?? null }
  if (authView.status !== 'authenticated') {
    accountView = null
    ui.setAccount(null)
  }
  ui.setAuth(authView)
  if (authView.status === 'authenticated') {
    restoreAccessState('member')
    window.localStorage.removeItem(GUEST_ACCESS_KEY)
    if (state.factionConfirmed) ui.render(state)
    else ui.showFactionSelection()
    void refreshAccount()
  } else if (gameAccess === 'guest') {
    if (!state.factionConfirmed) restoreAccessState('guest')
    if (state.factionConfirmed) ui.render(state)
    else ui.showFactionSelection()
    if (state.section === 'battle') ui.updateBattle(arena.getSnapshot())
  } else if (state.section === 'battle' && arena.getSnapshot().active) {
    ui.render(state)
    ui.updateBattle(arena.getSnapshot())
  } else if (!gameAccess) {
    ui.showAccessGate()
  } else {
    gameAccess = null
    ui.showAccessGate()
  }
})

void ManusAuth.prepare().then(session => {
  authGeneration += 1
  resetAccountSavePipeline()
  authView = { status: session.status, name: session.user?.name ?? null }
  ui.setAuth(authView)
  if (authView.status === 'authenticated') {
    restoreAccessState('member')
    window.localStorage.removeItem(GUEST_ACCESS_KEY)
    if (state.factionConfirmed) ui.render(state)
    else ui.showFactionSelection()
    void refreshAccount()
  } else if (!gameAccess) {
    ui.showAccessGate()
  } else if (gameAccess === 'guest') {
    restoreAccessState('guest')
    if (state.factionConfirmed) ui.render(state)
    else ui.showFactionSelection()
  } else {
    ui.showAccessGate()
  }
  if (state.section === 'rank') void refreshLeaderboard()
}).catch(() => {
  authView = { status: 'offline', name: null }
  ui.setAuth(authView)
})

async function refreshLeaderboard(): Promise<void> {
  const result = await leaderboard.list(10)
  if (!result.ok) {
    ui.notify('리더보드는 저장된 체크포인트에서 연결됩니다. 로컬 작전은 계속할 수 있습니다.', 'ember')
    return
  }
  ui.setRanks(result.value.entries.map(entry => ({ rank: entry.rank, displayName: entry.displayName, score: entry.score })))
  ui.notify('천하 랭킹을 새로 불러왔습니다.')
}

async function refreshAccount(): Promise<void> {
  if (authView.status !== 'authenticated') {
    ui.setAccount(null)
    ui.render(state)
    return
  }
  const requestGeneration = authGeneration
  try {
    const account = await ManusAuth.query('account.me') as AccountView
    const game = await ManusAuth.query('account.gameState') as { honor: number; silver: number; gold?: number; manuals: number; wins: number; battleScore: number; grain: number; wood: number; iron: number; influence: number; faction?: StrategyState['faction']; factionChosen?: boolean | number; factionWarScore?: number; generals?: StrategyState['generals'] | null; formation?: string[] | null; cities?: StrategyState['cities'] | null; research?: StrategyState['research'] | null; equipmentInventory?: StrategyState['equipmentInventory'] | null; equipmentLoadouts?: StrategyState['equipmentLoadouts'] | null; selectedEquipmentGeneralId?: string | null; mythicFragments?: number; duelAttemptsToday?: number; duelDayKey?: string; prelaunchGoldDayKey?: string | null; selectedCityId?: string | null; lastIncomeCollectedAt?: number; lastConquestAt?: number; luoyangBoxes?: number; lastLuoyangReward?: number; luoyangRewardWeekKey?: string | null; scenarioCleared?: string[] | null }
    // 계정이 바뀐 동안 도착한 이전 계정 응답은 현재 상태에 적용하지 않는다.
    if (requestGeneration !== authGeneration || authView.status !== 'authenticated') return
    {
      Object.assign(state, { honor: game.honor, silver: game.silver, gold: typeof game.gold === 'number' ? game.gold : state.gold, manuals: game.manuals, wins: game.wins, battleScore: game.battleScore })
      if (game.faction) state.faction = game.faction
      state.factionConfirmed = game.factionChosen === true || game.factionChosen === 1
      state.resources = { ...state.resources, grain: game.grain, silver: game.silver, wood: game.wood, iron: game.iron, influence: game.influence }
      if (Array.isArray(game.generals)) state.generals = game.generals
      if (Array.isArray(game.formation)) state.formation = game.formation
      if (Array.isArray(game.cities)) state.cities = game.cities
      ensureCityRoster(state)
      if (normalizeInitialSeasonTerritories(state)) localSaveDirty = true
      if (Array.isArray(game.research)) state.research = game.research
      ensureResearchRoster(state)
      if (typeof game.selectedCityId === 'string') state.selectedCityId = game.selectedCityId
      state.lastIncomeCollectedAt = game.lastIncomeCollectedAt
      state.lastConquestAt = game.lastConquestAt
      state.luoyangBoxes = Math.max(0, Math.trunc(game.luoyangBoxes ?? state.luoyangBoxes))
      state.lastLuoyangReward = game.lastLuoyangReward
      state.luoyangRewardWeekKey = game.luoyangRewardWeekKey ?? undefined
      state.factionWarScore = game.factionWarScore ?? 0
      if (Array.isArray(game.equipmentInventory)) state.equipmentInventory = game.equipmentInventory
      if (game.equipmentLoadouts && typeof game.equipmentLoadouts === 'object') state.equipmentLoadouts = game.equipmentLoadouts
      if (typeof game.selectedEquipmentGeneralId === 'string') state.selectedEquipmentGeneralId = game.selectedEquipmentGeneralId
      state.mythicFragments = Math.max(0, Math.trunc(game.mythicFragments ?? 0))
      state.duelAttemptsToday = Math.max(0, Math.trunc(game.duelAttemptsToday ?? state.duelAttemptsToday))
      if (typeof game.duelDayKey === 'string') state.duelDayKey = game.duelDayKey
      if (typeof game.prelaunchGoldDayKey === 'string') state.prelaunchGoldDayKey = game.prelaunchGoldDayKey
      if (Array.isArray(game.scenarioCleared)) state.scenarioCleared = game.scenarioCleared.filter((id: string): id is string => typeof id === 'string')
      ensureDuelDailyState(state)
      ensureEquipmentState(state)
      if (ensurePrelaunchDailyGold(state)) localSaveDirty = true
      const migratedStarter = migrateLegacyStarterRoster(state)
      if (migratedStarter) {
        persistLocalGame()
        localSaveDirty = true
      }
      persistLocalGame()
    }
    accountView = account
    ui.setAccount(accountView)
    if (!state.factionConfirmed) {
      ui.showFactionSelection()
      return
    }
    ui.render(state)
    if (localSaveDirty) void flushAccountSave()
    void refreshFactionTerritories()
  } catch {
    ui.notify('계정 정보를 불러오지 못했습니다. 로그인 상태를 확인해 주세요.', 'ember')
  }
}

// 서버(server/routers.mjs SAVE_INT_MAX)와 같은 한도. 값 하나가 한도를 넘어도 저장 전체가
// 거절되지 않도록 보낼 때 범위 안으로 맞춘다.
const SAVE_INT_MAX = 2_000_000_000
function saveInt(value: number, max = SAVE_INT_MAX): number {
  const number = Math.trunc(Number(value))
  return Number.isFinite(number) ? Math.max(0, Math.min(max, number)) : 0
}

function accountStatePayload() {
  return {
    honor: saveInt(state.honor),
    silver: saveInt(state.silver),
    gold: saveInt(state.gold),
    manuals: saveInt(state.manuals),
    wins: saveInt(state.wins),
    battleScore: saveInt(state.battleScore),
    grain: saveInt(state.resources.grain),
    wood: saveInt(state.resources.wood),
    iron: saveInt(state.resources.iron),
    influence: saveInt(state.resources.influence),
    faction: state.faction,
    factionChosen: state.factionConfirmed,
    generalData: JSON.stringify(state.generals),
    formationData: JSON.stringify(state.formation),
    citiesData: JSON.stringify(state.cities),
    researchData: JSON.stringify(state.research),
    selectedCityId: state.selectedCityId,
    incomeCollectedAt: state.lastIncomeCollectedAt === undefined ? null : String(state.lastIncomeCollectedAt),
    conquestAt: state.lastConquestAt === undefined ? null : String(state.lastConquestAt),
    luoyangBoxes: saveInt(state.luoyangBoxes),
    lastLuoyangReward: state.lastLuoyangReward === undefined ? null : saveInt(state.lastLuoyangReward, 100),
    luoyangRewardWeekKey: state.luoyangRewardWeekKey ?? null,
    factionWarScore: saveInt(state.factionWarScore),
    equipmentData: JSON.stringify(state.equipmentInventory),
    equipmentLoadoutsData: JSON.stringify(state.equipmentLoadouts),
    selectedEquipmentGeneralId: state.selectedEquipmentGeneralId,
    mythicFragments: saveInt(state.mythicFragments),
    duelAttemptsToday: saveInt(state.duelAttemptsToday, 5),
    duelDayKey: state.duelDayKey,
    prelaunchGoldDayKey: state.prelaunchGoldDayKey,
    scenarioData: JSON.stringify(state.scenarioCleared),
  }
}

// 서버 입력 검증(zod) 오류는 JSON 배열로 온다. 원문 대신 어느 항목이 문제인지만 보여 준다.
function describeSaveError(message: string): string {
  try {
    const issues = JSON.parse(message) as Array<{ path?: unknown[]; code?: string }>
    if (Array.isArray(issues) && issues.length) {
      const fields = [...new Set(issues.map(issue => (issue.path ?? []).join('.') || issue.code || '?'))]
      return `저장 값 확인 필요: ${fields.join(', ').slice(0, 80)}`
    }
  } catch { /* 일반 오류 메시지 */ }
  return message.slice(0, 80)
}

function queueAccountSave(immediate = false): void {
  persistLocalGame()
  localSaveDirty = true
  saveRevision += 1
  if (authView.status !== 'authenticated') return
  if (saveInFlight) {
    saveQueued = true
    return
  }
  if (saveTimer !== null) window.clearTimeout(saveTimer)
  if (immediate) {
    saveTimer = null
    void flushAccountSave()
    return
  }
  const delay = saveRetryCount ? Math.min(10_000, 650 * (2 ** Math.min(saveRetryCount - 1, 4))) : 650
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    void flushAccountSave()
  }, delay)
}

async function flushAccountSave(): Promise<void> {
  if (authView.status !== 'authenticated') return
  if (saveInFlight) {
    saveQueued = true
    return
  }
  const revisionAtStart = saveRevision
  saveInFlight = true
  try {
    await ManusAuth.mutate('account.saveGameState', accountStatePayload())
    saveRetryCount = 0
    if (saveRevision === revisionAtStart) localSaveDirty = false
  } catch (error) {
    saveRetryCount += 1
    saveQueued = true
    if (saveRetryCount >= 3) {
      const reason = error instanceof Error && error.message ? ` · ${describeSaveError(error.message)}` : ''
      ui.notify(`온라인 저장이 지연되고 있습니다. 로컬 저장 후 자동 재시도합니다.${reason}`, 'ember')
    }
  } finally {
    saveInFlight = false
    if (saveQueued) {
      saveQueued = false
      queueAccountSave()
    }
  }
}

function flushPendingSaveOnHide(): void {
  if (!localSaveDirty) return
  persistLocalGame()
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
  void flushAccountSave()
}

window.addEventListener('pagehide', flushPendingSaveOnHide)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPendingSaveOnHide()
})

async function saveAccountName(name: string): Promise<void> {
  const normalized = name.trim()
  if (!normalized) {
    ui.notify('표시 이름을 입력해 주세요.', 'ember')
    return
  }
  try {
    const account = await ManusAuth.mutate('account.updateName', { name: normalized }) as AccountView
    accountView = account
    authView = { status: 'authenticated', name: account.name }
    ui.setAccount(accountView)
    ui.setAuth(authView)
    ui.render(state)
    ui.notify('계정 표시 이름을 저장했습니다.')
  } catch (error) {
    const message = error instanceof Error ? error.message : '계정 정보 저장에 실패했습니다.'
    ui.notify(message, 'ember')
  }
}

async function refreshAdminBoard(): Promise<void> {
  try {
    const result = await ManusAuth.query('admin.boardSettings') as AdminBoardState
    ui.setAdminBoard(result)
    ui.render(state)
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : '게시판 운영 정보를 불러오지 못했습니다.', 'ember')
  }
}

async function setAdminBoardPosting(enabled: boolean): Promise<void> {
  try {
    await ManusAuth.mutate('admin.setBoardPosting', { enabled })
    await refreshAdminBoard()
    ui.notify(enabled ? '일반 사용자의 게시글 작성을 허용했습니다.' : '일반 사용자의 게시글 작성을 제한했습니다.')
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : '게시판 작성 제한 설정에 실패했습니다.', 'ember')
  }
}

async function deleteAdminBoardPost(id: number): Promise<void> {
  try {
    await ManusAuth.mutate('admin.deleteBoardPost', { id })
    await refreshAdminBoard()
    ui.notify('관리자 권한으로 게시글을 삭제했습니다.', 'jade')
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : '관리자 게시글 삭제에 실패했습니다.', 'ember')
  }
}

async function refreshAdminAccounts(search = ''): Promise<void> {
  try {
    const accounts = await ManusAuth.query('admin.listUsers', search ? { search } : {}) as AccountView[]
    ui.setAdminAccounts(accounts)
    ui.render(state)
    ui.notify(`로그인 계정 ${accounts.length}명을 불러왔습니다.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '관리자 계정 목록을 불러오지 못했습니다.'
    ui.setAdminAccounts([], message.includes('FORBIDDEN') ? '관리자 권한이 확인되지 않았습니다.' : message)
    ui.render(state)
    ui.notify('계정 관리 API에 접근할 수 없습니다.', 'ember')
  }
}

async function changeAdminRole(id: number, role: 'user' | 'admin'): Promise<void> {
  try {
    await ManusAuth.mutate('admin.updateRole', { id, role })
    await refreshAdminAccounts()
    ui.notify(role === 'admin' ? '계정에 관리자 권한을 부여했습니다.' : '계정의 관리자 권한을 해제했습니다.')
  } catch (error) {
    const message = error instanceof Error ? error.message : '계정 권한 변경에 실패했습니다.'
    ui.notify(message, 'ember')
  }
}

async function refreshAdminGameData(): Promise<void> {
  try {
    const accounts = await ManusAuth.query('admin.listGameStates') as GameAccountView[]
    ui.setAdminGameAccounts(accounts)
    ui.render(state)
  } catch (error) {
    const message = error instanceof Error ? error.message : '게임 계정 데이터를 불러오지 못했습니다.'
    ui.setAdminGameAccounts([], message.includes('FORBIDDEN') ? '관리자 권한이 확인되지 않았습니다.' : message)
    ui.render(state)
  }
}

async function saveAdminGameData(data: GameAccountView['game']): Promise<void> {
  try {
    await ManusAuth.mutate('admin.updateGameState', data)
    await refreshAccount()
    await refreshAdminGameData()
    ui.notify('게임 계정 데이터를 저장했습니다.')
  } catch (error) {
    const message = error instanceof Error ? error.message : '게임 계정 데이터 저장에 실패했습니다.'
    ui.notify(message, 'ember')
  }
}

;(window as unknown as { __strategy: { state: StrategyState; arena: Arena; ui: StrategyUI } }).__strategy = { state, arena, ui }
