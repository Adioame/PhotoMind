/**
 * PhotoMind - 人脸检测队列服务
 *
 * 功能：
 * 1. 管理人脸检测任务队列
 * 2. 控制并发处理数量
 * 3. 支持批量添加任务
 * 4. 提供进度追踪
 * 5. 支持扫描任务持久化（断点续传）
 */
import { FaceDetectionService, FaceDetectionResult, BatchDetectionProgress } from './faceDetectionService.js'
import { PhotoDatabase } from '../database/db.js'
import { ScanJobService, scanJobService } from './scanJobService.js'
import { faceMatchingService } from './faceMatchingService.js'

export interface DetectionTask {
  photoId: string
  uuid: string
  filePath: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
  faces?: number
}

export interface QueueOptions {
  maxConcurrent?: number
  onProgress?: (progress: QueueProgress) => void
  onComplete?: (stats: { total: number; completed: number; failed: number; detectedFaces: number }) => void
  autoStart?: boolean
}

export interface QueueProgress {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
  currentPhoto?: string
  detectedFaces: number
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
}

export class FaceDetectionQueue {
  private service: FaceDetectionService
  private database: PhotoDatabase
  private queue: DetectionTask[] = []
  private processingCount = 0
  private maxConcurrent: number
  private onProgress?: (progress: QueueProgress) => void
  private onComplete?: (stats: { total: number; completed: number; failed: number; detectedFaces: number }) => void
  private isRunning = false
  private abortController: AbortController | null = null
  private hasCompleted = false

  // 🆕 扫描任务持久化相关
  private currentJobId: string | null = null
  private processedCount = 0
  private detectedFacesCount = 0

  constructor(database: PhotoDatabase, options?: QueueOptions) {
    this.service = new FaceDetectionService()
    this.database = database
    this.maxConcurrent = options?.maxConcurrent || 1
    this.onProgress = options?.onProgress
    this.onComplete = options?.onComplete
    this.hasCompleted = false

    // 🚨 启动进度上报定时器（每 500ms 上报一次）
    setInterval(() => {
      this.reportProgress()
    }, 500)
  }

  /**
   * 添加单个检测任务
   */
  async addTask(photoId: string, uuid: string, filePath: string): Promise<void> {
    const task: DetectionTask = {
      photoId,
      uuid,
      filePath,
      status: 'pending'
    }

    this.queue.push(task)
    console.log(`[FaceDetectionQueue] 添加任务: ${photoId} (${this.queue.length} 待处理)`)

    if (!this.isRunning) {
      await this.processQueue()
    }
  }

  /**
   * 批量添加检测任务
   */
  async addBatch(tasks: Array<{ photoId: string; uuid: string; filePath: string }>): Promise<void> {
    for (const task of tasks) {
      await this.addTask(task.photoId, task.uuid, task.filePath)
    }
  }

  /**
   * 从数据库添加未处理的照片
   * @param limit 限制数量
   * @param afterId 可选，只添加id大于此值的照片（用于断点续传）
   */
  async addFromDatabase(limit: number = 100, afterId?: number): Promise<number> {
    const photos = this.database.getUnprocessedPhotos(limit, afterId)

    for (const photo of photos) {
      await this.addTask(
        photo.id.toString(),
        photo.uuid,
        photo.file_path
      )
    }

    console.log(`[FaceDetectionQueue] 从数据库添加 ${photos.length} 个任务${afterId ? ` (afterId: ${afterId})` : ''}`)
    return photos.length
  }

  /**
   * 🆕 从断点续传（恢复扫描）
   * @param lastProcessedId 最后处理的照片ID
   * @param limit 限制数量
   * @returns 添加的任务数
   */
  async resumeFromCheckpoint(lastProcessedId: number, limit: number = 100): Promise<number> {
    console.log(`[FaceDetectionQueue] 从断点续传: lastProcessedId=${lastProcessedId}`)
    return await this.addFromDatabase(limit, lastProcessedId)
  }

