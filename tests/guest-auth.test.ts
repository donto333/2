import { describe, expect, it } from 'vitest'
import { registerGuestAuthRoutes, validateGuestName } from '../server/guest-auth.mjs'

type Handler = (req: unknown, res: unknown) => Promise<void>
function fakeApp() {
  const routes = new Map<string, Handler>()
  return { routes, post: (path: string, _json: unknown, handler: Handler) => { routes.set(path, handler) } }
}
function fakeRes() {
  const res = { statusCode: 200, body: null as unknown, headers: {} as Record<string, string>, status(code: number) { res.statusCode = code; return res }, json(body: unknown) { res.body = body; return res }, setHeader(key: string, value: string) { res.headers[key] = value } }
  return res
}
const req = (body: unknown, ip = '1.1.1.1') => ({ body, ip, headers: {}, is: () => true })

describe('게스트 계정', () => {
  it('아이디 규칙: 한글 · 영문 · 숫자 · 밑줄 2~12자, 운영자 사칭 금지', () => {
    expect(validateGuestName('관우팬').ok).toBe(true)
    expect(validateGuestName('a').ok).toBe(false)
    expect(validateGuestName('공백 있음').ok).toBe(false)
    expect(validateGuestName('너무너무너무너무긴아이디입니다').ok).toBe(false)
    expect(validateGuestName('운영자').ok).toBe(false)
    expect(validateGuestName('Admin1').ok).toBe(false)
  })

  it('가입하면 계정 · 세션 쿠키를 만들고, 같은 아이디는 거절, 한 시간에 5번까지', async () => {
    const app = fakeApp()
    const users = new Map<string, { openId: string; name: string }>()
    let cookie = ''
    registerGuestAuthRoutes(app, {
      json: null,
      sdk: { createSessionToken: async (openId: string) => `tok-${openId}`, verifySession: async (token: string) => token.startsWith('tok-') ? { openId: token.slice(4) } : null },
      findUserByName: async (name: string) => [...users.values()].find(user => user.name.toLowerCase() === name.toLowerCase()) ?? null,
      createGuestUser: async (openId: string, name: string) => { users.set(openId, { openId, name }) },
      getUserByOpenId: async (openId: string) => users.get(openId) ?? null,
      setSessionCookie: (_req: unknown, _res: unknown, token: string) => { cookie = token },
    })
    const signup = app.routes.get('/api/guest/signup')!
    const res = fakeRes()
    await signup(req({ name: '조자룡' }), res)
    expect(res.statusCode).toBe(200)
    expect((res.body as { token: string }).token).toMatch(/^tok-guest_/)
    expect(cookie).toBe((res.body as { token: string }).token)
    const dup = fakeRes()
    await signup(req({ name: '조자룡' }), dup)
    expect(dup.statusCode).toBe(409)
    // 기기에 보관한 토큰으로 다시 들어오기
    const restore = fakeRes(); cookie = ''
    await app.routes.get('/api/guest/restore')!(req({ token: (res.body as { token: string }).token }), restore)
    expect(restore.statusCode).toBe(200)
    expect(cookie).not.toBe('')
    const bad = fakeRes()
    await app.routes.get('/api/guest/restore')!(req({ token: 'nope' }), bad)
    expect(bad.statusCode).toBe(401)
    // 같은 IP에서 너무 많이 만들면 막는다(위에서 2번 썼으니 3번 더 → 5번째까지 통과, 그 뒤 429)
    for (let i = 0; i < 3; i++) { const ok = fakeRes(); await signup(req({ name: `장수${i}` }), ok) }
    const limited = fakeRes()
    await signup(req({ name: '장수9' }), limited)
    expect(limited.statusCode).toBe(429)
  })
})
