import { describe, expect, it } from 'vitest'
import { BATTLE_PATTERNS, phaseName, resolveBattleTactic, resolveTactic } from '../src/game/battle-rules'

describe('tactical battle rules', () => {
  it('offers distinct telegraphed patterns across the three lanes', () => {
    expect(new Set(BATTLE_PATTERNS.map(pattern => pattern.lane))).toEqual(new Set([0, 1, 2]))
    expect(BATTLE_PATTERNS.every(pattern => pattern.warning.length > 10)).toBe(true)
  })

  it('rewards a correct counter with combo, morale damage and lower threat', () => {
    expect(resolveTactic(0, 0, 2, 32)).toEqual({ success: true, combo: 3, threat: 20, moraleDamage: 12 })
  })

  it('breaks the combo and raises threat on a mistimed lane command', () => {
    expect(resolveTactic(2, 0, 4, 32)).toEqual({ success: false, combo: 0, threat: 46, moraleDamage: 0 })
  })

  it('keeps threat and combo within their intended bounds', () => {
    expect(resolveTactic(1, 1, 8, 0)).toEqual({ success: true, combo: 8, threat: 0, moraleDamage: 22 })
    expect(resolveTactic(0, 1, 8, 94).threat).toBe(100)
    expect(phaseName(0)).toContain('서막')
    expect(phaseName(2)).toContain('결전')
  })

  it('uses guard to buy time and suppress threat', () => {
    expect(resolveBattleTactic('guard', 40, 2, 36)).toEqual({ ok: true, gauge: 5, combo: 2, threat: 11, moraleDamage: 0, guardDuration: 4.5 })
  })

  it('uses feint and charge as different combo decisions', () => {
    expect(resolveBattleTactic('feint', 60, 3, 28).moraleDamage).toBe(16)
    expect(resolveBattleTactic('feint', 20, 3, 28).ok).toBe(false)
    expect(resolveBattleTactic('charge', 70, 3, 28)).toEqual({ ok: true, gauge: 5, combo: 0, threat: 33, moraleDamage: 27, guardDuration: 0 })
  })
})
