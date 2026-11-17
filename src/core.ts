/**
 * [INPUT]: depends on THREE and postprocessing passes from three; config from ./config; geometry builders from ./route; shaders from ./shader; horizon math from ./horizon; DOM overlay from ./ui
 * [OUTPUT]: provides NaviArrowCore, createNaviArrow, and NaviArrowParams
 * [POS]: core orchestrator within src/, synchronizing camera pose, volumetric U-curtain & feathered ground meshes, HDR MSAA bloom composition, and Shadow DOM UI
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import {
  DEFAULT_THEME,
  mergeOptions,
  type NaviArrowOptions,
  type NaviTheme,
  type BannerConfig,
  type FooterConfig,
} from './config'
import {
  normalizeRoute,
  extendRouteToCamera,
  groundEdgeDistance,
  buildRouteGeometry,
  buildVolumetricCurtainGeometry,
  buildGroundGridSegments,
  pointAtDistance,
  chevronDimensions,
  type RouteGeometry,
} from './route'
import {
  createVolumetricCurtainMaterial,
  createGroundAuraMaterial,
  createChevronMaterial,
  createCompositeShader,
} from './shader'
import {
  computeHorizonPitchDeg,
  evaluateRouteBelowHorizon,
  viewportToPhotoX as calcViewportToPhotoX,
  type HorizonState,
} from './horizon'
import { NaviOverlayUI } from './ui'

export interface NaviArrowParams {
  /** 路线通道净宽（米，GUI 0.6~2.6） */
  bandWidth: number
  /** 两侧竖直光幕顶脊高度（米，GUI 0.1~1.0），弯道处自动微抬展开体积 */
  railHeight: number
  /** 整体发光强度 / 通透度倍率 */
  opacity: number
  /** 沿程呼吸流光周期（秒） */
  flowSpeed: number
  /** 光幕空间微扫描线密度 */
  scanLines: number
  /** 柔和大气辉光（Bloom）强度 */
  bloomStrength: number
}

export class NaviArrowCore {
  private container: HTMLElement
  private opts: NaviArrowOptions & Required<Pick<NaviArrowOptions, 'autoRender' | 'visible'>>
  params: NaviArrowParams

  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private composer?: EffectComposer
  private bloomPass?: UnrealBloomPass
  private compositePass?: ShaderPass

  private groundMesh?: THREE.Mesh
  private groundMat?: THREE.ShaderMaterial
  private curtainMesh?: THREE.Mesh
  private curtainMat?: THREE.ShaderMaterial
  private chevronGroup?: THREE.Group
  private chevronMats: THREE.ShaderMaterial[] = []
  private groundGrid?: THREE.LineSegments

  private routeGeo?: RouteGeometry
  private rawRoute?: THREE.Vector3[]
  private routeTension = 0.4
  private lastBuilt = { bandWidth: 1.2, railHeight: 0.42 }

  private floorGain = 1
  private bgBright = 0
  private photoAspect = 0
  horizon: HorizonState

  private ui: NaviOverlayUI
  rootEl: HTMLElement
  theme: NaviTheme

  private clock = new THREE.Clock()
  private rafId = 0
  private disposed = false
  private revealStart = 0
  private revealDuration = 600

  constructor(container: HTMLElement, options: NaviArrowOptions = {}) {
    this.container = container
    this.opts = mergeOptions({ autoRender: true, visible: true }, options) as any
    this.theme = { ...DEFAULT_THEME, ...(options.theme ?? {}) }
    this.params = {
      bandWidth: options.curtainWidth ?? 1.25,
      railHeight: options.curtainHeight ?? 0.50,
      opacity: this.theme.nearOpacity,
      flowSpeed: options.flowSpeed ?? 2.6,
      scanLines: 14,
      bloomStrength: 0.0,
    }
    this.lastBuilt = { bandWidth: this.params.bandWidth, railHeight: this.params.railHeight }
    this.horizon = { horizonY: 0.45, vanishX: 0.5, pitchDeg: -10, enabled: false }

    this.ui = new NaviOverlayUI(container)
    this.rootEl = this.ui.rootEl

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.domElement.style.background = 'transparent'
    this.ui.glHost.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 300)

    this.setupComposer()
    this.resize()

    if (this.opts.route) this.setRoute(this.opts.route)
    if (this.opts.banner) this.setBanner(this.opts.banner)
    if (this.opts.footer) this.setFooter(this.opts.footer)
    if (!this.opts.visible) this.hide()

