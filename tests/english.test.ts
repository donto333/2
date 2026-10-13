import { describe, expect, it } from 'vitest'
import ui from '../src/i18n/en-ui.json'
import { EN_DICTIONARY } from '../src/i18n/dictionary'
import { toEnglish } from '../src/i18n/translate'
import { SCENARIOS } from '../src/game/scenarios'
import { allGenerals } from '../src/game/strategy'

const HANGUL = /[가-힣]/
const HANJA = /[㐀-鿿]/
const slots = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort().join()

describe('영문판 사전', () => {
  it('모든 번역에 한글·한자가 없고, 바뀌는 자리({0}…)가 원문과 같다', () => {
    for (const [key, value] of Object.entries(ui as Record<string, string>)) {
      expect(HANGUL.test(value), `${key} → ${value}`).toBe(false)
      expect(HANJA.test(value), `${key} → ${value}`).toBe(false)
      expect(slots(value), key).toBe(slots(key))
    }
  })
  it('시나리오 제목·이야기와 무장 이름이 모두 영어로 바뀐다', () => {
    SCENARIOS.forEach(scenario => {
      expect(EN_DICTIONARY[scenario.title]).toBe(scenario.titleEn)
      expect(HANGUL.test(toEnglish(scenario.story))).toBe(false)
    })
    allGenerals().forEach(general => expect(HANGUL.test(toEnglish(general.name)), general.name).toBe(false))
  })
  it('틀과 구분자로 이어 붙인 문장도 번역한다', () => {
    expect(toEnglish('작전 개시 · 적 장각 · 장보 · 장량')).toBe('Battle begins · enemy Zhang Jue · Zhang Bao · Zhang Liang')
    expect(toEnglish('별 3개')).toBe('3 stars')
    expect(toEnglish('전투 시작 시 적 공포 3초 (3성에서 열림)')).toBe('Enemy Fear 3s at battle start (unlocks at 3★)')
  })
  it('번역하지 못하는 글(사용자 이름 등)은 원문 그대로 둔다', () => {
    expect(toEnglish('홍길동')).toBe('홍길동')
    expect(toEnglish('Lv.5')).toBe('Lv.5')
  })
})
