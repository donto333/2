import express from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { registerOAuthRoutes, createContext, webdevRouter, router, publicPlatformConfig, ENV, OAUTH_STATE_COOKIE, ONE_YEAR_MS, sdk, findUserByName, createGuestUser, getUserByOpenId, setSessionCookie } from './webdev-adapter.mjs'
import { registerGuestAuthRoutes } from './guest-auth.mjs'
import { registerDesktopAuthRoutes } from './desktop-auth.mjs'
import { balanceAccess, isLaunched } from './launch.mjs'

export function createGameApp(gameRouter, { leaderboard } = {}) {
  const app = express()
  app.disable('x-powered-by')
  if (leaderboard) app.use(leaderboard.middleware)
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    const signature = req.get('stripe-signature')
    if (!secret) return res.status(503).json({ error: 'stripe_webhook_unconfigured' })
    if (!signature || !verifyStripeSignature(req.body, signature, secret)) return res.status(400).json({ error: 'stripe_signature_invalid' })
    try {
      const event = JSON.parse(req.body.toString('utf8'))
      // The prototype deliberately has no cash shop or entitlement ledger.
      // A verified event is acknowledged so Stripe does not retry it.
      if (typeof event?.type !== 'string') return res.status(400).json({ error: 'stripe_event_invalid' })
      return res.json({ received: true })
    } catch {
      return res.status(400).json({ error: 'stripe_payload_invalid' })
    }
  })
  // 밸런스 테스트 페이지 열람 권한: 출시 전에는 모두, 출시 후에는 운영자(관리자 권한)만.
  app.get('/api/balance/access', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const launched = isLaunched()
    let user = null
    if (launched) {
      try { user = await sdk.authenticateRequest(req) } catch { user = null }
    }
    res.json(balanceAccess(launched, user, ENV.adminEmail))
  })
  app.get('/api/auth/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(publicPlatformConfig())
  })
  // Steam 데스크톱 앱: 기본 브라우저에서 로그인한 결과를 앱으로 넘긴다.
  const desktopAuth = registerDesktopAuthRoutes(app, {
    secret: () => ENV.cookieSecret,
    appId: () => ENV.appId,
    portalUrl: () => publicPlatformConfig().oauthPortalUrl,
    oauthStateCookie: OAUTH_STATE_COOKIE,
    createSessionToken: (openId, options) => sdk.createSessionToken(openId, options),
    sessionMaxAgeMs: ONE_YEAR_MS,
  })
  registerOAuthRoutes(app, { afterLogin: desktopAuth.afterLogin })
  // 게스트 계정: 아이디만 정하면 서버 계정으로 모든 콘텐츠를 쓴다
  registerGuestAuthRoutes(app, { json: express.json({ limit: '4kb' }), sdk, findUserByName, createGuestUser, getUserByOpenId, setSessionCookie })
  // Browser mutations use Webdev's JSON tRPC transport. Do not enable CORS or
  // accept form/text bodies: cross-origin forms must not create a Checkout or
  // mutate a player's save using the SameSite=None session cookie.
  app.use('/api/trpc', express.json({ limit: '8mb' }), (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'POST' && !req.is('application/json')) {
      res.status(415).json({ error: 'json_required' })
      return
    }
    next()
  }, createExpressMiddleware({
    router: router({ webdev: webdevRouter, game: gameRouter }),
    createContext,
  }))
  // Stripe webhooks belong outside /api/trpc. Register the application's
  // signature-verified raw-body handler before any JSON body parser.
  return app
}

function verifyStripeSignature(rawBody, header, secret) {
  if (!Buffer.isBuffer(rawBody)) return false
  const parts = header.split(',').map(part => part.split('='))
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1])
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value)
  if (!Number.isInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || signatures.length === 0) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex')
  return signatures.some(signature => {
    const actual = Buffer.from(signature, 'utf8')
    const wanted = Buffer.from(expected, 'utf8')
    return actual.length === wanted.length && timingSafeEqual(actual, wanted)
  })
}
