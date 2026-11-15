// 证据图：隐藏底栏后的医院直行 / 街景直行，证明光带一直延伸到最后一行
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] })
const shots = [
  ['hospital-03-straight-nobar', 'scene=hospital', { width: 390, height: 844 }],
  ['hospital-04-straight-nobar-430', 'scene=hospital', { width: 430, height: 932 }],
  ['demo-07-straight-nobar', '', { width: 390, height: 844 }],
]
for (const [name, query, viewport] of shots) {
  const page = await browser.newPage({ viewport })
  await page.goto(`http://localhost:5173/?shot=1&phone=0&${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  await page.evaluate(() => {
    window.__pauseRender = false
    const f = document.querySelector('#navi')?.shadowRoot?.querySelector('.na-footer')
    if (f) f.style.visibility = 'hidden'
  })
  await page.waitForTimeout(500)
  await page.evaluate(() => { window.__pauseRender = true })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `docs/compare/${name}.png` })
  await page.close()
  console.log('shot', name)
}
await browser.close()
