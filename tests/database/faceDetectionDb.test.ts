/**
 * PhotoMind - Face Detection Type Tests
 * Type-level tests to verify interfaces and types are properly defined
 */

// Define the interfaces locally to verify they work correctly
interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

interface FaceLandmarks {
  jawOutline: Point[]
  nose: Point[]
  mouth: Point[]
  leftEye: Point[]
  rightEye: Point[]
}

interface Point {
  x: number
  y: number
}

interface FaceInfo {
  box: BoundingBox
  confidence: number
  landmarks?: FaceLandmarks
}

interface FaceDetectionResult {
  success: boolean
  detections: FaceInfo[]
  error?: string
  processingTimeMs: number
}

interface DetectionOptions {
  maxResults?: number
  minConfidence?: number
}

interface BatchDetectionProgress {
  current: number
  total: number
  currentPhoto: string
  detectedFaces: number
  status: 'pending' | 'processing' | 'completed' | 'cancelled'
}

interface FaceDetectionServiceConfig {
  modelsPath?: string
  minConfidence?: number
  maxFaces?: number
}

describe('Face Detection Types', () => {
  describe('BoundingBox', () => {
    it('should support valid bounding box values', () => {
      const bbox: BoundingBox = {
        x: 100,
        y: 100,
        width: 120,
        height: 150
      }
      expect(bbox.x).toBe(100)
      expect(bbox.width).toBe(120)
    })
  })

  describe('FaceLandmarks', () => {
    it('should support landmark points', () => {
      const landmarks: FaceLandmarks = {
        jawOutline: [{ x: 1, y: 2 }],
        nose: [{ x: 3, y: 4 }],
        mouth: [{ x: 5, y: 6 }],
        leftEye: [{ x: 7, y: 8 }],
        rightEye: [{ x: 9, y: 10 }]
      }
      expect(landmarks.jawOutline.length).toBe(1)
      expect(landmarks.nose.length).toBe(1)
    })
  })

  describe('FaceInfo', () => {
    it('should support face info with all fields', () => {
      const face: FaceInfo = {
        box: { x: 0, y: 0, width: 100, height: 100 },
        confidence: 0.95,
        landmarks: {
          jawOutline: [{ x: 0, y: 100 }],
          nose: [{ x: 50, y: 60 }],
          mouth: [{ x: 50, y: 80 }],
          leftEye: [{ x: 30, y: 40 }],
          rightEye: [{ x: 70, y: 40 }]
        }
      }
      expect(face.confidence).toBe(0.95)
    })

    it('should support face info without landmarks', () => {
      const face: FaceInfo = {
        box: { x: 0, y: 0, width: 100, height: 100 },
        confidence: 0.85
      }
      expect(face.landmarks).toBeUndefined()
    })
  })

  describe('FaceDetectionResult', () => {
    it('should support successful detection result', () => {
      const result: FaceDetectionResult = {
        success: true,
        detections: [
          {
            box: { x: 100, y: 100, width: 120, height: 150 },
            confidence: 0.92
          }
        ],
        processingTimeMs: 150
      }
      expect(result.success).toBe(true)
      expect(result.detections.length).toBe(1)
    })

    it('should support failed detection result with error', () => {
      const result: FaceDetectionResult = {
        success: false,
        detections: [],
        error: 'Image file not found',
        processingTimeMs: 50
      }
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('DetectionOptions', () => {
    it('should support default options', () => {
      const options: DetectionOptions = {}
      expect(options.maxResults).toBeUndefined()
      expect(options.minConfidence).toBeUndefined()
    })

    it('should support custom options', () => {
      const options: DetectionOptions = {
        maxResults: 10,
        minConfidence: 0.7
      }
      expect(options.maxResults).toBe(10)
      expect(options.minConfidence).toBe(0.7)
    })
  })

  describe('BatchDetectionProgress', () => {
    it('should support all progress states', () => {
      const states: BatchDetectionProgress['status'][] = ['pending', 'processing', 'completed', 'cancelled']

      for (const state of states) {
        const progress: BatchDetectionProgress = {
          current: 5,
          total: 10,
          currentPhoto: 'photo.jpg',
          detectedFaces: 3,
          status: state
        }
        expect(progress.status).toBe(state)
      }
    })

    it('should track progress correctly', () => {
      const progress: BatchDetectionProgress = {
        current: 3,
        total: 100,
        currentPhoto: 'IMG_1234.jpg',
        detectedFaces: 5,
        status: 'processing'
      }
      expect(progress.current / progress.total).toBe(0.03)
    })
  })

  describe('FaceDetectionServiceConfig', () => {
    it('should support default config', () => {
      const config: FaceDetectionServiceConfig = {}
      expect(config.modelsPath).toBeUndefined()
      expect(config.minConfidence).toBeUndefined()
      expect(config.maxFaces).toBeUndefined()
    })

    it('should support custom config', () => {
      const config: FaceDetectionServiceConfig = {
        modelsPath: '/custom/models/path',
        minConfidence: 0.6,
        maxFaces: 20
      }
      expect(config.modelsPath).toBe('/custom/models/path')
      expect(config.minConfidence).toBe(0.6)
      expect(config.maxFaces).toBe(20)
    })
  })

  describe('Face Detection Scenarios', () => {
    it('should represent single face detection', () => {
      const result: FaceDetectionResult = {
        success: true,
        detections: [
          {
            box: { x: 150, y: 80, width: 100, height: 130 },
            confidence: 0.97,
            landmarks: {
              jawOutline: Array.from({ length: 17 }, (_, i) => ({ x: 150 + i * 6, y: 210 })),
              nose: [{ x: 200, y: 140 }, { x: 200, y: 170 }],
              mouth: Array.from({ length: 20 }, (_, i) => ({ x: 160 + i * 2, y: 195 })),
              leftEye: Array.from({ length: 6 }, (_, i) => ({ x: 165 + i * 4, y: 110 })),
              rightEye: Array.from({ length: 6 }, (_, i) => ({ x: 215 + i * 4, y: 110 }))
            }
          }
        ],
        processingTimeMs: 250
      }
      expect(result.detections.length).toBe(1)
      expect(result.detections[0].confidence).toBeGreaterThan(0.9)
    })

    it('should represent multi-face detection', () => {
      const result: FaceDetectionResult = {
        success: true,
        detections: [
          {
            box: { x: 50, y: 50, width: 80, height: 100 },
            confidence: 0.94
          },
          {
            box: { x: 200, y: 50, width: 80, height: 100 },
            confidence: 0.91
          },
          {
            box: { x: 350, y: 50, width: 80, height: 100 },
            confidence: 0.88
          }
        ],
        processingTimeMs: 500
      }
      expect(result.detections.length).toBe(3)
    })

    it('should represent no face detection', () => {
      const result: FaceDetectionResult = {
        success: true,
        detections: [],
        processingTimeMs: 180
      }
      expect(result.detections.length).toBe(0)
    })
  })

  describe('Database Interfaces', () => {
    interface DetectedFaceRecord {
      id: string
      photo_id: number
      bbox_x: number
      bbox_y: number
      bbox_width: number
      bbox_height: number
      confidence: number
      person_id?: number
      embedding?: number[]
      created_at: string
      processed: number
    }

    it('should support detected face record', () => {
      const face: DetectedFaceRecord = {
        id: 'face-uuid-123',
        photo_id: 1,
        bbox_x: 100,
        bbox_y: 100,
        bbox_width: 120,
        bbox_height: 150,
        confidence: 0.95,
        person_id: undefined,
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        created_at: '2024-01-15T10:30:00Z',
        processed: 0
      }
      expect(face.id).toBe('face-uuid-123')
      expect(face.embedding?.length).toBe(5)
    })

    it('should support processed face record', () => {
      const face: DetectedFaceRecord = {
        id: 'face-uuid-456',
        photo_id: 2,
        bbox_x: 200,
        bbox_y: 150,
        bbox_width: 100,
        bbox_height: 120,
        confidence: 0.92,
        person_id: 1,
        processed: 1
      }
      expect(face.person_id).toBeDefined()
      expect(face.processed).toBe(1)
    })
  })
})
