// 전투 장면 그래픽: 하늘·원경 산·성채·지형·풀·깃발·연기·후방 대군, 무장·병사 모델.
// 외부 3D 파일 없이 도형과 직접 그린 질감으로 만든다. 전투 규칙(battle-core)과는 무관하다.
import * as THREE from 'three'
import { easeIn2, easeInOut, track } from './motion-math'
import { strikeInfluences } from './battle-rig'
import type { General } from './strategy'
import { loadModel } from './battle-models'

export type Team = 'player' | 'enemy'
export type SceneQuality = 'low' | 'high'

/** 휴대폰·저사양에서는 그림자 해상도·풀·대군 수를 줄인다. */
export function detectSceneQuality(): SceneQuality {
  // 직접 고르기: 주소에 ?quality=low|high, 또는 localStorage 'cheonharo.quality'
  try {
    const forced = new URLSearchParams(location.search).get('quality') ?? localStorage.getItem('cheonharo.quality')
    if (forced === 'low' || forced === 'high') return forced
  } catch { /* 저장소를 못 쓰면 자동 */ }
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4
  return coarse || cores <= 4 ? 'low' : 'high'
}

export const TEAM_COLORS: Record<Team, { armor: number; cloth: number; trim: number; banner: number; dark: number; leather: number }> = {
  player: { armor: 0x4a5052, cloth: 0x24584c, trim: 0xc9a457, banner: 0x1f6e5c, dark: 0x262422, leather: 0x4e3826 },
  enemy: { armor: 0x4c4644, cloth: 0x6e1f18, trim: 0xb8924a, banner: 0x9a2a1e, dark: 0x241c1a, leather: 0x4a3222 },
}

// ── 작은 도구 ────────────────────────────────────────────────
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
function noise2(x: number, z: number): number {
  return Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * 0.5 + Math.sin(z * 0.13 + x * 0.05) * 0.35 + Math.sin((x + z) * 0.31) * 0.15
}
/** 전장 양옆은 언덕, 앞뒤(카메라 쪽·성채 쪽)는 평평하게 */
function terrainLift(x: number, z: number): number {
  return Math.max(0, (Math.abs(x) - 20) / 9) + Math.max(0, (-z - 88) / 18)
}
export function terrainHeight(x: number, z: number): number {
  const lift = terrainLift(x, z)
  return noise2(x, z) * Math.min(2.2, lift * 1.4) + lift * lift * 0.6 - 0.02
}
function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  draw(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  return texture
}
let softSpriteCache: THREE.CanvasTexture | null = null
function softSprite(): THREE.CanvasTexture {
  if (softSpriteCache) return softSpriteCache
  softSpriteCache = canvasTexture(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s)
  })
  softSpriteCache.wrapS = softSpriteCache.wrapT = THREE.ClampToEdgeWrapping
  return softSpriteCache
}
let lamellarCache: THREE.CanvasTexture | null = null
/** 찰갑(작은 쇠비늘을 엮은 갑옷) 무늬 — 색은 재질 color로 물들인다. */
function lamellarTexture(): THREE.CanvasTexture {
  if (lamellarCache) return lamellarCache
  lamellarCache = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#bdbdbd'; ctx.fillRect(0, 0, s, s)
    const w = 8, h = 12
    for (let row = 0; row < s / h; row += 1) {
      for (let col = 0; col < s / w + 1; col += 1) {
        const x = col * w + (row % 2 ? w / 2 : 0), y = row * h
        const g = ctx.createLinearGradient(x, y, x, y + h)
        g.addColorStop(0, '#f2f2f2'); g.addColorStop(0.7, '#a8a8a8'); g.addColorStop(1, '#5a5a5a')
        ctx.fillStyle = g; ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1)
        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x + w / 2 - 0.5, y + 2, 1, 1); ctx.fillRect(x + w / 2 - 0.5, y + h - 4, 1, 1)
      }
    }
  }, 1)
  return lamellarCache
}

/** 여러 도형을 정점 색을 가진 한 덩어리로 합친다(병사 수백 명을 한 번에 그리기 위해). */
function mergeColored(parts: Array<{ geometry: THREE.BufferGeometry; color: number; matrix: THREE.Matrix4 }>): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], colors: number[] = []
  const color = new THREE.Color()
  const normalMatrix = new THREE.Matrix3()
  for (const part of parts) {
    const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone()
    g.applyMatrix4(part.matrix)
    normalMatrix.getNormalMatrix(part.matrix)
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal')
    color.setHex(part.color)
    for (let i = 0; i < pos.count; i += 1) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i))
      colors.push(color.r, color.g, color.b)
    }
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  merged.computeBoundingSphere()
  return merged
}
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))

// ── 병사 한 명의 모양(합친 도형) ─────────────────────────────
const soldierCache = new Map<string, THREE.BufferGeometry>()
export function soldierGeometry(kind: 'infantry' | 'archer' | 'cavalry' | 'pike', team: Team): THREE.BufferGeometry {
  const key = `${kind}-${team}`
  const cached = soldierCache.get(key)
  if (cached) return cached
  const c = TEAM_COLORS[team]
  const skin = 0xa87a5c, wood = 0x4a3020, metal = 0xb9b6ae, black = 0x1b1410
  const parts: Array<{ geometry: THREE.BufferGeometry; color: number; matrix: THREE.Matrix4 }> = []
  const add = (geometry: THREE.BufferGeometry, color: number, matrix: THREE.Matrix4) => parts.push({ geometry, color, matrix })
  const riderY = kind === 'cavalry' ? 0.62 : 0
  if (kind === 'cavalry') {
    const horse = team === 'player' ? 0x4a3526 : 0x2b211b
    add(new THREE.CapsuleGeometry(0.17, 0.52, 3, 8), horse, M(0, 0.6, 0, Math.PI / 2))
    add(new THREE.CapsuleGeometry(0.08, 0.3, 2, 6), horse, M(0, 0.82, -0.36, -0.75))
    add(new THREE.BoxGeometry(0.1, 0.12, 0.24), horse, M(0, 0.98, -0.52, -0.3))
    for (const [x, z] of [[-0.1, -0.24], [0.1, -0.24], [-0.1, 0.24], [0.1, 0.24]]) add(new THREE.CylinderGeometry(0.035, 0.03, 0.5, 5), horse, M(x, 0.27, z))
    add(new THREE.BoxGeometry(0.4, 0.06, 0.5), c.cloth, M(0, 0.78, 0.02))
    add(new THREE.ConeGeometry(0.05, 0.3, 4), black, M(0, 0.7, 0.42, 0.9))
  } else {
    add(new THREE.CylinderGeometry(0.05, 0.045, 0.42, 5), c.dark, M(-0.07, 0.21, 0))
    add(new THREE.CylinderGeometry(0.05, 0.045, 0.42, 5), c.dark, M(0.07, 0.21, 0))
    add(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 6), c.leather, M(-0.07, 0.05, -0.02))
    add(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 6), c.leather, M(0.07, 0.05, -0.02))
  }
  add(new THREE.CylinderGeometry(0.17, 0.21, 0.24, 8), c.cloth, M(0, riderY + 0.48, 0))
  add(new THREE.CylinderGeometry(0.15, 0.17, 0.32, 8), c.armor, M(0, riderY + 0.72, 0))
  add(new THREE.BoxGeometry(0.2, 0.3, 0.02), c.cloth, M(0, riderY + 0.62, -0.165))
  add(new THREE.BoxGeometry(0.42, 0.08, 0.2), c.armor, M(0, riderY + 0.87, 0))
  add(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 6), c.leather, M(0, riderY + 0.92, 0))
  add(new THREE.SphereGeometry(0.085, 8, 6), skin, M(0, riderY + 0.99, -0.02))
  add(new THREE.SphereGeometry(0.11, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), c.armor, M(0, riderY + 1.01, 0.01))
  add(new THREE.CylinderGeometry(0.125, 0.13, 0.03, 9), c.dark, M(0, riderY + 0.98, 0.01))
  add(new THREE.ConeGeometry(0.035, 0.12, 5), c.cloth, M(0, riderY + 1.14, 0.03, 0.4))
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 3), wood, M(0, riderY + 1.18, 0.15))
  add(new THREE.BoxGeometry(0.01, 0.3, 0.16), c.banner, M(0, riderY + 1.32, 0.23))
  if (kind === 'archer') {
    add(new THREE.TorusGeometry(0.28, 0.014, 4, 10, Math.PI * 1.2), wood, M(-0.22, riderY + 0.8, -0.05, 0, Math.PI / 2, -Math.PI * 0.6))
    add(new THREE.CylinderGeometry(0.045, 0.04, 0.34, 6), wood, M(0.1, riderY + 0.76, 0.14, 0.25))
  } else if (kind === 'pike' || kind === 'cavalry') {
    add(new THREE.CylinderGeometry(0.012, 0.012, 1.9, 4), wood, M(0.2, riderY + 0.95, -0.05, -0.12))
    add(new THREE.ConeGeometry(0.03, 0.16, 4), metal, M(0.2 + Math.sin(0.12) * 0, riderY + 1.92, -0.17, -0.12))
    if (kind === 'cavalry') add(new THREE.BoxGeometry(0.08, 0.1, 0.02), c.banner, M(0.2, riderY + 1.75, -0.12))
  } else {
    add(new THREE.CylinderGeometry(0.012, 0.012, 1.45, 4), wood, M(0.2, riderY + 0.82, -0.04, -0.1))
    add(new THREE.ConeGeometry(0.03, 0.14, 4), metal, M(0.2, riderY + 1.58, -0.11, -0.1))
    add(new THREE.BoxGeometry(0.05, 0.42, 0.3), c.leather, M(-0.2, riderY + 0.68, -0.02))
    add(new THREE.BoxGeometry(0.055, 0.12, 0.31), c.cloth, M(-0.2, riderY + 0.7, -0.02))
  }
  const geometry = mergeColored(parts)
  soldierCache.set(key, geometry)
  return geometry
}

