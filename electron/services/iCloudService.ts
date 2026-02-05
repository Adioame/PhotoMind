/**
 * PhotoMind - iCloud 照片服务
 *
 * 功能：
 * 1. 通过 AppleScript 或 apple-photos-js 访问 iCloud 照片库
 * 2. 获取照片列表和相册
 * 3. 下载照片到本地
 * 4. 检测 iCloud 下载状态
 */
import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import { PhotoDatabase } from '../database/db.js'

const execAsync = promisify(exec)

// 类型定义
export interface iCloudPhoto {
  id: string
  filename: string
  date: Date
  size: number
  cloudStatus: 'downloaded' | 'waiting' | 'uploading'
  localPath?: string
}

export interface iCloudAlbum {
  name: string
  photoCount: number
}

export interface iCloudStorageInfo {
  used: number  // GB
  available: number  // GB
}

export class ICloudService {
  private libraryPath: string = ''
  private database: PhotoDatabase
  private PhotosLibrary: any = null
  private isAvailable: boolean = false

  constructor(database: PhotoDatabase) {
    this.database = database
  }

  /**
   * 检测 iCloud Photos 可用性
   */
  async checkAvailability(): Promise<boolean> {
    try {
      // 检测 macOS 和 iCloud Photos
      const { stdout } = await execAsync('system_profiler SPSyncServicesDataType | grep "iCloud"')
      this.isAvailable = stdout.includes('iCloud Photos') || stdout.includes('Photos')
      return this.isAvailable
    } catch {
      this.isAvailable = false
      return false
    }
  }

  /**
   * 初始化服务
   */
  async initialize(libraryPath: string): Promise<boolean> {
    try {
      this.libraryPath = libraryPath

      // 尝试加载 apple-photos-js
      try {
        const PhotosLib = await import('apple-photos-js')
        this.PhotosLibrary = PhotosLib.default || PhotosLib.Photos
        console.log('apple-photos-js 加载成功')
      } catch (e) {
        console.warn('apple-photos-js 未安装，使用 AppleScript 方式')
      }

      // 检测 iCloud 可用性
      await this.checkAvailability()

      console.log('iCloud 服务初始化完成')
      return true
    } catch (error) {
      console.error('iCloud 服务初始化失败:', error)
      return false
    }
  }

  /**
   * 获取 iCloud 可用性状态
   */
  getIsAvailable(): boolean {
    return this.isAvailable
  }

  /**
   * 获取相册列表
   */
  async getAlbums(): Promise<iCloudAlbum[]> {
    // 优先使用 AppleScript
    if (this.isAvailable) {
      try {
        const albums = await this.getAlbumsViaAppleScript()
        if (albums.length > 0) {
          return albums
        }
      } catch (error) {
        console.warn('AppleScript 获取相册失败，使用备选方案:', error)
      }
    }

    // 如果有 PhotosLibrary，使用它
    if (this.PhotosLibrary) {
      try {
        return this.getAlbumsViaLibrary()
      } catch (error) {
        console.warn('PhotosLibrary 获取相册失败:', error)
      }
    }

    // 返回模拟数据用于开发
    return this.getMockAlbums()
  }

  /**
   * 通过 AppleScript 获取相册
   */
  private async getAlbumsViaAppleScript(): Promise<iCloudAlbum[]> {
    const script = `
      tell application "Photos"
        set albumList to {}
        repeat with a in albums
          if a is not null then
            set end of albumList to {name of a as text, count of media items of a}
          end if
        end repeat
        return albumList
      end tell
    `

    try {
      const { stdout } = await execAsync(`osascript -e '${script.replace(/\n/g, ' ')}'`)
      return this.parseAlbumList(stdout)
    } catch (error) {
      console.error('AppleScript 获取相册失败:', error)
      return []
    }
  }

  /**
   * 通过 PhotosLibrary 获取相册
   */
  private getAlbumsViaLibrary(): iCloudAlbum[] {
    // 这需要在 PhotosLibrary 实例上调用
    // 目前返回空数组，需要库支持
    console.warn('PhotosLibrary 不支持获取相册列表')
    return []
  }

