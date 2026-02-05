# 7. 性能架构

## 7.1 性能目标

| 指标 | 目标 | 测量方式 |
|------|------|----------|
| 搜索响应时间 | < 3 秒 | 前端测量 |
| 向量生成速度 | 10 张/秒 | 后端测量 |
| 内存占用 | < 500MB | 系统监控 |
| 冷启动时间 | < 10 秒 | 用户测量 |

## 7.2 性能优化策略

### 7.2.1 向量计算优化

```typescript
class EmbeddingService {
  // 1. 批量处理
  async batchToEmbeddings(imagePaths: string[], batchSize: number = 8): Promise<void> {
    for (let i = 0; i < imagePaths.length; i += batchSize) {
      const batch = imagePaths.slice(i, i + batchSize);
      await Promise.all(batch.map(p => this.imageToEmbedding(p)));
    }
  }

  // 2. Web Worker 移出主线程
  // embedding.worker.ts
  self.onmessage = async (e) => {
    const { imagePath } = e.data;
    const embedding = await computeEmbedding(imagePath);
    self.postMessage({ embedding });
  };
}
```

### 7.2.2 数据库优化

```sql
-- 向量搜索优化：定期清理未使用的向量
DELETE FROM vectors WHERE photo_uuid NOT IN (SELECT uuid FROM photos);

-- 照片表定期优化
VACUUM photos;
```

### 7.2.3 缓存策略

```
┌─────────────────────────────────────────────────────────┐
│                    缓存层级                               │
├─────────────────────────────────────────────────────────┤
│  L1: 内存缓存 (JavaScript Heap)                         │
│       • CLIP 模型实例                                   │
│       • 热点照片缩略图                                 │
│                                                         │
│  L2: 磁盘缓存 (User Data/Cache)                        │
│       • CLIP 模型文件 (~600MB)                          │
│       • 照片缩略图                                      │
│       • 向量索引                                        │
│                                                         │
│  L3: 数据库缓存 (SQLite)                                │
│       • 照片元数据                                      │
│       • 人脸特征                                        │
└─────────────────────────────────────────────────────────┘
```
