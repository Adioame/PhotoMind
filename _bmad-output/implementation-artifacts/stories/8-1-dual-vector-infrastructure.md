# Story 8.1: 双向量基础设施

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 系统架构师,
I want 建立双向量数据模型和API基础设施,
so that 支持同时存储和查询两种向量（128维人脸 + 512维语义）。

## Acceptance Criteria

1. **数据库迁移** [Source: _bmad-output/planning-artifacts/epics/08-epic-08-dual-vector.md#Story-E-08.1]
   - [ ] 添加 `face_embedding` (128维 BLOB) 字段到 detected_faces 表
   - [ ] 添加 `semantic_embedding` (512维 BLOB) 字段
   - [ ] 添加 `vector_version` INTEGER 字段用于版本追踪
   - [ ] 保留现有 `embedding` 字段作为兼容层
   - [ ] 数据库迁移版本升级到 v3

2. **API 修复与统一** [Source: src/renderer/stores/peopleStore.ts]
   - [ ] 修复 peopleStore.ts 调用方式，统一使用 snake_case 命名
   - [ ] 确保 Preload 桥接正确暴露所有 people API
   - [ ] 修复 TypeScript 类型定义，统一 Person 接口字段

3. **双向量生成逻辑** [Source: electron/services/faceDetectionService.ts]
   - [ ] 修改人脸检测流程，检测时并行生成两种向量
   - [ ] 使用 face-api.js FaceRecognitionModel 生成 128维 face_embedding
   - [ ] 使用 CLIP 模型生成 512维 semantic_embedding
   - [ ] 两个向量同时存入数据库
   - [ ] vector_version 标记为 2（双向量版本）

4. **聚类使用正确的向量**
   - [ ] 聚类算法使用 128维 face_embedding 进行余弦相似度计算
   - [ ] 相似度阈值设为 0.6
   - [ ] 语义搜索使用 512维 semantic_embedding，阈值 0.25

## Tasks / Subtasks

- [ ] 任务1: 数据库 Schema 迁移 (AC: #1)
  - [ ] 1.1 修改 electron/database/db.ts，添加 migration_v3
  - [ ] 1.2 添加 face_embedding BLOB 字段 (128维 = 128 * 4 bytes)
  - [ ] 1.3 添加 semantic_embedding BLOB 字段 (512维 = 512 * 4 bytes)
  - [ ] 1.4 添加 vector_version INTEGER 字段，默认 0
  - [ ] 1.5 测试迁移脚本，验证字段创建成功

- [ ] 任务2: 统一命名规范与 API 修复 (AC: #2)
  - [ ] 2.1 检查并统一 Person 接口所有字段为 snake_case
    - [ ] 2.1.1 electron/services/personService.ts 中的 Person 接口
    - [ ] 2.1.2 src/renderer/stores/peopleStore.ts 中的 Person 接口
    - [ ] 2.1.3 electron/preload/index.ts 暴露的 API 类型
  - [ ] 2.2 验证 peopleStore.ts 使用 getPhotos 而非 searchPhotos
  - [ ] 2.3 修复 Preload 桥接确保所有 API 正确暴露

- [ ] 任务3: 双向量生成实现 (AC: #3)
  - [ ] 3.1 修改 electron/services/faceDetectionService.ts
    - [ ] 3.1.1 在 detectFaces 函数中并行调用两种向量生成
    - [ ] 3.1.2 使用 face-api FaceRecognitionNet 生成 128维向量
    - [ ] 3.1.3 使用 CLIP 服务生成 512维向量
  - [ ] 3.2 修改 saveDetectedFace 函数，保存两种向量
  - [ ] 3.3 设置 vector_version = 2 标记双向量数据

- [ ] 任务4: 聚类与搜索使用正确向量 (AC: #4)
  - [ ] 4.1 修改 electron/services/faceMatchingService.ts
    - [ ] 4.1.1 读取 face_embedding 而非旧 embedding
    - [ ] 4.1.2 确保余弦相似度计算使用 128维向量
    - [ ] 4.1.3 聚类阈值保持 epsilon=0.6
  - [ ] 4.2 验证语义搜索使用 512维 semantic_embedding

- [ ] 任务5: 测试与验证
  - [ ] 5.1 运行新的人脸检测，验证双向量正确生成
  - [ ] 5.2 检查数据库中 face_embedding 长度为 128 * 4 bytes
  - [ ] 5.3 检查数据库中 semantic_embedding 长度为 512 * 4 bytes
  - [ ] 5.4 验证点击人物能正确显示照片

## Dev Notes

### 架构模式与约束

- **双向量架构**: 128维 face-api 向量专精人脸识别，512维 CLIP 向量支持语义搜索
  - 优势：各自优化，互不干扰
  - 代价：存储空间翻倍（约 2.5KB/人脸 vs 0.5KB/人脸）
- **向量版本控制**: vector_version 字段用于标记数据状态
  - 0 = 旧数据（6维或缺失）
  - 1 = 过渡数据（单512维）
  - 2 = 完整双向量
- **数据库兼容性**: SQL.js 使用 Uint8Array 存储 BLOB，需要正确转换

### 源代码组件

需要修改的关键文件：

| 文件路径 | 修改内容 |
|----------|----------|
| `electron/database/db.ts` | 添加 migration_v3，创建新字段 |
| `electron/services/faceDetectionService.ts` | 并行生成双向量 |
| `electron/services/faceMatchingService.ts` | 使用 128维向量聚类 |
| `electron/services/personService.ts` | 统一 Person 接口 |
| `src/renderer/stores/peopleStore.ts` | 统一字段命名 |
| `electron/preload/index.ts` | 验证 API 暴露 |

### 测试标准

- 单元测试：验证向量维度正确性
- 集成测试：验证人脸检测后双向量存储
- 手动测试：点击人物显示照片功能正常

### 项目结构注意事项

- 保持与现有项目结构一致（electron/, src/renderer/, tests/）
- 数据库迁移需向前兼容，不能破坏现有数据
- 命名规范统一使用 snake_case 与数据库保持一致

### References

- [Source: _bmad-output/planning-artifacts/epics/08-epic-08-dual-vector.md] - Epic E-08 完整需求
- [Source: electron/services/faceDetectionService.ts] - 人脸检测服务
- [Source: electron/database/db.ts] - 数据库定义与迁移
- [Source: src/renderer/stores/peopleStore.ts] - 前端 People Store
- Face-api.js FaceRecognitionNet: https://github.com/justadudewhohacks/face-api.js/#face-recognition

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5

### Debug Log References

- 之前修复：peopleStore.ts 从 searchPhotos 改为 getPhotos
- 之前修复：personService.ts 统一使用 snake_case 字段
- 问题根源：当前 embedding 只有 6维（疑似 bbox 坐标），而非 128维人脸特征

### Completion Notes List

- [ ] 数据库迁移完成
- [ ] API 命名统一完成
- [ ] 双向量生成逻辑完成
- [ ] 聚类使用正确向量完成
- [ ] 测试验证通过

### File List

- electron/database/db.ts
- electron/services/faceDetectionService.ts
- electron/services/faceMatchingService.ts
- electron/services/personService.ts
- src/renderer/stores/peopleStore.ts
- electron/preload/index.ts
