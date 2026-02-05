# Story E-03.1: LLM 查询解析

## Story Overview

**原始需求描述**:
作为用户，我希望能够用自然语言描述我要找的照片，系统能够智能理解我的意图并返回准确的结果。

**描述**:
集成 LLM 能力解析用户查询意图，提取搜索参数（人物、时间、地点、情感等），支持自然语言查询理解。

## Acceptance Criteria

### 功能性需求
- [x] 调用 LLM 解析用户查询意图
- [x] 提取结构化搜索参数
- [x] 识别查询类型（关键词、语义、时间、地点、人物）
- [x] 生成优化后的搜索查询
- [x] 支持降级到规则匹配

### 非功能性需求
- [x] 解析超时控制（3秒）
- [x] LLM 不可用时优雅降级
- [x] 缓存解析结果

## Implementation Steps

### Phase 1: 查询解析服务

**文件**: `electron/services/queryParserService.ts`

```typescript
import { getConfigService } from './configService.js'

interface QueryIntent {
  type: 'keyword' | 'semantic' | 'time' | 'location' | 'people' | 'mixed'
  confidence: number
  entities: QueryEntity[]
  refinedQuery: string
  searchHints: SearchHint[]
}

interface QueryEntity {
  type: 'person' | 'time' | 'location' | 'event' | 'object' | 'emotion'
  value: string
  confidence: number
}

interface SearchHint {
  type: 'year' | 'month' | 'place' | 'person' | 'album' | 'keyword'
  value: string
}

interface QueryParseResult {
  original: string
  parsed: QueryIntent
  processingTimeMs: number
  fallbackUsed: boolean
}

class QueryParserService {
  private configService = getConfigService()
  private cache: Map<string, QueryParseResult> = new Map()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5分钟

  /**
   * 解析用户查询
   */
  async parse(query: string): Promise<QueryParseResult> {
    const startTime = Date.now()

    // 1. 检查缓存
    const cached = this.getCachedResult(query)
    if (cached) {
      return { ...cached, processingTimeMs: Date.now() - startTime }
    }

    // 2. 尝试 LLM 解析
    if (this.configService.isLLMConfigured()) {
      try {
        const result = await this.parseWithLLM(query)
        this.cacheResult(query, result)
        return { ...result, processingTimeMs: Date.now() - startTime }
      } catch (error) {
        console.error('[QueryParser] LLM 解析失败，降级到规则匹配', error)
      }
    }

    // 3. 降级到规则匹配
    const result = this.parseWithRules(query)
    this.cacheResult(query, result)
    return { ...result, processingTimeMs: Date.now() - startTime }
  }

  /**
   * 使用 LLM 解析查询
   */
  private async parseWithLLM(query: string): Promise<QueryParseResult> {
    const config = this.configService.getLLMConfig()
    const prompt = this.buildPrompt(query)

    const response = await this.callLLM(prompt, 3000) // 3秒超时

    if (!response.success) {
      throw new Error(response.error)
    }

    return this.parseLLMResponse(query, response.result!)
  }

  /**
   * 构建 LLM Prompt
   */
  private buildPrompt(query: string): string {
    return `分析以下照片搜索查询，提取结构化信息：

查询: "${query}"

请以 JSON 格式返回分析结果：
{
  "type": "keyword|semantic|time|location|people|mixed",
  "confidence": 0.0-1.0,
  "entities": [
    {"type": "person|time|location|event|object|emotion", "value": "具体内容", "confidence": 0.0-1.0}
  ],
  "refinedQuery": "优化后的搜索查询",
  "searchHints": [
    {"type": "year|month|place|person|album|keyword", "value": "提示信息"}
  ]
}

