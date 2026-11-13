// REDO6 对比拼图
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const imgs = [
  ['docs/compare/demo-01-straight.png', 'demo 直行（平滑发光带+细亮线+立体V箭头）'],
  ['reference/dji-frames/f_10.jpg', 'DJI f_10 参考'],
  ['docs/compare/demo-02-turn-banner.png', 'demo 右转横幅'],
  ['reference/dji-frames/f_31.jpg', 'DJI f_31 参考'],
  ['reference/baidu-banner-ar.png', '百度横幅参考'],
  ['docs/compare/demo-06-ground-grid.png', 'demo 地面网格调试'],
  ['docs/compare/demo-03-after-turn.png', 'demo 到达态'],
  ['docs/compare/demo-04-side-view.png', 'demo 侧视（边缘光幕立起）'],
  ['docs/compare/demo-05-camera-live.png', 'demo 相机实景（假流）'],
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

writeFileSync('docs/compare/_grid6.html', html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1240, height: 2100 } })
await page.goto(`file:///${process.cwd().replace(/\\/g, '/')}/docs/compare/_grid6.html`)
await page.waitForTimeout(1500)
await page.screenshot({ path: 'docs/compare/redo6-grid.png', fullPage: true })
console.log('redo6-grid saved')
await browser.close()
