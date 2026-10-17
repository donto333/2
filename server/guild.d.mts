export type GuildRole = 'leader' | 'deputy' | 'elite' | 'member'
export type GuildTechId = 'harvest' | 'siege' | 'garrison' | 'raid' | 'build' | 'supply' | 'duel'
export type GuildContributionKind = 'donateSilver' | 'donateResources' | 'donateGold' | 'siege' | 'targetSiege' | 'defense' | 'raid' | 'attendance'
export interface GuildEmblem { color: number; pattern: number }
export interface GuildTarget { cityId: string; cityName: string; weekKey: string; setBy: string; done?: boolean }
export interface GuildView {
  id: number; name: string; faction: string; level: number; exp: number; expToNext: number; funds: number; capacity: number; members: number
  emblem: GuildEmblem; notice: string; joinMode: 'open' | 'approval'; minLevel: number; tech: Partial<Record<GuildTechId, number>>; techCap: number
  target: GuildTarget | null; weekPoints: number; weekRaid: number; leaderUserId: number; createdAt: number
}
export interface GuildMemberView { userId: number; name: string; role: GuildRole; power: number; lastActiveAt: number; weekPoints: number; weekRaid: number; joinedAt: number }
export interface GuildRequestView { id: number; userId: number; name: string; power: number; maxLevel: number; createdAt: number }
export interface GuildInviteView { id: number; guildId: number; guildName: string; emblem: GuildEmblem; level: number; from: string }
export interface GuildPendingReward { id: string; label: string; gold?: number; manuals?: number; honor?: number }
export interface GuildMe {
  guild: GuildView | null; member: GuildMemberView | null; members?: GuildMemberView[]; requests?: GuildRequestView[]
  pending: GuildPendingReward[]; points: number; rejoinAt: number; invites: GuildInviteView[]; applications: number[]; usage: Record<string, number>
}
export interface GuildLog { id: number; guildId: number; at: number; text: string }
export interface GuildChatMessage { id: number; guildId: number; userId: number; name: string; role?: GuildRole; text: string; at: number }
export interface GuildRankingRow { id: number; name: string; faction: string; emblem: GuildEmblem; level: number; members: number; score: number; rank: number; mine: boolean }
export interface GuildRanking { kind: string; rows: GuildRankingRow[]; lastWeek: { contribution: Array<{ guildId: number; name: string; score: number; rank: number }>; raid: Array<{ guildId: number; name: string; score: number; rank: number }> } | null }
export interface GuildGrant { manuals?: number; silver?: number; grain?: number; wood?: number; iron?: number; freeRecruits?: number; freeDraws?: number }
export interface GuildShopItem { id: string; name: string; price: number; minLevel: number; limit: number; period: 'week' | 'month'; grant: GuildGrant & { fragments?: number; stones?: number } }
export interface GuildContributionRule { label: string; cost?: { silver?: number; grain?: number; wood?: number; iron?: number; gold?: number }; points: number; exp: number; funds: number; limit: number; period: 'day' | 'week'; shares?: string }
export interface GuildTechRule { name: string; desc: string; per: number; unit: '+' | '−'; max: number }
export interface GuildBonuses { harvest: number; wall: number; garrison: number; raid: number; buildCut: number; siegeCostCut: number; duel: number }

