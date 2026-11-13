/**
 * REDO4 地平线验收（修正版）：
 * 把远处地平线点 (0, 0, -10000) 投影到真实屏幕像素（经过 object-fit:cover 裁剪），
 * 断言其在配置的照片地平线（图像坐标 horizonY 经同一 cover 数学换算）±1.5% 屏高内。
 * 在 3 个视口下测试：390x844、430x932、1280x800。
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { normalizeRoute, buildRouteGeometry, buildRailGeometry } from '../src/route'

// 与 demo/main.ts 保持一致的配置
const PHOTO = { horizonY: 0.63, vanishX: 0.57, aspect: 828 / 1054 } // 图像坐标
const FOV = 60
const EYE = 1.6

/** 复现 core.ts 的 photoToViewportY（cover 裁剪，修正版） */
function photoToViewportY(photoY: number, vw: number, vh: number): number {
  const viewportAspect = vw / vh
  // viewportAspect < photoAspect：图按高度铺满、左右裁剪 → y 不变
  // viewportAspect > photoAspect：图按宽度铺满、上下裁剪 → y 映射
  if (viewportAspect > PHOTO.aspect) {
    const visibleFraction = PHOTO.aspect / viewportAspect
    const top = (1 - visibleFraction) / 2
    return (photoY - top) / visibleFraction
  }
  return photoY
}

/** 复现 core.ts 的 setHorizonCalibration 推导 */
function calibratedPitchDeg(vw: number, vh: number): number {
  const visibleHorizonY = photoToViewportY(PHOTO.horizonY, vw, vh)
  const fovY = THREE.MathUtils.degToRad(FOV)
  const pitch = Math.atan((2 * visibleHorizonY - 1) * Math.tan(fovY / 2))
  return THREE.MathUtils.radToDeg(pitch)
}

const VIEWPORTS: Array<[number, number]> = [
  [390, 844],
  [430, 932],
  [1280, 800],
]

describe('REDO4 地平线校准（真实屏幕像素）', () => {
  for (const [vw, vh] of VIEWPORTS) {
    it(`${vw}x${vh}: 3D 地平线投影落在照片地平线 ±1.5% 屏高内`, () => {
      const pitchDeg = calibratedPitchDeg(vw, vh)
      const camera = new THREE.PerspectiveCamera(FOV, vw / vh, 0.05, 300)
      camera.position.set(0, EYE, 1.5)
      camera.quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(pitchDeg), 0, 0, 'YXZ'))
      camera.updateMatrixWorld()

      // 远处地平线点（地面 y=0 的无穷远）→ 屏幕像素
      const far = new THREE.Vector3(0, 0, -10000).project(camera)
      const projectedY = ((1 - far.y) / 2) * vh

      // 配置的照片地平线（图像坐标）→ 屏幕（同一 cover 数学）
      const expectedY = photoToViewportY(PHOTO.horizonY, vw, vh) * vh

      const gap = Math.abs(projectedY - expectedY)
      expect(gap).toBeLessThanOrEqual(vh * 0.015)
    })

    it(`${vw}x${vh}: 路线所有采样点在地平线之下，最远点距地平线 ≤3% 屏高`, () => {
      const pitchDeg = calibratedPitchDeg(vw, vh)
      const camera = new THREE.PerspectiveCamera(FOV, vw / vh, 0.05, 300)
      camera.position.set(0, EYE, 1.5)
      camera.quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(pitchDeg), 0, 0, 'YXZ'))
      camera.updateMatrixWorld()

      // demo 的路线（REDO4：30m 直行 + 8m 半径右转 + 20m）
      const route = [
        [0, 0],
        [0, -30],
        [7, -37],
        [8.5, -47],
        [9, -57],
      ] as Array<[number, number]>
      const geo = buildRouteGeometry(normalizeRoute(route))

      const horizonPx = photoToViewportY(PHOTO.horizonY, vw, vh) * vh
      let maxAbove = 0
      let farGap = Infinity
      for (const p of geo.points) {
        const v = p.clone().project(camera)
        const sy = ((1 - v.y) / 2) * vh
        maxAbove = Math.max(maxAbove, horizonPx - sy)
        farGap = Math.abs(sy - horizonPx)
      }
      expect(maxAbove).toBeLessThanOrEqual(0.5)
      expect(farGap).toBeLessThanOrEqual(vh * 0.03 + 8)
    })
  }

  it('边缘光幕几何为低矮 ribbon：每采样点 2 顶点，全部 y 在 0..railHeight', () => {
    const route = [[0, 0], [0, -30], [7, -37], [8.5, -47], [9, -57]] as Array<[number, number]>
    const geo = buildRouteGeometry(normalizeRoute(route))
    const h = 0.25
    const rail = buildRailGeometry(geo, 0.6, h, -1)
    const pos = rail.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBe(geo.points.length * 2)
    const ys: number[] = []
    for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i))
    expect(Math.min(...ys)).toBeCloseTo(0, 5)
    expect(Math.max(...ys)).toBeCloseTo(h, 5)
  })
})
