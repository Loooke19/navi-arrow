/**
 * [INPUT]: depends on ./core, ./element, ./config, and ./route
 * [OUTPUT]: exports createNaviArrow, NaviArrowCore, NaviArrowElement, defineNaviArrow, DEFAULT_THEME, mergeOptions, geometry builders, and TypeScript types; registers <navi-arrow>
 * [POS]: public package entry point of src/, exposing imperative API and Web Component registration
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
export { createNaviArrow, NaviArrowCore } from './core'
export type { NaviArrowParams } from './core'
export { NaviArrowElement, defineNaviArrow } from './element'
export { DEFAULT_THEME, mergeOptions } from './config'
export type { NaviArrowOptions, NaviTheme, BannerConfig, FooterConfig } from './config'
export {
  buildRouteGeometry,
  buildVolumetricCurtainGeometry,
  buildBandGeometry,
  buildEdgeLinePoints,
  buildRailGeometry,
  buildChannelGeometry,
  normalizeRoute,
  pointAtDistance,
} from './route'
export type { RouteGeometry, VolumetricCurtainMeshes } from './route'

import { defineNaviArrow } from './element'
defineNaviArrow()
