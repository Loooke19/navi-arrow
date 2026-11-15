// 横向渐变：中心仍有浅色，两侧亮但不超过大约 60–90，左右接近
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
  const brRow = new Float32Array(d.length)
  for (let x = 0; x < d.length; x++) {
    const o = (y * render.width + x) * 4
    brRow[x] = render.data[o + 2] - render.data[o]
  }
  const hot = []
  const hotBr = []
  for (let x = 0; x < d.length; x++) {
    if (d[x] > 18) hot.push(x)
    if (brRow[x] > 40) hotBr.push(x)
  }
  const useBr = hot.length < 8 && hotBr.length >= 8
  const spanHot = useBr ? hotBr : hot
  if (spanHot.length < 8) return { ok: false, y, reason: '这一行几乎没有光带', hot: hot.length, hotBr: hotBr.length }
  const left = spanHot[0]
  const right = spanHot[spanHot.length - 1]
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
  const brAt = (x0, x1) => {
    let s = 0
    let n = 0
    const a = Math.max(0, Math.round(x0))
    const b = Math.min(render.width - 1, Math.round(x1))
    for (let x = a; x <= b; x++) {
      const o = (y * render.width + x) * 4
      s += render.data[o + 2] - render.data[o]
      n++
    }
    return n ? s / n : 0
  }
  const center = Math.abs(mean(mid - 4, mid + 4))
  let leftPeak = left
  let rightPeak = right
  let edgeL = -1
  let edgeR = -1
  const edgeW = Math.max(8, Math.round(span * 0.22))
  const signal = useBr ? brRow : d
  for (let x = left; x <= left + edgeW; x++) if (signal[x] > edgeL) { edgeL = signal[x]; leftPeak = x }
  for (let x = right - edgeW; x <= right; x++) if (signal[x] > edgeR) { edgeR = signal[x]; rightPeak = x }
  const edgeHi = Math.max(edgeL, edgeR)
  const edgeLo = Math.min(edgeL, edgeR)
  const brL = brAt(leftPeak - 1, leftPeak + 1)
  const brR = brAt(rightPeak - 1, rightPeak + 1)
  const brC = brAt(mid - 4, mid + 4)
  const brHi = Math.max(brL, brR)
  const brLo = Math.min(brL, brR)
  const edgeSym = edgeHi > 1e-3 ? edgeLo / edgeHi : 1
  const brSym = brHi > 1e-3 ? brLo / brHi : 1
  const lumaOK = center > 6 && center < 36
    && edgeLo > 35 && edgeHi < 110
    && edgeLo > edgeHi * 0.55
    && leftPeak < mid - 8 && rightPeak > mid + 8
    && edgeSym >= 0.9
  const cyanOK = brL > 70 && brR > 70 && brC < 25 && brSym >= 0.9
  return {
    ok: useBr ? cyanOK : lumaOK, y, left, right, span, center: +center.toFixed(2),
    edgeL: +edgeL.toFixed(2), edgeR: +edgeR.toFixed(2), leftPeak, rightPeak,
    brL: +brL.toFixed(1), brR: +brR.toFixed(1), brC: +brC.toFixed(1),
    edgeSym: +edgeSym.toFixed(3), brSym: +brSym.toFixed(3),
    lumaOK,
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
  const brightOK = name !== 'hospital' || (result.brL > 70 && result.brR > 70 && result.brC < 25 && result.brSym >= 0.9)
  console.log(JSON.stringify({ name, ...result, brightOK }))
  if (!result.ok || !brightOK) failed = true
}
await browser.close()
if (failed) {
  console.error('FAIL: 光带中心不够透，或两侧边缘不够亮')
  process.exitCode = 1
}
