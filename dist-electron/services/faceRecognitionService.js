export class FaceRecognitionService {
    constructor(database) {
        this.database = database;
        this.config = {
            minFaceSize: 50,
            maxFaceSize: 500,
            similarityThreshold: 0.7,
            minConfidence: 0.6
        };
    }
    async detectFaces(photoPath) {
        console.log('人脸检测服务需要配置人脸检测库');
        return [];
    }
    async extractEmbedding(faceImage) {
        const embedding = new Array(128).fill(0).map(() => Math.random() * 2 - 1);
        return embedding;
    }
    cosineSimilarity(a, b) {
        if (a.length !== b.length)
            return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    async addFaceToPerson(faceId, personId) {
        try {
            await this.database.query('UPDATE faces SET person_id = ? WHERE id = ?', [personId, faceId]);
            return true;
        }
        catch (error) {
            console.error('添加人脸到人物失败:', error);
            return false;
        }
    }
    async createPerson(name) {
        return this.database.addPerson({ name });
    }
    async clusterUnassignedFaces() {
        const faces = await this.database.query(`SELECT * FROM faces WHERE person_id IS NULL`);
        console.log(`找到 ${faces.length} 个未分配的人脸，需要嵌入向量进行聚类`);
        return [];
    }
    async findMostSimilarPerson(embedding) {
        const persons = await this.database.getAllPersons();
        let bestMatch = null;
        let bestSimilarity = 0;
        for (const person of persons) {
            const personEmbedding = person.embedding || [];
            if (personEmbedding.length === 0)
                continue;
            const similarity = this.cosineSimilarity(embedding, personEmbedding);
            if (similarity > bestSimilarity && similarity > this.config.similarityThreshold) {
                bestSimilarity = similarity;
                bestMatch = person;
            }
        }
        return {
            person: bestMatch,
            similarity: bestSimilarity
        };
    }
    async processPhoto(photoPath, photoId) {
        try {
            const faces = await this.detectFaces(photoPath);
            if (faces.length === 0) {
                return { facesFound: 0, facesAdded: 0 };
            }
            let facesAdded = 0;
            for (const face of faces) {
                const embedding = await this.extractEmbedding(Buffer.from([]));
                if (embedding) {
                    const { person } = await this.findMostSimilarPerson(embedding);
                    const faceId = this.database.addFace({
                        photoId,
                        personId: person?.id,
                        boundingBox: face.boundingBox,
                        confidence: face.confidence
                    });
                    if (faceId > 0) {
                        facesAdded++;
                    }
                }
            }
            return { facesFound: faces.length, facesAdded };
        }
        catch (error) {
            console.error('处理照片人脸失败:', error);
            return { facesFound: 0, facesAdded: 0 };
        }
    }
    async processPhotos(photoPaths, onProgress) {
        let photosProcessed = 0;
        let totalFaces = 0;
        for (let i = 0; i < photoPaths.length; i++) {
            const { path, id } = photoPaths[i];
            const result = await this.processPhoto(path, id);
            photosProcessed++;
            totalFaces += result.facesAdded;
            onProgress?.(i + 1, photoPaths.length);
        }
        return { photosProcessed, totalFaces };
    }
    async getPersonStats() {
        const persons = await this.database.getAllPersons();
        const totalFaces = await this.database.query('SELECT COUNT(*) as count FROM faces')[0]?.count || 0;
        const unassignedFaces = await this.database.query('SELECT COUNT(*) as count FROM faces WHERE person_id IS NULL')[0]?.count || 0;
        return {
            totalPersons: persons.length,
            totalFaces,
            unassignedFaces
        };
    }
}
export const faceRecognitionService = (database) => new FaceRecognitionService(database);
//# sourceMappingURL=faceRecognitionService.js.map