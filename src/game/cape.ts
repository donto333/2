// 말 탄 무장의 망토: 어깨에서 늘어져 안장 뒤에서 말 엉덩이를 덮고 옆구리로 흘러내린다.
// 말 몸통 모양은 모델 메시에서 직접 잰다(등선 높이 · 몸통 폭). 망토는 무장과 같은 뼈대에 스키닝해
// 위쪽은 가슴 뼈를, 말에 얹힌 쪽은 말 등 · 엉덩이 뼈를 따라 움직인다(동작 중에도 떠 있거나 파고들지 않는다).
import * as THREE from 'three'
import { fabric } from './cloth-textures'

interface HorseProfile { z0: number; step: number; top: Float32Array; half: Float32Array }

const profiles = new WeakMap<THREE.BufferGeometry, HorseProfile | null>()

/** 말 등선(z마다 가장 높은 곳)과 그보다 조금 아래의 몸통 반폭 */
function horseProfile(body: THREE.SkinnedMesh): HorseProfile | null {
  const geometry = body.geometry
  if (profiles.has(geometry)) return profiles.get(geometry)!
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const skin = geometry.getAttribute('skinIndex') as THREE.BufferAttribute | undefined
  const bones = body.skeleton.bones
  const isHorse = bones.map(b => b.name.startsWith('Horse'))
  if (!skin || !isHorse.some(Boolean)) { profiles.set(geometry, null); return null }
  const z0 = -1.6, step = 0.04, n = 60
  const top = new Float32Array(n).fill(-Infinity), half = new Float32Array(n)
  const horse: number[] = []
  for (let i = 0; i < pos.count; i += 1) {
    if (!isHorse[skin.getX(i)]) continue
    horse.push(i)
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const k = Math.round((z - z0) / step)
    if (k < 0 || k >= n || Math.abs(x) > 0.12) continue
    if (y > top[k]) top[k] = y
  }
  // 안장 언저리처럼 사람 쪽 메시에 가려 배 쪽만 잡힌 칸은 버리고 이웃에서 잇는다
  let highest = -Infinity
  for (let k = 0; k < n; k += 1) if (top[k] > highest) highest = top[k]
  const valid = Array.from(top, y => Number.isFinite(y) && y > highest - 0.4)
  for (let k = 0; k < n; k += 1) {
    if (valid[k]) continue
    let lo = k - 1, hi = k + 1
    while (lo >= 0 && !valid[lo]) lo -= 1
    while (hi < n && !valid[hi]) hi += 1
    top[k] = lo >= 0 && hi < n ? top[lo] + (top[hi] - top[lo]) * (k - lo) / (hi - lo) : lo >= 0 ? top[lo] : hi < n ? top[hi] : 1.4
  }
  for (const i of horse) {
    const k = Math.round((pos.getZ(i) - z0) / step)
    if (k < 0 || k >= n || !Number.isFinite(top[k])) continue
    const y = pos.getY(i)
    if (y > top[k] - 0.32 && y < top[k] - 0.12) half[k] = Math.max(half[k], Math.abs(pos.getX(i)))
  }
  // 빈 칸은 이웃으로 채우고 살짝 고른다
  for (let k = 0; k < n; k += 1) if (!half[k]) half[k] = k ? half[k - 1] : 0.2
  const smooth = (a: Float32Array) => { const b = a.slice(); for (let k = 1; k < n - 1; k += 1) b[k] = (a[k - 1] + a[k] * 2 + a[k + 1]) / 4; return b }
  const result = { z0, step, top: smooth(top), half: smooth(half) }
  profiles.set(geometry, result)
  return result
}

function sample(a: Float32Array, p: HorseProfile, z: number): number {
  const f = THREE.MathUtils.clamp((z - p.z0) / p.step, 0, a.length - 1.001)
  const k = Math.floor(f), t = f - k
  return a[k] * (1 - t) + a[k + 1] * t
}

export interface Cape { mesh: THREE.SkinnedMesh; material: THREE.MeshPhysicalMaterial; update(t: number, gait: number): void }

