# Story E-05.1: 搜索界面优化

## Story Overview

**原始需求描述**:
作为用户，我希望搜索界面更加现代化和易用，支持多种搜索模式和实时搜索建议。

**描述**:
优化搜索界面，包括搜索框设计、搜索模式切换、实时建议、历史记录快捷访问等功能。搜索界面应支持 Party Mode 的混合搜索和多代理搜索。

## Acceptance Criteria

### 功能性需求
- [ ] 搜索框支持实时输入建议
- [ ] 搜索模式切换（关键词/语义/混合）
- [ ] 显示活跃的搜索代理状态
- [ ] 搜索进度指示
- [ ] 支持语音输入（可选）
- [ ] 快捷键支持（Cmd/Ctrl + K）
- [ ] 搜索框响应式设计
- [ ] 支持搜索历史快捷选择

### 非功能性需求
- [ ] 输入响应时间 < 50ms
- [ ] 界面流畅无卡顿
- [ ] 键盘导航支持

## Implementation Steps

### Phase 1: 搜索 Store 扩展

**文件**: `src/renderer/stores/searchStore.ts`

```typescript
import { defineStore } from 'pinia'

interface SearchState {
  query: string
  mode: 'keyword' | 'semantic' | 'hybrid'
  activeAgents: string[]
  isSearching: boolean
  searchProgress: number
  suggestions: SearchSuggestion[]
  recentSearches: string[]
}

interface SearchSuggestion {
  text: string
  type: 'person' | 'keyword' | 'location' | 'time'
  icon: string
}

export const useSearchStore = defineStore('search', {
  state: (): SearchState => ({
    query: '',
    mode: 'hybrid',
    activeAgents: ['keyword', 'semantic', 'people'],
    isSearching: false,
    searchProgress: 0,
    suggestions: [],
    recentSearches: []
  }),

  getters: {
    canSearch: (state) => state.query.length > 0 && !state.isSearching,
    searchParams: (state) => ({
      query: state.query,
      mode: state.mode,
      agents: state.activeAgents
    })
  },

  actions: {
    setQuery(query: string) {
      this.query = query
      if (query.length > 2) {
        this.loadSuggestions(query)
      } else {
        this.suggestions = []
      }
    },

    setMode(mode: 'keyword' | 'semantic' | 'hybrid') {
      this.mode = mode
    },

    toggleAgent(agent: string) {
      const index = this.activeAgents.indexOf(agent)
      if (index === -1) {
        this.activeAgents.push(agent)
      } else if (this.activeAgents.length > 1) {
        this.activeAgents.splice(index, 1)
      }
    },

    async loadSuggestions(query: string) {
      try {
        const result = await photoAPI.photos.getSuggestions(query)
        this.suggestions = result
      } catch (error) {
        console.error('Failed to load suggestions:', error)
      }
    },

    async search() {
      if (!this.query.trim()) return

      this.isSearching = true
      this.searchProgress = 0

      try {
        const result = await photoAPI.photos.partySearch(this.query)
        this.recentSearches.unshift(this.query)
        this.recentSearches = [...new Set(this.recentSearches)].slice(0, 10)

        return result
      } finally {
        this.isSearching = false
        this.searchProgress = 100
      }
    },

    clearSearch() {
      this.query = ''
      this.suggestions = []
    }
  }
})
```

### Phase 2: 搜索组件

**文件**: `src/renderer/components/search/SearchBar.vue`

