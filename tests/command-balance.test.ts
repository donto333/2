import { describe, expect, it } from 'vitest'
import { BATTLE_RULES, BattleCore } from '../src/game/battle-core'
import { COMMAND_BUFF_GRADE, SKILL_TYPE_META } from '../src/game/skills'
import { scaleGeneral, templateGeneral } from '../src/game/strategy'

const make = (id: string, level = 30) => ({ ...scaleGeneral({ ...templateGeneral(id)!, level: 1, stars: 1 }, level, 3), skillUnlocked: true })

/** 여포·조인(전열) + 세 번째 무장으로 싸웠을 때 평균 승리 시간 */
function averageWin(third: string, runs = 16): number {
  let total = 0, wins = 0
  for (let run = 0; run < runs; run += 1) {
    let seed = 5 + run * 11
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const core = new BattleCore(['lu-bu', 'cao-ren', third].map(id => make(id)), ['lu-xun', 'lu-meng', 'gan-ning'].map(id => make(id, 46)), { mode: 'scenario', rng, autoPilot: { accuracy: 0.75, reaction: [0.35, 0.9] } })
    while (core.active && core.t < BATTLE_RULES.timeLimit + 5) { core.tick(0.05); core.drainEvents() }
    if (core.result?.won) { wins += 1; total += core.t }
  }
  return wins ? total / wins : 999
}

describe('통솔(아군 강화)형 밸런스', () => {
  it('버프 수치는 등급이 높을수록 크고, 통솔 스킬도 사기를 깎는다', () => {
    expect(COMMAND_BUFF_GRADE[5]).toBeGreaterThan(COMMAND_BUFF_GRADE[4])
    expect(COMMAND_BUFF_GRADE[4]).toBeGreaterThan(COMMAND_BUFF_GRADE[1])
    expect(SKILL_TYPE_META['통솔'].base).toBeGreaterThanOrEqual(10)
    expect(SKILL_TYPE_META['통솔'].cooldown).toBeLessThanOrEqual(11)
  })
  it('천명 통솔형(조조)을 넣으면 신병 통솔형(송헌)보다 빨리 이긴다', () => {
    expect(averageWin('cao-cao')).toBeLessThan(averageWin('song-xian'))
  })
})
