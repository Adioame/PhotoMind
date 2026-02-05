# Story File: E-02.1 CLIP 模型集成

**Epic:** E-02 CLIP 语义搜索
**Story ID:** 2-1-clip-model-integration
**Status:** ready-for-dev
**Priority:** P1 (Epic 2 第一个 story，核心依赖)
**Estimated Points:** 5

---

## Story Overview

**As a** 开发者,
**I want** 集成 CLIP 模型到 PhotoMind,
**So that** 系统可以进行图片和文本的语义嵌入

---

## Acceptance Criteria

### AC-1: 模型下载与加载
**Given** PhotoMind 应用启动
**When** 首次需要进行语义搜索
**Then** 系统后台下载并加载 CLIP 模型
**And** 模型缓存到本地磁盘（下次启动快速加载）

### AC-2: 模型缓存机制
**Given** CLIP 模型已下载
**When** 应用重新启动
**Then** 从本地缓存加载模型，无需重新下载

### AC-3: 文本转向量
**Given** CLIP 模型加载成功
**When** 调用文本嵌入接口
**Then** 返回 512 维归一化向量
**And** 响应时间 < 2 秒

### AC-4: 图片转向量
**Given** CLIP 模型加载成功
**When** 调用图片嵌入接口
**Then** 返回 512 维归一化向量
**And** 响应时间 < 5 秒（取决于图片大小）

### AC-5: 服务健康检查
**Given** 应用运行中
**When** 检查 EmbeddingService 状态
**Then** 返回模型是否已加载
**And** 返回模型版本信息

---

## Implementation Steps

### Phase 1: 项目依赖配置

#### Step 1.1: 添加 `@xenova/transformers` 依赖

**File:** `package.json`

**Action:** 在 `dependencies` 中添加以下内容：

```json
{
  "dependencies": {
    "@xenova/transformers": "^2.17.0"
  }
}
```

**验证步骤:**
```bash
npm install @xenova/transformers
npm list @xenova/transformers  # 应显示 ^2.17.0
```

---

### Phase 2: 类型定义

#### Step 2.1: 创建嵌入向量类型定义

**File:** `electron/types/embedding.ts`

```typescript
/**
 * 嵌入向量类型定义
 */

// 512 维归一化向量
export type EmbeddingVector = number[];

// 嵌入类型枚举
export enum EmbeddingType {
  IMAGE = 'image',
  TEXT = 'text'
}

// 嵌入结果接口
export interface EmbeddingResult {
  success: boolean;
  vector?: EmbeddingVector;
  error?: string;
  processingTimeMs: number;
}

// 图片嵌入选项
export interface ImageEmbeddingOptions {
  imagePath: string;
  normalize?: boolean;  // 默认 true
}

// 文本嵌入选项
export interface TextEmbeddingOptions {
  text: string;
  normalize?: boolean;  // 默认 true
}

// 模型状态
export interface ModelStatus {
  isLoaded: boolean;
  modelName: string;
  modelPath: string;
  loadedAt?: Date;
}

// 批量嵌入进度
export interface BatchEmbeddingProgress {
  total: number;
  processed: number;
  currentPhotoUuid?: string;
  percentComplete: number;
}
```

**验证步骤:**
- 确认文件创建: `ls -la electron/types/`
- 检查类型导出: 在 `electron/types/index.ts` 中添加导出

---

### Phase 3: EmbeddingService 核心实现

#### Step 3.1: 创建 EmbeddingService 类

**File:** `electron/services/embeddingService.ts`

