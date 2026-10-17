import { describe, expect, it } from 'vitest'
import { ATTENDANCE_DAYS, ATTENDANCE_REWARDS, attendanceLedger, nextAttendanceDay } from '../server/attendance.mjs'
import { applyAttendanceReward, claimLocalAttendance, createInitialState, drawEquipment, recruit } from '../src/game/strategy'
import { ensureMissions } from '../src/game/missions'

const DAY = 24 * 60 * 60 * 1000
const fresh = () => { const state = createInitialState(); ensureMissions(state); return state }

describe('출석 체크', () => {
  it('첫 7일 보상은 요청대로, 그 뒤 30일(모두 37일)', () => {
    expect(ATTENDANCE_DAYS).toBe(37)
    const week = ATTENDANCE_REWARDS.slice(0, 7)
    expect(week[0].general).toBe('cao-ren')
    expect(week[1].freeRecruits).toBe(50)
    expect(week[2].freeDraws).toBe(50)
    expect(week[3].gold).toBe(100)
    expect(week[4].silver).toBe(50000)
    expect(week[5].manuals).toBe(500)
    expect(week[6].general).toBe('zhao-yun')
    expect(attendanceLedger(4)).toEqual({ gold: 100, fragments: 0, stones: 0 })
  })

  it('하루에 한 번, 다음 날짜로(빠진 날이 있어도 이어서), 37일 뒤 끝', () => {
    expect(nextAttendanceDay(undefined, '2026-10-17')).toBe(1)
    expect(nextAttendanceDay({ count: 1, last: '2026-10-17' }, '2026-10-17')).toBeNull()
    expect(nextAttendanceDay({ count: 1, last: '2026-10-17' }, '2026-10-20')).toBe(2)
    expect(nextAttendanceDay({ count: 37, last: '2026-10-17' }, '2026-12-01')).toBeNull()
  })

  it('게스트(로컬): 첫날 조인 합류, 같은 날 다시 접속하면 없음, 다음 날 무료 모집권 50', () => {
    const state = fresh()
    const t0 = Date.UTC(2026, 9, 17, 3)
    const first = claimLocalAttendance(state, t0)
    expect(first?.day).toBe(1)
    expect(state.generals.some(general => general.id === 'cao-ren')).toBe(true)
    expect(claimLocalAttendance(state, t0 + 1000)).toBeNull()
    expect(claimLocalAttendance(state, t0 + DAY)?.day).toBe(2)
    expect(state.missions!.freeRecruits).toBe(50)
  })

  it('무료권은 옥패 대신 먼저 쓰인다', () => {
    const state = fresh()
    state.missions!.freeRecruits = 10
    state.missions!.freeDraws = 1
    const honor = state.honor
    expect(recruit(state, 10).ok).toBe(true)
    expect(state.honor).toBe(honor)
    expect(state.missions!.freeRecruits).toBe(0)
    expect(drawEquipment(state, 1).ok).toBe(true)
    expect(state.honor).toBe(honor)
    expect(state.missions!.freeDraws).toBe(0)
  })

  it('회원은 장부 재화(금화)를 서버가 주므로 게임은 더하지 않는다, 이미 있는 무장은 성급 +1', () => {
    const state = fresh()
    const gold = state.gold
    applyAttendanceReward(state, 4, false)
    expect(state.gold).toBe(gold)
    applyAttendanceReward(state, 1, false)
    const stars = state.generals.find(general => general.id === 'cao-ren')!.stars
    applyAttendanceReward(state, 1, false)
    expect(state.generals.find(general => general.id === 'cao-ren')!.stars).toBe(stars + 1)
    const before = state.generals.length
    const claim = applyAttendanceReward(state, 37, false)
    expect(claim?.general?.grade).toBe(5)
    expect(state.generals.length).toBeGreaterThanOrEqual(before)
  })
})
