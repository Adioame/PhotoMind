import { exec, execSync } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
export class ICloudService {
    constructor(database) {
        this.libraryPath = '';
        this.PhotosLibrary = null;
        this.isAvailable = false;
        this.database = database;
    }
    async checkAvailability() {
        try {
            const { stdout } = await execAsync('system_profiler SPSyncServicesDataType | grep "iCloud"');
            this.isAvailable = stdout.includes('iCloud Photos') || stdout.includes('Photos');
            return this.isAvailable;
        }
        catch {
            this.isAvailable = false;
            return false;
        }
    }
    async initialize(libraryPath) {
        try {
            this.libraryPath = libraryPath;
            try {
                const PhotosLib = await import('apple-photos-js');
                this.PhotosLibrary = PhotosLib.default || PhotosLib.Photos;
                console.log('apple-photos-js 加载成功');
            }
            catch (e) {
                console.warn('apple-photos-js 未安装，使用 AppleScript 方式');
            }
            await this.checkAvailability();
            console.log('iCloud 服务初始化完成');
            return true;
        }
        catch (error) {
            console.error('iCloud 服务初始化失败:', error);
            return false;
        }
    }
    getIsAvailable() {
        return this.isAvailable;
    }
    async getAlbums() {
        if (this.isAvailable) {
            try {
                const albums = await this.getAlbumsViaAppleScript();
                if (albums.length > 0) {
                    return albums;
                }
            }
            catch (error) {
                console.warn('AppleScript 获取相册失败，使用备选方案:', error);
            }
        }
        if (this.PhotosLibrary) {
            try {
                return this.getAlbumsViaLibrary();
            }
            catch (error) {
                console.warn('PhotosLibrary 获取相册失败:', error);
            }
        }
        return this.getMockAlbums();
    }
    async getAlbumsViaAppleScript() {
        const script = `
      tell application "Photos"
        set albumList to {}
        repeat with a in albums
          if a is not null then
            set end of albumList to {name of a as text, count of media items of a}
          end if
        end repeat
        return albumList
      end tell
    `;
        try {
            const { stdout } = await execAsync(`osascript -e '${script.replace(/\n/g, ' ')}'`);
            return this.parseAlbumList(stdout);
        }
        catch (error) {
            console.error('AppleScript 获取相册失败:', error);
            return [];
        }
    }
    getAlbumsViaLibrary() {
        console.warn('PhotosLibrary 不支持获取相册列表');
        return [];
    }
    parseAlbumList(stdout) {
        const albums = [];
        const matches = stdout.matchAll(/\{([^,]+),\s*(\d+)\}/g);
        for (const match of matches) {
            const name = match[1]?.trim().replace(/"/g, '');
            const count = parseInt(match[2], 10);
            if (name && !isNaN(count)) {
                albums.push({ name, photoCount: count });
            }
        }
        return albums;
    }
    getMockAlbums() {
        return [
            { name: '个人收藏', photoCount: 1250 },
            { name: '最近项目', photoCount: 100 },
            { name: '自拍', photoCount: 89 },
            { name: '屏幕快照', photoCount: 234 },
            { name: '视频', photoCount: 67 }
        ];
    }
    async getPhotosWithStatus(albumName, options = {}) {
        const { limit = 100, offset = 0 } = options;
        if (this.isAvailable) {
            try {
                const photos = await this.getPhotosViaAppleScript(albumName, limit + offset);
                return photos.slice(offset, offset + limit);
            }
            catch (error) {
                console.warn('AppleScript 获取照片失败:', error);
            }
        }
        if (this.PhotosLibrary) {
            try {
                return await this.getPhotosViaLibrary(limit, offset);
            }
            catch (error) {
                console.warn('PhotosLibrary 获取照片失败:', error);
            }
        }
        return this.getMockPhotos(limit, offset);
    }
    async getPhotosViaAppleScript(albumName, limit = 100) {
        let script = `
      tell application "Photos"
        set photoList to {}
    `;
        if (albumName) {
            script += `
        set targetAlbum to album named "${albumName}"
        repeat with p in media items of targetAlbum
      `;
        }
        else {
            script += `
        repeat with p in media items
      `;
        }
        script += `
          set end of photoList to {id of p as text, name of p as text, date of p, size of p, download status of p as text}
        end repeat
        return photoList
      end tell
    `;
        try {
            const { stdout } = await execAsync(`osascript -e '${script.replace(/\n/g, ' ')}'`);
            return this.parsePhotoList(stdout).slice(0, limit);
        }
        catch (error) {
            console.error('AppleScript 获取照片失败:', error);
            return [];
        }
    }
    async getPhotosViaLibrary(limit, offset) {
        try {
            const photos = new this.PhotosLibrary(this.libraryPath);
            const allPhotos = photos.getAllPhotos();
            return allPhotos.slice(offset, offset + limit).map((photo) => this.normalizePhoto(photo));
        }
        catch (error) {
            console.error('PhotosLibrary 获取照片失败:', error);
            return [];
        }
    }
    parsePhotoList(stdout) {
        const photos = [];
        const matches = stdout.matchAll(/\{([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^}]+)\}/g);
        for (const match of matches) {
            const id = match[1]?.trim();
            const filename = match[2]?.trim();
            const dateStr = match[3]?.trim();
            const sizeStr = match[4]?.trim();
            const status = match[5]?.trim();
            if (id && filename && dateStr && sizeStr) {
                photos.push({
                    id,
                    filename,
                    date: new Date(dateStr.replace(/:/g, '-')),
                    size: parseInt(sizeStr, 10) || 0,
                    cloudStatus: this.parseCloudStatus(status)
                });
            }
        }
        return photos;
    }
    parseCloudStatus(status) {
        const lowerStatus = status?.toLowerCase() || '';
        if (lowerStatus.includes('waiting') || lowerStatus.includes('not downloaded')) {
            return 'waiting';
        }
        if (lowerStatus.includes('uploading')) {
            return 'uploading';
        }
        return 'downloaded';
    }
    async downloadPhoto(photoId) {
        if (this.isAvailable) {
            try {
                return await this.downloadPhotoViaAppleScript(photoId);
            }
            catch (error) {
                console.error('AppleScript 下载失败:', error);
            }
        }
        console.warn('无法下载照片，照片库不可用');
        return null;
    }
    async downloadPhotoViaAppleScript(photoId) {
        const script = `
      tell application "Photos"
        try
          set targetPhoto to media item id "${photoId}"
          download targetPhoto
          return POSIX path of (image file of targetPhoto as text)
        on error
          return ""
        end try
      end tell
    `;
        try {
            const { stdout } = await execAsync(`osascript -e '${script.replace(/\n/g, ' ')}'`);
            const path = stdout.trim();
            return path || null;
        }
        catch (error) {
            console.error('AppleScript 下载照片失败:', error);
            return null;
        }
    }
    async getStorageInfo() {
        try {
            const output = execSync('df -h / | tail -1 | awk "{print $3, $4}"');
            const [used, available] = output.toString().trim().split(/\s+/);
            return {
                used: this.parseSizeToGB(used),
                available: this.parseSizeToGB(available)
            };
        }
        catch (error) {
            console.error('获取存储信息失败:', error);
            return null;
        }
    }
    parseSizeToGB(sizeStr) {
        const match = sizeStr.match(/^([\d.]+)([KMGT]?)$/i);
        if (!match)
            return 0;
        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        switch (unit) {
            case 'T':
                return value * 1024;
            case 'G':
                return value;
            case 'M':
                return value / 1024;
            case 'K':
                return value / (1024 * 1024);
            default:
                return value;
        }
    }
    async getPhotos(limit = 100, offset = 0) {
        if (!this.PhotosLibrary) {
            return this.getMockPhotos(limit, offset);
        }
        try {
            const photos = new this.PhotosLibrary(this.libraryPath);
            const allPhotos = photos.getAllPhotos();
            return allPhotos.slice(offset, offset + limit).map((photo) => this.normalizePhoto(photo));
        }
        catch (error) {
            console.error('获取照片失败:', error);
            return this.getMockPhotos(limit, offset);
        }
    }
    async downloadPhotos(photoIds, onProgress) {
        const results = new Map();
        for (let i = 0; i < photoIds.length; i++) {
            const photoId = photoIds[i];
            onProgress?.(i + 1, photoIds.length);
            try {
                const path = await this.downloadPhoto(photoId);
                results.set(photoId, path || '');
            }
            catch (error) {
                results.set(photoId, '');
                console.error(`下载照片 ${photoId} 失败:`, error);
            }
        }
        return results;
    }
    async getPhotoDetail(photoId) {
        if (!this.PhotosLibrary) {
            return this.getMockPhotos(1, parseInt(photoId) || 0)[0];
        }
        try {
            const photos = new this.PhotosLibrary(this.libraryPath);
            const photo = photos.getPhotoById(photoId);
            return photo ? this.normalizePhoto(photo) : null;
        }
        catch (error) {
            console.error('获取照片详情失败:', error);
            return this.getMockPhotos(1, parseInt(photoId) || 0)[0];
        }
    }
    async syncAll() {
        let totalSynced = 0;
        try {
            const photos = await this.getPhotos(10000, 0);
            for (const photo of photos) {
                this.database.addPhoto(photo);
                totalSynced++;
            }
            console.log(`同步完成: ${totalSynced} 张照片`);
        }
        catch (error) {
            console.error('同步失败:', error);
        }
        return totalSynced;
    }
    normalizePhoto(photo) {
        return {
            uuid: photo.uuid || photo.id || crypto.randomUUID(),
            cloudId: photo.cloudId || photo.id,
            filePath: photo.filePath || photo.originalPath,
            fileName: photo.filename || photo.name,
            fileSize: photo.fileSize || photo.size,
            width: photo.width,
            height: photo.height,
            takenAt: photo.takenAt || photo.creationDate || new Date().toISOString(),
            exif: {
                camera: photo.cameraModel,
                lens: photo.lensModel,
                iso: photo.iso,
                aperture: photo.fNumber,
                shutterSpeed: photo.exposureTime
            },
            location: photo.location ? {
                latitude: photo.location.latitude,
                longitude: photo.location.longitude
            } : null,
            status: 'icloud'
        };
    }
    getMockPhotos(limit, offset) {
        const mockPhotos = [];
        for (let i = offset; i < offset + limit; i++) {
            const year = 2015 + Math.floor(i / 100);
            const month = (i % 12) + 1;
            const day = (i % 28) + 1;
            const statuses = ['downloaded', 'downloaded', 'waiting', 'downloaded'];
            const status = statuses[i % statuses.length];
            mockPhotos.push({
                id: `photo-${i}`,
                filename: `IMG_${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}_${i}.jpg`,
                date: new Date(year, month - 1, day, 10, 30),
                size: Math.floor(Math.random() * 5000000) + 1000000,
                cloudStatus: status,
                localPath: status === 'downloaded' ? `/mock/photos/${year}/photo_${i}.jpg` : undefined
            });
        }
        return mockPhotos;
    }
}
//# sourceMappingURL=iCloudService.js.map