// 뼈대가 온전한 모델(궁병)에 몸 기준 회전을 덧입히는 도구. 병종별 공격 자세는 battle-rig.ts가 만든다.
// 모델이 원래 가진 동작(Idle 등) 위에, "몸 기준 축으로 몇 도 돌린다"는 열쇠 자세를 시간에 따라 섞어 얹는다.
// 몸 기준 축: 모델은 +Z(앞)를 보고 +Y가 위, +X는 몸의 왼쪽이다.
import * as THREE from 'three'

type Axis = 'x' | 'y' | 'z'
/** 열쇠 자세: 뼈 이름 끝부분 → 몸 기준 [x, y, z] 회전(도) */
export interface PoseKey { t: number; r: Record<string, [number, number, number]> }

/** 회전을 얹는 뼈 순서(부모 먼저) */
const ORDER = ['Pelvis', 'Hips', 'Spine_01', 'Spine_02', 'Neck', 'Head', 'UpperArm_R', 'Forearm_R', 'Hand_R', 'UpperArm_L', 'Forearm_L', 'Hand_L', 'Thigh_L', 'Calf_L', 'Thigh_R', 'Calf_R']

const AXES: Record<Axis, THREE.Vector3> = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }
const smooth = (k: number) => k * k * (3 - 2 * k)

/** 열쇠 자세 사이를 부드럽게 섞은 각도 목록 */
export function sampleKeys(keys: PoseKey[], t: number): Map<string, number> {
  const out = new Map<string, number>()
  if (!keys.length) return out
  let a = keys[0], b = keys[keys.length - 1]
  if (t <= a.t) b = a
  else for (let i = 0; i < keys.length - 1; i += 1) if (t >= keys[i].t && t <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break }
  const k = b.t > a.t ? smooth(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)))) : 1
  for (const bone of ORDER) {
    const ra = a.r[bone], rb = b.r[bone]
    if (!ra && !rb) continue
    ;(['x', 'y', 'z'] as const).forEach((axis, i) => {
      const deg = (ra?.[i] ?? 0) * (1 - k) + (rb?.[i] ?? 0) * k
      if (Math.abs(deg) > 0.01) out.set(`${bone}|${axis}`, deg)
    })
  }
  return out
}

/** 이름 끝부분으로 뼈를 찾아 둔다(기병 모델은 ZG_ 접두어가 붙는다) */
export function findBones(root: THREE.Object3D): Map<string, THREE.Bone> {
  const bones = new Map<string, THREE.Bone>()
  root.traverse(node => {
    const bone = node as THREE.Bone
    if (!bone.isBone) return
    const name = bone.name.replace(/^ZG_/, '')
    if (!bones.has(name)) bones.set(name, bone)
  })
  return bones
}

const qRoot = new THREE.Quaternion(), qRootInv = new THREE.Quaternion(), qParent = new THREE.Quaternion(), qParentInv = new THREE.Quaternion(), qRot = new THREE.Quaternion(), axisWorld = new THREE.Vector3()
/** 뼈 순서(부모 먼저)대로 몸 기준 회전을 얹는다. 뼈 순서 = 자세 목록에 처음 나온 순서 */
export function applyLayer(root: THREE.Object3D, bones: Map<string, THREE.Bone>, angles: Map<string, number>, weight = 1): void {
  if (!angles.size || weight <= 0) return
  root.updateMatrixWorld(true)
  root.getWorldQuaternion(qRoot)
  qRootInv.copy(qRoot).invert()
  for (const [id, deg] of angles) {
    if (Math.abs(deg) < 0.01) continue
    const [name, axis] = id.split('|') as [string, Axis]
    const bone = bones.get(name)
    if (!bone || !bone.parent) continue
    axisWorld.copy(AXES[axis]).applyQuaternion(qRoot)
    bone.parent.getWorldQuaternion(qParent)
    qParentInv.copy(qParent).invert()
    // 월드 축 회전 R을 뼈 자기 좌표로: L' = P⁻¹ · R · P · L
    qRot.setFromAxisAngle(axisWorld, THREE.MathUtils.degToRad(deg * weight))
    bone.quaternion.premultiply(qParent).premultiply(qRot).premultiply(qParentInv)
    bone.updateMatrixWorld(true)
  }
}
