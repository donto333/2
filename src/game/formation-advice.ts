// 무장별 추천 덱: 고른 무장이 들어간 3인 조합을 다섯 유형(스킬 연계·버티기·초반 끝내기·디버프·유틸)마다 하나씩 추천한다.
// 지금 키운 정도(레벨·성급·장비)는 따지지 않는다: 모든 무장을 같은 기준(Lv30·3성)으로 놓고 스킬 설계만 본다.
// 유형별 성장 이후 시뮬레이션: 승패는 스킬 사기 피해·예고 대응과 생존(전열 수호·회복)이 가르고, 아군 일반 공격·속도는 거의 영향이 없다.
// 진형 규칙(가운데=전열: 적 공격 30%가 먼저 오고 받는 피해 −20%, 수호형이면 도발·피해 −40%)을 반영해
// 가운데에는 수호형(없으면 가장 단단한 무장)을 세운다. 가중치는 전투 시뮬레이션으로 맞췄다(tests/formation-advice.test.ts).
import { GENERAL_SKILLS, SKILL_TYPE_META, bondFor, skillCooldownFor, type BondDef, type GeneralSkillDef } from './skills'
import { BATTLE_RULES } from './battle-core'
import { allGenerals, combatPower, frontLineOrder, scaleGeneral, type General } from './strategy'

