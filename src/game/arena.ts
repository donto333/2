import * as THREE from 'three'
import { allGenerals, skillPower, skillRank, type General } from './strategy'
import { BATTLE_PATTERNS, phaseName, resolveBattleTactic, resolveTactic, type BattleTactic } from './battle-rules'
import { effectDefinition, effectLoadout, hasBattleEffect, type ActiveBattleEffect, type BattleEffectId } from './battle-effects'

export interface BattleSnapshot {
  active: boolean
  elapsed: number
  morale: number
  phase: number
  phaseName: string
  enemyPattern: string
  enemyPatternLane: number
  combo: number
  threat: number
  tacticGauge: number
  guardActive: boolean
  selectedUnit: number
  selectedName: string
  selectedRole: General['role'] | '—'
  selectedLevel: number
  selectedStats: { leadership: number; martial: number; stratagem: number; speed: number } | null
  skillName: string
  skillDescription: string
  skillUnlocked: boolean
  skillReady: boolean
  skillCooldown: number
  activeEffects: ActiveBattleEffect[]
  opponentDeck: BattleOpponent[]
  troopStatus: BattleTroopStatus[]
  difficulty: string
  difficultyMultiplier: number
  duelMode: boolean
  enemyPower: number
  status: string
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

export interface ArenaCallbacks {
  onEvent: (message: string) => void
  onBattleEnd: (result: { won: boolean; score: number; durationMs: number }) => void
}

interface BattleUnit {
  group: THREE.Group
  model: THREE.Group
  general: General
  target: THREE.Vector3
  troops: number
  maxTroops: number
  attackTimer: number
  statusGroup: THREE.Group
  statusFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  hitFlash: number
  knockback: THREE.Vector3
}

interface ArenaEffect {
  object: THREE.Object3D
  age: number
  life: number
  tick: (effect: ArenaEffect, delta: number) => void
  dispose: () => void
}

const WORLD_SIZE = 42
const jade = 0x52e0c4
const ember = 0xff8066
export class Arena {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 160)
  private readonly clock = new THREE.Timer()
  private readonly callbacks: ArenaCallbacks
  private readonly playerUnits: BattleUnit[] = []
  private readonly enemyUnits: BattleUnit[] = []
  private selectionRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null
  private commandMarker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null
  private battleActive = false
  private battleElapsed = 0
  private enemyMorale = 100
  private battlePhase = 0
  private combo = 0
  private comboTimer = 0
  private threat = 0
  private tacticGauge = 0
  private guardTimer = 0
  private nextCommandAt = 0
  private patternIndex = 0
  private nextPatternAt = 0
  private selectedUnit = 0
  private skillCooldown = 0
  private lastPulse = 0
  private lastVolley = -1
  private disposed = false
  private generals: General[] = []
  private enemyDeck: General[] = []
  private configuredEnemyDeck: General[] | null = null
  private duelMode = false
  private difficultyMultiplier = 0.86
  private lastCombatPulse = 0
  private readonly effects: ArenaEffect[] = []
  private readonly activeBuffs: ActiveBattleEffect[] = []
  private readonly activeDebuffs: ActiveBattleEffect[] = []
  private readonly cameraBase = new THREE.Vector3(0, 22, 29)
  private readonly cameraLookAt = new THREE.Vector3(0, 0, -3)
  private cameraShake = 0
  private cameraIntro = 0
  private cameraVictory = 0

  constructor(canvas: HTMLCanvasElement, callbacks: ArenaCallbacks) {
    this.callbacks = callbacks
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.scene.background = new THREE.Color(0x0b1518)
    this.scene.fog = new THREE.FogExp2(0x18262a, 0.019)
    this.camera.position.copy(this.cameraBase)
    this.camera.lookAt(this.cameraLookAt)
    this.buildLighting()
    this.buildBackdrop()
    this.buildTerrain()
    this.buildGateRuins()
    this.buildAtmosphere()
    window.addEventListener('resize', this.resize)
    this.resize()
    this.animate()
  }

  private buildLighting(): void {
    const sky = new THREE.HemisphereLight(0x9bb7b3, 0x151313, 2.15)
    this.scene.add(sky)
    const sun = new THREE.DirectionalLight(0xffd7a0, 5.2)
    sun.position.set(-14, 28, 12)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -30
    sun.shadow.camera.right = 30
    sun.shadow.camera.top = 30
    sun.shadow.camera.bottom = -30
    this.scene.add(sun)
    const rim = new THREE.PointLight(jade, 9, 34, 2)
    rim.position.set(12, 5, -10)
    this.scene.add(rim)
    const warm = new THREE.PointLight(ember, 12, 28, 2)
    warm.position.set(-16, 3, 8)
    this.scene.add(warm)
  }

