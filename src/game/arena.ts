import * as THREE from 'three'
import { skillPower, skillRank, type General } from './strategy'
import { BATTLE_PATTERNS, phaseName, resolveBattleTactic, resolveTactic, type BattleTactic } from './battle-rules'

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
  status: string
}

export interface ArenaCallbacks {
  onEvent: (message: string) => void
  onBattleEnd: (result: { won: boolean; score: number; durationMs: number }) => void
}

interface BattleUnit {
  group: THREE.Group
  general: General
  target: THREE.Vector3
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
const TROOP_ASSETS: Record<General['role'], string> = {
  보병: '/assets/troops/infantry.webp',
  기병: '/assets/troops/cavalry.webp',
  궁병: '/assets/troops/archer.webp',
  책사: '/assets/troops/infantry.webp',
}

export class Arena {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 160)
  private readonly clock = new THREE.Timer()
  private readonly callbacks: ArenaCallbacks
  private readonly playerUnits: BattleUnit[] = []
  private readonly enemyUnits: THREE.Group[] = []
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
  private readonly effects: ArenaEffect[] = []

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
    this.camera.position.set(0, 22, 29)
    this.camera.lookAt(0, 0, -3)
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

  setGenerals(generals: General[]): void {
    this.generals = generals.map(general => ({ ...general }))
    this.clearUnits()
    const positions = [new THREE.Vector3(-4.2, 0, 6), new THREE.Vector3(0, 0, 7.4), new THREE.Vector3(4.2, 0, 6)]
    this.generals.forEach((general, index) => {
      const group = this.createUnit(general, jade, positions[index] ?? positions[0])
      const unit: BattleUnit = { group, general, target: positions[index] ?? positions[0].clone() }
      this.playerUnits.push(unit)
      this.scene.add(group)
    })
    this.selectUnit(0)
  }

