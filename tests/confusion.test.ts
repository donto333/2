import { describe, expect, it } from 'vitest'
import { BattleCore } from '../src/game/battle-core'
import { scaleGeneral, templateGeneral } from '../src/game/strategy'

const deck = (ids: string[], level = 20) => ids.map(id => ({ ...scaleGeneral({ ...templateGeneral(id)!, level: 1, stars: 1 }, level, 3), skillUnlocked: true }))

describe('혼란: 같은 편을 공격하고 스킬도 저절로 같은 편에게', () => {
  it('혼란에 빠진 적장은 일반 공격으로 같은 편 적을 친다', () => {
    const core = new BattleCore(deck(['guan-yu', 'zhang-fei', 'zhao-yun']), deck(['cao-cao', 'cao-ren', 'zhang-liao']), { mode: 'scenario', rng: () => 0.3 })
    core.addEffect('debuff', 'confusion', 6)
    const confused = core.enemies[0]
    confused.confusedUntil = 6
    confused.attackTimer = 0
    core.players.forEach(unit => { unit.attackTimer = 99 })
    core.enemies.slice(1).forEach(unit => { unit.attackTimer = 99 })
    const before = core.enemies.slice(1).reduce((sum, unit) => sum + unit.troops, 0)
    const playersBefore = core.players.reduce((sum, unit) => sum + unit.troops, 0)
    core.tick(0.05)
    expect(core.enemies.slice(1).reduce((sum, unit) => sum + unit.troops, 0)).toBeLessThan(before)
    expect(core.players.reduce((sum, unit) => sum + unit.troops, 0)).toBe(playersBefore)
  })

  it('혼란에 빠진 아군은 직접 스킬을 쓸 수 없고, 준비되면 저절로 같은 편에게 쓴다', () => {
    const core = new BattleCore(deck(['guan-yu', 'zhang-fei', 'zhao-yun']), deck(['cao-cao', 'cao-ren', 'zhang-liao']), { mode: 'scenario', rng: () => 0.3 })
    core.addEffect('pdebuff', 'p-confuse', 6)
    const unit = core.players[0]
    unit.confusedUntil = 6
    unit.cd = 0
    expect(core.isConfused(unit)).toBe(true)
    expect(core.castSkill(0)).toBe(false)
    core.players.forEach(other => { other.attackTimer = 99 }); core.enemies.forEach(other => { other.attackTimer = 99 })
    const allies = core.players.slice(1).reduce((sum, other) => sum + other.troops, 0)
    core.tick(0.05)
    expect(unit.cd).toBeGreaterThan(0)
    expect(core.players.slice(1).reduce((sum, other) => sum + other.troops, 0)).toBeLessThan(allies)
  })

  it('혼란 효과가 풀리면(해제 · 시간 끝) 바로 정상으로 돌아온다', () => {
    const core = new BattleCore(deck(['guan-yu', 'zhang-fei', 'zhao-yun']), deck(['cao-cao', 'cao-ren', 'zhang-liao']), { mode: 'scenario' })
    const unit = core.players[1]
    unit.confusedUntil = 6
    expect(core.isConfused(unit)).toBe(false) // 혼란 효과가 없으면 혼란 아님
    core.addEffect('pdebuff', 'p-confuse', 6)
    expect(core.isConfused(unit)).toBe(true)
    core.playerDebuffs.splice(0)
    expect(core.isConfused(unit)).toBe(false)
  })
})
