// 천하 아이콘 세트 — 재화·메뉴 그림 (SVG, 32×32).
// 메뉴는 금빛 한 색 선 그림, 재화는 먹선 + 평면 두 색(광택·그라데이션 없음).
// 한 번만 문서에 심어 둔 스프라이트(<symbol>)를 <use>로 불러 쓰므로 아이콘이 여러 번 나와도 가볍다.

export type IconName =
  // 재화
  | 'gold' | 'silver' | 'honor' | 'influence' | 'grain' | 'wood' | 'iron' | 'manuals' | 'mythic'
  // 메뉴
  | 'overview' | 'recruit' | 'roster' | 'codex' | 'formation' | 'equipment' | 'territory' | 'research'
  | 'battle' | 'duel' | 'raid' | 'shop' | 'rank' | 'board' | 'guild' | 'updates' | 'account' | 'admin' | 'balance'

// 메뉴: 한 가지 굵기의 선 그림(금빛 한 색). 재화: 두 가지 색의 평면 그림 + 먹선. 광택·무지개 그라데이션은 쓰지 않는다.
const LINE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
const INK = '#24130a'
const flat = (fill: string) => `fill="${fill}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"`


const SYMBOLS: Record<IconName, string> = {
  // ── 재화(평면 2색) ─────────────────────────────────────
  // 금화: 네모 구멍 엽전
  gold: `<circle cx="16" cy="16" r="12" ${flat('#d6a23c')}/><circle cx="16" cy="16" r="8.6" fill="none" stroke="#8a5d17" stroke-width="1.4"/><rect x="12.6" y="12.6" width="6.8" height="6.8" fill="${INK}"/>`,
  // 은전: 말굽은(원보)
  silver: `<path d="M3.5 16.5c2.5-3 6-3 8.2-1.6.8-4.6 7.8-4.6 8.6 0 2.2-1.4 5.7-1.4 8.2 1.6-2 6.2-7 9-12.5 9S5.5 22.7 3.5 16.5z" ${flat('#c3c9ce')}/><path d="M11.5 15.2c2 1.8 7 1.8 9 0" fill="none" stroke="#5f6b75" stroke-width="1.4"/>`,
  // 옥패: 비취 패 + 붉은 끈
  honor: `<path d="M16 2.5v4" stroke="#a6281d" stroke-width="2.4" stroke-linecap="round"/><path d="M10 7h12l3 4v13l-3 4H10l-3-4V11z" ${flat('#4c9c78')}/><circle cx="16" cy="17" r="4" fill="#2e6b51" stroke="${INK}" stroke-width="1.4"/><path d="M11 11h10" stroke="#2e6b51" stroke-width="1.4"/>`,
  // 영향력: 붉은 인장
  influence: `<path d="M12 4h8v7h-8z" ${flat('#8a5a2b')}/><path d="M8 11h16v4H8z" ${flat('#6b4320')}/><path d="M6 15h20v12H6z" ${flat('#b0352a')}/><path d="M11 19h10M11 23h10M16 19v4" stroke="#f1d6b0" stroke-width="1.4"/>`,
  // 식량: 볏단
  grain: `<path d="M16 29V11M16 29c-2-5-5-8-8-10M16 29c2-5 5-8 8-10" fill="none" stroke="#b8862c" stroke-width="2" stroke-linecap="round"/><path d="M16 3c-3 2.5-3 7 0 9.5 3-2.5 3-7 0-9.5zM7.5 8.5c-1.8 3.2-.6 7 2.8 8.4 1-3.4-.2-7-2.8-8.4zM24.5 8.5c1.8 3.2.6 7-2.8 8.4-1-3.4.2-7 2.8-8.4z" ${flat('#e0b84e')}/><path d="M11 23.5h10" stroke="#8a5d17" stroke-width="2.4" stroke-linecap="round"/>`,
  // 목재: 통나무
  wood: `<path d="M5 12h19l3 4.5-3 4.5H5z" ${flat('#a2652c')}/><ellipse cx="6.5" cy="16.5" rx="3.5" ry="4.5" ${flat('#d9a46a')}/><ellipse cx="6.5" cy="16.5" rx="1.4" ry="2" fill="none" stroke="#7a4a1d" stroke-width="1.2"/><path d="M11 14.5h8M13 18.5h9" stroke="#6b3e17" stroke-width="1.3" stroke-linecap="round"/>`,
  // 철: 덩이쇠
  iron: `<path d="M5 20l4-8h14l4 8z" ${flat('#7d8a96')}/><path d="M5 20h22v5H5z" ${flat('#55606b')}/><path d="M11 15h10" stroke="#aeb8c1" stroke-width="1.4" stroke-linecap="round"/>`,
  // 병서: 죽간
  manuals: `<path d="M6 7h20v18H6z" ${flat('#cfae72')}/><path d="M10 7v18M14 7v18M18 7v18M22 7v18" stroke="#8a6630" stroke-width="1.3"/><path d="M4 11h24M4 21h24" stroke="#a6281d" stroke-width="1.6" stroke-linecap="round"/>`,
  // 신화장비 조각: 보랏빛 결정
  mythic: `<path d="M16 3l7 8-7 18-7-18z" ${flat('#8b5bc4')}/><path d="M9 11h14M16 3v26" stroke="#4f2b7a" stroke-width="1.3"/>`,

  // ── 메뉴(선 그림 한 색) ───────────────────────────────
  // 본영: 처마가 들린 전각
  overview: `<path d="M3 12.5c4.5 0 8-2.5 13-7.5 5 5 8.5 7.5 13 7.5" ${LINE}/><path d="M7 13v13M25 13v13M4.5 26.5h23M13.5 26.5v-6h5v6M10 16.5h12" ${LINE}/>`,
  // 보유 무장: 투구
  roster: `<path d="M7.5 20a8.5 8.5 0 0 1 17 0" ${LINE}/><path d="M5 20.5h22M9 20.5v4l7 3 7-3v-4M16 11.5V5.5M13.5 5.5h5" ${LINE}/>`,
  // 무장 도감: 펼친 책
  codex: `<path d="M16 9.5c-2.5-2-6-2.5-11-2v17c5-.5 8.5 0 11 2 2.5-2 6-2.5 11-2v-17c-5-.5-8.5 0-11 2zM16 9.5v17" ${LINE}/>`,
  // 출전 편성: 세 진 표시
  formation: `<path d="M16 5l3.5 3.5L16 12l-3.5-3.5zM8 18l3.5 3.5L8 25l-3.5-3.5zM24 18l3.5 3.5L24 25l-3.5-3.5z" ${LINE}/><path d="M14 13.5l-4 3M18 13.5l4 3M11.5 21.5h9" ${LINE} stroke-dasharray="1.5 3"/>`,
  // 모집 · 장비: 옥패
  recruit: `<path d="M16 2.5v3.5M10.5 6h11l3 4v14l-3 4h-11l-3-4V10z" ${LINE}/><circle cx="16" cy="16.5" r="3.6" ${LINE}/>`,
  // 장비 관리: 방패와 검
  equipment: `<path d="M13 6l7 2.5v7c0 5.5-3.2 9-7 10.5-3.8-1.5-7-5-7-10.5v-7z" ${LINE}/><path d="M27 5L19 13M24.5 12.5l-3-3M18 14l-1.5 1.5" ${LINE}/>`,
  // 기술 연구: 두루마리
  research: `<path d="M8 6h17v18a3 3 0 0 1-3 3H10" ${LINE}/><path d="M8 6a2.5 2.5 0 0 0 0 5h3M10 27a3 3 0 0 1-3-3V11M14 13h7M14 17h7M14 21h4" ${LINE}/>`,
  // 영토 · 내정: 성벽과 문
  territory: `<path d="M4.5 26.5V14h4v-3.5h3V14h9v-3.5h3V14h4v12.5z" ${LINE}/><path d="M13 26.5v-5a3 3 0 0 1 6 0v5M4.5 26.5h23" ${LINE}/>`,
  // 시나리오(전투): 엇갈린 칼
  battle: `<path d="M6 5l14.5 14.5M26 5L11.5 19.5M17.5 22.5l4-4M14.5 22.5l-4-4M21 22l4.5 4.5M11 22l-4.5 4.5" ${LINE}/>`,
  // 유저 대련: 마주 선 두 창
  duel: `<path d="M5 27L22 10M27 27L10 10M22 10l1-5 4-1-1 4zM10 10L9 5 5 4l1 4z" ${LINE}/>`,
  // 레이드: 뿔 달린 투구(보스)
  raid: `<path d="M8 15c0-5 3.6-8.5 8-8.5s8 3.5 8 8.5v6c0 3-2 5-4 5h-8c-2 0-4-2-4-5z" ${LINE}/><path d="M8 12L4 5l6 4M24 12l4-7-6 4M12 18h3M17 18h3M14 23h4" ${LINE}/>`,
  // 천하 랭킹: 단상
  rank: `<path d="M4 27h24M6.5 27v-7.5h6.5V27M13 27V13h6v14M19 27v-5.5h6.5V27" ${LINE}/><path d="M16 4.5l1.4 2.9 3.1.4-2.3 2.1.6 3.1L16 11.5 13.2 13l.6-3.1-2.3-2.1 3.1-.4z" ${LINE} stroke-width="1.6"/>`,
  // 진영 게시판: 방(榜)
  board: `<path d="M5 6.5h22v15H5zM9 21.5L7 27M23 21.5l2 5.5M9.5 11h13M9.5 15h9" ${LINE}/>`,
  // 연맹: 깃대 + 갈라진 깃발 + 별
  guild: `<path d="M8 4v24M8 5h16l-4 5 4 5H8" ${LINE}/><path d="M14.5 8.2l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" ${LINE}/>`,
  // 상점: 돈주머니
  shop: `<path d="M12.5 6.5h7l-2 3.5c5 1.8 8 6 8 10 0 4-4 6.5-9.5 6.5S6.5 24 6.5 20c0-4 3-8.2 8-10z" ${LINE}/><path d="M13 10h6M13.5 19h5" ${LINE}/>`,
  // 업데이트 기록: 징
  updates: `<path d="M5 27h22M7 27V6.5h18V27M7 6.5h18" ${LINE}/><circle cx="16" cy="16.5" r="5.5" ${LINE}/><circle cx="16" cy="16.5" r="1.5" ${LINE}/>`,
  // 계정 관리: 사람
  account: `<circle cx="16" cy="11" r="5" ${LINE}/><path d="M6 27c1-6 5-9 10-9s9 3 10 9" ${LINE}/>`,
  // 관리자 센터: 열쇠
  admin: `<circle cx="10.5" cy="10.5" r="5.5" ${LINE}/><path d="M14.5 14.5l12 12M22 22l3-3M25 25l2.5-2.5" ${LINE}/>`,
  // 밸런스 테스트: 저울
  balance: `<path d="M16 5v21M10 26.5h12M6 9.5h20M6 9.5l-3.5 8h7zM26 9.5l-3.5 8h7z" ${LINE}/>`,
}

