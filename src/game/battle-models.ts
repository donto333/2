// 사용자 제공 실사풍 3D 모델(GLB) 불러오기·복제·동작 재생.
// 모델은 미리 크기·방향을 맞춰 두었다(모두 +Z를 보고, 발/말 몸통 중심이 원점, 사람 키 약 1.8 · 말 등 높이 약 1.45).
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { General } from './strategy'
import { STRIKE_FRAMES, strikeInfluences, strikeModel, type StrikeKind, type StrikeModel } from './battle-rig'

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

/**
 * 첫 전투에서 멈칫하지 않도록 본영 화면에 있을 때 모델을 하나씩 미리 불러와 굽는다.
 * 굽기는 메인 스레드를 잠깐 쓰므로 모델 사이에 쉬는 틈을 둔다.
 */
export function preloadStrikeModels(names: ModelName[] = ['lancer', 'cavalry', 'archer', 'lubu', 'caocao', 'zhugeliang']): void {
  let index = 0
  const idle = (run: () => void) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 3000 }); else window.setTimeout(run, 400)
  }
  const next = () => {
    const name = names[index++]
    if (!name) return
    void strikeModelFor(name).catch(() => {}).finally(() => idle(next))
  }
  idle(next)
}

/** 모델 하나의 병종별 공격 자세 묶음(불러온 뒤 한 번만 굽는다) */
export function strikeModelFor(name: ModelName): Promise<StrikeModel> {
  return loadModel(name).then(gltf => strikeModel(name, gltf))
}

/**
 * 무장 한 명: 미리 구운 공격 자세(모프)를 재생한다.
 * 받은 모델은 뼈대와 메시가 어긋나 있어 원래 동작 대신 몸 전체의 흔들림·말 걸음은 직접 준다.
 */
export class AnimatedHero {
  readonly root = new THREE.Group()
  readonly materials: THREE.MeshStandardMaterial[] = []
  private readonly mesh: THREE.Mesh
  private readonly influences: number[]
  private strikeAge = -1
  private time = Math.random() * 10
  readonly kind: StrikeKind
  /** 공격 시작부터 무기가 닿거나 화살이 떠나기까지(초) */
  readonly hitTime: number
  private readonly duration: number

  constructor(model: StrikeModel) {
    const materials = model.materials.map(material => material.clone())
    materials.forEach(material => { if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) this.materials.push(material as THREE.MeshStandardMaterial) })
    this.mesh = new THREE.Mesh(model.geometry, materials)
    this.mesh.castShadow = true
    this.mesh.frustumCulled = false
    this.influences = new Array(STRIKE_FRAMES - 1).fill(0)
    this.mesh.morphTargetInfluences = this.influences
    this.root.add(this.mesh)
    this.kind = model.kind
    this.duration = model.duration
    this.hitTime = model.duration * model.hit
  }

  has(name: HeroAction): boolean { return name !== 'Skill' || this.kind !== 'shoot' }

  play(_name: HeroAction): void { /* 걷기·서 있기는 update에서 몸 흔들림으로 표현한다 */ }

  /** 공격·스킬: 병종별 공격 자세를 처음부터 재생 */
  playOnce(_name: HeroAction): void {
    this.strikeAge = 0
  }

  update(delta: number, moving: boolean, mounted: boolean): void {
    this.time += delta
    if (this.strikeAge >= 0) {
      this.strikeAge += delta
      if (this.strikeAge >= this.duration) this.strikeAge = -1
    }
    strikeInfluences(this.strikeAge < 0 ? -1 : this.strikeAge / this.duration, this.influences)
    // 서 있을 때는 숨쉬기, 움직일 때는 걸음(말은 질주)에 맞춰 위아래로
    const t = this.time
    if (moving) {
      this.mesh.position.y = mounted ? Math.abs(Math.sin(t * 8)) * 0.12 : Math.abs(Math.sin(t * 7)) * 0.06
      this.mesh.rotation.x = mounted ? Math.sin(t * 8) * 0.035 : 0
    } else {
      this.mesh.position.y = Math.sin(t * 1.8) * 0.012
      this.mesh.rotation.x = 0
    }
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
