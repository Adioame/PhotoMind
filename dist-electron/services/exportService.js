import { basename, extname, join } from 'path';
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { homedir } from 'os';
export class ExportService {
    constructor(database) {
        this.database = database;
        this.exportDir = join(homedir(), 'Downloads/PhotoMind_Exports');
    }
    async initExportDir() {
        if (!existsSync(this.exportDir)) {
            mkdirSync(this.exportDir, { recursive: true });
        }
    }
    getExportDir() {
        return this.exportDir;
    }
    setExportDir(dir) {
        this.exportDir = dir;
        this.initExportDir();
    }
    async exportPhoto(photo, options = {}) {
        const opts = {
            format: 'original',
            quality: 90,
            maxWidth: undefined,
            maxHeight: undefined,
            outputDir: this.exportDir,
            includeMetadata: true,
            ...options
        };
        try {
            if (!existsSync(opts.outputDir)) {
                mkdirSync(opts.outputDir, { recursive: true });
            }
            const sourcePath = photo.filePath;
            if (!existsSync(sourcePath)) {
                return { success: false, error: '源文件不存在' };
            }
            const ext = extname(sourcePath);
            const baseName = basename(sourcePath, ext);
            const outputExt = opts.format === 'original' ? ext : `.${opts.format}`;
            const outputPath = join(opts.outputDir, `${baseName}${outputExt}`);
            copyFileSync(sourcePath, outputPath);
            return { success: true, outputPath };
        }
        catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    async exportPhotos(photos, options = {}, onProgress) {
        await this.initExportDir();
        const progress = {
            current: 0,
            total: photos.length,
            currentFile: '',
            status: 'preparing',
            successCount: 0,
            errorCount: 0
        };
        onProgress?.(progress);
        progress.status = 'exporting';
        for (let i = 0; i < photos.length; i++) {
            const photo = photos[i];
            progress.current = i + 1;
            progress.currentFile = photo.fileName || basename(photo.filePath);
            onProgress?.(progress);
            const result = await this.exportPhoto(photo, options);
            if (result.success) {
                progress.successCount++;
            }
            else {
                progress.errorCount++;
                console.error(`导出失败: ${photo.fileName}`, result.error);
            }
        }
        progress.status = 'completed';
        onProgress?.(progress);
        return {
            successCount: progress.successCount,
            errorCount: progress.errorCount,
            outputDir: this.exportDir
        };
    }
    async exportPhotosByPerson(personId, options = {}, onProgress) {
        const photos = await this.database.getPhotosByPerson(personId);
        return this.exportPhotos(photos, options, onProgress);
    }
    async exportPhotosByYear(year, options = {}, onProgress) {
        const photos = await this.database.getPhotosByYear(year);
        return this.exportPhotos(photos, options, onProgress);
    }
    async exportSearchResults(query, filters = {}, options = {}, onProgress) {
        const photos = this.database.searchPhotos(query, filters);
        return this.exportPhotos(photos, options, onProgress);
    }
    async getExportDirSize() {
        if (!existsSync(this.exportDir)) {
            return 0;
        }
        let totalSize = 0;
        const calculateSize = (dir) => {
            const files = readdirSync(dir);
            for (const file of files) {
                const filePath = join(dir, file);
                const stats = statSync(filePath);
                if (stats.isDirectory()) {
                    calculateSize(filePath);
                }
                else {
                    totalSize += stats.size;
                }
            }
        };
        calculateSize(this.exportDir);
        return totalSize;
    }
    async clearExportDir() {
        if (!existsSync(this.exportDir)) {
            return 0;
        }
        let count = 0;
        const files = readdirSync(this.exportDir);
        for (const file of files) {
            const filePath = join(this.exportDir, file);
            unlinkSync(filePath);
            count++;
        }
        return count;
    }
    async convertFormat(inputPath, outputPath, format, quality = 90) {
        try {
            copyFileSync(inputPath, outputPath);
            return true;
        }
        catch (error) {
            console.error('格式转换失败:', error);
            return false;
        }
    }
}
export const exportService = (database) => new ExportService(database);
//# sourceMappingURL=exportService.js.map