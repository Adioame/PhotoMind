/**
 * PhotoMind - 关键词搜索服务
 *
 * 功能：
 * 1. 基于文件名的精确/模糊搜索
 * 2. 文件夹路径搜索
 * 3. EXIF/位置元数据搜索
 * 4. 多关键词组合
 * 5. 搜索建议
 */
import { PhotoDatabase } from '../database/db.js'

export interface KeywordSearchOptions {
  query: string
  fields?: string[]
  fuzzy?: boolean
  limit?: number
  offset?: number
}

export interface KeywordSearchResult {
  photoUuid: string
  fileName: string
  filePath: string
  matchedField: string
  matchScore: number
  highlights: string[]
}

export class KeywordSearchService {
  private database: PhotoDatabase

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 执行关键词搜索
   */
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

    // 1. 解析关键词
    const keywords = this.parseKeywords(query)

    if (keywords.length === 0) {
      return { results: [], total: 0, query }
    }

    // 2. 获取所有照片
    const photos = this.database.getAllPhotos()
    console.log(`[KeywordSearch] 搜索 ${photos.length} 张照片，关键词: ${keywords.join(', ')}`)

    // 3. 过滤和排序
    const matched: KeywordSearchResult[] = []

    for (const photo of photos) {
      const result = this.matchPhoto(photo, keywords, fields, fuzzy)
      if (result) {
        matched.push(result)
      }
    }

    // 4. 按匹配分数排序
    matched.sort((a, b) => b.matchScore - a.matchScore)

    // 5. 分页
    const total = matched.length
    const pagedResults = matched.slice(offset, offset + limit)

    console.log(`[KeywordSearch] 找到 ${total} 个匹配结果`)

    return {
      results: pagedResults,
      total,
      query
    }
  }

  /**
   * 解析搜索关键词
   */
  private parseKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(k => k.length > 0)
  }

  /**
   * 匹配照片
   */
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

  /**
   * 获取字段值
   */
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

  /**
   * 匹配字段值
   */
  private matchField(
    fieldValue: string,
    keyword: string,
    fuzzy: boolean
  ): { match: boolean; highlights: string[] } {
    const highlights: string[] = []

    if (fuzzy) {
      // 模糊匹配 - 包含匹配
      if (fieldValue.includes(keyword)) {
        highlights.push(keyword)
        return { match: true, highlights }
      }

      // 相似度匹配
      if (this.calculateSimilarity(fieldValue, keyword) > 0.6) {
        highlights.push(keyword)
        return { match: true, highlights }
      }
    } else {
      // 精确匹配
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

  /**
   * 计算匹配分数
   */
  private calculateScore(
    fieldValue: string,
    keyword: string,
    field: string,
    fuzzy: boolean
  ): number {
    let score = 0

    // 文件名匹配权重最高
    if (field === 'file_name') {
      const fileName = fieldValue
      if (fileName.startsWith(keyword)) {
        score = 100 // 前缀匹配
      } else if (fileName.includes(` ${keyword}`) || fileName.includes(`-${keyword}`)) {
        score = 80 // 单词边界匹配
      } else if (fileName.includes(keyword)) {
        score = 50 // 部分匹配
      } else {
        score = 25 // 模糊匹配
      }
    } else if (field === 'folder_path') {
      score = 30
    } else {
      score = 10 // EXIF/位置 权重较低
    }

    // 模糊匹配降低分数
    if (fuzzy && !fieldValue.includes(keyword)) {
      score *= 0.5
    }

    return score
  }

  /**
   * 计算字符串相似度
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    const editDistance = this.levenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  /**
   * Levenshtein 距离
   */
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

  /**
   * 快速搜索（简化版）
   */
  async quickSearch(query: string, limit: number = 20): Promise<KeywordSearchResult[]> {
    const result = await this.search({
      query,
      fuzzy: true,
      limit,
      offset: 0
    })
    return result.results
  }

  /**
   * 获取搜索建议
   */
  getSuggestions(query: string, limit: number = 10): string[] {
    const keywords = this.parseKeywords(query)
    const photos = this.database.getAllPhotos()

    const suggestions = new Set<string>()

    for (const photo of photos) {
      // 从文件名提取
      const fileName = photo.file_name?.toLowerCase() || ''

      for (const keyword of keywords) {
        // 查找包含关键词的部分
        const index = fileName.indexOf(keyword)
        if (index !== -1) {
          // 提取完整单词
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

  /**
   * 统计包含关键词的照片数量
   */
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

export const keywordSearchService = new KeywordSearchService()
