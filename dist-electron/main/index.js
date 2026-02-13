import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from 'electron';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { ICloudService } from '../services/iCloudService.js';
import { PhotoDatabase } from '../database/db.js';
import { SearchService } from '../services/searchService.js';
import { LocalPhotoService } from '../services/localPhotoService.js';
import { folderScanner } from '../services/folderScanner.js';
import { importService, initializeImportService } from '../services/importService.js';
import { importProgressService } from '../services/importProgressService.js';
import { VectorGenerationService } from '../services/vectorGenerationService.js';
import { SemanticSearchService } from '../services/semanticSearchService.js';
import { ConfigService, getConfigService } from '../services/configService.js';
import { thumbnailService } from '../services/thumbnailService.js';
import { suggestionService } from '../services/searchSuggestionService.js';
import { initializeScanJobService, scanJobService } from '../services/scanJobService.js';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
global.activeScanJob = null;
let mainWindow = null;
let database = null;
let iCloudService = null;
let searchService = null;
let localPhotoService = null;
let configService = null;
let thumbnailSvc = null;
let suggestionSvc = null;
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || !process.env.NODE_ENV;
function registerLocalResourceProtocol() {
    protocol.registerFileProtocol('local-resource', (request, callback) => {
        try {
            const url = request.url.replace(/^local-resource:\/\//, '');
            const decodedUrl = decodeURIComponent(url);
            callback(decodedUrl);
        }
        catch (error) {
            console.error('Failed to handle local-resource protocol request:', error);
            callback('');
        }
    });
    console.log('✓ 自定义协议 local-resource:// 已注册');
}
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
    const cspPolicy = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        'img-src': ["'self'", "data:", "blob:", "https:", "local-resource:"],
        'font-src': ["'self'", "https://fonts.gstatic.com"],
        'connect-src': ["'self'", "http://localhost:*", "https://huggingface.co", "https://cdn.jsdelivr.net"]
    };
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
            webSecurity: true,
            allowRunningInsecureContent: false
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
        mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
            callback({ requestHeaders: details.requestHeaders });
        });
    }
    else {
        mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
            const cspHeader = Object.entries(cspPolicy)
                .map(([key, values]) => `${key} ${values.join(' ')}`)
                .join('; ');
            callback({
                requestHeaders: {
                    ...details.requestHeaders,
                    'Content-Security-Policy': cspHeader
                }
            });
        });
    }
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
            localPhotoService = new LocalPhotoService(database, thumbnailSvc);
            console.log('✓ 本地照片服务初始化完成');
            initializeImportService(database);
            console.log('✓ 导入服务初始化完成');
            initializeScanJobService(database);
            console.log('✓ 扫描任务服务初始化完成');
        }
        console.log('所有服务初始化完成！');
    }
    catch (error) {
        console.error('服务初始化失败:', error);
    }
}
async function checkAndRecoverScanJob() {
    if (!scanJobService) {
        console.log('[Main] ScanJobService not available, skipping recovery check');
        return;
    }
    const activeJob = scanJobService.getActiveJob();
    if (!activeJob) {
        console.log('[Main] No active scan job to recover');
        global.activeScanJob = null;
        return;
    }
    console.log('[Main] Found active scan job:', activeJob.id, 'status:', activeJob.status);
    if (scanJobService.isJobStale(activeJob)) {
        console.log('[Main] Scan job is stale (>5min no heartbeat), marking as failed');
        scanJobService.markJobAsFailed(activeJob.id);
        global.activeScanJob = null;
    }
    else {
        console.log('[Main] Scan job is still active (<5min), can be resumed');
        global.activeScanJob = activeJob;
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
            console.log(`[IPC] localPhotoService 可用: ${!!localPhotoService}`);
            if (localPhotoService) {
                try {
                    const localPhotos = localPhotoService.getLocalPhotos(limit, offset);
                    console.log(`[IPC] 从本地数据库获取 ${localPhotos.length} 张照片`);
                    console.log(`[IPC] 前3张照片:`, localPhotos.slice(0, 3));
                    return localPhotos;
                }
                catch (innerError) {
                    console.error('[IPC] getLocalPhotos 失败:', innerError);
                    return [];
                }
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
    ipcMain.handle('photos:get-without-embeddings', async (event, limit = 100) => {
        try {
            if (localPhotoService) {
                const photos = localPhotoService.getPhotosWithoutEmbeddings(limit);
                return { success: true, photos };
            }
            return { success: false, photos: [], error: 'localPhotoService not available' };
        }
        catch (error) {
            console.error('[IPC] 获取无向量照片失败:', error);
            return { success: false, photos: [], error: String(error) };
        }
    });
    ipcMain.handle('photos:save-embedding', async (event, photoUuid, vector) => {
        try {
            if (database) {
                await database.saveEmbedding(photoUuid, vector, 'image');
                return { success: true };
            }
            return { success: false, error: 'Database not available' };
        }
        catch (error) {
            console.error('[IPC] 保存向量失败:', error);
            return { success: false, error: String(error) };
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
    ipcMain.handle('photos:delete', async (event, photoId) => {
        try {
            console.log(`[IPC] 删除照片: ${photoId}`);
            if (localPhotoService) {
                const success = localPhotoService.deletePhoto(photoId);
                if (success) {
                    console.log(`[IPC] 照片 ${photoId} 已从本地数据库删除`);
                    return { success: true };
                }
            }
            if (iCloudService && 'deletePhoto' in iCloudService) {
                const success = await iCloudService.deletePhoto(photoId);
                return { success };
            }
            console.warn('[IPC] 没有可用的照片服务，无法删除照片');
            return { success: false, error: '没有可用的照片服务' };
        }
        catch (error) {
            console.error('[IPC] 删除照片失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('photos:export', async (event, params) => {
        try {
            const { photoId, filePath, exportPath } = params;
            console.log(`[IPC] 导出照片: ${photoId} -> ${exportPath}`);
            const result = await dialog.showSaveDialog({
                title: '选择导出位置',
                defaultPath: exportPath,
                buttonLabel: '保存'
            });
            if (result.canceled) {
                return { success: false, error: '用户取消导出' };
            }
            const targetPath = result.filePath;
            if (!targetPath) {
                return { success: false, error: '未选择导出路径' };
            }
            const fs = await import('fs');
            if (!fs.existsSync(filePath)) {
                console.error(`[IPC] 源文件不存在: ${filePath}`);
                return { success: false, error: '源文件不存在' };
            }
            fs.copyFileSync(filePath, targetPath);
            console.log(`[IPC] 照片已导出到: ${targetPath}`);
            return { success: true, exportPath: targetPath };
        }
        catch (error) {
            console.error('[IPC] 导出照片失败:', error);
            return { success: false, error: String(error) };
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
    ipcMain.handle('albums:refresh', async () => {
        try {
            console.log('[IPC] 收到相册刷新请求');
            return { success: true, message: 'Albums refreshed' };
        }
        catch (error) {
            console.error('刷新相册失败:', error);
            return { success: false, error: String(error) };
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
    ipcMain.handle('people:search-simple', async (event, query) => {
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
    ipcMain.handle('people:update', async (event, id, person) => {
        try {
            const { personService } = await import('../services/personService.js');
            const success = personService.updatePerson(id, person);
            return { success };
        }
        catch (error) {
            console.error('[IPC] 更新人物失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('people:delete', async (event, id) => {
        try {
            const { personService } = await import('../services/personService.js');
            const success = personService.deletePerson(id);
            return { success };
        }
        catch (error) {
            console.error('[IPC] 删除人物失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('people:tag', async (event, params) => {
        try {
            const { personService } = await import('../services/personService.js');
            const result = personService.tagPerson(params);
            return result;
        }
        catch (error) {
            console.error('[IPC] 标记人物失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('people:untag', async (event, photoId, personId) => {
        try {
            const { personService } = await import('../services/personService.js');
            const success = personService.untagPerson(photoId, personId);
            return { success };
        }
        catch (error) {
            console.error('[IPC] 移除标签失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('people:get-photo-tags', async (event, photoId) => {
        try {
            const { personService } = await import('../services/personService.js');
            return personService.getPhotoTags(photoId);
        }
        catch (error) {
            console.error('[IPC] 获取照片标签失败:', error);
            return [];
        }
    });
    ipcMain.handle('people:get-person-photos', async (event, personId) => {
        try {
            const { personService } = await import('../services/personService.js');
            return personService.getPersonPhotos(personId);
        }
        catch (error) {
            console.error('[IPC] 获取人物照片失败:', error);
            return [];
        }
    });
    ipcMain.handle('people:get-stats', async () => {
        try {
            const { personService } = await import('../services/personService.js');
            return personService.getStats();
        }
        catch (error) {
            console.error('[IPC] 获取统计失败:', error);
            return { totalPersons: 0, totalTags: 0 };
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
            if (!importService) {
                throw new Error('导入服务未初始化');
            }
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
        importService?.cancel();
        importProgressService.cancel();
        return { success: true };
    });
    ipcMain.handle('import:get-progress', async () => {
        const progress = importProgressService.getProgress();
        return {
            isImporting: importService?.getIsImporting() || false,
            progress: progress || null
        };
    });
    ipcMain.handle('embedding:initialize', async () => {
        console.log('[IPC] 收到 embedding:initialize 请求');
        const { BrowserWindow } = require('electron');
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            windows[0].webContents.executeJavaScript(`
        if (window.embeddingAPI && window.embeddingAPI.initialize) {
          window.embeddingAPI.initialize()
        } else {
          Promise.reject(new Error('Embedding API not available'))
        }
      `).then((result) => {
                console.log('[IPC] 渲染进程模型初始化结果:', result);
            }).catch((error) => {
                console.error('[IPC] 渲染进程模型初始化失败:', error);
            });
        }
        return { success: true, message: '初始化请求已发送到渲染进程' };
    });
    ipcMain.handle('embedding:get-status', async () => {
        const { BrowserWindow } = require('electron');
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            try {
                const status = await windows[0].webContents.executeJavaScript(`
          if (window.embeddingAPI && window.embeddingAPI.getStatus) {
            window.embeddingAPI.getStatus()
          } else {
            null
          }
        `);
                if (status) {
                    return status;
                }
            }
            catch (error) {
                console.error('[IPC] 获取模型状态失败:', error);
            }
        }
        return { loaded: false, modelName: 'Xenova/clip-vit-base-patch32', rendererAvailable: false };
    });
    ipcMain.handle('embedding:text-to-vector', async (_, text) => {
        const { BrowserWindow } = require('electron');
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            try {
                const result = await windows[0].webContents.executeJavaScript(`
          if (window.embeddingAPI && window.embeddingAPI.textToEmbedding) {
            JSON.stringify(window.embeddingAPI.textToEmbedding(\`${text.replace(/`/g, '\\`')}\`))
          } else {
            '{"success":false,"error":"Embedding API not available"}'
          }
        `);
                return JSON.parse(result);
            }
            catch (error) {
                console.error('[IPC] 文本转向量失败:', error);
                return { success: false, error: String(error), processingTimeMs: 0 };
            }
        }
        return { success: false, error: 'No renderer window available', processingTimeMs: 0 };
    });
    ipcMain.handle('embedding:image-to-vector', async (_, imagePath) => {
        const { BrowserWindow } = require('electron');
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            try {
                const result = await windows[0].webContents.executeJavaScript(`
          if (window.embeddingAPI && window.embeddingAPI.imageToEmbedding) {
            JSON.stringify(window.embeddingAPI.imageToEmbedding(\`${imagePath.replace(/`/g, '\\`')}\`))
          } else {
            '{"success":false,"error":"Embedding API not available"}'
          }
        `);
                const parsed = JSON.parse(result);
                if (parsed.success && parsed.vector && database) {
                    const photoUuid = extractPhotoUuidFromPath(imagePath);
                    if (photoUuid) {
                        try {
                            await database.saveEmbedding(photoUuid, parsed.vector, 'image');
                            console.log(`[IPC] 向量已保存: ${photoUuid}`);
                        }
                        catch (error) {
                            console.error('[IPC] 保存向量失败:', error);
                        }
                    }
                }
                return parsed;
            }
            catch (error) {
                console.error('[IPC] 图片转向量失败:', error);
                return { success: false, error: String(error), processingTimeMs: 0 };
            }
        }
        return { success: false, error: 'No renderer window available', processingTimeMs: 0 };
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
    ipcMain.handle('embedding:get-generation-status', async () => {
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
    ipcMain.handle('search:semantic-legacy', async (_, query, options) => {
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
    ipcMain.handle('query:parse', async (_, query) => {
        try {
            const { queryParserService } = await import('../services/queryParserService.js');
            return await queryParserService.parse(query);
        }
        catch (error) {
            console.error('[IPC] 查询解析失败:', error);
            return null;
        }
    });
    ipcMain.handle('query:clear-cache', async () => {
        try {
            const { queryParserService } = await import('../services/queryParserService.js');
            queryParserService.clearCache();
            return { success: true };
        }
        catch (error) {
            console.error('[IPC] 清除查询缓存失败:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    ipcMain.handle('query:get-cache-stats', async () => {
        try {
            const { queryParserService } = await import('../services/queryParserService.js');
            return queryParserService.getCacheStats();
        }
        catch (error) {
            console.error('[IPC] 获取缓存统计失败:', error);
            return null;
        }
    });
    ipcMain.handle('search:keyword', async (_, options) => {
        try {
            const { keywordSearchService } = await import('../services/keywordSearchService.js');
            return await keywordSearchService.search(options);
        }
        catch (error) {
            console.error('[IPC] 关键词搜索失败:', error);
            return { results: [], total: 0, query: options.query };
        }
    });
    ipcMain.handle('search:keyword-quick', async (_, query, limit = 20) => {
        try {
            const { keywordSearchService } = await import('../services/keywordSearchService.js');
            return await keywordSearchService.quickSearch(query, limit);
        }
        catch (error) {
            console.error('[IPC] 快速搜索失败:', error);
            return [];
        }
    });
    ipcMain.handle('search:suggestions', async (_, query, limit = 10) => {
        try {
            const { keywordSearchService } = await import('../services/keywordSearchService.js');
            return keywordSearchService.getSuggestions(query, limit);
        }
        catch (error) {
            console.error('[IPC] 获取搜索建议失败:', error);
            return [];
        }
    });
    ipcMain.handle('search:global', async (_, options) => {
        try {
            const { globalSearchService } = await import('../services/globalSearchService.js');
            return await globalSearchService.search(options);
        }
        catch (error) {
            console.error('[IPC] 全局搜索失败:', error);
            return {
                results: [],
                total: 0,
                page: 1,
                pageSize: 20,
                processingTimeMs: 0,
                query: { original: options.query, processed: '', vectorDimension: 0 }
            };
        }
    });
    ipcMain.handle('search:global-quick', async (_, query, topK = 10) => {
        try {
            const { globalSearchService } = await import('../services/globalSearchService.js');
            return await globalSearchService.quickSearch(query, topK);
        }
        catch (error) {
            console.error('[IPC] 快速搜索失败:', error);
            return [];
        }
    });
    ipcMain.handle('search:similar', async (_, photoUuid, topK = 10) => {
        try {
            const { globalSearchService } = await import('../services/globalSearchService.js');
            return await globalSearchService.findSimilarPhotos(photoUuid, topK);
        }
        catch (error) {
            console.error('[IPC] 相似照片搜索失败:', error);
            return [];
        }
    });
    ipcMain.handle('search:batch', async (_, queries, options) => {
        try {
            const { globalSearchService } = await import('../services/globalSearchService.js');
            return await globalSearchService.batchSearch(queries, options);
        }
        catch (error) {
            console.error('[IPC] 批量搜索失败:', error);
            return [];
        }
    });
    ipcMain.handle('search:hybrid', async (_, options) => {
        try {
            const { resultMergeService } = await import('../services/resultMergeService.js');
            return await resultMergeService.search(options);
        }
        catch (error) {
            console.error('[IPC] 混合搜索失败:', error);
            return {
                results: [],
                total: 0,
                query: options.query,
                processingTimeMs: 0,
                stats: { keywordCount: 0, semanticCount: 0, mergedCount: 0 }
            };
        }
    });
    ipcMain.handle('search:hybrid-intent', async (_, query) => {
        try {
            const { resultMergeService } = await import('../services/resultMergeService.js');
            return await resultMergeService.searchWithIntent(query);
        }
        catch (error) {
            console.error('[IPC] 带意图搜索失败:', error);
            return {
                results: [],
                total: 0,
                query,
                processingTimeMs: 0,
                stats: { keywordCount: 0, semanticCount: 0, mergedCount: 0 }
            };
        }
    });
    ipcMain.handle('search:reorder', async (_, results, sortBy) => {
        try {
            const { resultMergeService } = await import('../services/resultMergeService.js');
            return resultMergeService.reorderResults(results, sortBy);
        }
        catch (error) {
            console.error('[IPC] 重新排序失败:', error);
            return results;
        }
    });
    ipcMain.handle('face:load-models', async () => {
        try {
            const { faceDetectionService } = await import('../services/faceDetectionService.js');
            return await faceDetectionService.loadModels();
        }
        catch (error) {
            console.error('[IPC] 加载模型失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('face:get-status', async () => {
        try {
            const { faceDetectionService } = await import('../services/faceDetectionService.js');
            return faceDetectionService.getModelStatus();
        }
        catch (error) {
            return { loaded: false, modelsPath: '', configured: false };
        }
    });
    ipcMain.handle('face:detect', async (_, imagePath) => {
        try {
            const { faceDetectionService } = await import('../services/faceDetectionService.js');
            return await faceDetectionService.detect(imagePath);
        }
        catch (error) {
            return { success: false, detections: [], error: String(error), processingTimeMs: 0 };
        }
    });
    ipcMain.handle('face:detect-batch', async (event, imagePaths) => {
        try {
            const { faceDetectionService } = await import('../services/faceDetectionService.js');
            const result = await faceDetectionService.detectBatch(imagePaths, {}, (progress) => {
                event.sender.send('face:progress', progress);
            });
            return {
                success: true,
                totalDetected: result.totalDetected,
                processingTimeMs: result.processingTimeMs
            };
        }
        catch (error) {
            console.error('[IPC] 批量检测失败:', error);
            return { success: false, totalDetected: 0, processingTimeMs: 0, error: String(error) };
        }
    });
    ipcMain.handle('face:cancel', async () => {
        try {
            const { faceDetectionService } = await import('../services/faceDetectionService.js');
            faceDetectionService.cancel();
            return { success: true };
        }
        catch (error) {
            return { success: false };
        }
    });
    ipcMain.handle('face:scan-all', async (event) => {
        try {
            console.log('[IPC] face:scan-all 被触发');
            if (mainWindow) {
                mainWindow.webContents.send('face:status', { stage: 'started', message: '开始扫描...' });
            }
            if (!database) {
                const err = '数据库未初始化';
                console.error('[IPC]', err);
                if (mainWindow) {
                    mainWindow.webContents.send('face:status', { stage: 'error', error: err });
                }
                return { success: false, count: 0, error: err };
            }
            const { FaceDetectionQueue, faceDetectionQueue: existingQueue } = await import('../services/faceDetectionQueue.js');
            const queue = new FaceDetectionQueue(database, {
                maxConcurrent: 1,
                onProgress: (progress) => {
                    if (mainWindow) {
                        const stats = queue.getStats();
                        const percent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                        console.log(`[IPC] 📊 队列进度: ${stats.completed}/${stats.total} (${percent}%)`);
                        mainWindow.webContents.send('face:progress', {
                            current: stats.completed,
                            total: stats.total,
                            percent: percent,
                            status: progress.status
                        });
                    }
                },
                onComplete: (stats) => {
                    console.log(`[IPC] 🎉 人脸检测完成: ${stats.completed}/${stats.total}, 检测到 ${stats.detectedFaces} 张人脸`);
                    if (mainWindow) {
                        mainWindow.webContents.send('face:scan-complete', {
                            total: stats.total,
                            completed: stats.completed,
                            failed: stats.failed,
                            detectedFaces: stats.detectedFaces
                        });
                        mainWindow.webContents.send('face:status', {
                            stage: 'completed',
                            total: stats.total,
                            detectedFaces: stats.detectedFaces,
                            message: `扫描完成，共 ${stats.completed} 张照片，检测到 ${stats.detectedFaces} 张人脸`
                        });
                    }
                }
            });
            const prevStatus = queue.getDetailedStatus();
            console.log(`[IPC] 之前队列状态: isRunning=${prevStatus.isRunning}, queueLength=${prevStatus.queueLength}`);
            if (prevStatus.isRunning) {
                console.log('[IPC] 检测到队列卡住，强制重置...');
                queue.forceReset();
            }
            const totalPhotos = database.query('SELECT COUNT(*) as cnt FROM photos WHERE file_path IS NOT NULL');
            const processedPhotos = database.query('SELECT COUNT(DISTINCT p.id) as cnt FROM photos p JOIN detected_faces df ON p.id = df.photo_id WHERE p.file_path IS NOT NULL');
            console.log(`[IPC] 数据库统计: 总数=${totalPhotos[0]?.cnt}, 已处理=${processedPhotos[0]?.cnt}`);
            const unprocessedLimit = 1000;
            const photos = database.getUnprocessedPhotos(unprocessedLimit);
            console.log(`[IPC] getUnprocessedPhotos(${unprocessedLimit}) 返回: ${photos.length} 张`);
            if (mainWindow) {
                mainWindow.webContents.send('face:status', {
                    stage: 'queued',
                    total: photos.length,
                    message: `已添加 ${photos.length} 张照片到扫描队列`
                });
            }
            if (photos.length === 0) {
                if (mainWindow) {
                    mainWindow.webContents.send('face:status', { stage: 'completed', message: '没有需要处理的照片' });
                }
                return { success: true, count: 0, message: '没有需要处理的照片' };
            }
            const jobId = queue.startScanJob(photos.length);
            console.log(`[IPC] 创建扫描任务: ${jobId}`);
            let processed = 0;
            const totalPhotosToProcess = photos.length;
            for (const photo of photos) {
                console.log(`[IPC] 添加照片到队列: ${photo.id} (${processed + 1}/${totalPhotosToProcess})`);
                await queue.addTask(photo.id.toString(), photo.uuid, photo.file_path);
                processed++;
                console.log(`[IPC] 已处理: ${processed}/${totalPhotosToProcess}`);
                if (mainWindow && processed % 1 === 0) {
                    const percent = Math.round((processed / totalPhotosToProcess) * 100);
                    console.log(`[IPC] 📊 发送进度: ${processed}/${totalPhotosToProcess} (${percent}%)`);
                    mainWindow.webContents.send('face:progress', {
                        current: processed,
                        total: totalPhotosToProcess,
                        percent: percent
                    });
                }
            }
            console.log(`[IPC] 已添加 ${processed} 张照片到队列`);
            console.log('[IPC] 调用 queue.forceStart() 启动处理引擎...');
            await queue.forceStart();
            console.log('[IPC] forceStart() 返回，等待队列处理完成...');
            await new Promise(resolve => setTimeout(resolve, 100));
            const finalStats = queue.getStats();
            const detectedFaces = queue.getTasks().reduce((sum, t) => sum + (t.faces || 0), 0);
            return { success: true, count: processed, detectedFaces, total: finalStats.total };
        }
        catch (error) {
            const errMsg = String(error);
            console.error('[IPC] 扫描失败:', error);
            if (mainWindow) {
                mainWindow.webContents.send('face:status', { stage: 'error', error: errMsg });
            }
            return { success: false, count: 0, error: errMsg };
        }
    });
    ipcMain.handle('face:get-queue-status', async () => {
        try {
            const { faceDetectionQueue } = await import('../services/faceDetectionQueue.js');
            return faceDetectionQueue.getDetailedStatus();
        }
        catch (error) {
            console.error('[IPC] 获取队列状态失败:', error);
            return null;
        }
    });
    ipcMain.handle('face:reset-queue', async () => {
        try {
            const { faceDetectionQueue } = await import('../services/faceDetectionQueue.js');
            const status = faceDetectionQueue.getDetailedStatus();
            faceDetectionQueue.forceReset();
            console.log('[IPC] 队列状态已强制重置');
            return { success: true, previousStatus: status };
        }
        catch (error) {
            console.error('[IPC] 重置队列失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('face:get-unnamed-faces', async (_, limit = 50) => {
        try {
            if (!database)
                return { faces: [], count: 0 };
            const faces = database.query(`
        SELECT df.id, df.photo_id, df.bbox_x, df.bbox_y, df.bbox_width, df.bbox_height,
               df.confidence, p.file_path, p.thumbnail_path
        FROM detected_faces df
        JOIN photos p ON df.photo_id = p.id
        WHERE df.person_id IS NULL
        ORDER BY df.confidence DESC
        LIMIT ?
      `, [limit]);
            const count = database.query('SELECT COUNT(*) as count FROM detected_faces WHERE person_id IS NULL')[0]?.count || 0;
            return {
                faces: faces.map((f) => ({
                    id: f.id,
                    photoId: f.photo_id,
                    bbox: { x: f.bbox_x, y: f.bbox_y, width: f.bbox_width, height: f.bbox_height },
                    confidence: f.confidence,
                    filePath: f.file_path,
                    thumbnailPath: f.thumbnail_path
                })),
                count
            };
        }
        catch (error) {
            console.error('[IPC] 获取未命名人脸失败:', error);
            return { faces: [], count: 0, error: String(error) };
        }
    });
    ipcMain.handle('diagnostic:face-stats', async () => {
        try {
            if (!database)
                return { error: '数据库未初始化' };
            const stats = {
                photos: database.query('SELECT COUNT(*) as count FROM photos')[0]?.count || 0,
                detectedFaces: database.query('SELECT COUNT(*) as count FROM detected_faces')[0]?.count || 0,
                persons: database.query('SELECT COUNT(*) as count FROM persons')[0]?.count || 0,
                faces: database.query('SELECT COUNT(*) as count FROM faces')[0]?.count || 0,
            };
            const withEmbedding = database.query(`
        SELECT COUNT(*) as count FROM detected_faces WHERE embedding IS NOT NULL
      `)[0]?.count || 0;
            const sample = database.query(`
        SELECT id, photo_id, confidence,
               CASE WHEN embedding IS NULL THEN 'NULL' ELSE '有数据' END as emb_status
        FROM detected_faces LIMIT 3
      `);
            console.log('[Diagnostic] 人脸检测统计:', { ...stats, withEmbedding });
            return { success: true, stats: { ...stats, withEmbedding }, sample };
        }
        catch (error) {
            console.error('[Diagnostic] 获取统计失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('diagnostic:clear-face-data', async () => {
        try {
            if (!database)
                return { error: '数据库未初始化' };
            console.log('[Diagnostic] 开始清理人脸数据...');
            database.run('DELETE FROM detected_faces');
            database.run('DELETE FROM faces');
            database.run('DELETE FROM persons');
            console.log('[Diagnostic] 人脸数据已清理');
            return { success: true, message: '所有人脸数据已清理' };
        }
        catch (error) {
            console.error('[Diagnostic] 清理数据失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('diagnostic:reset-person-links', async () => {
        try {
            if (!database)
                return { error: '数据库未初始化' };
            console.log('[Diagnostic] 重置人物关联...');
            database.run('UPDATE detected_faces SET person_id = NULL, processed = 0');
            database.run('DELETE FROM persons');
            console.log('[Diagnostic] 人物关联已重置');
            return { success: true, message: '人物关联已重置，可以重新聚类' };
        }
        catch (error) {
            console.error('[Diagnostic] 重置失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('diagnostic:query', async (_, sql) => {
        try {
            if (!database)
                return { error: '数据库未初始化' };
            const trimmedSql = sql.trim().toUpperCase();
            if (!trimmedSql.startsWith('SELECT')) {
                return { error: '只允许执行 SELECT 查询' };
            }
            const result = database.query(sql);
            return { success: true, result };
        }
        catch (error) {
            console.error('[Diagnostic] SQL查询失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('face:auto-match', async () => {
        try {
            const { faceMatchingService } = await import('../services/faceMatchingService.js');
            const unmatched = await faceMatchingService.getUnmatchedFaces();
            console.log(`[IPC] 未匹配人脸数量: ${unmatched.length}`);
            if (unmatched.length > 0) {
                console.log(`[IPC] 样本人脸 descriptor 长度: ${unmatched[0].descriptor?.length}`);
            }
            return await faceMatchingService.autoMatch();
        }
        catch (error) {
            console.error('[IPC] 自动匹配失败:', error);
            return { matched: 0, clusters: [], processingTimeMs: 0, message: '自动匹配失败' };
        }
    });
    ipcMain.handle('face:find-similar', async (_, faceId) => {
        try {
            const { faceMatchingService } = await import('../services/faceMatchingService.js');
            return await faceMatchingService.findSimilarFaces(faceId);
        }
        catch (error) {
            console.error('[IPC] 查找相似人脸失败:', error);
            return [];
        }
    });
    ipcMain.handle('face:create-person', async (_, cluster, personName) => {
        try {
            const { faceMatchingService } = await import('../services/faceMatchingService.js');
            return await faceMatchingService.createPersonFromCluster(cluster, personName);
        }
        catch (error) {
            console.error('[IPC] 创建人物失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('face:assign', async (_, faceIds, personId) => {
        try {
            const { faceMatchingService } = await import('../services/faceMatchingService.js');
            return await faceMatchingService.assignToPerson(faceIds, personId);
        }
        catch (error) {
            console.error('[IPC] 分配人脸失败:', error);
            return { success: false, assigned: 0, error: String(error) };
        }
    });
    ipcMain.handle('face:unmatch', async (_, faceId) => {
        try {
            const { faceMatchingService } = await import('../services/faceMatchingService.js');
            return await faceMatchingService.unmatchFace(faceId);
        }
        catch (error) {
            console.error('[IPC] 取消匹配失败:', error);
            return false;
        }
    });
    ipcMain.handle('face:merge-persons', async (_, sourcePersonId, targetPersonId) => {
        try {
            const { faceMatchingService } = await import('../services/faceMatchingService.js');
            return await faceMatchingService.mergePersons(sourcePersonId, targetPersonId);
        }
        catch (error) {
            console.error('[IPC] 合并人物失败:', error);
            return { success: false, merged: 0, error: String(error) };
        }
    });
    ipcMain.handle('face:get-matching-stats', async () => {
        try {
            const { faceMatchingService } = await import('../services/faceMatchingService.js');
            return faceMatchingService.getStats();
        }
        catch (error) {
            return { totalFaces: 0, matchedFaces: 0, unmatchedFaces: 0, matchRate: 0 };
        }
    });
    ipcMain.handle('quality:validate-clustering', async () => {
        try {
            const { qualityValidationService } = await import('../services/qualityValidationService.js');
            return await qualityValidationService.validateClustering();
        }
        catch (error) {
            console.error('[IPC] 聚类质量验证失败:', error);
            return { error: String(error) };
        }
    });
    ipcMain.handle('quality:test-semantic', async (_, query) => {
        try {
            const { qualityValidationService } = await import('../services/qualityValidationService.js');
            return await qualityValidationService.testSemanticSearch(query);
        }
        catch (error) {
            console.error('[IPC] 语义搜索测试失败:', error);
            return { error: String(error) };
        }
    });
    ipcMain.handle('quality:run-tests', async () => {
        try {
            const { qualityValidationService } = await import('../services/qualityValidationService.js');
            return await qualityValidationService.runStandardTests();
        }
        catch (error) {
            console.error('[IPC] 运行标准测试失败:', error);
            return { error: String(error) };
        }
    });
    ipcMain.handle('quality:generate-report', async () => {
        try {
            const { qualityValidationService } = await import('../services/qualityValidationService.js');
            return await qualityValidationService.generateReport();
        }
        catch (error) {
            console.error('[IPC] 生成质量报告失败:', error);
            return { error: String(error) };
        }
    });
    ipcMain.handle('quality:check-vectors', async () => {
        try {
            const { qualityValidationService } = await import('../services/qualityValidationService.js');
            return await qualityValidationService.checkVectorDimensions();
        }
        catch (error) {
            console.error('[IPC] 检查向量维度失败:', error);
            return { error: String(error) };
        }
    });
    ipcMain.handle('perf:test-search', async (_, queryCount) => {
        try {
            const { performanceTestService } = await import('../services/performanceTestService.js');
            return await performanceTestService.testSearchPerformance(queryCount || 50);
        }
        catch (error) {
            console.error('[IPC] 搜索性能测试失败:', error);
            return { error: String(error) };
        }
    });
    ipcMain.handle('perf:test-memory', async () => {
        try {
            const { performanceTestService } = await import('../services/performanceTestService.js');
            return await performanceTestService.testMemoryUsage();
        }
        catch (error) {
            console.error('[IPC] 内存测试失败:', error);
            return { error: String(error) };
        }
    });
    ipcMain.handle('perf:test-concurrency', async (_, concurrentCount) => {
        try {
            const { performanceTestService } = await import('../services/performanceTestService.js');
            return await performanceTestService.testConcurrency(concurrentCount || 5);
        }
        catch (error) {
            console.error('[IPC] 并发测试失败:', error);
            return { error: String(error) };
        }
    });
    ipcMain.handle('perf:test-models', async () => {
        try {
            const { performanceTestService } = await import('../services/performanceTestService.js');
            return await performanceTestService.testModelLoading();
        }
        catch (error) {
            console.error('[IPC] 模型加载测试失败:', error);
            return { error: String(error) };
        }
    });
    ipcMain.handle('perf:run-full', async () => {
        try {
            const { performanceTestService } = await import('../services/performanceTestService.js');
            return await performanceTestService.runFullTest();
        }
        catch (error) {
            console.error('[IPC] 完整性能测试失败:', error);
            return { error: String(error) };
        }
    });
    ipcMain.handle('face:regenerate-start', async (event, options) => {
        try {
            const { faceEmbeddingRegenerator } = await import('../scripts/regenerateFaceEmbeddings.js');
            const result = await faceEmbeddingRegenerator.start({
                batchSize: options?.batchSize || 50,
                resumeFromCheckpoint: options?.resume !== false,
                onProgress: (progress) => {
                    event.sender.send('face:regenerate-progress', progress);
                }
            });
            return result;
        }
        catch (error) {
            console.error('[IPC] 开始重新生成失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('face:regenerate-pause', async () => {
        try {
            const { faceEmbeddingRegenerator } = await import('../scripts/regenerateFaceEmbeddings.js');
            faceEmbeddingRegenerator.pause();
            return { success: true };
        }
        catch (error) {
            console.error('[IPC] 暂停重新生成失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('face:regenerate-progress', async () => {
        try {
            const { faceEmbeddingRegenerator } = await import('../scripts/regenerateFaceEmbeddings.js');
            return faceEmbeddingRegenerator.getProgress();
        }
        catch (error) {
            console.error('[IPC] 获取重新生成进度失败:', error);
            return { status: 'error', error: String(error) };
        }
    });
    ipcMain.handle('face:regenerate-reset', async () => {
        try {
            const { faceEmbeddingRegenerator } = await import('../scripts/regenerateFaceEmbeddings.js');
            faceEmbeddingRegenerator.reset();
            return { success: true };
        }
        catch (error) {
            console.error('[IPC] 重置重新生成失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('face:regenerate-recluster', async () => {
        try {
            const { faceEmbeddingRegenerator } = await import('../scripts/regenerateFaceEmbeddings.js');
            return await faceEmbeddingRegenerator.recluster();
        }
        catch (error) {
            console.error('[IPC] 重新聚类失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('face:cleanup-persons', async () => {
        try {
            const { faceEmbeddingRegenerator } = await import('../scripts/regenerateFaceEmbeddings.js');
            return faceEmbeddingRegenerator.cleanupEmptyPersons();
        }
        catch (error) {
            console.error('[IPC] 清理空人物失败:', error);
            return { deleted: 0, error: String(error) };
        }
    });
    ipcMain.handle('scan-job:get-active', async () => {
        try {
            if (!scanJobService) {
                return { success: false, error: 'ScanJobService not available', job: null };
            }
            const job = scanJobService.getActiveJob();
            return { success: true, job };
        }
        catch (error) {
            console.error('[IPC] 获取活跃扫描任务失败:', error);
            return { success: false, error: String(error), job: null };
        }
    });
    ipcMain.handle('scan-job:resume', async (event, jobId) => {
        try {
            if (!scanJobService || !database) {
                return { success: false, error: 'Services not available' };
            }
            const job = scanJobService.getJobById(jobId);
            if (!job) {
                return { success: false, error: 'Job not found' };
            }
            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
                return { success: false, error: 'Job is not resumable', status: job.status };
            }
            if (scanJobService.isJobStale(job)) {
                scanJobService.markJobAsFailed(jobId);
                return { success: false, error: 'Job is stale (>5min no heartbeat), marked as failed' };
            }
            console.log(`[IPC] 恢复扫描任务: ${jobId}, 从 lastProcessedId: ${job.lastProcessedId}`);
            const { FaceDetectionQueue } = await import('../services/faceDetectionQueue.js');
            const queue = new FaceDetectionQueue(database, {
                maxConcurrent: 1,
                onProgress: (progress) => {
                    if (mainWindow) {
                        mainWindow.webContents.send('face:progress', {
                            current: progress.completed,
                            total: progress.total,
                            percent: progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0,
                            status: progress.status
                        });
                    }
                },
                onComplete: (stats) => {
                    console.log(`[IPC] 恢复扫描完成: ${stats.completed}/${stats.total}, 检测到 ${stats.detectedFaces} 张人脸`);
                    if (mainWindow) {
                        mainWindow.webContents.send('face:scan-complete', {
                            total: stats.total,
                            completed: stats.completed,
                            failed: stats.failed,
                            detectedFaces: stats.detectedFaces
                        });
                    }
                }
            });
            queue.startScanJob(job.totalPhotos);
            const addedCount = await queue.resumeFromCheckpoint(job.lastProcessedId || 0, 1000);
            if (addedCount === 0) {
                return { success: true, message: 'No more photos to process', addedCount: 0 };
            }
            await queue.forceStart();
            return { success: true, message: 'Job resumed', addedCount, jobId };
        }
        catch (error) {
            console.error('[IPC] 恢复扫描任务失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('scan-job:get-stats', async () => {
        try {
            if (!scanJobService) {
                return { success: false, error: 'ScanJobService not available' };
            }
            const stats = scanJobService.getStats();
            return { success: true, stats };
        }
        catch (error) {
            console.error('[IPC] 获取扫描任务统计失败:', error);
            return { success: false, error: String(error) };
        }
    });
    ipcMain.handle('scan-job:get-all', async (_, limit) => {
        try {
            if (!scanJobService) {
                return { success: false, error: 'ScanJobService not available', jobs: [] };
            }
            const jobs = scanJobService.getAllJobs(limit || 100);
            return { success: true, jobs };
        }
        catch (error) {
            console.error('[IPC] 获取扫描任务列表失败:', error);
            return { success: false, error: String(error), jobs: [] };
        }
    });
    ipcMain.handle('people:search', async (_, options) => {
        try {
            const { personSearchService } = await import('../services/personSearchService.js');
            return await personSearchService.search(options);
        }
        catch (error) {
            console.error('[IPC] 搜索人物失败:', error);
            return { results: [], total: 0, query: options.query, processingTimeMs: 0 };
        }
    });
    ipcMain.handle('people:get-photos', async (_, filter) => {
        try {
            const { personSearchService } = await import('../services/personSearchService.js');
            return await personSearchService.getPersonPhotos(filter);
        }
        catch (error) {
            console.error('[IPC] 获取人物照片失败:', error);
            return null;
        }
    });
    ipcMain.handle('people:get-timeline', async (_, personId) => {
        try {
            const { personSearchService } = await import('../services/personSearchService.js');
            return await personSearchService.getPersonTimeline(personId);
        }
        catch (error) {
            console.error('[IPC] 获取时间线失败:', error);
            return {};
        }
    });
    ipcMain.handle('people:get-suggestions', async (_, query, limit) => {
        try {
            const { personSearchService } = await import('../services/personSearchService.js');
            return personSearchService.getSuggestions(query, limit);
        }
        catch (error) {
            console.error('[IPC] 获取建议失败:', error);
            return [];
        }
    });
    ipcMain.handle('people:get-popular', async (_, limit) => {
        try {
            const { personSearchService } = await import('../services/personSearchService.js');
            return personSearchService.getPopularPersons(limit);
        }
        catch (error) {
            console.error('[IPC] 获取热门人物失败:', error);
            return [];
        }
    });
    ipcMain.handle('people:get-search-stats', async () => {
        try {
            const { personSearchService } = await import('../services/personSearchService.js');
            return personSearchService.getStats();
        }
        catch (error) {
            return { totalPersons: 0, totalTaggedPhotos: 0, avgPhotosPerPerson: 0 };
        }
    });
    ipcMain.handle('people:get-search-history', async () => {
        try {
            const { personSearchService } = await import('../services/personSearchService.js');
            return personSearchService.getSearchHistory();
        }
        catch (error) {
            return [];
        }
    });
    ipcMain.handle('people:add-search-history', async (_, query) => {
        try {
            const { personSearchService } = await import('../services/personSearchService.js');
            personSearchService.addToHistory(query);
            return { success: true };
        }
        catch (error) {
            return { success: false };
        }
    });
    ipcMain.handle('people:clear-search-history', async () => {
        try {
            const { personSearchService } = await import('../services/personSearchService.js');
            personSearchService.clearHistory();
            return { success: true };
        }
        catch (error) {
            return { success: false };
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
    registerLocalResourceProtocol();
    await initServices();
    await checkAndRecoverScanJob();
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