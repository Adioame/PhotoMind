import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// 开发环境 CSP 配置
const devCSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  'img-src': ["'self'", "data:", "blob:", "https:"],
  'font-src': ["'self'", "https://fonts.gstatic.com"],
  'connect-src': ["'self'", "http://localhost:*", "https://huggingface.co", "https://cdn.jsdelivr.net"]
}

// 生产环境 CSP 配置
const prodCSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  'img-src': ["'self'", "data:", "blob:"],
  'font-src': ["'self'", "https://fonts.gstatic.com"]
}

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      // @ 别名指向 src/renderer，因为这是主要的源码目录
      '@': resolve(__dirname, 'src/renderer'),
      // 为了向后兼容，也支持 src 下的路径
      '@/stores': resolve(__dirname, 'src/renderer/stores'),
      '@/components': resolve(__dirname, 'src/renderer/components'),
      '@/views': resolve(__dirname, 'src/renderer/views'),
      '@/composables': resolve(__dirname, 'src/renderer/composables')
    }
  },
  server: {
    port: 5177,
    strictPort: false
  },
  build: {
    target: 'es2020',
    outDir: 'dist-renderer'
  },
  optimizeDeps: {
    include: [
      'naive-ui',
      'vueuc/lib/css',
      '@css-render/vue3-ssr'
    ]
  }
})