// ── 부대(무장 주변 병사 대열): 인스턴스 한 번에 그린다 ─────────────
export interface Squad {
  group: THREE.Group
  /** strike: 부대 공격이 시작된 뒤 흐른 시간(초, 공격 중이 아니면 음수) */
  /** moving: 걸음 가중치(0~1, true/false도 받는다) */
  update: (t: number, moving: boolean | number, attack: number, hit: number, alive: number, strike?: number) => void
  /** 실사 모델(병종별 공격 자세를 구운 도형)로 교체: 병사가 커지므로 간격을 넓히고 수를 줄인다 */
  upgrade: (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], strikeDuration?: number, frames?: number, times?: number[], walkFrames?: number, walkPeriod?: number) => void
}
export function createSquad(role: General['role'], team: Team, quality: SceneQuality): Squad {
  const kind = role === '기병' ? 'cavalry' : role === '궁병' ? 'archer' : role === '보병' ? 'pike' : 'infantry'
  const r = rng(role.length * 97 + (team === 'enemy' ? 13 : 7))
  const layout = (cols: number, rows: number, gapX: number, gapZ: number, aisle: number, front: number) => {
    const list: Array<{ x: number; z: number; phase: number; jitter: number }> = []
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        let x = (col - (cols - 1) / 2) * gapX
        x += Math.sign(x || (col % 2 ? 1 : -1)) * aisle
        list.push({ x: x + (r() - 0.5) * gapX * 0.2, z: front + row * gapZ + (r() - 0.5) * gapZ * 0.15, phase: r() * Math.PI * 2, jitter: r() })
      }
    }
    return list
  }
  const cols = kind === 'cavalry' ? 5 : 7
  const rows = quality === 'low' ? 3 : kind === 'cavalry' ? 3 : 4
  let base = layout(cols, rows, kind === 'cavalry' ? 0.62 : 0.46, (kind === 'cavalry' ? 0.62 : 0.46) * 1.05, 0.55, 0.5)
  let count = base.length
  let yaw = 0
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.18 })
  let mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]> = new THREE.InstancedMesh(soldierGeometry(kind, team), material, count)
  mesh.castShadow = quality === 'high'
  mesh.frustumCulled = false
  const tintAll = (target: THREE.InstancedMesh, realistic: boolean) => {
    const tint = new THREE.Color()
    for (let i = 0; i < base.length; i += 1) {
      const v = (realistic ? 0.92 : 0.82) + base[i].jitter * (realistic ? 0.14 : 0.3)
      // 실사 모델은 양 진영이 같은 옷이라, 적은 붉은 기운으로 물들여 구분한다
      if (realistic && team === 'enemy') tint.setRGB(v * 1.08, v * 0.72, v * 0.66)
      else if (realistic) tint.setRGB(v * 0.84, v * 0.96, v * 1.02)
      else tint.setRGB(v, v * (0.97 + r() * 0.05), v * (0.94 + r() * 0.08))
      target.setColorAt(i, tint)
    }
    if (target.instanceColor) target.instanceColor.needsUpdate = true
  }
  tintAll(mesh, false)
  const group = new THREE.Group()
  group.add(mesh)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), e = new THREE.Euler()
  let bobScale = 1
  // 병종별 공격 자세(모프): 병사마다 조금씩 늦게 시작해 한 몸처럼 보이지 않게 한다
  let strikeDuration = 0
  let morphHolder: { morphTargetInfluences: number[] } | null = null
  let strikeTimes: number[] | null = null
  // 뼈대 모델을 구운 걷기 자세(공격 자세 뒤에 이어 붙어 있다)
  let walkFrames = 0
  let walkPeriod = 1
  let strikeBuf: number[] = []
  // 병력이 줄면 그만큼의 병사가 뒤로 쓰러지며 사라진다(쓰러지기 시작한 시각, 없으면 -1)
  let prevVisible = -1
  let fallAt: number[] = []
  const FALL_TIME = 0.9
  const update = (t: number, movingIn: boolean | number, attack: number, hit: number, alive: number, strike = -1) => {
    const g = Math.min(1, Math.max(0, Number(movingIn)))
    const visible = Math.max(0, Math.min(count, Math.ceil(count * alive)))
    if (fallAt.length !== count) { fallAt = new Array(count).fill(-1); prevVisible = visible }
    if (visible < prevVisible) for (let i = visible; i < prevVisible; i += 1) fallAt[i] = t
    if (visible > prevVisible) for (let i = prevVisible; i < visible; i += 1) fallAt[i] = -1
    prevVisible = visible
    let drawn = visible
    for (let i = visible; i < count; i += 1) if (fallAt[i] >= 0 && t - fallAt[i] < FALL_TIME) drawn = i + 1
    mesh.count = drawn
    if (morphHolder && strikeDuration > 0) {
      const influences = morphHolder.morphTargetInfluences
      const strikeCount = influences.length - walkFrames
      if (strikeBuf.length !== strikeCount) strikeBuf = new Array(strikeCount).fill(0)
      for (let i = 0; i < count; i += 1) {
        influences.fill(0)
        const p = strike < 0 ? -1 : (strike - base[i].jitter * 0.22) / strikeDuration
        strikeInfluences(p, strikeBuf, strikeTimes ?? undefined)
        let striking = 0
        for (let k = 0; k < strikeCount; k += 1) { influences[k] = strikeBuf[k]; striking += strikeBuf[k] }
        // 걷기: 병사마다 다른 걸음 위상으로 걷기 자세 두 장을 섞는다(공격 중에는 공격 자세가 우선)
        const wg = walkFrames ? g * Math.max(0, 1 - striking) : 0
        if (wg > 0.001) {
          const phase = ((t / walkPeriod) * (0.8 + 0.4 * g) + base[i].phase / (Math.PI * 2)) % 1
          const f = phase * walkFrames, i0 = Math.floor(f) % walkFrames, i1 = (i0 + 1) % walkFrames, a = f - Math.floor(f)
          influences[strikeCount + i0] += wg * (1 - a)
          influences[strikeCount + i1] += wg * a
        }
        mesh.setMorphAt(i, morphHolder as unknown as THREE.Mesh)
      }
      if (mesh.morphTexture) mesh.morphTexture.needsUpdate = true
    }
    // 병사 돌진: 살짝 물러섰다가(예비 동작) → 빨라지며 밀고 나가 → 천천히 돌아온다
    const ak = Math.min(1, Math.max(0, attack))
    const lunge = attack <= 0 ? 0 : track([{ t: 0, v: 0 }, { t: 0.2, v: -0.25 }, { t: 0.45, v: 1, e: easeIn2 }, { t: 1, v: 0, e: easeInOut }], ak)
    for (let i = 0; i < drawn; i += 1) {
      const b = base[i]
      // 맞으면 병사마다 조금씩 다르게 뒤로 밀리며 몸이 젖혀진다(기병은 말이 앞발을 드는 듯 크게)
      const stagger = hit * (0.6 + b.jitter * 0.8)
      // 걷기와 서 있기를 걸음 가중치로 섞는다(멈출 때 병사들이 뚝 서지 않게)
      const bob = (Math.abs(Math.sin(t * (kind === 'cavalry' ? 9 : 7) + b.phase)) * (walkFrames ? 0.015 : 0.07) * g + Math.sin(t * 1.4 + b.phase) * 0.012 * (1 - g)) * bobScale
      p.set(b.x + Math.sin(t * 0.7 + b.phase) * 0.02, bob, b.z - lunge * (kind === 'archer' ? 0.05 : 0.35) * (0.6 + b.jitter * 0.4) * bobScale + stagger * 0.2)
      e.set(-0.06 * g + stagger * (kind === 'cavalry' ? 0.3 : 0.22), yaw + Math.sin(t * 0.5 + b.phase) * 0.06 + stagger * (b.jitter - 0.5) * 0.4, Math.sin(t * 7 + b.phase) * 0.04 * g + Math.sin(t * 1.4 + b.phase) * 0.012 * (1 - g))
      if (i >= visible) {
        // 쓰러지는 병사: 뒤로 넘어가며 땅으로 가라앉는다
        const f = Math.min(1, (t - fallAt[i]) / FALL_TIME)
        const ease = f * f * (3 - 2 * f)
        e.x = ease * (kind === 'cavalry' ? 0.9 : 1.45)
        e.z += (b.jitter - 0.5) * ease * 0.8
        p.y = -ease * 0.35 * bobScale
        p.z += ease * 0.3
      }
      q.setFromEuler(e)
      m.compose(p, q, s)
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  }
  const upgrade = (geometry: THREE.BufferGeometry, realMaterial: THREE.Material | THREE.Material[], duration = 0, frames = 0, times?: number[], walk = 0, period = 1) => {
    strikeTimes = times ?? null
    walkFrames = walk
    walkPeriod = period
    const cav = kind === 'cavalry'
    // 무장 뒤에 대열을 지어 선다(앞줄은 무장 바로 뒤, 가운데 열도 무장 뒤를 받친다)
    const [c2, r2] = quality === 'low' ? (cav ? [3, 1] : [4, 2]) : (cav ? [3, 2] : [5, 3])
    base = cav ? layout(c2, r2, 1.3, 2.6, 0.25, 2.3) : layout(c2, r2, 0.8, 0.95, 0.2, 1.45)
    count = base.length
    yaw = Math.PI // 실사 모델은 +Z를 보도록 맞춰 두었다 → 부대 앞(-Z)으로 돌린다
    bobScale = 1.6
    const next = new THREE.InstancedMesh(geometry, realMaterial, count)
    strikeDuration = duration
    morphHolder = frames > 1 && geometry.morphAttributes.position?.length ? { morphTargetInfluences: new Array(frames - 1 + walk).fill(0) } : null
    next.castShadow = quality === 'high'
    next.frustumCulled = false
    tintAll(next, true)
    group.remove(mesh)
    mesh.dispose()
    mesh = next
    group.add(mesh)
    update(0, false, 0, 0, 1)
  }
  update(0, false, 0, 0, 1)
  return { group, update, upgrade }
}

