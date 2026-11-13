# navi-arrow

可嵌入的 **AR 步行导航引导组件**：视觉 = 大疆 DJI Fly「AR 返航」光幕路线（改为蓝色）+ 百度地图 AR 步导的顶部横幅/底部信息条。

- 光幕（ribbon/curtain）：沿路线竖直挂下的半透明薄纱光幕（去饱和浅蓝 #7FB8FF，自定义 BufferGeometry 竖直侧面网格 + ShaderMaterial：竖直渐变 α0.45→0.05、8~14 条高对比横向扫描线、菲涅尔边缘光、~80m 距离渐隐、流动亮带、600ms 生长动画，AdditiveBlending），顶边细 TubeGeometry 亮线（r=0.008m），底部贴地窄光迹，可选贴地低透明 3D V 形箭头；EffectComposer + UnrealBloomPass（低强度、高阈值，只给顶线和流动带发光）+ 自定义 alpha 保留 pass 保证透明背景正确。路线起点在脚前 1.5m 贴地，光幕从画面底边进入。
- 顶部横幅：百度风格圆角胶囊，圆形图标位 + 「20米后 进入 无名路」，蓝色渐变半透明毛玻璃、向右渐隐，文字切换上滑淡入，右上角可选「AR设置」按钮。
- 底部信息条：「剩余7.9公里 1小时47分钟」，左「退出」右「地图」，可配置/隐藏。
- 技术栈：TypeScript + Three.js（自定义 ShaderMaterial）+ 原生 DOM/CSS（Shadow DOM 隔离）。

## 安装

```bash
npm install navi-arrow three
```

## 最小嵌入示例

### 原生 / Web Component

```html
<script type="module">
  import { createNaviArrow } from 'navi-arrow'

  const navi = createNaviArrow(document.getElementById('navi'), {
    route: [[0, 0], [0, -14], [7, -22], [7, -34]],   // 局部坐标（米），[x, z] 或 [x, y, z]
    curtainHeight: 0.4,        // 光幕顶边离地高度
    curtainWidth: 0.85,        // 光幕半宽
    banner: { distance: '20米后', action: '进入', road: '无名路' },
    footer: { enabled: true, distance: '剩余7.9公里', duration: '1小时47分钟' },
  })

  // 组件不负责相机：把外部 AR 引擎/设备方向的位姿喂进来
  navi.setCameraPose(position, quaternion)
  // autoRender: false 时每帧调用
  navi.render()
</script>

<!-- 或声明式 -->
<navi-arrow route='[[0,0],[0,-14],[7,-22]]' banner-distance="20米后" banner-road="无名路"></navi-arrow>
```

### React

```tsx
import { NaviArrow } from 'navi-arrow/react'

<NaviArrow
  route={[[0, 0], [0, -14], [7, -22]]}
  banner={{ distance: '20米后', action: '进入', road: '无名路' }}
  footer={{ enabled: true, distance: '剩余7.9公里', duration: '1小时47分钟' }}
  onExit={() => {}}
  onMap={() => {}}
/>
```

## 配置项

| 项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `route` | `[x,z][]` / `[x,y,z][]` / `{points}` | 必填 | 路线（局部坐标，米，y 向上） |
| `curtainHeight` | number | `0.4` | 光幕顶边离地高度（米） |
| `curtainWidth` | number | `0.8` | 光幕底部半宽（米） |
| `theme` | `{primary, highlight, nearOpacity, farOpacity}` | 蓝色主题 | 颜色主题（默认 `#2F7BFF`） |
| `flowSpeed` | number | `2.5` | 流动亮带循环周期（秒） |
| `banner` | `BannerConfig` | - | 横幅：`distance` / `action` / `road` / `iconUrl` / `iconChar` / `showSettings` |
| `footer` | `FooterConfig` | - | 底部：`enabled` / `distance` / `duration` / `arrival` / `exitLabel` / `mapLabel` |
| `showChevrons` | boolean | `false` | 地面 V 形引导箭头（默认关） |
| `chevronCount` | number | `3` | V 形箭头数量 |
| `autoRender` | boolean | `true` | 自动渲染循环；外部相机驱动时设 `false` 并每帧调 `render()` |
| `visible` | boolean | `true` | 初始是否显示 |

## 实例方法

- `setRoute(route)` 替换路线
- `setBanner(banner | null)` 更新横幅（带上滑淡入过渡）
- `setFooter(footer | null)` 更新底部条
- `setChevrons(enabled)` 开关 V 形箭头
- `setCameraPose(position, quaternion)` 外部 AR 位姿输入
- `onFooterButton((act: 'exit' | 'map') => void)` / `onSettings(() => void)` 按钮回调
- `show()` / `hide()` / `render()` / `destroy()`（正确释放全部 WebGL 资源）

## 运行演示

```bash
npm install
npm run dev        # http://localhost:5173
```

演示页有两个背景模式按钮（组件外演示 chrome）：**「街景照片」**（默认，免版权 Unsplash 实拍图 `demo/assets/street.jpg`）和**「相机实景」**（`getUserMedia` 后置摄像头全屏视频，光幕/UI 叠加其上；权限被拒/无摄像头/非安全上下文时提示中文错误并回退照片模式，切回时停止媒体轨道）。真机可用 DeviceOrientation 让路线随手机姿态变化（lil-gui「随设备转动」开关 +「俯仰角」手动滑杆）。桌面端按住拖拽模拟转头，右侧 lil-gui 可实时调颜色、光幕高度/宽度/透明度、扫描线密度、流动速度、bloom 强度、俯仰角、V 形箭头。支持 `?t=秒` 快进、`?shot=1` 截图模式。

**手机局域网测试（摄像头必须 HTTPS）：**

```bash
npm run dev:https   # 或 dev:https:strict
# 终端会打印 Network: https://192.168.x.x:5173/
```

手机连同一 Wi-Fi，浏览器打开该 https 地址 → 接受自签名证书警告 → 点「相机实景」授权摄像头。

组件本身保持 `background: 'transparent'`（默认）：不渲染任何背景，宿主页面可在 canvas 后面放任意 `<video>`/图片/AR 引擎画面。

## 截图对比

`scripts/shot.mjs`（Playwright 无头 Chromium，390×844，WebGL 开启）自动截 demo 存入 `docs/compare/`；`scripts/grid.mjs` 生成与 `reference/dji-frames/f_10.jpg`、`f_31.jpg`、`reference/baidu-banner-ar.png` 的并排对比图 `docs/compare/compare-grid.png`；`scripts/verify.mjs` 验证 60fps 与资源释放。

## 构建 / 测试

```bash
npm run build      # Vite 库模式：dist/ ESM + UMD + d.ts（核心 + React 包装）
npm test           # Vitest：配置合并、路线几何生成
```

## 目录

- `src/` 核心包（config / route / shader / core / element / react / ar）
- `demo/` 演示页（含 `assets/street.jpg` 免版权街景背景）
- `scripts/` Playwright 截图 / 拼图 / 验收脚本
- `tests/` 单元测试
- `docs/compare/` 演示页截图与参考帧并排对比图
- `reference/` 视觉参考素材（大疆 AR 返航逐帧、百度 AR 步导截图）
