import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
export class ThumbnailService {
    constructor() {
        this.cacheDir = resolve(__dirname, '../../data/cache');
        this.thumbnailDir = join(this.cacheDir, 'thumbnails');
        this.defaultOptions = {
            width: 300,
            height: 300,
            quality: 80,
            format: 'jpeg'
        };
    }
    async init() {
        if (!existsSync(this.cacheDir)) {
            mkdirSync(this.cacheDir, { recursive: true });
        }
        if (!existsSync(this.thumbnailDir)) {
            mkdirSync(this.thumbnailDir, { recursive: true });
        }
        console.log('✓ 缩略图服务初始化完成');
    }
    getThumbnailPath(filePath, options) {
        const name = crypto.createHash('md5').update(filePath + JSON.stringify(options)).digest('hex');
        return join(this.thumbnailDir, `${name}.${options.format === 'png' ? 'png' : 'jpg'}`);
    }
    async exists(filePath, options) {
        const thumbnailPath = this.getThumbnailPath(filePath, { ...this.defaultOptions, ...options });
        return existsSync(thumbnailPath);
    }
    async generate(filePath, options) {
        const opts = { ...this.defaultOptions, ...options };
        const thumbnailPath = this.getThumbnailPath(filePath, opts);
        if (existsSync(thumbnailPath)) {
            return {
                path: thumbnailPath,
                width: opts.width || 0,
                height: opts.height || 0
            };
        }
        try {
            if (!sharp) {
                console.warn('sharp 未安装，缩略图功能受限');
                return null;
            }
            await sharp(filePath)
                .resize(opts.width, opts.height, {
                fit: 'cover',
                position: 'center'
            })
                .jpeg({ quality: opts.quality })
                .toFile(thumbnailPath);
            return {
                path: thumbnailPath,
                width: opts.width || 0,
                height: opts.height || 0
            };
        }
        catch (error) {
            console.error('生成缩略图失败:', error);
            return null;
        }
    }
    async generateBatch(filePaths, onProgress) {
        let success = 0;
        let failed = 0;
        for (let i = 0; i < filePaths.length; i++) {
            const filePath = filePaths[i];
            const result = await this.generate(filePath);
            if (result) {
                success++;
            }
            else {
                failed++;
            }
            onProgress?.(i + 1, filePaths.length);
        }
        return { success, failed };
    }
    async getThumbnailPathAsync(filePath) {
        const existsThumb = await this.exists(filePath);
        if (existsThumb) {
            return this.getThumbnailPath(filePath, this.defaultOptions);
        }
        const result = await this.generate(filePath);
        return result?.path || filePath;
    }
    async cleanCache(maxAge = 7 * 24 * 60 * 60 * 1000) {
        if (!existsSync(this.thumbnailDir)) {
            return 0;
        }
        const now = Date.now();
        let cleaned = 0;
        try {
            const files = readdirSync(this.thumbnailDir);
            for (const file of files) {
                const filePath = join(this.thumbnailDir, file);
                const stats = statSync(filePath);
                if (now - stats.mtimeMs > maxAge) {
                    unlinkSync(filePath);
                    cleaned++;
                }
            }
        }
        catch (error) {
            console.error('清理缓存失败:', error);
        }
        console.log(`清理了 ${cleaned} 个过期缩略图`);
        return cleaned;
    }
    async clearCache() {
        if (!existsSync(this.thumbnailDir)) {
            return 0;
        }
        let count = 0;
        try {
            const files = readdirSync(this.thumbnailDir);
            for (const file of files) {
                const filePath = join(this.thumbnailDir, file);
                unlinkSync(filePath);
                count++;
            }
        }
        catch (error) {
            console.error('清空缓存失败:', error);
        }
        console.log(`清空了 ${count} 个缩略图`);
        return count;
    }
    getCacheStats() {
        if (!existsSync(this.thumbnailDir)) {
            return { count: 0, size: 0 };
        }
        let count = 0;
        let size = 0;
        try {
            const files = readdirSync(this.thumbnailDir);
            for (const file of files) {
                const filePath = join(this.thumbnailDir, file);
                const stats = statSync(filePath);
                count++;
                size += stats.size;
            }
        }
        catch {
            return { count: 0, size: 0 };
        }
        return { count, size };
    }
}
export const thumbnailService = new ThumbnailService();
//# sourceMappingURL=thumbnailService.js.map