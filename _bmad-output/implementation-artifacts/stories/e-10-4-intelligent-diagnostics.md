# Story E-10.4: 智能诊断与自愈提示

**Status**: ready-for-dev

**Epic**: [E-10: 人脸扫描状态同步修复](../planning-artifacts/epics/09-epic-10-face-scan-fix.md)

**Depends On**:
- [E-10.2: 周期性状态对账机制](./e-10-2-periodic-state-reconciliation.md) (必须)
- [E-10.3: 扫描任务数据库持久化](./e-10-3-scan-job-database-persistence.md) (如已实现)

---

## Story

As a 用户,
I want 当系统检测到状态异常时能自动修复并提示我,
So that 我知道系统正在自我修复，增强信任感

---

## Acceptance Criteria

### AC-1: 状态对账自动修复提示
**Given** 状态对账发现异常
**When** 系统自动修复完成（本地状态从 scanning 变为 completed）
**Then** 显示微型气泡提示：
- 位置：PeopleView 底部或右下角
- 样式：淡入动画，3秒后自动消失
- 文案："发现扫描任务已在后台完成，已为您更新状态。"
- 图标：CheckmarkCircle24Regular（绿色成功图标）

### AC-2: 数据库任务恢复提示（如 E-10.3 已完成）
**Given** 扫描任务从数据库恢复
**When** 恢复成功且需要用户决策
**Then** 显示恢复决策弹窗：
- 标题："检测到未完成的扫描任务"
- 内容："上次扫描还有 {count} 张照片未完成，是否继续？"
- 按钮1："继续扫描"（恢复扫描）
- 按钮2："重新开始"（重置任务）
- 图标：Warning24Regular（黄色警告图标）

### AC-3: 扫描停滞检测与诊断
**Given** 扫描长时间无进度（>5分钟）
**When** 心跳检测超时（E-10.3 heartbeat 机制）
**Then** 自动标记任务为停滞（stalled）状态
**And** 显示诊断恢复按钮
**And** 用户可手动触发清理重启

### AC-4: 诊断清理与重启
**Given** 用户点击"诊断并重启"按钮
**When** 清理流程开始
**Then** 先调用取消/清理接口清理卡死状态
**And** 完成后提示"诊断完成，可以重新扫描了"
**And** 允许用户重新开始扫描

### AC-5: 提示不干扰正常操作
**Given** 用户正在操作其他功能
**When** 诊断提示显示
**Then** 提示不应阻塞用户当前操作
**And** 提示不应自动获取焦点
**And** 点击提示外部区域可关闭

---

## Tasks / Subtasks

### Task 1: 创建智能诊断 UI 组件 (AC-1, AC-2, AC-3)
- [x] 创建 `SmartBubble.vue` 组件（微型气泡提示）
- [x] 支持 props：message, type (success/warning/info), duration, onClose
- [x] 创建 `ScanRecoveryDialog.vue` 组件（恢复决策弹窗）
- [x] 支持 props：visible, taskInfo (count, progress), onContinue, onRestart
- [x] 创建 `DiagnosticButton.vue` 组件（诊断并重启按钮）
- [x] 位置：PeopleView 扫描进度区域

### Task 2: 集成智能诊断到 scanStore (AC-1, AC-3)
- [x] 在 `scanStore` 中添加 `showRecoveryDialog` ref
- [x] 在 `scanStore` 中添加 `diagnosticMessage` ref
- [x] 在 `performReconciliation()` 中检测到状态修复后触发气泡提示
- [x] 在检测到停滞状态时显示诊断按钮
- [x] 添加 `dismissDiagnostic()` 方法关闭提示

### Task 3: 实现诊断清理逻辑 (AC-4)
- [x] 在 `scanStore` 中添加 `diagnoseAndRestart()` 方法
- [x] 调用现有的取消/清理接口清理状态
- [x] 重置 scanStore 状态到初始值
- [x] 显示诊断完成提示

### Task 4: 数据库恢复集成（如 E-10.3 已完成）(AC-2)
- [x] 在应用启动时查询未完成扫描任务（预留接口）
- [x] 如存在，显示恢复决策弹窗
- [ ] 实现"继续扫描"逻辑（基于 last_processed_id 断点续传）- 需 E-10.3
- [x] 实现"重新开始"逻辑（重置任务）

### Task 5: 样式与动画
- [x] SmartBubble 淡入淡出动画（200ms）
- [x] 自动消失倒计时动画（3秒）
- [x] DiagnosticButton 脉冲动画（表示停滞状态）
- [x] 恢复弹窗进入/退出动画

---

## Dev Notes

### 架构背景

**E-10.1 + E-10.2 已经解决的问题**:
- 全局 Store 管理扫描状态，解决监听丢失
- 周期性对账，解决 IPC 事件丢失

**E-10.4 要提升的用户体验**:
- 用户不知道系统在自我修复（需要提示）
- 崩溃恢复后用户不知道如何处理（需要决策界面）
- 扫描卡住时用户不知道怎么办（需要诊断工具）

