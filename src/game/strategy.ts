export type Section = 'overview' | 'recruit' | 'roster' | 'territory' | 'research' | 'battle' | 'rank' | 'account' | 'admin'
export type Role = '기병' | '궁병' | '책사' | '보병'
export type Grade = 1 | 2 | 3 | 4 | 5
export type ResourceKey = 'grain' | 'silver' | 'wood' | 'iron' | 'influence'
export type CityOwner = '촉한' | '위나라' | '오나라' | '중립'
export type BuildingKind = 'agriculture' | 'commerce' | 'barracks' | 'workshop' | 'academy'

export interface Resources {
  grain: number
  silver: number
  wood: number
  iron: number
  influence: number
}

export interface CityBuilding {
  id: string
  name: string
  kind: BuildingKind
  level: number
  maxLevel: number
  description: string
}

export interface City {
  id: string
  name: string
  chineseName: string
  region: string
  owner: CityOwner
  level: number
  prosperity: number
  defense: number
  buildings: CityBuilding[]
  conquestProgress?: number
}

export interface ResearchNode {
  id: string
  name: string
  branch: '농정' | '상업' | '군제' | '학술'
  tier: 1 | 2 | 3 | 4 | 5
  description: string
  cost: Partial<Record<ResourceKey, number>>
  prerequisite?: string
  unlocked: boolean
}

export interface General {
  id: string
  name: string
  epithet: string
  role: Role
  grade: Grade
  stars: number
  level: number
  attack: number
  defense: number
  command: number
  leadership: number
  martial: number
  stratagem: number
  speed: number
  skillName: string
  skillDescription: string
  skillUnlocked: boolean
  skillRank?: number
  skillPower?: number
  accent: string
  portrait: string
  portraitPath?: string
}

export interface StrategyState {
  section: Section
  honor: number
  silver: number
  manuals: number
  generals: General[]
  formation: string[]
  lastRecruit: General | null
  lastNotice: string
  wins: number
  battleScore: number
  resources: Resources
  cities: City[]
  selectedCityId: string
  research: ResearchNode[]
  lastConquest: { cityId: string; cityName: string; captured: boolean; damage: number } | null
  lastIncomeCollectedAt?: number
  lastConquestAt?: number
  lastDefenseAt?: number
  lastFactionBattleAt?: number
  factionWarScore: number
}

export const INCOME_COOLDOWN_MS = 24 * 60 * 60 * 1000
export const CONQUEST_COOLDOWN_MS = 8 * 1000
export const DEFENSE_COOLDOWN_MS = 10 * 1000
export const FACTION_BATTLE_COOLDOWN_MS = 12 * 1000

export function cooldownRemaining(lastAt: number | undefined, cooldownMs: number, now = Date.now()): number {
  return lastAt === undefined ? 0 : Math.max(0, cooldownMs - (now - lastAt))
}

export function incomeCooldownRemaining(state: StrategyState, now = Date.now()): number {
  return cooldownRemaining(state.lastIncomeCollectedAt, INCOME_COOLDOWN_MS, now)
}

export function conquestCooldownRemaining(state: StrategyState, now = Date.now()): number {
  return cooldownRemaining(state.lastConquestAt, CONQUEST_COOLDOWN_MS, now)
}

export function defenseCooldownRemaining(state: StrategyState, now = Date.now()): number {
  return cooldownRemaining(state.lastDefenseAt, DEFENSE_COOLDOWN_MS, now)
}

export function factionBattleCooldownRemaining(state: StrategyState, now = Date.now()): number {
  return cooldownRemaining(state.lastFactionBattleAt, FACTION_BATTLE_COOLDOWN_MS, now)
}

export const GRADE_META: Record<Grade, { label: string; color: string; rate: string }> = {
  5: { label: '천명', color: '#f6c56d', rate: '2%' },
  4: { label: '명장', color: '#52e0c4', rate: '8%' },
  3: { label: '정예', color: '#8da9ff', rate: '20%' },
  2: { label: '용사', color: '#c59bf5', rate: '35%' },
  1: { label: '신병', color: '#a9b1b8', rate: '35%' },
}

const BUILDING_LIBRARY: Omit<CityBuilding, 'level'>[] = [
  { id: 'farm', name: '屯田 농장', kind: 'agriculture', maxLevel: 5, description: '식량 생산량과 도시의 민생을 높입니다.' },
  { id: 'market', name: '교역 시장', kind: 'commerce', maxLevel: 5, description: '은전과 영향력 수입을 늘립니다.' },
  { id: 'barracks', name: '정예 병영', kind: 'barracks', maxLevel: 5, description: '도시 방어도와 출정 준비를 강화합니다.' },
  { id: 'workshop', name: '병기 공방', kind: 'workshop', maxLevel: 5, description: '목재와 철 생산을 확보합니다.' },
  { id: 'academy', name: '태학 서원', kind: 'academy', maxLevel: 5, description: '연구 영향력과 병서 수급을 높입니다.' },
]

function createBuildings(level = 1): CityBuilding[] {
  return BUILDING_LIBRARY.map(building => ({ ...building, level }))
}

