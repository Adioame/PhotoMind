# Epic E-03: 混合搜索服务

**Goal**: 实现 LLM 解析 + 关键词搜索 + 向量搜索的混合搜索

**FRs 覆盖:** FR-02.1, FR-02.2, FR-02.3, FR-02.4, FR-02.5, FR-02.6, FR-02.7, FR-02.8, FR-02.9, FR-02.10

---

## Story E-03.1: LLM 查询解析

As a 用户,
I want 系统理解我的自然语言查询,
So that 即使描述不精确也能找到目标照片

**Acceptance Criteria:**

**Given** 用户输入自然语言查询（如"去年在海边的照片"）
**When** 提交搜索
**Then** 调用 LLM API 解析查询意图
**And** 提取明确条件：时间范围、地点关键词、人物名称
**And** 提取语义描述关键词（如"海边"相关的视觉特征）

**Given** LLM 解析结果
**When** 解析成功
**Then** 返回结构化的搜索条件对象

---

## Story E-03.2: 关键词搜索

As a 用户,
I want 基于具体条件搜索照片,
So that 可以快速缩小搜索范围

**Acceptance Criteria:**

**Given** LLM 已解析出关键词条件
**When** 执行关键词搜索
**Then** 根据时间范围查询 photos 表
**And** 根据地点关键词匹配 location_data
**And** 根据人物名称关联 faces/persons 表
**And** 返回满足所有条件的照片列表

---

## Story E-03.3: 全局向量搜索

As a 用户,
I want 在整个照片库中进行语义搜索,
So that 可以找到关键词无法描述的照片

**Acceptance Criteria:**

**Given** LLM 已提取语义描述关键词
**When** 执行全局向量搜索
**Then** 将语义描述转为向量
**And** 在 vectors 表中搜索最相似的照片
**And** 返回 top-K 结果（可配置，默认为 50）

---

## Story E-03.4: 结果融合与排序

As a 用户,
I want 合并多种搜索结果并看到最相关的,
So that 搜索结果按真实相关性排序

**Acceptance Criteria:**

**Given** 关键词搜索和向量搜索完成
**When** 执行结果融合
**Then** 对两个结果集取并集
**And** 每张照片计算综合分数：
- 关键词匹配分数（满足条件 = 1.0）
- 向量相似度分数
**And** 综合分数 = 关键词权重 * 关键词分数 + 向量权重 * 相似度分数
**And** 按综合分数降序排列

**Given** 结果列表
**When** 显示搜索结果
**Then** 每张照片显示置信度分数
**And** 清楚标注匹配来源（关键词/向量/两者）