export declare const GUILD_CREATE_GOLD: number
export declare const GUILD_CREATE_MIN_LEVEL: number
export declare const GUILD_MAX_LEVEL: number
export declare const GUILD_REJOIN_MS: number
export declare const GUILD_APPLY_EXPIRE_MS: number
export declare const GUILD_LEADER_AFK_MS: number
export declare const GUILD_REWARD_MIN_MEMBER_MS: number
export declare const GUILD_ROLE_LIMIT: Record<'leader' | 'deputy' | 'elite', number>
export declare const GUILD_ROLES: GuildRole[]
export declare const GUILD_ROLE_LABEL: Record<GuildRole, string>
export declare const GUILD_NAME_RE: RegExp
export declare const GUILD_COLORS: string[]
export declare const GUILD_PATTERNS: string[]
export declare const GUILD_CHAT_MAX: number
export declare const GUILD_CHAT_KEEP: number
export declare const GUILD_CHAT_INTERVAL_MS: number
export declare const GUILD_NOTICE_MAX: number
export declare const GUILD_CONTRIBUTIONS: Record<GuildContributionKind, GuildContributionRule>
export declare const GUILD_DONATIONS: GuildContributionKind[]
export declare const GUILD_TECHS: Record<GuildTechId, GuildTechRule>
export declare const GUILD_TECH_IDS: GuildTechId[]
export declare const GUILD_BONUS_CAP: number
export declare const GUILD_TARGET_WALL: number
export declare const GUILD_SHOP: GuildShopItem[]
export declare const GUILD_WEEKLY_REWARDS: Array<{ rank?: number; top?: number; gold: number; manuals: number }>
export declare const GUILD_TARGET_REWARD: { honor: number; manuals: number; exp: number }
export declare function guildCapacity(level: number): number
export declare function guildExpToNext(level: number): number
export declare function addGuildExp<T extends { level: number; exp: number }>(guild: T, exp: number): T
export declare function guildTechCap(guildLevel: number): number
export declare function guildTechCost(nextLevel: number): number
export declare function guildBonuses(tech?: Partial<Record<string, number>>): GuildBonuses
export declare function guildWeeklyReward(rank: number, total: number): { gold: number; manuals: number } | null
export declare function guildDayKey(now?: number): string
export declare function guildMonthKey(now?: number): string
export declare function guildWeekKey(now?: number): string
export declare function validGuildName(name: string): string | null
export declare class GuildError extends Error {}

export interface GuildAccount { userId: number; name: string; faction: string; maxLevel: number; power: number; operator?: boolean; gold?: number; fragments?: number; stones?: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GuildRepo = Record<string, (...args: any[]) => Promise<any>> & { accounts?: Map<number, GuildAccount> }
export declare function createMemoryGuildRepo(accounts?: Map<number, GuildAccount>): GuildRepo
export interface GuildService {
  me(userId: number): Promise<GuildMe>
  list(userId: number, query?: string): Promise<GuildView[]>
  create(userId: number, input: { name: string; color?: number; pattern?: number; joinMode?: 'open' | 'approval'; minLevel?: number }): Promise<{ ok: true; guildId: number; goldSpent: number }>
  apply(userId: number, guildId: number): Promise<{ ok: true; joined: boolean }>
  cancelApply(userId: number, guildId: number): Promise<{ ok: true }>
  decide(userId: number, requestId: number, accept: boolean): Promise<{ ok: true }>
  invite(userId: number, targetName: string): Promise<{ ok: true }>
  respondInvite(userId: number, requestId: number, accept: boolean): Promise<{ ok: true }>
  leave(userId: number): Promise<{ ok: true }>
  kick(userId: number, targetUserId: number): Promise<{ ok: true }>
  setRole(userId: number, targetUserId: number, role: GuildRole): Promise<{ ok: true }>
  disband(userId: number): Promise<{ ok: true }>
  updateSettings(userId: number, input: { notice?: string; joinMode?: 'open' | 'approval'; minLevel?: number; color?: number; pattern?: number }): Promise<{ ok: true }>
  donate(userId: number, kind: GuildContributionKind): Promise<{ ok: true; cost: NonNullable<GuildContributionRule['cost']>; points: number }>
  research(userId: number, techId: GuildTechId): Promise<{ ok: true }>
  buy(userId: number, itemId: string): Promise<{ ok: true; grant: GuildGrant; ledger: { fragments: number; stones: number }; points: number }>
  setTarget(userId: number, cityId: string, cityName?: string): Promise<{ ok: true }>
  claim(userId: number): Promise<{ ok: true; gold: number; manuals: number; honor: number; items: GuildPendingReward[] }>
  logs(userId: number): Promise<GuildLog[]>
  chat(userId: number, afterId?: number): Promise<GuildChatMessage[]>
  say(userId: number, text: string): Promise<{ ok: true; id: number }>
  ranking(userId: number, kind?: 'level' | 'contribution' | 'raid'): Promise<GuildRanking>
  record(userId: number, kind: GuildContributionKind, opts?: { cityId?: string; damage?: number }): Promise<{ ok: boolean; credited?: boolean; kind?: string }>
  cityCaptured(faction: string, cityId: string): Promise<void>
  tags(userIds: number[]): Promise<Map<number, GuildBonuses & { guildId: number; name: string; emblem: GuildEmblem }>>
  adminList(): Promise<GuildView[]>
  adminRename(guildId: number, name: string): Promise<{ ok: true }>
  adminDisband(guildId: number): Promise<{ ok: true }>
}
export declare function createGuildService(repo: GuildRepo, options?: { now?: () => number }): GuildService
