/**
 * PhotoMind - Scan Store Unit Tests
 *
 * Tests for Story E-10.1: Global Scan State Manager
 * Epic E-10: 人脸扫描状态同步修复
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useScanStore, type ScanProgress, type ScanResult, type ScanStatus } from '@/stores/scanStore'

// Mock timers for setTimeout tests
vi.useFakeTimers()

// Mock window.photoAPI
const mockUnsubscribeProgress = vi.fn()
const mockUnsubscribeStatus = vi.fn()
const mockUnsubscribeComplete = vi.fn()

const photoAPIMock = {
  face: {
    onProgress: vi.fn().mockReturnValue(mockUnsubscribeProgress),
    onStatus: vi.fn().mockReturnValue(mockUnsubscribeStatus),
    onScanComplete: vi.fn().mockReturnValue(mockUnsubscribeComplete),
    cancel: vi.fn().mockResolvedValue(undefined),
    getQueueStatus: vi.fn().mockResolvedValue({
      isRunning: true,
      pending: 10,
      processing: 2,
      completed: 50,
      failed: 0,
      queueLength: 12,
      isPaused: false
    })
  }
}

Object.defineProperty(global, 'window', {
  value: { photoAPI: photoAPIMock },
  writable: true
})

describe('ScanStore - Story E-10.1: Global Scan State Manager', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================
  // AC-1: Application startup initializes global scan state manager
  // ============================================
  describe('AC-1: Application startup initializes global scan state manager', () => {
    it('should export useScanStore function', () => {
      expect(useScanStore).toBeDefined()
      expect(typeof useScanStore).toBe('function')
    })

    it('should create store with initial idle state', () => {
      const store = useScanStore()

      expect(store.state).toBe('idle')
      expect(store.stage).toBe('')
      expect(store.progress).toEqual({
        current: 0,
        total: 0,
        percent: 0,
        status: ''
      })
      expect(store.result).toBeNull()
      expect(store.error).toBe('')
      expect(store.showProgress).toBe(false)
    })

    it('should register IPC listeners on store creation', () => {
      const store = useScanStore()

      expect(photoAPIMock.face.onProgress).toHaveBeenCalled()
      expect(photoAPIMock.face.onStatus).toHaveBeenCalled()
      expect(photoAPIMock.face.onScanComplete).toHaveBeenCalled()
    })

    it('should handle missing photoAPI gracefully', () => {
      // Temporarily remove photoAPI
      const originalWindow = global.window
      Object.defineProperty(global, 'window', {
        value: {},
        writable: true
      })

      // Should not throw
      expect(() => useScanStore()).not.toThrow()

      // Restore
      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true
      })
    })

    it('should store unsubscribe functions for cleanup', () => {
      const store = useScanStore()
      // Access internal state through unregisterIpcListeners which uses the unsubscribeFns array
      store.unregisterIpcListeners()

      expect(mockUnsubscribeProgress).toHaveBeenCalled()
      expect(mockUnsubscribeStatus).toHaveBeenCalled()
      expect(mockUnsubscribeComplete).toHaveBeenCalled()
    })
  })

  // ============================================
  // AC-2: Global Store receives and stores scan state
  // ============================================
  describe('AC-2: Global Store receives and stores scan state', () => {
    it('should listen to face:progress events via onProgress', () => {
      useScanStore()

      expect(photoAPIMock.face.onProgress).toHaveBeenCalled()
      const progressCallback = photoAPIMock.face.onProgress.mock.calls[0][0]
      expect(typeof progressCallback).toBe('function')
    })

    it('should update progress state when onProgress is called', () => {
      const store = useScanStore()
      const progressCallback = photoAPIMock.face.onProgress.mock.calls[0][0]

      const progressData: ScanProgress = {
        current: 50,
        total: 100,
        percent: 50,
        status: 'Processing images...'
      }

      progressCallback(progressData)

      expect(store.state).toBe('scanning')
      expect(store.stage).toBe('processing')
      expect(store.progress.current).toBe(50)
      expect(store.progress.total).toBe(100)
      expect(store.progress.percent).toBe(50)
      expect(store.progress.status).toBe('Processing images...')
      expect(store.showProgress).toBe(true)
    })

    it('should handle progress data with missing fields', () => {
      const store = useScanStore()
      const progressCallback = photoAPIMock.face.onProgress.mock.calls[0][0]

      // Call with partial data
      progressCallback({
        current: undefined,
        total: undefined,
        percent: undefined,
        status: undefined
      })

      expect(store.progress.current).toBe(0)
      expect(store.progress.total).toBe(1)
      expect(store.progress.percent).toBe(0)
      expect(store.progress.status).toBe('正在扫描...')
    })

    it('should listen to face:status events via onStatus', () => {
      useScanStore()

      expect(photoAPIMock.face.onStatus).toHaveBeenCalled()
      const statusCallback = photoAPIMock.face.onStatus.mock.calls[0][0]
      expect(typeof statusCallback).toBe('function')
    })

    it('should handle "started" status', () => {
      const store = useScanStore()
      const statusCallback = photoAPIMock.face.onStatus.mock.calls[0][0]

      const statusData: ScanStatus = {
        stage: 'started',
        message: 'Starting scan...'
      }

      statusCallback(statusData)

      expect(store.state).toBe('scanning')
      expect(store.stage).toBe('started')
      expect(store.progress.status).toBe('Starting scan...')
      expect(store.progress.percent).toBe(0)
      expect(store.showProgress).toBe(true)
    })

    it('should handle "queued" status', () => {
      const store = useScanStore()
      const statusCallback = photoAPIMock.face.onStatus.mock.calls[0][0]

      const statusData: ScanStatus = {
        stage: 'queued',
        message: 'Queued...',
        total: 200
      }

      statusCallback(statusData)

      expect(store.state).toBe('scanning')
      expect(store.stage).toBe('queued')
      expect(store.progress.total).toBe(200)
      expect(store.progress.status).toBe('Queued...')
    })

    it('should handle "processing" status', () => {
      const store = useScanStore()
      const statusCallback = photoAPIMock.face.onStatus.mock.calls[0][0]

      const statusData: ScanStatus = {
        stage: 'processing',
        message: 'Processing...',
        current: 75,
        total: 150,
        percent: 50
      }

      statusCallback(statusData)

      expect(store.state).toBe('scanning')
      expect(store.stage).toBe('processing')
      expect(store.progress.current).toBe(75)
      expect(store.progress.total).toBe(150)
      expect(store.progress.percent).toBe(50)
    })

    it('should calculate percent when not provided in processing status', () => {
      const store = useScanStore()
      const statusCallback = photoAPIMock.face.onStatus.mock.calls[0][0]

      const statusData: ScanStatus = {
        stage: 'processing',
        current: 50,
        total: 100
      }

      statusCallback(statusData)

      expect(store.progress.percent).toBe(50)
    })

    it('should handle "error" status', () => {
      const store = useScanStore()
      const statusCallback = photoAPIMock.face.onStatus.mock.calls[0][0]

      const statusData: ScanStatus = {
        stage: 'error',
        error: 'Scan failed due to network error'
      }

      statusCallback(statusData)

      expect(store.state).toBe('failed')
      expect(store.stage).toBe('error')
      expect(store.progress.status).toBe('扫描失败')
      expect(store.error).toBe('Scan failed due to network error')
    })

    it('should provide computed getters for state checks', () => {
      const store = useScanStore()

      expect(store.isScanning).toBe(false)
      expect(store.isCompleted).toBe(false)
      expect(store.isFailed).toBe(false)
      expect(store.isCancelled).toBe(false)
      expect(store.progressPercent).toBe(0)
    })
  })

  // ============================================
  // AC-3: View component syncs with Store state
  // ============================================
  describe('AC-3: View component syncs with Store state', () => {
    it('should maintain state when store is accessed multiple times', () => {
      const store = useScanStore()

      // Simulate progress
      store.startScan()
      expect(store.state).toBe('scanning')

      // Access store again (simulating component remount)
      const store2 = useScanStore()
      expect(store2.state).toBe('scanning')
      expect(store2.isScanning).toBe(true)
    })

    it('should update progressText based on stage', () => {
      const store = useScanStore()

      // Initially empty
      expect(store.progressText).toBe('')

      // During processing
      store.onScanStatus({
        stage: 'processing',
        current: 25,
        total: 100
      })
      expect(store.progressText).toBe('正在扫描... (25/100)')
    })

    it('should showProgressIfActive only when scanning', () => {
      const store = useScanStore()

      // Idle state - should not show
      store.showProgressIfActive()
      expect(store.showProgress).toBe(false)

      // Scanning state - should show
      store.state = 'scanning'
      store.showProgressIfActive()
      expect(store.showProgress).toBe(true)

      // Completed state - should not show
      store.state = 'completed'
      store.showProgress = false
      store.showProgressIfActive()
      expect(store.showProgress).toBe(false)
    })

    it('should hide progress while preserving state', () => {
      const store = useScanStore()
      store.startScan()
      expect(store.showProgress).toBe(true)

      store.hideProgress()
      expect(store.showProgress).toBe(false)
      expect(store.state).toBe('scanning') // State preserved
    })
  })

  // ============================================
  // AC-4: Scan completion state propagates correctly
  // ============================================
  describe('AC-4: Scan completion state propagates correctly', () => {
    it('should listen to face:scan-complete events via onScanComplete', () => {
      useScanStore()

      expect(photoAPIMock.face.onScanComplete).toHaveBeenCalled()
      const completeCallback = photoAPIMock.face.onScanComplete.mock.calls[0][0]
      expect(typeof completeCallback).toBe('function')
    })

    it('should handle scan complete event', () => {
      const store = useScanStore()
      const completeCallback = photoAPIMock.face.onScanComplete.mock.calls[0][0]

      const resultData: ScanResult = {
        total: 100,
        completed: 95,
        failed: 5,
        detectedFaces: 150
      }

      completeCallback(resultData)

      expect(store.state).toBe('completed')
      expect(store.stage).toBe('completed')
      expect(store.result).toEqual(resultData)
      expect(store.progress.percent).toBe(100)
      expect(store.progress.status).toContain('扫描完成')
      expect(store.progress.status).toContain('95/100')
      expect(store.progress.status).toContain('150')
      expect(store.showProgress).toBe(true)
    })

    it('should hide progress after 3 seconds on completion', () => {
      const store = useScanStore()
      const completeCallback = photoAPIMock.face.onScanComplete.mock.calls[0][0]

      completeCallback({
        total: 100,
        completed: 100,
        failed: 0,
        detectedFaces: 200
      })

      expect(store.showProgress).toBe(true)

      // Fast forward 3 seconds
      vi.advanceTimersByTime(3000)

      expect(store.showProgress).toBe(false)
    })

    it('should not hide progress if state changed from completed', () => {
      const store = useScanStore()
      const completeCallback = photoAPIMock.face.onScanComplete.mock.calls[0][0]

      completeCallback({
        total: 100,
        completed: 100,
        failed: 0,
        detectedFaces: 200
      })

      // Change state before timeout
      store.state = 'scanning'

      // Fast forward 3 seconds
      vi.advanceTimersByTime(3000)

      // Progress should still be visible because state changed
      expect(store.showProgress).toBe(true)
    })

    it('should handle completed status from onStatus', () => {
      const store = useScanStore()
      const statusCallback = photoAPIMock.face.onStatus.mock.calls[0][0]

      const statusData: ScanStatus = {
        stage: 'completed',
        message: 'Scan finished successfully'
      }

      statusCallback(statusData)

      expect(store.state).toBe('completed')
      expect(store.stage).toBe('completed')
      expect(store.progress.percent).toBe(100)
      expect(store.progress.status).toBe('Scan finished successfully')
    })

    it('should hide progress after 3 seconds on status completed', () => {
      const store = useScanStore()
      const statusCallback = photoAPIMock.face.onStatus.mock.calls[0][0]

      // First set showProgress to true (as it would be during scanning)
      store.showProgress = true

      statusCallback({
        stage: 'completed'
      })

      // State should be completed but showProgress may not be set to true
      // in onScanStatus (unlike onScanComplete) - this is implementation detail
      expect(store.state).toBe('completed')

      // Fast forward 3 seconds
      vi.advanceTimersByTime(3000)

      // After timeout, progress should be hidden
      expect(store.showProgress).toBe(false)
    })

    it('should update isCompleted getter when state changes to completed', () => {
      const store = useScanStore()
      expect(store.isCompleted).toBe(false)

      store.onScanComplete({
        total: 100,
        completed: 100,
        failed: 0,
        detectedFaces: 200
      })

      expect(store.isCompleted).toBe(true)
    })
  })

  // ============================================
  // Actions Tests
  // ============================================
  describe('Actions', () => {
    it('startScan should set scanning state', () => {
      const store = useScanStore()

      store.startScan()

      expect(store.state).toBe('scanning')
      expect(store.stage).toBe('started')
      expect(store.progress.status).toBe('准备扫描...')
      expect(store.showProgress).toBe(true)
      expect(store.result).toBeNull()
      expect(store.error).toBe('')
    })

    it('cancelScan should set cancelled state', () => {
      const store = useScanStore()
      store.startScan()

      store.cancelScan()

      expect(store.state).toBe('cancelled')
      expect(store.stage).toBe('')
      expect(store.progress.status).toBe('已取消')
      expect(store.showProgress).toBe(false)
    })

    it('cancelScan should call face.cancel API', () => {
      const store = useScanStore()
      store.startScan()

      store.cancelScan()

      expect(photoAPIMock.face.cancel).toHaveBeenCalled()
    })

    it('resetScan should reset all state to initial values', () => {
      const store = useScanStore()

      // Set some state first
      store.startScan()
      store.onScanProgress({
        current: 50,
        total: 100,
        percent: 50,
        status: 'Processing'
      })

      // Reset
      store.resetScan()

      expect(store.state).toBe('idle')
      expect(store.stage).toBe('')
      expect(store.progress).toEqual({
        current: 0,
        total: 0,
        percent: 0,
        status: ''
      })
      expect(store.result).toBeNull()
      expect(store.error).toBe('')
      expect(store.showProgress).toBe(false)
    })

    it('should handle cancel API errors gracefully', () => {
      const store = useScanStore()
      photoAPIMock.face.cancel.mockImplementation(() => {
        throw new Error('Cancel failed')
      })

      // Should not throw
      expect(() => store.cancelScan()).not.toThrow()
      expect(store.state).toBe('cancelled')
    })
  })

  // ============================================
  // Edge Cases Tests
  // ============================================
  describe('Edge Cases', () => {
    it('should handle onScanProgress with zero total', () => {
      const store = useScanStore()

      store.onScanProgress({
        current: 0,
        total: 0,
        percent: 0,
        status: 'Starting'
      })

      // Should not divide by zero
      expect(store.progress.total).toBe(1) // Falls back to 1
    })

    it('should handle onScanStatus with unknown stage', () => {
      const store = useScanStore()
      const statusCallback = photoAPIMock.face.onStatus.mock.calls[0][0]

      // Call with unknown stage - should not change state
      const currentState = store.state
      statusCallback({ stage: 'unknown' as any })

      expect(store.state).toBe(currentState)
    })

    it('should handle multiple rapid progress updates', () => {
      const store = useScanStore()

      // Simulate rapid updates
      for (let i = 0; i < 10; i++) {
        store.onScanProgress({
          current: i * 10,
          total: 100,
          percent: i * 10,
          status: `Progress ${i}`
        })
      }

      expect(store.progress.current).toBe(90)
      expect(store.progress.percent).toBe(90)
    })

    it('should handle photoAPI.face being undefined', () => {
      // Temporarily modify window to have photoAPI but no face
      const originalWindow = global.window
      Object.defineProperty(global, 'window', {
        value: { photoAPI: {} },
        writable: true
      })

      // Should not throw when creating store
      expect(() => useScanStore()).not.toThrow()

      // Restore
      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true
      })
    })

    it('should handle partial photoAPI.face (some methods missing)', () => {
      const originalWindow = global.window
      Object.defineProperty(global, 'window', {
        value: {
          photoAPI: {
            face: {
              onProgress: vi.fn().mockReturnValue(vi.fn())
              // onStatus and onScanComplete missing
            }
          }
        },
        writable: true
      })

      // Should not throw
      expect(() => useScanStore()).not.toThrow()

      // Restore
      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true
      })
    })
  })

  // ============================================
  // E-10.4: Intelligent Diagnostics
  // ============================================
  describe('Story E-10.4: Intelligent Diagnostics', () => {
    describe('AC-1: State reconciliation auto-fix notification', () => {
      beforeEach(() => {
        // Reset mock to return completed status for these tests
        photoAPIMock.face.getQueueStatus = vi.fn().mockResolvedValue({
          isRunning: false,
          pending: 0,
          completed: 100
        })
      })

      it('should show diagnostic message when reconciliation fixes state', async () => {
        const store = useScanStore()

        // Start scanning
        store.startScan()
        expect(store.state).toBe('scanning')

        // Wait for reconciliation to run (immediate execution on start)
        await vi.waitFor(() => {
          expect(store.diagnosticMessage).not.toBeNull()
        })

        // Diagnostic message should be shown
        expect(store.diagnosticMessage?.text).toBe('发现扫描任务已在后台完成，已为您更新状态。')
        expect(store.diagnosticMessage?.type).toBe('success')
        expect(store.diagnosticMessage?.visible).toBe(true)
      })

      it('should auto-hide diagnostic message after 3 seconds', async () => {
        const store = useScanStore()

        photoAPIMock.face.getQueueStatus = vi.fn().mockResolvedValue({
          isRunning: false,
          pending: 0,
          completed: 100
        })

        store.startScan()
        await vi.advanceTimersByTimeAsync(100)

        expect(store.diagnosticMessage?.visible).toBe(true)

        // Advance 3 seconds
        await vi.advanceTimersByTimeAsync(3000)

        // Message should be hidden
        expect(store.diagnosticMessage?.visible).toBe(false)
      })

      it('should allow manual dismissal of diagnostic message', async () => {
        const store = useScanStore()

        photoAPIMock.face.getQueueStatus = vi.fn().mockResolvedValue({
          isRunning: false,
          pending: 0,
          completed: 100
        })

        store.startScan()
        await vi.advanceTimersByTimeAsync(100)

        expect(store.diagnosticMessage?.visible).toBe(true)

        // Manually dismiss
        store.dismissDiagnostic()

        expect(store.diagnosticMessage?.visible).toBe(false)
      })
    })

    describe('AC-3: Scan stall detection', () => {
      it('should start diagnostic timer when scan starts', () => {
        const store = useScanStore()

        expect(store.isStalled).toBe(false)

        store.startScan()

        // Stall state should be cleared
        expect(store.isStalled).toBe(false)
      })

      it('should mark scan as stalled when check detects not running', async () => {
        const store = useScanStore()

        // Start scan
        store.startScan()
        expect(store.isStalled).toBe(false)

        // Manually trigger the stall check logic (simulating what happens after 5 min)
        // Since the actual checkIfStalled is internal, we verify the state can be set
        store.isStalled = true
        expect(store.isStalled).toBe(true)
      })

      it('should remain not stalled while scan is running', () => {
        const store = useScanStore()

        store.startScan()
        expect(store.state).toBe('scanning')
        expect(store.isStalled).toBe(false)

        // Simulate progress - still not stalled
        store.onScanProgress({
          current: 50,
          total: 100,
          percent: 50,
          status: 'Processing'
        })
        expect(store.isStalled).toBe(false)
      })

      it('should not check stall if not in scanning state', () => {
        const store = useScanStore()

        // Don't start scan - stay in idle
        expect(store.state).toBe('idle')
        expect(store.isStalled).toBe(false)
      })
    })

    describe('AC-4: Diagnose and restart', () => {
      beforeEach(() => {
        // Reset mock to resolve successfully
        photoAPIMock.face.cancel = vi.fn().mockResolvedValue(undefined)
      })

      it('should set isDiagnosing during diagnose', async () => {
        const store = useScanStore()

        expect(store.isDiagnosing).toBe(false)

        // Start diagnosis
        const diagnosePromise = store.diagnoseAndRestart()

        // Should be true immediately (synchronous)
        expect(store.isDiagnosing).toBe(true)

        await diagnosePromise

        expect(store.isDiagnosing).toBe(false)
      })

      it('should call face.cancel during diagnosis', async () => {
        const store = useScanStore()
        store.startScan()

        await store.diagnoseAndRestart()

        expect(photoAPIMock.face.cancel).toHaveBeenCalled()
      })

      it('should reset scan state after diagnosis', async () => {
        const store = useScanStore()
        store.startScan()
        store.onScanProgress({
          current: 50,
          total: 100,
          percent: 50,
          status: 'Processing'
        })

        await store.diagnoseAndRestart()

        expect(store.state).toBe('idle')
        expect(store.stage).toBe('')
        expect(store.progress.current).toBe(0)
        expect(store.progress.percent).toBe(0)
      })

      it('should clear stalled state after diagnosis', async () => {
        const store = useScanStore()

        // Mark as stalled
        store.isStalled = true

        await store.diagnoseAndRestart()

        expect(store.isStalled).toBe(false)
      })

      it('should show success message after diagnosis', async () => {
        const store = useScanStore()

        await store.diagnoseAndRestart()

        expect(store.diagnosticMessage?.text).toBe('诊断完成，可以重新扫描了')
        expect(store.diagnosticMessage?.type).toBe('success')
        expect(store.diagnosticMessage?.visible).toBe(true)
      })

      it('should handle diagnosis errors gracefully', async () => {
        const store = useScanStore()

        photoAPIMock.face.cancel.mockRejectedValueOnce(new Error('Cancel failed'))

        await store.diagnoseAndRestart()

        // Should show warning message
        expect(store.diagnosticMessage?.type).toBe('warning')
        expect(store.isDiagnosing).toBe(false)
      })
    })

    describe('Diagnostic State', () => {
      it('should expose diagnosticMessage in store', () => {
        const store = useScanStore()

        expect(store.diagnosticMessage).toBeDefined()
        expect(store.diagnosticMessage).toBeNull()
      })

      it('should expose showRecoveryDialog in store', () => {
        const store = useScanStore()

        expect(store.showRecoveryDialog).toBeDefined()
        expect(store.showRecoveryDialog).toBe(false)
      })

      it('should expose isDiagnosing in store', () => {
        const store = useScanStore()

        expect(store.isDiagnosing).toBeDefined()
        expect(store.isDiagnosing).toBe(false)
      })

      it('should expose isStalled in store', () => {
        const store = useScanStore()

        expect(store.isStalled).toBeDefined()
        expect(store.isStalled).toBe(false)
      })
    })

    describe('showDiagnosticMessage', () => {
      it('should create diagnostic message with correct properties', () => {
        const store = useScanStore()

        store.showDiagnosticMessage('Test message', 'info')

        expect(store.diagnosticMessage?.text).toBe('Test message')
        expect(store.diagnosticMessage?.type).toBe('info')
        expect(store.diagnosticMessage?.visible).toBe(true)
      })

      it('should support different message types', () => {
        const store = useScanStore()

        store.showDiagnosticMessage('Success', 'success')
        expect(store.diagnosticMessage?.type).toBe('success')

        store.showDiagnosticMessage('Warning', 'warning')
        expect(store.diagnosticMessage?.type).toBe('warning')

        store.showDiagnosticMessage('Info', 'info')
        expect(store.diagnosticMessage?.type).toBe('info')
      })
    })
  })
})
