import { SCENARIO_HONOR_BY_CHAPTER, SCENARIO_MANUALS_BY_CHAPTER, SCENARIO_SILVER_BY_CHAPTER, scenarioGold } from '../../server/economy.mjs'
export interface ScenarioReward {
  gold: number
  honor: number
  silver: number
  manuals: number
  grain: number
  wood: number
  iron: number
  influence: number
}

export interface ScenarioDefinition {
  id: string
  chapter: string
  era: string
  year: number
  title: string
  summary: string
  /** 시나리오 내용(100자 이내) */
  story: string
  deck: string[]
  reward: ScenarioReward
  chapterIndex: number
  entryIndex: number
  entryCount: number
}

type ChapterSeed = { chapter: string; era: string; deck: string[]; entries: Array<[number, string, string]> }

const CHAPTERS: ChapterSeed[] = [
  { chapter: '2.1', era: '후한 쇠퇴', deck: ['관우', '장비', '조운'], entries: [[184, '황건적의 난, 도원결의', '탁류 속에서 형제가 맹세하고 백성의 피난길을 연다.'], [185, '변장-한수의 난, 흑산적 준동', '서북의 반란과 산적의 습격이 한꺼번에 번진다.'], [186, '장온 출진', '조정의 명을 받은 원정군이 서량으로 진군한다.'], [187, '장거-장순의 난, 구성의 난', '연해와 변방에서 일어난 두 난을 동시에 진압한다.'], [188, '유언 독립', '익주의 군벌이 독자 노선을 선언하며 새로운 전선이 열린다.'], [189, '십상시의 난', '궁정의 혼란이 수도를 뒤흔들고 장수들이 황궁을 지킨다.'], [190, '반동탁연합', '군웅이 깃발 아래 모여 폭군의 서쪽 관문을 포위한다.'], [191, '연합 해산, 계교 전투', '동맹이 갈라진 틈을 타 계교에서 결전을 맞는다.'], [192, '동탁, 손견 사망', '두 영웅의 죽음 뒤 남겨진 군세를 수습하고 전란을 이어간다.']] },
  { chapter: '2.2', era: '군웅할거', deck: ['여포', '조운', '황충'], entries: [[193, '서주 대학살', '불길에 휩싸인 서주에서 백성을 구하고 학살을 막는다.'], [194, '군웅할거, 연주 공방전', '연주의 성문이 열리고 닫히며 군웅의 패권 다툼이 시작된다.'], [195, '손책의 양주 평정', '젊은 패왕이 강동의 수로를 따라 군현을 평정한다.'], [196, '조조의 헌제 옹립', '황제를 맞이한 조조의 조정이 새로운 질서를 세운다.'], [197, '원술의 황제 참칭', '참칭한 황제의 야심을 꺾고 회남의 민심을 되찾는다.'], [198, '여포 토벌전, 역경 전투', '난공불락의 요새를 포위하고 마지막 맹장을 몰아붙인다.']] },
  { chapter: '2.3', era: '관도대전', deck: ['조운', '장비', '제갈량'], entries: [[199, '원술 패망', '패망한 원술군의 잔병을 정리하고 중원을 안정시킨다.'], [200, '관도대전', '양 군세가 관도에서 맞붙고 보급로를 끊는 계책이 필요하다.'], [201, '유비의 형주행, 손책 사망', '형주로 향하는 유비를 호위하고 강동의 비보를 전한다.'], [202, '원소 사망', '원소의 죽음으로 흔들린 기주 세력 사이에 균열이 생긴다.'], [203, '원가 분열', '형제의 분열을 이용해 북방의 전선을 돌파한다.'], [204, '업 함락', '업성의 성벽을 무너뜨리고 기주의 패권을 결정한다.'], [205, '원담 패망', '마지막 원씨 세력을 격파하고 북방의 깃발을 거둔다.'], [206, '호관 함락', '험준한 호관을 넘어 새로운 전쟁의 시대를 준비한다.']] },
  { chapter: '2.4', era: '적벽대전', deck: ['제갈량', '주유', '황충'], entries: [[207, '삼고초려, 백랑산 전투', '와룡을 맞이한 유비가 백랑산의 적을 먼저 시험한다.'], [208, '적벽대전', '강 위에 불길이 번지고 수군과 책략의 승부가 펼쳐진다.'], [209, '남군 쟁탈전, 형남 평정', '적벽의 여세를 이어 남군과 형남의 요지를 확보한다.'], [210, '유비-손부인 혼인', '동맹의 혼인을 지키며 강동과 형주의 긴장을 누그러뜨린다.'], [211, '동관 전투', '서량의 철기와 관중의 방어선이 동관에서 충돌한다.'], [212, '유비 입촉', '촉으로 들어가는 길목에서 익주의 군세와 마주한다.'], [213, '낙성 전투', '낙성의 성문을 열어 익주 통일의 마지막 고비를 넘는다.']] },
  { chapter: '2.5', era: '한중 공방', deck: ['황충', '조운', '제갈량'], entries: [[214, '삼국정립', '세 나라의 국경이 굳어지고 한중이 핵심 요충지가 된다.'], [215, '합비 공방전', '합비 성벽 앞에서 기병의 돌파와 궁병의 엄호를 시험한다.'], [216, '유수구 전투', '물길을 둘러싼 공방에서 수운 보급을 지켜낸다.'], [217, '한중 공방전', '한중의 산악 관문을 두고 위촉의 정예가 격돌한다.'], [218, '정군산 전투', '정군산 고지를 선점해 북벌의 발판을 마련한다.'], [219, '형주 공방전', '형주의 성들을 지키며 사방에서 몰려오는 군세를 맞는다.']] },
  { chapter: '2.6', era: '제갈량의 남정', deck: ['제갈량', '관우', '위연'], entries: [[220, '관우 패사, 조조 사망', '두 영웅의 죽음이 남긴 공백 속에서 군을 재편한다.'], [221, '후한 멸망, 이릉전초전', '새 왕조의 깃발 아래 이릉으로 향하는 전초전을 치른다.'], [222, '이릉대전', '불타는 산림에서 오군의 포위를 뚫고 퇴로를 확보한다.'], [223, '유비 사망, 오로침공전', '황제의 유지를 이어 다섯 갈래 침공을 막아낸다.'], [224, '광릉 전투', '강동의 광릉에서 수륙 양면의 압박을 견딘다.'], [225, '칠종칠금', '남만의 맹세를 일곱 번 겨루며 피 없이 복속을 이끈다.'], [226, '북벌 준비', '군량과 병기를 모아 북벌의 첫 장을 준비한다.']] },
  { chapter: '2.7', era: '제갈량의 북벌', deck: ['제갈량', '조운', '위연'], entries: [[227, '출사표', '출사표를 올리고 한실 부흥을 향한 북벌을 시작한다.'], [228, '가정 전투', '가정의 고지를 잃지 않도록 보급로와 후퇴선을 지킨다.'], [229, '석정 전투, 진창 전투', '두 전선의 계책을 엮어 진창의 철문을 흔든다.'], [230, '손권의 황제 등극', '오의 새 황제 등극으로 삼국의 외교 균형이 변한다.'], [231, '기산 전투', '기산의 능선을 장악하고 장기전에 대비한다.'], [232, '이엄 실각', '군량을 둘러싼 내분을 수습하고 지휘 체계를 바로 세운다.'], [233, '마지막 북벌 준비', '마지막 원정을 위해 병력과 책략을 다시 가다듬는다.'], [234, '추풍오장원', '오장원의 가을바람 속에서 숙명의 결전을 맞는다.']] },
  { chapter: '2.8', era: '제갈량의 사후', deck: ['조운', '위연', '제갈량'], entries: [[235, '제갈량의 뒤를 잇는 강유', '강유가 스승의 유지를 이어 새로운 북벌을 준비한다.'], [238, '공손연의 난', '요동에서 일어난 반란이 중원의 국경까지 번지기 전에 진압한다.'], [241, '작피 전투, 상용 기습책', '작피의 전투와 상용의 기습을 연계해 적의 허리를 친다.'], [249, '고평릉 사변, 강유의 북벌', '궁정의 정변을 틈타 강유가 다시 북방으로 진군한다.'], [253, '제갈각의 북벌, 계속되는 강유의 북벌', '두 나라의 북벌이 맞물린 시대의 격랑을 돌파한다.'], [257, '제갈탄의 난', '수춘의 반란군을 진압하고 마지막 내전을 끝낸다.'], [263, '촉한멸망전', '촉한의 마지막 성벽에서 역사의 끝과 새로운 시작을 마주한다.']] },
]

