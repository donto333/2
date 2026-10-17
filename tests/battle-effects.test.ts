import { describe, expect, it } from 'vitest'
import { BATTLE_EFFECTS, effectValue, hasBattleEffect, type ActiveBattleEffect } from '../src/game/battle-effects'

describe('battle effect catalog', () => {
  it('describes every effect with a positive duration', () => {
    const definitions = Object.values(BATTLE_EFFECTS)
    expect(definitions.length).toBeGreaterThanOrEqual(30)
    expect(definitions.every(effect => effect.duration > 0 && effect.description.length > 0)).toBe(true)
    for (const id of ['chain', 'flood', 'rage', 'counter', 'atk-up', 'dr-up'] as const) expect(BATTLE_EFFECTS[id]).toBeDefined()
  })

  it('only treats active effects as present and keeps the strongest value', () => {
    const effects = [
      { ...BATTLE_EFFECTS['iron-wall'], remaining: 3, stacks: 1 },
      { ...BATTLE_EFFECTS.burning, remaining: 0, stacks: 1 },
      { ...BATTLE_EFFECTS['atk-up'], remaining: 2, stacks: 1, value: 0.15 },
    ] satisfies ActiveBattleEffect[]
    expect(hasBattleEffect(effects, 'iron-wall')).toBe(true)
    expect(hasBattleEffect(effects, 'burning')).toBe(false)
    expect(effectValue(effects, 'atk-up')).toBe(0.15)
  })
})
