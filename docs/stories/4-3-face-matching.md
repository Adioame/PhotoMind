# Story E-04.3: 人脸自动匹配

## Story Overview

**原始需求描述**:
作为用户，我希望系统能够自动将检测到的人脸与已标记的人物进行匹配，这样我可以快速为新照片中的人物添加标签。

**描述**:
当系统检测到新照片中的人脸后，自动提取人脸特征向量，与已有人物的脸向量进行相似度计算。如果相似度超过阈值，自动将人脸匹配到对应人物。

## Acceptance Criteria

### 功能性需求
- [ ] 提取检测到的人脸特征向量
- [ ] 存储每个人的脸向量（用于匹配）
- [ ] 支持相似度阈值设置
- [ ] 自动匹配高置信度的人脸
- [ ] 低置信度匹配需人工确认
- [ ] 支持同一人物多张照片
- [ ] 支持新增未知人物
- [ ] 支持匹配历史记录

### 非功能性需求
- [ ] 匹配准确率 > 85%
- [ ] 单次匹配时间 < 1 秒
- [ ] 支持批量自动匹配

## Implementation Steps

### Phase 1: 人脸嵌入服务

**文件**: `electron/services/faceEmbeddingService.ts`

```typescript
import { pipeline, env } from '@xenova/transformers'

interface FaceEmbeddingResult {
  faceId: string
  embedding: number[]
}

class FaceEmbeddingService {
  private model: any = null
  private modelVersion = 'Xenova/clip-vit-base-patch32' // 可使用专用人脸模型

  async initialize(): Promise<void> {
    if (!this.model) {
      this.model = await pipeline('feature-extraction', this.modelVersion, {
        quantized: true
      })
    }
  }

  async extractFaceEmbedding(
    imagePath: string,
    boundingBox: BoundingBox
  ): Promise<FaceEmbeddingResult> {
    await this.initialize()

    // 裁剪人脸区域
    const faceImage = await this.cropFace(imagePath, boundingBox)

    // 提取嵌入
    const output = await this.model(faceImage, {
      pooling: 'mean',
      normalize: true
    })

    return {
      faceId: crypto.randomUUID(),
      embedding: Array.from(output.data)
    }
  }

  private async cropFace(
    imagePath: string,
    boundingBox: BoundingBox
  ): Promise<any> {
    // 使用 sharp 裁剪人脸区域
    const faceBuffer = await sharp(imagePath)
      .extract({
        left: Math.floor(boundingBox.x),
        top: Math.floor(boundingBox.y),
        width: Math.floor(boundingBox.width),
        height: Math.floor(boundingBox.height)
      })
      .resize(224, 224)
      .toBuffer()

    return faceBuffer
  }
}
```

### Phase 2: 人脸匹配服务

**文件**: `electron/services/faceMatchingService.ts`

