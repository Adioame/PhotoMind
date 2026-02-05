import { env, pipeline } from '@xenova/transformers';
env.allowLocalModels = false;
env.useBrowserCache = true;
env.cacheDir = './model_cache';
export class EmbeddingService {
    static getInstance() {
        if (!EmbeddingService.instance) {
            EmbeddingService.instance = new EmbeddingService();
        }
        return EmbeddingService.instance;
    }
    constructor() {
        this.extractor = null;
        this.MODEL_NAME = 'Xenova/clip-vit-base-patch32';
        this.CACHE_DIR = './model_cache';
        this._isLoaded = false;
        this._loadError = null;
        this._loadStartTime = 0;
        console.log('[EmbeddingService] Initialized');
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
            this.extractor = await pipeline('feature-extraction', this.MODEL_NAME);
            this._isLoaded = true;
            const loadTime = Date.now() - this._loadStartTime;
            console.log(`[EmbeddingService] Model loaded successfully in ${loadTime}ms`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._loadError = errorMessage;
            console.error('[EmbeddingService] Failed to load model:', errorMessage);
            throw error;
        }
    }
    async textToEmbedding(text) {
        const startTime = Date.now();
        try {
            await this.ensureModelLoaded();
            const output = await this.extractor(text, {
                pooling: 'mean',
                normalize: true
            });
            const vector = Array.from(output.data);
            const processingTime = Date.now() - startTime;
            console.log(`[EmbeddingService] Text embedding generated in ${processingTime}ms`);
            return {
                success: true,
                vector,
                processingTimeMs: processingTime
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[EmbeddingService] Text embedding failed:', errorMessage);
            return {
                success: false,
                error: errorMessage,
                processingTimeMs: Date.now() - startTime
            };
        }
    }
    async imageToEmbedding(imagePath) {
        const startTime = Date.now();
        try {
            await this.ensureModelLoaded();
            const fs = await import('fs/promises');
            try {
                await fs.access(imagePath);
            }
            catch {
                throw new Error(`Image file not found: ${imagePath}`);
            }
            const output = await this.extractor(imagePath, {
                pooling: 'mean',
                normalize: true
            });
            const vector = Array.from(output.data);
            const processingTime = Date.now() - startTime;
            console.log(`[EmbeddingService] Image embedding generated in ${processingTime}ms`);
            return {
                success: true,
                vector,
                processingTimeMs: processingTime
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[EmbeddingService] Image embedding failed:', errorMessage);
            return {
                success: false,
                error: errorMessage,
                processingTimeMs: Date.now() - startTime
            };
        }
    }
    async imageToEmbeddingsBatch(imagePaths, onProgress) {
        const results = [];
        for (let i = 0; i < imagePaths.length; i++) {
            const result = await this.imageToEmbedding(imagePaths[i]);
            results.push(result);
            onProgress?.(i + 1, imagePaths.length);
        }
        return results;
    }
    getModelStatus() {
        return {
            isLoaded: this._isLoaded,
            modelName: this.MODEL_NAME,
            modelPath: this.CACHE_DIR,
            loadedAt: this._isLoaded ? new Date() : undefined
        };
    }
    async ensureModelLoaded() {
        if (!this._isLoaded) {
            await this.initialize();
        }
    }
    async dispose() {
        if (this.extractor) {
            this.extractor = null;
            this._isLoaded = false;
            console.log('[EmbeddingService] Model disposed');
        }
    }
}
export const getEmbeddingService = () => EmbeddingService.getInstance();
//# sourceMappingURL=embeddingService.js.map