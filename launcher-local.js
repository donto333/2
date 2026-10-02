#!/usr/bin/env node
const http = require('node:http')
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')

const ONLINE_URL = process.env.CHEONHARO_ONLINE_URL || 'https://cheonharo-ldzrvuvj.manus.game/'
const root = path.join(__dirname, 'dist')
const requestedPort = Number(process.argv.find(arg => arg.startsWith('--port='))?.slice(7) || 0)
const modeArg = process.argv.find(arg => arg.startsWith('--mode='))?.slice(7)
const requestedMode = process.argv.includes('--online') ? 'online' : process.argv.includes('--offline') ? 'offline' : modeArg || 'auto'

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

function openBrowser(url) {
  if (process.platform === 'win32') return execFile('cmd.exe', ['/c', 'start', '', url])
  if (process.platform === 'darwin') return execFile('open', [url])
  return execFile('xdg-open', [url])
}

function probeOnline() {
  return new Promise(resolve => {
    if (!/^https?:\/\//i.test(ONLINE_URL)) {
      resolve(false)
      return
    }
    const client = ONLINE_URL.startsWith('https:') ? https : http
    const request = client.get(new URL('/api/health', ONLINE_URL), response => {
      response.resume()
      resolve(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 400))
    })
    request.setTimeout(5000, () => { request.destroy(); resolve(false) })
    request.on('error', () => resolve(false))
  })
}

function openOnline() {
  console.log(`천하 온라인 모드: ${ONLINE_URL}`)
  openBrowser(ONLINE_URL)
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/')
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const candidate = path.resolve(root, relative)
  return candidate.startsWith(path.resolve(root) + path.sep) ? candidate : null
}

const server = http.createServer((request, response) => {
  const filePath = safePath(request.url || '/')
  if (!filePath) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      const fallback = path.join(root, 'index.html')
      fs.readFile(fallback, (fallbackError, fallbackData) => {
        if (fallbackError) {
          response.writeHead(500)
          response.end('Game files are missing')
          return
        }
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end(fallbackData)
      })
      return
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    response.end(data)
  })
})

function startOffline() {
  server.listen(Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 0, '127.0.0.1', () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 4173
    const url = `http://127.0.0.1:${port}/`
    console.log(`천하 오프라인 모드: ${url}`)
    openBrowser(url)
  })
}

if (requestedMode === 'offline') {
  startOffline()
} else if (requestedMode === 'online') {
  probeOnline().then(available => {
    if (available) openOnline()
    else startOffline()
  })
} else {
  probeOnline().then(available => {
    if (available) openOnline()
    else startOffline()
  })
}

function shutdown() {
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
