// 밸런스 테스트 계산 — 게임과 같은 전투 규칙(battle-core)·스킬(skills)·장비 공식을 그대로 쓴다.
import { BattleCore, BATTLE_RULES, type BattleMode, type BattleResult } from '../game/battle-core'
import { allGenerals, combatPower, equipmentBonusFromItems, makeEquipment, scaleGeneral, skillPower, skillUnlockLevel, templateGeneral, withEquipmentStats, type Equipment, type EquipmentGrade, type EquipmentSet, type EquipmentType, type General } from '../game/strategy'
import { bondFor, skillCooldownFor, skillDefFor } from '../game/skills'

export const GEAR_TYPES: EquipmentType[] = ['weapon', 'armor', 'accessory']
export interface GearConfig { set: EquipmentSet | 'none'; grade: EquipmentGrade; level: number }
export interface SlotConfig { id: string; level: number; stars: number; skill: boolean; gear: Record<EquipmentType, GearConfig> }
export interface SimSettings { mode: BattleMode; moraleBonus: number; accuracy: number; runs: number }
export interface BalanceConfig { ally: SlotConfig[]; enemy: SlotConfig[]; settings: SimSettings }

export const NO_GEAR: GearConfig = { set: 'none', grade: 'normal', level: 1 }
export const emptyGear = (): Record<EquipmentType, GearConfig> => ({ weapon: { ...NO_GEAR }, armor: { ...NO_GEAR }, accessory: { ...NO_GEAR } })

