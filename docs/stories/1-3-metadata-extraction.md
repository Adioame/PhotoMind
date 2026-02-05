# Story E-01.3: 元数据提取

## Story Overview

**原始需求描述**:
作为用户，我希望系统能够自动提取照片的元数据，包括拍摄日期、位置、设备信息、EXIF 数据等。

**描述**:
当导入照片时，系统自动读取并解析 EXIF、IPTC、XMP 等元数据标准，提取拍摄日期、GPS 坐标、相机型号、镜头信息等，存储到数据库中供后续搜索和展示使用。

## Acceptance Criteria

### 功能性需求
- [ ] 提取拍摄日期时间
- [ ] 提取 GPS 坐标
- [ ] 提取相机/镜头信息
- [ ] 提取光圈/快门/ISO
- [ ] 提取图像尺寸
- [ ] 提取标题和描述（EXIF UserComment）
- [ ] 提取方向/旋转信息
- [ ] 支持 HEIC/RAW 格式
- [ ] 处理缺失元数据的照片

### 非功能性需求
- [ ] 单张照片处理 < 100ms
- [ ] 内存占用低
- [ ] 支持批量处理

## Implementation Steps

### Phase 1: 元数据提取服务

**文件**: `electron/services/metadataExtractor.ts`

```typescript
import exifr from 'exifr'

interface PhotoMetadata {
  // 基本信息
  make?: string           // 相机厂商
  model?: string          // 相机型号
  lensModel?: string      // 镜头型号

  // 日期时间
  dateTimeOriginal?: Date // 拍摄时间
  createDate?: Date      // 创建时间
  modifyDate?: Date       // 修改时间

  // 位置信息
  latitude?: number       // 纬度
  longitude?: number     // 经度
  altitude?: number       // 海拔
  gpsTimestamp?: Date    // GPS 时间戳

  // 相机设置
  fNumber?: number       // 光圈值
  exposureTime?: number  // 快门速度
  iso?: number           // ISO
  focalLength?: number   // 焦距
  focalLength35mm?: number // 35mm 等效焦距

  // 图像信息
  width?: number         // 宽度
  height?: number        // 高度
  orientation?: number   // 方向
  colorSpace?: string    // 色彩空间

  // 额外信息
  title?: string         // 标题
  description?: string   // 描述
  copyright?: string     // 版权
  artist?: string        // 作者
}

class MetadataExtractor {
  async extract(filePath: string): Promise<PhotoMetadata> {
    try {
      // 使用 exifr 提取 EXIF 数据
      const output = await exifr.parse(filePath, {
        // 提取的标签
        tiff: true,
        exif: true,
        gps: true,
        icc: true,
        iptc: true,
        xmp: true,
        // 跳过大型二进制数据
        skipThumbnails: true
      })

      return this.normalizeMetadata(output)
    } catch (error) {
      console.error('Metadata extraction failed:', error)
      return {}
    }
  }

  // 批量提取
  async extractBatch(
    filePaths: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, PhotoMetadata>> {
    const results = new Map<string, PhotoMetadata>()

    for (let i = 0; i < filePaths.length; i++) {
      const metadata = await this.extract(filePaths[i])
      results.set(filePaths[i], metadata)
      onProgress?.(i + 1, filePaths.length)
    }

    return results
  }

  private normalizeMetadata(raw: any): PhotoMetadata {
    return {
      // 基本信息
      make: raw.Make,
      model: raw.Model,
      lensModel: raw.LensModel,

      // 日期时间 - 处理不同格式
      dateTimeOriginal: this.parseDate(raw.DateTimeOriginal),
      createDate: this.parseDate(raw.CreateDate),
      modifyDate: this.parseDate(raw.ModifyDate),

      // GPS
      latitude: raw.latitude,
      longitude: raw.longitude,
      altitude: raw.GPSAltitude,
      gpsTimestamp: this.parseDate(raw.GPSTimeStamp),

      // 相机设置
      fNumber: raw.FNumber,
      exposureTime: raw.ExposureTime,
      iso: raw.ISO,
      focalLength: raw.FocalLength,
      focalLength35mm: raw.FocalLengthIn35mmFormat,

      // 图像信息
      width: raw.ImageWidth || raw.ExifImageWidth,
      height: raw.ImageHeight || raw.ExifImageHeight,
      orientation: raw.Orientation,

      // 额外信息
      title: raw.Title || raw.XPTitle,
      description: raw.Description || raw.XPComment,
      copyright: raw.Copyright,
      artist: raw.Artist
    }
  }

  private parseDate(value: any): Date | undefined {
    if (!value) return undefined

    if (value instanceof Date) {
      return value
    }

    if (typeof value === 'string') {
      // 尝试解析 EXIF 日期格式 "2023:12:25 10:30:00"
      const parsed = new Date(value.replace(/:/g, '-'))
      if (!isNaN(parsed.getTime())) {
        return parsed
      }
    }

    return undefined
  }

  // 从文件名推断日期
  inferDateFromFilename(filename: string): Date | undefined {
    // 常见格式: IMG_20231225_103000.jpg, 2023-12-25 10.30.00.jpg
    const patterns = [
      /IMG_(\d{4})(\d{2})(\d{2})_?(\d{2})(\d{2})(\d{2})/,
      /(\d{4})-(\d{2})-(\d{2})\s*(\d{2})\.(\d{2})\.(\d{2})/
    ]

    for (const pattern of patterns) {
      const match = filename.match(pattern)
      if (match) {
        return new Date(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3]),
          parseInt(match[4] || '0'),
          parseInt(match[5] || '0'),
          parseInt(match[6] || '0')
        )
      }
    }

    return undefined
  }

  // 从文件信息推断日期
  async inferDateFromFile(filePath: string): Promise<Date | undefined> {
    try {
      const stats = await fs.promises.stat(filePath)
      return stats.mtime
    } catch {
      return undefined
    }
  }
}
```

