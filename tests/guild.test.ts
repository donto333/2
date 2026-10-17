import { describe, expect, it } from 'vitest'
import { buildingDurationMs, cityIncome, conquestCost, createInitialState } from '../src/game/strategy'
import { guildMods, guildWallMultiplier } from '../src/game/guild'
import { GUILD_CREATE_GOLD, GUILD_SHOP, GUILD_TECHS, addGuildExp, createGuildService, createMemoryGuildRepo, guildBonuses, guildCapacity, guildExpToNext, guildTechCap, guildWeeklyReward, validGuildName } from '../server/guild.mjs'

const HOUR = 3600_000
const DAY = 24 * HOUR

function world(start = Date.parse('2026-10-14T03:00:00Z')) {
  const accounts = new Map<number, Record<string, unknown>>()
  const add = (userId: number, name: string, faction = '촉한', maxLevel = 30, gold = 500) => accounts.set(userId, { userId, name, faction, maxLevel, power: 1000 + userId, gold })
  add(1, '유비'); add(2, '관우'); add(3, '장비'); add(4, '조조', '위나라'); add(5, '신병', '촉한', 5)
  let clock = start
  const repo = createMemoryGuildRepo(accounts as never)
  const svc = createGuildService(repo, { now: () => clock })
  return { svc, repo, accounts, tick: (ms: number) => { clock += ms }, at: () => clock }
}

describe('연맹 규칙', () => {
  it('레벨 · 인원 · 기술 상한', () => {
    expect(guildCapacity(1)).toBe(20)
    expect(guildCapacity(10)).toBe(38)
    expect(guildExpToNext(1)).toBe(1000)
    expect(guildExpToNext(2)).toBe(1500)
    expect(guildExpToNext(10)).toBe(0)
    expect([1, 2, 3, 4, 5, 9, 10].map(guildTechCap)).toEqual([1, 1, 2, 2, 3, 5, 5])
    const guild = { level: 1, exp: 0 }
    addGuildExp(guild, 2600)
    expect(guild).toEqual({ level: 3, exp: 100 })
  })
  it('기술 보너스는 단계 × 효과, 7가지(대련 포함)', () => {
    expect(Object.keys(GUILD_TECHS)).toHaveLength(7)
    const bonus = guildBonuses({ harvest: 5, duel: 2, build: 1 })
    expect(bonus.harvest).toBeCloseTo(0.1)
    expect(bonus.duel).toBeCloseTo(0.04)
    expect(bonus.buildCut).toBeCloseTo(0.03)
    expect(guildBonuses({ harvest: 99 }).harvest).toBeCloseTo(0.1)
  })
  it('이름 검사 · 주간 보상 구간', () => {
    expect(validGuildName('도원결의')).toBeNull()
    expect(validGuildName('a')).not.toBeNull()
    expect(validGuildName('운영자연맹')).not.toBeNull()
    expect(guildWeeklyReward(1, 50)?.gold).toBe(30)
    expect(guildWeeklyReward(5, 50)?.gold).toBe(10)
    expect(guildWeeklyReward(6, 50)).toBeNull()
  })
})

