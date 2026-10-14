// 전투 규칙 — '천하 전투 개선안'과 '무장 스킬 재구성안'(2026-10-12)을 구현한 순수 계산 모듈.
// 3D 연출(arena.ts)과 분리되어 있어 테스트·시뮬레이션에서 그대로 돌릴 수 있다.
import type { General } from './strategy'
import { templateGeneral } from './strategy'
import { BATTLE_EFFECTS, effectValue, hasBattleEffect, type ActiveBattleEffect, type BattleEffectId, type BuffId, type DebuffId, type PlayerDebuffId } from './battle-effects'
import { COMMAND_BUFF_GRADE, COMMAND_BUFF_SEC, SKILL_MORALE_CAP, SKILL_TYPE_META, baseMoraleDamage, bondFor, mainStatGrowth, isAwakened, skillCooldownFor, skillDefFor, type BondDef, type GeneralSkillDef, type SkillFx, type SkillType } from './skills'

export type BattleMode = 'normal' | 'scenario' | 'siege' | 'duel'
export type BattleTactic = 'guard' | 'feint' | 'charge'
export type Side = 'player' | 'enemy'

export const BATTLE_RULES = {
  timeLimit: 90,
  /** 통솔(아군 강화)형: 버프 지속 +초, 버프 수치는 등급이 높을수록 크게(skills.ts가 원본) */
  commandBuffSec: COMMAND_BUFF_SEC,
  commandBuffGrade: COMMAND_BUFF_GRADE,
  /** 회복량 등급 보정(낮은 등급 치유형이 천명급만큼 회복하지 않게). 여기에 주 능력치(통솔) 성장이 곱해진다 */
  healGrade: { 1: 0.4, 2: 0.46, 3: 0.52, 4: 0.6, 5: 0.7 } as Record<number, number>,
  /** 전열(가운데 자리): 상대의 일반 공격·단일 스킬이 이 확률로 전열부터 노리고, 전열은 받는 피해가 줄어든다 */
  frontLane: 1,
  frontPull: 0.3,
  frontDr: 0.2,
  /** 수호형 무장이 전열에 서면: 적을 더 끌어당기고(도발) 더 단단해진다 */
  frontTankPull: 0.25,
  frontTankDr: 0.2,
  moraleByPhase: [80, 100, 120] as const,
  patternInterval: [3.5, 3.2, 3.0] as const,
  responseWindow: [2.5, 2.5, 2.0] as const,
  firstPatternAt: 2.0,
  troopScale: 2,
  pressureStart: 1.0,
  pressureEnd: 1.5,
  pressureRamp: 75,
  /** 적 평균 레벨 1당 막별 사기 최대치 +2.1% (최대 2배). 스킬이 해금된 덱이 너무 빨리 끝나지 않게 한다. */
  moralePerEnemyLevel: 0.021,
  /** 사기 최대치 배율 상한 */
  moraleScaleCap: 2,
  moraleDrain: 0.4,
  moraleDrainPerTroopPct: 0.3,
  threatDecay: 0.6,
  threatWrong: 14,
  threatNoAnswer: 9,
  threatEnemySkill: 5,
  noAnswerTroopDamage: 60,
  collapseTroopLoss: 0.2,
  collapseThreatReset: 50,
  collapsesToLose: 2,
  gaugeRegen: 1.0,
  gaugeOnBreak: 20,
  tacticCost: { guard: 35, feint: 50, charge: 65 } as Record<BattleTactic, number>,
  guardDuration: 4.5,
  enemySkillCooldownMult: 1.3,
  enemySkillWarning: 1.5,
  skillTroopDamagePerMorale: 4,
  enemySkillTroopPerMorale: 4,
  drCap: 0.45,
  takenCap: 0.4,
  /** 레벨 차 완화: 적이 아군보다 1레벨 높을 때마다 적이 주는 병력 피해를 이만큼 나눠 줄인다(낭떠러지 대신 완만한 곡선) */
  gapDamage: 0.007,
  /** 열세 보상: 적이 높을수록 예고 파훼 사기 피해 증가(1레벨당, 최대 25레벨분) — 잘하면 뒤집을 수 있게 */
  gapBreakBonus: 0.025,
  /** 예고를 파훼하면 그 레인 무장 병력을 이 비율만큼 회복 */
  breakHeal: 0.01,
  /** 3막 남은 시간 경고(초) */
  timeWarnAt: 20,
}

export interface PatternDef { id: string; label: string; lanes: number[]; kind: 'lane' | 'pincer' | 'guard' | 'hold'; minPhase: number; warning: string }

export const PATTERNS: PatternDef[] = [
  { id: 'left-flank', label: '좌익 포위', lanes: [0], kind: 'lane', minPhase: 0, warning: '좌측 협공 예고 · 좌측 무장으로 끊어내십시오.' },
  { id: 'center-charge', label: '중앙 돌파', lanes: [1], kind: 'lane', minPhase: 0, warning: '적 선봉이 중앙으로 돌입합니다 · 중앙 무장으로 맞받으십시오.' },
  { id: 'right-feint', label: '우익 유인', lanes: [2], kind: 'lane', minPhase: 0, warning: '우측에 빈틈 · 우측 무장으로 연계를 만드십시오.' },
  { id: 'crossfire', label: '십자 포화', lanes: [1], kind: 'lane', minPhase: 0, warning: '전방 포화 · 중앙을 고정해 진형을 보존하십시오.' },
  { id: 'pincer', label: '양익 협공', lanes: [0, 2], kind: 'pincer', minPhase: 1, warning: '양 날개 동시 공격 · 좌측과 우측 무장 모두 대응하십시오.' },
  { id: 'feigned-retreat', label: '거짓 후퇴', lanes: [], kind: 'hold', minPhase: 1, warning: '적이 물러나는 척합니다 · 아무 버튼도 누르지 말고 기다리십시오.' },
  { id: 'full-assault', label: '전면 공세', lanes: [0, 1, 2], kind: 'pincer', minPhase: 2, warning: '세 방면 동시 공세 · 좌·중·우 무장을 모두 누르십시오.' },
  { id: 'general-charge', label: '적장 돌격', lanes: [1], kind: 'guard', minPhase: 2, warning: '적장이 직접 돌격합니다 · 철벽 태세로만 막을 수 있습니다.' },
]

export function phaseName(phase: number): string {
  return ['1막 · 서전', '2막 · 격전', '3막 · 결전'][Math.max(0, Math.min(2, phase))] ?? '3막 · 결전'
}

export interface CoreUnit {
  general: General
  side: Side
  lane: number
  def: GeneralSkillDef
  base: { martial: number; stratagem: number; leadership: number; speed: number }
  troops: number
  maxTroops: number
  attackTimer: number
  cd: number
  cdMax: number
  skillOn: boolean
  undyingLeft: number
  selfDr: { value: number; until: number }
  selfAtk: { value: number; until: number }
  guarding: { ward: number; until: number } | null
  firstAttackDone: boolean
  warned: boolean
}

export type CoreEvent =
  | { kind: 'log'; text: string; tone?: 'jade' | 'ember' }
  | { kind: 'hit'; side: Side; lane: number; amount: number; source: string; edge?: 'adv' | 'dis' }
  | { kind: 'heal'; side: Side; lane: number; amount: number }
  | { kind: 'attack'; side: Side; lane: number; target: number }
  | { kind: 'skill'; side: Side; lane: number; name: string; morale: number; type: SkillType; target: number }
  | { kind: 'pattern'; pattern: PatternDef }
  | { kind: 'answer'; lane: number; success: boolean }
  | { kind: 'phase'; phase: number }
  | { kind: 'enemySkillWarn'; lane: number; name: string }
  | { kind: 'collapse'; count: number }
  | { kind: 'timeWarn'; left: number }
  | { kind: 'counter'; lane: number; name: string }
  | { kind: 'unitDown'; side: Side; lane: number }
  | { kind: 'end'; result: BattleResult }

export interface BattleResult {
  won: boolean
  reason: 'morale' | 'wipe' | 'timeout' | 'troops' | 'collapse' | 'ratio'
  stars: number
  score: number
  durationMs: number
  breaks: number
  patterns: number
  maxCombo: number
  troopRatio: number
  collapses: number
}

export interface AutoPilot { accuracy: number; reaction: [number, number] }

export interface CoreConfig {
  mode?: BattleMode
  /** 공성: 성벽 방어도에 따른 적 사기 최대치 보너스(0~50) */
  moraleBonus?: number
  rng?: () => number
  autoPilot?: AutoPilot | null
  /** 기술 연구(강병·지략)의 아군 보정 */
  research?: BattleResearch | null
  /** 튜토리얼 전투: 적 사기 절반, 예고를 받을 시간 넉넉히, 실수의 대가(위협도·병력 피해) 크게 줄임 */
  easy?: boolean
}