export function createCities(): City[] {
  return [
    { id: 'chengdu', name: '성도', chineseName: '成都', region: '익주 중심', owner: '촉한', level: 3, prosperity: 82, defense: 74, buildings: createBuildings(2) },
    { id: 'hanzhong', name: '한중', chineseName: '漢中', region: '검각 북문', owner: '촉한', level: 2, prosperity: 64, defense: 86, buildings: createBuildings(1) },
    { id: 'xiangyang', name: '양양', chineseName: '襄陽', region: '형주 요충', owner: '중립', level: 2, prosperity: 58, defense: 62, buildings: createBuildings(1) },
    { id: 'jianye', name: '건업', chineseName: '建業', region: '강동 수운', owner: '오나라', level: 3, prosperity: 76, defense: 70, buildings: createBuildings(2) },
    { id: 'xuchang', name: '허창', chineseName: '許昌', region: '중원 관문', owner: '위나라', level: 3, prosperity: 79, defense: 81, buildings: createBuildings(2) },
    { id: 'luoyang', name: '낙양', chineseName: '洛陽', region: '황하 수도권', owner: '위나라', level: 4, prosperity: 88, defense: 92, buildings: createBuildings(3) },
    { id: 'ye', name: '업', chineseName: '鄴', region: '기주 북부', owner: '위나라', level: 4, prosperity: 84, defense: 86, buildings: createBuildings(3) },
    { id: 'chenliu', name: '진류', chineseName: '陳留', region: '연주 평원', owner: '위나라', level: 2, prosperity: 61, defense: 57, buildings: createBuildings(1) },
    { id: 'puyang', name: '복양', chineseName: '濮陽', region: '연주 동문', owner: '위나라', level: 2, prosperity: 58, defense: 64, buildings: createBuildings(1) },
    { id: 'wancheng', name: '완성', chineseName: '宛城', region: '남양 요충', owner: '중립', level: 2, prosperity: 67, defense: 70, buildings: createBuildings(1) },
    { id: 'jiangling', name: '강릉', chineseName: '江陵', region: '형주 수운', owner: '오나라', level: 3, prosperity: 73, defense: 76, buildings: createBuildings(2) },
    { id: 'yiling', name: '이릉', chineseName: '夷陵', region: '삼협 관문', owner: '오나라', level: 2, prosperity: 55, defense: 68, buildings: createBuildings(1) },
    { id: 'changsha', name: '장사', chineseName: '長沙', region: '형남 동부', owner: '중립', level: 3, prosperity: 71, defense: 63, buildings: createBuildings(2) },
    { id: 'lingling', name: '영릉', chineseName: '零陵', region: '형남 남부', owner: '중립', level: 1, prosperity: 49, defense: 46, buildings: createBuildings(1) },
    { id: 'guiyang', name: '계양', chineseName: '桂陽', region: '남령 북쪽', owner: '중립', level: 1, prosperity: 45, defense: 52, buildings: createBuildings(1) },
    { id: 'wujun', name: '오군', chineseName: '吳郡', region: '강동 동부', owner: '오나라', level: 3, prosperity: 78, defense: 73, buildings: createBuildings(2) },
    { id: 'kuaiji', name: '회계', chineseName: '會稽', region: '동남 해안', owner: '오나라', level: 2, prosperity: 69, defense: 66, buildings: createBuildings(1) },
    { id: 'poyang', name: '파양', chineseName: '鄱陽', region: '강동 호수길', owner: '오나라', level: 2, prosperity: 62, defense: 59, buildings: createBuildings(1) },
    { id: 'hefei', name: '합비', chineseName: '合肥', region: '회남 전선', owner: '위나라', level: 3, prosperity: 64, defense: 88, buildings: createBuildings(2) },
    { id: 'shouchun', name: '수춘', chineseName: '壽春', region: '회남 중심', owner: '위나라', level: 3, prosperity: 68, defense: 79, buildings: createBuildings(2) },
    { id: 'jiujiang', name: '구강', chineseName: '九江', region: '회수 수운', owner: '중립', level: 2, prosperity: 57, defense: 55, buildings: createBuildings(1) },
    { id: 'tianshui', name: '천수', chineseName: '天水', region: '농서 동문', owner: '위나라', level: 2, prosperity: 53, defense: 71, buildings: createBuildings(1) },
    { id: 'wuwei', name: '무위', chineseName: '武威', region: '하서 회랑', owner: '중립', level: 1, prosperity: 42, defense: 61, buildings: createBuildings(1) },
    { id: 'fucheng', name: '부성', chineseName: '涪城', region: '익주 북방', owner: '중립', level: 2, prosperity: 51, defense: 58, buildings: createBuildings(1) },
    { id: 'xindu', name: '신도', chineseName: '新都', region: '익주 동북', owner: '중립', level: 1, prosperity: 47, defense: 49, buildings: createBuildings(1) },
  ]
}

export function ensureCityRoster(state: StrategyState): void {
  const existing = new Set(state.cities.map(city => city.id))
  const fresh = createCities().filter(city => !existing.has(city.id))
  state.cities.push(...fresh)
}

function createResearch(): ResearchNode[] {
  const node = (id: string, name: string, branch: ResearchNode['branch'], tier: ResearchNode['tier'], description: string, cost: Partial<Record<ResourceKey, number>>, prerequisite?: string): ResearchNode => ({ id, name, branch, tier, description, cost, prerequisite, unlocked: false })
  const series = (branch: ResearchNode['branch'], prefix: string, entries: Array<[string, string]>, firstPrerequisite: string): ResearchNode[] => entries.map(([name, description], index) => {
    const id = `${prefix}-${index + 1}`
    const tier = Math.min(5, Math.floor(index / 3) + 1) as ResearchNode['tier']
    const cost = { influence: 520 + index * 115, [branch === '농정' ? 'grain' : branch === '상업' ? 'silver' : branch === '군제' ? 'iron' : 'wood']: 700 + index * 140 } as Partial<Record<ResourceKey, number>>
    return node(id, name, branch, tier, description, cost, index === 0 ? firstPrerequisite : `${prefix}-${index}`)
  })
  return [
    node('irrigation', '수리 관개', '농정', 1, '모든 농장의 식량 산출량 +18%.', { influence: 420, silver: 700 }),
    node('granary', '대형 의창', '농정', 2, '수확 시 식량을 추가로 비축합니다.', { influence: 850, grain: 1800 }, 'irrigation'),
    node('coinage', '상평 주화', '상업', 1, '모든 시장의 은전 수입 +22%.', { influence: 480, silver: 950 }),
    node('silk-road', '서역 교역로', '상업', 2, '시장 수입에 영향력 보너스를 더합니다.', { influence: 900, wood: 1600 }, 'coinage'),
    node('drill', '오부 훈련', '군제', 1, '병영이 있는 도시의 방어도 +12.', { influence: 520, iron: 900 }),
    node('crossbow', '연노 제식', '군제', 2, '전투 시작 시 아군 사기 +8.', { influence: 980, iron: 1700 }, 'drill'),
    node('bureaucracy', '구품 정무', '학술', 1, '내정 행동으로 얻는 영향력 +20%.', { influence: 600, silver: 850 }),
    node('taixue', '태학 개편', '학술', 2, '서원 레벨에 따라 병서를 추가로 얻습니다.', { influence: 1100, grain: 1200 }, 'bureaucracy'),
    ...series('농정', 'agri', [
      ['윤작 농법', '농장 생산량 +7%, 수확 식량 +5%.'], ['수리 제방', '도시 번영도에 따른 식량 보너스가 증가합니다.'], ['곡물 품종개량', '수확 식량 +9%.'], ['대형 저수지', '모든 아군 도시의 식량 생산량 +8%.'], ['농기구 표준화', '농정 건물 강화 비용의 목재 부담을 줄입니다.'], ['구휼 창고', '수확 시 민심이 낮은 도시의 식량 손실을 방지합니다.'], ['토지 측량', '영토가 늘어날수록 수확 영향력이 증가합니다.'], ['관개 운하망', '아군 도시가 5곳 이상이면 식량 생산량 +12%.'], ['천문 농시', '수확 명망 보너스가 증가합니다.'], ['풍년 의례', '수확 시 추가 식량과 명망을 획득합니다.'], ['국가 둔전', '전선 도시의 식량 생산 패널티를 완화합니다.'], ['태평 농정', '농정 계열 효과가 한 단계 더 강화됩니다.'],
    ], 'granary'),
    ...series('상업', 'trade', [
      ['시장 세제개혁', '시장 은전 수입 +7%.'], ['염철 전매', '철과 은전 수입에 소폭 보너스를 줍니다.'], ['상단 보호령', '세력전 보급 비용의 은전 부담을 줄입니다.'], ['도량형 통일', '모든 자원 수확량 +4%.'], ['역참망', '도시 선택과 출정 보급 효율이 증가합니다.'], ['수운 조운', '강동·형주 도시의 은전 수입이 증가합니다.'], ['국경 시장', '중립 도시 점령 시 추가 은전을 확보합니다.'], ['상인 길드', '아군 도시 수에 비례해 은전 수입이 증가합니다.'], ['무역 호위대', '세력전 승리 시 공헌도 보너스를 얻습니다.'], ['해상 교역', '강동 전선 점령 보상이 증가합니다.'], ['천하 통상로', '전 영토 수입의 상업 보너스가 강화됩니다.'], ['황금 장부', '상업 계열 효과가 한 단계 더 강화됩니다.'],
    ], 'silk-road'),
    ...series('군제', 'military', [
      ['군량 수송', '공성 출정 식량 비용을 줄입니다.'], ['방패 진형', '아군 도시 방어전의 성벽 회복량이 증가합니다.'], ['기병 교련', '출정 전투력이 증가합니다.'], ['성벽 보강', '모든 아군 도시의 기본 방어도가 상승합니다.'], ['봉화 연락망', '방어전 재정비 시간이 감소합니다.'], ['공성 병기학', '공성 출정 피해량이 증가합니다.'], ['정예 징집', '세력전 공격력이 증가합니다.'], ['수성 전술', '방어전 패배 시 성벽 피해를 줄입니다.'], ['기동 군단', '세력전 재편성 시간이 감소합니다.'], ['연합 작전', '아군 도시 수에 비례해 전투력이 증가합니다.'], ['천하 군제', '공성·세력전 승리 보상을 강화합니다.'], ['무적 진영', '군제 계열 효과가 한 단계 더 강화됩니다.'], ['패왕의 병서', '전선 전투의 최종 전투력이 크게 증가합니다.'],
    ], 'crossbow'),
    ...series('학술', 'scholar', [
      ['문서 행정', '연구 비용의 영향력 부담을 줄입니다.'], ['인재 등용', '장수 성장에 필요한 병서 수급이 증가합니다.'], ['역사 편찬', '전투 승리 명망 보너스가 증가합니다.'], ['법령 정비', '건물 강화 비용을 일부 절감합니다.'], ['군국 교육', '장수의 통솔과 책략 효과가 강화됩니다.'], ['천문 관측', '전투 패턴 대응 보너스가 증가합니다.'], ['의학 전서', '방어전 패배 후 민심 손실을 완화합니다.'], ['병법 주석', '세력전 공격력에 추가 보정이 붙습니다.'], ['외교 사절', '중립 도시 공성 비용을 줄입니다.'], ['구주 지도', '지도상의 모든 도시 정보를 해금합니다.'], ['옥패 기록원', '세력전 공헌도 획득량이 증가합니다.'], ['대학 체계', '연구 완료 시 추가 영향력을 돌려받습니다.'], ['천하 문명', '학술 계열 효과가 한 단계 더 강화됩니다.'],
    ], 'taixue'),
  ]
}

