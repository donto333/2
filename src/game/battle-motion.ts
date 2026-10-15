// 전투 동작(공격·스킬·피격·쓰러짐)과 그에 붙는 시각 효과.
// arena.ts가 무장 한 명마다 Motion을 들고 있고, 매 프레임 actorPose로 몸 전체의 움직임(돌진·뒤로 젖힘·떠오름)을 얻는다.
// 효과(VFX)는 ArenaEffect와 같은 모양(Fx)을 돌려주며, 도형은 모듈에서 한 번만 만들어 함께 쓴다.
import * as THREE from 'three'
import type { SkillType } from './skills'
import { easeIn2, easeInOut, easeOut2, easeOut3, easeStrike, track, type Ease, type Key } from './motion-math'

export interface Fx {
  object: THREE.Object3D
  age: number
  life: number
  tick: (effect: Fx, delta: number) => void
  dispose: () => void
}

// ── 동작 ─────────────────────────────────────────────────────
export type MotionKind = 'melee' | 'shoot' | 'skill'
export interface Motion {
  kind: MotionKind
  t: number
  dur: number
  skillType?: SkillType
  /** 돌격 스킬: 앞으로 달려 나가는 거리 */
  dash?: number
  /** 일반 공격: 무기가 닿거나 화살이 떠나는 순간(초) */
  hit?: number
}

/** 공격 동작 시간과 실제로 맞는 순간(초) */
export const MELEE_DURATION = 0.62
export const MELEE_STRIKE = 0.25
export const SHOOT_DURATION = 0.5
export const SHOOT_RELEASE = 0.12
/** 스킬: 기 모으기 → 발동 */
export const SKILL_RELEASE = 0.42
export const CHARGE_STRIKE = 0.62

export function skillDuration(type: SkillType): number {
  return type === '돌격' ? 1.45 : 1.2
}

export interface Pose {
  /** 몸 앞(-Z) 쪽으로 움직인 거리(음수가 앞) */
  z: number
  y: number
  /** 앞(-)·뒤(+)로 기울기 */
  tilt: number
  /** 좌우 비틀기 */
  twist: number
  scale: number
}

const ease = (k: number) => k * k * (3 - 2 * k)
const clamp01 = (k: number) => Math.min(1, Math.max(0, k))
const seg = (t: number, a: number, b: number) => ease(clamp01((t - a) / (b - a)))

// 동작 곡선(애니메이션 원칙): 예비 동작은 천천히 당기고(easeInOut) → 타격은 빨라지며 닿고(easeIn)
// → 닿은 뒤 조금 더 밀려 나갔다가(팔로스루, easeOut) → 늦어지며 제자리로. 상체 비틀기는 몸보다 조금 늦게 따라온다(겹침 동작).
const K = (t: number, v: number, e?: Ease): Key => ({ t, v, e })

