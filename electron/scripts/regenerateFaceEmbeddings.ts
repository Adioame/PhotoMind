/**
 * PhotoMind - 人脸向量重新生成脚本
 *
 * 功能：
 * 1. 批量重新生成所有人脸的 128维 + 512维向量
 * 2. 支持断点续传
 * 3. 后台队列处理
 * 4. 进度追踪
 */
import { PhotoDatabase } from '../database/db.js'
import { faceDetectionService } from '../services/faceDetectionService.js'
import { getEmbeddingService } from '../services/hybridEmbeddingService.js'
import { faceMatchingService } from '../services/faceMatchingService.js'
import { resolve, dirname } from 'path'
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs'
import sharp from 'sharp'

export interface RegenerationProgress {
  totalFaces: number
  processedCount: number
  successCount: number
  failedCount: number
  currentFaceId: string | null
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  startTime: string | null
  endTime: string | null
  errors: Array<{ faceId: string; error: string }>
}

export interface RegenerationOptions {
  batchSize?: number
  onProgress?: (progress: RegenerationProgress) => void
  resumeFromCheckpoint?: boolean
}

const PROGRESS_FILE = resolve(process.cwd(), 'data/regenerate-progress.json')

export class FaceEmbeddingRegenerator {
  private database: PhotoDatabase
  private progress: RegenerationProgress
  private isRunning = false
  private abortController: AbortController | null = null

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
    this.progress = this.loadProgress()
  }

  /**
   * 加载进度文件
   */
  private loadProgress(): RegenerationProgress {
    try {
      if (existsSync(PROGRESS_FILE)) {
        const data = readFileSync(PROGRESS_FILE, 'utf-8')
        return JSON.parse(data)
      }
    } catch (error) {
      console.error('[Regenerator] 加载进度文件失败:', error)
    }

    return {
      totalFaces: 0,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      currentFaceId: null,
      status: 'idle',
      startTime: null,
      endTime: null,
      errors: []
    }
  }

  /**
   * 保存进度到文件
   */
  private saveProgress(): void {
    try {
      const dir = dirname(PROGRESS_FILE)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(PROGRESS_FILE, JSON.stringify(this.progress, null, 2))
    } catch (error) {
      console.error('[Regenerator] 保存进度失败:', error)
    }
  }

  /**
   * 获取需要重新生成向量的人脸列表
   */
  private getFacesToRegenerate(): Array<{
    id: string
    photo_id: number
    file_path: string
    bbox_x: number
    bbox_y: number
    bbox_width: number
    bbox_height: number
    confidence: number
  }> {
    // 获取所有 vector_version < 2 的人脸
    const rows = this.database.query(`
      SELECT df.id, df.photo_id, df.bbox_x, df.bbox_y, df.bbox_width, df.bbox_height, df.confidence, p.file_path
      FROM detected_faces df
      JOIN photos p ON df.photo_id = p.id
      WHERE df.vector_version IS NULL OR df.vector_version < 2
      ORDER BY df.created_at ASC
    `)

    return rows.map((row: any) => ({
      id: row.id,
      photo_id: row.photo_id,
      file_path: row.file_path,
      bbox_x: row.bbox_x,
      bbox_y: row.bbox_y,
      bbox_width: row.bbox_width,
      bbox_height: row.bbox_height,
      confidence: row.confidence
    }))
  }

  /**
   * 为单个人脸重新生成向量
   */
  private async regenerateFaceEmbedding(face: {
    id: string
    photo_id: number
    file_path: string
    bbox_x: number
    bbox_y: number
    bbox_width: number
    bbox_height: number
    confidence: number
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // 检查照片文件是否存在
      if (!existsSync(face.file_path)) {
        return { success: false, error: '照片文件不存在' }
      }

      // 获取图片尺寸（用于坐标转换）
      const imageInfo = await sharp(face.file_path).metadata()
      const imgWidth = imageInfo.width || 1
      const imgHeight = imageInfo.height || 1

      // 转换相对坐标为绝对像素坐标（假设原检测使用 416x416）
      const absX = Math.round((face.bbox_x / 416) * imgWidth)
      const absY = Math.round((face.bbox_y / 416) * imgHeight)
      const absWidth = Math.round((face.bbox_width / 416) * imgWidth)
      const absHeight = Math.round((face.bbox_height / 416) * imgHeight)

      // 确保坐标在图片范围内
      const cropX = Math.max(0, absX)
      const cropY = Math.max(0, absY)
      const cropWidth = Math.min(absWidth, imgWidth - cropX)
      const cropHeight = Math.min(absHeight, imgHeight - cropY)

      if (cropWidth <= 0 || cropHeight <= 0) {
        return { success: false, error: '无效的裁剪区域' }
      }

      // 步骤 1: 使用 face-api 重新检测并生成 128维向量
      let faceDescriptor: number[] | null = null
      try {
        const detectResult = await faceDetectionService.detect(face.file_path)
        if (detectResult.success && detectResult.detections.length > 0) {
          // 找到最匹配的人脸（基于 bbox 重叠度）
          let bestMatch = detectResult.detections[0]
          let bestIoU = 0

          for (const detection of detectResult.detections) {
            const iou = this.calculateIoU(
              { x: face.bbox_x, y: face.bbox_y, width: face.bbox_width, height: face.bbox_height },
              detection.box
            )
            if (iou > bestIoU) {
              bestIoU = iou
              bestMatch = detection
            }
          }

          // 如果 IoU > 0.5，认为是同一个人脸
          if (bestIoU > 0.5 && bestMatch.descriptor) {
            faceDescriptor = bestMatch.descriptor
          }
        }
      } catch (faceApiError) {
        console.warn(`[Regenerator] face-api 检测失败: ${face.id}`, faceApiError)
      }

      // 步骤 2: 裁剪人脸区域并使用 CLIP 生成 512维向量
      let semanticEmbedding: number[] | null = null
      try {
        const faceBuffer = await sharp(face.file_path)
          .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
          .resize(224, 224, { fit: 'cover' })
          .jpeg({ quality: 90 })
          .toBuffer()

        const faceBase64 = `data:image/jpeg;base64,${faceBuffer.toString('base64')}`
        const embeddingService = getEmbeddingService()
        const clipResult = await embeddingService.imageToEmbedding(faceBase64)

        if (clipResult.success && clipResult.vector) {
          semanticEmbedding = clipResult.vector.values || (clipResult.vector as any)
        }
      } catch (clipError) {
        console.warn(`[Regenerator] CLIP 向量生成失败: ${face.id}`, clipError)
      }

      // 步骤 3: 更新数据库
      if (faceDescriptor || semanticEmbedding) {
        const embeddingBuffer = faceDescriptor
          ? Buffer.from(new Float32Array(faceDescriptor).buffer)
          : null
        const semanticBuffer = semanticEmbedding
          ? Buffer.from(new Float32Array(semanticEmbedding).buffer)
          : null

        this.database.run(
          `UPDATE detected_faces
           SET embedding = COALESCE(?, embedding),
               face_embedding = ?,
               semantic_embedding = ?,
               vector_version = CASE
                 WHEN ? IS NOT NULL AND ? IS NOT NULL THEN 2
                 WHEN ? IS NOT NULL THEN 1
                 ELSE vector_version
               END
           WHERE id = ?`,
          [
            embeddingBuffer,
            embeddingBuffer,
            semanticBuffer,
            semanticBuffer, // for CASE WHEN ? IS NOT NULL
            embeddingBuffer, // for CASE WHEN ? IS NOT NULL
            embeddingBuffer, // for CASE WHEN ? IS NOT NULL
            face.id
          ]
        )

        return { success: true }
      }

      return { success: false, error: '未能生成任何向量' }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 计算两个边界框的 IoU (Intersection over Union)
   */
  private calculateIoU(box1: { x: number; y: number; width: number; height: number },
                       box2: { x: number; y: number; width: number; height: number }): number {
    const x1 = Math.max(box1.x, box2.x)
    const y1 = Math.max(box1.y, box2.y)
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width)
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height)

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
    const area1 = box1.width * box1.height
    const area2 = box2.width * box2.height
    const union = area1 + area2 - intersection

    return union > 0 ? intersection / union : 0
  }

  /**
   * 开始重新生成任务
   */
  async start(options: RegenerationOptions = {}): Promise<RegenerationProgress> {
    if (this.isRunning) {
      throw new Error('重新生成任务已在进行中')
    }

    const { batchSize = 50, onProgress, resumeFromCheckpoint = true } = options

    this.isRunning = true
    this.abortController = new AbortController()

    // 如果需要，重置进度
    if (!resumeFromCheckpoint) {
      this.progress = {
        totalFaces: 0,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        currentFaceId: null,
        status: 'running',
        startTime: new Date().toISOString(),
        endTime: null,
        errors: []
      }
    } else {
      this.progress.status = 'running'
      if (!this.progress.startTime) {
        this.progress.startTime = new Date().toISOString()
      }
    }

    // 获取需要处理的人脸
    const facesToProcess = this.getFacesToRegenerate()
    this.progress.totalFaces = facesToProcess.length

    console.log(`[Regenerator] 开始重新生成 ${facesToProcess.length} 张人脸的向量`)

    // 分批处理
    for (let i = 0; i < facesToProcess.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        console.log('[Regenerator] 任务已取消')
        this.progress.status = 'paused'
        break
      }

      const batch = facesToProcess.slice(i, i + batchSize)

      for (const face of batch) {
        if (this.abortController?.signal.aborted) {
          break
        }

        this.progress.currentFaceId = face.id

        try {
          const result = await this.regenerateFaceEmbedding(face)

          if (result.success) {
            this.progress.successCount++
          } else {
            this.progress.failedCount++
            this.progress.errors.push({ faceId: face.id, error: result.error || '未知错误' })
          }
        } catch (error) {
          this.progress.failedCount++
          this.progress.errors.push({
            faceId: face.id,
            error: error instanceof Error ? error.message : '未知错误'
          })
        }

        this.progress.processedCount++

        // 每处理 10 张保存一次进度
        if (this.progress.processedCount % 10 === 0) {
          this.saveProgress()
          console.log(`[Regenerator] 进度: ${this.progress.processedCount}/${this.progress.totalFaces}`)
        }

        // 报告进度
        onProgress?.({ ...this.progress })

        // 每批处理后释放内存
        if (global.gc) {
          global.gc()
        }
      }
    }

    // 任务完成或暂停
    if (this.progress.status !== 'paused') {
      this.progress.status = this.progress.failedCount === 0 ? 'completed' : 'error'
      this.progress.endTime = new Date().toISOString()
    }

    this.progress.currentFaceId = null
    this.saveProgress()
    this.isRunning = false

    console.log(`[Regenerator] 任务结束: 成功 ${this.progress.successCount}, 失败 ${this.progress.failedCount}`)

    return this.progress
  }

  /**
   * 取消/暂停任务
   */
  pause(): void {
    if (this.isRunning) {
      this.abortController?.abort()
      this.progress.status = 'paused'
      this.saveProgress()
      console.log('[Regenerator] 任务已暂停')
    }
  }

  /**
   * 获取当前进度
   */
  getProgress(): RegenerationProgress {
    return { ...this.progress }
  }

  /**
   * 重置进度（用于重新开始）
   */
  reset(): void {
    this.progress = {
      totalFaces: 0,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      currentFaceId: null,
      status: 'idle',
      startTime: null,
      endTime: null,
      errors: []
    }
    this.saveProgress()
  }

  /**
   * 执行重新聚类
   */
  async recluster(): Promise<{
    success: boolean
    clustersCreated: number
    personsCreated: number
    error?: string
  }> {
    try {
      console.log('[Regenerator] 开始重新聚类...')

      // 清除现有人物关联
      this.database.run('UPDATE detected_faces SET person_id = NULL, processed = 0')
      console.log('[Regenerator] 已清除人物关联')

      // 执行聚类
      const result = await faceMatchingService.autoMatch({
        threshold: 0.6,
        onProgress: (current, total) => {
          if (current % 100 === 0) {
            console.log(`[Regenerator] 聚类进度: ${current}/${total}`)
          }
        }
      })

      console.log(`[Regenerator] 聚类完成: ${result.personsCreated} 个人物, ${result.matched} 张人脸已匹配`)

      return {
        success: true,
        clustersCreated: result.clusters.length,
        personsCreated: result.personsCreated || 0
      }
    } catch (error) {
      console.error('[Regenerator] 聚类失败:', error)
      return {
        success: false,
        clustersCreated: 0,
        personsCreated: 0,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 清理空人物
   */
  cleanupEmptyPersons(): { deleted: number } {
    try {
      // 获取所有 face_count = 0 的人物
      const emptyPersons = this.database.query(`
        SELECT p.id
        FROM persons p
        LEFT JOIN detected_faces df ON p.id = df.person_id
        GROUP BY p.id
        HAVING COUNT(df.id) = 0
      `)

      let deleted = 0
      for (const person of emptyPersons) {
        this.database.run('DELETE FROM persons WHERE id = ?', [person.id])
        deleted++
      }

      console.log(`[Regenerator] 清理了 ${deleted} 个空人物`)
      return { deleted }
    } catch (error) {
      console.error('[Regenerator] 清理空人物失败:', error)
      return { deleted: 0 }
    }
  }
}

// 导出单例
export const faceEmbeddingRegenerator = new FaceEmbeddingRegenerator()
