# Story E-05.2: 搜索结果展示

## Story Overview

**原始需求描述**:
作为用户，我希望搜索结果能够清晰展示，显示照片缩略图、相似度分数和相关标签，并支持多种视图和排序方式。

**描述**:
优化搜索结果展示界面，包括网格/列表视图切换、相似度分数显示、来源标签、分页加载等功能。展示结果应清晰标注每个结果的来源（关键词/语义/人物）。

## Acceptance Criteria

### 功能性需求
- [ ] 网格视图展示照片缩略图
- [ ] 列表视图展示详细信息
- [ ] 显示相似度分数
- [ ] 标注结果来源（关键词/语义/人物）
- [ ] 显示人物标签
- [ ] 支持无限滚动加载
- [ ] 支持结果排序（时间/相关度）
- [ ] 支持视图切换
- [ ] 显示搜索统计（结果数量/搜索时间）

### 非功能性需求
- [ ] 滚动流畅无卡顿
- [ ] 图片懒加载
- [ ] 支持 1000+ 结果分页

## Implementation Steps

### Phase 1: 搜索结果类型

**文件**: `src/renderer/types/search.ts`

```typescript
interface SearchResult {
  photoId: string
  photo: Photo
  score: number
  sources: ResultSource[]
  matchedAgents: string[]
}

interface ResultSource {
  agent: string
  originalScore: number
  weight: number
}

interface SearchResponse {
  results: SearchResult[]
  totalCount: number
  searchTime: number
  parseResult?: QueryParseResult
}

interface Photo {
  id: string
  path: string
  filename: string
  date: Date
  rating?: number
  thumbnail?: string
  persons?: Person[]
}

interface Person {
  id: string
  name: string
  avatarPath?: string
}
```

### Phase 2: 搜索结果组件

**文件**: `src/renderer/components/search/SearchResults.vue`

```vue
<template>
  <div class="search-results">
    <!-- 搜索统计 -->
    <div class="results-header">
      <div class="results-info">
        <span class="result-count">{{ totalCount }} 张照片</span>
        <span class="search-time">搜索耗时 {{ searchTime }}ms</span>
      </div>

      <div class="results-actions">
        <!-- 排序 -->
        <select v-model="sortBy" class="sort-select">
          <option value="relevance">按相关度</option>
          <option value="date-desc">按时间（最新）</option>
          <option value="date-asc">按时间（最旧）</option>
        </select>

        <!-- 视图切换 -->
        <div class="view-toggle">
          <button
            class="view-button"
            :class="{ active: viewMode === 'grid' }"
            @click="viewMode = 'grid'"
          >
            <svg viewBox="0 0 24 24">
              <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
            </svg>
          </button>
          <button
            class="view-button"
            :class="{ active: viewMode === 'list' }"
            @click="viewMode = 'list'"
          >
            <svg viewBox="0 0 24 24">
              <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 来源统计 -->
    <div class="source-stats" v-if="sourceStats.length > 0">
      <span
        v-for="source in sourceStats"
        :key="source.agent"
        class="source-badge"
        :class="source.agent"
      >
        {{ sourceLabels[source.agent] }}: {{ source.count }}
      </span>
    </div>

    <!-- 结果列表 -->
    <div
      class="results-container"
      :class="viewMode"
      ref="resultsContainer"
    >
      <div
        v-for="result in sortedResults"
        :key="result.photoId"
        class="result-item"
        @click="openPhoto(result)"
      >
        <!-- 缩略图 -->
        <div class="thumbnail-wrapper">
          <img
            :src="result.photo.thumbnail || result.photo.path"
            class="thumbnail"
            loading="lazy"
            @error="handleImageError"
          />

          <!-- 相似度分数 -->
          <div class="score-badge" v-if="result.score > 0">
            {{ Math.round(result.score * 100) }}%
          </div>
        </div>

        <!-- 列表视图详情 -->
        <div class="result-details" v-if="viewMode === 'list'">
          <div class="photo-info">
            <span class="filename">{{ result.photo.filename }}</span>
            <span class="date">{{ formatDate(result.photo.date) }}</span>
          </div>

          <!-- 来源标签 -->
          <div class="source-tags">
            <span
              v-for="agent in result.matchedAgents"
              :key="agent"
              class="source-tag"
              :class="agent"
            >
              {{ sourceLabels[agent] }}
            </span>
          </div>

          <!-- 人物标签 -->
          <div class="person-tags" v-if="result.photo.persons?.length">
            <span
              v-for="person in result.photo.persons"
              :key="person.id"
              class="person-tag"
            >
              {{ person.name }}
            </span>
          </div>
        </div>

        <!-- 悬停预览 -->
        <div class="hover-preview">
          <div class="preview-content">
            <img
              :src="result.photo.path"
              class="preview-image"
            />
            <div class="preview-info">
              <span class="preview-score">
                相似度: {{ Math.round(result.score * 100) }}%
              </span>
              <span class="preview-sources">
                来源: {{ result.matchedAgents.map(a => sourceLabels[a]).join(', ') }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 加载更多 -->
    <div v-if="hasMore" class="load-more">
      <button
        v-if="!isLoadingMore"
        class="load-more-button"
        @click="loadMore"
      >
        加载更多
      </button>
      <span v-else class="loading-spinner"></span>
    </div>

    <!-- 无结果 -->
    <div v-if="results.length === 0 && !isSearching" class="no-results">
      <svg viewBox="0 0 24 24" class="no-results-icon">
        <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 0 0 1.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 0 0-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 0 0 5.34-1.48l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14z"/>
      </svg>
      <p>未找到匹配的照片</p>
      <p class="hint">试试其他关键词或调整搜索模式</p>
    </div>
  </div>
</template>
```