// ── 무장 모델 ────────────────────────────────────────────────
interface Signature { weapon: 'glaive' | 'spear' | 'halberd' | 'snake' | 'twin' | 'sword' | 'fan' | 'bow' | 'staff' | 'mace'; beard?: 'long' | 'wild' | 'short'; crest?: 'plume' | 'feathers' | 'crown' | 'hat' | 'band'; robe?: boolean; cape: number; armor?: number }
const SIGNATURES: Record<string, Partial<Signature>> = {
  'guan-yu': { weapon: 'glaive', beard: 'long', crest: 'band', cape: 0x1f6b3a, armor: 0x2f6b48 },
  'zhang-fei': { weapon: 'snake', beard: 'wild', crest: 'band', cape: 0x2a2a2a, armor: 0x3a3a3a },
  'liu-bei': { weapon: 'twin', beard: 'short', crest: 'crown', cape: 0xb88a2a, armor: 0x7a6a3a },
  'zhao-yun': { weapon: 'spear', crest: 'plume', cape: 0xcfc8b8, armor: 0x9aa4ac },
  'lu-bu': { weapon: 'halberd', crest: 'feathers', cape: 0x8a1d1d, armor: 0x4a2a2a },
  'zhuge-liang': { weapon: 'fan', robe: true, crest: 'hat', cape: 0xb8bcae },
  'pang-tong': { weapon: 'fan', robe: true, crest: 'hat', cape: 0x6a6a5a },
  'sima-yi': { weapon: 'fan', robe: true, crest: 'hat', cape: 0x2b2440 },
  'simayi': { weapon: 'fan', robe: true, crest: 'hat', cape: 0x2b2440 },
  'zhou-yu': { weapon: 'sword', crest: 'crown', cape: 0x9b2a2a },
  'cao-cao': { weapon: 'sword', beard: 'short', crest: 'crown', cape: 0x2a2f55, armor: 0x3a3f5a },
  'sun-quan': { weapon: 'sword', crest: 'crown', cape: 0xa82a2a },
  'sun-ce': { weapon: 'twin', crest: 'band', cape: 0xb03a2a },
  'huang-zhong': { weapon: 'bow', beard: 'long', cape: 0x8a6a2a },
  'ma-chao': { weapon: 'spear', crest: 'plume', cape: 0xd8d8e8, armor: 0xb8c0d0 },
  'dian-wei': { weapon: 'mace', beard: 'wild', cape: 0x3a2a1a },
  'xiahou-dun': { weapon: 'sword', beard: 'short', crest: 'band', cape: 0x2a3050 },
  'zhang-jiao': { weapon: 'staff', robe: true, beard: 'long', crest: 'band', cape: 0xc9a020 },
  'diao-chan': { weapon: 'fan', robe: true, crest: 'crown', cape: 0xc23a5a },
}
function signatureFor(general: General): Signature {
  const preset = SIGNATURES[general.id] ?? {}
  const role = general.role
  const weapon = preset.weapon ?? (role === '책사' ? 'fan' : role === '궁병' ? 'bow' : role === '기병' ? 'spear' : 'sword')
  return { weapon, beard: preset.beard, crest: preset.crest ?? (role === '책사' ? 'hat' : 'plume'), robe: preset.robe ?? role === '책사', cape: preset.cape ?? new THREE.Color(general.accent).multiplyScalar(0.7).getHex(), armor: preset.armor }
}

export interface GeneralRig {
  root: THREE.Group
  body: THREE.Group
  weaponArm: THREE.Group
  shieldArm: THREE.Group
  cape: THREE.Mesh
  capeBase: Float32Array
  horseLegs: THREE.Object3D[]
  horseHead: THREE.Object3D | null
  mounted: boolean
  materials: THREE.MeshStandardMaterial[]
}

function std(color: number, roughness = 0.6, metalness = 0.2, map?: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: 0x000000 })
  if (map) material.map = map
  return material
}

