import { defineConfig, type UserConfig } from 'vite'

// demo 默认配置（http）；dev:https:strict 用 vite.https.config.ts（basic-ssl）
export default defineConfig({
  root: 'demo',
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
  server: { port: 5173, strictPort: true },
} satisfies UserConfig)
