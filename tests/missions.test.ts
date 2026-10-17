import { describe, expect, it } from 'vitest'
import { DAILY_BONUS_ID, MISSIONS, claimMission, dailyBonusReady, ensureMissions, recordMission, seoulDay, seoulWeek } from '../src/game/missions'
import { createInitialState } from '../src/game/strategy'

describe('daily and weekly missions', () => {
  it('uses Korean dates: day at midnight, week from Monday', () => {
    expect(seoulDay(Date.UTC(2026, 9, 12, 14, 59))).toBe('2026-10-12')
    expect(seoulDay(Date.UTC(2026, 9, 12, 15, 0))).toBe('2026-10-13')
    // 2026-10-18(일) 23:59 한국 → 그 주 월요일 10-12, 10-19(월) 0시부터 새 주
    expect(seoulWeek(Date.UTC(2026, 9, 18, 14, 59))).toBe('2026-10-12')
    expect(seoulWeek(Date.UTC(2026, 9, 18, 15, 0))).toBe('2026-10-19')
  })

  it('tracks progress, pays rewards once, and resets daily missions next day', () => {
    const state = createInitialState()
    const day1 = Date.UTC(2026, 9, 13, 3, 0)
    expect(recordMission(state, 'battleWin', 1, day1)).not.toContain('전투 승리 3회')
    expect(recordMission(state, 'battleWin', 2, day1)).toContain('전투 승리 3회')
    const honor = state.honor
    expect(claimMission(state, 'd-win', day1).ok).toBe(true)
    expect(state.honor).toBe(honor + 150)
    expect(claimMission(state, 'd-win', day1).ok).toBe(false)
    expect(claimMission(state, 'd-income', day1).ok).toBe(false)
    expect(ensureMissions(state, day1 + 86_400_000).progress['d-win']).toBeUndefined()
    expect(ensureMissions(state, day1 + 86_400_000).progress['w-win']).toBe(3)
  })

  it('gives the all-daily bonus only after every daily mission is claimed', () => {
    const state = createInitialState()
    const now = Date.UTC(2026, 9, 14, 3, 0)
    for (const mission of MISSIONS.filter(item => item.scope === 'daily')) recordMission(state, mission.event, mission.goal, now)
    expect(dailyBonusReady(state, now)).toBe(false)
    for (const mission of MISSIONS.filter(item => item.scope === 'daily')) expect(claimMission(state, mission.id, now).ok).toBe(true)
    expect(dailyBonusReady(state, now)).toBe(true)
    expect(claimMission(state, DAILY_BONUS_ID, now).ok).toBe(true)
    expect(claimMission(state, DAILY_BONUS_ID, now).ok).toBe(false)
  })
  it('임무 보상을 이미 받았으면 처음 시작 안내의 「임무 보상 받기」 단계가 끝난 것으로 처리된다', () => {
    const state = createInitialState()
    const missions = ensureMissions(state)
    missions.claimed.push('d-income')
    expect(ensureMissions(state).tutorial).toContain('t-mission')
  })
})
