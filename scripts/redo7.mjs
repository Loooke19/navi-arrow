// REDO7 截图：直行、转弯、相机占位，以及和 DJI 参考的并排对比
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('docs/compare', { recursive: true })

const glArgs = ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist']

async function shoot(browser, shots) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  for (const s of shots) {
    await page.goto(s.url)
    await page.waitForTimeout(s.wait ?? 2200)
    await page.evaluate(() => { window.__pauseRender = true })
    await page.waitForTimeout(280)
    await page.screenshot({ path: s.path })
    console.log('shot', s.path)
  }
  await page.close()
}

const browser = await chromium.launch({ args: glArgs })
await shoot(browser, [
  { url: 'http://localhost:5173/?shot=1', path: 'docs/compare/demo-01-straight.png' },
  { url: 'http://localhost:5173/?shot=1&t=4', path: 'docs/compare/demo-02-turn-banner.png', wait: 1800 },
])
await browser.close()

const cam = await chromium.launch({
  args: [...glArgs, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
await shoot(cam, [
  { url: 'http://localhost:5173/?shot=1&cam=1', path: 'docs/compare/demo-05-camera-live.png', wait: 2800 },
])
await cam.close()

const cells = [
  ['docs/compare/demo-01-straight.png', '直行 · 光片'],
  ['reference/dji-frames/f_10.jpg', 'DJI f_10'],
  ['docs/compare/demo-02-turn-banner.png', '转弯 · 侧幕'],
  ['reference/dji-frames/f_25.jpg', 'DJI f_25'],
  ['docs/compare/demo-05-camera-live.png', '相机实景（假流）'],
  ['reference/dji-frames/f_31.jpg', 'DJI f_31'],
].map(([p, t]) => `
  <div class="cell">
    <img src="file://${process.cwd()}/${p}" />
    <div class="t">${t}</div>
  </div>`).join('')

const html = `<!DOCTYPE html><html><head><meta charset="utf8"><style>
  body{margin:0;background:#0c0e12;font-family:sans-serif}
  .row{display:flex;flex-wrap:wrap;gap:12px;padding:12px;width:900px}
  .cell{width:280px}
  .cell img{width:280px;height:606px;object-fit:cover;display:block;background:#000}
  .t{color:#e8eef8;font-size:14px;padding:6px 2px 8px;text-align:center}
</style></head><body><div class="row">${cells}</div></body></html>`
writeFileSync('docs/compare/_redo7.html', html)

const b2 = await chromium.launch()
const page = await b2.newPage({ viewport: { width: 920, height: 1400 } })
await page.goto(`file://${process.cwd()}/docs/compare/_redo7.html`)
await page.waitForTimeout(700)
await page.screenshot({ path: 'docs/compare/redo7-vs-dji.png', fullPage: true })
console.log('redo7-vs-dji saved')
await b2.close()
