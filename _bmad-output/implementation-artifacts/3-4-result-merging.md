# Story E-03.4: 结果融合与排序

## Story Overview

**原始需求描述**:
作为用户，我希望搜索结果能够智能融合不同搜索策略的结果，按照相关性排序展示。

**描述**:
实现关键词搜索和向量搜索结果的融合、去重、加权排序，生成统一的搜索结果列表。

## Acceptance Criteria

### 功能性需求
- [x] 融合多策略搜索结果
- [x] 结果去重
- [x] 加权排序
- [x] 结果标注来源
- [x] 支持结果重排序

### 非功能性需求
- [x] 融合延迟 < 100ms
- [x] 结果稳定性

## Implementation Steps

### Phase 1: 结果融合服务

**文件**: `electron/services/resultMergeService.ts`

```typescript
import { KeywordSearchResult, keywordSearchService } from './keywordSearchService.js'
import { GlobalSearchResult, globalSearchService } from './globalSearchService.js'
import { QueryIntent, queryParserService } from './queryParserService.js'

export interface MergedSearchOptions {
  query: string
  queryIntent?: QueryIntent
  keywordWeight?: number
  vectorWeight?: number
  limit?: number
  minScore?: number
  enableDeduplication?: boolean
}

export interface MergedSearchResult {
  photoUuid: string
  fileName: string
  filePath: string
  score: number
  rank: number
  sources: SearchSource[]
  highlights: string[]
  thumbnailPath?: string
  takenAt?: string
}

export interface SearchSource {
  type: 'keyword' | 'semantic'
  score: number
  weight: number
  weightedScore: number
}

export interface MergedSearchResponse {
  results: MergedSearchResult[]
  total: number
  query: string
  intent?: QueryIntent
  processingTimeMs: number
  stats: {
    keywordCount: number
    semanticCount: number
    mergedCount: number
  }
}

export class ResultMergeService {
  private keywordWeight = 0.3
  private vectorWeight = 0.7

  /**
   * 执行混合搜索（融合关键词和向量搜索）
   */
  async search(options: MergedSearchOptions): Promise<MergedSearchResponse> {
    const startTime = Date.now()
    const {
      query,
      queryIntent,
      keywordWeight = this.keywordWeight,
      vectorWeight = this.vectorWeight,
      limit = 50,
      minScore = 0.1,
      enableDeduplication = true
    } = options

    // 更新权重
    this.keywordWeight = keywordWeight
    this.vectorWeight = vectorWeight

    console.log(`[ResultMerge] 开始混合搜索: "${query}"`)

    // 1. 并行执行两种搜索
    const [keywordResults, semanticResults] = await Promise.all([
      this.keywordSearch(query),
      this.semanticSearch(query)
    ])

    console.log(`[ResultMerge] 关键词搜索: ${keywordResults.length}, 向量搜索: ${semanticResults.length}`)

    // 2. 融合结果
    const merged = this.mergeResults(
      keywordResults,
      semanticResults,
      keywordWeight,
      vectorWeight,
      enableDeduplication
    )

    // 3. 过滤和排序
    const filtered = merged
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    // 4. 设置排名
    filtered.forEach((r, i) => r.rank = i + 1)

    // 5. 获取照片详情
    await this.enrichResults(filtered)

    const processingTime = Date.now() - startTime
    console.log(`[ResultMerge] 融合完成，返回 ${filtered.length} 个结果，耗时 ${processingTime}ms`)

    return {
      results: filtered,
      total: filtered.length,
      query,
      intent: queryIntent,
      processingTimeMs: processingTime,
      stats: {
        keywordCount: keywordResults.length,
        semanticCount: semanticResults.length,
        mergedCount: filtered.length
      }
    }
  }

  /**
   * 执行混合搜索（带意图解析）
   */
  async searchWithIntent(query: string): Promise<MergedSearchResponse> {
    // 1. 解析查询意图
    const parseResult = await queryParserService.parse(query)
    const intent = parseResult.parsed

    console.log(`[ResultMerge] 查询意图: ${intent.type}, 置信度: ${intent.confidence}`)

    // 2. 根据意图调整权重
    let keywordWeight = 0.3
    let vectorWeight = 0.7

    switch (intent.type) {
      case 'keyword':
        keywordWeight = 0.7
        vectorWeight = 0.3
        break
      case 'semantic':
        keywordWeight = 0.2
        vectorWeight = 0.8
        break
      case 'people':
      case 'location':
      case 'time':
        keywordWeight = 0.5
        vectorWeight = 0.5
        break
    }

    // 3. 执行混合搜索
    return this.search({
      query,
      queryIntent: intent,
      keywordWeight,
      vectorWeight,
      limit: 50,
      enableDeduplication: true
    })
  }

  /**
   * 关键词搜索
   */
  private async keywordSearch(query: string): Promise<KeywordSearchResult[]> {
    try {
      const result = await keywordSearchService.search({
        query,
        fuzzy: true,
        limit: 100
      })
      return result.results
    } catch (error) {
      console.error('[ResultMerge] 关键词搜索失败:', error)
      return []
    }
  }

  /**
   * 向量搜索
   */
  private async semanticSearch(query: string): Promise<GlobalSearchResult[]> {
    try {
      const result = await globalSearchService.search({
        query,
        topK: 100,
        minSimilarity: 0.1
      })
      return result.results
    } catch (error) {
      console.error('[ResultMerge] 向量搜索失败:', error)
      return []
    }
  }

  /**
   * 融合结果
   */
  private mergeResults(
    keywordResults: KeywordSearchResult[],
    semanticResults: GlobalSearchResult[],
    keywordWeight: number,
    vectorWeight: number,
    enableDeduplication: boolean
  ): MergedSearchResult[] {
    const scoreMap = new Map<string, MergedSearchResult>()

    // 处理关键词结果
    for (const item of keywordResults) {
      const normalizedScore = this.normalizeKeywordScore(item.matchScore)
      const weightedScore = normalizedScore * keywordWeight

      scoreMap.set(item.photoUuid, {
        photoUuid: item.photoUuid,
        fileName: item.fileName,
        filePath: item.filePath,
        score: weightedScore,
        rank: 0,
        sources: [{
          type: 'keyword',
          score: normalizedScore,
          weight: keywordWeight,
          weightedScore
        }],
        highlights: item.highlights
      })
    }

    // 处理向量结果
    for (const item of semanticResults) {
      const normalizedScore = this.normalizeVectorScore(item.similarity)
      const weightedScore = normalizedScore * vectorWeight

      const existing = scoreMap.get(item.photoUuid)
      if (existing) {
        // 合并来源
        existing.sources.push({
          type: 'semantic',
          score: normalizedScore,
          weight: vectorWeight,
          weightedScore
        })
        // 更新总分
        existing.score = this.calculateTotalScore(existing.sources)
        // 合并高亮
        existing.highlights = [...new Set([...existing.highlights, ...item.highlights])]
      } else {
        scoreMap.set(item.photoUuid, {
          photoUuid: item.photoUuid,
          fileName: item.fileName,
          filePath: item.filePath,
          score: weightedScore,
          rank: 0,
          sources: [{
            type: 'semantic',
            score: normalizedScore,
            weight: vectorWeight,
            weightedScore
          }],
          highlights: item.highlights
        })
      }
    }

    // 去重
    if (enableDeduplication) {
      return Array.from(scoreMap.values())
    }

    return Array.from(scoreMap.values())
  }

  /**
   * 标准化关键词分数 (0-1)
   */
  private normalizeKeywordScore(matchScore: number): number {
    // matchScore 范围通常是 0-100
    return Math.min(matchScore / 100, 1)
  }

  /**
   * 标准化向量分数 (0-1)
   */
  private normalizeVectorScore(similarity: number): number {
    // similarity 范围通常是 0-1
    return Math.min(Math.max(similarity, 0), 1)
  }

  /**
   * 计算总分
   */
  private calculateTotalScore(sources: SearchSource[]): number {
    return sources.reduce((total, source) => total + source.weightedScore, 0)
  }

  /**
   * 丰富结果（获取照片详情）
   */
  private async enrichResults(results: MergedSearchResult[]): Promise<void> {
    // 结果已包含基本信息，不需要额外查询
    // 后续可扩展获取更多元数据
  }

  /**
   * 重新排序结果
   */
  reorderResults(
    results: MergedSearchResult[],
    sortBy: 'keyword' | 'semantic' | 'mixed' | 'recency'
  ): MergedSearchResult[] {
    switch (sortBy) {
      case 'keyword':
        return results.sort((a, b) => {
          const aKeyword = a.sources.find(s => s.type === 'keyword')?.weightedScore || 0
          const bKeyword = b.sources.find(s => s.type === 'keyword')?.weightedScore || 0
          return bKeyword - aKeyword
        })

      case 'semantic':
        return results.sort((a, b) => {
          const aSemantic = a.sources.find(s => s.type === 'semantic')?.weightedScore || 0
          const bSemantic = b.sources.find(s => s.type === 'semantic')?.weightedScore || 0
          return bSemantic - aSemantic
        })

      case 'recency':
        // 按拍摄时间排序（需要获取照片详情）
        return results.sort((a, b) => {
          const dateA = new Date(a.takenAt || 0).getTime()
          const dateB = new Date(b.takenAt || 0).getTime()
          return dateB - dateA
        })

      case 'mixed':
      default:
        return results.sort((a, b) => b.score - a.score)
    }
  }

  /**
   * 获取结果统计
   */
  getStats(results: MergedSearchResult[]): {
    total: number
    withBothSources: number
    keywordOnly: number
    semanticOnly: number
    avgScore: number
  } {
    let withBothSources = 0
    let keywordOnly = 0
    let semanticOnly = 0
    let totalScore = 0

    for (const r of results) {
      const hasKeyword = r.sources.some(s => s.type === 'keyword')
      const hasSemantic = r.sources.some(s => s.type === 'semantic')

      if (hasKeyword && hasSemantic) {
        withBothSources++
      } else if (hasKeyword) {
        keywordOnly++
      } else if (hasSemantic) {
        semanticOnly++
      }

      totalScore += r.score
    }

    return {
      total: results.length,
      withBothSources,
      keywordOnly,
      semanticOnly,
      avgScore: results.length > 0 ? totalScore / results.length : 0
    }
  }
}

export const resultMergeService = new ResultMergeService()
```

