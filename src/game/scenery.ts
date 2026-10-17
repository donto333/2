// 전장 배경 소품을 실사 톤으로: 도형(원뿔 · 각진 돌)이 아니라 손으로 그린 질감 · 울퉁불퉁한 표면 · 공기 원근으로.
// 외부 파일 없이 캔버스로 그리고 도형을 직접 만든다.
import * as THREE from 'three'

function rand(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

function painted(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** 소나무 한 그루를 그린 그림(투명 배경): 줄기 + 층층이 처진 가지 덩어리, 왼쪽 위에서 빛 */
function pineTexture(seed: number): THREE.CanvasTexture {
  return painted(256, 512, ctx => {
    const r = rand(seed)
    const W = 256, H = 512, cx = W / 2
    // 줄기
    const trunk = ctx.createLinearGradient(cx - 10, 0, cx + 10, 0)
    trunk.addColorStop(0, '#5a4030'); trunk.addColorStop(0.5, '#3a281c'); trunk.addColorStop(1, '#1e140e')
    ctx.fillStyle = trunk
    ctx.beginPath(); ctx.moveTo(cx - 9, H); ctx.lineTo(cx - 4, 40); ctx.lineTo(cx + 4, 40); ctx.lineTo(cx + 9, H); ctx.fill()
    // 가지 덩어리: 아래가 넓고 위로 갈수록 좁다. 끝은 들쭉날쭉한 바늘잎
    const layers = 11
    for (let k = 0; k < layers; k += 1) {
      const t = k / (layers - 1)
      const y = H * 0.9 - t * H * 0.82
      const half = (1 - t * 0.86) * W * 0.46 * (0.85 + r() * 0.3)
      const droop = 26 + (1 - t) * 30
      for (const side of [-1, 1]) {
        const g = ctx.createLinearGradient(cx - half, y - 30, cx + half, y + droop)
        const lit = side < 0 ? 1 : 0.55
        g.addColorStop(0, `rgb(${Math.round(52 * lit + 14)},${Math.round(74 * lit + 18)},${Math.round(40 * lit + 12)})`)
        g.addColorStop(1, `rgb(${Math.round(20 * lit + 8)},${Math.round(32 * lit + 10)},${Math.round(20 * lit + 8)})`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(cx, y - 34)
        const steps = 14
        for (let i = 0; i <= steps; i += 1) {
          const u = i / steps
          const px = cx + side * half * u
          const py = y - 34 + (droop + 34) * Math.pow(u, 0.8) + (i % 2 ? -8 - r() * 10 : r() * 6)
          ctx.lineTo(px, py)
        }
        ctx.lineTo(cx + side * half * 0.6, y + droop * 0.55)
        ctx.lineTo(cx, y + 6)
        ctx.closePath(); ctx.fill()
      }
      // 바늘잎 결
      ctx.strokeStyle = 'rgba(120,150,90,.18)'
      ctx.lineWidth = 1
      for (let i = 0; i < 30; i += 1) {
        const px = cx + (r() - 0.5) * half * 1.8, py = y - 20 + r() * (droop + 10)
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (r() - 0.5) * 10, py + 6 + r() * 6); ctx.stroke()
      }
    }
    // 꼭대기
    ctx.fillStyle = '#2c3c24'
    ctx.beginPath(); ctx.moveTo(cx, 18); ctx.lineTo(cx - 10, 70); ctx.lineTo(cx + 10, 70); ctx.fill()
  })
}

/** 소나무: 그림 두 장을 열십자로 세운 나무(멀리서 보면 입체적인 실사 나무처럼 보인다) */
export function pineTrees(count: number, place: (i: number, dummy: THREE.Object3D) => void, castShadow: boolean): THREE.Object3D {
  const group = new THREE.Group()
  const variants = [pineTexture(7), pineTexture(19), pineTexture(31)]
  const plane = new THREE.PlaneGeometry(4.2, 8.4)
  plane.translate(0, 4.2, 0)
  const cross = new THREE.BufferGeometry()
  const a = plane.clone(), b = plane.clone().rotateY(Math.PI / 2)
  const merge = (list: THREE.BufferGeometry[]) => {
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
    let off = 0
    for (const g of list) {
      const p = g.getAttribute('position'), n = g.getAttribute('normal'), t = g.getAttribute('uv')
      for (let i = 0; i < p.count; i += 1) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(0, 1, 0); uv.push(t.getX(i), t.getY(i)) }
      void n
      const index = g.getIndex()!
      for (let i = 0; i < index.count; i += 3) idx.push(index.getX(i) + off, index.getX(i + 1) + off, index.getX(i + 2) + off, index.getX(i) + off, index.getX(i + 2) + off, index.getX(i + 1) + off) // 앞뒤 두 면(같은 위쪽 법선: 뒷면이 어둡게 뒤집히지 않게)
      off += p.count
    }
    cross.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    cross.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)) // 위를 향한 법선: 그림의 명암이 그대로 보이고 면이 번쩍이지 않는다
    cross.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    cross.setIndex(idx)
  }
  merge([a, b])
  const dummy = new THREE.Object3D()
  const per = Math.ceil(count / variants.length)
  variants.forEach((map, vi) => {
    const material = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, roughness: 1, metalness: 0 })
    const mesh = new THREE.InstancedMesh(cross, material, per)
    let n = 0
    for (let i = vi; i < count; i += variants.length) { place(i, dummy); dummy.updateMatrix(); mesh.setMatrixAt(n, dummy.matrix); n += 1 }
    mesh.count = n
    mesh.castShadow = castShadow
    group.add(mesh)
  })
  return group
}

