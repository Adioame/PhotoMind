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

// 向量存储接口
export interface VectorStoreEntry {
  photoUuid: string;
  vector: EmbeddingVector;
  embeddingType: string;
  createdAt: Date;
}
