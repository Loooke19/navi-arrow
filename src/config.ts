/**
 * navi-arrow 主题与配置
 */

/** 默认蓝色主题（向百度亮蓝靠） */
export interface NaviTheme {
  /** 光幕主色 */
  primary: string
  /** 顶边描边高光色（偏白亮） */
  highlight: string
  /** 近处填充不透明度 */
  nearOpacity: number
  /** 远处填充不透明度（趋近 0 渐隐） */
  farOpacity: number
}

export const DEFAULT_THEME: NaviTheme = {
  primary: '#7FB8FF',
  highlight: '#B8D9FF',
  nearOpacity: 0.45,
  farOpacity: 0.02,
}

export interface BannerConfig {
  /** 距离文本，如「20米后」 */
  distance?: string
  /** 动作 + 道路名，如「进入 无名路」 */
  action?: string
  road?: string
  /** 左侧图标 URL（机器人头像位），不传用默认转向图标 */
  iconUrl?: string
  /** 图标字符（emoji / svg 内联），iconUrl 优先 */
  iconChar?: string
  /** 是否显示右上角「AR设置」按钮 */
  showSettings?: boolean
}

export interface FooterConfig {
  enabled?: boolean
  /** 如「剩余7.9公里」 */
  distance?: string
  /** 如「1小时47分钟」 */
  duration?: string
  /** 到达时间，如「18:26到达」（可选） */
  arrival?: string
  exitLabel?: string
  mapLabel?: string
}

export interface NaviArrowOptions {
  /** 背景模式：'transparent'（默认，宿主自备任意背景/视频）| 'none'（同 transparent，兼容旧用法） */
  background?: 'transparent' | 'none'
  /** 路线：局部坐标点数组（世界坐标米），y 向上；或 {points, heights} 3D 路径 */
  route?: Array<[number, number, number] | [number, number]> | { points: Array<[number, number, number] | [number, number]> }
  /** 光幕顶边离地高度（米），默认 0.4 */
  curtainHeight?: number
  /** 光幕底部半宽（米），默认 0.8 */
  curtainWidth?: number
  /** 颜色主题 */
  theme?: Partial<NaviTheme>
  /** 流动动效循环周期（秒），默认 2.5 */
  flowSpeed?: number
  /** 顶部横幅内容 */
  banner?: BannerConfig
  /** 底部信息条 */
  footer?: FooterConfig
  /** 是否显示地面 V 形引导箭头（默认关） */
  showChevrons?: boolean
  /** V 形箭头数量，默认 3 */
  chevronCount?: number
  /** 是否自动驱动渲染循环；设 false 时由外部调用 render()（配合外部相机位姿） */
  autoRender?: boolean
  /** 初始是否显示光幕 */
  visible?: boolean
}

/** 合并配置（浅合并 + 嵌套对象合并），供测试 */
export function mergeOptions<T extends Record<string, any>>(base: T, override?: Partial<T>): T {
  if (!override) return { ...base }
  const out: Record<string, any> = { ...base }
  for (const k of Object.keys(override)) {
    const v = (override as Record<string, any>)[k]
    const b = out[k]
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)
      && b !== null && b !== undefined && typeof b === 'object' && !Array.isArray(b)) {
      out[k] = mergeOptions(b, v)
    } else {
      out[k] = v
    }
  }
  return out as T
}