export function actorPose(motion: Motion | null, hitReact: number, out: Pose): Pose {
  out.z = 0; out.y = 0; out.tilt = 0; out.twist = 0; out.scale = 1
  if (motion) {
    const t = motion.t, D = motion.dur
    if (motion.kind === 'melee') {
      // (팔·무기 동작은 병종별 자세 모프가 맡고, 여기서는 몸 전체의 쏠림만)
      const h = motion.hit ?? MELEE_STRIKE
      const a = h * 0.55, f = h + 0.07, s = Math.min(D - 0.05, h + 0.18)
      out.z = track([K(0, 0), K(a, 0.24), K(h, -0.95, easeStrike), K(f, -1.04, easeOut2), K(s, -0.98), K(D, 0, easeInOut)], t)
      out.y = track([K(0, 0), K(a, -0.04), K(h, 0.02, easeIn2), K(s, 0, easeOut2)], t)
      out.tilt = track([K(0, 0), K(a, 0.09), K(h, -0.14, easeStrike), K(f, -0.17, easeOut2), K(s, -0.12), K(D, 0, easeInOut)], t)
      // 비틀기는 0.04초 늦게 따라온다
      out.twist = track([K(0, 0), K(a + 0.04, -0.14), K(h + 0.04, 0.16, easeStrike), K(f + 0.06, 0.2, easeOut2), K(D, 0, easeInOut)], t)
    } else if (motion.kind === 'shoot') {
      const r = motion.hit ?? SHOOT_RELEASE
      out.z = track([K(0, 0), K(r, 0.08), K(r + 0.06, 0.22, easeOut3), K(D, 0, easeInOut)], t)
      out.tilt = track([K(0, 0), K(r, 0.04), K(r + 0.06, 0.09, easeOut3), K(D, 0, easeInOut)], t)
    } else {
      const type = motion.skillType ?? '돌격'
      const R = SKILL_RELEASE
      if (type === '돌격') {
        const d = motion.dash ?? 2.4, S = CHARGE_STRIKE
        // 몸을 낮춰 뒤로 모았다가 → 튀어 나가 → 닿은 뒤 조금 더 미끄러지고 → 돌아온다
        out.z = track([K(0, 0), K(R, 0.45), K(S, -d, easeStrike), K(S + 0.1, -d * 1.06, easeOut2), K(0.95, -d), K(D, 0, easeInOut)], t)
        // 도약: 올라갈 때 늦어지고 내려올 때 빨라진다(중력) → 착지에서 무릎을 굽힌다
        out.y = track([K(0, 0), K(R, -0.08), K((R + S) / 2, 0.35, easeOut2), K(S, 0, easeIn2), K(S + 0.07, -0.07, easeOut2), K(S + 0.2, 0)], t)
        out.tilt = track([K(0, 0), K(R, 0.2), K(S, -0.36, easeStrike), K(0.95, -0.3), K(D, 0, easeInOut)], t)
        out.twist = 0.5 * Math.sin(seg(t, S - 0.06, 0.9) * Math.PI)
        out.scale = track([K(0, 1), K(R, 1.08), K(0.95, 1.08), K(D, 1)], t)
      } else if (type === '사격') {
        out.z = track([K(0, 0), K(R, 0.2), K(R + 0.1, 0.55, easeOut3), K(0.7, 0.5), K(D, 0, easeInOut)], t)
        out.tilt = track([K(0, 0), K(R, 0.16), K(R + 0.08, 0.2, easeOut3), K(0.7, 0.16), K(D, 0, easeInOut)], t)
        out.scale = track([K(0, 1), K(R, 1.06), K(0.7, 1.06), K(D, 1)], t)
      } else {
        // 계략·통솔·수호·치유: 기를 모으며 떠올랐다가(위로 갈수록 늦어짐) 떨어져(빨라짐) 무릎을 굽히며 내려선다
        const land = D - 0.1
        out.y = track([K(0, 0), K(R, 0.42, easeOut2), K(0.75, 0.38), K(land, 0, easeIn2), K(land + 0.05, -0.05, easeOut2), K(D, 0)], t)
          + Math.sin(t * 9) * 0.03 * (1 - seg(t, 0.6, 0.85)) * seg(t, 0, R)
        out.tilt = track([K(0, 0), K(R, 0.1), K(R + 0.12, -0.04, easeOut2), K(land, 0), K(land + 0.05, -0.05, easeOut2), K(D, 0)], t)
        out.scale = track([K(0, 1), K(R, 1.1), K(0.75, 1.1), K(D, 1)], t)
      }
    }
  }
  // 피격(감쇠 진동 스프링 값, 음수로 살짝 넘어오기도 한다): 뒤로 밀리며 젖혀진다
  // 피격: 뒤로 조금 밀리고 살짝 젖혀진다(말과 무장은 무거워 크게 기울지 않는다)
  out.z += hitReact * 0.3
  out.tilt += hitReact * 0.07
  return out
}

