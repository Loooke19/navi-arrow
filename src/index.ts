export { createNaviArrow, NaviArrowCore } from './core'
export { NaviArrowElement, defineNaviArrow } from './element'
export { DEFAULT_THEME, mergeOptions } from './config'
export type { NaviArrowOptions, NaviTheme, BannerConfig, FooterConfig } from './config'
export { buildRouteGeometry, buildBandGeometry, buildEdgeLinePoints, buildRailGeometry, normalizeRoute, pointAtDistance } from './route'
export type { RouteGeometry } from './route'

import { defineNaviArrow } from './element'
defineNaviArrow()