interface OpenPattern { def: PatternDef; at: number; deadline: number; judged: boolean; inputs: Set<number>; reactAt: number }

const BEATS: Record<string, string> = { 기병: '궁병', 궁병: '보병', 보병: '기병' }
const FIRE_IDS = new Set(['zhou-yu', 'lu-xun', 'huang-gai', 'zhu-rong'])
const CHARGE_IDS = new Set(['lu-bu', 'zhang-fei', 'ma-chao'])
const YELLOW_TURBAN_IDS = new Set(['zhang-jiao', 'zhang-bo', 'zhang-liang', 'guan-hai', 'zhou-cang'])
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** 기술 연구 보정(research.ts의 BattleResearch와 같은 모양) */
export interface BattleResearch {
  troops?: number; archerAtk?: number; chargeSkill?: number; damageTaken?: number; startGauge?: number; collapseLoss?: number
  finalActMorale?: number; ignoreFirstCollapse?: boolean; breakThreat?: number; window?: number; strategistCd?: number
  fire?: number; enemyWarn?: number; tacticCost?: number; capBonus?: number; combo?: number
}

export function matchup(attacker: General['role'], defender: General['role']): number {
  if (BEATS[attacker] === defender) return 1.15
  if (BEATS[defender] === attacker) return 0.9
  return 1
}

export function troopCapacity(general: General): number {
  const frail = skillDefFor(general.id, general.role).weakness?.id
  const cut = frail === 'frail10' ? 0.9 : frail === 'frail15' ? 0.85 : 1
  return Math.round((620 + general.leadership * 6 + general.defense * 3 + general.level * 24 + general.grade * 70) * BATTLE_RULES.troopScale * cut)
}

export class BattleCore {
  readonly mode: BattleMode
  readonly players: CoreUnit[]
  readonly enemies: CoreUnit[]
  readonly bond: BondDef | null
  readonly events: CoreEvent[] = []
  t = 0
  phase = 0
  moraleMax: number
  morale: number
  combo = 0
  maxCombo = 0
  threat = 0
  gauge = 0
  guardTimer = 0
  collapses = 0
  active = true
  result: BattleResult | null = null
  pattern: OpenPattern | null = null
  nextPatternAt = BATTLE_RULES.firstPatternAt
  buffs: ActiveBattleEffect[] = []
  debuffs: ActiveBattleEffect[] = []
  playerDebuffs: ActiveBattleEffect[] = []
  enemyBuffs: ActiveBattleEffect[] = []
  breaks = 0
  patternsSeen = 0
  lastCommandFailed = false
  private lastPatternId = ''
  private lastSkillId = ''
  private firstSkillUsed = false
  private threatSaveUsed = false
  private pendingFlankBonus = 0
  private freeTactic = false
  private autoBreakNext = false
  private enemyMaxTotal: number
  private readonly moraleScale: number
  /** 튜토리얼 전투 */
  readonly easy: boolean
  /** 적 평균 레벨 − 아군 평균 레벨 */
  readonly levelGap: number
  private timeWarned = false
  private readonly moraleBonus: number
  private readonly rng: () => number
  readonly research: BattleResearch
  private collapseSaved = false
  /** 자동 전투(3성 시나리오). 전투 중에 켜고 끌 수 있다. */
  autoPilot: AutoPilot | null
  /** 방금 스킬이 맞힌 상대 자리(연출용) */
  private lastSkillTarget: number | null = null

  constructor(players: General[], enemies: General[], config: CoreConfig = {}) {
    this.mode = config.mode ?? 'normal'
    this.easy = Boolean(config.easy)
    this.rng = config.rng ?? Math.random
    this.autoPilot = config.autoPilot ?? null
    this.moraleBonus = clamp(Math.round(config.moraleBonus ?? 0), 0, 50)
    this.research = config.research ?? {}
    this.players = players.slice(0, 3).map((general, lane) => this.makeUnit(general, 'player', lane))
    // 오부 훈련: 아군 최대 병력 증가
    if (this.research.troops) this.players.forEach(unit => { unit.maxTroops = Math.round(unit.maxTroops * (1 + this.research.troops!)); unit.troops = unit.maxTroops })
    this.enemies = enemies.slice(0, 3).map((general, lane) => this.makeUnit(general, 'enemy', lane))
    this.bond = bondFor(this.players.map(unit => unit.general.id))
    this.players.forEach(unit => { unit.cdMax = this.cooldownFor(unit) * (this.research.strategistCd && (unit.def.type === '계략' || unit.def.type === '통솔') ? 1 - this.research.strategistCd : 1); unit.cd = Math.max(0, unit.cdMax * 0.4 - (this.passive(unit) === 'fastOpener' ? (unit.def.passive?.value ?? 0) : 0)) })
    this.enemies.forEach(unit => { unit.cdMax = skillCooldownFor(this.growth(unit), unit.base) * (this.mode === 'duel' ? 1 : BATTLE_RULES.enemySkillCooldownMult); unit.cd = unit.cdMax * 0.6 })
    this.enemyMaxTotal = Math.max(1, this.enemies.reduce((sum, unit) => sum + unit.maxTroops, 0))
    const enemyLevel = this.enemies.reduce((sum, unit) => sum + unit.general.level, 0) / Math.max(1, this.enemies.length)
    this.moraleScale = Math.min(BATTLE_RULES.moraleScaleCap, 1 + BATTLE_RULES.moralePerEnemyLevel * Math.max(0, enemyLevel - 1)) * (this.easy ? 0.35 : 1)
    const playerLevel = this.players.reduce((sum, unit) => sum + unit.general.level, 0) / Math.max(1, this.players.length)
    this.levelGap = clamp(enemyLevel - playerLevel, -40, 60)
    this.moraleMax = Math.round(BATTLE_RULES.moraleByPhase[0] * this.moraleScale) + this.moraleBonus
    this.morale = this.moraleMax
    this.gauge = Math.min(100, this.research.startGauge ?? 0)
    if (this.players.some(unit => this.passive(unit) === 'startFear')) this.addEffect('debuff', 'fear', 3)
    this.log(`작전 개시 · 적 ${this.enemies.map(unit => unit.general.name).join(' · ')}${this.bond ? ` · 인연 「${this.bond.name}」 ${this.bond.desc}` : ''}`)
  }

  // ── 준비 ─────────────────────────────────────────
  private makeUnit(general: General, side: Side, lane: number): CoreUnit {
    const template = templateGeneral(general.id) ?? general
    const def = skillDefFor(general.id, general.role, general.skillName, general.skillDescription)
    const maxTroops = troopCapacity(general)
    return {
      general, side, lane, def,
      base: { martial: template.martial, stratagem: template.stratagem, leadership: template.leadership, speed: template.speed },
      troops: maxTroops, maxTroops,
      attackTimer: side === 'player' ? 0.45 + lane * 0.16 : 0.8 + lane * 0.15,
      cd: 0, cdMax: 10,
      skillOn: Boolean(general.skillUnlocked),
      undyingLeft: def.passive?.id === 'undyingOnce' && general.stars >= 3 ? 1 : 0,
      selfDr: { value: 0, until: 0 }, selfAtk: { value: 0, until: 0 },
      guarding: null, firstAttackDone: false, warned: false,
    }
  }

  private growth(unit: CoreUnit) {
    const g = unit.general
    return { id: g.id, role: g.role, grade: g.grade, level: g.level, stars: g.stars, skillRank: g.skillRank, martial: g.martial, stratagem: g.stratagem, leadership: g.leadership, speed: g.speed, skillName: g.skillName, skillDescription: g.skillDescription }
  }

  /** 패시브는 3성부터 켜진다. */
  private passive(unit: CoreUnit): string {
    return unit.general.stars >= 3 ? unit.def.passive?.id ?? '' : ''
  }

  private hasPlayer(id: string): boolean {
    return this.players.some(unit => unit.general.id === id)
  }

  private alive(units: CoreUnit[]): CoreUnit[] {
    return units.filter(unit => unit.troops > 0)
  }

  private cooldownFor(unit: CoreUnit): number {
    let cooldown = skillCooldownFor(this.growth(unit), unit.base)
    const id = this.passive(unit)
    if (id === 'partnerSelfCd' && this.hasPlayer(unit.def.passive?.partner ?? '')) cooldown -= unit.def.passive?.value ?? 0
    if (id === 'cavalryPair' && this.players.filter(other => other.general.role === '기병').length >= 2) cooldown -= unit.def.passive?.value ?? 0
    if (unit.general.role === '책사' && this.players.some(other => this.passive(other) === 'cdForStrategists')) cooldown *= 0.85
    this.players.forEach(other => {
      if (other !== unit && this.passive(other) === 'partnerCd' && other.def.passive?.partner === unit.general.id) cooldown -= other.def.passive?.value ?? 0
    })
    if (this.bond?.id === 'dragon-phoenix' && unit.def.type === '계략') cooldown -= 1.5
    if (this.bond?.id === 'yellow-heaven' && unit.def.type === '계략') cooldown -= 1
    return Math.max(4, Math.round(cooldown * 10) / 10)
  }

