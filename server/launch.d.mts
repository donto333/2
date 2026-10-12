export declare const OFFICIAL_LAUNCH: boolean
export declare function isLaunched(env?: Record<string, string | undefined>): boolean
export interface BalanceAccess { launched: boolean; allowed: boolean; reason: 'prelaunch' | 'login_required' | 'not_operator' | 'operator' }
export declare function balanceAccess(launched: boolean, user: { role?: string; email?: string | null } | null, adminEmail?: string): BalanceAccess
