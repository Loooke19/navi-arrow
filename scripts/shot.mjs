// Playwright 截图脚本：390×844 无头 Chromium，WebGL 开启
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

mkdirSync('docs/compare', { recursive: true })
const shots = [
  { url: 'http://localhost:5173/?shot=1', wait: 3500, name: 'demo-01-straight.png' },
  { url: 'http://localhost:5173/?shot=1&t=4', wait: 3000, name: 'demo-02-turn-banner.png' },
  { url: 'http://localhost:5173/?shot=1&t=12', wait: 3000, name: 'demo-03-after-turn.png' },
]
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
for (const s of shots) {
  await page.goto(s.url)
  await page.waitForTimeout(s.wait)
  await page.evaluate(() => { if (window.__pauseRender !== undefined) window.__pauseRender = true })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `docs/compare/${s.name}` })
  await page.evaluate(() => { if (window.__pauseRender !== undefined) window.__pauseRender = false })
  console.log('shot:', s.name)
}
await browser.close()
