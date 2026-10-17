// 출석 체크 이벤트(서버 · 게임이 함께 쓰는 원본 표).
// 처음 출석한 날부터 하루에 한 번(한국 날짜) 접속하면 다음 날짜의 보상을 받는다. 1~7일(첫 주) + 8~37일(30일), 모두 37일.
// 금화 · 신화 조각 · 낙양 강화석은 서버가 지급하고, 나머지(무장 · 무료 뽑기 · 옥패 · 은전 · 병서 · 자원)는 게임이 지급한다.
// 필드: general(무장 id) · randomLegend(천명 무장 무작위) · freeRecruits · freeDraws · gold · silver · honor · manuals · resources(식량·목재·철 각각) · fragments · stones
export const ATTENDANCE_REWARDS = [
  { day: 1, label: '조인 무장 획득', general: 'cao-ren' },
  { day: 2, label: '무장 뽑기 무료 50회', freeRecruits: 50 },
  { day: 3, label: '장비 뽑기 무료 50회', freeDraws: 50 },
  { day: 4, label: '금화 100개', gold: 100 },
  { day: 5, label: '은전 50,000', silver: 50000 },
  { day: 6, label: '병서 500권', manuals: 500 },
  { day: 7, label: '조운 무장 획득', general: 'zhao-yun' },
  { day: 8, label: '옥패 1,000', honor: 1000 },
  { day: 9, label: '은전 20,000', silver: 20000 },
  { day: 10, label: '무장 뽑기 무료 10회', freeRecruits: 10 },
  { day: 11, label: '병서 150권', manuals: 150 },
  { day: 12, label: '식량 · 목재 · 철 각 20,000', resources: 20000 },
  { day: 13, label: '장비 뽑기 무료 10회', freeDraws: 10 },
  { day: 14, label: '금화 30개', gold: 30 },
  { day: 15, label: '옥패 1,500', honor: 1500 },
  { day: 16, label: '은전 30,000', silver: 30000 },
  { day: 17, label: '무장 뽑기 무료 10회', freeRecruits: 10 },
  { day: 18, label: '병서 200권', manuals: 200 },
  { day: 19, label: '식량 · 목재 · 철 각 30,000', resources: 30000 },
  { day: 20, label: '장비 뽑기 무료 10회', freeDraws: 10 },
  { day: 21, label: '신화장비 조각 10개', fragments: 10 },
  { day: 22, label: '옥패 2,000', honor: 2000 },
  { day: 23, label: '은전 40,000', silver: 40000 },
  { day: 24, label: '무장 뽑기 무료 10회', freeRecruits: 10 },
  { day: 25, label: '병서 250권', manuals: 250 },
  { day: 26, label: '식량 · 목재 · 철 각 40,000', resources: 40000 },
  { day: 27, label: '장비 뽑기 무료 10회', freeDraws: 10 },
  { day: 28, label: '금화 50개', gold: 50 },
  { day: 29, label: '옥패 3,000', honor: 3000 },
  { day: 30, label: '은전 50,000', silver: 50000 },
  { day: 31, label: '무장 뽑기 무료 20회', freeRecruits: 20 },
  { day: 32, label: '병서 300권', manuals: 300 },
  { day: 33, label: '낙양 강화석 1개', stones: 1 },
  { day: 34, label: '장비 뽑기 무료 20회', freeDraws: 20 },
  { day: 35, label: '신화장비 조각 10개', fragments: 10 },
  { day: 36, label: '금화 80개', gold: 80 },
  { day: 37, label: '천명(5등급) 무장 1명', randomLegend: true },
]
export const ATTENDANCE_DAYS = ATTENDANCE_REWARDS.length
export function attendanceReward(day) {
  return ATTENDANCE_REWARDS.find(reward => reward.day === day) ?? null
}
/** 서버 장부 재화(금화 · 신화 조각 · 낙양 강화석) */
export function attendanceLedger(day) {
  const reward = attendanceReward(day)
  return { gold: reward?.gold ?? 0, fragments: reward?.fragments ?? 0, stones: reward?.stones ?? 0 }
}
/** 다음 출석: 오늘 이미 받았거나 끝났으면 null, 아니면 받을 날짜 번호 */
export function nextAttendanceDay(record, today) {
  const count = Math.max(0, Math.trunc(Number(record?.count) || 0))
  if (record?.last === today || count >= ATTENDANCE_DAYS) return null
  return count + 1
}
