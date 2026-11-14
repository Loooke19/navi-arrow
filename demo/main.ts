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
const btnStreet = document.getElementById('btnStreet') as HTMLButtonElement
const btnHospital = document.getElementById('btnHospital') as HTMLButtonElement
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
  btnStreet.classList.remove('active')
  btnHospital.classList.remove('active')
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
  btnStreet.classList.add('active')
  btnHospital.classList.remove('active')
  btnCam.classList.remove('active')
  usingDevice = false
}

btnCam.addEventListener('click', enterCameraMode)
btnStreet.addEventListener('click', () => { exitCameraMode(); applyScene('street') })
btnHospital.addEventListener('click', () => { exitCameraMode(); applyScene('hospital') })

// ---------- 组件 ----------
const shotQuery = new URLSearchParams(location.search)
const laneX = 0.28 // 近端落在车道中线附近（照片消失点约在画面 0.6）
const straightRoute = [
  [laneX, 0],
  [laneX, -14],
  [laneX, -30],
  [laneX, -48],
  [laneX, -64], // 直行收到地平线，末端圆弧收口
]
const turnRoute = [
  [laneX, 0],
  [laneX, -12],
  [laneX, -20],
  [0.7, -26],
  [2.4, -30],
  [4.6, -33.5],   // 路口一带向右弯，大约在画面 y=560–600
  [6.8, -36.5],
  [8.0, -39],     // 末端圆弧收到画面 x≈0.8
]
const navi = createNaviArrow(document.getElementById('navi') as HTMLElement, {
  route: shotQuery.has('bend') ? turnRoute : straightRoute,
  curtainHeight: 0.5,
  curtainWidth: 1.05,
  showChevrons: true,
  autoRender: false,
  banner: { distance: '20米后', action: '进入', road: '无名路' },
  footer: { enabled: true, distance: '剩余7.9公里', duration: '1小时47分钟' },
})
navi.onFooterButton((act) => {
  if (act === 'exit') alert('退出导航（演示）')
  else document.getElementById('hint')!.textContent = '「地图」按钮（演示）'
})

// ---------- 地平线校准（REDO3 核心） ----------
// 街景照片（828×1054）：车道线与楼底收束在图像 y≈63%、x≈57%
const PHOTO = { horizonY: 0.63, vanishX: 0.57, aspect: 828 / 1054 }
navi.setPhotoAspect(PHOTO.aspect)
const pitchDeg = navi.setHorizonCalibration({ horizonY: PHOTO.horizonY, vanishX: PHOTO.vanishX, eyeHeight: 1.6 })

// ---------- 相机：眼高 1.6m，FOV 60，pitch 由地平线校准得出，路线起点在脚前 1.5m ----------
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 300)
camera.position.set(0, 1.6, 1.5)
const yawPitch = { yaw: 0, pitch: THREE.MathUtils.degToRad(pitchDeg) }
function applyLook() {
  const e = new THREE.Euler(yawPitch.pitch, yawPitch.yaw, 0, 'YXZ')
  camera.quaternion.setFromEuler(e)
}
// ?yaw= 弧度，截图时把镜头转向弯道，让侧光幕正面展开
const shotParams = new URLSearchParams(location.search)
const yawQ = parseFloat(shotParams.get('yaw') ?? '')
if (!Number.isNaN(yawQ)) yawPitch.yaw = yawQ
const campos = shotParams.get('campos')
if (campos) {
  const [x, y, z] = campos.split(',').map(Number)
  if ([x, y, z].every((n) => !Number.isNaN(n))) camera.position.set(x, y, z)
}
applyLook()

