# Story E-02.3: 文本向量生成

## Story Overview

**原始需求描述**:
作为用户，我希望能够用自然语言描述来搜索照片，例如输入"温暖的家庭照片"或"日落的风景"，系统能够理解我的语义意图并返回相关照片。

**描述**:
当用户输入搜索查询时，系统需要将文本查询转换为 CLIP 文本嵌入向量，然后与照片的图像向量进行相似度计算。文本向量的生成应该快速响应，支持实时搜索体验。

## Acceptance Criteria

### 功能性需求
- [ ] 系统能够接收文本查询并生成 CLIP 文本嵌入
- [ ] 文本向量维度与图像向量一致（512 或 768 维）
- [ ] 支持中英文混合输入
- [ ] 向量生成时间 < 500ms（实时搜索体验）
- [ ] 特殊字符和空白字符正确处理
- [ ] 空字符串或无效输入有合理的错误处理

### 非功能性需求
- [ ] 文本向量生成速度满足实时搜索需求
- [ ] 支持高并发查询（多个用户同时搜索）
- [ ] 内存占用稳定，不随查询次数增长

## Implementation Steps

### Phase 1: 类型定义

**文件**: `electron/services/embeddingService.ts`

```typescript
interface TextEmbeddingOptions {
  normalize?: boolean
  pooling?: 'mean' | 'cls'
}

interface TextEmbeddingResult {
  embedding: number[]
  dimension: number
  processingTime: number
}
```

### Phase 2: 文本嵌入服务

**文件**: `electron/services/embeddingService.ts`

```typescript
import { pipeline, env } from '@xenova/transformers'

class EmbeddingService {
  private textModel: any = null
  private imageModel: any = null
  private modelVersion = 'Xenova/clip-vit-base-patch32'

  async initialize(): Promise<void> {
    // 预加载模型
    if (!this.textModel) {
      this.textModel = await pipeline('feature-extraction', this.modelVersion, {
        quantized: true
      })
    }
  }

  async textToEmbedding(
    text: string,
    options: TextEmbeddingOptions = { normalize: true, pooling: 'mean' }
  ): Promise<TextEmbeddingResult> {
    await this.initialize()

    const startTime = Date.now()

    // 预处理文本
    const normalizedText = this.preprocessText(text)

    // 生成嵌入
    const output = await this.textModel(normalizedText, {
      pooling: options.pooling,
      normalize: options.normalize
    })

    const processingTime = Date.now() - startTime

    return {
      embedding: Array.from(output.data),
      dimension: output.data.length,
      processingTime
    }
  }

  private preprocessText(text: string): string {
    // 1. 去除首尾空白
    let processed = text.trim()

    // 2. 统一空白字符
    processed = processed.replace(/\s+/g, ' ')

    // 3. CLIP 对中英文混合支持良好，无需额外处理

    return processed
  }

  // 批量文本嵌入（用于查询扩展）
  async batchTextToEmbeddings(
    texts: string[],
    options: TextEmbeddingOptions = { normalize: true, pooling: 'mean' }
  ): Promise<TextEmbeddingResult[]> {
    await this.initialize()

    const results: TextEmbeddingResult[] = []

    for (const text of texts) {
      const result = await this.textToEmbedding(text, options)
      results.push(result)
    }

    return results
  }
}
```

### Phase 3: 查询预处理优化

**文件**: `electron/services/queryPreprocessor.ts`

```typescript
interface ProcessedQuery {
  original: string
  normalized: string
  tokens: string[]
  expanded: string[]
}

class QueryPreprocessor {
  // 常用查询扩展词表
  private expansions: Record<string, string[]> = {
    '好看': ['美丽', '漂亮', '优美', '出色'],
    '好看': ['美丽', '漂亮', '优美', '出色'],
    '家庭': ['家人', '亲子', '合影', '全家福'],
    '风景': ['景色', '景观', '自然', '风光'],
    '美食': ['食物', '餐', '佳肴', '料理'],
    '宠物': ['猫', '狗', '动物', '萌宠']
  }

  process(query: string): ProcessedQuery {
    const original = query
    const normalized = this.normalize(query)
    const tokens = this.tokenize(normalized)
    const expanded = this.expand(tokens)

    return {
      original,
      normalized,
      tokens,
      expanded
    }
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s\u4e00-\u9fff]/g, '')
      .replace(/\s+/g, ' ')
  }

  private tokenize(text: string): string[] {
    // 中英文混合分词
    return text.split(/([\u4e00-\u9fff]+|\s+)/)
      .filter(token => token.length > 0 && !/^\s+$/.test(token))
  }

  private expand(tokens: string[]): string[] {
    const expanded = new Set<string>(tokens)

    for (const token of tokens) {
      if (this.expansions[token]) {
        this.expansions[token].forEach(e => expanded.add(e))
      }
    }

    return Array.from(expanded)
  }
}

export const queryPreprocessor = new QueryPreprocessor()
```

