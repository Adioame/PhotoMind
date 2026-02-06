# Epic E-08: 双向量架构升级

**Goal**: 升级向量系统为双向量架构（128维人脸 + 512维语义），提升人物聚类精度和语义搜索能力

**FRs 覆盖:** FR-08.1, FR-08.2, FR-08.3

---

## Story E-08.1: 双向量基础设施

As a 系统架构师,
I want 建立双向量数据模型和API基础设施,
So that 支持同时存储和查询两种向量

**Acceptance Criteria:**

**Given** 现有 detected_faces 表
**When** 执行数据库迁移
**Then** 添加 face_embedding (128维 BLOB) 字段
**And** 添加 semantic_embedding (512维 BLOB) 字段
**And** 添加 vector_version INTEGER 字段用于版本追踪
**And** 保留现有 embedding 字段作为兼容层

**Given** 新的人脸检测流程
**When** 检测到人脸时
**Then** 并行生成 face_embedding (128维) 用于精准聚类
**And** 生成 semantic_embedding (512维) 用于语义搜索
**And** 两个向量同时存入数据库

**Given** API 调用场景
**When** 聚类人物时
**Then** 使用 128维 face_embedding 进行余弦相似度计算
**And** 相似度阈值设为 0.6

**Given** 语义搜索场景
**When** 执行文本搜索时
**Then** 使用 512维 semantic_embedding 进行相似度匹配
**And** 相似度阈值设为 0.25

---

## Story E-08.2: 人脸向量重新生成

As a 开发工程师,
I want 重新生成所有人脸的128维向量并重新聚类,
So that 修复当前6维向量导致的聚类质量问题

**Acceptance Criteria:**

**Given** 数据库中现有 1344 张人脸记录
**When** 执行批量向量重新生成任务
**Then** 使用 face-api.js FaceRecognitionModel 生成 128维向量
**And** 使用 CLIP 模型生成 512维向量
**And** 后台队列处理，避免阻塞 UI
**And** 支持断点续传和进度追踪

**Given** 新向量生成完成后
**When** 执行重新聚类
**Then** 清除现有人物关联（保留空人物记录）
**And** 基于 128维向量使用 DBSCAN 算法聚类
**And** epsilon=0.6, minPoints=2
**And** 自动生成人物名称 "人物 N"

**Given** 聚类完成后
**When** 检查聚类质量
**Then** 预期生成 3-10 个有效人物组
**And** 每个有效人物组包含 >5 张人脸
**And** 删除或归档 face_count=0 的空人物

**Given** 用户访问人物页面
**When** 点击某个人物
**Then** 正确显示该人物关联的所有照片
**And** 修复 searchPhotos API 断裂问题

---

## Story E-08.3: 质量验证与优化

As a QA 工程师,
I want 验证双向量系统的质量并优化性能,
So that 确保系统稳定性和搜索精度

**Acceptance Criteria:**

**Given** 双向量系统上线后
**When** 执行人物聚类质量验证
**Then** 同一人物的不同照片相似度 > 0.6
**And** 不同人物的照片相似度 < 0.6
**And** 无单一人脸被错误分配到多个人物

**Given** 语义搜索场景
**When** 搜索 "我和妈妈在公园"
**Then** 返回包含指定人物和户外场景的照片
**And** 使用 512维向量进行跨模态匹配

**Given** 性能测试
**When** 搜索 940 张照片的向量库
**Then** 响应时间 < 500ms
**And** 内存占用 < 500MB
**And** 支持并发查询

**Given** 模型加载场景
**When** 应用启动时
**Then** 并行加载 face-api 和 CLIP 模型
**And** 总加载时间 < 10秒
**And** 提供模型加载进度指示

---

## 技术备注

### 架构决策

1. **128维 vs 512维选择**
   - 128维：face-api.js 标准，计算快，专精人脸
   - 512维：CLIP 标准，支持语义，通用性强
   - 决策：双向量共存，各取所长

2. **数据迁移策略**
   - 保留旧 embedding 字段作为兼容层
   - 新增 face_embedding 和 semantic_embedding
   - 后台任务逐步填充新向量

3. **聚类算法优化**
   - 使用 DBSCAN 替代简单阈值聚类
   - 基于 128维向量计算相似度
   - 参数：epsilon=0.6, minPoints=2

### 依赖关系

- 依赖 E-02 (CLIP 语义搜索) 的向量生成能力
- 依赖 E-04 (人物管理) 的人脸检测基础
- 可与 E-03 (混合搜索) 集成增强语义能力
