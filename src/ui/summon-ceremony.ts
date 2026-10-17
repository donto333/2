// 무장 모집·장비 뽑기 연출.
// 기본은 3D ‘천명의 전당’(summon-hall.ts): 석상 · 봉인석이 금 가며 깨지고, 최고 등급은 클로즈업 → 이름 자막.
// WebGL2가 없거나 모델을 불러오지 못하면 예전 2D 의식(기 모으기 → 균열 → 섬광 → 천명 강림)으로 대신한다.
// 화면 전체를 덮는 층은 document.body에 붙여, 게임 화면이 다시 그려져도 끊기지 않게 한다.
// 소리는 Web Audio로 직접 합성한다(파일 없이, 모집 버튼을 누른 뒤라 브라우저가 허용).
import type { Equipment, EquipmentGrade, General } from '../game/strategy'
import { EQUIPMENT_GRADE_META, GRADE_META } from '../game/strategy'
import { effectsSetting } from '../game/settings'
import { sound } from '../engine/sound'
import { heroLook } from '../game/hero-style'
import { loadModel, loadSkin } from '../game/battle-models'
import { hallSupported, playSummonHall, type HallEntry, type HallRank } from './summon-hall'

const esc = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
const NEUTRAL = '#e9dcb8'
const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms))

// ── 연출 ─────────────────────────────────────────────────
function particles(count: number, color: string): string {
  return Array.from({ length: count }, () => {
    const x = Math.round(Math.random() * 100), d = (Math.random() * 1.6).toFixed(2), s = (1.6 + Math.random() * 1.8).toFixed(2), z = (2 + Math.random() * 4).toFixed(1)
    return `<i style="left:${x}%;--d:${d}s;--s:${s}s;--z:${z}px;--c:${color}"></i>`
  }).join('')
}

/** 옥패 의식: 기 모으기 → 균열 → 섬광. 화면을 누르면 바로 넘어간다 */
async function ritual(level: number, color: string, centerpiece = '/assets/currency/honor.webp', kind: 'summon' | 'forge' = 'summon', keep = false): Promise<HTMLElement | null> {
  const top = level
  const reduced = effectsSetting() === 'reduced'
  const layer = document.createElement('div')
  layer.className = `summon-ceremony summon-ceremony--${kind}`
  // 기다리는 동안에는 결과를 짐작할 수 없게 중립색, 금이 가는 순간에 등급 색으로 바뀐다
  layer.style.setProperty('--glow', NEUTRAL)
  layer.innerHTML = `<div class="sc-bg"></div><div class="sc-rays"></div>
    <svg class="sc-ring sc-ring--outer" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 6"/><circle cx="100" cy="100" r="84" fill="none" stroke="currentColor" stroke-width="1" opacity=".6"/>${Array.from({ length: 12 }, (_, i) => `<rect x="98" y="4" width="4" height="10" fill="currentColor" transform="rotate(${i * 30} 100 100)"/>`).join('')}</svg>
    <svg class="sc-ring sc-ring--inner" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="14 8"/><path d="M100 36l55 32v64l-55 32-55-32V68z" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".7"/></svg>
    <div class="sc-beam"></div>
    <img class="sc-token" src="${centerpiece}" alt="" draggable="false">
    <div class="sc-cracks"></div>
    <div class="sc-particles">${particles(reduced ? 14 : 36, NEUTRAL)}</div>
    <div class="sc-flash"></div>
    <p class="sc-hint">화면을 누르면 넘어갑니다</p>`
  document.body.appendChild(layer)
  let skipped = false
  layer.addEventListener('click', () => { skipped = true })
  requestAnimationFrame(() => layer.classList.add('is-on'))
  // 무장 모집은 녹음된 대박 획득 곡만 들린다(기 모으기 · 균열 · 징 · 팡파르 소리는 없앰)
  if (kind === 'summon') sound.recruitJingle()
  // 대기(기 모으기) → 균열(여기서 등급 색이 드러남) → 섬광
  const steps: Array<[string, number]> = reduced ? [['is-charge', 900], ['is-crack', 500], ['is-flash', 350]] : [['is-charge', 1700], ['is-crack', 900], ['is-flash', 450]]
  for (const [cls, ms] of steps) {
    if (skipped) break
    layer.classList.add(cls)
    if (cls === 'is-crack') { layer.style.setProperty('--glow', color); layer.classList.add(`is-g${top}`); }
    await wait(ms)
  }
  if (skipped) layer.style.setProperty('--glow', color)
  // 뒤이어 등장 연출이 있으면 화면이 비지 않게 이 층을 남겨 두었다가 그쪽이 뜬 뒤에 걷는다
  if (keep) return layer
  layer.classList.add('is-out')
  await wait(260)
  layer.remove()
  return null
}

