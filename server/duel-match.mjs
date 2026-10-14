// 유저 대련 상대 고르기(서버와 게임이 같이 쓴다).
// - 덱을 저장한 지휘관이 DUEL_USER_THRESHOLD명 이상이면: 실제 유저 덱 중 내 덱 전력과 가장 가까운 상대
// - 그보다 적으면: 내 덱 전력에 맞춘 훈련 상대(더미 덱)
// 전력은 저장된 무장 능력치만으로 계산한다(서버에 장비·연구 정보가 없어도 같은 값이 나오게).

export const DUEL_USER_THRESHOLD = 20
/** 실제 유저 상대로 보여 줄 수 */
export const DUEL_MATCH_COUNT = 6

const GRADE_MULT = { 1: 0.82, 2: 0.91, 3: 1, 4: 1.12, 5: 1.28 }
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback)

/** 무장 한 명의 대련 전력(능력치·등급·레벨·성급) */
export function duelGeneralPower(general) {
  if (!general || typeof general !== 'object') return 0
  const base = num(general.leadership) * 1.15 + num(general.martial) * 1.25 + num(general.stratagem) * 0.9 + num(general.speed) * 0.65 + num(general.defense) * 0.25
  const level = Math.max(1, num(general.level, 1))
  const stars = Math.max(1, Math.min(5, num(general.stars, 1)))
  return base * (GRADE_MULT[num(general.grade, 3)] ?? 1) * (1 + (level - 1) * 0.035) * (1 + (stars - 1) * 0.06)
}

/** 덱(최대 3명) 전력 */
export function duelDeckPower(deck) {
  if (!Array.isArray(deck)) return 0
  return Math.round(deck.slice(0, 3).reduce((sum, general) => sum + duelGeneralPower(general), 0))
}

/**
 * 후보 중 내 전력과 가장 가까운 상대 count명(전력 차이 비율 순). 결과는 약한 상대부터.
 * 같은 전력 차이면 id 순으로 고정한다.
 */
export function pickDuelMatches(candidates, myPower, count = DUEL_MATCH_COUNT) {
  const me = Math.max(1, num(myPower, 1))
  return [...candidates]
    .map(candidate => ({ candidate, gap: Math.abs(num(candidate.power) - me) / me }))
    .sort((left, right) => left.gap - right.gap || String(left.candidate.id).localeCompare(String(right.candidate.id)))
    .slice(0, Math.max(1, count))
    .map(entry => entry.candidate)
    .sort((left, right) => num(left.power) - num(right.power))
}