export function createGeneralModel(general: General, team: Team): GeneralRig {
  const sig = signatureFor(general)
  const tc = TEAM_COLORS[team]
  const accent = new THREE.Color(general.accent)
  const armorColor = new THREE.Color(sig.armor ?? tc.armor).lerp(new THREE.Color(0x585c60), sig.armor ? 0.35 : 0).lerp(accent, 0.12).getHex()
  const lamellar = lamellarTexture()
  const mats = {
    armor: std(armorColor, 0.45, 0.55, lamellar),
    plate: std(new THREE.Color(armorColor).multiplyScalar(0.75).getHex(), 0.38, 0.65),
    gold: std(0xd9b062, 0.32, 0.85),
    cloth: std(new THREE.Color(sig.cape).lerp(new THREE.Color(TEAM_COLORS[team].cloth), 0.15).getHex(), 0.85, 0.02),
    under: std(new THREE.Color(sig.cape).multiplyScalar(0.55).getHex(), 0.9, 0.02),
    robe: std(sig.cape, 0.8, 0.02),
    skin: std(0xb8866a, 0.72, 0),
    hair: std(0x161210, 0.7, 0.05),
    leather: std(0x3a2416, 0.8, 0.05),
    steel: std(0xd8dde2, 0.22, 0.95),
    wood: std(0x4a2e18, 0.7, 0.05),
    horse: std(general.id === 'lu-bu' ? 0x5a1a12 : general.id === 'zhao-yun' || general.id === 'ma-chao' ? 0xd8d2c4 : 0x3a2a1e, 0.62, 0.05),
    jade: new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3 }),
  }
  const root = new THREE.Group()
  root.name = `model-${general.id}`
  const mounted = general.role === '기병'
  const horseLegs: THREE.Object3D[] = []
  let horseHead: THREE.Object3D | null = null
  const body = new THREE.Group()
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const node = new THREE.Mesh(geometry, material)
    node.position.set(x, y, z); node.rotation.set(rx, ry, rz)
    node.castShadow = true
    return node
  }

  // 말
  if (mounted) {
    const horse = new THREE.Group()
    horse.add(mesh(new THREE.CapsuleGeometry(0.36, 1.05, 6, 14), mats.horse, 0, 1.12, 0, Math.PI / 2))
    const neck = new THREE.Group(); neck.position.set(0, 1.35, -0.62)
    neck.add(mesh(new THREE.CapsuleGeometry(0.17, 0.55, 4, 10), mats.horse, 0, 0.25, -0.12, -0.7))
    const head = new THREE.Group(); head.position.set(0, 0.6, -0.42)
    head.add(mesh(new THREE.CapsuleGeometry(0.13, 0.36, 4, 10), mats.horse, 0, 0, -0.12, -1.25))
    head.add(mesh(new THREE.ConeGeometry(0.05, 0.14, 4), mats.horse, -0.07, 0.17, 0.02), mesh(new THREE.ConeGeometry(0.05, 0.14, 4), mats.horse, 0.07, 0.17, 0.02))
    head.add(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.1), mats.gold, 0, 0.06, -0.12))
    neck.add(head)
    neck.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.42), mats.hair, 0, 0.36, 0.0, -0.7))
    horseHead = neck
    horse.add(neck)
    for (const [x, z] of [[-0.2, -0.5], [0.2, -0.5], [-0.2, 0.55], [0.2, 0.55]]) {
      const leg = new THREE.Group(); leg.position.set(x, 0.92, z)
      leg.add(mesh(new THREE.CapsuleGeometry(0.075, 0.42, 3, 8), mats.horse, 0, -0.3, 0))
      leg.add(mesh(new THREE.CapsuleGeometry(0.05, 0.36, 3, 6), mats.horse, 0, -0.72, 0))
      leg.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 8), mats.hair, 0, -0.92, 0))
      horseLegs.push(leg); horse.add(leg)
    }
    const tail = mesh(new THREE.ConeGeometry(0.1, 0.7, 6), mats.hair, 0, 1.0, 0.95, 2.6)
    horse.add(tail)
    horse.add(mesh(new THREE.BoxGeometry(0.82, 0.08, 0.95), mats.cloth, 0, 1.46, 0.05))
    horse.add(mesh(new THREE.BoxGeometry(0.86, 0.32, 0.04), mats.cloth, 0, 1.32, 0.52), mesh(new THREE.BoxGeometry(0.06, 0.3, 0.9), mats.gold, -0.42, 1.34, 0.05), mesh(new THREE.BoxGeometry(0.06, 0.3, 0.9), mats.gold, 0.42, 1.34, 0.05))
    horse.add(mesh(new THREE.BoxGeometry(0.34, 0.14, 0.42), mats.leather, 0, 1.54, 0.05))
    root.add(horse)
  }

  // 사람
  body.position.y = mounted ? 1.12 : 0
  if (!mounted) {
    body.add(mesh(new THREE.CapsuleGeometry(0.1, 0.5, 3, 8), mats.under, -0.14, 0.42, 0), mesh(new THREE.CapsuleGeometry(0.1, 0.5, 3, 8), mats.under, 0.14, 0.42, 0))
    body.add(mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.26, 8), mats.leather, -0.14, 0.12, -0.02), mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.26, 8), mats.leather, 0.14, 0.12, -0.02))
  } else {
    body.add(mesh(new THREE.CapsuleGeometry(0.1, 0.42, 3, 8), mats.under, -0.3, 0.42, -0.05, 0.6, 0, 0.35), mesh(new THREE.CapsuleGeometry(0.1, 0.42, 3, 8), mats.under, 0.3, 0.42, -0.05, 0.6, 0, -0.35))
  }
  const hipY = mounted ? 0.62 : 0.78
  if (sig.robe) {
    body.add(mesh(new THREE.CylinderGeometry(0.26, 0.48, 0.9, 12, 1, true), mats.robe, 0, hipY - 0.25, 0))
    body.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 12), mats.robe, 0, hipY + 0.42, 0))
    body.add(mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 16), mats.gold, 0, hipY + 0.16, 0, Math.PI / 2))
    body.add(mesh(new THREE.BoxGeometry(0.12, 0.55, 0.02), mats.under, 0, hipY + 0.42, -0.27))
  } else {
    // 갑옷 치마(전후좌우 판)
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2
      body.add(mesh(new THREE.BoxGeometry(0.2, 0.42, 0.04), mats.armor, Math.sin(a) * 0.25, hipY - 0.12, Math.cos(a) * 0.25, 0.18 * Math.cos(a), a, -0.18 * Math.sin(a)))
    }
    body.add(mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.62, 12), mats.armor, 0, hipY + 0.4, 0))
    body.add(mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.plate, 0, hipY + 0.52, -0.16, -Math.PI / 2 + 0.2))
    body.add(mesh(new THREE.TorusGeometry(0.255, 0.04, 6, 18), mats.gold, 0, hipY + 0.12, 0, Math.PI / 2))
    body.add(mesh(new THREE.CircleGeometry(0.09, 16), mats.gold, 0, hipY + 0.14, -0.29))
    // 견갑
    for (const side of [-1, 1]) {
      body.add(mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.plate, side * 0.33, hipY + 0.68, 0, 0, 0, -side * 0.5))
      body.add(mesh(new THREE.TorusGeometry(0.15, 0.02, 4, 14, Math.PI), mats.gold, side * 0.36, hipY + 0.64, 0, 0, Math.PI / 2, -side * 0.5))
    }
  }
  // 망토
  const capeGeo = new THREE.PlaneGeometry(0.72, mounted ? 1.1 : 1.25, 6, 8)
  capeGeo.translate(0, -(mounted ? 0.55 : 0.62), 0)
  const cape = mesh(capeGeo, new THREE.MeshStandardMaterial({ color: sig.cape, roughness: 0.85, side: THREE.DoubleSide }), 0, hipY + 0.72, 0.25, 0.12)
  body.add(cape)
  const capeBase = Float32Array.from(capeGeo.getAttribute('position').array as Float32Array)
  // 머리
  const headY = hipY + 0.95
  body.add(mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 8), mats.skin, 0, headY - 0.17, 0))
  body.add(mesh(new THREE.SphereGeometry(0.15, 16, 12), mats.skin, 0, headY, 0))
  body.add(mesh(new THREE.SphereGeometry(0.152, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), mats.hair, 0, headY + 0.01, 0.01))
  if (sig.beard === 'long') body.add(mesh(new THREE.ConeGeometry(0.1, 0.55, 8), mats.hair, 0, headY - 0.34, -0.1, Math.PI + 0.12))
  else if (sig.beard === 'wild') body.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), mats.hair, 0, headY - 0.1, -0.06))
  else if (sig.beard === 'short') body.add(mesh(new THREE.ConeGeometry(0.06, 0.16, 6), mats.hair, 0, headY - 0.18, -0.11, Math.PI + 0.25))
  // 투구·관
  if (sig.crest === 'hat') {
    body.add(mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.2, 10), mats.hair, 0, headY + 0.17, 0))
    body.add(mesh(new THREE.BoxGeometry(0.42, 0.02, 0.2), mats.hair, 0, headY + 0.27, 0))
  } else if (sig.crest === 'crown') {
    body.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 8), mats.gold, 0, headY + 0.16, 0))
    body.add(mesh(new THREE.BoxGeometry(0.4, 0.03, 0.18), mats.gold, 0, headY + 0.24, 0))
    body.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), mats.jade, 0, headY + 0.17, -0.12))
  } else if (sig.crest === 'band') {
    body.add(mesh(new THREE.TorusGeometry(0.152, 0.03, 6, 18), mats.cloth, 0, headY + 0.05, 0, Math.PI / 2 - 0.15))
    body.add(mesh(new THREE.BoxGeometry(0.05, 0.3, 0.02), mats.cloth, 0.05, headY - 0.05, 0.16, 0.3, 0, 0.2))
  } else {
    body.add(mesh(new THREE.SphereGeometry(0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.plate, 0, headY + 0.03, 0))
    body.add(mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.06, 14, 1, true), mats.gold, 0, headY - 0.02, 0))
    body.add(mesh(new THREE.ConeGeometry(0.03, 0.14, 6), mats.gold, 0, headY + 0.24, 0))
    if (sig.crest === 'feathers') {
      for (const side of [-1, 1]) body.add(mesh(new THREE.ConeGeometry(0.025, 0.9, 5), mats.cloth, side * 0.12, headY + 0.55, 0.1, 0.35, 0, -side * 0.5))
    } else {
      body.add(mesh(new THREE.ConeGeometry(0.07, 0.5, 8), mats.cloth, 0, headY + 0.3, 0.16, 1.9))
    }
  }
  // 팔
  const shoulderY = hipY + 0.62
  const weaponArm = new THREE.Group(); weaponArm.position.set(0.36, shoulderY, 0)
  const shieldArm = new THREE.Group(); shieldArm.position.set(-0.36, shoulderY, 0)
  for (const arm of [weaponArm, shieldArm]) {
    const sleeve = sig.robe ? mats.robe : mats.armor
    arm.add(mesh(new THREE.CapsuleGeometry(0.075, 0.3, 3, 8), sleeve, 0, -0.18, 0))
    arm.add(mesh(new THREE.CapsuleGeometry(0.065, 0.26, 3, 8), sig.robe ? mats.robe : mats.leather, 0, -0.44, -0.08, 0.5))
    arm.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), mats.skin, 0, -0.58, -0.18))
  }
  weaponArm.rotation.set(-0.35, 0, -0.18)
  shieldArm.rotation.set(-0.25, 0, 0.18)
  // 무기
  const hand = new THREE.Group(); hand.position.set(0, -0.58, -0.18)
  weaponArm.add(hand)
  const pole = (length: number) => mesh(new THREE.CylinderGeometry(0.025, 0.028, length, 8), mats.wood, 0, 0, 0)
  switch (sig.weapon) {
    case 'glaive': { // 청룡언월도
      const g = new THREE.Group(); g.add(pole(2.3))
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.quadraticCurveTo(0.34, 0.25, 0.2, 0.75); shape.quadraticCurveTo(0.06, 0.4, -0.06, 0.05); shape.lineTo(0, 0)
      const blade = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }), mats.steel, 0.02, 1.12, -0.01)
      g.add(blade, mesh(new THREE.SphereGeometry(0.06, 8, 6), mats.jade, 0, 1.12, 0), mesh(new THREE.ConeGeometry(0.03, 0.18, 6), mats.gold, 0, -1.2, 0, Math.PI))
      g.rotation.x = -0.25; g.position.y = 0.3; hand.add(g); break
    }
    case 'halberd': { // 방천화극
      const g = new THREE.Group(); g.add(pole(2.4))
      g.add(mesh(new THREE.ConeGeometry(0.05, 0.5, 4), mats.steel, 0, 1.45, 0))
      for (const side of [-1, 1]) {
        const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.absarc(0, 0, 0.26, -Math.PI / 2, Math.PI / 2, false); shape.absarc(0, 0, 0.14, Math.PI / 2, -Math.PI / 2, true)
        g.add(mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }), mats.steel, side * 0.04, 1.1, -0.01, 0, side < 0 ? Math.PI : 0, 0))
      }
      g.add(mesh(new THREE.BoxGeometry(0.04, 0.24, 0.02), mats.cloth, 0.08, 0.95, 0))
      g.rotation.x = -0.2; g.position.y = 0.35; hand.add(g); break
    }
    case 'snake': { // 장팔사모
      const g = new THREE.Group(); g.add(pole(2.5))
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, 0.12, 0), new THREE.Vector3(-0.05, 0.26, 0), new THREE.Vector3(0.05, 0.4, 0), new THREE.Vector3(0, 0.55, 0)])
      g.add(mesh(new THREE.TubeGeometry(curve, 20, 0.025, 6, false), mats.steel, 0, 1.25, 0))
      g.add(mesh(new THREE.ConeGeometry(0.035, 0.12, 6), mats.steel, 0, 1.86, 0))
      g.rotation.x = -0.15; g.position.y = 0.3; hand.add(g); break
    }
    case 'spear': {
      const g = new THREE.Group(); g.add(pole(2.4))
      g.add(mesh(new THREE.ConeGeometry(0.045, 0.42, 6), mats.steel, 0, 1.4, 0), mesh(new THREE.ConeGeometry(0.08, 0.18, 8), mats.cloth, 0, 1.12, 0, Math.PI))
      g.rotation.x = -0.25; g.position.y = 0.3; hand.add(g); break
    }
    case 'twin': case 'sword': {
      const sword = (x: number, rz: number) => {
        const g = new THREE.Group()
        g.add(mesh(new THREE.BoxGeometry(0.06, 0.95, 0.015), mats.steel, 0, 0.55, 0), mesh(new THREE.ConeGeometry(0.04, 0.1, 4), mats.steel, 0, 1.07, 0, 0, Math.PI / 4), mesh(new THREE.BoxGeometry(0.22, 0.04, 0.05), mats.gold, 0, 0.07, 0), mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 6), mats.leather, 0, -0.04, 0))
        g.position.x = x; g.rotation.set(-1.0, 0, rz); return g
      }
      hand.add(sword(0, 0))
      if (sig.weapon === 'twin') { const off = new THREE.Group(); off.position.set(0, -0.58, -0.18); off.add(sword(0, 0)); shieldArm.add(off) }
      break
    }
    case 'mace': {
      for (const arm of [hand]) { arm.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), mats.wood, 0, 0.2, 0, -0.6), mesh(new THREE.DodecahedronGeometry(0.13, 0), mats.steel, 0, 0.5, -0.2)) }
      const off = new THREE.Group(); off.position.set(0, -0.58, -0.18); off.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), mats.wood, 0, 0.2, 0, -0.6), mesh(new THREE.DodecahedronGeometry(0.13, 0), mats.steel, 0, 0.5, -0.2)); shieldArm.add(off)
      break
    }
    case 'bow': {
      const off = new THREE.Group(); off.position.set(0, -0.58, -0.18)
      off.add(mesh(new THREE.TorusGeometry(0.55, 0.022, 6, 24, Math.PI * 1.25), mats.wood, 0, 0, -0.05, 0, Math.PI / 2, -Math.PI * 0.62))
      shieldArm.add(off)
      body.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.5, 8), mats.leather, 0.12, hipY + 0.55, 0.25, 0.35))
      break
    }
    case 'staff': {
      const g = new THREE.Group(); g.add(pole(1.9), mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 16), mats.gold, 0, 1.0, 0), mesh(new THREE.IcosahedronGeometry(0.08, 1), mats.jade, 0, 1.0, 0))
      g.rotation.x = -0.2; g.position.y = 0.2; hand.add(g); break
    }
    case 'fan': default: {
      const fan = new THREE.Group()
      for (let i = 0; i < 9; i += 1) fan.add(mesh(new THREE.ConeGeometry(0.035, 0.36, 4), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9 }), Math.sin((i - 4) * 0.13) * 0.18, 0.18 + Math.cos((i - 4) * 0.13) * 0.03, 0, 0, 0, -(i - 4) * 0.13))
      fan.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), mats.gold, 0, -0.04, 0))
      fan.rotation.set(-0.9, 0.3, 0); hand.add(fan)
      shieldArm.rotation.set(-0.6, 0, -0.1)
    }
  }
  // 등 뒤 작은 장수기(진영 색)
  const flag = new THREE.Group(); flag.position.set(0.12, hipY + 0.55, 0.3)
  flag.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 5), mats.wood, 0, 0.65, 0))
  flag.add(mesh(new THREE.PlaneGeometry(0.28, 0.5), new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team].banner, side: THREE.DoubleSide, roughness: 0.85 }), 0.15, 1.05, 0, 0, Math.PI / 2))
  if (!sig.robe) body.add(flag)
  body.add(weaponArm, shieldArm)
  root.add(body)
  root.scale.setScalar(mounted ? 1.3 : 1.45)
  const materials: THREE.MeshStandardMaterial[] = []
  root.traverse(node => { const m = (node as THREE.Mesh).material; if (m && !Array.isArray(m) && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial && !materials.includes(m as THREE.MeshStandardMaterial)) materials.push(m as THREE.MeshStandardMaterial) })
  return { root, body, weaponArm, shieldArm, cape, capeBase, horseLegs, horseHead, mounted, materials }
}

