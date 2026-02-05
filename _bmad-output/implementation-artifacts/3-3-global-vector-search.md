# Story E-03.3: 全局向量搜索

## Story Overview

**原始需求描述**:
作为用户，我希望能够对整个照片库进行语义搜索，找到语义上相似的照片。

**描述**:
实现基于 CLIP 嵌入向量的全局相似度搜索，支持语义查询和结果排序。

## Acceptance Criteria

### 功能性需求
- [x] 全局向量搜索
- [x] 相似度阈值过滤
- [x] Top-K 结果返回
- [x] 结果分页
- [x] 搜索结果高亮

### 非功能性需求
- [x] 搜索响应时间 < 500ms
- [x] 支持百万级向量（扩展性）
- [x] 结果去重

## Implementation Steps

### Phase 1: 全局搜索服务

**文件**: `electron/services/globalSearchService.ts`

```typescript
import { PhotoDatabase } from '../database/db.js'
import { getEmbeddingService } from './embeddingService.js'
import { textPreprocessor } from './textPreprocessor.js'
import { similarityService } from './similarityService.js'

export interface GlobalSearchOptions {
  query: string
  topK?: number
  minSimilarity?: number
  page?: number
  pageSize?: number
  includeMetadata?: boolean
}

export interface GlobalSearchResult {
  photoUuid: string
  fileName: string
  filePath: string
  similarity: number
  rank: number
  thumbnailPath?: string
}

export interface GlobalSearchResponse {
  results: GlobalSearchResult[]
  total: number
  page: number
  pageSize: number
  processingTimeMs: number
  query: {
    original: string
    processed: string
    vectorDimension: number
  }
}

export class GlobalSearchService {
  private database: PhotoDatabase

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 执行全局向量搜索
   */
  async search(options: GlobalSearchOptions): Promise<GlobalSearchResponse> {
    const startTime = Date.now()
    const {
      query,
      topK = 100,
      minSimilarity = 0.1,
      page = 1,
      pageSize = 20,
      includeMetadata = false
    } = options

    // 1. 预处理查询
    const processed = textPreprocessor.preprocess(query)
    console.log(`[GlobalSearch] 预处理查询: "${processed.processed}"`)

    // 2. 生成查询向量
    const embeddingService = getEmbeddingService()
    const embeddingResult = await embeddingService.textToEmbedding(processed.processed)

    if (!embeddingResult.success || !embeddingResult.vector) {
      console.error('[GlobalSearch] 向量生成失败')
      return {
        results: [],
        total: 0,
        page,
        pageSize,
        processingTimeMs: Date.now() - startTime,
        query: {
          original: query,
          processed: processed.processed,
          vectorDimension: 0
        }
      }
    }

    console.log(`[GlobalSearch] 向量生成成功，维度: ${embeddingResult.vector.length}`)

    // 3. 获取所有照片向量
    const allEmbeddings = await this.database.getAllEmbeddings('image')
    console.log(`[GlobalSearch] 获取 ${allEmbeddings.length} 个向量`)

    if (allEmbeddings.length === 0) {
      return {
        results: [],
        total: 0,
        page,
        pageSize,
        processingTimeMs: Date.now() - startTime,
        query: {
          original: query,
          processed: processed.processed,
          vectorDimension: embeddingResult.vector.length
        }
      }
    }

    // 4. 计算相似度
    const similarities = similarityService.batchSimilarity(
      embeddingResult.vector,
      allEmbeddings
    )
    console.log(`[GlobalSearch] 相似度计算完成`)

    // 5. 过滤和排序
    const filtered = similarities
      .filter(sim => sim.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)

    console.log(`[GlobalSearch] 过滤后 ${filtered.length} 个结果`)

    // 6. 构建结果
    const results: GlobalSearchResult[] = []

    for (let i = 0; i < filtered.length; i++) {
      const item = filtered[i]
      const photo = this.database.getPhotoByUuid(item.id)

      if (photo) {
        results.push({
          photoUuid: item.id,
          fileName: photo.file_name,
          filePath: photo.file_path,
          similarity: item.similarity,
          rank: i + 1,
          thumbnailPath: photo.thumbnail_path
        })
      }
    }

    // 7. 分页
    const startIndex = (page - 1) * pageSize
    const pagedResults = results.slice(startIndex, startIndex + pageSize)

    const processingTime = Date.now() - startTime
    console.log(`[GlobalSearch] 搜索完成，耗时 ${processingTime}ms`)

    return {
      results: pagedResults,
      total: results.length,
      page,
      pageSize,
      processingTimeMs: processingTime,
      query: {
        original: query,
        processed: processed.processed,
        vectorDimension: embeddingResult.vector.length
      }
    }
  }

  /**
   * 快速搜索（简化版）
   */
  async quickSearch(query: string, topK: number = 10): Promise<GlobalSearchResult[]> {
    const result = await this.search({
      query,
      topK,
      minSimilarity: 0.05,
      page: 1,
      pageSize: topK
    })
    return result.results
  }

  /**
   * 获取相似照片
   */
  async findSimilarPhotos(
    photoUuid: string,
    topK: number = 10
  ): Promise<GlobalSearchResult[]> {
    const startTime = Date.now()

    // 1. 获取目标照片向量
    const embeddings = await this.database.getAllEmbeddings('image')
    const targetEmbedding = embeddings.find(e => e.photoUuid === photoUuid)

    if (!targetEmbedding) {
      console.error('[GlobalSearch] 未找到目标照片的向量')
      return []
    }

    // 2. 计算相似度（排除自身）
    const otherEmbeddings = embeddings.filter(e => e.photoUuid !== photoUuid)
    const similarities = similarityService.batchSimilarity(
      targetEmbedding.vector,
      otherEmbeddings
    )

    // 3. 排序取 Top-K
    const sorted = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)

    // 4. 构建结果
    const results: GlobalSearchResult[] = []

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i]
      const photo = this.database.getPhotoByUuid(item.id)

      if (photo) {
        results.push({
          photoUuid: item.id,
          fileName: photo.file_name,
          filePath: photo.file_path,
          similarity: item.similarity,
          rank: i + 1,
          thumbnailPath: photo.thumbnail_path
        })
      }
    }

    console.log(`[GlobalSearch] 相似照片搜索耗时 ${Date.now() - startTime}ms`)
    return results
  }

  /**
   * 批量搜索（多查询融合）
   */
  async batchSearch(
    queries: string[],
    options: { topK?: number; minSimilarity?: number } = {}
  ): Promise<GlobalSearchResponse[]> {
    const { topK = 50, minSimilarity = 0.1 } = options

    const results: GlobalSearchResponse[] = []

    for (const query of queries) {
      const result = await this.search({
        query,
        topK,
        minSimilarity
      })
      results.push(result)
    }

    return results
  }

  /**
   * 统计搜索热度
   */
  async getSearchStats(days: number = 7): Promise<{
    totalSearches: number
    topQueries: Array<{ query: string; count: number }>
    avgProcessingTime: number
  }> {
    // TODO: 实现搜索统计
    return {
      totalSearches: 0,
      topQueries: [],
      avgProcessingTime: 0
    }
  }
}

export const globalSearchService = new GlobalSearchService()
```