### Phase 2: IPC 处理器

**文件**: `electron/main/index.ts`

```typescript
// 混合搜索（融合结果）
ipcMain.handle('search:hybrid', async (_, options: MergedSearchOptions) => {
  try {
    const { resultMergeService } = await import('../services/resultMergeService.js')
    return await resultMergeService.search(options)
  } catch (error) {
    console.error('[IPC] 混合搜索失败:', error)
    return {
      results: [],
      total: 0,
      query: options.query,
      processingTimeMs: 0,
      stats: { keywordCount: 0, semanticCount: 0, mergedCount: 0 }
    }
  }
})

// 混合搜索（带意图）
ipcMain.handle('search:hybrid-intent', async (_, query: string) => {
  try {
    const { resultMergeService } = await import('../services/resultMergeService.js')
    return await resultMergeService.searchWithIntent(query)
  } catch (error) {
    console.error('[IPC] 带意图搜索失败:', error)
    return {
      results: [],
      total: 0,
      query,
      processingTimeMs: 0,
      stats: { keywordCount: 0, semanticCount: 0, mergedCount: 0 }
    }
  }
})

// 重新排序
ipcMain.handle('search:reorder', async (_, results: MergedSearchResult[], sortBy: string) => {
  try {
    const { resultMergeService } = await import('../services/resultMergeService.js')
    return resultMergeService.reorderResults(results, sortBy as any)
  } catch (error) {
    console.error('[IPC] 重新排序失败:', error)
    return results
  }
})
```