// ── 공용 도형·무늬 ───────────────────────────────────────────
let shared: {
  arc: THREE.BufferGeometry
  ring: THREE.RingGeometry
  disc: THREE.PlaneGeometry
  pillar: THREE.CylinderGeometry
  orb: THREE.SphereGeometry
  mote: THREE.IcosahedronGeometry
  streak: THREE.PlaneGeometry
  arrow: THREE.CylinderGeometry
  dome: THREE.SphereGeometry
  domeWire: THREE.IcosahedronGeometry
  arcTex: THREE.Texture
  circleTex: THREE.Texture
  pillarTex: THREE.Texture
  glowTex: THREE.Texture
} | null = null

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (context) draw(context, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** 칼날 궤적: 반지름 1의 초승달 띠. u는 궤적 방향(1이 칼끝), v는 폭 방향 */
function arcGeometry(): THREE.BufferGeometry {
  const steps = 28, sweep = Math.PI * 1.15
  const positions: number[] = [], uvs: number[] = [], index: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps
    const a = -sweep / 2 + u * sweep
    const width = 0.06 + 0.3 * Math.sin(u * Math.PI * 0.92 + 0.08)
    const inner = 1 - width, outer = 1 + width * 0.25
    positions.push(Math.cos(a) * inner, Math.sin(a) * inner, 0, Math.cos(a) * outer, Math.sin(a) * outer, 0)
    uvs.push(u, 0, u, 1)
    if (i < steps) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(index)
  return geometry
}

function res() {
  if (shared) return shared
  const arcTex = canvasTexture(256, (c, s) => {
    // 칼끝(오른쪽)은 하얗고 꼬리(왼쪽)로 갈수록 사라진다, 바깥 가장자리가 가장 밝다
    const along = c.createLinearGradient(0, 0, s, 0)
    along.addColorStop(0, 'rgba(255,255,255,0)')
    along.addColorStop(0.55, 'rgba(255,255,255,0.45)')
    along.addColorStop(0.92, 'rgba(255,255,255,1)')
    along.addColorStop(1, 'rgba(255,255,255,0.2)')
    c.fillStyle = along
    c.fillRect(0, 0, s, s)
    c.globalCompositeOperation = 'destination-in'
    const across = c.createLinearGradient(0, 0, 0, s)
    across.addColorStop(0, 'rgba(0,0,0,0.15)')
    across.addColorStop(0.75, 'rgba(0,0,0,1)')
    across.addColorStop(1, 'rgba(0,0,0,0.3)')
    c.fillStyle = across
    c.fillRect(0, 0, s, s)
  })
  const circleTex = canvasTexture(512, (c, s) => {
    // 진법 문양: 겹친 원 · 팔각 별 · 눈금 (문자는 넣지 않는다)
    const m = s / 2
    c.strokeStyle = '#fff'
    c.shadowColor = '#fff'
    c.shadowBlur = 10
    const circle = (r: number, w: number) => { c.lineWidth = w; c.beginPath(); c.arc(m, m, r, 0, Math.PI * 2); c.stroke() }
    circle(m * 0.96, 7); circle(m * 0.86, 3); circle(m * 0.5, 4); circle(m * 0.2, 3)
    c.lineWidth = 4
    for (let k = 0; k < 2; k += 1) {
      c.beginPath()
      for (let i = 0; i <= 4; i += 1) {
        const a = k * Math.PI / 4 + i * Math.PI / 2
        const x = m + Math.cos(a) * m * 0.84, y = m + Math.sin(a) * m * 0.84
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y)
      }
      c.stroke()
    }
    for (let i = 0; i < 48; i += 1) {
      const a = i / 48 * Math.PI * 2
      const r1 = m * (i % 4 === 0 ? 0.86 : 0.9), r2 = m * 0.95
      c.lineWidth = i % 4 === 0 ? 5 : 2
      c.beginPath(); c.moveTo(m + Math.cos(a) * r1, m + Math.sin(a) * r1); c.lineTo(m + Math.cos(a) * r2, m + Math.sin(a) * r2); c.stroke()
    }
    for (let i = 0; i < 8; i += 1) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8
      c.beginPath(); c.arc(m + Math.cos(a) * m * 0.68, m + Math.sin(a) * m * 0.68, m * 0.07, 0, Math.PI * 2); c.lineWidth = 3; c.stroke()
    }
  })
  const pillarTex = canvasTexture(128, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,1)')
    c.fillStyle = g
    c.fillRect(0, 0, s, s)
    // 세로 줄무늬로 빛기둥의 결을 준다
    c.globalCompositeOperation = 'destination-out'
    for (let x = 0; x < s; x += 9) { c.fillStyle = `rgba(0,0,0,${0.15 + (x * 7 % 5) / 10})`; c.fillRect(x, 0, 3, s) }
  })
  const glowTex = canvasTexture(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(255,255,255,0.6)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g
    c.fillRect(0, 0, s, s)
  })
  const arrow = new THREE.CylinderGeometry(0.018, 0.018, 0.9, 4)
  arrow.rotateX(Math.PI / 2)
  const streak = new THREE.PlaneGeometry(0.22, 1.6)
  streak.rotateX(-Math.PI / 2)
  shared = {
    arc: arcGeometry(),
    ring: new THREE.RingGeometry(0.9, 1, 64),
    disc: new THREE.PlaneGeometry(2, 2),
    pillar: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true),
    orb: new THREE.SphereGeometry(1, 14, 10),
    mote: new THREE.IcosahedronGeometry(1, 0),
    streak,
    arrow,
    dome: new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    domeWire: new THREE.IcosahedronGeometry(1, 2),
    arcTex, circleTex, pillarTex, glowTex,
  }
  shared.pillar.translate(0, 0.5, 0)
  return shared
}

function glowMaterial(color: number, opacity = 1, map?: THREE.Texture): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  if (map) material.map = map
  return material
}

/** 그룹 안의 재질만 버린다(도형은 함께 쓰므로 남긴다) */
function disposeMaterials(object: THREE.Object3D): void {
  object.traverse(node => {
    const material = (node as THREE.Mesh).material
    if (material && !Array.isArray(material)) material.dispose()
  })
}

function makeFx(object: THREE.Object3D, life: number, tick: (k: number, delta: number, age: number) => void): Fx {
  return { object, age: 0, life, tick: (effect, delta) => tick(Math.min(1, effect.age / effect.life), delta, effect.age), dispose: () => disposeMaterials(object) }
}

// ── 일반 공격 ───────────────────────────────────────────────
/**
 * 칼날 궤적. position은 베는 지점, facing은 바라보는 방향(월드 Y 회전), flip은 반대 방향 베기.
 */
