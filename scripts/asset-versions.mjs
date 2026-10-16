// 모델 · 의상 · 소리 파일의 내용 해시를 src/asset-versions.json에 적는다(빌드 전에 실행).
// 게임은 이 해시를 주소 뒤에 붙여(?v=…) 파일을 고쳐 올려도 CDN · 브라우저가 옛 파일을 내주지 않게 한다.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = 'public/assets', out = {}
const walk = dir => {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.(glb|jpg|png|mp3)$/i.test(name)) out['/assets/' + relative(root, path).split('\\').join('/')] = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 10)
  }
}
walk(join(root, 'models')); walk(join(root, 'sfx')); walk(join(root, 'music'))
writeFileSync('src/asset-versions.json', JSON.stringify(out, null, 1) + '\n')
console.log(`자산 해시: ${Object.keys(out).length}개`)