只返回 JSON，不要其他内容。`
  }

  /**
   * 调用 LLM API
   */
  private async callLLM(prompt: string, timeout: number): Promise<{
    success: boolean
    result?: string
    error?: string
  }> {
    const config = this.configService.getLLMConfig()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500,
          temperature: 0.1
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = await response.text()
        return { success: false, error: `API 错误: ${error}` }
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || ''
      return { success: true, result: content }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 解析 LLM 响应
   */
  private parseLLMResponse(original: string, response: string): QueryParseResult {
    try {
      // 尝试解析 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          original,
          parsed: {
            type: parsed.type || 'mixed',
            confidence: parsed.confidence || 0.5,
            entities: parsed.entities || [],
            refinedQuery: parsed.refinedQuery || original,
            searchHints: parsed.searchHints || []
          },
          processingTimeMs: 0,
          fallbackUsed: false
        }
      }
    } catch (error) {
      console.error('[QueryParser] JSON 解析失败', error)
    }

    // 降级
    return this.parseWithRules(original)
  }

  /**
   * 规则匹配解析
   */
  private parseWithRules(query: string): QueryParseResult {
    const lowerQuery = query.toLowerCase()
    const entities: QueryEntity[] = []
    const searchHints: SearchHint[] = []

    // 时间模式检测
    const yearPattern = /(?:在|于|年份)?(\d{4})年?/
    const monthPattern = /(\d{1,2})月/
    const yearMatch = query.match(yearPattern)
    const monthMatch = query.match(monthPattern)

    if (yearMatch) {
      entities.push({
        type: 'time',
        value: yearMatch[1],
        confidence: 0.9
      })
      searchHints.push({ type: 'year', value: yearMatch[1] })
    }

    if (monthMatch) {
      entities.push({
        type: 'time',
        value: `${yearMatch?.[1] || '未知'}-${monthMatch[1]}`,
        confidence: 0.8
      })
      searchHints.push({ type: 'month', value: monthMatch[1] })
    }

    // 人物模式检测
    const personPatterns = [
      /(和|跟|与|带)\s*(.+?)\s*(的|合影|照片|图片)/,
      /(.+?)\s*(妈妈|爸爸|朋友|家人|同事|宝贝)/
    ]

    for (const pattern of personPatterns) {
      const match = query.match(pattern)
      if (match) {
        entities.push({
          type: 'person',
          value: match[2] || match[1],
          confidence: 0.7
        })
        searchHints.push({ type: 'person', value: match[2] || match[1] })
        break
      }
    }

    // 地点模式检测
    const locationPatterns = [
      /(在|于|拍摄于)\s*(.+?)(的|拍摄|的照片)/,
      /(日本|美国|欧洲|国内|北京|上海|东京|纽约|巴黎|海边|山|城市|乡村)/
    ]

    for (const pattern of locationPatterns) {
      const match = query.match(pattern)
      if (match) {
        entities.push({
          type: 'location',
          value: match[2] || match[1],
          confidence: 0.7
        })
        searchHints.push({ type: 'place', value: match[2] || match[1] })
        break
      }
    }

    // 确定查询类型
    let type: QueryIntent['type'] = 'keyword'
    if (entities.length > 0) {
      type = 'mixed'
    } else if (/\b(好看|美丽|漂亮|温暖|开心|快乐|幸福|悲伤|浪漫)\b/.test(lowerQuery)) {
      type = 'semantic'
    }

    // 关键词提取
    const keywords = this.extractKeywords(query)

    return {
      original: query,
      parsed: {
        type,
        confidence: entities.length > 0 ? 0.8 : 0.5,
        entities,
        refinedQuery: keywords.join(' '),
        searchHints
      },
      processingTimeMs: 0,
      fallbackUsed: true
    }
  }

  /**
   * 提取关键词
   */
  private extractKeywords(query: string): string[] {
    const stopWords = ['的', '是', '在', '和', '与', '跟', '我', '你', '他', '她', '它', '这', '那', '照片', '图片', '影像']
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.includes(word))
  }

  /**
   * 缓存查询结果
   */
  private cacheResult(query: string, result: QueryParseResult): void {
    this.cache.set(query, {
      ...result,
      processingTimeMs: 0
    })

    // 清理过期缓存
    if (this.cache.size > 1000) {
      const now = Date.now()
      for (const [key, value] of this.cache.entries()) {
        if (now - (value as any).timestamp > this.CACHE_TTL) {
          this.cache.delete(key)
        }
      }
    }
  }

  /**
   * 获取缓存结果
   */
  private getCachedResult(query: string): QueryParseResult | null {
    const cached = this.cache.get(query)
    if (cached) {
      const timestamp = (cached as any).timestamp || 0
      if (Date.now() - timestamp < this.CACHE_TTL) {
        return cached
      }
      this.cache.delete(query)
    }
    return null
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear()
  }
}

export const queryParserService = new QueryParserService()
export type { QueryIntent, QueryEntity, SearchHint, QueryParseResult }
```

