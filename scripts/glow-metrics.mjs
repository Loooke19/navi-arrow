/**
 * 光带区域验收：
 * (a) 渲染平均亮度 >= 原照片（加法光绝不压暗）
 * (b) 带内局部对比 / 边缘细节 >= 原照片的 70%（路面纹路仍看得清）
 * (c) 带内 (蓝 - 红) 的平均值比原照片至少高 25，读得出是蓝光而不是发白
 */

export function lumaOf(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * @param {Uint8ClampedArray|Uint8Array} render RGBA
 * @param {Uint8ClampedArray|Uint8Array} photo RGBA
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} mask 1 = 落在光带区域内
 */
export function evaluateGlow(render, photo, width, height, mask) {
  const Lr = new Float32Array(width * height)
  const Lp = new Float32Array(width * height)
  let sumR = 0
  let sumP = 0
  let sumBlueR = 0
  let sumBlueP = 0
  let n = 0
  for (let i = 0; i < width * height; i++) {
    if (!mask[i]) continue
    const o = i * 4
    const lr = lumaOf(render[o], render[o + 1], render[o + 2])
    const lp = lumaOf(photo[o], photo[o + 1], photo[o + 2])
    Lr[i] = lr
    Lp[i] = lp
    sumR += lr
    sumP += lp
    sumBlueR += render[o + 2] - render[o]
    sumBlueP += photo[o + 2] - photo[o]
    n++
  }
  let cR = 0
  let cP = 0
  let cn = 0
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x
      if (!mask[i]) continue
      cR += Math.abs(Lr[i + 1] - Lr[i]) + Math.abs(Lr[i + width] - Lr[i])
      cP += Math.abs(Lp[i + 1] - Lp[i]) + Math.abs(Lp[i + width] - Lp[i])
      cn++
    }
  }
  const lumaRender = n ? sumR / n : 0
  const lumaPhoto = n ? sumP / n : 0
  const contrastRender = cn ? cR / cn : 0
  const contrastPhoto = cn ? cP / cn : 0
  const contrastRatio = contrastPhoto > 0.05 ? contrastRender / contrastPhoto : 1
  const blueRender = n ? sumBlueR / n : 0
  const bluePhoto = n ? sumBlueP / n : 0
  const blueDelta = blueRender - bluePhoto
  return {
    samples: n,
    lumaRender,
    lumaPhoto,
    lumaDelta: lumaRender - lumaPhoto,
    contrastRender,
    contrastPhoto,
    contrastRatio,
    blueRender,
    bluePhoto,
    blueDelta,
    // 0.4 级余量只吸收截图像素舍入，真压暗会差几个亮度级
    lumaOK: n > 0 && lumaRender + 0.4 >= lumaPhoto,
    contrastOK: n > 0 && contrastRatio >= 0.7,
    blueOK: n > 0 && blueDelta >= 25,
  }
}
