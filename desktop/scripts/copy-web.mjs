// 루트에서 빌드한 웹 게임(dist/)을 데스크톱 앱 폴더(desktop/app/)로 복사한다.
// 사용: 루트에서 `pnpm run manus:build-source` 후 `cd desktop && npm run copy-web`
import { cpSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(desktopDir, '..', 'dist')
const target = join(desktopDir, 'app')

if (!existsSync(join(source, 'index.html'))) {
  console.error('dist/index.html이 없습니다. 먼저 저장소 루트에서 `pnpm run manus:build-source`를 실행하세요.')
  process.exit(1)
}

rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true })
console.log(`웹 게임 복사 완료: ${readdirSync(target).length}개 항목 → desktop/app`)
