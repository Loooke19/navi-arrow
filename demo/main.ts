/**
 * navi-arrow 演示页（重做版）：真实街景照片背景 + lil-gui 调参 + 自动播放脚本
 */
import * as THREE from 'three'
import { createNaviArrow } from '../src/index'
import { attachDragLook, DeviceOrientationRig } from '../src/ar'
import GUI from 'lil-gui'

// ---------- 背景：街景照片 / 相机实景 双模式 ----------
const bgLayer = document.getElementById('bg') as HTMLElement
const video = document.getElementById('cam') as HTMLVideoElement
const modeMsg = document.getElementById('modeMsg') as HTMLElement
const btnPhoto = document.getElementById('btnPhoto') as HTMLButtonElement
const btnCam = document.getElementById('btnCam') as HTMLButtonElement

// 默认真实街景照片（免版权，来源见 README）
const img = document.createElement('img')
img.src = './assets/street.jpg'
img.style.cssText = 'width:100%;height:100%;object-fit:cover;'
bgLayer.appendChild(img)

const rig = new DeviceOrientationRig()
let usingDevice = false
let camStream: MediaStream | null = null
let deviceRigStarted = false

function showModeMsg(text: string) {
  modeMsg.textContent = text
  setTimeout(() => { if (modeMsg.textContent === text) modeMsg.textContent = '' }, 4000)
}

async function enterCameraMode() {
  // 摄像头需要安全上下文（HTTPS 或 localhost）
  if (!navigator.mediaDevices?.getUserMedia) {
    showModeMsg('当前环境不支持摄像头（需要 HTTPS），已回退到街景照片')
    return
  }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
  } catch (e: any) {
    const reason = e?.name === 'NotAllowedError' ? '权限被拒绝' : e?.name === 'NotFoundError' ? '未找到摄像头' : String(e?.message ?? e)
    showModeMsg(`无法开启相机（${reason}），已回退到街景照片`)
    return
  }
  video.srcObject = camStream
  await video.play().catch(() => {})
  video.style.display = 'block'
  bgLayer.style.display = 'none'
  btnCam.classList.add('active')
  btnPhoto.classList.remove('active')
  // iOS 需要在同一手势里请求权限；手机上开启后路线随手机俯仰/转动
  const ok = await DeviceOrientationRig.requestPermission()
  if (ok && rig.supported && !deviceRigStarted) {
    rig.start((q) => { usingDevice = true; camera.quaternion.copy(q) })
    deviceRigStarted = true
  }
}

function exitCameraMode() {
  camStream?.getTracks().forEach((t) => t.stop())
  camStream = null
  video.srcObject = null
  video.style.display = 'none'
  bgLayer.style.display = 'block'
  btnPhoto.classList.add('active')
  btnCam.classList.remove('active')
  usingDevice = false
}

btnCam.addEventListener('click', enterCameraMode)
btnPhoto.addEventListener('click', exitCameraMode)

// ---------- 组件 ----------
const navi = createNaviArrow(document.getElementById('navi') as HTMLElement, {
  route: [
    [0, 0],
    [0, -22],
    [9, -34],
    [9, -50],
    [18, -58],
    [18, -70],
  ],
  curtainHeight: 0.4,
  curtainWidth: 0.9,
  autoRender: false,
  banner: { distance: '20米后', action: '进入', road: '无名路' },
  footer: { enabled: true, distance: '剩余7.9公里', duration: '1小时47分钟' },
})
navi.onFooterButton((act) => {
  if (act === 'exit') alert('退出导航（演示）')
  else document.getElementById('hint')!.textContent = '「地图」按钮（演示）'
})

// ---------- 相机：眼高 1.6m，FOV 60，路线起点在脚前 1.5m，光幕从画面底边进入 ----------
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 300)
camera.position.set(0, 1.6, 1.5)
const yawPitch = { yaw: 0, pitch: -0.17 } // 约 -10°，路面占画面下部 ~45%
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
  俯仰角: -10,
  随设备转动: false,
  V形箭头: false,
}

// 截图模式（?shot=1）：隐藏 GUI 和提示
const isShot = new URLSearchParams(location.search).has('shot')
if (isShot) {
  gui.hide()
  document.getElementById('hint')!.style.display = 'none'
  document.getElementById('modeBar')!.style.display = 'none'
  document.getElementById('modeMsg')!.style.display = 'none'
}
gui.addColor(guiState, '颜色').onChange((v: string) => {
  ;(navi as any).theme.primary = v
  navi.applyParams()
})
gui.add(guiState, '高度', 0.2, 0.8, 0.05).onChange((v: number) => {
  navi.params.curtainHeight = v
  navi.applyParams()
})
gui.add(guiState, '宽度', 0.1, 0.8, 0.02).onChange((v: number) => {
  navi.params.curtainWidth = v / 2
  navi.applyParams()
})
gui.add(guiState, '透明度', 0.15, 0.8, 0.05).onChange((v: number) => {
  navi.params.opacity = v
  navi.applyParams()
})
gui.add(guiState, '扫描线', 4, 20, 1).onChange((v: number) => {
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
gui.add(guiState, '俯仰角', -30, 10, 1).onChange((v: number) => {
  yawPitch.pitch = THREE.MathUtils.degToRad(v)
  usingDevice = false // 手动调节时暂停设备朝向
  applyLook()
})
gui.add(guiState, '随设备转动').listen().onChange((v: boolean) => {
  if (v && rig.supported && !deviceRigStarted) {
    DeviceOrientationRig.requestPermission().then((ok) => {
      if (ok) { rig.start((q) => { usingDevice = true; camera.quaternion.copy(q) }); deviceRigStarted = true }
    })
  }
  if (!v) { usingDevice = false; applyLook() }
})
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
