import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { ICloudService } from '../services/iCloudService.js';
import { PhotoDatabase } from '../database/db.js';
import { SearchService } from '../services/searchService.js';
import { LocalPhotoService } from '../services/localPhotoService.js';
import { folderScanner } from '../services/folderScanner.js';
import { importService } from '../services/importService.js';
import { importProgressService } from '../services/importProgressService.js';
import { getEmbeddingService } from '../services/embeddingService.js';
import { VectorGenerationService } from '../services/vectorGenerationService.js';
import { SemanticSearchService } from '../services/semanticSearchService.js';
import { ConfigService, getConfigService } from '../services/configService.js';
import { thumbnailService } from '../services/thumbnailService.js';
import { suggestionService } from '../services/searchSuggestionService.js';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
let mainWindow = null;
let database = null;
let iCloudService = null;
let searchService = null;
let localPhotoService = null;
let configService = null;
let thumbnailSvc = null;
let suggestionSvc = null;
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || !process.env.NODE_ENV;
function getRendererPath() {
    if (isDev) {
        return 'http://localhost:5177';
    }
    return resolve(process.resourcesPath, 'renderer/index.html');
}
function getPreloadPath() {
    if (isDev) {
        return resolve(__dirname, '../preload/index.js');
    }
    return resolve(process.resourcesPath, 'preload/index.js');
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
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5177');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        mainWindow.loadFile(getRendererPath());
    }
    mainWindow.on('ready-to-show', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
async function initServices() {
    console.log('正在初始化服务...');
    try {
        configService = new ConfigService();
        console.log('✓ 配置服务初始化完成');
        database = new PhotoDatabase();
        await database.init();
        console.log('✓ 数据库初始化完成');
        searchService = new SearchService(database);
        console.log('✓ 搜索服务初始化完成');
        thumbnailSvc = thumbnailService;
        await thumbnailSvc.init();
        console.log('✓ 缩略图服务初始化完成');
        suggestionSvc = suggestionService;
        console.log('✓ 搜索建议服务初始化完成');
        if (database) {
            iCloudService = new ICloudService(database);
            const initialized = await iCloudService.initialize('');
            if (initialized) {
                console.log('✓ iCloud 服务初始化完成');
            }
            else {
                console.log('✓ iCloud 服务已就绪（使用模拟数据）');
            }
            localPhotoService = new LocalPhotoService(database);
            console.log('✓ 本地照片服务初始化完成');
        }
        console.log('所有服务初始化完成！');
    }
    catch (error) {
        console.error('服务初始化失败:', error);
    }
}
function setupIPCHandlers() {
    ipcMain.handle('icloud:select-library', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: '选择 iCloud Photos Library',
            defaultPath: `/Users/${process.env.USER}/Pictures/Photos Library.photoslibrary`
        });
        if (!result.canceled && result.filePaths.length > 0) {
            const libraryPath = result.filePaths[0];
            if (iCloudService) {
                await iCloudService.initialize(libraryPath);
            }
            return libraryPath;
        }
        return null;
    });
    ipcMain.handle('photos:get-list', async (event, options) => {
        try {
            const limit = options?.limit || 100;
            const offset = options?.offset || 0;
            console.log(`[IPC] photos:get-list - limit: ${limit}, offset: ${offset}`);
            if (localPhotoService) {
                const localPhotos = localPhotoService.getLocalPhotos(limit, offset);
                console.log(`[IPC] 从本地数据库获取 ${localPhotos.length} 张照片`);
                return localPhotos;
            }
            if (iCloudService) {
                return await iCloudService.getPhotos(limit, offset);
            }
            console.log('[IPC] 没有本地照片，返回空数组');
            return [];
        }
        catch (error) {
            console.error('[IPC] 获取照片列表失败:', error);
            return [];
        }
    });
    ipcMain.handle('photos:get-count', async () => {
        try {
            if (localPhotoService) {
                const count = localPhotoService.getPhotoCount();
                console.log(`[IPC] 照片总数: ${count}`);
                return { total: count };
            }
            return { total: 0 };
        }
        catch (error) {
            console.error('[IPC] 获取照片总数失败:', error);
            return { total: 0 };
        }
    });
    ipcMain.handle('photos:get-detail', async (event, photoId) => {
        try {
            if (!iCloudService) {
                return generateMockPhotos(1, parseInt(photoId) || 0)[0];
            }
            return await iCloudService.getPhotoDetail(photoId);
        }
        catch (error) {
            console.error('获取照片详情失败:', error);
            return null;
        }
    });
    ipcMain.handle('photos:search', async (event, query, filters) => {
        try {
            if (!searchService) {
                return { results: generateMockPhotos(10, 0), total: 10 };
            }
            return await searchService.search(query, filters);
        }
        catch (error) {
            console.error('搜索失败:', error);
            return { results: [], total: 0 };
        }
    });
    ipcMain.handle('albums:get-smart', async () => {
        try {
            if (!searchService) {
                return generateMockAlbums();
            }
            return await searchService.getSmartAlbums();
        }
        catch (error) {
            console.error('获取智能相册失败:', error);
            return [];
        }
    });
    ipcMain.handle('people:get-all', async () => {
        try {
            if (!database) {
                return generateMockPeople();
            }
            return database.getAllPersons();
        }
        catch (error) {
            console.error('获取人物列表失败:', error);
            return [];
        }
    });
    ipcMain.handle('people:add', async (event, person) => {
        try {
            if (!database)
                return -1;
            return database.addPerson(person);
        }
        catch (error) {
            console.error('添加人物失败:', error);
            return -1;
        }
    });
    ipcMain.handle('people:search', async (event, query) => {
        try {
            if (!searchService) {
                return generateMockPeople().filter(p => p.name.includes(query) || p.display_name?.includes(query));
            }
            return await searchService.searchPeople(query);
        }
        catch (error) {
            console.error('搜索人物失败:', error);
            return [];
        }
    });
    ipcMain.handle('people:search-photos', async (event, personName) => {
        try {
            if (!searchService) {
                return { results: generateMockPhotos(10, 0), total: 10 };
            }
            return await searchService.searchByPerson(personName);
        }
        catch (error) {
            console.error('根据人物搜索照片失败:', error);
            return { results: [], total: 0 };
        }
    });
    ipcMain.handle('places:get-all', async () => {
        try {
            if (!database) {
                return generateMockPlaces();
            }
            return database.getAllPlaces();
        }
        catch (error) {
            console.error('获取地点列表失败:', error);
            return [];
        }
    });
    ipcMain.handle('timeline:get', async (event, year) => {
        try {
            if (!database) {
                return generateMockPhotos(20, year ? year * 10 : 0);
            }
            return database.getPhotosByYear(year || new Date().getFullYear());
        }
        catch (error) {
            console.error('获取时间线失败:', error);
            return [];
        }
    });
    ipcMain.handle('sync:start', async () => {
        try {
            if (!iCloudService) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return 100;
            }
            return await iCloudService.syncAll();
        }
        catch (error) {
            console.error('同步失败:', error);
            return 0;
        }
    });
    ipcMain.handle('sync:get-progress', async () => {
        return { current: 0, total: 0, status: 'idle' };
    });
    ipcMain.handle('local:select-folder', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'multiSelections'],
            title: '选择要导入的照片文件夹',
            buttonLabel: '选择文件夹'
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths;
        }
        return [];
    });
    ipcMain.handle('local:import-folder', async (event, folderPath) => {
        try {
            if (!localPhotoService) {
                throw new Error('本地照片服务未初始化');
            }
            localPhotoService.onProgress((progress) => {
                event.sender.send('local:import-progress', progress);
            });
            const result = await localPhotoService.importFolder(folderPath);
            return {
                success: true,
                imported: result.imported,
                errors: result.errors
            };
        }
        catch (error) {
            console.error('导入照片失败:', error);
            return {
                success: false,
                error: error.message,
                imported: 0,
                errors: 1
            };
        }
    });
    ipcMain.handle('local:import-photo', async (event, filePath) => {
        try {
            if (!localPhotoService) {
                throw new Error('本地照片服务未初始化');
            }
            const photo = await localPhotoService.importPhoto(filePath);
            return photo;
        }
        catch (error) {
            console.error('导入单张照片失败:', error);
            return null;
        }
    });
    ipcMain.handle('local:get-count', async () => {
        try {
            if (!localPhotoService) {
                return 0;
            }
            return localPhotoService.getPhotoCount();
        }
        catch (error) {
            return 0;
        }
    });
    ipcMain.handle('import:scan-folder', async (_, folderPath) => {
        try {
            console.log(`[IPC] 扫描文件夹: ${folderPath}`);
            const files = await folderScanner.scanFolder(folderPath);
            console.log(`[IPC] 找到 ${files.length} 个文件`);
            return files;
        }
        catch (error) {
            console.error('[IPC] 扫描文件夹失败:', error);
            return [];
        }
    });
    ipcMain.handle('import:start', async (event, folderPath, options) => {
        try {
            console.log(`[IPC] 开始导入: ${folderPath}`);
            const unsubscribe = importProgressService.subscribe((progress) => {
                event.sender.send('import:progress', progress);
            });
            importService.onProgress((progress) => {
                event.sender.send('import:progress', progress);
            });
            const result = await importService.importFromFolder(folderPath, options);
            unsubscribe();
            console.log(`[IPC] 导入完成: 成功 ${result.imported}, 跳过 ${result.skipped}, 失败 ${result.failed}`);
            return result;
        }
        catch (error) {
            console.error('[IPC] 导入失败:', error);
            return {
                success: false,
                imported: 0,
                skipped: 0,
                failed: 0,
                errors: [{ file: folderPath, error: error.message }],
                duration: 0
            };
        }
    });
    ipcMain.handle('import:cancel', async () => {
        console.log('[IPC] 收到取消导入信号');
        importService.cancel();
        importProgressService.cancel();
        return { success: true };
    });
    ipcMain.handle('import:get-progress', async () => {
        const progress = importProgressService.getProgress();
        return {
            isImporting: importService.getIsImporting(),
            progress: progress || null
        };
    });
    ipcMain.handle('embedding:initialize', async () => {
        console.log('[IPC] 收到 embedding:initialize 请求');
        try {
            const embeddingService = getEmbeddingService();
            await embeddingService.initialize();
            const status = embeddingService.getModelStatus();
            return { success: true, status };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    ipcMain.handle('embedding:get-status', async () => {
        const embeddingService = getEmbeddingService();
        return embeddingService.getModelStatus();
    });
    ipcMain.handle('embedding:text-to-vector', async (_, text) => {
        const embeddingService = getEmbeddingService();
        return await embeddingService.textToEmbedding(text);
    });
    ipcMain.handle('embedding:image-to-vector', async (_, imagePath) => {
        const embeddingService = getEmbeddingService();
        const result = await embeddingService.imageToEmbedding(imagePath);
        if (result.success && result.vector && database) {
            const photoUuid = extractPhotoUuidFromPath(imagePath);
            if (photoUuid) {
                await database.saveEmbedding(photoUuid, result.vector, 'image');
            }
        }
        return result;
    });
    ipcMain.handle('embedding:generate-all', async (event) => {
        console.log('[IPC] 开始批量生成嵌入向量');
        if (!database) {
            return { success: false, error: 'Database not initialized', successCount: 0, failedCount: 0, total: 0, errors: [], cancelled: false };
        }
        const vectorService = new VectorGenerationService(database);
        try {
            const result = await vectorService.generateAll({
                onProgress: (progress) => {
                    event.sender.send('embedding:progress', progress);
                }
            });
            return { success: true, successCount: result.success, failedCount: result.failed, total: result.total, errors: result.errors, cancelled: result.cancelled };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error), successCount: 0, failedCount: 0, total: 0, errors: [], cancelled: false };
        }
    });
    ipcMain.handle('embedding:generate-one', async (_, photoUuid) => {
        if (!database) {
            return { success: false, error: 'Database not initialized' };
        }
        const vectorService = new VectorGenerationService(database);
        try {
            const success = await vectorService.generateOne(photoUuid);
            return { success };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    ipcMain.handle('embedding:cancel', async () => {
        const vectorService = new VectorGenerationService();
        vectorService.cancel();
        return { success: true };
    });
    ipcMain.handle('embedding:get-status', async () => {
        const vectorService = new VectorGenerationService();
        return vectorService.getStatus();
    });
    ipcMain.handle('search:preprocess', async (_, text) => {
        const { textPreprocessor } = await import('../services/textPreprocessor.js');
        return textPreprocessor.preprocess(text);
    });
    ipcMain.handle('search:text-to-vector', async (_, text) => {
        const { textVectorService } = await import('../services/textVectorService.js');
        return await textVectorService.textToVector(text);
    });
    ipcMain.handle('search:semantic', async (_, query, options) => {
        try {
            const { textVectorService } = await import('../services/textVectorService.js');
            const { similarityService } = await import('../services/similarityService.js');
            const { textPreprocessor } = await import('../services/textPreprocessor.js');
            const processed = textPreprocessor.preprocess(query);
            const textResult = await textVectorService.textToVector(query);
            if (!textResult.vector) {
                return { success: false, error: 'Failed to generate vector', results: [] };
            }
            const getEmbeddings = async () => {
                if (!database)
                    return [];
                return await database.getAllEmbeddings('image');
            };
            const results = await similarityService.semanticSearch(textResult.vector, getEmbeddings, options);
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
            };
        }
        catch (error) {
            console.error('[IPC] 语义搜索失败:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error), results: [] };
        }
    });
    ipcMain.handle('search:clear-cache', async () => {
        const { textVectorService } = await import('../services/textVectorService.js');
        textVectorService.clearCache();
        return { success: true };
    });
    ipcMain.handle('search:get-cache-stats', async () => {
        const { textVectorService } = await import('../services/textVectorService.js');
        return textVectorService.getCacheStats();
    });
    ipcMain.handle('search:semantic', async (_, options) => {
        try {
            if (!database) {
                return { success: false, error: 'Database not initialized', results: [] };
            }
            const searchService = new SemanticSearchService(database);
            const result = await searchService.search(options);
            const { searchResultFormatter } = await import('../services/searchResultFormatter.js');
            const formattedResults = searchResultFormatter.formatBatch(result.results);
            const summary = searchResultFormatter.formatSummary(result);
            return {
                success: true,
                ...summary,
                results: formattedResults
            };
        }
        catch (error) {
            console.error('[IPC] 语义搜索失败:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error), results: [] };
        }
    });
    ipcMain.handle('search:quick', async (_, query, topK = 10) => {
        try {
            if (!database)
                return [];
            const searchService = new SemanticSearchService(database);
            return await searchService.quickSearch(query, topK);
        }
        catch (error) {
            console.error('[IPC] 快速搜索失败:', error);
            return [];
        }
    });
    ipcMain.handle('search:multi', async (_, queries, options) => {
        try {
            if (!database) {
                return { success: false, error: 'Database not initialized', results: [] };
            }
            const searchService = new SemanticSearchService(database);
            const result = await searchService.multiQuerySearch(queries, options);
            return {
                success: true,
                total: result.total,
                results: result.results
            };
        }
        catch (error) {
            console.error('[IPC] 多查询搜索失败:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error), results: [] };
        }
    });
    ipcMain.handle('config:get', async () => {
        try {
            const configService = getConfigService();
            return configService.getConfig();
        }
        catch (error) {
            console.error('获取配置失败:', error);
            return null;
        }
    });
    ipcMain.handle('config:set-api-key', async (event, apiKey) => {
        try {
            const configService = getConfigService();
            configService.setApiKey(apiKey);
            return { success: true };
        }
        catch (error) {
            console.error('设置 API Key 失败:', error);
            return { success: false, error: error.message };
        }
    });
    ipcMain.handle('config:get-llm-status', async () => {
        try {
            const configService = getConfigService();
            const config = configService.getLLMConfig();
            return {
                configured: configService.isLLMConfigured(),
                provider: config.provider,
                hasApiKey: !!config.apiKey
            };
        }
        catch (error) {
            console.error('获取 LLM 状态失败:', error);
            return { configured: false, provider: 'none', hasApiKey: false };
        }
    });
    ipcMain.handle('config:set-theme', async (event, theme) => {
        try {
            const configService = getConfigService();
            configService.setTheme(theme);
            return { success: true };
        }
        catch (error) {
            console.error('设置主题失败:', error);
            return { success: false, error: error.message };
        }
    });
    ipcMain.handle('suggestions:get', async (event, query) => {
        try {
            const suggestions = suggestionService?.getSuggestions(query) || [];
            return suggestions;
        }
        catch (error) {
            console.error('获取搜索建议失败:', error);
            return [];
        }
    });
    ipcMain.handle('suggestions:add-history', async (event, query, resultCount) => {
        try {
            suggestionService?.addToHistory(query, resultCount);
            return { success: true };
        }
        catch (error) {
            console.error('添加搜索历史失败:', error);
            return { success: false };
        }
    });
    ipcMain.handle('suggestions:get-history', async () => {
        try {
            return suggestionService?.getHistory() || [];
        }
        catch (error) {
            console.error('获取搜索历史失败:', error);
            return [];
        }
    });
    ipcMain.handle('suggestions:clear-history', async () => {
        try {
            suggestionService?.clearHistory();
            return { success: true };
        }
        catch (error) {
            console.error('清空搜索历史失败:', error);
            return { success: false };
        }
    });
    ipcMain.handle('suggestions:get-popular', async () => {
        try {
            return suggestionService?.getPopularSearches() || [];
        }
        catch (error) {
            console.error('获取热门搜索失败:', error);
            return [];
        }
    });
    ipcMain.handle('app:get-version', () => {
        return app.getVersion();
    });
    ipcMain.handle('window:minimize', () => {
        mainWindow?.minimize();
    });
    ipcMain.handle('window:maximize', () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            }
            else {
                mainWindow.maximize();
            }
        }
    });
    ipcMain.handle('window:close', () => {
        mainWindow?.close();
    });
    console.log('IPC 处理程序已注册');
}
function generateMockPhotos(limit, offset) {
    const photos = [];
    const locations = [
        { name: '日本东京', lat: 35.6762, lng: 139.6503 },
        { name: '新疆乌鲁木齐', lat: 43.8256, lng: 87.6168 },
        { name: '北京', lat: 39.9042, lng: 116.4074 },
        { name: '上海', lat: 31.2304, lng: 121.4737 },
        { name: '家里', lat: 39.9042, lng: 116.4074 }
    ];
    for (let i = offset; i < offset + limit; i++) {
        const year = 2015 + Math.floor(i / 100);
        const month = (i % 12) + 1;
        const day = (i % 28) + 1;
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
        });
    }
    return photos;
}
function generateMockPeople() {
    return [
        { id: 1, name: '爸爸', face_count: 156 },
        { id: 2, name: '妈妈', face_count: 142 },
        { id: 3, name: '儿子', face_count: 89 },
        { id: 4, name: '我', face_count: 234 },
        { id: 5, name: '爷爷奶奶', face_count: 67 }
    ];
}
function generateMockPlaces() {
    return [
        { place_name: '日本东京', photo_count: 245 },
        { place_name: '新疆', photo_count: 189 },
        { place_name: '北京', photo_count: 156 },
        { place_name: '上海', photo_count: 98 },
        { place_name: '家里', photo_count: 423 }
    ];
}
function generateMockAlbums() {
    return [
        { id: 'smart-places', name: '按地点浏览', type: 'smart', items: generateMockPlaces() },
        { id: 'smart-people', name: '按人物浏览', type: 'smart', items: generateMockPeople() }
    ];
}
function extractPhotoUuidFromPath(path) {
    const match = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return match ? match[1] : null;
}
app.whenReady().then(async () => {
    await initServices();
    setupIPCHandlers();
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on('window-all-closed', () => {
    database?.close();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('before-quit', () => {
    database?.close();
});
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的 Promise 拒绝:', reason);
});
//# sourceMappingURL=index.js.map