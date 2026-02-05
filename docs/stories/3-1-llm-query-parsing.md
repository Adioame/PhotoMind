# Story E-03.1: LLM 查询解析

## Story Overview

**原始需求描述**:
作为用户，我希望能够用自然语言搜索照片，例如"去年夏天在海边的家庭合影"，系统能够理解我的查询意图并返回相关照片。

**描述**:
当用户输入搜索查询时，系统使用 LLM 解析查询意图，提取结构化的搜索条件。LLM 解析支持多种意图类型：语义描述、人物、时间、地点、关键词等，并生成优化的搜索策略。

## Acceptance Criteria

### 功能性需求
- [ ] 支持自然语言查询解析
- [ ] 识别查询意图类型（semantic/keyword/people/time/location/mixed）
- [ ] 提取结构化查询参数
- [ ] 生成搜索策略建议
- [ ] 处理模糊查询（如"找找以前的照片"）
- [ ] 中英文混合查询支持
- [ ] 识别无效或空查询
- [ ] 解析时间表达式（"去年"、"最近"、"2023年"）
- [ ] 识别地点描述（"在日本的"、"海边的"）

### 非功能性需求
- [ ] 解析延迟 < 1 秒
- [ ] 解析结果稳定可复现
- [ ] 降级策略（LLM 失败时使用规则解析）

## Implementation Steps

### Phase 1: LLM 服务集成

**文件**: `electron/services/llmService.ts`

```typescript
import OpenAI from 'openai'

interface LLMConfig {
  provider: 'openai' | 'deepseek'
  model: string
  apiKey: string
  baseUrl?: string
}

interface QueryParseResult {
  intent: SearchIntent
  entities: SearchEntities
  strategy: SearchStrategy
  confidence: number
  reasoning: string
}

interface SearchEntities {
  people?: string[]
  time?: TimeExpression
  location?: string[]
  keywords?: string[]
  semantic?: string
}

interface TimeExpression {
  type: 'year' | 'month' | 'season' | 'relative' | 'range'
  value: string | { start: string; end: string }
}

interface SearchStrategy {
  primary: string[]
  secondary: string[]
  weights: Record<string, number>
  filters: Record<string, any>
}

class LLMService {
  private client: OpenAI | null = null
  private config: LLMConfig | null = null

  async initialize(config: LLMConfig): Promise<void> {
    this.config = config

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      dangerouslyAllowBrowser: true
    })
  }

  async parseQuery(query: string): Promise<QueryParseResult> {
    // 降级到规则解析
    if (!this.client) {
      return this.fallbackParse(query)
    }

    const systemPrompt = `你是一个照片搜索助手。用户会输入自然语言查询，你需要解析出结构化的搜索条件。

请分析用户查询，返回 JSON 格式的结果：

{
  "intent": "semantic" | "keyword" | "people" | "time" | "location" | "mixed",
  "entities": {
    "people": ["人名列表"],
    "time": {"type": "year|month|season|relative|range", "value": "具体值或范围"},
    "location": ["地点列表"],
    "keywords": ["关键词列表"],
    "semantic": "语义描述原文"
  },
  "strategy": {
    "primary": ["主要搜索策略"],
    "secondary": ["备选搜索策略"],
    "weights": {"keyword": 0.3, "semantic": 0.7},
    "filters": {"has_person": true, "year": 2023}
  },
  "confidence": 0.0-1.0,
  "reasoning": "解析理由"
}

