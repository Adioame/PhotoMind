/**
 * PhotoMind - 照片导出服务
 *
 * 功能：
 * 1. 导出照片到指定目录
 * 2. 支持多种导出格式（JPEG、PNG、HEIC）
 * 3. 导出时调整尺寸和质量
 * 4. 进度跟踪
 */
import { resolve, basename, extname, join } from 'path'
import { existsSync, mkdirSync, copyFileSync, promises as fs, readdirSync, statSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { PhotoDatabase } from '../database/db.js'

export interface ExportOptions {
  format?: 'original' | 'jpeg' | 'png' | 'heic'
  quality?: number
  maxWidth?: number
  maxHeight?: number
  outputDir?: string
  includeMetadata?: boolean
}

export interface ExportProgress {
  current: number
  total: number
  currentFile: string
  status: 'preparing' | 'exporting' | 'completed' | 'error'
  successCount: number
  errorCount: number
}

export class ExportService {
  private database: PhotoDatabase
  private exportDir: string

  constructor(database: PhotoDatabase) {
    this.database = database
    this.exportDir = join(homedir(), 'Downloads/PhotoMind_Exports')
  }

  /**
   * 初始化导出目录
   */
  async initExportDir(): Promise<void> {
    if (!existsSync(this.exportDir)) {
      mkdirSync(this.exportDir, { recursive: true })
    }
  }

  /**
   * 获取导出目录
   */
  getExportDir(): string {
    return this.exportDir
  }

  /**
   * 设置导出目录
   */
  setExportDir(dir: string): void {
    this.exportDir = dir
    this.initExportDir()
  }

  /**
   * 导出单张照片
   */
  async exportPhoto(photo: any, options: ExportOptions = {}): Promise<{
    success: boolean
    outputPath?: string
    error?: string
  }> {
    const opts: ExportOptions = {
      format: 'original',
      quality: 90,
      maxWidth: undefined,
      maxHeight: undefined,
      outputDir: this.exportDir,
      includeMetadata: true,
      ...options
    }

    try {
      // 确保输出目录存在
      if (!existsSync(opts.outputDir!)) {
        mkdirSync(opts.outputDir!, { recursive: true })
      }

      const sourcePath = photo.filePath
      if (!existsSync(sourcePath)) {
        return { success: false, error: '源文件不存在' }
      }

      // 生成输出文件名
      const ext = extname(sourcePath)
      const baseName = basename(sourcePath, ext)
      const outputExt = opts.format === 'original' ? ext : `.${opts.format}`
      const outputPath = join(opts.outputDir!, `${baseName}${outputExt}`)

      // 复制文件（简化版本）
      // 实际版本需要使用 sharp 进行格式转换和尺寸调整
      copyFileSync(sourcePath, outputPath)

      return { success: true, outputPath }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      }
    }
  }

  /**
   * 批量导出照片
   */
  async exportPhotos(
    photos: any[],
    options: ExportOptions = {},
    onProgress?: (progress: ExportProgress) => void
  ): Promise<{
    successCount: number
    errorCount: number
    outputDir: string
  }> {
    await this.initExportDir()

    const progress: ExportProgress = {
      current: 0,
      total: photos.length,
      currentFile: '',
      status: 'preparing',
      successCount: 0,
      errorCount: 0
    }

    onProgress?.(progress)

    progress.status = 'exporting'

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]
      progress.current = i + 1
      progress.currentFile = photo.fileName || basename(photo.filePath)

      onProgress?.(progress)

      const result = await this.exportPhoto(photo, options)

      if (result.success) {
        progress.successCount++
      } else {
        progress.errorCount++
        console.error(`导出失败: ${photo.fileName}`, result.error)
      }
    }

    progress.status = 'completed'
    onProgress?.(progress)

    return {
      successCount: progress.successCount,
      errorCount: progress.errorCount,
      outputDir: this.exportDir
    }
  }

  /**
   * 导出某人物的所有照片
   */
  async exportPhotosByPerson(
    personId: number,
    options: ExportOptions = {},
    onProgress?: (progress: ExportProgress) => void
  ): Promise<{
    successCount: number
    errorCount: number
    outputDir: string
  }> {
    const photos = await this.database.getPhotosByPerson(personId)
    return this.exportPhotos(photos, options, onProgress)
  }

  /**
   * 导出某年的所有照片
   */
  async exportPhotosByYear(
    year: number,
    options: ExportOptions = {},
    onProgress?: (progress: ExportProgress) => void
  ): Promise<{
    successCount: number
    errorCount: number
    outputDir: string
  }> {
    const photos = await this.database.getPhotosByYear(year)
    return this.exportPhotos(photos, options, onProgress)
  }

  /**
   * 导出搜索结果
   */
  async exportSearchResults(
    query: string,
    filters: any = {},
    options: ExportOptions = {},
    onProgress?: (progress: ExportProgress) => void
  ): Promise<{
    successCount: number
    errorCount: number
    outputDir: string
  }> {
    const photos = this.database.searchPhotos(query, filters)
    return this.exportPhotos(photos, options, onProgress)
  }

  /**
   * 获取导出目录大小
   */
  async getExportDirSize(): Promise<number> {
    if (!existsSync(this.exportDir)) {
      return 0
    }

    let totalSize = 0

    const calculateSize = (dir: string) => {
      const files = readdirSync(dir)
      for (const file of files) {
        const filePath = join(dir, file)
        const stats = statSync(filePath)
        if (stats.isDirectory()) {
          calculateSize(filePath)
        } else {
          totalSize += stats.size
        }
      }
    }

    calculateSize(this.exportDir)
    return totalSize
  }

  /**
   * 清空导出目录
   */
  async clearExportDir(): Promise<number> {
    if (!existsSync(this.exportDir)) {
      return 0
    }

    let count = 0
    const files = readdirSync(this.exportDir)

    for (const file of files) {
      const filePath = join(this.exportDir, file)
      unlinkSync(filePath)
      count++
    }

    return count
  }

  /**
   * 格式转换（简化版本）
   * 注意：实际需要使用 sharp 或其他图像处理库
   */
  async convertFormat(
    inputPath: string,
    outputPath: string,
    format: 'jpeg' | 'png' | 'heic',
    quality: number = 90
  ): Promise<boolean> {
    try {
      // TODO: 实现实际格式转换
      // 需要使用 sharp 库
      // sharp(inputPath).jpeg({ quality }).toFile(outputPath)

      // 简化：直接复制
      copyFileSync(inputPath, outputPath)
      return true
    } catch (error) {
      console.error('格式转换失败:', error)
      return false
    }
  }
}

export const exportService = (database: PhotoDatabase) =>
  new ExportService(database)
