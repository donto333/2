// 천하: 패왕의 시대 — Steam 데스크톱 셸 (Electron main process)
//
// 실행 흐름
//  1. Steamworks 초기화 (Steam이 꺼져 있어도 게임은 계속 실행)
//  2. 온라인 서버 /api/health 확인
//     - 응답이 오면: 기존 온라인 서버 화면을 그대로 연다 (Manus 로그인·랭킹·세력전 사용)
//     - 응답이 없으면: 설치 폴더에 포함된 게임(app://)을 오프라인으로 연다
//  3. 게임 화면의 Steam 업적 요청을 IPC로 받아 Steamworks에 전달한다
'use strict'

const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, session } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const steam = require('./steam.cjs')
const browserLogin = require('./browser-login.cjs')

const APP_SCHEME = 'app'
const APP_HOST = 'cheonharo'
const LOCAL_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
const WEB_ROOT = path.join(__dirname, 'app')

// ---------------------------------------------------------------------------
// 설정: 기본값 ← desktop/cheonharo.config.json (빌드에 포함) ← 실행 폴더의
// cheonharo.config.json (설치 후 수정 가능) ← 환경 변수 / 명령줄 인자 순으로 덮어쓴다.
// ---------------------------------------------------------------------------
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return {} }
}

function loadConfig() {
  const defaults = { onlineUrl: 'https://cheonharo-wv7unoxx.manus.game/', mode: 'auto', steamAppId: 480, healthTimeoutMs: 5000, fullscreen: false }
  const bundled = readJson(path.join(__dirname, 'cheonharo.config.json'))
  const besideExe = app.isPackaged ? readJson(path.join(path.dirname(process.execPath), 'cheonharo.config.json')) : {}
  const config = { ...defaults, ...bundled, ...besideExe }
  if (process.env.CHEONHARO_ONLINE_URL) config.onlineUrl = process.env.CHEONHARO_ONLINE_URL
  if (process.env.STEAM_APP_ID) config.steamAppId = Number(process.env.STEAM_APP_ID)
  if (process.argv.includes('--offline')) config.mode = 'offline'
  if (process.argv.includes('--online')) config.mode = 'online'
  if (process.argv.includes('--fullscreen')) config.fullscreen = true
  if (!/^https:\/\//i.test(String(config.onlineUrl || ''))) config.onlineUrl = ''
  return config
}

// 저장 데이터 위치를 이름과 무관하게 고정한다: %APPDATA%\cheonharo-desktop
// (Steam Auto-Cloud가 이 경로를 가리키므로 바꾸면 안 된다)
app.setPath('userData', path.join(app.getPath('appData'), 'cheonharo-desktop'))

// ---------------------------------------------------------------------------
// Steam 오버레이는 창이 만들어지기 전에 켜야 한다.
// ---------------------------------------------------------------------------
steam.enableOverlay()

protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}])

// 같은 게임을 두 번 띄우면 저장 데이터가 서로 덮어쓰일 수 있으므로 한 개만 허용한다.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
  app.whenReady().then(start)
}

app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => steam.shutdown())

// ---------------------------------------------------------------------------
// 오프라인용 app:// 프로토콜: 설치 폴더의 게임 파일을 고정된 출처로 제공한다.
// 출처가 고정되어 있어야 localStorage 저장 데이터가 실행할 때마다 유지된다.
// ---------------------------------------------------------------------------
function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async request => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 })
    // 오프라인에서는 온라인 API가 없다. 웹 클라이언트(manus-auth.js)는 이 응답을
    // 받으면 '오프라인' 상태로 전환하고 로컬 플레이를 계속한다.
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'online_preview_requires_checkpoint' }), {
        status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      })
    }
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    if (!relative) relative = 'index.html'
    const filePath = path.resolve(WEB_ROOT, relative)
    if (filePath !== WEB_ROOT && !filePath.startsWith(WEB_ROOT + path.sep)) return new Response('Forbidden', { status: 403 })
    const target = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(WEB_ROOT, 'index.html')
    return net.fetch(pathToFileURL(target).toString())
  })
}

