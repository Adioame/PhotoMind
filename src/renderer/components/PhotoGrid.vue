/**
 * PhotoMind - 照片网格组件
 */
<template>
  <div class="photo-grid" :class="{ loading }">
    <template v-if="loading">
      <n-spin size="large" class="loading-spinner" />
    </template>
    <template v-else-if="photos.length === 0">
      <div class="empty-state">
        <n-empty description="暂无照片">
          <template #icon>
            <n-icon size="64" color="#ccc">
              <Image24Regular />
            </n-icon>
          </template>
        </n-empty>
      </div>
    </template>
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
            lazy
            class="photo-image"
            @error="(e) => console.warn('图片加载失败:', photo.filePath || photo.thumbnailPath)"
          />
          <div class="photo-overlay">
            <div class="photo-info">
              <span class="photo-date">{{ formatDate(photo.takenAt) }}</span>
              <span v-if="photo.location?.name" class="photo-location">
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
import { Image24Regular } from '@vicons/fluent'

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

// 获取图片 URL，处理本地文件
const getPhotoUrl = (photo: Photo) => {
  // 优先使用 thumbnailPath
  if (photo.thumbnailPath) {
    // 如果是本地路径，添加 file:// 前缀
    if (photo.thumbnailPath.startsWith('/') || /^[a-z]:/i.test(photo.thumbnailPath)) {
      return `file://${photo.thumbnailPath}`
    }
    return photo.thumbnailPath
  }
  // 其次使用 filePath
  if (photo.filePath) {
    if (photo.filePath.startsWith('/') || /^[a-z]:/i.test(photo.filePath)) {
      return `file://${photo.filePath}`
    }
    return photo.filePath
  }
  return photo.thumbnail_url || ''
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
</script>

<style scoped>
.photo-grid {
  min-height: 200px;
}

.loading-spinner {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.grid-container {
  display: grid;
  gap: 12px;
}

.photo-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  background: #f0f0f0;
}

.photo-item:hover {
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.photo-item:hover .photo-overlay {
  opacity: 1;
}

.photo-image {
  width: 100%;
  height: 100%;
}

.photo-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
  opacity: 0;
  transition: opacity 0.2s;
}

.photo-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: white;
  font-size: 12px;
}

.photo-location {
  opacity: 0.8;
}

@media (max-width: 768px) {
  .grid-container {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 8px;
  }
}
</style>
