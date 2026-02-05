/**
 * PhotoMind - 相似度计算服务
 *
 * 功能：
 * 1. 余弦相似度计算
 * 2. 批量相似度计算
 * 3. Top-k 排序
 */
import type { EmbeddingVector } from '../types/embedding.js'

export interface SimilarityResult {
  id: string
  similarity: number
}

export interface SearchResult {
  photoUuid: string
  similarity: number
  rank: number
}

export class SimilarityService {
  /**
   * 计算余弦相似度
   */
  cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
    if (a.length !== b.length) {
      console.warn('[Similarity] 向量维度不匹配')
      return 0
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    if (denominator === 0) return 0

    return dotProduct / denominator
  }

  /**
   * 计算欧氏距离
   */
  euclideanDistance(a: EmbeddingVector, b: EmbeddingVector): number {
    if (a.length !== b.length) {
      return Infinity
    }

    let sum = 0
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2)
    }

    return Math.sqrt(sum)
  }

  /**
   * 计算点积
   */
  dotProduct(a: EmbeddingVector, b: EmbeddingVector): number {
    if (a.length !== b.length) {
      return 0
    }

    let sum = 0
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i]
    }

    return sum
  }

  /**
   * 计算向量范数
   */
  norm(vector: EmbeddingVector): number {
    return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  }

  /**
   * 批量计算相似度
   */
  batchSimilarity(
    queryVector: EmbeddingVector,
    targetVectors: Array<{ photoUuid: string; vector: EmbeddingVector }>
  ): SimilarityResult[] {
    return targetVectors.map(item => ({
      id: item.photoUuid,
      similarity: this.cosineSimilarity(queryVector, item.vector)
    }))
  }

  /**
   * 排序并返回 top-k 结果
   */
  topK(
    similarities: SimilarityResult[],
    k: number,
    minSimilarity: number = 0
  ): SimilarityResult[] {
    return similarities
      .filter(s => s.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)
  }

  /**
   * 语义搜索（向量 + 数据库）
   */
  async semanticSearch(
    queryVector: EmbeddingVector,
    getAllEmbeddings: () => Promise<Array<{ photoUuid: string; vector: EmbeddingVector }>>,
    options: { topK?: number; minSimilarity?: number } = {}
  ): Promise<SearchResult[]> {
    const { topK = 50, minSimilarity = 0.1 } = options

    // 获取所有嵌入
    const embeddings = await getAllEmbeddings()

    // 计算相似度
    const similarities = this.batchSimilarity(queryVector, embeddings)

    // 排序返回 top-k
    const topResults = this.topK(similarities, topK, minSimilarity)

    // 添加排名
    return topResults.map((item, index) => ({
      photoUuid: item.id,
      similarity: item.similarity,
      rank: index + 1
    }))
  }

  /**
   * 多查询融合搜索
   */
  async multiQuerySearch(
    queryVectors: EmbeddingVector[],
    getAllEmbeddings: () => Promise<Array<{ photoUuid: string; vector: EmbeddingVector }>>,
    options: { topK?: number; minSimilarity?: number; weights?: number[] } = {}
  ): Promise<SearchResult[]> {
    const { topK = 50, minSimilarity = 0.1, weights } = options

    // 获取所有嵌入
    const embeddings = await getAllEmbeddings()

    // 默认权重
    const vectorWeights = weights || queryVectors.map(() => 1 / queryVectors.length)

    // 收集所有相似度分数
    const scoreMap = new Map<string, { totalScore: number; count: number }>()

    for (let i = 0; i < queryVectors.length; i++) {
      const similarities = this.batchSimilarity(queryVectors[i], embeddings)

      for (const sim of similarities) {
        const existing = scoreMap.get(sim.id) || { totalScore: 0, count: 0 }
        existing.totalScore += sim.similarity * vectorWeights[i]
        existing.count += 1
        scoreMap.set(sim.id, existing)
      }
    }

    // 计算平均分数
    const results: SimilarityResult[] = []
    for (const [id, data] of scoreMap.entries()) {
      results.push({
        id,
        similarity: data.totalScore / data.count
      })
    }

    // 排序返回 top-k
    const topResults = this.topK(results, topK, minSimilarity)

    return topResults.map((item, index) => ({
      photoUuid: item.id,
      similarity: item.similarity,
      rank: index + 1
    }))
  }

  /**
   * 相似度分数转换（0-1 到百分比）
   */
  similarityToPercent(similarity: number): number {
    return Math.round(similarity * 100)
  }

  /**
   * 判断相似度等级
   */
  getSimilarityLevel(similarity: number): 'high' | 'medium' | 'low' {
    if (similarity >= 0.7) return 'high'
    if (similarity >= 0.4) return 'medium'
    return 'low'
  }
}

export const similarityService = new SimilarityService()
