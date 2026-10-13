// 성장 곡선 시뮬레이터: 시나리오를 처음부터 순서대로 깨며 받은 보상으로 무장을 키울 때, 어디서 막히고 무엇으로 넘는지 본다.
// 게임과 같은 표(시나리오 보상·레벨업 비용·상점 묶음·모집 확률·일일 보상)와 같은 전투 규칙(BattleCore)을 쓴다.
import { REPEAT_BATTLE_DAILY_LIMIT, REPEAT_BATTLE_HONOR, REPEAT_BATTLE_SILVER } from '../../server/economy.mjs'
import { DAILY_BONUS, MISSIONS, TUTORIAL_REWARD } from '../game/missions'
import { SCENARIOS, scenarioEnemyIds, scenarioEnemyLevel, type ScenarioDefinition } from '../game/scenarios'
import { HONOR_SHOP_PACKAGES, MANUAL_SHOP_PACKAGES, RESOURCE_SHOP_PACKAGES, FACTION_CAPITALS, allGenerals, cityIncome, combatPower, createInitialState, scaleGeneral, upgradeCost, type General } from '../game/strategy'
import { defaultConfig, emptyGear, runBatch } from './sim'

/** 정체 구간을 넘는 방법 */
export type BreakMode = 'gold' | 'daily' | 'territory'
export interface ProgressionOptions { mode: BreakMode; seed: number; accuracy: number; territoryGoldPerDay: number; runs: number }
export interface ProgressionRow { n: number; chapter: number; title: string; enemyLevel: number; winRate: number; teamLevel: number; team: string; goldEarned: number; added: number }
export interface ProgressionRun { rows: ProgressionRow[]; scenarioGold: number; added: number }

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
/** 금화 1개로 받는 양(10금화 묶음 기준) */
const rateOf = (goldCost: number, amount: number) => amount / goldCost
const PER_GOLD = {
  manuals: rateOf(MANUAL_SHOP_PACKAGES[1].goldCost, MANUAL_SHOP_PACKAGES[1].manuals),
  silver: (() => { const pack = RESOURCE_SHOP_PACKAGES.find(item => item.resource === 'silver' && item.goldCost === 10)!; return rateOf(pack.goldCost, pack.amount) })(),
  honor: rateOf(HONOR_SHOP_PACKAGES[2].goldCost, HONOR_SHOP_PACKAGES[2].honor),
}

/** 하루 무료 플레이로 얻는 성장 재화(일일·주간 임무 ÷ 7, 일반 전투 보상 한도, 수도 내정 수확) */
export function dailyFreeIncome(): { silver: number; manuals: number; honor: number } {
  const sum = { silver: 0, manuals: 0, honor: 0 }
  const add = (reward: Partial<Record<string, number>>, scale = 1) => {
    sum.silver += (reward.silver ?? 0) * scale; sum.manuals += (reward.manuals ?? 0) * scale; sum.honor += (reward.honor ?? 0) * scale
  }
  MISSIONS.forEach(mission => add(mission.reward, mission.scope === 'daily' ? 1 : 1 / 7))
  add(DAILY_BONUS)
  sum.honor += REPEAT_BATTLE_DAILY_LIMIT * REPEAT_BATTLE_HONOR
  sum.silver += REPEAT_BATTLE_DAILY_LIMIT * REPEAT_BATTLE_SILVER
  const state = createInitialState()
  const capital = state.cities.find(city => city.id === FACTION_CAPITALS[state.faction])
  if (capital) sum.silver += cityIncome(capital, state).silver
  return { silver: Math.round(sum.silver), manuals: Math.round(sum.manuals), honor: Math.round(sum.honor) }
}

interface Owned { id: string; level: number; stars: number }

