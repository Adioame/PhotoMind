/**
 * PhotoMind - Vue 应用入口
 */
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import naiveUi from 'naive-ui'
import App from './App.vue'
import router from './router'

// 全局样式
import './styles/global.css'

// 加载 Embedding API（用于混合架构向量生成）
import './embeddingAPI'

// 全局扫描状态管理器 - 在应用启动时初始化
import { useScanStore } from './stores/scanStore'

const app = createApp({
  setup() {
    return () => h(App)
  }
})

const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(naiveUi)

// 初始化全局扫描状态管理器
// 在 Pinia 创建后立即初始化，确保 IPC 监听器只注册一次
const scanStore = useScanStore(pinia)
console.log('[Main] 全局扫描状态管理器已初始化:', {
  state: scanStore.state,
  isScanning: scanStore.isScanning
})

// 挂载应用
app.mount('#app')