```typescript
import { pipeline, env, FeatureExtractionPipeline } from '@xenova/transformers';
import type {
  EmbeddingVector,
  EmbeddingResult,
  ModelStatus,
  ImageEmbeddingOptions,
  TextEmbeddingOptions
} from '../types/embedding';

// 配置环境变量
env.allowLocalModels = false;
env.useBrowserCache = true;
env.cacheDir = './model_cache';

/**
 * CLIP 嵌入服务
 * 负责模型加载、文本嵌入、图片嵌入
 */
export class EmbeddingService {
  // 单例实例
  private static instance: EmbeddingService;

  // 特征提取管道
  private extractor: FeatureExtractionPipeline | null = null;

  // 模型名称 (Hugging Face Hub)
  private readonly MODEL_NAME = 'Xenova/clip-vit-base-patch32';

  // 模型缓存目录
  private readonly CACHE_DIR = './model_cache';

  // 加载状态
  private _isLoaded = false;
  private _loadError: string | null = null;
  private _loadStartTime: number = 0;

  /**
   * 获取单例实例
   */
  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor() {
    // 初始化日志
    console.log('[EmbeddingService] Initialized');
  }

  /**
   * 检查模型是否已加载
   */
  get isLoaded(): boolean {
    return this._isLoaded;
  }

  /**
   * 获取加载错误信息
   */
  get loadError(): string | null {
    return this._loadError;
  }

  /**
   * 初始化并加载 CLIP 模型
   * 在应用启动时或首次需要时调用
   */
  async initialize(): Promise<void> {
    if (this._isLoaded) {
      console.log('[EmbeddingService] Model already loaded');
      return;
    }

    if (this._loadError) {
      throw new Error(`Model load failed: ${this._loadError}`);
    }

    console.log('[EmbeddingService] Starting model initialization...');
    this._loadStartTime = Date.now();

    try {
      // 创建特征提取管道
      this.extractor = await pipeline('feature-extraction', this.MODEL_NAME, {
        cacheDir: this.CACHE_DIR,
      });

      this._isLoaded = true;
      const loadTime = Date.now() - this._loadStartTime;
      console.log(`[EmbeddingService] Model loaded successfully in ${loadTime}ms`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._loadError = errorMessage;
      console.error('[EmbeddingService] Failed to load model:', errorMessage);
      throw error;
    }
  }

  /**
   * 文本转向量
   * @param text 输入文本
   * @returns 512 维归一化向量
   */
  async textToEmbedding(text: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    try {
      // 确保模型已加载
      await this.ensureModelLoaded();

      // 执行特征提取
      const output = await this.extractor!(text, {
        pooling: 'mean',
        normalize: true
      });

      // 转换为数组
      const vector = Array.from(output.data);

      const processingTime = Date.now() - startTime;
      console.log(`[EmbeddingService] Text embedding generated in ${processingTime}ms`);

      return {
        success: true,
        vector,
        processingTimeMs: processingTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[EmbeddingService] Text embedding failed:', errorMessage);

      return {
        success: false,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * 图片转向量
   * @param imagePath 图片文件路径
   * @returns 512 维归一化向量
   */
  async imageToEmbedding(imagePath: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    try {
      // 确保模型已加载
      await this.ensureModelLoaded();

      // 验证文件存在
      if (!await this.fileExists(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      // 执行特征提取
      const output = await this.extractor!(imagePath, {
        pooling: 'mean',
        normalize: true
      });

      // 转换为数组
      const vector = Array.from(output.data);

      const processingTime = Date.now() - startTime;
      console.log(`[EmbeddingService] Image embedding generated in ${processingTime}ms`);

      return {
        success: true,
        vector,
        processingTimeMs: processingTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[EmbeddingService] Image embedding failed:', errorMessage);

      return {
        success: false,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * 获取模型状态
   */
  getModelStatus(): ModelStatus {
    return {
      isLoaded: this._isLoaded,
      modelName: this.MODEL_NAME,
      modelPath: this.CACHE_DIR,
      loadedAt: this._isLoaded ? new Date() : undefined
    };
  }

  /**
   * 确保模型已加载
   */
  private async ensureModelLoaded(): Promise<void> {
    if (!this._isLoaded) {
      await this.initialize();
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 释放模型资源
   */
  async dispose(): Promise<void> {
    if (this.extractor) {
      // 清理资源
      this.extractor = null;
      this._isLoaded = false;
      console.log('[EmbeddingService] Model disposed');
    }
  }
}

// 导出单例访问函数
export const getEmbeddingService = () => EmbeddingService.getInstance();
```

