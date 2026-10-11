// 중립 인공지능 습격 판정 — 서버 자동 습격(webdev-adapter.mjs)과 클라이언트 방어전(src/game/strategy.ts)이
// 같은 규칙을 쓰도록 하나로 모은 순수 함수 모듈. 외부 의존성이 없어야 한다.
//
// 규칙
//  - 습격대 전력 = 900 + 공격 도시 레벨 × 500
//  - 남아 있는 첫 수비대와 싸운다. 습격대 전력 ≥ 수비대 전력 × 0.75 이면 습격대 승리.
//  - 수비대 승리: 성벽 방어도는 깎이지 않는다.
//  - 습격대 승리: 그 수비대가 격파되고 성벽 방어도가 습격대 전력만큼 깎인다.
//    다른 수비대가 남아 있으면 방어도는 1 아래로 내려가지 않고, 도시도 넘어가지 않는다.
//  - 수비대가 하나도 없으면 성벽이 바로 피해를 입고, 방어도가 0이 되면 도시를 빼앗긴다(allowCapture일 때).

export const RAID_WIN_RATIO = 0.75

/** @param {number} attackerLevel */
export function neutralRaidPower(attackerLevel) {
  const level = Math.max(1, Math.min(5, Math.trunc(Number(attackerLevel) || 1)))
  return 900 + level * 500
}

/**
 * @param {{ raidPower: number, garrisonPowers: number[], defeated: number, defense: number, allowCapture?: boolean }} input
 * @returns {{ attackerWon: boolean, defenderIndex: number, defeated: number, damage: number, defense: number, captured: boolean, remaining: number }}
 */
export function resolveNeutralRaid({ raidPower, garrisonPowers, defeated, defense, allowCapture = true }) {
  const powers = Array.isArray(garrisonPowers) ? garrisonPowers.map(p => Math.max(0, Number(p) || 0)) : []
  const already = Math.max(0, Math.min(powers.length, Math.trunc(Number(defeated) || 0)))
  const wall = Math.max(0, Math.trunc(Number(defense) || 0))
  const raid = Math.max(0, Math.trunc(Number(raidPower) || 0))
  const remainingBefore = powers.length - already

  if (remainingBefore > 0) {
    const defenderIndex = already
    if (raid < powers[defenderIndex] * RAID_WIN_RATIO) {
      return { attackerWon: false, defenderIndex, defeated: already, damage: 0, defense: wall, captured: false, remaining: remainingBefore }
    }
    const remaining = remainingBefore - 1
    const floor = remaining > 0 || !allowCapture ? Math.min(wall, 1) : 0
    const next = Math.max(floor, wall - raid)
    return { attackerWon: true, defenderIndex, defeated: already + 1, damage: wall - next, defense: next, captured: allowCapture && remaining === 0 && next <= 0, remaining }
  }

  const floor = allowCapture ? 0 : Math.min(wall, 1)
  const next = Math.max(floor, wall - raid)
  return { attackerWon: true, defenderIndex: -1, defeated: already, damage: wall - next, defense: next, captured: allowCapture && next <= 0, remaining: 0 }
}
