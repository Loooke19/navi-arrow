/**
 * [INPUT]: depends on NaviArrowCore and createNaviArrow from ./core; types from ./config
 * [OUTPUT]: provides NaviArrowElement custom element class and defineNaviArrow registration helper
 * [POS]: Web Component adapter within src/, bridging HTML attributes to NaviArrowCore imperative methods
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { NaviArrowCore, createNaviArrow } from './core'
import type { NaviArrowOptions, BannerConfig, FooterConfig } from './config'

export class NaviArrowElement extends HTMLElement {
  private core?: NaviArrowCore

  static get observedAttributes() {
    return ['banner-distance', 'banner-action', 'banner-road', 'footer-distance', 'footer-duration', 'footer-arrival', 'hidden']
  }

  connectedCallback() {
    if (this.core) return
    const routeAttr = this.getAttribute('route')
    let route: NaviArrowOptions['route']
    if (routeAttr) {
      try { route = JSON.parse(routeAttr) } catch { route = undefined }
    }
    this.core = createNaviArrow(this, {
      route,
      curtainHeight: num(this.getAttribute('curtain-height'), 0.42),
      curtainWidth: num(this.getAttribute('curtain-width'), 1.25),
      showChevrons: this.getAttribute('chevrons') === 'true',
      banner: {
        distance: this.getAttribute('banner-distance') ?? undefined,
        action: this.getAttribute('banner-action') ?? undefined,
        road: this.getAttribute('banner-road') ?? undefined,
      },
      footer: {
        enabled: this.getAttribute('footer') !== 'false',
        distance: this.getAttribute('footer-distance') ?? undefined,
        duration: this.getAttribute('footer-duration') ?? undefined,
        arrival: this.getAttribute('footer-arrival') ?? undefined,
      },
    })
  }

  attributeChangedCallback(name: string, _old: string | null, val: string | null) {
    if (!this.core) return
    const banner = () => this.core!.setBanner({
      distance: this.getAttribute('banner-distance') ?? undefined,
      action: this.getAttribute('banner-action') ?? undefined,
      road: this.getAttribute('banner-road') ?? undefined,
    })
    if (name.startsWith('banner-')) banner()
    if (name.startsWith('footer-')) this.core.setFooter({
      enabled: this.getAttribute('footer') !== 'false',
      distance: this.getAttribute('footer-distance') ?? undefined,
      duration: this.getAttribute('footer-duration') ?? undefined,
      arrival: this.getAttribute('footer-arrival') ?? undefined,
    })
    if (name === 'hidden') val === null ? this.core.show() : this.core.hide()
  }

  /** 编程式 API 透传 */
  setBanner(b: BannerConfig | null) { this.core?.setBanner(b) }
  setFooter(f: FooterConfig | null) { this.core?.setFooter(f) }
  setRoute(r: NonNullable<NaviArrowOptions['route']>) { this.core?.setRoute(r) }
  setCameraPose(...args: Parameters<NaviArrowCore['setCameraPose']>) { this.core?.setCameraPose(...args) }
  onFooterButton(h: Parameters<NaviArrowCore['onFooterButton']>[0]) { this.core?.onFooterButton(h) }
  show() { this.core?.show() }
  hide() { this.core?.hide() }
  get coreInstance() { return this.core }

  disconnectedCallback() {
    this.core?.destroy()
    this.core = undefined
  }
}

export function defineNaviArrow(tag = 'navi-arrow') {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, NaviArrowElement)
  }
}

function num(v: string | null, def: number): number {
  const n = v ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : def
}
