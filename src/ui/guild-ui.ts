// 유저 연맹 화면(소통 → 연맹). 규칙 수치는 server/guild.mjs에서 그대로 가져온다.
import {
  GUILD_COLORS, GUILD_CONTRIBUTIONS, GUILD_CREATE_GOLD, GUILD_CREATE_MIN_LEVEL, GUILD_PATTERNS, GUILD_ROLE_LABEL, GUILD_SHOP, GUILD_TECHS, GUILD_TECH_IDS,
  guildTechCost, type GuildChatMessage, type GuildContributionKind, type GuildEmblem, type GuildLog, type GuildMe, type GuildRanking, type GuildRole, type GuildView,
} from '../../server/guild.mjs'
import { formatNumber, type StrategyState } from '../game/strategy'

export type GuildTab = 'info' | 'members' | 'contribute' | 'tech' | 'shop' | 'talk'
export interface GuildBoardPost { id: number; title: string; content: string; authorName: string; createdAt: string | Date; canDelete?: boolean }
export interface GuildUiState {
  me: GuildMe | null
  list: GuildView[]
  search: string
  tab: GuildTab
  logs: GuildLog[]
  chat: GuildChatMessage[]
  posts: GuildBoardPost[]
  ranking: GuildRanking | null
  rankingKind: 'level' | 'contribution' | 'raid'
  createOpen: boolean
  /** 연맹을 쓸 수 없을 때(로그인 전 · 오프라인) 이유 */
  locked: string | null
  loading: boolean
}
export function emptyGuildUi(): GuildUiState {
  return { me: null, list: [], search: '', tab: 'info', logs: [], chat: [], posts: [], ranking: null, rankingKind: 'level', createOpen: false, locked: null, loading: false }
}

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character))
const ugc = (text: string) => `<span data-no-tr>${esc(text)}</span>`
const ROLE_RANK: Record<GuildRole, number> = { leader: 0, deputy: 1, elite: 2, member: 3 }
const atLeast = (role: GuildRole | undefined, min: GuildRole) => role !== undefined && ROLE_RANK[role] <= ROLE_RANK[min]

/** 연맹 문장: 바탕색 깃발 + 한 글자 문양 */
export function guildEmblem(emblem: GuildEmblem | null | undefined, size: 'sm' | 'md' | 'lg' = 'md'): string {
  const color = GUILD_COLORS[emblem?.color ?? 0] ?? GUILD_COLORS[0]
  const pattern = GUILD_PATTERNS[emblem?.pattern ?? 0] ?? GUILD_PATTERNS[0]
  return `<span class="guild-emblem guild-emblem--${size}" style="--emblem:${color}" aria-hidden="true"><b data-no-tr>${pattern}</b></span>`
}

