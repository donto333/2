// 천(망토 · 깃발) 텍스처를 그 자리에서 그린다: 실 짜임 · 주름 그늘 · 바랜 얼룩 · 수놓은 테두리 · 붓글씨, 그리고 같은 높낮이에서 구한 노멀맵.
// 단색 판처럼 보이지 않도록(장난감 느낌 X) 색과 결을 모두 텍스처에 담는다.
import * as THREE from 'three'

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000 }
}

function rgb(hex: number): [number, number, number] {
  const c = new THREE.Color(hex)
  return [c.r * 255, c.g * 255, c.b * 255]
}

function texture(canvas: HTMLCanvasElement, color: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas)
  if (color) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

export interface FabricOptions {
  /** 천 색 */
  color: number
  /** 테두리 수(없으면 테두리 없음) */
  trim?: number
  /** 가로 주름 수(망토는 세로 주름) */
  pleats?: number
  /** 깃발 글자(세로 한글) */
  text?: string
  ink?: number
  /** 깃발 가장자리 불꽃 톱니(알파) */
  teeth?: boolean
  width?: number
  height?: number
  seed?: number
}

export interface Fabric { map: THREE.Texture; normalMap: THREE.Texture; alphaMap?: THREE.Texture }

/** 높이장(주름 + 짜임) → 노멀맵 */
function normalFromHeight(height: Float32Array, w: number, h: number, strength: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const l = height[y * w + Math.max(0, x - 1)], r = height[y * w + Math.min(w - 1, x + 1)]
      const u = height[Math.max(0, y - 1) * w + x], d = height[Math.min(h - 1, y + 1) * w + x]
      const nx = (l - r) * strength, ny = (d - u) * strength, nz = 1
      const len = Math.hypot(nx, ny, nz)
      const i = (y * w + x) * 4
      img.data[i] = (nx / len * 0.5 + 0.5) * 255
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

export function fabric(options: FabricOptions): Fabric {
  const w = options.width ?? 256, h = options.height ?? 512
  const rand = rng(options.seed ?? 7)
  const [br, bg, bb] = rgb(options.color)
  const pleats = options.pleats ?? 0
  // 1) 높이장: 세로 주름(망토) + 실 짜임 + 큰 구김
  const height = new Float32Array(w * h)
  const blobs = Array.from({ length: 7 }, () => ({ x: rand() * w, y: rand() * h, r: 40 + rand() * 90, a: (rand() - 0.5) * 1.2 }))
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = x / w, v = y / h
      let z = 0
      if (pleats) z += Math.cos(u * Math.PI * 2 * pleats + Math.sin(v * 5 + u * 3) * 0.6) * (0.35 + 0.65 * v) * 1.6
      z += ((x + y) % 2 ? 0.08 : -0.08) + ((x >> 1) % 2 ? 0.05 : -0.05) // 짜임
      for (const b of blobs) { const d = Math.hypot(x - b.x, y - b.y); if (d < b.r) z += b.a * (1 - d / b.r) ** 2 }
      height[y * w + x] = z
    }
  }
  // 2) 색: 기본색 · 주름 그늘(접힌 골은 어둡게) · 실 결 · 바랜 얼룩 · 아래로 갈수록 흙먼지
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4, v = y / h
      const z = height[y * w + x]
      const fold = pleats ? 0.82 + 0.18 * Math.tanh(z * 0.9) : 1
      const grain = 0.94 + rand() * 0.12
      const streak = 0.97 + 0.03 * Math.sin(x * 0.9 + Math.sin(y * 0.05) * 3)
      const dust = 1 - Math.max(0, v - 0.7) * 0.35
      const k = fold * grain * streak * dust
      // 먼지는 누런 쪽으로
      img.data[i] = Math.min(255, br * k + (1 - dust) * 40)
      img.data[i + 1] = Math.min(255, bg * k + (1 - dust) * 32)
      img.data[i + 2] = Math.min(255, bb * k + (1 - dust) * 18)
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  // 3) 수놓은 테두리(색이 바랜 금실): 굵은 띠 + 구름무늬 반복
  if (options.trim !== undefined) {
    const [tr, tg, tb] = rgb(options.trim)
    const band = Math.round(w * 0.07)
    const trimColor = (a: number) => `rgba(${tr | 0},${tg | 0},${tb | 0},${a})`
    ctx.fillStyle = trimColor(0.78)
    ctx.fillRect(0, h - band * 1.6, w, band)
    ctx.fillRect(0, 0, band * 0.6, h); ctx.fillRect(w - band * 0.6, 0, band * 0.6, h)
    ctx.strokeStyle = 'rgba(30,18,10,0.45)'; ctx.lineWidth = 1.5
    for (let x = band; x < w; x += band * 1.3) { // 구름무늬
      ctx.beginPath(); ctx.arc(x, h - band * 1.1, band * 0.3, Math.PI, 0); ctx.arc(x + band * 0.45, h - band * 1.1, band * 0.18, Math.PI, 0); ctx.stroke()
    }
    // 실 결로 금빛을 흩뜨린다
    const trimImg = ctx.getImageData(0, 0, w, h)
    for (let p = 0; p < trimImg.data.length; p += 4) { const n = 0.85 + rand() * 0.25; trimImg.data[p] *= n; trimImg.data[p + 1] *= n; trimImg.data[p + 2] *= n }
    ctx.putImageData(trimImg, 0, 0)
  }
  // 4) 붓글씨(깃발): 먹이 번지듯 여러 번 겹쳐 쓴다
  if (options.text) {
    const [ir, ig, ib] = rgb(options.ink ?? 0x1a1410)
    const chars = [...options.text].slice(0, 2)
    const size = chars.length === 1 ? w * 0.62 : w * 0.5
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `900 ${size}px "Nanum Brush Script", "Gowun Batang", "Noto Serif KR", serif`
    for (let pass = 0; pass < 4; pass += 1) {
      ctx.fillStyle = `rgba(${ir | 0},${ig | 0},${ib | 0},${pass === 3 ? 0.85 : 0.18})`
      const jx = (rand() - 0.5) * 3, jy = (rand() - 0.5) * 3
      chars.forEach((ch, i) => ctx.fillText(ch, w / 2 + jx, (chars.length === 1 ? h * 0.46 : h * (0.3 + i * 0.32)) + jy))
    }
    // 먹이 천에 스며 결이 비치게
    const t = ctx.getImageData(0, 0, w, h)
    for (let p = 0; p < t.data.length; p += 4) { const n = 0.92 + rand() * 0.16; t.data[p] *= n; t.data[p + 1] *= n; t.data[p + 2] *= n }
    ctx.putImageData(t, 0, 0)
  }
  const result: Fabric = { map: texture(canvas, true), normalMap: texture(normalFromHeight(height, w, h, 1.4), false) }
  // 5) 가장자리 불꽃 톱니(깃발 바깥 세 변) + 올이 풀린 끝
  if (options.teeth) {
    const a = document.createElement('canvas')
    a.width = w; a.height = h
    const c = a.getContext('2d')!
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h)
    c.fillStyle = '#fff'
    const tooth = w * 0.09
    c.fillRect(0, tooth, w - tooth, h - tooth * 2)
    c.beginPath()
    for (let y = 0; y <= h; y += tooth * 1.1) { c.moveTo(w - tooth, y); c.quadraticCurveTo(w - tooth * 0.2, y + tooth * 0.2, w - tooth * 0.1, y + tooth * 0.55); c.quadraticCurveTo(w - tooth * 0.4, y + tooth * 0.7, w - tooth, y + tooth * 1.1) }
    for (let x = 0; x <= w - tooth; x += tooth * 1.1) {
      c.moveTo(x, tooth); c.quadraticCurveTo(x + tooth * 0.2, tooth * 0.2, x + tooth * 0.55, tooth * 0.1); c.quadraticCurveTo(x + tooth * 0.7, tooth * 0.4, x + tooth * 1.1, tooth)
      c.moveTo(x, h - tooth); c.quadraticCurveTo(x + tooth * 0.2, h - tooth * 0.2, x + tooth * 0.55, h - tooth * 0.1); c.quadraticCurveTo(x + tooth * 0.7, h - tooth * 0.4, x + tooth * 1.1, h - tooth)
    }
    c.fill()
    result.alphaMap = texture(a, false)
  }
  return result
}

