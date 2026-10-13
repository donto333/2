// 게임 언어: 한국어(기본) · 영어. 기기마다 저장하고, 바꾸면 화면을 다시 불러온다.
export type Lang = 'ko' | 'en'
const KEY = 'cheonharo.lang'

function detect(): Lang {
  try {
    const saved = globalThis.localStorage?.getItem(KEY)
    if (saved === 'ko' || saved === 'en') return saved
  } catch { /* 저장소를 못 쓰는 환경 */ }
  const browser = (globalThis.navigator?.language ?? 'ko').toLowerCase()
  return browser.startsWith('ko') ? 'ko' : 'en'
}

/** 지금 화면 언어(불러올 때 한 번 정해진다) */
export const LANG: Lang = detect()
export const isEnglish = (): boolean => LANG === 'en'
/** 날짜·숫자 표기용 지역 */
export const locale = (): string => (LANG === 'en' ? 'en-US' : 'ko-KR')

export function setLang(lang: Lang): void {
  if (lang === LANG) return
  try { globalThis.localStorage?.setItem(KEY, lang) } catch { /* 무시 */ }
  globalThis.location?.reload()
}
