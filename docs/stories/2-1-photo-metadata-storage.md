# Story E-02.1: 照片元数据存储

## Story Overview

**原始需求描述**:
作为用户，我希望照片的元数据（EXIF、地理位置、人脸信息等）能够被完整地存储和索引，以便后续的搜索和浏览功能可以使用这些信息。

**描述**:
设计并实现照片元数据的存储方案，包括 SQLite 数据库表结构设计、元数据提取和存储逻辑、索引优化等。

## Acceptance Criteria

### 功能性需求
- [ ] 设计并实现 SQLite 数据库 schema
- [ ] 照片表（photos）包含必要字段
- [ ] 元数据表（metadata）存储 EXIF 信息
- [ ] 位置信息存储（经纬度、地点名称）
- [ ] 拍摄时间标准化存储
- [ ] 文件信息存储（大小、格式、哈希）
- [ ] 创建必要的数据库索引
- [ ] 支持元数据更新和删除

### 非功能性需求
- [ ] 单张照片元数据写入 < 100ms
- [ ] 支持 100,000+ 照片存储
- [ ] 元数据查询响应 < 50ms
- [ ] 数据库文件大小合理

## Implementation Steps

### Phase 1: 数据库 Schema 设计

**文件**: `electron/database/schema.ts`

```typescript
// 照片主表
interface PhotoRecord {
  id: number
  uuid: string                    // 唯一标识
  file_name: string              // 文件名
  file_path: string              // 文件路径
  file_hash: string              // 文件哈希（去重用）
  file_size: number              // 文件大小
  mime_type: string              // MIME 类型
  width?: number                 // 宽度
  height?: number                // 高度
  orientation?: number            // 旋转角度
  taken_at?: datetime            // 拍摄时间
  imported_at: datetime          // 导入时间
  thumbnail_path?: string         // 缩略图路径
  status: string                 // 状态: 'imported' | 'deleted'
}

// 元数据表
interface PhotoMetadata {
  id: number
  photo_id: number
  exif_data: text               // JSON 存储 EXIF
  gps_latitude?: real            // GPS 纬度
  gps_longitude?: real           // GPS 经度
  location_name?: string         // 地点名称
  make?: string                  // 相机厂商
  model?: string                 // 相机型号
  lens?: string                  // 镜头信息
  focal_length?: string          // 焦距
  aperture?: string              // 光圈
  iso?: integer                  // ISO
  shutter_speed?: string         // 快门速度
  flash?: string                 // 闪光灯
  raw_data?: blob                // 原始二进制数据
}

// 向量索引表
interface VectorIndex {
  id: number
  photo_id: number
  vector_type: string            // 'image' | 'text'
  vector_model: string           // 'clip' | 'openai'
  vector_data: blob              // 存储的向量
  dimensions: integer            // 向量维度
  created_at: datetime
}
```

### Phase 2: 数据库初始化

**文件**: `electron/database/init.ts`

```typescript
import initSqlJs, { Database } from 'sql.js'
import fs from 'fs/promises'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'photodb.sqlite')

class DatabaseManager {
  private db: Database | null = null

  async initialize(): Promise<void> {
    const SQL = await initSqlJs()

    // 加载或创建数据库
    try {
      const buffer = await fs.readFile(DB_PATH)
      this.db = new SQL.Database(buffer)
    } catch {
      this.db = new SQL.Database()
    }

    // 创建表结构
    this.createTables()

    // 创建索引
    this.createIndexes()
  }

  private createTables(): void {
    // 照片主表
    this.db!.run(`
      CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_hash TEXT UNIQUE,
        file_size INTEGER,
        mime_type TEXT,
        width INTEGER,
        height INTEGER,
        orientation INTEGER DEFAULT 0,
        taken_at DATETIME,
        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        thumbnail_path TEXT,
        status TEXT DEFAULT 'imported'
      )
    `)

    // 元数据表
    this.db!.run(`
      CREATE TABLE IF NOT EXISTS photo_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        photo_id INTEGER NOT NULL,
        exif_data TEXT,
        gps_latitude REAL,
        gps_longitude REAL,
        location_name TEXT,
        make TEXT,
        model TEXT,
        lens TEXT,
        focal_length TEXT,
        aperture TEXT,
        iso INTEGER,
        shutter_speed TEXT,
        flash TEXT,
        raw_data BLOB,
        FOREIGN KEY (photo_id) REFERENCES photos(id)
      )
    `)

    // 向量索引表
    this.db!.run(`
      CREATE TABLE IF NOT EXISTS vector_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        photo_id INTEGER NOT NULL,
        vector_type TEXT NOT NULL,
        vector_model TEXT NOT NULL,
        vector_data BLOB NOT NULL,
        dimensions INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (photo_id) REFERENCES photos(id)
      )
    `)
  }

  private createIndexes(): void {
    this.db!.run(`CREATE INDEX IF NOT EXISTS idx_photos_hash ON photos(file_hash)`)
    this.db!.run(`CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at)`)
    this.db!.run(`CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status)`)
    this.db!.run(`CREATE INDEX IF NOT EXISTS idx_metadata_gps ON photo_metadata(gps_latitude, gps_longitude)`)
    this.db!.run(`CREATE INDEX IF NOT EXISTS idx_vector_type ON vector_index(photo_id, vector_type)`)
  }

  async save(): Promise<void> {
    if (this.db) {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      await fs.writeFile(DB_PATH, buffer)
    }
  }
}

export const db = new DatabaseManager()
```

