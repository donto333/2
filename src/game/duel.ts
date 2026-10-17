// 유저 대련 훈련 상대(더미 덱): 덱을 저장한 지휘관이 적을 때 내 덱 전력에 맞춘 상대 3팀을 만든다.
// 전력은 서버와 같은 공식(server/duel-match.mjs)으로 재서 실제 유저 매칭과 같은 기준이 된다.
import { duelDeckPower, type DuelTier } from '../../server/duel-match.mjs'
import { GENERAL_SKILLS } from './skills'
import { allGenerals, frontLineOrder, scaleGeneral, type General } from './strategy'

export interface DummyTier { id: string; name: string; label: string; ratio: number; tier: DuelTier }
// 2026.10.17: 훈련 상대 난이도 10% 하향(내 덱 전력의 77% · 90% · 104%)
export const DUMMY_TIERS: DummyTier[] = [
  { id: 'dummy-iron-gate', name: '철벽 관문 수비대', label: '쉬움', ratio: 0.77, tier: 'easy' },
  { id: 'dummy-jade-banner', name: '청람 진형 부대', label: '보통', ratio: 0.9, tier: 'normal' },
  { id: 'dummy-wind-tactician', name: '질풍 책사단', label: '어려움', ratio: 1.04, tier: 'hard' },
]

const hash = (text: string) => [...text].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 7)

/** 수호형 1 + 공격수 1 + 지원(계략·통솔·치유) 1, 등급은 내 덱 평균 등급 근처에서 고른다 */
function pickTrio(seed: string, grade: number): General[] {
  const catalog = allGenerals()
  const near = (list: General[]) => {
    for (const spread of [0, 1, 2, 4]) {
      const pool = list.filter(general => Math.abs(general.grade - grade) <= spread)
      if (pool.length) return pool
    }
    return list
  }
  const byType = (types: string[]) => near(catalog.filter(general => types.includes(GENERAL_SKILLS[general.id]?.type ?? '')))
  const groups = [byType(['수호']), byType(['돌격', '사격']), byType(['계략', '통솔', '치유'])]
  const h = hash(seed)
  return frontLineOrder(groups.map((pool, index) => pool[(h + index * 7919) % pool.length]))
}

/** 이 무장들을 같은 레벨·성급으로 키워 목표 전력에 가장 가깝게 맞춘다 */
function fitDeck(trio: General[], target: number, stars: number): { deck: General[]; level: number; power: number } {
  const grow = (level: number) => trio.map(general => ({ ...scaleGeneral({ ...general, level: 1, stars: 1 }, level, stars), id: general.id, skillUnlocked: true }))
  let best = { deck: grow(1), level: 1, power: duelDeckPower(grow(1)) }
  for (let level = 1; level <= 60; level += 1) {
    const deck = grow(level)
    const power = duelDeckPower(deck)
    if (Math.abs(power - target) < Math.abs(best.power - target)) best = { deck, level, power }
    if (power > target) break
  }
  return best
}

export interface DummyOpponent { id: string; displayName: string; note: string; power: number; tier: DuelTier; deck: General[] }

/**
 * 내 덱 전력에 맞춘 훈련 상대 3팀(쉬움 77% · 보통 90% · 어려움 104%).
 * dayKey가 바뀌면 상대 무장 구성이 바뀐다.
 */
export function dummyDuelDecks(myDeck: General[], dayKey = ''): DummyOpponent[] {
  const myPower = Math.max(1, duelDeckPower(myDeck))
  const grade = Math.round(myDeck.reduce((sum, general) => sum + general.grade, 0) / Math.max(1, myDeck.length)) || 3
  const stars = Math.max(1, Math.min(5, Math.round(myDeck.reduce((sum, general) => sum + general.stars, 0) / Math.max(1, myDeck.length)) || 1))
  return DUMMY_TIERS.map(tier => {
    // Lv1로도 목표보다 세면(초반 덱) 한 등급 낮은 무장으로 다시 맞춘다
    const target = myPower * tier.ratio
    let fit = fitDeck(pickTrio(`${tier.id}:${dayKey}`, grade), target, stars)
    for (let lower = grade - 1; lower >= 1 && fit.level === 1 && fit.power > target * 1.04; lower -= 1) {
      const next = fitDeck(pickTrio(`${tier.id}:${dayKey}`, lower), target, stars)
      if (Math.abs(next.power - target) < Math.abs(fit.power - target)) fit = next
    }
    return { id: tier.id, displayName: tier.name, note: `${tier.label} · 평균 Lv.${fit.level} · 전력 ${fit.power.toLocaleString('ko-KR')}`, power: fit.power, tier: tier.tier, deck: fit.deck }
  })
}
