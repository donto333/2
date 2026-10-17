import { describe, expect, it } from 'vitest'
import { TIANMING_RIDERS, heroLook } from '../src/game/hero-style'
import { templateGeneral } from '../src/game/strategy'

// 프로젝트 타입 설정에 Node 타입이 없으므로(node:fs 불가) Vite의 파일 목록으로 확인한다
const riderFiles = new Set(Object.keys(import.meta.glob('../public/assets/models/riders/*.glb')).map(path => path.split('/').pop()))

describe('천명 무장 전용 기수 모델', () => {
  it('모델 파일이 있고, 천명 기운 · 깃발만 두르며 수염 · 망토 장식은 모델에 맡긴다', () => {
    expect(TIANMING_RIDERS.size).toBe(16)
    for (const id of TIANMING_RIDERS) {
      expect(riderFiles.has(`${id}.glb`), id).toBe(true)
      const general = templateGeneral(id)!
      expect(general.grade, id).toBe(5)
      const look = heroLook(general)
      expect(look.rider).toBe(id)
      expect(look.model).toBe('cavalry')
      expect(look.tianming?.ornaments ?? []).toHaveLength(0)
      expect(look.tianming?.cape).toBeUndefined()
      expect(look.dress).toBeUndefined()
      expect(look.skin).toBeUndefined()
    }
  })
})
