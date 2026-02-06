<!--
  PhotoMind Global Navigation
  全局导航栏 - 反AI味设计

  设计要点：
  1. 玻璃拟态效果
  2. 移除紫蓝渐变，使用单色 Logo
  3. 增加高度至 64px 创造呼吸感
  4. 柔和的悬停效果
-->
<template>
  <header
    class="global-nav"
    :class="{ 'global-nav--dark': isDarkPage }"
  >
    <div class="nav-container">
      <!-- Logo -->
      <div class="nav-logo" @click="goHome" title="返回首页">
        <div class="logo-icon">
          <n-icon size="24" color="#FFFFFF">
            <Image24Regular />
          </n-icon>
        </div>
        <span class="logo-text">PhotoMind</span>
      </div>

      <!-- 主导航 -->
      <nav class="nav-items">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
        >
          <n-icon class="nav-icon" size="20">
            <component :is="item.icon" />
          </n-icon>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>

      <!-- 右侧操作区 -->
      <div class="nav-actions">
        <!-- 导入按钮 -->
        <n-button
          quaternary
          circle
          size="large"
          :type="isDarkPage ? 'default' : 'primary'"
          @click="handleImport"
          title="导入照片"
          class="action-btn"
        >
          <template #icon>
            <n-icon size="20"><Add24Regular /></n-icon>
          </template>
        </n-button>

        <!-- 设置按钮 -->
        <n-button
          quaternary
          circle
          size="large"
          :type="isDarkPage ? 'default' : 'primary'"
          @click="goToSettings"
          title="设置"
          class="action-btn"
        >
          <template #icon>
            <n-icon size="20"><Settings24Regular /></n-icon>
          </template>
        </n-button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Home24Regular,
  Image24Regular,
  Folder24Regular,
  CalendarToday24Regular,
  People24Regular,
  Search24Regular,
  Settings24Regular,
  Add24Regular,
} from '@vicons/fluent'

const route = useRoute()
const router = useRouter()

// 导航项配置
const navItems = [
  { path: '/', label: '首页', icon: Home24Regular },
  { path: '/photos', label: '照片', icon: Image24Regular },
  { path: '/albums', label: '相册', icon: Folder24Regular },
  { path: '/timeline', label: '时间线', icon: CalendarToday24Regular },
  { path: '/people', label: '人物', icon: People24Regular },
  { path: '/search', label: '搜索', icon: Search24Regular },
]

// 检测是否为暗色主题页面
const isDarkPage = computed(() => {
  return route.name === 'PhotoDetail'
    || /^\/photo\/\w+/.test(route.path)
})

// 方法
const isActive = (path: string): boolean => {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(path) && !/^\/photo\/\w+/.test(route.path)
}

const goHome = () => {
  router.push('/')
}

const goToSettings = () => {
  router.push('/settings')
}

const handleImport = () => {
  // 触发导入流程
  window.dispatchEvent(new CustomEvent('open-import-dialog'))
}
</script>

<style scoped>
/* ================================
   导航栏主体 - 玻璃拟态效果
   ================================ */
.global-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 64px;
  z-index: 1000;

  /* 玻璃拟态效果 */
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);

  transition: all 0.3s var(--ease-default);
}

/* 暗色主题变体 */
.global-nav--dark {
  background: rgba(28, 28, 30, 0.72);
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.nav-container {
  max-width: var(--content-max-width);
  height: 100%;
  margin: 0 auto;
  padding: 0 var(--space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ================================
   Logo 区域 - 移除渐变，使用单色
   ================================ */
.nav-logo {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
  transition: opacity var(--duration-fast) var(--ease-default);
}

.nav-logo:hover {
  opacity: 0.8;
}

.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  /* 移除渐变，使用单色 */
  background: var(--primary-default);
  border-radius: var(--radius-md);
  box-shadow: 0 2px 8px rgba(0, 113, 227, 0.25);
}

.logo-text {
  font-size: 20px;
  font-weight: var(--font-bold);
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

.global-nav--dark .logo-text {
  color: var(--text-dark-primary);
}

/* ================================
   导航项 - 柔和的悬停效果
   ================================ */
.nav-items {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex: 1;
  justify-content: center;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-default);
  font-size: var(--text-small);
  font-weight: var(--font-medium);
}

.nav-item:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--primary-subtle);
  color: var(--primary-default);
  font-weight: var(--font-semibold);
}

/* 暗色主题下 */
.global-nav--dark .nav-item {
  color: var(--text-dark-secondary);
}

.global-nav--dark .nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-dark-primary);
}

.global-nav--dark .nav-item.active {
  background: rgba(0, 113, 227, 0.2);
  color: var(--primary-default);
}

/* ================================
   右侧操作区
   ================================ */
.nav-actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  min-width: 100px;
  justify-content: flex-end;
}

.action-btn {
  transition: transform var(--duration-fast) var(--ease-default);
}

.action-btn:hover {
  transform: scale(1.05);
}

.action-btn:active {
  transform: scale(0.95);
}

/* ================================
   响应式设计
   ================================ */
@media (max-width: 1024px) {
  .nav-label {
    display: none;
  }

  .nav-item {
    padding: var(--space-sm);
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
  }

  .logo-text {
    display: none;
  }

  .nav-logo {
    width: 36px;
    justify-content: center;
  }
}

@media (max-width: 640px) {
  .global-nav {
    height: 56px;
  }

  .nav-container {
    padding: 0 var(--space-md);
  }

  .nav-items {
    gap: 2px;
  }

  .nav-item {
    padding: var(--space-xs);
    min-width: 40px;
    min-height: 40px;
  }
}
</style>
