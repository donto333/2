// Steam 데스크톱 앱 로그인 연결 (RFC 8252 loopback + PKCE)
//
// Google 계정 로그인은 앱 안에 들어 있는 창(Electron)을 차단하므로, 데스크톱 앱은
// PC의 기본 브라우저에서 로그인하고 그 결과만 넘겨받는다.
//
//  1. 앱: verifier(비밀)와 challenge = SHA-256(verifier)를 만들고, 127.0.0.1:<port>에서 대기한 뒤
//     브라우저로 GET /api/desktop/login?challenge=...&port=... 를 연다.
//  2. 서버: challenge·port를 서명된 쿠키에 담고 평소의 Manus OAuth 로그인으로 보낸다.
//  3. OAuth 콜백(webdev-adapter): 로그인 후 그 쿠키가 있으면 5분짜리 1회용 티켓을 만들어
//     http://127.0.0.1:<port>/callback?ticket=... 로 보낸다.
//  4. 앱: POST /api/desktop/exchange { ticket, verifier } → 세션 토큰을 받아 자기 창의 쿠키로 설정한다.
//
// 티켓이 노출되어도 verifier 없이는 세션으로 바꿀 수 없다. 티켓과 로그인 쿠키는 세션 JWT와
// 다른 형식·다른 키로 서명하므로 세션 쿠키로 쓰일 수 없다.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export const DESKTOP_LOGIN_COOKIE = 'cheonharo_desktop_login'
const LOGIN_TTL_MS = 10 * 60 * 1000
const TICKET_TTL_MS = 5 * 60 * 1000
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/
const VERIFIER_RE = /^[A-Za-z0-9_-]{43,128}$/

const b64url = buffer => Buffer.from(buffer).toString('base64url')

export function challengeFor(verifier) {
  return b64url(createHash('sha256').update(verifier).digest())
}

function deriveKey(secret) {
  if (!secret) throw new Error('MANUS_JWT_SECRET is unavailable')
  return createHmac('sha256', secret).update('cheonharo-desktop-login-v1').digest()
}

export function signToken(secret, payload, ttlMs, now = Date.now()) {
  const body = b64url(JSON.stringify({ ...payload, exp: now + ttlMs }))
  const mac = b64url(createHmac('sha256', deriveKey(secret)).update(body).digest())
  return `${body}.${mac}`
}

export function verifyToken(secret, token, typ, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 4096) return null
  const [body, mac, extra] = token.split('.')
  if (!body || !mac || extra !== undefined) return null
  const expected = createHmac('sha256', deriveKey(secret)).update(body).digest()
  const actual = Buffer.from(mac, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  let payload
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  if (!payload || payload.typ !== typ || typeof payload.exp !== 'number' || payload.exp < now) return null
  return payload
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()) } catch { return null }
    }
  }
  return null
}

function publicOrigin(req) {
  // Manus 프록시 뒤에서는 원래 호스트가 X-Forwarded-Host로 온다.
  const forwarded = String(req.get?.('x-forwarded-host') || '').split(',')[0].trim()
  const host = forwarded || String(req.get?.('host') || '')
  return /^[A-Za-z0-9.-]+(:\d+)?$/.test(host) ? `https://${host}` : ''
}

function readJsonBody(req, limit = 16 * 1024) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body)
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) { reject(new Error('too_large')); req.destroy?.(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch { reject(new Error('invalid_json')) }
    })
    req.on('error', reject)
  })
}

/**
 * @param {import('express').Express} app
 * @param {{ secret: () => string, appId: () => string, portalUrl: () => string,
 *           oauthStateCookie: string, createSessionToken: (openId: string, options: object) => Promise<string>,
 *           sessionMaxAgeMs: number }} deps
 * @returns {{ afterLogin: (req, res, user: { openId: string, name?: string|null }) => Promise<boolean> }}
 */
