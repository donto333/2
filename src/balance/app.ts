// 밸런스 조정 테스트 화면: 아군·적군 편성과 장비를 정하고 게임과 같은 규칙으로 전투를 시뮬레이션한다.
import { EQUIPMENT_GRADE_META, EQUIPMENT_SET_META, EQUIPMENT_TYPE_META, GRADE_META, allGenerals, type EquipmentGrade, type EquipmentSet, type EquipmentType } from '../game/strategy'
import { GEAR_TYPES, defaultConfig, previewSlot, runBatch, runLevelSweep, runSingle, sanitizeConfig, teamBond, type BalanceConfig, type BatchSummary, type SlotConfig, type SweepPoint, type TimelineLine } from './sim'
import type { AccessState } from './access'
import { dailyFreeIncome, runProgression, summarizeWalls, type ProgressionRun, type WallSummary } from './progression'
import { SCENARIOS, scenarioEnemyLevel } from '../game/scenarios'
import { REPEAT_BATTLE_DAILY_LIMIT } from '../../server/economy.mjs'

const STORE_KEY = 'cheonharo.balance.config.v1'
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
const pct = (value: number) => `${Math.round(value * 100)}%`
const MODE_LABEL = { normal: '일반 전투', scenario: '시나리오', siege: '공성전', duel: '유저 대련' } as const
const REASON_LABEL: Record<string, string> = { morale: '3막 돌파(승)', wipe: '적 전멸(승)', ratio: '병력 비율 판정', timeout: '90초 초과(패)', troops: '아군 전멸(패)', collapse: '전열 붕괴 2회(패)' }
const ACCURACY = [[0, '무조작'], [0.5, '예고 50% 대응'], [0.7, '예고 70% 대응'], [0.9, '예고 90% 대응'], [1, '예고 100% 대응']] as const

function loadConfig(): BalanceConfig {
  try {
    const hash = location.hash.startsWith('#c=') ? location.hash.slice(3) : ''
    if (hash) return sanitizeConfig(JSON.parse(decodeURIComponent(escape(atob(hash)))))
  } catch { /* 잘못된 공유 링크는 무시 */ }
  try {
    const saved = localStorage.getItem(STORE_KEY)
    if (saved) return sanitizeConfig(JSON.parse(saved))
  } catch { /* 저장소를 못 쓰는 환경 */ }
  return defaultConfig()
}

function saveConfig(config: BalanceConfig): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(config)) } catch { /* 무시 */ }
}

function shareLink(config: BalanceConfig): string {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(config))))
  return `${location.origin}${location.pathname}#c=${encoded}`
}

