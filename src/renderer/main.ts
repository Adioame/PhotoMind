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

const app = createApp({
  setup() {
    return () => h(App)
  }
})

const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(naiveUi)

// 挂载应用
app.mount('#app')
