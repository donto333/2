import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { mountRider } from '/app/src/game/rider-models.js'
const loader = new GLTFLoader()
const draco = new DRACOLoader(); draco.setDecoderPath('/assets/draco/'); loader.setDRACOLoader(draco)
const strip = name => name.replace(/^mixamorig:?/, '')
async function load(url) { const g = await loader.loadAsync(url); g.scene.updateMatrixWorld(true); let m = null; g.scene.traverse(n => { if (n.isSkinnedMesh && !m && !n.userData.rider) m = n }); let plain = null; g.scene.traverse(n => { if (n.isMesh && !plain) plain = n }); return { g, m, plain } }
function joints(mesh, rest = false) {
  const out = new Map()
  if (rest) for (const bone of mesh.skeleton.bones) { let top = bone; while (top.parent) top = top.parent; top.updateMatrixWorld(true) }
  // rest: 지금 놓인 뼈 위치(원본 모델) — 역바인드 행렬이 메시와 돌아가 있는 파일도 있어서 실제 보이는 자세를 기준으로 한다
  mesh.skeleton.bones.forEach((bone, i) => { const w = rest ? bone.matrixWorld : new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert(); out.set(strip(bone.name), { i, pos: new THREE.Vector3().setFromMatrixPosition(w) }) })
  return out
}
/** 원본 메시를 지금 뼈 자세로 스키닝한 위치 · 법선(월드) */
function restSkin(mesh) {
  const geo = mesh.geometry, pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight')
  mesh.skeleton.update()
  const mats = mesh.skeleton.bones.map((bone, i) => new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix))
  const P = [], N = [], m = new THREE.Matrix4(), v = new THREE.Vector3(), n = new THREE.Vector3()
  for (let k = 0; k < pos.count; k++) {
    const e = new Float32Array(16)
    for (let c = 0; c < 4; c++) { const w = sw.getComponent(k, c); if (!w) continue; const me = mats[si.getComponent(k, c)].elements; for (let t = 0; t < 16; t++) e[t] += me[t] * w }
    m.fromArray(e)
    P.push(v.fromBufferAttribute(pos, k).applyMatrix4(m).clone())
    N.push(n.fromBufferAttribute(nor, k).applyMatrix3(new THREE.Matrix3().setFromMatrix4(m)).normalize().clone())
  }
  return { P, N }
}
// 방향(뼈 → 자식): 몸통은 두 축으로 맞춘다
const CHILD = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End' }
for (const s of ['Left', 'Right']) {
  Object.assign(CHILD, { [`${s}Shoulder`]: `${s}Arm`, [`${s}Arm`]: `${s}ForeArm`, [`${s}ForeArm`]: `${s}Hand`, [`${s}Hand`]: `${s}HandMiddle1`, [`${s}UpLeg`]: `${s}Leg`, [`${s}Leg`]: `${s}Foot`, [`${s}Foot`]: `${s}ToeBase`, [`${s}ToeBase`]: `${s}Toe_End` })
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (let k = 1; k < 4; k++) CHILD[`${s}Hand${f}${k}`] = `${s}Hand${f}${k + 1}`
}
const TORSO = new Set(['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'])
function basis(a, b) { const x = a.clone().normalize(); const z = new THREE.Vector3().crossVectors(x, b).normalize(); const y = new THREE.Vector3().crossVectors(z, x); return new THREE.Matrix4().makeBasis(x, y, z) }
function rotations(src, dst) {
  const R = new Map()
  const lat = (J, name) => name === 'Hips' || name === 'Spine' ? J.get('LeftUpLeg').pos.clone().sub(J.get('RightUpLeg').pos) : J.get('LeftShoulder').pos.clone().sub(J.get('RightShoulder').pos)
  for (const [name] of src) {
    if (!dst.has(name)) continue
    const child = CHILD[name]
    if (!child || !src.has(child) || !dst.has(child)) continue
    const ds = src.get(child).pos.clone().sub(src.get(name).pos), dt = dst.get(child).pos.clone().sub(dst.get(name).pos)
    let q
    if (TORSO.has(name)) { const m = basis(dt, lat(dst, name)).multiply(basis(ds, lat(src, name)).transpose()); q = new THREE.Quaternion().setFromRotationMatrix(m) }
    else q = new THREE.Quaternion().setFromUnitVectors(ds.normalize(), dt.normalize())
    R.set(name, q)
  }
  return R
}
const PARENT = {}
for (const [p, c] of Object.entries(CHILD)) PARENT[c] = p
for (const s of ['Left', 'Right']) { PARENT[`${s}Shoulder`] = 'Spine2'; PARENT[`${s}UpLeg`] = 'Hips'; for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) PARENT[`${s}Hand${f}1`] = `${s}Hand` }
function rotOf(R, name) { let n = name; while (n && !R.has(n)) n = PARENT[n]; return R.get(n) ?? new THREE.Quaternion() }

