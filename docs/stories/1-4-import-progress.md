# Story E-01.4: 导入进度管理

## Story Overview

**原始需求描述**:
作为用户，我希望在导入大量照片时能够看到清晰的进度显示，包括当前处理的文件、预计剩余时间等。

**描述**:
在导入照片过程中，通过 IPC 通信实时向前端发送进度更新，前端展示详细的进度信息：当前文件、已完成数量、失败数量、预计剩余时间等。

## Acceptance Criteria

### 功能性需求
- [ ] 实时进度更新（每秒至少 1 次）
- [ ] 显示当前处理的文件名
- [ ] 显示已导入/总数
- [ ] 显示失败数量
- [ ] 显示预计剩余时间
- [ ] 支持取消导入
- [ ] 显示当前阶段（扫描/导入/元数据/向量）
- [ ] 完成后显示摘要

### 非功能性需求
- [ ] 进度更新不阻塞导入
- [ ] 支持大批量导入（10000+）
- [ ] 取消后清理临时文件

## Implementation Steps

### Phase 1: 进度服务

**文件**: `electron/services/importProgressService.ts`

```typescript
type ImportStage = 'scanning' | 'preparing' | 'importing' | 'metadata' | 'thumbnails' | 'complete'

interface ImportProgress {
  stage: ImportStage
  currentFile?: string
  currentIndex: number
  total: number
  imported: number
  skipped: number
  failed: number
  errors: Array<{ file: string; error: string }>
  startTime: Date
  estimatedTimeRemaining?: number
  bytesProcessed?: number
  totalBytes?: number
}

interface ProgressListener {
  (progress: ImportProgress): void
}

class ImportProgressService {
  private listeners: Set<ProgressListener> = new Set()
  private currentProgress: ImportProgress | null = null
  private progressInterval: NodeJS.Timeout | null = null

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    if (this.currentProgress) {
      for (const listener of this.listeners) {
        listener(this.currentProgress)
      }
    }
  }

  async startImport(
    files: string[],
    options: ImportOptions = {},
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    // 初始化进度
    this.currentProgress = {
      stage: 'scanning',
      currentIndex: 0,
      total: files.length,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      startTime: new Date()
    }

    // 启动进度更新定时器
    this.progressInterval = setInterval(() => {
      this.calculateEstimatedTime()
      this.notify()
    }, 500)

    const unsubscribe = this.subscribe(onProgress || (() => {}))

    try {
      // 执行导入
      const result = await this.performImport(files, options)

      // 完成
      this.currentProgress.stage = 'complete'
      this.currentProgress.imported = result.imported
      this.currentProgress.failed = result.failed
      this.currentProgress.errors = result.errors
      this.calculateEstimatedTime()
      this.notify()

      return result
    } finally {
      clearInterval(this.progressInterval!)
      unsubscribe()
    }
  }

  private async performImport(
    files: string[],
    options: ImportOptions
  ): Promise<ImportResult> {
    // ... 导入逻辑，更新 this.currentProgress
  }

  private calculateEstimatedTime(): void {
    if (!this.currentProgress || this.currentProgress.currentIndex === 0) {
      return
    }

    const elapsed = Date.now() - this.currentProgress.startTime.getTime()
    const perFile = elapsed / this.currentProgress.currentIndex
    const remaining = (this.currentProgress.total - this.currentProgress.currentIndex) * perFile

    this.currentProgress.estimatedTimeRemaining = Math.ceil(remaining / 1000)
  }

  cancel(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
    }
    this.currentProgress = null
  }

  getCurrentProgress(): ImportProgress | null {
    return this.currentProgress
  }
}
```

### Phase 2: IPC 通信

**文件**: `electron/main/index.ts`

```typescript
import { importProgressService } from '../services/importProgressService'

ipcMain.handle('import:start', async (event, folderPath, options) => {
  const files = await folderScanner.scanFolder(folderPath)

  return new Promise((resolve) => {
    importProgressService.startImport(
      files,
      options,
      (progress) => {
        // 发送进度到渲染进程
        event.sender.send('import:progress', progress)
      }
    ).then(resolve)
  })
})

ipcMain.handle('import:cancel', async () => {
  importProgressService.cancel()
})

ipcMain.handle('import:get-progress', async () => {
  return importProgressService.getCurrentProgress()
})
```

### Phase 3: 前端进度组件

**文件**: `src/renderer/components/import/ImportProgress.vue`

