import { loadEnv } from 'vite'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig } from 'vitest/config'

// 모델 · 소리 파일 주소에 내용 해시를 붙인다(?v=…): 같은 주소의 파일을 바꿔도 CDN · 브라우저가 옛 파일을 쓰지 않게
function assetVersions(): Record<string, string> {
  const root = 'public/assets', out: Record<string, string> = {}
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(glb|jpg|png|mp3)$/i.test(name)) out['/assets/' + relative(root, path).split('\\').join('/')] = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 10)
    }
  }
  try { walk(root) } catch { /* 자산 폴더가 없으면 해시 없이 */ }
  return out
}

// Relative base keeps production output portable; the Session owns preview HOST/PORT.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['HOST', 'PORT'])
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return {
    base: './',
    define: { __ASSET_V__: JSON.stringify(assetVersions()) },
    server: {
      host: env.HOST ?? '127.0.0.1', port, strictPort: true,
      allowedHosts: ['.manuspre.computer', '.manus.computer', '.manus-asia.computer', '.manuscomputer.ai', '.manusvm.computer', 'localhost', '127.0.0.1'],
      proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } },
    },
    build: { target: 'es2022', rollupOptions: { input: { main: 'index.html', balance: 'balance.html' } }, assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false },
    test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
  }
})
