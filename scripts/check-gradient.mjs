// 横向透明度：画面约 75% 高度处，光带中心相对原图亮度差 < 12，两侧边缘 > 35
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function rowDelta(render, photo, y) {
  const w = render.width
  const d = new Float32Array(w)
  for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4
    d[x] = luma(render.data[o], render.data[o + 1], render.data[o + 2])
      - luma(photo.data[o], photo.data[o + 1], photo.data[o + 2])
  }
  return d
}

function measure(render, photo) {
  const y = Math.round(render.height * 0.75)
  const d = rowDelta(render, photo, y)
  const hot = []
  for (let x = 0; x < d.length; x++) if (d[x] > 18) hot.push(x)
  if (hot.length < 8) return { ok: false, y, reason: '这一行几乎没有光带', hot: hot.length }
  const left = hot[0]
  const right = hot[hot.length - 1]
  const span = right - left
  const mid = (left + right) / 2
  const mean = (x0, x1) => {
    let s = 0
    let n = 0
    const a = Math.max(0, Math.round(x0))
    const b = Math.min(d.length - 1, Math.round(x1))
    for (let x = a; x <= b; x++) { s += d[x]; n++ }
    return n ? s / n : 0
  }
  const center = Math.abs(mean(mid - 4, mid + 4))
  let leftPeak = left
  let rightPeak = right
  let edgeL = -1
  let edgeR = -1
  const edgeW = Math.max(8, Math.round(span * 0.22))
  for (let x = left; x <= left + edgeW; x++) if (d[x] > edgeL) { edgeL = d[x]; leftPeak = x }
  for (let x = right - edgeW; x <= right; x++) if (d[x] > edgeR) { edgeR = d[x]; rightPeak = x }
  const ok = center < 12 && edgeL > 35 && edgeR > 35 && leftPeak < mid - 8 && rightPeak > mid + 8
  return {
    ok, y, left, right, span, center: +center.toFixed(2),
    edgeL: +edgeL.toFixed(2), edgeR: +edgeR.toFixed(2), leftPeak, rightPeak,
  }
}

async function shoot(browser, url) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(url)
  await page.waitForTimeout(1600)
  await page.evaluate(() => {
    window.__navi?.setChevrons(false)
    window.__pauseRender = false
  })
  await page.waitForTimeout(400)
  await page.evaluate(() => { window.__pauseRender = true })
  await page.waitForTimeout(120)
  const withRoute = PNG.sync.read(await page.screenshot())
  await page.evaluate(() => {
    const canvas = document.querySelector('#navi')?.shadowRoot?.querySelector('canvas')
    if (canvas) canvas.style.visibility = 'hidden'
  })
  await page.waitForTimeout(150)
  const photo = PNG.sync.read(await page.screenshot())
  await page.close()
  return measure(withRoute, photo)
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
})
const scenes = [
  ['street', 'http://localhost:5173/?shot=1'],
  ['hospital', 'http://localhost:5173/?shot=1&scene=hospital'],
]
let failed = false
for (const [name, url] of scenes) {
  const result = await shoot(browser, url)
  console.log(JSON.stringify({ name, ...result }))
  if (!result.ok) failed = true
}
await browser.close()
if (failed) {
  console.error('FAIL: 光带中心不够透，或两侧边缘不够亮')
  process.exitCode = 1
}