### 技术约束

1. **UI 框架**：Fluent UI Vue (与现有组件库一致)
2. **状态管理**：必须通过 scanStore，不能直接在组件中管理状态
3. **IPC 通信**：复用现有的 API，不新增 IPC 通道
4. **向后兼容**：E-10.1/2 的功能必须正常工作

### 组件设计参考

**SmartBubble 组件** (`src/renderer/components/diagnostics/SmartBubble.vue`):
```vue
<template>
  <Transition name="bubble">
    <div v-if="visible" class="smart-bubble" :class="`type-${type}`">
      <FluentIcon :name="iconName" />
      <span class="message">{{ message }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
interface Props {
  message: string
  type: 'success' | 'warning' | 'info'
  duration?: number // ms, 0 = 不自动关闭
  visible: boolean
}

// 自动关闭逻辑
watch(() => props.visible, (v) => {
  if (v && props.duration > 0) {
    setTimeout(() => emit('close'), props.duration)
  }
})
</script>

<style>
.smart-bubble {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 1000;
}
.type-success { background: #107c10; color: white; }
.type-warning { background: #ffc107; color: #333; }
.type-info { background: #0078d4; color: white; }

.bubble-enter-active, .bubble-leave-active {
  transition: all 0.2s ease;
}
.bubble-enter-from, .bubble-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
```

**ScanRecoveryDialog 组件** (`src/renderer/components/diagnostics/ScanRecoveryDialog.vue`):
```vue
<template>
  <Dialog :visible="visible" @update:visible="$emit('close')">
    <template #title>
      <FluentIcon name="Warning24Regular" />
      检测到未完成的扫描任务
    </template>
    <template #content>
      <p>上次扫描还有 <strong>{{ remainingCount }}</strong> 张照片未完成，是否继续？</p>
      <ProgressBar :value="progressPercent" />
    </template>
    <template #actions>
      <Button variant="secondary" @click="$emit('restart')">重新开始</Button>
      <Button variant="primary" @click="$emit('continue')">继续扫描</Button>
    </template>
  </Dialog>
</template>
```

**DiagnosticButton 组件** (`src/renderer/components/diagnostics/DiagnosticButton.vue`):
```vue
<template>
  <Button
    variant="warning"
    :loading="isDiagnosing"
    @click="onDiagnose"
  >
    <FluentIcon v-if="!isDiagnosing" name="Wrench24Regular" />
    {{ isDiagnosing ? '诊断中...' : '诊断并重启' }}
  </Button>
</template>
```

### scanStore 集成

**新增状态**:
```typescript
// 诊断相关状态
const diagnosticMessage = ref<{
  text: string
  type: 'success' | 'warning' | 'info'
  visible: boolean
} | null>(null)

const showRecoveryDialog = ref(false)
const stalledScanTask = ref<ScanJob | null>(null)
const isDiagnosing = ref(false)
```

**新增方法**:
```typescript
/**
 * 显示诊断提示
 */
function showDiagnosticMessage(message: string, type: 'success' | 'warning' | 'info') {
  diagnosticMessage.value = { text: message, type, visible: true }
  // 3秒后自动关闭
  setTimeout(() => {
    dismissDiagnostic()
  }, 3000)
}

/**
 * 关闭诊断提示
 */
function dismissDiagnostic() {
  if (diagnosticMessage.value) {
    diagnosticMessage.value.visible = false
    setTimeout(() => {
      diagnosticMessage.value = null
    }, 200) // 等待动画完成
  }
}

/**
 * 执行诊断并重启
 */
async function diagnoseAndRestart() {
  isDiagnosing.value = true
  console.log('[ScanStore] 开始诊断扫描任务...')

  try {
    // 1. 调用取消接口清理卡死状态
    await photoAPI.face.cancel?.()

    // 2. 重置本地状态
    resetScanState()

    // 3. 如果有数据库任务，标记为失败
    if (stalledScanTask.value) {
      await markTaskFailed(stalledScanTask.value.id, '用户触发诊断清理')
      stalledScanTask.value = null
    }

    showDiagnosticMessage('诊断完成，可以重新扫描了', 'success')
  } catch (error) {
    console.error('[ScanStore] 诊断失败:', error)
    showDiagnosticMessage('诊断过程出错，请重试', 'warning')
  } finally {
    isDiagnosing.value = false
  }
}

/**
 * 检查恢复任务（在应用启动时调用）
 */
async function checkRecoveryTask() {
  if (!dbAPI.scanJobs) return // E-10.3 未实现

  const incompleteTasks = await dbAPI.scanJobs.getIncomplete()
  if (incompleteTasks.length > 0) {
    stalledScanTask.value = incompleteTasks[0]
    showRecoveryDialog.value = true
  }
}
```

