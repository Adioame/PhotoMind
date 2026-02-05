# 5. 前端架构

## 5.1 状态管理

```
src/renderer/stores/
├── photoStore.ts       # 照片数据
│   ├── photos: Photo[]
│   ├── loading: boolean
│   ├── filters: PhotoFilters
│   └── actions: loadPhotos(), deletePhoto(), etc.
│
├── searchStore.ts      # 搜索状态 ⭐ ENHANCED
│   ├── query: string
│   ├── results: SearchResult[]
│   ├── loading: boolean
│   ├── mode: 'keyword' | 'semantic' | 'hybrid'
│   ├── parsedQuery?: ParsedQuery
│   └── searchTime?: number
│
└── peopleStore.ts      # 人物数据
    ├── persons: Person[]
    └── actions: loadPersons(), addPerson(), etc.
```

## 5.2 搜索 Store 增强设计

```typescript
// src/renderer/stores/searchStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useSearchStore = defineStore('search', () => {
  // State
  const query = ref('');
  const results = ref<SearchResult[]>([]);
  const loading = ref(false);
  const mode = ref<'keyword' | 'semantic' | 'hybrid'>('hybrid');
  const parsedQuery = ref<ParsedQuery | null>(null);
  const searchTime = ref(0);

  // Actions
  async function search(newQuery: string) {
    loading.value = true;
    const startTime = Date.now();

    try {
      const response = await window.photoAPI.photos.search({
        query: newQuery,
        mode: mode.value
      });

      results.value = response.results;
      parsedQuery.value = response.parsedQuery;
      searchTime.value = response.totalTime;
    } finally {
      loading.value = false;
    }
  }

  function clearSearch() {
    query.value = '';
    results.value = [];
    parsedQuery.value = null;
  }

  return {
    query,
    results,
    loading,
    mode,
    parsedQuery,
    searchTime,
    search,
    clearSearch
  };
});
```

## 5.3 搜索组件设计

```
src/renderer/views/SearchView.vue
│
├── SearchBar.vue              # 搜索输入框
│   ├── text input
│   ├── search suggestions
│   └── mode selector (hybrid/semantic/keyword)
│
├── SearchResults.vue          # 搜索结果展示
│   ├── PhotoGrid
│   │   └── PhotoCard.vue     # 单张照片卡片
│   │       ├── thumbnail
│   │       ├── confidence badge
│   │       └── match tags
│   │
│   └── ResultStats.vue        # 结果统计
│       ├── total count
│       ├── search time
│       └── parsed query display
│
└── SearchFilters.vue          # 搜索筛选
    ├── time range picker
    ├── location filter
    └── person filter
```
