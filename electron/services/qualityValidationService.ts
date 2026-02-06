/**
 * PhotoMind - 质量验证服务
 *
 * 功能：
 * 1. 聚类质量验证
 * 2. 语义搜索验证
 * 3. 生成质量报告
 */
import { PhotoDatabase } from '../database/db.js'
import { faceMatchingService } from './faceMatchingService.js'
import { personService } from './personService.js'
import { getEmbeddingService } from './hybridEmbeddingService.js'

export interface ClusteringQualityResult {
  totalPersons: number
  totalFaces: number
  avgFacesPerPerson: number
  samePersonSimilarities: number[]
  differentPersonSimilarities: number[]
  samePersonAvg: number
  differentPersonAvg: number
  passRate: number // 同一人>0.6的占比
  boundaryCases: Array<{
    personId: number
    personName: string
    faceCount: number
    avgInternalSimilarity: number
  }>
}

export interface SemanticSearchTestResult {
  query: string
  expectedConcepts: string[]
  results: Array<{
    photoUuid: string
    similarity: number
    hasFace: boolean
    isOutdoor: boolean
  }>
  relevanceScore: number
  responseTimeMs: number
}

export interface QualityReport {
  clustering: ClusteringQualityResult
  semanticSearch: SemanticSearchTestResult[]
  overallScore: number
  recommendations: string[]
  timestamp: string
}

