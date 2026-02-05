/**
 * PhotoMind - Electron 主进程入口
 */
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { ICloudService } from '../services/iCloudService.js'
import { PhotoDatabase } from '../database/db.js'
import { SearchService } from '../services/searchService.js'
import { LocalPhotoService } from '../services/localPhotoService.js'
import { folderScanner } from '../services/folderScanner.js'
import { importService, ImportOptions, ImportResult } from '../services/importService.js'
import { importProgressService, ImportProgress } from '../services/importProgressService.js'
import { getEmbeddingService } from '../services/embeddingService.js'
import { VectorGenerationService } from '../services/vectorGenerationService.js'
import { SemanticSearchService } from '../services/semanticSearchService.js'
import { SearchResultFormatter } from '../services/searchResultFormatter.js'
import { ConfigService, getConfigService } from '../services/configService.js'
import { thumbnailService } from '../services/thumbnailService.js'
import { suggestionService } from '../services/searchSuggestionService.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// 全局实例
let mainWindow: BrowserWindow | null = null
let database: PhotoDatabase | null = null
let iCloudService: ICloudService | null = null
let searchService: SearchService | null = null
let localPhotoService: LocalPhotoService | null = null
let configService: ConfigService | null = null
import type { ThumbnailService } from '../services/thumbnailService'
import type { SearchSuggestionService } from '../services/searchSuggestionService'
let thumbnailSvc: ThumbnailService | null = null
let suggestionSvc: SearchSuggestionService | null = null

// 开发模式：通过 npm script 运行 electron 时默认为开发模式
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || !process.env.NODE_ENV

// 路径辅助函数
function getRendererPath(): string {
  if (isDev) {
    return 'http://localhost:5177'
  }
  // 生产模式：从资源目录加载
  return resolve(process.resourcesPath, 'renderer/index.html')
}

