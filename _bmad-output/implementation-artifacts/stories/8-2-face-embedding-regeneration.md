# Story 8.2: 人脸向量重新生成

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 开发工程师,
I want 重新生成所有人脸的128维向量并重新聚类,
so that 修复当前6维向量导致的聚类质量问题。

## Acceptance Criteria

1. **批量向量重新生成任务** [Source: _bmad-output/planning-artifacts/epics/08-epic-08-dual-vector.md#Story-E-08.2]
   - [ ] 创建后台批量处理脚本，处理现有 1,344 张人脸记录
   - [ ] 使用 face-api.js FaceRecognitionModel 生成 128维向量
   - [ ] 使用 CLIP 模型生成 512维向量
   - [ ] 后台队列处理，避免阻塞 UI
   - [ ] 支持断点续传和进度追踪
   - [ ] 每批次处理 50 张人脸，处理间隔释放内存

2. **重新聚类** [Source: electron/services/faceMatchingService.ts]
   - [ ] 清除现有人物关联（保留空人物记录以便清理）
   - [ ] 基于 128维 face_embedding 使用 DBSCAN 算法聚类
   - [ ] 参数：epsilon=0.6, minPoints=2
   - [ ] 自动生成人物名称 "人物 N"
   - [ ] 单一人脸不被分配到多个人物

3. **聚类质量控制** [Source: _bmad-output/implementation-artifacts/sprint-plan-e08.md]
   - [ ] 预期生成 3-10 个有效人物组
   - [ ] 每个有效人物组包含 >5 张人脸
   - [ ] 删除或归档 face_count=0 的空人物
   - [ ] 清理数据库中的 4,032 个空人物记录

4. **用户功能验证** [Source: src/renderer/views/PeopleView.vue]
   - [ ] 用户访问人物页面能看到正确的人物分组
   - [ ] 点击某个人物正确显示该人物关联的所有照片
   - [ ] 人物照片显示无重复、无遗漏

## Tasks / Subtasks

- [ ] 任务1: 创建批量向量重新生成脚本 (AC: #1)
  - [ ] 1.1 创建 electron/scripts/regenerateFaceEmbeddings.ts
  - [ ] 1.2 实现断点续传机制，记录处理进度到文件
  - [ ] 1.3 实现批次处理逻辑（每批 50 张人脸）
  - [ ] 1.4 添加内存管理，批次间调用 global.gc()
  - [ ] 1.5 添加进度追踪和日志输出
  - [ ] 1.6 支持暂停/恢复功能

- [ ] 任务2: 实现向量生成逻辑 (AC: #1)
  - [ ] 2.1 查询所有 vector_version < 2 的人脸记录
  - [ ] 2.2 调用 face-api FaceRecognitionNet 生成 128维向量
  - [ ] 2.3 调用 CLIP 服务生成 512维向量
  - [ ] 2.4 更新数据库 face_embedding 和 semantic_embedding
  - [ ] 2.5 设置 vector_version = 2
  - [ ] 2.6 处理错误情况（照片不存在、模型加载失败等）

- [ ] 任务3: 实现重新聚类逻辑 (AC: #2)
  - [ ] 3.1 创建 clearPersonFaceLinks() 函数清除现有关联
  - [ ] 3.2 查询所有已生成 128维向量的人脸
  - [ ] 3.3 实现基于 128维向量的余弦相似度计算
  - [ ] 3.4 使用 DBSCAN 算法聚类（epsilon=0.6, minPoints=2）
  - [ ] 3.5 创建 person 记录，命名为 "人物 N"
  - [ ] 3.6 建立 face → person 的关联

- [ ] 任务4: 数据清理 (AC: #3)
  - [ ] 4.1 创建 cleanupEmptyPersons() 函数
  - [ ] 4.2 删除 face_count=0 的空人物记录
  - [ ] 4.3 清理孤立的 person_tags 记录
  - [ ] 4.4 更新数据库统计信息
  - [ ] 4.5 验证清理后人物数量在 3-10 个范围内

- [ ] 任务5: 进度追踪与报告 (AC: #1)
  - [ ] 5.1 创建进度存储文件 data/regenerate-progress.json
  - [ ] 5.2 记录已处理的人脸 ID 列表
  - [ ] 5.3 记录处理速度（人脸/秒）
  - [ ] 5.4 估算剩余时间
  - [ ] 5.5 生成最终报告（处理数量、错误数量、耗时）

- [ ] 任务6: 用户界面集成 (AC: #4)
  - [ ] 6.1 在 SettingsView 添加"重新生成向量"按钮
  - [ ] 6.2 显示当前进度（已处理/总数）
  - [ ] 6.3 显示处理状态（运行中/已完成/错误）
  - [ ] 6.4 提供取消/暂停功能

- [ ] 任务7: 测试与验证
  - [ ] 7.1 验证所有 1,344 张人脸都有 128维向量
  - [ ] 7.2 验证聚类结果生成 3-10 个有效人物
  - [ ] 7.3 验证无单一人脸被分配到多个人物
  - [ ] 7.4 验证点击人物能正确显示照片

## Dev Notes

### 架构模式与约束

- **断点续传机制**: 处理大量数据时避免重复工作
  - 进度存储在独立 JSON 文件中
  - 记录最后处理的人脸 ID
  - 重启后从断点继续
- **后台批处理**: 避免阻塞主线程和 UI
  - 使用 setTimeout 或 setImmediate 让步
  - 每批次后主动调用 global.gc() 释放内存
  - Electron 环境下需要考虑主进程阻塞问题
- **幂等性**: 脚本可重复运行，不会重复处理已完成的记录
  - 通过 vector_version 字段标记状态
  - 或者通过进度文件记录已处理 ID

### 性能估算

基于当前数据规模：
- 人脸总数：1,344 张
- 每批处理：50 张
- 批次数量：约 27 批
- 每张人脸处理时间：~500ms（face-api + CLIP）
- 预估总时间：约 11-15 分钟
- 加上批次间隔和 GC：约 15-20 分钟

### 源代码组件

需要修改/创建的文件：

| 文件路径 | 修改内容 |
|----------|----------|
| `electron/scripts/regenerateFaceEmbeddings.ts` | 新建批量处理脚本 |
| `electron/services/faceMatchingService.ts` | 修改聚类逻辑，使用 128维向量 |
| `electron/services/personService.ts` | 添加数据清理函数 |
| `src/renderer/views/SettingsView.vue` | 添加重新生成向量 UI |
| `electron/main/index.ts` | 添加 IPC 处理脚本调用 |

### SQL.js 特殊处理

- BLOB 存储使用 Uint8Array
- 128维向量 = 128 * 4 = 512 bytes
- 512维向量 = 512 * 4 = 2048 bytes
- 读取时使用 Float32Array 解析

### 错误处理

需要处理的异常情况：
- 照片文件被删除或移动
- face-api 模型未加载
- CLIP 模型未加载
- 内存不足（需要减小批次大小）
- 数据库写入失败

### References

- [Source: _bmad-output/planning-artifacts/epics/08-epic-08-dual-vector.md] - Epic E-08.2 完整需求
- [Source: _bmad-output/implementation-artifacts/sprint-plan-e08.md] - Sprint Plan 时间线
- [Source: scripts/face-clustering-resume.js] - 之前的聚类脚本参考
- [Source: electron/services/faceDetectionService.ts] - 向量生成逻辑参考
- [Source: electron/services/faceMatchingService.ts] - 聚类算法参考
- DBSCAN 算法参考: https://github.com/echo-karriereit/node-density-clustering

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5

### Debug Log References

- 之前创建的 face-clustering-resume.js 成功聚类 1,344 张人脸
- 但生成的 4,032 个人物说明聚类质量有问题
- 根本原因是 embedding 只有 6维而非 128维
- E-08.1 完成后，本 Story 执行重新生成和聚类

### Completion Notes List

- [ ] 批量处理脚本创建完成
- [ ] 向量生成逻辑实现完成
- [ ] 重新聚类完成
- [ ] 数据清理完成
- [ ] 进度追踪实现完成
- [ ] UI 集成完成
- [ ] 测试验证通过

### File List

- electron/scripts/regenerateFaceEmbeddings.ts（新建）
- electron/services/faceMatchingService.ts（修改）
- electron/services/personService.ts（修改）
- src/renderer/views/SettingsView.vue（修改）
- electron/main/index.ts（修改）
- data/regenerate-progress.json（运行时生成）
