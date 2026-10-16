import * as THREE from 'three'
import { disposeOwned, markShared } from './gpu-shared'
import { allGenerals, frontLineOrder, scaleGeneral, type General } from './strategy'
import { sound, type WeaponSound } from '../engine/sound'
import { PLAYER_AUTO_PILOT, BattleCore, BATTLE_RULES, matchup, type BattleResearch, phaseName, troopCapacity as coreTroopCapacity, type BattleMode, type BattleResult, type BattleTactic, type CoreEvent } from './battle-core'
import type { ActiveBattleEffect } from './battle-effects'
import { GENERAL_SKILLS, type SkillType } from './skills'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { AnimatedHero, heroStrikeModel, loadModel, loadSkin, loadTroopModel, strikeModelFor, troopModelFor } from './battle-models'
import { heroLook } from './hero-style'
import { STRIKE_FRAMES } from './battle-rig'
import { SkeletalHero, bakeSquadModel, rigInfo } from './skeletal'
import { tr } from '../i18n/translate'
import { effectsSetting } from './settings'
import { CHARGE_STRIKE, MELEE_DURATION, MELEE_STRIKE, SHOOT_DURATION, SHOOT_RELEASE, SKILL_RELEASE, actorPose, chargeMotes, dashTrail, delayed, fireball, fireBurst, groundCircle, healMotes, hitSpark, lightPillar, lightning, projectile, shieldDome, shockwave, skillDuration, slashArc, type Fx, type Motion, type Pose } from './battle-motion'
import { clamp01, damp, easeIn2, easeOut2, smoothNoise, springTo, type Spring1 } from './motion-math'
import { animateGeneral, buildEnvironment, createGeneralModel, createSquad, detectSceneQuality, type Environment, type GeneralRig, type SceneQuality, type Squad } from './battle-scene'

