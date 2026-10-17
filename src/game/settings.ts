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

// ── 소리: 배경음악 · 효과음 크기(끔/작게/보통/크게) ──
export type SoundLevel = 'off' | 'low' | 'mid' | 'high'
export const SOUND_LEVEL_VALUE: Record<SoundLevel, number> = { off: 0, low: 0.35, mid: 0.7, high: 1 }
const MUSIC_KEY = 'cheonharo.music'
const SFX_KEY = 'cheonharo.sfx'
const MUTE_KEY = 'cheonharo.mute'
const level = (value: string | null): SoundLevel => value === 'off' || value === 'low' || value === 'high' ? value : 'mid'
export function musicSetting(): SoundLevel { return level(read(MUSIC_KEY)) }
export function sfxSetting(): SoundLevel { return level(read(SFX_KEY)) }
export function setMusicSetting(value: SoundLevel): void { write(MUSIC_KEY, value === 'mid' ? 'auto' : value) }
export function setSfxSetting(value: SoundLevel): void { write(SFX_KEY, value === 'mid' ? 'auto' : value) }
/** 상단 🔊 버튼: 모든 소리를 한 번에 끄고 켠다(음악·효과음 크기 설정은 그대로) */
export function muteSetting(): boolean { return read(MUTE_KEY) === '1' }
export function setMuteSetting(on: boolean): void { write(MUTE_KEY, on ? '1' : 'auto') }
