// 영토 지도: 정사각형 창 + 확대·이동 + 확대 단계별 표시 + 이름 겹침 숨김 + 가까운 도시 선택.
//
// 지도 그림(1152×648, 16:9)은 "월드 레이어"에 원래 비율 그대로 그리고, 도시 좌표(%)도 그 그림 기준이다.
// 정사각형 창(viewport)은 월드 레이어의 일부를 보여 주고, 확대(zoom)·중심(cx, cy)은 이 객체에 남아서
// StrategyUI가 화면을 통째로 다시 그려도(innerHTML) 그대로 복원된다.

export const MAP_WIDTH = 1152
export const MAP_HEIGHT = 648
const MAX_ZOOM = 4
const TAP_SLOP = 7 // px: 이보다 적게 움직이면 '누르기', 많이 움직이면 '끌기'
const HINT_KEY = 'cheonha.mapHintSeen'

function hintSeen(): boolean {
  try { return window.localStorage.getItem(HINT_KEY) === '1' } catch { return false }
}
function rememberHint(): void {
  try { window.localStorage.setItem(HINT_KEY, '1') } catch { /* 저장 불가 환경: 이번 화면에서만 숨김 */ }
}

export type MapLod = 'far' | 'mid' | 'near'

export interface MapCity {
  id: string
  name: string
  x: number // 0~100 (% of map width)
  y: number // 0~100 (% of map height)
  priority: number // 클수록 이름을 먼저 배치
}

export interface MapViewState {
  cx: number // 0~1 화면 중심이 보는 지도 위치
  cy: number
  zoom: number // 1 = 창을 빈틈없이 채우는 크기(cover)
}

export interface MapTransform { scale: number; tx: number; ty: number; zoom: number; minZoom: number }

/** 창 크기와 보기 상태로 월드 레이어 변환을 계산하고, 지도가 창 밖으로 벗어나지 않게 맞춘다. */
export function computeTransform(view: MapViewState, vw: number, vh: number): { transform: MapTransform; view: MapViewState } {
  const cover = Math.max(vw / MAP_WIDTH, vh / MAP_HEIGHT)
  const contain = Math.min(vw / MAP_WIDTH, vh / MAP_HEIGHT)
  const minZoom = contain / cover
  const zoom = Math.min(MAX_ZOOM, Math.max(minZoom, view.zoom))
  const scale = cover * zoom
  const ww = MAP_WIDTH * scale
  const wh = MAP_HEIGHT * scale
  let tx = vw / 2 - view.cx * ww
  let ty = vh / 2 - view.cy * wh
  tx = ww >= vw ? Math.min(0, Math.max(vw - ww, tx)) : (vw - ww) / 2
  ty = wh >= vh ? Math.min(0, Math.max(vh - wh, ty)) : (vh - wh) / 2
  const next = { cx: (vw / 2 - tx) / ww, cy: (vh / 2 - ty) / wh, zoom }
  return { transform: { scale, tx, ty, zoom, minZoom }, view: next }
}

/** 화면에 보이는 지도 너비로 표시 단계를 정한다(기기 크기와 무관). */
export function lodFor(scale: number): MapLod {
  const width = MAP_WIDTH * scale
  return width < 900 ? 'far' : width < 1500 ? 'mid' : 'near'
}

export function screenPoint(city: Pick<MapCity, 'x' | 'y'>, t: Pick<MapTransform, 'scale' | 'tx' | 'ty'>): { sx: number; sy: number } {
  return { sx: t.tx + (city.x / 100) * MAP_WIDTH * t.scale, sy: t.ty + (city.y / 100) * MAP_HEIGHT * t.scale }
}

const LABEL_OFFSET: Record<MapLod, number> = { far: 13, mid: 24, near: 36 }

