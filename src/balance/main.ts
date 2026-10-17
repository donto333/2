// 밸런스 조정 테스트 페이지 진입점: 열람 권한을 먼저 확인하고, 허용될 때만 화면 코드를 불러온다.
import '../styles/fonts.css'
import './balance.css'
import { checkBalanceAccess, type AccessState } from './access'

const LOCK_TEXT: Record<string, string> = {
  login_required: '정식 출시 후에는 운영자로 등록된 계정만 볼 수 있습니다. 게임에서 운영자 계정으로 로그인한 뒤 다시 열어 주세요.',
  not_operator: '이 계정은 운영자로 등록되어 있지 않습니다. 정식 출시 후 밸런스 테스트는 운영자만 열람할 수 있습니다.',
}

function lockScreen(root: HTMLElement, access: AccessState): void {
  root.innerHTML = `<div class="bl-lock"><div class="bl-lock-card"><span class="bl-eyebrow">천하 · 밸런스 실험실</span><h1>운영자 전용 페이지</h1><p>${LOCK_TEXT[access.reason] ?? LOCK_TEXT.not_operator}</p><div class="bl-actions"><a class="bl-primary" href="./">게임으로 가서 로그인</a><button type="button" data-retry>다시 확인</button></div></div></div>`
  root.querySelector('[data-retry]')?.addEventListener('click', () => location.reload())
}

async function boot(): Promise<void> {
  const root = document.getElementById('balance')
  if (!root) return
  const access = await checkBalanceAccess()
  if (!access.allowed) return lockScreen(root, access)
  const { mountBalance } = await import('./app')
  mountBalance(root, access)
}

void boot()