### Phase 4: 集成到语义搜索代理

**文件**: `electron/agents/SemanticAgent.ts`

```typescript
import { embeddingService, queryPreprocessor } from '../services/embeddingService'

class SemanticAgent extends BaseAgent {
  name = 'SemanticAgent'
  capabilities = ['semantic-search', 'natural-language-query']

  async execute(query: string): Promise<AgentResult> {
    try {
      // 1. 查询预处理
      const processedQuery = queryPreprocessor.process(query)

      // 2. 文本转向量
      const { embedding, processingTime } = await embeddingService.textToEmbedding(
        query,
        { normalize: true, pooling: 'mean' }
      )

      // 3. 向量相似度搜索
      const results = await database.searchByVector(embedding, {
        limit: 50,
        minScore: 0.2
      })

      return {
        success: true,
        results,
        confidence: this.calculateConfidence(results, processingTime),
        source: 'semantic',
        metadata: {
          originalQuery: query,
          processedQuery,
          processingTime,
          resultCount: results.length
        }
      }
    } catch (error) {
      return {
        success: false,
        results: [],
        confidence: 0,
        source: 'semantic',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private calculateConfidence(results: Photo[], processingTime: number): number {
    // 基于结果数量和处理时间计算置信度
    let score = 1.0

    // 处理时间惩罚
    if (processingTime > 500) {
      score *= 0.8
    }
    if (processingTime > 1000) {
      score *= 0.6
    }

    // 结果数量调整
    if (results.length === 0) {
      score *= 0.3
    } else if (results.length < 5) {
      score *= 0.7
    }

    return score
  }
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/queryPreprocessor.ts` |
| 修改 | `electron/services/embeddingService.ts` |
| 新建 | `electron/agents/SemanticAgent.ts` |

## Dependencies

### 内部依赖
- `@xenova/transformers` - CLIP 模型
- `electron/services/embeddingService.ts` - 嵌入服务

### 外部依赖
- `@xenova/transformers`: ^2.17.0

## Testing Approach

### 单元测试
1. **查询预处理测试**
   - 测试中英文混合查询处理
   - 测试特殊字符过滤
   - 测试查询扩展功能

2. **文本向量生成测试**
   - 测试空字符串处理
   - 测试超长文本处理
   - 测试生成时间基准

### 集成测试
1. **端到端测试**
   - 测试 "温暖的家庭照片" → 生成向量 → 搜索结果
   - 测试中英文混合查询 "family photo 在海边"
   - 测试响应时间 < 500ms

### 性能测试
- 100 次连续查询的响应时间分布
- 内存使用监控
- 并发查询压力测试

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 支持文本到向量生成 | 输入 "美丽风景"，验证返回 512 维向量 |
| 中英文混合输入支持 | 输入 "海边的 sunset"，验证正常处理 |
| 向量生成 < 500ms | 使用 console.time 测量生成时间 |
| 异常输入处理 | 输入空字符串，验证返回错误而非崩溃 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 中文分词效果差 | 中 | 简单空格分词 + 查询扩展词表 |
| 首次查询延迟高 | 中 | 预加载模型到内存 |
| 特殊字符导致异常 | 低 | 输入验证和清理 |

## Related Stories

### 前置依赖
- E-02.1: CLIP 模型集成
- E-02.2: 图片向量生成

### 后续故事
- E-02.4: 向量相似度搜索 - 使用文本向量进行搜索
- E-03.1: LLM 查询解析 - 更复杂的查询理解

### 相关故事
- E-03.2: 关键词搜索 - 备选搜索策略
- E-03.4: 结果融合 - 合并语义搜索结果
