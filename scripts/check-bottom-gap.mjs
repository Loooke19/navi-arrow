/**
 * 底边空隙检查（r2，按 review 要求加强）：
 * 对每个场景/路线/视口，检查两处都必须有光带像素：
 *   (a) 底栏正上方 5px（y = barTop - 5）
 *   (b) 隐藏底栏后真正的最后一行（y = H-1）
 * 判定「有光带像素」：该行在车道列范围内存在明显的提亮或青蓝偏色。
 *
 * 覆盖：hospital straight / hospital turn / street straight / street turn / camera mode
 * 视口：390x844、430x932
 */
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b }

/** 在指定行里统计「加光」像素：亮度提升 或 青蓝偏色提升 */
function rowStats(render, photo, y) {
  const w = render.width
  let maxD = 0
  let maxTint = 0
  let hotPx = 0
  let first = -1
  let last = -1
  for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4
    const d = luma(render.data[o], render.data[o + 1], render.data[o + 2])
      - luma(photo.data[o], photo.data[o + 1], photo.data[o + 2])
    const tint = (render.data[o + 2] - render.data[o]) - (photo.data[o + 2] - photo.data[o])
    if (d > maxD) maxD = d
    if (tint > maxTint) maxTint = tint
    if (d > 6 || tint > 10) {
      hotPx++
      if (first < 0) first = x
      last = x
    }
  }
  return { y, maxD: +maxD.toFixed(1), maxTint: +maxTint.toFixed(1), hotPx, first, last }
}

/**
 * 拍摄一页：返回
 *  - render: 有路线（底栏可见）
 *  - photo : 只留背景照片（canvas 隐掉，底栏可见）
 *  - barTop: 底栏顶部 y
 *  - renderNoBar / photoNoBar: 底栏隐藏后的两张图（用于量真正的最后一行）
 */
async function shoot(browser, url, viewport, opts = {}) {
  const page = await browser.newPage({ viewport })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  await page.evaluate(() => { window.__navi?.setChevrons(false); window.__pauseRender = false })
  await page.waitForTimeout(500)
  await page.evaluate(() => { window.__pauseRender = true })
  await page.waitForTimeout(150)
  const render = PNG.sync.read(await page.screenshot())

  const barTop = await page.evaluate(() => {
    const f = document.querySelector('#navi')?.shadowRoot?.querySelector('.na-footer')
    if (!f) return null
    const r = f.getBoundingClientRect()
    return Math.round(r.top)
  })

  // 隐藏底栏，拍「无底栏」两张图
  const renderNoBar = PNG.sync.read(await (async () => {
    await page.evaluate(() => {
      const f = document.querySelector('#navi')?.shadowRoot?.querySelector('.na-footer')
      if (f) f.style.visibility = 'hidden'
    })
    await page.waitForTimeout(150)
    return page.screenshot()
  })())

  // 隐掉 canvas 只留照片
  const photo = PNG.sync.read(await (async () => {
    await page.evaluate(() => {
      const c = document.querySelector('#navi')?.shadowRoot?.querySelector('canvas')
      if (c) c.style.visibility = 'hidden'
    })
    await page.waitForTimeout(150)
    return page.screenshot()
  })())
  const photoNoBar = photo // 底栏已隐藏且 canvas 已隐藏，同一张即可

  await page.close()
  return { render, renderNoBar, photo, photoNoBar, barTop }
}

const scenes = [
  ['hospital straight', 'scene=hospital'],
  ['hospital turn', 'scene=hospital&bend=1'],
  ['street straight', ''],
  ['street turn', '&bend=1&t=4'],
  ['camera mode', null], // 单独用假摄像头启动参数
]

const viewports = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]

const glArgs = ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist']
const browser = await chromium.launch({ args: glArgs })
const camBrowser = await chromium.launch({
  args: [...glArgs, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})

let fail = 0
const rows = []
for (const [name, query] of scenes) {
  for (const vp of viewports) {
    const b = query === null ? camBrowser : browser
    const url = query === null
      ? 'http://localhost:5173/?shot=1&phone=0&cam=1'
      : `http://localhost:5173/?shot=1&phone=0&${query}`
    const { render, renderNoBar, photo, photoNoBar, barTop } = await shoot(b, url, vp)
    const H = render.height
    // photoNoBar：底栏已隐藏、canvas 也隐藏——就是纯照片（同一张 photo）
    const plain = photoNoBar ?? photo
    const barTopPx = barTop ?? Math.round(H - 88)
    // (a) 底栏正上方 5px
    const aboveBar = rowStats(render, photo, Math.max(0, barTopPx - 5))
    // (a2) 底栏内部靠近底边处——光带应从底栏下透出来，不能被暗底栏吃掉
    const insideBar = rowStats(render, photo, Math.min(H - 2, barTopPx + 40))
    // (b) 隐藏底栏后真正的最后一行
    const lastRow = rowStats(renderNoBar, plain, H - 1)
    const hot = (s) => s.hotPx >= 8 && s.maxD + s.maxTint / 8 > 8
    const okAbove = hot(aboveBar)
    const okInside = hot(insideBar)
    const okLast = hot(lastRow)
    const ok = okAbove && okInside && okLast
    if (!ok) fail++
    rows.push({ name, vp: `${vp.width}x${vp.height}`, barTop: barTopPx, ok, okAbove, okInside, okLast, aboveBar, insideBar, lastRow })
    console.log(JSON.stringify({ name, vp: `${vp.width}x${vp.height}`, barTop: barTopPx, ok, aboveBar, insideBar, lastRow }))
  }
}
await browser.close()
await camBrowser.close()

if (fail) {
  console.error(`FAIL: ${fail} case(s) missing band pixels at the bottom edge`)
  process.exitCode = 1
} else {
  console.log('OK: band reaches the viewport bottom edge in all scenes/route/viewports')
}
