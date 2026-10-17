import { describe, expect, it } from 'vitest'
import { BattleCore, PLAYER_AUTO_PILOT } from '../src/game/battle-core'
import { scaleGeneral, templateGeneral } from '../src/game/strategy'

const make = (id: string, level = 30) => ({ ...scaleGeneral({ ...templateGeneral(id)!, level: 1, stars: 1 }, level, 3), skillUnlocked: true })

/** 아군 첫 스킬을 쓴 시각 */
function firstSkillAt(skillDelay: number): number {
  let seed = 7
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const core = new BattleCore(['lu-bu', 'cao-ren', 'guan-yu'].map(id => make(id)), ['lu-xun', 'lu-meng', 'gan-ning'].map(id => make(id, 30)), { mode: 'scenario', rng, autoPilot: { ...PLAYER_AUTO_PILOT, skillDelay } })
  while (core.active && core.t < 40) {
    core.tick(0.05)
    for (const event of core.drainEvents()) if (event.kind === 'skill' && event.side === 'player') return core.t
  }
  return 999
}

describe('자동 전투(플레이어)', () => {
  it('예고 대응 정확도 70%, 스킬은 준비된 뒤 한 박자 늦게', () => {
    expect(PLAYER_AUTO_PILOT.accuracy).toBe(0.7)
    expect(PLAYER_AUTO_PILOT.skillDelay).toBeGreaterThan(1)
    const now = firstSkillAt(0)
    const late = firstSkillAt(PLAYER_AUTO_PILOT.skillDelay!)
    expect(now).toBeLessThan(999)
    expect(late).toBeGreaterThanOrEqual(now + PLAYER_AUTO_PILOT.skillDelay! - 0.1)
  })
})
