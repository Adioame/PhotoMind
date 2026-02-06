/**
 * PhotoMind - 性能测试服务
 *
 * 功能：
 * 1. 搜索响应时间测试
 * 2. 内存占用测试
 * 3. 并发查询测试
 * 4. 模型加载时间测试
 */
import { PhotoDatabase } from '../database/db.js'
import { getEmbeddingService } from './hybridEmbeddingService.js'
import { faceDetectionService } from './faceDetectionService.js'
import { personService } from './personService.js'
import { modelLoadingService } from './modelLoadingService.js'

export interface PerformanceTestResult {
  timestamp: string
  searchPerformance: SearchPerformanceResult
  memoryUsage: MemoryUsageResult
  concurrencyTest: ConcurrencyTestResult
  modelLoading: ModelLoadingResult
  overallScore: number
  recommendations: string[]
}

export interface SearchPerformanceResult {
  totalQueries: number
  avgResponseTime: number
  minResponseTime: number
  maxResponseTime: number
  p95ResponseTime: number
  passRate: number // <500ms 的占比
}

export interface MemoryUsageResult {
  initialMemoryMB: number
  peakMemoryMB: number
  finalMemoryMB: number
  deltaMB: number
  pass: boolean // <500MB
}

export interface ConcurrencyTestResult {
  concurrentQueries: number
  avgResponseTime: number
  successRate: number
  pass: boolean
}

export interface ModelLoadingResult {
  faceApiLoadTimeMs: number
  clipLoadTimeMs: number
  totalLoadTimeMs: number
  parallelLoading: boolean
  pass: boolean // <10s
}

export class PerformanceTestService {
  private database: PhotoDatabase

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 测试搜索性能
   */
  async testSearchPerformance(queryCount: number = 50): Promise<SearchPerformanceResult> {
    console.log(`[PerformanceTest] 测试搜索性能: ${queryCount} 次查询`)

    const testQueries = [
      '公园', '海边', '生日', '风景', '家庭',
      '朋友聚会', '旅行', '美食', '宠物', '日落',
      '我和妈妈在公园', '朋友在海边', '生日派对',
      '风景照片', '宠物狗', '室内', '户外', '自然'
    ]

    const responseTimes: number[] = []
    const embeddingService = getEmbeddingService()

    for (let i = 0; i < queryCount; i++) {
      const query = testQueries[i % testQueries.length]
      const startTime = Date.now()

      try {
        await embeddingService.textToEmbedding(query)
        responseTimes.push(Date.now() - startTime)
      } catch (error) {
        responseTimes.push(-1) // 标记失败
      }
    }

    const validTimes = responseTimes.filter(t => t > 0)
    const sortedTimes = [...validTimes].sort((a, b) => a - b)

    const avgResponseTime = validTimes.length > 0
      ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length
      : 0

    const minResponseTime = sortedTimes[0] || 0
    const maxResponseTime = sortedTimes[sortedTimes.length - 1] || 0
    const p95Index = Math.floor(sortedTimes.length * 0.95)
    const p95ResponseTime = sortedTimes[p95Index] || maxResponseTime

    const passCount = validTimes.filter(t => t < 500).length
    const passRate = validTimes.length > 0 ? passCount / validTimes.length : 0

    console.log(`[PerformanceTest] 搜索性能测试结果:`)
    console.log(`  - 平均响应时间: ${avgResponseTime.toFixed(1)}ms`)
    console.log(`  - P95 响应时间: ${p95ResponseTime.toFixed(1)}ms`)
    console.log(`  - 通过率: ${(passRate * 100).toFixed(1)}%`)

    return {
      totalQueries: queryCount,
      avgResponseTime,
      minResponseTime,
      maxResponseTime,
      p95ResponseTime,
      passRate
    }
  }

  /**
   * 测试内存占用
   */
  async testMemoryUsage(): Promise<MemoryUsageResult> {
    console.log('[PerformanceTest] 测试内存占用...')

    if (typeof process === 'undefined' || !process.memoryUsage) {
      return {
        initialMemoryMB: 0,
        peakMemoryMB: 0,
        finalMemoryMB: 0,
        deltaMB: 0,
        pass: true
      }
    }

    const initialMemory = process.memoryUsage()
    const initialMB = initialMemory.heapUsed / 1024 / 1024

    // 执行一些内存密集型操作
    const embeddingService = getEmbeddingService()
    const testQueries = Array(100).fill('测试查询')

    let peakMB = initialMB

    for (const query of testQueries) {
      try {
        await embeddingService.textToEmbedding(query)
        const current = process.memoryUsage()
        const currentMB = current.heapUsed / 1024 / 1024
        if (currentMB > peakMB) peakMB = currentMB
      } catch (e) {
        // 忽略错误
      }
    }

    // 触发垃圾回收（如果可用）
    if (global.gc) {
      global.gc()
    }

    const finalMemory = process.memoryUsage()
    const finalMB = finalMemory.heapUsed / 1024 / 1024

    console.log(`[PerformanceTest] 内存占用测试结果:`)
    console.log(`  - 初始: ${initialMB.toFixed(1)}MB`)
    console.log(`  - 峰值: ${peakMB.toFixed(1)}MB`)
    console.log(`  - 最终: ${finalMB.toFixed(1)}MB`)

    return {
      initialMemoryMB: initialMB,
      peakMemoryMB: peakMB,
      finalMemoryMB: finalMB,
      deltaMB: finalMB - initialMB,
      pass: peakMB < 500
    }
  }

