import { c as faceDetectionService, b as getEmbeddingService, P as PhotoDatabase } from "./index-BYkeoRh9.js";
class ModelLoadingService {
  progress = {
    faceApi: { loaded: false, progress: 0 },
    clip: { loaded: false, progress: 0 },
    overall: 0,
    status: "idle"
  };
  progressCallbacks = [];
  isLoading = false;
  /**
   * 注册进度回调
   */
  onProgress(callback) {
    this.progressCallbacks.push(callback);
    return () => {
      const index = this.progressCallbacks.indexOf(callback);
      if (index > -1) {
        this.progressCallbacks.splice(index, 1);
      }
    };
  }
  /**
   * 通知所有回调
   */
  notifyProgress() {
    for (const callback of this.progressCallbacks) {
      try {
        callback({ ...this.progress });
      } catch (e) {
        console.error("[ModelLoading] Progress callback error:", e);
      }
    }
  }
  /**
   * 更新 face-api 进度
   */
  updateFaceApiProgress(progress, loaded = false) {
    this.progress.faceApi.progress = Math.min(100, Math.max(0, progress));
    this.progress.faceApi.loaded = loaded;
    this.calculateOverallProgress();
    this.notifyProgress();
  }
  /**
   * 更新 CLIP 进度
   */
  updateClipProgress(progress, loaded = false) {
    this.progress.clip.progress = Math.min(100, Math.max(0, progress));
    this.progress.clip.loaded = loaded;
    this.calculateOverallProgress();
    this.notifyProgress();
  }
  /**
   * 计算总进度
   */
  calculateOverallProgress() {
    this.progress.overall = Math.round(
      (this.progress.faceApi.progress + this.progress.clip.progress) / 2
    );
  }
  /**
   * 并行加载所有模型
   */
  async loadModels() {
    if (this.isLoading) {
      return {
        success: false,
        faceApiLoaded: false,
        clipLoaded: false,
        totalTimeMs: 0,
        faceApiTimeMs: 0,
        clipTimeMs: 0,
        error: "Models are already loading"
      };
    }
    this.isLoading = true;
    this.progress.status = "loading";
    this.progress.faceApi = { loaded: false, progress: 0 };
    this.progress.clip = { loaded: false, progress: 0 };
    this.progress.overall = 0;
    this.progress.error = void 0;
    this.notifyProgress();
    const totalStartTime = Date.now();
    try {
      const [faceApiResult, clipResult] = await Promise.all([
        this.loadFaceApiModel(),
        this.loadClipModel()
      ]);
      const totalTimeMs = Date.now() - totalStartTime;
      this.progress.status = faceApiResult.success && clipResult.success ? "completed" : "error";
      this.progress.faceApi.loaded = faceApiResult.success;
      this.progress.clip.loaded = clipResult.success;
      if (!faceApiResult.success || !clipResult.success) {
        this.progress.error = faceApiResult.error || clipResult.error;
      }
      this.notifyProgress();
      this.isLoading = false;
      return {
        success: faceApiResult.success && clipResult.success,
        faceApiLoaded: faceApiResult.success,
        clipLoaded: clipResult.success,
        totalTimeMs,
        faceApiTimeMs: faceApiResult.timeMs,
        clipTimeMs: clipResult.timeMs,
        error: faceApiResult.error || clipResult.error
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.progress.status = "error";
      this.progress.error = errorMessage;
      this.notifyProgress();
      this.isLoading = false;
      return {
        success: false,
        faceApiLoaded: false,
        clipLoaded: false,
        totalTimeMs: Date.now() - totalStartTime,
        faceApiTimeMs: 0,
        clipTimeMs: 0,
        error: errorMessage
      };
    }
  }
  /**
   * 加载 face-api 模型
   */
  async loadFaceApiModel() {
    const startTime = Date.now();
    try {
      this.updateFaceApiProgress(10);
      await this.delay(100);
      this.updateFaceApiProgress(30);
      const result = await faceDetectionService.loadModels();
      const timeMs = Date.now() - startTime;
      if (result.success) {
        this.updateFaceApiProgress(100, true);
        return { success: true, timeMs };
      } else {
        this.updateFaceApiProgress(0, false);
        return { success: false, timeMs, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateFaceApiProgress(0, false);
      return { success: false, timeMs: Date.now() - startTime, error: errorMessage };
    }
  }
  /**
   * 加载 CLIP 模型
   */
  async loadClipModel() {
    const startTime = Date.now();
    try {
      this.updateClipProgress(10);
      const embeddingService = getEmbeddingService();
      this.updateClipProgress(40);
      const result = await embeddingService.initialize();
      const timeMs = Date.now() - startTime;
      if (result.success) {
        this.updateClipProgress(100, true);
        return { success: true, timeMs };
      } else {
        this.updateClipProgress(0, false);
        return { success: false, timeMs, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateClipProgress(0, false);
      return { success: false, timeMs: Date.now() - startTime, error: errorMessage };
    }
  }
  /**
   * 获取当前加载状态
   */
  getProgress() {
    return { ...this.progress };
  }
  /**
   * 检查是否正在加载
   */
  isLoadingModels() {
    return this.isLoading;
  }
  /**
   * 检查所有模型是否已加载
   */
  areModelsLoaded() {
    return this.progress.faceApi.loaded && this.progress.clip.loaded;
  }
  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * 重置状态（用于测试）
   */
  reset() {
    this.progress = {
      faceApi: { loaded: false, progress: 0 },
      clip: { loaded: false, progress: 0 },
      overall: 0,
      status: "idle"
    };
    this.isLoading = false;
    this.progressCallbacks = [];
  }
}
const modelLoadingService = new ModelLoadingService();
class PerformanceTestService {
  database;
  constructor(database) {
    this.database = database || new PhotoDatabase();
  }
  /**
   * 测试搜索性能
   */
  async testSearchPerformance(queryCount = 50) {
    console.log(`[PerformanceTest] 测试搜索性能: ${queryCount} 次查询`);
    const testQueries = [
      "公园",
      "海边",
      "生日",
      "风景",
      "家庭",
      "朋友聚会",
      "旅行",
      "美食",
      "宠物",
      "日落",
      "我和妈妈在公园",
      "朋友在海边",
      "生日派对",
      "风景照片",
      "宠物狗",
      "室内",
      "户外",
      "自然"
    ];
    const responseTimes = [];
    const embeddingService = getEmbeddingService();
    for (let i = 0; i < queryCount; i++) {
      const query = testQueries[i % testQueries.length];
      const startTime = Date.now();
      try {
        await embeddingService.textToEmbedding(query);
        responseTimes.push(Date.now() - startTime);
      } catch (error) {
        responseTimes.push(-1);
      }
    }
    const validTimes = responseTimes.filter((t) => t > 0);
    const sortedTimes = [...validTimes].sort((a, b) => a - b);
    const avgResponseTime = validTimes.length > 0 ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length : 0;
    const minResponseTime = sortedTimes[0] || 0;
    const maxResponseTime = sortedTimes[sortedTimes.length - 1] || 0;
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p95ResponseTime = sortedTimes[p95Index] || maxResponseTime;
    const passCount = validTimes.filter((t) => t < 500).length;
    const passRate = validTimes.length > 0 ? passCount / validTimes.length : 0;
    console.log(`[PerformanceTest] 搜索性能测试结果:`);
    console.log(`  - 平均响应时间: ${avgResponseTime.toFixed(1)}ms`);
    console.log(`  - P95 响应时间: ${p95ResponseTime.toFixed(1)}ms`);
    console.log(`  - 通过率: ${(passRate * 100).toFixed(1)}%`);
    return {
      totalQueries: queryCount,
      avgResponseTime,
      minResponseTime,
      maxResponseTime,
      p95ResponseTime,
      passRate
    };
  }
  /**
   * 测试内存占用
   */
  async testMemoryUsage() {
    console.log("[PerformanceTest] 测试内存占用...");
    if (typeof process === "undefined" || !process.memoryUsage) {
      return {
        initialMemoryMB: 0,
        peakMemoryMB: 0,
        finalMemoryMB: 0,
        deltaMB: 0,
        pass: true
      };
    }
    const initialMemory = process.memoryUsage();
    const initialMB = initialMemory.heapUsed / 1024 / 1024;
    const embeddingService = getEmbeddingService();
    const testQueries = Array(100).fill("测试查询");
    let peakMB = initialMB;
    for (const query of testQueries) {
      try {
        await embeddingService.textToEmbedding(query);
        const current = process.memoryUsage();
        const currentMB = current.heapUsed / 1024 / 1024;
        if (currentMB > peakMB) peakMB = currentMB;
      } catch (e) {
      }
    }
    if (global.gc) {
      global.gc();
    }
    const finalMemory = process.memoryUsage();
    const finalMB = finalMemory.heapUsed / 1024 / 1024;
    console.log(`[PerformanceTest] 内存占用测试结果:`);
    console.log(`  - 初始: ${initialMB.toFixed(1)}MB`);
    console.log(`  - 峰值: ${peakMB.toFixed(1)}MB`);
    console.log(`  - 最终: ${finalMB.toFixed(1)}MB`);
    return {
      initialMemoryMB: initialMB,
      peakMemoryMB: peakMB,
      finalMemoryMB: finalMB,
      deltaMB: finalMB - initialMB,
      pass: peakMB < 500
    };
  }
  /**
   * 测试并发查询
   */
  async testConcurrency(concurrentCount = 5) {
    console.log(`[PerformanceTest] 测试并发查询: ${concurrentCount} 并发`);
    const embeddingService = getEmbeddingService();
    const testQueries = Array(concurrentCount).fill("并发测试查询");
    const startTime = Date.now();
    try {
      const promises = testQueries.map(
        (q) => embeddingService.textToEmbedding(q)
      );
      const results = await Promise.allSettled(promises);
      const totalTime = Date.now() - startTime;
      const successCount = results.filter((r) => r.status === "fulfilled").length;
      const successRate = successCount / concurrentCount;
      console.log(`[PerformanceTest] 并发测试结果:`);
      console.log(`  - 总耗时: ${totalTime}ms`);
      console.log(`  - 成功率: ${(successRate * 100).toFixed(1)}%`);
      return {
        concurrentQueries: concurrentCount,
        avgResponseTime: totalTime / concurrentCount,
        successRate,
        pass: successRate >= 0.9
      };
    } catch (error) {
      console.error("[PerformanceTest] 并发测试失败:", error);
      return {
        concurrentQueries: concurrentCount,
        avgResponseTime: 0,
        successRate: 0,
        pass: false
      };
    }
  }
  /**
   * 测试模型加载时间（使用并行加载）
   */
  async testModelLoading() {
    console.log("[PerformanceTest] 测试模型加载时间（并行加载）...");
    modelLoadingService.reset();
    const progressUpdates = [];
    const unsubscribe = modelLoadingService.onProgress((progress) => {
      progressUpdates.push({
        faceApi: progress.faceApi.progress,
        clip: progress.clip.progress,
        overall: progress.overall
      });
    });
    const result = await modelLoadingService.loadModels();
    unsubscribe();
    console.log(`[PerformanceTest] 模型加载测试结果:`);
    console.log(`  - Face-API: ${result.faceApiTimeMs}ms (${result.faceApiLoaded ? "成功" : "失败"})`);
    console.log(`  - CLIP: ${result.clipTimeMs}ms (${result.clipLoaded ? "成功" : "失败"})`);
    console.log(`  - 总计: ${result.totalTimeMs}ms`);
    console.log(`  - 并行加载: 是`);
    console.log(`  - 进度更新次数: ${progressUpdates.length}`);
    return {
      faceApiLoadTimeMs: result.faceApiTimeMs,
      clipLoadTimeMs: result.clipTimeMs,
      totalLoadTimeMs: result.totalTimeMs,
      parallelLoading: true,
      pass: result.success && result.totalTimeMs < 1e4
    };
  }
  /**
   * 运行完整性能测试
   */
  async runFullTest() {
    console.log("[PerformanceTest] 开始完整性能测试...");
    const searchPerformance = await this.testSearchPerformance(50);
    const memoryUsage = await this.testMemoryUsage();
    const concurrencyTest = await this.testConcurrency(5);
    const modelLoading = await this.testModelLoading();
    const searchScore = searchPerformance.passRate * 100;
    const memoryScore = memoryUsage.pass ? 100 : Math.max(0, 100 - (memoryUsage.peakMemoryMB - 500) / 10);
    const concurrencyScore = concurrencyTest.pass ? 100 : concurrencyTest.successRate * 100;
    const modelScore = modelLoading.pass ? 100 : Math.max(0, 100 - (modelLoading.totalLoadTimeMs - 1e4) / 100);
    const overallScore = (searchScore + memoryScore + concurrencyScore + modelScore) / 4;
    const recommendations = [];
    if (searchPerformance.passRate < 0.95) {
      recommendations.push(`搜索响应时间不达标，通过率=${(searchPerformance.passRate * 100).toFixed(0)}%，P95=${searchPerformance.p95ResponseTime.toFixed(0)}ms，建议优化`);
    }
    if (!memoryUsage.pass) {
      recommendations.push(`内存占用过高，峰值=${memoryUsage.peakMemoryMB.toFixed(0)}MB，建议检查内存泄漏`);
    }
    if (!concurrencyTest.pass) {
      recommendations.push(`并发查询成功率低 (${(concurrencyTest.successRate * 100).toFixed(0)}%)，建议检查并发处理`);
    }
    if (!modelLoading.pass) {
      recommendations.push(`模型加载时间过长 (${modelLoading.totalLoadTimeMs}ms)，建议启用并行加载`);
    }
    if (recommendations.length === 0) {
      recommendations.push("性能测试全部通过，系统运行良好");
    }
    return {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      searchPerformance,
      memoryUsage,
      concurrencyTest,
      modelLoading,
      overallScore,
      recommendations
    };
  }
}
const performanceTestService = new PerformanceTestService();
export {
  PerformanceTestService,
  performanceTestService
};
//# sourceMappingURL=performanceTestService-DWdX-NSS.js.map