const REWARD = (chapterIndex: number, entryIndex: number): ScenarioReward => ({
  // 금화·명망·은전·병서는 server/economy.mjs(서버와 같은 표). 금화가 성장의 중심이다.
  gold: scenarioGold(chapterIndex),
  honor: SCENARIO_HONOR_BY_CHAPTER[chapterIndex] ?? 200,
  silver: (SCENARIO_SILVER_BY_CHAPTER[chapterIndex] ?? 2000) + entryIndex * 100,
  manuals: SCENARIO_MANUALS_BY_CHAPTER[chapterIndex] ?? 20,
  grain: (800 + chapterIndex * 250) * 10,
  wood: (500 + chapterIndex * 160) * 10,
  iron: (300 + chapterIndex * 100) * 10,
  influence: (120 + chapterIndex * 40) * 10,
})

/** 시나리오별 내용(사건 순서대로, 100자 이내) */
const STORIES = [
  "장각의 황건적이 천하를 뒤덮자 유비·관우·장비가 복숭아밭에서 의형제를 맺는다. 의병을 일으켜 탁현으로 몰려오는 황건적을 막아라.",
  "황건의 불씨가 꺼지기도 전에 서량에서 변장과 한수가 반기를 들고, 흑산적이 하북을 휩쓴다. 흩어진 반란군을 하나씩 격파하라.",
  "거기장군 장온이 서량 반란군 토벌에 나서고, 젊은 동탁도 그 휘하에 선다. 원정군의 선봉이 되어 반란군의 기세를 꺾어라.",
  "어양의 장순과 장거가 스스로 천자를 칭하고, 장사에서는 구성이 난을 일으킨다. 남북으로 갈라진 두 반란을 차례로 진압하라.",
  "유언이 익주목이 되어 촉으로 들어가 독자 세력을 쌓는다. 조정의 힘이 미치지 않는 길목을 황건 잔당이 가로막는다.",
  "영제가 죽자 하진이 십상시에게 살해되고, 원소가 궁에 들어가 환관을 베어 낸다. 혼란을 틈타 동탁이 낙양으로 들어온다.",
  "황제를 갈아치운 동탁에 맞서 원소를 맹주로 제후들이 모인다. 호뢰관 앞에서 동탁군과 무쌍의 여포를 상대하라.",
  "낙양을 불태운 동탁은 장안으로 떠나고 연합군은 흩어진다. 원소와 공손찬이 계교에서 하북의 패권을 걸고 맞붙는다.",
  "왕윤과 초선의 계책으로 여포가 동탁을 벤다. 같은 무렵 손견은 현산에서 화살에 쓰러진다. 동탁의 잔당이 장안을 노린다.",
  "아버지를 잃은 조조가 복수를 내세워 서주를 휩쓸고 백성이 학살당한다. 도겸을 도우러 온 유비가 되어 피난민을 지켜라.",
  "조조가 서주에 매인 틈에 진궁이 여포를 끌어들여 연주를 빼앗는다. 복양성을 둘러싼 조조와 여포의 공방이 시작된다.",
  "옥새를 맡기고 원술에게서 병사를 빌린 손책이 장강을 건넌다. 유요를 몰아내고 강동을 평정해 소패왕의 이름을 떨쳐라.",
  "장안을 탈출한 헌제를 조조가 허도로 맞아들여 천자를 끼고 제후를 호령한다. 이를 막으려는 여포군이 길을 막아선다.",
  "옥새를 손에 넣은 원술이 수춘에서 스스로 황제를 칭한다. 천하의 비난 속에 고립된 원술군을 쳐서 회남을 되찾아라.",
  "조조와 유비가 손잡고 하비성을 물에 잠기게 해 여포를 몰아붙인다. 북쪽에서는 원소가 공손찬의 역경성을 무너뜨린다.",
  "원술이 몰락하고 하북을 통일한 원소가 대군을 남으로 돌린다. 선봉 안량과 문추가 백마와 연진으로 밀려온다.",
  "십만 원소군과 조조군이 관도에서 맞선다. 군량이 바닥날 무렵 허유의 밀고로 오소의 군량고를 불태울 기회가 왔다.",
  "원소 곁을 떠난 유비가 형주의 유표에게 몸을 맡긴다. 강동에서는 손책이 자객에게 쓰러지고 손권이 뒤를 잇는다.",
  "관도의 패배를 이기지 못한 원소가 병으로 죽는다. 후계를 정하지 못한 원씨 가문에 금이 가고, 조조가 하북으로 진군한다.",
  "원담과 원상 형제가 후계를 두고 서로 칼을 겨눈다. 형제의 다툼을 이용해 원씨 군을 하나씩 깨뜨려라.",
  "조조가 장하의 물길을 끌어 업성을 포위한다. 군량이 떨어져도 심배가 끝까지 버틴다. 기주의 수도를 함락하라.",
  "남피로 달아난 원담이 마지막 저항을 한다. 원담을 무너뜨리고 기주를 평정하라. 원희와 원상은 오환으로 달아난다.",
  "병주의 고간이 험준한 호관에 의지해 반기를 든다. 관문을 넘어 병주를 평정하면 하북 전체가 조조의 손에 들어간다.",
  "유비가 세 번 찾아가 제갈량을 군사로 맞는다. 백랑산에서 오환을 꺾은 조조가 이제 남쪽 형주를 노린다.",
  "형주를 삼킨 조조의 대군이 장강에 이른다. 손권과 유비가 손잡고, 주유와 제갈량이 불로 조조의 함대를 태운다.",
  "적벽에서 진 뒤에도 조인이 강릉성을 굳게 지킨다. 주유가 강릉을 노리는 사이 유비는 형주 남쪽 네 군을 평정한다.",
  "손권이 누이를 유비에게 시집보내며 동맹을 다진다. 오와 촉의 혼인을 깨려는 조조군의 기습을 막아라.",
  "서량의 마초와 한수가 동관에서 조조와 맞선다. 서량 철기의 돌격을 견디며 가후의 이간계가 둘을 갈라놓기를 기다려라.",
  "익주의 유장이 장로를 막으려 유비를 부른다. 방통의 계책을 따라 가맹관에서 군을 돌려 성도로 향한다.",
  "성도로 가는 마지막 관문 낙성이 1년 가까이 버틴다. 방통이 낙봉파에서 화살에 쓰러지지만 유비는 끝내 성문을 연다.",
  "유장이 항복하고 유비가 익주를 차지한다. 위·촉·오가 솥발처럼 서자 조조는 한중을 노리고 군을 서쪽으로 돌린다.",
  "손권의 대군이 합비를 포위하지만 장료가 팔백 결사대로 돌격해 오군을 흔든다. 소요진에서 장료의 기병을 막아라.",
  "조조가 다시 유수구로 남하하고 손권은 수군으로 맞선다. 장강 어귀의 수채를 지키며 위군의 도하를 막아라.",
  "유비가 법정의 계책을 받아 한중으로 출병한다. 양평관을 지키는 하후연과 장합의 위군과 산악 관문에서 맞선다.",
  "황충이 정군산 고지에서 내리달려 하후연을 벤다. 높은 곳을 먼저 차지해 위군의 진형을 위에서 무너뜨려라.",
  "관우가 번성을 포위하고 물길로 우금의 칠군을 잠기게 한다. 그러나 여몽이 몰래 형주를 노리고 서황의 원군이 다가온다.",
  "형주를 잃은 관우가 맥성에서 사로잡혀 숨을 거두고, 조조도 낙양에서 세상을 떠난다. 오군의 추격 속에 병사를 수습하라.",
  "조비가 한 황제의 자리를 빼앗자 유비도 성도에서 황제에 오른다. 관우의 원수를 갚기 위한 동쪽 원정이 시작된다.",
  "칠백 리에 걸친 촉군 진영에 육손이 불을 놓는다. 불타는 숲에서 포위를 뚫고 황제가 백제성으로 물러날 길을 열어라.",
  "유비가 백제성에서 제갈량에게 아들을 맡기고 세상을 떠난다. 위가 다섯 길로 쳐들어오지만 제갈량이 이를 막아낸다.",
  "조비가 함대를 이끌고 광릉까지 내려온다. 서성이 강가에 가짜 성벽을 세워 위군을 속인다. 장강 방어선을 지켜라.",
  "남중의 맹획이 반란을 일으키자 제갈량이 친히 남쪽으로 나선다. 일곱 번 사로잡고 일곱 번 놓아주어 마음을 얻어라.",
  "조비가 죽고 조예가 위를 잇는다. 남중을 안정시킨 제갈량이 한중에 군을 모아 북벌을 준비한다.",
  "제갈량이 유선에게 출사표를 올리고 한중에서 북으로 진군한다. 선제의 뜻을 이어 한 왕실을 되살리기 위한 첫걸음이다.",
  "마속이 산 위에 진을 쳤다가 장합에게 물길을 끊긴다. 가정이 무너지기 전에 보급로를 지키고 물러나는 병사를 엄호하라.",
  "오의 육손이 석정에서 조휴를 크게 무찌른다. 제갈량은 진창성을 치지만 학소가 이십여 일을 버텨 낸다.",
  "손권이 황제에 올라 촉과 천하를 나누는 맹약을 맺는다. 그 틈에 위의 조진이 한중을 노리고 진군한다.",
  "제갈량이 목우로 군량을 나르며 다시 기산으로 나선다. 사마의가 굳게 지키는 사이 물러나는 촉군을 쫓던 장합이 쓰러진다.",
  "군량 운송을 맡은 이엄이 거짓 보고를 하다 들통나 쫓겨난다. 흔들린 보급선을 다시 세우고 북벌군을 정비하라.",
  "제갈량이 군량을 쌓고 유마를 만들며 마지막 북벌을 준비한다. 위군의 정찰대가 길목을 엿본다.",
  "오장원에서 사마의와 백여 일을 맞선 제갈량이 가을바람 속에 숨을 거둔다. 남긴 계책대로 군을 무사히 물려라.",
  "제갈량의 뒤를 장완과 비의가 잇고, 강유가 스승의 뜻을 품고 군사를 기른다. 위의 국경 수비대가 강유를 시험한다.",
  "요동의 공손연이 연왕을 칭하며 위에 반기를 든다. 사마의가 장마를 뚫고 양평성을 포위해 반란을 끝낸다.",
  "오의 전종이 작피에서 위군과 맞붙고, 촉은 물길을 따라 상용을 기습할 계획을 세운다. 두 전선을 엮어 위의 허리를 쳐라.",
  "사마의가 고평릉 사변으로 조상 일파를 몰아내고 위의 실권을 쥔다. 혼란을 틈타 강유가 다시 북쪽으로 나선다.",
  "오의 제갈각이 합비 신성을 공격하고, 강유는 적도를 포위한다. 두 나라의 북벌이 맞물린 틈에 위의 방어선을 흔들어라.",
  "위의 제갈탄이 수춘에서 사마소에 맞서 일어나고 오에 구원을 청한다. 포위된 수춘을 둘러싼 마지막 내전이 벌어진다.",
  "종회가 검각을 치는 사이 등애가 음평의 험로를 넘어 성도에 이른다. 유선이 항복하기 전, 강유와 함께 마지막 성벽을 지켜라.",
]

