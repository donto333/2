import { describe, expect, it } from 'vitest'
import { MAP_HEIGHT, MAP_WIDTH, computeTransform, hiddenLabels, lodFor, nearestCity, screenPoint, type MapCity } from '../src/ui/territory-map'

const cities: MapCity[] = [
  { id: 'a', name: '낙양', x: 50, y: 50, priority: 90 },
  { id: 'b', name: '허창', x: 50.5, y: 50.5, priority: 10 }, // a와 거의 같은 자리
  { id: 'c', name: '성도', x: 20, y: 70, priority: 50 },
]

describe('territory map view', () => {
  it('fills a square viewport at zoom 1 and never shows space beyond the map', () => {
    const { transform } = computeTransform({ cx: 0, cy: 0, zoom: 1 }, 400, 400)
    expect(MAP_HEIGHT * transform.scale).toBeCloseTo(400) // cover: 높이가 창을 채움
    expect(transform.tx).toBe(0) // 왼쪽 끝을 넘어가지 않음
    expect(transform.ty).toBe(0)
    const right = computeTransform({ cx: 1, cy: 0.5, zoom: 1 }, 400, 400).transform
    expect(right.tx + MAP_WIDTH * right.scale).toBeCloseTo(400) // 오른쪽 끝에 붙음
  })

  it('limits zoom-out to the whole map and centers it', () => {
    const { transform, view } = computeTransform({ cx: 0.5, cy: 0.5, zoom: 0.01 }, 400, 400)
    expect(MAP_WIDTH * transform.scale).toBeCloseTo(400) // contain: 전체 너비가 창에 맞음
    expect(view.zoom).toBeCloseTo(transform.minZoom)
    expect(transform.ty).toBeGreaterThan(0) // 위아래 여백은 가운데 정렬
  })

  it('caps zoom-in', () => {
    expect(computeTransform({ cx: 0.5, cy: 0.5, zoom: 99 }, 400, 400).view.zoom).toBe(4)
  })

  it('chooses detail level from on-screen map width', () => {
    expect(lodFor(0.5)).toBe('far')
    expect(lodFor(1)).toBe('mid')
    expect(lodFor(2)).toBe('near')
  })

  it('hides the lower-priority label when two names collide, but never the selected one', () => {
    const { transform } = computeTransform({ cx: 0.5, cy: 0.5, zoom: 1 }, 400, 400)
    expect([...hiddenLabels(cities, transform, 'far', '', 400, 400)]).toEqual(['b'])
    expect([...hiddenLabels(cities, transform, 'far', 'b', 400, 400)]).toEqual(['a'])
  })

  it('selects the nearest city within the tap radius only', () => {
    const { transform } = computeTransform({ cx: 0.5, cy: 0.5, zoom: 1 }, 400, 400)
    const a = screenPoint(cities[0], transform)
    expect(nearestCity(cities, transform, a.sx + 2, a.sy - 1, 30)).toBe('a')
    expect(nearestCity(cities, transform, 5, 5, 30)).toBeNull()
  })
})
