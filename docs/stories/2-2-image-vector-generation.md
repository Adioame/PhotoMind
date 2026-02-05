# Story E-02.2: 图片向量生成

## Story Overview

**原始需求描述**:
作为用户，我希望能够为我的照片自动生成 CLIP 嵌入向量，这样我可以通过语义描述来搜索照片，实现"温暖的家庭照片"这样的自然语言搜索。

**描述**:
当用户导入新照片时，系统需要自动提取该照片的 CLIP 视觉特征向量并存储到数据库中。向量生成过程应在后台执行，不阻塞用户操作。系统需要支持批量生成已有照片的向量，并提供进度反馈。

## Acceptance Criteria

### 功能性需求
- [ ] 系统能够读取照片文件并解码为张量
- [ ] 使用 CLIP 模型提取图像特征向量（512 维或 768 维）
- [ ] 向量生成支持批量处理（多张照片）
- [ ] 生成过程提供进度反馈（当前处理/总数）
- [ ] 支持中断和恢复批量生成任务
- [ ] 成功生成的向量存储到 `vectors` 表
- [ ] 重复导入的照片不重复生成向量
- [ ] 向量生成失败时记录错误日志，不影响其他照片

### 非功能性需求
- [ ] 单张照片向量生成时间 < 3 秒（MacBook Air M2 基准）
- [ ] 批量生成支持并行处理（worker threads）
- [ ] 内存使用峰值 < 2GB
- [ ] 支持进度持久化（重启后可恢复）

## Implementation Steps

### Phase 1: 类型定义

**文件**: `electron/database/types.ts`

```typescript
interface PhotoVector {
  photoId: string
  embedding: number[]
  modelVersion: string
  createdAt: Date
}

interface VectorGenerationTask {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  totalCount: number
  processedCount: number
  failedCount: number
  errors: Array<{ photoId: string; error: string }>
  startedAt?: Date
  completedAt?: Date
}
```

### Phase 2: 数据库扩展

**文件**: `electron/database/db.ts`

添加 `vectors` 表和相关操作：

```typescript
// 创建 vectors 表
await db.exec(`
  CREATE TABLE IF NOT EXISTS vectors (
    photo_id TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    model_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (photo_id) REFERENCES photos(id)
  )
`)

// 存储向量
async function storeVector(photoId: string, embedding: number[], modelVersion: string): Promise<void>

// 批量存储向量
async function storeVectors(vectors: Array<{ photoId: string; embedding: number[] }>): Promise<void>

// 获取向量
async function getVector(photoId: string): Promise<number[] | null>

// 检查向量是否存在
async function hasVector(photoId: string): Promise<boolean>

// 删除向量
async function deleteVector(photoId: string): Promise<void>

// 获取需要生成向量的照片
async function getPhotosWithoutVectors(limit?: number): Promise<Photo[]>
```

### Phase 3: 嵌入服务实现

**文件**: `electron/services/embeddingService.ts`

```typescript
import { pipeline, env } from '@xenova/transformers'
import type { Photo } from '../database/types'
import * as db from '../database/db'

// 跳过本地模型检查
env.allowLocalModels = false
env.useBrowserCache = false

class EmbeddingService {
  private extractor: any = null
  private modelVersion = 'Xenova/clip-vit-base-patch32'
  private isGenerating = false

  async initialize(): Promise<void> {
    if (!this.extractor) {
      this.extractor = await pipeline('feature-extraction', this.modelVersion, {
        quantized: true
      })
    }
  }

  async generateEmbedding(imagePath: string): Promise<number[]> {
    await this.initialize()

    // 读取并预处理图片
    const imageBuffer = await fs.promises.readFile(imagePath)
    const imageData = await this.preprocessImage(imageBuffer)

    // 提取特征
    const output = await this.extractor(imageData, {
      pooling: 'mean',
      normalize: true
    })

    // 转换为普通数组
    return Array.from(output.data)
  }

  async generateAllEmbeddings(
    onProgress?: (current: number, total: number) => void
  ): Promise<VectorGenerationTask> {
    if (this.isGenerating) {
      throw new Error('向量生成任务已在运行')
    }

    this.isGenerating = true
    const taskId = crypto.randomUUID()
    const errors: Array<{ photoId: string; error: string }> = []

    try {
      const photos = await db.getPhotosWithoutVectors()
      const totalCount = photos.length
      let processedCount = 0
      let failedCount = 0

      for (const photo of photos) {
        try {
          const embedding = await this.generateEmbedding(photo.path)
          await db.storeVector(photo.id, embedding, this.modelVersion)
          processedCount++
        } catch (error) {
          failedCount++
          errors.push({
            photoId: photo.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }

        onProgress?.(processedCount + failedCount, totalCount)
      }

      return {
        id: taskId,
        status: failedCount > 0 ? 'completed' : 'completed',
        totalCount,
        processedCount,
        failedCount,
        errors,
        startedAt: new Date(),
        completedAt: new Date()
      }
    } finally {
      this.isGenerating = false
    }
  }

  async generateMissingEmbeddings(
    batchSize: number = 50,
    onProgress?: (current: number, total: number) => void
  ): Promise<VectorGenerationTask> {
    // 分批处理未生成向量的照片
    const photos = await db.getPhotosWithoutVectors(batchSize)
    // ... 实现逻辑
  }

  private async preprocessImage(imageBuffer: Buffer): Promise<any> {
    // 图片预处理逻辑
  }
}

export const embeddingService = new EmbeddingService()
```

