// 사용자 제공 실사풍 3D 모델(GLB) 불러오기·복제·동작 재생.
// 모델은 미리 크기·방향을 맞춰 두었다(모두 +Z를 보고, 발/말 몸통 중심이 원점, 사람 키 약 1.8 · 말 등 높이 약 1.45).
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { General } from './strategy'

export type ModelName = 'lubu' | 'caocao' | 'zhugeliang' | 'cavalry' | 'lancer' | 'archer' | 'battlefield'
const BASE = '/assets/models/'
const cache = new Map<ModelName, Promise<GLTF>>()
let loader: GLTFLoader | null = null

export function loadModel(name: ModelName): Promise<GLTF> {
  const cached = cache.get(name)
  if (cached) return cached
  loader ??= new GLTFLoader()
  const pending: Promise<GLTF> = loader.loadAsync(`${BASE}${name}.glb`).then((gltf: GLTF) => {
    gltf.scene.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = name === 'battlefield'
      mesh.frustumCulled = false
      const material = mesh.material as THREE.MeshStandardMaterial
      if (material?.map) material.map.anisotropy = 4
    })
    return gltf
  })
  pending.catch(() => cache.delete(name))
  cache.set(name, pending)
  return pending
}

/** 무장에게 어울리는 모델: 여포·조조·제갈량은 전용, 그 밖에는 병종별 장수 모델 */
export function heroModelFor(general: General): ModelName {
  if (general.id === 'lu-bu') return 'lubu'
  if (general.id === 'cao-cao') return 'caocao'
  if (general.id === 'zhuge-liang') return 'zhugeliang'
  if (general.role === '책사') return 'zhugeliang'
  if (general.role === '궁병') return 'archer'
  if (general.role === '보병') return 'lancer'
  return 'cavalry'
}

export function troopModelFor(role: General['role']): ModelName {
  if (role === '기병') return 'cavalry'
  if (role === '궁병') return 'archer'
  return 'lancer'
}

export type HeroAction = 'Idle' | 'Walk' | 'Gallop' | 'Attack' | 'Skill'

/** 동작이 붙은 무장 한 명(뼈대째 복제) */
export class AnimatedHero {
  readonly root: THREE.Object3D
  private readonly mixer: THREE.AnimationMixer
  private readonly actions = new Map<string, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null
  private oneShotUntil = 0
  private time = 0
  readonly materials: THREE.MeshStandardMaterial[] = []

  constructor(gltf: GLTF) {
    this.root = cloneSkinned(gltf.scene)
    this.root.traverse(node => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      // 피격 번쩍임을 무장마다 따로 주기 위해 재질을 복제한다
      const material = (mesh.material as THREE.MeshStandardMaterial).clone()
      mesh.material = material
      this.materials.push(material)
      mesh.castShadow = true
      mesh.frustumCulled = false
    })
    this.mixer = new THREE.AnimationMixer(this.root)
    gltf.animations.forEach(clip => this.actions.set(clip.name, this.mixer.clipAction(clip)))
    this.play('Idle', 0)
  }

  has(name: HeroAction): boolean { return this.actions.has(name) }

  play(name: HeroAction, fade = 0.25): void {
    const next = this.actions.get(name) ?? this.actions.get('Idle')
    if (!next || next === this.current) return
    next.reset().setEffectiveWeight(1).fadeIn(fade).play()
    this.current?.fadeOut(fade)
    this.current = next
  }

  /** 공격·스킬처럼 한 번 재생하고 원래 동작으로 돌아가는 동작 */
  playOnce(name: HeroAction): void {
    const action = this.actions.get(name) ?? this.actions.get('Attack')
    if (!action) return
    action.reset().setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = false
    this.current?.fadeOut(0.12)
    action.fadeIn(0.12).play()
    this.current = action
    this.oneShotUntil = this.time + action.getClip().duration * 0.92
  }

  /** moving: 이동 중이면 걷기(말은 질주) */
  update(delta: number, moving: boolean, mounted: boolean): void {
    this.time += delta
    if (this.time >= this.oneShotUntil) this.play(moving ? (mounted && this.has('Gallop') ? 'Gallop' : 'Walk') : 'Idle')
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

  /** 동작 재생 속도(슬로모션·배속) */
  setTimeScale(scale: number): void {
    this.mixer.timeScale = scale
  }
}

/**
 * 병사용: 뼈대 모델의 한 순간 자세를 굳힌 정적 도형 + 원래 재질.
 * 부대 하나를 InstancedMesh 한 번으로 그리기 위해 쓴다(수십 명을 움직이는 뼈대 대신).
 */
const bakedCache = new Map<ModelName, Promise<{ geometry: THREE.BufferGeometry; material: THREE.Material }>>()
export function bakedTroop(name: ModelName): Promise<{ geometry: THREE.BufferGeometry; material: THREE.Material }> {
  const cached = bakedCache.get(name)
  if (cached) return cached
  {
    const pending: Promise<{ geometry: THREE.BufferGeometry; material: THREE.Material }> = loadModel(name).then(gltf => {
      const scene = cloneSkinned(gltf.scene)
      const mixer = new THREE.AnimationMixer(scene)
      const idle = gltf.animations.find(clip => clip.name === 'Idle') ?? gltf.animations[0]
      if (idle) { mixer.clipAction(idle).play(); mixer.update(0.4) }
      scene.updateMatrixWorld(true)
      let skinned: THREE.SkinnedMesh | null = null
      scene.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh && !skinned) skinned = node as THREE.SkinnedMesh })
      if (!skinned) throw new Error(`no skinned mesh in ${name}`)
      const mesh = skinned as THREE.SkinnedMesh
      mesh.skeleton.update()
      const source = mesh.geometry
      const geometry = new THREE.BufferGeometry()
      const pos = source.getAttribute('position')
      const nor = source.getAttribute('normal')
      const out = new Float32Array(pos.count * 3)
      const outN = new Float32Array(pos.count * 3)
      const v = new THREE.Vector3(), w = new THREE.Vector3()
      const world = mesh.matrixWorld
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i)
        mesh.applyBoneTransform(i, v)
        v.applyMatrix4(world)
        out.set([v.x, v.y, v.z], i * 3)
        if (nor) {
          w.fromBufferAttribute(pos, i).addScaledVector(new THREE.Vector3().fromBufferAttribute(nor, i), 0.01)
          mesh.applyBoneTransform(i, w)
          w.applyMatrix4(world).sub(v).normalize()
          outN.set([w.x, w.y, w.z], i * 3)
        }
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(out, 3))
      if (nor) geometry.setAttribute('normal', new THREE.BufferAttribute(outN, 3))
      const uv = source.getAttribute('uv')
      if (uv) geometry.setAttribute('uv', uv)
      if (source.index) geometry.setIndex(source.index)
      geometry.computeBoundingSphere()
      const material = (mesh.material as THREE.MeshStandardMaterial).clone()
      return { geometry, material }
    })
    pending.catch(() => bakedCache.delete(name))
    bakedCache.set(name, pending)
    return pending
  }
}
