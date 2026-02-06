/**
 * PhotoMind - Photo Store
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ImportProgress {
  current: number
  total: number
  currentFile: string
  status: 'scanning' | 'importing' | 'completed' | 'error'
  importedCount: number
  errorCount: number
}

export const usePhotoStore = defineStore('photos', () => {
  // 状态
  const photos = ref<any[]>([])
  const loading = ref(false)
  const totalCount = ref(0)
  const hasMore = ref(true)
  const importProgress = ref<ImportProgress | null>(null)
  const isImporting = ref(false)
  // 进度监听器清理函数
  let progressCleanup: (() => void) | null = null

  // Actions
  async function fetchPhotos(options: { limit?: number; offset?: number } = {}) {
    const limit = options.limit || 24
    const offset = options.offset || 0

    console.log('[photoStore.fetchPhotos] 开始加载 - limit:', limit, 'offset:', offset)
    loading.value = true
    try {
      const result = await (window as any).photoAPI.photos.getList({ limit, offset })
      console.log('[photoStore.fetchPhotos] API 返回:', result?.length, '张照片')

      if (offset === 0) {
        photos.value = result || []
        console.log('[photoStore.fetchPhotos] 重置 photos:', photos.value.length)
      } else {
        photos.value = [...photos.value, ...(result || [])]
        console.log('[photoStore.fetchPhotos] 追加后 photos:', photos.value.length)
      }

      // 获取照片总数（而不是已加载数量）
      try {
        const countResult = await (window as any).photoAPI.photos.getCount()
        totalCount.value = countResult?.total || result?.length || 0
        console.log('[photoStore.fetchPhotos] totalCount:', totalCount.value)
      } catch {
        totalCount.value = photos.value.length
      }

      hasMore.value = result?.length === limit

      console.log('[photoStore.fetchPhotos] 完成 - photos.length:', photos.value.length, 'totalCount:', totalCount.value)
    } catch (error) {
      console.error('[photoStore.fetchPhotos] 获取照片失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchPhotoDetail(id: string) {
    try {
      return await (window as any).photoAPI.photos.getDetail(id)
    } catch (error) {
      console.error('获取照片详情失败:', error)
      return null
    }
  }

  async function searchPhotos(query: string, filters?: any) {
    loading.value = true
    try {
      const result = await (window as any).photoAPI.photos.search(query, filters)
      return result
    } catch (error) {
      console.error('搜索失败:', error)
      return { results: [], total: 0 }
    } finally {
      loading.value = false
    }
  }

  async function syncPhotos() {
    loading.value = true
    try {
      const count = await (window as any).photoAPI.sync.start()
      await fetchPhotos({ limit: 100 })
      return count
    } catch (error) {
      console.error('同步失败:', error)
      return 0
    } finally {
      loading.value = false
    }
  }

  // 本地照片导入
  async function selectAndImportFolder(): Promise<boolean> {
    try {
      // 选择文件夹
      const folders = await (window as any).photoAPI.local.selectFolder()

      if (!folders || folders.length === 0) {
        return false
      }

      // 开始导入
      return await importFromFolder(folders[0])
    } catch (error) {
      console.error('选择文件夹失败:', error)
      return false
    }
  }

  async function importFromFolder(folderPath: string): Promise<boolean> {
    isImporting.value = true
    importProgress.value = {
      current: 0,
      total: 100,
      currentFile: '',
      status: 'scanning',
      importedCount: 0,
      errorCount: 0
    }

    try {
      // 设置进度监听器（通过 IPC 事件）
      if ((window as any).photoAPI.import?.onProgress) {
        progressCleanup = (window as any).photoAPI.import.onProgress((progress: any) => {
          importProgress.value = {
            current: progress.currentIndex || 0,
            total: progress.total || 100,
            currentFile: progress.currentFile || '',
            status: progress.stage === 'complete' ? 'completed' :
                    progress.stage === 'cancelled' ? 'error' :
                    (progress.stage === 'scanning' ? 'scanning' : 'importing'),
            importedCount: progress.imported || 0,
            errorCount: progress.failed || 0
          }
        })
      }

      // 备用：如果上面的监听器不可用，使用轮询
      if (!progressCleanup) {
        pollProgress()
      }

      const result = await (window as any).photoAPI.local.importFolder(folderPath)

      if (result.success) {
        // 导入成功后刷新照片列表
        await fetchPhotos({ limit: 100 })
        importProgress.value = {
          ...importProgress.value!,
          status: 'completed',
          total: result.imported + result.errors,
          current: result.imported + result.errors
        }
        return true
      } else {
        importProgress.value = {
          ...importProgress.value!,
          status: 'error'
        }
        return false
      }
    } catch (error) {
      console.error('导入照片失败:', error)
      importProgress.value = {
        ...importProgress.value!,
        status: 'error'
      }
      return false
    } finally {
      isImporting.value = false
      // 清理监听器
      if (progressCleanup) {
        progressCleanup()
        progressCleanup = null
      }
    }
  }

  // 轮询进度
  async function pollProgress() {
    const poll = async () => {
      if (!isImporting.value) return

      try {
        // 可以添加获取进度的 API
        await new Promise(resolve => setTimeout(resolve, 500))
        poll()
      } catch {
        // 停止轮询
      }
    }
    poll()
  }

  // 获取本地照片数量
  async function getLocalPhotoCount(): Promise<number> {
    try {
      return await (window as any).photoAPI.local.getCount()
    } catch {
      return 0
    }
  }

  // 重置
  function reset() {
    photos.value = []
    totalCount.value = 0
    hasMore.value = true
    importProgress.value = null
    isImporting.value = false
    // 清理监听器
    if (progressCleanup) {
      progressCleanup()
      progressCleanup = null
    }
  }

  return {
    photos,
    loading,
    totalCount,
    hasMore,
    importProgress,
    isImporting,
    fetchPhotos,
    fetchPhotoDetail,
    searchPhotos,
    syncPhotos,
    selectAndImportFolder,
    importFromFolder,
    getLocalPhotoCount,
    reset,
  }
})
