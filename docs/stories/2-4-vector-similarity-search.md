# Story E-02.4: 向量相似度搜索

## Story Overview

**原始需求描述**:
作为用户，我希望系统能够基于向量相似度返回最匹配的照片，这样我可以通过自然语言描述找到语义相关的照片。

**描述**:
当用户执行语义搜索时，系统需要计算查询向量与所有照片向量之间的相似度，返回相似度最高的结果。搜索结果需要支持分页和相关度排序。

## Acceptance Criteria

### 功能性需求
- [ ] 支持余弦相似度计算
- [ ] 支持欧氏距离计算
- [ ] 返回 Top-K 最相似结果（默认 K=50）
- [ ] 支持相似度阈值过滤（minScore）
- [ ] 搜索结果按相似度降序排列
- [ ] 支持分页加载
- [ ] 返回结果包含相似度分数
- [ ] 处理空向量或无效输入

### 非功能性需求
- [ ] 1000 张照片搜索时间 < 500ms
- [ ] 10000 张照片搜索时间 < 2s
- [ ] 内存占用合理（不加载所有向量到内存）
- [ ] 搜索结果可复现（相同查询返回相同结果）

## Implementation Steps

### Phase 1: 相似度计算工具

**文件**: `electron/utils/vectorMath.ts`

```typescript
/**
 * 计算两个向量的余弦相似度
 * cos(A, B) = (A · B) / (||A|| * ||B||)
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vector dimensions must match')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)

  if (denominator === 0) {
    return 0
  }

  return dotProduct / denominator
}

/**
 * 计算两个向量的欧氏距离
 * d(A, B) = sqrt(sum((Ai - Bi)^2))
 */
function euclideanDistance(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vector dimensions must match')
  }

  let sumSquaredDiff = 0

  for (let i = 0; i < vecA.length; i++) {
    const diff = vecA[i] - vecB[i]
    sumSquaredDiff += diff * diff
  }

  return Math.sqrt(sumSquaredDiff)
}

/**
 * 将欧氏距离转换为相似度分数 (0-1)
 */
function distanceToSimilarity(distance: number, maxDistance: number = 10): number {
  return Math.max(0, 1 - distance / maxDistance)
}

/**
 * 批量计算相似度
 */
function batchCosineSimilarity(
  queryVector: number[],
  targetVectors: number[][]
): { index: number; similarity: number }[] {
  const results: { index: number; similarity: number }[] = []

  for (let i = 0; i < targetVectors.length; i++) {
    const similarity = cosineSimilarity(queryVector, targetVectors[i])
    results.push({ index: i, similarity })
  }

  return results
}
```

### Phase 2: 数据库向量搜索实现

**文件**: `electron/database/db.ts`

```typescript
import { cosineSimilarity } from '../utils/vectorMath'

interface VectorSearchOptions {
  limit?: number
  minScore?: number
  includeScore?: boolean
}

interface SearchResult {
  photoId: string
  photo: Photo
  score: number
}

interface VectorSearchResult {
  results: SearchResult[]
  totalScanned: number
  searchTime: number
}

async function searchByVector(
  embedding: number[],
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult> {
  const { limit = 50, minScore = 0, includeScore = true } = options

  const startTime = Date.now()

  // 获取所有向量（分批处理以避免内存问题）
  const vectors = await db.all('SELECT photo_id, embedding FROM vectors')
  const vectorData = vectors.map(v => {
    try {
      // embedding 存储为 BLOB，需要反序列化为数组
      return {
        photoId: v.photo_id,
        embedding: deserializeEmbedding(v.embedding)
      }
    } catch {
      return null
    }
  }).filter((v): v is { photoId: string; embedding: number[] } => v !== null)

  // 计算相似度
  const scoredResults: SearchResult[] = []

  for (const vector of vectorData) {
    const score = cosineSimilarity(embedding, vector.embedding)

    if (score >= minScore) {
      const photo = await getPhotoById(vector.photoId)
      if (photo) {
        scoredResults.push({
          photoId: vector.photoId,
          photo,
          score: includeScore ? score : 1 - score
        })
      }
    }
  }

  // 排序并限制数量
  scoredResults.sort((a, b) => b.score - a.score)
  const topResults = scoredResults.slice(0, limit)

  const searchTime = Date.now() - startTime

  return {
    results: topResults,
    totalScanned: vectorData.length,
    searchTime
  }
}

async function searchByVectorBatch(
  embeddings: number[][],
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
  // 多向量搜索（用于融合查询）
  const results: VectorSearchResult[] = []

  for (const embedding of embeddings) {
    const result = await searchByVector(embedding, options)
    results.push(result)
  }

  return results
}

function deserializeEmbedding(blob: Buffer): number[] {
  // 从 BLOB 反序列化向量
  // 存储时使用 Float32Array.toBuffer()
  return new Float32Array(blob.buffer, blob.byteOffset, blob.length / 4)
}
```

