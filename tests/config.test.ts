import { describe, it, expect } from 'vitest'
import { mergeOptions, DEFAULT_THEME } from '../src/config'

describe('mergeOptions', () => {
  it('返回新对象，不修改入参', () => {
    const base = { a: 1, nested: { x: 1, y: 2 } }
    const out = mergeOptions(base, { a: 2 })
    expect(out.a).toBe(2)
    expect(base.a).toBe(1)
    expect(out).not.toBe(base)
  })

  it('嵌套对象深合并，数组整体替换', () => {
    const base = { theme: { ...DEFAULT_THEME }, route: [[0, 0], [1, 0]] as any }
    const out = mergeOptions<any>(base, { theme: { primary: '#000000' }, route: [[2, 2]] as any })
    expect(out.theme.primary).toBe('#000000')
    expect(out.theme.highlight).toBe(DEFAULT_THEME.highlight)
    expect(out.route).toEqual([[2, 2]])
  })

  it('override 为 undefined 时复制基础配置', () => {
    const base = { banner: { distance: '20米后' } }
    expect(mergeOptions(base)).toEqual(base)
  })
})