```vue
<template>
  <div v-if="isOpen" class="import-progress-overlay">
    <div class="import-progress-dialog">
      <div class="dialog-header">
        <h2>导入照片</h2>
        <button class="close-button" @click="handleClose">
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <div class="dialog-content">
        <!-- 阶段指示 -->
        <div class="stage-indicator">
          <div
            v-for="(stage, index) in stages"
            :key="stage.key"
            class="stage-item"
            :class="{
              active: currentStage === stage.key,
              completed: isStageCompleted(stage.key)
            }"
          >
            <div class="stage-icon">
              <span v-if="isStageCompleted(stage.key)" class="check-icon">✓</span>
              <span v-else class="stage-number">{{ index + 1 }}</span>
            </div>
            <span class="stage-label">{{ stage.label }}</span>
          </div>
        </div>

        <!-- 进度信息 -->
        <div class="progress-info">
          <div class="current-file" v-if="progress.currentFile">
            <svg viewBox="0 0 24 24">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
            {{ progress.currentFile }}
          </div>

          <div class="progress-stats">
            <div class="stat">
              <span class="stat-value">{{ progress.imported }}</span>
              <span class="stat-label">已导入</span>
            </div>
            <div class="stat" v-if="progress.skipped > 0">
              <span class="stat-value skipped">{{ progress.skipped }}</span>
              <span class="stat-label">已跳过</span>
            </div>
            <div class="stat" v-if="progress.failed > 0">
              <span class="stat-value failed">{{ progress.failed }}</span>
              <span class="stat-label">失败</span>
            </div>
          </div>

          <!-- 时间估计 -->
          <div class="time-estimate" v-if="progress.estimatedTimeRemaining">
            <span>预计剩余时间: {{ formatTime(progress.estimatedTimeRemaining) }}</span>
          </div>
        </div>

        <!-- 进度条 -->
        <div class="progress-bar-wrapper">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: progressPercentage + '%' }"
            ></div>
          </div>
          <span class="progress-percentage">{{ progressPercentage.toFixed(1) }}%</span>
        </div>

        <!-- 错误列表 -->
        <div class="errors-section" v-if="errors.length > 0">
          <div class="errors-header" @click="showErrors = !showErrors">
            <span>{{ errors.length }} 个错误</span>
            <svg :class="{ rotated: showErrors }" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
          <div class="errors-list" v-if="showErrors">
            <div
              v-for="(error, index) in errors.slice(0, 10)"
              :key="index"
              class="error-item"
            >
              <span class="error-file">{{ error.file }}</span>
              <span class="error-message">{{ error.error }}</span>
            </div>
            <div v-if="errors.length > 10" class="more-errors">
              还有 {{ errors.length - 10 }} 个错误...
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="dialog-actions">
        <button
          v-if="!isComplete"
          class="cancel-button"
          @click="handleCancel"
        >
          取消导入
        </button>
        <button
          v-else
          class="done-button"
          @click="handleClose"
        >
          完成
        </button>
      </div>
    </div>
  </div>
</template>
```

### Phase 4: 前端 Store

**文件**: `src/renderer/stores/importStore.ts`

```typescript
import { defineStore } from 'pinia'

interface ImportProgress {
  stage: string
  currentFile?: string
  currentIndex: number
  total: number
  imported: number
  skipped: number
  failed: number
  errors: Array<{ file: string; error: string }>
  estimatedTimeRemaining?: number
}

export const useImportStore = defineStore('import', {
  state: () => ({
    isOpen: false,
    progress: null as ImportProgress | null
  }),

  getters: {
    progressPercentage: (state): number => {
      if (!state.progress || state.progress.total === 0) return 0
      return (state.progress.currentIndex / state.progress.total) * 100
    },

    isComplete: (state): boolean => {
      return state.progress?.stage === 'complete'
    }
  },

  actions: {
    open() {
      this.isOpen = true
    },

    close() {
      this.isOpen = false
      this.progress = null
    },

    updateProgress(progress: ImportProgress) {
      this.progress = progress
    },

    async startImport(folderPath: string) {
      this.isOpen = true
      this.progress = {
        stage: 'scanning',
        currentIndex: 0,
        total: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
        errors: []
      }

      // 监听进度
      window.electronAPI.onImportProgress((progress) => {
        this.updateProgress(progress)
      })

      await window.electronAPI.importStart(folderPath)
    },

    cancelImport() {
      window.electronAPI.importCancel()
    }
  }
})
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/importProgressService.ts` |
| 修改 | `electron/main/index.ts` |
| 新建 | `src/renderer/components/import/ImportProgress.vue` |
| 新建 | `src/renderer/stores/importStore.ts` |

## Dependencies

### 内部依赖
- `electron/services/importService.ts`
- `src/renderer/stores/photoStore.ts`

### 外部依赖
- 无新增外部依赖

## Testing Approach

### 单元测试
1. **进度计算测试**
   - 测试进度百分比计算
   - 测试剩余时间计算

### 手动测试
1. **功能测试**
   - 测试进度更新
   - 测试取消功能
   - 测试错误显示

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 实时进度更新 | 导入时验证每秒更新 |
| 显示当前文件 | 验证显示文件名 |
| 显示预计时间 | 导入时验证显示剩余时间 |
| 支持取消 | 点击取消，验证停止导入 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 进度更新阻塞 | 中 | 使用定时器非阻塞更新 |
| 取消不彻底 | 中 | 清理临时文件 |

## Related Stories

### 前置依赖
- E-01.1: 本地文件夹导入 - 导入流程
- E-01.3: 元数据提取 - 元数据阶段

### 后续故事
- 无（Epic 1 完成）

### 相关 stories
- E-05.1: 搜索界面优化 - 进度展示复用
