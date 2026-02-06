/**
 * PhotoMind - Global Scan State Manager
 * 全局扫描状态管理器
 *
 * This store manages face detection scan state globally.
 * It registers IPC listeners once when created and persists
 * across component lifecycles.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/** 扫描状态类型 */
export type ScanState = 'idle' | 'scanning' | 'completed' | 'failed' | 'cancelled'

/** 扫描阶段 */
export type ScanStage = '' | 'started' | 'queued' | 'processing' | 'completed' | 'error'

/** 扫描进度数据 */
export interface ScanProgress {
  current: number
  total: number
  percent: number
  status: string
}

/** 扫描结果数据 */
export interface ScanResult {
  total: number
  completed: number
  failed: number
  detectedFaces: number
}

/** 扫描状态详情 */
export interface ScanStatus {
  stage: ScanStage
  message?: string
  current?: number
  total?: number
  percent?: number
  error?: string
}

export const useScanStore = defineStore('scan', () => {
  // ============ State ============
  /** 当前扫描状态 */
  const state = ref<ScanState>('idle')

  /** 扫描阶段 */
  const stage = ref<ScanStage>('')

  /** 扫描进度 */
  const progress = ref<ScanProgress>({
    current: 0,
    total: 0,
    percent: 0,
    status: ''
  })

  /** 扫描结果 */
  const result = ref<ScanResult | null>(null)

  /** 错误信息 */
  const error = ref<string>('')

  /** 是否显示进度条 */
  const showProgress = ref(false)

  /** 监听器卸载函数 */
  const unsubscribeFns: Array<() => void> = []

  // ============ Reconciliation ============
  /** 对账定时器 ID */
  const reconciliationTimer = ref<NodeJS.Timeout | null>(null)

  /** 上次对账时间 */
  const lastReconciliationTime = ref<number>(0)

  // ============ Diagnostics ============
  /** 诊断消息 */
  const diagnosticMessage = ref<{
    text: string
    type: 'success' | 'warning' | 'info'
    visible: boolean
  } | null>(null)

  /** 是否显示恢复对话框 */
  const showRecoveryDialog = ref(false)

  /** 是否正在诊断中 */
  const isDiagnosing = ref(false)

  /** 扫描是否停滞 */
  const isStalled = ref(false)

  /** 诊断定时器 ID */
  const diagnosticTimer = ref<NodeJS.Timeout | null>(null)

  // ============ Getters ============
  /** 是否正在扫描中 */
  const isScanning = computed(() => state.value === 'scanning')

  /** 是否已完成 */
  const isCompleted = computed(() => state.value === 'completed')

  /** 是否已失败 */
  const isFailed = computed(() => state.value === 'failed')

  /** 是否已取消 */
  const isCancelled = computed(() => state.value === 'cancelled')

  /** 进度百分比（用于进度条） */
  const progressPercent = computed(() => progress.value.percent)

  /** 进度文本 */
  const progressText = computed(() => {
    if (stage.value === 'processing') {
      return `正在扫描... (${progress.value.current}/${progress.value.total})`
    }
    return progress.value.status
  })

  // ============ Actions ============

  /**
   * 处理扫描进度事件
   */
  function onScanProgress(data: ScanProgress) {
    state.value = 'scanning'
    stage.value = 'processing'
    progress.value = {
      current: data.current || 0,
      total: data.total || 1,
      percent: data.percent || 0,
      status: data.status || '正在扫描...'
    }
    showProgress.value = true
  }

  /**
   * 处理扫描状态事件
   */
  function onScanStatus(status: ScanStatus) {
    switch (status.stage) {
      case 'started':
        state.value = 'scanning'
        stage.value = 'started'
        progress.value.status = status.message || '开始扫描...'
        progress.value.percent = 0
        showProgress.value = true
        break

      case 'queued':
        state.value = 'scanning'
        stage.value = 'queued'
        progress.value.status = status.message || '排队中...'
        progress.value.total = status.total || 0
        progress.value.percent = 0
        showProgress.value = true
        break

      case 'processing':
        state.value = 'scanning'
        stage.value = 'processing'
        progress.value.current = Number(status.current) || 0
        progress.value.total = Number(status.total) || 1
        progress.value.percent = status.percent || Math.round((progress.value.current / progress.value.total) * 100)
        progress.value.status = status.message || `正在扫描... (${progress.value.current}/${progress.value.total})`
        showProgress.value = true
        break

      case 'completed':
        state.value = 'completed'
        stage.value = 'completed'
        progress.value.status = status.message || '扫描完成'
        progress.value.percent = 100
        // 3秒后隐藏进度条
        setTimeout(() => {
          if (state.value === 'completed') {
            showProgress.value = false
          }
        }, 3000)
        break

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

  /**
   * 处理扫描完成事件
   */
  function onScanComplete(data: ScanResult) {
    state.value = 'completed'
    stage.value = 'completed'
    result.value = data
    progress.value.percent = 100
    progress.value.status = `扫描完成: ${data.completed}/${data.total} 张照片, 检测到 ${data.detectedFaces} 张人脸`
    showProgress.value = true

    // 停止对账
    stopReconciliation()

    // 停止停滞检测
    stopDiagnosticTimer()

    // 清除停滞状态
    isStalled.value = false

    // 3秒后隐藏进度条
    setTimeout(() => {
      if (state.value === 'completed') {
        showProgress.value = false
      }
    }, 3000)
  }

  /**
   * 开始扫描
   */
  function startScan() {
    state.value = 'scanning'
    stage.value = 'started'
    progress.value = { current: 0, total: 0, percent: 0, status: '准备扫描...' }
    result.value = null
    error.value = ''
    showProgress.value = true

    // 启动对账机制
    startReconciliation()

    // 启动停滞检测
    startDiagnosticTimer()

    // 清除之前的停滞状态
    isStalled.value = false
  }

  /**
   * 取消扫描
   */
  function cancelScan() {
    state.value = 'cancelled'
    stage.value = ''
    progress.value.status = '已取消'
    showProgress.value = false

    // 停止对账
    stopReconciliation()

    // 停止停滞检测
    stopDiagnosticTimer()

    // 清除停滞状态
    isStalled.value = false

    // 调用主进程取消接口
    try {
      (window as any).photoAPI?.face?.cancel?.()
    } catch (e) {
      console.warn('[ScanStore] 取消扫描失败:', e)
    }
  }

  /**
   * 重置扫描状态
   */
  function resetScan() {
    state.value = 'idle'
    stage.value = ''
    progress.value = { current: 0, total: 0, percent: 0, status: '' }
    result.value = null
    error.value = ''
    showProgress.value = false
  }

  /**
   * 隐藏进度条（保留状态）
   */
  function hideProgress() {
    showProgress.value = false
  }

  /**
   * 显示进度条（如果处于活跃状态）
   */
  function showProgressIfActive() {
    if (state.value === 'scanning') {
      showProgress.value = true
    }
  }

  // ============ Diagnostic Methods ============

  /**
   * 显示诊断提示
   */
  function showDiagnosticMessage(message: string, type: 'success' | 'warning' | 'info') {
    diagnosticMessage.value = { text: message, type, visible: true }
    console.log(`[ScanStore] 诊断提示: ${message}`)

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
      // 等待动画完成后清除
      setTimeout(() => {
        diagnosticMessage.value = null
      }, 200)
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
      await (window as any).photoAPI?.face?.cancel?.()

      // 2. 重置本地状态
      resetScan()

      // 3. 清除停滞状态
      isStalled.value = false

      // 4. 停止诊断定时器
      stopDiagnosticTimer()

      showDiagnosticMessage('诊断完成，可以重新扫描了', 'success')
    } catch (error) {
      console.error('[ScanStore] 诊断失败:', error)
      showDiagnosticMessage('诊断过程出错，请重试', 'warning')
    } finally {
      isDiagnosing.value = false
    }
  }

  /**
   * 启动停滞检测定时器
   */
  function startDiagnosticTimer() {
    // 防止重复启动
    if (diagnosticTimer.value) {
      return
    }

    console.log('[ScanStore] 启动停滞检测定时器 (5分钟)')

    // 5分钟后检测是否停滞
    diagnosticTimer.value = setTimeout(() => {
      checkIfStalled()
    }, 5 * 60 * 1000) // 5分钟
  }

  /**
   * 停止停滞检测定时器
   */
  function stopDiagnosticTimer() {
    if (diagnosticTimer.value) {
      clearTimeout(diagnosticTimer.value)
      diagnosticTimer.value = null
      console.log('[ScanStore] 停止停滞检测定时器')
    }
  }

  /**
   * 检查扫描是否停滞
   */
  async function checkIfStalled() {
    // 只有在扫描状态才检查
    if (state.value !== 'scanning') {
      return
    }

    try {
      const api = (window as any).photoAPI?.face
      if (!api?.getQueueStatus) {
        return
      }

      const status = await api.getQueueStatus()

      // 如果主进程不在运行但本地仍在扫描，标记为停滞
      if (!status?.isRunning && state.value === 'scanning') {
        console.log('[ScanStore] 检测到扫描停滞')
        isStalled.value = true
      }
    } catch (error) {
      console.error('[ScanStore] 检查停滞状态失败:', error)
    }
  }

  // ============ Reconciliation Methods ============

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

        // 显示自动修复提示 (AC-1)
        showDiagnosticMessage('发现扫描任务已在后台完成，已为您更新状态。', 'success')
      } else {
        console.log('[ScanStore] 状态对账：状态一致')
      }
    } catch (error) {
      console.error('[ScanStore] 状态对账失败:', error)
    }
  }

  // ============ IPC Listener Registration ============
  /**
   * 注册 IPC 监听器
   * 在 Store 创建时调用一次
   */
  function registerIpcListeners() {
    const api = (window as any).photoAPI?.face

    if (!api) {
      console.warn('[ScanStore] photoAPI.face 不可用，跳过 IPC 监听注册')
      return
    }

    // 注册进度监听器
    if (api.onProgress) {
      const unsubscribe = api.onProgress((data: ScanProgress) => {
        console.log('[ScanStore] 收到进度:', data)
        onScanProgress(data)
      })
      unsubscribeFns.push(unsubscribe)
    }

    // 注册状态监听器
    if (api.onStatus) {
      const unsubscribe = api.onStatus((status: ScanStatus) => {
        console.log('[ScanStore] 收到状态:', status)
        onScanStatus(status)
      })
      unsubscribeFns.push(unsubscribe)
    }

    // 注册完成监听器
    if (api.onScanComplete) {
      const unsubscribe = api.onScanComplete((data: ScanResult) => {
        console.log('[ScanStore] 收到完成事件:', data)
        onScanComplete(data)
      })
      unsubscribeFns.push(unsubscribe)
    }

    console.log('[ScanStore] IPC 监听器已注册，监听器数量:', unsubscribeFns.length)
  }

  /**
   * 卸载 IPC 监听器
   * 注意：通常不需要调用，因为 Store 是全局单例
   */
  function unregisterIpcListeners() {
    unsubscribeFns.forEach(fn => fn())
    unsubscribeFns.length = 0
    console.log('[ScanStore] IPC 监听器已卸载')
  }

  // ============ Initialization ============
  // 注册 IPC 监听器（只执行一次）
  registerIpcListeners()

  // ============ Return ============
  return {
    // State
    state,
    stage,
    progress,
    result,
    error,
    showProgress,

    // Diagnostic State
    diagnosticMessage,
    showRecoveryDialog,
    isDiagnosing,
    isStalled,

    // Getters
    isScanning,
    isCompleted,
    isFailed,
    isCancelled,
    progressPercent,
    progressText,

    // Actions
    startScan,
    cancelScan,
    resetScan,
    hideProgress,
    showProgressIfActive,
    onScanProgress,
    onScanStatus,
    onScanComplete,
    unregisterIpcListeners,

    // Diagnostic Actions
    showDiagnosticMessage,
    dismissDiagnostic,
    diagnoseAndRestart
  }
})
