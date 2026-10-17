// 첫 입장 튜토리얼(건너뛸 수 없음): 상점 → 무료 10회 모집 → 장비 10회 뽑기 → 자동 편성 → 무장 강화 → 장비 강화 → 시나리오 클리어 → 마무리.
// 빛나는 버튼 말고는 누를 수 없게 막고, 정해진 행동을 하면 다음 단계로 넘어간다. 진행 단계는 계정(임무 데이터)에 저장된다.
import type { Section, StrategyState } from '../game/strategy'
import { ensureMissions } from '../game/missions'
import { Coach } from './coach'

export type OnboardEvent = 'honor-buy' | 'recruit10' | 'gear10' | 'auto-formation' | 'upgrade' | 'enhance' | 'scenario-win' | 'scenario-lose'

export interface OnboardStep {
  id: 'welcome' | 'shop' | 'recruit' | 'gear' | 'formation' | 'upgrade' | 'enhance' | 'scenario' | 'finale'
  section?: Section
  /** 비출 버튼(이 버튼만 누를 수 있다) */
  target?: string
  title: string
  body: string
  /** 이 일이 일어나면 다음 단계 */
  event?: OnboardEvent
  /** 안내만 하는 단계의 버튼 글 */
  next?: string
}

/** 튜토리얼 상점에서 사는 옥패 묶음(10금화 → 옥패 1,000) */
export const ONBOARD_HONOR_PACKAGE = 'honor-10'
/** 장비 10회 뽑기 비용(옥패) */
export const ONBOARD_GEAR_COST = 2200

export const ONBOARD_STEPS: OnboardStep[] = [
  { id: 'welcome', title: '금화 100개를 드립니다', body: '천하에 오신 것을 환영합니다. 금화 100개가 지급되었습니다. 먼저 상점에서 금화로 옥패를 사 보겠습니다. 옥패는 무장 모집과 장비 뽑기에 씁니다.', next: '상점으로' },
  { id: 'shop', section: 'shop', target: `[data-action="honor-shop-purchase"][data-package-id="${ONBOARD_HONOR_PACKAGE}"]`, title: '1. 옥패 사기', body: '빛나는 "10금화 · 옥패 +1,000"을 누르십시오. 큰 묶음일수록 금화 하나당 더 많이 받습니다.', event: 'honor-buy' },
  { id: 'recruit', section: 'recruit', target: '[data-action="recruit"][data-count="10"]', title: '2. 무료 10회 모집', body: '첫 10회 모집은 무료이고, 5등급 무장 한 명이 반드시 나옵니다. 빛나는 버튼을 누르십시오.', event: 'recruit10' },
  { id: 'gear', section: 'recruit', target: '[data-action="equipment-draw"][data-count="10"]', title: '3. 장비 10회 뽑기', body: '이번에는 방금 산 옥패로 무기·갑옷·장신구를 10개 뽑습니다.', event: 'gear10' },
  { id: 'formation', section: 'formation', target: '[data-action="auto-formation"]:not([data-with-equipment])', title: '4. 자동 편성', body: '새 무장이 들어왔으니 출전 무장을 다시 고릅니다. 자동 편성을 누르면 전투력·인연·병종을 따져 세 명을 세웁니다. 가운데는 적이 먼저 노리는 전열이라 단단한 무장이 섭니다.', event: 'auto-formation' },
  { id: 'upgrade', section: 'roster', target: '.roster-grid .gcard .gcard-up:not([disabled])', title: '5. 무장 강화', body: '은전과 병서로 출전 무장의 레벨을 올립니다. 레벨이 오르면 능력치와 병력이 늘어납니다.', event: 'upgrade' },
  { id: 'enhance', section: 'equipment', target: '.equipment-card [data-action="equipment-enhance"]:not([disabled])', title: '6. 장비 강화', body: '은전과 철로 장비를 강화합니다. 강화할수록 장착한 무장의 능력이 오릅니다.', event: 'enhance' },
  { id: 'scenario', section: 'battle', target: '.scenario-start-button', title: '7. 시나리오 클리어', body: '이제 첫 전투입니다. 출정을 누르고 184년 황건적의 난을 이기십시오. 튜토리얼 전투는 쉽게 맞춰 두었고, 싸우는 동안 방법을 하나씩 알려 드립니다.', event: 'scenario-win' },
  { id: 'finale', title: '천하 제패를 향해', body: '무장을 성장시켜 천하를 제패하세요.', next: '시작하기' },
]

export interface OnboardingHost {
  state: StrategyState
  /** 메뉴 옮기기(게임의 메뉴 버튼과 같은 처리) */
  openSection(section: Section): void
  /** 탭·무료 모집 표시 맞추기 */
  prepare(step: OnboardStep): void
  /** 진행 저장 */
  save(): void
  /** 지금 다른 창(전투·결과·소개 등)이 떠 있어 잠시 멈춰야 하는가 */
  busy(): boolean
  notify(message: string): void
  /** 끝났을 때 */
  finished(): void
}