### Phase 3: 优化版本 - 近似最近邻搜索

**文件**: `electron/services/vectorIndex.ts`

```typescript
/**
 * 向量索引服务 - 支持近似最近邻搜索优化
 * 使用简单的 IVF (Inverted File Index) 思想
 */

interface Cluster {
  centroid: number[]
  photoIds: string[]
}

class VectorIndex {
  private clusters: Cluster[] = []
  private kMeansIterations = 10
  private numClusters = 100

  // 构建索引
  async buildIndex(vectors: Array<{ photoId: string; embedding: number[] }>): Promise<void> {
    // 1. 初始化聚类中心（随机选择 k 个向量）
    this.clusters = await this.initializeClusters(vectors)

    // 2. K-Means 聚类
    for (let iter = 0; iter < this.kMeansIterations; iter++) {
      // 清空聚类
      this.clusters.forEach(c => c.photoIds = [])

      // 分配向量到最近的聚类
      for (const vector of vectors) {
        const nearestCluster = this.findNearestCluster(vector.embedding)
        nearestCluster.photoIds.push(vector.photoId)
      }

      // 更新聚类中心
      await this.updateCentroids()
    }
  }

  // 搜索
  async search(
    queryVector: number[],
    options: { limit?: number; numProbes?: number } = {}
  ): Promise<Array<{ photoId: string; score: number }>> {
    const { limit = 50, numProbes = 5 } = options

    // 1. 找到最近的 n 个聚类
    const probeClusters = this.findNearestClusters(queryVector, numProbes)

    // 2. 在这些聚类中搜索
    const candidates: Array<{ photoId: string; score: number }> = []

    for (const cluster of probeClusters) {
      for (const photoId of cluster.photoIds) {
        // 获取向量并计算相似度
        const vector = await this.getEmbedding(photoId)
        if (vector) {
          const score = cosineSimilarity(queryVector, vector)
          candidates.push({ photoId, score })
        }
      }
    }

    // 3. 返回 top-k
    candidates.sort((a, b) => b.score - a.score)
    return candidates.slice(0, limit)
  }

  private async initializeClusters(
    vectors: Array<{ photoId: string; embedding: number[] }>
  ): Promise<Cluster[]> {
    // 随机选择聚类中心
    const shuffled = [...vectors].sort(() => Math.random() - 0.5)
    const centroids = shuffled.slice(0, this.numClusters)

    return centroids.map(c => ({
      centroid: c.embedding,
      photoIds: [] as string[]
    }))
  }

  private findNearestCluster(vector: number[]): Cluster {
    let nearest = this.clusters[0]
    let maxSimilarity = -1

    for (const cluster of this.clusters) {
      const similarity = cosineSimilarity(vector, cluster.centroid)
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity
        nearest = cluster
      }
    }

    return nearest
  }

  private findNearestClusters(vector: number[], numProbes: number): Cluster[] {
    const scored = this.clusters.map((cluster, index) => ({
      cluster,
      score: cosineSimilarity(vector, cluster.centroid),
      index
    }))

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, numProbes).map(s => s.cluster)
  }

  private async updateCentroids(): Promise<void> {
    // 更新每个聚类的中心点
    for (const cluster of this.clusters) {
      if (cluster.photoIds.length === 0) continue

      // 计算所有向量的平均值
      const vectors = await Promise.all(
        cluster.photoIds.map(id => this.getEmbedding(id))
      )

      const validVectors = vectors.filter((v): v is number[] => v !== null)

      if (validVectors.length > 0) {
        const avgVector = validVectors[0].map((_, i) => {
          const sum = validVectors.reduce((acc, v) => acc + v[i], 0)
          return sum / validVectors.length
        })

        cluster.centroid = avgVector
      }
    }
  }

  private async getEmbedding(photoId: string): Promise<number[] | null> {
    const result = await db.get(
      'SELECT embedding FROM vectors WHERE photo_id = ?',
      photoId
    )
    return result ? deserializeEmbedding(result.embedding) : null
  }
}
```

