import { z } from 'zod'
import { adminProcedure, router, publicProcedure, protectedProcedure, getCityDamageRankings, getFactionTerritories, getGameState, getLuoyangReward, getLuoyangHistory, grantCurrency, deployFactionGarrison, recordFactionDefense, listDuelOpponents, getRaidInfo, startRaid, submitRaid, getRaidRanking, claimRaidReward, listGameStates, listUsers, recordFactionTerritoryBattle, updateGameState, updateUserName, updateUserRole, adminUpdateGameState, adminGameView, isOperatorUser, resetGuestGameState, guildService } from './webdev-adapter.mjs'

import { leaderboard } from './leaderboard.mjs'
import { createLeaderboardRouter } from './leaderboard/router.mjs'
import { createBoardPost, deleteBoardPost, deleteBoardPostAsAdmin, getBoardSettings, listAdminBoardPosts, listBoardPosts, setBoardPostingEnabled } from './board.mjs'

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
    listGameStates: adminProcedure.query(async () => (await listGameStates()).map(user => ({ ...accountView(user), operator: Boolean(user.operator), game: adminGameView(user) }))),
    // 관리자 편집: 보낸 칸만 바꾼다. 금화 · 신화 조각 · 낙양 강화석(서버 원장)도 그대로 정하고, 접속 중인 게임이 덮어쓰지 않게 한다.
    updateGameState: adminProcedure.input(z.object({
      userId: z.number().int().positive(),
      ...Object.fromEntries(['honor', 'silver', 'gold', 'manuals', 'wins', 'battleScore', 'grain', 'wood', 'iron', 'influence', 'mythicFragments', 'mythicStones', 'factionWarScore', 'luoyangBoxes'].map(key => [key, z.number().int().min(0).max(SAVE_INT_MAX).optional()])),
      faction: z.enum(['촉한', '위나라', '오나라', '재야']).optional(),
    }).strict()).mutation(async ({ input }) => {
      const { userId, ...values } = input
      return { userId, game: await adminUpdateGameState(userId, values) }
    }),
    boardSettings: adminProcedure.query(async () => ({ settings: await getBoardSettings(), posts: await listAdminBoardPosts() })),
    deleteBoardPost: adminProcedure.input(z.object({ id: z.number().int().positive() }).strict()).mutation(({ input }) => deleteBoardPostAsAdmin(input.id)),
    setBoardPosting: adminProcedure.input(z.object({ enabled: z.boolean() }).strict()).mutation(({ input }) => setBoardPostingEnabled(input.enabled)),
    guilds: adminProcedure.query(() => guildService.adminList()),
    renameGuild: adminProcedure.input(z.object({ guildId: z.number().int().positive(), name: z.string().trim().min(2).max(8) }).strict()).mutation(({ input }) => guildService.adminRename(input.guildId, input.name)),
    disbandGuild: adminProcedure.input(z.object({ guildId: z.number().int().positive() }).strict()).mutation(({ input }) => guildService.adminDisband(input.guildId)),
  }),
  leaderboard: createLeaderboardRouter({ router, publicProcedure, protectedProcedure, isOperator: isOperatorUser }, leaderboard),
  duel: router({
    // power(내 덱 전력)를 보내면 비슷한 실력의 유저를 고르고, 덱을 저장한 지휘관이 20명 미만이면 훈련 상대 모드를 알려 준다
    listOpponents: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(50).default(12), power: z.number().min(0).max(10_000_000).optional() }).strict()).query(({ ctx, input }) => listDuelOpponents(ctx.user.id, input.limit, input.power)),
  }),
  // 주간 레이드: 월요일 0시(KST) 초기화 · 하루 3회 · 1·2·3군 피해 합계로 순위
  raid: router({
    info: protectedProcedure.query(({ ctx }) => getRaidInfo(ctx.user.id)),
    ranking: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(100) }).strict()).query(({ ctx, input }) => getRaidRanking(ctx.user.id, input.limit)),
    start: protectedProcedure.mutation(({ ctx }) => {
      if (ctx.user.isCron) throw new Error('예약 실행 계정은 레이드에 도전할 수 없습니다.')
      return startRaid(ctx.user)
    }),
    submit: protectedProcedure.input(z.object({ token: z.string().min(8).max(64), damages: z.array(z.number().min(0).max(1_000_000_000)).min(1).max(3) }).strict()).mutation(({ ctx, input }) => submitRaid(ctx.user.id, input)),
    claim: protectedProcedure.mutation(({ ctx }) => claimRaidReward(ctx.user.id)),
  }),
  territory: router({
    list: protectedProcedure.query(({ ctx }) => getFactionTerritories(ctx.user.id)),
    luoyangHistory: protectedProcedure.query(() => getLuoyangHistory()),
    recordBattle: protectedProcedure.input(z.object({
      cityId: z.string().trim().min(1).max(64),
      damage: z.number().int().min(0).max(1000000),
      won: z.boolean(),
      captured: z.boolean(),
    }).strict()).mutation(async ({ ctx, input }) => {
      if (ctx.user.isCron) throw new Error('예약 실행 계정은 영토 전투를 기록할 수 없습니다.')
      return recordFactionTerritoryBattle(ctx.user.id, input, { operator: isOperatorUser(ctx.user) })
    }),
    deployGarrison: protectedProcedure.input(z.object({
      cityId: z.string().trim().min(1).max(64),
      garrisonId: z.string().trim().min(1).max(96),
      power: z.number().int().min(0).max(2_000_000),
      averageLevel: z.number().int().min(1).max(999),
      label: z.string().trim().min(1).max(40),
    }).strict()).mutation(async ({ ctx, input }) => {
      if (ctx.user.isCron) throw new Error('예약 실행 계정은 수비병을 세울 수 없습니다.')
      return deployFactionGarrison(ctx.user.id, input, { operator: isOperatorUser(ctx.user) })
    }),
    recordDefense: protectedProcedure.input(z.object({
      cityId: z.string().trim().min(1).max(64),
    }).strict()).mutation(async ({ ctx, input }) => {
      if (ctx.user.isCron) throw new Error('예약 실행 계정은 방어전을 지휘할 수 없습니다.')
      return recordFactionDefense(ctx.user.id, input, { operator: isOperatorUser(ctx.user) })
    }),
    damageRanking: protectedProcedure.input(z.object({ cityId: z.string().trim().min(1).max(64) }).strict()).query(({ input }) => getCityDamageRankings(input.cityId)),
  }),
  // 유저 연맹(server/guild.mjs): 같은 진영끼리 · 기여 · 기술 · 상점 · 공동 공성 · 채팅 · 주간 정산
  guild: router({
    me: protectedProcedure.query(({ ctx }) => guildService.me(ctx.user.id)),
    list: protectedProcedure.input(z.object({ query: z.string().trim().max(16).optional() }).strict()).query(({ ctx, input }) => guildService.list(ctx.user.id, input.query ?? '')),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(8), color: z.number().int().min(0).max(31).optional(), pattern: z.number().int().min(0).max(31).optional(), joinMode: z.enum(['open', 'approval']).optional(), minLevel: z.number().int().min(1).max(60).optional() }).strict()).mutation(({ ctx, input }) => guildService.create(ctx.user.id, input)),
    apply: protectedProcedure.input(z.object({ guildId: z.number().int().positive() }).strict()).mutation(({ ctx, input }) => guildService.apply(ctx.user.id, input.guildId)),
    cancelApply: protectedProcedure.input(z.object({ guildId: z.number().int().positive() }).strict()).mutation(({ ctx, input }) => guildService.cancelApply(ctx.user.id, input.guildId)),
    decide: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), accept: z.boolean() }).strict()).mutation(({ ctx, input }) => guildService.decide(ctx.user.id, input.requestId, input.accept)),
    invite: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(32) }).strict()).mutation(({ ctx, input }) => guildService.invite(ctx.user.id, input.name)),
    respondInvite: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), accept: z.boolean() }).strict()).mutation(({ ctx, input }) => guildService.respondInvite(ctx.user.id, input.requestId, input.accept)),
    leave: protectedProcedure.mutation(({ ctx }) => guildService.leave(ctx.user.id)),
    kick: protectedProcedure.input(z.object({ userId: z.number().int().positive() }).strict()).mutation(({ ctx, input }) => guildService.kick(ctx.user.id, input.userId)),
    setRole: protectedProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(['leader', 'deputy', 'elite', 'member']) }).strict()).mutation(({ ctx, input }) => guildService.setRole(ctx.user.id, input.userId, input.role)),
    disband: protectedProcedure.mutation(({ ctx }) => guildService.disband(ctx.user.id)),
    settings: protectedProcedure.input(z.object({ notice: z.string().max(200).optional(), joinMode: z.enum(['open', 'approval']).optional(), minLevel: z.number().int().min(1).max(60).optional(), color: z.number().int().min(0).max(31).optional(), pattern: z.number().int().min(0).max(31).optional() }).strict()).mutation(({ ctx, input }) => guildService.updateSettings(ctx.user.id, input)),
    donate: protectedProcedure.input(z.object({ kind: z.enum(['donateSilver', 'donateResources', 'donateGold']) }).strict()).mutation(({ ctx, input }) => guildService.donate(ctx.user.id, input.kind)),
    research: protectedProcedure.input(z.object({ techId: z.enum(['harvest', 'siege', 'garrison', 'raid', 'build', 'supply', 'duel']) }).strict()).mutation(({ ctx, input }) => guildService.research(ctx.user.id, input.techId)),
    buy: protectedProcedure.input(z.object({ itemId: z.string().max(16) }).strict()).mutation(({ ctx, input }) => guildService.buy(ctx.user.id, input.itemId)),
    setTarget: protectedProcedure.input(z.object({ cityId: z.string().trim().min(2).max(32), cityName: z.string().trim().max(16).optional() }).strict()).mutation(({ ctx, input }) => guildService.setTarget(ctx.user.id, input.cityId, input.cityName)),
    claim: protectedProcedure.mutation(({ ctx }) => guildService.claim(ctx.user.id)),
    logs: protectedProcedure.query(({ ctx }) => guildService.logs(ctx.user.id)),
    chat: protectedProcedure.input(z.object({ afterId: z.number().int().min(0).optional() }).strict()).query(({ ctx, input }) => guildService.chat(ctx.user.id, input.afterId ?? 0)),
    say: protectedProcedure.input(z.object({ text: z.string().trim().min(1).max(400) }).strict()).mutation(({ ctx, input }) => guildService.say(ctx.user.id, input.text)),
    ranking: protectedProcedure.input(z.object({ kind: z.enum(['level', 'contribution', 'raid']) }).strict()).query(({ ctx, input }) => guildService.ranking(ctx.user.id, input.kind)),
  }),
  board: router({
    list: protectedProcedure.input(z.object({ board: z.enum(['전체', '촉한', '위나라', '오나라', '재야', '연맹']) })).query(({ ctx, input }) => listBoardPosts(ctx.user, input.board)),
    create: protectedProcedure.input(z.object({ board: z.enum(['전체', '촉한', '위나라', '오나라', '재야', '연맹']), title: z.string().trim().min(1).max(120), content: z.string().trim().min(1).max(4000), password: z.string().min(4).max(64) }).strict()).mutation(({ ctx, input }) => createBoardPost(ctx.user, input)),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive(), password: z.string().min(4).max(64) }).strict()).mutation(({ ctx, input }) => deleteBoardPost(ctx.user, input.id, input.password)),
  }),
  account: router({
    me: protectedProcedure.query(({ ctx }) => ({ ...accountView(ctx.user), operator: isOperatorUser(ctx.user) })),
    gameState: protectedProcedure.query(({ ctx }) => getGameState(ctx.user.id)),
    luoyangReward: protectedProcedure.query(({ ctx }) => getLuoyangReward(ctx.user.id)),
    // 게스트 계정의 진행을 처음으로 되돌린다(아이디는 유지)
    resetGuest: protectedProcedure.mutation(({ ctx }) => resetGuestGameState(ctx.user)),
    grant: protectedProcedure.input(z.object({
      kind: z.enum(['daily', 'scenario', 'faction', 'duel', 'attendance']),
      key: z.string().max(96).optional(),
      bonus: z.number().min(0).max(1).optional(),
    })).mutation(({ ctx, input }) => {
      if (ctx.user.isCron) throw new Error('예약 실행 계정은 보상을 받을 수 없습니다.')
      return grantCurrency(ctx.user.id, input)
    }),
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
      faction: z.enum(['촉한', '위나라', '오나라', '재야']).optional(),
      factionChosen: z.boolean().optional(),
      factionWarScore: z.number().int().min(0).max(SAVE_INT_MAX).optional(),
      luoyangBoxes: z.number().int().min(0).max(SAVE_INT_MAX).optional(),
      lastLuoyangReward: z.number().int().min(0).max(100).nullable().optional(),
      luoyangRewardWeekKey: z.string().max(16).nullable().optional(),
      mythicFragments: z.number().int().min(0).max(SAVE_INT_MAX).optional(),
      mythicStones: z.number().int().min(0).max(SAVE_INT_MAX).optional(),
      duelAttemptsToday: z.number().int().min(0).max(5).optional(),
      duelDayKey: z.string().max(16).nullable().optional(),
      prelaunchGoldDayKey: z.string().max(16).nullable().optional(),
      incomeCollectedAt: z.string().max(32).nullable().optional(),
      conquestAt: z.string().max(32).nullable().optional(),
      scenarioData: z.string().max(100000).optional(),
      missionData: z.string().max(20000).optional(),
      squadData: z.string().max(4000).optional(),
      // 관리자 수정값을 받아들였다는 표시(account.gameState의 adminPatchId 또는 저장 응답의 adminPatch.id)
      adminPatchAck: z.string().max(64).optional(),
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