describe('연맹 서버 처리', () => {
  it('만들기: 금화 50 · Lv.15 · 이름 중복 금지', async () => {
    const { svc, accounts } = world()
    await expect(svc.create(5, { name: '신병단' })).rejects.toThrow('Lv.15')
    await svc.create(1, { name: '도원', color: 2, pattern: 1 })
    expect(accounts.get(1)!.gold).toBe(500 - GUILD_CREATE_GOLD)
    await expect(svc.create(2, { name: '도원' })).rejects.toThrow('같은 이름')
    const me = await svc.me(1)
    expect(me.guild?.name).toBe('도원')
    expect(me.member?.role).toBe('leader')
    expect(me.guild?.capacity).toBe(20)
  })
  it('가입: 같은 진영만, 승인 가입은 신청 → 승인, 탈퇴 후 24시간 재가입 금지', async () => {
    const { svc, tick } = world()
    await svc.create(1, { name: '도원', joinMode: 'approval' })
    const id = (await svc.me(1)).guild!.id
    await expect(svc.apply(4, id)).rejects.toThrow('같은 진영')
    expect((await svc.apply(2, id)).joined).toBe(false)
    const request = (await svc.me(1)).requests![0]
    await svc.decide(1, request.id, true)
    expect((await svc.me(2)).guild?.id).toBe(id)
    await svc.leave(2)
    await expect(svc.apply(2, id)).rejects.toThrow('24시간')
    tick(25 * HOUR)
    expect((await svc.apply(2, id)).joined).toBe(false)
  })
  it('직위: 부연맹장 2명 · 부연맹장은 연맹원만 추방 · 위임', async () => {
    const { svc } = world()
    await svc.create(1, { name: '도원' })
    const id = (await svc.me(1)).guild!.id
    await svc.apply(2, id); await svc.apply(3, id)
    await svc.setRole(1, 2, 'deputy')
    await svc.setRole(1, 3, 'deputy')
    await expect(svc.kick(2, 3)).rejects.toThrow('연맹원만')
    await svc.setRole(1, 3, 'member')
    await svc.kick(2, 3)
    expect((await svc.me(3)).guild).toBeNull()
    await expect(svc.leave(1)).rejects.toThrow('넘긴 뒤')
    await svc.setRole(1, 2, 'leader')
    const me = await svc.me(2)
    expect(me.member?.role).toBe('leader')
    expect(me.guild?.leaderUserId).toBe(2)
  })
  it('헌납 · 기여 한도 · 연맹 자금으로 기술 연구', async () => {
    const { svc, accounts, tick } = world()
    await svc.create(1, { name: '도원' })
    const silver = await svc.donate(1, 'donateSilver')
    expect(silver.cost).toEqual({ silver: 50000 })
    await expect(svc.donate(1, 'donateSilver')).rejects.toThrow('이미')
    await svc.donate(1, 'donateGold')
    expect(accounts.get(1)!.gold).toBe(500 - GUILD_CREATE_GOLD - 10)
    await svc.donate(1, 'donateResources')
    let me = await svc.me(1)
    expect(me.guild?.funds).toBe(250)
    expect(me.points).toBe(250)
    for (let day = 0; day < 6; day += 1) { tick(DAY); await svc.donate(1, 'donateSilver'); await svc.donate(1, 'donateGold'); await svc.donate(1, 'donateResources') }
    me = await svc.me(1)
    expect(me.guild?.funds).toBe(1750)
    await svc.research(1, 'harvest')
    me = await svc.me(1)
    expect(me.guild?.tech.harvest).toBe(1)
    expect(me.guild?.funds).toBe(250)
    await expect(svc.research(1, 'harvest')).rejects.toThrow('연맹 레벨')
  })
  it('공성 · 목표 도시 기여(하루 10회 공유) · 목표 점령 보상', async () => {
    const { svc } = world()
    await svc.create(1, { name: '도원' })
    await svc.setTarget(1, 'hanzhong', '한중')
    expect((await svc.record(1, 'siege', { cityId: 'hanzhong' })).kind).toBe('targetSiege')
    for (let i = 0; i < 12; i += 1) await svc.record(1, 'siege', { cityId: 'xiangyang' })
    const me = await svc.me(1)
    expect(me.points).toBe(40 + 9 * 20)
    await svc.cityCaptured('촉한', 'hanzhong')
    const after = await svc.me(1)
    expect(after.pending.some((item: { honor?: number }) => item.honor === 300)).toBe(true)
    const claim = await svc.claim(1)
    expect(claim.manuals).toBe(200)
    await expect(svc.claim(1)).rejects.toThrow('받을')
  })
  it('상점: 기여 포인트 · 연맹 레벨 조건 · 주간 한도 · 신화 조각은 서버 장부', async () => {
    const { svc, accounts, tick } = world()
    await svc.create(1, { name: '도원' })
    await expect(svc.buy(1, 'manuals')).rejects.toThrow('부족')
    for (let day = 0; day < 8; day += 1) { await svc.donate(1, 'donateGold'); await svc.donate(1, 'donateSilver'); tick(DAY) }
    const bought = await svc.buy(1, 'manuals')
    expect(bought.grant).toEqual({ manuals: 200 })
    await expect(svc.buy(1, 'fragment')).rejects.toThrow('Lv.5')
    expect(GUILD_SHOP.find(item => item.id === 'fragment')?.limit).toBe(5)
    for (let i = 0; i < 4; i += 1) await svc.buy(1, 'manuals')
    await expect(svc.buy(1, 'manuals')).rejects.toThrow('한도')
    expect(accounts.get(1)!.fragments ?? 0).toBe(0)
  })
  it('연맹장이 7일 넘게 접속하지 않으면 부연맹장에게 넘어간다', async () => {
    const { svc, tick } = world()
    await svc.create(1, { name: '도원' })
    const id = (await svc.me(1)).guild!.id
    await svc.apply(2, id); await svc.apply(3, id)
    await svc.setRole(1, 3, 'deputy')
    tick(8 * DAY)
    // 접속한 사람 가운데 직위가 높은 사람(부연맹장)에게 넘어간다
    await svc.me(2)
    const me = await svc.me(3)
    expect(me.member?.role).toBe('deputy')
    expect((await svc.me(2)).member?.role).toBe('leader')
    tick(8 * DAY)
    await svc.me(3)
    expect((await svc.me(3)).member?.role).toBe('leader')
  })
  it('진영을 바꾸면 자동 탈퇴, 혼자 남은 연맹장이 나가면 해산', async () => {
    const { svc, accounts } = world()
    await svc.create(1, { name: '도원' })
    const id = (await svc.me(1)).guild!.id
    await svc.apply(2, id)
    accounts.get(2)!.faction = '위나라'
    expect((await svc.me(2)).guild).toBeNull()
    await svc.disband(1)
    expect((await svc.list(3)).length).toBe(0)
  })
  it('주간 정산: 기여 1위 연맹원(3일 이상)에게 금화 · 병서', async () => {
    const { svc, accounts, tick } = world(Date.parse('2026-10-11T16:00:00Z'))
    await svc.create(1, { name: '도원' })
    await svc.donate(1, 'donateGold')
    tick(7 * DAY)
    const me = await svc.me(1)
    expect(me.pending.length).toBe(1)
    const before = accounts.get(1)!.gold as number
    const claim = await svc.claim(1)
    expect(claim.gold).toBe(30)
    expect(accounts.get(1)!.gold).toBe(before + 30)
    const ranking = await svc.ranking(1, 'contribution')
    expect(ranking.lastWeek?.contribution[0].name).toBe('도원')
  })
  it('채팅: 2초 간격 · 200자 · 초대 수락', async () => {
    const { svc, tick } = world()
    await svc.create(1, { name: '도원' })
    await svc.say(1, '안녕하십니까')
    await expect(svc.say(1, '또')).rejects.toThrow('조금 뒤')
    tick(3000)
    await svc.say(1, 'x'.repeat(300))
    const messages = await svc.chat(1, 0)
    expect(messages).toHaveLength(2)
    expect(messages[1].text.length).toBe(200)
    await svc.invite(1, '관우')
    const invite = (await svc.me(2)).invites[0]
    await svc.respondInvite(2, invite.id, true)
    expect((await svc.me(2)).guild?.name).toBe('도원')
  })
})

