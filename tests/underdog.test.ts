import { describe, expect, it } from 'vitest'
import { createInitialState, factionInfluence, resolveConquestBattle, underdogBuff, type StrategyState } from '../src/game/strategy'

/** 위나라가 중립 도시 n곳을 더 차지한 판(촉한은 extra곳) */
function board(weiExtra: number, shuExtra = 0): StrategyState {
  const state = createInitialState()
  state.faction = '촉한'
  let wei = 0, shu = 0
  for (const city of state.cities) {
    if (city.owner !== '중립' || city.id === 'luoyang' || city.id === 'xiangyang') continue
    if (wei < weiExtra) { city.owner = '위나라'; wei += 1 } else if (shu < shuExtra) { city.owner = '촉한'; shu += 1 }
  }
  return state
}

describe('영토전 열세 진영 버프', () => {
  it('처음(세 진영 수도만)에는 버프가 없다', () => {
    const state = createInitialState()
    const influence = factionInfluence(state)
    expect(influence.촉한).toBe(influence.위나라)
    expect(underdogBuff(state)).toBeNull()
  })
  it('가장 강한 진영의 50% 미만이면 열세의 노력, 수도만 남으면 구국의 총력전', () => {
    const lastStand = board(8)
    expect(underdogBuff(lastStand)?.id).toBe('last-stand')
    expect(underdogBuff(lastStand)?.battle).toBe(0.2)
    const underdog = board(12, 1)
    expect(factionInfluence(underdog).촉한).toBeLessThan(factionInfluence(underdog).위나라 * 0.5)
    expect(underdogBuff(underdog)?.id).toBe('underdog')
    expect(underdogBuff(underdog)?.wall).toBe(1.5)
    expect(underdogBuff(underdog, '위나라')).toBeNull()
    const wanderer = board(8); wanderer.faction = '재야'
    expect(underdogBuff(wanderer)).toBeNull()
  })
  it('공성에서 이기면 성벽 방어도 차감이 1.5배 · 2배가 된다', () => {
    const target = (state: StrategyState) => state.cities.find(city => city.owner === '중립' && city.id !== 'luoyang' && city.id !== 'xiangyang' && city.level >= 3)!.id
    // 같은 판(같은 무장)에서 위나라 도시를 중립으로 돌려 버프를 끈 것과 견준다
    const last = board(8)
    const even: StrategyState = structuredClone(last)
    even.cities.forEach(city => { if (city.owner === '위나라' && city.id !== 'ye') city.owner = '중립' })
    expect(underdogBuff(even)).toBeNull()
    const base = resolveConquestBattle(even, target(even), true).damage
    expect(resolveConquestBattle(last, target(last), true).damage / base).toBeCloseTo(2, 2)
  })
})
