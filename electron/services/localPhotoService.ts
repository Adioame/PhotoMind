/**
 * PhotoMind - 本地照片导入服务
 *
 * 功能：
 * 1. 选择本地文件夹
 * 2. 扫描照片文件 (jpg, png, heic, webp, etc.)
 * 3. 提取 EXIF/元数据
 * 4. 生成缩略图
 * 5. 存入数据库
 */
import { PhotoDatabase } from '../database/db.js'
import { thumbnailService, type ThumbnailService } from './thumbnailService.js'
import { readdirSync, statSync, existsSync, promises as fs } from 'fs'
import { resolve, extname, join, basename } from 'path'
import { v4 as uuidv4 } from 'uuid'

// 照片文件扩展名
const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif', '.tiff', '.tif', '.JPG', '.JPEG', '.PNG', '.HEIC', '.WEBP', '.GIF', '.TIFF', '.TIF']

// 支持的 RAW 格式
const RAW_EXTENSIONS = ['.raw', '.cr2', '.nef', '.arw', '.dng']

export interface PhotoMetadata {
  id?: number
  uuid: string
  fileName: string
  filePath: string
  fileSize: number
  width?: number
  height?: number
  takenAt?: string
  exif?: {
    camera?: string
    lens?: string
    iso?: number
    aperture?: number
    shutterSpeed?: string
    focalLength?: number
    fNumber?: number
  }
  location?: {
    name?: string
    latitude?: number
    longitude?: number
    altitude?: number
  }
  thumbnailPath?: string | null
  status: 'local'
}

export interface LocalImportProgress {
  current: number
  total: number
  currentFile: string
  status: 'scanning' | 'importing' | 'completed' | 'error'
  importedCount: number
  errorCount: number
  skippedCount: number
}

export interface ExtendedPhotoMetadata {
  // 基本信息
  make?: string           // 相机厂商
  model?: string          // 相机型号
  lensModel?: string      // 镜头型号

  // 日期时间
  dateTimeOriginal?: Date // 拍摄时间
  createDate?: Date      // 创建时间
  modifyDate?: Date       // 修改时间

  // 位置信息
  latitude?: number       // 纬度
  longitude?: number     // 经度
  altitude?: number       // 海拔
  gpsTimestamp?: Date    // GPS 时间戳

  // 相机设置
  fNumber?: number       // 光圈值
  exposureTime?: number  // 快门速度
  iso?: number           // ISO
  focalLength?: number   // 焦距
  focalLength35mm?: number // 35mm 等效焦距

  // 图像信息
  width?: number         // 宽度
  height?: number        // 高度
  orientation?: number   // 方向

  // 额外信息
  title?: string         // 标题
  description?: string   // 描述
  copyright?: string     // 版权
  artist?: string        // 作者
}

export class LocalPhotoService {
  private database: PhotoDatabase
  private thumbnailService: ThumbnailService
  private importCallback: ((progress: LocalImportProgress) => void) | null = null

  constructor(database: PhotoDatabase, thumbnailSvc?: ThumbnailService) {
    this.database = database
    this.thumbnailService = thumbnailSvc || thumbnailService
  }

  /**
   * 设置进度回调
   */
  onProgress(callback: (progress: LocalImportProgress) => void): void {
    this.importCallback = callback
  }

  /**
   * 通知进度更新
   */
  private updateProgress(progress: Partial<LocalImportProgress>): void {
    if (this.importCallback) {
      this.importCallback({
        current: 0,
        total: 0,
        currentFile: '',
        status: 'scanning',
        importedCount: 0,
        errorCount: 0,
        skippedCount: 0,
        ...progress
      })
    }
  }

