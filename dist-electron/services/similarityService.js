export class SimilarityService {
    cosineSimilarity(a, b) {
        if (a.length !== b.length) {
            console.warn('[Similarity] 向量维度不匹配');
            return 0;
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
        if (denominator === 0)
            return 0;
        return dotProduct / denominator;
    }
    euclideanDistance(a, b) {
        if (a.length !== b.length) {
            return Infinity;
        }
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            sum += Math.pow(a[i] - b[i], 2);
        }
        return Math.sqrt(sum);
    }
    dotProduct(a, b) {
        if (a.length !== b.length) {
            return 0;
        }
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            sum += a[i] * b[i];
        }
        return sum;
    }
    norm(vector) {
        return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    }
    batchSimilarity(queryVector, targetVectors) {
        return targetVectors.map(item => ({
            id: item.photoUuid,
            similarity: this.cosineSimilarity(queryVector, item.vector)
        }));
    }
    topK(similarities, k, minSimilarity = 0) {
        return similarities
            .filter(s => s.similarity >= minSimilarity)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, k);
    }
    async semanticSearch(queryVector, getAllEmbeddings, options = {}) {
        const { topK = 50, minSimilarity = 0.1 } = options;
        const embeddings = await getAllEmbeddings();
        const similarities = this.batchSimilarity(queryVector, embeddings);
        const topResults = this.topK(similarities, topK, minSimilarity);
        return topResults.map((item, index) => ({
            photoUuid: item.id,
            similarity: item.similarity,
            rank: index + 1
        }));
    }
    async multiQuerySearch(queryVectors, getAllEmbeddings, options = {}) {
        const { topK = 50, minSimilarity = 0.1, weights } = options;
        const embeddings = await getAllEmbeddings();
        const vectorWeights = weights || queryVectors.map(() => 1 / queryVectors.length);
        const scoreMap = new Map();
        for (let i = 0; i < queryVectors.length; i++) {
            const similarities = this.batchSimilarity(queryVectors[i], embeddings);
            for (const sim of similarities) {
                const existing = scoreMap.get(sim.id) || { totalScore: 0, count: 0 };
                existing.totalScore += sim.similarity * vectorWeights[i];
                existing.count += 1;
                scoreMap.set(sim.id, existing);
            }
        }
        const results = [];
        for (const [id, data] of scoreMap.entries()) {
            results.push({
                id,
                similarity: data.totalScore / data.count
            });
        }
        const topResults = this.topK(results, topK, minSimilarity);
        return topResults.map((item, index) => ({
            photoUuid: item.id,
            similarity: item.similarity,
            rank: index + 1
        }));
    }
    similarityToPercent(similarity) {
        return Math.round(similarity * 100);
    }
    getSimilarityLevel(similarity) {
        if (similarity >= 0.7)
            return 'high';
        if (similarity >= 0.4)
            return 'medium';
        return 'low';
    }
}
export const similarityService = new SimilarityService();
//# sourceMappingURL=similarityService.js.map