export async function runProgression(options: ProgressionOptions, onProgress?: (done: number, total: number) => void): Promise<ProgressionRun> {
  const rng = seeded(options.seed)
  const library = allGenerals()
  const template = new Map(library.map(general => [general.id, general]))
  const costState = createInitialState()
  const start = createInitialState()
  // 시작: 3등급 무장 3명(게임과 같음) + 시작 재화 + 시작 안내 보상
  const st = {
    honor: start.honor + (TUTORIAL_REWARD.honor ?? 0), silver: start.silver + (TUTORIAL_REWARD.silver ?? 0), manuals: start.manuals + (TUTORIAL_REWARD.manuals ?? 0), gold: 0,
    roster: ['taishi-ci', 'xu-shu', 'wei-yan'].map(id => ({ id, level: 1, stars: 1 })) as Owned[],
  }
  const recruitOne = () => {
    const roll = rng() * 100
    const grade = roll < 2 ? 5 : roll < 10 ? 4 : roll < 30 ? 3 : roll < 65 ? 2 : 1
    const pool = library.filter(general => general.grade === grade)
    const pick = pool[Math.floor(rng() * pool.length)]
    const owned = st.roster.find(general => general.id === pick.id)
    if (owned) { if (owned.stars < 5) owned.stars += 1; else st.manuals += 8 } else st.roster.push({ id: pick.id, level: 1, stars: 1 })
  }
  const power = (general: Owned, level: number) => {
    const scaled = scaleGeneral({ ...(template.get(general.id) as General), level: 1, stars: 1 }, level, general.stars)
    return combatPower({ ...scaled, level, stars: general.stars })
  }
  let formation = st.roster.slice(0, 3)
  const choose = () => {
    const avg = formation.reduce((sum, general) => sum + general.level, 0) / 3
    formation = [...st.roster].sort((a, b) => power(b, Math.max(b.level, avg - 4)) - power(a, Math.max(a.level, avg - 4))).slice(0, 3)
  }
  // 옥패는 모집에, 은전·병서는 가장 낮은 출전 무장의 레벨업에. 금화는 모자란 재료(병서 우선)를 산다.
  const spend = () => {
    while (st.honor >= 900) { st.honor -= 900; for (let i = 0; i < 10; i += 1) recruitOne() }
    while (st.honor >= 100) { st.honor -= 100; recruitOne() }
    choose()
    for (;;) {
      const lowest = formation.reduce((a, b) => a.level <= b.level ? a : b)
      const cost = upgradeCost(costState, lowest)
      if (st.silver >= cost.silver && st.manuals >= cost.manuals) { st.silver -= cost.silver; st.manuals -= cost.manuals; lowest.level += 1; continue }
      if (st.gold <= 0) break
      st.gold -= 1
      if (st.manuals < cost.manuals) st.manuals += PER_GOLD.manuals
      else st.silver += PER_GOLD.silver
    }
  }
  const winRate = async (scenario: ScenarioDefinition) => {
    const config = defaultConfig()
    config.settings = { mode: 'scenario', moraleBonus: 0, accuracy: options.accuracy, runs: options.runs }
    config.ally = formation.map(general => ({ id: general.id, level: general.level, stars: general.stars, skill: general.level >= 6, gear: emptyGear() }))
    const level = scenarioEnemyLevel(scenario)
    config.enemy = scenarioEnemyIds(scenario, '촉한').map((id, index) => ({ id, level: Math.max(1, level + index - 1), stars: Math.min(5, 1 + Math.floor(level / 12)), skill: level >= 6, gear: emptyGear() }))
    return (await runBatch(config, undefined, { rng: seeded(5), chunk: 1000 })).winRate
  }
  const daily = dailyFreeIncome()
  const rows: ProgressionRow[] = []
  let scenarioGold = 0, addedTotal = 0
  for (const [index, scenario] of SCENARIOS.entries()) {
    spend()
    let rate = await winRate(scenario), added = 0
    // 승률 50% 미만이면 정체: 방법에 따라 금화(5개씩) 또는 하루치 플레이를 더한다
    while (rate < 0.5 && added < 2000) {
      if (options.mode === 'gold') { st.gold += 5; added += 5 }
      else {
        st.silver += daily.silver; st.manuals += daily.manuals; st.honor += daily.honor
        if (options.mode === 'territory') st.gold += options.territoryGoldPerDay
        added += 1
      }
      spend()
      rate = await winRate(scenario)
    }
    addedTotal += added
    const reward = scenario.reward
    rows.push({ n: index + 1, chapter: scenario.chapterIndex + 1, title: scenario.title, enemyLevel: scenarioEnemyLevel(scenario), winRate: rate, teamLevel: Math.round(formation.reduce((sum, general) => sum + general.level, 0) / 3), team: formation.map(general => `${template.get(general.id)?.name ?? general.id} Lv.${general.level}${'★'.repeat(general.stars)}`).join(' · '), goldEarned: reward.gold, added })
    st.gold += reward.gold; scenarioGold += reward.gold
    st.honor += reward.honor; st.silver += reward.silver; st.manuals += reward.manuals
    onProgress?.(index + 1, SCENARIOS.length)
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return { rows, scenarioGold, added: addedTotal }
}

/** 여러 유저(시드)를 돌려 장별 정체 크기를 모은다: 중앙값과 25~75% 범위 */
export interface WallSummary { chapter: number; median: number; low: number; high: number; stuckShare: number }
export function summarizeWalls(runs: ProgressionRun[], threshold: number): WallSummary[] {
  const quantile = (values: number[], q: number) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.round((sorted.length - 1) * q)] ?? 0 }
  return [1, 2, 3, 4, 5, 6, 7, 8].map(chapter => {
    const values = runs.map(run => run.rows.filter(row => row.chapter === chapter).reduce((sum, row) => sum + row.added, 0))
    return { chapter, median: quantile(values, 0.5), low: quantile(values, 0.25), high: quantile(values, 0.75), stuckShare: values.filter(value => value >= threshold).length / Math.max(1, values.length) }
  })
}
