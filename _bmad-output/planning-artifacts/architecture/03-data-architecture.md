# 3. 数据架构

## 3.1 数据库概览

```
data/photo-mind.db (SQLite)
│
├── photos          # 照片元数据
├── faces           # 人脸识别数据
├── persons         # 人物信息
├── vectors         # CLIP 向量嵌入
├── tags            # 标签
├── photo_tags      # 照片-标签关联
└── albums          # 智能相册
```

## 3.2 详细表结构

### 3.2.1 photos 表

```sql
CREATE TABLE photos (
  uuid VARCHAR(36) PRIMARY KEY,
  file_path VARCHAR(512) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  width INTEGER,
  height INTEGER,
  taken_at DATETIME,
  imported_at DATETIME NOT NULL,
  exif_data TEXT,           -- JSON: {"camera": "...", "focal_length": ...}
  location_data TEXT,        -- JSON: {"latitude": ..., "longitude": ..., "address": "..."}
  thumbnail_path VARCHAR(512),
  is_favorite BOOLEAN DEFAULT 0,
  description TEXT,
  metadata_version INTEGER DEFAULT 1
);

CREATE INDEX idx_photos_taken_at ON photos(taken_at);
CREATE INDEX idx_photos_imported_at ON photos(imported_at);
```

### 3.2.2 vectors 表

```sql
CREATE TABLE vectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_uuid VARCHAR(36) NOT NULL,
  embedding BLOB NOT NULL,       -- Float32Array 压缩存储
  embedding_type VARCHAR(20) NOT NULL DEFAULT 'image',
  created_at DATETIME NOT NULL,

  FOREIGN KEY (photo_uuid) REFERENCES photos(uuid) ON DELETE CASCADE,
  UNIQUE(photo_uuid, embedding_type)
);

CREATE INDEX idx_vectors_photo ON vectors(photo_uuid);
```

### 3.2.3 persons 表

```sql
CREATE TABLE persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(100) NOT NULL,
  face_encoding BLOB,            -- 人脸特征向量（用于人脸比对）
  photo_count INTEGER DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE INDEX idx_persons_name ON persons(name);
```

### 3.2.4 faces 表

```sql
CREATE TABLE faces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_uuid VARCHAR(36) NOT NULL,
  person_id INTEGER,
  face_rect TEXT NOT NULL,       -- JSON: {"x": 100, "y": 200, "width": 80, "height": 80}
  confidence REAL NOT NULL,      -- 人脸检测置信度
  embedding BLOB,                -- 人脸特征向量（可选，用于快速比对）
  is_confirmed BOOLEAN DEFAULT 0, -- 是否已确认关联人物

  FOREIGN KEY (photo_uuid) REFERENCES photos(uuid) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL
);

CREATE INDEX idx_faces_photo ON faces(photo_uuid);
CREATE INDEX idx_faces_person ON faces(person_id);
```

## 3.3 数据流

```
照片导入流程:
┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│ 用户选择 │───►│ 扫描照片文件 │───►│ EXIF 提取   │───►│ 缩略图   │
│ 文件夹   │    │              │    │             │    │ 生成     │
└──────────┘    └──────────────┘    └─────────────┘    └──────────┘
                                              │
                                              ▼
                                        ┌──────────┐
                                        │ 存入     │
                                        │ photos表 │
                                        └──────────┘
                                              │
                                              ▼
                                        ┌──────────┐
                                        │ CLIP     │
                                        │ 向量生成 │
                                        └──────────┘
                                              │
                                              ▼
                                        ┌──────────┐
                                        │ 存入     │
                                        │ vectors表│
                                        └──────────┘
```