type SceneId = 'street' | 'hospital'
function rightArc(x0: number, z0: number, radius: number, degrees: number, steps: number): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  const max = (degrees * Math.PI) / 180
  for (let i = 1; i <= steps; i++) {
    const t = max * (i / steps)
    pts.push([+(x0 + radius * (1 - Math.cos(t))).toFixed(3), +(z0 - radius * Math.sin(t)).toFixed(3)])
  }
  return pts
}
const HOSPITAL = {
  horizonY: 0.445,
  vanishX: 0.50,
  aspect: 1400 / 1867,
  width: 0.85,
  height: 0.48,
  tint: 0.05,
  straight: [[0, 0], [0, -12], [0, -24], [0, -36], [0, -48]] as Array<[number, number]>,
  // 先直行到走廊尽头附近，再以半径 1.8m 只向右弯一次，不先往左甩
  turn: ([[0, 0], [0, -12], [0, -24], [0, -30]] as Array<[number, number]>).concat(rightArc(0, -30, 1.8, 80, 10)),
}
function applyScene(id: SceneId) {
  const bend = shotQuery.has('bend')
  if (id === 'hospital') {
    img.src = './assets/hospital.jpg'
    navi.params.bandWidth = HOSPITAL.width
    navi.params.railHeight = HOSPITAL.height
    navi.theme.primary = '#00C8FF'
    navi.theme.highlight = '#7AF4FF'
    navi.setFloorFill(1)
    navi.setFloorTint(HOSPITAL.tint)
    navi.setRoute(bend ? HOSPITAL.turn : HOSPITAL.straight, { tension: 0 })
    navi.setTurnSign(bend)
    navi.setBanner(bend
      ? { distance: '前方20米', action: '右转 进入', road: '门诊二区' }
      : { distance: '', action: '沿走廊', road: '直行' })
    const calibrate = () => {
      const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : HOSPITAL.aspect
      navi.setPhotoAspect(aspect)
      const p = navi.setHorizonCalibration({ horizonY: HOSPITAL.horizonY, vanishX: HOSPITAL.vanishX, eyeHeight: 1.6 })
      yawPitch.pitch = THREE.MathUtils.degToRad(p)
      applyLook()
    }
    if (img.complete && img.naturalWidth) calibrate()
    else img.onload = calibrate
  } else {
    img.src = './assets/street.jpg'
    navi.params.bandWidth = 1.05
    navi.params.railHeight = 0.5
    navi.theme.primary = '#40D8FF'
    navi.theme.highlight = '#7AEEFF'
    navi.setFloorFill(1)
    navi.setFloorTint(0)
    navi.setRoute(bend ? turnRoute : straightRoute)
    navi.setTurnSign(false)
    navi.setBanner(bend
      ? { distance: '20米后', action: '右转 进入', road: '无名路' }
      : { distance: '', action: '沿当前道路', road: '直行' })
    navi.setPhotoAspect(PHOTO.aspect)
    const p = navi.setHorizonCalibration({ horizonY: PHOTO.horizonY, vanishX: PHOTO.vanishX, eyeHeight: 1.6 })
    yawPitch.pitch = THREE.MathUtils.degToRad(p)
    applyLook()
  }
  navi.applyParams()
  btnStreet.classList.toggle('active', id === 'street')
  btnHospital.classList.toggle('active', id === 'hospital')
  btnCam.classList.remove('active')
}
if (shotQuery.get('scene') === 'hospital') applyScene('hospital')
else applyScene('street')

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
  颜色: '#40D8FF',
  带宽: navi.params.bandWidth,
  边缘光幕高: navi.params.railHeight,
  透明度: navi.params.opacity,
  扫描线: navi.params.scanLines,
  流动速度: navi.params.flowSpeed,
  bloom强度: navi.params.bloomStrength,
  俯仰角: Math.round(pitchDeg * 10) / 10,
  地平线: PHOTO.horizonY,
  地面网格: false,
  随设备转动: false,
  V形箭头: true,
}

