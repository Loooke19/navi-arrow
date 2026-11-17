/**
 * [INPUT]: depends on THREE vector/curve/buffer primitives from three
 * [OUTPUT]: provides normalizeRoute, groundEdgeDistance, extendRouteToCamera, buildRouteGeometry, buildVolumetricCurtainGeometry, and legacy geometry helpers
 * [POS]: geometric kernel within src/, converting 2D/3D path coordinates into smooth U-curtain ribbons and feathered ground aura meshes
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import * as THREE from 'three'

export interface RouteGeometry {
  curve: THREE.CatmullRomCurve3
  /** 等距采样点（贴地 y=0） */
  points: THREE.Vector3[]
  /** 每个采样点的水平侧向量（右正左负，由 up × tangent 得出） */
  sides: THREE.Vector3[]
  /** 累计弧长（米） */
  lengths: number[]
  total: number
}

export interface VolumetricCurtainMeshes {
  /** U 型立体竖直光幕（左幕 + 远端圆弧合拢 + 右幕，含顶脊上方柔光羽化区） */
  curtain: THREE.BufferGeometry
  /** 地面柔光衬底（含车道内通透过渡 + 幕外 42% 高斯呼吸羽化带 + 远端半圆光晕） */
  ground: THREE.BufferGeometry
}

/** 圆弧光幕外缘抗锯齿延展比例（仅留 4% 亚像素 AA 余量，外侧保持大疆同款锐利边界） */
export const CURTAIN_TOP_HEADROOM = 1.04
/** 地面环境溢光外扩倍率 */
export const GROUND_OUTER_FEATHER = 1.32

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

/**
 * 计算画面底边（ndc y=-1）在地面上的落点距离，用于把路线近端铺到底边。
 * 相机朝地面下方看时返回正数；若视线水平以上则返回 Infinity（无需延长）。
 */
export function groundEdgeDistance(camera: THREE.PerspectiveCamera): number {
  camera.updateMatrixWorld()
  const ray = new THREE.Vector3(0, -1, 0.5).unproject(camera).sub(camera.position).normalize()
  if (ray.y >= -1e-4) return Infinity
  return -camera.position.y / ray.y
}

/**
 * 近端兜底：把路线首点沿首段方向朝镜头延伸到画面底边的地面落点之内，
 * 确保光幕与地面柔光带自然贯穿屏幕底边，不留断口。
 */
export function extendRouteToCamera(
  points: THREE.Vector3[],
  cameraPos: THREE.Vector3,
  edgeDist = 4.5,
): THREE.Vector3[] {
  if (points.length < 2) return points
  const first = points[0]
  const second = points[1]
  const dir = new THREE.Vector3().subVectors(second, first)
  dir.y = 0
  if (dir.lengthSq() < 1e-8) return points
  dir.normalize()

  const flat = new THREE.Vector3(cameraPos.x, 0, cameraPos.z)
  const firstAhead = new THREE.Vector3(first.x - flat.x, 0, first.z - flat.z).dot(dir)
  const curDist = Math.hypot(first.x - flat.x, first.z - flat.z)

  if (firstAhead > 0 && firstAhead > edgeDist) {
    const start = first.clone().addScaledVector(dir, -(firstAhead - edgeDist) - 0.35)
    return [start, ...points]
  }
  if (firstAhead <= 0 || curDist > edgeDist) {
    // 跳过落在镜头身后的控制点，避免样条曲线向后折返
    let firstValid = 0
    while (firstValid < points.length - 1) {
      const ahead = new THREE.Vector3(points[firstValid].x - flat.x, 0, points[firstValid].z - flat.z).dot(dir)
      if (ahead > 0.2) break
      firstValid++
    }
    const tail = points.slice(firstValid)
    const nextAhead = new THREE.Vector3(tail[0].x - flat.x, 0, tail[0].z - flat.z).dot(dir)
    const startDist = Math.min(edgeDist * 0.82, Math.max(edgeDist * 0.52, nextAhead - 0.35))
    if (nextAhead <= startDist + 0.15) return tail
    const start = flat.clone().addScaledVector(dir, startDist)
    if (firstAhead > 0 && curDist > edgeDist) {
      const mid = flat.clone().addScaledVector(dir, Math.min(firstAhead, edgeDist * 1.35))
      return [start, mid, ...tail]
    }
    return [start, ...tail]
  }
  return points
}