/** 무장 움직임: 숨쉬기·말 걸음·무기 휘두르기·망토 펄럭임·피격 번쩍임 */
export function animateGeneral(rig: GeneralRig, t: number, moving: boolean, attack: number, skill: number, hit: number): void {
  const breathe = Math.sin(t * 2.1) * 0.015
  rig.body.position.y = (rig.mounted ? 1.12 : 0) + breathe + (rig.mounted && moving ? Math.abs(Math.sin(t * 9)) * 0.06 : 0)
  const swing = Math.sin(Math.min(1, attack) * Math.PI)
  const spin = skill > 0 ? Math.sin((1 - skill) * Math.PI) : 0
  rig.weaponArm.rotation.x = -0.35 - swing * 1.5 - spin * 0.9 + Math.sin(t * 1.3) * 0.04
  rig.weaponArm.rotation.z = -0.18 - swing * 0.4
  rig.body.rotation.y = spin * 0.9 * Math.sin((1 - skill) * Math.PI * 2) + swing * 0.25
  rig.body.rotation.x = swing * 0.12 - hit * 0.2
  if (rig.mounted) {
    rig.horseLegs.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(t * 9 + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0)) * 0.55 : Math.sin(t * 0.8 + i) * 0.03 })
    if (rig.horseHead) rig.horseHead.rotation.x = moving ? Math.sin(t * 9) * 0.12 : Math.sin(t * 0.9) * 0.05
  }
  // 망토: 위쪽은 고정, 아래로 갈수록 크게 흔들린다
  const pos = rig.cape.geometry.getAttribute('position') as THREE.BufferAttribute
  const base = rig.capeBase
  const wind = moving ? 0.22 : 0.08
  for (let i = 0; i < pos.count; i += 1) {
    const x = base[i * 3], y = base[i * 3 + 1]
    const depth = Math.min(1, -y / 1.2)
    pos.setZ(i, base[i * 3 + 2] + Math.sin(t * 3.2 + x * 4 + y * 3) * wind * depth + depth * depth * (moving ? 0.35 : 0.08))
  }
  pos.needsUpdate = true
  rig.cape.geometry.computeVertexNormals()
  const flash = Math.max(hit * hit, skill > 0 ? Math.sin(skill * Math.PI) * 0.5 : 0)
  for (const material of rig.materials) {
    if (material === undefined) continue
    material.emissive.setRGB(flash * 0.16, flash * 0.08, flash * 0.03)
  }
}

