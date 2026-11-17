/**
 * [INPUT]: depends on NAVI_UI_STYLE from ../src/ui; depends on chromium from playwright
 * [OUTPUT]: verifies the 390px-wide banner fully displays「前方20米 右转 进入 门诊二区」without clipping the road name
 * [POS]: UI layout regression test in tests/, guards the Baidu-style banner against overflow on narrow viewports
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { describe, it, expect } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { NAVI_UI_STYLE } from '../src/ui'

/** 本机可能只装了系统 Chrome 或旧版 Playwright 内核，依次回退，避免测试因环境缺失而失败 */
async function launchBrowser(): Promise<Browser> {
  const attempts: Array<() => Promise<Browser>> = [
    () => chromium.launch(),
    () => chromium.launch({ channel: 'chrome' }),
  ]
  let lastErr: unknown
  for (const attempt of attempts) {
    try {
      return await attempt()
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

describe('banner fit', () => {
  it('390px 下「门诊二区」完整可见', async () => {
    const browser = await launchBrowser()
    const page = await browser.newPage({ viewport: { width: 390, height: 200 } })
    await page.setContent(`<!DOCTYPE html><html><head><style>
      html,body{margin:0;width:390px}
      ${NAVI_UI_STYLE}
      .na-root{position:relative;width:390px;height:160px}
    </style></head><body><div class="na-root"><div class="na-banner visible">
      <div class="na-icon"><span>→</span></div>
      <div class="na-banner-text-wrap"><div class="na-banner-text">
        <span class="na-dist">前方20米</span>
        <span class="na-action">右转 进入</span>
        <span class="na-road">门诊二区</span>
      </div></div>
    </div></div></body></html>`)
    const box = await page.evaluate(() => {
      const banner = document.querySelector('.na-banner') as HTMLElement
      const text = document.querySelector('.na-banner-text') as HTMLElement
      const road = document.querySelector('.na-road') as HTMLElement
      const br = banner.getBoundingClientRect()
      const rr = road.getBoundingClientRect()
      return {
        textOverflow: text.scrollWidth - text.clientWidth,
        roadRight: rr.right,
        bannerRight: br.right,
        road: road.textContent,
      }
    })
    await browser.close()
    expect(box.road).toBe('门诊二区')
    expect(box.textOverflow).toBeLessThanOrEqual(1)
    expect(box.roadRight).toBeLessThanOrEqual(box.bannerRight + 0.5)
  }, 15000)
})
