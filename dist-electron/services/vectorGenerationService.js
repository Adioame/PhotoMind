import { PhotoDatabase } from '../database/db.js';
import { BrowserWindow } from 'electron';
export class VectorGenerationService {
    constructor(database) {
        this.isGenerating = false;
        this.abortController = null;
        this.database = database || new PhotoDatabase();
    }
    async generateAll(options = {}) {
        if (this.isGenerating) {
            throw new Error('生成任务已在进行中');
        }
        this.isGenerating = true;
        this.abortController = new AbortController();
        const { batchSize = 50, onProgress } = options;
        let success = 0;
        let failed = 0;
        let total = 0;
        let processed = 0;
        const errors = [];
        try {
            const photos = this.database.getPhotosWithoutEmbeddings(10000);
            total = photos.length;
            console.log(`[VectorGeneration] 开始生成 ${total} 张照片的向量`);
            if (total === 0) {
                console.log('[VectorGeneration] 所有照片已有向量，无需生成');
                return { success: 0, failed, total, errors, cancelled: false };
            }
            for (let i = 0; i < total; i += batchSize) {
                if (this.abortController?.signal.aborted) {
                    console.log('[VectorGeneration] 生成任务已取消');
                    break;
                }
                const batch = photos.slice(i, i + batchSize);
                for (const photo of batch) {
                    if (this.abortController?.signal.aborted) {
                        break;
                    }
                    try {
                        const hasEmbedding = await this.database.hasEmbedding(photo.uuid, 'image');
                        if (hasEmbedding) {
                            processed++;
                            continue;
                        }
                        const result = await this.callRendererEmbedding(photo.file_path);
                        if (result.success && result.vector) {
                            await this.database.saveEmbedding(photo.uuid, result.vector.values, 'image');
                            success++;
                        }
                        else {
                            failed++;
                            errors.push({
                                photoUuid: photo.uuid,
                                error: result.error || 'Unknown error'
                            });
                        }
                    }
                    catch (error) {
                        failed++;
                        errors.push({
                            photoUuid: photo.uuid,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                    processed++;
                    const progress = {
                        total,
                        processed,
                        currentPhotoUuid: photo.uuid,
                        percentComplete: Math.round((processed / total) * 100)
                    };
                    onProgress?.(progress);
                }
            }
            console.log(`[VectorGeneration] 生成完成: 成功 ${success}, 失败 ${failed}`);
            return { success, failed, total, errors, cancelled: this.abortController?.signal.aborted || false };
        }
        catch (error) {
            console.error('[VectorGeneration] 生成失败:', error);
            return {
                success,
                failed,
                total,
                errors,
                cancelled: false
            };
        }
        finally {
            this.isGenerating = false;
            this.abortController = null;
        }
    }
    async callRendererEmbedding(imagePath) {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length === 0) {
            return { success: false, error: 'No renderer window available' };
        }
        try {
            const timeoutMs = 60000;
            const executePromise = windows[0].webContents.executeJavaScript(`
        (async () => {
          try {
            if (window.embeddingAPI && window.embeddingAPI.imageToEmbedding) {
              const result = await window.embeddingAPI.imageToEmbedding(\`${imagePath.replace(/`/g, '\\`')}\`)
              return JSON.stringify(result)
            } else {
              return JSON.stringify({success: false, error: 'Embedding API not available', processingTimeMs: 0})
            }
          } catch (err) {
            return JSON.stringify({success: false, error: err.message || String(err), processingTimeMs: 0})
          }
        })()
      `);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Embedding timeout after 60s')), timeoutMs);
            });
            const result = await Promise.race([executePromise, timeoutPromise]);
            return JSON.parse(result);
        }
        catch (error) {
            console.error('[VectorGeneration] 调用渲染进程失败:', error);
            return { success: false, error: String(error) };
        }
    }
    async generateOne(photoUuid) {
        const photo = this.database.getPhotoByUuid(photoUuid);
        if (!photo) {
            throw new Error(`照片不存在: ${photoUuid}`);
        }
        const hasEmbedding = await this.database.hasEmbedding(photoUuid, 'image');
        if (hasEmbedding) {
            console.log(`[VectorGeneration] 照片已有向量，跳过: ${photoUuid}`);
            return true;
        }
        const result = await this.callRendererEmbedding(photo.file_path);
        if (result.success && result.vector) {
            await this.database.saveEmbedding(photoUuid, result.vector.values, 'image');
            console.log(`[VectorGeneration] 成功生成向量: ${photoUuid}`);
            return true;
        }
        return false;
    }
    async generateBatch(photoUuids, options = {}) {
        if (this.isGenerating) {
            throw new Error('生成任务已在进行中');
        }
        this.isGenerating = true;
        this.abortController = new AbortController();
        const { batchSize = 10, onProgress } = options;
        let success = 0;
        let failed = 0;
        const errors = [];
        const total = photoUuids.length;
        let processed = 0;
        try {
            for (const photoUuid of photoUuids) {
                if (this.abortController?.signal.aborted) {
                    break;
                }
                try {
                    const photo = this.database.getPhotoByUuid(photoUuid);
                    if (!photo) {
                        failed++;
                        errors.push({ photoUuid, error: '照片不存在' });
                        continue;
                    }
                    const result = await this.callRendererEmbedding(photo.file_path);
                    if (result.success && result.vector) {
                        await this.database.saveEmbedding(photoUuid, result.vector.values, 'image');
                        success++;
                    }
                    else {
                        failed++;
                        errors.push({ photoUuid, error: result.error || 'Unknown error' });
                    }
                }
                catch (error) {
                    failed++;
                    errors.push({
                        photoUuid,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
                processed++;
                const progress = {
                    total,
                    processed,
                    currentPhotoUuid: photoUuid,
                    percentComplete: Math.round((processed / total) * 100)
                };
                onProgress?.(progress);
            }
            return { success, failed, total, errors, cancelled: this.abortController?.signal.aborted || false };
        }
        finally {
            this.isGenerating = false;
            this.abortController = null;
        }
    }
    cancel() {
        console.log('[VectorGeneration] 收到取消信号');
        this.abortController?.abort();
    }
    getStatus() {
        if (!this.isGenerating) {
            return { isGenerating: false };
        }
        const pending = this.database.getPhotosWithoutEmbeddings(1).length;
        return { isGenerating: true, totalPending: pending };
    }
    async getPendingCount() {
        const photos = this.database.getPhotosWithoutEmbeddings(10000);
        return photos.length;
    }
}
export const vectorGenerationService = new VectorGenerationService();
//# sourceMappingURL=vectorGenerationService.js.map