### Phase 3: 结果 Store

**文件**: `src/renderer/stores/searchResultsStore.ts`

```typescript
import { defineStore } from 'pinia'

interface SearchResultsState {
  results: SearchResult[]
  totalCount: number
  currentPage: number
  pageSize: number
  isLoading: boolean
  hasMore: boolean
  sortBy: 'relevance' | 'date-desc' | 'date-asc'
  viewMode: 'grid' | 'list'
}

export const useSearchResultsStore = defineStore('searchResults', {
  state: (): SearchResultsState => ({
    results: [],
    totalCount: 0,
    currentPage: 1,
    pageSize: 24,
    isLoading: false,
    hasMore: true,
    sortBy: 'relevance',
    viewMode: 'grid'
  }),

  getters: {
    sortedResults: (state): SearchResult[] => {
      const sorted = [...state.results]

      switch (state.sortBy) {
        case 'relevance':
          return sorted.sort((a, b) => b.score - a.score)
        case 'date-desc':
          return sorted.sort((a, b) =>
            new Date(b.photo.date).getTime() - new Date(a.photo.date).getTime()
          )
        case 'date-asc':
          return sorted.sort((a, b) =>
            new Date(a.photo.date).getTime() - new Date(b.photo.date).getTime()
          )
        default:
          return sorted
      }
    },

    sourceStats: (state): Array<{ agent: string; count: number }> => {
      const stats = new Map<string, number>()

      for (const result of state.results) {
        for (const agent of result.matchedAgents) {
          stats.set(agent, (stats.get(agent) || 0) + 1)
        }
      }

      return [...stats.entries()].map(([agent, count]) => ({ agent, count }))
    }
  },

  actions: {
    async search(query: string, options?: SearchOptions) {
      this.isLoading = true
      this.currentPage = 1
      this.results = []

      try {
        const response = await photoAPI.photos.partySearch(query, {
          ...options,
          limit: this.pageSize
        })

        this.results = response.results
        this.totalCount = response.totalCount
        this.hasMore = this.results.length < response.totalCount
      } finally {
        this.isLoading = false
      }
    },

    async loadMore() {
      if (this.isLoading || !this.hasMore) return

      this.isLoading = true
      this.currentPage++

      try {
        const response = await photoAPI.photos.loadMoreResults({
          offset: this.results.length,
          limit: this.pageSize
        })

        this.results = [...this.results, ...response.results]
        this.hasMore = this.results.length < response.totalCount
      } finally {
        this.isLoading = false
      }
    },

    setSortBy(sortBy: 'relevance' | 'date-desc' | 'date-asc') {
      this.sortBy = sortBy
    },

    setViewMode(viewMode: 'grid' | 'list') {
      this.viewMode = viewMode
    },

    clearResults() {
      this.results = []
      this.totalCount = 0
      this.hasMore = true
    }
  }
})
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `src/renderer/types/search.ts` |
| 新建 | `src/renderer/stores/searchResultsStore.ts` |
| 新建 | `src/renderer/components/search/SearchResults.vue` |

## Dependencies

### 内部依赖
- `src/renderer/stores/searchStore.ts`

### 外部依赖
- 无新增外部依赖

## Testing Approach

### 单元测试
1. **Store 测试**
   - 测试排序逻辑
   - 测试分页加载

### 手动测试
1. **界面测试**
   - 测试网格/列表切换
   - 测试滚动加载
   - 测试图片懒加载

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 网格视图 | 验证照片以网格形式展示 |
| 列表视图 | 验证显示详细信息 |
| 相似度分数 | 验证显示百分比分数 |
| 来源标注 | 验证显示 "语义/关键词/人物" 标签 |
| 无限滚动 | 滚动到底部验证加载更多 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 图片加载慢 | 中 | 懒加载 + 缩略图 |
| 性能问题 | 中 | 虚拟滚动（可选） |

## Related Stories

### 前置依赖
- E-05.1: 搜索界面优化 - 搜索界面

### 后续故事
- E-05.3: 搜索历史记录 - 历史记录

### 相关 stories
- E-03.4: 结果融合 - 融合结果
