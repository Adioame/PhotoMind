/**
 * PhotoMind - 文件夹扫描服务
 *
 * 功能：
 * 1. 扫描文件夹及其子目录
 * 2. 识别支持的图片格式
 * 3. 估算导入时间
 */
import { promises as fs } from 'fs'
import { join, extname } from 'path'

export interface ScanOptions {
  extensions?: string[]
  recursive?: boolean
  skipHidden?: boolean
}

export interface ScannedFile {
  path: string
  filename: string
  extension: string
  size: number
  mtime: Date
}

export class FolderScanner {
  private supportedExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw',
    '.tiff', '.tif', '.bmp'
  ]

  /**
   * 扫描文件夹
   */
  async scanFolder(
    folderPath: string,
    options: ScanOptions = {}
  ): Promise<ScannedFile[]> {
    const {
      extensions = this.supportedExtensions,
      recursive = true,
      skipHidden = true
    } = options

    // 检查是否是应用程序目录（防止用户误选项目文件夹）
    const appDir = process.cwd()
    if (folderPath === appDir || folderPath.startsWith(appDir + '/')) {
      console.warn(`[FolderScanner] 跳过应用程序目录: ${folderPath}`)
      return []
    }

    const files: ScannedFile[] = []

    await this.scanDirectory(folderPath, '', files, {
      extensions,
      recursive,
      skipHidden
    })

    return files
  }

  /**
   * 递归扫描目录
   */
  private async scanDirectory(
    rootPath: string,
    relativePath: string,
    files: ScannedFile[],
    options: ScanOptions
  ): Promise<void> {
    const fullPath = join(rootPath, relativePath)

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true })

      for (const entry of entries) {
        const entryPath = join(relativePath, entry.name)

        if (entry.isDirectory()) {
          if (options.recursive && !(options.skipHidden && entry.name.startsWith('.'))) {
            await this.scanDirectory(rootPath, entryPath, files, options)
          }
        } else if (entry.isFile()) {
          if (this.shouldIncludeFile(entry.name, options)) {
            const filePath = join(rootPath, entryPath)
            const stats = await fs.stat(filePath)

            files.push({
              path: filePath,
              filename: entry.name,
              extension: extname(entry.name).toLowerCase(),
              size: stats.size,
              mtime: stats.mtime
            })
          }
        }
      }
    } catch (error) {
      console.error(`扫描目录失败: ${fullPath}`, error)
      throw error
    }
  }

  /**
   * 判断是否应该包含该文件
   */
  private shouldIncludeFile(filename: string, options: ScanOptions): boolean {
    const ext = extname(filename).toLowerCase()

    // 必须有扩展名
    if (!ext || ext === filename) {
      return false
    }

    if (options.skipHidden && filename.startsWith('.')) {
      return false
    }

    return options.extensions!.includes(ext)
  }

  /**
   * 估算导入时间（秒）
   */
  async estimateImportTime(files: ScannedFile[]): Promise<number> {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0)
    // 假设平均复制速度 30MB/s
    const estimatedSeconds = totalSize / (30 * 1024 * 1024)
    return Math.ceil(estimatedSeconds)
  }

  /**
   * 获取支持的文件扩展名
   */
  getSupportedExtensions(): string[] {
    return [...this.supportedExtensions]
  }

  /**
   * 检查文件是否是支持的图片格式
   */
  isSupportedFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase()
    return this.supportedExtensions.includes(ext)
  }
}

export const folderScanner = new FolderScanner()
