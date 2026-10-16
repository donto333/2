// 일일·주간 임무. 날짜는 한국 시간 기준(일일은 0시, 주간은 월요일 0시에 새로 시작).
// 보상은 옥패·은전·자원·병서처럼 이 게임이 직접 관리하는 재화만 준다(금화는 서버 원장 대상이라 제외).
import type { ResourceKey, StrategyState } from './strategy'
import { locale } from '../i18n/lang'

export type MissionEvent = 'income' | 'battleWin' | 'researchStart' | 'researchDone' | 'recruit' | 'enhance' | 'siege' | 'duel' | 'visitFormation' | 'missionClaim'
type Reward = Partial<Record<ResourceKey | 'honor' | 'manuals', number>>
export interface MissionDef { id: string; scope: 'daily' | 'weekly'; event: MissionEvent; goal: number; label: string; reward: Reward }

export const MISSIONS: MissionDef[] = [
  { id: 'd-income', scope: 'daily', event: 'income', goal: 1, label: '내정 수확 1회', reward: { silver: 3000 } },
  { id: 'd-win', scope: 'daily', event: 'battleWin', goal: 3, label: '전투 승리 3회', reward: { honor: 150 } },
  { id: 'd-research', scope: 'daily', event: 'researchStart', goal: 1, label: '기술 연구 시작 1회', reward: { influence: 1500 } },
  { id: 'd-recruit', scope: 'daily', event: 'recruit', goal: 1, label: '무장 모집 1회', reward: { manuals: 40 } },
  { id: 'd-enhance', scope: 'daily', event: 'enhance', goal: 1, label: '장비 강화 1회', reward: { iron: 2000 } },
  { id: 'w-win', scope: 'weekly', event: 'battleWin', goal: 20, label: '전투 승리 20회', reward: { honor: 800 } },
  { id: 'w-siege', scope: 'weekly', event: 'siege', goal: 5, label: '공성 출정 5회', reward: { wood: 10000, grain: 10000 } },
  { id: 'w-duel', scope: 'weekly', event: 'duel', goal: 3, label: '유저 대련 3회', reward: { manuals: 200 } },
  { id: 'w-research', scope: 'weekly', event: 'researchDone', goal: 3, label: '기술 연구 3개 완료', reward: { influence: 8000 } },
]
/** 하루 임무를 모두 받으면 주는 추가 보상 */
export const DAILY_BONUS: Reward = { honor: 200, silver: 5000 }
export const DAILY_BONUS_ID = 'd-all'

export interface MissionState {
  dayKey: string; weekKey: string; progress: Record<string, number>; claimed: string[]
  /** 오늘 보상을 받은 일반 전투 승리 횟수(하루 제한) */
  repeatWins?: number
  /** 처음 시작 안내: 마친 단계, 끝(보상 받음·건너뜀) 여부 */
  tutorial?: string[]; tutorialDone?: boolean
  /** 첫 입장 튜토리얼(강제): 지금 단계 번호, 끝났는지 */
  onboardStep?: number; onboardDone?: boolean
  /** 출석 체크: 받은 날 수 · 마지막으로 받은 날(한국 날짜) */
  attendance?: { count: number; last: string }
  /** 무료 뽑기권(출석 보상): 무장 모집 · 장비 뽑기 */
  freeRecruits?: number; freeDraws?: number
}

/** 처음 시작 안내 6단계 */
export const TUTORIAL_STEPS: Array<{ id: string; label: string; hint: string; section: string; event: MissionEvent }> = [
  { id: 't-formation', label: '출전 편성 확인', hint: '출전 무장 3명과 좌·중·우 자리를 확인하세요.', section: 'formation', event: 'visitFormation' },
  { id: 't-battle', label: '첫 전투 승리', hint: '시나리오에서 첫 전투를 이기세요.', section: 'battle', event: 'battleWin' },
  { id: 't-income', label: '내정 수확', hint: '영토에서 아군 도시의 재화를 거두세요.', section: 'territory', event: 'income' },
  { id: 't-research', label: '기술 연구 시작', hint: '강병 1단계 ‘오부 훈련’부터 시작하세요(5분).', section: 'research', event: 'researchStart' },
  { id: 't-recruit', label: '무장 모집', hint: '옥패로 새 무장을 모집하세요.', section: 'recruit', event: 'recruit' },
  { id: 't-mission', label: '임무 보상 받기', hint: '본영의 일일 임무에서 보상을 받으세요.', section: 'overview', event: 'missionClaim' },
]
export const TUTORIAL_REWARD: Reward = { honor: 1000, silver: 10000, manuals: 200 }

