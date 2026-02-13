import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("photoAPI", {
  // iCloud 相关
  iCloud: {
    selectLibrary: () => ipcRenderer.invoke("icloud:select-library")
  },
  // 照片相关
  photos: {
    getList: (options) => ipcRenderer.invoke("photos:get-list", options),
    getCount: () => ipcRenderer.invoke("photos:get-count"),
    getDetail: (photoId) => ipcRenderer.invoke("photos:get-detail", photoId),
    getWithoutEmbeddings: (limit) => ipcRenderer.invoke("photos:get-without-embeddings", limit),
    saveEmbedding: (photoUuid, vector) => ipcRenderer.invoke("photos:save-embedding", photoUuid, vector),
    search: (query, filters) => ipcRenderer.invoke("photos:search", query, filters),
    delete: (photoId) => ipcRenderer.invoke("photos:delete", photoId),
    export: (params) => ipcRenderer.invoke("photos:export", params)
  },
  // 人物相关
  people: {
    getAll: () => ipcRenderer.invoke("people:get-all"),
    add: (person) => ipcRenderer.invoke("people:add", person),
    update: (id, person) => ipcRenderer.invoke("people:update", id, person),
    delete: (id) => ipcRenderer.invoke("people:delete", id),
    // 人物搜索
    search: (options) => ipcRenderer.invoke("people:search", options),
    getPhotos: (filter) => ipcRenderer.invoke("people:get-photos", filter),
    getTimeline: (personId) => ipcRenderer.invoke("people:get-timeline", personId),
    getSuggestions: (query, limit) => ipcRenderer.invoke("people:get-suggestions", query, limit),
    getPopular: (limit) => ipcRenderer.invoke("people:get-popular", limit),
    getSearchStats: () => ipcRenderer.invoke("people:get-search-stats"),
    getSearchHistory: () => ipcRenderer.invoke("people:get-search-history"),
    addSearchHistory: (query) => ipcRenderer.invoke("people:add-search-history", query),
    clearSearchHistory: () => ipcRenderer.invoke("people:clear-search-history")
  },
  // 地点相关
  places: {
    getAll: () => ipcRenderer.invoke("places:get-all")
  },
  // 相册相关
  albums: {
    getSmart: () => ipcRenderer.invoke("albums:get-smart"),
    refresh: () => ipcRenderer.invoke("albums:refresh")
  },
  // 时间线相关
  timeline: {
    get: (year) => ipcRenderer.invoke("timeline:get", year)
  },
  // 同步相关
  sync: {
    start: () => ipcRenderer.invoke("sync:start"),
    getProgress: () => ipcRenderer.invoke("sync:get-progress")
  },
  // 本地照片导入相关
  local: {
    selectFolder: () => ipcRenderer.invoke("local:select-folder"),
    importFolder: (folderPath) => ipcRenderer.invoke("local:import-folder", folderPath),
    importPhoto: (filePath) => ipcRenderer.invoke("local:import-photo", filePath),
    getCount: () => ipcRenderer.invoke("local:get-count"),
    // 监听导入进度
    onProgress: (callback) => {
      const listener = (_, progress) => callback(progress);
      ipcRenderer.on("local:import-progress", listener);
      return () => ipcRenderer.off("local:import-progress", listener);
    }
  },
  // 配置相关
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    setApiKey: (apiKey) => ipcRenderer.invoke("config:set-api-key", apiKey),
    getLlmStatus: () => ipcRenderer.invoke("config:get-llm-status"),
    setTheme: (theme) => ipcRenderer.invoke("config:set-theme", theme)
  },
  // 搜索建议相关
  suggestions: {
    get: (query) => ipcRenderer.invoke("suggestions:get", query),
    addHistory: (query, resultCount) => ipcRenderer.invoke("suggestions:add-history", query, resultCount),
    getHistory: () => ipcRenderer.invoke("suggestions:get-history"),
    clearHistory: () => ipcRenderer.invoke("suggestions:clear-history"),
    getPopular: () => ipcRenderer.invoke("suggestions:get-popular")
  },
  // 人脸检测相关
  face: {
    loadModels: () => ipcRenderer.invoke("face:load-models"),
    getStatus: () => ipcRenderer.invoke("face:get-status"),
    detect: (imagePath) => ipcRenderer.invoke("face:detect", imagePath),
    detectBatch: (imagePaths) => ipcRenderer.invoke("face:detect-batch", imagePaths),
    cancel: () => ipcRenderer.invoke("face:cancel"),
    scanAll: () => ipcRenderer.invoke("face:scan-all"),
    // 🆕 重置人脸扫描状态（删除 detected_faces 记录，允许重新扫描）
    resetScanStatus: () => ipcRenderer.invoke("face:reset-scan-status"),
    // 🚨 队列状态诊断
    getQueueStatus: () => ipcRenderer.invoke("face:get-queue-status"),
    resetQueue: () => ipcRenderer.invoke("face:reset-queue"),
    // 🆕 获取未命名的人脸（未聚类）
    getUnnamedFaces: (limit) => ipcRenderer.invoke("face:get-unnamed-faces", limit),
    // 进度事件
    onProgress: (callback) => {
      const listener = (_, progress) => callback(progress);
      ipcRenderer.on("face:progress", listener);
      return () => ipcRenderer.off("face:progress", listener);
    },
    // 状态事件
    onStatus: (callback) => {
      const listener = (_, status) => callback(status);
      ipcRenderer.on("face:status", listener);
      return () => ipcRenderer.off("face:status", listener);
    },
    // 扫描完成事件
    onScanComplete: (callback) => {
      const listener = (_, result) => callback(result);
      ipcRenderer.on("face:scan-complete", listener);
      return () => ipcRenderer.off("face:scan-complete", listener);
    },
    // 🆕 人物列表更新事件（聚类完成后触发）
    onPeopleUpdated: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("people:updated", listener);
      return () => ipcRenderer.off("people:updated", listener);
    }
  },
  // 🚨 诊断工具（开发调试使用）
  diagnostic: {
    // 获取数据库完整状态（CTO诊断）
    getDbStats: () => ipcRenderer.invoke("diagnostic:get-db-stats"),
    // 获取人脸检测统计
    getFaceStats: () => ipcRenderer.invoke("diagnostic:face-stats"),
    // 清理所有人脸数据（用于重置）
    clearFaceData: () => ipcRenderer.invoke("diagnostic:clear-face-data"),
    // 重置人物关联（用于重新聚类）
    resetPersonLinks: () => ipcRenderer.invoke("diagnostic:reset-person-links"),
    // 执行原始SQL查询（仅限SELECT）
    query: (sql) => ipcRenderer.invoke("diagnostic:query", sql)
  },
  // 人脸匹配相关
  faceMatching: {
    autoMatch: () => ipcRenderer.invoke("face:auto-match"),
    findSimilar: (faceId) => ipcRenderer.invoke("face:find-similar", faceId),
    createPerson: (cluster, personName) => ipcRenderer.invoke("face:create-person", cluster, personName),
    assign: (faceIds, personId) => ipcRenderer.invoke("face:assign", faceIds, personId),
    unmatch: (faceId) => ipcRenderer.invoke("face:unmatch", faceId),
    getStats: () => ipcRenderer.invoke("face:get-matching-stats"),
    // 向量重新生成
    regenerateStart: (options) => ipcRenderer.invoke("face:regenerate-start", options),
    regeneratePause: () => ipcRenderer.invoke("face:regenerate-pause"),
    regenerateGetProgress: () => ipcRenderer.invoke("face:regenerate-progress"),
    regenerateReset: () => ipcRenderer.invoke("face:regenerate-reset"),
    regenerateRecluster: () => ipcRenderer.invoke("face:regenerate-recluster"),
    cleanupPersons: () => ipcRenderer.invoke("face:cleanup-persons"),
    // 监听重新生成进度
    onRegenerateProgress: (callback) => {
      const listener = (_, progress) => callback(progress);
      ipcRenderer.on("face:regenerate-progress", listener);
      return () => ipcRenderer.off("face:regenerate-progress", listener);
    },
    // 合并人物
    mergePersons: (sourcePersonId, targetPersonId) => ipcRenderer.invoke("face:merge-persons", sourcePersonId, targetPersonId)
  },
  // 质量验证相关
  quality: {
    validateClustering: () => ipcRenderer.invoke("quality:validate-clustering"),
    testSemantic: (query) => ipcRenderer.invoke("quality:test-semantic", query),
    runTests: () => ipcRenderer.invoke("quality:run-tests"),
    generateReport: () => ipcRenderer.invoke("quality:generate-report"),
    checkVectors: () => ipcRenderer.invoke("quality:check-vectors")
  },
  // 性能测试相关
  perf: {
    testSearch: (queryCount) => ipcRenderer.invoke("perf:test-search", queryCount),
    testMemory: () => ipcRenderer.invoke("perf:test-memory"),
    testConcurrency: (concurrentCount) => ipcRenderer.invoke("perf:test-concurrency", concurrentCount),
    testModels: () => ipcRenderer.invoke("perf:test-models"),
    runFull: () => ipcRenderer.invoke("perf:run-full")
  },
  // 系统相关
  app: {
    getVersion: () => ipcRenderer.invoke("app:get-version")
  },
  // 窗口控制
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close")
  },
  // 嵌入服务相关
  embedding: {
    // 初始化 CLIP 模型
    initialize: () => ipcRenderer.invoke("embedding:initialize"),
    // 获取模型状态
    getStatus: () => ipcRenderer.invoke("embedding:get-status"),
    // 文本转向量
    textToEmbedding: (text) => ipcRenderer.invoke("embedding:text-to-vector", text),
    // 图片转向量
    imageToEmbedding: (imagePath) => ipcRenderer.invoke("embedding:image-to-vector", imagePath),
    // 生成所有照片的嵌入向量
    generateAll: () => ipcRenderer.invoke("embedding:generate-all"),
    // 生成单张照片的向量
    generateOne: (photoUuid) => ipcRenderer.invoke("embedding:generate-one", photoUuid),
    // 取消生成
    cancel: () => ipcRenderer.invoke("embedding:cancel"),
    // 获取生成状态
    getGenStatus: () => ipcRenderer.invoke("embedding:get-generation-status"),
    // 监听嵌入生成进度
    onProgress: (callback) => {
      const listener = (_, progress) => callback(progress);
      ipcRenderer.on("embedding:progress", listener);
      return () => ipcRenderer.off("embedding:progress", listener);
    }
  },
  // 搜索相关
  search: {
    // 预处理搜索文本
    preprocess: (text) => ipcRenderer.invoke("search:preprocess", text),
    // 文本转向量
    textToVector: (text) => ipcRenderer.invoke("search:text-to-vector", text),
    // 语义搜索
    semantic: (options) => ipcRenderer.invoke("search:semantic", options),
    // 快速搜索
    quick: (query, topK) => ipcRenderer.invoke("search:quick", query, topK),
    // 多查询搜索
    multi: (queries, options) => ipcRenderer.invoke("search:multi", queries, options),
    // 清除缓存
    clearCache: () => ipcRenderer.invoke("search:clear-cache"),
    // 获取缓存状态
    getCacheStats: () => ipcRenderer.invoke("search:get-cache-stats")
  },
  // 查询解析相关
  query: {
    // 解析用户查询
    parse: (query) => ipcRenderer.invoke("query:parse", query),
    // 清除缓存
    clearCache: () => ipcRenderer.invoke("query:clear-cache"),
    // 获取缓存统计
    getCacheStats: () => ipcRenderer.invoke("query:get-cache-stats")
  },
  // 关键词搜索相关
  keywordSearch: {
    // 关键词搜索
    search: (options) => ipcRenderer.invoke("search:keyword", options),
    // 快速搜索
    quick: (query, limit) => ipcRenderer.invoke("search:keyword-quick", query, limit),
    // 获取建议
    suggestions: (query, limit) => ipcRenderer.invoke("search:suggestions", query, limit)
  },
  // 全局向量搜索相关
  globalSearch: {
    // 全局向量搜索
    search: (options) => ipcRenderer.invoke("search:global", options),
    // 快速搜索
    quick: (query, topK) => ipcRenderer.invoke("search:global-quick", query, topK),
    // 相似照片
    similar: (photoUuid, topK) => ipcRenderer.invoke("search:similar", photoUuid, topK),
    // 批量搜索
    batch: (queries, options) => ipcRenderer.invoke("search:batch", queries, options)
  },
  // 混合搜索相关
  hybridSearch: {
    // 混合搜索
    search: (options) => ipcRenderer.invoke("search:hybrid", options),
    // 带意图的混合搜索
    searchWithIntent: (query) => ipcRenderer.invoke("search:hybrid-intent", query),
    // 重新排序
    reorder: (results, sortBy) => ipcRenderer.invoke("search:reorder", results, sortBy)
  },
  // 导入相关（新的统一导入服务）
  import: {
    scanFolder: (folderPath) => ipcRenderer.invoke("import:scan-folder", folderPath),
    start: (folderPath, options) => ipcRenderer.invoke("import:start", folderPath, options),
    cancel: () => ipcRenderer.invoke("import:cancel"),
    getProgress: () => ipcRenderer.invoke("import:get-progress"),
    // 监听导入进度
    onProgress: (callback) => {
      const listener = (_, progress) => callback(progress);
      ipcRenderer.on("import:progress", listener);
      return () => ipcRenderer.off("import:progress", listener);
    }
  },
  // 扫描任务相关（持久化、断点续传）
  scanJob: {
    getActive: () => ipcRenderer.invoke("scan-job:get-active"),
    resume: (jobId) => ipcRenderer.invoke("scan-job:resume", jobId),
    getStats: () => ipcRenderer.invoke("scan-job:get-stats"),
    getAll: (limit) => ipcRenderer.invoke("scan-job:get-all", limit)
  }
});
ipcRenderer.on("sync:progress", (event, data) => {
  console.log("同步进度:", data);
});
console.log("[Preload] API 已注册完成");
