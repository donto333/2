// 정식 출시 스위치 — 클라이언트와 서버가 함께 읽는 단일 원본.
// 출시 전(false): 밸런스 테스트 페이지를 누구나 연다.
// 출시 후(true): 운영자(관리자 권한 계정)만 연다. 서버 환경 변수 OFFICIAL_LAUNCH=1 로도 켤 수 있다.
export const OFFICIAL_LAUNCH = false

export function isLaunched(env = globalThis.process?.env ?? {}) {
  return OFFICIAL_LAUNCH || env.OFFICIAL_LAUNCH === '1' || env.OFFICIAL_LAUNCH === 'true'
}

/** 밸런스 테스트 열람 규칙: 출시 전 모두, 출시 후 운영자만 */
export function balanceAccess(launched, user, adminEmail = '') {
  if (!launched) return { launched: false, allowed: true, reason: 'prelaunch' }
  if (!user) return { launched: true, allowed: false, reason: 'login_required' }
  const email = String(user.email ?? '').trim().toLowerCase()
  const admin = user.role === 'admin' || (adminEmail && email === adminEmail)
  return { launched: true, allowed: Boolean(admin), reason: admin ? 'operator' : 'not_operator' }
}
