# Story E-10.3: 扫描任务数据库持久化

**Status**: ready-for-dev

**Epic**: [E-10: 人脸扫描状态同步修复](../planning-artifacts/epics/09-epic-10-face-scan-fix.md)

**Depends On**: [E-10.2: 周期性状态对账机制](./e-10-2-periodic-state-reconciliation.md)

---

## Story

As a 系统架构师,
I want 将扫描任务状态持久化到数据库,
So that 应用崩溃后可恢复扫描进度，支持断点续传

---

## Acceptance Criteria

### AC-1: 创建 scan_jobs 表
**Given** 数据库 schema
**When** 执行数据库迁移
**Then** 创建 `scan_jobs` 表，包含所有必需字段
**And** 创建适当的索引优化查询性能

### AC-2: 扫描任务启动时创建记录
**Given** 用户启动人脸扫描
**When** 开始处理照片
**Then** 插入新记录到 `scan_jobs` 表
**And** 设置 `status` 为 `detecting`
**And** 记录 `started_at` 和 `total_photos`

### AC-3: 定期更新扫描进度
**Given** 扫描任务进行中
**When** 每处理 50 张照片
**Then** 更新 `scan_jobs` 表的 `processed_photos`
**And** 更新 `last_heartbeat` 为当前时间
**And** 更新 `last_processed_id` 为最后处理的照片 ID

### AC-4: 扫描完成时更新记录
**Given** 扫描任务完成
**When** 处理完所有照片
**Then** 更新 `status` 为 `completed`
**And** 设置 `completed_at` 为当前时间
**And** 更新 `processed_photos` 为最终值

### AC-5: 应用启动时恢复未完成任务
**Given** 应用崩溃后重启
**When** 系统初始化
**Then** 查询 `scan_jobs` 表中未完成的任务（status NOT IN ('completed', 'failed', 'cancelled')）
**And** 如果 `last_heartbeat` 在 5 分钟内，恢复任务（返回给调用方决定是否继续）
**And** 如果超过 5 分钟，标记为 `failed`

### AC-6: 断点续传支持
**Given** 有未完成的扫描任务
**When** 用户选择继续扫描
**Then** 从 `last_processed_id` 继续处理
**And** 跳过已处理的照片

---

## Tasks / Subtasks

### Task 1: 创建数据库 Schema (AC-1)
- [ ] 在 `db.ts` 的 `createTables()` 中添加 `scan_jobs` 表创建 SQL
- [ ] 添加字段：id, status, total_photos, processed_photos, failed_photos, last_processed_id, started_at, completed_at, last_heartbeat, error_message
- [ ] 创建索引：`idx_scan_jobs_status`, `idx_scan_jobs_started_at`
- [ ] 运行测试验证表创建成功

### Task 2: 创建 ScanJobService (AC-2, AC-3, AC-4)
- [ ] 创建 `electron/services/scanJobService.ts`
- [ ] 实现 `createJob(totalPhotos: number): string` 方法
- [ ] 实现 `updateProgress(jobId: string, processed: number, lastPhotoId: number)` 方法
- [ ] 实现 `completeJob(jobId: string, result: object)` 方法
- [ ] 实现 `failJob(jobId: string, error: string)` 方法
- [ ] 实现 `cancelJob(jobId: string)` 方法

### Task 3: 集成到 Face Detection Queue (AC-2, AC-3, AC-4)
- [ ] 修改 `faceDetectionQueue.ts` 在任务开始时调用 `createJob()`
- [ ] 每处理 50 张照片调用 `updateProgress()`
- [ ] 任务完成时调用 `completeJob()`
- [ ] 任务失败时调用 `failJob()`
- [ ] 任务取消时调用 `cancelJob()`

### Task 4: 实现任务恢复机制 (AC-5)
- [ ] 在 `scanJobService.ts` 中实现 `getActiveJob(): ScanJob | null` 方法
- [ ] 实现 `isJobStale(job: ScanJob): boolean` 方法（检查 last_heartbeat 是否超过 5 分钟）
- [ ] 实现 `markJobAsFailed(jobId: string)` 方法
- [ ] 在 `db.ts` 或 `main/index.ts` 应用启动时调用检查

### Task 5: 支持断点续传 (AC-6)
- [ ] 在 `faceDetectionQueue.ts` 中支持从特定 photo_id 开始
- [ ] 修改 `getUnprocessedPhotos()` 支持 `afterId` 参数
- [ ] 恢复任务时使用 `last_processed_id` 作为起始点

### Task 6: 测试与验证
- [ ] 验证表结构正确创建
- [ ] 验证扫描过程中数据正确写入
- [ ] 验证应用崩溃后重启能检测到未完成任务
- [ ] 验证断点续传功能正常工作

---

## Dev Notes

### 架构背景

**E-10.1 + E-10.2 解决了什么问题**：
- 组件生命周期导致的 IPC 监听丢失
- IPC 事件本身丢失的问题

