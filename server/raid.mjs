// 주간 레이드 규칙(서버와 게임이 같이 쓴다).
// - 월요일 0시(한국 시간)에 초기화, 하루 3번 도전
// - 도전 1번 = 1군 → 2군 → 3군 전투(각 90초)의 피해 합계. 보스 병력은 줄지 않는다(무한 체력)
// - 보스 레벨: 덱을 저장한 지휘관이 20명 이하면 Lv30, 그보다 많으면 전력 상위 300명의 평균 레벨(보통 난이도)
// - 피해 조작 대응(A안): 군 전력으로 낼 수 있는 최대 피해를 넘는 기록은 잘라 낸다

export const RAID_DAILY_LIMIT = 3
export const RAID_SQUADS = 3
export const RAID_MIN_USERS = 20
export const RAID_TOP_USERS = 300
export const RAID_DEFAULT_LEVEL = 30

const KST = 9 * 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

/** 이번 레이드 주차: 그 주 월요일(한국 날짜) 'YYYY-MM-DD' */
export function raidWeekKey(now = Date.now()) {
  const kst = new Date(now + KST)
  const weekday = (kst.getUTCDay() + 6) % 7 // 월요일 0
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - weekday * DAY).toISOString().slice(0, 10)
}

/** 지난 주차 */
export function previousRaidWeekKey(now = Date.now()) {
  return raidWeekKey(now - 7 * DAY)
}

/** 다음 초기화(다음 월요일 0시 KST)까지 남은 밀리초 */
export function raidResetIn(now = Date.now()) {
  const monday = Date.parse(`${raidWeekKey(now)}T00:00:00Z`) - KST
  return monday + 7 * DAY - now
}

/** 한국 날짜 'YYYY-MM-DD'(하루 3회 제한 기준) */
export function raidDayKey(now = Date.now()) {
  return new Date(now + KST).toISOString().slice(0, 10)
}

/** 순위 보상: 1 · 2 · 3 · 4~10 · 11~50 · 51~100 · 101~200 · 201~300 · 301위부터 */
export const RAID_REWARDS = [
  { from: 1, to: 1, gold: 200, stones: 2 },
  { from: 2, to: 2, gold: 200, stones: 1 },
  { from: 3, to: 3, gold: 100, stones: 1 },
  { from: 4, to: 10, gold: 100, stones: 0 },
  { from: 11, to: 50, gold: 80, stones: 0 },
  { from: 51, to: 100, gold: 60, stones: 0 },
  { from: 101, to: 200, gold: 40, stones: 0 },
  { from: 201, to: 300, gold: 20, stones: 0 },
  { from: 301, to: Infinity, gold: 10, stones: 0 },
]

export function raidRewardFor(rank) {
  const r = Math.trunc(Number(rank))
  if (!Number.isFinite(r) || r < 1) return { gold: 0, stones: 0 }
  const row = RAID_REWARDS.find(entry => r >= entry.from && r <= entry.to)
  return row ? { gold: row.gold, stones: row.stones } : { gold: 0, stones: 0 }
}

/** 보스 레벨: 덱을 저장한 지휘관 평균 레벨 목록(전력 높은 순)에서 계산 */
export function raidBossLevel(deckLevels) {
  const levels = (Array.isArray(deckLevels) ? deckLevels : []).map(Number).filter(level => Number.isFinite(level) && level > 0)
  if (levels.length <= RAID_MIN_USERS) return RAID_DEFAULT_LEVEL
  const top = levels.slice(0, RAID_TOP_USERS)
  return Math.max(1, Math.min(60, Math.round(top.reduce((sum, level) => sum + level, 0) / top.length)))
}

/**
 * 군 하나가 90초 동안 낼 수 있는 최대 피해(A안 상한). 덱 전력(server/duel-match.mjs) 기준.
 * 시뮬레이션(5개 덱 × 레벨 10~60 × 성급 1·5 × 보스 6종): 피해/전력은 중앙 2.4~3.0, 가장 잘 싸운 기록도 7.6.
 * 서버 전력에는 장비가 빠지므로(신화 장비로 최대 약 +50%) 전력 1당 12 + 기본 15,000으로 넉넉히 잡는다.
 */
export const RAID_CAP_PER_POWER = 12
export const RAID_CAP_FLOOR = 15000
export function raidDamageCap(squadPower) {
  const power = Math.max(0, Number(squadPower) || 0)
  return power > 0 ? Math.round(RAID_CAP_FLOOR + power * RAID_CAP_PER_POWER) : 0
}
