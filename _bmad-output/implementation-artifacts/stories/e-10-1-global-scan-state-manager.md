# Story E-10.1: 全局扫描状态管理器

**Status**: ready-for-dev

**Epic**: [E-10: 人脸扫描状态同步修复](../planning-artifacts/epics/09-epic-10-face-scan-fix.md)

---

## Story

As a 开发工程师,
I want 将扫描状态管理从视图层下沉到全局单例,
So that 无论用户如何切换页面，扫描状态监听永不丢失

---

## Acceptance Criteria

### AC-1: 应用启动时初始化全局扫描状态管理器
**Given** 应用启动
**When** 初始化 Vue 应用
**Then** 在 `main.ts` 中创建全局扫描状态 Store
**And** Store 在应用生命周期内永不被卸载
**And** Store 内部注册 IPC 监听器，接收主进程进度/完成事件

### AC-2: 全局 Store 接收并存储扫描状态
**Given** 用户启动人脸扫描
**When** 扫描进行中
**Then** 全局 Store 接收主进程的 `face:progress` 事件
**And** 存储当前进度（current, total, percent）
**And** 视图组件（PeopleView）只读取 Store，不直接注册监听

### AC-3: 视图组件与 Store 状态同步
**Given** 用户切换标签页
**When** PeopleView 组件销毁重建
**Then** Store 保持监听活跃
**And** 重建后的 PeopleView 能立即从 Store 获取当前状态
**And** UI 状态与 Store 状态一致

### AC-4: 扫描完成状态正确传播
**Given** 扫描任务完成
**When** 主进程发送 `face:scan-complete` 事件
**Then** 全局 Store 接收到完成信号
**And** Store 更新状态为 `completed`
**And** 所有订阅该 Store 的视图组件自动更新

---

## Tasks / Subtasks

### Task 1: 创建全局扫描状态 Store (AC-1)
- [ ] 创建 `src/renderer/stores/scanStore.ts`
  - [ ] 定义扫描状态类型：`idle` | `scanning` | `completed` | `failed` | `cancelled`
  - [ ] 定义 Store 接口：state, progress, error, actions
  - [ ] 实现 IPC 监听器注册（在 Store 创建时）
  - [ ] 实现 `onScanProgress` 回调处理
  - [ ] 实现 `onScanComplete` 回调处理
  - [ ] 实现 `startScan`, `cancelScan`, `resetScan` actions

### Task 2: 在应用入口初始化 Store (AC-1)
- [ ] 修改 `src/renderer/main.ts`
  - [ ] 在 Pinia 创建后立即初始化 scanStore
  - [ ] 确保 Store 在应用生命周期内只创建一次
  - [ ] 添加初始化日志

### Task 3: 修改 PeopleView 使用全局 Store (AC-2, AC-3)
- [ ] 修改 `src/renderer/views/PeopleView.vue`
  - [ ] 移除组件内直接的 IPC 监听代码
  - [ ] 导入并使用全局 `scanStore`
  - [ ] 使用 `storeToRefs` 解构响应式状态
  - [ ] 在 `onMounted` 中同步 Store 状态到本地 UI

### Task 4: 确保状态变更触发 UI 更新 (AC-4)
- [ ] 验证 Store 状态变更时 PeopleView 自动重新渲染
  - [ ] 使用 computed 属性绑定进度条
  - [ ] 使用 watch 监听状态变化执行副作用

### Task 5: 测试与验证
- [ ] 编写手动测试步骤
  - [ ] 启动扫描后切换标签页，验证进度继续更新
  - [ ] 扫描完成后返回人物页，验证状态显示正确
  - [ ] 多次切换验证无内存泄漏

---

## Dev Notes

### 架构背景

**当前问题**：扫描状态直接在 `PeopleView.vue` 组件内管理，使用 `ipcRenderer.on` 注册监听器。当用户切换到其他标签页（如"首页"、"照片"）再返回时，组件被销毁重建，原有的监听器丢失。此时如果主进程发送完成事件，新组件实例尚未注册监听，导致状态死锁。

**解决方案**：将扫描状态提升到全局 Pinia Store，在应用启动时创建，永不被卸载。视图组件只读取 Store 状态，不直接管理监听。

### 技术约束

1. **必须保持 IPC 接口不变**：主进程仍然通过 `face:progress` 和 `face:scan-complete` 发送事件
2. **必须支持多视图订阅**：可能有多个组件需要读取扫描状态（如全局状态指示器）
3. **必须处理竞态条件**：用户可能在扫描进行中刷新页面或重启应用

### 现有代码参考

**主进程 IPC 事件**（来源：`electron/main/index.ts:1380-1396`）:
```typescript
// 进度事件
mainWindow.webContents.send('face:progress', {
  current: stats.completed,
  total: stats.total,
  percent: percent,
  status: progress.status
})

// 完成事件
mainWindow.webContents.send('face:scan-complete', {
  total: stats.total,
  completed: stats.completed,
  failed: stats.failed,
  detectedFaces: stats.detectedFaces
})
```

**现有 PeopleView 问题代码模式**：
```typescript
// ❌ 错误：在组件内注册监听
onMounted(() => {
  window.electronAPI.onFaceProgress((data) => {
    scanProgress.value = data  // 组件销毁时监听丢失
  })
})
```

### 推荐实现模式

**全局 Store 模式**：
```typescript
// ✅ 正确：在 Store 内注册监听，组件只读取
export const useScanStore = defineStore('scan', () => {
  const state = ref<ScanState>('idle')
  const progress = ref<ScanProgress>({ current: 0, total: 0, percent: 0 })

  // Store 创建时注册监听
  if (window.electronAPI?.onFaceProgress) {
    window.electronAPI.onFaceProgress((data) => {
      progress.value = data
    })
  }

  return { state, progress }
})
```

### 文件结构

```
src/renderer/
├── stores/
│   ├── scanStore.ts          # 🆕 新增：全局扫描状态管理
│   └── peopleStore.ts        # 现有：人物数据管理（不修改扫描逻辑）
├── views/
│   └── PeopleView.vue        # 修改：使用 scanStore 替代本地状态
└── main.ts                   # 修改：初始化 scanStore
```

### 依赖关系

- **依赖**: Pinia (已存在)
- **依赖**: Electron IPC API (已存在)
- **不依赖**: 数据库 Schema 变更（本 Story 不涉及）
- **被依赖**: E-10.2（周期性状态对账）将读取本 Store 的状态

### 性能考量

- Store 状态变更应使用细粒度响应式，避免不必要的重渲染
- 进度更新频率高（每张照片），考虑使用节流或批量更新

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
- **Sprint Status**: [sprint-status.yaml](./sprint-status.yaml)
- **Architecture**: Electron 28.x + Vue3 + Pinia
- **IPC Events**: `face:progress`, `face:scan-complete`, `face:status`
- **Related Services**: `FaceDetectionQueue` (主进程)

---

## Story Completion Status

**Status**: ready-for-dev

**Created**: 2026-02-06

**Ready For**: Dev Agent Implementation

**Blockers**: None

**Next Story**: E-10.2 (周期性状态对账机制)
