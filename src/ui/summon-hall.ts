// 천명의 전당: 무장 모집 · 장비 뽑기 3D 연출.
// 붉은 기둥의 전당에 석상(무장 모집은 말 탄 무장, 장비 뽑기는 봉인석)이 서 있고, 금이 퍼지며 등급 색이 드러난다.
// 낮은 등급부터 깨지고, 최고 등급(천명 무장 · 전설 이상 장비)은 클로즈업 → 폭발 → 이름 자막.
// 화면을 덮는 층은 document.body에 붙이고, 끝나면 렌더러 · 재질 · 텍스처를 모두 정리한다.
import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { effectsSetting } from '../game/settings'
import { tr } from '../i18n/translate'
import '../styles/summon-hall.css'

export type HallRank = 1 | 2 | 3 | 4 | 5

export interface HallEntry {
  /** 1(가장 낮음) ~ 5(최고). 무장은 등급, 장비는 노멀 1 … 신화 5 */
  rank: HallRank
  color: string
  /** 자막 윗줄(예: ‘천명 · 5등급’) */
  label: string
  name: string
  sub: string
  /** 클로즈업으로 따로 보여 줄지 */
  star: boolean
  /** 무장: 말 탄 모델(+ 전용 의상) */
  model?: { gltf: GLTF; skin?: THREE.Texture | null }
  /** 장비: 떠오를 그림 */
  image?: string
}

export type HallKind = 'summon' | 'forge'
type Quality = 'high' | 'mid' | 'low'

function pickQuality(): Quality {
  const setting = effectsSetting()
  if (setting === 'reduced') return 'low'
  if (setting === 'full') return 'high'
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return touch || Math.min(window.innerWidth, window.innerHeight) < 600 ? 'mid' : 'high'
}

/** 3D 전당을 띄울 수 있는지(WebGL2) */
export function hallSupported(): boolean {
  try { return Boolean(document.createElement('canvas').getContext('webgl2')) } catch { return false }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const linear = (x: number) => x
const SKIP = Symbol('skip')
const esc = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))

// ── 셰이더 조각 ──────────────────────────────────────────
const VORONOI = `
vec3 hash3(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453); }
vec2 vor(vec3 p){ vec3 b = floor(p), f = fract(p); float f1 = 8., f2 = 8., id = 0.;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k)); vec3 r = g + hash3(b + g) - f; float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = hash3(b + g + 17.).x; } else if (d < f2) f2 = d; }
  return vec2(sqrt(f2) - sqrt(f1), id); }`
const SHAFT_VS = `varying vec3 vN, vV, vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`
const SHAFT_FS = `uniform vec3 uColor; uniform float uOpacity, uTime; uniform vec2 uY; uniform sampler2D uNoise; varying vec3 vN, vV, vW;
void main(){ float fres = pow(abs(dot(normalize(vN), normalize(vV))), 1.8);
  float vert = smoothstep(uY.x, uY.x + 1.2, vW.y) * smoothstep(uY.y, uY.y - 2.5, vW.y);
  float n = texture2D(uNoise, vec2(atan(vW.z, vW.x) * .6, vW.y * .05 + uTime * .03)).r;
  float a = fres * vert * (.35 + .9 * n) * uOpacity;
  gl_FragColor = vec4(uColor * a, a); }`

type Uniform<T> = { value: T }
interface StoneUniforms { [key: string]: Uniform<unknown>; uCrack: Uniform<number>; uGlow: Uniform<number>; uDissolve: Uniform<number>; uTime: Uniform<number>; uFlicker: Uniform<number>; uCrackColor: Uniform<THREE.Color>; uOrigin: Uniform<THREE.Vector3>; uBoxY: Uniform<THREE.Vector2> }
interface RimUniforms { [key: string]: Uniform<unknown>; uRim: Uniform<number>; uRimColor: Uniform<THREE.Color> }

interface Tween { t: number; dur: number; fn: (k: number) => void; ease: (x: number) => number; res: () => void }

interface Statue {
  entry: HallEntry
  root: THREE.Group
  stone: THREE.Object3D
  stoneMesh: THREE.Mesh
  hero: THREE.Object3D
  su: StoneUniforms
  hu: RimUniforms
  mixer: THREE.AnimationMixer | null
  trimMat: THREE.MeshStandardMaterial
  H: number
  center: THREE.Vector3
  fwd: THREE.Vector3
  col: THREE.Color
  revealed: boolean
  animate: boolean
  pillar: THREE.Mesh | null
  item: { group: THREE.Group; card: THREE.Mesh; glow: THREE.Sprite; ring: THREE.Mesh } | null
}

let running = false

/** 전당 연출 전체. 끝나면(또는 건너뛰면) 돌아온다 */
export async function playSummonHall(entries: HallEntry[], kind: HallKind, onStar?: (entry: HallEntry) => void): Promise<void> {
  if (running || !entries.length) return
  running = true
  const hall = new SummonHall(entries, kind, pickQuality())
  hall.onStar = onStar ?? null
  try { await hall.play() } finally { hall.dispose(); running = false }
}

