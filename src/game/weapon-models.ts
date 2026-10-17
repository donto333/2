// 사용자 제공 실사풍 무기 모델(GLB).
// 원본(Tripo, 약 200만 삼각형 · 4K 텍스처)을 무기마다 수천 삼각형으로 줄이고, 색 텍스처를 꼭짓점 색으로 구워 두었다
// (scripts/weapons/build_weapons.py). 손잡이 중심이 원점, 날이 +Y, 날의 넓은 면이 XY 평면 —
// 코드로 만든 예전 무기 도형과 같은 규격이라 손 뼈 · 공격 자세 · 병사 굽기에 그대로 쓴다.
// 불러오기 전이거나 실패하면 예전 도형으로 대신한다.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { assetUrl } from '../asset-url'
import { markShared } from './gpu-shared'

/** 모델이 있는 무기 종류(창 · 활은 예전 도형) */
export type ModelWeapon = 'sword' | 'fan' | 'glaive' | 'halberd' | 'snake' | 'blade' | 'saber'

const FILES: Record<ModelWeapon, string> = {
  sword: 'sword-qinggang', // 청강검: 칼을 쓰는 무장(조조 · 주유 · 일반 무장)
  fan: 'fan-baiyu', // 백우선: 책사(제갈량 등)
  glaive: 'glaive-qinglong', // 청룡언월도: 관우 · 관평 · 관흥
  halberd: 'halberd-fangtian', // 방천화극: 여포 · 장료 · 전위
  snake: 'snake-zhangba', // 장창사모: 장비 · 장포
  blade: 'blade-yanyue', // 언월도: 허저 · 서황
  saber: 'saber-cavalry', // 기병칼: 기병 병사
}

export interface WeaponModel {
  /** 색인 도형(위치 · 노멀 · 꼭짓점 색) */
  geometry: THREE.BufferGeometry
  metalness: number
  roughness: number
}

const loaded = new Map<ModelWeapon, WeaponModel>()
let ready: Promise<void> | null = null

/** 모든 무기 모델을 한 번 불러온다(실패한 무기는 건너뛴다 — 예전 도형을 쓴다) */
export function loadWeapons(): Promise<void> {
  if (ready) return ready
  const loader = new GLTFLoader()
  ready = Promise.all((Object.keys(FILES) as ModelWeapon[]).map(kind =>
    loader.loadAsync(assetUrl(`/assets/models/weapons/${FILES[kind]}.glb`)).then(gltf => {
      let mesh: THREE.Mesh | null = null
      gltf.scene.traverse(node => { if (!mesh && (node as THREE.Mesh).isMesh) mesh = node as THREE.Mesh })
      if (!mesh) return
      const found = mesh as THREE.Mesh
      const geometry = found.geometry as THREE.BufferGeometry
      if (!geometry.getAttribute('color')) return
      const extras = (found.userData ?? {}) as { metalness?: number; roughness?: number }
      geometry.computeBoundingSphere()
      markShared(geometry) // 모든 무장 · 부대가 함께 쓴다: 전투가 바뀌어도 남긴다
      // 환경 맵이 없는 장면이라 금속감이 너무 높으면 검게 보인다: 금속감은 0.6까지만
      loaded.set(kind, { geometry, metalness: Math.min(0.6, extras.metalness ?? 0.5), roughness: Math.max(0.3, extras.roughness ?? 0.4) })
    }).catch(() => undefined),
  )).then(() => undefined)
  return ready
}

export function weaponModel(kind: string): WeaponModel | null {
  return loaded.get(kind as ModelWeapon) ?? null
}

/** 무기 재질: 꼭짓점 색 + 무기마다의 금속감 */
export function weaponMaterial(model: WeaponModel): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, metalness: model.metalness, roughness: model.roughness })
}
