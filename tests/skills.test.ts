import { describe, expect, it } from 'vitest'
import { allGenerals, scaleGeneral, skillPower } from '../src/game/strategy'
import { BONDS, GENERAL_SKILLS, SKILL_MORALE_CAP, bondFor, isAwakened, skillCooldownFor } from '../src/game/skills'

describe('general skill plan', () => {
  const catalog = allGenerals()

  it('defines a skill for all 70 generals, passives for grade 3+ and awakenings for the 16 grade-5 generals (4 per faction)', () => {
    expect(catalog.every(general => GENERAL_SKILLS[general.id])).toBe(true)
    expect(catalog.filter(general => general.grade >= 3).every(general => GENERAL_SKILLS[general.id].passive)).toBe(true)
    expect(catalog.filter(general => general.grade <= 2).every(general => !GENERAL_SKILLS[general.id].passive)).toBe(true)
    const awakened = catalog.filter(general => GENERAL_SKILLS[general.id].awaken).map(general => general.id).sort()
    expect(awakened).toEqual(catalog.filter(general => general.grade === 5).map(general => general.id).sort())
    expect(awakened).toHaveLength(16)
  })

  it('never lets one skill exceed morale 40, even at Lv60 5 stars', () => {
    for (const general of catalog) {
      const maxed = scaleGeneral({ ...general, level: 1, stars: 1 }, 60, 5)
      expect(skillPower(maxed)).toBeLessThanOrEqual(SKILL_MORALE_CAP)
    }
  })

  it('keeps Lu Bu just under the cap at Lv60 5 stars and grows each growth step once', () => {
    const luBu = catalog.find(general => general.id === 'lu-bu')!
    const start = skillPower({ ...luBu, level: 1, stars: 1, skillRank: 1 })
    const end = skillPower(scaleGeneral({ ...luBu, level: 1, stars: 1 }, 60, 5))
    expect(start).toBeGreaterThan(20)
    expect(end).toBeGreaterThan(36)
    expect(end).toBeLessThanOrEqual(40)
    expect(end / start).toBeLessThan(2)
  })

  it('limits the grade-5 vs grade-3 gap within a skill type to about 1.7x', () => {
    const charge = catalog.filter(general => GENERAL_SKILLS[general.id].type === '돌격')
    const best = Math.max(...charge.filter(general => general.grade === 5).map(general => skillPower({ ...general, level: 1, stars: 1 })))
    const grade3 = charge.filter(general => general.grade === 3).map(general => skillPower({ ...general, level: 1, stars: 1 }))
    expect(best / Math.min(...grade3)).toBeLessThanOrEqual(1.8)
  })

  it('shortens cooldowns with stars but never below 5 seconds', () => {
    for (const general of catalog) {
      const one = skillCooldownFor({ ...general, stars: 1, skillRank: 1 })
      const five = skillCooldownFor({ ...general, stars: 5, skillRank: 5 })
      expect(five).toBeLessThanOrEqual(one)
      expect(five).toBeGreaterThanOrEqual(5)
    }
  })

  it('awakens only grade-5 generals at 5 stars', () => {
    const guanYu = catalog.find(general => general.id === 'guan-yu')!
    expect(isAwakened({ ...guanYu, stars: 4, skillRank: 4 })).toBe(false)
    expect(isAwakened({ ...guanYu, stars: 5, skillRank: 5 })).toBe(true)
  })

  it('picks the first matching bond in priority order', () => {
    expect(BONDS).toHaveLength(7)
    expect(bondFor(['zhang-jiao', 'zhang-bo', 'guan-hai'])?.id).toBe('yellow-heaven')
    expect(bondFor(['liu-bei', 'guan-yu', 'zhang-fei'])?.id).toBe('peach-garden')
    expect(bondFor(['guan-yu', 'zhao-yun', 'ma-chao'])?.id).toBe('five-tigers')
    expect(bondFor(['zhou-yu', 'huang-gai', 'cao-cao'])?.id).toBe('red-cliffs')
    expect(bondFor(['cao-cao', 'xun-yu', 'guo-jia'])).toBeNull()
  })
})