export function slashArc(position: THREE.Vector3, facing: number, color: number, size = 1.3, flip = false, tiltZ = 0.5): Fx {
  const r = res()
  const group = new THREE.Group()
  group.position.copy(position)
  group.rotation.y = facing
  const holder = new THREE.Group()
  holder.rotation.x = -Math.PI / 2 + 0.35 // 거의 수평으로 눕힌 궤적
  holder.rotation.z = tiltZ * (flip ? -1 : 1)
  group.add(holder)
  const blade = new THREE.Mesh(r.arc, glowMaterial(color, 1, r.arcTex))
  // 밝은 흙바닥 위에서도 보이도록 바깥 칼빛은 덧셈이 아닌 보통 섞기
  ;(blade.material as THREE.MeshBasicMaterial).blending = THREE.NormalBlending
  const core = new THREE.Mesh(r.arc, glowMaterial(0xffffff, 1, r.arcTex))
  core.scale.setScalar(0.97)
  blade.scale.setScalar(size)
  core.scale.multiplyScalar(size)
  if (flip) { blade.scale.x *= -1; core.scale.x *= -1 }
  holder.add(blade, core)
  const bm = blade.material as THREE.MeshBasicMaterial, cm = core.material as THREE.MeshBasicMaterial
  return makeFx(group, 0.28, k => {
    // 휘두르는 방향으로 돌며 펼쳐지고 사라진다
    holder.rotation.y = (flip ? 1 : -1) * (-0.9 + k * 1.3)
    const s = 0.8 + ease(Math.min(1, k * 2)) * 0.35
    group.scale.setScalar(s)
    bm.opacity = 1 - k * k
    cm.opacity = 1 - k * k
  })
}

/** 화살·기탄. 도착하면 onArrive를 부른다 */
export function projectile(from: THREE.Vector3, to: THREE.Vector3, kind: 'arrow' | 'orb' | 'fire', color: number, flight: number, onArrive: (at: THREE.Vector3) => void, arc = kind === 'arrow' ? 1.1 : 0.5): Fx {
  const r = res()
  const group = new THREE.Group()
  const head = new THREE.Group()
  group.add(head)
  if (kind === 'arrow') {
    head.add(new THREE.Mesh(r.arrow, new THREE.MeshBasicMaterial({ color: 0xfff1c8 })))
    const glow = new THREE.Mesh(r.orb, glowMaterial(color, 0.75))
    glow.scale.set(0.07, 0.07, 0.45)
    head.add(glow)
  } else {
    const coreMesh = new THREE.Mesh(r.orb, glowMaterial(0xffffff, 1))
    coreMesh.scale.setScalar(0.13)
    const halo = new THREE.Mesh(r.orb, glowMaterial(color, 0.55))
    halo.scale.setScalar(0.3)
    head.add(coreMesh, halo)
  }
  const tail = new THREE.Mesh(r.streak, glowMaterial(color, kind === 'arrow' ? 0.45 : 0.75, r.pillarTex))
  // 화살은 가늘고 짧은 꼬리, 기탄은 굵은 꼬리
  if (kind === 'arrow') { tail.scale.set(0.22, 1, 0.32); tail.position.z = 0.3 } else tail.position.z = 0.8
  head.add(tail)
  const motes: THREE.Mesh[] = []
  if (kind !== 'arrow') {
    for (let i = 0; i < 6; i += 1) {
      const mote = new THREE.Mesh(r.mote, glowMaterial(color, 0.8))
      mote.scale.setScalar(0.05)
      mote.visible = false
      group.add(mote)
      motes.push(mote)
    }
  }
  const prev = new THREE.Vector3(), cur = new THREE.Vector3()
  const at = (k: number, out: THREE.Vector3) => out.lerpVectors(from, to, k).setY(THREE.MathUtils.lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * arc)
  let arrived = false
  let moteIndex = 0, moteTimer = 0
  return makeFx(group, flight + 0.25, (_k, delta, age) => {
    const k = Math.min(1, age / flight)
    if (k < 1) {
      at(k, cur); at(Math.max(0, k - 0.02), prev)
      head.position.copy(cur)
      if (cur.distanceToSquared(prev) > 1e-6) head.lookAt(cur.clone().add(cur.clone().sub(prev)))
      head.rotateY(Math.PI) // 꼬리(+Z)가 뒤쪽으로
      if (kind === 'orb' || kind === 'fire') head.rotation.z += delta * 10
      moteTimer -= delta
      if (motes.length && moteTimer <= 0) {
        moteTimer = 0.035
        const mote = motes[moteIndex++ % motes.length]
        mote.visible = true
        mote.position.copy(cur).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15))
        mote.userData.born = age
      }
    } else {
      head.visible = false
      if (!arrived) { arrived = true; onArrive(to.clone()) }
    }
    for (const mote of motes) {
      if (!mote.visible) continue
      const life = (age - (mote.userData.born as number)) / 0.3
      mote.scale.setScalar(0.06 * Math.max(0, 1 - life))
      mote.position.y += delta * 0.4
      if (life >= 1) mote.visible = false
    }
  })
}

