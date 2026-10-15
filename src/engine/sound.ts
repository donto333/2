// 배경음악·효과음: 소리 파일 없이 Web Audio로 직접 만든다.
// - 뜯는 현(가야금·비파 느낌)은 Karplus-Strong으로 미리 그려 두고, 북·징·방울·쇳소리도 처음 한 번 그려 둔다
// - 피리(적)·호궁(얼후)·뿔나팔·바람 소리는 그때그때 합성한다
// - 배경음악은 화면마다 다른 곡(본영 · 전투 · 대련 · 레이드)을 16분음표 단위로 앞서 예약해 끊김 없이 흐른다
// - 브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로, 첫 터치/클릭에서 unlock()한다
import { muteSetting, musicSetting, sfxSetting, SOUND_LEVEL_VALUE } from '../game/settings'

export type MusicTheme = 'home' | 'battle' | 'duel' | 'raid' | 'none'
export type SkillSound = '돌격' | '사격' | '계략' | '통솔' | '수호' | '치유'
export type WeaponSound = 'sword' | 'spear' | 'arrow' | 'magic'
type TrackName = 'home' | 'battle' | 'raid'
export type Sfx =
  | 'click' | 'tab' | 'open' | 'close' | 'error' | 'success' | 'coin' | 'levelUp' | 'unlock' | 'forge' | 'equip' | 'unequip'
  | 'dismantle' | 'lock' | 'reward' | 'build' | 'research' | 'formation' | 'battleStart' | 'attack' | 'hit' | 'hitBig' | 'unitDown'
  | 'enemySkill' | 'enemyWarn' | 'pattern' | 'answerGood' | 'answerBad' | 'counter' | 'phase' | 'collapse' | 'timeWarn' | 'heal'
  | 'tactic' | 'move' | 'raidSquad' | 'victory' | 'defeat'

const mtof = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** 같은 효과음을 너무 촘촘히 겹치지 않게(밀리초) */
const MIN_GAP: Partial<Record<Sfx, number>> = { click: 35, tab: 35, attack: 110, hit: 80, hitBig: 140, heal: 450, unitDown: 120, error: 120 }
/** 동시 소리가 많을 때 먼저 버리는 가벼운 효과음 */
const LIGHT: Partial<Record<Sfx, true>> = { attack: true, hit: true, heal: true, click: true }

// ── 작은 난수(곡조를 만들 때 같은 씨앗이면 같은 가락) ──
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}

interface Note { pos: number; deg: number; dur: number }
/** 2마디(16분음표 32칸) 가락: 음계 위를 걷고, 끝은 으뜸음·딸림음 근처에서 쉰다 */
function makeMotif(random: () => number, length = 32, cells = [4, 2, 2, 4, 6, 2, 8, 4, 3, 1], start = 5): Note[] {
  const notes: Note[] = []
  let pos = 0, deg = start
  while (pos < length - 4) {
    const dur = Math.min(cells[Math.floor(random() * cells.length)], length - 4 - pos)
    if (random() < 0.12 && notes.length) { pos += dur; continue }
    deg = Math.max(2, Math.min(12, deg + Math.round((random() - 0.5) * 4.2)))
    notes.push({ pos, deg, dur })
    pos += dur
  }
  const last = notes[notes.length - 1]
  if (last) { last.deg = random() < 0.6 ? 5 : 7; last.dur = Math.max(last.dur, length - last.pos - 2) }
  return notes
}
/** 가락 변주: 끝 두 음만 바꾼다 */
function vary(motif: Note[], random: () => number): Note[] {
  return motif.map((note, index) => index >= motif.length - 2 ? { ...note, deg: Math.max(2, Math.min(12, note.deg + (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 2)))) } : note)
}

type Inst = SoundEngine
interface ThemeDef {
  bpm: number
  /** 큰 전당 울림(전투 곡) 양 */
  hall?: number
  /** 음계(낮은 음부터 15음) */
  scale: number[]
  /** 16분음표 한 칸마다 부른다 */
  step(p: ThemePlayer, s: number, t: number): void
}

class ThemePlayer {
  readonly out: GainNode
  next = 0
  s = 0
  random: () => number
  motifs: Note[][] = []
  stopped = false
  constructor(readonly e: Inst, readonly def: ThemeDef, readonly name: MusicTheme, seed: number) {
    this.out = e.ctx!.createGain()
    this.out.gain.value = 0
    this.out.connect(e.musicIn)
    this.out.connect(e.musicSend)
    if (def.hall) { const h = e.ctx!.createGain(); h.gain.value = def.hall; this.out.connect(h).connect(e.hallSend) }
    this.random = rng(seed)
    this.refreshMotifs()
    this.next = e.ctx!.currentTime + 0.12
    this.out.gain.setValueAtTime(0, this.next)
    this.out.gain.linearRampToValueAtTime(1, this.next + 1.4)
  }
  refreshMotifs(): void {
    const a = makeMotif(this.random)
    this.motifs = [a, vary(a, this.random), makeMotif(this.random), vary(a, this.random)]
  }
  get stepDur(): number { return 60 / this.def.bpm / 4 }
  /** 지금 곡 강도(전투 막에 따라 0~2) */
  get intensity(): number { return this.e.intensity }
  /** 마디 안에서 이 칸에 시작하는 가락 음 */
  melodyAt(s: number): Note | null {
    const bar = Math.floor(s / 16)
    const phrase = this.motifs[Math.floor(bar / 2) % 4]
    const pos = s % 32
    return phrase.find(note => note.pos === pos) ?? null
  }
  schedule(ahead: number): void {
    if (this.stopped) return
    const ctx = this.e.ctx!
    while (this.next < ctx.currentTime + ahead) {
      if (this.s > 0 && this.s % (16 * 16) === 0) this.refreshMotifs()
      try { this.def.step(this, this.s, this.next) } catch { /* 한 음이 실패해도 곡은 이어진다 */ }
      this.next += this.stepDur
      this.s += 1
    }
  }
  stop(fade = 1.4): void {
    if (this.stopped) return
    this.stopped = true
    const t = this.e.ctx!.currentTime
    this.out.gain.cancelScheduledValues(t)
    this.out.gain.setValueAtTime(this.out.gain.value, t)
    this.out.gain.linearRampToValueAtTime(0, t + fade)
    window.setTimeout(() => { try { this.out.disconnect() } catch { /* 이미 끊김 */ } }, (fade + 4) * 1000)
  }
}

// ── 곡 ─────────────────────────────────────────────────
const pent = (root: number, steps: number[]) => Array.from({ length: 15 }, (_, i) => root + Math.floor(i / 5) * 12 + steps[i % 5])
const MAJOR_P = [0, 2, 4, 7, 9]
const MINOR_P = [0, 3, 5, 7, 10]

/** 본영: 평화로운 궁조(G) 가야금 아르페지오 + 가끔 피리 가락, 8마디마다 현을 쓸어 올린다 */
const HOME: ThemeDef = {
  bpm: 74,
  scale: pent(55, MAJOR_P),
  step(p, s, t) {
    const e = p.e, bar = Math.floor(s / 16), pos = s % 16
    const roots = [43, 40, 45, 38, 43, 40, 38, 43]
    const root = roots[bar % 8]
    const hum = () => (p.random() - 0.5) * 0.016
    if (pos === 0) {
      e.pluck(p.out, root, t, 0.42, { bright: 0.25, dur: 3.2 })
      if (bar % 2 === 0) e.pad(p.out, [root + 12, root + 19], t, p.stepDur * 32, 0.05)
      if (bar % 8 === 0) this.scale.slice(3, 10).forEach((midi, i) => e.pluck(p.out, midi, t + 0.02 + i * 0.028, 0.13 + i * 0.012, { bright: 0.7, dur: 2, pan: -0.4 + i * 0.12 }))
      if (bar % 16 === 0) e.bell(p.out, t + 0.05, 0.05, 0.5)
    }
    if (pos === 8) e.pluck(p.out, root + 7, t, 0.22, { bright: 0.25, dur: 2 })
    if (pos % 2 === 0 && !(bar % 8 === 0 && pos < 4)) {
      const chord = this.scale.filter(n => n >= root + 12).slice(0, 6)
      const pattern = [0, 2, 4, 2, 1, 3, 5, 3]
      if (p.random() > 0.12) e.pluck(p.out, chord[pattern[pos / 2]] ?? chord[0], t + hum(), 0.12 + p.random() * 0.07, { bright: 0.55, dur: 1.8, pan: (pos / 16 - 0.5) * 0.7 })
    }
    // 가락: 8마디는 피리, 다음 4마디는 높은 가야금, 4마디는 쉼
    const section = bar % 16
    const note = p.melodyAt(s)
    if (note && section < 8) e.flute(p.out, this.scale[note.deg], t, note.dur * p.stepDur * 0.95, 0.12)
    else if (note && section >= 8 && section < 12) e.pluck(p.out, this.scale[note.deg] + 12, t, 0.15, { bright: 0.8, dur: 1.6, pan: 0.25 })
  },
}

// ── 웅장한 전투 곡 공통: 화음(근음 + 음정), 합창 · 금관 · 현악 반복음을 깐다 ──
type Chord = { root: number; tones: number[] }
const MIN3 = [0, 3, 7], MAJ3 = [0, 4, 7]
/** 마디 첫 박마다 합창·금관 화음을 깔고, 현악은 8분/16분 반복음 */
function epicBed(p: ThemePlayer, chord: Chord, bar: number, pos: number, t: number, opts: { choir: number; brass: number; strings: number; stringsFast: boolean; brassEvery: number }): void {
  const e = p.e, barDur = p.stepDur * 16
  const voice = chord.tones.map(offset => chord.root + 24 + offset)
  if (pos === 0 && opts.choir > 0) e.choir(p.out, voice, t, barDur * 1.02, opts.choir)
  if (pos === 0 && opts.brass > 0 && bar % opts.brassEvery === 0) e.brass(p.out, [chord.root + 12, chord.root + 19, chord.root + 24], t, barDur * opts.brassEvery * 0.96, opts.brass)
  if (opts.strings > 0 && (opts.stringsFast || pos % 2 === 0)) {
    const figure = [0, 0, 7, 0, 12, 0, 7, 0, 0, 0, 7, 0, 12, 7, 0, 7]
    e.strings(p.out, chord.root + 24 + figure[pos], t, p.stepDur * (opts.stringsFast ? 0.8 : 1.6), opts.strings * (pos % 4 === 0 ? 1.25 : 1), (pos % 2 ? 0.35 : -0.35))
  }
}

/** 전투: 우조(E) 단조. 큰북 합주 위에 합창 · 금관 · 현악 반복음, 호궁 가락. 막이 오를수록 금관이 가락을 받고 북이 거세진다 */
const BATTLE: ThemeDef = {
  bpm: 124,
  hall: 1,
  scale: pent(52, MINOR_P),
  step(p, s, t) {
    const e = p.e, bar = Math.floor(s / 16), pos = s % 16, lv = p.intensity
    const chords: Chord[] = [{ root: 40, tones: MIN3 }, { root: 36, tones: MAJ3 }, { root: 38, tones: MAJ3 }, { root: 40, tones: MIN3 }, { root: 40, tones: MIN3 }, { root: 36, tones: MAJ3 }, { root: 33, tones: MIN3 }, { root: 35, tones: MAJ3 }]
    const chord = chords[bar % 8]
    epicBed(p, chord, bar, pos, t, { choir: 0.05 + lv * 0.015, brass: lv >= 1 ? 0.05 : 0.04, strings: 0.04 + lv * 0.008, stringsFast: lv >= 1, brassEvery: lv >= 1 ? 1 : 2 })
    // 큰북 합주(낮은 북을 겹쳐 무게를 더한다)
    if (pos === 0) { e.drum(p.out, 'taiko', t, 0.62); e.drum(p.out, 'taiko', t, 0.45, 0, 0.62) }
    if (pos === 8) e.drum(p.out, 'taiko', t, 0.48)
    if (pos === 6 || pos === 10 || pos === 14) e.drum(p.out, 'tom', t, 0.24 + (pos === 14 ? 0.06 : 0), (pos - 10) / 20)
    if (pos === 4 || pos === 12) e.drum(p.out, 'rim', t, 0.12)
    if (lv >= 1 && (pos === 3 || pos === 11)) e.drum(p.out, 'taiko', t, 0.34)
    if (lv >= 1 && bar % 4 === 3 && pos >= 12) e.drum(p.out, 'tom', t, 0.2 + (pos - 12) * 0.06, 0.3 - (pos - 12) * 0.2)
    if (lv >= 2 && (pos === 6 || pos === 14)) { e.drum(p.out, 'taiko', t, 0.42); e.drum(p.out, 'taiko', t, 0.3, 0, 0.6) }
    if (lv >= 2 && bar % 2 === 1 && pos >= 8 && pos % 2 === 1) e.drum(p.out, 'tom', t, 0.18)
    // 8마디 단락: 앞에서 심벌이 부풀어 오르고, 첫 박에 징
    if (bar % 8 === 7 && pos === 8) e.swell(p.out, t, p.stepDur * 8, 0.1 + lv * 0.03)
    if (pos === 0 && bar % 8 === 0) { e.drum(p.out, 'cymbal', t, 0.2 + lv * 0.05); e.gong(p.out, t, 0.24, 0.85) }
    // 금관 금음(마디 안 당김음)
    if (lv >= 1 && (pos === 6 || pos === 12) && bar % 2 === 1) e.brass(p.out, [chord.root + 24 + chord.tones[1], chord.root + 31], t, p.stepDur * 1.6, 0.045)
    // 낮은 비파
    if (pos % 4 === 0) e.pluck(p.out, chord.root + 12, t, 0.13, { bright: 0.35, dur: 0.7, pan: -0.25 })
    // 가락: 호궁(막이 낮으면 8마디 중 뒤 4마디), 2막부터 금관이 같은 가락을 한 옥타브 아래로
    const note = p.melodyAt(s)
    if (note && (lv >= 1 || bar % 8 >= 4)) {
      const dur = note.dur * p.stepDur * 0.97
      e.erhu(p.out, this.scale[note.deg], t, dur, 0.1, note.pos === 0 ? -2 : 0)
      if (lv >= 1) e.brass(p.out, [this.scale[note.deg]], t, dur, lv >= 2 ? 0.06 : 0.04)
      if (lv >= 2) e.flute(p.out, this.scale[note.deg] + 12, t, dur * 0.9, 0.045)
    }
  },
}

