/**
 * navi-arrow 演示页：两个转弯的步行路线 + 自动播放脚本
 * 直行 → 横幅「20米后 右转 进入 无名路」→ 右转 → 直行 → 左转 → 到达
 */
import { createNaviArrow } from '../src/index'
import { attachDragLook, startCamera, DeviceOrientationRig } from '../src/ar'
import * as THREE from 'three'

// ---------- 摄像头背景 ----------
const video = document.getElementById('cam') as HTMLVideoElement
const perm = document.getElementById('perm') as HTMLElement
document.getElementById('camBtn')!.addEventListener('click', async () => {
  const ok = await DeviceOrientationRig.requestPermission()
  const stream = await startCamera(video)
  if (stream) perm.style.display = 'none'
})

// ---------- 组件 ----------
const navi = createNaviArrow(document.getElementById('navi') as HTMLElement, {
  route: [
    [0, 0],
    [0, -14],
    [7, -22],
    [7, -34],
    [15, -40],
    [15, -52],
  ],
  curtainHeight: 0.42,
  curtainWidth: 0.85,
  showChevrons: false,
  autoRender: false,
  banner: { distance: '20米后', action: '进入', road: '无名路' },
  footer: { enabled: true, distance: '剩余7.9公里', duration: '1小时47分钟' },
})
navi.onFooterButton((act) => {
  if (act === 'exit') alert('退出导航（演示）')
  else document.getElementById('hint')!.textContent = '「地图」按钮（演示）'
})

// ---------- 相机：固定在路线起点，由设备方向/拖拽驱动朝向 ----------
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 500)
camera.position.set(0, 1.6, 2)
const yawPitch = { yaw: 0, pitch: -0.06 }
function applyLook() {
  const e = new THREE.Euler(yawPitch.pitch, yawPitch.yaw, 0, 'YXZ')
  camera.quaternion.setFromEuler(e)
}
applyLook()

// 设备方向（真机 AR）
const rig = new DeviceOrientationRig()
let usingDevice = false
document.getElementById('camBtn')!.addEventListener('click', async () => {
  const ok = await DeviceOrientationRig.requestPermission()
  if (ok && rig.supported) {
    rig.start((q) => { usingDevice = true; camera.quaternion.copy(q) })
  }
})
// 桌面拖拽模拟
attachDragLook(document.getElementById('phone')!, (yaw, pitch) => {
  if (usingDevice) return
  yawPitch.yaw = yaw
  yawPitch.pitch = pitch
  applyLook()
}, yawPitch)

// 每帧把位姿喂给组件（组件本身透明叠加，不负责相机）
// window.__pauseRender = true 时停止渲染循环（供截图/调试）
const phone = document.getElementById('phone')!;
;(window as any).__pauseRender = false
function frame() {
  if (!(window as any).__pauseRender) {
    const w = phone.clientWidth
    const h = phone.clientHeight
    if (camera.aspect !== w / h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    navi.setCameraPose(camera.position, camera.quaternion)
    navi.render()
    requestAnimationFrame(frame)
  } else {
    // 暂停期间低频轮询恢复，避免持续 rAF 干扰截图
    setTimeout(() => requestAnimationFrame(frame), 200)
  }
}
frame()

// ---------- 自动播放脚本 ----------
type Step = { at: number; run: () => void }
// 支持 ?t=秒 快进（调试/截图用）
const t0 = performance.now() - (parseFloat(new URLSearchParams(location.search).get('t') ?? '0') * 1000)
function play() {
  const steps: Step[] = [
    { at: 0, run: () => navi.setBanner({ distance: '', action: '沿当前道路', road: '直行' }) },
    { at: 3500, run: () => navi.setBanner({ distance: '20米后', action: '右转 进入', road: '无名路' }) },
    { at: 7500, run: () => navi.setBanner({ distance: '', action: '已进入', road: '无名路' }) },
    { at: 11000, run: () => navi.setBanner({ distance: '30米后', action: '左转 进入', road: '永初路' }) },
    { at: 15000, run: () => navi.setFooter({ enabled: true, distance: '剩余0公里', duration: '0分钟', arrival: '已到达目的地' }) },
    { at: 15500, run: () => navi.setBanner({ distance: '', action: '', road: '目的地在您右侧' }) },
  ]
  const tick = () => {
    const t = performance.now() - t0
    const next = steps[0]
    if (next && t >= next.at) {
      next.run()
      steps.shift()
    }
    if (steps.length) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
play()
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault()
    play()
  }
})