export function ensureResearchRoster(state: StrategyState): void {
  const existing = new Set(state.research.map(node => node.id))
  state.research.push(...createResearch().filter(node => !existing.has(node.id)))
}

// Historical figures from the late Eastern Han and Three Kingdoms period.
// Epithets and skills are game descriptions, not claims about a canonical game adaptation.
const CORE_LIBRARY: General[] = [
  {
    id: 'guan-yu', name: '관우', epithet: '운장의 청룡언월도', role: '기병', grade: 5, stars: 1, level: 14,
    attack: 94, defense: 72, command: 90, leadership: 96, martial: 98, stratagem: 72, speed: 86, skillName: '오관참장', skillDescription: '전열을 가르며 적의 사기를 크게 낮춘다.', skillUnlocked: true, accent: '#52e0c4', portrait: '관', portraitPath: '/assets/generals/guan-yu.webp',
  },
  {
    id: 'zhao-yun', name: '조운', epithet: '상산의 상산 용기', role: '기병', grade: 5, stars: 1, level: 12,
    attack: 91, defense: 76, command: 87, leadership: 93, martial: 95, stratagem: 70, speed: 98, skillName: '장판 돌파', skillDescription: '위험한 측면을 돌파하고 아군 전열로 복귀한다.', skillUnlocked: true, accent: '#78d9d3', portrait: '조', portraitPath: '/assets/generals/zhao-yun.webp',
  },
  {
    id: 'zhuge-liang', name: '제갈량', epithet: '와룡의 출사표', role: '책사', grade: 5, stars: 1, level: 11,
    attack: 62, defense: 58, command: 99, leadership: 99, martial: 58, stratagem: 100, speed: 62, skillName: '팔진도', skillDescription: '아군 전체의 다음 전술 명령에 보정을 더한다.', skillUnlocked: true, accent: '#d0a5ff', portrait: '제', portraitPath: '/assets/generals/zhuge-liang.webp',
  },
  {
    id: 'lu-bu', name: '여포', epithet: '봉선의 방천화극', role: '기병', grade: 5, stars: 1, level: 1,
    attack: 100, defense: 63, command: 76, leadership: 76, martial: 100, stratagem: 42, speed: 90, skillName: '무쌍 돌격', skillDescription: '단일 적진에 압도적인 돌격을 가한다.', skillUnlocked: false, accent: '#ff8066', portrait: '여', portraitPath: '/assets/generals/lu-bu.webp',
  },
  {
    id: 'zhang-fei', name: '장비', epithet: '익덕의 장판교 포효', role: '보병', grade: 4, stars: 1, level: 8,
    attack: 89, defense: 79, command: 83, leadership: 83, martial: 94, stratagem: 48, speed: 58, skillName: '장판 포효', skillDescription: '적의 전열을 흔들고 중앙 돌파의 위력을 높인다.', skillUnlocked: false, accent: '#7bd6e8', portrait: '장',
  },
  {
    id: 'huang-zhong', name: '황충', epithet: '한승의 백발 명궁', role: '궁병', grade: 4, stars: 1, level: 8,
    attack: 88, defense: 51, command: 82, leadership: 82, martial: 90, stratagem: 68, speed: 64, skillName: '백발 연사', skillDescription: '가장 먼 적을 정확히 노려 연속 피해를 준다.', skillUnlocked: false, accent: '#f6c56d', portrait: '황',
  },
  {
    id: 'ma-chao', name: '마초', epithet: '맹기의 서량 철기', role: '기병', grade: 4, stars: 1, level: 1,
    attack: 93, defense: 59, command: 78, leadership: 78, martial: 95, stratagem: 55, speed: 94, skillName: '철기 쇄도', skillDescription: '측면 기동을 선택하면 공격력이 크게 오른다.', skillUnlocked: false, accent: '#e6a1ba', portrait: '마',
  },
  {
    id: 'zhou-yu', name: '주유', epithet: '공근의 적벽 화계', role: '책사', grade: 4, stars: 1, level: 1,
    attack: 69, defense: 55, command: 94, leadership: 94, martial: 70, stratagem: 98, speed: 72, skillName: '적벽 화공', skillDescription: '적 사기를 태워 전장의 흐름을 바꾼다.', skillUnlocked: false, accent: '#ff9c65', portrait: '주', portraitPath: '/assets/generals/zhou-yu.webp',
  },
  {
    id: 'simayi', name: '사마의', epithet: '중달의 기산 책략', role: '책사', grade: 5, stars: 1, level: 1,
    attack: 64, defense: 61, command: 96, leadership: 96, martial: 57, stratagem: 99, speed: 54, skillName: '천변 만기', skillDescription: '적의 다음 명령을 읽고 아군의 방어를 보강한다.', skillUnlocked: false, accent: '#b7b9ff', portrait: '사',
  },
  {
    id: 'xiahou-dun', name: '하후돈', epithet: '원양의 맹진', role: '보병', grade: 3, stars: 1, level: 1,
    attack: 76, defense: 78, command: 73, leadership: 73, martial: 80, stratagem: 52, speed: 56, skillName: '맹진 방진', skillDescription: '전열을 고정해 아군이 받는 피해를 줄인다.', skillUnlocked: false, accent: '#9bd4bc', portrait: '하',
  },
  {
    id: 'taishi-ci', name: '태사자', epithet: '자의의 신정 궁기', role: '궁병', grade: 3, stars: 1, level: 1,
    attack: 81, defense: 49, command: 75, leadership: 75, martial: 83, stratagem: 61, speed: 79, skillName: '신정 쌍궁', skillDescription: '거리를 유지할수록 궁병의 피해가 증가한다.', skillUnlocked: false, accent: '#8da9ff', portrait: '태',
  },
  {
    id: 'wei-yan', name: '위연', epithet: '문장의 자오곡 기습', role: '보병', grade: 3, stars: 1, level: 1,
    attack: 79, defense: 65, command: 70, leadership: 70, martial: 81, stratagem: 57, speed: 72, skillName: '자오곡 기습', skillDescription: '좌측 기동 후 적의 사기를 추가로 깎는다.', skillUnlocked: false, accent: '#a7d88f', portrait: '위',
  },
  {
    id: 'gao-shun', name: '고순', epithet: '함진영의 불퇴 전열', role: '보병', grade: 2, stars: 1, level: 1,
    attack: 63, defense: 76, command: 69, leadership: 69, martial: 64, stratagem: 48, speed: 44, skillName: '함진영', skillDescription: '짧은 시간 동안 방어선을 단단히 유지한다.', skillUnlocked: false, accent: '#c59bf5', portrait: '고',
  },
  {
    id: 'wen-ping', name: '문빙', epithet: '강하를 지킨 수문장', role: '궁병', grade: 2, stars: 1, level: 1,
    attack: 66, defense: 62, command: 68, leadership: 68, martial: 66, stratagem: 62, speed: 58, skillName: '강하 수비', skillDescription: '적의 중앙 돌파를 견제하고 아군을 보호한다.', skillUnlocked: false, accent: '#88c9e8', portrait: '문',
  },
  {
    id: 'song-xian', name: '송헌', epithet: '여포군의 전열 장수', role: '보병', grade: 1, stars: 1, level: 1,
    attack: 48, defense: 55, command: 49, leadership: 49, martial: 49, stratagem: 34, speed: 41, skillName: '기치 수호', skillDescription: '작전 초반 아군의 대열 붕괴를 늦춘다.', skillUnlocked: false, accent: '#a9b1b8', portrait: '송',
  },
]

