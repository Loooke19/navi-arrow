/**
 * REDO3 自动验收：路线所有采样点必须投影在地平线之下，
 * 最远点距地平线 ≤ 3% 屏高（+8px 容差）。
 * 用纯 three.js 数学（无 WebGL）：复现 demo 的相机/校准/路线配置。
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { normalizeRoute, buildRouteGeometry, buildCurtainGeometry } from '../src/route'

// 与 demo/main.ts 保持一致的配置
const PHOTO = { horizonY: 0.63, vanishX: 0.57, aspect: 828 / 1054 }
const VIEWPORT = { w: 390, h: 844 }
const FOV = 60
const EYE = 1.6

/** 复现 core.ts 的 photoToViewportY（object-fit:cover 上下裁剪） */
function photoToViewportY(photoY: number): number {
  const viewportAspect = VIEWPORT.w / VIEWPORT.h
  if (viewportAspect <= PHOTO.aspect) {
    const visibleFraction = viewportAspect / PHOTO.aspect
    const top = (1 - visibleFraction) / 2
    return (photoY - top) / visibleFraction
  }
  return photoY
}

/** 复现 core.ts 的 setHorizonCalibration 推导 */
function calibratedPitchDeg(): number {
  const visibleHorizonY = photoToViewportY(PHOTO.horizonY)
  const fovY = THREE.MathUtils.degToRad(FOV)
  const pitch = Math.atan((2 * visibleHorizonY - 1) * Math.tan(fovY / 2))
  return THREE.MathUtils.radToDeg(pitch)
}

describe('REDO3 路线贴地校验', () => {
  it('校准后的 pitch 使 3D 地平线落在照片地平线上', () => {
    const pitchDeg = calibratedPitchDeg()
    // 3D 地平线：y=eye 的无穷远点。投影后 NDC y = (2*visibleHorizonY - 1)
    const camera = new THREE.PerspectiveCamera(FOV, VIEWPORT.w / VIEWPORT.h, 0.05, 300)
    camera.position.set(0, EYE, 1.5)
    camera.quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(pitchDeg), 0, 0, 'YXZ'))
    camera.updateMatrixWorld()
    const far = new THREE.Vector3(0, EYE, -10000).project(camera)
    const ndcY = 1 - 2 * photoToViewportY(PHOTO.horizonY)
    expect(far.y).toBeCloseTo(ndcY, 3)
  })

  it('所有路线采样点都在地平线之下，最远点距地平线 ≤ 3% 屏高', () => {
    const pitchDeg = calibratedPitchDeg()
    const camera = new THREE.PerspectiveCamera(FOV, VIEWPORT.w / VIEWPORT.h, 0.05, 300)
    camera.position.set(0, EYE, 1.5)
    camera.quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(pitchDeg), 0, 0, 'YXZ'))
    camera.updateMatrixWorld()

    // demo 的路线（REDO3：28m 直行 + 8m 半径右转 + 20m）
    const route = [
      [0, 0],
      [0, -28],
      [7, -34],
      [8.5, -44],
      [9, -54],
    ] as Array<[number, number]>
    const geo = buildRouteGeometry(normalizeRoute(route))

    const horizonPx = photoToViewportY(PHOTO.horizonY) * VIEWPORT.h
    let maxAbove = 0
    let farGap = Infinity
    for (const p of geo.points) {
      const v = p.clone().project(camera)
      const sy = (1 - (v.y + 1) / 2) * VIEWPORT.h
      maxAbove = Math.max(maxAbove, horizonPx - sy) // >0 = 在地平线上方
      farGap = Math.abs(sy - horizonPx)
    }
    // 全部在地平线之下（允许 0.5px 数值误差）
    expect(maxAbove).toBeLessThanOrEqual(0.5)
    // 最远点接近地平线（≤ 3% 屏高 + 8px 容差）
    expect(farGap).toBeLessThanOrEqual(VIEWPORT.h * 0.03 + 8)
  })

  it('光幕几何为单一 ribbon：每采样点 2 顶点，全部 y 在 0..height', () => {
    const route = [[0, 0], [0, -28], [7, -34], [8.5, -44], [9, -54]] as Array<[number, number]>
    const geo = buildRouteGeometry(normalizeRoute(route))
    const h = 0.5
    const curtain = buildCurtainGeometry(geo, h)
    const pos = curtain.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBe(geo.points.length * 2) // 单张 ribbon：底+顶
    const ys: number[] = []
    for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i))
    expect(Math.min(...ys)).toBeCloseTo(0, 5)
    expect(Math.max(...ys)).toBeCloseTo(h, 5)
  })
})
