// 재화 획득 밸런스 — 클라이언트와 서버가 함께 읽는 단일 원본.
// 설계: 시나리오 최초 클리어 금화로 무장을 키우면(금화 → 병서·은전 → 레벨) 4장(적벽)·6장(남정)·8장(최종)에서 성장이 정체된다.
// 정체 구간은 구매 금화, 영토전(최종 세력전) 금화, 또는 며칠의 일일 플레이로 돌파한다. 근거는 밸런스 페이지의 ‘성장 곡선’.

/** 장별 시나리오 최초 클리어 금화(1회당) */
export const SCENARIO_GOLD_BY_CHAPTER = [11, 12, 12, 13, 54, 68, 72, 80]
/** 장별 시나리오 최초 클리어 옥패·은전·병서(금화보다 작게: 성장의 중심은 금화) */
export const SCENARIO_HONOR_BY_CHAPTER = [200, 250, 300, 350, 400, 450, 500, 550]
export const SCENARIO_SILVER_BY_CHAPTER = [2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]
export const SCENARIO_MANUALS_BY_CHAPTER = [20, 30, 40, 50, 60, 70, 80, 90]

export function scenarioGold(chapterIndex) {
  const index = Math.max(0, Math.min(SCENARIO_GOLD_BY_CHAPTER.length - 1, Math.trunc(Number(chapterIndex) || 0)))
  return SCENARIO_GOLD_BY_CHAPTER[index]
}

/** 병서 상점(금화 → 병서). 무장 레벨업의 핵심 재료라 금화가 곧 성장으로 이어진다 */
export const MANUAL_PACKAGE_AMOUNTS = [[3, 30], [10, 110], [20, 240], [50, 650], [100, 1400]]

/** 시나리오 밖 일반 전투 승리 보상: 하루 횟수 제한(무한 반복으로 정체 구간을 넘지 않게) */
export const REPEAT_BATTLE_DAILY_LIMIT = 5
export const REPEAT_BATTLE_HONOR = 100
export const REPEAT_BATTLE_SILVER = 1200
