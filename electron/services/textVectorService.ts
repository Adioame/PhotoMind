/**
 * PhotoMind - 文本向量服务
 *
 * 功能：
 * 1. 文本转向量
 * 2. 向量缓存管理
 * 3. 批量处理
 */
import { getEmbeddingService } from './embeddingService.js'
import type { EmbeddingVector, EmbeddingResult } from '../types/embedding.js'

interface TextVectorCache {
  query: string
  vector: EmbeddingVector
  timestamp: number
}

export interface SearchQueryResult {
  query: string
  vector: EmbeddingVector | null
  processingTimeMs: number
  fromCache: boolean
}

export class TextVectorService {
  private cache: Map<string, TextVectorCache> = new Map()
  private cacheMaxAge = 5 * 60 * 1000 // 5分钟
  private maxCacheSize = 1000

  /**
   * 将文本转换为向量
   */
  async textToVector(text: string): Promise<SearchQueryResult> {
    const startTime = Date.now()

    // 检查缓存
    const cached = this.getCachedVector(text)
    if (cached) {
      console.log('[TextVector] 使用缓存的向量')
      return {
        query: text,
        vector: cached,
        processingTimeMs: 0,
        fromCache: true
      }
    }

    // 生成向量
    const embeddingService = getEmbeddingService()
    const result = await embeddingService.textToEmbedding(text)

    // 缓存结果
    if (result.success && result.vector) {
      this.cacheVector(text, result.vector)
    }

    return {
      query: text,
      vector: result.vector || null,
      processingTimeMs: result.processingTimeMs,
      fromCache: false
    }
  }

  /**
   * 批量处理多个搜索文本
   */
  async textsToVectors(
    texts: string[]
  ): Promise<Map<string, SearchQueryResult>> {
    const results = new Map<string, SearchQueryResult>()

    for (const text of texts) {
      const result = await this.textToVector(text)
      results.set(text, result)
    }

    return results
  }

  /**
   * 处理搜索查询（预处理 + 转向量）
   */
  async processQuery(
    text: string,
    preprocess: (text: string) => { processed: string; keywords: string[]; language: string }
  ): Promise<SearchQueryResult & { processed: string; keywords: string[]; language: string }> {
    const startTime = Date.now()

    // 预处理
    const processed = preprocess(text)

    // 检查缓存（使用原始文本）
    const cached = this.getCachedVector(text)
    if (cached) {
      return {
        query: text,
        vector: cached,
        processingTimeMs: 0,
        fromCache: true,
        processed: processed.processed,
        keywords: processed.keywords,
        language: processed.language
      }
    }

    // 生成向量
    const embeddingService = getEmbeddingService()
    const result = await embeddingService.textToEmbedding(processed.processed)

    // 缓存结果
    if (result.success && result.vector) {
      this.cacheVector(text, result.vector)
    }

    return {
      query: text,
      vector: result.vector || null,
      processingTimeMs: result.processingTimeMs,
      fromCache: false,
      processed: processed.processed,
      keywords: processed.keywords,
      language: processed.language
    }
  }

  /**
   * 获取缓存的向量
   */
  private getCachedVector(query: string): EmbeddingVector | null {
    const cached = this.cache.get(query)
    if (!cached) return null

    // 检查是否过期
    if (Date.now() - cached.timestamp > this.cacheMaxAge) {
      this.cache.delete(query)
      return null
    }

    return cached.vector
  }

  /**
   * 缓存向量
   */
  private cacheVector(query: string, vector: EmbeddingVector): void {
    // 清理过期缓存
    if (this.cache.size >= this.maxCacheSize) {
      this.cleanExpiredCache()
    }

    this.cache.set(query, {
      query,
      vector,
      timestamp: Date.now()
    })
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheMaxAge) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear()
    console.log('[TextVector] 缓存已清空')
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize
    }
  }

  /**
   * 设置缓存过期时间
   */
  setCacheMaxAge(minutes: number): void {
    this.cacheMaxAge = minutes * 60 * 1000
  }

  /**
   * 设置最大缓存大小
   */
  setMaxCacheSize(size: number): void {
    this.maxCacheSize = size
  }
}

export const textVectorService = new TextVectorService()
