// 무장별 추천 덱: 고른 무장이 들어간 3인 조합을 다섯 유형(스킬 연계·버티기·초반 끝내기·디버프·유틸)마다 하나씩 추천한다.
// 지금 키운 정도(레벨·성급·장비)는 따지지 않는다: 모든 무장을 같은 기준(Lv30·3성)으로 놓고 스킬 설계만 본다.
// 진형 규칙(가운데=전열: 적 공격 30%가 먼저 오고 받는 피해 −20%, 수호형이면 도발·피해 −40%)을 반영해
// 가운데에는 수호형(없으면 가장 단단한 무장)을 세운다. 가중치는 전투 시뮬레이션으로 맞췄다(tests/formation-advice.test.ts).
import { GENERAL_SKILLS, bondFor, type BondDef, type GeneralSkillDef } from './skills'
import { allGenerals, combatPower, frontLineOrder, scaleGeneral, type General } from './strategy'

export type Archetype = 'chain' | 'sustain' | 'early' | 'debuff' | 'utility'
export const ARCHETYPES: Archetype[] = ['chain', 'sustain', 'early', 'debuff', 'utility']
export const ARCHETYPE_META: Record<Archetype, { label: string; desc: string }> = {
  chain: { label: '스킬 연계', desc: '앞 무장의 스킬이 다음 스킬을 키운다' },
  sustain: { label: '버티기', desc: '전열 수호형이 맞아 주고 회복으로 오래 버틴다' },
  early: { label: '초반 끝내기', desc: '전투 시작부터 몰아쳐 빨리 끝낸다' },
  debuff: { label: '디버프', desc: '공포·혼란·침묵·낙인으로 적을 묶는다' },
  utility: { label: '유틸', desc: '전술 게이지·쿨다운·예고 대응을 돕는다' },
}

interface Profile {
  general: General
  def: GeneralSkillDef
  power: number
  dmg: number
  tank: number
  heal: number
  debuff: number
  util: number
  early: number
  burning: boolean
  chainer: boolean
  marker: boolean
}

const DEBUFF_WEIGHT: Record<string, number> = { fear: 0.5, confusion: 0.6, silence: 0.8, mark: 0.7, 'armor-break': 0.5, fracture: 0.5, burning: 0.5, chain: 0.5, slow: 0.3, rage: 0.4, blind: 0.4, bleed: 0.3, flood: 0.4 }
const UTIL_BUFF: Record<string, number> = { 'atk-up': 0.3, 'tactic-discount': 0.5, 'jade-command': 0.4, insight: 0.3, 'swift-step': 0.3, 'phoenix-guard': 0.3, 'archer-focus': 0.2, 'cavalry-surge': 0.2, 'east-wind': 0.3, 'iron-wall': 0.2 }
const PASSIVE_TANK = new Set(['lowTroopDr', 'highTroopDr', 'undyingOnce', 'undyingMorale', 'factionDr', 'defenseBattle', 'cdOnHit', 'deathRally'])
const PASSIVE_UTIL: Record<string, number> = { earlyWarning: 0.6, failThreatCut: 0.4, cdForStrategists: 0.3, gaugeOnBreak: 0.4, threatSave: 0.4, crossfireGuard: 0.3, cdPerCombo: 0.2, alliance: 0.2, cdOnBreak: 0.3 }
const PASSIVE_EARLY: Record<string, number> = { earlyAtk: 0.8, firstStrike: 0.6, fastOpener: 0.6, vsHighMorale: 0.6, peerless: 0.5, resetOnKill: 0.3, startFear: 0.4, flankMorale: 0.2 }

let cache: Map<string, Profile> | null = null

