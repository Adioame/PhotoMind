/**
 * PhotoMind - 照片列表视图
 */
<template>
  <div class="photos-container">
    <header class="header">
      <div class="header-left">
        <h1>照片</h1>
        <p class="subtitle">{{ photoStore.totalCount }} 张照片</p>
      </div>
      <div class="header-right">
        <n-button @click="refreshPhotos" :loading="photoStore.loading">
          <template #icon>
            <n-icon><Refresh24Regular /></n-icon>
          </template>
          刷新
        </n-button>
        <n-button-group>
          <n-button
            :type="viewMode === 'grid' ? 'primary' : 'default'"
            @click="viewMode = 'grid'"
          >
            <template #icon>
              <n-icon><Grid24Regular /></n-icon>
            </template>
          </n-button>
          <n-button
            :type="viewMode === 'list' ? 'primary' : 'default'"
            @click="viewMode = 'list'"
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
              style="width: 80px; height: 80px;"
            />
          </div>
          <div class="list-info">
            <h3>{{ photo.fileName }}</h3>
            <p>{{ formatDateTime(photo.takenAt) }}</p>
            <p v-if="photo.location?.name" class="location">
              <n-icon><Location24Regular /></n-icon>
              {{ photo.location.name }}
            </p>
          </div>
        </div>
      </template>
      <template v-else>
        <n-empty description="暂无照片">
          <template #extra>
            <p>请先导入照片到图库</p>
          </template>
        </n-empty>
      </template>
    </div>

    <!-- 加载更多 -->
    <div class="load-more" v-if="photoStore.hasMore && !photoStore.loading">
      <n-button @click="loadMore">加载更多</n-button>
    </div>

    <!-- 照片预览 -->
    <n-modal v-model:show="showPreview" preset="card" style="width: 90%; max-width: 900px;">
      <template #header>
        <span>照片详情</span>
      </template>
      <div class="photo-preview" v-if="selectedPhoto">
        <div class="preview-image">
          <n-image
            :src="getPhotoUrl(selectedPhoto)"
            :preview-src="getPhotoUrl(selectedPhoto)"
            object-fit="contain"
            style="width: 100%; max-height: 500px;"
          />
        </div>
        <div class="preview-info">
          <n-descriptions :column="1" label-placement="left">
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
  Refresh24Regular,
} from '@vicons/fluent'
import { useMessage } from 'naive-ui'
import { usePhotoStore } from '@/stores/photoStore'
import PhotoGrid from '../components/PhotoGrid.vue'

const router = useRouter()
const message = useMessage()
const photoStore = usePhotoStore()

// 视图模式
const viewMode = ref<'grid' | 'list'>('grid')
const showPreview = ref(false)
const selectedPhoto = ref<any>(null)

// 获取照片 URL，处理本地文件
const getPhotoUrl = (photo: any) => {
  const path = photo.thumbnailPath || photo.thumbnail_url || photo.filePath
  if (path && (path.startsWith('/') || /^[a-z]:/i.test(path))) {
    return `file://${path}`
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
  selectedPhoto.value = photo
  showPreview.value = true
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
.photos-container {
  min-height: 100vh;
  background: #f5f5f7;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header h1 {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.subtitle {
  color: #666;
  margin: 4px 0 0;
}

.photo-list {
  background: white;
  border-radius: 12px;
  overflow: hidden;
}

.list-item {
  display: flex;
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.2s;
}

.list-item:hover {
  background: #f8f8fc;
}

.list-thumb {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.list-info {
  margin-left: 16px;
  flex: 1;
}

.list-info h3 {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 4px;
  word-break: break-all;
}

.list-info p {
  font-size: 12px;
  color: #999;
  margin: 0 0 4px;
}

.list-info .location {
  display: flex;
  align-items: center;
  gap: 4px;
}

.loading-state {
  text-align: center;
  padding: 64px 0;
}

.load-more {
  text-align: center;
  margin-top: 24px;
}

.photo-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-image {
  text-align: center;
  background: #f5f5f7;
  border-radius: 8px;
  overflow: hidden;
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    gap: 16px;
  }
}
</style>
