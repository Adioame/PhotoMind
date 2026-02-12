<!--
  PhotoMind Photo Grid Component
  照片网格组件 - 反AI味设计

  设计要点：
  1. 统一 16px 圆角
  2. 柔和弥散阴影
  3. 优雅的悬停动效
  4. 情感化空状态
-->
<template>
  <div class="photo-grid" :class="{ loading }">
    <!-- 加载状态 -->
    <template v-if="loading">
      <div class="loading-state">
        <n-spin size="large" />
        <p class="loading-text">正在加载照片...</p>
      </div>
    </template>

    <!-- 空状态 - 使用情感化组件 -->
    <template v-else-if="photos.length === 0">
      <EmptyState
        type="photos"
        :primary-action="{
          label: '导入照片',
          icon: Folder24Regular,
          onClick: openImport
        }"
        :secondary-action="{
          label: '从 iCloud 同步',
          onClick: openSync
        }"
      />
    </template>

    <!-- 照片网格 -->
    <template v-else>
      <div class="grid-container" :style="gridStyle">
        <div
          v-for="(photo, index) in photos"
          :key="photo.id || photo.uuid || index"
          class="photo-item"
          @click="$emit('photo-click', photo)"
        >
          <n-image
            :src="getPhotoUrl(photo)"
            :alt="photo.fileName"
            object-fit="cover"
            :img-props="{ loading: 'eager' }"
            class="photo-image"
            preview-disabled
            @error="(e) => handleImageError(e, photo)"
          />
          <div class="photo-overlay">
            <div class="photo-info">
              <span class="photo-date">{{ formatDate(photo.takenAt) }}</span>
              <span v-if="photo.location?.name" class="photo-location">
                <n-icon size="12" class="location-icon">
                  <Location16Regular />
                </n-icon>
                {{ photo.location.name }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NImage, NSpin, NIcon } from 'naive-ui'
import { Folder24Regular, Location16Regular } from '@vicons/fluent'
import EmptyState from './EmptyState.vue'
import { toLocalResourceProtocol } from '@/utils/localResource'

interface Photo {
  id?: number
  uuid?: string
  thumbnailPath?: string
  thumbnail_url?: string
  filePath?: string
  fileName?: string
  takenAt?: string
  location?: { name?: string }
  status?: string
}

// 获取图片 URL，处理本地文件（包含中文等特殊字符）
const getPhotoUrl = (photo: Photo) => {
  // 优先使用 thumbnailPath
  if (photo.thumbnailPath) {
    // 如果是本地路径，转换为 local-resource:// 协议
    if (photo.thumbnailPath.startsWith('/') || /^[a-z]:/i.test(photo.thumbnailPath)) {
      return toLocalResourceProtocol(photo.thumbnailPath)
    }
    return photo.thumbnailPath
  }
  // 其次使用 filePath
  if (photo.filePath) {
    if (photo.filePath.startsWith('/') || /^[a-z]:/i.test(photo.filePath)) {
      return toLocalResourceProtocol(photo.filePath)
    }
    return photo.filePath
  }
  return photo.thumbnail_url || ''
}

// 处理图片加载错误
const handleImageError = (e: Event, photo: Photo) => {
  console.warn('图片加载失败:', photo.filePath || photo.thumbnailPath)
  // 可以在这里添加错误处理逻辑，比如显示占位图或标记为损坏
}

// Props 定义
const props = defineProps<{
  photos: Photo[]
  loading?: boolean
  columns?: number
}>()

// Emits 定义
const emit = defineEmits<{
  (e: 'photo-click', photo: Photo): void
}>()

// 响应式列数
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${props.columns || 4}, 1fr)`,
}))

// 格式化日期
const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

// 打开导入
const openImport = () => {
  window.dispatchEvent(new CustomEvent('open-import-dialog'))
}

// 打开同步
const openSync = () => {
  window.dispatchEvent(new CustomEvent('open-sync-dialog'))
}
</script>

<style scoped>
.photo-grid {
  min-height: 300px;
}

/* ================================
   加载状态
   ================================ */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: var(--space-md);
}

.loading-text {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin: 0;
}

/* ================================
   照片网格
   ================================ */
.grid-container {
  display: grid;
  gap: var(--space-md);
}

/* ================================
   照片卡片 - 统一圆角 + 柔和阴影
   ================================ */
.photo-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-tertiary);

  /* 柔和弥散阴影 */
  box-shadow: var(--shadow-md);

  /* 动效 */
  transition: transform var(--duration-normal) var(--ease-default),
              box-shadow var(--duration-normal) var(--ease-default);
}

.photo-item:hover {
  transform: scale(1.02);
  box-shadow: var(--shadow-hover);
}

.photo-item:hover .photo-overlay {
  opacity: 1;
}

.photo-image {
  width: 100%;
  height: 100%;
  display: block;
}

/* ================================
   覆盖层 - 底部渐变信息
   ================================ */
.photo-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: var(--space-lg) var(--space-md) var(--space-md);
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 100%);
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-default);
}

.photo-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  color: white;
}

.photo-date {
  font-size: var(--text-small);
  font-weight: var(--font-medium);
}

.photo-location {
  font-size: var(--text-caption);
  opacity: 0.9;
  display: flex;
  align-items: center;
  gap: 4px;
}

.location-icon {
  opacity: 0.8;
}

/* ================================
   响应式
   ================================ */
@media (max-width: 1024px) {
  .grid-container {
    gap: var(--space-sm);
  }

  .photo-item {
    border-radius: var(--radius-md);
  }
}

@media (max-width: 640px) {
  .grid-container {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: var(--space-sm);
  }

  .photo-item {
    border-radius: var(--radius-md);
  }

  /* 移动端始终显示信息，因为可能没有 hover */
  .photo-overlay {
    opacity: 1;
    padding: var(--space-md) var(--space-sm) var(--space-sm);
    background: linear-gradient(to top, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 100%);
  }

  .photo-date {
    font-size: var(--text-caption);
  }

  .photo-location {
    font-size: 11px;
  }
}
</style>