export type Archetype = 'chain' | 'sustain' | 'early' | 'debuff' | 'utility'
export const ARCHETYPES: Archetype[] = ['chain', 'sustain', 'early', 'debuff', 'utility']
export const ARCHETYPE_META: Record<Archetype, { label: string; desc: string }> = {
  chain: { label: '스킬 연계', desc: '앞 무장의 스킬이 다음 스킬을 키운다' },
  sustain: { label: '버티기', desc: '전열 수호형이 맞아 주고 회복으로 오래 버틴다' },
  early: { label: '속공', desc: '전투 시작부터 몰아쳐 빨리 끝낸다' },
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
// 일반 공격만 키우는 패시브(요래·선등)는 전투 결과에 거의 영향이 없어(시뮬레이션) 작게 친다
const PASSIVE_EARLY: Record<string, number> = { earlyAtk: 0.15, firstStrike: 0.1, fastOpener: 0.7, vsHighMorale: 0.6, peerless: 0.5, resetOnKill: 0.4, startFear: 0.4, flankMorale: 0.2 }

let cache: Map<string, Profile> | null = null

/** 무장마다 스킬 설계에서 뽑은 성향(같은 기준 Lv30·3성) */
function profiles(): Map<string, Profile> {
  if (cache) return cache
  const list = allGenerals()
  const powers = new Map(list.map(general => [general.id, combatPower(scaleGeneral({ ...general, level: 1, stars: 1 }, 30, 3))]))
  const maxPower = Math.max(...powers.values())
  cache = new Map(list.map(general => {
    const def = GENERAL_SKILLS[general.id]
    const healGrade = (BATTLE_RULES.healGrade[general.grade] ?? 1) / 0.7
    const parts = [def.active, def.awaken].filter((part): part is NonNullable<typeof part> => Boolean(part))
    const fx = parts.flatMap(part => part.fx)
    // 사기 피해: 유형 기본 위력에 비례(돌격 14 = 1). 계략·통솔은 디버프·버프가 주라 절반만 친다
    const morale = SKILL_TYPE_META[def.type].base * def.mult / SKILL_TYPE_META['돌격'].base
    let dmg = def.type === '돌격' || def.type === '사격' ? morale : def.type === '계략' || def.type === '통솔' ? morale * 0.5 : 0
    let tank = def.type === '수호' ? 1 : 0, heal = 0, debuff = 0, util = 0, early = 0
    let burning = false, chainer = false, marker = false
    for (const f of fx) {
      if (f.k === 'hits' || f.k === 'aoe' || f.k === 'power') dmg += 0.2
      // 자기 병력을 깎는 스킬(고육지계)은 강한 적에게 버티지 못한다
      if (f.k === 'selfCost') dmg *= 0.7
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
      // 회복량은 등급에 따라 달라진다(천명 ×0.7 ~ 신병 ×0.4)
      if (f.k === 'heal') heal += f.pct / 10 * healGrade
      if (f.k === 'hot') heal += f.pctPerSec * f.sec / 10 * healGrade
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
    // 속도는 전투 결과에 거의 영향이 없어(시뮬레이션) 빼고, 스킬을 얼마나 자주 쓰는지로 초반 화력을 본다
    early += (PASSIVE_EARLY[passive] ?? 0) + Math.max(0, 12 - skillCooldownFor({ ...general, stars: 3 })) * 0.05 * dmg
    return [general.id, { general, def, power: (powers.get(general.id) ?? 0) / maxPower, dmg, tank, heal, debuff, util, early, burning, chainer, marker }]
  }))
  return cache
}

/** 인연 효과의 크기(전투 계산과 같은 값): 공격 · 피해 감소 · 스킬 위력은 그대로, 쿨다운은 초당 약 0.04로 환산 */
const LEGACY_BOND: Record<string, Partial<BondDef>> = {
  'peach-garden': { atk: 0.08, dr: 0.08 },
  'five-tigers': { typeMult: { types: ['돌격', '사격'], value: 0.1 } },
  'lu-bu-army': { skillMult: 0.08 },
  'five-generals': { dr: 0.1 },
  'dragon-phoenix': { cdTypes: { types: ['계략'], sec: 1.5 } },
  'red-cliffs': { skillMult: 0.05 },
  'yellow-heaven': { atk: 0.05, cdTypes: { types: ['계략'], sec: 1 } },
}
export function bondValue(bond: BondDef | null, trio: Array<{ def: GeneralSkillDef }>): number {
  if (!bond) return 0
  const fx = { ...bond, ...LEGACY_BOND[bond.id] }
  const share = (types: string[]) => trio.filter(item => types.includes(item.def.type)).length / 3
  return (fx.atk ?? 0) * 1 + (fx.dr ?? 0) * 1.4 + (fx.skillMult ?? 0) * 1.6 + (fx.typeMult ? fx.typeMult.value * 1.6 * share(fx.typeMult.types) : 0)
    + (fx.cd ?? 0) * 0.04 * 3 + (fx.cdTypes ? fx.cdTypes.sec * 0.04 * 3 * share(fx.cdTypes.types) : 0)
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
  /** 핵심 스킬 설명(누르면 펼쳐 보는 용도) — keys와 같은 순서 */
  keyInfo: Array<{ label: string; general: string; skill: string; desc: string }>
}

function trioScore(trio: Profile[], archetype: Archetype, anchor: Profile = trio[0]): number {
  const front = trio.find(item => item.general.id === frontLineOrder(trio.map(entry => entry.general))[1].id)!
  const sum = (key: 'dmg' | 'tank' | 'heal' | 'debuff' | 'util' | 'early') => trio.reduce((total, item) => total + item[key], 0)
  const power = trio.reduce((total, item) => total + item.power, 0) / 3
  const bondDef = bondFor(trio.map(item => item.general.id))
  // 인연은 효과 크기만큼(공격 +8% ≈ 0.08 → 점수 약 0.6): 이름만 맞는 약한 인연에 끌려가지 않게
  const bond = bondDef ? 0.25 + bondValue(bondDef, trio) * 5 : 0
  const anchorBond = bondDef?.members.includes(anchor.general.id) ? 1 : 0
  // 덱 성격에 맞는 인연 효과는 더 친다: 버티기=피해 감소, 속공=공격·스킬 위력, 유틸·디버프=쿨다운
  const fx = bondDef ? { ...bondDef, ...LEGACY_BOND[bondDef.id] } : null
  const cdFx = fx ? (fx.cd ?? 0) + (fx.cdTypes ? fx.cdTypes.sec * trio.filter(item => fx.cdTypes!.types.includes(item.def.type)).length / 3 : 0) : 0
  const bondFit = !fx ? 0 : archetype === 'sustain' ? (fx.dr ?? 0) * 12
    : archetype === 'early' ? ((fx.atk ?? 0) + (fx.skillMult ?? 0) + (fx.typeMult?.value ?? 0) * 0.6) * 8
    : archetype === 'utility' || archetype === 'debuff' ? cdFx * 0.5 : 0
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
  // 생존: 유형별 성장 이후 전열 수호형·회복이 승률을 크게 가른다(시뮬레이션: 전열이 약한 덱은 강한 적에게 진다)
  const survive = (front.def.type === '수호' ? 1.3 : 0) + Math.min(1, sum('heal')) * 0.5
  const base = power * 0.9 + carry + bond * 0.5 + bondFit + anchorTie * 0.9 + survive
  switch (archetype) {
    // 연계는 고른 무장이 낀 연계·인연이 핵심(다른 둘끼리의 연계는 조금만)
    case 'chain': return base + anchorTie * 1.6 + (synergy - anchorTie) * 0.35 + anchorBond * 1.4 + dmg * 0.3 + frontTank * 0.3
    case 'sustain': return base + (front.def.type === '수호' ? 1.5 : -1) + sum('tank') * 0.6 + sum('heal') * 0.8 + dmg * 0.35
    case 'early': return base + sum('early') * 1.2 + dmg * 0.8 - sum('heal') * 0.3 + frontTank * 0.2
    // 디버프·유틸 덱은 적을 묶는 동안 버텨야 한다: 전열 수호형을 더 크게 친다
    case 'debuff': return base + Math.min(2.4, sum('debuff')) * 1.0 + dmg * 0.4 + frontTank * 0.3 + (front.def.type === '수호' ? 1 : 0) + synergy * 0.4
    // 유틸만 모으면 사기를 못 깎아 진다: 확실한 공격수(돌격·사격)가 있어야 한다
    case 'utility': {
      const strikers = trio.filter(item => item.def.type === '돌격' || item.def.type === '사격').length
      const util = sum('util')
      // 유틸 무장은 등급이 낮으면 버티지 못한다: 등급(전투력)을 조금 더 본다
      return base + power * 2 + Math.min(2, util) * 0.9 + (util < 1 ? -1.2 : 0) + Math.min(1.6, dmg) * 0.6 + (strikers === 0 ? -1.2 : 0) + frontTank * 0.3 + (front.def.type === '수호' ? 1 : 0) + synergy * 0.4
    }
  }
}

/** 조합에서 이 유형을 이끄는 스킬 */
function keySkills(trio: Profile[], archetype: Archetype): Array<{ label: string; general: string; skill: string; desc: string }> {
  const weight = (item: Profile) => archetype === 'sustain' ? item.tank + item.heal : archetype === 'early' ? item.early + item.dmg * 0.3 : archetype === 'debuff' ? item.debuff : archetype === 'utility' ? item.util : trio.reduce((total, other) => total + (other !== item ? pairSynergy(item, other) : 0), 0) + item.dmg * 0.1
  return [...trio].sort((left, right) => weight(right) - weight(left)).slice(0, 2).filter(item => weight(item) > 0.05).map(item => ({ label: `${item.general.name} ‘${item.def.active.name}’`, general: item.general.name, skill: item.def.active.name, desc: item.def.active.desc }))
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
  const partners = new Map<string, number>()
  const result: ComboAdvice[] = []
  for (const archetype of archetypes) {
    const ranked: Array<{ trio: Profile[]; score: number }> = []
    for (let i = 0; i < others.length; i += 1) for (let j = i + 1; j < others.length; j += 1) {
      const trio = [anchor, others[i], others[j]]
      ranked.push({ trio, score: trioScore(trio, archetype, anchor) })
    }
    // 앞 덱에 이미 나온 동료는 조금 깎는다: 다섯 덱이 같은 짝(예: 동탁 · 여포)으로만 채워지지 않게
    for (const entry of ranked) for (const item of entry.trio) if (item !== anchor) entry.score -= (partners.get(item.general.id) ?? 0) * 0.7
    ranked.sort((left, right) => right.score - left.score)
    // 영토전 · 대련에서 이 유형으로 판정되는 조합을 먼저 고른다(상위 60개 안에서)
    const fresh = (entry: { trio: Profile[] }) => !used.has(entry.trio.map(item => item.general.id).sort().join())
    // 단, 점수가 크게(1.2 넘게) 처지면 원래 1위를 둔다(예: 유비의 연계 = 도원결의)
    const top = ranked.find(fresh)
    const matched = ranked.slice(0, 60).find(entry => fresh(entry) && deckStyle(entry.trio.map(item => item.general.id)) === archetype)
    const pick = matched && top && matched.score >= top.score - 1.2 ? matched : top
    if (!pick) continue
    used.add(pick.trio.map(item => item.general.id).sort().join())
    for (const item of pick.trio) if (item !== anchor) partners.set(item.general.id, (partners.get(item.general.id) ?? 0) + 1)
    const ids = frontLineOrder(pick.trio.map(item => item.general)).map(general => general.id)
    const keyInfo = keySkills(pick.trio, archetype)
    result.push({ archetype, ids, bond: bondFor(ids), score: pick.score, keys: keyInfo.map(key => key.label), keyInfo })
  }
  return result
}

/** 추천 조합으로 편성(세 무장을 모두 가지고 있어야 한다) */
export function applyCombo(state: { generals: General[]; formation: string[]; lastNotice: string }, ids: string[]): { ok: boolean; message: string } {
  const owned = ids.map(id => state.generals.find(general => general.id === id))
  if (ids.length !== 3 || new Set(ids).size !== 3 || owned.some(general => !general)) return { ok: false, message: '이 조합의 무장을 모두 보유해야 편성할 수 있습니다.' }
  state.formation = [...ids]
  const bond = bondFor(ids)
  state.lastNotice = `추천 덱으로 편성 · ${owned.map(general => general!.name).join(' · ')}${bond ? ` · 인연 ‘${bond.name}’` : ''}`
  return { ok: true, message: state.lastNotice }
}


// ── 덱 유형 상성(영토전 · 유저 대련) ──────────────────────────────────────
// 다섯 유형이 서로 물고 물린다: 각 유형은 두 유형에 강하고 두 유형에 약하다.
//   속공 → 버티기 · 유틸 (전열이 자리 잡기 전에, 준비가 끝나기 전에 몰아친다)
//   버티기 → 유틸 · 디버프 (오래 버텨 상대의 묶기 · 보조가 바닥난다)
//   유틸 → 디버프 · 연계 (정화 · 쿨다운 · 예고 대응으로 묶기와 연쇄를 끊는다)
//   디버프 → 연계 · 속공 (침묵 · 공포로 연계 고리와 첫 몰아치기를 막는다)
//   연계 → 속공 · 버티기 (연쇄 위력으로 단단한 전열도 뚫는다)
export const STYLE_BEATS: Record<Archetype, [Archetype, Archetype]> = {
  early: ['sustain', 'utility'],
  sustain: ['utility', 'debuff'],
  utility: ['debuff', 'chain'],
  debuff: ['chain', 'early'],
  chain: ['early', 'sustain'],
}

/** 내 유형이 상대 유형에 강하면 +1, 약하면 −1, 같거나 무관하면 0 */
export function styleEdge(mine: Archetype | null, theirs: Archetype | null): number {
  if (!mine || !theirs || mine === theirs) return 0
  if (STYLE_BEATS[mine].includes(theirs)) return 1
  if (STYLE_BEATS[theirs].includes(mine)) return -1
  return 0
}

let traitStats: Record<Archetype, { mean: number; sd: number }> | null = null
function trioTraits(trio: Profile[]): Record<Archetype, number> {
  const sum = (key: 'tank' | 'heal' | 'debuff' | 'util' | 'early' | 'dmg') => trio.reduce((total, item) => total + item[key], 0)
  let synergy = 0
  for (const a of trio) for (const b of trio) if (a !== b) synergy += pairSynergy(a, b)
  const bondDef = bondFor(trio.map(item => item.general.id))
  const front = trio.some(item => item.def.type === '수호') ? 0.6 : 0
  return {
    chain: synergy + bondValue(bondDef, trio) * 2,
    sustain: sum('tank') + sum('heal') + front,
    early: sum('early') + sum('dmg') * 0.25,
    debuff: sum('debuff'),
    utility: sum('util'),
  }
}

/** 덱 세 명의 유형: 유형별 성향을 무장 전체 평균(무작위 3인)과 견주어 가장 두드러진 것 */
export function deckStyle(ids: string[]): Archetype | null {
  const all = profiles()
  const trio = ids.map(id => all.get(id)).filter((item): item is Profile => Boolean(item))
  if (trio.length < 3) return null
  if (!traitStats) {
    const list = [...all.values()]
    const samples: Array<Record<Archetype, number>> = []
    // 고정된 순서로 뽑은 3인 표본(같은 결과가 나오게)
    for (let i = 0; i < list.length; i += 1) for (let k = 1; k <= 12; k += 1) {
      const sample = [list[i], list[(i + k * 7) % list.length], list[(i + k * 13 + 3) % list.length]]
      if (new Set(sample).size === 3) samples.push(trioTraits(sample))
    }
    traitStats = Object.fromEntries(ARCHETYPES.map(key => {
      const mean = samples.reduce((total, item) => total + item[key], 0) / samples.length
      const sd = Math.sqrt(samples.reduce((total, item) => total + (item[key] - mean) ** 2, 0) / samples.length)
      return [key, { mean, sd: Math.max(0.1, sd) }]
    })) as Record<Archetype, { mean: number; sd: number }>
  }
  // 평균보다 얼마나 두드러지는가(표준 점수)로 고른다
  const traits = trioTraits(trio)
  let best: Archetype = 'early', bestScore = -Infinity
  for (const key of ARCHETYPES) {
    // 연계는 드물게 아주 크게 튀므로(인연 · 짝 패시브) 상한을 두고 조금 낮춰 본다
    const z = (traits[key] - traitStats[key].mean) / traitStats[key].sd
    const score = key === 'chain' ? Math.min(2.2, z) * 0.75 : Math.min(3, z)
    if (score > bestScore) { best = key; bestScore = score }
  }
  return best
}

/** 두 덱의 유형과 상성(아군 기준) — 영토전 · 유저 대련 전투에 넘긴다 */
export function styleMatch(playerIds: string[], enemyIds: string[]): { player: string; enemy: string; edge: number; playerKey: Archetype; enemyKey: Archetype } | null {
  const mine = deckStyle(playerIds), theirs = deckStyle(enemyIds)
  if (!mine || !theirs) return null
  return { player: ARCHETYPE_META[mine].label, enemy: ARCHETYPE_META[theirs].label, edge: styleEdge(mine, theirs), playerKey: mine, enemyKey: theirs }
}

/** 덱 유형 상성이 적용되는 전투: 영토전(공성) · 유저 대련 */
export const STYLE_MODES = new Set(['duel', 'siege'])
