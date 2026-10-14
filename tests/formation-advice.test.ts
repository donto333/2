import { describe, expect, it } from 'vitest'
import { applyCombo, recommendCombos } from '../src/game/formation-advice'
import { allGenerals, createInitialState, templateGeneral } from '../src/game/strategy'

describe('무장별 추천 조합', () => {
  const stateWith = (ids: string[]) => {
    const state = createInitialState()
    state.generals = ids.map(id => templateGeneral(id)!)
    state.formation = ids.slice(0, 3)
    return state
  }
  it('고른 무장이 들어간 서로 다른 3인 조합을 5개까지, 점수순으로 준다', () => {
    const state = stateWith(['guan-yu', 'zhang-fei', 'liu-bei', 'zhao-yun', 'huang-zhong', 'zhuge-liang', 'cao-cao'])
    const combos = recommendCombos(state, 'guan-yu')
    expect(combos).toHaveLength(5)
    for (const combo of combos) {
      expect(combo.ids).toContain('guan-yu')
      expect(new Set(combo.ids).size).toBe(3)
    }
    expect(new Set(combos.map(combo => [...combo.ids].sort().join())).size).toBe(5)
    for (let i = 1; i < combos.length; i += 1) expect(combos[i - 1].score).toBeGreaterThanOrEqual(combos[i].score)
    // 도원결의가 성립하는 조합은 인연이 붙는다
    const peach = recommendCombos(state, 'liu-bei', [], 50).find(combo => ['guan-yu', 'zhang-fei', 'liu-bei'].every(id => combo.ids.includes(id)))
    expect(peach?.bond?.name).toBe('도원결의')
  })
  it('적장 상성을 따져 자리를 배치하고, 무장이 3명보다 적으면 비어 있다', () => {
    const state = stateWith(['guan-yu', 'huang-zhong', 'zhang-fei', 'zhuge-liang'])
    const enemies = ['zhang-liang', 'zhang-liang', 'zhang-liang'].map(id => templateGeneral(id))
    const [best] = recommendCombos(state, 'guan-yu', enemies)
    // 적이 모두 보병이면 궁병(보병에 강함)이 최소 한 자리에서 유리
    expect(best.edges.some(edge => edge > 1)).toBe(true)
    expect(recommendCombos(stateWith(['guan-yu', 'zhang-fei']), 'guan-yu')).toEqual([])
    expect(allGenerals().length).toBe(70)
  })
  it('추천 조합으로 편성하면 출전 진형이 그 순서로 바뀐다', () => {
    const state = stateWith(['guan-yu', 'zhang-fei', 'liu-bei', 'zhao-yun'])
    expect(applyCombo(state, ['zhao-yun', 'guan-yu', 'zhang-fei']).ok).toBe(true)
    expect(state.formation).toEqual(['zhao-yun', 'guan-yu', 'zhang-fei'])
    expect(applyCombo(state, ['zhao-yun', 'lu-bu', 'zhang-fei']).ok).toBe(false)
  })
})