**修改 performReconciliation 触发提示**:
```typescript
async function performReconciliation() {
  // ... 原有对账逻辑 ...

  if (!mainIsRunning && mainPending === 0 && state.value === 'scanning') {
    console.log('[ScanStore] 状态对账：主进程已完成，UI状态滞后，强制同步')

    onScanComplete({
      total: progress.value.total || status.completed || 0,
      completed: status.completed || progress.value.current || 0,
      failed: status.failed || 0,
      detectedFaces: result.value?.detectedFaces || 0
    })

    // 🎯 新增：显示自动修复提示
    showDiagnosticMessage('发现扫描任务已在后台完成，已为您更新状态。', 'success')
  }
}
```

### 文件结构

```
src/renderer/
├── components/
│   └── diagnostics/
│       ├── SmartBubble.vue          # 微型气泡提示
│       ├── ScanRecoveryDialog.vue   # 恢复决策弹窗
│       └── DiagnosticButton.vue     # 诊断按钮
├── stores/
│   └── scanStore.ts                 # 修改：添加诊断相关状态和方法
└── views/
    └── PeopleView.vue               # 修改：集成诊断组件
```

### 依赖关系

- **必须依赖**: E-10.2 (周期性状态对账) - 在 performReconciliation 中触发提示
- **可选依赖**: E-10.3 (数据库持久化) - 用于崩溃恢复提示，如未实现可留空方法
- **UI 库**: Fluent UI Vue (@fluentui/vue)

### 测试策略

**手动测试步骤**:
1. 启动扫描，切换到其他标签页，等待扫描完成
2. 返回 PeopleView，验证是否显示"发现扫描任务已在后台完成"提示
3. 验证提示 3 秒后自动消失
4. 模拟扫描停滞（暂停主进程），验证显示"诊断并重启"按钮
5. 点击诊断按钮，验证状态重置并显示成功提示

**边界情况**:
1. 提示显示时用户切换标签页 - 提示应正常显示/消失
2. 多次触发提示 - 应取消上一个提示的定时器
3. 诊断过程中用户点击取消 - 应中断诊断流程

---

## Dev Agent Record

### Agent Model Used

Claude 4.5 Sonnet

### Debug Log References

- Build successful with no new TypeScript errors
- All E-10.4 tests passing (17 new tests added)
- See: `_bmad-output/implementation-artifacts/tests/e-10-4-test-summary.md`
- Full regression test suite: 55/55 tests passing

### Completion Notes List

1. **AC-1 状态对账自动修复提示**: 在 `performReconciliation()` 中当检测到主进程已完成但本地状态仍显示 scanning 时，调用 `showDiagnosticMessage()` 显示绿色成功气泡提示，3秒后自动消失。

2. **AC-2 数据库任务恢复提示**: 创建了 `ScanRecoveryDialog.vue` 组件，预留了恢复逻辑接口。由于 E-10.3 尚未实现，恢复功能目前为占位状态，但 UI 已就绪。

3. **AC-3 扫描停滞检测**: 在 `startScan()` 中启动 5 分钟停滞检测定时器。当扫描超过 5 分钟未完成，自动标记为停滞状态，显示诊断按钮并带有脉冲动画。

4. **AC-4 诊断清理与重启**: 实现了 `diagnoseAndRestart()` 方法，调用现有取消接口清理状态，重置 scanStore，并显示诊断完成提示。

5. **AC-5 提示不干扰正常操作**: SmartBubble 使用 fixed 定位在右下角，不获取焦点，点击可关闭，3秒后自动消失。

6. **额外修复**: 修复了 PhotoDetailView.vue 和 SettingsView.vue 中不存在的图标导入错误（Photos24Regular -> ImageMultiple24Regular, Palette24Regular -> Color24Regular 等）。

### File List

**新增文件**:
- `src/renderer/components/diagnostics/SmartBubble.vue` - 智能气泡提示组件
- `src/renderer/components/diagnostics/DiagnosticButton.vue` - 诊断按钮组件
- `src/renderer/components/diagnostics/ScanRecoveryDialog.vue` - 恢复决策弹窗组件

**修改文件**:
- `src/renderer/stores/scanStore.ts` - 添加诊断状态和方法
- `src/renderer/views/PeopleView.vue` - 集成诊断组件
- `src/renderer/views/PhotoDetailView.vue` - 修复图标导入错误
- `src/renderer/views/SettingsView.vue` - 修复图标导入错误

---

## Project Context Reference

- **Epic**: [E-10: 人脸扫描状态同步修复](../planning-artifacts/epics/09-epic-10-face-scan-fix.md)
- **Previous Story**: [E-10.2: 周期性状态对账机制](./e-10-2-periodic-state-reconciliation.md)
- **Related Story**: [E-10.3: 扫描任务数据库持久化](./e-10-3-scan-job-database-persistence.md)
- **Sprint Status**: [sprint-status.yaml](./sprint-status.yaml)
- **Architecture**: Electron 28.x + Vue3 + Pinia + Fluent UI Vue

---

## Story Completion Status

**Status**: review

**Created**: 2026-02-06

**Completed**: 2026-02-06

**Ready For**: Code Review

**Blockers**: None

**Next Story**: Epic E-10 完成，准备回顾
