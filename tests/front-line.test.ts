import { describe, expect, it } from 'vitest'
import { BATTLE_RULES, BattleCore } from '../src/game/battle-core'
import { allGenerals, autoFormation, createInitialState, scaleGeneral, templateGeneral } from '../src/game/strategy'

const make = (id: string, level = 30) => ({ ...scaleGeneral({ ...templateGeneral(id)!, level: 1, stars: 1 }, level, 3), skillUnlocked: true })

/** 적 일반 공격이 아군 어느 자리로 갔는지 센다 */
function enemyAttackShare(players: string[], runs = 12): number[] {
  const counts = [0, 0, 0]
  for (let run = 0; run < runs; run += 1) {
    let seed = 11 + run * 7
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const core = new BattleCore(players.map(id => make(id)), ['cao-cao', 'cao-ren', 'zhang-liao'].map(id => make(id, 34)), { mode: 'scenario', rng, autoPilot: { accuracy: 0.8, reaction: [0.3, 0.8] } })
    while (core.active && core.t < 40) {
      core.tick(0.05)
      for (const event of core.drainEvents()) if (event.kind === 'attack' && event.side === 'enemy') counts[event.target] += 1
    }
  }
  const total = counts.reduce((sum, value) => sum + value, 0)
  return counts.map(value => value / total)
}

describe('진형: 가운데는 전열', () => {
  it('적 공격의 30%는 전열부터 노린다(제 자리 몫까지 약 절반 이상)', () => {
    const share = enemyAttackShare(['lu-bu', 'ma-chao', 'guan-yu'])
    expect(share[1]).toBeGreaterThan(0.45)
    expect(share[1]).toBeLessThan(0.65)
  })
  it('수호형이 전열이면 더 끌어당긴다(도발)', () => {
    const plain = enemyAttackShare(['lu-bu', 'ma-chao', 'guan-yu'])
    const tank = enemyAttackShare(['lu-bu', 'cao-ren', 'guan-yu'])
    expect(tank[1]).toBeGreaterThan(plain[1] + 0.08)
    expect(BATTLE_RULES.frontDr + BATTLE_RULES.frontTankDr).toBeCloseTo(0.4, 6)
  })
  it('자동 편성은 수호형을 가운데(전열)에 세운다', () => {
    const state = createInitialState()
    state.generals = ['lu-bu', 'guan-yu', 'cao-ren'].map(id => templateGeneral(id)!)
    autoFormation(state)
    expect(state.formation[1]).toBe('cao-ren')
    expect(allGenerals().length).toBe(73)
  })
})
