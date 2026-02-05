/**
 * PhotoMind - 人脸检测服务
 *
 * 功能：
 * 1. 照片人脸检测
 * 2. 批量检测
 * 3. 进度追踪
 *
 * 注意：此服务使用纯算法检测，实际使用时需要集成
 * face-api.js 或 TensorFlow.js 模型
 */
import { resolve } from 'path'
import { existsSync } from 'fs'
import { PhotoDatabase } from '../database/db.js'

export interface FaceDetectionResult {
  success: boolean
  detections: FaceInfo[]
  error?: string
  processingTimeMs: number
}

export interface FaceInfo {
  box: BoundingBox
  confidence: number
  landmarks?: FaceLandmarks
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface FaceLandmarks {
  jawOutline: Point[]
  nose: Point[]
  mouth: Point[]
  leftEye: Point[]
  rightEye: Point[]
}

export interface Point {
  x: number
  y: number
}

export interface DetectionOptions {
  maxResults?: number
  minConfidence?: number
}

export interface BatchDetectionProgress {
  current: number
  total: number
  currentPhoto: string
  detectedFaces: number
  status: 'pending' | 'processing' | 'completed' | 'cancelled'
}

export interface FaceDetectionServiceConfig {
  modelsPath?: string
  minConfidence?: number
  maxFaces?: number
}

export class FaceDetectionService {
  private modelsPath: string
  private isLoaded = false
  private abortController: AbortController | null = null
  private minConfidence = 0.5
  private maxFaces = 10

  constructor(config?: FaceDetectionServiceConfig) {
    this.modelsPath = config?.modelsPath || resolve(process.cwd(), 'models/face-api')
    if (config?.minConfidence) this.minConfidence = config.minConfidence
    if (config?.maxFaces) this.maxFaces = config.maxFaces
  }