  private buildBackdrop(): void {
    const loader = new THREE.TextureLoader()
    loader.load('/assets/battlefield/huanghun-gate.webp', texture => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8)
      const backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(128, 86),
        new THREE.MeshBasicMaterial({ map: texture, fog: false, depthWrite: false }),
      )
      backdrop.position.set(0, 14, -43)
      backdrop.renderOrder = -10
      this.scene.add(backdrop)
    })
  }

  private buildTerrain(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 48, 48),
      new THREE.MeshStandardMaterial({ color: 0x40544d, roughness: 0.96, metalness: 0.01, transparent: true, opacity: 0.76 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    const grid = new THREE.GridHelper(WORLD_SIZE, 14, 0x74aa98, 0x34584f)
    grid.position.y = 0.012
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
    gridMaterials.forEach(material => { material.transparent = true; material.opacity = 0.035 })
    this.scene.add(grid)

    const pathShape = new THREE.Shape()
    pathShape.moveTo(-3.6, 18)
    pathShape.lineTo(-2.7, 11)
    pathShape.lineTo(-4.1, 4)
    pathShape.lineTo(-2.8, -4)
    pathShape.lineTo(-3.4, -18)
    pathShape.lineTo(3.4, -18)
    pathShape.lineTo(2.8, -4)
    pathShape.lineTo(4.1, 4)
    pathShape.lineTo(2.7, 11)
    pathShape.lineTo(3.6, 18)
    const path = new THREE.Mesh(
      new THREE.ShapeGeometry(pathShape),
      new THREE.MeshStandardMaterial({ color: 0x74604d, roughness: 0.94, metalness: 0, transparent: true, opacity: 0.48 }),
    )
    path.rotation.x = -Math.PI / 2
    path.rotation.z = 0.08
    path.position.set(0, 0.018, -1)
    path.receiveShadow = true
    this.scene.add(path)

    const stones = [[-12, -13, 0.8], [11, -11, 1.05], [-15, -3, 0.7], [14, 1, 1.2], [-12, 10, 1.1], [12, 14, 0.72]] as const
    stones.forEach(([x, z, size], index) => {
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 1), new THREE.MeshStandardMaterial({ color: index % 2 ? 0x34433f : 0x3d4a44, roughness: 0.86, metalness: 0.02 }))
      stone.position.set(x, size * 0.58, z)
      stone.scale.y = 0.7
      stone.rotation.set(0.1 * index, 0.55 * index, 0.18 * index)
      stone.castShadow = true
      this.scene.add(stone)
    })
  }

  private buildGateRuins(): void {
    const basalt = new THREE.MeshStandardMaterial({ color: 0x1d2c2d, roughness: 0.94, metalness: 0.08 })
    const pillarGeometry = new THREE.CylinderGeometry(0.72, 1.05, 5.8, 7)
    for (const x of [-11, 11]) {
      const pillar = new THREE.Mesh(pillarGeometry, basalt)
      pillar.position.set(x, 2.9, -18)
      pillar.rotation.z = x < 0 ? -0.025 : 0.025
      pillar.castShadow = true
      this.scene.add(pillar)
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(23, 0.72, 0.86), basalt)
    lintel.position.set(0, 5.55, -18)
    lintel.castShadow = true
    this.scene.add(lintel)
  }

  private buildAtmosphere(): void {
    const dust = new THREE.Group()
    const material = new THREE.MeshBasicMaterial({ color: 0xb8d9ce, transparent: true, opacity: 0.14 })
    for (let index = 0; index < 85; index += 1) {
      const mote = new THREE.Mesh(new THREE.SphereGeometry(0.025 + (index % 4) * 0.012, 5, 5), material)
      mote.position.set(((index * 17) % 40) - 20, 1.2 + ((index * 11) % 110) / 24, ((index * 23) % 38) - 19)
      dust.add(mote)
    }
    this.scene.add(dust)

    for (let index = 0; index < 3; index += 1) {
      const banner = new THREE.Group()
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.2, 8), new THREE.MeshStandardMaterial({ color: 0xc6a56d, metalness: 0.5, roughness: 0.45 }))
      pole.position.y = 2.1
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.9, 4, 4), new THREE.MeshStandardMaterial({ color: index === 1 ? 0x6d2830 : 0x143d3b, side: THREE.DoubleSide, roughness: 0.9 }))
      cloth.position.set(0.65, 3.45, 0)
      cloth.rotation.y = -0.08
      banner.add(pole, cloth)
      banner.position.set(-13 + index * 13, 0, -9 + (index % 2) * 3)
      banner.rotation.y = index % 2 ? -0.2 : 0.14
      this.scene.add(banner)
    }
  }

  private troopCapacity(general: General): number {
    return Math.round(620 + general.leadership * 6 + general.defense * 3 + general.level * 24 + general.grade * 70)
  }

  setGenerals(generals: General[]): void {
    this.generals = generals.map(general => ({ ...general }))
    this.clearUnits()
    const positions = [new THREE.Vector3(-4.2, 0, 6), new THREE.Vector3(0, 0, 7.4), new THREE.Vector3(4.2, 0, 6)]
    this.generals.forEach((general, index) => {
      const group = this.createUnit(general, jade, positions[index] ?? positions[0])
      const model = group.userData.model as THREE.Group
      const maxTroops = this.troopCapacity(general)
      const status = this.createTroopStatus(jade)
      group.add(status.group)
      const unit: BattleUnit = { group, model, general, target: positions[index] ?? positions[0].clone(), troops: maxTroops, maxTroops, attackTimer: 0.45 + index * 0.16, statusGroup: status.group, statusFill: status.fill, hitFlash: 0, knockback: new THREE.Vector3() }
      this.playerUnits.push(unit)
      this.scene.add(group)
    })
    this.selectUnit(0)
  }

  setOpponentDeck(generals: General[] | null): void {
    this.configuredEnemyDeck = generals?.slice(0, 3).map(general => ({ ...general })) ?? null
    this.duelMode = Boolean(this.configuredEnemyDeck?.length)
  }
  isDuelBattle(): boolean {
    return this.duelMode
  }

  stopBattle(): void {
    this.battleActive = false
    this.enemyUnits.splice(0).forEach(unit => this.scene.remove(unit.group))
    this.enemyDeck = []
    this.configuredEnemyDeck = null
    this.duelMode = false
  }

  private createUnit(general: General, teamColor: number, position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group()
    group.position.copy(position)
    group.userData.baseY = 0
    const mounted = general.role === '기병'
    const bannerColor = teamColor === ember ? 0x8e3340 : general.accent
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.75), new THREE.MeshStandardMaterial({ color: bannerColor, side: THREE.DoubleSide, roughness: 0.8 }))
    banner.position.set(-0.38, mounted ? 2.35 : 2.15, 0)
    banner.rotation.y = Math.PI / 2
    const model = this.createGeneralModel(general, teamColor)
    group.userData.model = model
    group.add(this.createSquad(teamColor, mounted), model, banner)
    return group
  }

  private createGeneralModel(general: General, teamColor: number): THREE.Group {
    const model = new THREE.Group()
    model.name = `model-${general.id}`
    const procedural = new THREE.Group()
    model.add(procedural)
    const seed = [...general.id].reduce((sum, character) => sum + character.charCodeAt(0), 0)
    const accent = new THREE.Color(general.accent)
    const team = new THREE.Color(teamColor)
    const armorColor = accent.clone().lerp(team, 0.28)
    const darkColor = armorColor.clone().multiplyScalar(0.38)
    const metal = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.58, metalness: 0.5 })
    const darkMetal = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.72, metalness: 0.32 })
    const skin = new THREE.MeshStandardMaterial({ color: 0xc78e74, roughness: 0.9 })
    const trim = new THREE.MeshStandardMaterial({ color: 0xd8b574, roughness: 0.42, metalness: 0.62 })
    const weapon = new THREE.Group()
    weapon.name = 'signature-weapon'

    if (general.role === '기병') {
      const horse = new THREE.Mesh(new THREE.SphereGeometry(0.64, 12, 8), darkMetal)
      horse.scale.set(1.35, 0.64, 1.28)
      horse.position.set(0, 0.55, 0.28)
      procedural.add(horse)
      for (const x of [-0.38, 0.38]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.62, 6), darkMetal)
        leg.position.set(x, 0.25, 0.28)
        procedural.add(leg)
      }
      const mane = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.78, 7), metal)
      mane.rotation.z = Math.PI / 2
      mane.position.set(-0.6, 0.86, 0.25)
      procedural.add(mane)
    }

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 0.86, 8), metal)
    torso.position.y = general.role === '기병' ? 1.25 : 0.86
    torso.scale.x = 0.82 + (seed % 3) * 0.08
    torso.castShadow = true
    procedural.add(torso)
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.17, 0.38), darkMetal)
    shoulder.position.y = torso.position.y + 0.26
    shoulder.castShadow = true
    procedural.add(shoulder)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 8), skin)
    head.position.y = torso.position.y + 0.78
    head.castShadow = true
    procedural.add(head)
    const helmet = new THREE.Mesh(new THREE.ConeGeometry(0.39, 0.34 + (seed % 2) * 0.08, 8), metal)
    helmet.position.y = head.position.y + 0.29
    helmet.castShadow = true
    procedural.add(helmet)
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 6), trim)
    plume.position.set((seed % 2 ? 0.08 : -0.08), helmet.position.y + 0.3, 0)
    plume.rotation.z = seed % 2 ? -0.18 : 0.18
    procedural.add(plume)
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.64, 6), darkMetal)
    const armR = armL.clone()
    armL.position.set(-0.46, torso.position.y + 0.02, 0)
    armR.position.set(0.46, torso.position.y + 0.02, 0)
    armL.rotation.z = 0.18
    armR.rotation.z = -0.18
    procedural.add(armL, armR)

    if (general.role === '궁병') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 18, Math.PI * 1.55), trim)
      bow.position.set(-0.47, torso.position.y + 0.22, -0.15)
      bow.rotation.y = Math.PI / 2
      weapon.add(bow)
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.72, 5), trim)
      string.position.set(-0.47, torso.position.y + 0.22, -0.14)
      string.rotation.z = Math.PI / 2
      weapon.add(string)
    } else if (general.role === '책사') {
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.8, 7), trim)
      staff.position.set(0.52, torso.position.y - 0.04, 0)
      staff.rotation.z = -0.08
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.7, metalness: 0.35, roughness: 0.32 }))
      orb.position.set(0.45, torso.position.y + 0.86, 0)
      weapon.add(staff, orb)
    } else {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(general.role === '기병' ? 0.11 : 0.14, general.role === '기병' ? 1.9 : 1.35, 0.07), trim)
      blade.position.set(0.58, torso.position.y + 0.18, -0.02)
      blade.rotation.z = general.role === '기병' ? -0.16 : -0.28
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.1), trim)
      guard.position.set(0.58, torso.position.y - 0.4, -0.02)
      guard.rotation.z = blade.rotation.z
      weapon.add(blade, guard)
    }
    weapon.userData.motionPhase = (seed % 17) / 17
    model.userData.weapon = weapon
    procedural.add(weapon)
    model.scale.setScalar(general.role === '기병' ? 1.1 : 1.02 + (seed % 3) * 0.04)

    // Realistic AI portrait rendered as a 3D-facing commander card. The procedural
    // silhouette remains as a resilient fallback until the optimized WebP arrives.
    const portraitMaterial = new THREE.MeshBasicMaterial({ color: 0x263b3a, side: THREE.DoubleSide, fog: false })
    const portrait = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.54), portraitMaterial)
    portrait.position.set(0, general.role === '기병' ? 1.5 : 1.28, -0.12)
    portrait.renderOrder = 3
    portrait.visible = false
    model.add(portrait)
    const portraitLoader = new THREE.TextureLoader()
    portraitLoader.load(`/assets/generals-realistic-webp/${general.id}.webp`, texture => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 1
      portrait.material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, fog: false, toneMapped: false })
      portrait.visible = true
      procedural.visible = false
    }, undefined, () => {
      portrait.visible = false
    })
    return model
  }

  private createSquad(teamColor: number, mounted: boolean): THREE.Group {
    const squad = new THREE.Group()
    const body = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.78, metalness: 0.08 })
    const trim = new THREE.MeshStandardMaterial({ color: teamColor === ember ? 0x8e3340 : 0xc8e8d8, roughness: 0.66, metalness: 0.2 })
    for (let index = 0; index < 5; index += 1) {
      const soldier = new THREE.Group()
      const column = index % 3
      const row = Math.floor(index / 3)
      soldier.position.set((column - 1) * 0.72, 0, 0.7 + row * 0.7)
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(mounted ? 0.15 : 0.13, mounted ? 0.19 : 0.16, mounted ? 0.72 : 0.58, 6), body)
      torso.position.y = mounted ? 0.58 : 0.39
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), trim)
      head.position.y = mounted ? 1.04 : 0.82
      soldier.add(torso, head)
      if (!mounted) {
        const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.05, 5), trim)
        spear.position.set(0.2, 0.86, -0.04)
        spear.rotation.z = -0.2
        soldier.add(spear)
      }
      squad.add(soldier)
    }
    squad.scale.setScalar(mounted ? 0.86 : 0.92)
    return squad
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
    group.position.set(0, 3.15, 0)
    group.renderOrder = 8
    const background = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.11), new THREE.MeshBasicMaterial({ color: 0x101719, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false }))
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
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.72, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
    flash.position.y = 0.7
    group.add(ring, flash)
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
        ring.scale.setScalar(1 + progress * 2.2)
        ring.material.opacity = 0.9 * (1 - progress)
        flash.scale.setScalar(1 + progress * 2.5)
        flash.material.opacity = 0.9 * (1 - progress)
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

  private spawnArrowVolley(): void {
    for (let index = 0; index < 3; index += 1) {
      const start = new THREE.Vector3((index - 1) * 4.2, 2.2 + index * 0.25, 6.2)
      const end = new THREE.Vector3((index - 1) * 3.6, 0.9, -8.2 - index * 0.7)
      const group = new THREE.Group()
      const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xf5f3dc, transparent: true, opacity: 0.84, blending: THREE.AdditiveBlending }))
      trail.scale.z = start.distanceTo(end)
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 5), new THREE.MeshBasicMaterial({ color: 0xf6c56d, blending: THREE.AdditiveBlending }))
      head.rotation.x = -Math.PI / 2
      head.position.z = -0.23
      group.add(trail, head)
      group.position.copy(start)
      group.lookAt(end)
      this.addEffect({
        object: group,
        age: 0,
        life: 0.95,
        tick: effect => {
          const progress = Math.min(effect.age / effect.life, 1)
          group.position.lerpVectors(start, end, progress)
          group.scale.setScalar(1 - progress * 0.18)
          trail.material.opacity = 0.84 * (1 - progress * 0.5)
          if (progress > 0.92 && effect.age - 0.016 <= effect.life * 0.92) this.spawnImpact(end, 18, 0xf6c56d)
        },
        dispose: () => {
          trail.geometry.dispose()
          trail.material.dispose()
          head.geometry.dispose()
          head.material.dispose()
        },
      })
    }
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
    for (let index = 0; index < 12; index += 1) {
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
        particles.forEach(particle => {
          const velocity = particle.userData.velocity as THREE.Vector3
          particle.position.copy(velocity).multiplyScalar(progress * 2.2)
          particle.rotation.x += 0.12
          particle.rotation.y += 0.16
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

  private spawnSlashWave(general: General, damage: number): void {
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
    const signature = this.makeTextSprite(general.skillName, `#${color.toString(16).padStart(6, '0')}`, 1.55)
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

  startBattle(): void {
    this.battleActive = true
    this.battleElapsed = 0
    this.enemyMorale = 100
    this.battlePhase = 0
    this.combo = 0
    this.comboTimer = 0
    this.threat = 0
    this.tacticGauge = 0
    this.guardTimer = 0
    this.nextCommandAt = 0
    this.patternIndex = 0
    this.nextPatternAt = 2.8
    this.skillCooldown = 0
    this.lastPulse = 0
    this.lastVolley = -1
    this.lastCombatPulse = 0
    this.cameraIntro = 1.35
    this.cameraVictory = 0
    this.cameraShake = 0.12
    this.difficultyMultiplier = this.duelMode ? 1 : 0.86
    this.activeBuffs.splice(0)
    this.activeDebuffs.splice(0)
    this.enemyUnits.splice(0).forEach(unit => this.scene.remove(unit.group))
    if (this.configuredEnemyDeck?.length === 3) {
      this.enemyDeck = this.configuredEnemyDeck.map(general => ({ ...general }))
    } else {
      const playerIds = new Set(this.generals.map(general => general.id))
      const pool = allGenerals().filter(general => !playerIds.has(general.id))
      const shuffled = pool.sort(() => Math.random() - 0.5)
      const chosen: General[] = []
      for (const general of shuffled) {
        if (chosen.length === 3) break
        if (chosen.length < 2 && chosen.some(item => item.role === general.role)) continue
        chosen.push(general)
      }
      this.enemyDeck = chosen.length === 3 ? chosen : shuffled.slice(0, 3)
    }
    this.enemyDeck.forEach((general, index) => {
      const position = new THREE.Vector3(-4.4 + index * 4.4, 0, -8 - index * 0.9)
      const group = this.createUnit(general, ember, position)
      group.rotation.y = Math.PI
      const model = group.userData.model as THREE.Group
      const maxTroops = this.troopCapacity(general)
      const status = this.createTroopStatus(ember)
      group.add(status.group)
      this.enemyUnits.push({ group, model, general, target: position.clone(), troops: maxTroops, maxTroops, attackTimer: 0.8 + index * 0.15, statusGroup: status.group, statusFill: status.fill, hitFlash: 0, knockback: new THREE.Vector3() })
      this.scene.add(group)
    })
    this.callbacks.onEvent(`작전 개시 · 무장 덱 ${this.enemyDeck.map(general => general.name).join(' · ')} · ${BATTLE_PATTERNS[0].warning}`)
  }

  commandMove(index: number): void {
    if (!this.battleActive) return
    if (this.battleElapsed < this.nextCommandAt) return
    const unit = this.playerUnits[index]
    if (!unit || unit.troops <= 0) return
    const target = new THREE.Vector3(-5 + index * 5, 0, -1 - index * 1.2)
    unit.target.copy(target)
    this.selectUnit(index)
    if (!this.commandMarker) {
      this.commandMarker = this.createMarker(0xf6c56d)
      this.scene.add(this.commandMarker)
    }
    this.commandMarker.position.set(target.x, 0.05, target.z)
    const pattern = BATTLE_PATTERNS[this.patternIndex]
    if (!pattern) return
    const result = resolveTactic(index, pattern.lane, this.combo, this.threat)
    this.nextCommandAt = this.battleElapsed + 0.42
    this.combo = result.combo
    const rawThreatDelta = result.threat - this.threat
    const threatMultiplier = rawThreatDelta > 0
      ? (hasBattleEffect(this.activeBuffs, 'jade-command') ? 0.65 : 1)
        * (hasBattleEffect(this.activeBuffs, 'phoenix-guard') ? 0.75 : 1)
        * (hasBattleEffect(this.activeDebuffs, 'confusion') ? 0.65 : 1)
        * (hasBattleEffect(this.activeDebuffs, 'blind') ? 0.8 : 1)
      : 1
    this.threat = Math.max(0, Math.min(100, this.threat + rawThreatDelta * threatMultiplier))
    if (result.success) {
      const gaugeGain = 24 * (hasBattleEffect(this.activeBuffs, 'war-chant') ? 1.25 : 1)
      this.tacticGauge = Math.min(100, this.tacticGauge + gaugeGain)
    }
    this.comboTimer = result.success ? 4.2 + (hasBattleEffect(this.activeBuffs, 'chain-fury') ? 1.5 : 0) : 0
    if (result.success) {
      this.enemyMorale = Math.max(0, this.enemyMorale - result.moraleDamage)
      this.dealTroopDamageToEnemy(result.moraleDamage * 2, `${unit.general.name}의 ${pattern.label}`, jade)
      this.spawnImpact(new THREE.Vector3(target.x, 0, target.z - 2), result.moraleDamage, jade)
      this.callbacks.onEvent(`${unit.general.name} · ${pattern.label} 파훼 성공 · 연계 ${this.combo} · 적 사기 -${result.moraleDamage}`)
    } else {
      this.callbacks.onEvent(`${unit.general.name} · ${pattern.label}에 노출 · 위협도 ${Math.round(this.threat)}%`)
    }
  }

  useTactic(tactic: BattleTactic): void {
    if (!this.battleActive) return
    const result = resolveBattleTactic(tactic, this.tacticGauge, this.combo, this.threat)
    if (!result.ok) {
      this.callbacks.onEvent('전술 게이지가 부족합니다. 적 패턴을 파훼해 게이지를 충전하십시오.')
      return
    }
    this.tacticGauge = result.gauge
    this.combo = result.combo
    this.threat = result.threat
    this.guardTimer = result.guardDuration
    if (tactic === 'guard') {
      this.callbacks.onEvent('철벽 태세 · 4.5초 동안 위협도 상승을 억제합니다.')
      return
    }
    this.enemyMorale = Math.max(0, this.enemyMorale - result.moraleDamage)
    if (result.moraleDamage > 0) this.dealTroopDamageToEnemy(result.moraleDamage * 2, tactic === 'feint' ? '유인책' : '전군 돌격', tactic === 'feint' ? jade : ember)
    this.spawnImpact(new THREE.Vector3(0, 0, -6), result.moraleDamage, tactic === 'feint' ? jade : ember)
    this.callbacks.onEvent(tactic === 'feint'
      ? `유인책 성공 · 적 전열을 끌어냈습니다 · 연계 ${this.combo} · 적 사기 -${result.moraleDamage}`
      : `전군 돌격 · 연계를 불태워 적을 압박합니다 · 적 사기 -${result.moraleDamage}`)
  }

  castSkill(): void {
    if (!this.battleActive) return
    const unit = this.playerUnits[this.selectedUnit]
    if (!unit || unit.troops <= 0 || !unit.general.skillUnlocked) {
      this.callbacks.onEvent('아직 해금되지 않은 장수 스킬입니다.')
      return
    }
    if (this.skillCooldown > 0) {
      this.callbacks.onEvent(`${unit.general.name}의 스킬 재사용 대기 · ${this.skillCooldown.toFixed(1)}초`)
      return
    }
    const impact = this.skillImpact(unit.general)
    const loadout = effectLoadout(unit.general.id, unit.general.role)
    this.applyEffect('buff', loadout.buff)
    this.applyEffect('debuff', loadout.debuff)
    const comboBonus = 1 + Math.min(this.combo, 8) * (hasBattleEffect(this.activeBuffs, 'chain-fury') ? 0.088 : 0.08)
    const damageMultiplier = (hasBattleEffect(this.activeBuffs, 'dragon-might') ? 1.18 : 1)
      * (hasBattleEffect(this.activeBuffs, 'chain-fury') ? 1.1 : 1)
      * (hasBattleEffect(this.activeDebuffs, 'armor-break') ? 1.22 : 1)
      * (hasBattleEffect(this.activeDebuffs, 'mark') ? 1.12 : 1)
    const flatDamage = hasBattleEffect(this.activeBuffs, 'hawk-eye') ? 8 : 0
    const amplifiedDamage = Math.round((impact.moraleDamage + flatDamage) * comboBonus * damageMultiplier)
    const consumedCombo = this.combo
    this.enemyMorale = Math.max(0, this.enemyMorale - amplifiedDamage)
    this.dealTroopDamageToEnemy(amplifiedDamage * 3, unit.general.skillName, jade)
    this.skillCooldown = Math.max(2, impact.cooldown
      * (hasBattleEffect(this.activeBuffs, 'swift-step') ? 0.8 : 1)
      - (hasBattleEffect(this.activeBuffs, 'battle-focus') ? 1.5 : 0))
    this.combo = 0
    this.comboTimer = 0
    this.spawnSlashWave(unit.general, amplifiedDamage * 10)
    this.spawnSkillBurst(new THREE.Vector3(0, 1.1, -5.5), this.skillColor(unit.general))
    this.cameraShake = Math.min(0.55, this.cameraShake + 0.22)
    this.callbacks.onEvent(`${unit.general.name} · ${unit.general.skillName} 발동 · ${impact.message} · ${effectDefinition(loadout.buff).name} + ${effectDefinition(loadout.debuff).name} · ${consumedCombo ? `${consumedCombo}연계 증폭 · ` : ''}적 사기 -${amplifiedDamage}`)
  }

  private applyEffect(kind: 'buff' | 'debuff', id: BattleEffectId): void {
    const collection = kind === 'buff' ? this.activeBuffs : this.activeDebuffs
    const definition = effectDefinition(id)
    const existing = collection.find(effect => effect.id === id)
    if (existing) {
      existing.remaining = definition.duration
      existing.stacks = Math.min(2, existing.stacks + 1)
      return
    }
    collection.push({ ...definition, remaining: definition.duration, stacks: 1 })
  }

  private skillImpact(general: General): { moraleDamage: number; cooldown: number; message: string } {
    const martial = general.martial
    const leadership = general.leadership
    const stratagem = general.stratagem
    const speed = general.speed
    let moraleDamage = 12
    let message = `적 사기 -${moraleDamage}`
    switch (general.id) {
      case 'guan-yu':
        moraleDamage = 18 + Math.round(martial * 0.1)
        message = `무력 관통 · 적 사기 -${moraleDamage}`
        break
      case 'zhao-yun':
        moraleDamage = 13 + Math.round(speed * 0.08)
        message = `속도 돌파 · 적 사기 -${moraleDamage}`
        break
      case 'zhuge-liang':
        moraleDamage = 20 + Math.round(stratagem * 0.12)
        message = `모략 진형 · 적 사기 -${moraleDamage}`
        break
      case 'lu-bu':
        moraleDamage = 25 + Math.round(martial * 0.14)
        message = `무쌍 충격 · 적 사기 -${moraleDamage}`
        break
      case 'zhou-yu':
        moraleDamage = 22 + Math.round(stratagem * 0.11)
        message = `화공 확산 · 적 사기 -${moraleDamage}`
        break
      default:
        if (general.role === '책사') {
          moraleDamage = 14 + Math.round(stratagem * 0.09)
          message = `책략 교란 · 적 사기 -${moraleDamage}`
        } else if (general.role === '기병') {
          moraleDamage = 13 + Math.round(speed * 0.08)
          message = `기동 충격 · 적 사기 -${moraleDamage}`
        } else if (general.role === '궁병') {
          moraleDamage = 13 + Math.round(martial * 0.08)
          message = `정밀 사격 · 적 사기 -${moraleDamage}`
        } else {
          moraleDamage = 12 + Math.round(leadership * 0.08)
          message = `전열 압박 · 적 사기 -${moraleDamage}`
        }
    }
    const rankMultiplier = 1 + (skillRank(general) - 1) * 0.1
    const powerMultiplier = skillPower(general) / 100
    moraleDamage = Math.round(moraleDamage * rankMultiplier * powerMultiplier)
    const cooldown = Math.max(4, 12 - speed * 0.05 - (skillRank(general) - 1) * 0.45)
    return { moraleDamage, cooldown, message: `${message} · ${skillRank(general)}단계 위력` }
  }

  private announcePattern(): void {
    this.patternIndex = (this.patternIndex + 1) % BATTLE_PATTERNS.length
    this.nextPatternAt = this.battleElapsed + 3.6
    const pattern = BATTLE_PATTERNS[this.patternIndex]
    this.callbacks.onEvent(`적 전술 예고 · ${pattern.warning}`)
  }

  private dealTroopDamage(target: BattleUnit, amount: number, source: string, color: number): void {
    if (target.troops <= 0) return
    const damage = Math.max(1, Math.round(amount))
    target.troops = Math.max(0, target.troops - damage)
    target.hitFlash = 0.18
    target.knockback.add(new THREE.Vector3(target.group.position.x > 0 ? 0.08 : -0.08, 0, target.group.position.z > 0 ? 0.18 : -0.18))
    this.cameraShake = Math.min(0.42, this.cameraShake + (damage >= 80 ? 0.16 : 0.06))
    target.statusFill.scale.x = Math.max(0.001, target.troops / target.maxTroops)
    if (target.troops === 0) {
      target.group.visible = false
      this.callbacks.onEvent(`${target.general.name}의 병력이 전멸했습니다.`)
    }
    this.spawnImpact(target.group.position.clone(), damage, color)
    if (this.battleElapsed - this.lastCombatPulse > 1.1) {
      this.lastCombatPulse = this.battleElapsed
      this.callbacks.onEvent(`${source} · ${target.general.name} 병력 -${damage} · 잔여 ${target.troops}/${target.maxTroops}`)
    }
  }

  private dealTroopDamageToEnemy(amount: number, source: string, color: number): void {
    const target = this.enemyUnits.find(unit => unit.troops > 0)
    if (target) this.dealTroopDamage(target, amount, source, color)
  }

  private autoCombat(delta: number): void {
    const attack = (attacker: BattleUnit, defenders: BattleUnit[], enemySide: boolean): void => {
      if (attacker.troops <= 0) return
      attacker.attackTimer -= delta
      if (attacker.attackTimer > 0) return
      const target = defenders.find(unit => unit.troops > 0)
      if (!target) return
      const baseDamage = 20 + attacker.general.attack * 0.34 + attacker.general.martial * 0.24 + attacker.general.leadership * 0.1
      const damage = baseDamage * (enemySide ? this.difficultyMultiplier : 1)
      attacker.attackTimer = Math.max(0.72, 1.85 - attacker.general.speed * 0.008)
      this.dealTroopDamage(target, damage, attacker.general.name, enemySide ? ember : jade)
    }
    this.playerUnits.forEach(unit => attack(unit, this.enemyUnits, false))
    this.enemyUnits.forEach(unit => attack(unit, this.playerUnits, true))
  }

  private troopStatus(): BattleTroopStatus[] {
    return [
      ...this.playerUnits.map((unit, index) => ({ side: 'player' as const, index, id: unit.general.id, name: unit.general.name, troops: unit.troops, maxTroops: unit.maxTroops, alive: unit.troops > 0 })),
      ...this.enemyUnits.map((unit, index) => ({ side: 'enemy' as const, index, id: unit.general.id, name: unit.general.name, troops: unit.troops, maxTroops: unit.maxTroops, alive: unit.troops > 0 })),
    ]
  }

  private difficultyLabel(): string {
    if (this.duelMode) return '유저 대련'
    return ['초급', '중급', '고급'][this.battlePhase] ?? '고급'
  }

  getSnapshot(): BattleSnapshot {
    const unit = this.playerUnits[this.selectedUnit]
    const general = unit?.general
    const pattern = BATTLE_PATTERNS[this.patternIndex] ?? BATTLE_PATTERNS[0]
    return {
      active: this.battleActive,
      elapsed: this.battleElapsed,
      morale: Math.round(this.enemyMorale),
      phase: this.battlePhase,
      phaseName: phaseName(this.battlePhase),
      enemyPattern: pattern.label,
      enemyPatternLane: pattern.lane,
      combo: this.combo,
      threat: Math.round(this.threat),
      tacticGauge: Math.round(this.tacticGauge),
      guardActive: this.guardTimer > 0,
      selectedUnit: this.selectedUnit,
      selectedName: general?.name ?? '—',
      selectedRole: general?.role ?? '—',
      selectedLevel: general?.level ?? 0,
      selectedStats: general ? { leadership: general.leadership, martial: general.martial, stratagem: general.stratagem, speed: general.speed } : null,
      skillName: general?.skillName ?? '장수 스킬',
      skillDescription: general?.skillDescription ?? '무장을 선택하면 고유 스킬이 표시됩니다.',
      skillUnlocked: general?.skillUnlocked ?? false,
      skillReady: Boolean(general?.skillUnlocked && this.skillCooldown <= 0),
      skillCooldown: Math.max(0, this.skillCooldown),
      activeEffects: [...this.activeBuffs, ...this.activeDebuffs].map(effect => ({ ...effect })),
      opponentDeck: this.enemyDeck.map(general => ({ id: general.id, name: general.name, role: general.role, level: general.level, grade: general.grade, portraitPath: general.portraitPath })),
      troopStatus: this.troopStatus(),
      difficulty: this.difficultyLabel(),
      difficultyMultiplier: this.difficultyMultiplier,
      duelMode: this.duelMode,
      enemyPower: this.enemyDeck.reduce((sum, enemy) => sum + enemy.leadership + enemy.martial + enemy.stratagem + enemy.speed + enemy.level * 4, 0),
      status: this.battleActive ? '전투 중' : '대기 중',
    }
  }

  private update(delta: number): void {
    this.updateEffects(delta)
    this.playerUnits.forEach(unit => {
      unit.group.position.lerp(unit.target, Math.min(delta * (1.15 + unit.general.speed / 75), 1))
      unit.group.position.addScaledVector(unit.knockback, delta * 7)
      unit.knockback.multiplyScalar(Math.max(0, 1 - delta * 8))
      unit.group.position.y = Math.sin((this.clock.getElapsed() + unit.group.position.x) * 1.6) * 0.035
      unit.hitFlash = Math.max(0, unit.hitFlash - delta)
      unit.model.traverse(node => { const mesh = node as THREE.Mesh; if (mesh.material && !Array.isArray(mesh.material) && 'emissiveIntensity' in mesh.material) (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = unit.hitFlash > 0 ? 0.75 : 0 })
      this.animateModel(unit.model, unit.general, this.clock.getElapsed())
    })
    if (this.selectionRing && this.playerUnits[this.selectedUnit]) {
      const unit = this.playerUnits[this.selectedUnit]
      this.selectionRing.position.y = 0.035 + Math.sin(this.clock.getElapsed() * 4) * 0.025
      this.selectionRing.position.x = unit.group.position.x
      this.selectionRing.position.z = unit.group.position.z
      this.selectionRing.scale.setScalar(1 + Math.sin(this.clock.getElapsed() * 3) * 0.04)
    }
    this.enemyUnits.forEach((unit, index) => {
      unit.group.position.y = Math.sin(this.clock.getElapsed() * 1.8 + index) * 0.035
      unit.hitFlash = Math.max(0, unit.hitFlash - delta)
      unit.model.traverse(node => { const mesh = node as THREE.Mesh; if (mesh.material && !Array.isArray(mesh.material) && 'emissiveIntensity' in mesh.material) (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = unit.hitFlash > 0 ? 0.75 : 0 })
      this.animateModel(unit.model, unit.general, this.clock.getElapsed() + index * 0.4)
    })
    this.updateCamera(delta)
    if (!this.battleActive) return
    this.skillCooldown = Math.max(0, this.skillCooldown - delta)
    this.battleElapsed += delta
    this.autoCombat(delta)
    this.tacticGauge = Math.min(100, this.tacticGauge + delta * 0.8 * (hasBattleEffect(this.activeBuffs, 'war-chant') ? 1.25 : 1))
    this.guardTimer = Math.max(0, this.guardTimer - delta)
    this.comboTimer = Math.max(0, this.comboTimer - delta)
    if (this.comboTimer === 0) this.combo = 0
    if (this.battleElapsed >= this.nextPatternAt) this.announcePattern()
    const nextPhase = Math.min(2, Math.floor(this.battleElapsed / 7))
    if (nextPhase !== this.battlePhase) {
      this.battlePhase = nextPhase
      this.difficultyMultiplier = [0.86, 1.08, 1.34][this.battlePhase] ?? 1.34
      const phaseRecovery = hasBattleEffect(this.activeDebuffs, 'fracture') || hasBattleEffect(this.activeDebuffs, 'silence') ? 18 : 100
      this.enemyMorale = Math.min(100, Math.max(this.enemyMorale, phaseRecovery))
      this.combo = 0
      this.comboTimer = 0
      this.threat = Math.max(0, this.threat - 22)
      this.callbacks.onEvent(`${phaseName(this.battlePhase)} · ${this.difficultyLabel()} · 적 덱의 압박이 강화됩니다.`)
    }
    if (this.battleElapsed - this.lastVolley > 1.85) {
      this.lastVolley = this.battleElapsed
      this.spawnArrowVolley()
    }
    const leadership = this.playerUnits.length ? this.playerUnits.reduce((sum, unit) => sum + unit.general.leadership, 0) / this.playerUnits.length : 0
    const speed = this.playerUnits.length ? this.playerUnits.reduce((sum, unit) => sum + unit.general.speed, 0) / this.playerUnits.length : 0
    const moraleDrainMultiplier = hasBattleEffect(this.activeBuffs, 'rally-banner') ? 1.35 : 1
    const naturalMoraleDrain = delta * (0.42 + leadership * 0.002 + speed * 0.0015) * moraleDrainMultiplier
    const effectMoraleDrain = delta * (
      (hasBattleEffect(this.activeDebuffs, 'burning') ? 2.2 : 0)
      + (hasBattleEffect(this.activeDebuffs, 'fear') ? 1.5 : 0)
      + (hasBattleEffect(this.activeDebuffs, 'bleed') ? 1.3 : 0)
    )
    this.enemyMorale = Math.max(0, this.enemyMorale - naturalMoraleDrain - effectMoraleDrain)
    const threatDecay = this.guardTimer > 0 ? 5.4 : 1.8
    this.threat = Math.max(0, this.threat - delta * (threatDecay + (hasBattleEffect(this.activeBuffs, 'iron-wall') ? 4 : 0)))
    const enemyPressure = delta * (0.72 * this.difficultyMultiplier)
    this.threat = Math.min(100, this.threat + (this.guardTimer > 0 ? enemyPressure * 0.28 : enemyPressure))
    if (hasBattleEffect(this.activeDebuffs, 'slow')) this.nextPatternAt += delta * 0.12
    this.tickBattleEffects(delta)
    if (this.battleElapsed - this.lastPulse > 5) {
      this.lastPulse = this.battleElapsed
      this.callbacks.onEvent(`전황 갱신 · 적 사기 ${Math.round(this.enemyMorale)}%`)
    }
    const playerTroops = this.playerUnits.reduce((sum, unit) => sum + unit.troops, 0)
    const enemyTroops = this.enemyUnits.reduce((sum, unit) => sum + unit.troops, 0)
    if (this.battleElapsed > 21 || playerTroops <= 0 || enemyTroops <= 0 || this.threat >= 100) {
      this.battleActive = false
      const won = enemyTroops <= 0 || (playerTroops > enemyTroops && this.threat < 100 && this.battleElapsed > 21)
      this.cameraVictory = won ? 1.5 : 0
      this.cameraShake = won ? 0.22 : 0.1
      const score = Math.max(0, Math.round(4200 + this.combo * 240 + (100 - this.threat) * 18 + playerTroops * 1.4 + this.generals.reduce((sum, general) => sum + general.level * 41 + general.leadership + general.martial + general.stratagem + general.speed, 0)))
      this.callbacks.onBattleEnd({ won, score, durationMs: Math.round(this.battleElapsed * 1000) })
      this.callbacks.onEvent(won ? '전투 승리 · 세 번의 파도를 모두 넘었습니다.' : '전투 패배 · 위협도가 한계에 도달했습니다.')
    }
  }

  private updateCamera(delta: number): void {
    this.cameraIntro = Math.max(0, this.cameraIntro - delta)
    this.cameraVictory = Math.max(0, this.cameraVictory - delta)
    this.cameraShake = Math.max(0, this.cameraShake - delta * 1.8)
    const introOffset = this.cameraIntro > 0 ? (this.cameraIntro / 1.35) * 3.8 : 0
    const victoryOffset = this.cameraVictory > 0 ? (1 - this.cameraVictory / 1.5) * 2.8 : 0
    const shake = this.cameraShake
    this.camera.position.set(
      this.cameraBase.x + (Math.random() - 0.5) * shake,
      this.cameraBase.y + (Math.random() - 0.5) * shake * 0.55,
      this.cameraBase.z + introOffset + victoryOffset,
    )
    this.camera.lookAt(this.cameraLookAt.x, this.cameraLookAt.y + (this.cameraVictory > 0 ? 1.2 : 0), this.cameraLookAt.z)
  }

  private tickBattleEffects(delta: number): void {
    for (const collection of [this.activeBuffs, this.activeDebuffs]) {
      for (let index = collection.length - 1; index >= 0; index -= 1) {
        const effect = collection[index]
        effect.remaining = Math.max(0, effect.remaining - delta)
        if (effect.remaining === 0) {
          this.callbacks.onEvent(`${effect.name} 효과 종료`)
          collection.splice(index, 1)
        }
      }
    }
  }

  private animateModel(model: THREE.Group, general: General | undefined, elapsed: number): void {
    if (!general) return
    const phase = Number(model.userData.weapon?.userData.motionPhase ?? 0)
    const motion = elapsed * (1.8 + general.speed / 160) + phase * Math.PI * 2
    model.rotation.z = Math.sin(motion) * 0.035
    model.position.y = Math.sin(motion * 1.7) * 0.045
    const weapon = model.userData.weapon as THREE.Group | undefined
    if (weapon) weapon.rotation.z = Math.sin(motion * 1.35) * 0.1
  }

  private animate = (): void => {
    if (this.disposed) return
    requestAnimationFrame(this.animate)
    this.clock.update()
    const delta = Math.min(this.clock.getDelta(), 0.05)
    this.update(delta)
    this.renderer.render(this.scene, this.camera)
  }

  private resize = (): void => {
    const width = window.innerWidth
    const height = window.innerHeight
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  dispose(): void {
    this.disposed = true
    window.removeEventListener('resize', this.resize)
    this.renderer.dispose()
  }
}
