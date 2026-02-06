/**
 * PhotoMind - 渲染进程 Embedding API
 *
 * 功能：
 * 1. 暴露 embedding 服务给主进程调用
 * 2. 通过 executeJavaScript 被主进程调用
 */
import { embeddingService, type EmbeddingResult } from './services/embeddingService.js'

// 暴露全局 API 给主进程调用
window.embeddingAPI = {
  /**
   * 初始化 CLIP 模型
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    console.log('[EmbeddingAPI] 收到初始化请求')
    return await embeddingService.initialize()
  },

  /**
   * 获取模型状态
   */
  getStatus() {
    return embeddingService.getModelStatus()
  },

  /**
   * 文本转向量
   */
  async textToEmbedding(text: string): Promise<EmbeddingResult> {
    return await embeddingService.textToEmbedding(text)
  },

  /**
   * 图片转向量
   */
  async imageToEmbedding(imagePath: string): Promise<EmbeddingResult> {
    return await embeddingService.imageToEmbedding(imagePath)
  },

  /**
   * 批量生成向量（供主进程调用）
   * @param limit 最大处理数量，默认 100
   * @param onProgress 进度回调 (completed, total)
   */
  async batchGenerate(limit: number = 100, onProgress?: (completed: number, total: number) => void): Promise<{
    success: boolean
    processed: number
    failed: number
    errors: string[]
  }> {
    return await embeddingService.batchGenerate(limit, onProgress)
  },

  /**
   * 获取批量生成进度
   */
  getBatchProgress() {
    return embeddingService.getBatchProgress()
  },

  /**
   * 销毁资源
   */
  dispose() {
    embeddingService.dispose()
  }
}

console.log('[EmbeddingAPI] 已注册到 window.embeddingAPI')
