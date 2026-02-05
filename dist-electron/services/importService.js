import { folderScanner } from './folderScanner.js';
import { PhotoDatabase } from '../database/db.js';
import { importProgressService } from './importProgressService.js';
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
}
export const importService = new ImportService(new PhotoDatabase());
//# sourceMappingURL=importService.js.map