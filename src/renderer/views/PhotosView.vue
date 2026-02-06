/**
 * PhotoMind - 照片列表视图
 * 反AI味 · 现代极简主义设计
 */
<template>
  <div class="photos-container">
    <header class="page-header">
      <div class="header-left">
        <h1>照片</h1>
        <span class="photo-count">{{ photoStore.totalCount }} 张照片</span>
      </div>
      <div class="header-right">
        <n-button quaternary circle @click="refreshPhotos" :loading="photoStore.loading">
          <template #icon>
            <n-icon><ArrowClockwise24Regular /></n-icon>
          </template>
        </n-button>
        <n-button-group class="view-toggle">
          <n-button
            :type="viewMode === 'grid' ? 'primary' : 'default'"
            @click="viewMode = 'grid'"
            size="small"
          >
            <template #icon>
              <n-icon><Grid24Regular /></n-icon>
            </template>
          </n-button>
          <n-button
            :type="viewMode === 'list' ? 'primary' : 'default'"
            @click="viewMode = 'list'"
            size="small"
          >
            <template #icon>
              <n-icon><List24Regular /></n-icon>
            </template>
          </n-button>
        </n-button-group>
      </div>
    </header>

    <!-- 照片网格 -->
    <PhotoGrid
      v-if="viewMode === 'grid'"
      :photos="photoStore.photos"
      :loading="photoStore.loading"
      :columns="4"
      @photo-click="openPhoto"
    />

    <!-- 照片列表 -->
    <div v-else class="photo-list">
      <template v-if="photoStore.loading && photoStore.photos.length === 0">
        <div class="loading-state">
          <n-spin size="large" />
          <p>正在加载照片...</p>
        </div>
      </template>
      <template v-else-if="photoStore.photos.length > 0">
        <div
          v-for="photo in photoStore.photos"
          :key="photo.id || photo.uuid"
          class="list-item"
          @click="openPhoto(photo)"
        >
          <div class="list-thumb">
            <n-image
              :src="getPhotoUrl(photo)"
              object-fit="cover"
              preview-disabled
            />
          </div>
          <div class="list-info">
            <h3>{{ photo.fileName }}</h3>
            <p class="photo-date">{{ formatDateTime(photo.takenAt) }}</p>
            <p v-if="photo.location?.name" class="photo-location">
              <n-icon size="14"><Location24Regular /></n-icon>
              {{ photo.location.name }}
            </p>
          </div>
          <n-icon class="list-arrow" size="20"><ChevronRight24Regular /></n-icon>
        </div>
      </template>
      <template v-else>
        <EmptyState
          type="photos"
          :primary-action="{
            label: '导入照片',
            icon: Folder24Regular,
            onClick: openImport
          }"
        />
      </template>
    </div>

    <!-- 加载更多 -->
    <div class="load-more" v-if="photoStore.hasMore && !photoStore.loading">
      <n-button @click="loadMore" size="large">
        加载更多
      </n-button>
    </div>

    <!-- 照片预览 -->
    <n-modal
      v-model:show="showPreview"
      preset="card"
      class="preview-modal"
      :bordered="false"
    >
      <template #header>
        <span>照片详情</span>
      </template>
      <div class="photo-preview" v-if="selectedPhoto">
        <div class="preview-image">
          <n-image
            :src="getPhotoUrl(selectedPhoto)"
            :preview-src="getPhotoUrl(selectedPhoto)"
            object-fit="contain"
          />
        </div>
        <div class="preview-info">
          <n-descriptions :column="1" label-placement="left" class="photo-meta">
            <n-descriptions-item label="文件名">
              {{ selectedPhoto.fileName }}
            </n-descriptions-item>
            <n-descriptions-item label="拍摄时间">
              {{ formatDateTime(selectedPhoto.takenAt) }}
            </n-descriptions-item>
            <n-descriptions-item label="地点" v-if="selectedPhoto.location?.name">
              {{ selectedPhoto.location.name }}
            </n-descriptions-item>
          </n-descriptions>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Grid24Regular,
  List24Regular,
  Location24Regular,
  ArrowClockwise24Regular,
  ChevronRight24Regular,
  Folder24Regular,
} from '@vicons/fluent'
import { useMessage } from 'naive-ui'
import { usePhotoStore } from '@/stores/photoStore'
import PhotoGrid from '../components/PhotoGrid.vue'
import EmptyState from '../components/EmptyState.vue'
import { toLocalResourceProtocol } from '@/utils/localResource'

