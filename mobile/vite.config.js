import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 8880,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:6521',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  build: {
    define: {
      'import.meta.env.VITE_APP_API_URL': JSON.stringify('/api')
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
})