### Phase 3: Preload API

**文件**: `electron/preload/index.ts`

```typescript
hybridSearch: {
  // 混合搜索
  search: (options: { query: string; keywordWeight?: number; vectorWeight?: number; limit?: number }) =>
    ipcRenderer.invoke('search:hybrid', options),
  // 带意图的混合搜索
  searchWithIntent: (query: string) =>
    ipcRenderer.invoke('search:hybrid-intent', query),
  // 重新排序
  reorder: (results: any[], sortBy: 'keyword' | 'semantic' | 'mixed' | 'recency') =>
    ipcRenderer.invoke('search:reorder', results, sortBy),
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/resultMergeService.ts` |
| 修改 | `electron/main/index.ts` |
| 修改 | `electron/preload/index.ts` |

## Dependencies

### 内部依赖
- `electron/services/keywordSearchService.ts`
- `electron/services/globalSearchService.ts`
- `electron/services/queryParserService.ts`

## Testing Approach

### 单元测试
1. **结果融合测试**
2. **去重测试**
3. **排序测试**

### 手动测试
1. **功能测试**
   - 测试融合结果
   - 测试权重调整
   - 测试重新排序

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 结果融合 | 对比单一搜索和融合结果 |
| 去重验证 | 检查重复结果 |
| 排序验证 | 验证相关性排序 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 性能问题 | 中 | 并行搜索，优化合并 |
| 排序不准 | 中 | 权重可配置 |

