/** 버프 · 디버프 · 인연 아이콘: 이모지 대신 금테 인장 안에 가는 선으로 그린 문양 */
const G: Record<string, string> = {
  sword: 'M5 19L16 8M14 5h5v5M4 16l4 4M6 18l-2 2',
  dragon: 'M3 15c3 0 3-6 6-6s3 6 6 6 4-3 5-6M17 6l3 3-3 1',
  bolt: 'M13 3L6 13h5l-1 8 7-10h-5l1-8z',
  shield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
  gem: 'M7 4h10l3 5-8 11L4 9zM4 9h16M9 4l3 5 3-5',
  horn: 'M4 10v4h3l8 4V6L7 10zM18 9c1.5 1.5 1.5 4.5 0 6',
  chain: 'M10 14l-2 2a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0M14 10l2-2a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0M9.5 14.5l5-5',
  eye: 'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  flame: 'M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 2 3 1-2 1-5 1-7z',
  target: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11.5v1',
  banner: 'M6 21V3M6 4h11l-3 4 3 4H6',
  counter: 'M9 6L4 11l5 5M4 11h10a5 5 0 0 1 0 10h-2',
  scroll: 'M6 4h11v14a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h9M9 8h5M9 11h5',
  wind: 'M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',
  search: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM14.5 14.5L20 20',
  spiral: 'M11 12a1 1 0 0 1 2 0a2 2 0 0 1-4 0a3 3 0 0 1 6 0a4 4 0 0 1-8 0a5 5 0 0 1 10 0a6 6 0 0 1-12 0',
  bow: 'M6 3c8 3 8 15 0 18M6 3v18M4 12h15M16 9l3 3-3 3',
  surge: 'M4 6l6 6-6 6M11 6l6 6-6 6',
  weight: 'M7 10h10l3 10H4zM12 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  cup: 'M7 4h10l-1 7a4 4 0 0 1-8 0zM12 15v5M9 20h6',
  crack: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM12 6l-2 5 3 2-2 5',
  warn: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  glass: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9',
  drop: 'M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z',
  burst: 'M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M6 18l3-3',
  mute: 'M4 5h16v11H9l-5 4zM4 4l16 16',
  blind: 'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12zM4 4l16 16',
  wave: 'M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  rage: 'M9 3v3a2 2 0 0 1-2 2H3M15 3v3a2 2 0 0 0 2 2h4M9 21v-3a2 2 0 0 0-2-2H3M15 21v-3a2 2 0 0 1 2-2h4',
  down: 'M12 4v14M6 12l6 6 6-6',
  bond: 'M9 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM15 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
}
const BY_EFFECT: Record<string, string> = {
  'dragon-might': 'dragon', 'swift-step': 'bolt', 'iron-wall': 'shield', 'jade-command': 'gem', 'war-chant': 'horn',
  'chain-fury': 'chain', 'hawk-eye': 'eye', 'phoenix-guard': 'flame', 'battle-focus': 'target', 'rally-banner': 'banner',
  'atk-up': 'sword', 'dr-up': 'shield', counter: 'counter', 'tactic-discount': 'scroll', 'east-wind': 'wind', insight: 'search',
  'chaos-craft': 'spiral', 'archer-focus': 'bow', 'cavalry-surge': 'surge', 'heavy-step': 'weight', hangover: 'cup',
  'armor-break': 'crack', burning: 'flame', fear: 'warn', confusion: 'spiral', slow: 'glass', bleed: 'drop', fracture: 'burst',
  mark: 'target', silence: 'mute', blind: 'blind', chain: 'chain', flood: 'wave', rage: 'rage', 'p-burn': 'flame',
  'p-confuse': 'spiral', 'p-fear': 'down', 'e-guard': 'shield', bond: 'bond',
}

/** 효과 id(또는 'bond')의 인장 아이콘 SVG */
export function fxGlyph(id: string): string {
  const d = G[BY_EFFECT[id] ?? 'sword'] ?? G.sword
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`
}

/** 금테 인장: kind = buff | debuff | bond */
export function fxSeal(id: string, kind: string): string {
  return `<span class="fx-seal is-${kind}">${fxGlyph(id)}</span>`
}
