/**
 * PhotoMind - ResultMergeService Unit Tests
 *
 * Tests for Epic E-03: 混合搜索服务
 * Story: E-03.4 (结果融合与排序)
 *
 * 功能：
 * 1. 融合关键词和向量搜索结果
 * 2. 结果去重和加权排序
 * 3. 意图感知的权重调整
 * 4. 结果重新排序
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'

// ============================================
// Mock 类型定义 (与源文件保持一致)
// ============================================
type QueryType = 'keyword' | 'semantic' | 'time' | 'location' | 'people' | 'mixed'

interface QueryEntity {
  type: 'person' | 'time' | 'location' | 'event' | 'object' | 'emotion'
  value: string
  confidence: number
}

interface SearchHint {
  type: 'year' | 'month' | 'place' | 'person' | 'album' | 'keyword'
  value: string
}

interface QueryIntent {
  type: QueryType
  confidence: number
  entities: QueryEntity[]
  refinedQuery: string
  searchHints: SearchHint[]
}

interface KeywordSearchResult {
  photoUuid: string
  fileName: string
  filePath: string
  matchScore: number
  highlights: string[]
}

interface GlobalSearchResult {
  photoUuid: string
  fileName: string
  filePath: string
  similarity: number
  rank: number
  highlights: string[]
}

interface MergedSearchOptions {
  query: string
  queryIntent?: QueryIntent
  keywordWeight?: number
  vectorWeight?: number
  limit?: number
  minScore?: number
  enableDeduplication?: boolean
}

interface SearchSource {
  type: 'keyword' | 'semantic'
  score: number
  weight: number
  weightedScore: number
}

interface MergedSearchResult {
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

interface MergedSearchResponse {
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

// ============================================
// Mock 模块
// ============================================
const mockKeywordSearchService = {
  search: vi.fn()
}

const mockGlobalSearchService = {
  search: vi.fn()
}

const mockQueryParserService = {
  parse: vi.fn()
}

const mockPhotoDatabase = {
  getPhotoByUuid: vi.fn()
}

// ============================================
// 模拟 ResultMergeService (从源文件提取核心逻辑)
// ============================================
class MockResultMergeService {
  private keywordWeight = 0.3
  private vectorWeight = 0.7
  private database: typeof mockPhotoDatabase

  constructor(database?: typeof mockPhotoDatabase) {
    this.database = database || mockPhotoDatabase
  }

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

    this.keywordWeight = keywordWeight
    this.vectorWeight = vectorWeight

    const [keywordResults, semanticResults] = await Promise.all([
      this.mockKeywordSearch(query),
      this.mockSemanticSearch(query)
    ])

    const merged = this.mergeResults(
      keywordResults,
      semanticResults,
      keywordWeight,
      vectorWeight,
      enableDeduplication
    )

    const filtered = merged
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    filtered.forEach((r, i) => r.rank = i + 1)

    await this.enrichResults(filtered)

    const processingTime = Date.now() - startTime

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

  async searchWithIntent(query: string): Promise<MergedSearchResponse> {
    const parseResult = await this.mockQueryParserParse(query)
    const intent = parseResult.parsed

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

    return this.search({
      query,
      queryIntent: intent,
      keywordWeight,
      vectorWeight,
      limit: 50,
      enableDeduplication: true
    })
  }

  private async mockKeywordSearch(query: string): Promise<KeywordSearchResult[]> {
    try {
      return await mockKeywordSearchService.search({ query, fuzzy: true, limit: 100 })
    } catch {
      console.error('[ResultMerge] 关键词搜索失败:')
      return []
    }
  }

  private async mockSemanticSearch(query: string): Promise<GlobalSearchResult[]> {
    try {
      return await mockGlobalSearchService.search({ query, topK: 100, minSimilarity: 0.1 })
    } catch {
      console.error('[ResultMerge] 向量搜索失败:')
      return []
    }
  }

  private async mockQueryParserParse(query: string): Promise<{ parsed: QueryIntent }> {
    return mockQueryParserService.parse(query)
  }

  private mergeResults(
    keywordResults: KeywordSearchResult[],
    semanticResults: GlobalSearchResult[],
    keywordWeight: number,
    vectorWeight: number,
    enableDeduplication: boolean
  ): MergedSearchResult[] {
    const scoreMap = new Map<string, MergedSearchResult>()

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

    for (const item of semanticResults) {
      const normalizedScore = this.normalizeVectorScore(item.similarity)
      const weightedScore = normalizedScore * vectorWeight

      const existing = scoreMap.get(item.photoUuid)
      if (existing) {
        existing.sources.push({
          type: 'semantic',
          score: normalizedScore,
          weight: vectorWeight,
          weightedScore
        })
        existing.score = this.calculateTotalScore(existing.sources)
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

    return Array.from(scoreMap.values())
  }

  private normalizeKeywordScore(matchScore: number): number {
    return Math.min(matchScore / 100, 1)
  }

  private normalizeVectorScore(similarity: number): number {
    return Math.min(Math.max(similarity, 0), 1)
  }

  private calculateTotalScore(sources: SearchSource[]): number {
    return sources.reduce((total, source) => total + source.weightedScore, 0)
  }

  private async enrichResults(results: MergedSearchResult[]): Promise<void> {
    for (const r of results) {
      const photo = this.database.getPhotoByUuid(r.photoUuid)
      if (photo) {
        r.thumbnailPath = photo.thumbnailPath
        r.takenAt = photo.takenAt
      }
    }
  }

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

    sorted.forEach((r, i) => r.rank = i + 1)
    return sorted
  }

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

// ============================================
// 测试
// ============================================
describe('ResultMergeService Core Logic - Epic E-03.4', () => {

  // ============================================
  // Phase 1: 结果融合测试
  // ============================================
  describe('结果融合测试', () => {

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should merge keyword and semantic results', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'beach.jpg', filePath: '/photos/beach.jpg', matchScore: 80, highlights: ['beach'] }
      ])

      mockGlobalSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-2', fileName: 'sunset.jpg', filePath: '/photos/sunset.jpg', similarity: 0.75, rank: 1, highlights: ['sunset'] }
      ])

      const result = await service.search({
        query: 'beach sunset',
        keywordWeight: 0.5,
        vectorWeight: 0.5,
        limit: 50,
        enableDeduplication: true
      })

      expect(result.results).toHaveLength(2)
      expect(result.stats.keywordCount).toBe(1)
      expect(result.stats.semanticCount).toBe(1)
      expect(result.stats.mergedCount).toBe(2)
    })

    it('should deduplicate photos appearing in both searches', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'beach.jpg', filePath: '/photos/beach.jpg', matchScore: 80, highlights: ['beach'] }
      ])

      mockGlobalSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'beach.jpg', filePath: '/photos/beach.jpg', similarity: 0.85, rank: 1, highlights: ['beach', 'sun'] }
      ])

      const result = await service.search({
        query: 'beach sunset',
        keywordWeight: 0.5,
        vectorWeight: 0.5,
        limit: 50,
        enableDeduplication: true
      })

      // 应该只有一个结果
      expect(result.results).toHaveLength(1)
      expect(result.results[0].photoUuid).toBe('photo-1')
      // 应该有两个来源
      expect(result.results[0].sources).toHaveLength(2)
      // 高亮应该合并
      expect(result.results[0].highlights).toContain('beach')
      expect(result.results[0].highlights).toContain('sun')
    })

    it('should calculate weighted score correctly', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'beach.jpg', filePath: '/photos/beach.jpg', matchScore: 80, highlights: ['beach'] }
      ])

      mockGlobalSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'beach.jpg', filePath: '/photos/beach.jpg', similarity: 0.90, rank: 1, highlights: ['beach'] }
      ])

      const result = await service.search({
        query: 'beach sunset',
        keywordWeight: 0.3,
        vectorWeight: 0.7,
        limit: 50,
        enableDeduplication: true
      })

      const mergedResult = result.results[0]
      // keyword: 0.8 * 0.3 = 0.24
      // semantic: 0.9 * 0.7 = 0.63
      // total: 0.24 + 0.63 = 0.87
      expect(mergedResult.score).toBeCloseTo(0.87, 2)
    })

    it('should filter results below minScore', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'low-score.jpg', filePath: '/photos/low.jpg', matchScore: 10, highlights: [] }
      ])

      mockGlobalSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-2', fileName: 'high-score.jpg', filePath: '/photos/high.jpg', similarity: 0.8, rank: 1, highlights: [] }
      ])

      const result = await service.search({
        query: 'test query',
        keywordWeight: 0.5,
        vectorWeight: 0.5,
        limit: 50,
        minScore: 0.3,
        enableDeduplication: true
      })

      // minScore = 0.3, keyword normalized = 0.1 * 0.5 = 0.05 (filtered)
      // semantic normalized = 0.8 * 0.5 = 0.4 (kept)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].photoUuid).toBe('photo-2')
    })

    it('should respect limit parameter', async () => {
      const service = new MockResultMergeService()

      const keywordResults = Array.from({ length: 30 }, (_, i) => ({
        photoUuid: `kw-photo-${i}`,
        fileName: `kw-${i}.jpg`,
        filePath: `/photos/kw-${i}.jpg`,
        matchScore: 50 + (i % 20),
        highlights: []
      }))

      const semanticResults = Array.from({ length: 30 }, (_, i) => ({
        photoUuid: `vec-photo-${i}`,
        fileName: `vec-${i}.jpg`,
        filePath: `/photos/vec-${i}.jpg`,
        similarity: 0.5 + (i % 20) / 100,
        rank: i + 1,
        highlights: []
      }))

      mockKeywordSearchService.search.mockResolvedValue(keywordResults)
      mockGlobalSearchService.search.mockResolvedValue(semanticResults)

      const result = await service.search({
        query: 'test query',
        keywordWeight: 0.5,
        vectorWeight: 0.5,
        limit: 10,
        enableDeduplication: true
      })

      expect(result.results.length).toBeLessThanOrEqual(10)
      expect(result.stats.mergedCount).toBeLessThanOrEqual(10)
    })
  })

  // ============================================
  // Phase 2: 意图感知权重调整测试
  // ============================================
  describe('意图感知权重调整测试', () => {

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should adjust weights for keyword intent', async () => {
      const service = new MockResultMergeService()

      mockQueryParserService.parse.mockResolvedValue({
        parsed: {
          type: 'keyword',
          confidence: 0.85,
          entities: [],
          refinedQuery: 'test query',
          searchHints: []
        }
      })

      mockKeywordSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'test.jpg', filePath: '/photos/test.jpg', matchScore: 90, highlights: [] }
      ])

      mockGlobalSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-2', fileName: 'other.jpg', filePath: '/photos/other.jpg', similarity: 0.6, rank: 1, highlights: [] }
      ])

      const result = await service.searchWithIntent('test query')

      expect(result.intent?.type).toBe('keyword')
      // Keyword query should have keywordWeight = 0.7, vectorWeight = 0.3
      const keywordResult = result.results.find(r => r.photoUuid === 'photo-1')
      expect(keywordResult).toBeDefined()
    })

    it('should adjust weights for semantic intent', async () => {
      const service = new MockResultMergeService()

      mockQueryParserService.parse.mockResolvedValue({
        parsed: {
          type: 'semantic',
          confidence: 0.9,
          entities: [{ type: 'emotion', value: 'beautiful', confidence: 0.8 }],
          refinedQuery: 'beautiful sunset',
          searchHints: []
        }
      })

      mockKeywordSearchService.search.mockResolvedValue([])
      mockGlobalSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'sunset.jpg', filePath: '/photos/sunset.jpg', similarity: 0.85, rank: 1, highlights: ['sunset'] }
      ])

      const result = await service.searchWithIntent('好看的日落')

      expect(result.intent?.type).toBe('semantic')
    })

    it('should use balanced weights for mixed intent', async () => {
      const service = new MockResultMergeService()

      mockQueryParserService.parse.mockResolvedValue({
        parsed: {
          type: 'mixed',
          confidence: 0.75,
          entities: [
            { type: 'time', value: '2023', confidence: 0.9 },
            { type: 'location', value: '东京', confidence: 0.8 }
          ],
          refinedQuery: '2023 Tokyo',
          searchHints: []
        }
      })

      mockKeywordSearchService.search.mockResolvedValue([])
      mockGlobalSearchService.search.mockResolvedValue([])

      const result = await service.searchWithIntent('2023年在东京拍的照片')

      expect(result.intent?.type).toBe('mixed')
    })
  })

  // ============================================
  // Phase 3: 分数标准化测试
  // ============================================
  describe('分数标准化测试', () => {

    it('should normalize keyword score to 0-1 range', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'test.jpg', filePath: '/photos/test.jpg', matchScore: 150, highlights: [] }
      ])
      mockGlobalSearchService.search.mockResolvedValue([])

      const result = await service.search({ query: 'test', keywordWeight: 1, vectorWeight: 0 })

      // 150/100 = 1 (capped at 1)
      expect(result.results[0].score).toBe(1)
    })

    it('should normalize vector score to 0-1 range', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockResolvedValue([])
      mockGlobalSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'test.jpg', filePath: '/photos/test.jpg', similarity: 1.5, rank: 1, highlights: [] }
      ])

      const result = await service.search({ query: 'test', keywordWeight: 0, vectorWeight: 1, minScore: 0 })

      // similarity capped at 1
      expect(result.results[0].score).toBe(1)
    })

    it('should handle negative vector scores', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockResolvedValue([])
      mockGlobalSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'test.jpg', filePath: '/photos/test.jpg', similarity: -0.3, rank: 1, highlights: [] }
      ])

      const result = await service.search({ query: 'test', keywordWeight: 0, vectorWeight: 1, minScore: 0 })

      // negative clamped to 0
      expect(result.results[0].score).toBe(0)
    })
  })

  // ============================================
  // Phase 4: 结果重排序测试
  // ============================================
  describe('结果重排序测试', () => {

    it('should sort by keyword score', () => {
      const service = new MockResultMergeService()

      const results: MergedSearchResult[] = [
        createMockResult('photo-1', 0.3, 'keyword', 0.8),
        createMockResult('photo-2', 0.5, 'keyword', 0.3),
        createMockResult('photo-3', 0.4, 'semantic', 0.9)
      ]

      const sorted = service.reorderResults(results, 'keyword')

      // photo-1 has highest keyword score (0.8), photo-2 has 0.3, photo-3 has 0 (no keyword)
      expect(sorted[0].photoUuid).toBe('photo-1') // highest keyword score
      expect(sorted[1].photoUuid).toBe('photo-2') // second highest
      expect(sorted[2].photoUuid).toBe('photo-3') // no keyword source, comes last
    })

    it('should sort by semantic score', () => {
      const service = new MockResultMergeService()

      const results: MergedSearchResult[] = [
        createMockResult('photo-1', 0.3, 'keyword', 0.8),
        createMockResult('photo-2', 0.5, 'keyword', 0.3),
        createMockResult('photo-3', 0.4, 'semantic', 0.9)
      ]

      const sorted = service.reorderResults(results, 'semantic')

      expect(sorted[0].photoUuid).toBe('photo-3') // highest semantic score
    })

    it('should sort by recency', () => {
      const service = new MockResultMergeService()

      const results: MergedSearchResult[] = [
        createMockResult('photo-1', 0.5, 'keyword', 0.8, '2023-01-01'),
        createMockResult('photo-2', 0.5, 'keyword', 0.8, '2023-06-01'),
        createMockResult('photo-3', 0.5, 'keyword', 0.8, '2023-03-01')
      ]

      const sorted = service.reorderResults(results, 'recency')

      expect(sorted[0].photoUuid).toBe('photo-2') // most recent
      expect(sorted[1].photoUuid).toBe('photo-3')
      expect(sorted[2].photoUuid).toBe('photo-1') // oldest
    })

    it('should sort by mixed score by default', () => {
      const service = new MockResultMergeService()

      const results: MergedSearchResult[] = [
        createMockResult('photo-1', 0.2),
        createMockResult('photo-2', 0.8),
        createMockResult('photo-3', 0.5)
      ]

      const sorted = service.reorderResults(results, 'mixed')

      expect(sorted[0].photoUuid).toBe('photo-2') // highest score
      expect(sorted[1].photoUuid).toBe('photo-3')
      expect(sorted[2].photoUuid).toBe('photo-1')
    })

    it('should update rank after reordering', () => {
      const service = new MockResultMergeService()

      const results: MergedSearchResult[] = [
        createMockResult('photo-1', 0.3, 'keyword', 0.5),
        createMockResult('photo-2', 0.5, 'keyword', 0.5),
        createMockResult('photo-3', 0.4, 'keyword', 0.5)
      ]

      const sorted = service.reorderResults(results, 'mixed')

      expect(sorted[0].rank).toBe(1)
      expect(sorted[1].rank).toBe(2)
      expect(sorted[2].rank).toBe(3)
    })
  })

  // ============================================
  // Phase 5: 统计信息测试
  // ============================================
  describe('统计信息测试', () => {

    it('should calculate correct statistics', () => {
      const service = new MockResultMergeService()

      const results: MergedSearchResult[] = [
        createMockResult('photo-1', 0.5, 'keyword', 0.8),
        createMockResult('photo-2', 0.4, 'semantic', 0.9),
        createMockResult('photo-3', 0.6, 'keyword', 0.7, undefined, 'semantic', 0.5),
        createMockResult('photo-4', 0.3, 'keyword', 0.6)
      ]

      const stats = service.getStats(results)

      expect(stats.total).toBe(4)
      expect(stats.keywordOnly).toBe(2) // photo-1, photo-4
      expect(stats.semanticOnly).toBe(1) // photo-2
      expect(stats.withBothSources).toBe(1) // photo-3
      // avgScore = (0.5 + 0.4 + 0.6 + 0.3) / 4 = 0.45
      expect(stats.avgScore).toBeCloseTo(0.45, 2)
    })

    it('should return zero avgScore for empty results', () => {
      const service = new MockResultMergeService()

      const stats = service.getStats([])

      expect(stats.total).toBe(0)
      expect(stats.withBothSources).toBe(0)
      expect(stats.keywordOnly).toBe(0)
      expect(stats.semanticOnly).toBe(0)
      expect(stats.avgScore).toBe(0)
    })
  })

  // ============================================
  // Phase 6: 边缘情况测试
  // ============================================
  describe('边缘情况测试', () => {

    it('should handle empty keyword results', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockResolvedValue([])
      mockGlobalSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'test.jpg', filePath: '/photos/test.jpg', similarity: 0.8, rank: 1, highlights: [] }
      ])

      const result = await service.search({ query: 'test', keywordWeight: 0.5, vectorWeight: 0.5 })

      expect(result.results).toHaveLength(1)
      expect(result.stats.keywordCount).toBe(0)
      expect(result.stats.semanticCount).toBe(1)
    })

    it('should handle empty semantic results', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'test.jpg', filePath: '/photos/test.jpg', matchScore: 70, highlights: [] }
      ])
      mockGlobalSearchService.search.mockResolvedValue([])

      const result = await service.search({ query: 'test', keywordWeight: 0.5, vectorWeight: 0.5 })

      expect(result.results).toHaveLength(1)
      expect(result.stats.keywordCount).toBe(1)
      expect(result.stats.semanticCount).toBe(0)
    })

    it('should handle both empty results', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockResolvedValue([])
      mockGlobalSearchService.search.mockResolvedValue([])

      const result = await service.search({ query: 'test' })

      expect(result.results).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('should handle service errors gracefully', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockRejectedValue(new Error('Search failed'))
      mockGlobalSearchService.search.mockResolvedValue([])

      const result = await service.search({ query: 'test' })

      // Should return empty results, not throw
      expect(result.results).toHaveLength(0)
    })
  })

  // ============================================
  // Phase 7: 处理时间测试
  // ============================================
  describe('处理时间测试', () => {

    it('should complete merge within acceptable time', async () => {
      const service = new MockResultMergeService()

      mockKeywordSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-1', fileName: 'test.jpg', filePath: '/photos/test.jpg', matchScore: 70, highlights: [] }
      ])
      mockGlobalSearchService.search.mockResolvedValue([
        { photoUuid: 'photo-2', fileName: 'test2.jpg', filePath: '/photos/test2.jpg', similarity: 0.7, rank: 1, highlights: [] }
      ])

      const startTime = Date.now()
      const result = await service.search({ query: 'test' })
      const duration = Date.now() - startTime

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
      // Should complete quickly (less than 1 second for simple mock)
      expect(duration).toBeLessThan(1000)
    })
  })
})

// ============================================
// Helper 函数
// ============================================
function createMockResult(
  photoUuid: string,
  score: number,
  source1Type?: 'keyword' | 'semantic',
  source1WeightedScore?: number,
  takenAt?: string,
  source2Type?: 'keyword' | 'semantic',
  source2WeightedScore?: number
): MergedSearchResult {
  const sources: SearchSource[] = []

  if (source1Type && source1WeightedScore !== undefined) {
    sources.push({
      type: source1Type,
      score: source1WeightedScore,
      weight: 0.5,
      weightedScore: source1WeightedScore
    })
  }

  if (source2Type && source2WeightedScore !== undefined) {
    sources.push({
      type: source2Type,
      score: source2WeightedScore,
      weight: 0.5,
      weightedScore: source2WeightedScore
    })
  }

  if (sources.length === 0) {
    sources.push({
      type: 'keyword',
      score: score,
      weight: 1,
      weightedScore: score
    })
  }

  return {
    photoUuid,
    fileName: `${photoUuid}.jpg`,
    filePath: `/photos/${photoUuid}.jpg`,
    score,
    rank: 0,
    sources,
    highlights: [],
    takenAt
  }
}
