/**
 * PhotoMind - 搜索视图
 * 反AI味 · 现代极简主义设计
 */
<template>
  <div class="search-container">
    <!-- 搜索头部 -->
    <header class="search-header">
      <h1>智能搜索</h1>
      <p class="subtitle">用自然语言描述你想找的照片</p>

      <SearchBar
        placeholder="例如：2015年日本旅游的照片、和儿子在新疆的合影..."
        :autofocus="true"
        @search="handleSearch"
      />
    </header>

    <!-- 搜索结果 -->
    <div class="search-results" v-if="searchStore.hasSearched">
      <!-- 结果头部 -->
      <div class="results-header">
        <span class="results-count">找到 {{ searchStore.totalResults }} 张照片</span>
        <span v-if="searchStore.searchTime" class="search-time">耗时 {{ searchStore.searchTime }}ms</span>
      </div>

      <PhotoGrid
        :photos="searchStore.results"
        :loading="searchStore.isSearching"
        :columns="4"
        @photo-click="openPhoto"
      />

      <!-- 无结果 - 使用 EmptyState -->
      <EmptyState
        v-if="!searchStore.isSearching && searchStore.results.length === 0"
        type="search"
        description="没有找到符合条件的照片"
        hint="试试其他关键词或简化搜索条件"
        :primary-action="{
          label: '清除搜索',
          onClick: clearSearch
        }"
      />
    </div>

    <!-- 初始状态 - 搜索技巧 -->
    <div v-else class="initial-state">
      <div class="search-tips">
        <h3>搜索技巧</h3>
        <ul>
          <li>
            <span class="tip-icon">
              <n-icon size="16"><CalendarToday24Regular /></n-icon>
            </span>
            <span class="tip-content">
              <strong>时间查询：</strong>"2015年的照片"、"去年夏天的照片"
            </span>
          </li>
          <li>
            <span class="tip-icon">
              <n-icon size="16"><Location24Regular /></n-icon>
            </span>
            <span class="tip-content">
              <strong>地点查询：</strong>"日本旅游"、"新疆的照片"、"北京"
            </span>
          </li>
          <li>
            <span class="tip-icon">
              <n-icon size="16"><People24Regular /></n-icon>
            </span>
            <span class="tip-content">
              <strong>人物查询：</strong>"儿子的照片"、"一家四口合影"
            </span>
          </li>
          <li>
            <span class="tip-icon">
              <n-icon size="16"><Search24Regular /></n-icon>
            </span>
            <span class="tip-content">
              <strong>组合查询：</strong>"2015年日本和儿子的合影"
            </span>
          </li>
        </ul>
      </div>
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
            <n-descriptions-item label="尺寸" v-if="selectedPhoto.width">
              {{ selectedPhoto.width }} x {{ selectedPhoto.height }}
            </n-descriptions-item>
          </n-descriptions>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { CalendarToday24Regular, Location24Regular, People24Regular, Search24Regular } from '@vicons/fluent'
import { useSearchStore } from '@/stores/searchStore'
import PhotoGrid from '../components/PhotoGrid.vue'
import SearchBar from '../components/search/SearchBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import { toLocalResourceProtocol } from '@/utils/localResource'

const router = useRouter()
const message = useMessage()
const searchStore = useSearchStore()

// 预览状态
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

// 处理搜索
const handleSearch = (query: string) => {
  if (!query.trim()) {
    message.warning('请输入搜索关键词')
    return
  }

  if (searchStore.results.length === 0 && !searchStore.isSearching) {
    message.info('没有找到符合条件的照片')
  }
}

// 清除搜索
const clearSearch = () => {
  searchStore.clearSearch()
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
</script>

<style scoped>
/* ================================
   容器
   ================================ */
.search-container {
  min-height: 100vh;
  background: var(--bg-primary);
  padding: calc(var(--nav-height) + var(--space-xl)) var(--space-lg) var(--space-lg);
  max-width: var(--content-max-width);
  margin: 0 auto;
}

/* ================================
   搜索头部
   ================================ */
.search-header {
  text-align: center;
  padding: var(--space-2xl) 0;
}

.search-header h1 {
  font-size: var(--text-hero);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin: 0 0 var(--space-sm);
  letter-spacing: -0.5px;
}

.subtitle {
  color: var(--text-secondary);
  margin: 0 0 var(--space-xl);
  font-size: var(--text-body);
}

/* ================================
   搜索结果
   ================================ */
.search-results {
  margin-top: var(--space-xl);
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
  padding: 0 var(--space-sm);
}

.results-count {
  color: var(--text-secondary);
  font-size: var(--text-body);
}

.search-time {
  font-size: var(--text-small);
  color: var(--text-tertiary);
}

/* ================================
   初始状态 - 搜索技巧
   ================================ */
.initial-state {
  margin-top: var(--space-2xl);
  display: flex;
  justify-content: center;
}

.search-tips {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  max-width: 480px;
  width: 100%;
  box-shadow: var(--shadow-md);
}

.search-tips h3 {
  margin: 0 0 var(--space-lg);
  color: var(--text-primary);
  font-size: var(--text-h3);
  font-weight: var(--font-semibold);
  text-align: center;
}

.search-tips ul {
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--text-secondary);
}

.search-tips li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
  line-height: 1.6;
}

.search-tips li:last-child {
  margin-bottom: 0;
}

.tip-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--primary-light);
  border-radius: var(--radius-sm);
  color: var(--primary-default);
  flex-shrink: 0;
}

.tip-content strong {
  color: var(--text-primary);
  font-weight: var(--font-medium);
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
  .search-header h1 {
    font-size: var(--text-h1);
  }

  .search-tips {
    margin: 0 var(--space-sm);
  }
}
</style>
