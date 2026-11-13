import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-gl=angle'] })
const p = await b.newPage({ viewport: { width: 390, height: 844 } })
await p.goto('http://localhost:5173/?shot=1')
await p.waitForTimeout(2500)
// 检查合成输出的实际呈现：整页截白底对比，看 canvas 是不是把背景盖黑
await p.evaluate(() => {
  document.documentElement.style.background = 'lime'
})
await p.waitForTimeout(300)
await p.screenshot({ path: 'docs/compare/_probe-alpha.png' })
console.log('ok')
await b.close()
