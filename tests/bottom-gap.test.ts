/**
 * 底边空隙回归测试：
 * 光带必须贯穿画面底边——近端地面点要落在底边落点之内（或更近），
 * 任何视口比例和场景下都不留空隙。
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  normalizeRoute,
  extendRouteToCamera,
  groundEdgeDistance,
  buildRouteGeometry,
  buildBandGeometry,
} from '../src/route'

const CAMERA_POS = new THREE.Vector3(0, 1.6, 1.5)
const PITCH = THREE.MathUtils.degToRad(8.9) // demo 的立面校准抬头角

function makeCamera(w: number, h: number) {
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.05, 300)
  camera.position.copy(CAMERA_POS)
  camera.quaternion.setFromEuler(new THREE.Euler(PITCH, 0, 0, 'YXZ'))
  camera.updateMatrixWorld()
  return camera
}

describe('近端兜底：光带贯穿画面底边', () => {
  it('groundEdgeDistance 与画面底边落点一致', () => {
    for (const [w, h] of [[390, 844], [430, 932], [1280, 800]] as Array<[number, number]>) {
      const camera = makeCamera(w, h)
      const d = groundEdgeDistance(camera)
      // 用射线独立验算
      const ray = new THREE.Vector3(0, -1, 0.5).unproject(camera).sub(camera.position).normalize()
      const expectD = -camera.position.y / ray.y
      expect(d).toBeCloseTo(expectD, 5)
      expect(d).toBeGreaterThan(0)
      expect(d).toBeLessThan(10)
    }
  })

  it('首点比底边落点更远时，向前延伸到落点附近', () => {
    const pts = normalizeRoute([[0.28, -5.5], [0.28, -14], [0.28, -30]])
    // 底边落点距相机约 4.49m；首点距相机 7m
    const out = extendRouteToCamera(pts, CAMERA_POS, 4.49)
    const d = Math.hypot(out[0].x - CAMERA_POS.x, out[0].z - CAMERA_POS.z)
    expect(d).toBeLessThanOrEqual(4.5)
    expect(out[0].z).toBeLessThan(CAMERA_POS.z) // 仍在镜头前方
    expect(out[0].x).toBeCloseTo(0.28, 5)       // 仍在本车道
    expect(out.slice(1)).toEqual(pts)
  })

  it('首点已经足够近时不重复延长', () => {
    const pts = normalizeRoute([[0.28, -1.2], [0.28, -5.5], [0.28, -30]])
    const out = extendRouteToCamera(pts, CAMERA_POS, 4.49)
    expect(out).toHaveLength(pts.length)
    expect(out[0].z).toBeCloseTo(-1.2, 5)
  })

  it('三个视口下光带近端都盖到底边', () => {
    for (const [w, h] of [[390, 844], [430, 932], [1280, 800]] as Array<[number, number]>) {
      const camera = makeCamera(w, h)
      const edgeDist = groundEdgeDistance(camera)
      const raw = normalizeRoute([[0.28, -5.5], [0.28, -14], [0.28, -30], [0.28, -48]])
      const geo = buildRouteGeometry(extendRouteToCamera(raw, CAMERA_POS, edgeDist), 3, 0.4)
      const band = buildBandGeometry(geo, 0.81)
      const pos = band.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < 2; i++) {
        const d = Math.hypot(pos.getX(i) - CAMERA_POS.x, pos.getZ(i) - CAMERA_POS.z)
        expect(d, `viewport ${w}x${h} vertex ${i}`).toBeLessThanOrEqual(edgeDist + 0.05)
      }
    }
  })
})
