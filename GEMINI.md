# navi-arrow - AR 步行导航引导组件
TypeScript + Three.js (ShaderMaterial + EffectComposer HDR Bloom) + Shadow DOM + Vite + Vitest

<directory>
src/ - 核心渲染、几何内核、GLSL 着色器、地平线校准、UI 浮层与框架适配（10 个源码文件）
demo/ - 街景/医院/相机实景演示页与 lil-gui 实时调参入口
tests/ - 几何、地平线校准、底边兜底、箭头朝向、横幅适配与光效指标单测
scripts/ - Playwright 自动化截图、对比拼图与像素光效验收脚本
reference/ - DJI AR 返航视频帧与百度 AR 步导参考图
docs/ - 对比验收图与运行报告
</directory>

<config>
package.json - 构建脚本（build:lib / build:demo / test / dev）与依赖声明
tsconfig.json - 全量 TypeScript 编译配置（src / demo / tests）
tsconfig.types.json - 库产物声明文件（dist/types）生成配置
vite.lib.config.ts - 核心库 ESM + UMD 打包配置
vite.react.config.ts - React 包装层打包配置
vitest.config.ts - 单元测试配置
</config>

[PROTOCOL]: Update this header on change, then check GEMINI.md