/** 유저 대련: 상조(A) 단조, 현악 반복음과 피리, 4마디마다 금관 */
const DUEL: ThemeDef = {
  bpm: 118,
  hall: 0.8,
  scale: pent(57, MINOR_P),
  step(p, s, t) {
    const e = p.e, bar = Math.floor(s / 16), pos = s % 16, lv = p.intensity
    const chords: Chord[] = [{ root: 45, tones: MIN3 }, { root: 43, tones: MAJ3 }, { root: 41, tones: MAJ3 }, { root: 40, tones: MAJ3 }]
    const chord = chords[bar % 4]
    epicBed(p, chord, bar, pos, t, { choir: lv >= 1 ? 0.045 : 0.03, brass: 0.04, strings: 0.035 + lv * 0.008, stringsFast: lv >= 2, brassEvery: 4 })
    if (pos === 0) e.drum(p.out, 'taiko', t, 0.5)
    if (pos === 6 || pos === 10) e.drum(p.out, 'tom', t, 0.24)
    if (pos === 4 || pos === 12 || pos === 14) e.drum(p.out, 'rim', t, 0.12)
    if (lv >= 1 && (pos === 3 || pos === 8)) e.drum(p.out, 'taiko', t, 0.32)
    if (lv >= 2 && pos % 4 === 2) e.drum(p.out, 'tom', t, 0.16)
    if (bar % 8 === 7 && pos === 8) e.swell(p.out, t, p.stepDur * 8, 0.08)
    if (pos === 0 && bar % 8 === 0) e.drum(p.out, 'cymbal', t, 0.15)
    if (pos % 2 === 0) e.pluck(p.out, chord.root + 12 + [0, 7, 12, 7, 0, 7, 15, 7][pos / 2], t, 0.12, { bright: 0.5, dur: 0.9, pan: 0.2 })
    const note = p.melodyAt(s)
    if (note) {
      e.flute(p.out, this.scale[note.deg], t, note.dur * p.stepDur * 0.92, 0.11)
      if (lv >= 2) e.brass(p.out, [this.scale[note.deg] - 12], t, note.dur * p.stepDur * 0.92, 0.04)
    }
  },
}

/** 레이드: 어두운 라(D) 단조. 낮은 합창과 금관이 매 마디 깔리고, 무거운 북과 징, 호궁 가락 */
const RAID: ThemeDef = {
  bpm: 88,
  hall: 1.2,
  scale: pent(50, MINOR_P),
  step(p, s, t) {
    const e = p.e, bar = Math.floor(s / 16), pos = s % 16, lv = p.intensity
    const chords: Chord[] = [{ root: 38, tones: MIN3 }, { root: 34, tones: MAJ3 }, { root: 36, tones: MAJ3 }, { root: 33, tones: MAJ3 }]
    const chord = chords[bar % 4]
    epicBed(p, chord, bar, pos, t, { choir: 0.07, brass: 0.055, strings: lv >= 1 ? 0.04 : 0, stringsFast: true, brassEvery: 1 })
    if (pos === 0 && bar % 2 === 0) e.pad(p.out, [26, 33], t, p.stepDur * 32, 0.06)
    if (pos === 0) { e.drum(p.out, 'taiko', t, 0.75, 0, 0.82); e.drum(p.out, 'taiko', t, 0.5, 0, 0.55) }
    if (pos === 10) e.drum(p.out, 'taiko', t, 0.45, 0, 0.9)
    if (pos === 6 || pos === 14) e.drum(p.out, 'tom', t, 0.22, -0.2)
    if (lv >= 1 && (pos === 3 || pos === 8)) e.drum(p.out, 'taiko', t, 0.4, 0, 0.88)
    if (lv >= 1 && bar % 2 === 1 && pos >= 12) e.drum(p.out, 'tom', t, 0.18 + (pos - 12) * 0.05)
    if (lv >= 2 && pos % 2 === 1) e.drum(p.out, 'tom', t, 0.1)
    if (bar % 4 === 3 && pos === 8) e.swell(p.out, t, p.stepDur * 8, 0.11)
    if (pos === 0 && bar % 4 === 0) { e.gong(p.out, t, 0.3, 0.78); e.drum(p.out, 'cymbal', t, 0.14) }
    const note = p.melodyAt(s)
    if (note && note.pos % 2 === 0) {
      const dur = Math.max(4, note.dur) * p.stepDur * 1.2
      e.erhu(p.out, this.scale[note.deg], t, dur, 0.11, -2)
      if (lv >= 1) e.brass(p.out, [this.scale[note.deg] - 12], t, dur, 0.05)
    }
  },
}

const THEMES: Record<Exclude<MusicTheme, 'none'>, ThemeDef> = { home: HOME, battle: BATTLE, duel: DUEL, raid: RAID }

// ── 소리 엔진 ───────────────────────────────────────────
export class SoundEngine {
  ctx: AudioContext | null = null
  musicIn!: GainNode
  musicSend!: GainNode
  /** 전투 곡용 큰 전당 울림 */
  hallSend!: GainNode
  private master!: GainNode
  private musicVol!: GainNode
  private duckNode!: GainNode
  private sfxVol!: GainNode
  private sfxSend!: GainNode
  private noise!: AudioBuffer
  private buffers = new Map<string, AudioBuffer>()
  private last = new Map<string, number>()
  private voices = 0
  private unlocked = false
  private player: ThemePlayer | null = null
  private wanted: MusicTheme = 'home'
  private returnTimer = 0
  private duckTimer = 0
  private pausedDuck = false
  intensity = 0

