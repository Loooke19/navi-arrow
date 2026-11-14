// REDO7 截图：直行、转弯、相机占位，以及和 DJI 参考的并排对比
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

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
  const counts = new Int32Array(h)
  let bestN = 0
  for (let y = yLo; y <= yHi; y++) {
    let n = 0
    for (let x = 0; x < w; x++) if (mask[y * w + x]) n++
    counts[y] = n
    if (n > bestN) bestN = n
  }
  // 近端偶发一条很窄的边角，不拿它当整条光带的宽度
  const need = Math.max(8, Math.round(bestN * 0.45))
  let chosen = -1
  for (let y = yHi; y >= yLo; y--) {
    if (counts[y] >= need) { chosen = y; break }
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
  { url: 'http://localhost:5173/?shot=1&cam=1', path: 'docs/compare/demo-05-camera-live.png', name: 'cam', wait: 2800 },
  { url: 'http://localhost:5173/?shot=1&scene=hospital', path: 'docs/compare/hospital-01-straight.png', name: 'hospital-straight', wait: 2200 },
  { url: 'http://localhost:5173/?shot=1&scene=hospital&bend=1', path: 'docs/compare/hospital-02-turn.png', name: 'hospital-turn', wait: 2200 },
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

// 近端整宽光带 vs DJI 楼群光带，同一显示比例，并画 75% 高度的横向强度
execFileSync('ffmpeg', ['-y', '-i', 'reference/dji-frames/f_10.jpg', '/tmp/f10-grad.png'], { stdio: 'ignore' })
const ours = PNG.sync.read(readFileSync('docs/compare/hospital-01-straight.png'))
const dji = PNG.sync.read(readFileSync('/tmp/f10-grad.png'))
function cropPng(src, x0, y0, cw, ch) {
  const out = new PNG({ width: cw, height: ch })
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const sx = Math.min(src.width - 1, x0 + x)
    const sy = Math.min(src.height - 1, y0 + y)
    const si = (sy * src.width + sx) << 2
    const di = (y * cw + x) << 2
    out.data[di] = src.data[si]
    out.data[di + 1] = src.data[si + 1]
    out.data[di + 2] = src.data[si + 2]
    out.data[di + 3] = 255
  }
  return out
}
const ourCrop = cropPng(ours, 55, 560, 280, 210)
const djiCrop = cropPng(dji, 740, 500, 460, 210)
writeFileSync('/tmp/grad-ours.png', PNG.sync.write(ourCrop))
writeFileSync('/tmp/grad-dji.png', PNG.sync.write(djiCrop))
function channelAt(png, x, y) {
  const i = (y * png.width + x) * 4
  return png.data[i + 2] - png.data[i]
}
const yOurs = Math.round(ours.height * 0.75)
const oursRow = []
for (let x = 0; x < ours.width; x++) oursRow.push(channelAt(ours, x, yOurs))
const side = oursRow.slice(10, 80).slice().sort((a, b) => a - b)
const bg = side[Math.floor(side.length / 2)] || 0
const oursDelta = oursRow.map((v) => Math.max(0, v - bg))
let oL = oursDelta.findIndex((v) => v > 22)
let oR = ours.width - 1
for (let x = ours.width - 1; x >= 0; x--) if (oursDelta[x] > 22) { oR = x; break }
const ourCurve = []
for (let i = 0; i <= 40; i++) {
  const x = Math.round(oL + (oR - oL) * (i / 40))
  ourCurve.push(oursDelta[Math.min(ours.width - 1, Math.max(0, x))] || 0)
}
const yDji = 620
const djiRow = []
for (let x = 0; x < dji.width; x++) {
  const i = (yDji * dji.width + x) * 4
  djiRow.push(dji.data[i + 1] - dji.data[i])
}
let dL = 0
let dR = djiRow.length - 1
let best = 0
for (let x = 700; x < 1200; x++) if (djiRow[x] > best) best = djiRow[x]
for (let x = 700; x < 1200; x++) if (djiRow[x] > best * 0.45) { dL = x; break }
for (let x = 1200; x > 700; x--) if (djiRow[x] > best * 0.45) { dR = x; break }
const djiCurve = []
for (let i = 0; i <= 40; i++) {
  const x = Math.round(dL + (dR - dL) * (i / 40))
  djiCurve.push(Math.max(0, djiRow[x] || 0))
}
const norm = (arr) => {
  const m = Math.max(...arr, 1)
  return arr.map((v) => v / m)
}
const oN = norm(ourCurve)
const dN = norm(djiCurve)
const poly = (arr, color) => {
  const pts = arr.map((v, i) => `${20 + (i / 40) * 900},${200 - v * 160}`).join(' ')
  return `<polyline fill="none" stroke="${color}" stroke-width="3" points="${pts}"/>`
}
const grad = `<!DOCTYPE html><html><head><meta charset="utf8"><style>
  body{margin:0;background:#12141a;font-family:sans-serif;color:#e8eef8}
  .row{display:flex;gap:18px;padding:16px 16px 0;width:980px;align-items:flex-end}
  .cell{flex:1}
  .cell img{width:100%;height:250px;object-fit:contain;background:#000;display:block}
  .t{font-size:15px;text-align:center;padding:8px 4px}
  svg{display:block;margin:8px 16px 16px;background:#0c0e12;border-radius:8px}
  .key{font-size:13px}
</style></head><body>
  <div class="row">
    <div class="cell"><img src="file:///tmp/grad-ours.png"><div class="t">医院近端 · 整宽光带</div></div>
    <div class="cell"><img src="file:///tmp/grad-dji.png"><div class="t">DJI · 楼群上的光带</div></div>
  </div>
  <svg width="948" height="230" viewBox="0 0 948 230">
    <text x="20" y="22" fill="#9ab" class="key">75% 高度横向强度（各自归一化）</text>
    ${poly(oN, '#3ecbff')}
    ${poly(dN, '#3dcc6a')}
    <text x="20" y="218" fill="#3ecbff"> ours</text>
    <text x="90" y="218" fill="#3dcc6a">DJI</text>
    <text x="430" y="218" fill="#9ab">中心</text>
    <text x="860" y="218" fill="#9ab">右缘</text>
  </svg>
</body></html>`
writeFileSync('docs/compare/_gradient.html', grad)
await page.setViewportSize({ width: 1020, height: 560 })
await page.goto(`file://${process.cwd()}/docs/compare/_gradient.html`)
await page.waitForTimeout(500)
await page.screenshot({ path: 'docs/compare/gradient-vs-dji.png' })
console.log('gradient-vs-dji saved', { oL, oR, dL, dR })
await b2.close()
