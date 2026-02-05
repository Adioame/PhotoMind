/**
 * PhotoMind - 全局向量搜索服务
 *
 * 功能：
 * 1. 全局语义向量搜索
 * 2. 相似照片查找
 * 3. 批量搜索
 * 4. 搜索结果分页
 */
import { PhotoDatabase } from '../database/db.js'
import { getEmbeddingService } from './embeddingService.js'
import { textPreprocessor } from './textPreprocessor.js'
import { similarityService } from './similarityService.js'

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

export class GlobalSearchService {
  private database: PhotoDatabase

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 执行全局向量搜索
   */
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

    // 1. 预处理查询
    const processed = textPreprocessor.preprocess(query)
    console.log(`[GlobalSearch] 预处理查询: "${processed.processed}"`)

    // 2. 生成查询向量
    const embeddingService = getEmbeddingService()
    const embeddingResult = await embeddingService.textToEmbedding(processed.processed)

    if (!embeddingResult.success || !embeddingResult.vector) {
      console.error('[GlobalSearch] 向量生成失败')
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

    console.log(`[GlobalSearch] 向量生成成功，维度: ${embeddingResult.vector.length}`)

    // 3. 获取所有照片向量
    const allEmbeddings = await this.database.getAllEmbeddings('image')
    console.log(`[GlobalSearch] 获取 ${allEmbeddings.length} 个向量`)

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

    // 4. 计算相似度
    const similarities = similarityService.batchSimilarity(
      embeddingResult.vector,
      allEmbeddings
    )
    console.log(`[GlobalSearch] 相似度计算完成`)

    // 5. 过滤和排序
    const filtered = similarities
      .filter(sim => sim.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)

    console.log(`[GlobalSearch] 过滤后 ${filtered.length} 个结果`)

    // 6. 构建结果
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

    // 7. 分页
    const startIndex = (page - 1) * pageSize
    const pagedResults = results.slice(startIndex, startIndex + pageSize)

    const processingTime = Date.now() - startTime
    console.log(`[GlobalSearch] 搜索完成，耗时 ${processingTime}ms`)

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

  /**
   * 快速搜索（简化版）
   */
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

  /**
   * 获取相似照片
   */
  async findSimilarPhotos(
    photoUuid: string,
    topK: number = 10
  ): Promise<GlobalSearchResult[]> {
    const startTime = Date.now()

    // 1. 获取目标照片向量
    const embeddings = await this.database.getAllEmbeddings('image')
    const targetEmbedding = embeddings.find(e => e.photoUuid === photoUuid)

    if (!targetEmbedding) {
      console.error('[GlobalSearch] 未找到目标照片的向量')
      return []
    }

    console.log(`[GlobalSearch] 查找 ${photoUuid} 的相似照片`)

    // 2. 计算相似度（排除自身）
    const otherEmbeddings = embeddings.filter(e => e.photoUuid !== photoUuid)
    const similarities = similarityService.batchSimilarity(
      targetEmbedding.vector,
      otherEmbeddings
    )

    // 3. 排序取 Top-K
    const sorted = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)

    // 4. 构建结果
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

    console.log(`[GlobalSearch] 相似照片搜索耗时 ${Date.now() - startTime}ms`)
    return results
  }

  /**
   * 批量搜索（多查询融合）
   */
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

  /**
   * 搜索统计
   */
  async getStats(): Promise<{
    totalPhotos: number
    totalEmbeddings: number
    coverage: number
  }> {
    const photos = this.database.getAllPhotos()
    const embeddings = await this.database.getAllEmbeddings('image')

    return {
      totalPhotos: photos.length,
      totalEmbeddings: embeddings.length,
      coverage: photos.length > 0 ? embeddings.length / photos.length : 0
    }
  }
}

export const globalSearchService = new GlobalSearchService()
