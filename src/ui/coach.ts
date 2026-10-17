import { BATTLE_EFFECTS, type BattleEffectId } from '../game/battle-effects'
// 따라하기 안내(코치): 화면의 한 곳을 밝게 비추고 말풍선으로 설명한다.
// 메뉴 짚어 주기, 첫 전투 따라하기, 전투 규칙 도움말, 처음 접속 소개가 모두 여기 있다.
import type { BattleSnapshot } from '../game/arena'

const esc = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
const store = {
  get(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } },
  set(key: string, value: string): void { try { localStorage.setItem(key, value) } catch { /* 저장 못 해도 진행 */ } },
  remove(key: string): void { try { localStorage.removeItem(key) } catch { /* 무시 */ } },
}

const MENU_KEY = 'cheonharo.coach.menus'
const BATTLE_KEY = 'cheonharo.coach.battle'
const INTRO_KEY = 'cheonharo.intro.seen'

export interface CoachStep {
  /** 비출 곳(CSS 선택자). 없거나 화면에 없으면 가운데 말풍선만 */
  target?: string
  title: string
  body: string
  /** 'click'이면 비춘 버튼을 직접 눌러야 넘어간다 */
  expect?: 'click'
}

interface ShowOptions { index?: number; total?: number; onNext: () => void; onSkip: () => void; nextLabel?: string; /** 건너뛸 수 없는 안내(첫 입장 튜토리얼) */ forced?: boolean; seal?: string; waitLabel?: string }

/** 화면 한 곳 비추기 + 말풍선 */
export class Coach {
  private layer: HTMLElement | null = null
  private frame = 0
  private target = ''

  get active(): boolean { return Boolean(this.layer) }

  show(step: CoachStep, options: ShowOptions): void {
    this.hide()
    const layer = document.createElement('div')
    layer.className = `coach-layer ${step.expect === 'click' ? 'coach-layer--click' : ''} ${options.forced ? 'coach-layer--forced' : ''}`
    const counter = options.total && options.total > 1 ? `<span class="coach-count">${(options.index ?? 0) + 1} / ${options.total}</span>` : ''
    const next = step.expect === 'click'
      ? `<span class="coach-wait">${esc(options.waitLabel ?? '빛나는 버튼을 누르십시오')}</span>`
      : `<button class="coach-next" data-coach-next>${esc(options.nextLabel ?? '다음')} →</button>`
    layer.innerHTML = `<div class="coach-block"></div><div class="coach-spot"></div><div class="coach-bubble" role="dialog" aria-live="polite"><div class="coach-head"><span class="coach-seal">${esc(options.seal ?? '안내')}</span>${counter}</div><strong>${esc(step.title)}</strong><p>${esc(step.body)}</p><div class="coach-actions">${options.forced ? '' : '<button class="coach-skip" data-coach-skip>안내 건너뛰기</button>'}${next}</div></div>`
    layer.querySelector('[data-coach-next]')?.addEventListener('click', () => { this.hide(); options.onNext() })
    layer.querySelector('[data-coach-skip]')?.addEventListener('click', () => { this.hide(); options.onSkip() })
    document.body.appendChild(layer)
    document.body.classList.add('coach-open')
    this.layer = layer
    this.target = step.target ?? ''
    const element = this.target ? document.querySelector<HTMLElement>(this.target) : null
    this.lastScroll = 0
    if (element && visible(element)) this.keepInView(element, true)
    this.place()
    requestAnimationFrame(() => layer.classList.add('is-visible'))
  }

  hide(): void {
    cancelAnimationFrame(this.frame)
    this.layer?.remove()
    this.layer = null
    document.body.classList.remove('coach-open')
  }

  private lastScroll = 0

  /** 화면 아래에 붙은 메뉴(모바일)의 높이: 그 위까지만 보이는 곳으로 친다 */
  private bottomCover(): number {
    const sidebar = document.querySelector<HTMLElement>('.sidebar')
    if (!sidebar) return 0
    const rect = sidebar.getBoundingClientRect()
    // 화면 아래쪽에 가로로 붙어 있을 때만(모바일 하단 메뉴)
    return rect.top > window.innerHeight * 0.4 && rect.width > window.innerWidth * 0.6 ? Math.max(0, window.innerHeight - rect.top) : 0
  }

  /** 비춘 버튼이 상단 바·하단 메뉴에 가리거나 화면 밖이면 보이는 곳으로 굴린다(다시 그려져 위치가 바뀌어도 계속) */
  private keepInView(element: HTMLElement, first = false): void {
    const now = performance.now()
    if (!first && now - this.lastScroll < 700) return
    const rect = element.getBoundingClientRect()
    const top = 84, bottom = window.innerHeight - this.bottomCover() - 16
    if (rect.top >= top && rect.bottom <= bottom) return
    this.lastScroll = now
    const room = bottom - top
    element.scrollIntoView({ block: rect.height > room * 0.8 ? 'start' : 'center', behavior: first ? 'smooth' : 'auto' })
    // 가운데로 굴려도 하단 메뉴에 가리면 그만큼 더 올린다
    const after = element.getBoundingClientRect()
    if (after.bottom > bottom) scrollerOf(element).scrollBy(0, after.bottom - bottom + 12)
  }

