import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { normalizeRoute, buildRouteGeometry, buildCurtainGeometry, pointAtDistance } from '../src/route'

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
    expect(g.length).toBeGreaterThan(25)
    expect(g.length).toBeLessThan(31)
    expect(g.distances[0]).toBe(0)
  })

  it('光幕几何顶点数 = 曲线点数 * 4，顶边高度正确', () => {
    const g = buildRouteGeometry(normalizeRoute(route), 12)
    const geo = buildCurtainGeometry(g, 0.4, 0.8)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBe(g.curvePoints.length * 2)
    const ys: number[] = []
    for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i))
    expect(Math.max(...ys)).toBeCloseTo(0.4, 5)
    expect(geo.getAttribute('uv')).toBeTruthy()
    expect(geo.index?.count).toBe((g.curvePoints.length - 1) * 6)
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
