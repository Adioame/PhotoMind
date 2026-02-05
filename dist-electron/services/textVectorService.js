import { getEmbeddingService } from './embeddingService.js';
export class TextVectorService {
    constructor() {
        this.cache = new Map();
        this.cacheMaxAge = 5 * 60 * 1000;
        this.maxCacheSize = 1000;
    }
    async textToVector(text) {
        const startTime = Date.now();
        const cached = this.getCachedVector(text);
        if (cached) {
            console.log('[TextVector] 使用缓存的向量');
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
    async textsToVectors(texts) {
        const results = new Map();
        for (const text of texts) {
            const result = await this.textToVector(text);
            results.set(text, result);
        }
        return results;
    }
    async processQuery(text, preprocess) {
        const startTime = Date.now();
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
    getCachedVector(query) {
        const cached = this.cache.get(query);
        if (!cached)
            return null;
        if (Date.now() - cached.timestamp > this.cacheMaxAge) {
            this.cache.delete(query);
            return null;
        }
        return cached.vector;
    }
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
    cleanExpiredCache() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.cacheMaxAge) {
                this.cache.delete(key);
            }
        }
    }
    clearCache() {
        this.cache.clear();
        console.log('[TextVector] 缓存已清空');
    }
    getCacheStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize
        };
    }
    setCacheMaxAge(minutes) {
        this.cacheMaxAge = minutes * 60 * 1000;
    }
    setMaxCacheSize(size) {
        this.maxCacheSize = size;
    }
}
export const textVectorService = new TextVectorService();
//# sourceMappingURL=textVectorService.js.map