  /** 대상이 다시 그려지거나 화면이 움직여도 따라간다 */
  private place = (): void => {
    const layer = this.layer
    if (!layer) return
    const spot = layer.querySelector<HTMLElement>('.coach-spot')!
    const bubble = layer.querySelector<HTMLElement>('.coach-bubble')!
    const element = this.target ? document.querySelector<HTMLElement>(this.target) : null
    const vw = window.innerWidth, vh = window.innerHeight
    const bw = Math.min(360, vw - 24)
    bubble.style.width = `${bw}px`
    const bh = bubble.offsetHeight || 180
    if (!element || !visible(element)) {
      layer.classList.add('coach-layer--center')
      spot.style.display = 'none'
      bubble.style.left = `${(vw - bw) / 2}px`
      bubble.style.top = `${Math.max(12, (vh - bh) / 2)}px`
    } else {
      layer.classList.remove('coach-layer--center')
      if (layer.classList.contains('coach-layer--click')) this.keepInView(element)
      const rect = element.getBoundingClientRect()
      const pad = 6
      const top = Math.max(4, rect.top - pad), left = Math.max(4, rect.left - pad)
      const width = Math.min(vw - 8, rect.right + pad) - left, height = Math.min(vh - 8, rect.bottom + pad) - top
      Object.assign(spot.style, { display: 'block', top: `${top}px`, left: `${left}px`, width: `${Math.max(0, width)}px`, height: `${Math.max(0, height)}px` })
      // 말풍선: 아래 → 위 → 안쪽 아래 순으로 자리를 찾는다
      const floor = vh - this.bottomCover() - 8
      let by = top + height + 12
      if (by + bh > floor) by = top - bh - 12
      if (by < 8) by = Math.min(vh - bh - 12, Math.max(8, top + height - bh - 12))
      const bx = Math.min(vw - bw - 12, Math.max(12, left + width / 2 - bw / 2))
      bubble.style.left = `${bx}px`
      bubble.style.top = `${by}px`
    }
    this.frame = requestAnimationFrame(this.place)
  }
}

/** 이 요소를 굴리는 상자(없으면 창) */
function scrollerOf(element: HTMLElement): HTMLElement | Window {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2) return node
  }
  return window
}

function visible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width > 4 && rect.height > 4 && getComputedStyle(element).visibility !== 'hidden'
}

/** 여러 단계를 차례로(대상이 없는 단계는 건너뛴다) */
export function runSteps(coach: Coach, steps: CoachStep[], onFinish: (skipped: boolean) => void): void {
  const shown = steps.filter(step => !step.target || document.querySelector(step.target))
  const go = (index: number) => {
    if (index >= shown.length) { onFinish(false); return }
    coach.show(shown[index], { index, total: shown.length, nextLabel: index === shown.length - 1 ? '알겠습니다' : '다음', onNext: () => go(index + 1), onSkip: () => onFinish(true) })
  }
  go(0)
}

// ───────────────────────── 메뉴 짚어 주기 ─────────────────────────

