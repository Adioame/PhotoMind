/**
 * PhotoMind - 结果融合服务
 *
 * 功能：
 * 1. 融合关键词和向量搜索结果
 * 2. 结果去重和加权排序
 * 3. 意图感知的权重调整
 * 4. 结果重新排序
 */
import { KeywordSearchResult, keywordSearchService } from './keywordSearchService.js'
import { GlobalSearchResult, globalSearchService } from './globalSearchService.js'
import { QueryIntent, queryParserService } from './queryParserService.js'
import { PhotoDatabase } from '../database/db.js'

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
  private database: PhotoDatabase

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

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

    // 5. 丰富结果
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

    // 返回去重后的结果
    if (enableDeduplication) {
      return Array.from(scoreMap.values())
    }

    return Array.from(scoreMap.values())
  }

  /**
   * 标准化关键词分数 (0-1)
   */
  private normalizeKeywordScore(matchScore: number): number {
    return Math.min(matchScore / 100, 1)
  }

  /**
   * 标准化向量分数 (0-1)
   */
  private normalizeVectorScore(similarity: number): number {
    return Math.min(Math.max(similarity, 0), 1)
  }

  /**
   * 计算总分
   */
  private calculateTotalScore(sources: SearchSource[]): number {
    return sources.reduce((total, source) => total + source.weightedScore, 0)
  }

  /**
   * 丰富结果
   */
  private async enrichResults(results: MergedSearchResult[]): Promise<void> {
    for (const r of results) {
      const photo = this.database.getPhotoByUuid(r.photoUuid)
      if (photo) {
        r.thumbnailPath = photo.thumbnail_path
        r.takenAt = photo.taken_at
      }
    }
  }

  /**
   * 重新排序结果
   */
  reorderResults(
    results: MergedSearchResult[],
    sortBy: 'keyword' | 'semantic' | 'mixed' | 'recency'
  ): MergedSearchResult[] {
    const sorted = [...results]

    switch (sortBy) {
      case 'keyword':
        sorted.sort((a, b) => {
          const aKeyword = a.sources.find(s => s.type === 'keyword')?.weightedScore || 0
          const bKeyword = b.sources.find(s => s.type === 'keyword')?.weightedScore || 0
          return bKeyword - aKeyword
        })
        break

      case 'semantic':
        sorted.sort((a, b) => {
          const aSemantic = a.sources.find(s => s.type === 'semantic')?.weightedScore || 0
          const bSemantic = b.sources.find(s => s.type === 'semantic')?.weightedScore || 0
          return bSemantic - aSemantic
        })
        break

      case 'recency':
        sorted.sort((a, b) => {
          const dateA = a.takenAt ? new Date(a.takenAt).getTime() : 0
          const dateB = b.takenAt ? new Date(b.takenAt).getTime() : 0
          return dateB - dateA
        })
        break

      case 'mixed':
      default:
        sorted.sort((a, b) => b.score - a.score)
    }

    // 更新排名
    sorted.forEach((r, i) => r.rank = i + 1)
    return sorted
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
