# Story E-04.2: 人脸自动检测

## Story Overview

**原始需求描述**:
作为用户，我希望系统能够自动检测照片中的人脸，这样我可以更容易地管理和标记人物。

**描述**:
当导入新照片或批量处理时，系统使用人脸检测模型自动识别照片中的人脸区域。检测结果存储在数据库中，供后续的人脸匹配和人物搜索使用。

## Acceptance Criteria

### 功能性需求
- [ ] 自动检测照片中的人脸区域
- [ ] 返回人脸边界框坐标
- [ ] 估算人脸置信度
- [ ] 支持检测多个人脸
- [ ] 跳过无人脸的照片
- [ ] 处理不同角度的人脸
- [ ] 支持不同尺寸的人脸
- [ ] 检测结果持久化存储

### 非功能性需求
- [ ] 单张照片检测时间 < 2 秒
- [ ] 准确率 > 90%（在标准数据集上）
- [ ] 支持批量处理
- [ ] 内存占用合理

## Implementation Steps

### Phase 1: 人脸检测服务

**文件**: `electron/services/faceDetectionService.ts`

```typescript
import { pipeline, env } from '@xenova/transformers'

interface FaceDetectionResult {
  photoId: string
  faces: DetectedFace[]
}

interface DetectedFace {
  id: string
  boundingBox: BoundingBox
  confidence: number
  embedding?: number[]
}

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

class FaceDetectionService {
  private detector: any = null
  private modelVersion = 'Xenova/detection-resnet-50'
  private isProcessing = false

  async initialize(): Promise<void> {
    if (!this.detector) {
      this.detector = await pipeline('object-detection', this.modelVersion, {
        quantized: true
      })
    }
  }

  async detectFaces(photoPath: string, photoId: string): Promise<FaceDetectionResult> {
    await this.initialize()

    const faces: DetectedFace[] = []

    // 使用 CLIP 或专用人脸检测模型
    // 这里假设使用支持人脸检测的模型
    const output = await this.detector(photoPath, {
      threshold: 0.5,
      include_boxes: true
    })

    // 解析检测结果
    for (const detection of output) {
      if (detection.label === 'face' || detection.label === 'person') {
        faces.push({
          id: crypto.randomUUID(),
          boundingBox: {
            x: detection.box.xmin,
            y: detection.box.ymin,
            width: detection.box.xmax - detection.box.xmin,
            height: detection.box.ymax - detection.box.ymin
          },
          confidence: detection.score
        })
      }
    }

    return {
      photoId,
      faces
    }
  }

  async detectFacesBatch(
    photos: Array<{ photoId: string; path: string }>,
    onProgress?: (current: number, total: number) => void
  ): Promise<FaceDetectionResult[]> {
    if (this.isProcessing) {
      throw new Error('Detection already in progress')
    }

    this.isProcessing = true
    const results: FaceDetectionResult[] = []

    try {
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]
        const result = await this.detectFaces(photo.path, photo.photoId)
        results.push(result)

        // 存储检测结果
        await this.saveDetectionResult(result)

        onProgress?.(i + 1, photos.length)
      }

      return results
    } finally {
      this.isProcessing = false
    }
  }

  private async saveDetectionResult(result: FaceDetectionResult): Promise<void> {
    // 清空该照片的旧检测结果
    await db.run('DELETE FROM detected_faces WHERE photo_id = ?', result.photoId)

    // 保存新检测结果
    for (const face of result.faces) {
      await db.run(
        `INSERT INTO detected_faces (id, photo_id, bbox_x, bbox_y, bbox_width, bbox_height, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        face.id,
        result.photoId,
        face.boundingBox.x,
        face.boundingBox.y,
        face.boundingBox.width,
        face.boundingBox.height,
        face.confidence
      )
    }
  }
}
```

### Phase 2: 数据库扩展

**文件**: `electron/database/db.ts`

```typescript
// 人脸检测结果表
await db.exec(`
  CREATE TABLE IF NOT EXISTS detected_faces (
    id TEXT PRIMARY KEY,
    photo_id TEXT NOT NULL,
    bbox_x REAL NOT NULL,
    bbox_y REAL NOT NULL,
    bbox_width REAL NOT NULL,
    bbox_height REAL NOT NULL,
    confidence REAL NOT NULL,
    person_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (photo_id) REFERENCES photos(id),
    FOREIGN KEY (person_id) REFERENCES persons(id)
  )
`)

// 人脸操作
async function saveDetectedFaces(photoId: string, faces: DetectedFace[]): Promise<void>
async function getDetectedFaces(photoId: string): Promise<DetectedFace[]>
async function getUnprocessedPhotos(limit?: number): Promise<Photo[]>
async function markFaceAsProcessed(faceId: string, personId: string): Promise<void>
```

### Phase 3: 批量检测任务

**文件**: `electron/services/faceDetectionQueue.ts`

```typescript
interface DetectionTask {
  photoId: string
  path: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

class FaceDetectionQueue {
  private queue: DetectionTask[] = []
  private processingCount = 0
  private maxConcurrent = 1

  async processQueue(): Promise<void> {
    while (this.processingCount < this.maxConcurrent) {
      const nextTask = this.queue.find(t => t.status === 'pending')
      if (!nextTask) break

      nextTask.status = 'processing'
      this.processingCount++

      try {
        await faceDetectionService.detectFaces(nextTask.path, nextTask.photoId)
        nextTask.status = 'completed'
      } catch (error) {
        nextTask.status = 'failed'
        console.error(`Face detection failed for ${nextTask.photoId}:`, error)
      } finally {
        this.processingCount--
      }
    }
  }

  async addTask(photoId: string, path: string): Promise<void> {
    this.queue.push({
      photoId,
      path,
      status: 'pending'
    })
    this.processQueue()
  }

  async addBatch(tasks: Array<{ photoId: string; path: string }>): Promise<void> {
    for (const task of tasks) {
      await this.addTask(task.photoId, task.path)
    }
  }
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/faceDetectionService.ts` |
| 新建 | `electron/services/faceDetectionQueue.ts` |
| 修改 | `electron/database/db.ts` |

## Dependencies

### 内部依赖
- `@xenova/transformers` - 检测模型

### 外部依赖
- `@xenova/transformers`: ^2.17.0

## Testing Approach

### 单元测试
1. **检测测试**
   - 测试单人脸照片
   - 测试多人脸照片
   - 测试无人脸照片
   - 测试不同角度

### 性能测试
- 单张照片检测时间
- 批量检测吞吐量

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 检测人脸区域 | 输入含人脸照片，验证返回 boundingBox |
| 支持多人脸 | 输入合影照片，验证返回多个人脸 |
| 检测 < 2 秒 | 使用 console.time 测量 |
| 结果持久化 | 验证 detected_faces 表有记录 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 检测准确率低 | 中 | 调整阈值，人工确认 |
| 模型加载慢 | 低 | 预加载模型 |
| 内存占用高 | 中 | 限制并发数 |

## Related Stories

### 前置依赖
- E-04.1: 手动标记人物 - 关联人物

### 后续故事
- E-04.3: 人脸自动匹配 - 使用检测结果匹配人物

### 相关故事
- E-02.2: 图片向量生成 - 人脸向量
