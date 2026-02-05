/**
 * PhotoMind - 人脸识别服务
 *
 * 功能：
 * 1. 检测照片中的人脸
 * 2. 人脸特征提取（嵌入向量）
 * 3. 人脸聚类和相似度匹配
 * 4. 人物自动分组
 */
import { PhotoDatabase } from '../database/db.js'
import { thumbnailService } from './thumbnailService.js'
import crypto from 'crypto'

export interface FaceDetection {
  id: number
  photoId: number
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
  confidence: number
  embedding?: number[]
  personId?: number
}

export interface Person {
  id: number
  name: string
  displayName?: string
  faceCount: number
  embedding?: number[]
}

export interface FaceRecognitionServiceConfig {
  minFaceSize: number
  maxFaceSize: number
  similarityThreshold: number
  minConfidence: number
}

export class FaceRecognitionService {
  private database: PhotoDatabase
  private config: FaceRecognitionServiceConfig

  constructor(database: PhotoDatabase) {
    this.database = database
    this.config = {
      minFaceSize: 50,  // 最小人脸尺寸
      maxFaceSize: 500, // 最大人脸尺寸
      similarityThreshold: 0.7, // 相似度阈值
      minConfidence: 0.6  // 最小置信度
    }
  }

  /**
   * 检测照片中的人脸
   * 注意：这是简化版本，实际需要使用 face-api.js 或类似库
   */
  async detectFaces(photoPath: string): Promise<FaceDetection[]> {
    // TODO: 实现实际的人脸检测
    // 目前返回空数组作为占位
    // 实际实现需要：
    // 1. 使用 face-api.js 或 tensorflow.js
    // 2. 或者使用 macOS 原生人脸检测 API (VNDetectFaceRectanglesRequest)

    console.log('人脸检测服务需要配置人脸检测库')
    return []
  }

  /**
   * 提取人脸特征向量
   * 注意：需要使用深度学习模型
   */
  async extractEmbedding(faceImage: Buffer): Promise<number[] | null> {
    // TODO: 实现实际的人脸嵌入提取
    // 可以使用 face-api.js 的 facenet 模型
    // 或者使用 InsightFace、ArcFace 等

    // 返回随机向量作为占位（仅用于测试）
    const embedding = new Array(128).fill(0).map(() => Math.random() * 2 - 1)
    return embedding
  }

  /**
   * 计算两个向量的余弦相似度
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  /**
   * 将人脸添加到人物
   */
  async addFaceToPerson(faceId: number, personId: number): Promise<boolean> {
    try {
      // 更新 faces 表
      await this.database.query(
        'UPDATE faces SET person_id = ? WHERE id = ?',
        [personId, faceId]
      )
      return true
    } catch (error) {
      console.error('添加人脸到人物失败:', error)
      return false
    }
  }

  /**
   * 创建新人物
   */
  async createPerson(name: string): Promise<number> {
    return this.database.addPerson({ name })
  }

  /**
   * 自动聚类未分配的人脸
   */
  async clusterUnassignedFaces(): Promise<Person[]> {
    // 获取所有未分配的人物
    const faces = await this.database.query(
      `SELECT * FROM faces WHERE person_id IS NULL`
    )

    // 按嵌入向量聚类
    // 注意：这需要实际的嵌入向量

    // 返回空结果（实际实现需要完整的嵌入向量）
    console.log(`找到 ${faces.length} 个未分配的人脸，需要嵌入向量进行聚类`)
    return []
  }

  /**
   * 查找最相似的人物
   */
  async findMostSimilarPerson(embedding: number[]): Promise<{
    person: Person | null
    similarity: number
  }> {
    const persons = await this.database.getAllPersons()

    let bestMatch: Person | null = null
    let bestSimilarity = 0

    for (const person of persons) {
      // 获取该人物的所有嵌入向量
      // 这里简化处理，实际需要从数据库获取

      // 假设我们有人物的平均嵌入向量
      const personEmbedding = person.embedding || []
      if (personEmbedding.length === 0) continue

      const similarity = this.cosineSimilarity(embedding, personEmbedding)

      if (similarity > bestSimilarity && similarity > this.config.similarityThreshold) {
        bestSimilarity = similarity
        bestMatch = person
      }
    }

    return {
      person: bestMatch,
      similarity: bestSimilarity
    }
  }

  /**
   * 处理单张照片的人脸
   */
  async processPhoto(photoPath: string, photoId: number): Promise<{
    facesFound: number
    facesAdded: number
  }> {
    try {
      // 1. 检测人脸
      const faces = await this.detectFaces(photoPath)

      if (faces.length === 0) {
        return { facesFound: 0, facesAdded: 0 }
      }

      let facesAdded = 0

      // 2. 处理每个人脸
      for (const face of faces) {
        // 提取嵌入向量
        // 注意：需要实际的 faceImage
        const embedding = await this.extractEmbedding(Buffer.from([]))

        if (embedding) {
          // 3. 查找最相似的人物
          const { person } = await this.findMostSimilarPerson(embedding)

          // 4. 保存人脸
          const faceId = this.database.addFace({
            photoId,
            personId: person?.id,
            boundingBox: face.boundingBox,
            confidence: face.confidence
          })

          if (faceId > 0) {
            // 保存嵌入向量
            // this.database.addVector({ photoId, modelName: 'facenet', embedding })
            facesAdded++
          }
        }
      }

      return { facesFound: faces.length, facesAdded }
    } catch (error) {
      console.error('处理照片人脸失败:', error)
      return { facesFound: 0, facesAdded: 0 }
    }
  }

  /**
   * 批量处理照片
   */
  async processPhotos(photoPaths: { path: string; id: number }[], onProgress?: (current: number, total: number) => void): Promise<{
    photosProcessed: number
    totalFaces: number
  }> {
    let photosProcessed = 0
    let totalFaces = 0

    for (let i = 0; i < photoPaths.length; i++) {
      const { path, id } = photoPaths[i]
      const result = await this.processPhoto(path, id)

      photosProcessed++
      totalFaces += result.facesAdded

      onProgress?.(i + 1, photoPaths.length)
    }

    return { photosProcessed, totalFaces }
  }

  /**
   * 获取人物统计
   */
  async getPersonStats(): Promise<{
    totalPersons: number
    totalFaces: number
    unassignedFaces: number
  }> {
    const persons = await this.database.getAllPersons()
    const totalFaces = await this.database.query('SELECT COUNT(*) as count FROM faces')[0]?.count || 0
    const unassignedFaces = await this.database.query(
      'SELECT COUNT(*) as count FROM faces WHERE person_id IS NULL'
    )[0]?.count || 0

    return {
      totalPersons: persons.length,
      totalFaces,
      unassignedFaces
    }
  }
}

export const faceRecognitionService = (database: PhotoDatabase) =>
  new FaceRecognitionService(database)