/** 무장마다 스킬 설계에서 뽑은 성향(같은 기준 Lv30·3성) */
function profiles(): Map<string, Profile> {
  if (cache) return cache
  const list = allGenerals()
  const powers = new Map(list.map(general => [general.id, combatPower(scaleGeneral({ ...general, level: 1, stars: 1 }, 30, 3))]))
  const maxPower = Math.max(...powers.values())
  cache = new Map(list.map(general => {
    const def = GENERAL_SKILLS[general.id]
    const parts = [def.active, def.awaken].filter((part): part is NonNullable<typeof part> => Boolean(part))
    const fx = parts.flatMap(part => part.fx)
    let dmg = def.type === '돌격' ? 1 * def.mult : def.type === '사격' ? 0.8 * def.mult : def.type === '계략' ? 0.3 : def.type === '통솔' ? 0.2 : 0
    let tank = def.type === '수호' ? 1 : 0, heal = 0, debuff = 0, util = 0, early = 0
    let burning = false, chainer = false, marker = false
    for (const f of fx) {
      if (f.k === 'hits' || f.k === 'aoe' || f.k === 'power') dmg += 0.2
      if (f.k === 'debuff') {
        debuff += DEBUFF_WEIGHT[f.id] ?? 0.3
        if (f.id === 'burning') { burning = true; dmg += 0.25 }
        if (f.id === 'chain') chainer = true
        if (f.id === 'mark') marker = true
      }
      if (f.k === 'strip') debuff += 0.6
      if (f.k === 'selfDr' || f.k === 'undying') tank += 0.4
      if (f.k === 'bodyguard') tank += 0.3
      if (f.k === 'buff' && (f.id === 'dr-up' || f.id === 'counter')) tank += f.id === 'dr-up' ? 0.4 : 0.2
      if (f.k === 'heal') heal += f.pct / 10
      if (f.k === 'hot') heal += f.pctPerSec * f.sec / 10
      if (f.k === 'cleanse') heal += 0.3
      if (f.k === 'gauge') util += f.n / 20
      if (f.k === 'allyCd') util += 0.5
      if (f.k === 'threat' && f.n < 0) util += 0.4
      if (f.k === 'delayPattern') util += 0.5
      if (f.k === 'autoBreak') util += 0.8
      if (f.k === 'freeTactic') util += 0.5
      if (f.k === 'buff') util += UTIL_BUFF[f.id] ?? 0
      if (f.k === 'cond' && (f.when === 'firstSkill' || f.when === 'early')) early += 0.6
    }
    const passive = def.passive?.id ?? ''
    if (PASSIVE_TANK.has(passive)) tank += 0.3
    if (passive === 'healBoost') heal += 0.2
    if (passive === 'startFear') debuff += 0.5
    util += PASSIVE_UTIL[passive] ?? 0
    early += (PASSIVE_EARLY[passive] ?? 0) + general.speed / 400
    return [general.id, { general, def, power: (powers.get(general.id) ?? 0) / maxPower, dmg, tank, heal, debuff, util, early, burning, chainer, marker }]
  }))
  return cache
}

const YELLOW = new Set(['zhang-jiao', 'zhang-bo', 'zhang-liang', 'guan-hai', 'zhou-cang'])

/** 두 무장 사이의 연계(한 방향): a가 b를 살린다 */
function pairSynergy(a: Profile, b: Profile): number {
  let score = 0
  const passive = a.def.passive
  if (passive?.partner === b.general.id) score += passive.id === 'calmLuBu' ? 0.9 : 0.7
  if (a.chainer && b.burning) score += 0.8
  if (a.chainer && b.def.active.fx.some(f => f.k === 'aoe')) score += 0.4
  if (a.marker && b.dmg >= 1) score += 0.5
  if (a.def.active.fx.some(f => f.k === 'cond' && f.when === 'afterGuanYu') && b.general.id === 'guan-yu') score += 0.8
  if (passive?.id === 'vsBurning' && b.burning) score += 0.6
  if (passive?.id === 'factionPower' && b.def.faction === '위') score += 0.2
  if (passive?.id === 'factionDr' && b.def.faction === '오') score += 0.2
  if (passive?.id === 'yellowSky' && YELLOW.has(b.general.id)) score += 0.25
  if (passive?.id === 'cdForStrategists' && b.general.role === '책사') score += 0.2
  if (passive?.id === 'alliance' && b.def.faction !== a.def.faction) score += 0.15
  return score
}

export interface ComboAdvice {
  archetype: Archetype
  /** 좌·중(전열)·우 */
  ids: string[]
  bond: BondDef | null
  score: number
  /** 이 조합의 핵심 스킬(무장 · 스킬) */
  keys: string[]
}

