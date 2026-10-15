// 선두 무장의 모습: 모든 무장은 말을 타고, 천명(5등급) 무장은 저마다의 의상 · 말 · 장식 · 기운 색을 갖는다.
import type { General } from './strategy'
import type { HandProp, StrikeKind } from './battle-rig'
import { SIGNATURE_WEAPONS } from './battle-rig'

/** 말 탄 무장 모델(모두 말 뼈대 + 사람 뼈대) */
export type HeroModel = 'lubu' | 'caocao' | 'zhugeliang' | 'cavalry' | 'tianming'

/** 몸에 다는 장식 */
export type Ornament = 'beard' | 'eyepatch' | 'pheasant'

export interface TianmingLook {
  /** 발밑 인장 · 불티 · 몸빛 색 */
  aura: number
  /** 등 깃발: 글자(한글) · 비단 두 색(그러데이션) · 글자색 */
  banner: { text: string; cloth: [string, string]; ink: string }
  /** 망토 색(없으면 망토 없음) · 테두리 금실 색 */
  cape?: number
  capeTrim?: number
  ornaments?: Ornament[]
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
  // 관우: 짙은 녹색 전포 · 녹칠 갑옷 · 붉은 기 도는 얼굴 · 긴 수염 · 밤색 말 · 청룡언월도
  'guan-yu': { model: 'cavalry', skin: 'guan-yu', look: { aura: 0x9fe0b4, banner: { text: '관', cloth: ['#2f5239', '#3a6446'], ink: '#d9bf7a' }, cape: 0x2f4a33, ornaments: ['beard'] } },
  // 조운: 은빛 갑옷 · 흰 비단 · 생성빛 망토 · 백마 · 창
  'zhao-yun': { model: 'cavalry', skin: 'zhao-yun', look: { aura: 0xd6e2f0, banner: { text: '조', cloth: ['#d8d4c8', '#e4e0d4'], ink: '#1f2e45' }, cape: 0xd9d5c9 } },
  // 제갈량: 학창의 · 윤건 · 깃부채 · 생성빛 망토
  'zhuge-liang': { model: 'zhugeliang', look: { aura: 0xbfe6f0, banner: { text: '제갈', cloth: ['#dcd9cc', '#e6e3d6'], ink: '#22302a' }, cape: 0xdedbcf } },
  // 여포: 꿩 꽁지깃 두 가닥 · 붉은 망토(모델) · 적토마 · 방천화극
  'lu-bu': { model: 'lubu', look: { aura: 0xff7a5c, banner: { text: '여', cloth: ['#2a1d1f', '#3a2426'], ink: '#b8402c' }, ornaments: ['pheasant'] } },
  // 주유: 흰 비단 · 붉은 칠갑 · 자줏빛 어깨걸이 · 꼭두서니 망토 · 회백마
  'zhou-yu': { model: 'tianming', skin: 'zhou-yu', kind: 'slash', weapon: 'sword', look: { aura: 0xffb070, banner: { text: '주', cloth: ['#6e1a17', '#86221d'], ink: '#d8b766' }, cape: 0x7a1f1c } },
  // 사마의: 검자줏빛 도포 · 금빛 테 · 흑마
  'simayi': { model: 'zhugeliang', skin: 'simayi', look: { aura: 0xcdb2ef, banner: { text: '사마', cloth: ['#3d2d45', '#4a3754'], ink: '#cdb06a' }, cape: 0x3a2b40 } },
  // 하후돈: 검푸른 쇠갑옷 · 왼눈 가죽 안대 · 쪽빛 망토 · 흑마 · 창
  'xiahou-dun': { model: 'cavalry', skin: 'xiahou-dun', look: { aura: 0xb2c4e6, banner: { text: '하후', cloth: ['#2a3550', '#34405e'], ink: '#c9ccd2' }, cape: 0x26324a, ornaments: ['eyepatch'] } },
}

/** 이름 없는 천명 무장: 금빛 천명 */
const DEFAULT_TIANMING: TianmingLook = { aura: 0xffd08a, banner: { text: '천명', cloth: ['#6e1a17', '#86221d'], ink: '#d8b766' } }

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
