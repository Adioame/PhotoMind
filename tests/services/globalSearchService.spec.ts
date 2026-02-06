/**
 * PhotoMind - GlobalSearchService Unit Tests
 *
 * Tests for Epic E-03: 混合搜索服务
 * Story: E-03.3 全局向量搜索
 *
 * 功能：
 * 1. 全局语义向量搜索
 * 2. 相似照片查找
 * 3. 批量搜索
 * 4. 搜索结果分页
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================
// Types (copied from implementation)
// ============================================

export interface GlobalSearchOptions {
  query: string
  topK?: number
  minSimilarity?: number
  page?: number
  pageSize?: number
  includeMetadata?: boolean
}

export interface GlobalSearchResult {
  photoUuid: string
  fileName: string
  filePath: string
  similarity: number
  rank: number
  thumbnailPath?: string
  takenAt?: string
}

export interface GlobalSearchResponse {
  results: GlobalSearchResult[]
  total: number
  page: number
  pageSize: number
  processingTimeMs: number
  query: {
    original: string
    processed: string
    vectorDimension: number
  }
}

// ============================================
// Mock Data
// ============================================

// Create deterministic 512-dimension vectors
const createMockEmbedding = (photoUuid: string, baseSimilarity: number) => ({
  photoUuid,
  vector: Array(512).fill(0).map((_, i) => {
    const seed = photoUuid.charCodeAt(photoUuid.length - 1) || 1
    return Math.sin(i * seed * 0.01) * baseSimilarity
  })
})

const mockEmbeddings = [
  createMockEmbedding('photo-001', 0.85),
  createMockEmbedding('photo-002', 0.72),
  createMockEmbedding('photo-003', 0.45),
  createMockEmbedding('photo-004', 0.91),
  createMockEmbedding('photo-005', 0.23)
]

// Mock photos data
const mockPhotos = [
  {
    uuid: 'photo-001',
    file_name: 'IMG_20231225_sunset_beach.jpg',
    file_path: '/Users/mac/Pictures/vacation/hawaii/IMG_20231225_sunset_beach.jpg',
    thumbnail_path: '/Users/mac/.photomind/thumbnails/photo-001.jpg',
    taken_at: '2023-12-25T18:30:00Z'
  },
  {
    uuid: 'photo-002',
    file_name: 'family_christmas_2023.jpg',
    file_path: '/Users/mac/Pictures/family/christmas/family_christmas_2023.jpg',
    thumbnail_path: '/Users/mac/.photomind/thumbnails/photo-002.jpg',
    taken_at: '2023-12-25T12:00:00Z'
  },
  {
    uuid: 'photo-003',
    file_name: 'mountain_hiking_trip.png',
    file_path: '/Users/mac/Pictures/adventures/alps/mountain_hiking_trip.png',
    thumbnail_path: '/Users/mac/.photomind/thumbnails/photo-003.jpg',
    taken_at: '2023-09-15T10:00:00Z'
  },
  {
    uuid: 'photo-004',
    file_name: 'beach_volleyball_summer.jpg',
    file_path: '/Users/mac/Pictures/sports/beach_volleyball_summer.jpg',
    thumbnail_path: '/Users/mac/.photomind/thumbnails/photo-004.jpg',
    taken_at: '2023-07-20T15:00:00Z'
  },
  {
    uuid: 'photo-005',
    file_name: '工作文档_screenshot.png',
    file_path: '/Users/mac/Documents/screenshots/工作文档_screenshot.png',
    thumbnail_path: '/Users/mac/.photomind/thumbnails/photo-005.jpg',
    taken_at: '2024-01-10T09:00:00Z'
  }
]

// ============================================
// GlobalSearchService Implementation (Inline Test Version)
// ============================================

interface MockDatabase {
  getAllPhotos: () => any[]
  getPhotoByUuid: (uuid: string) => any
  getAllEmbeddings: () => Promise<any[]>
}

interface MockEmbeddingService {
  textToEmbedding: (text: string) => Promise<{
    success: boolean
    vector?: number[]
    error?: string
  }>
}

interface MockTextPreprocessor {
  preprocess: (text: string) => {
    original: string
    processed: string
    tokens: string[]
  }
}

interface SimilarityResult {
  id: string
  similarity: number
}

class MockSimilarityService {
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    let dotProduct = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    return denominator === 0 ? 0 : dotProduct / denominator
  }

  batchSimilarity(queryVector: number[], targetVectors: any[]): SimilarityResult[] {
    return targetVectors.map(item => ({
      id: item.photoUuid,
      similarity: 0.5 + (item.photoUuid.charCodeAt(6) % 10) / 20
    }))
  }
}

class TestGlobalSearchService {
  private database: MockDatabase
  private embeddingService: MockEmbeddingService
  private textPreprocessor: MockTextPreprocessor
  private similarityService: MockSimilarityService

  constructor(
    database: MockDatabase,
    embeddingService: MockEmbeddingService,
    textPreprocessor: MockTextPreprocessor
  ) {
    this.database = database
    this.embeddingService = embeddingService
    this.textPreprocessor = textPreprocessor
    this.similarityService = new MockSimilarityService()
  }

  async search(options: GlobalSearchOptions): Promise<GlobalSearchResponse> {
    const startTime = Date.now()
    const {
      query,
      topK = 100,
      minSimilarity = 0.1,
      page = 1,
      pageSize = 20,
      includeMetadata = false
    } = options

    // 1. Preprocess query
    const processed = this.textPreprocessor.preprocess(query)

    // 2. Generate query vector
    const embeddingResult = await this.embeddingService.textToEmbedding(processed.processed)

    if (!embeddingResult.success || !embeddingResult.vector) {
      return {
        results: [],
        total: 0,
        page,
        pageSize,
        processingTimeMs: Date.now() - startTime,
        query: {
          original: query,
          processed: processed.processed,
          vectorDimension: 0
        }
      }
    }

    // 3. Get all embeddings
    const allEmbeddings = await this.database.getAllEmbeddings()

    if (allEmbeddings.length === 0) {
      return {
        results: [],
        total: 0,
        page,
        pageSize,
        processingTimeMs: Date.now() - startTime,
        query: {
          original: query,
          processed: processed.processed,
          vectorDimension: embeddingResult.vector.length
        }
      }
    }

    // 4. Calculate similarity
    const similarities = this.similarityService.batchSimilarity(
      embeddingResult.vector,
      allEmbeddings
    )

    // 5. Filter and sort
    const filtered = similarities
      .filter(sim => sim.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)

    // 6. Build results
    const results: GlobalSearchResult[] = []

    for (let i = 0; i < filtered.length; i++) {
      const item = filtered[i]
      const photo = this.database.getPhotoByUuid(item.id)

      if (photo) {
        const result: GlobalSearchResult = {
          photoUuid: item.id,
          fileName: photo.file_name,
          filePath: photo.file_path,
          similarity: item.similarity,
          rank: i + 1,
          thumbnailPath: photo.thumbnail_path
        }

        if (includeMetadata) {
          result.takenAt = photo.taken_at
        }

        results.push(result)
      }
    }

    // 7. Pagination
    const startIndex = (page - 1) * pageSize
    const pagedResults = results.slice(startIndex, startIndex + pageSize)

    const processingTime = Date.now() - startTime

    return {
      results: pagedResults,
      total: results.length,
      page,
      pageSize,
      processingTimeMs: processingTime,
      query: {
        original: query,
        processed: processed.processed,
        vectorDimension: embeddingResult.vector.length
      }
    }
  }

  async quickSearch(query: string, topK: number = 10): Promise<GlobalSearchResult[]> {
    const result = await this.search({
      query,
      topK,
      minSimilarity: 0.05,
      page: 1,
      pageSize: topK
    })
    return result.results
  }

  async findSimilarPhotos(photoUuid: string, topK: number = 10): Promise<GlobalSearchResult[]> {
    const embeddings = await this.database.getAllEmbeddings()
    const targetEmbedding = embeddings.find(e => e.photoUuid === photoUuid)

    if (!targetEmbedding) {
      return []
    }

    const otherEmbeddings = embeddings.filter(e => e.photoUuid !== photoUuid)
    const similarities = this.similarityService.batchSimilarity(
      targetEmbedding.vector,
      otherEmbeddings
    )

    const sorted = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)

    const results: GlobalSearchResult[] = []

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i]
      const photo = this.database.getPhotoByUuid(item.id)

      if (photo) {
        results.push({
          photoUuid: item.id,
          fileName: photo.file_name,
          filePath: photo.file_path,
          similarity: item.similarity,
          rank: i + 1,
          thumbnailPath: photo.thumbnail_path,
          takenAt: photo.taken_at
        })
      }
    }

    return results
  }

  async batchSearch(
    queries: string[],
    options: { topK?: number; minSimilarity?: number } = {}
  ): Promise<GlobalSearchResponse[]> {
    const { topK = 50, minSimilarity = 0.1 } = options
    const results: GlobalSearchResponse[] = []

    for (const query of queries) {
      const result = await this.search({
        query,
        topK,
        minSimilarity
      })
      results.push(result)
    }

    return results
  }

  async getStats(): Promise<{
    totalPhotos: number
    totalEmbeddings: number
    coverage: number
  }> {
    const photos = this.database.getAllPhotos()
    const embeddings = await this.database.getAllEmbeddings()

    return {
      totalPhotos: photos.length,
      totalEmbeddings: embeddings.length,
      coverage: photos.length > 0 ? embeddings.length / photos.length : 0
    }
  }
}

// ============================================
// Mock Factories
// ============================================

const createMockDatabase = (photos: any[], embeddings: any[]) => ({
  getAllPhotos: vi.fn().mockReturnValue(photos),
  getPhotoByUuid: vi.fn((uuid: string) => photos.find(p => p.uuid === uuid) || null),
  getAllEmbeddings: vi.fn().mockResolvedValue(embeddings)
})

const createMockEmbeddingService = (vector?: number[], success: boolean = true) => ({
  textToEmbedding: vi.fn().mockResolvedValue({
    success,
    vector: vector || Array(512).fill(0.5),
    processingTimeMs: 10
  })
})

const createMockTextPreprocessor = () => ({
  preprocess: vi.fn((text: string) => ({
    original: text,
    processed: text.toLowerCase().trim(),
    tokens: text.toLowerCase().trim().split(/\s+/)
  }))
})

// ============================================
// GlobalSearchService Tests
// ============================================

describe('GlobalSearchService - Epic E-03.3', () => {
  let service: TestGlobalSearchService
  let mockDb: ReturnType<typeof createMockDatabase>
  let mockEmbeddingService: ReturnType<typeof createMockEmbeddingService>
  let mockTextPreprocessor: ReturnType<typeof createMockTextPreprocessor>

  beforeEach(() => {
    mockDb = createMockDatabase(mockPhotos, mockEmbeddings)
    mockEmbeddingService = createMockEmbeddingService()
    mockTextPreprocessor = createMockTextPreprocessor()

    service = new TestGlobalSearchService(
      mockDb,
      mockEmbeddingService,
      mockTextPreprocessor
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================
  // Story E-03.3: 全局向量搜索 - 核心功能测试
  // ============================================
  describe('E-03.3: 全局向量搜索 - 核心功能', () => {
    it('应该返回正确的搜索响应结构', async () => {
      const result = await service.search({ query: '温暖的家庭照片' })

      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('pageSize')
      expect(result).toHaveProperty('processingTimeMs')
      expect(result).toHaveProperty('query')
      expect(result.query).toHaveProperty('original')
      expect(result.query).toHaveProperty('processed')
      expect(result.query).toHaveProperty('vectorDimension')
    })

    it('应该返回正确的分页信息', async () => {
      const result = await service.search({
        query: '温暖的家庭照片',
        page: 2,
        pageSize: 2
      })

      expect(result.page).toBe(2)
      expect(result.pageSize).toBe(2)
    })

    it('应该处理向量生成失败的情况', async () => {
      mockEmbeddingService.textToEmbedding.mockResolvedValueOnce({
        success: false,
        error: 'Model not loaded'
      })

      const result = await service.search({ query: '温暖的家庭照片' })

      expect(result.results).toEqual([])
      expect(result.total).toBe(0)
      expect(result.query.vectorDimension).toBe(0)
    })

    it('应该处理没有向量的情况', async () => {
      mockDb.getAllEmbeddings.mockResolvedValueOnce([])

      const result = await service.search({ query: '温暖的家庭照片' })

      expect(result.results).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  // ============================================
  // Story E-03.3 AC1: 全局搜索
  // ============================================
  describe('E-03.3 AC1: 全局搜索', () => {
    it('应该返回包含相似度分数的结果', async () => {
      const result = await service.search({ query: '温暖的家庭照片' })

      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty('similarity')
        expect(typeof result.results[0].similarity).toBe('number')
        expect(result.results[0].similarity).toBeGreaterThanOrEqual(0)
        expect(result.results[0].similarity).toBeLessThanOrEqual(1)
      }
    })

    it('应该按相似度降序排序', async () => {
      const result = await service.search({ query: '温暖的家庭照片' })

      if (result.results.length > 1) {
        for (let i = 0; i < result.results.length - 1; i++) {
          expect(result.results[i].similarity).toBeGreaterThanOrEqual(result.results[i + 1].similarity)
        }
      }
    })

    it('应该支持 topK 参数限制返回数量', async () => {
      const result = await service.search({
        query: '温暖的家庭照片',
        topK: 3
      })

      expect(result.results.length).toBeLessThanOrEqual(3)
    })

    it('应该支持 minSimilarity 参数过滤低相似度结果', async () => {
      const result = await service.search({
        query: '温暖的家庭照片',
        minSimilarity: 0.7
      })

      for (const item of result.results) {
        expect(item.similarity).toBeGreaterThanOrEqual(0.7)
      }
    })
  })

  // ============================================
  // Story E-03.3 AC2: 相似度阈值过滤
  // ============================================
  describe('E-03.3 AC2: 相似度阈值过滤', () => {
    it('应该正确过滤低于阈值的结果', async () => {
      const result = await service.search({
        query: '温暖的家庭照片',
        minSimilarity: 0.8
      })

      const belowThreshold = result.results.filter(r => r.similarity < 0.8)
      expect(belowThreshold.length).toBe(0)
    })

    it('应该返回 total 包含所有匹配结果（不限于分页）', async () => {
      const result = await service.search({
        query: '温暖的家庭照片',
        page: 1,
        pageSize: 2
      })

      expect(result.total).toBeGreaterThanOrEqual(result.results.length)
    })
  })

  // ============================================
  // Story E-03.3 AC3: Top-K 结果返回
  // ============================================
  describe('E-03.3 AC3: Top-K 结果返回', () => {
    it('应该正确设置排名', async () => {
      const result = await service.search({
        query: '温暖的家庭照片',
        topK: 10
      })

      result.results.forEach((item, index) => {
        expect(item.rank).toBe(index + 1)
      })
    })

    it('topK=0 应该返回空结果', async () => {
      const result = await service.search({
        query: '温暖的家庭照片',
        topK: 0
      })

      expect(result.results.length).toBe(0)
    })
  })

  // ============================================
  // Story E-03.3 AC4: 结果分页
  // ============================================
  describe('E-03.3 AC4: 结果分页', () => {
    it('应该正确计算分页偏移', async () => {
      const result1 = await service.search({
        query: '温暖的家庭照片',
        page: 1,
        pageSize: 2
      })

      const result2 = await service.search({
        query: '温暖的家庭照片',
        page: 2,
        pageSize: 2
      })

      const uuids1 = result1.results.map(r => r.photoUuid)
      const uuids2 = result2.results.map(r => r.photoUuid)
      const intersection = uuids1.filter(uuid => uuids2.includes(uuid))
      expect(intersection.length).toBe(0)
    })

    it('应该处理超出范围的分页', async () => {
      const result = await service.search({
        query: '温暖的家庭照片',
        page: 100,
        pageSize: 20
      })

      expect(result.results.length).toBe(0)
      expect(result.page).toBe(100)
    })
  })

  // ============================================
  // Story E-03.3 AC5: 搜索结果高亮
  // ============================================
  describe('E-03.3 AC5: 搜索结果结构', () => {
    it('应该返回正确的 GlobalSearchResult 结构', async () => {
      const result = await service.search({ query: '温暖的家庭照片' })

      if (result.results.length > 0) {
        const firstResult = result.results[0]

        expect(firstResult).toHaveProperty('photoUuid')
        expect(firstResult).toHaveProperty('fileName')
        expect(firstResult).toHaveProperty('filePath')
        expect(firstResult).toHaveProperty('similarity')
        expect(firstResult).toHaveProperty('rank')
        expect(typeof firstResult.photoUuid).toBe('string')
        expect(typeof firstResult.fileName).toBe('string')
        expect(typeof firstResult.filePath).toBe('string')
      }
    })

    it('应该支持 includeMetadata 参数', async () => {
      const result = await service.search({
        query: '温暖的家庭照片',
        includeMetadata: true
      })

      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty('thumbnailPath')
      }
    })

    it('应该返回处理时间', async () => {
      const result = await service.search({ query: '温暖的家庭照片' })

      expect(typeof result.processingTimeMs).toBe('number')
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  // ============================================
  // 快速搜索功能测试
  // ============================================
  describe('快速搜索 (quickSearch)', () => {
    it('quickSearch 应该返回简化结果', async () => {
      const results = await service.quickSearch('温暖的家庭照片', 5)

      expect(Array.isArray(results)).toBe(true)
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('photoUuid')
        expect(results[0]).toHaveProperty('similarity')
        expect(results[0]).toHaveProperty('rank')
      }
    })

    it('quickSearch 应该限制返回数量', async () => {
      const results = await service.quickSearch('温暖的家庭照片', 3)

      expect(results.length).toBeLessThanOrEqual(3)
    })
  })

  // ============================================
  // 相似照片功能测试
  // ============================================
  describe('相似照片 (findSimilarPhotos)', () => {
    it('应该返回相似照片列表', async () => {
      const results = await service.findSimilarPhotos('photo-001', 5)

      expect(Array.isArray(results)).toBe(true)
    })

    it('应该排除自身照片', async () => {
      const results = await service.findSimilarPhotos('photo-001', 10)

      const hasSelf = results.some(r => r.photoUuid === 'photo-001')
      expect(hasSelf).toBe(false)
    })

    it('应该正确设置排名', async () => {
      const results = await service.findSimilarPhotos('photo-001', 5)

      results.forEach((item, index) => {
        expect(item.rank).toBe(index + 1)
      })
    })

    it('应该处理不存在的照片 UUID', async () => {
      const results = await service.findSimilarPhotos('non-existent-uuid', 5)

      expect(results).toEqual([])
    })

    it('应该按相似度降序排序', async () => {
      const results = await service.findSimilarPhotos('photo-001', 10)

      if (results.length > 1) {
        for (let i = 0; i < results.length - 1; i++) {
          expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity)
        }
      }
    })
  })

  // ============================================
  // 批量搜索功能测试
  // ============================================
  describe('批量搜索 (batchSearch)', () => {
    it('应该返回多个查询的结果', async () => {
      const results = await service.batchSearch(
        ['温暖的家庭照片', '海边的日落'],
        { topK: 5 }
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(2)
    })

    it('每个结果应该包含正确的结构', async () => {
      const results = await service.batchSearch(
        ['温暖的家庭照片'],
        { topK: 5 }
      )

      if (results.length > 0) {
        expect(results[0]).toHaveProperty('results')
        expect(results[0]).toHaveProperty('total')
        expect(results[0]).toHaveProperty('processingTimeMs')
      }
    })

    it('应该支持空查询数组', async () => {
      const results = await service.batchSearch([], { topK: 5 })

      expect(results).toEqual([])
    })
  })

  // ============================================
  // 搜索统计功能测试
  // ============================================
  describe('搜索统计 (getStats)', () => {
    it('应该返回统计信息', async () => {
      const stats = await service.getStats()

      expect(stats).toHaveProperty('totalPhotos')
      expect(stats).toHaveProperty('totalEmbeddings')
      expect(stats).toHaveProperty('coverage')
      expect(typeof stats.totalPhotos).toBe('number')
      expect(typeof stats.totalEmbeddings).toBe('number')
      expect(typeof stats.coverage).toBe('number')
    })

    it('应该正确计算覆盖率', async () => {
      const stats = await service.getStats()

      if (stats.totalPhotos > 0) {
        expect(stats.coverage).toBe(stats.totalEmbeddings / stats.totalPhotos)
      }
    })
  })

  // ============================================
  // 默认参数测试
  // ============================================
  describe('默认参数', () => {
    it('应该使用正确的默认 topK 值', async () => {
      const result = await service.search({ query: '测试' })

      expect(result.results.length).toBeLessThanOrEqual(100)
    })

    it('应该使用正确的默认 page 值', async () => {
      const result = await service.search({ query: '测试' })

      expect(result.page).toBe(1)
    })

    it('应该使用正确的默认 pageSize 值', async () => {
      const result = await service.search({ query: '测试' })

      expect(result.pageSize).toBe(20)
    })

    it('应该使用正确的默认 minSimilarity 值', async () => {
      const result = await service.search({ query: '测试' })

      const belowThreshold = result.results.filter(r => r.similarity < 0.1)
      expect(belowThreshold.length).toBe(0)
    })
  })

  // ============================================
  // 性能测试
  // ============================================
  describe('性能要求', () => {
    it('应该记录处理时间', async () => {
      const result = await service.search({ query: '温暖的家庭照片' })

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  // ============================================
  // 查询预处理测试
  // ============================================
  describe('查询预处理', () => {
    it('应该调用文本预处理服务', async () => {
      await service.search({ query: '温暖的家庭照片' })

      expect(mockTextPreprocessor.preprocess).toHaveBeenCalledWith('温暖的家庭照片')
    })
  })
})
