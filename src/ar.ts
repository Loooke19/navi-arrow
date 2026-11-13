/**
 * 相机/AR 输入：设备方向驱动 + 桌面端拖拽 + getUserMedia 摄像头背景
 */
import * as THREE from 'three'

export interface CameraRigOptions {
  /** 视线俯仰角（度），正值向下看，默认 -6（略微平视偏下） */
  pitch?: number
  /** 眼睛离地高度（米），默认 1.6 */
  eyeHeight?: number
}

/**
 * 用设备方向（DeviceOrientationEvent）驱动 Three.js 相机四元数。
 * iOS 需要用户手势里调用 requestPermission()。
 */
export class DeviceOrientationRig {
  private enabled = false
  private alpha = 0
  private beta = 90
  private gamma = 0
  private screenAngle = 0
  private q = new THREE.Quaternion()
  private qScreen = new THREE.Quaternion()
  private qCompass = new THREE.Quaternion()
  private qAdjust = new THREE.Quaternion()
  private zee = new THREE.Vector3(0, 0, 1)
  private euler = new THREE.Euler()
  private sensor: any = null
  private onChange?: (q: THREE.Quaternion) => void

  constructor() {
    const sensorCtor = (window as any).DeviceOrientationSensor
    if (sensorCtor) {
      try {
        this.sensor = new sensorCtor({ frequency: 60 })
        this.sensor.start()
      } catch {
        this.sensor = null
      }
    }
  }

  /** 是否真的有传感器数据（用于判断能否自动启动） */
  get supported(): boolean {
    return !!this.sensor || ('DeviceOrientationEvent' in window)
  }

  static async requestPermission(): Promise<boolean> {
    const DOE: any = (window as any).DeviceOrientationEvent
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        return (await DOE.requestPermission()) === 'granted'
      } catch {
        return false
      }
    }
    return true
  }

  start(onChange: (q: THREE.Quaternion) => void) {
    this.onChange = onChange
    if (this.enabled) return
    this.enabled = true
    window.addEventListener('deviceorientationabsolute', this.handle as any, true)
    window.addEventListener('deviceorientation', this.handle as any, true)
    this.screenAngle = (screen.orientation as any)?.angle ?? (window as any).orientation ?? 0
    window.addEventListener('orientationchange', this.updateScreenAngle)
  }

  private updateScreenAngle = () => {
    this.screenAngle = (screen.orientation as any)?.angle ?? (window as any).orientation ?? 0
  }

  private handle = (e: DeviceOrientationEvent) => {
    if ((e as any).absolute === false && !this.sensor) {
      // 相对方向（无指南针）也不影响 AR 体验：相对朝向即可
    }
    if (e.alpha == null && e.beta == null && e.gamma == null) return
    this.alpha = e.alpha ? THREE.MathUtils.degToRad(e.alpha) : 0
    this.beta = e.beta ? THREE.MathUtils.degToRad(e.beta) : Math.PI / 2
    this.gamma = e.gamma ? THREE.MathUtils.degToRad(e.gamma) : 0
    this.compute()
  }

  get quaternion(): THREE.Quaternion {
    return this.q
  }

  private compute() {
    // 标准 Three.js DeviceOrientation 复现（three/deviceloading 官方示例算法）
    this.euler.set(this.beta, this.alpha, -this.gamma, 'YXZ')
    this.q.setFromEuler(this.euler)
    this.q.multiply(this.qScreen.setFromAxisAngle(this.zee, -THREE.MathUtils.degToRad(this.screenAngle)))
    this.q.multiply(this.qAdjust.setFromAxisAngle(this.zee, Math.PI))
    this.onChange?.(this.q)
  }

  stop() {
    this.enabled = false
    window.removeEventListener('deviceorientationabsolute', this.handle as any, true)
    window.removeEventListener('deviceorientation', this.handle as any, true)
    window.removeEventListener('orientationchange', this.updateScreenAngle)
    this.sensor?.stop?.()
  }
}

/** 桌面端拖拽模拟：横向拖动 = 转头，纵向 = 俯仰 */
export function attachDragLook(
  el: HTMLElement,
  onChange: (yaw: number, pitch: number) => void,
  initial = { yaw: 0, pitch: 0 },
) {
  let yaw = initial.yaw
  let pitch = initial.pitch
  let dragging = false
  let lx = 0
  let ly = 0
  const down = (e: PointerEvent) => {
    dragging = true
    lx = e.clientX
    ly = e.clientY
    el.setPointerCapture?.(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - lx
    const dy = e.clientY - ly
    lx = e.clientX
    ly = e.clientY
    yaw -= dx * 0.0045
    pitch = THREE.MathUtils.clamp(pitch - dy * 0.0035, -0.9, 0.6)
    onChange(yaw, pitch)
  }
  const up = () => (dragging = false)
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
}

/** 用 getUserMedia 打开后置摄像头作为背景，失败返回 null（由调用方回退到静态图） */
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    video.srcObject = stream
    await video.play().catch(() => {})
    return stream
  } catch {
    return null
  }
}
