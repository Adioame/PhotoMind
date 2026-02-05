# Story E-05.3: 搜索历史记录

## Story Overview

**原始需求描述**:
作为用户，我希望系统能够保存我的搜索历史，这样我可以快速重复之前的搜索操作。

**描述**:
系统保存用户的搜索历史记录，包括搜索关键词、搜索时间、搜索模式等信息。支持历史记录的展示、搜索、删除和管理。

## Acceptance Criteria

### 功能性需求
- [ ] 自动保存搜索历史
- [ ] 显示搜索历史列表
- [ ] 支持按时间排序（最新在前）
- [ ] 支持删除单条历史
- [ ] 支持清空所有历史
- [ ] 支持搜索历史
- [ ] 显示搜索时间
- [ ] 显示搜索模式
- [ ] 支持快速重复搜索

### 非功能性需求
- [ ] 历史记录持久化存储
- [ ] 支持 100 条以上历史
- [ ] 快速检索历史

## Implementation Steps

### Phase 1: 历史记录类型

**文件**: `src/renderer/types/history.ts`

```typescript
interface SearchHistoryItem {
  id: string
  query: string
  timestamp: Date
  mode: 'keyword' | 'semantic' | 'hybrid'
  resultCount?: number
}

interface SearchHistoryState {
  items: SearchHistoryItem[]
  maxItems: number
  isOpen: boolean
}
```

### Phase 2: 历史记录服务

**文件**: `src/renderer/services/searchHistoryService.ts`

```typescript
import { useLocalStorage } from '@vueuse/core'

class SearchHistoryService {
  private storageKey = 'photomind-search-history'
  private maxItems = 100

  // 获取历史记录
  getHistory(): SearchHistoryItem[] {
    const data = localStorage.getItem(this.storageKey)
    if (!data) return []

    try {
      return JSON.parse(data).map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }))
    } catch {
      return []
    }
  }

  // 添加历史记录
  addItem(query: string, mode: string, resultCount?: number): void {
    const items = this.getHistory()

    // 移除相同查询的历史
    const filtered = items.filter(item => item.query !== query)

    // 添加新记录
    const newItem: SearchHistoryItem = {
      id: crypto.randomUUID(),
      query,
      timestamp: new Date(),
      mode: mode as 'keyword' | 'semantic' | 'hybrid',
      resultCount
    }

    // 插入到开头
    filtered.unshift(newItem)

    // 限制数量
    const trimmed = filtered.slice(0, this.maxItems)

    // 保存
    this.saveHistory(trimmed)
  }

  // 删除单条记录
  deleteItem(id: string): void {
    const items = this.getHistory()
    const filtered = items.filter(item => item.id !== id)
    this.saveHistory(filtered)
  }

  // 清空历史
  clearHistory(): void {
    localStorage.removeItem(this.storageKey)
  }

  // 搜索历史
  searchHistory(query: string): SearchHistoryItem[] {
    const items = this.getHistory()
    const lowerQuery = query.toLowerCase()

    return items.filter(item =>
      item.query.toLowerCase().includes(lowerQuery)
    )
  }

  private saveHistory(items: SearchHistoryItem[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(items))
  }
}

export const searchHistoryService = new SearchHistoryService()
```

### Phase 3: 历史记录 Store

**文件**: `src/renderer/stores/searchHistoryStore.ts`

