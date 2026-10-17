// 유저 연맹(길드) — 규칙과 서버 처리. 게임(화면 · 전투 보너스)과 서버가 같은 규칙을 쓴다.
// 저장소(repo)는 바꿔 끼울 수 있다: 서버는 MySQL(webdev-adapter.mjs), 시험 · 로컬 미리보기는 메모리 저장소.
// 은전 · 자원 · 병서 · 옥패 · 뽑기권은 게임 저장이 주인이라, 헌납 비용과 상점 물품은 서버가 확인한 수량을 돌려주고 게임이 반영한다.
// 금화 · 신화장비 조각 · 낙양 강화석은 서버 장부가 주인이라 서버가 직접 빼고 더한다.
import { raidWeekKey } from './raid.mjs'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const KST = 9 * HOUR

// ── 기본 규칙 ──────────────────────────────────────────────
export const GUILD_CREATE_GOLD = 50
export const GUILD_CREATE_MIN_LEVEL = 15
export const GUILD_MAX_LEVEL = 10
export const GUILD_REJOIN_MS = 24 * HOUR
export const GUILD_APPLY_EXPIRE_MS = 48 * HOUR
export const GUILD_LEADER_AFK_MS = 7 * DAY
export const GUILD_REWARD_MIN_MEMBER_MS = 3 * DAY
export const GUILD_ROLE_LIMIT = { leader: 1, deputy: 2, elite: 5 }
export const GUILD_ROLES = ['leader', 'deputy', 'elite', 'member']
export const GUILD_ROLE_LABEL = { leader: '연맹장', deputy: '부연맹장', elite: '정예', member: '연맹원' }
export const GUILD_NAME_RE = /^[가-힣A-Za-z0-9]{2,8}$/
const BANNED = ['운영자', '관리자', 'admin', 'gm', '시발', '씨발', '병신', '좆', '섹스', 'sex', 'fuck', 'shit']
export const GUILD_COLORS = ['#b8322a', '#2f7a55', '#2d5a9e', '#c99a2e', '#6b3fa0', '#1f1f24', '#e8e2d0', '#c4622d']
export const GUILD_PATTERNS = ['용', '호', '봉', '구', '검', '창', '궁', '성', '월', '운', '화', '산']
export const GUILD_CHAT_MAX = 200
export const GUILD_CHAT_KEEP = 200
export const GUILD_CHAT_INTERVAL_MS = 2000
export const GUILD_NOTICE_MAX = 200

/** 연맹 레벨별 인원: Lv.1 20명, 레벨당 +2명(Lv.10 38명) */
export function guildCapacity(level) { return 20 + (Math.max(1, Math.min(GUILD_MAX_LEVEL, level)) - 1) * 2 }
/** 다음 레벨까지 필요한 경험치: 1,000부터 단계마다 1.5배 */
export function guildExpToNext(level) { return level >= GUILD_MAX_LEVEL ? 0 : Math.round(1000 * Math.pow(1.5, level - 1)) }
/** 경험치를 더하고 레벨을 올린다 */
export function addGuildExp(guild, exp) {
  guild.exp = (guild.exp ?? 0) + Math.max(0, Math.round(exp))
  while (guild.level < GUILD_MAX_LEVEL && guild.exp >= guildExpToNext(guild.level)) { guild.exp -= guildExpToNext(guild.level); guild.level += 1 }
  if (guild.level >= GUILD_MAX_LEVEL) guild.exp = 0
  return guild
}

// ── 기여 ──────────────────────────────────────────────────
/** 기여 활동: 개인 기여(points) · 연맹 경험치(exp) · 연맹 자금(funds) · 하루(주) 한도 */
export const GUILD_CONTRIBUTIONS = {
  donateSilver: { label: '은전 헌납', cost: { silver: 50000 }, points: 50, exp: 50, funds: 50, limit: 1, period: 'day' },
  donateResources: { label: '자원 헌납', cost: { grain: 20000, wood: 20000, iron: 20000 }, points: 50, exp: 50, funds: 50, limit: 1, period: 'day' },
  donateGold: { label: '금화 헌납', cost: { gold: 10 }, points: 150, exp: 150, funds: 150, limit: 1, period: 'day' },
  siege: { label: '공성 승리', points: 20, exp: 20, funds: 0, limit: 10, period: 'day' },
  targetSiege: { label: '목표 도시 공성 승리', points: 40, exp: 40, funds: 0, limit: 10, period: 'day', shares: 'siege' },
  defense: { label: '수비전 성공', points: 15, exp: 15, funds: 0, limit: 10, period: 'day' },
  raid: { label: '주간 레이드 참여', points: 100, exp: 100, funds: 0, limit: 1, period: 'week' },
  attendance: { label: '출석', points: 10, exp: 10, funds: 0, limit: 1, period: 'day' },
}
export const GUILD_DONATIONS = ['donateSilver', 'donateResources', 'donateGold']

// ── 연맹 기술 ──────────────────────────────────────────────
/** 단계당 효과 · 최대 5단계. 단계 상한은 연맹 레벨에 묶인다(Lv.1·2 → 1단계, Lv.3·4 → 2, … Lv.9·10 → 5) */
export const GUILD_TECHS = {
  harvest: { name: '둔전', desc: '도시 수확량', per: 0.02, unit: '+', max: 5 },
  siege: { name: '공성 기계', desc: '공성 승리 시 성벽 방어도 차감', per: 0.02, unit: '+', max: 5 },
  garrison: { name: '성곽 수비', desc: '수비병 전력', per: 0.02, unit: '+', max: 5 },
  raid: { name: '토벌', desc: '주간 레이드 피해', per: 0.02, unit: '+', max: 5 },
  build: { name: '축성', desc: '내정 건물 공사 시간', per: 0.03, unit: '−', max: 5 },
  supply: { name: '군량 보급', desc: '공성 출정 비용', per: 0.02, unit: '−', max: 5 },
  duel: { name: '무예 수련', desc: '유저 대련에서 주는 피해', per: 0.02, unit: '+', max: 5 },
}
export const GUILD_TECH_IDS = Object.keys(GUILD_TECHS)
export function guildTechCap(guildLevel) { return Math.min(5, Math.ceil(Math.max(1, guildLevel) / 2)) }
/** 다음 단계 연구 비용(연맹 자금): 1,500 × 다음 단계 */
export function guildTechCost(nextLevel) { return 1500 * nextLevel }
/** 전투 관련 보너스 합계 상한 */
export const GUILD_BONUS_CAP = 0.4
/** 목표 도시 공성: 성벽 방어도 차감 +10% */
export const GUILD_TARGET_WALL = 0.1

