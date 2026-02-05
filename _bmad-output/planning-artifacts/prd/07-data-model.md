# 7. 数据模型

## 7.1 照片表 (photos)

| 字段 | 类型 | 描述 |
|------|------|------|
| uuid | VARCHAR(36) | 唯一标识 |
| file_path | VARCHAR(512) | 文件路径 |
| file_name | VARCHAR(255) | 文件名 |
| file_size | BIGINT | 文件大小 |
| mime_type | VARCHAR(50) | MIME 类型 |
| width | INTEGER | 宽度 |
| height | INTEGER | 高度 |
| taken_at | DATETIME | 拍摄时间 |
| imported_at | DATETIME | 导入时间 |
| exif_data | TEXT | EXIF JSON |
| location_data | TEXT | 位置 JSON |
| thumbnail_path | VARCHAR(512) | 缩略图路径 |
| is_favorite | BOOLEAN | 是否收藏 |
| description | TEXT | 描述 |

## 7.2 人物表 (persons)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | INTEGER | 主键 |
| name | VARCHAR(100) | 人物名称 |
| face_encoding | BLOB | 人脸编码 |
| photo_count | INTEGER | 照片数量 |
| created_at | DATETIME | 创建时间 |

## 7.3 人脸表 (faces)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | INTEGER | 主键 |
| photo_uuid | VARCHAR(36) | 照片 UUID |
| person_id | INTEGER | 人物 ID |
| face_rect | TEXT | 人脸区域 |
| confidence | FLOAT | 置信度 |

## 7.4 向量表 (vectors)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | INTEGER | 主键 |
| photo_uuid | VARCHAR(36) | 照片 UUID |
| embedding | BLOB | CLIP 向量 (512 维) |
| embedding_type | VARCHAR(20) | 向量类型 (image/text) |
| created_at | DATETIME | 创建时间 |
