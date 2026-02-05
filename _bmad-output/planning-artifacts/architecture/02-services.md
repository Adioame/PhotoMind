# 2. 核心服务架构

## 2.1 服务清单

```
electron/services/
├── localPhotoService.ts    # 本地照片导入服务
├── iCloudService.ts        # iCloud 照片同步服务
├── searchService.ts        # 搜索服务（混合搜索）
├── embeddingService.ts     # CLIP 向量嵌入服务 ⭐ NEW
├── faceRecognitionService.ts # 人脸识别服务 ⭐ NEW
├── thumbnailService.ts     # 缩略图生成服务
└── configService.ts        # 配置管理服务
```

## 2.2 混合搜索服务架构

### 2.2.1 搜索流程

```
用户查询: "去年在海边的照片"
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                  SearchService                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Step 1: QueryParser (LLM 解析)                  │   │
│  │  • 提取时间条件: 去年                            │   │
│  │  • 提取地点条件: 海边                            │   │
│  │  • 提取语义描述: 温暖、阳光、度假氛围             │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Step 2: 并行执行搜索                            │   │
│  │                                                 │   │
│  │  A. KeywordSearch                               │   │
│  │     • SQL 查询时间范围                           │   │
│  │     • JSON 解析地点匹配                         │   │
│  │     • 人物关联查询                              │   │
│  │                    │                            │   │
│  │                    ▼                            │   │
│  │     results_A: [photo_1, photo_5, photo_8...]  │   │
│  │                                                 │   │
│  │  B. SemanticSearch                              │   │
│  │     • CLIP 文本 → 向量                         │   │
│  │     • 向量相似度搜索                            │   │
│  │     • top-K 结果                                │   │
│  │                    │                            │   │
│  │                    ▼                            │   │
│  │     results_B: [photo_3, photo_7, photo_12...]  │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Step 3: ResultMerger (结果融合)                │   │
│  │  • 并集计算                                     │   │
│  │  • 去重处理                                     │   │
│  │  • 加权评分: score = 0.6 * keyword + 0.4 * sim  │   │
│  │  • 按置信度降序排列                             │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│                 [排序后的照片列表]                       │
└─────────────────────────────────────────────────────────┘
```

### 2.2.2 QueryParser (LLM 解析)

```typescript
interface ParsedQuery {
  // 明确条件
  timeRange?: {
    start?: Date;
    end?: Date;
    relative?: string; // "去年", "上个月"
  };
  locationKeywords?: string[];
  personNames?: string[];

  // 语义描述（用于向量搜索）
  semanticDescription?: string;

  // 置信度
  confidence: number;
}
```

**LLM Prompt 模板:**

```
你是一个照片搜索解析器。用户输入查询，你需要解析出：
1. 时间条件（精确日期或相对时间如"去年"）
2. 地点关键词
3. 人物名称
4. 语义描述（用于向量搜索）

用户查询: {{userQuery}}

请返回 JSON 格式:
{
  "timeRange": {"relative": "去年"},
  "locationKeywords": ["海边"],
  "personNames": [],
  "semanticDescription": "温暖阳光、度假氛围、海滩风景",
  "confidence": 0.85
}
```

### 2.2.3 KeywordSearch (关键词搜索)

```typescript
class KeywordSearch {
  async search(parsed: ParsedQuery): Promise<SearchResult[]> {
    let query = 'SELECT * FROM photos WHERE 1=1';
    const params: any[] = [];

    // 时间条件
    if (parsed.timeRange) {
      query += ' AND taken_at BETWEEN ? AND ?';
      params.push(parsed.timeRange.start, parsed.timeRange.end);
    }

    // 地点关键词 (JSON 解析)
    if (parsed.locationKeywords?.length > 0) {
      query += ' AND location_data LIKE ?';
      params.push(`%${parsed.locationKeywords[0]}%`);
    }

    // 人物关联
    if (parsed.personNames?.length > 0) {
      query += `
        AND uuid IN (
          SELECT photo_uuid FROM faces f
          JOIN persons p ON f.person_id = p.id
          WHERE p.name = ?
        )
      `;
      params.push(parsed.personNames[0]);
    }

    return this.db.execute(query, params);
  }
}
```

### 2.2.4 SemanticSearch (语义搜索)

