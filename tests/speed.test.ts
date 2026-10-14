import { describe, expect, it } from 'vitest'
import { BattleCore } from '../src/game/battle-core'
import { skillCooldownFor } from '../src/game/skills'
import { EQUIPMENT_SET_META, scaleGeneral, templateGeneral, withEquipmentStats, type General } from '../src/game/strategy'

const ZERO = { leadership: 0, martial: 0, stratagem: 0, speed: 0 }
const make = (id: string, extra = 0, sets: Array<'command' | 'martial' | 'stratagem' | 'speed'> = []): General =>
  withEquipmentStats({ ...scaleGeneral({ ...templateGeneral(id)!, level: 1, stars: 1 }, 30, 3), skillUnlocked: true }, { ...ZERO, speed: extra }, sets)

describe('속도 개편', () => {
  it('속도가 빠른 무장이 첫 스킬을 먼저 쓴다(장비 속도 포함)', () => {
    const team = [make('cao-cao', 174), make('cao-ren'), make('zhuge-liang')]
    const plain = new BattleCore([make('cao-cao'), make('cao-ren'), make('zhuge-liang')], [make('lu-bu'), make('chen-gong'), make('gao-shun')], { mode: 'scenario' })
    const fast = new BattleCore(team, [make('lu-bu'), make('chen-gong'), make('gao-shun')], { mode: 'scenario' })
    expect(fast.players[0].cd).toBeLessThan(plain.players[0].cd * 0.8)
  })
  it('쿨다운 단축은 현재 속도를 쓰고 서서히 덜 줄어든다(상한 없이 갑자기 멈추지 않음)', () => {
    const base = templateGeneral('zhao-yun')!
    const at = (speed: number) => skillCooldownFor({ ...base, speed })
    expect(at(66)).toBeGreaterThan(at(200))
    expect(at(200)).toBeGreaterThan(at(400))
    expect(at(200) - at(400)).toBeLessThan(at(66) - at(200))
  })
  it('질풍 세트 3부위: 첫 스킬이 2초 이상 빨라지고 쿨다운이 줄어든다', () => {
    const enemies = () => [make('lu-bu'), make('chen-gong'), make('gao-shun')]
    const plain = new BattleCore([make('zhao-yun'), make('cao-ren'), make('zhuge-liang')], enemies(), { mode: 'scenario' })
    const gale = new BattleCore([make('zhao-yun', 0, ['speed']), make('cao-ren'), make('zhuge-liang')], enemies(), { mode: 'scenario' })
    expect(plain.players[0].cd - gale.players[0].cd).toBeGreaterThanOrEqual(Math.min(2, plain.players[0].cd) - 1e-6)
    expect(gale.players[0].cdMax).toBeLessThan(plain.players[0].cdMax)
    expect(EQUIPMENT_SET_META.speed.threePiece).toContain('첫 스킬')
  })
})