function ago(at: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60000))
  if (minutes < 5) return '접속 중'
  if (minutes < 60) return `${minutes}분 전`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`
  return `${Math.floor(minutes / 1440)}일 전`
}
function clock(at: number | string | Date): string {
  const date = new Date(at)
  return `${date.getMonth() + 1}.${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
const maxLevelOf = (state: StrategyState) => state.generals.reduce((max, general) => Math.max(max, general.level), 0)

function pendingCard(me: GuildMe): string {
  if (!me.pending?.length) return ''
  const total = me.pending.reduce((sum, item) => ({ gold: sum.gold + (item.gold ?? 0), manuals: sum.manuals + (item.manuals ?? 0), honor: sum.honor + (item.honor ?? 0) }), { gold: 0, manuals: 0, honor: 0 })
  const parts = [total.gold ? `금화 ${formatNumber(total.gold)}` : '', total.manuals ? `병서 ${formatNumber(total.manuals)}` : '', total.honor ? `옥패 ${formatNumber(total.honor)}` : ''].filter(Boolean).join(' · ')
  return `<div class="guild-pending glass-card"><div><span class="eyebrow">연맹 보상</span><strong>${me.pending.map(item => esc(item.label)).join(' · ')}</strong><small>${parts}</small></div><button class="action-button action-button--primary" data-action="guild-claim">보상 받기</button></div>`
}

function createCard(state: StrategyState, ui: GuildUiState): string {
  const level = maxLevelOf(state)
  const can = level >= GUILD_CREATE_MIN_LEVEL
  const colors = GUILD_COLORS.map((color, index) => `<label class="guild-swatch" style="--emblem:${color}"><input type="radio" name="color" value="${index}" ${index === 0 ? 'checked' : ''}><span></span></label>`).join('')
  const patterns = GUILD_PATTERNS.map((pattern, index) => `<label class="guild-pattern"><input type="radio" name="pattern" value="${index}" ${index === 0 ? 'checked' : ''}><span data-no-tr>${pattern}</span></label>`).join('')
  return `<details class="guild-create glass-card" ${ui.createOpen ? 'open' : ''}><summary data-action="guild-create-toggle"><span class="eyebrow">새 연맹</span><strong>연맹 만들기</strong><small>금화 ${GUILD_CREATE_GOLD}개 · 무장 최고 레벨 Lv.${GUILD_CREATE_MIN_LEVEL} 이상</small></summary>
    <form class="guild-form" data-guild-form="create">
      <label>연맹 이름<input name="name" maxlength="8" minlength="2" pattern="[가-힣A-Za-z0-9]{2,8}" placeholder="한글 · 영문 · 숫자 2~8자" required></label>
      <fieldset><legend>깃발 색</legend><div class="guild-swatches">${colors}</div></fieldset>
      <fieldset><legend>문양</legend><div class="guild-patterns">${patterns}</div></fieldset>
      <div class="guild-form-row"><label>가입 방식<select name="joinMode"><option value="open">자유 가입</option><option value="approval">승인 가입</option></select></label><label>최소 레벨<input name="minLevel" type="number" min="1" max="60" value="1"></label></div>
      <button class="action-button action-button--primary" type="submit" ${can && state.gold >= GUILD_CREATE_GOLD ? '' : 'disabled'}>금화 ${GUILD_CREATE_GOLD}개로 만들기</button>
      ${can ? (state.gold >= GUILD_CREATE_GOLD ? '' : '<p class="guild-hint">금화가 부족합니다.</p>') : `<p class="guild-hint">무장 최고 레벨이 Lv.${GUILD_CREATE_MIN_LEVEL} 이상이어야 합니다(지금 Lv.${level}).</p>`}
    </form></details>`
}

function guildCard(guild: GuildView, me: GuildMe): string {
  const applied = me.applications?.includes(guild.id)
  const full = guild.members >= guild.capacity
  const action = applied
    ? `<button class="mini-action" data-action="guild-cancel-apply" data-guild-id="${guild.id}">신청 취소</button>`
    : `<button class="mini-action mini-action--deploy" data-action="guild-apply" data-guild-id="${guild.id}" ${full ? 'disabled' : ''}>${full ? '인원 가득' : guild.joinMode === 'open' ? '바로 가입' : '가입 신청'}</button>`
  return `<li class="guild-row">${guildEmblem(guild.emblem)}<div class="guild-row__copy"><strong>${ugc(guild.name)} <em>Lv.${guild.level}</em></strong><small>${guild.members}/${guild.capacity}명 · ${guild.joinMode === 'open' ? '자유 가입' : '승인 가입'}${guild.minLevel > 1 ? ` · Lv.${guild.minLevel} 이상` : ''} · 주간 기여 ${formatNumber(guild.weekPoints)}</small>${guild.notice ? `<p>${ugc(guild.notice)}</p>` : ''}</div>${action}</li>`
}

function noGuild(state: StrategyState, ui: GuildUiState, me: GuildMe): string {
  const waiting = me.rejoinAt > Date.now() ? `<p class="guild-hint">연맹을 나온 뒤 24시간이 지나야 다시 가입할 수 있습니다(${Math.ceil((me.rejoinAt - Date.now()) / 3600000)}시간 남음).</p>` : ''
  const invites = me.invites?.length ? `<div class="guild-invites glass-card"><span class="eyebrow">받은 초대</span><ul>${me.invites.map(invite => `<li>${guildEmblem(invite.emblem, 'sm')}<span><b>${ugc(invite.guildName)}</b> Lv.${invite.level}<small>${ugc(invite.from)}의 초대</small></span><button class="mini-action mini-action--deploy" data-action="guild-invite-accept" data-request-id="${invite.id}">수락</button><button class="mini-action" data-action="guild-invite-decline" data-request-id="${invite.id}">거절</button></li>`).join('')}</ul></div>` : ''
  const list = ui.list.length ? `<ul class="guild-list">${ui.list.map(guild => guildCard(guild, me)).join('')}</ul>` : `<div class="guild-empty">${ui.search ? '찾는 연맹이 없습니다.' : `아직 ${esc(state.faction)} 진영에 연맹이 없습니다. 첫 연맹을 만들어 보십시오.`}</div>`
  return `${invites}<div class="guild-join-layout"><div class="glass-card guild-browse"><div class="card-header"><div><span class="eyebrow">${esc(state.faction)} 진영 연맹</span><h3>연맹 찾기</h3></div><button class="ghost-button ghost-button--small" data-action="guild-refresh">새로고침 ↻</button></div><form class="guild-search" data-guild-form="search"><input name="query" maxlength="8" placeholder="연맹 이름 검색" value="${esc(ui.search)}"><button class="mini-action" type="submit">검색</button></form>${waiting}${list}</div>${createCard(state, ui)}</div>`
}

function header(guild: GuildView, me: GuildMe): string {
  const member = me.member!
  const expPct = guild.expToNext ? Math.min(100, Math.round(guild.exp / guild.expToNext * 100)) : 100
  return `<div class="guild-hero glass-card">${guildEmblem(guild.emblem, 'lg')}<div class="guild-hero__copy"><span class="eyebrow">${esc(guild.faction)} 진영 연맹</span><h2>${ugc(guild.name)} <em>Lv.${guild.level}</em></h2><div class="guild-exp"><i style="width:${expPct}%"></i></div><small>${guild.expToNext ? `경험치 ${formatNumber(guild.exp)} / ${formatNumber(guild.expToNext)}` : '최고 레벨'}</small></div><div class="guild-hero__stats"><span><b>${guild.members}/${guild.capacity}</b><small>인원</small></span><span><b>${formatNumber(guild.funds)}</b><small>연맹 자금</small></span><span><b>${formatNumber(me.points)}</b><small>내 기여 포인트</small></span><span><b>${esc(GUILD_ROLE_LABEL[member.role])}</b><small>내 직위</small></span></div>${guild.notice ? `<p class="guild-notice"><b>공지</b> ${ugc(guild.notice)}</p>` : ''}${guild.target ? `<p class="guild-target">⚑ 이번 주 공동 공성 목표 <b>${esc(guild.target.cityName)}</b> <small>${guild.target.done ? '점령 완료!' : '공성하면 성벽 방어도 차감 +10% · 기여 2배'}</small></p>` : ''}</div>`
}

function infoTab(state: StrategyState, guild: GuildView, me: GuildMe): string {
  const role = me.member?.role
  const cities = state.cities.filter(city => city.owner !== state.faction && !['chengdu', 'ye', 'jianye', 'xiangyang'].includes(city.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const settings = atLeast(role, 'deputy') ? `<div class="glass-card guild-panel"><span class="eyebrow">운영</span><h3>연맹 설정</h3>
    <form class="guild-form" data-guild-form="notice"><label>공지(200자)<textarea name="notice" maxlength="200" rows="3">${esc(guild.notice)}</textarea></label><button class="mini-action mini-action--deploy" type="submit">공지 저장</button></form>
    <form class="guild-form guild-form-row" data-guild-form="settings"><label>가입 방식<select name="joinMode"><option value="open" ${guild.joinMode === 'open' ? 'selected' : ''}>자유 가입</option><option value="approval" ${guild.joinMode === 'approval' ? 'selected' : ''}>승인 가입</option></select></label><label>최소 레벨<input name="minLevel" type="number" min="1" max="60" value="${guild.minLevel}"></label><button class="mini-action" type="submit">저장</button></form>
    <form class="guild-form guild-form-row" data-guild-form="target"><label>이번 주 공동 공성 목표<select name="cityId">${cities.map(city => `<option value="${city.id}" data-name="${esc(city.name)}" ${guild.target?.cityId === city.id ? 'selected' : ''}>${esc(city.name)} · ${city.level}단계 · ${esc(city.owner)}</option>`).join('')}</select></label><button class="mini-action" type="submit">목표 지정</button></form>
    ${role === 'leader' ? `<form class="guild-form" data-guild-form="emblem"><fieldset><legend>문장 바꾸기</legend><div class="guild-swatches">${GUILD_COLORS.map((color, index) => `<label class="guild-swatch" style="--emblem:${color}"><input type="radio" name="color" value="${index}" ${guild.emblem.color === index ? 'checked' : ''}><span></span></label>`).join('')}</div><div class="guild-patterns">${GUILD_PATTERNS.map((pattern, index) => `<label class="guild-pattern"><input type="radio" name="pattern" value="${index}" ${guild.emblem.pattern === index ? 'checked' : ''}><span data-no-tr>${pattern}</span></label>`).join('')}</div></fieldset><button class="mini-action" type="submit">문장 저장</button></form>` : ''}
  </div>` : ''
  const requests = atLeast(role, 'elite') ? `<div class="glass-card guild-panel"><span class="eyebrow">가입</span><h3>가입 신청 ${me.requests?.length ? `<em>${me.requests.length}</em>` : ''}</h3>${me.requests?.length ? `<ul class="guild-requests">${me.requests.map(request => `<li><span><b>${ugc(request.name)}</b><small>최고 Lv.${request.maxLevel} · 전투력 ${formatNumber(request.power)}</small></span><button class="mini-action mini-action--deploy" data-action="guild-decide" data-request-id="${request.id}" data-accept="1">승인</button><button class="mini-action" data-action="guild-decide" data-request-id="${request.id}" data-accept="0">거절</button></li>`).join('')}</ul>` : '<p class="guild-hint">대기 중인 신청이 없습니다(신청은 48시간 뒤 만료).</p>'}<form class="guild-form guild-form-row" data-guild-form="invite"><label>지휘관 초대<input name="name" maxlength="32" placeholder="같은 진영 지휘관 이름" required></label><button class="mini-action" type="submit">초대</button></form></div>` : ''
  const leave = role === 'leader' && guild.members <= 1
    ? '<button class="ghost-button ghost-button--danger" data-action="guild-disband">연맹 해산</button>'
    : '<button class="ghost-button ghost-button--danger" data-action="guild-leave">연맹 탈퇴</button>'
  const rules = `<div class="glass-card guild-panel"><span class="eyebrow">규칙</span><h3>연맹 안내</h3><ul class="guild-rules"><li>같은 진영 지휘관끼리만 연맹을 만들고 가입합니다. 진영을 바꾸면 자동으로 탈퇴합니다.</li><li>인원은 Lv.1 20명에서 레벨마다 2명씩 늘어 Lv.10 38명입니다.</li><li>탈퇴 · 추방 뒤 24시간이 지나야 다시 가입할 수 있습니다. 기여 포인트는 남습니다.</li><li>연맹장이 7일 동안 접속하지 않으면 부연맹장 → 정예 → 기여 순으로 자동 위임됩니다.</li><li>매주 월요일 0시에 주간 기여 · 레이드 합산 순위를 정산해 1 · 2 · 3위와 상위 10% 연맹원(3일 이상 소속)에게 금화 · 병서를 줍니다.</li></ul>${leave}</div>`
  return `<div class="guild-grid">${requests}${settings}${rules}</div>`
}

function membersTab(guild: GuildView, me: GuildMe): string {
  const myRole = me.member?.role
  const rows = (me.members ?? []).map(member => {
    const self = member.userId === me.member?.userId
    const roleControl = myRole === 'leader' && !self
      ? `<select data-action="guild-role" data-user-id="${member.userId}">${(['deputy', 'elite', 'member', 'leader'] as GuildRole[]).map(role => `<option value="${role}" ${member.role === role ? 'selected' : ''}>${role === 'leader' ? '연맹장 위임' : GUILD_ROLE_LABEL[role]}</option>`).join('')}</select>`
      : `<span class="guild-role guild-role--${member.role}">${esc(GUILD_ROLE_LABEL[member.role])}</span>`
    const kick = !self && member.role !== 'leader' && (myRole === 'leader' || (myRole === 'deputy' && member.role === 'member')) ? `<button class="mini-action" data-action="guild-kick" data-user-id="${member.userId}" data-name="${esc(member.name)}">추방</button>` : ''
    return `<tr class="${self ? 'is-me' : ''}"><td>${roleControl}</td><td>${ugc(member.name)}</td><td>${formatNumber(member.power)}</td><td>${formatNumber(member.weekPoints)}</td><td>${formatNumber(member.weekRaid)}</td><td>${ago(member.lastActiveAt)}</td><td>${kick}</td></tr>`
  }).join('')
  return `<div class="glass-card guild-panel guild-members"><div class="card-header"><div><span class="eyebrow">연맹원</span><h3>${guild.members}/${guild.capacity}명</h3></div><small class="guild-hint">부연맹장 2명 · 정예 5명까지</small></div><div class="guild-table-wrap"><table class="guild-table"><thead><tr><th>직위</th><th>이름</th><th>전투력</th><th>주간 기여</th><th>주간 레이드</th><th>최근 접속</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`
}

function contributeTab(state: StrategyState, me: GuildMe): string {
  const donation = (kind: GuildContributionKind) => {
    const rule = GUILD_CONTRIBUTIONS[kind]
    const used = me.usage?.[kind] ?? 0
    const cost = rule.cost ?? {}
    const enough = (cost.silver ?? 0) <= state.silver && (cost.grain ?? 0) <= state.resources.grain && (cost.wood ?? 0) <= state.resources.wood && (cost.iron ?? 0) <= state.resources.iron && (cost.gold ?? 0) <= state.gold
    const costText = cost.gold ? `금화 ${cost.gold}` : cost.silver ? `은전 ${formatNumber(cost.silver)}` : `식량 · 목재 · 철 각 ${formatNumber(cost.grain ?? 0)}`
    return `<li class="guild-donate"><div><strong>${esc(rule.label)}</strong><small>${costText} → 기여 +${rule.points} · 연맹 경험치 +${rule.exp} · 연맹 자금 +${rule.funds}</small></div><button class="action-button ${used >= rule.limit ? 'action-button--outline' : 'action-button--primary'}" data-action="guild-donate" data-kind="${kind}" ${used >= rule.limit || !enough ? 'disabled' : ''}>${used >= rule.limit ? '오늘 완료' : enough ? '헌납' : '재화 부족'}</button></li>`
  }
  const activity = (['siege', 'defense', 'raid', 'attendance'] as GuildContributionKind[]).map(kind => {
    const rule = GUILD_CONTRIBUTIONS[kind]
    const used = me.usage?.[kind] ?? 0
    return `<li><span>${esc(rule.label)}${kind === 'siege' ? ' (목표 도시는 2배)' : ''}</span><b>${used}/${rule.limit}</b><small>${rule.period === 'week' ? '매주' : '매일'} · 기여 +${rule.points}</small></li>`
  }).join('')
  return `<div class="guild-grid"><div class="glass-card guild-panel"><span class="eyebrow">하루 한 번</span><h3>헌납</h3><ul class="guild-donates">${(['donateSilver', 'donateResources', 'donateGold'] as GuildContributionKind[]).map(donation).join('')}</ul></div><div class="glass-card guild-panel"><span class="eyebrow">활동 기여</span><h3>싸우면 쌓이는 기여</h3><ul class="guild-activity">${activity}</ul><p class="guild-hint">영토전 공성 승리 · 수비전 성공 · 주간 레이드 참여 · 출석 체크를 하면 저절로 쌓입니다. 개인 기여 포인트는 연맹 상점에서 씁니다.</p></div></div>`
}

function techTab(guild: GuildView, me: GuildMe): string {
  const can = atLeast(me.member?.role, 'deputy')
  const rows = GUILD_TECH_IDS.map(id => {
    const tech = GUILD_TECHS[id]
    const level = guild.tech[id] ?? 0
    const pct = (value: number) => `${tech.unit}${Math.round(value * 100)}%`
    const cost = guildTechCost(level + 1)
    const maxed = level >= tech.max
    const capped = level >= guild.techCap
    const button = maxed ? '<span class="guild-hint">최고 단계</span>' : capped ? `<span class="guild-hint">연맹 Lv.${level * 2 + 1} 필요</span>` : `<button class="mini-action mini-action--deploy" data-action="guild-research" data-tech="${id}" ${!can || guild.funds < cost ? 'disabled' : ''}>연구 · 자금 ${formatNumber(cost)}</button>`
    return `<li class="guild-tech"><div><strong>${esc(tech.name)} <em>${level}/${tech.max}</em></strong><small>${esc(tech.desc)} ${pct(level * tech.per)}${maxed ? '' : ` → ${pct((level + 1) * tech.per)}`}</small><span class="guild-tech__pips">${'◆'.repeat(level)}${'◇'.repeat(tech.max - level)}</span></div>${button}</li>`
  }).join('')
  return `<div class="glass-card guild-panel"><div class="card-header"><div><span class="eyebrow">연맹 자금 ${formatNumber(guild.funds)}</span><h3>연맹 기술</h3></div><small class="guild-hint">지금 최대 ${guild.techCap}단계 · 부연맹장 이상이 연구</small></div><ul class="guild-techs">${rows}</ul><p class="guild-hint">연맹원 모두에게 적용됩니다. 전투 관련 보너스는 영토전 열세 버프와 합쳐 40%까지입니다.</p></div>`
}

function shopTab(guild: GuildView, me: GuildMe): string {
  const rows = GUILD_SHOP.map(item => {
    const used = me.usage?.[`shop:${item.id}`] ?? 0
    const locked = guild.level < item.minLevel
    const soldOut = used >= item.limit
    return `<li class="guild-shop-item ${locked ? 'is-locked' : ''}"><div><strong>${esc(item.name)}</strong><small>${item.period === 'month' ? '이번 달' : '이번 주'} ${used}/${item.limit}${item.minLevel > 1 ? ` · 연맹 Lv.${item.minLevel}부터` : ''}</small></div><button class="mini-action mini-action--deploy" data-action="guild-buy" data-item="${item.id}" ${locked || soldOut || me.points < item.price ? 'disabled' : ''}>${locked ? `Lv.${item.minLevel}` : soldOut ? '한도' : `기여 ${formatNumber(item.price)}`}</button></li>`
  }).join('')
  return `<div class="glass-card guild-panel"><div class="card-header"><div><span class="eyebrow">내 기여 포인트 ${formatNumber(me.points)}</span><h3>연맹 상점</h3></div></div><ul class="guild-shop">${rows}</ul></div>`
}

function talkTab(ui: GuildUiState, me: GuildMe): string {
  const myId = me.member?.userId
  const chat = ui.chat.length ? ui.chat.map(message => `<li class="${message.userId === myId ? 'is-me' : ''}"><span class="guild-chat__who">${ugc(message.name)}${message.role && message.role !== 'member' ? `<em>${esc(GUILD_ROLE_LABEL[message.role])}</em>` : ''}</span><p>${ugc(message.text)}</p><time>${clock(message.at)}</time></li>`).join('') : '<li class="guild-empty">첫 인사를 남겨 보십시오.</li>'
  const posts = ui.posts.length ? ui.posts.map(post => `<article class="guild-post"><div><b>${ugc(post.title)}</b><small>${ugc(post.authorName)} · ${clock(post.createdAt)}</small></div><p>${ugc(post.content)}</p>${post.canDelete ? `<form class="board-delete-form" data-board-delete-form><input type="hidden" name="postId" value="${post.id}"><input name="password" type="password" minlength="4" maxlength="64" placeholder="삭제 비밀번호" required><button class="text-button" type="submit">삭제</button></form>` : ''}</article>`).join('') : '<p class="guild-empty">아직 게시글이 없습니다.</p>'
  const logs = ui.logs.length ? ui.logs.map(log => `<li><time>${clock(log.at)}</time><span>${ugc(log.text)}</span></li>`).join('') : '<li class="guild-empty">기록이 없습니다.</li>'
  return `<div class="guild-grid guild-grid--talk"><div class="glass-card guild-panel guild-chat"><div class="card-header"><div><span class="eyebrow">실시간</span><h3>연맹 채팅</h3></div><small class="guild-hint">최근 200개 · 몇 초마다 새로 옴</small></div><ol class="guild-chat__list" data-guild-chat>${chat}</ol><form class="guild-chat__form" data-guild-form="say"><input name="text" maxlength="200" placeholder="연맹원에게 한마디(200자)" autocomplete="off" required><button class="mini-action mini-action--deploy" type="submit">보내기</button></form></div>
    <div class="glass-card guild-panel guild-board"><div class="card-header"><div><span class="eyebrow">연맹 전용</span><h3>연맹 게시판</h3></div><button class="ghost-button ghost-button--small" data-action="guild-board-refresh">새로고침 ↻</button></div><form class="guild-form" data-guild-form="post"><input name="title" maxlength="120" placeholder="제목" required><textarea name="content" rows="3" maxlength="4000" placeholder="내용" required></textarea><input name="password" type="password" minlength="4" maxlength="64" placeholder="삭제 비밀번호(4자 이상)" required><button class="mini-action mini-action--deploy" type="submit">올리기</button></form><div class="guild-posts">${posts}</div></div>
    <div class="glass-card guild-panel guild-logs"><span class="eyebrow">기록</span><h3>활동 기록</h3><ol>${logs}</ol></div></div>`
}

/** 연맹 화면 본문 */
export function guildSection(state: StrategyState, ui: GuildUiState): string {
  const head = `<div class="section-heading section-heading--compact"><div><span class="eyebrow">소통</span><h1>연맹</h1><p class="heading-copy">같은 진영 지휘관과 연맹을 맺어 함께 키우고, 함께 싸우십시오.</p></div><button class="ghost-button" data-action="guild-refresh">새로고침 ↻</button></div>`
  if (ui.locked) return `<section class="page-section page-section--guild">${head}<div class="glass-card guild-locked"><strong>연맹을 이용할 수 없습니다</strong><p>${esc(ui.locked)}</p></div></section>`
  const me = ui.me
  if (!me) return `<section class="page-section page-section--guild">${head}<div class="guild-empty">${ui.loading ? '연맹 정보를 불러오는 중입니다…' : '연맹 정보를 불러오지 못했습니다. 새로고침을 눌러 주십시오.'}</div></section>`
  if (!me.guild || !me.member) return `<section class="page-section page-section--guild">${head}${pendingCard(me)}${noGuild(state, ui, me)}</section>`
  const guild = me.guild
  const tabs: Array<[GuildTab, string]> = [['info', '정보'], ['members', '연맹원'], ['contribute', '기여'], ['tech', '기술'], ['shop', '상점'], ['talk', '소통']]
  const badge = (tab: GuildTab) => tab === 'info' && me.requests?.length ? `<i>${me.requests.length}</i>` : ''
  const body = ui.tab === 'members' ? membersTab(guild, me) : ui.tab === 'contribute' ? contributeTab(state, me) : ui.tab === 'tech' ? techTab(guild, me) : ui.tab === 'shop' ? shopTab(guild, me) : ui.tab === 'talk' ? talkTab(ui, me) : infoTab(state, guild, me)
  return `<section class="page-section page-section--guild">${head}${pendingCard(me)}${header(guild, me)}<div class="guild-tabs" role="tablist">${tabs.map(([tab, label]) => `<button class="filter-tab ${ui.tab === tab ? 'is-active' : ''}" data-action="guild-tab" data-tab="${tab}">${label}${badge(tab)}</button>`).join('')}</div>${body}</section>`
}

/** 천하 랭킹의 연맹 순위 칸 */
export function guildRankingCard(ui: GuildUiState): string {
  const kinds: Array<[GuildUiState['rankingKind'], string]> = [['level', '연맹 레벨'], ['contribution', '주간 기여'], ['raid', '주간 레이드']]
  const rows = ui.ranking?.rows.length ? `<ol class="guild-ranking">${ui.ranking.rows.map(row => `<li class="${row.mine ? 'is-me' : ''}"><b>${row.rank}</b>${guildEmblem(row.emblem, 'sm')}<span>${ugc(row.name)}<small>${esc(row.faction)} · Lv.${row.level} · ${row.members}명</small></span><em>${ui.rankingKind === 'level' ? `Lv.${row.level}` : formatNumber(row.score)}</em></li>`).join('')}</ol>` : `<div class="rank-empty">${ui.locked ? esc(ui.locked) : '아직 순위가 없습니다.'}</div>`
  const last = ui.ranking?.lastWeek
  const lastWeek = last && (last.contribution.length || last.raid.length) ? `<p class="guild-hint">지난 주 · 기여 1위 ${last.contribution[0] ? ugc(last.contribution[0].name) : '-'} · 레이드 1위 ${last.raid[0] ? ugc(last.raid[0].name) : '-'}</p>` : ''
  return `<div class="glass-card guild-rank-card"><div class="card-header"><div><span class="eyebrow">연맹</span><h3>연맹 순위</h3></div><div class="guild-rank-tabs">${kinds.map(([kind, label]) => `<button class="filter-tab ${ui.rankingKind === kind ? 'is-active' : ''}" data-action="guild-rank-kind" data-kind="${kind}">${label}</button>`).join('')}</div></div>${rows}${lastWeek}<p class="guild-hint">매주 월요일 0시 정산 · 주간 기여 · 레이드 합산 순위 1 · 2 · 3위와 상위 10% 연맹원에게 금화 · 병서</p></div>`
}
