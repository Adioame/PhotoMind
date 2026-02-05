/**
 * PhotoMind - 人脸匹配服务
 *
 * 功能：
 * 1. 人脸特征相似度计算
 * 2. 自动匹配同一人脸
 * 3. 人物聚类
 * 4. 人物合并/拆分
 *
 * 依赖：
 * - 数据库中的 detected_faces 表存储人脸嵌入向量
 * - persons 表存储人物信息
 * - faces 表存储人脸与人物的关联
 */
import { PhotoDatabase } from '../database/db.js'

export interface FaceDescriptor {
  faceId: number | string  // 支持 detected_faces 的 string id
  photoId: number
  personId?: number
  descriptor: number[]
  boundingBox: { x: number; y: number; width: number; height: number } | null
  confidence: number
  isManual: boolean
}

export interface FaceMatch {
  faceId: number | string
  photoId: number
  matchedFaceId: number | string
  matchedPhotoId: number
  similarity: number
  personId?: number
}

export interface PersonCluster {
  personId?: number
  faces: FaceDescriptor[]
  suggestedName?: string
  confidence: number
}

export interface MatchingOptions {
  threshold?: number
  minSimilarity?: number
  maxClusterSize?: number
  onProgress?: (current: number, total: number) => void
}

/**
 * 将 Blob 转换为 number[]
 */
function blobToArray(blob: any): number[] | null {
  if (!blob) return null
  try {
    // Blob 可能是 Buffer 或 ArrayBuffer
    if (typeof blob === 'object' && blob.constructor === Buffer) {
      return Array.from(new Float32Array(blob))
    } else if (blob instanceof ArrayBuffer) {
      return Array.from(new Float32Array(blob))
    } else if (ArrayBuffer.isView(blob)) {
      return Array.from(new Float32Array(blob.buffer))
    } else if (blob instanceof Uint8Array) {
      return Array.from(new Float32Array(blob.buffer))
    }
    return null
  } catch (e) {
    return null
  }
}

export class FaceMatchingService {
  private database: PhotoDatabase

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 获取所有人脸描述符（从 detected_faces 表获取嵌入向量）
   */
  async getAllFaceDescriptors(): Promise<FaceDescriptor[]> {
    const descriptors: FaceDescriptor[] = []

    const detectedFaces = this.database.query(`
      SELECT df.*, p.id as person_id, p.name as person_name
      FROM detected_faces df
      LEFT JOIN persons p ON df.person_id = p.id
      ORDER BY df.confidence DESC
    `)

    for (const row of detectedFaces) {
      const embedding = blobToArray(row.embedding)

      descriptors.push({
        faceId: row.id,
        photoId: row.photo_id,
        personId: row.person_id,
        descriptor: embedding || [],
        boundingBox: {
          x: row.bbox_x,
          y: row.bbox_y,
          width: row.bbox_width,
          height: row.bbox_height
        },
        confidence: row.confidence || 0,
        isManual: !!row.is_manual
      })
    }

    return descriptors
  }

  /**
   * 获取未匹配的人脸（没有分配给人物的人脸）
   */
  async getUnmatchedFaces(): Promise<FaceDescriptor[]> {
    const detectedFaces = this.database.query(`
      SELECT df.*, p.id as person_id
      FROM detected_faces df
      LEFT JOIN persons p ON df.person_id = p.id
      WHERE df.person_id IS NULL OR df.is_manual = 1
      ORDER BY df.confidence DESC
    `)

    return detectedFaces.map((row: any) => {
      const embedding = blobToArray(row.embedding)

      return {
        faceId: row.id,
        photoId: row.photo_id,
        personId: row.person_id,
        descriptor: embedding || [],
        boundingBox: {
          x: row.bbox_x,
          y: row.bbox_y,
          width: row.bbox_width,
          height: row.bbox_height
        },
        confidence: row.confidence || 0,
        isManual: !!row.is_manual
      }
    })
  }

  /**
   * 计算两个人脸的相似度（余弦相似度）
   */
  calculateSimilarity(descriptor1: number[], descriptor2: number[]): number {
    if (!descriptor1 || !descriptor2 || descriptor1.length === 0 || descriptor2.length === 0) {
      return 0
    }

    // 使用较短的向量长度
    const length = Math.min(descriptor1.length, descriptor2.length)

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < length; i++) {
      dotProduct += descriptor1[i] * descriptor2[i]
      norm1 += descriptor1[i] * descriptor1[i]
      norm2 += descriptor2[i] * descriptor2[i]
    }

