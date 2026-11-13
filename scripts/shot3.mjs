// REDO3 截图：地面网格调试 + 侧视
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--use-gl=angle'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

// 地面网格调试（?grid=1 自动开网格）
await page.goto('http://localhost:5173/?shot=1&grid=1')
await page.waitForTimeout(3000)
await page.evaluate(() => { window.__pauseRender = true })
await page.waitForTimeout(400)
await page.screenshot({ path: 'docs/compare/demo-06-ground-grid.png' })
console.log('grid shot ok')
await page.evaluate(() => { window.__pauseRender = false })

// 侧视（拖拽转头）
await page.goto('http://localhost:5173/?shot=1')
await page.waitForTimeout(2500)
await page.mouse.move(195, 400)
await page.mouse.down()
await page.mouse.move(228, 410, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(800)
await page.evaluate(() => { window.__pauseRender = true })
await page.waitForTimeout(400)
await page.screenshot({ path: 'docs/compare/demo-04-side-view.png' })
console.log('side shot ok')

// 相机实景（假摄像头）
await browser.close()
const b2 = await chromium.launch({
  args: ['--use-gl=angle', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
const p2 = await b2.newPage({ viewport: { width: 390, height: 844 } })
await p2.goto('http://localhost:5173/?shot=1&cam=1')
await p2.waitForTimeout(3500)
await p2.evaluate(() => { window.__pauseRender = true })
await p2.waitForTimeout(400)
await p2.screenshot({ path: 'docs/compare/demo-05-camera-live.png' })
console.log('camera shot ok')
await b2.close()
