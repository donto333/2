import * as THREE from 'three'
import { allGenerals, scaleGeneral, type General } from './strategy'
import { BattleCore, BATTLE_RULES, type BattleResearch, phaseName, troopCapacity as coreTroopCapacity, type BattleMode, type BattleResult, type BattleTactic, type CoreEvent } from './battle-core'
import type { ActiveBattleEffect } from './battle-effects'
import type { SkillType } from './skills'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { AnimatedHero, bakedTroop, heroModelFor, loadModel, troopModelFor } from './battle-models'
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
}

export interface BattlePatternStatus {
  label: string
  lanes: number[]
  kind: 'lane' | 'pincer' | 'guard'
  warning: string
  timeLeft: number
  window: number
  judged: boolean
}

export interface BattleSnapshot {
  active: boolean
  mode: BattleMode
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
  hitReact: number
  knockback: THREE.Vector3
  motionPhase: number
  motionPulse: number
  troopType: TroopType
  attackMotion: number
  rig: GeneralRig
  squadCtl: Squad
  skillPulse: number
  /** 실사 3D 모델(불러오면 도형 모델 대신 보인다) */
  hero: AnimatedHero | null
  mounted: boolean
}

interface ArenaEffect {
  object: THREE.Object3D
  age: number
  life: number
  tick: (effect: ArenaEffect, delta: number) => void
  dispose: () => void
}