  private luBuCalm(): boolean {
    return this.hasPlayer('diao-chan') || this.hasPlayer('chen-gong') || this.bond?.id === 'lu-bu-army'
  }

  // ── 효과 ─────────────────────────────────────────
  private list(kind: 'buff' | 'debuff' | 'pdebuff' | 'ebuff'): ActiveBattleEffect[] {
    return kind === 'buff' ? this.buffs : kind === 'debuff' ? this.debuffs : kind === 'pdebuff' ? this.playerDebuffs : this.enemyBuffs
  }

  addEffect(kind: 'buff' | 'debuff' | 'pdebuff' | 'ebuff', id: BattleEffectId, seconds?: number, value?: number): void {
    const definition = BATTLE_EFFECTS[id]
    const collection = this.list(kind)
    const duration = Math.max(0.5, seconds ?? definition.duration)
    const existing = collection.find(effect => effect.id === id)
    if (existing) {
      existing.remaining = Math.max(existing.remaining, duration)
      existing.stacks = Math.min(2, existing.stacks + 1)
      if (value !== undefined) existing.value = Math.max(existing.value ?? 0, value)
      return
    }
    if (kind === 'debuff' && collection.filter(effect => effect.remaining > 0).length >= 4) {
      const weakest = [...collection].sort((left, right) => left.remaining - right.remaining)[0]
      if (weakest) collection.splice(collection.indexOf(weakest), 1)
    }
    collection.push({ ...definition, remaining: duration, stacks: 1, value })
  }

  private tickEffects(delta: number): void {
    for (const collection of [this.buffs, this.debuffs, this.playerDebuffs, this.enemyBuffs]) {
      for (let index = collection.length - 1; index >= 0; index -= 1) {
        const effect = collection[index]
        effect.remaining -= delta
        if (effect.remaining <= 0) {
          collection.splice(index, 1)
          if (effect.id === 'atk-up' && this.buffs.some(other => other.id === 'hangover')) {
            const hangover = this.buffs.find(other => other.id === 'hangover')!
            hangover.remaining = Math.min(hangover.remaining, 3)
          }
        }
      }
    }
  }

  // ── 병력 피해 ────────────────────────────────────
  private attackBonus(unit: CoreUnit): number {
    if (unit.side === 'enemy') return 0
    let bonus = effectValue(this.buffs, 'atk-up')
    if (this.buffs.some(effect => effect.id === 'hangover' && effect.remaining <= 3)) bonus -= effectValue(this.buffs, 'hangover')
    if (unit.selfAtk.until > this.t) bonus += unit.selfAtk.value
    if (unit.general.role === '궁병') bonus += effectValue(this.buffs, 'archer-focus') + (this.research.archerAtk ?? 0)
    if (unit.general.role === '기병') bonus += effectValue(this.buffs, 'cavalry-surge')
    const id = this.passive(unit)
    const value = unit.def.passive?.value ?? 0
    if (id === 'atkIfCombo' && this.combo >= 3) bonus += value
    if (id === 'atkRamp') bonus += Math.min(value, Math.floor(this.t / 7) * 0.02)
    if (id === 'earlyAtk' && this.t < 10) bonus += value
    if (id === 'atkHighTroops' && unit.troops >= unit.maxTroops * 0.7) bonus += value
    if (id === 'lowTroopAtk' && unit.troops <= unit.maxTroops * 0.5) bonus += value
    if (id === 'atkOnAllyDown' && this.players.some(other => other.troops <= 0)) bonus += value
    if (id === 'partnerAtk' && this.hasPlayer(unit.def.passive?.partner ?? '')) bonus += value
    if (id === 'firstStrike' && !unit.firstAttackDone) bonus += value
    if (this.bond?.id === 'peach-garden') bonus += 0.08
    if (this.bond?.id === 'yellow-heaven') bonus += 0.05
    if (hasBattleEffect(this.playerDebuffs, 'p-fear')) bonus -= 0.15
    return bonus
  }

  private damageReduction(unit: CoreUnit, attacker: CoreUnit | null): { dr: number; taken: number } {
    if (unit.side === 'enemy') {
      const dr = effectValue(this.enemyBuffs, 'e-guard')
      let taken = 0
      if (hasBattleEffect(this.debuffs, 'flood')) taken += 0.15
      if (hasBattleEffect(this.debuffs, 'rage')) taken += 0.25
      if (attacker && this.passive(attacker) === 'vsCavalry' && unit.general.role === '기병') taken += attacker.def.passive?.value ?? 0
      return { dr: Math.min(BATTLE_RULES.drCap, dr), taken: Math.min(BATTLE_RULES.takenCap, taken) }
    }
    let dr = effectValue(this.buffs, 'dr-up') + (this.research.damageTaken ?? 0)
    if (unit.selfDr.until > this.t) dr += unit.selfDr.value
    const teamTroops = this.players.reduce((sum, other) => sum + other.troops, 0) / Math.max(1, this.players.reduce((sum, other) => sum + other.maxTroops, 0))
    this.players.forEach(other => {
      const id = this.passive(other)
      const value = other.def.passive?.value ?? 0
      if (id === 'lowTroopDr' && teamTroops <= 0.5) dr += value
      if (id === 'factionDr') dr += value * this.players.filter(member => member.def.faction === '오').length
      if (id === 'highTroopDr' && other.troops >= other.maxTroops * 0.7) dr += value
      if (id === 'partnerDr' && unit.general.id === other.def.passive?.partner) dr += value
    })
    if (this.bond?.id === 'peach-garden') dr += 0.08
    if (this.bond?.id === 'five-generals') dr += 0.1
    let taken = 0
    const weakness = unit.def.weakness?.id
    if (weakness === 'fragile10') taken += 0.1
    if (weakness === 'weakToStrategist' && attacker?.general.role === '책사') taken += 0.1
    return { dr: Math.min(BATTLE_RULES.drCap, dr), taken: Math.min(BATTLE_RULES.takenCap, taken) }
  }

  /** 레벨 차 완화(적 피해에 곱함): 적이 높을수록 조금씩 덜 아프게 → 실력으로 메울 여지 */
  private gapScale(): number {
    return this.levelGap > 0 ? 1 / (1 + this.levelGap * BATTLE_RULES.gapDamage) : 1
  }

  private pressure(): number {
    return BATTLE_RULES.pressureStart + (BATTLE_RULES.pressureEnd - BATTLE_RULES.pressureStart) * Math.min(1, this.t / BATTLE_RULES.pressureRamp)
  }

  /** 화면 연출용: 스킬이 겨누는 상대 레인(사격은 병력이 가장 적은 상대) */
  private skillFocus(defenders: CoreUnit[], unit: CoreUnit): number {
    // 실제로 맞힌 상대가 있으면 그쪽을 보여 준다(전열 규칙에 무작위가 섞여 다시 고르면 엇갈릴 수 있다)
    if (this.lastSkillTarget !== null) { const lane = this.lastSkillTarget; this.lastSkillTarget = null; return lane }
    const alive = this.alive(defenders)
    if (unit.def.type === '사격') return [...alive].sort((left, right) => left.troops - right.troops)[0]?.lane ?? unit.lane
    return this.targetFor(defenders, unit.lane)?.lane ?? unit.lane
  }

  /** 같은 자리의 상대, 쓰러졌으면 살아 있는 상대 중 무작위(예전에는 늘 왼쪽부터라 왼쪽 무장만 집중으로 맞았다) */
  private laneTarget(units: CoreUnit[], lane: number): CoreUnit | undefined {
    const same = units[lane]
    if (same && same.troops > 0) return same
    const alive = this.alive(units)
    return alive.length ? alive[Math.floor(this.rng() * alive.length)] : undefined
  }

  /** 수호형 무장이 전열에 섰는가 */
  private isFrontTank(unit: CoreUnit | undefined): boolean {
    return Boolean(unit && unit.lane === BATTLE_RULES.frontLane && unit.def.type === '수호')
  }

  /** 일반 공격·단일 스킬의 표적: 상대 전열이 살아 있으면 일정 확률로 전열부터(전열 규칙) */
  private targetFor(units: CoreUnit[], lane: number): CoreUnit | undefined {
    const front = units[BATTLE_RULES.frontLane]
    if (front && front.troops > 0 && lane !== BATTLE_RULES.frontLane) {
      const pull = BATTLE_RULES.frontPull + (this.isFrontTank(front) ? BATTLE_RULES.frontTankPull : 0)
      if (this.rng() < pull) return front
    }
    return this.laneTarget(units, lane)
  }

