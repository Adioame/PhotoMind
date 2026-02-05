/**
 * PhotoMind - 语义搜索服务
 *
 * 功能：
 * 1. 预处理搜索文本
 * 2. 文本转向量
 * 3. 相似度搜索
 * 4. 结果分页和格式化
 */
import { getEmbeddingService } from './embeddingService.js'
import { PhotoDatabase } from '../database/db.js'
import { similarityService } from './similarityService.js'
import { textPreprocessor } from './textPreprocessor.js'

// 类型定义
type EmbeddingVector = number[]

interface PhotoDetail {
  uuid: string
  fileName: string
  filePath: string
  fileSize: number
  width?: number
  height?: number
  takenAt?: string
  exif?: Record<string, any>
  location?: Record<string, any>
  thumbnailPath?: string
}

interface SearchResult {
  photoUuid: string
  similarity: number
  rank: number
  photo?: PhotoDetail
}

interface SemanticSearchOptions {
  query: string
  topK?: number
  minSimilarity?: number
  page?: number
  pageSize?: number
}

interface SemanticSearchResult {
  results: SearchResult[]
  total: number
  page: number
  pageSize: number
  processingTimeMs: number
  query: {
    original: string
    processed: string
    language: string
  }
}

interface PhotoDetail {
  uuid: string
  fileName: string
  filePath: string
  fileSize: number
  width?: number
  height?: number
  takenAt?: string
  exif?: Record<string, any>
  location?: Record<string, any>
  thumbnailPath?: string
}

