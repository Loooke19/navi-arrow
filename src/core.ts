/**
 * navi-arrow 核心（重做版）：Three.js 原生 API + EffectComposer/UnrealBloomPass + DOM UI
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
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
  buildRouteGeometry,
  buildBandGeometry,
  buildEdgeLinePoints,
  buildRailGeometry,
  buildGroundGridSegments,
  pointAtDistance,
  type RouteGeometry,
} from './route'
import { createBandMaterial, createRailMaterial } from './shader'

const css = String.raw

const STYLE = css`
  :host, .na-root {
    all: initial;
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    font-family: -apple-system, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .na-root * { box-sizing: border-box; }
  .na-gl { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
  .na-gl canvas { width: 100% !important; height: 100% !important; }
  .na-ui { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
  .na-ui button { pointer-events: auto; font-family: inherit; }

  /* ===== 顶部横幅（百度风格：完整蓝色渐变胶囊） ===== */
  .na-banner {
    position: absolute;
    top: calc(68px + env(safe-area-inset-top, 0px));
    left: 15px;
    right: 76px;
    height: 56px;
    display: flex;
    align-items: center;
    border-radius: 28px;
    padding: 0 18px 0 7px;
    overflow: hidden;
    opacity: 0;
    transform: translateY(-10px);
    transition: opacity .3s ease, transform .3s ease;
    background:
      linear-gradient(90deg,
        rgba(88, 148, 255, 0.95) 0%,
        rgba(64, 122, 235, 0.88) 55%,
        rgba(52, 105, 214, 0.55) 88%,
        rgba(52, 105, 214, 0.0) 100%);
    box-shadow: 0 2px 10px rgba(10, 40, 100, 0.35);
  }
  .na-banner.visible { opacity: 1; transform: translateY(0); }
  .na-banner .na-icon {
    width: 46px; height: 46px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ffffff, #dfe9ff 70%, #bcd0ff);
    display: flex; align-items: center; justify-content: center;
    margin-right: 12px;
    flex: none;
    overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,20,60,.3);
  }
  .na-banner .na-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
  .na-banner .na-icon span { font-size: 24px; line-height: 1; }
  .na-banner-text { display: flex; align-items: baseline; gap: 8px; white-space: nowrap; }
  .na-banner .na-dist {
    color: #ffffff;
    font-size: 17px;
    font-weight: 500;
    text-shadow: 0 1px 2px rgba(0,30,90,.35);
  }
  .na-banner .na-action {
    color: #ffffff;
    font-size: 18px;
    font-weight: 400;
    text-shadow: 0 1px 2px rgba(0,30,90,.35);
  }
  .na-banner .na-road {
    color: #ffffff;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: .5px;
    text-shadow: 0 1px 2px rgba(0,30,90,.35);
  }
  .na-arrow-icon { width: 26px; height: 26px; }

  /* 右上角 AR 设置（白色圆角方块，黑 AR 徽标） */
  .na-settings {
    position: absolute;
    top: calc(64px + env(safe-area-inset-top, 0px));
    right: 15px;
    width: 56px; height: 56px;
    border-radius: 12px;
    border: none;
    background: rgba(255,255,255,.96);
    color: #333;
    font-size: 12px;
    line-height: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 3px;
    box-shadow: 0 2px 8px rgba(0,0,0,.18);
  }
  .na-settings .na-ar-badge {
    width: 30px; height: 26px; border-radius: 8px;
    background: #2e3238; color: #fff;
    font-size: 11px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    letter-spacing: .5px;
  }
  .na-settings.hidden { display: none; }

  /* 横幅文字切换动画：上滑淡入 */
  .na-banner-text-wrap { overflow: hidden; display: flex; align-items: center; }
  .na-banner-text-wrap .na-banner-text { animation: na-slide-in .35s ease both; }
  @keyframes na-slide-in {
    from { transform: translateY(14px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  /* ===== 底部信息条（百度风格：两按钮 + 中央文字） ===== */
  .na-footer {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 88px;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: rgba(22, 28, 38, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 10px;
  }
  .na-footer .na-footer-btn {
    width: 60px; height: 62px;
    background: transparent; border: none;
    color: #fff; font-size: 14px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 4px;
    padding: 0;
  }
  .na-footer .na-footer-btn svg { width: 24px; height: 24px; }
  .na-footer .na-info { color: #fff; text-align: center; flex: 1; }
  .na-footer .na-main-line { font-size: 19px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,.5); }
  .na-footer .na-sub-line { font-size: 14px; color: rgba(255,255,255,.85); margin-top: 3px; }
  .na-footer.hidden { display: none; }
`

function renderIcon(name: 'exit' | 'map'): string {
  if (name === 'exit') {
    // 左箭头出框（百度「退出」图标）
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 12.5 12 18 18"/><path d="M12.5 12H4"/><path d="M20 4v16"/></svg>`
  }
  // 地图 pin
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.7-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.3 12 21 12 21z"/><path d="M9.5 10.5 12 13l2.5-2.5"/></svg>`
}

/** 默认转向图标（右转箭头，白色） */
const TURN_ICON = `<svg class="na-arrow-icon" viewBox="0 0 24 24" fill="#ffffff"><path d="M13.5 4 20 9.5 13.5 15v-4.2c-3.6.4-6 2.4-6 6.7v2h-3v-2c0-6 4-9.3 9-9.8V4z"/></svg>`

export interface NaviArrowParams {
  /** 地面带宽度（米，GUI 0.6~2.0） */
  bandWidth: number
  /** 边缘光幕高度（米，GUI 0~0.6） */
  railHeight: number
  opacity: number
  flowSpeed: number
  scanLines: number
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
  private alphaPass?: ShaderPass
  private curtainMesh?: THREE.Mesh
  private curtainMat?: THREE.ShaderMaterial
  private chevronMat?: THREE.MeshBasicMaterial
  private chevronRimMat?: THREE.MeshBasicMaterial
  private bandMesh?: THREE.Mesh
  private bandMat?: THREE.ShaderMaterial
  private edgeLines: Line2[] = []
  private edgeMat?: LineMaterial
  private railMesh: THREE.Mesh[] = []
  private railMat?: THREE.ShaderMaterial
  private lastBuilt = { bandWidth: 1.2, railHeight: 0.25 }
  private topLine?: Line2
  private topLineMat?: LineMaterial
  private groundMesh?: THREE.Mesh
  private groundMat?: THREE.ShaderMaterial
  private chevronGroup?: THREE.Group
  private routeGeo?: RouteGeometry
  private groundGrid?: THREE.LineSegments
  /** 地平线校准状态 */
  horizon: { horizonY: number; vanishX: number; pitchDeg: number; enabled: boolean }

  rootEl!: HTMLElement
  theme!: NaviTheme
  private bannerEl?: HTMLElement
  private bannerTextWrap?: HTMLElement
  private footerEl?: HTMLElement
  private settingsEl?: HTMLElement
  private shadow: ShadowRoot | null = null

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
      bandWidth: options.curtainWidth ?? 1.2,
      railHeight: options.curtainHeight ?? 0.3,
      opacity: this.theme.nearOpacity,
      flowSpeed: options.flowSpeed ?? 2.5,
      scanLines: 12,
      bloomStrength: 0.5,
    }
    this.lastBuilt = { bandWidth: this.params.bandWidth, railHeight: this.params.railHeight }
    /** 地平线校准：背景图地平线（0..1 高度）与消失点 x（0..1 宽度） */
    this.horizon = { horizonY: 0.45, vanishX: 0.5, pitchDeg: -10, enabled: false }

    // UI（Shadow DOM 隔离样式）
    this.shadow = (container as any).attachShadow?.({ mode: 'open' }) ?? null
    const host = this.shadow ?? container
    const style = document.createElement('style')
    style.textContent = STYLE
    const root = document.createElement('div')
    root.className = 'na-root'
    root.innerHTML = `
      <div class="na-gl"></div>
      <div class="na-ui"></div>
    `
    host.appendChild(style)
    host.appendChild(root)
    this.rootEl = root

    // Three.js：alpha 透明叠加
    const glHost = root.querySelector('.na-gl') as HTMLElement
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)
    glHost.appendChild(this.renderer.domElement)
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 300)

    this.buildUI()
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
    this.renderer.setSize(w, h, false)
    this.composer?.setSize(w, h)
    this.bloomPass?.setSize(w / 2, h / 2)
    this.edgeMat?.resolution.set(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private setupComposer() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    // bloom 半分辨率（移动端性能），低阈值只让顶线和流动带发光
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), this.params.bloomStrength, 0.4, 0.75)
    this.bloomPass.resolution = new THREE.Vector2(0.5, 0.5)
    this.composer.addPass(this.bloomPass)
    // 透明背景 alpha 修复：UnrealBloomPass 会把 alpha 重置为 1，
    // 这里按亮度重建 alpha（发光叠加型 AR 的标准做法），让背景透出来。
    const AlphaPreserveShader = {
      uniforms: { tDiffuse: { value: null } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          float lum = max(c.r, max(c.g, c.b));
          // 亮度越高的地方越不透明；纯黑（背景）完全透明
          float a = smoothstep(0.0, 0.35, lum);
          gl_FragColor = vec4(c.rgb, a);
        }
      `,
    }
    this.alphaPass = new ShaderPass(AlphaPreserveShader)
    this.composer.addPass(this.alphaPass)
    this.composer.renderToScreen = true
  }

  private buildUI() {
    const ui = this.rootEl.querySelector('.na-ui') as HTMLElement
    // 横幅
    this.bannerEl = document.createElement('div')
    this.bannerEl.className = 'na-banner'
    this.bannerEl.innerHTML = `
      <div class="na-icon"></div>
      <div class="na-banner-text-wrap"><div class="na-banner-text"></div></div>
    `
    ui.appendChild(this.bannerEl)
    this.bannerTextWrap = this.bannerEl.querySelector('.na-banner-text-wrap') as HTMLElement

    // 右上角 AR 设置
    this.settingsEl = document.createElement('button')
    this.settingsEl.className = 'na-settings'
    this.settingsEl.innerHTML = `<span class="na-ar-badge">AR</span><span>AR设置</span>`
    ui.appendChild(this.settingsEl)

    // 底部信息条
    this.footerEl = document.createElement('div')
    this.footerEl.className = 'na-footer hidden'
    this.footerEl.innerHTML = `
      <button class="na-footer-btn" data-act="exit">${renderIcon('exit')}<span>退出</span></button>
      <div class="na-info"><div class="na-main-line"></div><div class="na-sub-line"></div></div>
      <button class="na-footer-btn" data-act="map">${renderIcon('map')}<span>地图</span></button>
    `
    ui.appendChild(this.footerEl)
  }

  /** 设置/替换路线（局部坐标：米，y 向上） */
  setRoute(route: NonNullable<NaviArrowOptions['route']>) {
    const raw = normalizeRoute(route)
    this.routeGeo = buildRouteGeometry(raw)
    this.rebuildCurtain()
  }

  private rebuildCurtain() {
    if (!this.routeGeo) return
    const halfW = this.params.bandWidth / 2

    // 1. 地面带（加法发光、横向羽化）
    if (this.bandMesh) {
      this.scene.remove(this.bandMesh)
      this.bandMesh.geometry.dispose()
    }
    if (!this.bandMat) {
      this.bandMat = createBandMaterial({
        color: this.theme.primary,
        farColor: this.theme.highlight,
        opacity: this.params.opacity,
        flowSpeed: this.params.flowSpeed,
        scanLines: this.params.scanLines,
      })
    }
    this.bandMesh = new THREE.Mesh(buildBandGeometry(this.routeGeo, halfW), this.bandMat)
    this.bandMesh.frustumCulled = false
    this.scene.add(this.bandMesh)

    // 2. 两条亮边线（Line2 屏幕空间 ~2px）
    if (!this.edgeMat) {
      this.edgeMat = new LineMaterial({
        color: new THREE.Color(this.theme.highlight),
        linewidth: 2,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    }
    this.edgeLines.forEach((l) => {
      this.scene.remove(l)
      l.geometry.dispose()
    })
    this.edgeLines = buildEdgeLinePoints(this.routeGeo, halfW).map((pts) => {
      const lg = new LineGeometry()
      lg.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]))
      const line = new Line2(lg, this.edgeMat)
      line.frustumCulled = false
      this.scene.add(line)
      return line
    })

    // 3. 两条低矮边缘光幕
    this.railMesh.forEach((m) => {
      this.scene.remove(m)
      m.geometry.dispose()
    })
    if (!this.railMat) {
      this.railMat = createRailMaterial({
        color: this.theme.primary,
        farColor: this.theme.highlight,
        opacity: this.params.opacity,
        flowSpeed: this.params.flowSpeed,
      })
    }
    this.railMesh = ([-1, 1] as const).map((side) => {
      const m = new THREE.Mesh(buildRailGeometry(this.routeGeo!, halfW, this.params.railHeight, side), this.railMat)
      m.frustumCulled = false
      this.scene.add(m)
      return m
    })

    // 4. 平面滑动 V 形箭头（只在尚未创建时创建；setChevrons 控制开关）
    if (this.opts.showChevrons !== false && !this.chevronGroup) this.rebuildChevrons()

    this.revealStart = this.clock.getElapsedTime()
  }

  /** 应用 params 到材质（lil-gui 实时调参）——只改 uniform，不重建几何（宽高变化才重建） */
  applyParams() {
    for (const m of [this.bandMat, this.railMat, this.groundMat]) {
      if (!m) continue
      m.uniforms.uOpacity.value = this.params.opacity
      m.uniforms.uFlowSpeed.value = this.params.flowSpeed
      m.uniforms.uScanLines.value = this.params.scanLines
      m.uniforms.uColor.value.set(this.theme.primary)
      m.uniforms.uFarColor.value.set(this.theme.highlight)
    }
    if (this.edgeMat) this.edgeMat.color.set(this.theme.highlight)
    if (this.bloomPass) this.bloomPass.strength = this.params.bloomStrength
    // 只有带宽/光幕高度变化才重建几何（可避免每帧重建）
    if (this.routeGeo && (this.lastBuilt.bandWidth !== this.params.bandWidth || this.lastBuilt.railHeight !== this.params.railHeight)) {
      this.lastBuilt.bandWidth = this.params.bandWidth
      this.lastBuilt.railHeight = this.params.railHeight
      this.rebuildCurtain()
    }
  }

  /**
   * 地平线校准（REDO3 核心）：
   * 根据背景图的地平线 horizonY（0..1 图像高度）与消失点 vanishX（0..1 宽度），
   * 反推 3D 相机 pitch，使 3D 地平线（y=眼高处无穷远点）精确落在 horizonY 上。
   * 明确处理 object-fit:cover 裁剪，任意视口比例下都成立。
   */
  setHorizonCalibration(cfg: { horizonY: number; vanishX: number; eyeHeight?: number }) {
    this.horizon.horizonY = cfg.horizonY
    this.horizon.vanishX = cfg.vanishX
    this.horizon.enabled = true
    const eye = cfg.eyeHeight ?? 1.6
    // object-fit:cover 裁剪：背景图与视口宽高比不同时，图像被放大裁切。
    // 3D canvas 铺满视口（与视口同比例），photo 的 horizonY 是相对整图的。
    // cover 缩放后图像可见比例：视口宽/图宽 与 视口高/图高 取大者；裁掉上下（或左右）。
    // 需要知道背景图原始宽高比 —— 由 demo 页通过 setPhotoAspect 传入，缺省按视口=图（无裁剪）。
    const visibleHorizonY = this.photoToViewportY(this.horizon.horizonY)
    // 3D 地平线在 NDC 里的 y：pitch=θ（正=向上）时，地平线（眼高无穷远）在视轴下方 θ，
    // NDC_y = -tan(θ)/tan(fovY/2)。要求 NDC_y = 1 - 2*visibleHorizonY：
    //   tan(θ) = (2*visibleHorizonY - 1) * tan(fovY/2)
    // 注意 three.js Euler X 旋转正方向是向上看。
    const fovY = THREE.MathUtils.degToRad(this.camera.fov)
    const ndcY = 1 - 2 * visibleHorizonY
    const pitch = Math.atan((2 * visibleHorizonY - 1) * Math.tan(fovY / 2))
    this.horizon.pitchDeg = THREE.MathUtils.radToDeg(pitch)
    return this.horizon.pitchDeg
  }

  /** 背景照片原始宽高比（供 cover 裁剪换算），如 828/1054 */
  setPhotoAspect(aspect: number) {
    this.photoAspect = aspect
  }

  private photoAspect = 0

  /** 把照片坐标的 y（0..1）换算到视口坐标 y（0..1），处理 object-fit:cover 裁剪 */
  private photoToViewportY(photoY: number): number {
    if (!this.photoAspect) return photoY // 未知则假定无裁剪
    const vw = this.container.clientWidth || 1
    const vh = this.container.clientHeight || 1
    const viewportAspect = vw / vh
    // cover 缩放 = max(vw/iw, vh/ih)。
    // viewportAspect < photoAspect：视口相对更「竖」→ 图按高度铺满、左右裁剪 → y 不变
    // viewportAspect > photoAspect：视口相对更「横」→ 图按宽度铺满、上下裁剪 → y 需映射
    if (viewportAspect > this.photoAspect) {
      const visibleFraction = this.photoAspect / viewportAspect // 可见高度占整图比例
      const top = (1 - visibleFraction) / 2
      return (photoY - top) / visibleFraction
    }
    return photoY
  }

  /** 把视口坐标 x（0..1）换算回照片坐标 x（cover 左右裁剪时） */
  viewportToPhotoX(viewportX: number): number {
    if (!this.photoAspect) return viewportX
    const vw = this.container.clientWidth || 1
    const vh = this.container.clientHeight || 1
    const viewportAspect = vw / vh
    if (viewportAspect < this.photoAspect) {
      // 图按高度铺满、左右裁剪
      const visibleFraction = viewportAspect / this.photoAspect
      const left = (1 - visibleFraction) / 2
      return left + viewportX * visibleFraction
    }
    return viewportX
  }

  /** 地面网格调试开关：1m 网格（y=0）延伸到 80m + 地平线 */
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

  /** 当前 pitch（度）——demo 在 applyLook 时用 */
  get horizonPitchDeg(): number {
    return this.horizon.enabled ? this.horizon.pitchDeg : this.horizon.pitchDeg || -10
  }

  /**
   * 自动验收检查：把所有路线采样点投影到屏幕，
   * 每个点都必须在地平线之下，最远点距地平线 ≤ 3% 屏高。
   */
  validateRouteBelowHorizon(): { ok: boolean; maxAbove: number; farthestGap: number; horizonPx: number; points: Array<{ x: number; y: number }> } {
    const h = this.container.clientHeight || 1
    const horizonPx = this.photoToViewportY(this.horizon.horizonY) * h
    const pts = this.routeGeo?.points ?? []
    let maxAbove = 0
    let farthestGap = Infinity
    const screen: Array<{ x: number; y: number }> = []
    const v = new THREE.Vector3()
    for (const p of pts) {
      v.copy(p).project(this.camera)
      const sy = (1 - (v.y + 1) / 2) * h
      screen.push({ x: (v.x + 1) / 2, y: sy / h })
      maxAbove = Math.max(maxAbove, horizonPx - sy)
      farthestGap = sy - horizonPx
    }
    // 最远点 = 最后一个可见点
    const farGapPx = Math.abs(farthestGap)
    const ok = maxAbove <= 0.5 && farGapPx <= h * 0.03 + 8 // 8px 容差
    return { ok, maxAbove, farthestGap: farGapPx, horizonPx, points: screen }
  }

  /**
   * 平面滑动 V 形箭头（百度风格）：贴地在带内，沿路线平滑前移 + 淡入淡出。
   * 形状：圆角 V 形，蓝色渐变填充 + 细白边（几何实现，不用纹理），
   * 发光强度受控（亮度远低于白）、且不进入 bloom —— 避免过曝糊成一团。
   * 全部箭头的位置在 render() 里按时间更新，不重建几何。
   */
  private rebuildChevrons() {
    if (this.chevronGroup) {
      this.scene.remove(this.chevronGroup)
      const mats = new Set<any>()
      this.chevronGroup.children.forEach((m: any) => {
        m.geometry?.dispose?.()
        mats.add(m.material)
      })
      mats.forEach((m) => m.dispose())
      this.chevronGroup = undefined
    }
    if (!this.routeGeo) return

    const group = new THREE.Group()
    // 圆角 V 形外轮廓（竖向 ±Y 平面，随后 rotateX 贴地）
    const W = 0.21   // 半宽（整体约 0.42m 宽）
    const D = 0.22   // V 的进深
    const T = 0.075  // 笔画粗
    const R = 0.04   // 圆角半径
    const outer = roundedChevronPath(W, D, T, R, 0)
    const inner = roundedChevronPath(W - T * 0.95, D, T * 0.95, R * 0.7, T * 0.55)
    // 填充：外轮廓 + 内轮廓挖洞（挤出成有厚度的立体 V）
    const shape = new THREE.Shape(outer)
    shape.holes.push(new THREE.Path(inner.slice().reverse()))

    // 细白边：沿外轮廓的窄带（外轮廓 - 略微内缩的轮廓）
    const rimOuter = roundedChevronPath(W, D, T, R, 0)
    const rimInnerPts = roundedChevronPath(W - 0.022, D, T - 0.022, Math.max(0.02, R - 0.02), 0.011)
    const rimShape = new THREE.Shape(rimOuter)
    rimShape.holes.push(new THREE.Path(rimInnerPts.slice().reverse()))
    const rimGeo = new THREE.ShapeGeometry(rimShape, 8)

    // 贴地 + 立体化：rim 仍为平面贴地亮边
    const lay = (g: THREE.BufferGeometry) => {
      g.rotateX(-Math.PI / 2)
      g.translate(0, 0.012, 0)
      return g
    }
    // 填充挤出薄厚度让箭头有侧壁、更立体可辨
    const fillGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.018,
      bevelSegments: 2,
    })
    fillGeo.rotateX(-Math.PI / 2)
    fillGeo.translate(0, 0.035, 0)
    lay(rimGeo)

    // 蓝色渐变填充：用顶点色（顶点端亮、开口端稍深）——挤出后有侧面，顶点色让顶面亮侧面暗。
    const positions = fillGeo.getAttribute('position')
    const colors = new Float32Array(positions.count * 3)
    const cTop = new THREE.Color('#5AA2FF')   // 顶面亮蓝（亮度低于 bloom 阈值）
    const cBottom = new THREE.Color('#2E6BC8') // 侧面暗蓝
    let minY = Infinity, maxY = -Infinity
    for (let i = 0; i < positions.count; i++) {
      minY = Math.min(minY, positions.getY(i))
      maxY = Math.max(maxY, positions.getY(i))
    }
    const span = Math.max(1e-6, maxY - minY)
    for (let i = 0; i < positions.count; i++) {
      const t = (positions.getY(i) - minY) / span // 0 底（侧面）→ 1 顶（顶面）
      const c = cBottom.clone().lerp(cTop, t)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    fillGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const fillMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      // 注意：不用 AdditiveBlending —— 保持可辨识的实心蓝 V，不会过曝
      blending: THREE.NormalBlending,
    })
    const rimMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#D8EBFF'), // 明亮但低于 bloom 阈值（避免过曝糊团）
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
    this.chevronMat = fillMat
    this.chevronRimMat = rimMat

    const count = this.opts.chevronCount ?? 3
    for (let i = 0; i < count; i++) {
      const item = new THREE.Group()
      const fill = new THREE.Mesh(fillGeo, fillMat)
      const rim = new THREE.Mesh(rimGeo, rimMat)
      rim.renderOrder = 1
      fill.layers.set(1)
      rim.layers.set(1)
      item.add(fill, rim)
      item.userData.slot = i
      group.add(item)
    }
    this.chevronGroup = group
    this.chevronGroup.userData.count = count
    this.scene.add(group)
  }

  /** 每帧更新箭头位置（沿路线滑行，间距 3m，2.5s 一循环） */
  private updateChevrons(t: number) {
    if (!this.chevronGroup || !this.routeGeo) return
    const count = this.chevronGroup.userData.count as number
    const spacing = 3
    const cycle = spacing * count
    const speed = cycle / 2.5 // m/s，对应 2.5s 一循环
    const total = this.routeGeo.total
    this.chevronGroup.children.forEach((item: any, i: number) => {
      const base = ((i * spacing + t * speed) % cycle)
      const dist = 2.0 + base
      const p = pointAtDistance(this.routeGeo!, dist)
      const ahead = pointAtDistance(this.routeGeo!, dist + 0.4)
      item.position.set(p.x, 0, p.z)
      item.lookAt(ahead.x, 0, ahead.z)
      // 近处/远处两端淡入淡出，避免跳变
      const fadeIn = Math.min(1, dist / 2.5)
      const fadeOut = Math.min(1, Math.max(0, (total - dist) / 6))
      const k = fadeIn * fadeOut
      if (this.chevronMat) this.chevronMat.opacity = 0.85 * k
      if (this.chevronRimMat) this.chevronRimMat.opacity = 0.9 * k
    })
  }

  /** 切换地面 V 形箭头（默认开） */
  setChevrons(enabled: boolean) {
    if (this.opts.showChevrons === enabled) return
    this.opts.showChevrons = enabled
    if (enabled) {
      this.rebuildChevrons()
    } else if (this.chevronGroup) {
      this.scene.remove(this.chevronGroup)
      this.chevronGroup.children.forEach((item: any) => {
        item.children?.forEach((m: any) => {
          m.geometry?.dispose?.()
          m.material?.dispose?.()
        })
      })
      this.chevronGroup = undefined
    }
  }

  /** 外部传入相机位姿（AR 引擎/设备方向） */
  setCameraPose(pos: { x: number; y: number; z: number } | THREE.Vector3, quat: { x: number; y: number; z: number; w: number } | THREE.Quaternion) {
    this.camera.position.set(pos.x, pos.y, pos.z)
    this.camera.quaternion.set(quat.x, quat.y, quat.z, quat.w)
  }

  /** 设置横幅内容（触发上滑淡入过渡动画） */
  setBanner(banner: BannerConfig | null) {
    if (!this.bannerEl || !this.bannerTextWrap) return
    if (!banner) {
      this.bannerEl.classList.remove('visible')
      return
    }
    setTimeout(() => {
      if (this.disposed || !this.bannerTextWrap) return
      const wrap = this.bannerTextWrap
      const icon = this.bannerEl!.querySelector('.na-icon') as HTMLElement
      wrap.innerHTML = `
        <div class="na-banner-text">
          ${banner.distance ? `<span class="na-dist">${escapeHtml(banner.distance)}</span>` : ''}
          ${banner.action ? `<span class="na-action">${escapeHtml(banner.action)}</span>` : ''}
          ${banner.road ? `<span class="na-road">${escapeHtml(banner.road)}</span>` : ''}
        </div>
      `
      icon.innerHTML = banner.iconUrl
        ? `<img src="${banner.iconUrl}" alt="">`
        : banner.iconChar
          ? `<span>${banner.iconChar}</span>`
          : TURN_ICON
      this.settingsEl!.classList.toggle('hidden', banner.showSettings === false)
      this.bannerEl!.classList.add('visible')
    }, 0)
  }

  /** 设置底部信息条 */
  setFooter(footer: FooterConfig | null) {
    if (!this.footerEl) return
    if (!footer || footer.enabled === false) {
      this.footerEl.classList.add('hidden')
      return
    }
    this.footerEl.classList.remove('hidden')
    const main = this.footerEl.querySelector('.na-main-line') as HTMLElement
    const sub = this.footerEl.querySelector('.na-sub-line') as HTMLElement
    main.textContent = [footer.distance, footer.duration].filter(Boolean).join(' ')
    sub.textContent = footer.arrival ?? ''
    const [exitBtn, mapBtn] = this.footerEl.querySelectorAll('button') as any
    exitBtn.querySelector('span').textContent = footer.exitLabel ?? '退出'
    mapBtn.querySelector('span').textContent = footer.mapLabel ?? '地图'
  }

  /** 监听底部按钮 */
  onFooterButton(handler: (act: 'exit' | 'map') => void) {
    this.footerEl?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-act]') as HTMLElement | null
      if (btn) handler(btn.dataset.act as any)
    })
  }

  /** 监听右上角「AR设置」按钮 */
  onSettings(handler: () => void) {
    this.settingsEl?.addEventListener('click', handler)
  }

  show() {
    this.opts.visible = true
    this.bannerEl?.classList.add('visible')
  }

  hide() {
    this.opts.visible = false
    this.bannerEl?.classList.remove('visible')
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return
      this.rafId = requestAnimationFrame(tick)
      this.render()
    }
    this.rafId = requestAnimationFrame(tick)
  }

  /** 单帧渲染（外部驱动时调用） */
  render() {
    if (this.disposed) return
    const t = this.clock.getElapsedTime()
    const reveal = this.opts.visible
      ? Math.min(1, (t - this.revealStart) / (this.revealDuration / 1000))
      : 0
    const eased = 1 - Math.pow(1 - reveal, 3) // ease-out
    for (const m of [this.bandMat, this.railMat]) {
      if (m) {
        m.uniforms.uTime.value = t
        m.uniforms.uReveal.value = eased
      }
    }
    this.updateChevrons(t)
    if (this.composer) {
      // 箭头不参与 bloom：主 pass 用 layer 0（箭头在 layer 1），
      // composer 输出后再把箭头直接叠画上去（NormalBlending，清晰锐利）。
      const cam = this.camera as any
      cam.layers.disable(1)
      this.composer.render()
      cam.layers.enable(1)
      if (this.chevronGroup) {
        this.renderer.autoClear = false
        this.renderer.clearDepth()
        this.renderer.render(this.scene, this.camera)
        this.renderer.autoClear = true
      }
    } else this.renderer.render(this.scene, this.camera)
  }

  /** 释放全部 GPU 资源 */
  destroy() {
    this.disposed = true
    cancelAnimationFrame(this.rafId)
    window.removeEventListener('resize', this.onResize)
    const disposeGeoMat = (o: any) => {
      o.geometry?.dispose?.()
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m: any) => m?.dispose?.())
    }
    if (this.bandMesh) disposeGeoMat(this.bandMesh)
    this.edgeLines.forEach(disposeGeoMat)
    this.railMesh.forEach(disposeGeoMat)
    if (this.groundMesh) disposeGeoMat(this.groundMesh)
    if (this.groundGrid) disposeGeoMat(this.groundGrid)
    this.chevronGroup?.children.forEach(disposeGeoMat)
    this.bandMat?.dispose()
    this.railMat?.dispose()
    this.edgeMat?.dispose()
    this.bloomPass?.dispose?.()
    this.composer?.dispose?.()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.rootEl?.remove()
    ;(this.shadow ?? this.container).innerHTML = ''
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/**
 * 圆角 V 形（V 字母）轮廓点：开口朝上（+Y），尖端朝下（-Y）。
 * W = 半宽，D = 进深，T = 笔画粗，R = 圆角半径，inset = 沿笔画向内缩（用于画细边带）。
 * 返回闭合多边形点（THREE.Vector2 数组，便于在 Shape / Path 里复用）。
 */
function roundedChevronPath(W: number, D: number, T: number, R: number, inset: number): THREE.Vector2[] {
  const w = Math.max(0.01, W - inset)
  const t = Math.max(0.008, T - inset * 2)
  const r = Math.max(0.004, R - inset)
  const d = D
  const v2 = (x: number, y: number) => new THREE.Vector2(x, y)
  // 关键点：左上、尖底、右上（外沿）；再折回内沿
  const pts: THREE.Vector2[] = []
  // 外沿：左端 → 向下 → 尖底 → 向上 → 右端
  pts.push(v2(-w, d / 2))
  pts.push(v2(0, -d / 2))
  pts.push(v2(w, d / 2))
  // 右上端（内沿往回）
  pts.push(v2(w, d / 2 - t))
  // 内侧尖底（抬高 t*1.5，让 V 有厚度）
  pts.push(v2(0, -d / 2 + t * 1.6))
  pts.push(v2(-w, d / 2 - t))
  return roundPolygon(pts, r)
}

/** 对多边形每个顶点做圆角（在相邻边之间插入圆弧点） */
function roundPolygon(pts: THREE.Vector2[], radius: number): THREE.Vector2[] {
  if (radius <= 1e-5 || pts.length < 3) return pts
  const out: THREE.Vector2[] = []
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length]
    const cur = pts[i]
    const next = pts[(i + 1) % pts.length]
    const dirA = prev.clone().sub(cur)
    const dirB = next.clone().sub(cur)
    const lenA = dirA.length()
    const lenB = dirB.length()
    if (lenA < 1e-5 || lenB < 1e-5) {
      out.push(cur.clone())
      continue
    }
    dirA.normalize()
    dirB.normalize()
    const rr = Math.min(radius, lenA * 0.45, lenB * 0.45)
    const a = cur.clone().addScaledVector(dirA, rr)
    const b = cur.clone().addScaledVector(dirB, rr)
    out.push(a)
    // 用两个中间点近似圆弧
    const mid1 = a.clone().lerp(cur, 0.5)
    const mid2 = b.clone().lerp(cur, 0.5)
    out.push(mid1, mid2)
    out.push(b)
  }
  return out
}

/** 框架无关入口 */
export function createNaviArrow(container: HTMLElement, options?: NaviArrowOptions): NaviArrowCore {
  return new NaviArrowCore(container, options)
}
