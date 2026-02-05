import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
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
