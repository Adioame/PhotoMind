import { defineConfig } from 'vite'
import { resolve } from 'path'
import { builtinModules } from 'module'

const allBuiltinModules = [...builtinModules, ...builtinModules.map(m => `node:${m}`)]

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
    outDir: '.vite/build/main',
    lib: {
      entry: resolve(__dirname, 'electron/main/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'electron',
        '@electron-forge/plugin-vite/runtime',
        // Native modules that should not be bundled
        'canvas',
        'sql.js',
        'sharp',
        '@img/sharp-darwin-arm64',
        // ONNX runtime variants
        'onnxruntime-node',
        'onnxruntime-web',
        'onnxruntime-common',
        // TensorFlow variants - all should be external
        '@tensorflow/tfjs',
        '@tensorflow/tfjs-node',
        '@tensorflow/tfjs-backend-cpu',
        '@tensorflow/tfjs-core',
        '@tensorflow/tfjs-backend-webgl',
        '@tensorflow/tfjs-backend-webgpu',
        '@tensorflow/tfjs-converter',
        '@tensorflow/tfjs-data',
        '@tensorflow/tfjs-layers',
        // Face API
        '@vladmandic/face-api',
        // Transformers
        '@xenova/transformers',
        // All .node files
        /\.node$/,
        // Node.js built-ins (including node: prefix variants)
        ...allBuiltinModules,
      ],
      output: {
        inlineDynamicImports: false,
        // Preserve external module imports
        format: 'es',
      },
    },
    // Don't minify to make debugging easier
    minify: false,
    sourcemap: true,
  },
  // Optimize dependencies for Node.js environment
  optimizeDeps: {
    exclude: [
      'electron',
      'canvas',
      'sharp',
      'onnxruntime-node',
      'onnxruntime-web',
      '@tensorflow/tfjs-node',
      '@vladmandic/face-api',
      '@xenova/transformers',
    ],
  },
})
