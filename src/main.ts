import './styles/main.css'
import { ManusAuth } from '../manus-auth.js'
import { createLeaderboardClient, type Result, type RunTicket } from '../leaderboard.js'
import { Arena } from './game/arena'
import {
  createInitialState,
  collectIncome,
  launchConquest,
  defendCity,
  launchFactionBattle,
  drawEquipment,
  enhanceEquipment,
  ensureEquipmentState,
  equipEquipment,
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
import { StrategyUI, type AccountView, type AuthView, type GameAccountView } from './ui/strategy-ui'

const root = document.querySelector<HTMLElement>('#ui')
const canvas = document.querySelector<HTMLCanvasElement>('#game')

if (!root || !canvas) throw new Error('Strategy game shell is incomplete')

const state: StrategyState = createInitialState()
ensureEquipmentState(state)
let arena: Arena
let pendingTicket: RunTicket | null = null
let authView: AuthView = { status: 'logged_out', name: null }
let accountView: AccountView | null = null
let saveTimer: number | null = null
let saveInFlight = false
let saveQueued = false

const leaderboard = createLeaderboardClient({
  identity: 'account',
  boardId: 'war-score-v1',
  rulesVersion: 'v1',
  auth: ManusAuth,
  storage: window.localStorage,
})

const ui = new StrategyUI(root, {
  onSection: (section: Section) => {
    state.section = section
    if (section === 'battle') arena.setGenerals(state.formation.map(id => findGeneral(state, id)).filter((general): general is NonNullable<typeof general> => Boolean(general)))
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
    arena.setGenerals(state.formation.map(item => findGeneral(state, item)).filter((general): general is NonNullable<typeof general> => Boolean(general)))
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
    state.section = 'battle'
    arena.setGenerals(state.formation.map(id => findGeneral(state, id)).filter((general): general is NonNullable<typeof general> => Boolean(general)))
    arena.startBattle()
    pendingTicket = null
    void leaderboard.beginRun().then(result => {
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
  onLogin: () => {
    void ManusAuth.login().catch(() => ui.notify('로그인은 저장된 체크포인트의 온라인 화면에서 사용할 수 있습니다.', 'ember'))
  },
  onLogout: () => {
    void ManusAuth.logout().then(session => {
      authView = { status: session.status, name: session.user?.name ?? null }
      accountView = null
      ui.setAccount(null)
      ui.setAuth(authView)
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
    ui.notify('Stripe 샌드박스 연결 준비 완료 · 이 프로토타입은 현금성 모집을 잠금 처리했습니다.')
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
    if (result.won) {
      state.wins += 1
      state.honor += 180
      state.silver += 1200
      state.resources.silver = state.silver
      state.lastNotice = `황혼의 관문을 돌파했습니다. 명망 +180 · 은전 +1,200`
    }
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
ui.render(state)

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
  if (authView.status === 'authenticated') void refreshAccount()
})

void ManusAuth.prepare().then(session => {
  authView = { status: session.status, name: session.user?.name ?? null }
  ui.setAuth(authView)
  if (authView.status === 'authenticated') void refreshAccount()
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
    const game = await ManusAuth.query('account.gameState') as { honor: number; silver: number; manuals: number; wins: number; battleScore: number; grain: number; wood: number; iron: number; influence: number; factionWarScore?: number; generals?: StrategyState['generals'] | null; formation?: string[] | null; cities?: StrategyState['cities'] | null; research?: StrategyState['research'] | null; equipmentInventory?: StrategyState['equipmentInventory'] | null; equipmentLoadouts?: StrategyState['equipmentLoadouts'] | null; selectedEquipmentGeneralId?: string | null; selectedCityId?: string | null; lastIncomeCollectedAt?: number; lastConquestAt?: number }
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
    ensureEquipmentState(state)
    accountView = account
    ui.setAccount(accountView)
    ui.render(state)
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
  }
}

function queueAccountSave(): void {
  if (authView.status !== 'authenticated') return
  if (saveInFlight) {
    saveQueued = true
    return
  }
  if (saveTimer !== null) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    void flushAccountSave()
  }, 650)
}

async function flushAccountSave(): Promise<void> {
  if (authView.status !== 'authenticated') return
  saveInFlight = true
  try {
    await ManusAuth.mutate('account.saveGameState', accountStatePayload())
  } catch {
    ui.notify('계정 진행 상황을 저장하지 못했습니다. 로컬 플레이는 계속됩니다.', 'ember')
  } finally {
    saveInFlight = false
    if (saveQueued) {
      saveQueued = false
      queueAccountSave()
    }
  }
}

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
