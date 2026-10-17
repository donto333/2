// 자산 주소에 내용 해시를 붙인다: 파일을 고쳐 올려도 CDN · 브라우저 캐시가 옛 모델 · 소리를 내주지 않게 한다.
// 해시는 빌드 전에 scripts/asset-versions.mjs가 src/asset-versions.json에 적는다.
import versions from './asset-versions.json'

const table = versions as Record<string, string>

/** '/assets/models/lubu.glb' → '/assets/models/lubu.glb?v=1a2b3c4d5e' */
export function assetUrl(path: string): string {
  const v = table[path]
  return v ? `${path}?v=${v}` : path
}