  /** 병력 피해 적용. 호위·불굴·반격·사기 감소까지 처리한다. */
  dealDamage(target: CoreUnit, raw: number, source: string, attacker: CoreUnit | null, opts: { ignoreDr?: boolean } = {}): number {
    if (target.troops <= 0 || raw <= 0) return 0
    if (this.easy && target.side === 'player') raw *= 0.4
    let victim = target
    if (target.side === 'player') {
      const guardian = this.players.find(unit => unit !== target && unit.troops > 0 && unit.guarding && unit.guarding.ward === target.lane && unit.guarding.until > this.t)
      if (guardian) { victim = guardian; raw *= 0.7 }
    }
    const { dr, taken } = this.damageReduction(victim, attacker)
    // 전열: 가운데 자리는 받는 피해가 줄어든다(수호형이면 더). 함진영 같은 피해 감소 무시 효과에는 적용되지 않는다
    const front = victim.lane === BATTLE_RULES.frontLane && !opts.ignoreDr ? BATTLE_RULES.frontDr + (this.isFrontTank(victim) ? BATTLE_RULES.frontTankDr : 0) : 0
    const amount = Math.max(1, Math.round(raw * (1 - front) * (1 - (opts.ignoreDr ? 0 : dr)) * (1 + taken)))
    victim.troops = Math.max(0, victim.troops - amount)
    const edgeValue = attacker ? matchup(attacker.general.role, victim.general.role) : 1
    this.events.push({ kind: 'hit', side: victim.side, lane: victim.lane, amount, source, ...(edgeValue > 1 ? { edge: 'adv' as const } : edgeValue < 1 ? { edge: 'dis' as const } : {}) })
    if (victim.side === 'enemy') this.drainMorale(amount / this.enemyMaxTotal * 100 * BATTLE_RULES.moraleDrainPerTroopPct)
    if (victim.side === 'player') {
      if (this.passive(victim) === 'cdOnHit') victim.cd = Math.max(0, victim.cd - (victim.def.passive?.value ?? 0))
      const counter = effectValue(this.buffs, 'counter')
      if (counter > 0 && attacker && attacker.troops > 0) this.dealDamage(attacker, amount * counter, '반격', null)
    }
    if (victim.troops <= 0) {
      if (victim.undyingLeft > 0) {
        victim.undyingLeft -= 1
        victim.troops = Math.round(victim.maxTroops * 0.2)
        this.log(`${victim.general.name} · 불굴 발동 · 병력 20%로 버팁니다`, 'jade')
        if (this.passive(victim) === 'undyingMorale') this.drainMorale(victim.def.passive?.value ?? 8)
      } else this.unitDown(victim)
    }
    return amount
  }

  private unitDown(unit: CoreUnit): void {
    this.events.push({ kind: 'unitDown', side: unit.side, lane: unit.lane })
    this.log(`${unit.general.name}의 병력이 전멸했습니다.`, unit.side === 'player' ? 'ember' : 'jade')
    if (unit.side === 'player' && this.passive(unit) === 'deathRally') this.addEffect('buff', 'atk-up', 5, unit.def.passive?.value ?? 0.2)
    if (unit.side === 'enemy') this.players.forEach(player => { if (this.passive(player) === 'resetOnKill') player.cd *= 0.5 })
  }

  private drainMorale(amount: number): void {
    if (!this.active || amount <= 0) return
    this.morale -= amount
  }

  private autoCombat(delta: number): void {
    const swing = (attacker: CoreUnit, defenders: CoreUnit[]) => {
      if (attacker.troops <= 0) return
      attacker.attackTimer -= delta
      if (attacker.attackTimer > 0) return
      const target = this.targetFor(defenders, attacker.lane)
      if (!target) return
      const g = attacker.general
      let interval = Math.max(0.72, 1.85 - g.speed * 0.008)
      if (attacker.side === 'player') {
        if (this.passive(attacker) === 'peerless') interval /= 1.1
        if (g.role === '기병' && hasBattleEffect(this.buffs, 'cavalry-surge')) interval /= 1.1
        if (hasBattleEffect(this.buffs, 'heavy-step')) interval *= 1.1
      }
      attacker.attackTimer = interval
      let multiplier = 1 + this.attackBonus(attacker)
      if (attacker.side === 'enemy') {
        multiplier *= this.pressure() * this.gapScale()
        if (hasBattleEffect(this.debuffs, 'confusion') || hasBattleEffect(this.debuffs, 'blind')) multiplier *= 0.9
        if (hasBattleEffect(this.debuffs, 'rage')) multiplier *= 1.1
      }
      // 유형의 주 능력치로 친다: 무력형·수호형=무력, 책사·치유형=모략, 통솔형=통솔(병사를 부려 싸운다)
      const type = attacker.def.type
      const mainStat = type === '계략' || type === '치유' ? g.stratagem : type === '통솔' ? g.leadership : g.martial
      // 성장분이 유형별로 나뉘어 공격·주 능력치 비중이 예전(54%)보다 낮아졌으므로 계수를 올려 레벨당 피해 증가를 예전과 맞춘다(Lv1 피해는 그대로)
      const raw = (8 + g.attack * 0.42 + mainStat * 0.3 + g.leadership * 0.1) * 120 / (120 + target.general.defense) * matchup(g.role, target.general.role) * Math.max(0.1, multiplier)
      attacker.firstAttackDone = true
      this.events.push({ kind: 'attack', side: attacker.side, lane: attacker.lane, target: target.lane })
      this.dealDamage(target, raw, g.name, attacker)
    }
    this.players.forEach(unit => swing(unit, this.enemies))
    this.enemies.forEach(unit => swing(unit, this.players))
  }

  // ── 위협도 ───────────────────────────────────────
  private raiseThreat(amount: number, cause: 'wrong' | 'none' | 'skill' | 'raw'): void {
    let value = amount * (this.easy ? 0.35 : 1)
    if (cause !== 'raw') {
      if (this.guardTimer > 0) value *= 0.3
      if (hasBattleEffect(this.buffs, 'phoenix-guard')) value *= 0.75
      if (cause !== 'skill' && hasBattleEffect(this.playerDebuffs, 'p-confuse')) value *= 1.5
      if (cause === 'wrong') {
        if (hasBattleEffect(this.buffs, 'jade-command')) value *= 0.65
        if (hasBattleEffect(this.debuffs, 'confusion')) value *= 0.65
        if (hasBattleEffect(this.debuffs, 'blind')) value *= 0.8
        if (this.players.some(unit => this.passive(unit) === 'failThreatCut')) value *= 0.75
      }
      if (cause !== 'skill' && this.pattern?.def.id === 'crossfire' && this.players.some(unit => this.passive(unit) === 'crossfireGuard')) value *= 0.7
    }
    this.threat = clamp(this.threat + value, 0, 100)
    const save = this.players.find(unit => this.passive(unit) === 'threatSave')
    if (save && !this.threatSaveUsed && this.threat >= 80) {
      this.threatSaveUsed = true
      this.threat = Math.max(0, this.threat - (save.def.passive?.value ?? 20))
      this.log(`${save.general.name} · 공성계 · 위협도 −${save.def.passive?.value ?? 20}`, 'jade')
    }
    if (this.threat >= 100) this.collapse()
  }

  private collapse(): void {
    // 불패 진형: 전투마다 첫 붕괴 1회를 막는다
    if (this.research.ignoreFirstCollapse && !this.collapseSaved) {
      this.collapseSaved = true
      this.threat = BATTLE_RULES.collapseThreatReset
      this.log('불패 진형 · 무너지려던 전열을 다시 세웠습니다.', 'jade')
      return
    }
    this.collapses += 1
    this.players.forEach(unit => { if (unit.troops > 0) unit.troops = Math.max(1, Math.round(unit.troops * (1 - (this.research.collapseLoss ?? BATTLE_RULES.collapseTroopLoss)))) })
    this.threat = BATTLE_RULES.collapseThreatReset
    this.combo = 0
    this.events.push({ kind: 'collapse', count: this.collapses })
    this.log(this.collapses >= BATTLE_RULES.collapsesToLose ? '전열이 두 번째로 무너졌습니다.' : `전열 붕괴 · 아군 병력 −${Math.round((this.research.collapseLoss ?? BATTLE_RULES.collapseTroopLoss) * 100)}% · 한 번 더 무너지면 패배합니다`, 'ember')
  }