type ExpansionSpec = [string, string, string, Role, Grade, string, string, string]

const EXPANSION_SPECS: ExpansionSpec[] = [
  ['liu-bei', '유비', '현덕의 인덕과 쌍검', '보병', 5, '인덕의 결집', '아군 전체의 사기를 끌어올리고 전열을 회복한다.', '유'],
  ['cao-cao', '조조', '맹덕의 천하 제패', '기병', 5, '위무의 질주', '적의 약한 측면을 포착해 전군의 공격력을 높인다.', '조'],
  ['sun-quan', '손권', '중모의 강동 수호', '궁병', 4, '강동의 결의', '아군 궁병의 사거리와 명중률을 강화한다.', '손'],
  ['sun-ce', '손책', '백부의 소패왕', '기병', 5, '소패왕 돌격', '중앙의 적을 밀어내고 기동 속도를 크게 높인다.', '손'],
  ['sun-jian', '손견', '문대의 옥새 선봉', '보병', 4, '강동 선봉', '첫 공격에 추가 피해를 더하고 적 사기를 낮춘다.', '손'],
  ['pang-tong', '방통', '사원의 봉추 연환', '책사', 4, '연환계', '적 부대를 묶어 다음 충격파 피해를 증폭한다.', '방'],
  ['xu-shu', '서서', '원직의 단기 유랑', '책사', 3, '단기묘책', '좌우 기동 명령의 재사용 대기시간을 줄인다.', '서'],
  ['fa-zheng', '법정', '효직의 한중 책략', '책사', 4, '한중 반격', '방어 중인 아군이 받는 피해를 반격으로 전환한다.', '법'],
  ['meng-huo', '맹획', '남만왕의 칠종칠금', '보병', 3, '칠종칠금', '쓰러지지 않는 전열을 만들고 방어력을 높인다.', '맹'],
  ['zhu-rong', '축융', '남만의 비도 여왕', '궁병', 3, '비도 화염', '적 후방에 불꽃을 남겨 지속 피해를 입힌다.', '축'],
  ['huang-gai', '황개', '공복의 고육지계', '보병', 4, '고육지계', '자신을 희생해 적 진형에 큰 사기 피해를 준다.', '황'],
  ['gan-ning', '감녕', '흥패의 백기 수적', '기병', 4, '백기 야습', '전투 초반 적의 시야를 흔들고 측면을 급습한다.', '감'],
  ['ling-tong', '능통', '공적의 강동 맹장', '보병', 3, '필사의 연격', '연속 명령 시 두 번째 공격의 위력이 상승한다.', '능'],
  ['lu-su', '노숙', '자경의 동맹 책략', '책사', 4, '강동 동맹', '아군의 명령 자원을 보존하고 사기를 안정시킨다.', '노'],
  ['lu-meng', '여몽', '자명의 백의 도독', '보병', 4, '백의 도하', '적이 방심한 순간 방어선을 뚫고 점령한다.', '여'],
  ['lu-xun', '육손', '백언의 이릉 화진', '책사', 5, '이릉 화진', '넓은 범위에 화염을 일으켜 적 사기를 태운다.', '육'],
  ['zhang-liao', '장료', '문원의 합비 질풍', '기병', 5, '합비 질풍', '적 중앙에 돌입해 적의 공격 순서를 끊는다.', '장'],
  ['xu-chu', '허저', '중강의 호치 위력', '보병', 4, '호치 난무', '근접한 적에게 강력한 연속 타격을 가한다.', '허'],
  ['dian-wei', '전위', '악래의 쌍극 수호', '보병', 4, '쌍극 수호', '지정한 장수를 지키며 피해를 대신 받는다.', '전'],
  ['cao-ren', '조인', '자효의 번성 철벽', '보병', 4, '번성 철벽', '거점을 지키는 동안 방어력이 크게 오른다.', '조'],
  ['cao-hong', '조홍', '자렴의 급행 원군', '기병', 3, '급행 원군', '위험한 아군에게 빠르게 합류해 전열을 보충한다.', '조'],
  ['guo-jia', '곽가', '봉효의 십승십패', '책사', 5, '십승십패', '적의 약점을 간파해 스킬 피해를 극대화한다.', '곽'],
  ['xun-yu', '순욱', '문약의 왕좌 보좌', '책사', 4, '왕좌의 보좌', '아군 지휘력과 사기를 동시에 높인다.', '순'],
  ['xun-you', '순유', '공달의 기묘한 계책', '책사', 3, '기묘한 계책', '다음 전술 명령을 한 번 더 사용할 기회를 만든다.', '순'],
  ['jia-xu', '가후', '문화의 독계', '책사', 5, '독계', '적의 분노를 역이용해 스스로 무너지게 한다.', '가'],
  ['cheng-yu', '정욱', '중덕의 태산 책략', '보병', 3, '태산 책략', '전열이 밀리지 않도록 지휘 방어를 강화한다.', '정'],
  ['pang-de', '방덕', '영명의 관문 백마', '기병', 4, '백마 관문', '적 기병의 돌격을 정면에서 받아친다.', '방'],
  ['xu-huang', '서황', '공명의 양양 대승', '보병', 4, '양양 대승', '적의 보급선을 끊어 시간이 지날수록 강해진다.', '서'],
  ['yue-jin', '악진', '문겸의 선등 돌파', '보병', 3, '선등 돌파', '가장 먼저 진입해 아군의 첫 명령을 강화한다.', '악'],
  ['li-dian', '이전', '만성의 학문 장수', '궁병', 3, '학문 진형', '아군 진형의 빈틈을 메워 모든 능력치를 보정한다.', '이'],
  ['yu-jin', '우금', '문칙의 군율 철벽', '보병', 3, '군율 철벽', '부대의 사기가 낮아질수록 방어력이 증가한다.', '우'],
  ['zhang-he', '장합', '준예의 유연한 기동', '기병', 4, '유연한 기동', '적의 명령을 읽고 반대 측면으로 재배치한다.', '장'],
  ['wen-chou', '문추', '문대의 하북 맹돌', '기병', 3, '하북 맹돌', '전방의 적에게 직선 돌격으로 큰 피해를 준다.', '문'],
  ['yan-liang', '안량', '문추와 나란한 선봉', '기병', 3, '선봉 참격', '적 지휘관을 우선 공격해 사기를 크게 흔든다.', '안'],
  ['yuan-shao', '원소', '본초의 사세삼공', '궁병', 4, '사세삼공', '대규모 원군을 불러 전장의 수적 우세를 만든다.', '원'],
  ['yuan-shu', '원술', '공로의 중원 야심', '책사', 2, '중원 야심', '자원을 소모해 단기간에 전투력을 끌어올린다.', '원'],
  ['gongsun-zan', '공손찬', '백마의 의종', '기병', 3, '백마의종', '기병 부대의 이동과 측면 공격을 강화한다.', '공'],
  ['chen-gong', '진궁', '공대의 여포 모사', '책사', 3, '계중계', '적이 준비한 전술을 역으로 이용한다.', '진'],
  ['zhang-lu', '장로', '오두미도의 군량', '책사', 2, '군량 비축', '전투가 길어질수록 아군의 사기를 회복한다.', '장'],
  ['ma-teng', '마등', '수성의 서량 철기', '기병', 3, '서량 철기', '기병의 돌격력과 이동 속도를 높인다.', '마'],
  ['han-sui', '한수', '문약의 서량 노장', '보병', 2, '서량 연합', '인접한 장수들의 방어를 함께 보강한다.', '한'],
  ['wang-ping', '왕평', '자균의 한중 수비', '궁병', 3, '한중 수비', '고지에서 적의 돌파를 정확히 저격한다.', '왕'],
  ['guan-ping', '관평', '관문의 청룡 계승', '기병', 3, '청룡 계승', '아군 선봉 장수와 연계해 추가 피해를 준다.', '관'],
  ['guan-xing', '관흥', '안국의 춘추 계승', '기병', 3, '춘추 계승', '쓰러진 적이 많을수록 공격력이 상승한다.', '관'],
  ['zhang-bao', '장포', '중진의 장판 유산', '보병', 3, '장판 유산', '보병 진형의 충격 저항을 높인다.', '장'],
  ['ma-dai', '마대', '금성의 서량 추격', '기병', 2, '서량 추격', '후퇴하는 적에게 추가 피해를 입힌다.', '마'],
  ['dong-zhuo', '동탁', '중영의 폭정 철기', '보병', 4, '폭정의 압박', '적의 사기를 짓누르지만 아군 속도는 낮아진다.', '동'],
  ['diao-chan', '초선', '폐월의 연환 미혹', '책사', 4, '연환 미혹', '적 지휘관을 혼란시켜 다음 행동을 지연한다.', '초'],
  ['cai-wenji', '채문희', '문희의 호가 귀환', '책사', 2, '호가 귀환', '전투 기록을 되살려 아군 사기를 회복한다.', '채'],
  ['da-qiao', '대교', '강동의 옥련', '궁병', 3, '옥련의 가호', '아군 장수의 스킬 재사용 대기시간을 줄인다.', '대'],
]

