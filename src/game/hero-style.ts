// 선두 무장의 모습: 모든 무장은 말을 타고, 천명(5등급) 무장은 저마다의 의상 · 말 · 장식 · 기운 색을 갖는다.
import type { General } from './strategy'
import type { HandProp, StrikeKind } from './battle-rig'
import { SIGNATURE_WEAPONS } from './battle-rig'

/** 말 탄 무장 모델(모두 말 뼈대 + 사람 뼈대) */
export type HeroModel = 'lubu' | 'caocao' | 'zhugeliang' | 'cavalry' | 'tianming'

/** 몸에 다는 장식 */
export type Ornament = 'beard' | 'eyepatch' | 'pheasant' | 'plume'

export interface TianmingLook {
  /** 발밑 인장 · 불티 · 몸빛 색 */
  aura: number
  /** 등 깃발: 글자(한글) · 비단 두 색(그러데이션) · 글자색 */
  banner: { text: string; cloth: [string, string]; ink: string }
  /** 망토 색(없으면 망토 없음) */
  cape?: number
  ornaments?: Ornament[]
  /** 투구 술 색 */
  plume?: number
}

export interface HeroLook {
  model: HeroModel
  /** 공격 동작 종류(모델 기본값 대신) */
  kind?: StrikeKind
  /** 손에 쥐는 무기 */
  weapon?: HandProp
  /** 무장 전용 의상 텍스처(assets/models/skins/<이름>.jpg) */
  skin?: string
  tianming?: TianmingLook
}

/** 천명 무장마다의 모습 */
const TIANMING: Record<string, Partial<HeroLook> & { look: TianmingLook }> = {
  // 관우: 녹색 전포 · 대춧빛 얼굴 · 긴 수염 · 붉은 밤색 말 · 청룡언월도
  'guan-yu': { model: 'cavalry', skin: 'guan-yu', look: { aura: 0x6dffa8, banner: { text: '관', cloth: ['#174a2a', '#21683b'], ink: '#f3d27a' }, cape: 0x1d6b3c, ornaments: ['beard'] } },
  // 조운: 은빛 갑옷 · 흰 망토 · 흰 투구 술 · 백마 · 창
  'zhao-yun': { model: 'cavalry', skin: 'zhao-yun', look: { aura: 0xcfe4ff, banner: { text: '조', cloth: ['#e9ecef', '#fbfcfd'], ink: '#1d3a6b' }, cape: 0xeef1f5 } },
  // 제갈량: 학창의 · 윤건 · 깃부채 · 푸른 바람빛
  'zhuge-liang': { model: 'zhugeliang', look: { aura: 0x9fe8ff, banner: { text: '제갈', cloth: ['#e8efe9', '#f8fbf7'], ink: '#1e3b33' }, cape: 0xf2f4ef } },
  // 여포: 꿩 깃 두 가닥 · 붉은 망토 · 적토마 · 방천화극 · 핏빛 기운
  'lu-bu': { model: 'lubu', look: { aura: 0xff4b3a, banner: { text: '여', cloth: ['#1b1112', '#2d1416'], ink: '#ff6a4a' }, ornaments: ['pheasant'] } },
  // 주유: 흰 비단 · 붉은 갑옷 · 자줏빛 어깨걸이 · 회백마 · 적벽의 불빛
  'zhou-yu': { model: 'tianming', kind: 'slash', weapon: 'sword', look: { aura: 0xff9a3c, banner: { text: '주', cloth: ['#7a0f12', '#a3171a'], ink: '#f6d27a' }, cape: 0xa3171a } },
  // 사마의: 짙은 자줏빛 도포 · 금빛 테 · 흑마 · 보랏빛 기운
  'simayi': { model: 'zhugeliang', skin: 'simayi', look: { aura: 0xc48cff, banner: { text: '사마', cloth: ['#2a1838', '#3d2252'], ink: '#e7c56a' }, cape: 0x2f1b40 } },
  // 하후돈: 검푸른 쇠갑옷 · 왼눈 안대 · 남색 망토 · 흑마 · 창
  'xiahou-dun': { model: 'cavalry', skin: 'xiahou-dun', look: { aura: 0x7fa8ff, banner: { text: '하후', cloth: ['#141c33', '#1f2b4d'], ink: '#cfd8e6' }, cape: 0x1a2747, ornaments: ['eyepatch'] } },
}

/** 이름 없는 천명 무장: 금빛 천명 */
const DEFAULT_TIANMING: TianmingLook = { aura: 0xffc65a, banner: { text: '천명', cloth: ['#7a0f12', '#a3171a'], ink: '#f6d27a' } }

function baseLook(general: General): HeroLook {
  const weapon = SIGNATURE_WEAPONS[general.id]
  const top = general.grade === 5
  if (general.id === 'lu-bu') return { model: 'lubu' }
  if (general.id === 'cao-cao') return { model: 'caocao' }
  if (general.id === 'zhuge-liang' || general.role === '책사') return { model: 'zhugeliang' }
  const model: HeroModel = top ? 'tianming' : 'cavalry'
  // 보병 · 궁병 무장도 말을 탄다: 보병은 말 위에서 찌르고, 궁병은 말 위에서 활을 쏜다
  if (general.role === '보병') return { model, kind: 'thrust', weapon: weapon ?? 'spear' }
  if (general.role === '궁병') return { model, kind: 'shoot', weapon: 'bow' }
  return { model, weapon }
}

export function heroLook(general: General): HeroLook {
  const look = baseLook(general)
  if (general.grade !== 5) return look
  const special = TIANMING[general.id]
  if (!special) return { ...look, tianming: DEFAULT_TIANMING }
  const { look: tianming, ...rest } = special
  return { ...look, ...rest, tianming }
}