export class SemanticSearchService {
  private database: PhotoDatabase

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 执行语义搜索
   */
  async search(options: SemanticSearchOptions): Promise<SemanticSearchResult> {
    const startTime = Date.now()
    const { query, topK = 50, minSimilarity = 0.1, page = 1, pageSize = 20 } = options

    // 1. 预处理文本
    const processed = textPreprocessor.preprocess(query)

    // 2. 文本转向量
    const embeddingService = getEmbeddingService()
    const textResult = await embeddingService.textToEmbedding(processed.processed)

    if (!textResult.success || !textResult.vector) {
      console.log('[SemanticSearch] 文本转向量失败')
      return {
        results: [],
        total: 0,
        page,
        pageSize,
        processingTimeMs: Date.now() - startTime,
        query: {
          original: query,
          processed: processed.processed,
          language: processed.language
        }
      }
    }

    console.log(`[SemanticSearch] 向量生成成功，维度: ${textResult.vector.length}`)

    // 3. 获取所有照片向量
    const allEmbeddings = await this.database.getAllEmbeddings('image')
    console.log(`[SemanticSearch] 获取到 ${allEmbeddings.length} 个向量`)

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
          language: processed.language
        }
      }
    }

    // 4. 计算相似度
    const similarities = similarityService.batchSimilarity(textResult.vector, allEmbeddings)
    console.log(`[SemanticSearch] 相似度计算完成`)

    // 5. 排序并过滤
    const sorted = similarityService.topK(similarities, topK, minSimilarity)
    console.log(`[SemanticSearch] 排序完成，前 ${sorted.length} 个结果`)

    // 6. 获取照片详情
    const results: SearchResult[] = []

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i]
      const photo = this.database.getPhotoByUuid(item.id)

      if (photo) {
        results.push({
          photoUuid: item.id,
          similarity: item.similarity,
          rank: i + 1,
          photo: this.formatPhoto(photo)
        })
      }
    }

    // 7. 分页
    const startIndex = (page - 1) * pageSize
    const pagedResults = results.slice(startIndex, startIndex + pageSize)

    const processingTime = Date.now() - startTime
    console.log(`[SemanticSearch] 搜索完成，耗时 ${processingTime}ms`)

    return {
      results: pagedResults,
      total: results.length,
      page,
      pageSize,
      processingTimeMs: processingTime,
      query: {
        original: query,
        processed: processed.processed,
        language: processed.language
      }
    }
  }

  /**
   * 批量搜索（多个查询）
   */
  async multiQuerySearch(
    queries: string[],
    options: { topK?: number; minSimilarity?: number; weights?: number[] } = {}
  ): Promise<SemanticSearchResult> {
    const { topK = 50, minSimilarity = 0.1, weights } = options

    // 1. 预处理所有查询
    const processedQueries = queries.map(q => ({
      original: q,
      processed: textPreprocessor.preprocess(q).processed
    }))

    // 2. 转向量
    const embeddingService = getEmbeddingService()
    const vectors: EmbeddingVector[] = []

    for (const q of processedQueries) {
      const result = await embeddingService.textToEmbedding(q.processed)
      if (result.success && result.vector) {
        vectors.push(result.vector)
      }
    }

    if (vectors.length === 0) {
      return {
        results: [],
        total: 0,
        page: 1,
        pageSize: 20,
        processingTimeMs: 0,
        query: {
          original: queries.join(' '),
          processed: processedQueries.map(q => q.processed).join(' '),
          language: 'mixed'
        }
      }
    }

    // 3. 获取所有嵌入
    const allEmbeddings = await this.database.getAllEmbeddings('image')

    // 4. 多查询融合
    const defaultWeights = weights || vectors.map(() => 1 / vectors.length)
    const scoreMap = new Map<string, { totalScore: number; count: number }>()

    for (let i = 0; i < vectors.length; i++) {
      const similarities = similarityService.batchSimilarity(vectors[i], allEmbeddings)
      for (const sim of similarities) {
        const existing = scoreMap.get(sim.id) || { totalScore: 0, count: 0 }
        existing.totalScore += sim.similarity * defaultWeights[i]
        existing.count += 1
        scoreMap.set(sim.id, existing)
      }
    }

    // 5. 计算平均分数
    const results: SearchResult[] = []
    for (const [id, data] of scoreMap.entries()) {
      const avgScore = data.totalScore / data.count
      if (avgScore >= minSimilarity) {
        const photo = this.database.getPhotoByUuid(id)
        if (photo) {
          results.push({
            photoUuid: id,
            similarity: avgScore,
            rank: 0,
            photo: this.formatPhoto(photo)
          })
        }
      }
    }

    // 6. 排序
    results.sort((a, b) => b.similarity - a.similarity)
    results.forEach((r, i) => r.rank = i + 1)

    return {
      results: results.slice(0, topK),
      total: results.length,
      page: 1,
      pageSize: topK,
      processingTimeMs: 0,
      query: {
        original: queries.join(' '),
        processed: processedQueries.map(q => q.processed).join(' '),
        language: 'mixed'
      }
    }
  }

  /**
   * 格式化照片数据
   */
  private formatPhoto(photo: any): PhotoDetail {
    return {
      uuid: photo.uuid,
      fileName: photo.file_name,
      filePath: photo.file_path,
      fileSize: photo.file_size,
      width: photo.width,
      height: photo.height,
      takenAt: photo.taken_at,
      exif: photo.exif_data && typeof photo.exif_data === 'string'
        ? JSON.parse(photo.exif_data)
        : (photo.exif_data || {}),
      location: photo.location_data && typeof photo.location_data === 'string'
        ? JSON.parse(photo.location_data)
        : (photo.location_data || {}),
      thumbnailPath: photo.thumbnail_path
    }
  }

  /**
   * 快速搜索（不返回照片详情）
   */
  async quickSearch(
    query: string,
    topK: number = 10
  ): Promise<Array<{ photoUuid: string; similarity: number }>> {
    const processed = textPreprocessor.preprocess(query)

    const embeddingService = getEmbeddingService()
    const textResult = await embeddingService.textToEmbedding(processed.processed)

    if (!textResult.success || !textResult.vector) {
      return []
    }

    const allEmbeddings = await this.database.getAllEmbeddings('image')
    const similarities = similarityService.batchSimilarity(textResult.vector, allEmbeddings)

    return similarityService.topK(similarities, topK, 0)
      .map((item, index) => ({
        photoUuid: item.id,
        similarity: item.similarity
      }))
  }
}

export const semanticSearchService = new SemanticSearchService()
