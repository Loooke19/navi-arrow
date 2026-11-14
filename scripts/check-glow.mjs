// 光带验收：带内像素必须比原照片更亮，且路面局部对比至少保留 70%
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { mkdirSync } from 'node:fs'
import { evaluateGlow } from './glow-metrics.mjs'

const base = process.env.NAVI_URL ?? 'http://localhost:5173/?shot=1'
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(base)
await page.waitForTimeout(2800)
await page.evaluate(() => { window.__pauseRender = true })
await page.waitForTimeout(250)

const withRoute = PNG.sync.read(await page.screenshot())
await page.evaluate(() => {
  const canvas = document.querySelector('#navi')?.shadowRoot?.querySelector('canvas')
  if (canvas) canvas.style.visibility = 'hidden'
})
await page.waitForTimeout(200)
const photo = PNG.sync.read(await page.screenshot())
await browser.close()

if (withRoute.width !== photo.width || withRoute.height !== photo.height) {
  console.error('FAIL: 两次截图尺寸不一致')
  process.exit(1)
}

const w = withRoute.width
const h = withRoute.height
const mask = new Uint8Array(w * h)
let marked = 0
// 排除顶栏和底栏，只在路线会经过的路面区域里找「被光改过」的像素
const y0 = Math.floor(h * 0.42)
const y1 = Math.floor(h * 0.88)
for (let y = y0; y < y1; y++) {
  for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4
    const d = Math.abs(withRoute.data[o] - photo.data[o])
      + Math.abs(withRoute.data[o + 1] - photo.data[o + 1])
      + Math.abs(withRoute.data[o + 2] - photo.data[o + 2])
    if (d > 10) {
      mask[y * w + x] = 1
      marked++
    }
  }
}

// 槽底：每一行遮罩的中间 50%，不含两侧亮边。上次 +25 几乎全是边线。
const interior = new Uint8Array(w * h)
let interiorN = 0
for (let y = y0; y < y1; y++) {
  let minX = w
  let maxX = -1
  for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  const span = maxX - minX
  if (span < 10) continue
  const x0 = Math.round(minX + span * 0.28)
  const x1 = Math.round(maxX - span * 0.28)
  for (let x = x0; x <= x1; x++) {
    if (!mask[y * w + x]) continue
    interior[y * w + x] = 1
    interiorN++
  }
}
const floor = evaluateGlow(withRoute.data, photo.data, w, h, interior)
const result = evaluateGlow(withRoute.data, photo.data, w, h, mask)
const out = {
  ...result,
  lumaRender: +result.lumaRender.toFixed(2),
  lumaPhoto: +result.lumaPhoto.toFixed(2),
  lumaDelta: +result.lumaDelta.toFixed(2),
  contrastRender: +result.contrastRender.toFixed(3),
  contrastPhoto: +result.contrastPhoto.toFixed(3),
  contrastRatio: +result.contrastRatio.toFixed(3),
  blueRender: +result.blueRender.toFixed(2),
  bluePhoto: +result.bluePhoto.toFixed(2),
  blueDelta: +result.blueDelta.toFixed(2),
  marked,
  floorSamples: floor.samples,
  floorLumaDelta: +floor.lumaDelta.toFixed(2),
  floorBlueDelta: +floor.blueDelta.toFixed(2),
  floorContrast: +floor.contrastRatio.toFixed(3),
}
console.log(JSON.stringify(out))

mkdirSync('docs/compare', { recursive: true })
// 槽底中心现在应当几乎透明，亮的是两侧。中心是否透、边缘是否够亮由 check-gradient.mjs 验收。
if (!(result.lumaOK && result.contrastOK && result.blueOK && marked > 400)) {
  console.error('FAIL: 光带压暗了照片、盖住了路面、几乎不可见，或不够蓝')
  process.exitCode = 1
}