### Phase 2: 数据库存储

**文件**: `electron/database/db.ts`

```typescript
interface PhotoMetadata {
  // ... 字段定义
}

async function insertPhotoMetadata(
  photoId: string,
  metadata: PhotoMetadata
): Promise<void> {
  await db.run(`
    INSERT OR REPLACE INTO photo_metadata (
      photo_id, make, model, lens_model,
      date_time_original, create_date, modify_date,
      latitude, longitude, altitude,
      f_number, exposure_time, iso, focal_length,
      width, height, orientation,
      title, description, copyright, artist,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    photoId,
    metadata.make,
    metadata.model,
    metadata.lensModel,
    metadata.dateTimeOriginal?.toISOString(),
    metadata.createDate?.toISOString(),
    metadata.modifyDate?.toISOString(),
    metadata.latitude,
    metadata.longitude,
    metadata.altitude,
    metadata.fNumber,
    metadata.exposureTime,
    metadata.iso,
    metadata.focalLength,
    metadata.width,
    metadata.height,
    metadata.orientation,
    metadata.title,
    metadata.description,
    metadata.copyright,
    metadata.artist,
    new Date().toISOString()
  ])
}

async function getPhotoMetadata(photoId: string): Promise<PhotoMetadata | null> {
  const row = await db.get('SELECT * FROM photo_metadata WHERE photo_id = ?', photoId)
  return row ? normalizeRow(row) : null
}
```

### Phase 3: 集成到导入流程

**文件**: `electron/services/localPhotoService.ts`

```typescript
import { metadataExtractor } from './metadataExtractor'

async function importPhoto(filePath: string, options?: ImportOptions): Promise<Photo | null> {
  // ... 其他导入步骤

  // 提取元数据
  const metadata = await metadataExtractor.extract(filePath)

  // 如果没有拍摄日期，从文件名推断
  if (!metadata.dateTimeOriginal) {
    metadata.dateTimeOriginal =
      metadataExtractor.inferDateFromFilename(path.basename(filePath)) ||
      await metadataExtractor.inferDateFromFile(filePath)
  }

  // 保存到数据库
  await db.insertPhotoMetadata(photo.id, metadata)

  return photo
}
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/metadataExtractor.ts` |
| 修改 | `electron/database/db.ts` |
| 修改 | `electron/services/localPhotoService.ts` |

## Dependencies

### 内部依赖
- `electron/services/localPhotoService.ts`

### 外部依赖
- `exifr`: ^4.0.0

## Testing Approach

### 单元测试
1. **提取测试**
   - 测试不同格式照片
   - 测试各种标签提取
   - 测试边界情况

### 集成测试
1. **端到端测试**
   - 测试完整导入流程的元数据提取

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 提取拍摄日期 | 导入照片，验证 dateTimeOriginal |
| 提取 GPS | 导入带 GPS 的照片，验证坐标 |
| 提取相机信息 | 导入照片，验证 make/model |
| 处理缺失数据 | 导入无元数据照片，验证有默认值 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| HEIC 支持 | 中 | 使用 exifr 的 heic 扩展 |
| 性能问题 | 低 | 批量处理优化 |
| 格式不支持 | 低 | 降级到文件信息 |

## Related Stories

### 前置依赖
- E-01.1: 本地文件夹导入 - 导入流程

### 后续故事
- E-01.4: 导入进度管理 - 进度显示

### 相关 stories
- E-02.2: 图片向量生成 - 复用文件路径
