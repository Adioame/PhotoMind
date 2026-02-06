/**
 * PhotoMind - 混合架构嵌入服务
 *
 * 功能：
 * 1. 主进程调度 + 渲染进程执行向量生成
 * 2. 通过 IPC 与渲染进程通信
 * 3. 优雅降级支持
 */
import { PhotoDatabase } from '../database/db.js'

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
  rendererAvailable: boolean
}

class HybridEmbeddingService {
  private database: PhotoDatabase | null = null
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map()
  private requestIdCounter = 0
  private _isLoaded = false
  private _loadError: string | null = null
  private _rendererAvailable = false

  constructor(database?: PhotoDatabase) {
    this.database = database || null
    this.setupResponseListeners()
  }

  /**
   * 设置 IPC 响应监听器
   */
  private setupResponseListeners(): void {
    const { ipcMain } = require('electron')

    // 监听渲染进程的初始化响应
    ipcMain.on('embedding:init-response', (event: any, result: { success: boolean; error?: string }) => {
      this._isLoaded = result.success
      this._loadError = result.error || null
      this._rendererAvailable = result.success
      console.log(`[HybridEmbedding] 渲染进程模型初始化: ${result.success ? '成功' : '失败'}`)
    })

    // 监听渲染进程的状态响应
    ipcMain.on('embedding:status-response', (event: any, status: ModelStatus) => {
      this._rendererAvailable = status.loaded
      console.log(`[HybridEmbedding] 渲染进程状态: ${this._rendererAvailable ? '可用' : '不可用'}`)
    })

    // 监听渲染进程的向量生成响应
    ipcMain.on('embedding:generate-response', (event: any, response: { id: string; success: boolean; vector?: EmbeddingVector; error?: string; processingTimeMs: number }) => {
      const pending = this.pendingRequests.get(response.id)
      if (pending) {
        clearTimeout(pending.timeout)
        if (response.success) {
          pending.resolve(response)
        } else {
          pending.reject(new Error(response.error || 'Unknown error'))
        }
        this.pendingRequests.delete(response.id)
      }
    })
  }

  /**
   * 获取模型状态
   */
  getModelStatus(): ModelStatus {
    return {
      loaded: this._isLoaded,
      modelName: 'Xenova/clip-vit-base-patch32',
      loadError: this._loadError,
      rendererAvailable: this._rendererAvailable
    }
  }

  /**
   * 初始化 CLIP 模型（在渲染进程中）
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[HybridEmbedding] 正在初始化 CLIP 模型...')

      // 向渲染进程发送初始化请求
      const { BrowserWindow } = require('electron')
      const windows = BrowserWindow.getAllWindows()

      if (windows.length > 0) {
        windows[0].webContents.send('embedding:init-request')

        // 等待渲染进程响应（最多 5 秒）
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.warn('[HybridEmbedding] 渲染进程初始化超时')
            resolve()
          }, 5000)

          // 监听一次性响应
          const { ipcMain } = require('electron')
          const handler = (event: any, result: { success: boolean; error?: string }) => {
            this._isLoaded = result.success
            this._loadError = result.error || null
            this._rendererAvailable = result.success
            ipcMain.off('embedding:init-response', handler)
            clearTimeout(timeout)
            resolve()
          }
          ipcMain.on('embedding:init-response', handler)
        })
      } else {
        console.warn('[HybridEmbedding] 没有可用的渲染进程窗口')
        this._loadError = 'No renderer window available'
      }

      if (this._isLoaded) {
        console.log('[HybridEmbedding] CLIP 模型初始化成功')
        return { success: true }
      } else {
        console.warn('[HybridEmbedding] CLIP 模型初始化失败或超时')
        return { success: false, error: this._loadError || 'Initialization timeout' }
      }
    } catch (error) {
      this._loadError = error instanceof Error ? error.message : String(error)
      console.error('[HybridEmbedding] 初始化失败:', this._loadError)
      return { success: false, error: this._loadError }
    }
  }

  /**
   * 通过 IPC 请求渲染进程生成向量
   */
  private async requestEmbedding(type: 'image' | 'text', data: string): Promise<EmbeddingResult> {
    const requestId = `emb_${++this.requestIdCounter}_${Date.now()}`

    const { BrowserWindow } = require('electron')
    const windows = BrowserWindow.getAllWindows()

    if (windows.length === 0 || !this._rendererAvailable) {
      // 渲染进程不可用，使用降级方案
      return this.fallbackEmbedding(type, data)
    }

    return new Promise((resolve, reject) => {
      // 设置超时（2 分钟）
      const timeout = setTimeout(() => {
        const pending = this.pendingRequests.get(requestId)
        if (pending) {
          this.pendingRequests.delete(requestId)
          console.warn(`[HybridEmbedding] 请求超时: ${requestId}`)
          // 降级到简单方案
          this.fallbackEmbedding(type, data).then(resolve).catch(reject)
        }
      }, 120000)

      this.pendingRequests.set(requestId, { resolve, reject, timeout })

      // 发送请求到渲染进程
      windows[0].webContents.send('embedding:generate-request', {
        id: requestId,
        type,
        data
      })
    })
  }

