/**
 * 路线几何（REDO5）：
 * - 地面带（BAND）：1.2m 宽贴地半透明发光面，带 uv（沿路距 & 横向）
 * - 两条亮边线折线（供 Line2 屏幕空间 2px 亮线）
 * - 两条低矮边缘光幕（Rails）：站在带的两侧，高度 0.25m，α 顶 0.5 → 底 0.05
 * - 平面滑动 V 形箭头（在带内滑行）
 */
import * as THREE from 'three'

export interface RouteGeometry {
  curve: THREE.CatmullRomCurve3
  /** 等距采样点（贴地 y=0） */
  points: THREE.Vector3[]
  /** 每个采样点的水平侧向量（左正右负） */
  sides: THREE.Vector3[]
  /** 累计弧长 */
  lengths: number[]
  total: number
}

/** 归一化输入路线为 Vector3 数组（强制 y=0 贴地）。形式：[x,z] / [x,y,z] / {x,y,z} */
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

/** 平滑 + 按弧长等距采样（全部贴地 y=0），并预计算每点侧向量 */
export function buildRouteGeometry(rawPoints: THREE.Vector3[], samplesPerMeter = 3): RouteGeometry {
  const curve = new THREE.CatmullRomCurve3(rawPoints, false, 'catmullrom', 0.4)
  const total = curve.getLength()
  const count = Math.max(20, Math.ceil(total * samplesPerMeter) + 1)
  const points = curve.getSpacedPoints(count - 1).map((p) => new THREE.Vector3(p.x, 0, p.z))
  const lengths: number[] = points.map((_, i) => (total * i) / (count - 1))
  const up = new THREE.Vector3(0, 1, 0)
  const sides = points.map((p, i) => {
    const t = i < points.length - 1 ? points[i + 1].clone().sub(p) : p.clone().sub(points[i - 1])
    t.y = 0
    if (t.lengthSq() < 1e-10) t.set(1, 0, 0)
    return new THREE.Vector3().crossVectors(up, t.normalize()).normalize()
  })
  return { curve, points, sides, lengths, total }
}

/**
 * 地面带几何：沿路线中心线左右各扩张 halfWidth，贴地 y=0。
 * uv.x = 弧长归一化（0 近 → 1 远），uv.y = 0(左缘) ~ 1(右缘)。
 */
export function buildBandGeometry(geo: RouteGeometry, halfWidth: number): THREE.BufferGeometry {
  const n = geo.points.length
  const positions = new Float32Array(n * 2 * 3)
  const uvs = new Float32Array(n * 2 * 2)
  const indices: number[] = []
  for (let i = 0; i < n; i++) {
    const p = geo.points[i]
    const s = geo.sides[i]
    const u = geo.lengths[i] / (geo.total || 1)
    positions[i * 6 + 0] = p.x - s.x * halfWidth
    positions[i * 6 + 1] = 0
    positions[i * 6 + 2] = p.z - s.z * halfWidth
    positions[i * 6 + 3] = p.x + s.x * halfWidth
    positions[i * 6 + 4] = 0
    positions[i * 6 + 5] = p.z + s.z * halfWidth
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

/** 两条边线折线点（左缘、右缘），供 Line2 屏幕空间亮线 */
export function buildEdgeLinePoints(geo: RouteGeometry, halfWidth: number): [THREE.Vector3[], THREE.Vector3[]] {
  const left: THREE.Vector3[] = []
  const right: THREE.Vector3[] = []
  for (let i = 0; i < geo.points.length; i++) {
    const p = geo.points[i]
    const s = geo.sides[i]
    left.push(new THREE.Vector3(p.x - s.x * halfWidth, 0.012, p.z - s.z * halfWidth))
    right.push(new THREE.Vector3(p.x + s.x * halfWidth, 0.012, p.z + s.z * halfWidth))
  }
  return [left, right]
}

/**
 * 低矮边缘光幕：站在地面带两侧，沿中心线竖直升起 height。
 * 每个采样点 2 顶点（底 0、顶 height），uv.y = 0 底 ~ 1 顶。
 * 若 side = -1 取左缘，+1 取右缘。
 */
export function buildRailGeometry(
  geo: RouteGeometry,
  halfWidth: number,
  height: number,
  side: -1 | 1,
): THREE.BufferGeometry {
  const n = geo.points.length
  const positions = new Float32Array(n * 2 * 3)
  const uvs = new Float32Array(n * 2 * 2)
  const indices: number[] = []
  for (let i = 0; i < n; i++) {
    const p = geo.points[i]
    const s = geo.sides[i]
    const x = p.x + side * s.x * halfWidth
    const z = p.z + side * s.z * halfWidth
    const u = geo.lengths[i] / (geo.total || 1)
    positions[i * 6 + 0] = x; positions[i * 6 + 1] = 0; positions[i * 6 + 2] = z
    positions[i * 6 + 3] = x; positions[i * 6 + 4] = height; positions[i * 6 + 5] = z
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

/** 从平滑曲线上按里程取点 */
export function pointAtDistance(geo: RouteGeometry, dist: number): THREE.Vector3 {
  const t = Math.min(1, Math.max(0, dist / (geo.total || 1)))
  const idx = t * (geo.points.length - 1)
  const i = Math.floor(idx)
  const f = idx - i
  const a = geo.points[Math.min(i, geo.points.length - 1)]
  const b = geo.points[Math.min(i + 1, geo.points.length - 1)]
  return a.clone().lerp(b, f)
}

/** 地面网格调试几何（1m 网格延伸到 extent 米） */
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