class SummonHall {
  private readonly q: Quality
  private readonly layer: HTMLDivElement
  private readonly canvas: HTMLCanvasElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140)
  private readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass
  private readonly grade: ShaderPass
  private readonly garbage: Array<{ dispose(): void }> = []
  private readonly animated: Array<THREE.ShaderMaterial> = []
  private reflector: Reflector | null = null
  private statues: Statue[] = []
  private chunks: THREE.Mesh[] = []
  private puffs: THREE.Sprite[] = []
  private rings: THREE.Mesh[] = []
  private tweens: Tween[] = []
  private skip = false
  private shake = 0
  private time = 0
  private baseFov = 42
  private tapResolve: (() => void) | null = null
  private readonly camPos = new THREE.Vector3(0, 6, 16)
  private readonly camLook = new THREE.Vector3(0, 2, -3)
  private readonly timer = new THREE.Timer()
  private readonly lightBase = { hemi: 0.3, key: 650, wall: 0.55 }
  // 전당 구성 요소
  private hemi!: THREE.HemisphereLight
  private key!: THREE.SpotLight
  private flash!: THREE.PointLight
  private focus!: THREE.SpotLight
  private wall!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  private mainShaft!: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  private braziers: Array<{ g: THREE.Group; flame: THREE.Mesh; light: THREE.PointLight; base: number }> = []
  private bannerTime: Uniform<number> = { value: 0 }
  private sparks!: Sparks
  private embers!: Sparks
  private dust!: THREE.Points
  private noiseTex!: THREE.Texture
  private stoneTex!: THREE.Texture
  private glowTex!: THREE.Texture
  private smokeTex!: THREE.Texture
  private chunkGeos: THREE.BufferGeometry[] = []
  private chunkMat!: THREE.MeshStandardMaterial
  private ringGeo!: THREE.RingGeometry
  private readonly M: Record<'lacquer' | 'gold' | 'wood' | 'stone' | 'darkStone' | 'bronze', THREE.MeshStandardMaterial>
  private readonly ui: { caption: HTMLElement; bars: HTMLElement; skip: HTMLButtonElement; tap: HTMLElement; intro: HTMLElement }
  private readonly onResize = () => this.resize()

  constructor(private readonly entries: HallEntry[], private readonly kind: HallKind, quality: Quality) {
    this.q = quality
    this.layer = document.createElement('div')
    this.layer.className = `summon-hall summon-ceremony summon-ceremony--${kind}`
    this.layer.innerHTML = `<canvas class="sh-canvas" aria-label="${kind === 'summon' ? '무장 모집 연출' : '장비 뽑기 연출'}"></canvas>
      <div class="sh-bars"></div>
      <div class="sh-intro"><b>${kind === 'summon' ? '천명의 전당' : '보물의 전당'}</b><span>${kind === 'summon' ? '옥패의 부름에 석상이 깨어난다' : '봉인석이 깨지며 보물이 모습을 드러낸다'}</span></div>
      <div class="sh-caption" aria-live="polite"><span class="sh-caption__grade"></span><h2 class="sh-caption__name"></h2><div class="sh-caption__rule"><i></i></div><span class="sh-caption__sub"></span></div>
      <p class="sh-tap" hidden>화면을 누르면 넘어갑니다</p>
      <button class="sh-skip" type="button">건너뛰기 ▸▸</button>`
    document.body.appendChild(this.layer)
    const $ = <T extends HTMLElement>(sel: string) => this.layer.querySelector(sel) as T
    this.canvas = $('canvas')
    this.ui = { caption: $('.sh-caption'), bars: $('.sh-bars'), skip: $('.sh-skip'), tap: $('.sh-tap'), intro: $('.sh-intro') }
    this.ui.skip.addEventListener('click', event => { event.stopPropagation(); this.skip = true; this.releaseTap() })
    this.layer.addEventListener('click', () => this.releaseTap())

    const dpr = Math.min(window.devicePixelRatio || 1, this.q === 'high' ? 1.5 : this.q === 'mid' ? 1.25 : 1)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(dpr)
    this.renderer.shadowMap.enabled = this.q !== 'low'
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.scene.background = new THREE.Color(0x040306)
    this.scene.fog = new THREE.FogExp2(0x080505, 0.022)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    this.scene.environment = env
    this.scene.environmentIntensity = 0.22
    this.garbage.push(env, pmrem, { dispose: () => room.dispose?.() })

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.q === 'high' ? 4 : this.q === 'mid' ? 2 : 0 })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.55, 0.82)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 0.0025 }, uVig: { value: 0.85 }, uGrain: { value: 0.035 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 0.95, 0.85) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uCA, uVig, uGrain, uFlash; uniform vec3 uFlashColor; varying vec2 vUv;
      void main(){
        vec2 c = vUv - .5; float d = length(c); vec2 off = c * uCA * (1. + d * 2.);
        vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
        float l = dot(col, vec3(.299, .587, .114));
        col = mix(col * vec3(.92, .97, 1.08), col, smoothstep(.0, .35, l));
        col = mix(col, col * vec3(1.05, 1.0, .93), smoothstep(.45, 1., l));
        col *= mix(1., smoothstep(.95, .25, d), uVig);
        float n = fract(sin(dot(vUv * vec2(1733.1, 997.7) + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - .5) * uGrain;
        col = mix(col, uFlashColor, uFlash);
        gl_FragColor = vec4(col, 1.);
      }`,
    })
    this.composer.addPass(this.grade)
    this.garbage.push(this.composer, target)

    this.M = {
      lacquer: this.own(new THREE.MeshStandardMaterial({ color: 0x6a120d, roughness: 0.34, metalness: 0 })),
      gold: this.own(new THREE.MeshStandardMaterial({ color: 0xd9ad5f, roughness: 0.32, metalness: 1 })),
      wood: this.own(new THREE.MeshStandardMaterial({ color: 0x24160f, roughness: 0.72 })),
      stone: this.own(new THREE.MeshStandardMaterial({ color: 0x6d6862, roughness: 0.8 })),
      darkStone: this.own(new THREE.MeshStandardMaterial({ color: 0x3d3a38, roughness: 0.55 })),
      bronze: this.own(new THREE.MeshStandardMaterial({ color: 0x5c3d22, roughness: 0.42, metalness: 0.9 })),
    }
    this.buildTextures()
    this.buildHall()
    this.buildEffects()
    window.addEventListener('resize', this.onResize)
    this.resize()
  }

  private own<T extends { dispose(): void }>(item: T): T { this.garbage.push(item); return item }
  private add<T extends THREE.Object3D>(obj: T, parent: THREE.Object3D = this.scene): T { parent.add(obj); return obj }
  private mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(geo: G, mat: M, parent?: THREE.Object3D): THREE.Mesh<G, M> {
    this.garbage.push(geo)
    return this.add(new THREE.Mesh(geo, mat), parent)
  }
  private portrait(): boolean { return this.camera.aspect < 1 }

  // ── 절차 텍스처 ─────────────────────────────────────────
  private canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    draw(c.getContext('2d')!, w, h)
    const t = this.own(new THREE.CanvasTexture(c))
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }
  private stoneCanvas!: HTMLCanvasElement
  private buildTextures(): void {
    const size = 256, val = new Float32Array(size * size)
    let amp = 1, total = 0
    for (let o = 0; o < 5; o++) {
      const n = 4 << o, grid = Float32Array.from({ length: n * n }, Math.random)
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const fx = x / size * n, fy = y / size * n, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
        const a = grid[(y0 % n) * n + x0 % n], b = grid[(y0 % n) * n + (x0 + 1) % n], c = grid[((y0 + 1) % n) * n + x0 % n], d = grid[((y0 + 1) % n) * n + (x0 + 1) % n]
        val[y * size + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy)
      }
      total += amp; amp *= 0.5
    }
    const toCanvas = (fn: (v: number) => [number, number, number]) => {
      const c = document.createElement('canvas'); c.width = c.height = size
      const g = c.getContext('2d')!, img = g.createImageData(size, size)
      for (let i = 0; i < size * size; i++) { const [r, gg, b] = fn(val[i] / total); img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255 }
      g.putImageData(img, 0, 0); return c
    }
    this.noiseTex = this.own(new THREE.CanvasTexture(toCanvas(v => [v * 255, v * 255, v * 255])))
    this.noiseTex.wrapS = this.noiseTex.wrapT = THREE.RepeatWrapping
    this.stoneCanvas = toCanvas(v => { const s = 70 + v * 70 + Math.random() * 18; return [s, s * 0.98, s * 0.95] })
    this.stoneTex = this.own(new THREE.CanvasTexture(this.stoneCanvas))
    this.stoneTex.colorSpace = THREE.SRGBColorSpace
    this.stoneTex.wrapS = this.stoneTex.wrapT = THREE.RepeatWrapping
    this.stoneTex.repeat.set(2, 2)
    this.M.stone.map = this.stoneTex; this.M.darkStone.map = this.stoneTex
    this.glowTex = this.canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.22, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w) })
    this.smokeTex = this.canvasTex(128, 128, (g, w) => {
      for (let i = 0; i < 26; i++) { const x = w / 2 + rand(-26, 26), y = w / 2 + rand(-26, 26), r = rand(14, 40), grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, w) }
    })
  }

  // 바닥: 검게 닦인 돌 + 금 상감 팔각 별 · 원형 눈금
  private drawFloor(g: CanvasRenderingContext2D, w: number, mode: 'color' | 'orm'): void {
    const R = 18, cx = w / 2, px = w / (R * 2)
    const gold = mode === 'color' ? '#c99a4e' : 'rgb(0,60,255)'
    if (mode === 'color') {
      g.drawImage(this.stoneCanvas, 0, 0, w, w); g.fillStyle = 'rgba(10,9,12,.78)'; g.fillRect(0, 0, w, w)
      for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(255,255,255,${rand(0.015, 0.04)})`; g.lineWidth = rand(1, 3); g.beginPath(); let x = rand(0, w), y = rand(0, w); g.moveTo(x, y); for (let k = 0; k < 30; k++) { x += rand(-30, 30); y += rand(-30, 30); g.lineTo(x, y) } g.stroke() }
    } else { g.fillStyle = 'rgb(0,165,0)'; g.fillRect(0, 0, w, w) }
    g.strokeStyle = mode === 'color' ? 'rgba(0,0,0,.65)' : 'rgb(0,200,0)'; g.lineWidth = w / 680
    for (let r = 4.4; r < R; r += 1.6) { g.beginPath(); g.arc(cx, cx, r * px, 0, 7); g.stroke() }
    for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(t) * 4.4 * px, cx + Math.sin(t) * 4.4 * px); g.lineTo(cx + Math.cos(t) * w, cx + Math.sin(t) * w); g.stroke() }
    const lw = w / 2048
    const star = (big: number, small: number, width: number) => { g.beginPath(); for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2 - Math.PI / 2, rr = (i % 2 ? small : big) * px; g.lineTo(cx + Math.cos(t) * rr, cx + Math.sin(t) * rr) } g.closePath(); g.lineWidth = width * lw; g.stroke() }
    g.strokeStyle = gold; star(3.4, 2.1, 7); star(3.0, 1.85, 3); star(1.6, 0.95, 4)
    g.lineWidth = 6 * lw; for (const r of [3.9, 4.25]) { g.beginPath(); g.arc(cx, cx, r * px, 0, 7); g.stroke() }
    g.lineWidth = 4 * lw; for (let i = 0; i < 64; i++) { const t = i / 64 * Math.PI * 2, r0 = 3.9 * px, r1 = (i % 8 ? 4.05 : 4.25) * px; g.beginPath(); g.moveTo(cx + Math.cos(t) * r0, cx + Math.sin(t) * r0); g.lineTo(cx + Math.cos(t) * r1, cx + Math.sin(t) * r1); g.stroke() }
    g.lineWidth = 5 * lw; for (const r of [10.2, 10.45]) { g.beginPath(); g.arc(cx, cx, r * px, 0, 7); g.stroke() }
  }

  private shaftMat(color: THREE.ColorRepresentation, opacity: number, y0: number, y1: number): THREE.ShaderMaterial {
    const m = this.own(new THREE.ShaderMaterial({ vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 }, uY: { value: new THREE.Vector2(y0, y1) }, uNoise: { value: this.noiseTex } } }))
    this.animated.push(m)
    return m
  }

  // ── 전당 ───────────────────────────────────────────────
  private buildHall(): void {
    const R = 18, M = this.M, fsize = this.q === 'low' ? 1024 : 2048
    const floorTex = this.canvasTex(fsize, fsize, (g, w) => this.drawFloor(g, w, 'color'))
    const floorORM = this.canvasTex(fsize, fsize, (g, w) => this.drawFloor(g, w, 'orm'), false)
    if (this.q === 'high') {
      const geo = this.own(new THREE.CircleGeometry(R, 96))
      this.reflector = this.add(new Reflector(geo, { textureWidth: 512, textureHeight: 512, color: 0x6a6460, clipBias: 0.003 }))
      this.reflector.rotation.x = -Math.PI / 2
      this.garbage.push({ dispose: () => this.reflector?.dispose() })
    }
    const floor = this.mesh(new THREE.CircleGeometry(R, 96), this.own(new THREE.MeshStandardMaterial({ map: floorTex, roughnessMap: floorORM, metalnessMap: floorORM, roughness: 1, metalness: 1, transparent: this.q === 'high', opacity: this.q === 'high' ? 0.9 : 1 })))
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.004; floor.receiveShadow = true
    // 계단식 단
    for (const [r, h] of [[10.9, 0.22], [11.5, 0.44], [12.1, 0.66]]) {
      const ring = this.mesh(new THREE.RingGeometry(r, R + 1, 96), M.darkStone); ring.rotation.x = -Math.PI / 2; ring.position.y = h; ring.receiveShadow = true
      const lip = this.mesh(new THREE.CylinderGeometry(r, r, h, 96, 1, true), M.darkStone); lip.position.y = h / 2; lip.receiveShadow = true
    }
    // 기둥 · 들보 · 천장
    const COLS = 14
    const colGeo = this.own(new THREE.CylinderGeometry(0.42, 0.46, 10.4, 24)), baseGeo = this.own(new THREE.CylinderGeometry(0.62, 0.7, 0.5, 24))
    const ringGeo = this.own(new THREE.TorusGeometry(1, 0.12, 8, 28)), capGeo = this.own(new THREE.BoxGeometry(1.4, 0.5, 1.4))
    for (let i = 0; i < COLS; i++) {
      const a = (i + 0.5) / COLS * Math.PI * 2, x = Math.sin(a) * 12.9, z = -Math.cos(a) * 12.9
      const col = this.add(new THREE.Mesh(colGeo, M.lacquer)); col.position.set(x, 0.66 + 5.2, z); col.castShadow = this.q === 'high'
      this.add(new THREE.Mesh(baseGeo, M.stone)).position.set(x, 0.9, z)
      for (const [y, r] of [[1.25, 0.5], [10.4, 0.5], [10.75, 0.56]]) { const ring = this.add(new THREE.Mesh(ringGeo, M.gold)); ring.scale.set(r, r, r); ring.rotation.x = Math.PI / 2; ring.position.set(x, y, z) }
      const cap = this.add(new THREE.Mesh(capGeo, M.wood)); cap.position.set(x, 11.1, z); cap.rotation.y = -a
    }
    const beam = this.mesh(new THREE.TorusGeometry(12.9, 0.38, 10, 96), M.wood); beam.rotation.x = Math.PI / 2; beam.position.y = 11.5
    const trim = this.mesh(new THREE.TorusGeometry(12.9, 0.06, 6, 96), M.gold); trim.rotation.x = Math.PI / 2; trim.position.y = 11.15
    const ceil = this.mesh(new THREE.RingGeometry(3.2, 16, 64), this.own(new THREE.MeshStandardMaterial({ color: 0x150d09, roughness: 0.9, side: THREE.DoubleSide }))); ceil.rotation.x = Math.PI / 2; ceil.position.y = 12.2
    const oculus = this.mesh(new THREE.TorusGeometry(3.2, 0.18, 8, 64), M.gold); oculus.rotation.x = Math.PI / 2; oculus.position.y = 12.15
    // 벽: 어두운 나무 창살 너머 등불빛
    const lattice = this.canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#1a100b'; g.fillRect(0, 0, w, h)
      const grd = g.createLinearGradient(0, 60, 0, h - 60); grd.addColorStop(0, '#5a3418'); grd.addColorStop(0.5, '#a8682a'); grd.addColorStop(1, '#4a2a14')
      g.fillStyle = grd; g.fillRect(28, 60, w - 56, h - 130)
      g.strokeStyle = '#1a100b'; g.lineWidth = 7
      for (let x = 28; x <= w - 28; x += 25) { g.beginPath(); g.moveTo(x, 60); g.lineTo(x, h - 70); g.stroke() }
      for (let y = 60; y <= h - 70; y += 25) { g.beginPath(); g.moveTo(28, y); g.lineTo(w - 28, y); g.stroke() }
      g.lineWidth = 14; g.strokeRect(28, 60, w - 56, h - 130)
    })
    lattice.wrapS = THREE.RepeatWrapping; lattice.repeat.set(20, 1)
    this.wall = this.mesh(new THREE.CylinderGeometry(15, 15, 12, 80, 1, true), this.own(new THREE.MeshStandardMaterial({ map: lattice, emissiveMap: lattice, emissive: 0xffb060, emissiveIntensity: 0.55, roughness: 0.8, side: THREE.BackSide })))
    this.wall.position.y = 6.2
    // 비단 깃발
    const bannerTex = this.canvasTex(128, 512, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#5e0f0b'); grd.addColorStop(0.5, '#9a1d15'); grd.addColorStop(1, '#5e0f0b')
      g.fillStyle = grd; g.fillRect(0, 0, w, h)
      g.strokeStyle = '#c99a4e'; g.lineWidth = 5; g.strokeRect(10, 10, w - 20, h - 50); g.lineWidth = 2; g.strokeRect(18, 18, w - 36, h - 66)
      g.beginPath(); g.moveTo(w / 2, 150); g.lineTo(w / 2 + 34, 200); g.lineTo(w / 2, 250); g.lineTo(w / 2 - 34, 200); g.closePath(); g.lineWidth = 4; g.stroke()
      g.beginPath(); g.arc(w / 2, 200, 14, 0, 7); g.fillStyle = '#c99a4e'; g.fill()
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(0, h); g.lineTo(w / 2, h - 34); g.lineTo(w, h); g.fill(); g.globalCompositeOperation = 'source-over'
    })
    const bannerMat = this.own(new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6, side: THREE.DoubleSide, alphaTest: 0.5 }))
    const bannerU = this.bannerTime
    bannerMat.onBeforeCompile = sh => {
      sh.uniforms.uTime = bannerU
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat sw = (1. - uv.y); transformed.z += sin(uTime * 1.3 + position.y * 1.2 + modelMatrix[3].x) * .09 * sw; transformed.x += sin(uTime * .9 + position.y * 2.) * .03 * sw;')
    }
    const bannerGeo = this.own(new THREE.PlaneGeometry(1.3, 5.2, 4, 16))
    for (let i = 0; i < COLS; i++) {
      const a = i / COLS * Math.PI * 2
      const b = this.add(new THREE.Mesh(bannerGeo, bannerMat)); b.position.set(Math.sin(a) * 13.6, 7.6, -Math.cos(a) * 13.6); b.lookAt(0, 7.6, 0)
    }
    // 천장 구멍의 빛기둥
    this.mainShaft = this.mesh(new THREE.CylinderGeometry(3.0, 4.6, 12.2, 64, 1, true), this.shaftMat(0xffd9a0, 0.34, 0, 12.2))
    this.mainShaft.position.set(0, 6.1, 0)
    // 화로
    const flameMat = this.own(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uNoise: { value: this.noiseTex } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform float uTime; uniform sampler2D uNoise; varying vec2 vUv;
      void main(){ vec2 uv = vUv;
        float n = texture2D(uNoise, vec2(uv.x * 1.3 + .2, uv.y * .9 - uTime * 1.3)).r, n2 = texture2D(uNoise, vec2(uv.x * 2.7, uv.y * 2. - uTime * 2.4)).r;
        float w = abs(uv.x - .5) * (1.6 + uv.y * 2.2);
        float shape = smoothstep(.55, 0., w) * smoothstep(0., .12, uv.y);
        float f = clamp(shape * (n * .9 + n2 * .6) * 1.7 - uv.y * 1.05, 0., 1.);
        vec3 col = mix(vec3(.9, .18, .02), vec3(1., .82, .45), smoothstep(.2, .9, f));
        gl_FragColor = vec4(col * f * 2.6, f); }` }))
    this.animated.push(flameMat)
    const bowlGeo = this.own(new THREE.LatheGeometry([[0.05, 0], [0.5, 0.05], [0.62, 0.3], [0.66, 0.42], [0.58, 0.44]].map(([x, y]) => new THREE.Vector2(x, y)), 24))
    const stemGeo = this.own(new THREE.CylinderGeometry(0.09, 0.2, 1.05, 12)), footGeo = this.own(new THREE.CylinderGeometry(0.42, 0.5, 0.12, 16))
    const coalGeo = this.own(new THREE.CircleGeometry(0.56, 20)), coalMat = this.own(new THREE.MeshBasicMaterial({ color: 0xff5a14 })), flameGeo = this.own(new THREE.PlaneGeometry(1.3, 2.2))
    for (const deg of [-102, -38, 38, 102]) {
      const a = THREE.MathUtils.degToRad(deg), g = this.add(new THREE.Group()); g.position.set(Math.sin(a) * 9.9, 0, 0.8 - Math.cos(a) * 9.9)
      const bowl = this.add(new THREE.Mesh(bowlGeo, M.bronze), g); bowl.position.y = 1.05; bowl.castShadow = this.q === 'high'
      this.add(new THREE.Mesh(stemGeo, M.bronze), g).position.y = 0.52
      this.add(new THREE.Mesh(footGeo, M.bronze), g).position.y = 0.06
      const coal = this.add(new THREE.Mesh(coalGeo, coalMat), g); coal.rotation.x = -Math.PI / 2; coal.position.y = 1.44
      const flame = this.add(new THREE.Mesh(flameGeo, flameMat), g); flame.position.y = 2.45
      const light = this.add(new THREE.PointLight(0xff8a3a, 7, 11, 1.8), g); light.position.y = 2.1
      this.braziers.push({ g, flame, light, base: 7 })
    }
    // 바닥 안개
    if (this.q !== 'low') {
      const mistMat = this.own(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uNoise: { value: this.noiseTex } },
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform sampler2D uNoise; uniform float uTime; varying vec3 vW;
        void main(){ float n = texture2D(uNoise, vW.xz * .045 + vec2(uTime * .012, uTime * .007)).r, n2 = texture2D(uNoise, vW.xz * .1 - vec2(uTime * .016, 0.)).r;
          float a = smoothstep(.38, .9, n * .65 + n2 * .5) * smoothstep(17., 5., length(vW.xz)) * .3;
          gl_FragColor = vec4(vec3(.42, .36, .32), a * .45); }` }))
      this.animated.push(mistMat)
      const mistGeo = this.own(new THREE.PlaneGeometry(36, 36))
      for (const y of [0.12, 0.34, 0.62]) { const m = this.add(new THREE.Mesh(mistGeo, mistMat)); m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 5 }
    }
    // 조명
    this.hemi = this.add(new THREE.HemisphereLight(0x948d96, 0x1a1210, this.lightBase.hemi))
    this.key = this.add(new THREE.SpotLight(0xffe4bc, this.lightBase.key, 0, 0.62, 0.85, 2))
    this.key.position.set(0, 19, -1.5); this.key.target.position.set(0, 0, -4.5); this.add(this.key.target)
    if (this.q !== 'low') {
      this.key.castShadow = true
      const s = this.q === 'high' ? 2048 : 1024
      this.key.shadow.mapSize.set(s, s); this.key.shadow.bias = -0.0004; this.key.shadow.normalBias = 0.03
      this.key.shadow.camera.near = 8; this.key.shadow.camera.far = 32
    }
    const rim = this.add(new THREE.DirectionalLight(0x8a90d8, 0.55)); rim.position.set(0, 7, -14)
    const front = this.add(new THREE.DirectionalLight(0xffe8d0, 0.35)); front.position.set(2, 5, 12)
    this.flash = this.add(new THREE.PointLight(0xffffff, 0, 14, 2))
    this.focus = this.add(new THREE.SpotLight(0xffd88a, 0, 0, 0.34, 0.8, 2)); this.add(this.focus.target)
  }

  private buildEffects(): void {
    const lowFx = this.q === 'low'
    this.sparks = new Sparks(this.scene, lowFx ? 1200 : 3000, 0.07)
    this.embers = new Sparks(this.scene, lowFx ? 300 : 800, 0.12)
    const DUST = lowFx ? 200 : 600, pos = new Float32Array(DUST * 3)
    for (let i = 0; i < DUST; i++) { const r = Math.sqrt(Math.random()) * 4.4, a = Math.random() * 7; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 11; pos[i * 3 + 2] = Math.sin(a) * r }
    const geo = this.own(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.dust = this.add(new THREE.Points(geo, this.own(new THREE.PointsMaterial({ size: 0.045, map: this.glowTex, color: 0xffe2b8, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))))
    this.chunkGeos = Array.from({ length: 8 }, () => {
      const base = new THREE.IcosahedronGeometry(1, 1); base.deleteAttribute('normal'); base.deleteAttribute('uv')
      const g = mergeVertices(base), p = g.attributes.position, v = new THREE.Vector3()
      const sx = rand(0.5, 1), sy = rand(0.4, 1), sz = rand(0.5, 1)
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).multiplyScalar(rand(0.72, 1.2)); p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz) }
      const n = g.toNonIndexed(); n.computeVertexNormals(); base.dispose(); g.dispose()
      return this.own(n)
    })
    this.chunkMat = this.own(new THREE.MeshStandardMaterial({ map: this.stoneTex, color: 0x9a948c, roughness: 0.9, flatShading: true }))
    this.ringGeo = this.own(new THREE.RingGeometry(0.92, 1, 64))
  }

  // ── 재질 ───────────────────────────────────────────────
  private stoneMaterial(orig: { map?: THREE.Texture | null; normalMap?: THREE.Texture | null }, u: StoneUniforms, cell: number): THREE.MeshStandardMaterial {
    const m = this.own(new THREE.MeshStandardMaterial({ map: orig.map ?? this.stoneTex, normalMap: orig.normalMap ?? null, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.86, metalness: 0 }))
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u)
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; transformed += objectNormal * 0.004;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform float uCrack, uGlow, uDissolve, uTime, uFlicker; uniform vec3 uCrackColor, uOrigin; uniform vec2 uBoxY; varying vec3 vOP;${VORONOI}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          float lum = dot(diffuseColor.rgb, vec3(.3, .59, .11));
          vec3 stone = vec3(.44, .42, .39) * (.42 + lum * .9);
          float grit = fract(sin(dot(floor(vOP * 160.), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          stone *= .88 + grit * .2;
          vec2 vc = vor(vOP * ${cell.toFixed(2)}), vf = vor(vOP * ${(cell * 2.4).toFixed(2)});
          float spread = uCrack * 3.2 - distance(vOP, uOrigin) + (vf.y - .5) * .35;
          float aa = fwidth(vc.x) * 1.2, aaf = fwidth(vf.x) * 1.5;
          float crack = (1. - smoothstep(0., .045 + aa, vc.x)) * smoothstep(0., .3, spread) * clamp(.05 / (aa + .05) * 1.4, 0., 1.);
          float fine = (1. - smoothstep(0., .025 + aaf, vf.x)) * smoothstep(0., .4, spread - .45) * .55 * clamp(.03 / (aaf + .03), 0., 1.);
          float cr = max(crack, fine);
          float hgt = clamp((vOP.y - uBoxY.x) / (uBoxY.y - uBoxY.x), 0., 1.);
          float th = vc.y * .7 + (1. - hgt) * .3;
          if (uDissolve > 0. && th < uDissolve) discard;
          float edge = uDissolve > 0. ? 1. - smoothstep(0., .07, th - uDissolve) : 0.;
          diffuseColor.rgb = stone * (1. - cr * .75);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float fl = mix(1., .45 + 1.1 * fract(sin(floor(uTime * 24.) * 12.9 + vc.y * 31.) * 4375.85), uFlicker);
          totalEmissiveRadiance += uCrackColor * (cr * uGlow * fl + edge * (1.6 + uGlow * .25));`)
    }
    m.customProgramCacheKey = () => `hall-stone-${cell}`
    return m
  }
  private heroMaterial(orig: THREE.MeshStandardMaterial, skin: THREE.Texture | null | undefined, u: RimUniforms): THREE.MeshStandardMaterial {
    const m = this.own(orig.clone()); if (skin) m.map = skin
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u)
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRim; uniform vec3 uRimColor;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float fr = pow(1. - abs(dot(normalize(vViewPosition), normal)), 2.6);
          totalEmissiveRadiance += uRimColor * fr * uRim;`)
    }
    m.customProgramCacheKey = () => 'hall-hero'
    return m
  }

  // ── 석상 배치 ───────────────────────────────────────────
  private layout(n: number): Array<{ x: number; z: number; h: number; face: THREE.Vector3 }> {
    if (n === 1) return [{ x: 0, z: -3.2, h: 0.9, face: new THREE.Vector3(0, 0, 8) }]
    if (this.portrait()) {
      const rows: Array<[number, number, number]> = [[4, -8.2, 1.7], [3, -4.9, 1.05], [3, -1.6, 0.5]], out: Array<{ x: number; z: number; h: number; face: THREE.Vector3 }> = []
      for (const [cnt, z, h] of rows) for (let k = 0; k < cnt && out.length < n; k++) { const x = (k - (cnt - 1) / 2) * 2.55; out.push({ x, z, h, face: new THREE.Vector3(x * 0.47, 0, 14) }) }
      return out
    }
    return Array.from({ length: n }, (_, i) => {
      const a = THREE.MathUtils.degToRad(-72 + i * (144 / Math.max(1, n - 1)))
      return { x: Math.sin(a) * 8.2, z: 0.8 - Math.cos(a) * 8.2, h: 0.7 + Math.cos(a) * 0.35, face: new THREE.Vector3(0, 0, 7) }
    })
  }

  private buildStatues(): void {
    const slots = this.layout(this.entries.length)
    const pedGeo = this.own(new THREE.BoxGeometry(1, 1, 1))
    const rockGeo = this.kind === 'forge' ? this.rockGeometry() : null
    this.statues = this.entries.map((entry, i) => {
      const slot = slots[i], col = new THREE.Color(entry.color), forge = this.kind === 'forge'
      const root = this.add(new THREE.Group()); root.position.set(slot.x, 0, slot.z); root.lookAt(slot.face.x, 0, slot.face.z)
      // 받침대: 아래 굽 · 몸 · 위 갓 · 금테
      const W = forge ? 1.7 : 1.95, D = forge ? 1.7 : 3.7, H = slot.h
      const parts: Array<[number, number, number, number, THREE.Material]> = [[W + 0.25, 0.16, D + 0.25, 0.08, this.M.darkStone], [W, H - 0.3, D, 0.16 + (H - 0.3) / 2, this.M.stone], [W + 0.18, 0.14, D + 0.18, H - 0.07, this.M.darkStone]]
      for (const [w, h, d, y, mat] of parts) { const b = this.add(new THREE.Mesh(pedGeo, mat), root); b.scale.set(w, h, d); b.position.y = y; b.castShadow = b.receiveShadow = this.q !== 'low' }
      const trimMat = this.own(this.M.gold.clone()); trimMat.emissive = col.clone(); trimMat.emissiveIntensity = 0
      const trim = this.add(new THREE.Mesh(pedGeo, trimMat), root); trim.scale.set(W + 0.2, 0.035, D + 0.2); trim.position.y = H - 0.155
      const su: StoneUniforms = { uCrack: { value: 0 }, uGlow: { value: 0 }, uDissolve: { value: 0 }, uTime: { value: 0 }, uFlicker: { value: 0 }, uCrackColor: { value: new THREE.Color(1, 1, 1) }, uOrigin: { value: new THREE.Vector3() }, uBoxY: { value: new THREE.Vector2(0, 1) } }
      const hu: RimUniforms = { uRim: { value: 0 }, uRimColor: { value: col.clone() } }
      let stone: THREE.Object3D, hero: THREE.Object3D, mixer: THREE.AnimationMixer | null = null, height: number
      const found: { mesh: THREE.Mesh | null } = { mesh: null }
      let item: Statue['item'] = null
      if (!forge && entry.model) {
        const gltf = entry.model.gltf, box = new THREE.Box3().setFromObject(gltf.scene)
        height = box.max.y
        su.uOrigin.value.set(0, box.max.y * 0.74, -0.15); su.uBoxY.value.set(box.min.y, box.max.y)
        stone = SkeletonUtils.clone(gltf.scene); hero = SkeletonUtils.clone(gltf.scene)
        stone.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = this.stoneMaterial(m.material as THREE.MeshStandardMaterial, su, 3.1); m.castShadow = this.q !== 'low'; m.frustumCulled = false; found.mesh = m } })
        hero.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = this.heroMaterial(m.material as THREE.MeshStandardMaterial, entry.model?.skin, hu); m.castShadow = this.q !== 'low'; m.frustumCulled = false } })
        const pose = (obj: THREE.Object3D) => { const mx = new THREE.AnimationMixer(obj); for (const name of ['MountedIdle', 'HorseIdle']) { const clip = gltf.animations.find(a => a.name === name); if (clip) mx.clipAction(clip).play() } mx.update(0.05); return mx }
        pose(stone).stopAllAction(); mixer = pose(hero)
      } else {
        // 장비: 봉인석 → 떠오르는 보물
        height = 2.4
        su.uOrigin.value.set(0, 0.4, 0.2); su.uBoxY.value.set(-1.2, 1.2)
        const rockMat = this.stoneMaterial({}, su, 3.4); rockMat.color.set(0x8c857c); rockMat.flatShading = true
        const rock = new THREE.Mesh(rockGeo!, rockMat); rock.castShadow = this.q !== 'low'; rock.position.y = 1.2; found.mesh = rock
        stone = new THREE.Group(); stone.add(rock)
        hero = new THREE.Group()
        item = this.makeItem(entry, col, hu); item.group.position.y = 1.35; hero.add(item.group)
      }
      stone.position.y = hero.position.y = H
      root.add(stone, hero); hero.visible = false
      root.updateMatrixWorld(true)
      const center = new THREE.Vector3(0, H + height * 0.55, 0).applyMatrix4(root.matrixWorld)
      const fwd = new THREE.Vector3(0, 0, 1).transformDirection(root.matrixWorld).setY(0).normalize()
      return { entry, root, stone, stoneMesh: found.mesh!, hero, su, hu, mixer, trimMat, H, center, fwd, col, revealed: false, animate: false, pillar: null, item }
    })
  }
  private rockGeometry(): THREE.BufferGeometry {
    const base = new THREE.IcosahedronGeometry(1, 2); base.deleteAttribute('normal'); base.deleteAttribute('uv')
    const g = mergeVertices(base), p = g.attributes.position, v = new THREE.Vector3()
    const seeds = Array.from({ length: 6 }, () => ({ d: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), f: rand(2, 5), a: rand(0.03, 0.08) }))
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      let k = rand(0.94, 1.06); for (const s of seeds) k += Math.sin(v.dot(s.d) * s.f) * s.a
      // 위는 둥글게 좁아지고 아래는 넓은 봉인석
      v.multiplyScalar(k); p.setXYZ(i, v.x * 0.78 * (1.08 - v.y * 0.12), v.y * 1.2, v.z * 0.78 * (1.08 - v.y * 0.12))
    }
    const faceted = g.toNonIndexed(); faceted.computeVertexNormals(); base.dispose(); g.dispose()
    return this.own(faceted)
  }
  private makeItem(entry: HallEntry, col: THREE.Color, hu: RimUniforms): NonNullable<Statue['item']> {
    const group = new THREE.Group()
    const tex = this.own(new THREE.TextureLoader().load(entry.image ?? ''))
    tex.colorSpace = THREE.SRGBColorSpace
    const card = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1.5, 1.5)), this.own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0 })))
    card.renderOrder = 4
    const glow = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: this.glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })))
    glow.scale.set(3.4, 3.4, 1); glow.renderOrder = 3
    const ring = new THREE.Mesh(this.own(new THREE.TorusGeometry(1.05, 0.02, 8, 80)), this.own(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })))
    group.add(glow, card, ring)
    hu.uRim.value = 0
    return { group, card, glow, ring }
  }

  // ── 시간 · 보간 ─────────────────────────────────────────
  private tween(dur: number, fn: (k: number) => void, ease: (x: number) => number = easeInOut): Promise<void> {
    return new Promise(res => this.tweens.push({ t: 0, dur: Math.max(dur, 1e-4), fn, ease, res }))
  }
  private wait(s: number): Promise<void> { return this.tween(s, () => {}) }
  private check(): void { if (this.skip) throw SKIP }
  private moveCam(pos: THREE.Vector3, look: THREE.Vector3, dur: number, ease = easeInOut): Promise<void> {
    const p0 = this.camPos.clone(), l0 = this.camLook.clone()
    return this.tween(dur, k => { this.camPos.lerpVectors(p0, pos, k); this.camLook.lerpVectors(l0, look, k) }, ease)
  }
  private zoom(fov: number, dur: number): Promise<void> {
    const f0 = this.camera.fov
    return this.tween(dur, k => { this.camera.fov = f0 + (fov - f0) * k; this.camera.updateProjectionMatrix() })
  }
  private wideShot(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const a = this.camera.aspect, n = this.entries.length
    if (n === 1) { const look = new THREE.Vector3(0, 2.2, -3.2); return { pos: look.clone().add(new THREE.Vector3(0, 0.9, a < 1 ? 11 : 7.6)), look } }
    const look = new THREE.Vector3(0, a < 1 ? 2.3 : 1.9, a < 1 ? -4.6 : -2.6), halfW = a < 1 ? 5.4 : 8.7
    const d = Math.max(9, halfW / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * a))
    return { pos: look.clone().addScaledVector(new THREE.Vector3(0, 0.3, 1).normalize(), d), look }
  }
  private closeShot(s: Statue): { pos: THREE.Vector3; look: THREE.Vector3; side: THREE.Vector3 } {
    const side = new THREE.Vector3(-s.fwd.z, 0, s.fwd.x), far = this.portrait() ? 1.25 : 1
    const pos = s.center.clone().addScaledVector(s.fwd, 10 * far).addScaledVector(side, 1.6 * far); pos.y = s.H + 1.05
    // 세로 화면은 석상이 여러 줄이라 앞줄 너머로 내려다본다
    if (this.portrait()) { pos.y = Math.max(pos.y, 3.4 + s.H * 1.6); return { pos, look: s.center.clone().add(new THREE.Vector3(0, 0.05, 0)), side } }
    return { pos, look: s.center.clone().add(new THREE.Vector3(0, 0.25, 0)), side }
  }
  private setCrack(s: Statue, opt: { color?: THREE.ColorRepresentation; spread?: number; glow?: number; flicker?: number }, dur: number, ease = easeOut): Promise<void> {
    const u = s.su, c0 = u.uCrackColor.value.clone(), c1 = opt.color !== undefined ? new THREE.Color(opt.color) : c0, s0 = u.uCrack.value, g0 = u.uGlow.value
    if (opt.flicker !== undefined) u.uFlicker.value = opt.flicker
    return this.tween(dur, k => {
      u.uCrackColor.value.lerpColors(c0, c1, k)
      if (opt.spread !== undefined) u.uCrack.value = s0 + (opt.spread - s0) * k
      if (opt.glow !== undefined) u.uGlow.value = g0 + (opt.glow - g0) * k
    }, ease)
  }
  private lights(k: number, dur: number): Promise<void> {
    const b = this.lightBase
    return this.tween(dur, t => { const f = 1 + (k - 1) * t; this.hemi.intensity = b.hemi * f; this.key.intensity = b.key * f; this.wall.material.emissiveIntensity = b.wall * f; (this.mainShaft.material.uniforms.uOpacity as Uniform<number>).value = 0.34 * f })
  }

  // ── 깨짐 ───────────────────────────────────────────────
  private surfacePoint(s: Statue): THREE.Vector3 {
    const m = s.stoneMesh, p = m.geometry.attributes.position, i = Math.floor(Math.random() * p.count), v = new THREE.Vector3().fromBufferAttribute(p, i)
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).applyBoneTransform(i, v)
    return v.applyMatrix4(m.matrixWorld)
  }
  private shatter(s: Statue, big = false): void {
    if (s.revealed) return
    s.revealed = true
    const g = s.entry.rank, col = s.col, lowFx = this.q === 'low'
    s.hero.visible = true; s.hu.uRim.value = big ? 2 : 1.4
    s.su.uFlicker.value = 0; s.su.uCrackColor.value.copy(col)
    void this.tween(big ? 1.0 : 0.6, k => { s.su.uDissolve.value = 0.02 + k * 1.05 }, linear).then(() => { s.stone.visible = false })
    void this.tween(big ? 1.6 : 1.2, k => { s.hu.uRim.value = (big ? 2 : 1.4) * (1 - k) + (g >= 4 ? 0.35 : g === 3 ? 0.2 : 0) }, easeOut)
    void this.tween(0.9, k => { s.trimMat.emissiveIntensity = k * (g >= 4 ? 3 : 1.4) })
    if (s.item) {
      const it = s.item
      it.group.scale.setScalar(0.2)
      void this.tween(big ? 1.1 : 0.7, k => { it.group.scale.setScalar(0.2 + 0.8 * k); (it.card.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k * 1.5); it.glow.material.opacity = k * (g >= 4 ? 0.85 : 0.5); (it.ring.material as THREE.MeshBasicMaterial).opacity = k * (g >= 3 ? 0.8 : 0.35) }, easeOut)
    }
    s.animate = true
    // 돌 조각
    s.stoneMesh.updateMatrixWorld(true)
    const count = Math.round((big ? 130 : g >= 3 ? 70 : 46) * (lowFx ? 0.45 : 1))
    const emitMat = this.own(this.chunkMat.clone()); emitMat.emissive = col.clone(); emitMat.emissiveIntensity = big ? 3.5 : 2.2
    void this.tween(1.4, k => { emitMat.emissiveIntensity = (big ? 3.5 : 2.2) * (1 - k) }, linear)
    for (let k = 0; k < count; k++) {
      const p = this.surfacePoint(s), m = new THREE.Mesh(pick(this.chunkGeos), Math.random() < 0.35 ? emitMat : this.chunkMat), sc = rand(0.035, big ? 0.17 : 0.13)
      m.scale.setScalar(sc); m.position.copy(p); m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6))
      const out = p.clone().sub(s.center).setY(0).normalize().multiplyScalar(rand(1, big ? 6.5 : 3.6))
      out.addScaledVector(s.fwd, rand(0, big ? 1.4 : 0.8))
      m.userData = { v: out.setY(rand(0.5, big ? 5.5 : 3.2)), w: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), t: 0, sc, s }
      if (big && !lowFx) m.castShadow = true
      this.add(m); this.chunks.push(m)
    }
    // 연기 · 불티 · 충격파 · 섬광
    for (let k = 0; k < (lowFx ? 4 : big ? 18 : 9); k++) {
      const sp = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0x7a6f66, transparent: true, depthWrite: false, opacity: 0 }))), p = s.center.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1.2, 0.8), rand(-1.2, 1.2)))
      sp.position.copy(p); sp.userData = { t: 0, life: rand(1.6, 2.8), s0: rand(0.5, 0.9), s1: rand(1.6, big ? 3.4 : 2.4), v: p.clone().sub(s.center).multiplyScalar(0.5).setY(rand(0.1, 0.5)) }
      this.add(sp); this.puffs.push(sp)
    }
    this.sparks.emit(s.center, big ? 150 : 60, col, { speed: big ? 3.2 : 2.4, up: big ? 3.6 : 2.2, life: big ? 1.6 : 1.1, spread: 0.6, spreadY: 1, gravity: -4 })
    if (g >= 3) {
      const r = new THREE.Mesh(this.ringGeo, this.own(new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })))
      r.rotation.x = -Math.PI / 2; r.position.copy(s.center).setY(s.H + 0.02); r.userData = { t: 0, life: big ? 1.1 : 0.7, max: big ? 9 : 3.5 }; this.add(r); this.rings.push(r)
    }
    this.flash.position.copy(s.center); this.flash.color.copy(col)
    void this.tween(big ? 0.9 : 0.5, k => { this.flash.intensity = (1 - k) * (big ? 110 : 55) }, linear)
    if (g >= 4) {
      const pil = this.mesh(new THREE.CylinderGeometry(0.9, 1.3, 13, 40, 1, true), this.shaftMat(col, 0, s.H, 13))
      pil.position.copy(s.center).setY(6.5); s.pillar = pil
      void this.tween(1.2, k => { (pil.material.uniforms.uOpacity as Uniform<number>).value = k * (g === 5 ? 0.32 : 0.26) }, easeOut)
    }
    const gu = this.grade.uniforms as unknown as Record<string, Uniform<number>>
    if (big) {
      this.shake = 0.32
      void this.tween(1.2, k => { this.bloom.strength = 0.75 + Math.sin(k * Math.PI) * 0.7; gu.uCA.value = 0.0025 + (1 - k) * 0.008 }, easeOut)
      void this.tween(0.35, k => { gu.uFlash.value = (1 - k) * 0.28 }, easeOut)
    } else if (g >= 3) this.shake = Math.max(this.shake, 0.06)
  }

  // ── 화면 요소 ───────────────────────────────────────────
  private releaseTap(): void { const r = this.tapResolve; this.tapResolve = null; r?.() }
  private waitTap(max: number): Promise<void> {
    return new Promise(res => { this.tapResolve = res; void this.wait(max).then(() => { if (this.tapResolve === res) { this.tapResolve = null; res() } }) })
  }
  private showCaption(e: HallEntry): void {
    const c = this.ui.caption
    c.style.setProperty('--c', e.color)
    c.classList.toggle('is-plain', e.rank < 5)
    c.querySelector('.sh-caption__grade')!.textContent = e.label
    // 영어 화면에서는 이름을 먼저 통째로 옮긴 뒤 글자로 나눈다(한 글자씩 번역되지 않게)
    c.querySelector('.sh-caption__name')!.innerHTML = [...tr(e.name)].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')
    c.querySelector('.sh-caption__sub')!.textContent = e.sub
    c.classList.add('is-on'); this.ui.tap.hidden = false
  }
  private hideCaption(): void { this.ui.caption.classList.remove('is-on'); this.ui.tap.hidden = true }

  // ── 연출 흐름 ───────────────────────────────────────────
  async play(): Promise<void> {
    this.buildStatues()
    this.renderer.compile(this.scene, this.camera)
    requestAnimationFrame(() => this.layer.classList.add('is-on'))
    this.timer.connect(document)
    this.renderer.setAnimationLoop(() => this.frame())
    const W = this.wideShot(), n = this.entries.length
    try {
      // 1) 천장 빛기둥을 따라 내려오며 전당 등장
      this.camPos.set(0, 11.5, 3.5); this.camLook.set(0, 4, -4)
      this.ui.intro.classList.add('is-on')
      await this.moveCam(W.pos, W.look, 2.6); this.check()
      this.ui.intro.classList.remove('is-on')
      // 2) 모든 석상에 흰 실금 — 결과는 아직 모름
      const hairline = this.kind === 'forge' ? { spread: 0.28, glow: 0.9 } : { spread: 0.38, glow: 1.6 }
      this.statues.forEach((s, i) => { void this.wait(i * 0.08).then(() => this.setCrack(s, { color: '#fff1d6', ...hairline }, 0.9)) })
      for (const b of this.braziers) void this.tween(0.6, k => { b.light.intensity = b.base * (1 + Math.sin(k * Math.PI) * 0.8) })
      await this.wait(n === 1 ? 1.1 : 1.5); this.check()
      const order = this.statues.map(s => ({ s, k: s.entry.rank + Math.random() * 0.5 })).sort((a, b) => a.k - b.k).map(o => o.s)
      const stars = order.filter(s => s.entry.star), rest = order.filter(s => !s.entry.star)
      const low = rest.filter(s => s.entry.rank <= 3), mid = rest.filter(s => s.entry.rank >= 4)
      if (n > 1) void this.moveCam(W.pos.clone().add(new THREE.Vector3(0, -0.4, -1.2)), W.look, 4.5, linear)
      // 3) 낮은 등급부터 금빛이 차오르며 깨짐
      for (const s of low) {
        void this.setCrack(s, { color: s.entry.color, spread: 1, glow: s.entry.rank === 3 ? 4 : 2.6, flicker: s.entry.rank === 3 ? 1 : 0 }, 0.34)
        await this.wait(0.32); this.check(); this.shatter(s); await this.wait(n === 1 ? 0.3 : 0.18); this.check()
      }
      if (low.length) { await this.wait(0.45); this.check() }
      // 4) 그다음 등급: 번개처럼 튀다가 깨짐
      if (mid.length) {
        mid.forEach(s => { void this.setCrack(s, { color: s.entry.color, spread: 1, glow: 5, flicker: 1 }, 0.6) })
        this.shake = 0.05; await this.wait(0.9); this.check()
        for (const s of mid) { this.shatter(s); await this.wait(0.24); this.check() }
        await this.wait(0.55); this.check()
      }
      // 5) 최고 등급: 한 명(하나)씩 — 어두워짐 → 클로즈업 → 흰 금 → 등급 빛 → 폭발 → 이름
      for (const s of stars) {
        this.ui.bars.classList.add('is-on')
        void this.lights(0.35, 1.0)
        const C = this.closeShot(s)
        void this.zoom(this.portrait() ? 34 : 23, 1.1)
        await this.moveCam(C.pos, C.look, 1.1); this.check()
        this.focus.position.copy(s.center).add(new THREE.Vector3(0, 8, 0)); this.focus.target.position.copy(s.center); this.focus.color.set(s.entry.color)
        void this.tween(2.2, k => { this.focus.intensity = k * 160 })
        void this.moveCam(C.pos.clone().lerp(C.look, 0.16), C.look, 2.6, linear)
        await this.setCrack(s, { color: '#fff4dc', spread: 0.7, glow: 1.8, flicker: 1 }, 1.0); this.check()
        const emberTimer = window.setInterval(() => this.embers.emit(s.center.clone().setY(s.H + 0.2), 5, s.entry.color, { speed: 0.6, up: 1.4, life: 2.2, spread: 1.2, spreadY: 0.1, gravity: 0.9 }), 40)
        void this.tween(1.5, k => { this.shake = Math.max(this.shake, 0.02 + k * 0.07) }, linear)
        try { await this.setCrack(s, { color: s.entry.color, spread: 1.15, glow: 3.2 }, 1.5, easeInOut) } finally { window.clearInterval(emberTimer) }
        this.check()
        this.shatter(s, true)
        this.onStar?.(s.entry)
        void this.tween(0.6, k => { this.focus.intensity = 160 - k * 90 })
        void this.lights(0.7, 1.2)
        await this.wait(0.8); this.check()
        this.showCaption(s.entry)
        // 장비는 화면 위쪽에 오게(아래 자막에 가리지 않게)
        void this.moveCam(C.pos.clone().addScaledVector(C.side, -3.2).addScaledVector(s.fwd, -0.6), C.look.clone().add(new THREE.Vector3(0, s.item ? -0.85 : 0.1, 0)), 3.6, easeOut)
        await this.waitTap(2.6); this.check()
        this.hideCaption()
        void this.tween(0.8, k => { this.focus.intensity = 70 * (1 - k) })
        this.ui.bars.classList.remove('is-on')
        void this.lights(1, 1.0)
        void this.zoom(this.baseFov, 1.2)
      }
      // 6) 깨어난 전당 전체
      await this.moveCam(W.pos, W.look, stars.length ? 1.4 : 0.8); this.check()
      await this.wait(1.2); this.check()
    } catch (error) {
      if (error !== SKIP) throw error
    }
    this.layer.classList.add('is-out')
    await new Promise<void>(res => window.setTimeout(res, 320))
  }
  /** 최고 등급이 드러나는 순간(소리 등) */
  onStar: ((entry: HallEntry) => void) | null = null

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h)
    this.camera.aspect = w / h; this.baseFov = this.camera.aspect < 1 ? 60 : 42; this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix()
    const dpr = this.renderer.getPixelRatio()
    this.reflector?.getRenderTarget().setSize(Math.round(w * dpr * 0.5), Math.round(h * dpr * 0.5))
  }

  // ── 매 프레임 ───────────────────────────────────────────
  private frame(): void {
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), 1 / 30)
    this.time += dt
    const t = this.time
    for (const tw of [...this.tweens]) {
      tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.fn(tw.ease(k))
      if (k >= 1 || this.skip) { if (k < 1) tw.fn(1); const i = this.tweens.indexOf(tw); if (i >= 0) this.tweens.splice(i, 1); tw.res() }
    }
    for (const s of this.statues) {
      s.su.uTime.value = t
      if (s.animate && s.mixer) s.mixer.update(dt)
      if (s.item && s.revealed) {
        const it = s.item
        it.group.position.y = 1.35 + Math.sin(t * 1.6 + s.center.x) * 0.06
        it.card.lookAt(this.camera.position.x, it.card.getWorldPosition(new THREE.Vector3()).y, this.camera.position.z)
        it.ring.rotation.set(Math.PI / 2 + Math.sin(t * 0.7) * 0.25, t * 0.8, 0)
      }
    }
    for (const m of this.animated) (m.uniforms.uTime as Uniform<number>).value = t
    this.bannerTime.value = t
    for (const b of this.braziers) { b.flame.lookAt(this.camera.position.x, b.g.position.y + 2.45, this.camera.position.z); b.light.intensity = b.base * (0.82 + Math.sin(t * 13 + b.g.position.x) * 0.08 + Math.random() * 0.14) }
    const lp = new THREE.Vector3()
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i], u = c.userData as { v: THREE.Vector3; w: THREE.Vector3; t: number; sc: number; s: Statue }
      u.t += dt; u.v.y -= 9.8 * dt; c.position.addScaledVector(u.v, dt)
      lp.copy(c.position); u.s.root.worldToLocal(lp)
      const half = this.kind === 'forge' ? 0.95 : 1.1, halfD = this.kind === 'forge' ? 0.95 : 1.95
      const gy = (Math.abs(lp.x) < half && Math.abs(lp.z) < halfD ? u.s.H : 0) + u.sc * 0.5
      if (c.position.y < gy) { c.position.y = gy; u.v.y *= -0.25; u.v.x *= 0.55; u.v.z *= 0.55; u.w.multiplyScalar(0.5) }
      c.rotation.x += u.w.x * dt; c.rotation.y += u.w.y * dt; c.rotation.z += u.w.z * dt
      if (u.t > 3.4) { const k = 1 - (u.t - 3.4); c.scale.setScalar(u.sc * Math.max(0, k)); if (k <= 0) { this.scene.remove(c); this.chunks.splice(i, 1) } }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i], u = p.userData as { t: number; life: number; s0: number; s1: number; v: THREE.Vector3 }
      u.t += dt; const k = u.t / u.life
      p.position.addScaledVector(u.v, dt); u.v.multiplyScalar(0.97)
      const sc = u.s0 + (u.s1 - u.s0) * easeOut(Math.min(k, 1)); p.scale.set(sc, sc, 1)
      p.material.opacity = Math.sin(Math.min(k, 1) * Math.PI) * 0.26; p.material.rotation += dt * 0.2
      if (k >= 1) { this.scene.remove(p); this.puffs.splice(i, 1) }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i], u = r.userData as { t: number; life: number; max: number }
      u.t += dt; const k = u.t / u.life, sc = 0.5 + easeOut(Math.min(k, 1)) * u.max
      r.scale.set(sc, sc, 1); (r.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 1.4
      if (k >= 1) { this.scene.remove(r); this.rings.splice(i, 1) }
    }
    this.sparks.update(dt); this.embers.update(dt)
    const dp = this.dust.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < dp.count; i++) { let y = dp.getY(i) - dt * 0.08; if (y < 0) y = 11; dp.setY(i, y) }
    dp.needsUpdate = true; this.dust.rotation.y = t * 0.015
    ;(this.grade.uniforms as unknown as Record<string, Uniform<number>>).uTime.value = t
    this.shake *= Math.pow(0.02, dt)
    this.camera.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake * 0.5))
    this.camera.lookAt(this.camLook)
    this.composer.render()
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.timer.dispose()
    window.removeEventListener('resize', this.onResize)
    this.sparks?.dispose(); this.embers?.dispose()
    for (const item of this.garbage) { try { item.dispose() } catch { /* 이미 정리됨 */ } }
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.layer.remove()
  }
}

