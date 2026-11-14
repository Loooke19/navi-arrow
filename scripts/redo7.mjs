// REDO7 截图：直行、转弯、相机占位，以及和 DJI 参考的并排对比
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('docs/compare', { recursive: true })

const glArgs = ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist']

function channelMask(routePng, photoPng) {
  const w = routePng.width
  const h = routePng.height
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const dr = routePng.data[o] - photoPng.data[o]
    const dg = routePng.data[o + 1] - photoPng.data[o + 1]
    const db = routePng.data[o + 2] - photoPng.data[o + 2]
    if (dr + dg + db > 18 && db > dr + 4) mask[i] = 1
  }
  return mask
}

/** 底栏上方最靠下的一行：通道横向跨度应占画面宽度的 40%–60%，且不贴左右边。 */
function bottomSpan(mask, w, h) {
  const yLo = Math.floor(h * 0.78)
  const yHi = Math.floor(h * 0.90)
  let chosen = -1
  for (let y = yHi; y >= yLo; y--) {
    let n = 0
    for (let x = 0; x < w; x++) if (mask[y * w + x]) n++
    if (n >= 8) { chosen = y; break }
  }
  if (chosen < 0) return { ok: false, reason: '底部没有通道像素' }
  let minX = w
  let maxX = 0
  for (let x = 0; x < w; x++) if (mask[chosen * w + x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x) }
  const span = (maxX - minX + 1) / w
  const ok = span >= 0.40 && span <= 0.60 && minX > 6 && maxX < w - 7
  return { ok, y: chosen, span: +span.toFixed(3), minX, maxX }
}

/** y 在 0.64–0.72 内、x > 0.72 是否有通道像素（转弯才会有）。 */
function hasFarRight(mask, w, h) {
  const y0 = Math.floor(h * 0.64)
  const y1 = Math.floor(h * 0.72)
  const x0 = Math.floor(w * 0.72)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < w; x++) if (mask[y * w + x]) return true
  }
  return false
}

async function shoot(browser, shots) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const masks = []
  for (const s of shots) {
    await page.goto(s.url)
    await page.waitForTimeout(s.wait ?? 2200)
    await page.evaluate(() => { window.__pauseRender = true })
    await page.waitForTimeout(280)
    const routePng = PNG.sync.read(await page.screenshot({ path: s.path }))
    await page.evaluate(() => {
      const canvas = document.querySelector('#navi')?.shadowRoot?.querySelector('canvas')
      if (canvas) canvas.style.visibility = 'hidden'
    })
    await page.waitForTimeout(150)
    const photoPng = PNG.sync.read(await page.screenshot())
    masks.push({ name: s.name, mask: channelMask(routePng, photoPng), w: routePng.width, h: routePng.height })
    console.log('shot', s.path)
  }
  await page.close()
  return masks
}

const browser = await chromium.launch({ args: glArgs })
const masks = await shoot(browser, [
  { url: 'http://localhost:5173/?shot=1', path: 'docs/compare/demo-01-straight.png', name: 'straight' },
  { url: 'http://localhost:5173/?shot=1&t=4&bend=1', path: 'docs/compare/demo-02-turn-banner.png', name: 'turn', wait: 1800 },
])
await browser.close()

let layoutOk = true
for (const m of masks) {
  const span = bottomSpan(m.mask, m.w, m.h)
  const right = hasFarRight(m.mask, m.w, m.h)
  const rightOk = m.name === 'turn' ? right : !right
  console.log(JSON.stringify({ name: m.name, ...span, farRight: right, rightOk }))
  if (!span.ok || !rightOk) layoutOk = false
}
if (!layoutOk) {
  console.error('FAIL: 通道宽度或转弯位置不符合画面约束')
  process.exitCode = 1
}

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
