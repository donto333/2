// 병종별 공격 동작을 "미리 구운 자세(모프)"로 만든다.
//  - 창병: 창을 쥔 팔이 창째로 앞으로 눕혀져 찌른다
//  - 기병(조조 포함): 상체를 비틀며 칼을 머리 위에서 내리친다 · 여포는 쥐고 있는 방천화극을 크게 휘두른다
//  - 궁병: 활을 든 팔을 들고 시위를 당겼다 놓는다(궁병 모델은 뼈대가 온전해 뼈를 직접 돌린다)
//  - 책사: 깃부채를 앞으로 크게 휘두른다
// 받은 모델 대부분은 뼈대와 메시가 맞지 않아(몸 전체가 한 뼈에 붙어 있다) 뼈 동작이 먹지 않는다.
// 그래서 꼭짓점 위치로 상체·팔·무기 영역을 나눠 간단한 가상 뼈를 만들고, 동작을 몇 장의 자세로 구워
// 모프 타깃으로 담는다. 병사(InstancedMesh)는 병사마다 다른 시각의 자세를, 무장은 한 메시로 같은 자세를 쓴다.
import * as THREE from 'three'
import { markShared } from './gpu-shared'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { applyLayer, findBones, sampleKeys, type PoseKey } from './battle-poses'
import type { ModelName } from './battle-models'
import { monotoneSample } from './motion-math'
import { weaponModel, weaponMaterial } from './weapon-models'

export type StrikeKind = 'thrust' | 'slash' | 'shoot' | 'cast'

/** 동작 길이(초)와 무기가 닿거나 화살이 떠나는 순간(0~1) */
export const STRIKE_TIMING: Record<StrikeKind, { duration: number; hit: number }> = {
  thrust: { duration: 0.72, hit: 0.42 },
  slash: { duration: 0.78, hit: 0.45 },
  shoot: { duration: 1.0, hit: 0.6 },
  cast: { duration: 0.8, hit: 0.5 },
}

/** 구워 두는 자세 수(0번 = 기본 자세, 나머지가 모프 타깃) */
export const STRIKE_FRAMES = 12

type V3 = [number, number, number]
interface RigBone { name: string; parent: number; pivot: V3 }
interface RigKey { t: number; b: Record<string, { r?: V3; m?: V3 }> }
export interface Prop { geometry: THREE.BufferGeometry; material: THREE.Material }
interface RigSpec {
  kind: StrikeKind
  bones: RigBone[]
  /** 꼭짓점 → 뼈별 가중치(합이 1보다 작으면 나머지는 제자리) */
  weights: (p: THREE.Vector3) => number[]
  keys: RigKey[]
  /** 손에 쥔 무기: 마지막 뼈(무기 뼈)에 붙는다 */
  prop?: () => Prop
  /** 무기를 쥐는 위치(없으면 무기 뼈의 중심) */
  propAt?: V3
  /** 모델이 원래 쥔 무기 꼭짓점: 고유 무기로 바꿀 때 손 위치로 접어 숨긴다 */
  hideNative?: (p: THREE.Vector3) => boolean
}

const sm = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }

// ── 무기 도형 ────────────────────────────────────────────────
function metal(color: number, rough = 0.32): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: rough })
}
/** 무기는 손잡이가 원점, 날이 +Y로 뻗게 만든다 */
function swordProp(): Prop {
  const blade = new THREE.BoxGeometry(0.055, 1.05, 0.014)
  blade.translate(0, 0.62, 0)
  const tip = new THREE.ConeGeometry(0.039, 0.16, 4)
  tip.rotateY(Math.PI / 4); tip.scale(1, 1, 0.26); tip.translate(0, 1.22, 0)
  const guard = new THREE.BoxGeometry(0.2, 0.035, 0.05)
  guard.translate(0, 0.08, 0)
  const grip = new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6)
  grip.translate(0, -0.03, 0)
  return { geometry: mergeGeometries([blade, tip, guard, grip].map(g => g.toNonIndexed()))!, material: metal(0xd8dde4) }
}
/** 긴 자루 무기: 손잡이(원점) 위로 1.7, 아래로 0.9 */
function polearm(head: THREE.BufferGeometry[], shaftColor: number, headColor: number, rough = 0.35): Prop {
  const shaft = new THREE.CylinderGeometry(0.021, 0.021, 2.6, 6)
  shaft.translate(0, 0.4, 0)
  const parts = [shaft, ...head].map(g => g.index ? g.toNonIndexed() : g)
  // 붙일 도형마다 속성이 다르면 합칠 수 없으니 위치 · 노멀만 남긴다
  for (const g of parts) for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
  // 자루와 날을 한 재질로 칠하되, 날 꼭짓점만 밝은 금속빛이 되도록 꼭짓점 색을 쓴다
  const colors: number[] = []
  const shaftRgb = new THREE.Color(shaftColor), headRgb = new THREE.Color(headColor)
  parts.forEach((g, i) => { const c = i === 0 ? shaftRgb : headRgb; for (let v = 0; v < g.getAttribute('position').count; v += 1) colors.push(c.r, c.g, c.b) })
  const geometry = mergeGeometries(parts)!
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return { geometry, material: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: rough }) }
}
/** 청룡언월도(관우): 납작한 강철 언월 칼날(바깥 날이 둥글게 휘고 등에 갈고리) + 청동 용머리 고리 */
function glaiveProp(): Prop {
  const shape = new THREE.Shape()
  shape.moveTo(-0.035, 0)
  shape.lineTo(0.045, 0)
  shape.quadraticCurveTo(0.2, 0.22, 0.165, 0.46) // 배가 불룩한 바깥 날
  shape.quadraticCurveTo(0.12, 0.68, -0.025, 0.8) // 위로 휘어 뾰족한 끝
  shape.quadraticCurveTo(-0.03, 0.66, -0.05, 0.56)
  shape.lineTo(-0.115, 0.47) // 등 갈고리
  shape.lineTo(-0.06, 0.44)
  shape.quadraticCurveTo(-0.045, 0.2, -0.035, 0)
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1, curveSegments: 10 })
  blade.translate(0, 1.5, -0.004)
  blade.deleteAttribute('uv')
  const collar = new THREE.CylinderGeometry(0.034, 0.028, 0.14, 10); collar.translate(0, 1.44, 0)
  collar.deleteAttribute('uv')
  return polearm([blade, collar], 0x2d3a2a, 0xc4c8c9, 0.32)
}
/** 장팔사모(장비): 뱀처럼 굽이친 창날 */
function snakeProp(): Prop {
  const segments: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i += 1) {
    const seg = new THREE.BoxGeometry(0.05 - i * 0.006, 0.13, 0.016)
    seg.rotateZ((i % 2 ? 1 : -1) * 0.35)
    seg.translate((i % 2 ? 1 : -1) * 0.022, 1.66 + i * 0.11, 0)
    segments.push(seg)
  }
  const tip = new THREE.ConeGeometry(0.03, 0.14, 4); tip.translate(0, 2.27, 0)
  return polearm([...segments, tip], 0x2b2522, 0xcfd6dc)
}
/** 창(조운·마초·손책): 은빛 창날 + 붉은 술 */
function spearProp(): Prop {
  const tip = new THREE.ConeGeometry(0.045, 0.42, 4); tip.translate(0, 1.92, 0)
  const tassel = new THREE.ConeGeometry(0.07, 0.18, 8); tassel.rotateX(Math.PI); tassel.translate(0, 1.66, 0)
  return polearm([tip, tassel], 0x3a2a20, 0xe2e6ea, 0.3)
}
/** 극(전위·장료): 창날 + 한쪽 초승달 날 */
function halberdProp(): Prop {
  const spike = new THREE.ConeGeometry(0.04, 0.38, 4); spike.translate(0, 1.95, 0)
  const crescent = new THREE.TorusGeometry(0.17, 0.028, 4, 12, Math.PI)
  crescent.rotateZ(-Math.PI / 2); crescent.scale(0.85, 1, 0.4); crescent.translate(0.04, 1.62, 0)
  return polearm([spike, crescent], 0x3b2c22, 0xc8c2b0)
}
/** 대도(허저·서황): 넓고 두꺼운 칼날 */
function bladeProp(): Prop {
  const blade = new THREE.BoxGeometry(0.16, 0.7, 0.03); blade.translate(0.05, 1.7, 0)
  const tip = new THREE.ConeGeometry(0.09, 0.2, 4); tip.rotateY(Math.PI / 4); tip.scale(1, 1, 0.3); tip.translate(0.05, 2.15, 0)
  return polearm([blade, tip], 0x2a2420, 0xbfc4c8)
}

/** 깃부채 */
function fanProp(): Prop {
  const handle = new THREE.CylinderGeometry(0.016, 0.016, 0.24, 6)
  const fan = new THREE.CircleGeometry(0.26, 12, Math.PI * 0.18, Math.PI * 0.64)
  fan.translate(0, 0.02, 0)
  return { geometry: mergeGeometries([handle.toNonIndexed(), fan.toNonIndexed()])!, material: new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8, side: THREE.DoubleSide }) }
}