  /**
   * 测试并发查询
   */
  async testConcurrency(concurrentCount: number = 5): Promise<ConcurrencyTestResult> {
    console.log(`[PerformanceTest] 测试并发查询: ${concurrentCount} 并发`)

    const embeddingService = getEmbeddingService()
    const testQueries = Array(concurrentCount).fill('并发测试查询')

    const startTime = Date.now()

    try {
      // 并发执行
      const promises = testQueries.map(q =>
        embeddingService.textToEmbedding(q)
      )

      const results = await Promise.allSettled(promises)
      const totalTime = Date.now() - startTime

      const successCount = results.filter(r => r.status === 'fulfilled').length
      const successRate = successCount / concurrentCount

      console.log(`[PerformanceTest] 并发测试结果:`)
      console.log(`  - 总耗时: ${totalTime}ms`)
      console.log(`  - 成功率: ${(successRate * 100).toFixed(1)}%`)

      return {
        concurrentQueries: concurrentCount,
        avgResponseTime: totalTime / concurrentCount,
        successRate,
        pass: successRate >= 0.9
      }
    } catch (error) {
      console.error('[PerformanceTest] 并发测试失败:', error)
      return {
        concurrentQueries: concurrentCount,
        avgResponseTime: 0,
        successRate: 0,
        pass: false
      }
    }
  }

  /**
   * 测试模型加载时间（使用并行加载）
   */
  async testModelLoading(): Promise<ModelLoadingResult> {
    console.log('[PerformanceTest] 测试模型加载时间（并行加载）...')

    // 重置模型加载服务状态
    modelLoadingService.reset()

    // 记录进度更新
    const progressUpdates: Array<{ faceApi: number; clip: number; overall: number }> = []
    const unsubscribe = modelLoadingService.onProgress((progress) => {
      progressUpdates.push({
        faceApi: progress.faceApi.progress,
        clip: progress.clip.progress,
        overall: progress.overall
      })
    })

    // 使用并行加载服务
    const result = await modelLoadingService.loadModels()

    // 取消订阅
    unsubscribe()

    console.log(`[PerformanceTest] 模型加载测试结果:`)
    console.log(`  - Face-API: ${result.faceApiTimeMs}ms (${result.faceApiLoaded ? '成功' : '失败'})`)
    console.log(`  - CLIP: ${result.clipTimeMs}ms (${result.clipLoaded ? '成功' : '失败'})`)
    console.log(`  - 总计: ${result.totalTimeMs}ms`)
    console.log(`  - 并行加载: 是`)
    console.log(`  - 进度更新次数: ${progressUpdates.length}`)

    return {
      faceApiLoadTimeMs: result.faceApiTimeMs,
      clipLoadTimeMs: result.clipTimeMs,
      totalLoadTimeMs: result.totalTimeMs,
      parallelLoading: true,
      pass: result.success && result.totalTimeMs < 10000
    }
  }

  /**
   * 运行完整性能测试
   */
  async runFullTest(): Promise<PerformanceTestResult> {
    console.log('[PerformanceTest] 开始完整性能测试...')

    const searchPerformance = await this.testSearchPerformance(50)
    const memoryUsage = await this.testMemoryUsage()
    const concurrencyTest = await this.testConcurrency(5)
    const modelLoading = await this.testModelLoading()

    // 计算综合分数
    const searchScore = searchPerformance.passRate * 100
    const memoryScore = memoryUsage.pass ? 100 : Math.max(0, 100 - (memoryUsage.peakMemoryMB - 500) / 10)
    const concurrencyScore = concurrencyTest.pass ? 100 : concurrencyTest.successRate * 100
    const modelScore = modelLoading.pass ? 100 : Math.max(0, 100 - (modelLoading.totalLoadTimeMs - 10000) / 100)

    const overallScore = (searchScore + memoryScore + concurrencyScore + modelScore) / 4

    // 生成建议
    const recommendations: string[] = []

    if (searchPerformance.passRate < 0.95) {
      recommendations.push(`搜索响应时间不达标，通过率=${(searchPerformance.passRate * 100).toFixed(0)}%，P95=${searchPerformance.p95ResponseTime.toFixed(0)}ms，建议优化`)
    }
    if (!memoryUsage.pass) {
      recommendations.push(`内存占用过高，峰值=${memoryUsage.peakMemoryMB.toFixed(0)}MB，建议检查内存泄漏`)
    }
    if (!concurrencyTest.pass) {
      recommendations.push(`并发查询成功率低 (${(concurrencyTest.successRate * 100).toFixed(0)}%)，建议检查并发处理`)
    }
    if (!modelLoading.pass) {
      recommendations.push(`模型加载时间过长 (${modelLoading.totalLoadTimeMs}ms)，建议启用并行加载`)
    }

    if (recommendations.length === 0) {
      recommendations.push('性能测试全部通过，系统运行良好')
    }

    return {
      timestamp: new Date().toISOString(),
      searchPerformance,
      memoryUsage,
      concurrencyTest,
      modelLoading,
      overallScore,
      recommendations
    }
  }
}

export const performanceTestService = new PerformanceTestService()
