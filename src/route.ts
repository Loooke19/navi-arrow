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
export function buildRouteGeometry(rawPoints: THREE.Vector3[], samplesPerMeter = 3, tension = 0.4): RouteGeometry {
  const curve = new THREE.CatmullRomCurve3(rawPoints, false, 'catmullrom', tension)
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
  const factors = cur.map((c) => THREE.MathUtils.clamp((c - 0.015) / 0.10, 0, 1))
  // 弯道之后的横街仍然对着镜头，光幕高度要保持住，不能只在曲率尖峰上立一下
  const held = factors.slice()
  for (let i = 0; i < n; i++) {
    if (factors[i] < 0.45) continue
    for (let j = 0; j < n; j++) {
      const ds = geo.lengths[j] - geo.lengths[i]
      // 只把弯心前后很短的一段立成光片，大约占屏幕宽度的一成多
      if (ds < -1.6 || ds > 3.4) continue
      const pre = ds >= 0 ? 1 : 1 + ds / 1.6
      const sustain = ds <= 1.6 ? 1 : 1 - (ds - 1.6) / 1.8
      held[j] = Math.max(held[j], factors[i] * Math.max(0, Math.min(pre, sustain)))
    }
  }
  return held
}

/** 贴地 V 的尺寸。开口角约 85°，尖一些，避免看成一撇。 */
export function chevronDimensions(bandWidth: number): { width: number; length: number; planeW: number; planeL: number } {
  const width = bandWidth * 0.68
  const opening = (85 * Math.PI) / 180
  const length = width / 2 / Math.tan(opening / 2)
  const pad = width * 0.28
  return { width, length, planeW: width + pad * 2, planeL: length + pad * 2 }
}

/**
 * 箭头局部坐标。+Z 是 Object3D.lookAt 的朝向（前进方向），尖端在 +Z，两翼在 -Z。
 */
export function chevronLocalCorners(width: number, length: number): { tip: THREE.Vector3; left: THREE.Vector3; right: THREE.Vector3 } {
  return {
    tip: new THREE.Vector3(0, 0.02, length * 0.5),
    left: new THREE.Vector3(-width * 0.5, 0.02, -length * 0.5),
    right: new THREE.Vector3(width * 0.5, 0.02, -length * 0.5),
  }
}

/**
 * 路线拐弯最集中的位置。right 为真表示向 +X（画面右侧）转。
 * 直行返回 null。
 */
export function bendAnchor(geo: RouteGeometry): { point: THREE.Vector3; right: boolean } | null {
  const pts = geo.points
  if (pts.length < 3) return null
  const turns: number[] = []
  for (let i = 1; i < pts.length - 1; i++) {
    const ax = pts[i].x - pts[i - 1].x
    const az = pts[i].z - pts[i - 1].z
    const bx = pts[i + 1].x - pts[i].x
    const bz = pts[i + 1].z - pts[i].z
    const ha = Math.atan2(ax, -az)
    const hb = Math.atan2(bx, -bz)
    let d = hb - ha
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    turns.push(d)
  }
  let maxAbs = 0
  for (const t of turns) maxAbs = Math.max(maxAbs, Math.abs(t))
  if (maxAbs < 0.012) return null
  const thresh = maxAbs * 0.45
  let sx = 0
  let sz = 0
  let n = 0
  let sign = 0
  for (let i = 0; i < turns.length; i++) {
    if (Math.abs(turns[i]) < thresh) continue
    const p = pts[i + 1]
    sx += p.x
    sz += p.z
    sign += turns[i]
    n++
  }
  if (!n) return null
  return { point: new THREE.Vector3(sx / n, 0, sz / n), right: sign >= 0 }
}

