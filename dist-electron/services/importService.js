import { folderScanner } from './folderScanner.js';
import { importProgressService } from './importProgressService.js';
import { backgroundVectorService } from './backgroundVectorService.js';
import { faceDetectionQueue } from './faceDetectionQueue.js';
import crypto from 'crypto';
import { promises as fs } from 'fs';
export class ImportService {
    constructor(database) {
        this.isImporting = false;
        this.cancelImport = false;
        this.database = database;
    }
    onProgress(callback) {
        return importProgressService.subscribe(callback);
    }
    async importFromFolder(folderPath, options = {}) {
        if (this.isImporting) {
            throw new Error('导入已在进行中');
        }
        this.isImporting = true;
        this.cancelImport = false;
        const startTime = Date.now();
        const result = {
            success: true,
            imported: 0,
            skipped: 0,
            failed: 0,
            errors: [],
            duration: 0
        };
        try {
            console.log(`[Import] 开始扫描文件夹: ${folderPath}`);
            importProgressService.setStage('scanning');
            const files = await folderScanner.scanFolder(folderPath);
            if (files.length === 0) {
                console.log('[Import] 未找到支持的照片文件');
                importProgressService.complete(true);
                return result;
            }
            console.log(`[Import] 找到 ${files.length} 个文件`);
            importProgressService.setStage('preparing');
            const toImport = options.skipDuplicates
                ? await this.filterDuplicates(files)
                : files;
            console.log(`[Import] 将导入 ${toImport.length} 个文件（${options.skipDuplicates ? `过滤了 ${files.length - toImport.length} 个重复文件` : '不过滤重复'}）`);
            importProgressService.startSession(toImport.length, 'importing');
            const total = toImport.length;
            for (let i = 0; i < toImport.length; i++) {
                if (this.cancelImport) {
                    result.success = false;
                    importProgressService.cancel();
                    break;
                }
                const file = toImport[i];
                importProgressService.updateCurrentFile(file.filename);
                try {
                    try {
                        await fs.access(file.path);
                    }
                    catch {
                        importProgressService.addError(file.path, '文件不存在');
                        continue;
                    }
                    const fileHash = await this.calculateFileHash(file.path);
                    const existingPhoto = this.findExistingPhoto(file.path, fileHash);
                    if (existingPhoto) {
                        importProgressService.advanceProgress(false, true, false);
                        console.log(`[Import] 跳过已存在的照片: ${file.filename}`);
                        continue;
                    }
                    const photoData = {
                        uuid: this.generateUUID(),
                        fileName: file.filename,
                        filePath: file.path,
                        fileSize: file.size,
                        width: null,
                        height: null,
                        takenAt: file.mtime.toISOString(),
                        exif: {},
                        location: {},
                        status: 'local'
                    };
                    const photoId = this.database.addPhoto(photoData);
                    if (photoId > 0) {
                        importProgressService.advanceProgress(true, false, false);
                        console.log(`[Import] 成功导入: ${file.filename}`);
                    }
                    else {
                        importProgressService.addError(file.path, '数据库插入失败');
                    }
                }
                catch (error) {
                    importProgressService.addError(file.path, error instanceof Error ? error.message : '未知错误');
                    console.error(`[Import] 导入文件失败: ${file.path}`, error);
                }
            }
            importProgressService.complete(true);
            return result;
        }
        finally {
            this.isImporting = false;
            result.duration = Date.now() - startTime;
            console.log(`[Import] 导入完成: 成功 ${result.imported}, 跳过 ${result.skipped}, 失败 ${result.failed}, 耗时 ${result.duration}ms`);
        }
    }
    async filterDuplicates(files) {
        const existingPhotos = this.database.query('SELECT file_path, file_size FROM photos');
        const existingMap = new Set();
        for (const photo of existingPhotos) {
            const key = `${photo.file_path}_${photo.file_size}`;
            existingMap.add(key);
        }
        const toImport = [];
        for (const file of files) {
            const key = `${file.path}_${file.size}`;
            if (!existingMap.has(key)) {
                toImport.push(file);
            }
        }
        return toImport;
    }
    findExistingPhoto(filePath, fileHash) {
        const photos = this.database.query('SELECT * FROM photos WHERE file_path = ? OR uuid = ?', [filePath, fileHash]);
        return photos.length > 0 ? photos[0] : null;
    }
    async calculateFileHash(filePath) {
        try {
            const buffer = await fs.readFile(filePath);
            return crypto.createHash('md5').update(buffer).digest('hex');
        }
        catch {
            return '';
        }
    }
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    cancel() {
        this.cancelImport = true;
        console.log('[Import] 收到取消信号，将在当前文件处理完成后停止');
    }
    getIsImporting() {
        return this.isImporting;
    }
    async importPhotoWithVector(filePath, options = {}) {
        try {
            try {
                await fs.access(filePath);
            }
            catch {
                return { success: false };
            }
            const fileHash = await this.calculateFileHash(filePath);
            const existingPhoto = this.findExistingPhoto(filePath, fileHash);
            if (existingPhoto) {
                console.log(`[Import] 照片已存在: ${filePath}`);
                return { success: true, photoUuid: existingPhoto.uuid, vectorQueued: false };
            }
            const filename = filePath.split('/').pop() || 'unknown';
            const stats = await fs.stat(filePath);
            const photoData = {
                uuid: this.generateUUID(),
                fileName: filename,
                filePath: filePath,
                fileSize: stats.size,
                width: null,
                height: null,
                takenAt: stats.mtime.toISOString(),
                exif: {},
                location: {},
                status: 'local'
            };
            const photoId = this.database.addPhoto(photoData);
            if (photoId > 0) {
                console.log(`[Import] 照片导入成功: ${photoData.uuid}`);
                backgroundVectorService.addPhoto(photoData.uuid);
                this.triggerFaceDetection(photoId, photoData.uuid, filePath);
                return {
                    success: true,
                    photoUuid: photoData.uuid,
                    vectorQueued: true
                };
            }
            return { success: false };
        }
        catch (error) {
            console.error(`[Import] 导入照片失败: ${filePath}`, error);
            return { success: false };
        }
    }
    async importFolderWithVectors(folderPath, options = {}) {
        const importResult = await this.importFromFolder(folderPath, options);
        if (importResult.imported > 0) {
            const recentPhotos = this.database.query(`SELECT uuid FROM photos WHERE status = 'local' ORDER BY id DESC LIMIT ?`, [importResult.imported]);
            if (recentPhotos.length > 0) {
                const photoUuids = recentPhotos.map((p) => p.uuid);
                const taskId = backgroundVectorService.addGenerateTask(photoUuids);
                console.log(`[Import] 已添加 ${photoUuids.length} 张照片到向量生成队列，任务ID: ${taskId}`);
                await this.triggerFaceDetectionBatch(photoUuids);
                return {
                    importResult,
                    vectorTaskId: taskId
                };
            }
        }
        return { importResult };
    }
    getVectorGenerationStatus() {
        const currentTask = backgroundVectorService.getCurrentTask();
        return {
            hasActiveTask: currentTask !== null,
            currentTask,
            stats: backgroundVectorService.getStats()
        };
    }
    getPendingVectorCount() {
        const stats = backgroundVectorService.getStats();
        return stats.pending;
    }
    async triggerFaceDetection(photoId, photoUuid, filePath) {
        try {
            await faceDetectionQueue.addTask(photoId.toString(), photoUuid, filePath);
            console.log(`[Import] 已添加到人脸检测队列: ${photoUuid}`);
        }
        catch (error) {
            console.error(`[Import] 人脸检测触发失败: ${photoUuid}`, error);
        }
    }
    async triggerFaceDetectionBatch(photoUuids) {
        if (photoUuids.length === 0)
            return;
        try {
            const photos = this.database.query(`SELECT id, uuid, file_path FROM photos WHERE uuid IN (${photoUuids.map(() => '?').join(',')})`, photoUuids);
            for (const photo of photos) {
                await this.triggerFaceDetection(photo.id, photo.uuid, photo.file_path);
            }
            console.log(`[Import] 已批量添加 ${photos.length} 张照片到人脸检测队列`);
        }
        catch (error) {
            console.error('[Import] 批量人脸检测触发失败:', error);
        }
    }
}
export let importService = null;
export function initializeImportService(database) {
    importService = new ImportService(database);
    return importService;
}
//# sourceMappingURL=importService.js.map