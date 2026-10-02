import { spawn } from 'node:child_process'

const root = process.cwd()
const env = { ...process.env }
const apiPort = Number(env.API_PORT ?? 3001)
const children = []

const api = spawn(process.execPath, ['index.mjs'], {
  cwd: `${root}/server`,
  env: { ...env, PORT: String(apiPort) },
  stdio: 'inherit',
})
children.push(api)

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
  cwd: root,
  env: { ...env, PORT: env.PORT ?? '3000', HOST: env.HOST ?? '0.0.0.0' },
  stdio: 'inherit',
})
children.push(vite)

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 300)
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`online development process stopped (${signal ?? code ?? 'unknown'})`)
      shutdown(code ?? 1)
    }
  })
}

process.once('SIGINT', () => shutdown(0))
process.once('SIGTERM', () => shutdown(0))
