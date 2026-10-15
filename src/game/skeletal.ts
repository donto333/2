// 뼈대(스켈레톤)가 심어진 실사 모델: 무장은 실제 뼈 애니메이션으로, 병사는 그 애니메이션을 구운 자세(모프)로 움직인다.
//  - 모델마다 GLB 안에 동작(대기·걷기·찌르기·베기·기 모아 공격·죽음 등)과 말 동작(대기·걷기·질주)이 들어 있다
//  - 말 탄 모델은 말 뼈대 위에 사람 뼈대가 얹혀 있어 사람 동작과 말 동작을 동시에 재생한다
//  - 병사(InstancedMesh)는 뼈 애니메이션을 한 번 구워 공격 자세 + 걷기 자세를 모프로 쓴다(수십 명이 같은 그리기 한 번)
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { STRIKE_FRAMES, handProp, type HandProp, type SignatureWeapon, type StrikeKind } from './battle-rig'

type HeroAction = 'Idle' | 'Walk' | 'Gallop' | 'Attack' | 'Skill'

interface ClipMeta { hit?: number; loop?: boolean; horse?: boolean }
interface RigInfo {
  kind: StrikeKind
  mounted: boolean
  prop: HandProp | null
  clips: Map<string, THREE.AnimationClip>
  meta: Map<string, ClipMeta>
}

const infoCache = new WeakMap<GLTF, RigInfo | null>()
/** 뼈대 동작이 들어 있는 모델인지 확인하고 정보를 읽는다(예전 모델이면 null) */
export function rigInfo(gltf: GLTF): RigInfo | null {
  if (infoCache.has(gltf)) return infoCache.get(gltf)!
  const found: THREE.Object3D[] = []
  gltf.scene.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh && node.userData?.kind) found.push(node) })
  const body = found[0]
  const json = (gltf.parser as unknown as { json?: { animations?: Array<{ name?: string; extras?: ClipMeta }> } }).json
  let info: RigInfo | null = null
  if (body && gltf.animations.length) {
    const meta = new Map<string, ClipMeta>()
    for (const a of json?.animations ?? []) if (a.name) meta.set(a.name, a.extras ?? {})
    info = {
      kind: body.userData.kind as StrikeKind,
      mounted: !!body.userData.mounted,
      prop: (body.userData.prop as HandProp | null) ?? null,
      clips: new Map(gltf.animations.map(clip => [clip.name, clip])),
      meta,
    }
  }
  infoCache.set(gltf, info)
  return info
}

/** 병종(공격 종류)·말 여부에 따른 동작 이름 */
function clipSet(info: RigInfo): { idle: string; walk: string; attack: string; skill: string; death: string } {
  if (info.mounted) return { idle: 'MountedIdle', walk: 'MountedMove', attack: info.kind === 'cast' ? 'MountedCast' : 'MountedSlash', skill: 'MountedChargeSlash', death: 'FallFromHorseDeath' }
  if (info.kind === 'shoot') return { idle: 'ArcherIdle', walk: 'ArcherMove', attack: 'Shoot', skill: 'Shoot', death: 'Death' }
  return { idle: 'Idle', walk: 'Move', attack: 'Stab', skill: 'ChargeStab', death: 'Death' }
}

/** 기 모으기 동작은 게임의 스킬 박자(0.42초에 발동)에 맞추려고 모으는 끝 무렵부터 재생한다 */
const SKILL_START: Record<string, number> = { ChargeStab: 1.2, ChargeSlash: 1.25, MountedChargeSlash: 1.25, MountedChargeStab: 1.2 }
/** 일반 공격은 무기가 닿는 순간이 이 시각(초)이 되도록 빠르기를 맞춘다 */
const ATTACK_HIT = 0.3
const SKILL_HIT = 0.42

function timing(info: RigInfo, name: string, wantHit: number): { start: number; scale: number; hit: number; duration: number } {
  const clip = info.clips.get(name)
  const hit = info.meta.get(name)?.hit ?? (clip ? clip.duration * 0.45 : 0.3)
  const start = SKILL_START[name] ?? 0
  const scale = THREE.MathUtils.clamp((hit - start) / wantHit, 0.6, 2.4)
  return { start, scale, hit: (hit - start) / scale, duration: ((clip?.duration ?? 1) - start) / scale }
}

