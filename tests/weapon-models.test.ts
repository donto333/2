import { describe, expect, it } from 'vitest'

// 실사풍 무기 모델(사용자 제공 GLB를 줄여 꼭짓점 색으로 구운 것) — weapon-models.ts
const files = new Set(Object.keys(import.meta.glob('../public/assets/models/weapons/*.glb')).map(path => path.split('/').pop()))

describe('무장 · 병사 무기 모델', () => {
  it('무기 종류마다 모델 파일이 있다', () => {
    for (const name of ['sword-qinggang', 'fan-baiyu', 'glaive-qinglong', 'halberd-fangtian', 'snake-zhangba', 'blade-yanyue', 'saber-cavalry']) {
      expect(files.has(`${name}.glb`), name).toBe(true)
    }
  })
})
