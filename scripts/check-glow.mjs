// REDO5 验收：地面带必须是「加光」——采样带内像素 vs 关闭组件后同位置像素，必须更亮
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const browser = await chromium.launch({ args: ['--use-gl=angle'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto('http://localhost:5173/?shot=1')
await page.waitForTimeout(3000)

// 带光截图（取样路线中段无箭头区：光带必经之处，避开立体箭头）
await page.evaluate(() => { window.__pauseRender = true })
await page.waitForTimeout(300)
const withGlow = PNG.sync.read(await page.screenshot({ clip: { x: 180, y: 430, width: 30, height: 60 } }))

// 隐藏组件（只留照片），同区域截图
await page.evaluate(() => {
  window.__pauseRender = false
  const navi = document.getElementById('navi')
  if (navi) navi.style.display = 'none'
})
await page.waitForTimeout(500)
await page.evaluate(() => { window.__pauseRender = true })
await page.waitForTimeout(300)
const noGlow = PNG.sync.read(await page.screenshot({ clip: { x: 180, y: 430, width: 30, height: 60 } }))

function luma(png) {
  let sum = 0
  let n = 0
  for (let i = 0; i < png.data.length; i += 4) {
    sum += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]
    n++
  }
  return sum / n
}

const lWith = luma(withGlow)
const lWithout = luma(noGlow)
const delta = lWith - lWithout
console.log(JSON.stringify({ withGlow: +lWith.toFixed(2), photoOnly: +lWithout.toFixed(2), delta: +delta.toFixed(2), brightens: delta > 0 }))
if (!(delta > 0)) {
  console.error('FAIL: 地面带没有提亮照片（压暗了）')
  process.exitCode = 1
}
await browser.close()
