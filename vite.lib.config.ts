import { defineConfig } from 'vite'
import { resolve } from 'path'

// 库模式构建：核心包 + React 包装，输出 ESM + UMD
export default defineConfig({
  build: {
    outDir: 'dist',
    minify: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'umd'],
      name: 'NaviArrow',
      fileName: (format) => (format === 'es' ? 'navi-arrow.js' : 'navi-arrow.umd.cjs'),
    },
    rollupOptions: {
      external: ['three', 'react', 'react-dom'],
      output: {
        globals: {
          three: 'THREE',
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
})
