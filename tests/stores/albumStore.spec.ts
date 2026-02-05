/**
 * PhotoMind - Album Store Unit Tests
 *
 * Tests for Epic E-02: 相册管理
 * Stories: E-02.1 (智能相册), E-02.2 (手动相册), E-02.3 (相册分享)
 *
 * Also covers E-06.3-2: 相册分享
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAlbumStore } from '@/stores/albumStore'

// Mock window.photoAPI
const photoAPIMock = {
  albums: {
    getAll: vi.fn().mockResolvedValue([]),
    getPhotos: vi.fn().mockResolvedValue([]),
    createSmart: vi.fn().mockResolvedValue(null),
    createManual: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(null),
    addPhotos: vi.fn().mockResolvedValue(true),
    removePhoto: vi.fn().mockResolvedValue(true),
    exportZip: vi.fn().mockResolvedValue({ success: false }),
    exportHtml: vi.fn().mockResolvedValue({ success: false }),
    exportPdf: vi.fn().mockResolvedValue({ success: false }),
    copyToClipboard: vi.fn().mockResolvedValue({ success: false })
  }
}
Object.defineProperty(global, 'window', {
  value: { photoAPI: photoAPIMock },
  writable: true
})

describe('AlbumStore - Epic E-02', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================
  // Story E-02.1: 智能相册
  // ============================================
  describe('E-02.1: 智能相册', () => {
    it('should have initial empty state', () => {
      const store = useAlbumStore()

      expect(store.albums).toEqual([])
      expect(store.currentAlbum).toBeNull()
      expect(store.loading).toBe(false)
      expect(store.albumPhotos).toEqual([])
    })

    it('should load all albums', async () => {
      const mockAlbums = [
        { id: 1, name: '智能相册1', type: 'smart', photoCount: 10 },
        { id: 2, name: '2024', type: 'year', photoCount: 5 }
      ]
      photoAPIMock.albums.getAll.mockResolvedValue(mockAlbums)

      const store = useAlbumStore()
      await store.loadAlbums()

      expect(photoAPIMock.albums.getAll).toHaveBeenCalled()
      expect(store.albums).toEqual(mockAlbums)
    })

    it('should create smart album', async () => {
      const mockAlbum = { id: 1, name: 'Sunset', type: 'smart', photoCount: 0, query: 'sunset' }
      photoAPIMock.albums.createSmart.mockResolvedValue(mockAlbum)

      const store = useAlbumStore()
      const result = await store.createSmartAlbum('Sunset', 'sunset')

      expect(result).toEqual(mockAlbum)
      expect(store.albums).toContainEqual(mockAlbum)
    })

    it('should return null when smart album creation fails', async () => {
      photoAPIMock.albums.createSmart.mockResolvedValue(null)

      const store = useAlbumStore()
      const result = await store.createSmartAlbum('Failed', 'test')

      expect(result).toBeNull()
    })

    it('should filter smart albums', async () => {
      const mockAlbums = [
        { id: 1, name: 'Smart1', type: 'smart' },
        { id: 2, name: 'Manual1', type: 'manual' },
        { id: 3, name: 'Smart2', type: 'smart' }
      ]
      photoAPIMock.albums.getAll.mockResolvedValue(mockAlbums)

      const store = useAlbumStore()
      await store.loadAlbums()

      expect(store.smartAlbums).toHaveLength(2)
      expect(store.smartAlbums[0].name).toBe('Smart1')
      expect(store.smartAlbums[1].name).toBe('Smart2')
    })

    it('should filter year albums', async () => {
      const mockAlbums = [
        { id: 1, name: '2024', type: 'year', year: 2024 },
        { id: 2, name: '2023', type: 'year', year: 2023 }
      ]
      photoAPIMock.albums.getAll.mockResolvedValue(mockAlbums)

      const store = useAlbumStore()
      await store.loadAlbums()

      expect(store.yearAlbums).toHaveLength(2)
    })
  })

  // ============================================
  // Story E-02.2: 手动相册
  // ============================================
  describe('E-02.2: 手动相册', () => {
    it('should create manual album', async () => {
      const mockAlbum = { id: 1, name: '家庭旅行', type: 'manual', photoCount: 0 }
      photoAPIMock.albums.createManual.mockResolvedValue(mockAlbum)

      const store = useAlbumStore()
      const result = await store.createManualAlbum('家庭旅行', '2024年家庭旅行照片')

      expect(result).toEqual(mockAlbum)
      expect(store.albums).toContainEqual(mockAlbum)
    })

    it('should filter manual albums', async () => {
      const mockAlbums = [
        { id: 1, name: 'Manual1', type: 'manual' },
        { id: 2, name: 'Smart1', type: 'smart' }
      ]
      photoAPIMock.albums.getAll.mockResolvedValue(mockAlbums)

      const store = useAlbumStore()
      await store.loadAlbums()

      expect(store.manualAlbums).toHaveLength(1)
      expect(store.manualAlbums[0].name).toBe('Manual1')
    })

    it('should delete album', async () => {
      const mockAlbums = [{ id: 1, name: 'ToDelete', type: 'manual' }]
      photoAPIMock.albums.getAll.mockResolvedValue(mockAlbums)
      photoAPIMock.albums.delete.mockResolvedValue(true)

      const store = useAlbumStore()
      await store.loadAlbums()
      const result = await store.deleteAlbum(1)

      expect(result).toBe(true)
      expect(store.albums).toHaveLength(0)
    })

    it('should update album', async () => {
      const mockAlbum = { id: 1, name: 'Original', type: 'manual', photoCount: 0 }
      const updatedAlbum = { id: 1, name: 'Updated', type: 'manual', photoCount: 5 }
      photoAPIMock.albums.getAll.mockResolvedValue([mockAlbum])
      photoAPIMock.albums.update.mockResolvedValue(updatedAlbum)

      const store = useAlbumStore()
      await store.loadAlbums()
      const result = await store.updateAlbum(1, { name: 'Updated' })

      expect(result).toEqual(updatedAlbum)
    })

    it('should load album photos', async () => {
      const mockPhotos = [
        { id: 1, uuid: 'photo-1', fileName: 'photo1.jpg' },
        { id: 2, uuid: 'photo-2', fileName: 'photo2.jpg' }
      ]
      photoAPIMock.albums.getPhotos.mockResolvedValue(mockPhotos)

      const store = useAlbumStore()
      const result = await store.loadAlbumPhotos(1)

      expect(photoAPIMock.albums.getPhotos).toHaveBeenCalledWith(1)
      expect(store.albumPhotos).toEqual(mockPhotos)
      expect(result).toEqual(mockPhotos)
    })

    it('should add photos to album', async () => {
      photoAPIMock.albums.addPhotos.mockResolvedValue(true)
      photoAPIMock.albums.getPhotos.mockResolvedValue([])

      const store = useAlbumStore()
      const result = await store.addPhotosToAlbum(1, [1, 2, 3])

      expect(result).toBe(true)
      expect(photoAPIMock.albums.addPhotos).toHaveBeenCalledWith(1, [1, 2, 3])
    })

    it('should remove photo from album', async () => {
      photoAPIMock.albums.removePhoto.mockResolvedValue(true)
      photoAPIMock.albums.getPhotos.mockResolvedValue([])

      const store = useAlbumStore()
      const result = await store.removePhotoFromAlbum(1, 5)

      expect(result).toBe(true)
      expect(photoAPIMock.albums.removePhoto).toHaveBeenCalledWith(1, 5)
    })

    it('should set cover photo', async () => {
      const updatedAlbum = { id: 1, name: 'Album', type: 'manual', coverPhotoId: 5 }
      photoAPIMock.albums.update.mockResolvedValue(updatedAlbum)

      const store = useAlbumStore()
      const result = await store.setCoverPhoto(1, 5)

      expect(result).toBe(true)
      expect(photoAPIMock.albums.update).toHaveBeenCalledWith(1, { coverPhotoId: 5 })
    })
  })

  // ============================================
  // Story E-02.3: 相册分享
  // ============================================
  describe('E-02.3: 相册分享', () => {
    it('should open share dialog', () => {
      const mockAlbum = { id: 1, name: 'ShareAlbum', type: 'manual' }
      const store = useAlbumStore()

      store.openShareDialog(mockAlbum)

      expect(store.showShareDialog).toBe(true)
      expect(store.sharingAlbum).toEqual(mockAlbum)
      expect(store.exportProgress.status).toBe('idle')
    })

    it('should close share dialog', () => {
      const store = useAlbumStore()
      store.showShareDialog = true
      store.sharingAlbum = { id: 1, name: 'Album', type: 'manual' }

      store.closeShareDialog()

      expect(store.showShareDialog).toBe(false)
      expect(store.sharingAlbum).toBeNull()
    })

    it('should export album as zip', async () => {
      const mockAlbum = { id: 1, name: 'ExportAlbum', type: 'manual' }
      photoAPIMock.albums.exportZip.mockResolvedValue({
        success: true,
        exportPath: '/path/to/export.zip'
      })

      const store = useAlbumStore()
      store.openShareDialog(mockAlbum)

      const result = await store.exportAlbumAsZip({
        quality: 'original',
        sortBy: 'date',
        includeExif: true,
        watermark: false
      })

      expect(result.success).toBe(true)
      expect(result.exportPath).toBe('/path/to/export.zip')
      expect(store.exportProgress.status).toBe('completed')
    })

    it('should handle zip export error', async () => {
      const mockAlbum = { id: 1, name: 'ExportAlbum', type: 'manual' }
      photoAPIMock.albums.exportZip.mockResolvedValue({ success: false, error: 'Export failed' })

      const store = useAlbumStore()
      store.openShareDialog(mockAlbum)

      const result = await store.exportAlbumAsZip({
        quality: 'compressed',
        sortBy: 'name',
        includeExif: false,
        watermark: true
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Export failed')
      expect(store.exportProgress.status).toBe('error')
    })

    it('should export album as html', async () => {
      const mockAlbum = { id: 1, name: 'HTMLAlbum', type: 'manual' }
      photoAPIMock.albums.exportHtml.mockResolvedValue({
        success: true,
        exportPath: '/path/to/album.html'
      })

      const store = useAlbumStore()
      store.openShareDialog(mockAlbum)

      const result = await store.exportAlbumAsHtml({
        quality: 'original',
        sortBy: 'date',
        includeExif: true,
        watermark: false
      })

      expect(result.success).toBe(true)
      expect(store.exportProgress.status).toBe('completed')
    })

    it('should export album as pdf', async () => {
      const mockAlbum = { id: 1, name: 'PDFAlbum', type: 'manual' }
      photoAPIMock.albums.exportPdf.mockResolvedValue({
        success: true,
        exportPath: '/path/to/album.pdf'
      })

      const store = useAlbumStore()
      store.openShareDialog(mockAlbum)

      const result = await store.exportAlbumAsPdf({
        quality: 'original',
        sortBy: 'date',
        includeExif: true,
        watermark: false
      })

      expect(result.success).toBe(true)
      expect(store.exportProgress.status).toBe('completed')
    })

    it('should return error when no album selected for export', async () => {
      const store = useAlbumStore()

      const result = await store.exportAlbumAsZip({
        quality: 'original',
        sortBy: 'date',
        includeExif: true,
        watermark: false
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('未选择相册')
    })

    it('should copy photos to clipboard', async () => {
      const mockAlbum = { id: 1, name: 'ClipboardAlbum', type: 'manual' }
      photoAPIMock.albums.copyToClipboard.mockResolvedValue({ success: true })

      const store = useAlbumStore()
      store.openShareDialog(mockAlbum)

      const result = await store.copyPhotosToClipboard()

      expect(result).toBe(true)
    })
  })

  // ============================================
  // Story E-06.3-2: 相册分享 - 验收条件验证
  // ============================================
  describe('E-06.3-2: 相册分享 - 验收条件验证', () => {
    // AC: 分享入口
    describe('AC: 分享入口', () => {
      it('should store album reference when opening share dialog', () => {
        const mockAlbum = { id: 1, name: 'Test Album', type: 'manual' }
        const store = useAlbumStore()

        store.openShareDialog(mockAlbum)

        expect(store.sharingAlbum).not.toBeNull()
        expect(store.sharingAlbum?.id).toBe(1)
        expect(store.sharingAlbum?.name).toBe('Test Album')
      })

      it('should reset export progress when opening share dialog', () => {
        const store = useAlbumStore()
        store.exportProgress = { current: 50, total: 100, percentage: 50, status: 'completed', message: '完成' }

        store.openShareDialog({ id: 1, name: 'Album', type: 'manual' })

        expect(store.exportProgress.status).toBe('idle')
        expect(store.exportProgress.current).toBe(0)
      })
    })

    // AC: 分享方式
    describe('AC: 分享方式 - ZIP导出', () => {
      it('should export album as ZIP with correct options', async () => {
        const mockAlbum = { id: 1, name: 'ZipAlbum', type: 'manual' }
        photoAPIMock.albums.exportZip.mockResolvedValue({
          success: true,
          exportPath: '/downloads/album.zip'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        const result = await store.exportAlbumAsZip({
          quality: 'original',
          sortBy: 'date',
          includeExif: true,
          watermark: false
        })

        expect(result.success).toBe(true)
        expect(result.exportPath).toBe('/downloads/album.zip')
        expect(photoAPIMock.albums.exportZip).toHaveBeenCalled()
      })

      it('should handle ZIP export with compressed quality', async () => {
        const mockAlbum = { id: 1, name: 'ZipAlbum', type: 'manual' }
        photoAPIMock.albums.exportZip.mockResolvedValue({
          success: true,
          exportPath: '/downloads/compressed.zip'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        await store.exportAlbumAsZip({
          quality: 'compressed',
          sortBy: 'name',
          includeExif: false,
          watermark: true
        })

        expect(photoAPIMock.albums.exportZip).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ quality: 'compressed' })
        )
      })
    })

    describe('AC: 分享方式 - HTML导出', () => {
      it('should export album as HTML', async () => {
        const mockAlbum = { id: 2, name: 'HTMLAlbum', type: 'manual' }
        photoAPIMock.albums.exportHtml.mockResolvedValue({
          success: true,
          exportPath: '/downloads/album.html'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        const result = await store.exportAlbumAsHtml({
          quality: 'original',
          sortBy: 'date',
          includeExif: true,
          watermark: false
        })

        expect(result.success).toBe(true)
        expect(result.exportPath).toBe('/downloads/album.html')
      })
    })

    describe('AC: 分享方式 - PDF导出', () => {
      it('should export album as PDF', async () => {
        const mockAlbum = { id: 3, name: 'PDFAlbum', type: 'manual' }
        photoAPIMock.albums.exportPdf.mockResolvedValue({
          success: true,
          exportPath: '/downloads/album.pdf'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        const result = await store.exportAlbumAsPdf({
          quality: 'original',
          sortBy: 'date',
          includeExif: true,
          watermark: false
        })

        expect(result.success).toBe(true)
        expect(result.exportPath).toBe('/downloads/album.pdf')
      })
    })

    describe('AC: 分享方式 - 剪贴板', () => {
      it('should copy photos to clipboard', async () => {
        const mockAlbum = { id: 4, name: 'ClipboardAlbum', type: 'manual' }
        photoAPIMock.albums.copyToClipboard.mockResolvedValue({ success: true })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        const result = await store.copyPhotosToClipboard()

        expect(result).toBe(true)
        expect(photoAPIMock.albums.copyToClipboard).toHaveBeenCalledWith(4)
      })

      it('should handle clipboard copy failure', async () => {
        const mockAlbum = { id: 4, name: 'ClipboardAlbum', type: 'manual' }
        photoAPIMock.albums.copyToClipboard.mockResolvedValue({
          success: false,
          error: '剪贴板访问失败'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        const result = await store.copyPhotosToClipboard()

        expect(result).toBe(false)
      })
    })

    // AC: 导出选项
    describe('AC: 导出选项', () => {
      it('should pass all export options to API', async () => {
        const mockAlbum = { id: 1, name: 'OptionsAlbum', type: 'manual' }
        photoAPIMock.albums.exportZip.mockResolvedValue({
          success: true,
          exportPath: '/path/to/export.zip'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        await store.exportAlbumAsZip({
          quality: 'compressed',
          sortBy: 'name',
          includeExif: true,
          watermark: true
        })

        expect(photoAPIMock.albums.exportZip).toHaveBeenCalledWith(1, {
          quality: 'compressed',
          sortBy: 'name',
          includeExif: true,
          watermark: true
        })
      })

      it('should update progress during export', async () => {
        const mockAlbum = { id: 1, name: 'ProgressAlbum', type: 'manual' }
        photoAPIMock.albums.exportZip.mockResolvedValue({
          success: true,
          exportPath: '/path/to/export.zip'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)
        store.exportProgress = { current: 0, total: 100, percentage: 0, status: 'exporting', message: '导出中' }

        await store.exportAlbumAsZip({
          quality: 'original',
          sortBy: 'date',
          includeExif: false,
          watermark: false
        })

        expect(store.exportProgress.status).toBe('completed')
      })
    })

    // AC: 导出结果
    describe('AC: 导出结果', () => {
      it('should show error when export fails', async () => {
        const mockAlbum = { id: 1, name: 'FailAlbum', type: 'manual' }
        photoAPIMock.albums.exportZip.mockResolvedValue({
          success: false,
          error: '文件写入失败'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        const result = await store.exportAlbumAsZip({
          quality: 'original',
          sortBy: 'date',
          includeExif: false,
          watermark: false
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('文件写入失败')
        expect(store.exportProgress.status).toBe('error')
      })

      it('should handle export exception', async () => {
        const mockAlbum = { id: 1, name: 'ExceptionAlbum', type: 'manual' }
        photoAPIMock.albums.exportZip.mockRejectedValue(new Error('Unknown error'))

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        const result = await store.exportAlbumAsZip({
          quality: 'original',
          sortBy: 'date',
          includeExif: false,
          watermark: false
        })

        expect(result.success).toBe(false)
        expect(store.exportProgress.status).toBe('error')
      })
    })

    // AC: 分享设置
    describe('AC: 分享设置', () => {
      it('should support EXIF inclusion option', async () => {
        const mockAlbum = { id: 1, name: 'EXIFAlbum', type: 'manual' }
        photoAPIMock.albums.exportZip.mockResolvedValue({
          success: true,
          exportPath: '/path/to/export.zip'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        await store.exportAlbumAsZip({
          quality: 'original',
          sortBy: 'date',
          includeExif: true,
          watermark: false
        })

        expect(photoAPIMock.albums.exportZip).toHaveBeenCalledWith(1,
          expect.objectContaining({ includeExif: true })
        )
      })

      it('should support watermark option', async () => {
        const mockAlbum = { id: 1, name: 'WatermarkAlbum', type: 'manual' }
        photoAPIMock.albums.exportZip.mockResolvedValue({
          success: true,
          exportPath: '/path/to/export.zip'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        await store.exportAlbumAsZip({
          quality: 'original',
          sortBy: 'date',
          includeExif: false,
          watermark: true
        })

        expect(photoAPIMock.albums.exportZip).toHaveBeenCalledWith(1,
          expect.objectContaining({ watermark: true })
        )
      })

      it('should support quality selection', async () => {
        const mockAlbum = { id: 1, name: 'QualityAlbum', type: 'manual' }
        photoAPIMock.albums.exportZip.mockResolvedValue({
          success: true,
          exportPath: '/path/to/export.zip'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        await store.exportAlbumAsZip({
          quality: 'compressed',
          sortBy: 'date',
          includeExif: false,
          watermark: false
        })

        expect(photoAPIMock.albums.exportZip).toHaveBeenCalledWith(1,
          expect.objectContaining({ quality: 'compressed' })
        )
      })

      it('should support sort selection', async () => {
        const mockAlbum = { id: 1, name: 'SortAlbum', type: 'manual' }
        photoAPIMock.albums.exportZip.mockResolvedValue({
          success: true,
          exportPath: '/path/to/export.zip'
        })

        const store = useAlbumStore()
        store.openShareDialog(mockAlbum)

        await store.exportAlbumAsZip({
          quality: 'original',
          sortBy: 'name',
          includeExif: false,
          watermark: false
        })

        expect(photoAPIMock.albums.exportZip).toHaveBeenCalledWith(1,
          expect.objectContaining({ sortBy: 'name' })
        )
      })
    })

    // NFR 验证
    describe('NFR: 非功能性需求', () => {
      it('should prevent export when no album selected', async () => {
        const store = useAlbumStore()

        const result = await store.exportAlbumAsZip({
          quality: 'original',
          sortBy: 'date',
          includeExif: false,
          watermark: false
        })

        expect(result.success).toBe(false)
        expect(result.error).toBe('未选择相册')
      })

      it('should correctly check isExporting state', () => {
        const store = useAlbumStore()

        expect(store.isExporting).toBe(false)

        store.exportProgress.status = 'preparing'
        expect(store.isExporting).toBe(true)

        store.exportProgress.status = 'exporting'
        expect(store.isExporting).toBe(true)

        store.exportProgress.status = 'completed'
        expect(store.isExporting).toBe(false)

        store.exportProgress.status = 'error'
        expect(store.isExporting).toBe(false)
      })
    })
  })

  // ============================================
  // Dialog Management Tests
  // ============================================
  describe('Dialog Management', () => {
    it('should open create dialog for smart album', () => {
      const store = useAlbumStore()

      store.openCreateDialog('smart')

      expect(store.showCreateDialog).toBe(true)
      expect(store.createDialogType).toBe('smart')
    })

    it('should open create dialog for manual album', () => {
      const store = useAlbumStore()

      store.openCreateDialog('manual')

      expect(store.showCreateDialog).toBe(true)
      expect(store.createDialogType).toBe('manual')
    })

    it('should close create dialog', () => {
      const store = useAlbumStore()
      store.showCreateDialog = true

      store.closeCreateDialog()

      expect(store.showCreateDialog).toBe(false)
    })

    it('should set current album', () => {
      const mockAlbum = { id: 1, name: 'Current', type: 'smart' }
      const store = useAlbumStore()

      store.setCurrentAlbum(mockAlbum)

      expect(store.currentAlbum).toEqual(mockAlbum)
    })

    it('should reset export progress', () => {
      const store = useAlbumStore()
      store.exportProgress = {
        current: 50,
        total: 100,
        percentage: 50,
        status: 'exporting',
        message: '导出中'
      }

      store.resetExportProgress()

      expect(store.exportProgress.status).toBe('idle')
      expect(store.exportProgress.percentage).toBe(0)
    })
  })

  // ============================================
  // Computed Properties Tests
  // ============================================
  describe('Computed Properties', () => {
    it('should filter place albums', async () => {
      const mockAlbums = [
        { id: 1, name: 'Place1', type: 'place' },
        { id: 2, name: 'Person1', type: 'person' }
      ]
      photoAPIMock.albums.getAll.mockResolvedValue(mockAlbums)

      const store = useAlbumStore()
      await store.loadAlbums()

      expect(store.placeAlbums).toHaveLength(1)
      expect(store.placeAlbums[0].name).toBe('Place1')
    })

    it('should filter people albums', async () => {
      const mockAlbums = [
        { id: 1, name: 'People1', type: 'person' },
        { id: 2, name: 'Place1', type: 'place' }
      ]
      photoAPIMock.albums.getAll.mockResolvedValue(mockAlbums)

      const store = useAlbumStore()
      await store.loadAlbums()

      expect(store.peopleAlbums).toHaveLength(1)
      expect(store.peopleAlbums[0].name).toBe('People1')
    })

    it('should check if exporting', async () => {
      const store = useAlbumStore()

      expect(store.isExporting).toBe(false)

      store.exportProgress.status = 'preparing'
      expect(store.isExporting).toBe(true)

      store.exportProgress.status = 'exporting'
      expect(store.isExporting).toBe(true)

      store.exportProgress.status = 'completed'
      expect(store.isExporting).toBe(false)
    })
  })

  // ============================================
  // Reset Store Tests
  // ============================================
  describe('Reset Store', () => {
    it('should reset to initial state', async () => {
      const mockAlbums = [{ id: 1, name: 'Album', type: 'smart' }]
      photoAPIMock.albums.getAll.mockResolvedValue(mockAlbums)

      const store = useAlbumStore()
      await store.loadAlbums()

      store.albums = [{ id: 1 }]
      store.currentAlbum = { id: 1, name: 'Test', type: 'manual' }
      store.albumPhotos = [{ id: 1 }]
      store.showCreateDialog = true
      store.showShareDialog = true
      store.sharingAlbum = { id: 1, name: 'Test', type: 'manual' }

      store.reset()

      expect(store.albums).toEqual([])
      expect(store.currentAlbum).toBeNull()
      expect(store.albumPhotos).toEqual([])
      expect(store.showCreateDialog).toBe(false)
      expect(store.showShareDialog).toBe(false)
      expect(store.sharingAlbum).toBeNull()
      expect(store.exportProgress.status).toBe('idle')
    })
  })
})
