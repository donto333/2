import { describe, expect, it } from 'vitest'
import { damp, easeOutBack, monotoneSample, springTo, track, wobble } from '../src/game/motion-math'
import { CHARGE_STRIKE, MELEE_DURATION, MELEE_STRIKE, actorPose, skillDuration, type Motion, type Pose } from '../src/game/battle-motion'
import { STRIKE_FRAMES, strikeInfluences, uniformTimes } from '../src/game/battle-rig'

const pose = (): Pose => ({ z: 0, y: 0, tilt: 0, twist: 0, scale: 1 })

/** 프레임마다 자세가 얼마나 튀는지(가장 큰 한 프레임 변화) */
function maxStep(motion: Motion, dt = 1 / 60): number {
  let prev = actorPose({ ...motion, t: 0 }, 0, pose())
  let worst = 0
  for (let t = dt; t <= motion.dur + 1e-9; t += dt) {
    const cur = actorPose({ ...motion, t }, 0, pose())
    worst = Math.max(worst, Math.abs(cur.z - prev.z), Math.abs(cur.y - prev.y), Math.abs(cur.tilt - prev.tilt) * 2, Math.abs(cur.twist - prev.twist) * 2)
    prev = cur
  }
  return worst
}

describe('모션 수학', () => {
  it('임계 감쇠 스프링: 출발 속도가 0에서 붙고, 넘치지 않고 목표에 닿는다', () => {
    const s = { x: 0, v: 0 }
    const xs: number[] = []
    for (let i = 0; i < 120; i += 1) { springTo(s, 1, 0.3, 1 / 60); xs.push(s.x) }
    expect(xs[0]).toBeLessThan(0.01) // 첫 프레임은 아주 조금만(뚝 출발하지 않음)
    expect(Math.max(...xs)).toBeLessThanOrEqual(1 + 1e-9)
    expect(xs.at(-1)).toBeGreaterThan(0.97)
  })
  it('스프링은 프레임 간격이 달라도 같은 곳에 닿는다', () => {
    const a = { x: 0, v: 0 }, b = { x: 0, v: 0 }
    for (let i = 0; i < 60; i += 1) springTo(a, 2, 0.25, 1 / 60)
    for (let i = 0; i < 20; i += 1) springTo(b, 2, 0.25, 1 / 20)
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-6)
    expect(damp(0, 1, 0.5, 0.5)).toBeCloseTo(0.5, 6)
  })
  it('감쇠 진동: 맞으면 밀렸다가 살짝 되튕기고 가라앉는다', () => {
    const s = { x: 0.5, v: 4 }
    let min = 0, peak = 0
    for (let i = 0; i < 180; i += 1) { wobble(s, 0, 2.3, 0.42, 1 / 60); min = Math.min(min, s.x); peak = Math.max(peak, s.x) }
    expect(peak).toBeGreaterThan(0.5)
    expect(min).toBeLessThan(0) // 되튕김
    expect(min).toBeGreaterThan(-0.4)
    expect(Math.abs(s.x)).toBeLessThan(0.02)
  })
  it('단조 큐빅: 열쇠 값은 지나가고, 방향이 바뀌는 꼭대기에서 넘치지 않는다', () => {
    const times = [0, 0.3, 0.5, 1], values = [0, -60, 110, 0]
    for (let i = 0; i < times.length; i += 1) expect(monotoneSample(times, values, times[i])).toBeCloseTo(values[i], 6)
    for (let t = 0; t <= 1; t += 0.01) {
      const v = monotoneSample(times, values, t)
      expect(v).toBeGreaterThanOrEqual(-60 - 1e-6)
      expect(v).toBeLessThanOrEqual(110 + 1e-6)
    }
    expect(easeOutBack(1)).toBeCloseTo(1, 6)
    expect(track([{ t: 0, v: 0 }, { t: 1, v: 2 }], 0.5)).toBeCloseTo(1, 6)
  })
})

