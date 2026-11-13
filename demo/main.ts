/**
 * navi-arrow 演示页（重做版）：真实街景照片背景 + lil-gui 调参 + 自动播放脚本
 */
import * as THREE from 'three'
import { createNaviArrow } from '../src/index'
import { attachDragLook, startCamera, DeviceOrientationRig } from '../src/ar'
import GUI from 'lil-gui'

// ---------- 背景 ----------
const bgLayer = document.getElementById('bg') as HTMLElement
const video = document.getElementById('cam') as HTMLVideoElement
const perm = document.getElementById('perm') as HTMLElement

// 默认真实街景照片（免版权，来源见 README）
const img = document.createElement('img')
img.src = './assets/street.jpg'
img.style.cssText = 'width:100%;height:100%;object-fit:cover;'
bgLayer.appendChild(img)

const rig = new DeviceOrientationRig()
let usingDevice = false

document.getElementById('camBtn')!.addEventListener('click', async () => {
  const ok = await DeviceOrientationRig.requestPermission()
  const stream = await startCamera(video)
  if (stream) {
    video.style.display = 'block'
    bgLayer.style.display = 'none'
    perm.style.display = 'none'
    if (ok && rig.supported) rig.start((q) => { usingDevice = true; camera.quaternion.copy(q) })
  }
})

// ---------- 组件 ----------
const navi = createNaviArrow(document.getElementById('navi') as HTMLElement, {
  route: [
    [0, 0],
    [0, -12],
    [5, -18],
    [5, -30],
    [12, -36],
    [12, -48],
  ],
  curtainHeight: 0.6,
  curtainWidth: 0.32,
  autoRender: false,
  banner: { distance: '20米后', action: '进入', road: '无名路' },
  footer: { enabled: true, distance: '剩余7.9公里', duration: '1小时47分钟' },
})
navi.onFooterButton((act) => {
  if (act === 'exit') alert('退出导航（演示）')
  else document.getElementById('hint')!.textContent = '「地图」按钮（演示）'
})

// ---------- 相机：眼高 1.6m，FOV 60，略微俯视；路线起点在脚前方 3m ----------
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 300)
camera.position.set(0, 1.6, 4.5)
const yawPitch = { yaw: 0, pitch: -0.12 }
function applyLook() {
  const e = new THREE.Euler(yawPitch.pitch, yawPitch.yaw, 0, 'YXZ')
  camera.quaternion.setFromEuler(e)
}
applyLook()

// 桌面拖拽模拟转头
attachDragLook(document.getElementById('phone')!, (yaw, pitch) => {
  if (usingDevice) return
  yawPitch.yaw = yaw
  yawPitch.pitch = pitch
  applyLook()
}, yawPitch)

// ---------- lil-gui 调参面板 ----------
const gui = new GUI({ title: 'navi-arrow 调参' })
const guiState = {
  颜色: '#2F7BFF',
  高度: navi.params.curtainHeight,
  宽度: navi.params.curtainWidth * 2,
  透明度: navi.params.opacity,
  扫描线: navi.params.scanLines,
  流动速度: navi.params.flowSpeed,
  bloom强度: navi.params.bloomStrength,
  V形箭头: false,
}

// 截图模式（?shot=1）：隐藏 GUI 和提示，禁用过渡
const isShot = new URLSearchParams(location.search).has('shot')
if (isShot) {
  gui.hide()
  document.getElementById('hint')!.style.display = 'none'
  document.getElementById('perm')!.style.display = 'none'
}
gui.addColor(guiState, '颜色').onChange((v: string) => {
  ;(navi as any).theme.primary = v
  navi.applyParams()
})
gui.add(guiState, '高度', 0.2, 1.5, 0.05).onChange((v: number) => {
  navi.params.curtainHeight = v
  navi.applyParams()
})
gui.add(guiState, '宽度', 0.2, 1.6, 0.05).onChange((v: number) => {
  navi.params.curtainWidth = v / 2
  navi.applyParams()
})
gui.add(guiState, '透明度', 0.2, 1.2, 0.05).onChange((v: number) => {
  navi.params.opacity = v
  navi.applyParams()
})
gui.add(guiState, '扫描线', 8, 90, 1).onChange((v: number) => {
  navi.params.scanLines = v
  navi.applyParams()
})
gui.add(guiState, '流动速度', 0.5, 6, 0.25).onChange((v: number) => {
  navi.params.flowSpeed = v
  navi.applyParams()
})
gui.add(guiState, 'bloom强度', 0, 2.5, 0.1).onChange((v: number) => {
  navi.params.bloomStrength = v
  navi.applyParams()
})
gui.add(guiState, 'V形箭头').onChange((v: boolean) => navi.setChevrons(v))
gui.add(guiState, 'V形箭头').onChange((v: boolean) => navi.setChevrons(v))

// ---------- 渲染循环（window.__pauseRender 控制截图） ----------
const phone = document.getElementById('phone')!
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
    setTimeout(() => requestAnimationFrame(frame), 200)
  }
}
frame()

// ---------- 自动播放脚本 ----------
const t0 = performance.now() - (parseFloat(new URLSearchParams(location.search).get('t') ?? '0') * 1000)
const steps: Array<{ at: number; run: () => void }> = [
  { at: 0, run: () => navi.setBanner({ distance: '', action: '沿当前道路', road: '直行' }) },
  { at: 3500, run: () => navi.setBanner({ distance: '20米后', action: '右转 进入', road: '无名路' }) },
  { at: 7500, run: () => navi.setBanner({ distance: '', action: '已进入', road: '无名路' }) },
  { at: 11000, run: () => navi.setBanner({ distance: '30米后', action: '左转 进入', road: '永初路' }) },
  { at: 15000, run: () => navi.setFooter({ enabled: true, distance: '剩余0公里', duration: '0分钟', arrival: '已到达目的地' }) },
  { at: 15500, run: () => navi.setBanner({ distance: '', action: '', road: '目的地在您右侧' }) },
]
let stepIdx = 0
function tick() {
  const t = performance.now() - t0
  while (stepIdx < steps.length && t >= steps[stepIdx].at) {
    steps[stepIdx].run()
    stepIdx++
  }
  if (stepIdx < steps.length) requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault()
    stepIdx = 0
    tick()
  }
})