/** 남겨 둔 의식 층을 다음 연출이 뜬 뒤에 걷는다 */
function dropLater(layer: HTMLElement | null): void {
  if (!layer) return
  window.setTimeout(() => { layer.classList.add('is-out'); window.setTimeout(() => layer.remove(), 300) }, 350)
}

interface Spotlight { stamp: string; grade: string; name: string; sub: string; extra: string; portrait?: string; image?: string; color: string }

/** 최고 등급 등장 연출(5등급 무장 ‘천명 강림’, 전설·신화 장비). 계속을 누르거나 잠시 뒤 넘어간다 */
async function spotlight(item: Spotlight, level = 5, quiet = false): Promise<void> {
  const reduced = effectsSetting() === 'reduced'
  const layer = document.createElement('div')
  layer.className = `heaven-descends ${item.image ? 'heaven-descends--item' : ''}`
  layer.style.setProperty('--hd', item.color)
  layer.innerHTML = `<div class="hd-bg"></div><div class="hd-rays"></div>
    <div class="hd-pillars">${Array.from({ length: 7 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
    ${item.portrait ? `<div class="hd-portrait" style="--portrait:url('${item.portrait}')"></div>` : ''}
    ${item.image ? `<div class="hd-item"><img src="${item.image}" alt="" draggable="false"></div>` : ''}
    <div class="hd-sparks">${particles(reduced ? 16 : 48, item.color)}</div>
    <div class="hd-copy">
      <div class="hd-stamp"><span>${esc(item.stamp)}</span></div>
      <p class="hd-grade">${esc(item.grade)}</p>
      <h2>${esc(item.name)}</h2>
      <p class="hd-epithet">${esc(item.sub)}</p>
      <p class="hd-skill"><b>${esc(item.extra)}</b></p>
      <button class="action-button action-button--primary hd-continue" type="button">계속</button>
    </div>`
  document.body.appendChild(layer)
  if (!quiet) sound.heaven(level)
  requestAnimationFrame(() => layer.classList.add('is-on'))
  await new Promise<void>(resolve => {
    let done = false
    const finish = () => { if (done) return; done = true; resolve() }
    layer.querySelector('.hd-continue')?.addEventListener('click', finish)
    window.setTimeout(() => layer.addEventListener('click', finish), 900)
    window.setTimeout(finish, reduced ? 3000 : 6500)
  })
  layer.classList.add('is-out')
  await wait(320)
  layer.remove()
}

let running = false

const withTimeout = <T,>(pending: Promise<T>, ms: number): Promise<T> => Promise.race([pending, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), ms))])

/** 전당 준비(모델을 불러오는 동안 화면을 어둡게 덮어 둔다). 실패하면 null → 2D 연출 */
async function prepareHall(build: () => Promise<HallEntry[]>): Promise<HallEntry[] | null> {
  if (!hallSupported()) return null
  const veil = document.createElement('div')
  veil.className = 'summon-hall summon-ceremony is-on sh-veil'
  document.body.appendChild(veil)
  try { return await withTimeout(build(), 15000) } catch (error) { console.warn('[summon-hall] 3D 전당을 열지 못해 기본 연출로 대신합니다', error); return null } finally { window.setTimeout(() => veil.remove(), 400) }
}

