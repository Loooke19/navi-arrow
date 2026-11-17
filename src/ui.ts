/**
 * [INPUT]: depends on BannerConfig and FooterConfig from ./config
 * [OUTPUT]: provides NaviOverlayUI class for Shadow DOM styles, top navigation banner, AR settings button, and footer bar
 * [POS]: pure DOM/CSS presentation layer within src/, instantiated by NaviArrowCore above the WebGL canvas
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type { BannerConfig, FooterConfig } from './config'

const css = String.raw

export const NAVI_UI_STYLE = css`
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
  .na-ui button { pointer-events: auto; font-family: inherit; cursor: pointer; }

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
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
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
    background: linear-gradient(180deg, rgba(22, 28, 38, 0.56) 0%, rgba(22, 28, 38, 0.84) 100%);
    backdrop-filter: blur(10px) saturate(1.05);
    -webkit-backdrop-filter: blur(10px) saturate(1.05);
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

function renderFooterIcon(name: 'exit' | 'map'): string {
  if (name === 'exit') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 12.5 12 18 18"/><path d="M12.5 12H4"/><path d="M20 4v16"/></svg>`
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.7-6.5-10.3A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.7C18.5 15.3 12 21 12 21z"/><path d="M9.5 10.5 12 13l2.5-2.5"/></svg>`
}

const TURN_ICON = `<svg class="na-arrow-icon" viewBox="0 0 24 24" fill="#ffffff"><path d="M13.5 4 20 9.5 13.5 15v-4.2c-3.6.4-6 2.4-6 6.7v2h-3v-2c0-6 4-9.3 9-9.8V4z"/></svg>`

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export class NaviOverlayUI {
  readonly rootEl: HTMLElement
  readonly glHost: HTMLElement
  private readonly host: ShadowRoot | HTMLElement
  private readonly bannerEl: HTMLElement
  private readonly bannerTextWrap: HTMLElement
  private readonly settingsEl: HTMLElement
  private readonly footerEl: HTMLElement
  private disposed = false

  constructor(container: HTMLElement) {
    const shadow = (container as any).attachShadow?.({ mode: 'open' }) ?? null
    this.host = shadow ?? container

    const style = document.createElement('style')
    style.textContent = NAVI_UI_STYLE

    const root = document.createElement('div')
    root.className = 'na-root'
    root.innerHTML = `<div class="na-gl"></div><div class="na-ui"></div>`

    this.host.appendChild(style)
    this.host.appendChild(root)
    this.rootEl = root
    this.glHost = root.querySelector('.na-gl') as HTMLElement

    const ui = root.querySelector('.na-ui') as HTMLElement

    this.bannerEl = document.createElement('div')
    this.bannerEl.className = 'na-banner'
    this.bannerEl.innerHTML = `
      <div class="na-icon"></div>
      <div class="na-banner-text-wrap"><div class="na-banner-text"></div></div>
    `
    ui.appendChild(this.bannerEl)
    this.bannerTextWrap = this.bannerEl.querySelector('.na-banner-text-wrap') as HTMLElement

    this.settingsEl = document.createElement('button')
    this.settingsEl.className = 'na-settings'
    this.settingsEl.innerHTML = `<span class="na-ar-badge">AR</span><span>AR设置</span>`
    ui.appendChild(this.settingsEl)

    this.footerEl = document.createElement('div')
    this.footerEl.className = 'na-footer hidden'
    this.footerEl.innerHTML = `
      <button class="na-footer-btn" data-act="exit">${renderFooterIcon('exit')}<span>退出</span></button>
      <div class="na-info"><div class="na-main-line"></div><div class="na-sub-line"></div></div>
      <button class="na-footer-btn" data-act="map">${renderFooterIcon('map')}<span>地图</span></button>
    `
    ui.appendChild(this.footerEl)
  }

  setBanner(banner: BannerConfig | null) {
    if (!banner) {
      this.bannerEl.classList.remove('visible')
      return
    }
    setTimeout(() => {
      if (this.disposed) return
      const icon = this.bannerEl.querySelector('.na-icon') as HTMLElement
      this.bannerTextWrap.innerHTML = `
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
      this.settingsEl.classList.toggle('hidden', banner.showSettings === false)
      this.bannerEl.classList.add('visible')
    }, 0)
  }

  setFooter(footer: FooterConfig | null) {
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

  onFooterButton(handler: (act: 'exit' | 'map') => void) {
    this.footerEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-act]') as HTMLElement | null
      if (btn) handler(btn.dataset.act as 'exit' | 'map')
    })
  }

  onSettings(handler: () => void) {
    this.settingsEl.addEventListener('click', handler)
  }

  setBannerVisible(visible: boolean) {
    this.bannerEl.classList.toggle('visible', visible)
  }

  destroy() {
    this.disposed = true
    this.rootEl.remove()
    this.host.innerHTML = ''
  }
}