**E-10.3 要解决的问题**：
- 应用崩溃后扫描状态完全丢失
- 无法从断点继续，必须从头开始
- 没有持久化的任务历史记录

### 数据库 Schema

**scan_jobs 表结构**：
```sql
CREATE TABLE IF NOT EXISTS scan_jobs (
  id TEXT PRIMARY KEY,              -- UUID 格式任务 ID
  status TEXT NOT NULL,             -- pending/detecting/embedding/clustering/completed/failed/cancelled
  total_photos INTEGER DEFAULT 0,   -- 总照片数
  processed_photos INTEGER DEFAULT 0, -- 已处理照片数
  failed_photos INTEGER DEFAULT 0,  -- 失败照片数
  last_processed_id INTEGER,        -- 最后处理的照片 ID（断点续传关键）
  started_at INTEGER NOT NULL,      -- 开始时间戳（毫秒）
  completed_at INTEGER,             -- 完成时间戳（毫秒）
  last_heartbeat INTEGER,           -- 最后心跳时间戳（毫秒）
  error_message TEXT                -- 错误信息（失败时）
);

-- 索引
CREATE INDEX idx_scan_jobs_status ON scan_jobs(status);
CREATE INDEX idx_scan_jobs_started_at ON scan_jobs(started_at);
```

### 技术约束

1. **使用现有的数据库架构**：基于 `sql.js` 的 SQLite
2. **主进程负责写入**：只有主进程可以直接访问数据库
3. **时间戳使用毫秒**：与 JavaScript `Date.now()` 一致
4. **任务状态机**：
   ```
   pending → detecting → embedding → clustering → completed
                      ↓
                   failed/cancelled
   ```

### 现有代码参考

**Database 类位置**：`electron/database/db.ts`

**现有表创建模式**：
```typescript
private createTables() {
  if (!this.db) return

  this.db.run(`
    CREATE TABLE IF NOT EXISTS scan_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      total_photos INTEGER DEFAULT 0,
      processed_photos INTEGER DEFAULT 0,
      failed_photos INTEGER DEFAULT 0,
      last_processed_id INTEGER,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      last_heartbeat INTEGER,
      error_message TEXT
    )
  `)

  this.db.run('CREATE INDEX IF NOT EXISTS idx_scan_jobs_status ON scan_jobs(status)')
}
```

**FaceDetectionQueue 位置**：`electron/services/faceDetectionQueue.ts`

**当前任务处理模式**：
```typescript
async processTask(task: FaceTask) {
  try {
    // 1. 检测人脸
    const result = await this.detectFaces(task.filePath)

    // 2. 保存到数据库
    await this.saveToDatabase(task.photoId, result)

    // 🆕 3. 更新扫描任务进度（每50张）
    if (this.processedCount % 50 === 0) {
      await scanJobService.updateProgress(this.currentJobId, this.processedCount, task.photoId)
    }

  } catch (error) {
    // 处理错误
  }
}
```

### 推荐实现模式

**ScanJobService 实现**：
```typescript
// electron/services/scanJobService.ts
import { v4 as uuidv4 } from 'uuid'
import { PhotoDatabase } from '../database/db.js'

export interface ScanJob {
  id: string
  status: 'pending' | 'detecting' | 'embedding' | 'clustering' | 'completed' | 'failed' | 'cancelled'
  totalPhotos: number
  processedPhotos: number
  failedPhotos: number
  lastProcessedId: number | null
  startedAt: number
  completedAt: number | null
  lastHeartbeat: number
  errorMessage: string | null
}

export class ScanJobService {
  private db: PhotoDatabase

  constructor(db: PhotoDatabase) {
    this.db = db
  }

  createJob(totalPhotos: number): string {
    const id = uuidv4()
    const now = Date.now()

    this.db.run(`
      INSERT INTO scan_jobs (id, status, total_photos, processed_photos, failed_photos,
                            last_processed_id, started_at, completed_at, last_heartbeat, error_message)
      VALUES (?, 'detecting', ?, 0, 0, NULL, ?, NULL, ?, NULL)
    `, [id, totalPhotos, now, now])

    console.log('[ScanJobService] Created job:', id)
    return id
  }

  updateProgress(jobId: string, processed: number, lastPhotoId: number): void {
    const now = Date.now()

    this.db.run(`
      UPDATE scan_jobs
      SET processed_photos = ?, last_processed_id = ?, last_heartbeat = ?
      WHERE id = ?
    `, [processed, lastPhotoId, now, jobId])
  }

  completeJob(jobId: string, detectedFaces: number): void {
    const now = Date.now()

    this.db.run(`
      UPDATE scan_jobs
      SET status = 'completed', completed_at = ?, last_heartbeat = ?
      WHERE id = ?
    `, [now, now, jobId])

    console.log('[ScanJobService] Completed job:', jobId)
  }

  failJob(jobId: string, error: string): void {
    const now = Date.now()

    this.db.run(`
      UPDATE scan_jobs
      SET status = 'failed', error_message = ?, last_heartbeat = ?
      WHERE id = ?
    `, [error, now, jobId])
  }

  cancelJob(jobId: string): void {
    const now = Date.now()

    this.db.run(`
      UPDATE scan_jobs
      SET status = 'cancelled', completed_at = ?, last_heartbeat = ?
      WHERE id = ?
    `, [now, now, jobId])
  }

  getActiveJob(): ScanJob | null {
    const result = this.db.query(`
      SELECT * FROM scan_jobs
      WHERE status NOT IN ('completed', 'failed', 'cancelled')
      ORDER BY started_at DESC
      LIMIT 1
    `)

    if (result.length === 0) return null

    const row = result[0]
    return {
      id: row.id,
      status: row.status,
      totalPhotos: row.total_photos,
      processedPhotos: row.processed_photos,
      failedPhotos: row.failed_photos,
      lastProcessedId: row.last_processed_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      lastHeartbeat: row.last_heartbeat,
      errorMessage: row.error_message
    }
  }

  isJobStale(job: ScanJob): boolean {
    const fiveMinutes = 5 * 60 * 1000
    return Date.now() - job.lastHeartbeat > fiveMinutes
  }

  markJobAsFailed(jobId: string): void {
    this.failJob(jobId, 'Task timed out - no heartbeat for 5 minutes')
  }
}

export const scanJobService = new ScanJobService(database)
```

