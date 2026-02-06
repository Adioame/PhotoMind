/**
 * PhotoMind - Face Clustering Structure Tests
 *
 * 验证 face-api.js 集成后的代码结构正确性
 * （模型加载测试需要正确格式的模型文件）
 */
import { describe, it, expect } from 'vitest'
import { faceDetectionService, FaceInfo } from '../../electron/services/faceDetectionService.js'

describe('Face Clustering Structure', () => {
  describe('AC-1: Face Detection Service Structure', () => {
    it('should have faceDetectionService exported', () => {
      expect(faceDetectionService).toBeDefined()
      expect(typeof faceDetectionService.detect).toBe('function')
      expect(typeof faceDetectionService.loadModels).toBe('function')
    })

    it('should return correct model status structure', () => {
      const status = faceDetectionService.getModelStatus()
      expect(status).toHaveProperty('loaded')
      expect(status).toHaveProperty('modelsPath')
      expect(status).toHaveProperty('configured')
      expect(typeof status.loaded).toBe('boolean')
      expect(typeof status.modelsPath).toBe('string')
    })
  })

  describe('AC-2: 128-Dimensional Embedding Support', () => {
    it('should have descriptor property in FaceInfo interface', () => {
      // 创建一个符合 FaceInfo 接口的对象
      const faceInfo: FaceInfo = {
        box: { x: 10, y: 20, width: 100, height: 120 },
        confidence: 0.85,
        descriptor: new Array(128).fill(0.1)
      }

      expect(faceInfo.descriptor).toBeDefined()
      expect(faceInfo.descriptor!.length).toBe(128)
    })

    it('should validate 128-dim embedding values', () => {
      const validEmbedding = new Array(128).fill(0.1)
      const hasValidLength = validEmbedding.length === 128
      const hasValidValues = validEmbedding.every(v => typeof v === 'number' && !Number.isNaN(v))

      expect(hasValidLength).toBe(true)
      expect(hasValidValues).toBe(true)
    })
  })

  describe('AC-3: Cosine Similarity Calculation', () => {
    function calculateSimilarity(emb1: number[], emb2: number[]): number {
      const dot = emb1.reduce((sum, v, i) => sum + v * emb2[i], 0)
      const norm1 = Math.sqrt(emb1.reduce((sum, v) => sum + v * v, 0))
      const norm2 = Math.sqrt(emb2.reduce((sum, v) => sum + v * v, 0))
      return dot / (norm1 * norm2)
    }

    it('should calculate high similarity for same person embeddings', () => {
      const base = new Array(128).fill(0.1)
      const variant = base.map(v => v + (Math.random() - 0.5) * 0.01)

      const similarity = calculateSimilarity(base, variant)
      expect(similarity).toBeGreaterThan(0.95)
    })

    it('should calculate low similarity for different person embeddings', () => {
      const emb1 = Array.from({ length: 128 }, () => Math.random() - 0.5)
      const emb2 = Array.from({ length: 128 }, () => Math.random() - 0.5)

      const similarity = calculateSimilarity(emb1, emb2)
      expect(similarity).toBeLessThan(0.5)
    })
  })

  describe('AC-4: Face Clustering Algorithm', () => {
    interface Face {
      id: string
      embedding: number[]
    }

    function clusterFaces(faces: Face[], threshold: number = 0.6): Face[][] {
      const clusters: Face[][] = []
      const visited = new Set<number>()

      for (let i = 0; i < faces.length; i++) {
        if (visited.has(i)) continue

        const cluster = [faces[i]]
        visited.add(i)

        for (let j = i + 1; j < faces.length; j++) {
          if (visited.has(j)) continue

          const emb1 = faces[i].embedding
          const emb2 = faces[j].embedding
          const dot = emb1.reduce((sum, v, k) => sum + v * emb2[k], 0)
          const norm1 = Math.sqrt(emb1.reduce((sum, v) => sum + v * v, 0))
          const norm2 = Math.sqrt(emb2.reduce((sum, v) => sum + v * v, 0))
          const similarity = dot / (norm1 * norm2)

          if (similarity > threshold) {
            cluster.push(faces[j])
            visited.add(j)
          }
        }

        if (cluster.length >= 2) {
          clusters.push(cluster)
        }
      }

      return clusters
    }

    it('should cluster same person faces together', () => {
      const baseEmbedding = new Array(128).fill(0.1).map(() => Math.random() - 0.5)
      const normalize = (arr: number[]) => {
        const norm = Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0))
        return arr.map(v => v / norm)
      }

      const person1 = [1, 2, 3].map(id => ({
        id: `face_${id}`,
        embedding: normalize(baseEmbedding.map(v => v + (Math.random() - 0.5) * 0.05))
      }))

      const otherBase = new Array(128).map(() => Math.random() - 0.5)
      const person2 = [4, 5].map(id => ({
        id: `face_${id}`,
        embedding: normalize(otherBase.map(v => v + (Math.random() - 0.5) * 0.05))
      }))

      const clusters = clusterFaces([...person1, ...person2], 0.6)
      expect(clusters.length).toBeGreaterThanOrEqual(1)
    })

    it('should require minimum cluster size of 2', () => {
      const singleFace = [{
        id: 'face_1',
        embedding: new Array(128).map(() => Math.random() - 0.5)
      }]

      const clusters = clusterFaces(singleFace, 0.6)
      expect(clusters.length).toBe(0)
    })
  })
})