export function mountBalance(root: HTMLElement, access: AccessState): void {
  const catalog = allGenerals().sort((left, right) => right.grade - left.grade || left.name.localeCompare(right.name, 'ko'))
  let config = loadConfig()
  let summary: BatchSummary | null = null
  let sweep: SweepPoint[] | null = null
  let timeline: TimelineLine[] | null = null
  let timelineResult = ''
  let busy = ''
  let progress = 0
  let growth: { gold: WallSummary[]; daily: WallSummary[]; territory: WallSummary[]; sample: ProgressionRun; users: number } | null = null

  const generalOptions = (selected: string) => [5, 4, 3, 2, 1].map(grade => `<optgroup label="${grade}등급 · ${GRADE_META[grade as 1].label}">${catalog.filter(general => general.grade === grade).map(general => `<option value="${general.id}" ${general.id === selected ? 'selected' : ''}>${esc(general.name)} · ${general.role}</option>`).join('')}</optgroup>`).join('')
  const setOptions = (selected: string) => `<option value="none" ${selected === 'none' ? 'selected' : ''}>없음</option>${(Object.keys(EQUIPMENT_SET_META) as EquipmentSet[]).map(set => `<option value="${set}" ${set === selected ? 'selected' : ''}>${EQUIPMENT_SET_META[set].label}</option>`).join('')}`
  const gradeOptions = (selected: string) => (Object.keys(EQUIPMENT_GRADE_META) as EquipmentGrade[]).map(grade => `<option value="${grade}" ${grade === selected ? 'selected' : ''}>${EQUIPMENT_GRADE_META[grade].label}</option>`).join('')

  const slotCard = (side: 'ally' | 'enemy', index: number, slot: SlotConfig) => {
    const preview = previewSlot(slot)
    const g = preview.general
    const lane = ['좌측', '중앙', '우측'][index]
    const gear = GEAR_TYPES.map(type => {
      const item = slot.gear[type]
      return `<div class="bl-gear"><span>${EQUIPMENT_TYPE_META[type].label}</span><select data-k="gear.${type}.set">${setOptions(item.set)}</select><select data-k="gear.${type}.grade" ${item.set === 'none' ? 'disabled' : ''}>${gradeOptions(item.grade)}</select><input type="number" min="1" max="20" value="${item.level}" data-k="gear.${type}.level" ${item.set === 'none' ? 'disabled' : ''} aria-label="강화 레벨"></div>`
    }).join('')
    const locked = slot.skill && slot.level < preview.unlockLevel
    return `<article class="bl-slot" data-side="${side}" data-index="${index}">
      <header><div class="bl-portrait" style="background-image:url('/assets/generals-realistic-webp/${esc(slot.id)}.webp')"></div><div><small>${lane}</small><select data-k="id" class="bl-general">${generalOptions(slot.id)}</select><em>${g.grade}등급 · ${g.role} · ${esc(preview.skillType)} · 전투력 ${preview.power.toLocaleString('ko-KR')}</em></div></header>
      <div class="bl-row"><label>레벨 <input type="number" min="1" max="60" value="${slot.level}" data-k="level"></label><label>성급 <select data-k="stars">${[1, 2, 3, 4, 5].map(star => `<option value="${star}" ${star === slot.stars ? 'selected' : ''}>${'★'.repeat(star)}</option>`).join('')}</select></label><label class="bl-check"><input type="checkbox" data-k="skill" ${slot.skill ? 'checked' : ''}> 스킬</label></div>
      <div class="bl-stats"><span>통솔 <b>${g.leadership}</b></span><span>무력 <b>${g.martial}</b></span><span>모략 <b>${g.stratagem}</b></span><span>속도 <b>${g.speed}</b></span><span>공격 <b>${g.attack}</b></span><span>방어 <b>${g.defense}</b></span></div>
      <div class="bl-skill ${slot.skill ? '' : 'is-off'}"><b>${esc(preview.skillName)}</b> · 사기 −${preview.morale} · 쿨 ${preview.cooldown}초${locked ? ` <i>(실제 게임에선 Lv.${preview.unlockLevel}부터)</i>` : ''}${preview.passive ? `<small class="${preview.passiveOn ? '' : 'is-off'}">패시브 ${esc(preview.passive)}${preview.passiveOn ? '' : ' (3성부터)'}</small>` : ''}</div>
      <div class="bl-gears">${gear}</div>
    </article>`
  }

  const team = (side: 'ally' | 'enemy') => {
    const slots = config[side]
    const bond = teamBond(slots)
    const avgLevel = Math.round(slots.reduce((sum, slot) => sum + slot.level, 0) / slots.length)
    return `<section class="bl-team bl-team--${side}">
      <div class="bl-team-head"><h2>${side === 'ally' ? '아군' : '적군'} 편성</h2><span class="bl-bond">${bond ? `인연 · ${esc(bond)}` : '인연 없음'}</span></div>
      <div class="bl-team-tools"><button data-act="random" data-side="${side}">무작위 3명</button><label>전원 레벨 <input type="number" min="1" max="60" value="${avgLevel}" data-team-level="${side}"></label><button data-act="team-level" data-side="${side}">적용</button><label>전원 장비 <select data-team-gear-set="${side}">${setOptions('martial')}</select><select data-team-gear-grade="${side}">${gradeOptions('legendary')}</select><input type="number" min="1" max="20" value="10" data-team-gear-level="${side}"></label><button data-act="team-gear" data-side="${side}">적용</button>${side === 'enemy' ? '<button data-act="mirror">아군과 같게</button>' : '<button data-act="swap">아군↔적군 바꾸기</button>'}</div>
      <div class="bl-slots">${slots.map((slot, index) => slotCard(side, index, slot)).join('')}</div>
    </section>`
  }

  const resultsView = () => {
    if (!summary) return '<p class="bl-empty">시뮬레이션을 실행하면 결과가 여기에 나옵니다.</p>'
    const s = summary
    const tile = (label: string, value: string, note = '') => `<div class="bl-tile"><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`
    const starBar = s.stars.map((count, star) => count ? `<i class="bl-star-${star}" style="flex:${count}" title="별 ${star}개 ${count}판">${star ? '★'.repeat(star) : '패'} ${Math.round(count / s.runs * 100)}%</i>` : '').join('')
    const reasons = Object.entries(s.reasons).sort((left, right) => right[1] - left[1]).map(([reason, count]) => `<li><span>${REASON_LABEL[reason] ?? reason}</span><b>${Math.round(count / s.runs * 100)}%</b></li>`).join('')
    const laneRow = (label: string, lanes: BatchSummary['ally']) => lanes.map((lane, index) => `<tr><td>${label} ${['좌', '중', '우'][index]}</td><td>${esc(lane.name)}</td><td>${lane.casts.toFixed(1)}회</td><td>${lane.morale.toFixed(1)}</td><td>${pct(lane.troopsLeft)}</td></tr>`).join('')
    return `<div class="bl-tiles">${tile('아군 승률', pct(s.winRate), `${s.wins} / ${s.runs}판`)}${tile('평균 전투 시간', `${s.avgTime.toFixed(1)}초`, s.wins ? `승리 시 ${s.avgTimeWin.toFixed(1)}초` : '')}${tile('남은 아군 병력', pct(s.avgTroopRatio))}${tile('예고 파훼율', pct(s.avgBreakRate))}${tile('평균 최대 연계', s.avgMaxCombo.toFixed(1))}${tile('평균 전열 붕괴', `${s.avgCollapses.toFixed(2)}회`)}</div>
      <div class="bl-starbar">${starBar}</div>
      <div class="bl-split"><div><h3>끝난 이유</h3><ul class="bl-reasons">${reasons}</ul></div><div><h3>무장별 (한 판 평균)</h3><table class="bl-table"><thead><tr><th>자리</th><th>무장</th><th>스킬</th><th>사기 피해</th><th>남은 병력</th></tr></thead><tbody>${laneRow('아군', s.ally)}${laneRow('적군', s.enemy)}</tbody></table><p class="bl-note">적군의 스킬은 사기 대신 병력 피해·방진·상태이상으로 작동해 사기 피해가 0으로 보입니다.</p></div></div>`
  }

  const sweepView = () => {
    if (!sweep) return ''
    const width = 640, height = 220, left = 44, bottom = 186, top = 24
    const band = (width - left - 12) / sweep.length
    const y = (rate: number) => bottom - rate * (bottom - top)
    const bars = sweep.map((point, index) => {
      const x = left + index * band + band * 0.18
      const w = band * 0.64
      return `<g><rect x="${x}" y="${y(point.winRate)}" width="${w}" height="${bottom - y(point.winRate)}" rx="4" class="${point.offset === 0 ? 'is-even' : ''}"><title>적 Lv.${point.enemyLevel} (${point.offset > 0 ? '+' : ''}${point.offset}) · 승률 ${pct(point.winRate)} · ${point.avgTime.toFixed(1)}초</title></rect><text x="${x + w / 2}" y="${y(point.winRate) - 6}" text-anchor="middle" class="bl-chart-value">${pct(point.winRate)}</text><text x="${x + w / 2}" y="${bottom + 16}" text-anchor="middle" class="bl-chart-axis">${point.offset > 0 ? '+' : ''}${point.offset}</text><text x="${x + w / 2}" y="${bottom + 30}" text-anchor="middle" class="bl-chart-axis bl-chart-sub">Lv.${point.enemyLevel}</text></g>`
    }).join('')
    const grid = [0, 0.5, 1].map(rate => `<line x1="${left}" x2="${width - 12}" y1="${y(rate)}" y2="${y(rate)}" class="bl-chart-grid"/><text x="${left - 6}" y="${y(rate) + 4}" text-anchor="end" class="bl-chart-axis">${pct(rate)}</text>`).join('')
    return `<section class="bl-card"><h3>레벨 차이 분석 · 적 레벨만 바꿨을 때 아군 승률</h3><svg viewBox="0 0 ${width} ${height + 20}" class="bl-chart" role="img" aria-label="적 레벨 차이에 따른 아군 승률">${grid}${bars}</svg><p class="bl-note">0이 지금 설정이고, +는 적이 그만큼 높은 경우입니다. 막대마다 ${Math.max(30, Math.round(config.settings.runs / 4))}판씩 돌렸습니다.</p></section>`
  }

  const timelineView = () => timeline ? `<section class="bl-card"><h3>한 판 상세 · ${esc(timelineResult)}</h3><ol class="bl-timeline">${timeline.map(line => `<li class="${line.tone ? `is-${line.tone}` : ''}"><time>${line.t.toFixed(1)}초</time><span>${esc(line.text)}</span></li>`).join('')}</ol></section>` : ''

  const growthView = () => {
    const chapters = [1, 2, 3, 4, 5, 6, 7, 8].map(chapter => {
      const list = SCENARIOS.filter(scenario => scenario.chapterIndex === chapter - 1)
      return { chapter, era: list[0]?.era ?? '', count: list.length, from: scenarioEnemyLevel(list[0]), to: scenarioEnemyLevel(list[list.length - 1]), gold: list[0]?.reward.gold ?? 0, total: list.reduce((sum, scenario) => sum + scenario.reward.gold, 0) }
    })
    const daily = dailyFreeIncome()
    const cell = (walls: WallSummary[] | undefined, chapter: number, unit: string) => {
      const wall = walls?.find(item => item.chapter === chapter)
      if (!wall) return '<td>—</td>'
      if (!wall.median && !wall.high) return '<td class="bl-ok">막힘 없음</td>'
      return `<td class="${wall.median ? 'bl-wall' : ''}"><b>${wall.median}${unit}</b><small> (${wall.low}~${wall.high})</small></td>`
    }
    const head = `<tr><th>장</th><th>시대</th><th>시나리오</th><th>적 레벨</th><th>1회 금화</th><th>장 합계</th><th>정체 돌파: 구매 금화</th><th>무료 플레이</th><th>+ 영토전 금화</th></tr>`
    const body = chapters.map(c => `<tr><td>${c.chapter}장</td><td>${esc(c.era)}</td><td>${c.count}개</td><td>Lv.${c.from}~${c.to}</td><td>${c.gold}</td><td>${c.total}</td>${cell(growth?.gold, c.chapter, '개')}${cell(growth?.daily, c.chapter, '일')}${cell(growth?.territory, c.chapter, '일')}</tr>`).join('')
    const sample = growth ? `<details class="bl-growth-sample"><summary>대표 유저 한 명의 진행(구매 금화로 돌파) · 시나리오별</summary><table class="bl-table"><thead><tr><th>#</th><th>사건</th><th>적</th><th>출전 무장</th><th>승률</th><th>받은 금화</th><th>더한 금화</th></tr></thead><tbody>${growth.sample.rows.map(row => `<tr class="${row.added ? 'is-wall' : ''}"><td>${row.n}</td><td>${esc(row.title)}</td><td>Lv.${row.enemyLevel}</td><td>${esc(row.team)}</td><td>${pct(row.winRate)}</td><td>+${row.goldEarned}</td><td>${row.added ? `+${row.added}` : ''}</td></tr>`).join('')}</tbody></table></details>` : ''
    return `<section class="bl-card bl-growth"><h3>성장 곡선 · 시나리오 금화로 어디까지 크는가</h3>
      <p class="bl-note">시나리오를 처음부터 순서대로 깨며 받은 금화를 병서·은전으로 바꿔 출전 무장 레벨을 올리고, 옥패로는 무장을 모집합니다(게임과 같은 보상표·비용·모집 확률·전투 규칙). 승률 50% 미만이면 「정체」로 보고, 넘을 때까지 금화(5개씩) 또는 하루치 플레이를 더합니다. 시작은 3등급 무장 3명, 조작은 예고 60% 대응 기준입니다.</p>
      <table class="bl-table bl-growth-table"><thead>${head}</thead><tbody>${body}</tbody></table>
      <p class="bl-note">무료 플레이 하루 = 일일·주간 임무(주간은 ÷7) + 일반 전투 보상 ${REPEAT_BATTLE_DAILY_LIMIT}회 + 수도 내정 수확 → 은전 ${daily.silver.toLocaleString('ko-KR')} · 병서 ${daily.manuals} · 옥패 ${daily.honor.toLocaleString('ko-KR')}. 영토전은 하루 최종 세력전 1승(금화 40)을 더한 경우입니다. 칸의 숫자는 ${growth ? `유저 ${growth.users}명` : '여러 유저'}의 중앙값, 괄호는 25~75% 범위입니다(모집 운에 따라 차이가 큽니다).</p>
      ${growth ? sample : '<p class="bl-note">「성장 곡선 계산」을 누르면 정체 구간과 돌파에 필요한 금화·일수를 계산합니다(1~2분).</p>'}
    </section>`
  }

  const render = () => {
    const s = config.settings
    root.innerHTML = `<div class="bl-app">
      <header class="bl-top"><div><span class="bl-eyebrow">천하 · 밸런스 실험실</span><h1>밸런스 조정 테스트</h1><p>아군·적군 편성과 장비를 정하고 실제 게임과 같은 전투 규칙으로 시뮬레이션합니다.</p></div><div class="bl-access ${access.launched ? 'is-operator' : ''}">${access.launched ? '운영자 전용' : '정식 출시 전 · 누구나 사용'}<small>${access.source === 'server' ? '서버 확인' : '출시 스위치 기준'}</small></div><a class="bl-link" href="./">게임으로 ↗</a></header>
      <section class="bl-card bl-settings">
        <label>전투 종류 <select data-set="mode">${(Object.keys(MODE_LABEL) as Array<keyof typeof MODE_LABEL>).map(mode => `<option value="${mode}" ${mode === s.mode ? 'selected' : ''}>${MODE_LABEL[mode]}</option>`).join('')}</select></label>
        <label>공성 성벽 보너스 <input type="number" min="0" max="50" value="${s.moraleBonus}" data-set="moraleBonus" ${s.mode === 'siege' ? '' : 'disabled'}></label>
        <label>아군 조작 <select data-set="accuracy">${ACCURACY.map(([value, label]) => `<option value="${value}" ${value === s.accuracy ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>반복 횟수 <select data-set="runs">${[50, 200, 500, 1000].map(runs => `<option value="${runs}" ${runs === s.runs ? 'selected' : ''}>${runs}판</option>`).join('')}</select></label>
        <div class="bl-actions"><button class="bl-primary" data-act="run" ${busy ? 'disabled' : ''}>시뮬레이션 실행</button><button data-act="single" ${busy ? 'disabled' : ''}>한 판 상세</button><button data-act="growth" ${busy ? 'disabled' : ''}>성장 곡선 계산</button><button data-act="sweep" ${busy ? 'disabled' : ''}>레벨 차이 분석</button><button data-act="share">설정 링크 복사</button><button data-act="reset">처음 설정</button></div>
        ${busy ? `<div class="bl-progress"><span>${esc(busy)} ${Math.round(progress * 100)}%</span><i style="width:${progress * 100}%"></i></div>` : ''}
      </section>
      <div class="bl-teams">${team('ally')}${team('enemy')}</div>
      <section class="bl-card bl-results"><h3>시뮬레이션 결과 · ${MODE_LABEL[s.mode]} · ${ACCURACY.find(([value]) => value === s.accuracy)?.[1] ?? ''}</h3>${resultsView()}</section>
      ${sweepView()}${timelineView()}${growthView()}
      <footer class="bl-foot">전투 규칙: 제한 90초 · 막별 적 사기 80/100/120(적 레벨에 따라 증가) · 스킬 1회 사기 피해 상한 40. 적은 스킬을 쓰고 예고에는 대응하지 않습니다. 결과는 무작위 요소가 있어 판수가 많을수록 정확합니다.</footer>
    </div>`
  }

  const update = (mutate: () => void, clearResults = true) => {
    mutate()
    config = sanitizeConfig(config)
    saveConfig(config)
    if (clearResults) { summary = null; sweep = null; timeline = null }
    render()
  }

  root.addEventListener('change', event => {
    const target = event.target as HTMLInputElement | HTMLSelectElement
    const setting = target.dataset.set
    if (setting) return update(() => { (config.settings as unknown as Record<string, unknown>)[setting] = setting === 'mode' ? target.value : Number(target.value) })
    const key = target.dataset.k
    const card = target.closest<HTMLElement>('.bl-slot')
    if (!key || !card) return
    const slot = config[card.dataset.side as 'ally' | 'enemy'][Number(card.dataset.index)]
    update(() => {
      if (key === 'id') slot.id = target.value
      else if (key === 'level') slot.level = Number(target.value)
      else if (key === 'stars') slot.stars = Number(target.value)
      else if (key === 'skill') slot.skill = (target as HTMLInputElement).checked
      else if (key.startsWith('gear.')) {
        const [, type, field] = key.split('.') as [string, EquipmentType, 'set' | 'grade' | 'level']
        const gear = slot.gear[type]
        if (field === 'level') gear.level = Number(target.value)
        else if (field === 'set') gear.set = target.value as EquipmentSet | 'none'
        else gear.grade = target.value as EquipmentGrade
      }
    })
  })

  root.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-act]')
    if (!button || button.disabled) return
    const act = button.dataset.act
    const side = button.dataset.side as 'ally' | 'enemy' | undefined
    if (act === 'random' && side) return update(() => {
      const pool = [...catalog].sort(() => Math.random() - 0.5).slice(0, 3)
      config[side] = config[side].map((slot, index) => ({ ...slot, id: pool[index].id }))
    })
    if (act === 'team-level' && side) return update(() => {
      const level = Number(root.querySelector<HTMLInputElement>(`[data-team-level="${side}"]`)?.value ?? 1)
      config[side].forEach(slot => { slot.level = level })
    })
    if (act === 'team-gear' && side) return update(() => {
      const set = root.querySelector<HTMLSelectElement>(`[data-team-gear-set="${side}"]`)?.value as EquipmentSet | 'none'
      const grade = root.querySelector<HTMLSelectElement>(`[data-team-gear-grade="${side}"]`)?.value as EquipmentGrade
      const level = Number(root.querySelector<HTMLInputElement>(`[data-team-gear-level="${side}"]`)?.value ?? 1)
      config[side].forEach(slot => GEAR_TYPES.forEach(type => { slot.gear[type] = { set, grade, level } }))
    })
    if (act === 'mirror') return update(() => { config.enemy = JSON.parse(JSON.stringify(config.ally)) })
    if (act === 'swap') return update(() => { const ally = config.ally; config.ally = config.enemy; config.enemy = ally })
    if (act === 'reset') return update(() => { config = defaultConfig() })
    if (act === 'share') {
      const link = shareLink(config)
      try { await navigator.clipboard.writeText(link); button.textContent = '복사했습니다' } catch { window.prompt('이 링크를 복사하세요', link) }
      window.setTimeout(() => { button.textContent = '설정 링크 복사' }, 1600)
      return
    }
    if (act === 'single') {
      const { result, timeline: lines } = runSingle(config)
      timeline = lines
      timelineResult = `${result.won ? `승리 · 별 ${result.stars}개` : '패배'} · ${(result.durationMs / 1000).toFixed(1)}초 · ${REASON_LABEL[result.reason] ?? result.reason}`
      render()
      root.querySelector('.bl-timeline')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (act === 'growth') {
      busy = '성장 곡선 계산 중'
      progress = 0
      render()
      const users = 8
      const seeds = [3, 11, 29, 47, 71, 89, 101, 131].slice(0, users)
      const modes = ['gold', 'daily', 'territory'] as const
      const total = seeds.length * modes.length
      const results: Record<(typeof modes)[number], ProgressionRun[]> = { gold: [], daily: [], territory: [] }
      try {
        let done = 0
        for (const mode of modes) for (const seed of seeds) {
          results[mode].push(await runProgression({ mode, seed, accuracy: 0.6, territoryGoldPerDay: 40, runs: 12 }, (step, steps) => {
            progress = (done + step / steps) / total
            const bar = root.querySelector<HTMLElement>('.bl-progress i')
            const label = root.querySelector<HTMLElement>('.bl-progress span')
            if (bar) bar.style.width = `${progress * 100}%`
            if (label) label.textContent = `${busy} ${Math.round(progress * 100)}%`
          }))
          done += 1
        }
        const sorted = [...results.gold].sort((a, b) => a.added - b.added)
        growth = { gold: summarizeWalls(results.gold, 15), daily: summarizeWalls(results.daily, 2), territory: summarizeWalls(results.territory, 2), sample: sorted[Math.floor(sorted.length / 2)], users }
      } finally {
        busy = ''
        render()
        root.querySelector('.bl-growth')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }
    if (act === 'run' || act === 'sweep') {
      busy = act === 'run' ? '시뮬레이션 중' : '레벨 차이 분석 중'
      progress = 0
      render()
      const onProgress = (done: number, total: number) => {
        progress = done / total
        const bar = root.querySelector<HTMLElement>('.bl-progress i')
        const label = root.querySelector<HTMLElement>('.bl-progress span')
        if (bar) bar.style.width = `${progress * 100}%`
        if (label) label.textContent = `${busy} ${Math.round(progress * 100)}%`
      }
      try {
        if (act === 'run') summary = await runBatch(config, onProgress)
        else sweep = await runLevelSweep(config, undefined, onProgress)
      } finally {
        busy = ''
        render()
      }
    }
  })

  render()
}
