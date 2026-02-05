# Story E-02.5: 增量向量生成

## Story Overview

**原始需求描述**:
作为用户，我希望新导入的照片能够自动生成向量，无需手动触发批量生成任务，这样我可以立即使用语义搜索功能。

**描述**:
当用户导入新照片时，系统应该自动检测该照片是否已生成向量，如果没有则立即或异步生成。系统需要维护一个向量生成队列，处理高并发导入场景。

## Acceptance Criteria

### 功能性需求
- [ ] 新照片导入时自动生成向量
- [ ] 支持队列机制，避免并发生成导致内存问题
- [ ] 向量生成任务可中断和恢复
- [ ] 提供向量生成状态查询接口
- [ ] 自动跳过已有向量的照片
- [ ] 处理生成失败的情况（重试机制）
- [ ] 增量更新不影响现有搜索性能

### 非功能性需求
- [ ] 单张照片处理时间 < 5 秒
- [ ] 批量导入时队列处理稳定
- [ ] 应用启动时自动恢复未完成的任务
- [ ] 后台生成不阻塞主线程

## Implementation Steps

### Phase 1: 向量生成队列

**文件**: `electron/services/vectorQueue.ts`

```typescript
interface QueueItem {
  photoId: string
  imagePath: string
  priority: number
  retryCount: number
  maxRetries: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  error?: string
}

interface QueueStats {
  pending: number
  processing: number
  completed: number
  failed: number
}

class VectorGenerationQueue {
  private queue: QueueItem[] = []
  private processingCount = 0
  private maxConcurrent = 2
  private isRunning = false

  // 添加任务到队列
  enqueue(photoId: string, imagePath: string, priority: number = 0): void {
    const item: QueueItem = {
      photoId,
      imagePath,
      priority,
      retryCount: 0,
      maxRetries: 3,
      status: 'pending',
      createdAt: new Date()
    }

    // 按优先级插入
    const insertIndex = this.queue.findIndex(
      item => item.priority < priority || item.status !== 'pending'
    )

    if (insertIndex === -1) {
      this.queue.push(item)
    } else {
      this.queue.splice(insertIndex, 0, item)
    }

    this.processQueue()
  }

  // 批量添加
  enqueueBatch(
    items: Array<{ photoId: string; imagePath: string }>,
    priority: number = 0
  ): void {
    for (const item of items) {
      this.enqueue(item.photoId, item.imagePath, priority)
    }
  }

  // 处理队列
  private async processQueue(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true

    while (this.processingCount < this.maxConcurrent) {
      const nextItem = this.queue.find(item => item.status === 'pending')

      if (!nextItem) break

      nextItem.status = 'processing'
      nextItem.startedAt = new Date()
      this.processingCount++

      try {
        await this.processItem(nextItem)
        nextItem.status = 'completed'
        nextItem.completedAt = new Date()
      } catch (error) {
        nextItem.retryCount++

        if (nextItem.retryCount < nextItem.maxRetries) {
          nextItem.status = 'pending'
          nextItem.error = `Retry ${nextItem.retryCount}/${nextItem.maxRetries}`
        } else {
          nextItem.status = 'failed'
          nextItem.error = error instanceof Error ? error.message : 'Unknown error'
        }
      } finally {
        this.processingCount--
      }
    }

    this.isRunning = false
  }

  private async processItem(item: QueueItem): Promise<void> {
    // 检查是否已有向量
    const existingVector = await db.hasVector(item.photoId)
    if (existingVector) {
      item.status = 'completed'
      item.completedAt = new Date()
      return
    }

    // 生成向量
    const embedding = await embeddingService.generateEmbedding(item.imagePath)

    // 存储向量
    await db.storeVector(item.photoId, embedding, MODEL_VERSION)

    // 更新照片记录
    await db.run(
      'UPDATE photos SET has_vector = 1 WHERE id = ?',
      item.photoId
    )
  }

  // 获取队列状态
  getStats(): QueueStats {
    return {
      pending: this.queue.filter(i => i.status === 'pending').length,
      processing: this.queue.filter(i => i.status === 'processing').length,
      completed: this.queue.filter(i => i.status === 'completed').length,
      failed: this.queue.filter(i => i.status === 'failed').length
    }
  }

  // 获取失败的任务
  getFailedItems(): QueueItem[] {
    return this.queue.filter(i => i.status === 'failed')
  }

  // 重试失败的任务
  retryFailed(): number {
    const failedItems = this.getFailedItems()
    for (const item of failedItems) {
      item.status = 'pending'
      item.retryCount = 0
      item.error = undefined
    }
    this.processQueue()
    return failedItems.length
  }

  // 清空已完成的任务
  clearCompleted(): void {
    this.queue = this.queue.filter(i => i.status !== 'completed')
  }
}
```

