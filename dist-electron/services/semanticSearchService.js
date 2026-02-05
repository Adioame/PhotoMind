import { getEmbeddingService } from './embeddingService.js';
import { PhotoDatabase } from '../database/db.js';
import { similarityService } from './similarityService.js';
import { textPreprocessor } from './textPreprocessor.js';
export class SemanticSearchService {
    constructor(database) {
        this.database = database || new PhotoDatabase();
    }
    async search(options) {
        const startTime = Date.now();
        const { query, topK = 50, minSimilarity = 0.1, page = 1, pageSize = 20 } = options;
        const processed = textPreprocessor.preprocess(query);
        const embeddingService = getEmbeddingService();
        const textResult = await embeddingService.textToEmbedding(processed.processed);
        if (!textResult.success || !textResult.vector) {
            console.log('[SemanticSearch] 文本转向量失败');
            return {
                results: [],
                total: 0,
                page,
                pageSize,
                processingTimeMs: Date.now() - startTime,
                query: {
                    original: query,
                    processed: processed.processed,
                    language: processed.language
                }
            };
        }
        console.log(`[SemanticSearch] 向量生成成功，维度: ${textResult.vector.length}`);
        const allEmbeddings = await this.database.getAllEmbeddings('image');
        console.log(`[SemanticSearch] 获取到 ${allEmbeddings.length} 个向量`);
        if (allEmbeddings.length === 0) {
            return {
                results: [],
                total: 0,
                page,
                pageSize,
                processingTimeMs: Date.now() - startTime,
                query: {
                    original: query,
                    processed: processed.processed,
                    language: processed.language
                }
            };
        }
        const similarities = similarityService.batchSimilarity(textResult.vector, allEmbeddings);
        console.log(`[SemanticSearch] 相似度计算完成`);
        const sorted = similarityService.topK(similarities, topK, minSimilarity);
        console.log(`[SemanticSearch] 排序完成，前 ${sorted.length} 个结果`);
        const results = [];
        for (let i = 0; i < sorted.length; i++) {
            const item = sorted[i];
            const photo = this.database.getPhotoByUuid(item.id);
            if (photo) {
                results.push({
                    photoUuid: item.id,
                    similarity: item.similarity,
                    rank: i + 1,
                    photo: this.formatPhoto(photo)
                });
            }
        }
        const startIndex = (page - 1) * pageSize;
        const pagedResults = results.slice(startIndex, startIndex + pageSize);
        const processingTime = Date.now() - startTime;
        console.log(`[SemanticSearch] 搜索完成，耗时 ${processingTime}ms`);
        return {
            results: pagedResults,
            total: results.length,
            page,
            pageSize,
            processingTimeMs: processingTime,
            query: {
                original: query,
                processed: processed.processed,
                language: processed.language
            }
        };
    }
    async multiQuerySearch(queries, options = {}) {
        const { topK = 50, minSimilarity = 0.1, weights } = options;
        const processedQueries = queries.map(q => ({
            original: q,
            processed: textPreprocessor.preprocess(q).processed
        }));
        const embeddingService = getEmbeddingService();
        const vectors = [];
        for (const q of processedQueries) {
            const result = await embeddingService.textToEmbedding(q.processed);
            if (result.success && result.vector) {
                vectors.push(result.vector);
            }
        }
        if (vectors.length === 0) {
            return {
                results: [],
                total: 0,
                page: 1,
                pageSize: 20,
                processingTimeMs: 0,
                query: {
                    original: queries.join(' '),
                    processed: processedQueries.map(q => q.processed).join(' '),
                    language: 'mixed'
                }
            };
        }
        const allEmbeddings = await this.database.getAllEmbeddings('image');
        const defaultWeights = weights || vectors.map(() => 1 / vectors.length);
        const scoreMap = new Map();
        for (let i = 0; i < vectors.length; i++) {
            const similarities = similarityService.batchSimilarity(vectors[i], allEmbeddings);
            for (const sim of similarities) {
                const existing = scoreMap.get(sim.id) || { totalScore: 0, count: 0 };
                existing.totalScore += sim.similarity * defaultWeights[i];
                existing.count += 1;
                scoreMap.set(sim.id, existing);
            }
        }
        const results = [];
        for (const [id, data] of scoreMap.entries()) {
            const avgScore = data.totalScore / data.count;
            if (avgScore >= minSimilarity) {
                const photo = this.database.getPhotoByUuid(id);
                if (photo) {
                    results.push({
                        photoUuid: id,
                        similarity: avgScore,
                        rank: 0,
                        photo: this.formatPhoto(photo)
                    });
                }
            }
        }
        results.sort((a, b) => b.similarity - a.similarity);
        results.forEach((r, i) => r.rank = i + 1);
        return {
            results: results.slice(0, topK),
            total: results.length,
            page: 1,
            pageSize: topK,
            processingTimeMs: 0,
            query: {
                original: queries.join(' '),
                processed: processedQueries.map(q => q.processed).join(' '),
                language: 'mixed'
            }
        };
    }
    formatPhoto(photo) {
        return {
            uuid: photo.uuid,
            fileName: photo.file_name,
            filePath: photo.file_path,
            fileSize: photo.file_size,
            width: photo.width,
            height: photo.height,
            takenAt: photo.taken_at,
            exif: photo.exif_data && typeof photo.exif_data === 'string'
                ? JSON.parse(photo.exif_data)
                : (photo.exif_data || {}),
            location: photo.location_data && typeof photo.location_data === 'string'
                ? JSON.parse(photo.location_data)
                : (photo.location_data || {}),
            thumbnailPath: photo.thumbnail_path
        };
    }
    async quickSearch(query, topK = 10) {
        const processed = textPreprocessor.preprocess(query);
        const embeddingService = getEmbeddingService();
        const textResult = await embeddingService.textToEmbedding(processed.processed);
        if (!textResult.success || !textResult.vector) {
            return [];
        }
        const allEmbeddings = await this.database.getAllEmbeddings('image');
        const similarities = similarityService.batchSimilarity(textResult.vector, allEmbeddings);
        return similarityService.topK(similarities, topK, 0)
            .map((item, index) => ({
            photoUuid: item.id,
            similarity: item.similarity
        }));
    }
}
export const semanticSearchService = new SemanticSearchService();
//# sourceMappingURL=semanticSearchService.js.map