  // ── 적 전술 예고 ─────────────────────────────────
  private pickPattern(): PatternDef {
    const pool = PATTERNS.filter(pattern => pattern.minPhase <= this.phase && pattern.id !== this.lastPatternId)
    const enemyIds = this.enemies.map(unit => unit.general.id)
    const weight = (pattern: PatternDef) => 1
      + (pattern.id === 'crossfire' && enemyIds.some(id => FIRE_IDS.has(id)) ? 1 : 0)
      + (pattern.id === 'center-charge' && enemyIds.some(id => CHARGE_IDS.has(id)) ? 1 : 0)
    const total = pool.reduce((sum, pattern) => sum + weight(pattern), 0)
    let roll = this.rng() * total
    for (const pattern of pool) {
      roll -= weight(pattern)
      if (roll <= 0) return pattern
    }
    return pool[pool.length - 1] ?? PATTERNS[0]
  }

  private openPattern(): void {
    const def = this.pickPattern()
    this.lastPatternId = def.id
    this.patternsSeen += 1
    const early = this.players.some(unit => this.passive(unit) === 'earlyWarning') ? 0.5 : 0
    const interval = BATTLE_RULES.patternInterval[this.phase] + (hasBattleEffect(this.debuffs, 'slow') || hasBattleEffect(this.debuffs, 'flood') ? 0.6 : 0) + (this.easy ? 1.5 : 0)
    const window = Math.min(interval - 0.2, BATTLE_RULES.responseWindow[this.phase] + early + (this.research.window ?? 0) + (this.easy ? 1.5 : 0))
    const [low, high] = this.autoPilot?.reaction ?? [0.6, 1.2]
    this.pattern = { def, at: this.t, deadline: this.t + window, judged: false, inputs: new Set(), reactAt: this.t + low + this.rng() * (high - low) }
    this.nextPatternAt = this.t + interval
    this.events.push({ kind: 'pattern', pattern: def })
    this.log(`적 전술 예고 · ${def.warning}`)
    if (this.autoBreakNext) {
      this.autoBreakNext = false
      this.combo = Math.min(8, this.combo + 1)
      this.resolvePattern(true, def.lanes[0] ?? 1, '계중계')
    }
  }

  private resolvePattern(success: boolean, lane: number, label?: string): void {
    const open = this.pattern
    if (!open || open.judged) return
    open.judged = true
    this.events.push({ kind: 'answer', lane, success })
    if (success) {
      this.breaks += 1
      this.combo = Math.min(8, this.combo + 1)
      this.maxCombo = Math.max(this.maxCombo, this.combo)
      let morale = 6 + this.combo * 2
      // 열세일수록 파훼가 더 크게 먹힌다(최대 25레벨분)
      if (this.levelGap > 0) morale = Math.round(morale * (1 + Math.min(25, this.levelGap) * BATTLE_RULES.gapBreakBonus))
      const breaker = this.players[lane]
      if (breaker && breaker.troops > 0) this.heal(breaker, breaker.maxTroops * BATTLE_RULES.breakHeal)
      const flank = lane === 0 || lane === 2
      const flankUnit = this.players[lane]
      if (flank && flankUnit && this.passive(flankUnit) === 'flankMorale') morale += flankUnit.def.passive?.value ?? 4
      if (flank && flankUnit && this.passive(flankUnit) === 'flankCharge') this.pendingFlankBonus = flankUnit.def.passive?.value ?? 0.2
      this.drainMorale(morale)
      let gauge = BATTLE_RULES.gaugeOnBreak * (hasBattleEffect(this.buffs, 'war-chant') ? 1.25 : 1)
      if (this.players.some(unit => this.passive(unit) === 'gaugeOnBreak')) gauge += 3
      this.gauge = Math.min(100, this.gauge + gauge)
      this.threat = Math.max(0, this.threat - 10 - (this.research.breakThreat ?? 0))
      this.players.forEach(unit => { if (this.passive(unit) === 'cdOnBreak') unit.cd = Math.max(0, unit.cd - (unit.def.passive?.value ?? 1)) })
      this.lastCommandFailed = false
      this.log(`${label ?? this.players[lane]?.general.name ?? '아군'} · ${open.def.label} 파훼 · 연계 ${this.combo} · 적 사기 −${morale}`, 'jade')
    } else {
      this.combo = 0
      this.lastCommandFailed = true
      this.raiseThreat(BATTLE_RULES.threatWrong, 'wrong')
      this.log(`${open.def.label}에 잘못 대응 · 위협도 ${Math.round(this.threat)}`, 'ember')
    }
  }

  private expirePattern(): void {
    const open = this.pattern
    if (!open || open.judged || this.t < open.deadline) return
    // 거짓 후퇴는 끝까지 참으면 파훼
    if (open.def.kind === 'hold') return this.resolvePattern(true, -1, '침착 대응')
    open.judged = true
    this.combo = 0
    this.lastCommandFailed = true
    this.events.push({ kind: 'answer', lane: -1, success: false })
    const lanes = open.def.kind === 'guard' ? [1, 1] : open.def.lanes
    lanes.forEach(lane => { const target = this.laneTarget(this.players, lane); if (target) this.dealDamage(target, BATTLE_RULES.noAnswerTroopDamage * (1 + this.phase * 0.5), open.def.label, null) })
    this.raiseThreat(BATTLE_RULES.threatNoAnswer, 'none')
    this.log(`${open.def.label}에 대응하지 못했습니다 · 위협도 ${Math.round(this.threat)}`, 'ember')
  }

  /** 무장 버튼(레인) 입력: 예고 하나에 첫 입력만 판정한다. */
  command(lane: number): void {
    if (!this.active) return
    const open = this.pattern
    if (!open || open.judged) return
    if (open.def.kind === 'lane') return this.resolvePattern(open.def.lanes.includes(lane), lane)
    if (open.def.kind === 'guard') return this.resolvePattern(false, lane)
    // 거짓 후퇴: 쫓아가면(버튼을 누르면) 걸려든다
    if (open.def.kind === 'hold') return this.resolvePattern(false, lane)
    if (!open.def.lanes.includes(lane)) return this.resolvePattern(false, lane)
    open.inputs.add(lane)
    if (open.def.lanes.every(required => open.inputs.has(required))) this.resolvePattern(true, lane, '양익 대응')
  }

  // ── 전술 명령 ────────────────────────────────────
  tacticCost(tactic: BattleTactic): number {
    if (this.freeTactic) return 0
    return Math.round(BATTLE_RULES.tacticCost[tactic] * (hasBattleEffect(this.buffs, 'tactic-discount') ? 0.7 : 1) * (1 - (this.research.tacticCost ?? 0)))
  }

  useTactic(tactic: BattleTactic): boolean {
    if (!this.active) return false
    const cost = this.tacticCost(tactic)
    if (this.gauge < cost) { this.log('전술 게이지가 부족합니다. 적 예고를 파훼해 게이지를 모으십시오.', 'ember'); return false }
    this.gauge -= cost
    if (cost === 0 && this.freeTactic) this.freeTactic = false
    if (tactic === 'guard') {
      this.guardTimer = BATTLE_RULES.guardDuration
      this.threat = Math.max(0, this.threat - 25)
      this.log('철벽 태세 · 4.5초 동안 위협도 상승과 적장 스킬 피해를 줄입니다', 'jade')
      if (this.pattern && !this.pattern.judged && this.pattern.def.kind === 'guard') this.resolvePattern(true, 1, '철벽 태세')
      return true
    }
    if (tactic === 'feint') {
      this.combo = Math.min(8, this.combo + 2)
      this.maxCombo = Math.max(this.maxCombo, this.combo)
      const morale = 10 + this.combo * 2
      this.drainMorale(morale)
      this.threat = Math.max(0, this.threat - 10)
      this.log(`유인책 · 연계 ${this.combo} · 적 사기 −${morale}`, 'jade')
      return true
    }
    const morale = 18 + this.combo * 3
    this.drainMorale(morale)
    this.combo = 0
    this.raiseThreat(5, 'raw')
    this.log(`전군 돌격 · 연계를 불태워 적 사기 −${morale}`, 'jade')
    return true
  }

  // ── 스킬 ─────────────────────────────────────────
  skillFx(unit: CoreUnit): SkillFx[] {
    const fx = [...unit.def.active.fx]
    if (isAwakened(this.growth(unit)) && unit.def.awaken) fx.push(...unit.def.awaken.fx)
    return fx
  }

  skillName(unit: CoreUnit): string {
    return isAwakened(this.growth(unit)) && unit.def.awaken ? unit.def.awaken.name : unit.def.active.name
  }

