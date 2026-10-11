// 게임 화면에 최소한의 Steam API만 노출한다 (Node.js 접근 없음).
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('CheonharoDesktop', Object.freeze({
  platform: 'steam-desktop',
  steamStatus: () => ipcRenderer.invoke('steam:status'),
  unlockAchievements: ids => ipcRenderer.invoke('steam:unlock', Array.isArray(ids) ? ids.map(String) : []),
}))
