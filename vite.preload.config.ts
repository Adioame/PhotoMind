import { defineConfig } from 'vite'
import { resolve } from 'path'
import { builtinModules } from 'module'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'electron'),
    },
    conditions: ['node'],
  },
  build: {
    target: 'node20',
    outDir: '.vite/build/preload',
    lib: {
      entry: resolve(__dirname, 'electron/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'electron',
        '@electron-forge/plugin-vite/runtime',
        ...builtinModules,
      ],
    },
  },
})
