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

export interface ScenarioDialogueLine {
  speaker: string
  text: string
}

export interface ScenarioDefinition {
  id: string
  chapter: string
  era: string
  year: number
  title: string
  summary: string
  dialogue: ScenarioDialogueLine[]
  deck: string[]
  reward: ScenarioReward
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
  gold: 10 + chapterIndex * 5 + entryIndex * 2,
  honor: (80 + chapterIndex * 30) * 10,
  silver: (500 + chapterIndex * 180 + entryIndex * 40) * 10,
  manuals: (20 + chapterIndex * 5) * 10,
  grain: (800 + chapterIndex * 250) * 10,
  wood: (500 + chapterIndex * 160) * 10,
  iron: (300 + chapterIndex * 100) * 10,
  influence: (120 + chapterIndex * 40) * 10,
})

export const SCENARIOS: ScenarioDefinition[] = CHAPTERS.flatMap((chapter, chapterIndex) => chapter.entries.map(([year, title, summary], entryIndex) => ({
  id: `scenario-${year}-${chapterIndex}-${entryIndex}`,
  chapter: chapter.chapter,
  era: chapter.era,
  year,
  title,
  summary,
  dialogue: [
    { speaker: '전령', text: `${year}년, ${title}의 전운이 전장을 덮었습니다.` },
    { speaker: chapter.deck[0], text: summary },
    { speaker: '지휘관', text: '진형을 갖추고 이 전투를 끝내자. 승리하면 군량과 금화를 백성에게 돌리겠다.' },
  ],
  deck: chapter.deck,
  reward: REWARD(chapterIndex, entryIndex),
})))

export function scenarioById(id: string): ScenarioDefinition | undefined {
  return SCENARIOS.find(scenario => scenario.id === id)
}

export function firstClearReward(scenario: ScenarioDefinition, clearedIds: readonly string[]): ScenarioReward | null {
  return clearedIds.includes(scenario.id) ? null : scenario.reward
}
