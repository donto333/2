import { describe, expect, it } from 'vitest'
import { CASH_SHOP_PRODUCTS, EQUIPMENT_GRADE_META, EQUIPMENT_SET_META, MYTHIC_EVENT_EQUIPMENT, MYTHIC_SHOP_EQUIPMENT, consumeDuelAttempt, duelAttemptsRemaining, purchaseCashShopProduct, purchaseMythicEquipment, allGenerals, combatPower, createInitialState, drawEquipment, enhanceEquipment, ensureResearchRoster, equipmentBonus, equipmentPower, equipmentSetCounts, equipEquipment, findGeneral, recruit, skillDetail, skillPower, skillUnlockLevel, toggleFormation, totalPower, unequipEquipment, upgrade, unlockResearch, unlockSkill } from '../src/game/strategy'

describe('commander attributes', () => {
  it('starts with the four battle attributes and uses them in combat power', () => {
    const state = createInitialState()
    const guanYu = findGeneral(state, 'guan-yu')!
    expect(guanYu.leadership).toBe(96)
    expect(guanYu.martial).toBe(98)
    expect(guanYu.stratagem).toBe(72)
    expect(guanYu.speed).toBe(86)
    expect(combatPower(guanYu)).toBeGreaterThan(0)
  })

  it('raises the four attributes when a general is upgraded', () => {
    const state = createInitialState()
    const guanYu = findGeneral(state, 'guan-yu')!
    const before = { leadership: guanYu.leadership, martial: guanYu.martial, stratagem: guanYu.stratagem, speed: guanYu.speed }
    const result = upgrade(state, 'guan-yu')
    expect(result.ok).toBe(true)
    expect(guanYu.leadership).toBe(before.leadership + 3)
    expect(guanYu.martial).toBe(before.martial + 7)
    expect(guanYu.stratagem).toBe(before.stratagem + 2)
    expect(guanYu.speed).toBe(before.speed + 2)
  })

  it('makes higher stars unlock skills earlier and strengthen skill power', () => {
    const state = createInitialState()
    const general = allGenerals().find(item => item.id === 'lu-bu')!
    state.generals.push(general)
    general.stars = 3
    general.level = skillUnlockLevel(general)
    const beforePower = skillPower(general)
    expect(skillUnlockLevel(general)).toBe(8)
    expect(unlockSkill(state, general.id).ok).toBe(true)
    expect(general.skillUnlocked).toBe(true)
    expect(skillPower(general)).toBe(beforePower)
    general.skillRank = 4
    general.skillPower = skillPower(general) + 18
    expect(skillPower(general)).toBeGreaterThan(beforePower)
  })

  it('applies the current star tier to every future level-up stat gain', () => {
    const state = createInitialState()
    const general = findGeneral(state, 'guan-yu')!
    general.stars = 4
    const beforeAttack = general.attack
    const beforeMartial = general.martial
    expect(upgrade(state, general.id).ok).toBe(true)
    expect(general.attack - beforeAttack).toBe(10)
    expect(general.martial - beforeMartial).toBe(10)
  })

  it('includes the original roster plus 50 new Three Kingdoms generals', () => {
    const generals = allGenerals()
    expect(generals).toHaveLength(65)
    expect(new Set(generals.map(general => general.id)).size).toBe(65)
    expect(generals.some(general => general.id === 'liu-bei')).toBe(true)
    expect(generals.some(general => general.id === 'da-qiao')).toBe(true)
  })

  it('provides trigger, target, effect, duration, and cooldown details for every general skill', () => {
    const details = allGenerals().map(general => skillDetail(general))
    expect(details).toHaveLength(65)
    for (const detail of details) {
      expect(detail.trigger.length).toBeGreaterThan(0)
      expect(detail.target.length).toBeGreaterThan(0)
      expect(detail.effect.length).toBeGreaterThan(0)
      expect(detail.duration.length).toBeGreaterThan(0)
      expect(detail.cooldown).toMatch(/초/)
    }
  })

  it('returns ten visible rewards for a ten-pull and charges the ten-pull cost', () => {
    const state = createInitialState()
    const before = state.honor
    const result = recruit(state, 10)
    expect(result.ok).toBe(true)
    expect(result.rewards).toHaveLength(10)
    expect(state.honor).toBe(before - 900)
  })

  it('keeps formation at three slots and replaces the last slot when full', () => {
    const state = createInitialState()
    state.generals.push(findGeneral({ ...state, generals: allGenerals() } as typeof state, 'liu-bei')!)
    toggleFormation(state, 'liu-bei')
    expect(state.formation).toEqual(['guan-yu', 'zhao-yun', 'liu-bei'])
    toggleFormation(state, 'zhuge-liang')
    expect(state.formation).toHaveLength(3)
    expect(state.formation[2]).toBe('zhuge-liang')
  })

  it('starts with 58 technologies across four branches', () => {
    const state = createInitialState()
    expect(state.research).toHaveLength(58)
    expect(new Set(state.research.map(node => node.id)).size).toBe(58)
    expect(state.research.filter(node => node.branch === '농정')).toHaveLength(14)
    expect(state.research.filter(node => node.branch === '군제')).toHaveLength(15)
  })

  it('backfills the 50 new technologies into legacy eight-node saves', () => {
    const state = createInitialState()
    state.research = state.research.slice(0, 8)
    ensureResearchRoster(state)
    expect(state.research).toHaveLength(58)
    expect(state.research.some(node => node.id === 'military-13')).toBe(true)
  })

  it('requires the expanded research chain before unlocking a later technology', () => {
    const state = createInitialState()
    expect(unlockResearch(state, 'agri-2').ok).toBe(false)
    expect(unlockResearch(state, 'irrigation').ok).toBe(true)
    expect(unlockResearch(state, 'granary').ok).toBe(true)
    expect(unlockResearch(state, 'agri-1').ok).toBe(true)
    expect(unlockResearch(state, 'agri-2').ok).toBe(true)
  })

  it('starts with three equipment slots and applies equipped stats to formation power', () => {
    const state = createInitialState()
    expect(state.equipmentInventory).toHaveLength(3)
    expect(state.equipmentLoadouts['guan-yu'].weapon).toBe('starter-weapon')
    const before = state.equipmentInventory[0].baseValue
    const powerBefore = combatPower(findGeneral(state, 'guan-yu')!)
    expect(state.equipmentInventory[0].mainStat).toBe('martial')
    expect(powerBefore).toBeGreaterThan(0)
    expect(state.equipmentInventory[0].baseValue).toBe(before)
  })

  it('allows equipment draws only through legendary and never mythic', () => {
    const state = createInitialState()
    const result = drawEquipment(state, 10)
    expect(result.ok).toBe(true)
    expect(result.rewards).toHaveLength(10)
    expect(result.rewards.every(item => item.grade !== 'mythic')).toBe(true)
    expect(EQUIPMENT_GRADE_META.mythic.drawWeight).toBe(0)
    expect(MYTHIC_EVENT_EQUIPMENT.mythicEventOnly).toBe(true)
    expect(MYTHIC_EVENT_EQUIPMENT.grade).toBe('mythic')
  })

  it('equips an item to a general, replaces the same slot, and enhances with silver and iron', () => {
    const state = createInitialState()
    const draw = drawEquipment(state, 1)
    const item = draw.rewards[0]
    const beforeSilver = state.silver
    const beforeLevel = item.level
    expect(equipEquipment(state, 'guan-yu', item.id).ok).toBe(true)
    expect(state.equipmentLoadouts['guan-yu'][item.type]).toBe(item.id)
    expect(enhanceEquipment(state, item.id).ok).toBe(true)
    expect(item.level).toBe(beforeLevel + 1)
    expect(state.silver).toBeLessThan(beforeSilver)
  })

  it('activates two-piece and three-piece set abilities for a general', () => {
    const state = createInitialState()
    const guanYu = findGeneral(state, 'guan-yu')!
    const commandItems = ['set-command-armor', 'set-command-accessory'].map((id, index) => ({
      id, name: `천군 테스트 ${index}`, type: index === 0 ? 'armor' as const : 'accessory' as const, set: 'command' as const, grade: 'rare' as const, level: 1, mainStat: 'leadership' as const, baseValue: 12, skillName: EQUIPMENT_SET_META.command.skillName, skillDescription: EQUIPMENT_SET_META.command.skillDescription,
    }))
    state.equipmentInventory.push(...commandItems)
    expect(equipEquipment(state, guanYu.id, commandItems[0].id).ok).toBe(true)
    expect(equipEquipment(state, guanYu.id, commandItems[1].id).ok).toBe(true)
    expect(equipmentSetCounts(state, guanYu.id).command).toBe(2)
    expect(equipmentBonus(state, guanYu.id).leadership).toBe(34)
    const third = { ...commandItems[0], id: 'set-command-weapon', type: 'weapon' as const }
    state.equipmentInventory.push(third)
    expect(equipEquipment(state, guanYu.id, third.id).ok).toBe(true)
    expect(equipmentSetCounts(state, guanYu.id).command).toBe(3)
    expect(equipmentBonus(state, guanYu.id).leadership).toBe(54)
  })

  it('unequips a selected slot and removes its contribution from the general', () => {
    const state = createInitialState()
    expect(state.equipmentLoadouts['guan-yu'].weapon).toBe('starter-weapon')
    const equippedPower = equipmentPower(state, 'guan-yu')
    expect(equippedPower).toBeGreaterThan(0)
    const formationPower = totalPower(state)
    expect(unequipEquipment(state, 'guan-yu', 'weapon').ok).toBe(true)
    expect(state.equipmentLoadouts['guan-yu'].weapon).toBeUndefined()
    expect(equipmentPower(state, 'guan-yu')).toBeLessThan(equippedPower)
    expect(totalPower(state)).toBeLessThan(formationPower)
    expect(unequipEquipment(state, 'guan-yu', 'weapon').ok).toBe(false)
  })
  it('limits user duels to five per local day and resets on the next day', () => {
    const state = createInitialState()
    expect(duelAttemptsRemaining(state, new Date('2026-10-04T09:00:00').getTime())).toBe(5)
    for (let i = 0; i < 5; i++) expect(consumeDuelAttempt(state, new Date('2026-10-04T09:00:00').getTime()).ok).toBe(true)
    expect(consumeDuelAttempt(state, new Date('2026-10-04T09:00:00').getTime()).ok).toBe(false)
    expect(duelAttemptsRemaining(state, new Date('2026-10-05T09:00:00').getTime())).toBe(5)
  })

  it('awards and spends twenty mythic fragments on each shop item', () => {
    const state = createInitialState()
    state.mythicFragments = 20
    const result = purchaseMythicEquipment(state, 'armor')
    expect(result.ok).toBe(true)
    expect(state.mythicFragments).toBe(0)
    expect(state.equipmentInventory.some(item => item.type === 'armor' && item.grade === 'mythic')).toBe(true)
    expect(MYTHIC_SHOP_EQUIPMENT).toHaveLength(12)
    expect(new Set(MYTHIC_SHOP_EQUIPMENT.map(item => item.set)).size).toBe(4)
    expect(new Set(MYTHIC_SHOP_EQUIPMENT.map(item => item.mainStat)).size).toBe(4)
    for (const set of ['command', 'martial', 'stratagem', 'speed'] as const) {
      expect(MYTHIC_SHOP_EQUIPMENT.filter(item => item.set === set)).toHaveLength(3)
    }
    for (const type of ['weapon', 'armor', 'accessory'] as const) {
      expect(MYTHIC_SHOP_EQUIPMENT.filter(item => item.type === type)).toHaveLength(4)
    }
    state.mythicFragments = 20
    expect(purchaseMythicEquipment(state, 'shop-mythic-speed-accessory').ok).toBe(true)
    expect(state.equipmentInventory.some(item => item.id.startsWith('shop-mythic-speed-accessory-'))).toBe(true)
    expect(purchaseMythicEquipment(state, 'weapon').ok).toBe(false)
  })

  it('offers five non-fragment resource products and grants the purchased resource', () => {
    const state = createInitialState()
    expect(CASH_SHOP_PRODUCTS).toHaveLength(5)
    const before = { ...state.resources, silver: state.silver }
    for (const product of CASH_SHOP_PRODUCTS) {
      expect(purchaseCashShopProduct(state, product.id).ok).toBe(true)
      const after = product.resource === 'silver' ? state.silver : state.resources[product.resource]
      const initial = product.resource === 'silver' ? before.silver : before[product.resource]
      expect(after).toBe(initial + product.amount)
    }
    expect(purchaseCashShopProduct(state, 'unknown-product').ok).toBe(false)
  })

})
