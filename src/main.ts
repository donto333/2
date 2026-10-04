import './styles/main.css'
import { ManusAuth } from '../manus-auth.js'
import { createLeaderboardClient, type Result, type RunTicket } from '../leaderboard.js'
import { Arena } from './game/arena'
import {
  createInitialState,
  allGenerals,
  collectIncome,
  launchConquest,
  defendCity,
  launchFactionBattle,
  drawEquipment,
  enhanceEquipment,
  equipmentBonus,
  ensureEquipmentState,
  purchaseMythicEquipment,
  consumeDuelAttempt,
  ensureDuelDailyState,
  equipEquipment,
  unequipEquipment,
  ensureCityRoster,
  ensureResearchRoster,
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
} from './game/strategy'
import { StrategyUI, type AccountView, type AuthView, type DuelOpponent, type GameAccountView } from './ui/strategy-ui'

const root = document.querySelector<HTMLElement>('#ui')
const canvas = document.querySelector<HTMLCanvasElement>('#game')

if (!root || !canvas) throw new Error('Strategy game shell is incomplete')

const LOCAL_GAME_SAVE_KEY = 'cheonharo.strategy.save.v2'
const GUEST_ACCESS_KEY = 'cheonharo.access.guest.v1'
const state: StrategyState = createInitialState()
let localSaveDirty = false

function persistLocalGame(): void {
  try {
    window.localStorage.setItem(LOCAL_GAME_SAVE_KEY, JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      honor: state.honor,
      silver: state.silver,
      manuals: state.manuals,
      wins: state.wins,
      battleScore: state.battleScore,
      resources: state.resources,
      generals: state.generals,
      formation: state.formation,
      cities: state.cities,
      research: state.research,
      selectedCityId: state.selectedCityId,
      lastIncomeCollectedAt: state.lastIncomeCollectedAt,
      lastConquestAt: state.lastConquestAt,
      factionWarScore: state.factionWarScore,
      equipmentInventory: state.equipmentInventory,
      equipmentLoadouts: state.equipmentLoadouts,
      selectedEquipmentGeneralId: state.selectedEquipmentGeneralId,
      mythicFragments: state.mythicFragments,
      duelAttemptsToday: state.duelAttemptsToday,
      duelDayKey: state.duelDayKey,
    }))
  } catch {
    // Private browsing and quota restrictions should not stop gameplay.
  }
}

