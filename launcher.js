#!/usr/bin/env node
const { execFile } = require('node:child_process')

const DEFAULT_URL = 'https://3000-iqwgbi3mu07k8qg56opws-8cae5fc6.sg2.manus.computer/'
const override = process.argv.find(arg => arg.startsWith('--url='))
const url = override ? override.slice('--url='.length) : process.env.CHEONHARO_URL || DEFAULT_URL

if (!/^https?:\/\//i.test(url)) {
  console.error('Invalid game URL. Use --url=https://...')
  process.exit(1)
}

execFile('cmd.exe', ['/c', 'start', '', url], error => {
  if (error) {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], fallbackError => {
      if (fallbackError) {
        console.error(`Could not open the game URL: ${url}`)
        process.exitCode = 1
      }
    })
  }
})