function makeExpansionGeneral([id, name, epithet, role, grade, skillName, skillDescription, portrait]: ExpansionSpec): General {
  const base = ({ 1: 42, 2: 50, 3: 60, 4: 72, 5: 84 } as Record<Grade, number>)[grade]
  const roleBonus = ({ 기병: [8, -2, -6, 12], 궁병: [2, -4, 4, 8], 책사: [-6, -2, 14, -4], 보병: [2, 10, -2, -6] } as Record<Role, [number, number, number, number]>)[role]
  return {
    id, name, epithet, role, grade, stars: 1, level: 1,
    attack: base + roleBonus[0], defense: base + roleBonus[1], command: base + 2,
    leadership: base + 4, martial: base + roleBonus[0], stratagem: base + roleBonus[2], speed: base + roleBonus[3],
    skillName, skillDescription, skillUnlocked: false, skillRank: 1, skillPower: 100, accent: GRADE_META[grade].color, portrait,
  }
}

const EXPANSION_GENERALS = EXPANSION_SPECS.map(makeExpansionGeneral)
const LIBRARY: General[] = [...CORE_LIBRARY, ...EXPANSION_GENERALS]

function copyGeneral(general: General): General {
  return { ...general }
}

export function createInitialState(): StrategyState {
  const starterIds = ['guan-yu', 'zhao-yun', 'zhuge-liang']
  const generals = starterIds.map(id => copyGeneral(LIBRARY.find(general => general.id === id)!))
  return {
    section: 'overview', honor: 2480, silver: 12500, manuals: 180, generals,
    formation: starterIds, lastRecruit: null, lastNotice: '전장에 오신 것을 환영합니다. 첫 진형을 준비하십시오.', wins: 7, battleScore: 18460,
    resources: { grain: 18200, silver: 12500, wood: 8200, iron: 3900, influence: 2480 },
    cities: createCities(), selectedCityId: 'chengdu', research: createResearch(), lastConquest: null, lastIncomeCollectedAt: undefined, lastConquestAt: undefined, lastDefenseAt: undefined, lastFactionBattleAt: undefined, factionWarScore: 0,
  }
}

export function allGenerals(): General[] {
  return LIBRARY.map(copyGeneral)
}

export function findGeneral(state: StrategyState, id: string): General | undefined {
  return state.generals.find(general => general.id === id)
}

export function combatPower(general: General): number {
  return Math.round((general.leadership * 1.15 + general.martial * 1.25 + general.stratagem * 0.9 + general.speed * 0.65 + general.defense * 0.25) * (1 + (general.level - 1) * 0.035) * (1 + (general.stars - 1) * 0.06))
}

export function skillUnlockLevel(general: General): number {
  return Math.max(6, 10 - Math.max(0, general.stars - 1))
}