export const MENU_TOURS: Record<string, CoachStep[]> = {
  overview: [
    { target: '.command-hero', title: '본진', body: '지금 할 일과 다음 시나리오가 여기 나옵니다. 출정 준비를 누르면 바로 전투 화면으로 갑니다.' },
    { target: '.tutorial-card', title: '처음 시작 안내', body: '6단계를 차례로 따라 하면 옥패·은전·병서 보상을 받습니다. 다음에 갈 메뉴는 메뉴에서 반짝입니다.' },
    { target: '.topbar-resources', title: '재화', body: '은전과 병서로 무장을 강화하고, 옥패로 무장을 모집합니다. 금화는 상점에서 이 재화들로 바꿀 수 있습니다.' },
    { target: '.mission-card', title: '임무', body: '매일·매주 임무를 마치면 보상을 받습니다. 하루 임무를 모두 끝내면 추가 보상이 있습니다.' },
  ],
  roster: [
    { target: '.roster-grid .gcard', title: '무장 카드', body: '능력치·스킬·장비를 한눈에 봅니다. 출전 편성을 누르면 전투에 나갈 세 명에 넣습니다.' },
    { target: '.roster-grid .gcard .gcard-up', title: '강화', body: '은전과 병서로 레벨을 올립니다. 레벨이 오르면 능력치와 병력이 늘고, 일정 레벨에서 스킬이 열립니다.' },
    { target: '.roster-toolbar', title: '고르기·정렬', body: '등급·병종으로 골라 보고, 전투력·레벨 순으로 정렬할 수 있습니다.' },
  ],
  formation: [
    { target: '.formation-slots', title: '좌·중·우 세 자리', body: '전투에서 적 경고가 뜨면 같은 자리의 무장으로 막습니다. 자리마다 맞서는 적의 병종도 함께 보세요.' },
    { target: '[data-action="auto-formation"]', title: '자동 편성', body: '전투력·인연·병종을 따져 알아서 세 명을 고릅니다. 처음에는 이것만 눌러도 충분합니다.' },
    { target: '.formation-bench', title: '대기 무장', body: '대기 무장을 눌러 빈자리에 넣거나 바꿉니다.' },
  ],
  recruit: [
    { target: '.recruit-pedestal', title: '무장 모집', body: '옥패로 새 무장을 부릅니다. 10회 모집이 더 싸고, 이미 있는 무장이 나오면 성급이 오릅니다.' },
    { target: '.summon-tabs', title: '모집 · 장비 뽑기', body: '위 탭에서 장비 뽑기로 바꿀 수 있습니다.' },
  ],
  equipment: [
    { target: '.equip-picker', title: '무장 선택', body: '출전한 세 무장이 장비를 몇 칸 채웠는지 보여 줍니다. 눌러서 장비를 볼 무장을 고릅니다.' },
    { target: '[data-action="auto-equip"]', title: '자동 장착', body: '가진 장비 중 가장 좋은 조합을 알아서 장착합니다. 같은 세트를 모으면 세트 효과가 붙습니다.' },
  ],
  research: [
    { target: '.research-active', title: '진행 중인 연구', body: '연구는 한 번에 하나씩, 시간이 걸립니다. 취소하면 재료를 모두 돌려받고, 금화로 즉시 끝낼 수도 있습니다.' },
    { target: '.research-grid', title: '다섯 분야', body: '번영·강병·병략·정복·인재 다섯 분야입니다. 강병·병략 연구는 전투에 바로 효과가 있습니다.' },
  ],
  territory: [
    { target: '.territory-map', title: '영토 지도', body: '도시를 눌러 정보를 보고, 이웃한 적 도시를 공격합니다. 일요일 밤에는 낙양 쟁탈전이 열립니다.' },
    { target: '[data-action="collect-income"]', title: '수확', body: '진영이 가진 도시에서 매일 식량·은전·목재·철을 거둡니다.' },
    { target: '.city-management', title: '도시 관리', body: '건물을 올리면 수확이 늘고 방어가 단단해집니다.' },
  ],
  battle: [
    { target: '.scenario-chapter-list', title: '시나리오', body: '184년 황건적의 난부터 차례로 싸웁니다. 처음 이기면 금화와 성장 재료를 받습니다.' },
    { target: '.scenario-detail', title: '전투 준비', body: '추천 무장, 상대 무장과 레벨, 보상을 확인합니다.' },
    { target: '.scenario-guide-button', title: '전투 규칙', body: '전투 방법이 헷갈리면 언제든 이 버튼으로 그림 설명을 볼 수 있습니다.' },
    { target: '.scenario-start-button', title: '출정', body: '준비가 되면 출정합니다. 첫 전투에서는 방법을 하나씩 안내해 드립니다.' },
  ],
  shop: [
    { target: '.shop-needs', title: '지금 필요한 것', body: '다음 강화·연구·모집에 모자란 재화를 찾아 가장 알맞은 묶음을 추천합니다.' },
  ],
}

function seenMenus(): Set<string> {
  try { return new Set(JSON.parse(store.get(MENU_KEY) ?? '[]') as string[]) } catch { return new Set() }
}

/** 처음 들어간 메뉴면 짚어 주기를 시작한다(시작했으면 true) */
/** 튜토리얼에서 이미 다룬 메뉴는 짚어 주기를 건너뛴다 */
export function markMenusSeen(sections: string[]): void {
  const seen = seenMenus()
  sections.forEach(section => seen.add(section))
  store.set(MENU_KEY, JSON.stringify([...seen]))
}

export function maybeMenuTour(coach: Coach, section: string): boolean {
  const steps = MENU_TOURS[section]
  if (!steps || coach.active) return false
  const seen = seenMenus()
  if (seen.has(section) || seen.has('*')) return false
  if (!steps.some(step => step.target && document.querySelector(step.target))) return false
  seen.add(section)
  store.set(MENU_KEY, JSON.stringify([...seen]))
  runSteps(coach, steps, skipped => { if (skipped) { seen.add('*'); store.set(MENU_KEY, JSON.stringify([...seen])) } })
  return true
}

/** 안내를 처음부터 다시(계정 관리의 버튼) */
export function resetCoaching(): void {
  store.remove(MENU_KEY)
  store.remove(BATTLE_KEY)
  store.remove(INTRO_KEY)
}