/** 연맹 기술 단계 → 실제 보너스(게임이 쓴다) */
export function guildBonuses(tech = {}) {
  const at = id => Math.max(0, Math.min(GUILD_TECHS[id].max, Number(tech?.[id]) || 0)) * GUILD_TECHS[id].per
  return { harvest: at('harvest'), wall: at('siege'), garrison: at('garrison'), raid: at('raid'), buildCut: at('build'), siegeCostCut: at('supply'), duel: at('duel') }
}

// ── 연맹 상점(개인 기여 포인트) ─────────────────────────────────
export const GUILD_SHOP = [
  { id: 'manuals', name: '병서 200', price: 100, minLevel: 1, limit: 5, period: 'week', grant: { manuals: 200 } },
  { id: 'silver', name: '은전 5만', price: 80, minLevel: 1, limit: 5, period: 'week', grant: { silver: 50000 } },
  { id: 'resources', name: '자원 묶음(식량 · 목재 · 철 각 3만)', price: 100, minLevel: 1, limit: 5, period: 'week', grant: { grain: 30000, wood: 30000, iron: 30000 } },
  { id: 'recruit', name: '무료 무장 뽑기권', price: 150, minLevel: 3, limit: 5, period: 'week', grant: { freeRecruits: 1 } },
  { id: 'draw', name: '무료 장비 뽑기권', price: 150, minLevel: 3, limit: 5, period: 'week', grant: { freeDraws: 1 } },
  { id: 'fragment', name: '신화장비 조각', price: 200, minLevel: 5, limit: 5, period: 'week', grant: { fragments: 1 } },
  { id: 'stone', name: '낙양 강화석', price: 1500, minLevel: 8, limit: 1, period: 'month', grant: { stones: 1 } },
]

// ── 주간 정산 · 공동 공성 ─────────────────────────────────────
/** 주간 순위 보상(기여 순위 · 레이드 합산 순위 각각): 1 · 2 · 3위, 상위 10% */
export const GUILD_WEEKLY_REWARDS = [
  { rank: 1, gold: 30, manuals: 300 },
  { rank: 2, gold: 20, manuals: 200 },
  { rank: 3, gold: 15, manuals: 150 },
  { top: 0.1, gold: 10, manuals: 100 },
]
/** 목표 도시를 우리 진영이 점령하면 연맹원 전원 보상 + 연맹 경험치 */
export const GUILD_TARGET_REWARD = { honor: 300, manuals: 200, exp: 500 }

export function guildWeeklyReward(rank, total) {
  if (rank <= 0 || total <= 0) return null
  const exact = GUILD_WEEKLY_REWARDS.find(item => item.rank === rank)
  if (exact) return { gold: exact.gold, manuals: exact.manuals }
  const top = GUILD_WEEKLY_REWARDS.find(item => item.top)
  return rank <= Math.max(1, Math.ceil(total * top.top)) ? { gold: top.gold, manuals: top.manuals } : null
}

export function guildDayKey(now = Date.now()) { return new Date(now + KST).toISOString().slice(0, 10) }
export function guildMonthKey(now = Date.now()) { return new Date(now + KST).toISOString().slice(0, 7) }
export function guildWeekKey(now = Date.now()) { return raidWeekKey(now) }
function periodKey(period, now) { return period === 'week' ? guildWeekKey(now) : period === 'month' ? guildMonthKey(now) : guildDayKey(now) }

export function validGuildName(name) {
  const text = String(name ?? '').trim()
  if (!GUILD_NAME_RE.test(text)) return '연맹 이름은 한글 · 영문 · 숫자 2~8자입니다.'
  const lower = text.toLowerCase()
  if (BANNED.some(word => lower.includes(word))) return '쓸 수 없는 단어가 들어 있습니다.'
  return null
}

class GuildError extends Error {}
const fail = message => { throw new GuildError(message) }
export { GuildError }

// ── 메모리 저장소(시험 · 로컬 미리보기) ─────────────────────────
export function createMemoryGuildRepo(accounts = new Map()) {
  const guilds = new Map(), members = new Map(), requests = new Map(), logs = [], chat = [], weeks = new Map()
  let guildSeq = 0, reqSeq = 0, logSeq = 0, chatSeq = 0
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
  return {
    accounts,
    async account(userId) { return clone(accounts.get(userId) ?? null) },
    async accountByName(name) { for (const account of accounts.values()) if (String(account.name).toLowerCase() === String(name).toLowerCase()) return clone(account); return null },
    async spendGold(userId, amount) { const account = accounts.get(userId); if (!account || (account.gold ?? 0) < amount) return false; account.gold -= amount; return true },
    async grantLedger(userId, { gold = 0, fragments = 0, stones = 0 }) { const account = accounts.get(userId); if (!account) return; account.gold = (account.gold ?? 0) + gold; account.fragments = (account.fragments ?? 0) + fragments; account.stones = (account.stones ?? 0) + stones },
    async getGuild(id) { return clone(guilds.get(id) ?? null) },
    async getGuildByName(name) { for (const guild of guilds.values()) if (guild.name.toLowerCase() === String(name).toLowerCase()) return clone(guild); return null },
    async listGuilds(faction) { return [...guilds.values()].filter(guild => !faction || guild.faction === faction).map(clone) },
    async insertGuild(guild) { guildSeq += 1; guilds.set(guildSeq, { ...clone(guild), id: guildSeq }); return guildSeq },
    async updateGuild(guild) { guilds.set(guild.id, clone(guild)) },
    async deleteGuild(id) { guilds.delete(id) },
    async getMember(userId) { return clone(members.get(userId) ?? null) },
    async listMembers(guildId) { return [...members.values()].filter(member => member.guildId === guildId).map(clone) },
    async putMember(member) { members.set(member.userId, clone(member)) },
    async listRequests({ guildId, userId, kind } = {}) { return [...requests.values()].filter(item => (guildId == null || item.guildId === guildId) && (userId == null || item.userId === userId) && (!kind || item.kind === kind)).map(clone) },
    async getRequest(id) { return clone(requests.get(id) ?? null) },
    async insertRequest(item) { reqSeq += 1; requests.set(reqSeq, { ...clone(item), id: reqSeq }); return reqSeq },
    async deleteRequest(id) { requests.delete(id) },
    async addLog(guildId, at, text) { logSeq += 1; logs.push({ id: logSeq, guildId, at, text }) },
    async listLogs(guildId, limit) { return logs.filter(item => item.guildId === guildId).slice(-limit).reverse().map(clone) },
    async addChat(message) { chatSeq += 1; chat.push({ ...clone(message), id: chatSeq }); const mine = chat.filter(item => item.guildId === message.guildId); if (mine.length > GUILD_CHAT_KEEP) chat.splice(chat.indexOf(mine[0]), 1); return chatSeq },
    async listChat(guildId, afterId, limit) { return chat.filter(item => item.guildId === guildId && item.id > afterId).slice(-limit).map(clone) },
    async getWeek(weekKey) { return clone(weeks.get(weekKey) ?? null) },
    async putWeek(weekKey, data) { weeks.set(weekKey, clone(data)) },
  }
}

