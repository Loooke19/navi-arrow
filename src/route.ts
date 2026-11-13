/**
 * 路线几何（重做版）：
 * - CatmullRomCurve3 平滑 + 弧长等距采样
 * - 光幕 Curtain：竖直带状 BufferGeometry（底 y=0，顶 y=curtainHeight）
 * - 顶边亮线：TubeGeometry 沿抬高曲线
 * - 地面光迹：贴地窄带（~0.25m）
 */
import * as THREE from 'three'

export interface RouteGeometry {
  curve: THREE.CatmullRomCurve3
  /** 等距采样点（贴地，y=0） */
  points: THREE.Vector3[]
  /** 抬高到光幕顶边的采样点 */
  topPoints: THREE.Vector3[]
  /** 累计弧长 */
  lengths: number[]
  total: number
}

/** 归一化输入路线为 Vector3 数组。形式：[x,z] / [x,y,z] / {x,y,z} */
export function normalizeRoute(route: any): THREE.Vector3[] {
  const pts: any[] = Array.isArray(route) ? route : route?.points ?? []
  if (!pts || pts.length < 2) throw new Error('[navi-arrow] route 至少需要 2 个点')
  return pts.map((p) => {
    if (Array.isArray(p)) {
      if (p.length >= 3) return new THREE.Vector3(p[0], p[1], p[2])
      return new THREE.Vector3(p[0] ?? 0, 0, p[1] ?? 0)
    }
    return new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0)
  })
}

/** 平滑 + 按弧长等距采样 */
export function buildRouteGeometry(rawPoints: THREE.Vector3[], samplesPerMeter = 4, height = 0.6): RouteGeometry {
  const curve = new THREE.CatmullRomCurve3(rawPoints, false, 'catmullrom', 0.4)
  const total = curve.getLength()
  const count = Math.max(16, Math.ceil(total * samplesPerMeter) + 1)
  const points = curve.getSpacedPoints(count - 1)
  const lengths: number[] = points.map((_, i) => (total * i) / (count - 1))
  const topPoints = points.map((p) => new THREE.Vector3(p.x, height, p.z))
  return { curve, points, topPoints, lengths, total }
}

/**
 * 光幕几何：每个采样点一左一右（宽度很小，视觉上是一面竖直的帘），上下两个顶点。
 * uv.x = 弧长归一化（0 近 → 1 远），uv.y = 高度（0 底 → 1 顶）。
 */
export function buildCurtainGeometry(
  geo: RouteGeometry,
  height: number,
  halfWidth: number,
): THREE.BufferGeometry {
  const pts = geo.points
  const n = pts.length
  const positions = new Float32Array(n * 2 * 2 * 3)
  const uvs = new Float32Array(n * 2 * 2 * 2)
  const indices: number[] = []
  const up = new THREE.Vector3(0, 1, 0)

  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const t = i < n - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])
    t.y = 0
    if (t.lengthSq() < 1e-10) t.set(1, 0, 0)
    t.normalize()
    const side = new THREE.Vector3().crossVectors(up, t).normalize().multiplyScalar(halfWidth)
    const u = geo.lengths[i] / (geo.total || 1)

    // 四个顶点：底左、底右、顶左、顶右（底=贴地，顶=抬高）
    const base = i * 4
    // 底左
    positions[base * 3 + 0] = p.x - side.x
    positions[base * 3 + 1] = 0
    positions[base * 3 + 2] = p.z - side.z
    // 底右
    positions[(base + 1) * 3 + 0] = p.x + side.x
    positions[(base + 1) * 3 + 1] = 0
    positions[(base + 1) * 3 + 2] = p.z + side.z
    // 顶左
    positions[(base + 2) * 3 + 0] = p.x - side.x
    positions[(base + 2) * 3 + 1] = height
    positions[(base + 2) * 3 + 2] = p.z - side.z
    // 顶右
    positions[(base + 3) * 3 + 0] = p.x + side.x
    positions[(base + 3) * 3 + 1] = height
    positions[(base + 3) * 3 + 2] = p.z + side.z

    uvs[(base + 0) * 2 + 0] = u; uvs[(base + 0) * 2 + 1] = 0
    uvs[(base + 1) * 2 + 0] = u; uvs[(base + 1) * 2 + 1] = 0
    uvs[(base + 2) * 2 + 0] = u; uvs[(base + 2) * 2 + 1] = 1
    uvs[(base + 3) * 2 + 0] = u; uvs[(base + 3) * 2 + 1] = 1

    if (i < n - 1) {
      const a = base, b = base + 1, c = base + 2, d = base + 3
      const e = (i + 1) * 4, f = e + 1, g = e + 2, h = e + 3
      indices.push(a, e, b, b, e, f)   // 底面
      indices.push(c, g, d, d, g, h)   // 顶面
      indices.push(a, g, c, a, e, g)   // 左侧面
      indices.push(b, h, d, b, f, h)   // 右侧面
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

/** 顶边发光亮线：TubeGeometry 沿抬高曲线 */
export function buildTopLineGeometry(geo: RouteGeometry, radius = 0.015): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(geo.topPoints, false, 'catmullrom', 0.4)
  return new THREE.TubeGeometry(curve, Math.max(32, geo.points.length), radius, 6, false)
}

/** 地面光迹：贴地窄发光带（宽 ~0.25m） */
export function buildGroundGlowGeometry(geo: RouteGeometry, halfWidth = 0.125): THREE.BufferGeometry {
  const pts = geo.points
  const n = pts.length
  const positions = new Float32Array(n * 2 * 3)
  const uvs = new Float32Array(n * 2 * 2)
  const indices: number[] = []
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const t = i < n - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])
    t.y = 0
    if (t.lengthSq() < 1e-10) t.set(1, 0, 0)
    t.normalize()
    const side = new THREE.Vector3().crossVectors(up, t).normalize().multiplyScalar(halfWidth)
    const u = geo.lengths[i] / (geo.total || 1)
    positions[i * 6 + 0] = p.x - side.x
    positions[i * 6 + 1] = 0.01
    positions[i * 6 + 2] = p.z - side.z
    positions[i * 6 + 3] = p.x + side.x
    positions[i * 6 + 4] = 0.01
    positions[i * 6 + 5] = p.z + side.z
    uvs[i * 4 + 0] = u; uvs[i * 4 + 1] = 0
    uvs[i * 4 + 2] = u; uvs[i * 4 + 3] = 1
    if (i < n - 1) {
      const a = i * 2, b = a + 1, c = (i + 1) * 2, d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

/** 从平滑曲线上按里程取点（用于箭头摆放） */
export function pointAtDistance(geo: RouteGeometry, dist: number): THREE.Vector3 {
  const t = Math.min(1, Math.max(0, dist / (geo.total || 1)))
  const idx = t * (geo.points.length - 1)
  const i = Math.floor(idx)
  const f = idx - i
  const a = geo.points[Math.min(i, geo.points.length - 1)]
  const b = geo.points[Math.min(i + 1, geo.points.length - 1)]
  return a.clone().lerp(b, f)
}