// ───────────────────────── 첫 전투 따라하기 ─────────────────────────

type BattleStepId = 'intro' | 'warning' | 'answered' | 'skill' | 'tactic' | 'phase' | 'pincer' | 'hold' | 'guard'
const BATTLE_STEPS: BattleStepId[] = ['intro', 'warning', 'answered', 'skill', 'tactic', 'phase', 'pincer', 'hold', 'guard']
const LANE_NAMES = ['좌측', '중앙', '우측']

export interface BattleCoachControl { pause(on: boolean): void }

/**
 * 전투 화면을 지켜보다가 처음 겪는 순간마다 멈추고 설명한다.
 * 경고·스킬 단계는 빛나는 버튼을 직접 눌러야 이어진다. 단계는 여러 전투에 걸쳐 하나씩 끝난다.
 */
export class BattleCoach {
  private done: Set<string>
  private expect: { kind: 'move' | 'skill'; lane: number } | null = null
  private showing = false
  private answeredAt = 0

  constructor(private readonly coach: Coach, private readonly control: BattleCoachControl) {
    try { this.done = new Set(JSON.parse(store.get(BATTLE_KEY) ?? '[]') as string[]) } catch { this.done = new Set() }
  }

  reload(): void {
    try { this.done = new Set(JSON.parse(store.get(BATTLE_KEY) ?? '[]') as string[]) } catch { this.done = new Set() }
  }

  get finished(): boolean { return this.done.has('all') || BATTLE_STEPS.every(id => this.done.has(id)) }

  private mark(id: string): void {
    this.done.add(id)
    store.set(BATTLE_KEY, JSON.stringify([...this.done]))
  }

  private open(id: BattleStepId, step: CoachStep, expect: BattleCoach['expect'] = null): void {
    this.showing = true
    this.expect = expect
    this.control.pause(true)
    this.coach.show(step, {
      nextLabel: '계속',
      onNext: () => { this.showing = false; this.expect = null; this.mark(id); this.control.pause(false) },
      onSkip: () => { this.showing = false; this.expect = null; this.mark('all'); this.control.pause(false) },
    })
  }

  /** 0.16초마다 전투 상태를 보고 다음 설명을 고른다 */
  tick(s: BattleSnapshot): void {
    if (!s.active) {
      if (this.showing) { this.coach.hide(); this.showing = false; this.expect = null }
      return
    }
    if (this.finished || this.showing || this.coach.active || s.autoPlay) return
    const has = (id: string) => this.done.has(id)
    const pattern = s.pattern && !s.pattern.judged ? s.pattern : null
    if (!has('intro') && s.elapsed > 0.4) {
      this.open('intro', { target: '.bt-hud', title: '전투의 목표', body: '위쪽 막대가 적 사기입니다. 적 사기를 0으로 만들면 다음 막으로 넘어가고, 3막까지 이기면 승리합니다. 제한 시간은 90초입니다.' })
      return
    }
    if (!has('warning') && pattern?.kind === 'lane' && pattern.lanes.length === 1) {
      const lane = pattern.lanes[0]
      this.open('warning', { target: `[data-bt-unit="${lane}"] .bt-unit-main`, title: `적 전술 예고 · ${LANE_NAMES[lane]}`, body: `가운데에 예고가 떴습니다. 적이 ${LANE_NAMES[lane]}을 노립니다. 같은 쪽 무장 버튼을 눌러 막으십시오. 실제 전투에서는 막대가 줄어들기 전에 눌러야 합니다.`, expect: 'click' }, { kind: 'move', lane })
      return
    }
    if (has('warning') && !has('answered') && !pattern && performance.now() - this.answeredAt > 900) {
      this.open('answered', { target: '.bt-hud', title: '막아 냈습니다', body: '경고를 막으면 연계가 쌓이고 적 사기가 크게 깎입니다. 놓치면 아군 사기가 떨어지고, 아군 사기가 0이 되는 사기 붕괴가 두 번 일어나면 패배합니다.' })
      return
    }
    if (!has('pincer') && pattern?.kind === 'pincer') {
      this.open('pincer', { target: '[data-bt-callout]', title: '여러 방향 공격', body: '양쪽·세 방향 공세는 표시된 자리의 무장을 모두 눌러야 막을 수 있습니다. 순서는 상관없습니다.' })
      return
    }
    if (!has('hold') && pattern?.kind === 'hold') {
      this.open('hold', { target: '[data-bt-callout]', title: '거짓 후퇴', body: '적이 물러나는 척합니다. 이때는 아무 버튼도 누르지 말고 기다리면 막아 낸 것으로 칩니다.' })
      return
    }
    if (!has('guard') && pattern?.kind === 'guard') {
      this.open('guard', { target: '[data-bt-guard]', title: '적장 돌격', body: '적장이 직접 돌격합니다. 이것은 전술 게이지를 써서 철벽 태세로만 막을 수 있습니다.' })
      return
    }
    const ready = s.units.find(unit => unit.ready)
    if (!has('skill') && ready && !pattern) {
      this.open('skill', { target: `[data-bt-unit="${ready.lane}"] .bt-unit-skill`, title: '스킬 준비 완료', body: `${ready.name}의 스킬 ‘${ready.skillName}’을 쓸 수 있습니다. 스킬 칸을 누르거나 무장 버튼을 길게 누르면 됩니다. 쓰고 나면 다시 찰 때까지 기다립니다.`, expect: 'click' }, { kind: 'skill', lane: ready.lane })
      return
    }
    if (!has('tactic') && s.tacticGauge >= s.tacticCosts.guard && !pattern) {
      this.open('tactic', { target: '.bt-tactic-row', title: '전술 게이지', body: '경고를 막을수록 게이지가 찹니다. 철벽 태세는 위협을 줄이고 적장 돌격을 막고, 유인책은 연계를 쌓고, 전군 돌격은 쌓인 연계를 큰 사기 피해로 바꿉니다.' })
      return
    }
    if (!has('phase') && s.phase >= 1 && !pattern) {
      this.open('phase', { target: '[data-bt-phase]', title: `${s.phase + 1}막 시작`, body: '막이 넘어가면 적 사기가 다시 차고 더 센 공격이 섞여 나옵니다. 3막에서 적 사기를 0으로 만들면 승리합니다.' })
    }
  }