export function registerDesktopAuthRoutes(app, deps) {
  const usedTickets = new Map() // 같은 서버 프로세스 안에서 티켓 재사용을 막는다 (최선 노력).
  const secureCookie = { httpOnly: true, secure: true, sameSite: 'none', path: '/' }

  // 데스크톱 앱이 서버가 이 기능을 지원하는지 확인할 때 쓴다.
  app.get('/api/desktop/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ desktopLogin: 1 })
  })

  app.get('/api/desktop/login', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const challenge = String(req.query?.challenge || '')
    const port = Number(req.query?.port)
    if (!CHALLENGE_RE.test(challenge) || !Number.isInteger(port) || port < 1024 || port > 65535) {
      res.status(400).json({ error: 'desktop_login_invalid' })
      return
    }
    const portalUrl = deps.portalUrl()
    const appId = deps.appId()
    const origin = publicOrigin(req)
    if (!portalUrl || !appId || !origin) {
      res.status(503).json({ error: 'auth_unavailable' })
      return
    }
    const secret = deps.secret()
    res.cookie(DESKTOP_LOGIN_COOKIE, signToken(secret, { typ: 'desktop_login', challenge, port }, LOGIN_TTL_MS), { ...secureCookie, maxAge: LOGIN_TTL_MS })
    // 웹 클라이언트의 startLogin()과 같은 방식으로 Manus OAuth를 시작한다.
    const nonce = randomUUID()
    res.cookie(deps.oauthStateCookie, nonce, { path: '/', secure: true, sameSite: 'none', maxAge: LOGIN_TTL_MS })
    const redirectUri = `${origin}/api/oauth/callback`
    const state = Buffer.from(JSON.stringify({ redirectUri, nonce })).toString('base64')
    const url = new URL(`${portalUrl.replace(/\/+$/, '')}/app-auth`)
    url.searchParams.set('appId', appId)
    url.searchParams.set('redirectUri', redirectUri)
    url.searchParams.set('state', state)
    url.searchParams.set('responseType', 'code')
    res.redirect(302, url.toString())
  })

  app.post('/api/desktop/exchange', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!String(req.get?.('content-type') || '').includes('application/json')) {
      res.status(415).json({ error: 'json_required' })
      return
    }
    let body
    try { body = await readJsonBody(req) } catch { res.status(400).json({ error: 'desktop_exchange_invalid' }); return }
    const { ticket, verifier } = body || {}
    if (typeof verifier !== 'string' || !VERIFIER_RE.test(verifier)) {
      res.status(400).json({ error: 'desktop_exchange_invalid' })
      return
    }
    const payload = verifyToken(deps.secret(), ticket, 'desktop_ticket')
    const expected = payload && Buffer.from(String(payload.challenge))
    const actual = Buffer.from(challengeFor(verifier))
    if (!payload || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      res.status(403).json({ error: 'desktop_exchange_denied' })
      return
    }
    const now = Date.now()
    for (const [id, exp] of usedTickets) if (exp < now) usedTickets.delete(id)
    if (usedTickets.has(payload.jti)) {
      res.status(403).json({ error: 'desktop_exchange_denied' })
      return
    }
    usedTickets.set(payload.jti, payload.exp)
    try {
      const sessionToken = await deps.createSessionToken(payload.sub, { name: payload.name || '', expiresInMs: deps.sessionMaxAgeMs })
      res.json({ sessionToken, maxAgeMs: deps.sessionMaxAgeMs })
    } catch {
      res.status(503).json({ error: 'auth_unavailable' })
    }
  })

  return {
    /** OAuth 콜백에서 세션을 만든 뒤 호출한다. 데스크톱 로그인이면 앱으로 보내고 true를 돌려준다. */
    async afterLogin(req, res, user) {
      const raw = readCookie(req.headers?.cookie, DESKTOP_LOGIN_COOKIE)
      if (!raw) return false
      res.clearCookie(DESKTOP_LOGIN_COOKIE, secureCookie)
      const secret = deps.secret()
      const login = verifyToken(secret, raw, 'desktop_login')
      if (!login || !CHALLENGE_RE.test(login.challenge) || !Number.isInteger(login.port)) return false
      const ticket = signToken(secret, { typ: 'desktop_ticket', sub: user.openId, name: user.name || '', challenge: login.challenge, jti: randomUUID() }, TICKET_TTL_MS)
      res.redirect(302, `http://127.0.0.1:${login.port}/callback?ticket=${encodeURIComponent(ticket)}`)
      return true
    },
  }
}
