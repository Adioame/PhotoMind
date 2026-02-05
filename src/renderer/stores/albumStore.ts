/**
 * PhotoMind - Album Store
 *
 * Manages album state including:
 * - Smart albums (auto-generated)
 * - Manual albums (user-created)
 * - Album CRUD operations
 * - Album sharing and export
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Album {
  id: number | string
  uuid?: string
  name: string
  description?: string
  coverPhotoId?: number
  coverPhotoPath?: string
  type: 'smart' | 'manual' | 'place' | 'person' | 'year'
  query?: string  // Smart album search criteria
  photoCount: number
  year?: number   // For year albums
  createdAt?: string
  updatedAt?: string
}

export interface AlbumPhoto {
  id: number
  uuid: string
  fileName: string
  thumbnailPath?: string
  takenAt?: string
}

export interface ShareOptions {
  quality: 'original' | 'compressed'
  sortBy: 'date' | 'name'
  includeExif: boolean
  watermark: boolean
}

export interface ExportResult {
  success: boolean
  exportPath?: string
  error?: string
}

export interface ExportProgress {
  current: number
  total: number
  percentage: number
  status: 'idle' | 'preparing' | 'exporting' | 'completed' | 'error'
  message: string
}

export const useAlbumStore = defineStore('album', () => {
  // State
  const albums = ref<Album[]>([])
  const currentAlbum = ref<Album | null>(null)
  const loading = ref(false)
  const albumPhotos = ref<AlbumPhoto[]>([])
  const showCreateDialog = ref(false)
  const createDialogType = ref<'smart' | 'manual'>('smart')

  // Share state
  const showShareDialog = ref(false)
  const sharingAlbum = ref<Album | null>(null)
  const exportProgress = ref<ExportProgress>({
    current: 0,
    total: 0,
    percentage: 0,
    status: 'idle',
    message: ''
  })

  // Getters
  const smartAlbums = computed(() =>
    albums.value.filter(a => a.type === 'smart')
  )

  const manualAlbums = computed(() =>
    albums.value.filter(a => a.type === 'manual')
  )

  const placeAlbums = computed(() =>
    albums.value.filter(a => a.type === 'place')
  )

  const peopleAlbums = computed(() =>
    albums.value.filter(a => a.type === 'person')
  )

  const yearAlbums = computed(() =>
    albums.value.filter(a => a.type === 'year')
  )

  const allAlbums = computed(() => albums.value)

  const isExporting = computed(() =>
    exportProgress.value.status === 'exporting' ||
    exportProgress.value.status === 'preparing'
  )

  // Actions
  async function loadAlbums(): Promise<void> {
    loading.value = true
    try {
      const response = await (window as any).photoAPI?.albums?.getAll?.()
      albums.value = response || []
    } catch (error) {
      console.error('Failed to load albums:', error)
      albums.value = []
    } finally {
      loading.value = false
    }
  }

  async function loadAlbumPhotos(albumId: string | number): Promise<AlbumPhoto[]> {
    loading.value = true
    try {
      const response = await (window as any).photoAPI?.albums?.getPhotos?.(albumId)
      albumPhotos.value = response || []
      return albumPhotos.value
    } catch (error) {
      console.error('Failed to load album photos:', error)
      albumPhotos.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  async function createSmartAlbum(name: string, query: string): Promise<Album | null> {
    loading.value = true
    try {
      const response = await (window as any).photoAPI?.albums?.createSmart?.(name, query)
      if (response) {
        albums.value.push(response)
        return response
      }
      return null
    } catch (error) {
      console.error('Failed to create smart album:', error)
      return null
    } finally {
      loading.value = false
    }
  }

  async function createManualAlbum(name: string, description?: string): Promise<Album | null> {
    loading.value = true
    try {
      const response = await (window as any).photoAPI?.albums?.createManual?.(name, description)
      if (response) {
        albums.value.push(response)
        return response
      }
      return null
    } catch (error) {
      console.error('Failed to create manual album:', error)
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteAlbum(albumId: number | string): Promise<boolean> {
    loading.value = true
    try {
      await (window as any).photoAPI?.albums?.delete?.(albumId)
      albums.value = albums.value.filter(a => a.id !== albumId)
      return true
    } catch (error) {
      console.error('Failed to delete album:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function updateAlbum(albumId: number | string, updates: Partial<Album>): Promise<Album | null> {
    loading.value = true
    try {
      const response = await (window as any).photoAPI?.albums?.update?.(albumId, updates)
      if (response) {
        const index = albums.value.findIndex(a => a.id === albumId)
        if (index >= 0) {
          albums.value[index] = response
        }
        return response
      }
      return null
    } catch (error) {
      console.error('Failed to update album:', error)
      return null
    } finally {
      loading.value = false
    }
  }

  async function setCoverPhoto(albumId: number | string, photoId: number): Promise<boolean> {
    return (await updateAlbum(albumId, { coverPhotoId: photoId })) !== null
  }

  async function addPhotosToAlbum(albumId: number | string, photoIds: number[]): Promise<boolean> {
    loading.value = true
    try {
      await (window as any).photoAPI?.albums?.addPhotos?.(albumId, photoIds)
      await loadAlbumPhotos(albumId)
      return true
    } catch (error) {
      console.error('Failed to add photos to album:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function removePhotoFromAlbum(albumId: number | string, photoId: number): Promise<boolean> {
    loading.value = true
    try {
      await (window as any).photoAPI?.albums?.removePhoto?.(albumId, photoId)
      await loadAlbumPhotos(albumId)
      return true
    } catch (error) {
      console.error('Failed to remove photo from album:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  // Share methods
  function openShareDialog(album: Album): void {
    sharingAlbum.value = album
    showShareDialog.value = true
    resetExportProgress()
  }

  function closeShareDialog(): void {
    showShareDialog.value = false
    sharingAlbum.value = null
    resetExportProgress()
  }

  function resetExportProgress(): void {
    exportProgress.value = {
      current: 0,
      total: 0,
      percentage: 0,
      status: 'idle',
      message: ''
    }
  }

  async function exportAlbumAsZip(options: ShareOptions): Promise<ExportResult> {
    if (!sharingAlbum.value) {
      return { success: false, error: '未选择相册' }
    }

    exportProgress.value = {
      current: 0,
      total: albumPhotos.value.length,
      percentage: 0,
      status: 'preparing',
      message: '准备导出...'
    }

    try {
      const result = await (window as any).photoAPI?.albums?.exportZip?.(
        sharingAlbum.value.id,
        options
      )

      if (result?.success) {
        exportProgress.value.status = 'completed'
        exportProgress.value.message = '导出完成'
        return { success: true, exportPath: result.exportPath }
      }

      exportProgress.value.status = 'error'
      return { success: false, error: result?.error || '导出失败' }
    } catch (error) {
      exportProgress.value.status = 'error'
      return { success: false, error: String(error) }
    }
  }

  async function exportAlbumAsHtml(options: ShareOptions): Promise<ExportResult> {
    if (!sharingAlbum.value) {
      return { success: false, error: '未选择相册' }
    }

    exportProgress.value = {
      current: 0,
      total: albumPhotos.value.length,
      percentage: 0,
      status: 'preparing',
      message: '准备导出...'
    }

    try {
      const result = await (window as any).photoAPI?.albums?.exportHtml?.(
        sharingAlbum.value.id,
        options
      )

      if (result?.success) {
        exportProgress.value.status = 'completed'
        exportProgress.value.message = '导出完成'
        return { success: true, exportPath: result.exportPath }
      }

      exportProgress.value.status = 'error'
      return { success: false, error: result?.error || '导出失败' }
    } catch (error) {
      exportProgress.value.status = 'error'
      return { success: false, error: String(error) }
    }
  }

  async function exportAlbumAsPdf(options: ShareOptions): Promise<ExportResult> {
    if (!sharingAlbum.value) {
      return { success: false, error: '未选择相册' }
    }

    exportProgress.value = {
      current: 0,
      total: albumPhotos.value.length,
      percentage: 0,
      status: 'preparing',
      message: '准备导出...'
    }

    try {
      const result = await (window as any).photoAPI?.albums?.exportPdf?.(
        sharingAlbum.value.id,
        options
      )

      if (result?.success) {
        exportProgress.value.status = 'completed'
        exportProgress.value.message = '导出完成'
        return { success: true, exportPath: result.exportPath }
      }

      exportProgress.value.status = 'error'
      return { success: false, error: result?.error || '导出失败' }
    } catch (error) {
      exportProgress.value.status = 'error'
      return { success: false, error: String(error) }
    }
  }

  async function copyPhotosToClipboard(): Promise<boolean> {
    if (!sharingAlbum.value) {
      return false
    }

    try {
      const result = await (window as any).photoAPI?.albums?.copyToClipboard?.(
        sharingAlbum.value.id
      )
      return result?.success === true
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      return false
    }
  }

  // Dialog management
  function openCreateDialog(type: 'smart' | 'manual'): void {
    createDialogType.value = type
    showCreateDialog.value = true
  }

  function closeCreateDialog(): void {
    showCreateDialog.value = false
  }

  function setCurrentAlbum(album: Album | null): void {
    currentAlbum.value = album
  }

  function reset(): void {
    albums.value = []
    currentAlbum.value = null
    albumPhotos.value = []
    showCreateDialog.value = false
    showShareDialog.value = false
    sharingAlbum.value = null
    resetExportProgress()
  }

  return {
    // State
    albums,
    currentAlbum,
    loading,
    albumPhotos,
    showCreateDialog,
    createDialogType,
    showShareDialog,
    sharingAlbum,
    exportProgress,
    // Getters
    smartAlbums,
    manualAlbums,
    placeAlbums,
    peopleAlbums,
    yearAlbums,
    allAlbums,
    isExporting,
    // Actions
    loadAlbums,
    loadAlbumPhotos,
    createSmartAlbum,
    createManualAlbum,
    deleteAlbum,
    updateAlbum,
    setCoverPhoto,
    addPhotosToAlbum,
    removePhotoFromAlbum,
    openShareDialog,
    closeShareDialog,
    resetExportProgress,
    exportAlbumAsZip,
    exportAlbumAsHtml,
    exportAlbumAsPdf,
    copyPhotosToClipboard,
    openCreateDialog,
    closeCreateDialog,
    setCurrentAlbum,
    reset
  }
})
