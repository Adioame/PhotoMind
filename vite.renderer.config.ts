import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      // @ 别名指向 src/renderer
      '@': resolve(__dirname, 'src/renderer'),
      '@/stores': resolve(__dirname, 'src/renderer/stores'),
      '@/components': resolve(__dirname, 'src/renderer/components'),
      '@/views': resolve(__dirname, 'src/renderer/views'),
      '@/composables': resolve(__dirname, 'src/renderer/composables')
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    }
  },
  build: {
    target: 'es2020',
    outDir: '.vite/renderer/main_window',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html')
      }
    }
  },
  optimizeDeps: {
    include: [
      'naive-ui',
      'vueuc/lib/css',
      '@css-render/vue3-ssr'
    ]
  }
})
