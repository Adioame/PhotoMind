import { thumbnailService } from './thumbnailService.js';
import { readdirSync, statSync, existsSync, promises as fs } from 'fs';
import { extname, join, basename } from 'path';
import { v4 as uuidv4 } from 'uuid';
const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif', '.tiff', '.tif', '.JPG', '.JPEG', '.PNG', '.HEIC', '.WEBP', '.GIF', '.TIFF', '.TIF'];
const RAW_EXTENSIONS = ['.raw', '.cr2', '.nef', '.arw', '.dng'];
export class LocalPhotoService {
    constructor(database, thumbnailSvc) {
        this.importCallback = null;
        this.database = database;
        this.thumbnailService = thumbnailSvc || thumbnailService;
    }
    onProgress(callback) {
        this.importCallback = callback;
    }
    updateProgress(progress) {
        if (this.importCallback) {
            this.importCallback({
                current: 0,
                total: 0,
                currentFile: '',
                status: 'scanning',
                importedCount: 0,
                errorCount: 0,
                skippedCount: 0,
                ...progress
            });
        }
    }
    async scanFolder(folderPath) {
        const photos = [];
        if (!existsSync(folderPath)) {
            throw new Error(`文件夹不存在: ${folderPath}`);
        }
        const appDir = process.cwd();
        const userHome = process.env.HOME || process.env.USERPROFILE || '';
        if (folderPath === appDir || folderPath.startsWith(appDir + '/')) {
            console.warn(`[LocalPhotoService] 跳过应用程序目录: ${folderPath}`);
            return [];
        }
        const scanDirectory = (dir) => {
            try {
                const entries = readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                            scanDirectory(fullPath);
                        }
                    }
                    else if (entry.isFile()) {
                        const ext = extname(entry.name).toLowerCase();
                        if (PHOTO_EXTENSIONS.includes(ext) && entry.name.split('.').length > 1) {
                            photos.push(fullPath);
                        }
                    }
                }
            }
            catch (error) {
                console.error(`扫描文件夹失败: ${dir}`, error);
            }
        };
        scanDirectory(folderPath);
        return photos.sort();
    }
    async extractMetadata(filePath) {
        const stats = statSync(filePath);
        const fileName = basename(filePath);
        const ext = extname(filePath).toLowerCase();
        const metadata = {
            uuid: uuidv4(),
            fileName,
            filePath,
            fileSize: stats.size,
            status: 'local'
        };
        if (RAW_EXTENSIONS.includes(ext)) {
            metadata.takenAt = stats.mtime.toISOString();
            return metadata;
        }
        try {
            const exifData = await this.extractEXIFData(filePath, ext);
            if (exifData) {
                if (exifData.Make || exifData.Model) {
                    metadata.exif = {
                        camera: `${exifData.Make || ''} ${exifData.Model || ''}`.trim(),
                        iso: exifData.ISO || exifData.ISO200 || undefined,
                        aperture: exifData.FNumber,
                        shutterSpeed: exifData.ExposureTime ? this.formatShutterSpeed(exifData.ExposureTime) : undefined,
                        focalLength: exifData.FocalLength,
                        fNumber: exifData.FNumber
                    };
                }
                metadata.takenAt = exifData.DateTimeOriginal?.toISOString() ||
                    exifData.CreateDate?.toISOString() ||
                    stats.mtime.toISOString();
                if (exifData.ImageWidth || exifData.ExifImageWidth) {
                    metadata.width = exifData.ImageWidth || exifData.ExifImageWidth;
                }
                if (exifData.ImageHeight || exifData.ExifImageHeight) {
                    metadata.height = exifData.ImageHeight || exifData.ExifImageHeight;
                }
                if (exifData.latitude && exifData.longitude) {
                    metadata.location = {
                        latitude: exifData.latitude,
                        longitude: exifData.longitude,
                        altitude: exifData.GPSAltitude
                    };
                }
            }
            else {
                metadata.takenAt = stats.mtime.toISOString();
            }
        }
        catch (error) {
            console.warn(`提取元数据失败: ${filePath}`, error);
            metadata.takenAt = stats.mtime.toISOString();
        }
        return metadata;
    }
    async extractEXIFData(filePath, ext) {
        try {
            const buffer = await fs.readFile(filePath);
            if (ext === '.jpg' || ext === '.jpeg') {
                if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
                    return null;
                }
                return this.parseJPEGEXIF(buffer);
            }
            if (ext === '.png') {
                const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                if (!buffer.slice(0, 8).equals(pngSignature)) {
                    return null;
                }
                return this.parsePNGEXIF(buffer);
            }
            if (ext === '.heic' || ext === '.heif') {
                console.warn('HEIC 格式需要专门库支持');
                return null;
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
    parseJPEGEXIF(buffer) {
        const result = {};
        let offset = 2;
        while (offset < buffer.length - 1) {
            if (buffer[offset] === 0xFF && buffer[offset + 1] === 0xE1) {
                const segmentLength = (buffer[offset + 2] << 8) | buffer[offset + 3];
                const exifHeader = buffer.toString('latin1', offset + 4, offset + 10);
                if (exifHeader === 'Exif\x00\x00') {
                    const tiffOffset = offset + 10;
                    const byteOrder = buffer.readUInt16BE(tiffOffset);
                    let ifdOffset;
                    if (byteOrder === 0x4949) {
                        ifdOffset = tiffOffset + buffer.readUInt32LE(tiffOffset + 4);
                    }
                    else {
                        ifdOffset = tiffOffset + buffer.readUInt32BE(tiffOffset + 4);
                    }
                    this.parseEXIFIFD(buffer, ifdOffset, byteOrder, result);
                    break;
                }
                offset += segmentLength + 2;
            }
            else if (buffer[offset] === 0xFF && buffer[offset + 1] !== 0x00) {
                const segmentLength = (buffer[offset + 2] << 8) | buffer[offset + 3];
                offset += segmentLength + 2;
            }
            else {
                offset++;
            }
        }
        return result;
    }
    parseEXIFIFD(buffer, offset, byteOrder, result) {
        try {
            const numEntries = byteOrder === 0x4949
                ? buffer.readUInt16LE(offset)
                : buffer.readUInt16BE(offset);
            for (let i = 0; i < numEntries; i++) {
                const entryOffset = offset + 2 + (i * 12);
                const tag = byteOrder === 0x4949
                    ? buffer.readUInt16LE(entryOffset)
                    : buffer.readUInt16BE(entryOffset);
                const type = byteOrder === 0x4949
                    ? buffer.readUInt16LE(entryOffset + 2)
                    : buffer.readUInt16BE(entryOffset + 2);
                const count = byteOrder === 0x4949
                    ? buffer.readUInt32LE(entryOffset + 4)
                    : buffer.readUInt32BE(entryOffset + 4);
                const value = this.readEXIFValue(buffer, entryOffset, type, count, byteOrder, result);
                this.mapEXIFTag(tag, value, result);
            }
        }
        catch (error) {
            console.warn('解析 EXIF IFD 失败:', error);
        }
    }
    mapEXIFTag(tag, value, result) {
        const tagMap = {
            0x010F: 'Make',
            0x0110: 'Model',
            0x011A: 'XResolution',
            0x011B: 'YResolution',
            0x0128: 'ResolutionUnit',
            0x0131: 'Software',
            0x0132: 'DateTime',
            0x013B: 'Artist',
            0x8298: 'Copyright',
            0x8769: 'ExifIFDPointer',
            0x8825: 'GPSInfoIFDPointer',
        };
        const exifTagMap = {
            0x829A: 'ExposureTime',
            0x829D: 'FNumber',
            0x8827: 'ISO',
            0x9000: 'ExifVersion',
            0x9003: 'DateTimeOriginal',
            0x9004: 'DateTimeDigitized',
            0x9201: 'ShutterSpeedValue',
            0x9202: 'ApertureValue',
            0x9204: 'ExposureBiasValue',
            0x9207: 'MeteringMode',
            0x9208: 'LightSource',
            0x9209: 'Flash',
            0x920A: 'FocalLength',
            0xA001: 'ColorSpace',
            0xA002: 'PixelXDimension',
            0xA003: 'PixelYDimension',
            0xA402: 'ExposureMode',
            0xA403: 'WhiteBalance',
            0xA406: 'SceneCaptureType',
            0x0000: 'GPSVersionID',
            0x0001: 'GPSLatitudeRef',
            0x0002: 'GPSLatitude',
            0x0003: 'GPSLongitudeRef',
            0x0004: 'GPSLongitude',
            0x0005: 'GPSAltitudeRef',
            0x0006: 'GPSAltitude',
        };
        const gpsTagMap = {
            0x0000: 'GPSVersionID',
            0x0001: 'GPSLatitudeRef',
            0x0002: 'GPSLatitude',
            0x0003: 'GPSLongitudeRef',
            0x0004: 'GPSLongitude',
            0x0005: 'GPSAltitudeRef',
            0x0006: 'GPSAltitude',
            0x0007: 'GPSTimeStamp',
            0x001D: 'GPSDateStamp',
        };
        if (tagMap[tag]) {
            result[tagMap[tag]] = value;
        }
    }
    readEXIFValue(buffer, entryOffset, type, count, byteOrder, result) {
        const typeSizes = {
            1: 1,
            2: 1,
            3: 2,
            4: 4,
            5: 8,
            6: 1,
            7: 1,
            8: 2,
            9: 4,
            10: 8,
        };
        try {
            const typeSize = typeSizes[type] || 1;
            const valueSize = typeSize * count;
            let valueOffset = entryOffset + 8;
            if (valueSize > 4) {
                valueOffset = byteOrder === 0x4949
                    ? buffer.readUInt32LE(entryOffset + 8)
                    : buffer.readUInt32BE(entryOffset + 8);
            }
            switch (type) {
                case 2:
                    return buffer.toString('utf8', valueOffset, valueOffset + count - 1).replace(/\0+$/, '');
                case 3:
                    return count === 1
                        ? (byteOrder === 0x4949 ? buffer.readUInt16LE(valueOffset) : buffer.readUInt16BE(valueOffset))
                        : undefined;
                case 4:
                    return count === 1
                        ? (byteOrder === 0x4949 ? buffer.readUInt32LE(valueOffset) : buffer.readUInt32BE(valueOffset))
                        : undefined;
                case 5:
                    if (count === 1) {
                        const num = byteOrder === 0x4949 ? buffer.readUInt32LE(valueOffset) : buffer.readUInt32BE(valueOffset);
                        const den = byteOrder === 0x4949 ? buffer.readUInt32LE(valueOffset + 4) : buffer.readUInt32BE(valueOffset + 4);
                        return den ? num / den : 0;
                    }
                    return undefined;
                default:
                    return undefined;
            }
        }
        catch {
            return undefined;
        }
    }
    parsePNGEXIF(buffer) {
        const result = {};
        let offset = 8;
        while (offset < buffer.length - 8) {
            const length = buffer.readUInt32BE(offset);
            const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
            if (chunkType === 'tEXt' || chunkType === 'iTXt' || chunkType === 'zTXt') {
                const data = buffer.slice(offset + 8, offset + 8 + length);
                const nullIndex = data.indexOf(0);
                if (nullIndex > 0) {
                    const keyword = data.slice(0, nullIndex).toString('ascii');
                    const text = data.slice(nullIndex + 1).toString('utf8');
                    if (keyword === 'Description')
                        result.Description = text;
                    if (keyword === 'Title')
                        result.Title = text;
                    if (keyword === 'Author')
                        result.Artist = text;
                    if (keyword === 'Copyright')
                        result.Copyright = text;
                    if (keyword === 'DateTime')
                        result.DateTime = text;
                }
            }
            if (chunkType === 'IEND')
                break;
            offset += length + 12;
        }
        return result;
    }
    formatShutterSpeed(seconds) {
        if (seconds >= 1) {
            return `${seconds}s`;
        }
        const denominator = Math.round(1 / seconds);
        return `1/${denominator}`;
    }
    async importFolder(folderPath) {
        let importedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const importedPhotos = [];
        this.updateProgress({
            status: 'scanning',
            total: 0
        });
        try {
            const photos = await this.scanFolder(folderPath);
            this.updateProgress({
                status: 'importing',
                total: photos.length,
                current: 0,
                importedCount: 0,
                errorCount: 0,
                skippedCount: 0
            });
            console.log(`找到 ${photos.length} 张照片`);
            for (let i = 0; i < photos.length; i++) {
                const filePath = photos[i];
                this.updateProgress({
                    current: i + 1,
                    total: photos.length,
                    currentFile: basename(filePath),
                    importedCount,
                    errorCount,
                    skippedCount
                });
                try {
                    const metadata = await this.extractMetadata(filePath);
                    const existingPhoto = this.database.getPhotoByFilePath(filePath);
                    if (existingPhoto) {
                        console.log(`[LocalPhotoService] 文件已存在，跳过: ${basename(filePath)}`);
                        skippedCount++;
                        this.updateProgress({
                            current: i + 1,
                            total: photos.length,
                            currentFile: basename(filePath),
                            importedCount,
                            errorCount,
                            skippedCount
                        });
                        continue;
                    }
                    let thumbnailPath = null;
                    try {
                        const thumbnailResult = await this.thumbnailService.generate(filePath);
                        if (thumbnailResult) {
                            thumbnailPath = thumbnailResult.path;
                            console.log(`[LocalPhotoService] 缩略图生成成功: ${basename(filePath)}`);
                        }
                    }
                    catch (thumbError) {
                        console.warn(`[LocalPhotoService] 缩略图生成失败: ${filePath}`, thumbError);
                    }
                    const photoData = {
                        ...metadata,
                        thumbnailPath
                    };
                    const photoId = this.database.addPhoto(photoData);
                    if (photoId > 0) {
                        importedCount++;
                        importedPhotos.push({
                            ...photoData,
                            id: photoId
                        });
                    }
                    else {
                        errorCount++;
                    }
                }
                catch (error) {
                    console.error(`导入照片失败: ${filePath}`, error);
                    errorCount++;
                }
            }
            this.updateProgress({
                status: 'completed',
                current: photos.length,
                total: photos.length,
                importedCount,
                errorCount,
                skippedCount
            });
        }
        catch (error) {
            console.error('扫描文件夹失败:', error);
            this.updateProgress({
                status: 'error',
                errorCount: 1
            });
            throw error;
        }
        return {
            imported: importedCount,
            skipped: skippedCount,
            errors: errorCount,
            photos: importedPhotos
        };
    }
    async importPhoto(filePath) {
        try {
            const metadata = await this.extractMetadata(filePath);
            const photoId = this.database.addPhoto(metadata);
            if (photoId > 0) {
                return {
                    ...metadata,
                    id: photoId
                };
            }
            return null;
        }
        catch (error) {
            console.error(`导入照片失败: ${filePath}`, error);
            return null;
        }
    }
    getPhotoCount() {
        try {
            return this.database.getPhotoCount();
        }
        catch (error) {
            console.error('获取照片数量失败:', error);
            return 0;
        }
    }
    getPhotosWithoutEmbeddings(limit = 100) {
        try {
            const photos = this.database.getPhotosWithoutEmbeddings(limit);
            return photos.map(p => ({
                id: p.id,
                uuid: p.uuid,
                filePath: p.file_path,
                fileName: p.file_name,
                thumbnailPath: p.thumbnail_path,
                takenAt: p.taken_at
            }));
        }
        catch (error) {
            console.error('获取无向量照片失败:', error);
            return [];
        }
    }
    getLocalPhotos(limit = 100, offset = 0) {
        try {
            console.log(`[LocalPhotoService] getLocalPhotos - limit: ${limit}, offset: ${offset}`);
            console.log(`[LocalPhotoService] database 可用: ${!!this.database}`);
            const photos = this.database.getAllPhotos(limit, offset);
            console.log(`[LocalPhotoService] getAllPhotos 返回 ${photos.length} 条记录`);
            const result = photos.map(p => ({
                id: p.id,
                uuid: p.uuid,
                cloudId: p.cloud_id,
                filePath: p.file_path,
                fileName: p.file_name,
                fileSize: p.file_size,
                width: p.width,
                height: p.height,
                takenAt: p.taken_at,
                exif: this.parseJsonField(p.exif_data),
                location: this.parseJsonField(p.location_data),
                thumbnailPath: p.thumbnail_path,
                status: p.status || 'local'
            }));
            console.log(`[LocalPhotoService] 映射后返回 ${result.length} 张照片`);
            return result;
        }
        catch (error) {
            console.error('[LocalPhotoService] 获取本地照片失败:', error);
            return [];
        }
    }
    parseJsonField(field) {
        if (!field)
            return {};
        if (typeof field === 'object')
            return field;
        if (typeof field === 'string') {
            try {
                return JSON.parse(field);
            }
            catch {
                return {};
            }
        }
        return {};
    }
    deletePhoto(photoId) {
        try {
            console.log(`[LocalPhotoService] 删除照片: ${photoId}`);
            const photo = this.database.getPhotoById(photoId);
            if (!photo) {
                console.warn(`[LocalPhotoService] 照片 ${photoId} 不存在于数据库`);
                return false;
            }
            const success = this.database.deletePhoto(photo.uuid);
            if (success) {
                console.log(`[LocalPhotoService] 照片 ${photoId} (uuid: ${photo.uuid}) 已从数据库删除`);
            }
            return success;
        }
        catch (error) {
            console.error(`[LocalPhotoService] 删除照片失败: ${photoId}`, error);
            return false;
        }
    }
}
//# sourceMappingURL=localPhotoService.js.map