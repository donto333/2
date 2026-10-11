// 천하 아이콘 세트 — 재화·메뉴 그림 (SVG, 32×32).
// 먹선(#2b1307) 외곽선 + 칠기 주홍·금박·비취·청동 그라데이션으로 컬러 테마와 맞춘다.
// 한 번만 문서에 심어 둔 스프라이트(<symbol>)를 <use>로 불러 쓰므로 아이콘이 여러 번 나와도 가볍다.

export type IconName =
  // 재화
  | 'gold' | 'silver' | 'honor' | 'influence' | 'grain' | 'wood' | 'iron' | 'manuals' | 'mythic'
  // 메뉴
  | 'overview' | 'recruit' | 'roster' | 'codex' | 'formation' | 'equipment' | 'territory' | 'research'
  | 'battle' | 'duel' | 'shop' | 'rank' | 'updates' | 'account' | 'admin'

const INK = '#2b1307'
const S = `stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"`

const gradient = (id: string, stops: [string, string, string], x2 = '0', y2 = '1') =>
  `<linearGradient id="gg-${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${stops[0]}"/><stop offset=".5" stop-color="${stops[1]}"/><stop offset="1" stop-color="${stops[2]}"/></linearGradient>`

const DEFS = [
  gradient('gold', ['#fff3c0', '#f2c14e', '#a8701a']),
  gradient('silver', ['#ffffff', '#cdd7de', '#71828d']),
  gradient('red', ['#ff8f6e', '#d23a2a', '#7a1a12']),
  gradient('jade', ['#d2ffea', '#4fcf98', '#1b6e4c']),
  gradient('bronze', ['#f6cf92', '#b8793a', '#633915']),
  gradient('wood', ['#f0c286', '#a8692e', '#5a3210']),
  gradient('iron', ['#e8eef4', '#91a5b8', '#43546a']),
  gradient('paper', ['#fff8e2', '#ecd3a0', '#b08648']),
  gradient('grain', ['#fff3ad', '#e9bf4a', '#97701c']),
  gradient('purple', ['#f4ddff', '#b77cf0', '#57248f']),
  gradient('sky', ['#e6f5ff', '#7fc2ef', '#2f6f9e']),
].join('')

