import { cancelResearch, researchMods, rushResearch, settleResearch } from './game/research'
import './styles/fonts.css'
import './styles/main.css'
import './styles/theme-color.css'
import './styles/territory-map.css'
import './styles/mobile-type.css'
import { ManusAuth } from '../manus-auth.js'
import { createLeaderboardClient, type Result, type RunTicket } from '../leaderboard.js'
import { Arena } from './game/arena'
import { preloadStrikeModels } from './game/battle-models'
import { claimMission, closeTutorial, ensureMissions, recordMission, type MissionEvent } from './game/missions'
import { REPEAT_BATTLE_DAILY_LIMIT, REPEAT_BATTLE_HONOR, REPEAT_BATTLE_SILVER } from '../server/economy.mjs'
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
  migrateGeneralGrades, migrateLegacyStarterRoster, normalizeGeneralStats,
  ensurePrelaunchDailyGold,
  dayKey,
  FACTION_CAPITALS,
  findGeneral,
  recruit,
  selectCity,
  toggleFormation,
  setFormationSlot,
  upgradeMany,
  upgradeCost,
  unlockResearch,
  unlockSkill,
  upgrade,
  upgradeBuilding,
  type Section,
  type StrategyState,
  type FactionTerritorySnapshot,
  type Faction,
  clampGeneralLevels,
  MAX_GENERAL_LEVEL,
} from './game/strategy'
import { applyCombo } from './game/formation-advice'
import { StrategyUI, recordPurchase, type RaidView, type RaidInfoView, type LuoyangHistory, type AccountView, type AdminBoardState, type AuthView, type BoardPost, type CityDamageRanking, type DuelOpponent, type GameAccountView } from './ui/strategy-ui'
import { HARD_RULE_INFO, SCENARIOS, clearedScenarioCount, firstClearReward, hardClearReward, hardUnlocked, markHardCleared, recordHardStars, recordScenarioStars, scenarioById, scenarioEnemyIds, scenarioEnemyLevelFor, scenarioEnemyStars, scenarioHardRule, type ScenarioDefinition, type ScenarioDifficulty } from './game/scenarios'
import { dummyDuelDecks } from './game/duel'
import { raidBossDeck } from './game/raid'
import { RaidRunner } from './game/raid-run'
import { RAID_DAILY_LIMIT, RAID_DEFAULT_LEVEL, raidDayKey, raidResetIn, raidWeekKey } from '../server/raid.mjs'
import { autoEquipSquad, autoSquad, ensureSquads, packSquads, swapWithFirstSquad, toggleSquadMember, applySquadCombo } from './game/squads'
import { applyEquipmentPreset, bulkDismantle, dismantleEquipment, packLoadouts, saveEquipmentPreset, toggleEquipmentLock, unpackLoadouts } from './game/equipment-manage'
import { DUEL_MATCH_COUNT, DUEL_TIER_FRAGMENTS, DUEL_USER_THRESHOLD, duelDeckPower, duelTierFor, pickDuelMatches, type DuelTier } from '../server/duel-match.mjs'
import { autoEquip, autoFormation, withEquipmentStats, fullEquipmentSets, equipmentSetCounts, cityDefenseForLevel, scaleGeneral, templateGeneral } from './game/strategy'
import { locale } from './i18n/lang'
import { sound, type Sfx } from './engine/sound'
import { startDomTranslation, tr } from './i18n/translate'
import { BattleCoach, Coach, markMenusSeen, maybeMenuTour, openBattleGuide, resetCoaching } from './ui/coach'
import { ONBOARD_GEAR_COST, Onboarding } from './ui/onboarding'

const root = document.querySelector<HTMLElement>('#ui')
const canvas = document.querySelector<HTMLCanvasElement>('#game')

if (!root || !canvas) throw new Error('Strategy game shell is incomplete')
startDomTranslation()

const LOCAL_GAME_SAVE_KEY = 'cheonharo.strategy.save.member.v2'
const GUEST_GAME_SAVE_KEY = 'cheonharo.strategy.save.guest.v2'
const GUEST_ACCESS_KEY = 'cheonharo.access.guest.v1'
const PENDING_TERRITORY_BATTLES_KEY = 'cheonharo.territory.pending-battles.v1'
// 모바일 브라우저·앱 안 웹뷰는 100vh가 주소창·상단 바까지 포함해 화면 아래가 잘린다: 실제 보이는 높이를 CSS 변수로 넘긴다
/** 결과가 성공일 때만 내는 효과음(실패는 알림이 붉은색일 때 따로 난다) */
function playSfx(name: Sfx): void { sound.play(name) }

/** 최고 레벨을 넘은 무장을 맞추고 알린다(돌려준 재료 포함) */
function noticeLevelCap(): boolean {
  const capped = clampGeneralLevels(state)
  if (!capped.generals.length) return false
  const message = `최고 레벨이 Lv.${MAX_GENERAL_LEVEL}으로 정해졌습니다 · ${capped.generals.join(' · ')} → Lv.${MAX_GENERAL_LEVEL} · 넘은 만큼 은전 +${capped.silver.toLocaleString('ko-KR')} · 병서 +${capped.manuals.toLocaleString('ko-KR')} 반환`
  state.lastNotice = message
  window.setTimeout(() => ui.notify(message, 'jade'), 2600)
  return true
}

function syncAppHeight(): void {
  document.documentElement.style.setProperty('--app-h', `${Math.round(window.innerHeight)}px`)
}
syncAppHeight()
// 소리: 브라우저는 첫 터치/클릭 뒤에만 소리를 허락한다. 그때 본영 곡을 시작한다
{
  const unlockSound = () => { sound.unlock(); window.removeEventListener('pointerdown', unlockSound, true); window.removeEventListener('keydown', unlockSound, true) }
  window.addEventListener('pointerdown', unlockSound, true)
  window.addEventListener('keydown', unlockSound, true)
}
window.addEventListener('resize', syncAppHeight)
window.addEventListener('orientationchange', () => window.setTimeout(syncAppHeight, 250))
window.visualViewport?.addEventListener('resize', syncAppHeight)

const state: StrategyState = createInitialState()

// Steam 데스크톱 버전: 진행도에 따라 업적을 해금한다 (웹에서는 아무 일도 하지 않음).
function syncSteam(): void {
  syncSteamAchievements({ wins: state.wins, generalCount: state.generals.length, scenarioClearedCount: clearedScenarioCount(state.scenarioCleared) })
}
if (isSteamDesktop()) window.setInterval(syncSteam, 5000)
let localSaveDirty = false
/** 게스트 기록을 지우는 중이면 더는 저장하지 않는다 */
let guestResetting = false
let pendingResearchRefund: string | null = null
/** 연구 체계를 맞추고, 예전 연구를 환급했다면 알림을 예약한다 */
function syncResearchRoster(): void {
  const refund = ensureResearchRoster(state)
  if (!refund) return
  const labels: Record<string, string> = { grain: '식량', silver: '은전', wood: '목재', iron: '철', influence: '영향력' }
  pendingResearchRefund = `기술 연구가 5분야 6단계 체계로 바뀌어 예전 연구 자원을 돌려드렸습니다 · ${Object.entries(refund).map(([key, value]) => `${labels[key] ?? key} ${new Intl.NumberFormat(locale()).format(value ?? 0)}`).join(' · ')}`
  localSaveDirty = true
}

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
  if (guestResetting) return
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
      equipmentPresets: state.equipmentPresets,
      reserveSquads: state.reserveSquads,
      raidLocal: state.raidLocal,
      selectedEquipmentGeneralId: state.selectedEquipmentGeneralId,
      mythicFragments: state.mythicFragments,
      mythicStones: state.mythicStones,
      missions: state.missions,
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
      equipmentPresets: saved.equipmentPresets,
      reserveSquads: saved.reserveSquads,
      raidLocal: saved.raidLocal,
      selectedEquipmentGeneralId: saved.selectedEquipmentGeneralId,
      mythicFragments: saved.mythicFragments,
      mythicStones: saved.mythicStones,
      missions: saved.missions,
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
syncResearchRoster()
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
/** 진행 중인 레이드 도전: 1군 → 2군 → 3군 순서로 싸우고 피해를 모은다 */
let raidRun: { token: string | null; weekKey: string; bossLevel: number; runner: RaidRunner } | null = null
let raidView: RaidView = { loading: false, info: null, ranking: [], message: '' }
/** 대련 상대별 난이도와 지금 겨루는 상대의 난이도(승리 보상 조각 수) */
const duelTiers = new Map<string, DuelTier>()
let duelTier: DuelTier = 'normal'
let scenarioActive = false
let activeScenario: ScenarioDefinition | null = null
let activeDifficulty: ScenarioDifficulty = 'normal'
/** 회원 진행(서버)을 불러왔는가: 튜토리얼은 이것을 기다린다 */
let accountLoaded = false
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
  syncResearchRoster()
  ensureEquipmentState(state)
  ensureSquads(state)
  // 회원의 일일 금화는 서버가 지급한다(serverGrant('daily')).
  const receivedDailyGold = mode === 'guest' ? ensurePrelaunchDailyGold(state) : false
  const migratedStarter = migrateLegacyStarterRoster(state)
  // 무장 등급 재설정(2026.10): 보유 무장을 새 등급으로 옮기고 내려간 무장은 옥패로 보상
  const regraded = migrateGeneralGrades(state).changed > 0
  if (regraded) { const message = state.lastNotice; window.setTimeout(() => ui.notify(message), 1800) }
  // 유형별 성장(2026.10): 보유 무장 능력치를 새 성장 공식으로 다시 계산(레벨·성급·장비 유지)
  // 최고 레벨 60(2026.10.15): 넘은 무장은 60으로, 넘은 만큼의 은전·병서는 돌려준다
  const capped = noticeLevelCap()
  const regrown = normalizeGeneralStats(state) > 0 || capped
  if (receivedDailyGold || migratedStarter || normalizedTerritories || regraded || regrown) persistLocalGame()
  localSaveDirty = (receivedDailyGold || migratedStarter || normalizedTerritories || regraded || regrown) && mode === 'guest'
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

