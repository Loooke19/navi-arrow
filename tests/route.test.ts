import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { normalizeRoute, buildRouteGeometry, buildCurtainGeometry, buildTopLineGeometry, buildGroundGlowGeometry, pointAtDistance } from '../src/route'

const route = [
  [0, 0],
  [0, -10],
  [8, -10],
  [8, -20],
] as Array<[number, number]>

describe('route geometry', () => {
  it('normalizeRoute 把 [x,z] 转成 Vector3 且 y=0', () => {
    const pts = normalizeRoute(route)
    expect(pts).toHaveLength(4)
    expect(pts[1].x).toBe(0)
    expect(pts[1].z).toBe(-10)
    expect(pts[1].y).toBe(0)
  })

  it('3D 点保留 y', () => {
    const pts = normalizeRoute([[0, 1.2, -3], [0, 1.2, -9]])
    expect(pts[0].y).toBe(1.2)
    expect(pts[1].z).toBe(-9)
  })

  it('路线长度约为折线长度（平滑后略短）', () => {
    const g = buildRouteGeometry(normalizeRoute(route))
    expect(g.total).toBeGreaterThan(25)
    expect(g.total).toBeLessThan(31)
    expect(g.lengths[0]).toBe(0)
  })

  it('光幕几何：竖直带状，底 y=0 顶 y=height，uv.y 0~1', () => {
    const g = buildRouteGeometry(normalizeRoute(route), 12)
    const height = 0.6
    const geo = buildCurtainGeometry(g, height, 0.25)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBe(g.points.length * 4)
    const ys: number[] = []
    for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i))
    expect(Math.min(...ys)).toBeCloseTo(0, 5)
    expect(Math.max(...ys)).toBeCloseTo(height, 5)
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    let minV = 1, maxV = 0
    for (let i = 1; i < uv.count * 2; i += 2) {
      minV = Math.min(minV, uv.array[i])
      maxV = Math.max(maxV, uv.array[i])
    }
    expect(minV).toBe(0)
    expect(maxV).toBe(1)
    // 立体的：底/顶/左右侧面 4 个面 × 2 三角形 = 每段 24 个索引
    expect(geo.index!.count).toBe((g.points.length - 1) * 24)
  })

  it('顶边亮线 TubeGeometry + 地面光迹几何有效', () => {
    const g = buildRouteGeometry(normalizeRoute(route), 8)
    const tube = buildTopLineGeometry(g)
    expect(tube).toBeInstanceOf(THREE.TubeGeometry)
    const ground = buildGroundGlowGeometry(g)
    expect((ground.getAttribute('position') as THREE.BufferAttribute).count).toBe(g.points.length * 2)
  })

  it('pointAtDistance 沿线取样并夹在范围内', () => {
    const g = buildRouteGeometry(normalizeRoute(route))
    const p0 = pointAtDistance(g, 0)
    expect(p0.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(0.5)
    const pEnd = pointAtDistance(g, 9999)
    expect(pEnd.x).toBeCloseTo(8, 0)
    expect(pEnd.z).toBeCloseTo(-20, 0)
  })
})
