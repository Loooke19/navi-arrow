// 底边空隙检查：截图底部若干行的亮度，比较「有路线」和「纯照片」，
// 只要底边这一行路线带来了可见提亮，说明带子确实顶到了屏幕底边。
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b }

/**
 * 底栏正上方那一行：统计「加光」像素。
 * 街景是暗底，用亮度提升；医院是白地板，青色光主要抬高蓝/青通道，
 * 所以 blue - red 的变化也算命中。
 */
function bottomRowDelta(render, photo, frac = 0.995) {
  const h = render.height
  const w = render.width
  const y = Math.min(h - 1, Math.max(0, Math.round(h * frac)))
  let maxD = 0
  let sumD = 0
  let hotW = 0
  let maxTint = 0
  for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4
    const d = luma(render.data[o], render.data[o + 1], render.data[o + 2])
      - luma(photo.data[o], photo.data[o + 1], photo.data[o + 2])
    const tint = (render.data[o + 2] - render.data[o]) - (photo.data[o + 2] - photo.data[o])
    if (d > maxD) maxD = d
    if (tint > maxTint) maxTint = tint
    if (d > 6 || tint > 10) { hotW++; sumD += Math.max(d, 0) }
  }
  return { y, maxD: +maxD.toFixed(1), maxTint: +maxTint.toFixed(1), meanHotD: hotW ? +(sumD / hotW).toFixed(1) : 0, hotPx: hotW, w }
}

async function shoot(browser, url, viewport) {
  const page = await browser.newPage({ viewport })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  await page.evaluate(() => { window.__navi?.setChevrons(false); window.__pauseRender = false })
  await page.waitForTimeout(400)
  await page.evaluate(() => { window.__pauseRender = true })
  await page.waitForTimeout(120)
  const render = PNG.sync.read(await page.screenshot())
  await page.evaluate(() => {
    const c = document.querySelector('#navi')?.shadowRoot?.querySelector('canvas')
    if (c) c.style.visibility = 'hidden'
  })
  await page.waitForTimeout(120)
  const photo = PNG.sync.read(await page.screenshot())
  await page.close()
  return { render, photo }
}

const cases = [
  ['street-straight 390x844', 'http://localhost:5173/?shot=1&phone=0', { width: 390, height: 844 }],
  ['street-turn 390x844', 'http://localhost:5173/?shot=1&phone=0&t=4&bend=1', { width: 390, height: 844 }],
  ['street-straight 430x932', 'http://localhost:5173/?shot=1&phone=0', { width: 430, height: 932 }],
  ['hospital-straight 390x844', 'http://localhost:5173/?shot=1&phone=0&scene=hospital', { width: 390, height: 844 }],
  ['hospital-turn 430x932', 'http://localhost:5173/?shot=1&phone=0&scene=hospital&bend=1', { width: 430, height: 932 }],
  ['desktop 1280x800', 'http://localhost:5173/?shot=1&phone=0', { width: 1280, height: 800 }],
]

/** 底栏高度 88px（见 core.ts 的 .na-footer），测得的是「底栏正上方最后一行」 */
function barTopFrac(viewportH) {
  return 1 - 90 / viewportH
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] })
let fail = 0
for (const [name, url, vp] of cases) {
  const { render, photo } = await shoot(browser, url, vp)
  const justAboveBar = bottomRowDelta(render, photo, barTopFrac(vp.height))
  // 再往上一点做对照，确认不是只有一行巧合
  const mid = bottomRowDelta(render, photo, barTopFrac(vp.height) - 0.04)
  const ok = justAboveBar.maxD > 6 && justAboveBar.hotPx > 10
  if (!ok) fail++
  console.log(JSON.stringify({ name, ok, justAboveBar, mid }))
}
await browser.close()
if (fail) { console.error(`FAIL: ${fail} case(s) show a gap above the bottom bar`); process.exitCode = 1 }
else console.log('OK: band reaches the bottom edge in all cases')