/** 원본(T자세 · mixamo 뼈)을 기마 모델 기수 자세로 굽고 기마 뼈 번호로 다시 묶는다 */
function bake(source, donor, host) {
  const src = joints(donor ?? source.m)
  // 어떤 파일은 역바인드 뼈대가 메시와 Y축으로 돌아가 있다: 왼손→오른손이 +X가 되게 뼈 위치를 돌려 맞춘다
  const lr = src.get('LeftHand').pos.clone().sub(src.get('RightHand').pos)
  const yaw = Math.atan2(-lr.z, lr.x)
  if (Math.abs(yaw) > 0.2) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw); const c = src.get('Hips').pos.clone(); for (const j of src.values()) j.pos.sub(c).applyQuaternion(q).add(c); console.log('yaw fix', yaw.toFixed(2)) }
  const rest = null
  const dst = joints(host)
  const geo = (source.m ?? source.plain).geometry
  const srcBind = (source.m ?? source.plain).matrixWorld.clone()
  if (source.m) srcBind.copy(source.m.bindMatrix)
  const R = rotations(src, dst)
  const s = dst.get('Hips').pos.distanceTo(dst.get('Neck').pos) / src.get('Hips').pos.distanceTo(src.get('Neck').pos)
  const names = [...src.keys()]
  const byIndex = names.map(name => ({ name, rot: rotOf(R, name), js: src.get(name).pos, jt: dst.get(name)?.pos ?? dst.get(PARENT[name] ?? 'Hips').pos, ti: (dst.get(name) ?? dst.get(PARENT[name]) ?? dst.get('Hips')).i }))
  // 원본 뼈 번호 → 이름
  const srcSkin = donor ?? source.m
  const indexToSrc = srcSkin.skeleton.bones.map(b => byIndex.find(e => e.name === strip(b.name)))
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), uv = geo.getAttribute('uv')
  let sIdx = geo.getAttribute('skinIndex'), sW = geo.getAttribute('skinWeight')
  const n = pos.count
  let wIdx = new Uint16Array(n * 4), wVal = new Float32Array(n * 4)
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3)
  const world = new THREE.Vector3(), nv = new THREE.Vector3(), acc = new THREE.Vector3(), accN = new THREE.Vector3(), tmp = new THREE.Vector3()
  const nm = new THREE.Matrix3().getNormalMatrix(srcBind)
  // 뼈대 없는 모델: 비슷한 모델(donor)의 가장 가까운 점에서 가중치를 빌린다
  let borrow = null
  if (donor) {
    const dg = donor.geometry, dp = dg.getAttribute('position'), dbm = donor.bindMatrix
    const pts = []; for (let i = 0; i < dp.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(dp, i).applyMatrix4(dbm))
    const cell = 0.02, grid = new Map(); const key = (x, y, z) => `${x},${y},${z}`
    pts.forEach((p, i) => { const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell)); (grid.get(k) ?? grid.set(k, []).get(k)).push(i) })
    borrow = v => { const cx = Math.floor(v.x / cell), cy = Math.floor(v.y / cell), cz = Math.floor(v.z / cell); let best = -1, bd = Infinity; for (let r = 1; r < 8 && best < 0; r++) for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) for (const i of grid.get(key(cx + x, cy + y, cz + z)) ?? []) { const d = pts[i].distanceToSquared(v); if (d < bd) { bd = d; best = i } } return best }
    sIdx = dg.getAttribute('skinIndex'); sW = dg.getAttribute('skinWeight')
  }
  const hostInv = host.bindMatrixInverse
  const hostNm = new THREE.Matrix3().getNormalMatrix(hostInv)
  for (let v = 0; v < n; v++) {
    if (rest) { world.copy(rest.P[v]); nv.copy(rest.N[v]) }
    else { world.fromBufferAttribute(pos, v).applyMatrix4(srcBind); nv.fromBufferAttribute(nor, v).applyMatrix3(nm).normalize() }
    const from = borrow ? borrow(world) : v
    acc.set(0, 0, 0); accN.set(0, 0, 0)
    const slots = new Map()
    for (let k = 0; k < 4; k++) {
      const w = sW.getComponent(from, k); if (w <= 0) continue
      const e = indexToSrc[sIdx.getComponent(from, k)]; if (!e) continue
      tmp.copy(world).sub(e.js).multiplyScalar(s).applyQuaternion(e.rot).add(e.jt)
      acc.addScaledVector(tmp, w)
      accN.addScaledVector(tmp.copy(nv).applyQuaternion(e.rot), w)
      slots.set(e.ti, (slots.get(e.ti) ?? 0) + w)
    }
    acc.applyMatrix4(hostInv); accN.applyMatrix3(hostNm).normalize()
    P.set([acc.x, acc.y, acc.z], v * 3); N.set([accN.x, accN.y, accN.z], v * 3)
    const list = [...slots.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); const total = list.reduce((t, e) => t + e[1], 0) || 1
    list.forEach(([ti, w], k) => { wIdx[v * 4 + k] = ti; wVal[v * 4 + k] = w / total })
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(P, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3))
  out.setAttribute('uv', uv.clone())
  out.setAttribute('skinIndex', new THREE.BufferAttribute(wIdx, 4))
  out.setAttribute('skinWeight', new THREE.BufferAttribute(wVal, 4))
  out.setIndex(geo.index.clone())
  out.computeBoundingSphere()
  return out
}
const b64 = arr => { const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s) }

