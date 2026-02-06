# Epic E-10: 人脸扫描状态同步修复

**Goal**: 修复人脸扫描流程中主进程与渲染进程状态不同步导致的"100%卡住"问题

**Priority**: P0（阻塞性问题）

**Related Issues**:
- 扫描达到 100% 后无法自动结束
- 点击"自动识别"提示"没有新的面孔需要识别"
- 队列状态 `isRunning=false, pending=0` 但 UI 仍显示"正在扫描..."

---

## 问题根因

**核心问题**：扫描状态与 UI 组件生命周期强耦合

当用户在扫描过程中切换标签页时，`PeopleView.vue` 组件被销毁重建，导致 `ipcRenderer.on('face-scan-complete')` 监听器丢失。主进程发送完成信号时，新的组件实例尚未重新注册监听器，造成状态死锁。

---

## Story E-10.1: 全局扫描状态管理器

As a 开发工程师,
I want 将扫描状态管理从视图层下沉到全局单例,
So that 无论用户如何切换页面，扫描状态监听永不丢失

**Acceptance Criteria:**

**Given** 应用启动
**When** 初始化全局状态管理器
**Then** 在 `App.vue` 或 `main.ts` 中注册全局扫描状态 Store
**And** Store 在应用生命周期内永不被卸载
**And** Store 内部注册 IPC 监听器，接收主进程进度/完成事件

**Given** 用户启动人脸扫描
**When** 扫描进行中
**Then** 全局 Store 接收并存储进度状态
**And** 视图组件（PeopleView）只读取 Store，不直接注册监听

**Given** 用户切换标签页
**When** PeopleView 组件销毁重建
**Then** Store 保持监听活跃
**And** 重建后的 PeopleView 能立即从 Store 获取当前状态

---

## Story E-10.2: 周期性状态对账机制

As a 开发工程师,
I want 在扫描状态下定期进行主从状态对账,
So that 即使 IPC 事件丢失也能自动恢复状态一致性

**Acceptance Criteria:**

**Given** 扫描状态为 `scanning`
**When** 每 10 秒触发一次状态对账
**Then** 渲染进程主动查询主进程队列状态
**And** 对比本地状态与主进程状态

**Given** 对账发现状态不一致
**When** 主进程 `isRunning=false` 但本地 `isScanning=true`
**Then** 自动触发 `finishScan()` 完成状态转换
**And** 控制台输出 `[PeopleView] 状态对账：主进程已完成，UI状态滞后，强制同步`

**Given** 对账发现状态一致
**When** 两边都显示扫描中或都显示完成
**Then** 继续正常流程，无额外操作

---

## Story E-10.3: 扫描任务数据库持久化

As a 系统架构师,
I want 将扫描任务状态持久化到数据库,
So that 应用崩溃后可恢复扫描进度，支持断点续传

**Acceptance Criteria:**

**Given** 数据库 schema
**When** 执行迁移
**Then** 创建 `scan_jobs` 表，包含字段：
- `id` TEXT PRIMARY KEY
- `status` ENUM('pending', 'detecting', 'embedding', 'clustering', 'completed', 'failed', 'cancelled')
- `total_photos` INTEGER
- `processed_photos` INTEGER
- `failed_photos` INTEGER
- `last_processed_id` INTEGER (断点续传关键)
- `started_at` INTEGER
- `completed_at` INTEGER
- `last_heartbeat` INTEGER
- `error_message` TEXT

**Given** 扫描任务启动
**When** 开始处理照片
**Then** 插入新记录到 `scan_jobs` 表
**And** 每处理 50 张照片更新 `processed_photos` 和 `last_heartbeat`

**Given** 应用崩溃后重启
**When** 系统初始化
**Then** 查询 `scan_jobs` 表中未完成的任务
**And** 如果 `last_heartbeat` 在 5 分钟内，恢复任务
**And** 如果超过 5 分钟，标记为失败

---

## Story E-10.4: 智能诊断与自愈提示

As a 用户,
I want 当系统检测到状态异常时能自动修复并提示我,
So that 我知道系统正在自我修复，增强信任感

**Acceptance Criteria:**

**Given** 状态对账发现异常
**When** 系统自动修复完成
**Then** 显示微型气泡提示：
"发现扫描任务已在后台完成，已为您更新状态。"

**Given** 扫描任务从数据库恢复
**When** 恢复成功
**Then** 提示用户：
"检测到未完成的扫描任务，是否继续？"
**And** 提供"继续扫描"和"重新开始"选项

**Given** 扫描长时间无进度（>5分钟）
**When** 心跳检测超时
**Then** 自动标记任务为停滞
**And** 显示"诊断并重启"按钮
**And** 点击后清理状态，允许重新扫描

---

## 技术备注

### 架构决策

1. **状态管理迁移**
   - 从：PeopleView 组件内部管理扫描状态
   - 到：全局 Pinia Store + 数据库持久化

2. **通信模式升级**
   - 从：单向 IPC 事件（主 → 渲染）
   - 到：双向对账 + 数据库作为 Source of Truth

3. **错误恢复策略**
   - 心跳检测：每 10 秒对账
   - 超时判定：5 分钟无心跳视为崩溃
   - 断点续传：基于 `last_processed_id` 跳过已处理照片

### 依赖关系

- 依赖 E-04 (人物管理系统) 的人脸检测基础
- 可与 E-08 (双向量架构) 的批量处理机制集成

### 验收标准

- [ ] 扫描 974 张照片过程中切换标签页 10 次，100%后能正常结束
- [ ] 扫描中途强制退出应用，重启后能检测到未完成任务
- [ ] 自动识别功能在扫描完成后能正确查询到新检测到的人脸
- [ ] 控制台无 IPC 事件丢失相关错误
