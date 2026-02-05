/**
 * PhotoMind - 缩略图服务
 *
 * 功能：
 * 1. 从照片生成缩略图
 * 2. 缓存管理
 * 3. 清理过期缓存
 */
import { resolve, join, extname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs'
import crypto from 'crypto'
import sharp from 'sharp'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export interface ThumbnailOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'jpeg' | 'png' | 'webp'
}

export interface ThumbnailResult {
  path: string
  width: number
  height: number
}

export class ThumbnailService {
  private cacheDir: string
  private thumbnailDir: string
  private defaultOptions: ThumbnailOptions

  constructor() {
    this.cacheDir = resolve(__dirname, '../../data/cache')
    this.thumbnailDir = join(this.cacheDir, 'thumbnails')
    this.defaultOptions = {
      width: 300,
      height: 300,
      quality: 80,
      format: 'jpeg'
    }
  }

  /**
   * 初始化缓存目录
   */
  async init(): Promise<void> {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
    }
    if (!existsSync(this.thumbnailDir)) {
      mkdirSync(this.thumbnailDir, { recursive: true })
    }
    console.log('✓ 缩略图服务初始化完成')
  }

  /**
   * 生成缩略图路径
   */
  private getThumbnailPath(filePath: string, options: ThumbnailOptions): string {
    const name = crypto.createHash('md5').update(filePath + JSON.stringify(options)).digest('hex')
    return join(this.thumbnailDir, `${name}.${options.format === 'png' ? 'png' : 'jpg'}`)
  }

  /**
   * 检查缩略图是否存在
   */
  async exists(filePath: string, options?: ThumbnailOptions): Promise<boolean> {
    const thumbnailPath = this.getThumbnailPath(filePath, { ...this.defaultOptions, ...options })
    return existsSync(thumbnailPath)
  }

  /**
   * 生成缩略图
   */
  async generate(filePath: string, options?: ThumbnailOptions): Promise<ThumbnailResult | null> {
    const opts = { ...this.defaultOptions, ...options }
    const thumbnailPath = this.getThumbnailPath(filePath, opts)

    // 如果已存在，直接返回
    if (existsSync(thumbnailPath)) {
      return {
        path: thumbnailPath,
        width: opts.width || 0,
        height: opts.height || 0
      }
    }

    try {
      // 尝试使用 sharp
      if (!sharp) {
        console.warn('sharp 未安装，缩略图功能受限')
        return null
      }

      await sharp(filePath)
        .resize(opts.width, opts.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: opts.quality })
        .toFile(thumbnailPath)

      return {
        path: thumbnailPath,
        width: opts.width || 0,
        height: opts.height || 0
      }
    } catch (error) {
      console.error('生成缩略图失败:', error)
      return null
    }
  }

  /**
   * 批量生成缩略图
   */
  async generateBatch(filePaths: string[], onProgress?: (current: number, total: number) => void): Promise<{
    success: number
    failed: number
  }> {
    let success = 0
    let failed = 0

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i]
      const result = await this.generate(filePath)

      if (result) {
        success++
      } else {
        failed++
      }

      onProgress?.(i + 1, filePaths.length)
    }

    return { success, failed }
  }

  /**
   * 获取缩略图路径（异步）
   */
  async getThumbnailPathAsync(filePath: string): Promise<string> {
    const existsThumb = await this.exists(filePath)
    if (existsThumb) {
      return this.getThumbnailPath(filePath, this.defaultOptions)
    }
    const result = await this.generate(filePath)
    return result?.path || filePath
  }

  /**
   * 清理过期缓存（默认 7 天）
   */
  async cleanCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    if (!existsSync(this.thumbnailDir)) {
      return 0
    }

    const now = Date.now()
    let cleaned = 0

    try {
      const files = readdirSync(this.thumbnailDir)
      for (const file of files) {
        const filePath = join(this.thumbnailDir, file)
        const stats = statSync(filePath)

        if (now - stats.mtimeMs > maxAge) {
          unlinkSync(filePath)
          cleaned++
        }
      }
    } catch (error) {
      console.error('清理缓存失败:', error)
    }

    console.log(`清理了 ${cleaned} 个过期缩略图`)
    return cleaned
  }

  /**
   * 清空所有缓存
   */
  async clearCache(): Promise<number> {
    if (!existsSync(this.thumbnailDir)) {
      return 0
    }

    let count = 0
    try {
      const files = readdirSync(this.thumbnailDir)
      for (const file of files) {
        const filePath = join(this.thumbnailDir, file)
        unlinkSync(filePath)
        count++
      }
    } catch (error) {
      console.error('清空缓存失败:', error)
    }

    console.log(`清空了 ${count} 个缩略图`)
    return count
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { count: number; size: number } {
    if (!existsSync(this.thumbnailDir)) {
      return { count: 0, size: 0 }
    }

    let count = 0
    let size = 0

    try {
      const files = readdirSync(this.thumbnailDir)
      for (const file of files) {
        const filePath = join(this.thumbnailDir, file)
        const stats = statSync(filePath)
        count++
        size += stats.size
      }
    } catch {
      return { count: 0, size: 0 }
    }

    return { count, size }
  }
}

export const thumbnailService = new ThumbnailService()
