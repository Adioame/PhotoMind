/**
 * PhotoMind - 预加载脚本
 */
// 使用 CommonJS 格式，因为 Electron preload 需要
const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld('photoAPI', {
  // iCloud 相关
  iCloud: {
    selectLibrary: () => ipcRenderer.invoke('icloud:select-library'),
  },

  // 照片相关
  photos: {
    getList: (options?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('photos:get-list', options),
    getCount: () =>
      ipcRenderer.invoke('photos:get-count'),
    getDetail: (photoId: string) =>
      ipcRenderer.invoke('photos:get-detail', photoId),
    getWithoutEmbeddings: (limit?: number) =>
      ipcRenderer.invoke('photos:get-without-embeddings', limit),
    saveEmbedding: (photoUuid: string, vector: number[]) =>
      ipcRenderer.invoke('photos:save-embedding', photoUuid, vector),
    search: (query: string, filters?: any) =>
      ipcRenderer.invoke('photos:search', query, filters),
    delete: (photoId: number) =>
      ipcRenderer.invoke('photos:delete', photoId),
    export: (params: { photoId: number; filePath: string; exportPath: string }) =>
      ipcRenderer.invoke('photos:export', params),
  },

  // 人物相关
  people: {
    getAll: () => ipcRenderer.invoke('people:get-all'),
    add: (person: { name: string; displayName?: string }) =>
      ipcRenderer.invoke('people:add', person),
    update: (id: number, person: { name?: string; displayName?: string }) =>
      ipcRenderer.invoke('people:update', id, person),
    delete: (id: number) =>
      ipcRenderer.invoke('people:delete', id),
    // 人物搜索
    search: (options: { query: string; limit?: number; offset?: number; sortBy?: 'count' | 'recent' | 'oldest' }) =>
      ipcRenderer.invoke('people:search', options),
    getPhotos: (filter: { personId: number; year?: number; month?: number; limit?: number; offset?: number }) =>
      ipcRenderer.invoke('people:get-photos', filter),
    getTimeline: (personId: number) =>
      ipcRenderer.invoke('people:get-timeline', personId),
    getSuggestions: (query: string, limit?: number) =>
      ipcRenderer.invoke('people:get-suggestions', query, limit),
    getPopular: (limit?: number) =>
      ipcRenderer.invoke('people:get-popular', limit),
    getSearchStats: () =>
      ipcRenderer.invoke('people:get-search-stats'),
    getSearchHistory: () =>
      ipcRenderer.invoke('people:get-search-history'),
    addSearchHistory: (query: string) =>
      ipcRenderer.invoke('people:add-search-history', query),
    clearSearchHistory: () =>
      ipcRenderer.invoke('people:clear-search-history'),
  },

  // 地点相关
  places: {
    getAll: () => ipcRenderer.invoke('places:get-all'),
  },

  // 相册相关
  albums: {
    getSmart: () => ipcRenderer.invoke('albums:get-smart'),
    refresh: () => ipcRenderer.invoke('albums:refresh'),
  },

  // 时间线相关
  timeline: {
    get: (year: number) => ipcRenderer.invoke('timeline:get', year),
  },

  // 同步相关
  sync: {
    start: () => ipcRenderer.invoke('sync:start'),
    getProgress: () => ipcRenderer.invoke('sync:get-progress'),
  },

  // 本地照片导入相关
  local: {
    selectFolder: () => ipcRenderer.invoke('local:select-folder'),
    importFolder: (folderPath: string) => ipcRenderer.invoke('local:import-folder', folderPath),
    importPhoto: (filePath: string) => ipcRenderer.invoke('local:import-photo', filePath),
    getCount: () => ipcRenderer.invoke('local:get-count'),
    // 监听导入进度
    onProgress: (callback: (progress: any) => void) => {
      const listener = (_: any, progress: any) => callback(progress)
      ipcRenderer.on('local:import-progress', listener)
      return () => ipcRenderer.off('local:import-progress', listener)
    },
  },

  // 配置相关
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    setApiKey: (apiKey: string) => ipcRenderer.invoke('config:set-api-key', apiKey),
    getLlmStatus: () => ipcRenderer.invoke('config:get-llm-status'),
    setTheme: (theme: string) => ipcRenderer.invoke('config:set-theme', theme),
  },

  // 搜索建议相关
  suggestions: {
    get: (query: string) => ipcRenderer.invoke('suggestions:get', query),
    addHistory: (query: string, resultCount: number) =>
      ipcRenderer.invoke('suggestions:add-history', query, resultCount),
    getHistory: () => ipcRenderer.invoke('suggestions:get-history'),
    clearHistory: () => ipcRenderer.invoke('suggestions:clear-history'),
    getPopular: () => ipcRenderer.invoke('suggestions:get-popular'),
  },

  // 人脸检测相关
  face: {
    loadModels: () => ipcRenderer.invoke('face:load-models'),
    getStatus: () => ipcRenderer.invoke('face:get-status'),
    detect: (imagePath: string) => ipcRenderer.invoke('face:detect', imagePath),
    detectBatch: (imagePaths: string[]) => ipcRenderer.invoke('face:detect-batch', imagePaths),
    cancel: () => ipcRenderer.invoke('face:cancel'),
    scanAll: () => ipcRenderer.invoke('face:scan-all'),
    // 🚨 队列状态诊断
    getQueueStatus: () => ipcRenderer.invoke('face:get-queue-status'),
    resetQueue: () => ipcRenderer.invoke('face:reset-queue'),
    // 🆕 获取未命名的人脸（未聚类）
    getUnnamedFaces: (limit?: number) => ipcRenderer.invoke('face:get-unnamed-faces', limit),
    // 进度事件
    onProgress: (callback: (progress: any) => void) => {
      const listener = (_: any, progress: any) => callback(progress)
      ipcRenderer.on('face:progress', listener)
      return () => ipcRenderer.off('face:progress', listener)
    },
    // 状态事件
    onStatus: (callback: (status: any) => void) => {
      const listener = (_: any, status: any) => callback(status)
      ipcRenderer.on('face:status', listener)
      return () => ipcRenderer.off('face:status', listener)
    },
    // 扫描完成事件
    onScanComplete: (callback: (result: { total: number; completed: number; failed: number; detectedFaces: number }) => void) => {
      const listener = (_: any, result: any) => callback(result)
      ipcRenderer.on('face:scan-complete', listener)
      return () => ipcRenderer.off('face:scan-complete', listener)
    },
  },

  // 🚨 诊断工具（开发调试使用）
  diagnostic: {
    // 获取人脸检测统计
    getFaceStats: () => ipcRenderer.invoke('diagnostic:face-stats'),
    // 清理所有人脸数据（用于重置）
    clearFaceData: () => ipcRenderer.invoke('diagnostic:clear-face-data'),
    // 重置人物关联（用于重新聚类）
    resetPersonLinks: () => ipcRenderer.invoke('diagnostic:reset-person-links'),
    // 执行原始SQL查询（仅限SELECT）
    query: (sql: string) => ipcRenderer.invoke('diagnostic:query', sql),
  },

  // 人脸匹配相关
  faceMatching: {
    autoMatch: () => ipcRenderer.invoke('face:auto-match'),
    findSimilar: (faceId: number) => ipcRenderer.invoke('face:find-similar', faceId),
    createPerson: (cluster: any, personName: string) =>
      ipcRenderer.invoke('face:create-person', cluster, personName),
    assign: (faceIds: number[], personId: number) =>
      ipcRenderer.invoke('face:assign', faceIds, personId),
    unmatch: (faceId: number) => ipcRenderer.invoke('face:unmatch', faceId),
    getStats: () => ipcRenderer.invoke('face:get-matching-stats'),
    // 向量重新生成
    regenerateStart: (options?: { batchSize?: number; resume?: boolean }) =>
      ipcRenderer.invoke('face:regenerate-start', options),
    regeneratePause: () => ipcRenderer.invoke('face:regenerate-pause'),
    regenerateGetProgress: () => ipcRenderer.invoke('face:regenerate-progress'),
    regenerateReset: () => ipcRenderer.invoke('face:regenerate-reset'),
    regenerateRecluster: () => ipcRenderer.invoke('face:regenerate-recluster'),
    cleanupPersons: () => ipcRenderer.invoke('face:cleanup-persons'),
    // 监听重新生成进度
    onRegenerateProgress: (callback: (progress: any) => void) => {
      const listener = (_: any, progress: any) => callback(progress)
      ipcRenderer.on('face:regenerate-progress', listener)
      return () => ipcRenderer.off('face:regenerate-progress', listener)
    },
    // 合并人物
    mergePersons: (sourcePersonId: number, targetPersonId: number) =>
      ipcRenderer.invoke('face:merge-persons', sourcePersonId, targetPersonId),
  },

  // 质量验证相关
  quality: {
    validateClustering: () => ipcRenderer.invoke('quality:validate-clustering'),
    testSemantic: (query: string) => ipcRenderer.invoke('quality:test-semantic', query),
    runTests: () => ipcRenderer.invoke('quality:run-tests'),
    generateReport: () => ipcRenderer.invoke('quality:generate-report'),
    checkVectors: () => ipcRenderer.invoke('quality:check-vectors'),
  },

  // 性能测试相关
  perf: {
    testSearch: (queryCount?: number) => ipcRenderer.invoke('perf:test-search', queryCount),
    testMemory: () => ipcRenderer.invoke('perf:test-memory'),
    testConcurrency: (concurrentCount?: number) => ipcRenderer.invoke('perf:test-concurrency', concurrentCount),
    testModels: () => ipcRenderer.invoke('perf:test-models'),
    runFull: () => ipcRenderer.invoke('perf:run-full'),
  },

  // 系统相关
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
  },

  // 窗口控制
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  // 嵌入服务相关
  embedding: {
    // 初始化 CLIP 模型
    initialize: () => ipcRenderer.invoke('embedding:initialize'),
    // 获取模型状态
    getStatus: () => ipcRenderer.invoke('embedding:get-status'),
    // 文本转向量
    textToEmbedding: (text: string) => ipcRenderer.invoke('embedding:text-to-vector', text),
    // 图片转向量
    imageToEmbedding: (imagePath: string) => ipcRenderer.invoke('embedding:image-to-vector', imagePath),
    // 生成所有照片的嵌入向量
    generateAll: () => ipcRenderer.invoke('embedding:generate-all'),
    // 生成单张照片的向量
    generateOne: (photoUuid: string) => ipcRenderer.invoke('embedding:generate-one', photoUuid),
    // 取消生成
    cancel: () => ipcRenderer.invoke('embedding:cancel'),
    // 获取生成状态
    getGenStatus: () => ipcRenderer.invoke('embedding:get-generation-status'),
    // 监听嵌入生成进度
    onProgress: (callback: (progress: any) => void) => {
      const listener = (_: any, progress: any) => callback(progress)
      ipcRenderer.on('embedding:progress', listener)
      return () => ipcRenderer.off('embedding:progress', listener)
    },
  },

  // 搜索相关
  search: {
    // 预处理搜索文本
    preprocess: (text: string) => ipcRenderer.invoke('search:preprocess', text),
    // 文本转向量
    textToVector: (text: string) => ipcRenderer.invoke('search:text-to-vector', text),
    // 语义搜索
    semantic: (options: { query: string; topK?: number; minSimilarity?: number; page?: number; pageSize?: number }) =>
      ipcRenderer.invoke('search:semantic', options),
    // 快速搜索
    quick: (query: string, topK?: number) => ipcRenderer.invoke('search:quick', query, topK),
    // 多查询搜索
    multi: (queries: string[], options?: { topK?: number; minSimilarity?: number }) =>
      ipcRenderer.invoke('search:multi', queries, options),
    // 清除缓存
    clearCache: () => ipcRenderer.invoke('search:clear-cache'),
    // 获取缓存状态
    getCacheStats: () => ipcRenderer.invoke('search:get-cache-stats'),
  },

  // 查询解析相关
  query: {
    // 解析用户查询
    parse: (query: string) => ipcRenderer.invoke('query:parse', query),
    // 清除缓存
    clearCache: () => ipcRenderer.invoke('query:clear-cache'),
    // 获取缓存统计
    getCacheStats: () => ipcRenderer.invoke('query:get-cache-stats'),
  },

  // 关键词搜索相关
  keywordSearch: {
    // 关键词搜索
    search: (options: { query: string; limit?: number; offset?: number }) =>
      ipcRenderer.invoke('search:keyword', options),
    // 快速搜索
    quick: (query: string, limit?: number) =>
      ipcRenderer.invoke('search:keyword-quick', query, limit),
    // 获取建议
    suggestions: (query: string, limit?: number) =>
      ipcRenderer.invoke('search:suggestions', query, limit),
  },

  // 全局向量搜索相关
  globalSearch: {
    // 全局向量搜索
    search: (options: { query: string; topK?: number; minSimilarity?: number; page?: number; pageSize?: number }) =>
      ipcRenderer.invoke('search:global', options),
    // 快速搜索
    quick: (query: string, topK?: number) =>
      ipcRenderer.invoke('search:global-quick', query, topK),
    // 相似照片
    similar: (photoUuid: string, topK?: number) =>
      ipcRenderer.invoke('search:similar', photoUuid, topK),
    // 批量搜索
    batch: (queries: string[], options?: { topK?: number; minSimilarity?: number }) =>
      ipcRenderer.invoke('search:batch', queries, options),
  },

  // 混合搜索相关
  hybridSearch: {
    // 混合搜索
    search: (options: { query: string; keywordWeight?: number; vectorWeight?: number; limit?: number }) =>
      ipcRenderer.invoke('search:hybrid', options),
    // 带意图的混合搜索
    searchWithIntent: (query: string) =>
      ipcRenderer.invoke('search:hybrid-intent', query),
    // 重新排序
    reorder: (results: any[], sortBy: 'keyword' | 'semantic' | 'mixed' | 'recency') =>
      ipcRenderer.invoke('search:reorder', results, sortBy),
  },

  // 导入相关（新的统一导入服务）
  import: {
    scanFolder: (folderPath: string) => ipcRenderer.invoke('import:scan-folder', folderPath),
    start: (folderPath: string, options?: any) => ipcRenderer.invoke('import:start', folderPath, options),
    cancel: () => ipcRenderer.invoke('import:cancel'),
    getProgress: () => ipcRenderer.invoke('import:get-progress'),
    // 监听导入进度
    onProgress: (callback: (progress: any) => void) => {
      const listener = (_: any, progress: any) => callback(progress)
      ipcRenderer.on('import:progress', listener)
      return () => ipcRenderer.off('import:progress', listener)
    },
  },

  // 扫描任务相关（持久化、断点续传）
  scanJob: {
    getActive: () => ipcRenderer.invoke('scan-job:get-active'),
    resume: (jobId: string) => ipcRenderer.invoke('scan-job:resume', jobId),
    getStats: () => ipcRenderer.invoke('scan-job:get-stats'),
    getAll: (limit?: number) => ipcRenderer.invoke('scan-job:get-all', limit),
  },
})

// 监听同步进度
ipcRenderer.on('sync:progress', (event, data) => {
  console.log('同步进度:', data)
})

console.log('[Preload] API 已注册完成')