/** 平滑 + 按弧长等距采样（全部贴地 y=0），并预计算每点侧向量 */
export function buildRouteGeometry(rawPoints: THREE.Vector3[], samplesPerMeter = 5, tension = 0.45): RouteGeometry {
  const curve = new THREE.CatmullRomCurve3(rawPoints, false, 'catmullrom', tension)
  const total = curve.getLength()
  const count = Math.max(24, Math.ceil(total * samplesPerMeter) + 1)
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
 * 每个采样点的转弯强度 0（直行）..1（半径约 8m 或更急）。
 * 经多遍平滑并在弯心后段保持余韵，使弯道光幕舒展打开。
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
  const factors = cur.map((c) => THREE.MathUtils.clamp((c - 0.015) / 0.10, 0, 1))
  const held = factors.slice()
  for (let i = 0; i < n; i++) {
    if (factors[i] < 0.35) continue
    for (let j = 0; j < n; j++) {
      const ds = geo.lengths[j] - geo.lengths[i]
      if (ds < -2.4 || ds > 4.6) continue
      const pre = ds >= 0 ? 1 : 1 + ds / 2.4
      const sustain = ds <= 2.0 ? 1 : 1 - (ds - 2.0) / 2.6
      held[j] = Math.max(held[j], factors[i] * Math.max(0, Math.min(pre, sustain)))
    }
  }
  return held
}

/**
 * 构建大疆 AR 返航风格的连续圆弧立体光幕通道：
 * 1. `curtain`: 单一连续光滑 U 型圆弧曲面（横截面从中心底面 t=0 经圆弧平滑弯曲至两侧弧顶 t=±1.0，
 *    再延展至 ±CURTAIN_TOP_HEADROOM 做外缘羽化，远端沿同弧剖面半圆合拢）。底部到两侧无任何折角与断层，
 *    俯视时两侧圆弧切向视线自然产生光程叠加，弯道交叉处双层叠透。
 * 2. `ground`: 极轻柔的贴地环境漫散衬底（外边界至 ±GROUND_OUTER_FEATHER 归零），保持接口兼容。
 */
