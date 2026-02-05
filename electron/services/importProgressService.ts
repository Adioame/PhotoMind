/**
 * PhotoMind - 导入进度服务
 *
 * 功能：
 * 1. 实时跟踪导入进度
 * 2. 多阶段进度管理
 * 3. 预计剩余时间计算
 * 4. 多监听器支持
 */
import { EventEmitter } from 'events'

export type ImportStage = 'scanning' | 'preparing' | 'importing' | 'metadata' | 'thumbnails' | 'complete' | 'cancelled'

export interface ImportProgress {
  stage: ImportStage
  currentFile?: string
  currentIndex: number
  total: number
  imported: number
  skipped: number
  failed: number
  errors: Array<{ file: string; error: string }>
  startTime: number
  estimatedTimeRemaining?: number
  bytesProcessed?: number
  totalBytes?: number
}

export interface ProgressListener {
  (progress: ImportProgress): void
}

export class ImportProgressService extends EventEmitter {
  private currentProgress: ImportProgress | null = null
  private progressInterval: NodeJS.Timeout | null = null
  private progressListeners: Set<ProgressListener> = new Set()
  private lastUpdateTime: number = 0

  constructor() {
    super()
  }

  /**
   * 订阅进度更新
   */
  subscribe(listener: ProgressListener): () => void {
    this.progressListeners.add(listener)
    return () => this.progressListeners.delete(listener)
  }

  /**
   * 通知所有监听器
   */
  private notify(): void {
    if (!this.currentProgress) return

    // 限制更新频率（每秒最多 2 次）
    const now = Date.now()
    if (now - this.lastUpdateTime < 500 && this.currentProgress.stage !== 'complete') {
      return
    }
    this.lastUpdateTime = now

    for (const listener of this.progressListeners) {
      try {
        listener({ ...this.currentProgress })
      } catch (error) {
        console.error('[ImportProgress] 监听器错误:', error)
      }
    }
  }

  /**
   * 开始新的导入会话
   */
  startSession(total: number, stage: ImportStage = 'preparing'): void {
    this.currentProgress = {
      stage,
      currentIndex: 0,
      total,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      startTime: Date.now()
    }

    // 启动定期进度更新
    this.startProgressTimer()
    this.notify()
  }

  /**
   * 启动进度定时器
   */
  private startProgressTimer(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
    }

    this.progressInterval = setInterval(() => {
      this.updateEstimatedTime()
      this.notify()
    }, 1000)
  }

  /**
   * 更新阶段
   */
  setStage(stage: ImportStage): void {
    if (this.currentProgress) {
      this.currentProgress.stage = stage
      this.notify()
    }
  }

  /**
   * 更新当前文件
   */
  updateCurrentFile(file: string): void {
    if (this.currentProgress) {
      this.currentProgress.currentFile = file
      this.notify()
    }
  }

  /**
   * 更新进度（每处理一个文件后调用）
   */
  advanceProgress(
    imported: boolean = true,
    skipped: boolean = false,
    failed: boolean = false
  ): void {
    if (!this.currentProgress) return

    this.currentProgress.currentIndex++

    if (imported) this.currentProgress.imported++
    if (skipped) this.currentProgress.skipped++
    if (failed) this.currentProgress.failed++

    this.updateEstimatedTime()
    this.notify()
  }

  /**
   * 添加错误
   */
  addError(file: string, error: string): void {
    if (this.currentProgress) {
      // 只保留前 20 个错误
      if (this.currentProgress.errors.length < 20) {
        this.currentProgress.errors.push({ file, error })
      } else if (this.currentProgress.errors.length === 20) {
        this.currentProgress.errors.push({ file, error: '更多错误已省略...' })
      }
      this.currentProgress.failed++
      this.notify()
    }
  }

  /**
   * 计算预计剩余时间
   */
  private updateEstimatedTime(): void {
    if (!this.currentProgress || this.currentProgress.currentIndex === 0) {
      return
    }

    const elapsed = Date.now() - this.currentProgress.startTime
    const avgTimePerFile = elapsed / this.currentProgress.currentIndex
    const remaining = (this.currentProgress.total - this.currentProgress.currentIndex) * avgTimePerFile

    this.currentProgress.estimatedTimeRemaining = Math.ceil(remaining / 1000)
  }

  /**
   * 设置字节进度
   */
  setBytesProgress(bytesProcessed: number, totalBytes: number): void {
    if (this.currentProgress) {
      this.currentProgress.bytesProcessed = bytesProcessed
      this.currentProgress.totalBytes = totalBytes
      this.notify()
    }
  }

  /**
   * 完成导入
   */
  complete(success: boolean = true): ImportProgress | null {
    if (!this.currentProgress) return null

    this.currentProgress.stage = success ? 'complete' : 'cancelled'
    this.currentProgress.estimatedTimeRemaining = 0
    this.stop()

    const result = { ...this.currentProgress }
    this.notify()
    return result
  }

  /**
   * 取消导入
   */
  cancel(): void {
    if (this.currentProgress) {
      this.currentProgress.stage = 'cancelled'
      this.stop()
      this.notify()
    }
  }

  /**
   * 停止进度追踪
   */
  private stop(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
      this.progressInterval = null
    }
  }

  /**
   * 获取当前进度
   */
  getProgress(): ImportProgress | null {
    return this.currentProgress ? { ...this.currentProgress } : null
  }

  /**
   * 获取进度百分比
   */
  getPercentage(): number {
    if (!this.currentProgress || this.currentProgress.total === 0) return 0
    return Math.round((this.currentProgress.currentIndex / this.currentProgress.total) * 100)
  }

  /**
   * 检查是否正在导入
   */
  isActive(): boolean {
    return this.currentProgress !== null &&
           this.currentProgress.stage !== 'complete' &&
           this.currentProgress.stage !== 'cancelled'
  }

  /**
   * 格式化时间（秒）为可读字符串
   */
  static formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}秒`
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${minutes}分${secs}秒`
    } else {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return `${hours}小时${minutes}分`
    }
  }

  /**
   * 格式化文件大小
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

export const importProgressService = new ImportProgressService()
