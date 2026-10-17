// 선두 무장의 모습: 모든 무장은 말을 타고, 천명(5등급) 무장은 저마다의 의상 · 말 · 장식 · 기운 색을 갖는다.
import type { General } from './strategy'
import type { HandProp, StrikeKind } from './battle-rig'
import { SIGNATURE_WEAPONS } from './battle-rig'
import { heroDress, type HeroDress } from './hero-dress'

/** 말 탄 무장 모델(모두 말 뼈대 + 사람 뼈대) */
export type HeroModel = 'lubu' | 'caocao' | 'zhugeliang' | 'cavalry' | 'tianming'

/** 몸에 다는 장식 */
export type Ornament = 'hairBun' | 'beard' | 'whiteBeard' | 'shortBeard' | 'headband' | 'eyepatch' | 'pheasant'

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
  /** 초상화를 따른 차림새(옷 · 갑옷 · 말 색 · 수염 · 두건 · 망토) — 전용 의상 · 전용 모델이 없는 무장 */
  dress?: HeroDress
  /** 초상화에서 잘라낸 얼굴 그림(머리 앞면에 비춘다) */
  face?: string
  /** 전용 기수 모델(assets/models/riders/<이름>.glb) — 기마 모델의 말 · 동작에 사람만 바꿔 태운다 */
  rider?: string
}

/** 천명 무장 전용 기수 모델(Tripo로 만든 원본 모델을 기마 모델 자세에 맞춰 구움, 2026.10.17) — 천명 16명 모두 */
export const TIANMING_RIDERS = new Set(['guan-yu', 'zhao-yun', 'zhuge-liang', 'lu-bu', 'zhou-yu', 'simayi', 'xiahou-dun', 'liu-bei', 'cao-cao', 'sun-quan', 'sun-ce', 'lu-xun', 'zhang-liao', 'yuan-shao', 'dong-zhuo', 'zhang-jiao'])
/** 전용 기수 모델이 있는 무장(여성 무장 + 천명 무장) — rider-models.ts */
export const RIDER_MODELS = new Set(['sun-shangxiang', 'xiao-qiao', 'guan-yinping', 'zhu-rong', 'diao-chan', 'da-qiao', 'cai-wenji', ...TIANMING_RIDERS])
/** 전용 기수 무장이 손에 쥐는 것: 책사는 깃부채(주유는 검) */
const RIDER_WEAPON: Record<string, HandProp> = { 'zhuge-liang': 'fan', simayi: 'fan', 'zhou-yu': 'sword', 'lu-xun': 'sword', 'liu-bei': 'sword', 'cao-cao': 'sword', 'sun-quan': 'sword', 'yuan-shao': 'sword', 'dong-zhuo': 'sword', 'zhang-jiao': 'fan', 'lu-bu': 'halberd' }

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
  const model: HeroModel = top ? 'tianming' : 'cavalry'
  // 여성 책사(초선 · 채문희)는 수염 달린 책사 모델 대신 말 탄 모델(투구를 머리 모양으로 오므린다 — hero-dress)
  if (general.role === '책사' && heroDress(general.id)?.female) return { model, weapon }
  if (general.id === 'zhuge-liang' || general.role === '책사') return { model: 'zhugeliang' }
  // 보병 · 궁병 무장도 말을 탄다: 보병은 말 위에서 찌르고, 궁병은 말 위에서 활을 쏜다
  if (general.role === '보병') return { model, kind: 'thrust', weapon: weapon ?? 'spear' }
  if (general.role === '궁병') return { model, kind: 'shoot', weapon: 'bow' }
  return { model, weapon }
}

export function heroLook(general: General): HeroLook {
  // 전용 기수 모델: 기마 모델(말 · 동작)에 그 무장의 몸을 태운다 → 재채색 · 얼굴 비춤은 쓰지 않는다
  if (RIDER_MODELS.has(general.id)) {
    const base = baseLook(general)
    const special = TIANMING[general.id]
    const weapon = RIDER_WEAPON[general.id] ?? special?.weapon ?? SIGNATURE_WEAPONS[general.id] ?? base.weapon
    const look: HeroLook = { model: 'cavalry', kind: special?.kind ?? base.kind, weapon, rider: general.id }
    if (general.grade !== 5) return look
    // 천명: 기운 색 · 이름 깃발만 두른다(수염 · 망토 · 장식은 모델에 이미 있다)
    const tianming: TianmingLook = special ? { aura: special.look.aura, banner: special.look.banner } : DEFAULT_TIANMING
    return { ...look, tianming }
  }
  const look: HeroLook = { ...withDress(general, baseLook(general)), face: `/assets/faces/${general.id}.webp` }
  if (general.grade !== 5) return look
  const special = TIANMING[general.id]
  if (!special) {
    // 이름 없는 천명 무장: 금빛 천명 기운 + 초상화를 따른 수염 · 두건 · 망토
    const dress = look.dress
    return { ...look, tianming: dress ? { ...DEFAULT_TIANMING, ornaments: dress.ornaments, cape: dress.cape } : DEFAULT_TIANMING }
  }
  const { look: tianming, ...rest } = special
  const merged: HeroLook = { ...look, ...rest, tianming }
  // 전용 의상이 있으면 차림새 재채색은 쓰지 않는다
  if (merged.skin || (merged.model !== 'cavalry' && merged.model !== 'tianming')) delete merged.dress
  return merged
}

/** 전용 모델(여포 · 조조 · 제갈량)이 아닌 기본 말 탄 모델이면 초상화를 따른 차림새를 붙인다 */
function withDress(general: General, look: HeroLook): HeroLook {
  const dress = heroDress(general.id)
  if (!dress || look.skin || general.id === 'zhuge-liang' || general.id === 'lu-bu' || general.id === 'cao-cao') return look
  return { ...look, dress: look.model === 'zhugeliang' ? { ...dress, robe: true } : dress }
}