function getPreloadPath(): string {
  if (isDev) {
    return resolve(__dirname, '../preload/index.js')
  }
  return resolve(process.resourcesPath, 'preload/index.js')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#5E6AD2',
      height: 40
    },
    backgroundColor: '#f5f5f7',
    show: false,
    frame: false
  })

  // 开发模式加载本地服务器，生产模式加载构建文件
  if (isDev) {
    mainWindow.loadURL('http://localhost:5177')
    // 主窗口打开 DevTools
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(getRendererPath())
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 初始化服务
async function initServices() {
  console.log('正在初始化服务...')

  try {
    // 初始化配置服务
    configService = new ConfigService()
    console.log('✓ 配置服务初始化完成')

    // 初始化数据库
    database = new PhotoDatabase()
    await database.init()
    console.log('✓ 数据库初始化完成')

    // 初始化搜索服务
    searchService = new SearchService(database)
    console.log('✓ 搜索服务初始化完成')

    // 初始化缩略图服务
    thumbnailSvc = thumbnailService
    await thumbnailSvc.init()
    console.log('✓ 缩略图服务初始化完成')

    // 初始化搜索建议服务
    suggestionSvc = suggestionService
    console.log('✓ 搜索建议服务初始化完成')

    // 初始化 iCloud 服务
    if (database) {
      iCloudService = new ICloudService(database)
      const initialized = await iCloudService.initialize('')
      if (initialized) {
        console.log('✓ iCloud 服务初始化完成')
      } else {
        console.log('✓ iCloud 服务已就绪（使用模拟数据）')
      }

      // 初始化本地照片服务
      localPhotoService = new LocalPhotoService(database)
      console.log('✓ 本地照片服务初始化完成')
    }

    console.log('所有服务初始化完成！')
  } catch (error) {
    console.error('服务初始化失败:', error)
  }
}

// IPC 处理程序
function setupIPCHandlers() {
  // ==================== iCloud 相关 ====================

  // 选择 Photos Library
  ipcMain.handle('icloud:select-library', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择 iCloud Photos Library',
      defaultPath: `/Users/${process.env.USER}/Pictures/Photos Library.photoslibrary`
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const libraryPath = result.filePaths[0]
      // 初始化 iCloud 服务
      if (iCloudService) {
        await iCloudService.initialize(libraryPath)
      }
      return libraryPath
    }
    return null
  })

  // ==================== 照片相关 ====================

  // 获取照片列表 - 总是从本地数据库获取
  ipcMain.handle('photos:get-list', async (event, options) => {
    try {
      const limit = options?.limit || 100
      const offset = options?.offset || 0

      console.log(`[IPC] photos:get-list - limit: ${limit}, offset: ${offset}`)

      // 总是从本地数据库获取已导入的照片
      if (localPhotoService) {
        const localPhotos = localPhotoService.getLocalPhotos(limit, offset)
        console.log(`[IPC] 从本地数据库获取 ${localPhotos.length} 张照片`)
        return localPhotos
      }

      // 如果没有本地服务，尝试 iCloud
      if (iCloudService) {
        return await iCloudService.getPhotos(limit, offset)
      }

      // 否则返回空数组（不是模拟数据）
      console.log('[IPC] 没有本地照片，返回空数组')
      return []
    } catch (error) {
      console.error('[IPC] 获取照片列表失败:', error)
      return []
    }
  })

  // 获取照片总数
  ipcMain.handle('photos:get-count', async () => {
    try {
      if (localPhotoService) {
        const count = localPhotoService.getPhotoCount()
        console.log(`[IPC] 照片总数: ${count}`)
        return { total: count }
      }
      return { total: 0 }
    } catch (error) {
      console.error('[IPC] 获取照片总数失败:', error)
      return { total: 0 }
    }
  })

  // 获取照片详情
  ipcMain.handle('photos:get-detail', async (event, photoId) => {
    try {
      if (!iCloudService) {
        return generateMockPhotos(1, parseInt(photoId) || 0)[0]
      }
      return await iCloudService.getPhotoDetail(photoId)
    } catch (error) {
      console.error('获取照片详情失败:', error)
      return null
    }
  })

  // 删除照片
  ipcMain.handle('photos:delete', async (event, photoId: number) => {
    try {
      console.log(`[IPC] 删除照片: ${photoId}`)

      // 优先使用本地照片服务删除
      if (localPhotoService) {
        const success = localPhotoService.deletePhoto(photoId)
        if (success) {
          console.log(`[IPC] 照片 ${photoId} 已从本地数据库删除`)
          return { success: true }
        }
      }

      // 如果本地服务删除失败，尝试 iCloud 服务
      if (iCloudService) {
        const success = await iCloudService.deletePhoto(photoId)
        return { success }
      }

      // 没有可用的服务时返回错误
      console.warn('[IPC] 没有可用的照片服务，无法删除照片')
      return { success: false, error: '没有可用的照片服务' }
    } catch (error) {
      console.error('[IPC] 删除照片失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 导出照片
  ipcMain.handle('photos:export', async (event, params: { photoId: number; filePath: string; exportPath: string }) => {
    try {
      const { photoId, filePath, exportPath } = params
      console.log(`[IPC] 导出照片: ${photoId} -> ${exportPath}`)

      // 使用 dialog 让用户选择导出路径
      const result = await dialog.showOpenDialog({
        title: '选择导出位置',
        defaultPath: exportPath,
        buttonLabel: '保存',
        properties: ['showOverwriteConfirmation']
      })

      if (result.canceled) {
        return { success: false, error: '用户取消导出' }
      }

      const targetPath = result.filePaths[0]

      // 导入 fs 模块复制文件
      const fs = await import('fs')

      // 检查源文件是否存在
      if (!fs.existsSync(filePath)) {
        console.error(`[IPC] 源文件不存在: ${filePath}`)
        return { success: false, error: '源文件不存在' }
      }

      // 复制文件
      fs.copyFileSync(filePath, targetPath)
      console.log(`[IPC] 照片已导出到: ${targetPath}`)

      return { success: true, exportPath: targetPath }
    } catch (error) {
      console.error('[IPC] 导出照片失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // ==================== 搜索相关 ====================

  // 搜索照片
  ipcMain.handle('photos:search', async (event, query, filters) => {
    try {
      if (!searchService) {
        // 模拟搜索结果
        return { results: generateMockPhotos(10, 0), total: 10 }
      }
      return await searchService.search(query, filters)
    } catch (error) {
      console.error('搜索失败:', error)
      return { results: [], total: 0 }
    }
  })

  // 获取智能相册
  ipcMain.handle('albums:get-smart', async () => {
    try {
      if (!searchService) {
        return generateMockAlbums()
      }
      return await searchService.getSmartAlbums()
    } catch (error) {
      console.error('获取智能相册失败:', error)
      return []
    }
  })

  // ==================== 人物相关 ====================

  // 获取所有人物
  ipcMain.handle('people:get-all', async () => {
    try {
      if (!database) {
        return generateMockPeople()
      }
      return database.getAllPersons()
    } catch (error) {
      console.error('获取人物列表失败:', error)
      return []
    }
  })

  // 添加人物
  ipcMain.handle('people:add', async (event, person) => {
    try {
      if (!database) return -1
      return database.addPerson(person)
    } catch (error) {
      console.error('添加人物失败:', error)
      return -1
    }
  })

  // 搜索人物
  ipcMain.handle('people:search', async (event, query: string) => {
    try {
      if (!searchService) {
        return generateMockPeople().filter(p =>
          p.name.includes(query) || p.display_name?.includes(query)
        )
      }
      return await searchService.searchPeople(query)
    } catch (error) {
      console.error('搜索人物失败:', error)
      return []
    }
  })

  // 根据人物搜索照片
  ipcMain.handle('people:search-photos', async (event, personName: string) => {
    try {
      if (!searchService) {
        return { results: generateMockPhotos(10, 0), total: 10 }
      }
      return await searchService.searchByPerson(personName)
    } catch (error) {
      console.error('根据人物搜索照片失败:', error)
      return { results: [], total: 0 }
    }
  })

  // 更新人物信息
  ipcMain.handle('people:update', async (event, id: number, person: { name?: string; displayName?: string }) => {
    try {
      const { personService } = await import('../services/personService.js')
      const success = personService.updatePerson(id, person)
      return { success }
    } catch (error) {
      console.error('[IPC] 更新人物失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 删除人物
  ipcMain.handle('people:delete', async (event, id: number) => {
    try {
      const { personService } = await import('../services/personService.js')
      const success = personService.deletePerson(id)
      return { success }
    } catch (error) {
      console.error('[IPC] 删除人物失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 标记人物
  ipcMain.handle('people:tag', async (event, params: { photoId: number; personId: number; boundingBox?: any }) => {
    try {
      const { personService } = await import('../services/personService.js')
      const result = personService.tagPerson(params)
      return result
    } catch (error) {
      console.error('[IPC] 标记人物失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 移除标签
  ipcMain.handle('people:untag', async (event, photoId: number, personId: number) => {
    try {
      const { personService } = await import('../services/personService.js')
      const success = personService.untagPerson(photoId, personId)
      return { success }
    } catch (error) {
      console.error('[IPC] 移除标签失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 获取照片的人物标签
  ipcMain.handle('people:get-photo-tags', async (event, photoId: number) => {
    try {
      const { personService } = await import('../services/personService.js')
      return personService.getPhotoTags(photoId)
    } catch (error) {
      console.error('[IPC] 获取照片标签失败:', error)
      return []
    }
  })

  // 获取某人物的所有照片
  ipcMain.handle('people:get-person-photos', async (event, personId: number) => {
    try {
      const { personService } = await import('../services/personService.js')
      return personService.getPersonPhotos(personId)
    } catch (error) {
      console.error('[IPC] 获取人物照片失败:', error)
      return []
    }
  })

  // 获取人物统计
  ipcMain.handle('people:get-stats', async () => {
    try {
      const { personService } = await import('../services/personService.js')
      return personService.getStats()
    } catch (error) {
      console.error('[IPC] 获取统计失败:', error)
      return { totalPersons: 0, totalTags: 0 }
    }
  })

  // ==================== 地点相关 ====================

  // 获取所有地点
  ipcMain.handle('places:get-all', async () => {
    try {
      if (!database) {
        return generateMockPlaces()
      }
      return database.getAllPlaces()
    } catch (error) {
      console.error('获取地点列表失败:', error)
      return []
    }
  })

  // ==================== 时间线相关 ====================

  // 获取某年照片
  ipcMain.handle('timeline:get', async (event, year) => {
    try {
      if (!database) {
        return generateMockPhotos(20, year ? year * 10 : 0)
      }
      return database.getPhotosByYear(year || new Date().getFullYear())
    } catch (error) {
      console.error('获取时间线失败:', error)
      return []
    }
  })

  // ==================== 同步相关 ====================

  // 开始同步
  ipcMain.handle('sync:start', async () => {
    try {
      if (!iCloudService) {
        // 模拟同步
        await new Promise(resolve => setTimeout(resolve, 2000))
        return 100  // 返回模拟同步数量
      }
      return await iCloudService.syncAll()
    } catch (error) {
      console.error('同步失败:', error)
      return 0
    }
  })

  // 获取同步进度
  ipcMain.handle('sync:get-progress', async () => {
    // 返回模拟进度
    return { current: 0, total: 0, status: 'idle' }
  })

  // ==================== 本地照片导入相关 ====================

  // 选择导入文件夹
  ipcMain.handle('local:select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'multiSelections'],
      title: '选择要导入的照片文件夹',
      buttonLabel: '选择文件夹'
    })

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths
    }
    return []
  })

  // 开始导入照片
  ipcMain.handle('local:import-folder', async (event, folderPath: string) => {
    try {
      if (!localPhotoService) {
        throw new Error('本地照片服务未初始化')
      }

      // 设置进度回调
      localPhotoService.onProgress((progress) => {
        event.sender.send('local:import-progress', progress)
      })

      const result = await localPhotoService.importFolder(folderPath)
      return {
        success: true,
        imported: result.imported,
        errors: result.errors
      }
    } catch (error) {
      console.error('导入照片失败:', error)
      return {
        success: false,
        error: (error as Error).message,
        imported: 0,
        errors: 1
      }
    }
  })

  // 导入单张照片
  ipcMain.handle('local:import-photo', async (event, filePath: string) => {
    try {
      if (!localPhotoService) {
        throw new Error('本地照片服务未初始化')
      }

      const photo = await localPhotoService.importPhoto(filePath)
      return photo
    } catch (error) {
      console.error('导入单张照片失败:', error)
      return null
    }
  })

  // 获取本地照片数量
  ipcMain.handle('local:get-count', async () => {
    try {
      if (!localPhotoService) {
        return 0
      }
      return localPhotoService.getPhotoCount()
    } catch (error) {
      return 0
    }
  })

  // ==================== 导入相关 (新) ====================

  // 扫描文件夹
  ipcMain.handle('import:scan-folder', async (_, folderPath: string) => {
    try {
      console.log(`[IPC] 扫描文件夹: ${folderPath}`)
      const files = await folderScanner.scanFolder(folderPath)
      console.log(`[IPC] 找到 ${files.length} 个文件`)
      return files
    } catch (error) {
      console.error('[IPC] 扫描文件夹失败:', error)
      return []
    }
  })

  // 开始导入
  ipcMain.handle('import:start', async (event, folderPath: string, options: ImportOptions) => {
    try {
      console.log(`[IPC] 开始导入: ${folderPath}`)

      // 使用新的进度服务订阅进度更新
      const unsubscribe = importProgressService.subscribe((progress: ImportProgress) => {
        event.sender.send('import:progress', progress)
      })

      // 设置进度回调
      importService.onProgress((progress) => {
        event.sender.send('import:progress', progress)
      })

      const result = await importService.importFromFolder(folderPath, options)

      // 完成后取消订阅
      unsubscribe()

      console.log(`[IPC] 导入完成: 成功 ${result.imported}, 跳过 ${result.skipped}, 失败 ${result.failed}`)

      return result
    } catch (error) {
      console.error('[IPC] 导入失败:', error)
      return {
        success: false,
        imported: 0,
        skipped: 0,
        failed: 0,
        errors: [{ file: folderPath, error: (error as Error).message }],
        duration: 0
      } as ImportResult
    }
  })

  // 取消导入
  ipcMain.handle('import:cancel', async () => {
    console.log('[IPC] 收到取消导入信号')
    importService.cancel()
    importProgressService.cancel()
    return { success: true }
  })

  // 获取导入状态
  ipcMain.handle('import:get-progress', async () => {
    const progress = importProgressService.getProgress()
    return {
      isImporting: importService.getIsImporting(),
      progress: progress || null
    }
  })

  // ==================== 嵌入服务相关 ====================

  // 初始化 CLIP 模型
  ipcMain.handle('embedding:initialize', async () => {
    console.log('[IPC] 收到 embedding:initialize 请求')
    try {
      const embeddingService = getEmbeddingService()
      await embeddingService.initialize()
      const status = embeddingService.getModelStatus()
      return { success: true, status }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 获取模型状态
  ipcMain.handle('embedding:get-status', async () => {
    const embeddingService = getEmbeddingService()
    return embeddingService.getModelStatus()
  })

  // 文本转向量
  ipcMain.handle('embedding:text-to-vector', async (_, text: string) => {
    const embeddingService = getEmbeddingService()
    return await embeddingService.textToEmbedding(text)
  })

  // 图片转向量
  ipcMain.handle('embedding:image-to-vector', async (_, imagePath: string) => {
    const embeddingService = getEmbeddingService()
    const result = await embeddingService.imageToEmbedding(imagePath)

    // 如果成功，自动保存到数据库
    if (result.success && result.vector && database) {
      // 从路径提取 UUID (假设路径包含 UUID)
      const photoUuid = extractPhotoUuidFromPath(imagePath)
      if (photoUuid) {
        await database.saveEmbedding(photoUuid, result.vector, 'image')
      }
    }

    return result
  })

  // 生成所有照片的嵌入向量
  ipcMain.handle('embedding:generate-all', async (event) => {
    console.log('[IPC] 开始批量生成嵌入向量')

    if (!database) {
      return { success: false, error: 'Database not initialized', successCount: 0, failedCount: 0, total: 0, errors: [], cancelled: false }
    }

    const vectorService = new VectorGenerationService(database)

    try {
      const result = await vectorService.generateAll({
        onProgress: (progress) => {
          event.sender.send('embedding:progress', progress)
        }
      })

      return { success: true, successCount: result.success, failedCount: result.failed, total: result.total, errors: result.errors, cancelled: result.cancelled }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), successCount: 0, failedCount: 0, total: 0, errors: [], cancelled: false }
    }
  })

  // 生成单张照片的向量
  ipcMain.handle('embedding:generate-one', async (_, photoUuid) => {
    if (!database) {
      return { success: false, error: 'Database not initialized' }
    }
    const vectorService = new VectorGenerationService(database)
    try {
      const success = await vectorService.generateOne(photoUuid)
      return { success }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 取消向量生成
  ipcMain.handle('embedding:cancel', async () => {
    const vectorService = new VectorGenerationService()
    vectorService.cancel()
    return { success: true }
  })

  // 获取向量生成状态
  ipcMain.handle('embedding:get-status', async () => {
    const vectorService = new VectorGenerationService()
    return vectorService.getStatus()
  })

  // ==================== 文本搜索相关 ====================

  // 预处理搜索文本
  ipcMain.handle('search:preprocess', async (_, text: string) => {
    const { textPreprocessor } = await import('../services/textPreprocessor.js')
    return textPreprocessor.preprocess(text)
  })

  // 文本转向量
  ipcMain.handle('search:text-to-vector', async (_, text: string) => {
    const { textVectorService } = await import('../services/textVectorService.js')
    return await textVectorService.textToVector(text)
  })

  // 语义搜索
  ipcMain.handle('search:semantic', async (_, query: string, options?: { topK?: number; minSimilarity?: number }) => {
    try {
      const { textVectorService } = await import('../services/textVectorService.js')
      const { similarityService } = await import('../services/similarityService.js')

      // 1. 预处理
      const { textPreprocessor } = await import('../services/textPreprocessor.js')
      const processed = textPreprocessor.preprocess(query)

      // 2. 转向量
      const textResult = await textVectorService.textToVector(query)
      if (!textResult.vector) {
        return { success: false, error: 'Failed to generate vector', results: [] }
      }

      // 3. 相似度搜索
      const getEmbeddings = async () => {
        if (!database) return []
        return await database.getAllEmbeddings('image')
      }

      const results = await similarityService.semanticSearch(
        textResult.vector,
        getEmbeddings,
        options
      )

      return {
        success: true,
        processed: {
          original: processed.original,
          processed: processed.processed,
          keywords: processed.keywords,
          language: processed.language
        },
        results,
        processingTimeMs: textResult.processingTimeMs
      }
    } catch (error) {
      console.error('[IPC] 语义搜索失败:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error), results: [] }
    }
  })

  // 清除文本向量缓存
  ipcMain.handle('search:clear-cache', async () => {
    const { textVectorService } = await import('../services/textVectorService.js')
    textVectorService.clearCache()
    return { success: true }
  })

  // 获取缓存状态
  ipcMain.handle('search:get-cache-stats', async () => {
    const { textVectorService } = await import('../services/textVectorService.js')
    return textVectorService.getCacheStats()
  })

  // ==================== 语义搜索相关 ====================

  // 执行语义搜索
  ipcMain.handle('search:semantic', async (_, options: { query: string; topK?: number; minSimilarity?: number; page?: number; pageSize?: number }) => {
    try {
      if (!database) {
        return { success: false, error: 'Database not initialized', results: [] }
      }

      const searchService = new SemanticSearchService(database)
      const result = await searchService.search(options)

      // 格式化结果
      const { searchResultFormatter } = await import('../services/searchResultFormatter.js')
      const formattedResults = searchResultFormatter.formatBatch(result.results)
      const summary = searchResultFormatter.formatSummary(result)

      return {
        success: true,
        ...summary,
        results: formattedResults
      }
    } catch (error) {
      console.error('[IPC] 语义搜索失败:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error), results: [] }
    }
  })

  // 快速搜索（不返回详情）
  ipcMain.handle('search:quick', async (_, query: string, topK: number = 10) => {
    try {
      if (!database) return []
      const searchService = new SemanticSearchService(database)
      return await searchService.quickSearch(query, topK)
    } catch (error) {
      console.error('[IPC] 快速搜索失败:', error)
      return []
    }
  })

  // 多查询融合搜索
  ipcMain.handle('search:multi', async (_, queries: string[], options?: { topK?: number; minSimilarity?: number }) => {
    try {
      if (!database) {
        return { success: false, error: 'Database not initialized', results: [] }
      }

      const searchService = new SemanticSearchService(database)
      const result = await searchService.multiQuerySearch(queries, options)

      return {
        success: true,
        total: result.total,
        results: result.results
      }
    } catch (error) {
      console.error('[IPC] 多查询搜索失败:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error), results: [] }
    }
  })

  // ==================== 查询解析相关 ====================

  // 解析用户查询
  ipcMain.handle('query:parse', async (_, query: string) => {
    try {
      const { queryParserService } = await import('../services/queryParserService.js')
      return await queryParserService.parse(query)
    } catch (error) {
      console.error('[IPC] 查询解析失败:', error)
      return null
    }
  })

  // 清除查询解析缓存
  ipcMain.handle('query:clear-cache', async () => {
    try {
      const { queryParserService } = await import('../services/queryParserService.js')
      queryParserService.clearCache()
      return { success: true }
    } catch (error) {
      console.error('[IPC] 清除查询缓存失败:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 获取查询解析缓存统计
  ipcMain.handle('query:get-cache-stats', async () => {
    try {
      const { queryParserService } = await import('../services/queryParserService.js')
      return queryParserService.getCacheStats()
    } catch (error) {
      console.error('[IPC] 获取缓存统计失败:', error)
      return null
    }
  })

  // ==================== 关键词搜索相关 ====================

  // 关键词搜索
  ipcMain.handle('search:keyword', async (_, options: {
    query: string
    fields?: string[]
    fuzzy?: boolean
    limit?: number
    offset?: number
  }) => {
    try {
      const { keywordSearchService } = await import('../services/keywordSearchService.js')
      return await keywordSearchService.search(options)
    } catch (error) {
      console.error('[IPC] 关键词搜索失败:', error)
      return { results: [], total: 0, query: options.query }
    }
  })

  // 快速关键词搜索
  ipcMain.handle('search:keyword-quick', async (_, query: string, limit: number = 20) => {
    try {
      const { keywordSearchService } = await import('../services/keywordSearchService.js')
      return await keywordSearchService.quickSearch(query, limit)
    } catch (error) {
      console.error('[IPC] 快速搜索失败:', error)
      return []
    }
  })

  // 获取搜索建议
  ipcMain.handle('search:suggestions', async (_, query: string, limit: number = 10) => {
    try {
      const { keywordSearchService } = await import('../services/keywordSearchService.js')
      return keywordSearchService.getSuggestions(query, limit)
    } catch (error) {
      console.error('[IPC] 获取搜索建议失败:', error)
      return []
    }
  })

  // ==================== 全局向量搜索相关 ====================

  // 全局向量搜索
  ipcMain.handle('search:global', async (_, options: {
    query: string
    topK?: number
    minSimilarity?: number
    page?: number
    pageSize?: number
  }) => {
    try {
      const { globalSearchService } = await import('../services/globalSearchService.js')
      return await globalSearchService.search(options)
    } catch (error) {
      console.error('[IPC] 全局搜索失败:', error)
      return {
        results: [],
        total: 0,
        page: 1,
        pageSize: 20,
        processingTimeMs: 0,
        query: { original: options.query, processed: '', vectorDimension: 0 }
      }
    }
  })

  // 快速全局搜索
  ipcMain.handle('search:global-quick', async (_, query: string, topK: number = 10) => {
    try {
      const { globalSearchService } = await import('../services/globalSearchService.js')
      return await globalSearchService.quickSearch(query, topK)
    } catch (error) {
      console.error('[IPC] 快速搜索失败:', error)
      return []
    }
  })

  // 查找相似照片
  ipcMain.handle('search:similar', async (_, photoUuid: string, topK: number = 10) => {
    try {
      const { globalSearchService } = await import('../services/globalSearchService.js')
      return await globalSearchService.findSimilarPhotos(photoUuid, topK)
    } catch (error) {
      console.error('[IPC] 相似照片搜索失败:', error)
      return []
    }
  })

  // 批量搜索
  ipcMain.handle('search:batch', async (_, queries: string[], options?: { topK?: number; minSimilarity?: number }) => {
    try {
      const { globalSearchService } = await import('../services/globalSearchService.js')
      return await globalSearchService.batchSearch(queries, options)
    } catch (error) {
      console.error('[IPC] 批量搜索失败:', error)
      return []
    }
  })

  // ==================== 结果融合相关 ====================

  // 混合搜索（融合结果）
  ipcMain.handle('search:hybrid', async (_, options: {
    query: string
    keywordWeight?: number
    vectorWeight?: number
    limit?: number
    minScore?: number
  }) => {
    try {
      const { resultMergeService } = await import('../services/resultMergeService.js')
      return await resultMergeService.search(options)
    } catch (error) {
      console.error('[IPC] 混合搜索失败:', error)
      return {
        results: [],
        total: 0,
        query: options.query,
        processingTimeMs: 0,
        stats: { keywordCount: 0, semanticCount: 0, mergedCount: 0 }
      }
    }
  })

  // 混合搜索（带意图）
  ipcMain.handle('search:hybrid-intent', async (_, query: string) => {
    try {
      const { resultMergeService } = await import('../services/resultMergeService.js')
      return await resultMergeService.searchWithIntent(query)
    } catch (error) {
      console.error('[IPC] 带意图搜索失败:', error)
      return {
        results: [],
        total: 0,
        query,
        processingTimeMs: 0,
        stats: { keywordCount: 0, semanticCount: 0, mergedCount: 0 }
      }
    }
  })

  // 重新排序
  ipcMain.handle('search:reorder', async (_, results: any[], sortBy: string) => {
    try {
      const { resultMergeService } = await import('../services/resultMergeService.js')
      return resultMergeService.reorderResults(results, sortBy as 'keyword' | 'semantic' | 'mixed' | 'recency')
    } catch (error) {
      console.error('[IPC] 重新排序失败:', error)
      return results
    }
  })

  // ==================== 人脸检测相关 ====================

  // 加载人脸检测模型
  ipcMain.handle('face:load-models', async () => {
    try {
      const { faceDetectionService } = await import('../services/faceDetectionService.js')
      return await faceDetectionService.loadModels()
    } catch (error) {
      console.error('[IPC] 加载模型失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 获取模型状态
  ipcMain.handle('face:get-status', async () => {
    try {
      const { faceDetectionService } = await import('../services/faceDetectionService.js')
      return faceDetectionService.getModelStatus()
    } catch (error) {
      return { loaded: false, modelsPath: '', configured: false }
    }
  })

  // 检测单张照片
  ipcMain.handle('face:detect', async (_, imagePath: string) => {
    try {
      const { faceDetectionService } = await import('../services/faceDetectionService.js')
      return await faceDetectionService.detect(imagePath)
    } catch (error) {
      return { success: false, detections: [], error: String(error), processingTimeMs: 0 }
    }
  })

  // 批量检测
  ipcMain.handle('face:detect-batch', async (event, imagePaths: string[]) => {
    try {
      const { faceDetectionService } = await import('../services/faceDetectionService.js')

      const result = await faceDetectionService.detectBatch(
        imagePaths,
        {},
        (progress) => {
          event.sender.send('face:progress', progress)
        }
      )

      return {
        success: true,
        totalDetected: result.totalDetected,
        processingTimeMs: result.processingTimeMs
      }
    } catch (error) {
      console.error('[IPC] 批量检测失败:', error)
      return { success: false, totalDetected: 0, processingTimeMs: 0, error: String(error) }
    }
  })

  // 取消检测
  ipcMain.handle('face:cancel', async () => {
    try {
      const { faceDetectionService } = await import('../services/faceDetectionService.js')
      faceDetectionService.cancel()
      return { success: true }
    } catch (error) {
      return { success: false }
    }
  })

  // ==================== 人脸匹配相关 ====================

  // 自动匹配
  ipcMain.handle('face:auto-match', async () => {
    try {
      const { faceMatchingService } = await import('../services/faceMatchingService.js')
      return await faceMatchingService.autoMatch({ threshold: 0.6 })
    } catch (error) {
      console.error('[IPC] 自动匹配失败:', error)
      return { matched: 0, clusters: [], processingTimeMs: 0 }
    }
  })

  // 查找相似人脸
  ipcMain.handle('face:find-similar', async (_, faceId: number) => {
    try {
      const { faceMatchingService } = await import('../services/faceMatchingService.js')
      return await faceMatchingService.findSimilarFaces(faceId)
    } catch (error) {
      console.error('[IPC] 查找相似人脸失败:', error)
      return []
    }
  })

  // 为聚类创建人物
  ipcMain.handle('face:create-person', async (_, cluster: any, personName: string) => {
    try {
      const { faceMatchingService } = await import('../services/faceMatchingService.js')
      return await faceMatchingService.createPersonFromCluster(cluster, personName)
    } catch (error) {
      console.error('[IPC] 创建人物失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 将人脸分配给人物
  ipcMain.handle('face:assign', async (_, faceIds: number[], personId: number) => {
    try {
      const { faceMatchingService } = await import('../services/faceMatchingService.js')
      return await faceMatchingService.assignToPerson(faceIds, personId)
    } catch (error) {
      console.error('[IPC] 分配人脸失败:', error)
      return { success: false, assigned: 0, error: String(error) }
    }
  })

  // 取消匹配
  ipcMain.handle('face:unmatch', async (_, faceId: number) => {
    try {
      const { faceMatchingService } = await import('../services/faceMatchingService.js')
      return await faceMatchingService.unmatchFace(faceId)
    } catch (error) {
      console.error('[IPC] 取消匹配失败:', error)
      return false
    }
  })

  // 获取匹配统计
  ipcMain.handle('face:get-matching-stats', async () => {
    try {
      const { faceMatchingService } = await import('../services/faceMatchingService.js')
      return faceMatchingService.getStats()
    } catch (error) {
      return { totalFaces: 0, matchedFaces: 0, unmatchedFaces: 0, matchRate: 0 }
    }
  })

  // ==================== 人物搜索相关 ====================

  // 搜索人物
  ipcMain.handle('people:search', async (_, options: { query: string; limit?: number; offset?: number; sortBy?: string }) => {
    try {
      const { personSearchService } = await import('../services/personSearchService.js')
      return await personSearchService.search(options)
    } catch (error) {
      console.error('[IPC] 搜索人物失败:', error)
      return { results: [], total: 0, query: options.query, processingTimeMs: 0 }
    }
  })

  // 获取人物照片
  ipcMain.handle('people:get-photos', async (_, filter: { personId: number; year?: number; month?: number; limit?: number; offset?: number }) => {
    try {
      const { personSearchService } = await import('../services/personSearchService.js')
      return await personSearchService.getPersonPhotos(filter)
    } catch (error) {
      console.error('[IPC] 获取人物照片失败:', error)
      return null
    }
  })

  // 获取人物时间线
  ipcMain.handle('people:get-timeline', async (_, personId: number) => {
    try {
      const { personSearchService } = await import('../services/personSearchService.js')
      return await personSearchService.getPersonTimeline(personId)
    } catch (error) {
      console.error('[IPC] 获取时间线失败:', error)
      return {}
    }
  })

  // 获取搜索建议
  ipcMain.handle('people:get-suggestions', async (_, query: string, limit?: number) => {
    try {
      const { personSearchService } = await import('../services/personSearchService.js')
      return personSearchService.getSuggestions(query, limit)
    } catch (error) {
      console.error('[IPC] 获取建议失败:', error)
      return []
    }
  })

  // 获取热门人物
  ipcMain.handle('people:get-popular', async (_, limit?: number) => {
    try {
      const { personSearchService } = await import('../services/personSearchService.js')
      return personSearchService.getPopularPersons(limit)
    } catch (error) {
      console.error('[IPC] 获取热门人物失败:', error)
      return []
    }
  })

  // 获取人物统计
  ipcMain.handle('people:get-search-stats', async () => {
    try {
      const { personSearchService } = await import('../services/personSearchService.js')
      return personSearchService.getStats()
    } catch (error) {
      return { totalPersons: 0, totalTaggedPhotos: 0, avgPhotosPerPerson: 0 }
    }
  })

  // 获取搜索历史
  ipcMain.handle('people:get-search-history', async () => {
    try {
      const { personSearchService } = await import('../services/personSearchService.js')
      return personSearchService.getSearchHistory()
    } catch (error) {
      return []
    }
  })

  // 添加搜索历史
  ipcMain.handle('people:add-search-history', async (_, query: string) => {
    try {
      const { personSearchService } = await import('../services/personSearchService.js')
      personSearchService.addToHistory(query)
      return { success: true }
    } catch (error) {
      return { success: false }
    }
  })

  // 清空搜索历史
  ipcMain.handle('people:clear-search-history', async () => {
    try {
      const { personSearchService } = await import('../services/personSearchService.js')
      personSearchService.clearHistory()
      return { success: true }
    } catch (error) {
      return { success: false }
    }
  })

  // ==================== 配置相关 ====================

  // 获取应用配置
  ipcMain.handle('config:get', async () => {
    try {
      const configService = getConfigService()
      return configService.getConfig()
    } catch (error) {
      console.error('获取配置失败:', error)
      return null
    }
  })

  // 设置 API Key
  ipcMain.handle('config:set-api-key', async (event, apiKey: string) => {
    try {
      const configService = getConfigService()
      configService.setApiKey(apiKey)
      return { success: true }
    } catch (error) {
      console.error('设置 API Key 失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取 LLM 配置状态
  ipcMain.handle('config:get-llm-status', async () => {
    try {
      const configService = getConfigService()
      const config = configService.getLLMConfig()
      return {
        configured: configService.isLLMConfigured(),
        provider: config.provider,
        hasApiKey: !!config.apiKey
      }
    } catch (error) {
      console.error('获取 LLM 状态失败:', error)
      return { configured: false, provider: 'none', hasApiKey: false }
    }
  })

  // 设置主题
  ipcMain.handle('config:set-theme', async (event, theme: string) => {
    try {
      const configService = getConfigService()
      configService.setTheme(theme as 'light' | 'dark' | 'system')
      return { success: true }
    } catch (error) {
      console.error('设置主题失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // ==================== 搜索建议相关 ====================

  // 获取搜索建议
  ipcMain.handle('suggestions:get', async (event, query: string) => {
    try {
      const suggestions = suggestionService?.getSuggestions(query) || []
      return suggestions
    } catch (error) {
      console.error('获取搜索建议失败:', error)
      return []
    }
  })

  // 添加搜索到历史
  ipcMain.handle('suggestions:add-history', async (event, query: string, resultCount: number) => {
    try {
      suggestionService?.addToHistory(query, resultCount)
      return { success: true }
    } catch (error) {
      console.error('添加搜索历史失败:', error)
      return { success: false }
    }
  })

  // 获取搜索历史
  ipcMain.handle('suggestions:get-history', async () => {
    try {
      return suggestionService?.getHistory() || []
    } catch (error) {
      console.error('获取搜索历史失败:', error)
      return []
    }
  })

  // 清空搜索历史
  ipcMain.handle('suggestions:clear-history', async () => {
    try {
      suggestionService?.clearHistory()
      return { success: true }
    } catch (error) {
      console.error('清空搜索历史失败:', error)
      return { success: false }
    }
  })

  // 获取热门搜索
  ipcMain.handle('suggestions:get-popular', async () => {
    try {
      return suggestionService?.getPopularSearches() || []
    } catch (error) {
      console.error('获取热门搜索失败:', error)
      return []
    }
  })

  // ==================== 系统相关 ====================

  // 获取应用版本
  ipcMain.handle('app:get-version', () => {
    return app.getVersion()
  })

  // 最小化窗口
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  // 最大化/还原窗口
  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    }
  })

  // 关闭窗口
  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  console.log('IPC 处理程序已注册')
}

// ==================== 模拟数据生成器 ====================

function generateMockPhotos(limit: number, offset: number): any[] {
  const photos: any[] = []
  const locations = [
    { name: '日本东京', lat: 35.6762, lng: 139.6503 },
    { name: '新疆乌鲁木齐', lat: 43.8256, lng: 87.6168 },
    { name: '北京', lat: 39.9042, lng: 116.4074 },
    { name: '上海', lat: 31.2304, lng: 121.4737 },
    { name: '家里', lat: 39.9042, lng: 116.4074 }
  ]

  for (let i = offset; i < offset + limit; i++) {
    const year = 2015 + Math.floor(i / 100)
    const month = (i % 12) + 1
    const day = (i % 28) + 1

    photos.push({
      id: i,
      uuid: `photo-${i}`,
      cloudId: `cloud-${i}`,
      fileName: `IMG_${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}_${i}.jpg`,
      fileSize: Math.floor(Math.random() * 5000000) + 1000000,
      width: 4032,
      height: 3024,
      takenAt: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:30:00Z`,
      exif: {
        camera: 'iPhone 15 Pro Max',
        lens: 'f/1.8',
        iso: 100,
        aperture: 1.8,
        shutterSpeed: '1/120'
      },
      location: locations[i % locations.length],
      status: 'icloud',
      thumbnailPath: null
    })
  }

  return photos
}

function generateMockPeople(): any[] {
  return [
    { id: 1, name: '爸爸', face_count: 156 },
    { id: 2, name: '妈妈', face_count: 142 },
    { id: 3, name: '儿子', face_count: 89 },
    { id: 4, name: '我', face_count: 234 },
    { id: 5, name: '爷爷奶奶', face_count: 67 }
  ]
}

function generateMockPlaces(): any[] {
  return [
    { place_name: '日本东京', photo_count: 245 },
    { place_name: '新疆', photo_count: 189 },
    { place_name: '北京', photo_count: 156 },
    { place_name: '上海', photo_count: 98 },
    { place_name: '家里', photo_count: 423 }
  ]
}

function generateMockAlbums(): any[] {
  return [
    { id: 'smart-places', name: '按地点浏览', type: 'smart', items: generateMockPlaces() },
    { id: 'smart-people', name: '按人物浏览', type: 'smart', items: generateMockPeople() }
  ]
}

/**
 * 从文件路径提取照片 UUID
 */
function extractPhotoUuidFromPath(path: string): string | null {
  // 假设路径格式: /path/to/photos/{UUID}/{filename}
  const match = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  return match ? match[1] : null
}

// ==================== 应用生命周期 ====================

app.whenReady().then(async () => {
  // 创建窗口前先初始化服务
  await initServices()
  setupIPCHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // 关闭数据库连接
  database?.close()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  database?.close()
})

// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason)
})