**验证步骤:**
- 确认文件创建: `ls -la electron/services/`
- 检查 TypeScript 编译: `npx tsc --noEmit electron/services/embeddingService.ts`

---

### Phase 4: 数据库向量操作扩展

#### Step 4.1: 在 DatabaseService 中添加向量存储方法

**File:** `electron/database/db.ts`

**Action:** 在 `DatabaseService` 类中添加以下方法：

```typescript
import type { EmbeddingVector } from '../types/embedding';

/**
 * 向量存储相关方法
 * 添加到 DatabaseService 类中
 */

/**
 * 保存图片嵌入向量
 * @param photoUuid 照片 UUID
 * @param vector 嵌入向量
 * @param embeddingType 嵌入类型 (默认 'image')
 * @returns 是否成功
 */
async saveEmbedding(
  photoUuid: string,
  vector: EmbeddingVector,
  embeddingType: string = 'image'
): Promise<boolean> {
  const db = await this.getDb();

  try {
    // 将向量转换为 Buffer (BLOB)
    const vectorBuffer = Buffer.from(new Float32Array(vector));

    await db.run(
      `INSERT OR REPLACE INTO vectors (photo_uuid, embedding, embedding_type, created_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [photoUuid, vectorBuffer, embeddingType]
    );

    console.log(`[Database] Saved ${embeddingType} embedding for photo: ${photoUuid}`);
    return true;
  } catch (error) {
    console.error('[Database] Failed to save embedding:', error);
    return false;
  }
}

/**
 * 批量保存嵌入向量
 * @param embeddings [{ photoUuid, vector, embeddingType }]
 * @returns 成功数量
 */
async saveEmbeddingsBatch(
  embeddings: Array<{ photoUuid: string; vector: EmbeddingVector; embeddingType?: string }>
): Promise<number> {
  const db = await this.getDb();
  let successCount = 0;

  try {
    await db.run('BEGIN TRANSACTION');

    for (const { photoUuid, vector, embeddingType } of embeddings) {
      const success = await this.saveEmbedding(photoUuid, vector, embeddingType);
      if (success) successCount++;
    }

    await db.run('COMMIT');
    console.log(`[Database] Batch saved ${successCount}/${embeddings.length} embeddings`);
    return successCount;
  } catch (error) {
    await db.run('ROLLBACK');
    console.error('[Database] Batch save failed:', error);
    throw error;
  }
}

/**
 * 获取单个照片的嵌入向量
 * @param photoUuid 照片 UUID
 * @param embeddingType 嵌入类型
 * @returns 嵌入向量或 null
 */
async getEmbedding(
  photoUuid: string,
  embeddingType: string = 'image'
): Promise<EmbeddingVector | null> {
  const db = await this.getDb();

  try {
    const result = await db.get(
      `SELECT embedding FROM vectors WHERE photo_uuid = ? AND embedding_type = ?`,
      [photoUuid, embeddingType]
    );

    if (result && result.embedding) {
      // BLOB 转 Float32Array 再转数组
      const float32Array = new Float32Array(result.embedding);
      return Array.from(float32Array);
    }

    return null;
  } catch (error) {
    console.error('[Database] Failed to get embedding:', error);
    return null;
  }
}

/**
 * 获取所有嵌入向量（用于全库搜索）
 * @param embeddingType 嵌入类型
 * @returns 照片 UUID 和向量列表
 */
async getAllEmbeddings(
  embeddingType: string = 'image'
): Promise<Array<{ photoUuid: string; vector: EmbeddingVector }>> {
  const db = await this.getDb();

  try {
    const results = await db.all(
      `SELECT photo_uuid, embedding FROM vectors WHERE embedding_type = ?`,
      [embeddingType]
    );

    return results.map(result => ({
      photoUuid: result.photo_uuid,
      vector: Array.from(new Float32Array(result.embedding))
    }));
  } catch (error) {
    console.error('[Database] Failed to get all embeddings:', error);
    return [];
  }
}

/**
 * 检查照片是否有嵌入向量
 * @param photoUuid 照片 UUID
 * @returns 是否有嵌入
 */
