# Epic E-02: CLIP 语义搜索

**Goal**: 集成 CLIP 模型，实现真正的语义搜索能力

**FRs 覆盖:** FR-03.1, FR-03.2, FR-03.3, FR-03.4, FR-03.5, FR-03.6, FR-03.7

---

## Story E-02.1: CLIP 模型集成

As a 开发者,
I want 集成 CLIP 模型到 PhotoMind,
So that 系统可以进行图片和文本的语义嵌入

**Acceptance Criteria:**

**Given** PhotoMind 应用启动
**When** 首次需要进行语义搜索
**Then** 系统后台下载并加载 CLIP 模型
**And** 模型缓存到本地磁盘（下次启动快速加载）

**Given** CLIP 模型加载
**When** 模型加载成功
**Then** 系统支持文本到向量和图片到向量的转换

---

## Story E-02.2: 图片向量生成

As a 系统,
I want 将每张照片转换为 CLIP 向量,
So that 可以进行语义相似度计算

**Acceptance Criteria:**

**Given** 照片已导入数据库
**When** 触发向量生成（手动或自动）
**Then** 读取照片文件
**And** 使用 CLIP 模型生成 512 维向量
**And** 向量数据存入 vectors 表（photo_uuid, embedding, embedding_type）
**And** 标记该照片已完成向量生成

**Given** 大量照片需要生成向量
**When** 批量处理中
**Then** 显示处理进度
**And** 支持后台异步处理
**And** 意外退出后支持断点续传

---

## Story E-02.3: 文本向量生成

As a 用户,
I want 将自然语言查询转换为向量,
So that 可以进行语义相似度搜索

**Acceptance Criteria:**

**Given** 用户输入自然语言搜索查询
**When** 查询需要语义搜索
**Then** 使用 CLIP 模型将查询文本转为 512 维向量
**And** 向量用于后续相似度计算

---

## Story E-02.4: 向量相似度搜索

As a 用户,
I want 基于语义找到相似的照片,
So that 即使没有精确关键词也能找到想要的照片

**Acceptance Criteria:**

**Given** 查询向量已生成
**When** 执行向量搜索
**Then** 在 vectors 表中计算余弦相似度
**And** 返回相似度最高的前 N 张照片
**And** 每张照片附带相似度分数（0-1）

**Given** 需要混合搜索
**When** 同时执行关键词和向量搜索
**Then** 返回两个搜索结果的并集
**And** 按加权分数排序

---

## Story E-02.5: 增量向量生成

As a 用户,
I want 新导入的照片自动生成向量,
So that 无需手动操作即可使用语义搜索

**Acceptance Criteria:**

**Given** 新照片导入完成
**When** 导入成功
**Then** 系统自动调用 CLIP 生成向量
**And** 向量存入 vectors 表

**Given** 向量生成失败
**When** 处理异常
**Then** 记录失败照片到队列
**And** 稍后重试