```vue
<template>
  <div class="search-container" :class="{ focused: isFocused }">
    <!-- 搜索模式指示器 -->
    <div class="mode-indicator">
      <span
        v-for="agent in activeAgents"
        :key="agent"
        class="agent-badge"
        :class="agent"
      >
        {{ agentLabels[agent] }}
      </span>
    </div>

    <!-- 搜索输入框 -->
    <div class="search-input-wrapper">
      <svg class="search-icon" viewBox="0 0 24 24">
        <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 0 0 1.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 0 0-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 0 0 5.34-1.48l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>

      <input
        ref="inputRef"
        v-model="localQuery"
        type="text"
        :placeholder="placeholder"
        class="search-input"
        @focus="isFocused = true"
        @blur="handleBlur"
        @keydown.enter="executeSearch"
        @keydown.down.prevent="selectNextSuggestion"
        @keydown.up.prevent="selectPrevSuggestion"
      />

      <!-- 清除按钮 -->
      <button
        v-if="localQuery"
        class="clear-button"
        @click="clearSearch"
      >
        <svg viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>

      <!-- 搜索按钮 -->
      <button
        class="search-button"
        :disabled="!canSearch"
        @click="executeSearch"
      >
        <svg v-if="!isSearching" viewBox="0 0 24 24">
          <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 0 0 1.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 0 0-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 0 0 5.34-1.48l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <span v-else class="spinner"></span>
      </button>
    </div>

    <!-- 搜索建议 -->
    <div v-if="showSuggestions" class="suggestions-panel">
      <!-- 历史记录 -->
      <div v-if="recentSearches.length > 0 && !localQuery" class="suggestion-section">
        <div class="section-title">最近搜索</div>
        <div
          v-for="(search, index) in recentSearches.slice(0, 5)"
          :key="index"
          class="suggestion-item"
          :class="{ selected: selectedIndex === index }"
          @mousedown="selectSuggestion(search)"
        >
          <svg viewBox="0 0 24 24" class="suggestion-icon">
            <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
          </svg>
          {{ search }}
        </div>
      </div>

      <!-- 实时建议 -->
      <div v-if="suggestions.length > 0" class="suggestion-section">
        <div class="section-title">建议</div>
        <div
          v-for="(suggestion, index) in suggestions"
          :key="index"
          class="suggestion-item"
          :class="{ selected: selectedIndex === suggestions.length + index }"
          @mousedown="selectSuggestion(suggestion.text)"
        >
          <component :is="getSuggestionIcon(suggestion.type)" />
          {{ suggestion.text }}
        </div>
      </div>
    </div>

    <!-- 模式切换 -->
    <div class="mode-switcher">
      <button
        v-for="mode in modes"
        :key="mode.value"
        class="mode-button"
        :class="{ active: currentMode === mode.value }"
        @click="currentMode = mode.value"
      >
        {{ mode.label }}
      </button>
    </div>
  </div>
</template>
```

### Phase 3: 快捷键支持

**文件**: `src/renderer/composables/useSearchHotkeys.ts`

```typescript
import { onMounted, onUnmounted, ref } from 'vue'
import { useSearchStore } from '@/stores/searchStore'

export function useSearchHotkeys() {
  const searchStore = useSearchStore()
  const isSearchOpen = ref(false)

  const handleKeydown = (event: KeyboardEvent) => {
    // Cmd/Ctrl + K 打开搜索
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      isSearchOpen.value = true
      searchStore.focusInput()
    }

    // Escape 关闭搜索
    if (event.key === 'Escape' && isSearchOpen.value) {
      isSearchOpen.value = false
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  return {
    isSearchOpen
  }
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 修改 | `src/renderer/stores/searchStore.ts` |
| 新建 | `src/renderer/components/search/SearchBar.vue` |
| 新建 | `src/renderer/composables/useSearchHotkeys.ts` |
| 修改 | `src/renderer/App.vue` |

## Dependencies

### 内部依赖
- `src/renderer/stores/photoStore.ts`

### 外部依赖
- 无新增外部依赖

## Testing Approach

### 单元测试
1. **Store 测试**
   - 测试状态修改
   - 测试异步操作

2. **组件测试**
   - 测试输入响应
   - 测试快捷键

### 手动测试
1. **界面测试**
   - 测试响应式布局
   - 测试键盘导航
   - 测试快捷键

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 实时输入建议 | 输入 "妈妈"，验证显示人物建议 |
| 模式切换 | 点击模式按钮，验证切换成功 |
| 进度指示 | 执行搜索，验证显示进度 |
| 快捷键 | 按 Cmd+K，验证打开搜索框 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 性能问题 | 中 | 防抖处理 |
| 快捷键冲突 | 低 | 检查现有快捷键 |

## Related Stories

### 前置依赖
- 无

### 后续故事
- E-05.2: 搜索结果展示 - 展示搜索结果
- E-05.3: 搜索历史记录 - 搜索历史

### 相关 stories
- E-03.1: LLM 查询解析 - 后端解析
