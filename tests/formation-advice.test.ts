import { describe, expect, it } from 'vitest'
import { ARCHETYPES, applyCombo, recommendDecks } from '../src/game/formation-advice'
import { GENERAL_SKILLS } from '../src/game/skills'
import { allGenerals, createInitialState, templateGeneral } from '../src/game/strategy'

describe('무장별 추천 덱', () => {
  it('무장마다 유형별(연계·버티기·초반·디버프·유틸) 서로 다른 조합 5개, 모두 그 무장을 포함', () => {
    for (const id of ['guan-yu', 'song-xian', 'cao-ren', 'zhuge-liang']) {
      const decks = recommendDecks(id)
      expect(decks.map(deck => deck.archetype)).toEqual(ARCHETYPES)
      for (const deck of decks) {
        expect(deck.ids).toContain(id)
        expect(new Set(deck.ids).size).toBe(3)
      }
      expect(new Set(decks.map(deck => [...deck.ids].sort().join())).size).toBe(5)
    }
  })
  it('버티기 덱은 가운데(전열)에 수호형을 세운다', () => {
    for (const id of ['guan-yu', 'lu-bu', 'liu-bei', 'zhou-yu']) {
      const sustain = recommendDecks(id).find(deck => deck.archetype === 'sustain')!
      expect(GENERAL_SKILLS[sustain.ids[1]].type).toBe('수호')
    }
  })
  it('연계 덱은 그 무장의 인연·연계를 살린다', () => {
    expect(recommendDecks('liu-bei').find(deck => deck.archetype === 'chain')?.bond?.name).toBe('도원결의')
    expect(recommendDecks('lu-bu').find(deck => deck.archetype === 'chain')?.bond?.name).toBe('여포군')
    expect(recommendDecks('guan-yu').find(deck => deck.archetype === 'chain')?.ids).toContain('guan-ping')
  })
  it('세 무장을 모두 가져야 편성되고, 순서(좌·전열·우)대로 선다', () => {
    const state = createInitialState()
    state.generals = ['guan-yu', 'liu-bei', 'zhang-fei'].map(id => templateGeneral(id)!)
    expect(applyCombo(state, ['guan-yu', 'liu-bei', 'zhang-fei']).ok).toBe(true)
    expect(state.formation).toEqual(['guan-yu', 'liu-bei', 'zhang-fei'])
    expect(applyCombo(state, ['guan-yu', 'lu-bu', 'zhang-fei']).ok).toBe(false)
    expect(allGenerals().length).toBe(73)
  })
})
