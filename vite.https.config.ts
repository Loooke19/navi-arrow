import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// 手机局域网 HTTPS 调试：npm run dev:https:strict
export default defineConfig({
  root: 'demo',
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
  },
})
