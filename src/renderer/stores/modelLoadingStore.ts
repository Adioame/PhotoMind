/**
 * PhotoMind - 模型加载状态 Store
 *
 * 管理 face-api 和 CLIP 模型的加载状态和进度
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ModelLoadingState {
  faceApi: {
    loaded: boolean
    progress: number
  }
  clip: {
    loaded: boolean
    progress: number
  }
  overall: number
  status: 'idle' | 'loading' | 'completed' | 'error'
  error?: string
}

export const useModelLoadingStore = defineStore('modelLoading', () => {
  // 状态
  const state = ref<ModelLoadingState>({
    faceApi: {
      loaded: false,
      progress: 0
    },
    clip: {
      loaded: false,
      progress: 0
    },
    overall: 0,
    status: 'idle'
  })

  const isLoading = computed(() => state.value.status === 'loading')
  const isComplete = computed(() => state.value.status === 'completed')
  const hasError = computed(() => state.value.status === 'error')
  const isReady = computed(() =>
    state.value.faceApi.loaded && state.value.clip.loaded
  )

  // 更新进度
  function updateProgress(progress: Partial<ModelLoadingState>) {
    state.value = {
      ...state.value,
      ...progress,
      faceApi: {
        ...state.value.faceApi,
        ...(progress.faceApi || {})
      },
      clip: {
        ...state.value.clip,
        ...(progress.clip || {})
      }
    }
  }

  // 设置 face-api 进度
  function setFaceApiProgress(progress: number, loaded?: boolean) {
    state.value.faceApi.progress = Math.min(100, Math.max(0, progress))
    if (loaded !== undefined) {
      state.value.faceApi.loaded = loaded
    }
    calculateOverallProgress()
  }

  // 设置 CLIP 进度
  function setClipProgress(progress: number, loaded?: boolean) {
    state.value.clip.progress = Math.min(100, Math.max(0, progress))
    if (loaded !== undefined) {
      state.value.clip.loaded = loaded
    }
    calculateOverallProgress()
  }

  // 计算总进度
  function calculateOverallProgress() {
    state.value.overall = Math.round(
      (state.value.faceApi.progress + state.value.clip.progress) / 2
    )
  }

  // 设置状态
  function setStatus(status: ModelLoadingState['status'], error?: string) {
    state.value.status = status
    if (error !== undefined) {
      state.value.error = error
    }
  }

  // 开始加载
  function startLoading() {
    state.value = {
      faceApi: { loaded: false, progress: 0 },
      clip: { loaded: false, progress: 0 },
      overall: 0,
      status: 'loading',
      error: undefined
    }
  }

  // 完成加载
  function completeLoading() {
    state.value.status = 'completed'
    state.value.faceApi.loaded = true
    state.value.clip.loaded = true
    state.value.faceApi.progress = 100
    state.value.clip.progress = 100
    state.value.overall = 100
  }

  // 设置错误
  function setError(error: string) {
    state.value.status = 'error'
    state.value.error = error
  }

  // 重置状态
  function reset() {
    state.value = {
      faceApi: { loaded: false, progress: 0 },
      clip: { loaded: false, progress: 0 },
      overall: 0,
      status: 'idle',
      error: undefined
    }
  }

  return {
    state,
    isLoading,
    isComplete,
    hasError,
    isReady,
    updateProgress,
    setFaceApiProgress,
    setClipProgress,
    setStatus,
    startLoading,
    completeLoading,
    setError,
    reset
  }
})
