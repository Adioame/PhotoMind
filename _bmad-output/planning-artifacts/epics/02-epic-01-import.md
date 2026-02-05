# Epic E-01: 数据导入层

**Goal**: 实现照片的多源导入（iCloud + 本地），建立照片数据基础

**FRs 覆盖:** FR-01.1, FR-01.2, FR-01.3, FR-01.4, FR-01.5, FR-01.6

---

## Story E-01.1: 本地照片文件夹导入

As a 用户,
I want 选择本地文件夹批量导入照片,
So that 我可以将本地照片纳入 PhotoMind 管理

**Acceptance Criteria:**

**Given** 用户已打开 PhotoMind 应用
**When** 用户点击"导入照片"并选择本地文件夹
**Then** 系统扫描选中文件夹及其子文件夹中的照片文件
**And** 系统显示扫描进度和预估照片数量
**And** 系统支持 JPG, PNG, HEIC, RAW 格式

**Given** 扫描完成
**When** 用户确认导入
**Then** 系统显示导入进度条
**And** 每张照片导入时提取 EXIF 元数据（日期、位置、设备）
**And** 生成照片缩略图
**And** 照片存入数据库 photos 表

**Given** 导入过程中
**When** 遇到重复照片
**Then** 系统提示用户选择跳过或保留

---

## Story E-01.2: iCloud 照片库连接

As a iCloud 用户,
I want 连接并同步我的 iCloud 照片库,
So that 我可以在 PhotoMind 中浏览和管理 iCloud 照片

**Acceptance Criteria:**

**Given** 用户在 macOS 上使用 PhotoMind
**When** 用户点击"连接 iCloud"
**Then** 系统请求访问 iCloud 照片库的权限
**And** 用户授权后显示 iCloud 照片库概览（照片数量、已同步数量）

**Given** 用户已授权 iCloud 访问
**When** 用户选择同步范围（全库或部分相册）
**Then** 系统开始下载照片元数据和缩略图
**And** 显示同步进度

**Given** 照片已同步到本地
**When** iCloud 照片有更新
**Then** 系统自动检测变更并增量同步

---

## Story E-01.3: 元数据自动提取

As a 用户,
I want 系统自动提取照片的详细信息,
So that 我可以通过日期、地点等条件搜索照片

**Acceptance Criteria:**

**Given** 照片正在导入
**When** 系统处理每张照片
**Then** 自动提取 EXIF 数据：拍摄日期、相机型号、曝光参数
**And** 提取 GPS 坐标（如果存在）
**And** 提取图片尺寸、文件大小
**And** 生成多种尺寸的缩略图

**Given** 提取完成
**When** 查看照片详情
**Then** 显示所有提取的元数据

---

## Story E-01.4: 导入进度与状态管理

As a 用户,
I want 看到照片导入的实时进度,
So that 我知道导入状态和剩余时间

**Acceptance Criteria:**

**Given** 用户启动照片导入
**When** 导入进行中
**Then** 显示进度条（百分比）
**And** 显示已处理/总照片数
**And** 显示当前处理中的文件名
**And** 显示预估剩余时间

**Given** 导入完成
**When** 导入结束
**Then** 显示导入摘要（成功数、失败数、重复跳过数）
**And** 失败的照片显示错误原因