describe('연맹 기술이 게임에 적용된다', () => {
  const withGuild = (tech: Record<string, number>, target: string | null = null) => {
    const state = createInitialState()
    state.guild = { id: 1, name: '도원', level: 10, role: 'leader', emblem: { color: 0, pattern: 0 }, tech, target: target ? { cityId: target, cityName: target } : null }
    return state
  }
  it('둔전 · 축성 · 군량 보급', () => {
    const plain = createInitialState()
    const rich = withGuild({ harvest: 5, build: 5, supply: 5 })
    const home = plain.cities.find(city => city.owner === plain.faction)!
    expect(cityIncome(home, rich).grain).toBe(Math.round(cityIncome(home, plain).grain * 1.1))
    const building = { level: 2 }
    expect(buildingDurationMs(building, rich)).toBe(Math.round(buildingDurationMs(building) * 0.85))
    const city = plain.cities.find(item => item.owner === '중립')!
    expect(conquestCost(city, rich).grain).toBeLessThan(conquestCost(city, plain).grain!)
  })
  it('공성 기계 + 목표 도시 성벽 차감, 대련 기술', () => {
    const state = withGuild({ siege: 5, duel: 3 }, 'hanzhong')
    expect(guildWallMultiplier(state, 'hanzhong')).toBeCloseTo(1.2)
    expect(guildWallMultiplier(state, 'xiangyang')).toBeCloseTo(1.1)
    expect(guildMods(state).duel).toBeCloseTo(0.06)
    expect(guildMods(createInitialState()).duel).toBe(0)
  })
})
