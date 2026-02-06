# Story E-10.2: 周期性状态对账机制

**Status**: ready-for-dev

**Epic**: [E-10: 人脸扫描状态同步修复](../planning-artifacts/epics/09-epic-10-face-scan-fix.md)

**Depends On**: [E-10.1: 全局扫描状态管理器](./e-10-1-global-scan-state-manager.md)

---

## Story

As a 开发工程师,
I want 在扫描状态下定期进行主从状态对账,
So that 即使 IPC 事件丢失也能自动恢复状态一致性

---

## Acceptance Criteria

### AC-1: 定时对账机制启动
**Given** 扫描状态为 `scanning`
**When** 状态变为 scanning 时
**Then** 启动定时器，每 10 秒触发一次状态对账
**And** 定时器在扫描结束后自动停止

### AC-2: 主动查询主进程状态
**Given** 对账定时器触发
**When** 每 10 秒周期到达
**Then** 调用主进程 API 查询队列状态 (`face:get-queue-status`)
**And** 获取 `isRunning` 和 `pending` 字段

### AC-3: 状态不一致检测与修复
**Given** 对账发现状态不一致
**When** 主进程 `isRunning=false` 且 `pending=0` 但本地 `state=scanning`
**Then** 自动触发完成状态转换
**And** 控制台输出 `[ScanStore] 状态对账：主进程已完成，UI状态滞后，强制同步`
**And** 更新本地状态为 `completed`

### AC-4: 状态一致时无操作
**Given** 对账发现状态一致
**When** 两边都显示扫描中或都显示完成
**Then** 继续正常流程，无额外操作
**And** 控制台输出 `[ScanStore] 状态对账：状态一致`

### AC-5: 对账定时器清理
**Given** 扫描结束（完成、失败或取消）
**When** 状态变为非 scanning 时
**Then** 停止对账定时器
**And** 清理相关资源，避免内存泄漏

---

## Tasks / Subtasks

### Task 1: 在 scanStore 中添加对账机制 (AC-1, AC-2, AC-5)
- [ ] 添加 `reconciliationTimer` ref 存储定时器 ID
- [ ] 添加 `lastReconciliationTime` ref 记录上次对账时间
- [ ] 创建 `startReconciliation()` 方法启动定时器
- [ ] 创建 `stopReconciliation()` 方法停止定时器
- [ ] 创建 `performReconciliation()` 方法执行对账
- [ ] 在 `startScan()` 中调用 `startReconciliation()`
- [ ] 在状态变为 completed/failed/cancelled 时调用 `stopReconciliation()`

### Task 2: 实现对账逻辑 (AC-2, AC-3, AC-4)
- [ ] 在 `performReconciliation()` 中调用 `photoAPI.face.getQueueStatus()`
- [ ] 解析返回的 `isRunning` 和 `pending` 字段
- [ ] 实现状态对比逻辑
- [ ] 当 `!isRunning && pending === 0 && state === 'scanning'` 时触发修复
- [ ] 添加详细的控制台日志

### Task 3: 处理边界情况
- [ ] 处理 API 调用失败的情况（网络/进程错误）
- [ ] 添加最大重试次数避免无限重试
- [ ] 处理主进程无响应的情况（超时）
- [ ] 确保定时器不会重复启动

### Task 4: 测试与验证
- [ ] 手动测试：启动扫描后模拟 IPC 事件丢失，验证对账能否修复状态
- [ ] 验证定时器在扫描结束后正确清理
- [ ] 验证多次启动/取消扫描不会对账定时器重复

---

## Dev Notes

### 架构背景

**E-10.1 解决了什么问题**：
- 将 IPC 监听从组件移到全局 Store，解决了组件销毁/重建导致的监听丢失

**E-10.2 要解决的剩余问题**：
- IPC 事件本身可能丢失（网络抖动、Electron 内部问题）
- 主进程崩溃后重启，状态不同步
- 需要一种"主动查询"作为"被动监听"的兜底

### 技术约束

1. **必须使用现有的 IPC API**：`photoAPI.face.getQueueStatus()` 已存在
2. **不能影响性能**：对账间隔 10 秒，不能太频繁
3. **必须可清理**：定时器必须在扫描结束后停止，避免内存泄漏
4. **保持向后兼容**：E-10.1 的功能必须正常工作

### 现有代码参考

**主进程队列状态 IPC**（来源：`electron/main/index.ts:1484-1493`）:
```typescript
ipcMain.handle('face:get-queue-status', async () => {
  try {
    const { faceDetectionQueue } = await import('../services/faceDetectionQueue.js')
    return faceDetectionQueue.getDetailedStatus()
  } catch (error) {
    console.error('[IPC] 获取队列状态失败:', error)
    return null
  }
})
```

**返回的数据结构**:
```typescript
interface QueueStatus {
  isRunning: boolean      // 队列是否正在运行
  pending: number         // 待处理任务数
  processing: number      // 处理中任务数
  completed: number       // 已完成任务数
  failed: number          // 失败任务数
  queueLength: number     // 队列总长度
  isPaused: boolean       // 是否暂停
}
```

**IPC API 已暴露**（来源：`electron/preload/index.ts:127`）:
```typescript
face: {
  getQueueStatus: () => ipcRenderer.invoke('face:get-queue-status'),
  // ... other methods
}
```

### 推荐实现模式

