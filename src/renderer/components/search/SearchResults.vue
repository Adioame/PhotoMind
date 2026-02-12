<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useSearchStore } from '@/stores/searchStore'
import { toLocalResourceProtocol } from '@/utils/localResource'

// Props
interface Props {
  layout?: 'grid' | 'list' | 'masonry'
  showStats?: boolean
  showFilters?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'grid',
  showStats: true,
  showFilters: true
})

const emit = defineEmits<{
  photoClick: [photo: any]
  loadMore: []
}>()

// Store
const searchStore = useSearchStore()

// Computed
const results = computed(() => searchStore.results)
const isSearching = computed(() => searchStore.isSearching)
const searchTime = computed(() => searchStore.searchTime)
const totalResults = computed(() => searchStore.totalResults)
const hasSearched = computed(() => searchStore.hasSearched)
const query = computed(() => searchStore.query)

const isEmpty = computed(() => results.value.length === 0 && hasSearched.value)
const isLoading = computed(() => isSearching.value && results.value.length === 0)

// Methods
const handlePhotoClick = (photo: any) => {
  emit('photoClick', photo)
}

// 获取照片 URL，处理本地文件（包含中文等特殊字符）
const getPhotoUrl = (item: any) => {
  const path = item.thumbnailPath || item.thumbnail_url || item.filePath
  if (path && (path.startsWith('/') || /^[a-z]:/i.test(path))) {
    return toLocalResourceProtocol(path)
  }
  return path || ''
}

const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement
  const { scrollTop, scrollHeight, clientHeight } = target

  // Load more when near bottom
  if (scrollTop + clientHeight >= scrollHeight - 200) {
    emit('loadMore')
  }
}

// Format helpers
const formatTime = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const getSimilarityLabel = (similarity: number): string => {
  if (similarity >= 0.8) return '非常相似'
  if (similarity >= 0.6) return '相似'
  if (similarity >= 0.4) return '一般'
  return '较低'
}

const getSourceIcon = (source: string): string => {
  switch (source) {
    case 'keyword': return '🔤'
    case 'semantic': return '🧠'
    default: return '📷'
  }
}

const getSourceLabel = (source: string): string => {
  switch (source) {
    case 'keyword': return '关键词'
    case 'semantic': return '语义'
    default: return source
  }
}

// Lifecycle
onMounted(() => {
  // Load more results on scroll
  const container = document.querySelector('.search-results-container')
  if (container) {
    container.addEventListener('scroll', handleScroll)
  }
})

onUnmounted(() => {
  const container = document.querySelector('.search-results-container')
  if (container) {
    container.removeEventListener('scroll', handleScroll)
  }
})
</script>

<template>
  <div class="search-results">
    <!-- 搜索统计 -->
    <div v-if="showStats && hasSearched" class="results-header">
      <div class="results-info">
        <span v-if="totalResults > 0" class="results-count">
          找到 <strong>{{ totalResults }}</strong> 张照片
        </span>
        <span v-else class="results-count">
          未找到结果
        </span>
        <span class="results-time">耗时 {{ formatTime(searchTime) }}</span>
      </div>

      <div class="results-actions">
        <button class="action-button" @click="searchStore.clearSearch()">
          清除搜索
        </button>
      </div>
    </div>

    <!-- 筛选标签 -->
    <div v-if="showFilters && hasSearched && results.length > 0" class="filter-tags">
      <span class="query-tag">
        "{{ query }}"
      </span>
    </div>

    <!-- 加载中状态 -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>正在搜索...</p>
    </div>

    <!-- 空结果状态 -->
    <div v-else-if="isEmpty" class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24">
        <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 0 0 1.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 0 0-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 0 0 5.34-1.48l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>
      <h3>未找到匹配的照片</h3>
      <p>尝试其他关键词或调整搜索模式</p>
    </div>

    <!-- 搜索结果（网格布局） -->
    <div v-else-if="results.length > 0" class="results-grid" :class="layout">
      <div
        v-for="(item, index) in results"
        :key="item.photoUuid || index"
        class="result-card"
        @click="handlePhotoClick(item)"
      >
        <!-- 照片缩略图 -->
        <div class="photo-thumbnail">
          <img
            v-if="item.thumbnailPath || item.filePath"
            :src="getPhotoUrl(item)"
            :alt="item.fileName"
            loading="eager"
          />
          <div v-else class="thumbnail-placeholder">
            <svg viewBox="0 0 24 24">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </div>

          <!-- 相似度标签 -->
          <div v-if="item.similarity !== undefined" class="similarity-badge">
            {{ getSimilarityLabel(item.similarity) }}
          </div>

          <!-- 来源标签 -->
          <div v-if="item.sources && item.sources.length > 0" class="source-badges">
            <span
              v-for="source in item.sources"
              :key="source.type"
              class="source-badge"
              :class="source.type"
            >
              {{ getSourceLabel(source.type) }}
            </span>
          </div>
        </div>

        <!-- 照片信息 -->
        <div class="photo-info">
          <div class="photo-name" :title="item.fileName">
            {{ item.fileName }}
          </div>
          <div v-if="item.similarity !== undefined" class="similarity-score">
            相似度: {{ Math.round(item.similarity * 100) }}%
          </div>
        </div>
      </div>
    </div>

    <!-- 加载更多 -->
    <div v-if="hasSearched && results.length > 0 && results.length < totalResults" class="load-more">
      <button class="load-more-button" @click="$emit('loadMore')">
        加载更多
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-results {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #eee);
}

