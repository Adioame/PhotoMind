import { promises as fs } from 'fs';
import { join, extname } from 'path';
export class FolderScanner {
    constructor() {
        this.supportedExtensions = [
            '.jpg', '.jpeg', '.png', '.gif', '.webp',
            '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw',
            '.tiff', '.tif', '.bmp'
        ];
    }
    async scanFolder(folderPath, options = {}) {
        const { extensions = this.supportedExtensions, recursive = true, skipHidden = true } = options;
        const files = [];
        await this.scanDirectory(folderPath, '', files, {
            extensions,
            recursive,
            skipHidden
        });
        return files;
    }
    async scanDirectory(rootPath, relativePath, files, options) {
        const fullPath = join(rootPath, relativePath);
        try {
            const entries = await fs.readdir(fullPath, { withFileTypes: true });
            for (const entry of entries) {
                const entryPath = join(relativePath, entry.name);
                if (entry.isDirectory()) {
                    if (options.recursive && !(options.skipHidden && entry.name.startsWith('.'))) {
                        await this.scanDirectory(rootPath, entryPath, files, options);
                    }
                }
                else if (entry.isFile()) {
                    if (this.shouldIncludeFile(entry.name, options)) {
                        const filePath = join(rootPath, entryPath);
                        const stats = await fs.stat(filePath);
                        files.push({
                            path: filePath,
                            filename: entry.name,
                            extension: extname(entry.name).toLowerCase(),
                            size: stats.size,
                            mtime: stats.mtime
                        });
                    }
                }
            }
        }
        catch (error) {
            console.error(`扫描目录失败: ${fullPath}`, error);
            throw error;
        }
    }
    shouldIncludeFile(filename, options) {
        const ext = extname(filename).toLowerCase();
        if (options.skipHidden && filename.startsWith('.')) {
            return false;
        }
        return options.extensions.includes(ext);
    }
    async estimateImportTime(files) {
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);
        const estimatedSeconds = totalSize / (30 * 1024 * 1024);
        return Math.ceil(estimatedSeconds);
    }
    getSupportedExtensions() {
        return [...this.supportedExtensions];
    }
    isSupportedFile(filePath) {
        const ext = extname(filePath).toLowerCase();
        return this.supportedExtensions.includes(ext);
    }
}
export const folderScanner = new FolderScanner();
//# sourceMappingURL=folderScanner.js.map