/** 활(말 위 궁병 무장): 손잡이가 원점, 활대는 ±Y로 뻗고 끝이 활 쏘는 사람 쪽(-Z)으로 휜다 */
function bowProp(): Prop {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 12; i += 1) {
    const y = -0.62 + (i / 12) * 1.3, u = (y - 0.04) / 0.65
    pts.push(new THREE.Vector3(0, y, -0.2 * u * u + 0.05 * Math.pow(Math.abs(u), 6)))
  }
  const limb = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.018, 5)
  const a = pts[0], b = pts[pts.length - 1]
  const string = new THREE.CylinderGeometry(0.004, 0.004, a.distanceTo(b), 3)
  string.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  const grip = new THREE.CylinderGeometry(0.026, 0.026, 0.14, 6)
  return { geometry: mergeGeometries([limb.toNonIndexed(), string.toNonIndexed(), grip.toNonIndexed()])!, material: new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.6 }) }
}

// ── 모델별 동작 설계 ─────────────────────────────────────────
// 몸 기준 축: +Z가 앞, +Y가 위, -X가 몸의 오른쪽(무기 쥔 쪽).
const LANCER: RigSpec = {
  kind: 'thrust',
  bones: [
    { name: 'torso', parent: -1, pivot: [0, 1.0, 0] },
    { name: 'arm', parent: 0, pivot: [-0.3, 1.45, 0.05] },
  ],
  weights: p => {
    // 창(가장 바깥 세로 막대)과 창을 쥔 팔
    const spear = p.x < -0.52 ? 1 : 0
    const arm = Math.max(spear, sm(-0.3, -0.37, p.x) * sm(1.2, 1.28, p.y) * (1 - sm(1.62, 1.7, p.y)))
    const torso = sm(0.92, 1.1, p.y)
    return [torso * (1 - arm), arm]
  },
  keys: [
    { t: 0, b: {} },
    { t: 0.2, b: { torso: { r: [-6, -18, 0] }, arm: { r: [86, 0, 6], m: [0.08, 0, -0.42] } } },
    { t: 0.42, b: { torso: { r: [12, 14, 0], m: [0, 0, 0.12] }, arm: { r: [90, 0, 4], m: [0.14, 0, 0.62] } } },
    { t: 0.6, b: { torso: { r: [9, 10, 0], m: [0, 0, 0.08] }, arm: { r: [88, 0, 4], m: [0.12, 0, 0.45] } } },
    { t: 1, b: {} },
  ],
}

function riderSpec(prop: () => Prop, grip: V3, weapon: 'sword' | 'fan'): RigSpec {
  return {
    kind: weapon === 'fan' ? 'cast' : 'slash',
    bones: [
      { name: 'torso', parent: -1, pivot: [0, 1.66, 0] },
      { name: 'weapon', parent: 0, pivot: grip },
    ],
    // 안장 위 상체(말 목은 빼고)
    weights: p => [sm(1.6, 1.74, p.y) * (1 - sm(0.3, 0.42, p.z)), 0],
    keys: weapon === 'fan'
      ? [
          { t: 0, b: { weapon: { r: [20, 0, 0] } } },
          { t: 0.3, b: { torso: { r: [-4, -22, 0] }, weapon: { r: [-30, 0, -40], m: [-0.05, 0.25, -0.1] } } },
          { t: 0.5, b: { torso: { r: [8, 20, 0] }, weapon: { r: [70, 0, 50], m: [0.22, 0.05, 0.3] } } },
          { t: 0.7, b: { torso: { r: [5, 14, 0] }, weapon: { r: [60, 0, 40], m: [0.15, 0, 0.2] } } },
          { t: 1, b: { weapon: { r: [20, 0, 0] } } },
        ]
      : [
          { t: 0, b: { weapon: { r: [25, 0, 0] } } },
          // 들어올리기: 상체를 오른쪽으로 비틀고 칼끝을 머리 위 뒤로
          { t: 0.28, b: { torso: { r: [-8, -34, 4] }, weapon: { r: [-62, 0, -28], m: [0.02, 0.42, -0.12] } } },
          // 내려치기: 상체가 앞으로 쏠리며 칼이 앞아래 대각선으로
          { t: 0.45, b: { torso: { r: [14, 30, -4] }, weapon: { r: [112, 0, 38], m: [0.2, -0.05, 0.42] } } },
          { t: 0.62, b: { torso: { r: [10, 34, -3] }, weapon: { r: [128, 0, 52], m: [0.24, -0.12, 0.36] } } },
          { t: 1, b: { weapon: { r: [25, 0, 0] } } },
        ],
    prop,
  }
}