const router = useRouter()
const message = useMessage()
const photoStore = usePhotoStore()

// 视图模式
const viewMode = ref<'grid' | 'list'>('grid')
const showPreview = ref(false)
const selectedPhoto = ref<any>(null)

// 获取照片 URL
const getPhotoUrl = (photo: any) => {
  const path = photo.thumbnailPath || photo.thumbnail_url || photo.filePath
  if (path && (path.startsWith('/') || /^[a-z]:/i.test(path))) {
    return toLocalResourceProtocol(path)
  }
  return path || ''
}

// 刷新照片列表
const refreshPhotos = async () => {
  await photoStore.fetchPhotos({ limit: 24, offset: 0 })
}

// 加载更多
const loadMore = async () => {
  const currentCount = photoStore.photos.length
  await photoStore.fetchPhotos({ limit: 24, offset: currentCount })
}

// 打开照片
const openPhoto = (photo: any) => {
  router.push(`/photo/${photo.id || photo.uuid}`)
}

// 打开导入
const openImport = () => {
  window.dispatchEvent(new CustomEvent('open-import-dialog'))
}

// 格式化日期时间
const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// 初始化
onMounted(() => {
  photoStore.fetchPhotos({ limit: 24, offset: 0 })
})
</script>

<style scoped>
/* ================================
   容器
   ================================ */
.photos-container {
  min-height: 100vh;
  background: var(--bg-primary);
  padding: calc(var(--nav-height) + var(--space-xl)) var(--space-lg) var(--space-lg);
  max-width: var(--content-max-width);
  margin: 0 auto;
}

/* ================================
   页面头部
   ================================ */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xl);
}

.header-left h1 {
  font-size: var(--text-hero);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.5px;
}

.photo-count {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin-left: var(--space-sm);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.view-toggle {
  background: var(--bg-tertiary);
  padding: 4px;
  border-radius: var(--radius-md);
}

/* ================================
   列表视图
   ================================ */
.photo-list {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

.loading-state {
  text-align: center;
  padding: var(--space-3xl) 0;
  color: var(--text-secondary);
}

.loading-state p {
  margin-top: var(--space-md);
  font-size: var(--text-small);
}

.list-item {
  display: flex;
  align-items: center;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-default);
}

.list-item:last-child {
  border-bottom: none;
}

.list-item:hover {
  background: var(--bg-tertiary);
}

.list-thumb {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-tertiary);
}

.list-thumb :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.list-info {
  margin-left: var(--space-md);
  flex: 1;
  min-width: 0;
}

.list-info h3 {
  font-size: var(--text-body);
  font-weight: var(--font-medium);
  color: var(--text-primary);
  margin: 0 0 4px;
  word-break: break-all;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photo-date {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin: 0 0 4px;
}

.photo-location {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-caption);
  color: var(--text-tertiary);
  margin: 0;
}

.list-arrow {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

/* ================================
   加载更多
   ================================ */
.load-more {
  text-align: center;
  margin-top: var(--space-xl);
}

/* ================================
   预览模态框
   ================================ */
.preview-modal {
  width: 90%;
  max-width: 900px;
}

.photo-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.preview-image {
  text-align: center;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  overflow: hidden;
  max-height: 500px;
}

.preview-image :deep(img) {
  max-width: 100%;
  max-height: 500px;
  object-fit: contain;
}

.preview-info {
  padding: var(--space-md) 0;
}

/* ================================
   响应式
   ================================ */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-md);
  }

  .header-left h1 {
    font-size: var(--text-h1);
  }

  .photo-count {
    display: block;
    margin-left: 0;
    margin-top: 4px;
  }

  .list-thumb {
    width: 60px;
    height: 60px;
  }
}
</style>
