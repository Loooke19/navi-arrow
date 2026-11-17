# src/
> L2 | Parent: /GEMINI.md

Member list
index.ts: 公开包入口，导出 createNaviArrow、NaviArrowCore、NaviArrowElement、几何构建器并自动注册 <navi-arrow>
config.ts: 主题与配置 schema（NaviTheme、BannerConfig、FooterConfig、NaviArrowOptions、DEFAULT_THEME、mergeOptions）
core.ts: 核心编排器 NaviArrowCore，管理 HDR MSAA EffectComposer、Bloom、相机同步、立体光幕/地面光晕/双层箭头渲染与资源释放
route.ts: 几何内核，负责路径归一化、近端底边延伸、连续 U 型圆弧光幕（CURTAIN_TOP_HEADROOM=1.04）与地面漫散衬底（GROUND_OUTER_FEATHER=1.32）构建
shader.ts: GLSL 着色器层，实现竖直薄纱光幕、羽化地面柔光、百度风格双层圆角 V 箭头与 HDR 亮/暗背景自适应合成
horizon.ts: 纯地平线校准数学，处理 object-fit:cover 裁剪换算、相机 pitch 反推与路线上限投影校验
ui.ts: Shadow DOM 表现层 NaviOverlayUI，渲染百度风格顶部横幅胶囊、AR 设置按钮与底部信息条
element.ts: Web Component 适配器 NaviArrowElement 与 defineNaviArrow
react.ts: React 薄包装组件 <NaviArrow />，负责挂载点隔离与属性增量同步
ar.ts: AR 相机输入助手，提供 DeviceOrientationRig、桌面拖拽视角与 getUserMedia 摄像头启动

[PROTOCOL]: Update this header on change, then check GEMINI.md
