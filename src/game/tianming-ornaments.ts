// 천명 무장마다의 장식: 망토 · 수염 · 안대 · 투구 술 · 꿩 깃.
// 장식은 모델 좌표(기본 자세, +Z가 앞, +X가 무장의 왼쪽)로 만들고, 그 뼈의 기본 자세 기준 좌표로 옮겨 뼈에 붙인다
// → 동작(고개 · 상체 움직임)을 그대로 따라간다.
import * as THREE from 'three'
import type { TianmingLook } from './hero-style'

export interface RestFrame {
  bone: THREE.Object3D
  /** 모델 좌표 → 뼈 좌표(기본 자세) */
  toLocal: THREE.Matrix4
  /** 기본 자세에서 뼈의 모델 좌표 */
  at: THREE.Vector3
}

export interface Ornaments {
  materials: THREE.MeshStandardMaterial[]
  update(delta: number, gait: number): void
}

function attach(frame: RestFrame, object: THREE.Object3D): void {
  object.applyMatrix4(frame.toLocal)
  frame.bone.add(object)
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material)
  m.castShadow = true
  m.frustumCulled = false
  return m
}

export function buildOrnaments(look: TianmingLook, rest: Map<string, RestFrame>): Ornaments {
  const materials: THREE.MeshStandardMaterial[] = []
  const updaters: Array<(t: number, gait: number) => void> = []
  const make = (params: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial(params); materials.push(m); return m }
  const head = rest.get('Head'), top = rest.get('HeadTop_End'), chest = rest.get('Spine2')
  const H = head?.at ?? new THREE.Vector3(), T = top?.at ?? H.clone().add(new THREE.Vector3(0, 0.33, 0))
  let time = Math.random() * 10

  // 망토: 어깨에서 등 뒤로 늘어져 말 엉덩이 위로 흩날린다(달릴수록 뒤로 뜬다)
  if (look.cape !== undefined && chest) {
    const S = chest.at
    const geometry = new THREE.PlaneGeometry(0.6, 0.92, 6, 12)
    geometry.translate(0, -0.46, 0)
    const restPos = (geometry.getAttribute('position').array as Float32Array).slice()
    const material = make({ color: look.cape, roughness: 0.82, side: THREE.DoubleSide })
    const cloth = mesh(geometry, material)
    const pivot = new THREE.Group()
    pivot.add(cloth)
    const hang = new THREE.Group() // 모델 좌표의 어깨 뒤
    hang.position.set(S.x, S.y + 0.2, S.z - 0.15)
    hang.add(pivot)
    attach(chest, hang)
    updaters.push((t, gait) => {
      pivot.rotation.x = 0.5 + 0.55 * gait + Math.sin(t * 1.7) * 0.04 // +X 회전: 아래 끝이 뒤(-Z)로
      const pos = geometry.getAttribute('position') as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      const amp = 0.025 + 0.06 * gait
      for (let i = 0; i < arr.length; i += 3) {
        const down = -restPos[i + 1] // 어깨로부터 아래로(0 ~ 0.92)
        const x = restPos[i]
        arr[i + 2] = Math.sin(down * 6 - t * (3 + 5 * gait) + x * 4) * amp * (down / 0.92) - down * down * 0.12
        arr[i] = x * (1 + down * 0.35) // 아래로 갈수록 조금 넓게
      }
      pos.needsUpdate = true
      geometry.computeVertexNormals()
    })
  }

  for (const ornament of look.ornaments ?? []) {
    if (ornament === 'beard' && head) {
      // 관우의 긴 수염: 턱에서 가슴까지 내려오는 검은 수염(가닥 셋) + 콧수염
      const material = make({ color: 0x17110e, roughness: 0.85 })
      const group = new THREE.Group()
      const strand = (radius: number, length: number, x: number, z: number) => {
        const g = new THREE.ConeGeometry(radius, length, 10, 6)
        g.rotateX(Math.PI) // 끝이 아래로
        g.scale(1, 1, 0.5)
        // 아래로 갈수록 살짝 앞으로 휜다
        const p = g.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < p.count; i += 1) { const d = length / 2 - p.getY(i); p.setZ(i, p.getZ(i) + d * d * 0.22) }
        g.translate(x, -length / 2, z)
        group.add(mesh(g, material))
      }
      strand(0.058, 0.44, 0, 0)
      strand(0.03, 0.3, -0.04, -0.02)
      strand(0.03, 0.3, 0.04, -0.02)
      for (const side of [-1, 1]) {
        const tuft = new THREE.ConeGeometry(0.012, 0.1, 6)
        tuft.rotateZ(side * 2.2)
        tuft.translate(side * 0.03, 0.05, 0.02)
        group.add(mesh(tuft, material))
      }
      // 기본 자세의 턱 끝(모델 좌표): 머리 뼈보다 조금 위 · 얼굴 앞
      group.position.set(H.x, H.y + 0.035, H.z + 0.14)
      attach(head, group)
      updaters.push((t, gait) => { group.rotation.x = Math.sin(t * 2.3) * 0.03 + gait * 0.12; group.rotation.z = Math.sin(t * 1.6) * 0.03 })
    }
    if (ornament === 'eyepatch' && head) {
      // 하후돈: 왼눈 안대 + 머리를 두르는 끈
      const material = make({ color: 0x0d0c0c, roughness: 0.55, metalness: 0.1 })
      const patch = new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42)
      patch.rotateX(Math.PI / 2) // 볼록한 쪽이 앞(+Z)
      patch.scale(1.1, 0.85, 0.7)
      const mPatch = mesh(patch, material)
      mPatch.position.set(H.x + 0.035, H.y + 0.136, H.z + 0.125)
      mPatch.rotation.y = 0.25 // 얼굴 옆면을 따라
      attach(head, mPatch)
      const strap = new THREE.TorusGeometry(1, 0.05, 4, 40)
      strap.rotateX(Math.PI / 2)
      const mStrap = mesh(strap, material)
      mStrap.scale.set(0.108, 0.11, 0.13)
      mStrap.position.set(H.x, H.y + 0.16, H.z + 0.02)
      mStrap.rotation.set(0.22, 0, -0.18) // 앞은 눈 높이, 뒤는 높이(투구 아래)
      attach(head, mStrap)
    }
    if (ornament === 'plume' && top) {
      // 투구 꼭대기의 긴 술(뒤로 흘러내린다)
      const material = make({ color: look.plume ?? 0xf2f2f2, roughness: 0.9 })
      const group = new THREE.Group()
      const base = new THREE.SphereGeometry(0.035, 10, 8)
      group.add(mesh(base, make({ color: 0xc9a14a, metalness: 0.8, roughness: 0.35 })))
      const tassel = new THREE.ConeGeometry(0.075, 0.42, 10, 4, true)
      tassel.translate(0, -0.21, 0)
      const mTassel = mesh(tassel, material)
      mTassel.rotation.x = Math.PI - 0.7 // 꼭대기에서 위로 솟았다가 뒤로 늘어진다
      mTassel.position.y = 0.02
      group.add(mTassel)
      group.position.set(T.x, T.y - 0.02, T.z - 0.02)
      attach(top, group)
      updaters.push((t, gait) => { mTassel.rotation.x = Math.PI - 0.7 - gait * 0.4 + Math.sin(t * 3) * 0.06 })
    }
    if (ornament === 'pheasant' && top) {
      // 여포의 꿩 깃 두 가닥: 투구 앞에서 솟아 뒤로 크게 휘어진다
      const material = make({ color: 0x8a5a2b, roughness: 0.7, metalness: 0.05 })
      for (const side of [-1, 1]) {
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 8; i += 1) {
          const u = i / 8
          pts.push(new THREE.Vector3(side * (0.05 + 0.32 * u), 0.85 * u - 0.12 * u * u, 0.04 - 0.75 * u * u))
        }
        const curve = new THREE.CatmullRomCurve3(pts)
        const geometry = new THREE.TubeGeometry(curve, 32, 0.011, 5)
        // 끝으로 갈수록 가늘게(고리마다 중심 쪽으로 줄인다)
        const p = geometry.getAttribute('position') as THREE.BufferAttribute
        const center = new THREE.Vector3()
        for (let i = 0; i < p.count; i += 1) {
          const u = Math.floor(i / 6) / 32, k = 1 - 0.75 * u
          curve.getPointAt(u, center)
          p.setXYZ(i, center.x + (p.getX(i) - center.x) * k, center.y + (p.getY(i) - center.y) * k, center.z + (p.getZ(i) - center.z) * k)
        }
        geometry.computeVertexNormals()
        const feather = mesh(geometry, material)
        const group = new THREE.Group()
        group.add(feather)
        group.position.set(T.x + side * 0.03, T.y - 0.06, T.z + 0.06)
        attach(top, group)
        const phase = side * 0.7
        updaters.push((t, gait) => { group.rotation.x = -gait * 0.15 + Math.sin(t * 2.6 + phase) * 0.05; group.rotation.z = Math.sin(t * 2.1 + phase) * 0.06 * side })
      }
    }
  }

  return {
    materials,
    update(delta, gait) {
      time += delta
      for (const u of updaters) u(time, gait)
    },
  }
}