/** 바위: 울퉁불퉁하게 일그러진 돌(둥근 면 + 이끼 · 흙 얼룩 색) */
export function rockGeometry(seed: number): THREE.BufferGeometry {
  const r = rand(seed)
  const g = new THREE.IcosahedronGeometry(1, 3)
  const p = g.getAttribute('position') as THREE.BufferAttribute
  const k = [r() * 9, r() * 9, r() * 9]
  const v = new THREE.Vector3()
  const colors: number[] = []
  const base = new THREE.Color(0x6a6058), dark = new THREE.Color(0x3a332e), moss = new THREE.Color(0x4f5a34), dust = new THREE.Color(0x8a7a60)
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i += 1) {
    v.fromBufferAttribute(p, i).normalize()
    const n = Math.sin(v.x * 3.1 + k[0]) * 0.18 + Math.sin(v.y * 5.3 + k[1]) * 0.1 + Math.sin(v.z * 7.7 + k[2]) * 0.07 + Math.sin((v.x + v.z) * 13 + k[0]) * 0.03
    const flat = v.y < -0.2 ? 0.55 : 1 // 아래는 땅에 묻히듯 납작하게
    v.multiplyScalar(1 + n).setY(v.y * flat)
    p.setXYZ(i, v.x, v.y, v.z)
    c.copy(base).lerp(dark, Math.max(0, -n * 2.5)).lerp(moss, Math.max(0, v.y - 0.35) * 0.9).lerp(dust, Math.max(0, -v.y) * 0.5)
    colors.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

/** 풀 덤불: 가는 풀잎을 그린 그림 두 장을 열십자로 */
export function grassTuftGeometry(): THREE.BufferGeometry {
  const plane = new THREE.PlaneGeometry(0.8, 0.42)
  plane.translate(0, 0.21, 0)
  const b = plane.clone().rotateY(Math.PI / 2)
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = []
  let off = 0
  for (const g of [plane, b]) {
    const p = g.getAttribute('position'), t = g.getAttribute('uv')
    for (let i = 0; i < p.count; i += 1) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(t.getX(i), t.getY(i)); nor.push(0, 1, 0) }
    const index = g.getIndex()!
    for (let i = 0; i < index.count; i += 3) idx.push(index.getX(i) + off, index.getX(i + 1) + off, index.getX(i + 2) + off, index.getX(i) + off, index.getX(i + 2) + off, index.getX(i + 1) + off)
    off += p.count
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geo.setIndex(idx)
  return geo
}

export function grassTexture(): THREE.CanvasTexture {
  return painted(256, 160, ctx => {
    const r = rand(5)
    for (let i = 0; i < 90; i += 1) {
      const x = 20 + r() * 216, h = 50 + r() * 105, bend = (r() - 0.5) * 50
      const dry = r()
      ctx.strokeStyle = dry > 0.45 ? `rgb(${185 + r() * 40},${160 + r() * 30},${95 + r() * 25})` : `rgb(${120 + r() * 40},${135 + r() * 30},${70 + r() * 20})`
      ctx.lineWidth = 1.5 + r() * 2
      ctx.beginPath(); ctx.moveTo(x, 160); ctx.quadraticCurveTo(x + bend * 0.3, 160 - h * 0.6, x + bend, 160 - h); ctx.stroke()
    }
  })
}

/** 먼 산: 높이에 따라 바위 결 · 골짜기 그늘 · 꼭대기 쪽은 하늘빛에 묻힌다(공기 원근) */
export function mountainMaterial(color: number, haze: number, hazeAmount: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false, depthWrite: true,
    uniforms: { base: { value: new THREE.Color(color) }, haze: { value: new THREE.Color(haze) }, amount: { value: hazeAmount } },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 base, haze; uniform float amount; varying vec3 vPos;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float a = atan(vPos.z, vPos.x) * 40.0;
        float y = vPos.y;
        // 비탈을 타고 내려오는 골짜기 · 바위 결
        float streak = n(vec2(a * 1.7, y * 0.35)) * 0.6 + n(vec2(a * 5.0, y * 1.2)) * 0.3 + n(vec2(a * 13.0, y * 3.0)) * 0.1;
        vec3 c = base * (0.72 + streak * 0.5);
        // 아래쪽은 더 짙게, 위쪽은 햇빛 · 하늘빛을 받는다
        float up = clamp((y + 4.0) / 30.0, 0.0, 1.0);
        c = mix(c * 0.8, c * 1.12, up);
        // 공기 원근: 멀수록 · 아래로 갈수록(지평선 아지랑이) 하늘색에 묻힌다
        float mist = amount + (1.0 - amount) * smoothstep(6.0, -4.0, y) * 0.55;
        c = mix(c, haze, clamp(mist, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  })
}
