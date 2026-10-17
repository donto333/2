// 밸런스 테스트 열람 권한.
// 운영 서버(Manus)가 있으면 서버가 판단한다: 출시 전 모두, 출시 후 운영자(관리자 권한)만.
// 서버가 없는 정적 미리보기(GitHub Pages·데스크톱 오프라인)에서는 출시 스위치만 본다:
// 출시 전에는 열고, 출시 후에는 운영자 확인을 할 수 없으므로 닫는다.
import { OFFICIAL_LAUNCH, type BalanceAccess } from '../../server/launch.mjs'

export type AccessState = BalanceAccess & { source: 'server' | 'local' }

export async function checkBalanceAccess(fetcher: typeof fetch = fetch): Promise<AccessState> {
  try {
    const response = await fetcher('/api/balance/access', { credentials: 'include', headers: { accept: 'application/json' } })
    const type = response.headers.get('content-type') ?? ''
    if (response.ok && type.includes('application/json')) {
      const body = await response.json() as Partial<BalanceAccess>
      if (typeof body.allowed === 'boolean' && typeof body.launched === 'boolean') return { launched: body.launched, allowed: body.allowed, reason: body.reason ?? (body.allowed ? 'operator' : 'not_operator'), source: 'server' }
    }
  } catch {
    // 서버가 없는 환경: 아래 출시 스위치로 판단
  }
  return OFFICIAL_LAUNCH
    ? { launched: true, allowed: false, reason: 'login_required', source: 'local' }
    : { launched: false, allowed: true, reason: 'prelaunch', source: 'local' }
}