/** 이름표가 겹치지 않게 중요한 도시부터 배치하고, 자리가 없는 도시 id 목록을 돌려준다. */
export function hiddenLabels(cities: MapCity[], t: MapTransform, lod: MapLod, selectedId: string, vw: number, vh: number): Set<string> {
  const order = [...cities].sort((a, b) => (b.id === selectedId ? 1e6 : b.priority) - (a.id === selectedId ? 1e6 : a.priority))
  const placed: Array<[number, number, number, number]> = []
  const hidden = new Set<string>()
  for (const city of order) {
    const { sx, sy } = screenPoint(city, t)
    const w = city.name.length * 13 + 12
    const h = 18
    const box: [number, number, number, number] = [sx - w / 2, sy + LABEL_OFFSET[lod] - h / 2, sx + w / 2, sy + LABEL_OFFSET[lod] + h / 2]
    const offscreen = box[2] < 0 || box[0] > vw || box[3] < 0 || box[1] > vh
    if (offscreen) continue
    const hits = placed.some(p => box[0] < p[2] && p[0] < box[2] && box[1] < p[3] && p[1] < box[3])
    if (hits && city.id !== selectedId) { hidden.add(city.id); continue }
    placed.push(box)
  }
  return hidden
}

/** 누른 위치에서 가장 가까운 도시(반경 안)를 찾는다. */
export function nearestCity(cities: MapCity[], t: MapTransform, px: number, py: number, radius: number): string | null {
  let best: string | null = null
  let bestDistance = radius
  for (const city of cities) {
    const { sx, sy } = screenPoint(city, t)
    const d = Math.hypot(sx - px, sy - py)
    if (d <= bestDistance) { bestDistance = d; best = city.id }
  }
  return best
}

const TAP_RADIUS: Record<MapLod, number> = { far: 30, mid: 38, near: 48 }

export class TerritoryMapController {
  private view: MapViewState = { cx: 0.55, cy: 0.5, zoom: 1 }
  private initialized = false
  private viewport: HTMLElement | null = null
  private world: HTMLElement | null = null
  private cities: MapCity[] = []
  private selectedId = ''
  private transform: MapTransform | null = null
  private frame = 0
  private settleTimer = 0
  private animation = 0
  private resize: ResizeObserver | null = null
  private pointers = new Map<number, { x: number; y: number }>()
  private gesture: { moved: boolean; startX: number; startY: number; startView: MapViewState; startDistance: number; startMid: { x: number; y: number } } | null = null
  private pendingFocus: string | null = null
  fullscreen = false

  constructor(private readonly onSelect: (id: string) => void) {}

  /** 다시 그려진 지도 DOM에 연결한다. homeId: 처음 열 때 중심으로 삼을 도시(내 수도). */
  attach(viewport: HTMLElement, cities: MapCity[], selectedId: string, homeId: string): void {
    this.detach()
    this.viewport = viewport
    this.world = viewport.querySelector<HTMLElement>('[data-map-world]')
    this.cities = cities
    this.selectedId = selectedId
    if (!this.initialized) {
      const home = cities.find(c => c.id === homeId) ?? cities.find(c => c.id === selectedId)
      if (home) this.view = { cx: home.x / 100, cy: home.y / 100, zoom: 1 }
      this.initialized = true
    }
    viewport.classList.toggle('is-hint-seen', hintSeen())
    viewport.closest('.territory-map')?.classList.toggle('is-fullscreen', this.fullscreen)
    document.body.classList.toggle('map-fullscreen-open', this.fullscreen)
    viewport.addEventListener('pointerdown', this.onPointerDown)
    viewport.addEventListener('pointermove', this.onPointerMove)
    viewport.addEventListener('pointerup', this.onPointerUp)
    viewport.addEventListener('pointercancel', this.onPointerUp)
    viewport.addEventListener('wheel', this.onWheel, { passive: false })
    viewport.addEventListener('click', this.onControlClick)
    this.resize = new ResizeObserver(() => this.apply())
    this.resize.observe(viewport)
    this.apply()
    if (this.pendingFocus) { const id = this.pendingFocus; this.pendingFocus = null; this.focusCity(id) }
  }

  detach(): void {
    const v = this.viewport
    if (!v) return
    v.removeEventListener('pointerdown', this.onPointerDown)
    v.removeEventListener('pointermove', this.onPointerMove)
    v.removeEventListener('pointerup', this.onPointerUp)
    v.removeEventListener('pointercancel', this.onPointerUp)
    v.removeEventListener('wheel', this.onWheel)
    v.removeEventListener('click', this.onControlClick)
    this.resize?.disconnect()
    this.resize = null
    this.viewport = null
    this.world = null
    this.pointers.clear()
    this.gesture = null
  }