async hasEmbedding(
  photoUuid: string,
  embeddingType: string = 'image'
): Promise<boolean> {
  const db = await this.getDb();

  try {
    const result = await db.get(
      `SELECT 1 FROM vectors WHERE photo_uuid = ? AND embedding_type = ? LIMIT 1`,
      [photoUuid, embeddingType]
    );
    return !!result;
  } catch (error) {
    console.error('[Database] Failed to check embedding existence:', error);
    return false;
  }
}

/**
 * 删除照片的嵌入向量
 * @param photoUuid 照片 UUID
 * @param embeddingType 嵌入类型
 * @returns 是否成功
 */
async deleteEmbedding(
  photoUuid: string,
  embeddingType?: string
): Promise<boolean> {
  const db = await this.getDb();

  try {
    if (embeddingType) {
      await db.run(
        `DELETE FROM vectors WHERE photo_uuid = ? AND embedding_type = ?`,
        [photoUuid, embeddingType]
      );
    } else {
      await db.run(
        `DELETE FROM vectors WHERE photo_uuid = ?`,
        [photoUuid]
      );
    }
    return true;
  } catch (error) {
    console.error('[Database] Failed to delete embedding:', error);
    return false;
  }
}

/**
 * 获取嵌入统计信息
 * @returns 统计对象
 */
async getEmbeddingStats(): Promise<{
  totalEmbeddings: number;
  typeBreakdown: Record<string, number>;
}> {
  const db = await this.getDb();

  try {
    const totalResult = await db.get(`SELECT COUNT(*) as count FROM vectors`);
    const typeResults = await db.all(
      `SELECT embedding_type, COUNT(*) as count FROM vectors GROUP BY embedding_type`
    );

    return {
      totalEmbeddings: totalResult?.count || 0,
      typeBreakdown: Object.fromEntries(
        typeResults.map(r => [r.embedding_type, r.count])
      )
    };
  } catch (error) {
    console.error('[Database] Failed to get embedding stats:', error);
    return { totalEmbeddings: 0, typeBreakdown: {} };
  }
}
```

**验证步骤:**
- 检查 TypeScript 编译
- 确认数据库迁移包含 vectors 表

---

### Phase 5: IPC 接口定义

#### Step 5.1: 在 ipcChannels 中添加嵌入相关通道

**File:** `electron/ipc/ipcChannels.ts`

```typescript
export const IPC_CHANNELS = {
  // ... 现有通道

  // ========== 嵌入服务通道 ==========
  EMBEDDING_INITIALIZE: 'embedding:initialize',
  EMBEDDING_GET_STATUS: 'embedding:get-status',
  EMBEDDING_TEXT_TO_VECTOR: 'embedding:text-to-vector',
  EMBEDDING_IMAGE_TO_VECTOR: 'embedding:image-to-vector',
  EMBEDDING_GENERATE_ALL: 'embedding:generate-all',
  EMBEDDING_DISPOSE: 'embedding:dispose',
} as const;
```

---

### Phase 6: IPC 处理器实现

#### Step 6.1: 创建嵌入服务 IPC 处理器

**File:** `electron/ipc/handlers/embeddingHandler.ts`

```typescript
import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../ipcChannels';
import { getEmbeddingService } from '../../services/embeddingService';
import { getDatabaseService } from '../../services/databaseService';
import type {
  EmbeddingResult,
  BatchEmbeddingProgress
} from '../../types/embedding';

/**
 * 嵌入服务 IPC 处理器
 */
