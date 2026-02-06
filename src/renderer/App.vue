/**
 * PhotoMind - 应用根组件
 * 反AI味 · 现代极简主义设计
 */
<template>
  <n-config-provider :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-loading-bar-provider>
      <n-message-provider>
        <n-notification-provider>
          <n-dialog-provider>
            <div class="app-container">
              <!-- 全局导航栏 -->
              <GlobalNav />

              <!-- 页面内容 -->
              <router-view v-slot="{ Component }">
                <transition name="fade" mode="out-in">
                  <component :is="Component" />
                </transition>
              </router-view>
            </div>
          </n-dialog-provider>
        </n-notification-provider>
      </n-message-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { reactive, defineAsyncComponent } from 'vue'
import { zhCN, dateZhCN } from 'naive-ui'

// 异步加载全局导航组件
const GlobalNav = defineAsyncComponent(() =>
  import('./components/nav/GlobalNav.vue')
)

// Naive UI 主题覆盖 - 使用新的设计令牌
const themeOverrides = reactive({
  common: {
    // 主色调 - 苹果蓝（取代AI味紫蓝）
    primaryColor: '#0071E3',
    primaryColorHover: '#0077ED',
    primaryColorPressed: '#0068D1',
    primaryColorSuppl: '#E8F4FD',

    // 文字色
    textColorBase: '#1A1A1A',
    textColor1: '#1A1A1A',
    textColor2: '#6E6E73',
    textColor3: '#A1A1A6',

    // 背景色
    bodyColor: '#F5F5F7',
    cardColor: '#FFFFFF',
    modalColor: '#FFFFFF',
    popoverColor: '#FFFFFF',

    // 边框色
    borderColor: 'rgba(0, 0, 0, 0.05)',
    dividerColor: 'rgba(0, 0, 0, 0.05)',

    // 圆角
    borderRadius: '12px',
    borderRadiusSmall: '8px',
    borderRadiusMedium: '12px',
    borderRadiusLarge: '16px',

    // 字体
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontWeight: '400',
    fontWeightStrong: '600',

    // 阴影
    boxShadow1: '0 1px 2px rgba(0, 0, 0, 0.04)',
    boxShadow2: '0 4px 12px rgba(0, 0, 0, 0.05)',
    boxShadow3: '0 12px 36px rgba(0, 0, 0, 0.08)',
  },

  // 按钮样式
  Button: {
    borderRadiusMedium: '12px',
    borderRadiusSmall: '8px',
    fontWeight: '500',
  },

  // 卡片样式
  Card: {
    borderRadius: '16px',
    paddingMedium: '24px',
    paddingLarge: '32px',
  },

  // 输入框样式
  Input: {
    borderRadius: '12px',
    heightMedium: '44px',
  },

  // 模态框样式
  Modal: {
    borderRadius: '20px',
  },

  // 对话框样式
  Dialog: {
    borderRadius: '20px',
  },
})
</script>

<style>
/* 导入设计令牌 */
@import './styles/design-tokens.css';

/* ================================
   基础样式重置
   ================================ */
*, *::before, *::after {
  box-sizing: border-box;
}

html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  font-family: var(--font-family);
  background: var(--bg-primary);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-container {
  height: 100%;
  width: 100%;
  overflow-x: hidden;
}

/* ================================
   页面过渡动画
   ================================ */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ================================
   滚动条样式 - 极简风格
   ================================ */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

/* 暗色模式下滚动条 */
@media (prefers-color-scheme: dark) {
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
  }

  ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }
}

/* ================================
   选择文本样式
   ================================ */
::selection {
  background: rgba(0, 113, 227, 0.2);
  color: inherit;
}

/* ================================
   图片加载占位
   ================================ */
img {
  background: linear-gradient(135deg, #f5f5f7 0%, #e8e8ed 100%);
}
</style>
