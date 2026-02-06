/**
 * PhotoMind - 人物搜索服务
 *
 * 功能：
 * 1. 按人物姓名搜索
 * 2. 获取人物照片列表
 * 3. 时间线筛选
 * 4. 搜索建议和历史
 */
import { PhotoDatabase } from '../database/db.js'
import { personService, Person } from './personService.js'

export interface PersonSearchOptions {
  query: string
  limit?: number
  offset?: number
  sortBy?: 'recent' | 'oldest' | 'count'
  year?: number
  month?: number
}

export interface PersonPhotoFilter {
  personId: number
  year?: number
  month?: number
  limit?: number
  offset?: number
}

export interface PersonSearchResult {
  person: Person
  matchScore: number
  matchedField: string
  photoCount: number
}

export interface PersonPhotoResult {
  photo: any
  taggedAt: string
  confidence: number
}

export interface PersonSearchResponse {
  results: PersonSearchResult[]
  total: number
  query: string
  processingTimeMs: number
}

export interface PersonPhotosResponse {
  person: Person
  photos: PersonPhotoResult[]
  total: number
  stats: {
    totalPhotos: number
    years: number[]
    earliestPhoto?: string
    latestPhoto?: string
  }
}

export interface PersonSuggestion {
  id: number
  name: string
  photoCount: number
}

export class PersonSearchService {
  private database: PhotoDatabase
  private searchHistory: string[] = []
  private readonly MAX_HISTORY = 50

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 搜索人物
   */
  async search(options: PersonSearchOptions): Promise<PersonSearchResponse> {
    const startTime = Date.now()
    const { query, limit = 20, offset = 0, sortBy = 'count' } = options

    console.log(`[PersonSearch] 搜索人物: "${query}"`)

    const allPersons = personService.getAllPersons()

    if (!query || query.trim() === '') {
      const sorted = this.sortPersons(allPersons, sortBy)
      const paged = sorted.slice(offset, offset + limit)

      return {
        results: paged.map(person => ({
          person,
          matchScore: 1,
          matchedField: 'name',
          photoCount: person.face_count
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
          return (b.person.created_at || '').localeCompare(a.person.created_at || '')
        case 'oldest':
          return (a.person.created_at || '').localeCompare(b.person.created_at || '')
        case 'count':
        default:
          return b.photoCount - a.photoCount
      }
    })

    const total = results.length
    const paged = results.slice(offset, offset + limit)

    console.log(`[PersonSearch] 找到 ${total} 个人物`)

    return {
      results: paged,
      total,
      query,
      processingTimeMs: Date.now() - startTime
    }
  }

  /**
   * 匹配人物
   */
  private matchPerson(person: Person, searchTerms: string[]): PersonSearchResult | null {
    const name = person.name.toLowerCase()
    const displayName = person.display_name.toLowerCase()

    let maxScore = 0
    let matchedField = ''

    for (const term of searchTerms) {
      if (name === term || displayName === term) {
        return {
          person,
          matchScore: 1.0,
          matchedField: 'name',
          photoCount: person.face_count
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
        photoCount: person.face_count
      }
    }

    return null
  }

  /**
   * 排序人物
   */
  private sortPersons(persons: Person[], sortBy: string): Person[] {
    switch (sortBy) {
      case 'recent':
        return [...persons].sort((a, b) =>
          (b.created_at || '').localeCompare(a.created_at || '')
        )
      case 'oldest':
        return [...persons].sort((a, b) =>
          (a.created_at || '').localeCompare(b.created_at || '')
        )
      case 'count':
      default:
        return [...persons].sort((a, b) => b.face_count - a.face_count)
    }
  }

  /**
   * 获取某人物的照片
   */
  async getPersonPhotos(filter: PersonPhotoFilter): Promise<PersonPhotosResponse> {
    const { personId, year, month, limit = 50, offset = 0 } = filter

    console.log(`[PersonSearch] 获取人物 ${personId} 的照片`)

    const person = personService.getPersonById(personId)
    if (!person) {
      throw new Error('人物不存在')
    }

    let photos = personService.getPersonPhotos(personId)

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

  /**
   * 获取人物时间线
   */
  async getPersonTimeline(personId: number): Promise<Map<number, number[]>> {
    const photos = personService.getPersonPhotos(personId)
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

  /**
   * 获取搜索建议
   */
  getSuggestions(query: string, limit: number = 5): PersonSuggestion[] {
    const persons = personService.getAllPersons()
    const searchTerm = query.toLowerCase()

    return persons
      .filter(p =>
        p.name.toLowerCase().includes(searchTerm) ||
        p.display_name.toLowerCase().includes(searchTerm)
      )
      .slice(0, limit)
      .map(p => ({
        id: p.id,
        name: p.display_name,
        photoCount: p.face_count
      }))
  }

  /**
   * 获取热门人物
   */
  getPopularPersons(limit: number = 10): Person[] {
    const persons = personService.getAllPersons()
    return persons
      .sort((a, b) => b.face_count - a.face_count)
      .slice(0, limit)
  }

  /**
   * 获取搜索历史
   */
  getSearchHistory(): string[] {
    return [...this.searchHistory]
  }

  /**
   * 添加搜索历史
   */
  addToHistory(query: string): void {
    if (!query.trim()) return

    this.searchHistory = this.searchHistory.filter(h => h !== query)
    this.searchHistory.unshift(query)

    if (this.searchHistory.length > this.MAX_HISTORY) {
      this.searchHistory = this.searchHistory.slice(0, this.MAX_HISTORY)
    }
  }

  /**
   * 清空搜索历史
   */
  clearHistory(): void {
    this.searchHistory = []
  }

  /**
   * 获取人物统计
   */
  getStats(): {
    totalPersons: number
    totalTaggedPhotos: number
    avgPhotosPerPerson: number
    mostTaggedPerson?: Person
  } {
    const persons = personService.getAllPersons()
    const totalTaggedPhotos = persons.reduce((sum, p) => sum + p.face_count, 0)

    let mostTagged: Person | undefined
    if (persons.length > 0) {
      mostTagged = persons.reduce((a, b) =>
        a.face_count > b.face_count ? a : b
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

export const personSearchService = new PersonSearchService()
