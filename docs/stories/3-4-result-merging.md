# Story E-03.4: 结果融合与排序

## Story Overview

**原始需求描述**:
作为用户，我希望搜索结果能够智能融合多种搜索策略的结果，返回最相关的照片。

**描述**:
当多个搜索代理（关键词、语义、人物）返回结果时，系统需要融合这些结果，去除重复，按综合相关性排序，返回统一的搜索结果列表。

## Acceptance Criteria

### 功能性需求
- [ ] 合并多个代理的搜索结果
- [ ] 基于相似度分数加权融合
- [ ] 去除重复照片（按 photoId）
- [ ] 按综合分数排序
- [ ] 支持结果去重策略（优先保留高置信度来源）
- [ ] 支持过滤低质量结果
- [ ] 返回融合后的结果和来源信息
- [ ] 支持分页加载融合结果

### 非功能性需求
- [ ] 融合时间 < 100ms
- [ ] 稳定可复现的排序结果
- [ ] 支持最多 5 个代理同时参与融合

## Implementation Steps

### Phase 1: 结果融合服务

**文件**: `electron/services/resultMerger.ts`

```typescript
interface MergedResult {
  photoId: string
  photo: Photo
  finalScore: number
  sources: ResultSource[]
  matchedAgents: string[]
}

interface ResultSource {
  agent: string
  originalScore: number
  weight: number
  weightedScore: number
}

interface MergeOptions {
  weights?: Record<string, number>
  deduplicationStrategy?: 'highest-score' | 'first-wins' | 'average'
  minScore?: number
  maxResults?: number
}

class ResultMerger {
  // 默认权重配置
  private defaultWeights: Record<string, number> = {
    semantic: 0.6,
    keyword: 0.3,
    people: 0.8,
    time: 0.5,
    location: 0.5
  }

  // 融合多个代理的结果
  merge(
    agentResults: AgentResult[],
    options: MergeOptions = {}
  ): {
    results: MergedResult[]
    stats: MergeStats
  } {
    const {
      weights = this.defaultWeights,
      deduplicationStrategy = 'highest-score',
      minScore = 0.1,
      maxResults = 50
    } = options

    const mergedMap = new Map<string, MergedResult>()

    for (const agentResult of agentResults) {
      if (!agentResult.success) continue

      for (const photo of agentResult.results) {
        const photoId = photo.id

        if (!mergedMap.has(photoId)) {
          mergedMap.set(photoId, {
            photoId,
            photo,
            finalScore: 0,
            sources: [],
            matchedAgents: []
          })
        }

        const merged = mergedMap.get(photoId)!

        // 获取该代理的权重
        const weight = weights[agentResult.source] || 0.5
        const weightedScore = agentResult.confidence * weight

        // 添加来源信息
        merged.sources.push({
          agent: agentResult.source,
          originalScore: agentResult.confidence,
          weight,
          weightedScore
        })

        merged.matchedAgents.push(agentResult.source)

        // 根据策略更新最终分数
        switch (deduplicationStrategy) {
          case 'highest-score':
            merged.finalScore = Math.max(merged.finalScore, weightedScore)
            break
          case 'first-wins':
            if (merged.sources.length === 1) {
              merged.finalScore = weightedScore
            }
            break
          case 'average':
            const totalWeighted = merged.sources.reduce(
              (sum, s) => sum + s.weightedScore,
              0
            )
            merged.finalScore = totalWeighted / merged.sources.length
            break
        }
      }
    }

    // 过滤和排序
    const results: MergedResult[] = [...mergedMap.values()]
      .filter(r => r.finalScore >= minScore)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, maxResults)

    // 生成统计信息
    const stats: MergeStats = {
      totalResults: results.length,
      agentsUsed: agentResults.filter(r => r.success).length,
      duplicatesRemoved: mergedMap.size - results.length,
      averageScore: results.length > 0
        ? results.reduce((sum, r) => sum + r.finalScore, 0) / results.length
        : 0
    }

    return { results, stats }
  }

  // 智能权重调整
  adjustWeightsForIntent(
    baseWeights: Record<string, number>,
    intent: SearchIntent
  ): Record<string, number> {
    const adjusted = { ...baseWeights }

    switch (intent) {
      case 'semantic':
        adjusted.semantic = 0.8
        adjusted.keyword = 0.2
        break
      case 'keyword':
        adjusted.keyword = 0.7
        adjusted.semantic = 0.3
        break
      case 'people':
        adjusted.people = 0.9
        adjusted.semantic = 0.1
        break
      case 'time':
        adjusted.time = 0.8
        adjusted.keyword = 0.2
        break
      case 'location':
        adjusted.location = 0.8
        adjusted.keyword = 0.2
        break
      case 'mixed':
        // 混合查询使用均衡权重
        break
    }

    return adjusted
  }

  // RRF 排名融合（Reciprocal Rank Fusion）
  rrfFusion(
    agentResults: AgentResult[],
    k: number = 60
  ): MergedResult[] {
    const scoreMap = new Map<string, number>()

    for (const agentResult of agentResults) {
      if (!agentResult.success) continue

      for (let rank = 0; rank < agentResult.results.length; rank++) {
        const photoId = agentResult.results[rank].id
        const rrfScore = 1 / (k + rank + 1)

        scoreMap.set(
          photoId,
          (scoreMap.get(photoId) || 0) + rrfScore
        )
      }
    }

    // 排序并返回
    return [...scoreMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([photoId, score]) => ({
        photoId,
        finalScore: score,
        sources: [],
        matchedAgents: []
      }))
  }
}
```

