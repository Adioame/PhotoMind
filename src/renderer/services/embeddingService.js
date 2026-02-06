import { env, pipeline } from '@xenova/transformers';
class EmbeddingService {
    constructor() {
        this.extractor = null;
        this.textPipeline = null;
        this.MODEL_NAME = 'Xenova/clip-vit-base-patch32';
        this._isLoaded = false;
        this._loadError = null;
        this._loadStartTime = 0;
        this._batchProgress = {
            total: 0,
            completed: 0,
            failed: 0,
            currentPhoto: ''
        };
    }
    get isLoaded() {
        return this._isLoaded;
    }
    get loadError() {
        return this._loadError;
    }
    get modelName() {
        return this.MODEL_NAME;
    }
    async initialize() {
        this._loadStartTime = Date.now();
        this._loadError = null;
        try {
            console.log('[RendererEmbedding] 开始加载 CLIP 模型...');
            env.allowLocalModels = false;
            env.useBrowserCache = true;
            env.cacheDir = './model_cache';
            this.extractor = await pipeline('feature-extraction', this.MODEL_NAME, {
                quantized: true
            });
            this.textPipeline = await pipeline('zero-shot-classification', this.MODEL_NAME, {
                quantized: true
            });
            this._isLoaded = true;
            const loadTime = Date.now() - this._loadStartTime;
            console.log(`[RendererEmbedding] CLIP 模型加载成功，耗时 ${loadTime}ms`);
            return { success: true };
        }
        catch (error) {
            this._loadError = error instanceof Error ? error.message : String(error);
            console.error('[RendererEmbedding] 模型加载失败:', this._loadError);
            return { success: false, error: this._loadError };
        }
    }
    async imageToEmbedding(imagePath) {
        const startTime = Date.now();
        if (!this._isLoaded || !this.extractor) {
            return {
                success: false,
                error: '模型未加载',
                processingTimeMs: Date.now() - startTime
            };
        }
        try {
            console.log(`[RendererEmbedding] 生成图片向量: ${imagePath}`);
            const output = await this.extractor(imagePath, {
                pooling: 'mean',
                normalize: true
            });
            const vectorValues = Array.from(output.data);
            const dimension = vectorValues.length;
            console.log(`[RendererEmbedding] 图片向量生成成功: ${dimension} 维`);
            return {
                success: true,
                vector: {
                    values: vectorValues,
                    dimension
                },
                processingTimeMs: Date.now() - startTime
            };
        }
        catch (error) {
            console.error('[RendererEmbedding] 图片向量生成失败:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                processingTimeMs: Date.now() - startTime
            };
        }
    }
    async textToEmbedding(text) {
        const startTime = Date.now();
        if (!this._isLoaded || !this.textPipeline) {
            return {
                success: false,
                error: '模型未加载',
                processingTimeMs: Date.now() - startTime
            };
        }
        try {
            console.log(`[RendererEmbedding] 生成文本向量: "${text.substring(0, 50)}..."`);
            const output = await this.extractor(text, {
                pooling: 'mean',
                normalize: true
            });
            const vectorValues = Array.from(output.data);
            const dimension = vectorValues.length;
            console.log(`[RendererEmbedding] 文本向量生成成功: ${dimension} 维`);
            return {
                success: true,
                vector: {
                    values: vectorValues,
                    dimension
                },
                processingTimeMs: Date.now() - startTime
            };
        }
        catch (error) {
            console.error('[RendererEmbedding] 文本向量生成失败:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                processingTimeMs: Date.now() - startTime
            };
        }
    }
    cosineSimilarity(a, b) {
        if (a.length !== b.length) {
            throw new Error('向量维度不匹配');
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0) {
            return 0;
        }
        return dotProduct / denominator;
    }
    getModelStatus() {
        return {
            loaded: this._isLoaded,
            modelName: this.MODEL_NAME,
            loadError: this._loadError
        };
    }
    getBatchProgress() {
        return { ...this._batchProgress };
    }
    async batchGenerate(limit = 100, onProgress) {
        const errors = [];
        let processed = 0;
        let failed = 0;
        console.log(`[RendererEmbedding] 开始批量生成向量，限制: ${limit}`);
        if (!this._isLoaded) {
            const initResult = await this.initialize();
            if (!initResult.success) {
                return {
                    success: false,
                    processed: 0,
                    failed: 0,
                    errors: [initResult.error || '模型初始化失败']
                };
            }
        }
        try {
            const response = await window.photoAPI?.photos.getWithoutEmbeddings(limit);
            const photos = response?.photos || [];
            if (photos.length === 0) {
                console.log('[RendererEmbedding] 没有需要处理的照片');
                return { success: true, processed: 0, failed: 0, errors: [] };
            }
            this._batchProgress.total = photos.length;
            this._batchProgress.completed = 0;
            this._batchProgress.failed = 0;
            console.log(`[RendererEmbedding] 开始处理 ${photos.length} 张照片`);
            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];
                const filePath = photo.filePath || photo.thumbnailPath;
                if (!filePath) {
                    errors.push(`照片 ${photo.id || photo.uuid} 缺少文件路径`);
                    failed++;
                    this._batchProgress.failed++;
                    this._batchProgress.completed++;
                    onProgress?.(this._batchProgress.completed, this._batchProgress.total);
                    continue;
                }
                this._batchProgress.currentPhoto = filePath;
                try {
                    const result = await this.imageToEmbedding(filePath);
                    if (result.success && result.vector) {
                        const saveResult = await window.photoAPI?.photos.saveEmbedding(
                            photo.uuid || photo.id,
                            result.vector.values
                        );
                        if (saveResult?.success) {
                            processed++;
                            console.log(`[RendererEmbedding] [${i + 1}/${photos.length}] 成功: ${filePath}`);
                        }
                        else {
                            errors.push(`保存失败: ${filePath}`);
                            failed++;
                        }
                    }
                    else {
                        errors.push(`向量生成失败: ${filePath} - ${result.error}`);
                        failed++;
                    }
                }
                catch (error) {
                    errors.push(`处理异常: ${filePath} - ${error}`);
                    failed++;
                }
                this._batchProgress.completed++;
                onProgress?.(this._batchProgress.completed, this._batchProgress.total);
            }
            console.log(`[RendererEmbedding] 批量完成: 成功 ${processed}, 失败 ${failed}`);
            return {
                success: true,
                processed,
                failed,
                errors: errors.slice(0, 10)
            };
        }
        catch (error) {
            console.error('[RendererEmbedding] 批量处理异常:', error);
            return {
                success: false,
                processed,
                failed,
                errors: [String(error)]
            };
        }
        finally {
            this._batchProgress.currentPhoto = '';
        }
    }
    dispose() {
        if (this.extractor) {
            this.extractor = null;
        }
        if (this.textPipeline) {
            this.textPipeline = null;
        }
        this._isLoaded = false;
        console.log('[RendererEmbedding] 资源已清理');
    }
}
export const embeddingService = new EmbeddingService();
//# sourceMappingURL=embeddingService.js.map