export const SCENARIOS: ScenarioDefinition[] = CHAPTERS.flatMap((chapter, chapterIndex) => chapter.entries.map(([year, title, summary], entryIndex) => ({
  id: `scenario-${year}-${chapterIndex}-${entryIndex}`,
  chapter: chapter.chapter,
  era: chapter.era,
  year,
  title,
  summary,
  story: '',
  deck: chapter.deck,
  reward: REWARD(chapterIndex, entryIndex),
  chapterIndex,
  entryIndex,
  entryCount: chapter.entries.length,
}))).map((scenario, index) => ({ ...scenario, story: STORIES[index] ?? scenario.summary }))

export function scenarioById(id: string): ScenarioDefinition | undefined {
  return SCENARIOS.find(scenario => scenario.id === id)
}

export function firstClearReward(scenario: ScenarioDefinition, clearedIds: readonly string[]): ScenarioReward | null {
  return clearedIds.includes(scenario.id) ? null : scenario.reward
}

// ── 시나리오 적 덱 (전투 개선안 · 촉 시점 기준, 위·오는 같은 사건의 반대편) ──
type FactionKey = '촉한' | '위나라' | '오나라'
interface EnemyPlan { levels: [number, number]; deck: Record<FactionKey, string[]>; byYear?: Record<number, Partial<Record<FactionKey, string[]>>> }
const YELLOW_TURBANS = ['zhang-jiao', 'zhang-bo', 'zhang-liang']
const YELLOW_VANGUARD = ['zhang-liang', 'guan-hai', 'zhou-cang']
const DONG_ZHUO = ['dong-zhuo', 'lu-bu', 'gao-shun']
const same = (deck: string[]): Record<FactionKey, string[]> => ({ 촉한: deck, 위나라: deck, 오나라: deck })

