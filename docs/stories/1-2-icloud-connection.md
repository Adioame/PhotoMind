# Story E-01.2: iCloud 连接

## Story Overview

**原始需求描述**:
作为 iCloud 用户，我希望 PhotoMind 能够连接到我的 iCloud 照片库，导入其中的照片。

**描述**:
系统通过 AppleScript 或 CloudKit API 访问 iCloud 照片库，支持选择相册、下载照片元数据、下载原图等功能。

## Acceptance Criteria

### 功能性需求
- [ ] 检测 macOS 系统和 iCloud Photos 可用性
- [ ] 通过 AppleScript 访问 iCloud 照片库
- [ ] 获取 iCloud 照片列表
- [ ] 支持按相册筛选
- [ ] 支持下载 iCloud 照片
- [ ] 显示 iCloud 下载状态（已下载/在云端）
- [ ] 支持批量下载
- [ ] 显示存储空间信息

### 非功能性需求
- [ ] macOS 专属功能
- [ ] 尊重系统隐私设置
- [ ] 后台下载支持

## Implementation Steps

### Phase 1: iCloud 服务

**文件**: `electron/services/icloudService.ts`

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface iCloudPhoto {
  id: string
  filename: string
  date: Date
  size: number
  cloudStatus: 'downloaded' | 'waiting' | 'uploading'
  localPath?: string
}

interface iCloudAlbum {
  name: string
  photoCount: number
}

class iCloudService {
  private isAvailable = false

  async checkAvailability(): Promise<boolean> {
    try {
      // 检测 macOS 和 iCloud Photos
      const { stdout } = await execAsync('system_profiler SPSyncServicesDataType | grep "iCloud"')
      this.isAvailable = stdout.includes('iCloud')
      return this.isAvailable
    } catch {
      this.isAvailable = false
      return false
    }
  }

  async getAlbums(): Promise<iCloudAlbum[]> {
    if (!this.isAvailable) {
      throw new Error('iCloud Photos not available')
    }

    // 使用 AppleScript 获取相册列表
    const script = `
      tell application "Photos"
        set albumList to {}
        repeat with a in albums
          if a is not null then
            set end of albumList to {name of a, count of media items of a}
          end if
        end repeat
        return albumList
      end tell
    `

    try {
      const { stdout } = await execAsync(`osascript -e '${script}'`)
      return this.parseAlbumList(stdout)
    } catch (error) {
      console.error('Failed to get iCloud albums:', error)
      return []
    }
  }

  async getPhotos(
    albumName?: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<iCloudPhoto[]> {
    if (!this.isAvailable) {
      throw new Error('iCloud Photos not available')
    }

    const { limit = 100, offset = 0 } = options

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
          set end of photoList to {id of p, name of p, date of p, size of p, download status of p}
        end repeat
        return photoList
      end tell
    `

    try {
      const { stdout } = await execAsync(`osascript -e '${script}'`)
      return this.parsePhotoList(stdout).slice(offset, offset + limit)
    } catch (error) {
      console.error('Failed to get iCloud photos:', error)
      return []
    }
  }

  async downloadPhoto(photoId: string): Promise<string> {
    const script = `
      tell application "Photos"
        set targetPhoto to media item id "${photoId}"
        download targetPhoto
        return POSIX path of (image file of targetPhoto as text)
      end tell
    `

    try {
      const { stdout } = await execAsync(`osascript -e '${script}'`)
      return stdout.trim()
    } catch (error) {
      throw new Error(`Failed to download photo: ${error}`)
    }
  }

  async downloadPhotos(photoIds: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>()

    for (const id of photoIds) {
      try {
        const path = await this.downloadPhoto(id)
        results.set(id, path)
      } catch (error) {
        results.set(id, '')
      }
    }

    return results
  }

  async getStorageInfo(): Promise<{ used: number; available: number }> {
    const { stdout } = await execAsync('df -h / | tail -1 | awk "{print $3, $4}"')
    const [used, available] = stdout.trim().split(' ')

    return {
      used: parseFloat(used),
      available: parseFloat(available)
    }
  }

  private parseAlbumList(stdout: string): iCloudAlbum[] {
    // 解析 AppleScript 返回的列表格式
    // 格式: {albumName1, count1}, {albumName2, count2}, ...
    const albums: iCloudAlbum[] = []

    const matches = stdout.matchAll(/\{([^,]+),\s*(\d+)\}/g)

    for (const match of matches) {
      albums.push({
        name: match[1].trim(),
        photoCount: parseInt(match[2])
      })
    }

    return albums
  }

  private parsePhotoList(stdout: string): iCloudPhoto[] {
    const photos: iCloudPhoto[] = []

    // 解析 AppleScript 返回的列表格式
    // 格式: {id, name, date, size, status}, ...
    const matches = stdout.matchAll(/\{([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^}]+)\}/g)

    for (const match of matches) {
      photos.push({
        id: match[1].trim(),
        filename: match[2].trim(),
        date: new Date(match[3].trim()),
        size: parseInt(match[4].trim()),
        cloudStatus: this.parseCloudStatus(match[5].trim())
      })
    }

    return photos
  }

  private parseCloudStatus(status: string): iCloudPhoto['cloudStatus'] {
    switch (status.toLowerCase()) {
      case 'download complete':
        return 'downloaded'
      case 'waiting':
        return 'waiting'
      default:
        return 'downloaded'
    }
  }
}
```

### Phase 2: iCloud 导入

**文件**: `electron/services/icloudImportService.ts`

```typescript
import { iCloudService } from './icloudService'

class iCloudImportService {
  async importPhotos(
    options: {
      albumName?: string
      photoIds?: string[]
      downloadOriginal?: boolean
    },
    onProgress?: (current: number, total: number) => void
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      duration: 0
    }

    const startTime = Date.now()

    try {
      // 获取要导入的照片
      const photos = options.photoIds?.length
        ? await Promise.all(
            options.photoIds.map(async (id) => {
              const allPhotos = await iCloudService.getPhotos()
              return allPhotos.find(p => p.id === id)
            })
          )
        : await iCloudService.getPhotos(options.albumName)

    } finally {
      result.duration = Date.now() - startTime
    }

    return result
  }
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/icloudService.ts` |
| 新建 | `electron/services/icloudImportService.ts` |

## Dependencies

### 内部依赖
- `electron/services/localPhotoService.ts`

### 外部依赖
- 无新增外部依赖（macOS 专属）

## Testing Approach

### 单元测试
1. **可用性检测测试**
   - 测试检测逻辑

### 手动测试
1. **功能测试**
   - 测试获取相册
   - 测试获取照片
   - 测试下载照片

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 检测可用性 | macOS 上验证返回正确状态 |
| 获取相册列表 | 验证返回相册名称和数量 |
| 获取照片列表 | 验证返回照片信息 |
| 下载照片 | 验证下载并返回本地路径 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| AppleScript 不稳定 | 中 | 添加重试机制 |
| macOS 专属 | 低 | Windows/Linux 显示不可用 |
| 隐私限制 | 中 | 尊重系统设置 |

## Related Stories

### 前置依赖
- E-01.1: 本地文件夹导入 - 复用导入逻辑

### 后续故事
- E-01.3: 元数据提取 - 提取 iCloud 照片信息

### 相关 stories
- E-02.5: 增量向量生成 - 导入后生成向量
