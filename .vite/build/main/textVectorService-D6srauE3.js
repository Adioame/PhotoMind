import { g as getEmbeddingService } from "./index-BYkeoRh9.js";
class TextVectorService {
  cache = /* @__PURE__ */ new Map();
  cacheMaxAge = 5 * 60 * 1e3;
  // 5分钟
  maxCacheSize = 1e3;
  /**
   * 将文本转换为向量
   */
  async textToVector(text) {
    const cached = this.getCachedVector(text);
    if (cached) {
      console.log("[TextVector] 使用缓存的向量");
      return {
        query: text,
        vector: cached,
        processingTimeMs: 0,
        fromCache: true
      };
    }
    const embeddingService = getEmbeddingService();
    const result = await embeddingService.textToEmbedding(text);
    if (result.success && result.vector) {
      this.cacheVector(text, result.vector);
    }
    return {
      query: text,
      vector: result.vector || null,
      processingTimeMs: result.processingTimeMs,
      fromCache: false
    };
  }
  /**
   * 批量处理多个搜索文本
   */
  async textsToVectors(texts) {
    const results = /* @__PURE__ */ new Map();
    for (const text of texts) {
      const result = await this.textToVector(text);
      results.set(text, result);
    }
    return results;
  }
  /**
   * 处理搜索查询（预处理 + 转向量）
   */
  async processQuery(text, preprocess) {
    const processed = preprocess(text);
    const cached = this.getCachedVector(text);
    if (cached) {
      return {
        query: text,
        vector: cached,
        processingTimeMs: 0,
        fromCache: true,
        processed: processed.processed,
        keywords: processed.keywords,
        language: processed.language
      };
    }
    const embeddingService = getEmbeddingService();
    const result = await embeddingService.textToEmbedding(processed.processed);
    if (result.success && result.vector) {
      this.cacheVector(text, result.vector);
    }
    return {
      query: text,
      vector: result.vector || null,
      processingTimeMs: result.processingTimeMs,
      fromCache: false,
      processed: processed.processed,
      keywords: processed.keywords,
      language: processed.language
    };
  }
  /**
   * 获取缓存的向量
   */
  getCachedVector(query) {
    const cached = this.cache.get(query);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.cacheMaxAge) {
      this.cache.delete(query);
      return null;
    }
    return cached.vector;
  }
  /**
   * 缓存向量
   */
  cacheVector(query, vector) {
    if (this.cache.size >= this.maxCacheSize) {
      this.cleanExpiredCache();
    }
    this.cache.set(query, {
      query,
      vector,
      timestamp: Date.now()
    });
  }
  /**
   * 清理过期缓存
   */
  cleanExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheMaxAge) {
        this.cache.delete(key);
      }
    }
  }
  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear();
    console.log("[TextVector] 缓存已清空");
  }
  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize
    };
  }
  /**
   * 设置缓存过期时间
   */
  setCacheMaxAge(minutes) {
    this.cacheMaxAge = minutes * 60 * 1e3;
  }
  /**
   * 设置最大缓存大小
   */
  setMaxCacheSize(size) {
    this.maxCacheSize = size;
  }
}
const textVectorService = new TextVectorService();
export {
  TextVectorService,
  textVectorService
};
//# sourceMappingURL=textVectorService-D6srauE3.js.map
