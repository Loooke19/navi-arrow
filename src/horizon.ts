/**
 * [INPUT]: depends on THREE.PerspectiveCamera and THREE.Vector3 from three
 * [OUTPUT]: provides HorizonState, photoToViewportY, viewportToPhotoX, computeHorizonPitchDeg, evaluateRouteBelowHorizon
 * [POS]: pure horizon-calibration math within src/, called by NaviArrowCore to align 3D ground with object-fit:cover backgrounds
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import * as THREE from 'three'

export interface HorizonState {
  horizonY: number
  vanishX: number
  pitchDeg: number
  enabled: boolean
}

/** 把照片坐标 y（0..1）换算到视口坐标 y（0..1），处理 object-fit:cover 裁剪 */
export function photoToViewportY(photoY: number, photoAspect: number, vw: number, vh: number): number {
  if (!photoAspect) return photoY
  const viewportAspect = (vw || 1) / (vh || 1)
  if (viewportAspect > photoAspect) {
    const visibleFraction = photoAspect / viewportAspect
    const top = (1 - visibleFraction) / 2
    return (photoY - top) / visibleFraction
  }
  return photoY
}

/** 把视口坐标 x（0..1）换算回照片坐标 x（处理 object-fit:cover 左右裁剪） */
export function viewportToPhotoX(viewportX: number, photoAspect: number, vw: number, vh: number): number {
  if (!photoAspect) return viewportX
  const viewportAspect = (vw || 1) / (vh || 1)
  if (viewportAspect < photoAspect) {
    const visibleFraction = viewportAspect / photoAspect
    const left = (1 - visibleFraction) / 2
    return left + viewportX * visibleFraction
  }
  return viewportX
}

/** 根据照片可见地平线位置反推 3D 相机俯仰角（度） */
export function computeHorizonPitchDeg(
  horizonY: number,
  photoAspect: number,
  vw: number,
  vh: number,
  fovDeg: number,
): number {
  const visibleHorizonY = photoToViewportY(horizonY, photoAspect, vw, vh)
  const fovY = THREE.MathUtils.degToRad(fovDeg)
  const pitch = Math.atan((2 * visibleHorizonY - 1) * Math.tan(fovY / 2))
  return THREE.MathUtils.radToDeg(pitch)
}

/** 校验所有地面路线采样点均落在屏幕地平线以下，且远端收束在地平线附近 */
export function evaluateRouteBelowHorizon(
  points: THREE.Vector3[],
  camera: THREE.PerspectiveCamera,
  horizonY: number,
  photoAspect: number,
  vw: number,
  vh: number,
): { ok: boolean; maxAbove: number; farthestGap: number; horizonPx: number; points: Array<{ x: number; y: number }> } {
  const h = vh || 1
  const horizonPx = photoToViewportY(horizonY, photoAspect, vw, h) * h
  let maxAbove = 0
  let farthestGap = Infinity
  const screen: Array<{ x: number; y: number }> = []
  const v = new THREE.Vector3()
  const camSpace = new THREE.Vector3()
  for (const p of points) {
    camSpace.copy(p).applyMatrix4(camera.matrixWorldInverse)
    if (camSpace.z >= -camera.near) continue
    v.copy(p).project(camera)
    const sy = (1 - (v.y + 1) / 2) * h
    screen.push({ x: (v.x + 1) / 2, y: sy / h })
    maxAbove = Math.max(maxAbove, horizonPx - sy)
    farthestGap = sy - horizonPx
  }
  const farGapPx = Math.abs(farthestGap)
  const ok = maxAbove <= 0.5 && farGapPx <= h * 0.03 + 8
  return { ok, maxAbove, farthestGap: farGapPx, horizonPx, points: screen }
}