/** 이름난 무장의 고유 무기 */
export type SignatureWeapon = 'glaive' | 'snake' | 'spear' | 'halberd' | 'blade'
export const SIGNATURE_WEAPONS: Record<string, SignatureWeapon> = {
  'guan-yu': 'glaive', 'guan-ping': 'glaive', 'guan-xing': 'glaive',
  'zhao-yun': 'spear', 'ma-chao': 'spear', 'sun-ce': 'spear', 'ma-dai': 'spear', 'gongsun-zan': 'spear',
  'zhang-liao': 'halberd', 'zhang-fei': 'snake', 'zhang-bao': 'snake',
  'dian-wei': 'halberd', 'xu-chu': 'blade', 'xu-huang': 'blade',
}
/** 실사풍 무기 모델(weapon-models.ts)이 불러와져 있으면 그것을, 아니면 코드로 만든 예전 도형을 쓴다 */
function modelProp(kind: string, fallback: () => Prop): () => Prop {
  return () => {
    const model = weaponModel(kind)
    return model ? { geometry: model.geometry, material: weaponMaterial(model) } : fallback()
  }
}
const WEAPON_PROPS: Record<SignatureWeapon, () => Prop> = {
  glaive: modelProp('glaive', glaiveProp), snake: modelProp('snake', snakeProp), spear: spearProp,
  halberd: modelProp('halberd', halberdProp), blade: modelProp('blade', bladeProp),
}
const SWORD_PROP = modelProp('sword', swordProp)
const FAN_PROP = modelProp('fan', fanProp)

function withWeapon(name: ModelName, weapon: SignatureWeapon): RigSpec | undefined {
  const base = SPECS[name]
  if (!base) return undefined
  // 말 위 무장: 칼 대신 긴 자루 무기(손잡이 위치는 칼과 같다)
  if (name === 'cavalry' || name === 'caocao') return { ...base, prop: WEAPON_PROPS[weapon] }
  // 보병 무장: 원래 쥔 창을 숨기고 같은 손에 고유 무기를 쥐어 준다(창을 쥔 팔에 붙는다)
  if (name === 'lancer') return { ...base, prop: WEAPON_PROPS[weapon], propAt: [-0.62, 1.42, 0.2], hideNative: p => p.x < -0.52 }
  return undefined
}

const SPECS: Partial<Record<ModelName, RigSpec>> = {
  lancer: LANCER,
  cavalry: riderSpec(SWORD_PROP, [-0.3, 1.86, 0.3], 'sword'),
  caocao: riderSpec(SWORD_PROP, [-0.3, 1.86, 0.28], 'sword'),
  lubu: {
    // 여포 모델은 방천화극을 이미 쥐고 있다(오른쪽 앞으로 비스듬히): 그 화극을 무기 뼈에 붙인다
    kind: 'slash',
    bones: [
      { name: 'torso', parent: -1, pivot: [0, 1.66, 0] },
      { name: 'weapon', parent: 0, pivot: [-0.42, 1.47, 0.36] },
    ],
    weights: p => {
      const halberd = p.x < -0.33 && p.z > 0.42 && p.y > 1.0 && p.y < 1.66 ? 1 : 0
      return [halberd ? 0 : sm(1.6, 1.74, p.y) * (1 - sm(0.3, 0.42, p.z)), halberd]
    },
    keys: [
      { t: 0, b: {} },
      // 화극을 머리 위 뒤로 크게 들어 올렸다가
      { t: 0.3, b: { torso: { r: [-8, -30, 4] }, weapon: { r: [-118, -10, -10], m: [0.06, 0.45, -0.3] } } },
      // 앞으로 크게 휘둘러 내려친다
      { t: 0.45, b: { torso: { r: [14, 28, -4] }, weapon: { r: [12, 26, 8], m: [0.16, 0.05, 0.25] } } },
      { t: 0.62, b: { torso: { r: [10, 32, -3] }, weapon: { r: [22, 40, 10], m: [0.2, -0.02, 0.2] } } },
      { t: 1, b: {} },
    ],
  },
  zhugeliang: riderSpec(FAN_PROP, [-0.28, 1.9, 0.3], 'fan'),
}

/** 궁병: 활 겨눈 자세 위에서 시위 손을 턱까지 당겼다가 놓는다(이 모델은 L/R 이름이 반대로 붙어 있어 시위 손이 _R) */
const ARCHER_KEYS: PoseKey[] = [
  { t: 0.3, r: {} },
  // 시위를 턱 앞까지 당긴다
  { t: 0.55, r: { UpperArm_R: [-60, -30, 0], Forearm_R: [-90, 0, 0] } },
  // 놓는 순간 손이 뒤로 튕긴다
  { t: 0.63, r: { UpperArm_R: [-48, -48, 0], Forearm_R: [-55, 0, 0] } },
  { t: 0.85, r: {} },
]

// ── 굽기 ─────────────────────────────────────────────────────
/**
 * 열쇠 자세 사이를 단조 큐빅으로 잇는다: 예전처럼 열쇠마다 속도가 0이 되어 "멈칫멈칫" 끊기지 않고,
 * 같은 방향으로 이어지는 동작(내려치기 → 끝까지 밀기)은 속도를 이어 가며, 방향이 바뀌는 꼭대기(크게 들어 올린 자세)에서는 넘치지 않는다.
 */