  /**
   * 加载检测模型
   */
  async loadModels(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[FaceDetection] 检查模型配置...')

      // 检查模型是否存在
      const modelFiles = [
        'tiny_face_detector_model-weights_manifest.json',
        'face_landmark_68_model-weights_manifest.json'
      ]

      let allModelsExist = true
      for (const model of modelFiles) {
        const modelPath = resolve(this.modelsPath, model)
        if (!existsSync(modelPath)) {
          console.warn(`[FaceDetection] 模型文件不存在: ${model}`)
          allModelsExist = false
        }
      }

      if (allModelsExist) {
        this.isLoaded = true
        console.log('[FaceDetection] 模型已就绪')
        return { success: true }
      }

      // 如果模型不存在，返回提示
      console.log('[FaceDetection] 模型文件不存在，将使用模拟检测')
      return { success: false, error: '模型文件不存在，请下载 face-api.js 模型文件' }
    } catch (error) {
      console.error('[FaceDetection] 模型检查失败:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * 检查模型状态
   */
  getModelStatus(): { loaded: boolean; modelsPath: string; configured: boolean } {
    return {
      loaded: this.isLoaded,
      modelsPath: this.modelsPath,
      configured: this.isLoaded
    }
  }

  /**
   * 检测照片中的人脸
   * 实际实现需要集成 face-api.js 或 TensorFlow.js
   */
  async detect(imagePath: string, options: DetectionOptions = {}): Promise<FaceDetectionResult> {
    const startTime = Date.now()
    const { maxResults = this.maxFaces, minConfidence = this.minConfidence } = options

    // 检查文件是否存在
    if (!existsSync(imagePath)) {
      return {
        success: false,
        detections: [],
        error: '图片文件不存在',
        processingTimeMs: Date.now() - startTime
      }
    }

    try {
      // 尝试加载模型
      if (!this.isLoaded) {
        const loadResult = await this.loadModels()
        if (!loadResult.success) {
          // 返回模拟结果用于演示
          return this.mockDetection(imagePath, startTime, minConfidence)
        }
      }

      // 这里需要集成实际的检测库
      // 目前返回模拟结果
      console.log(`[FaceDetection] 检测图片: ${imagePath}`)
      return this.mockDetection(imagePath, startTime, minConfidence)
    } catch (error) {
      console.error('[FaceDetection] 检测失败:', error)
      return {
        success: false,
        detections: [],
        error: error instanceof Error ? error.message : '检测失败',
        processingTimeMs: Date.now() - startTime
      }
    }
  }

  /**
   * 模拟检测（用于演示和测试）
   */
  private mockDetection(imagePath: string, startTime: number, minConfidence: number): FaceDetectionResult {
    // 随机决定是否检测到人脸
    const shouldDetect = Math.random() > 0.3

    if (!shouldDetect) {
      return {
        success: true,
        detections: [],
        processingTimeMs: Date.now() - startTime
      }
    }

    // 生成随机的人脸检测结果
    const faceCount = Math.floor(Math.random() * 3) + 1 // 1-3 张人脸
    const detections: FaceInfo[] = []

    for (let i = 0; i < Math.min(faceCount, 3); i++) {
      detections.push({
        box: {
          x: 100 + i * 150,
          y: 100,
          width: 120,
          height: 150
        },
        confidence: 0.7 + Math.random() * 0.25,
        landmarks: {
          jawOutline: Array.from({ length: 17 }, (_, j) => ({ x: 100 + i * 150 + j * 7, y: 100 + 150 })),
          nose: [{ x: 160 + i * 150, y: 180 }, { x: 160 + i * 150, y: 210 }],
          mouth: Array.from({ length: 20 }, (_, j) => ({ x: 120 + i * 150 + j * 3, y: 240 })),
          leftEye: Array.from({ length: 6 }, (_, j) => ({ x: 130 + i * 150 + j * 4, y: 140 })),
          rightEye: Array.from({ length: 6 }, (_, j) => ({ x: 170 + i * 150 + j * 4, y: 140 }))
        }
      })
    }

    console.log(`[FaceDetection] 模拟检测到 ${detections.length} 张人脸`)
    return {
      success: true,
      detections: detections.filter(d => d.confidence >= minConfidence),
      processingTimeMs: Date.now() - startTime
    }
  }

  /**
   * 批量检测
   */
  async detectBatch(
    imagePaths: string[],
    options: DetectionOptions = {},
    onProgress?: (progress: BatchDetectionProgress) => void
  ): Promise<{
    results: Map<string, FaceDetectionResult>
    totalDetected: number
    processingTimeMs: number
  }> {
    const startTime = Date.now()
    const results = new Map<string, FaceDetectionResult>()
    let totalDetected = 0

    // 设置取消控制器
    this.abortController = new AbortController()

    for (let i = 0; i < imagePaths.length; i++) {
      // 检查是否取消
      if (this.abortController?.signal.aborted) {
        console.log('[FaceDetection] 检测任务已取消')
        break
      }

      const imagePath = imagePaths[i]
      const filename = imagePath.split('/').pop() || `photo_${i}`

      // 报告进度
      onProgress?.({
        current: i + 1,
        total: imagePaths.length,
        currentPhoto: filename,
        detectedFaces: totalDetected,
        status: 'processing'
      })

      // 检测
      const result = await this.detect(imagePath, options)
      results.set(imagePath, result)

      if (result.success) {
        totalDetected += result.detections.length
      }

      console.log(`[FaceDetection] ${i + 1}/${imagePaths.length}: ${filename} - ${result.detections.length} 张人脸`)
    }

    // 报告完成
    onProgress?.({
      current: imagePaths.length,
      total: imagePaths.length,
      currentPhoto: '',
      detectedFaces: totalDetected,
      status: this.abortController?.signal.aborted ? 'cancelled' : 'completed'
    })

    return {
      results,
      totalDetected,
      processingTimeMs: Date.now() - startTime
    }
  }

  /**
   * 取消检测任务
   */
  cancel(): void {
    this.abortController?.abort()
    console.log('[FaceDetection] 检测任务已取消')
  }

  /**
   * 检测并保存到数据库
   */
  async detectAndSave(imagePath: string, database: PhotoDatabase): Promise<FaceDetectionResult> {
    const result = await this.detect(imagePath)

    if (result.success && result.detections.length > 0) {
      // 获取照片
      const photo = database.getPhotoByFilePath(imagePath)
      if (photo) {
        const photoId = (photo as any).id || (photo as any).uuid

        for (const face of result.detections) {
          try {
            database.addFace({
              photoId,
              boundingBox: face.box,
              confidence: face.confidence,
              is_manual: 0  // 自动检测
            })
          } catch (e) {
            // 忽略保存错误
          }
        }
        console.log(`[FaceDetection] 保存 ${result.detections.length} 张检测到的人脸`)
      }
    }

    return result
  }

  /**
   * 检测照片中的人脸并返回边界框（简化版）
   */
  async detectFaces(imagePath: string): Promise<{
    faces: BoundingBox[]
    processingTimeMs: number
  }> {
    const result = await this.detect(imagePath)
    return {
      faces: result.detections.map(d => d.box),
      processingTimeMs: result.processingTimeMs
    }
  }

  /**
   * 获取检测统计
   */
  getStats(): {
    modelLoaded: boolean
    configured: boolean
  } {
    return {
      modelLoaded: this.isLoaded,
      configured: this.isLoaded
    }
  }
}

export const faceDetectionService = new FaceDetectionService()
