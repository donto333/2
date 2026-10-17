import { describe, expect, it } from 'vitest'
import { applyEquipmentPreset, bulkDismantle, bulkDismantlePreview, dismantleEquipment, packLoadouts, saveEquipmentPreset, toggleEquipmentLock, unpackLoadouts } from '../src/game/equipment-manage'
import { createInitialState, ensureEquipmentState, equipEquipment, makeEquipment, type Equipment } from '../src/game/strategy'

const add = (state: ReturnType<typeof createInitialState>, item: Equipment) => { state.equipmentInventory.push(item); return item }

describe('장비 보관·관리', () => {
  it('분해하면 옥패·철을 받고, 장착분·잠금·신화는 남는다', () => {
    const state = createInitialState()
    const normal = add(state, { ...makeEquipment('weapon', 'martial', 'normal', 1), id: 'n1', quantity: 3 })
    const general = state.generals[0].id
    expect(equipEquipment(state, general, 'n1').ok).toBe(true)
    const honor = state.honor, iron = state.resources.iron
    const result = dismantleEquipment(state, 'n1', 99)
    expect(result.ok).toBe(true)
    expect(result.count).toBe(2) // 장착한 1개는 남는다
    expect(normal.quantity).toBe(1)
    expect(state.honor).toBe(honor + 12)
    expect(state.resources.iron).toBe(iron + 60)
    expect(dismantleEquipment(state, 'n1').ok).toBe(false)
    const rare = add(state, { ...makeEquipment('armor', 'command', 'rare', 1), id: 'r1' })
    toggleEquipmentLock(state, rare.id)
    expect(dismantleEquipment(state, 'r1').ok).toBe(false)
    const mythic = add(state, { ...makeEquipment('armor', 'speed', 'mythic', 1), id: 'm1' })
    ensureEquipmentState(state)
    expect(mythic.locked).toBe(true)
    expect(dismantleEquipment(state, 'm1').ok).toBe(false)
  })
  it('강화한 장비를 분해하면 강화 비용 절반을 돌려받고, 일괄 분해는 강화한 장비를 건너뛴다', () => {
    const state = createInitialState()
    add(state, { ...makeEquipment('weapon', 'martial', 'normal', 1), id: 'a', quantity: 5 })
    add(state, { ...makeEquipment('armor', 'martial', 'normal', 3), id: 'b' })
    add(state, { ...makeEquipment('armor', 'martial', 'rare', 1), id: 'c', quantity: 2 })
    const before = bulkDismantlePreview(state, 'normal')
    expect(before.count).toBeGreaterThanOrEqual(5)
    const silver = state.silver
    expect(dismantleEquipment(state, 'b').gain?.silver).toBeGreaterThan(0)
    expect(state.silver).toBeGreaterThan(silver)
    expect(bulkDismantle(state, 'rare').ok).toBe(true)
    expect(state.equipmentInventory.some(item => item.id === 'a' || item.id === 'c')).toBe(false)
  })
  it('프리셋: 저장해 둔 장비 조합을 한 번에 장착하고, 서버 저장 형식으로 오간다', () => {
    const state = createInitialState()
    const general = state.generals[0].id, other = state.generals[1].id
    const w = add(state, { ...makeEquipment('weapon', 'speed', 'rare', 1), id: 'w' })
    const r = add(state, { ...makeEquipment('armor', 'speed', 'rare', 1), id: 'r' })
    equipEquipment(state, general, w.id); equipEquipment(state, general, r.id)
    expect(saveEquipmentPreset(state, general, 0).ok).toBe(true)
    equipEquipment(state, other, w.id)
    expect(state.equipmentLoadouts[general].weapon).not.toBe('w')
    expect(applyEquipmentPreset(state, general, 0).ok).toBe(true)
    expect(state.equipmentLoadouts[general].weapon).toBe('w')
    const packed = JSON.parse(JSON.stringify(packLoadouts(state)))
    const unpacked = unpackLoadouts(packed)
    expect(unpacked.loadouts[general].weapon).toBe('w')
    expect(Object.keys(unpacked.loadouts)).not.toContain('__presets')
    expect(unpacked.presets?.[general]?.[0]?.armor).toBe('r')
  })
})