const tmpV = new THREE.Vector3()

/**
 * 뼈대 무장 한 명. 예전 AnimatedHero와 같은 모양으로 쓰인다(play · playOnce · update · setFlash · setFade).
 * 걷기 정도(gait)에 따라 대기 ↔ 걷기를 섞고, 공격·스킬은 그 위에 한 번 재생하며, 말은 대기 ↔ 걷기 ↔ 질주를 섞는다.
 */
export class SkeletalHero {
  readonly root = new THREE.Group()
  readonly materials: THREE.MeshStandardMaterial[] = []
  readonly kind: StrikeKind
  readonly hitTime: number
  readonly skeletal = true
  private readonly info: RigInfo
  private readonly mixer: THREE.AnimationMixer
  private readonly names: ReturnType<typeof clipSet>
  private readonly idle: THREE.AnimationAction
  private readonly walk: THREE.AnimationAction
  private readonly horse: { idle: THREE.AnimationAction; walk: THREE.AnimationAction; gallop: THREE.AnimationAction } | null = null
  private once: { action: THREE.AnimationAction; age: number; duration: number } | null = null
  private death: THREE.AnimationAction | null = null
  private gait = 0

  constructor(gltf: GLTF, weapon?: SignatureWeapon) {
    const info = rigInfo(gltf)
    if (!info) throw new Error('rig missing')
    this.info = info
    this.kind = info.kind
    this.names = clipSet(info)
    const scene = cloneSkinned(gltf.scene)
    scene.traverse(node => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false
      const material = (mesh.material as THREE.MeshStandardMaterial).clone()
      mesh.material = material
      if (material.isMeshStandardMaterial) this.materials.push(material)
    })
    this.root.add(scene)
    // 손에 무기: 고유 무기가 있으면 원래 쥔 무기를 접어 숨기고 그 자리에 쥐여 준다
    const weaponBone = scene.getObjectByName('Weapon_R')
    const hand = scene.getObjectByName('RightHand')
    const propKind: HandProp | null = weapon ?? info.prop
    if (weaponBone && hand && propKind) {
      if (weapon && !info.mounted) weaponBone.scale.setScalar(0.0001)
      const prop = handProp(propKind)
      const material = (prop.material as THREE.MeshStandardMaterial).clone()
      const mesh = new THREE.Mesh(prop.geometry, material)
      mesh.castShadow = true
      mesh.frustumCulled = false
      mesh.rotation.x = Math.PI / 2 // 무기 도형은 날이 +Y, 손 뼈의 날 방향은 +Z
      const holder = new THREE.Group()
      holder.position.copy(weaponBone.position)
      holder.add(mesh)
      hand.add(holder)
      if (material.isMeshStandardMaterial) this.materials.push(material)
    }
    this.mixer = new THREE.AnimationMixer(scene)
    const loop = (name: string) => {
      const clip = info.clips.get(name)
      const action = this.mixer.clipAction(clip ?? new THREE.AnimationClip(name, 1, []))
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.play()
      action.setEffectiveWeight(0)
      action.time = Math.random() * (clip?.duration ?? 1)
      return action
    }
    this.idle = loop(this.names.idle)
    this.walk = loop(this.names.walk)
    this.idle.setEffectiveWeight(1)
    if (info.mounted) {
      this.horse = { idle: loop('HorseIdle'), walk: loop('HorseWalk'), gallop: loop('HorseGallop') }
      this.horse.idle.setEffectiveWeight(1)
    }
    this.hitTime = timing(info, this.names.attack, ATTACK_HIT).hit
    this.mixer.update(0)
  }

  has(name: HeroAction): boolean { return name !== 'Skill' || this.kind !== 'shoot' }

  play(_name: HeroAction): void { /* 대기·걷기는 update에서 걷기 정도로 섞는다 */ }

  /** 공격·스킬: 한 번 재생(대기·걷기 위에 덮는다) */
  playOnce(name: HeroAction): void {
    if (this.death) return
    const clipName = name === 'Skill' ? this.names.skill : this.names.attack
    const clip = this.info.clips.get(clipName)
    if (!clip) return
    const t = timing(this.info, clipName, name === 'Skill' ? SKILL_HIT : ATTACK_HIT)
    if (this.once) this.once.action.stop()
    const action = this.mixer.clipAction(clip)
    action.reset()
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.timeScale = t.scale
    action.time = t.start
    action.play()
    this.once = { action, age: 0, duration: t.duration }
  }

  /** 쓰러짐: 넘어지는(말에서 떨어지는) 동작을 끝까지 재생하고 그 자세로 멈춘다 */
  playDeath(): void {
    if (this.death) return
    const clip = this.info.clips.get(this.names.death)
    if (!clip) return
    if (this.once) { this.once.action.stop(); this.once = null }
    const action = this.mixer.clipAction(clip)
    action.reset()
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.timeScale = 1.5
    action.play()
    this.death = action
  }

  get dead(): boolean { return !!this.death }

  /** 다시 일어섬(병력이 되살아나거나 새 전투) */
  revive(): void {
    if (!this.death) return
    this.death.stop()
    this.death = null
  }

  update(delta: number, gait: number | boolean, mounted: boolean): void {
    const target = Math.min(1, Math.max(0, Number(gait)))
    this.gait += (target - this.gait) * Math.min(1, delta * 6)
    const g = this.gait
    // 공격 한 번: 들어올 때 0.08초, 끝나기 0.15초 전부터 빠진다
    let w = 0
    if (this.once) {
      this.once.age += delta
      const { age, duration } = this.once
      w = Math.min(1, age / 0.08) * Math.min(1, Math.max(0, (duration - age) / 0.15))
      this.once.action.setEffectiveWeight(w)
      if (age >= duration) { this.once.action.stop(); this.once = null; w = 0 }
    }
    const rest = this.death ? 0 : 1 - w
    this.idle.setEffectiveWeight((1 - g) * rest)
    this.walk.setEffectiveWeight(g * rest)
    this.walk.timeScale = 0.75 + 0.45 * g
    if (this.death) this.death.setEffectiveWeight(1)
    if (this.horse && mounted) {
      const run = THREE.MathUtils.smoothstep(g, 0.35, 0.8)
      const hg = this.death ? 0 : g
      this.horse.idle.setEffectiveWeight(1 - hg)
      this.horse.walk.setEffectiveWeight(hg * (1 - run))
      this.horse.gallop.setEffectiveWeight(hg * run)
      this.horse.gallop.timeScale = 0.85 + 0.3 * g
    }
    this.mixer.update(delta)
  }

  /** 피격 번쩍임(따뜻한 흰빛) + 스킬 기운(무장 색) */
  setFlash(amount: number, glow = 0, glowColor?: THREE.Color): void {
    const r = amount * 0.22 + (glowColor ? glowColor.r * glow * 0.16 : 0)
    const g = amount * 0.12 + (glowColor ? glowColor.g * glow * 0.16 : 0)
    const b = amount * 0.05 + (glowColor ? glowColor.b * glow * 0.16 : 0)
    for (const material of this.materials) material.emissive.setRGB(r, g, b)
  }

  /** 쓰러짐: 투명하게 사라진다(0 = 보임, 1 = 사라짐) */
  setFade(amount: number): void {
    for (const material of this.materials) {
      const fading = amount > 0
      if (material.transparent !== fading) { material.transparent = fading; material.needsUpdate = true }
      material.opacity = 1 - amount
    }
  }
}

