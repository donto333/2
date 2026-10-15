// 사용자 제공 실사풍 3D 모델(GLB) 불러오기·복제·동작 재생.
// 모델은 미리 크기·방향을 맞춰 두었다(모두 +Z를 보고, 발/말 몸통 중심이 원점, 사람 키 약 1.8 · 말 등 높이 약 1.45).
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { General } from './strategy'
import { SIGNATURE_WEAPONS, STRIKE_FRAMES, strikeInfluences, strikeModel, type SignatureWeapon, type StrikeKind, type StrikeModel } from './battle-rig'
import { bakeSquadModel, rigInfo } from './skeletal'
import { heroLook } from './hero-style'

export type ModelName = 'lubu' | 'caocao' | 'zhugeliang' | 'cavalry' | 'tianming' | 'lancer' | 'archer' | 'battlefield'
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

/** 무장에게 어울리는 모델: 모든 무장은 말을 탄다(여포·조조·제갈량은 전용, 천명 무장은 저마다의 모습 — hero-style.ts) */
export function heroModelFor(general: General): ModelName {
  return heroLook(general).model
}

const skins = new Map<string, Promise<THREE.Texture>>()
/** 무장 전용 의상 텍스처(모델 텍스처와 같은 UV 배치) */
export function loadSkin(name: string): Promise<THREE.Texture> {
  const cached = skins.get(name)
  if (cached) return cached
  const pending = new THREE.TextureLoader().loadAsync(`${BASE}skins/${name}.jpg`).then(texture => {
    texture.flipY = false // glTF 텍스처와 같은 방향
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
  })
  pending.catch(() => skins.delete(name))
  skins.set(name, pending)
  return pending
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
export function preloadStrikeModels(names: ModelName[] = ['lancer', 'cavalry', 'archer', 'lubu', 'caocao', 'zhugeliang', 'tianming']): void {
  let index = 0
  const idle = (run: () => void) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 3000 }); else window.setTimeout(run, 400)
  }
  const next = () => {
    const name = names[index++]
    if (!name) return
    // 뼈대 모델: 병사용 자세(공격·걷기)를 미리 굽는다. 예전 모델은 예전처럼 공격 자세를 굽는다
    void loadModel(name).then(gltf => { if (rigInfo(gltf)) { if (name === 'lancer' || name === 'cavalry' || name === 'archer') bakeSquadModel(gltf) } else return strikeModelFor(name) }).catch(() => {}).finally(() => idle(next))
  }
  idle(next)
}

/** 모델 하나의 병종별 공격 자세 묶음(불러온 뒤 한 번만 굽는다) */
export function strikeModelFor(name: ModelName, weapon?: SignatureWeapon): Promise<StrikeModel> {
  return loadModel(name).then(gltf => strikeModel(name, gltf, weapon))
}

/** 무장 모델 + 고유 무기(관우 청룡언월도, 장비 장팔사모 등) */
export function heroStrikeModel(general: General): Promise<StrikeModel> {
  return strikeModelFor(heroModelFor(general), SIGNATURE_WEAPONS[general.id])
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
  private readonly times: number[]

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
    this.times = model.times
    this.hitTime = model.duration * model.hit
  }

  has(name: HeroAction): boolean { return name !== 'Skill' || this.kind !== 'shoot' }

  play(_name: HeroAction): void { /* 걷기·서 있기는 update에서 몸 흔들림으로 표현한다 */ }

  /** 공격·스킬: 병종별 공격 자세를 처음부터 재생 */
  playOnce(_name: HeroAction): void {
    this.strikeAge = 0
  }

  private stride = Math.random() * Math.PI * 2

  /** gait: 0 서 있음 ~ 1 걷기·질주(섞어서 뚝 바뀌지 않게) */
  update(delta: number, gait: number | boolean, mounted: boolean): void {
    this.time += delta
    if (this.strikeAge >= 0) {
      this.strikeAge += delta
      if (this.strikeAge >= this.duration) this.strikeAge = -1
    }
    strikeInfluences(this.strikeAge < 0 ? -1 : this.strikeAge / this.duration, this.influences, this.times)
    const g = Math.min(1, Math.max(0, Number(gait)))
    const t = this.time
    // 걸음 위상은 누적한다(빠르기가 바뀌어도 걸음이 튀지 않게)
    this.stride += delta * (mounted ? 8 : 7) * (0.75 + 0.25 * g)
    const step = this.stride
    // 걷기·질주: 발이 닿을 때마다 위아래로. 말은 앞뒤로 흔들리는데 위아래보다 1/4박자 늦다(겹침 동작)
    const walkY = Math.abs(Math.sin(step)) * (mounted ? 0.12 : 0.06)
    const walkPitch = mounted ? Math.sin(step * 2 - Math.PI / 2) * 0.04 : Math.sin(step * 2) * 0.01
    const walkRoll = mounted ? 0 : Math.sin(step) * 0.02
    // 서 있기: 숨쉬기(살짝 부풀었다 가라앉음) + 아주 느리게 무게를 이쪽저쪽으로 옮긴다
    const idleY = Math.sin(t * 1.8) * 0.012
    const idleRoll = Math.sin(t * 0.55 + 1.3) * 0.012
    this.mesh.position.y = walkY * g + idleY * (1 - g)
    this.mesh.rotation.x = walkPitch * g
    this.mesh.rotation.z = walkRoll * g + idleRoll * (1 - g)
    this.mesh.scale.set(1, 1 + Math.sin(t * 1.8 + 0.5) * 0.006 * (1 - g), 1)
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
