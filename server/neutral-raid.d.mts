export declare const RAID_WIN_RATIO: number
export declare function neutralRaidPower(attackerLevel: number): number
export interface NeutralRaidInput { raidPower: number; garrisonPowers: number[]; defeated: number; defense: number; allowCapture?: boolean }
export interface NeutralRaidResult { attackerWon: boolean; defenderIndex: number; defeated: number; damage: number; defense: number; captured: boolean; remaining: number }
export declare function resolveNeutralRaid(input: NeutralRaidInput): NeutralRaidResult
