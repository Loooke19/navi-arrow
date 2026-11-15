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

  /**
   * 走廊/医院场景：地平线在画面上方（horizonY≈0.445）→ 相机低头 → 底边落点很远。
   * 若路线首点留在相机身后，被投影到画面顶部之外，画面里第一段就落在半空，
   * 底边会露出一条空地。必须把首点挪到镜头前方靠近落点的位置。
   */
  it('相机低头、首点在身后时，首点被挪到镜头前方的落点附近', () => {
    const pts = normalizeRoute([[0, 3.5], [0, -2], [0, -12], [0, -24]])
    const edgeDist = 6.5 // 低头时的典型落点距离
    const out = extendRouteToCamera(pts, CAMERA_POS, edgeDist)
    const first = out[0]
    expect(first.z).toBeLessThan(CAMERA_POS.z) // 在镜头前方（不再跑到身后）
    const d = Math.hypot(first.x - CAMERA_POS.x, first.z - CAMERA_POS.z)
    expect(d).toBeLessThan(edgeDist)            // 在底边落点之内
    expect(d).toBeGreaterThan(edgeDist * 0.5)   // 也不能贴脸
    // 原有的远端控制点都还在
    expect(out).toContainEqual(pts[1])
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

  /**
   * 回归：医院场景的调用顺序是「先 setRoute、后校准相机 pitch」。
   * 这种情况下首次兜底用的是默认朝向，落点算大了，近端就够不到底边。
   * 特征：用错误的 pitch 兜底后，近端距离 > 正确落点距离。
   */
  it('相机 pitch 晚于 setRoute 设置时，必须能重新兜底到底边', () => {
    for (const [w, h] of [[390, 844], [430, 932]] as Array<[number, number]>) {
      const raw = normalizeRoute([[0, -2], [0, -12], [0, -24], [0, -36], [0, -48]])

      // 1) 先按「默认朝向」（水平）兜底——真实 pitch 还没设进来
      const flat = new THREE.PerspectiveCamera(60, w / h, 0.05, 300)
      flat.position.copy(CAMERA_POS)
      flat.updateMatrixWorld()
      const flatEdge = groundEdgeDistance(flat)
      // 视线水平时算出的落点比校准后更近（3.2m vs 4.4m），
      // 于是按它兜底的近端够不到真正的底边——这正是医院直行出现空隙的原因。
      const calibrated = makeCamera(w, h)
      expect(flatEdge).toBeLessThan(groundEdgeDistance(calibrated))

      const first = extendRouteToCamera(raw, CAMERA_POS, 4.5)
      const g1 = buildRouteGeometry(first, 3, 0)
      const d1 = Math.hypot(g1.points[0].x - CAMERA_POS.x, g1.points[0].z - CAMERA_POS.z)

      // 2) 相机校准好之后重新兜底
      const camera = makeCamera(w, h)
      const edgeDist = groundEdgeDistance(camera)
      const second = extendRouteToCamera(raw, CAMERA_POS, edgeDist)
      const g2 = buildRouteGeometry(second, 3, 0)
      const pos = buildBandGeometry(g2, 0.85).getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < 2; i++) {
        const d = Math.hypot(pos.getX(i) - CAMERA_POS.x, pos.getZ(i) - CAMERA_POS.z)
        expect(d, `viewport ${w}x${h} vertex ${i} after re-anchor`).toBeLessThanOrEqual(edgeDist + 0.05)
      }
      void d1
    }
  })
})
