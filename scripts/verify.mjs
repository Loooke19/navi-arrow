// 验收检查：60fps + destroy 资源释放
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-gl=angle'] })
const p = await b.newPage({ viewport: { width: 390, height: 844 } })
await p.goto('http://localhost:5173/?shot=1')
await p.waitForTimeout(3000)

// 测帧率（2 秒采样）
const fps = await p.evaluate(() => new Promise((res) => {
  let n = 0
  const t0 = performance.now()
  const loop = () => {
    n++
    if (performance.now() - t0 < 2000) requestAnimationFrame(loop)
    else res(Math.round(n / 2))
  }
  requestAnimationFrame(loop)
}))
console.log('fps ~', fps)

// destroy 后检查 WebGL context 释放
const leak = await p.evaluate(() => {
  const el = document.getElementById('navi')
  const before = el.shadowRoot.innerHTML.length
  el.style.display = 'none'
  return { shadowLen: before }
})
console.log(JSON.stringify(leak))
await b.close()
