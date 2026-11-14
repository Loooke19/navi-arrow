import { describe, it, expect } from 'vitest'
import { evaluateGlow } from '../scripts/glow-metrics.mjs'

function solid(w: number, h: number, fill: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fill(x, y)
      const o = (y * w + x) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = 255
    }
  }
  return data
}

describe('光带亮度与细节', () => {
  const w = 32
  const h = 24
  const mask = new Uint8Array(w * h).fill(1)
  // 带车道线的照片：左暗右亮，中间一条竖向高对比边缘
  const photo = solid(w, h, (x) => (x < 14 ? [28, 32, 36] : x === 14 ? [210, 210, 200] : [70, 74, 80]))

  it('加法薄光：更亮，边缘细节保留', () => {
    const render = solid(w, h, (x) => {
      const base = x < 14 ? [28, 32, 36] : x === 14 ? [210, 210, 200] : [70, 74, 80]
      return base.map((v) => Math.min(255, v + 18)) as [number, number, number]
    })
    const r = evaluateGlow(render, photo, w, h, mask)
    expect(r.lumaOK).toBe(true)
    expect(r.lumaDelta).toBeGreaterThan(5)
    expect(r.contrastOK).toBe(true)
    expect(r.contrastRatio).toBeGreaterThan(0.9)
  })

  it('压暗的海军蓝填充判定失败', () => {
    const render = solid(w, h, () => [12, 22, 48])
    const r = evaluateGlow(render, photo, w, h, mask)
    expect(r.lumaOK).toBe(false)
    expect(r.contrastOK).toBe(false)
  })

  it('青蓝加光让 (蓝-红) 比原图至少高 25', () => {
    const render = solid(w, h, (x) => {
      const base = x < 14 ? [28, 32, 36] : x === 14 ? [210, 210, 200] : [70, 74, 80]
      return [
        Math.min(255, base[0] + 8),
        Math.min(255, base[1] + 28),
        Math.min(255, base[2] + 48),
      ]
    })
    const r = evaluateGlow(render, photo, w, h, mask)
    expect(r.blueDelta).toBeGreaterThanOrEqual(25)
    expect(r.blueOK).toBe(true)
    expect(r.lumaOK).toBe(true)
  })

  it('只是整体发白不算蓝光', () => {
    const render = solid(w, h, (x) => {
      const base = x < 14 ? [28, 32, 36] : x === 14 ? [210, 210, 200] : [70, 74, 80]
      return base.map((v) => Math.min(255, v + 20))
    })
    const r = evaluateGlow(render, photo, w, h, mask)
    expect(r.blueDelta).toBeLessThan(25)
    expect(r.blueOK).toBe(false)
  })

  it('不透明盖住路面时，细节低于 70%', () => {
    const render = solid(w, h, (x, y) => [40 + (x % 3), 70, 140 + (y % 2)])
    const r = evaluateGlow(render, photo, w, h, mask)
    expect(r.contrastRatio).toBeLessThan(0.7)
    expect(r.contrastOK).toBe(false)
  })
})
