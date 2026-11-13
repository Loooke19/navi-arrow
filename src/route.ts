/**
 * 路线几何（REDO3）：
 * - CatmullRomCurve3 平滑 + 弧长等距采样（所有点 y=0 贴地）
 * - 光幕 Curtain：沿中心线的单一竖直 ribbon（DoubleSide 一张薄纱）
 * - 顶边亮线：Line2/LineMaterial 屏幕空间细线（近 2px 远细）
 * - 地面光晕：贴地 ~1m 宽羽化发光带
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

/** 归一化输入路线为 Vector3 数组。形式：[x,z] / [x,y,z] / {x,y,z}，强制 y=0 贴地 */
export function normalizeRoute(route: any): THREE.Vector3[] {
  const pts: any[] = Array.isArray(route) ? route : route?.points ?? []
  if (!pts || pts.length < 2) throw new Error('[navi-arrow] route 至少需要 2 个点')
  return pts.map((p) => {
    if (Array.isArray(p)) {
      if (p.length >= 3) return new THREE.Vector3(p[0], 0, p[2])
      return new THREE.Vector3(p[0] ?? 0, 0, p[1] ?? 0)
    }
    return new THREE.Vector3(p.x ?? 0, 0, p.z ?? 0)
  })
}

/** 平滑 + 按弧长等距采样（全部贴地 y=0） */
export function buildRouteGeometry(rawPoints: THREE.Vector3[], samplesPerMeter = 4, height = 0.5): RouteGeometry {
  const curve = new THREE.CatmullRomCurve3(rawPoints, false, 'catmullrom', 0.4)
  const total = curve.getLength()
  const count = Math.max(16, Math.ceil(total * samplesPerMeter) + 1)
  const points = curve.getSpacedPoints(count - 1).map((p) => new THREE.Vector3(p.x, 0, p.z))
  const lengths: number[] = points.map((_, i) => (total * i) / (count - 1))
  const topPoints = points.map((p) => new THREE.Vector3(p.x, height, p.z))
  return { curve, points, topPoints, lengths, total }
}

/**
 * 光幕几何（REDO3）：沿路线中心线的单一竖直 ribbon。
 * 每个采样点 2 个顶点（底 y=0、顶 y=height），DoubleSide 一张薄纱，不再是两片侧墙。
 * uv.x = 弧长归一化（0 近 → 1 远），uv.y = 高度（0 底 → 1 顶）。
 */
export function buildCurtainGeometry(
  geo: RouteGeometry,
  height: number,
  _halfWidth = 0,
): THREE.BufferGeometry {
  const pts = geo.points
  const n = pts.length
  const positions = new Float32Array(n * 2 * 3)
  const uvs = new Float32Array(n * 2 * 2)
  const indices: number[] = []

  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const u = geo.lengths[i] / (geo.total || 1)
    positions[i * 6 + 0] = p.x
    positions[i * 6 + 1] = 0
    positions[i * 6 + 2] = p.z
    positions[i * 6 + 3] = p.x
    positions[i * 6 + 4] = height
    positions[i * 6 + 5] = p.z
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

/** 顶边折线点（供 Line2 屏幕空间细线使用） */
export function buildTopLinePoints(geo: RouteGeometry): THREE.Vector3[] {
  return geo.topPoints
}

/**
 * 地面光晕：贴地 ~1m 宽发光带，边缘羽化（uv.y 0..1 横跨宽度，中心亮边缘透明）。
 * uv.x = 弧长归一化，uv.y = 0(左缘) ~ 0.5(中心) ~ 1(右缘)。
 */
export function buildGroundGlowGeometry(geo: RouteGeometry, halfWidth = 0.5): THREE.BufferGeometry {
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
    positions[i * 6 + 1] = 0.005
    positions[i * 6 + 2] = p.z - side.z
    positions[i * 6 + 3] = p.x + side.x
    positions[i * 6 + 4] = 0.005
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

/**
 * 地面网格调试几何（REDO3）：1m 网格线（y=0）延伸到 80m + 地平线远点。
 * 返回线段点对列表（LineSegments 用）。
 */
export function buildGroundGridSegments(extent = 80, step = 1): Array<[THREE.Vector3, THREE.Vector3]> {
  const segs: Array<[THREE.Vector3, THREE.Vector3]> = []
  for (let z = -extent; z <= 0; z += step) {
    segs.push([new THREE.Vector3(-extent / 2, 0, z), new THREE.Vector3(extent / 2, 0, z)])
  }
  for (let x = -extent / 2; x <= extent / 2; x += step) {
    segs.push([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 0, -extent)])
  }
  return segs
}