/** 불티 · 불씨 입자 */
class Sparks {
  private readonly pos: Float32Array
  private readonly col: Float32Array
  private readonly base: Float32Array
  private readonly vel: Float32Array
  private readonly life: Float32Array
  private readonly max: Float32Array
  private readonly grav: Float32Array
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  private i = 0
  constructor(scene: THREE.Scene, private readonly cap: number, size: number) {
    this.pos = new Float32Array(cap * 3).fill(-999); this.col = new Float32Array(cap * 3); this.base = new Float32Array(cap * 3)
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.grav = new Float32Array(cap)
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3))
    const glow = document.createElement('canvas'); glow.width = glow.height = 64
    const g = glow.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64)
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: new THREE.CanvasTexture(glow), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    this.points.frustumCulled = false; this.points.renderOrder = 8
    scene.add(this.points)
  }
  emit(o: THREE.Vector3, count: number, color: THREE.ColorRepresentation, opt: { speed?: number; up?: number; life?: number; spread?: number; spreadY?: number; gravity?: number } = {}): void {
    const { speed = 2, up = 1.5, life = 1.4, spread = 0.4, spreadY = 0.6, gravity = -1.2 } = opt, c = new THREE.Color(color)
    for (let k = 0; k < count; k++) {
      const i = this.i = (this.i + 1) % this.cap, j = i * 3, a = Math.random() * Math.PI * 2, s = speed * rand(0.25, 1)
      this.pos[j] = o.x + rand(-spread, spread); this.pos[j + 1] = o.y + rand(-spreadY, spreadY); this.pos[j + 2] = o.z + rand(-spread, spread)
      this.vel[j] = Math.cos(a) * s; this.vel[j + 1] = rand(0.2, 1) * up; this.vel[j + 2] = Math.sin(a) * s
      const b = rand(0.7, 1.3); this.base[j] = c.r * b; this.base[j + 1] = c.g * b; this.base[j + 2] = c.b * b
      this.life[i] = this.max[i] = life * rand(0.5, 1.2); this.grav[i] = gravity
    }
  }
  update(dt: number): void {
    for (let i = 0; i < this.cap; i++) {
      const j = i * 3
      if (this.life[i] <= 0) { this.pos[j + 1] = -999; continue }
      this.life[i] -= dt; const f = Math.min(1, Math.max(0, this.life[i] / this.max[i]) * 3)
      this.vel[j + 1] += this.grav[i] * dt; this.vel[j] *= 0.98; this.vel[j + 2] *= 0.98
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt
      this.col[j] = this.base[j] * f; this.col[j + 1] = this.base[j + 1] * f; this.col[j + 2] = this.base[j + 2] * f
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true
  }
  dispose(): void { this.points.geometry.dispose(); this.points.material.map?.dispose(); this.points.material.dispose() }
}