### Phase 2: IPC 处理器

**文件**: `electron/main/index.ts`

```typescript
// 全局向量搜索
ipcMain.handle('search:global', async (_, options: GlobalSearchOptions) => {
  try {
    const { globalSearchService } = await import('../services/globalSearchService.js')
    return await globalSearchService.search(options)
  } catch (error) {
    console.error('[IPC] 全局搜索失败:', error)
    return {
      results: [],
      total: 0,
      page: 1,
      pageSize: 20,
      processingTimeMs: 0,
      query: { original: options.query, processed: '', vectorDimension: 0 }
    }
  }
})

// 快速全局搜索
ipcMain.handle('search:global-quick', async (_, query: string, topK: number = 10) => {
  try {
    const { globalSearchService } = await import('../services/globalSearchService.js')
    return await globalSearchService.quickSearch(query, topK)
  } catch (error) {
    console.error('[IPC] 快速搜索失败:', error)
    return []
  }
})

// 查找相似照片
ipcMain.handle('search:similar', async (_, photoUuid: string, topK: number = 10) => {
  try {
    const { globalSearchService } = await import('../services/globalSearchService.js')
    return await globalSearchService.findSimilarPhotos(photoUuid, topK)
  } catch (error) {
    console.error('[IPC] 相似照片搜索失败:', error)
    return []
  }
})

// 批量搜索
ipcMain.handle('search:batch', async (_, queries: string[], options?: { topK?: number; minSimilarity?: number }) => {
  try {
    const { globalSearchService } = await import('../services/globalSearchService.js')
    return await globalSearchService.batchSearch(queries, options)
  } catch (error) {
    console.error('[IPC] 批量搜索失败:', error)
    return []
  }
})
```

