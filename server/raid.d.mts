export declare const RAID_DAILY_LIMIT: number
export declare const RAID_SQUADS: number
export declare const RAID_MIN_USERS: number
export declare const RAID_TOP_USERS: number
export declare const RAID_DEFAULT_LEVEL: number
export declare function raidWeekKey(now?: number): string
export declare function previousRaidWeekKey(now?: number): string
export declare function raidResetIn(now?: number): number
export declare function raidDayKey(now?: number): string
export interface RaidRewardRow { from: number; to: number; gold: number; stones: number }
export declare const RAID_REWARDS: RaidRewardRow[]
export declare function raidRewardFor(rank: number): { gold: number; stones: number }
export declare function raidBossLevel(deckLevels: number[]): number
export declare const RAID_CAP_PER_POWER: number
export declare const RAID_CAP_FLOOR: number
export declare function raidDamageCap(squadPower: number): number