  /**
   * 무장 버튼·스킬 입력이 들어오면: 지금 기다리는 버튼이면 안내를 닫고 전투를 이어서 입력을 통과시킨다(true).
   * 다른 버튼이면 막는다(false). 기다리는 것이 없으면 그대로 통과(true).
   */
  allow(kind: 'move' | 'skill', lane: number): boolean {
    if (!this.showing) return true
    if (!this.expect) return false
    if (this.expect.kind !== kind || this.expect.lane !== lane) return false
    const id = kind === 'move' ? 'warning' : 'skill'
    this.coach.hide()
    this.showing = false
    this.expect = null
    this.mark(id)
    if (id === 'warning') this.answeredAt = performance.now()
    this.control.pause(false)
    return true
  }
}

// ───────────────────────── 전투 규칙 도움말 ─────────────────────────

const svg = (body: string) => `<svg viewBox="0 0 320 150" class="guide-art" aria-hidden="true">${body}</svg>`
/** 버프 · 디버프 목록 카드(전투 효과 카탈로그에서 그대로 만든다 — 효과가 바뀌면 설명도 함께 바뀐다) */
const effectList = (ids: BattleEffectId[]) => `<ul class="guide-effects">${ids.map(id => {
  const e = BATTLE_EFFECTS[id]
  return `<li class="is-${e.kind}"><div><b>${esc(e.name)}</b><small>${e.duration}초</small><p>${esc(e.description)}</p></div></li>`
}).join('')}</ul>`
const SELF_COST: BattleEffectId[] = ['heavy-step', 'hangover']
const BUFF_IDS = (Object.keys(BATTLE_EFFECTS) as BattleEffectId[]).filter(id => BATTLE_EFFECTS[id].kind === 'buff' && !id.startsWith('e-') && !SELF_COST.includes(id))
const DEBUFF_IDS = (Object.keys(BATTLE_EFFECTS) as BattleEffectId[]).filter(id => BATTLE_EFFECTS[id].kind === 'debuff' && !id.startsWith('p-'))
const AGAINST_IDS: BattleEffectId[] = [...(Object.keys(BATTLE_EFFECTS) as BattleEffectId[]).filter(id => id.startsWith('p-') || id.startsWith('e-')), ...SELF_COST]

