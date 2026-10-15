// 천명 무장마다의 장식: 망토 · 수염 · 안대 · 꿩 깃.
// 장식은 모델 좌표(기본 자세, +Z가 앞, +X가 무장의 왼쪽)로 만들고, 그 뼈의 기본 자세 기준 좌표로 옮겨 뼈에 붙인다
// → 동작(고개 · 상체 움직임)을 그대로 따라간다.
import * as THREE from 'three'
import type { TianmingLook } from './hero-style'
import { hairCard, pheasantFeather } from './cloth-textures'
import { buildCape } from './cape'

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

export function buildOrnaments(look: TianmingLook, rest: Map<string, RestFrame>, body: THREE.SkinnedMesh | null): Ornaments {
  const materials: THREE.MeshStandardMaterial[] = []
  const updaters: Array<(t: number, gait: number) => void> = []
  const make = (params: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial(params); materials.push(m); return m }
  const head = rest.get('Head'), top = rest.get('HeadTop_End')
  const H = head?.at ?? new THREE.Vector3(), T = top?.at ?? H.clone().add(new THREE.Vector3(0, 0.33, 0))
  let time = Math.random() * 10

  // 망토: 어깨에서 늘어져 말 엉덩이를 덮는다(무장과 같은 뼈대에 스키닝 — cape.ts)
  if (look.cape !== undefined && body) {
    const cape = buildCape(body, look.cape, look.capeTrim ?? 0x8c6d36)
    if (cape) { materials.push(cape.material); updaters.push((t, gait) => cape.update(t, gait)) }
  }

  for (const ornament of look.ornaments ?? []) {
    if (ornament === 'beard' && head) {
      // 관우의 긴 수염: 가는 털을 그린 반투명 카드 여러 장을 겹쳐 턱에서 가슴까지 늘어뜨린다 + 콧수염
      const material = make({ map: hairCard(0x2a2019), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.55, metalness: 0 })
      const group = new THREE.Group()
      const card = (width: number, len: number, x: number, z: number, yaw: number, bend: number) => {
        const g = new THREE.PlaneGeometry(width, len, 1, 10)
        g.translate(0, -len / 2, 0)
        const p = g.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < p.count; i += 1) { const d = -p.getY(i); p.setZ(i, d * d * bend) } // 아래로 갈수록 앞으로 휜다
        g.computeVertexNormals()
        const m = mesh(g, material)
        m.position.set(x, 0, z)
        m.rotation.y = yaw
        group.add(m)
      }
      card(0.1, 0.5, 0, 0.005, 0, 0.28)
      card(0.085, 0.44, -0.025, -0.012, 0.4, 0.24)
      card(0.085, 0.44, 0.025, -0.012, -0.4, 0.24)
      card(0.08, 0.38, 0, -0.025, 0, 0.2)
      card(0.13, 0.18, 0, 0.025, 0, 0.5) // 턱 · 볼 수염
      for (const side of [-1, 1]) { // 콧수염
        const g = new THREE.PlaneGeometry(0.075, 0.13, 1, 4)
        g.translate(0, -0.065, 0)
        const m = mesh(g, material)
        m.position.set(side * 0.018, 0.068, 0.028)
        m.rotation.set(0.15, side * 0.35, side * 0.2) // 입가를 따라 아래로 늘어진다
        group.add(m)
      }
      // 기본 자세의 턱 끝(모델 좌표): 머리 뼈보다 조금 위 · 얼굴 앞
      group.position.set(H.x, H.y + 0.035, H.z + 0.13)
      attach(head, group)
      updaters.push((t, gait) => { group.rotation.x = Math.sin(t * 2.3) * 0.025 + gait * 0.1; group.rotation.z = Math.sin(t * 1.6) * 0.02 })
    }
    if (ornament === 'eyepatch' && head) {
      // 하후돈: 왼눈 안대 + 머리를 두르는 끈
      const material = make({ color: 0x1c1510, roughness: 0.62, metalness: 0 }) // 낡은 검은 가죽
      const patch = new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42)
      patch.rotateX(Math.PI / 2) // 볼록한 쪽이 앞(+Z)
      patch.scale(1.1, 0.85, 0.7)
      const mPatch = mesh(patch, material)
      mPatch.position.set(H.x + 0.035, H.y + 0.136, H.z + 0.125)
      mPatch.rotation.y = 0.25 // 얼굴 옆면을 따라
      attach(head, mPatch)
      const strap = new THREE.TorusGeometry(1, 0.04, 4, 40)
      strap.rotateX(Math.PI / 2)
      const mStrap = mesh(strap, material)
      mStrap.scale.set(0.108, 0.11, 0.13)
      mStrap.position.set(H.x, H.y + 0.16, H.z + 0.02)
      mStrap.rotation.set(0.22, 0, -0.18) // 앞은 눈 높이, 뒤는 높이(투구 아래)
      attach(head, mStrap)
    }
    if (ornament === 'pheasant' && top) {
      // 여포의 꿩 꽁지깃 두 가닥: 투구 앞에서 솟아 뒤로 크게 휘어진다(검은 띠무늬 깃털 텍스처를 입힌 띠)
      const material = make({ map: pheasantFeather(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 })
      for (const side of [-1, 1]) {
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 8; i += 1) {
          const u = i / 8
          pts.push(new THREE.Vector3(side * (0.05 + 0.32 * u), 0.85 * u - 0.12 * u * u, 0.04 - 0.75 * u * u))
        }
        const curve = new THREE.CatmullRomCurve3(pts)
        const n = 40, positions: number[] = [], uvs: number[] = [], index: number[] = []
        const p = new THREE.Vector3(), tangent = new THREE.Vector3(), across = new THREE.Vector3()
        for (let i = 0; i <= n; i += 1) {
          const u = i / n
          curve.getPointAt(u, p); curve.getTangentAt(u, tangent)
          across.set(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize() // 깃 면은 옆으로 펼친다
          const half = 0.022 * (1 - 0.55 * u)
          positions.push(p.x - across.x * half, p.y - across.y * half, p.z - across.z * half, p.x + across.x * half, p.y + across.y * half, p.z + across.z * half)
          uvs.push(0, 1 - u, 1, 1 - u)
          if (i < n) { const a = i * 2; index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
        }
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
        geometry.setIndex(index)
        geometry.computeVertexNormals()
        const group = new THREE.Group()
        group.add(mesh(geometry, material))
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