  /**
   * 降级方案：当渲染进程不可用时使用
   */
  private async fallbackEmbedding(type: 'image' | 'text', data: string): Promise<EmbeddingResult> {
    console.warn(`[HybridEmbedding] 使用降级方案: ${type}`)

    if (type === 'text') {
      // 文本降级：基于 TF-IDL 的简单向量化
      const words = data.toLowerCase().split(/\s+/)
      const vocabulary = new Map<string, number>()

      for (const word of words) {
        if (word.length > 2) {
          vocabulary.set(word, (vocabulary.get(word) || 0) + 1)
        }
      }

      const dimension = 512 // CLIP 默认维度
      const vector = new Array(dimension).fill(0)

      // 基于词频生成伪向量
      let index = 0
      for (const [word, count] of vocabulary) {
        if (index < dimension) {
          // 使用字符串哈希生成确定性向量
          const hash = this.hashString(word)
          vector[index % dimension] += count * Math.sin(hash)
          vector[(index + 1) % dimension] += count * Math.cos(hash)
        }
        index++
      }

      // 归一化
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
      if (norm > 0) {
        for (let i = 0; i < vector.length; i++) {
          vector[i] /= norm
        }
      }

      return {
        success: true,
        vector: {
          values: vector,
          dimension
        },
        processingTimeMs: 0
      }
    } else {
      // 图片降级：返回零向量
      return {
        success: false,
        error: 'Renderer not available, cannot process images',
        processingTimeMs: 0
      }
    }
  }

  /**
   * 字符串哈希
   */
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash)
  }

  /**
   * 文本转向量
   */
  async textToEmbedding(text: string): Promise<EmbeddingResult> {
    console.log(`[HybridEmbedding] 文本转向量: "${text.substring(0, 50)}..."`)
    return await this.requestEmbedding('text', text)
  }

  /**
   * 图片转向量
   */
  async imageToEmbedding(imagePath: string): Promise<EmbeddingResult> {
    console.log(`[HybridEmbedding] 图片转向量: ${imagePath}`)

    const result = await this.requestEmbedding('image', imagePath)

    // 如果成功，保存到数据库
    if (result.success && result.vector && this.database) {
      try {
        // 从路径提取 UUID
        const photoUuid = this.extractPhotoUuidFromPath(imagePath)
        if (photoUuid) {
          // saveEmbedding 需要 number[]，但 result.vector 是 EmbeddingVector
          const vectorValues = result.vector.values || result.vector
          await this.database.saveEmbedding(photoUuid, vectorValues, 'image')
          console.log(`[HybridEmbedding] 向量已保存: ${photoUuid}`)
        }
      } catch (error) {
        console.error('[HybridEmbedding] 保存向量失败:', error)
      }
    }

    return result
  }

  /**
   * 从文件路径提取照片 UUID
   */
  private extractPhotoUuidFromPath(path: string): string | null {
    const match = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
    return match ? match[1] : null
  }
}

// 单例实例
let embeddingInstance: HybridEmbeddingService | null = null

export function getEmbeddingService(): HybridEmbeddingService {
  if (!embeddingInstance) {
    embeddingInstance = new HybridEmbeddingService()
  }
  return embeddingInstance
}

export { HybridEmbeddingService }
