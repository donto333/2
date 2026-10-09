import { describe, expect, it } from 'vitest'
import { EQUIPMENT_GRADE_META, EQUIPMENT_SPECIALTIES, EQUIPMENT_SET_META, GRADE_POWER_MULTIPLIER, GOLD_PACKAGES, HONOR_SHOP_PACKAGES, MYTHIC_EVENT_EQUIPMENT, MYTHIC_SHOP_EQUIPMENT, RESOURCE_SHOP_PACKAGES, consumeDuelAttempt, duelAttemptsRemaining, ensurePrelaunchDailyGold, purchaseGoldPackage, purchaseHonorPackage, purchaseResourcePackage, purchaseMythicEquipment, allGenerals, combatPower, createInitialState, drawEquipment, enhanceEquipment, ensureEquipmentState, ensureResearchRoster, equipmentBonus, equipmentInventoryCount, equipmentPower, equipmentSetCounts, equipEquipment, findGeneral, migrateLegacyStarterRoster, recruit, skillDetail, skillPower, skillUnlockLevel, toggleFormation, totalPower, unequipEquipment, upgrade, unlockResearch, unlockSkill } from '../src/game/strategy'
import { effectLoadout } from '../src/game/battle-effects'

describe('commander attributes', () => {
  it('starts with the four battle attributes and uses them in combat power', () => {
    const state = createInitialState()
    expect(state.generals).toHaveLength(3)
    expect(state.generals.every(general => general.grade === 3 && general.level === 1)).toBe(true)
    expect(new Set(state.generals.map(general => general.id)).size).toBe(3)
    expect(state.generals.every(general => general.leadership > 0 && general.martial > 0 && general.stratagem > 0 && general.speed > 0)).toBe(true)
    expect(state.generals.every(general => combatPower(general) > 0)).toBe(true)
  })

  it('makes grade 5 the strongest grade for both combat power and skill performance', () => {
    const template = { ...createInitialState().generals[0], level: 1, stars: 1, skillRank: 1, skillPower: 100 }
    const generals = ([1, 2, 3, 4, 5] as const).map(grade => ({ ...template, grade }))
    const combat = generals.map(general => combatPower(general))
    const skills = generals.map(general => skillPower(general))
    expect(GRADE_POWER_MULTIPLIER[5]).toBeGreaterThan(GRADE_POWER_MULTIPLIER[4])
    expect(combat).toEqual([...combat].sort((left, right) => left - right))
    expect(skills).toEqual([...skills].sort((left, right) => left - right))
    expect(combat[4]).toBeGreaterThan(combat[3])
    expect(skills[4]).toBeGreaterThan(skills[3])
  })

  it('migrates the untouched legacy fixed starter trio to random grade-3 starters', () => {
    const state = createInitialState()
    state.generals = ['guan-yu', 'zhao-yun', 'zhuge-liang'].map(id => ({ ...allGenerals().find(general => general.id === id)! }))
    state.formation = ['guan-yu', 'zhao-yun', 'zhuge-liang']
    state.equipmentLoadouts = { 'guan-yu': { weapon: 'starter-weapon' }, 'zhao-yun': { armor: 'starter-armor' }, 'zhuge-liang': { accessory: 'starter-accessory' } }
    expect(migrateLegacyStarterRoster(state)).toBe(true)
    expect(state.generals.every(general => general.grade === 3 && general.level === 1)).toBe(true)
    expect(state.generals.map(general => general.id)).not.toEqual(['guan-yu', 'zhao-yun', 'zhuge-liang'])
    expect(migrateLegacyStarterRoster(state)).toBe(false)
  })

  it('raises the four attributes when a general is upgraded', () => {
    const state = createInitialState()
    const general = state.generals[0]
    const before = { leadership: general.leadership, martial: general.martial, stratagem: general.stratagem, speed: general.speed }
    const result = upgrade(state, general.id)
    expect(result.ok).toBe(true)
    expect(general.leadership).toBe(before.leadership + 3)
    expect(general.martial).toBe(before.martial + 7)
    expect(general.stratagem).toBe(before.stratagem + 2)
    expect(general.speed).toBe(before.speed + 2)
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
    const general = state.generals[0]
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

  it('aligns support concepts with cleanse-capable battle loadouts', () => {
    const catalog = allGenerals()
    expect(skillDetail(catalog.find(general => general.id === 'zhuge-liang')!).category).toBe('정화·치료')
    expect(skillDetail(catalog.find(general => general.id === 'lu-bu')!).category).toBe('디버프')
    expect(skillDetail(catalog.find(general => general.id === 'zhao-yun')!).category).toBe('버프')
    expect(effectLoadout('zhuge-liang', '책사').cleanse).toBe(true)
    expect(effectLoadout('liu-bei', '보병').cleanse).toBe(true)
  })

  it('returns ten visible rewards for a ten-pull and charges the ten-pull cost', () => {
    const state = createInitialState()
    const before = state.honor
    const result = recruit(state, 10)
    expect(result.ok).toBe(true)
    expect(result.rewards).toHaveLength(10)
    expect(state.honor).toBe(before - 900)
  })

  it('keeps the most recent five-star as the latest acquisition instead of the final ten-pull item', () => {
    const state = createInitialState()
    const originalRandom = Math.random
    let call = 0
    Math.random = () => {
      const value = call % 2 === 0 ? (call === 0 ? 0 : 0.99) : 0
      call += 1
      return value
    }
    try {
      const result = recruit(state, 10)
      expect(result.ok).toBe(true)
      expect(result.general?.grade).toBe(5)
      expect(result.general?.id).toBe('guan-yu')
      expect(result.rewards.at(-1)?.grade).toBe(1)
    } finally {
      Math.random = originalRandom
    }
  })

  it('resets catalog level data for every newly summoned general', () => {
    const state = createInitialState()
    state.generals = []
    state.formation = []
    const originalRandom = Math.random
    Math.random = () => 0
    try {
      const result = recruit(state, 1)
      expect(result.ok).toBe(true)
      expect(result.general?.id).toBe('guan-yu')
      expect(result.general?.level).toBe(1)
      expect(result.general?.skillUnlocked).toBe(false)
      expect(state.generals[0].level).toBe(1)
    } finally {
      Math.random = originalRandom
    }
  })

  it('keeps formation at three slots and replaces the last slot when full', () => {
    const state = createInitialState()
    const initialFormation = [...state.formation]
    state.generals.push(findGeneral({ ...state, generals: allGenerals() } as typeof state, 'liu-bei')!)
    toggleFormation(state, 'liu-bei')
    expect(state.formation).toEqual([initialFormation[0], initialFormation[1], 'liu-bei'])
    toggleFormation(state, initialFormation[2])
    expect(state.formation).toHaveLength(3)
    expect(state.formation[2]).toBe(initialFormation[2])
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
    const starterId = state.generals[0].id
    expect(state.equipmentInventory).toHaveLength(3)
    expect(state.equipmentLoadouts[starterId].weapon).toBe('starter-weapon')
    const before = state.equipmentInventory[0].baseValue
    const powerBefore = combatPower(state.generals[0])
    expect(state.equipmentInventory[0].mainStat).toBe('martial')
    expect(powerBefore).toBeGreaterThan(0)
    expect(state.equipmentInventory[0].baseValue).toBe(before)
  })

  it('defines ten specialties for each equipment type and applies mythic specialty power', () => {
    expect(EQUIPMENT_SPECIALTIES.weapon).toHaveLength(10)
    expect(EQUIPMENT_SPECIALTIES.armor).toHaveLength(10)
    expect(EQUIPMENT_SPECIALTIES.accessory).toHaveLength(10)
    for (const specialties of Object.values(EQUIPMENT_SPECIALTIES)) expect(new Set(specialties.map(specialty => specialty.id)).size).toBe(10)
    expect(MYTHIC_SHOP_EQUIPMENT.every(item => item.specialty)).toBe(true)
    const state = createInitialState()
    const starterId = state.generals[0].id
    const mythic = { ...MYTHIC_SHOP_EQUIPMENT[0], id: 'test-mythic-specialty' }
    state.equipmentInventory.push(mythic)
    const before = equipmentBonus(state, starterId).leadership
    expect(equipEquipment(state, starterId, mythic.id).ok).toBe(true)
    expect(equipmentBonus(state, starterId).leadership + equipmentBonus(state, starterId).martial + equipmentBonus(state, starterId).stratagem + equipmentBonus(state, starterId).speed).toBeGreaterThan(before)
  })

  it('backfills a missing specialty on legacy mythic equipment saves', () => {
    const state = createInitialState()
    const legacy = { ...MYTHIC_SHOP_EQUIPMENT[0], id: 'legacy-mythic' }
    delete legacy.specialty
    state.equipmentInventory.push(legacy)
    ensureEquipmentState(state)
    expect(state.equipmentInventory.find(item => item.id === legacy.id)?.specialty).toBeTruthy()
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

  it('stacks identical equipment and splits one copy when enhancing a stack', () => {
    const state = createInitialState()
    const duplicate = { ...state.equipmentInventory[0], id: 'duplicate-starter-weapon', quantity: 2 }
    state.equipmentInventory.push(duplicate)
    ensureEquipmentState(state)
    const stack = state.equipmentInventory.find(item => item.id === 'starter-weapon')!
    expect(state.equipmentInventory).toHaveLength(3)
    expect(stack.quantity).toBe(3)
    expect(equipmentInventoryCount(state)).toBe(5)
    expect(enhanceEquipment(state, stack.id).ok).toBe(true)
    expect(state.equipmentInventory.find(item => item.id === stack.id)?.quantity).toBe(2)
    expect(state.equipmentInventory.some(item => item.level === 2 && item.quantity === 1)).toBe(true)
  })

  it('equips an item to a general, replaces the same slot, and enhances with silver and iron', () => {
    const state = createInitialState()
    const starterId = state.generals[0].id
    const draw = drawEquipment(state, 1)
    const item = draw.rewards[0]
    const beforeSilver = state.silver
    const beforeLevel = item.level
    expect(equipEquipment(state, starterId, item.id).ok).toBe(true)
    expect(state.equipmentLoadouts[starterId][item.type]).toBe(item.id)
    expect(enhanceEquipment(state, item.id).ok).toBe(true)
    expect(item.level).toBe(beforeLevel + 1)
    expect(state.silver).toBeLessThan(beforeSilver)
  })

  it('activates two-piece and three-piece set abilities for a general', () => {
    const state = createInitialState()
    const starterId = state.generals[0].id
    const commandItems = ['set-command-armor', 'set-command-accessory'].map((id, index) => ({
      id, name: `천군 테스트 ${index}`, type: index === 0 ? 'armor' as const : 'accessory' as const, set: 'command' as const, grade: 'rare' as const, level: 1, mainStat: 'leadership' as const, baseValue: 12, skillName: EQUIPMENT_SET_META.command.skillName, skillDescription: EQUIPMENT_SET_META.command.skillDescription,
    }))
    state.equipmentInventory.push(...commandItems)
    expect(equipEquipment(state, starterId, commandItems[0].id).ok).toBe(true)
    expect(equipEquipment(state, starterId, commandItems[1].id).ok).toBe(true)
    expect(equipmentSetCounts(state, starterId).command).toBe(2)
    expect(equipmentBonus(state, starterId).leadership).toBe(34)
    const third = { ...commandItems[0], id: 'set-command-weapon', type: 'weapon' as const }
    state.equipmentInventory.push(third)
    expect(equipEquipment(state, starterId, third.id).ok).toBe(true)
    expect(equipmentSetCounts(state, starterId).command).toBe(3)
    expect(equipmentBonus(state, starterId).leadership).toBe(54)
  })

  it('unequips a selected slot and removes its contribution from the general', () => {
    const state = createInitialState()
    const starterId = state.generals[0].id
    expect(state.equipmentLoadouts[starterId].weapon).toBe('starter-weapon')
    const equippedPower = equipmentPower(state, starterId)
    expect(equippedPower).toBeGreaterThan(0)
    const formationPower = totalPower(state)
    expect(unequipEquipment(state, starterId, 'weapon').ok).toBe(true)
    expect(state.equipmentLoadouts[starterId].weapon).toBeUndefined()
    expect(equipmentPower(state, starterId)).toBeLessThan(equippedPower)
    expect(totalPower(state)).toBeLessThan(formationPower)
    expect(unequipEquipment(state, starterId, 'weapon').ok).toBe(false)
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

  it('offers gold recharge tiers and gold-priced resource packages', () => {
    const state = createInitialState()
    expect(state.gold).toBe(100)
    expect(GOLD_PACKAGES.map(item => item.gold)).toEqual([3, 10, 20, 50, 100])
    expect(GOLD_PACKAGES.map(item => item.priceKRW)).toEqual([4500, 15000, 30000, 75000, 150000])
    expect(RESOURCE_SHOP_PACKAGES).toHaveLength(25)
    expect(new Set(RESOURCE_SHOP_PACKAGES.map(item => item.resource)).size).toBe(5)
    expect(new Set(RESOURCE_SHOP_PACKAGES.map(item => item.goldCost)).size).toBe(5)
    expect(purchaseGoldPackage(state, 'gold-3').ok).toBe(false)
    expect(state.gold).toBe(100)
    const beforeGrain = state.resources.grain
    expect(purchaseResourcePackage(state, 'resource-grain-3').ok).toBe(true)
    expect(state.gold).toBe(97)
    expect(state.resources.grain).toBe(beforeGrain + 5000)
    state.gold = 0
    expect(purchaseResourcePackage(state, 'resource-grain-100').ok).toBe(false)
    expect(purchaseGoldPackage(state, 'unknown-package').ok).toBe(false)
    state.gold = 20
    const beforeHonor = state.honor
    expect(HONOR_SHOP_PACKAGES.map(item => item.goldCost)).toEqual([3, 5, 10, 20, 50, 100])
    expect(purchaseHonorPackage(state, 'honor-10').ok).toBe(true)
    expect(state.gold).toBe(10)
    expect(state.honor).toBe(beforeHonor + 1000)
    expect(purchaseHonorPackage(state, 'honor-20').ok).toBe(false)
    state.gold = 150
    expect(purchaseHonorPackage(state, 'honor-50').ok).toBe(true)
    expect(state.gold).toBe(100)
    expect(purchaseHonorPackage(state, 'honor-100').ok).toBe(true)
    expect(state.gold).toBe(0)
  })

  it('awards the prelaunch stipend only once per day', () => {
    const state = createInitialState()
    const today = new Date('2026-10-07T09:00:00').getTime()
    state.prelaunchGoldDayKey = ''
    state.gold = 0
    expect(ensurePrelaunchDailyGold(state, today)).toBe(true)
    expect(state.gold).toBe(100)
    expect(ensurePrelaunchDailyGold(state, today)).toBe(false)
    expect(ensurePrelaunchDailyGold(state, today + 24 * 60 * 60 * 1000)).toBe(true)
    expect(state.gold).toBe(200)
  })

})