const ENEMY_PLANS: EnemyPlan[] = [
  { levels: [1, 8], deck: same(DONG_ZHUO), byYear: { 184: same(YELLOW_VANGUARD), 185: same(YELLOW_TURBANS), 186: same(YELLOW_TURBANS), 187: same(['zhang-bo', 'zhang-liang', 'guan-hai']), 188: same(YELLOW_TURBANS), 189: same(YELLOW_TURBANS) } },
  { levels: [8, 14], deck: { 촉한: ['lu-bu', 'chen-gong', 'gao-shun'], 위나라: ['lu-bu', 'chen-gong', 'gao-shun'], 오나라: ['yuan-shu', 'wen-ping', 'song-xian'] }, byYear: { 197: same(['yuan-shu', 'wen-ping', 'song-xian']) } },
  { levels: [14, 20], deck: same(['yuan-shao', 'yan-liang', 'wen-chou']) },
  { levels: [20, 26], deck: { 촉한: ['cao-cao', 'cao-ren', 'zhang-liao'], 위나라: ['zhou-yu', 'huang-gai', 'zhuge-liang'], 오나라: ['cao-cao', 'cao-ren', 'zhang-liao'] }, byYear: { 211: same(['ma-chao', 'ma-teng', 'han-sui']) } },
  { levels: [26, 32], deck: { 촉한: ['zhang-he', 'xu-huang', 'cao-hong'], 위나라: ['huang-zhong', 'fa-zheng', 'zhao-yun'], 오나라: ['zhang-liao', 'yue-jin', 'li-dian'] }, byYear: { 215: { 촉한: ['zhang-liao', 'yue-jin', 'li-dian'], 위나라: ['sun-quan', 'gan-ning', 'ling-tong'] } } },
  { levels: [32, 38], deck: { 촉한: ['lu-xun', 'lu-meng', 'gan-ning'], 위나라: ['guan-yu', 'guan-ping', 'zhang-bao'], 오나라: ['liu-bei', 'guan-xing', 'zhang-bao'] }, byYear: { 225: same(['meng-huo', 'zhu-rong', 'guan-hai']) } },
  { levels: [39, 46], deck: { 촉한: ['simayi', 'zhang-he', 'xu-huang'], 위나라: ['zhuge-liang', 'zhao-yun', 'wei-yan'], 오나라: ['simayi', 'zhang-he', 'xu-huang'] } },
  { levels: [47, 55], deck: { 촉한: ['simayi', 'zhang-he', 'yu-jin'], 위나라: ['wei-yan', 'wang-ping', 'guan-xing'], 오나라: ['simayi', 'zhang-he', 'yu-jin'] } },
]