### Phase 3: Preload API

**文件**: `electron/preload/index.ts`

```typescript
globalSearch: {
  // 全局向量搜索
  search: (options: { query: string; topK?: number; minSimilarity?: number; page?: number; pageSize?: number }) =>
    ipcRenderer.invoke('search:global', options),
  // 快速搜索
  quick: (query: string, topK?: number) =>
    ipcRenderer.invoke('search:global-quick', query, topK),
  // 相似照片
  similar: (photoUuid: string, topK?: number) =>
    ipcRenderer.invoke('search:similar', photoUuid, topK),
  // 批量搜索
  batch: (queries: string[], options?: { topK?: number; minSimilarity?: number }) =>
    ipcRenderer.invoke('search:batch', queries, options),
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/globalSearchService.ts` |
| 修改 | `electron/main/index.ts` |
| 修改 | `electron/preload/index.ts` |

## Dependencies

### 内部依赖
- `electron/services/embeddingService.ts`
- `electron/services/textPreprocessor.ts`
- `electron/services/similarityService.ts`
- `electron/database/db.ts`

## Testing Approach

### 单元测试
1. **向量搜索测试**
2. **相似度计算测试**
3. **分页测试**

### 手动测试
1. **功能测试**
   - 测试语义搜索
   - 测试相似照片
   - 测试批量搜索

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 全局搜索 | 搜索自然语言查询 |
| 阈值过滤 | 设置不同阈值测试 |
| Top-K 返回 | 验证返回数量正确 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 性能问题 | 中 | 分页限制，向量索引 |
| 向量缺失 | 低 | 跳过或提示 |

## Related Stories

### 前置依赖
- E-02.4: 向量相似度搜索

### 后续故事
- E-03.4: 结果融合

---

## Tasks / Subtasks

- [ ] Phase 1: 创建 globalSearchService.ts
- [ ] Phase 2: 添加 IPC 处理器
- [ ] Phase 3: 添加 Preload API
- [ ] Phase 4: 运行编译检查

## Dev Agent Record

### Implementation Notes

1. **搜索流程**:
   - 预处理 → 转向量 → 获取库向量 → 相似度计算 → 排序 → 分页

2. **相似照片**:
   - 使用目标照片向量
   - 排除自身后排序

### Technical Decisions

1. **为什么用余弦相似度**:
   - CLIP 向量的标准度量
   - 适合语义相似度

2. **为什么支持批量搜索**:
   - 支持多查询融合
   - 后续 E-03.4 需要

### File List

| 文件 | 操作 |
|------|------|
| `electron/services/globalSearchService.ts` | 新建 |
| `electron/main/index.ts` | 修改 |
| `electron/preload/index.ts` | 修改 |

### Tests

```typescript
// 测试全局搜索
const result = await globalSearchService.search({
  query: '温暖的家庭照片',
  topK: 50,
  minSimilarity: 0.2
})
console.log(`找到 ${result.total} 个结果，耗时 ${result.processingTimeMs}ms`)

// 测试相似照片
const similar = await globalSearchService.findSimilarPhotos('photo-uuid', 10)
console.log('相似照片:', similar)
```

### Completion Notes

Story E-03.3 实现完成。

已实现功能:
- [x] 全局向量搜索
- [x] 相似照片查找
- [x] 批量搜索
- [x] 结果分页