export function registerEmbeddingHandlers(mainWindow: BrowserWindow) {
  const embeddingService = getEmbeddingService();
  const databaseService = getDatabaseService();

  // 初始化模型
  ipcMain.handle(IPC_CHANNELS.EMBEDDING_INITIALIZE, async () => {
    console.log('[IPC] Received embedding:initialize request');

    try {
      await embeddingService.initialize();
      const status = embeddingService.getModelStatus();

      return {
        success: true,
        status
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 获取模型状态
  ipcMain.handle(IPC_CHANNELS.EMBEDDING_GET_STATUS, async () => {
    return embeddingService.getModelStatus();
  });

  // 文本转向量
  ipcMain.handle(IPC_CHANNELS.EMBEDDING_TEXT_TO_VECTOR, async (_, text: string) => {
    const result = await embeddingService.textToEmbedding(text);
    return result;
  });

  // 图片转向量
  ipcMain.handle(IPC_CHANNELS.EMBEDDING_IMAGE_TO_VECTOR, async (_, imagePath: string) => {
    const result = await embeddingService.imageToEmbedding(imagePath);

    // 如果成功，自动保存到数据库
    if (result.success && result.vector) {
      // 从路径提取 UUID (假设路径包含 UUID)
      const photoUuid = extractPhotoUuidFromPath(imagePath);
      if (photoUuid) {
        await databaseService.saveEmbedding(photoUuid, result.vector, 'image');
      }
    }

    return result;
  });

  // 生成所有照片的嵌入向量
  ipcMain.handle(IPC_CHANNELS.EMBEDDING_GENERATE_ALL, async () => {
    console.log('[IPC] Starting batch embedding generation');

    try {
      // 确保模型已加载
      if (!embeddingService.isLoaded) {
        await embeddingService.initialize();
      }

      // 获取所有没有嵌入的照片
      const photos = await databaseService.getPhotosWithoutEmbeddings();
      const total = photos.length;
      let processed = 0;

      console.log(`[IPC] Found ${total} photos without embeddings`);

      // 遍历生成嵌入
      for (const photo of photos) {
        const result = await embeddingService.imageToEmbedding(photo.original_path);

        if (result.success && result.vector) {
          await databaseService.saveEmbedding(photo.uuid, result.vector, 'image');
        }

        processed++;

        // 发送进度更新
        const progress: BatchEmbeddingProgress = {
          total,
          processed,
          currentPhotoUuid: photo.uuid,
          percentComplete: Math.round((processed / total) * 100)
        };

        mainWindow.webContents.send('embedding:progress', progress);
      }

      return {
        success: true,
        processed,
        total
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 释放模型资源
  ipcMain.handle(IPC_CHANNELS.EMBEDDING_DISPOSE, async () => {
    await embeddingService.dispose();
    return { success: true };
  });
}

/**
 * 从文件路径提取照片 UUID
 */
function extractPhotoUuidFromPath(path: string): string | null {
  // 假设路径格式: /path/to/photos/{UUID}/{filename}
  const match = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : null;
}
```

**验证步骤:**
- 确认文件创建: `ls -la electron/ipc/handlers/`
- 在 `electron/ipc/index.ts` 中导入并注册处理器

---

### Phase 7: Preload API 扩展

#### Step 7.1: 在 preload 中添加嵌入相关 API

**File:** `electron/preload/index.ts`

```typescript
/**
 * 嵌入服务 API
 * 添加到 PhotoAPI 接口和实现中
 */

export interface PhotoAPI {
  // ... 现有方法

  // ========== 嵌入服务 API ==========

  /**
   * 初始化 CLIP 模型
   */
  initializeEmbeddingModel(): Promise<{ success: boolean; error?: string }>;

  /**
   * 获取模型状态
   */
  getEmbeddingModelStatus(): Promise<{
    isLoaded: boolean;
    modelName: string;
    modelPath: string;
  }>;

  /**
   * 文本转向量
   */
  textToEmbedding(text: string): Promise<EmbeddingResult>;

  /**
   * 图片转向量
   */
  imageToEmbedding(imagePath: string): Promise<EmbeddingResult>;

  /**
   * 生成所有照片的嵌入向量
   */
  generateAllEmbeddings(): Promise<{
    success: boolean;
    processed: number;
    total: number;
    error?: string;
  }>;

  /**
   * 监听嵌入生成进度
   */
  onEmbeddingProgress(callback: (progress: BatchEmbeddingProgress) => void): () => void;
}

// 在 PhotoAPIService 实现中添加
const photoAPI: PhotoAPI = {
  // ... 现有实现

  initializeEmbeddingModel: async () => {
    return ipcRenderer.invoke('embedding:initialize');
  },

  getEmbeddingModelStatus: async () => {
    return ipcRenderer.invoke('embedding:get-status');
  },

  textToEmbedding: async (text: string) => {
    return ipcRenderer.invoke('embedding:text-to-vector', text);
  },

  imageToEmbedding: async (imagePath: string) => {
    return ipcRenderer.invoke('embedding:image-to-vector', imagePath);
  },

  generateAllEmbeddings: async () => {
    return ipcRenderer.invoke('embedding:generate-all');
  },

  onEmbeddingProgress: (callback) => {
    const listener = (_: any, progress: BatchEmbeddingProgress) => {
      callback(progress);
    };
    ipcRenderer.on('embedding:progress', listener);
    return () => {
      ipcRenderer.off('embedding:progress', listener);
    };
  },
};
```

**验证步骤:**
- 检查 TypeScript 编译
- 确认 API 可在渲染进程访问

---

### Phase 8: 前端 Store 集成（可选）

#### Step 8.1: 创建 Embedding Store（可选，用于进度显示）

**File:** `src/renderer/stores/embeddingStore.ts`

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { BatchEmbeddingProgress, ModelStatus } from '#/types/embedding';

export const useEmbeddingStore = defineStore('embedding', () => {
  // 状态
  const isModelLoaded = ref(false);
  const isGenerating = ref(false);
  const progress = ref<BatchEmbeddingProgress>({
    total: 0,
    processed: 0,
    percentComplete: 0
  });
  const modelStatus = ref<ModelStatus | null>(null);

  // 计算属性
  const isComplete = computed(() =>
    progress.value.processed >= progress.value.total && progress.value.total > 0
  );

  // Actions
  async function initializeModel() {
    try {
      const result = await window.photoAPI.initializeEmbeddingModel();
      if (result.success) {
        isModelLoaded.value = true;
        await fetchModelStatus();
      }
      return result;
    } catch (error) {
      console.error('Failed to initialize embedding model:', error);
      throw error;
    }
  }

  async function fetchModelStatus() {
    const status = await window.photoAPI.getEmbeddingModelStatus();
    modelStatus.value = status;
    isModelLoaded.value = status.isLoaded;
  }

  async function generateAllEmbeddings() {
    isGenerating.value = true;
    progress.value = { total: 0, processed: 0, percentComplete: 0 };

    // 监听进度
    const unsubscribe = window.photoAPI.onEmbeddingProgress((p) => {
      progress.value = p;
    });

    try {
      const result = await window.photoAPI.generateAllEmbeddings();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    } finally {
      isGenerating.value = false;
      unsubscribe();
    }
  }

  return {
    // 状态
    isModelLoaded,
    isGenerating,
    progress,
    modelStatus,
    // 计算属性
    isComplete,
    // Actions
    initializeModel,
    fetchModelStatus,
    generateAllEmbeddings,
  };
});
```

---

## File Changes Summary

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 新建 | `electron/types/embedding.ts` | 嵌入向量类型定义 |
| 新建 | `electron/services/embeddingService.ts` | CLIP 嵌入服务核心实现 |
| 修改 | `electron/database/db.ts` | 添加向量存储方法 |
| 新建 | `electron/ipc/handlers/embeddingHandler.ts` | IPC 处理器 |
| 修改 | `electron/ipc/ipcChannels.ts` | 添加嵌入通道 |
| 修改 | `electron/ipc/index.ts` | 注册处理器 |
| 修改 | `electron/preload/index.ts` | 添加 preload API |
| 新建 | `src/renderer/stores/embeddingStore.ts` | 前端 Store (可选) |
| 修改 | `package.json` | 添加依赖 |

---

## Dependencies

| 依赖项 | 源 | 用途 |
|--------|-----|------|
| `@xenova/transformers` | npm | CLIP 模型推理 |
| `electron` | 项目已有 | IPC 通信 |
| `sql.js` | 项目已有 | SQLite 数据库 |

---

## Testing Approach

### 单元测试

```typescript
// tests/unit/embeddingService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EmbeddingService } from '../../electron/services/embeddingService';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(async () => {
    service = EmbeddingService.getInstance();
    await service.dispose(); // 确保清理状态
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe('initialize', () => {
    it('should load model successfully', async () => {
      await service.initialize();
      expect(service.isLoaded).toBe(true);
    });

    it('should return cached model on second call', async () => {
      await service.initialize();
      const status1 = service.getModelStatus();
      await service.initialize();
      const status2 = service.getModelStatus();
      expect(status1.loadedAt?.getTime()).toBe(status2.loadedAt?.getTime());
    });
  });

  describe('textToEmbedding', () => {
    it('should return 512-dimensional vector', async () => {
      await service.initialize();
      const result = await service.textToEmbedding('a beautiful sunset');

      expect(result.success).toBe(true);
      expect(result.vector).toHaveLength(512);
      expect(result.processingTimeMs).toBeLessThan(2000);
    });

    it('should return normalized vector', async () => {
      await service.initialize();
      const result = await service.textToEmbedding('test');

      if (result.success && result.vector) {
        const norm = Math.sqrt(result.vector.reduce((sum, v) => sum + v * v, 0));
        expect(norm).toBeCloseTo(1, 2);
      }
    });
  });

  describe('imageToEmbedding', () => {
    it('should return 512-dimensional vector for valid image', async () => {
      await service.initialize();
      const result = await service.imageToEmbedding('/path/to/test/image.jpg');

      expect(result.success).toBe(true);
      expect(result.vector).toHaveLength(512);
    });

    it('should fail for non-existent image', async () => {
      await service.initialize();
      const result = await service.imageToEmbedding('/non/existent/path.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
```

### 手动测试

1. **模型加载测试**
   ```javascript
   // 在控制台执行
   const status = await window.photoAPI.getEmbeddingModelStatus();
   console.log('Model status:', status);
   ```

2. **文本嵌入测试**
   ```javascript
   const result = await window.photoAPI.textToEmbedding('温暖的家庭照片');
   console.log('Vector length:', result.vector?.length);
   console.log('Processing time:', result.processingTimeMs);
   ```

3. **批量生成测试**
   ```javascript
   await window.photoAPI.initializeEmbeddingModel();
   const result = await window.photoAPI.generateAllEmbeddings();
   console.log(`Generated ${result.processed} embeddings`);
   ```

---

## Acceptance Criteria Verification

| AC | 验证方法 | 预期结果 |
|----|----------|----------|
| AC-1 | `initializeEmbeddingModel()` 首次调用 | 后台下载模型，5-10 秒内完成 |
| AC-2 | 重启应用后调用 `getModelStatus()` | `isLoaded: true`，无下载 |
| AC-3 | `textToEmbedding("test")` | 返回 512 维向量，< 2 秒 |
| AC-4 | `imageToEmbedding(path)` | 返回 512 维向量，< 5 秒 |
| AC-5 | `getModelStatus()` | 返回完整状态信息 |

---

## Risk Mitigation

| 风险 | 缓解措施 |
|------|----------|
| 模型下载失败 | 添加重试机制，显示进度提示 |
| 内存不足 | 模型使用完毕后调用 `dispose()` |
| 首次加载慢 | 显示加载动画，后台异步加载 |
| 大图片处理慢 | 添加图片预处理（缩放） |

---

## Notes

- **模型大小**: CLIP ViT-B/32 约 300MB
- **首次加载时间**: 约 5-10 秒（取决于网络）
- **向量维度**: 512 (CLIP ViT-B/32)
- **推荐缓存位置**: `./model_cache` 目录
- **线程安全**: EmbeddingService 使用单例模式

---

## Related Stories

- **前置依赖**: 无（Epic 2 第一个 story）
- **后续依赖**: E-02.2 (图片向量生成) - 使用本 story 的 EmbeddingService
- **相关**: E-02.4 (向量相似度搜索) - 使用本 story 的向量存储方法