export function skillRank(general: General): number {
  return general.skillRank ?? Math.max(1, general.stars)
}

export function skillPower(general: General): number {
  return general.skillPower ?? (100 + (skillRank(general) - 1) * 18 + Math.max(0, general.level - 10) * 3)
}

export function totalPower(state: StrategyState): number {
  return state.formation.reduce((sum, id) => sum + (findGeneral(state, id) ? combatPower(findGeneral(state, id)!) : 0), 0)
}

function weightedGrade(): Grade {
  const roll = Math.random() * 100
  if (roll < 2) return 5
  if (roll < 10) return 4
  if (roll < 30) return 3
  if (roll < 65) return 2
  return 1
}

function pickFromGrade(grade: Grade): General {
  const candidates = LIBRARY.filter(general => general.grade === grade)
  return copyGeneral(candidates[Math.floor(Math.random() * candidates.length)] ?? LIBRARY[LIBRARY.length - 1])
}

export interface RecruitResult {
  ok: boolean
  message: string
  general: General | null
  rewards: General[]
}

export function recruit(state: StrategyState, count = 1): RecruitResult {
  const cost = count === 10 ? 900 : 100
  if (state.honor < cost) return { ok: false, message: '명망이 부족합니다. 전투에서 명망을 모아 다시 시도하십시오.', general: null, rewards: [] }
  state.honor -= cost
  let featured: General | null = null
  const rewards: General[] = []
  for (let index = 0; index < count; index += 1) {
    const reward = pickFromGrade(weightedGrade())
    rewards.push(reward)
    const owned = findGeneral(state, reward.id)
    if (owned) {
      const previousStars = owned.stars
      if (previousStars < 5) {
        owned.stars += 1
        owned.attack += 4 + owned.stars
        owned.defense += 3 + Math.floor(owned.stars / 2)
        owned.command += 3 + Math.floor(owned.stars / 2)
        owned.leadership += 3 + owned.stars
        owned.martial += 4 + owned.stars
        owned.stratagem += 2 + Math.floor(owned.stars / 2)
        owned.speed += 2 + Math.floor(owned.stars / 2)
        owned.skillRank = Math.min(5, (owned.skillRank ?? previousStars) + 1)
        owned.skillPower = skillPower(owned) + 18
      } else {
        state.manuals += 8
      }
      featured = owned
    } else {
      state.generals.push(reward)
      state.formation = state.formation.length < 3 ? [...state.formation, reward.id] : state.formation
      featured = reward
    }
  }
  const duplicates = rewards.filter(reward => state.generals.some(general => general.id === reward.id && general !== featured)).length
  const tail = count === 10 ? ` 10회 모집 완료 · ${duplicates}장의 중복 인장이 성장 재료로 전환되었습니다.` : ''
  state.lastRecruit = featured ? copyGeneral(featured) : null
  state.lastNotice = featured ? `${featured.name} — ${featured.stars}성으로 응답했습니다.${tail}` : '모집 결과를 확인하십시오.'
  return { ok: true, message: state.lastNotice, general: featured, rewards: rewards.map(reward => copyGeneral(findGeneral(state, reward.id) ?? reward)) }
}

export interface UpgradeResult { ok: boolean; message: string }

export function upgrade(state: StrategyState, id: string): UpgradeResult {
  const general = findGeneral(state, id)
  if (!general) return { ok: false, message: '무장을 찾을 수 없습니다.' }
  const silverCost = 650 + general.level * 350
  const manualCost = 12 + general.level * 2
  if (state.silver < silverCost || state.manuals < manualCost) return { ok: false, message: `강화 재료가 부족합니다. 은전 ${formatNumber(silverCost)} · 병서 ${manualCost} 필요` }
  state.silver -= silverCost
  state.resources.silver = state.silver
  state.manuals -= manualCost
  general.level += 1
  general.attack += 6 + general.stars
  general.defense += 4 + Math.floor(general.stars / 2)
  general.command += 3
  general.leadership += 3
  general.martial += 6 + general.stars
  general.stratagem += 2
  general.speed += 2
  general.skillPower = skillPower(general) + 3
  if (general.level >= skillUnlockLevel(general) && !general.skillUnlocked) state.lastNotice = `${general.name}이(가) Lv.${general.level}에 도달했습니다. ${general.stars}성 스킬 해금이 가능합니다.`
  else state.lastNotice = `${general.name} 강화 완료 · Lv.${general.level}`
  return { ok: true, message: state.lastNotice }
}

export function unlockSkill(state: StrategyState, id: string): UpgradeResult {
  const general = findGeneral(state, id)
  if (!general) return { ok: false, message: '무장을 찾을 수 없습니다.' }
  if (general.skillUnlocked) return { ok: false, message: '이미 해금된 스킬입니다.' }
  if (general.level < skillUnlockLevel(general)) return { ok: false, message: `${general.stars}성 무장은 레벨 ${skillUnlockLevel(general)}에서 스킬을 해금할 수 있습니다.` }
  if (state.silver < 1500) return { ok: false, message: '은전이 부족합니다. 전투 보상으로 은전을 확보하십시오.' }
  state.silver -= 1500
  state.resources.silver = state.silver
  general.skillUnlocked = true
  general.skillRank = Math.max(1, general.skillRank ?? general.stars)
  general.skillPower = skillPower(general)
  state.lastNotice = `${general.name}의 「${general.skillName}」이(가) 해금되었습니다.`
  return { ok: true, message: state.lastNotice }
}

export function toggleFormation(state: StrategyState, id: string): void {
  if (!state.generals.some(general => general.id === id)) return
  if (state.formation.includes(id)) {
    if (state.formation.length > 1) state.formation = state.formation.filter(item => item !== id)
    return
  }
  if (state.formation.length >= 3) state.formation = [...state.formation.slice(0, 2), id]
  else state.formation = [...state.formation, id]
  state.lastNotice = '출전 진형이 갱신되었습니다.'
}

export const RESOURCE_META: Record<ResourceKey, { label: string; icon: string; color: string }> = {
  grain: { label: '식량', icon: '▦', color: '#d6b66d' },
  silver: { label: '은전', icon: '◈', color: '#c8d6dc' },
  wood: { label: '목재', icon: '⌁', color: '#9bc68f' },
  iron: { label: '철', icon: '◆', color: '#9db9d8' },
  influence: { label: '영향력', icon: '✦', color: '#52e0c4' },
}

export function findCity(state: StrategyState, id = state.selectedCityId): City | undefined {
  return state.cities.find(city => city.id === id)
}

function buildingLevel(city: City, kind: BuildingKind): number {
  return city.buildings.find(building => building.kind === kind)?.level ?? 0
}

function researchUnlocked(state: StrategyState, id: string): boolean {
  return state.research.some(node => node.id === id && node.unlocked)
}

function researchCount(state: StrategyState, prefix: string): number {
  return state.research.filter(node => node.id.startsWith(prefix) && node.unlocked).length
}