  /** 스킬 1회 사기 피해(상한 적용 후). 화면 미리보기에도 쓴다. */
  skillMorale(unit: CoreUnit, fx = this.skillFx(unit), preview = false): number {
    if (SKILL_TYPE_META[unit.def.type].base === 0) return 0
    let power = baseMoraleDamage(this.growth(unit), unit.base)
    let mult = 1
    const value = unit.def.passive?.value ?? 0
    const id = this.passive(unit)
    if (id === 'partnerPower' && this.hasPlayer(unit.def.passive?.partner ?? '')) mult += value
    if (id === 'factionPower') mult += value * this.players.filter(other => other.def.faction === unit.def.faction).length
    if (id === 'yellowSky') mult += value * this.players.filter(other => YELLOW_TURBAN_IDS.has(other.general.id)).length
    if (id === 'alliance') mult += value * this.players.filter(other => other.def.faction !== unit.def.faction).length
    if (id === 'warlordHost' && this.players.length === 3 && this.players.every(other => other.def.faction === '군웅')) mult += value
    if (id === 'veteran' && unit.general.level >= 30) mult += value
    if (id === 'finalAct' && this.phase === 2) mult += value
    if (id === 'vsHighMorale' && this.morale >= 70) mult += value
    if (id === 'peerless' && this.morale >= 70) mult += value
    if (id === 'vsBurning' && hasBattleEffect(this.debuffs, 'burning')) mult += value
    if (this.bond?.id === 'five-tigers' && (unit.def.type === '돌격' || unit.def.type === '사격')) mult += 0.1
    if (this.bond?.id === 'lu-bu-army') mult += 0.08
    if (!preview && this.pendingFlankBonus > 0 && id === 'flankCharge') mult += this.pendingFlankBonus
    if (unit.def.type === '돌격') mult += this.research.chargeSkill ?? 0
    for (const effect of fx) {
      if (effect.k === 'power') mult *= effect.mult
      if (effect.k !== 'cond') continue
      const lowest = [...this.alive(this.enemies)].sort((left, right) => left.troops / left.maxTroops - right.troops / right.maxTroops)[0]
      if (effect.when === 'firstSkill' && !this.firstSkillUsed) mult *= effect.mult
      if (effect.when === 'enemyMoraleLow' && this.morale <= 30) mult *= effect.mult
      if (effect.when === 'targetLow' && lowest && lowest.troops <= lowest.maxTroops * 0.3) mult *= effect.mult
      if (effect.when === 'centerPattern' && this.pattern && !this.pattern.judged && this.pattern.def.lanes.includes(1)) mult *= effect.mult
      if (effect.when === 'afterGuanYu' && this.lastSkillId === 'guan-yu') mult *= effect.mult
      if (effect.when === 'perFallenEnemy') mult *= 1 + effect.mult * this.enemies.filter(other => other.troops <= 0).length
      if (effect.when === 'early' && this.t <= 7) mult *= effect.mult
      if (effect.when === 'stripped' && this.enemyBuffs.length > 0) mult *= effect.mult
    }
    // 아군 버프·적 디버프. 여포의 약점: 책사가 건 버프 효과 −30%
    let buffMult = 1
    // 아군 공격 강화(통솔형 버프)는 일반 공격뿐 아니라 스킬의 사기 피해에도 붙는다
    let attackUp = effectValue(this.buffs, 'atk-up')
    if (this.buffs.some(effect => effect.id === 'hangover' && effect.remaining <= 3)) attackUp -= effectValue(this.buffs, 'hangover')
    if (unit.general.role === '궁병') attackUp += effectValue(this.buffs, 'archer-focus')
    if (unit.general.role === '기병') attackUp += effectValue(this.buffs, 'cavalry-surge')
    if (attackUp > 0) buffMult *= 1 + attackUp
    if (hasBattleEffect(this.buffs, 'dragon-might')) buffMult *= 1.18
    if (hasBattleEffect(this.buffs, 'chain-fury')) buffMult *= 1.1
    if (hasBattleEffect(this.buffs, 'insight')) buffMult *= 1.5
    if (unit.def.weakness?.id === 'distrust' && !this.luBuCalm() && this.players.some(other => other.general.role === '책사')) buffMult = 1 + (buffMult - 1) * 0.7
    let debuffMult = 1
    if (hasBattleEffect(this.debuffs, 'armor-break')) debuffMult *= 1.22
    if (hasBattleEffect(this.debuffs, 'mark')) debuffMult *= 1.12
    if (hasBattleEffect(this.debuffs, 'flood')) debuffMult *= 1.15
    if (hasBattleEffect(this.debuffs, 'rage')) debuffMult *= 1.25
    for (const effect of fx) if (effect.k === 'afterDebuff' && hasBattleEffect(this.debuffs, 'silence')) debuffMult *= effect.value
    const combo = 1 + Math.min(this.combo, 8) * (hasBattleEffect(this.buffs, 'chain-fury') ? 0.055 : 0.05) * (1 + (this.research.combo ?? 0))
    const flat = hasBattleEffect(this.buffs, 'hawk-eye') ? 4 : 0
    power = (power * mult + flat) * buffMult * debuffMult * combo
    const hits = fx.find((effect): effect is Extract<SkillFx, { k: 'hits' }> => effect.k === 'hits')
    if (hits) power *= hits.n * hits.each
    return Math.round(Math.min(SKILL_MORALE_CAP + (this.research.capBonus ?? 0), power) * 10) / 10
  }

  castSkill(lane: number): boolean {
    if (!this.active) return false
    const unit = this.players[lane]
    if (!unit || unit.troops <= 0) return false
    if (!unit.skillOn) { this.log(`${unit.general.name}의 스킬은 아직 해금되지 않았습니다.`, 'ember'); return false }
    if (unit.cd > 0) { this.log(`${unit.general.name} 스킬 재사용 대기 · ${unit.cd.toFixed(1)}초`, 'ember'); return false }
    const fx = this.skillFx(unit)
    const name = this.skillName(unit)
    const morale = this.skillMorale(unit, fx)
    let stripped = 0
    let ignoreDr = false
    let aoe = hasBattleEffect(this.debuffs, 'chain')
    const notes: string[] = []
    for (const effect of fx) {
      if (effect.k === 'strip') { stripped += this.enemyBuffs.length; this.enemyBuffs.splice(0, effect.n >= 99 ? this.enemyBuffs.length : effect.n) }
      if (effect.k === 'ignoreDr') ignoreDr = true
      if (effect.k === 'aoe') aoe = true
    }
    if (morale > 0) this.drainMorale(morale)
    if (morale > 0) {
      const troopDamage = morale * BATTLE_RULES.skillTroopDamagePerMorale
      if (aoe) this.alive(this.enemies).forEach(target => this.dealDamage(target, troopDamage * 0.6, name, unit, { ignoreDr }))
      else {
        const target = unit.def.type === '사격'
          ? [...this.alive(this.enemies)].sort((left, right) => left.troops / left.maxTroops - right.troops / right.maxTroops)[0]
          : this.targetFor(this.enemies, unit.lane)
        if (target) { this.lastSkillTarget = target.lane; this.dealDamage(target, troopDamage, name, unit, { ignoreDr }) }
      }
    }
    for (const effect of fx) notes.push(...this.applyFx(unit, effect))
    if (this.pendingFlankBonus > 0 && this.passive(unit) === 'flankCharge') this.pendingFlankBonus = 0
    this.buffs = this.buffs.filter(effect => effect.id !== 'insight' || unit.general.id === 'guo-jia')
    let cooldown = unit.cdMax
    if (this.passive(unit) === 'cdIfAllyLow' && this.players.some(other => other.troops > 0 && other.troops <= other.maxTroops * 0.3)) cooldown -= unit.def.passive?.value ?? 2
    if (this.passive(unit) === 'cdPerCombo') cooldown -= (unit.def.passive?.value ?? 0.3) * this.combo
    if (hasBattleEffect(this.buffs, 'battle-focus')) cooldown -= 1.5
    unit.cd = Math.max(3, cooldown)
    this.firstSkillUsed = true
    this.lastSkillId = unit.general.id
    if (stripped) notes.unshift(`적 강화 ${stripped}개 제거`)
    // 스킬 카운터: 같은 레인 적장이 스킬을 예고 중이면 공격형 스킬로 끊어 낸다
    const foe = this.enemies[lane]
    if (foe && foe.warned && foe.troops > 0 && (unit.def.type === '돌격' || unit.def.type === '사격' || unit.def.type === '계략')) {
      foe.warned = false
      foe.cd = foe.cdMax * 0.5
      this.combo = Math.min(8, this.combo + 1)
      this.maxCombo = Math.max(this.maxCombo, this.combo)
      this.drainMorale(10)
      notes.push(`「${foe.def.active.name}」 차단 · 적 사기 −10`)
      this.events.push({ kind: 'counter', lane, name: foe.def.active.name })
    }
    // 치유·수호형도 승리에 이바지하도록: 쓰면 연계 +1과 작은 사기 피해(군심 고양)
    if (unit.def.type === '치유' || unit.def.type === '수호') {
      this.combo = Math.min(8, this.combo + 1)
      this.maxCombo = Math.max(this.maxCombo, this.combo)
      const rally = 6 + this.combo
      this.drainMorale(rally)
      notes.push(`군심 고양 · 연계 ${this.combo} · 적 사기 −${rally}`)
    }
    this.events.push({ kind: 'skill', side: 'player', lane, name, morale, type: unit.def.type, target: this.skillFocus(this.enemies, unit) })
    this.log(`${unit.general.name} · 「${name}」${morale > 0 ? ` · 적 사기 −${morale}` : ''}${notes.length ? ` · ${notes.join(' · ')}` : ''}`, 'jade')
    return true
  }