// 截图模式（?shot=1）：隐藏 GUI 和提示
const isShot = new URLSearchParams(location.search).has('shot')
if (isShot) {
  gui.hide()
  document.getElementById('hint')!.style.display = 'none'
  document.getElementById('modeBar')!.style.display = 'none'
  document.getElementById('modeMsg')!.style.display = 'none'
}
// ?grid=1：直接开地面网格（截图用）
if (new URLSearchParams(location.search).has('grid')) {
  guiState.地面网格 = true
  navi.setGroundGrid(true)
}
// ?cam=1：自动进相机模式（Playwright 假摄像头截图用）
if (new URLSearchParams(location.search).has('cam')) {
  enterCameraMode()
}
gui.addColor(guiState, '颜色').onChange((v: string) => {
  ;(navi as any).theme.primary = v
  navi.applyParams()
})
gui.add(guiState, '带宽', 0.8, 2.6, 0.05).onChange((v: number) => {
  navi.params.bandWidth = v
  navi.applyParams()
})
gui.add(guiState, '边缘光幕高', 0, 0.8, 0.05).onChange((v: number) => {
  navi.params.railHeight = v
  navi.applyParams()
})
gui.add(guiState, '透明度', 0.3, 1.6, 0.05).onChange((v: number) => {
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
gui.add(guiState, 'bloom强度', 0, 0.6, 0.01).onChange((v: number) => {
  navi.params.bloomStrength = v
  navi.applyParams()
})
gui.add(guiState, '俯仰角', -30, 10, 0.5).onChange((v: number) => {
  navi.horizon.pitchDeg = v
  yawPitch.pitch = THREE.MathUtils.degToRad(v)
  usingDevice = false // 手动调节时暂停设备朝向
  applyLook()
})
gui.add(guiState, '地平线', 0.2, 0.9, 0.01).onChange((v: number) => {
  const p = navi.setHorizonCalibration({ horizonY: v, vanishX: PHOTO.vanishX, eyeHeight: 1.6 })
  guiState.俯仰角 = Math.round(p * 10) / 10
  gui.controllersRecursive().forEach((c) => c.updateDisplay())
  usingDevice = false
  yawPitch.pitch = THREE.MathUtils.degToRad(p)
  applyLook()
})
gui.add(guiState, '地面网格').onChange((v: boolean) => navi.setGroundGrid(v))
gui.add(guiState, '随设备转动').listen().onChange((v: boolean) => {
  if (v && rig.supported && !deviceRigStarted) {
    DeviceOrientationRig.requestPermission().then((ok) => {
      if (ok) { rig.start((q) => { usingDevice = true; camera.quaternion.copy(q) }); deviceRigStarted = true }
    })
  }
  if (!v) { usingDevice = false; applyLook() }
})
gui.add(guiState, 'V形箭头').onChange((v: boolean) => navi.setChevrons(v))
// fps 读数
const fpsHolder = { FPS: 0 }
gui.add(fpsHolder, 'FPS').disable()

// ---------- 渲染循环（window.__pauseRender 控制截图） ----------
const phone = document.getElementById('phone')!
;(window as any).__pauseRender = false
let fpsFrames = 0
let fpsLast = performance.now()
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
    fpsFrames++
    const now = performance.now()
    if (now - fpsLast >= 1000) {
      fpsHolder.FPS = fpsFrames
      fpsFrames = 0
      fpsLast = now
    }
    requestAnimationFrame(frame)
  } else {
    setTimeout(() => requestAnimationFrame(frame), 200)
  }
}
frame()

// 调试句柄（截图/测试脚本用）
;(window as any).__navi = navi

// ---------- 自动播放脚本 ----------
const t0 = performance.now() - (parseFloat(new URLSearchParams(location.search).get('t') ?? '0') * 1000)
const steps: Array<{ at: number; run: () => void }> = shotQuery.get('scene') === 'hospital'
  ? [
      { at: 0, run: () => navi.setBanner(shotQuery.has('bend')
        ? { distance: '前方20米', action: '右转 进入', road: '门诊二区' }
        : { distance: '', action: '沿走廊', road: '直行' }) },
    ]
  : [
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