/** 화염구(책사 일반 공격): 일렁이는 불덩이가 날아가며 불꽃 꼬리를 남기고, 닿으면 터져 불똥이 튄다 */
export function fireball(from: THREE.Vector3, to: THREE.Vector3, flight: number, onArrive: (at: THREE.Vector3) => void, size = 1): Fx {
  const r = res()
  const group = new THREE.Group()
  const sprite = (color: number, opacity: number, additive = true) => new THREE.Sprite(new THREE.SpriteMaterial({ map: r.glowTex, color, transparent: true, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }))
  const core = sprite(0xfff2c0, 1), mid = sprite(0xffa040, 0.9), outer = sprite(0xff4a12, 0.6)
  const head = new THREE.Group()
  head.add(outer, mid, core)
  group.add(head)
  // 꼬리 불꽃: 지나간 자리에 남아 커지며 노랑 → 주황 → 검붉게 식어 사라진다
  const flames = Array.from({ length: 22 }, () => { const f = sprite(0xffb050, 0.8); f.visible = false; group.add(f); return { f, born: 0, drift: new THREE.Vector3() } })
  const sparks = Array.from({ length: 10 }, () => { const m = new THREE.Mesh(r.mote, glowMaterial(0xffc060, 0.95)); m.visible = false; group.add(m); return { m, born: 0, v: new THREE.Vector3() } })
  const yellow = new THREE.Color(0xffd27a), orange = new THREE.Color(0xff6a1a), ember = new THREE.Color(0x5a1406)
  const cur = new THREE.Vector3()
  const arc = 0.35
  const at = (k: number, out: THREE.Vector3) => out.lerpVectors(from, to, k).setY(THREE.MathUtils.lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * arc)
  let fi = 0, si = 0, timer = 0, sparkTimer = 0, arrived = false
  // 터짐
  const blast = sprite(0xffb050, 0)
  const blastSmoke = Array.from({ length: 5 }, () => { const sm = sprite(0x2a201a, 0, false); group.add(sm); return sm })
  group.add(blast)
  const burst = Array.from({ length: 14 }, () => { const m = new THREE.Mesh(r.mote, glowMaterial(Math.random() < 0.5 ? 0xffd27a : 0xff6a1a, 0.95)); m.visible = false; group.add(m); return { m, v: new THREE.Vector3() } })
  let arriveAge = 0
  return makeFx(group, flight + 0.75, (_k, delta, age) => {
    const k = Math.min(1, age / flight)
    if (k < 1) {
      at(k, cur)
      head.position.copy(cur)
      const flick = 1 + Math.sin(age * 47) * 0.12 + Math.sin(age * 83) * 0.08
      core.scale.setScalar(0.28 * size * flick); mid.scale.setScalar(0.55 * size * flick); outer.scale.setScalar(0.95 * size * (2 - flick))
      timer -= delta
      while (timer <= 0) {
        timer += 0.016
        const f = flames[fi++ % flames.length]
        f.f.visible = true; f.born = age
        f.f.position.copy(cur).add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12))
        f.drift.set((Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4)
      }
      sparkTimer -= delta
      if (sparkTimer <= 0) {
        sparkTimer = 0.04
        const sp = sparks[si++ % sparks.length]
        sp.m.visible = true; sp.born = age; sp.m.position.copy(cur)
        sp.v.set((Math.random() - 0.5) * 1.6, Math.random() * 1.4, (Math.random() - 0.5) * 1.6)
      }
    } else if (!arrived) {
      arrived = true; arriveAge = age
      head.visible = false
      blast.position.copy(to)
      blastSmoke.forEach(sm => sm.position.copy(to).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4)))
      for (const b of burst) { b.m.visible = true; b.m.position.copy(to); b.m.scale.setScalar(0.04 + Math.random() * 0.04); const a = Math.random() * Math.PI * 2; b.v.set(Math.cos(a) * (1 + Math.random() * 2), 1 + Math.random() * 2.5, Math.sin(a) * (1 + Math.random() * 2)) }
      onArrive(to.clone())
    }
    for (const f of flames) {
      if (!f.f.visible) continue
      const life = (age - f.born) / 0.32
      if (life >= 1) { f.f.visible = false; continue }
      f.f.position.addScaledVector(f.drift, delta)
      f.f.scale.setScalar((0.35 + life * 0.55) * size)
      const c = life < 0.4 ? yellow.clone().lerp(orange, life / 0.4) : orange.clone().lerp(ember, (life - 0.4) / 0.6)
      f.f.material.color.copy(c)
      f.f.material.opacity = 0.85 * (1 - life)
    }
    for (const sp of sparks) {
      if (!sp.m.visible) continue
      const life = (age - sp.born) / 0.4
      if (life >= 1) { sp.m.visible = false; continue }
      sp.m.position.addScaledVector(sp.v, delta); sp.v.y -= delta * 3
      sp.m.scale.setScalar(0.035 * (1 - life))
    }
    if (arrived) {
      const b = (age - arriveAge) / 0.6
      blast.scale.setScalar((0.6 + Math.min(1, b * 4) * 1.8) * size)
      blast.material.opacity = b < 0.15 ? 1 : Math.max(0, 1 - (b - 0.15) / 0.5)
      blast.material.color.copy(yellow.clone().lerp(orange, Math.min(1, b * 2)))
      blastSmoke.forEach((sm, i) => { sm.position.y += delta * (0.6 + i * 0.1); sm.scale.setScalar((0.4 + b * 1.4) * size); sm.material.opacity = 0.45 * Math.sin(Math.min(1, b) * Math.PI) })
      for (const p of burst) { p.m.position.addScaledVector(p.v, delta); p.v.y -= delta * 6; (p.m.material as THREE.MeshBasicMaterial).opacity = 0.95 * Math.max(0, 1 - b) }
    }
  })
}