### Phase 2: 集成到照片导入流程

**文件**: `electron/services/localPhotoService.ts`

```typescript
import { vectorGenerationQueue } from './vectorQueue'

interface ImportResult {
  photo: Photo
  vectorGenerated: boolean
  vectorQueued: boolean
}

async function importPhoto(filePath: string): Promise<ImportResult> {
  // 1. 读取照片并提取元数据
  const metadata = await extractMetadata(filePath)

  // 2. 复制到照片目录
  const destPath = await copyPhotoToLibrary(filePath, metadata)

  // 3. 保存到数据库
  const photo = await savePhotoToDatabase(destPath, metadata)

  // 4. 尝试生成向量
  let vectorGenerated = false
  let vectorQueued = false

  try {
    // 优先直接生成（快速路径）
    vectorGenerated = await generateVectorImmediately(photo.id, photo.path)
  } catch (error) {
    // 失败则加入队列
    vectorGenerationQueue.enqueue(photo.id, photo.path, 0)
    vectorQueued = true
  }

  // 5. 如果有 EXIF 人脸信息，触发人脸检测
  if (metadata.hasFaceData) {
    faceDetectionQueue.enqueue(photo.id)
  }

  return {
    photo,
    vectorGenerated,
    vectorQueued
  }
}

async function generateVectorImmediately(
  photoId: string,
  imagePath: string
): Promise<boolean> {
  // 检查是否已有向量
  const existing = await db.hasVector(photoId)
  if (existing) return true

  // 生成向量
  const embedding = await embeddingService.generateEmbedding(imagePath)

  // 存储
  await db.storeVector(photoId, embedding, MODEL_VERSION)

  // 更新状态
  await db.run('UPDATE photos SET has_vector = 1 WHERE id = ?', photoId)

  return true
}

async function importPhotosFromFolder(folderPath: string): Promise<ImportResult[]> {
  const results: ImportResult[] = []
  const photoFiles = await findPhotoFiles(folderPath)

  for (const filePath of photoFiles) {
    const result = await importPhoto(filePath)
    results.push(result)
  }

  return results
}
```

### Phase 3: 后台生成服务

**文件**: `electron/services/backgroundVectorService.ts`

```typescript
/**
 * 后台向量生成服务
 * 管理向量生成的生命周期和状态持久化
 */

class BackgroundVectorService {
  private queue: VectorGenerationQueue
  private statusInterval: NodeJS.Timeout | null = null

  constructor() {
    this.queue = new VectorGenerationQueue()
  }

  // 启动服务
  async start(): Promise<void> {
    // 从数据库恢复未完成的任务
    await this.restorePendingTasks()

    // 启动状态同步
    this.startStatusSync()

    // 恢复队列处理
    this.queue.processQueue()
  }

  // 停止服务
  async stop(): Promise<void> {
    if (this.statusInterval) {
      clearInterval(this.statusInterval)
      this.statusInterval = null
    }

    // 等待当前任务完成
    await this.waitForCompletion()
  }

  // 恢复待处理任务
  private async restorePendingTasks(): Promise<void> {
    const pendingPhotos = await db.all(
      `SELECT id, path FROM photos WHERE has_vector = 0 AND vector_status = 'pending'`
    )

    for (const photo of pendingPhotos) {
      this.queue.enqueue(photo.id, photo.path, 0)
    }
  }

  // 启动状态同步（同步到数据库）
  private startStatusSync(): void {
    this.statusInterval = setInterval(async () => {
      const stats = this.queue.getStats()

      // 更新全局状态
      await db.run(`
        UPDATE system_stats SET
          vector_pending = ?,
          vector_processing = ?,
          vector_completed = ?,
          vector_failed = ?
        WHERE id = 1
      `, [stats.pending, stats.processing, stats.completed, stats.failed])

      // 同步失败任务状态
      const failedItems = this.queue.getFailedItems()
      for (const item of failedItems) {
        await db.run(
          'UPDATE photos SET vector_status = ?, vector_error = ? WHERE id = ?',
          'failed',
          item.error,
          item.photoId
        )
      }
    }, 5000) // 每 5 秒同步一次
  }

  // 等待所有任务完成
  private async waitForCompletion(): Promise<void> {
    while (this.queue.getStats().processing > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // 获取状态
  async getStatus(): Promise<VectorServiceStatus> {
    const stats = this.queue.getStats()
    const pendingPhotos = await db.getPhotosWithoutVectors(1)

    return {
      ...stats,
      hasMore: pendingPhotos.length > 0,
      lastSync: new Date()
    }
  }

  // 批量导入后触发生成
  async onBatchImportCompleted(
    photoIds: Array<{ photoId: string; imagePath: string }>
  ): Promise<void> {
    // 高优先级批量添加
    this.queue.enqueueBatch(photoIds, 10)
  }
}
```

