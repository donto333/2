// 주간 레이드 보스: 주마다 바뀌는 이름난 군단(보통 난이도). 병력은 줄지 않고(무한 체력) 90초 동안 준 피해를 겨룬다.
import { RAID_DEFAULT_LEVEL, raidWeekKey } from '../../server/raid.mjs'
import { frontLineOrder, scaleGeneral, templateGeneral, type General } from './strategy'

export interface RaidBoss { id: string; name: string; desc: string; members: string[] }

/** 주마다 돌아가며 나오는 보스 군단(가운데는 수호형 또는 가장 단단한 무장) */
export const RAID_BOSSES: RaidBoss[] = [
  { id: 'dong-zhuo-army', name: '동탁 · 서량 철기', desc: '낙양을 장악한 폭군과 천하무적의 비장', members: ['dong-zhuo', 'lu-bu', 'han-sui'] },
  { id: 'yellow-turban', name: '황건 대방', desc: '창천은 이미 죽었다 · 태평도의 세 형제', members: ['zhang-jiao', 'zhang-liang', 'zhang-bo'] },
  { id: 'yuan-shao-host', name: '원소 · 하북 대군', desc: '사세삼공의 명문과 하북의 두 맹장', members: ['yuan-shao', 'yan-liang', 'wen-chou'] },
  { id: 'nanman', name: '남만 왕', desc: '일곱 번 잡혀도 일어서는 남방의 왕', members: ['meng-huo', 'zhu-rong', 'gao-shun'] },
  { id: 'wei-guard', name: '위 · 호위 친군', desc: '조조의 곁을 지키는 철벽 근위', members: ['cao-cao', 'dian-wei', 'xu-chu'] },
  { id: 'wu-fire', name: '오 · 적벽의 불', desc: '동남풍을 탄 강동의 화공', members: ['zhou-yu', 'huang-gai', 'lu-xun'] },
]

const hash = (text: string) => [...text].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 11)

export function raidBossFor(weekKey = raidWeekKey()): RaidBoss {
  return RAID_BOSSES[hash(weekKey) % RAID_BOSSES.length]
}

/** 보스 덱: 서버가 정한 레벨, 보통 난이도(시나리오와 같은 성급 규칙) */
export function raidBossDeck(level = RAID_DEFAULT_LEVEL, weekKey = raidWeekKey()): General[] {
  const boss = raidBossFor(weekKey)
  const lv = Math.max(1, Math.min(60, Math.round(level)))
  const stars = Math.min(5, 1 + Math.floor(lv / 12))
  const generals = boss.members.map(id => templateGeneral(id)).filter((general): general is General => Boolean(general))
    .map(general => ({ ...scaleGeneral({ ...general, level: 1, stars: 1 }, lv, stars), id: general.id, skillUnlocked: lv >= 6 }))
  return frontLineOrder(generals)
}

/** 하루 3회(게스트 연습용 기록) */
export interface RaidLocalState { dayKey: string; attempts: number; weekKey: string; total: number; best: number }