/** 마지막 색보정: 가장자리 어둡게(비네트) · 따뜻한 대비 */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.42 }, warmth: { value: 0.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette, warmth; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * vignette * 2.2;
    c.rgb *= v; c.rgb += vec3(warmth, warmth * 0.45, -warmth * 0.35) * (1.0 - c.rgb);
    float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = mix(vec3(l), c.rgb, 1.08); gl_FragColor = c; }`,
}

export interface BattleUnitStatus {
  lane: number
  id: string
  name: string
  role: General['role']
  level: number
  stars: number
  troops: number
  maxTroops: number
  alive: boolean
  skillName: string
  skillType: SkillType
  skillUnlocked: boolean
  cooldown: number
  cooldownMax: number
  ready: boolean
  /** 같은 레인 적장과의 병종 상성(기병>궁병>창병>기병) */
  edge: 'adv' | 'dis' | null
}

export interface BattlePatternStatus {
  label: string
  lanes: number[]
  kind: 'lane' | 'pincer' | 'guard' | 'hold'
  warning: string
  timeLeft: number
  window: number
  judged: boolean
}

export interface BattleSnapshot {
  active: boolean
  mode: BattleMode
  /** 레이드: 이번 전투 누적 피해 */
  raidDamage?: number
  elapsed: number
  timeLeft: number
  /** 이번 막 적 사기 % (0~100) */
  morale: number
  moraleValue: number
  moraleMax: number
  phase: number
  phaseName: string
  pattern: BattlePatternStatus | null
  enemyPattern: string
  enemyPatternLane: number
  combo: number
  threat: number
  collapses: number
  tacticGauge: number
  tacticCosts: Record<BattleTactic, number>
  guardActive: boolean
  units: BattleUnitStatus[]
  enemyWarning: { name: string; general: string } | null
  selectedUnit: number
  selectedName: string
  selectedRole: General['role'] | '—'
  selectedArchetype: CommanderArchetype | '—'
  selectedLevel: number
  selectedStats: { leadership: number; martial: number; stratagem: number; speed: number } | null
  skillName: string
  skillDescription: string
  skillUnlocked: boolean
  skillReady: boolean
  skillCooldown: number
  activeEffects: ActiveBattleEffect[]
  playerDebuffs: ActiveBattleEffect[]
  bond: string
  opponentDeck: BattleOpponent[]
  troopStatus: BattleTroopStatus[]
  difficulty: string
  difficultyMultiplier: number
  duelMode: boolean
  enemyPower: number
  status: string
  speed: number
  paused: boolean
  autoPlay: boolean
  /** 대련 스킬 자동 */
  autoSkill: boolean
  log: string[]
  result: BattleResult | null
}

export interface BattleOpponent {
  id: string
  name: string
  role: General['role']
  level: number
  grade: General['grade']
  portraitPath?: string
}

export interface BattleTroopStatus {
  side: 'player' | 'enemy'
  index: number
  id: string
  name: string
  troops: number
  maxTroops: number
  alive: boolean
}

export interface SkillCutIn {
  side: 'player' | 'enemy'
  id: string
  name: string
  skill: string
  portraitPath?: string
}

export interface ArenaCallbacks {
  onEvent: (message: string) => void
  onBattleEnd: (result: BattleResult & { mode: BattleMode }) => void
  /** 스킬 사용 순간: 화면에 무장 초상 컷인을 띄운다 */
  onSkillCast?: (info: SkillCutIn) => void
}

interface BattleUnit {
  group: THREE.Group
  squad: THREE.Group
  model: THREE.Group
  general: General
  target: THREE.Vector3
  troops: number
  maxTroops: number
  attackTimer: number
  statusGroup: THREE.Group
  statusFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  hitFlash: number
  /** 피격 흔들림(감쇠 진동 스프링: 밀렸다가 살짝 되튕겨 자리 잡는다) */
  hit: Spring1
  motionPhase: number
  motionPulse: number
  troopType: TroopType
  attackMotion: number
  rig: GeneralRig
  squadCtl: Squad
  skillPulse: number
  /** 실사 3D 모델(불러오면 도형 모델 대신 보인다) */
  hero: AnimatedHero | SkeletalHero | null
  mounted: boolean
  /** 무장 몸 전체를 움직이는 축(돌진·젖힘·떠오름). 무장 모델은 이 안에 있다 */
  actor: THREE.Group
  motion: Motion | null
  pose: Pose
  /** 스킬 기운(0~1)과 그 색 */
  glow: number
  glowColor: THREE.Color
  /** 쓰러지는 중(1 → 0) */
  dying: number
  /** 병사들의 병종별 공격 자세: 시작 뒤 흐른 시간(초, 공격 중이 아니면 음수) */
  strikeAge: number
  /** 이동 속도(임계 감쇠 스프링으로 목표 자리까지: 출발·도착이 부드럽다) */
  vel: THREE.Vector3
  /** 걸음 가중치(0 서 있음 ~ 1 걷기·질주): 걷기와 서 있기를 섞어 뚝 바뀌지 않게 */
  gait: number
  /** 가속 방향으로 몸이 쏠리는 정도(앞뒤·좌우) */
  lean: { x: number; z: number }
  /** 히트스톱 동안 맞은 쪽이 떨리는 남은 시간(실제 초) */
  shake: number
  /** 돌진 · 밀림처럼 무장 몸(actor)이 제자리에서 앞뒤로 움직일 때의 걸음 가중치(말 다리를 움직인다) */
  dashGait: number
  prevPz: number
  /** 말발굽 소리 박자(한 걸음 주기 안의 위치) */
  hoofPhase: number
  /** 동작이 바뀌는 순간의 자세 차이를 부드럽게 지우는 관성 블렌딩 */
  blend: PoseBlend
  /** 쓰러져 땅에 닿을 때 흙먼지를 이미 냈는가 */
  fallDust: boolean
  /** 다른 자리(전열 등)를 칠 때 몸을 돌리는 각도와 그 유지 시간 */
  aim: number
  aimTo: number
  aimHold: number
}

/** 관성 블렌딩: [z, y, tilt, twist, scale] 차이와 그 속도, 직전 화면 자세 */
interface PoseBlend { off: number[]; vel: number[]; prev: number[]; prevVel: number[]; motion: Motion | null }

interface ArenaEffect {
  object: THREE.Object3D
  age: number
  life: number
  tick: (effect: ArenaEffect, delta: number) => void
  dispose: () => void
}

const ease = (k: number) => k * k * (3 - 2 * k)
/** 맞붙는 선: 아군·적 무장 사이 최소 간격(말 길이와 돌진 거리를 감안) */
/** 타격 연출 기준 병력(Lv20 무렵 무장 병력) */
const HIT_FX_TROOPS = 6600
const PLAYER_LINE_Z = -1.6
const ENEMY_LINE_Z = -6.0
/** 좌·중·우 부대 사이 간격: 병사 부대가 무장 뒤에 서므로 넓게 벌린다(세로 화면은 좁게) */
const LANE_GAP_WIDE = 6.2
const LANE_GAP_PORTRAIT = 4.4
/** 세로 화면에서 좌·우 부대가 서는 화면 가로 위치(-1~1): 아래 좌·우 카드의 가운데(±2/3)에 맞춘다 */
const PORTRAIT_LANE_NDC = 0.66
const MIN_LINE_GAP = 3.6
const jade = 0x52e0c4
/** 스킬 시전 직후 짧은 슬로모션(실제 초) */
const SKILL_SLOWMO_PLAYER = 0.3
const SKILL_SLOWMO_ENEMY = 0.18
const ember = 0xff8066
type TroopType = 'cavalry' | 'spearmen' | 'archer'
export type CommanderArchetype = '무장형' | '책사형' | '지원형'
const dashPose: Pose = { z: 0, y: 0, tilt: 0, twist: 0, scale: 1 }

/** 타격 효과 도형(모든 타격이 함께 쓴다 — 타격마다 새로 만들어 GPU에 올리지 않게) */
let impactGeo: { ring: THREE.RingGeometry; inner: THREE.RingGeometry; flash: THREE.SphereGeometry; shard: THREE.TetrahedronGeometry; shardBig: THREE.TetrahedronGeometry } | null = null
function impactGeometries(): NonNullable<typeof impactGeo> {
  if (!impactGeo) {
    impactGeo = { ring: new THREE.RingGeometry(0.25, 0.72, 32), inner: new THREE.RingGeometry(0.12, 0.3, 24), flash: new THREE.SphereGeometry(0.22, 12, 8), shard: new THREE.TetrahedronGeometry(0.08, 0), shardBig: new THREE.TetrahedronGeometry(0.12, 0) }
    markShared(...Object.values(impactGeo))
  }
  return impactGeo
}

export class Arena {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400)
  private readonly clock = new THREE.Timer()
  private readonly callbacks: ArenaCallbacks
  private readonly playerUnits: BattleUnit[] = []
  private readonly enemyUnits: BattleUnit[] = []
  private selectionRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null
  private commandMarker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null
  private battleActive = false
  private core: BattleCore | null = null
  private mode: BattleMode = 'normal'
  private moraleBonus = 0
  /** 다음 전투를 튜토리얼 난이도로 */
  private easyBattle = false
  private speed = 1
  private paused = false
  private winStreak = 0
  private startedAt = 0
  private selectedUnit = 0
  private lastCombatLog = 0
  private disposed = false
  private generals: General[] = []
  private enemyDeck: General[] = []
  private configuredEnemyDeck: General[] | null = null
  private enemyWarning: { name: string; general: string; until: number } | null = null
  private readonly logLines: string[] = []
  private readonly effects: ArenaEffect[] = []
  // 카메라: 아군 뒤 낮은 시점에서 적진·성채·노을 하늘까지 한눈에(최근 전쟁 게임식 구도)
  private readonly cameraBase = new THREE.Vector3(0, 7.4, 18.5)
  private readonly cameraLookAt = new THREE.Vector3(0, 2.4, -9)
  private cameraShake = 0
  private cameraIntro = 0
  private cameraVictory = 0
  private readonly quality: SceneQuality
  private readonly environment: Environment
  private composer: EffectComposer | null = null
  private research: BattleResearch | null = null
  /** 효과 줄이기: 설정 '줄임', 또는 '자동'인데 낮은 품질이거나 화면이 버벅일 때 */
  private reducedFx = false
  private fpsLow = false
  private fpsFrames = 0
  private fpsTime = 0
  /** 연출용 시간 흐름: 스킬 기 모으기 슬로모션 · 강타 순간 멈춤(실제 초) */
  private slowMo = 0
  private gallopSum = 0
  private gallopPan = 0
  private gallopPeak = 0
  private gallopUntil = 0
  private hitStop = 0
  /** 최근 히트스톱 사용량(초): 1초에 0.15초씩 줄어든다. 0.2초를 넘으면 더 멈추지 않는다(고레벨에서 계속 멈춰 렉처럼 보이던 문제) */
  private hitStopSpent = 0
  /** 스킬 쓰는 무장에게 카메라를 당긴다 */
  private cameraFocus: { target: THREE.Vector3; age: number; life: number; strength: number; side: 'player' | 'enemy' } | null = null
  /** 공격 동작 직후의 피해: 칼이 닿거나 화살이 꽂히는 순간에 맞춰 보여 준다 */
  private pendingStrike: { side: 'player' | 'enemy'; source: string; delay: number; weapon: WeaponSound } | null = null

  constructor(canvas: HTMLCanvasElement, callbacks: ArenaCallbacks) {
    this.callbacks = callbacks
    this.quality = detectSceneQuality()
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality === 'high', alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.environment = buildEnvironment(this.scene, this.quality)
    this.camera.position.copy(this.cameraBase)
    this.camera.lookAt(this.cameraLookAt)
    if (this.quality === 'high') {
      this.composer = new EffectComposer(this.renderer)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.45, 0.82))
      this.composer.addPass(new OutputPass())
      this.composer.addPass(new ShaderPass(GradeShader))
    }
    window.addEventListener('resize', this.resize)
    this.resize()
    this.applyEffectsSetting()
    this.animate()
  }

  private troopCapacity(general: General): number {
    return coreTroopCapacity(general)
  }

  /** 무장의 무기 소리 종류: 궁병 = 화살, 책사 = 기탄, 찌르는 무장(보병 · 창) = 창, 그 밖에 = 칼 */
  private weaponOf(unit: BattleUnit): WeaponSound {
    const ranged = this.isRanged(unit.general)
    if (ranged === 'arrow') return 'arrow'
    if (ranged) return 'magic'
    const kind = unit.hero?.kind
    if (kind === 'thrust') return 'spear'
    if (kind === 'slash') return 'sword'
    return unit.general.role === '보병' ? 'spear' : 'sword'
  }

  private lanePanOf(unit: BattleUnit): number { return THREE.MathUtils.clamp(unit.group.position.x / 8, -0.8, 0.8) }

  private troopType(general: General): TroopType {
    if (general.role === '기병') return 'cavalry'
    if (general.role === '궁병') return 'archer'
    return 'spearmen'
  }

  private commanderArchetype(general: General): CommanderArchetype {
    if (general.role === '책사') return '책사형'
    if (general.role === '궁병') return '지원형'
    return '무장형'
  }

  setGenerals(generals: General[]): void {
    this.generals = generals.map(general => ({ ...general }))
    this.clearUnits()
    const gap = this.laneGap()
    const positions = [new THREE.Vector3(-gap, 0, 6), new THREE.Vector3(0, 0, 7.4), new THREE.Vector3(gap, 0, 6)]
    this.generals.forEach((general, index) => {
      const built = this.createUnit(general, jade, positions[index] ?? positions[0])
      const group = built.group
      const maxTroops = this.troopCapacity(general)
      const status = this.createTroopStatus(jade, general)
      group.add(status.group)
      const unit: BattleUnit = { group, squad: built.squad.group, model: built.rig.root, general, target: positions[index] ?? positions[0].clone(), troops: maxTroops, maxTroops, attackTimer: 0.45 + index * 0.16, statusGroup: status.group, statusFill: status.fill, hitFlash: 0, motionPhase: index * 0.8, motionPulse: 0.4 + index * 0.25, troopType: this.troopType(general), attackMotion: 0, rig: built.rig, squadCtl: built.squad, skillPulse: 0, hero: null, mounted: false, ...this.motionFields(built.actor) }
      this.attachRealModels(unit)
      this.playerUnits.push(unit)
      this.scene.add(group)
    })
    this.selectUnit(0)
  }

  /** 미리 정한 적 덱과 전투 종류. null이면 일반 전투(적은 아군 레벨에 맞춰 뽑는다). */
  setOpponentDeck(generals: General[] | null, mode: BattleMode = generals?.length ? 'duel' : 'normal'): void {
    this.configuredEnemyDeck = generals?.slice(0, 3).map(general => ({ ...general })) ?? null
    this.mode = this.configuredEnemyDeck?.length ? mode : 'normal'
    this.moraleBonus = 0
    this.easyBattle = false
  }

  /** 튜토리얼 전투(덱을 정한 뒤에 켠다) */
  setEasyBattle(on: boolean): void { this.easyBattle = on }
  setSiegeDeck(generals: General[] | null, moraleBonus = 0): void {
    this.configuredEnemyDeck = generals?.slice(0, 3).map(general => ({ ...general })) ?? null
    this.mode = 'siege'
    this.moraleBonus = moraleBonus
  }
  isDuelBattle(): boolean {
    return this.mode === 'duel'
  }
  battleMode(): BattleMode {
    return this.mode
  }

  /** 기술 연구(강병·지략) 보정: 다음 전투부터 적용 */
  /**
   * 측면 지원: 한쪽 부대가 무너지면 그 레인의 상대 부대가 가장 가까운 살아 있는 적 레인 쪽으로 옮겨 가 협공한다.
   * (전투 계산은 이미 살아 있는 적을 노리므로 화면만 맞춘다)
   */
  private laneSupport(fallenSide: 'player' | 'enemy', lane: number): void {
    const movers = fallenSide === 'enemy' ? this.playerUnits : this.enemyUnits
    const foes = fallenSide === 'enemy' ? this.enemyUnits : this.playerUnits
    const mover = movers[lane]
    if (!mover || mover.troops <= 0) return
    const alive = foes.map((unit, index) => ({ unit, index })).filter(entry => entry.index !== lane && entry.unit.troops > 0 && entry.unit.dying <= 0)
    if (!alive.length) return
    alive.sort((a, b) => Math.abs(a.index - lane) - Math.abs(b.index - lane))
    const goal = alive[0].unit
    mover.target.x = THREE.MathUtils.lerp(mover.target.x, goal.target.x, 0.55)
    mover.target.z += fallenSide === 'enemy' ? -0.6 : 0.6
    this.keepLineGap()
    if (fallenSide === 'enemy') this.floatText(mover.group.position.clone().add(new THREE.Vector3(0, 3.4, 0)), '측면 지원!', '#ffd27a', 0.9)
  }

  /** 같은 레인의 아군·적 부대가 서로 파고들지 않도록 최소 간격을 지킨다 */
  private keepLineGap(): void {
    this.playerUnits.forEach((unit, lane) => {
      const foe = this.enemyUnits[lane]
      if (!foe) return
      const gap = unit.target.z - foe.target.z
      if (gap >= MIN_LINE_GAP) return
      const push = (MIN_LINE_GAP - gap) / 2
      unit.target.z += push
      foe.target.z -= push
    })
  }

  /** 결과 화면용: 같은 레인 적장과의 병종 상성 유리·불리 레인 수 */
  matchupSummary(): { adv: number; dis: number } {
    let adv = 0, dis = 0
    this.generals.forEach((general, lane) => {
      const foe = this.enemyDeck[lane]
      if (!foe) return
      const value = matchup(general.role, foe.role)
      if (value > 1) adv += 1
      else if (value < 1) dis += 1
    })
    return { adv, dis }
  }

  /** 전투 효과 설정을 다시 읽는다(계정 관리에서 바꾸면 바로 적용) */
  applyEffectsSetting(): void {
    const setting = effectsSetting()
    this.reducedFx = setting === 'reduced' || (setting === 'auto' && (this.quality === 'low' || this.fpsLow))
  }

  /** 전투 중 3초 평균 프레임이 28 아래면 효과를 줄이고 화면 해상도를 낮춘다(자동 설정일 때) */
  private watchFrameRate(realDelta: number): void {
    if (this.fpsLow || !this.battleActive || this.paused) { this.fpsFrames = 0; this.fpsTime = 0; return }
    this.fpsFrames += 1
    this.fpsTime += realDelta
    if (this.fpsTime < 3) return
    const fps = this.fpsFrames / this.fpsTime
    this.fpsFrames = 0
    this.fpsTime = 0
    if (fps >= 28) return
    this.fpsLow = true
    this.applyEffectsSetting()
    if (effectsSetting() === 'auto') {
      this.renderer.setPixelRatio(1)
      this.resize()
    }
  }

  setResearch(research: BattleResearch | null): void {
    this.research = research
  }

  setSpeed(speed: number): void {
    this.speed = speed >= 2 ? 2 : 1
  }

  /** 일시 정지: 전투 시간·적 행동·스킬 쿨다운이 모두 멈춘다. 정지 중에는 명령을 받지 않는다. */
  setPaused(on: boolean): void {
    this.paused = Boolean(on) && this.battleActive
    sound.setPausedDuck(this.paused)
  }

  setAutoPlay(on: boolean): void {
    if (this.core) this.core.autoPilot = on ? { ...PLAYER_AUTO_PILOT } : null
  }

  /** 대련 스킬 자동(기본 켬, 기기에 기억) */
  private duelAutoSkill = (() => { try { return window.localStorage.getItem('cheonharo.duelAutoSkill') !== '0' } catch { return true } })()

  setAutoSkill(on: boolean): void {
    this.duelAutoSkill = on
    try { window.localStorage.setItem('cheonharo.duelAutoSkill', on ? '1' : '0') } catch { /* 무시 */ }
    if (this.core) this.core.autoSkill = on && this.mode === 'duel'
  }

  stopBattle(): void {
    this.battleActive = false
    sound.setPausedDuck(false)
    // 승리·패배 곡이 울리는 중이면(곡 없음) 끝나고 본영 곡으로 돌아가게 둔다
    if (sound.currentTheme !== 'none') sound.setTheme('home')
    this.paused = false
    this.core = null
    this.enemyUnits.splice(0).forEach(unit => this.removeUnit(unit))
    this.enemyDeck = []
    this.configuredEnemyDeck = null
    this.mode = 'normal'
    this.moraleBonus = 0
    this.enemyWarning = null
  }

  private createUnit(general: General, teamColor: number, position: THREE.Vector3): { group: THREE.Group; rig: GeneralRig; squad: Squad; actor: THREE.Group } {
    const team = teamColor === ember ? 'enemy' : 'player'
    const group = new THREE.Group()
    group.position.copy(position)
    group.userData.baseY = 0
    const rig = createGeneralModel(general, team)
    const squad = createSquad(general.role, team, this.quality)
    group.userData.model = rig.root
    const actor = new THREE.Group()
    actor.add(rig.root)
    group.add(squad.group, actor)
    // 발밑 진영 고리(아군 청록 · 적 붉은색)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.98, 40), new THREE.MeshBasicMaterial({ color: team === 'enemy' ? 0xff5a3c : 0x5ae0c0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.03
    group.add(ring)
    return { group, rig, squad, actor }
  }

  /** 실사 모델을 불러와 도형 모델·병사와 바꾼다(불러오기 전에는 도형 모델로 바로 싸울 수 있다) */
  private attachRealModels(unit: BattleUnit): void {
    // 선두 무장은 모두 말을 탄다(보병 무장은 말 위에서 찌르고, 궁병 무장은 말 위에서 활을 쏜다)
    const look = heroLook(unit.general)
    const name = look.model
    unit.mounted = true
    // 뼈대가 심어진 모델이면 실제 뼈 애니메이션으로, 예전 모델이면 구운 자세(모프)로 움직인다
    void loadModel(name).then(async (gltf): Promise<AnimatedHero | SkeletalHero> => rigInfo(gltf) ? new SkeletalHero(gltf, { weapon: look.weapon, kind: look.kind }) : new AnimatedHero(await heroStrikeModel(unit.general))).then(hero => {
      if (unit.hero || !unit.group.parent && !this.playerUnits.includes(unit)) return
      hero.root.rotation.y = Math.PI // 모델은 +Z를 본다 → 부대 앞(-Z)으로
      hero.root.scale.setScalar(1.18) // 무장은 병사보다 한눈에 띄게 조금 크게
      unit.actor.add(hero.root)
      unit.rig.root.visible = false
      unit.hero = hero
      // 천명(5등급) 무장: 선두에서 천명만의 금빛 인장 · 불티 · 깃발을 두른다
      if (hero instanceof SkeletalHero) {
        // 천명(5등급) 무장: 무장마다의 의상 · 망토 · 장식 · 기운 색 · 이름 깃발
        if (look.tianming) hero.enableTianming(look.tianming)
        if (look.skin) void loadSkin(look.skin).then(texture => hero.setSkin(texture)).catch(() => {})
      }
    }).catch(() => { /* 모델이 없으면 도형 모델 유지 */ })
    const troop = troopModelFor(unit.general.role)
    void loadTroopModel(troop).then(gltf => {
      const baked = bakeSquadModel(gltf)
      if (baked) { unit.squadCtl.upgrade(baked.geometry, baked.materials, baked.duration, STRIKE_FRAMES, baked.times, baked.walkFrames, baked.walkPeriod); return }
      return strikeModelFor(troop).then(model => unit.squadCtl.upgrade(model.geometry, model.materials, model.duration, STRIKE_FRAMES, model.times))
    }).catch(() => {})
  }

  /** 부대를 장면에서 빼고, 그 부대만 쓰던 도형 · 텍스처를 GPU에서 내린다(전투를 거듭해도 메모리가 쌓이지 않게) */
  private removeUnit(unit: BattleUnit): void {
    this.scene.remove(unit.group)
    disposeOwned(unit.group)
  }

  private clearUnits(): void {
    this.playerUnits.splice(0).forEach(unit => this.removeUnit(unit))
    this.enemyUnits.splice(0).forEach(unit => this.removeUnit(unit))
    if (this.selectionRing) this.scene.remove(this.selectionRing)
    if (this.commandMarker) this.scene.remove(this.commandMarker)
    this.clearEffects()
    this.selectionRing = null
    this.commandMarker = null
  }

  private createTroopStatus(color: number, general?: General): { group: THREE.Group; fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> } {
    const group = new THREE.Group()
    group.position.set(0, 3.9, 0)
    group.renderOrder = 8
    // 병력 막대: 휴대폰에서도 보이게 두껍게, 진영 색을 또렷하게
    const background = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.24), new THREE.MeshBasicMaterial({ color: 0x120a06, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }))
    const fillGeometry = new THREE.PlaneGeometry(1.9, 0.16)
    fillGeometry.translate(0.95, 0, 0) // 왼쪽 끝을 기준으로 줄어들게
    const fill = new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false, depthWrite: false }))
    background.position.z = 0.02
    fill.position.set(-0.95, 0, 0.03)
    fill.scale.x = 1
    group.add(background, fill)
    // 이름표: 무장 이름 · 병종(항상 카메라를 본다)
    if (general) {
      const tag = this.makeTextSprite(`${general.name} · ${general.role}`, color === ember ? '#ffb39c' : '#bff3e4', 0.62)
      tag.position.set(0, 0.42, 0.04)
      tag.renderOrder = 9
      group.add(tag)
    }
    return { group, fill }
  }

  private createMarker(color: number): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> {
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.78, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, side: THREE.DoubleSide }))
    marker.rotation.x = -Math.PI / 2
    marker.position.y = 0.04
    return marker
  }

  private addEffect(effect: ArenaEffect): void {
    this.effects.push(effect)
    this.scene.add(effect.object)
  }

  private clearEffects(): void {
    this.effects.splice(0).forEach(effect => {
      this.scene.remove(effect.object)
      effect.dispose()
    })
    this.labelSlots.clear()
    this.liveLabels = 0
  }

  /** res: 글 그림 해상도 배율(타격 숫자처럼 작고 짧게 뜨는 글은 0.5로 — 타격마다 올리는 텍스처를 1/4로) */
  private makeTextSprite(rawText: string, color: string, scale = 2.2, res = 1): THREE.Sprite {
    const text = tr(rawText)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(512 * res)
    canvas.height = Math.round(160 * res)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context is unavailable')
    context.scale(res, res) // 아래 그리기는 512×160 기준
    context.font = '700 76px Pretendard, sans-serif'
    // 영어처럼 긴 글은 폭에 맞게 글자를 줄인다
    const width = context.measureText(text).width
    if (width > 480) context.font = `700 ${Math.max(36, Math.floor(76 * 480 / width))}px Pretendard, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.strokeStyle = 'rgba(4, 12, 14, .86)'
    context.lineWidth = 13
    context.strokeText(text, 256, 80)
    context.fillStyle = color
    context.shadowColor = color
    context.shadowBlur = 22 * res // 그림자 흐림은 변환 배율을 따르지 않는다
    context.fillText(text, 256, 80)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(scale * 2.7, scale, 1)
    return sprite
  }

  private spawnImpact(position: THREE.Vector3, damage: number, color = 0xf6c56d, showNumber = true, felt = damage): void {
    const group = new THREE.Group()
    const intensity = Math.min(1.65, 0.82 + felt / 180)
    const geo = impactGeometries()
    const ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
    const innerRing = new THREE.Mesh(geo.inner, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    innerRing.rotation.x = -Math.PI / 2
    const flash = new THREE.Mesh(geo.flash, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
    flash.position.y = 0.7
    const shards: THREE.Mesh[] = []
    // 조각 8개는 도형(모든 타격 공유)과 재질(이 타격 하나) 하나를 함께 쓴다: 타격마다 GPU에 새로 올리는 양을 줄인다
    const shardMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false })
    for (let index = 0; index < 8; index += 1) {
      const shard = new THREE.Mesh(index % 2 ? geo.shardBig : geo.shard, shardMaterial)
      const angle = (index / 8) * Math.PI * 2
      shard.position.set(Math.cos(angle) * 0.34, 0.42 + (index % 3) * 0.1, Math.sin(angle) * 0.34)
      shard.userData.velocity = new THREE.Vector3(Math.cos(angle) * (1.2 + (index % 3) * 0.18), 0.45 + (index % 2) * 0.25, Math.sin(angle) * (1.2 + (index % 3) * 0.18))
      group.add(shard)
      shards.push(shard)
    }
    group.add(ring, innerRing, flash)
    group.position.copy(position)
    // 숫자는 큰 타격·스킬에만(모든 타격에 띄우면 화면이 어지럽다)
    // 숫자 자리: 같은 곳에 글이 겹쳐 있으면 위로 올리고, 너무 많으면 이번 숫자는 생략한다
    const lift = showNumber ? this.labelSlot(position, true) : null
    const label = lift !== null ? this.makeTextSprite(`-${damage}`, color === 0x4cdfff ? '#8deaff' : '#ffe5a4', 1.15, 0.5) : null
    if (label) { label.position.set(0, 1.35 + (lift ?? 0), 0); group.add(label); this.liveLabels += 1 }
    this.addEffect({
      object: group,
      age: 0,
      life: 0.72,
      tick: (effect, delta) => {
        const progress = effect.age / effect.life
        ring.scale.setScalar(1 + progress * 2.2 * intensity)
        ring.material.opacity = 0.95 * (1 - progress)
        innerRing.scale.setScalar(1 + progress * 3.6 * intensity)
        innerRing.material.opacity = 0.9 * (1 - progress * 1.15)
        flash.scale.setScalar(1 + progress * 1.3 * intensity)
        flash.material.opacity = 0.55 * (1 - progress)
        shards.forEach(shard => {
          shard.position.addScaledVector(shard.userData.velocity as THREE.Vector3, delta)
          shard.rotation.x += delta * 8
          shard.rotation.y += delta * 11
        })
        shardMaterial.opacity = 0.92 * (1 - progress)
        if (label) { label.position.y = 1.35 + (lift ?? 0) + progress * 1.2; label.material.opacity = 1 - progress }
        group.rotation.y += delta * 3
      },
      dispose: () => {
        // 타격마다 만든 재질을 버린다(도형은 모든 타격이 함께 쓴다)
        ring.material.dispose(); innerRing.material.dispose(); flash.material.dispose(); shardMaterial.dispose()
        if (label) { this.liveLabels = Math.max(0, this.liveLabels - 1); label.material.map?.dispose(); label.material.dispose() }
      },
    })
  }

  private spawnDustCloud(position: THREE.Vector3, color: number): void {
    const group = new THREE.Group()
    const particles: THREE.Mesh[] = []
    for (let index = 0; index < 6; index += 1) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + (index % 3) * 0.04, 6, 5),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false }),
      )
      particle.position.set((index - 2.5) * 0.18, 0.08 + (index % 2) * 0.08, (index % 3) * 0.12)
      particle.userData.velocity = new THREE.Vector3((index - 2.5) * 0.12, 0.35 + (index % 3) * 0.08, 0.08 + (index % 2) * 0.12)
      group.add(particle)
      particles.push(particle)
    }
    group.position.copy(position)
    this.addEffect({
      object: group,
      age: 0,
      life: 0.9,
      tick: effect => {
        const progress = effect.age / effect.life
        particles.forEach(particle => {
          const velocity = particle.userData.velocity as THREE.Vector3
          particle.position.addScaledVector(velocity, 0.025)
          particle.scale.setScalar(1 + progress * 2.5)
          ;(particle.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - progress)
        })
      },
      dispose: () => group.traverse(node => {
        const mesh = node as THREE.Mesh
        mesh.geometry?.dispose()
        const material = mesh.material
        if (material && !Array.isArray(material)) material.dispose()
      }),
    })
  }

  private skillColor(general: General): number {
    if (general.id === 'zhou-yu' || general.role === '궁병') return 0xff8a4c
    if (general.id === 'zhuge-liang' || general.role === '책사') return 0x72c9ff
    if (general.id === 'lu-bu') return 0xff4f68
    if (general.id === 'zhao-yun') return 0xf6c56d
    return 0x4cdfff
  }

  private updateEffects(delta: number): void {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index]
      effect.age += delta
      effect.tick(effect, delta)
      if (effect.age >= effect.life) {
        this.scene.remove(effect.object)
        effect.dispose()
        this.effects.splice(index, 1)
      }
    }
  }

  selectUnit(index: number): void {
    this.selectedUnit = Math.max(0, Math.min(index, Math.max(this.playerUnits.length - 1, 0)))
    const unit = this.playerUnits[this.selectedUnit]
    if (!unit) return
    if (!this.selectionRing) {
      this.selectionRing = this.createMarker(jade)
      this.scene.add(this.selectionRing)
    }
    this.selectionRing.position.x = unit.group.position.x
    this.selectionRing.position.z = unit.group.position.z
  }

  /** 일반 전투 적 덱: 아군 평균 레벨(+연승 보정)에 맞추고 아군 최고 등급을 넘지 않는다. */
  private normalEnemyDeck(): General[] {
    const playerIds = new Set(this.generals.map(general => general.id))
    const count = Math.max(1, this.generals.length)
    const level = Math.max(1, Math.round(this.generals.reduce((sum, general) => sum + general.level, 0) / count) + Math.min(5, this.winStreak))
    const stars = Math.max(1, Math.round(this.generals.reduce((sum, general) => sum + general.stars, 0) / count))
    const topGrade = Math.max(1, ...this.generals.map(general => general.grade))
    const pool = allGenerals().filter(general => !playerIds.has(general.id) && general.grade <= topGrade).sort(() => Math.random() - 0.5)
    const chosen: General[] = []
    for (const general of pool) {
      if (chosen.length === 3) break
      if (chosen.filter(item => item.role === general.role).length >= 2) continue
      chosen.push(general)
    }
    // 적도 전열 규칙대로(수호형·단단한 무장이 가운데)
    return frontLineOrder(chosen).map(general => scaleGeneral({ ...general, level: 1, stars: 1 }, level, stars))
  }

  startBattle(options: { autoPlay?: boolean } = {}): void {
    const deck = this.configuredEnemyDeck?.length ? this.configuredEnemyDeck.map(general => ({ ...general })) : this.normalEnemyDeck()
    this.enemyDeck = deck
    this.enemyUnits.splice(0).forEach(unit => this.removeUnit(unit))
    this.core = new BattleCore(this.generals, deck, { mode: this.mode, moraleBonus: this.moraleBonus, research: this.research, easy: this.easyBattle, autoSkill: this.mode === 'duel' && this.duelAutoSkill, autoPilot: options.autoPlay ? { ...PLAYER_AUTO_PILOT } : null })
    this.battleActive = true
    this.paused = false
    this.startedAt = performance.now()
    // 배경음악: 대련·레이드·그 밖의 전투. 레이드 2·3군은 같은 곡을 이어 간다
    sound.setIntensity(0)
    sound.setPausedDuck(false)
    sound.setTheme(this.mode === 'duel' ? 'duel' : this.mode === 'raid' ? 'raid' : 'battle')
    sound.play('battleStart')
    this.gallopUntil = this.clock.getElapsed() + 3 // 말발굽 소리는 전투 처음 3초만
    this.lastCombatLog = 0
    this.enemyWarning = null
    this.logLines.splice(0)
    this.cameraIntro = 1.35
    this.cameraVictory = 0
    this.cameraShake = 0.12
    deck.forEach((general, index) => {
      const position = new THREE.Vector3((index - 1) * this.laneGap(), 0, -8 - index * 0.9)
      const built = this.createUnit(general, ember, position)
      const group = built.group
      group.rotation.y = Math.PI
      const maxTroops = this.core!.enemies[index]?.maxTroops ?? this.troopCapacity(general)
      const status = this.createTroopStatus(ember, general)
      status.group.rotation.y = Math.PI // 적 부대는 반대로 돌아 있으므로 막대가 카메라를 보게 되돌린다
      group.add(status.group)
      this.enemyUnits.push({ group, squad: built.squad.group, model: built.rig.root, general, target: position.clone(), troops: maxTroops, maxTroops, attackTimer: 0, statusGroup: status.group, statusFill: status.fill, hitFlash: 0, motionPhase: index * 0.8 + 1.4, motionPulse: 0.7 + index * 0.25, troopType: this.troopType(general), attackMotion: 0, rig: built.rig, squadCtl: built.squad, skillPulse: 0, hero: null, mounted: false, ...this.motionFields(built.actor) })
      this.attachRealModels(this.enemyUnits[this.enemyUnits.length - 1])
      this.scene.add(group)
    })
    this.playerUnits.forEach((unit, index) => {
      const coreUnit = this.core!.players[index]
      unit.maxTroops = coreUnit?.maxTroops ?? unit.maxTroops
      unit.troops = coreUnit?.troops ?? unit.troops
      unit.group.visible = true
      unit.dying = 0
      unit.fallDust = false
      unit.motion = null
      unit.glow = 0
      unit.vel.set(0, 0, 0)
      unit.hit.x = 0; unit.hit.v = 0
      unit.actor.rotation.z = 0
      unit.squad.position.y = 0
      unit.hero?.setFade(0); if (unit.hero instanceof SkeletalHero) unit.hero.revive()
      unit.statusFill.scale.x = 1
      unit.target.set((index - 1) * this.laneGap(), 0, PLAYER_LINE_Z - index * 0.15)
    })
    this.enemyUnits.forEach((unit, index) => unit.target.set((index - 1) * this.laneGap(), 0, ENEMY_LINE_Z - index * 0.15))
    this.playerUnits.forEach((unit, index) => this.spawnDustCloud(unit.group.position.clone().add(new THREE.Vector3(0, 0, 0.7)), index % 2 ? 0xa4a08a : 0xb68f70))
    this.enemyUnits.forEach((unit, index) => this.spawnDustCloud(unit.group.position.clone().add(new THREE.Vector3(0, 0, -0.7)), index % 2 ? 0xa4a08a : 0xb68f70))
    this.drainCore()
  }

  /** 무장 버튼(탭): 그 무장의 레인으로 기동해 적 예고에 대응한다. */
  commandMove(index: number): void {
    if (!this.battleActive || !this.core || this.paused) return
    this.selectUnit(index)
    sound.play('move', { pan: this.lanePan(index) })
    const unit = this.playerUnits[index]
    if (unit && unit.troops > 0) {
      const target = new THREE.Vector3(-5 + index * 5, 0, -1 - index * 1.2)
      // 기동해도 적 부대에 파고들지 않게 맞붙는 선 앞에서 멈춘다
      const foe = this.enemyUnits[index]
      if (foe) target.z = Math.max(target.z, foe.target.z + MIN_LINE_GAP)
      unit.target.copy(target)
      if (!this.commandMarker) {
        this.commandMarker = this.createMarker(0xf6c56d)
        this.scene.add(this.commandMarker)
      }
      this.commandMarker.position.set(target.x, 0.05, target.z)
    }
    this.core.command(index)
    this.drainCore()
  }

  useTactic(tactic: BattleTactic): void {
    if (!this.battleActive || !this.core || this.paused) return
    this.core.useTactic(tactic)
    sound.play('tactic')
    this.drainCore()
  }

  /** 무장 버튼(길게)·스킬 버튼: 그 무장의 스킬. index가 없으면 선택한 무장. */
  castSkill(index = this.selectedUnit): void {
    if (!this.battleActive || !this.core || this.paused) return
    this.selectUnit(index)
    this.core.castSkill(index)
    this.drainCore()
  }

  private unitAt(side: 'player' | 'enemy', lane: number): BattleUnit | undefined {
    return (side === 'player' ? this.playerUnits : this.enemyUnits)[lane]
  }

  private pushLog(text: string): void {
    this.logLines.push(text)
    if (this.logLines.length > 12) this.logLines.shift()
  }

  private drainCore(): void {
    const core = this.core
    if (!core) return
    for (const event of core.drainEvents()) this.handleCoreEvent(event, core)
    this.pendingStrike = null
    this.syncTroops()
  }

  /** 자리(0·1·2)에 따라 소리를 좌우로 */
  private lanePan(lane: number): number { return Math.max(-0.6, Math.min(0.6, (lane - 1) * 0.45)) }

  private handleCoreEvent(event: CoreEvent, core: BattleCore): void {
    switch (event.kind) {
      case 'log':
        this.pushLog(event.text)
        this.callbacks.onEvent(event.text)
        break
      case 'hit': {
        const unit = this.unitAt(event.side, event.lane)
        if (!unit) break
        // 맞는 소리: 때린 무기(칼 · 창 · 화살 · 기탄)에 따라 다르게, 실제로 닿는 순간에
        const big = event.amount / Math.max(1, unit.maxTroops / HIT_FX_TROOPS) >= 150
        const strike = this.pendingStrike
        const attacker = [...this.playerUnits, ...this.enemyUnits].find(other => other.general.name === event.source && other !== unit)
        const weapon = strike && strike.source === event.source ? strike.weapon : attacker ? this.weaponOf(attacker) : null
        const hitSound = () => { if (weapon) sound.weapon(weapon, 'hit', { pan: this.lanePan(event.lane), big }); else sound.play(big ? 'hitBig' : 'hit', { pan: this.lanePan(event.lane) }) }
        if (strike && strike.source === event.source && strike.side !== event.side) {
          this.pendingStrike = null
          this.addEffect(delayed(strike.delay, () => { hitSound(); this.showHit(unit, event.side, event.amount, event.edge) }))
        } else { hitSound(); this.showHit(unit, event.side, event.amount, event.edge) }
        if (core.t - this.lastCombatLog > 1.6) {
          this.lastCombatLog = core.t
          this.callbacks.onEvent(`${event.source} · ${unit.general.name} 병력 −${Math.round(event.amount)}`)
        }
        break
      }
      case 'attack': { const unit = this.unitAt(event.side, event.lane); if (unit) { this.playAttack(unit, event.side, event.target) } break }
      case 'heal': { const unit = this.unitAt(event.side, event.lane); if (unit && event.amount >= 60) sound.play('heal', { pan: this.lanePan(event.lane) }); if (unit && event.amount >= 60) this.floatText(unit.group.position.clone().add(new THREE.Vector3(0, 2.6, 0)), `+${Math.round(event.amount)}`, '#8fe3b0', 0.8); break }
      case 'skill': {
        const unit = this.unitAt(event.side, event.lane)
        if (!unit) break
        sound.skill(event.type, event.side, this.lanePan(event.lane), this.skillVoice(unit, event.type, event.side))
        this.callbacks.onSkillCast?.({ side: event.side, id: unit.general.id, name: unit.general.name, skill: event.name, portraitPath: unit.general.portraitPath })
        this.playSkill(unit, event.side, event.type, event.name, event.morale, event.target)
        if (event.side === 'enemy') this.enemyWarning = null
        break
      }
      case 'enemySkillWarn': {
        sound.play('enemyWarn')
        const unit = this.unitAt('enemy', event.lane)
        // 예고된 적장 발밑에 붉은 경고 원(예고 시간 동안)
        if (unit) this.fx(groundCircle(unit.group.position, 0xff3b2a, 3.2, BATTLE_RULES.enemySkillWarning + (core.research.enemyWarn ?? 0) + 0.3, -2.2))
        this.enemyWarning = { name: event.name, general: unit?.general.name ?? '적장', until: core.t + BATTLE_RULES.enemySkillWarning + (core.research.enemyWarn ?? 0) + 0.2 }
        break
      }
      case 'pattern':
        sound.play('pattern')
        break
      case 'answer':
        sound.play(event.success ? 'answerGood' : 'answerBad')
        if (event.success) {
          const enemy = this.unitAt('enemy', Math.max(0, event.lane))
          this.spawnImpact((enemy?.group.position ?? new THREE.Vector3(0, 0, -6)).clone(), 12, jade)
        }
        break
      case 'phase': {
        sound.setIntensity(event.phase)
        sound.play('phase')
        const closing = event.phase === 1 ? 0.8 : 1.35
        this.playerUnits.forEach((unit, index) => { unit.target.z -= closing + index * 0.08 })
        this.enemyUnits.forEach((unit, index) => { unit.target.z += closing + index * 0.08 })
        this.keepLineGap()
        this.spawnDustCloud(new THREE.Vector3(0, 0, -3.9), 0xb9a17c)
        this.cameraShake = Math.min(0.48, this.cameraShake + 0.1)
        break
      }
      case 'counter': {
        sound.play('counter', { pan: this.lanePan(event.lane) })
        const foe = this.unitAt('enemy', event.lane)
        if (foe) {
          const at = foe.group.position.clone()
          this.floatText(at.clone().add(new THREE.Vector3(0, 3.4, 0)), '차단!', '#9ff5e2', 1.3)
          this.fx(shockwave(at, 0x9ff5e2, 3, 0.6))
          this.addHitStop(0.08)
          this.kick(foe, 1)
          if (foe.hero instanceof SkeletalHero) foe.hero.flinch(1)
          foe.shake = 0.12
        }
        break
      }
      case 'timeWarn':
        sound.play('timeWarn')
        this.floatText(new THREE.Vector3(0, 5.2, -4), `남은 ${event.left}초!`, '#ff8a6a', 1.5)
        this.cameraShake = Math.min(0.4, this.cameraShake + 0.1)
        break
      case 'collapse':
        sound.play('collapse')
        this.cameraShake = Math.min(0.7, this.cameraShake + 0.35)
        break
      case 'unitDown': {
        sound.play('unitDown', { pan: this.lanePan(event.lane) })
        const unit = this.unitAt(event.side, event.lane)
        if (unit) { unit.dying = 1; unit.fallDust = false; unit.motion = null; this.addEffect(shockwave(unit.group.position.clone(), 0xb9a17c, 2.2, 0.7)) }
        if (unit) this.laneSupport(event.side, event.lane)
        break
      }
      case 'end': {
        this.battleActive = false
        this.enemyWarning = null
        this.cameraVictory = event.result.won ? 1.5 : 0
        this.cameraShake = event.result.won ? 0.22 : 0.1
        this.playOutcome(event.result.won)
        if (this.mode === 'raid') { sound.play('raidSquad'); sound.setThemeAfter('home', 9000) } else sound.play(event.result.won ? 'victory' : 'defeat')
        if (this.mode === 'normal') this.winStreak = event.result.won ? this.winStreak + 1 : Math.max(-2, Math.min(0, this.winStreak) - 2)
        // 랭킹 서버는 실제 경과 시간보다 긴 기록을 거절한다: 배속과 무관하게 실제 시간을 보낸다.
        this.callbacks.onBattleEnd({ ...event.result, durationMs: Math.round(performance.now() - this.startedAt), mode: this.mode })
        break
      }
      default:
        break
    }
  }

  private motionFields(actor: THREE.Group): Pick<BattleUnit, 'actor' | 'motion' | 'pose' | 'glow' | 'glowColor' | 'dying' | 'strikeAge' | 'hit' | 'vel' | 'gait' | 'lean' | 'shake' | 'dashGait' | 'prevPz' | 'hoofPhase' | 'blend' | 'fallDust' | 'aim' | 'aimTo' | 'aimHold'> {
    return {
      actor, motion: null, pose: { z: 0, y: 0, tilt: 0, twist: 0, scale: 1 }, glow: 0, glowColor: new THREE.Color(1, 1, 1), dying: 0, strikeAge: -1,
      hit: { x: 0, v: 0 }, vel: new THREE.Vector3(), gait: 0, lean: { x: 0, z: 0 }, shake: 0, dashGait: 0, prevPz: 0, hoofPhase: Math.random(), fallDust: false, aim: 0, aimTo: 0, aimHold: 0,
      blend: { off: [0, 0, 0, 0, 0], vel: [0, 0, 0, 0, 0], prev: [0, 0, 0, 0, 1], prevVel: [0, 0, 0, 0, 0], motion: null },
    }
  }

  /** 맞은 순간: 바로 조금 밀리고(즉각 반응) 속도를 받아 더 밀렸다가 되튕긴다 */
  private kick(unit: BattleUnit, amount: number): void {
    // 짧게 밀리는 힘(속도)만 준다: 여러 번 맞아도 쌓여 흔들리지 않게 상한을 둔다
    unit.hit.v = Math.min(14, Math.max(unit.hit.v, 0) + amount * 14)
  }

  private readonly edgeShownAt = new WeakMap<BattleUnit, number>()
  /** 떠오르는 글 자리: 같은 곳(레인)에 0.7초 안에 또 뜨면 위로 한 칸씩 올린다. 이미 두 칸 찼으면 숫자는 건너뛴다 */
  private readonly labelSlots = new Map<number, { at: number; n: number }>()
  private liveLabels = 0
  private labelSlot(position: THREE.Vector3, optional: boolean): number | null {
    const key = Math.round(position.x / 2.5) * 100 + Math.round(position.z / 4)
    const now = this.clock.getElapsed()
    const slot = this.labelSlots.get(key)
    const n = slot && now - slot.at < 0.7 ? slot.n + 1 : 0
    if (optional && (n >= 2 || this.liveLabels >= 6)) return null
    this.labelSlots.set(key, { at: now, n: Math.min(n, 3) })
    return Math.min(n, 3) * 0.55
  }

  /** 머리 위로 떠오르다 사라지는 글자 */
  private floatText(position: THREE.Vector3, text: string, color: string, scale = 1): void {
    const lift = this.labelSlot(position, false) ?? 0
    const sprite = this.makeTextSprite(text, color, scale)
    sprite.position.copy(position)
    this.liveLabels += 1
    this.addEffect({
      object: sprite, age: 0, life: 1.2,
      tick: effect => {
        const k = effect.age / effect.life
        sprite.position.y = position.y + lift + k * 0.8
        sprite.material.opacity = k < 0.15 ? k / 0.15 : 1 - Math.max(0, k - 0.6) / 0.4
      },
      dispose: () => { this.liveLabels = Math.max(0, this.liveLabels - 1); sprite.material.map?.dispose(); sprite.material.dispose() },
    })
  }

  private fx(effect: Fx): void {
    this.addEffect(effect)
  }

  /** 동작 시간(배속 반영) → 효과 시간 */
  private scaled(seconds: number): number {
    return seconds / Math.max(0.25, this.speed)
  }

  /** 동작 시간표에 맞춰 나중에 실행(배속 반영) */
  private later(seconds: number, run: () => void): Fx {
    return delayed(this.scaled(seconds), run)
  }

  /** 무장이 바라보는 앞쪽 지점(월드) */
  private frontOf(unit: BattleUnit, distance: number, height = 1.2): THREE.Vector3 {
    const forward = unit.group.rotation.y === 0 ? -1 : 1
    return unit.group.position.clone().add(new THREE.Vector3(0, height, forward * distance))
  }

  /** 상대 쪽으로 몸을 돌릴 각도(무장 자신의 앞 기준, 라디안) */
  private aimToward(unit: BattleUnit, target: BattleUnit): number {
    const d = target.group.position.clone().sub(unit.group.position)
    const yaw = unit.group.rotation.y === 0 ? Math.atan2(-d.x, -d.z) : Math.atan2(d.x, d.z)
    return THREE.MathUtils.clamp(yaw, -0.9, 0.9)
  }

  /** 내 앞에서 상대 쪽으로 distance만큼 나간 지점 */
  private towardOf(unit: BattleUnit, target: BattleUnit | null | undefined, distance: number, height = 1.2): THREE.Vector3 {
    if (!target) return this.frontOf(unit, distance, height)
    const dir = target.group.position.clone().sub(unit.group.position).setY(0)
    if (dir.lengthSq() < 1e-4) return this.frontOf(unit, distance, height)
    return unit.group.position.clone().add(dir.normalize().multiplyScalar(distance)).setY(unit.group.position.y + height)
  }

  private facing(unit: BattleUnit): number {
    return unit.group.rotation.y === 0 ? Math.PI : 0
  }

  private isRanged(general: General): 'arrow' | 'orb' | null {
    if (general.role === '궁병') return 'arrow'
    if (general.role === '책사') return 'orb'
    return null
  }

  /** 강타 순간 멈춤. 최근에 많이 멈췄으면 건너뛴다 */
  private addHitStop(sec: number): void {
    if (this.hitStopSpent >= 0.2) return
    this.hitStop = Math.max(this.hitStop, sec)
    this.hitStopSpent += sec
  }

  /** 피격 표시: 번쩍임 · 밀려남 · 숫자 · 흔들림 */
  private showHit(unit: BattleUnit, side: 'player' | 'enemy', amount: number, edge?: 'adv' | 'dis'): void {
    if (unit.dying > 0 && unit.troops <= 0) return
    // 병종 상성: 유리하면 "상성 우위"가 뜨고 더 세게 흔들린다(같은 무장 위에는 3.5초에 한 번)
    if (edge === 'adv' && this.clock.getElapsed() - (this.edgeShownAt.get(unit) ?? -99) > 6) {
      this.edgeShownAt.set(unit, this.clock.getElapsed())
      this.floatText(unit.group.position.clone().add(new THREE.Vector3(0, 3.1, 0)), edge === 'adv' ? '상성 우위!' : '상성 열세', edge === 'adv' ? '#ffd27a' : '#b9c2c9', edge === 'adv' ? 1.05 : 0.8)
      if (edge === 'adv') { this.cameraShake = Math.min(0.62, this.cameraShake + 0.08); if (side === 'enemy') this.kick(unit, 0.25) }
    }
    // 연출 기준은 Lv20 무렵 병력(약 6,600)에 맞춘 값이다. 병력이 많은 고레벨은 피해를 병력 비율로 줄여 같은 기준을 쓴다(낮은 레벨은 그대로)
    const felt = amount / Math.max(1, unit.maxTroops / HIT_FX_TROOPS)
    unit.hitFlash = 0.18
    // 피격 모션은 적군만: 무장이 움찔하며 뒤로 밀리고 말이 머리를 쳐들며, 뒤의 병사들도 휘청인다(아군은 자세를 흐트러뜨리지 않는다)
    if (side === 'enemy') {
      this.kick(unit, Math.min(0.72, 0.22 + felt / 300))
      // 밀려남은 속도로 준다(이동 스프링이 받아 부드럽게 멈춘다)
      unit.vel.add(new THREE.Vector3(unit.group.position.x > 0 ? 0.6 : -0.6, 0, -1.8))
      if (unit.hero instanceof SkeletalHero) unit.hero.flinch(Math.min(1, felt / 180))
    }
    this.cameraShake = Math.min(0.62, this.cameraShake + (felt >= 160 ? 0.14 : 0.03))
    // 히트스톱은 피해에 비례(격투 게임의 히트랙처럼): 약한 타격은 멈추지 않고, 강타일수록 길게. 멈춘 동안 맞은 쪽이 떨린다
    const stop = felt >= 160 ? Math.min(0.11, 0.05 + (felt - 160) / 3000) : felt >= 110 ? 0.03 : 0
    if (stop > 0) { this.addHitStop(stop); if (side === 'enemy') unit.shake = Math.max(unit.shake, stop + 0.05) }
    if (!this.reducedFx) this.fx(hitSpark(unit.group.position.clone().add(new THREE.Vector3(0, 1.1, side === 'enemy' ? 0.6 : -0.6)), side === 'enemy' ? 0xfff0c0 : 0xffb08a, felt >= 120 ? 1.3 : 0.9))
    // 작은 타격은 불꽃만, 제법 센 타격부터 고리 · 조각 효과, 숫자는 큰 타격에만(화면이 숫자로 덮이지 않게)
    if (felt >= 50) this.spawnImpact(unit.group.position.clone(), Math.round(amount), side === 'enemy' ? jade : ember, felt >= 140 || amount >= unit.maxTroops * 0.08, felt)
  }

  /** 일반 공격: 근접은 튀어나가 베고, 궁병은 화살·책사는 기탄을 날린다 */
  private playAttack(unit: BattleUnit, side: 'player' | 'enemy', targetLane: number): void {
    unit.attackMotion = 1
    const target = this.unitAt(side === 'player' ? 'enemy' : 'player', targetLane)
    // 병사들: 병종별 공격 자세(창 찌르기 · 말 위 검격 · 활쏘기). 한창 휘두르는 중이면 끊지 않는다
    if (unit.strikeAge < 0 || unit.strikeAge > 0.7) {
      unit.strikeAge = 0
      if (unit.general.role === '궁병' && target) this.troopVolley(unit, target, side)
    }
    if (unit.motion?.kind === 'skill') return // 스킬 동작 중에는 끊지 않는다
    const color = side === 'player' ? 0x9ff5e2 : 0xffa27a
    const ranged = this.isRanged(unit.general)
    unit.hero?.playOnce('Attack')
    // 다른 자리(전열 등)를 칠 때는 그쪽으로 몸을 돌린다
    if (target && target.group.position.x !== unit.group.position.x) { unit.aimTo = this.aimToward(unit, target); unit.aimHold = 0.75 }
    if (!ranged || !target) {
      const hit = unit.hero?.hitTime ?? MELEE_STRIKE
      unit.motion = { kind: 'melee', t: 0, dur: Math.max(MELEE_DURATION, hit + 0.32), hit }
      const weapon = this.weaponOf(unit)
      this.pendingStrike = { side, source: unit.general.name, delay: this.scaled(hit), weapon }
      // 휘두르기 · 찌르기 소리는 무기가 뻗어 나가는 순간에
      this.fx(this.later(Math.max(0, hit - (weapon === 'spear' ? 0.08 : 0.14)), () => sound.weapon(weapon, 'swing', { pan: this.lanePanOf(unit) })))
      const flip = unit.hero?.kind === 'slash' ? false : Math.random() < 0.5
      this.fx(this.later(hit - 0.03, () => {
        // 찌르기는 짧고 곧은 궤적, 베기는 크게 휘는 궤적
        const thrust = unit.hero?.kind === 'thrust'
        this.fx(slashArc(this.towardOf(unit, target, thrust ? 2.0 : 1.7, thrust ? 1.45 : 1.3), this.facing(unit) + unit.aim, color, thrust ? 1.1 : unit.mounted ? 1.8 : 1.5, flip, thrust ? 0.05 : 0.55))
      }))
      return
    }
    const release = unit.hero?.hitTime ?? SHOOT_RELEASE
    unit.motion = { kind: 'shoot', t: 0, dur: Math.max(SHOOT_DURATION, release + 0.3), hit: release }
    const flight = ranged === 'arrow' ? 0.34 : 0.42
    const weapon = this.weaponOf(unit)
    this.pendingStrike = { side, source: unit.general.name, delay: this.scaled(release) + flight, weapon }
    this.fx(this.later(release, () => sound.weapon(weapon, 'swing', { pan: this.lanePanOf(unit) })))
    this.fx(this.later(release, () => {
      const from = this.frontOf(unit, 0.8, ranged === 'arrow' ? 1.7 : 1.9)
      const to = target.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 1, 0))
      // 책사는 화염구를 쏜다(활은 화살)
      if (ranged === 'orb') this.fx(fireball(from, to, flight, () => {}, 1.4))
      else this.fx(projectile(from, to, ranged, color, flight, () => {}))
    }))
  }

  /**
   * 승리·패배 연출: 이긴 쪽은 무기를 연달아 치켜들며 금빛 기둥이 솟고,
   * 진 쪽은 뒤로 물러나며 흐려진다.
   */
  private playOutcome(won: boolean): void {
    const winners = (won ? this.playerUnits : this.enemyUnits).filter(unit => unit.troops > 0)
    const losers = (won ? this.enemyUnits : this.playerUnits).filter(unit => unit.troops > 0)
    const gold = 0xffd27a
    winners.forEach((unit, index) => {
      unit.motion = null
      unit.glow = 0.8
      unit.glowColor.set(won ? gold : ember)
      for (let round = 0; round < 3; round += 1) {
        this.addEffect(delayed(0.25 + round * 0.85 + index * 0.12, () => {
          unit.strikeAge = 0
          unit.hero?.playOnce('Attack')
          unit.attackMotion = 1
        }))
      }
      this.addEffect(delayed(0.3 + index * 0.15, () => this.fx(lightPillar(unit.group.position, won ? gold : ember, 1.1, 7, 1.6))))
    })
    losers.forEach((unit, index) => {
      // 뒤로 물러난다(아군은 카메라 쪽, 적은 성채 쪽)
      unit.target.z += unit.group.rotation.y === 0 ? 6 : -6
      this.addEffect(delayed(1.5 + index * 0.2, () => { if (unit.dying <= 0) { unit.dying = 1; unit.fallDust = false } }))
    })
    const center = new THREE.Vector3(0, 0, -4)
    this.addEffect(delayed(0.2, () => {
      this.fx(shockwave(center, won ? gold : 0x8a8f96, 9, 1.2))
      this.floatText(center.clone().setY(4.6), won ? '승리!' : '패배', won ? '#ffd27a' : '#c3c8cd', won ? 1.9 : 1.5)
    }))
  }

  /** 궁병 부대: 병사들이 시위를 놓는 순간에 맞춰 화살이 날아간다 */
  private troopVolley(unit: BattleUnit, target: BattleUnit, side: 'player' | 'enemy'): void {
    const color = side === 'player' ? 0xffe2a8 : 0xffb48a
    const release = 0.6 // 궁병 자세에서 시위를 놓는 순간(초)
    for (let i = 0; i < (this.reducedFx ? 2 : 5); i += 1) {
      const delay = release + Math.random() * 0.2
      this.fx(this.later(delay, () => {
        if (unit.troops <= 0) return
        const from = this.frontOf(unit, 0.6 + Math.random() * 1.2, 1.6).add(new THREE.Vector3((Math.random() - 0.5) * 2.6, 0, 0))
        const to = target.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0.3, (Math.random() - 0.5) * 1.6))
        this.fx(projectile(from, to, 'arrow', color, 0.55 + Math.random() * 0.1, () => {}, 1.8))
      }))
    }
  }

  /** 스킬: 기 모으기(슬로모션·카메라 당김) → 종류별 발동 */
  /** 스킬 소리 정보: 무장마다의 음높이 · 가락(이름으로 정한 수), 스킬 효과 목록, 타격 순간(실제 초) */
  private skillVoice(unit: BattleUnit, type: SkillType, side: 'player' | 'enemy'): { seed: number; tags: string[]; impact: number; hits: number; hero: boolean } {
    let seed = 0
    for (const ch of unit.general.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
    const def = GENERAL_SKILLS[unit.general.id]
    const tags: string[] = []
    let hits = 1
    for (const fx of def?.active.fx ?? []) {
      if (fx.k === 'debuff' || fx.k === 'buff') tags.push(fx.id)
      else if (fx.k === 'hits') hits = fx.n
      else tags.push(fx.k)
    }
    // 화공 계열(적벽 · 이릉)은 화계 소리
    if (/화|불|적벽/.test(def?.active.name ?? '') && !tags.includes('burning')) tags.push('burning')
    // 타격 순간: 게임 시간 → 실제 시간(시전 직후 슬로모션 구간은 0.32배로 흐른다)
    const game0 = type === '돌격' ? CHARGE_STRIKE : type === '계략' ? SKILL_RELEASE + 0.22 : type === '통솔' ? SKILL_RELEASE + 0.25 : type === '사격' ? SKILL_RELEASE + 0.1 : SKILL_RELEASE
    const game = this.scaled(game0)
    const slow = side === 'player' ? SKILL_SLOWMO_PLAYER : SKILL_SLOWMO_ENEMY
    const impact = game <= slow * 0.32 ? game / 0.32 : slow + (game - slow * 0.32)
    const skillName = def?.active.name ?? ''
    if (/수공|홍수|물/.test(skillName)) tags.push('water')
    if (/풍|바람|질풍/.test(skillName)) tags.push('wind')
    return { seed, tags, impact, hits, hero: unit.general.grade === 5 }
  }

  private playSkill(unit: BattleUnit, side: 'player' | 'enemy', type: SkillType, name: string, morale: number, targetLane: number): void {
    const foes = side === 'player' ? this.enemyUnits : this.playerUnits
    const allies = side === 'player' ? this.playerUnits : this.enemyUnits
    const aliveFoes = foes.filter(other => other.troops > 0 && other.dying <= 0)
    const target = foes[targetLane]?.troops > 0 ? foes[targetLane] : aliveFoes[0]
    const color = side === 'player' ? this.skillColor(unit.general) : ember
    const tint = new THREE.Color(color)
    const origin = unit.group.position.clone()
    let dash = 0
    if (type === '돌격' && target) dash = THREE.MathUtils.clamp(Math.abs(target.group.position.z - origin.z) - 1.1, 1.4, 4.2)
    unit.motion = { kind: 'skill', t: 0, dur: skillDuration(type), skillType: type, dash }
    unit.skillPulse = 1
    unit.glow = 1
    unit.glowColor.copy(tint)
    unit.hero?.playOnce('Skill')
    // 기 모으기
    // 카메라는 당기지 않는다(스킬마다 화면이 확대되면 어지럽다) — 짧은 슬로모션과 소리 · 빛으로만 강조
    this.slowMo = Math.max(this.slowMo, side === 'player' ? SKILL_SLOWMO_PLAYER : SKILL_SLOWMO_ENEMY)
    this.fx(groundCircle(origin, color, 2.4, SKILL_RELEASE + 0.9))
    this.fx(lightPillar(origin, color, 0.9, 5.5, SKILL_RELEASE + 0.35))
    if (!this.reducedFx) this.fx(chargeMotes(origin, color))
    const label = this.makeTextSprite(name, `#${color.toString(16).padStart(6, '0')}`, 1.25)
    label.position.copy(origin).add(new THREE.Vector3(0, 4.3, 0))
    this.addEffect({
      object: label, age: 0, life: 1.6,
      tick: effect => {
        const k = effect.age / effect.life
        label.position.y = origin.y + 4.3 + Math.sin(k * Math.PI) * 0.4
        label.scale.set(3.4 * (1 + Math.sin(Math.min(k * 2, 1) * Math.PI) * 0.25), 1.25 * (1 + Math.sin(Math.min(k * 2, 1) * Math.PI) * 0.25), 1)
        label.material.opacity = k < 0.12 ? k / 0.12 : 1 - Math.max(0, k - 0.7) / 0.3
      },
      dispose: () => { label.material.map?.dispose(); label.material.dispose() },
    })
    const damage = Math.max(20, morale * 10)
    const big = (at: THREE.Vector3, size = 1) => {
      this.fx(shockwave(at, color, 3.2 * size, 0.65))
      this.fx(hitSpark(at.clone().setY(1.1), color, 1.6 * size))
      this.addHitStop(0.09)
      this.cameraShake = Math.min(0.7, this.cameraShake + 0.26)
    }
    // 발동
    this.fx(this.later(SKILL_RELEASE, () => {
      switch (type) {
        case '돌격': {
          const start = origin.clone().setY(0)
          const end = this.frontOf(unit, dash, 0)
          if (!this.reducedFx) this.fx(dashTrail(start, end, color))
          this.fx(this.later(CHARGE_STRIKE - SKILL_RELEASE, () => {
            const hitAt = target ? target.group.position.clone() : end.clone()
            this.fx(slashArc(hitAt.clone().setY(1.2), this.facing(unit), color, 2.4, false, 0.55))
            this.fx(this.later(0.08, () => this.fx(slashArc(hitAt.clone().setY(1.4), this.facing(unit), 0xffffff, 2.1, true, 0.35))))
            big(hitAt, 1.1)
            if (target) this.spawnImpact(target.group.position.clone(), damage, color)
          }))
          break
        }
        case '사격': {
          const shots = aliveFoes.length ? aliveFoes : target ? [target] : []
          for (let i = 0; i < 9; i += 1) {
            const victim = i < 5 && target ? target : shots[i % Math.max(1, shots.length)]
            if (!victim) break
            const from = this.frontOf(unit, 0.6, 1.8).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.4, 0))
            const to = victim.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.6, (Math.random() - 0.5) * 1.2))
            this.fx(this.later(i * 0.04, () => this.fx(projectile(from, to, 'arrow', color, 0.36, at => this.fx(hitSpark(at, color, 0.7)), 1.6))))
          }
          if (target) this.fx(this.later(0.4 + 8 * 0.04, () => { big(target.group.position.clone(), 0.8); this.spawnImpact(target.group.position.clone(), damage, color) }))
          break
        }
        case '계략': {
          const fire = /화|불|연환|동남풍|적벽/.test(name) || unit.general.id === 'zhou-yu' || unit.general.id === 'lu-xun'
          const victims = aliveFoes.length ? aliveFoes : []
          victims.forEach((victim, i) => {
            const at = victim.group.position.clone()
            this.fx(groundCircle(at, fire ? 0xff7a2a : color, 3, 1.1, -1.4))
            this.fx(this.later(0.22 + i * 0.12, () => {
              if (fire) this.fx(fireBurst(at)); else this.fx(lightning(at, color))
              big(at, 0.8)
              if (victim === target) this.spawnImpact(at, damage, color)
            }))
          })
          break
        }
        case '통솔': {
          this.fx(shockwave(origin, color, 9, 1))
          allies.filter(ally => ally.troops > 0).forEach(ally => {
            ally.glow = Math.max(ally.glow, 0.8)
            ally.glowColor.copy(tint)
            this.fx(lightPillar(ally.group.position, color, 1.1, 4, 0.9))
          })
          if (target) this.fx(this.later(0.25, () => { big(target.group.position.clone(), 0.7); this.spawnImpact(target.group.position.clone(), damage, color) }))
          break
        }
        case '수호': {
          allies.filter(ally => ally.troops > 0).forEach(ally => this.fx(shieldDome(ally.group.position, side === 'player' ? 0x8fd8ff : 0xff9a7a)))
          this.cameraShake = Math.min(0.5, this.cameraShake + 0.12)
          break
        }
        case '치유': {
          allies.filter(ally => ally.troops > 0).forEach(ally => {
            this.fx(healMotes(ally.group.position))
            this.fx(lightPillar(ally.group.position, 0x7be3a2, 1.2, 3.5, 1))
            ally.glow = Math.max(ally.glow, 0.7)
            ally.glowColor.set(0x7be3a2)
          })
          break
        }
      }
    }))
  }

  private syncTroops(): void {
    const core = this.core
    if (!core) return
    const sync = (units: BattleUnit[], coreUnits: BattleCore['players']) => units.forEach((unit, index) => {
      const coreUnit = coreUnits[index]
      if (!coreUnit) return
      unit.troops = coreUnit.troops
      unit.maxTroops = coreUnit.maxTroops
      unit.statusFill.scale.x = Math.max(0.001, unit.troops / Math.max(1, unit.maxTroops))
      if (unit.troops > 0 && (!unit.group.visible || unit.dying > 0)) { unit.group.visible = true; unit.dying = 0; unit.hero?.setFade(0); if (unit.hero instanceof SkeletalHero) unit.hero.revive() }
    })
    sync(this.playerUnits, core.players)
    sync(this.enemyUnits, core.enemies)
  }

  private updateUnitMotion(unit: BattleUnit, delta: number, elapsed: number, color: number): void {
    const dt = Math.min(0.1, delta)
    const pos = unit.group.position
    // 이동: 임계 감쇠 스프링(출발할 때 서서히 붙고, 도착할 때 미끄러지듯 멈춘다). 빠른 무장일수록 반감기가 짧다
    const halflife = Math.LN2 / (1.15 + unit.general.speed / 75) * 0.9
    const sx = { x: pos.x, v: unit.vel.x }, sz = { x: pos.z, v: unit.vel.z }
    springTo(sx, unit.target.x, halflife, dt)
    springTo(sz, unit.target.z, halflife, dt)
    pos.set(sx.x, 0, sz.x)
    unit.vel.set(sx.v, 0, sz.v)
    // 걸음 가중치: 실제 빠르기에서 얻어 부드럽게 바꾼다(걷기 ↔ 서 있기가 뚝 끊기지 않게)
    const speed = Math.hypot(unit.vel.x, unit.vel.z)
    unit.gait = damp(unit.gait, this.battleActive && unit.troops > 0 ? clamp01((speed - 0.08) / 1.1) : 0, 0.12, dt)
    const moving = unit.gait > 0.12
    // 쏠림: 앞으로 달리면 앞으로, 옆으로 움직이면 그쪽으로 기운다. 조금 늦게 따라와 가속·감속이 느껴진다
    const facing = unit.group.rotation.y === 0 ? 1 : -1
    const forward = -unit.vel.z * facing, side = unit.vel.x * facing
    unit.lean.x = damp(unit.lean.x, -THREE.MathUtils.clamp(forward * 0.05, -0.1, 0.12), 0.16, dt)
    unit.lean.z = damp(unit.lean.z, -THREE.MathUtils.clamp(side * 0.04, -0.08, 0.08), 0.16, dt)
    // 피격: 한 번 밀렸다가 되튕김 없이 제자리로(진동시키면 말 탄 무장이 덜덜 떠는 것처럼 보인다)
    springTo(unit.hit, 0, 0.11, dt)
    unit.attackMotion = Math.max(0, unit.attackMotion - delta * 2.6)
    unit.skillPulse = Math.max(0, unit.skillPulse - delta * 1.1)
    unit.hitFlash = Math.max(0, unit.hitFlash - delta)
    const actionDelta = this.paused ? 0 : delta * this.speed
    if (unit.strikeAge >= 0) { unit.strikeAge += actionDelta; if (unit.strikeAge > 2.2) unit.strikeAge = -1 }
    const hitAmount = Math.max(0, unit.hit.x)
    unit.squadCtl.update(elapsed + unit.motionPhase, Math.max(unit.gait, unit.dashGait), unit.attackMotion > 0 ? 1 - unit.attackMotion : 0, hitAmount, unit.troops / Math.max(1, unit.maxTroops), unit.strikeAge)
    // 몸 전체 동작: 공격 돌진 · 스킬 기 모으기/돌격 · 피격 젖힘
    if (unit.motion) {
      unit.motion.t += actionDelta
      if (unit.motion.t >= unit.motion.dur) unit.motion = null
    }
    const pose = actorPose(unit.motion, unit.hit.x, unit.pose)
    // 관성 블렌딩: 동작이 바뀌거나 끊기는 순간 직전 화면 자세와의 차이를 기억했다가 짧게(0.08초 반감) 지운다
    const blend = unit.blend
    const raw = [pose.z, pose.y, pose.tilt, pose.twist, pose.scale]
    if (unit.motion !== blend.motion) {
      for (let i = 0; i < 5; i += 1) { blend.off[i] = blend.prev[i] - raw[i]; blend.vel[i] = blend.prevVel[i] }
      blend.motion = unit.motion
    }
    for (let i = 0; i < 5; i += 1) {
      const sp = { x: blend.off[i], v: blend.vel[i] }
      springTo(sp, 0, 0.08, dt)
      blend.off[i] = sp.x; blend.vel[i] = sp.v
      const shown = raw[i] + sp.x
      if (dt > 0) blend.prevVel[i] = THREE.MathUtils.clamp((shown - blend.prev[i]) / dt, -40, 40)
      blend.prev[i] = shown
    }
    const [pz, py, ptilt, ptwist, pscale] = blend.prev
    // 공격 돌진 · 스킬 돌격 · 피격 밀림으로 몸이 제자리에서 움직일 때도 말이 실제로 달리듯 다리를 움직인다
    // (피격 밀림 · 자세 섞기 떨림은 빼고 동작 자체의 앞뒤 이동만 본다 — 맞을 때마다 다리가 부르르 떨지 않게)
    const dashZ = unit.motion ? actorPose(unit.motion, 0, dashPose).z : 0
    const dashSpeed = dt > 0 ? Math.abs(dashZ - unit.prevPz) / dt : 0
    unit.prevPz = dashZ
    unit.dashGait = damp(unit.dashGait, unit.troops > 0 ? clamp01((dashSpeed - 0.5) / 1.6) : 0, dashSpeed > 0.5 ? 0.05 : 0.16, dt)
    // 말발굽: 달리는 말의 빠르기를 모아 녹음된 말발굽 소리의 크기 · 빠르기로 쓴다(updateGallop)
    const run = Math.max(unit.gait, unit.dashGait)
    if (unit.mounted && run > 0.15 && unit.troops > 0 && this.battleActive) {
      const w = run * (unit.troopType === 'cavalry' ? 1.4 : 1)
      this.gallopSum += w; this.gallopPan += w * this.lanePanOf(unit); this.gallopPeak = Math.max(this.gallopPeak, run)
    }
    // 히트스톱 동안에는 그 자세로 잠깐 멈출 뿐 좌우로 떨지 않는다(무게감 있는 말 탄 무장에 떨림은 어색하다)
    unit.shake = Math.max(0, unit.shake - this.frameDelta)
    unit.aimHold = Math.max(0, unit.aimHold - dt)
    unit.aim = damp(unit.aim, unit.aimHold > 0 ? unit.aimTo : 0, 0.09, dt)
    // 돌진도 돌린 방향으로
    unit.actor.position.set(pz * Math.sin(unit.aim), py, pz * Math.cos(unit.aim))
    unit.actor.rotation.set(ptilt + unit.lean.x, ptwist + unit.aim, unit.lean.z)
    unit.actor.scale.setScalar(pscale)
    unit.glow = Math.max(0, unit.glow - (unit.motion?.kind === 'skill' ? 0 : delta * 2.2))
    if (unit.dying > 0) {
      unit.dying = Math.max(0, unit.dying - delta * 0.75)
      this.poseFall(unit, 1 - unit.dying)
      if (unit.dying <= 0) { unit.group.visible = false; unit.squad.position.y = 0 }
    }
    if (unit.hero) {
      unit.hero.update(actionDelta, Math.max(unit.gait, unit.dashGait), unit.mounted)
      unit.hero.setFlash(unit.hitFlash > 0 ? unit.hitFlash / 0.18 : 0, unit.glow, unit.glowColor)
    } else animateGeneral(unit.rig, elapsed + unit.motionPhase, moving, unit.attackMotion > 0 ? 1 - unit.attackMotion : 0, unit.skillPulse, unit.hitFlash > 0 ? unit.hitFlash / 0.18 : 0)
    unit.motionPulse -= delta
    if (moving && unit.motionPulse <= 0) {
      unit.motionPulse = 0.72 + (unit.motionPhase % 0.35)
      this.spawnDustCloud(pos.clone().add(new THREE.Vector3(0, 0, unit.group.rotation.y === 0 ? 1.4 : -1.4)), color === ember ? 0xb68f70 : 0xa4a08a)
    }
  }

  /**
   * 쓰러짐(0 → 1): 맞고 휘청이며 무릎이 꺾이고 → 중력처럼 점점 빨라지며 넘어가 → 땅에 닿아 살짝 튕기고(흙먼지)
   * → 가라앉으며 흐려진다. 보병은 앞으로 고꾸라지고, 말 탄 무장은 말과 함께 옆으로 쓰러진다.
   */
  private poseFall(unit: BattleUnit, fall: number): void {
    const buckle = easeOut2(clamp01(fall / 0.18))
    const topple = easeIn2(clamp01((fall - 0.12) / 0.43))
    const bounce = Math.sin(clamp01((fall - 0.55) / 0.16) * Math.PI) * (1 - clamp01((fall - 0.55) / 0.16)) * 0.9
    const sink = easeIn2(clamp01((fall - 0.72) / 0.28))
    const angle = topple - bounce * 0.08
    const sideways = unit.mounted ? (unit.motionPhase % 1.6 < 0.8 ? 1 : -1) : 0
    // 휘청: 넘어가기 직전 잠깐 뒤로 젖혀진다
    const sway = Math.sin(clamp01(fall / 0.2) * Math.PI) * 0.12
    const hero = unit.hero
    if (hero && 'skeletal' in hero) {
      // 뼈대 무장: 쓰러지는(말에서 떨어지는) 동작이 몸을 눕힌다. 끝에 땅속으로 가라앉으며 흐려진다
      hero.playDeath()
      unit.actor.position.y = -sink * 0.3
    } else {
      unit.actor.rotation.x = sideways ? -angle * 0.25 + sway : -angle * 1.38 + sway
      unit.actor.rotation.z = sideways * angle * 1.25
      unit.actor.position.y = -buckle * 0.12 - sink * 0.45
    }
    unit.squad.position.y = -fall * 0.7
    if (!unit.fallDust && fall >= 0.55) {
      unit.fallDust = true
      this.spawnDustCloud(unit.group.position.clone().add(new THREE.Vector3(sideways * 0.9, 0, 0)), 0xb9a17c)
      this.cameraShake = Math.min(0.62, this.cameraShake + 0.05)
    }
    unit.hero?.setFade(clamp01((fall - 0.6) / 0.4))
  }

  private troopStatus(): BattleTroopStatus[] {
    return [
      ...this.playerUnits.map((unit, index) => ({ side: 'player' as const, index, id: unit.general.id, name: unit.general.name, troops: Math.round(unit.troops), maxTroops: unit.maxTroops, alive: unit.troops > 0 })),
      ...this.enemyUnits.map((unit, index) => ({ side: 'enemy' as const, index, id: unit.general.id, name: unit.general.name, troops: Math.round(unit.troops), maxTroops: unit.maxTroops, alive: unit.troops > 0 })),
    ]
  }

  private difficultyLabel(): string {
    return { normal: '일반 전투', scenario: '시나리오', siege: '공성전', duel: '유저 대련', raid: '레이드' }[this.mode]
  }

  getSnapshot(): BattleSnapshot {
    const core = this.core
    const unit = this.playerUnits[this.selectedUnit]
    const general = unit?.general
    const coreSelected = core?.players[this.selectedUnit]
    const open = core?.pattern && !core.pattern.judged ? core.pattern : null
    const elapsed = core?.t ?? 0
    const units = this.generals.map((member, lane): BattleUnitStatus => {
      const coreUnit = core?.players[lane]
      const fallback = coreTroopCapacity(member)
      return {
        lane, id: member.id, name: member.name, role: member.role, level: member.level, stars: member.stars,
        troops: Math.round(coreUnit?.troops ?? fallback), maxTroops: coreUnit?.maxTroops ?? fallback, alive: (coreUnit?.troops ?? 1) > 0,
        skillName: coreUnit ? core!.skillName(coreUnit) : member.skillName,
        skillType: coreUnit?.def.type ?? '돌격',
        skillUnlocked: Boolean(member.skillUnlocked),
        cooldown: Math.max(0, coreUnit?.cd ?? 0), cooldownMax: coreUnit?.cdMax ?? 0,
        ready: Boolean(core?.active && member.skillUnlocked && coreUnit && coreUnit.troops > 0 && coreUnit.cd <= 0),
        edge: (() => { const foe = this.enemyDeck[lane]; if (!foe) return null; const value = matchup(member.role, foe.role); return value > 1 ? 'adv' as const : value < 1 ? 'dis' as const : null })(),
      }
    })
    const pattern = open ? { label: open.def.label, lanes: open.def.lanes, kind: open.def.kind, warning: open.def.warning, timeLeft: Math.max(0, open.deadline - elapsed), window: Math.max(0.1, open.deadline - open.at), judged: open.judged } : null
    const enemyPower = this.enemyDeck.reduce((sum, enemy) => sum + enemy.leadership + enemy.martial + enemy.stratagem + enemy.speed + enemy.level * 4, 0)
    const moraleMax = core?.moraleMax ?? BATTLE_RULES.moraleByPhase[0]
    const moraleValue = Math.max(0, core?.morale ?? moraleMax)
    return {
      raidDamage: Math.round(core?.raidDamage ?? 0),
      active: this.battleActive,
      mode: this.mode,
      elapsed,
      timeLeft: Math.max(0, BATTLE_RULES.timeLimit - elapsed),
      morale: Math.round(moraleValue / Math.max(1, moraleMax) * 100),
      moraleValue: Math.round(moraleValue),
      moraleMax,
      phase: core?.phase ?? 0,
      phaseName: phaseName(core?.phase ?? 0),
      pattern,
      enemyPattern: pattern?.label ?? '대기',
      enemyPatternLane: pattern && pattern.kind !== 'guard' ? pattern.lanes[0] ?? -1 : -1,
      combo: core?.combo ?? 0,
      threat: Math.round(core?.threat ?? 0),
      collapses: core?.collapses ?? 0,
      tacticGauge: Math.floor(core?.gauge ?? 0),
      tacticCosts: { guard: core?.tacticCost('guard') ?? 35, feint: core?.tacticCost('feint') ?? 50, charge: core?.tacticCost('charge') ?? 65 },
      guardActive: (core?.guardTimer ?? 0) > 0,
      units,
      enemyWarning: this.enemyWarning && this.enemyWarning.until > elapsed ? { name: this.enemyWarning.name, general: this.enemyWarning.general } : null,
      selectedUnit: this.selectedUnit,
      selectedName: general?.name ?? '—',
      selectedRole: general?.role ?? '—',
      selectedArchetype: general ? this.commanderArchetype(general) : '—',
      selectedLevel: general?.level ?? 0,
      selectedStats: general ? { leadership: general.leadership, martial: general.martial, stratagem: general.stratagem, speed: general.speed } : null,
      skillName: coreSelected ? core!.skillName(coreSelected) : general?.skillName ?? '장수 스킬',
      skillDescription: coreSelected ? coreSelected.def.active.desc : general?.skillDescription ?? '무장을 선택하면 고유 스킬이 표시됩니다.',
      skillUnlocked: general?.skillUnlocked ?? false,
      skillReady: Boolean(units[this.selectedUnit]?.ready),
      skillCooldown: units[this.selectedUnit]?.cooldown ?? 0,
      activeEffects: [...(core?.buffs ?? []), ...(core?.debuffs ?? []), ...(core?.enemyBuffs ?? [])].map(effect => ({ ...effect })),
      playerDebuffs: (core?.playerDebuffs ?? []).map(effect => ({ ...effect })),
      bond: core?.bond ? `${core.bond.name} · ${core.bond.desc}` : '',
      opponentDeck: this.enemyDeck.map(enemy => ({ id: enemy.id, name: enemy.name, role: enemy.role, level: enemy.level, grade: enemy.grade, portraitPath: enemy.portraitPath })),
      troopStatus: this.troopStatus(),
      difficulty: this.difficultyLabel(),
      difficultyMultiplier: core ? Math.round((BATTLE_RULES.pressureStart + (BATTLE_RULES.pressureEnd - BATTLE_RULES.pressureStart) * Math.min(1, elapsed / BATTLE_RULES.pressureRamp)) * 100) / 100 : 1,
      duelMode: this.mode === 'duel',
      enemyPower,
      status: this.battleActive ? (this.paused ? '일시 정지' : core?.autoPilot ? '자동 전투 중' : '전투 중') : core?.result ? (core.result.won ? '승리' : '패배') : '대기 중',
      speed: this.speed,
      paused: this.paused,
      autoPlay: Boolean(core?.autoPilot),
      autoSkill: Boolean(core?.autoSkill),
      log: this.logLines.slice(-12),
      result: core?.result ?? null,
    }
  }

  /** 이번 프레임의 실제 시간(히트스톱·슬로모션과 상관없이) */
  private frameDelta = 0

  private update(realDelta: number): void {
    this.watchFrameRate(realDelta)
    this.frameDelta = realDelta
    // 강타 순간 멈춤(아주 짧게) · 스킬 기 모으기 슬로모션
    const scale = this.hitStop > 0 ? 0.05 : this.slowMo > 0 ? 0.32 : 1
    this.hitStop = Math.max(0, this.hitStop - realDelta)
    this.hitStopSpent = Math.max(0, this.hitStopSpent - realDelta * 0.15)
    this.slowMo = Math.max(0, this.slowMo - realDelta)
    const delta = realDelta * scale
    this.updateEffects(delta)
    this.playerUnits.forEach(unit => {
      this.updateUnitMotion(unit, delta, this.clock.getElapsed(), jade)
    })
    if (this.selectionRing && this.playerUnits[this.selectedUnit]) {
      const unit = this.playerUnits[this.selectedUnit]
      this.selectionRing.position.y = 0.035 + Math.sin(this.clock.getElapsed() * 4) * 0.025
      this.selectionRing.position.x = unit.group.position.x
      this.selectionRing.position.z = unit.group.position.z
      this.selectionRing.scale.setScalar(1 + Math.sin(this.clock.getElapsed() * 3) * 0.04)
    }
    this.enemyUnits.forEach((unit, index) => {
      this.updateUnitMotion(unit, delta, this.clock.getElapsed() + index * 0.4, ember)
    })
    // 말발굽 소리: 이번 프레임에 달린 말들을 모아 한 번에(말이 많고 빠를수록 크게 · 빠르게)
    // 말발굽은 전투 처음 3초만(진격하며 달려 나가는 소리), 그 뒤에는 서서히 꺼진다
    const charging = this.battleActive && this.clock.getElapsed() < this.gallopUntil
    sound.gallop(charging ? Math.max(0.6, Math.min(1, this.gallopSum / 3.5)) : 0, this.gallopSum > 0 ? this.gallopPan / this.gallopSum : 0, 0.95 + 0.2 * this.gallopPeak)
    this.gallopSum = 0; this.gallopPan = 0; this.gallopPeak = 0
    this.updateCamera(realDelta)
    if (!this.battleActive || !this.core || this.paused) return
    let remaining = delta * this.speed
    while (remaining > 0 && this.core.active) {
      const step = Math.min(0.05, remaining)
      this.core.tick(step)
      remaining -= step
    }
    this.drainCore()
  }

  private updateCamera(delta: number): void {
    this.cameraIntro = Math.max(0, this.cameraIntro - delta)
    this.cameraVictory = Math.max(0, this.cameraVictory - delta)
    this.cameraShake = Math.max(0, this.cameraShake - delta * 1.8)
    const introOffset = this.cameraIntro > 0 ? (this.cameraIntro / 1.35) * 3.8 : 0
    const victoryOffset = this.cameraVictory > 0 ? (1 - this.cameraVictory / 1.5) * 2.8 : 0
    // 흔들림: trauma²(약한 충격은 거의 안 흔들리고 강타만 크게) + 매 프레임 무작위 대신 이어지는 노이즈
    const trauma = Math.min(1, this.cameraShake / 0.62)
    const shake = trauma * trauma * 0.32 * (this.reducedFx ? 0.4 : 1)
    const nt = this.clock.getElapsed() * 21
    const nx = smoothNoise(nt, 1) * 0.5, ny = smoothNoise(nt, 7) * 0.5
    const living = [...this.playerUnits, ...this.enemyUnits].filter(unit => unit.troops > 0)
    const frontZ = living.length ? living.reduce((sum, unit) => sum + unit.group.position.z, 0) / living.length : this.cameraLookAt.z
    const selected = this.playerUnits[this.selectedUnit]
    void selected
    const focusX = 0 // 고른 무장을 따라 카메라가 옆으로 흔들리지 않게 고정
    const focusZ = this.battleActive ? Math.max(-4.5, Math.min(2.5, frontZ * 0.18 - 2.2)) : this.cameraLookAt.z
    // 세로 화면(휴대폰)은 가로 시야가 좁으니 카메라를 뒤로 물려 세 레인이 모두 보이게 한다
    const aspect = this.camera.aspect || 1
    const pull = this.cameraPull(aspect)
    this.camera.position.set(
      this.cameraLookAt.x + (this.cameraBase.x - this.cameraLookAt.x) * pull + focusX + nx * shake,
      this.cameraLookAt.y + (this.cameraBase.y - this.cameraLookAt.y) * pull + ny * shake * 0.55,
      this.cameraLookAt.z + (this.cameraBase.z - this.cameraLookAt.z) * pull + introOffset + victoryOffset + (this.battleActive ? frontZ * 0.06 : 0),
    )
    this.camera.lookAt(this.cameraLookAt.x + focusX, this.cameraLookAt.y + (this.cameraVictory > 0 ? 1.2 : 0), focusZ)
    // (화면 기울임 흔들림은 어지러워서 쓰지 않는다)
    // 스킬: 쓰는 무장 쪽으로 카메라를 바짝 당겼다가 돌아온다
    const focus = this.cameraFocus
    if (focus) {
      focus.age += delta
      const k = focus.age / focus.life
      if (k >= 1) { this.cameraFocus = null; return }
      const weight = focus.strength * (k < 0.22 ? ease(k / 0.22) : k < 0.62 ? 1 : 1 - ease((k - 0.62) / 0.38))
      const back = focus.side === 'player' ? 6.2 : 8.4
      const closePos = new THREE.Vector3(focus.target.x * 0.75 + (focus.target.x >= 0 ? -1.6 : 1.6), 2.9 + (aspect < 0.8 ? 1.6 : 0), focus.target.z + back + (aspect < 0.8 ? 3.4 : 0))
      const closeLook = new THREE.Vector3(focus.target.x * 0.85, 1.5, focus.target.z - (focus.side === 'player' ? 2.6 : 0))
      const look = new THREE.Vector3(this.cameraLookAt.x + focusX, this.cameraLookAt.y, focusZ).lerp(closeLook, weight)
      this.camera.position.lerp(closePos.add(new THREE.Vector3(nx * shake, ny * shake * 0.55, 0)), weight)
      this.camera.lookAt(look)
    }
  }

  /** 전투 밖 화면에서는 3D 전장을 그리지 않는다(배경 사진이 대신 보이고 그래픽 부담도 준다) */
  private sceneVisible = true
  setSceneVisible(on: boolean): void {
    if (this.sceneVisible === on) return
    this.sceneVisible = on
    this.renderer.domElement.style.visibility = on ? '' : 'hidden'
  }

  private animate = (): void => {
    if (this.disposed) return
    requestAnimationFrame(this.animate)
    this.clock.update()
    if (!this.sceneVisible && !this.battleActive) { this.clock.getDelta(); return }
    const delta = Math.min(this.clock.getDelta(), 0.05)
    this.update(delta)
    this.environment.update(this.clock.getElapsed(), delta)
    if (this.composer) this.composer.render(delta)
    else this.renderer.render(this.scene, this.camera)
  }

  /** 좌·중·우 부대 간격(화면 비율에 따라) */
  private laneGap(): number {
    return (this.camera.aspect || 1) < 0.8 ? LANE_GAP_PORTRAIT : LANE_GAP_WIDE
  }

  /**
   * 카메라를 얼마나 뒤로 물릴지: 좌·우 부대가 화면 안(세로 화면은 아래 좌·우 카드 위)에 오도록
   * 부대 줄 깊이에서의 가로 시야 폭을 맞춘다.
   */
  private cameraPull(aspect: number): number {
    const base = aspect < 0.8 ? 1.75 : aspect < 1.25 ? 1.3 : 1
    const halfTan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    const ndc = aspect < 0.8 ? PORTRAIT_LANE_NDC : 0.72
    const depth = this.laneGap() / (ndc * halfTan * aspect)
    const span = this.cameraBase.z - this.cameraLookAt.z
    const needed = (depth + PLAYER_LINE_Z - this.cameraLookAt.z) / span
    return Math.max(base, needed)
  }

  private resize = (): void => {
    const width = window.innerWidth
    const height = window.innerHeight
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.composer?.setPixelRatio(this.renderer.getPixelRatio())
    this.composer?.setSize(width, height)
  }

  dispose(): void {
    this.disposed = true
    window.removeEventListener('resize', this.resize)
    this.renderer.dispose()
  }
}