function sampleRig(keys: RigKey[], t: number, bone: string): { r: V3; m: V3 } {
  const times = keys.map(key => key.t)
  const channel = (pick: (key: RigKey) => V3 | undefined, i: number) => monotoneSample(times, keys.map(key => pick(key)?.[i] ?? 0), t)
  const r: V3 = [0, 1, 2].map(i => channel(key => key.b[bone]?.r, i)) as V3
  const m: V3 = [0, 1, 2].map(i => channel(key => key.b[bone]?.m, i)) as V3
  return { r, m }
}

/**
 * 구울 자세의 시각(0~1). 열쇠 자세는 반드시 넣고, 남은 칸은 자세가 크게 바뀌는(빠르게 휘두르는) 구간에 더 준다.
 * 같은 칸 수로 휘두르는 순간이 더 매끄럽게 보이고, 칼끝이 직선으로 질러가며 짧아 보이는 일이 줄어든다.
 */
function frameTimes(keys: RigKey[], count: number): number[] {
  const kt = keys.map(key => Math.min(0.999, key.t))
  const gaps: Array<{ a: number; b: number; change: number; n: number }> = []
  for (let i = 0; i < kt.length - 1; i += 1) {
    let change = 0
    for (const bone of new Set([...Object.keys(keys[i].b), ...Object.keys(keys[i + 1].b)])) {
      const ra = keys[i].b[bone]?.r ?? [0, 0, 0], rb = keys[i + 1].b[bone]?.r ?? [0, 0, 0]
      const ma = keys[i].b[bone]?.m ?? [0, 0, 0], mb = keys[i + 1].b[bone]?.m ?? [0, 0, 0]
      for (let k = 0; k < 3; k += 1) change += Math.abs(rb[k] - ra[k]) + Math.abs(mb[k] - ma[k]) * 120
    }
    if (kt[i + 1] > kt[i]) gaps.push({ a: kt[i], b: kt[i + 1], change, n: 1 })
  }
  let total = gaps.length
  while (total < count - 1 && gaps.length) {
    // 한 칸이 맡는 변화가 가장 큰 구간을 나눈다(시간 길이도 조금 따져 느린 구간이 비지 않게)
    let best = gaps[0]
    for (const gap of gaps) if ((gap.change + (gap.b - gap.a) * 400) / gap.n > (best.change + (best.b - best.a) * 400) / best.n) best = gap
    best.n += 1
    total += 1
  }
  const out: number[] = [0]
  for (const gap of gaps) for (let j = 1; j <= gap.n; j += 1) out.push(gap.a + (gap.b - gap.a) * j / gap.n)
  while (out.length < count) out.push(0.999)
  return out.slice(0, count)
}

function boneMatrices(spec: RigSpec, t: number): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = []
  const euler = new THREE.Euler(), q = new THREE.Quaternion()
  spec.bones.forEach((bone, index) => {
    const { r, m } = sampleRig(spec.keys, t, bone.name)
    const pivot = new THREE.Vector3(...bone.pivot)
    euler.set(THREE.MathUtils.degToRad(r[0]), THREE.MathUtils.degToRad(r[1]), THREE.MathUtils.degToRad(r[2]), 'YXZ')
    q.setFromEuler(euler)
    const local = new THREE.Matrix4().makeTranslation(m[0], m[1], m[2])
      .multiply(new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z))
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
    out[index] = bone.parent >= 0 ? out[bone.parent].clone().multiply(local) : local
  })
  return out
}

/** 모델의 기본 자세(Idle) 꼭짓점을 장면 좌표로 굳힌다 */
function posedBase(gltf: GLTF, layer?: (root: THREE.Object3D) => void, clipName = 'Idle', clipFraction = -1): { position: Float32Array; normal: Float32Array; source: THREE.SkinnedMesh } {
  const scene = cloneSkinned(gltf.scene)
  const mixer = new THREE.AnimationMixer(scene)
  const clip = gltf.animations.find(item => item.name === clipName) ?? gltf.animations[0]
  if (clip) { mixer.clipAction(clip).play(); mixer.setTime(clipFraction >= 0 ? clip.duration * clipFraction : 0.4) }
  scene.updateMatrixWorld(true)
  layer?.(scene)
  scene.updateMatrixWorld(true)
  let skinned: THREE.SkinnedMesh | null = null
  scene.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh && !skinned) skinned = node as THREE.SkinnedMesh })
  if (!skinned) throw new Error('no skinned mesh')
  const mesh = skinned as THREE.SkinnedMesh
  mesh.skeleton.update()
  const pos = mesh.geometry.getAttribute('position'), nor = mesh.geometry.getAttribute('normal')
  const position = new Float32Array(pos.count * 3), normal = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i)
    mesh.applyBoneTransform(i, v)
    v.applyMatrix4(mesh.matrixWorld)
    position.set([v.x, v.y, v.z], i * 3)
    if (nor) {
      n.fromBufferAttribute(nor, i)
      w.fromBufferAttribute(pos, i).addScaledVector(n, 0.01)
      mesh.applyBoneTransform(i, w)
      w.applyMatrix4(mesh.matrixWorld).sub(v).normalize()
      normal.set([w.x, w.y, w.z], i * 3)
    }
  }
  return { position, normal, source: mesh }
}

