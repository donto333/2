import { OFFICIAL_LAUNCH } from '../../server/launch.mjs'
import { templateGeneral, CITY_ADJACENCY, FACTION_CAPITALS, EQUIPMENT_GRADE_META, EQUIPMENT_SET_META, EQUIPMENT_TYPE_META, FACTION_WAR_GOLD_REWARD, FACTION_WAR_HONOR_COST, GOLD_PACKAGES, GOLD_PURCHASE_ENABLED, GRADE_META, HONOR_SHOP_PACKAGES, MYTHIC_EVENT_EQUIPMENT, MYTHIC_SHOP_EQUIPMENT, RESOURCE_SHOP_PACKAGES, capitalFactionForCity, cityWallCapacity, conquestEligibility, duelAttemptsRemaining, RESOURCE_META, allGenerals, equipmentInventoryCount, equipmentSetCounts, equipmentSpecialty, skillDetail, type City, type CityBuilding, type Equipment, type EquipmentGrade, type EquipmentType, type Faction, type General, type ResearchNode, type Section, type StrategyState, buildingCost, cityIncome, combatPower, conquestCost, conquestPower, equipmentBonus, equipmentValue, formatNumber, incomeCooldownRemaining, researchCost, skillPower, skillRank, skillUnlockLevel } from '../game/strategy'
import type { BattleOpponent, BattleSnapshot } from '../game/arena'
import { SCENARIOS, scenarioById, scenarioEnemyIds, scenarioEnemyLevel, scenarioStars } from '../game/scenarios'
import type { BattleResult } from '../game/battle-core'
import { ensureIconSprite, icon } from './icons'
import { TerritoryMapController, type MapCity } from './territory-map'

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character))
const equipmentImage = (type: EquipmentType): string => `/assets/equipment/${type}.webp`
type RosterSort = 'power' | 'level' | 'grade' | 'name' | 'role'
type EquipmentSort = 'grade' | 'level' | 'name'
type FormationSort = 'power' | 'grade'

// 도시 위치: 삼국시대 치소의 실제 경위도를 지도 그림 좌표(%)로 옮긴 값.
// scripts/map/geo-fit.py가 해안·섬·강·분지 기준점 18곳으로 그림의 원근 왜곡을 맞춰 계산한다.
const CITY_MAP_POSITIONS: Readonly<Record<string, { x: number; y: number }>> = {
  chengdu: { x: 29.8, y: 44.7 }, xindu: { x: 30.1, y: 44.2 }, fucheng: { x: 31.8, y: 42.0 }, hanzhong: { x: 37.5, y: 37.2 }, badong: { x: 44.8, y: 48.2 },
  jianning: { x: 27.4, y: 65.8 }, yunnan: { x: 17.0, y: 63.3 }, jiaozhi: { x: 32.9, y: 85.7 }, nanhai: { x: 58.6, y: 81.9 }, shixing: { x: 59.1, y: 75.6 },
  guiyang: { x: 57.0, y: 72.2 }, lingling: { x: 52.3, y: 69.6 }, changsha: { x: 56.1, y: 63.1 }, wuling: { x: 51.9, y: 58.9 }, jiangling: { x: 53.2, y: 53.3 },
  yiling: { x: 50.3, y: 51.0 }, jiangxia: { x: 59.7, y: 53.1 }, xiangyang: { x: 52.7, y: 44.9 }, xinye: { x: 53.3, y: 42.3 }, wancheng: { x: 53.8, y: 39.8 },
  shangyong: { x: 46.6, y: 43.1 }, xuchang: { x: 58.0, y: 33.6 }, luoyang: { x: 53.8, y: 30.8 }, chenliu: { x: 60.8, y: 29.7 }, puyang: { x: 61.9, y: 25.0 },
  ye: { x: 60.2, y: 22.3 }, jinyang: { x: 52.9, y: 17.3 }, pingyuan: { x: 66.3, y: 19.9 }, beihai: { x: 75.1, y: 22.0 }, langya: { x: 73.0, y: 29.3 },
  xiapi: { x: 71.5, y: 33.2 }, guangling: { x: 76.4, y: 40.9 }, jianye: { x: 74.3, y: 42.5 }, wujun: { x: 80.9, y: 45.7 }, kuaiji: { x: 81.5, y: 51.8 },
  hefei: { x: 69.2, y: 44.0 }, shouchun: { x: 67.7, y: 40.6 }, lujiang: { x: 69.4, y: 46.5 }, jiujiang: { x: 65.4, y: 54.4 }, poyang: { x: 67.9, y: 56.6 },
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
}

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

export interface DuelOpponent {
  id: string
  displayName: string
  score: number
  isDummy: boolean
  deck?: General[]
}

export interface StrategyUiCallbacks {
  onSection: (section: Section) => void
  onRecruit: (count: number) => void
  onUpgrade: (id: string) => void
  onSkill: (id: string) => void
  onFormation: (id: string) => void
  onAutoFormation: (withEquipment: boolean) => void
  onAutoEquip: () => void
  onEquipmentDraw: (count: number) => void
  onEquipmentEnhance: (id: string) => void
  onEquipmentEquip: (generalId: string, itemId: string) => void
  onEquipmentUnequip: (generalId: string, type: EquipmentType) => void
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
  onResearch: (id: string) => void
  onBattleStart: () => void
  onScenarioStart: (id: string) => void
  onBattleMove: (index: number) => void
  onBattleSkill: (index?: number) => void
  onBattleSpeed: (speed: number) => void
  onBattleAuto: (on: boolean) => void
  onBattlePause: (on: boolean) => void
  onBattleStop: () => void
  onBattleTactic: (tactic: 'guard' | 'feint' | 'charge') => void
  onDuelRefresh: () => void
  onDuelStart: (opponentId: string) => void
  onFactionSelect: (faction: Faction) => void
  onGuestLogin: () => void
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
  onAdminGameDataSave: (data: GameAccountView['game']) => void
  onAdminBoardRefresh: () => void
  onAdminBoardPostingToggle: (enabled: boolean) => void
  onAdminBoardDelete: (id: number) => void
}

type CityFilter = 'all' | 'front' | 'ally' | 'enemy' | 'neutral'

export class StrategyUI {
  private readonly root: HTMLElement
  private readonly callbacks: StrategyUiCallbacks
  private ranks: RankEntry[] = []
  private boardPosts: BoardPost[] = []
  private boardTab: BoardPost['board'] = '전체'
  private duelOpponents: DuelOpponent[] = []
  private latestBattle: BattleSnapshot | null = null
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
  private adminBoard: AdminBoardState = { postingEnabled: true, posts: [] }
  private cityDamageRankings: CityDamageRanking[] = []
  private cityDamageRankingCityId = ''
  private rosterSort: RosterSort = 'power'
  private rosterSortDescending = true
  private formationSort: FormationSort = 'power'
  private formationSortDescending = true
  private renderedState: StrategyState | null = null
  private summonTab: 'generals' | 'equipment' = 'generals'
  private equipmentSort: EquipmentSort = 'grade'
  private equipmentSortDescending = true
  private equipmentScrollTop = 0
  private equipmentScrollFrame: number | null = null
  private equipmentIndexSource: Equipment[] | null = null
  private equipmentIndex = new Map<string, Equipment>()
  private equipmentSortCache: { key: string; items: Equipment[] } | null = null
  private readonly equipmentRowHeight = 286
  private shopTab: 'gold' | 'resources' | 'mythic' = 'gold'
  private territorySyncText = '서버 원장 대기'
  private scenarioSelectedId = SCENARIOS[0]?.id ?? ''
  private battleViewActive = false
  // 영토 지도: 확대·이동 상태는 다시 그려도 유지된다.
  private readonly territoryMap = new TerritoryMapController(id => {
    this.citySheetOpen = true
    this.callbacks.onCitySelect(id)
  })
  private citySheetOpen = false
  private battleAutoAvailable = false
  private battleLogOpen = false
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

  render(state: StrategyState): void {
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
    if (state.section !== 'equipment') this.equipmentScrollTop = 0
    if (state.section !== 'battle') this.battleViewActive = false
    else if (this.latestBattle?.active) this.battleViewActive = true // 전투가 진행 중이면 그리는 순서와 관계없이 전투 화면
    this.root.innerHTML = this.shell(state)
    ensureIconSprite()
    this.attachTerritoryMap(state)
    const shell = this.root.querySelector<HTMLElement>('.app-shell')
    if (shell) {
      shell.classList.add('is-entering')
      window.requestAnimationFrame(() => shell.classList.remove('is-entering'))
    }
    if (this.latestBattle) this.updateBattle(this.latestBattle)
  }

  setAuth(auth: AuthView): void {
    this.auth = auth
    if (auth.status !== 'authenticated') this.account = null
    const button = this.root.querySelector<HTMLElement>('[data-auth-button]')
    if (button) {
      button.textContent = auth.status === 'authenticated' ? `${auth.name ?? '장군'} · 로그아웃` : auth.status === 'offline' ? '오프라인 모드' : 'Manus 로그인'
      button.dataset.action = auth.status === 'authenticated' ? 'logout' : 'login'
    }
    const status = this.root.querySelector<HTMLElement>('[data-auth-status]')
      if (status) status.textContent = auth.status === 'authenticated' ? `${auth.name ?? '장군'} 계정으로 전적을 동기화합니다.` : auth.status === 'offline' ? '독립 실행 중 · 전투와 모집은 로컬에서 이용할 수 있습니다.' : '로그인하면 리더보드와 전적을 이어갑니다.'
  }

  showAccessGate(): void {
    this.renderedState = null
    this.root.innerHTML = this.accessGate()
  }

