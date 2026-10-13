// 영어 사전: 화면 문구(en-ui.json, 한국어 원문 → 영어) + 시나리오 제목·이야기
import ui from './en-ui.json'
import { SCENARIOS } from '../game/scenarios'

const dictionary: Record<string, string> = { ...(ui as Record<string, string>) }
for (const scenario of SCENARIOS) {
  if (scenario.titleEn) dictionary[scenario.title] = scenario.titleEn
  if (scenario.storyEn && !dictionary[scenario.story]) dictionary[scenario.story] = scenario.storyEn
}
export const EN_DICTIONARY: Readonly<Record<string, string>> = dictionary
