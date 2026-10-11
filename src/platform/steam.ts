// Steam 데스크톱 버전에서만 동작하는 업적 연동.
// 웹 브라우저에서는 window.CheonharoDesktop이 없으므로 아무 일도 하지 않는다.

export interface SteamProgress {
  wins: number
  generalCount: number
  scenarioClearedCount: number
}

interface DesktopBridge {
  platform: string
  steamStatus(): Promise<{ available: boolean; appId: number; playerName: string; error: string }>
  unlockAchievements(ids: string[]): Promise<string[]>
}

declare global {
  interface Window { CheonharoDesktop?: DesktopBridge }
}

/** 진행도에서 달성한 업적 ID 목록을 계산한다 (순수 함수). */
export function earnedAchievements(progress: SteamProgress): string[] {
  const earned: string[] = []
  if (progress.wins >= 1) earned.push('FIRST_VICTORY')
  if (progress.wins >= 100) earned.push('VETERAN_100')
  if (progress.generalCount >= 10) earned.push('RECRUIT_10')
  if (progress.scenarioClearedCount >= 1) earned.push('SCENARIO_FIRST')
  return earned
}

const reported = new Set<string>()

export function isSteamDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean(window.CheonharoDesktop)
}

/** 새로 달성한 업적만 Steam에 보낸다. 실패해도 게임 진행에는 영향을 주지 않는다. */
export function syncSteamAchievements(progress: SteamProgress): void {
  const bridge = typeof window !== 'undefined' ? window.CheonharoDesktop : undefined
  if (!bridge) return
  const pending = earnedAchievements(progress).filter(id => !reported.has(id))
  if (!pending.length) return
  pending.forEach(id => reported.add(id))
  bridge.unlockAchievements(pending).catch(() => pending.forEach(id => reported.delete(id)))
}