export function cityIncome(city: City, state?: StrategyState): Resources {
  if (city.owner !== '촉한') return { grain: 0, silver: 0, wood: 0, iron: 0, influence: 0 }
  const farm = buildingLevel(city, 'agriculture')
  const market = buildingLevel(city, 'commerce')
  const workshop = buildingLevel(city, 'workshop')
  const academy = buildingLevel(city, 'academy')
  const grainBonus = state && researchUnlocked(state, 'irrigation') ? 1.18 : 1
  const granaryBonus = state && researchUnlocked(state, 'granary') ? 1.12 : 1
  const silverBonus = state && researchUnlocked(state, 'coinage') ? 1.22 : 1
  const tradeBonus = state && researchUnlocked(state, 'silk-road') ? 1.15 : 1
  const influenceBonus = state && researchUnlocked(state, 'bureaucracy') ? 1.2 : 1
  const agricultureBonus = state ? 1 + researchCount(state, 'agri-') * 0.018 : 1
  const tradeBonusFromTree = state ? 1 + researchCount(state, 'trade-') * 0.016 : 1
  const scholarshipBonus = state ? 1 + researchCount(state, 'scholar-') * 0.01 : 1
  return {
    grain: Math.round((170 + farm * 210 + city.prosperity * 2.2) * grainBonus * granaryBonus * agricultureBonus),
    silver: Math.round((120 + market * 155 + city.prosperity * 1.4) * silverBonus * tradeBonus * tradeBonusFromTree),
    wood: 80 + workshop * 120 + city.level * 35,
    iron: 45 + workshop * 82 + city.level * 22,
    influence: Math.round((35 + market * 28 + academy * 44) * influenceBonus * tradeBonus * scholarshipBonus),
  }
}

export function conquestPower(state: StrategyState): number {
  const formationPower = totalPower(state)
  const commandBonus = state.research.some(node => node.id === 'drill' && node.unlocked) ? 120 : 0
  return formationPower + commandBonus + state.cities.filter(city => city.owner === '촉한').length * 35 + researchCount(state, 'military-') * 42 + researchCount(state, 'scholar-') * 12
}

export function conquestCost(city: City): Partial<Record<ResourceKey, number>> {
  return {
    grain: 650 + city.level * 250,
    silver: 550 + city.level * 250,
    iron: 180 + city.level * 120,
  }
}

export interface ConquestResult {
  ok: boolean
  captured: boolean
  message: string
  damage: number
}

export interface TerritoryBattleResult {
  ok: boolean
  won: boolean
  message: string
  damage: number
}

function territoryBattleCost(city: City): Partial<Record<ResourceKey, number>> {
  return { grain: 280 + city.level * 90, silver: 220 + city.level * 80, iron: 100 + city.level * 55 }
}

export function defendCity(state: StrategyState, cityId: string, now = Date.now()): TerritoryBattleResult {
  const city = findCity(state, cityId)
  if (!city) return { ok: false, won: false, message: '해당 도시를 찾을 수 없습니다.', damage: 0 }
  if (city.owner !== '촉한') return { ok: false, won: false, message: '아군 도시에서만 방어전을 지휘할 수 있습니다.', damage: 0 }
  const wait = defenseCooldownRemaining(state, now)
  if (wait > 0) return { ok: false, won: false, message: `수비대가 재정비 중입니다. ${Math.ceil(wait / 1000)}초 후 방어전을 시작할 수 있습니다.`, damage: 0 }
  const cost = territoryBattleCost(city)
  if (!spendResources(state, cost)) return { ok: false, won: false, message: '방어전 보급품이 부족합니다.', damage: 0 }
  state.lastDefenseAt = now
  const defensePower = conquestPower(state) + city.defense * 4 + buildingLevel(city, 'barracks') * 90 + researchCount(state, 'military-') * 35
  const raidPower = city.level * 310 + 520
  const won = defensePower >= raidPower * 0.82
  const damage = Math.max(6, Math.round((defensePower / Math.max(raidPower, 1)) * 12))
  if (won) {
    city.defense = Math.min(100, city.defense + damage)
    city.prosperity = Math.min(100, city.prosperity + 3)
    state.honor += 45
    state.factionWarScore += 100
    state.lastNotice = `${city.name} 방어 성공 · 성벽 수리 +${damage} · 세력전 공헌도 +100`
  } else {
    city.defense = Math.max(15, city.defense - damage)
    city.prosperity = Math.max(20, city.prosperity - 4)
    state.lastNotice = `${city.name} 방어선 붕괴 · 성벽 피해 ${damage} · 다음 방어전을 준비하십시오.`
  }
  return { ok: true, won, message: state.lastNotice, damage }
}

export function launchFactionBattle(state: StrategyState, cityId: string, now = Date.now()): TerritoryBattleResult {
  const city = findCity(state, cityId)
  if (!city) return { ok: false, won: false, message: '해당 전선을 찾을 수 없습니다.', damage: 0 }
  if (city.owner === '촉한') return { ok: false, won: false, message: '아군 도시에는 세력전 공격을 할 수 없습니다.', damage: 0 }
  const wait = factionBattleCooldownRemaining(state, now)
  if (wait > 0) return { ok: false, won: false, message: `세력전 부대가 재편성 중입니다. ${Math.ceil(wait / 1000)}초 후 다시 공격할 수 있습니다.`, damage: 0 }
  const cost = territoryBattleCost(city)
  if (!spendResources(state, cost)) return { ok: false, won: false, message: '세력전 보급품이 부족합니다.', damage: 0 }
  state.lastFactionBattleAt = now
  const attackPower = conquestPower(state) + state.cities.filter(item => item.owner === '촉한').length * 70 + researchCount(state, 'military-') * 45 + researchCount(state, 'scholar-') * 15
  const factionPower = city.defense * 5 + city.level * 260 + (city.owner === '위나라' ? 100 : city.owner === '오나라' ? 70 : 0)
  const won = attackPower >= factionPower * 0.75
  const damage = Math.max(5, Math.round((attackPower / Math.max(factionPower, 1)) * 14))
  if (won) {
    city.conquestProgress = Math.min(100, (city.conquestProgress ?? 0) + damage)
    city.defense = Math.max(20, city.defense - Math.ceil(damage / 2))
    state.factionWarScore += 150
    if ((city.conquestProgress ?? 0) >= 100) {
      city.owner = '촉한'
      state.honor += 260
      state.silver += 1400
      state.resources.silver = state.silver
      state.lastNotice = `${city.name} 세력전 승리 · 적 세력을 몰아내고 전선을 확보했습니다.`
    } else state.lastNotice = `${city.name} 세력전 승리 · 공성 진전 +${damage}% · 세력전 공헌도 +150`
  } else {
    state.factionWarScore = Math.max(0, state.factionWarScore - 40)
    state.lastNotice = `${city.name} 세력전 패배 · 적 세력이 반격해 전선이 유지되었습니다.`
  }
  return { ok: true, won, message: state.lastNotice, damage }
}

