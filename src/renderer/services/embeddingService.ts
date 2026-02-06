/**
 * PhotoMind - 渲染进程向量生成服务
 *
 * 功能：
 * 1. 在浏览器环境中使用 @xenova/transformers
 * 2. 图片转向量
 * 3. 文本转向量
 * 4. 通过 IPC 与主进程通信
 */
import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'

export interface EmbeddingVector {
  values: number[]
  dimension: number
}

export interface EmbeddingResult {
  success: boolean
  vector?: EmbeddingVector
  error?: string
  processingTimeMs: number
}

export interface ModelStatus {
  loaded: boolean
  modelName: string
  loadError: string | null
}

class EmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null
  private readonly MODEL_NAME = 'Xenova/clip-vit-base-patch32'
  private _isLoaded = false
  private _loadError: string | null = null
  private _loadStartTime = 0
  private _batchProgress = {
    total: 0,
    completed: 0,
    failed: 0,
    currentPhoto: ''
  }

  /**
   * 获取加载状态
   */
  get isLoaded(): boolean {
    return this._isLoaded
  }

  get loadError(): string | null {
    return this._loadError
  }

  get modelName(): string {
    return this.MODEL_NAME
  }

  /**
   * 初始化模型
   * 注意：CLIP 模型只支持 feature-extraction 任务
   * 不支持 zero-shot-classification
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    this._loadStartTime = Date.now()
    this._loadError = null

    try {
      console.log('[RendererEmbedding] 开始加载 CLIP 模型...')

      // 配置环境
      env.allowLocalModels = false
      env.useBrowserCache = true
      env.cacheDir = './model_cache'

      // 添加初始化超时控制
      const initTimeoutMs = 120000 // 2分钟模型加载超时
      const initPromise = pipeline('feature-extraction', this.MODEL_NAME, {
        quantized: true
      }) as Promise<FeatureExtractionPipeline>

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`模型加载超时 (${initTimeoutMs}ms)`)), initTimeoutMs)
      })

      this.extractor = await Promise.race([initPromise, timeoutPromise])

      this._isLoaded = true
      const loadTime = Date.now() - this._loadStartTime
      console.log(`[RendererEmbedding] CLIP 模型加载成功，耗时 ${loadTime}ms`)

      return { success: true }
    } catch (error) {
      this._loadError = error instanceof Error ? error.message : String(error)
      console.error('[RendererEmbedding] 模型加载失败:', this._loadError)
      this._isLoaded = false
      this.extractor = null
      return { success: false, error: this._loadError }
    }
  }

  /**
   * 图片转向量
   */
  async imageToEmbedding(imagePath: string): Promise<EmbeddingResult> {
    const startTime = Date.now()

    if (!this._isLoaded || !this.extractor) {
      return {
        success: false,
        error: '模型未加载',
        processingTimeMs: Date.now() - startTime
      }
    }

    try {
      console.log(`[RendererEmbedding] 生成图片向量: ${imagePath}`)

      // 添加推理超时控制（30秒）
      const inferenceTimeoutMs = 30000
      const inferencePromise = this.extractor(imagePath, {
        pooling: 'mean',
        normalize: true
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('向量生成超时 (30s)')), inferenceTimeoutMs)
      })

      const output = await Promise.race([inferencePromise, timeoutPromise])

      // 转换为普通数组
      const vectorValues = Array.from(output.data) as number[]
      const dimension = vectorValues.length

      console.log(`[RendererEmbedding] 图片向量生成成功: ${dimension} 维`)

      return {
        success: true,
        vector: {
          values: vectorValues,
          dimension
        },
        processingTimeMs: Date.now() - startTime
      }
    } catch (error) {
      console.error('[RendererEmbedding] 图片向量生成失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: Date.now() - startTime
      }
    }
  }

  /**
   * 文本转向量
   */
  async textToEmbedding(text: string): Promise<EmbeddingResult> {
    const startTime = Date.now()

    if (!this._isLoaded || !this.extractor) {
      return {
        success: false,
        error: '模型未加载',
        processingTimeMs: Date.now() - startTime
      }
    }

    try {
      console.log(`[RendererEmbedding] 生成文本向量: "${text.substring(0, 50)}..."`)

      // 使用特征提取管道生成文本向量
      const output = await this.extractor(text, {
        pooling: 'mean',
        normalize: true
      })

      // 转换为普通数组
      const vectorValues = Array.from(output.data) as number[]
      const dimension = vectorValues.length

      console.log(`[RendererEmbedding] 文本向量生成成功: ${dimension} 维`)

      return {
        success: true,
        vector: {
          values: vectorValues,
          dimension
        },
        processingTimeMs: Date.now() - startTime
      }
    } catch (error) {
      console.error('[RendererEmbedding] 文本向量生成失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: Date.now() - startTime
      }
    }
  }

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('向量维度不匹配')
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB)

    if (denominator === 0) {
      return 0
    }

    return dotProduct / denominator
  }

  /**
   * 获取模型状态
   */
  getModelStatus(): ModelStatus {
    return {
      loaded: this._isLoaded,
      modelName: this.MODEL_NAME,
      loadError: this._loadError
    }
  }

  /**
   * 获取批量生成进度
   */
  getBatchProgress() {
    return { ...this._batchProgress }
  }

  /**
   * 批量生成向量
   * 从数据库获取需要处理的照片，逐个生成向量并保存
   */
  async batchGenerate(limit: number = 100, onProgress?: (completed: number, total: number) => void): Promise<{
    success: boolean
    processed: number
    failed: number
    errors: string[]
  }> {
    const errors: string[] = []
    let processed = 0
    let failed = 0

    console.log(`[RendererEmbedding] 开始批量生成向量，限制: ${limit}`)

    // 确保模型已加载
    if (!this._isLoaded) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return {
          success: false,
          processed: 0,
          failed: 0,
          errors: [initResult.error || '模型初始化失败']
        }
      }
    }

    try {
      // 通过 IPC 获取需要处理的照片列表
      const response = await window.photoAPI?.photos.getWithoutEmbeddings(limit)
      const photos = response?.photos || []

      if (photos.length === 0) {
        console.log('[RendererEmbedding] 没有需要处理的照片')
        return { success: true, processed: 0, failed: 0, errors: [] }
      }

      this._batchProgress.total = photos.length
      this._batchProgress.completed = 0
      this._batchProgress.failed = 0

      console.log(`[RendererEmbedding] 开始处理 ${photos.length} 张照片`)

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]
        const filePath = photo.filePath || photo.thumbnailPath

        if (!filePath) {
          errors.push(`照片 ${photo.id || photo.uuid} 缺少文件路径`)
          failed++
          this._batchProgress.failed++
          this._batchProgress.completed++
          onProgress?.(this._batchProgress.completed, this._batchProgress.total)
          continue
        }

        this._batchProgress.currentPhoto = filePath

        try {
          // 生成向量
          const result = await this.imageToEmbedding(filePath)

          if (result.success && result.vector) {
            // 保存到数据库
            const saveResult = await window.photoAPI?.photos.saveEmbedding(
              photo.uuid || photo.id,
              result.vector.values
            )

            if (saveResult?.success) {
              processed++
              console.log(`[RendererEmbedding] [${i + 1}/${photos.length}] 成功: ${filePath}`)
            } else {
              errors.push(`保存失败: ${filePath}`)
              failed++
            }
          } else {
            errors.push(`向量生成失败: ${filePath} - ${result.error}`)
            failed++
          }
        } catch (error) {
          errors.push(`处理异常: ${filePath} - ${error}`)
          failed++
        }

        this._batchProgress.completed++
        onProgress?.(this._batchProgress.completed, this._batchProgress.total)
      }

      console.log(`[Renderer处理Embedding] 批量完成: 成功 ${processed}, 失败 ${failed}`)

      return {
        success: true,
        processed,
        failed,
        errors: errors.slice(0, 10) // 只返回前10个错误
      }
    } catch (error) {
      console.error('[RendererEmbedding] 批量处理异常:', error)
      return {
        success: false,
        processed,
        failed,
        errors: [String(error)]
      }
    } finally {
      this._batchProgress.currentPhoto = ''
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.extractor) {
      this.extractor = null
    }
    this._isLoaded = false
    console.log('[RendererEmbedding] 资源已清理')
  }
}

export const embeddingService = new EmbeddingService()