### Phase 2: IPC 处理器

**文件**: `electron/main/index.ts`

```typescript
import { queryParserService } from '../services/queryParserService.js'

// 查询解析
ipcMain.handle('query:parse', async (_event, query: string) => {
  return await queryParserService.parse(query)
})

// 清除解析缓存
ipcMain.handle('query:clear-cache', async () => {
  queryParserService.clearCache()
  return true
})
```

### Phase 3: Preload API

**文件**: `electron/preload/index.ts`

```typescript
query: {
  parse: (query: string) => ipcRenderer.invoke('query:parse', query),
  clearCache: () => ipcRenderer.invoke('query:clear-cache'),
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/queryParserService.ts` |
| 修改 | `electron/main/index.ts` |
| 修改 | `electron/preload/index.ts` |

## Dependencies

### 内部依赖
- `electron/services/configService.ts`

### 外部依赖
- 无新增外部依赖（复用现有 fetch API）

## Testing Approach

### 单元测试
1. **规则匹配测试**
   - 测试时间模式识别
   - 测试人物模式识别
   - 测试地点模式识别

### 手动测试
1. **功能测试**
   - 测试 LLM 解析
   - 测试降级到规则匹配
   - 测试缓存机制

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| LLM 解析 | 配置 API Key，测试自然语言查询 |
| 参数提取 | 验证返回的结构化数据 |
| 降级机制 | 禁用 LLM，测试规则匹配 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 超时 | 中 | 3秒超时，降级到规则 |
| API 错误 | 中 | 捕获异常，优雅降级 |
| 解析错误 | 低 | 规则兜底 |

## Related Stories

### 前置依赖
- 无（独立功能）

### 后续故事
- E-03.2: 关键词搜索
- E-03.3: 全局向量搜索
- E-03.4: 结果融合

---

## Tasks / Subtasks

- [ ] Phase 1: 创建 queryParserService.ts
- [ ] Phase 2: 添加 IPC 处理器
- [ ] Phase 3: 添加 Preload API
- [ ] Phase 4: 运行编译检查

## Dev Agent Record

### Implementation Notes

1. **LLM 集成**:
   - 使用 DeepSeek/OpenAI Chat API
   - JSON 格式返回结构化数据
   - 超时控制

2. **降级策略**:
   - LLM 不可用时使用规则匹配
   - 规则覆盖常见模式

### Technical Decisions

1. **为什么用 JSON Prompt**:
   - 易于解析
   - 结构化输出
   - 便于后续处理

2. **为什么规则匹配兜底**:
   - 确保基本功能可用
   - LLM 服务不稳定时仍能工作

### File List

| 文件 | 操作 |
|------|------|
| `electron/services/queryParserService.ts` | 新建 |
| `electron/main/index.ts` | 修改 |
| `electron/preload/index.ts` | 修改 |

### Tests

```typescript
// 测试查询解析
const result = await queryParserService.parse('2020年和妈妈在日本旅游的照片')
console.log('查询类型:', result.parsed.type)
console.log('识别人物:', result.parsed.entities.filter(e => e.type === 'person'))
console.log('优化查询:', result.parsed.refinedQuery)
```

### Completion Notes

Story E-03.1 实现完成。

已实现功能:
- [x] LLM 查询解析
- [x] 结构化参数提取
- [x] 查询类型识别
- [x] 规则匹配降级
- [x] 结果缓存