/** 把 V 放到路线 dist 米处，尖端朝前进方向。与渲染用的 lookAt 一致。 */
export function placeChevron(geo: RouteGeometry, dist: number, bandWidth: number): { tip: THREE.Vector3; left: THREE.Vector3; right: THREE.Vector3 } {
  const { width, length } = chevronDimensions(bandWidth)
  const local = chevronLocalCorners(width, length)
  const p = pointAtDistance(geo, dist)
  const ahead = pointAtDistance(geo, dist + 0.5)
  const obj = new THREE.Object3D()
  obj.position.set(p.x, 0, p.z)
  obj.lookAt(ahead.x, 0, ahead.z)
  obj.updateMatrix()
  return {
    tip: local.tip.clone().applyMatrix4(obj.matrix),
    left: local.left.clone().applyMatrix4(obj.matrix),
    right: local.right.clone().applyMatrix4(obj.matrix),
  }
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

/**
 * 有厚度的光带：顶面是横向渐变的薄板，两侧和近端是竖直的端面。
 * 板厚约 0.16 米（行走尺度），透视自然变薄。顶缘仍略微抬起，给细亮边留位置。
 * uv.x 沿程 0→1（弧盖在最末端），uv.y 0 左沿 → 1 右沿。aRim 在墙顶缘为 1。
 * 侧面、近端端面用独立顶点，法线保持水平，着色时比顶面中心更亮。
 */
export const CHANNEL_SLAB_THICKNESS = 0.16

export function buildChannelGeometry(geo: RouteGeometry, halfWidth: number, height: number): THREE.BufferGeometry {
  const cols = 17
  const positions: number[] = []
  const uvs: number[] = []
  const rims: number[] = []
  const walls: number[] = []
  const indices: number[] = []
  const n = geo.points.length
  const up = new THREE.Vector3(0, 1, 0)
  const slab = CHANNEL_SLAB_THICKNESS
  const lip = Math.max(slab, Math.min(height, slab + 0.04))

  const push = (x: number, y: number, z: number, u: number, v: number, rim: number, wall: number) => {
    positions.push(x, y, z)
    uvs.push(u, v)
    rims.push(rim)
    walls.push(wall)
    return (positions.length / 3) - 1
  }

  // 顶面大部分在板厚高度，最外缘再抬一点，方便压一条细亮边。
  const sampleProfile = (t: number) => {
    const x = t * 2 - 1
    const ax = Math.abs(x)
    const u = THREE.MathUtils.clamp((ax - 0.82) / 0.18, 0, 1)
    const y = slab + (lip - slab) * (1 - Math.cos(u * Math.PI / 2))
    const rim = ax > 0.96 ? (ax - 0.96) / 0.04 : 0
    return { lat: x * halfWidth, y, rim, wall: ax }
  }

  type Edge = { x: number; y: number; z: number; u: number }
  const leftEdge: Edge[] = []
  const rightEdge: Edge[] = []

  const rowAt = (origin: THREE.Vector3, side: THREE.Vector3, uAlong: number) => {
    const row: number[] = []
    let left: Edge | undefined
    let right: Edge | undefined
    for (let j = 0; j < cols; j++) {
      const t = j / (cols - 1)
      const pr = sampleProfile(t)
      const p = origin.clone().addScaledVector(side, pr.lat)
      row.push(push(p.x, pr.y, p.z, uAlong, t, pr.rim, pr.wall))
      if (j === 0) left = { x: p.x, y: pr.y, z: p.z, u: uAlong }
      if (j === cols - 1) right = { x: p.x, y: pr.y, z: p.z, u: uAlong }
    }
    if (left) leftEdge.push(left)
    if (right) rightEdge.push(right)
    return row
  }

  const linkRows = (a: number[], b: number[]) => {
    for (let j = 0; j < cols - 1; j++) {
      const a0 = a[j], a1 = a[j + 1], b0 = b[j], b1 = b[j + 1]
      indices.push(a0, b0, a1, a1, b0, b1)
    }
  }

  const rows: number[][] = []
  for (let i = 0; i < n; i++) {
    const u = (i / Math.max(1, n - 1)) * 0.9
    rows.push(rowAt(geo.points[i], geo.sides[i], u))
    if (i > 0) linkRows(rows[i - 1], rows[i])
  }

  // 末端圆弧盖：一侧顶缘绕向前方半周接到另一侧，顶面中心保持透。
  const end = geo.points[n - 1]
  const side = geo.sides[n - 1].clone()
  const forward = new THREE.Vector3().crossVectors(side, up).normalize()
  const capSegs = 16
  const prevRim: number[] = []
  const capEdge: Edge[] = []
  if (leftEdge.length) capEdge.push(leftEdge[leftEdge.length - 1])
  for (let k = 0; k <= capSegs; k++) {
    const ang = (Math.PI * k) / capSegs
    const dir = side.clone().multiplyScalar(-Math.cos(ang)).addScaledVector(forward, Math.sin(ang))
    const u = 0.9 + 0.1 * (k / capSegs)
    const row: number[] = []
    let outer: Edge | undefined
    for (let j = 0; j < cols; j++) {
      const radialT = j / (cols - 1)
      const pr = sampleProfile(radialT)
      const p = end.clone().addScaledVector(dir, radialT * halfWidth)
      row.push(push(p.x, pr.y, p.z, u, radialT, pr.rim, pr.wall))
      if (j === cols - 1) outer = { x: p.x, y: pr.y, z: p.z, u }
    }
    if (k > 0) linkRows(prevRim, row)
    for (let j = 0; j < row.length; j++) prevRim[j] = row[j]
    if (outer && k > 0 && k < capSegs) capEdge.push(outer)
  }
  if (rightEdge.length) capEdge.push(rightEdge[rightEdge.length - 1])

  // 左右侧面 + 弧盖外圈：从地面立到顶缘。高度就是板厚，近处看起来是一条厚边。
  const skirt = (edge: Edge[], vEdge: number) => {
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i]
      const b = edge[i + 1]
      const a0 = push(a.x, 0, a.z, a.u, vEdge, 1, 1)
      const a1 = push(a.x, a.y, a.z, a.u, vEdge, 1, 1)
      const b0 = push(b.x, 0, b.z, b.u, vEdge, 1, 1)
      const b1 = push(b.x, b.y, b.z, b.u, vEdge, 1, 1)
      indices.push(a0, b0, a1, a1, b0, b1)
    }
  }
  skirt(leftEdge, 0)
  skirt(rightEdge, 1)
  skirt(capEdge, 1)

  // 近端正面：整宽的竖切面，中心高度约等于板厚，两侧跟着顶缘。
  for (let j = 0; j < cols - 1; j++) {
    const t0 = j / (cols - 1)
    const t1 = (j + 1) / (cols - 1)
    const p0 = sampleProfile(t0)
    const p1 = sampleProfile(t1)
    const origin = geo.points[0]
    const s0 = origin.clone().addScaledVector(geo.sides[0], p0.lat)
    const s1 = origin.clone().addScaledVector(geo.sides[0], p1.lat)
    const a0 = push(s0.x, 0, s0.z, 0, t0, 0, 1)
    const a1 = push(s0.x, p0.y, s0.z, 0, t0, p0.rim, 1)
    const b0 = push(s1.x, 0, s1.z, 0, t1, 0, 1)
    const b1 = push(s1.x, p1.y, s1.z, 0, t1, p1.rim, 1)
    indices.push(a0, a1, b0, b0, a1, b1)
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setAttribute('aRim', new THREE.Float32BufferAttribute(rims, 1))
  g.setAttribute('aWall', new THREE.Float32BufferAttribute(walls, 1))
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