function battleGenerals(ids: string[] = state.formation): NonNullable<ReturnType<typeof findGeneral>>[] {
  const mods = researchMods(state)
  // 전투 규칙에 연구(강병·지략) 보정을 함께 넘긴다
  arena?.setResearch(mods.battle)
  const boost = 1 + mods.formationStats // 천하 인재: 출전 무장 능력치 +3%
  return ids.map(id => {
    const general = findGeneral(state, id)
    if (!general) return null
    const equipped = withEquipmentStats(general, equipmentBonus(state, id), fullEquipmentSets(equipmentSetCounts(state, id)))
    if (boost === 1) return equipped
    return { ...equipped, leadership: Math.round(equipped.leadership * boost), martial: Math.round(equipped.martial * boost), stratagem: Math.round(equipped.stratagem * boost), speed: Math.round(equipped.speed * boost), attack: Math.round(equipped.attack * boost), defense: Math.round(equipped.defense * boost) }
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

// ── 주간 레이드 ─────────────────────────────────────────────
/** 레이드에 나갈 군(비어 있지 않은 1·2·3군) */
function raidSquads(): Array<{ index: number; ids: string[] }> {
  ensureSquads(state)
  return [state.formation, ...(state.reserveSquads ?? [])].map((list, index) => ({ index, ids: list.filter(id => state.generals.some(general => general.id === id)) })).filter(squad => squad.ids.length)
}

function localRaidInfo(): RaidInfoView {
  const weekKey = raidWeekKey(), today = raidDayKey()
  const local = state.raidLocal && state.raidLocal.weekKey === weekKey ? state.raidLocal : { dayKey: today, attempts: 0, weekKey, total: 0, best: 0 }
  const used = local.dayKey === today ? local.attempts : 0
  return { weekKey, bossLevel: RAID_DEFAULT_LEVEL, registered: 0, participants: 0, attemptsLeft: Math.max(0, RAID_DAILY_LIMIT - used), dailyLimit: RAID_DAILY_LIMIT, totalDamage: local.total, bestDamage: local.best, attempts: 0, rank: 0, lastWeek: null, offline: true, resetIn: raidResetIn() }
}

async function refreshRaid(): Promise<void> {
  if (authView.status !== 'authenticated') {
    raidView = { loading: false, info: localRaidInfo(), ranking: [], message: '게스트는 연습 모드입니다. 로그인하면 순위와 주간 보상이 기록됩니다.' }
    ui.setRaidView(raidView)
    return
  }
  raidView = { ...raidView, loading: true }
  ui.setRaidView(raidView)
  try {
    const [info, ranking] = await Promise.all([
      ManusAuth.query('raid.info') as Promise<Omit<RaidInfoView, 'offline' | 'resetIn'>>,
      ManusAuth.query('raid.ranking', { limit: 100 }) as Promise<{ rows: RaidView['ranking'] }>,
    ])
    raidView = { loading: false, info: { ...info, offline: false, resetIn: raidResetIn() }, ranking: ranking.rows, message: '' }
  } catch {
    raidView = { loading: false, info: localRaidInfo(), ranking: [], message: '레이드 서버에 연결하지 못해 연습 모드로 보여 줍니다(기록·보상 없음).' }
  }
  ui.setRaidView(raidView)
}

function startRaidBattle(): void {
  if (!raidRun || raidRun.runner.finished) return
  // 이미 다음 군이 싸우는 중이면(버튼과 자동 출전이 겹친 경우) 다시 시작하지 않는다
  if (arena.getSnapshot().active) return
  ui.closeRaidStep()
  ui.raidSquadLabel = `${raidRun.runner.currentLabel} ${raidRun.runner.index + 1}/${raidRun.runner.count}`
  const ids = raidRun.runner.currentIds
  duelActive = false
  scenarioActive = false
  activeScenario = null
  state.section = 'battle'
  ui.setBattleAutoAvailable(true) // 자동 전투: 직접보다 약하게(정확도 70% · 스킬 한 박자 늦게) 모든 전투에서(대련 제외)
  arena.setOpponentDeck(raidBossDeck(raidRun.bossLevel, raidRun.weekKey), 'raid')
  arena.setGenerals(battleGenerals(ids))
  arena.startBattle()
  pendingTicket = null
  ui.updateBattle(arena.getSnapshot())
  ui.render(state)
  ui.updateBattle(arena.getSnapshot())
  ui.notify(`레이드 · ${raidRun.runner.currentLabel} 출전 (${raidRun.runner.index + 1}/${raidRun.runner.count}) · 90초 동안 최대한 피해를 주십시오.`)
}

async function beginRaid(fillEmpty = false): Promise<void> {
  if (raidRun) return
  // 2·3군이 비어 있으면 먼저 물어본다(남은 무장으로 자동 편성하거나 그대로 출전)
  ensureSquads(state)
  const empty = (state.reserveSquads ?? []).map((list, index) => list.length ? -1 : index + 1).filter(index => index > 0)
  const spare = state.generals.length - state.formation.length - (state.reserveSquads ?? []).reduce((sum, list) => sum + list.length, 0)
  if (fillEmpty) {
    empty.forEach(index => { autoSquad(state, index); autoEquipSquad(state, index) })
    queueAccountSave(true)
  } else if (empty.length && spare > 0) {
    ui.askRaidSquads(empty.map(index => ['1군', '2군', '3군'][index]), spare, choice => { if (choice === 'fill') void beginRaid(true); else if (choice === 'go') void beginRaidAsIs(); else { state.section = 'formation'; ui.render(state) } })
    return
  }
  await beginRaidAsIs()
}

async function beginRaidAsIs(): Promise<void> {
  if (raidRun) return
  const squads = raidSquads()
  if (!squads.length) { ui.notify('출전 편성이 없습니다.', 'ember'); return }
  const weekKey = raidWeekKey()
  if (authView.status === 'authenticated' && !raidView.info?.offline) {
    try {
      // 서버는 저장된 1·2·3군 전력으로 피해 상한을 잡으므로 먼저 지금 편성을 저장한다
      persistLocalGame()
      await ManusAuth.mutate('account.saveGameState', accountStatePayload())
      const started = await ManusAuth.mutate('raid.start') as { ok: boolean; reason?: string; token?: string; weekKey?: string; bossLevel?: number }
      if (!started.ok || !started.token) { ui.notify(started.reason ?? '레이드를 시작하지 못했습니다.', 'ember'); void refreshRaid(); return }
      raidRun = { token: started.token, weekKey: started.weekKey ?? weekKey, bossLevel: started.bossLevel ?? RAID_DEFAULT_LEVEL, runner: new RaidRunner(squads) }
    } catch {
      ui.notify('레이드 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도하십시오.', 'ember')
      return
    }
  } else {
    const info = localRaidInfo()
    if (info.attemptsLeft <= 0) { ui.notify('오늘 레이드 연습을 모두 했습니다(하루 3회).', 'ember'); return }
    const today = raidDayKey()
    const local = state.raidLocal && state.raidLocal.weekKey === weekKey ? state.raidLocal : { dayKey: today, attempts: 0, weekKey, total: 0, best: 0 }
    state.raidLocal = { ...local, dayKey: today, attempts: (local.dayKey === today ? local.attempts : 0) + 1 }
    persistLocalGame()
    raidRun = { token: null, weekKey, bossLevel: RAID_DEFAULT_LEVEL, runner: new RaidRunner(squads) }
  }
  startRaidBattle()
}

/** 한 군의 전투가 끝났을 때: 다음 군이 있으면 이어서, 없으면 합계를 기록 */
function onRaidSquadEnd(result: { raidDamage?: number }): void {
  if (!raidRun) return
  const step = raidRun.runner.record(result.raidDamage ?? 0)
  ui.updateBattle(arena.getSnapshot())
  if (step.next) {
    // 군 사이: 방금 군의 피해와 다음 군을 보여 주고 이어서 출전(버튼 또는 5초 뒤 자동)
    const next = step.next
    const names = next.ids.map(id => state.generals.find(general => general.id === id)?.name ?? '').filter(Boolean)
    ui.showRaidStep({ finishedLabel: step.finished.label, damage: step.finished.damage, total: step.total, nextLabel: next.label, nextNames: names, step: next.index + 1, count: raidRun.runner.count }, () => startRaidBattle())
    return
  }
  void finishRaidRun()
}

async function finishRaidRun(): Promise<void> {
  const run = raidRun
  raidRun = null
  ui.raidSquadLabel = ''
  if (!run) return
  const total = run.runner.total
  const parts = run.runner.summary()
  let message = `레이드 종료 · 합계 피해 ${total.toLocaleString('ko-KR')} (${parts})`
  if (run.token) {
    try {
      const submitted = await ManusAuth.mutate('raid.submit', { token: run.token, damages: run.runner.damages }) as { ok: boolean; reason?: string; added?: number; capped?: boolean; totalDamage?: number; rank?: number }
      message = submitted.ok
        ? `${message} · 이번 주 누적 ${(submitted.totalDamage ?? 0).toLocaleString('ko-KR')} · ${submitted.rank ?? '-'}위${submitted.capped ? ` · 상한 적용(${(submitted.added ?? 0).toLocaleString('ko-KR')})` : ''}`
        : `${message} · 기록 실패: ${submitted.reason ?? ''}`
    } catch {
      message = `${message} · 서버 기록 실패(연결 끊김)`
    }
  } else if (state.raidLocal) {
    state.raidLocal = { ...state.raidLocal, total: state.raidLocal.total + total, best: Math.max(state.raidLocal.best, total) }
    persistLocalGame()
    message = `${message} · 연습 기록(순위·보상 없음)`
  }
  mission('battleWin')
  state.section = 'raid'
  state.lastNotice = message
  ui.render(state)
  ui.notify(message, 'jade')
  void refreshRaid()
}

async function claimRaidReward(): Promise<void> {
  try {
    const result = await ManusAuth.mutate('raid.claim') as { ok: boolean; reason?: string; rank?: number; gold: number; stones: number }
    if (!result.ok) { ui.notify(result.reason ?? '받을 보상이 없습니다.', 'ember'); return }
    state.gold += result.gold
    state.mythicStones += result.stones
    queueAccountSave(true)
    ui.render(state)
    ui.notify(`지난주 레이드 ${result.rank}위 보상 · 금화 +${result.gold}${result.stones ? ` · 낙양 강화석 +${result.stones}` : ''} (서버 지급)`, 'jade')
    playSfx('reward')
    void refreshRaid()
  } catch {
    ui.notify('보상을 받지 못했습니다. 잠시 뒤 다시 시도하십시오.', 'ember')
  }
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

/** 덱을 저장한 지휘관이 적을 때: 내 덱 전력(장비 포함)에 맞춘 훈련 상대 3팀(쉬움 90% · 보통 100% · 어려움 110%) */
function dummyDuelOpponents(): DuelOpponent[] {
  return dummyDuelDecks(battleGenerals(), dayKey()).map(dummy => ({ id: dummy.id, displayName: dummy.displayName, score: 0, power: dummy.power, tier: dummy.tier, isDummy: true, note: dummy.note, deck: dummy.deck }))
}

function installDummyDuelOpponents(): void {
  installDuelOpponents(dummyDuelOpponents())
}

function installDuelOpponents(opponents: DuelOpponent[]): void {
  const myPower = duelDeckPower(battleGenerals())
  // 실제 유저 상대는 내 덱과의 전력 차이로 난이도(보상)를 정한다
  opponents = opponents.map(opponent => ({ ...opponent, tier: opponent.tier ?? duelTierFor(opponent.power ?? duelDeckPower(opponent.deck ?? []), myPower) }))
  duelTiers.clear()
  opponents.forEach(opponent => duelTiers.set(opponent.id, opponent.tier ?? 'normal'))
  duelDecks.clear()
  opponents.forEach(opponent => duelDecks.set(opponent.id, duelDeckFor(opponent)))
  ui.setDuelOpponents(opponents, duelDeckPower(battleGenerals()))
}

/**
 * 대련 상대: 덱을 저장한 지휘관이 20명 이상이면 내 덱 전력과 비슷한 실제 유저 덱, 적으면 내 전력에 맞춘 훈련 상대.
 * (옛 서버는 배열을 돌려준다: 그때도 전력이 가까운 순으로 고른다)
 */
async function refreshDuelOpponents(): Promise<void> {
  if (authView.status === 'authenticated') {
    const myPower = duelDeckPower(battleGenerals())
    try {
      const response = await ManusAuth.query('duel.listOpponents', { limit: DUEL_MATCH_COUNT, power: myPower }) as DuelOpponent[] | { mode: 'users' | 'dummy'; registered: number; threshold: number; opponents: DuelOpponent[] }
      if (Array.isArray(response)) {
        if (response.length >= DUEL_USER_THRESHOLD - 1) {
          installDuelOpponents(pickDuelMatches(response.map(opponent => ({ ...opponent, power: opponent.power ?? duelDeckPower(opponent.deck ?? []) })), myPower))
          ui.notify('전력이 비슷한 지휘관 덱을 불러왔습니다.')
          return
        }
      } else if (response.mode === 'users' && response.opponents.length) {
        installDuelOpponents(response.opponents)
        ui.notify(`전력이 비슷한 지휘관 덱을 불러왔습니다 · 등록 지휘관 ${response.registered}명`)
        return
      } else {
        installDummyDuelOpponents()
        ui.notify(`등록 지휘관이 ${response.registered}명이라 내 전력에 맞춘 훈련 상대를 준비했습니다(${response.threshold}명부터 실제 유저 덱).`)
        return
      }
    } catch {
      // An unavailable authenticated endpoint falls through to the safe training roster.
    }
    installDummyDuelOpponents()
    ui.notify('내 전력에 맞춘 훈련 상대를 준비했습니다.')
    return
  }
  installDummyDuelOpponents()
  ui.notify('게스트는 내 전력에 맞춘 훈련 상대와 겨룹니다.')
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
    await claimLuoyangReward()
    // 재기록된 세력전 점령이 있으면 서버가 적립한 금화를 받아 온다
    if (retried) await serverGrant('faction', undefined, researchMods(state).factionGold)
    persistLocalGame()
    ui.setTerritorySync(`서버 원장 · ${new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date())}`)
    ui.render(state)
    if (notify) ui.notify(`전역 영토 원장 동기화 완료 · ${merged}개 도시 반영${retried ? ` · 대기 전투 ${retried}건 재기록` : ''}`, 'jade')
  } catch {
    ui.setTerritorySync('서버 원장 연결 대기')
    if (notify) ui.notify('서버 원장 연결이 지연되고 있습니다. 로컬 작전 결과는 보존되며 다시 시도합니다.', 'jade')
  }
}

/** 바뀐 규칙 안내: 이 기기에서 이 판을 아직 안 봤으면 접속 때 한 번 보여 준다 */
const NOTICE_ID = '2026-10-13c'
const NOTICE_ITEMS: Array<[string, string]> = [
  ['재화 밸런스', '시나리오 보상이 금화 중심으로 바뀌었습니다. 상점에서 금화로 병서(레벨업 재료)를 살 수 있습니다. 일반 전투 보상은 하루 5회까지입니다.'],
  ['보유 무장 · 도감', '초상이 잘리지 않는 카드, 병과·등급 필터, 연속 강화, 출전 자리 교체 창이 생겼습니다. 도감에서 이름으로 무장을 찾을 수 있습니다.'],
  ['출전 편성', '좌·중·우 자리마다 다음 시나리오 적장과의 병종 상성(유리·불리)을 보여 줍니다.'],
  ['기술 연구 · 영토', '연구소가 비면 추천 연구를 바로 시작할 수 있고, PC 영토 화면은 지도와 도시 정보를 나란히 보여 줍니다.'],
  ['글꼴 · 화면', '모든 기기에서 같은 한글 글꼴로 보이고, 전투 밖 배경과 PC 전투 화면이 새로워졌습니다.'],
  ['기술 연구 개편 · 신화장비 강화', '연구는 5분야 6단계(5분~8시간)로, 신화장비는 낙양 강화석으로만 강화합니다.'],
]
function showNoticeOnce(): void {
  try { if (window.localStorage.getItem('cheonharo.noticeSeen') === NOTICE_ID) return } catch { return }
  // 처음 시작한 사람에게는 '바뀐 점' 대신 따라하기 안내를 보여 준다
  if (state.scenarioCleared.length === 0) { try { window.localStorage.setItem('cheonharo.noticeSeen', NOTICE_ID) } catch { /* 무시 */ } return }
  ui.showNoticePopup(NOTICE_ITEMS, () => { try { window.localStorage.setItem('cheonharo.noticeSeen', NOTICE_ID) } catch { /* 무시 */ } })
}

/** 임무 진행: 목표를 채우면 알려 주고 본영에서 받게 한다 */
function mission(event: MissionEvent, amount = 1): void {
  const done = recordMission(state, event, amount)
  if (done.length) ui.notify(`임무 달성 · ${done.join(' · ')} — 본영에서 보상을 받으십시오`, 'jade')
}

/** 연구가 끝났을 때 다른 탭을 보고 있으면 브라우저 알림과 탭 제목으로 알려 준다 */
function notifyResearchDone(names: string[]): void {
  if (typeof document === 'undefined' || !document.hidden) return
  const text = `연구 완료 · ${names.join(' · ')}`
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(tr('천하: 기술 연구 완료'), { body: tr(text), icon: '/assets/ui/brand-seal.svg' })
  } catch { /* 알림을 못 쓰는 환경 */ }
  const original = document.title.replace(/^\(완료\) /, '')
  document.title = `(완료) ${original}`
  const restore = () => { document.title = original; document.removeEventListener('visibilitychange', restore) }
  document.addEventListener('visibilitychange', restore)
}

/** 연구를 처음 시작할 때 한 번만 알림 허용을 묻는다 */
function askNotificationOnce(): void {
  try {
    if (!('Notification' in window) || Notification.permission !== 'default') return
    if (window.localStorage.getItem('cheonharo.notifyAsked')) return
    window.localStorage.setItem('cheonharo.notifyAsked', '1')
    void Notification.requestPermission()
  } catch { /* 무시 */ }
}

/** 결과 화면의 "승패 요인": 연구 · 병종 상성 · 장비 · 인연, 지면 다음에 키울 것 하나를 권한다 */
function battleFactors(won: boolean): Array<{ label: string; text: string; tone: 'good' | 'bad' | 'neutral' }> {
  const factors: Array<{ label: string; text: string; tone: 'good' | 'bad' | 'neutral' }> = []
  const battleResearch = state.research.filter(node => node.unlocked && (node.branch === '강병' || node.branch === '지략'))
  factors.push(battleResearch.length
    ? { label: '전투 연구', text: `${battleResearch.length}개 적용 · ${battleResearch.slice(0, 3).map(node => node.name).join(', ')}${battleResearch.length > 3 ? ' 외' : ''}`, tone: 'good' }
    : { label: '전투 연구', text: '적용된 강병·지략 연구가 없습니다', tone: 'bad' })
  const edge = arena.matchupSummary()
  factors.push({ label: '병종 상성', text: edge.adv || edge.dis ? `유리 ${edge.adv}레인 · 불리 ${edge.dis}레인` : '상성 차이 없음', tone: edge.adv > edge.dis ? 'good' : edge.dis > edge.adv ? 'bad' : 'neutral' })
  const slots = state.formation.reduce((sum, id) => sum + Object.keys(state.equipmentLoadouts[id] ?? {}).length, 0)
  factors.push({ label: '장비', text: `출전 무장 장착 ${slots}/${state.formation.length * 3}칸`, tone: slots >= state.formation.length * 2 ? 'good' : 'bad' })
  const bond = arena.getSnapshot().bond
  factors.push({ label: '인연', text: bond ? bond.split(' · ')[0] : '발동한 인연 없음', tone: bond ? 'good' : 'neutral' })
  if (!won) {
    const advice = !battleResearch.length ? '기술 연구에서 강병 1단계(오부 훈련)부터 시작해 보십시오.'
      : edge.dis > edge.adv ? '출전 편성에서 레인 순서를 바꿔 상성이 유리하게 맞서도록 해 보십시오.'
      : slots < state.formation.length * 2 ? '장비 관리에서 "자동 장착"으로 빈 칸을 채워 보십시오.'
      : '무장 레벨업과 장비 강화로 전투력을 올려 보십시오.'
    factors.push({ label: '다음 한 수', text: advice, tone: 'neutral' })
  }
  return factors
}

function isMember(): boolean {
  return authView.status === 'authenticated' && gameAccess === 'member'
}

/**
 * 금화·신화 조각은 서버 원장이 기준이다(저장은 줄이는 것만 반영된다).
 * 회원이 받을 보상은 서버에 요청해 서버가 확인·지급한 만큼만 화면에 더한다.
 */
async function serverGrant(kind: 'daily' | 'scenario' | 'faction' | 'duel', key?: string, bonus?: number): Promise<void> {
  if (!isMember()) return
  try {
    const result = await ManusAuth.mutate('account.grant', { kind, ...(key ? { key } : {}), ...(bonus ? { bonus: Math.min(1, Math.max(0, bonus)) } : {}) }) as { granted: number; fragments: number; reason: string }
    if (!result.granted && !result.fragments) return
    state.gold += Math.max(0, Math.trunc(result.granted))
    state.mythicFragments += Math.max(0, Math.trunc(result.fragments))
    if (kind === 'daily') state.prelaunchGoldDayKey = dayKey()
    queueAccountSave(true)
    ui.render(state)
    const label = kind === 'daily' ? '오늘의 금화' : kind === 'scenario' ? '시나리오 최초 클리어' : kind === 'faction' ? '세력전 승리' : '유저 대련 승리'
    ui.notify(`${label} · ${result.granted ? `금화 +${result.granted}` : ''}${result.fragments ? `신화장비 조각 +${result.fragments}` : ''} (서버 지급)`, 'jade')
  } catch {
    // 연결이 끊기면 서버가 아직 지급하지 않은 것이므로 다음 기회에 다시 받는다(일일 금화·세력전 적립분).
  }
}

/**
 * 주간 낙양전 보상: 서버가 승리 진영 유저에게 지급하고 보상 주차를 기록한다.
 * 서버 주차가 이 기기에서 아는 주차와 다르면 새 보상이므로 금화·낙양 상자·낙양 강화석을 반영한다.
 */
async function claimLuoyangReward(): Promise<void> {
  if (authView.status !== 'authenticated') return
  try {
    const reward = await ManusAuth.query('account.luoyangReward') as { weekKey: string | null; reward: number }
    if (!reward.weekKey || reward.weekKey === state.luoyangRewardWeekKey) return
    const gold = Math.max(0, Math.trunc(reward.reward ?? 0))
    state.luoyangRewardWeekKey = reward.weekKey
    state.lastLuoyangReward = gold
    state.gold += gold
    state.luoyangBoxes += 1
    state.mythicStones += 1
    queueAccountSave(true)
    ui.notify(`낙양전 승리 보상 · 금화 ${gold}개 · 낙양 상자 1개 · 낙양 강화석 1개 (신화장비 강화 1회)`, 'jade')
  } catch {
    // 연결이 끊겨도 서버가 주차를 지키므로 다음 동기화 때 다시 받는다.
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
    ui.setTerritorySync(`서버 원장 · ${new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date())}`)
    ui.render(state)
  } catch {
    enqueueTerritoryBattle(payload)
    ui.setTerritorySync('서버 기록 재시도 대기')
    ui.notify('전투 결과는 로컬에 반영되었습니다. 서버 기록은 다음 영토 동기화에서 자동 재시도합니다.', 'jade')
  }
}
async function refreshCityDamageRankings(cityId: string): Promise<void> {
  if (cityId === 'luoyang') void refreshLuoyangHistory()
  ui.setCityDamageRankings(cityId, [])
  if (authView.status !== 'authenticated' || !cityId) return
  try {
    const rankings = await ManusAuth.query('territory.damageRanking', { cityId }) as CityDamageRanking[]
    ui.setCityDamageRankings(cityId, rankings)
  } catch {
    ui.setCityDamageRankings(cityId, [])
  }
}
/** 낙양전 기록(역대 승자 · 진영별 공헌) */
async function refreshLuoyangHistory(): Promise<void> {
  if (authView.status !== 'authenticated') return
  try {
    ui.setLuoyangHistory(await ManusAuth.query('territory.luoyangHistory') as LuoyangHistory)
  } catch { /* 다음에 다시 */ }
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
/** 메뉴 옮기기(메뉴 버튼·튜토리얼이 함께 쓴다) */
function openSection(section: Section): void {
  if (section === 'formation') mission('visitFormation')
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
  if (section === 'raid') void refreshRaid()
  if (section === 'board') void refreshBoard()
  if (section === 'territory') void refreshCityDamageRankings(state.selectedCityId)
  ui.render(state)
  if (section === 'account') void refreshAccount()
  if (section === 'admin') {
    void refreshAdminAccounts()
    void refreshAdminGameData()
    void refreshAdminBoard()
  }
}

const ui = new StrategyUI(root, {
  onSection: (section: Section) => openSection(section),
  onRecruit: count => {
    // 튜토리얼 10회 모집: 무료, 5등급 무장 1명 확정
    const tutorialPull = count === 10 && onboarding.at('recruit')
    const result = recruit(state, count, tutorialPull ? { free: true, guaranteeGrade: 5 } : {})
    if (!result.ok) { ui.render(state); ui.notify(result.message, 'ember'); return }
    mission('recruit', count)
    syncSteam()
    queueAccountSave()
    // 결과는 연출(옥패 의식 → 5등급 천명 강림)이 끝난 뒤에야 화면·알림에 나온다
    void ui.celebrateRecruit(result.rewards).then(() => {
      ui.render(state)
      ui.notify(result.message, 'jade')
      if (count === 10) ui.showRecruitResults(result.rewards)
      else if (result.general) void ui.playRecruitAnimation(result.general, count, true)
    })
    if (count === 10) onboarding.event('recruit10')
  },
  onUpgrade: id => {
    const result = upgrade(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('levelUp')
    if (result.ok) queueAccountSave()
    if (result.ok) onboarding.event('upgrade')
  },
  onSkill: id => {
    const result = unlockSkill(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('unlock')
    if (result.ok) queueAccountSave()
  },
  onUpgradeMany: id => {
    const result = upgradeMany(state, id)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('levelUp')
    if (result.ok) queueAccountSave()
    if (result.ok) onboarding.event('upgrade')
  },
  onFormationSlot: (id, slot) => {
    setFormationSlot(state, id, slot)
    arena.setGenerals(battleGenerals())
    ui.render(state)
    ui.notify(state.lastNotice)
    playSfx('formation')
    queueAccountSave()
  },
  onFormation: id => {
    toggleFormation(state, id)
    arena.setGenerals(battleGenerals())
    ui.render(state)
    ui.notify(state.lastNotice)
    playSfx('formation')
    queueAccountSave()
  },
  onEquipmentDraw: count => {
    // 튜토리얼: 옥패가 모자라면 10회 뽑기만큼 채워 준다
    if (count === 10 && onboarding.at('gear') && state.honor < ONBOARD_GEAR_COST) state.honor = ONBOARD_GEAR_COST
    const result = drawEquipment(state, count)
    if (!result.ok) { ui.render(state); ui.notify(result.message, 'ember'); return }
    queueAccountSave(true)
    {
      // 결과는 연출(대장간 의식 → 전설·신화 출현)이 끝난 뒤에야 보여 준다
      void ui.celebrateDraw(result.rewards).then(() => { ui.render(state); ui.notify(result.message, 'jade'); ui.showEquipmentResults(result.rewards) })
      if (count === 10) onboarding.event('gear10')
    }
  },
  onEquipmentEnhance: id => {
    const result = enhanceEquipment(state, id)
    if (result.ok) { mission('enhance'); queueAccountSave(true) }
    const enhanced = state.equipmentInventory.find(item => item.id === id)
    if (result.ok && enhanced?.grade === 'mythic') ui.showMythicEnhance(enhanced)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('forge')
    if (result.ok) onboarding.event('enhance')
  },
  onAutoFormation: withEquipment => {
    const formed = autoFormation(state)
    const equipped = withEquipment && formed.ok ? autoEquip(state) : null
    arena.setGenerals(battleGenerals())
    ui.render(state)
    ui.notify(equipped?.ok ? `${formed.message} · ${equipped.message}` : formed.message, formed.ok ? 'jade' : 'ember')
    if (formed.ok) playSfx('formation')
    if (formed.ok) queueAccountSave()
    onboarding.event('auto-formation')
  },
  onApplyCombo: (ids, squad = 0) => {
    const result = squad > 0 ? applySquadCombo(state, squad, ids) : applyCombo(state, ids)
    arena.setGenerals(battleGenerals())
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('formation')
    if (result.ok) queueAccountSave()
  },
  onAutoEquip: () => {
    const result = autoEquip(state)
    arena.setGenerals(battleGenerals())
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok && result.changed) playSfx('equip')
    if (result.ok && result.changed) queueAccountSave()
  },
  onEquipmentEquip: (generalId, itemId) => {
    const result = equipEquipment(state, generalId, itemId)
    if (result.ok) queueAccountSave(true)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('equip')
  },
  onRaidStart: () => { void beginRaid() },
  onRaidRefresh: () => { void refreshRaid() },
  onRaidClaim: () => { void claimRaidReward() },
  onSquadToggle: (squad, id) => {
    const result = toggleSquadMember(state, squad, id)
    if (result.ok) { arena.setGenerals(battleGenerals()); queueAccountSave() }
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('formation')
  },
  onSquadAuto: (squad, withEquipment) => {
    const result = autoSquad(state, squad)
    const equipped = withEquipment && result.ok ? autoEquipSquad(state, squad) : null
    if (result.ok) queueAccountSave()
    ui.render(state)
    ui.notify(equipped?.ok ? `${result.message} · ${equipped.message}` : result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('formation')
  },
  onSquadEquip: squad => {
    const result = autoEquipSquad(state, squad)
    if (result.ok) queueAccountSave(true)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('equip')
  },
  onSquadSwap: squad => {
    const result = swapWithFirstSquad(state, squad)
    if (result.ok) { arena.setGenerals(battleGenerals()); queueAccountSave() }
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('formation')
  },
  onEquipmentLock: id => {
    const result = toggleEquipmentLock(state, id)
    if (result.ok) queueAccountSave(true)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('lock')
  },
  onEquipmentDismantle: (id, count) => {
    const result = dismantleEquipment(state, id, count)
    if (result.ok) queueAccountSave(true)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('dismantle')
  },
  onEquipmentBulkDismantle: grade => {
    const result = bulkDismantle(state, grade)
    if (result.ok) queueAccountSave(true)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('dismantle')
  },
  onEquipmentPreset: (generalId, slot, mode) => {
    const result = mode === 'save' ? saveEquipmentPreset(state, generalId, slot) : applyEquipmentPreset(state, generalId, slot)
    if (result.ok) { queueAccountSave(true); arena.setGenerals(battleGenerals()) }
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('equip')
  },
  onEquipmentUnequip: (generalId, type) => {
    const result = unequipEquipment(state, generalId, type)
    if (result.ok) queueAccountSave(true)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('unequip')
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
    if (result.ok) mission('siege')
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) {
      pendingSiege = { cityId: id, result }
      duelActive = false
      state.section = 'battle'
      ui.setBattleAutoAvailable(true)
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
    if (result.ok) playSfx('formation')
    if (result.ok) {
      queueAccountSave()
      const city = state.cities.find(entry => entry.id === id)
      const garrison = city?.garrisons?.at(-1)
      if (garrison) void syncFactionGarrison(id, garrison)
    }
  },
  onFactionBattle: id => {
    const result = launchFactionBattle(state, id)
    // 회원의 세력전 금화는 서버가 점령을 기록한 뒤 지급한다: 화면에 먼저 더한 금화는 되돌린다.
    const serverGold = isMember() && result.won && (result.gold ?? 0) > 0
    if (serverGold) state.gold -= result.gold ?? 0
    ui.render(state)
    ui.notify(result.message, result.ok && result.won ? 'jade' : 'ember')
    if (result.ok) {
      queueAccountSave()
      void recordFactionTerritoryBattle(id, { damage: result.damage, won: result.won, captured: result.won }).then(() => {
        if (serverGold) void serverGrant('faction', undefined, researchMods(state).factionGold)
      })
    }
  },
  onCollectIncome: () => {
    const result = collectIncome(state)
    if (result.ok) mission('income')
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('coin')
    if (result.ok) queueAccountSave()
  },
  onBuildingUpgrade: (cityId, buildingId) => {
    const result = upgradeBuilding(state, cityId, buildingId)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('build')
    if (result.ok) queueAccountSave()
  },
  onResearch: id => {
    const result = unlockResearch(state, id)
    if (result.ok) { mission('researchStart'); askNotificationOnce() }
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('research')
    if (result.ok) queueAccountSave()
  },
  onMissionClaim: id => {
    const result = claimMission(state, id)
    if (result.ok) mission('missionClaim')
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('reward')
    if (result.ok) queueAccountSave()
  },
  onTutorial: skip => {
    const result = closeTutorial(state, skip)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok && !skip) playSfx('reward')
    if (result.ok) queueAccountSave()
  },
  onEffectsSetting: () => {
    arena?.applyEffectsSetting()
    ui.notify('전투 효과 설정을 바꿨습니다.', 'jade')
  },
  onResearchCancel: () => {
    const result = cancelResearch(state)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('close')
    if (result.ok) queueAccountSave()
  },
  onResearchRush: () => {
    const result = rushResearch(state)
    if (result.ok) mission('researchDone')
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('research')
    if (result.ok) queueAccountSave(true)
  },
  onScenarioStart: (id, difficulty = 'normal') => {
    const scenario = scenarioById(id)
    if (!scenario) return
    // 어려움: 그 시나리오의 보통을 깼고 앞 단계 어려움을 깼을 때만
    const hard = difficulty === 'hard'
    if (hard && !hardUnlocked(state.scenarioCleared, scenario)) { ui.notify('보통 시나리오와 앞 단계 어려움을 먼저 깨십시오.', 'ember'); return }
    scenarioActive = true
    activeScenario = scenario
    activeDifficulty = hard ? 'hard' : 'normal'
    duelActive = false
    state.section = 'battle'
    // 적 덱: 그 시대에 실제로 맞섰던 상대(진영별), 장 안에서 뒤 사건일수록 강해진다. 어려움은 Lv+10 · 별 +1
    const enemyLevel = scenarioEnemyLevelFor(scenario, activeDifficulty)
    const enemyStars = scenarioEnemyStars(scenario, activeDifficulty)
    const deck = scenarioEnemyIds(scenario, state.faction).map((id, index) => {
      const base = templateGeneral(id) ?? allGenerals()[index]
      return { ...scaleGeneral({ ...base, level: 1, stars: 1 }, Math.min(MAX_GENERAL_LEVEL, enemyLevel + index - 1), enemyStars), skillUnlocked: enemyLevel >= 6 }
    })
    arena.setOpponentDeck(deck, 'scenario')
    // 튜토리얼의 첫 시나리오는 쉬운 전투로
    arena.setEasyBattle(!hard && onboarding.at('scenario'))
    const rule = hard ? scenarioHardRule(scenario) : null
    arena.setHardRule(rule)
    arena.setGenerals(battleGenerals())
    arena.startBattle()
    ui.setBattleAutoAvailable(true)
    ui.updateBattle(arena.getSnapshot())
    ui.render(state)
    ui.updateBattle(arena.getSnapshot())
    ui.notify(rule ? `${scenario.year}년 ${scenario.title} · 어려움 · ${HARD_RULE_INFO[rule].label}: ${HARD_RULE_INFO[rule].desc}` : `${scenario.year}년 ${scenario.title} · 시나리오 전투를 시작합니다.`, rule ? 'ember' : 'jade')
  },
  onBattleStart: () => {
    // 레이드 진행 중이면 다음 군 출전으로 이어 간다(일반 전투를 열지 않는다)
    if (raidRun) { startRaidBattle(); return }
    ui.setBattleAutoAvailable(true)
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
    if (!battleCoach.allow('move', index)) return
    arena.commandMove(index)
    ui.updateBattle(arena.getSnapshot())
  },
  onBattleSkill: index => {
    if (!battleCoach.allow('skill', index ?? arena.getSnapshot().selectedUnit)) return
    arena.castSkill(index)
    ui.updateBattle(arena.getSnapshot())
  },
  onBattleSpeed: speed => {
    arena.setSpeed(speed)
    ui.updateBattle(arena.getSnapshot())
  },
  onBattleGuide: () => {
    // 전투 중이면 설명을 보는 동안 멈췄다가, 닫으면 원래대로
    const before = arena.getSnapshot()
    const resume = before.active && !before.paused
    if (resume) { arena.setPaused(true); ui.updateBattle(arena.getSnapshot()) }
    openBattleGuide(() => { if (resume) { arena.setPaused(false); ui.updateBattle(arena.getSnapshot()) } })
  },
  onGuestReset: () => {
    // 게스트 진행·안내 기록만 지운다(회원 저장, 언어·화면 설정은 남김). 지운 뒤 저장이 다시 쓰지 않게 막고 새로 불러온다.
    guestResetting = true
    localSaveDirty = false
    if (saveTimer !== null) { window.clearTimeout(saveTimer); saveTimer = null }
    window.removeEventListener('pagehide', flushPendingSaveOnHide)
    const keep = new Set([LOCAL_GAME_SAVE_KEY, PENDING_TERRITORY_BATTLES_KEY, 'cheonharo.lang', 'cheonharo.quality', 'cheonharo.effects', 'cheonharo.balance.config.v1'])
    try {
      Object.keys(window.localStorage).filter(key => key.startsWith('cheonharo.') && !keep.has(key)).forEach(key => window.localStorage.removeItem(key))
    } catch { /* 저장소를 못 쓰면 지울 것도 없다 */ }
    window.location.reload()
  },
  onCoachReset: () => {
    resetCoaching()
    battleCoach.reload()
    ui.notify('따라하기 안내를 처음부터 다시 보여 드립니다. 메뉴를 옮겨 다니면 차례로 나옵니다.', 'jade')
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
    ui.notify(on ? '자동 전투 켜짐 · 예고 대응 정확도 70%, 스킬은 한 박자 늦게 씁니다(직접 하는 것보다 약함)' : '자동 전투 꺼짐 · 직접 지휘합니다')
  },
  onBattleAutoSkill: on => {
    arena.setAutoSkill(on)
    ui.updateBattle(arena.getSnapshot())
    ui.notify(on ? '스킬 자동을 켰습니다 · 예고 대응은 직접 하십시오.' : '스킬 자동을 껐습니다 · 무장 버튼을 길게 눌러 스킬을 쓰십시오.')
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
      const fallback = dummyDuelOpponents()[1]
      deck = duelDeckFor(fallback)
      duelDecks.set(opponentId || fallback.id, deck)
    }
    duelActive = true
    duelTier = duelTiers.get(opponentId) ?? 'normal'
    state.section = 'battle'
    ui.setBattleAutoAvailable(false)
    arena.setOpponentDeck(deck, 'duel')
    arena.setGenerals(battleGenerals())
    arena.startBattle()
    ui.updateBattle(arena.getSnapshot())
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
      syncResearchRoster()
      ensureEquipmentState(state)
      ensureSquads(state)
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
    if (result.ok) { queueAccountSave(true); recordPurchase(result.message) }
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('coin')
  },
  onCashShopPurchase: productId => {
    const result = purchaseResourcePackage(state, productId)
    if (result.ok) recordPurchase(result.message)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('coin')
    if (result.ok) queueAccountSave()
  },
  onHonorShopPurchase: packageId => {
    const result = purchaseHonorPackage(state, packageId)
    if (result.ok) recordPurchase(result.message)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('coin')
    if (result.ok) queueAccountSave()
    if (result.ok) onboarding.event('honor-buy')
  },
  onGoldPurchase: packageId => {
    const result = purchaseGoldPackage(state, packageId)
    ui.render(state)
    ui.notify(result.message, result.ok ? 'jade' : 'ember')
    if (result.ok) playSfx('coin')
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
  // PC에서는 전투 기록이 화면 구석에 이미 보이므로 같은 내용의 알림 창은 휴대폰에서만 띄운다
  onEvent: message => { if (window.innerWidth <= 760) ui.notify(message) },
  onSkillCast: info => ui.showSkillCutIn(info),
  onBattleEnd: result => {
    if (raidRun && result.mode === 'raid') { onRaidSquadEnd(result); return }
    state.battleScore = Math.max(state.battleScore, result.score)
    const siege = pendingSiege
    const wasSiege = Boolean(siege)
    const wasScenario = Boolean(scenarioActive && activeScenario)
    const wasDuel = !wasSiege && (duelActive || arena.isDuelBattle())
    if (result.won) mission('battleWin')
    if (wasScenario) onboarding.event(result.won ? 'scenario-win' : 'scenario-lose')
    if (wasDuel) mission('duel')
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
      const honorBoost = 1 + researchMods(state).battleHonor
      // 일반 전투 보상은 하루 REPEAT_BATTLE_DAILY_LIMIT회까지(무한 반복으로 정체 구간을 넘지 않게)
      const missionState = ensureMissions(state)
      const repeatLeft = wasDuel ? 1 : REPEAT_BATTLE_DAILY_LIMIT - (missionState.repeatWins ?? 0)
      const honor = repeatLeft > 0 ? Math.round((wasDuel ? 120 : REPEAT_BATTLE_HONOR) * rate * honorBoost) : 0
      const silver = repeatLeft > 0 ? Math.round((wasDuel ? 600 : REPEAT_BATTLE_SILVER) * rate) : 0
      if (!wasScenario) {
        if (!wasDuel && repeatLeft > 0) missionState.repeatWins = (missionState.repeatWins ?? 0) + 1
        state.honor += honor
        state.silver += silver
        state.resources.silver = state.silver
      }
      if (wasDuel) {
        if (isMember()) void serverGrant('duel', `duel-${duelTier}`)
        else state.mythicFragments += DUEL_TIER_FRAGMENTS[duelTier]
      }
      if (scenarioActive && activeScenario && activeDifficulty === 'hard') {
        // 어려움: 금화 없이 옥패 1.5배 · 은전·병서 절반 · 자원(서버 장부 재화가 아니라 서버 변경 없음)
        recordHardStars(state.scenarioCleared, activeScenario.id, result.stars)
        const reward = hardClearReward(activeScenario, state.scenarioCleared)
        if (reward) {
          markHardCleared(state.scenarioCleared, activeScenario.id)
          state.honor += Math.round(reward.honor * honorBoost); state.silver += reward.silver; state.manuals += Math.round(reward.manuals * (1 + researchMods(state).manuals))
          state.resources = { ...state.resources, grain: state.resources.grain + reward.grain, silver: state.resources.silver + reward.silver, wood: state.resources.wood + reward.wood, iron: state.resources.iron + reward.iron, influence: state.resources.influence + reward.influence }
          state.lastNotice = `어려움 ${activeScenario.year}년 ${activeScenario.title} 클리어 · 별 ${result.stars}개 · 옥패 +${Math.round(reward.honor * honorBoost)} · 어려움 보상 획득`
        } else state.lastNotice = `어려움 ${activeScenario.year}년 ${activeScenario.title} 재전투 승리 · 별 ${result.stars}개`
      } else if (scenarioActive && activeScenario) {
        const improved = recordScenarioStars(state.scenarioCleared, activeScenario.id, result.stars)
        const starText = `별 ${result.stars}개${improved && result.stars >= 3 ? ' · 자동 전투 해금' : ''}`
        const reward = firstClearReward(activeScenario, state.scenarioCleared)
        if (reward) {
          state.scenarioCleared.push(activeScenario.id)
          if (isMember()) void serverGrant('scenario', activeScenario.id)
          else state.gold += reward.gold
          state.honor += Math.round(reward.honor * honorBoost); state.silver += reward.silver; state.manuals += Math.round(reward.manuals * (1 + researchMods(state).manuals))
          state.resources = { ...state.resources, grain: state.resources.grain + reward.grain, silver: state.resources.silver + reward.silver, wood: state.resources.wood + reward.wood, iron: state.resources.iron + reward.iron, influence: state.resources.influence + reward.influence }
          state.lastNotice = `시나리오 ${activeScenario.year}년 ${activeScenario.title} 클리어 · ${starText} · 금화 +${reward.gold} · 모든 재화 보상 획득`
        } else state.lastNotice = `시나리오 ${activeScenario.year}년 ${activeScenario.title} 재전투 승리 · ${starText}`
      } else state.lastNotice = wasDuel ? `유저 대련 승리 · 별 ${result.stars}개 · 옥패 +${honor} · 은전 +${silver} · 신화장비 조각 +1` : (repeatLeft > 0 ? `전투 승리 · 별 ${result.stars}개 · 옥패 +${honor} · 은전 +${silver.toLocaleString(locale())} · 오늘 보상 ${REPEAT_BATTLE_DAILY_LIMIT - (missionState.repeatWins ?? 0)}회 남음` : `전투 승리 · 별 ${result.stars}개 · 오늘 일반 전투 보상(${REPEAT_BATTLE_DAILY_LIMIT}회)을 모두 받았습니다`)
    } else {
      state.lastNotice = '전투 패배 · 보상 없음 · 무장 배치와 성장 상태를 다시 점검하십시오.'
    }
    scenarioActive = false
    activeScenario = null
    activeDifficulty = 'normal'
    duelActive = false
    if (wasScenario) queueAccountSave(true)
    // Arena가 비활성 상태가 된 것을 먼저 UI에 전달한다. 시나리오·대련처럼
    // state.section이 battle로 남는 전투도 결과 모달 전에 전체화면을 종료한다.
    ui.updateBattle(arena.getSnapshot())
    ui.render(state)
    ui.showBattleResult(result, state.lastNotice, battleFactors(result.won))
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
// 첫 전투에서 멈칫하지 않도록 본영에 있을 때 무장·병사 모델과 공격 자세를 미리 준비한다
window.setTimeout(() => preloadStrikeModels(), 2500)

ui.setAuth(authView)
if (gameAccess) {
  restoreAccessState(gameAccess)
  if (state.factionConfirmed) ui.render(state)
  else ui.showFactionSelection()
} else ui.showAccessGate()

// 기술 연구 타이머: 1초마다 완료를 확인하고, 연구 화면이면 남은 시간만 갱신한다.
let noticeChecked = false
window.setInterval(() => {
  if (!noticeChecked && state.factionConfirmed && gameAccess) { noticeChecked = true; showNoticeOnce() }
  if (pendingResearchRefund && state.factionConfirmed && gameAccess) {
    ui.notify(pendingResearchRefund, 'jade')
    pendingResearchRefund = null
    queueAccountSave()
  }
  const finished = settleResearch(state)
  if (finished.length) {
    mission('researchDone', finished.length)
    notifyResearchDone(finished.map(node => node.name))
    ui.notify(`연구 완료 · ${finished.map(node => node.name).join(' · ')}`, 'jade')
    queueAccountSave(true)
    if (state.section === 'research' || state.section === 'territory') ui.render(state)
    return
  }
  if (state.section === 'research') ui.updateResearchTimer(state)
}, 1000)

// 따라하기 안내: 처음 들어간 메뉴 짚어 주기 · 첫 전투 따라하기
const coach = new Coach()
const battleCoach = new BattleCoach(coach, { pause: on => { arena.setPaused(on); ui.updateBattle(arena.getSnapshot()) } })
let tourSection = ''
let tourSince = 0
/** 다른 창(소개·알림·결과·모집 결과·진영 선택)이 떠 있으면 짚어 주기를 미룬다 */
const overlayOpen = () => Boolean(document.querySelector('.game-intro, .notice-popup, .result-modal, .recruit-results, .summon-ritual, .summon-ceremony, .heaven-descends, .battle-guide, .access-gate, .faction-selection, .slot-picker'))
// 첫 입장 튜토리얼(건너뛸 수 없음). 회원은 서버 진행을 불러온 뒤에 시작한다.
const onboarding = new Onboarding({
  state,
  openSection,
  prepare: step => {
    ui.setOnboarding({ freeRecruit: step.id === 'recruit', ...(step.id === 'recruit' ? { summonTab: 'generals' } : step.id === 'gear' ? { summonTab: 'equipment' } : step.id === 'shop' ? { shopTab: 'resources' } : {}) })
    // 다음 행동에 필요한 재료가 모자라면 채워 준다(튜토리얼이 막히지 않게)
    if (step.id === 'upgrade') {
      const target = state.generals.find(general => general.id === state.formation[0]) ?? state.generals[0]
      if (target) { const cost = upgradeCost(state, target); state.silver = Math.max(state.silver, cost.silver); state.resources.silver = state.silver; state.manuals = Math.max(state.manuals, cost.manuals) }
    }
    if (step.id === 'enhance') { state.silver = Math.max(state.silver, 2000); state.resources.silver = state.silver; state.resources.iron = Math.max(state.resources.iron, 600) }
    if (step.id === 'shop' && state.gold < 10 && !onboardingGoldWait) {
      onboardingGoldWait = window.setTimeout(() => {
        // 금화 지급이 늦거나 오지 않으면 옥패를 직접 지급하고 넘어간다
        if (onboarding.at('shop') && state.gold < 10) { state.honor += 1000; ui.render(state); ui.notify('튜토리얼 지원 · 옥패 +1,000', 'jade'); onboarding.event('honor-buy') }
      }, 8000)
    }
    ui.render(state)
  },
  save: () => { persistLocalGame(); queueAccountSave(true) },
  busy: () => {
    const snapshot = arena.getSnapshot()
    return snapshot.active || !state.factionConfirmed || !gameAccess || (gameAccess === 'member' && !accountLoaded) || overlayOpen() || Boolean(document.querySelector('.coach-layer:not(.coach-layer--forced)'))
  },
  notify: message => ui.notify(message, 'jade'),
  finished: () => { markMenusSeen(['shop', 'recruit', 'formation', 'roster', 'equipment']); ui.notify('튜토리얼을 마쳤습니다. 이제 자유롭게 천하를 누비십시오.', 'jade'); ui.render(state) },
})
let onboardingGoldWait = 0

function tickCoaching(snapshot: ReturnType<typeof arena.getSnapshot>): void {
  battleCoach.tick(snapshot)
  onboarding.tick()
  if (onboarding.pending) { tourSince = 0; return }
  if (snapshot.active || coach.active || !state.factionConfirmed || !gameAccess || overlayOpen()) { tourSince = 0; return }
  if (tourSection !== state.section) { tourSection = state.section; tourSince = performance.now(); return }
  if (tourSince && performance.now() - tourSince > 700) { tourSince = 0; maybeMenuTour(coach, state.section) }
}

window.setInterval(() => {
  const snapshot = arena.getSnapshot()
  if (snapshot.active || state.section === 'battle') ui.updateBattle(snapshot)
  tickCoaching(snapshot)
  // 전투 화면이 아니면 3D 전장 대신 배경 사진을 보여 준다
  const inBattle = state.section === 'battle' || snapshot.active
  arena.setSceneVisible(inBattle)
  document.body.classList.toggle('has-photo-backdrop', !inBattle)
}, 160)

window.addEventListener('manus-auth-change', (event: Event) => {
  const detail = (event as CustomEvent<{ status: AuthView['status']; user: { name: string | null } | null }>).detail
  authGeneration += 1
  accountLoaded = false
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
    const game = await ManusAuth.query('account.gameState') as { honor: number; silver: number; gold?: number; manuals: number; wins: number; battleScore: number; grain: number; wood: number; iron: number; influence: number; faction?: StrategyState['faction']; factionChosen?: boolean | number; factionWarScore?: number; generals?: StrategyState['generals'] | null; formation?: string[] | null; cities?: StrategyState['cities'] | null; research?: StrategyState['research'] | null; equipmentInventory?: StrategyState['equipmentInventory'] | null; equipmentLoadouts?: StrategyState['equipmentLoadouts'] | null; selectedEquipmentGeneralId?: string | null; mythicFragments?: number; mythicStones?: number; missions?: StrategyState['missions'] | null; reserveSquads?: string[][] | null; duelAttemptsToday?: number; duelDayKey?: string; prelaunchGoldDayKey?: string | null; selectedCityId?: string | null; lastIncomeCollectedAt?: number; lastConquestAt?: number; luoyangBoxes?: number; lastLuoyangReward?: number; luoyangRewardWeekKey?: string | null; scenarioCleared?: string[] | null }
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
      syncResearchRoster()
      if (typeof game.selectedCityId === 'string') state.selectedCityId = game.selectedCityId
      state.lastIncomeCollectedAt = game.lastIncomeCollectedAt
      state.lastConquestAt = game.lastConquestAt
      state.luoyangBoxes = Math.max(0, Math.trunc(game.luoyangBoxes ?? state.luoyangBoxes))
      state.lastLuoyangReward = game.lastLuoyangReward
      state.luoyangRewardWeekKey = game.luoyangRewardWeekKey ?? undefined
      state.factionWarScore = game.factionWarScore ?? 0
      if (Array.isArray(game.equipmentInventory)) state.equipmentInventory = game.equipmentInventory
      if (Array.isArray(game.reserveSquads)) state.reserveSquads = game.reserveSquads
      if (game.equipmentLoadouts && typeof game.equipmentLoadouts === 'object') {
        // 장비 프리셋은 장착 정보 JSON 안에 함께 저장된다
        const unpacked = unpackLoadouts(game.equipmentLoadouts)
        state.equipmentLoadouts = unpacked.loadouts
        if (unpacked.presets) state.equipmentPresets = unpacked.presets
        // 2·3군: 서버 squadData 칸이 없으면(옛 서버) 장착 정보 JSON에 함께 저장된 것을 쓴다
        if (!Array.isArray(game.reserveSquads) && unpacked.squads) state.reserveSquads = unpacked.squads
      }
      if (typeof game.selectedEquipmentGeneralId === 'string') state.selectedEquipmentGeneralId = game.selectedEquipmentGeneralId
      state.mythicFragments = Math.max(0, Math.trunc(game.mythicFragments ?? 0))
      state.mythicStones = Math.max(0, Math.trunc(game.mythicStones ?? 0))
      if (game.missions && typeof game.missions === 'object') state.missions = game.missions
      ensureMissions(state)
      state.duelAttemptsToday = Math.max(0, Math.trunc(game.duelAttemptsToday ?? state.duelAttemptsToday))
      if (typeof game.duelDayKey === 'string') state.duelDayKey = game.duelDayKey
      if (typeof game.prelaunchGoldDayKey === 'string') state.prelaunchGoldDayKey = game.prelaunchGoldDayKey
      if (Array.isArray(game.scenarioCleared)) state.scenarioCleared = game.scenarioCleared.filter((id: string): id is string => typeof id === 'string')
      ensureDuelDailyState(state)
      ensureEquipmentState(state)
      ensureSquads(state)
      void serverGrant('daily')
      const migratedStarter = migrateLegacyStarterRoster(state)
      const regraded = migrateGeneralGrades(state).changed > 0
      if (regraded) { const message = state.lastNotice; window.setTimeout(() => ui.notify(message), 1800) }
      const capped = noticeLevelCap()
      if (capped) queueAccountSave(true)
      const regrown = normalizeGeneralStats(state) > 0 || capped
      if (migratedStarter || regraded || regrown) {
        persistLocalGame()
        localSaveDirty = true
      }
      persistLocalGame()
    }
    accountView = account
    accountLoaded = true
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
    equipmentLoadoutsData: JSON.stringify(packLoadouts(state)),
    selectedEquipmentGeneralId: state.selectedEquipmentGeneralId,
    mythicFragments: saveInt(state.mythicFragments),
    mythicStones: saveInt(state.mythicStones),
    duelAttemptsToday: saveInt(state.duelAttemptsToday, 5),
    duelDayKey: state.duelDayKey,
    prelaunchGoldDayKey: state.prelaunchGoldDayKey,
    scenarioData: JSON.stringify(state.scenarioCleared),
    missionData: JSON.stringify(ensureMissions(state)),
    squadData: JSON.stringify(packSquads(state)),
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
  if (guestResetting || !localSaveDirty) return
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

;(window as unknown as { __strategy: { state: StrategyState; arena: Arena; ui: StrategyUI; catalog: { generals: () => ReturnType<typeof allGenerals>; scenarios: string[] } } }).__strategy = { state, arena, ui, catalog: { generals: allGenerals, scenarios: SCENARIOS.map(s => s.id) } } // 점검 · 자동 테스트용(scripts/qa-100x.mjs)