  /**
   * 🆕 创建扫描任务（开始新的扫描）
   * @param totalPhotos 总照片数
   */
  startScanJob(totalPhotos: number): string | null {
    if (!scanJobService) {
      console.warn('[FaceDetectionQueue] ScanJobService not available')
      return null
    }

    this.currentJobId = scanJobService.createJob(totalPhotos)
    this.processedCount = 0
    this.detectedFacesCount = 0
    console.log(`[FaceDetectionQueue] Started scan job: ${this.currentJobId}`)
    return this.currentJobId
  }

  /**
   * 🆕 检查是否有未聚类的人脸（已有检测数据但 person_id 为 NULL）
   */
  hasUnclusteredFaces(): boolean {
    const result = this.database.query(`
      SELECT COUNT(*) as count FROM detected_faces WHERE person_id IS NULL
    `)
    return (result[0]?.count || 0) > 0
  }

  /**
   * 🆕 获取未聚类的人脸数量
   */
  getUnclusteredFaceCount(): number {
    const result = this.database.query(`
      SELECT COUNT(*) as count FROM detected_faces WHERE person_id IS NULL
    `)
    return result[0]?.count || 0
  }

  /**
   * 🆕 仅执行聚类（不重新扫描）
   */
  async clusterExistingFaces(): Promise<{
    success: boolean
    matched: number
    personsCreated: number
    message?: string
  }> {
    const unclusteredCount = this.getUnclusteredFaceCount()
    console.log(`[FaceDetectionQueue] 发现 ${unclusteredCount} 个未聚类人脸，开始聚类...`)

    if (unclusteredCount === 0) {
      return { success: true, matched: 0, personsCreated: 0, message: '没有需要聚类的人脸' }
    }

    try {
      const matchResult = await faceMatchingService.autoMatch({
        threshold: 0.45,
        onProgress: (current, total) => {
          console.log(`[FaceMatching] 聚类进度: ${current}/${total}`)
        }
      })

      console.log(`[FaceMatching] 聚类完成: ${matchResult.matched} 张人脸已匹配, 创建 ${matchResult.personsCreated} 位人物`)

      return {
        success: true,
        matched: matchResult.matched,
        personsCreated: matchResult.personsCreated || 0,
        message: matchResult.message
      }
    } catch (error) {
      console.error('[FaceMatching] 聚类失败:', error)
      return {
        success: false,
        matched: 0,
        personsCreated: 0,
        message: error instanceof Error ? error.message : '聚类失败'
      }
    }
  }

  /**
   * 🆕 获取当前扫描任务ID
   */
  getCurrentJobId(): string | null {
    return this.currentJobId
  }