### Phase 4: IPC 接口

**文件**: `electron/main/index.ts`

```typescript
// 获取向量生成状态
ipcMain.handle('photos:get-vector-status', async () => {
  return await backgroundVectorService.getStatus()
})

// 触发批量生成
ipcMain.handle('photos:trigger-batch-generation', async (_, options) => {
  const { limit = 100 } = options || {}

  // 获取未生成向量的照片
  const photos = await db.getPhotosWithoutVectors(limit)

  // 添加到队列
  for (const photo of photos) {
    vectorGenerationQueue.enqueue(photo.id, photo.path, 5)
  }

  return {
    enqueued: photos.length
  }
})

// 重试失败的任务
ipcMain.handle('photos:retry-failed-vectors', async () => {
  return vectorGenerationQueue.retryFailed()
})

// 取消所有待处理任务
ipcMain.handle('photos:cancel-vector-queue', async () => {
  // 实现取消逻辑
})
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/vectorQueue.ts` |
| 新建 | `electron/services/backgroundVectorService.ts` |
| 修改 | `electron/services/localPhotoService.ts` |
| 修改 | `electron/main/index.ts` |

## Dependencies

### 内部依赖
- `electron/services/embeddingService.ts` - 嵌入生成
- `electron/database/db.ts` - 数据库操作

### 外部依赖
- 无新增外部依赖

## Testing Approach

### 单元测试
1. **队列测试**
   - 测试优先级排序
   - 测试并发控制
   - 测试重试机制

2. **批量导入测试**
   - 测试批量添加任务
   - 测试状态同步

### 集成测试
1. **导入流程测试**
   - 测试单张照片导入和向量生成
   - 测试批量导入
   - 测试错误处理

2. **恢复测试**
   - 测试应用重启后任务恢复

### 性能测试
- 10/50/100 张照片的批量处理时间
- 队列内存使用情况
- 并发处理能力

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 新照片自动生成向量 | 导入新照片，验证 vectors 表新增记录 |
| 队列机制正常工作 | 导入 100 张照片，验证逐步处理 |
| 跳过已有向量照片 | 重复导入同一照片，验证不重复生成 |
| 错误重试机制 | 模拟错误，验证自动重试 |
| 单张照片 < 5 秒 | 使用 console.time 测量 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 导入时阻塞 UI | 中 | 后台异步生成 |
| 内存溢出 | 中 | 限制并发数，分批处理 |
| 队列丢失 | 低 | 持久化状态到数据库 |
| 生成失败无感知 | 低 | 错误日志和状态查询 |

## Related Stories

### 前置依赖
- E-02.2: 图片向量生成 - 核心生成逻辑
- E-01.3: 元数据提取 - 获取照片信息

### 后续故事
- E-04.2: 人脸自动检测 - 集成人脸检测队列

### 相关故事
- E-02.4: 向量相似度搜索 - 新向量索引更新
- E-05.1: 搜索界面优化 - 显示向量生成进度
