import { describe, expect, it } from 'vitest'
import { GRADE_DOWN_COMPENSATION, PREVIOUS_GRADES, allGenerals, createInitialState, migrateGeneralGrades, templateGeneral } from '../src/game/strategy'

describe('무장 등급 재설정(삼국지 속 역할·비중, 천명은 진영마다 4명)', () => {
  it('천명은 촉·위·오·군웅에서 4명씩 16명', () => {
    const heaven = allGenerals().filter(general => general.grade === 5).map(general => general.name).sort()
    expect(heaven).toEqual(['유비', '제갈량', '관우', '조운', '조조', '사마의', '장료', '하후돈', '손권', '손책', '주유', '육손', '여포', '동탁', '원소', '장각'].sort())
    expect(allGenerals().length).toBe(73)
    expect(templateGeneral('zhang-fei')?.grade).toBe(4)
    expect(['송헌', '관해', '채문희'].sort()).toEqual(allGenerals().filter(general => general.grade === 1).map(general => general.name).sort())
  })
  it('보유 무장을 새 등급으로 옮기고, 내려간 등급만큼 옥패로 보상한다(두 번 불러도 한 번만)', () => {
    const state = createInitialState()
    const old = (id: string) => {
      const now = templateGeneral(id)!
      return { ...now, grade: PREVIOUS_GRADES[id], leadership: now.leadership + 30, level: 7 }
    }
    state.generals = [old('guo-jia'), old('zhang-liang'), old('sun-quan')]
    const honor = state.honor
    const before = state.generals.map(general => general.leadership)
    const first = migrateGeneralGrades(state)
    expect(first.changed).toBe(3)
    expect(state.generals.map(general => general.grade)).toEqual([4, 2, 5])
    // 곽가 5→4(1000), 장량 4→2(300+100), 손권은 올라가 보상 없음
    expect(first.honor).toBe(GRADE_DOWN_COMPENSATION[5] + GRADE_DOWN_COMPENSATION[4] + GRADE_DOWN_COMPENSATION[3])
    expect(state.honor).toBe(honor + first.honor)
    // 확장 무장 능력치는 등급 기본값 차이만큼 움직인다(내려가면 줄고, 올라가면 는다), 레벨은 그대로
    expect(state.generals[0].leadership).toBeLessThan(before[0])
    expect(state.generals[2].leadership).toBeGreaterThan(before[2])
    expect(state.generals[0].level).toBe(7)
    const second = migrateGeneralGrades(state)
    expect(second.changed).toBe(0)
    expect(state.honor).toBe(honor + first.honor)
  })
})
