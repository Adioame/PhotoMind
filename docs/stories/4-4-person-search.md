# Story E-04.4: 人物搜索

## Story Overview

**原始需求描述**:
作为用户，我希望能够通过人物名称搜索照片，例如输入"妈妈"找到所有有妈妈的照片。

**描述**:
当用户搜索人物时，系统查询照片与人物的关联关系，返回包含该人物的所有照片。人物搜索与关键词搜索、语义搜索共同组成 Party Mode 的多代理搜索策略。

## Acceptance Criteria

### 功能性需求
- [ ] 支持人物名称搜索
- [ ] 支持人物名称模糊匹配
- [ ] 返回包含该人物的所有照片
- [ ] 按时间排序（最新在前）
- [ ] 支持排除特定人物
- [ ] 支持多人物组合搜索
- [ ] 显示人物头像和名称
- [ ] 返回匹配的照片数量

### 非功能性需求
- [ ] 搜索响应时间 < 200ms
- [ ] 支持 100+ 人物搜索
- [ ] 搜索结果可复现

## Implementation Steps

### Phase 1: 人物搜索服务

**文件**: `electron/services/personSearchService.ts`

```typescript
interface PersonSearchOptions {
  limit?: number
  offset?: number
  sortBy?: 'date' | 'relevance'
  exclude?: string[]
}

interface PersonSearchResult {
  person: Person
  photos: Photo[]
  photoCount: number
}

class PersonSearchService {
  async search(
    query: string,
    options: PersonSearchOptions = {}
  ): Promise<PersonSearchResult[]> {
    const { limit = 50, sortBy = 'date' } = options

    // 搜索人物
    const persons = await db.searchPersons(query)

    // 获取每个人物的照片
    const results: PersonSearchResult[] = []

    for (const person of persons.slice(0, 10)) { // 最多返回 10 个人物
      const photos = await this.getPersonPhotos(person.id, {
        limit,
        sortBy
      })

      results.push({
        person,
        photos,
        photoCount: photos.length
      })
    }

    return results
  }

  async getPersonPhotos(
    personId: string,
    options: PersonSearchOptions = {}
  ): Promise<Photo[]> {
    const { limit = 50, offset = 0, sortBy = 'date' } = options

    let sql = `
      SELECT p.* FROM photos p
      JOIN photo_persons pp ON p.id = pp.photo_id
      WHERE pp.person_id = ?
    `

    const params: any[] = [personId]

    if (sortBy === 'date') {
      sql += ` ORDER BY p.date_taken DESC`
    } else {
      sql += ` ORDER BY p.rating DESC, p.date_taken DESC`
    }

    sql += ` LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const photos = await db.all(sql, params)

    return photos.map(this.mapRowToPhoto)
  }

  async searchWithPhotos(
    query: string,
    options: PersonSearchOptions = {}
  ): Promise<Photo[]> {
    const persons = await db.searchPersons(query)

    if (persons.length === 0) {
      return []
    }

    // 获取所有匹配人物的照片
    const photoIds = new Set<string>()
    const photos: Photo[] = []

    for (const person of persons) {
      const personPhotos = await this.getPersonPhotos(person.id, {
        limit: options.limit,
        sortBy: options.sortBy
      })

      for (const photo of personPhotos) {
        if (!photoIds.has(photo.id)) {
          photoIds.add(photo.id)
          photos.push(photo)
        }
      }
    }

    // 按日期排序
    photos.sort((a, b) => b.date.getTime() - a.date.getTime())

    return photos.slice(0, options.limit || 50)
  }

  private mapRowToPhoto(row: any): Photo {
    return {
      id: row.id,
      path: row.path,
      filename: row.filename,
      date: new Date(row.date_taken),
      rating: row.rating,
      title: row.title,
      description: row.description
    }
  }
}
```

### Phase 2: 人物搜索代理

**文件**: `electron/agents/PeopleAgent.ts`

```typescript
import { personSearchService } from '../services/personSearchService'

class PeopleAgent extends BaseAgent {
  name = 'PeopleAgent'
  capabilities = ['person-search', 'face-search']

  async execute(query: string): Promise<AgentResult> {
    try {
      const startTime = Date.now()

      // 识别人物名称
      const personName = this.extractPersonName(query)

      if (!personName) {
        return {
          success: true,
          results: [],
          confidence: 0,
          source: 'people',
          metadata: { message: 'No person name found in query' }
        }
      }

      // 搜索人物照片
      const photos = await personSearchService.searchWithPhotos(personName)

      const searchTime = Date.now() - startTime

      return {
        success: true,
        results: photos,
        confidence: this.calculateConfidence(photos.length, searchTime),
        source: 'people',
        metadata: {
          personName,
          resultCount: photos.length,
          searchTime
        }
      }
    } catch (error) {
      return {
        success: false,
        results: [],
        confidence: 0,
        source: 'people',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private extractPersonName(query: string): string | null {
    // 提取人物名称的规则
    const patterns = [
      /和(.+)的(照片|合影)/,
      /(.+)的照片/,
      /(.+)合影/,
      /(.+)在照片里/
    ]

    for (const pattern of patterns) {
      const match = query.match(pattern)
      if (match && match[1]) {
        return match[1]
      }
    }

    // 直接返回查询作为人物名称
    return query.trim().length > 0 ? query.trim() : null
  }

  private calculateConfidence(resultCount: number, searchTime: number): number {
    let score = 1.0

    // 时间惩罚
    if (searchTime > 200) {
      score *= 0.8
    }

    // 无结果惩罚
    if (resultCount === 0) {
      score *= 0.3
    }

    return score
  }
}
```

### Phase 3: IPC 接口

**文件**: `electron/main/index.ts`

```typescript
// 人物搜索
ipcMain.handle('photos:search-by-person', async (_, query: string, options) => {
  return await personSearchService.searchWithPhotos(query, options)
})

ipcMain.handle('persons:get-photos', async (_, personId: string, options) => {
  return await personSearchService.getPersonPhotos(personId, options)
})

ipcMain.handle('persons:search', async (_, query: string) => {
  return await personSearchService.search(query)
})
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/personSearchService.ts` |
| 新建 | `electron/agents/PeopleAgent.ts` |
| 修改 | `electron/main/index.ts` |

## Dependencies

### 内部依赖
- `electron/services/personService.ts`
- `electron/agents/base/Agent.ts`

### 外部依赖
- 无新增外部依赖

## Testing Approach

### 单元测试
1. **搜索测试**
   - 测试人物名称搜索
   - 测试模糊匹配
   - 测试排序

2. **代理测试**
   - 测试人物名称提取
   - 测试代理执行

### 集成测试
1. **端到端测试**
   - 从搜索到结果完整流程
   - 与其他代理的集成

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 支持人物名称搜索 | 搜索 "妈妈"，验证返回包含妈妈的照片 |
| 模糊匹配 | 搜索 "妈"，验证也返回结果 |
| 按时间排序 | 验证结果按 date 降序 |
| 搜索 < 200ms | 使用 console.time 测量 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 人物名称提取不准 | 中 | 改进提取规则 |
| 性能问题 | 低 | 添加数据库索引 |

## Related Stories

### 前置依赖
- E-04.1: 手动标记人物 - 人物数据
- E-04.3: 人脸自动匹配 - 自动标记

### 后续故事
- 无（Epic 4 完成）

### 相关 stories
- E-03.2: 关键词搜索 - 复用搜索逻辑
- E-03.4: 结果融合 - 合并人物搜索结果