/** 맞는 순간의 번쩍임(작고 빠름) */
export function hitSpark(position: THREE.Vector3, color: number, size = 1): Fx {
  const r = res()
  const group = new THREE.Group()
  group.position.copy(position)
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: r.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  flash.scale.setScalar(0.9 * size)
  group.add(flash)
  const sparks: THREE.Mesh[] = []
  for (let i = 0; i < 7; i += 1) {
    const spark = new THREE.Mesh(r.streak, glowMaterial(i % 2 ? 0xffffff : color, 0.95, r.pillarTex))
    const a = Math.random() * Math.PI * 2
    spark.userData.dir = new THREE.Vector3(Math.cos(a), 0.3 + Math.random() * 0.9, Math.sin(a)).normalize()
    spark.scale.set(0.35 * size, 1, 0.35 * size)
    spark.lookAt(spark.userData.dir as THREE.Vector3)
    group.add(spark)
    sparks.push(spark)
  }
  return makeFx(group, 0.3, k => {
    ;(flash.material as THREE.SpriteMaterial).opacity = 0.75 * (1 - k)
    flash.scale.setScalar((0.7 + k * 0.9) * size)
    for (const spark of sparks) {
      spark.position.copy(spark.userData.dir as THREE.Vector3).multiplyScalar(k * 1.3 * size)
      ;(spark.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k)
    }
  })
}

// ── 스킬 ─────────────────────────────────────────────────────
/** 바닥의 진법 문양: 펼쳐지며 돌다가 사라진다 */
export function groundCircle(position: THREE.Vector3, color: number, radius: number, life = 1.3, spin = 1): Fx {
  const r = res()
  const mesh = new THREE.Mesh(r.disc, glowMaterial(color, 0.95, r.circleTex))
  mesh.rotation.x = -Math.PI / 2
  const group = new THREE.Group()
  group.position.copy(position).setY(0.06)
  group.add(mesh)
  const material = mesh.material as THREE.MeshBasicMaterial
  return makeFx(group, life, (k, delta) => {
    mesh.rotation.z += delta * spin * 1.4
    group.scale.setScalar(radius * (0.35 + ease(Math.min(1, k * 3.5)) * 0.65))
    material.opacity = 0.95 * (k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25)
  })
}

/** 빛기둥 */
export function lightPillar(position: THREE.Vector3, color: number, radius: number, height: number, life = 0.9): Fx {
  const r = res()
  const group = new THREE.Group()
  group.position.copy(position).setY(0)
  const outer = new THREE.Mesh(r.pillar, glowMaterial(color, 0.6, r.pillarTex))
  const inner = new THREE.Mesh(r.pillar, glowMaterial(0xffffff, 0.8, r.pillarTex))
  group.add(outer, inner)
  return makeFx(group, life, k => {
    const grow = ease(Math.min(1, k * 4))
    outer.scale.set(radius * (0.4 + grow * 0.6 + k * 0.3), height * grow, radius * (0.4 + grow * 0.6 + k * 0.3))
    inner.scale.set(radius * 0.45 * (1 - k), height * grow, radius * 0.45 * (1 - k))
    outer.rotation.y += 0.05
    ;(outer.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k * k)
    ;(inner.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k)
  })
}