  /** 다음에 지도가 연결되면(또는 지금) 해당 도시로 부드럽게 이동한다. */
  focusCity(id: string, minZoom = 1.6): void {
    const city = this.cities.find(c => c.id === id)
    if (!city || !this.viewport) { this.pendingFocus = id; return }
    this.animateTo({ cx: city.x / 100, cy: city.y / 100, zoom: Math.max(this.view.zoom, minZoom) })
  }

  queueFocus(id: string): void { this.pendingFocus = id }

  zoomBy(factor: number, ax?: number, ay?: number): void {
    if (!this.viewport) return
    const { width, height } = this.viewport.getBoundingClientRect()
    this.zoomAround(this.view.zoom * factor, ax ?? width / 2, ay ?? height / 2, this.view)
    this.apply()
  }

  setFullscreen(on: boolean): void {
    this.fullscreen = on
    this.viewport?.closest('.territory-map')?.classList.toggle('is-fullscreen', on)
    document.body.classList.toggle('map-fullscreen-open', on)
    const button = this.viewport?.querySelector<HTMLElement>('[data-map-action="fullscreen"]')
    if (button) { button.textContent = on ? '✕' : '□'; button.setAttribute('aria-label', on ? '전체 화면 닫기' : '지도 전체 화면') }
    requestAnimationFrame(() => this.apply())
  }

  getView(): MapViewState { return { ...this.view } }

  private zoomAround(nextZoom: number, ax: number, ay: number, from: MapViewState): void {
    if (!this.viewport) return
    const { width: vw, height: vh } = this.viewport.getBoundingClientRect()
    const before = computeTransform(from, vw, vh).transform
    // 손가락(또는 커서) 아래의 지도 지점이 확대 후에도 같은 화면 위치에 있도록 중심을 옮긴다.
    const mx = (ax - before.tx) / (MAP_WIDTH * before.scale)
    const my = (ay - before.ty) / (MAP_HEIGHT * before.scale)
    const probe = computeTransform({ ...from, zoom: nextZoom }, vw, vh).transform
    const ww = MAP_WIDTH * probe.scale
    const wh = MAP_HEIGHT * probe.scale
    this.view = { zoom: probe.zoom, cx: (vw / 2 - (ax - mx * ww)) / ww, cy: (vh / 2 - (ay - my * wh)) / wh }
  }