// ── 전장 환경 ────────────────────────────────────────────────
export interface Environment {
  update: (t: number, delta: number) => void
  sun: THREE.DirectionalLight
}

export function buildEnvironment(scene: THREE.Scene, quality: SceneQuality): Environment {
  const updaters: Array<(t: number, delta: number) => void> = []
  const horizon = new THREE.Color(0xeaa874)
  scene.background = new THREE.Color(0x3a2a33)
  scene.fog = new THREE.Fog(0xa48876, 34, 170)

  // 하늘: 지평선은 노을, 위로 갈수록 짙은 남보라, 해 주변은 밝게
  const sunDir = new THREE.Vector3(-0.35, 0.16, -1).normalize()
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: sunDir }, top: { value: new THREE.Color(0x26344f) }, mid: { value: new THREE.Color(0x9a6a68) }, low: { value: horizon }, sun: { value: new THREE.Color(0xffe6b8) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 sunDir, top, mid, low, sun; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = mix(low, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.16, 0.6, h));
      c = mix(c, low * 0.55, smoothstep(0.0, -0.2, h)); float s = max(dot(vDir, sunDir), 0.0);
      c += sun * (pow(s, 600.0) * 2.5 + pow(s, 24.0) * 0.45 + pow(s, 4.0) * 0.12); gl_FragColor = vec4(c, 1.0); }`,
  }))
  sky.renderOrder = -20
  scene.add(sky)

  // 빛: 낮게 깔린 노을 햇빛 + 하늘빛 + 뒤에서 비추는 테두리 빛
  scene.add(new THREE.HemisphereLight(0xc8d4f0, 0x4a3a2a, 1.5))
  const sun = new THREE.DirectionalLight(0xffd6a6, 3.4)
  sun.position.set(-18, 16, -22)
  sun.castShadow = true
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024)
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 })
  sun.shadow.bias = -0.0008
  sun.shadow.normalBias = 0.03
  scene.add(sun, sun.target)
  const fill = new THREE.DirectionalLight(0x8aa8ff, 0.55)
  fill.position.set(14, 10, 18)
  scene.add(fill)

  // 원경 산맥 3겹(멀수록 하늘색에 묻힌다)
  const ridge = (radius: number, height: number, color: number, seed: number, from = -Math.PI * 0.98, to = -Math.PI * 0.02) => {
    const segments = 240
    const positions: number[] = []
    const r = rng(seed)
    const offsets = Array.from({ length: 6 }, () => r() * 10)
    for (let i = 0; i <= segments; i += 1) {
      const a = from + (to - from) * (i / segments)
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius
      const n = Math.sin(a * 5 + offsets[0]) * 0.38 + Math.sin(a * 11 + offsets[1]) * 0.2 + Math.abs(Math.sin(a * 19 + offsets[2])) * 0.16 + Math.sin(a * 37 + offsets[3]) * 0.04
      const y = height * (0.55 + n)
      positions.push(x, -4, z, x, y, z)
    }
    const index: number[] = []
    for (let i = 0; i < segments; i += 1) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(index)
    const haze = new THREE.Color(0xc89a86), baseColor = new THREE.Color(color), vc: number[] = []
    for (let i = 0; i < positions.length / 3; i += 1) { const top = i % 2 === 1; const c = top ? baseColor.clone().lerp(haze, 0.35) : baseColor.clone().multiplyScalar(0.85); vc.push(c.r, c.g, c.b) }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3))
    const ridgeMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }))
    ridgeMesh.renderOrder = -15
    scene.add(ridgeMesh)
  }
  ridge(140, 26, 0x8a7484, 3)
  ridge(110, 18, 0x625464, 7)
  ridge(82, 11, 0x433a3e, 11)

  // 적 뒤의 성채: 성벽·성가퀴·문루(2층 기와지붕)·등불
  const fort = new THREE.Group()
  const stone = new THREE.MeshStandardMaterial({ color: 0x5a4a40, roughness: 0.95 })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2224, roughness: 0.7, metalness: 0.1 })
  const timber = new THREE.MeshStandardMaterial({ color: 0x6a1e18, roughness: 0.8 })
  const wall = new THREE.Mesh(new THREE.BoxGeometry(90, 6, 3), stone)
  wall.position.set(0, 3, 0); wall.castShadow = false; wall.receiveShadow = true
  fort.add(wall)
  const merlon = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1, 0.6), stone, 60)
  const tmp = new THREE.Matrix4()
  for (let i = 0; i < 60; i += 1) { tmp.makeTranslation(-44 + i * 1.5, 6.5, -1.2); merlon.setMatrixAt(i, tmp) }
  fort.add(merlon)
  const roof = (w: number, d: number, y: number) => {
    const g = new THREE.Group()
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1, 1, 4, 1), roofMat)
    r.rotation.y = Math.PI / 4; r.scale.set(w * 0.78, 1.6, d * 0.78); r.position.y = y + 0.8
    const eave = new THREE.Mesh(new THREE.BoxGeometry(w * 1.12, 0.18, d * 1.12), roofMat)
    eave.position.y = y
    g.add(r, eave)
    return g
  }
  for (const x of [0, -26, 26]) {
    const tower = new THREE.Group()
    const big = x === 0
    const base = new THREE.Mesh(new THREE.BoxGeometry(big ? 12 : 7, big ? 8 : 7, 5), stone)
    base.position.y = big ? 4 : 3.5
    tower.add(base)
    const hall = new THREE.Mesh(new THREE.BoxGeometry(big ? 9 : 5, 2.6, 3.6), timber)
    hall.position.y = (big ? 8 : 7) + 1.3
    tower.add(hall, roof(big ? 11 : 6.4, 5, (big ? 8 : 7) + 2.7))
    if (big) {
      const hall2 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.8, 2.8), timber)
      hall2.position.y = 13.4
      tower.add(hall2, roof(8, 3.8, 14.5))
      const gate = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x1a120e, roughness: 1 }))
      gate.position.set(0, 2.2, 2.55)
      tower.add(gate)
    }
    for (const lx of big ? [-3, 3] : [0]) {
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa64a }))
      lantern.position.set(lx, (big ? 8 : 7) + 0.4, 2.2)
      tower.add(lantern)
    }
    tower.position.x = x
    fort.add(tower)
  }
  fort.position.set(0, 0, -112); fort.scale.setScalar(1.6)
  scene.add(fort)
  const fortGlow = new THREE.PointLight(0xff9a4a, 30, 30, 2)
  fortGlow.position.set(0, 14, -104)
  scene.add(fortGlow)

  // 지형: 가운데 전장은 평평, 바깥은 완만한 언덕. 흙길·풀밭을 정점 색으로 칠한다.
  const size = 200, seg = quality === 'high' ? 140 : 90
  const groundGeo = new THREE.PlaneGeometry(size, size, seg, seg)
  groundGeo.rotateX(-Math.PI / 2)
  const gp = groundGeo.getAttribute('position')
  const colors: number[] = []
  const grass = new THREE.Color(0x4f5a34), dry = new THREE.Color(0x857a4c), dirt = new THREE.Color(0x6a5038), dark = new THREE.Color(0x2e3420)
  const col = new THREE.Color()
  for (let i = 0; i < gp.count; i += 1) {
    const x = gp.getX(i), z = gp.getZ(i)
    const dist = Math.max(Math.abs(x) / 16, Math.abs(z + 2) / 15)
    const lift = terrainLift(x, z)
    const h = noise2(x, z) * Math.min(2.2, lift * 1.4) + lift * lift * 0.6
    gp.setY(i, h - 0.02)
    const n = noise2(x * 2.3, z * 2.1) * 0.5 + 0.5
    col.copy(grass).lerp(dry, n * 0.7).lerp(dark, Math.max(0, noise2(x * 4, z * 4)) * 0.35)
    const road = Math.max(0, 1 - Math.abs(x - Math.sin(z * 0.12) * 1.6) / 3.6)
    col.lerp(dirt, Math.min(1, road * 1.4))
    const battle = Math.max(0, 1 - dist)
    col.lerp(dirt, battle * 0.18)
    colors.push(col.r, col.g, col.b)
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  groundGeo.computeVertexNormals()
  const grain = canvasTexture(256, (ctx, s) => {
    const img = ctx.createImageData(s, s)
    const r = rng(42)
    for (let i = 0; i < s * s; i += 1) { const v = 150 + r() * 105; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255 }
    ctx.putImageData(img, 0, 0)
    for (let i = 0; i < 260; i += 1) { ctx.fillStyle = `rgba(40,30,20,${0.08 + r() * 0.12})`; ctx.beginPath(); ctx.arc(r() * s, r() * s, 1 + r() * 4, 0, Math.PI * 2); ctx.fill() }
  }, 60)
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.96, metalness: 0 }))
  ground.receiveShadow = true
  scene.add(ground)

  // 사용자 제공 실사 전장(2:1 섬 지형): 긴 쪽을 앞뒤로, 땅 높이가 0이 되게 얹는다
  const ISLAND = { scale: 3.6, halfX: 8.82 * 3.6 / 2 + 0.6, halfZ: 17.66 * 3.6 / 2 + 0.6, z: -4 }
  const inIsland = (x: number, z: number) => Math.abs(x) < ISLAND.halfX && Math.abs(z - ISLAND.z) < ISLAND.halfZ
  void loadModel('battlefield').then(gltf => {
    const island = gltf.scene
    island.scale.setScalar(ISLAND.scale)
    island.rotation.y = Math.PI / 2
    island.position.set(0, 0.867 * ISLAND.scale + 0.02, ISLAND.z)
    scene.add(island)
  }).catch(() => { /* 모델이 없으면 기본 지형만 */ })

  // 풀 덤불(인스턴스) — 전장 가운데는 비운다
  const tuftCount = quality === 'high' ? 2600 : 900
  const tuftGeo = mergeColored([
    { geometry: new THREE.ConeGeometry(0.06, 0.42, 3), color: 0x8a8a3a, matrix: M(0, 0.2, 0, 0, 0, 0.25) },
    { geometry: new THREE.ConeGeometry(0.06, 0.36, 3), color: 0x6a7a30, matrix: M(0.06, 0.17, 0.03, 0, 1, -0.3) },
    { geometry: new THREE.ConeGeometry(0.05, 0.3, 3), color: 0xa08a44, matrix: M(-0.05, 0.14, -0.03, 0.2, 2, 0.1) },
  ])
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), tuftCount)
  const tr = rng(9)
  const dummy = new THREE.Object3D()
  let placed = 0
  for (let tries = 0; placed < tuftCount && tries < tuftCount * 4; tries += 1) {
    const x = (tr() - 0.5) * 110, z = (tr() - 0.5) * 90 - 6
    if (Math.abs(x) < 9 && z > -12 && z < 12) continue
    if (inIsland(x, z)) continue
    if (Math.abs(x - Math.sin(z * 0.12) * 1.6) < 2.6) continue
    dummy.position.set(x, terrainHeight(x, z), z)
    dummy.rotation.set(0, tr() * 6.28, 0)
    dummy.scale.setScalar(0.7 + tr() * 1.1)
    dummy.updateMatrix()
    tufts.setMatrixAt(placed, dummy.matrix)
    placed += 1
  }
  tufts.count = placed
  scene.add(tufts)

  // 바위
  const rockGeo = new THREE.DodecahedronGeometry(1, 0)
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 0.92, flatShading: true }), 40)
  for (let i = 0; i < 40; i += 1) {
    const a = tr() * Math.PI * 2, rr = 15 + tr() * 30
    let rx = Math.cos(a) * rr, rz = Math.sin(a) * rr * 0.8 - 8
    if ((rz > 4 && Math.abs(rx) < 24) || inIsland(rx, rz)) rx = Math.sign(rx || 1) * (24 + tr() * 8)
    dummy.position.set(rx, terrainHeight(rx, rz) + 0.1, rz)
    dummy.rotation.set(tr(), tr() * 6, tr())
    dummy.scale.set(0.4 + tr() * 1.4, 0.3 + tr() * 0.8, 0.4 + tr() * 1.2)
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix)
  }
  rocks.castShadow = true; rocks.receiveShadow = true
  scene.add(rocks)

  // 소나무(양옆 언덕)
  const pine = mergeColored([
    { geometry: new THREE.CylinderGeometry(0.12, 0.2, 2.2, 6), color: 0x3a2618, matrix: M(0, 1.1, 0) },
    { geometry: new THREE.ConeGeometry(1.2, 2.2, 7), color: 0x2a3a24, matrix: M(0, 2.6, 0) },
    { geometry: new THREE.ConeGeometry(0.95, 1.9, 7), color: 0x32462a, matrix: M(0, 3.5, 0) },
    { geometry: new THREE.ConeGeometry(0.6, 1.5, 7), color: 0x3a522e, matrix: M(0, 4.3, 0) },
  ])
  const pines = new THREE.InstancedMesh(pine, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 46)
  for (let i = 0; i < 46; i += 1) {
    const side = i % 2 ? 1 : -1
    const x = side * (30 + tr() * 30), z = -50 + tr() * 50
    dummy.position.set(x, terrainHeight(x, z) - 0.2, z)
    dummy.rotation.set(0, tr() * 6, 0); dummy.scale.setScalar(0.9 + tr() * 1.1)
    dummy.updateMatrix(); pines.setMatrixAt(i, dummy.matrix)
  }
  pines.castShadow = quality === 'high'
  scene.add(pines)

  // 깃발 줄(양 진영 뒤) — 천은 바람에 흔들린다
  const flags: Array<{ mesh: THREE.Mesh; base: Float32Array; phase: number }> = []
  const addFlagRow = (team: Team, z: number, count: number, spread: number, gapHalf = 0) => {
    for (let i = 0; i < count; i += 1) {
      let x = (i - (count - 1) / 2) * spread + (tr() - 0.5) * 0.6
      if (gapHalf && Math.abs(x) < gapHalf) x = Math.sign(x || 1) * (gapHalf + Math.abs(x))
      const poleH = 4.2 + tr() * 1.2
      const poleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, poleH, 5), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 }))
      poleMesh.position.set(x, poleH / 2, z)
      const geo = new THREE.PlaneGeometry(1.1, 1.7, 6, 4)
      geo.translate(0.55, 0, 0)
      const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team].banner, side: THREE.DoubleSide, roughness: 0.85 }))
      cloth.position.set(x + 0.04, poleH - 0.95, z)
      cloth.rotation.y = team === 'player' ? 0.3 : Math.PI - 0.3
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.03), new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team].trim, metalness: 0.6, roughness: 0.4 }))
      trim.position.set(x + 0.6 * Math.cos(cloth.rotation.y), poleH - 0.08, z - 0.6 * Math.sin(cloth.rotation.y))
      trim.rotation.y = cloth.rotation.y
      scene.add(poleMesh, cloth, trim)
      flags.push({ mesh: cloth, base: Float32Array.from(geo.getAttribute('position').array as Float32Array), phase: tr() * 6 })
    }
  }
  addFlagRow('player', 9.5, quality === 'high' ? 8 : 6, 2.6, 9)
  addFlagRow('enemy', -19.5, quality === 'high' ? 11 : 7, 3.2)
  updaters.push(t => {
    for (const flag of flags) {
      const pos = flag.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i += 1) {
        const x = flag.base[i * 3], y = flag.base[i * 3 + 1]
        pos.setZ(i, Math.sin(t * 3 + x * 3.2 + y * 0.8 + flag.phase) * 0.18 * (x / 1.1))
      }
      pos.needsUpdate = true
      flag.mesh.geometry.computeVertexNormals()
    }
  })

  // 후방 대군: 양 진영 뒤에 늘어선 병사 수백 명(움직임은 가볍게)
  const host = (team: Team, z: number, facing: number, gapHalf: number) => {
    const rows = quality === 'high' ? 6 : 4, cols = quality === 'high' ? 34 : 22
    const geos = [soldierGeometry('pike', team), soldierGeometry('infantry', team)]
    geos.forEach((geo, gi) => {
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.15 }), rows * cols)
      const items: Array<{ x: number; z: number; ph: number }> = []
      for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
        if ((r + c) % 2 !== gi) continue
        let x = (c - (cols - 1) / 2) * 0.62 + (tr() - 0.5) * 0.15
        if (gapHalf && Math.abs(x) < gapHalf) x = Math.sign(x || 1) * (gapHalf + Math.abs(x) * 0.9)
        items.push({ x, z: z + r * 0.62 * Math.sign(facing === 0 ? 1 : -1) + (tr() - 0.5) * 0.15, ph: tr() * 6 })
      }
      mesh.count = items.length
      const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, facing, 0)), one = new THREE.Vector3(1.05, 1.05, 1.05), pv = new THREE.Vector3()
      const write = (t: number) => {
        items.forEach((it, i) => { pv.set(it.x, Math.sin(t * 1.6 + it.ph) * 0.02, it.z); m4.compose(pv, qq, one); mesh.setMatrixAt(i, m4) })
        mesh.instanceMatrix.needsUpdate = true
      }
      write(0)
      let acc = 0
      updaters.push((t, delta) => { acc += delta; if (acc > 0.1) { acc = 0; write(t) } })
      scene.add(mesh)
    })
  }
  // 후방 대군(줄지어 선 장식 병사)은 쓰지 않는다: 실제 병사 부대가 무장 뒤에서 싸운다
  void host

  // 원경 연기 기둥(불타는 들판)과 먼지·불티
  const smokeMat = new THREE.SpriteMaterial({ map: softSprite(), color: 0x4a3a36, transparent: true, opacity: 0.32, depthWrite: false })
  const smokes: Array<{ sprite: THREE.Sprite; base: THREE.Vector3; speed: number; life: number }> = []
  for (let i = 0; i < (quality === 'high' ? 34 : 16); i += 1) {
    const sprite = new THREE.Sprite(smokeMat.clone())
    const column = i % 4
    const base = new THREE.Vector3([-34, -18, 22, 38][column], 0, [-52, -60, -58, -48][column])
    smokes.push({ sprite, base, speed: 0.8 + tr() * 0.6, life: tr() })
    scene.add(sprite)
  }
  updaters.push((_t, delta) => {
    for (const s of smokes) {
      s.life = (s.life + delta * 0.06 * s.speed) % 1
      s.sprite.position.set(s.base.x + Math.sin(s.life * 3) * 2 + s.life * 6, s.base.y + s.life * 26, s.base.z)
      const k = 3 + s.life * 12
      s.sprite.scale.set(k, k, 1)
      ;(s.sprite.material as THREE.SpriteMaterial).opacity = 0.34 * Math.sin(s.life * Math.PI)
    }
  })
  const emberCount = quality === 'high' ? 220 : 90
  const emberGeo = new THREE.BufferGeometry()
  const emberPos = new Float32Array(emberCount * 3), emberSeed = new Float32Array(emberCount)
  for (let i = 0; i < emberCount; i += 1) { emberPos.set([(tr() - 0.5) * 50, tr() * 10, (tr() - 0.5) * 40 - 6], i * 3); emberSeed[i] = tr() }
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3))
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({ map: softSprite(), color: 0xffa050, size: 0.22, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }))
  scene.add(embers)
  const dustGeo = new THREE.BufferGeometry()
  const dustPos = new Float32Array(160 * 3)
  for (let i = 0; i < 160; i += 1) dustPos.set([(tr() - 0.5) * 36, 0.3 + tr() * 3, (tr() - 0.5) * 30 - 2], i * 3)
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: softSprite(), color: 0xd8b48a, size: 0.6, transparent: true, opacity: 0.08, depthWrite: false }))
  scene.add(dust)
  updaters.push((t, delta) => {
    const a = emberGeo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < emberCount; i += 1) {
      let y = a.getY(i) + delta * (0.6 + emberSeed[i] * 0.9)
      if (y > 12) y = 0
      a.setY(i, y)
      a.setX(i, a.getX(i) + Math.sin(t * 0.8 + emberSeed[i] * 10) * delta * 0.3)
    }
    a.needsUpdate = true
    dust.rotation.y = Math.sin(t * 0.05) * 0.05
  })

  return { update: (t, delta) => updaters.forEach(fn => fn(t, delta)), sun }
}
