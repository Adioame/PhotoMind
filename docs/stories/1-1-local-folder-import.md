# Story E-01.1: 本地文件夹导入

## Story Overview

**原始需求描述**:
作为用户，我希望能够从本地文件夹批量导入照片到 PhotoMind 资料库中。

**描述**:
用户提供本地文件夹路径，系统扫描该文件夹及其子目录，识别支持的图片格式，复制或导入照片到 PhotoMind 的照片存储目录。

## Acceptance Criteria

### 功能性需求
- [ ] 支持选择本地文件夹
- [ ] 扫描文件夹及其子目录
- [ ] 识别支持的图片格式（jpg、png、heic、raw 等）
- [ ] 过滤已存在的照片（避免重复导入）
- [ ] 导入时保留原始文件或复制到资料库
- [ ] 记录导入状态（成功/失败/跳过）
- [ ] 支持取消导入操作
- [ ] 显示导入进度

### 非功能性需求
- [ ] 扫描 1000 张照片 < 10 秒
- [ ] 导入 1000 张照片 < 5 分钟
- [ ] 支持大文件（100MB+）
- [ ] 内存占用合理

## Implementation Steps

### Phase 1: 文件扫描服务

**文件**: `electron/services/folderScanner.ts`

```typescript
import fs from 'fs/promises'
import path from 'path'

interface ScanOptions {
  extensions?: string[]
  recursive?: boolean
  skipHidden?: boolean
}

interface ScannedFile {
  path: string
  filename: string
  extension: string
  size: number
  mtime: Date
}

class FolderScanner {
  private supportedExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw',
    '.tiff', '.tif', '.bmp'
  ]

  async scanFolder(
    folderPath: string,
    options: ScanOptions = {}
  ): Promise<ScannedFile[]> {
    const {
      extensions = this.supportedExtensions,
      recursive = true,
      skipHidden = true
    } = options

    const files: ScannedFile[] = []

    await this.scanDirectory(folderPath, '', files, {
      extensions,
      recursive,
      skipHidden
    })

    return files
  }

  private async scanDirectory(
    rootPath: string,
    relativePath: string,
    files: ScannedFile[],
    options: ScanOptions
  ): Promise<void> {
    const fullPath = path.join(rootPath, relativePath)

    const entries = await fs.readdir(fullPath, { withFileTypes: true })

    for (const entry of entries) {
      const entryPath = path.join(relativePath, entry.name)

      if (entry.isDirectory()) {
        if (options.recursive && !(options.skipHidden && entry.name.startsWith('.'))) {
          await this.scanDirectory(rootPath, entryPath, files, options)
        }
      } else if (entry.isFile()) {
        if (this.shouldIncludeFile(entry.name, options)) {
          const filePath = path.join(rootPath, entryPath)
          const stats = await fs.stat(filePath)

          files.push({
            path: filePath,
            filename: entry.name,
            extension: path.extname(entry.name).toLowerCase(),
            size: stats.size,
            mtime: stats.mtime
          })
        }
      }
    }
  }

  private shouldIncludeFile(filename: string, options: ScanOptions): boolean {
    const ext = path.extname(filename).toLowerCase()

    if (options.skipHidden && filename.startsWith('.')) {
      return false
    }

    return options.extensions!.includes(ext)
  }

  // 估算导入时间
  async estimateImportTime(files: ScannedFile[]): Promise<number> {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0)
    // 假设平均复制速度 30MB/s
    const estimatedSeconds = totalSize / (30 * 1024 * 1024)
    return Math.ceil(estimatedSeconds)
  }
}

export const folderScanner = new FolderScanner()
```

### Phase 2: 导入服务

**文件**: `electron/services/importService.ts`

