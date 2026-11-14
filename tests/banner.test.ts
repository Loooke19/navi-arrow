/**
 * 390px 宽时横幅必须放下「前方20米 右转 进入 门诊二区」，不能把路名裁掉。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

function bannerCss(): string {
  const src = readFileSync(new URL('../src/core.ts', import.meta.url), 'utf8')
  const start = src.indexOf('/* ===== 顶部横幅')
  const end = src.indexOf('/* 右上角 AR 设置')
  return src.slice(start, end).replace(':host, .na-root', '.na-root')
}

describe('banner fit', () => {
  it('390px 下「门诊二区」完整可见', async () => {
    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 390, height: 200 } })
    await page.setContent(`<!DOCTYPE html><html><head><style>
      html,body{margin:0;width:390px}
      ${bannerCss()}
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
  })
})