function trioScore(trio: Profile[], archetype: Archetype, anchor: Profile = trio[0]): number {
  const front = trio.find(item => item.general.id === frontLineOrder(trio.map(entry => entry.general))[1].id)!
  const sum = (key: 'dmg' | 'tank' | 'heal' | 'debuff' | 'util' | 'early') => trio.reduce((total, item) => total + item[key], 0)
  const power = trio.reduce((total, item) => total + item.power, 0) / 3
  const bondDef = bondFor(trio.map(item => item.general.id))
  const bond = bondDef ? 1 : 0
  const anchorBond = bondDef?.members.includes(anchor.general.id) ? 1 : 0
  let synergy = 0
  // 고른 무장이 낀 연계는 더 크게(그 무장을 중심으로 짠 덱이 되도록), 같은 진영끼리는 조금 가산
  let anchorTie = 0
  for (const a of trio) for (const b of trio) if (a !== b) {
    const value = pairSynergy(a, b)
    synergy += value
    if (a === anchor || b === anchor) anchorTie += value
  }
  for (const other of trio) if (other !== anchor && other.def.faction === anchor.def.faction) anchorTie += 0.12
  if (trio.filter(item => item.general.role === '기병').length >= 2 && trio.some(item => item.def.passive?.id === 'cavalryPair')) synergy += 0.4
  if (trio.every(item => item.def.faction === '군웅') && trio.some(item => item.def.passive?.id === 'warlordHost')) synergy += 0.5
  const frontTank = front.def.type === '수호' ? 1 : Math.min(0.6, (front.general.defense + front.general.leadership) / 400)
  const dmg = sum('dmg')
  // 공격수가 없으면 적 사기를 깎지 못해 진다(시뮬레이션: 지원형만 모은 덱 승률 4~31%)
  const carry = dmg < 0.9 ? -1.6 : dmg < 1.4 ? -0.4 : 0
  const base = power * 0.9 + carry + bond * 0.5 + anchorTie * 0.9
  switch (archetype) {
    // 연계는 고른 무장이 낀 연계·인연이 핵심(다른 둘끼리의 연계는 조금만)
    case 'chain': return base + anchorTie * 1.6 + (synergy - anchorTie) * 0.35 + anchorBond * 1.4 + dmg * 0.3 + frontTank * 0.3
    case 'sustain': return base + (front.def.type === '수호' ? 1.5 : -1) + sum('tank') * 0.6 + sum('heal') * 0.8 + dmg * 0.35
    case 'early': return base + sum('early') * 1.2 + dmg * 0.8 - sum('heal') * 0.3 + frontTank * 0.2
    case 'debuff': return base + sum('debuff') * 1.0 + dmg * 0.4 + frontTank * 0.3 + synergy * 0.4
    // 유틸만 모으면 사기를 못 깎아 진다: 확실한 공격수(돌격·사격)가 있어야 한다
    case 'utility': {
      const strikers = trio.filter(item => item.def.type === '돌격' || item.def.type === '사격').length
      const util = sum('util')
      return base + Math.min(2, util) * 0.9 + (util < 1 ? -1.2 : 0) + Math.min(2.2, dmg) * 0.8 + (strikers === 0 ? -1.2 : 0) + frontTank * 0.3 + synergy * 0.4
    }
  }
}

/** 조합에서 이 유형을 이끄는 스킬 */
function keySkills(trio: Profile[], archetype: Archetype): string[] {
  const weight = (item: Profile) => archetype === 'sustain' ? item.tank + item.heal : archetype === 'early' ? item.early + item.dmg * 0.3 : archetype === 'debuff' ? item.debuff : archetype === 'utility' ? item.util : trio.reduce((total, other) => total + (other !== item ? pairSynergy(item, other) : 0), 0) + item.dmg * 0.1
  return [...trio].sort((left, right) => weight(right) - weight(left)).slice(0, 2).filter(item => weight(item) > 0.05).map(item => `${item.general.name} 「${item.def.active.name}」`)
}

/**
 * 고른 무장이 들어간 추천 조합: 유형마다 하나씩 다섯 개(서로 다른 조합).
 * 무장 70명 전체에서 고르므로 아직 없는 무장도 들어갈 수 있다(화면에서 미보유로 표시).
 */
export function recommendDecks(anchorId: string, archetypes: Archetype[] = ARCHETYPES): ComboAdvice[] {
  const all = profiles()
  const anchor = all.get(anchorId)
  if (!anchor) return []
  const others = [...all.values()].filter(item => item !== anchor)
  const used = new Set<string>()
  const result: ComboAdvice[] = []
  for (const archetype of archetypes) {
    const ranked: Array<{ trio: Profile[]; score: number }> = []
    for (let i = 0; i < others.length; i += 1) for (let j = i + 1; j < others.length; j += 1) {
      const trio = [anchor, others[i], others[j]]
      ranked.push({ trio, score: trioScore(trio, archetype, anchor) })
    }
    ranked.sort((left, right) => right.score - left.score)
    const pick = ranked.find(entry => !used.has(entry.trio.map(item => item.general.id).sort().join()))
    if (!pick) continue
    used.add(pick.trio.map(item => item.general.id).sort().join())
    const ids = frontLineOrder(pick.trio.map(item => item.general)).map(general => general.id)
    result.push({ archetype, ids, bond: bondFor(ids), score: pick.score, keys: keySkills(pick.trio, archetype) })
  }
  return result
}

/** 추천 조합으로 편성(세 무장을 모두 가지고 있어야 한다) */
export function applyCombo(state: { generals: General[]; formation: string[]; lastNotice: string }, ids: string[]): { ok: boolean; message: string } {
  const owned = ids.map(id => state.generals.find(general => general.id === id))
  if (ids.length !== 3 || new Set(ids).size !== 3 || owned.some(general => !general)) return { ok: false, message: '이 조합의 무장을 모두 보유해야 편성할 수 있습니다.' }
  state.formation = [...ids]
  const bond = bondFor(ids)
  state.lastNotice = `추천 덱으로 편성 · ${owned.map(general => general!.name).join(' · ')}${bond ? ` · 인연 「${bond.name}」` : ''}`
  return { ok: true, message: state.lastNotice }
}