  private createUnit(general: General, teamColor: number, position: THREE.Vector3): THREE.Group {
    const group = new THREE.Group()
    group.position.copy(position)
    group.userData.baseY = 0
    const troopMaterial = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: true, depthWrite: false, fog: false, toneMapped: false })
    const troopSprite = new THREE.Sprite(troopMaterial)
    const mounted = general.role === '기병'
    troopSprite.position.y = mounted ? 1.38 : 1.16
    troopSprite.scale.set(mounted ? 2.35 : 1.62, mounted ? 2.75 : 2.45, 1)
    const textureLoader = new THREE.TextureLoader()
    textureLoader.load(TROOP_ASSETS[general.role], texture => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8)
      troopMaterial.map = texture
      troopMaterial.opacity = 0.98
      troopMaterial.needsUpdate = true
    })
    const bannerColor = teamColor === ember ? 0x8e3340 : general.accent
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.75), new THREE.MeshStandardMaterial({ color: bannerColor, side: THREE.DoubleSide, roughness: 0.8 }))
    banner.position.set(-0.38, mounted ? 2.35 : 2.15, 0)
    banner.rotation.y = Math.PI / 2
    group.add(this.createSquad(teamColor, mounted), troopSprite, banner)
    return group
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
    this.enemyUnits.splice(0).forEach(unit => this.scene.remove(unit))
    if (this.selectionRing) this.scene.remove(this.selectionRing)
    if (this.commandMarker) this.scene.remove(this.commandMarker)
    this.clearEffects()
    this.selectionRing = null
    this.commandMarker = null
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

  private spawnSlashWave(general: General, damage: number): void {
    const group = new THREE.Group()
    const material = new THREE.MeshBasicMaterial({ color: 0x4cdfff, transparent: true, opacity: 0.88, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
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
        if (progress > 0.72 && effect.age - 0.016 <= effect.life * 0.72) this.spawnImpact(end, damage, 0x4cdfff)
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
    const signature = this.makeTextSprite('강동패왕', '#ff8066', 1.55)
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
    this.enemyUnits.splice(0).forEach(unit => this.scene.remove(unit))
    const enemyGenerals = this.generals.length ? this.generals : []
    enemyGenerals.forEach((general, index) => {
      const enemy = this.createUnit(general, ember, new THREE.Vector3(-4.4 + index * 4.4, 0, -8 - index * 0.9))
      enemy.rotation.y = Math.PI
      this.enemyUnits.push(enemy)
      this.scene.add(enemy)
    })
    this.callbacks.onEvent(`작전 개시 · ${BATTLE_PATTERNS[0].warning}`)
  }

  commandMove(index: number): void {
    if (!this.battleActive) return
    if (this.battleElapsed < this.nextCommandAt) return
    const unit = this.playerUnits[index]
    if (!unit) return
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
    this.threat = result.threat
    if (result.success) this.tacticGauge = Math.min(100, this.tacticGauge + 24)
    this.comboTimer = result.success ? 4.2 : 0
    if (result.success) {
      this.enemyMorale = Math.max(0, this.enemyMorale - result.moraleDamage)
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
    this.spawnImpact(new THREE.Vector3(0, 0, -6), result.moraleDamage, tactic === 'feint' ? jade : ember)
    this.callbacks.onEvent(tactic === 'feint'
      ? `유인책 성공 · 적 전열을 끌어냈습니다 · 연계 ${this.combo} · 적 사기 -${result.moraleDamage}`
      : `전군 돌격 · 연계를 불태워 적을 압박합니다 · 적 사기 -${result.moraleDamage}`)
  }

  castSkill(): void {
    if (!this.battleActive) return
    const unit = this.playerUnits[this.selectedUnit]
    if (!unit || !unit.general.skillUnlocked) {
      this.callbacks.onEvent('아직 해금되지 않은 장수 스킬입니다.')
      return
    }
    if (this.skillCooldown > 0) {
      this.callbacks.onEvent(`${unit.general.name}의 스킬 재사용 대기 · ${this.skillCooldown.toFixed(1)}초`)
      return
    }
    const impact = this.skillImpact(unit.general)
    const comboBonus = 1 + Math.min(this.combo, 8) * 0.08
    const amplifiedDamage = Math.round(impact.moraleDamage * comboBonus)
    const consumedCombo = this.combo
    this.enemyMorale = Math.max(0, this.enemyMorale - amplifiedDamage)
    this.skillCooldown = impact.cooldown
    this.combo = 0
    this.comboTimer = 0
    this.spawnSlashWave(unit.general, amplifiedDamage * 10)
    this.callbacks.onEvent(`${unit.general.name} · ${unit.general.skillName} 발동 · ${impact.message} · ${consumedCombo ? `${consumedCombo}연계 증폭 · ` : ''}적 사기 -${amplifiedDamage}`)
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
      status: this.battleActive ? '전투 중' : '대기 중',
    }
  }

  private update(delta: number): void {
    this.updateEffects(delta)
    this.playerUnits.forEach(unit => {
      unit.group.position.lerp(unit.target, Math.min(delta * (1.15 + unit.general.speed / 75), 1))
      unit.group.position.y = Math.sin((this.clock.getElapsed() + unit.group.position.x) * 1.6) * 0.035
    })
    if (this.selectionRing && this.playerUnits[this.selectedUnit]) {
      const unit = this.playerUnits[this.selectedUnit]
      this.selectionRing.position.y = 0.035 + Math.sin(this.clock.getElapsed() * 4) * 0.025
      this.selectionRing.position.x = unit.group.position.x
      this.selectionRing.position.z = unit.group.position.z
      this.selectionRing.scale.setScalar(1 + Math.sin(this.clock.getElapsed() * 3) * 0.04)
    }
    this.enemyUnits.forEach((unit, index) => {
      unit.position.y = Math.sin(this.clock.getElapsed() * 1.8 + index) * 0.035
    })
    if (!this.battleActive) return
    this.skillCooldown = Math.max(0, this.skillCooldown - delta)
    this.battleElapsed += delta
    this.tacticGauge = Math.min(100, this.tacticGauge + delta * 0.8)
    this.guardTimer = Math.max(0, this.guardTimer - delta)
    this.comboTimer = Math.max(0, this.comboTimer - delta)
    if (this.comboTimer === 0) this.combo = 0
    if (this.battleElapsed >= this.nextPatternAt) this.announcePattern()
    const nextPhase = Math.min(2, Math.floor(this.battleElapsed / 7))
    if (nextPhase !== this.battlePhase) {
      this.battlePhase = nextPhase
      this.enemyMorale = Math.max(this.enemyMorale, 100)
      this.combo = 0
      this.comboTimer = 0
      this.threat = Math.max(0, this.threat - 22)
      this.callbacks.onEvent(`${phaseName(this.battlePhase)} · 적 지휘관이 전열을 재편합니다.`)
    }
    if (this.battleElapsed - this.lastVolley > 1.85) {
      this.lastVolley = this.battleElapsed
      this.spawnArrowVolley()
    }
    const leadership = this.playerUnits.length ? this.playerUnits.reduce((sum, unit) => sum + unit.general.leadership, 0) / this.playerUnits.length : 0
    const speed = this.playerUnits.length ? this.playerUnits.reduce((sum, unit) => sum + unit.general.speed, 0) / this.playerUnits.length : 0
    this.enemyMorale = Math.max(0, this.enemyMorale - delta * (0.42 + leadership * 0.002 + speed * 0.0015))
    this.threat = Math.max(0, this.threat - delta * (this.guardTimer > 0 ? 5.4 : 1.8))
    if (this.battleElapsed - this.lastPulse > 5) {
      this.lastPulse = this.battleElapsed
      this.callbacks.onEvent(`전황 갱신 · 적 사기 ${Math.round(this.enemyMorale)}%`)
    }
    if (this.battleElapsed > 21 || this.enemyMorale <= 0 || this.threat >= 100) {
      this.battleActive = false
      const won = this.threat < 100
      const score = Math.max(0, Math.round(4200 + this.combo * 240 + (100 - this.threat) * 18 + this.generals.reduce((sum, general) => sum + general.level * 41 + general.leadership + general.martial + general.stratagem + general.speed, 0)))
      this.callbacks.onBattleEnd({ won, score, durationMs: Math.round(this.battleElapsed * 1000) })
      this.callbacks.onEvent(won ? '전투 승리 · 세 번의 파도를 모두 넘었습니다.' : '전투 패배 · 위협도가 한계에 도달했습니다.')
    }
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
