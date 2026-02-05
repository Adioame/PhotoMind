/**
 * PhotoMind - 人脸匹配服务
 *
 * 功能：
 * 1. 人脸特征相似度计算
 * 2. 自动匹配同一人脸
 * 3. 人物聚类
 * 4. 人物合并/拆分
 */
import { PhotoDatabase } from '../database/db.js'

export interface FaceDescriptor {
  faceId: number
  photoId: number
  personId?: number
  descriptor: number[]
  boundingBox: any
  confidence: number
  isManual: boolean
}

export interface FaceMatch {
  faceId: number
  photoId: number
  matchedFaceId: number
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
}

export class FaceMatchingService {
  private database: PhotoDatabase

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 获取所有人脸描述符
   */
  async getAllFaceDescriptors(): Promise<FaceDescriptor[]> {
    const descriptors: FaceDescriptor[] = []

    const facesWithPerson = this.database.query(`
      SELECT f.*, p.id as person_id
      FROM faces f
      LEFT JOIN persons p ON f.person_id = p.id
    `)

    for (const row of facesWithPerson) {
      descriptors.push({
        faceId: row.id,
        photoId: row.photo_id,
        personId: row.person_id,
        descriptor: [],
        boundingBox: row.bounding_box ? JSON.parse(row.bounding_box) : null,
        confidence: row.confidence || 0,
        isManual: !!row.is_manual
      })
    }

    return descriptors
  }

  /**
   * 获取未匹配的人脸
   */
  async getUnmatchedFaces(): Promise<FaceDescriptor[]> {
    const faces = this.database.query(`
      SELECT f.*, p.id as person_id
      FROM faces f
      LEFT JOIN persons p ON f.person_id = p.id
      WHERE f.person_id IS NULL OR f.is_manual = 1
    `)

    return faces.map((row: any) => ({
      faceId: row.id,
      photoId: row.photo_id,
      personId: row.person_id,
      descriptor: [],
      boundingBox: row.bounding_box ? JSON.parse(row.bounding_box) : null,
      confidence: row.confidence || 0,
      isManual: !!row.is_manual
    }))
  }

  /**
   * 计算两个人脸的相似度
   */
  calculateSimilarity(descriptor1: number[], descriptor2: number[]): number {
    if (descriptor1.length === 0 || descriptor2.length === 0) {
      return 0.5
    }

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < Math.min(descriptor1.length, descriptor2.length); i++) {
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
    faceId: number,
    options: MatchingOptions = {}
  ): Promise<Array<{ faceId: number; similarity: number; photoId: number }>> {
    const { minSimilarity = 0.5 } = options

    const targetFace = await this.getFaceById(faceId)
    if (!targetFace) return []

    const allFaces = await this.getAllFaceDescriptors()
    const targetDescriptor = targetFace.descriptor || []

    const similarities: Array<{ faceId: number; similarity: number; photoId: number }> = []

    for (const face of allFaces) {
      if (face.faceId === faceId) continue

      const similarity = this.calculateSimilarity(targetDescriptor, face.descriptor || [])

      if (similarity >= minSimilarity) {
        similarities.push({
          faceId: face.faceId,
          similarity,
          photoId: face.photoId
        })
      }
    }

    similarities.sort((a, b) => b.similarity - a.similarity)

    return similarities
  }

