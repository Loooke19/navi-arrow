/**
 * [INPUT]: none (foundational type and default configuration module)
 * [OUTPUT]: provides NaviTheme, BannerConfig, FooterConfig, NaviArrowOptions, DEFAULT_THEME, and mergeOptions
 * [POS]: configuration schema and default theme tokens within src/, consumed by core, element, react, and demo
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */

/** 默认蓝色主题（通透亮蓝主色 + 冰青白顶脊高光） */
export interface NaviTheme {
  /** 光幕主色 */
  primary: string
  /** 顶脊与边缘高光色 */
  highlight: string
  /** 近处发光/不透明度基准倍率 */
  nearOpacity: number
  /** 远处衰减保留比例 */
  farOpacity: number
}

export const DEFAULT_THEME: NaviTheme = {
  primary: '#2F88FF',
  highlight: '#8FD8FF',
  nearOpacity: 1,
  farOpacity: 0.35,
}

export interface BannerConfig {
  /** 距离文本，如「20米后」 */
  distance?: string
  /** 动作描述，如「右转 进入」 */
  action?: string
  /** 道路/目标名，如「无名路」 */
  road?: string
  /** 左侧图标 URL（机器人头像位），不传用默认转向图标 */
  iconUrl?: string
  /** 图标字符（emoji / 文本），iconUrl 优先 */
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
  /** 背景模式：'transparent'（默认，宿主自备任意背景/视频）| 'none'（同 transparent） */
  background?: 'transparent' | 'none'
  /** 路线：局部坐标点数组（世界坐标米），y 向上；或 {points} 路径对象 */
  route?: Array<[number, number, number] | [number, number]> | { points: Array<[number, number, number] | [number, number]> }
  /** 竖直光幕顶脊高度（米），默认 0.42。弯道处按曲率自动微抬展开体积 */
  curtainHeight?: number
  /** 路线通道净宽（米），默认 1.25 */
  curtainWidth?: number
  /** 颜色主题 */
  theme?: Partial<NaviTheme>
  /** 流动动效循环周期（秒），默认 2.6 */
  flowSpeed?: number
  /** 顶部横幅内容 */
  banner?: BannerConfig
  /** 底部信息条 */
  footer?: FooterConfig
  /** 是否显示地面 V 形引导箭头（默认关） */
  showChevrons?: boolean
  /** V 形箭头数量，默认 3 */
  chevronCount?: number
  /** 是否自动驱动渲染循环；设 false 时由外部每帧调用 render() */
  autoRender?: boolean
  /** 初始是否显示光幕 */
  visible?: boolean
}

/** 合并配置（浅合并 + 嵌套对象合并），返回新对象不修改入参 */
export function mergeOptions<T extends Record<string, any>>(base: T, override?: Partial<T>): T {
  if (!override) return { ...base }
  const out: Record<string, any> = { ...base }
  for (const k of Object.keys(override)) {
    const v = (override as Record<string, any>)[k]
    const b = out[k]
    if (
      v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)
      && b !== null && b !== undefined && typeof b === 'object' && !Array.isArray(b)
    ) {
      out[k] = mergeOptions(b, v)
    } else {
      out[k] = v
    }
  }
  return out as T
}