export function launchConquest(state: StrategyState, cityId: string, now = Date.now()): ConquestResult {
  const city = findCity(state, cityId)
  if (!city) return { ok: false, captured: false, message: '해당 도시를 찾을 수 없습니다.', damage: 0 }
  if (city.owner === '촉한') return { ok: false, captured: false, message: '이미 촉한이 지배하는 도시입니다.', damage: 0 }
  const conquestWait = conquestCooldownRemaining(state, now)
  if (conquestWait > 0) return { ok: false, captured: false, message: `공성 준비 중입니다. ${Math.ceil(conquestWait / 1000)}초 후 다시 출정할 수 있습니다.`, damage: 0 }
  const cost = conquestCost(city)
  if (!spendResources(state, cost)) return { ok: false, captured: false, message: `출정 자원이 부족합니다. 식량 ${formatNumber(cost.grain ?? 0)} · 은전 ${formatNumber(cost.silver ?? 0)} · 철 ${formatNumber(cost.iron ?? 0)} 필요`, damage: 0 }
  state.lastConquestAt = now
  const power = conquestPower(state)
  const defenseScore = city.defense * 5 + city.level * 180
  const advantage = power / Math.max(defenseScore, 1)
  const damage = Math.max(8, Math.round(advantage * 18) + (advantage >= 1.25 ? 8 : 0))
  const progress = Math.min(100, (city.conquestProgress ?? 0) + damage)
  city.conquestProgress = progress
  state.selectedCityId = city.id
  if (progress >= 100) {
    city.owner = '촉한'
    city.defense = Math.max(30, city.defense - 18)
    city.prosperity = Math.max(30, city.prosperity - 20)
    state.honor += 260
    state.silver += 1400
    state.resources.silver = state.silver
    state.resources.grain += 900
    state.resources.influence += 120
    state.lastConquest = { cityId: city.id, cityName: city.name, captured: true, damage }
    state.lastNotice = `${city.name} 점령 성공 · 명망 +260 · 영향력 +120`
    return { ok: true, captured: true, message: state.lastNotice, damage }
  }
  state.lastConquest = { cityId: city.id, cityName: city.name, captured: false, damage }
  state.lastNotice = `${city.name} 공성 진전 ${progress}% · 성벽 피해 ${damage} · 다음 출정을 준비하십시오.`
  return { ok: true, captured: false, message: state.lastNotice, damage }
}

function availableResource(state: StrategyState, key: ResourceKey): number {
  return key === 'silver' ? state.silver : state.resources[key]
}

function spendResources(state: StrategyState, cost: Partial<Record<ResourceKey, number>>): boolean {
  if (Object.entries(cost).some(([key, value]) => availableResource(state, key as ResourceKey) < (value ?? 0))) return false
  Object.entries(cost).forEach(([key, value]) => {
    const resource = key as ResourceKey
    if (resource === 'silver') state.silver -= value ?? 0
    else state.resources[resource] -= value ?? 0
  })
  state.resources.silver = state.silver
  return true
}

export function collectIncome(state: StrategyState, now = Date.now()): { ok: boolean; message: string; gain: Resources } {
  const incomeWait = incomeCooldownRemaining(state, now)
  if (incomeWait > 0) return { ok: false, message: `금일 내정 수확은 이미 완료했습니다. ${Math.ceil(incomeWait / 3600000)}시간 후 다시 수확할 수 있습니다.`, gain: { grain: 0, silver: 0, wood: 0, iron: 0, influence: 0 } }
  state.lastIncomeCollectedAt = now
  const gain = state.cities.reduce((total, city) => {
    const income = cityIncome(city, state)
    return {
      grain: total.grain + income.grain,
      silver: total.silver + income.silver,
      wood: total.wood + income.wood,
      iron: total.iron + income.iron,
      influence: total.influence + income.influence,
    }
  }, { grain: 0, silver: 0, wood: 0, iron: 0, influence: 0 })
  state.resources.grain += gain.grain
  state.silver += gain.silver
  state.resources.silver = state.silver
  state.resources.wood += gain.wood
  state.resources.iron += gain.iron
  state.resources.influence += gain.influence
  state.honor += Math.floor(gain.influence / 4)
  if (researchUnlocked(state, 'taixue')) state.manuals += Math.max(1, Math.floor(gain.influence / 180))
  state.lastNotice = `내정 수확 완료 · 식량 +${formatNumber(gain.grain)} · 은전 +${formatNumber(gain.silver)} · 영향력 +${formatNumber(gain.influence)}`
  return { ok: true, message: state.lastNotice, gain }
}

export function selectCity(state: StrategyState, id: string): { ok: boolean; message: string } {
  const city = findCity(state, id)
  if (!city) return { ok: false, message: '해당 도시를 찾을 수 없습니다.' }
  state.selectedCityId = city.id
  state.lastNotice = `${city.name}(${city.chineseName})을(를) 내정 중심지로 선택했습니다.`
  return { ok: true, message: state.lastNotice }
}

export function buildingCost(building: CityBuilding): Partial<Record<ResourceKey, number>> {
  const level = building.level
  return {
    silver: 420 + level * 280,
    wood: 260 + level * 190,
    iron: building.kind === 'barracks' || building.kind === 'workshop' ? 210 + level * 135 : 80 + level * 45,
  }
}

export function upgradeBuilding(state: StrategyState, cityId: string, buildingId: string): { ok: boolean; message: string } {
  const city = findCity(state, cityId)
  if (!city) return { ok: false, message: '도시를 찾을 수 없습니다.' }
  if (city.owner !== '촉한') return { ok: false, message: '아군 영토의 도시만 내정을 지휘할 수 있습니다.' }
  const building = city.buildings.find(item => item.id === buildingId)
  if (!building) return { ok: false, message: '건물을 찾을 수 없습니다.' }
  if (building.level >= building.maxLevel) return { ok: false, message: `${building.name}은(는) 이미 최고 단계입니다.` }
  const cost = buildingCost(building)
  if (!spendResources(state, cost)) return { ok: false, message: `내정 자원이 부족합니다. 은전 ${formatNumber(cost.silver ?? 0)} · 목재 ${formatNumber(cost.wood ?? 0)} · 철 ${formatNumber(cost.iron ?? 0)} 필요` }
  building.level += 1
  city.prosperity = Math.min(100, city.prosperity + (building.kind === 'agriculture' || building.kind === 'commerce' ? 4 : 2))
  if (building.kind === 'barracks') city.defense = Math.min(100, city.defense + 7)
  state.selectedCityId = city.id
  state.lastNotice = `${city.name} · ${building.name} ${building.level}단계 완공`
  return { ok: true, message: state.lastNotice }
}

export function researchCost(node: ResearchNode): string {
  return Object.entries(node.cost).map(([key, value]) => `${RESOURCE_META[key as ResourceKey].label} ${formatNumber(value ?? 0)}`).join(' · ')
}

export function unlockResearch(state: StrategyState, id: string): { ok: boolean; message: string } {
  const node = state.research.find(item => item.id === id)
  if (!node) return { ok: false, message: '연구 항목을 찾을 수 없습니다.' }
  if (node.unlocked) return { ok: false, message: '이미 완료한 연구입니다.' }
  if (node.prerequisite && !researchUnlocked(state, node.prerequisite)) return { ok: false, message: '선행 연구를 먼저 완료하십시오.' }
  if (!spendResources(state, node.cost)) return { ok: false, message: `연구 자원이 부족합니다. ${researchCost(node)}` }
  node.unlocked = true
  if (node.id.startsWith('scholar-') && node.id.endsWith('-12')) state.resources.influence += 180
  state.lastNotice = `연구 완료 · ${node.name} 효과가 천하에 적용됩니다.`
  return { ok: true, message: state.lastNotice }
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value)
}