export interface StrikeModel {
  kind: StrikeKind
  /** 구운 자세들의 시각(0~1, 0번은 기본 자세). 1이 되면 다시 기본 자세 */
  times: number[]
  geometry: THREE.BufferGeometry
  /** 몸(원래 재질) + 무기(있으면) */
  materials: THREE.Material[]
  duration: number
  hit: number
}

function buildFromRig(gltf: GLTF, spec: RigSpec): StrikeModel {
  const base = posedBase(gltf)
  const src = base.source.geometry
  const bodyCount = base.position.length / 3
  // 고유 무기로 바꿀 때 원래 무기 꼭짓점은 손 위치로 접어 보이지 않게 한다
  if (spec.hideNative && spec.propAt) {
    const q = new THREE.Vector3()
    for (let i = 0; i < bodyCount; i += 1) {
      q.fromArray(base.position, i * 3)
      if (spec.hideNative(q)) base.position.set(spec.propAt, i * 3)
    }
  }
  // 몸 꼭짓점 가중치
  const boneCount = spec.bones.length
  const weights = new Float32Array(bodyCount * boneCount)
  const p = new THREE.Vector3()
  for (let i = 0; i < bodyCount; i += 1) {
    p.fromArray(base.position, i * 3)
    const w = spec.weights(p)
    for (let b = 0; b < boneCount; b += 1) weights[i * boneCount + b] = w[b] ?? 0
  }
  // 무기: 손잡이 위치로 옮겨 무기 뼈에 100% 붙인다
  const prop = spec.prop?.()
  const propBone = boneCount - 1
  let propPos: Float32Array | null = null, propNor: Float32Array | null = null, propColor: Float32Array | null = null
  if (prop) {
    const g = prop.geometry.index ? prop.geometry.toNonIndexed() : prop.geometry
    g.computeVertexNormals()
    g.translate(...(spec.propAt ?? spec.bones[propBone].pivot))
    propPos = g.getAttribute('position').array as Float32Array
    propNor = g.getAttribute('normal').array as Float32Array
    propColor = (g.getAttribute('color')?.array as Float32Array | undefined) ?? null
  }
  const propCount = propPos ? propPos.length / 3 : 0
  const total = bodyCount + propCount
  const deform = (t: number): { position: Float32Array; normal: Float32Array } => {
    const mats = boneMatrices(spec, t)
    const normalMats = mats.map(m => new THREE.Matrix3().setFromMatrix4(m))
    const position = new Float32Array(total * 3), normal = new Float32Array(total * 3)
    const v = new THREE.Vector3(), acc = new THREE.Vector3(), tmp = new THREE.Vector3(), n = new THREE.Vector3(), nAcc = new THREE.Vector3()
    for (let i = 0; i < bodyCount; i += 1) {
      v.fromArray(base.position, i * 3); n.fromArray(base.normal, i * 3)
      let rest = 1
      acc.set(0, 0, 0); nAcc.set(0, 0, 0)
      for (let b = 0; b < boneCount; b += 1) {
        const w = weights[i * boneCount + b]
        if (w <= 0) continue
        rest -= w
        acc.addScaledVector(tmp.copy(v).applyMatrix4(mats[b]), w)
        nAcc.addScaledVector(tmp.copy(n).applyMatrix3(normalMats[b]), w)
      }
      acc.addScaledVector(v, rest); nAcc.addScaledVector(n, rest).normalize()
      position.set([acc.x, acc.y, acc.z], i * 3); normal.set([nAcc.x, nAcc.y, nAcc.z], i * 3)
    }
    for (let i = 0; i < propCount; i += 1) {
      v.fromArray(propPos!, i * 3).applyMatrix4(mats[propBone])
      n.fromArray(propNor!, i * 3).applyMatrix3(normalMats[propBone]).normalize()
      position.set([v.x, v.y, v.z], (bodyCount + i) * 3); normal.set([n.x, n.y, n.z], (bodyCount + i) * 3)
    }
    return { position, normal }
  }
  return assemble(spec.kind, src, bodyCount, propCount, deform, base.source.material as THREE.Material, prop?.material, propColor, frameTimes(spec.keys, STRIKE_FRAMES))
}