/** 기를 모으는 빛 알갱이: 바깥에서 무장에게 빨려 든다 */
export function chargeMotes(position: THREE.Vector3, color: number, life = SKILL_RELEASE + 0.05): Fx {
  const r = res()
  const group = new THREE.Group()
  group.position.copy(position)
  const motes: Array<{ mesh: THREE.Mesh; from: THREE.Vector3; delay: number }> = []
  for (let i = 0; i < 22; i += 1) {
    const a = i / 22 * Math.PI * 2 * 3
    const mesh = new THREE.Mesh(r.mote, glowMaterial(i % 3 ? color : 0xffffff, 0.95))
    mesh.scale.setScalar(0.05 + (i % 3) * 0.02)
    group.add(mesh)
    motes.push({ mesh, from: new THREE.Vector3(Math.cos(a) * (1.6 + (i % 4) * 0.3), 0.2 + (i % 5) * 0.4, Math.sin(a) * (1.6 + (i % 4) * 0.3)), delay: (i % 6) * 0.04 })
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: r.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  glow.position.y = 1.2
  group.add(glow)
  const target = new THREE.Vector3(0, 1.2, 0)
  return makeFx(group, life, (k, _d, age) => {
    for (const mote of motes) {
      const p = clamp01((age - mote.delay) / (life - mote.delay))
      mote.mesh.position.lerpVectors(mote.from, target, ease(p))
      mote.mesh.visible = p < 1
    }
    glow.scale.setScalar(0.5 + k * 2.2)
    ;(glow.material as THREE.SpriteMaterial).opacity = 0.3 + k * 0.7
  })
}

/** 퍼져 나가는 충격파(바닥 고리 + 흙먼지 고리) */
export function shockwave(position: THREE.Vector3, color: number, radius: number, life = 0.6): Fx {
  const r = res()
  const group = new THREE.Group()
  group.position.copy(position).setY(0.08)
  const ring = new THREE.Mesh(r.ring, glowMaterial(color, 1))
  ring.rotation.x = -Math.PI / 2
  const ring2 = new THREE.Mesh(r.ring, glowMaterial(0xffffff, 0.8))
  ring2.rotation.x = -Math.PI / 2
  const dust = new THREE.Mesh(r.pillar, new THREE.MeshBasicMaterial({ color: 0xc9a77c, map: r.pillarTex, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }))
  group.add(ring, ring2, dust)
  return makeFx(group, life, k => {
    const e = 1 - Math.pow(1 - k, 3)
    ring.scale.setScalar(0.3 + e * radius)
    ring2.scale.setScalar(0.2 + e * radius * 0.82)
    dust.scale.set(0.3 + e * radius * 0.92, 0.9 * (1 - k) + 0.1, 0.3 + e * radius * 0.92)
    ;(ring.material as THREE.MeshBasicMaterial).opacity = 1 - k
    ;(ring2.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k)
    ;(dust.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k)
  })
}

/** 하늘에서 내리치는 번개 */
export function lightning(target: THREE.Vector3, color: number, life = 0.45): Fx {
  const group = new THREE.Group()
  const top = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 11, (Math.random() - 0.5) * 2))
  const bolts: THREE.Mesh[] = []
  for (let b = 0; b < 2; b += 1) {
    const points: THREE.Vector3[] = []
    const n = 10
    for (let i = 0; i <= n; i += 1) {
      const k = i / n
      const p = new THREE.Vector3().lerpVectors(top, target, k)
      if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.9))
      points.push(p)
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1), 40, b ? 0.05 : 0.11, 5, false)
    const mesh = new THREE.Mesh(tube, glowMaterial(b ? 0xffffff : color, 1))
    group.add(mesh)
    bolts.push(mesh)
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: res().glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  flash.position.copy(target).setY(0.6)
  flash.scale.setScalar(4)
  group.add(flash)
  return {
    object: group, age: 0, life,
    tick: effect => {
      const k = effect.age / effect.life
      const flicker = k < 0.5 ? (Math.sin(effect.age * 90) > -0.3 ? 1 : 0.25) : 1 - (k - 0.5) * 2
      bolts.forEach(mesh => ((mesh.material as THREE.MeshBasicMaterial).opacity = flicker))
      ;(flash.material as THREE.SpriteMaterial).opacity = 1 - k
    },
    dispose: () => { bolts.forEach(mesh => mesh.geometry.dispose()); disposeMaterials(group) },
  }
}

