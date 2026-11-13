/**
 * React 薄包装 <NaviArrow />
 *
 * 核心组件通过 attachShadow 隔离样式与 UI。React 会把传给 <NaviArrow> 的子节点
 * 同步写进挂载节点；若挂载节点被清空（attachShadow 前），shadow root 会失效。
 * 因此这里挂载点放在一层不参与 React 子节点渲染的容器里（无子节点），
 * 同时用 stateKey 在禁用 shadow 时也保持稳定。
 */
import { createElement, useEffect, useRef } from 'react'
import { NaviArrowCore } from './core'
import type { NaviArrowOptions, BannerConfig, FooterConfig } from './config'

export interface NaviArrowProps extends NaviArrowOptions {
  className?: string
  style?: Record<string, any>
  /** 点击底部「退出」 */
  onExit?: () => void
  /** 点击底部「地图」 */
  onMap?: () => void
  /** 拿到实例，可直接调用 setBanner / setFooter / update 等 */
  onReady?: (core: NaviArrowCore) => void
}

export type NaviArrowHandle = NaviArrowCore

export function NaviArrow(props: NaviArrowProps) {
  const { className, style, onExit, onMap, onReady, ...options } = props
  const mountRef = useRef<HTMLDivElement>(null)
  const coreRef = useRef<NaviArrowCore | null>(null)
  const cbRef = useRef({ onExit, onMap })
  cbRef.current = { onExit, onMap }

  useEffect(() => {
    const core = new NaviArrowCore(mountRef.current!, options)
    coreRef.current = core
    core.onFooterButton((act) => (act === 'exit' ? cbRef.current.onExit?.() : cbRef.current.onMap?.()))
    onReady?.(core)
    return () => {
      core.destroy()
      coreRef.current = null
    }
    // 只在挂载时创建；后续变化走实例方法
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 属性变化 → 增量更新
  const bannerKey = JSON.stringify(options.banner ?? null)
  const footerKey = JSON.stringify(options.footer ?? null)
  const routeKey = JSON.stringify(options.route ?? null)
  useEffect(() => { coreRef.current?.setBanner((options.banner ?? null) as BannerConfig | null) }, [bannerKey])
  useEffect(() => { coreRef.current?.setFooter((options.footer ?? null) as FooterConfig | null) }, [footerKey])
  useEffect(() => { if (options.route) coreRef.current?.setRoute(options.route) }, [routeKey])
  useEffect(() => { coreRef.current?.setChevrons(!!options.showChevrons) }, [options.showChevrons])

  return createElement('div', {
    ref: mountRef,
    className,
    style: { position: 'relative', width: '100%', height: '100%', ...style },
  })
}
