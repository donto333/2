export declare const DUEL_USER_THRESHOLD: number
export declare const DUEL_MATCH_COUNT: number
export declare function duelGeneralPower(general: unknown): number
export declare function duelDeckPower(deck: unknown): number
export declare function pickDuelMatches<T extends { id: string; power?: number }>(candidates: T[], myPower: number, count?: number): T[]
export type DuelTier = 'easy' | 'normal' | 'hard'
export declare const DUEL_TIER_FRAGMENTS: Record<DuelTier, number>
export declare function duelTierFor(opponentPower: number, myPower: number): DuelTier
