<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSearchStore } from '@/stores/searchStore'

// Props
interface Props {
  maxItems?: number
  showClear?: boolean
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  maxItems: 10,
  showClear: true,
  compact: false
})

const emit = defineEmits<{
  select: [query: string]
  clear: []
}>()

// Store
const searchStore = useSearchStore()

// Computed
const history = computed(() => searchStore.recentSearches.slice(0, props.maxItems))
const isEmpty = computed(() => history.value.length === 0)

// Methods
const handleSelect = (query: string) => {
  emit('select', query)
}

const handleClear = () => {
  searchStore.clearHistory()
  emit('clear')
}

const formatDate = (query: string): string => {
  // 简单返回，不做复杂时间格式化
  return ''
}

// 搜索次数统计（模拟）
const getSearchCount = (query: string): number => {
  return 1 // 实际实现需要从后端获取
}

onMounted(() => {
  searchStore.loadHistory()
})
</script>

<template>
  <div class="search-history" :class="{ compact }">
    <div v-if="!compact" class="history-header">
      <h3 class="history-title">搜索历史</h3>
      <button
        v-if="showClear && !isEmpty"
        class="clear-button"
        @click="handleClear"
      >
        清除
      </button>
    </div>

    <!-- 历史记录列表 -->
    <div v-if="!isEmpty" class="history-list">
      <div
        v-for="(query, index) in history"
        :key="'history-' + index"
        class="history-item"
        @click="handleSelect(query)"
      >
        <svg class="history-icon" viewBox="0 0 24 24">
          <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
        </svg>

        <div class="history-content">
          <span class="history-query">{{ query }}</span>
          <span v-if="!compact" class="history-meta">
            {{ getSearchCount(query) }} 次搜索
          </span>
        </div>

        <svg v-if="!compact" class="arrow-icon" viewBox="0 0 24 24">
          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
        </svg>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24">
        <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
      </svg>
      <p>暂无搜索历史</p>
    </div>
  </div>
</template>

<style scoped>
.search-history {
  width: 100%;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #eee);
}

.history-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin: 0;
}

.clear-button {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--text-tertiary, #999);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s;
}

.clear-button:hover {
  color: var(--text-secondary, #666);
}

.history-list {
  max-height: 400px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.history-item:hover {
  background: var(--bg-secondary, #f5f5f5);
}

.history-icon {
  width: 18px;
  height: 18px;
  fill: var(--text-tertiary, #999);
  flex-shrink: 0;
}

.history-content {
  flex: 1;
  min-width: 0;
}

.history-query {
  display: block;
  font-size: 14px;
  color: var(--text-primary, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-meta {
  display: block;
  font-size: 12px;
  color: var(--text-tertiary, #999);
  margin-top: 2px;
}

.arrow-icon {
  width: 18px;
  height: 18px;
  fill: var(--text-tertiary, #ccc);
  flex-shrink: 0;
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
}

.empty-icon {
  width: 40px;
  height: 40px;
  fill: var(--text-tertiary, #ccc);
  margin: 0 auto 12px;
}

.empty-state p {
  font-size: 13px;
  color: var(--text-tertiary, #999);
  margin: 0;
}

/* Compact mode */
.compact .history-item {
  padding: 8px 12px;
}

.compact .history-query {
  font-size: 13px;
}

.compact .history-meta {
  display: none;
}
</style>
