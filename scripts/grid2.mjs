// REDO2 对比拼图：demo 截图 vs f_10 / f_31 / 百度横幅
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const imgs = [
  ['docs/compare/demo-01-straight.png', 'demo 直行（底边进入·贴路·薄纱）'],
  ['reference/dji-frames/f_10.jpg', 'DJI f_10 参考'],
  ['docs/compare/demo-02-turn-banner.png', 'demo 右转横幅'],
  ['reference/dji-frames/f_31.jpg', 'DJI f_31 参考'],
  ['reference/baidu-banner-ar.png', '百度横幅参考'],
  ['docs/compare/demo-03-after-turn.png', 'demo 到达态'],
  ['docs/compare/demo-04-side-view.png', 'demo 侧视（立体感）'],
]

const cells = imgs.map(([p, t]) => `
  <div class="cell">
    <img src="file:///${process.cwd().replace(/\\/g, '/')}/${p.replace(/\\/g, '/')}" />
    <div class="t">${t}</div>
  </div>`).join('')

const html = `<!DOCTYPE html><html><head><meta charset="utf8"><style>
  body{margin:0;background:#111;display:flex;flex-wrap:wrap;font-family:sans-serif}
  .cell{width:300px;margin:6px}
  .cell img{width:300px;height:648px;object-fit:cover;display:block}
  .t{color:#fff;font-size:13px;padding:4px;text-align:center}
</style></head><body>${cells}</body></html>`

writeFileSync('docs/compare/_grid.html', html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1240, height: 1450 } })
await page.goto(`file:///${process.cwd().replace(/\\/g, '/')}/docs/compare/_grid.html`)
await page.waitForTimeout(1500)
await page.screenshot({ path: 'docs/compare/redo2-grid.png', fullPage: true })
console.log('redo2-grid saved')
await browser.close()
