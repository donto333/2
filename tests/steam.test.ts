import { describe, expect, it } from 'vitest'
import { earnedAchievements, isSteamDesktop, syncSteamAchievements } from '../src/platform/steam'

describe('steam achievements', () => {
  it('earns nothing at the start', () => {
    expect(earnedAchievements({ wins: 0, generalCount: 3, scenarioClearedCount: 0 })).toEqual([])
  })

  it('earns achievements from progress thresholds', () => {
    expect(earnedAchievements({ wins: 1, generalCount: 10, scenarioClearedCount: 1 }))
      .toEqual(['FIRST_VICTORY', 'RECRUIT_10', 'SCENARIO_FIRST'])
    expect(earnedAchievements({ wins: 100, generalCount: 0, scenarioClearedCount: 0 }))
      .toEqual(['FIRST_VICTORY', 'VETERAN_100'])
  })

  it('is a no-op outside the desktop app', () => {
    expect(isSteamDesktop()).toBe(false)
    expect(() => syncSteamAchievements({ wins: 5, generalCount: 20, scenarioClearedCount: 2 })).not.toThrow()
  })
})