const SEOUL = 9 * 60 * 60 * 1000
export function seoulDay(now = Date.now()): string {
  return new Date(now + SEOUL).toISOString().slice(0, 10)
}
/** 그 주 월요일(한국 시간) 날짜 */
export function seoulWeek(now = Date.now()): string {
  const date = new Date(now + SEOUL)
  const back = (date.getUTCDay() + 6) % 7
  return new Date(date.getTime() - back * 86_400_000).toISOString().slice(0, 10)
}

export function ensureMissions(state: StrategyState, now = Date.now()): MissionState {
  const day = seoulDay(now), week = seoulWeek(now)
  // 같은 객체를 고쳐 쓴다(다른 곳에서 잡아 둔 참조가 끊기지 않게)
  // 이미 시나리오를 여럿 깬 기존 유저에게는 처음 시작 안내를 띄우지 않는다
  if (!state.missions || typeof state.missions !== 'object') state.missions = { dayKey: day, weekKey: week, progress: {}, claimed: [], tutorialDone: (state.scenarioCleared?.length ?? 0) >= 3 }
  const missions = state.missions
  if (!missions.progress || typeof missions.progress !== 'object') missions.progress = {}
  if (!Array.isArray(missions.claimed)) missions.claimed = []
  // 이미 임무 보상을 받은 적이 있으면(오늘·이번 주) 처음 시작 안내의 ‘임무 보상 받기’는 끝난 것으로 본다
  if (!missions.tutorialDone && missions.claimed.length && !(missions.tutorial ?? []).includes('t-mission')) missions.tutorial = [...(missions.tutorial ?? []), 't-mission']
  // 이미 시나리오를 깨거나 전투를 이긴 기존 유저는 첫 입장 튜토리얼을 건너뛴다
  if (missions.onboardDone === undefined && ((state.scenarioCleared?.length ?? 0) > 0 || (state.wins ?? 0) > 0)) missions.onboardDone = true
  if (missions.dayKey !== day) {
    for (const mission of MISSIONS) if (mission.scope === 'daily') delete missions.progress[mission.id]
    missions.claimed = missions.claimed.filter(id => !id.startsWith('d-'))
    missions.repeatWins = 0
    missions.dayKey = day
  }
  if (missions.weekKey !== week) {
    for (const mission of MISSIONS) if (mission.scope === 'weekly') delete missions.progress[mission.id]
    missions.claimed = missions.claimed.filter(id => !id.startsWith('w-'))
    missions.weekKey = week
  }
  return missions
}

/** 행동이 일어날 때 부른다. 새로 목표를 채운 임무가 있으면 그 이름들을 돌려준다 */
export function recordMission(state: StrategyState, event: MissionEvent, amount = 1, now = Date.now()): string[] {
  const missions = ensureMissions(state, now)
  const completed: string[] = []
  if (!missions.tutorialDone) {
    const done = new Set(missions.tutorial ?? [])
    // 이미 임무 보상을 받은 적이 있으면(오늘·이번 주) ‘임무 보상 받기’ 단계는 끝난 것으로 본다
    if (missions.claimed.length) done.add('t-mission')
    for (const step of TUTORIAL_STEPS) if (step.event === event && !done.has(step.id)) { done.add(step.id); completed.push(`안내: ${step.label}`) }
    missions.tutorial = [...done]
  }
  for (const mission of MISSIONS) {
    if (mission.event !== event) continue
    const before = missions.progress[mission.id] ?? 0
    const after = Math.min(mission.goal, before + amount)
    missions.progress[mission.id] = after
    if (before < mission.goal && after >= mission.goal) completed.push(mission.label)
  }
  return completed
}

