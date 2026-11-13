/**
 * navi-arrow 核心：Three.js 场景 + DOM UI
 */
import * as THREE from 'three'
import {
  DEFAULT_THEME,
  mergeOptions,
  type NaviArrowOptions,
  type NaviTheme,
  type BannerConfig,
  type FooterConfig,
} from './config'
import { normalizeRoute, buildRouteGeometry, buildCurtainGeometry, pointAtDistance, type RouteGeometry } from './route'
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
  .na-ui { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
  .na-ui button { pointer-events: auto; }

  /* ===== 顶部横幅（百度风格） ===== */
  .na-banner {
    position: absolute;
    top: calc(8px + env(safe-area-inset-top, 0px));
    left: 12px;
    right: 12px;
    height: 52px;
    display: flex;
    align-items: center;
    border-radius: 26px;
    background: linear-gradient(90deg,
      rgba(47, 123, 255, 0.92) 0%,
      rgba(56, 130, 245, 0.82) 42%,
      rgba(70, 140, 250, 0.0) 100%);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    padding: 0 68px 0 6px;
    box-shadow: 0 2px 10px rgba(0, 30, 90, 0.25);
    opacity: 0;
    transform: translateY(-12px);
    transition: opacity .3s ease, transform .3s ease;
  }
  .na-banner.visible { opacity: 1; transform: translateY(0); }
  .na-banner .na-banner-text { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; }
  .na-banner .na-dist {
    color: rgba(255,255,255,.92);
    font-size: 14px;
    font-weight: 400;
  }
  .na-banner .na-action {
    color: #fff;
    font-size: 15px;
    font-weight: 400;
  }
  .na-banner .na-road {
    color: #fff;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: .5px;
  }
  .na-banner .na-icon {
    width: 44px; height: 44px;
    border-radius: 50%;
    background: rgba(255,255,255,.95);
    display: flex; align-items: center; justify-content: center;
    margin-right: 10px;
    flex: none;
    overflow: hidden;
  }
  .na-banner .na-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
  .na-banner .na-icon span { font-size: 22px; line-height: 1; }
  .na-arrow-icon { width: 24px; height: 24px; }

  .na-settings {
    position: absolute;
    top: calc(6px + env(safe-area-inset-top, 0px));
    right: 24px;
    width: 46px; height: 46px;
    border-radius: 12px;
    border: none;
    background: rgba(255,255,255,.92);
    color: #555;
    font-size: 11px;
    line-height: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px;
    box-shadow: 0 2px 8px rgba(0,0,0,.15);
    z-index: 3;
  }
  .na-settings .na-ar-badge {
    width: 24px; height: 22px; border-radius: 7px;
    background: #3a3f45; color: #fff;
    font-size: 9px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    letter-spacing: .5px;
  }

  /* 横幅文字切换动画：上滑淡入 */
  .na-banner-text-wrap { overflow: hidden; }
  .na-banner-text-wrap .na-banner-text {
    animation: na-slide-in .35s ease both;
  }
  @keyframes na-slide-in {
    from { transform: translateY(14px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  /* ===== 底部信息条 ===== */
  .na-footer {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 72px;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: rgba(16, 22, 32, 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    display: flex; align-items: center; justify-content: space-between;
    padding-left: 12px; padding-right: 12px;
  }
  .na-footer .na-footer-btn {
    width: 56px; height: 52px;
    background: transparent; border: none;
    color: #fff; font-size: 12px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 3px;
  }
  .na-footer .na-footer-btn svg { width: 22px; height: 22px; }
  .na-footer .na-info {
    color: #fff; text-align: center; flex: 1;
  }
  .na-footer .na-main-line { font-size: 18px; font-weight: 600; }
  .na-footer .na-sub-line { font-size: 13px; color: rgba(255,255,255,.75); margin-top: 2px; }
`

function renderIcon(name: 'exit' | 'map'): string {
  if (name === 'exit') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h10"/></svg>`
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.1-7-11a7 7 0 1 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>`
}

/** 默认转向图标（右转箭头 SVG） */
const TURN_ICON = `<svg class="na-arrow-icon" viewBox="0 0 24 24" fill="#2F7BFF"><path d="M13.5 4 20 9.5 13.5 15v-4.2c-3.6.4-6 2.4-6 6.7v2h-3v-2c0-6 4-9.3 9-9.8V4z"/></svg>`

export class NaviArrowCore {
  private container: HTMLElement
  private opts: Required<Pick<NaviArrowOptions, 'curtainHeight' | 'curtainWidth' | 'flowSpeed' | 'showChevrons' | 'chevronCount' | 'autoRender' | 'visible'>> & NaviArrowOptions
  private theme: NaviTheme

  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private curtainMesh?: THREE.Mesh
  private curtainMat?: THREE.ShaderMaterial
  private chevronGroup?: THREE.Group
  private routeGeo?: RouteGeometry

  private rootEl: HTMLElement
  private bannerEl?: HTMLElement
  private bannerTextWrap?: HTMLElement
  private footerEl?: HTMLElement
  private shadow: ShadowRoot | null = null
  private settingsEl?: HTMLElement

  private clock = new THREE.Clock()
  private rafId = 0
  private disposed = false
  private growStart = 0
  private growDuration = 600

  constructor(container: HTMLElement, options: NaviArrowOptions = {}) {
    this.container = container
    this.opts = mergeOptions({
      curtainHeight: 0.4,
      curtainWidth: 0.8,
      flowSpeed: 2.5,
      showChevrons: false,
      chevronCount: 3,
      autoRender: true,
      visible: true,
    }, options) as any
    this.theme = { ...DEFAULT_THEME, ...(options.theme ?? {}) }

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

    // Three.js
    const glHost = root.querySelector('.na-gl') as HTMLElement
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)
    glHost.appendChild(this.renderer.domElement)
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 500)

    this.buildUI()
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
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
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
    // 右上角「AR设置」按钮（绝对定位，与横幅同行右侧，横幅右侧渐隐露出来）
    const settings = document.createElement('button')
    settings.className = 'na-settings'
    settings.innerHTML = `<span class="na-ar-badge">AR</span><span>AR设置</span>`
    ui.appendChild(settings)
    this.settingsEl = settings
    ui.appendChild(this.bannerEl)
    this.bannerTextWrap = this.bannerEl.querySelector('.na-banner-text-wrap') as HTMLElement

    // 底部信息条
    this.footerEl = document.createElement('div')
    this.footerEl.className = 'na-footer'
    this.footerEl.style.display = 'none'
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
    if (this.opts.showChevrons) this.rebuildChevrons()
  }

  private rebuildCurtain() {
    if (!this.routeGeo) return
    if (this.curtainMesh) {
      this.scene.remove(this.curtainMesh)
      this.curtainMesh.geometry.dispose()
    }
    if (!this.curtainMat) this.curtainMat = createCurtainMaterial(this.theme, this.opts.flowSpeed)
    this.curtainMat.uniforms.uFlowSpeed.value = this.opts.flowSpeed
    this.curtainMat.uniforms.uNearOpacity.value = this.theme.nearOpacity
    this.curtainMat.uniforms.uFarOpacity.value = this.theme.farOpacity
    this.curtainMat.uniforms.uPrimary.value.set(this.theme.primary)
    this.curtainMat.uniforms.uHighlight.value.set(this.theme.highlight).lerp(new THREE.Color('#ffffff'), 0.35)

    const geo = buildCurtainGeometry(this.routeGeo, this.opts.curtainHeight, this.opts.curtainWidth)
    this.curtainMesh = new THREE.Mesh(geo, this.curtainMat)
    this.curtainMesh.frustumCulled = false
    this.scene.add(this.curtainMesh)
    this.growStart = this.clock.elapsedTime
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
    // 每个箭头独立材质，便于各自淡入淡出
    // V 形箭头：用 Shape 挤出成有厚度的立体箭头
    const s = new THREE.Shape()
    const w = 0.45, d = 0.5, t = 0.16 // 半宽、深度、笔画粗
    s.moveTo(-w, 0); s.lineTo(0, d); s.lineTo(w, 0)
    s.lineTo(w - t, 0); s.lineTo(0, d - t * 1.6); s.lineTo(-w + t, 0)
    s.closePath()
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, 0.03, 0)
    for (let i = 0; i < this.opts.chevronCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.theme.primary),
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const dist = 1.6 + i * 1.4
      const m = new THREE.Mesh(geo, mat)
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
    else {
      if (this.chevronGroup) {
        this.scene.remove(this.chevronGroup)
        this.chevronGroup.children.forEach((m: any) => m.geometry?.dispose?.())
        const mats = new Set<any>()
        this.chevronGroup.children.forEach((m: any) => mats.add(m.material))
        mats.forEach((m) => m.dispose())
        this.chevronGroup = undefined
      }
    }
  }

  /** 外部传入相机位姿（AR 引擎/设备方向）：{position, quaternion} */
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
      this.settingsEl!.style.display = banner.showSettings === false ? 'none' : 'flex'
      this.bannerEl!.classList.add('visible')
    }, 0)
  }

  /** 设置底部信息条 */
  setFooter(footer: FooterConfig | null) {
    if (!this.footerEl) return
    if (!footer || footer.enabled === false) {
      this.footerEl.style.display = 'none'
      return
    }
    this.footerEl.style.display = 'flex'
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
    if (this.curtainMat) {
      this.curtainMat.uniforms.uTime.value = t
      const grow = Math.min(1, (t - this.growStart) / (this.growDuration / 1000))
      // ease-out
      this.curtainMat.uniforms.uGrow.value = 1 - Math.pow(1 - grow, 3)
    }
    this.applyChevronFade(t)
    this.renderer.render(this.scene, this.camera)
  }

  /** V 形箭头淡入淡出（沿路线周期性淡出并重新出现） */
  private applyChevronFade(t: number) {
    if (!this.chevronGroup) return
    const period = 3
    const cycle = 0.85
    this.chevronGroup.children.forEach((m: any, i: number) => {
      const local = (t / period - i * (cycle / this.opts.chevronCount)) % cycle
      const phase = local < 0 ? local + cycle : local
      const a = phase < 0.15 ? phase / 0.15 : phase > 0.7 ? Math.max(0, 1 - (phase - 0.7) / 0.15) : 1
      const mat = m.material as THREE.MeshBasicMaterial
      mat.transparent = true
      mat.opacity = 0.75 * a
    })
  }

  /** 释放全部 WebGL 资源 */
  destroy() {
    this.disposed = true
    cancelAnimationFrame(this.rafId)
    window.removeEventListener('resize', this.onResize)
    this.curtainMesh?.geometry.dispose()
    this.curtainMat?.dispose()
    this.chevronGroup?.traverse((o: any) => {
      o.geometry?.dispose?.()
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => m.dispose?.())
      }
    })
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.rootEl?.remove()
    ;(this.shadow ?? this.container).innerHTML = ''
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** 框架无关入口：createNaviArrow(container, options) */
export function createNaviArrow(container: HTMLElement, options?: NaviArrowOptions): NaviArrowCore {
  return new NaviArrowCore(container, options)
}