export function scenarioEnemyIds(scenario: ScenarioDefinition, faction: string): string[] {
  const plan = ENEMY_PLANS[scenario.chapterIndex] ?? ENEMY_PLANS[0]
  const key: FactionKey = faction === '위나라' || faction === '오나라' ? faction : '촉한'
  return plan.byYear?.[scenario.year]?.[key] ?? plan.deck[key]
}

/** 장 안에서 뒤 사건일수록 높아지는 적 평균 레벨 */
export function scenarioEnemyLevel(scenario: ScenarioDefinition): number {
  const [low, high] = (ENEMY_PLANS[scenario.chapterIndex] ?? ENEMY_PLANS[0]).levels
  const span = Math.max(1, scenario.entryCount - 1)
  return Math.round(low + (high - low) * scenario.entryIndex / span)
}

// ── 별 기록: scenarioCleared 목록 안에 'stars:<별>:<id>'로 함께 저장한다(DB 변경 없음) ──
const STAR_PREFIX = 'stars:'
export function scenarioStars(cleared: readonly string[], id: string): number {
  const entry = cleared.find(item => item.startsWith(STAR_PREFIX) && item.endsWith(`:${id}`))
  return entry ? Number(entry.split(':')[1]) || 0 : 0
}

export function recordScenarioStars(cleared: string[], id: string, stars: number): boolean {
  const best = scenarioStars(cleared, id)
  if (stars <= best) return false
  const index = cleared.findIndex(item => item.startsWith(STAR_PREFIX) && item.endsWith(`:${id}`))
  if (index >= 0) cleared.splice(index, 1)
  cleared.push(`${STAR_PREFIX}${Math.min(3, stars)}:${id}`)
  return true
}

export function clearedScenarioCount(cleared: readonly string[]): number {
  return cleared.filter(item => !item.startsWith(STAR_PREFIX)).length
}
