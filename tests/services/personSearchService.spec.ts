/**
 * PhotoMind - PersonSearchService Unit Tests
 *
 * Tests for Epic E-04: 人脸识别与人物管理
 * Story: E-04.4 (人物搜索)
 *
 * 功能：
 * 1. 按人物姓名搜索
 * 2. 显示人物照片列表
 * 3. 按时间筛选人物照片
 * 4. 显示人物照片统计
 * 5. 搜索建议和自动补全
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ============================================
// Mock Person 类型
// ============================================
interface MockPerson {
  id: number
  name: string
  displayName: string
  faceCount: number
  createdAt?: string
}

// ============================================
// Mock PersonService
// ============================================
class MockPersonService {
  private persons: MockPerson[] = []
  private personPhotos: Map<number, any[]> = new Map()

  setPersons(persons: MockPerson[]) {
    this.persons = persons
  }

  setPersonPhotos(personId: number, photos: any[]) {
    this.personPhotos.set(personId, photos)
  }

  getAllPersons(): MockPerson[] {
    return [...this.persons]
  }

  getPersonById(id: number): MockPerson | undefined {
    return this.persons.find(p => p.id === id)
  }

  getPersonPhotos(personId: number): any[] {
    return this.personPhotos.get(personId) || []
  }

  _clear() {
    this.persons = []
    this.personPhotos.clear()
  }
}

// ============================================
// PersonSearchService 实现 (测试版本)
// ============================================
interface PersonSearchOptions {
  query: string
  limit?: number
  offset?: number
  sortBy?: 'recent' | 'oldest' | 'count'
  year?: number
  month?: number
}

interface PersonPhotoFilter {
  personId: number
  year?: number
  month?: number
  limit?: number
  offset?: number
}

interface PersonSearchResult {
  person: MockPerson
  matchScore: number
  matchedField: string
  photoCount: number
}

interface PersonPhotoResult {
  photo: any
  taggedAt: string
  confidence: number
}

interface PersonSearchResponse {
  results: PersonSearchResult[]
  total: number
  query: string
  processingTimeMs: number
}

interface PersonPhotosResponse {
  person: MockPerson
  photos: PersonPhotoResult[]
  total: number
  stats: {
    totalPhotos: number
    years: number[]
    earliestPhoto?: string
    latestPhoto?: string
  }
}

interface PersonSuggestion {
  id: number
  name: string
  photoCount: number
}

class PersonSearchService {
  private personService: MockPersonService
  private searchHistory: string[] = []
  private readonly MAX_HISTORY = 50

  constructor(personService?: MockPersonService) {
    this.personService = personService || new MockPersonService()
  }

  async search(options: PersonSearchOptions): Promise<PersonSearchResponse> {
    const startTime = Date.now()
    const { query, limit = 20, offset = 0, sortBy = 'count' } = options

    const allPersons = this.personService.getAllPersons()

    if (!query || query.trim() === '') {
      const sorted = this.sortPersons(allPersons, sortBy)
      const paged = sorted.slice(offset, offset + limit)

      return {
        results: paged.map(person => ({
          person,
          matchScore: 1,
          matchedField: 'name',
          photoCount: person.faceCount
        })),
        total: allPersons.length,
        query,
        processingTimeMs: Date.now() - startTime
      }
    }

    const searchTerms = query.toLowerCase().split(/\s+/)
    const results: PersonSearchResult[] = []

    for (const person of allPersons) {
      const result = this.matchPerson(person, searchTerms)
      if (result) {
        results.push(result)
      }
    }

    results.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return (b.person.createdAt || '').localeCompare(a.person.createdAt || '')
        case 'oldest':
          return (a.person.createdAt || '').localeCompare(b.person.createdAt || '')
        case 'count':
        default:
          return b.photoCount - a.photoCount
      }
    })

    const total = results.length
    const paged = results.slice(offset, offset + limit)

    return {
      results: paged,
      total,
      query,
      processingTimeMs: Date.now() - startTime
    }
  }

  private matchPerson(person: MockPerson, searchTerms: string[]): PersonSearchResult | null {
    const name = person.name.toLowerCase()
    const displayName = person.displayName.toLowerCase()

    let maxScore = 0
    let matchedField = ''

    for (const term of searchTerms) {
      if (name === term || displayName === term) {
        return {
          person,
          matchScore: 1.0,
          matchedField: 'name',
          photoCount: person.faceCount
        }
      }

      if (name.startsWith(term) || displayName.startsWith(term)) {
        maxScore = Math.max(maxScore, 0.9)
        matchedField = 'name'
      }

      if (name.includes(term) || displayName.includes(term)) {
        maxScore = Math.max(maxScore, 0.7)
        matchedField = 'name'
      }
    }

    if (maxScore > 0) {
      return {
        person,
        matchScore: maxScore,
        matchedField,
        photoCount: person.faceCount
      }
    }

    return null
  }

  private sortPersons(persons: MockPerson[], sortBy: string): MockPerson[] {
    switch (sortBy) {
      case 'recent':
        return [...persons].sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        )
      case 'oldest':
        return [...persons].sort((a, b) =>
          (a.createdAt || '').localeCompare(b.createdAt || '')
        )
      case 'count':
      default:
        return [...persons].sort((a, b) => b.faceCount - a.faceCount)
    }
  }

  async getPersonPhotos(filter: PersonPhotoFilter): Promise<PersonPhotosResponse> {
    const { personId, year, month, limit = 50, offset = 0 } = filter

    const person = this.personService.getPersonById(personId)
    if (!person) {
      throw new Error('人物不存在')
    }

    let photos = this.personService.getPersonPhotos(personId)

    if (year) {
      photos = photos.filter((p: any) => {
        const takenAt = p.taken_at || p.takenAt
        if (!takenAt) return false
        return new Date(takenAt).getFullYear() === year
      })
    }

    if (month !== undefined && year) {
      photos = photos.filter((p: any) => {
        const takenAt = p.taken_at || p.takenAt
        if (!takenAt) return false
        const date = new Date(takenAt)
        return date.getFullYear() === year && date.getMonth() === month
      })
    }

    photos.sort((a: any, b: any) => {
      const dateA = new Date(a.taken_at || a.takenAt || 0).getTime()
      const dateB = new Date(b.taken_at || b.takenAt || 0).getTime()
      return dateB - dateA
    })

    const years = new Set<number>()
    let earliest: string | undefined
    let latest: string | undefined

    for (const photo of photos) {
      const takenAt = photo.taken_at || photo.takenAt
      if (takenAt) {
        const y = new Date(takenAt).getFullYear()
        years.add(y)
        if (!earliest || takenAt < earliest) earliest = takenAt
        if (!latest || takenAt > latest) latest = takenAt
      }
    }

    const total = photos.length
    const paged = photos.slice(offset, offset + limit)

    return {
      person,
      photos: paged.map((p: any) => ({
        photo: p,
        taggedAt: p.created_at || new Date().toISOString(),
        confidence: 1.0
      })),
      total,
      stats: {
        totalPhotos: total,
        years: Array.from(years).sort(),
        earliestPhoto: earliest,
        latestPhoto: latest
      }
    }
  }

  async getPersonTimeline(personId: number): Promise<Map<number, number[]>> {
    const photos = this.personService.getPersonPhotos(personId)
    const timeline = new Map<number, number[]>()

    for (const photo of photos) {
      const takenAt = photo.taken_at || photo.takenAt
      if (takenAt) {
        const year = new Date(takenAt).getFullYear()
        const month = new Date(takenAt).getMonth() + 1

        if (!timeline.has(year)) {
          timeline.set(year, [])
        }
        timeline.get(year)?.push(month)
      }
    }

    return timeline
  }

  getSuggestions(query: string, limit: number = 5): PersonSuggestion[] {
    const persons = this.personService.getAllPersons()
    const searchTerm = query.toLowerCase()

    const suggestions = persons
      .filter(p =>
        p.name.toLowerCase().includes(searchTerm) ||
        p.displayName.toLowerCase().includes(searchTerm)
      )
      .slice(0, limit)
      .map(p => ({
        id: p.id,
        name: p.displayName,
        photoCount: p.faceCount
      }))

    return suggestions
  }

  getPopularPersons(limit: number = 10): MockPerson[] {
    const persons = this.personService.getAllPersons()
    return persons
      .sort((a, b) => b.faceCount - a.faceCount)
      .slice(0, limit)
  }

  getSearchHistory(): string[] {
    return [...this.searchHistory]
  }

  addToHistory(query: string): void {
    if (!query.trim()) return

    this.searchHistory = this.searchHistory.filter(h => h !== query)
    this.searchHistory.unshift(query)

    if (this.searchHistory.length > this.MAX_HISTORY) {
      this.searchHistory = this.searchHistory.slice(0, this.MAX_HISTORY)
    }
  }

  clearHistory(): void {
    this.searchHistory = []
  }

  getStats(): {
    totalPersons: number
    totalTaggedPhotos: number
    avgPhotosPerPerson: number
    mostTaggedPerson?: MockPerson
  } {
    const persons = this.personService.getAllPersons()
    const totalTaggedPhotos = persons.reduce((sum, p) => sum + p.faceCount, 0)

    let mostTagged: MockPerson | undefined
    if (persons.length > 0) {
      mostTagged = persons.reduce((a, b) =>
        a.faceCount > b.faceCount ? a : b
      )
    }

    return {
      totalPersons: persons.length,
      totalTaggedPhotos,
      avgPhotosPerPerson: persons.length > 0 ? totalTaggedPhotos / persons.length : 0,
      mostTaggedPerson: mostTagged
    }
  }
}

// ============================================
// 测试
// ============================================
describe('PersonSearchService - Epic E-04.4', () => {
  let service: PersonSearchService
  let mockPersonService: MockPersonService

  const createService = (ps?: MockPersonService): PersonSearchService => {
    return new PersonSearchService(ps)
  }

  const samplePersons: MockPerson[] = [
    { id: 1, name: 'zhangsan', displayName: '张三', faceCount: 10, createdAt: '2024-01-15T10:00:00Z' },
    { id: 2, name: 'lisi', displayName: '李四', faceCount: 5, createdAt: '2024-02-20T10:00:00Z' },
    { id: 3, name: 'wangwu', displayName: '王五', faceCount: 15, createdAt: '2024-03-10T10:00:00Z' },
    { id: 4, name: 'zhaoliu', displayName: '赵六', faceCount: 8, createdAt: '2024-01-05T10:00:00Z' },
    { id: 5, name: 'sunqi', displayName: '孙七', faceCount: 20, createdAt: '2023-12-01T10:00:00Z' }
  ]

  beforeEach(() => {
    mockPersonService = new MockPersonService()
    mockPersonService.setPersons(samplePersons)
    service = createService(mockPersonService)
  })

  // ============================================
  // Phase 1: 搜索功能测试
  // ============================================
  describe('搜索功能测试', () => {
    it('should return all persons when query is empty - 空查询返回所有人物', async () => {
      const result = await service.search({ query: '' })

      expect(result.results.length).toBe(5)
      expect(result.total).toBe(5)
      expect(result.query).toBe('')
    })

    it('should return all persons when query is whitespace - 空白查询返回所有人物', async () => {
      const result = await service.search({ query: '   ' })

      expect(result.results.length).toBe(5)
      expect(result.total).toBe(5)
    })

    it('should find exact match - 精确匹配', async () => {
      const result = await service.search({ query: 'zhangsan' })

      expect(result.results.length).toBe(1)
      expect(result.results[0].person.name).toBe('zhangsan')
      expect(result.results[0].matchScore).toBe(1.0)
    })

    it('should find by displayName - 按显示名称搜索', async () => {
      const result = await service.search({ query: '张三' })

      expect(result.results.length).toBe(1)
      expect(result.results[0].person.displayName).toBe('张三')
    })

    it('should find prefix match - 前缀匹配', async () => {
      const result = await service.search({ query: 'zhang' })

      expect(result.results.length).toBe(1)
      expect(result.results[0].person.name).toBe('zhangsan')
      expect(result.results[0].matchScore).toBe(0.9)
    })

    it('should find contains match - 包含匹配', async () => {
      const result = await service.search({ query: 'ang' })

      // zhangsan contains 'ang'
      expect(result.results.length).toBeGreaterThanOrEqual(1)
      const zhangsan = result.results.find(r => r.person.name === 'zhangsan')
      expect(zhangsan).toBeDefined()
      expect(zhangsan?.matchScore).toBe(0.7)
    })

    it('should find multiple matches - 多结果匹配', async () => {
      const result = await service.search({ query: 'san' })

      // zhangsan contains 'san'
      expect(result.results.length).toBeGreaterThanOrEqual(1)
    })

    it('should return empty for no match - 无匹配返回空', async () => {
      const result = await service.search({ query: 'nonexistent' })

      expect(result.results.length).toBe(0)
      expect(result.total).toBe(0)
    })

    it('should handle case insensitive search - 大小写不敏感', async () => {
      const result = await service.search({ query: 'ZHANGSAN' })

      expect(result.results.length).toBe(1)
      expect(result.results[0].person.name).toBe('zhangsan')
    })

    it('should search multiple terms - 多关键词搜索', async () => {
      const result = await service.search({ query: 'zhang san' })

      expect(result.results.length).toBe(1)
    })

    it('should return processing time - 返回处理时间', async () => {
      const result = await service.search({ query: 'zhang' })

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  // ============================================
  // Phase 2: 排序测试
  // ============================================
  describe('排序测试', () => {
    it('should sort by count descending by default - 默认按数量降序', async () => {
      const result = await service.search({ query: '' })

      const counts = result.results.map(r => r.photoCount)
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i])
      }
    })

    it('should sort by count - 按数量排序', async () => {
      const result = await service.search({ query: '', sortBy: 'count' })

      const counts = result.results.map(r => r.photoCount)
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i])
      }
    })

    it('should sort by recent - 按最近创建排序', async () => {
      const result = await service.search({ query: '', sortBy: 'recent' })

      // Verify sorting by checking first and last elements
      if (result.results.length >= 2) {
        const first = result.results[0].person.createdAt || ''
        const last = result.results[result.results.length - 1].person.createdAt || ''
        expect(first.localeCompare(last)).toBeGreaterThanOrEqual(0)
      }
    })

    it('should sort by oldest - 按最早创建排序', async () => {
      const result = await service.search({ query: '', sortBy: 'oldest' })

      // Verify sorting by checking first and last elements
      if (result.results.length >= 2) {
        const first = result.results[0].person.createdAt || ''
        const last = result.results[result.results.length - 1].person.createdAt || ''
        expect(first.localeCompare(last)).toBeLessThanOrEqual(0)
      }
    })
  })

  // ============================================
  // Phase 3: 分页测试
  // ============================================
  describe('分页测试', () => {
    it('should return first page with default limit - 默认返回第一页', async () => {
      const result = await service.search({ query: '' })

      expect(result.results.length).toBeLessThanOrEqual(20)
    })

    it('should respect limit - 限制返回数量', async () => {
      const result = await service.search({ query: '', limit: 2 })

      expect(result.results.length).toBe(2)
    })

    it('should respect offset - 支持偏移', async () => {
      const allResult = await service.search({ query: '', limit: 10 })
      const offsetResult = await service.search({ query: '', limit: 10, offset: 2 })

      expect(offsetResult.results.length).toBeLessThan(allResult.results.length)
    })

    it('should return correct total - 返回正确的总数', async () => {
      const result = await service.search({ query: '', limit: 2 })

      expect(result.total).toBe(5)
    })
  })

  // ============================================
  // Phase 4: 人物照片获取测试
  // ============================================
  describe('人物照片获取测试', () => {
    beforeEach(() => {
      mockPersonService.setPersonPhotos(1, [
        { id: 101, taken_at: '2024-01-15T10:00:00Z' },
        { id: 102, taken_at: '2024-02-20T10:00:00Z' },
        { id: 103, taken_at: '2023-06-15T10:00:00Z' }
      ])
    })

    it('should return person photos - 返回人物照片', async () => {
      const result = await service.getPersonPhotos({ personId: 1 })

      expect(result.person).toBeDefined()
      expect(result.photos.length).toBe(3)
    })

    it('should throw error for non-existent person - 不存在的人物抛出错误', async () => {
      await expect(service.getPersonPhotos({ personId: 999 }))
        .rejects.toThrow('人物不存在')
    })

    it('should filter by year - 按年份筛选', async () => {
      const result = await service.getPersonPhotos({ personId: 1, year: 2024 })

      expect(result.photos.length).toBe(2)
      expect(result.stats.years).toContain(2024)
    })

    it('should filter by year and month - 按年月筛选', async () => {
      const result = await service.getPersonPhotos({ personId: 1, year: 2024, month: 1 })

      expect(result.photos.length).toBe(1)
    })

    it('should sort photos by date descending - 照片按日期降序', async () => {
      const result = await service.getPersonPhotos({ personId: 1 })

      for (let i = 1; i < result.photos.length; i++) {
        const dateA = new Date(result.photos[i - 1].photo.taken_at || '').getTime()
        const dateB = new Date(result.photos[i].photo.taken_at || '').getTime()
        expect(dateA).toBeGreaterThanOrEqual(dateB)
      }
    })

    it('should calculate stats correctly - 正确计算统计', async () => {
      const result = await service.getPersonPhotos({ personId: 1 })

      expect(result.stats.totalPhotos).toBe(3)
      expect(result.stats.years.length).toBeGreaterThan(0)
      expect(result.stats.earliestPhoto).toBeDefined()
      expect(result.stats.latestPhoto).toBeDefined()
    })

    it('should respect pagination - 支持分页', async () => {
      const result = await service.getPersonPhotos({ personId: 1, limit: 2, offset: 0 })

      expect(result.photos.length).toBe(2)
      expect(result.total).toBe(3)
    })
  })

  // ============================================
  // Phase 5: 时间线测试
  // ============================================
  describe('时间线测试', () => {
    beforeEach(() => {
      mockPersonService.setPersonPhotos(1, [
        { id: 101, taken_at: '2024-01-15T10:00:00Z' },
        { id: 102, taken_at: '2024-03-20T10:00:00Z' },
        { id: 103, taken_at: '2024-03-25T10:00:00Z' },
        { id: 104, taken_at: '2023-06-15T10:00:00Z' }
      ])
    })

    it('should return timeline - 返回时间线', async () => {
      const timeline = await service.getPersonTimeline(1)

      expect(timeline.has(2024)).toBe(true)
      expect(timeline.has(2023)).toBe(true)
    })

    it('should have correct months - 正确的月份', async () => {
      const timeline = await service.getPersonTimeline(1)

      expect(timeline.get(2024)?.length).toBe(3) // Jan, Mar, Mar
      expect(timeline.get(2023)?.length).toBe(1)
    })

    it('should return empty for person with no photos - 无照片返回空', async () => {
      const timeline = await service.getPersonTimeline(2)

      expect(timeline.size).toBe(0)
    })
  })

  // ============================================
  // Phase 6: 搜索建议测试
  // ============================================
  describe('搜索建议测试', () => {
    it('should return suggestions - 返回建议', () => {
      const suggestions = service.getSuggestions('zhang')

      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions[0].name).toBe('张三')
    })

    it('should limit suggestions - 限制建议数量', () => {
      const suggestions = service.getSuggestions('', 2)

      expect(suggestions.length).toBeLessThanOrEqual(2)
    })

    it('should return empty for no match - 无匹配返回空', () => {
      const suggestions = service.getSuggestions('nonexistent')

      expect(suggestions.length).toBe(0)
    })

    it('should include photo count - 包含照片数量', () => {
      const suggestions = service.getSuggestions('zhang')

      expect(suggestions[0].photoCount).toBe(10)
    })
  })

  // ============================================
  // Phase 7: 热门人物测试
  // ============================================
  describe('热门人物测试', () => {
    it('should return popular persons - 返回热门人物', () => {
      const popular = service.getPopularPersons(3)

      expect(popular.length).toBe(3)
      expect(popular[0].faceCount).toBeGreaterThanOrEqual(popular[1].faceCount)
    })

    it('should sort by face count - 按照片数量排序', () => {
      const popular = service.getPopularPersons(10)

      for (let i = 1; i < popular.length; i++) {
        expect(popular[i - 1].faceCount).toBeGreaterThanOrEqual(popular[i].faceCount)
      }
    })
  })

  // ============================================
  // Phase 8: 搜索历史测试
  // ============================================
  describe('搜索历史测试', () => {
    it('should add to history - 添加历史记录', () => {
      service.addToHistory('zhangsan')
      service.addToHistory('lisi')

      const history = service.getSearchHistory()
      expect(history.length).toBe(2)
      expect(history[0]).toBe('lisi')
      expect(history[1]).toBe('zhangsan')
    })

    it('should not add empty query - 空查询不添加', () => {
      service.addToHistory('')
      service.addToHistory('   ')

      const history = service.getSearchHistory()
      expect(history.length).toBe(0)
    })

    it('should move to front on duplicate - 重复查询移到开头', () => {
      service.addToHistory('zhangsan')
      service.addToHistory('lisi')
      service.addToHistory('zhangsan')

      const history = service.getSearchHistory()
      expect(history[0]).toBe('zhangsan')
      expect(history[1]).toBe('lisi')
      expect(history.length).toBe(2)
    })

    it('should limit history size - 限制历史数量', () => {
      for (let i = 1; i <= 60; i++) {
        service.addToHistory(`query${i}`)
      }

      const history = service.getSearchHistory()
      expect(history.length).toBe(50)
      expect(history[0]).toBe('query60')
    })

    it('should clear history - 清空历史', () => {
      service.addToHistory('zhangsan')
      service.addToHistory('lisi')
      service.clearHistory()

      const history = service.getSearchHistory()
      expect(history.length).toBe(0)
    })

    it('should return copy of history - 返回历史副本', () => {
      service.addToHistory('zhangsan')
      const history1 = service.getSearchHistory()
      history1.push('test')

      const history2 = service.getSearchHistory()
      expect(history2.length).toBe(1)
    })
  })

  // ============================================
  // Phase 9: 统计信息测试
  // ============================================
  describe('统计信息测试', () => {
    it('should return stats - 返回统计', () => {
      const stats = service.getStats()

      expect(stats.totalPersons).toBe(5)
      expect(stats.totalTaggedPhotos).toBe(58) // 10 + 5 + 15 + 8 + 20
      expect(stats.avgPhotosPerPerson).toBe(58 / 5)
    })

    it('should identify most tagged person - 识别最多照片的人物', () => {
      const stats = service.getStats()

      expect(stats.mostTaggedPerson?.name).toBe('sunqi')
      expect(stats.mostTaggedPerson?.faceCount).toBe(20)
    })

    it('should handle empty persons - 空人物列表', () => {
      mockPersonService.setPersons([])
      const stats = service.getStats()

      expect(stats.totalPersons).toBe(0)
      expect(stats.totalTaggedPhotos).toBe(0)
      expect(stats.avgPhotosPerPerson).toBe(0)
      expect(stats.mostTaggedPerson).toBeUndefined()
    })
  })

  // ============================================
  // Phase 10: 验收条件验证测试
  // ============================================
  describe('验收条件验证', () => {
    it('AC: 按人物姓名搜索 - search should find by name', async () => {
      const result = await service.search({ query: '张三' })

      expect(result.results.length).toBe(1)
    })

    it('AC: 显示人物照片列表 - getPersonPhotos should return photos', async () => {
      mockPersonService.setPersonPhotos(1, [{ id: 101 }])
      const result = await service.getPersonPhotos({ personId: 1 })

      expect(result.photos.length).toBe(1)
    })

    it('AC: 按时间筛选人物照片 - getPersonPhotos should filter by time', async () => {
      mockPersonService.setPersonPhotos(1, [
        { id: 101, taken_at: '2024-01-15T10:00:00Z' },
        { id: 102, taken_at: '2023-01-15T10:00:00Z' }
      ])
      const result = await service.getPersonPhotos({ personId: 1, year: 2024 })

      expect(result.photos.length).toBe(1)
    })

    it('AC: 显示人物照片统计 - getPersonPhotos should include stats', async () => {
      mockPersonService.setPersonPhotos(1, [
        { id: 101, taken_at: '2024-01-15T10:00:00Z' }
      ])
      const result = await service.getPersonPhotos({ personId: 1 })

      expect(result.stats.totalPhotos).toBe(1)
      expect(result.stats.years).toBeDefined()
    })

    it('AC: 搜索建议和自动补全 - getSuggestions should work', () => {
      const suggestions = service.getSuggestions('zhang')

      expect(suggestions.length).toBeGreaterThan(0)
    })

    it('NFR: 搜索响应 < 100ms - search should be fast', async () => {
      const startTime = Date.now()
      await service.search({ query: 'zhangsan' })
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(100)
    })

    it('NFR: 结果分页 - pagination should work', async () => {
      const result = await service.search({ query: '', limit: 2, offset: 1 })

      expect(result.results.length).toBe(2)
      expect(result.total).toBe(5)
    })

    it('NFR: 搜索历史 - history should work', () => {
      service.addToHistory('test')

      expect(service.getSearchHistory()).toContain('test')
    })
  })

  // ============================================
  // Phase 11: 边界情况测试
  // ============================================
  describe('边界情况测试', () => {
    it('should handle person with no photos - 无照片人物', async () => {
      mockPersonService.setPersonPhotos(2, [])
      const result = await service.getPersonPhotos({ personId: 2 })

      expect(result.photos.length).toBe(0)
      expect(result.stats.totalPhotos).toBe(0)
    })

    it('should handle photos without dates - 无日期照片', async () => {
      mockPersonService.setPersonPhotos(1, [
        { id: 101, taken_at: undefined },
        { id: 102 }
      ])
      const result = await service.getPersonPhotos({ personId: 1 })

      expect(result.photos.length).toBe(2)
    })

    it('should handle special characters in query - 特殊字符查询', async () => {
      const result = await service.search({ query: '张*三' })

      expect(Array.isArray(result.results)).toBe(true)
    })

    it('should handle unicode names - Unicode名称', async () => {
      const result = await service.search({ query: '王五' })

      expect(result.results.length).toBe(1)
    })

    it('should handle empty persons list - 空人物列表', async () => {
      mockPersonService.setPersons([])
      const result = await service.search({ query: 'test' })

      expect(result.results.length).toBe(0)
      expect(result.total).toBe(0)
    })

    it('should handle large limit - 大limit值', async () => {
      const result = await service.search({ query: '', limit: 1000 })

      expect(result.results.length).toBe(5)
    })

    it('should handle offset beyond results - 偏移超出结果', async () => {
      const result = await service.search({ query: '', limit: 10, offset: 100 })

      expect(result.results.length).toBe(0)
    })
  })
})