describe('전투 몸동작', () => {
  it('근접 공격: 뒤로 당겼다가(예비 동작) 앞으로 나가고, 닿은 뒤 더 밀려 나갔다가(팔로스루) 제자리로', () => {
    const m: Motion = { kind: 'melee', t: 0, dur: MELEE_DURATION, hit: MELEE_STRIKE }
    const at = (t: number) => actorPose({ ...m, t }, 0, pose()).z
    expect(at(MELEE_STRIKE * 0.55)).toBeGreaterThan(0.2)
    expect(at(MELEE_STRIKE)).toBeLessThan(-0.9)
    expect(at(MELEE_STRIKE + 0.07)).toBeLessThan(at(MELEE_STRIKE))
    expect(Math.abs(at(MELEE_DURATION))).toBeLessThan(1e-6)
    // 타격 직전이 예비 동작보다 빠르다(빨라지며 닿는다)
    const early = Math.abs(at(0.05) - at(0.04)), late = Math.abs(at(MELEE_STRIKE) - at(MELEE_STRIKE - 0.01))
    expect(late).toBeGreaterThan(early * 3)
  })
  it('어떤 동작도 한 프레임에 크게 튀지 않고, 끝나면 기본 자세로 돌아온다', () => {
    const motions: Motion[] = [
      { kind: 'melee', t: 0, dur: MELEE_DURATION, hit: MELEE_STRIKE },
      { kind: 'shoot', t: 0, dur: 0.5, hit: 0.12 },
      { kind: 'skill', t: 0, dur: skillDuration('돌격'), skillType: '돌격', dash: 3 },
      { kind: 'skill', t: 0, dur: skillDuration('사격'), skillType: '사격' },
      { kind: 'skill', t: 0, dur: skillDuration('계략'), skillType: '계략' },
    ]
    for (const m of motions) {
      // 예전 곡선보다 크지 않게(한 프레임 최대 변화: 근접 0.258 → 0.233, 돌격 0.429 → 0.382): 타격 직전 속도를 조금 줄이고 팔로스루로 이었다
      expect(maxStep(m)).toBeLessThan(m.skillType === '돌격' ? 0.4 : m.kind === 'melee' ? 0.25 : 0.15)
      const end = actorPose({ ...m, t: m.dur }, 0, pose())
      expect(Math.abs(end.z) + Math.abs(end.y) + Math.abs(end.tilt) + Math.abs(end.scale - 1)).toBeLessThan(1e-3)
    }
  })
  it('돌격: 착지에서 무릎을 굽힌다', () => {
    const m: Motion = { kind: 'skill', t: 0, dur: skillDuration('돌격'), skillType: '돌격', dash: 3 }
    expect(actorPose({ ...m, t: CHARGE_STRIKE + 0.07 }, 0, pose()).y).toBeLessThan(-0.05)
  })
})

describe('공격 자세 프레임', () => {
  it('구운 자세 사이 가중치는 합이 1을 넘지 않고, 시간에 따라 매끄럽게 바뀐다', () => {
    const times = [0, 0.1, 0.2, 0.28, 0.33, 0.37, 0.41, 0.45, 0.5, 0.62, 0.8, 0.95]
    expect(times.length).toBe(STRIKE_FRAMES)
    const out = new Array(STRIKE_FRAMES - 1).fill(0)
    let prev = strikeInfluences(0.001, out, times).slice()
    for (let p = 0.002; p < 1; p += 0.001) {
      const cur = strikeInfluences(p, out, times).slice()
      const sum = cur.reduce((a, b) => a + b, 0)
      expect(sum).toBeLessThanOrEqual(1 + 1e-9)
      const jump = cur.reduce((acc, v, i) => Math.max(acc, Math.abs(v - prev[i])), 0)
      expect(jump).toBeLessThan(0.2)
      prev = cur
    }
    expect(strikeInfluences(1, out, times).every(v => v === 0)).toBe(true)
    expect(uniformTimes(4).map(v => Math.round(v * 1000) / 1000)).toEqual([0, 0.333, 0.666, 0.999])
  })
})
