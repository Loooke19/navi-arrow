/**
 * 路线几何：
 * - 地面带：贴地，uv.x 沿程、uv.y 横向
 * - 两侧低矮光幕：底边 y=0，顶边约 0.5m，转弯处按曲率再抬高
 * 顶边细线画在光幕着色器里（屏幕空间），不再挤出地面管线。
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
  const turns = new Float32Array(n * 2)
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
  g.setAttribute('aTurn', new THREE.BufferAttribute(turns, 1))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

/** 两条边线折线点（左缘、右缘）。地面粗管线已移除，函数保留给测试与外部调用。 */
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
 * 每个采样点的转弯强度 0（直行）..1（约 8m 半径或更急）。
 * 做了平滑，避免光幕高度在一个顶点上跳。
 */
export function routeTurnFactors(geo: RouteGeometry): number[] {
  const n = geo.points.length
  const raw = new Array<number>(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    const ax = geo.points[i].x - geo.points[i - 1].x
    const az = geo.points[i].z - geo.points[i - 1].z
    const bx = geo.points[i + 1].x - geo.points[i].x
    const bz = geo.points[i + 1].z - geo.points[i].z
    const la = Math.hypot(ax, az)
    const lb = Math.hypot(bx, bz)
    if (la < 1e-5 || lb < 1e-5) continue
    const cos = Math.min(1, Math.max(-1, (ax * bx + az * bz) / (la * lb)))
    const ang = Math.acos(cos)
    raw[i] = ang / Math.max(la, lb)
  }
  let cur = raw
  for (let pass = 0; pass < 6; pass++) {
    const next = cur.slice()
    for (let i = 1; i < n - 1; i++) next[i] = cur[i - 1] * 0.25 + cur[i] * 0.5 + cur[i + 1] * 0.25
    cur = next
  }
  // 0.02 rad/m 以下当直行；约 0.12 rad/m（半径 ~8m）顶满
  return cur.map((c) => THREE.MathUtils.clamp((c - 0.015) / 0.10, 0, 1))
}

/**
 * 低矮边缘光幕：站在地面带两侧。
 * 底边 y=0，顶边 = height * (1 + turnLift * 转弯强度)。
 * turnLift 默认 0，保持旧调用「等高」的行为。
 */
export function buildRailGeometry(
  geo: RouteGeometry,
  halfWidth: number,
  height: number,
  side: -1 | 1,
  turnLift = 0,
): THREE.BufferGeometry {
  const n = geo.points.length
  const turn = turnLift > 0 ? routeTurnFactors(geo) : null
  const positions = new Float32Array(n * 2 * 3)
  const uvs = new Float32Array(n * 2 * 2)
  const turns = new Float32Array(n * 2)
  const indices: number[] = []
  for (let i = 0; i < n; i++) {
    const p = geo.points[i]
    const s = geo.sides[i]
    const x = p.x + side * s.x * halfWidth
    const z = p.z + side * s.z * halfWidth
    const u = geo.lengths[i] / (geo.total || 1)
    const k = turn ? turn[i] : 0
    const h = height * (1 + turnLift * k)
    positions[i * 6 + 0] = x; positions[i * 6 + 1] = 0; positions[i * 6 + 2] = z
    positions[i * 6 + 3] = x; positions[i * 6 + 4] = h; positions[i * 6 + 5] = z
    uvs[i * 4 + 0] = u; uvs[i * 4 + 1] = 0
    uvs[i * 4 + 2] = u; uvs[i * 4 + 3] = 1
    turns[i * 2] = k
    turns[i * 2 + 1] = k
    if (i < n - 1) {
      const a = i * 2, b = a + 1, c = (i + 1) * 2, d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  g.setAttribute('aTurn', new THREE.BufferAttribute(turns, 1))
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
