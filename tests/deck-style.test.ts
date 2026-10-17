import { describe, expect, it } from 'vitest'
import { ARCHETYPES, STYLE_BEATS, deckStyle, recommendDecks, styleEdge, styleMatch } from '../src/game/formation-advice'
import { BattleCore, BATTLE_RULES } from '../src/game/battle-core'
import { scaleGeneral, templateGeneral } from '../src/game/strategy'

const grown = (id: string) => ({ ...scaleGeneral({ ...templateGeneral(id)!, level: 1, stars: 1 }, 20, 3), skillUnlocked: true })

describe('덱 유형 상성(영토전 · 유저 대련)', () => {
  it('다섯 유형이 저마다 둘에 강하고 둘에 약하다', () => {
    for (const mine of ARCHETYPES) {
      const edges = ARCHETYPES.filter(other => other !== mine).map(other => styleEdge(mine, other))
      expect(edges.filter(edge => edge > 0)).toHaveLength(2)
      expect(edges.filter(edge => edge < 0)).toHaveLength(2)
      for (const other of ARCHETYPES) expect(styleEdge(mine, other) + styleEdge(other, mine)).toBe(0)
      expect(STYLE_BEATS[mine]).not.toContain(mine)
    }
  })
  it('추천 덱은 거의 다 그 유형으로 판정된다', () => {
    let total = 0, same = 0
    for (const anchor of ['liu-bei', 'lu-bu', 'cao-cao', 'zhou-yu', 'zhuge-liang', 'sun-quan']) {
      for (const deck of recommendDecks(anchor)) { total += 1; if (deckStyle(deck.ids) === deck.archetype) same += 1 }
    }
    expect(same / total).toBeGreaterThanOrEqual(0.8)
  })
  it('대련에서는 유리한 쪽 피해가 늘고, 일반 전투에는 상성이 없다', () => {
    const ally = ['guan-yu', 'zhang-fei', 'liu-bei'].map(grown)
    const enemy = ['lu-bu', 'dong-zhuo', 'diao-chan'].map(grown)
    const match = styleMatch(ally.map(g => g.id), enemy.map(g => g.id))!
    expect(match).not.toBeNull()
    const hit = (style: typeof match | null) => {
      const core = new BattleCore(ally, enemy, { mode: 'duel', style, rng: () => 0.5 })
      const target = core.enemies[0]
      const before = target.troops
      core.dealDamage(target, 1000, '시험', core.players[0])
      return before - target.troops
    }
    const plain = hit({ ...match, edge: 0, playerKey: 'sustain', enemyKey: 'sustain' })
    const up = hit({ ...match, edge: 1, playerKey: 'sustain', enemyKey: 'sustain' })
    const down = hit({ ...match, edge: -1, playerKey: 'sustain', enemyKey: 'sustain' })
    expect(up / plain).toBeCloseTo(1 + BATTLE_RULES.styleEdge, 1)
    expect(down / plain).toBeCloseTo(1 - BATTLE_RULES.styleEdge, 1)
    expect(new BattleCore(ally, enemy, {}).style).toBeNull()
  })
})
