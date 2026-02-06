/**
 * PhotoMind - 人脸检测服务
 *
 * 功能：
 * 1. 照片人脸检测（基于 @vladmandic/face-api）
 * 2. 128 维人脸特征向量生成
 * 3. 批量检测与进度追踪
 */
import { resolve } from 'path'
import { existsSync } from 'fs'
import { PhotoDatabase } from '../database/db.js'
import * as faceapi from '@vladmandic/face-api'
import * as tf from '@tensorflow/tfjs'
import '@tensorflow/tfjs-backend-cpu'
import sharp from 'sharp'
import { getEmbeddingService } from './hybridEmbeddingService.js'

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
  descriptor?: number[]  // 128 维人脸特征向量
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

  private tfBackendReady = false

  constructor(config?: FaceDetectionServiceConfig) {
    this.modelsPath = config?.modelsPath || resolve(process.cwd(), 'models/face-api')
    if (config?.minConfidence) this.minConfidence = config.minConfidence
    if (config?.maxFaces) this.maxFaces = config.maxFaces
  }

  private async ensureTfBackend(): Promise<void> {
    if (!this.tfBackendReady) {
      // 强制 CPU 模式，避免 WebGL 兼容性问题
      await tf.setBackend('cpu')
      await tf.ready()
      this.tfBackendReady = true
      console.log('[FaceDetection] TF.js 后端已设置为 CPU 模式')

      // 清理可能存在的泄露 tensor
      const numTensors = tf.memory().numTensors
      if (numTensors > 100) {
        console.warn(`[FaceDetection] 检测到 ${numTensors} 个未释放的 tensor，执行清理`)
        tf.disposeVariables()
      }
    }
  }

  /**
   * 加载检测模型
   */
  async loadModels(): Promise<{ success: boolean; error?: string }> {
    if (this.isLoaded) {
      return { success: true }
    }

    try {
      // 确保 TensorFlow.js 后端已初始化
      await this.ensureTfBackend()

      console.log('[FaceDetection] 加载 face-api.js 模型...')

      // 检查模型文件是否存在
      const requiredModels = [
        'tiny_face_detector_model-weights_manifest.json',
        'face_landmark_68_model-weights_manifest.json',
        'face_recognition_model-weights_manifest.json'
      ]

      for (const model of requiredModels) {
        const modelPath = resolve(this.modelsPath, model)
        if (!existsSync(modelPath)) {
          return { success: false, error: `模型文件不存在: ${model}` }
        }
      }

      // 并行加载所有模型
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromDisk(this.modelsPath),
        faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelsPath),
        faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelsPath)
      ])

      this.isLoaded = true
      console.log('[FaceDetection] 模型加载成功')
      return { success: true }
    } catch (error) {
      console.error('[FaceDetection] 模型加载失败:', error)
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
   */
  async detect(imagePath: string, options: DetectionOptions = {}): Promise<FaceDetectionResult> {
    const startTime = Date.now()
    const { minConfidence = this.minConfidence } = options

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
      // 确保模型已加载
      const loadResult = await this.loadModels()
      if (!loadResult.success) {
        return {
          success: false,
          detections: [],
          error: `模型加载失败: ${loadResult.error}`,
          processingTimeMs: Date.now() - startTime
        }
      }

      // 加载图片并转换为 tensor
      const { data, info } = await sharp(imagePath)
        .raw()
        .ensureAlpha()
        .resize(416, 416, { fit: 'inside' })
        .toBuffer({ resolveWithObject: true })

      const { width, height } = info

      // 去掉 alpha 通道 (RGBA -> RGB)
      const rgbData = new Uint8Array(width * height * 3)
      for (let i = 0; i < width * height; i++) {
        rgbData[i * 3] = data[i * 4]       // R
        rgbData[i * 3 + 1] = data[i * 4 + 1] // G
        rgbData[i * 3 + 2] = data[i * 4 + 2] // B
      }

      const imageTensor = tf.tensor3d(rgbData, [height, width, 3])

      let detections: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{
        detection: faceapi.FaceDetection
      }, faceapi.FaceLandmarks68>>[] = []

      try {
        // 添加超时控制（45秒）
        const detectionPromise = faceapi
          .detectAllFaces(imageTensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: minConfidence }))
          .withFaceLandmarks()
          .withFaceDescriptors()

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('人脸检测超时 (45s)')), 45000)
        )

        detections = await Promise.race([detectionPromise, timeoutPromise])
      } finally {
        // 确保 tensor 被释放
        imageTensor.dispose()
      }

      // 转换为内部格式 - 过滤掉没有 descriptor 的人脸
      const faces: FaceInfo[] = detections
        .filter(d => d.descriptor && d.descriptor.length === 128)  // 确保有有效的128维特征向量
        .map(d => ({
          box: {
            x: d.detection.box.x,
            y: d.detection.box.y,
            width: d.detection.box.width,
            height: d.detection.box.height
          },
          confidence: d.detection.score,
          landmarks: this.convertLandmarks(d.landmarks),
          descriptor: Array.from(d.descriptor)  // Float32Array -> number[] (128维)
        }))

      // 限制最大人脸数
      const limitedFaces = faces.slice(0, this.maxFaces)

      console.log(`[FaceDetection] 检测到 ${limitedFaces.length} 张人脸: ${imagePath}`)

      return {
        success: true,
        detections: limitedFaces,
        processingTimeMs: Date.now() - startTime
      }
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
   * 转换 face-api.js 的 landmarks 到内部格式
   */
  private convertLandmarks(landmarks: faceapi.FaceLandmarks68): FaceLandmarks {
    const positions = landmarks.positions

    return {
      jawOutline: positions.slice(0, 17).map(p => ({ x: p.x, y: p.y })),
      nose: positions.slice(27, 36).map(p => ({ x: p.x, y: p.y })),
      mouth: positions.slice(48, 68).map(p => ({ x: p.x, y: p.y })),
      leftEye: positions.slice(36, 42).map(p => ({ x: p.x, y: p.y })),
      rightEye: positions.slice(42, 48).map(p => ({ x: p.x, y: p.y }))
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
   * 检测并保存到数据库（双向量版本）
   * 同时生成 128维 face_embedding 和 512维 semantic_embedding
   */
  async detectAndSave(imagePath: string, database: PhotoDatabase): Promise<FaceDetectionResult> {
    const startTime = Date.now()

    // 检查文件是否存在
    if (!existsSync(imagePath)) {
      console.warn(`[FaceDetection] 文件不存在，跳过: ${imagePath}`)
      return {
        success: false,
        detections: [],
        error: '文件不存在',
        processingTimeMs: Date.now() - startTime
      }
    }

    const result = await this.detect(imagePath, {})

    if (result.success && result.detections.length > 0) {
      // 获取照片
      const photo = database.getPhotoByFilePath(imagePath)

      if (!photo) {
        console.warn(`[FaceDetection] 数据库中未找到照片: ${imagePath}`)
        return result
      }

      // 安全获取 photoId
      const photoId = (photo as any).id ?? null

      if (!photoId) {
        console.warn(`[FaceDetection] 照片缺少 id，跳过: ${imagePath}`)
        return result
      }

      // 获取图片尺寸用于坐标转换
      const imageInfo = await sharp(imagePath).metadata()
      const imgWidth = imageInfo.width || 1
      const imgHeight = imageInfo.height || 1

      // 加载 sharp 实例用于裁剪
      const sharpInstance = sharp(imagePath)

      // 为每个人脸生成双向量
      const facesToSave: Array<{
        id: string
        bbox_x: number
        bbox_y: number
        bbox_width: number
        bbox_height: number
        confidence: number
        embedding?: number[]
        face_embedding?: number[]
        semantic_embedding?: number[]
        vector_version?: number
      }> = []
      for (let index = 0; index < result.detections.length; index++) {
        const face = result.detections[index]
        const faceId = `${photoId}_${index}_${Date.now()}`

        // 转换相对坐标为绝对像素坐标
        const absX = Math.round((face.box.x / 416) * imgWidth)
        const absY = Math.round((face.box.y / 416) * imgHeight)
        const absWidth = Math.round((face.box.width / 416) * imgWidth)
        const absHeight = Math.round((face.box.height / 416) * imgHeight)

        // 确保坐标在图片范围内
        const cropX = Math.max(0, absX)
        const cropY = Math.max(0, absY)
        const cropWidth = Math.min(absWidth, imgWidth - cropX)
        const cropHeight = Math.min(absHeight, imgHeight - cropY)

        let semanticEmbedding: number[] | undefined = undefined

        try {
          // 裁剪人脸区域
          const faceBuffer = await sharpInstance
            .clone()
            .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
            .resize(224, 224, { fit: 'cover' })
            .jpeg({ quality: 90 })
            .toBuffer()

          // 转换为 base64 传递给 CLIP
          const faceBase64 = `data:image/jpeg;base64,${faceBuffer.toString('base64')}`

          // 生成 512维语义向量
          const embeddingService = getEmbeddingService()
          const clipResult = await embeddingService.imageToEmbedding(faceBase64)

          if (clipResult.success && clipResult.vector) {
            semanticEmbedding = clipResult.vector.values || (clipResult.vector as any)
            console.log(`[FaceDetection] 生成 CLIP 向量成功: ${faceId}, 维度: ${semanticEmbedding?.length}`)
          } else {
            console.warn(`[FaceDetection] CLIP 向量生成失败: ${faceId}, 错误: ${clipResult.error}`)
          }
        } catch (clipError) {
          console.warn(`[FaceDetection] 生成语义向量失败: ${faceId}`, clipError)
          // 继续保存，semantic_embedding 可以为 null
        }

        facesToSave.push({
          id: faceId,
          bbox_x: face.box.x,
          bbox_y: face.box.y,
          bbox_width: face.box.width,
          bbox_height: face.box.height,
          confidence: face.confidence,
          embedding: face.descriptor,  // 128 维 face-api 向量 (兼容旧字段)
          face_embedding: face.descriptor,  // 128 维 face-api 向量
          semantic_embedding: semanticEmbedding,  // 512 维 CLIP 向量
          vector_version: semanticEmbedding ? 2 : 1  // 2=双向量, 1=只有face向量
        })
      }

      try {
        database.saveDetectedFaces(photoId, facesToSave)
        const withSemantic = facesToSave.filter(f => f.semantic_embedding).length
        console.log(`[FaceDetection] 保存 ${facesToSave.length} 张人脸: ${withSemantic} 张有语义向量, ${facesToSave.length - withSemantic} 张只有人脸向量`)
      } catch (e) {
        console.error(`[FaceDetection] 保存人脸失败: ${imagePath}`, e)
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
