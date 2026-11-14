/**
 * 箭头必须尖端朝前：投影到屏幕后，尖端比两翼更远、也更高（更靠近消失点）。
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { normalizeRoute, buildRouteGeometry, chevronDimensions, chevronLocalCorners, placeChevron } from '../src/route'

const FOV = 60
const EYE = 1.6
const VW = 390
const VH = 844
const HORIZON_Y = 0.63

function demoCamera(): THREE.PerspectiveCamera {
  const pitch = Math.atan((2 * HORIZON_Y - 1) * Math.tan(THREE.MathUtils.degToRad(FOV) / 2))
  const cam = new THREE.PerspectiveCamera(FOV, VW / VH, 0.05, 300)
  cam.position.set(0, EYE, 1.5)
  cam.quaternion.setFromEuler(new THREE.Euler(pitch, 0, 0, 'YXZ'))
  cam.updateMatrixWorld()
  return cam
}

function screenY(cam: THREE.PerspectiveCamera, p: THREE.Vector3): number {
  const v = p.clone().project(cam)
  return (1 - (v.y + 1) / 2) * VH
}

describe('chevron direction', () => {
  it('开口角约 100–110°，尖端在局部 +Z', () => {
    const { width, length } = chevronDimensions(1.2)
    const { tip, left, right } = chevronLocalCorners(width, length)
    expect(tip.z).toBeGreaterThan(left.z)
    expect(tip.z).toBeGreaterThan(right.z)
    const ang = left.clone().sub(tip).angleTo(right.clone().sub(tip)) * 180 / Math.PI
    expect(ang).toBeGreaterThan(100)
    expect(ang).toBeLessThan(110)
  })

  it('投影后尖端比两翼更远、在屏幕上更高', () => {
    const geo = buildRouteGeometry(normalizeRoute([
      [0, 0],
      [0, -12],
      [0, -24],
      [0, -40],
    ]))
    const cam = demoCamera()
    const { tip, left, right } = placeChevron(geo, 8, 1.2)
    const camPos = cam.position
    expect(tip.distanceTo(camPos)).toBeGreaterThan(left.distanceTo(camPos) + 0.05)
    expect(tip.distanceTo(camPos)).toBeGreaterThan(right.distanceTo(camPos) + 0.05)
    const tipY = screenY(cam, tip)
    const leftY = screenY(cam, left)
    const rightY = screenY(cam, right)
    // 屏幕 y 越小越靠近消失点
    expect(tipY).toBeLessThan(leftY - 2)
    expect(tipY).toBeLessThan(rightY - 2)
  })
})