/** 머리카락 · 수염 카드: 끝으로 모이는 가는 털 수백 가닥(알파) */
export function hairCard(color: number, seed = 3): THREE.Texture {
  const w = 128, h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  const rand = rng(seed)
  const [r, g, b] = rgb(color)
  ctx.lineCap = 'round'
  for (let i = 0; i < 260; i += 1) {
    const x0 = w * (0.1 + rand() * 0.8), len = h * (0.55 + rand() * 0.45)
    const x1 = w / 2 + (x0 - w / 2) * (0.15 + rand() * 0.2) + (rand() - 0.5) * 10
    const bend = (rand() - 0.5) * 18
    const light = 0.7 + rand() * 0.7
    ctx.strokeStyle = `rgba(${Math.min(255, r * light) | 0},${Math.min(255, g * light) | 0},${Math.min(255, b * light) | 0},${0.3 + rand() * 0.6})`
    ctx.lineWidth = 0.5 + rand() * 0.8
    ctx.beginPath(); ctx.moveTo(x0, rand() * 6)
    ctx.bezierCurveTo(x0 + bend, len * 0.4, x1 - bend, len * 0.75, x1, len)
    ctx.stroke()
  }
  return texture(canvas, true)
}

/** 꿩 꽁지깃: 금갈색 바탕에 검은 가로 띠 · 가운데 깃대 · 깃털 가장자리(알파 포함) */
export function pheasantFeather(): THREE.Texture {
  const w = 64, h = 512
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  const rand = rng(11)
  for (let y = 0; y < h; y += 1) {
    const v = y / h
    const half = (w / 2 - 2) * (1 - v * 0.75) // 끝으로 갈수록 좁게
    const bar = Math.sin(v * 30 + Math.sin(v * 7) * 0.8) > 0.72 // 갈색 가로 띠(부드럽게)
    for (let x = 0; x < w; x += 1) {
      const d = Math.abs(x - w / 2)
      if (d > half + (rand() - 0.5) * 3) continue
      const edge = d / Math.max(1, half)
      const base = bar ? [78, 56, 38] : [148 - edge * 30, 118 - edge * 28, 82 - edge * 18]
      const vane = 0.85 + 0.15 * Math.sin((x - w / 2) * 0.9 + y * 0.6)
      ctx.fillStyle = `rgba(${base[0] * vane | 0},${base[1] * vane | 0},${base[2] * vane | 0},${1 - Math.max(0, edge - 0.8) * 3})`
      ctx.fillRect(x, y, 1, 1)
    }
  }
  ctx.fillStyle = 'rgba(232,214,170,0.9)' // 깃대
  ctx.fillRect(w / 2 - 1, 0, 2, h)
  return texture(canvas, true)
}

/** 발밑 빛: 무늬 없이 부드럽게 퍼지는 빛 웅덩이 */
export function glowPool(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128)
  return texture(canvas, true)
}
