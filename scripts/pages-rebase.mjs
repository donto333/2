// GitHub Pages(https://<user>.github.io/<repo>/)용 빌드 보정.
// 게임 코드는 이미지 경로를 '/assets/...'처럼 사이트 루트 기준으로 쓴다(Electron app://, Manus는 루트에서 열리므로 문제없음).
// Pages는 '/<repo>/' 아래에서 열리므로 dist 안의 JS·CSS·HTML에서 그런 경로 앞에 '/<repo>'를 붙인다.
// 사용: node scripts/pages-rebase.mjs dist /2/
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const [dir = 'dist', base = '/'] = process.argv.slice(2)
if (!/^\/([\w.-]+\/)*$/.test(base)) throw new Error(`base는 /repo/ 형태여야 합니다: ${base}`)
const prefix = base.replace(/\/$/, '')
const pattern = /(["'`(])\/(assets|fonts)\//g
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
let files = 0, hits = 0
for (const file of walk(dir)) {
  if (!['.js', '.css', '.html'].includes(extname(file))) continue
  const text = readFileSync(file, 'utf8')
  const next = text.replace(pattern, (_, q, folder) => { hits++; return `${q}${prefix}/${folder}/` })
  if (next !== text) { writeFileSync(file, next); files++ }
}
console.log(`Pages 경로 보정: ${files}개 파일, ${hits}곳 → ${prefix}/assets/`)
