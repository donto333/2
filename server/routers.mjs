import { z } from 'zod'
import { adminProcedure, router, publicProcedure, protectedProcedure, getFactionTerritories, getGameState, deployFactionGarrison, recordFactionDefense, listDuelOpponents, listGameStates, listUsers, recordFactionTerritoryBattle, updateGameState, updateUserName, updateUserRole } from './webdev-adapter.mjs'

import { leaderboard } from './leaderboard.mjs'
import { createLeaderboardRouter } from './leaderboard/router.mjs'
import { createBoardPost, deleteBoardPost, listBoardPosts } from './board.mjs'

// 계정 상태 숫자 한도: DB 컬럼(int / int unsigned)이 담을 수 있는 범위 안에서 넉넉하게 잡는다.
// 예전 한도(병법서·승리·낙양 상자·신화 조각 1,000,000)를 넘은 계정은 저장 자체가 거절되었다.
export const SAVE_INT_MAX = 2_000_000_000

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
    listGameStates: adminProcedure.query(async () => (await listGameStates()).map(user => ({ ...accountView(user), game: { userId: user.id, honor: user.honor, silver: user.silver, gold: user.gold, manuals: user.manuals, wins: user.wins, battleScore: user.battleScore, grain: user.grain, wood: user.wood, iron: user.iron, influence: user.influence, updatedAt: user.updatedAt } }))),
    updateGameState: adminProcedure.input(z.object({ userId: z.number().int().positive(), honor: z.number().int().min(0).max(SAVE_INT_MAX), silver: z.number().int().min(0).max(SAVE_INT_MAX), gold: z.number().int().min(0).max(SAVE_INT_MAX), manuals: z.number().int().min(0).max(SAVE_INT_MAX), wins: z.number().int().min(0).max(SAVE_INT_MAX), battleScore: z.number().int().min(0).max(SAVE_INT_MAX), grain: z.number().int().min(0).max(SAVE_INT_MAX), wood: z.number().int().min(0).max(SAVE_INT_MAX), iron: z.number().int().min(0).max(SAVE_INT_MAX), influence: z.number().int().min(0).max(SAVE_INT_MAX) })).mutation(async ({ input }) => ({ userId: input.userId, game: await updateGameState(input.userId, { honor: input.honor, silver: input.silver, gold: input.gold, manuals: input.manuals, wins: input.wins, battleScore: input.battleScore, grain: input.grain, wood: input.wood, iron: input.iron, influence: input.influence }) })),
  }),
  leaderboard: createLeaderboardRouter({ router, publicProcedure, protectedProcedure }, leaderboard),
  duel: router({
    listOpponents: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(50).default(12) }).strict()).query(({ ctx, input }) => listDuelOpponents(ctx.user.id, input.limit)),
  }),
  territory: router({
    list: protectedProcedure.query(({ ctx }) => getFactionTerritories(ctx.user.id)),
    recordBattle: protectedProcedure.input(z.object({
      cityId: z.string().trim().min(1).max(64),
      damage: z.number().int().min(0).max(1000000),
      won: z.boolean(),
      captured: z.boolean(),
    }).strict()).mutation(async ({ ctx, input }) => {
      if (ctx.user.isCron) throw new Error('예약 실행 계정은 영토 전투를 기록할 수 없습니다.')
      return recordFactionTerritoryBattle(ctx.user.id, input)
    }),
    deployGarrison: protectedProcedure.input(z.object({
      cityId: z.string().trim().min(1).max(64),
      garrisonId: z.string().trim().min(1).max(96),
      power: z.number().int().min(0).max(2_000_000),
      averageLevel: z.number().int().min(1).max(999),
      label: z.string().trim().min(1).max(40),
    }).strict()).mutation(async ({ ctx, input }) => {
      if (ctx.user.isCron) throw new Error('예약 실행 계정은 수비병을 세울 수 없습니다.')
      return deployFactionGarrison(ctx.user.id, input)
    }),
    recordDefense: protectedProcedure.input(z.object({
      cityId: z.string().trim().min(1).max(64),
    }).strict()).mutation(async ({ ctx, input }) => {
      if (ctx.user.isCron) throw new Error('예약 실행 계정은 방어전을 지휘할 수 없습니다.')
      return recordFactionDefense(ctx.user.id, input)
    }),
  }),
  board: router({
    list: protectedProcedure.input(z.object({ board: z.enum(['전체', '촉한', '위나라', '오나라']) })).query(({ ctx, input }) => listBoardPosts(ctx.user.id, input.board)),
    create: protectedProcedure.input(z.object({ board: z.enum(['전체', '촉한', '위나라', '오나라']), title: z.string().trim().min(1).max(120), content: z.string().trim().min(1).max(4000), password: z.string().min(4).max(64) }).strict()).mutation(({ ctx, input }) => createBoardPost(ctx.user, input)),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive(), password: z.string().min(4).max(64) }).strict()).mutation(({ ctx, input }) => deleteBoardPost(ctx.user, input.id, input.password)),
  }),
  account: router({
    me: protectedProcedure.query(({ ctx }) => accountView(ctx.user)),
    gameState: protectedProcedure.query(({ ctx }) => getGameState(ctx.user.id)),
    saveGameState: protectedProcedure.input(z.object({
      honor: z.number().int().min(0).max(SAVE_INT_MAX),
      silver: z.number().int().min(0).max(SAVE_INT_MAX),
      gold: z.number().int().min(0).max(SAVE_INT_MAX).optional(),
      manuals: z.number().int().min(0).max(SAVE_INT_MAX),
      wins: z.number().int().min(0).max(SAVE_INT_MAX),
      battleScore: z.number().int().min(0).max(SAVE_INT_MAX),
      grain: z.number().int().min(0).max(SAVE_INT_MAX),
      wood: z.number().int().min(0).max(SAVE_INT_MAX),
      iron: z.number().int().min(0).max(SAVE_INT_MAX),
      influence: z.number().int().min(0).max(SAVE_INT_MAX),
      generalData: z.string().max(500000).optional(),
      formationData: z.string().max(2000).optional(),
      // 도시별 최근 전투 기록(도시당 최대 30건)을 포함해도 저장되도록 TEXT 컬럼 범위에 맞춘다.
      citiesData: z.string().max(4_000_000).optional(),
      researchData: z.string().max(100000).optional(),
      equipmentData: z.string().max(4_000_000).optional(),
      equipmentLoadoutsData: z.string().max(500_000).optional(),
      selectedEquipmentGeneralId: z.string().max(64).optional(),
      selectedCityId: z.string().max(64).nullable().optional(),
      faction: z.enum(['촉한', '위나라', '오나라']).optional(),
      factionChosen: z.boolean().optional(),
      factionWarScore: z.number().int().min(0).max(SAVE_INT_MAX).optional(),
      luoyangBoxes: z.number().int().min(0).max(SAVE_INT_MAX).optional(),
      lastLuoyangReward: z.number().int().min(0).max(100).nullable().optional(),
      luoyangRewardWeekKey: z.string().max(16).nullable().optional(),
      mythicFragments: z.number().int().min(0).max(SAVE_INT_MAX).optional(),
      duelAttemptsToday: z.number().int().min(0).max(5).optional(),
      duelDayKey: z.string().max(16).nullable().optional(),
      prelaunchGoldDayKey: z.string().max(16).nullable().optional(),
      incomeCollectedAt: z.string().max(32).nullable().optional(),
      conquestAt: z.string().max(32).nullable().optional(),
      scenarioData: z.string().max(100000).optional(),
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