  /**
   * 自动匹配所有人脸
   */
  async autoMatch(options: MatchingOptions = {}): Promise<{
    matched: number
    clusters: PersonCluster[]
    processingTimeMs: number
  }> {
    const startTime = Date.now()
    const { threshold = 0.6 } = options

    console.log('[FaceMatching] 开始自动匹配...')

    const unmatchedFaces = await this.getUnmatchedFaces()
    console.log(`[FaceMatching] 找到 ${unmatchedFaces.length} 张未匹配的人脸`)

    if (unmatchedFaces.length === 0) {
      return { matched: 0, clusters: [], processingTimeMs: Date.now() - startTime }
    }

    const clusters: PersonCluster[] = []
    const assigned = new Set<number>()

    for (const face of unmatchedFaces) {
      if (assigned.has(face.faceId)) continue

      const cluster: PersonCluster = {
        faces: [face],
        confidence: face.confidence
      }

      assigned.add(face.faceId)

      for (const otherFace of unmatchedFaces) {
        if (assigned.has(otherFace.faceId)) continue

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
      const personId = this.database.addPerson({
        name: personName,
        displayName: personName
      })

      for (const face of cluster.faces) {
        if (face.photoId) {
          this.database.addFace({
            photoId: face.photoId,
            personId,
            boundingBox: face.boundingBox,
            confidence: face.confidence,
            is_manual: 0
          })
        }
      }

      console.log(`[FaceMatching] 创建人物 "${personName}"，关联 ${cluster.faces.length} 张人脸`)
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
   * 将人脸分配给已有人物
   */
  async assignToPerson(faceIds: number[], personId: number): Promise<{
    success: boolean
    assigned: number
    error?: string
  }> {
    try {
      let assigned = 0

      for (const faceId of faceIds) {
        const face = this.database.query('SELECT * FROM faces WHERE id = ?', [faceId])[0]
        if (face) {
          this.database.addFace({
            photoId: face.photo_id,
            personId,
            boundingBox: face.bounding_box ? JSON.parse(face.bounding_box) : null,
            confidence: face.confidence,
            is_manual: 0
          })
          assigned++
        }
      }

      return { success: true, assigned }
    } catch (error) {
      console.error('[FaceMatching] 分配失败:', error)
      return {
        success: false,
        assigned: 0,
        error: String(error)
      }
    }
  }

  /**
   * 取消人脸匹配
   */
  async unmatchFace(faceId: number): Promise<boolean> {
    try {
      this.database.run(
        'UPDATE faces SET person_id = NULL WHERE id = ?',
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
   * 获取人脸详情
   */
  async getFaceById(faceId: number): Promise<FaceDescriptor | null> {
    const rows = this.database.query('SELECT * FROM faces WHERE id = ?', [faceId])
    if (rows.length === 0) return null

    const row = rows[0]
    return {
      faceId: row.id,
      photoId: row.photo_id,
      personId: row.person_id,
      descriptor: [],
      boundingBox: row.bounding_box ? JSON.parse(row.bounding_box) : null,
      confidence: row.confidence || 0,
      isManual: !!row.is_manual
    }
  }

  /**
   * 获取某人物的所有人脸
   */
  async getPersonFaces(personId: number): Promise<FaceDescriptor[]> {
    const rows = this.database.query(`
      SELECT f.* FROM faces f
      WHERE f.person_id = ?
      ORDER BY f.confidence DESC
    `, [personId])

    return rows.map((row: any) => ({
      faceId: row.id,
      photoId: row.photo_id,
      personId: row.person_id,
      descriptor: [],
      boundingBox: row.bounding_box ? JSON.parse(row.bounding_box) : null,
      confidence: row.confidence || 0,
      isManual: !!row.is_manual
    }))
  }

  /**
   * 合并两个人物
   */
  async mergePersons(
    sourcePersonId: number,
    targetPersonId: number
  ): Promise<{ success: boolean; merged: number; error?: string }> {
    try {
      const sourceFaces = await this.getPersonFaces(sourcePersonId)

      for (const face of sourceFaces) {
        this.database.run(
          'UPDATE faces SET person_id = ? WHERE id = ?',
          [targetPersonId, face.faceId]
        )
      }

      this.database.run('DELETE FROM persons WHERE id = ?', [sourcePersonId])

      console.log(`[FaceMatching] 合并人物 ${sourcePersonId} 到 ${targetPersonId}`)

      return { success: true, merged: sourceFaces.length }
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
    const totalFaces = this.database.query('SELECT COUNT(*) as count FROM faces')[0]?.count || 0
    const matchedFaces = this.database.query('SELECT COUNT(*) as count FROM faces WHERE person_id IS NOT NULL')[0]?.count || 0

    return {
      totalFaces,
      matchedFaces,
      unmatchedFaces: totalFaces - matchedFaces,
      matchRate: totalFaces > 0 ? matchedFaces / totalFaces : 0
    }
  }
}

export const faceMatchingService = new FaceMatchingService()