export function buildVolumetricCurtainGeometry(
  geo: RouteGeometry,
  halfWidth: number,
  curtainHeight: number,
  opts?: { turnLift?: number; capSegments?: number },
): VolumetricCurtainMeshes {
  const n = geo.points.length
  const total = Math.max(geo.total, 1e-3)
  const baseH = Math.max(0.05, curtainHeight)
  const turnLift = opts?.turnLift ?? 0.04
  const capSegs = opts?.capSegments ?? 24
  const turnF = routeTurnFactors(geo)
  const up = new THREE.Vector3(0, 1, 0)

  // ---------- 1. 连续 3D 横向均匀展开倒 U（∩）余弦拱面（24 等分加密消除折痕，外缘线性铺开避免堆叠过亮） ----------
  const halfStops: number[] = []
  for (let i = 0; i <= 24; i++) halfStops.push(i / 24)
  halfStops.push(1.02, CURTAIN_TOP_HEADROOM)
  const tStops: number[] = []
  for (let i = halfStops.length - 1; i >= 1; i--) tStops.push(-halfStops[i])
  for (let i = 0; i < halfStops.length; i++) tStops.push(halfStops[i])
  const cols = tStops.length

  const cPos: number[] = []
  const cUv: number[] = []
  const cHNorm: number[] = []
  const cArchY: number[] = []
  const cDist: number[] = []
  const cTurn: number[] = []
  const cIdx: number[] = []

  const arcProfile = (t: number) => {
    const s = t < 0 ? -1 : 1
    const a = Math.abs(t)
    if (a <= 1.0) {
      return { latX: s * a, archY: CURTAIN_TOP_HEADROOM * Math.cos(a * (Math.PI / 2)) }
    }
    const over = (a - 1.0) / Math.max(CURTAIN_TOP_HEADROOM - 1.0, 1e-4)
    return { latX: s * (1.0 + 0.015 * over), archY: 0.0 }
  }

  const pushArcVertex = (
    x: number,
    y: number,
    z: number,
    uNorm: number,
    t: number,
    archY: number,
    distM: number,
    turn: number,
  ) => {
    const idx = cPos.length / 3
    cPos.push(x, y, z)
    cUv.push(uNorm, (t + CURTAIN_TOP_HEADROOM) / (2 * CURTAIN_TOP_HEADROOM))
    cHNorm.push(Math.abs(t))
    cArchY.push(archY)
    cDist.push(distM)
    cTurn.push(turn)
    return idx
  }

  const crestHeightAt = (i: number) => {
    const prog = i / Math.max(1, n - 1)
    const farTaper = 1 - 0.28 * smoothstepJS(0.80, 1.0, prog)
    return baseH * (1 + turnLift * turnF[i]) * farTaper
  }

  // 沿首段切线反方向（朝向相机侧）平滑后延 1.8m，使倒 U 拱顶完全盖住画面底部半圆空隙
  const startPt = geo.points[0]
  const startSide = geo.sides[0]
  const startForward = new THREE.Vector3().crossVectors(startSide, up).normalize()
  const startH = crestHeightAt(0)
  const startTurn = turnF[0]
  const leadLength = 1.8
  const leadSteps = 8

  const rows: number[][] = []
  const pushRow = (
    px: number,
    pz: number,
    s: THREE.Vector3,
    h: number,
    uNorm: number,
    distM: number,
    turn: number,
  ) => {
    const row: number[] = []
    for (let j = 0; j < cols; j++) {
      const t = tStops[j]
      const pr = arcProfile(t)
      row.push(
        pushArcVertex(
          px + s.x * (pr.latX * halfWidth),
          0.004 + h * pr.archY,
          pz + s.z * (pr.latX * halfWidth),
          uNorm,
          t,
          pr.archY,
          distM,
          turn,
        ),
      )
    }
    rows.push(row)
    if (rows.length > 1) {
      const prev = rows[rows.length - 2]
      for (let j = 0; j < cols - 1; j++) {
        cIdx.push(prev[j], row[j], prev[j + 1], prev[j + 1], row[j], row[j + 1])
      }
    }
  }

  for (let k = leadSteps; k >= 1; k--) {
    const backM = (leadLength * k) / leadSteps
    pushRow(
      startPt.x - startForward.x * backM,
      startPt.z - startForward.z * backM,
      startSide,
      startH,
      -(backM / total) * 0.92,
      -backM,
      startTurn,
    )
  }

  for (let i = 0; i < n; i++) {
    const p = geo.points[i]
    pushRow(p.x, p.z, geo.sides[i], crestHeightAt(i), (geo.lengths[i] / total) * 0.92, geo.lengths[i], turnF[i])
  }

  // 远端圆弧半圆收口：沿同一 U-Arc 剖面旋转 180° 闭合，无折角
  const endPt = geo.points[n - 1]
  const endSide = geo.sides[n - 1].clone()
  const endForward = new THREE.Vector3().crossVectors(endSide, up).normalize()
  const endH = crestHeightAt(n - 1)
  const endTurn = turnF[n - 1]
  const capCols = halfStops.length
  const capRings: number[][] = []

  for (let k = 0; k <= capSegs; k++) {
    const ang = (Math.PI * k) / capSegs
    const sinA = Math.sin(ang)
    const cosA = Math.cos(ang)
    const dir = endSide.clone().multiplyScalar(-cosA).addScaledVector(endForward, sinA)
    const ring: number[] = []
    for (let r = 0; r < capCols; r++) {
      const t = halfStops[r]
      const pr = arcProfile(t)
      const uNorm = 0.92 + 0.08 * sinA * (t / CURTAIN_TOP_HEADROOM)
      const distM = total + halfWidth * sinA * Math.min(pr.latX, 1.0)
      ring.push(
        pushArcVertex(
          endPt.x + dir.x * (pr.latX * halfWidth),
          0.004 + endH * pr.archY * (1 - 0.10 * sinA),
          endPt.z + dir.z * (pr.latX * halfWidth),
          uNorm,
          t,
          pr.archY,
          distM,
          endTurn,
        ),
      )
    }
    capRings.push(ring)
    if (k > 0) {
      const prev = capRings[k - 1]
      for (let r = 0; r < capCols - 1; r++) {
        cIdx.push(prev[r], ring[r], prev[r + 1], prev[r + 1], ring[r], ring[r + 1])
      }
    }
  }

  const curtain = new THREE.BufferGeometry()
  curtain.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3))
  curtain.setAttribute('uv', new THREE.Float32BufferAttribute(cUv, 2))
  curtain.setAttribute('aHNorm', new THREE.Float32BufferAttribute(cHNorm, 1))
  curtain.setAttribute('aArchY', new THREE.Float32BufferAttribute(cArchY, 1))
  curtain.setAttribute('aDist', new THREE.Float32BufferAttribute(cDist, 1))
  curtain.setAttribute('aTurn', new THREE.Float32BufferAttribute(cTurn, 1))
  curtain.setIndex(cIdx)
  curtain.computeVertexNormals()

  // ---------- 2. 地面通透柔光带 + 外侧高斯羽化 ----------
  const latStops = [
    -GROUND_OUTER_FEATHER, -1.22, -1.12, -1.04, -1.0, -0.90, -0.74, -0.52, -0.26,
    0.0,
    0.26, 0.52, 0.74, 0.90, 1.0, 1.04, 1.12, 1.22, GROUND_OUTER_FEATHER,
  ]
  const gCols = latStops.length
  const gPos: number[] = []
  const gUv: number[] = []
  const gLat: number[] = []
  const gDist: number[] = []
  const gIdx: number[] = []
  const floorY = 0.004

  const pushGroundVertex = (x: number, z: number, uNorm: number, lat: number, distM: number) => {
    const idx = gPos.length / 3
    gPos.push(x, floorY, z)
    const v01 = (lat + GROUND_OUTER_FEATHER) / (2 * GROUND_OUTER_FEATHER)
    gUv.push(uNorm, v01)
    gLat.push(lat)
    gDist.push(distM)
    return idx
  }

  const gRows: number[][] = []
  for (let i = 0; i < n; i++) {
    const p = geo.points[i]
    const s = geo.sides[i]
    const uNorm = (geo.lengths[i] / total) * 0.92
    const row: number[] = []
    for (let j = 0; j < gCols; j++) {
      const lat = latStops[j]
      row.push(pushGroundVertex(p.x + s.x * (lat * halfWidth), p.z + s.z * (lat * halfWidth), uNorm, lat, geo.lengths[i]))
    }
    gRows.push(row)
    if (i > 0) {
      const prev = gRows[i - 1]
      for (let j = 0; j < gCols - 1; j++) {
        gIdx.push(prev[j], row[j], prev[j + 1], prev[j + 1], row[j], row[j + 1])
      }
    }
  }

  // 远端半圆地面光晕扇面（严格在 endPt 前方展开，不与主带重叠）
  const radStops = [0.0, 0.26, 0.52, 0.74, 0.90, 1.0, 1.04, 1.12, 1.22, GROUND_OUTER_FEATHER]
  const rCols = radStops.length
  const fanRings: number[][] = []
  for (let k = 0; k <= capSegs; k++) {
    const ang = (Math.PI * k) / capSegs
    const sinA = Math.sin(ang)
    const cosA = Math.cos(ang)
    const dir = endSide.clone().multiplyScalar(-cosA).addScaledVector(endForward, sinA)
    const ring: number[] = []
    for (let r = 0; r < rCols; r++) {
      const rLat = radStops[r]
      const uNorm = 0.92 + 0.08 * sinA * (rLat / GROUND_OUTER_FEATHER)
      const distM = total + halfWidth * sinA * Math.min(rLat, 1.0)
      ring.push(
        pushGroundVertex(
          endPt.x + dir.x * (rLat * halfWidth),
          endPt.z + dir.z * (rLat * halfWidth),
          uNorm,
          rLat,
          distM,
        ),
      )
    }
    fanRings.push(ring)
    if (k > 0) {
      const prev = fanRings[k - 1]
      for (let r = 0; r < rCols - 1; r++) {
        gIdx.push(prev[r], ring[r], prev[r + 1], prev[r + 1], ring[r], ring[r + 1])
      }
    }
  }

  const ground = new THREE.BufferGeometry()
  ground.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3))
  ground.setAttribute('uv', new THREE.Float32BufferAttribute(gUv, 2))
  ground.setAttribute('aLat', new THREE.Float32BufferAttribute(gLat, 1))
  ground.setAttribute('aDist', new THREE.Float32BufferAttribute(gDist, 1))
  ground.setIndex(gIdx)
  ground.computeVertexNormals()

  return { curtain, ground }
}