/** body: 무장 모델의 스키닝 메시(말 + 사람). 말이 없으면 null */
export function buildCape(body: THREE.SkinnedMesh, color: number, trim: number): Cape | null {
  const profile = horseProfile(body)
  const skeleton = body.skeleton
  const boneIndex = (name: string) => skeleton.bones.findIndex(b => b.name === name)
  const chest = boneIndex('Spine2'), hips = boneIndex('Hips'), back = boneIndex('HorseSpine'), rump = boneIndex('HorsePelvis')
  if (!profile || chest < 0 || back < 0 || rump < 0) return null
  // 뼈의 기본 자세 위치(메시 좌표): 묶을 때의 역행렬을 되돌린 뒤 bindMatrix의 역을 곱한다
  const bindInverse = body.bindMatrix.clone().invert()
  const bonePos = (i: number) => new THREE.Vector3().setFromMatrixPosition(skeleton.boneInverses[i].clone().invert()).applyMatrix4(bindInverse)
  const S = bonePos(chest), B = bonePos(back), R = bonePos(rump)
  const top = (z: number) => sample(profile.top, profile, z)
  const halfW = (z: number) => Math.max(0.12, sample(profile.half, profile, z))

  // 1) 망토 가운데 줄: 어깨에서 아래로 내려오다 말 등에 닿으면 등선을 따라 뒤로 흐른다
  const rows = 30, cols = 20, length = 1.08, ds = length / rows, lift = 0.035
  const center: Array<{ p: THREE.Vector3; contact: number }> = []
  const p = new THREE.Vector3(S.x, S.y + 0.2, S.z - 0.13)
  let contact = 0
  for (let r = 0; r <= rows; r += 1) {
    center.push({ p: p.clone(), contact })
    const surface = top(p.z - 0.02) + lift
    if (p.y - ds * 0.97 > surface) { p.y -= ds * 0.97; p.z -= ds * 0.22 } // 늘어진다(살짝 뒤로)
    else { p.z -= ds; p.y = Math.max(top(p.z) + lift, p.y - ds * 0.3); contact = 1 } // 등을 덮는다
  }
  // 2) 가로: 늘어진 부분은 어깨 폭에서 점점 넓게, 말에 얹힌 부분은 몸통을 감싸 옆구리로 흘러내린다
  const positions: number[] = [], uvs: number[] = [], skinIndex: number[] = [], skinWeight: number[] = [], index: number[] = []
  const rest: number[] = []
  const firstContact = Math.max(1, center.findIndex(c => c.contact > 0))
  for (let r = 0; r <= rows; r += 1) {
    const v = r / rows
    const { p: c } = center[r]
    const lying = THREE.MathUtils.smoothstep(r, firstContact - 2, firstContact + 3)
    const width = 0.2 + 0.5 * v
    for (let k = 0; k <= cols; k += 1) {
      const u = k / cols, a = (u * 2 - 1) * width // 가운데로부터 천을 따라 잰 거리
      // 늘어진 부분: 평평하게 + 어깨를 감싸 양옆이 앞으로
      const hx = a, hy = c.y, hz = c.z + 0.08 * (a / 0.2) ** 2 * (1 - v) ** 2
      // 얹힌 부분: 몸통 단면(타원)을 따라 감싼다
      const W = halfW(c.z) + lift, ry = 0.36
      const R0 = Math.max(0.2, W * 1.15), maxTheta = 1.45
      const theta = THREE.MathUtils.clamp(a / R0, -maxTheta, maxTheta)
      // 몸통 위를 감싼 뒤 남는 천은 옆구리를 따라 곧게 늘어진다(밑단은 살짝 물결)
      const extra = Math.max(0, Math.abs(a) - maxTheta * R0)
      const hem = extra > 0 ? Math.sin(c.z * 9 + a * 3) * 0.02 : 0
      const lx = Math.sin(theta) * W + Math.sign(a) * extra * 0.12, ly = c.y - (1 - Math.cos(theta)) * ry - extra + hem
      const x = hx * (1 - lying) + lx * lying, y = hy * (1 - lying) + ly * lying, z = hz
      // 고르지 않은 주름
      const pleat = 0.011 * (Math.sin(u * 31 + v * 4) + 0.6 * Math.sin(u * 57 + 1.3)) * (0.3 + 0.7 * v)
      positions.push(x, y + pleat * lying, z + pleat * (1 - lying))
      rest.push(x, y + pleat * lying, z + pleat * (1 - lying), v, lying, a)
      uvs.push(u, 1 - v)
      // 뼈 가중치: 위는 가슴(→ 엉덩이), 얹힌 쪽은 말 등 → 엉덩이(위치에 따라)
      const toRump = THREE.MathUtils.clamp((B.z - z) / Math.max(0.1, B.z - R.z), 0, 1)
      const horseW = lying, riderW = 1 - lying
      const upper = THREE.MathUtils.clamp(1 - v * 3, 0, 1) // 어깨 근처는 가슴 뼈만
      skinIndex.push(chest, hips >= 0 ? hips : chest, back, rump)
      skinWeight.push(riderW * (0.4 + 0.6 * upper), riderW * (0.6 - 0.6 * upper), horseW * (1 - toRump), horseW * toRump)
    }
  }
  for (let r = 0; r < rows; r += 1) for (let k = 0; k < cols; k += 1) {
    const a = r * (cols + 1) + k, b = a + 1, d = a + cols + 1, e = d + 1
    index.push(a, d, b, b, d, e)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  const cloth = fabric({ color, trim, pleats: 7, seed: color & 0xffff })
  const material = new THREE.MeshPhysicalMaterial({
    map: cloth.map, normalMap: cloth.normalMap, normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.9, sheen: 0.55, sheenRoughness: 0.7, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3), side: THREE.DoubleSide,
  })
  const mesh = new THREE.SkinnedMesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); mesh.scale.copy(body.scale)
  body.parent?.add(mesh)
  mesh.bind(skeleton, body.bindMatrix)
  const attr = geometry.getAttribute('position') as THREE.BufferAttribute
  const arr = attr.array as Float32Array
  return {
    mesh, material,
    update(t, gait) {
      const amp = 0.008 + 0.035 * gait, speed = 2 + 5 * gait
      for (let i = 0, j = 0; i < arr.length; i += 3, j += 6) {
        const x = rest[j], y = rest[j + 1], z = rest[j + 2], v = rest[j + 3], lying = rest[j + 4], a = rest[j + 5]
        const wave = Math.sin(v * 8 - t * speed + a * 4) * amp
        // 늘어진 부분은 앞뒤로, 얹힌 부분은 끝자락과 옆단만 펄럭인다(달리면 꼬리 쪽이 들린다)
        const tail = Math.max(0, v - 0.65) * gait * 0.5
        const edge = Math.min(1, Math.abs(a) / 0.5) * lying
        arr[i] = x + wave * 0.3 * Math.sign(a) * edge
        arr[i + 1] = y + (wave * edge * 0.6 + tail * 0.35) * lying
        arr[i + 2] = z + wave * (1 - lying) * v - tail * 0.2
      }
      attr.needsUpdate = true
      geometry.computeVertexNormals()
    },
  }
}
