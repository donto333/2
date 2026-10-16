// 자산 주소에 내용 해시를 붙인다: 파일을 고쳐 올려도 CDN · 브라우저 캐시가 옛 모델 · 소리를 내주지 않게 한다.
declare const __ASSET_V__: Record<string, string> | undefined

const versions: Record<string, string> = typeof __ASSET_V__ === 'object' && __ASSET_V__ ? __ASSET_V__ : {}

/** '/assets/models/lubu.glb' → '/assets/models/lubu.glb?v=1a2b3c4d5e' */
export function assetUrl(path: string): string {
  const v = versions[path]
  return v ? `${path}?v=${v}` : path
}