### Phase 4: 集成到搜索流程

**文件**: `electron/database/db.ts`

```typescript
// 优化版本的向量搜索
async function searchByVectorOptimized(
  embedding: number[],
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult> {
  const { limit = 50, minScore = 0 } = options

  const startTime = Date.now()

  // 检查是否已构建索引
  const index = vectorIndexService.getIndex()

  let results: Array<{ photoId: string; score: number }>

  if (index) {
    // 使用索引搜索
    results = await index.search(embedding, { limit: limit * 2 })
  } else {
    // 回退到暴力搜索
    const searchResult = await searchByVector(embedding, {
      limit: limit * 2,
      minScore
    })
    results = searchResult.results.map(r => ({
      photoId: r.photoId,
      score: r.score
    }))
  }

  // 过滤和排序
  const filtered = results
    .filter(r => r.score >= minScore)
    .slice(0, limit)

  // 获取照片详情
  const photos = await Promise.all(
    filtered.map(async (r) => {
      const photo = await getPhotoById(r.photoId)
      return photo ? { photo, score: r.score } : null
    })
  )

  const validResults = photos
    .filter((r): r is { photo: Photo; score: number } => r !== null)
    .sort((a, b) => b.score - a.score)

  return {
    results: validResults.map(r => ({
      photoId: r.photo.id,
      photo: r.photo,
      score: r.score
    })),
    totalScanned: index ? 'indexed' : await db.get('SELECT COUNT(*) FROM vectors'),
    searchTime: Date.now() - startTime
  }
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/utils/vectorMath.ts` |
| 新建 | `electron/services/vectorIndex.ts` |
| 修改 | `electron/database/db.ts` |

## Dependencies

### 内部依赖
- `electron/database/types.ts` - Photo 类型
- `electron/services/embeddingService.ts` - 嵌入向量

### 外部依赖
- 无新增外部依赖

## Testing Approach

### 单元测试
1. **相似度计算测试**
   - 测试余弦相似度计算正确性
   - 测试相同向量相似度为 1
   - 测试正交向量相似度为 0
   - 测试相反向量相似度为 -1

2. **欧氏距离测试**
   - 测试相同向量距离为 0
   - 测试距离转换公式

### 集成测试
1. **数据库搜索测试**
   - 测试搜索返回正确数量
   - 测试结果按相似度排序
   - 测试 minScore 过滤
   - 测试搜索时间

### 性能测试
- 1000/10000/50000 张照片的搜索时间
- 索引构建时间
- 内存使用情况

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 支持余弦相似度计算 | 对相同向量测试，返回值接近 1.0 |
| 返回 Top-K 结果 | 搜索 limit=10，验证返回 10 条结果 |
| 按相似度排序 | 验证结果列表中 score 递减 |
| 1000 张照片 < 500ms | 使用 console.time 测量搜索时间 |
| 10000 张照片 < 2s | 使用 console.time 测量搜索时间 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 暴力搜索性能差 | 高 | 实现向量索引（IVF） |
| 内存不足 | 中 | 分批处理，懒加载 |
| 索引构建时间长 | 中 | 后台异步构建 |

## Related Stories

### 前置依赖
- E-02.2: 图片向量生成 - 需要存储的向量
- E-02.3: 文本向量生成 - 需要查询向量

### 后续故事
- E-03.3: 全局向量搜索 - 扩展搜索范围
- E-03.4: 结果融合 - 合并多代理搜索结果

### 相关故事
- E-02.5: 增量向量生成 - 新照片索引更新
- E-05.2: 搜索结果展示 - 显示相似度分数
