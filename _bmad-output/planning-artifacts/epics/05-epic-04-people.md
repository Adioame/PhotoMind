# Epic E-04: 人物管理系统

**Goal**: 实现人物标记和人脸识别，让用户能按人物搜索照片

**FRs 覆盖:** FR-04.1, FR-04.2, FR-04.3, FR-04.4, FR-04.5, FR-04.6, FR-04.7

---

## Story E-04.1: 手动标记人物

As a 用户,
I want 为照片添加人物标签,
So that 可以按人物名称搜索相关照片

**Acceptance Criteria:**

**Given** 用户查看照片详情
**When** 用户点击"添加人物"
**Then** 用户可以输入人物姓名
**And** 系统检测照片中的人脸区域
**And** 提取人脸特征向量存入 faces 表

---

## Story E-04.2: 人脸自动检测

As a 系统,
I want 自动检测照片中的人脸,
So that 减少用户手动标记的工作量

**Acceptance Criteria:**

**Given** 新照片导入
**When** 导入处理中
**Then** 使用人脸检测模型检测照片中的人脸
**And** 对每个检测到的人脸提取特征向量
**And** 暂存为未命名人物

---

## Story E-04.3: 人脸自动匹配

As a 用户,
I want 系统自动识别同一个人物,
So that 不用重复标记同一人物的不同照片

**Acceptance Criteria:**

**Given** 用户已标记某人物的多张照片
**When** 新照片中检测到人脸
**Then** 与已标记人物的人脸特征比对
**And** 相似度 > 阈值（如 0.8）则自动关联
**And** 相似度 < 阈值则标记为待确认

---

## Story E-04.4: 人物搜索

As a 用户,
I want 输入人物名称搜索相关照片,
So that 快速找到与特定人物的合影

**Acceptance Criteria:**

**Given** 用户输入搜索查询包含人物名称
**When** 执行搜索
**Then** LLM 识别人物搜索意图
**And** 关联 faces/persons 表查找该人物的照片
**And** 返回该人物的所有照片