// ── 서버 처리 ──────────────────────────────────────────────
/**
 * repo: 저장소. 계정 정보 account(userId) → { userId, name, faction, maxLevel, power, operator }
 * 모든 바꾸기는 한 줄로(차례대로) 처리한다: 한 서버 프로세스 안에서 동시에 두 요청이 같은 연맹을 고치지 않게.
 */
export function createGuildService(repo, { now = () => Date.now() } = {}) {
  let queue = Promise.resolve()
  const serial = fn => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run }

  const rank = role => GUILD_ROLES.indexOf(role)
  const log = (guildId, text) => repo.addLog(guildId, now(), text)

  function freshMember(userId, account) {
    return { userId, guildId: null, role: 'member', name: account?.name ?? `지휘관 ${userId}`, joinedAt: 0, leftAt: 0, points: 0, weekPoints: 0, weekRaid: 0, weekKey: guildWeekKey(now()), lastActiveAt: now(), power: account?.power ?? 0, ledger: {}, pending: [] }
  }
  async function memberOf(userId, account) {
    const member = await repo.getMember(userId) ?? freshMember(userId, account)
    if (account) { member.name = account.name ?? member.name; member.power = Number(account.power) || member.power || 0 }
    if (member.weekKey !== guildWeekKey(now())) { member.weekKey = guildWeekKey(now()); member.weekPoints = 0; member.weekRaid = 0 }
    member.ledger ??= {}
    member.pending ??= []
    return member
  }
  async function needAccount(userId) {
    const account = await repo.account(userId)
    if (!account) fail('계정 정보를 찾을 수 없습니다. 게임을 한 번 저장한 뒤 다시 시도하십시오.')
    return account
  }
  async function guildOf(member) {
    if (!member.guildId) return null
    const guild = await repo.getGuild(member.guildId)
    if (!guild) { member.guildId = null; await repo.putMember(member); return null }
    if (guild.weekKey !== guildWeekKey(now())) { rollWeek(guild); await repo.updateGuild(guild) }
    return guild
  }
  async function requireGuild(userId) {
    const account = await needAccount(userId)
    const member = await memberOf(userId, account)
    const guild = await guildOf(member)
    if (!guild) fail('가입한 연맹이 없습니다.')
    return { account, member, guild }
  }
  function requireRole(member, minRole) { if (rank(member.role) > rank(minRole)) fail(`${GUILD_ROLE_LABEL[minRole]} 이상만 할 수 있습니다.`) }

  async function removeMember(member, guild, reason) {
    member.guildId = null
    member.role = 'member'
    member.leftAt = now()
    await repo.putMember(member)
    await log(guild.id, `${member.name} ${reason}`)
  }

  /** 지난 주 정산(연맹 기여 · 레이드 합산 순위 보상)을 아직 안 했으면 한다 — 아무 요청에서나 불린다 */
  async function settleIfNeeded() {
    const thisWeek = guildWeekKey(now())
    const lastWeek = guildWeekKey(now() - 7 * DAY)
    if (await repo.getWeek(lastWeek)) return
    const all = await repo.listGuilds()
    const result = { settledAt: now(), contribution: [], raid: [] }
    const weekEnd = Date.parse(`${thisWeek}T00:00:00Z`) - KST
    for (const kind of ['contribution', 'raid']) {
      const key = kind === 'contribution' ? 'weekPoints' : 'weekRaid'
      // 지난 주 값: 이번 주로 넘어온 연맹은 lastWeek 칸에 옮겨 둔 값, 아니면 아직 지난 주 값
      const scored = all.map(guild => ({ guild, score: guild.weekKey === lastWeek ? Number(guild[key]) || 0 : guild.lastWeek?.weekKey === lastWeek ? Number(guild.lastWeek[key]) || 0 : 0 })).filter(item => item.score > 0).sort((a, b) => b.score - a.score)
      for (let index = 0; index < scored.length; index += 1) {
        const reward = guildWeeklyReward(index + 1, scored.length)
        result[kind].push({ guildId: scored[index].guild.id, name: scored[index].guild.name, score: scored[index].score, rank: index + 1 })
        if (!reward) continue
        for (const member of await repo.listMembers(scored[index].guild.id)) {
          if (member.joinedAt > weekEnd - GUILD_REWARD_MIN_MEMBER_MS) continue
          member.pending = [...(member.pending ?? []), { id: `${lastWeek}-${kind}`, label: `${lastWeek} 주간 ${kind === 'contribution' ? '기여' : '레이드'} ${index + 1}위`, gold: reward.gold, manuals: reward.manuals }].slice(-20)
          await repo.putMember(member)
        }
      }
    }
    await repo.putWeek(lastWeek, result)
  }

  /** 연맹장이 7일 넘게 접속하지 않았으면 부연맹장 → 정예 → 주간 기여 1위 순으로 넘긴다 */
  async function delegateIfAway(guild) {
    const list = await repo.listMembers(guild.id)
    const leader = list.find(member => member.role === 'leader')
    if (leader && now() - (leader.lastActiveAt ?? 0) <= GUILD_LEADER_AFK_MS) return
    const candidates = list.filter(member => member !== leader && now() - (member.lastActiveAt ?? 0) <= GUILD_LEADER_AFK_MS)
      .sort((a, b) => rank(a.role) - rank(b.role) || (b.weekPoints ?? 0) - (a.weekPoints ?? 0) || (b.points ?? 0) - (a.points ?? 0))
    const next = candidates[0]
    if (!next) return
    if (leader) { leader.role = 'member'; await repo.putMember(leader) }
    next.role = 'leader'
    await repo.putMember(next)
    guild.leaderUserId = next.userId
    await repo.updateGuild(guild)
    await log(guild.id, `연맹장이 7일 동안 접속하지 않아 ${next.name}에게 연맹장이 넘어갔습니다.`)
  }

  function guildView(guild, memberCount) {
    return { id: guild.id, name: guild.name, faction: guild.faction, level: guild.level, exp: guild.exp, expToNext: guildExpToNext(guild.level), funds: guild.funds, capacity: guildCapacity(guild.level), members: memberCount, emblem: guild.emblem, notice: guild.notice ?? '', joinMode: guild.joinMode, minLevel: guild.minLevel, tech: guild.tech ?? {}, techCap: guildTechCap(guild.level), target: guild.target?.weekKey === guildWeekKey(now()) ? guild.target : null, weekPoints: guild.weekPoints ?? 0, weekRaid: guild.weekRaid ?? 0, leaderUserId: guild.leaderUserId, createdAt: guild.createdAt }
  }
  function memberView(member) {
    return { userId: member.userId, name: member.name, role: member.role, power: member.power ?? 0, lastActiveAt: member.lastActiveAt ?? 0, weekPoints: member.weekPoints ?? 0, weekRaid: member.weekRaid ?? 0, joinedAt: member.joinedAt ?? 0 }
  }
  function usage(member, kind, period) {
    const key = periodKey(period, now())
    const entry = member.ledger[kind]
    return entry?.key === key ? entry.count : 0
  }
  function use(member, kind, period, count = 1) {
    const key = periodKey(period, now())
    const entry = member.ledger[kind]
    member.ledger[kind] = { key, count: (entry?.key === key ? entry.count : 0) + count }
  }

  async function joinGuild(member, guild, account) {
    const count = (await repo.listMembers(guild.id)).length
    if (count >= guildCapacity(guild.level)) fail('연맹 인원이 가득 찼습니다.')
    member.guildId = guild.id
    member.role = 'member'
    member.joinedAt = now()
    member.weekPoints = 0
    member.weekRaid = 0
    member.lastActiveAt = now()
    await repo.putMember(member)
    for (const item of await repo.listRequests({ userId: member.userId })) await repo.deleteRequest(item.id)
    await log(guild.id, `${account?.name ?? member.name} 가입`)
  }
  function checkJoinable(member, account, guild) {
    if (member.guildId) fail('이미 연맹에 가입해 있습니다.')
    if (member.leftAt && now() - member.leftAt < GUILD_REJOIN_MS) fail(`연맹을 나온 뒤 24시간이 지나야 다시 가입할 수 있습니다(${Math.ceil((GUILD_REJOIN_MS - (now() - member.leftAt)) / HOUR)}시간 남음).`)
    if (guild.faction !== account.faction) fail('같은 진영의 연맹에만 가입할 수 있습니다.')
    if ((account.maxLevel ?? 0) < (guild.minLevel ?? 1)) fail(`이 연맹은 무장 최고 레벨 Lv.${guild.minLevel} 이상만 가입할 수 있습니다.`)
  }

  const service = {
    /** 내 연맹 정보(접속 표시 · 진영 확인 · 자동 위임 · 정산 포함) */
    me: userId => serial(async () => {
      await settleIfNeeded()
      const account = await needAccount(userId)
      const member = await memberOf(userId, account)
      let guild = await guildOf(member)
      member.lastActiveAt = now()
      if (guild && guild.faction !== account.faction) {
        await removeMember(member, guild, '진영을 바꿔 연맹에서 나갔습니다.')
        await cleanupIfEmpty(guild)
        guild = null
      }
      await repo.putMember(member)
      const invites = (await repo.listRequests({ userId, kind: 'invite' })).filter(item => now() - item.createdAt < GUILD_APPLY_EXPIRE_MS)
      const inviteViews = []
      for (const item of invites) { const g = await repo.getGuild(item.guildId); if (g && g.faction === account.faction) inviteViews.push({ id: item.id, guildId: g.id, guildName: g.name, emblem: g.emblem, level: g.level, from: item.fromName ?? '' }) }
      const applications = (await repo.listRequests({ userId, kind: 'apply' })).filter(item => now() - item.createdAt < GUILD_APPLY_EXPIRE_MS).map(item => item.guildId)
      const base = { pending: member.pending, points: member.points ?? 0, rejoinAt: member.leftAt ? member.leftAt + GUILD_REJOIN_MS : 0, invites: inviteViews, applications, usage: Object.fromEntries([...Object.entries(GUILD_CONTRIBUTIONS).map(([kind, rule]) => [kind, usage(member, rule.shares ?? kind, rule.period)]), ...GUILD_SHOP.map(item => [`shop:${item.id}`, usage(member, `shop:${item.id}`, item.period)])]) }
      if (!guild) return { guild: null, member: null, ...base }
      await delegateIfAway(guild)
      const fresh = await repo.getMember(userId) ?? member
      const members = await repo.listMembers(guild.id)
      const requests = rank(fresh.role) <= rank('elite') ? (await repo.listRequests({ guildId: guild.id, kind: 'apply' })).filter(item => now() - item.createdAt < GUILD_APPLY_EXPIRE_MS) : []
      return { guild: guildView(guild, members.length), member: memberView(fresh), members: members.map(memberView).sort((a, b) => rank(a.role) - rank(b.role) || b.weekPoints - a.weekPoints), requests: requests.map(item => ({ id: item.id, userId: item.userId, name: item.name, power: item.power ?? 0, maxLevel: item.maxLevel ?? 0, createdAt: item.createdAt })), ...base }
    }),

    /** 같은 진영 연맹 목록(이름 검색) */
    list: (userId, query = '') => serial(async () => {
      const account = await needAccount(userId)
      const text = String(query ?? '').trim().toLowerCase()
      const guilds = (await repo.listGuilds(account.faction)).filter(guild => !text || guild.name.toLowerCase().includes(text))
      const views = []
      for (const guild of guilds) views.push(guildView(guild, (await repo.listMembers(guild.id)).length))
      return views.sort((a, b) => (b.members < b.capacity) - (a.members < a.capacity) || b.level - a.level || b.weekPoints - a.weekPoints).slice(0, 50)
    }),

    create: (userId, input) => serial(async () => {
      const account = await needAccount(userId)
      const member = await memberOf(userId, account)
      if (member.guildId) fail('이미 연맹에 가입해 있습니다.')
      if (member.leftAt && now() - member.leftAt < GUILD_REJOIN_MS) fail('연맹을 나온 뒤 24시간이 지나야 새 연맹을 만들 수 있습니다.')
      if ((account.maxLevel ?? 0) < GUILD_CREATE_MIN_LEVEL) fail(`무장 최고 레벨 Lv.${GUILD_CREATE_MIN_LEVEL} 이상이어야 연맹을 만들 수 있습니다.`)
      const name = String(input?.name ?? '').trim()
      const bad = validGuildName(name)
      if (bad) fail(bad)
      if (await repo.getGuildByName(name)) fail('같은 이름의 연맹이 있습니다.')
      if (!(await repo.spendGold(userId, GUILD_CREATE_GOLD))) fail(`금화 ${GUILD_CREATE_GOLD}개가 필요합니다.`)
      const guild = {
        name, faction: account.faction, level: 1, exp: 0, funds: 0, leaderUserId: userId, createdAt: now(),
        emblem: { color: Math.max(0, Math.min(GUILD_COLORS.length - 1, Number(input?.color) || 0)), pattern: Math.max(0, Math.min(GUILD_PATTERNS.length - 1, Number(input?.pattern) || 0)) },
        notice: '', joinMode: input?.joinMode === 'approval' ? 'approval' : 'open', minLevel: Math.max(1, Math.min(60, Number(input?.minLevel) || 1)),
        tech: {}, target: null, weekKey: guildWeekKey(now()), weekPoints: 0, weekRaid: 0,
      }
      const id = await repo.insertGuild(guild)
      member.guildId = id
      member.role = 'leader'
      member.joinedAt = now()
      member.weekPoints = 0
      member.weekRaid = 0
      await repo.putMember(member)
      for (const item of await repo.listRequests({ userId })) await repo.deleteRequest(item.id)
      await log(id, `${account.name}이(가) 연맹 ‘${name}’을(를) 만들었습니다.`)
      return { ok: true, guildId: id, goldSpent: GUILD_CREATE_GOLD }
    }),

    /** 가입: 자유 가입이면 바로, 승인 가입이면 신청 */
    apply: (userId, guildId) => serial(async () => {
      const account = await needAccount(userId)
      const member = await memberOf(userId, account)
      const guild = await repo.getGuild(guildId)
      if (!guild) fail('연맹을 찾을 수 없습니다.')
      checkJoinable(member, account, guild)
      if (guild.joinMode === 'open') { await joinGuild(member, guild, account); return { ok: true, joined: true } }
      const mine = await repo.listRequests({ userId, kind: 'apply' })
      if (mine.some(item => item.guildId === guildId && now() - item.createdAt < GUILD_APPLY_EXPIRE_MS)) fail('이미 가입을 신청했습니다.')
      if (mine.length >= 5) fail('가입 신청은 한 번에 5곳까지 할 수 있습니다.')
      await repo.insertRequest({ guildId, userId, kind: 'apply', name: account.name, power: account.power ?? 0, maxLevel: account.maxLevel ?? 0, createdAt: now() })
      await repo.putMember(member)
      return { ok: true, joined: false }
    }),
    cancelApply: (userId, guildId) => serial(async () => {
      for (const item of await repo.listRequests({ userId, guildId, kind: 'apply' })) await repo.deleteRequest(item.id)
      return { ok: true }
    }),
    /** 가입 신청 승인 · 거절(정예 이상) */
    decide: (userId, requestId, accept) => serial(async () => {
      const { member, guild } = await requireGuild(userId)
      requireRole(member, 'elite')
      const request = await repo.getRequest(requestId)
      if (!request || request.guildId !== guild.id || request.kind !== 'apply') fail('신청을 찾을 수 없습니다.')
      await repo.deleteRequest(requestId)
      if (!accept) return { ok: true }
      if (now() - request.createdAt >= GUILD_APPLY_EXPIRE_MS) fail('신청이 만료되었습니다(48시간).')
      const applicant = await repo.account(request.userId)
      if (!applicant) fail('신청한 지휘관을 찾을 수 없습니다.')
      const target = await memberOf(request.userId, applicant)
      checkJoinable(target, applicant, guild)
      await joinGuild(target, guild, applicant)
      return { ok: true }
    }),
    /** 초대(정예 이상) — 이름으로 */
    invite: (userId, targetName) => serial(async () => {
      const { account, member, guild } = await requireGuild(userId)
      requireRole(member, 'elite')
      const target = await repo.accountByName(String(targetName ?? '').trim())
      if (!target) fail('그 이름의 지휘관을 찾을 수 없습니다.')
      if (target.faction !== guild.faction) fail('같은 진영의 지휘관만 초대할 수 있습니다.')
      const targetMember = await repo.getMember(target.userId)
      if (targetMember?.guildId) fail('이미 다른 연맹에 가입한 지휘관입니다.')
      const existing = await repo.listRequests({ guildId: guild.id, userId: target.userId, kind: 'invite' })
      for (const item of existing) await repo.deleteRequest(item.id)
      await repo.insertRequest({ guildId: guild.id, userId: target.userId, kind: 'invite', name: target.name, fromName: account.name, createdAt: now() })
      await log(guild.id, `${account.name}이(가) ${target.name}을(를) 초대했습니다.`)
      return { ok: true }
    }),
    respondInvite: (userId, requestId, accept) => serial(async () => {
      const request = await repo.getRequest(requestId)
      if (!request || request.userId !== userId || request.kind !== 'invite') fail('초대를 찾을 수 없습니다.')
      await repo.deleteRequest(requestId)
      if (!accept) return { ok: true }
      if (now() - request.createdAt >= GUILD_APPLY_EXPIRE_MS) fail('초대가 만료되었습니다(48시간).')
      const account = await needAccount(userId)
      const member = await memberOf(userId, account)
      const guild = await repo.getGuild(request.guildId)
      if (!guild) fail('연맹이 없어졌습니다.')
      checkJoinable(member, account, guild)
      await joinGuild(member, guild, account)
      return { ok: true }
    }),
    leave: userId => serial(async () => {
      const { member, guild } = await requireGuild(userId)
      const others = (await repo.listMembers(guild.id)).filter(item => item.userId !== userId)
      if (member.role === 'leader' && others.length) fail('연맹장은 다른 연맹원에게 연맹장을 넘긴 뒤 나갈 수 있습니다(혼자 남으면 해산).')
      await removeMember(member, guild, '탈퇴')
      await cleanupIfEmpty(guild)
      return { ok: true }
    }),
    kick: (userId, targetUserId) => serial(async () => {
      const { member, guild } = await requireGuild(userId)
      requireRole(member, 'deputy')
      const target = await repo.getMember(targetUserId)
      if (!target || target.guildId !== guild.id || target.userId === userId) fail('추방할 연맹원을 찾을 수 없습니다.')
      if (member.role === 'deputy' && target.role !== 'member') fail('부연맹장은 연맹원만 추방할 수 있습니다.')
      if (target.role === 'leader') fail('연맹장은 추방할 수 없습니다.')
      await removeMember(target, guild, `추방(${member.name})`)
      return { ok: true }
    }),
    /** 직위 바꾸기(연맹장): leader를 주면 연맹장 위임 */
    setRole: (userId, targetUserId, role) => serial(async () => {
      const { member, guild } = await requireGuild(userId)
      requireRole(member, 'leader')
      if (!GUILD_ROLES.includes(role)) fail('알 수 없는 직위입니다.')
      const target = await repo.getMember(targetUserId)
      if (!target || target.guildId !== guild.id || target.userId === userId) fail('연맹원을 찾을 수 없습니다.')
      if (role === 'leader') {
        member.role = 'deputy'
        const deputies = (await repo.listMembers(guild.id)).filter(item => item.role === 'deputy' && item.userId !== target.userId && item.userId !== userId)
        if (deputies.length >= GUILD_ROLE_LIMIT.deputy) member.role = 'member'
        target.role = 'leader'
        guild.leaderUserId = target.userId
        await repo.putMember(member)
        await repo.putMember(target)
        await repo.updateGuild(guild)
        await log(guild.id, `${member.name}이(가) ${target.name}에게 연맹장을 넘겼습니다.`)
        return { ok: true }
      }
      const limit = GUILD_ROLE_LIMIT[role]
      if (limit) {
        const holders = (await repo.listMembers(guild.id)).filter(item => item.role === role && item.userId !== target.userId)
        if (holders.length >= limit) fail(`${GUILD_ROLE_LABEL[role]}은(는) ${limit}명까지입니다.`)
      }
      target.role = role
      await repo.putMember(target)
      await log(guild.id, `${target.name} → ${GUILD_ROLE_LABEL[role]}`)
      return { ok: true }
    }),
    disband: userId => serial(async () => {
      const { member, guild } = await requireGuild(userId)
      requireRole(member, 'leader')
      const others = (await repo.listMembers(guild.id)).filter(item => item.userId !== userId)
      if (others.length) fail('연맹장 혼자 남았을 때만 해산할 수 있습니다.')
      await removeMember(member, guild, '연맹 해산')
      await cleanupIfEmpty(guild)
      return { ok: true }
    }),
    /** 공지 · 가입 방식 · 최소 레벨(부연맹장 이상), 문장(연맹장) */
    updateSettings: (userId, input) => serial(async () => {
      const { member, guild } = await requireGuild(userId)
      requireRole(member, 'deputy')
      if (input?.notice !== undefined) guild.notice = String(input.notice).slice(0, GUILD_NOTICE_MAX)
      if (input?.joinMode !== undefined) guild.joinMode = input.joinMode === 'approval' ? 'approval' : 'open'
      if (input?.minLevel !== undefined) guild.minLevel = Math.max(1, Math.min(60, Number(input.minLevel) || 1))
      if (input?.color !== undefined || input?.pattern !== undefined) {
        requireRole(member, 'leader')
        guild.emblem = { color: Math.max(0, Math.min(GUILD_COLORS.length - 1, Number(input.color ?? guild.emblem?.color) || 0)), pattern: Math.max(0, Math.min(GUILD_PATTERNS.length - 1, Number(input.pattern ?? guild.emblem?.pattern) || 0)) }
      }
      await repo.updateGuild(guild)
      if (input?.notice !== undefined) await log(guild.id, `${member.name}이(가) 공지를 바꿨습니다.`)
      return { ok: true }
    }),

    /** 헌납: 은전 · 자원은 게임이 빼고(돌려주는 cost), 금화는 서버가 뺀다 */
    donate: (userId, kind) => serial(async () => {
      if (!GUILD_DONATIONS.includes(kind)) fail('알 수 없는 헌납입니다.')
      const { member, guild } = await requireGuild(userId)
      const rule = GUILD_CONTRIBUTIONS[kind]
      if (usage(member, kind, rule.period) >= rule.limit) fail(`오늘 ${rule.label}을(를) 이미 했습니다.`)
      if (rule.cost.gold && !(await repo.spendGold(userId, rule.cost.gold))) fail(`금화 ${rule.cost.gold}개가 필요합니다.`)
      use(member, kind, rule.period)
      await credit(member, guild, rule)
      await log(guild.id, `${member.name} ${rule.label}`)
      return { ok: true, cost: rule.cost, points: rule.points }
    }),
    /** 연맹 기술 연구(부연맹장 이상, 연맹 자금) */
    research: (userId, techId) => serial(async () => {
      const { member, guild } = await requireGuild(userId)
      requireRole(member, 'deputy')
      const tech = GUILD_TECHS[techId]
      if (!tech) fail('알 수 없는 기술입니다.')
      guild.tech ??= {}
      const current = Number(guild.tech[techId]) || 0
      if (current >= tech.max) fail('이미 최고 단계입니다.')
      if (current >= guildTechCap(guild.level)) fail(`연맹 레벨을 올려야 다음 단계를 연구할 수 있습니다(지금 최대 ${guildTechCap(guild.level)}단계).`)
      const cost = guildTechCost(current + 1)
      if ((guild.funds ?? 0) < cost) fail(`연맹 자금이 부족합니다(${cost.toLocaleString()} 필요).`)
      guild.funds -= cost
      guild.tech[techId] = current + 1
      await repo.updateGuild(guild)
      await log(guild.id, `${member.name}이(가) ${tech.name} ${current + 1}단계를 연구했습니다.`)
      return { ok: true }
    }),
    /** 연맹 상점: 개인 기여 포인트로 산다. 게임이 더할 물품(grant)을 돌려준다(신화 조각 · 강화석은 서버 장부에 바로) */
    buy: (userId, itemId) => serial(async () => {
      const { member, guild } = await requireGuild(userId)
      const item = GUILD_SHOP.find(entry => entry.id === itemId)
      if (!item) fail('알 수 없는 물품입니다.')
      if (guild.level < item.minLevel) fail(`연맹 Lv.${item.minLevel}부터 살 수 있습니다.`)
      if (usage(member, `shop:${item.id}`, item.period) >= item.limit) fail(`${item.period === 'month' ? '이번 달' : '이번 주'} 구매 한도(${item.limit}회)를 다 썼습니다.`)
      if ((member.points ?? 0) < item.price) fail(`기여 포인트가 부족합니다(${item.price} 필요).`)
      member.points -= item.price
      use(member, `shop:${item.id}`, item.period)
      await repo.putMember(member)
      const { fragments = 0, stones = 0, ...rest } = item.grant
      if (fragments || stones) await repo.grantLedger(userId, { fragments, stones })
      return { ok: true, grant: rest, ledger: { fragments, stones }, points: member.points }
    }),
    /** 이번 주 공동 공성 목표 도시(부연맹장 이상) */
    setTarget: (userId, cityId, cityName) => serial(async () => {
      const { member, guild } = await requireGuild(userId)
      requireRole(member, 'deputy')
      const id = String(cityId ?? '').trim()
      if (!/^[a-z0-9-]{2,32}$/.test(id)) fail('도시를 고르십시오.')
      guild.target = { cityId: id, cityName: String(cityName ?? id).slice(0, 16), weekKey: guildWeekKey(now()), setBy: member.name }
      await repo.updateGuild(guild)
      await log(guild.id, `${member.name}이(가) 이번 주 목표 도시를 ${guild.target.cityName}(으)로 정했습니다.`)
      return { ok: true }
    }),
    /** 지난 주 순위 보상 · 목표 점령 보상 받기: 금화는 서버가 더하고, 병서 · 옥패는 게임이 더한다 */
    claim: userId => serial(async () => {
      const account = await needAccount(userId)
      const member = await memberOf(userId, account)
      const pending = member.pending ?? []
      if (!pending.length) fail('받을 연맹 보상이 없습니다.')
      const total = pending.reduce((sum, item) => ({ gold: sum.gold + (item.gold ?? 0), manuals: sum.manuals + (item.manuals ?? 0), honor: sum.honor + (item.honor ?? 0) }), { gold: 0, manuals: 0, honor: 0 })
      member.pending = []
      await repo.putMember(member)
      if (total.gold) await repo.grantLedger(userId, { gold: total.gold })
      return { ok: true, ...total, items: pending }
    }),

    logs: userId => serial(async () => {
      const { guild } = await requireGuild(userId)
      return repo.listLogs(guild.id, 50)
    }),
    chat: (userId, afterId = 0) => serial(async () => {
      const { guild } = await requireGuild(userId)
      return repo.listChat(guild.id, Math.max(0, Number(afterId) || 0), 100)
    }),
    say: (userId, text) => serial(async () => {
      const { member, guild } = await requireGuild(userId)
      const body = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, GUILD_CHAT_MAX)
      if (!body) fail('내용을 입력하십시오.')
      if (now() - (member.lastChatAt ?? 0) < GUILD_CHAT_INTERVAL_MS) fail('조금 뒤에 다시 보내십시오.')
      member.lastChatAt = now()
      await repo.putMember(member)
      const id = await repo.addChat({ guildId: guild.id, userId, name: member.name, role: member.role, text: body, at: now() })
      return { ok: true, id }
    }),
    /** 연맹 순위: level(레벨) · contribution(주간 기여) · raid(주간 레이드 합산 피해) */
    ranking: (userId, kind = 'level') => serial(async () => {
      await settleIfNeeded()
      const account = await repo.account(userId)
      const week = guildWeekKey(now())
      const all = await repo.listGuilds()
      const score = guild => kind === 'level' ? guild.level * 1e9 + (guild.exp ?? 0) : guild.weekKey === week ? Number(kind === 'raid' ? guild.weekRaid : guild.weekPoints) || 0 : 0
      const rows = []
      for (const guild of all) {
        // 운영자가 연맹장인 연맹은 순위에서 뺀다
        if ((await repo.account(guild.leaderUserId))?.operator) continue
        rows.push({ id: guild.id, name: guild.name, faction: guild.faction, emblem: guild.emblem, level: guild.level, members: (await repo.listMembers(guild.id)).length, score: score(guild) })
      }
      rows.sort((a, b) => b.score - a.score)
      const mine = account ? (await repo.getMember(userId))?.guildId : null
      const last = await repo.getWeek(guildWeekKey(now() - 7 * DAY))
      return { kind, rows: rows.slice(0, 100).map((row, index) => ({ ...row, rank: index + 1, mine: row.id === mine })), lastWeek: last ? { contribution: last.contribution.slice(0, 3), raid: last.raid.slice(0, 3) } : null }
    }),

    // ── 다른 서버 처리에서 부르는 기여(공성 · 수비 · 레이드 · 출석) ──
    record: (userId, kind, { cityId, damage } = {}) => serial(async () => {
      const account = await repo.account(userId)
      if (!account) return { ok: false }
      const member = await memberOf(userId, account)
      const guild = await guildOf(member)
      if (!guild) return { ok: false }
      let type = kind
      if (kind === 'siege' && cityId && guild.target?.weekKey === guildWeekKey(now()) && guild.target.cityId === cityId) type = 'targetSiege'
      const rule = GUILD_CONTRIBUTIONS[type]
      if (!rule) return { ok: false }
      if (kind === 'raid' && damage) { member.weekRaid = (member.weekRaid ?? 0) + Math.max(0, Math.round(damage)); guild.weekRaid = (guild.weekRaid ?? 0) + Math.max(0, Math.round(damage)) }
      const bucket = rule.shares ?? type
      if (usage(member, bucket, rule.period) >= rule.limit) { await repo.putMember(member); await repo.updateGuild(guild); return { ok: true, credited: false } }
      use(member, bucket, rule.period)
      await credit(member, guild, rule)
      return { ok: true, credited: true, kind: type }
    }),
    /** 도시 점령이 기록되면: 이번 주 그 도시를 목표로 정한 같은 진영 연맹 전원에게 보상 */
    cityCaptured: (faction, cityId) => serial(async () => {
      const week = guildWeekKey(now())
      for (const guild of await repo.listGuilds(faction)) {
        if (guild.target?.weekKey !== week || guild.target.cityId !== cityId || guild.target.done) continue
        guild.target.done = true
        addGuildExp(guild, GUILD_TARGET_REWARD.exp)
        await repo.updateGuild(guild)
        for (const member of await repo.listMembers(guild.id)) {
          member.pending = [...(member.pending ?? []), { id: `target-${week}-${cityId}`, label: `공동 공성 목표 ${guild.target.cityName} 점령`, honor: GUILD_TARGET_REWARD.honor, manuals: GUILD_TARGET_REWARD.manuals }].slice(-20)
          await repo.putMember(member)
        }
        await log(guild.id, `이번 주 목표 도시 ${guild.target.cityName}을(를) 점령했습니다! 연맹원 전원 보상 · 연맹 경험치 +${GUILD_TARGET_REWARD.exp}`)
      }
    }),
    /** 다른 화면(대련 · 순위)에 붙일 연맹 이름 · 대련 기술: userId → { name, duel } */
    tags: userIds => serial(async () => {
      const out = new Map()
      const cache = new Map()
      for (const id of userIds) {
        const member = await repo.getMember(id)
        if (!member?.guildId) continue
        if (!cache.has(member.guildId)) cache.set(member.guildId, await repo.getGuild(member.guildId))
        const guild = cache.get(member.guildId)
        if (guild) out.set(id, { guildId: guild.id, name: guild.name, emblem: guild.emblem, ...guildBonuses(guild.tech) })
      }
      return out
    }),

    // ── 관리자 ──
    adminList: () => serial(async () => {
      const rows = []
      for (const guild of await repo.listGuilds()) rows.push({ ...guildView(guild, (await repo.listMembers(guild.id)).length) })
      return rows.sort((a, b) => b.level - a.level || b.members - a.members)
    }),
    adminRename: (guildId, name) => serial(async () => {
      const guild = await repo.getGuild(guildId)
      if (!guild) fail('연맹을 찾을 수 없습니다.')
      const bad = validGuildName(name)
      if (bad) fail(bad)
      const other = await repo.getGuildByName(name)
      if (other && other.id !== guildId) fail('같은 이름의 연맹이 있습니다.')
      const before = guild.name
      guild.name = String(name).trim()
      await repo.updateGuild(guild)
      await log(guild.id, `운영자가 연맹 이름을 ${before} → ${guild.name}(으)로 바꿨습니다.`)
      return { ok: true }
    }),
    adminDisband: guildId => serial(async () => {
      const guild = await repo.getGuild(guildId)
      if (!guild) fail('연맹을 찾을 수 없습니다.')
      for (const member of await repo.listMembers(guildId)) { member.guildId = null; member.role = 'member'; await repo.putMember(member) }
      for (const item of await repo.listRequests({ guildId })) await repo.deleteRequest(item.id)
      await repo.deleteGuild(guildId)
      return { ok: true }
    }),
  }

  /** 주가 바뀌면 지난 주 값을 옮겨 두고(정산용) 이번 주 값을 비운다 */
  function rollWeek(guild) {
    guild.lastWeek = { weekKey: guild.weekKey, weekPoints: guild.weekPoints ?? 0, weekRaid: guild.weekRaid ?? 0 }
    guild.weekKey = guildWeekKey(now())
    guild.weekPoints = 0
    guild.weekRaid = 0
  }
  async function credit(member, guild, rule) {
    member.points = (member.points ?? 0) + rule.points
    member.weekPoints = (member.weekPoints ?? 0) + rule.points
    guild.weekPoints = (guild.weekPoints ?? 0) + rule.points
    guild.funds = (guild.funds ?? 0) + (rule.funds ?? 0)
    const before = guild.level
    addGuildExp(guild, rule.exp)
    await repo.putMember(member)
    await repo.updateGuild(guild)
    if (guild.level > before) await log(guild.id, `연맹이 Lv.${guild.level}이 되었습니다! 인원 ${guildCapacity(guild.level)}명 · 기술 ${guildTechCap(guild.level)}단계까지`)
  }
  async function cleanupIfEmpty(guild) {
    const left = await repo.listMembers(guild.id)
    if (left.length) return
    for (const item of await repo.listRequests({ guildId: guild.id })) await repo.deleteRequest(item.id)
    await repo.deleteGuild(guild.id)
  }

  return service
}
