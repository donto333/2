export interface BattlePattern {
  id: string
  label: string
  lane: 0 | 1 | 2
  warning: string
}

export const BATTLE_PATTERNS: BattlePattern[] = [
  { id: 'left-flank', label: '좌익 포위', lane: 0, warning: '좌측 협공이 예고되었습니다. 좌측 기동으로 끊어내십시오.' },
  { id: 'center-charge', label: '중앙 돌파', lane: 1, warning: '적 선봉이 중앙으로 돌입합니다. 중앙 돌파로 맞받으십시오.' },
  { id: 'right-feint', label: '우익 유인', lane: 2, warning: '우측에 빈틈이 생겼습니다. 우측 기동이 연계를 만듭니다.' },
  { id: 'crossfire', label: '십자 포화', lane: 1, warning: '전방 포화가 시작됩니다. 중앙을 고정해 진형을 보존하십시오.' },
]

export interface TacticResult {
  success: boolean
  combo: number
  threat: number
  moraleDamage: number
}

export function resolveTactic(lane: number, patternLane: number, combo: number, threat: number): TacticResult {
  if (lane === patternLane) {
    const nextCombo = Math.min(8, combo + 1)
    return {
      success: true,
      combo: nextCombo,
      threat: Math.max(0, threat - 12),
      moraleDamage: 6 + nextCombo * 2,
    }
  }
  return {
    success: false,
    combo: 0,
    threat: Math.min(100, threat + 14),
    moraleDamage: 0,
  }
}

export type BattleTactic = 'guard' | 'feint' | 'charge'

export interface BattleTacticResult {
  ok: boolean
  gauge: number
  combo: number
  threat: number
  moraleDamage: number
  guardDuration: number
}

export const BATTLE_TACTIC_COST: Record<BattleTactic, number> = { guard: 35, feint: 50, charge: 65 }

export function resolveBattleTactic(tactic: BattleTactic, gauge: number, combo: number, threat: number): BattleTacticResult {
  const cost = BATTLE_TACTIC_COST[tactic]
  if (gauge < cost) return { ok: false, gauge, combo, threat, moraleDamage: 0, guardDuration: 0 }
  if (tactic === 'guard') return { ok: true, gauge: gauge - cost, combo, threat: Math.max(0, threat - 25), moraleDamage: 0, guardDuration: 4.5 }
  if (tactic === 'feint') return { ok: true, gauge: gauge - cost, combo: Math.min(8, combo + 2), threat: Math.max(0, threat - 10), moraleDamage: 10 + combo * 2, guardDuration: 0 }
  return { ok: true, gauge: gauge - cost, combo: 0, threat: Math.min(100, threat + 5), moraleDamage: 18 + combo * 3, guardDuration: 0 }
}

export function phaseName(phase: number): string {
  return ['서막 · 정찰', '2막 · 협곡 포위', '결전 · 적장 진군'][Math.max(0, Math.min(2, phase))] ?? '결전 · 적장 진군'
}
