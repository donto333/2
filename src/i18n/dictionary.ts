// 영어 사전: 화면 문구(en-ui.json, 한국어 원문 → 영어) + 시나리오 제목·이야기
import ui from './en-ui.json'
import { SCENARIOS } from '../game/scenarios'

const dictionary: Record<string, string> = { ...(ui as Record<string, string>) }
for (const scenario of SCENARIOS) {
  if (scenario.titleEn) dictionary[scenario.title] = scenario.titleEn
  if (scenario.storyEn && !dictionary[scenario.story]) dictionary[scenario.story] = scenario.storyEn
}
// 화면에서 버튼의 꾸밈 기호(→ ↻ ↗ ✦ …)를 걷어 내므로, 기호를 뗀 문구도 같은 뜻으로 등록한다
const ORNAMENT_TAIL = /\s*[→↗↻✎›»]\s*$/
const ORNAMENT_HEAD = /^\s*[✦⚒✎]\s+/
for (const [key, value] of Object.entries({ ...dictionary })) {
  const bare = key.replace(ORNAMENT_TAIL, '').replace(ORNAMENT_HEAD, '')
  if (bare !== key && bare && !dictionary[bare]) dictionary[bare] = value.replace(ORNAMENT_TAIL, '').replace(ORNAMENT_HEAD, '')
}
export const EN_DICTIONARY: Readonly<Record<string, string>> = dictionary
