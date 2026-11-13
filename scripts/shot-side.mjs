// 侧视角截图（验证光幕立体感）
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--use-gl=angle'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto('http://localhost:5173/?shot=1')
await page.waitForTimeout(2500)
// 拖拽转头看光幕侧面
await page.mouse.move(195, 400)
await page.mouse.down()
await page.mouse.move(228, 410, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(800)
await page.evaluate(() => { window.__pauseRender = true })
await page.waitForTimeout(400)
await page.screenshot({ path: 'docs/compare/demo-04-side-view.png' })
console.log('side view shot')
await browser.close()