export class Onboarding {
  private readonly coach = new Coach()
  private shownStep = -1
  private shownAt = 0
  private retry = false
  private blocking = false

  constructor(private readonly host: OnboardingHost) {
    // 빛나는 버튼과 안내 말풍선 말고는 누르지 못하게 막는다(캡처 단계에서 먼저 받는다)
    const guard = (event: Event) => {
      if (!this.blocking) return
      const target = event.target as Element | null
      if (!target || !(target instanceof Element)) return
      if (target.closest('.coach-layer--forced .coach-bubble')) return
      // 튜토리얼 위에 뜨는 창(출석 체크 · 아이디 정하기)은 언제나 누를 수 있다
      if (target.closest('.attendance-modal, .guest-signup')) return
      const step = this.current()
      if (step?.target && target.closest(step.target)) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
    for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu']) document.addEventListener(type, guard, { capture: true, passive: false })
  }

  private missions() { return ensureMissions(this.host.state) }

  /** 아직 끝나지 않았는가 */
  get pending(): boolean { return !this.missions().onboardDone }
  /** 지금 화면을 이끌고 있는가(메뉴 안내 등은 이때 쉰다) */
  get active(): boolean { return this.pending }

  stepIndex(): number {
    const index = Math.trunc(this.missions().onboardStep ?? 0)
    return Math.min(Math.max(0, index), ONBOARD_STEPS.length - 1)
  }

  current(): OnboardStep | null {
    return this.pending ? ONBOARD_STEPS[this.stepIndex()] : null
  }

  /** 지금 단계가 이것인가 */
  at(id: OnboardStep['id']): boolean { return this.current()?.id === id }

  /** 게임에서 일어난 일 */
  event(kind: OnboardEvent): void {
    const step = this.current()
    if (!step) return
    if (kind === 'scenario-lose' && step.id === 'scenario') { this.retry = true; this.shownStep = -1; return }
    if (step.event !== kind) return
    this.advance()
  }

  private advance(): void {
    const missions = this.missions()
    const next = this.stepIndex() + 1
    this.coach.hide()
    this.blocking = false
    this.shownStep = -1
    this.retry = false
    if (next >= ONBOARD_STEPS.length) {
      missions.onboardDone = true
      missions.onboardStep = ONBOARD_STEPS.length
      this.host.prepare({ id: 'finale', title: '', body: '' })
      this.host.save()
      this.host.finished()
      return
    }
    missions.onboardStep = next
    this.host.save()
  }

  /** 주기적으로 불러 화면을 맞춘다 */
  tick(): void {
    const step = this.current()
    if (!step) { if (this.coach.active) this.coach.hide(); this.blocking = false; return }
    if (this.host.busy()) {
      if (this.coach.active) this.coach.hide()
      this.blocking = false
      this.shownStep = -1
      return
    }
    const index = this.stepIndex()
    if (this.shownStep === index && this.coach.active) {
      // 비출 버튼이 한동안 안 나타나면 막히지 않게 다음으로 넘길 수 있게 한다
      if (step.target && !document.querySelector(step.target) && performance.now() - this.shownAt > 2500) this.showFallback(step)
      return
    }
    if (step.section && this.host.state.section !== step.section) {
      this.host.prepare(step)
      this.host.openSection(step.section)
      return
    }
    this.host.prepare(step)
    this.shownStep = index
    this.shownAt = performance.now()
    const total = ONBOARD_STEPS.length - 2
    const number = Math.max(0, Math.min(total, index))
    if (!step.target) {
      this.blocking = true
      this.coach.show({ title: step.title, body: step.body }, { forced: true, seal: '튜토리얼', nextLabel: step.next ?? '다음', onNext: () => this.advance(), onSkip: () => undefined })
      return
    }
    const body = this.retry && step.id === 'scenario' ? '아쉽게 졌습니다. 경고가 뜨면 같은 쪽 무장을 눌러 막아 보십시오. 다시 출정하십시오.' : step.body
    this.blocking = true
    this.coach.show({ target: step.target, title: step.title, body, expect: 'click' }, { forced: true, seal: '튜토리얼', index: number - 1, total, onNext: () => undefined, onSkip: () => undefined })
  }

  /** 버튼을 찾지 못할 때: 설명만 띄우고 다음으로 */
  private showFallback(step: OnboardStep): void {
    this.coach.show({ title: step.title, body: '이 단계는 지금 진행할 수 없어 다음으로 넘어갑니다.' }, { forced: true, seal: '튜토리얼', nextLabel: '다음', onNext: () => this.advance(), onSkip: () => undefined })
  }
}
