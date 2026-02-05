# Story E-03.2: 关键词搜索

## Story Overview

**原始需求描述**:
作为用户，我希望能够通过关键词搜索照片，例如输入"猫"找到所有包含猫的照片。

**描述**:
系统提供传统的关键词搜索功能，基于照片的元数据（文件名、EXIF 标签、标题、描述）进行匹配。关键词搜索作为基础搜索策略，与语义搜索形成互补。

## Acceptance Criteria

### 功能性需求
- [ ] 支持文件名匹配
- [ ] 支持 EXIF 标签匹配
- [ ] 支持标题和描述搜索
- [ ] 支持多个关键词组合（AND/OR）
- [ ] 不区分大小写匹配
- [ ] 支持部分匹配（substring）
- [ ] 返回结果按相关性排序
- [ ] 支持结果数量限制
- [ ] 空查询返回所有照片

### 非功能性需求
- [ ] 10000 张照片搜索时间 < 200ms
- [ ] 支持高并发查询
- [ ] 搜索结果可复现

## Implementation Steps

### Phase 1: 关键词搜索服务

**文件**: `electron/services/keywordSearchService.ts`

```typescript
interface KeywordSearchOptions {
  fields?: ('filename' | 'tags' | 'title' | 'description')[]
  mode?: 'AND' | 'OR'
  limit?: number
  minScore?: number
}

interface SearchablePhoto {
  id: string
  filename: string
  tags: string[]
  title?: string
  description?: string
  date: Date
  rating?: number
}

class KeywordSearchService {
  private index: Map<string, Set<string>> = new Map()

  // 构建搜索索引
  async buildIndex(photos: SearchablePhoto[]): Promise<void> {
    this.index.clear()

    for (const photo of photos) {
      // 索引文件名
      this.indexFile(photo.id, photo.filename)

      // 索引标签
      for (const tag of photo.tags) {
        this.indexFile(photo.id, tag)
      }

      // 索引标题
      if (photo.title) {
        this.indexFile(photo.id, photo.title)
      }

      // 索引描述
      if (photo.description) {
        this.indexFile(photo.id, photo.description)
      }
    }
  }

  private indexFile(photoId: string, text: string): void {
    const normalized = this.normalize(text)
    const tokens = this.tokenize(normalized)

    for (const token of tokens) {
      if (!this.index.has(token)) {
        this.index.set(token, new Set())
      }
      this.index.get(token)!.add(photoId)
    }
  }

  // 搜索
  async search(
    query: string,
    options: KeywordSearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      fields = ['filename', 'tags', 'title', 'description'],
      mode = 'AND',
      limit = 50
    } = options

    // 规范化查询
    const normalizedQuery = this.normalize(query)
    const queryTokens = this.tokenize(normalizedQuery)

    if (queryTokens.length === 0) {
      return []
    }

    // 收集匹配的照片
    const photoScores = new Map<string, number>()
    const photoMatches = new Map<string, Set<string>>()

    for (const token of queryTokens) {
      const matchingPhotos = this.index.get(token) || new Set()

      for (const photoId of matchingPhotos) {
        if (!photoMatches.has(photoId)) {
          photoMatches.set(photoId, new Set())
        }
        photoMatches.get(photoId)!.add(token)
      }
    }

    // 计算得分
    for (const [photoId, matchedTokens] of photoMatches) {
      let score = 0

      // 匹配度得分
      if (mode === 'AND') {
        // AND 模式：必须匹配所有 token
        const allMatched = queryTokens.every(token =>
          this.index.has(token) && this.index.get(token)!.has(photoId)
        )
        if (!allMatched) continue
        score = 1.0
      } else {
        // OR 模式：匹配越多得分越高
        score = matchedTokens.size / queryTokens.length
      }

      photoScores.set(photoId, score)
    }

    // 排序并限制
    const results: SearchResult[] = []
    const sortedPhotos = [...photoScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)

    for (const [photoId, score] of sortedPhotos) {
      const photo = await db.getPhotoById(photoId)
      if (photo) {
        results.push({
          photoId,
          photo,
          score,
          source: 'keyword'
        })
      }
    }

    return results
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private tokenize(text: string): string[] {
    return text.split(' ').filter(t => t.length > 0)
  }

  // 增量更新索引
  async addToIndex(photo: SearchablePhoto): Promise<void> {
    this.indexFile(photo.id, photo.filename)
    for (const tag of photo.tags) {
      this.indexFile(photo.id, tag)
    }
    if (photo.title) {
      this.indexFile(photo.id, photo.title)
    }
    if (photo.description) {
      this.indexFile(photo.id, photo.description)
    }
  }

  // 从索引中删除
  async removeFromIndex(photoId: string): Promise<void> {
    for (const [, photoIds] of this.index) {
      photoIds.delete(photoId)
    }
  }

  // 清空索引
  clearIndex(): void {
    this.index.clear()
  }
}
```

### Phase 2: 数据库关键词搜索

**文件**: `electron/database/db.ts`

