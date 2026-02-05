/**
 * PhotoMind - 导入服务
 *
 * 功能：
 * 1. 协调文件夹扫描和照片导入
 * 2. 过滤重复照片
 * 3. 记录导入状态
 * 4. 支持取消操作
 * 5. 自动生成向量（异步）
 */
import { folderScanner, ScanOptions, ScannedFile } from './folderScanner.js'
import { PhotoDatabase } from '../database/db.js'
import { importProgressService, ImportProgress } from './importProgressService.js'
import { backgroundVectorService, VectorTask } from './backgroundVectorService.js'
import crypto from 'crypto'
import { promises as fs } from 'fs'

export interface ImportOptions {
  copyFiles?: boolean
  moveFiles?: boolean
  createBackup?: boolean
  skipDuplicates?: boolean
  generateThumbnails?: boolean
}

export interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  failed: number
  errors: Array<{ file: string; error: string }>
  duration: number
}

// ImportProgress 已从 importProgressService 导出，这里不再重复定义

export class ImportService {
  private database: PhotoDatabase
  private isImporting = false
  private cancelImport = false

  constructor(database: PhotoDatabase) {
    this.database = database
  }

  /**
   * 设置进度回调（兼容旧接口）
   */
  onProgress(callback: (progress: ImportProgress) => void): () => void {
    return importProgressService.subscribe(callback)
  }

  /**
   * 从文件夹导入照片
   */
  async importFromFolder(
    folderPath: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    if (this.isImporting) {
      throw new Error('导入已在进行中')
    }

    this.isImporting = true
    this.cancelImport = false

    const startTime = Date.now()
    const result: ImportResult = {
      success: true,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      duration: 0
    }

    try {
      // 1. 扫描文件夹
      console.log(`[Import] 开始扫描文件夹: ${folderPath}`)
      importProgressService.setStage('scanning')
      const files = await folderScanner.scanFolder(folderPath)

      if (files.length === 0) {
        console.log('[Import] 未找到支持的照片文件')
        importProgressService.complete(true)
        return result
      }

      console.log(`[Import] 找到 ${files.length} 个文件`)

      // 2. 过滤已存在的照片
      importProgressService.setStage('preparing')
      const toImport = options.skipDuplicates
        ? await this.filterDuplicates(files)
        : files

      console.log(`[Import] 将导入 ${toImport.length} 个文件（${options.skipDuplicates ? `过滤了 ${files.length - toImport.length} 个重复文件` : '不过滤重复'}）`)

      // 3. 开始导入阶段
      importProgressService.startSession(toImport.length, 'importing')

      // 4. 导入照片
      const total = toImport.length

      for (let i = 0; i < toImport.length; i++) {
        if (this.cancelImport) {
          result.success = false
          importProgressService.cancel()
          break
        }

        const file = toImport[i]
        importProgressService.updateCurrentFile(file.filename)

        try {
          // 检查文件是否存在
          try {
            await fs.access(file.path)
          } catch {
            importProgressService.addError(file.path, '文件不存在')
            continue
          }

          // 计算文件哈希
          const fileHash = await this.calculateFileHash(file.path)

          // 检查是否已导入（通过文件路径或哈希）
          const existingPhoto = this.findExistingPhoto(file.path, fileHash)
          if (existingPhoto) {
            importProgressService.advanceProgress(false, true, false)
            console.log(`[Import] 跳过已存在的照片: ${file.filename}`)
            continue
          }

          // 读取文件并保存
          const photoData = {
            uuid: this.generateUUID(),
            fileName: file.filename,
            filePath: file.path,
            fileSize: file.size,
            width: null as number | null,
            height: null as number | null,
            takenAt: file.mtime.toISOString(),
            exif: {},
            location: {},
            status: 'local' as const
          }

          const photoId = this.database.addPhoto(photoData)

          if (photoId > 0) {
            importProgressService.advanceProgress(true, false, false)
            console.log(`[Import] 成功导入: ${file.filename}`)
          } else {
            importProgressService.addError(file.path, '数据库插入失败')
          }
        } catch (error) {
          importProgressService.addError(file.path, error instanceof Error ? error.message : '未知错误')
          console.error(`[Import] 导入文件失败: ${file.path}`, error)
        }
      }

      // 完成
      importProgressService.complete(true)
      return result
    } finally {
      this.isImporting = false
      result.duration = Date.now() - startTime
      console.log(`[Import] 导入完成: 成功 ${result.imported}, 跳过 ${result.skipped}, 失败 ${result.failed}, 耗时 ${result.duration}ms`)
    }
  }