### Phase 2: 综合搜索服务

**文件**: `electron/services/hybridSearchService.ts`

```typescript
import { resultMerger } from './resultMerger'

interface HybridSearchOptions {
  mode?: 'parallel' | 'sequential' | 'smart'
  timeout?: number
  maxResults?: number
}

class HybridSearchService {
  private keywordAgent: KeywordAgent
  private semanticAgent: SemanticAgent
  private peopleAgent: PeopleAgent

  // 智能混合搜索
  async search(
    query: string,
    parseResult: QueryParseResult,
    options: HybridSearchOptions = {}
  ): Promise<HybridSearchResult> {
    const { mode = 'smart', timeout = 5000, maxResults = 50 } = options

    switch (mode) {
      case 'parallel':
        return this.parallelSearch(query, parseResult, timeout, maxResults)
      case 'sequential':
        return this.sequentialSearch(query, parseResult, maxResults)
      case 'smart':
      default:
        return this.smartSearch(query, parseResult, timeout, maxResults)
    }
  }

  // 并行搜索
  private async parallelSearch(
    query: string,
    parseResult: QueryParseResult,
    timeout: number,
    maxResults: number
  ): Promise<HybridSearchResult> {
    // 根据解析结果选择代理
    const agents = this.selectAgents(parseResult)

    // 并行执行
    const results = await Promise.allSettled(
      agents.map(agent => this.executeWithTimeout(agent, query, timeout))
    )

    // 收集成功结果
    const successfulResults = results
      .filter((r): r is PromiseFulfilledResult<AgentResult> =>
        r.status === 'fulfilled' && r.value.success
      )
      .map(r => r.value)

    // 融合结果
    const weights = resultMerger.adjustWeightsForIntent(
      resultMerger.defaultWeights,
      parseResult.intent
    )

    const { results: mergedResults, stats } = resultMerger.merge(
      successfulResults,
      { weights, maxResults }
    )

    return {
      results: mergedResults,
      parseResult,
      stats
    }
  }

  // 顺序搜索（用于复杂查询）
  private async sequentialSearch(
    query: string,
    parseResult: QueryParseResult,
    maxResults: number
  ): Promise<HybridSearchResult> {
    const results: AgentResult[] = []

    // 优先使用高置信度的策略
    const strategies = this.rankStrategies(parseResult)

    for (const strategy of strategies) {
      if (results.length >= maxResults) break

      const agent = this.getAgentForStrategy(strategy)
      const result = await agent.execute(query)

      if (result.success) {
        results.push(result)
      }
    }

    const { results: mergedResults, stats } = resultMerger.merge(results, {
      maxResults
    })

    return {
      results: mergedResults,
      parseResult,
      stats
    }
  }

  // 智能搜索（根据情况选择最佳策略）
  private async smartSearch(
    query: string,
    parseResult: QueryParseResult,
    timeout: number,
    maxResults: number
  ): Promise<HybridSearchResult> {
    // 简单查询直接使用单一策略
    if (parseResult.confidence > 0.8) {
      const agent = this.getAgentForIntent(parseResult.intent)
      const result = await this.executeWithTimeout(agent, query, timeout)

      if (result.success) {
        return {
          results: result.results.map(photo => ({
            photoId: photo.id,
            photo,
            finalScore: result.confidence,
            sources: [{ agent: result.source, originalScore: result.confidence, weight: 1, weightedScore: result.confidence }],
            matchedAgents: [result.source]
          })),
          parseResult,
          stats: {
            totalResults: result.results.length,
            agentsUsed: 1,
            duplicatesRemoved: 0,
            averageScore: result.confidence
          }
        }
      }
    }

    // 复杂查询使用并行搜索
    return this.parallelSearch(query, parseResult, timeout, maxResults)
  }

  private selectAgents(parseResult: QueryParseResult): BaseAgent[] {
    const agents: BaseAgent[] = []

    // 根据意图选择代理
    switch (parseResult.intent) {
      case 'semantic':
        agents.push(this.semanticAgent)
        agents.push(this.keywordAgent)
        break
      case 'keyword':
        agents.push(this.keywordAgent)
        if (parseResult.confidence < 0.8) {
          agents.push(this.semanticAgent)
        }
        break
      case 'people':
        agents.push(this.peopleAgent)
        break
      case 'mixed':
        agents.push(this.semanticAgent)
        agents.push(this.keywordAgent)
        if (parseResult.entities.people?.length) {
          agents.push(this.peopleAgent)
        }
        break
      default:
        agents.push(this.keywordAgent)
        agents.push(this.semanticAgent)
    }

    return agents
  }

  private rankStrategies(parseResult: QueryParseResult): string[] {
    // 根据置信度排序策略
    return Object.keys(resultMerger.defaultWeights)
      .filter(s => parseResult.strategy[s])
      .sort((a, b) => {
        const scoreA = parseResult.strategy.weights[a] || 0
        const scoreB = parseResult.strategy.weights[b] || 0
        return scoreB - scoreA
      })
  }

  private getAgentForIntent(intent: SearchIntent): BaseAgent {
    switch (intent) {
      case 'semantic': return this.semanticAgent
      case 'keyword': return this.keywordAgent
      case 'people': return this.peopleAgent
      default: return this.keywordAgent
    }
  }

  private getAgentForStrategy(strategy: string): BaseAgent {
    switch (strategy) {
      case 'semantic': return this.semanticAgent
      case 'keyword': return this.keywordAgent
      case 'people': return this.peopleAgent
      default: return this.keywordAgent
    }
  }

  private async executeWithTimeout(
    agent: BaseAgent,
    query: string,
    timeout: number
  ): Promise<AgentResult> {
    return Promise.race([
      agent.execute(query),
      new Promise<AgentResult>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]).catch(() => ({
      success: false,
      results: [],
      confidence: 0,
      source: 'unknown',
      metadata: { error: 'Timeout' }
    }))
  }
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/resultMerger.ts` |
| 新建 | `electron/services/hybridSearchService.ts` |