/** 무장 → 전당 석상(말 탄 모델 + 전용 의상) */
function summonEntries(rewards: General[]): Promise<HallEntry[]> {
  return Promise.all(rewards.map(async general => {
    const look = heroLook(general), meta = GRADE_META[general.grade]
    const [gltf, skin] = await Promise.all([loadModel(look.model), look.skin ? loadSkin(look.skin).catch(() => null) : Promise.resolve(null)])
    return { rank: general.grade as HallRank, color: meta.color, label: `${meta.label} · ${general.grade}등급`, name: general.name, sub: general.epithet, star: general.grade === 5, model: { gltf, skin } }
  }))
}

/** 모집 연출 전체. 끝나면 결과 화면을 띄우면 된다 */
export async function playSummonCeremony(rewards: General[], portraitOf: (general: General) => string): Promise<void> {
  if (running || !rewards.length) return
  running = true
  try {
    const entries = await prepareHall(() => summonEntries(rewards))
    if (entries) {
      sound.recruitJingle()
      try { await playSummonHall(entries, 'summon') } catch (error) { console.warn('[summon-hall]', error) }
      return
    }
    const top = Math.max(...rewards.map(general => general.grade)) as 1 | 2 | 3 | 4 | 5
    const heroes = rewards.filter((general, index) => general.grade === 5 && rewards.findIndex(item => item.id === general.id) === index)
    let behind = await ritual(top, GRADE_META[top].color, undefined, 'summon', heroes.length > 0)
    // 5등급은 한 명씩(같은 무장이 두 번 나와도 한 번만)
    for (const general of heroes) {
      const shown = spotlight({ stamp: '천명', grade: '5등급 무장 강림', name: general.name, sub: general.epithet, extra: general.skillName, portrait: portraitOf(general), color: '#ffd98a' }, 5, true)
      dropLater(behind); behind = null
      await shown
    }
  } finally {
    running = false
  }
}

const EQUIP_RANK: Record<EquipmentGrade, number> = { normal: 1, rare: 2, unique: 3, legendary: 4, mythic: 5 }

/** 장비 뽑기 연출: 대장간 불꽃 의식 → 전설·신화는 등장 연출 */
export async function playForgeCeremony(items: Equipment[], imageOf: (item: Equipment) => string, labelOf: (item: Equipment) => { type: string; set: string }): Promise<void> {
  if (running || !items.length) return
  running = true
  try {
    const entries = await prepareHall(async () => items.map(item => {
      const rank = EQUIP_RANK[item.grade] as HallRank, meta = EQUIPMENT_GRADE_META[item.grade], label = labelOf(item)
      return { rank, color: meta.color, label: `${meta.label} 장비`, name: item.name, sub: `${label.type} · ${label.set}`, star: rank >= 4, image: imageOf(item) }
    }))
    if (entries) {
      try { await playSummonHall(entries, 'forge', entry => sound.heaven(entry.rank)) } catch (error) { console.warn('[summon-hall]', error) }
      return
    }
    const best = [...items].sort((a, b) => EQUIP_RANK[b.grade] - EQUIP_RANK[a.grade])[0]
    const level = EQUIP_RANK[best.grade]
    const stars = items.filter(item => EQUIP_RANK[item.grade] >= 4)
    let behind = await ritual(level, EQUIPMENT_GRADE_META[best.grade].color, '/assets/currency/iron.webp', 'forge', stars.length > 0)
    for (const item of stars) {
      const label = labelOf(item)
      const shown = spotlight({ stamp: EQUIPMENT_GRADE_META[item.grade].label, grade: `${EQUIPMENT_GRADE_META[item.grade].label} 장비 출현`, name: item.name, sub: `${label.type} · ${label.set}`, extra: item.skillName, image: imageOf(item), color: EQUIPMENT_GRADE_META[item.grade].color }, EQUIP_RANK[item.grade])
      dropLater(behind); behind = null
      await shown
    }
  } finally {
    running = false
  }
}