  /**
   * 解析 AppleScript 返回的相册列表
   */
  private parseAlbumList(stdout: string): iCloudAlbum[] {
    const albums: iCloudAlbum[] = []

    // AppleScript 返回格式: {albumName1, count1}, {albumName2, count2}, ...
    const matches = stdout.matchAll(/\{([^,]+),\s*(\d+)\}/g)

    for (const match of matches) {
      const name = match[1]?.trim().replace(/"/g, '')
      const count = parseInt(match[2], 10)

      if (name && !isNaN(count)) {
        albums.push({ name, photoCount: count })
      }
    }

    return albums
  }

  /**
   * 获取模拟相册数据
   */
  private getMockAlbums(): iCloudAlbum[] {
    return [
      { name: '个人收藏', photoCount: 1250 },
      { name: '最近项目', photoCount: 100 },
      { name: '自拍', photoCount: 89 },
      { name: '屏幕快照', photoCount: 234 },
      { name: '视频', photoCount: 67 }
    ]
  }

  /**
   * 获取照片列表（带下载状态）
   */
  async getPhotosWithStatus(
    albumName?: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<iCloudPhoto[]> {
    const { limit = 100, offset = 0 } = options

    // 优先使用 AppleScript
    if (this.isAvailable) {
      try {
        const photos = await this.getPhotosViaAppleScript(albumName, limit + offset)
        return photos.slice(offset, offset + limit)
      } catch (error) {
        console.warn('AppleScript 获取照片失败:', error)
      }
    }

    // 使用 PhotosLibrary
    if (this.PhotosLibrary) {
      try {
        return await this.getPhotosViaLibrary(limit, offset)
      } catch (error) {
        console.warn('PhotosLibrary 获取照片失败:', error)
      }
    }

    // 返回模拟数据
    return this.getMockPhotos(limit, offset)
  }

  /**
   * 通过 AppleScript 获取照片
   */
  private async getPhotosViaAppleScript(
    albumName?: string,
    limit: number = 100
  ): Promise<iCloudPhoto[]> {
    let script = `
      tell application "Photos"
        set photoList to {}
    `

    if (albumName) {
      script += `
        set targetAlbum to album named "${albumName}"
        repeat with p in media items of targetAlbum
      `
    } else {
      script += `
        repeat with p in media items
      `
    }

    script += `
          set end of photoList to {id of p as text, name of p as text, date of p, size of p, download status of p as text}
        end repeat
        return photoList
      end tell
    `

    try {
      const { stdout } = await execAsync(`osascript -e '${script.replace(/\n/g, ' ')}'`)
      return this.parsePhotoList(stdout).slice(0, limit)
    } catch (error) {
      console.error('AppleScript 获取照片失败:', error)
      return []
    }
  }

  /**
   * 通过 PhotosLibrary 获取照片
   */
  private async getPhotosViaLibrary(
    limit: number,
    offset: number
  ): Promise<iCloudPhoto[]> {
    try {
      const photos = new this.PhotosLibrary(this.libraryPath)
      const allPhotos = photos.getAllPhotos()

      return allPhotos.slice(offset, offset + limit).map((photo: any) =>
        this.normalizePhoto(photo)
      )
    } catch (error) {
      console.error('PhotosLibrary 获取照片失败:', error)
      return []
    }
  }

  /**
   * 解析 AppleScript 返回的照片列表
   */
  private parsePhotoList(stdout: string): iCloudPhoto[] {
    const photos: iCloudPhoto[] = []

    // 格式: {id, name, date, size, status}, ...
    const matches = stdout.matchAll(
      /\{([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^}]+)\}/g
    )

    for (const match of matches) {
      const id = match[1]?.trim()
      const filename = match[2]?.trim()
      const dateStr = match[3]?.trim()
      const sizeStr = match[4]?.trim()
      const status = match[5]?.trim()

      if (id && filename && dateStr && sizeStr) {
        photos.push({
          id,
          filename,
          date: new Date(dateStr.replace(/:/g, '-')),
          size: parseInt(sizeStr, 10) || 0,
          cloudStatus: this.parseCloudStatus(status)
        })
      }
    }

    return photos
  }

  /**
   * 解析下载状态
   */
  private parseCloudStatus(status: string): iCloudPhoto['cloudStatus'] {
    const lowerStatus = status?.toLowerCase() || ''

    if (lowerStatus.includes('waiting') || lowerStatus.includes('not downloaded')) {
      return 'waiting'
    }
    if (lowerStatus.includes('uploading')) {
      return 'uploading'
    }
    return 'downloaded'
  }

  /**
   * 下载照片到本地
   */
  async downloadPhoto(photoId: string): Promise<string | null> {
    if (this.isAvailable) {
      try {
        return await this.downloadPhotoViaAppleScript(photoId)
      } catch (error) {
        console.error('AppleScript 下载失败:', error)
      }
    }

    console.warn('无法下载照片，照片库不可用')
    return null
  }

  /**
   * 通过 AppleScript 下载照片
   */
  private async downloadPhotoViaAppleScript(photoId: string): Promise<string | null> {
    const script = `
      tell application "Photos"
        try
          set targetPhoto to media item id "${photoId}"
          download targetPhoto
          return POSIX path of (image file of targetPhoto as text)
        on error
          return ""
        end try
      end tell
    `

    try {
      const { stdout } = await execAsync(`osascript -e '${script.replace(/\n/g, ' ')}'`)
      const path = stdout.trim()
      return path || null
    } catch (error) {
      console.error('AppleScript 下载照片失败:', error)
      return null
    }
  }

  /**
   * 获取存储空间信息
   */
  async getStorageInfo(): Promise<iCloudStorageInfo | null> {
    try {
      // 使用 df 命令获取磁盘信息
      const output = execSync('df -h / | tail -1 | awk "{print $3, $4}"')
      const [used, available] = output.toString().trim().split(/\s+/)

      return {
        used: this.parseSizeToGB(used),
        available: this.parseSizeToGB(available)
      }
    } catch (error) {
      console.error('获取存储信息失败:', error)
      return null
    }
  }

  /**
   * 将人类可读的大小转换为 GB
   */
  private parseSizeToGB(sizeStr: string): number {
    // sizeStr 格式: 100G, 500M, 1.5T 等
    const match = sizeStr.match(/^([\d.]+)([KMGT]?)$/i)
    if (!match) return 0

    const value = parseFloat(match[1])
    const unit = match[2].toUpperCase()

    switch (unit) {
      case 'T':
        return value * 1024
      case 'G':
        return value
      case 'M':
        return value / 1024
      case 'K':
        return value / (1024 * 1024)
      default:
        return value
    }
  }

  async getPhotos(limit: number = 100, offset: number = 0): Promise<any[]> {
    if (!this.PhotosLibrary) {
      // 返回模拟数据用于开发
      return this.getMockPhotos(limit, offset)
    }

    try {
      const photos = new this.PhotosLibrary(this.libraryPath)
      const allPhotos = photos.getAllPhotos()

      return allPhotos.slice(offset, offset + limit).map((photo: any) => this.normalizePhoto(photo))
    } catch (error) {
      console.error('获取照片失败:', error)
      return this.getMockPhotos(limit, offset)
    }
  }

  /**
   * 批量下载照片
   */
  async downloadPhotos(
    photoIds: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>()

    for (let i = 0; i < photoIds.length; i++) {
      const photoId = photoIds[i]
      onProgress?.(i + 1, photoIds.length)

      try {
        const path = await this.downloadPhoto(photoId)
        results.set(photoId, path || '')
      } catch (error) {
        results.set(photoId, '')
        console.error(`下载照片 ${photoId} 失败:`, error)
      }
    }

    return results
  }

  async getPhotoDetail(photoId: string): Promise<any> {
    if (!this.PhotosLibrary) {
      return this.getMockPhotos(1, parseInt(photoId) || 0)[0]
    }

    try {
      const photos = new this.PhotosLibrary(this.libraryPath)
      const photo = photos.getPhotoById(photoId)

      return photo ? this.normalizePhoto(photo) : null
    } catch (error) {
      console.error('获取照片详情失败:', error)
      return this.getMockPhotos(1, parseInt(photoId) || 0)[0]
    }
  }

  async syncAll(): Promise<number> {
    let totalSynced = 0

    try {
      const photos = await this.getPhotos(10000, 0)

      for (const photo of photos) {
        this.database.addPhoto(photo)
        totalSynced++
      }

      console.log(`同步完成: ${totalSynced} 张照片`)
    } catch (error) {
      console.error('同步失败:', error)
    }

    return totalSynced
  }

  private normalizePhoto(photo: any): any {
    return {
      uuid: photo.uuid || photo.id || crypto.randomUUID(),
      cloudId: photo.cloudId || photo.id,
      filePath: photo.filePath || photo.originalPath,
      fileName: photo.filename || photo.name,
      fileSize: photo.fileSize || photo.size,
      width: photo.width,
      height: photo.height,
      takenAt: photo.takenAt || photo.creationDate || new Date().toISOString(),
      exif: {
        camera: photo.cameraModel,
        lens: photo.lensModel,
        iso: photo.iso,
        aperture: photo.fNumber,
        shutterSpeed: photo.exposureTime
      },
      location: photo.location ? {
        latitude: photo.location.latitude,
        longitude: photo.location.longitude
      } : null,
      status: 'icloud'
    }
  }

  // 模拟数据（用于开发阶段）
  private getMockPhotos(limit: number, offset: number): iCloudPhoto[] {
    const mockPhotos: iCloudPhoto[] = []

    for (let i = offset; i < offset + limit; i++) {
      const year = 2015 + Math.floor(i / 100)
      const month = (i % 12) + 1
      const day = (i % 28) + 1

      // 随机生成下载状态
      const statuses: iCloudPhoto['cloudStatus'][] = ['downloaded', 'downloaded', 'waiting', 'downloaded']
      const status = statuses[i % statuses.length]

      mockPhotos.push({
        id: `photo-${i}`,
        filename: `IMG_${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}_${i}.jpg`,
        date: new Date(year, month - 1, day, 10, 30),
        size: Math.floor(Math.random() * 5000000) + 1000000,
        cloudStatus: status,
        localPath: status === 'downloaded' ? `/mock/photos/${year}/photo_${i}.jpg` : undefined
      })
    }

    return mockPhotos
  }
}
