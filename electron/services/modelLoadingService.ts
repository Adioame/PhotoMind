/**
 * PhotoMind - 模型加载服务
 *
 * 功能：
 * 1. 并行加载 face-api 和 CLIP 模型
 * 2. 总加载时间 < 10秒
 * 3. 提供模型加载进度指示
 */
import { faceDetectionService } from './faceDetectionService.js'
import { getEmbeddingService } from './hybridEmbeddingService.js'

export interface ModelLoadingProgress {
  faceApi: {
    loaded: boolean
    progress: number // 0-100
  }
  clip: {
    loaded: boolean
    progress: number // 0-100
  }
  overall: number // 0-100
  status: 'idle' | 'loading' | 'completed' | 'error'
  error?: string
}

export interface ModelLoadingResult {
  success: boolean
  faceApiLoaded: boolean
  clipLoaded: boolean
  totalTimeMs: number
  faceApiTimeMs: number
  clipTimeMs: number
  error?: string
}

export type LoadingProgressCallback = (progress: ModelLoadingProgress) => void

class ModelLoadingService {
  private progress: ModelLoadingProgress = {
    faceApi: { loaded: false, progress: 0 },
    clip: { loaded: false, progress: 0 },
    overall: 0,
    status: 'idle'
  }

  private progressCallbacks: LoadingProgressCallback[] = []
  private isLoading = false

  /**
   * 注册进度回调
   */
  onProgress(callback: LoadingProgressCallback): () => void {
    this.progressCallbacks.push(callback)
    return () => {
      const index = this.progressCallbacks.indexOf(callback)
      if (index > -1) {
        this.progressCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * 通知所有回调
   */
  private notifyProgress(): void {
    for (const callback of this.progressCallbacks) {
      try {
        callback({ ...this.progress })
      } catch (e) {
        console.error('[ModelLoading] Progress callback error:', e)
      }
    }
  }

  /**
   * 更新 face-api 进度
   */
  private updateFaceApiProgress(progress: number, loaded: boolean = false): void {
    this.progress.faceApi.progress = Math.min(100, Math.max(0, progress))
    this.progress.faceApi.loaded = loaded
    this.calculateOverallProgress()
    this.notifyProgress()
  }

  /**
   * 更新 CLIP 进度
   */
  private updateClipProgress(progress: number, loaded: boolean = false): void {
    this.progress.clip.progress = Math.min(100, Math.max(0, progress))
    this.progress.clip.loaded = loaded
    this.calculateOverallProgress()
    this.notifyProgress()
  }

  /**
   * 计算总进度
   */
  private calculateOverallProgress(): void {
    this.progress.overall = Math.round(
      (this.progress.faceApi.progress + this.progress.clip.progress) / 2
    )
  }

  /**
   * 并行加载所有模型
   */
  async loadModels(): Promise<ModelLoadingResult> {
    if (this.isLoading) {
      return {
        success: false,
        faceApiLoaded: false,
        clipLoaded: false,
        totalTimeMs: 0,
        faceApiTimeMs: 0,
        clipTimeMs: 0,
        error: 'Models are already loading'
      }
    }

    this.isLoading = true
    this.progress.status = 'loading'
    this.progress.faceApi = { loaded: false, progress: 0 }
    this.progress.clip = { loaded: false, progress: 0 }
    this.progress.overall = 0
    this.progress.error = undefined
    this.notifyProgress()

    const totalStartTime = Date.now()

    try {
      // 并行加载两个模型
      const [faceApiResult, clipResult] = await Promise.all([
        this.loadFaceApiModel(),
        this.loadClipModel()
      ])

      const totalTimeMs = Date.now() - totalStartTime

      this.progress.status = faceApiResult.success && clipResult.success ? 'completed' : 'error'
      this.progress.faceApi.loaded = faceApiResult.success
      this.progress.clip.loaded = clipResult.success

      if (!faceApiResult.success || !clipResult.success) {
        this.progress.error = faceApiResult.error || clipResult.error
      }

      this.notifyProgress()
      this.isLoading = false

      return {
        success: faceApiResult.success && clipResult.success,
        faceApiLoaded: faceApiResult.success,
        clipLoaded: clipResult.success,
        totalTimeMs,
        faceApiTimeMs: faceApiResult.timeMs,
        clipTimeMs: clipResult.timeMs,
        error: faceApiResult.error || clipResult.error
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.progress.status = 'error'
      this.progress.error = errorMessage
      this.notifyProgress()
      this.isLoading = false

      return {
        success: false,
        faceApiLoaded: false,
        clipLoaded: false,
        totalTimeMs: Date.now() - totalStartTime,
        faceApiTimeMs: 0,
        clipTimeMs: 0,
        error: errorMessage
      }
    }
  }

  /**
   * 加载 face-api 模型
   */
  private async loadFaceApiModel(): Promise<{ success: boolean; timeMs: number; error?: string }> {
    const startTime = Date.now()

    try {
      // 模拟进度更新
      this.updateFaceApiProgress(10)
      await this.delay(100)

      this.updateFaceApiProgress(30)
      const result = await faceDetectionService.loadModels()

      const timeMs = Date.now() - startTime

      if (result.success) {
        this.updateFaceApiProgress(100, true)
        return { success: true, timeMs }
      } else {
        this.updateFaceApiProgress(0, false)
        return { success: false, timeMs, error: result.error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.updateFaceApiProgress(0, false)
      return { success: false, timeMs: Date.now() - startTime, error: errorMessage }
    }
  }

  /**
   * 加载 CLIP 模型
   */
  private async loadClipModel(): Promise<{ success: boolean; timeMs: number; error?: string }> {
    const startTime = Date.now()

    try {
      // 模拟进度更新
      this.updateClipProgress(10)

      const embeddingService = getEmbeddingService()

      this.updateClipProgress(40)
      const result = await embeddingService.initialize()

      const timeMs = Date.now() - startTime

      if (result.success) {
        this.updateClipProgress(100, true)
        return { success: true, timeMs }
      } else {
        this.updateClipProgress(0, false)
        return { success: false, timeMs, error: result.error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.updateClipProgress(0, false)
      return { success: false, timeMs: Date.now() - startTime, error: errorMessage }
    }
  }

  /**
   * 获取当前加载状态
   */
  getProgress(): ModelLoadingProgress {
    return { ...this.progress }
  }

  /**
   * 检查是否正在加载
   */
  isLoadingModels(): boolean {
    return this.isLoading
  }

  /**
   * 检查所有模型是否已加载
   */
  areModelsLoaded(): boolean {
    return this.progress.faceApi.loaded && this.progress.clip.loaded
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 重置状态（用于测试）
   */
  reset(): void {
    this.progress = {
      faceApi: { loaded: false, progress: 0 },
      clip: { loaded: false, progress: 0 },
      overall: 0,
      status: 'idle'
    }
    this.isLoading = false
    this.progressCallbacks = []
  }
}

export const modelLoadingService = new ModelLoadingService()
