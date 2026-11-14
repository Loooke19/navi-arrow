/**
 * navi-arrow 核心（重做版）：Three.js 原生 API + EffectComposer/UnrealBloomPass + DOM UI
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
  buildRouteGeometry,
  buildChannelGeometry,
  buildGroundGridSegments,
  pointAtDistance,
  chevronDimensions,
  bendAnchor,
  type RouteGeometry,
} from './route'
import { createBandMaterial, createChevronMaterial, createFloorTintMaterial, createTurnSignMaterial } from './shader'

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
    left: 12px;
    right: 74px;
    height: 56px;
    display: flex;
    align-items: center;
    border-radius: 28px;
    padding: 0 10px 0 6px;
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
    width: 40px; height: 40px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ffffff, #dfe9ff 70%, #bcd0ff);
    display: flex; align-items: center; justify-content: center;
    margin-right: 8px;
    flex: none;
    overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,20,60,.3);
  }
  .na-banner .na-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
  .na-banner .na-icon span { font-size: 24px; line-height: 1; }
  .na-banner-text { display: flex; align-items: baseline; gap: 4px; white-space: nowrap; min-width: 0; }
  .na-banner .na-dist {
    color: #ffffff;
    font-size: 15px;
    font-weight: 500;
    text-shadow: 0 1px 2px rgba(0,30,90,.35);
  }
  .na-banner .na-action {
    color: #ffffff;
    font-size: 15px;
    font-weight: 400;
    text-shadow: 0 1px 2px rgba(0,30,90,.35);
  }
  .na-banner .na-road {
    color: #ffffff;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0;
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
  /** 边缘光幕高度（米，GUI 0~0.8），转弯处还会按曲率再抬高 */
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
  private chevronMats: THREE.ShaderMaterial[] = []
  private bandMesh?: THREE.Mesh
  private bandMat?: THREE.ShaderMaterial
  private tintMesh?: THREE.Mesh
  private tintMat?: THREE.ShaderMaterial
  private tintAmount = 0
  private floorGain = 1
  private railMesh: THREE.Mesh[] = []
  private railMat?: THREE.ShaderMaterial
  private lastBuilt = { bandWidth: 1.2, railHeight: 0.5 }
  private groundMesh?: THREE.Mesh
  private groundMat?: THREE.ShaderMaterial
  private chevronGroup?: THREE.Group
  private turnSign?: THREE.Mesh
  private turnSignMat?: THREE.ShaderMaterial
  private turnSignOn = false
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
      railHeight: options.curtainHeight ?? 0.5,
      opacity: this.theme.nearOpacity,
      flowSpeed: options.flowSpeed ?? 2.5,
      scanLines: 12,
      bloomStrength: 0.04,
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
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false, // 后处理走 RenderTarget，MSAA 帮不上忙，省掉以保住 60fps
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.toneMapping = THREE.NoToneMapping
    // 画布本身不盖住背景：最终 pass 写出预乘光、alpha=0，由浏览器做加法合成
    this.renderer.domElement.style.background = 'transparent'
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
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private setupComposer() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    // 半分辨率、低强度。阈值只放过顶边细线和箭头中心，地面填充不进 bloom。
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), this.params.bloomStrength, 0.15, 0.5)
    this.bloomPass.resolution = new THREE.Vector2(0.5, 0.5)
    const hi = (this.bloomPass as any).highPassUniforms
    if (hi?.smoothWidth) hi.smoothWidth.value = 0.08
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
    // 预乘加法：rgb = 要加到照片上的光，alpha = 0 → 浏览器 result = rgb + photo，绝不压暗。
    const AdditiveCompositeShader = {
      uniforms: { tDiffuse: { value: null } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          vec3 light = max(c.rgb, vec3(0.0));
          float lum = max(light.r, max(light.g, light.b));
          light *= smoothstep(0.0, 0.01, lum);
          // alpha 来自青色衬底和地面箭头。上限留给白地板上的 V，不把整条路压暗。
          float a = clamp(c.a, 0.0, 0.7);
          gl_FragColor = vec4(light, a);
        }
      `,
    }
    this.alphaPass = new ShaderPass(AdditiveCompositeShader)
    this.alphaPass.material.blending = THREE.NoBlending
    this.alphaPass.material.transparent = false
    this.alphaPass.material.depthTest = false
    this.alphaPass.material.depthWrite = false
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
  setRoute(route: NonNullable<NaviArrowOptions['route']>, opts?: { tension?: number }) {
    const raw = normalizeRoute(route)
    this.routeGeo = buildRouteGeometry(raw, 3, opts?.tension ?? 0.4)
    this.rebuildCurtain()
    if (this.turnSignOn) this.placeTurnSign()
  }

  private rebuildCurtain() {
    if (!this.routeGeo) return
    const halfW = this.params.bandWidth / 2

    // 1. 地面带（加法发光、横向羽化）
    if (this.tintMesh) {
      this.scene.remove(this.tintMesh)
      this.tintMesh = undefined
    }
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
    this.bandMat.uniforms.uFloorGain.value = this.floorGain
    const wallH = Math.min(0.58, Math.max(0.42, this.params.railHeight || 0.5))
    const channelGeo = buildChannelGeometry(this.routeGeo, halfW, wallH)
    if (!this.tintMat) this.tintMat = createFloorTintMaterial(this.theme.primary, this.tintAmount)
    this.tintMesh = new THREE.Mesh(channelGeo, this.tintMat)
    this.tintMesh.frustumCulled = false
    this.tintMesh.renderOrder = 0
    this.tintMesh.visible = this.tintAmount > 0.001
    this.scene.add(this.tintMesh)
    this.bandMesh = new THREE.Mesh(channelGeo, this.bandMat)
    this.bandMesh.frustumCulled = false
    this.bandMesh.renderOrder = 1
    this.scene.add(this.bandMesh)

    // 3. 贴地软箭头（带宽变化时一起重做，保证宽度约为一半）
    if (this.opts.showChevrons !== false) this.rebuildChevrons()

    this.revealStart = this.clock.getElapsedTime()
  }

  /** 槽底填充倍率。1 是医院现在的亮度，街景用更高的值把路面染青。 */
  setFloorFill(gain: number) {
    this.floorGain = Math.max(0, gain)
    if (this.bandMat) this.bandMat.uniforms.uFloorGain.value = this.floorGain
  }

  /** 亮地板上的极淡青色衬底。0 表示关闭。 */
  setFloorTint(amount: number) {
    this.tintAmount = Math.max(0, amount)
    if (this.tintMat) {
      this.tintMat.uniforms.uAmount.value = this.tintAmount
      this.tintMat.uniforms.uColor.value.set(this.theme.primary)
    }
    if (this.tintMesh) this.tintMesh.visible = this.tintAmount > 0.001
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
      if (m.uniforms.uFloorGain) m.uniforms.uFloorGain.value = this.floorGain
    }
    for (const m of this.chevronMats) {
      m.uniforms.uColor.value.set(this.theme.primary)
      m.uniforms.uOpacity.value = 1.35 * this.params.opacity
    }
    if (this.turnSignMat) this.turnSignMat.uniforms.uColor.value.set(this.theme.primary)
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
   * 贴地软 V：宽度约为光带的一半，加法混合，中心亮、边缘化掉。
   * 没有挤出厚度，也没有白描边。位置每帧沿路线前移，不重建几何。
   */
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
      const mat = createChevronMaterial(this.theme.primary, 1.35 * this.params.opacity, size)
      this.chevronMats.push(mat)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.frustumCulled = false
      mesh.renderOrder = 3
      mesh.userData.slot = i
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

  /** 每帧更新箭头位置（沿路线滑行，间距 3m，2.5s 一循环） */
  private updateChevrons(t: number) {
    if (!this.chevronGroup || !this.routeGeo) return
    const count = this.chevronGroup.userData.count as number
    const spacing = 6
    const cycle = spacing * count
    const speed = cycle / 2.5
    const total = this.routeGeo.total
    this.chevronGroup.children.forEach((mesh: any, i: number) => {
      const base = (i * spacing + t * speed) % cycle
      // 最近的一支也停在镜头前几米，避免尖端探出光带下沿，把底部宽度测成一条细线
      const dist = 5.5 + base
      const p = pointAtDistance(this.routeGeo!, dist)
      const ahead = pointAtDistance(this.routeGeo!, dist + 0.45)
      mesh.position.set(p.x, 0, p.z)
      mesh.lookAt(ahead.x, 0, ahead.z)
      const fadeIn = Math.min(1, Math.max(0, (dist - 4.2) / 2))
      const fadeOut = Math.min(1, Math.max(0, (total - dist) / 8))
      const mat = mesh.material as THREE.ShaderMaterial
      if (mat?.uniforms?.uFade) mat.uniforms.uFade.value = fadeIn * fadeOut
    })
  }

  /**
   * 弯道处立一块对着镜头的半透明标牌（约 1.2 米高），中间是指向转弯方向的 V。
   * 远处置在走廊尽头时像素不多，所以箭头尽量占满牌面。
   */
  setTurnSign(enabled: boolean) {
    this.turnSignOn = enabled
    if (!enabled) {
      if (this.turnSign) this.turnSign.visible = false
      return
    }
    if (!this.turnSignMat) this.turnSignMat = createTurnSignMaterial(this.theme.primary)
    if (!this.turnSign) {
      const geo = new THREE.PlaneGeometry(1.45, 1.2)
      this.turnSign = new THREE.Mesh(geo, this.turnSignMat)
      this.turnSign.frustumCulled = false
      this.turnSign.renderOrder = 4
      this.scene.add(this.turnSign)
    }
    this.turnSignMat.uniforms.uColor.value.set(this.theme.primary)
    this.placeTurnSign()
  }

  private placeTurnSign() {
    if (!this.turnSign || !this.routeGeo) return
    const bend = bendAnchor(this.routeGeo)
    if (!bend) {
      this.turnSign.visible = false
      return
    }
    this.turnSign.visible = true
    this.turnSign.position.set(bend.point.x, 0.6, bend.point.z)
    if (this.turnSignMat) this.turnSignMat.uniforms.uDir.value = bend.right ? 1 : -1
    this.faceTurnSign()
  }

  private faceTurnSign() {
    if (!this.turnSign?.visible) return
    this.turnSign.lookAt(this.camera.position.x, this.turnSign.position.y, this.camera.position.z)
  }

  /** 切换地面 V 形箭头（默认开） */
  setChevrons(enabled: boolean) {
    if (this.opts.showChevrons === enabled) return
    this.opts.showChevrons = enabled
    if (enabled) this.rebuildChevrons()
    else this.disposeChevrons()
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
    this.faceTurnSign()
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
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
    if (this.tintMesh) this.scene.remove(this.tintMesh)
    if (this.bandMesh) disposeGeoMat(this.bandMesh)
    this.tintMat?.dispose()
    this.railMesh.forEach(disposeGeoMat)
    if (this.groundMesh) disposeGeoMat(this.groundMesh)
    if (this.groundGrid) disposeGeoMat(this.groundGrid)
    this.disposeChevrons()
    if (this.turnSign) {
      this.scene.remove(this.turnSign)
      this.turnSign.geometry.dispose()
      this.turnSign = undefined
    }
    this.turnSignMat?.dispose()
    this.bandMat?.dispose()
    this.railMat?.dispose()
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

/** 框架无关入口 */
export function createNaviArrow(container: HTMLElement, options?: NaviArrowOptions): NaviArrowCore {
  return new NaviArrowCore(container, options)
}
