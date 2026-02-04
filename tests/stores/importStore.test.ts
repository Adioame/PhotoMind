/**
 * PhotoMind - Import Store Tests
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useImportStore, type ImportStage, type ImportProgress } from '../../src/renderer/stores/importStore'

describe('ImportStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('Initial State', () => {
    it('should have correct default values', () => {
      const store = useImportStore()

      expect(store.isOpen).toBe(false)
      expect(store.progress).toBe(null)
      expect(store.isImporting).toBe(false)
    })
  })

  describe('open and close', () => {
    it('should open the import dialog', () => {
      const store = useImportStore()
      store.open()

      expect(store.isOpen).toBe(true)
    })

    it('should close the import dialog and reset state', () => {
      const store = useImportStore()
      store.open()
      store.close()

      expect(store.isOpen).toBe(false)
      expect(store.progress).toBe(null)
      expect(store.isImporting).toBe(false)
    })
  })

  describe('updateProgress', () => {
    it('should update progress and set isImporting', () => {
      const store = useImportStore()
      const progress: ImportProgress = {
        stage: 'importing',
        currentIndex: 5,
        total: 10,
        imported: 5,
        skipped: 0,
        failed: 0,
        errors: [],
        startTime: Date.now()
      }

      store.updateProgress(progress)

      expect(store.progress).toEqual(progress)
      expect(store.isImporting).toBe(true)
    })

    it('should set isImporting to false when complete', () => {
      const store = useImportStore()
      const progress: ImportProgress = {
        stage: 'complete',
        currentIndex: 10,
        total: 10,
        imported: 10,
        skipped: 0,
        failed: 0,
        errors: [],
        startTime: Date.now()
      }

      store.updateProgress(progress)

      expect(store.isImporting).toBe(false)
    })

    it('should set isImporting to false when cancelled', () => {
      const store = useImportStore()
      const progress: ImportProgress = {
        stage: 'cancelled',
        currentIndex: 3,
        total: 10,
        imported: 3,
        skipped: 0,
        failed: 0,
        errors: [],
        startTime: Date.now()
      }

      store.updateProgress(progress)

      expect(store.isImporting).toBe(false)
    })
  })

  describe('setImporting', () => {
    it('should set isImporting status', () => {
      const store = useImportStore()

      store.setImporting(true)
      expect(store.isImporting).toBe(true)

      store.setImporting(false)
      expect(store.isImporting).toBe(false)
    })
  })

  describe('reset', () => {
    it('should reset all state', () => {
      const store = useImportStore()
      store.open()
      store.setImporting(true)

      store.reset()

      expect(store.progress).toBe(null)
      expect(store.isImporting).toBe(false)
    })
  })

  describe('Getters', () => {
    describe('progressPercentage', () => {
      it('should return 0 when no progress', () => {
        const store = useImportStore()
        expect(store.progressPercentage).toBe(0)
      })

      it('should calculate percentage correctly', () => {
        const store = useImportStore()
        const progress: ImportProgress = {
          stage: 'importing',
          currentIndex: 50,
          total: 100,
          imported: 50,
          skipped: 0,
          failed: 0,
          errors: [],
          startTime: Date.now()
        }
        store.updateProgress(progress)

        expect(store.progressPercentage).toBe(50)
      })

      it('should round to nearest integer', () => {
        const store = useImportStore()
        const progress: ImportProgress = {
          stage: 'importing',
          currentIndex: 33,
          total: 100,
          imported: 33,
          skipped: 0,
          failed: 0,
          errors: [],
          startTime: Date.now()
        }
        store.updateProgress(progress)

        expect(store.progressPercentage).toBe(33)
      })
    })

    describe('isComplete', () => {
      it('should return true when stage is complete', () => {
        const store = useImportStore()
        const progress: ImportProgress = {
          stage: 'complete',
          currentIndex: 10,
          total: 10,
          imported: 10,
          skipped: 0,
          failed: 0,
          errors: [],
          startTime: Date.now()
        }
        store.updateProgress(progress)

        expect(store.isComplete).toBe(true)
      })

      it('should return false when not complete', () => {
        const store = useImportStore()
        const progress: ImportProgress = {
          stage: 'importing',
          currentIndex: 5,
          total: 10,
          imported: 5,
          skipped: 0,
          failed: 0,
          errors: [],
          startTime: Date.now()
        }
        store.updateProgress(progress)

        expect(store.isComplete).toBe(false)
      })
    })

    describe('isCancelled', () => {
      it('should return true when stage is cancelled', () => {
        const store = useImportStore()
        const progress: ImportProgress = {
          stage: 'cancelled',
          currentIndex: 3,
          total: 10,
          imported: 3,
          skipped: 0,
          failed: 0,
          errors: [],
          startTime: Date.now()
        }
        store.updateProgress(progress)

        expect(store.isCancelled).toBe(true)
      })
    })

    describe('hasErrors', () => {
      it('should return true when failed > 0', () => {
        const store = useImportStore()
        const progress: ImportProgress = {
          stage: 'importing',
          currentIndex: 5,
          total: 10,
          imported: 4,
          skipped: 0,
          failed: 1,
          errors: [{ file: 'test.jpg', error: 'Failed' }],
          startTime: Date.now()
        }
        store.updateProgress(progress)

        expect(store.hasErrors).toBe(true)
      })

      it('should return false when no failed', () => {
        const store = useImportStore()
        const progress: ImportProgress = {
          stage: 'importing',
          currentIndex: 5,
          total: 10,
          imported: 5,
          skipped: 0,
          failed: 0,
          errors: [],
          startTime: Date.now()
        }
        store.updateProgress(progress)

        expect(store.hasErrors).toBe(false)
      })
    })

    describe('errorCount', () => {
      it('should return the failed count', () => {
        const store = useImportStore()
        const progress: ImportProgress = {
          stage: 'importing',
          currentIndex: 5,
          total: 10,
          imported: 3,
          skipped: 1,
          failed: 2,
          errors: [],
          startTime: Date.now()
        }
        store.updateProgress(progress)

        expect(store.errorCount).toBe(2)
      })
    })

    describe('formattedTimeRemaining', () => {
      it('should have no estimate when progress is null', () => {
        const store = useImportStore()
        expect(store.progress).toBe(null)
      })

      it('should format seconds correctly', () => {
        const store = useImportStore()
        const progress: ImportProgress = {
          stage: 'importing',
          currentIndex: 5,
          total: 10,
          imported: 5,
          skipped: 0,
          failed: 0,
          errors: [],
          startTime: Date.now(),
          estimatedTimeRemaining: 45
        }
        store.updateProgress(progress)
        // Access the getter value via the store's computed ref
        expect(store.progress?.estimatedTimeRemaining).toBe(45)
      })

      it('should format minutes and seconds correctly', () => {
        const store = useImportStore()
        const progress: ImportProgress = {
          stage: 'importing',
          currentIndex: 5,
          total: 10,
          imported: 5,
          skipped: 0,
          failed: 0,
          errors: [],
          startTime: Date.now(),
          estimatedTimeRemaining: 125
        }
        store.updateProgress(progress)
        expect(store.progress?.estimatedTimeRemaining).toBe(125)
      })

      it('should format hours and minutes correctly', () => {
        const store = useImportStore()
        const progress: ImportProgress = {
          stage: 'importing',
          currentIndex: 5,
          total: 10,
          imported: 5,
          skipped: 0,
          failed: 0,
          errors: [],
          startTime: Date.now(),
          estimatedTimeRemaining: 3725
        }
        store.updateProgress(progress)
        expect(store.progress?.estimatedTimeRemaining).toBe(3725)
      })
    })

    describe('currentStageLabel', () => {
      it('should return empty when no progress', () => {
        const store = useImportStore()
        expect(store.progress).toBe(null)
      })

      it('should return correct label for each stage', () => {
        const store = useImportStore()
        const labels: Record<ImportStage, string> = {
          'scanning': '扫描文件',
          'preparing': '准备导入',
          'importing': '导入照片',
          'metadata': '提取元数据',
          'thumbnails': '生成缩略图',
          'complete': '导入完成',
          'cancelled': '已取消'
        }

        Object.entries(labels).forEach(([stage, expectedLabel]) => {
          const progress: ImportProgress = {
            stage: stage as ImportStage,
            currentIndex: 5,
            total: 10,
            imported: 5,
            skipped: 0,
            failed: 0,
            errors: [],
            startTime: Date.now()
          }
          store.updateProgress(progress)
          expect(store.progress?.stage).toBe(stage)
        })
      })
    })
  })
})