  private applyFx(unit: CoreUnit, effect: SkillFx): string[] {
    const healBoost = (1 + this.players.reduce((sum, other) => sum + (this.passive(other) === 'healBoost' ? other.def.passive?.value ?? 0 : 0), 0))
      * (BATTLE_RULES.healGrade[unit.general.grade] ?? 1) * mainStatGrowth(this.growth(unit), unit.base, unit.def.type)
    switch (effect.k) {
      case 'debuff': {
        let seconds = effect.sec
        if (effect.id === 'burning') {
          if (hasBattleEffect(this.buffs, 'east-wind')) seconds += 3
          if (this.bond?.id === 'red-cliffs') seconds += 2
        }
        if ((effect.id === 'burning' || effect.id === 'fear') && hasBattleEffect(this.buffs, 'chaos-craft') && hasBattleEffect(this.debuffs, 'rage')) seconds *= 1.5
        if (unit.general.stars >= 4 && unit.def.type !== '돌격') seconds += 1
        this.addEffect('debuff', effect.id, Math.min(10, seconds))
        return [BATTLE_EFFECTS[effect.id].name]
      }
      case 'buff': {
        // 통솔형은 버프가 더 오래, 등급만큼 더 세게(예전에는 천명 통솔형이 신병과 성적이 같았다)
        const command = unit.def.type === '통솔'
        const sec = effect.sec + (unit.general.stars >= 4 ? 1 : 0) + (command ? BATTLE_RULES.commandBuffSec : 0)
        const value = command && effect.value !== undefined ? effect.value * (BATTLE_RULES.commandBuffGrade[unit.general.grade] ?? 1) : effect.value
        this.addEffect('buff', effect.id, Math.min(command ? 14 : 12, sec), value)
        return [BATTLE_EFFECTS[effect.id].name]
      }
      case 'selfDr': unit.selfDr = { value: effect.value, until: this.t + effect.sec }; return [`받는 피해 −${Math.round(effect.value * 100)}%`]
      case 'selfAtk': unit.selfAtk = { value: effect.value, until: this.t + effect.sec }; return [`공격 +${Math.round(effect.value * 100)}%`]
      case 'undying': unit.undyingLeft = Math.max(1, unit.undyingLeft); return ['불굴']
      case 'bodyguard': {
        const others = this.alive(this.players).filter(other => other !== unit)
        const ward = effect.who === 'lowest'
          ? others.sort((left, right) => left.troops / left.maxTroops - right.troops / right.maxTroops)[0]
          : others.sort((left, right) => right.general.attack + right.general.martial - left.general.attack - left.general.martial)[0]
        if (!ward) return []
        unit.guarding = { ward: ward.lane, until: this.t + effect.sec }
        return [`${ward.general.name} 호위`]
      }
      case 'heal': {
        const targets = effect.target === 'all' ? this.alive(this.players) : [...this.alive(this.players)].sort((left, right) => left.troops / left.maxTroops - right.troops / right.maxTroops).slice(0, 1)
        targets.forEach(target => this.heal(target, target.maxTroops * effect.pct / 100 * healBoost))
        return [`병력 ${Math.round(effect.pct * healBoost)}% 회복`]
      }
      case 'hot': this.hot = { perSec: effect.pctPerSec * healBoost, until: this.t + effect.sec }; return ['지속 회복']
      case 'cleanse': {
        const count = Math.min(this.playerDebuffs.length, effect.n)
        this.playerDebuffs.splice(0, count)
        return count ? [`상태이상 ${count}개 해제`] : []
      }
      case 'gauge': this.gauge = Math.min(100, this.gauge + effect.n); return [`게이지 +${effect.n}`]
      case 'threat': this.threat = Math.max(0, this.threat + effect.n); return [`위협도 ${effect.n}`]
      case 'condThreat': if (this.lastCommandFailed) { this.threat = Math.max(0, this.threat + effect.n); return [`위협도 ${effect.n}`] } return []
      case 'selfCost': unit.troops = Math.max(1, Math.round(unit.troops - unit.maxTroops * effect.pct / 100)); return [`자기 병력 −${effect.pct}%`]
      case 'allyCd': {
        const others = this.players.filter(other => other !== unit && other.troops > 0 && (effect.scope === 'all' || other.general.role === '기병'))
        const targets = effect.scope === 'all' ? others : others.sort((left, right) => right.cd - left.cd).slice(0, 1)
        targets.forEach(other => { other.cd = Math.max(0, other.cd - effect.sec) })
        return targets.length ? [`아군 쿨다운 −${effect.sec}초`] : []
      }
      case 'delayPattern':
        this.nextPatternAt += effect.sec
        if (this.pattern && !this.pattern.judged) this.pattern.deadline += effect.sec
        return ['적 예고 지연']
      case 'autoBreak': this.autoBreakNext = true; return ['다음 예고 자동 대응']
      case 'freeTactic': this.freeTactic = true; return ['다음 전술 비용 0']
      default: return []
    }
  }

  private hot: { perSec: number; until: number } | null = null

  private heal(unit: CoreUnit, amount: number): void {
    if (unit.troops <= 0) return
    const value = Math.round(Math.min(unit.maxTroops - unit.troops, amount))
    if (value <= 0) return
    unit.troops += value
    this.events.push({ kind: 'heal', side: unit.side, lane: unit.lane, amount: value })
  }

  // ── 적장 스킬 ────────────────────────────────────
  private enemySkills(delta: number): void {
    const silenced = hasBattleEffect(this.debuffs, 'silence')
    for (const unit of this.enemies) {
      if (!unit.skillOn || unit.troops <= 0 || silenced) continue
      unit.cd -= delta
      if (!unit.warned && unit.cd <= BATTLE_RULES.enemySkillWarning + (this.research.enemyWarn ?? 0)) {
        unit.warned = true
        this.events.push({ kind: 'enemySkillWarn', lane: unit.lane, name: unit.def.active.name })
        this.log(`적장 스킬 예고 · ${unit.general.name}의 「${unit.def.active.name}」 · 철벽 태세로 막거나, 같은 레인 무장의 스킬로 끊으십시오`, 'ember')
      }
      if (unit.cd > 0) continue
      unit.cd = unit.cdMax
      unit.warned = false
      this.fireEnemySkill(unit)
    }
  }

  private fireEnemySkill(unit: CoreUnit): void {
    const guarded = this.guardTimer > 0
    const name = unit.def.active.name
    const power = Math.min(SKILL_MORALE_CAP, baseMoraleDamage(this.growth(unit), unit.base))
    const shortDebuff = this.players.some(other => this.passive(other) === 'shortDebuff') ? 1 : 0
    const type = unit.def.type
    const strikeTarget = type === '돌격' || type === '사격' ? (type === '사격' ? [...this.alive(this.players)].sort((left, right) => left.troops - right.troops)[0] : this.targetFor(this.players, unit.lane)) : undefined
    if (strikeTarget) this.lastSkillTarget = strikeTarget.lane
    this.events.push({ kind: 'skill', side: 'enemy', lane: unit.lane, name, morale: 0, type: unit.def.type, target: this.skillFocus(this.players, unit) })
    if (type === '돌격' || type === '사격') {
      const target = strikeTarget
      if (target) this.dealDamage(target, Math.max(40, power * BATTLE_RULES.enemySkillTroopPerMorale) * (guarded ? 0.5 : 1), name, unit)
    } else if (type === '계략') {
      const id: PlayerDebuffId = FIRE_IDS.has(unit.general.id) ? 'p-burn' : unit.general.id === 'zhang-jiao' || unit.general.id === 'zhang-bo' || unit.def.active.fx.some(effect => effect.k === 'debuff' && (effect.id === 'confusion' || effect.id === 'blind')) ? 'p-confuse' : 'p-fear'
      this.addEffect('pdebuff', id, (6 - shortDebuff) * (guarded ? 0.5 : 1))
    } else if (type === '치유') {
      this.alive(this.enemies).forEach(other => this.heal(other, other.maxTroops * 0.08))
    } else {
      this.addEffect('ebuff', 'e-guard', 6, 0.2)
    }
    if (!guarded && type !== '치유') this.raiseThreat(BATTLE_RULES.threatEnemySkill, 'skill')
    this.log(`적장 ${unit.general.name} · 「${name}」${guarded ? ' · 철벽 태세로 피해 절반' : ''}`, 'ember')
  }