export class QualityValidationService {
  private database: PhotoDatabase

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0) return 0
    const len = Math.min(a.length, b.length)
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    if (normA === 0 || normB === 0) return 0
    return dot / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  /**
   * 验证聚类质量
   */
  async validateClustering(): Promise<ClusteringQualityResult> {
    console.log('[QualityValidation] 开始验证聚类质量...')

    const persons = personService.getAllPersons()
    const allFaces = await faceMatchingService.getAllFaceDescriptors()

    const samePersonSimilarities: number[] = []
    const differentPersonSimilarities: number[] = []
    const boundaryCases: Array<{
      personId: number
      personName: string
      faceCount: number
      avgInternalSimilarity: number
    }> = []

    // 计算每个人物内部的人脸相似度
    for (const person of persons) {
      const personFaces = allFaces.filter(f => f.personId === person.id)
      if (personFaces.length < 2) continue

      const internalSimilarities: number[] = []
      for (let i = 0; i < personFaces.length; i++) {
        for (let j = i + 1; j < personFaces.length; j++) {
          const sim = this.cosineSimilarity(
            personFaces[i].descriptor,
            personFaces[j].descriptor
          )
          internalSimilarities.push(sim)
          samePersonSimilarities.push(sim)
        }
      }

      const avgInternalSim = internalSimilarities.length > 0
        ? internalSimilarities.reduce((a, b) => a + b, 0) / internalSimilarities.length
        : 0

      // 如果平均相似度 < 0.6，标记为边界案例
      if (avgInternalSim < 0.6 && avgInternalSim > 0.3) {
        boundaryCases.push({
          personId: person.id,
          personName: person.display_name || person.name,
          faceCount: personFaces.length,
          avgInternalSimilarity: avgInternalSim
        })
      }
    }

    // 计算不同人物之间的相似度（采样）
    const sampleSize = Math.min(persons.length, 10)
    for (let i = 0; i < sampleSize; i++) {
      const personA = persons[i]
      const facesA = allFaces.filter(f => f.personId === personA.id)
      if (facesA.length === 0) continue

      for (let j = i + 1; j < sampleSize; j++) {
        const personB = persons[j]
        const facesB = allFaces.filter(f => f.personId === personB.id)
        if (facesB.length === 0) continue

        // 计算两个组之间的平均相似度
        let totalSim = 0
        let count = 0
        for (const faceA of facesA.slice(0, 3)) {
          for (const faceB of facesB.slice(0, 3)) {
            totalSim += this.cosineSimilarity(faceA.descriptor, faceB.descriptor)
            count++
          }
        }
        if (count > 0) {
          differentPersonSimilarities.push(totalSim / count)
        }
      }
    }

    const samePersonAvg = samePersonSimilarities.length > 0
      ? samePersonSimilarities.reduce((a, b) => a + b, 0) / samePersonSimilarities.length
      : 0

    const differentPersonAvg = differentPersonSimilarities.length > 0
      ? differentPersonSimilarities.reduce((a, b) => a + b, 0) / differentPersonSimilarities.length
      : 0

    // 计算通过率（同一人相似度 > 0.6 的占比）
    const passCount = samePersonSimilarities.filter(s => s > 0.6).length
    const passRate = samePersonSimilarities.length > 0
      ? passCount / samePersonSimilarities.length
      : 0

    console.log(`[QualityValidation] 聚类质量验证完成:`)
    console.log(`  - 人物数量: ${persons.length}`)
    console.log(`  - 同一人平均相似度: ${samePersonAvg.toFixed(3)}`)
    console.log(`  - 不同人平均相似度: ${differentPersonAvg.toFixed(3)}`)
    console.log(`  - 通过率: ${(passRate * 100).toFixed(1)}%`)

    return {
      totalPersons: persons.length,
      totalFaces: allFaces.length,
      avgFacesPerPerson: persons.length > 0 ? allFaces.length / persons.length : 0,
      samePersonSimilarities,
      differentPersonSimilarities,
      samePersonAvg,
      differentPersonAvg,
      passRate,
      boundaryCases
    }
  }

  /**
   * 测试语义搜索
   */
  async testSemanticSearch(
    query: string,
    expectedConcepts: string[] = []
  ): Promise<SemanticSearchTestResult> {
    console.log(`[QualityValidation] 测试语义搜索: "${query}"`)

    const startTime = Date.now()

    try {
      const embeddingService = getEmbeddingService()
      const result = await embeddingService.textToEmbedding(query)

      const responseTimeMs = Date.now() - startTime

      if (!result.success || !result.vector) {
        return {
          query,
          expectedConcepts,
          results: [],
          relevanceScore: 0,
          responseTimeMs
        }
      }

      // 获取所有照片向量
      const allEmbeddings = await this.database.getAllEmbeddings('image')

      // 计算相似度
      const queryVector = result.vector.values || (result.vector as any)
      const similarities = allEmbeddings.map(emb => ({
        photoUuid: emb.photoUuid,
        similarity: this.cosineSimilarity(queryVector, emb.vector),
        hasFace: false,
        isOutdoor: false
      }))

      // 排序并取前 10
      similarities.sort((a, b) => b.similarity - a.similarity)
      const topResults = similarities.slice(0, 10)

      // 计算相关性分数（平均相似度）
      const relevanceScore = topResults.length > 0
        ? topResults.reduce((sum, r) => sum + r.similarity, 0) / topResults.length
        : 0

      console.log(`[QualityValidation] 语义搜索完成:`)
      console.log(`  - 响应时间: ${responseTimeMs}ms`)
      console.log(`  - 相关性分数: ${relevanceScore.toFixed(3)}`)

      return {
        query,
        expectedConcepts,
        results: topResults,
        relevanceScore,
        responseTimeMs
      }
    } catch (error) {
      console.error('[QualityValidation] 语义搜索测试失败:', error)
      return {
        query,
        expectedConcepts,
        results: [],
        relevanceScore: 0,
        responseTimeMs: Date.now() - startTime
      }
    }
  }

  /**
   * 运行标准测试集
   */
  async runStandardTests(): Promise<SemanticSearchTestResult[]> {
    const testQueries = [
      { query: '我和妈妈在公园', expectedConcepts: ['人', '公园', '户外'] },
      { query: '朋友在海边', expectedConcepts: ['人', '海', '户外'] },
      { query: '生日派对', expectedConcepts: ['庆祝', '室内', '人'] },
      { query: '风景照片', expectedConcepts: ['风景', '自然'] },
      { query: '宠物狗', expectedConcepts: ['狗', '动物'] }
    ]

    const results: SemanticSearchTestResult[] = []
    for (const { query, expectedConcepts } of testQueries) {
      const result = await this.testSemanticSearch(query, expectedConcepts)
      results.push(result)
    }

    return results
  }

  /**
   * 生成完整质量报告
   */
  async generateReport(): Promise<QualityReport> {
    console.log('[QualityValidation] 生成完整质量报告...')

    const clustering = await this.validateClustering()
    const semanticSearch = await this.runStandardTests()

    // 计算综合分数
    const clusteringScore = clustering.passRate * 100
    const semanticScore = semanticSearch.length > 0
      ? (semanticSearch.reduce((sum, r) => sum + r.relevanceScore, 0) / semanticSearch.length) * 100
      : 0
    const overallScore = (clusteringScore + semanticScore) / 2

    // 生成建议
    const recommendations: string[] = []

    if (clustering.passRate < 0.7) {
      recommendations.push('聚类质量偏低，建议重新调整聚类阈值或重新生成向量')
    }
    if (clustering.boundaryCases.length > 0) {
      recommendations.push(`发现 ${clustering.boundaryCases.length} 个人物需要人工检查`)
    }
    if (semanticScore < 50) {
      recommendations.push('语义搜索质量偏低，建议检查 CLIP 模型加载状态')
    }

    const avgResponseTime = semanticSearch.length > 0
      ? semanticSearch.reduce((sum, r) => sum + r.responseTimeMs, 0) / semanticSearch.length
      : 0
    if (avgResponseTime > 500) {
      recommendations.push(`搜索响应时间较长 (${avgResponseTime.toFixed(0)}ms)，建议优化性能`)
    }

    if (recommendations.length === 0) {
      recommendations.push('系统质量良好，无需调整')
    }

    return {
      clustering,
      semanticSearch,
      overallScore,
      recommendations,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 检查向量维度
   */
  async checkVectorDimensions(): Promise<{
    faceEmbeddingDim: number
    semanticEmbeddingDim: number
    validFaces: number
    invalidFaces: number
  }> {
    const faces = this.database.query(`
      SELECT id, face_embedding, semantic_embedding
      FROM detected_faces
      WHERE vector_version >= 1
    `)

    let validFaces = 0
    let invalidFaces = 0
    let faceEmbeddingDim = 0
    let semanticEmbeddingDim = 0

    for (const face of faces) {
      try {
        if (face.face_embedding) {
          const arr = new Float32Array(face.face_embedding)
          faceEmbeddingDim = arr.length
          if (arr.length === 128) validFaces++
          else invalidFaces++
        }
        if (face.semantic_embedding) {
          const arr = new Float32Array(face.semantic_embedding)
          semanticEmbeddingDim = arr.length
        }
      } catch (e) {
        invalidFaces++
      }
    }

    return {
      faceEmbeddingDim,
      semanticEmbeddingDim,
      validFaces,
      invalidFaces
    }
  }
}

export const qualityValidationService = new QualityValidationService()