  /**
   * 扫描文件夹中的照片
   */
  async scanFolder(folderPath: string): Promise<string[]> {
    const photos: string[] = []

    if (!existsSync(folderPath)) {
      throw new Error(`文件夹不存在: ${folderPath}`)
    }

    // 检查是否是应用程序目录（防止用户误选项目文件夹）
    const appDir = process.cwd()
    const userHome = process.env.HOME || process.env.USERPROFILE || ''
    if (folderPath === appDir || folderPath.startsWith(appDir + '/')) {
      console.warn(`[LocalPhotoService] 跳过应用程序目录: ${folderPath}`)
      return []
    }

    const scanDirectory = (dir: string): void => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = join(dir, entry.name)

          if (entry.isDirectory()) {
            // 跳过隐藏文件夹和系统文件夹
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              scanDirectory(fullPath)
            }
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase()
            // 只接受图片文件（带扩展名检查）
            if (PHOTO_EXTENSIONS.includes(ext) && entry.name.split('.').length > 1) {
              photos.push(fullPath)
            }
          }
        }
      } catch (error) {
        console.error(`扫描文件夹失败: ${dir}`, error)
      }
    }

    scanDirectory(folderPath)
    return photos.sort()
  }

  /**
   * 提取照片元数据
   * 支持 EXIF、GPS、相机信息等
   */
  async extractMetadata(filePath: string): Promise<PhotoMetadata> {
    const stats = statSync(filePath)
    const fileName = basename(filePath)
    const ext = extname(filePath).toLowerCase()

    const metadata: PhotoMetadata = {
      uuid: uuidv4(),
      fileName,
      filePath,
      fileSize: stats.size,
      status: 'local'
    }

    // RAW 格式只使用文件信息
    if (RAW_EXTENSIONS.includes(ext)) {
      metadata.takenAt = stats.mtime.toISOString()
      return metadata
    }

    // 尝试提取 EXIF 数据
    try {
      const exifData = await this.extractEXIFData(filePath, ext)

      if (exifData) {
        // 基本信息
        if (exifData.Make || exifData.Model) {
          metadata.exif = {
            camera: `${exifData.Make || ''} ${exifData.Model || ''}`.trim(),
            iso: exifData.ISO || exifData.ISO200 || undefined,
            aperture: exifData.FNumber,
            shutterSpeed: exifData.ExposureTime ? this.formatShutterSpeed(exifData.ExposureTime) : undefined,
            focalLength: exifData.FocalLength,
            fNumber: exifData.FNumber
          }
        }

        // 日期时间
        metadata.takenAt = exifData.DateTimeOriginal?.toISOString() ||
                          exifData.CreateDate?.toISOString() ||
                          stats.mtime.toISOString()

        // 图像尺寸
        if (exifData.ImageWidth || exifData.ExifImageWidth) {
          metadata.width = exifData.ImageWidth || exifData.ExifImageWidth
        }
        if (exifData.ImageHeight || exifData.ExifImageHeight) {
          metadata.height = exifData.ImageHeight || exifData.ExifImageHeight
        }

        // GPS 位置
        if (exifData.latitude && exifData.longitude) {
          metadata.location = {
            latitude: exifData.latitude,
            longitude: exifData.longitude,
            altitude: exifData.GPSAltitude
          }
        }
      } else {
        metadata.takenAt = stats.mtime.toISOString()
      }
    } catch (error) {
      console.warn(`提取元数据失败: ${filePath}`, error)
      metadata.takenAt = stats.mtime.toISOString()
    }

    return metadata
  }

  /**
   * 提取 EXIF 数据（增强版）
   */
  private async extractEXIFData(filePath: string, ext: string): Promise<any | null> {
    try {
      const buffer = await fs.readFile(filePath)

      // JPEG: 检查 JPEG 标记 (0xFF 0xD8)
      if (ext === '.jpg' || ext === '.jpeg') {
        if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
          return null
        }
        return this.parseJPEGEXIF(buffer)
      }

      // PNG: 检查 PNG 签名
      if (ext === '.png') {
        const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        if (!buffer.slice(0, 8).equals(pngSignature)) {
          return null
        }
        return this.parsePNGEXIF(buffer)
      }

      // HEIC: 需要专门库支持
      if (ext === '.heic' || ext === '.heif') {
        console.warn('HEIC 格式需要专门库支持')
        return null
      }

      return null
    } catch (error) {
      return null
    }
  }

  /**
   * 解析 JPEG EXIF 数据
   */
  private parseJPEGEXIF(buffer: Buffer): any {
    const result: any = {}

    let offset = 2 // 跳过 JPEG 签名

    while (offset < buffer.length - 1) {
      // 查找 APP1 段 (0xFF 0xE1)
      if (buffer[offset] === 0xFF && buffer[offset + 1] === 0xE1) {
        // 获取段长度
        const segmentLength = (buffer[offset + 2] << 8) | buffer[offset + 3]

        // 检查是否是 EXIF
        const exifHeader = buffer.toString('latin1', offset + 4, offset + 10)
        if (exifHeader === 'Exif\x00\x00') {
          // 解析 TIFF 头
          const tiffOffset = offset + 10
          const byteOrder = buffer.readUInt16BE(tiffOffset)

          let ifdOffset: number
          if (byteOrder === 0x4949) {
            // Little endian
            ifdOffset = tiffOffset + buffer.readUInt32LE(tiffOffset + 4)
          } else {
            // Big endian
            ifdOffset = tiffOffset + buffer.readUInt32BE(tiffOffset + 4)
          }

          this.parseEXIFIFD(buffer, ifdOffset, byteOrder, result)
          break
        }

        offset += segmentLength + 2
      } else if (buffer[offset] === 0xFF && buffer[offset + 1] !== 0x00) {
        // 跳过其他段
        const segmentLength = (buffer[offset + 2] << 8) | buffer[offset + 3]
        offset += segmentLength + 2
      } else {
        offset++
      }
    }

    return result
  }

  /**
   * 解析 EXIF IFD
   */
  private parseEXIFIFD(buffer: Buffer, offset: number, byteOrder: number, result: any): void {
    try {
      const numEntries = byteOrder === 0x4949
        ? buffer.readUInt16LE(offset)
        : buffer.readUInt16BE(offset)

      for (let i = 0; i < numEntries; i++) {
        const entryOffset = offset + 2 + (i * 12)
        const tag = byteOrder === 0x4949
          ? buffer.readUInt16LE(entryOffset)
          : buffer.readUInt16BE(entryOffset)

        const type = byteOrder === 0x4949
          ? buffer.readUInt16LE(entryOffset + 2)
          : buffer.readUInt16BE(entryOffset + 2)

        const count = byteOrder === 0x4949
          ? buffer.readUInt32LE(entryOffset + 4)
          : buffer.readUInt32BE(entryOffset + 4)

        const value = this.readEXIFValue(buffer, entryOffset, type, count, byteOrder, result)

        // 映射常用标签
        this.mapEXIFTag(tag, value, result)
      }
    } catch (error) {
      console.warn('解析 EXIF IFD 失败:', error)
    }
  }

  /**
   * 映射 EXIF 标签到结果
   */
  private mapEXIFTag(tag: number, value: any, result: any): void {
    const tagMap: Record<number, string> = {
      0x010F: 'Make',           // 相机厂商
      0x0110: 'Model',         // 相机型号
      0x011A: 'XResolution',
      0x011B: 'YResolution',
      0x0128: 'ResolutionUnit',
      0x0131: 'Software',
      0x0132: 'DateTime',
      0x013B: 'Artist',
      0x8298: 'Copyright',
      0x8769: 'ExifIFDPointer',
      0x8825: 'GPSInfoIFDPointer',
    }

    const exifTagMap: Record<number, string> = {
      0x829A: 'ExposureTime',   // 快门速度
      0x829D: 'FNumber',       // 光圈
      0x8827: 'ISO',           // ISO
      0x9000: 'ExifVersion',
      0x9003: 'DateTimeOriginal',
      0x9004: 'DateTimeDigitized',
      0x9201: 'ShutterSpeedValue',
      0x9202: 'ApertureValue',
      0x9204: 'ExposureBiasValue',
      0x9207: 'MeteringMode',
      0x9208: 'LightSource',
      0x9209: 'Flash',
      0x920A: 'FocalLength',
      0xA001: 'ColorSpace',
      0xA002: 'PixelXDimension',
      0xA003: 'PixelYDimension',
      0xA402: 'ExposureMode',
      0xA403: 'WhiteBalance',
      0xA406: 'SceneCaptureType',
      0x0000: 'GPSVersionID',
      0x0001: 'GPSLatitudeRef',
      0x0002: 'GPSLatitude',
      0x0003: 'GPSLongitudeRef',
      0x0004: 'GPSLongitude',
      0x0005: 'GPSAltitudeRef',
      0x0006: 'GPSAltitude',
    }

    const gpsTagMap: Record<number, string> = {
      0x0000: 'GPSVersionID',
      0x0001: 'GPSLatitudeRef',
      0x0002: 'GPSLatitude',
      0x0003: 'GPSLongitudeRef',
      0x0004: 'GPSLongitude',
      0x0005: 'GPSAltitudeRef',
      0x0006: 'GPSAltitude',
      0x0007: 'GPSTimeStamp',
      0x001D: 'GPSDateStamp',
    }

    if (tagMap[tag]) {
      result[tagMap[tag]] = value
    }
  }

  /**
   * 读取 EXIF 值
   */
  private readEXIFValue(
    buffer: Buffer,
    entryOffset: number,
    type: number,
    count: number,
    byteOrder: number,
    result: any
  ): any {
    const typeSizes: Record<number, number> = {
      1: 1,   // BYTE
      2: 1,   // ASCII
      3: 2,   // SHORT
      4: 4,   // LONG
      5: 8,   // RATIONAL
      6: 1,   // SBYTE
      7: 1,   // UNDEFINED
      8: 2,   // SSHORT
      9: 4,   // SLONG
      10: 8,  // SRATIONAL
    }

    try {
      const typeSize = typeSizes[type] || 1
      const valueSize = typeSize * count

      let valueOffset = entryOffset + 8
      if (valueSize > 4) {
        valueOffset = byteOrder === 0x4949
          ? buffer.readUInt32LE(entryOffset + 8)
          : buffer.readUInt32BE(entryOffset + 8)
      }

      switch (type) {
        case 2: // ASCII
          return buffer.toString('utf8', valueOffset, valueOffset + count - 1).replace(/\0+$/, '')
        case 3: // SHORT
          return count === 1
            ? (byteOrder === 0x4949 ? buffer.readUInt16LE(valueOffset) : buffer.readUInt16BE(valueOffset))
            : undefined
        case 4: // LONG
          return count === 1
            ? (byteOrder === 0x4949 ? buffer.readUInt32LE(valueOffset) : buffer.readUInt32BE(valueOffset))
            : undefined
        case 5: // RATIONAL
          if (count === 1) {
            const num = byteOrder === 0x4949 ? buffer.readUInt32LE(valueOffset) : buffer.readUInt32BE(valueOffset)
            const den = byteOrder === 0x4949 ? buffer.readUInt32LE(valueOffset + 4) : buffer.readUInt32BE(valueOffset + 4)
            return den ? num / den : 0
          }
          return undefined
        default:
          return undefined
      }
    } catch {
      return undefined
    }
  }

  /**
   * 解析 PNG 元数据
   */
  private parsePNGEXIF(buffer: Buffer): any {
    // PNG 不使用 EXIF，使用文本块
    const result: any = {}
    let offset = 8 // 跳过 PNG 签名

    while (offset < buffer.length - 8) {
      const length = buffer.readUInt32BE(offset)
      const chunkType = buffer.toString('ascii', offset + 4, offset + 8)

      if (chunkType === 'tEXt' || chunkType === 'iTXt' || chunkType === 'zTXt') {
        const data = buffer.slice(offset + 8, offset + 8 + length)
        const nullIndex = data.indexOf(0)
        if (nullIndex > 0) {
          const keyword = data.slice(0, nullIndex).toString('ascii')
          const text = data.slice(nullIndex + 1).toString('utf8')

          if (keyword === 'Description') result.Description = text
          if (keyword === 'Title') result.Title = text
          if (keyword === 'Author') result.Artist = text
          if (keyword === 'Copyright') result.Copyright = text
          if (keyword === 'DateTime') result.DateTime = text
        }
      }

      if (chunkType === 'IEND') break
      offset += length + 12
    }

    return result
  }

  /**
   * 格式化快门速度
   */
  private formatShutterSpeed(seconds: number): string {
    if (seconds >= 1) {
      return `${seconds}s`
    }
    const denominator = Math.round(1 / seconds)
    return `1/${denominator}`
  }

  /**
   * 导入文件夹中的所有照片
   */
  async importFolder(folderPath: string): Promise<{
    imported: number
    skipped: number
    errors: number
    photos: PhotoMetadata[]
  }> {
    let importedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const importedPhotos: PhotoMetadata[] = []

    this.updateProgress({
      status: 'scanning',
      total: 0
    })

    try {
      // 1. 扫描照片
      const photos = await this.scanFolder(folderPath)

      this.updateProgress({
        status: 'importing',
        total: photos.length,
        current: 0,
        importedCount: 0,
        errorCount: 0,
        skippedCount: 0
      })

      console.log(`找到 ${photos.length} 张照片`)

      // 2. 逐个处理照片
      for (let i = 0; i < photos.length; i++) {
        const filePath = photos[i]

        this.updateProgress({
          current: i + 1,
          total: photos.length,
          currentFile: basename(filePath),
          importedCount,
          errorCount,
          skippedCount
        })

        try {
          // 提取元数据
          const metadata = await this.extractMetadata(filePath)

          // 检查文件是否已存在（通过 filePath 判断）
          const existingPhoto = this.database.getPhotoByFilePath(filePath)
          if (existingPhoto) {
            console.log(`[LocalPhotoService] 文件已存在，跳过: ${basename(filePath)}`)
            skippedCount++
            this.updateProgress({
              current: i + 1,
              total: photos.length,
              currentFile: basename(filePath),
              importedCount,
              errorCount,
              skippedCount
            })
            continue
          }

          // 生成缩略图
          let thumbnailPath: string | null = null
          try {
            const thumbnailResult = await this.thumbnailService.generate(filePath)
            if (thumbnailResult) {
              thumbnailPath = thumbnailResult.path
              console.log(`[LocalPhotoService] 缩略图生成成功: ${basename(filePath)}`)
            }
          } catch (thumbError) {
            console.warn(`[LocalPhotoService] 缩略图生成失败: ${filePath}`, thumbError)
          }

          // 保存到数据库（包含缩略图路径）
          const photoData = {
            ...metadata,
            thumbnailPath
          }
          const photoId = this.database.addPhoto(photoData)

          if (photoId > 0) {
            importedCount++
            importedPhotos.push({
              ...photoData,
              id: photoId
            })
          } else {
            errorCount++
          }

        } catch (error) {
          console.error(`导入照片失败: ${filePath}`, error)
          errorCount++
        }
      }

      this.updateProgress({
        status: 'completed',
        current: photos.length,
        total: photos.length,
        importedCount,
        errorCount,
        skippedCount
      })

    } catch (error) {
      console.error('扫描文件夹失败:', error)
      this.updateProgress({
        status: 'error',
        errorCount: 1
      })
      throw error
    }

    return {
      imported: importedCount,
      skipped: skippedCount,
      errors: errorCount,
      photos: importedPhotos
    }
  }

  /**
   * 导入单张照片
   */
  async importPhoto(filePath: string): Promise<PhotoMetadata | null> {
    try {
      const metadata = await this.extractMetadata(filePath)
      const photoId = this.database.addPhoto(metadata)

      if (photoId > 0) {
        return {
          ...metadata,
          id: photoId
        }
      }
      return null
    } catch (error) {
      console.error(`导入照片失败: ${filePath}`, error)
      return null
    }
  }

  /**
   * 获取已导入的照片数量
   */
  getPhotoCount(): number {
    try {
      return this.database.getPhotoCount()
    } catch (error) {
      console.error('获取照片数量失败:', error)
      return 0
    }
  }

  /**
   * 获取没有嵌入向量的照片
   */
  getPhotosWithoutEmbeddings(limit: number = 100): any[] {
    try {
      const photos = this.database.getPhotosWithoutEmbeddings(limit)
      return photos.map(p => ({
        id: p.id,
        uuid: p.uuid,
        filePath: p.file_path,
        fileName: p.file_name,
        thumbnailPath: p.thumbnail_path,
        takenAt: p.taken_at
      }))
    } catch (error) {
      console.error('获取无向量照片失败:', error)
      return []
    }
  }

  /**
   * 获取本地照片（供 photos:get-list 调用）
   */
  getLocalPhotos(limit: number = 100, offset: number = 0): any[] {
    try {
      console.log(`[LocalPhotoService] getLocalPhotos - limit: ${limit}, offset: ${offset}`)
      console.log(`[LocalPhotoService] database 可用: ${!!this.database}`)

      const photos = this.database.getAllPhotos(limit, offset)
      console.log(`[LocalPhotoService] getAllPhotos 返回 ${photos.length} 条记录`)

      const result = photos.map(p => ({
        id: p.id,
        uuid: p.uuid,
        cloudId: p.cloud_id,
        filePath: p.file_path,
        fileName: p.file_name,
        fileSize: p.file_size,
        width: p.width,
        height: p.height,
        takenAt: p.taken_at,
        exif: this.parseJsonField(p.exif_data),
        location: this.parseJsonField(p.location_data),
        thumbnailPath: p.thumbnail_path,
        status: p.status || 'local'
      }))

      console.log(`[LocalPhotoService] 映射后返回 ${result.length} 张照片`)
      return result
    } catch (error) {
      console.error('[LocalPhotoService] 获取本地照片失败:', error)
      return []
    }
  }

  /**
   * 安全解析 JSON 字段（兼容已解析的对象和 JSON 字符串）
   */
  private parseJsonField(field: any): any {
    if (!field) return {}
    if (typeof field === 'object') return field  // 已经是对象
    if (typeof field === 'string') {
      try { return JSON.parse(field) } catch { return {} }
    }
    return {}
  }

  /**
   * 删除照片
   * @param photoId 照片 ID
   * @returns 是否删除成功
   */
  deletePhoto(photoId: number): boolean {
    try {
      console.log(`[LocalPhotoService] 删除照片: ${photoId}`)

      // 先通过 ID 获取照片的 UUID
      const photo = this.database.getPhotoById(photoId)

      if (!photo) {
        console.warn(`[LocalPhotoService] 照片 ${photoId} 不存在于数据库`)
        return false
      }

      // 使用 UUID 删除照片
      const success = this.database.deletePhoto(photo.uuid)

      if (success) {
        console.log(`[LocalPhotoService] 照片 ${photoId} (uuid: ${photo.uuid}) 已从数据库删除`)
      }

      return success
    } catch (error) {
      console.error(`[LocalPhotoService] 删除照片失败: ${photoId}`, error)
      return false
    }
  }
}
