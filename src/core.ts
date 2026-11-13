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
  buildCurtainGeometry,
  buildTopLineGeometry,
  buildGroundGlowGeometry,
  pointAtDistance,
  type RouteGeometry,
} from './route'
import { createCurtainMaterial } from './shader'

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
  curtainHeight: number
  curtainWidth: number
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
  private topLineMesh?: THREE.Mesh
  private topLineMat?: THREE.MeshBasicMaterial
  private groundMesh?: THREE.Mesh
  private groundMat?: THREE.ShaderMaterial
  private chevronGroup?: THREE.Group
  private routeGeo?: RouteGeometry

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
      curtainHeight: options.curtainHeight ?? 0.4,
      curtainWidth: (options.curtainWidth ?? 0.36) / 2, // API 里 curtainWidth 是全宽
      opacity: this.theme.nearOpacity,
      flowSpeed: options.flowSpeed ?? 2.5,
      scanLines: 12,
      bloomStrength: 0.5,
    }

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
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private setupComposer() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), this.params.bloomStrength, 0.4, 0.55)
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
    this.routeGeo = buildRouteGeometry(raw, 4, this.params.curtainHeight)
    this.rebuildCurtain()
    if (this.opts.showChevrons) this.rebuildChevrons()
  }

  private rebuildCurtain() {
    if (!this.routeGeo) return
    // 1. 光幕
    if (this.curtainMesh) {
      this.scene.remove(this.curtainMesh)
      this.curtainMesh.geometry.dispose()
    }
    if (!this.curtainMat) {
      this.curtainMat = createCurtainMaterial({
        color: this.theme.primary,
        topColor: this.theme.highlight,
        opacity: this.params.opacity,
        flowSpeed: this.params.flowSpeed,
        scanLines: this.params.scanLines,
      })
    }
    const geo = buildCurtainGeometry(this.routeGeo, this.params.curtainHeight, this.params.curtainWidth)
    this.curtainMesh = new THREE.Mesh(geo, this.curtainMat)
    this.curtainMesh.frustumCulled = false
    this.scene.add(this.curtainMesh)

    // 2. 顶边亮线（TubeGeometry）
    if (this.topLineMesh) {
      this.scene.remove(this.topLineMesh)
      this.topLineMesh.geometry.dispose()
    }
    if (!this.topLineMat) {
      // 顶边亮线：细、亮，但不要白到发光成"粗管子"
      this.topLineMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.theme.highlight),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    }
    this.topLineMesh = new THREE.Mesh(buildTopLineGeometry(this.routeGeo, 0.008), this.topLineMat)
    this.topLineMesh.frustumCulled = false
    this.scene.add(this.topLineMesh)

    // 3. 地面光迹
    if (this.groundMesh) {
      this.scene.remove(this.groundMesh)
      this.groundMesh.geometry.dispose()
    }
    if (!this.groundMat) {
      this.groundMat = createCurtainMaterial({
        color: this.theme.primary,
        topColor: this.theme.highlight,
        opacity: 0.22,
        flowSpeed: this.params.flowSpeed,
        scanLines: 6,
      })
      this.groundMat.uniforms.uScanLines.value = 6
    }
    this.groundMesh = new THREE.Mesh(buildGroundGlowGeometry(this.routeGeo), this.groundMat)
    this.groundMesh.frustumCulled = false
    this.scene.add(this.groundMesh)

    this.revealStart = this.clock.getElapsedTime()
  }

  /** 应用 params 到材质（lil-gui 实时调参） */
  applyParams() {
    if (this.curtainMat) {
      this.curtainMat.uniforms.uOpacity.value = this.params.opacity
      this.curtainMat.uniforms.uFlowSpeed.value = this.params.flowSpeed
      this.curtainMat.uniforms.uScanLines.value = this.params.scanLines
      this.curtainMat.uniforms.uColor.value.set(this.theme.primary)
      this.curtainMat.uniforms.uTopColor.value.set(this.theme.highlight)
    }
    if (this.groundMat) {
      this.groundMat.uniforms.uOpacity.value = this.params.opacity * 0.6
      this.groundMat.uniforms.uFlowSpeed.value = this.params.flowSpeed
    }
    if (this.topLineMat) {
      this.topLineMat.color.set(this.theme.highlight)
    }
    if (this.bloomPass) this.bloomPass.strength = this.params.bloomStrength
    if (this.routeGeo && (this.curtainMesh || this.topLineMesh)) {
      // 高度变化需要重建几何
      this.routeGeo.topPoints.forEach((p, i) => {
        p.y = this.params.curtainHeight
        void i
      })
      this.rebuildCurtain()
    }
  }

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
    // V 形：ExtrudeGeometry 挤出带倒角，亮面/暗面用两份材质明度区分
    const s = new THREE.Shape()
    const w = 0.38, d = 0.42, t = 0.14
    s.moveTo(-w, 0); s.lineTo(0, d); s.lineTo(w, 0)
    s.lineTo(w - t, 0); s.lineTo(0, d - t * 1.7); s.lineTo(-w + t, 0)
    s.closePath()
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.035,
      bevelSegments: 3,
    })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, 0.04, 0)
    const base = new THREE.Color(this.theme.primary)
    const bright = base.clone().lerp(new THREE.Color('#ffffff'), 0.25)
    const dark = base.clone().lerp(new THREE.Color('#000000'), 0.3)
    for (let i = 0; i < (this.opts.chevronCount ?? 3); i++) {
      // 亮面/暗面双材质，整体低不透明度（贴地扁平）
      const mats = [
        new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: 0.35 }),
        new THREE.MeshBasicMaterial({ color: dark, transparent: true, opacity: 0.3 }),
      ]
      const dist = 1.4 + i * 1.3
      const m = new THREE.Mesh(geo, mats)
      m.position.copy(pointAtDistance(this.routeGeo, dist))
      const ahead = pointAtDistance(this.routeGeo, dist + 0.5)
      m.lookAt(ahead.x, m.position.y, ahead.z)
      group.add(m)
    }
    this.chevronGroup = group
    this.scene.add(group)
  }

  /** 切换地面 V 形箭头 */
  setChevrons(enabled: boolean) {
    if (this.opts.showChevrons === enabled) return
    this.opts.showChevrons = enabled
    if (enabled) this.rebuildChevrons()
    else if (this.chevronGroup) {
      this.scene.remove(this.chevronGroup)
      const mats = new Set<any>()
      this.chevronGroup.children.forEach((m: any) => {
        m.geometry?.dispose?.()
        mats.add(m.material)
      })
      mats.forEach((m) => m.dispose())
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
    for (const m of [this.curtainMat, this.groundMat]) {
      if (m) {
        m.uniforms.uTime.value = t
        m.uniforms.uReveal.value = eased
      }
    }
    // V 形箭头淡入淡出
    if (this.chevronGroup) {
      const period = 3
      const cycle = 0.85
      this.chevronGroup.children.forEach((m: any, i: number) => {
        let phase = ((t / period - i * (cycle / this.opts.chevronCount!)) % cycle)
        if (phase < 0) phase += cycle
        const a = phase < 0.15 ? phase / 0.15 : phase > 0.7 ? Math.max(0, 1 - (phase - 0.7) / 0.15) : 1
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        mats.forEach((mm: any) => { mm.opacity = 0.35 * a })
      })
    }
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
    if (this.curtainMesh) disposeGeoMat(this.curtainMesh)
    if (this.topLineMesh) disposeGeoMat(this.topLineMesh)
    if (this.groundMesh) disposeGeoMat(this.groundMesh)
    this.chevronGroup?.children.forEach(disposeGeoMat)
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