  /** 첫 터치/클릭에서 부른다(브라우저 자동재생 규칙) */
  unlock(): void {
    if (!this.ensure()) return
    if (this.ctx!.state === 'suspended') void this.ctx!.resume()
    if (this.unlocked) return
    this.unlocked = true
    this.applyVolumes()
    this.setTheme(this.wanted)
    window.setInterval(() => this.tick(), 50)
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return
      if (document.hidden) { void this.ctx.suspend(); for (const t of this.tracks.values()) t.el.pause() }
      else { void this.ctx.resume(); for (const t of this.tracks.values()) if (t.target > 0) void t.el.play().catch(() => {}) }
    })
  }

  private ensure(): boolean {
    if (this.ctx) return true
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return false
      const ctx = new Ctor({ latencyHint: 'interactive' })
      this.ctx = ctx
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2
      // 마지막 단: 갑자기 여러 소리가 겹쳐도 깨지지 않게 막는 리미터
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08
      this.master = ctx.createGain(); this.master.gain.value = 0.85
      this.master.connect(comp).connect(limiter).connect(ctx.destination)
      const reverb = ctx.createConvolver()
      reverb.buffer = this.impulse(2.6)
      const wet = ctx.createGain(); wet.gain.value = 0.32
      reverb.connect(wet).connect(this.master)
      this.musicVol = ctx.createGain()
      this.duckNode = ctx.createGain()
      this.musicIn = ctx.createGain()
      this.musicSend = ctx.createGain(); this.musicSend.gain.value = 0.5
      this.musicIn.connect(this.duckNode)
      this.musicSend.connect(reverb)
      const hall = ctx.createConvolver()
      hall.buffer = this.impulse(4.2)
      const hallWet = ctx.createGain(); hallWet.gain.value = 0.42
      this.hallSend = ctx.createGain(); this.hallSend.gain.value = 0.3
      this.hallSend.connect(hall); hall.connect(hallWet).connect(this.master)
      this.duckNode.connect(this.musicVol).connect(this.master)
      this.sfxVol = ctx.createGain()
      this.sfxSend = ctx.createGain(); this.sfxSend.gain.value = 0.2
      this.sfxVol.connect(this.master)
      this.sfxSend.connect(reverb)
      this.noise = this.makeBuffer(2, () => Math.random() * 2 - 1)
      return true
    } catch { this.ctx = null; return false }
  }

  /** 설정(음악·효과음 크기, 음소거)을 다시 읽어 적용한다 */
  applyVolumes(): void {
    if (!this.ctx) return
    const muted = muteSetting()
    const t = this.ctx.currentTime
    this.musicVol.gain.setTargetAtTime(muted ? 0 : SOUND_LEVEL_VALUE[musicSetting()] * 0.62, t, 0.08)
    this.sfxVol.gain.setTargetAtTime(muted ? 0 : SOUND_LEVEL_VALUE[sfxSetting()] * 0.95, t, 0.08)
    this.sfxSend.gain.setTargetAtTime(muted ? 0 : SOUND_LEVEL_VALUE[sfxSetting()] * 0.2, t, 0.08)
    this.musicSend.gain.setTargetAtTime(muted ? 0 : SOUND_LEVEL_VALUE[musicSetting()] * 0.32, t, 0.08)
    this.hallSend.gain.setTargetAtTime(muted ? 0 : SOUND_LEVEL_VALUE[musicSetting()] * 0.3, t, 0.08)
  }

  /** 화면에 맞는 곡으로 바꾼다(같은 곡이면 그대로) */
  setTheme(theme: MusicTheme): void {
    window.clearTimeout(this.returnTimer)
    this.wanted = theme
    if (!this.ctx || !this.unlocked) return
    if (this.player && this.player.name === theme && !this.player.stopped) return
    this.player?.stop()
    this.player = null
    // 본영 · 시나리오 · 대련은 녹음된 곡을 되풀이해 튼다(곡을 못 불러오면 예전처럼 만든 곡으로)
    const recorded = this.track(this.trackFor(theme))
    if (theme !== 'none') {
      if (theme === 'home') this.intensity = 0
      if (!recorded) this.player = new ThemePlayer(this, THEMES[theme], theme, Math.floor(Math.random() * 1e9))
    }
    this.setAmbience(theme === 'none' ? 'none' : theme === 'home' ? 'home' : 'battle')
  }

  // ── 녹음된 배경음(파일) ──
  // 웹오디오 그래프를 거치지 않고 <audio>로 바로 튼다(휴대폰 사파리 · 데스크톱 앱에서 소리가 안 나는 일을 피한다).
  // 크기는 음악 설정 · 음소거 · 스킬 때 줄이기(덕킹)를 따라 직접 맞춘다.
  // home = 본영 ‘강의 흐름’, battle = 시나리오 · 대련 전투 곡, raid = 주간 토벌전(레이드) 곡
  private tracks = new Map<TrackName, { el: HTMLAudioElement; level: number; target: number; failed: boolean }>()
  private trackTimer = 0
  private trackRetry: (() => void) | null = null
  private trackVolume(): number {
    if (muteSetting()) return 0
    const duck = this.duckTimer ? 0.3 : this.pausedDuck ? 0.5 : 1
    return SOUND_LEVEL_VALUE[musicSetting()] * 0.55 * duck
  }
  /** 곡을 튼다(이미 틀고 있으면 이어서), 다른 곡은 서서히 멈춘다. 그 곡을 못 쓰면 false */
  private track(name: TrackName | null): boolean {
    for (const [other, t] of this.tracks) if (other !== name) t.target = 0
    if (!name) { this.fadeTrack(); return false }
    let t = this.tracks.get(name)
    if (!t) {
      const el = new Audio(`/assets/music/${name}.mp3`)
      el.loop = true
      el.preload = 'auto'
      el.volume = 0
      t = { el, level: 0, target: 0, failed: false }
      const entry = t
      el.addEventListener('error', () => {
        entry.failed = true; entry.target = 0
        // 곡을 못 불러오면 그 화면은 예전처럼 만든 곡으로
        if (this.ctx && this.unlocked && this.trackFor(this.wanted) === name && this.wanted !== 'none') { this.player?.stop(); this.player = new ThemePlayer(this, THEMES[this.wanted as Exclude<MusicTheme, 'none'>], this.wanted, Math.floor(Math.random() * 1e9)) }
      })
      this.tracks.set(name, t)
    }
    if (t.failed) { this.fadeTrack(); return false }
    t.target = 1
    this.fadeTrack()
    const el = t.el
    // 전투 곡은 전투마다 처음부터, 본영 곡은 멈춘 자리부터 이어서
    if (name !== 'home' && el.paused && t.level === 0) el.currentTime = 0
    if (el.paused) void el.play().catch(() => {
      // 자동 재생이 막히면 다음 터치 때 다시 튼다
      if (this.trackRetry) return
      this.trackRetry = () => {
        document.removeEventListener('pointerdown', this.trackRetry!); document.removeEventListener('keydown', this.trackRetry!); this.trackRetry = null
        for (const x of this.tracks.values()) if (x.target > 0) void x.el.play().catch(() => {})
      }
      document.addEventListener('pointerdown', this.trackRetry); document.addEventListener('keydown', this.trackRetry)
    })
    return true
  }
  /** 화면(곡 주제)에 쓰는 녹음 곡 */
  private trackFor(theme: MusicTheme): TrackName | null {
    if (theme === 'home') return 'home'
    if (theme === 'battle' || theme === 'duel') return 'battle'
    if (theme === 'raid') return 'raid'
    return null
  }
  /** 크기를 서서히 목표로(0이 되면 멈춘다) */
  private fadeTrack(): void {
    if (this.trackTimer) return
    this.trackTimer = window.setInterval(() => {
      const vol = this.trackVolume()
      for (const t of this.tracks.values()) {
        const up = t.target > t.level
        t.level = up ? Math.min(t.target, t.level + 0.06) : Math.max(t.target, t.level - 0.08)
        t.el.volume = Math.max(0, Math.min(1, t.level * vol))
        if (t.level === 0 && t.target === 0 && !t.el.paused) t.el.pause()
      }
    }, 60)
  }

  /** 잠시 뒤 다른 곡으로(그 사이 setTheme을 부르면 취소) */
  setThemeAfter(theme: MusicTheme, ms: number): void {
    window.clearTimeout(this.returnTimer)
    this.returnTimer = window.setTimeout(() => this.setTheme(theme), ms)
  }

  get currentTheme(): MusicTheme { return this.wanted }

  setIntensity(level: number): void { this.intensity = Math.max(0, Math.min(2, Math.round(level))) }

  /** 일시 정지 중에는 음악을 줄인다 */
  setPausedDuck(on: boolean): void { this.pausedDuck = on; this.updateDuck() }
  /** 뽑기 연출 같은 큰 효과음 동안 음악을 잠시 낮춘다 */
  duckFor(ms: number): void {
    window.clearTimeout(this.duckTimer)
    this.updateDuck(0.22)
    this.duckTimer = window.setTimeout(() => { this.duckTimer = 0; this.updateDuck() }, ms)
  }
  private updateDuck(force?: number): void {
    if (!this.ctx) return
    const level = force ?? (this.duckTimer ? 0.22 : this.pausedDuck ? 0.4 : 1)
    this.duckNode.gain.setTargetAtTime(level, this.ctx.currentTime, 0.15)
  }

  /** 뽑기 연출이 직접 합성하는 소리를 효과음 크기에 맞춰 내보낼 곳 */
  sfxOutput(): { ctx: AudioContext; out: AudioNode } | null {
    if (!this.ensure()) return null
    if (this.ctx!.state === 'suspended') void this.ctx!.resume()
    this.applyVolumes()
    return { ctx: this.ctx!, out: this.sfxVol }
  }

  private tick(): void {
    if (!this.ctx || this.ctx.state !== 'running') return
    this.player?.schedule(0.3)
  }

  // ── 그려 두는 소리 ──
  private makeBuffer(seconds: number, fn: (t: number, i: number) => number, channels = 1): AudioBuffer {
    const ctx = this.ctx!
    const n = Math.max(1, Math.floor(ctx.sampleRate * seconds))
    const buffer = ctx.createBuffer(channels, n, ctx.sampleRate)
    for (let c = 0; c < channels; c += 1) {
      const data = buffer.getChannelData(c)
      for (let i = 0; i < n; i += 1) data[i] = fn(i / ctx.sampleRate, i)
    }
    return buffer
  }
  private normalize(buffer: AudioBuffer, peak = 0.9): AudioBuffer {
    let max = 0
    for (let c = 0; c < buffer.numberOfChannels; c += 1) for (const v of buffer.getChannelData(c)) max = Math.max(max, Math.abs(v))
    if (max > 0) for (let c = 0; c < buffer.numberOfChannels; c += 1) { const d = buffer.getChannelData(c); for (let i = 0; i < d.length; i += 1) d[i] *= peak / max }
    return buffer
  }
  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!
    const n = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(2, n, ctx.sampleRate)
    for (let c = 0; c < 2; c += 1) {
      const d = buffer.getChannelData(c)
      let lp = 0
      for (let i = 0; i < n; i += 1) {
        const t = i / ctx.sampleRate
        const a = 0.9 - 0.75 * (t / seconds) // 뒤로 갈수록 어두워진다
        lp += a * ((Math.random() * 2 - 1) - lp)
        d[i] = lp * Math.exp(-t * (seconds > 3 ? 1.7 : 2.6)) * (t < (seconds > 3 ? 0.03 : 0.012) ? t / (seconds > 3 ? 0.03 : 0.012) : 1)
      }
    }
    return buffer
  }
  /** 뜯는 현: Karplus-Strong. 높은 음 정확도를 위해 재생 속도로 음높이를 맞춘다 */
  private pluckBuffer(midi: number, bright: number, dur: number): { buffer: AudioBuffer; rate: number } {
    const ctx = this.ctx!
    const sr = ctx.sampleRate
    const freq = mtof(midi)
    const N = Math.max(4, Math.round(sr / freq - 0.5))
    const key = `pk:${N}:${Math.round(bright * 10)}:${Math.round(dur * 10)}`
    let buffer = this.buffers.get(key)
    if (!buffer) {
      const total = Math.floor(sr * dur)
      const ring = new Float32Array(N)
      let prev = 0
      const a = 0.18 + bright * 0.75
      for (let i = 0; i < N; i += 1) { prev += a * ((Math.random() * 2 - 1) - prev); ring[i] = prev }
      const mean = ring.reduce((sum, v) => sum + v, 0) / N
      for (let i = 0; i < N; i += 1) ring[i] -= mean
      // 한 주기마다 줄어드는 비율: 소리 길이의 70% 지점에서 −40dB가 되게(낮은 음도 끝에서 잘리지 않고 사라진다)
      const rho = Math.min(0.9995, 10 ** (-2 / (dur * 0.7 * freq)))
      const out = new Float32Array(total)
      let idx = 0
      for (let i = 0; i < total; i += 1) {
        const next = (idx + 1) % N
        const v = ring[idx]
        ring[idx] = rho * 0.5 * (v + ring[next])
        const fade = total * 0.25
        out[i] = v * (i > total - fade ? (total - i) / fade : 1)
        idx = next
      }
      buffer = ctx.createBuffer(1, total, sr)
      buffer.getChannelData(0).set(out)
      this.normalize(buffer, 0.8)
      this.buffers.set(key, buffer)
    }
    return { buffer, rate: freq * (N + 0.5) / sr }
  }
  private sample(kind: string): AudioBuffer {
    const hit = this.buffers.get(kind)
    if (hit) return hit
    let buffer: AudioBuffer
    let lp = 0
    const smooth = (a: number) => { lp += a * ((Math.random() * 2 - 1) - lp); return lp }
    switch (kind) {
      case 'taiko': { let ph = 0; buffer = this.makeBuffer(1.1, t => { ph += 2 * Math.PI * 58 * (1 + 2.2 * Math.exp(-t * 26)) / this.ctx!.sampleRate; return Math.sin(ph) * Math.exp(-t * 5.2) + smooth(0.1) * Math.exp(-t * 32) * 0.9 + (t < 0.004 ? (Math.random() - 0.5) : 0) }); break }
      case 'tom': { let ph = 0; buffer = this.makeBuffer(0.6, t => { ph += 2 * Math.PI * 118 * (1 + 1.2 * Math.exp(-t * 30)) / this.ctx!.sampleRate; return Math.sin(ph) * Math.exp(-t * 9) + smooth(0.2) * Math.exp(-t * 45) * 0.6 }); break }
      case 'rim': buffer = this.makeBuffer(0.18, t => Math.sin(2 * Math.PI * 820 * t) * Math.exp(-t * 55) + Math.sin(2 * Math.PI * 1310 * t) * Math.exp(-t * 80) * 0.5 + (Math.random() * 2 - 1) * Math.exp(-t * 160) * 0.35); break
      case 'cymbal': { let prev = 0; buffer = this.makeBuffer(1.8, t => { const w = Math.random() * 2 - 1; const hp = w - prev; prev = w; return hp * Math.exp(-t * 2.8) * (1 - Math.exp(-t * 300)) }); break }
      case 'gong': {
        const ratios = [1, 1.52, 2.03, 2.71, 3.33, 4.17], amps = [1, 0.6, 0.45, 0.32, 0.24, 0.16], decay = [0.7, 0.9, 1.3, 1.7, 2.2, 2.8]
        buffer = this.makeBuffer(4.6, t => ratios.reduce((sum, r, i) => sum + amps[i] * (Math.sin(2 * Math.PI * 98 * r * t) + 0.5 * Math.sin(2 * Math.PI * 98 * r * 1.003 * t)) * Math.exp(-t * decay[i]) * (1 - Math.exp(-t * (18 - i * 2))), 0) + (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.4)
        break
      }
      case 'bell': {
        const ratios = [1, 2.76, 5.4, 8.93], amps = [1, 0.5, 0.25, 0.12], decay = [2.6, 4.5, 8, 12]
        buffer = this.makeBuffer(1.8, t => ratios.reduce((sum, r, i) => sum + amps[i] * Math.sin(2 * Math.PI * 1046.5 * r * t) * Math.exp(-t * decay[i]), 0) * (1 - Math.exp(-t * 900)))
        break
      }
      case 'metal': {
        const ratios = [1, 1.83, 2.67, 3.9, 5.1], amps = [1, 0.7, 0.5, 0.35, 0.25]
        buffer = this.makeBuffer(0.5, t => ratios.reduce((sum, r, i) => sum + amps[i] * Math.sin(2 * Math.PI * 620 * r * t) * Math.exp(-t * (12 + i * 6)), 0) + (Math.random() * 2 - 1) * Math.exp(-t * 70) * 0.5)
        break
      }
      default: buffer = this.makeBuffer(0.05, () => 0)
    }
    this.normalize(buffer)
    this.buffers.set(kind, buffer)
    return buffer
  }

  // ── 악기 ──
  /** 소리를 내보낼 곳: 팬 → (출력 + 잔향) */
  private route(out: AudioNode, gain: GainNode, pan = 0, send?: AudioNode): void {
    const ctx = this.ctx!
    let node: AudioNode = gain
    if (pan && typeof ctx.createStereoPanner === 'function') { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); gain.connect(p); node = p }
    node.connect(out)
    if (send) node.connect(send)
  }
  private play_(buffer: AudioBuffer, out: AudioNode, t: number, vol: number, opts: { rate?: number; pan?: number; send?: AudioNode; filter?: number } = {}): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = opts.rate ?? 1
    const g = ctx.createGain()
    g.gain.value = vol
    if (opts.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.filter; src.connect(f).connect(g) } else src.connect(g)
    this.route(out, g, opts.pan, opts.send)
    this.voices += 1
    src.onended = () => { this.voices -= 1; try { g.disconnect() } catch { /* 끝 */ } }
    src.start(Math.max(t, ctx.currentTime))
  }
  pluck(out: AudioNode, midi: number, t: number, vol: number, opts: { bright?: number; dur?: number; pan?: number; send?: AudioNode } = {}): void {
    const { buffer, rate } = this.pluckBuffer(midi, opts.bright ?? 0.5, opts.dur ?? 1.6)
    this.play_(buffer, out, t, vol, { rate, pan: opts.pan, send: opts.send })
  }
  drum(out: AudioNode, kind: 'taiko' | 'tom' | 'rim' | 'cymbal', t: number, vol: number, pan = 0, rate = 1, send?: AudioNode): void {
    this.play_(this.sample(kind), out, t, vol, { rate: rate * (0.98 + Math.random() * 0.04), pan, send })
  }
  gong(out: AudioNode, t: number, vol: number, rate = 1, send?: AudioNode): void { this.play_(this.sample('gong'), out, t, vol, { rate, send }) }
  bell(out: AudioNode, t: number, vol: number, rate = 1, pan = 0, send?: AudioNode): void { this.play_(this.sample('bell'), out, t, vol, { rate, pan, send }) }
  metal(out: AudioNode, t: number, vol: number, rate = 1, pan = 0, send?: AudioNode): void { this.play_(this.sample('metal'), out, t, vol, { rate, pan, send }) }

  /** 피리(적): 사인 + 숨소리, 늦게 들어오는 떨림 */
  flute(out: AudioNode, midi: number, t: number, dur: number, vol: number, slide = 0): void {
    const ctx = this.ctx!
    const f = mtof(midi)
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain(), lp = ctx.createBiquadFilter()
    o.type = 'sine'; o2.type = 'triangle'
    o.frequency.setValueAtTime(slide ? mtof(midi + slide) : f, t); o.frequency.setTargetAtTime(f, t, 0.035)
    o2.frequency.setValueAtTime(f * 2, t)
    const lfo = ctx.createOscillator(), depth = ctx.createGain()
    lfo.frequency.value = 5.3
    depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.5, dur * 0.6))
    lfo.connect(depth); depth.connect(o.frequency)
    g2.gain.value = 0.12
    lp.type = 'lowpass'; lp.frequency.value = 3200
    const end = t + Math.max(0.12, dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.06)
    g.gain.linearRampToValueAtTime(vol * 0.82, t + Math.min(dur, 0.4))
    g.gain.setValueAtTime(vol * 0.82, end - 0.06)
    g.gain.linearRampToValueAtTime(0.0001, end + 0.05)
    // 숨소리
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain()
    n.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = Math.min(8000, f * 2); bp.Q.value = 1.5
    ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(vol * 0.3, t + 0.04); ng.gain.linearRampToValueAtTime(vol * 0.08, t + 0.2); ng.gain.linearRampToValueAtTime(0.0001, end + 0.05)
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g); n.connect(bp).connect(ng).connect(g)
    this.route(out, g, 0.15)
    ;[o, o2, lfo, n].forEach(node => { node.start(t); node.stop(end + 0.1) })
    n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }
  /** 호궁(얼후): 톱니파를 몸통 공명처럼 걸러, 활로 켜듯 천천히 들어오고 미끄러져 올라간다 */
  erhu(out: AudioNode, midi: number, t: number, dur: number, vol: number, slide = 0): void {
    const ctx = this.ctx!
    const f = mtof(midi)
    const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(slide ? mtof(midi + slide) : f, t); o.frequency.setTargetAtTime(f, t, 0.06)
    const lfo = ctx.createOscillator(), depth = ctx.createGain()
    lfo.frequency.value = 6
    depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.45, dur * 0.7))
    lfo.connect(depth).connect(o.frequency)
    bp.type = 'peaking'; bp.frequency.value = 1100; bp.Q.value = 1.2; bp.gain.value = 6
    lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.6
    const end = t + Math.max(0.15, dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.1)
    g.gain.setValueAtTime(vol, end - 0.08)
    g.gain.linearRampToValueAtTime(0.0001, end + 0.06)
    o.connect(bp).connect(lp).connect(g)
    this.route(out, g, -0.1)
    ;[o, lfo].forEach(node => { node.start(t); node.stop(end + 0.1) })
    o.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }
  /** 낮게 깔리는 화음 */
  pad(out: AudioNode, midis: number[], t: number, dur: number, vol: number): void {
    const ctx = this.ctx!
    const g = ctx.createGain(), lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 760
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(1.2, dur / 3)); g.gain.setValueAtTime(vol, t + dur - Math.min(1.2, dur / 3)); g.gain.linearRampToValueAtTime(0.0001, t + dur)
    lp.connect(g); this.route(out, g)
    const oscs = midis.flatMap(midi => [-7, 7].map(cents => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); o.detune.value = cents; o.connect(lp); return o }))
    oscs.forEach(o => { o.start(t); o.stop(t + dur + 0.05) })
    oscs[0].onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }
  /** 금관 합주: 음마다 톱니파 3개(조금씩 어긋나게), 필터가 열렸다 닫히며 숨을 쉰다 */
  brass(out: AudioNode, midis: number[], t: number, dur: number, vol: number, send?: AudioNode): void {
    const ctx = this.ctx!
    const lp = ctx.createBiquadFilter(), g = ctx.createGain()
    lp.type = 'lowpass'; lp.Q.value = 0.9
    const end = t + Math.max(0.2, dur)
    lp.frequency.setValueAtTime(350, t); lp.frequency.exponentialRampToValueAtTime(2300, t + 0.16); lp.frequency.exponentialRampToValueAtTime(1100, t + Math.min(dur, 0.9))
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.09); g.gain.linearRampToValueAtTime(vol * 0.78, t + Math.min(dur, 0.5)); g.gain.setValueAtTime(vol * 0.78, end - 0.12); g.gain.linearRampToValueAtTime(0.0001, end + 0.08)
    lp.connect(g); this.route(out, g, 0, send)
    const oscs = midis.flatMap(midi => [-9, 0, 9].map(cents => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); o.detune.value = cents + (Math.random() - 0.5) * 4; o.connect(lp); return o }))
    oscs.forEach(o => { o.start(t); o.stop(end + 0.12) })
    oscs[0].onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }
  /** 합창 ‘아’: 톱니파를 모음 공명(800 · 1150 · 2800Hz)으로 걸러 사람 목소리처럼, 천천히 들어온다 */
  choir(out: AudioNode, midis: number[], t: number, dur: number, vol: number): void {
    const ctx = this.ctx!
    const g = ctx.createGain(), sum = ctx.createGain()
    sum.gain.value = 1
    ;[[800, 6, 1], [1150, 7, 0.6], [2800, 9, 0.25], [350, 3, 0.5]].forEach(([freq, q, amp]) => { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; const a = ctx.createGain(); a.gain.value = amp * 3; sum.connect(f).connect(a).connect(g) })
    const end = t + Math.max(0.4, dur)
    const attack = Math.min(0.7, dur / 3)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.setValueAtTime(vol, end - attack * 0.6); g.gain.linearRampToValueAtTime(0.0001, end + 0.3)
    this.route(out, g, 0, this.hallSend)
    const lfo = ctx.createOscillator(), depth = ctx.createGain()
    lfo.frequency.value = 4.6; depth.gain.value = 9
    lfo.connect(depth)
    const oscs = midis.flatMap(midi => [-11, 11].map(cents => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); o.detune.value = cents; depth.connect(o.detune); o.connect(sum); return o }))
    ;[...oscs, lfo].forEach(o => { o.start(t); o.stop(end + 0.4) })
    lfo.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }
  /** 현악 반복음(짧게 끊어 켜는 소리) */
  strings(out: AudioNode, midi: number, t: number, dur: number, vol: number, pan = 0): void {
    const ctx = this.ctx!
    const lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = ctx.createGain()
    lp.type = 'lowpass'; lp.frequency.value = 2600; hp.type = 'highpass'; hp.frequency.value = 140
    const end = t + Math.max(0.05, dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(vol * 0.5, end); g.gain.linearRampToValueAtTime(0.0001, end + 0.06)
    lp.connect(hp).connect(g); this.route(out, g, pan)
    const oscs = [-7, 0, 7].map(cents => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); o.detune.value = cents; o.connect(lp); return o })
    oscs.forEach(o => { o.start(t); o.stop(end + 0.08) })
    oscs[0].onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }
  /** 거꾸로 부풀어 오르는 심벌(다음 단락으로 넘어가기 직전) */
  swell(out: AudioNode, t: number, dur: number, vol: number): void {
    const ctx = this.ctx!
    const n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain()
    n.buffer = this.noise; n.loop = true
    hp.type = 'highpass'; hp.frequency.setValueAtTime(2500, t); hp.frequency.exponentialRampToValueAtTime(6000, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04)
    n.connect(hp).connect(g); this.route(out, g, 0, this.hallSend)
    n.start(t); n.stop(t + dur + 0.06)
    n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }

  /** 뿔나팔: 낮은 음에서 미끄러져 올라가며 필터가 열린다 */
  horn(out: AudioNode, midi: number, t: number, dur: number, vol: number, send?: AudioNode): void {
    const ctx = this.ctx!
    const f = mtof(midi)
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain()
    o.type = 'sawtooth'; o2.type = 'square'
    o.frequency.setValueAtTime(f * 0.84, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.18)
    o2.frequency.setValueAtTime(f * 0.5 * 0.84, t); o2.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.18)
    lp.type = 'lowpass'; lp.Q.value = 2
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(1500, t + 0.25); lp.frequency.exponentialRampToValueAtTime(700, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.12); g.gain.setValueAtTime(vol, t + dur - 0.15); g.gain.linearRampToValueAtTime(0.0001, t + dur)
    o.connect(lp); o2.connect(lp); lp.connect(g)
    this.route(out, g, 0, send)
    ;[o, o2].forEach(node => { node.start(t); node.stop(t + dur + 0.05) })
    o.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }
  /** 바람 가르는 소리(화살·칼·휘두름) */
  whoosh(out: AudioNode, t: number, dur: number, vol: number, from: number, to: number, pan = 0, send?: AudioNode): void {
    const ctx = this.ctx!
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain()
    n.buffer = this.noise
    bp.type = 'bandpass'; bp.Q.value = 2.2
    bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur)
    n.connect(bp).connect(g)
    this.route(out, g, pan, send)
    n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.02)
    n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }

  // ── 효과음 ──
  private allow(name: string, gap?: number, light = false): boolean {
    if (!this.ctx || !this.unlocked || this.ctx.state !== 'running') return false
    if (light && this.voices > 36) return false
    const now = performance.now()
    if (gap && now - (this.last.get(name) ?? -1e9) < gap) return false
    this.last.set(name, now)
    return true
  }

  play(name: Sfx, opts: { pan?: number } = {}): void {
    if (!this.allow(name, MIN_GAP[name], LIGHT[name])) return
    const out = this.sfxVol, send = this.sfxSend
    const t = this.ctx!.currentTime + 0.005
    const pan = opts.pan ?? 0
    const run = (notes: number[], gap: number, vol: number, bright = 0.7, at = t) => notes.forEach((midi, i) => this.pluck(out, midi, at + i * gap, vol, { bright, dur: 1.4, pan: -0.3 + i * 0.6 / Math.max(1, notes.length - 1), send }))
    switch (name) {
      case 'click': this.drum(out, 'rim', t, 0.22, 0, 1.3); break
      case 'tab': this.pluck(out, 79, t, 0.2, { bright: 0.6, dur: 0.8, send }); this.drum(out, 'rim', t, 0.1, 0, 1.5); break
      case 'open': run([74, 79], 0.05, 0.2); break
      case 'close': run([79, 74], 0.05, 0.18); break
      case 'error': this.drum(out, 'tom', t, 0.38, 0, 0.75); this.drum(out, 'tom', t + 0.09, 0.32, 0, 0.7); this.metal(out, t, 0.06, 0.5); break
      case 'success': run([79, 83, 86], 0.05, 0.22); this.bell(out, t + 0.1, 0.08, 1, 0, send); break
      case 'coin': this.bell(out, t, 0.2, 1.9, -0.2, send); this.bell(out, t + 0.065, 0.18, 2.4, 0.2, send); this.metal(out, t, 0.05, 2.2); break
      case 'levelUp': run([67, 69, 71, 74, 76, 79], 0.035, 0.24); this.bell(out, t + 0.22, 0.14, 1, 0, send); this.bell(out, t + 0.22, 0.08, 1.5, 0, send); break
      case 'unlock': this.gong(out, t, 0.25, 1.6, send); run([74, 76, 79, 81, 86], 0.04, 0.2, 0.8, t + 0.05); break
      case 'forge': this.metal(out, t, 0.4, 1, -0.2, send); this.metal(out, t + 0.14, 0.32, 1.12, 0.2, send); this.bell(out, t + 0.3, 0.12, 1.25, 0, send); break
      case 'equip': this.metal(out, t, 0.34, 1.1, 0, send); this.drum(out, 'rim', t + 0.03, 0.12); break
      case 'unequip': this.metal(out, t, 0.24, 0.8); break
      case 'dismantle': this.metal(out, t, 0.32, 0.7, -0.2, send); this.metal(out, t + 0.08, 0.24, 0.62, 0.2); this.whoosh(out, t + 0.05, 0.25, 0.12, 900, 300); break
      case 'lock': this.drum(out, 'rim', t, 0.2, 0, 1.6); this.metal(out, t + 0.04, 0.16, 1.5); break
      case 'reward': this.bell(out, t, 0.15, 1, 0, send); this.bell(out, t + 0.07, 0.13, 1.26, 0, send); this.bell(out, t + 0.14, 0.13, 1.5, 0, send); run([79, 81, 83, 86, 88, 91], 0.03, 0.14, 0.8, t + 0.05); break
      case 'build': [0, 0.13, 0.26].forEach((d, i) => { this.drum(out, i === 2 ? 'tom' : 'rim', t + d, i === 2 ? 0.3 : 0.24, 0, i === 2 ? 1 : 0.85); this.metal(out, t + d, 0.06, 0.9) }); break
      case 'research': this.whoosh(out, t, 0.2, 0.12, 2000, 5200); this.bell(out, t + 0.12, 0.1, 1.5, 0, send); break
      case 'formation': this.drum(out, 'taiko', t, 0.3); this.drum(out, 'rim', t + 0.1, 0.12); break
      case 'battleStart': window.setTimeout(() => { this.crowd('cry', 0.2, 0, 10); this.neigh(0.14, -0.4) }, 650); this.horn(out, 45, t, 1.1, 0.16, send); [0, 0.28, 0.56].forEach((d, i) => this.drum(out, 'taiko', t + d, 0.4 + i * 0.12)); this.gong(out, t + 0.84, 0.32, 1, send); break
      case 'attack': this.whoosh(out, t, 0.13, 0.08, 1200, 3200, pan); break
      // 타격: 짧은 파열음(딱) + 몸에 닿는 둔탁한 소리 + 작은 저음(쿵)
      case 'hit': { const rr = 0.85 + Math.random() * 0.3; this.thump(out, t, 0.3, pan, undefined, rr); this.drum(out, 'tom', t, 0.22, pan, 0.75 * rr); break }
      case 'hitBig': { const rr = 0.85 + Math.random() * 0.25; this.thump(out, t, 0.55, pan, send, 0.85 * rr); this.drum(out, 'taiko', t, 0.55, pan, 0.8 * rr); break }
      case 'unitDown': this.crowd('groan', 0.13, pan, 6); this.neigh(0.13, pan, 0.85); this.drum(out, 'taiko', t, 0.45, pan, 0.78); this.whoosh(out, t, 0.5, 0.14, 500, 120, pan, send); break
      case 'enemySkill': this.gong(out, t, 0.24, 0.7, send); this.whoosh(out, t, 0.35, 0.12, 600, 2400, pan); break
      case 'enemyWarn': [0, 0.13, 0.26].forEach(d => this.bell(out, t + d, 0.14, 2.2, 0, send)); break
      case 'pattern': this.horn(out, 50, t, 0.7, 0.13, send); this.drum(out, 'tom', t + 0.05, 0.2); this.drum(out, 'tom', t + 0.15, 0.24); break
      case 'answerGood': this.bell(out, t, 0.16, 1.5, 0, send); run([81, 86, 88, 93], 0.03, 0.15, 0.85); break
      case 'answerBad': this.drum(out, 'tom', t, 0.3, 0, 0.7); this.metal(out, t, 0.1, 0.55); break
      case 'counter': this.metal(out, t, 0.42, 1.3, pan, send); this.bell(out, t + 0.02, 0.12, 1.8, pan, send); break
      case 'phase': [0, 0.12, 0.22, 0.3, 0.37, 0.43].forEach((d, i) => this.drum(out, i % 2 ? 'tom' : 'taiko', t + d, 0.22 + i * 0.05)); this.gong(out, t + 0.5, 0.3, 1, send); break
      case 'collapse': this.gong(out, t, 0.42, 0.85, send); this.drum(out, 'taiko', t, 0.55, 0, 0.8); this.drum(out, 'cymbal', t, 0.2); break
      case 'timeWarn': this.bell(out, t, 0.14, 0.8, 0, send); this.bell(out, t + 0.25, 0.14, 0.8, 0, send); break
      case 'heal': this.bell(out, t, 0.07, 1.26, pan, send); this.bell(out, t + 0.08, 0.06, 1.5, pan, send); break
      case 'tactic': this.horn(out, 52, t, 0.55, 0.12, send); this.drum(out, 'taiko', t, 0.32); break
      case 'move': this.whoosh(out, t, 0.18, 0.07, 500, 1400, pan); this.drum(out, 'rim', t, 0.08); break
      case 'raidSquad': this.gong(out, t, 0.36, 0.9, send); this.drum(out, 'taiko', t, 0.45); break
      case 'victory': this.stinger(true); break
      case 'defeat': this.stinger(false); break
    }
  }

  // ── 타격 · 스킬용 소리 재료 ──
  /** 영화식 저음 타격: 사인파가 빠르게 떨어지며(쿵) 낮은 잡음이 함께 터진다 */
  boom(out: AudioNode, t: number, vol: number, f0 = 78, f1 = 30, dur = 0.9, pan = 0, send?: AudioNode): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); this.route(out, g, pan, send)
    o.start(t); o.stop(t + dur + 0.05)
    o.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
    const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), ng = ctx.createGain()
    n.buffer = this.noise
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.25)
    ng.gain.setValueAtTime(vol * 0.9, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    n.connect(lp).connect(ng); this.route(out, ng, pan, send)
    n.start(t, Math.random() * 1.5); n.stop(t + 0.32)
    n.onended = () => { try { ng.disconnect() } catch { /* 끝 */ } }
  }
  /** 둥근 폭발음("펑 · 쾅"): 낮게 걸러진 잡음이 터졌다 빠르게 가라앉는다 + 저음 */
  thump(out: AudioNode, t: number, vol: number, pan = 0, send?: AudioNode, low = 1): void {
    const ctx = this.ctx!
    const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain()
    n.buffer = this.noise
    lp.type = 'lowpass'; lp.Q.value = 1.2
    lp.frequency.setValueAtTime(1500 * low, t); lp.frequency.exponentialRampToValueAtTime(140 * low, t + 0.3)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34)
    n.connect(lp).connect(g); this.route(out, g, pan, send)
    n.start(t, Math.random() * 1.5); n.stop(t + 0.36)
    n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
    this.boom(out, t, vol * 0.9, 100 * low, 34, 0.55, pan, send)
  }
  /** 날카로운 파열음(맞는 순간의 "딱"): 아주 짧은 고음 잡음 + 딸깍 */
  crack(out: AudioNode, t: number, vol: number, pan = 0, bright = 2600, dur = 0.07): void {
    const ctx = this.ctx!
    const n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), pk = ctx.createBiquadFilter(), g = ctx.createGain()
    n.buffer = this.noise
    hp.type = 'highpass'; hp.frequency.value = bright * 0.5
    pk.type = 'peaking'; pk.frequency.value = bright; pk.gain.value = 9; pk.Q.value = 1.2
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    n.connect(hp).connect(pk).connect(g); this.route(out, g, pan)
    n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.02)
    n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }
  /** 불길: 낮게 일렁이는 바람 소리에 타닥타닥 튀는 불똥 */
  roar(out: AudioNode, t: number, dur: number, vol: number, pan = 0, send?: AudioNode): void {
    const ctx = this.ctx!
    const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain()
    n.buffer = this.noise; n.loop = true
    lp.type = 'lowpass'; lp.Q.value = 3
    lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1400, t + dur * 0.3); lp.frequency.linearRampToValueAtTime(500, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.2); g.gain.linearRampToValueAtTime(vol * 0.6, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur)
    n.connect(lp).connect(g); this.route(out, g, pan, send)
    n.start(t, Math.random()); n.stop(t + dur + 0.05)
    n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
    // 불똥은 몇 번만, 낮게(높고 잦으면 비닐이 바스락거리는 소리처럼 들린다)
    for (let i = 0; i < 5; i += 1) this.crack(out, t + Math.random() * dur * 0.7, vol * (0.2 + Math.random() * 0.2), pan + (Math.random() - 0.5) * 0.6, 900 + Math.random() * 500, 0.03)
  }
  /** 짐승 같은 포효(공포 · 분노): 낮은 톱니파에 목청(필터)이 열렸다 닫힌다 */
  growl(out: AudioNode, t: number, dur: number, vol: number, f = 72, pan = 0, send?: AudioNode): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain()
    o.type = 'sawtooth'; o2.type = 'sawtooth'
    o.frequency.setValueAtTime(f * 1.3, t); o.frequency.exponentialRampToValueAtTime(f, t + dur)
    o2.frequency.setValueAtTime(f * 1.31 * 1.01, t); o2.frequency.exponentialRampToValueAtTime(f * 1.012, t + dur)
    const lfo = ctx.createOscillator(), lg = ctx.createGain()
    lfo.frequency.value = 23; lg.gain.value = f * 0.12; lfo.connect(lg); lg.connect(o.frequency)
    bp.type = 'bandpass'; bp.Q.value = 2.5
    bp.frequency.setValueAtTime(380, t); bp.frequency.linearRampToValueAtTime(950, t + dur * 0.35); bp.frequency.linearRampToValueAtTime(420, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.08); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur)
    o.connect(bp); o2.connect(bp); bp.connect(g); this.route(out, g, pan, send)
    ;[o, o2, lfo].forEach(node => { node.start(t); node.stop(t + dur + 0.05) })
    o.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
    this.whoosh(out, t, dur * 0.9, vol * 0.5, 500, 1500, pan, send)
  }
  /** 일그러지는 기묘한 소리(혼란 · 계략): 어긋난 두 음이 흔들리며 내려간다 */
  warble(out: AudioNode, t: number, dur: number, vol: number, midi = 76, pan = 0, send?: AudioNode): void {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.1); g.gain.linearRampToValueAtTime(0.0001, t + dur)
    const oscs = [0, 0.37].map(det => {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(mtof(midi + det), t); o.frequency.exponentialRampToValueAtTime(mtof(midi - 7 + det), t + dur)
      const lfo = ctx.createOscillator(), lg = ctx.createGain()
      lfo.frequency.value = 5.5 + det * 4; lg.gain.value = mtof(midi) * 0.03
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g)
      lfo.start(t); lfo.stop(t + dur + 0.05)
      return o
    })
    this.route(out, g, pan, send)
    oscs.forEach(o => { o.start(t); o.stop(t + dur + 0.05) })
    oscs[0].onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }
  /** 쇠사슬 · 쇠붙이 덜그럭(연환 · 갑주 균열) */
  rattle(out: AudioNode, t: number, n: number, vol: number, rate = 2, pan = 0): void {
    let at = t
    for (let i = 0; i < n; i += 1) { this.metal(out, at, vol * (0.6 + Math.random() * 0.4), rate * (0.85 + Math.random() * 0.3), pan + (Math.random() - 0.5) * 0.5); at += 0.025 + Math.random() * 0.04 }
  }
  /** 칼날이 울리는 "스릉"(출혈 · 반격) */
  shing(out: AudioNode, t: number, vol: number, rate = 1.8, pan = 0, send?: AudioNode): void {
    this.metal(out, t, vol, rate, pan, send)
    this.metal(out, t + 0.01, vol * 0.6, rate * 1.5, pan, send)
    this.whoosh(out, t, 0.18, vol * 0.5, 3000, 7500, pan)
  }
  /** 방패 · 철벽: 낮게 울리는 쇠 + 짧은 징 + 쿵 */
  shield(out: AudioNode, t: number, vol: number, pan = 0, send?: AudioNode): void {
    this.metal(out, t, vol, 0.55, pan, send)
    this.gong(out, t, vol * 0.7, 1.35, send)
    this.boom(out, t, vol * 0.6, 60, 34, 0.6, pan)
  }
  /** 무장마다 다른 짧은 가락(세 음): 같은 계열 스킬이어도 무장마다 들리는 소리가 다르다 */
  private motif(out: AudioNode, t: number, seed: number, vol: number, kind: 'bell' | 'pluck' | 'brass', send?: AudioNode): void {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16]
    const root = 62 + (seed % 5)
    const notes = [0, 1, 2].map(i => root + scale[(seed >> (i * 3)) % scale.length])
    notes.forEach((midi, i) => {
      const at = t + i * (0.07 + (seed % 3) * 0.015)
      if (kind === 'bell') this.bell(out, at, vol, mtof(midi + 12) / 1046.5, -0.3 + i * 0.3, send)
      else if (kind === 'pluck') this.pluck(out, midi + 12, at, vol, { bright: 0.85, dur: 1.3, pan: -0.3 + i * 0.3, send })
      else this.brass(out, [midi - 12, midi - 5], at, 0.22, vol * 0.5, send)
    })
  }

  // ── 말 ──────────────────────────────────────────────
  /** 말발굽 한 번: 흙바닥을 디디는 낮고 둔탁한 소리(부대 기병이면 여러 마리가 겹친다) */
  hoof(vol: number, pan = 0, herd = 1): void {
    if (!this.allow(`hoof${Math.round(pan * 4)}`, 45, true)) return
    const ctx = this.ctx!, out = this.sfxVol
    const t = ctx.currentTime + 0.005
    for (let i = 0; i < herd; i += 1) {
      const at = t + (i ? Math.random() * 0.06 : 0)
      const rr = 0.8 + Math.random() * 0.4
      const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain()
      n.buffer = this.noise
      lp.type = 'lowpass'; lp.frequency.value = 520 * rr
      g.gain.setValueAtTime(vol * 2 * (i ? 0.55 : 1), at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07)
      n.connect(lp).connect(g); this.route(out, g, pan + (Math.random() - 0.5) * 0.3)
      n.start(at, Math.random() * 1.5); n.stop(at + 0.08)
      n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
      const o = ctx.createOscillator(), og = ctx.createGain()
      o.frequency.setValueAtTime(95 * rr, at); o.frequency.exponentialRampToValueAtTime(55, at + 0.07)
      og.gain.setValueAtTime(vol * 1.6 * (i ? 0.5 : 1), at); og.gain.exponentialRampToValueAtTime(0.0001, at + 0.09)
      o.connect(og); this.route(out, og, pan)
      o.start(at); o.stop(at + 0.1)
      o.onended = () => { try { og.disconnect() } catch { /* 끝 */ } }
    }
  }
  /** 말 울음(히힝): 성대 소리(톱니파)가 높게 올라갔다가 떨리며 내려오고, 콧구멍 바람이 섞인다 */
  neigh(vol = 0.18, pan = 0, low = 1): void {
    if (!this.allow('neigh', 700)) return
    const ctx = this.ctx!, out = this.sfxVol, send = this.sfxSend
    const t = ctx.currentTime + 0.01, dur = 1.1
    const base = (520 + Math.random() * 120) * low
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(base * 0.8, t)
    o.frequency.linearRampToValueAtTime(base * 1.9, t + 0.18)
    o.frequency.linearRampToValueAtTime(base * 1.5, t + 0.45)
    o.frequency.linearRampToValueAtTime(base * 0.9, t + dur)
    const trill = ctx.createOscillator(), tg = ctx.createGain()
    trill.frequency.setValueAtTime(9, t); trill.frequency.linearRampToValueAtTime(16, t + dur)
    tg.gain.setValueAtTime(base * 0.02, t); tg.gain.linearRampToValueAtTime(base * 0.16, t + 0.4)
    trill.connect(tg); tg.connect(o.frequency)
    // 목청(포먼트) 두 개
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter()
    f1.type = 'bandpass'; f1.frequency.value = 1100 * low; f1.Q.value = 4
    f2.type = 'bandpass'; f2.frequency.value = 2400 * low; f2.Q.value = 6
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.06); g.gain.setValueAtTime(vol, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    // 떨림(음량)
    const am = ctx.createOscillator(), ag = ctx.createGain()
    am.frequency.value = 13; ag.gain.value = vol * 0.45
    am.connect(ag); ag.connect(g.gain)
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g)
    this.route(out, g, pan, send)
    ;[o, trill, am].forEach(node => { node.start(t); node.stop(t + dur + 0.05) })
    o.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
    this.snort(vol * 0.6, pan, t + dur - 0.1)
  }
  /** 말 콧김(푸르릉) */
  snort(vol = 0.1, pan = 0, at?: number): void {
    const ctx = this.ctx!, out = this.sfxVol
    const t = at ?? ctx.currentTime + 0.005
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain()
    n.buffer = this.noise
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.4
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    const am = ctx.createOscillator(), ag = ctx.createGain()
    am.frequency.value = 28; ag.gain.value = vol * 0.6; am.connect(ag); ag.connect(g.gain)
    n.connect(bp).connect(g); this.route(out, g, pan)
    n.start(t, Math.random() * 1.5); n.stop(t + 0.4); am.start(t); am.stop(t + 0.4)
    n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }

  // ── 사람 목소리(함성) ─────────────────────────────────
  /**
   * 병사들의 함성("와아아!"): 여러 사람 목소리(조금씩 다른 음높이 · 떨림)를 모음 포먼트에 통과시킨다.
   * mood: 'cry' 진격 함성(우→아로 열린다), 'shout' 짧은 기합, 'groan' 쓰러질 때 낮은 신음
   */
  crowd(mood: 'cry' | 'shout' | 'groan', vol = 0.2, pan = 0, voices = 9): void {
    if (!this.allow(`crowd:${mood}`, mood === 'shout' ? 400 : 900)) return
    const ctx = this.ctx!, out = this.sfxVol, send = this.sfxSend
    const t = ctx.currentTime + 0.01
    const dur = mood === 'cry' ? 2.1 : mood === 'shout' ? 0.75 : 1.3
    const pitch = mood === 'groan' ? 95 : mood === 'shout' ? 165 : 150
    const bus = ctx.createGain()
    bus.gain.setValueAtTime(0.0001, t)
    bus.gain.linearRampToValueAtTime(vol, t + (mood === 'shout' ? 0.05 : 0.25))
    bus.gain.setValueAtTime(vol, t + dur * 0.6)
    bus.gain.linearRampToValueAtTime(0.0001, t + dur)
    // 모음: 우(300/800) → 아(750/1200), 신음은 오(450/800)
    const F = [ctx.createBiquadFilter(), ctx.createBiquadFilter(), ctx.createBiquadFilter()]
    const [a1, a2] = mood === 'groan' ? [450, 800] : [750, 1200]
    F.forEach((f, i) => { f.type = 'bandpass'; f.Q.value = [5, 7, 9][i] })
    F[0].frequency.setValueAtTime(mood === 'groan' ? a1 : 320, t); F[0].frequency.linearRampToValueAtTime(a1, t + 0.25)
    F[1].frequency.setValueAtTime(mood === 'groan' ? a2 : 820, t); F[1].frequency.linearRampToValueAtTime(a2, t + 0.25)
    F[2].frequency.value = 2600
    const mix = ctx.createGain(); mix.gain.value = 1
    F.forEach((f, i) => { const fg = ctx.createGain(); fg.gain.value = [1, 0.7, 0.35][i]; mix.connect(f); f.connect(fg); fg.connect(bus) })
    const nodes: AudioScheduledSourceNode[] = []
    for (let i = 0; i < voices; i += 1) {
      const o = ctx.createOscillator(), vg = ctx.createGain()
      o.type = 'sawtooth'
      const p = pitch * (0.75 + Math.random() * 0.6)
      const start = t + Math.random() * (mood === 'shout' ? 0.06 : 0.3)
      o.frequency.setValueAtTime(p * (mood === 'groan' ? 1.1 : 0.9), start)
      o.frequency.linearRampToValueAtTime(p * (mood === 'groan' ? 0.8 : 1.12), start + dur * 0.5)
      o.frequency.linearRampToValueAtTime(p * (mood === 'groan' ? 0.7 : 0.95), t + dur)
      const vib = ctx.createOscillator(), vbg = ctx.createGain()
      vib.frequency.value = 4.5 + Math.random() * 2.5; vbg.gain.value = p * 0.025
      vib.connect(vbg); vbg.connect(o.frequency)
      vg.gain.setValueAtTime(0.0001, t); vg.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, start + 0.08)
      o.connect(vg); vg.connect(mix)
      o.start(start); o.stop(t + dur + 0.05); vib.start(start); vib.stop(t + dur + 0.05)
      nodes.push(o)
    }
    // 숨소리(목소리의 거친 결)
    const n = ctx.createBufferSource(), ng = ctx.createGain()
    n.buffer = this.noise; n.loop = true
    ng.gain.value = 0.25
    n.connect(ng); ng.connect(mix)
    n.start(t, Math.random()); n.stop(t + dur + 0.05)
    this.route(out, bus, pan, send)
    nodes[0].onended = () => { try { bus.disconnect() } catch { /* 끝 */ } }
  }

  // ── 배경 환경음(바람 · 먼 전투 소리 · 새소리) ─────────────────
  private ambienceBus: GainNode | null = null
  private ambienceNodes: AudioScheduledSourceNode[] = []
  private ambienceTimer = 0
  private ambienceKind: 'battle' | 'home' | 'none' = 'none'
  /** 화면에 맞는 환경음: 전장은 바람과 멀리서 들리는 함성 · 쇳소리 · 북, 본영은 잔잔한 바람과 새소리 */
  setAmbience(kind: 'battle' | 'home' | 'none'): void {
    if (!this.ctx || kind === this.ambienceKind) return
    this.ambienceKind = kind
    const ctx = this.ctx
    const old = this.ambienceBus, oldNodes = this.ambienceNodes
    if (old) { old.gain.setTargetAtTime(0, ctx.currentTime, 0.6); window.setTimeout(() => { oldNodes.forEach(node => { try { node.stop() } catch { /* 끝 */ } }); try { old.disconnect() } catch { /* 끝 */ } }, 3000) }
    window.clearInterval(this.ambienceTimer)
    this.ambienceBus = null; this.ambienceNodes = []
    if (kind === 'none') return
    const bus = ctx.createGain()
    bus.gain.setValueAtTime(0, ctx.currentTime); bus.gain.setTargetAtTime(1, ctx.currentTime, 1.2)
    bus.connect(this.sfxVol)
    this.ambienceBus = bus
    const loopNoise = (type: BiquadFilterType, freq: number, q: number, vol: number, lfoRate: number, lfoDepth: number) => {
      const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
      n.buffer = this.noise; n.loop = true
      f.type = type; f.frequency.value = freq; f.Q.value = q
      g.gain.value = vol
      const lfo = ctx.createOscillator(), lg = ctx.createGain()
      lfo.frequency.value = lfoRate; lg.gain.value = lfoDepth
      lfo.connect(lg); lg.connect(f.frequency)
      const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain()
      lfo2.frequency.value = lfoRate * 0.63; lg2.gain.value = vol * 0.5
      lfo2.connect(lg2); lg2.connect(g.gain)
      n.connect(f).connect(g).connect(bus)
      n.start(ctx.currentTime, Math.random()); lfo.start(); lfo2.start()
      this.ambienceNodes.push(n, lfo, lfo2)
    }
    if (kind === 'battle') {
      loopNoise('bandpass', 380, 0.8, 0.05, 0.11, 160) // 들판을 쓰는 바람
      loopNoise('lowpass', 160, 0.7, 0.05, 0.05, 40) // 낮게 깔린 웅성거림
      loopNoise('bandpass', 900, 2.2, 0.012, 0.3, 250) // 먼 함성의 결
      // 멀리서 들리는 쇳소리 · 북 · 말 울음(가끔)
      this.ambienceTimer = window.setInterval(() => {
        if (!this.ctx || this.ctx.state !== 'running' || !this.ambienceBus) return
        const t = this.ctx.currentTime + Math.random() * 0.5, pan = (Math.random() - 0.5) * 1.6, roll = Math.random()
        if (roll < 0.45) this.play_(this.sample('metal'), this.ambienceBus, t, 0.035, { rate: 0.7 + Math.random() * 0.6, pan, filter: 1400 })
        else if (roll < 0.75) this.play_(this.sample('taiko'), this.ambienceBus, t, 0.05, { rate: 0.8, pan, filter: 500 })
        else if (roll < 0.85) this.whoosh(this.ambienceBus, t, 0.5, 0.02, 400, 1100, pan)
      }, 900)
    } else {
      // (본영은 바람 잡음을 깔지 않는다 — 배경음 뒤에서 '치지직' 하는 잡음처럼 들린다) 새소리만 가끔
      // 새소리: 짧게 올라가는 지저귐 몇 번
      this.ambienceTimer = window.setInterval(() => {
        if (!this.ctx || this.ctx.state !== 'running' || !this.ambienceBus || Math.random() < 0.55) return
        const c = this.ctx, bus2 = this.ambienceBus
        const t0 = c.currentTime + Math.random() * 0.6, pan = (Math.random() - 0.5) * 1.4
        const base = 2600 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4)
        for (let i = 0; i < n; i += 1) {
          const t = t0 + i * (0.09 + Math.random() * 0.05)
          const o = c.createOscillator(), g = c.createGain()
          o.type = 'sine'
          o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.06)
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
          o.connect(g); this.route(bus2, g, pan)
          o.start(t); o.stop(t + 0.1)
          o.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
        }
      }, 1400)
    }
  }

  // ── 자연 현상(계략 속성) ─────────────────────────────────
  /** 벼락: 찢어지는 소리 + 길게 굴러가는 우르릉 */
  thunder(t: number, vol: number, pan = 0): void {
    const ctx = this.ctx!, out = this.sfxVol, hall = this.hallSend
    this.thump(out, t, vol * 0.8, pan, hall, 1.4)
    const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain()
    n.buffer = this.noise; n.loop = true
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 2.2)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05)
    for (let i = 1; i < 6; i += 1) g.gain.linearRampToValueAtTime(vol * (0.4 + Math.random() * 0.5) * (1 - i / 7), t + i * 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4)
    n.connect(lp).connect(g); this.route(out, g, pan, hall)
    n.start(t, Math.random()); n.stop(t + 2.5)
    n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
  }
  /** 물: 쏴아 밀려오는 물결 + 거품 */
  water(t: number, vol: number, pan = 0): void {
    const ctx = this.ctx!, out = this.sfxVol
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain()
    n.buffer = this.noise; n.loop = true
    bp.type = 'bandpass'; bp.Q.value = 0.9
    bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(1800, t + 0.5); bp.frequency.linearRampToValueAtTime(700, t + 1.4)
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.35); g.gain.linearRampToValueAtTime(0.0001, t + 1.5)
    n.connect(bp).connect(g); this.route(out, g, pan, this.hallSend)
    n.start(t, Math.random()); n.stop(t + 1.55)
    n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
    for (let i = 0; i < 10; i += 1) {
      const at = t + 0.2 + Math.random() * 1.0, f = 300 + Math.random() * 500
      const o = ctx.createOscillator(), og = ctx.createGain()
      o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * 2.2, at + 0.05)
      og.gain.setValueAtTime(vol * 0.35, at); og.gain.exponentialRampToValueAtTime(0.0001, at + 0.06)
      o.connect(og); this.route(out, og, pan + (Math.random() - 0.5) * 0.5)
      o.start(at); o.stop(at + 0.07)
      o.onended = () => { try { og.disconnect() } catch { /* 끝 */ } }
    }
  }
  /** 천명(5등급) 무장의 주제 가락: 무장마다 다른 호궁 네 음(스킬을 쓸 때) */
  heroTheme(seed: number, vol = 0.12): void {
    if (!this.ctx || !this.unlocked) return
    const scale = [0, 3, 5, 7, 10, 12, 15]
    const root = 57 + (seed % 4)
    const t = this.ctx.currentTime + 0.05
    let at = t
    for (let i = 0; i < 4; i += 1) {
      const deg = scale[(seed >> (i * 2 + 1)) % scale.length]
      const dur = i === 3 ? 0.9 : 0.22 + ((seed >> i) % 2) * 0.12
      this.erhu(this.sfxVol, root + deg, at, dur, vol, i === 3 ? -1 : 0)
      at += dur
    }
  }

  /**
   * 무기별 공격 · 피격 소리. swing = 휘두르기 · 찌르기 · 활쏘기(무기가 움직이는 순간), hit = 맞는 순간.
   * 칼은 "쉭 → 서걱 · 쨍", 창은 "슉 → 퍽(깊고 둔탁)", 활은 "팅 · 휘이 → 탁", 책사 화염구는 "슈욱 → 펑".
   */
  weapon(kind: WeaponSound, phase: 'swing' | 'hit', opts: { pan?: number; big?: boolean } = {}): void {
    if (!this.allow(`${kind}:${phase}`, phase === 'hit' ? 70 : 90, true)) return
    const out = this.sfxVol, send = this.sfxSend
    const t = this.ctx!.currentTime + 0.005
    const pan = opts.pan ?? 0, big = opts.big ? 1.6 : 1
    const rr = 0.9 + Math.random() * 0.2
    if (phase === 'swing') {
      switch (kind) {
        case 'sword': // 칼날이 공기를 가르는 "쉭" + 얇은 쇳소리
          this.whoosh(out, t, 0.2, 0.3, 700 * rr, 4600 * rr, pan)
          this.whoosh(out, t + 0.03, 0.12, 0.18, 3000, 7000, pan)
          break
        case 'spear': // 짧고 곧게 뻗는 "슉" + 내딛는 발
          this.whoosh(out, t, 0.1, 0.32, 1400 * rr, 2600 * rr, pan)
          this.drum(out, 'tom', t, 0.1, pan, 0.6)
          break
        case 'arrow': // 활시위 "팅" + 화살이 날아가는 "휘이"
          this.pluck(out, 43 + Math.round(Math.random() * 3), t, 0.2, { bright: 0.35, dur: 0.35, pan })
          this.crack(out, t, 0.1, pan, 5200, 0.025)
          this.whoosh(out, t + 0.02, 0.32, 0.16, 2600 * rr, 6200 * rr, pan)
          break
        case 'magic': { // 화염구 발사 "슈욱": 낮게 깔린 바람이 빠르게 밀려 나간다(타닥거리는 잡음 없이)
          const ctx = this.ctx!
          const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain()
          n.buffer = this.noise
          lp.type = 'lowpass'; lp.Q.value = 6
          lp.frequency.setValueAtTime(260 * rr, t); lp.frequency.exponentialRampToValueAtTime(1500 * rr, t + 0.16); lp.frequency.exponentialRampToValueAtTime(420, t + 0.42)
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
          n.connect(lp).connect(g); this.route(out, g, pan, send)
          n.start(t, Math.random() * 1.5); n.stop(t + 0.48)
          n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
          this.boom(out, t, 0.14, 120 * rr, 60, 0.2, pan)
          break
        }
      }
      return
    }
    switch (kind) {
      case 'sword': // 베이는 "서걱" + 갑옷에 닿는 "쨍"
        // 쾅: 둥근 폭발음 + 갑옷에 닿는 낮은 쇳소리
        this.thump(out, t, 0.42 * big, pan, send, rr)
        this.metal(out, t + 0.005, 0.12 * big, 0.62 * rr, pan, send)
        this.drum(out, 'tom', t, 0.22 * big, pan, 0.7 * rr)
        if (opts.big) this.drum(out, 'taiko', t, 0.35, pan, rr)
        break
      case 'spear': // 깊게 박히는 "퍽" — 낮고 둔탁하다
        this.drum(out, 'tom', t, 0.32 * big, pan, 0.62 * rr)
        this.boom(out, t, 0.26 * big, 105 * rr, 44, 0.32, pan)
        this.thump(out, t, 0.3 * big, pan, undefined, 0.8 * rr)
        this.metal(out, t + 0.01, 0.05 * big, 0.6 * rr, pan)
        if (opts.big) this.drum(out, 'taiko', t, 0.4, pan, 0.8)
        break
      case 'arrow': { // 화살이 꽂히는 "탁 · 탁"
        const n = opts.big ? 4 : 2
        for (let i = 0; i < n; i += 1) {
          const at = t + i * (0.03 + Math.random() * 0.03)
          this.thump(out, at, 0.2 * big, pan + (Math.random() - 0.5) * 0.4, undefined, 1.2 * rr)
          this.drum(out, 'tom', at, 0.1 * big, pan, 1.5 * rr)
        }
        if (opts.big) this.boom(out, t, 0.24, 90, 40, 0.4, pan)
        break
      }
      case 'magic': { // 화염구가 터지는 "펑": 땅을 울리는 깊은 저음 + 둥근 폭발 + 큰북 + 길게 퍼지는 울림(웅장하게)
        const ctx = this.ctx!, hall = this.hallSend
        this.boom(out, t, 0.75 * big, 95 * rr, 26, 1.4, pan, hall)
        this.boom(out, t + 0.012, 0.35 * big, 180 * rr, 55, 0.5, -pan * 0.5)
        this.drum(out, 'taiko', t, 0.6 * big, pan, 0.7 * rr, hall)
        const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain()
        n.buffer = this.noise
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(160, t + 0.5)
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.65 * big, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
        n.connect(lp).connect(g); this.route(out, g, pan, hall)
        n.start(t, Math.random() * 1.5); n.stop(t + 0.58)
        n.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
        // 폭발 뒤 낮게 굴러가는 여운(우르릉) — 연달아 터지면 겹쳐 웅웅거리지 않게 0.7초에 한 번만
        if (performance.now() - (this.last.get('fireTail') ?? -1e9) < 700) break
        this.last.set('fireTail', performance.now())
        const tail = ctx.createBufferSource(), tlp = ctx.createBiquadFilter(), tg = ctx.createGain()
        tail.buffer = this.noise; tail.loop = true
        tlp.type = 'lowpass'; tlp.frequency.value = 140; tlp.Q.value = 0.8
        tg.gain.setValueAtTime(0.0001, t); tg.gain.exponentialRampToValueAtTime(0.5 * big, t + 0.08); tg.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
        tail.connect(tlp).connect(tg); this.route(out, tg, 0, hall)
        tail.start(t, Math.random()); tail.stop(t + 1.85)
        tail.onended = () => { try { tg.disconnect() } catch { /* 끝 */ } }
        break
      }
    }
  }

  /**
   * 스킬 소리: 계열(돌격·사격·계략·통솔·수호·치유)마다 다른 바탕 + 스킬 효과(화계·공포·혼란·출혈…)마다 덧붙는 소리
   * + 무장마다 다른 짧은 가락과 음높이. impact = 시전부터 타격까지(초) — 큰 타격음은 그 순간에 맞춘다.
   */
  skill(type: SkillSound | string, side: 'player' | 'enemy', pan = 0, voice: { seed?: number; tags?: string[]; impact?: number; hits?: number; hero?: boolean } = {}): void {
    if (!this.allow('skill', 120)) return
    const out = this.sfxVol, send = this.sfxSend, hall = this.hallSend
    const t = this.ctx!.currentTime + 0.005
    const seed = voice.seed ?? 7
    const r = 0.88 + (seed % 25) / 100 // 무장마다 음높이
    const v = side === 'enemy' ? 0.62 : 1
    const hit = t + Math.max(0.2, voice.impact ?? 0.6)
    this.duckFor(side === 'player' ? 1400 : 900)
    // 시전: 기를 모으는 소리(공통) + 무장 가락
    this.swell(out, t, Math.max(0.15, hit - t - 0.02), 0.07 * v)
    this.whoosh(out, t, hit - t, 0.12 * v, 300, 2800, pan, send)
    if (side === 'player') this.motif(out, t + 0.02, seed, 0.11, type === '통솔' ? 'brass' : type === '치유' || type === '계략' ? 'bell' : 'pluck', send)
    // 천명 무장: 무장마다의 주제 가락(호궁) + 아군 함성
    if (voice.hero && side === 'player') this.heroTheme(seed)
    if (type === '돌격' || type === '통솔') this.crowd(type === '통솔' ? 'cry' : 'shout', (type === '통솔' ? 0.16 : 0.13) * v, pan, 8)
    switch (type) {
      case '돌격': {
        // 말발굽처럼 빨라지는 북 → 쿵 · 딱 · 칼날
        let at = 0, gap = 0.12
        while (t + at < hit - 0.05) { this.drum(out, 'tom', t + at, (0.16 + at * 0.35) * v, pan, r); gap = Math.max(0.045, gap * 0.8); at += gap }
        this.boom(out, hit, 0.62 * v, 84 * r, 30, 1.0, pan, hall)
        this.thump(out, hit, 0.6 * v, pan, hall, r)
        this.drum(out, 'taiko', hit, 0.75 * v, pan, r * 0.9)
        this.shing(out, hit + 0.01, 0.32 * v, 1.6 * r, pan, send)
        this.drum(out, 'cymbal', hit, 0.16 * v, pan)
        break
      }
      case '사격': {
        // 활시위 당김 → 화살비 → 둔탁하게 꽂히는 소리
        this.pluck(out, 40 + (seed % 5), t + 0.02, 0.22 * v, { bright: 0.2, dur: 0.5, pan })
        for (let i = 0; i < 9; i += 1) this.whoosh(out, hit - 0.25 + i * 0.035, 0.22, 0.1 * v, 2200 * r, 5200 * r, pan + (Math.random() - 0.5) * 0.8)
        for (let i = 0; i < 6; i += 1) { const at = hit + 0.12 + i * 0.045 + Math.random() * 0.02; this.drum(out, 'tom', at, 0.22 * v, pan + (Math.random() - 0.5) * 0.6, 1.3 * r); this.thump(out, at, 0.22 * v, pan, undefined, 1.1 * r) }
        this.boom(out, hit + 0.38, 0.45 * v, 70 * r, 32, 0.7, pan, hall)
        break
      }
      case '계략': {
        // 불이 아닌 계략은 벼락이 떨어진다(화계는 아래 불길 소리)
        if (!(voice.tags ?? []).includes('burning') && !(voice.tags ?? []).includes('water')) this.thunder(hit, 0.42 * v, pan)
        this.warble(out, t + 0.03, hit - t + 0.3, 0.09 * v, 74 + (seed % 7), pan, hall)
        ;[1, 1.19, 1.5, 1.78].forEach((rr, i) => this.bell(out, t + i * 0.05, 0.09 * v, rr * 0.75 * r, -0.4 + i * 0.25, send))
        this.gong(out, hit, 0.4 * v, 0.6 * r, hall)
        this.boom(out, hit, 0.55 * v, 66 * r, 26, 1.3, pan, hall)
        this.thump(out, hit, 0.45 * v, pan, hall, 0.9 * r)
        break
      }
      case '통솔': {
        // 뿔나팔 + 세 번 울리는 큰북 + 함성
        this.horn(out, 50 + (seed % 4), t, 0.9, 0.18 * v, hall)
        ;[0, 0.14, 0.28].forEach((d, i) => this.drum(out, 'taiko', t + 0.1 + d, (0.4 + i * 0.12) * v, pan, r))
        this.choir(out, [55, 59, 62, 67].map(m => m + (seed % 3)), hit - 0.1, 1.2, 0.1 * v)
        this.boom(out, hit, 0.45 * v, 72 * r, 34, 0.8, pan, hall)
        this.drum(out, 'cymbal', hit, 0.2 * v)
        break
      }
      case '수호': {
        this.gong(out, t, 0.32 * v, 0.8 * r, hall)
        this.shield(out, hit, 0.5 * v, pan, hall)
        this.metal(out, hit + 0.12, 0.25 * v, 0.75 * r, -pan, send)
        break
      }
      case '치유': {
        ;[76, 79, 83, 86, 88].forEach((midi, i) => this.pluck(out, midi + (seed % 3), t + i * 0.06, 0.18 * v, { bright: 0.8, dur: 1.8, send: hall }))
        this.choir(out, [67, 71, 74, 79], hit - 0.15, 1.4, 0.08 * v)
        ;[0, 0.09, 0.18].forEach((d, i) => this.bell(out, hit + d, 0.12 * v, (1.26 + i * 0.25) * r, -0.3 + i * 0.3, hall))
        break
      }
      default:
        this.gong(out, hit, 0.35 * v, r, hall); this.boom(out, hit, 0.4 * v, 70, 30, 0.8, pan)
    }
    // 연타(능통 필사의 연격 등): 타격 수만큼 더 친다
    for (let i = 1; i < (voice.hits ?? 1); i += 1) { const at = hit + i * 0.2; this.boom(out, at, 0.45 * v, 90 * r, 34, 0.6, pan); this.thump(out, at, 0.45 * v, pan, undefined, r); this.shing(out, at, 0.12 * v, 1.2 * r, pan) }
    // 효과마다 덧붙는 소리
    for (const tag of new Set(voice.tags ?? [])) {
      switch (tag) {
        case 'burning': this.roar(out, hit, 1.5, 0.34 * v, pan, hall); this.boom(out, hit + 0.05, 0.4 * v, 60, 28, 1.1, pan); break
        case 'fear': case 'rage': this.growl(out, hit - 0.05, 0.9, 0.2 * v, tag === 'rage' ? 95 : 70, pan, hall); break
        case 'confusion': this.warble(out, hit, 1.1, 0.1 * v, 81, pan, hall); this.warble(out, hit + 0.15, 0.9, 0.07 * v, 69, -pan, hall); break
        case 'silence': this.whoosh(out, hit, 0.6, 0.16 * v, 6000, 300, pan, hall); this.gong(out, hit + 0.1, 0.2 * v, 0.5, hall); break
        case 'bleed': this.shing(out, hit + 0.06, 0.35 * v, 2.1, pan, send); this.shing(out, hit + 0.2, 0.28 * v, 1.7, -pan, send); break
        case 'slow': this.warble(out, hit, 1.2, 0.09 * v, 52, pan, hall); this.boom(out, hit, 0.3 * v, 50, 24, 1.4, pan); break
        case 'blind': this.whoosh(out, hit, 0.9, 0.2 * v, 900, 5500, pan, hall); this.whoosh(out, hit + 0.1, 0.8, 0.14 * v, 5000, 1200, -pan, hall); break
        case 'chain': this.rattle(out, hit, 12, 0.18 * v, 2.3, pan); break
        case 'armor-break': case 'fracture': this.thump(out, hit + 0.04, 0.5 * v, pan, undefined, 0.9); this.rattle(out, hit + 0.05, 6, 0.22 * v, 1.4, pan); break
        case 'mark': [0, 0.12].forEach(d => this.bell(out, hit + d, 0.13 * v, 2.6, pan, send)); break
        case 'atk-up': case 'cavalry-surge': case 'insight': case 'swift': this.horn(out, 57 + (seed % 3), hit, 0.5, 0.12 * v, hall); break
        case 'dr-up': case 'iron-wall': case 'phoenix-guard': case 'bodyguard': case 'undying': this.shield(out, hit + 0.08, 0.32 * v, pan, hall); break
        case 'counter': this.shing(out, hit + 0.1, 0.3 * v, 1.5, pan, send); break
        case 'heal': case 'hot': case 'cleanse': [88, 91, 93].forEach((m, i) => this.pluck(out, m, hit + 0.1 + i * 0.05, 0.12 * v, { bright: 0.9, dur: 1.4, send: hall })); break
        case 'strip': this.whoosh(out, hit, 0.4, 0.16 * v, 4500, 600, pan, hall); break
        case 'selfCost': this.boom(out, t + 0.05, 0.35 * v, 55, 40, 0.3, pan); this.boom(out, t + 0.3, 0.3 * v, 55, 40, 0.3, pan); break
        case 'water': this.water(hit - 0.1, 0.3 * v, pan); break
        case 'wind': this.whoosh(out, hit - 0.3, 1.2, 0.28 * v, 300, 1400, pan, hall); this.whoosh(out, hit - 0.1, 1.0, 0.18 * v, 900, 2600, -pan, hall); break
        case 'thunder': this.thunder(hit, 0.4 * v, pan); break
      }
    }
  }

  // ── 뽑기 연출 ──
  private ceremonyReady(): boolean {
    if (!this.ensure()) return false
    if (this.ctx!.state === 'suspended') void this.ctx!.resume()
    this.applyVolumes()
    return true
  }
  /** 최고 등급이 정해진 순간(균열): 북이 빨라지고 소리가 부풀어 오른다. level 5 = 5성 무장 · 신화 장비 */
  rise(level: number, seconds = 1.3): void {
    if (level < 4 || !this.ceremonyReady()) return
    this.duckFor(7000)
    const out = this.sfxVol, t = this.ctx!.currentTime + 0.01
    this.swell(out, t, seconds, level >= 5 ? 0.28 : 0.18)
    // 점점 빨라지는 북
    let at = 0, gap = 0.22
    for (let i = 0; at < seconds - 0.05; i += 1) { this.drum(out, i % 3 === 2 ? 'taiko' : 'tom', t + at, 0.18 + (at / seconds) * 0.35); gap = Math.max(0.05, gap * 0.82); at += gap }
    // 올라가는 낮은 소리
    if (level >= 5) {
      const o = this.ctx!.createOscillator(), g = this.ctx!.createGain()
      o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(220, t + seconds)
      const lp = this.ctx!.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(1800, t + seconds)
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + seconds); g.gain.linearRampToValueAtTime(0.0001, t + seconds + 0.05)
      o.connect(lp).connect(g); this.route(out, g, 0, this.hallSend)
      o.start(t); o.stop(t + seconds + 0.1)
      o.onended = () => { try { g.disconnect() } catch { /* 끝 */ } }
    }
  }
  /** 섬광: 5성이면 징 · 큰북 · 금관 팡파르 · 합창 · 쏟아지는 방울과 현 */
  fanfare(level: number): void {
    if (level < 4 || !this.ceremonyReady()) return
    this.duckFor(level >= 5 ? 7500 : 5000)
    const out = this.sfxVol, hall = this.hallSend, t = this.ctx!.currentTime + 0.01
    const grand = level >= 5
    this.gong(out, t, grand ? 0.55 : 0.38, 0.9, hall)
    this.drum(out, 'taiko', t, 0.8); this.drum(out, 'taiko', t, 0.6, 0, 0.6)
    this.drum(out, 'cymbal', t, grand ? 0.35 : 0.25)
    // 금관 팡파르: 짧게 · 짧게 · 길게(사 장조 화음)
    const triad = [55, 59, 62, 67]
    this.brass(out, triad, t + 0.05, 0.16, grand ? 0.09 : 0.07, hall)
    this.brass(out, triad, t + 0.25, 0.16, grand ? 0.09 : 0.07, hall)
    this.brass(out, grand ? [55, 62, 67, 71, 74] : triad, t + 0.45, grand ? 2.4 : 1.5, grand ? 0.11 : 0.08, hall)
    if (grand) { this.drum(out, 'taiko', t + 0.25, 0.5); this.drum(out, 'taiko', t + 0.45, 0.7); this.drum(out, 'taiko', t + 0.45, 0.5, 0, 0.6) }
    // 현을 세 옥타브 쓸어 올림
    const sweep = pent(55, MAJOR_P).concat(pent(91, MAJOR_P).slice(0, grand ? 5 : 0))
    sweep.forEach((midi, i) => this.pluck(out, midi, t + 0.45 + i * 0.026, 0.16 + Math.min(0.1, i * 0.006), { bright: 0.8, dur: 2.2, pan: -0.7 + (i / sweep.length) * 1.4, send: hall }))
    // 쏟아지는 방울
    const bells = grand ? 16 : 8
    const notes = [79, 81, 83, 86, 88, 91, 93, 95, 98]
    for (let i = 0; i < bells; i += 1) {
      const midi = notes[Math.floor(Math.random() * notes.length)]
      this.bell(out, t + 0.5 + i * 0.075 + Math.random() * 0.03, 0.09, mtof(midi) / 1046.5, (Math.random() - 0.5) * 1.4, hall)
    }
    if (grand) this.choir(out, [55, 62, 67, 71], t + 0.4, 3.2, 0.12)
  }
  /** 등장 연출(5성 ‘천명 강림’ · 전설/신화 장비): 합창이 열리고 맑은 오음계가 올라간다 */
  heaven(level: number): void {
    if (!this.ceremonyReady()) return
    this.duckFor(7000)
    const out = this.sfxVol, hall = this.hallSend, t = this.ctx!.currentTime + 0.01
    const grand = level >= 5
    this.gong(out, t, grand ? 0.35 : 0.25, 0.75, hall)
    ;[72, 74, 76, 79, 81, 84, 86, 88].slice(0, grand ? 8 : 6).forEach((midi, i) => this.pluck(out, midi, t + 0.1 + i * 0.09, 0.16, { bright: 0.8, dur: 2, pan: -0.5 + i * 0.14, send: hall }))
    if (grand) {
      this.choir(out, [60, 67, 72, 76], t, 3.6, 0.13)
      this.brass(out, [48, 55, 60], t + 0.2, 3, 0.06, hall)
      ;[0, 0.6, 1.2].forEach(d => this.bell(out, t + 0.9 + d, 0.1, mtof(84 + d * 5) / 1046.5, 0, hall))
      this.flute(out, 84, t + 0.9, 0.5, 0.11); this.flute(out, 86, t + 1.4, 0.4, 0.11); this.flute(out, 88, t + 1.8, 1.4, 0.12)
    } else {
      this.choir(out, [60, 67, 72], t, 2.6, 0.08)
    }
  }

  /** 승리·패배 짧은 곡(음악 볼륨). 끝나면 본영 곡으로 돌아간다 */
  private stinger(won: boolean): void {
    if (!this.ctx) return
    this.setTheme('none')
    const out = this.musicIn, send = this.musicSend
    const t = this.ctx.currentTime + 0.05
    if (won) {
      ;[0, 0.09, 0.17, 0.24, 0.3, 0.35, 0.4, 0.44].forEach((d, i) => this.drum(out, i % 2 ? 'tom' : 'taiko', t + d, 0.25 + i * 0.06))
      this.gong(out, t + 0.55, 0.45, 1, send)
      this.drum(out, 'taiko', t + 0.55, 0.8)
      pent(55, MAJOR_P).slice(0, 11).forEach((midi, i) => this.pluck(out, midi, t + 0.58 + i * 0.032, 0.18 + i * 0.01, { bright: 0.75, dur: 2.4, pan: -0.5 + i * 0.1, send }))
      ;[[79, 0.4], [81, 0.2], [83, 0.2], [86, 1.5]].reduce((at, [midi, dur]) => { this.flute(out, midi, at, dur, 0.16); return at + dur }, t + 1)
      this.pad(out, [55, 59, 62, 67], t + 0.6, 3.2, 0.06)
      this.brass(out, [43, 50, 55, 59, 62], t + 0.55, 2.6, 0.08, this.hallSend)
      this.choir(out, [55, 62, 67, 71], t + 0.6, 3.4, 0.09)
      this.drum(out, 'cymbal', t + 0.55, 0.22)
    } else {
      this.gong(out, t, 0.45, 0.7, send)
      this.drum(out, 'taiko', t, 0.45, 0, 0.75)
      ;[[64, 0.6], [62, 0.5], [59, 0.5], [57, 1.6]].reduce((at, [midi, dur]) => { this.erhu(out, midi, at, dur, 0.13, -1); return at + dur }, t + 0.35)
      this.pad(out, [40, 47, 52], t + 0.2, 3.4, 0.06)
      this.choir(out, [52, 55, 59, 64], t + 0.3, 3.6, 0.07)
      this.brass(out, [28, 35, 40], t, 2.4, 0.06, this.hallSend)
    }
    this.setThemeAfter('home', won ? 4800 : 5200)
  }
}

export const sound = new SoundEngine()
