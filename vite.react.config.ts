import { defineConfig } from 'vite'
import { resolve } from 'path'

// React 包装单独构建（ESM）
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: resolve(__dirname, 'src/react.ts'),
      formats: ['es'],
      fileName: () => 'react.js',
    },
    rollupOptions: {
      external: ['three', 'react', 'react-dom', './core'],
    },
  },
})
