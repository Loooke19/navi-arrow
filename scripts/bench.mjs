// REDO5 性能基准：390x844 @ DPR2，测 3 秒平均 fps
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:5173/?shot=1')
await page.waitForTimeout(3000)
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0
  const t0 = performance.now()
  const loop = () => {
    n++
    if (performance.now() - t0 < 3000) requestAnimationFrame(loop)
    else res(Math.round((n / (performance.now() - t0)) * 1000))
  }
  requestAnimationFrame(loop)
}))
const info = await page.evaluate(() => {
  const c = document.querySelector('#navi')?.shadowRoot?.querySelector('canvas')
  return { cw: c?.width, ch: c?.height, dpr: window.devicePixelRatio }
})
console.log(JSON.stringify({ fps, ...info }))
await browser.close()