export const ICON_NAMES = Object.keys(SYMBOLS) as IconName[]

/** 문서에 한 번 넣는 스프라이트 */
export function iconSprite(): string {
  const symbols = ICON_NAMES.map(name => `<symbol id="gi-${name}" viewBox="0 0 32 32">${SYMBOLS[name]}</symbol>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" id="gi-sprite" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false">${symbols}</svg>`
}

export function ensureIconSprite(doc: Document = document): void {
  if (doc.getElementById('gi-sprite')) return
  doc.body.insertAdjacentHTML('afterbegin', iconSprite())
}

/** 재화는 사실적인 그림(미리 그려 둔 webp), 메뉴는 선 그림 */
const CURRENCY: ReadonlySet<IconName> = new Set(['gold', 'silver', 'honor', 'influence', 'grain', 'wood', 'iron', 'manuals', 'mythic'])

/** 아이콘 하나. 크기는 CSS(.gi)로 정한다. */
export function icon(name: IconName, className = ''): string {
  if (CURRENCY.has(name)) return `<img class="gi gi--img gi--${name}${className ? ` ${className}` : ''}" src="/assets/currency/${name}.webp" alt="" aria-hidden="true" draggable="false" decoding="async">`
  return `<svg class="gi gi--${name}${className ? ` ${className}` : ''}" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><use href="#gi-${name}"/></svg>`
}
