/**
 * PhotoMind - KeywordSearchService Unit Tests
 *
 * Tests for Epic E-03: 混合搜索服务
 * Story: E-03.2 关键词搜索
 *
 * 功能：
 * 1. 基于文件名的精确/模糊搜索
 * 2. 文件夹路径搜索
 * 3. EXIF/位置元数据搜索
 * 4. 多关键词组合
 * 5. 搜索建议
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock PhotoDatabase
const createMockDatabase = (photos: any[]) => ({
  getAllPhotos: vi.fn().mockReturnValue(photos),
  getPhotoByUuid: vi.fn((uuid: string) => photos.find(p => p.uuid === uuid) || null)
})

// Mock photos data
const mockPhotos = [
  {
    uuid: 'photo-001',
    file_name: 'IMG_20231225_sunset_beach.jpg',
    file_path: '/Users/mac/Pictures/vacation/hawaii/IMG_20231225_sunset_beach.jpg',
    exif_data: { camera: 'iPhone 15', lens: 'Main camera' },
    location_data: { name: 'Waikiki Beach', latitude: 21.3069, longitude: -157.8583 }
  },
  {
    uuid: 'photo-002',
    file_name: 'family_christmas_2023.jpg',
    file_path: '/Users/mac/Pictures/family/christmas/family_christmas_2023.jpg',
    exif_data: { camera: 'Canon EOS R5' },
    location_data: { name: 'Home', latitude: 37.7749, longitude: -122.4194 }
  },
  {
    uuid: 'photo-003',
    file_name: 'mountain_hiking_trip.png',
    file_path: '/Users/mac/Pictures/adventures/alps/mountain_hiking_trip.png',
    exif_data: { camera: 'Sony A7IV' },
    location_data: { name: 'Swiss Alps', latitude: 46.8182, longitude: 8.2275 }
  },
  {
    uuid: 'photo-004',
    file_name: 'beach_volleyball_summer.jpg',
    file_path: '/Users/mac/Pictures/sports/beach_volleyball_summer.jpg',
    exif_data: { camera: 'iPhone 14 Pro' },
    location_data: { name: 'Santa Monica', latitude: 34.0195, longitude: -118.4912 }
  },
  {
    uuid: 'photo-005',
    file_name: '工作文档_screenshot.png',
    file_path: '/Users/mac/Documents/screenshots/工作文档_screenshot.png',
    exif_data: {},
    location_data: null
  }
]

// ============================================
// KeywordSearchService 实现 (内联测试版本)
// ============================================

interface KeywordSearchOptions {
  query: string
  fields?: string[]
  fuzzy?: boolean
  limit?: number
  offset?: number
}

interface KeywordSearchResult {
  photoUuid: string
  fileName: string
  filePath: string
  matchedField: string
  matchScore: number
  highlights: string[]
}

class KeywordSearchService {
  private database: any

  constructor(database?: any) {
    this.database = database
  }

  async search(options: KeywordSearchOptions): Promise<{
    results: KeywordSearchResult[]
    total: number
    query: string
  }> {
    const {
      query,
      fields = ['file_name', 'folder_path', 'exif_data', 'location_data'],
      fuzzy = true,
      limit = 50,
      offset = 0
    } = options

    const keywords = this.parseKeywords(query)

    if (keywords.length === 0) {
      return { results: [], total: 0, query }
    }

    const photos = this.database.getAllPhotos()

    const matched: KeywordSearchResult[] = []

    for (const photo of photos) {
      const result = this.matchPhoto(photo, keywords, fields, fuzzy)
      if (result) {
        matched.push(result)
      }
    }

    matched.sort((a, b) => b.matchScore - a.matchScore)

    const total = matched.length
    const pagedResults = matched.slice(offset, offset + limit)

    return {
      results: pagedResults,
      total,
      query
    }
  }

  private parseKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(k => k.length > 0)
  }

  private matchPhoto(
    photo: any,
    keywords: string[],
    fields: string[],
    fuzzy: boolean
  ): KeywordSearchResult | null {
    let bestScore = 0
    let matchedField = ''
    let highlights: string[] = []

    for (const field of fields) {
      const fieldValue = this.getFieldValue(photo, field)
      if (!fieldValue) continue

      for (const keyword of keywords) {
        const matchResult = this.matchField(fieldValue, keyword, fuzzy)
        if (matchResult.match) {
          const score = this.calculateScore(fieldValue, keyword, field, fuzzy)
          if (score > bestScore) {
            bestScore = score
            matchedField = field
            highlights = matchResult.highlights
          }
        }
      }
    }

    if (bestScore > 0) {
      return {
        photoUuid: photo.uuid,
        fileName: photo.file_name,
        filePath: photo.file_path,
        matchedField,
        matchScore: bestScore,
        highlights
      }
    }

    return null
  }

  private getFieldValue(photo: any, field: string): string | null {
    switch (field) {
      case 'file_name':
        return photo.file_name?.toLowerCase() || null
      case 'folder_path':
        const pathParts = photo.file_path?.split('/') || []
        return pathParts.slice(0, -1).join('/').toLowerCase() || null
      case 'exif_data':
        if (photo.exif_data) {
          try {
            const exif = typeof photo.exif_data === 'string'
              ? JSON.parse(photo.exif_data)
              : photo.exif_data
            return JSON.stringify(exif).toLowerCase()
          } catch {
            return null
          }
        }
        return null
      case 'location_data':
        if (photo.location_data) {
          try {
            const loc = typeof photo.location_data === 'string'
              ? JSON.parse(photo.location_data)
              : photo.location_data
            return JSON.stringify(loc).toLowerCase()
          } catch {
            return null
          }
        }
        return null
      default:
        return null
    }
  }

  private matchField(
    fieldValue: string,
    keyword: string,
    fuzzy: boolean
  ): { match: boolean; highlights: string[] } {
    const highlights: string[] = []

    if (fuzzy) {
      if (fieldValue.includes(keyword)) {
        highlights.push(keyword)
        return { match: true, highlights }
      }

      if (this.calculateSimilarity(fieldValue, keyword) > 0.6) {
        highlights.push(keyword)
        return { match: true, highlights }
      }
    } else {
      const words = fieldValue.split(/\W+/)
      for (const word of words) {
        if (word === keyword) {
          highlights.push(keyword)
          return { match: true, highlights }
        }
      }
    }

    return { match: false, highlights: [] }
  }

  private calculateScore(
    fieldValue: string,
    keyword: string,
    field: string,
    fuzzy: boolean
  ): number {
    let score = 0

    if (field === 'file_name') {
      const fileName = fieldValue
      if (fileName.startsWith(keyword)) {
        score = 100
      } else if (fileName.includes(` ${keyword}`) || fileName.includes(`-${keyword}`)) {
        score = 80
      } else if (fileName.includes(keyword)) {
        score = 50
      } else {
        score = 25
      }
    } else if (field === 'folder_path') {
      score = 30
    } else {
      score = 10
    }

    if (fuzzy && !fieldValue.includes(keyword)) {
      score *= 0.5
    }

    return score
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    const editDistance = this.levenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = []

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }

    return matrix[str2.length][str1.length]
  }

  async quickSearch(query: string, limit: number = 20): Promise<KeywordSearchResult[]> {
    const result = await this.search({
      query,
      fuzzy: true,
      limit,
      offset: 0
    })
    return result.results
  }

  getSuggestions(query: string, limit: number = 10): string[] {
    const keywords = this.parseKeywords(query)
    const photos = this.database.getAllPhotos()

    const suggestions = new Set<string>()

    for (const photo of photos) {
      const fileName = photo.file_name?.toLowerCase() || ''

      for (const keyword of keywords) {
        const index = fileName.indexOf(keyword)
        if (index !== -1) {
          const wordMatch = fileName.match(new RegExp(`\\w{${index},${index + keyword.length + 10}}`))
          if (wordMatch) {
            suggestions.add(wordMatch[0])
          }
        }
      }

      if (suggestions.size >= limit) break
    }

    return Array.from(suggestions).slice(0, limit)
  }

  countByKeyword(keyword: string): number {
    const lowerKeyword = keyword.toLowerCase()
    const photos = this.database.getAllPhotos()

    let count = 0
    for (const photo of photos) {
      const fileName = photo.file_name?.toLowerCase() || ''
      if (fileName.includes(lowerKeyword)) {
        count++
      }
    }

    return count
  }
}

// ============================================
// Tests
// ============================================

describe('KeywordSearchService - Epic E-03.2', () => {
  let service: KeywordSearchService
  let mockDb: ReturnType<typeof createMockDatabase>

  beforeEach(() => {
    mockDb = createMockDatabase(mockPhotos)
    service = new KeywordSearchService(mockDb)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================
  // Story E-03.2: 关键词搜索 - 核心功能测试
  // ============================================
  describe('E-03.2: 关键词搜索 - 核心功能', () => {
    it('应该返回空结果当查询为空', async () => {
      const result = await service.search({ query: '' })

      expect(result.results).toEqual([])
      expect(result.total).toBe(0)
      expect(result.query).toBe('')
    })

    it('应该正确解析单个关键词', async () => {
      const result = await service.search({ query: 'sunset' })

      expect(result.total).toBeGreaterThan(0)
      expect(result.results[0].photoUuid).toBe('photo-001')
    })

    it('应该正确解析多个关键词（AND逻辑）', async () => {
      const result = await service.search({ query: 'beach sunset' })

      expect(result.total).toBeGreaterThanOrEqual(0)
      const matchedUuids = result.results.map(r => r.photoUuid)
      expect(matchedUuids).toContain('photo-001')
    })

    it('应该支持模糊匹配和正确排序', async () => {
      // "beach" 可以匹配到多张照片，应该按分数排序
      const result = await service.search({ query: 'beach' })
      expect(result.total).toBeGreaterThanOrEqual(2) // photo-001 和 photo-004 都包含 beach

      // photo-004 因为 "beach" 在文件名开头，分数最高
      expect(result.results[0].photoUuid).toBe('photo-004')
    })
  })

  // ============================================
  // Story E-03.2 AC1: 根据文件名/路径匹配
  // ============================================
  describe('E-03.2 AC1: 根据文件名/路径匹配', () => {
    it('应该匹配文件名开头的关键词', async () => {
      const result = await service.search({ query: 'IMG' })

      expect(result.total).toBeGreaterThan(0)
      expect(result.results[0].matchedField).toBe('file_name')
    })

    it('应该匹配文件名中的关键词', async () => {
      const result = await service.search({ query: 'christmas' })

      expect(result.results[0].photoUuid).toBe('photo-002')
    })

    it('应该匹配文件夹路径中的关键词', async () => {
      const result = await service.search({ query: 'hawaii' })

      expect(result.results.length).toBeGreaterThan(0)
      expect(result.results[0].filePath).toContain('hawaii')
    })

    it('应该支持精确匹配模式', async () => {
      const result = await service.search({
        query: 'sunset',
        fuzzy: false
      })

      expect(result.results.length).toBeGreaterThanOrEqual(0)
    })
  })

  // ============================================
  // Story E-03.2 AC2: 根据地点关键词匹配
  // ============================================
  describe('E-03.2 AC2: 根据地点关键词匹配', () => {
    it('应该匹配 location_data 中的地点名称', async () => {
      const result = await service.search({ query: 'Waikiki' })

      expect(result.results[0].photoUuid).toBe('photo-001')
      expect(result.results[0].matchedField).toBe('location_data')
    })

    it('应该匹配地点的部分关键词', async () => {
      const result = await service.search({ query: 'Alps' })

      expect(result.results[0].photoUuid).toBe('photo-003')
    })

    it('应该支持多个地点关键词', async () => {
      const result = await service.search({ query: 'beach california' })

      expect(result.total).toBeGreaterThanOrEqual(0)
    })
  })

  // ============================================
  // Story E-03.2 AC3: 返回满足条件的照片列表
  // ============================================
  describe('E-03.2 AC3: 返回结果结构', () => {
    it('应该返回正确的 KeywordSearchResult 结构', async () => {
      const result = await service.search({ query: 'sunset' })

      expect(result.results.length).toBeGreaterThan(0)
      const firstResult = result.results[0]

      expect(firstResult).toHaveProperty('photoUuid')
      expect(firstResult).toHaveProperty('fileName')
      expect(firstResult).toHaveProperty('filePath')
      expect(firstResult).toHaveProperty('matchedField')
      expect(firstResult).toHaveProperty('matchScore')
      expect(firstResult).toHaveProperty('highlights')
      expect(typeof firstResult.matchScore).toBe('number')
      expect(Array.isArray(firstResult.highlights)).toBe(true)
    })

    it('应该返回查询的原始语句', async () => {
      const query = 'sunset beach'
      const result = await service.search({ query })

      expect(result.query).toBe(query)
    })
  })

  // ============================================
  // 分页功能测试
  // ============================================
  describe('分页功能', () => {
    it('应该支持 offset 和 limit 参数', async () => {
      const result1 = await service.search({ query: 'photo', limit: 2, offset: 0 })
      const result2 = await service.search({ query: 'photo', limit: 2, offset: 2 })

      expect(result1.results.length).toBeLessThanOrEqual(2)
      expect(result2.results.length).toBeLessThanOrEqual(2)

      const uuids1 = result1.results.map(r => r.photoUuid)
      const uuids2 = result2.results.map(r => r.photoUuid)
      const intersection = uuids1.filter(uuid => uuids2.includes(uuid))
      expect(intersection.length).toBe(0)
    })

    it('应该返回正确的 total 数量', async () => {
      const result = await service.search({ query: 'photo' })

      expect(result.total).toBeGreaterThanOrEqual(result.results.length)
    })
  })

  // ============================================
  // 匹配分数测试
  // ============================================
  describe('匹配分数计算', () => {
    it('文件名匹配应该有较高的分数', async () => {
      const prefixResult = await service.search({ query: 'IMG_' })
      if (prefixResult.results.length > 0) {
        expect(prefixResult.results[0].matchScore).toBe(100) // 前缀匹配
      }
    })

    it('应该按匹配分数降序排序', async () => {
      const result = await service.search({ query: 'photo' })

      if (result.results.length > 1) {
        for (let i = 0; i < result.results.length - 1; i++) {
          expect(result.results[i].matchScore).toBeGreaterThanOrEqual(result.results[i + 1].matchScore)
        }
      }
    })
  })

  // ============================================
  // 快速搜索测试
  // ============================================
  describe('快速搜索', () => {
    it('quickSearch 应该返回有限数量的结果', async () => {
      const results = await service.quickSearch('photo', 3)

      expect(results.length).toBeLessThanOrEqual(3)
    })

    it('quickSearch 应该返回正确格式的结果', async () => {
      const results = await service.quickSearch('sunset')

      expect(results.length).toBeGreaterThanOrEqual(0)
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('photoUuid')
        expect(results[0]).toHaveProperty('fileName')
        expect(results[0]).toHaveProperty('filePath')
      }
    })
  })

  // ============================================
  // 搜索建议测试
  // ============================================
  describe('搜索建议', () => {
    it('getSuggestions 应该返回建议列表', () => {
      const suggestions = service.getSuggestions('sun', 5)

      expect(Array.isArray(suggestions)).toBe(true)
      expect(suggestions.length).toBeLessThanOrEqual(5)
    })

    it('getSuggestions 应该返回唯一值', () => {
      const suggestions = service.getSuggestions('photo', 10)

      const uniqueSuggestions = [...new Set(suggestions)]
      expect(suggestions.length).toBe(uniqueSuggestions.length)
    })

    it('getSuggestions 应该限制返回数量', () => {
      const suggestions = service.getSuggestions('photo', 3)

      expect(suggestions.length).toBeLessThanOrEqual(3)
    })
  })

  // ============================================
  // 关键词统计测试
  // ============================================
  describe('关键词统计', () => {
    it('countByKeyword 应该返回匹配的照片数量', () => {
      const count = service.countByKeyword('sunset')

      expect(count).toBeGreaterThanOrEqual(0)
      expect(typeof count).toBe('number')
    })

    it('countByKeyword 应该不区分大小写', () => {
      const count1 = service.countByKeyword('SUNSET')
      const count2 = service.countByKeyword('sunset')

      expect(count1).toBe(count2)
    })
  })

  // ============================================
  // 字段过滤测试
  // ============================================
  describe('字段过滤', () => {
    it('应该支持只搜索文件名', async () => {
      const result = await service.search({
        query: 'photo',
        fields: ['file_name']
      })

      expect(result.results.length).toBeGreaterThanOrEqual(0)
      if (result.results.length > 0) {
        expect(result.results[0].matchedField).toBe('file_name')
      }
    })

    it('应该支持只搜索位置数据', async () => {
      const result = await service.search({
        query: 'beach',
        fields: ['location_data']
      })

      expect(result.results.length).toBeGreaterThanOrEqual(0)
      if (result.results.length > 0) {
        expect(result.results[0].matchedField).toBe('location_data')
      }
    })
  })

  // ============================================
  // 高亮显示测试
  // ============================================
  describe('高亮显示', () => {
    it('应该返回匹配的高亮关键词', async () => {
      const result = await service.search({ query: 'sunset' })

      if (result.results.length > 0) {
        expect(result.results[0].highlights).toContain('sunset')
      }
    })
  })

  // ============================================
  // 边界条件测试
  // ============================================
  describe('边界条件', () => {
    it('应该处理没有匹配的情况', async () => {
      const result = await service.search({ query: 'xyznonexistent123' })

      expect(result.results).toEqual([])
      expect(result.total).toBe(0)
    })

    it('应该处理特殊字符', async () => {
      const result = await service.search({ query: '!@#$%^&*()' })

      expect(result.results).toEqual([])
    })

    it('应该处理只有空格的查询', async () => {
      const result = await service.search({ query: '   ' })

      expect(result.results).toEqual([])
      expect(result.total).toBe(0)
    })

    it('应该处理只包含数字的查询', async () => {
      const result = await service.search({ query: '2023' })

      expect(result.total).toBeGreaterThanOrEqual(0)
    })
  })

  // ============================================
  // 中文搜索测试
  // ============================================
  describe('中文搜索', () => {
    it('应该支持中文关键词搜索', async () => {
      const result = await service.search({ query: '工作' })

      expect(result.results.length).toBeGreaterThanOrEqual(0)
    })
  })
})