const GUIDE_CARDS: Array<{ title: string; body: string; art: string }> = [
  {
    title: '적 사기를 꺾으십시오',
    body: '적 사기 막대를 0으로 만들면 막이 넘어갑니다. 1막 → 2막 → 3막을 모두 넘기면 승리, 90초 안에 못 넘기면 패배입니다.',
    art: svg(`<text x="20" y="34" class="ga-t">적 사기</text><rect x="20" y="44" width="280" height="16" rx="3" class="ga-track"/><rect x="20" y="44" width="110" height="16" rx="3" class="ga-red"/>
      ${[0, 1, 2].map(i => `<g transform="translate(${30 + i * 100},92)"><rect width="80" height="36" rx="4" class="${i === 2 ? 'ga-gold' : 'ga-box'}"/><text x="40" y="23" text-anchor="middle" class="ga-n">${i + 1}막</text></g>${i < 2 ? `<path d="M${114 + i * 100} 110 l12 0 m-5 -5 l5 5 l-5 5" class="ga-line"/>` : ''}`).join('')}`),
  },
  {
    title: '경고가 뜨면 같은 쪽 무장',
    body: '가운데에 적 전술 예고가 뜨면, 막대가 줄어들기 전에 표시된 쪽(좌·중·우) 무장 버튼을 누릅니다. 한 경고에는 처음 누른 것만 인정됩니다.',
    art: svg(`<rect x="90" y="10" width="140" height="40" rx="5" class="ga-gold"/><text x="160" y="35" text-anchor="middle" class="ga-n">좌익 포위!</text>
      ${['좌', '중', '우'].map((name, i) => `<g transform="translate(${28 + i * 96},92)"><rect width="76" height="44" rx="6" class="${i === 0 ? 'ga-hit' : 'ga-box'}"/><text x="38" y="28" text-anchor="middle" class="ga-n">${name}</text></g>`).join('')}
      <path d="M120 52 L70 88" class="ga-arrow"/>`),
  },
  {
    title: '놓치면 아군 사기가 떨어집니다',
    body: '경고를 막으면 연계가 쌓여 적 사기가 크게 깎입니다. 놓치면 아군 사기가 떨어지고, 0이 되면 사기가 무너집니다. 두 번 무너지면 패배합니다.',
    art: svg(`<text x="20" y="34" class="ga-t">아군 사기</text><rect x="20" y="44" width="280" height="14" rx="3" class="ga-track"/><rect x="20" y="44" width="50" height="14" rx="3" class="ga-amber"/>
      <g transform="translate(40,84)"><rect width="110" height="44" rx="6" class="ga-box"/><text x="55" y="28" text-anchor="middle" class="ga-n">붕괴 1/2</text></g>
      <g transform="translate(170,84)"><rect width="110" height="44" rx="6" class="ga-hit"/><text x="55" y="28" text-anchor="middle" class="ga-n">연계 +1</text></g>`),
  },
  {
    title: '스킬과 전술',
    body: '무장 옆 스킬 칸이 빛나면 눌러서 씁니다(무장 버튼을 길게 눌러도 됨). 아래 전술은 게이지를 써서 철벽 태세·유인책·전군 돌격을 고릅니다.',
    art: svg(`<g transform="translate(20,20)"><rect width="130" height="50" rx="6" class="ga-box"/><text x="16" y="31" class="ga-n">관우</text><rect x="70" y="8" width="52" height="34" rx="5" class="ga-red"/><text x="96" y="30" text-anchor="middle" class="ga-s">스킬</text></g>
      <rect x="20" y="96" width="120" height="10" rx="3" class="ga-track"/><rect x="20" y="96" width="70" height="10" rx="3" class="ga-jade"/><text x="20" y="128" class="ga-t">전술 게이지</text>
      ${['철벽', '유인', '돌격'].map((name, i) => `<g transform="translate(${170 + i * 48},90)"><rect width="42" height="42" rx="5" class="ga-box"/><text x="21" y="26" text-anchor="middle" class="ga-s">${name}</text></g>`).join('')}`),
  },
  {
    title: '가운데는 전열',
    body: '적은 같은 자리의 아군을 치지만, 30%는 가운데 무장부터 노립니다. 가운데(전열)는 받는 피해가 20% 줄고, 수호형 무장(조인·허저·전위 등)을 세우면 적을 더 끌어당기며 40%까지 덜 받습니다. 전열이 먼저 맞아 주는 동안 좌우 공격수가 오래 살아남아 딜을 합니다.',
    art: svg(`${['좌', '전열', '우'].map((name, i) => `<g transform="translate(${28 + i * 96},92)"><rect width="76" height="44" rx="6" class="${i === 1 ? 'ga-gold' : 'ga-box'}"/><text x="38" y="28" text-anchor="middle" class="ga-n">${name}</text></g>`).join('')}
      ${['적', '적', '적'].map((name, i) => `<g transform="translate(${40 + i * 96},10)"><rect width="52" height="30" rx="5" class="ga-red"/><text x="26" y="21" text-anchor="middle" class="ga-s">${name}</text></g>`).join('')}
      <path d="M66 42 L66 88" class="ga-arrow"/><path d="M162 42 L162 88" class="ga-arrow"/><path d="M258 42 L258 88" class="ga-arrow"/>
      <path d="M80 42 L140 88" class="ga-arrow"/><path d="M244 42 L184 88" class="ga-arrow"/>`),
  },
  {
    title: '병종 상성과 별 3개',
    body: '기병은 궁병을, 궁병은 보병을, 보병은 기병을 이깁니다(책사는 상성 없음). 별: 승리 1개 + 병력 60% 이상 1개 + 붕괴 없이 경고 60% 이상 막기 1개.',
    art: svg(`<g class="ga-tri"><circle cx="80" cy="34" r="24" class="ga-box"/><text x="80" y="39" text-anchor="middle" class="ga-s">기병</text>
      <circle cx="40" cy="112" r="24" class="ga-box"/><text x="40" y="117" text-anchor="middle" class="ga-s">보병</text>
      <circle cx="120" cy="112" r="24" class="ga-box"/><text x="120" y="117" text-anchor="middle" class="ga-s">궁병</text>
      <path d="M96 52 L108 88" class="ga-arrow"/><path d="M96 112 L64 112" class="ga-arrow"/><path d="M52 90 L66 54" class="ga-arrow"/></g>
      <text x="236" y="62" text-anchor="middle" class="ga-star">★★★</text><text x="236" y="96" text-anchor="middle" class="ga-t">승리 · 병력 · 막기</text>`),
  },
  {
    title: '버프 · 아군 강화 효과',
    body: '아군 무장의 스킬이 거는 강화입니다. 걸려 있는 효과는 전투 기록 칸 아래에 아이콘과 남은 시간으로 보이고, 시간이 지나면 사라집니다. 같은 효과가 다시 걸리면 남은 시간이 다시 채워집니다.',
    art: effectList(BUFF_IDS),
  },
  {
    title: '디버프 · 적 약화 효과',
    body: '아군 스킬이 적에게 거는 약화입니다. 화계 · 공포 · 출혈은 매초 적 사기를 깎고, 갑주 균열 · 표적 낙인 · 분노는 적이 받는 피해를 늘립니다. 연환이 걸린 적에게 화계를 쓰면 특히 강합니다.',
    art: effectList(DEBUFF_IDS),
  },
  {
    title: '아군에게 불리한 효과',
    body: '적장의 스킬이 아군에게 거는 약화와 적이 스스로 거는 강화, 그리고 일부 강한 스킬의 대가입니다. 철벽 태세 · 경고 막기로 피해를 줄이십시오.',
    art: effectList(AGAINST_IDS),
  },
  {
    title: '자동 전투 (직접 하는 것보다 약합니다)',
    body: '전투 위쪽 ‘자동’을 켜면 예고 대응 · 스킬 · 전술을 알아서 합니다. 다만 직접 하는 것보다 약합니다. 예고를 10번 중 3번쯤 놓치고(정확도 70%), 스킬도 준비된 뒤 한 박자 늦게 씁니다. 같은 전투에서 이기는 비율이 눈에 띄게 낮으니, 처음 깨는 시나리오나 어려운 전투는 직접 하고, 이미 깬 곳을 다시 돌 때 쓰십시오. 유저 대련에는 자동 전투 대신 ‘스킬 자동’만 있습니다.',
    art: svg(`<g transform="translate(20,18)"><rect width="120" height="44" rx="6" class="ga-gold"/><text x="60" y="28" text-anchor="middle" class="ga-n">자동</text></g>
      <g transform="translate(170,18)"><rect width="130" height="44" rx="6" class="ga-box"/><text x="65" y="28" text-anchor="middle" class="ga-n">정확도 70%</text></g>
      <text x="20" y="96" class="ga-t">직접</text><rect x="80" y="86" width="220" height="12" rx="3" class="ga-track"/><rect x="80" y="86" width="210" height="12" rx="3" class="ga-jade"/>
      <text x="20" y="128" class="ga-t">자동</text><rect x="80" y="118" width="220" height="12" rx="3" class="ga-track"/><rect x="80" y="118" width="130" height="12" rx="3" class="ga-amber"/>`),
  },  {
    title: '시나리오 어려움',
    body: '보통으로 깬 시나리오는 ‘어려움’으로 다시 도전할 수 있습니다. 적이 Lv+10 · 별 +1로 강해지고, 단계마다 특수 규칙이 하나 붙습니다. 철벽(적 사기 +20) · 속전(제한 60초) · 짙은 안개(예고 대응 시간 −0.5초) · 화공 금지(적에게 화상이 걸리지 않음). 앞 단계 어려움을 깨야 다음 단계가 열리고, 첫 클리어 때 옥패 · 은전 · 병서 · 자원을 받습니다(금화는 없음).',
    art: svg(`<g transform="translate(20,20)"><rect width="130" height="40" rx="6" class="ga-box"/><text x="65" y="26" text-anchor="middle" class="ga-n">보통</text></g>
      <g transform="translate(170,20)"><rect width="130" height="40" rx="6" class="ga-amber"/><text x="65" y="26" text-anchor="middle" class="ga-n">어려움</text></g>
      <text x="20" y="100" class="ga-t">적 Lv+10 · 별 +1</text><text x="20" y="130" class="ga-t">특수 규칙 하나</text>`),
  },
]