```typescript
class SemanticSearch {
  constructor(private embeddingService: EmbeddingService) {}

  async search(query: string, topK: number = 50): Promise<SearchResult[]> {
    // 1. 文本转向量
    const queryVector = await this.embeddingService.textToEmbedding(query);

    // 2. 向量相似度搜索
    const results = await this.vectorStore.cosineSearch(queryVector, topK);

    return results.map(r => ({
      photo: r.photo,
      score: r.similarity,
      source: 'semantic'
    }));
  }
}
```

### 2.2.5 ResultMerger (结果融合)

```typescript
class ResultMerger {
  merge(keywordResults: SearchResult[], semanticResults: SearchResult[]): SearchResult[] {
    // 1. 并集计算
    const combined = new Map<string, SearchResult>();

    // 2. 处理关键词结果 (权重 0.6)
    for (const r of keywordResults) {
      combined.set(r.photo.uuid, {
        ...r,
        score: r.score * 0.6,
        sources: ['keyword']
      });
    }

    // 3. 处理语义结果 (权重 0.4)
    for (const r of semanticResults) {
      const existing = combined.get(r.photo.uuid);
      if (existing) {
        existing.score += r.score * 0.4;
        existing.sources.push('semantic');
      } else {
        combined.set(r.photo.uuid, {
          ...r,
          score: r.score * 0.4,
          sources: ['semantic']
        });
      }
    }

    // 4. 去重和排序
    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score);
  }
}
```

## 2.3 EmbeddingService (CLIP 嵌入服务)

### 2.3.1 服务职责

```
┌─────────────────────────────────────────────────────────┐
│                 EmbeddingService                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐    ┌─────────────────┐          │
│  │ CLIP Pipeline    │    │  VectorStore    │          │
│  │                 │    │                 │          │
│  │ • textToVector  │───►│ • storeVector  │          │
│  │ • imageToVector │    │ • cosineSearch │          │
│  │ • batchProcess  │    │ • batchStore   │          │
│  └─────────────────┘    └─────────────────┘          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.3.2 CLIP 模型集成

```typescript
import { pipeline, env } from '@xenova/transformers';

// 禁用本地模型检查（使用预下载的模型）
env.allowLocalModels = false;
env.useBrowserCache = true;

class EmbeddingService {
  private extractor: any;
  private modelPath = 'Xenova/clip-vit-base-patch32';

  async initialize(): Promise<void> {
    this.extractor = await pipeline('feature-extraction', this.modelPath);
  }

  async textToEmbedding(text: string): Promise<number[]> {
    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }

  async imageToEmbedding(imagePath: string): Promise<number[]> {
    const output = await this.extractor(imagePath, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }
}
```

### 2.3.3 向量存储

```typescript
interface VectorRecord {
  id: number;
  photo_uuid: string;
  embedding: Blob;  // Float32Array 转为 Blob
  embedding_type: 'image';  // 暂时只支持图片向量
  created_at: Date;
}

class VectorStore {
  constructor(private db: Database) {}

  async storeVector(photoUuid: string, embedding: number[]): Promise<void> {
    const blob = this.embeddingToBlob(embedding);
    await this.db.execute(
      'INSERT INTO vectors (photo_uuid, embedding, embedding_type, created_at) VALUES (?, ?, ?, ?)',
      [photoUuid, blob, 'image', new Date()]
    );
  }

  async cosineSearch(queryVector: number[], topK: number = 50): Promise<VectorResult[]> {
    const vectors = await this.db.all('SELECT photo_uuid, embedding FROM vectors');

    const results = vectors.map(v => ({
      photo_uuid: v.photo_uuid,
      similarity: this.cosineSimilarity(queryVector, this.blobToEmbedding(v.embedding))
    }));

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, x, i) => sum + x * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, x) => sum + x * x, 0));
    const normB = Math.sqrt(b.reduce((sum, x) => sum + x * x, 0));
    return dotProduct / (normA * normB);
  }
}
```

### 2.3.4 批量向量生成

```typescript
class EmbeddingService {
  async generateAllEmbeddings(progressCallback?: (current: number, total: number) => void): Promise<void> {
    const photos = await this.db.all('SELECT uuid, file_path FROM photos WHERE uuid NOT IN (SELECT photo_uuid FROM vectors)');
    const total = photos.length;

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];

      try {
        const embedding = await this.imageToEmbedding(photo.file_path);
        await this.vectorStore.storeVector(photo.uuid, embedding);
      } catch (error) {
        console.error(`Failed to generate embedding for ${photo.uuid}:`, error);
      }

      progressCallback?.(i + 1, total);
    }
  }
}
```