**在 main.ts 中检查恢复**：
```typescript
// electron/main/index.ts
async function checkAndRecoverScanJob() {
  const activeJob = scanJobService.getActiveJob()

  if (!activeJob) {
    console.log('[Main] No active scan job to recover')
    return
  }

  console.log('[Main] Found active scan job:', activeJob.id, 'status:', activeJob.status)

  if (scanJobService.isJobStale(activeJob)) {
    console.log('[Main] Scan job is stale (>5min no heartbeat), marking as failed')
    scanJobService.markJobAsFailed(activeJob.id)
  } else {
    console.log('[Main] Scan job is still active (<5min), can be resumed')
    // 存储到全局变量，供前端查询
    global.activeScanJob = activeJob
  }
}

// 在应用启动时调用
app.whenReady().then(async () => {
  // ... 其他初始化 ...
  await checkAndRecoverScanJob()
})
```

**暴露给渲染进程的 IPC**：
```typescript
// electron/main/index.ts
ipcMain.handle('scan-job:get-active', async () => {
  return scanJobService.getActiveJob()
})

ipcMain.handle('scan-job:resume', async (event, jobId: string) => {
  // 实现断点续传逻辑
  const job = scanJobService.getActiveJob()
  if (job && job.id === jobId) {
    // 从 lastProcessedId 继续扫描
    return faceDetectionQueue.resumeFromCheckpoint(job.lastProcessedId)
  }
  return { success: false, error: 'Job not found' }
})
```

### 文件修改清单

```
electron/database/db.ts                    # 修改：添加 scan_jobs 表创建
electron/services/scanJobService.ts        # 🆕 新增：扫描任务服务
electron/services/faceDetectionQueue.ts    # 修改：集成 ScanJobService
electron/main/index.ts                     # 修改：添加恢复检查和 IPC 处理
```

### 依赖关系

- **依赖**: E-10.1, E-10.2（状态管理基础）
- **依赖**: `uuid` 包（生成任务 ID）- 可能已存在
- **使用**: 现有的 `PhotoDatabase` 类
- **集成**: `FaceDetectionQueue`

### 测试策略

**手动测试步骤**:
1. 启动应用，开始扫描 974 张照片
2. 强制退出应用（模拟崩溃）
3. 重启应用，观察控制台是否检测到未完成任务
4. 选择继续扫描，验证从断点继续

**数据库验证**:
```sql
-- 查看所有任务
SELECT * FROM scan_jobs ORDER BY started_at DESC

-- 查看未完成任务
SELECT * FROM scan_jobs WHERE status NOT IN ('completed', 'failed', 'cancelled')
```

---

## Dev Agent Record

### Agent Model Used

<!-- To be filled by Dev Agent -->

### Debug Log References

<!-- To be filled by Dev Agent -->

### Completion Notes List

<!-- To be filled by Dev Agent -->

### File List

<!-- To be filled by Dev Agent -->

---

## Project Context Reference

- **Epic**: [E-10: 人脸扫描状态同步修复](../planning-artifacts/epics/09-epic-10-face-scan-fix.md)
- **Previous Story**: [E-10.2: 周期性状态对账机制](./e-10-2-periodic-state-reconciliation.md)
- **Sprint Status**: [sprint-status.yaml](./sprint-status.yaml)
- **Architecture**: Electron 28.x + SQLite (sql.js)
- **Related Services**: FaceDetectionQueue, PhotoDatabase

---

## Story Completion Status

**Status**: ready-for-dev

**Created**: 2026-02-06

**Ready For**: Dev Agent Implementation

**Blockers**: None (E-10.1 and E-10.2 are done)

**Next Story**: E-10.4 (智能诊断与自愈提示)