意图判断规则：
- semantic: 抽象描述如"好看"、"温暖"、"氛围感"
- keyword: 具体词如"猫"、"花"、"食物"
- people: 包含人名或称呼如"妈妈"、"合影"
- time: 时间描述如"去年"、"2023"
- location: 地点描述如"在日本"、"海边"
- mixed: 混合多种条件`

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `解析这个查询: "${query}"` }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        return this.fallbackParse(query)
      }

      return JSON.parse(content) as QueryParseResult
    } catch (error) {
      console.error('LLM parse failed:', error)
      return this.fallbackParse(query)
    }
  }

  // 规则解析降级方案
  private fallbackParse(query: string): QueryParseResult {
    const intentAnalyzer = new RuleBasedIntentAnalyzer()
    return intentAnalyzer.analyze(query)
  }
}

class RuleBasedIntentAnalyzer {
  private patterns = {
    time: [
      /(\d{4})年/,
      /去年|今年|明年/,
      /上个月|这个月|下个月/,
      /最近|近期|以前/,
      /春天|夏天|秋天|冬天/
    ],
    location: [
      /在(.+)拍的/,
      /(.+)的照片/,
      /在(.+)/
    ],
    people: [
      /和(.+)的(照片|合影)/,
      /(.+)的照片/,
      /(.+)合影/
    ]
  }

  analyze(query: string): QueryParseResult {
    const entities: SearchEntities = {}
    const keywords: string[] = []
    let intent: SearchIntent = 'keyword'
    let confidence = 0.5

    // 检测时间
    for (const pattern of this.patterns.time) {
      const match = query.match(pattern)
      if (match) {
        entities.time = { type: 'pattern', value: match[1] }
        intent = 'time'
        confidence = 0.7
        break
      }
    }

    // 检测地点
    for (const pattern of this.patterns.location) {
      const match = query.match(pattern)
      if (match) {
        entities.location = [match[1]]
        intent = 'location'
        confidence = 0.7
        break
      }
    }

    // 检测人物
    for (const pattern of this.patterns.people) {
      const match = query.match(pattern)
      if (match) {
        entities.people = [match[1]]
        intent = 'people'
        confidence = 0.8
        break
      }
    }

    // 检测语义描述
    const semanticPatterns = [/好看/, /美丽/, /温暖/, /漂亮/, /氛围/]
    if (semanticPatterns.some(p => p.test(query))) {
      intent = 'semantic'
      entities.semantic = query
      confidence = 0.6
    }

    return {
      intent,
      entities,
      strategy: this.generateStrategy(intent, entities),
      confidence,
      reasoning: `规则解析: 检测到${intent}类型查询`
    }
  }

  private generateStrategy(
    intent: SearchIntent,
    entities: SearchEntities
  ): SearchStrategy {
    const weights: Record<string, number> = { keyword: 0.3, semantic: 0.5 }
    const filters: Record<string, any> = {}

    if (entities.time) {
      filters.time = entities.time
      weights.keyword = 0.4
      weights.semantic = 0.3
    }

    if (entities.location) {
      filters.location = entities.location
      weights.keyword = 0.4
      weights.semantic = 0.3
    }

    return {
      primary: [intent],
      secondary: ['keyword'],
      weights,
      filters
    }
  }
}
```

### Phase 2: IPC 接口

**文件**: `electron/main/index.ts`

```typescript
// 解析查询
ipcMain.handle('photos:parse-query', async (_, query: string) => {
  return await llmService.parseQuery(query)
})

// 检测 LLM 是否可用
ipcMain.handle('photos:check-llm-available', async () => {
  return llmService.isAvailable()
})
```

### Phase 3: Preload API

**文件**: `electron/preload/index.ts`

```typescript
photos: {
  // ... 现有方法
  parseQuery: (query: string) =>
    ipcRenderer.invoke('photos:parse-query', query),
  checkLLMAvailable: () =>
    ipcRenderer.invoke('photos:check-llm-available')
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/llmService.ts` |
| 修改 | `electron/main/index.ts` |
| 修改 | `electron/preload/index.ts` |

## Dependencies

### 内部依赖
- 无新增内部依赖

### 外部依赖
- `openai`: ^4.0.0（复用现有依赖）

## Testing Approach

### 单元测试
1. **规则解析测试**
   - 测试各种查询模式的解析
   - 测试边界情况
   - 测试中英文混合

2. **LLM 集成测试**
   - 测试 LLM 调用
   - 测试 JSON 解析
   - 测试错误处理

### 集成测试
1. **端到端测试**
   - 测试完整解析流程
   - 测试降级方案
   - 测试响应时间

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 识别查询意图 | 输入"和妈妈的合影"，验证返回 intent: "people" |
| 提取时间表达式 | 输入"2023年的照片"，验证解析出 year: 2023 |
| 识别地点 | 输入"在日本拍的照片"，验证解析出 location |
| 解析 < 1 秒 | 使用 console.time 测量 |
| 降级方案可用 | 模拟 LLM 不可用，验证规则解析 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 响应慢 | 中 | 降级到规则解析 |
| API 限流 | 中 | 添加重试和缓存 |
| JSON 解析失败 | 低 | 捕获异常，降级处理 |

## Related Stories

### 前置依赖
- 无（可独立实施）

### 后续故事
- E-03.2: 关键词搜索 - 使用解析的关键词
- E-03.3: 全局向量搜索 - 使用解析的语义
- E-03.4: 结果融合 - 使用解析的策略

### 相关故事
- E-02.3: 文本向量生成 - 使用解析的语义查询
