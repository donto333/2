import assert from 'node:assert/strict'
import http from 'node:http'
import { createRequire } from 'node:module'
import { it } from 'vitest'
import { registerDesktopAuthRoutes, signToken, verifyToken, challengeFor, DESKTOP_LOGIN_COOKIE } from '../server/desktop-auth.mjs'

const require = createRequire(import.meta.url)
const browserLogin = require('../desktop/browser-login.cjs')

// Steam 데스크톱 로그인: 서버(desktop-auth) ↔ 앱(browser-login) 전체 흐름과 공격 사례.
it('hands a browser login to the desktop app only with the PKCE verifier', async () => {
// --- minimal express-like app ---
  const routes = {}
  const app = { get: (p, h) => { routes['GET ' + p] = h }, post: (p, h) => { routes['POST ' + p] = h } }
  const SECRET = 'test-secret'
  const sessions = []
  const auth = registerDesktopAuthRoutes(app, {
    secret: () => SECRET, appId: () => 'proj123', portalUrl: () => 'https://portal.example/', oauthStateCookie: '__Host-oauth_state',
    createSessionToken: async (openId, o) => { const t = `SESSION(${openId},${o.name})`; sessions.push(t); return t }, sessionMaxAgeMs: 1000,
  })
  function mkRes() {
    const r = { statusCode: 200, headers: {}, cookies: {}, cleared: [], body: undefined, location: null }
    r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v }
    r.status = c => { r.statusCode = c; return r }
    r.json = b => { r.body = b; return r }
    r.cookie = (n, v, o) => { r.cookies[n] = { v, o } }
    r.clearCookie = n => { r.cleared.push(n) }
    r.redirect = (c, l) => { r.statusCode = c; r.location = l }
    return r
  }
  function mkReq({ query = {}, headers = {}, body } = {}) {
    const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
    return { query, headers: h, body, get: k => h[k.toLowerCase()] }
  }
  async function call(method, path, req) { const res = mkRes(); await routes[`${method} ${path}`](req, res); return res }

  // status
  assert.equal((await call('GET', '/api/desktop/status', mkReq())).body.desktopLogin, 1)
  // invalid login params
  assert.equal((await call('GET', '/api/desktop/login', mkReq({ query: { challenge: 'x', port: '5000' }, headers: { host: 'g.example' } }))).statusCode, 400)
  assert.equal((await call('GET', '/api/desktop/login', mkReq({ query: { challenge: 'a'.repeat(43), port: '80' }, headers: { host: 'g.example' } }))).statusCode, 400)

  // fake fetch → server exchange route
  const fetchToServer = async (url, init = {}) => {
    const u = new URL(url)
    if (u.pathname === '/api/desktop/status') return Response.json({ desktopLogin: 1 })
    const res = await call('POST', u.pathname, mkReq({ headers: init.headers, body: JSON.parse(init.body) }))
    return Response.json(res.body, { status: res.statusCode })
  }
  assert.equal(await browserLogin.supportsDesktopLogin(fetchToServer, 'https://g.example'), true)
  assert.equal(await browserLogin.supportsDesktopLogin(async () => new Response('<html>', { status: 200 }), 'https://old.example'), false)

  // --- full happy path ---
  let captured = {}; let browserDone
  const login = browserLogin.startBrowserLogin({
    origin: 'https://g.example', fetch: fetchToServer,
    openExternal: url => (browserDone = (async () => {
      // browser opens login URL
      const u = new URL(url)
      assert.equal(u.origin + u.pathname, 'https://g.example/api/desktop/login')
      const res = await call('GET', '/api/desktop/login', mkReq({ query: Object.fromEntries(u.searchParams), headers: { host: 'internal:3000', 'x-forwarded-host': 'g.example' } }))
      assert.equal(res.statusCode, 302)
      const portal = new URL(res.location)
      assert.equal(portal.origin + portal.pathname, 'https://portal.example/app-auth')
      assert.equal(portal.searchParams.get('redirectUri'), 'https://g.example/api/oauth/callback')
      const state = JSON.parse(Buffer.from(portal.searchParams.get('state'), 'base64').toString())
      assert.equal(state.nonce, res.cookies['__Host-oauth_state'].v)
      const loginCookie = res.cookies[DESKTOP_LOGIN_COOKIE]
      assert.ok(loginCookie.o.httpOnly && loginCookie.o.secure)
      // the login cookie must not verify as a ticket
      assert.equal(verifyToken(SECRET, loginCookie.v, 'desktop_ticket'), null)
      // OAuth callback → afterLogin
      const cb = mkRes()
      const handled = await auth.afterLogin(mkReq({ headers: { cookie: `a=b; ${DESKTOP_LOGIN_COOKIE}=${encodeURIComponent(loginCookie.v)}` } }), cb, { openId: 'user-1', name: '여포' })
      assert.equal(handled, true); assert.deepEqual(cb.cleared, [DESKTOP_LOGIN_COOKIE])
      const loop = new URL(cb.location)
      assert.equal(loop.hostname, '127.0.0.1'); assert.equal(loop.port, u.searchParams.get('port'))
      captured.ticket = loop.searchParams.get('ticket')
      // attacker who stole the ticket but not the verifier
      const steal = await call('POST', '/api/desktop/exchange', mkReq({ headers: { 'content-type': 'application/json' }, body: { ticket: captured.ticket, verifier: 'z'.repeat(43) } }))
      assert.equal(steal.statusCode, 403)
      // browser follows redirect to loopback
      const html = await new Promise((resolve, reject) => http.get(cb.location, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve([r.statusCode, d])) }).on('error', reject))
      captured.page = html
    })()),
  })
  const result = await login.promise
  await browserDone
  assert.equal(result.sessionToken, 'SESSION(user-1,여포)')
  assert.equal(captured.page[0], 200); assert.match(captured.page[1], /로그인 완료/)

  // replay of the same ticket (even with... any verifier) is denied
  const replay = await call('POST', '/api/desktop/exchange', mkReq({ headers: { 'content-type': 'application/json' }, body: { ticket: captured.ticket, verifier: 'y'.repeat(43) } }))
  assert.equal(replay.statusCode, 403)

  // normal web login (no desktop cookie) is untouched
  assert.equal(await auth.afterLogin(mkReq({ headers: { cookie: 'x=1' } }), mkRes(), { openId: 'u' }), false)
  // forged / expired login cookie falls back to web flow
  assert.equal(await auth.afterLogin(mkReq({ headers: { cookie: `${DESKTOP_LOGIN_COOKIE}=forged.token` } }), mkRes(), { openId: 'u' }), false)
  const expired = signToken(SECRET, { typ: 'desktop_login', challenge: 'a'.repeat(43), port: 5000 }, 1000, Date.now() - 5000)
  assert.equal(await auth.afterLogin(mkReq({ headers: { cookie: `${DESKTOP_LOGIN_COOKIE}=${expired}` } }), mkRes(), { openId: 'u' }), false)
  // ticket signed with another secret is rejected
  const verifier = 'v'.repeat(43)
  const foreign = signToken('other', { typ: 'desktop_ticket', sub: 'u', challenge: challengeFor(verifier), jti: '1' }, 60000)
  assert.equal((await call('POST', '/api/desktop/exchange', mkReq({ headers: { 'content-type': 'application/json' }, body: { ticket: foreign, verifier } }))).statusCode, 403)
  // valid ticket+verifier works once
  const good = signToken(SECRET, { typ: 'desktop_ticket', sub: 'u2', name: 'n', challenge: challengeFor(verifier), jti: '2' }, 60000)
  assert.equal((await call('POST', '/api/desktop/exchange', mkReq({ headers: { 'content-type': 'application/json' }, body: { ticket: good, verifier } }))).body.sessionToken, 'SESSION(u2,n)')
  // non-JSON rejected
  assert.equal((await call('POST', '/api/desktop/exchange', mkReq({ headers: { 'content-type': 'text/plain' }, body: {} }))).statusCode, 415)

  // timeout + cancel close the loopback server
  const t = browserLogin.startBrowserLogin({ origin: 'https://g.example', fetch: fetchToServer, openExternal: async () => {}, timeoutMs: 50 })
  await assert.rejects(t.promise, /login_timeout/)
  const c = browserLogin.startBrowserLogin({ origin: 'https://g.example', fetch: fetchToServer, openExternal: async () => {} })
  setTimeout(() => c.cancel(), 20); await assert.rejects(c.promise, /login_cancelled/)

  // applySession sets the right cookie
  let set
  await browserLogin.applySession({ cookies: { set: async v => { set = v } } }, 'https://g.example', { sessionToken: 'T', maxAgeMs: 1000 })
  assert.equal(set.name, 'webdev_app_session'); assert.equal(set.url, 'https://g.example/'); assert.equal(set.sameSite, 'no_restriction'); assert.ok(set.httpOnly && set.secure)
})