  /**
   * 过滤已存在的照片
   */
  private async filterDuplicates(files: ScannedFile[]): Promise<ScannedFile[]> {
    const existingPhotos = this.database.query('SELECT file_path, file_size FROM photos')
    const existingMap = new Set<string>()

    // 创建已存在文件的映射（路径+大小作为唯一标识）
    for (const photo of existingPhotos) {
      const key = `${photo.file_path}_${photo.file_size}`
      existingMap.add(key)
    }

    // 过滤
    const toImport: ScannedFile[] = []

    for (const file of files) {
      const key = `${file.path}_${file.size}`
      if (!existingMap.has(key)) {
        toImport.push(file)
      }
    }

    return toImport
  }

  /**
   * 查找已存在的照片
   */
  private findExistingPhoto(filePath: string, fileHash: string): any | null {
    const photos = this.database.query(
      'SELECT * FROM photos WHERE file_path = ? OR uuid = ?',
      [filePath, fileHash]
    )
    return photos.length > 0 ? photos[0] : null
  }

  /**
   * 计算文件哈希
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    try {
      const buffer = await fs.readFile(filePath)
      return crypto.createHash('md5').update(buffer).digest('hex')
    } catch {
      return ''
    }
  }

  /**
   * 生成 UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * 取消导入
   */
  cancel(): void {
    this.cancelImport = true
    console.log('[Import] 收到取消信号，将在当前文件处理完成后停止')
  }

  /**
   * 获取是否正在导入
   */
  getIsImporting(): boolean {
    return this.isImporting
  }

  // ==================== 向量生成相关方法 ====================

  /**
   * 导入单张照片并自动生成向量
   * 注意：向量生成是异步的，不会阻塞导入流程
   */
  async importPhotoWithVector(
    filePath: string,
    options: { generateThumbnails?: boolean } = {}
  ): Promise<{ success: boolean; photoUuid?: string; vectorQueued?: boolean }> {
    try {
      // 检查文件是否存在
      try {
        await fs.access(filePath)
      } catch {
        return { success: false }
      }

      // 计算文件哈希
      const fileHash = await this.calculateFileHash(filePath)

      // 检查是否已导入
      const existingPhoto = this.findExistingPhoto(filePath, fileHash)
      if (existingPhoto) {
        console.log(`[Import] 照片已存在: ${filePath}`)
        return { success: true, photoUuid: existingPhoto.uuid, vectorQueued: false }
      }

      // 获取文件信息
      const filename = filePath.split('/').pop() || 'unknown'
      const stats = await fs.stat(filePath)

      // 导入照片
      const photoData = {
        uuid: this.generateUUID(),
        fileName: filename,
        filePath: filePath,
        fileSize: stats.size,
        width: null as number | null,
        height: null as number | null,
        takenAt: stats.mtime.toISOString(),
        exif: {},
        location: {},
        status: 'local' as const
      }

      const photoId = this.database.addPhoto(photoData)

      if (photoId > 0) {
        console.log(`[Import] 照片导入成功: ${photoData.uuid}`)

        // 添加到向量生成队列（异步，不阻塞）
        backgroundVectorService.addPhoto(photoData.uuid)

        return {
          success: true,
          photoUuid: photoData.uuid,
          vectorQueued: true
        }
      }

      return { success: false }
    } catch (error) {
      console.error(`[Import] 导入照片失败: ${filePath}`, error)
      return { success: false }
    }
  }

  /**
   * 批量导入文件夹并为每张照片生成向量
   */
  async importFolderWithVectors(
    folderPath: string,
    options: ImportOptions = {}
  ): Promise<{
    importResult: ImportResult
    vectorTaskId?: string
  }> {
    // 先执行普通导入
    const importResult = await this.importFromFolder(folderPath, options)

    // 如果导入成功，添加所有新照片到向量生成队列
    if (importResult.imported > 0) {
      // 获取刚导入的照片 UUID 列表
      const recentPhotos = this.database.query(
        `SELECT uuid FROM photos WHERE status = 'local' ORDER BY id DESC LIMIT ?`,
        [importResult.imported]
      )

      if (recentPhotos.length > 0) {
        const photoUuids = recentPhotos.map((p: any) => p.uuid)
        const taskId = backgroundVectorService.addGenerateTask(photoUuids)

        console.log(`[Import] 已添加 ${photoUuids.length} 张照片到向量生成队列，任务ID: ${taskId}`)

        return {
          importResult,
          vectorTaskId: taskId
        }
      }
    }

    return { importResult }
  }

  /**
   * 获取当前向量生成状态
   */
  getVectorGenerationStatus(): {
    hasActiveTask: boolean
    currentTask: VectorTask | null
    stats: { pending: number; processing: number; completed: number; failed: number }
  } {
    const currentTask = backgroundVectorService.getCurrentTask()
    return {
      hasActiveTask: currentTask !== null,
      currentTask,
      stats: backgroundVectorService.getStats()
    }
  }

  /**
   * 获取待生成向量的照片数量
   */
  getPendingVectorCount(): number {
    const stats = backgroundVectorService.getStats()
    return stats.pending
  }
}

export const importService = new ImportService(new PhotoDatabase())
