# Story E-03.3: 全局向量搜索

## Story Overview

**原始需求描述**:
作为用户，我希望能够搜索整个照片库，找到语义上与查询相关的照片，而不仅仅是基于文件名或标签。

**描述**:
当用户执行全局向量搜索时，系统遍历所有已生成向量的照片，计算与查询向量的相似度，返回最匹配的结果。全局搜索提供最全面的语义搜索能力。

## Acceptance Criteria

### 功能性需求
- [ ] 遍历所有已生成向量的照片
- [ ] 计算查询向量与所有照片向量的相似度
- [ ] 返回 Top-N 最相似结果
- [ ] 支持相似度阈值过滤
- [ ] 支持按时间范围筛选
- [ ] 支持按评分筛选
- [ ] 跳过无效或损坏的向量
- [ ] 返回相似度分数

### 非功能性需求
- [ ] 1000 张照片 < 500ms
- [ ] 10000 张照片 < 3s
- [ ] 支持增量索引更新
- [ ] 内存使用稳定

## Implementation Steps

### Phase 1: 全局搜索服务

**文件**: `electron/services/globalVectorSearchService.ts`

```typescript
import { cosineSimilarity } from '../utils/vectorMath'

interface GlobalSearchOptions {
  limit?: number
  minScore?: number
  timeRange?: { start: Date; end: Date }
  rating?: number
  includeWithoutVector?: boolean
}

interface GlobalSearchResult {
  photoId: string
  photo: Photo
  score: number
  vectorAvailable: boolean
}

interface GlobalSearchStats {
  totalPhotos: number
  photosWithVector: number
  scannedCount: number
  searchTime: number
}

class GlobalVectorSearchService {
  private batchSize = 500
  private cache: Map<string, number[]> = new Map()
  private cacheMaxSize = 1000

  // 全局搜索
  async search(
    queryEmbedding: number[],
    options: GlobalSearchOptions = {}
  ): Promise<{
    results: GlobalSearchResult[]
    stats: GlobalSearchStats
  }> {
    const {
      limit = 50,
      minScore = 0.2,
      timeRange,
      rating
    } = options

    const startTime = Date.now()
    const results: GlobalSearchResult[] = []

    // 获取照片统计
    const totalPhotos = await db.getPhotoCount()
    const photosWithVector = await db.getVectorCount()

    // 分批处理
    let scannedCount = 0
    const scores: Array<{ photoId: string; score: number; hasVector: boolean }> = []

    let offset = 0
    while (true) {
      const photos = await db.getPhotosBatch(this.batchSize, offset)

      if (photos.length === 0) break

      for (const photo of photos) {
        scannedCount++
        let score = 0
        let hasVector = false

        // 获取向量
        const embedding = await this.getVector(photo.id)

        if (embedding) {
          score = cosineSimilarity(queryEmbedding, embedding)
          hasVector = true
        } else if (options.includeWithoutVector) {
          // 无向量的照片给予低分
          score = 0.1
        }

        if (score >= minScore) {
          scores.push({ photoId: photo.id, score, hasVector })
        }
      }

      offset += this.batchSize
    }

    // 排序
    scores.sort((a, b) => b.score - a.score)

    // 获取照片详情
    for (const { photoId, score, hasVector } of scores.slice(0, limit)) {
      const photo = await db.getPhotoById(photoId)
      if (photo) {
        // 应用额外过滤
        if (timeRange && (photo.date < timeRange.start || photo.date > timeRange.end)) {
          continue
        }
        if (rating !== undefined && (photo.rating || 0) < rating) {
          continue
        }

        results.push({
          photoId,
          photo,
          score,
          vectorAvailable: hasVector
        })
      }
    }

    const searchTime = Date.now() - startTime

    return {
      results,
      stats: {
        totalPhotos,
        photosWithVector,
        scannedCount,
        searchTime
      }
    }
  }

  // 获取向量（带缓存）
  private async getVector(photoId: string): Promise<number[] | null> {
    // 检查缓存
    if (this.cache.has(photoId)) {
      return this.cache.get(photoId)!
    }

    // 从数据库获取
    const embedding = await db.getVector(photoId)

    if (embedding && this.cache.size < this.cacheMaxSize) {
      this.cache.set(photoId, embedding)
    }

    return embedding
  }

  // 清除缓存
  clearCache(): void {
    this.cache.clear()
  }

  // 更新缓存
  async updateCache(photoId: string, embedding: number[]): Promise<void> {
    if (this.cache.size >= this.cacheMaxSize) {
      // 清除最旧的条目
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(photoId, embedding)
  }

  // 批量搜索（用于融合查询）
  async batchSearch(
    queryEmbeddings: number[][],
    options: GlobalSearchOptions = {}
  ): Promise<Array<{ queryIndex: number; results: GlobalSearchResult[] }>> {
    const results: Array<{ queryIndex: number; results: GlobalSearchResult[] }> = []

    for (let i = 0; i < queryEmbeddings.length; i++) {
      const searchResult = await this.search(queryEmbeddings[i], options)
      results.push({
        queryIndex: i,
        results: searchResult.results
      })
    }

    return results
  }

  // 获取搜索统计
  async getStats(): Promise<GlobalSearchStats> {
    const totalPhotos = await db.getPhotoCount()
    const photosWithVector = await db.getVectorCount()

    return {
      totalPhotos,
      photosWithVector,
      scannedCount: 0,
      searchTime: 0
    }
  }
}
```