### Phase 4: 图片预处理

**文件**: `electron/services/imagePreprocessor.ts`

```typescript
import sharp from 'sharp'

interface PreprocessedImage {
  data: Float32Array
  width: number
  height: number
}

async function preprocessImage(imageBuffer: Buffer): Promise<PreprocessedImage> {
  // 1. 解码图片
  const { data, info } = await sharp(imageBuffer)
    .resize(224, 224, { fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  // 2. 转换为 RGB float 数组 (CLIP 期望的输入格式)
  const floatData = new Float32Array(224 * 224 * 3)
  const pixels = info.channels === 4 ? removeAlpha(data) : data

  // 3. 归一化到 [0, 1]
  for (let i = 0; i < pixels.length; i++) {
    floatData[i] = pixels[i] / 255
  }

  return {
    data: floatData,
    width: info.width,
    height: info.height
  }
}

function removeAlpha(buffer: Buffer): Buffer {
  // 移除 alpha 通道，只保留 RGB
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/database/vectorTypes.ts` |
| 修改 | `electron/database/db.ts` |
| 新建 | `electron/services/embeddingService.ts` |
| 新建 | `electron/services/imagePreprocessor.ts` |
| 新建 | `electron/services/index.ts` |

## Dependencies

### 内部依赖
- `electron/database/types.ts` - Photo 类型定义
- `@xenova/transformers` - CLIP 模型
- `sharp` - 图片处理

### 外部依赖
- `@xenova/transformers`: ^2.17.0
- `sharp`: ^0.33.0

## Testing Approach

### 单元测试
1. **图片预处理测试**
   - 测试不同尺寸图片的预处理
   - 测试透明度通道处理
   - 测试归一化结果

2. **向量生成测试**
   - 测试单张照片向量生成
   - 测试批量向量生成
   - 测试错误处理（损坏的图片文件）

### 集成测试
1. **数据库测试**
   - 测试向量存储和读取
   - 测试批量存储性能
   - 测试数据一致性

2. **端到端测试**
   - 测试从导入到向量生成的完整流程
   - 测试进度反馈准确性
   - 测试内存使用情况

### 性能测试
- 单张照片生成时间基准测试
- 批量处理吞吐量测试
- 并发处理能力测试

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 系统能够读取照片并生成向量 | 导入测试照片，验证 `vectors` 表中有对应记录 |
| 向量维度正确（512 或 768） | 检查生成的 embedding 数组长度 |
| 批量处理支持 | 导入 100 张照片，验证全部生成向量 |
| 进度反馈准确 | 检查 onProgress 回调是否返回正确的完成数量 |
| 错误不阻塞其他照片 | 故意导入损坏文件，验证其他照片正常处理 |
| 单张照片 < 3 秒 | 使用 console.time 测量单次生成时间 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 内存不足（批量处理） | 高 | 使用流式处理，限制并发数 |
| 模型加载慢 | 中 | 预加载模型，懒加载首次调用 |
| 图片格式不支持 | 低 | 捕获异常，记录日志，跳过处理 |
| 磁盘空间不足 | 中 | 检查空间，警告用户 |

## Related Stories

### 前置依赖
- E-02.1: CLIP 模型集成 - 需要 `@xenova/transformers` 环境准备

### 后续故事
- E-02.3: 文本向量生成 - 使用生成的图像向量进行相似度匹配
- E-02.4: 向量相似度搜索 - 基于图像向量实现搜索

### 相关故事
- E-01.3: 元数据提取 - 获取照片路径信息
- E-05.1: 搜索界面优化 - 显示向量生成进度
