// 이 기기에서만 쓰는 화면 설정(그래픽 품질 · 전투 효과). 저장소를 못 쓰면 자동으로 동작한다.
export type QualitySetting = 'auto' | 'high' | 'low'
export type EffectsSetting = 'auto' | 'full' | 'reduced'

const QUALITY_KEY = 'cheonharo.quality'
const EFFECTS_KEY = 'cheonharo.effects'

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string): void {
  try { if (value === 'auto') localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* 저장 불가: 이번 접속에만 적용 */ }
}

export function qualitySetting(): QualitySetting {
  const value = read(QUALITY_KEY)
  return value === 'high' || value === 'low' ? value : 'auto'
}
export function setQualitySetting(value: QualitySetting): void { write(QUALITY_KEY, value) }

export function effectsSetting(): EffectsSetting {
  const value = read(EFFECTS_KEY)
  return value === 'full' || value === 'reduced' ? value : 'auto'
}
export function setEffectsSetting(value: EffectsSetting): void { write(EFFECTS_KEY, value) }
