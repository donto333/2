import { describe, expect, it } from 'vitest'
import { BATTLE_EFFECTS, effectLoadout, hasBattleEffect, type ActiveBattleEffect } from '../src/game/battle-effects'

describe('battle effect catalog', () => {
  it('contains exactly ten buffs and ten debuffs', () => {
    const definitions = Object.values(BATTLE_EFFECTS)
    expect(definitions.filter(effect => effect.kind === 'buff')).toHaveLength(10)
    expect(definitions.filter(effect => effect.kind === 'debuff')).toHaveLength(10)
    expect(definitions.every(effect => effect.duration > 0 && effect.description.length > 0)).toBe(true)
  })

  it('assigns signature effects to core generals and role fallbacks to expansions', () => {
    expect(effectLoadout('guan-yu', '기병')).toEqual({ buff: 'dragon-might', debuff: 'armor-break' })
    expect(effectLoadout('zhuge-liang', '책사')).toEqual({ buff: 'jade-command', debuff: 'confusion', cleanse: true })
    expect(effectLoadout('unknown-general', '궁병')).toEqual({ buff: 'hawk-eye', debuff: 'mark' })
  })

  it('only treats active effects as present', () => {
    const effects = [
      { ...BATTLE_EFFECTS['iron-wall'], remaining: 3, stacks: 1 },
      { ...BATTLE_EFFECTS.burning, remaining: 0, stacks: 1 },
    ] satisfies ActiveBattleEffect[]
    expect(hasBattleEffect(effects, 'iron-wall')).toBe(true)
    expect(hasBattleEffect(effects, 'burning')).toBe(false)
  })
})
