import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { normalizeRoute, buildRouteGeometry, buildBandGeometry, buildEdgeLinePoints, buildRailGeometry, buildChannelGeometry, pointAtDistance, routeTurnFactors } from '../src/route'

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

  it('3D 点 y 强制贴地为 0', () => {
    const pts = normalizeRoute([[0, 1.2, -3], [0, 5, -9]])
    // REDO3：路线必须全部贴地，传入的 y 被丢弃
    expect(pts[0].y).toBe(0)
    expect(pts[1].y).toBe(0)
    expect(pts[1].z).toBe(-9)
  })

  it('路线长度约为折线长度（平滑后略短）', () => {
    const g = buildRouteGeometry(normalizeRoute(route))
    expect(g.total).toBeGreaterThan(25)
    expect(g.total).toBeLessThan(31)
    expect(g.lengths[0]).toBe(0)
  })

  it('地面带几何：贴地 y=0，宽度 = 2*halfWidth，uv.y 0~1', () => {
    const g = buildRouteGeometry(normalizeRoute(route), 12)
    const halfW = 0.6
    const geo = buildBandGeometry(g, halfW)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBe(g.points.length * 2)
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(0, 5)
    // 每两点之间的横向距离应为 bandWidth
    const w0 = Math.hypot(pos.getX(0) - pos.getX(1), pos.getZ(0) - pos.getZ(1))
    expect(w0).toBeCloseTo(halfW * 2, 4)
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    expect(uv.array[1]).toBe(0)
    expect(uv.array[3]).toBe(1)
    expect(geo.index!.count).toBe((g.points.length - 1) * 6)
  })

  it('边缘光幕：两条边线 + 两侧低矮光幕，高度 0..railHeight', () => {
    const g = buildRouteGeometry(normalizeRoute(route), 8)
    const [left, right] = buildEdgeLinePoints(g, 0.6)
    expect(left.length).toBe(g.points.length)
    expect(right.length).toBe(g.points.length)
    // 左右两侧应相距 bandWidth
    const gap = Math.hypot(left[0].x - right[0].x, left[0].z - right[0].z)
    expect(gap).toBeCloseTo(1.2, 4)

    const h = 0.25
    for (const side of [-1, 1] as const) {
      const rail = buildRailGeometry(g, 0.6, h, side)
      const pos = rail.getAttribute('position') as THREE.BufferAttribute
      expect(pos.count).toBe(g.points.length * 2)
      const ys: number[] = []
      for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i))
      expect(Math.min(...ys)).toBeCloseTo(0, 5)
      expect(Math.max(...ys)).toBeCloseTo(h, 5)
    }
  })

  it('转弯处光幕被抬高，直行段保持基础高度', () => {
    const straight = buildRouteGeometry(normalizeRoute([[0, 0], [0, -20], [0, -40]]), 4)
    const factors = routeTurnFactors(straight)
    expect(Math.max(...factors)).toBeLessThan(0.2)

    const turning = buildRouteGeometry(normalizeRoute([
      [0, 0],
      [0, -30],
      [7, -37],
      [8.5, -47],
      [9, -57],
    ]), 4)
    const turnF = routeTurnFactors(turning)
    expect(Math.max(...turnF)).toBeGreaterThan(0.45)

    const base = 0.5
    const rail = buildRailGeometry(turning, 0.6, base, 1, 0.75)
    const pos = rail.getAttribute('position') as THREE.BufferAttribute
    let maxY = 0
    let minTop = Infinity
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      expect(y).toBeGreaterThanOrEqual(-1e-6)
      if (i % 2 === 1) {
        maxY = Math.max(maxY, y)
        minTop = Math.min(minTop, y)
      }
    }
    expect(minTop).toBeGreaterThanOrEqual(base - 1e-4)
    expect(maxY).toBeGreaterThan(base * 1.25)
  })

  it('光通道是圆角浅槽，末端弧盖鼓出路线终点', () => {
    const g = buildRouteGeometry(normalizeRoute([[0, 0], [0, -10], [0, -20]]), 4)
    const geo = buildChannelGeometry(g, 0.9, 0.55)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    let maxY = 0
    let minY = 99
    let ahead = false
    const endZ = g.points[g.points.length - 1].z
    for (let i = 0; i < pos.count; i++) {
      maxY = Math.max(maxY, pos.getY(i))
      minY = Math.min(minY, pos.getY(i))
      if (pos.getZ(i) < endZ - 0.25) ahead = true
    }
    expect(maxY).toBeCloseTo(0.55, 2)
    expect(minY).toBeCloseTo(0, 2)
    expect(ahead).toBe(true)
    expect(geo.getAttribute('aRim')).toBeTruthy()
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