    if (this.opts.autoRender) this.startLoop()
    window.addEventListener('resize', this.onResize)
  }

  private onResize = () => this.resize()

  private resize() {
    const w = this.container.clientWidth || 300
    const h = this.container.clientHeight || 300
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.composer?.setPixelRatio(dpr)
    this.composer?.setSize(w, h)
    this.bloomPass?.setSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)))
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private setupComposer() {
    const w = Math.max(1, this.container.clientWidth || 300)
    const h = Math.max(1, this.container.clientHeight || 300)
    const isWebGL2 = this.renderer.capabilities.isWebGL2

    // HalfFloat HDR + 4x MSAA RenderTarget：彻底消除斜边锯齿，并完整保留双层光幕叠透的动态范围
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: isWebGL2 ? 4 : 0,
      depthBuffer: false,
      stencilBuffer: false,
    })

    this.composer = new EffectComposer(this.renderer, rt)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    // 极轻柔大气 Bloom：默认关闭以保持大疆同款锐利边缘，调参时可按需开启
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2))),
      this.params.bloomStrength,
      0.45,
      0.38,
    )
    this.bloomPass.enabled = this.params.bloomStrength > 0.005
    const hi = (this.bloomPass as any).highPassUniforms
    if (hi?.smoothWidth) hi.smoothWidth.value = 0.22
    this.composer.addPass(this.bloomPass)

    const bloomBlend = (this.bloomPass as any).blendMaterial as THREE.ShaderMaterial | undefined
    if (bloomBlend) {
      bloomBlend.blending = THREE.CustomBlending
      bloomBlend.blendEquation = THREE.AddEquation
      bloomBlend.blendSrc = THREE.OneFactor
      bloomBlend.blendDst = THREE.OneFactor
      bloomBlend.blendSrcAlpha = THREE.ZeroFactor
      bloomBlend.blendDstAlpha = THREE.OneFactor
    }

    this.compositePass = new ShaderPass(createCompositeShader(this.theme.primary, this.theme.highlight))
    this.compositePass.material.blending = THREE.NoBlending
    this.compositePass.material.transparent = false
    this.compositePass.material.depthTest = false
    this.compositePass.material.depthWrite = false
    this.composer.addPass(this.compositePass)
    this.composer.renderToScreen = true
  }

  /** 增量更新配置 */
  update(patch: Partial<NaviArrowOptions>) {
    this.opts = mergeOptions(this.opts as NaviArrowOptions, patch) as typeof this.opts
    if (patch.theme) this.theme = { ...this.theme, ...patch.theme }
    if (patch.curtainWidth !== undefined) this.params.bandWidth = patch.curtainWidth
    if (patch.curtainHeight !== undefined) this.params.railHeight = patch.curtainHeight
    if (patch.flowSpeed !== undefined) this.params.flowSpeed = patch.flowSpeed
    if (patch.route) this.setRoute(patch.route)
    if (patch.banner !== undefined) this.setBanner(patch.banner ?? null)
    if (patch.footer !== undefined) this.setFooter(patch.footer ?? null)
    if (patch.showChevrons !== undefined) this.setChevrons(patch.showChevrons)
    if (patch.visible !== undefined) patch.visible ? this.show() : this.hide()
    this.applyParams()
  }

  /** 设置/替换路线（局部坐标：米，y 向上） */
  setRoute(route: NonNullable<NaviArrowOptions['route']>, opts?: { tension?: number }) {
    const raw = normalizeRoute(route)
    this.rawRoute = raw
    this.routeTension = opts?.tension ?? 0.45
    const edgeDist = groundEdgeDistance(this.camera)
    this.routeGeo = buildRouteGeometry(
      extendRouteToCamera(raw, this.camera.position, Number.isFinite(edgeDist) ? edgeDist : 4.5),
      5,
      this.routeTension,
    )
    this.rebuildCurtain()
  }

  private rebuildCurtain() {
    if (!this.routeGeo) return
    const halfW = Math.max(0.2, this.params.bandWidth / 2)
    const wallH = Math.max(0.06, this.params.railHeight)

    if (this.groundMesh) {
      this.scene.remove(this.groundMesh)
      this.groundMesh.geometry.dispose()
    }
    if (this.curtainMesh) {
      this.scene.remove(this.curtainMesh)
      this.curtainMesh.geometry.dispose()
    }

    if (!this.groundMat) {
      this.groundMat = createGroundAuraMaterial({
        color: this.theme.primary,
        highlight: this.theme.highlight,
        opacity: this.params.opacity,
        flowSpeed: this.params.flowSpeed,
        scanLines: this.params.scanLines,
      })
    }
    if (!this.curtainMat) {
      this.curtainMat = createVolumetricCurtainMaterial({
        color: this.theme.primary,
        highlight: this.theme.highlight,
        opacity: this.params.opacity,
        flowSpeed: this.params.flowSpeed,
        scanLines: this.params.scanLines,
      })
    }

    this.syncMaterialUniforms()

    const { curtain, ground } = buildVolumetricCurtainGeometry(this.routeGeo, halfW, wallH)
    this.groundMesh = new THREE.Mesh(ground, this.groundMat)
    this.groundMesh.frustumCulled = false
    this.groundMesh.renderOrder = 1
    this.scene.add(this.groundMesh)

    this.curtainMesh = new THREE.Mesh(curtain, this.curtainMat)
    this.curtainMesh.frustumCulled = false
    this.curtainMesh.renderOrder = 3
    this.scene.add(this.curtainMesh)

    if (this.opts.showChevrons) this.rebuildChevrons()
    this.revealStart = this.clock.getElapsedTime()
  }

  private syncMaterialUniforms() {
    for (const m of [this.groundMat, this.curtainMat]) {
      if (!m) continue
      m.uniforms.uOpacity.value = this.params.opacity
      m.uniforms.uFlowSpeed.value = this.params.flowSpeed
      m.uniforms.uScanLines.value = this.params.scanLines
      m.uniforms.uColor.value.set(this.theme.primary)
      m.uniforms.uHighlight.value.set(this.theme.highlight)
      m.uniforms.uFloorGain.value = this.floorGain
      m.uniforms.uBgBright.value = this.bgBright
    }
    if (this.compositePass) {
      this.compositePass.uniforms.uBgBright.value = this.bgBright
      this.compositePass.uniforms.uTintPrimary.value.set(this.theme.primary)
      this.compositePass.uniforms.uTintHighlight.value.set(this.theme.highlight)
    }
    for (const m of this.chevronMats) {
      m.uniforms.uColor.value.set(this.theme.primary)
      m.uniforms.uHighlight.value.set(this.theme.highlight)
      m.uniforms.uOpacity.value = 0.95 * this.params.opacity
    }
    if (this.bloomPass) {
      this.bloomPass.strength = this.params.bloomStrength
      this.bloomPass.enabled = this.params.bloomStrength > 0.005
    }
  }

  /** 兼容旧版底板厚度调用（立体光幕已由 railHeight 驱动，不再使用硬边薄板） */
  setSlab(_meters: number) {}

  /** 地面柔光衬底增益 */
  setFloorFill(gain: number) {
    this.floorGain = Math.max(0, gain)
    if (this.groundMat) this.groundMat.uniforms.uFloorGain.value = this.floorGain
  }

  /**
   * 根据背景实景亮度（0..255）平滑自适应混合策略：
   * 常规路面用纯发光软肩叠加；高亮白地板平滑过渡为清透青蓝体积纱幕，无跳变闪烁。
   */
  setBackgroundLuma(luma: number) {
    const t = THREE.MathUtils.clamp((luma - 140) / 65, 0, 1)
    const smooth = t * t * (3 - 2 * t)
    if (Math.abs(smooth - this.bgBright) < 0.005) return
    this.bgBright = smooth
    if (this.groundMat) this.groundMat.uniforms.uBgBright.value = smooth
    if (this.curtainMat) this.curtainMat.uniforms.uBgBright.value = smooth
    if (this.compositePass) this.compositePass.uniforms.uBgBright.value = smooth
  }

  /** 兼容旧版衬底接口 */
  setFloorTint(_amount: number) {}

  /** 兼容旧版平面标牌开关（现由 3D 连续弧形折叠光幕自然呈现弯道方向） */
  setTurnSign(_enabled: boolean) {}

  /** 应用 params 到材质（GUI 实时调参）：仅在尺寸变化时重建网格 */
  applyParams() {
    this.syncMaterialUniforms()
    if (
      this.routeGeo
      && (Math.abs(this.lastBuilt.bandWidth - this.params.bandWidth) > 1e-4
        || Math.abs(this.lastBuilt.railHeight - this.params.railHeight) > 1e-4)
    ) {
      this.lastBuilt.bandWidth = this.params.bandWidth
      this.lastBuilt.railHeight = this.params.railHeight
      this.rebuildCurtain()
    }
  }

  /** 地平线校准：反推 3D 相机 pitch，精确对齐 object-fit:cover 背景地平线 */
  setHorizonCalibration(cfg: { horizonY: number; vanishX: number; eyeHeight?: number }) {
    this.horizon.horizonY = cfg.horizonY
    this.horizon.vanishX = cfg.vanishX
    this.horizon.enabled = true
    this.horizon.pitchDeg = computeHorizonPitchDeg(
      cfg.horizonY,
      this.photoAspect,
      this.container.clientWidth || 1,
      this.container.clientHeight || 1,
      this.camera.fov,
    )
    return this.horizon.pitchDeg
  }

  /** 设置背景照片原始宽高比（供 object-fit:cover 裁剪换算） */
  setPhotoAspect(aspect: number) {
    this.photoAspect = aspect
  }

  /** 视口坐标 x（0..1）换算回照片坐标 x */
  viewportToPhotoX(viewportX: number): number {
    return calcViewportToPhotoX(
      viewportX,
      this.photoAspect,
      this.container.clientWidth || 1,
      this.container.clientHeight || 1,
    )
  }

  /** 地面网格调试开关（1m 网格延伸到 80m） */
  setGroundGrid(visible: boolean) {
    if (visible && !this.groundGrid) {
      const segs = buildGroundGridSegments(80, 1)
      const positions = new Float32Array(segs.length * 6)
      segs.forEach(([a, b], i) => {
        positions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6)
      })
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      this.groundGrid = new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.35 }),
      )
      this.groundGrid.frustumCulled = false
      this.scene.add(this.groundGrid)
    } else if (!visible && this.groundGrid) {
      this.scene.remove(this.groundGrid)
      this.groundGrid.geometry.dispose()
      ;(this.groundGrid.material as THREE.Material).dispose()
      this.groundGrid = undefined
    }
  }

  get horizonPitchDeg(): number {
    return this.horizon.enabled ? this.horizon.pitchDeg : this.horizon.pitchDeg || -10
  }

  validateRouteBelowHorizon() {
    return evaluateRouteBelowHorizon(
      this.routeGeo?.points ?? [],
      this.camera,
      this.horizon.horizonY,
      this.photoAspect,
      this.container.clientWidth || 1,
      this.container.clientHeight || 1,
    )
  }

  private rebuildChevrons() {
    this.disposeChevrons()
    if (!this.routeGeo) return
    const size = chevronDimensions(this.params.bandWidth)
    const geo = new THREE.PlaneGeometry(size.planeW, size.planeL, 1, 1)
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, 0.02, 0)

    const group = new THREE.Group()
    const count = this.opts.chevronCount ?? 3
    this.chevronMats = []
    for (let i = 0; i < count; i++) {
      const mat = createChevronMaterial(this.theme.primary, 0.95 * this.params.opacity, size, this.theme.highlight)
      this.chevronMats.push(mat)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.frustumCulled = false
      mesh.renderOrder = 2
      group.add(mesh)
    }
    group.userData.count = count
    this.chevronGroup = group
    this.scene.add(group)
  }

  private disposeChevrons() {
    if (!this.chevronGroup) {
      this.chevronMats = []
      return
    }
    this.scene.remove(this.chevronGroup)
    const geos = new Set<THREE.BufferGeometry>()
    this.chevronGroup.children.forEach((m: any) => {
      if (m.geometry) geos.add(m.geometry)
      m.material?.dispose?.()
    })
    geos.forEach((g) => g.dispose())
    this.chevronGroup = undefined
    this.chevronMats = []
  }

  private updateChevrons(t: number) {
    if (!this.chevronGroup || !this.routeGeo) return
    const count = this.chevronGroup.userData.count as number
    const spacing = 4.2
    const cycle = spacing * count
    const speed = cycle / Math.max(0.5, this.params.flowSpeed)
    const total = this.routeGeo.total
    this.chevronGroup.children.forEach((mesh: any, i: number) => {
      const base = (i * spacing + t * speed) % cycle
      const dist = 0.6 + base
      const p = pointAtDistance(this.routeGeo!, dist)
      const ahead = pointAtDistance(this.routeGeo!, dist + 0.45)
      mesh.position.set(p.x, 0, p.z)
      mesh.lookAt(ahead.x, 0, ahead.z)
      const fadeIn = Math.min(1, Math.max(0, (dist - 0.5) / 1.0))
      const fadeOut = Math.min(1, Math.max(0, (total - dist) / 8))
      const mat = mesh.material as THREE.ShaderMaterial
      if (mat?.uniforms?.uFade) mat.uniforms.uFade.value = fadeIn * fadeOut
    })
  }

  /** 切换地面 V 形引导箭头（默认关） */
  setChevrons(enabled: boolean) {
    if (this.opts.showChevrons === enabled) return
    this.opts.showChevrons = enabled
    if (enabled) this.rebuildChevrons()
    else this.disposeChevrons()
  }

  /** 外部传入相机位姿（AR 引擎/设备方向） */
  setCameraPose(
    pos: { x: number; y: number; z: number } | THREE.Vector3,
    quat: { x: number; y: number; z: number; w: number } | THREE.Quaternion,
  ) {
    this.camera.position.set(pos.x, pos.y, pos.z)
    this.camera.quaternion.set(quat.x, quat.y, quat.z, quat.w)
    this.ensureNearEndReachesBottom()
  }

  private ensureNearEndReachesBottom() {
    if (!this.routeGeo || !this.rawRoute) return
    this.camera.updateMatrixWorld()
    const edgeDist = groundEdgeDistance(this.camera)
    if (!Number.isFinite(edgeDist)) return
    const wanted = extendRouteToCamera(this.rawRoute, this.camera.position, edgeDist)
    const rebuilt = buildRouteGeometry(wanted, 5, this.routeTension)
    const p = rebuilt.points[0]
    const nearDist = Math.hypot(p.x - this.camera.position.x, p.z - this.camera.position.z)
    const cur = this.routeGeo.points[0]
    const curDist = Math.hypot(cur.x - this.camera.position.x, cur.z - this.camera.position.z)
    if (curDist <= edgeDist + 0.05) return
    if (Math.abs(nearDist - curDist) < 0.15 && nearDist <= edgeDist) return
    this.routeGeo = rebuilt
    this.rebuildCurtain()
  }

  setBanner(banner: BannerConfig | null) {
    this.ui.setBanner(banner)
  }

  setFooter(footer: FooterConfig | null) {
    this.ui.setFooter(footer)
  }

  onFooterButton(handler: (act: 'exit' | 'map') => void) {
    this.ui.onFooterButton(handler)
  }

  onSettings(handler: () => void) {
    this.ui.onSettings(handler)
  }

  show() {
    this.opts.visible = true
    this.revealStart = this.clock.getElapsedTime()
    this.ui.setBannerVisible(true)
  }

  hide() {
    this.opts.visible = false
    this.ui.setBannerVisible(false)
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return
      this.rafId = requestAnimationFrame(tick)
      this.render()
    }
    this.rafId = requestAnimationFrame(tick)
  }

  /** 单帧渲染 */
  render() {
    if (this.disposed) return
    const t = this.clock.getElapsedTime()
    const reveal = this.opts.visible
      ? Math.min(1, (t - this.revealStart) / (this.revealDuration / 1000))
      : 0
    const eased = 1 - Math.pow(1 - reveal, 3)
    for (const m of [this.groundMat, this.curtainMat]) {
      if (m) {
        m.uniforms.uTime.value = t
        m.uniforms.uReveal.value = eased
      }
    }
    this.updateChevrons(t)
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  /** 释放全部 GPU 与 DOM 资源 */
  destroy() {
    this.disposed = true
    cancelAnimationFrame(this.rafId)
    window.removeEventListener('resize', this.onResize)
    const disposeMesh = (o?: THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: any }) => {
      if (!o) return
      this.scene.remove(o)
      o.geometry?.dispose?.()
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m: any) => m?.dispose?.())
    }
    disposeMesh(this.groundMesh)
    disposeMesh(this.curtainMesh)
    disposeMesh(this.groundGrid)
    this.disposeChevrons()
    this.groundMat?.dispose()
    this.curtainMat?.dispose()
    this.bloomPass?.dispose?.()
    this.composer?.renderTarget1?.dispose?.()
    this.composer?.renderTarget2?.dispose?.()
    this.composer?.dispose?.()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.ui.destroy()
  }
}

/** 框架无关入口 */
export function createNaviArrow(container: HTMLElement, options?: NaviArrowOptions): NaviArrowCore {
  return new NaviArrowCore(container, options)
}