**在 scanStore.ts 中添加对账机制**:
```typescript
// ============ Reconciliation ============
const reconciliationTimer = ref<NodeJS.Timeout | null>(null)
const lastReconciliationTime = ref<number>(0)
const MAX_RETRIES = 3

/**
 * 启动状态对账定时器
 */
function startReconciliation() {
  // 防止重复启动
  if (reconciliationTimer.value) {
    console.log('[ScanStore] 对账定时器已存在，跳过')
    return
  }

  console.log('[ScanStore] 启动状态对账定时器 (10秒间隔)')

  // 立即执行一次对账
  performReconciliation()

  // 每 10 秒执行一次
  reconciliationTimer.value = setInterval(() => {
    performReconciliation()
  }, 10000)
}

/**
 * 停止状态对账定时器
 */
function stopReconciliation() {
  if (reconciliationTimer.value) {
    clearInterval(reconciliationTimer.value)
    reconciliationTimer.value = null
    console.log('[ScanStore] 停止状态对账定时器')
  }
}

/**
 * 执行状态对账
 */
async function performReconciliation() {
  // 如果不在扫描状态，跳过
  if (state.value !== 'scanning') {
    return
  }

  lastReconciliationTime.value = Date.now()

  try {
    const api = (window as any).photoAPI?.face
    if (!api?.getQueueStatus) {
      console.warn('[ScanStore] getQueueStatus API 不可用')
      return
    }

    const status = await api.getQueueStatus()
    console.log('[ScanStore] 状态对账:', status)

    if (!status) {
      console.warn('[ScanStore] 无法获取队列状态')
      return
    }

    // 状态对比
    const mainIsRunning = status.isRunning
    const mainPending = status.pending || 0

    if (!mainIsRunning && mainPending === 0 && state.value === 'scanning') {
      // 主进程已完成但本地仍显示扫描中
      console.log('[ScanStore] 状态对账：主进程已完成，UI状态滞后，强制同步')

      // 触发完成状态
      onScanComplete({
        total: progress.value.total || status.completed || 0,
        completed: status.completed || progress.value.current || 0,
        failed: status.failed || 0,
        detectedFaces: result.value?.detectedFaces || 0
      })
    } else {
      console.log('[ScanStore] 状态对账：状态一致')
    }
  } catch (error) {
    console.error('[ScanStore] 状态对账失败:', error)
  }
}
```

**修改 startScan() 启动对账**:
```typescript
function startScan() {
  state.value = 'scanning'
  stage.value = 'started'
  progress.value = { current: 0, total: 0, percent: 0, status: '准备扫描...' }
  result.value = null
  error.value = ''
  showProgress.value = true

  // 启动对账机制
  startReconciliation()
}
```

**修改 cancelScan() 停止对账**:
```typescript
function cancelScan() {
  state.value = 'cancelled'
  stage.value = ''
  progress.value.status = '已取消'
  showProgress.value = false

  // 停止对账
  stopReconciliation()

  // 调用主进程取消接口
  try {
    (window as any).photoAPI?.face?.cancel?.()
  } catch (e) {
    console.warn('[ScanStore] 取消扫描失败:', e)
  }
}
```

**在 onScanComplete 和 onScanStatus('error') 中停止对账**:
```typescript
function onScanComplete(data: ScanResult) {
  // ... 原有代码 ...

  // 停止对账
  stopReconciliation()
}

function onScanStatus(status: ScanStatus) {
  switch (status.stage) {
    // ... 其他 case ...

    case 'error':
      state.value = 'failed'
      stage.value = 'error'
      progress.value.status = '扫描失败'
      error.value = status.error || '未知错误'
      // 停止对账
      stopReconciliation()
      break
  }
}
```

### 文件修改清单

```
src/renderer/stores/scanStore.ts  (修改：添加对账机制)
```

### 依赖关系

- **依赖**: E-10.1 (全局扫描状态管理器) - 必须在 scanStore 基础上添加
- **使用**: 现有的 `face:get-queue-status` IPC API
- **不依赖**: 数据库 Schema 变更

### 测试策略

**手动测试步骤**:
1. 启动扫描，观察控制台输出 "启动状态对账定时器"
2. 每 10 秒应看到 "状态对账" 日志
3. 快速完成扫描（如只有几张照片），验证对账日志显示 "状态一致"
4. 模拟极端情况：在扫描进行中刷新页面，验证对账能否恢复正确状态

**边界情况测试**:
1. 多次快速点击扫描/取消，验证定时器不会重复
2. 主进程崩溃后重启，验证对账能检测状态不一致

---

## Dev Agent Record

### Agent Model Used

<!-- To be filled by Dev Agent -->

### Debug Log References

<!-- To be filled by Dev Agent -->

### Completion Notes List

<!-- To be filled by Dev Agent -->

### File List

<!-- To be filled by Dev Agent -->

---

## Project Context Reference

- **Epic**: [E-10: 人脸扫描状态同步修复](../planning-artifacts/epics/09-epic-10-face-scan-fix.md)
- **Previous Story**: [E-10.1: 全局扫描状态管理器](./e-10-1-global-scan-state-manager.md)
- **Sprint Status**: [sprint-status.yaml](./sprint-status.yaml)
- **Architecture**: Electron 28.x + Vue3 + Pinia
- **IPC API**: `face:get-queue-status` (已存在)

---

## Story Completion Status

**Status**: ready-for-dev

**Created**: 2026-02-06

**Ready For**: Dev Agent Implementation

**Blockers**: None (E-10.1 is done)

**Next Story**: E-10.3 (扫描任务数据库持久化)