export function defaultConfig(): BalanceConfig {
  const slot = (id: string, level: number): SlotConfig => ({ id, level, stars: 3, skill: true, gear: emptyGear() })
  return {
    ally: [slot('guan-yu', 20), slot('zhuge-liang', 20), slot('liu-bei', 20)],
    enemy: [slot('zhang-jiao', 20), slot('zhang-bo', 20), slot('zhang-liang', 20)],
    settings: { mode: 'normal', moraleBonus: 0, accuracy: 0.7, runs: 200 },
  }
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Math.trunc(Number(value))
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

/** 저장·공유된 설정을 안전한 값으로 고친다(모르는 무장 id, 범위 밖 숫자 등). */
export function sanitizeConfig(raw: unknown): BalanceConfig {
  const base = defaultConfig()
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<BalanceConfig>
  const ids = new Set(allGenerals().map(general => general.id))
  const sets = new Set(['none', 'command', 'martial', 'stratagem', 'speed'])
  const grades = new Set(['normal', 'rare', 'unique', 'legendary', 'mythic'])
  const slot = (value: unknown, fallback: SlotConfig): SlotConfig => {
    const s = (value && typeof value === 'object' ? value : {}) as Partial<SlotConfig>
    const gear = emptyGear()
    GEAR_TYPES.forEach(type => {
      const g = (s.gear?.[type] ?? {}) as Partial<GearConfig>
      gear[type] = { set: sets.has(String(g.set)) ? g.set as GearConfig['set'] : 'none', grade: grades.has(String(g.grade)) ? g.grade as EquipmentGrade : 'normal', level: clampInt(g.level, 1, 20, 1) }
    })
    return { id: typeof s.id === 'string' && ids.has(s.id) ? s.id : fallback.id, level: clampInt(s.level, 1, 60, fallback.level), stars: clampInt(s.stars, 1, 5, fallback.stars), skill: s.skill === undefined ? fallback.skill : Boolean(s.skill), gear }
  }
  const settings = (input.settings ?? {}) as Partial<SimSettings>
  const modes = new Set(['normal', 'scenario', 'siege', 'duel'])
  return {
    ally: base.ally.map((fallback, index) => slot(input.ally?.[index], fallback)),
    enemy: base.enemy.map((fallback, index) => slot(input.enemy?.[index], fallback)),
    settings: {
      mode: modes.has(String(settings.mode)) ? settings.mode as BattleMode : 'normal',
      moraleBonus: clampInt(settings.moraleBonus, 0, 50, 0),
      accuracy: Math.max(0, Math.min(1, Number(settings.accuracy ?? 0.7) || 0)),
      runs: clampInt(settings.runs, 10, 2000, 200),
    },
  }
}

export function slotItems(slot: SlotConfig): Equipment[] {
  return GEAR_TYPES.filter(type => slot.gear[type].set !== 'none').map(type => makeEquipment(type, slot.gear[type].set as EquipmentSet, slot.gear[type].grade, slot.gear[type].level))
}

/** 설정 한 칸 → 전투에 들어갈 무장(레벨·성급 성장 + 장비 보너스) */
export function buildGeneral(slot: SlotConfig): General {
  const template = templateGeneral(slot.id) ?? allGenerals()[0]
  const grown = scaleGeneral({ ...template, level: 1, stars: 1 }, slot.level, slot.stars)
  return withEquipmentStats({ ...grown, skillUnlocked: slot.skill }, equipmentBonusFromItems(slotItems(slot)))
}

export interface SlotPreview { general: General; power: number; skillName: string; skillType: string; morale: number; cooldown: number; passive: string; passiveOn: boolean; unlockLevel: number }

export function previewSlot(slot: SlotConfig): SlotPreview {
  const general = buildGeneral(slot)
  const template = templateGeneral(slot.id) ?? general
  const def = skillDefFor(general.id, general.role)
  return {
    general,
    power: combatPower(general),
    skillName: def.active.name,
    skillType: def.type,
    morale: skillPower(general),
    cooldown: skillCooldownFor(general, template),
    passive: def.passive ? `${def.passive.name} — ${def.passive.desc}` : '',
    passiveOn: Boolean(def.passive) && slot.stars >= 3,
    unlockLevel: skillUnlockLevel(general),
  }
}

export function teamBond(team: SlotConfig[]): string {
  const bond = bondFor(team.map(slot => slot.id))
  return bond ? `${bond.name} · ${bond.desc}` : ''
}

export interface LaneStats { name: string; casts: number; morale: number; troopsLeft: number }
export interface BatchSummary {
  runs: number
  wins: number
  winRate: number
  avgTime: number
  avgTimeWin: number
  stars: [number, number, number, number]
  reasons: Record<string, number>
  avgTroopRatio: number
  avgBreakRate: number
  avgMaxCombo: number
  avgCollapses: number
  ally: LaneStats[]
  enemy: LaneStats[]
}

function newCore(ally: General[], enemy: General[], settings: SimSettings, rng?: () => number): BattleCore {
  return new BattleCore(ally, enemy, {
    mode: settings.mode,
    moraleBonus: settings.mode === 'siege' ? settings.moraleBonus : 0,
    rng,
    autoPilot: settings.accuracy > 0 ? { accuracy: settings.accuracy, reaction: [0.6, 1.4] } : null,
  })
}

/** 한 판을 끝까지 돌리고 무장별 스킬 사용·사기 피해를 센다. */
function playOne(ally: General[], enemy: General[], settings: SimSettings, lanes: { ally: LaneStats[]; enemy: LaneStats[] }, rng?: () => number): BattleResult {
  const core = newCore(ally, enemy, settings, rng)
  while (core.active) {
    core.tick(0.05)
    for (const event of core.drainEvents()) {
      if (event.kind !== 'skill') continue
      const lane = (event.side === 'player' ? lanes.ally : lanes.enemy)[event.lane]
      if (lane) { lane.casts += 1; lane.morale += event.morale }
    }
  }
  core.players.forEach((unit, index) => { if (lanes.ally[index]) lanes.ally[index].troopsLeft += unit.troops / unit.maxTroops })
  core.enemies.forEach((unit, index) => { if (lanes.enemy[index]) lanes.enemy[index].troopsLeft += unit.troops / unit.maxTroops })
  return core.result!
}

/** N판 반복. 화면이 멈추지 않도록 묶음마다 쉬며 진행률을 알린다. */
export async function runBatch(config: BalanceConfig, onProgress?: (done: number, total: number) => void, options: { rng?: () => number; chunk?: number } = {}): Promise<BatchSummary> {
  const ally = config.ally.map(buildGeneral)
  const enemy = config.enemy.map(buildGeneral)
  const total = config.settings.runs
  const lanes = { ally: ally.map(general => ({ name: general.name, casts: 0, morale: 0, troopsLeft: 0 })), enemy: enemy.map(general => ({ name: general.name, casts: 0, morale: 0, troopsLeft: 0 })) }
  const results: BattleResult[] = []
  const chunk = options.chunk ?? 25
  for (let done = 0; done < total;) {
    const until = Math.min(total, done + chunk)
    for (; done < until; done += 1) results.push(playOne(ally, enemy, config.settings, lanes, options.rng))
    onProgress?.(done, total)
    if (done < total) await new Promise(resolve => setTimeout(resolve, 0))
  }
  return summarize(results, lanes)
}

export function summarize(results: BattleResult[], lanes: { ally: LaneStats[]; enemy: LaneStats[] }): BatchSummary {
  const runs = Math.max(1, results.length)
  const wins = results.filter(result => result.won)
  const stars: [number, number, number, number] = [0, 0, 0, 0]
  const reasons: Record<string, number> = {}
  results.forEach(result => { stars[result.stars] += 1; reasons[result.reason] = (reasons[result.reason] ?? 0) + 1 })
  const avg = (pick: (result: BattleResult) => number, list = results) => list.length ? list.reduce((sum, result) => sum + pick(result), 0) / list.length : 0
  const per = (lane: LaneStats): LaneStats => ({ name: lane.name, casts: lane.casts / runs, morale: lane.morale / runs, troopsLeft: lane.troopsLeft / runs })
  return {
    runs: results.length,
    wins: wins.length,
    winRate: wins.length / runs,
    avgTime: avg(result => result.durationMs / 1000),
    avgTimeWin: avg(result => result.durationMs / 1000, wins),
    stars,
    reasons,
    avgTroopRatio: avg(result => result.troopRatio),
    avgBreakRate: avg(result => result.patterns ? result.breaks / result.patterns : 0),
    avgMaxCombo: avg(result => result.maxCombo),
    avgCollapses: avg(result => result.collapses),
    ally: lanes.ally.map(per),
    enemy: lanes.enemy.map(per),
  }
}

export interface TimelineLine { t: number; text: string; tone?: 'jade' | 'ember' }

/** 한 판 상세: 시간과 함께 전투 기록을 남긴다. */
export function runSingle(config: BalanceConfig, rng?: () => number): { result: BattleResult; timeline: TimelineLine[] } {
  const core = newCore(config.ally.map(buildGeneral), config.enemy.map(buildGeneral), config.settings, rng)
  const timeline: TimelineLine[] = []
  const take = () => core.drainEvents().forEach(event => { if (event.kind === 'log') timeline.push({ t: core.t, text: event.text, tone: event.tone }) })
  take()
  while (core.active) { core.tick(0.05); take() }
  return { result: core.result!, timeline }
}

export interface SweepPoint { offset: number; enemyLevel: number; winRate: number; avgTime: number }

/** 레벨 차이 분석: 적 레벨만 바꿔 가며 승률을 잰다. */
export async function runLevelSweep(config: BalanceConfig, offsets = [-10, -5, 0, 5, 10, 15, 20, 25, 30], onProgress?: (done: number, total: number) => void): Promise<SweepPoint[]> {
  const runs = Math.max(30, Math.round(config.settings.runs / 4))
  const points: SweepPoint[] = []
  for (let index = 0; index < offsets.length; index += 1) {
    const offset = offsets[index]
    const shifted: BalanceConfig = { ...config, enemy: config.enemy.map(slot => ({ ...slot, level: Math.max(1, Math.min(60, slot.level + offset)) })), settings: { ...config.settings, runs } }
    const summary = await runBatch(shifted)
    points.push({ offset, enemyLevel: Math.round(shifted.enemy.reduce((sum, slot) => sum + slot.level, 0) / shifted.enemy.length), winRate: summary.winRate, avgTime: summary.avgTime })
    onProgress?.(index + 1, offsets.length)
  }
  return points
}

export const RULES = BATTLE_RULES
