/**
 * PhotoMind - 导入进度状态管理
 */
import { defineStore } from 'pinia'

export type ImportStage = 'scanning' | 'preparing' | 'importing' | 'metadata' | 'thumbnails' | 'complete' | 'cancelled'

export interface ImportProgress {
  stage: ImportStage
  currentFile?: string
  currentIndex: number
  total: number
  imported: number
  skipped: number
  failed: number
  errors: Array<{ file: string; error: string }>
  startTime: number
  estimatedTimeRemaining?: number
  bytesProcessed?: number
  totalBytes?: number
}

export const useImportStore = defineStore('import', {
  state: () => ({
    isOpen: false as boolean,
    progress: null as ImportProgress | null,
    isImporting: false as boolean
  }),

  getters: {
    progressPercentage: (state): number => {
      if (!state.progress || state.progress.total === 0) return 0
      return Math.round((state.progress.currentIndex / state.progress.total) * 100)
    },

    isComplete: (state): boolean => {
      return state.progress?.stage === 'complete'
    },

    isCancelled: (state): boolean => {
      return state.progress?.stage === 'cancelled'
    },

    hasErrors: (state): boolean => {
      return (state.progress?.failed || 0) > 0
    },

    errorCount: (state): number => {
      return state.progress?.failed || 0
    },

    formattedTimeRemaining: (state): string => {
      if (!state.progress?.estimatedTimeRemaining) return ''
      const seconds = state.progress.estimatedTimeRemaining
      if (seconds < 60) {
        return `${seconds}秒`
      } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${minutes}分${secs}秒`
      } else {
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        return `${hours}小时${minutes}分`
      }
    },

    currentStageLabel: (state): string => {
      const stageLabels: Record<ImportStage, string> = {
        'scanning': '扫描文件',
        'preparing': '准备导入',
        'importing': '导入照片',
        'metadata': '提取元数据',
        'thumbnails': '生成缩略图',
        'complete': '导入完成',
        'cancelled': '已取消'
      }
      return state.progress ? stageLabels[state.progress.stage] : ''
    }
  },

  actions: {
    // 开始监听导入进度（通过 IPC 事件）
    startProgressListener() {
      if (!(window as any).photoAPI?.import?.onProgress) {
        console.warn('[ImportStore] import.onProgress 不可用')
        return null
      }

      return (window as any).photoAPI.import.onProgress((progress: any) => {
        this.updateProgress({
          stage: progress.stage === 'complete' ? 'complete' :
                 progress.stage === 'cancelled' ? 'cancelled' :
                 (progress.stage === 'scanning' ? 'scanning' :
                  (progress.stage === 'preparing' ? 'preparing' :
                   (progress.stage === 'metadata' ? 'metadata' :
                    (progress.stage === 'thumbnails' ? 'thumbnails' : 'importing')))),
          currentFile: progress.currentFile || '',
          currentIndex: progress.currentIndex || 0,
          total: progress.total || 0,
          imported: progress.imported || 0,
          skipped: progress.skipped || 0,
          failed: progress.failed || 0,
          errors: progress.errors || [],
          startTime: progress.startTime || Date.now(),
          estimatedTimeRemaining: progress.estimatedTimeRemaining
        })
      })
    },

    open() {
      this.isOpen = true
    },

    close() {
      this.isOpen = false
      this.progress = null
      this.isImporting = false
    },

    updateProgress(progress: ImportProgress) {
      this.progress = progress
      this.isImporting = progress.stage !== 'complete' && progress.stage !== 'cancelled'
    },

    setImporting(status: boolean) {
      this.isImporting = status
    },

    reset() {
      this.progress = null
      this.isImporting = false
    }
  }
})