```typescript
import { cosineSimilarity } from '../utils/vectorMath'

interface MatchResult {
  faceId: string
  personId?: string
  personName?: string
  confidence: number
  action: 'matched' | 'suggested' | 'new'
}

interface MatchingOptions {
  autoMatchThreshold?: number  // >0.85 自动匹配
  suggestThreshold?: number    // >0.6 建议匹配
}

class FaceMatchingService {
  private faceEmbeddingService: FaceEmbeddingService
  private autoMatchThreshold = 0.85
  private suggestThreshold = 0.6

  async initialize(): Promise<void> {
    await this.faceEmbeddingService.initialize()
  }

  async matchFace(
    faceId: string,
    embedding: number[],
    options: MatchingOptions = {}
  ): Promise<MatchResult> {
    const autoThreshold = options.autoMatchThreshold ?? this.autoMatchThreshold
    const suggestThreshold = options.suggestThreshold ?? this.suggestThreshold

    // 获取所有已标记人物的脸向量
    const personEmbeddings = await this.getPersonEmbeddings()

    // 计算相似度
    let bestMatch: { personId: string; similarity: number } | null = null

    for (const { personId, embedding: personEmbedding } of personEmbeddings) {
      const similarity = cosineSimilarity(embedding, personEmbedding)

      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { personId, similarity }
      }
    }

    // 决策匹配
    if (bestMatch && bestMatch.similarity >= autoThreshold) {
      const person = await db.getPerson(bestMatch.personId)

      return {
        faceId,
        personId: bestMatch.personId,
        personName: person?.name,
        confidence: bestMatch.similarity,
        action: 'matched'
      }
    }

    if (bestMatch && bestMatch.similarity >= suggestThreshold) {
      const person = await db.getPerson(bestMatch.personId)

      return {
        faceId,
        personId: bestMatch.personId,
        personName: person?.name,
        confidence: bestMatch.similarity,
        action: 'suggested'
      }
    }

    return {
      faceId,
      confidence: 0,
      action: 'new'
    }
  }

  async matchDetectedFaces(photoId: string): Promise<MatchResult[]> {
    // 获取检测到的人脸
    const detectedFaces = await db.getDetectedFaces(photoId)

    const results: MatchResult[] = []

    for (const face of detectedFaces) {
      // 如果已有人物关联，跳过
      if (face.personId) continue

      // 提取嵌入并匹配
      const embedding = await this.faceEmbeddingService.extractFaceEmbedding(
        await this.getPhotoPath(photoId),
        face.boundingBox
      )

      const matchResult = await this.matchFace(face.id, embedding.embedding)
      results.push(matchResult)

      // 自动匹配
      if (matchResult.action === 'matched') {
        await db.markFaceAsProcessed(face.id, matchResult.personId!)
      }
    }

    return results
  }

  private async getPersonEmbeddings(): Promise<Array<{
    personId: string
    embedding: number[]
  }>> {
    // 获取所有人物的脸向量
    // 存储结构: person_face_embeddings (person_id, face_embedding)
    const rows = await db.all(
      `SELECT person_id, embedding FROM person_face_embeddings`
    )

    return rows.map(row => ({
      personId: row.person_id,
      embedding: deserializeEmbedding(row.embedding)
    }))
  }

  async storePersonEmbedding(personId: string, faceEmbedding: number[]): Promise<void> {
    // 存储人物的脸向量（用于后续匹配）
    await db.run(
      `INSERT INTO person_face_embeddings (person_id, embedding)
       VALUES (?, ?)`,
      personId,
      serializeEmbedding(faceEmbedding)
    )
  }

  private async getPhotoPath(photoId: string): Promise<string> {
    const photo = await db.getPhotoById(photoId)
    return photo?.path || ''
  }
}
```

### Phase 3: 批量匹配任务

**文件**: `electron/services/faceMatchingQueue.ts`

```typescript
class FaceMatchingQueue {
  private matchingService: FaceMatchingService
  private isProcessing = false

  async processPendingMatches(): Promise<void> {
    if (this.isProcessing) return
    this.isProcessing = true

    try {
      // 获取待匹配的照片
      const photos = await db.getPhotosWithUnmatchedFaces()

      for (const photo of photos) {
        const results = await this.matchingService.matchDetectedFaces(photo.id)

        // 保存匹配建议
        await this.saveSuggestions(results)
      }
    } finally {
      this.isProcessing = false
    }
  }

  private async saveSuggestions(results: MatchResult[]): Promise<void> {
    for (const result of results) {
      if (result.action === 'suggested') {
        await db.saveFaceSuggestion({
          faceId: result.faceId,
          suggestedPersonId: result.personId,
          confidence: result.confidence
        })
      }
    }
  }
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/faceEmbeddingService.ts` |
| 新建 | `electron/services/faceMatchingService.ts` |
| 新建 | `electron/services/faceMatchingQueue.ts` |
| 修改 | `electron/database/db.ts` |

## Dependencies

### 内部依赖
- `@xenova/transformers` - 嵌入模型
- `electron/utils/vectorMath.ts` - 相似度计算

### 外部依赖
- `@xenova/transformers`: ^2.17.0

## Testing Approach

### 单元测试
1. **嵌入提取测试**
   - 测试单张人脸
   - 测试不同角度

2. **匹配测试**
   - 测试同一人物匹配
   - 测试不同人物区分
   - 测试阈值边界

### 集成测试
1. **端到端测试**
   - 从检测到匹配完整流程
   - 批量匹配性能

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 提取人脸向量 | 验证返回 512 维向量 |
| 自动匹配准确 | 同一人物照片，验证自动匹配 |
| 阈值控制 | 调整阈值验证匹配行为变化 |
| 匹配 < 1 秒 | 使用 console.time 测量 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 匹配准确率低 | 高 | 人工确认建议匹配 |
| 新人物处理 | 中 | 支持新建人物 |
| 向量存储大 | 低 | 压缩存储 |

## Related Stories

### 前置依赖
- E-04.1: 手动标记人物 - 人物数据
- E-04.2: 人脸自动检测 - 人脸数据

### 后续故事
- E-04.4: 人物搜索 - 搜索支持

### 相关故事
- E-02.2: 图片向量生成 - 复用嵌入