  /**
   * 处理队列 - 🚨 详细诊断版本
   */
  private async processQueue(): Promise<void> {
    // 🚨 第一行日志：确认函数被调用
    console.log(`[Worker] >>> processQueue() ENTER`)
    console.log(`[Worker] isRunning=${this.isRunning}, queue.length=${this.queue.length}`)

    // 诊断：队列中所有任务的状态
    const pendingCount = this.queue.filter(t => t.status === 'pending').length
    const processingCount = this.queue.filter(t => t.status === 'processing').length
    const completedCount = this.queue.filter(t => t.status === 'completed').length
    console.log(`[Worker] 任务统计: pending=${pendingCount}, processing=${processingCount}, completed=${completedCount}`)

    // 🚨 状态加固：如果发现卡住，强制重置
    if (this.isRunning && !this.hasPendingTasks()) {
      console.log('[Worker] 🔧 检测到状态死锁，强制重置 isRunning=false')
      this.isRunning = false
    }

    if (this.isRunning) {
      console.log('[Worker] ⚠️ isRunning=true，退出')
      return
    }

    // 🚨 try...finally 确保状态回滚
    this.isRunning = true
    this.abortController = new AbortController()

    console.log(`[Worker] 🚀 开始处理，共 ${this.queue.length} 张照片`)

    let processed = 0
    const totalCount = this.queue.length

    // 🆕 如果有活跃任务，更新任务状态
    if (this.currentJobId && scanJobService) {
      console.log(`[FaceDetectionQueue] 扫描任务 ${this.currentJobId} 开始处理`)
    }

    try {
      while (this.hasPendingTasks() && !this.abortController.signal.aborted) {
        // 等待有可用的处理槽
        await this.waitForSlot()

        if (this.abortController.signal.aborted) {
          console.log('[Worker] ⚠️ 信号中止')
          break
        }

        // 获取下一个待处理任务
        const task = this.getNextTask()
        if (!task) {
          console.log('[Worker] ⚠️ getNextTask() 返回 null')
          break
        }

        // 🚨 每张照片处理时打印
        console.log(`[Worker] 📸 ${task.photoId} (${processed + 1}/${totalCount})`)

        await this.processTask(task)
        processed++
        this.processedCount++

        // 🆕 更新扫描任务进度（每50张）
        if (this.currentJobId && scanJobService && this.processedCount % 50 === 0) {
          const photoIdNum = parseInt(task.photoId, 10)
          if (!isNaN(photoIdNum)) {
            scanJobService.updateProgress(this.currentJobId, this.processedCount, photoIdNum)
            console.log(`[FaceDetectionQueue] 更新进度: ${this.processedCount}, lastPhotoId: ${photoIdNum}`)
          }
        }

        // 🆕 更新心跳（每张照片）
        if (this.currentJobId && scanJobService) {
          scanJobService.updateHeartbeat(this.currentJobId)
        }
      }

      if (!this.hasPendingTasks()) {
        console.log('[Worker] ✅ 所有任务完成')
      }

    } catch (error) {
      // 🆕 标记任务为失败
      if (this.currentJobId && scanJobService) {
        const errorMsg = error instanceof Error ? error.message : '未知错误'
        scanJobService.failJob(this.currentJobId, errorMsg)
        console.error(`[FaceDetectionQueue] 扫描任务失败: ${errorMsg}`)
      }
      throw error
    } finally {
      // 🚨 关键：无论成功失败，必须重置状态
      this.isRunning = false
      console.log(`[Worker] <<< processQueue() EXIT (processed=${processed}/${totalCount})`)

      // 🆕 完成任务
      if (this.currentJobId && scanJobService) {
        const stats = this.getStats()
        const detectedFaces = this.queue.reduce((sum, t) => sum + (t.faces || 0), 0)

        if (this.abortController?.signal.aborted) {
          // 被取消
          scanJobService.cancelJob(this.currentJobId)
          console.log(`[FaceDetectionQueue] 扫描任务被取消: ${this.currentJobId}`)
        } else if (stats.failed === stats.total && stats.total > 0) {
          // 全部失败
          scanJobService.failJob(this.currentJobId, 'All tasks failed')
          console.log(`[FaceDetectionQueue] 扫描任务失败: ${this.currentJobId}`)
        } else {
          // 完成
          scanJobService.completeJob(this.currentJobId, detectedFaces)
          console.log(`[FaceDetectionQueue] 扫描任务完成: ${this.currentJobId}, 检测到 ${detectedFaces} 张人脸`)

          // 🆕 自动触发人脸聚类
          if (detectedFaces > 0) {
            console.log('[FaceDetectionQueue] 开始自动聚类...')
            const clusterStartTime = Date.now()
            try {
              const matchResult = await faceMatchingService.autoMatch({
                threshold: 0.45,
                onProgress: (current, total) => {
                  console.log(`[FaceMatching] 聚类进度: ${current}/${total}`)
                }
              })
              const clusterDuration = Date.now() - clusterStartTime

              // 🆕 CTO要求的监控指标
              const avgFacesPerPerson = matchResult.personsCreated > 0
                ? matchResult.matched / matchResult.personsCreated
                : 0

              console.log(`[FaceMatching] 聚类完成: ${matchResult.matched} 张人脸已匹配, 创建 ${matchResult.personsCreated} 位人物`)
              console.log(`[Analytics] face_clustering_completed:`, {
                total_faces: detectedFaces,
                matched_faces: matchResult.matched,
                persons_created: matchResult.personsCreated,
                avg_faces_per_person: avgFacesPerPerson.toFixed(2),
                clustering_duration_ms: clusterDuration,
                threshold_used: 0.45
              })

              // 🆕 健康阈值告警（CTO要求）
              if (avgFacesPerPerson > 20) {
                console.warn(`[Analytics] ⚠️ 聚类过于激进: avg_faces_per_person=${avgFacesPerPerson.toFixed(2)} > 20`)
              }
              if (matchResult.personsCreated > 0 && matchResult.matched / detectedFaces < 0.1) {
                console.warn(`[Analytics] ⚠️ 聚类过于保守: match_rate=${(matchResult.matched / detectedFaces).toFixed(2)} < 0.1`)
              }
              if (clusterDuration > 30000) {
                console.warn(`[Analytics] ⚠️ 聚类性能瓶颈: duration=${clusterDuration}ms > 30000ms`)
              }
            } catch (clusterError) {
              console.error('[FaceMatching] 聚类失败:', clusterError)
            }
          }
        }

        this.currentJobId = null
        this.processedCount = 0
      }

      // 🚨 触发完成回调
      if (!this.hasCompleted && this.onComplete) {
        this.hasCompleted = true
        const stats = this.getStats()
        const detectedFaces = this.queue.reduce((sum, t) => sum + (t.faces || 0), 0)
        console.log(`[Worker] 🎉 触发 onComplete: total=${stats.total}, completed=${stats.completed}, failed=${stats.failed}, faces=${detectedFaces}`)
        this.onComplete({
          total: stats.total,
          completed: stats.completed,
          failed: stats.failed,
          detectedFaces
        })
      }
    }
  }

