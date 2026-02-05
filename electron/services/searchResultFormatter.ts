/**
 * PhotoMind - 搜索结果格式化服务
 *
 * 功能：
 * 1. 统一格式化搜索结果
 * 2. 添加相似度标签
 * 3. 转换为前端友好格式
 */

export interface FormattedSearchResult {
  id: string
  fileName: string
  filePath: string
  thumbnailUrl?: string
  similarity: number
  similarityPercent: number
  similarityLabel: 'high' | 'medium' | 'low'
  takenAt?: string
  takenYear?: number
  takenMonth?: number
  location?: {
    name?: string
    latitude?: number
    longitude?: number
  }
  exif?: {
    camera?: string
    lens?: string
    aperture?: number
    iso?: number
  }
  rank: number
}

export interface SearchResultSummary {
  totalResults: number
  displayedResults: number
  page: number
  totalPages: number
  processingTimeMs: number
  query: string
  language: string
}

export class SearchResultFormatter {
  /**
   * 格式化单个搜索结果
   */
  format(result: any): FormattedSearchResult {
    const photo = result.photo || {}

    // 提取年月
    let takenYear: number | undefined
    let takenMonth: number | undefined
    if (photo.takenAt) {
      const date = new Date(photo.takenAt)
      takenYear = date.getFullYear()
      takenMonth = date.getMonth() + 1
    }

    return {
      id: result.photoUuid,
      fileName: photo.fileName || '',
      filePath: photo.filePath || '',
      thumbnailUrl: photo.thumbnailPath,
      similarity: result.similarity,
      similarityPercent: Math.round(result.similarity * 100),
      similarityLabel: this.getSimilarityLabel(result.similarity),
      takenAt: photo.takenAt,
      takenYear,
      takenMonth,
      location: photo.location,
      exif: {
        camera: photo.exif?.camera,
        lens: photo.exif?.lens,
        aperture: photo.exif?.aperture,
        iso: photo.exif?.iso
      },
      rank: result.rank || 0
    }
  }

  /**
   * 批量格式化搜索结果
   */
  formatBatch(results: any[]): FormattedSearchResult[] {
    return results.map((r, index) => ({
      ...this.format(r),
      rank: r.rank || index + 1
    }))
  }

  /**
   * 生成搜索摘要
   */
  formatSummary(result: any): SearchResultSummary {
    return {
      totalResults: result.total || result.results?.length || 0,
      displayedResults: result.results?.length || 0,
      page: result.page || 1,
      totalPages: Math.ceil((result.total || 0) / (result.pageSize || 20)),
      processingTimeMs: result.processingTimeMs || 0,
      query: result.query?.original || '',
      language: result.query?.language || 'unknown'
    }
  }

  /**
   * 获取相似度标签
   */
  private getSimilarityLabel(similarity: number): 'high' | 'medium' | 'low' {
    if (similarity >= 0.7) return 'high'
    if (similarity >= 0.4) return 'medium'
    return 'low'
  }

  /**
   * 相似度转换为百分比
   */
  similarityToPercent(similarity: number): number {
    return Math.round(similarity * 100)
  }

  /**
   * 按年份分组结果
   */
  groupByYear(results: FormattedSearchResult[]): Map<number, FormattedSearchResult[]> {
    const groups = new Map<number, FormattedSearchResult[]>()

    for (const result of results) {
      const year = result.takenYear || 0
      if (year > 0) {
        const existing = groups.get(year) || []
        existing.push(result)
        groups.set(year, existing)
      }
    }

    return groups
  }

  /**
   * 按地点分组结果
   */
  groupByLocation(results: FormattedSearchResult[]): Map<string, FormattedSearchResult[]> {
    const groups = new Map<string, FormattedSearchResult[]>()

    for (const result of results) {
      const locationName = result.location?.name || '未知地点'
      const existing = groups.get(locationName) || []
      existing.push(result)
      groups.set(locationName, existing)
    }

    return groups
  }

  /**
   * 生成高亮文本（模拟）
   */
  generateHighlightedQuery(processedQuery: string): string {
    // 返回处理后的查询文本
    return processedQuery
  }

  /**
   * 估算搜索质量
   */
  estimateSearchQuality(results: FormattedSearchResult[]): 'excellent' | 'good' | 'fair' | 'poor' {
    if (results.length === 0) return 'poor'

    // 计算高质量结果比例（相似度 > 0.5）
    const highQualityCount = results.filter(r => r.similarity >= 0.5).length
    const ratio = highQualityCount / results.length

    if (ratio >= 0.8) return 'excellent'
    if (ratio >= 0.5) return 'good'
    if (ratio >= 0.3) return 'fair'
    return 'poor'
  }
}

export const searchResultFormatter = new SearchResultFormatter()
