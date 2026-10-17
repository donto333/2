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
    if ((ornament === 'beard' || ornament === 'whiteBeard' || ornament === 'shortBeard') && head) {
      // 긴 수염(관우 · 장각) · 흰 긴 수염(황충 · 정욱) · 짧고 덥수룩한 수염(장비 · 전위 …)
      // 가는 털을 그린 반투명 카드 여러 장을 겹쳐 턱에서 늘어뜨린다 + 콧수염
      const short = ornament === 'shortBeard'
      // 짧은 수염은 털 끝이 성글게 보이도록 알파 기준을 높이고 카드를 좁게
      const material = make({ map: hairCard(ornament === 'whiteBeard' ? 0xcfcac2 : 0x2a2019, short ? 5 : 3), alphaTest: short ? 0.58 : 0.42, side: THREE.DoubleSide, roughness: 0.55, metalness: 0 })
      const k = short ? 0.5 : 1
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
      card(0.075, 0.36 * k, 0, 0.005, 0, 0.3)
      card(0.06, 0.3 * k, -0.022, -0.01, 0.4, 0.26)
      card(0.06, 0.3 * k, 0.022, -0.01, -0.4, 0.26)
      // 얼굴(입 · 콧수염 · 턱수염 윗부분)은 초상화 얼굴 그림이 그린다 → 털 카드는 턱 아래로 늘어지는 부분만
      // 기본 자세의 턱 끝(모델 좌표): 머리 뼈보다 조금 위 · 얼굴 앞
      group.position.set(H.x, H.y + 0.012, H.z + 0.115)
      attach(head, group)
      updaters.push((t, gait) => { group.rotation.x = Math.sin(t * 2.3) * 0.025 + gait * 0.1; group.rotation.z = Math.sin(t * 1.6) * 0.02 })
    }
    if (ornament === 'headband' && head) {
      // 황건 장수의 노란 두건: 이마를 두르고 뒤로 매듭 · 늘어진 끝자락
      const material = make({ color: 0xc9a020, roughness: 0.8, metalness: 0, side: THREE.DoubleSide })
      const band = new THREE.TorusGeometry(1, 0.06, 6, 40)
      band.rotateX(Math.PI / 2)
      const mBand = mesh(band, material)
      mBand.scale.set(0.112, 0.16, 0.134)
      mBand.position.set(H.x, H.y + 0.19, H.z + 0.015)
      mBand.rotation.set(0.12, 0, 0)
      attach(head, mBand)
      const tails = new THREE.Group()
      for (const side of [-1, 1]) {
        const g = new THREE.PlaneGeometry(0.05, 0.22, 1, 6)
        g.translate(0, -0.11, 0)
        const m = mesh(g, material)
        m.rotation.set(0.35, 0, side * 0.25)
        m.position.x = side * 0.02
        tails.add(m)
      }
      tails.position.set(H.x, H.y + 0.18, H.z - 0.12)
      attach(head, tails)
      updaters.push((t, gait) => { tails.rotation.x = 0.2 + gait * 0.5 + Math.sin(t * 3.1) * 0.08 })
    }
    if (ornament === 'hairBun' && head) {
      // 여성 무장: 틀어 올린 머리(뒤통수 위 쪽진 머리 두 덩이) + 금비녀 · 옥 장식
      const hair = make({ color: 0x15110f, roughness: 0.5, metalness: 0 })
      const gold = make({ color: 0xc9a050, roughness: 0.35, metalness: 0.9 })
      const jade = make({ color: 0x3f8a6a, roughness: 0.3, metalness: 0.1 })
      const group = new THREE.Group()
      const bun = mesh(new THREE.SphereGeometry(1, 20, 14), hair)
      bun.scale.set(0.085, 0.07, 0.08); bun.position.set(0, 0, 0)
      group.add(bun)
      const top = mesh(new THREE.SphereGeometry(1, 16, 12), hair)
      top.scale.set(0.055, 0.05, 0.055); top.position.set(0, 0.065, 0.015)
      group.add(top)
      // 비녀: 쪽 머리를 옆으로 꿰뚫고, 양 끝에 옥 구슬
      const pinGroup = new THREE.Group()
      const pin = mesh(new THREE.CylinderGeometry(0.005, 0.004, 0.22, 6), gold)
      pin.rotation.z = Math.PI / 2
      pinGroup.add(pin)
      for (const side of [-1, 1]) {
        const bead = mesh(new THREE.SphereGeometry(0.014, 10, 8), jade)
        bead.position.set(side * 0.112, 0, 0)
        pinGroup.add(bead)
      }
      pinGroup.rotation.z = -0.3
      pinGroup.position.set(0, 0.02, 0.01)
      group.add(pinGroup)
      group.position.set(H.x, H.y + 0.25, H.z - 0.075)
      group.rotation.x = -0.5
      attach(head, group)
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
