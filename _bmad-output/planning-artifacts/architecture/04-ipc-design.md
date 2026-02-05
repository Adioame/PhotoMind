# 4. IPC 接口设计

## 4.1 接口清单

| 命名空间 | 方法 | 输入 | 输出 | 描述 |
|----------|------|------|------|------|
| **photos** |||||
|| get-list | {page, limit, filters} | Photo[] | 分页获取照片 |
|| get-detail | {uuid} | Photo | 获取照片详情 |
|| search | {query, mode} | SearchResult[] | 搜索照片 |
|| import-folder | {path} | {taskId} | 导入文件夹 |
|| get-import-progress | {taskId} | Progress | 获取导入进度 |
|| generate-embeddings | {} | {taskId} | 批量生成向量 |
|| get-embedding-progress | {taskId} | Progress | 获取向量进度 |
| **people** |||||
|| get-all | {} | Person[] | 获取人物列表 |
|| add | {name, photoUuid} | Person | 添加人物 |
|| search-photos | {name} | Photo[] | 搜索人物照片 |
| **config** |||||
|| get | {} | Config | 获取配置 |
|| set-api-key | {key} | boolean | 设置 API Key |

## 4.2 搜索接口详细定义

```typescript
// photos:search
interface SearchRequest {
  query: string;           // "去年在海边的照片"
  mode: 'keyword' | 'semantic' | 'hybrid';  // 搜索模式
  options?: {
    topK?: number;        // 向量搜索返回数量
    keywordWeight?: number; // 关键词权重 (默认 0.6)
    semanticWeight?: number; // 语义权重 (默认 0.4)
  };
}

interface SearchResult {
  photo: Photo;
  score: number;          // 综合置信度 0-1
  sources: ('keyword' | 'semantic')[];  // 匹配来源
  matchedAt?: {            // 匹配详情
    time?: boolean;        // 时间匹配
    location?: boolean;    // 地点匹配
    person?: boolean;      // 人物匹配
  };
}

interface SearchResponse {
  results: SearchResult[];
  totalTime: number;       // 搜索耗时 (ms)
  parsedQuery: ParsedQuery; // LLM 解析结果
}
```

## 4.3 进度回调接口

```typescript
interface Progress {
  status: 'running' | 'completed' | 'failed';
  current: number;
  total: number;
  percent: number;
  message?: string;
  error?: string;
}

// IPC 事件推送
ipcMain.send('photos:import-progress', progress);
ipcMain.send('photos:embedding-progress', progress);
```