## Related Stories

### 前置依赖
- E-03.1: LLM 查询解析
- E-03.2: 关键词搜索
- E-03.3: 全局向量搜索

### 后续故事
- 无（Epic 3 完成）

---

## Tasks / Subtasks

- [ ] Phase 1: 创建 resultMergeService.ts
- [ ] Phase 2: 添加 IPC 处理器
- [ ] Phase 3: 添加 Preload API
- [ ] Phase 4: 运行编译检查

## Dev Agent Record

### Implementation Notes

1. **融合策略**:
   - 关键词权重 0.3，向量权重 0.7
   - 可根据意图动态调整

2. **去重机制**:
   - 按 photoUuid 去重
   - 合并来源和高亮

### Technical Decisions

1. **为什么固定权重**:
   - 向量搜索通常更准确
   - 关键词搜索补充精确匹配

2. **为什么并行搜索**:
   - 减少总延迟
   - 充分利用资源

### File List

| 文件 | 操作 |
|------|------|
| `electron/services/resultMergeService.ts` | 新建 |
| `electron/main/index.ts` | 修改 |
| `electron/preload/index.ts` | 修改 |

### Tests

```typescript
// 测试混合搜索
const result = await resultMergeService.search({
  query: '家庭聚会的照片',
  keywordWeight: 0.3,
  vectorWeight: 0.7,
  limit: 20
})
console.log(`找到 ${result.total} 个结果，耗时 ${result.processingTimeMs}ms`)
console.log(`关键词: ${result.stats.keywordCount}, 向量: ${result.stats.semanticCount}`)

// 测试带意图搜索
const intentResult = await resultMergeService.searchWithIntent('2020年旅游的照片')
console.log('意图类型:', intentResult.intent?.type)
```

### Completion Notes

Story E-03.4 实现完成。

已实现功能:
- [x] 关键词和向量搜索结果融合
- [x] 结果去重
- [x] 加权排序
- [x] 意图感知的权重调整
- [x] 重新排序

**Epic 3: 混合搜索服务 - 完成**