const jade = 0x52e0c4
const ember = 0xff8066
type TroopType = 'cavalry' | 'spearmen' | 'archer'
export type CommanderArchetype = '무장형' | '책사형' | '지원형'
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
  private speed = 1
  private paused = false
  private winStreak = 0
  private startedAt = 0
  private selectedUnit = 0
  private lastVolley = -1
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
    this.animate()
  }

  private troopCapacity(general: General): number {
    return coreTroopCapacity(general)
  }

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
    const positions = [new THREE.Vector3(-4.2, 0, 6), new THREE.Vector3(0, 0, 7.4), new THREE.Vector3(4.2, 0, 6)]
    this.generals.forEach((general, index) => {
      const built = this.createUnit(general, jade, positions[index] ?? positions[0])
      const group = built.group
      const maxTroops = this.troopCapacity(general)
      const status = this.createTroopStatus(jade)
      group.add(status.group)
      const unit: BattleUnit = { group, squad: built.squad.group, model: built.rig.root, general, target: positions[index] ?? positions[0].clone(), troops: maxTroops, maxTroops, attackTimer: 0.45 + index * 0.16, statusGroup: status.group, statusFill: status.fill, hitFlash: 0, hitReact: 0, knockback: new THREE.Vector3(), motionPhase: index * 0.8, motionPulse: 0.4 + index * 0.25, troopType: this.troopType(general), attackMotion: 0, rig: built.rig, squadCtl: built.squad, skillPulse: 0, hero: null, mounted: false }
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
  }
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
  setResearch(research: BattleResearch | null): void {
    this.research = research
  }

  setSpeed(speed: number): void {
    this.speed = speed >= 2 ? 2 : 1
  }

  /** 일시 정지: 전투 시간·적 행동·스킬 쿨다운이 모두 멈춘다. 정지 중에는 명령을 받지 않는다. */
  setPaused(on: boolean): void {
    this.paused = Boolean(on) && this.battleActive
  }

  setAutoPlay(on: boolean): void {
    if (this.core) this.core.autoPilot = on ? { accuracy: 0.85, reaction: [0.6, 1.2] } : null
  }

  stopBattle(): void {
    this.battleActive = false
    this.paused = false
    this.core = null
    this.enemyUnits.splice(0).forEach(unit => this.scene.remove(unit.group))
    this.enemyDeck = []
    this.configuredEnemyDeck = null
    this.mode = 'normal'
    this.moraleBonus = 0
    this.enemyWarning = null
  }

  private createUnit(general: General, teamColor: number, position: THREE.Vector3): { group: THREE.Group; rig: GeneralRig; squad: Squad } {
    const team = teamColor === ember ? 'enemy' : 'player'
    const group = new THREE.Group()
    group.position.copy(position)
    group.userData.baseY = 0
    const rig = createGeneralModel(general, team)
    const squad = createSquad(general.role, team, this.quality)
    group.userData.model = rig.root
    group.add(squad.group, rig.root)
    // 발밑 진영 고리(아군 청록 · 적 붉은색)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.98, 40), new THREE.MeshBasicMaterial({ color: team === 'enemy' ? 0xff5a3c : 0x5ae0c0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.03
    group.add(ring)
    return { group, rig, squad }
  }

  /** 실사 모델을 불러와 도형 모델·병사와 바꾼다(불러오기 전에는 도형 모델로 바로 싸울 수 있다) */
  private attachRealModels(unit: BattleUnit): void {
    const name = heroModelFor(unit.general)
    unit.mounted = name === 'lubu' || name === 'caocao' || name === 'zhugeliang' || name === 'cavalry'
    void loadModel(name).then(gltf => {
      if (unit.hero || !unit.group.parent && !this.playerUnits.includes(unit)) return
      const hero = new AnimatedHero(gltf)
      hero.root.rotation.y = Math.PI // 모델은 +Z를 본다 → 부대 앞(-Z)으로
      hero.root.scale.setScalar(1.18) // 무장은 병사보다 한눈에 띄게 조금 크게
      unit.group.add(hero.root)
      unit.rig.root.visible = false
      unit.hero = hero
    }).catch(() => { /* 모델이 없으면 도형 모델 유지 */ })
    void bakedTroop(troopModelFor(unit.general.role)).then(baked => unit.squadCtl.upgrade(baked.geometry, baked.material)).catch(() => {})
  }

  private clearUnits(): void {
    this.playerUnits.splice(0).forEach(unit => this.scene.remove(unit.group))
    this.enemyUnits.splice(0).forEach(unit => this.scene.remove(unit.group))
    if (this.selectionRing) this.scene.remove(this.selectionRing)
    if (this.commandMarker) this.scene.remove(this.commandMarker)
    this.clearEffects()
    this.selectionRing = null
    this.commandMarker = null
  }

  private createTroopStatus(color: number): { group: THREE.Group; fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> } {
    const group = new THREE.Group()
    group.position.set(0, 3.9, 0)
    group.renderOrder = 8
    const background = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.11), new THREE.MeshBasicMaterial({ color: 0x1c120c, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false }))
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.065), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false }))
    background.position.z = 0.02
    fill.position.set(-0.79, 0, 0.03)
    fill.scale.x = 1
    group.add(background, fill)
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
  }

  private makeTextSprite(text: string, color: string, scale = 2.2): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 160
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context is unavailable')
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.font = '700 76px Sora, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.strokeStyle = 'rgba(4, 12, 14, .86)'
    context.lineWidth = 13
    context.strokeText(text, canvas.width / 2, canvas.height / 2)
    context.fillStyle = color
    context.shadowColor = color
    context.shadowBlur = 22
    context.fillText(text, canvas.width / 2, canvas.height / 2)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(scale * 2.7, scale, 1)
    return sprite
  }

  private spawnImpact(position: THREE.Vector3, damage: number, color = 0xf6c56d): void {
    const group = new THREE.Group()
    const intensity = Math.min(1.65, 0.82 + damage / 180)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.72, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    innerRing.rotation.x = -Math.PI / 2
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false }))
    flash.position.y = 0.7
    const shards: THREE.Mesh[] = []
    for (let index = 0; index < 8; index += 1) {
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.08 + (index % 2) * 0.04, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }))
      const angle = (index / 8) * Math.PI * 2
      shard.position.set(Math.cos(angle) * 0.34, 0.42 + (index % 3) * 0.1, Math.sin(angle) * 0.34)
      shard.userData.velocity = new THREE.Vector3(Math.cos(angle) * (1.2 + (index % 3) * 0.18), 0.45 + (index % 2) * 0.25, Math.sin(angle) * (1.2 + (index % 3) * 0.18))
      group.add(shard)
      shards.push(shard)
    }
    group.add(ring, innerRing, flash)
    group.position.copy(position)
    const label = this.makeTextSprite(`-${damage}`, color === 0x4cdfff ? '#8deaff' : '#ffe5a4', 1.15)
    label.position.set(0, 1.35, 0)
    group.add(label)
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
        flash.scale.setScalar(1 + progress * 2.5 * intensity)
        flash.material.opacity = 0.98 * (1 - progress)
        shards.forEach(shard => {
          shard.position.addScaledVector(shard.userData.velocity as THREE.Vector3, delta)
          shard.rotation.x += delta * 8
          shard.rotation.y += delta * 11
          ;(shard.material as THREE.MeshBasicMaterial).opacity = 0.92 * (1 - progress)
        })
        label.position.y = 1.35 + progress * 1.2
        label.material.opacity = 1 - progress
        group.rotation.y += delta * 3
      },
      dispose: () => {
        group.traverse(node => {
          const material = (node as THREE.Mesh).material
          if (material && !Array.isArray(material)) {
            material.dispose()
          }
        })
        const spriteMaterial = label.material as THREE.SpriteMaterial
        spriteMaterial.map?.dispose()
        spriteMaterial.dispose()
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

  /** 화살 일제 사격: 짧은 화살들이 포물선을 그리며 적진에 떨어진다 */
  private spawnArrowVolley(): void {
    const archers = this.playerUnits.filter(unit => unit.troops > 0)
    if (!archers.length || !this.enemyUnits.length) return
    const arrowGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4)
    arrowGeo.rotateX(Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.95 })
    const group = new THREE.Group()
    const arrows: Array<{ mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; delay: number }> = []
    for (let i = 0; i < 14; i += 1) {
      const shooter = archers[i % archers.length]
      const target = this.enemyUnits[i % this.enemyUnits.length]
      const from = shooter.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 1.4, 1.2 + Math.random()))
      const to = target.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.6, 0.2, -0.6 - Math.random() * 1.8))
      const mesh = new THREE.Mesh(arrowGeo, material)
      mesh.visible = false
      group.add(mesh)
      arrows.push({ mesh, from, to, delay: Math.random() * 0.25 })
    }
    const prev = new THREE.Vector3(), cur = new THREE.Vector3()
    const at = (a: typeof arrows[number], k: number, out: THREE.Vector3) => out.lerpVectors(a.from, a.to, k).setY(THREE.MathUtils.lerp(a.from.y, a.to.y, k) + Math.sin(k * Math.PI) * 4.2)
    this.addEffect({
      object: group, age: 0, life: 1.35,
      tick: effect => {
        for (const a of arrows) {
          const k = (effect.age - a.delay) / 1.0
          if (k <= 0 || k >= 1) { a.mesh.visible = false; continue }
          a.mesh.visible = true
          at(a, k, cur); at(a, Math.max(0, k - 0.03), prev)
          a.mesh.position.copy(cur)
          a.mesh.lookAt(cur.clone().add(cur.clone().sub(prev)))
        }
        if (effect.age > 1.05 && effect.age - 0.02 <= 1.05) this.spawnImpact(this.enemyUnits[0].group.position.clone(), 18, 0xf6c56d)
      },
      dispose: () => { arrowGeo.dispose(); material.dispose() },
    })
  }

  private skillColor(general: General): number {
    if (general.id === 'zhou-yu' || general.role === '궁병') return 0xff8a4c
    if (general.id === 'zhuge-liang' || general.role === '책사') return 0x72c9ff
    if (general.id === 'lu-bu') return 0xff4f68
    if (general.id === 'zhao-yun') return 0xf6c56d
    return 0x4cdfff
  }

  private spawnSkillBurst(position: THREE.Vector3, color: number): void {
    const group = new THREE.Group()
    const particles: THREE.Mesh[] = []
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false }))
    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }))
    const rune = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.045, 8, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
    rune.rotation.x = Math.PI / 2
    group.add(core, aura, rune)
    for (let index = 0; index < 18; index += 1) {
      const particle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055 + (index % 3) * 0.025, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
      particle.userData.velocity = new THREE.Vector3(Math.cos(index * 0.52) * (0.7 + (index % 4) * 0.12), 0.35 + (index % 3) * 0.18, Math.sin(index * 0.52) * (0.7 + (index % 4) * 0.12))
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
        const burst = Math.sin(Math.min(progress * 1.35, 1) * Math.PI)
        core.scale.setScalar(0.8 + burst * 2.2)
        core.material.opacity = 0.98 * (1 - progress)
        aura.scale.setScalar(0.8 + burst * 2.8)
        aura.material.opacity = 0.25 * (1 - progress)
        rune.scale.setScalar(0.7 + burst * 2.1)
        rune.rotation.z += 0.12
        rune.material.opacity = 0.88 * (1 - progress)
        particles.forEach(particle => {
          const velocity = particle.userData.velocity as THREE.Vector3
          particle.position.copy(velocity).multiplyScalar(progress * 2.7)
          particle.rotation.x += 0.18
          particle.rotation.y += 0.22
          ;(particle.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - progress)
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

  private spawnSlashWave(general: General, damage: number, skillName = general.skillName): void {
    const color = this.skillColor(general)
    const group = new THREE.Group()
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    for (let index = 0; index < 3; index += 1) {
      const slash = new THREE.Mesh(new THREE.TorusGeometry(1.35 + index * 0.22, 0.12, 8, 32, Math.PI * 0.86), material.clone())
      slash.rotation.set(Math.PI / 2, index * 0.08, index * 0.2 - 0.42)
      slash.position.x = (index - 1) * 1.15
      slash.position.y = 1.45 + index * 0.18
      slash.scale.set(1.05, 1, 0.66)
      group.add(slash)
    }
    const start = new THREE.Vector3(general.role === '궁병' ? 1.5 : 0, 1.1, 5.6)
    const end = new THREE.Vector3(0, 1.2, -8.2)
    group.position.copy(start)
    this.addEffect({
      object: group,
      age: 0,
      life: 1.12,
      tick: effect => {
        const progress = Math.min(effect.age / effect.life, 1)
        group.position.lerpVectors(start, end, progress)
        group.rotation.z += 0.055
        group.scale.setScalar(0.65 + Math.sin(Math.min(progress, 0.5) * Math.PI) * 0.62)
        group.children.forEach(child => ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - Math.max(0, progress - 0.55) / 0.45))
        if (progress > 0.72 && effect.age - 0.016 <= effect.life * 0.72) this.spawnImpact(end, damage, color)
      },
      dispose: () => {
        group.traverse(node => {
          const mesh = node as THREE.Mesh
          mesh.geometry?.dispose()
          const meshMaterial = mesh.material
          if (meshMaterial && !Array.isArray(meshMaterial)) meshMaterial.dispose()
        })
      },
    })
    const signature = this.makeTextSprite(skillName, `#${color.toString(16).padStart(6, '0')}`, 1.55)
    signature.position.set(0, 4.6, -3)
    this.addEffect({
      object: signature,
      age: 0,
      life: 1.55,
      tick: effect => {
        const progress = effect.age / effect.life
        signature.position.y = 4.6 + Math.sin(progress * Math.PI) * 0.55
        signature.scale.setScalar(1.2 + Math.sin(Math.min(progress * 1.5, 1) * Math.PI) * 0.45)
        signature.material.opacity = progress < 0.2 ? progress / 0.2 : 1 - Math.max(0, progress - 0.72) / 0.28
      },
      dispose: () => {
        signature.material.map?.dispose()
        signature.material.dispose()
      },
    })
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
    return chosen.map(general => scaleGeneral({ ...general, level: 1, stars: 1 }, level, stars))
  }

  startBattle(options: { autoPlay?: boolean } = {}): void {
    const deck = this.configuredEnemyDeck?.length ? this.configuredEnemyDeck.map(general => ({ ...general })) : this.normalEnemyDeck()
    this.enemyDeck = deck
    this.enemyUnits.splice(0).forEach(unit => this.scene.remove(unit.group))
    this.core = new BattleCore(this.generals, deck, { mode: this.mode, moraleBonus: this.moraleBonus, research: this.research, autoPilot: options.autoPlay ? { accuracy: 0.85, reaction: [0.6, 1.2] } : null })
    this.battleActive = true
    this.paused = false
    this.startedAt = performance.now()
    this.lastVolley = -1
    this.lastCombatLog = 0
    this.enemyWarning = null
    this.logLines.splice(0)
    this.cameraIntro = 1.35
    this.cameraVictory = 0
    this.cameraShake = 0.12
    deck.forEach((general, index) => {
      const position = new THREE.Vector3(-4.4 + index * 4.4, 0, -8 - index * 0.9)
      const built = this.createUnit(general, ember, position)
      const group = built.group
      group.rotation.y = Math.PI
      const maxTroops = this.core!.enemies[index]?.maxTroops ?? this.troopCapacity(general)
      const status = this.createTroopStatus(ember)
      group.add(status.group)
      this.enemyUnits.push({ group, squad: built.squad.group, model: built.rig.root, general, target: position.clone(), troops: maxTroops, maxTroops, attackTimer: 0, statusGroup: status.group, statusFill: status.fill, hitFlash: 0, hitReact: 0, knockback: new THREE.Vector3(), motionPhase: index * 0.8 + 1.4, motionPulse: 0.7 + index * 0.25, troopType: this.troopType(general), attackMotion: 0, rig: built.rig, squadCtl: built.squad, skillPulse: 0, hero: null, mounted: false })
      this.attachRealModels(this.enemyUnits[this.enemyUnits.length - 1])
      this.scene.add(group)
    })
    this.playerUnits.forEach((unit, index) => {
      const coreUnit = this.core!.players[index]
      unit.maxTroops = coreUnit?.maxTroops ?? unit.maxTroops
      unit.troops = coreUnit?.troops ?? unit.troops
      unit.group.visible = true
      unit.statusFill.scale.x = 1
      unit.target.set(-4.4 + index * 4.4, 0, -2.6 - index * 0.15)
    })
    this.enemyUnits.forEach((unit, index) => unit.target.set(-4.4 + index * 4.4, 0, -5.1 - index * 0.15))
    this.playerUnits.forEach((unit, index) => this.spawnDustCloud(unit.group.position.clone().add(new THREE.Vector3(0, 0, 0.7)), index % 2 ? 0xa4a08a : 0xb68f70))
    this.enemyUnits.forEach((unit, index) => this.spawnDustCloud(unit.group.position.clone().add(new THREE.Vector3(0, 0, -0.7)), index % 2 ? 0xa4a08a : 0xb68f70))
    this.drainCore()
  }

  /** 무장 버튼(탭): 그 무장의 레인으로 기동해 적 예고에 대응한다. */
  commandMove(index: number): void {
    if (!this.battleActive || !this.core || this.paused) return
    this.selectUnit(index)
    const unit = this.playerUnits[index]
    if (unit && unit.troops > 0) {
      const target = new THREE.Vector3(-5 + index * 5, 0, -1 - index * 1.2)
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
    this.syncTroops()
  }

  private handleCoreEvent(event: CoreEvent, core: BattleCore): void {
    switch (event.kind) {
      case 'log':
        this.pushLog(event.text)
        this.callbacks.onEvent(event.text)
        break
      case 'hit': {
        const unit = this.unitAt(event.side, event.lane)
        if (!unit) break
        unit.hitFlash = 0.18
        unit.hitReact = Math.min(1, unit.hitReact + Math.min(0.72, 0.22 + event.amount / 300))
        unit.knockback.add(new THREE.Vector3(unit.group.position.x > 0 ? 0.11 : -0.11, 0, event.side === 'enemy' ? -0.3 : 0.3))
        this.cameraShake = Math.min(0.62, this.cameraShake + (event.amount >= 160 ? 0.18 : 0.06))
        if (event.amount >= 20) this.spawnImpact(unit.group.position.clone(), Math.round(event.amount), event.side === 'enemy' ? jade : ember)
        if (core.t - this.lastCombatLog > 1.6) {
          this.lastCombatLog = core.t
          this.callbacks.onEvent(`${event.source} · ${unit.general.name} 병력 −${Math.round(event.amount)}`)
        }
        break
      }
      case 'attack': { const unit = this.unitAt(event.side, event.lane); if (unit) { unit.attackMotion = 1; unit.hero?.playOnce('Attack') } break }
      case 'heal': { const unit = this.unitAt(event.side, event.lane); if (unit && event.amount >= 20) this.spawnImpact(unit.group.position.clone(), Math.round(event.amount), 0x7be3a2); break }
      case 'skill': {
        const unit = this.unitAt(event.side, event.lane)
        if (!unit) break
        unit.skillPulse = 1
        unit.hero?.playOnce('Skill')
        this.callbacks.onSkillCast?.({ side: event.side, id: unit.general.id, name: unit.general.name, skill: event.name, portraitPath: unit.general.portraitPath })
        if (event.side === 'player') {
          this.spawnSlashWave(unit.general, Math.max(20, event.morale * 10), event.name)
          this.spawnSkillBurst(new THREE.Vector3(0, 1.1, -5.5), this.skillColor(unit.general))
          this.cameraShake = Math.min(0.55, this.cameraShake + 0.22)
        } else {
          this.spawnSkillBurst(unit.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), ember)
          this.cameraShake = Math.min(0.55, this.cameraShake + 0.16)
          this.enemyWarning = null
        }
        break
      }
      case 'enemySkillWarn': {
        const unit = this.unitAt('enemy', event.lane)
        this.enemyWarning = { name: event.name, general: unit?.general.name ?? '적장', until: core.t + BATTLE_RULES.enemySkillWarning + (core.research.enemyWarn ?? 0) + 0.2 }
        break
      }
      case 'answer':
        if (event.success) {
          const enemy = this.unitAt('enemy', Math.max(0, event.lane))
          this.spawnImpact((enemy?.group.position ?? new THREE.Vector3(0, 0, -6)).clone(), 12, jade)
        }
        break
      case 'phase': {
        const closing = event.phase === 1 ? 0.8 : 1.35
        this.playerUnits.forEach((unit, index) => { unit.target.z -= closing + index * 0.08 })
        this.enemyUnits.forEach((unit, index) => { unit.target.z += closing + index * 0.08 })
        this.spawnDustCloud(new THREE.Vector3(0, 0, -3.9), 0xb9a17c)
        this.cameraShake = Math.min(0.48, this.cameraShake + 0.1)
        break
      }
      case 'collapse':
        this.cameraShake = Math.min(0.7, this.cameraShake + 0.35)
        break
      case 'unitDown': { const unit = this.unitAt(event.side, event.lane); if (unit) unit.group.visible = false; break }
      case 'end': {
        this.battleActive = false
        this.enemyWarning = null
        this.cameraVictory = event.result.won ? 1.5 : 0
        this.cameraShake = event.result.won ? 0.22 : 0.1
        if (this.mode === 'normal') this.winStreak = event.result.won ? this.winStreak + 1 : Math.max(-2, Math.min(0, this.winStreak) - 2)
        // 랭킹 서버는 실제 경과 시간보다 긴 기록을 거절한다: 배속과 무관하게 실제 시간을 보낸다.
        this.callbacks.onBattleEnd({ ...event.result, durationMs: Math.round(performance.now() - this.startedAt), mode: this.mode })
        break
      }
      default:
        break
    }
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
      if (unit.troops > 0 && !unit.group.visible) unit.group.visible = true
    })
    sync(this.playerUnits, core.players)
    sync(this.enemyUnits, core.enemies)
  }

  private updateUnitMotion(unit: BattleUnit, delta: number, elapsed: number, color: number): void {
    const distance = unit.group.position.distanceTo(unit.target)
    const moving = this.battleActive && unit.troops > 0 && distance > 0.08
    unit.group.position.lerp(unit.target, Math.min(delta * (1.15 + unit.general.speed / 75), 1))
    unit.group.position.addScaledVector(unit.knockback, delta * 7)
    unit.knockback.multiplyScalar(Math.max(0, 1 - delta * 8))
    unit.hitReact = Math.max(0, unit.hitReact - delta * 3.8)
    unit.attackMotion = Math.max(0, unit.attackMotion - delta * 2.6)
    unit.skillPulse = Math.max(0, unit.skillPulse - delta * 1.1)
    unit.hitFlash = Math.max(0, unit.hitFlash - delta)
    unit.group.position.y = 0
    unit.squadCtl.update(elapsed + unit.motionPhase, moving, unit.attackMotion > 0 ? 1 - unit.attackMotion : 0, unit.hitReact, unit.troops / Math.max(1, unit.maxTroops))
    if (unit.hero) {
      unit.hero.update(delta * (this.paused ? 0 : this.speed), moving, unit.mounted)
      unit.hero.setFlash(unit.hitFlash > 0 ? unit.hitFlash / 0.18 : 0)
    } else animateGeneral(unit.rig, elapsed + unit.motionPhase, moving, unit.attackMotion > 0 ? 1 - unit.attackMotion : 0, unit.skillPulse, unit.hitFlash > 0 ? unit.hitFlash / 0.18 : 0)
    unit.motionPulse -= delta
    if (moving && unit.motionPulse <= 0) {
      unit.motionPulse = 0.72 + (unit.motionPhase % 0.35)
      this.spawnDustCloud(unit.group.position.clone().add(new THREE.Vector3(0, 0, unit.group.rotation.y === 0 ? 1.4 : -1.4)), color === ember ? 0xb68f70 : 0xa4a08a)
    }
  }

  private troopStatus(): BattleTroopStatus[] {
    return [
      ...this.playerUnits.map((unit, index) => ({ side: 'player' as const, index, id: unit.general.id, name: unit.general.name, troops: Math.round(unit.troops), maxTroops: unit.maxTroops, alive: unit.troops > 0 })),
      ...this.enemyUnits.map((unit, index) => ({ side: 'enemy' as const, index, id: unit.general.id, name: unit.general.name, troops: Math.round(unit.troops), maxTroops: unit.maxTroops, alive: unit.troops > 0 })),
    ]
  }

  private difficultyLabel(): string {
    return { normal: '일반 전투', scenario: '시나리오', siege: '공성전', duel: '유저 대련' }[this.mode]
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
      }
    })
    const pattern = open ? { label: open.def.label, lanes: open.def.lanes, kind: open.def.kind, warning: open.def.warning, timeLeft: Math.max(0, open.deadline - elapsed), window: Math.max(0.1, open.deadline - open.at), judged: open.judged } : null
    const enemyPower = this.enemyDeck.reduce((sum, enemy) => sum + enemy.leadership + enemy.martial + enemy.stratagem + enemy.speed + enemy.level * 4, 0)
    const moraleMax = core?.moraleMax ?? BATTLE_RULES.moraleByPhase[0]
    const moraleValue = Math.max(0, core?.morale ?? moraleMax)
    return {
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
      log: this.logLines.slice(-12),
      result: core?.result ?? null,
    }
  }

  private update(delta: number): void {
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
    this.updateCamera(delta)
    if (!this.battleActive || !this.core || this.paused) return
    let remaining = delta * this.speed
    while (remaining > 0 && this.core.active) {
      const step = Math.min(0.05, remaining)
      this.core.tick(step)
      remaining -= step
    }
    this.drainCore()
    if (this.core.t - this.lastVolley > 1.85) {
      this.lastVolley = this.core.t
      this.spawnArrowVolley()
    }
  }

  private updateCamera(delta: number): void {
    this.cameraIntro = Math.max(0, this.cameraIntro - delta)
    this.cameraVictory = Math.max(0, this.cameraVictory - delta)
    this.cameraShake = Math.max(0, this.cameraShake - delta * 1.8)
    const introOffset = this.cameraIntro > 0 ? (this.cameraIntro / 1.35) * 3.8 : 0
    const victoryOffset = this.cameraVictory > 0 ? (1 - this.cameraVictory / 1.5) * 2.8 : 0
    const shake = this.cameraShake
    const living = [...this.playerUnits, ...this.enemyUnits].filter(unit => unit.troops > 0)
    const frontZ = living.length ? living.reduce((sum, unit) => sum + unit.group.position.z, 0) / living.length : this.cameraLookAt.z
    const selected = this.playerUnits[this.selectedUnit]
    const focusX = this.battleActive && selected ? selected.group.position.x * 0.12 : 0
    const focusZ = this.battleActive ? Math.max(-4.5, Math.min(2.5, frontZ * 0.18 - 2.2)) : this.cameraLookAt.z
    // 세로 화면(휴대폰)은 가로 시야가 좁으니 카메라를 뒤로 물려 세 레인이 모두 보이게 한다
    const aspect = this.camera.aspect || 1
    const pull = aspect < 0.8 ? 1.75 : aspect < 1.25 ? 1.3 : 1
    this.camera.position.set(
      this.cameraLookAt.x + (this.cameraBase.x - this.cameraLookAt.x) * pull + focusX + (Math.random() - 0.5) * shake,
      this.cameraLookAt.y + (this.cameraBase.y - this.cameraLookAt.y) * pull + (Math.random() - 0.5) * shake * 0.55,
      this.cameraLookAt.z + (this.cameraBase.z - this.cameraLookAt.z) * pull + introOffset + victoryOffset + (this.battleActive ? frontZ * 0.06 : 0),
    )
    this.camera.lookAt(this.cameraLookAt.x + focusX, this.cameraLookAt.y + (this.cameraVictory > 0 ? 1.2 : 0), focusZ)
  }

  private animate = (): void => {
    if (this.disposed) return
    requestAnimationFrame(this.animate)
    this.clock.update()
    const delta = Math.min(this.clock.getDelta(), 0.05)
    this.update(delta)
    this.environment.update(this.clock.getElapsed(), delta)
    if (this.composer) this.composer.render(delta)
    else this.renderer.render(this.scene, this.camera)
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
