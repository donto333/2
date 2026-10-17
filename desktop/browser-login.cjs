// 기본 브라우저 로그인 (RFC 8252 loopback + PKCE) — 서버 쪽은 server/desktop-auth.mjs
'use strict'

const http = require('node:http')
const { createHash, randomBytes } = require('node:crypto')

const SESSION_COOKIE = 'webdev_app_session' // server/webdev-adapter.mjs의 COOKIE_NAME
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000

function page(title, message) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101a1d;color:#efe6d2;font-family:system-ui,sans-serif}
main{max-width:420px;padding:32px;text-align:center}h1{font-size:22px;margin:0 0 12px}p{opacity:.8;line-height:1.6}</style></head>
<body><main><h1>${title}</h1><p>${message}</p></main></body></html>`
}

/**
 * 서버가 데스크톱 로그인을 지원하는지 확인한다 (구버전 서버면 false).
 */
async function supportsDesktopLogin(fetch, origin) {
  try {
    const response = await fetch(`${origin}/api/desktop/status`, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!response.ok) return false
    const data = await response.json()
    return data?.desktopLogin === 1
  } catch {
    return false
  }
}

/**
 * 기본 브라우저에서 로그인하고 세션 토큰을 받아 온다.
 * @param {{ origin: string, fetch: typeof fetch, openExternal: (url: string) => Promise<void>, timeoutMs?: number }} options
 * @returns {{ promise: Promise<{ sessionToken: string, maxAgeMs: number }>, cancel: () => void }}
 */
function startBrowserLogin({ origin, fetch, openExternal, timeoutMs = LOGIN_TIMEOUT_MS }) {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  let server = null
  let timer = null
  let settled = false
  let rejectOuter = () => {}

  const finish = () => {
    clearTimeout(timer)
    if (server) { server.close(); server.closeAllConnections?.() }
    server = null
  }

  const promise = new Promise((resolve, reject) => {
    rejectOuter = error => { if (!settled) { settled = true; finish(); reject(error) } }
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') { res.writeHead(404).end(); return }
      const ticket = url.searchParams.get('ticket') || ''
      if (settled || !ticket) { res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(page('로그인 실패', '게임에서 로그인을 다시 시도해 주세요.')); return }
      try {
        const response = await fetch(`${origin}/api/desktop/exchange`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ticket, verifier }),
          cache: 'no-store',
          signal: AbortSignal.timeout(20000),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || typeof data.sessionToken !== 'string') throw new Error(data.error || `exchange_failed_${response.status}`)
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page('로그인 완료', '천하 게임 창으로 돌아가세요. 이 탭은 닫아도 됩니다.'))
        settled = true
        finish()
        resolve({ sessionToken: data.sessionToken, maxAgeMs: Number(data.maxAgeMs) || 0 })
      } catch (error) {
        res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' }).end(page('로그인 실패', '게임에서 로그인을 다시 시도해 주세요.'))
        rejectOuter(error)
      }
    })
    server.on('error', rejectOuter)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      const loginUrl = `${origin}/api/desktop/login?challenge=${challenge}&port=${port}`
      openExternal(loginUrl).catch(rejectOuter)
      timer = setTimeout(() => rejectOuter(new Error('login_timeout')), timeoutMs)
    })
  })

  return { promise, cancel: () => rejectOuter(new Error('login_cancelled')) }
}

/** Electron 세션에 로그인 쿠키를 넣는다. */
async function applySession(electronSession, origin, { sessionToken, maxAgeMs }) {
  const seconds = Math.floor((Date.now() + (maxAgeMs || 365 * 24 * 3600 * 1000)) / 1000)
  await electronSession.cookies.set({
    url: `${origin}/`,
    name: SESSION_COOKIE,
    value: sessionToken,
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'no_restriction',
    expirationDate: seconds,
  })
}

module.exports = { supportsDesktopLogin, startBrowserLogin, applySession, SESSION_COOKIE }
