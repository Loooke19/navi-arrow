# 返工：推翻第一版，按指定技术栈重做 navi-arrow

用简体中文汇报，最后总结也用中文。PROMPT.md 里的目标、参考图和交付要求仍然有效，本文件优先级更高。

## 第一版的问题（docs/compare 里的截图）
1. 光幕做成了一整片**平铺在地上的不透明蓝色路面**，完全不对。大疆是**竖直立起来的、有高度的、半透明光幕**，像沿路线挂下来的一道光帘，有明显的 3D 立体感和透视。
2. 顶部横幅被裁掉一截，文字灰色看不清，没有百度那种蓝色渐变胶囊。
3. 底部条少了「地图」按钮；背景是灰色程序占位图，看不出 AR 效果。
4. 没有真正和参考帧做并排对比就宣称完成。

## 指定技术栈（必须照用）
- **Vite + TypeScript**，库模式输出 ESM/UMD/d.ts（保留）。
- **three.js（最新稳定版）原生 API**做 3D 层，不用 React Three Fiber（组件要框架无关）。
- 路线几何：用 `THREE.CatmullRomCurve3` 把路线点平滑成曲线，按弧长等距采样，**自己生成 BufferGeometry**：
  1. **光幕 Curtain**：沿曲线生成一条竖直的带状网格（每个采样点上下两个顶点：底边 y=0 贴地，顶边 y=curtainHeight，默认 0.6m，可配置），uv.x = 沿路线弧长归一化，uv.y = 高度。
  2. **顶边亮线**：沿曲线顶边用 `TubeGeometry`（半径约 0.015m）或 `Line2/LineMaterial` 粗线，做成发光实线，让光幕有"上沿"。
  3. **地面光迹**：光幕底部贴地一条很窄（约 0.25m）的半透明发光带，增强"立在地上"的感觉。
  4. 可选 **3D 立体 V 形箭头**：用 `ExtrudeGeometry` 挤出有厚度的 V 形（带倒角），亮面/暗面两种明度，沿路线排列。
- 材质：光幕用 **自定义 ShaderMaterial**，`transparent: true`、`depthWrite: false`、`side: DoubleSide`、`blending: AdditiveBlending`。shader 里实现：
  - 竖直渐变：顶部最亮（α≈0.7），往下逐渐透明（底部 α≈0.15），模仿大疆光帘；
  - 细横向扫描线：`step/fract(uv.y * 线数)`，线数可配，默认约 40；
  - 菲涅尔/边缘光：视线与法线夹角越大越亮；
  - 距离渐隐：按相机距离 fog 式衰减到 0；
  - 流动光：一条亮带沿 uv.x 往前方循环移动（2.5s 一圈），叠加在光幕和顶边线上；
  - 生长动画：uniform `uReveal` 0→1，从近到远显现（600ms ease-out）。
- 发光：`EffectComposer` + `UnrealBloomPass`（或 pmndrs `postprocessing` 的 SelectiveBloom），只让光幕、顶边线、箭头发光；渲染器 `alpha: true` 透明叠加在相机画面上，注意 bloom 在透明背景下也要正确（必要时自定义合成）。
- 相机：`PerspectiveCamera`，眼高 1.6m、FOV 约 60°，略微俯视，路线在画面中下部伸向远处并转弯。
- UI 层：Shadow DOM 内原生 HTML/CSS（保留思路），按 390×844 竖屏严格还原 `reference/baidu-banner-ar.png`：顶部完整的蓝色渐变胶囊横幅、白色清晰文字、底部条含「退出」「地图」两个按钮。
- 调参面板：demo 页加 `lil-gui`，可实时调颜色、高度、透明度、扫描线密度、流动速度、bloom 强度。
- 背景：demo 默认用一张**真实的人行道/街道实拍照片**（自行下载一张免版权图放到 demo/assets，并在 README 注明来源），摄像头可选开启。
- 截图对比：用 **Playwright**（`npx playwright` 无头 Chromium，开启 WebGL）按 390×844 自动截 demo，存 `docs/compare/`，和 `reference/dji-frames/f_10.jpg`、`f_31.jpg`、`reference/baidu-banner-ar.png` 拼成并排对比图。

## 验收标准（自己逐条对照，不满足就继续改）
- 一眼看上去：一道**竖直、半透明、发光、有高度的蓝色光帘**沿路面延伸、转弯、远处变窄渐隐，顶部有一条亮线，表面有细横纹，在流动。
- 光帘是立体的：从侧面拖拽视角能看出它是立起来的一面墙，不是地面贴图。
- 横幅、底部条与百度截图在布局、颜色、字号上一致，文字完整清晰。
- 帧率：桌面 60fps，`destroy()` 释放全部 GPU 资源。
- 原有 API（createNaviArrow / `<navi-arrow>` / React 包装）和测试保留并通过。

## 收尾
提交并 push 到 Loooke19/navi-arrow，然后运行：`notify-grokbot "<中文总结：重做内容、技术栈、怎么跑、对比图路径、仍有差异的地方>"`