```typescript
import { defineStore } from 'pinia'
import { searchHistoryService } from '@/services/searchHistoryService'

export const useSearchHistoryStore = defineStore('searchHistory', {
  state: () => ({
    items: searchHistoryService.getHistory(),
    maxItems: 100,
    isOpen: false
  }),

  getters: {
    recentItems: (state): SearchHistoryItem[] => {
      return state.items.slice(0, 10)
    },

    searchResults: (state) => {
      return (query: string): SearchHistoryItem[] => {
        if (!query.trim()) return state.items
        const lowerQuery = query.toLowerCase()
        return state.items.filter(item =>
          item.query.toLowerCase().includes(lowerQuery)
        )
      }
    }
  },

  actions: {
    addItem(query: string, mode: string, resultCount?: number) {
      searchHistoryService.addItem(query, mode, resultCount)
      this.items = searchHistoryService.getHistory()
    },

    deleteItem(id: string) {
      searchHistoryService.deleteItem(id)
      this.items = searchHistoryService.getHistory()
    },

    clearHistory() {
      searchHistoryService.clearHistory()
      this.items = []
    },

    toggle() {
      this.isOpen = !this.isOpen
    },

    open() {
      this.isOpen = true
    },

    close() {
      this.isOpen = false
    }
  }
})
```

### Phase 4: 历史记录组件

**文件**: `src/renderer/components/search/SearchHistory.vue`

```vue
<template>
  <div class="search-history" :class="{ open: isOpen }">
    <!-- 历史记录头部 -->
    <div class="history-header">
      <h3 class="history-title">搜索历史</h3>
      <div class="history-actions">
        <button
          v-if="items.length > 0"
          class="clear-button"
          @click="handleClear"
        >
          清空
        </button>
        <button class="close-button" @click="close">
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 历史记录列表 -->
    <div class="history-list" v-if="items.length > 0">
      <div
        v-for="item in items"
        :key="item.id"
        class="history-item"
        @click="selectItem(item)"
      >
        <div class="item-content">
          <div class="item-query">{{ item.query }}</div>
          <div class="item-meta">
            <span class="item-time">{{ formatTime(item.timestamp) }}</span>
            <span class="item-mode" :class="item.mode">
              {{ modeLabels[item.mode] }}
            </span>
            <span v-if="item.resultCount" class="item-count">
              {{ item.resultCount }} 张
            </span>
          </div>
        </div>

        <button
          class="delete-button"
          @click.stop="deleteItem(item.id)"
        >
          <svg viewBox="0 0 24 24">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <svg viewBox="0 0 24 24" class="empty-icon">
        <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
      </svg>
      <p>暂无搜索历史</p>
    </div>
  </div>
</template>
```

### Phase 5: 集成到搜索

**文件**: `src/renderer/components/search/SearchBar.vue`

```typescript
// 搜索完成后保存历史
async function executeSearch() {
  if (!localQuery.value.trim()) return

  const result = await searchStore.search()

  // 保存搜索历史
  searchHistoryStore.addItem(
    localQuery.value,
    searchStore.mode,
    result?.results?.length || 0
  )

  navigateToResults()
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `src/renderer/types/history.ts` |
| 新建 | `src/renderer/services/searchHistoryService.ts` |
| 新建 | `src/renderer/stores/searchHistoryStore.ts` |
| 新建 | `src/renderer/components/search/SearchHistory.vue` |

## Dependencies

### 内部依赖
- `src/renderer/stores/searchStore.ts`

### 外部依赖
- `@vueuse/core`: ^10.0.0（本地存储）

## Testing Approach

### 单元测试
1. **Service 测试**
   - 测试添加历史
   - 测试删除历史
   - 测试搜索历史

### 手动测试
1. **功能测试**
   - 测试历史保存
   - 测试历史删除
   - 测试快速重复搜索

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 自动保存搜索 | 执行搜索，验证历史列表显示 |
| 按时间排序 | 验证最新搜索在前面 |
| 删除单条 | 点击删除，验证移除 |
| 清空历史 | 点击清空，验证全部移除 |
| 快速重复搜索 | 点击历史项，验证执行搜索 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 存储空间 | 低 | 限制100条 |
| 隐私问题 | 中 | 提供清空功能 |

## Related Stories

### 前置依赖
- E-05.1: 搜索界面优化 - 搜索界面

### 后续故事
- 无（Epic 5 完成）

### 相关 stories
- E-05.2: 搜索结果展示 - 搜索结果