.results-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.results-count {
  font-size: 14px;
  color: var(--text-primary, #333);
}

.results-count strong {
  font-weight: 600;
}

.results-time {
  font-size: 12px;
  color: var(--text-tertiary, #999);
}

.action-button {
  padding: 6px 12px;
  border: 1px solid var(--border-color, #ddd);
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary, #666);
  cursor: pointer;
  transition: all 0.2s;
}

.action-button:hover {
  background: var(--bg-secondary, #f5f5f5);
}

.filter-tags {
  padding: 8px 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.query-tag {
  padding: 4px 10px;
  background: var(--primary-light, #e3f2fd);
  color: var(--primary-color, #1976d2);
  border-radius: 4px;
  font-size: 13px;
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color, #eee);
  border-top-color: var(--primary-color, #007aff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

.empty-icon {
  width: 64px;
  height: 64px;
  fill: var(--text-tertiary, #ccc);
  margin-bottom: 16px;
}

.empty-state h3 {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary, #333);
  margin: 0 0 8px;
}

.empty-state p {
  font-size: 14px;
  color: var(--text-secondary, #666);
  margin: 0;
}

.results-grid {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.results-grid.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.results-grid.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.results-grid.masonry {
  columns: 4;
  column-gap: 16px;
}

@media (max-width: 1200px) {
  .results-grid.masonry {
    columns: 3;
  }
}

@media (max-width: 800px) {
  .results-grid.masonry {
    columns: 2;
  }
}

.result-card {
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.result-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.results-grid.masonry .result-card {
  break-inside: avoid;
  margin-bottom: 16px;
}

.photo-thumbnail {
  position: relative;
  aspect-ratio: 1;
  background: var(--bg-secondary, #f5f5f5);
  overflow: hidden;
}

.photo-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.result-card:hover .photo-thumbnail img {
  transform: scale(1.05);
}

.thumbnail-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumbnail-placeholder svg {
  width: 48px;
  height: 48px;
  fill: var(--text-tertiary, #ccc);
}

.similarity-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 4px;
  font-size: 11px;
}

.source-badges {
  position: absolute;
  bottom: 8px;
  left: 8px;
  display: flex;
  gap: 4px;
}

.source-badge {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  color: #fff;
}

.source-badge.keyword {
  background: #2196f3;
}

.source-badge.semantic {
  background: #9c27b0;
}

.photo-info {
  padding: 10px 12px;
}

.photo-name {
  font-size: 13px;
  color: var(--text-primary, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.similarity-score {
  font-size: 12px;
  color: var(--text-secondary, #666);
  margin-top: 4px;
}

.load-more {
  padding: 16px;
  text-align: center;
  border-top: 1px solid var(--border-color, #eee);
}

.load-more-button {
  padding: 10px 24px;
  background: var(--primary-color, #007aff);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.load-more-button:hover {
  background: var(--primary-dark, #0056b3);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