/** 전투 규칙 그림 설명(언제든 다시 열 수 있다). 닫으면 onClose */
export function openBattleGuide(onClose?: () => void): void {
  document.querySelector('.battle-guide')?.remove()
  const modal = document.createElement('div')
  modal.className = 'battle-guide'
  let index = 0
  const render = () => {
    const card = GUIDE_CARDS[index]
    modal.innerHTML = `<div class="battle-guide__backdrop" data-guide-close></div><div class="battle-guide__card" role="dialog" aria-modal="true"><div class="battle-guide__head"><span class="eyebrow">전투 규칙 · ${index + 1} / ${GUIDE_CARDS.length}</span><button class="battle-guide__x" data-guide-close aria-label="닫기">✕</button></div>${card.art}<h2>${esc(card.title)}</h2><p>${esc(card.body)}</p><div class="battle-guide__dots">${GUIDE_CARDS.map((_, i) => `<button class="${i === index ? 'is-on' : ''}" data-guide-go="${i}" aria-label="${i + 1}"></button>`).join('')}</div><div class="battle-guide__actions"><button class="action-button action-button--outline" data-guide-prev ${index === 0 ? 'disabled' : ''}>← 이전</button>${index === GUIDE_CARDS.length - 1 ? '<button class="action-button action-button--primary" data-guide-close>알겠습니다</button>' : '<button class="action-button action-button--primary" data-guide-next>다음 →</button>'}</div></div>`
  }
  modal.addEventListener('click', event => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-guide-close],[data-guide-prev],[data-guide-next],[data-guide-go]')
    if (!el) return
    if (el.hasAttribute('data-guide-close')) { modal.remove(); document.removeEventListener('keydown', onKey); onClose?.(); return }
    if (el.hasAttribute('data-guide-prev')) index = Math.max(0, index - 1)
    else if (el.hasAttribute('data-guide-next')) index = Math.min(GUIDE_CARDS.length - 1, index + 1)
    else index = Number(el.dataset.guideGo ?? 0)
    render()
  })
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', onKey); onClose?.() }
    else if (event.key === 'ArrowRight') { index = Math.min(GUIDE_CARDS.length - 1, index + 1); render() }
    else if (event.key === 'ArrowLeft') { index = Math.max(0, index - 1); render() }
  }
  document.addEventListener('keydown', onKey)
  render()
  document.body.appendChild(modal)
}

