/**
 * PhotoMind - Photo Detail Store
 *
 * Manages photo detail view state including:
 * - Current photo details
 * - Similar/related photos
 * - Navigation between photos
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface PhotoDetail {
  id: number
  uuid: string
  fileName: string
  filePath: string
  thumbnailPath?: string
  takenAt?: string
  width?: number
  height?: number
  fileSize?: number
  location?: {
    name?: string
    latitude?: number
    longitude?: number
  }
  metadata?: {
    camera?: string
    lens?: string
    aperture?: string
    iso?: number
    shutterSpeed?: string
    focalLength?: string
  }
  persons?: Array<{
    id: number
    name: string
  }>
}

export const usePhotoDetailStore = defineStore('photoDetail', () => {
  // State
  const photo = ref<PhotoDetail | null>(null)
  const loading = ref(false)
  const similarPhotos = ref<PhotoDetail[]>([])
  const currentIndex = ref(0)

  // Getters
  const hasPhoto = computed(() => photo.value !== null)
  const isFirst = computed(() => currentIndex.value === 0)
  const isLast = computed(() => !similarPhotos.value.length || currentIndex.value >= similarPhotos.value.length - 1)
  const currentPhoto = computed(() => {
    if (similarPhotos.value.length > 0) {
      return similarPhotos.value[currentIndex.value] || photo.value
    }
    return photo.value
  })

  // 删除照片结果类型
  interface DeleteResult {
    success: boolean
    error?: string
  }

  // 导出照片结果类型
  interface ExportResult {
    success: boolean
    exportPath?: string
    error?: string
  }

  // Actions
  async function loadPhoto(id: string): Promise<void> {
    loading.value = true
    try {
      const response = await (window as any).photoAPI?.photos?.getDetail(id)
      photo.value = response || null
      if (photo.value) {
        await loadSimilarPhotos(id)
      }
    } catch (error) {
      console.error('Failed to load photo:', error)
      photo.value = null
    } finally {
      loading.value = false
    }
  }

  async function loadSimilarPhotos(_photoId: string): Promise<void> {
    // Placeholder for similarity search
    // Will be implemented when similarityService is ready
    similarPhotos.value = []
  }

  function navigateTo(direction: 'prev' | 'next'): void {
    if (direction === 'prev' && !isFirst.value) {
      currentIndex.value--
    } else if (direction === 'next' && !isLast.value) {
      currentIndex.value++
    }
  }

  function goToPhoto(index: number): void {
    if (index >= 0 && index < similarPhotos.value.length) {
      currentIndex.value = index
    }
  }

  function reset(): void {
    photo.value = null
    similarPhotos.value = []
    currentIndex.value = 0
  }

  async function deletePhoto(photoId: number): Promise<DeleteResult> {
    try {
      // 调用后端 API 删除照片
      const result = await (window as any).photoAPI?.photos?.delete(photoId)

      // 如果删除成功，清除当前照片状态
      if (result?.success) {
        reset()
        return { success: true }
      }

      return { success: false, error: result?.error || '删除失败' }
    } catch (error) {
      console.error('删除照片失败:', error)
      return { success: false, error: String(error) }
    }
  }

  async function exportPhoto(exportPath: string): Promise<ExportResult> {
    try {
      if (!photo.value) {
        return { success: false, error: '没有选中的照片' }
      }

      // 调用后端 API 导出照片
      const result = await (window as any).photoAPI?.photos?.export({
        photoId: photo.value.id,
        filePath: photo.value.filePath,
        exportPath
      })

      if (result?.success) {
        return { success: true, exportPath: result.exportPath }
      }

      return { success: false, error: result?.error || '导出失败' }
    } catch (error) {
      console.error('导出照片失败:', error)
      return { success: false, error: String(error) }
    }
  }

  return {
    // State
    photo,
    loading,
    similarPhotos,
    currentIndex,
    // Getters
    hasPhoto,
    isFirst,
    isLast,
    currentPhoto,
    // Actions
    loadPhoto,
    loadSimilarPhotos,
    navigateTo,
    goToPhoto,
    reset,
    deletePhoto,
    exportPhoto
  }
})