/** 불기둥: 빛기둥 + 솟구치는 불씨 */
export function fireBurst(position: THREE.Vector3, life = 1): Fx {
  const r = res()
  const group = new THREE.Group()
  group.position.copy(position).setY(0)
  const embers: Array<{ mesh: THREE.Mesh; v: THREE.Vector3 }> = []
  for (let i = 0; i < 26; i += 1) {
    const mesh = new THREE.Mesh(r.mote, glowMaterial(i % 3 ? 0xff7a2a : 0xffd27a, 0.95))
    mesh.scale.setScalar(0.06 + Math.random() * 0.07)
    const a = Math.random() * Math.PI * 2
    embers.push({ mesh, v: new THREE.Vector3(Math.cos(a) * (0.4 + Math.random()), 2.4 + Math.random() * 3, Math.sin(a) * (0.4 + Math.random())) })
    group.add(mesh)
  }
  const pillar = new THREE.Mesh(r.pillar, glowMaterial(0xff6a2a, 0.9, r.pillarTex))
  group.add(pillar)
  return makeFx(group, life, (k, delta) => {
    const grow = ease(Math.min(1, k * 5))
    pillar.scale.set(1.3 * (0.5 + grow * 0.5), 4.6 * grow * (1 - k * 0.4), 1.3 * (0.5 + grow * 0.5))
    pillar.rotation.y += delta * 3
    ;(pillar.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k)
    for (const ember of embers) {
      ember.mesh.position.addScaledVector(ember.v, delta)
      ember.v.y -= delta * 2.2
      ;(ember.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k)
    }
  })
}

/** 방패막: 반구 결계 */
export function shieldDome(position: THREE.Vector3, color: number, radius = 1.9, life = 1.6): Fx {
  const r = res()
  const group = new THREE.Group()
  group.position.copy(position).setY(0)
  const fill = new THREE.Mesh(r.dome, glowMaterial(color, 0.25))
  const wire = new THREE.Mesh(r.domeWire, new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
  wire.scale.y = 1
  group.add(fill, wire)
  return makeFx(group, life, (k, delta) => {
    const grow = 1 - Math.pow(1 - Math.min(1, k * 4), 3)
    group.scale.setScalar(radius * grow * (1 + Math.sin(k * 18) * 0.015))
    wire.rotation.y += delta * 0.8
    const fade = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
    ;(fill.material as THREE.MeshBasicMaterial).opacity = 0.25 * fade + (k < 0.15 ? (0.15 - k) * 3 : 0)
    ;(wire.material as THREE.MeshBasicMaterial).opacity = 0.7 * fade
  })
}

/** 회복: 나선으로 솟는 빛 알갱이 */
export function healMotes(position: THREE.Vector3, color = 0x7be3a2, life = 1.3): Fx {
  const r = res()
  const group = new THREE.Group()
  group.position.copy(position).setY(0)
  const motes: Array<{ mesh: THREE.Mesh; a: number; rad: number; delay: number }> = []
  for (let i = 0; i < 18; i += 1) {
    const mesh = new THREE.Mesh(r.mote, glowMaterial(i % 4 ? color : 0xffffff, 0.9))
    mesh.scale.setScalar(0.06 + (i % 3) * 0.025)
    group.add(mesh)
    motes.push({ mesh, a: i * 1.3, rad: 0.6 + (i % 4) * 0.25, delay: (i % 6) * 0.08 })
  }
  return makeFx(group, life, (_k, _d, age) => {
    for (const mote of motes) {
      const p = clamp01((age - mote.delay) / (life - mote.delay))
      const a = mote.a + p * 5
      mote.mesh.position.set(Math.cos(a) * mote.rad * (1 - p * 0.4), p * 3.2, Math.sin(a) * mote.rad * (1 - p * 0.4))
      ;(mote.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.sin(p * Math.PI)
    }
  })
}

/** 돌진 잔상: 지나간 자리에 남는 빛줄기 */
export function dashTrail(from: THREE.Vector3, to: THREE.Vector3, color: number, life = 0.45): Fx {
  const r = res()
  const group = new THREE.Group()
  const length = from.distanceTo(to)
  const mid = new THREE.Vector3().lerpVectors(from, to, 0.5)
  group.position.copy(mid)
  group.lookAt(to)
  const lines: THREE.Mesh[] = []
  for (let i = 0; i < 5; i += 1) {
    const line = new THREE.Mesh(r.streak, glowMaterial(i % 2 ? 0xffffff : color, 0.8, r.pillarTex))
    line.scale.set(0.6 + (i % 3) * 0.3, 1, length / 1.6)
    line.position.set((i - 2) * 0.32, 0.35 + (i % 3) * 0.45, 0)
    group.add(line)
    lines.push(line)
  }
  return makeFx(group, life, k => {
    lines.forEach((line, i) => {
      ;(line.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k)
      line.position.z = -k * 0.6 * (1 + i * 0.1)
    })
  })
}

/** 지연 실행(효과 시간표용): 보이지 않는 빈 객체 */
export function delayed(delay: number, run: () => void): Fx {
  let done = false
  return { object: new THREE.Group(), age: 0, life: delay + 0.001, tick: effect => { if (!done && effect.age >= delay) { done = true; run() } }, dispose: () => { done = true } }
}