window.__bake = async (file, donorFile, opts = {}) => {
  const host = await load('/assets/models/cavalry.glb')
  const source = await load(`/up/${file}`)
  const donor = donorFile ? (await load(`/up/${donorFile}`)).m : null
  // 뼈 가중치가 망가진 파일(전부 엉덩이뼈 등): 뼈대 없는 모델처럼 donor에서 가중치를 빌린다
  if (donor && source.m) source.m = null
  const geo = bake(source, source.m ? null : donor, host.m)
  window.__last = { geo, material: (source.m ?? source.plain).material, host }
  return { count: geo.getAttribute('position').count, index: geo.index.count, P: b64(geo.getAttribute('position').array), N: b64(geo.getAttribute('normal').array), U: b64(geo.getAttribute('uv').array), J: b64(geo.getAttribute('skinIndex').array), W: b64(geo.getAttribute('skinWeight').array), I: b64(geo.index.array instanceof Uint32Array ? geo.index.array : new Uint32Array(geo.index.array)) }
}

// 확인: 기마 모델에 태워 동작 재생 · 찍기
window.__view = async (clipName = 'MountedIdle', t = 0.5, ry = 0.9, W = 520, H = 520) => {
  const { geo, material } = window.__last
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x3a3a44)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2)); const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(3, 5, 6); scene.add(sun)
  const host = await load('/assets/models/cavalry.glb')
  const root = host.g.scene; root.rotation.y = ry; scene.add(root)
  mountRider(root, { parts: [{ geometry: geo, material }] })
  const mixer = new THREE.AnimationMixer(root)
  const clip = host.g.animations.find(c => c.name === clipName)
  if (clip) { mixer.clipAction(clip).play(); mixer.update(t) }
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root); const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3())
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 200); const d = Math.max(size.x, size.y, size.z) * 1.9
  cam.position.set(c.x, c.y + size.y * 0.15, c.z + d); cam.lookAt(c)
  renderer.render(scene, cam)
  return true
}