    if (norm1 === 0 || norm2 === 0) return 0

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  }

  /**
   * 查找相似人脸
   */
  async findSimilarFaces(
    faceId: string | number,
    options: MatchingOptions = {}
  ): Promise<Array<{ faceId: string | number; similarity: number; photoId: number }>> {
    const { minSimilarity = 0.5, threshold = 0.6 } = options

    const targetFace = await this.getFaceById(faceId)
    if (!targetFace || !targetFace.descriptor || targetFace.descriptor.length === 0) {
      console.log('[FaceMatching] 目标人脸不存在或没有嵌入向量')
      return []
    }

    const allFaces = await this.getAllFaceDescriptors()
    const targetDescriptor = targetFace.descriptor

    const similarities: Array<{ faceId: string | number; similarity: number; photoId: number }> = []

    for (const face of allFaces) {
      if (String(face.faceId) === String(faceId)) continue
      if (!face.descriptor || face.descriptor.length === 0) continue

      const similarity = this.calculateSimilarity(targetDescriptor, face.descriptor)

      if (similarity >= minSimilarity) {
        similarities.push({
          faceId: face.faceId,
          similarity,
          photoId: face.photoId
        })
      }
    }

    // 按相似度降序排序
    similarities.sort((a, b) => b.similarity - a.similarity)

    return similarities.filter(s => s.similarity >= threshold)
  }

  /**
   * 自动匹配所有人脸（聚类算法）
   */
  async autoMatch(options: MatchingOptions = {}): Promise<{
    matched: number
    clusters: PersonCluster[]
    processingTimeMs: number
    warning?: string
  }> {
    const startTime = Date.now()
    const {
      threshold = 0.6,
      maxClusterSize = 100,
      onProgress
    } = options

    console.log('[FaceMatching] 开始自动匹配...')

    const unmatchedFaces = await this.getUnmatchedFaces()
    console.log(`[FaceMatching] 找到 ${unmatchedFaces.length} 张未匹配的人脸`)

    if (unmatchedFaces.length === 0) {
      return { matched: 0, clusters: [], processingTimeMs: Date.now() - startTime }
    }

    // 过滤出有嵌入向量的人脸
    const facesWithEmbeddings = unmatchedFaces.filter(f => f.descriptor && f.descriptor.length > 0)
    console.log(`[FaceMatching] 其中 ${facesWithEmbeddings.length} 张有人脸嵌入向量`)

    if (facesWithEmbeddings.length === 0) {
      return {
        matched: 0,
        clusters: [],
        processingTimeMs: Date.now() - startTime,
        warning: '没有人脸嵌入向量，请先运行人脸检测和特征提取'
      }
    }

    // 简单聚类算法（基于相似度的贪心聚类）
    const clusters: PersonCluster[] = []
    const assigned = new Set<string | number>()
    const total = facesWithEmbeddings.length

    for (let i = 0; i < facesWithEmbeddings.length; i++) {
      const face = facesWithEmbeddings[i]
      onProgress?.(i, total)

      if (assigned.has(face.faceId)) continue

      const cluster: PersonCluster = {
        faces: [face],
        confidence: face.confidence
      }

      assigned.add(face.faceId)

      // 查找相似人脸
      for (let j = i + 1; j < facesWithEmbeddings.length; j++) {
        const otherFace = facesWithEmbeddings[j]

        if (assigned.has(otherFace.faceId)) continue
        if (cluster.faces.length >= maxClusterSize) break

        const similarity = this.calculateSimilarity(
          face.descriptor || [],
          otherFace.descriptor || []
        )

        if (similarity >= threshold) {
          cluster.faces.push(otherFace)
          assigned.add(otherFace.faceId)
          cluster.confidence = Math.min(cluster.confidence, similarity)
        }
      }

      if (cluster.faces.length > 0) {
        clusters.push(cluster)
      }
    }

    console.log(`[FaceMatching] 聚类完成，生成 ${clusters.length} 个聚类`)

    return {
      matched: assigned.size,
      clusters,
      processingTimeMs: Date.now() - startTime
    }
  }

  /**
   * 为聚类创建新人物
   */
  async createPersonFromCluster(cluster: PersonCluster, personName: string): Promise<{
    success: boolean
    personId?: number
    error?: string
  }> {
    try {
      // 创建新人物
      const personId = this.database.addPerson({
        name: personName,
        displayName: personName
      })

      console.log(`[FaceMatching] 创建人物 "${personName}" (ID: ${personId})`)

      // 为聚类中的每个人脸分配人物
      let assignedCount = 0
      for (const face of cluster.faces) {
        const success = await this.assignFaceToPerson(face.faceId, personId)
        if (success) assignedCount++
      }

      console.log(`[FaceMatching] 创建人物 "${personName}"，关联 ${assignedCount}/${cluster.faces.length} 张人脸`)
      return { success: true, personId }
    } catch (error) {
      console.error('[FaceMatching] 创建人物失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建失败'
      }
    }
  }

  /**
   * 获取人脸详情
   */
  async getFaceById(faceId: string | number): Promise<FaceDescriptor | null> {
    const rows = this.database.query(
      'SELECT df.*, p.id as person_id FROM detected_faces df LEFT JOIN persons p ON df.person_id = p.id WHERE df.id = ?',
      [faceId]
    )

    if (rows.length === 0) return null

    const row = rows[0]
    const embedding = blobToArray(row.embedding)

    return {
      faceId: row.id,
      photoId: row.photo_id,
      personId: row.person_id,
      descriptor: embedding || [],
      boundingBox: {
        x: row.bbox_x,
        y: row.bbox_y,
        width: row.bbox_width,
        height: row.bbox_height
      },
      confidence: row.confidence || 0,
      isManual: !!row.is_manual
    }
  }

  /**
   * 将单个人脸分配给人物
   */
  async assignFaceToPerson(faceId: string | number, personId: number): Promise<boolean> {
    try {
      const success = this.database.markFaceAsProcessed(String(faceId), personId)
      if (success) {
        console.log(`[FaceMatching] 人脸 ${faceId} 已分配给人物 ${personId}`)
      }
      return success
    } catch (error) {
      console.error('[FaceMatching] 分配人脸失败:', error)
      return false
    }
  }

  /**
   * 将多个人脸分配给人物
   */
  async assignToPerson(faceIds: (string | number)[], personId: number): Promise<{
    success: boolean
    assigned: number
    error?: string
  }> {
    try {
      let assigned = 0

      for (const faceId of faceIds) {
        const success = await this.assignFaceToPerson(faceId, personId)
        if (success) assigned++
      }

      return { success: true, assigned }
    } catch (error) {
      console.error('[FaceMatching] 批量分配失败:', error)
      return {
        success: false,
        assigned: 0,
        error: String(error)
      }
    }
  }

  /**
   * 取消人脸匹配（解除人物关联）
   */
  async unmatchFace(faceId: string | number): Promise<boolean> {
    try {
      this.database.run(
        'UPDATE detected_faces SET person_id = NULL, processed = 0 WHERE id = ?',
        [faceId]
      )
      console.log(`[FaceMatching] 取消人脸 ${faceId} 的匹配`)
      return true
    } catch (error) {
      console.error('[FaceMatching] 取消匹配失败:', error)
      return false
    }
  }

  /**
   * 获取某人物的所有人脸
   */
  async getPersonFaces(personId: number): Promise<FaceDescriptor[]> {
    const detectedFaces = this.database.query(`
      SELECT df.*, p.id as person_id
      FROM detected_faces df
      LEFT JOIN persons p ON df.person_id = p.id
      WHERE df.person_id = ?
      ORDER BY df.confidence DESC
    `, [personId])

    return detectedFaces.map((row: any) => {
      const embedding = blobToArray(row.embedding)

      return {
        faceId: row.id,
        photoId: row.photo_id,
        personId: row.person_id,
        descriptor: embedding || [],
        boundingBox: {
          x: row.bbox_x,
          y: row.bbox_y,
          width: row.bbox_width,
          height: row.bbox_height
        },
        confidence: row.confidence || 0,
        isManual: !!row.is_manual
      }
    })
  }

  /**
   * 合并两个人物（将源人物的所有人脸合并到目标人物）
   */
  async mergePersons(
    sourcePersonId: number,
    targetPersonId: number
  ): Promise<{ success: boolean; merged: number; error?: string }> {
    try {
      // 获取源人物的所有人脸
      const sourceFaces = await this.getPersonFaces(sourcePersonId)

      if (sourceFaces.length === 0) {
        return { success: true, merged: 0 }
      }

      // 将所有人脸分配给目标人物
      let merged = 0
      for (const face of sourceFaces) {
        const success = await this.assignFaceToPerson(face.faceId, targetPersonId)
        if (success) merged++
      }

      // 删除源人物
      this.database.run('DELETE FROM persons WHERE id = ?', [sourcePersonId])

      console.log(`[FaceMatching] 合并人物 ${sourcePersonId} 到 ${targetPersonId}，合并 ${merged} 张人脸`)

      return { success: true, merged }
    } catch (error) {
      console.error('[FaceMatching] 合并失败:', error)
      return {
        success: false,
        merged: 0,
        error: String(error)
      }
    }
  }

  /**
   * 获取匹配统计
   */
  getStats(): {
    totalFaces: number
    matchedFaces: number
    unmatchedFaces: number
    matchRate: number
  } {
    const totalFaces = this.database.query('SELECT COUNT(*) as count FROM detected_faces')[0]?.count || 0
    const matchedFaces = this.database.query('SELECT COUNT(*) as count FROM detected_faces WHERE person_id IS NOT NULL')[0]?.count || 0

    return {
      totalFaces,
      matchedFaces,
      unmatchedFaces: totalFaces - matchedFaces,
      matchRate: totalFaces > 0 ? matchedFaces / totalFaces : 0
    }
  }

  /**
   * 获取检测统计（便捷方法）
   */
  getDetectionStats(): {
    totalDetections: number
    processedCount: number
    unprocessedCount: number
    photosWithFaces: number
  } {
    return this.database.getDetectedFacesStats()
  }
}

export const faceMatchingService = new FaceMatchingService()