## Dependencies

### 内部依赖
- `electron/agents/KeywordAgent.ts`
- `electron/agents/SemanticAgent.ts`
- `electron/agents/PeopleAgent.ts`
- `electron/services/llmService.ts`

### 外部依赖
- 无新增外部依赖

## Testing Approach

### 单元测试
1. **融合测试**
   - 测试结果合并
   - 测试去重
   - 测试分数计算

2. **权重调整测试**
   - 测试不同意图的权重
   - 测试 RRF 融合

### 集成测试
1. **端到端测试**
   - 测试完整混合搜索流程
   - 测试不同查询类型
   - 测试超时处理

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 合并多个代理结果 | 执行混合查询，验证返回多个来源的结果 |
| 去除重复 | 同一照片出现在多个来源，验证只返回一次 |
| 按综合分数排序 | 验证结果按 finalScore 降序排列 |
| 融合 < 100ms | 使用 console.time 测量 |
| 稳定可复现 | 多次执行相同查询，验证结果顺序相同 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 排序不稳定 | 低 | 使用确定性的排序算法 |
| 权重不合理 | 中 | 根据反馈调整默认权重 |
| 融合速度慢 | 低 | 优化算法，使用 Map 替代数组 |

## Related Stories

### 前置依赖
- E-03.1: LLM 查询解析 - 获取解析结果
- E-03.2: 关键词搜索 - 关键词代理
- E-03.3: 全局向量搜索 - 语义代理

### 后续故事
- 无（Epic 3 完成）

### 相关故事
- E-02.4: 向量相似度搜索 - 底层搜索
- E-05.2: 搜索结果展示 - 展示融合结果