function restoreLocalGame(): void {
  try {
    const raw = window.localStorage.getItem(LOCAL_GAME_SAVE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as Partial<StrategyState> & { version?: number; resources?: StrategyState['resources']; savedAt?: number }
    if (saved.version !== undefined && saved.version !== 2) return
    Object.assign(state, {
      honor: saved.honor,
      silver: saved.silver,
      manuals: saved.manuals,
      wins: saved.wins,
      battleScore: saved.battleScore,
      resources: saved.resources,
      generals: saved.generals,
      formation: saved.formation,
      cities: saved.cities,
      research: saved.research,
      selectedCityId: saved.selectedCityId,
      lastIncomeCollectedAt: saved.lastIncomeCollectedAt,
      lastConquestAt: saved.lastConquestAt,
      factionWarScore: saved.factionWarScore,
      equipmentInventory: saved.equipmentInventory,
      equipmentLoadouts: saved.equipmentLoadouts,
      selectedEquipmentGeneralId: saved.selectedEquipmentGeneralId,
      mythicFragments: saved.mythicFragments,
      duelAttemptsToday: saved.duelAttemptsToday,
      duelDayKey: saved.duelDayKey,
    })
  } catch {
    // Corrupt local data is ignored and replaced by the normal starter state.
  }
}

restoreLocalGame()
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
let duelActive = false
let gameAccess: 'member' | 'guest' | null = window.localStorage.getItem(GUEST_ACCESS_KEY) === '1' ? 'guest' : null
const duelDecks = new Map<string, ReturnType<typeof allGenerals>>()

function battleGenerals(): NonNullable<ReturnType<typeof findGeneral>>[] {
  return state.formation.map(id => {
    const general = findGeneral(state, id)
    if (!general) return null
    const bonus = equipmentBonus(state, id)
    return {
      ...general,
      leadership: general.leadership + bonus.leadership,
      martial: general.martial + bonus.martial,
      stratagem: general.stratagem + bonus.stratagem,
      speed: general.speed + bonus.speed,
      attack: general.attack + Math.round(bonus.martial * 0.45),
      defense: general.defense + Math.round(bonus.leadership * 0.35),
    }
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
  const catalog = allGenerals()
  const seed = [...opponent.id].reduce((sum, character) => sum + character.charCodeAt(0), opponent.score)
  const deck = [0, 1, 2].map(index => catalog[(seed + index * 17) % catalog.length])
  return deck.map(general => ({ ...general, level: Math.max(1, Math.min(30, Math.round(opponent.score / 1800) + (general.grade - 2))), stars: Math.max(1, Math.min(5, general.stars)) }))
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
  const result = await leaderboard.list(12)
  const opponents: DuelOpponent[] = result.ok && result.value.entries.length
    ? result.value.entries.map((entry, index) => ({ id: `user-${entry.rank}-${entry.displayName}-${index}`, displayName: entry.displayName, score: entry.score, isDummy: false }))
    : dummyDuelOpponents()
  duelDecks.clear()
  opponents.forEach(opponent => duelDecks.set(opponent.id, duelDeckFor(opponent)))
  ui.setDuelOpponents(opponents)
  ui.notify(result.ok && result.value.entries.length ? '온라인 지휘관 목록을 불러왔습니다.' : '온라인 유저가 없어 훈련용 더미 덱을 준비했습니다.')
}

const ui = new StrategyUI(root, {
  onSection: (section: Section) => {
    if (duelActive && section !== 'battle') {
      duelActive = false
      arena.stopBattle()
    }
    state.section = section
    if (section === 'battle') { duelActive = false; arena.setOpponentDeck(null); arena.setGenerals(battleGenerals()); ui.updateBattle(arena.getSnapshot()) }
    if (section === 'duel') {
      installDummyDuelOpponents()
      void refreshDuelOpponents()
    }
    ui.render(state)
    if (section === 'account') void refreshAccount()
    if (section === 'admin') {
      void refreshAdminAccounts()
      void refreshAdminGameData()
    }
  },
  onRecruit: count => {
    const result = recruit(state, count)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
    if (result.ok && result.general) void ui.playRecruitAnimation(result.general, count).then(() => {
      if (count === 10) ui.showRecruitResults(result.rewards)
    })
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
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) {
      queueAccountSave()
      ui.showEquipmentResults(result.rewards)
    }
  },
  onEquipmentEnhance: id => {
    const result = enhanceEquipment(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onEquipmentEquip: (generalId, itemId) => {
    const result = equipEquipment(state, generalId, itemId)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onEquipmentUnequip: (generalId, type) => {
    const result = unequipEquipment(state, generalId, type)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
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
  onConquest: id => {
    const result = launchConquest(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onDefense: id => {
    const result = defendCity(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok && result.won ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
  },
  onFactionBattle: id => {
    const result = launchFactionBattle(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok && result.won ? 'jade' : 'ember')
    if (result.ok) queueAccountSave()
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
  onBattleStart: () => {
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
    ui.render(state)
    ui.notify('작전 개시 · 지휘 명령을 선택하십시오.')
  },
  onBattleMove: index => {
    arena.commandMove(index)
    ui.updateBattle(arena.getSnapshot())
  },
  onBattleSkill: () => {
    arena.castSkill()
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
    arena.setOpponentDeck(deck)
    arena.setGenerals(battleGenerals())
    arena.startBattle()
    ui.render(state)
    ui.updateBattle(arena.getSnapshot())
    ui.notify('유저 대련을 시작했습니다. 상대 덱의 전력을 돌파하십시오.')
  },
  onGuestLogin: () => {
    gameAccess = 'guest'
    window.localStorage.setItem(GUEST_ACCESS_KEY, '1')
    ui.render(state)
    ui.notify('게스트 모드로 입장했습니다. 진행 데이터는 이 기기에 저장됩니다.')
  },
  onLogin: () => {
    void ManusAuth.login().catch(() => ui.notify('로그인은 저장된 체크포인트의 온라인 화면에서 사용할 수 있습니다.', 'ember'))
  },
  onLogout: () => {
    void ManusAuth.logout().then(session => {
      gameAccess = null
      window.localStorage.removeItem(GUEST_ACCESS_KEY)
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
  onStore: () => {
    state.section = 'shop'
    ui.render(state)
  },
  onShopPurchase: type => {
    const result = purchaseMythicEquipment(state, type)
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
})

arena = new Arena(canvas, {
  onEvent: message => ui.notify(message),
  onBattleEnd: result => {
    state.battleScore = Math.max(state.battleScore, result.score)
    const wasDuel = duelActive || arena.isDuelBattle()
    if (result.won) {
      state.wins += 1
      state.honor += wasDuel ? 120 : 180
      state.silver += wasDuel ? 600 : 1200
      state.resources.silver = state.silver
      if (wasDuel) state.mythicFragments += 1
      state.lastNotice = wasDuel ? '유저 대련에서 승리했습니다. 명망 +120 · 은전 +600 · 신화장비 조각 +1' : `황혼의 관문을 돌파했습니다. 명망 +180 · 은전 +1,200`
    }
    duelActive = false
    ui.render(state)
    ui.showBattleResult(result.won, result.score)
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
if (gameAccess) ui.render(state)
else ui.showAccessGate()

window.setInterval(() => {
  const snapshot = arena.getSnapshot()
  if (snapshot.active || state.section === 'battle') ui.updateBattle(snapshot)
}, 160)

window.addEventListener('manus-auth-change', (event: Event) => {
  const detail = (event as CustomEvent<{ status: AuthView['status']; user: { name: string | null } | null }>).detail
  authView = { status: detail.status, name: detail.user?.name ?? null }
  if (authView.status !== 'authenticated') {
    accountView = null
    ui.setAccount(null)
  }
  ui.setAuth(authView)
  if (authView.status === 'authenticated') {
    gameAccess = 'member'
    window.localStorage.removeItem(GUEST_ACCESS_KEY)
    ui.render(state)
    void refreshAccount()
  } else if (!gameAccess) {
    ui.showAccessGate()
  } else {
    ui.render(state)
  }
})

void ManusAuth.prepare().then(session => {
  authView = { status: session.status, name: session.user?.name ?? null }
  ui.setAuth(authView)
  if (authView.status === 'authenticated') {
    gameAccess = 'member'
    window.localStorage.removeItem(GUEST_ACCESS_KEY)
    ui.render(state)
    void refreshAccount()
  } else if (!gameAccess) {
    ui.showAccessGate()
  } else {
    ui.render(state)
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
  try {
    const account = await ManusAuth.query('account.me') as AccountView
    const game = await ManusAuth.query('account.gameState') as { honor: number; silver: number; manuals: number; wins: number; battleScore: number; grain: number; wood: number; iron: number; influence: number; factionWarScore?: number; generals?: StrategyState['generals'] | null; formation?: string[] | null; cities?: StrategyState['cities'] | null; research?: StrategyState['research'] | null; equipmentInventory?: StrategyState['equipmentInventory'] | null; equipmentLoadouts?: StrategyState['equipmentLoadouts'] | null; selectedEquipmentGeneralId?: string | null; mythicFragments?: number; duelAttemptsToday?: number; duelDayKey?: string; selectedCityId?: string | null; lastIncomeCollectedAt?: number; lastConquestAt?: number }
    if (!localSaveDirty) {
      Object.assign(state, { honor: game.honor, silver: game.silver, manuals: game.manuals, wins: game.wins, battleScore: game.battleScore })
      state.resources = { ...state.resources, grain: game.grain, silver: game.silver, wood: game.wood, iron: game.iron, influence: game.influence }
      if (Array.isArray(game.generals)) state.generals = game.generals
      if (Array.isArray(game.formation)) state.formation = game.formation
      if (Array.isArray(game.cities)) state.cities = game.cities
      ensureCityRoster(state)
      if (Array.isArray(game.research)) state.research = game.research
      ensureResearchRoster(state)
      if (typeof game.selectedCityId === 'string') state.selectedCityId = game.selectedCityId
      state.lastIncomeCollectedAt = game.lastIncomeCollectedAt
      state.lastConquestAt = game.lastConquestAt
      state.factionWarScore = game.factionWarScore ?? 0
      if (Array.isArray(game.equipmentInventory)) state.equipmentInventory = game.equipmentInventory
      if (game.equipmentLoadouts && typeof game.equipmentLoadouts === 'object') state.equipmentLoadouts = game.equipmentLoadouts
      if (typeof game.selectedEquipmentGeneralId === 'string') state.selectedEquipmentGeneralId = game.selectedEquipmentGeneralId
      state.mythicFragments = Math.max(0, Math.trunc(state.mythicFragments), Math.trunc(game.mythicFragments ?? 0))
      state.duelAttemptsToday = Math.max(0, Math.trunc(game.duelAttemptsToday ?? state.duelAttemptsToday))
      if (typeof game.duelDayKey === 'string') state.duelDayKey = game.duelDayKey
      ensureDuelDailyState(state)
      ensureEquipmentState(state)
      persistLocalGame()
    }
    accountView = account
    ui.setAccount(accountView)
    ui.render(state)
    if (localSaveDirty) void flushAccountSave()
  } catch {
    ui.notify('계정 정보를 불러오지 못했습니다. 로그인 상태를 확인해 주세요.', 'ember')
  }
}

function accountStatePayload() {
  return {
    honor: Math.trunc(state.honor),
    silver: Math.trunc(state.silver),
    manuals: Math.trunc(state.manuals),
    wins: Math.trunc(state.wins),
    battleScore: Math.trunc(state.battleScore),
    grain: Math.trunc(state.resources.grain),
    wood: Math.trunc(state.resources.wood),
    iron: Math.trunc(state.resources.iron),
    influence: Math.trunc(state.resources.influence),
    generalData: JSON.stringify(state.generals),
    formationData: JSON.stringify(state.formation),
    citiesData: JSON.stringify(state.cities),
    researchData: JSON.stringify(state.research),
    selectedCityId: state.selectedCityId,
    incomeCollectedAt: state.lastIncomeCollectedAt === undefined ? null : String(state.lastIncomeCollectedAt),
    conquestAt: state.lastConquestAt === undefined ? null : String(state.lastConquestAt),
    factionWarScore: Math.trunc(state.factionWarScore),
    equipmentData: JSON.stringify(state.equipmentInventory),
    equipmentLoadoutsData: JSON.stringify(state.equipmentLoadouts),
    selectedEquipmentGeneralId: state.selectedEquipmentGeneralId,
    mythicFragments: Math.trunc(state.mythicFragments),
    duelAttemptsToday: Math.trunc(state.duelAttemptsToday),
    duelDayKey: state.duelDayKey,
  }
}

function queueAccountSave(): void {
  persistLocalGame()
  localSaveDirty = true
  if (authView.status !== 'authenticated') return
  if (saveInFlight) {
    saveQueued = true
    return
  }
  if (saveTimer !== null) window.clearTimeout(saveTimer)
  const delay = saveRetryCount ? Math.min(10_000, 650 * (2 ** Math.min(saveRetryCount - 1, 4))) : 650
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    void flushAccountSave()
  }, delay)
}

async function flushAccountSave(): Promise<void> {
  if (authView.status !== 'authenticated') return
  saveInFlight = true
  try {
    await ManusAuth.mutate('account.saveGameState', accountStatePayload())
    saveRetryCount = 0
    localSaveDirty = false
  } catch {
    saveRetryCount += 1
    saveQueued = true
    if (saveRetryCount >= 3) ui.notify('온라인 저장이 지연되고 있습니다. 로컬 저장 후 자동 재시도합니다.', 'ember')
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