function smoothstepJS(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * 地面带几何（兼容接口与测试）：沿路线中心线左右各扩张 halfWidth，贴地 y=0。
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

/** 两条边线折线点（左缘、右缘） */
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

/** 贴地双层圆角 V 箭头尺寸（保留 85° 逻辑开口角兼容单元测试，并扩充平面以容纳双层编组与柔光晕） */
export function chevronDimensions(bandWidth: number): { width: number; length: number; planeW: number; planeL: number } {
  const width = bandWidth * 0.66
  const opening = (85 * Math.PI) / 180
  const length = width / 2 / Math.tan(opening / 2)
  return { width, length, planeW: width * 1.48, planeL: width * 1.65 }
}

/** 箭头局部坐标（+Z 朝前进方向） */
export function chevronLocalCorners(width: number, length: number): { tip: THREE.Vector3; left: THREE.Vector3; right: THREE.Vector3 } {
  return {
    tip: new THREE.Vector3(0, 0.02, length * 0.5),
    left: new THREE.Vector3(-width * 0.5, 0.02, -length * 0.5),
    right: new THREE.Vector3(width * 0.5, 0.02, -length * 0.5),
  }
}

/** 路线拐弯最集中的锚点（直行返回 null） */
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
  let sx = 0, sz = 0, n = 0, sign = 0
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

/** 把 V 放到路线 dist 米处，尖端朝前进方向 */
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

/** 单侧竖直光幕几何（兼容旧 API 与测试） */
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

export const CHANNEL_SLAB_THICKNESS = 0.075

/** 旧版薄板通道几何（保留导出供向下兼容与历史回归测试） */
export function buildChannelGeometry(geo: RouteGeometry, halfWidth: number, _height: number, slab = CHANNEL_SLAB_THICKNESS): THREE.BufferGeometry {
  const cols = 17
  const positions: number[] = []
  const uvs: number[] = []
  const rims: number[] = []
  const walls: number[] = []
  const indices: number[] = []
  const n = geo.points.length
  const up = new THREE.Vector3(0, 1, 0)
  const lip = slab + 0.012

  const push = (x: number, y: number, z: number, u: number, v: number, rim: number, wall: number) => {
    positions.push(x, y, z)
    uvs.push(u, v)
    rims.push(rim)
    walls.push(wall)
    return (positions.length / 3) - 1
  }

  const sampleProfile = (t: number) => {
    const x = t * 2 - 1
    const ax = Math.abs(x)
    const u = THREE.MathUtils.clamp((ax - 0.82) / 0.18, 0, 1)
    const y = slab + (lip - slab) * (1 - Math.cos((u * Math.PI) / 2))
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

  const skirt = (edge: Edge[], vEdge: number) => {
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i]
      const b = edge[i + 1]
      const a0 = push(a.x, 0, a.z, a.u, vEdge, 0, 1)
      const a1 = push(a.x, a.y, a.z, a.u, vEdge, 0, 1)
      const b0 = push(b.x, 0, b.z, b.u, vEdge, 0, 1)
      const b1 = push(b.x, b.y, b.z, b.u, vEdge, 0, 1)
      indices.push(a0, b0, a1, a1, b0, b1)
    }
  }
  skirt(leftEdge, 0)
  skirt(rightEdge, 1)
  skirt(capEdge, 1)

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