```typescript
interface KeywordSearchOptions {
  tags?: string[]
  dateRange?: { start: Date; end: Date }
  rating?: number
  limit?: number
}

async function searchByKeyword(
  keyword: string,
  options: KeywordSearchOptions = {}
): Promise<SearchResult[]> {
  const { tags, dateRange, rating, limit = 50 } = options

  // 构建 SQL 查询
  let sql = `
    SELECT DISTINCT p.*,
      CASE
        WHEN p.filename LIKE ? THEN 1.0
        WHEN p.title LIKE ? THEN 0.9
        WHEN p.description LIKE ? THEN 0.8
        ELSE 0.5
      END as relevance
    FROM photos p
    LEFT JOIN photo_tags pt ON p.id = pt.photo_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE 1=1
  `

  const params: any[] = [
    `%${keyword}%`,
    `%${keyword}%`,
    `%${keyword}%`
  ]

  // 标签过滤
  if (tags && tags.length > 0) {
    sql += ` AND t.name IN (${tags.map(() => '?').join(',')})`
    params.push(...tags)
  }

  // 日期范围
  if (dateRange) {
    sql += ` AND p.date_taken BETWEEN ? AND ?`
    params.push(dateRange.start, dateRange.end)
  }

  // 评分
  if (rating !== undefined) {
    sql += ` AND p.rating >= ?`
    params.push(rating)
  }

  sql += ` ORDER BY relevance DESC, p.date_taken DESC LIMIT ?`
  params.push(limit)

  const rows = await db.all(sql, params)

  return rows.map(row => ({
    photoId: row.id,
    photo: mapRowToPhoto(row),
    score: row.relevance,
    source: 'keyword'
  }))
}

// 多关键词搜索
async function searchByKeywords(
  keywords: string[],
  mode: 'AND' | 'OR' = 'AND'
): Promise<SearchResult[]> {
  if (keywords.length === 0) {
    return []
  }

  const results = new Map<string, SearchResult>()

  for (const keyword of keywords) {
    const keywordResults = await searchByKeyword(keyword)

    for (const result of keywordResults) {
      if (!results.has(result.photoId)) {
        results.set(result.photoId, result)
      } else if (mode === 'AND') {
        // AND 模式：增加匹配度
        const existing = results.get(result.photoId)!
        existing.score = (existing.score + result.score) / 2
      }
    }
  }

  if (mode === 'AND') {
    // AND 模式：只保留匹配所有关键词的结果
    return [...results.values()].filter(() => keywords.length > 0)
  }

  // OR 模式：返回所有结果，按分数排序
  return [...results.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
}
```

### Phase 3: 关键词搜索代理

**文件**: `electron/agents/KeywordAgent.ts`

```typescript
import { keywordSearchService, databaseKeywordSearch } from '../services/keywordSearchService'

class KeywordAgent extends BaseAgent {
  name = 'KeywordAgent'
  capabilities = ['keyword-search', 'tag-search', 'filename-search']

  async execute(query: string, context?: any): Promise<AgentResult> {
    try {
      const startTime = Date.now()

      // 解析关键词
      const keywords = this.parseKeywords(query)

      // 执行搜索
      const results = await databaseKeywordSearch.searchByKeywords(keywords)

      const searchTime = Date.now() - startTime

      return {
        success: true,
        results: results.map(r => r.photo),
        confidence: this.calculateConfidence(results, searchTime),
        source: 'keyword',
        metadata: {
          keywords,
          resultCount: results.length,
          searchTime
        }
      }
    } catch (error) {
      return {
        success: false,
        results: [],
        confidence: 0,
        source: 'keyword',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private parseKeywords(query: string): string[] {
    // 移除特殊字符，分词
    return query
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(k => k.length > 0)
  }

  private calculateConfidence(results: SearchResult[], searchTime: number): number {
    let score = 1.0

    // 时间惩罚
    if (searchTime > 200) {
      score *= 0.8
    }

    // 无结果惩罚
    if (results.length === 0) {
      score *= 0.3
    }

    return score
  }
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/keywordSearchService.ts` |
| 新建 | `electron/agents/KeywordAgent.ts` |
| 修改 | `electron/database/db.ts` |

## Dependencies

### 内部依赖
- `electron/database/types.ts` - Photo 类型
- `electron/agents/base/Agent.ts` - 代理基类

### 外部依赖
- 无新增外部依赖

## Testing Approach

### 单元测试
1. **索引测试**
   - 测试索引构建
   - 测试增量更新
   - 测试索引删除

2. **搜索测试**
   - 测试单关键词搜索
   - 测试多关键词 AND/OR
   - 测试边界情况

### 性能测试
- 10000 张照片索引构建时间
- 搜索响应时间
- 内存占用

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 文件名匹配 | 搜索 "IMG_1234"，验证返回正确结果 |
| 标签搜索 | 搜索 "猫"，验证返回带 "猫" 标签的照片 |
| 多关键词 AND | 搜索 "猫 可爱"，验证返回同时包含两者的结果 |
| 不区分大小写 | 搜索 "Cat" 和 "cat" 返回相同结果 |
| 搜索 < 200ms | 使用 console.time 测量 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 索引占用内存 | 中 | 使用数据库索引替代内存索引 |
| 搜索速度慢 | 中 | 优化 SQL 查询，添加数据库索引 |

## Related Stories

### 前置依赖
- 无

### 后续故事
- E-03.4: 结果融合 - 合并关键词搜索结果

### 相关故事
- E-03.1: LLM 查询解析 - 解析关键词
- E-02.3: 文本向量生成 - 备选搜索策略