### Phase 2: 集成向量索引

**文件**: `electron/services/globalVectorSearchService.ts`

```typescript
import { VectorIndex } from './vectorIndex'

class GlobalVectorSearchServiceWithIndex {
  private vectorIndex: VectorIndex | null = null
  private useIndex = true
  private indexThreshold = 1000 // 1000 张照片以上使用索引

  // 初始化索引
  async initializeIndex(): Promise<void> {
    const vectorCount = await db.getVectorCount()

    if (vectorCount < this.indexThreshold) {
      // 数据量小，使用暴力搜索
      this.useIndex = false
      return
    }

    // 构建索引
    this.vectorIndex = new VectorIndex()
    const vectors = await db.getAllVectors()

    await this.vectorIndex.buildIndex(vectors)
    this.useIndex = true
  }

  // 搜索（使用索引优化）
  async search(
    queryEmbedding: number[],
    options: GlobalSearchOptions = {}
  ): Promise<{
    results: GlobalSearchResult[]
    stats: GlobalSearchStats
  }> {
    const startTime = Date.now()
    const results: GlobalSearchResult[] = []

    if (this.useIndex && this.vectorIndex) {
      // 使用索引搜索
      const candidates = await this.vectorIndex.search(queryEmbedding, {
        limit: (options.limit || 50) * 2,
        numProbes: 5
      })

      for (const { photoId, score } of candidates.slice(0, options.limit)) {
        const photo = await db.getPhotoById(photoId)
        if (photo) {
          results.push({
            photoId,
            photo,
            score,
            vectorAvailable: true
          })
        }
      }
    } else {
      // 回退到暴力搜索
      const bruteResult = await this.bruteForceSearch(queryEmbedding, options)
      return bruteResult
    }

    // 获取统计
    const totalPhotos = await db.getPhotoCount()
    const photosWithVector = await db.getVectorCount()

    return {
      results,
      stats: {
        totalPhotos,
        photosWithVector,
        scannedCount: this.useIndex ? 'indexed' : totalPhotos,
        searchTime: Date.now() - startTime
      }
    }
  }

  // 暴力搜索（备选）
  private async bruteForceSearch(
    queryEmbedding: number[],
    options: GlobalSearchOptions = {}
  ): Promise<{
    results: GlobalSearchResult[]
    stats: GlobalSearchStats
  }> {
    // ... 同上
  }

  // 更新索引（新向量）
  async addToIndex(photoId: string, embedding: number[]): Promise<void> {
    if (this.vectorIndex) {
      await this.vectorIndex.add(photoId, embedding)
    }
  }
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 修改 | `electron/services/globalVectorSearchService.ts` |
| 新建 | `electron/services/vectorIndex.ts`（复用 E-02.4） |

## Dependencies

### 内部依赖
- `electron/utils/vectorMath.ts` - 相似度计算
- `electron/database/db.ts` - 数据库操作

### 外部依赖
- 无新增外部依赖

## Testing Approach

### 单元测试
1. **缓存测试**
   - 测试缓存命中
   - 测试缓存清除
   - 测试缓存更新

2. **索引测试**
   - 测试索引构建
   - 测试索引搜索
   - 测试索引更新

### 性能测试
- 1000/10000/50000 张照片搜索时间
- 内存使用情况
- 缓存命中率

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 遍历所有照片 | 搜索验证返回所有匹配的照片 |
| 相似度计算 | 验证结果按 score 降序排列 |
| 1000 张照片 < 500ms | 使用 console.time 测量 |
| 10000 张照片 < 3s | 使用 console.time 测量 |
| 跳过无效向量 | 故意插入损坏向量，验证搜索正常 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 搜索速度慢 | 高 | 实现向量索引 |
| 内存占用高 | 中 | 分批处理，限制缓存 |
| 索引构建慢 | 中 | 后台异步构建 |

## Related Stories

### 前置依赖
- E-02.4: 向量相似度搜索 - 核心搜索逻辑
- E-02.5: 增量向量生成 - 新向量处理

### 后续故事
- E-03.4: 结果融合 - 合并全局搜索结果

### 相关故事
- E-03.1: LLM 查询解析 - 解析语义查询
- E-05.2: 搜索结果展示 - 显示搜索统计