### Phase 3: 元数据存储服务

**文件**: `electron/services/metadataStore.ts`

```typescript
import { db } from '../database/init'
import crypto from 'crypto'
import exifr from 'exifr'

interface PhotoMetadata {
  width?: number
  height?: number
  make?: string
  model?: string
  lens?: string
  focalLength?: number
  aperture?: number
  iso?: number
  shutterSpeed?: string
  flash?: boolean
  latitude?: number
  longitude?: number
  locationName?: string
  dateTimeOriginal?: Date
}

class MetadataStore {
  async extractAndStore(filePath: string): Promise<number> {
    // 读取文件
    const fileBuffer = await fs.readFile(filePath)
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

    // 提取 EXIF
    const metadata = await this.extractEXIF(filePath)

    // 检查是否已存在
    const existing = await this.findByHash(fileHash)
    if (existing) {
      return existing.id
    }

    // 存储照片记录
    const photoId = await this.insertPhoto({
      fileName: path.basename(filePath),
      filePath,
      fileHash,
      fileSize: fileBuffer.length,
      mimeType: this.getMimeType(filePath),
      ...metadata
    })

    // 存储元数据
    await this.insertMetadata(photoId, metadata)

    return photoId
  }

  private async extractEXIF(filePath: string): Promise<PhotoMetadata> {
    try {
      const output = await exifr.parse(filePath, {
        tiff: true,
        exif: true,
        gps: true,
        interop: false,
        ifd1: true
      })

      return {
        width: output?.ImageWidth,
        height: output?.ImageHeight,
        make: output?.Make,
        model: output?.Model,
        lens: output?.LensModel,
        focalLength: output?.FocalLength,
        aperture: output?.FNumber,
        iso: output?.ISOSpeedRatings,
        shutterSpeed: output?.ExposureTime ? `${output.ExposureTime}s` : undefined,
        flash: output?.Flash,
        latitude: output?.latitude,
        longitude: output?.longitude,
        dateTimeOriginal: output?.DateTimeOriginal
      }
    } catch {
      return {}
    }
  }

  async findByHash(hash: string): Promise<any> {
    const stmt = this.db!.prepare('SELECT * FROM photos WHERE file_hash = ?')
    stmt.bind([hash])

    if (stmt.step()) {
      const row = stmt.getAsObject()
      stmt.free()
      return row
    }

    stmt.free()
    return null
  }

  async findByDateRange(start: Date, end: Date): Promise<any[]> {
    const stmt = this.db!.prepare(`
      SELECT p.*, pm.location_name
      FROM photos p
      LEFT JOIN photo_metadata pm ON p.id = pm.photo_id
      WHERE p.taken_at BETWEEN ? AND ?
      ORDER BY p.taken_at DESC
    `)
    stmt.bind([start.toISOString(), end.toISOString()])

    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()

    return results
  }
}

export const metadataStore = new MetadataStore()
```

## 相关文件

- `electron/database/schema.ts` - 数据库 schema
- `electron/database/init.ts` - 数据库初始化
- `electron/services/metadataStore.ts` - 元数据存储服务

## 测试用例

```typescript
describe('MetadataStore', () => {
  it('should extract EXIF data from photo', async () => {
    const metadata = await metadataStore.extractEXIF('/test/photo.jpg')
    expect(metadata.width).toBe(4032)
    expect(metadata.height).toBe(3024)
  })

  it('should not duplicate photos by hash', async () => {
    const id1 = await metadataStore.extractAndStore('/test/photo.jpg')
    const id2 = await metadataStore.extractAndStore('/test/photo.jpg')
    expect(id1).toBe(id2)
  })

  it('should query photos by date range', async () => {
    const results = await metadataStore.findByDateRange(
      new Date('2024-01-01'),
      new Date('2024-12-31')
    )
    expect(results.length).toBeGreaterThan(0)
  })
})
```

## 风险和依赖

- **依赖**: exifr 库用于 EXIF 提取
- **风险**: 大文件可能导致内存问题，需要流式处理
- **注意**: HEIC 格式需要额外处理