  showFactionSelection(): void {
    this.renderedState = null
    this.root.innerHTML = this.factionSelection()
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

  setDuelOpponents(opponents: DuelOpponent[]): void {
    this.duelOpponents = opponents
    if (this.renderedState?.section === 'duel') this.render(this.renderedState)
  }

  notify(message: string, tone: 'jade' | 'ember' = 'jade'): void {
    const toast = this.root.querySelector<HTMLElement>('[data-toast]')
    if (!toast) return
    toast.textContent = message
    toast.dataset.tone = tone
    toast.classList.remove('is-visible')
    void toast.offsetWidth
    toast.classList.add('is-visible')
    window.setTimeout(() => toast.classList.remove('is-visible'), 3300)
  }

  playRecruitAnimation(general: General, count: number): Promise<void> {
    if (this.recruitAnimationActive) return Promise.resolve()
    this.recruitAnimationActive = true
    const meta = GRADE_META[general.grade]
    const overlay = document.createElement('div')
    overlay.className = 'summon-ritual'
    overlay.innerHTML = `<div class="ritual-backdrop"></div><div class="ritual-orbit ritual-orbit--one"></div><div class="ritual-orbit ritual-orbit--two"></div><div class="ritual-stage"><div class="ritual-heading"><span class="eyebrow">${count === 10 ? '10회 연속 모집 · 대표 등장' : '1회 모집 · 옥패의 응답'}</span><strong>천명이 인장을 깨운다</strong></div><div class="ritual-seal"><span>✦</span><i>옥패의 응답</i></div><div class="ritual-reveal" style="--grade:${meta.color};--accent:${general.accent}"><span class="ritual-grade">${meta.label} · ${general.grade}등급</span>${this.ritualPortrait(general)}<h2>${general.name}</h2><p>${general.epithet}</p><small>${general.role} · Lv.${general.level} · ${general.stars}성</small><div class="ritual-skill"><b>${general.skillName}</b><span>${general.skillDescription}</span></div></div><button class="action-button action-button--primary ritual-continue" data-action="close-summon">결과 확인 <span>→</span></button></div>`
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
      window.setTimeout(() => overlay.classList.add('is-revealed'), 980)
      window.setTimeout(finish, 5200)
    })
  }

  showRecruitResults(rewards: General[]): void {
    this.root.querySelector('.recruit-results')?.remove()
    const overlay = document.createElement('div')
    overlay.className = 'recruit-results'
    const cards = rewards.map((general, index) => `<div class="recruit-result-card ${general.grade === 5 ? 'recruit-result-card--five-star' : ''}" style="--grade:${GRADE_META[general.grade].color};--accent:${general.accent};--reveal-delay:${Math.min(index, 9) * 70}ms"><span class="recruit-result-index">${String(index + 1).padStart(2, '0')}</span>${this.ritualPortrait(general)}<div><b>${escapeHtml(general.name)}</b><small>${general.grade}등급 · ${GRADE_META[general.grade].label} · Lv.${general.level}</small></div></div>`).join('')
    overlay.innerHTML = `<div class="recruit-results-backdrop"></div><div class="recruit-results-panel"><div class="recruit-results-heading"><div><span class="eyebrow">10 SUMMON RESULTS</span><h2>열 명의 무장이 응답했습니다</h2><p>획득한 무장은 도감에 기록되고, 중복 인장은 성급 성장에 사용됩니다.</p></div><button class="mini-action" data-action="close-recruit-results">닫기</button></div><div class="recruit-results-grid">${cards}</div><div class="recruit-results-actions"><button class="action-button action-button--outline" data-action="reroll-recruit"><span>10명 다시 뽑기</span><b>✦ 900</b></button><button class="action-button action-button--primary" data-action="close-recruit-results">결과 확인 완료 <span>→</span></button></div></div>`
    this.root.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('is-visible'))
  }

  showEquipmentResults(rewards: Equipment[]): void {
    this.root.querySelector('.recruit-results')?.remove()
    const overlay = document.createElement('div')
    overlay.className = 'recruit-results'
    const cards = rewards.map((item, index) => { const specialty = equipmentSpecialty(item); return `<div class="recruit-result-card equipment-result-card equipment-result-card--${item.grade}" style="--grade:${EQUIPMENT_GRADE_META[item.grade].color};--reveal-delay:${Math.min(index, 9) * 70}ms"><span class="recruit-result-index">${String(index + 1).padStart(2, '0')}</span><div class="equipment-result-icon"><img src="${equipmentImage(item.type)}" alt="${EQUIPMENT_TYPE_META[item.type].label}" /></div><div><b>${escapeHtml(item.name)}</b><small>${EQUIPMENT_GRADE_META[item.grade].label} · ${EQUIPMENT_TYPE_META[item.type].label} · +${equipmentValue(item)}</small><em>${escapeHtml(EQUIPMENT_SET_META[item.set].label)} · ${escapeHtml(item.skillName)}</em>${specialty ? `<strong class="equipment-specialty-badge">특기 · ${escapeHtml(specialty.label)}</strong>` : ''}</div></div>` }).join('')
    overlay.innerHTML = `<div class="recruit-results-backdrop"></div><div class="recruit-results-panel"><div class="recruit-results-heading"><div><span class="eyebrow">EQUIPMENT DROP RESULTS</span><h2>${rewards.length}개의 장비를 획득했습니다</h2><p>획득한 장비는 보유 장비에 추가되며, 무장에게 장착하거나 강화할 수 있습니다.</p></div><button class="mini-action" data-action="close-recruit-results">닫기</button></div><div class="recruit-results-grid equipment-results-grid">${cards}</div><div class="recruit-results-actions"><button class="action-button action-button--outline" data-action="extra-equipment-draw" data-count="1"><span>1회 추가 뽑기</span><b>✦ 240</b></button><button class="action-button action-button--outline" data-action="extra-equipment-draw" data-count="10"><span>10회 추가 뽑기</span><b>✦ 2,200</b></button><button class="action-button action-button--primary" data-action="close-recruit-results">결과 확인 완료 <span>→</span></button></div></div>`
    this.root.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('is-visible'))
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
    this.latestBattle = snapshot
    if (snapshot.active) this.battleViewActive = true
    else if (this.renderedState?.section === 'battle') this.battleViewActive = false
    const q = <T extends HTMLElement = HTMLElement>(selector: string) => this.root.querySelector<T>(selector)
    // 전투 전체화면(Manus 개선안): 전투 중에는 좌측 메뉴·상단 재화를 숨기고, 끝나면 되돌린다.
    this.root.querySelector('.app-shell')?.classList.toggle('app-shell--battle', this.battleViewActive && this.renderedState?.section === 'battle')
    const section = q('.page-section--battle')
    if (!section) return
    const set = (selector: string, text: string) => { const node = q(selector); if (node && node.textContent !== text) node.textContent = text }
    const width = (selector: string, value: number) => { const node = q(selector); if (node) node.style.width = `${Math.max(0, Math.min(100, value))}%` }
    set('[data-bt-status]', snapshot.status)
    set('[data-bt-time]', snapshot.active || snapshot.result ? `남은 ${Math.ceil(snapshot.timeLeft)}초` : '제한 90초')
    set('[data-bt-phase]', `${snapshot.phaseName}`)
    set('[data-bt-morale-text]', `적 사기 ${snapshot.moraleValue} / ${snapshot.moraleMax}`)
    width('[data-bt-morale]', snapshot.morale)
    width('[data-bt-threat]', snapshot.threat)
    set('[data-bt-threat-text]', `${snapshot.threat}`)
    set('[data-bt-collapse]', `붕괴 ${snapshot.collapses}/2`)
    q('[data-bt-collapse]')?.classList.toggle('is-danger', snapshot.collapses > 0)
    set('[data-bt-combo]', `연계 ${snapshot.combo}`)
    set('[data-bt-pressure]', `적 압박 ×${snapshot.difficultyMultiplier.toFixed(2)}`)
    set('[data-bt-bond]', snapshot.bond ? `인연 · ${snapshot.bond}` : '인연 없음')
    const pattern = snapshot.pattern
    const callout = q('[data-bt-callout]')
    callout?.classList.toggle('is-open', Boolean(pattern))
    callout?.classList.toggle('is-guard', pattern?.kind === 'guard')
    set('[data-bt-pattern]', pattern ? pattern.label : snapshot.active ? '다음 예고 대기' : '전투 시작 전')
    set('[data-bt-warning]', pattern ? pattern.warning : snapshot.active ? '적이 움직임을 준비합니다.' : '적 전술 예고가 뜨면 같은 레인의 무장 버튼을 누르십시오.')
    width('[data-bt-window]', pattern ? pattern.timeLeft / pattern.window * 100 : 0)
    this.root.querySelectorAll<HTMLElement>('[data-bt-lane]').forEach(node => node.classList.toggle('is-target', Boolean(pattern && pattern.kind !== 'guard' && pattern.lanes.includes(Number(node.dataset.btLane)))))
    const warn = q('[data-bt-enemy-warn]')
    if (warn) {
      warn.hidden = !snapshot.enemyWarning
      if (snapshot.enemyWarning) warn.textContent = `적장 스킬 예고 · ${snapshot.enemyWarning.general}의 「${snapshot.enemyWarning.name}」 · 철벽 태세로 막으십시오`
    }
    section.classList.toggle('is-enemy-warning', Boolean(snapshot.enemyWarning))
    snapshot.units.forEach(unit => {
      const node = q(`[data-bt-unit="${unit.lane}"]`)
      if (!node) return
      const pct = unit.maxTroops ? unit.troops / unit.maxTroops * 100 : 0
      const bar = node.querySelector<HTMLElement>('[data-bt-unit-troops]')
      if (bar) bar.style.width = `${pct}%`
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
    const effects = q('[data-battle-effects]')
    if (effects) effects.innerHTML = this.battleEffectsMarkup([...snapshot.activeEffects, ...snapshot.playerDebuffs])
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
    const startButton = q('[data-action="battle-start"]')
    if (startButton) startButton.style.display = snapshot.active ? 'none' : 'inline-flex'
  }

  showBattleResult(result: BattleResult, notice = ''): void {
    const stars = [1, 2, 3].map(index => `<i class="${index <= result.stars ? 'is-on' : ''}">★</i>`).join('')
    const reason = { morale: '3막 적 사기를 무너뜨렸습니다', wipe: '적 병력을 전멸시켰습니다', timeout: '90초 안에 끝내지 못했습니다', troops: '아군 병력이 전멸했습니다', collapse: '전열이 두 번 무너졌습니다', ratio: '남은 병력 비율로 판정했습니다' }[result.reason]
    const rows = [
      ['예고 파훼', `${result.breaks} / ${result.patterns}`],
      ['최대 연계', String(result.maxCombo)],
      ['남은 병력', `${Math.round(result.troopRatio * 100)}%`],
      ['전열 붕괴', `${result.collapses}회`],
      ['전투 시간', `${Math.round(result.durationMs / 1000)}초`],
    ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('')
    const checks = result.won ? `<ul class="result-checks"><li class="is-on">승리</li><li class="${result.troopRatio >= 0.5 ? 'is-on' : ''}">병력 50% 이상</li><li class="${result.collapses === 0 ? 'is-on' : ''}">전열 붕괴 없음</li></ul>` : ''
    const modal = document.createElement('div')
    modal.className = 'result-modal'
    modal.innerHTML = `<div class="result-card"><span class="eyebrow">작전 결과</span><div class="result-mark">${result.won ? '승리' : '패배'}</div>${result.won ? `<div class="result-stars">${stars}</div>` : ''}<h2>${escapeHtml(reason)}</h2>${checks}<div class="result-grid">${rows}</div>${notice ? `<p>${escapeHtml(notice)}</p>` : ''}<div class="result-score"><span>작전 점수</span><strong>${formatNumber(result.score)}</strong></div><button class="action-button action-button--primary" data-action="close-result">확인</button></div>`
    this.root.appendChild(modal)
    requestAnimationFrame(() => modal.classList.add('is-visible'))
  }

  private accessGate(): string {
    const offline = this.auth.status === 'offline'
    return `<section class="access-gate"><div class="access-gate__backdrop"></div><div class="access-gate__panel"><div class="access-gate__seal"><span>✦</span></div><span class="eyebrow">CHEONHARO · THE AGE OF THE OVERLORD</span><h1>천하: 패왕의 시대</h1><p class="access-gate__lead">무장을 모으고, 진형을 지휘하고,<br>당신의 이름을 전장에 새기십시오.</p><div class="access-gate__divider"><i></i><span>접속 방식 선택</span><i></i></div><div class="access-gate__actions"><button class="access-choice access-choice--member" data-action="login"><strong>회원 로그인</strong><span>계정·전적·랭킹을 안전하게 저장합니다.</span><b>Manus 계정으로 계속 <em>→</em></b></button><button class="access-choice access-choice--guest" data-action="guest-login"><strong>게스트 로그인</strong><span>회원가입 없이 바로 시작합니다.</span><b>이 기기에서만 로컬 저장 <em>→</em></b></button></div><p class="access-gate__note">${offline ? '현재 회원 인증 서버에 연결할 수 없습니다. 게스트 모드로 플레이할 수 있습니다.' : '회원 로그인 후에도 기존 게스트 진행 데이터는 이 기기에 보존됩니다.'}</p></div></section>`
  }

  private factionSelection(): string {
    const factions: Array<{ id: Faction; name: string; capital: string; region: string; color: string; description: string }> = [
      { id: '위나라', name: '위', capital: '업', region: '중원 · 북방', color: '#8da9ff', description: '넓은 중원과 강한 성벽을 바탕으로 천하의 중심을 지휘합니다.' },
      { id: '촉한', name: '촉', capital: '성도', region: '익주 · 서부', color: '#52e0c4', description: '험준한 산악과 정예 군세로 서부의 전선을 지켜냅니다.' },
      { id: '오나라', name: '오', capital: '건업', region: '강동 · 동남', color: '#f6c56d', description: '강과 수운을 장악하고 빠른 기동으로 동남을 넓혀갑니다.' },
    ]
    return `<section class="faction-selection"><div class="faction-selection__backdrop"></div><div class="faction-selection__panel"><span class="eyebrow">CHOOSE YOUR DOMAIN · 01</span><h1>어느 진영으로 천하를 이끌겠습니까?</h1><p class="faction-selection__lead">선택한 진영의 본성과 영토는 아군으로 표시되고,<br>나머지 진영의 도시는 적군 전선으로 구분됩니다.</p><div class="faction-selection__cards">${factions.map(faction => `<button class="faction-choice faction-choice--${faction.id === '위나라' ? 'wei' : faction.id === '촉한' ? 'shu' : 'wu'}" style="--faction-color:${faction.color}" data-action="faction-select" data-faction="${faction.id}"><span class="faction-choice__crest">${faction.name}</span><span class="faction-choice__copy"><strong>${faction.id}</strong><small>${faction.region} · 본성 ${faction.capital}</small><em>${faction.description}</em></span><b>이 진영으로 시작 <i>→</i></b></button>`).join('')}</div><p class="faction-selection__note">진영 선택 후 영토 지도에서 아군·적군·중립 도시를 확인할 수 있습니다. 선택은 계정과 이 기기에 저장됩니다.</p></div></section>`
  }

  private shell(state: StrategyState): string {
    return `
      <div class="app-shell${state.section === 'battle' && this.battleViewActive ? ' app-shell--battle' : ''}">
        <header class="topbar">
          <div class="brand-lockup"><div class="brand-seal brand-seal--img"><img src="/assets/ui/brand-seal.svg" alt="천하 인장" width="40" height="40" draggable="false"></div><div><div class="brand-title">천하</div><div class="brand-subtitle">패왕의 시대 · 전술 사령부</div></div></div>
          <div class="topbar-center"><span class="season-dot"></span><span>제1장 · 황혼의 관문</span><span class="topbar-divider"></span><div class="topbar-resources"><span class="topbar-resource topbar-resource--gold">${icon('gold')}<small>금화</small><strong>${formatNumber(state.gold)}</strong></span><span class="topbar-resource topbar-resource--silver">${icon('silver')}<small>은전</small><strong>${formatNumber(state.silver)}</strong></span><span class="topbar-resource topbar-resource--honor">${icon('honor')}<small>명망</small><strong>${formatNumber(state.honor)}</strong></span><span class="topbar-resource topbar-resource--influence">${icon('influence')}<small>영향력</small><strong>${formatNumber(state.resources.influence)}</strong></span><span class="topbar-resource topbar-resource--grain">${icon('grain')}<small>식량</small><strong>${formatNumber(state.resources.grain)}</strong></span><span class="topbar-resource topbar-resource--wood">${icon('wood')}<small>목재</small><strong>${formatNumber(state.resources.wood)}</strong></span><span class="topbar-resource topbar-resource--iron">${icon('iron')}<small>철</small><strong>${formatNumber(state.resources.iron)}</strong></span></div></div>
          ${state.section === 'battle' && this.battleViewActive ? this.battleTopControls() : ''}
          <div class="topbar-actions"><button class="auth-button" data-auth-button data-action="${this.auth.status === 'authenticated' ? 'logout' : this.auth.status === 'offline' ? 'offline' : 'login'}">${this.auth.status === 'authenticated' ? `${escapeHtml(this.auth.name ?? '장군')} · 로그아웃` : this.auth.status === 'offline' ? '오프라인 모드' : 'Manus 로그인'}</button></div>
        </header>
        <aside class="sidebar">
          <div class="sidebar-label">본진</div>
          ${this.navButton('overview', icon('overview'), '본영', state.section)}
          ${this.navButton('recruit', icon('recruit'), '모집 · 장비', state.section, state.lastRecruit ? 'NEW' : '')}
          ${this.navButton('roster', icon('roster'), '보유 무장', state.section, `${state.generals.length}`)}
          ${this.navButton('codex', icon('codex'), '무장 도감', state.section, `${allGenerals().length}`)}
          ${this.navButton('formation', icon('formation'), '출전 편성', state.section, `${state.formation.length}/3`)}
          ${this.navButton('equipment', icon('equipment'), '장비 관리', state.section, `${equipmentInventoryCount(state)}`)}
          ${this.navButton('territory', icon('territory'), '영토 · 내정', state.section, `${state.cities.filter(city => city.owner === state.faction).length}`)}
          ${this.navButton('research', icon('research'), '기술 연구', state.section)}
          <div class="sidebar-rule"></div><div class="sidebar-label">작전</div>
          ${this.navButton('battle', icon('battle'), '시나리오', state.section)}
          ${this.navButton('duel', icon('duel'), '유저 대련', state.section, `${duelAttemptsRemaining(state)}/5`)}
          ${this.navButton('shop', icon('shop'), '상점', state.section, `${state.gold}금화`)}
          ${this.navButton('rank', icon('rank'), '천하 랭킹', state.section)}
          ${this.navButton('board', icon('board'), '진영 게시판', state.section)}
          ${this.navButton('updates', icon('updates'), '업데이트 기록', state.section, 'NEW')}
          ${this.navButton('account', icon('account'), '계정 관리', state.section)}
          ${this.canOpenBalance() ? `<a class="nav-button nav-button--link" href="./balance.html" data-nav><span class="nav-icon">${icon('balance')}</span><span>밸런스 테스트</span><b>${OFFICIAL_LAUNCH ? '운영' : 'TEST'}</b></a>` : ''}
          ${this.isAdmin() ? '<div class="sidebar-rule"></div><div class="sidebar-label">운영</div>' : ''}
          ${this.isAdmin() ? this.navButton('admin', icon('admin'), '관리자 센터', state.section, 'LIVE') : ''}
          <div class="sidebar-spacer"></div>
          <div class="sidebar-profile"><div class="profile-orb">${state.faction.slice(0, 1)}</div><div><strong>${state.faction} 진영</strong><small>옥패 07 · Lv.12</small></div></div>
        </aside>
        <main class="main-content">
          ${this.renderSection(state)}
        </main>
        <div class="ambient-vignette"></div>
        <div class="toast" data-toast></div>
      </div>`
  }

  private navButton(section: Section, icon: string, label: string, current: Section, badge = ''): string {
    return `<button class="nav-button ${current === section ? 'is-active' : ''}" data-action="section" data-section="${section}" data-nav><span class="nav-icon">${icon}</span><span>${label}</span>${badge ? `<b>${badge}</b>` : ''}</button>`
  }

  private renderSection(state: StrategyState): string {
    if (state.section === 'recruit' || state.section === 'equipment') return this.summoningSection(state)
    if (state.section === 'roster') return this.rosterSection(state)
    if (state.section === 'codex') return this.codexSection(state)
    if (state.section === 'formation') return this.formationSection(state)
    if (state.section === 'territory') return this.territorySection(state)
    if (state.section === 'research') return this.researchSection(state)
    if (state.section === 'battle') return this.battleViewActive ? this.battleSection(state) : this.scenarioSection(state)
    if (state.section === 'duel') return this.duelSection(state)
    if (state.section === 'shop') return this.shopSection(state)
    if (state.section === 'rank') return this.rankSection(state)
    if (state.section === 'board') return this.boardSection(state)
    if (state.section === 'updates') return this.updatesSection()
    if (state.section === 'account') return this.accountSection()
    if (state.section === 'admin') return this.isAdmin() ? this.adminSection(state) : this.overviewSection(state)
    return this.overviewSection(state)
  }

  private overviewSection(state: StrategyState): string {
    return `<section class="page-section page-section--overview"><div class="section-heading"><div><span class="eyebrow">THE WARRIOR'S PATH · 01</span><h1>다음 한 수를<br><em>준비하십시오.</em></h1><p class="heading-copy">무장을 영입하고, 성장을 증명하고,<br>당신의 이름을 전장에 새깁니다.</p></div><button class="ghost-button" data-action="section" data-section="rank">천하 전적 보기 <span>↗</span></button></div>
      <div class="command-hero"><div class="hero-copy"><span class="pill pill--jade">오늘의 작전</span><h2>황혼의 관문</h2><p>협곡 너머에서 적의 깃발이 감지되었습니다.<br>정예 무장을 편성하고 선제 기동을 지휘하세요.</p><div class="hero-actions"><button class="action-button action-button--primary" data-action="section" data-section="battle">시나리오 입장 <span>→</span></button><button class="action-button action-button--quiet" data-action="section" data-section="recruit">무장 모집 <span>✦</span></button></div></div><div class="hero-stat"><span class="stat-label">작전 전투력</span><strong>${formatNumber(totalPower(state))}</strong><span class="stat-delta">▲ 12.4% <small>지난 작전 대비</small></span><div class="hero-sigil">✦</div></div></div>
      <div class="overview-grid"><div class="glass-card formation-card"><div class="card-header"><div><span class="eyebrow">CURRENT FORMATION</span><h3>출전 진형</h3></div><button class="text-button" data-action="section" data-section="roster">편성 변경</button></div><div class="formation-row">${state.formation.map(id => { const general = state.generals.find(item => item.id === id); return general ? this.miniGeneral(general) : '' }).join('')}</div><div class="formation-footer"><span><i class="status-dot"></i> 출전 준비 완료</span><span class="muted">${state.formation.length}/3 슬롯</span></div></div><div class="glass-card notice-card"><div class="card-header"><div><span class="eyebrow">FIELD INTEL</span><h3>전장 기록</h3></div><span class="intel-icon">⌁</span></div><p class="notice-text">${state.lastNotice}</p><div class="notice-meta"><span>마지막 기록 · 방금 전</span><button class="text-button" data-action="section" data-section="battle">작전 보기 →</button></div></div></div>
      <div class="section-footnote"><span class="footnote-line"></span><span>제1장 · 옥패의 계절</span><span class="footnote-line"></span></div></section>`
  }

  private summoningSection(state: StrategyState): string {
    const active = state.section === 'equipment' ? 'equipment' : this.summonTab
    if (state.section === 'equipment') this.summonTab = 'equipment'
    return `<section class="page-section page-section--summoning"><div class="summon-menu-head"><div><span class="eyebrow">SUMMONING HALL · 02</span><h1>모집 · 장비</h1><p class="heading-copy">무장과 병장기를 한 곳에서 모집하고, 결과를 확인한 뒤 바로 성장시키십시오.</p></div><div class="summon-tabs"><button class="summon-tab ${active === 'generals' ? 'is-active' : ''}" data-action="summon-tab" data-summon-tab="generals">✦ 무장 모집</button><button class="summon-tab ${active === 'equipment' ? 'is-active' : ''}" data-action="summon-tab" data-summon-tab="equipment">⚒ 장비 뽑기</button></div></div>${active === 'equipment' ? this.equipmentSection(state) : this.recruitSection(state)}</section>`
  }

  private recruitSection(state: StrategyState): string {
    const result = state.lastRecruit
    return `<section class="page-section page-section--recruit"><div class="section-heading section-heading--compact"><div><span class="eyebrow">SUMMONING HALL · 02</span><h1>무장 모집</h1><p class="heading-copy">한 장의 인장이 진형 전체를 바꿉니다.</p></div><div class="section-counter"><span>보유 무장</span><strong>${state.generals.length}<small> / ${allGenerals().length}</small></strong></div></div><div class="recruit-layout"><div class="recruit-pedestal glass-card"><div class="pedestal-glow"></div><div class="summon-seal summon-seal--jade"><img src="/assets/ui/jade-summon.svg" alt="옥패" width="192" height="240" draggable="false"><i>옥패의 응답</i></div><div class="recruit-copy"><span class="pill pill--gold">무료 게임 내 재화</span><h2>옥패의 부름</h2><p>역사 속 무장들이 인장 너머에서 응답합니다.<br>중복 무장은 즉시 성급으로 전환됩니다.</p></div><div class="recruit-actions"><button class="action-button action-button--primary" data-action="recruit" data-count="1"><span>1회 모집</span><b>✦ 100</b></button><button class="action-button action-button--outline" data-action="recruit" data-count="10"><span>10회 연속 모집</span><b>✦ 900</b></button></div><div class="fair-play-note"><span>◎</span><span>현금 결제 없음 · 모집 확률 상시 공개</span></div></div><div class="recruit-side"><div class="glass-card rate-card"><div class="card-header"><div><span class="eyebrow">DROP TABLE</span><h3>모집 확률</h3></div><span class="rate-note">1회 기준</span></div>${([5, 4, 3, 2, 1] as const).map(grade => `<div class="rate-row"><span class="grade-dot" style="--grade:${GRADE_META[grade].color}"></span><span>${grade}등급 <small>${GRADE_META[grade].label}</small></span><strong>${GRADE_META[grade].rate}</strong><div class="rate-track"><i style="width:${GRADE_META[grade].rate}"></i></div></div>`).join('')}<div class="rate-footnote">* 중복 획득 시 해당 무장의 성급이 +1 상승합니다. 최대 5성.</div></div>${result ? `<div class="glass-card recruit-result"><span class="eyebrow">LATEST ACQUISITION</span><div class="result-card-row">${this.portrait(result, 'general-portrait--large')}<div><h3>${result.name}<span class="star-row">${'★'.repeat(result.stars)}${'☆'.repeat(5 - result.stars)}</span></h3><p>${result.epithet}</p><small>${result.grade}등급 · ${result.role} · Lv.${result.level}</small></div></div><p class="result-note">${state.lastNotice}</p></div>` : '<div class="glass-card empty-result"><span class="empty-rune">✦</span><p>모집 결과가 이곳에 기록됩니다.</p></div>'}</div></div></section>`
  }

  private rosterSection(state: StrategyState): string {
    const generals = this.sortedOwnedGenerals(state)
    const sortOptions: Array<[RosterSort, string]> = [['power', '전투력'], ['level', '레벨'], ['grade', '등급'], ['name', '이름'], ['role', '병과']]
    return `<section class="page-section page-section--roster"><div class="section-heading section-heading--compact"><div><span class="eyebrow">OWNED GENERALS · 03</span><h1>보유 무장</h1><p class="heading-copy">성장시킨 무장을 정렬하고, 출전 진형에 배치하십시오.</p></div><div class="section-counter"><span>총 전투력</span><strong>${formatNumber(totalPower(state))}</strong></div></div><div class="roster-toolbar roster-toolbar--expanded"><div class="filter-tabs"><button class="filter-tab is-active">전체 <b>${state.generals.length}</b></button><button class="filter-tab">천명 <b>${state.generals.filter(g => g.grade === 5).length}</b></button><button class="filter-tab">명장 <b>${state.generals.filter(g => g.grade === 4).length}</b></button></div><div class="roster-sort-controls"><label>정렬 <select data-action="roster-sort">${sortOptions.map(([value, label]) => `<option value="${value}" ${this.rosterSort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="sort-direction" data-action="roster-sort-direction" title="정렬 방향">${this.rosterSortDescending ? '↓' : '↑'}</button><button class="ghost-button ghost-button--small" data-action="section" data-section="formation">편성 화면 열기 →</button></div></div><div class="roster-summary"><span>보유 ${state.generals.length}명 · 출전 ${state.formation.length}/3명</span><span>${this.sortLabel()} 기준 ${this.rosterSortDescending ? '높은 순' : '낮은 순'}</span></div><div class="roster-grid">${generals.map(general => this.generalCard(general, state.formation.includes(general.id))).join('')}</div></section>`
  }

  private codexSection(state: StrategyState): string {
    const catalog = allGenerals()
    const ownedIds = new Set(state.generals.map(general => general.id))
    const ownedCount = catalog.filter(general => ownedIds.has(general.id)).length
    return `<section class="page-section page-section--codex"><div class="section-heading section-heading--compact"><div><span class="eyebrow">GENERAL CODEX · 04</span><h1>무장 도감</h1><p class="heading-copy">천하에 이름을 남긴 ${catalog.length}명의 무장과 해금 현황을 확인하십시오.</p></div><div class="section-counter"><span>수집 현황</span><strong>${ownedCount}<small> / ${catalog.length}</small></strong></div></div><div class="codex-summary glass-card"><div><span class="eyebrow">COLLECTION PROGRESS</span><h3>옥패 기록원</h3><p>모집으로 영입한 무장은 상세 정보와 성장 상태가 도감에 기록됩니다.</p></div><div class="codex-progress"><strong>${Math.round((ownedCount / catalog.length) * 100)}%</strong><i><b style="width:${(ownedCount / catalog.length) * 100}%"></b></i><small>${ownedCount}명 영입 · ${catalog.length - ownedCount}명 미영입</small></div></div><div class="codex-grid">${catalog.map(general => this.codexCard(general, ownedIds.has(general.id))).join('')}</div></section>`
  }

  private formationSection(state: StrategyState): string {
    const bench = this.sortedFormationBench(state)
    const sortOptions: Array<[FormationSort, string]> = [['power', '전투력'], ['grade', '등급']]
    return `<section class="page-section page-section--formation"><div class="section-heading section-heading--compact"><div><span class="eyebrow">FORMATION COMMAND · 05</span><h1>출전 편성</h1><p class="heading-copy">세 개의 전열 슬롯에 장수를 배치해 황혼의 관문을 돌파할 진형을 완성하십시오.</p><div class="auto-actions"><button class="action-button action-button--primary" data-action="auto-formation" data-with-equipment="1">자동 편성 + 장착 <span>✦</span></button><button class="action-button action-button--outline" data-action="auto-formation">자동 편성</button><button class="action-button action-button--outline" data-action="auto-equip">자동 장착</button></div></div><div class="section-counter"><span>현재 편성 전투력</span><strong>${formatNumber(totalPower(state))}</strong></div></div><div class="formation-screen glass-card"><div class="formation-screen-head"><div><span class="eyebrow">ACTIVE DEPLOYMENT</span><h3>출전 진형 · ${state.formation.length}/3</h3><p>아래 장수를 눌러 편성에 넣거나 해제할 수 있습니다. 세 번째 슬롯은 상황에 맞춰 교체하십시오.</p></div><span class="formation-readiness">${state.formation.length >= 3 ? '출정 준비 완료' : '슬롯을 채우는 중'}</span></div><div class="formation-slots">${[0, 1, 2].map(index => this.formationSlot(state, index)).join('')}</div></div><div class="formation-bench-head"><div><span class="eyebrow">AVAILABLE RESERVE</span><h3>대기 중인 보유 무장</h3></div><div class="roster-sort-controls formation-sort-controls"><label>정렬 <select data-action="formation-sort">${sortOptions.map(([value, label]) => `<option value="${value}" ${this.formationSort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="sort-direction" data-action="formation-sort-direction" title="정렬 방향">${this.formationSortDescending ? '↓' : '↑'}</button></div></div><div class="formation-bench">${bench.length ? bench.map(general => this.formationBenchCard(general)).join('') : '<div class="formation-empty glass-card">모든 보유 무장이 편성되었습니다.</div>'}</div></section>`
  }

  private equipmentSection(state: StrategyState): string {
    const selected = state.generals.find(general => general.id === state.selectedEquipmentGeneralId) ?? state.generals[0]
    const selectableGenerals = this.sortedEquipmentGenerals(state)
    const loadout = selected ? state.equipmentLoadouts[selected.id] ?? {} : {}
    const equipped = new Set(Object.values(loadout))
    const setCounts = equipmentSetCounts(state, selected?.id ?? '')
    const activeSets = (Object.keys(EQUIPMENT_SET_META) as Array<keyof typeof EQUIPMENT_SET_META>).filter(set => (setCounts[set] ?? 0) >= 2)
    const managementOnly = state.section === 'equipment'
    const recent = !managementOnly && state.lastEquipmentDraw.length ? `<div class="equipment-draw-results glass-card"><div class="card-header"><div><span class="eyebrow">LATEST DROP</span><h3>이번 뽑기 결과</h3></div><span class="rate-note">${state.lastEquipmentDraw.length}개 획득</span></div><div class="equipment-mini-row">${state.lastEquipmentDraw.map(item => this.equipmentMiniCard(item)).join('')}</div><div class="equipment-extra-draw"><span>더 뽑으시겠습니까?</span><button class="mini-action" data-action="equipment-draw" data-count="1">1회 추가 뽑기 · ✦ 240</button><button class="mini-action" data-action="equipment-draw" data-count="10">10회 추가 뽑기 · ✦ 2,200</button></div></div>` : ''
    const setBonusPanel = `<div class="equipment-set-bonuses glass-card"><div class="card-header"><div><span class="eyebrow">SET SYNERGY</span><h3>종류별 세트 능력</h3></div><span class="rate-note">${selected?.name ?? '무장'} 기준</span></div><div class="set-bonus-grid">${(Object.keys(EQUIPMENT_SET_META) as Array<keyof typeof EQUIPMENT_SET_META>).map(set => { const count = setCounts[set] ?? 0; const meta = EQUIPMENT_SET_META[set]; return `<div class="set-bonus-card ${count >= 2 ? 'is-active' : ''}" style="--set-color:${EQUIPMENT_GRADE_META.legendary.color}"><strong>${meta.label}</strong><span>${count}/3 장착</span><small>2세트 · ${meta.twoPiece}</small><small>3세트 · ${meta.threePiece}</small></div>` }).join('')}</div>${activeSets.length ? `<p class="set-active-note">활성 세트: ${activeSets.map(set => EQUIPMENT_SET_META[set].label).join(' · ')}</p>` : '<p class="set-active-note is-muted">같은 세트 장비를 2개 이상 장착하면 세트 능력이 활성화됩니다.</p>'}</div>`
    const equipmentHero = managementOnly ? `<div class="equipment-hero glass-card equipment-management-hero"><div><span class="pill pill--jade">ARMORY MANAGEMENT</span><h2>장비 관리</h2><p>선택한 무장의 장착현황을 확인하고 장비를 해제하거나 강화하십시오.</p></div><div class="equipment-management-mark">⚒</div></div>` : `<div class="equipment-hero glass-card"><div><span class="pill pill--gold">EQUIPMENT SUMMON</span><h2>천하의 병장기</h2><p>노멀부터 전설까지 획득할 수 있습니다. 신화 장비는 추후 이벤트로만 지급됩니다.</p></div><div class="equipment-draw-actions"><button class="action-button action-button--primary" data-action="equipment-draw" data-count="1"><span>1회 뽑기</span><b>✦ 240</b></button><button class="action-button action-button--outline" data-action="equipment-draw" data-count="10"><span>10회 연속</span><b>✦ 2,200</b></button></div></div>`
    return `<section class="page-section page-section--equipment"><div class="section-heading section-heading--compact"><div><span class="eyebrow">ARMORY &amp; FORGE · 06</span><h1>장비 관리</h1><p class="heading-copy">무기·갑옷·장신구를 장착하고 강화해 무장의 네 가지 전투 능력과 세트 능력을 끌어올리십시오.</p></div><div class="section-counter"><span>보유 장비</span><strong>${equipmentInventoryCount(state)}</strong></div></div>${equipmentHero}<div class="equipment-layout"><div><div class="equipment-toolbar glass-card"><div><span class="eyebrow">EQUIPPED COMMANDER</span><h3>장착 무장</h3><small>장비 반영 전투력 높은 순</small></div><button class="mini-action mini-action--deploy equipment-auto" data-action="auto-equip" title="출전 무장 3명에게 가장 좋은 장비 조합을 장착">출전 무장 자동 장착</button><select data-action="equipment-general">${selectableGenerals.map(general => `<option value="${general.id}" ${general.id === selected?.id ? 'selected' : ''}>${general.name} · ${formatNumber(combatPower(general) + equipmentPowerForUi(state, general.id))}</option>`).join('')}</select></div><div class="equipment-slots glass-card">${(['weapon', 'armor', 'accessory'] as EquipmentType[]).map(type => this.equipmentSlot(type, loadout[type], state, selected?.id ?? '')).join('')}</div>${setBonusPanel}${recent}</div><div><div class="equipment-rates glass-card"><div class="card-header"><div><span class="eyebrow">DROP TABLE</span><h3>장비 뽑기 확률</h3></div><span class="rate-note">신화 제외</span></div>${(['normal', 'rare', 'unique', 'legendary'] as const).map(grade => `<div class="equipment-rate-row"><i style="--grade:${EQUIPMENT_GRADE_META[grade].color}"></i><span>${EQUIPMENT_GRADE_META[grade].label}</span><b>${grade === 'normal' ? '55%' : grade === 'rare' ? '28%' : grade === 'unique' ? '12%' : '5%'}</b></div>`).join('')}<div class="mythic-lock"><strong>${MYTHIC_EVENT_EQUIPMENT.name}</strong><span>신화 · 이벤트 한정 지급 · 뽑기 획득 불가</span></div></div><div class="equipment-inventory"><div class="equipment-inventory-toolbar"><div class="card-header"><div><span class="eyebrow">ARMORY INVENTORY</span><h3>보유 장비</h3></div><span class="rate-note">${state.equipmentInventory.length}개</span></div><div class="equipment-sort-controls"><label>정렬 <select data-action="equipment-sort"><option value="grade" ${this.equipmentSort === 'grade' ? 'selected' : ''}>등급</option><option value="level" ${this.equipmentSort === 'level' ? 'selected' : ''}>강화 레벨</option><option value="name" ${this.equipmentSort === 'name' ? 'selected' : ''}>이름</option></select></label><button class="sort-direction" data-action="equipment-sort-direction">${this.equipmentSortDescending ? '↓' : '↑'}</button></div></div>${this.equipmentVirtualList(state, selected?.id ?? '', equipped)}</div></div></div></section>`
  }

  private equipmentVirtualList(state: StrategyState, generalId: string, equipped: Set<string>): string {
    const items = this.sortedEquipment(state)
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
    return `<article class="equipment-card ${equipped ? 'is-equipped' : ''}" style="--grade:${grade.color}"><div class="equipment-card-top"><span class="equipment-type"><img loading="lazy" decoding="async" width="21" height="21" src="${equipmentImage(item.type)}" alt="" /> ${EQUIPMENT_TYPE_META[item.type].label}</span><span class="equipment-grade">${grade.label}${(item.quantity ?? 1) > 1 ? ` · x${item.quantity}` : ''}</span></div><img loading="lazy" decoding="async" width="72" height="72" class="equipment-image ${item.grade === 'mythic' ? 'equipment-image--mythic' : ''}" src="${equipmentImage(item.type)}" alt="${EQUIPMENT_TYPE_META[item.type].label}" /><h4>${item.name}</h4><p>${set.label} · ${item.skillName}</p><div class="equipment-stat"><b>${item.mainStat}</b><strong>+${equipmentValue(item)}</strong><span>Lv.${item.level}/20</span></div><small>${item.skillDescription}</small>${specialty ? `<div class="equipment-specialty"><b>특기 · ${escapeHtml(specialty.label)}</b><span>${escapeHtml(specialty.description)}</span></div>` : ''}<div class="equipment-card-actions"><button class="mini-action" data-action="equipment-enhance" data-equipment-id="${item.id}">강화 · 은전 ${formatNumber(420 + item.level * 260)}</button>${equipped ? `<button class="mini-action" data-action="equipment-unequip" data-equipment-type="${item.type}" data-general-id="${generalId}">장착 해제</button>` : `<button class="mini-action" data-action="equipment-equip" data-equipment-id="${item.id}" data-general-id="${generalId}">장착</button>`}</div></article>`
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

  private sortedFormationBench(state: StrategyState): General[] {
    const direction = this.formationSortDescending ? -1 : 1
    return state.generals.filter(general => !state.formation.includes(general.id)).sort((a, b) => {
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


  private resourceTokens(state: StrategyState): string {
    const values = { ...state.resources, silver: state.silver }
    return (['grain', 'silver', 'wood', 'iron', 'influence'] as const).map(key => `<div class="resource-token" style="--resource-color:${RESOURCE_META[key].color}"><span>${icon(key)}</span><div><small>${RESOURCE_META[key].label}</small><strong>${formatNumber(values[key])}</strong></div></div>`).join('')
  }

  private territorySection(state: StrategyState): string {
    const selected = state.cities.find(city => city.id === state.selectedCityId) ?? state.cities[0]
    const income = selected ? cityIncome(selected, state) : { grain: 0, silver: 0, wood: 0, iron: 0, influence: 0 }
    const owned = state.cities.filter(city => city.owner === state.faction).length
    const contested = state.cities.filter(city => city.owner !== state.faction).length
    const incomeWait = incomeCooldownRemaining(state)
    const incomeLabel = incomeWait ? `금일 수확 완료 · ${Math.ceil(incomeWait / 3600000)}시간 후` : '금일 내정 수확'
    return `<section class="page-section page-section--territory${this.citySheetOpen ? ' is-sheet-open' : ''}"><div class="section-heading section-heading--compact"><div><span class="eyebrow">DOMAIN &amp; GOVERNANCE · 04</span><h1>영토 · 내정</h1><p class="heading-copy">내정을 키운 군세로 전선을 열고, 성벽을 무너뜨려 천하를 점령하십시오.</p></div><div class="territory-heading-actions"><button class="action-button action-button--outline" data-action="territory-refresh">서버 원장 새로고침 <span>↻</span></button><button class="action-button action-button--primary" data-action="collect-income">${incomeLabel} <span>✦</span></button></div></div><div class="resource-strip glass-card">${this.resourceTokens(state)}</div><div class="conquest-overview glass-card"><div><span class="eyebrow">CONQUEST FRONT</span><h3>영토 점령전</h3><p>출정할 때마다 식량·은전·철을 소모합니다. 공성 진전을 100%까지 쌓으면 ${state.faction}의 전선이 됩니다.</p></div><div class="conquest-overview-stats"><span><b>${owned}</b><small>아군 도시</small></span><span><b>${contested}</b><small>남은 전선</small></span><span><b>${formatNumber(conquestPower(state))}</b><small>출정 전투력</small></span><span><b>${formatNumber(state.factionWarScore)}</b><small>세력전 공헌도</small></span></div></div><div class="territory-layout"><div class="glass-card territory-map"><div class="card-header"><div><span class="eyebrow">THREE KINGDOMS DOMAIN</span><h3>천하 영토</h3></div><button class="sync-label sync-label--button" data-action="territory-refresh" data-territory-sync>${this.territorySyncText}</button></div>${this.mapViewport(state)}<div class="map-legend"><span><i class="legend-dot legend-dot--ally"></i>${state.faction} 영토</span><span><i class="legend-dot legend-dot--neutral"></i>중립</span><span><i class="legend-dot legend-dot--enemy"></i>타 세력</span><span><i class="legend-line"></i>연결 전선</span></div>${this.mobileCitySelector(state)}</div>${selected ? this.cityManagementCard(selected, income, state) : ''}</div></section>`
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
    return `<div class="map-viewport" data-map-viewport data-lod="far"><div class="map-world map-canvas" data-map-world><div class="map-river"></div>${this.frontlineLines(state)}${state.cities.map(city => this.cityMarker(city, state.selectedCityId, state.faction)).join('')}${MAP_REGION_LABELS.map(region => `<span class="map-label map-label--province" style="left:${region.x}%;top:${region.y}%">${region.name}<small>${region.hanja}</small></span>`).join('')}</div><div class="map-controls"><button type="button" data-map-action="zoom-in" data-map-zoom-in aria-label="확대">＋</button><button type="button" data-map-action="zoom-out" data-map-zoom-out aria-label="축소">－</button><button type="button" data-map-action="home" data-home="${home}" aria-label="내 영토로">⌖</button><button type="button" data-map-action="fullscreen" aria-label="지도 전체 화면">${this.territoryMap.fullscreen ? '✕' : '⛶'}</button></div><div class="map-hint"><span class="hint-touch">두 손가락으로 확대 · 끌어서 이동 · 눌러서 도시 선택</span><span class="hint-mouse">휠로 확대 · 끌어서 이동 · 눌러서 도시 선택</span></div></div>`
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
    return `<div class="mobile-city-selector city-finder" data-city-finder><div class="city-finder-head"><span class="eyebrow">CITY FINDER</span><small data-city-finder-count>${rows.length}개 도시</small></div><input class="city-finder-search" type="search" placeholder="도시 이름 검색" value="${escapeHtml(this.cityQuery)}" data-city-search enterkeyhint="search"><div class="city-finder-filters">${chips}</div><div class="city-finder-list">${list}</div><p class="city-finder-empty" data-city-finder-empty hidden>조건에 맞는 도시가 없습니다.</p></div>`
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
    const defense = Math.min(100, city.defense + (state.research.some(node => node.id === 'drill' && node.unlocked) ? 12 : 0))
    const wallCapacity = cityWallCapacity(city)
    const metrics = [['민심', city.prosperity], ['성벽', defense], ['도시 등급', city.level * 20]] as const
    const siege = Math.min(100, city.conquestProgress ?? 0)
    const conquest = canManage ? this.defenseCard(city, state) : this.conquestCard(city, state, siege, eligibility)
    const panelClass = canManage ? 'city-management--owned' : 'city-management--frontline'
    const capitalBadge = capitalFaction ? `<span class="capital-badge">${capitalFaction} 본성 · 점령 불가</span>` : ''
    const frontierNote = canManage ? '내정 핵심지 · 방어선 유지' : eligibility.allowed ? `접경 전선 · ${eligibility.reason}` : '원거리 전선 · 진군 경로 차단'
    return `<div class="glass-card city-management ${panelClass}"><div class="city-sheet-bar"><span class="city-sheet-grip"></span><button class="city-sheet-close" data-action="city-sheet-close" aria-label="도시 정보 닫기">✕</button></div><div class="city-management-head"><div><span class="eyebrow">도시 관리 · ${city.region}</span><h2>${city.name}${city.id === 'luoyang' ? this.luoyangRulesMenu() : ''}</h2><p>${city.region} · ${city.owner === state.faction ? '아군 직할령' : `${city.owner} 관할`}</p></div><div class="city-management-status"><span class="city-level">Lv.${city.level}</span>${capitalBadge}</div></div><div class="city-map-context"><span>삼국지 지리 전선</span><strong>${frontierNote}</strong><small>인접 도시 ${eligibility.neighborNames.length ? eligibility.neighborNames.join(' · ') : '독립 성 · 연결 전선 없음'}</small></div><div class="city-metrics">${metrics.map(([label, value]) => `<div><span>${label}</span><i><b style="width:${Math.min(value, 100)}%"></b></i><em>${value}</em></div>`).join('')}</div><p class="wall-status">성벽 능력 ${wallCapacity} · 현재 방어도 ${city.defense}/${wallCapacity} · 방어도 0 도달 및 수비병 전멸 후 최종 세력전</p>${conquest}${this.cityDamageRankingCard(city)}${this.battleLogCard(city)}<div class="city-yield"><div class="card-header"><div><span class="eyebrow">ESTIMATED YIELD</span><h3>도시 생산량</h3></div><span class="rate-note">${canManage ? '수확 1회 기준' : '점령 후 활성화'}</span></div><div class="yield-grid">${(['grain', 'silver', 'wood', 'iron', 'influence'] as const).map(key => `<span style="--resource-color:${RESOURCE_META[key].color}">${RESOURCE_META[key].icon} +${formatNumber(income[key])}</span>`).join('')}</div></div><div class="building-list"><div class="card-header"><div><span class="eyebrow">CIVIL WORKS</span><h3>내정 건물</h3></div><span class="rate-note">${canManage ? '건물마다 생산 특화' : '정찰 정보'}</span></div>${city.buildings.map(building => this.buildingRow(city, building, canManage)).join('')}</div>${canManage ? '<p class="management-tip">병영을 강화하면 성벽 능력과 방어도 회복 상한이 상승합니다.</p>' : '<p class="management-tip management-tip--warn">수비병을 모두 격파하고 방어도를 0까지 낮춘 뒤 최종 세력전을 실행하십시오.</p>'}</div>`
  }

  private cityDamageRankingCard(city: City): string {
    const rankings = this.cityDamageRankingCityId === city.id ? this.cityDamageRankings : []
    const rows = rankings.length ? rankings.map((entry, index) => `<li><span class="damage-rank-number">${index + 1}</span><strong>${escapeHtml(entry.displayName)}</strong><small>${escapeHtml(entry.faction)} · ${entry.battleCount}회 참여</small><b>${formatNumber(entry.totalDamage)}</b></li>`).join('') : '<li class="city-damage-ranking-empty">아직 기록된 공성 피해 기여가 없습니다.</li>'
    return `<details class="city-damage-ranking" open><summary><span><span class="eyebrow">SIEGE CONTRIBUTION</span><strong>공성 피해 기여 랭킹</strong></span><b>상위 ${rankings.length}명</b></summary><p>이 도시의 성벽 방어도를 가장 많이 깎은 유저 순위입니다.</p><ol>${rows}</ol></details>`
  }

  private battleLogCard(city: City): string {
    const logs = [...(city.battleLogs ?? [])].reverse()
    const entries = logs.length ? logs.map(log => `<li class="city-battle-log-entry">${this.battleLogBadge(log)}<div><strong>${escapeHtml(log.attackerName)} → ${escapeHtml(log.defenderName)}</strong><small>${log.attackerKind === 'ai' ? '인공지능 공격' : '유저 공격'} · 피해 ${formatNumber(log.damage)} · ${escapeHtml(log.note)}</small></div><time>${new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(log.timestamp)}</time></li>`).join('') : '<li class="city-battle-log-empty">아직 기록된 전투가 없습니다. 수비덱을 배치한 뒤 공격을 받으면 이곳에 기록됩니다.</li>'
    return `<details class="city-battle-log" ${logs.length ? 'open' : ''}><summary><span><span class="eyebrow">CITY BATTLE LOG</span><strong>성 전투 기록</strong></span><b>${logs.length}건</b></summary><p>이 성의 공성전·세력전과 인공지능 습격 결과를 최근 30건까지 보관합니다.</p><ul>${entries}</ul></details>`
  }

  private luoyangRulesMenu(): string {
    return `<details class="luoyang-rules"><summary>낙양전 설명</summary><div class="luoyang-rules-body"><strong>주간 낙양전</strong><p>매주 일요일 20:00에 열리고 24:00 정각에 종료됩니다.</p><ul><li>낙양은 모든 전선과 분리된 독립 성입니다.</li><li>점령 창이 열린 동안 촉·위·오 모든 진영이 직접 출정할 수 있습니다.</li><li>종료 시점까지 낙양을 점령하고 수비한 진영이 승자가 됩니다.</li><li>승리 진영은 다음 점령 창까지 낙양을 영토로 유지합니다.</li><li>승리 진영의 유저는 주 1회 낙양 상자와 금화 10~100개를 받습니다.</li></ul></div></details>`
  }

  private conquestCard(city: City, state: StrategyState, siege: number, eligibility: ReturnType<typeof conquestEligibility>): string {
    const cost = conquestCost(city)
    const power = conquestPower(state)
    const costText = `${icon('grain', 'gi--inline')} ${formatNumber(cost.grain ?? 0)} · ${icon('silver', 'gi--inline')} ${formatNumber(cost.silver ?? 0)} · ${icon('iron', 'gi--inline')} ${formatNumber(cost.iron ?? 0)}`
    const garrisonCount = city.garrisons?.length ?? 3
    const defeated = Math.min(garrisonCount, city.defendersDefeated ?? 0)
    const remaining = Math.max(0, garrisonCount - defeated)
    const finalReady = city.defense <= 0 && remaining === 0
    const honorCost = FACTION_WAR_HONOR_COST[city.level] ?? FACTION_WAR_HONOR_COST[5]
    const goldReward = FACTION_WAR_GOLD_REWARD[city.level] ?? FACTION_WAR_GOLD_REWARD[5]
    const actions = eligibility.allowed ? `<div class="territory-actions"><button class="action-button action-button--primary conquest-button" data-action="conquer" data-city="${city.id}">공성 출정 <span>${costText}</span></button><button class="action-button action-button--outline conquest-button" data-action="faction-battle" data-city="${city.id}" ${finalReady ? '' : 'disabled'}>최종 세력전 <span>명망 ${formatNumber(honorCost)} · 금화 +${goldReward}</span></button></div>` : `<div class="frontier-lock"><strong>진군 경로 차단</strong><span>${eligibility.reason}</span><small>국경 전선: ${eligibility.neighborNames.length ? eligibility.neighborNames.join(' · ') : '연결된 아군 도시 없음'}</small></div>`
    return `<div class="conquest-card"><div class="conquest-card-head"><div><span class="eyebrow">FACTION WAR · ${city.owner}</span><h3>성벽 방어도 ${city.defense} · 점령 진전 ${siege}%</h3></div><strong>${formatNumber(power)} 전투력</strong></div><div class="conquest-progress"><i style="width:${siege}%"></i></div><p>수비병 ${defeated}/${garrisonCount}부대 격파 · 덱 전투력에 따라 성벽 방어도가 감소합니다. 방어도 0·수비병 전멸 후 최종 세력전을 실행하십시오.</p>${actions}</div>`
  }
  private defenseCard(city: City, state: StrategyState): string {
    const power = conquestPower(state)
    const cost = `▦ ${formatNumber(280 + city.level * 90)} · ◆ ${formatNumber(100 + city.level * 55)}`
    const garrisonCount = city.garrisons?.length ?? 0
    const canDeploy = garrisonCount < 100
    return `<div class="conquest-card defense-card"><div class="conquest-card-head"><div><span class="eyebrow">성 방어</span><h3>방어병 ${garrisonCount}/100부대</h3></div><strong>${formatNumber(power)} 전투력</strong></div><p>현재 출전 진형을 이 도시에 수비병으로 세울 수 있습니다. 상대는 배치된 수비병을 모두 격파해야 점령할 수 있습니다.</p><div class="territory-actions"><button class="action-button action-button--primary conquest-button" data-action="garrison-deploy" data-city="${city.id}" ${canDeploy ? '' : 'disabled'}>현재 덱 수비병 배치</button><button class="action-button action-button--outline conquest-button" data-action="defense" data-city="${city.id}">수비전 출격 <span>${cost}</span></button></div></div>`
  }
  private buildingRow(city: City, building: CityBuilding, canManage: boolean): string {
    const cost = buildingCost(building)
    const costText = `${icon('silver', 'gi--inline')} ${formatNumber(cost.silver ?? 0)} · ${icon('wood', 'gi--inline')} ${formatNumber(cost.wood ?? 0)} · ${icon('iron', 'gi--inline')} ${formatNumber(cost.iron ?? 0)}`
    const maxed = building.level >= building.maxLevel
    return `<div class="building-row"><div class="building-glyph">${icon(building.kind === 'agriculture' ? 'grain' : building.kind === 'commerce' ? 'silver' : building.kind === 'barracks' ? 'duel' : building.kind === 'workshop' ? 'iron' : 'research')}</div><div class="building-copy"><strong>${building.name}</strong><small>${building.description}</small><span class="building-level">${'◆'.repeat(building.level)}${'◇'.repeat(building.maxLevel - building.level)}</span></div><button class="mini-action ${maxed ? 'is-maxed' : ''}" data-action="building-upgrade" data-city="${city.id}" data-building="${building.id}" ${!canManage || maxed ? 'disabled' : ''}>${maxed ? '최고 단계' : `강화 · ${costText}`}</button></div>`
  }

  private researchSection(state: StrategyState): string {
    const branches = ['농정', '상업', '군제', '학술'] as const
    return `<section class="page-section page-section--research"><div class="section-heading section-heading--compact"><div><span class="eyebrow">CELESTIAL RESEARCH · 05</span><h1>기술 연구</h1><p class="heading-copy">총 58개 기술을 서원과 도시에서 모은 영향력으로 해금해 국정·전투·영토의 방향을 설계합니다.</p></div><div class="section-counter"><span>보유 영향력</span><strong>${formatNumber(state.resources.influence)}</strong></div></div><div class="resource-strip glass-card resource-strip--research">${this.resourceTokens(state)}</div><div class="research-grid">${branches.map(branch => `<div class="glass-card research-branch"><div class="research-branch-head"><span class="branch-rune">${branch === '농정' ? '▦' : branch === '상업' ? '◇' : branch === '군제' ? '⚔' : '✧'}</span><div><span class="eyebrow">${branch} BRANCH</span><h3>${branch} 연구 · ${state.research.filter(node => node.branch === branch).length}개</h3></div></div><div class="research-nodes">${state.research.filter(node => node.branch === branch).map(node => this.researchCard(node, state)).join('')}</div></div>`).join('')}</div></section>`
  }

  private researchCard(node: ResearchNode, state: StrategyState): string {
    const locked = Boolean(node.prerequisite && !state.research.some(item => item.id === node.prerequisite && item.unlocked))
    return `<article class="research-node ${node.unlocked ? 'is-unlocked' : ''} ${locked ? 'is-locked' : ''}"><div class="research-tier">TIER ${node.tier}</div><div><h4>${node.name}</h4><p>${node.description}</p></div><div class="research-node-footer"><span>${node.unlocked ? '✓ 연구 완료' : locked ? '선행 연구 필요' : researchCost(node)}</span>${node.unlocked ? '<span class="research-check">적용 중</span>' : `<button class="mini-action mini-action--research" data-action="research" data-research="${node.id}" ${locked ? 'disabled' : ''}>연구 시작 <span>→</span></button>`}</div></article>`
  }

  private portraitAsset(general: General): string {
    return `/assets/generals-realistic-webp/${general.id}.webp`
  }

  private portrait(general: General, className = ''): string {
    const portraitPath = this.portraitAsset(general)
    const imageClass = ' has-portrait'
    const imageStyle = `--portrait:url('${portraitPath}');`
    return `<div class="general-portrait${className ? ` ${className}` : ''}${imageClass}" style="--accent:${general.accent};${imageStyle}"><span>${general.portrait}</span><i></i></div>`
  }

  private ritualPortrait(general: General): string {
    const portraitPath = this.portraitAsset(general)
    const imageClass = ' has-portrait'
    const imageStyle = `--portrait:url('${portraitPath}');`
    return `<div class="ritual-portrait${imageClass}" style="--accent:${general.accent};${imageStyle}"><span>${general.portrait}</span><i></i></div>`
  }

  private battleEffectsMarkup(effects: BattleSnapshot['activeEffects'] = []): string {
    return effects.length
      ? effects.map(effect => `<span class="battle-effect battle-effect--${effect.kind}" title="${effect.description}"><b>${effect.icon}</b><i>${effect.name}</i><small>${effect.remaining.toFixed(1)}초</small></span>`).join('')
      : '<span class="battle-effects-empty">스킬 효과 대기 중</span>'
  }

  private attributeRows(general: General): string {
    const stats = [
      ['통솔', general.leadership],
      ['무력', general.martial],
      ['모략', general.stratagem],
      ['속도', general.speed],
    ] as const
    return stats.map(([label, value]) => `<div><span>${label}</span><i><b style="width:${Math.min(value, 100)}%"></b></i><em>${value}</em></div>`).join('')
  }

  private skillDetailPanel(general: General): string {
    const detail = skillDetail(general)
    const extra = [
      detail.passive ? `<div class="skill-detail-wide"><small>패시브 (3성)</small><strong>${escapeHtml(detail.passive)}</strong></div>` : '',
      detail.awaken ? `<div class="skill-detail-wide"><small>각성 (5성)</small><strong>${escapeHtml(detail.awaken)}</strong></div>` : '',
      detail.weakness ? `<div class="skill-detail-wide skill-detail-weak"><small>약점</small><strong>${escapeHtml(detail.weakness)}</strong></div>` : '',
    ].join('')
    return `<div class="skill-detail-panel skill-detail-panel--${detail.category === '정화·치료' ? 'cleanse' : detail.category === '버프' ? 'buff' : detail.category === '디버프' ? 'debuff' : 'combat'}"><div class="skill-detail-title"><span>◈ 스킬 상세 <b class="skill-category">${detail.type}</b></span><b>${skillRank(general)}성 · 사기 −${skillPower(general)}</b></div><div class="skill-detail-grid"><div><small>발동</small><strong>${escapeHtml(detail.trigger)}</strong></div><div><small>대상</small><strong>${escapeHtml(detail.target)}</strong></div><div class="skill-detail-wide"><small>효과</small><strong>${escapeHtml(detail.effect)}</strong></div><div><small>유형</small><strong>${escapeHtml(detail.duration)}</strong></div><div><small>쿨다운</small><strong>${escapeHtml(detail.cooldown)}</strong></div>${extra}</div></div>`
  }


  private generalCard(general: General, inFormation: boolean): string {
    const meta = GRADE_META[general.grade]
    const portraitPath = this.portraitAsset(general)
    return `<article class="general-card ${inFormation ? 'is-deployed' : ''}" style="--accent:${general.accent};--grade:${meta.color}"><div class="card-art"><div class="art-grid"></div><div class="art-spark has-portrait" style="--portrait:url('${portraitPath}')">${general.portrait}</div><div class="grade-tag"><span>${general.grade}</span><small>${meta.label}</small></div><div class="deploy-tag">${inFormation ? '출전 중' : '대기'}</div></div><div class="general-card-body"><div class="general-line"><div><h3>${general.name}<span class="star-row">${'★'.repeat(general.stars)}${'☆'.repeat(5 - general.stars)}</span></h3><p>${general.epithet}</p></div><span class="role-tag">${general.role}</span></div><div class="level-line"><span>Lv.${general.level}</span><span>전투력 <b>${formatNumber(combatPower(general))}</b></span></div><div class="stat-bars stat-bars--attributes">${this.attributeRows(general)}</div><div class="skill-preview"><span>◈ ${general.skillName} · ${skillDetail(general).type} · 사기 −${skillPower(general)}</span><small>${general.skillDescription}</small></div>${this.skillDetailPanel(general)}<div class="general-actions"><button class="mini-action mini-action--deploy" data-action="formation" data-id="${general.id}">${inFormation ? '편성 해제' : '출전 편성'}</button><button class="mini-action" data-action="upgrade" data-id="${general.id}">강화 <span>＋</span></button>${general.skillUnlocked ? `<span class="skill-ready">스킬 ${skillRank(general)}성</span>` : `<button class="mini-action mini-action--skill" data-action="skill" data-id="${general.id}">${general.level >= skillUnlockLevel(general) ? '스킬 해금' : `Lv.${skillUnlockLevel(general)} 해금`} <span>◈</span></button>`}</div></div></article>`
  }

  private codexCard(general: General, owned: boolean): string {
    const meta = GRADE_META[general.grade]
    const hidden = owned ? '' : ' codex-card--locked'
    return `<article class="codex-card${hidden}" style="--accent:${general.accent};--grade:${meta.color}"><div class="codex-card-art">${this.portrait(general, 'codex-portrait')}<span class="codex-grade">${general.grade} · ${meta.label}</span><span class="codex-state">${owned ? '영입 완료' : '미영입'}</span></div><div class="codex-card-body"><div class="codex-card-heading"><div><h3>${owned ? general.name : '???'}</h3><p>${owned ? general.epithet : '모집으로 인장을 해금하십시오.'}</p></div><span>${owned ? general.role : '잠김'}</span></div>${owned ? `<div class="codex-stat-line"><span>Lv.${general.level}</span><b>${formatNumber(combatPower(general))}</b><small>${general.skillName}</small></div>${this.skillDetailPanel(general)}` : '<div class="codex-lock-note">옥패의 기록이 아직 닫혀 있습니다.</div>'}</div></article>`
  }

  private formationSlot(state: StrategyState, index: number): string {
    const id = state.formation[index]
    const general = id ? state.generals.find(item => item.id === id) : undefined
    if (!general) return `<div class="formation-slot formation-slot--empty"><span>${String(index + 1).padStart(2, '0')}</span><strong>빈 슬롯</strong><small>대기 무장을 선택하십시오.</small></div>`
    const loadout = state.equipmentLoadouts[general.id] ?? {}
    const equipment = (['weapon', 'armor', 'accessory'] as EquipmentType[]).map(type => {
      const itemId = loadout[type]
      const item = itemId ? this.equipmentById(state).get(itemId) : undefined
      return `<div class="formation-equipment-chip ${item ? 'is-equipped' : ''}"><span>${EQUIPMENT_TYPE_META[type].icon}</span><strong>${item ? escapeHtml(item.name) : '비어 있음'}</strong>${item ? `<button class="formation-unequip" data-action="equipment-unequip" data-equipment-type="${type}" data-general-id="${general.id}">해제</button>` : ''}</div>`
    }).join('')
    return `<div class="formation-slot formation-slot--filled" style="--accent:${general.accent}"><button class="formation-slot-main" data-action="formation" data-id="${general.id}"><span class="formation-slot-index">${String(index + 1).padStart(2, '0')}</span>${this.portrait(general, 'formation-portrait')}<strong>${general.name}</strong><small>${general.role} · Lv.${general.level}</small><b>${formatNumber(combatPower(general) + equipmentPowerForUi(state, general.id))}</b><em>클릭해 편성 해제</em></button><div class="formation-equipment"><span class="formation-equipment-label">장착 장비</span>${equipment}</div></div>`
  }

  private formationBenchCard(general: General): string {
    return `<article class="formation-bench-card" style="--accent:${general.accent}">${this.portrait(general, 'formation-bench-portrait')}<div><strong>${general.name}</strong><small>${general.role} · ${GRADE_META[general.grade].label} · Lv.${general.level}</small></div><b>${formatNumber(combatPower(general))}</b><button class="mini-action mini-action--deploy" data-action="formation" data-id="${general.id}">편성</button></article>`
  }

  private scenarioSection(state: StrategyState): string {
    const selected = scenarioById(this.scenarioSelectedId) ?? SCENARIOS[0]
    const chapters = [...new Set(SCENARIOS.map(scenario => scenario.chapter))]
    const selectedCleared = Boolean(selected && state.scenarioCleared.includes(selected.id))
    const dialogue = selected?.dialogue.map(line => `<div class="scenario-dialogue-line"><b>${escapeHtml(line.speaker)}</b><p>${escapeHtml(line.text)}</p></div>`).join('') ?? ''
    const reward = selected?.reward
    const cards = chapters.map(chapter => `<div class="scenario-chapter"><div class="scenario-chapter-head"><span>${chapter}</span><strong>${escapeHtml(SCENARIOS.find(scenario => scenario.chapter === chapter)?.era ?? '')}</strong><small>${SCENARIOS.filter(scenario => scenario.chapter === chapter && state.scenarioCleared.includes(scenario.id)).length}/${SCENARIOS.filter(scenario => scenario.chapter === chapter).length} 클리어</small></div><div class="scenario-list">${SCENARIOS.filter(scenario => scenario.chapter === chapter).map(scenario => `<article class="scenario-card ${scenario.id === selected?.id ? 'is-selected' : ''} ${state.scenarioCleared.includes(scenario.id) ? 'is-cleared' : ''}"><button class="scenario-card-select" data-action="scenario-select" data-scenario-id="${scenario.id}"><span class="scenario-year">${scenario.year}</span><span><strong>${escapeHtml(scenario.title)}</strong><small>${escapeHtml(scenario.summary)}</small></span><b>${state.scenarioCleared.includes(scenario.id) ? `완료 ${'★'.repeat(scenarioStars(state.scenarioCleared, scenario.id))}` : '미완료'}</b></button><button class="mini-action scenario-card-start" data-action="scenario-start" data-scenario-id="${scenario.id}">${state.scenarioCleared.includes(scenario.id) ? '다시 전투' : '전투 실행'} <span>→</span></button></article>`).join('')}</div></div>`).join('')
    return `<section class="page-section page-section--scenario"><div class="section-heading section-heading--compact"><div><span class="eyebrow">CHRONICLE SCENARIO · 04</span><h1>시나리오</h1><p class="heading-copy">184년부터 263년까지, 삼국지의 주요 사건을 대화와 전투로 직접 지휘하십시오.</p></div><div class="section-counter"><span>연대기 진행</span><strong>${SCENARIOS.filter(scenario => state.scenarioCleared.includes(scenario.id)).length}<small> / ${SCENARIOS.length}</small></strong></div></div><div class="scenario-layout"><div class="scenario-chapter-list">${cards}</div><aside class="scenario-detail glass-card"><span class="pill pill--jade">${selected?.year ?? ''} · ${escapeHtml(selected?.era ?? '')}</span><h2>${escapeHtml(selected?.title ?? '시나리오를 선택하십시오')}</h2><p>${escapeHtml(selected?.summary ?? '')}</p><div class="scenario-dialogue">${dialogue}</div><div class="scenario-deck"><span class="eyebrow">RECOMMENDED DECK</span><strong>${selected?.deck.map(escapeHtml).join(' · ') ?? '—'}</strong></div><div class="scenario-deck scenario-enemy"><span class="eyebrow">ENEMY · 평균 Lv.${selected ? scenarioEnemyLevel(selected) : 1}</span><strong>${selected ? scenarioEnemyIds(selected, state.faction).map(id => escapeHtml(templateGeneral(id)?.name ?? id)).join(' · ') : '—'}</strong><small class="scenario-stars">${selected ? `최고 기록 ${'★'.repeat(scenarioStars(state.scenarioCleared, selected.id))}${'☆'.repeat(3 - scenarioStars(state.scenarioCleared, selected.id))}${scenarioStars(state.scenarioCleared, selected.id) >= 3 ? ' · 자동 전투 가능' : ' · 별 3개면 자동 전투'}` : ''}</small></div><div class="scenario-reward"><span class="eyebrow">CLEAR REWARD${selectedCleared ? ' · 획득 완료' : ''}</span><p>금화 +${reward?.gold ?? 0} · 명망 +${reward?.honor ?? 0} · 은전 +${reward?.silver ?? 0} · 병서 +${reward?.manuals ?? 0}</p><small>식량 +${reward?.grain ?? 0} · 목재 +${reward?.wood ?? 0} · 철 +${reward?.iron ?? 0} · 영향력 +${reward?.influence ?? 0}</small><em class="scenario-replay-note">완료 후 재전투 가능 · 최초 클리어 보상은 1회만 지급</em></div><button class="action-button action-button--primary scenario-start-button" data-action="scenario-start" data-scenario-id="${selected?.id ?? ''}">${selectedCleared ? '다시 전투하기' : '시나리오 출전'} <span>→</span></button></aside></div></section>`
  }

  private battleSection(state: StrategyState): string {
    const battle = this.latestBattle
    const active = Boolean(battle?.active)
    const lanes = ['↙ 좌측', '↑ 중앙', '↘ 우측']
    const units = state.formation.map((id, index) => {
      const general = state.generals.find(item => item.id === id)
      if (!general) return ''
      const live = battle?.units[index]
      const pct = live && live.maxTroops ? live.troops / live.maxTroops * 100 : 100
      const detail = skillDetail(general)
      return `<div class="bt-unit ${live?.ready ? 'is-ready' : ''} ${live && !live.alive ? 'is-down' : ''}" data-bt-unit="${index}" style="--accent:${general.accent}"><button class="bt-unit-main" data-action="move" data-index="${index}" aria-label="${general.name} 기동 · 길게 누르면 스킬">${this.portrait(general, 'bt-portrait')}<span class="bt-unit-lane">${lanes[index] ?? ''}</span><strong>${general.name}</strong><small>${general.role} · Lv.${general.level} · ${detail.type}</small><span class="bt-unit-troops"><i data-bt-unit-troops style="width:${pct}%"></i></span></button><button class="bt-unit-skill" data-action="battle-skill" data-index="${index}" ${live?.ready ? '' : 'disabled'}><b>${escapeHtml(live?.skillName ?? general.skillName)}</b><small data-bt-unit-cd>${general.skillUnlocked ? (active ? '대기' : '스킬') : '스킬 잠김'}</small></button></div>`
    }).join('')
    const modeLabel = battle?.mode === 'scenario' ? '시나리오 전투' : battle?.mode === 'siege' ? '공성전' : battle?.mode === 'duel' ? '유저 대련' : '일반 전투'
    const tactic = (id: 'guard' | 'feint' | 'charge', icon: string, label: string, note: string) => `<button class="bt-tactic bt-tactic--${id}" data-action="battle-tactic" data-tactic="${id}" ${id === 'guard' ? 'data-bt-guard' : ''} disabled><span>${icon}</span><strong>${label}</strong><small>${note}</small><em>${battle?.tacticCosts[id] ?? { guard: 35, feint: 50, charge: 65 }[id]}</em></button>`
    return `<section class="page-section page-section--battle">
<div class="bt-top">
<div class="bt-hud glass-card"><div class="bt-hud-row"><span class="bt-phase" data-bt-phase>${battle?.phaseName ?? '1막 · 서전'}</span><b data-bt-morale-text>적 사기 ${battle?.moraleValue ?? 80} / ${battle?.moraleMax ?? 80}</b></div><div class="bt-bar bt-bar--morale"><i data-bt-morale style="width:${battle?.morale ?? 100}%"></i></div><div class="bt-hud-row bt-hud-row--threat"><span>위협도 <b data-bt-threat-text>${battle?.threat ?? 0}</b></span><div class="bt-bar bt-bar--threat"><i data-bt-threat style="width:${battle?.threat ?? 0}%"></i></div><b class="bt-collapse" data-bt-collapse>붕괴 ${battle?.collapses ?? 0}/2</b></div><div class="bt-hud-meta"><span class="bt-mode">${modeLabel}</span><span data-bt-status>${battle?.status ?? '대기 중'}</span><span class="bt-time" data-bt-time>제한 90초</span><span data-bt-combo>연계 ${battle?.combo ?? 0}</span><span data-bt-pressure>적 압박 ×1.00</span><span data-bt-bond>${escapeHtml(battle?.bond ? `인연 · ${battle.bond}` : '인연 없음')}</span></div></div>
<div class="bt-enemies glass-card"><span class="bt-enemies-label">상대 무장</span><div class="bt-enemy-row" data-bt-enemies>${this.enemyHudMarkup(battle?.opponentDeck)}</div></div>
</div>
<div class="bt-stage"><div class="bt-paused" data-bt-paused hidden><strong>일시 정지</strong><small>전투 시간과 적의 행동이 멈췄습니다.</small><button class="action-button action-button--primary" data-action="battle-pause">▶ 계속하기</button></div><div class="bt-callout" data-bt-callout><span class="eyebrow">적 전술 예고</span><strong data-bt-pattern>${active ? '다음 예고 대기' : '전투 시작 전'}</strong><p data-bt-warning>적 전술 예고가 뜨면 같은 레인의 무장 버튼을 누르십시오.</p><div class="bt-lanes"><span data-bt-lane="0">↙ 좌</span><span data-bt-lane="1">↑ 중</span><span data-bt-lane="2">↘ 우</span></div><div class="bt-bar bt-bar--window"><i data-bt-window style="width:0%"></i></div></div><div class="bt-enemy-warn" data-bt-enemy-warn hidden></div><div class="bt-feed"><ul class="bt-log" data-bt-log><li>전투 기록이 여기에 표시됩니다.</li></ul><button class="bt-log-toggle" data-action="battle-log">${this.battleLogOpen ? '접기' : '더 보기'}</button><div class="battle-effects" data-battle-effects>${this.battleEffectsMarkup(battle?.activeEffects)}</div></div></div>
<div class="bt-controls glass-card"><div class="bt-units">${units}</div><div class="bt-tactic-row"><div class="bt-gauge"><span data-bt-gauge-text>전술 게이지 ${battle?.tacticGauge ?? 0}</span><div class="bt-bar bt-bar--gauge"><i data-bt-gauge style="width:${battle?.tacticGauge ?? 0}%"></i></div></div>${tactic('guard', '▣', '철벽 태세', '위협·적장 스킬 억제')}${tactic('feint', '⌁', '유인책', '연계 +2')}${tactic('charge', '⚔', '전군 돌격', '연계를 사기 피해로')}</div>${active ? '' : '<button class="action-button action-button--primary battle-start" data-action="battle-start">전투 시작 <span>→</span></button>'}</div>
</section>`
  }

  /** 전투 중 상단 바: 멈춤 · ×2 배속 · 자동(별 3개 시나리오) · 전투 중지 */
  private battleTopControls(): string {
    const battle = this.latestBattle
    return `<div class="topbar-battle"><button class="tb-btn" data-action="battle-pause" data-bt-pause aria-label="일시 정지">${battle?.paused ? '▶ 계속' : '❚❚ 멈춤'}</button><button class="tb-btn ${(battle?.speed ?? 1) >= 2 ? 'is-on' : ''}" data-action="battle-speed" data-bt-speed aria-label="2배속">×2 배속</button>${this.battleAutoAvailable ? `<button class="tb-btn ${battle?.autoPlay ? 'is-on' : ''}" data-action="battle-auto" data-bt-auto>자동</button>` : ''}<button class="tb-btn tb-btn--stop" data-action="battle-stop" data-bt-stop>■ 전투 중지</button></div>`
  }

  /** 상단 HUD의 적 무장 카드(초상·레벨·병력 막대) — Manus 전투 HUD 개선안 */
  private enemyHudMarkup(opponents: BattleOpponent[] = []): string {
    return opponents.length
      ? opponents.map((opponent, index) => `<div class="bt-enemy" data-bt-enemy="${index}"><div class="general-portrait bt-enemy-portrait has-portrait" style="--portrait:url('/assets/generals-realistic-webp/${opponent.id}.webp')"><span>${escapeHtml(opponent.name.slice(0, 1))}</span></div><div><strong>${escapeHtml(opponent.name)}</strong><small>${opponent.role} · Lv.${opponent.level}</small><span class="bt-enemy-troops"><i style="width:100%"></i></span></div></div>`).join('')
      : '<span class="bt-enemies-empty">전투 시작 시 적 무장이 배치됩니다.</span>'
  }


  private accountSection(): string {
    if (this.auth.status !== 'authenticated') {
      return `<section class="page-section page-section--account"><div class="section-heading section-heading--compact"><div><span class="eyebrow">ACCOUNT COMMAND · 06</span><h1>계정 관리</h1><p class="heading-copy">계정 정보를 확인하고 전적 동기화에 사용할 표시 이름을 관리합니다.</p></div></div><div class="glass-card account-gate"><div class="account-gate-mark">◎</div><h2>Manus 계정으로 연결하십시오</h2><p>로그인하면 계정 정보, 천하 랭킹, 전적 동기화를 한 곳에서 관리할 수 있습니다.</p><button class="action-button action-button--primary" data-action="login">Manus 로그인 <span>→</span></button></div></section>`
    }
    if (!this.account) {
      return `<section class="page-section page-section--account"><div class="section-heading section-heading--compact"><div><span class="eyebrow">ACCOUNT COMMAND · 06</span><h1>계정 관리</h1><p class="heading-copy">로그인 계정 정보를 불러오는 중입니다.</p></div><button class="ghost-button" data-action="account-refresh">새로고침 ↻</button></div><div class="glass-card account-loading">계정 정보를 안전하게 불러오고 있습니다…</div></section>`
    }
    const account = this.account
    const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
    const date = (value: string | Date) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    return `<section class="page-section page-section--account"><div class="section-heading section-heading--compact"><div><span class="eyebrow">ACCOUNT COMMAND · 06</span><h1>계정 관리</h1><p class="heading-copy">계정 정보는 로그인한 사용자 본인만 조회하고 수정할 수 있습니다.</p></div><div class="account-badge"><span class="status-dot"></span> 보호된 계정</div></div><div class="account-layout"><div class="glass-card account-profile"><div class="account-profile-head"><div class="account-avatar">${escape(account.name.slice(0, 1) || '장')} </div><div><span class="eyebrow">MANUS IDENTITY</span><h2>${escape(account.name || '장군')}</h2><p>${escape(account.loginMethod)} · ${escape(account.role)}</p></div></div><div class="account-facts"><div><span>계정 번호</span><strong>#${account.id}</strong></div><div><span>가입일</span><strong>${date(account.createdAt)}</strong></div><div><span>최근 로그인</span><strong>${date(account.lastSignedIn)}</strong></div><div><span>마지막 변경</span><strong>${date(account.updatedAt)}</strong></div></div></div><div class="glass-card account-editor"><div class="card-header"><div><span class="eyebrow">PROFILE EDITOR</span><h3>계정 정보 편집</h3></div><span class="sync-label">OWNER ONLY</span></div><form data-account-form><label class="account-field"><span>표시 이름</span><input name="name" value="${escape(account.name)}" maxlength="32" required autocomplete="nickname"><small>천하 랭킹과 전적에 표시되는 이름입니다. 1~32자로 입력할 수 있습니다.</small></label><label class="account-field"><span>이메일</span><input value="${escape(account.email || 'OAuth 제공자에서 비공개')}" readonly><small>인증 제공자가 관리하는 정보는 게임에서 변경하지 않습니다.</small></label><div class="account-editor-actions"><span data-account-feedback>변경 사항을 저장하면 다음 로그인부터도 유지됩니다.</span><button class="action-button action-button--primary" type="submit">변경 저장 <span>→</span></button></div></form></div></div></section>`
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
      body = `<div class="admin-kpis"><div class="glass-card admin-kpi"><span>도감 콘텐츠</span><strong>${catalog.length}</strong><small>전체 등록 장수</small><b class="kpi-up">+50 이번 업데이트</b></div><div class="glass-card admin-kpi"><span>활성 영토</span><strong>${state.cities.filter(city => city.owner === state.faction).length}<em> / ${state.cities.length}</em></strong><small>시즌 01 점령 상태</small><b class="kpi-neutral">정상 운영</b></div><div class="glass-card admin-kpi"><span>출전 진형</span><strong>${state.formation.length}<em> / 3</em></strong><small>현재 배치 장수</small><b class="kpi-up">전투 준비</b></div><div class="glass-card admin-kpi"><span>최고 전투 점수</span><strong>${formatNumber(state.battleScore)}</strong><small>${state.wins}승 · 개인 기록</small><b class="kpi-gold">로컬 기록</b></div></div><div class="admin-grid"><div class="glass-card admin-panel"><div class="card-header"><div><span class="eyebrow">SERVICE HEALTH</span><h3>서비스 상태</h3></div><span class="sync-label">LIVE</span></div><div class="health-row"><span><i class="health-dot"></i> 게임 클라이언트</span><b>정상</b><small>Three.js · Vite</small></div><div class="health-row"><span><i class="health-dot"></i> 전투 시뮬레이션</span><b>정상</b><small>Rapier · 실시간</small></div><div class="health-row"><span><i class="health-dot"></i> 온라인 랭킹</span><b class="health-warn">대기</b><small>로그인 연결 시 활성</small></div><button class="action-button action-button--outline admin-action" data-action="admin-refresh">상태 새로고침 ↻</button></div><div class="glass-card admin-panel"><div class="card-header"><div><span class="eyebrow">RECENT OPERATIONS</span><h3>최근 운영 기록</h3></div><span class="rate-note">최근 24시간</span></div><div class="admin-activity">${activity.map(([time, category, message, tone]) => `<div class="activity-row"><time>${time}</time><span class="activity-mark activity-mark--${tone}"></span><div><b>${category}</b><p>${message}</p></div></div>`).join('')}</div></div></div>`
    } else if (this.adminTab === 'generals') {
      body = `<div class="glass-card admin-panel admin-content-panel"><div class="admin-panel-top"><div><span class="eyebrow">GENERAL CONTENT LIBRARY</span><h3>장수 콘텐츠 관리</h3><p>총 ${catalog.length}명의 장수 카드와 모집 등급을 확인합니다.</p></div><div class="admin-filters">${filters.map(([id, label]) => `<button class="admin-filter ${this.adminFilter === id ? 'is-active' : ''}" data-action="admin-filter" data-admin-filter="${id}">${label}</button>`).join('')}</div></div><div class="admin-general-table"><div class="admin-table-head"><span>장수</span><span>역할</span><span>등급</span><span>레벨</span><span>상태</span></div>${filtered.map(general => `<div class="admin-general-row"><div class="admin-general-name">${this.portrait(general, 'admin-portrait')}<span><b>${general.name}</b><small>${general.skillName}</small></span></div><span>${general.role}</span><strong style="color:${GRADE_META[general.grade].color}">${general.grade} · ${GRADE_META[general.grade].label}</strong><span>Lv.${general.level}</span><em>${state.formation.includes(general.id) ? '출전 중' : '대기'}</em></div>`).join('')}</div><div class="admin-table-foot">표시 ${filtered.length}명 · 전체 도감은 무장 관리에서 확인할 수 있습니다.</div></div>`
    } else if (this.adminTab === 'accounts') {
      const accountRows = this.adminAccounts.map(account => `<div class="admin-account-row"><div class="admin-account-identity"><span class="admin-account-avatar">${escapeHtml((account.name || '장').slice(0, 1))}</span><span><b>${escapeHtml(account.name || '이름 없음')}</b><small>${escapeHtml(account.email || account.openId)}</small></span></div><span>#${account.id}</span><span>${escapeHtml(account.loginMethod)}</span><span class="admin-account-last">${new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(account.lastSignedIn))}</span><span class="admin-role admin-role--${account.role}">${account.role === 'admin' ? '관리자' : '일반 사용자'}</span><button class="mini-action" data-action="admin-role" data-account-id="${account.id}" data-account-role="${account.role === 'admin' ? 'user' : 'admin'}">${account.role === 'admin' ? '일반으로' : '관리자로'}</button></div>`).join('')
      body = `<div class="glass-card admin-panel admin-content-panel"><div class="admin-panel-top"><div><span class="eyebrow">AUTHENTICATED USER DIRECTORY</span><h3>로그인 계정 관리</h3><p>Manus OAuth로 로그인한 사용자와 관리자 권한을 관리합니다.</p></div><button class="ghost-button" data-action="admin-accounts-refresh">계정 새로고침 ↻</button></div><div class="admin-account-toolbar"><label><span>계정 검색</span><input data-admin-account-search value="${escapeHtml(this.adminAccountSearch)}" placeholder="이름·이메일·Open ID 검색"></label><button class="action-button action-button--outline" data-action="admin-account-search">검색</button><span class="admin-directory-count">${this.adminAccounts.length}명 표시</span></div>${this.adminAccountsError ? `<div class="admin-account-gate"><div class="account-gate-mark">◎</div><h3>관리자 권한이 필요합니다</h3><p>${escapeHtml(this.adminAccountsError)}</p><small>현재 계정의 role이 admin인지 확인한 뒤 다시 시도하십시오.</small></div>` : `<div class="admin-account-table"><div class="admin-table-head"><span>계정</span><span>ID</span><span>로그인 방식</span><span>최근 로그인</span><span>권한</span><span>작업</span></div>${accountRows || '<div class="admin-empty-row">표시할 로그인 계정이 없습니다.</div>'}</div><div class="admin-table-foot">계정 목록은 서버의 관리자 전용 라우터에서 조회됩니다. 권한 변경은 데이터베이스에 저장됩니다.</div>`}</div>`
    } else if (this.adminTab === 'board') {
      const boardRows = this.adminBoard.posts.map(post => `<article class="admin-board-row"><div><span class="pill pill--jade">${escapeHtml(post.board)}</span><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(post.authorName)} · ${escapeHtml(post.authorFaction)}</small></div><button class="mini-action" data-action="admin-board-delete" data-post-id="${post.id}">관리자 삭제</button></article>`).join('')
      body = `<div class="glass-card admin-panel admin-content-panel"><div class="admin-panel-top"><div><span class="eyebrow">BOARD MODERATION</span><h3>게시판 운영 관리</h3><p>관리자는 모든 게시글을 삭제할 수 있고, 일반 사용자의 새 글 작성을 제한할 수 있습니다.</p></div><button class="ghost-button" data-action="admin-board-refresh">게시판 새로고침 ↻</button></div><div class="admin-board-control"><div><strong>일반 사용자 글 작성</strong><small>${this.adminBoard.postingEnabled ? '현재 허용 중입니다.' : '현재 제한 중입니다.'}</small></div><button class="action-button ${this.adminBoard.postingEnabled ? 'action-button--outline' : 'action-button--primary'}" data-action="admin-board-posting" data-enabled="${this.adminBoard.postingEnabled ? 'false' : 'true'}">${this.adminBoard.postingEnabled ? '작성 제한하기' : '작성 허용하기'}</button></div><div class="admin-board-list">${boardRows || '<div class="admin-empty-row">현재 게시글이 없습니다.</div>'}</div></div>`
    } else if (this.adminTab === 'game-data') {
      const stateRows = this.adminGameAccounts.map(account => `<div class="game-data-row" data-game-user="${account.id}"><div class="admin-account-identity"><span class="admin-account-avatar">${escapeHtml((account.name || '장').slice(0, 1))}</span><span><b>${escapeHtml(account.name || '이름 없음')}</b><small>${escapeHtml(account.email || account.openId)}</small></span></div>${[['honor', '명망'], ['silver', '은전'], ['gold', '금화'], ['manuals', '병서'], ['wins', '승리'], ['battleScore', '최고 점수'], ['grain', '식량'], ['wood', '목재'], ['iron', '철'], ['influence', '영향력']].map(([field, label]) => `<label><span>${label}</span><input type="number" min="0" data-game-field="${field}" value="${account.game[field as keyof typeof account.game]}"></label>`).join('')}<button class="action-button action-button--primary game-data-save" data-action="admin-game-save" data-account-id="${account.id}">저장</button></div>`).join('')
      body = `<div class="glass-card admin-panel admin-content-panel"><div class="admin-panel-top"><div><span class="eyebrow">ACCOUNT GAME STATE</span><h3>게임 계정 데이터 편집</h3><p>계정별 재화·전적·내정 자원을 수정합니다. 모든 값은 관리자 권한으로 서버에 저장됩니다.</p></div><button class="ghost-button" data-action="admin-game-refresh">데이터 새로고침 ↻</button></div>${this.adminGameDataError ? `<div class="admin-account-gate"><div class="account-gate-mark">◎</div><h3>관리자 권한이 필요합니다</h3><p>${escapeHtml(this.adminGameDataError)}</p></div>` : `<div class="game-data-legend"><span>편집 가능 항목</span><b>재화 5종 · 전적 2종 · 내정 자원 4종</b><small>장수 도감·진형 원본은 무결성 보호를 위해 별도 승인 없이 수정하지 않습니다.</small></div><div class="game-data-list">${stateRows || '<div class="admin-empty-row">게임 계정 데이터가 없습니다.</div>'}</div>`}</div>`
    } else if (this.adminTab === 'season') {
      body = `<div class="admin-grid"><div class="glass-card admin-panel season-control"><div class="card-header"><div><span class="eyebrow">SEASON CONTROL</span><h3>시즌 01 · 황혼의 관문</h3></div><span class="admin-state-chip ${this.adminPublished ? 'is-on' : 'is-off'}">${this.adminPublished ? '게시 중' : '비공개'}</span></div><div class="season-banner"><span>SEASON 01</span><strong>황혼의 관문</strong><small>실시간 전술 전략 캠페인</small></div><div class="season-meta"><span>시작일 <b>2026.10.01</b></span><span>콘텐츠 <b>정상</b></span><span>모집 풀 <b>${allGenerals().length}명</b></span></div><button class="action-button action-button--primary admin-action" data-action="admin-toggle-publish">${this.adminPublished ? '시즌 비공개 전환' : '시즌 게시 재개'} <span>→</span></button></div><div class="glass-card admin-panel"><div class="card-header"><div><span class="eyebrow">ANNOUNCEMENT</span><h3>운영 공지</h3></div><span class="rate-note">시즌 배너</span></div><label class="admin-field"><span>현재 공지 문구</span><input value="황혼의 관문 · 삼국지 장수 50명 업데이트" readonly></label><button class="action-button action-button--outline admin-action" data-action="admin-announce">공지 미리보기 표시</button><p class="admin-note">이 화면의 시즌 변경은 로컬 관리자 미리보기 상태이며 서버 게시 권한을 대신하지 않습니다.</p></div></div>`
    } else {
      body = `<div class="glass-card admin-panel admin-audit"><div class="card-header"><div><span class="eyebrow">AUDIT TRAIL</span><h3>변경 기록</h3></div><span class="sync-label">CHECKPOINT 8ED4135</span></div>${activity.concat([['06:31', '품질 검증', '타입 검사·38개 테스트·프로덕션 빌드 통과', 'jade'] as const]).map(([time, category, message, tone]) => `<div class="audit-row"><time>${time}</time><span class="activity-mark activity-mark--${tone}"></span><div><b>${category}</b><p>${message}</p></div><small>검증됨</small></div>`).join('')}</div>`
    }
    return `<section class="page-section page-section--admin"><div class="admin-heading"><div><span class="eyebrow">WAR ROOM · ADMIN CONSOLE</span><h1>관리자 센터</h1><p class="heading-copy">게임 콘텐츠와 시즌 운영 상태를 한 화면에서 점검합니다.</p></div><div class="admin-live-badge"><i></i><span>운영 콘솔 · 로컬 상태</span></div><a class="admin-balance-link" href="./balance.html">⚖ 밸런스 조정 테스트 열기</a></div><div class="admin-tabs">${tabMarkup}</div>${body}</section>`
  }

  private shopSection(state: StrategyState): string {
    const statLabels: Record<string, string> = { leadership: '통솔', martial: '무력', stratagem: '모략', speed: '속도' }
    const goldCards = GOLD_PACKAGES.map(goldPackage => `<article class="shop-item shop-item--gold glass-card"><div class="shop-item-icon shop-item-icon--gold">${icon('gold')}</div><div class="shop-item-copy"><span class="pill pill--mythic">금화 충전</span><h2>${escapeHtml(goldPackage.name)}</h2><p>${escapeHtml(goldPackage.description)}</p><small>금화 +${goldPackage.gold}개 · 1개당 1,500원</small></div><button class="action-button action-button--primary" data-action="gold-purchase" data-package-id="${goldPackage.id}" ${GOLD_PURCHASE_ENABLED ? '' : 'disabled'}>${GOLD_PURCHASE_ENABLED ? `₩ ${goldPackage.priceKRW.toLocaleString('ko-KR')} · 충전` : '정식 출시 전 구매 잠금'}</button></article>`).join('')
    const resourceCards = RESOURCE_SHOP_PACKAGES.map(product => `<article class="shop-item shop-item--resource glass-card"><div class="shop-item-icon shop-item-icon--resource">${icon(product.resource)}</div><div class="shop-item-copy"><span class="pill pill--resource">자원 패키지</span><h2>${escapeHtml(RESOURCE_META[product.resource].label)} ${product.goldCost}금화</h2><p>${escapeHtml(product.description)}</p><small>${RESOURCE_META[product.resource].label} +${formatNumber(product.amount)} · 금화 ${product.goldCost}개</small></div><button class="action-button action-button--primary" data-action="cash-shop-purchase" data-product-id="${product.id}" ${state.gold < product.goldCost ? 'disabled' : ''}>금화 ${product.goldCost}개로 교환</button></article>`).join('')
    const honorCards = HONOR_SHOP_PACKAGES.map(product => `<article class="shop-item shop-item--honor glass-card"><div class="shop-item-icon shop-item-icon--gold">${icon('honor')}</div><div class="shop-item-copy"><span class="pill pill--resource">명망 패키지</span><h2>${escapeHtml(product.name)}</h2><p>${escapeHtml(product.description)}</p><small>명망 +${formatNumber(product.honor)} · 금화 ${product.goldCost}개</small></div><button class="action-button action-button--primary" data-action="honor-shop-purchase" data-package-id="${product.id}" ${state.gold < product.goldCost ? 'disabled' : ''}>금화 ${product.goldCost}개로 교환</button></article>`).join('')
    const mythicCards = MYTHIC_SHOP_EQUIPMENT.map(item => { const specialty = equipmentSpecialty(item); return `<article class="shop-item shop-item--${item.set} glass-card"><div class="shop-item-icon"><img class="equipment-image--mythic" src="${equipmentImage(item.type)}" alt="${EQUIPMENT_TYPE_META[item.type].label}" /></div><div class="shop-item-copy"><span class="pill pill--mythic">신화 · ${EQUIPMENT_TYPE_META[item.type].label}</span><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.skillDescription)}</p><small>${escapeHtml(EQUIPMENT_SET_META[item.set].label)} · ${statLabels[item.mainStat]} +${item.baseValue} · ${escapeHtml(item.skillName)}</small>${specialty ? `<strong class="shop-specialty">특기 · ${escapeHtml(specialty.label)} · ${escapeHtml(specialty.description)}</strong>` : ''}</div><button class="action-button action-button--primary" data-action="shop-purchase" data-equipment-id="${item.id}" ${state.mythicFragments < 20 ? 'disabled' : ''}>조각 20개로 구매</button></article>` }).join('')
    const cards = this.shopTab === 'gold' ? goldCards : this.shopTab === 'resources' ? resourceCards + honorCards : mythicCards
    const description = this.shopTab === 'gold' ? '금화 1개를 1,500원 기준으로 충전해 자원 패키지를 교환하십시오.' : this.shopTab === 'resources' ? '금화로 영토·강화·연구에 필요한 자원 패키지를 교환합니다.' : '유저 대련 승리로 얻은 신화장비 조각으로 장비를 교환합니다.'
    const notice = this.shopTab === 'gold' ? '정식 출시 전 혜택' : this.shopTab === 'resources' ? '자원 패키지 안내' : '대련 승리 보상'
    const noticeText = this.shopTab === 'gold' ? '정식 출시 전에는 매일 금화 100개를 지급합니다. 금화 테스트 충전은 정식 출시 지시 전까지 잠겨 있습니다.' : this.shopTab === 'resources' ? '기존 현금 자원 패키지는 삭제하고, 자원 25종과 명망 3·5·10·20·50·100금화 패키지를 제공합니다. 금화 1개는 명망 100개로 교환됩니다.' : '유저 대련에서 승리할 때마다 신화장비 조각 1개를 획득합니다. 신화 장비 뽑기는 제공하지 않습니다.'
    return `<section class="page-section page-section--shop"><div class="section-heading section-heading--compact"><div><span class="eyebrow">CELESTIAL MARKET · SHOP</span><h1>상점</h1><p class="heading-copy">${description}</p></div><div class="shop-balances glass-card"><div><span>보유 금화</span><strong>${icon('gold', 'gi--inline')} ${formatNumber(state.gold)}</strong></div><div><span>보유 명망</span><strong>${icon('honor', 'gi--inline')} ${formatNumber(state.honor)}</strong></div><div><span>신화 조각</span><strong>${icon('mythic', 'gi--inline')} ${state.mythicFragments}</strong></div></div></div><div class="shop-tabs" role="tablist"><button class="shop-tab ${this.shopTab === 'gold' ? 'is-active' : ''}" data-action="shop-tab" data-shop-tab="gold">금화 충전 <small>5종</small></button><button class="shop-tab ${this.shopTab === 'resources' ? 'is-active' : ''}" data-action="shop-tab" data-shop-tab="resources">자원·명망 <small>31종</small></button><button class="shop-tab ${this.shopTab === 'mythic' ? 'is-active' : ''}" data-action="shop-tab" data-shop-tab="mythic">신화 장비 <small>12종</small></button></div><div class="shop-notice glass-card"><strong>${notice}</strong><span>${noticeText}</span></div><div class="shop-grid">${cards}</div></section>`
  }

  private updatesSection(): string {
    const completed = [
      ['2026.10.12', '옥패·인장 그림 교체', '무장 모집의 「옥패의 부름」을 붉은 매듭과 술이 달린 비취 옥패(극과 검을 새긴 금 메달) 그림으로, 왼쪽 위 천하 로고를 「天下」 주홍 인장으로 바꿨습니다.', '완료', 'gold'],
      ['2026.10.12', '유저 대련 전투 화면 전환 수정', '유저 대련을 시작해도 시나리오 목록이 그대로 보이던 문제를 고쳐, 바로 전투 화면으로 넘어가도록 했습니다.', '완료', 'jade'],
      ['2026.10.12', '밸런스 조정 테스트 페이지', '아군·적군 3명씩 편성과 장비(세트·등급·강화)를 정하고 게임과 같은 전투 규칙으로 수십~수천 판을 시뮬레이션해 승률·별 분포·전투 시간·무장별 스킬 기여를 봅니다. 한 판 상세 기록, 레벨 차이 분석, 설정 공유 링크를 지원합니다. 정식 출시 전에는 누구나, 출시 후에는 운영자 계정만 열 수 있습니다.', '완료', 'jade'],
      ['2026.10.12', '자동 편성 · 자동 장착', '출전 편성 화면에 자동 편성(전투력 상위 10명 중 인연·병종 조합까지 따져 3명 선택, 가운데에 방어형 배치), 자동 장착(출전 무장마다 세트 효과를 포함해 가장 좋은 장비 조합), 둘을 한 번에 하는 버튼을 넣었습니다. 장비 관리 화면에서도 자동 장착을 쓸 수 있습니다.', '완료', 'gold'],
      ['2026.10.12', '전투 상단 바', '전투 중 화면 맨 위에 멈춤·×2 배속·전투 중지 버튼을 넣었습니다. 멈추면 전투 시간과 적의 행동이 모두 멈추고, 전투 중지는 한 번 더 눌러 확인하면 보상 없이 시나리오 목록으로 돌아갑니다. ×2 배속은 처음부터 쓸 수 있습니다.', '완료', 'gold'],
      ['2026.10.12', '황건적 무장 5명 합류', '장각(5등급 책사)·장보(4등급 책사)·장량(4등급 보병)·관해(3등급 보병)·주창(3등급 기병)을 모집할 수 있습니다. 새 스킬 체계에 맞춘 고유 스킬·패시브와 장각의 각성, 인연 「황천당립」(3명 이상 편성 시 공격 +5%, 계략 쿨다운 −1초)을 넣었고, 184~190년 시나리오의 적으로도 등장합니다.', '완료', 'gold'],
      ['2026.10.12', '무장 스킬 재구성', '70명 모두 고사에 맞는 고유 스킬로 바꾸고 3성 패시브·5성 각성·인연 7종을 더했습니다. 스킬 한 번의 사기 피해는 최대 40, 쿨다운은 무장마다 따로 돕니다. 이름이 바뀐 스킬 12개: 정군산 일격(황충), 가정 고지(왕평), 장팔사모(장포), 견벽청야(사마의), 여츤결사(방덕), 번성 해위(서황), 발시담목(하후돈), 호가십팔박(채문희), 북해 구원(태사자), 서량 철기 대열(마등), 오두미도(장로), 적토 헌상(송헌).', '완료', 'gold'],
      ['2026.10.12', '전투 개편', '적 사기를 0으로 만들면 다음 막, 3막을 넘기면 승리합니다(제한 90초). 예고 하나에 첫 입력만 판정하고 순서는 무작위입니다. 2막 양익 협공·3막 적장 돌격, 적장 스킬 예고, 전열 붕괴(2회 패배), 방어·병종 상성 피해, 별 3개 평가와 별에 따른 반복 보상, 시나리오별 실제 상대 덱을 넣었습니다. 무장 버튼을 길게 누르면 스킬입니다.', '완료', 'gold'],
      ['2026.10.11', '장비 관리 무장 선택 정렬 개선', '장비 관리의 장착 무장 선택 목록을 장비 효과가 반영된 실제 전투력 높은 순으로 정렬하고, 등급·레벨·이름을 보조 기준으로 적용했습니다.', '완료', 'gold'],
      ['2026.10.11', '도시 내정 수확 보상 10배 상향', '아군 진영이 점령한 도시의 일일 내정 수확 보상을 식량·은전·목재·철·영향력 모두 10배로 상향했습니다. 도시 등급, 건물, 연구 보정과 전체 아군 도시 수확 규칙은 그대로 유지됩니다.', '완료', 'gold'],
      ['2026.10.10', '최종 세력전 점령 상태 동기화 수정', '오나라 등 진영이 최종 세력전에서 승리한 뒤 이전 중립 스냅샷으로 되돌아가던 문제를 수정하고, 서버 원장에도 점령 결과를 확정 기록합니다.', '완료', 'gold'],
      ['2026.10.10', '천하영토 방어도 0 도달 규칙 수정', '90% 약화를 별도 하한으로 해석하지 않고 공성 피해가 방어도 0까지 적용되도록 수정했으며, 수비병 전멸 후 최종 세력전을 진행할 수 있게 했습니다.', '완료', 'gold'],
      ['2026.10.09', '시나리오 보상 10배 상향', '금화를 제외한 명망·은전·병서·식량·목재·철·영향력의 최초 클리어 보상을 10배로 조정했습니다.', '완료', 'jade'],
      ['2026.10.09', '시나리오 재전투 중복 보상 차단', '완료한 시나리오는 다시 전투할 수 있지만 명망·은전과 최초 클리어 보상이 반복 지급되지 않도록 수정했습니다.', '완료', 'jade'],
      ['2026.10.08', '상단바 재화 실시간 표시', '정찰 보고 문구를 제거하고 금화·은전·명망·영향력·식량·목재·철의 현재 보유량을 상단바에 표시합니다.', '완료', 'jade'],
      ['2026.10.08', '명망 교환 대형 패키지 추가', '금화 50개와 100개를 각각 명망 5,000개와 10,000개로 교환하는 상점 상품을 추가했습니다.', '완료', 'jade'],
      ['2026.10.08', '무장 뽑기 레벨 초기화', '도감 원본이 고레벨인 황충·제갈량·조운·관우도 새로 뽑으면 1레벨과 미해금 스킬 상태로 획득합니다.', '완료', 'jade'],
      ['2026.10.07', '유저 대련 실제 덱 연동', '인증된 상대의 저장 편성 덱을 서버에서 불러와 실제 무장 3명으로 대련합니다. 실제 상대가 없을 때만 훈련용 더미 덱으로 전환합니다.', '완료', 'jade'],
      ['2026.10.07', '전투 병사 모델링 개선', '보병·궁병·기병별 실사풍 병사 아트, 편성 그림자, 팀 색상 링을 전투 장면에 적용했습니다.', '완료', 'jade'],
      ['2026.10.06', '관리자 센터 접근 제한', '관리자 권한이 있는 계정만 관리자 센터 메뉴와 운영 기능을 볼 수 있도록 보호했습니다.', '완료', 'jade'],
      ['2026.10.06', '로그인 화면 개선', '삼국지 분위기의 배경과 회원 로그인·게스트 로그인 선택 화면을 적용했습니다.', '완료', 'jade'],
      ['2026.10.05', '전투 연출 개선', '피격 반응, 병력 상태 막대, 카메라 움직임, 기술 색상 효과를 추가했습니다.', '완료', 'jade'],
      ['2026.10.07', '통합 상점 업데이트', '일반 재화 5종 보급 상품과 기존 신화 장비 12종 상점을 하나의 탭형 상점으로 통합했습니다. 현재 재화 지급은 테스트 구매 흐름으로 제공됩니다.', '완료', 'jade'],
      ['2026.10.07', '로그아웃 후 로그인 첫 페이지 이동', '로그아웃하면 회원 로그인·게스트 로그인 선택 화면으로 돌아가며, 기존 세션과 게스트 상태를 정리합니다.', '완료', 'jade'],
      ['2026.10.07', '한자 표기 제거 및 한글 대체', '메뉴·장비·스킬·상태·보상 표기를 한글과 중립 기호로 통일하고, 도시의 중국어 병기 정보는 화면에서 숨겼습니다.', '완료', 'jade'],
      ['2026.10.07', '신화 장비 특기 능력', '무기·갑옷·장신구에 각각 10종의 특기를 마련하고, 신화 장비마다 특기 1종을 부여해 장착 장수의 전투력과 상태 계산에 반영했습니다.', '완료', 'jade'],
      ['2026.10.07', '장비 이미지 및 등급 연출', '무기·갑옷·장신구 이미지를 추가하고 보유 장비·상점·장착 슬롯·뽑기 결과에 표시했습니다. 등급 색상과 신화 장비 빛 효과로 희귀도를 구분합니다.', '완료', 'jade'],
      ['2026.10.07', '무장 스킬 정보 상세화', '65명 무장별 스킬에 발동 조건, 대상, 효과 수치, 지속 시간, 재사용 조건을 추가하고 공격·버프·디버프·정화·치료 콘셉트를 전투 상태 효과와 연결했습니다.', '완료', 'jade'],
      ['2026.10.04', '신화 상점 확장', '통솔·무력·모략·속도별 장비 세트와 무기·갑옷·장신구 12종을 상점에 추가했습니다.', '완료', 'jade'],
      ['2026.10.03', '장비 관리 시스템', '장비 뽑기, 장착·해제, 강화, 등급 정렬, 세트 효과를 구현했습니다.', '완료', 'jade'],
      ['2026.10.07', '천하영토 성 아이콘 전체 표시', '천하영토의 25개 성을 빠짐없이 표시하고 화면 크기에 맞게 아이콘 크기와 간격을 조정했습니다.', '완료', 'jade'],
    ] as const
    const planned = [
      ['예정', '시나리오 번호 및 오타 정리', '시나리오 장·절 번호를 2.1, 2.2와 같은 형식으로 통일하고 사건명·설명·대화문의 오타를 정리합니다.'],
      ['예정', '시나리오 등장 무장 재구성', '각 역사적 사건의 시대·세력·전투 맥락에 맞도록 등장 무장과 추천 적 덱을 재검토합니다.'],
      ['예정', '시나리오 단계별 난이도 적용', '장과 에피소드 진행도에 따라 적 덱 레벨·전투력·전투 보정을 단계적으로 상승시킵니다.'],
      ['예정', '상단 재화 아이콘 실사 이미지 적용', '상단 재화 표시 왼쪽의 기호 아이콘을 재화별 실사풍 이미지로 교체하고 작은 화면의 가독성을 유지합니다.'],
      ['예정', '상점 판매 물품 실사 이미지 적용', '상점의 금화·자원·장비 판매 물품에 종류와 일치하는 실사풍 상품 이미지를 적용합니다.'],
      ['예정', '영토·내정 화면 재화 정보 정리', '영토·내정 화면에 중복 표시되는 재화 정보를 제거하고 공통 상단 재화 표시를 사용합니다. 천하영토 진영별 유저 점령 연동과 서버 원장 표시도 함께 정리합니다.'],
      ['예정', '보유 무장 프로필 사진 비율 수정', '보유 무장 카드의 프로필 이미지가 얼굴과 상체를 과도하게 자르지 않도록 데스크톱·모바일 비율을 조정합니다.'],
      ['예정', '전체 메뉴 UI 개편', '사이드바·상단바·본문 메뉴의 정보 구조와 간격, 선택 상태, 화면 전환, 모바일 대응과 주요 버튼 가독성을 개선합니다. 로그아웃 시 로그인 첫 페이지로 안전하게 이동하는 흐름도 함께 정리합니다.'],
    ] as const
    const completedLatestFirst = [...completed].sort((left, right) => right[0].localeCompare(left[0]))
    const completedMarkup = completedLatestFirst.map(([date, title, detail, status, tone]) => `<article class="update-entry"><time>${date}</time><span class="update-mark update-mark--${tone}"></span><div class="update-entry-copy"><div><h3>${title}</h3><span class="update-status update-status--${tone}">${status}</span></div><p>${detail}</p></div></article>`).join('')
    const plannedMarkup = planned.map(([status, title, detail]) => `<article class="update-entry update-entry--planned"><span class="update-mark update-mark--gold"></span><div class="update-entry-copy"><div><h3>${title}</h3><span class="update-status update-status--gold">${status}</span></div><p>${detail}</p></div></article>`).join('')
    return `<section class="page-section page-section--updates"><div class="section-heading section-heading--compact"><div><span class="eyebrow">COMMAND LOG · UPDATE HISTORY</span><h1>업데이트 기록</h1><p class="heading-copy">지금까지 반영된 변경사항과 다음 업데이트 계획을 확인하십시오.</p></div><div class="updates-summary glass-card"><span>반영 완료</span><strong>${completed.length}<small>건</small></strong><em>최신 적용순</em></div></div><div class="updates-layout"><div class="glass-card updates-panel"><div class="card-header"><div><span class="eyebrow">RELEASED UPDATES</span><h2>적용된 업데이트</h2></div><span class="sync-label">최신순</span></div><div class="update-list">${completedMarkup}</div></div><div class="glass-card updates-panel updates-panel--planned"><div class="card-header"><div><span class="eyebrow">NEXT OPERATIONS</span><h2>업데이트 예정</h2></div><span class="rate-note">우선순위</span></div><div class="update-list">${plannedMarkup}</div></div></div><div class="updates-footnote"><span class="status-dot"></span><span>적용된 업데이트는 최신 날짜순으로 표시됩니다.</span><span class="muted">현재 버전 · 2026.10</span></div></section>`
  }

  private rankSection(state: StrategyState): string {
    return `<section class="page-section page-section--rank"><div class="section-heading section-heading--compact"><div><span class="eyebrow">THE CELESTIAL LADDER · 05</span><h1>천하 랭킹</h1><p class="heading-copy">가장 높은 곳에 당신의 군기를 세우십시오.</p></div><button class="ghost-button" data-action="rank-refresh">순위 새로고침 ↻</button></div><div class="rank-layout"><div class="glass-card rank-hero"><div class="rank-hero-bg">★</div><span class="pill pill--jade">ACCOUNT BOARD · WAR-SCORE-V1</span><h2>옥패의 전장</h2><p>로그인 계정으로 기록되는 작전 점수입니다.<br>현재 시즌은 클라이언트 보고형 캐주얼 랭킹으로 운영됩니다.</p><div class="my-record"><span>나의 최고 기록</span><strong>${formatNumber(state.battleScore)}</strong><small>지난 7회 작전 · ${state.wins}승</small></div><div class="auth-status" data-auth-status>로그인하면 리더보드와 전적을 이어갑니다.</div></div><div class="glass-card rank-table"><div class="card-header"><div><span class="eyebrow">TOP COMMANDERS</span><h3>상위 지휘관</h3></div><span class="sync-label">LIVE SYNC</span></div><div data-rank-list>${this.rankRows()}</div><div class="rank-footnote">* 순위 데이터는 저장된 체크포인트 Preview 또는 공개 배포에서 동기화됩니다.</div></div></div><div class="integration-strip"><div><span class="integration-icon">◎</span><div><strong>온라인 기능 준비됨</strong><p>Manus 로그인 · 계정 리더보드 · Stripe 샌드박스</p></div></div><button class="text-button" data-action="store">테스트 상점 보기 →</button></div></section>`
  }

  private boardSection(state: StrategyState): string {
    const tabs: BoardPost['board'][] = ['전체', state.faction]
    const posts = this.boardPosts.filter(post => post.board === this.boardTab)
    const formatDate = (value: string | Date) => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
    return `<section class="page-section page-section--board"><div class="section-heading section-heading--compact"><div><span class="eyebrow">COMMANDER COMMUNITY · BOARD</span><h1>진영 게시판</h1><p class="heading-copy">전체 지휘관과 ${escapeHtml(state.faction)} 진영 동료에게 작전 소식을 전하십시오.</p></div><button class="ghost-button" data-action="board-refresh">게시글 새로고침 ↻</button></div><div class="board-tabs">${tabs.map(tab => `<button class="filter-tab ${this.boardTab === tab ? 'is-active' : ''}" data-action="board-tab" data-board="${tab}">${tab} 게시판</button>`).join('')}</div><div class="board-layout"><div class="glass-card board-list"><div class="card-header"><div><span class="eyebrow">${this.boardTab} BOARD</span><h2>최근 게시글</h2></div><span class="sync-label">최대 100건</span></div>${posts.length ? posts.map(post => `<article class="board-post"><div class="board-post__meta"><span class="pill pill--jade">${escapeHtml(post.authorFaction)}</span><strong>${escapeHtml(post.authorName)}</strong><time>${formatDate(post.createdAt)}</time></div><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.content).replace(/\n/g, '<br>')}</p>${post.canDelete ? `<form class="board-delete-form" data-board-delete-form><input type="hidden" name="postId" value="${post.id}"><input name="password" type="password" minlength="4" maxlength="64" placeholder="삭제 비밀번호" required><button class="text-button" type="submit">내 글 삭제</button></form>` : ''}</article>`).join('') : '<div class="board-empty">아직 게시글이 없습니다. 첫 번째 작전 기록을 남겨 보십시오.</div>'}</div><div class="glass-card board-compose"><div class="card-header"><div><span class="eyebrow">WRITE DISPATCH</span><h2>새 글 작성</h2></div></div><form data-board-form><label>게시판<select name="board">${tabs.map(tab => `<option value="${tab}" ${this.boardTab === tab ? 'selected' : ''}>${tab} 게시판</option>`).join('')}</select></label><label>제목<input name="title" maxlength="120" placeholder="작전 제목을 입력하세요" required></label><label>내용<textarea name="content" rows="7" maxlength="4000" placeholder="진영에 전할 내용을 작성하세요" required></textarea></label><label>삭제 비밀번호<input name="password" type="password" minlength="4" maxlength="64" placeholder="4자 이상 · 삭제할 때 필요" required></label><button class="action-button action-button--primary" type="submit">게시글 올리기 <span>→</span></button></form><p class="board-note">삭제 비밀번호는 서버에 해시로 저장되며, 작성자 본인만 글을 삭제할 수 있습니다.</p></div></div></section>`
  }
  private duelSection(state: StrategyState): string {
    const formationReady = state.formation.length >= 3
    const opponents = this.duelOpponents.length ? this.duelOpponents : [{ id: 'dummy-1', displayName: '훈련용 더미 덱', score: 16800, isDummy: true }]
    return `<section class="page-section page-section--duel"><div class="section-heading section-heading--compact"><div><span class="eyebrow">USER DUEL · ARENA</span><h1>유저 대련</h1><p class="heading-copy">다른 지휘관의 전력을 분석하고, 선택한 상대의 덱과 실시간으로 겨루십시오.</p></div><button class="ghost-button" data-action="duel-refresh">상대 새로고침 ↻</button></div><div class="duel-hero glass-card"><div><span class="pill pill--jade">실시간 대련 · ${formationReady ? '출전 준비 완료' : '편성 필요'}</span><h2>상대 덱을 선택하십시오</h2><p>온라인 유저 목록이 비어 있으면 균형 잡힌 훈련용 더미 덱을 자동으로 제공합니다.</p><div class="duel-daily-limit"><strong>오늘 남은 대련 ${duelAttemptsRemaining(state)}회</strong><span>매일 5회 · 승리 시 신화장비 조각 +1</span></div></div><div class="duel-hero-mark">⚔</div></div><div class="duel-list">${opponents.map((opponent, index) => `<article class="duel-opponent glass-card ${opponent.isDummy ? 'is-dummy' : ''}"><div class="duel-rank">${String(index + 1).padStart(2, '0')}</div><div class="duel-avatar">${escapeHtml(opponent.displayName.slice(0, 1))}</div><div class="duel-opponent-copy"><strong>${escapeHtml(opponent.displayName)}</strong><span>${opponent.isDummy ? '훈련용 더미 덱 · 자동 생성' : '온라인 지휘관'} · 전적 점수 ${formatNumber(opponent.score)}</span></div><button class="action-button action-button--primary" data-action="duel-start" data-opponent-id="${escapeHtml(opponent.id)}">대련 신청 <span>→</span></button></article>`).join('')}</div></section>`
  }

  private rankRows(): string {
    const rows = this.ranks.length ? this.ranks : [
      { rank: 1, displayName: '서릿발의 군기', score: 48220 },
      { rank: 2, displayName: '청람 행렬', score: 44180 },
      { rank: 3, displayName: '무영의 책사', score: 39840 },
      { rank: 4, displayName: '남쪽의 불꽃', score: 32760 },
    ]
    return rows.map(entry => `<div class="rank-row"><span class="rank-number rank-number--${entry.rank}">${entry.rank.toString().padStart(2, '0')}</span><span class="rank-avatar">${entry.displayName.slice(0, 1)}</span><strong>${entry.displayName}</strong><span class="rank-score">${formatNumber(entry.score)}</span></div>`).join('')
  }

  private miniGeneral(general: General): string {
    return `<div class="mini-general">${this.portrait(general)}<div><strong>${general.name}</strong><small>Lv.${general.level} · ${general.role}</small></div><b>${general.stars}★</b></div>`
  }

  private handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement
    const button = target.closest<HTMLElement>('[data-action]')
    if (!button) return
    const action = button.dataset.action
    if (button.dataset.opponentId) {
      this.callbacks.onDuelStart(button.dataset.opponentId)
      return
    }
    if (action === 'section') this.callbacks.onSection((button.dataset.section ?? 'overview') as Section)
    else if (action === 'summon-tab') {
      this.summonTab = button.dataset.summonTab === 'equipment' ? 'equipment' : 'generals'
      if (this.renderedState) this.render(this.renderedState)
    }
    else if (action === 'recruit') this.callbacks.onRecruit(Number(button.dataset.count ?? 1))
    else if (action === 'upgrade') this.callbacks.onUpgrade(button.dataset.id ?? '')
    else if (action === 'skill') this.callbacks.onSkill(button.dataset.id ?? '')
    else if (action === 'formation') this.callbacks.onFormation(button.dataset.id ?? '')
    else if (action === 'auto-formation') this.callbacks.onAutoFormation(button.dataset.withEquipment === '1')
    else if (action === 'auto-equip') this.callbacks.onAutoEquip()
    else if (action === 'equipment-draw') this.callbacks.onEquipmentDraw(Number(button.dataset.count ?? 1))
    else if (action === 'equipment-enhance') this.callbacks.onEquipmentEnhance(button.dataset.equipmentId ?? '')
    else if (action === 'equipment-equip') this.callbacks.onEquipmentEquip(button.dataset.generalId ?? '', button.dataset.equipmentId ?? '')
    else if (action === 'equipment-unequip') this.callbacks.onEquipmentUnequip(button.dataset.generalId ?? '', (button.dataset.equipmentType ?? 'weapon') as EquipmentType)
    else if (action === 'roster-sort') {
      this.rosterSort = (button as HTMLSelectElement).value as RosterSort
      if (this.renderedState) this.render(this.renderedState)
    } else if (action === 'roster-sort-direction') {
      this.rosterSortDescending = !this.rosterSortDescending
      if (this.renderedState) this.render(this.renderedState)
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
    else if (action === 'research') this.callbacks.onResearch(button.dataset.research ?? '')
    else if (action === 'scenario-select') { this.scenarioSelectedId = button.dataset.scenarioId ?? this.scenarioSelectedId; if (this.renderedState) this.render(this.renderedState) }
    else if (action === 'scenario-start') this.callbacks.onScenarioStart(button.dataset.scenarioId ?? '')
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
    else if (action === 'shop-purchase') this.callbacks.onShopPurchase(button.dataset.equipmentId ?? 'shop-mythic-martial-weapon')
    else if (action === 'cash-shop-purchase') this.callbacks.onCashShopPurchase(button.dataset.productId ?? '')
    else if (action === 'honor-shop-purchase') this.callbacks.onHonorShopPurchase(button.dataset.packageId ?? '')
    else if (action === 'gold-purchase') this.callbacks.onGoldPurchase(button.dataset.packageId ?? '')
    else if (action === 'shop-tab') {
      this.shopTab = button.dataset.shopTab === 'mythic' ? 'mythic' : button.dataset.shopTab === 'resources' ? 'resources' : 'gold'
      if (this.renderedState) this.render(this.renderedState)
    }
    else if (action === 'admin-tab') {
      this.adminTab = button.dataset.adminTab ?? 'overview'
      this.callbacks.onAdminAction(`관리자 탭을 「${button.textContent?.trim() ?? '운영 개요'}」로 전환했습니다.`)
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
      if (id && window.confirm('이 게시글을 관리자 권한으로 삭제하시겠습니까?')) this.callbacks.onAdminBoardDelete(id)
    } else if (action === 'admin-game-save') {
      const row = button.closest<HTMLElement>('[data-game-user]')
      const userId = Number(button.dataset.accountId)
      const values = Object.fromEntries(Array.from(row?.querySelectorAll<HTMLInputElement>('[data-game-field]') ?? []).map(input => [input.dataset.gameField, Number(input.value)])) as Record<string, number>
      if (Number.isInteger(userId) && userId > 0 && Object.values(values).every(value => Number.isInteger(value) && value >= 0)) {
        this.callbacks.onAdminGameDataSave({ userId, honor: values.honor, silver: values.silver, gold: values.gold, manuals: values.manuals, wins: values.wins, battleScore: values.battleScore, grain: values.grain, wood: values.wood, iron: values.iron, influence: values.influence, updatedAt: new Date() })
      }
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
