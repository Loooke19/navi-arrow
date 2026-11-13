/**
 * 路线几何生成：把折线路线转成 CatmullRom 平滑曲线 + 光幕带状网格几何
 */
import * as THREE from 'three'

export interface RouteGeometry {
  /** 平滑后的中心线曲线点（贴地） */
  curvePoints: THREE.Vector3[]
  /** 每个点的累计里程（米），与 curvePoints 对齐 */
  distances: number[]
  /** CatmullRomCurve3（闭合=false） */
  curve: THREE.CatmullRomCurve3
  /** 总长度 */
  length: number
}

/** 归一化输入路线为 Vector3 数组。形式：[x,z] / [x,y,z] / {x,y,z} 对象 */
export function normalizeRoute(route: any): THREE.Vector3[] {
  const pts: any[] = Array.isArray(route) ? route : route?.points ?? []
  if (!pts || pts.length < 2) throw new Error('[navi-arrow] route 至少需要 2 个点')
  return pts.map((p) => {
    if (Array.isArray(p)) {
      if (p.length >= 3) return new THREE.Vector3(p[0], p[1], p[2])
      // [x, z] 水平面坐标，y=0
      return new THREE.Vector3(p[0] ?? 0, 0, p[1] ?? 0)
    }
    // {x, y, z} 对象形式
    return new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0)
  })
}

/** 由原始折线点生成平滑曲线及里程信息 */
export function buildRouteGeometry(rawPoints: THREE.Vector3[], samplesPerSeg = 24): RouteGeometry {
  const curve = new THREE.CatmullRomCurve3(rawPoints, false, 'catmullrom', 0.35)
  const count = (rawPoints.length - 1) * samplesPerSeg + 1
  const curvePoints = curve.getSpacedPoints(count - 1)
  const distances: number[] = [0]
  for (let i = 1; i < curvePoints.length; i++) {
    distances.push(distances[i - 1] + curvePoints[i].distanceTo(curvePoints[i - 1]))
  }
  return { curvePoints, distances, curve, length: distances[distances.length - 1] }
}

/**
 * 生成光幕带状几何（ribbon geometry）：
 * 底边贴地（y=0），顶边抬高 height；宽度沿线方向统一（近宽远窄由 shader 透视+渐隐处理）。
 * uv.x = 归一化里程（0~1），uv.y = 0(底) ~ 1(顶)，供 shader 做网纹/边缘光/渐隐。
 */
export function buildCurtainGeometry(
  geo: RouteGeometry,
  height: number,
  halfWidth: number,
): THREE.BufferGeometry {
  const pts = geo.curvePoints
  const n = pts.length
  const positions = new Float32Array(n * 2 * 3)
  const uvs = new Float32Array(n * 2 * 2)
  const indices: number[] = []
  const total = geo.length || 1

  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    // 切线方向 → 水平侧向
    const t = i < n - 1
      ? pts[i + 1].clone().sub(p)
      : p.clone().sub(pts[i - 1])
    t.y = 0
    if (t.lengthSq() < 1e-10) t.set(1, 0, 0)
    t.normalize()
    const side = new THREE.Vector3().crossVectors(up, t).normalize().multiplyScalar(halfWidth)

    const u = geo.distances[i] / total
    // 底边两点
    positions[i * 6 + 0] = p.x - side.x
    positions[i * 6 + 1] = 0
    positions[i * 6 + 2] = p.z - side.z
    positions[i * 6 + 3] = p.x + side.x
    positions[i * 6 + 4] = 0
    positions[i * 6 + 5] = p.z + side.z
    uvs[i * 4 + 0] = u
    uvs[i * 4 + 1] = 0
    uvs[i * 4 + 2] = u
    uvs[i * 4 + 3] = 1

    if (i < n - 1) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const g = new THREE.BufferGeometry()
  // position 为完整光幕（底边 y=0，顶边 y=height）
  const top = new Float32Array(n * 2 * 3)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 2; k++) {
      const o = (i * 2 + k) * 3
      top[o] = positions[o]
      top[o + 1] = height
      top[o + 2] = positions[o + 2]
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(top, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  g.setAttribute('aBottomPosition', new THREE.BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

/** 从平滑曲线上按里程取点 */
export function pointAtDistance(geo: RouteGeometry, dist: number): THREE.Vector3 {
  const { curvePoints, distances } = geo
  const t = Math.min(1, Math.max(0, dist / (geo.length || 1)))
  const idx = t * (curvePoints.length - 1)
  const i = Math.floor(idx)
  const f = idx - i
  const a = curvePoints[Math.min(i, curvePoints.length - 1)]
  const b = curvePoints[Math.min(i + 1, curvePoints.length - 1)]
  return a.clone().lerp(b, f)
}