// ───────────────────────── 처음 접속 소개 ─────────────────────────

const INTRO_SLIDES = [
  { image: '/assets/ui/recruit-montage.webp', eyebrow: '하나 · 모으다', title: '천하의 영웅을 모으십시오', body: '관우·조운·제갈량 등 70명의 무장을 모집하고 강화합니다. 같은 무장을 다시 얻으면 별이 오르고, 레벨이 오르면 고유 스킬이 열립니다.' },
  { image: '/assets/battlefield/huanghun-gate.webp', eyebrow: '둘 · 싸우다', title: '세 무장으로 전장을 지휘하십시오', body: '좌·중·우 세 자리에 무장을 세우고, 적의 경고에 맞춰 같은 쪽 무장으로 막아 냅니다. 184년 황건적의 난부터 58개의 시나리오가 기다립니다.' },
  { image: '/assets/territory/china-strategic-map.webp', eyebrow: '셋 · 차지하다', title: '진영과 함께 천하를 다투십시오', body: '위·촉·오 중 한 진영에 들어가 도시를 빼앗고 지킵니다. 매주 일요일 밤에는 낙양을 두고 모든 진영이 맞붙습니다.' },
]

export const introSeen = (): boolean => store.get(INTRO_KEY) === '1'

/** 처음 접속하면 진영 고르기 전에 게임 소개 3장을 보여 준다 */
export function maybeShowIntro(): void {
  if (introSeen() || document.querySelector('.game-intro')) return
  const intro = document.createElement('div')
  intro.className = 'game-intro'
  let index = 0
  const close = () => { store.set(INTRO_KEY, '1'); intro.classList.add('is-leaving'); window.setTimeout(() => intro.remove(), 320) }
  const render = () => {
    const slide = INTRO_SLIDES[index]
    const last = index === INTRO_SLIDES.length - 1
    intro.innerHTML = `<div class="game-intro__image" style="background-image:url('${slide.image}')"></div><div class="game-intro__shade"></div><div class="game-intro__panel"><span class="eyebrow">${esc(slide.eyebrow)}</span><h1>${esc(slide.title)}</h1><p>${esc(slide.body)}</p><div class="game-intro__dots">${INTRO_SLIDES.map((_, i) => `<i class="${i === index ? 'is-on' : ''}"></i>`).join('')}</div><div class="game-intro__actions"><button class="text-button" data-intro-skip>건너뛰기</button><button class="action-button action-button--primary" data-intro-next>${last ? '진영 고르기' : '다음'} <span>→</span></button></div></div>`
  }
  intro.addEventListener('click', event => {
    const el = event.target as HTMLElement
    if (el.closest('[data-intro-skip]')) close()
    else if (el.closest('[data-intro-next]')) { if (index >= INTRO_SLIDES.length - 1) close(); else { index += 1; render() } }
  })
  render()
  document.body.appendChild(intro)
}
