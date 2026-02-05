/**
 * PhotoMind - 后台向量生成服务
 *
 * 功能：
 * 1. 异步队列处理向量生成
 * 2. 后台任务管理
 * 3. 进度追踪
 */
import { getEmbeddingService } from './embeddingService.js'
import { PhotoDatabase } from '../database/db.js'

interface VectorTask {
  id: string
  photoUuids: string[]
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  total: number
  successCount: number
  failedCount: number
  createdAt: Date
  updatedAt: Date
}

interface VectorTaskResult {
  taskId: string
  successCount: number
  failedCount: number
  errors: Array<{ photoUuid: string; error: string }>
}

export class BackgroundVectorService {
  private queue: Map<string, VectorTask> = new Map()
  private currentTaskId: string | null = null
  private database: PhotoDatabase
  private isProcessing = false

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 添加批量生成任务
   */
  addGenerateTask(photoUuids: string[]): string {
    const taskId = `vector_task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    this.queue.set(taskId, {
      id: taskId,
      photoUuids,
      status: 'pending',
      progress: 0,
      total: photoUuids.length,
      successCount: 0,
      failedCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    // 启动处理
    this.processQueue()

    return taskId
  }

  /**
   * 添加单张照片到向量生成队列
   */
  addPhoto(photoUuid: string): void {
    this.addGenerateTask([photoUuid])
  }

  /**
   * 处理任务队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return

    // 找到待处理的任务
    let pendingTask: VectorTask | null = null
    for (const task of this.queue.values()) {
      if (task.status === 'pending') {
        pendingTask = task
        break
      }
    }

    if (!pendingTask) {
      this.isProcessing = false
      return
    }

    this.isProcessing = true
    pendingTask.status = 'processing'
    pendingTask.updatedAt = new Date()
    this.currentTaskId = pendingTask.id

    const embeddingService = getEmbeddingService()

    // 确保模型已加载
    if (!embeddingService.isLoaded) {
      await embeddingService.initialize()
    }

    console.log(`[BackgroundVector] 开始处理任务 ${pendingTask.id}，共 ${pendingTask.total} 个照片`)

    for (let i = 0; i < pendingTask.photoUuids.length; i++) {
      const photoUuid = pendingTask.photoUuids[i]

      // 检查是否已有向量
      try {
        const hasEmbedding = await this.database.hasEmbedding(photoUuid, 'image')
        if (hasEmbedding) {
          pendingTask.progress++
          pendingTask.successCount++
          pendingTask.updatedAt = new Date()
          continue
        }
      } catch (error) {
        console.error(`[BackgroundVector] 检查向量存在性失败: ${photoUuid}`, error)
      }

      // 获取照片信息
      const photo = this.database.getPhotoByUuid(photoUuid)
      if (!photo || !photo.file_path) {
        pendingTask.progress++
        pendingTask.failedCount++
        pendingTask.updatedAt = new Date()
        continue
      }

      try {
        // 生成向量
        const result = await embeddingService.imageToEmbedding(photo.file_path)

        if (result.success && result.vector) {
          await this.database.saveEmbedding(photoUuid, result.vector, 'image')
          pendingTask.successCount++
          console.log(`[BackgroundVector] 向量生成成功: ${photoUuid}`)
        } else {
          pendingTask.failedCount++
          console.error(`[BackgroundVector] 向量生成失败: ${photoUuid}`, result.error)
        }
      } catch (error) {
        pendingTask.failedCount++
        console.error(`[BackgroundVector] 向量生成异常: ${photoUuid}`, error)
      }

      pendingTask.progress++
      pendingTask.updatedAt = new Date()
    }

    // 标记任务完成
    pendingTask.status = pendingTask.failedCount === pendingTask.total ? 'failed' : 'completed'
    pendingTask.updatedAt = new Date()

    console.log(`[BackgroundVector] 任务 ${pendingTask.id} 完成: 成功 ${pendingTask.successCount}, 失败 ${pendingTask.failedCount}`)

    // 继续处理下一个任务
    this.currentTaskId = null
    this.processQueue()
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): VectorTask | undefined {
    return this.queue.get(taskId)
  }

  /**
   * 获取当前正在处理的任务
   */
  getCurrentTask(): VectorTask | null {
    if (this.currentTaskId) {
      return this.queue.get(this.currentTaskId) || null
    }
    return null
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): VectorTask[] {
    return Array.from(this.queue.values())
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    const task = this.queue.get(taskId)
    if (task && (task.status === 'pending' || task.status === 'processing')) {
      task.status = 'failed'
      task.updatedAt = new Date()
      return true
    }
    return false
  }

  /**
   * 清理已完成的任务
   */
  cleanupCompletedTasks(): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
    for (const [taskId, task] of this.queue.entries()) {
      if (task.status === 'completed' && task.updatedAt.getTime() < oneDayAgo) {
        this.queue.delete(taskId)
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): { pending: number; processing: number; completed: number; failed: number } {
    let pending = 0, processing = 0, completed = 0, failed = 0

    for (const task of this.queue.values()) {
      switch (task.status) {
        case 'pending': pending++; break
        case 'processing': processing++; break
        case 'completed': completed++; break
        case 'failed': failed++; break
      }
    }

    return { pending, processing, completed, failed }
  }
}

export const backgroundVectorService = new BackgroundVectorService()
