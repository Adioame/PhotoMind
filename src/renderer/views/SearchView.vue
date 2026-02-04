/**
 * PhotoMind - 搜索视图
 */
<template>
  <div class="search-container">
    <!-- 搜索框 -->
    <div class="search-header">
      <h1>智能搜索</h1>
      <p class="subtitle">用自然语言描述你想找的照片</p>

      <SearchBar
        placeholder="例如：2015年日本旅游的照片、和儿子在新疆的合影..."
        :autofocus="true"
        @search="handleSearch"
      />
    </div>

    <!-- 搜索结果 -->
    <div class="search-results" v-if="searchStore.hasSearched">
      <div class="results-header">
        <span>找到 {{ searchStore.totalResults }} 张照片</span>
        <span v-if="searchStore.searchTime" class="search-time">耗时 {{ searchStore.searchTime }}ms</span>
      </div>

      <PhotoGrid
        :photos="searchStore.results"
        :loading="searchStore.isSearching"
        :columns="4"
        @photo-click="openPhoto"
      />

      <!-- 无结果 -->
      <div v-if="!searchStore.isSearching && searchStore.results.length === 0" class="no-results">
        <n-empty description="没有找到符合条件的照片">
          <template #extra>
            <p>试试其他关键词</p>
          </template>
        </n-empty>
      </div>
    </div>

    <!-- 初始状态 -->
    <div v-else class="initial-state">
      <div class="search-tips">
        <h3>搜索技巧</h3>
        <ul>
          <li><strong>时间查询：</strong>"2015年的照片"、"去年夏天的照片"</li>
          <li><strong>地点查询：</strong>"日本旅游"、"新疆的照片"、"北京"</li>
          <li><strong>人物查询：</strong>"儿子的照片"、"一家四口合影"</li>
          <li><strong>组合查询：</strong>"2015年日本和儿子的合影"</li>
        </ul>
      </div>
    </div>

    <!-- 照片预览 -->
    <n-modal v-model:show="showPreview" preset="card" style="width: 90%; max-width: 900px;">
      <template #header>
        <span>照片详情</span>
      </template>
      <div class="photo-preview" v-if="selectedPhoto">
        <div class="preview-image">
          <n-image
            :src="selectedPhoto.thumbnailPath || selectedPhoto.thumbnail_url"
            :preview-src="selectedPhoto.thumbnailPath || selectedPhoto.thumbnail_url"
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
import { useSearchStore } from '@/stores/searchStore'
import PhotoGrid from '../components/PhotoGrid.vue'
import SearchBar from '../components/search/SearchBar.vue'

const router = useRouter()
const message = useMessage()
const searchStore = useSearchStore()

// 预览状态
const showPreview = ref(false)
const selectedPhoto = ref<any>(null)

// 处理搜索
const handleSearch = (query: string) => {
  if (!query.trim()) {
    message.warning('请输入搜索关键词')
    return
  }

  // 搜索完成后检查结果
  if (searchStore.results.length === 0 && !searchStore.isSearching) {
    message.info('没有找到符合条件的照片')
  }
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
.search-container {
  min-height: 100vh;
  background: #f5f5f7;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.search-header {
  text-align: center;
  padding: 32px 0;
}

.search-header h1 {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 8px;
}

.subtitle {
  color: #666;
  margin-bottom: 24px;
}

.search-results {
  margin-top: 24px;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  color: #666;
}

.search-time {
  font-size: 12px;
  color: #999;
}

.no-results {
  text-align: center;
  padding: 64px 0;
}

.initial-state {
  margin-top: 48px;
}

.search-tips {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  margin: 0 auto;
}

.search-tips h3 {
  margin: 0 0 16px;
  color: #1a1a1a;
}

.search-tips ul {
  margin: 0;
  padding-left: 20px;
  color: #666;
}

.search-tips li {
  margin-bottom: 8px;
  line-height: 1.6;
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

.preview-info {
  padding: 16px 0;
}

@media (max-width: 768px) {
  .search-box {
    flex-direction: column;
  }
}
</style>