export type MissionStatus = 'claimed' | 'ready' | 'progress'
export function missionStatus(state: StrategyState, mission: MissionDef, now = Date.now()): MissionStatus {
  const missions = ensureMissions(state, now)
  if (missions.claimed.includes(mission.id)) return 'claimed'
  return (missions.progress[mission.id] ?? 0) >= mission.goal ? 'ready' : 'progress'
}
export function dailyBonusReady(state: StrategyState, now = Date.now()): boolean {
  const missions = ensureMissions(state, now)
  return !missions.claimed.includes(DAILY_BONUS_ID) && MISSIONS.filter(mission => mission.scope === 'daily').every(mission => missions.claimed.includes(mission.id))
}

const REWARD_LABELS: Record<string, string> = { honor: '옥패', silver: '은전', grain: '식량', wood: '목재', iron: '철', influence: '영향력', manuals: '병서' }
export function rewardText(reward: Reward): string {
  return Object.entries(reward).map(([key, value]) => `${REWARD_LABELS[key] ?? key} +${new Intl.NumberFormat(locale()).format(value ?? 0)}`).join(' · ')
}

function grant(state: StrategyState, reward: Reward): void {
  for (const [key, value] of Object.entries(reward)) {
    const amount = value ?? 0
    if (key === 'honor') state.honor += amount
    else if (key === 'manuals') state.manuals += amount
    else if (key === 'silver') { state.silver += amount; state.resources.silver = state.silver }
    else state.resources[key as ResourceKey] += amount
  }
}

export function claimMission(state: StrategyState, id: string, now = Date.now()): { ok: boolean; message: string } {
  const missions = ensureMissions(state, now)
  if (id === DAILY_BONUS_ID) {
    if (!dailyBonusReady(state, now)) return { ok: false, message: '일일 임무를 모두 받아야 추가 보상을 받을 수 있습니다.' }
    missions.claimed.push(DAILY_BONUS_ID)
    grant(state, DAILY_BONUS)
    return { ok: true, message: `일일 임무 전부 완료 보상 · ${rewardText(DAILY_BONUS)}` }
  }
  const mission = MISSIONS.find(item => item.id === id)
  if (!mission) return { ok: false, message: '임무를 찾을 수 없습니다.' }
  const status = missionStatus(state, mission, now)
  if (status === 'claimed') return { ok: false, message: '이미 받은 보상입니다.' }
  if (status !== 'ready') return { ok: false, message: `아직 목표를 채우지 못했습니다 · ${mission.label}` }
  missions.claimed.push(mission.id)
  grant(state, mission.reward)
  return { ok: true, message: `임무 완료 · ${mission.label} · ${rewardText(mission.reward)}` }
}

/** 다음에 할 안내 단계(없으면 null) */
export function nextTutorialStep(state: StrategyState): (typeof TUTORIAL_STEPS)[number] | null {
  const missions = ensureMissions(state)
  if (missions.tutorialDone) return null
  const done = new Set(missions.tutorial ?? [])
  return TUTORIAL_STEPS.find(step => !done.has(step.id)) ?? null
}
export function tutorialFinished(state: StrategyState): boolean {
  const missions = ensureMissions(state)
  return TUTORIAL_STEPS.every(step => (missions.tutorial ?? []).includes(step.id))
}
/** 안내를 모두 마치면 보상, skip이면 보상 없이 닫는다 */
export function closeTutorial(state: StrategyState, skip = false): { ok: boolean; message: string } {
  const missions = ensureMissions(state)
  if (missions.tutorialDone) return { ok: false, message: '이미 끝낸 안내입니다.' }
  if (skip) { missions.tutorialDone = true; return { ok: true, message: '시작 안내를 닫았습니다.' } }
  if (!tutorialFinished(state)) return { ok: false, message: '안내 단계를 모두 마치면 보상을 받을 수 있습니다.' }
  missions.tutorialDone = true
  grant(state, TUTORIAL_REWARD)
  return { ok: true, message: `시작 안내 완료 · ${rewardText(TUTORIAL_REWARD)}` }
}

/** 첫 입장 튜토리얼이 남아 있는가 */
export function onboardingPending(state: StrategyState): boolean {
  return !ensureMissions(state).onboardDone
}
