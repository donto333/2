// 유저 연맹: 게임 쪽 상태와 보너스(규칙은 server/guild.mjs와 같이 쓴다)
import { GUILD_BONUS_CAP, GUILD_TARGET_WALL, guildBonuses, type GuildBonuses, type GuildEmblem, type GuildRole, type GuildTechId } from '../../server/guild.mjs'

/** 게임 저장에 남겨 두는 내 연맹 요약(서버가 원본, 접속 때마다 새로 받는다) */
export interface GuildSnapshot {
  id: number
  name: string
  level: number
  role: GuildRole
  emblem: GuildEmblem
  tech: Partial<Record<GuildTechId, number>>
  target: { cityId: string; cityName: string } | null
}

const NONE: GuildBonuses = { harvest: 0, wall: 0, garrison: 0, raid: 0, buildCut: 0, siegeCostCut: 0, duel: 0 }

/** 내 연맹 기술 보너스(연맹이 없으면 모두 0) */
export function guildMods(state: { guild?: GuildSnapshot | null }): GuildBonuses {
  return state.guild ? guildBonuses(state.guild.tech) : NONE
}

/** 공성 승리 시 성벽 방어도 차감 배율: 공성 기계 + 이번 주 목표 도시면 +10% (합계 상한 40%) */
export function guildWallMultiplier(state: { guild?: GuildSnapshot | null }, cityId: string): number {
  const mods = guildMods(state)
  const target = state.guild?.target?.cityId === cityId ? GUILD_TARGET_WALL : 0
  return 1 + Math.min(GUILD_BONUS_CAP, mods.wall + target)
}

/** 전투 관련 보너스는 합계 40%까지 */
export function capBonus(value: number): number {
  return Math.max(0, Math.min(GUILD_BONUS_CAP, value))
}
