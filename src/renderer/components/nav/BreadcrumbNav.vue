/**
 * PhotoMind - 面包屑导航组件
 */
<template>
  <nav class="breadcrumb-nav" aria-label="面包屑导航">
    <ol class="breadcrumb-list">
      <li
        v-for="(item, index) in items"
        :key="index"
        class="breadcrumb-item"
        :class="{ 'is-last': index === items.length - 1 }"
      >
        <!-- 分隔符 -->
        <span v-if="index > 0" class="breadcrumb-separator">
          <n-icon size="14"><ChevronRight24Regular /></n-icon>
        </span>

        <!-- 可点击链接 -->
        <router-link
          v-if="index < items.length - 1 && item.path"
          :to="item.path"
          class="breadcrumb-link"
        >
          <n-icon v-if="item.icon" size="16" class="breadcrumb-icon">
            <component :is="item.icon" />
          </n-icon>
          <span class="breadcrumb-label">{{ item.label }}</span>
        </router-link>

        <!-- 当前页（不可点击） -->
        <span v-else class="breadcrumb-current">
          <n-icon v-if="item.icon" size="16" class="breadcrumb-icon">
            <component :is="item.icon" />
          </n-icon>
          <span class="breadcrumb-label">{{ item.label }}</span>
        </span>
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
import { ChevronRight24Regular } from '@vicons/fluent'

export interface BreadcrumbItem {
  label: string
  path?: string
  icon?: any
}

interface Props {
  items: BreadcrumbItem[]
}

defineProps<Props>()
</script>

<style scoped>
.breadcrumb-nav {
  padding: 16px 0;
  font-size: 14px;
}

.breadcrumb-list {
  display: flex;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0;
  flex-wrap: wrap;
  gap: 4px 0;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
}

.breadcrumb-separator {
  color: #999;
  margin: 0 8px;
  display: flex;
  align-items: center;
}

.breadcrumb-link {
  color: #5E6AD2;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
  padding: 4px 6px;
  border-radius: 4px;
}

.breadcrumb-link:hover {
  color: #4a56b8;
  background: rgba(94, 106, 210, 0.1);
}

.breadcrumb-current {
  color: #666;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
}

.breadcrumb-icon {
  opacity: 0.8;
}

.breadcrumb-label {
  line-height: 1.4;
}

/* 暗色主题适配 */
:global(.dark-theme) .breadcrumb-link {
  color: #8B9EFF;
}

:global(.dark-theme) .breadcrumb-link:hover {
  color: #a8b3ff;
  background: rgba(139, 158, 255, 0.15);
}

:global(.dark-theme) .breadcrumb-current {
  color: #aaa;
}

:global(.dark-theme) .breadcrumb-separator {
  color: #666;
}
</style>