function buildArcher(gltf: GLTF): StrikeModel {
  // 궁병 모델의 원래 공격 동작 중 "활을 앞으로 겨눈" 구간을 쓰고, 그 위에 시위 당기기·놓기를 얹는다.
  // (팔 뼈를 크게 돌리면 몸통 갑옷까지 끌려가므로 당기는 손은 작게만 움직인다)
  const frameAt = (p: number) => {
    if (p <= 0.12 || p >= 0.93) return posedBase(gltf)
    const raise = Math.min(1, (p - 0.12) / 0.2)
    const lower = p > 0.8 ? (p - 0.8) / 0.13 : 0
    const fraction = 0.6 + raise * 0.18 - lower * 0.18
    return posedBase(gltf, root => applyLayer(root, findBones(root), sampleKeys(ARCHER_KEYS, p)), 'Attack', fraction)
  }
  const first = frameAt(0)
  // 들어 올림(0.12~0.32) · 당기기(0.3~0.55) · 놓기(0.55~0.63)에 칸을 더 준다
  return assemble('shoot', first.source.geometry, first.position.length / 3, 0, t => frameAt(t), first.source.material as THREE.Material, undefined, null, [0, 0.12, 0.2, 0.28, 0.36, 0.44, 0.51, 0.56, 0.6, 0.64, 0.74, 0.86])
}

