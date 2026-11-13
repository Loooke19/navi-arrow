// 相机实景模式验收：假摄像头流 + 截图
import { chromium } from 'playwright'

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto('http://localhost:5173/')
await page.waitForTimeout(2500)
// 点击「相机实景」
await page.click('#btnCam')
await page.waitForTimeout(2500)
// 验证 video 可见、img 隐藏
const state = await page.evaluate(() => {
  const v = document.getElementById('cam')
  const bg = document.getElementById('bg')
  return {
    videoVisible: getComputedStyle(v).display !== 'none',
    videoW: v.videoWidth,
    photoHidden: getComputedStyle(bg).display === 'none',
    streaming: !!v.srcObject,
  }
})
console.log(JSON.stringify(state))
// 截图
await page.evaluate(() => {
  window.__pauseRender = true
  const g = document.querySelector('.lil-gui')
  if (g) g.style.display = 'none'
  document.getElementById('modeMsg').textContent = ''
  document.getElementById('hint').style.display = 'none'
})
await page.waitForTimeout(400)
await page.screenshot({ path: 'docs/compare/demo-05-camera-live.png' })
await page.evaluate(() => { window.__pauseRender = false })
// 切回照片模式，验证 stream 停止
await page.click('#btnPhoto')
await page.waitForTimeout(800)
const state2 = await page.evaluate(() => {
  const v = document.getElementById('cam')
  const bg = document.getElementById('bg')
  return {
    photoBack: getComputedStyle(bg).display !== 'none',
    videoHidden: getComputedStyle(v).display === 'none',
    streamStopped: v.srcObject === null,
  }
})
console.log(JSON.stringify(state2))
await browser.close()