// ── 병사: 뼈 애니메이션을 모프로 굽기 ───────────────────────────────────
/** 걷기(말은 질주) 한 주기를 나눠 굽는 자세 수 */
export const WALK_FRAMES = 8

export interface SquadModel {
  geometry: THREE.BufferGeometry
  materials: THREE.Material[]
  /** 공격 동작 길이(초) */
  duration: number
  /** 구운 공격 자세의 시각(0~1) */
  times: number[]
  walkFrames: number
  /** 걷기 한 주기(초) */
  walkPeriod: number
}

const squadCache = new WeakMap<GLTF, SquadModel>()

/**
 * 병사용 모델: 공격 자세 STRIKE_FRAMES장(0번은 기본 자세) + 걷기 WALK_FRAMES장을 모프 타깃으로 굽는다.
 * 원본 장면을 건드리지 않도록 복제본에서 굽는다.
 */
export function bakeSquadModel(gltf: GLTF): SquadModel | null {
  const cached = squadCache.get(gltf)
  if (cached) return cached
  const info = rigInfo(gltf)
  if (!info) return null
  const names = clipSet(info)
  const scene = cloneSkinned(gltf.scene)
  const meshes: THREE.SkinnedMesh[] = []
  scene.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(node as THREE.SkinnedMesh) })
  const body = meshes[0]
  if (!body) return null
  const mixer = new THREE.AnimationMixer(scene)
  const pose = (parts: Array<[string, number]>) => {
    mixer.stopAllAction()
    for (const [name, time] of parts) {
      const clip = info.clips.get(name)
      if (!clip) continue
      const action = mixer.clipAction(clip)
      action.reset(); action.play(); action.setEffectiveWeight(1); action.time = Math.min(time, clip.duration - 1e-4)
    }
    mixer.update(0)
    scene.updateMatrixWorld(true)
    body.skeleton.update()
  }
  const source = body.geometry.getAttribute('position') as THREE.BufferAttribute
  const count = source.count
  const skinned = (out: Float32Array) => {
    for (let i = 0; i < count; i += 1) {
      tmpV.fromBufferAttribute(source, i)
      body.applyBoneTransform(i, tmpV)
      out[i * 3] = tmpV.x; out[i * 3 + 1] = tmpV.y; out[i * 3 + 2] = tmpV.z
    }
    return out
  }
  const horse = (time: number, name = 'HorseIdle'): Array<[string, number]> => info.mounted ? [[name, time]] : []
  const attack = timing(info, names.attack, ATTACK_HIT)
  const attackClip = info.clips.get(names.attack)
  const times = Array.from({ length: STRIKE_FRAMES }, (_, f) => f / (STRIKE_FRAMES - 1) * 0.999)
  // 0번(기본 자세) = 대기 첫 자세
  pose([[names.idle, 0], ...horse(0)])
  const base = skinned(new Float32Array(count * 3))
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(base, 3))
  for (const key of ['normal', 'uv', 'tangent'] as const) {
    const attr = body.geometry.getAttribute(key)
    if (attr) geometry.setAttribute(key, attr.clone())
  }
  if (body.geometry.index) geometry.setIndex(body.geometry.index.clone())
  const targets: THREE.BufferAttribute[] = []
  const relative = (abs: Float32Array) => { for (let i = 0; i < abs.length; i += 1) abs[i] -= base[i]; return new THREE.BufferAttribute(abs, 3) }
  for (let f = 1; f < STRIKE_FRAMES; f += 1) {
    const clipTime = attack.start + times[f] * attack.duration * attack.scale
    pose([[names.attack, Math.min(clipTime, (attackClip?.duration ?? 1) - 1e-3)], ...horse(0)])
    targets.push(relative(skinned(new Float32Array(count * 3))))
  }
  const walkClip = info.clips.get(names.walk)
  const walkPeriod = walkClip?.duration ?? 1
  for (let f = 0; f < WALK_FRAMES; f += 1) {
    const time = f / WALK_FRAMES * walkPeriod
    pose([[names.walk, time], ...horse(time, 'HorseGallop')])
    targets.push(relative(skinned(new Float32Array(count * 3))))
  }
  geometry.morphAttributes.position = targets
  geometry.morphTargetsRelative = true
  geometry.computeBoundingSphere()
  const materials = Array.isArray(body.material) ? body.material : [body.material]
  // 재질 목록으로 그리려면 그룹이 있어야 한다(없으면 아무것도 그려지지 않는다)
  if (!geometry.groups.length) geometry.addGroup(0, geometry.index ? geometry.index.count : count, 0)
  const model: SquadModel = { geometry, materials, duration: attack.duration, times, walkFrames: WALK_FRAMES, walkPeriod }
  squadCache.set(gltf, model)
  return model
}