function assemble(kind: StrikeKind, src: THREE.BufferGeometry, bodyCount: number, propCount: number, deform: (t: number) => { position: Float32Array; normal: Float32Array }, bodyMaterial: THREE.Material, propMaterial?: THREE.Material, propColor?: Float32Array | null, times: number[] = uniformTimes()): StrikeModel {
  const total = bodyCount + propCount
  const geometry = new THREE.BufferGeometry()
  const rest = deform(0)
  geometry.setAttribute('position', new THREE.BufferAttribute(rest.position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(rest.normal, 3))
  const uvSrc = src.getAttribute('uv')
  if (uvSrc) {
    const uv = new Float32Array(total * 2)
    for (let i = 0; i < bodyCount; i += 1) { uv[i * 2] = uvSrc.getX(i); uv[i * 2 + 1] = uvSrc.getY(i) }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  }
  if (propColor) {
    // 무기 꼭짓점 색(자루·날). 몸 재질은 꼭짓점 색을 쓰지 않으므로 몸 쪽은 흰색으로 채운다
    const color = new Float32Array(total * 3).fill(1)
    color.set(propColor, bodyCount * 3)
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
  }
  const index: number[] = []
  if (src.index) for (let i = 0; i < src.index.count; i += 1) index.push(src.index.getX(i))
  else for (let i = 0; i < bodyCount; i += 1) index.push(i)
  const bodyIndexCount = index.length
  for (let i = 0; i < propCount; i += 1) index.push(bodyCount + i)
  geometry.setIndex(index)
  geometry.addGroup(0, bodyIndexCount, 0)
  if (propCount) geometry.addGroup(bodyIndexCount, propCount, 1)
  const morphPos: THREE.BufferAttribute[] = [], morphNor: THREE.BufferAttribute[] = []
  for (let f = 1; f < STRIKE_FRAMES; f += 1) {
    const frame = deform(times[f])
    morphPos.push(new THREE.BufferAttribute(frame.position, 3))
    morphNor.push(new THREE.BufferAttribute(frame.normal, 3))
  }
  geometry.morphAttributes.position = morphPos
  geometry.morphAttributes.normal = morphNor
  geometry.computeBoundingSphere()
  const body = (bodyMaterial as THREE.MeshStandardMaterial).clone()
  const materials: THREE.Material[] = propMaterial ? [body, propMaterial] : [body]
  return { kind, times, geometry, materials, ...STRIKE_TIMING[kind] }
}

const cache = new Map<string, StrikeModel>()
/** 모델 하나의 공격 자세 묶음(무기별로 한 번만 굽는다) */
export function strikeModel(name: ModelName, gltf: GLTF, weapon?: SignatureWeapon): StrikeModel {
  const variant = weapon ? withWeapon(name, weapon) : undefined
  const key = variant ? `${name}|${weapon}` : name
  const cached = cache.get(key)
  if (cached) return cached
  const spec = variant ?? SPECS[name]
  const model = name === 'archer' ? buildArcher(gltf) : spec ? buildFromRig(gltf, spec) : buildFromRig(gltf, { kind: 'slash', bones: [{ name: 'torso', parent: -1, pivot: [0, 1, 0] }], weights: () => [0], keys: [{ t: 0, b: {} }] })
  cache.set(key, model)
  markShared(model.geometry)
  return model
}

/** 고르게 나눈 자세 시각(예전 방식) */
export function uniformTimes(count = STRIKE_FRAMES): number[] {
  return Array.from({ length: count }, (_, f) => f / (count - 1) * 0.999)
}

/** 공격 진행도(0~1, 범위 밖이면 기본 자세) → 모프 가중치. times는 구운 자세들의 시각 */
export function strikeInfluences(progress: number, out: number[], times: number[] = uniformTimes(out.length + 1)): number[] {
  out.fill(0)
  if (!(progress > 0 && progress < 1)) return out
  const n = times.length
  // 0번 자세는 기본 메시이므로 모프 번호는 하나씩 밀린다. 마지막 자세 뒤(→1)는 기본 자세로 돌아간다
  let i = 0
  while (i < n - 1 && progress >= times[i + 1]) i += 1
  const next = i + 1 < n ? times[i + 1] : 1
  const a = next > times[i] ? (progress - times[i]) / (next - times[i]) : 0
  if (i >= 1) out[i - 1] = 1 - a
  if (i + 1 <= n - 1) out[i] += a
  return out
}

/** 손에 쥐여 줄 무기(손잡이가 원점, 날이 +Y): 뼈대 모델의 손 뼈에 붙인다 */
export type HandProp = 'sword' | 'fan' | 'bow' | SignatureWeapon
export function handProp(kind: HandProp): Prop {
  if (kind === 'sword') return SWORD_PROP()
  if (kind === 'bow') return bowProp()
  if (kind === 'fan') return FAN_PROP()
  return WEAPON_PROPS[kind]()
}

/**
 * 기병 장도(병사용): 길고 살짝 휜 외날 + 두손 손잡이(노끈 감김) + 쇠고리 + 붉은 술. 손잡이 원점, 날은 +Y.
 * 한 재질로 그리도록 부분마다 꼭짓점 색(강철 · 쇠 · 노끈 · 붉은 술)을 칠한다. 위치 · 노멀 · 색만 남긴다.
 */
export function cavalrySaberGeometry(): THREE.BufferGeometry {
  // 실사풍 기병칼 모델(색인 도형 · 꼭짓점 색)이 있으면 그것을 쓴다
  const model = weaponModel('saber')
  if (model) return model.geometry
  const parts: Array<[THREE.BufferGeometry, number]> = []
  // 날: 등은 곧게, 날 쪽은 끝으로 갈수록 살짝 좁아지며 끝 15%에서 비스듬히 휜 칼끝
  const length = 1.02, width = 0.04, back = 0.009, tipLen = 0.13, curve = 0.05, n = 24
  const shape = new THREE.Shape()
  shape.moveTo(-back, 0)
  for (let i = 0; i <= n; i += 1) { const t = i / n; shape.lineTo(-back + curve * t * t, t * (length - tipLen)) }
  shape.lineTo(curve * 0.9, length)
  for (let i = n; i >= 0; i -= 1) { const t = i / n; shape.lineTo(width * (1 - 0.18 * t) + curve * t * t, t * (length - tipLen)) }
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, steps: 1 })
  blade.translate(0, 0.11, -0.003)
  parts.push([blade, 0xc8ccd2])
  const guard = new THREE.CylinderGeometry(0.038, 0.038, 0.016, 16); guard.scale(1.25, 1, 0.75); guard.translate(0, 0.105, 0)
  parts.push([guard, 0x3a3634])
  const grip = new THREE.CylinderGeometry(0.016, 0.017, 0.3, 10); grip.translate(0, -0.05, 0)
  parts.push([grip, 0x1e1612])
  for (let i = 0; i < 10; i += 1) { const w = new THREE.TorusGeometry(0.018, 0.003, 5, 12); w.rotateX(Math.PI / 2); w.translate(0, -0.18 + i * 0.03, 0); parts.push([w, 0x3a2a20]) }
  const ring = new THREE.TorusGeometry(0.03, 0.007, 8, 20); ring.translate(0, -0.225, 0)
  parts.push([ring, 0x3a3634])
  const tassel = new THREE.ConeGeometry(0.02, 0.16, 8, 1, true); tassel.rotateZ(0.25); tassel.translate(0.02, -0.33, 0)
  parts.push([tassel, 0xa81e18])
  const list = parts.map(([g, color]) => {
    const flat = g.index ? g.toNonIndexed() : g
    for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name)
    const c = new THREE.Color(color), colors: number[] = []
    for (let v = 0; v < flat.getAttribute('position').count; v += 1) colors.push(c.r, c.g, c.b)
    flat.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    return flat
  })
  return mergeGeometries(list)!
}
