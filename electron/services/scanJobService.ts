/**
 * PhotoMind - 扫描任务服务
 *
 * 功能：
 * 1. 管理人脸扫描任务的持久化状态
 * 2. 支持任务进度跟踪
 * 3. 支持应用崩溃后恢复任务
 * 4. 支持断点续传
 */
import { v4 as uuidv4 } from 'uuid'
import { PhotoDatabase } from '../database/db.js'

export type ScanJobStatus =
  | 'pending'
  | 'detecting'
  | 'embedding'
  | 'clustering'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface ScanJob {
  id: string
  status: ScanJobStatus
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

  /**
   * 创建新的扫描任务
   * @param totalPhotos 总照片数
   * @returns 任务ID
   */
  createJob(totalPhotos: number): string {
    const id = uuidv4()
    const now = Date.now()

    this.db.run(
      `
      INSERT INTO scan_jobs (id, status, total_photos, processed_photos, failed_photos,
                            last_processed_id, started_at, completed_at, last_heartbeat, error_message)
      VALUES (?, 'detecting', ?, 0, 0, NULL, ?, NULL, ?, NULL)
    `,
      [id, totalPhotos, now, now]
    )

    console.log('[ScanJobService] Created job:', id, 'totalPhotos:', totalPhotos)
    return id
  }

  /**
   * 更新任务进度
   * @param jobId 任务ID
   * @param processed 已处理数量
   * @param lastPhotoId 最后处理的照片ID
   */
  updateProgress(jobId: string, processed: number, lastPhotoId: number): void {
    const now = Date.now()

    this.db.run(
      `
      UPDATE scan_jobs
      SET processed_photos = ?, last_processed_id = ?, last_heartbeat = ?
      WHERE id = ?
    `,
      [processed, lastPhotoId, now, jobId]
    )

    console.log(`[ScanJobService] Updated progress: ${processed}, lastPhotoId: ${lastPhotoId}`)
  }

  /**
   * 更新心跳时间（每处理一张照片时调用）
   * @param jobId 任务ID
   */
  updateHeartbeat(jobId: string): void {
    const now = Date.now()

    this.db.run(
      `
      UPDATE scan_jobs
      SET last_heartbeat = ?
      WHERE id = ?
    `,
      [now, jobId]
    )
  }

  /**
   * 增加失败计数
   * @param jobId 任务ID
   */
  incrementFailedCount(jobId: string): void {
    this.db.run(
      `
      UPDATE scan_jobs
      SET failed_photos = failed_photos + 1, last_heartbeat = ?
      WHERE id = ?
    `,
      [Date.now(), jobId]
    )
  }

  /**
   * 完成任务
   * @param jobId 任务ID
   * @param detectedFaces 检测到的人脸数量
   */
  completeJob(jobId: string, detectedFaces: number): void {
    const now = Date.now()

    this.db.run(
      `
      UPDATE scan_jobs
      SET status = 'completed', completed_at = ?, last_heartbeat = ?
      WHERE id = ?
    `,
      [now, now, jobId]
    )

    console.log('[ScanJobService] Completed job:', jobId, 'detectedFaces:', detectedFaces)
  }

  /**
   * 标记任务为失败
   * @param jobId 任务ID
   * @param error 错误信息
   */
  failJob(jobId: string, error: string): void {
    const now = Date.now()

    this.db.run(
      `
      UPDATE scan_jobs
      SET status = 'failed', error_message = ?, last_heartbeat = ?
      WHERE id = ?
    `,
      [error, now, jobId]
    )

    console.log('[ScanJobService] Failed job:', jobId, 'error:', error)
  }

  /**
   * 取消任务
   * @param jobId 任务ID
   */
  cancelJob(jobId: string): void {
    const now = Date.now()

    this.db.run(
      `
      UPDATE scan_jobs
      SET status = 'cancelled', completed_at = ?, last_heartbeat = ?
      WHERE id = ?
    `,
      [now, now, jobId]
    )

    console.log('[ScanJobService] Cancelled job:', jobId)
  }

  /**
   * 获取活跃任务（未完成的任务）
   * @returns 活跃任务或null
   */
  getActiveJob(): ScanJob | null {
    const result = this.db.query(
      `
      SELECT * FROM scan_jobs
      WHERE status NOT IN ('completed', 'failed', 'cancelled')
      ORDER BY started_at DESC
      LIMIT 1
    `
    )

    if (result.length === 0) return null

    return this.rowToScanJob(result[0])
  }

  /**
   * 根据ID获取任务
   * @param jobId 任务ID
   * @returns 任务或null
   */
  getJobById(jobId: string): ScanJob | null {
    const result = this.db.query('SELECT * FROM scan_jobs WHERE id = ?', [jobId])

    if (result.length === 0) return null

    return this.rowToScanJob(result[0])
  }

  /**
   * 检查任务是否过期（超过5分钟没有心跳）
   * @param job 任务
   * @returns 是否过期
   */
  isJobStale(job: ScanJob): boolean {
    const fiveMinutes = 5 * 60 * 1000
    return Date.now() - job.lastHeartbeat > fiveMinutes
  }

  /**
   * 标记任务为失败（用于过期任务）
   * @param jobId 任务ID
   */
  markJobAsFailed(jobId: string): void {
    this.failJob(jobId, 'Task timed out - no heartbeat for 5 minutes')
  }

  /**
   * 获取所有任务（用于管理界面）
   * @param limit 限制数量
   * @returns 任务列表
   */
  getAllJobs(limit: number = 100): ScanJob[] {
    const result = this.db.query(
      `
      SELECT * FROM scan_jobs
      ORDER BY started_at DESC
      LIMIT ?
    `,
      [limit]
    )

    return result.map((row) => this.rowToScanJob(row))
  }

  /**
   * 获取任务统计
   * @returns 统计信息
   */
  getStats(): {
    total: number
    active: number
    completed: number
    failed: number
    cancelled: number
  } {
    const total = this.db.query('SELECT COUNT(*) as count FROM scan_jobs')[0]?.count || 0
    const active =
      this.db.query(
        "SELECT COUNT(*) as count FROM scan_jobs WHERE status NOT IN ('completed', 'failed', 'cancelled')"
      )[0]?.count || 0
    const completed =
      this.db.query("SELECT COUNT(*) as count FROM scan_jobs WHERE status = 'completed'")[0]?.count ||
      0
    const failed =
      this.db.query("SELECT COUNT(*) as count FROM scan_jobs WHERE status = 'failed'")[0]?.count ||
      0
    const cancelled =
      this.db.query("SELECT COUNT(*) as count FROM scan_jobs WHERE status = 'cancelled'")[0]
        ?.count || 0

    return { total, active, completed, failed, cancelled }
  }

  /**
   * 删除旧任务（清理历史记录）
   * @param beforeDate 删除此日期之前的任务（时间戳）
   * @returns 删除的任务数
   */
  cleanupOldJobs(beforeDate: number): number {
    const result = this.db.run('DELETE FROM scan_jobs WHERE started_at < ?', [beforeDate])
    console.log('[ScanJobService] Cleaned up old jobs before:', beforeDate)
    return result.lastInsertRowid >= 0 ? 1 : 0
  }

  /**
   * 将数据库行转换为ScanJob对象
   */
  private rowToScanJob(row: any): ScanJob {
    return {
      id: row.id,
      status: row.status as ScanJobStatus,
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
}

// 导出单例实例（将在main/index.ts中初始化）
export let scanJobService: ScanJobService | null = null

/**
 * 初始化扫描任务服务
 * @param db 数据库实例
 */
export function initializeScanJobService(db: PhotoDatabase): ScanJobService {
  scanJobService = new ScanJobService(db)
  console.log('[ScanJobService] Initialized')
  return scanJobService
}