  private animateTo(target: MapViewState): void {
    cancelAnimationFrame(this.animation)
    const from = { ...this.view }
    const start = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 280)
      const e = 1 - (1 - k) ** 3
      this.view = { cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e, zoom: from.zoom + (target.zoom - from.zoom) * e }
      this.apply(true)
      if (k < 1) this.animation = requestAnimationFrame(step)
    }
    this.animation = requestAnimationFrame(step)
  }

  /** 변환·표시 단계·이름 숨김을 화면에 반영한다. immediate가 아니면 다음 프레임에 한 번만. */
  apply(immediate = false): void {
    if (!immediate) {
      if (this.frame) return
      this.frame = requestAnimationFrame(() => { this.frame = 0; this.apply(true) })
      return
    }
    const viewport = this.viewport
    const world = this.world
    if (!viewport || !world) return
    const { width: vw, height: vh } = viewport.getBoundingClientRect()
    if (!vw || !vh) return
    const { transform, view } = computeTransform(this.view, vw, vh)
    this.view = view
    this.transform = transform
    world.style.transform = `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`
    // 움직이는 동안만 한 장의 그림으로 늘려 부드럽게, 멈추면 그 배율로 다시 그려 선명하게
    world.classList.add('is-moving')
    window.clearTimeout(this.settleTimer)
    this.settleTimer = window.setTimeout(() => world.classList.remove('is-moving'), 180)
    world.style.setProperty('--map-inv', String(1 / transform.scale))
    const lod = lodFor(transform.scale)
    viewport.dataset.lod = lod
    const hidden = hiddenLabels(this.cities, transform, lod, this.selectedId, vw, vh)
    world.querySelectorAll<HTMLElement>('.city-marker').forEach(marker => {
      marker.classList.toggle('is-label-hidden', hidden.has(marker.dataset.city ?? ''))
    })
    const out = viewport.querySelector<HTMLElement>('[data-map-zoom-out]')
    const zin = viewport.querySelector<HTMLElement>('[data-map-zoom-in]')
    if (out) out.toggleAttribute('disabled', transform.zoom <= transform.minZoom + 1e-3)
    if (zin) zin.toggleAttribute('disabled', transform.zoom >= MAX_ZOOM - 1e-3)
  }

  private localPoint(event: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const rect = this.viewport!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  private onControlClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-map-action]')
    if (!button) return
    event.preventDefault()
    event.stopPropagation()
    const action = button.dataset.mapAction
    if (action === 'zoom-in') { this.zoomBy(1.5); return }
    if (action === 'zoom-out') { this.zoomBy(1 / 1.5); return }
    if (action === 'fullscreen') { this.setFullscreen(!this.fullscreen); return }
    if (action === 'home') {
      const id = button.dataset.home ?? ''
      const city = this.cities.find(c => c.id === id)
      if (city) this.animateTo({ cx: city.x / 100, cy: city.y / 100, zoom: 1 })
    }
  }

  private onPointerDown = (event: PointerEvent): void => {
    if ((event.target as HTMLElement).closest('[data-map-action]')) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    cancelAnimationFrame(this.animation)
    if (!this.viewport!.classList.contains('is-hint-seen')) { this.viewport!.classList.add('is-hint-seen'); rememberHint() }
    try { this.viewport!.setPointerCapture(event.pointerId) } catch { /* 일부 환경에서는 캡처 불가 — 이동은 그대로 동작 */ }
    this.pointers.set(event.pointerId, this.localPoint(event))
    this.beginGesture()
  }

  private beginGesture(): void {
    const pts = [...this.pointers.values()]
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0]
    this.gesture = {
      moved: this.gesture?.moved ?? false,
      startX: mid.x,
      startY: mid.y,
      startView: { ...this.view },
      startDistance: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      startMid: mid,
    }
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId) || !this.gesture || !this.viewport) return
    this.pointers.set(event.pointerId, this.localPoint(event))
    const pts = [...this.pointers.values()]
    const g = this.gesture
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0]
    if (!g.moved && Math.hypot(mid.x - g.startX, mid.y - g.startY) < TAP_SLOP && pts.length < 2) return
    g.moved = true
    const { width: vw, height: vh } = this.viewport.getBoundingClientRect()
    if (pts.length > 1 && g.startDistance > 0) {
      // 두 손가락: 시작 시점 기준으로 확대하고, 두 손가락 중간점을 따라 이동한다.
      const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      this.zoomAround(g.startView.zoom * (distance / g.startDistance), g.startMid.x, g.startMid.y, g.startView)
      const t = computeTransform(this.view, vw, vh).transform
      this.view = { ...this.view, cx: this.view.cx - (mid.x - g.startMid.x) / (MAP_WIDTH * t.scale), cy: this.view.cy - (mid.y - g.startMid.y) / (MAP_HEIGHT * t.scale) }
    } else {
      const t = computeTransform(g.startView, vw, vh).transform
      this.view = { ...g.startView, cx: g.startView.cx - (mid.x - g.startX) / (MAP_WIDTH * t.scale), cy: g.startView.cy - (mid.y - g.startY) / (MAP_HEIGHT * t.scale) }
    }
    this.apply()
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return
    const point = this.localPoint(event)
    this.pointers.delete(event.pointerId)
    const g = this.gesture
    if (this.pointers.size > 0) { this.beginGesture(); return } // 두 손가락 중 하나만 뗀 경우 이어서 이동
    this.gesture = null
    if (!g || g.moved || !this.transform) return
    // 누르기: 가장 가까운 도시를 고른다(표식이 작거나 겹쳐도 정확하게).
    const lod = lodFor(this.transform.scale)
    const id = nearestCity(this.cities, this.transform, point.x, point.y, TAP_RADIUS[lod])
    if (id) this.onSelect(id)
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const { x, y } = this.localPoint(event)
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0018))
    this.zoomAround(this.view.zoom * factor, x, y, this.view)
    this.apply()
  }
}
