import { describe, expect, it } from 'vitest'
import { DUEL_USER_THRESHOLD, duelDeckPower, pickDuelMatches } from '../server/duel-match.mjs'
import { dummyDuelDecks } from '../src/game/duel'
import { GENERAL_SKILLS } from '../src/game/skills'
import { scaleGeneral, templateGeneral } from '../src/game/strategy'

const grown = (id: string, level: number, stars = 3) => ({ ...scaleGeneral({ ...templateGeneral(id)!, level: 1, stars: 1 }, level, stars), skillUnlocked: true })

describe('유저 대련 매칭', () => {
  it('실제 유저는 20명부터, 내 덱 전력과 가장 가까운 상대를 고른다', () => {
    expect(DUEL_USER_THRESHOLD).toBe(20)
    const candidates = [500, 900, 1000, 1100, 1500, 3000, 50].map((power, index) => ({ id: `user-${index}`, power }))
    const picked = pickDuelMatches(candidates, 1000, 3)
    expect(picked.map(item => item.power)).toEqual([900, 1000, 1100])
  })
  it('훈련 상대는 내 덱 전력의 90%·100%·110%에 맞추고, 가운데에 수호형을 세운다', () => {
    for (const level of [1, 5, 20, 45]) {
      const mine = [grown('guan-yu', level), grown('cao-ren', level), grown('zhuge-liang', level)]
      const power = duelDeckPower(mine)
      const dummies = dummyDuelDecks(mine, '2026-10-14')
      expect(dummies).toHaveLength(3)
      dummies.forEach((dummy, index) => {
        const target = power * [0.9, 1, 1.1][index]
        expect(Math.abs(dummy.power - target) / target).toBeLessThan(0.08)
        expect(GENERAL_SKILLS[dummy.deck[1].id].type).toBe('수호')
      })
    }
  })
  it('날마다 훈련 상대 무장 구성이 바뀐다', () => {
    const mine = [grown('guan-yu', 20), grown('cao-ren', 20), grown('zhuge-liang', 20)]
    const ids = (day: string) => dummyDuelDecks(mine, day).map(dummy => dummy.deck.map(general => general.id).join()).join('|')
    expect(ids('2026-10-14')).not.toBe(ids('2026-10-15'))
  })
})
