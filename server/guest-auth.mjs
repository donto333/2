// 게스트 계정: 처음 들어올 때 아이디(표시 이름)를 정하면 서버에 계정을 만들어 회원과 똑같이
// 저장 · 랭킹 · 영토전 · 대련 · 레이드 · 게시판을 쓸 수 있게 한다(Manus 로그인 없이).
//  POST /api/guest/signup  { name }  → 계정 생성 + 세션 쿠키, { token, name } (토큰은 기기에 보관해 다시 들어올 때 쓴다)
//  POST /api/guest/restore { token } → 기기에 보관한 토큰으로 세션 쿠키를 다시 건다
import { randomUUID } from 'node:crypto'

export const GUEST_OPEN_ID_PREFIX = 'guest_'
/** 아이디: 한글 · 영문 · 숫자 · 밑줄 2~12자 */
export const GUEST_NAME_RE = /^[가-힣A-Za-z0-9_]{2,12}$/
const SIGNUP_LIMIT = 5
const SIGNUP_WINDOW_MS = 60 * 60 * 1000

export function validateGuestName(raw) {
  const name = String(raw ?? '').trim()
  if (!GUEST_NAME_RE.test(name)) return { ok: false, reason: '아이디는 한글 · 영문 · 숫자 · 밑줄(_)로 2~12자입니다.' }
  if (/^(운영|관리|admin|gm|manus)/i.test(name)) return { ok: false, reason: '쓸 수 없는 아이디입니다.' }
  return { ok: true, name }
}

export function registerGuestAuthRoutes(app, { json, sdk, findUserByName, createGuestUser, getUserByOpenId, setSessionCookie, now = () => Date.now() }) {
  const attempts = new Map()
  const allow = ip => {
    const t = now()
    const list = (attempts.get(ip) ?? []).filter(at => t - at < SIGNUP_WINDOW_MS)
    if (list.length >= SIGNUP_LIMIT) { attempts.set(ip, list); return false }
    list.push(t); attempts.set(ip, list)
    return true
  }
  app.post('/api/guest/signup', json, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!req.is('application/json')) return res.status(415).json({ ok: false, reason: 'json_required' })
    const checked = validateGuestName(req.body?.name)
    if (!checked.ok) return res.status(400).json(checked)
    const ip = String(req.headers['x-forwarded-for'] ?? req.ip ?? '').split(',')[0].trim() || 'unknown'
    if (!allow(ip)) return res.status(429).json({ ok: false, reason: '잠시 뒤 다시 시도하십시오(한 시간에 5개까지 만들 수 있습니다).' })
    try {
      if (await findUserByName(checked.name)) return res.status(409).json({ ok: false, reason: '이미 쓰고 있는 아이디입니다. 다른 아이디를 입력하십시오.' })
      const openId = `${GUEST_OPEN_ID_PREFIX}${randomUUID()}`
      await createGuestUser(openId, checked.name)
      const token = await sdk.createSessionToken(openId, { name: checked.name })
      setSessionCookie(req, res, token)
      res.json({ ok: true, token, name: checked.name })
    } catch (error) {
      console.error('[guest] signup failed', error instanceof Error ? error.message : error)
      res.status(500).json({ ok: false, reason: '계정을 만들지 못했습니다. 잠시 뒤 다시 시도하십시오.' })
    }
  })
  app.post('/api/guest/restore', json, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!req.is('application/json')) return res.status(415).json({ ok: false, reason: 'json_required' })
    const token = typeof req.body?.token === 'string' ? req.body.token : ''
    const session = token.length < 4096 ? await sdk.verifySession(token) : null
    if (!session || !session.openId.startsWith(GUEST_OPEN_ID_PREFIX)) return res.status(401).json({ ok: false, reason: '게스트 계정 정보가 맞지 않습니다.' })
    const user = await getUserByOpenId(session.openId)
    if (!user) return res.status(404).json({ ok: false, reason: '게스트 계정을 찾을 수 없습니다.' })
    setSessionCookie(req, res, token)
    res.json({ ok: true, name: user.name ?? '' })
  })
}
