import { defineConfig, type UserConfig } from 'vite'
import type { Plugin } from 'vite'

// demo 默认配置；dev:https:strict 用 vite.https.config.ts（basic-ssl）
let plugins: Plugin[] = []
try {
  // 可选依赖：仅 dev:https 需要
  const mod = await import('@vitejs/plugin-basic-ssl')
  plugins = [mod.default()] as any
} catch {
  // 未安装时跳过
}

export default defineConfig({
  root: 'demo',
  plugins,
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
  server: { port: 5173 },
} satisfies UserConfig)