// ---------------------------------------------------------------------------
// 온라인 서버 상태 확인
// ---------------------------------------------------------------------------
async function probeOnline(config) {
  if (!config.onlineUrl) return false
  try {
    const response = await net.fetch(new URL('/api/health', config.onlineUrl).toString(), {
      cache: 'no-store', signal: AbortSignal.timeout(config.healthTimeoutMs),
    })
    return response.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Steam 업적 IPC — 우리 게임 화면(app:// 또는 설정된 온라인 서버)에서 온 요청만 받는다.
// ---------------------------------------------------------------------------
function isTrustedSender(event, config) {
  const frameUrl = event.senderFrame?.url || ''
  if (frameUrl.startsWith(LOCAL_ORIGIN + '/')) return true
  if (!config.onlineUrl) return false
  try { return new URL(frameUrl).origin === new URL(config.onlineUrl).origin } catch { return false }
}

function registerIpc(config) {
  ipcMain.handle('steam:status', event => {
    if (!isTrustedSender(event, config)) return { available: false }
    return steam.status()
  })
  ipcMain.handle('steam:unlock', (event, ids) => {
    if (!isTrustedSender(event, config) || !Array.isArray(ids)) return []
    return steam.unlockAchievements(ids.filter(id => typeof id === 'string').slice(0, 32))
  })
}

// ---------------------------------------------------------------------------
// 창 만들기
// ---------------------------------------------------------------------------
function createWindow(config, hooks = {}) {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    backgroundColor: '#2a1810',
    title: '천하: 패왕의 시대',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    fullscreen: Boolean(config.fullscreen),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })
  win.setMenu(null)
  win.once('ready-to-show', () => { if (!config.fullscreen) win.maximize(); win.show() })

  // F11 또는 Alt+Enter로 전체 화면 전환
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
    }
  })

  // 새 창 요청(외부 링크 등)은 기본 브라우저로 연다.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // 같은 창 안에서는 https 이동(로그인 포털 → 서버 콜백)과 app:// 만 허용한다.
  // Manus 로그인 포털로 가는 이동은 기본 브라우저 로그인으로 바꾼다(Google이 앱 안 로그인을 막기 때문).
  win.webContents.on('will-navigate', (event, url) => {
    if (hooks.interceptLogin?.(url)) { event.preventDefault(); return }
    if (url.startsWith(LOCAL_ORIGIN + '/') || /^https:\/\//i.test(url)) return
    event.preventDefault()
  })
  return win
}

async function start() {
  const config = loadConfig()
  steam.init(config.steamAppId)
  registerAppProtocol()
  registerIpc(config)

  const online = config.mode !== 'offline' && await probeOnline(config)
  const onlineOrigin = online ? new URL(config.onlineUrl).origin : ''
  const desktopLogin = online && await browserLogin.supportsDesktopLogin(net.fetch, onlineOrigin)
  let pendingLogin = null
  let win = null

  // 로그인 포털(…/app-auth)로 이동하려 하면 기본 브라우저 로그인을 시작한다.
  function interceptLogin(url) {
    if (!desktopLogin) return false // 구버전 서버: 기존처럼 창 안에서 로그인
    let target
    try { target = new URL(url) } catch { return false }
    if (target.origin === onlineOrigin || !/\/app-auth\/?$/.test(target.pathname)) return false
    pendingLogin?.cancel()
    const title = win.getTitle()
    win.setTitle('천하: 패왕의 시대 — 브라우저에서 로그인하는 중…')
    const login = browserLogin.startBrowserLogin({ origin: onlineOrigin, fetch: net.fetch, openExternal: target2 => shell.openExternal(target2) })
    pendingLogin = login
    login.promise.then(async result => {
      await browserLogin.applySession(session.defaultSession, onlineOrigin, result)
      await win.loadURL(config.onlineUrl).catch(() => {})
      if (win.isMinimized()) win.restore()
      win.focus()
    }).catch(error => {
      if (error?.message === 'login_cancelled') return
      console.warn(`[cheonharo] 브라우저 로그인 실패: ${error?.message || error}`)
      void dialog.showMessageBox(win, { type: 'warning', title: '로그인', message: '로그인을 완료하지 못했습니다.', detail: '게임에서 로그인을 다시 시도해 주세요.' })
    }).finally(() => {
      if (pendingLogin === login) pendingLogin = null
      win.setTitle(title)
    })
    return true
  }

  win = createWindow(config, { interceptLogin })
  const offlineUrl = `${LOCAL_ORIGIN}/index.html`

  if (online) {
    console.log(`[cheonharo] 온라인 모드: ${config.onlineUrl}`)
    // 온라인 화면이 열리지 않으면 즉시 오프라인 게임으로 전환한다.
    // ERR_ABORTED(-3)는 페이지가 스스로 다른 주소로 이동할 때(로그인 등) 생기므로 무시한다.
    await win.loadURL(config.onlineUrl).catch(error => {
      if (error && (error.errno === -3 || error.code === 'ERR_ABORTED')) return
      console.warn(`[cheonharo] 온라인 화면 로드 실패 → 오프라인 모드: ${error?.message || error}`)
      return win.loadURL(offlineUrl)
    })
  } else {
    console.log('[cheonharo] 오프라인 모드')
    await win.loadURL(offlineUrl)
  }
}
