// 자연스러운 움직임을 위한 작은 수학 도구들.
//  - 임계 감쇠 스프링(반감기로 조절): 목표로 미끄러지듯 다가가되 출발할 때 속도가 0에서 붙는다(뚝 출발하지 않음)
//  - 감쇠 진동 스프링: 맞았을 때 밀렸다가 살짝 되튕겨 자리 잡는 움직임
//  - 이징: 예비 동작은 천천히, 타격은 빨라지며, 회복은 늦어지며 끝나게
//  - 단조 큐빅 보간: 열쇠 자세마다 멈칫하지 않고 이어지되, 방향이 바뀌는 자세에서는 넘치지 않게
//  - 부드러운 노이즈: 매 프레임 무작위 대신 이어지는 흔들림(카메라)
// 참고: D. Holden "Spring-It-On: The Game Developer's Spring-Roll-Call", Unreal SpringMath,
//       S. Eiserloh GDC 2016 "Juicing Your Cameras With Math"(trauma² 흔들림).

const LN2X4 = 4 * Math.LN2

/** 임계 감쇠 스프링 한 축(위치·속도). halflife초 뒤 남은 거리가 절반이 된다 */
export interface Spring1 { x: number; v: number }

/** 임계 감쇠 스프링을 dt만큼 정확히 진행(프레임 간격이 달라도 같은 움직임) */
export function springTo(s: Spring1, goal: number, halflife: number, dt: number): void {
  const y = LN2X4 / Math.max(1e-4, halflife) / 2
  const j0 = s.x - goal
  const j1 = s.v + j0 * y
  const e = Math.exp(-y * dt)
  s.x = e * (j0 + j1 * dt) + goal
  s.v = e * (s.v - j1 * y * dt)
}

/** 프레임 간격과 상관없이 같은 빠르기로 목표에 다가간다(속도 없는 단순 감쇠) */
export function damp(current: number, goal: number, halflife: number, dt: number): number {
  return goal + (current - goal) * Math.exp(-Math.LN2 * dt / Math.max(1e-4, halflife))
}

/**
 * 감쇠 진동 스프링(살짝 넘쳤다가 돌아온다). freq는 초당 흔들림 수(Hz), zeta는 감쇠비(1이면 넘치지 않음).
 * 큰 dt에도 터지지 않도록 잘게 나눠 진행한다.
 */
export function wobble(s: Spring1, goal: number, freq: number, zeta: number, dt: number): void {
  const w = 2 * Math.PI * freq
  const k = w * w, c = 2 * zeta * w
  let left = Math.min(dt, 0.1)
  while (left > 1e-6) {
    const h = Math.min(left, 1 / 120)
    s.v += (-k * (s.x - goal) - c * s.v) * h
    s.x += s.v * h
    left -= h
  }
}

// ── 이징 ─────────────────────────────────────────────────────
export const clamp01 = (k: number) => Math.min(1, Math.max(0, k))
export const smooth = (k: number) => k * k * (3 - 2 * k)
export const easeInOut = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * k)
export const easeIn2 = (k: number) => k * k
export const easeIn3 = (k: number) => k * k * k
/** 타격: 빨라지며 들어가 닿기 직전 조금 늦춘다(닿는 순간 속도가 평균과 같아 팔로스루로 이어진다) */
export const easeStrike = (k: number) => k * k * (2 - k)
export const easeOut2 = (k: number) => 1 - (1 - k) * (1 - k)
export const easeOut3 = (k: number) => 1 - Math.pow(1 - k, 3)
/** 끝에서 살짝 넘쳤다가 돌아온다(회복 동작이 제자리에 "툭" 붙지 않게) */
export const easeOutBack = (k: number, over = 1.3) => { const c = over + 1, m = k - 1; return 1 + c * m * m * m + over * m * m }

export type Ease = (k: number) => number

/** 시간표 한 칸: 이 시각에 이 값, 앞 칸에서 오는 동안 쓰는 이징 */
export interface Key { t: number; v: number; e?: Ease }

/** 시간표에서 값 꺼내기(칸마다 이징이 다르다: 예비 동작 easeInOut, 타격 easeIn, 회복 easeOut 등) */
export function track(keys: Key[], t: number): number {
  if (!keys.length) return 0
  if (t <= keys[0].t) return keys[0].v
  for (let i = 1; i < keys.length; i += 1) {
    const b = keys[i]
    if (t <= b.t) {
      const a = keys[i - 1]
      const k = b.t > a.t ? (b.e ?? easeInOut)(clamp01((t - a.t) / (b.t - a.t))) : 1
      return a.v + (b.v - a.v) * k
    }
  }
  return keys[keys.length - 1].v
}

/**
 * 단조 큐빅(Fritsch–Carlson) 기울기: 같은 방향으로 이어지는 열쇠에서는 속도를 이어 주고,
 * 방향이 바뀌는 열쇠(크게 들어 올린 꼭대기 등)에서는 0으로 두어 넘치지 않게 한다.
 */
export function monotoneTangents(times: number[], values: number[]): number[] {
  const n = values.length
  const m = new Array<number>(n).fill(0)
  if (n < 2) return m
  const d: number[] = []
  for (let i = 0; i < n - 1; i += 1) d.push((values[i + 1] - values[i]) / Math.max(1e-6, times[i + 1] - times[i]))
  for (let i = 1; i < n - 1; i += 1) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue }
    // 시간 간격을 따진 조화 평균(가까운 쪽 기울기를 더 따른다)
    const h0 = times[i] - times[i - 1], h1 = times[i + 1] - times[i]
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
  }
  // 처음·끝은 서 있는 자세에서 출발·도착하므로 속도 0
  return m
}

/** 큐빅 에르미트 한 칸 */
export function hermite(p0: number, p1: number, m0: number, m1: number, h: number, k: number): number {
  const k2 = k * k, k3 = k2 * k
  return (2 * k3 - 3 * k2 + 1) * p0 + (k3 - 2 * k2 + k) * h * m0 + (-2 * k3 + 3 * k2) * p1 + (k3 - k2) * h * m1
}

/** 열쇠 값 묶음을 단조 큐빅으로 이어 t의 값 구하기 */
export function monotoneSample(times: number[], values: number[], t: number, tangents = monotoneTangents(times, values)): number {
  const n = times.length
  if (!n) return 0
  if (t <= times[0]) return values[0]
  if (t >= times[n - 1]) return values[n - 1]
  let i = 0
  while (i < n - 2 && t > times[i + 1]) i += 1
  const h = times[i + 1] - times[i]
  const k = h > 0 ? (t - times[i]) / h : 1
  return hermite(values[i], values[i + 1], tangents[i], tangents[i + 1], h, k)
}

// ── 부드러운 노이즈 ──────────────────────────────────────────
/** -1~1 사이에서 부드럽게 이어지는 값(서로 맞지 않는 주파수의 사인을 겹친다). seed로 축마다 다르게 */
export function smoothNoise(t: number, seed: number): number {
  return (Math.sin(t * 1.0 + seed * 1.7) * 0.5 + Math.sin(t * 2.31 + seed * 3.1) * 0.3 + Math.sin(t * 4.67 + seed * 5.3) * 0.2)
}
