// Steamworks 연동 (steamworks.js)
// Steam 클라이언트가 꺼져 있거나 라이브러리를 불러오지 못해도 게임은 계속 실행되도록
// 모든 호출을 안전하게 감싼다.
'use strict'

const path = require('node:path')
const fs = require('node:fs')

let steamworks = null
let client = null
let appId = 0
let lastError = ''
let achievementMap = {}

try {
  steamworks = require('steamworks.js')
} catch (error) {
  lastError = `steamworks.js 로드 실패: ${error.message}`
}

function loadAchievementMap(id) {
  try {
    const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'steam-achievements.json'), 'utf8'))
    // 테스트 App ID(480 Spacewar)에는 우리 업적이 없으므로 Spacewar 업적 이름으로 바꿔 시험한다.
    return file.appIdOverrides?.[String(id)] || {}
  } catch {
    return {}
  }
}

function enableOverlay() {
  try { steamworks?.electronEnableSteamOverlay() } catch (error) { lastError = `오버레이 활성화 실패: ${error.message}` }
}

function init(id) {
  appId = Number(id) || 0
  achievementMap = loadAchievementMap(appId)
  if (!steamworks) return false
  try {
    client = steamworks.init(appId || undefined)
    console.log(`[steam] 초기화 완료 · App ID ${appId} · ${safe(() => client.localplayer.getName(), '')}`)
    return true
  } catch (error) {
    client = null
    lastError = `Steam 초기화 실패(Steam 실행 여부 확인): ${error.message}`
    console.warn(`[steam] ${lastError}`)
    return false
  }
}

function safe(fn, fallback) {
  try { return fn() } catch { return fallback }
}

function status() {
  return {
    available: Boolean(client),
    appId,
    playerName: client ? safe(() => client.localplayer.getName(), '') : '',
    error: client ? '' : lastError,
  }
}

function unlockAchievements(ids) {
  if (!client) return []
  const unlocked = []
  for (const id of ids) {
    const apiName = achievementMap[id] || id
    if (!/^[A-Za-z0-9_]{1,64}$/.test(apiName)) continue
    const already = safe(() => client.achievement.isActivated(apiName), false)
    if (already) continue
    if (safe(() => client.achievement.activate(apiName), false)) unlocked.push(id)
  }
  if (unlocked.length) safe(() => client.stats?.store?.(), false)
  return unlocked
}

function shutdown() {
  // steamworks.js는 프로세스 종료 시 SteamAPI_Shutdown을 자동으로 호출한다.
  client = null
}

module.exports = { enableOverlay, init, status, unlockAchievements, shutdown }