  /**
   * 检查是否有待处理任务
   */
  private hasPendingTasks(): boolean {
    return this.queue.some(t => t.status === 'pending')
  }

  /**
   * 获取下一个待处理任务
   */
  private getNextTask(): DetectionTask | undefined {
    return this.queue.find(t => t.status === 'pending')
  }

  /**
   * 等待有可用的处理槽
   */
  private waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.processingCount < this.maxConcurrent) {
          resolve()
        } else {
          setTimeout(check, 100)
        }
      }
      check()
    })
  }

  /**
   * 处理单个任务
   */
  private async processTask(task: DetectionTask): Promise<void> {
    task.status = 'processing'
    this.processingCount++
    this.reportProgress()

    try {
      console.log(`[FaceDetectionQueue] 处理中: ${task.photoId}`)

      // 验证任务数据
      if (!task.filePath) {
        throw new Error('任务缺少文件路径')
      }
      if (!task.photoId) {
        throw new Error('任务缺少 photoId')
      }

      // 🚨 CTO诊断：检查文件路径和存在性
      const fs = await import('fs')
      console.log(`[DEBUG] 🎯 开始检测: ${task.photoId}`)
      console.log(`[DEBUG] 📁 原始路径: ${task.filePath}`)
      console.log(`[DEBUG] 🔍 路径类型: ${task.filePath?.startsWith('local-resource://') ? '协议URL' : '绝对路径'}`)

      // 转换协议路径为本地路径
      const absolutePath = task.filePath?.startsWith('local-resource://')
        ? task.filePath.replace('local-resource://', '')
        : task.filePath
      console.log(`[DEBUG] 📂 转换后路径: ${absolutePath}`)

      // 检查文件存在性
      const exists = fs.existsSync(absolutePath)
      console.log(`[DEBUG] 📂 文件存在: ${exists}`)

      if (!exists) {
        console.error(`[DEBUG] ❌ 文件不存在，跳过检测: ${absolutePath}`)
        task.status = 'failed'
        task.error = '文件不存在'
        task.faces = 0
        return
      }

      // 执行检测（使用转换后的绝对路径）
      console.log(`[DEBUG] 🤖 调用检测模型...`)
      const result = await this.service.detect(absolutePath)
      console.log(`[DEBUG] ✅ 检测完成: success=${result.success}, detections=${result.detections.length}`)

      // 添加检测结果分析
      if (!result.success) {
        console.error(`[DEBUG] 💥 检测失败: ${result.error}`)
      } else if (result.detections.length === 0) {
        console.warn(`[DEBUG] ⚠️ 检测成功但返回0张人脸 - 可能原因: 模型未加载/图片模糊/无人脸`)
      }

      if (result.success && result.detections.length > 0) {
        // 安全解析 photoId 为数字
        const photoIdNum = parseInt(task.photoId, 10)
        if (isNaN(photoIdNum)) {
          console.warn(`[FaceDetectionQueue] 无效的 photoId: ${task.photoId}`)
          task.status = 'failed'
          task.error = '无效的 photoId'
          return
        }

        // 保存到数据库
        const faces = result.detections.map((detection, index) => ({
          id: `${task.uuid}-face-${index}`,
          bbox_x: detection.box.x,
          bbox_y: detection.box.y,
          bbox_width: detection.box.width,
          bbox_height: detection.box.height,
          confidence: detection.confidence,
          embedding: detection.landmarks ? this.extractEmbedding(detection.landmarks) : undefined,
          face_embedding: detection.descriptor // ✅ 128维人脸特征向量，用于人物匹配
        }))

        this.database.saveDetectedFaces(photoIdNum, faces)
        task.faces = faces.length

        console.log(`[FaceDetectionQueue] 检测到 ${faces.length} 张人脸: ${task.photoId}`)
        console.log(`[DEBUG] 💾 已保存到数据库: ${faces.length} 张人脸, photoId=${photoIdNum}`)
      } else {
        task.faces = 0
        console.log(`[FaceDetectionQueue] 未检测到人脸: ${task.photoId}`)
        console.log(`[DEBUG] ⚠️ 检测结果为空: success=${result.success}, error=${result.error || '无'}`)
      }

      task.status = 'completed'
    } catch (error) {
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : '未知错误'
      console.error(`[FaceDetectionQueue] 处理失败: ${task.photoId}`, error)
    } finally {
      this.processingCount--
      this.reportProgress()
    }
  }

  /**
   * 从地标点提取简化的 embedding
   */
  private extractEmbedding(landmarks: any): number[] {
    // 简化的人脸特征向量
    const embedding: number[] = []

    // 鼻子位置
    if (landmarks.nose && landmarks.nose.length > 0) {
      embedding.push(landmarks.nose[0].x, landmarks.nose[0].y)
    }

    // 眼睛中心
    if (landmarks.leftEye && landmarks.leftEye.length > 0) {
      const leftEyeX = landmarks.leftEye.reduce((sum: number, p: Point) => sum + p.x, 0) / landmarks.leftEye.length
      const leftEyeY = landmarks.leftEye.reduce((sum: number, p: Point) => sum + p.y, 0) / landmarks.leftEye.length
      embedding.push(leftEyeX, leftEyeY)
    }

    if (landmarks.rightEye && landmarks.rightEye.length > 0) {
      const rightEyeX = landmarks.rightEye.reduce((sum: number, p: Point) => sum + p.x, 0) / landmarks.rightEye.length
      const rightEyeY = landmarks.rightEye.reduce((sum: number, p: Point) => sum + p.y, 0) / landmarks.rightEye.length
      embedding.push(rightEyeX, rightEyeY)
    }

    return embedding
  }

  /**
   * 报告进度
   */
  private reportProgress(): void {
    const stats = this.getStats()
    const detectedFaces = this.queue.reduce((sum, t) => sum + (t.faces || 0), 0)
    const isCompleted = !this.isRunning && stats.total > 0 && stats.completed === stats.total

    // 🚨 检测完成状态并触发 onComplete
    if (isCompleted && !this.hasCompleted && this.onComplete) {
      this.hasCompleted = true
      console.log(`[Worker] 🎉 reportProgress 检测到完成，触发 onComplete: total=${stats.total}, completed=${stats.completed}, failed=${stats.failed}, faces=${detectedFaces}`)
      this.onComplete({
        total: stats.total,
        completed: stats.completed,
        failed: stats.failed,
        detectedFaces
      })
    }

    if (!this.onProgress) return

    const progress: QueueProgress = {
      ...stats,
      currentPhoto: this.queue.find(t => t.status === 'processing')?.filePath || undefined,
      detectedFaces,
      status: this.isRunning ? 'running' : isCompleted ? 'completed' : 'idle'
    }

    this.onProgress(progress)
  }

  /**
   * 获取队列统计信息
   */
  getStats(): {
    total: number
    pending: number
    processing: number
    completed: number
    failed: number
  } {
    return {
      total: this.queue.length,
      pending: this.queue.filter(t => t.status === 'pending').length,
      processing: this.queue.filter(t => t.status === 'processing').length,
      completed: this.queue.filter(t => t.status === 'completed').length,
      failed: this.queue.filter(t => t.status === 'failed').length
    }
  }

  /**
   * 获取队列状态（暴露给 IPC）- 🚨 状态诊断专用
   */
  getDetailedStatus(): {
    isRunning: boolean
    queueLength: number
    hasPending: boolean
    processingCount: number
    total: number
    pending: number
    completed: number
    failed: number
  } {
    const stats = this.getStats()
    return {
      isRunning: this.isRunning,
      queueLength: this.queue.length,
      hasPending: this.hasPendingTasks(),
      processingCount: this.processingCount,
      ...stats
    }
  }

  /**
   * 强制重置状态（用于恢复卡住的队列）
   */
  forceReset(): void {
    const wasRunning = this.isRunning
    this.isRunning = false
    this.abortController = null

    console.log(`[FaceDetectionQueue] 强制重置: 之前运行=${wasRunning}, 队列长度=${this.queue.length}`)

    // 不改变任务状态，让它们保持原样等待处理
  }

  /**
   * 强制启动队列（绕过 addTask 自动触发）
   */
  async forceStart(): Promise<void> {
    console.log(`[Worker] === forceStart() ===`)
    console.log(`[Worker] this.isRunning = ${this.isRunning}`)
    console.log(`[Worker] this.queue.length = ${this.queue.length}`)

    const pendingBefore = this.queue.filter(t => t.status === 'pending').length
    console.log(`[Worker] pending before = ${pendingBefore}`)

    if (this.isRunning) {
      console.log('[Worker] ⚠️ isRunning=true，跳过')
      return
    }

    const hasPending = this.hasPendingTasks()
    console.log(`[Worker] hasPendingTasks() = ${hasPending}`)

    if (!hasPending) {
      console.log('[Worker] ⚠️ 没有 pending 任务，跳过')
      return
    }

    console.log('[Worker] 🚀 调用 processQueue()...')
    await this.processQueue()
    console.log('[Worker] === forceStart() 完成 ===')
  }

  /**
   * 取消处理
   */
  cancel(): void {
    this.abortController?.abort()
    this.isRunning = false
    console.log('[FaceDetectionQueue] 取消处理')

    // 🆕 取消扫描任务
    if (this.currentJobId && scanJobService) {
      scanJobService.cancelJob(this.currentJobId)
      console.log(`[FaceDetectionQueue] 扫描任务已取消: ${this.currentJobId}`)
      this.currentJobId = null
    }

    // 重置待处理任务
    for (const task of this.queue) {
      if (task.status === 'pending') {
        task.status = 'pending' // 保持待处理状态
      }
    }
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.cancel()
    this.queue = []
    this.reportProgress()
    console.log('[FaceDetectionQueue] 队列已清空')
  }

  /**
   * 获取所有任务
   */
  getTasks(): DetectionTask[] {
    return [...this.queue]
  }

  /**
   * 获取失败的任务
   */
  getFailedTasks(): DetectionTask[] {
    return this.queue.filter(t => t.status === 'failed')
  }

  /**
   * 重试失败的任务
   */
  async retryFailed(): Promise<void> {
    const failedTasks = this.getFailedTasks()

    for (const task of failedTasks) {
      task.status = 'pending'
      task.error = undefined
    }

    console.log(`[FaceDetectionQueue] 重试 ${failedTasks.length} 个失败任务`)
    await this.processQueue()
  }
}

interface Point {
  x: number
  y: number
}

export const faceDetectionQueue = new FaceDetectionQueue(new PhotoDatabase())
