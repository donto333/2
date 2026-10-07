export type BuffId =
  | 'dragon-might'
  | 'swift-step'
  | 'iron-wall'
  | 'jade-command'
  | 'war-chant'
  | 'chain-fury'
  | 'hawk-eye'
  | 'phoenix-guard'
  | 'battle-focus'
  | 'rally-banner'

export type DebuffId =
  | 'armor-break'
  | 'burning'
  | 'fear'
  | 'confusion'
  | 'slow'
  | 'bleed'
  | 'fracture'
  | 'mark'
  | 'silence'
  | 'blind'

export type BattleEffectId = BuffId | DebuffId

export interface BattleEffectDefinition {
  id: BattleEffectId
  kind: 'buff' | 'debuff'
  name: string
  icon: string
  duration: number
  description: string
}

export interface ActiveBattleEffect extends BattleEffectDefinition {
  remaining: number
  stacks: number
}

export interface GeneralEffectLoadout {
  buff: BuffId
  debuff: DebuffId
  cleanse?: boolean
}

export const BATTLE_EFFECTS: Record<BattleEffectId, BattleEffectDefinition> = {
  'dragon-might': { id: 'dragon-might', kind: 'buff', name: '청룡의 기세', icon: '龍', duration: 6, description: '스킬 피해량 +18%' },
  'swift-step': { id: 'swift-step', kind: 'buff', name: '질풍보법', icon: '疾', duration: 6, description: '스킬 재사용 대기시간 -20%' },
  'iron-wall': { id: 'iron-wall', kind: 'buff', name: '철벽진', icon: '壁', duration: 7, description: '위협도 자연 감소 +4/초' },
  'jade-command': { id: 'jade-command', kind: 'buff', name: '옥패 지휘', icon: '玉', duration: 6, description: '실패 명령 위협도 상승 -35%' },
  'war-chant': { id: 'war-chant', kind: 'buff', name: '전군 함성', icon: '咆', duration: 6, description: '전술 게이지 획득량 +25%' },
  'chain-fury': { id: 'chain-fury', kind: 'buff', name: '연계 격화', icon: '連', duration: 6, description: '연계 피해 증폭 +10%, 연계 유지 +1.5초' },
  'hawk-eye': { id: 'hawk-eye', kind: 'buff', name: '천리안', icon: '鷹', duration: 6, description: '스킬 사기 피해 +8' },
  'phoenix-guard': { id: 'phoenix-guard', kind: 'buff', name: '봉화 수호', icon: '烽', duration: 7, description: '위협도 상승량 -25%' },
  'battle-focus': { id: 'battle-focus', kind: 'buff', name: '무념 집중', icon: '心', duration: 5, description: '스킬 쿨다운 시작값 -1.5초' },
  'rally-banner': { id: 'rally-banner', kind: 'buff', name: '군심 결집', icon: '旗', duration: 6, description: '적 사기 자연 감소 +35%' },
  'armor-break': { id: 'armor-break', kind: 'debuff', name: '갑주 균열', icon: '裂', duration: 6, description: '받는 스킬 피해 +22%' },
  burning: { id: 'burning', kind: 'debuff', name: '화계', icon: '火', duration: 6, description: '매초 적 사기 -2.2' },
  fear: { id: 'fear', kind: 'debuff', name: '공포', icon: '恐', duration: 5, description: '매초 적 사기 -1.5' },
  confusion: { id: 'confusion', kind: 'debuff', name: '혼란', icon: '惑', duration: 5, description: '잘못된 명령 위협도 상승 -35%' },
  slow: { id: 'slow', kind: 'debuff', name: '둔화', icon: '緩', duration: 6, description: '적 전술 예고 주기 지연' },
  bleed: { id: 'bleed', kind: 'debuff', name: '출혈', icon: '血', duration: 6, description: '매초 적 사기 -1.3' },
  fracture: { id: 'fracture', kind: 'debuff', name: '진형 붕괴', icon: '崩', duration: 6, description: '막 전환 시 적 사기 회복량 감소' },
  mark: { id: 'mark', kind: 'debuff', name: '표적 낙인', icon: '印', duration: 7, description: '모든 스킬 피해 +12%' },
  silence: { id: 'silence', kind: 'debuff', name: '침묵', icon: '黙', duration: 5, description: '적 사기 자연 회복 효과 차단' },
  blind: { id: 'blind', kind: 'debuff', name: '시야 차단', icon: '暗', duration: 5, description: '잘못된 명령 위협도 상승 -20%' },
}

const ROLE_LOADOUT: Record<'기병' | '궁병' | '책사' | '보병', GeneralEffectLoadout> = {
  기병: { buff: 'swift-step', debuff: 'bleed' },
  궁병: { buff: 'hawk-eye', debuff: 'mark' },
  책사: { buff: 'jade-command', debuff: 'confusion' },
  보병: { buff: 'iron-wall', debuff: 'fracture' },
}

export const GENERAL_EFFECT_LOADOUTS: Record<string, GeneralEffectLoadout> = {
  'guan-yu': { buff: 'dragon-might', debuff: 'armor-break' },
  'zhao-yun': { buff: 'swift-step', debuff: 'slow' },
  'zhuge-liang': { buff: 'jade-command', debuff: 'confusion', cleanse: true },
  'lu-bu': { buff: 'war-chant', debuff: 'fear' },
  'zhou-yu': { buff: 'rally-banner', debuff: 'burning' },
  'zhang-fei': { buff: 'chain-fury', debuff: 'fear' },
  'huang-zhong': { buff: 'hawk-eye', debuff: 'mark' },
  'ma-chao': { buff: 'swift-step', debuff: 'bleed' },
  simayi: { buff: 'battle-focus', debuff: 'silence' },
  'xiahou-dun': { buff: 'iron-wall', debuff: 'fracture' },
  'taishi-ci': { buff: 'hawk-eye', debuff: 'blind' },
  'wei-yan': { buff: 'phoenix-guard', debuff: 'armor-break' },
  'gao-shun': { buff: 'phoenix-guard', debuff: 'slow' },
  'wen-ping': { buff: 'rally-banner', debuff: 'mark' },
  'song-xian': { buff: 'battle-focus', debuff: 'blind' },
  'liu-bei': { buff: 'rally-banner', debuff: 'fear', cleanse: true },
  'da-qiao': { buff: 'jade-command', debuff: 'mark', cleanse: true },
  'lu-su': { buff: 'battle-focus', debuff: 'confusion', cleanse: true },
  'xu-shu': { buff: 'swift-step', debuff: 'slow', cleanse: true },
}

export function effectLoadout(generalId: string, role: keyof typeof ROLE_LOADOUT): GeneralEffectLoadout {
  return GENERAL_EFFECT_LOADOUTS[generalId] ?? ROLE_LOADOUT[role]
}

export function effectDefinition(id: BattleEffectId): BattleEffectDefinition {
  return BATTLE_EFFECTS[id]
}

export function hasBattleEffect(effects: ActiveBattleEffect[], id: BattleEffectId): boolean {
  return effects.some(effect => effect.id === id && effect.remaining > 0)
}

export function effectNames(effects: ActiveBattleEffect[]): string {
  return effects.filter(effect => effect.remaining > 0).map(effect => `${effect.icon} ${effect.name}`).join(' · ')
}
