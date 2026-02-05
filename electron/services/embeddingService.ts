/**
 * PhotoMind - CLIP 嵌入服务
 *
 * 功能：
 * 1. 加载和管理 CLIP 模型
 * 2. 文本转向量
 * 3. 图片转向量
 * 4. 模型缓存管理
 */
import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import type {
  EmbeddingVector,
  EmbeddingResult,
  ModelStatus
} from '../types/embedding.js';

// 配置环境变量
env.allowLocalModels = false;
env.useBrowserCache = true;
env.cacheDir = './model_cache';

/**
 * CLIP 嵌入服务
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
  private _loadStartTime = 0;

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
   * 获取模型名称
   */
  get modelName(): string {
    return this.MODEL_NAME;
  }

  /**
   * 初始化并加载 CLIP 模型
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
      this.extractor = await pipeline('feature-extraction', this.MODEL_NAME);

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
      const fs = await import('fs/promises');
      try {
        await fs.access(imagePath);
      } catch {
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
   * 批量处理图片转向量
   * @param imagePaths 图片路径数组
   * @param onProgress 进度回调
   * @returns 嵌入结果数组
   */
  async imageToEmbeddingsBatch(
    imagePaths: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
      const result = await this.imageToEmbedding(imagePaths[i]);
      results.push(result);
      onProgress?.(i + 1, imagePaths.length);
    }

    return results;
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
   * 释放模型资源
   */
  async dispose(): Promise<void> {
    if (this.extractor) {
      this.extractor = null;
      this._isLoaded = false;
      console.log('[EmbeddingService] Model disposed');
    }
  }
}

// 导出单例访问函数
export const getEmbeddingService = () => EmbeddingService.getInstance();
