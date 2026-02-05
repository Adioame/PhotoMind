/**
 * PhotoMind - 向量生成服务
 *
 * 功能：
 * 1. 批量生成照片的语义向量
 * 2. 增量更新（只生成新照片的向量）
 * 3. 进度追踪和取消支持
 */
import { getEmbeddingService } from './embeddingService.js'
import { PhotoDatabase } from '../database/db.js'
import type { BatchEmbeddingProgress, EmbeddingResult } from '../types/embedding.js'

interface GenerationOptions {
  batchSize?: number
  onProgress?: (progress: BatchEmbeddingProgress) => void
}

interface GenerationResult {
  success: number
  failed: number
  total: number
  errors: Array<{ photoUuid: string; error: string }>
  cancelled: boolean
}

export class VectorGenerationService {
  private isGenerating = false
  private abortController: AbortController | null = null
  private database: PhotoDatabase

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 生成所有照片的向量
   */
  async generateAll(options: GenerationOptions = {}): Promise<GenerationResult> {
    if (this.isGenerating) {
      throw new Error('生成任务已在进行中')
    }

    this.isGenerating = true
    this.abortController = new AbortController()

    const embeddingService = getEmbeddingService()
    const { batchSize = 50, onProgress } = options

    let success = 0
    let failed = 0
    let total = 0
    let processed = 0
    const errors: Array<{ photoUuid: string; error: string }> = []

    try {
      // 确保模型已加载
      if (!embeddingService.isLoaded) {
        console.log('[VectorGeneration] 加载 CLIP 模型...')
        await embeddingService.initialize()
      }

      // 获取没有向量的照片
      const photos = this.database.getPhotosWithoutEmbeddings(10000)
      total = photos.length

      console.log(`[VectorGeneration] 开始生成 ${total} 张照片的向量`)

      if (total === 0) {
        console.log('[VectorGeneration] 所有照片已有向量，无需生成')
        return { success: 0, failed, total, errors: [], cancelled: false }
      }

      // 分批处理
      for (let i = 0; i < total; i += batchSize) {
        // 检查是否已取消
        if (this.abortController?.signal.aborted) {
          console.log('[VectorGeneration] 生成任务已取消')
          break
        }

        const batch = photos.slice(i, i + batchSize)

        for (const photo of batch) {
          if (this.abortController?.signal.aborted) {
            break
          }

          try {
            // 再次检查是否已有向量（可能在批次之间生成）
            const hasEmbedding = await this.database.hasEmbedding(photo.uuid, 'image')
            if (hasEmbedding) {
              processed++
              continue
            }

            const result = await embeddingService.imageToEmbedding(photo.file_path)

            if (result.success && result.vector) {
              await this.database.saveEmbedding(photo.uuid, result.vector, 'image')
              success++
            } else {
              failed++
              errors.push({
                photoUuid: photo.uuid,
                error: result.error || 'Unknown error'
              })
            }
          } catch (error) {
            failed++
            errors.push({
              photoUuid: photo.uuid,
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          }

          processed++

          // 发送进度更新
          const progress: BatchEmbeddingProgress = {
            total,
            processed,
            currentPhotoUuid: photo.uuid,
            percentComplete: Math.round((processed / total) * 100)
          }

          onProgress?.(progress)
        }
      }

      console.log(`[VectorGeneration] 生成完成: 成功 ${success}, 失败 ${failed}`)
      return { success, failed, total, errors, cancelled: this.abortController?.signal.aborted || false }
    } catch (error) {
      console.error('[VectorGeneration] 生成失败:', error)
      return {
        success,
        failed,
        total,
        errors,
        cancelled: false
      }
    } finally {
      this.isGenerating = false
      this.abortController = null
    }
  }

  /**
   * 生成单张照片的向量
   */
  async generateOne(photoUuid: string): Promise<boolean> {
    const embeddingService = getEmbeddingService()

    if (!embeddingService.isLoaded) {
      await embeddingService.initialize()
    }

    const photo = this.database.getPhotoByUuid(photoUuid)
    if (!photo) {
      throw new Error(`照片不存在: ${photoUuid}`)
    }

    // 检查是否已有向量
    const hasEmbedding = await this.database.hasEmbedding(photoUuid, 'image')
    if (hasEmbedding) {
      console.log(`[VectorGeneration] 照片已有向量，跳过: ${photoUuid}`)
      return true
    }

    const result = await embeddingService.imageToEmbedding(photo.file_path)

    if (result.success && result.vector) {
      await this.database.saveEmbedding(photoUuid, result.vector, 'image')
      console.log(`[VectorGeneration] 成功生成向量: ${photoUuid}`)
      return true
    }

    return false
  }

  /**
   * 批量生成指定照片的向量
   */
  async generateBatch(
    photoUuids: string[],
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    if (this.isGenerating) {
      throw new Error('生成任务已在进行中')
    }

    this.isGenerating = true
    this.abortController = new AbortController()

    const embeddingService = getEmbeddingService()
    const { batchSize = 10, onProgress } = options

    let success = 0
    let failed = 0
    const errors: Array<{ photoUuid: string; error: string }> = []
    const total = photoUuids.length
    let processed = 0

    try {
      if (!embeddingService.isLoaded) {
        await embeddingService.initialize()
      }

      for (const photoUuid of photoUuids) {
        if (this.abortController?.signal.aborted) {
          break
        }

        try {
          const photo = this.database.getPhotoByUuid(photoUuid)
          if (!photo) {
            failed++
            errors.push({ photoUuid, error: '照片不存在' })
            continue
          }

          const result = await embeddingService.imageToEmbedding(photo.file_path)

          if (result.success && result.vector) {
            await this.database.saveEmbedding(photoUuid, result.vector, 'image')
            success++
          } else {
            failed++
            errors.push({ photoUuid, error: result.error || 'Unknown error' })
          }
        } catch (error) {
          failed++
          errors.push({
            photoUuid,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }

        processed++

        const progress: BatchEmbeddingProgress = {
          total,
          processed,
          currentPhotoUuid: photoUuid,
          percentComplete: Math.round((processed / total) * 100)
        }

        onProgress?.(progress)
      }

      return { success, failed, total, errors, cancelled: this.abortController?.signal.aborted || false }
    } finally {
      this.isGenerating = false
      this.abortController = null
    }
  }

  /**
   * 取消生成任务
   */
  cancel(): void {
    console.log('[VectorGeneration] 收到取消信号')
    this.abortController?.abort()
  }

  /**
   * 获取生成状态
   */
  getStatus(): { isGenerating: boolean; totalPending?: number } {
    if (!this.isGenerating) {
      return { isGenerating: false }
    }

    const pending = this.database.getPhotosWithoutEmbeddings(1).length
    return { isGenerating: true, totalPending: pending }
  }

  /**
   * 获取待生成的照片数量
   */
  async getPendingCount(): Promise<number> {
    const photos = this.database.getPhotosWithoutEmbeddings(10000)
    return photos.length
  }
}

export const vectorGenerationService = new VectorGenerationService()