const SYMBOLS: Record<IconName, string> = {
  // ── 재화 ─────────────────────────────────────────────
  // 금화: 네모 구멍 엽전
  gold: `<circle cx="16" cy="16" r="12.5" fill="url(#gg-gold)" ${S}/><circle cx="16" cy="16" r="9.2" fill="none" stroke="#a8701a" stroke-width="1.2"/><rect x="12.4" y="12.4" width="7.2" height="7.2" rx=".8" fill="${INK}"/><path d="M8.5 10.5a9 9 0 0 1 5-4" fill="none" stroke="#fffbe0" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>`,
  // 은전: 말굽은(원보)
  silver: `<path d="M3.5 17.5c2-4 5.5-4.5 8-3 1.5-5.5 7.5-5.5 9 0 2.5-1.5 6-1 8 3-2.5 6.5-7.5 9-12.5 9s-10-2.5-12.5-9z" fill="url(#gg-silver)" ${S}/><path d="M11.5 14.5c1.5 2 7.5 2 9 0" fill="none" stroke="#71828d" stroke-width="1.2"/><path d="M13.5 9.8c1-1.3 3-1.6 4.4-.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`,
  // 명망: 붉은 끈 메달
  honor: `<path d="M10 3h4.5l2.5 9-4 2.5zM22 3h-4.5l-2.5 9 4 2.5z" fill="url(#gg-red)" ${S}/><circle cx="16" cy="20" r="8.5" fill="url(#gg-gold)" ${S}/><path d="M16 14.6l1.6 3.4 3.7.4-2.8 2.5.8 3.7-3.3-1.9-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z" fill="#fff4c4" stroke="#a8701a" stroke-width=".9" stroke-linejoin="round"/>`,
  // 영향력: 옥새(도장)
  influence: `<path d="M11 12c0-4 2.2-7 5-7s5 3 5 7z" fill="url(#gg-gold)" ${S}/><circle cx="16" cy="8.6" r="1.3" fill="${INK}"/><rect x="6.5" y="12" width="19" height="9" rx="1.6" fill="url(#gg-red)" ${S}/><rect x="5" y="21" width="22" height="5.5" rx="1.2" fill="url(#gg-red)" ${S}/><path d="M11 23.8h10" stroke="#ffd59a" stroke-width="1.4" stroke-linecap="round"/><path d="M9 14.3h7" stroke="#ffb093" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>`,
  // 식량: 볏단
  grain: `<path d="M16 29V11M16 29l-5-15M16 29l5-15" fill="none" stroke="#7a5a16" stroke-width="1.6" stroke-linecap="round"/><g fill="url(#gg-grain)" ${S}><ellipse cx="16" cy="7.5" rx="2.6" ry="5"/><ellipse cx="9.8" cy="10.5" rx="2.4" ry="4.6" transform="rotate(-22 9.8 10.5)"/><ellipse cx="22.2" cy="10.5" rx="2.4" ry="4.6" transform="rotate(22 22.2 10.5)"/></g><rect x="11.2" y="19.5" width="9.6" height="3.4" rx="1" fill="url(#gg-red)" ${S}/>`,
  // 목재: 쌓은 통나무
  wood: `<g fill="url(#gg-wood)" ${S}><circle cx="10" cy="21.5" r="6"/><circle cx="22" cy="21.5" r="6"/><circle cx="16" cy="11.5" r="6"/></g><g fill="none" stroke="#f3d29b" stroke-width="1.1"><circle cx="10" cy="21.5" r="3"/><circle cx="22" cy="21.5" r="3"/><circle cx="16" cy="11.5" r="3"/></g><g fill="#6b3f17"><circle cx="10" cy="21.5" r=".9"/><circle cx="22" cy="21.5" r=".9"/><circle cx="16" cy="11.5" r=".9"/></g>`,
  // 철: 쇳덩이 세 개
  iron: `<g fill="url(#gg-iron)" ${S}><path d="M3 25.5l2.2-6.5h9.6l2.2 6.5z"/><path d="M15 25.5l2.2-6.5h9.6l2.2 6.5z"/><path d="M9 18.5l2.2-6.5h9.6l2.2 6.5z"/></g><g stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" opacity=".85"><path d="M6.8 20.6h6"/><path d="M18.8 20.6h6"/><path d="M12.8 13.6h6"/></g>`,
  // 병법서: 죽간
  manuals: `<g fill="url(#gg-paper)" ${S}><rect x="5" y="6" width="4.4" height="20" rx="1.2"/><rect x="9.4" y="5" width="4.4" height="21" rx="1.2"/><rect x="13.8" y="6" width="4.4" height="20" rx="1.2"/><rect x="18.2" y="5" width="4.4" height="21" rx="1.2"/><rect x="22.6" y="6" width="4.4" height="20" rx="1.2"/></g><g stroke="#c0392b" stroke-width="1.8" stroke-linecap="round"><path d="M4 11h24"/><path d="M4 21h24"/></g><g stroke="#7a5a2a" stroke-width="1" stroke-linecap="round" opacity=".8"><path d="M7.2 14v4M11.6 13.5v5M16 14v4M20.4 13.5v5M24.8 14v4"/></g>`,
  // 신화 조각: 빛나는 보석 파편
  mythic: `<path d="M16 3l7.5 9.5L19 29h-6L8.5 12.5z" fill="url(#gg-purple)" ${S}/><path d="M8.5 12.5h15M16 3l-3 9.5L16 29l3-16.5z" fill="none" stroke="#f4ddff" stroke-width="1" opacity=".9"/><path d="M26 4l.9 2.1L29 7l-2.1.9L26 10l-.9-2.1L23 7l2.1-.9z" fill="#ffe9a8"/><path d="M5 21l.6 1.4 1.4.6-1.4.6L5 25l-.6-1.4L3 23l1.4-.6z" fill="#ffe9a8"/>`,

  // ── 메뉴 ─────────────────────────────────────────────
  // 본영: 지붕 올린 전각
  overview: `<path d="M2.5 13c5-1 9-4.5 13.5-8 4.5 3.5 8.5 7 13.5 8z" fill="url(#gg-red)" ${S}/><path d="M16 5v-2.5" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="2.6" r="1.4" fill="url(#gg-gold)" stroke="${INK}" stroke-width="1"/><rect x="6" y="13" width="20" height="3" fill="url(#gg-gold)" ${S}/><g fill="url(#gg-wood)" ${S}><rect x="7.5" y="16" width="3" height="9"/><rect x="21.5" y="16" width="3" height="9"/></g><path d="M12.5 25v-6.5a3.5 3.5 0 0 1 7 0V25z" fill="${INK}"/><rect x="4" y="25" width="24" height="3.5" rx=".8" fill="url(#gg-paper)" ${S}/>`,
  // 모집·장비: 옥패와 붉은 술
  recruit: `<path d="M16 2.5v4" stroke="#c0392b" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="7.5" r="1.8" fill="url(#gg-gold)" stroke="${INK}" stroke-width="1"/><rect x="8" y="9" width="16" height="15" rx="4.5" fill="url(#gg-jade)" ${S}/><circle cx="16" cy="16.5" r="3" fill="none" stroke="#1b6e4c" stroke-width="1.4"/><path d="M11 12.2c1.5-1.2 3.4-1.6 5-1.4" fill="none" stroke="#e9fff4" stroke-width="1.4" stroke-linecap="round"/><path d="M14 24v5M16 24v5.5M18 24v5" stroke="#c0392b" stroke-width="1.6" stroke-linecap="round"/>`,
  // 보유 무장: 투구
  roster: `<path d="M16 2c1.8 2 2 3.6.8 5.2" fill="none" stroke="#c0392b" stroke-width="2.2" stroke-linecap="round"/><path d="M6 19c0-7 4.5-11.5 10-11.5S26 12 26 19z" fill="url(#gg-iron)" ${S}/><path d="M16 7.5V19" stroke="#43546a" stroke-width="1.3"/><path d="M4.5 19h23l-1.5 3.5H6z" fill="url(#gg-gold)" ${S}/><path d="M7 22.5l1 6.5 4.5-2.5V22.5zM25 22.5l-1 6.5-4.5-2.5V22.5z" fill="url(#gg-iron)" ${S}/><path d="M10 13.5c1-2.4 2.8-3.8 5-4.2" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>`,
  // 무장 도감: 표지 있는 책
  codex: `<path d="M6 4.5h17.5a2.5 2.5 0 0 1 2.5 2.5v20H8.5A2.5 2.5 0 0 1 6 24.5z" fill="url(#gg-red)" ${S}/><path d="M6 24.5A2.5 2.5 0 0 1 8.5 22H26" fill="none" ${S}/><path d="M8.5 22H26v5H8.5a2.5 2.5 0 0 1 0-5z" fill="url(#gg-paper)" ${S}/><rect x="11.5" y="8" width="9" height="10" rx="1" fill="url(#gg-paper)" stroke="${INK}" stroke-width="1.2"/><path d="M13.5 11h5M13.5 13.5h5M13.5 16h3" stroke="#7a5a2a" stroke-width="1.1" stroke-linecap="round"/><path d="M23 4.5v9l-1.8-1.3-1.8 1.3v-9" fill="url(#gg-gold)" stroke="${INK}" stroke-width="1"/>`,
  // 출전 편성: 세 깃발
  formation: `<g stroke="${INK}" stroke-width="1.6" stroke-linecap="round"><path d="M5 29.5V4"/><path d="M16 29.5V2.5"/><path d="M27 29.5V4"/></g><path d="M5 4.5h10l-2.6 4.2 2.6 4.3H5z" fill="url(#gg-red)" ${S}/><path d="M16 3h10l-2.6 4.2 2.6 4.3H16z" fill="url(#gg-gold)" ${S}/><path d="M27 15h-10l2.6 4.2-2.6 4.3H27z" fill="url(#gg-jade)" ${S}/><path d="M2.5 29.5h27" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  // 장비 관리: 검과 방패
  equipment: `<circle cx="20" cy="19" r="9" fill="url(#gg-bronze)" ${S}/><circle cx="20" cy="19" r="3.4" fill="url(#gg-gold)" stroke="${INK}" stroke-width="1.2"/><path d="M5.5 4.5l12 12-2.2 2.2-12-12-.5-2.7z" fill="url(#gg-iron)" ${S}/><path d="M13.6 19.6l6-6M15.3 20.8l2.6 2.6" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/><path d="M12.8 18.8l5.4-5.4 1.4 1.4-5.4 5.4z" fill="url(#gg-gold)" ${S}/><path d="M15.8 21.3l2.8 2.8" stroke="#6b3f17" stroke-width="2.6" stroke-linecap="round"/>`,
  // 영토·내정: 성문과 망루
  territory: `<path d="M10 9c2-.5 4-2 6-3.5 2 1.5 4 3 6 3.5z" fill="url(#gg-red)" ${S}/><rect x="11.5" y="9" width="9" height="4" fill="url(#gg-paper)" ${S}/><path d="M3 13h26v15H3z" fill="url(#gg-bronze)" ${S}/><path d="M3 13v-2.5h3V13M9 13v-2.5h3V13M20 13v-2.5h3V13M26 13v-2.5h3V13" fill="url(#gg-bronze)" ${S}/><path d="M12 28v-7a4 4 0 0 1 8 0v7z" fill="${INK}"/><g stroke="#633915" stroke-width="1" opacity=".75"><path d="M3 18h7M22 18h7M3 23h7M22 23h7M6.5 13v5M25.5 13v5"/></g>`,
  // 기술 연구: 펼친 두루마리와 붓
  research: `<path d="M4 9h20v16H4z" fill="url(#gg-paper)" ${S}/><rect x="2.5" y="7" width="3" height="20" rx="1.5" fill="url(#gg-wood)" ${S}/><rect x="22.5" y="7" width="3" height="20" rx="1.5" fill="url(#gg-wood)" ${S}/><g stroke="#2b1307" stroke-width="1.2" stroke-linecap="round" opacity=".7"><path d="M9 12v9M12.5 12v6M16 12v8"/></g><path d="M29.5 3.5L20 18" stroke="#6b3f17" stroke-width="2.4" stroke-linecap="round"/><path d="M20.6 17l-1.9 3.6 3.2-2.3z" fill="${INK}"/><path d="M27.7 6.3l1.6 1" stroke="#f2c14e" stroke-width="2.2" stroke-linecap="round"/>`,
  // 시나리오: 지도 두루마리와 붉은 깃발
  battle: `<path d="M5 8c3-1.5 6 1.5 9 0s6-1.5 9 0v17c-3-1.5-6 1.5-9 0s-6-1.5-9 0z" fill="url(#gg-paper)" ${S}/><path d="M8 20c2-3 4-1 6-4s3-2 4-3" fill="none" stroke="#2f6f9e" stroke-width="1.4" stroke-linecap="round"/><path d="M9 13l2 2M11 13l-2 2" stroke="#c0392b" stroke-width="1.4" stroke-linecap="round"/><path d="M24 29V9" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/><path d="M24 9h6l-2 2.6 2 2.6h-6z" fill="url(#gg-red)" ${S}/>`,
  // 유저 대련: 엇갈린 두 검
  duel: `<g fill="url(#gg-iron)" ${S}><path d="M4.5 3.5l3 .5 15 15-2.5 2.5-15-15z"/><path d="M27.5 3.5l-3 .5-15 15 2.5 2.5 15-15z"/></g><g fill="url(#gg-gold)" ${S}><path d="M18.5 22.5l4-4 1.5 1.5-4 4z"/><path d="M13.5 22.5l-4-4L8 20l4 4z"/></g><g stroke="#6b3f17" stroke-width="2.6" stroke-linecap="round"><path d="M22.8 24l3.7 3.7"/><path d="M9.2 24l-3.7 3.7"/></g>`,
  // 상점: 동전 주머니
  shop: `<path d="M11 9.5c-4.5 3-7 7.5-6 12 1 4.5 5 6.5 11 6.5s10-2 11-6.5c1-4.5-1.5-9-6-12z" fill="url(#gg-red)" ${S}/><path d="M10.5 9.5h11l-2-3.5h-7z" fill="url(#gg-red)" ${S}/><path d="M10 9.5h12" stroke="url(#gg-gold)" stroke-width="2.6" stroke-linecap="round"/><path d="M10 9.5h12" stroke="${INK}" stroke-width="1" stroke-linecap="round" opacity=".5"/><circle cx="16" cy="19.5" r="4.6" fill="url(#gg-gold)" stroke="${INK}" stroke-width="1.3"/><rect x="14.6" y="18.1" width="2.8" height="2.8" fill="${INK}"/>`,
  // 천하 랭킹: 청동 솥(정)
  rank: `<path d="M8.5 9V5.5h3V9M20.5 9V5.5h3V9" fill="none" ${S}/><path d="M4 9h24c0 7-4.5 12-12 12S4 16 4 9z" fill="url(#gg-bronze)" ${S}/><g fill="url(#gg-bronze)" ${S}><path d="M8.5 19l-2 9h3l2.5-7.5z"/><path d="M23.5 19l2 9h-3l-2.5-7.5z"/><path d="M14.5 21l-.5 7h4l-.5-7z"/></g><path d="M7 12.5h18" stroke="#f6cf92" stroke-width="1.3" stroke-linecap="round" opacity=".9"/><path d="M12 15.5l2 1.5 2-1.5 2 1.5 2-1.5" fill="none" stroke="#633915" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  // 업데이트 기록: 종
  updates: `<path d="M16 3v3" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/><path d="M13 3h6" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M9.5 9.5a6.5 6.5 0 0 1 13 0V20l3 4.5h-19l3-4.5z" fill="url(#gg-bronze)" ${S}/><path d="M9.5 15h13M9.5 18h13" stroke="#633915" stroke-width="1.1" opacity=".8"/><circle cx="16" cy="27" r="2.2" fill="url(#gg-gold)" stroke="${INK}" stroke-width="1.2"/><path d="M12.5 8.5c.6-1.5 1.8-2.4 3.2-2.7" fill="none" stroke="#fff3c0" stroke-width="1.3" stroke-linecap="round"/><path d="M27 7.5l2-1.5M27.5 11h2.5M5 7.5L3 6M4.5 11H2" stroke="#f2c14e" stroke-width="1.4" stroke-linecap="round"/>`,
  // 계정 관리: 초상 패와 인장
  account: `<rect x="5" y="3.5" width="18" height="23" rx="2" fill="url(#gg-paper)" ${S}/><circle cx="14" cy="11.5" r="3.8" fill="url(#gg-wood)" stroke="${INK}" stroke-width="1.3"/><path d="M7.5 22.5c.8-4 3.4-6 6.5-6s5.7 2 6.5 6z" fill="url(#gg-wood)" stroke="${INK}" stroke-width="1.3"/><rect x="19" y="19" width="9.5" height="9.5" rx="1.6" fill="url(#gg-red)" ${S}/><path d="M21.5 21.5h4.5v4.5h-4.5zM23.75 21.5v4.5" fill="none" stroke="#ffd59a" stroke-width="1.1"/>`,
  // 관리자 센터: 열쇠
  admin: `<circle cx="10" cy="11" r="6.5" fill="url(#gg-gold)" ${S}/><circle cx="10" cy="11" r="2.4" fill="${INK}"/><path d="M14.6 15.6l12.4 12.4" stroke="${INK}" stroke-width="5.2" stroke-linecap="round"/><path d="M14.6 15.6l12.4 12.4" stroke="url(#gg-gold)" stroke-width="2.6" stroke-linecap="round"/><path d="M22 23l2.4-2.4M25 26l2.4-2.4" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`,
}

export const ICON_NAMES = Object.keys(SYMBOLS) as IconName[]

/** 문서에 한 번 넣는 스프라이트 */
export function iconSprite(): string {
  const symbols = ICON_NAMES.map(name => `<symbol id="gi-${name}" viewBox="0 0 32 32">${SYMBOLS[name]}</symbol>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" id="gi-sprite" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>${DEFS}</defs>${symbols}</svg>`
}

export function ensureIconSprite(doc: Document = document): void {
  if (doc.getElementById('gi-sprite')) return
  doc.body.insertAdjacentHTML('afterbegin', iconSprite())
}

/** 아이콘 하나. 크기는 CSS(.gi)로 정한다. */
export function icon(name: IconName, className = ''): string {
  return `<svg class="gi gi--${name}${className ? ` ${className}` : ''}" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><use href="#gi-${name}"/></svg>`
}