```typescript
import { folderScanner } from './folderScanner'
import { localPhotoService } from './localPhotoService'

interface ImportOptions {
  copyFiles?: boolean
  moveFiles?: boolean
  createBackup?: boolean
  skipDuplicates?: boolean
  generateThumbnails?: boolean
}

interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  failed: number
  errors: Array<{ file: string; error: string }>
  duration: number
}

class ImportService {
  private isImporting = false
  private importProgress: number = 0
  private cancelImport = false

  async importFromFolder(
    folderPath: string,
    options: ImportOptions = {},
    onProgress?: (progress: number, current: string) => void
  ): Promise<ImportResult> {
    if (this.isImporting) {
      throw new Error('Import already in progress')
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
      const files = await folderScanner.scanFolder(folderPath)

      if (files.length === 0) {
        return result
      }

      // 2. 过滤已存在的照片
      const toImport = options.skipDuplicates
        ? await this.filterDuplicates(files)
        : files

      // 3. 导入照片
      const total = toImport.length

      for (let i = 0; i < toImport.length; i++) {
        if (this.cancelImport) {
          result.success = false
          break
        }

        const file = toImport[i]
        this.importProgress = (i / total) * 100

        onProgress?.(this.importProgress, file.path)

        try {
          const photo = await localPhotoService.importPhoto(file.path, {
            copyFiles: options.copyFiles,
            generateThumbnail: options.generateThumbnails
          })

          if (photo) {
            result.imported++
          } else {
            result.skipped++
          }
        } catch (error) {
          result.failed++
          result.errors.push({
            file: file.path,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      return result
    } finally {
      this.isImporting = false
      result.duration = Date.now() - startTime
    }
  }

  async filterDuplicates(files: ScannedFile[]): Promise<ScannedFile[]> {
    const existingPhotos = await db.getAllPhotoHashes()
    const existingSet = new Set(existingPhotos)

    const toImport: ScannedFile[] = []

    for (const file of files) {
      const hash = await this.calculateFileHash(file.path)
      if (!existingSet.has(hash)) {
        toImport.push(file)
      }
    }

    return toImport
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    const crypto = require('crypto')
    const buffer = await fs.promises.readFile(filePath)
    return crypto.createHash('md5').update(buffer).digest('hex')
  }

  cancel(): void {
    this.cancelImport = true
  }

  getProgress(): number {
    return this.importProgress
  }
}
```

### Phase 3: IPC 接口

**文件**: `electron/main/index.ts`

```typescript
import { importService } from '../services/importService'

// 扫描文件夹
ipcMain.handle('import:scan-folder', async (_, folderPath) => {
  return await folderScanner.scanFolder(folderPath)
})

// 开始导入
ipcMain.handle('import:start', async (_, folderPath, options) => {
  return await importService.importFromFolder(folderPath, options, (progress, current) => {
    // 发送进度更新
    mainWindow?.webContents.send('import:progress', { progress, current })
  })
})

// 取消导入
ipcMain.handle('import:cancel', async () => {
  importService.cancel()
})

// 获取导入进度
ipcMain.handle('import:get-progress', async () => {
  return importService.getProgress()
})
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/folderScanner.ts` |
| 新建 | `electron/services/importService.ts` |
| 修改 | `electron/main/index.ts` |

## Dependencies

### 内部依赖
- `electron/services/localPhotoService.ts`
- `electron/database/db.ts`

### 外部依赖
- 无新增外部依赖

## Testing Approach

### 单元测试
1. **扫描测试**
   - 测试单文件夹扫描
   - 测试递归扫描
   - 测试文件过滤

2. **导入测试**
   - 测试单文件导入
   - 测试批量导入
   - 测试重复文件跳过

### 集成测试
1. **端到端测试**
   - 从选择文件夹到导入完成

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 选择文件夹 | 点击选择，验证返回路径 |
| 扫描子目录 | 验证递归扫描结果 |
| 支持多种格式 | 导入不同格式图片 |
| 过滤已存在 | 验证跳过重复文件 |
| 显示进度 | 验证进度更新 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 大文件处理慢 | 中 | 分块处理 |
| 磁盘空间不足 | 中 | 检查空间 |
| 重复扫描 | 低 | 缓存扫描结果 |

## Related Stories

### 前置依赖
- 无

### 后续故事
- E-01.3: 元数据提取 - 提取照片信息
- E-01.4: 导入进度管理 - 进度显示

### 相关 stories
- E-02.5: 增量向量生成 - 导入后生成向量
