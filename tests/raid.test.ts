import { describe, expect, it } from 'vitest'
import { RAID_DAILY_LIMIT, previousRaidWeekKey, raidBossLevel, raidDamageCap, raidRewardFor, raidWeekKey } from '../server/raid.mjs'
import { BattleCore, BATTLE_RULES } from '../src/game/battle-core'
import { RAID_BOSSES, raidBossDeck, raidBossFor } from '../src/game/raid'
import { scaleGeneral, templateGeneral } from '../src/game/strategy'

const grown = (id: string, level: number) => ({ ...scaleGeneral({ ...templateGeneral(id)!, level: 1, stars: 1 }, level, 3), skillUnlocked: true })
let seed = 7
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647

describe('주간 레이드', () => {
  it('월요일 0시(한국 시간)에 주차가 바뀌고, 하루 3회', () => {
    expect(raidWeekKey(Date.parse('2026-10-18T14:59:00Z'))).toBe('2026-10-12')
    expect(raidWeekKey(Date.parse('2026-10-18T15:00:00Z'))).toBe('2026-10-19')
    expect(previousRaidWeekKey(Date.parse('2026-10-18T15:00:00Z'))).toBe('2026-10-12')
    expect(RAID_DAILY_LIMIT).toBe(3)
  })
  it('순위 보상: 1·2·3·4~10·11~50·51~100·101~200·201~300·301위~', () => {
    expect([1, 2, 3, 7, 30, 80, 150, 250, 999].map(rank => raidRewardFor(rank))).toEqual([
      { gold: 200, stones: 2 }, { gold: 200, stones: 1 }, { gold: 100, stones: 1 }, { gold: 100, stones: 0 }, { gold: 80, stones: 0 },
      { gold: 60, stones: 0 }, { gold: 40, stones: 0 }, { gold: 20, stones: 0 }, { gold: 10, stones: 0 },
    ])
  })
  it('보스 레벨: 20명 이하면 30, 많으면 상위 300명 평균', () => {
    expect(raidBossLevel(Array(20).fill(55))).toBe(30)
    expect(raidBossLevel([...Array(300).fill(42), ...Array(50).fill(1)])).toBe(42)
  })
  it('보스 병력은 줄지 않고 90초까지 싸우며, 준 피해가 쌓인다(상한 안)', () => {
    const team = [grown('guan-yu', 30), grown('cao-ren', 30), grown('zhuge-liang', 30)]
    const core = new BattleCore(team, raidBossDeck(30, '2026-10-12'), { mode: 'raid', rng, autoPilot: { accuracy: 0.8, reaction: [0.3, 0.6] } })
    const start = core.enemies.map(unit => unit.troops)
    while (core.active && core.t < BATTLE_RULES.timeLimit + 5) { core.tick(0.05); core.drainEvents() }
    expect(core.enemies.map(unit => unit.troops)).toEqual(start)
    expect(core.result?.raidDamage).toBeGreaterThan(0)
    if (core.result?.reason === 'raid') expect(core.t).toBeGreaterThanOrEqual(BATTLE_RULES.timeLimit)
    expect(core.result!.raidDamage!).toBeLessThan(raidDamageCap(5000))
  })
  it('보스는 주마다 돌아가며 가운데에 단단한 무장을 세운다', () => {
    expect(new Set(['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'].map(week => raidBossFor(week).id)).size).toBeGreaterThan(1)
    for (const boss of RAID_BOSSES) expect(boss.members.every(id => templateGeneral(id))).toBe(true)
    expect(raidBossDeck(45).every(general => general.level === 45)).toBe(true)
  })
})

import { RaidRunner } from '../src/game/raid-run'
import { packLoadouts, unpackLoadouts } from '../src/game/equipment-manage'
import { createInitialState } from '../src/game/strategy'

describe('레이드 진행(1군 → 2군 → 3군)', () => {
  it('세 군을 차례로 싸우고 피해를 합친다(빈 군은 건너뛰고 이름은 원래 번호)', () => {
    const runner = new RaidRunner([{ index: 0, ids: ['a'] }, { index: 1, ids: [] }, { index: 2, ids: ['c', 'd'] }])
    expect(runner.count).toBe(2)
    expect(runner.currentLabel).toBe('1군')
    const first = runner.record(1200)
    expect(first.done).toBe(false)
    expect(first.next).toEqual({ index: 1, label: '3군', ids: ['c', 'd'] })
    expect(runner.currentIds).toEqual(['c', 'd'])
    const last = runner.record(800.4)
    expect(last.done).toBe(true)
    expect(runner.total).toBe(2000)
    expect(runner.summary()).toBe('1군 1,200 · 3군 800')
  })
  it('세 군 모두 있으면 3번 싸운다', () => {
    const runner = new RaidRunner([0, 1, 2].map(index => ({ index, ids: [`g${index}`] })))
    const labels: string[] = []
    while (!runner.finished) { labels.push(runner.currentLabel); runner.record(100) }
    expect(labels).toEqual(['1군', '2군', '3군'])
    expect(runner.damages).toEqual([100, 100, 100])
  })
  it('2·3군은 장착 정보 JSON에도 함께 저장돼 옛 서버에서도 남는다', () => {
    const state = createInitialState()
    state.reserveSquads = [['x', 'y'], ['z']]
    const unpacked = unpackLoadouts(JSON.parse(JSON.stringify(packLoadouts(state))))
    expect(unpacked.squads).toEqual([['x', 'y'], ['z']])
    expect(Object.keys(unpacked.loadouts)).not.toContain('__squads')
    expect(createInitialState().reserveSquads).toEqual([[], []])
  })
})
