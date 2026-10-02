import { z } from 'zod'
import { adminProcedure, router, publicProcedure, protectedProcedure, getGameState, listGameStates, listUsers, updateGameState, updateUserName, updateUserRole } from './webdev-adapter.mjs'

import { leaderboard } from './leaderboard.mjs'
import { createLeaderboardRouter } from './leaderboard/router.mjs'

function accountView(user) {
  return {
    id: user.id,
    openId: user.openId,
    name: user.name ?? '',
    email: user.email ?? '',
    loginMethod: user.loginMethod ?? 'Manus OAuth',
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSignedIn: user.lastSignedIn,
  }
}

export const gameRouter = router({
  admin: router({
    listUsers: adminProcedure.input(z.object({ search: z.string().trim().max(64).optional() }).optional()).query(async ({ input }) => {
      const users = await listUsers()
      const search = input?.search?.toLocaleLowerCase('ko-KR') ?? ''
      return users.filter(user => !search || `${user.name ?? ''} ${user.email ?? ''} ${user.openId}`.toLocaleLowerCase('ko-KR').includes(search)).map(accountView)
    }),
    updateRole: adminProcedure.input(z.object({ id: z.number().int().positive(), role: z.enum(['user', 'admin']) })).mutation(async ({ ctx, input }) => {
      const updated = await updateUserRole(input.id, input.role, ctx.user.openId)
      if (!updated) throw new Error('해당 계정을 찾을 수 없습니다.')
      return accountView(updated)
    }),
    listGameStates: adminProcedure.query(async () => (await listGameStates()).map(user => ({ ...accountView(user), game: { userId: user.id, honor: user.honor, silver: user.silver, manuals: user.manuals, wins: user.wins, battleScore: user.battleScore, grain: user.grain, wood: user.wood, iron: user.iron, influence: user.influence, updatedAt: user.updatedAt } }))),
    updateGameState: adminProcedure.input(z.object({ userId: z.number().int().positive(), honor: z.number().int().min(0).max(100000000), silver: z.number().int().min(0).max(100000000), manuals: z.number().int().min(0).max(1000000), wins: z.number().int().min(0).max(1000000), battleScore: z.number().int().min(0).max(1000000000), grain: z.number().int().min(0).max(1000000000), wood: z.number().int().min(0).max(1000000000), iron: z.number().int().min(0).max(1000000000), influence: z.number().int().min(0).max(100000000) })).mutation(async ({ input }) => ({ userId: input.userId, game: await updateGameState(input.userId, { honor: input.honor, silver: input.silver, manuals: input.manuals, wins: input.wins, battleScore: input.battleScore, grain: input.grain, wood: input.wood, iron: input.iron, influence: input.influence }) })),
  }),
  leaderboard: createLeaderboardRouter({ router, publicProcedure, protectedProcedure }, leaderboard),
  account: router({
    me: protectedProcedure.query(({ ctx }) => accountView(ctx.user)),
    gameState: protectedProcedure.query(({ ctx }) => getGameState(ctx.user.id)),
    saveGameState: protectedProcedure.input(z.object({
      honor: z.number().int().min(0).max(100000000),
      silver: z.number().int().min(0).max(100000000),
      manuals: z.number().int().min(0).max(1000000),
      wins: z.number().int().min(0).max(1000000),
      battleScore: z.number().int().min(0).max(1000000000),
      grain: z.number().int().min(0).max(1000000000),
      wood: z.number().int().min(0).max(1000000000),
      iron: z.number().int().min(0).max(1000000000),
      influence: z.number().int().min(0).max(100000000),
      generalData: z.string().max(60000).optional(),
      formationData: z.string().max(2000).optional(),
      citiesData: z.string().max(30000).optional(),
      researchData: z.string().max(12000).optional(),
      selectedCityId: z.string().max(64).nullable().optional(),
      factionWarScore: z.number().int().min(0).max(100000000).optional(),
      incomeCollectedAt: z.string().max(32).nullable().optional(),
      conquestAt: z.string().max(32).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      if (ctx.user.isCron) throw new Error('예약 실행 계정은 게임 상태를 저장할 수 없습니다.')
      return updateGameState(ctx.user.id, input)
    }),
    updateName: protectedProcedure.input(z.object({
      name: z.string().trim().min(1, '표시 이름을 입력해 주세요.').max(32, '표시 이름은 32자 이내로 입력해 주세요.'),
    })).mutation(async ({ ctx, input }) => {
      if (ctx.user.isCron) throw new Error('예약 실행 계정은 수정할 수 없습니다.')
      const updated = await updateUserName(ctx.user.openId, input.name.trim())
      if (!updated) throw new Error('계정 정보를 불러오지 못했습니다.')
      return accountView(updated)
    }),
  }),
  // Gameplay writes and Stripe Checkout mutations must remain protected and derive ownership from ctx.user.
  player: protectedProcedure.query(({ ctx }) => ({ id: ctx.user.id, name: ctx.user.name })),
})