  // ── 진행 ─────────────────────────────────────────
  tick(delta: number): void {
    if (!this.active) return
    const dt = Math.min(0.25, Math.max(0, delta))
    this.t += dt
    this.tickEffects(dt)
    this.guardTimer = Math.max(0, this.guardTimer - dt)
    this.gauge = Math.min(100, this.gauge + dt * BATTLE_RULES.gaugeRegen)
    this.threat = Math.max(0, this.threat - dt * (BATTLE_RULES.threatDecay + (hasBattleEffect(this.buffs, 'iron-wall') ? 4 : 0)))
    const cdRate = hasBattleEffect(this.buffs, 'swift-step') ? 1.25 : 1
    this.players.forEach(unit => { if (unit.troops > 0 && unit.skillOn) unit.cd = Math.max(0, unit.cd - dt * cdRate) })
    if (this.hot && this.hot.until > this.t) this.alive(this.players).forEach(unit => this.heal(unit, unit.maxTroops * this.hot!.perSec / 100 * dt))
    if (hasBattleEffect(this.playerDebuffs, 'p-burn')) this.alive(this.players).forEach(unit => this.dealDamage(unit, unit.maxTroops * 0.006 * dt * (unit.def.weakness?.id === 'weakToFire' ? 1.2 : 1), '화상', null))
    if (this.t >= this.nextPatternAt) {
      this.expirePattern()
      this.openPattern()
    }
    this.expirePattern()
    this.runAutoPilot()
    this.enemySkills(dt)
    this.autoCombat(dt)
    const burnRate = 2.2 * (hasBattleEffect(this.buffs, 'east-wind') ? 1.5 : 1) * (hasBattleEffect(this.debuffs, 'chain') ? 1.5 : 1) * (1 + (this.research.fire ?? 0))
    const drain = BATTLE_RULES.moraleDrain * (hasBattleEffect(this.buffs, 'rally-banner') ? 1.35 : 1)
      + (hasBattleEffect(this.debuffs, 'burning') ? burnRate : 0)
      + (hasBattleEffect(this.debuffs, 'fear') ? 1.5 : 0)
      + (hasBattleEffect(this.debuffs, 'bleed') ? 1.3 : 0)
    this.drainMorale(drain * dt)
    if (!this.timeWarned && this.t >= BATTLE_RULES.timeLimit - BATTLE_RULES.timeWarnAt) {
      this.timeWarned = true
      this.events.push({ kind: 'timeWarn', left: BATTLE_RULES.timeWarnAt })
      this.log(`남은 시간 ${BATTLE_RULES.timeWarnAt}초 · 적 사기를 서둘러 무너뜨리십시오`, 'ember')
    }
    this.checkPhase()
    this.checkEnd()
  }

  private checkPhase(): void {
    if (this.morale > 0 || !this.active) return
    if (this.phase >= 2) return this.finish(true, 'morale')
    this.phase += 1
    const fracture = hasBattleEffect(this.debuffs, 'fracture') ? 0.85 : 1
    const finalAct = this.phase === 2 ? 1 - (this.research.finalActMorale ?? 0) : 1
    this.moraleMax = Math.round((BATTLE_RULES.moraleByPhase[this.phase] * this.moraleScale + this.moraleBonus) * fracture * finalAct)
    this.morale = this.moraleMax
    this.combo = 0
    this.events.push({ kind: 'phase', phase: this.phase })
    this.log(`${phaseName(this.phase)} · 적이 전열을 다시 세웁니다 (사기 ${this.moraleMax})`, 'jade')
  }

  private checkEnd(): void {
    if (!this.active) return
    const playerTroops = this.players.reduce((sum, unit) => sum + unit.troops, 0)
    const enemyTroops = this.enemies.reduce((sum, unit) => sum + unit.troops, 0)
    if (enemyTroops <= 0) return this.finish(true, 'wipe')
    if (playerTroops <= 0) return this.finish(false, 'troops')
    if (this.collapses >= BATTLE_RULES.collapsesToLose) return this.finish(false, 'collapse')
    if (this.t >= BATTLE_RULES.timeLimit) {
      if (this.mode === 'duel') {
        const mine = playerTroops / Math.max(1, this.players.reduce((sum, unit) => sum + unit.maxTroops, 0))
        const theirs = enemyTroops / this.enemyMaxTotal
        return this.finish(mine > theirs, 'ratio')
      }
      return this.finish(false, 'timeout')
    }
  }

  private finish(won: boolean, reason: BattleResult['reason']): void {
    this.active = false
    const playerTroops = this.players.reduce((sum, unit) => sum + unit.troops, 0)
    const maxTroops = Math.max(1, this.players.reduce((sum, unit) => sum + unit.maxTroops, 0))
    const troopRatio = playerTroops / maxTroops
    // 별: 승리 1 + 병력 60% 이상 1 + (전열 붕괴 없음 그리고 예고 파훼율 60% 이상) 1
    const breakRate = this.patternsSeen ? this.breaks / this.patternsSeen : 1
    const stars = won ? 1 + (troopRatio >= 0.6 ? 1 : 0) + (this.collapses === 0 && breakRate >= 0.6 ? 1 : 0) : 0
    // 랭킹 점수는 시즌이 바뀔 때까지 기존 공식을 유지한다(병력은 2배가 되었으므로 절반으로 환산).
    const score = Math.max(0, Math.round(4200 + this.maxCombo * 240 + (100 - this.threat) * 18 + playerTroops / BATTLE_RULES.troopScale * 1.4
      + this.players.reduce((sum, unit) => sum + unit.general.level * 41 + unit.general.leadership + unit.general.martial + unit.general.stratagem + unit.general.speed, 0)))
    this.result = { won, reason, stars, score, durationMs: Math.round(this.t * 1000), breaks: this.breaks, patterns: this.patternsSeen, maxCombo: this.maxCombo, troopRatio, collapses: this.collapses }
    this.events.push({ kind: 'end', result: this.result })
    const why = { morale: '3막 적 사기를 무너뜨렸습니다', wipe: '적 병력을 전멸시켰습니다', timeout: '90초 안에 끝내지 못했습니다', troops: '아군 병력이 전멸했습니다', collapse: '전열이 두 번 무너졌습니다', ratio: '제한 시간 종료 · 남은 병력 비율로 판정했습니다' }[reason]
    this.log(`${won ? '전투 승리' : '전투 패배'} · ${why}${won ? ` · 별 ${stars}개` : ''}`, won ? 'jade' : 'ember')
  }

  // ── 자동 전투(3성 시나리오·시뮬레이션) ───────────
  private runAutoPilot(): void {
    const pilot = this.autoPilot
    if (!pilot) return
    const open = this.pattern
    if (open && !open.judged && this.t >= open.reactAt) {
      const correct = this.rng() < pilot.accuracy
      if (open.def.kind === 'hold') {
        if (!correct) this.command(1)
        open.reactAt = Number.POSITIVE_INFINITY // 참기로 했으면 다시 판단하지 않는다
      } else if (open.def.kind === 'guard') {
        if (correct && this.gauge >= this.tacticCost('guard')) this.useTactic('guard')
        else if (!correct) this.command(0)
      } else if (correct) open.def.lanes.forEach(lane => this.command(lane))
      else this.command(([0, 1, 2].filter(lane => !open.def.lanes.includes(lane))[0]) ?? 1)
    }
    const warned = this.enemies.some(unit => unit.warned && unit.troops > 0)
    if (warned && this.guardTimer <= 0 && this.gauge >= this.tacticCost('guard') + (this.phase === 2 ? 0 : 10)) this.useTactic('guard')
    this.players.forEach(unit => {
      if (unit.troops <= 0 || !unit.skillOn || unit.cd > 0) return
      const type = unit.def.type
      const hurt = this.players.some(other => other.troops > 0 && other.troops < other.maxTroops * 0.7)
      if (type === '치유' && !hurt && this.playerDebuffs.length === 0) return
      if (type === '수호' && !hurt && !warned) return
      this.castSkill(unit.lane)
    })
    if (this.gauge >= this.tacticCost('charge') + (this.phase === 2 ? this.tacticCost('guard') : 0)) this.useTactic('charge')
  }

  log(text: string, tone?: 'jade' | 'ember'): void {
    this.events.push({ kind: 'log', text, tone })
  }

  drainEvents(): CoreEvent[] {
    return this.events.splice(0)
  }
}

/** 빠른 자동 전투(테스트·밸런스 확인용) */
export function simulateBattle(players: General[], enemies: General[], config: CoreConfig = {}, step = 0.05): BattleResult {
  const core = new BattleCore(players, enemies, config)
  while (core.active && core.t < BATTLE_RULES.timeLimit + 5) {
    core.tick(step)
    core.drainEvents()
  }
  return core.result!
}

export type { BuffId, DebuffId }
