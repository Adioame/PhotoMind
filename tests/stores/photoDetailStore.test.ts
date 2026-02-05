/**
 * PhotoMind - PhotoDetailStore Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePhotoDetailStore, type PhotoDetail } from '../../src/renderer/stores/photoDetailStore'

// Mock window.photoAPI
vi.mocked(window).photoAPI = {
  photos: {
    delete: vi.fn(),
    export: vi.fn()
  }
} as any

describe('PhotoDetailStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  describe('Initial State', () => {
    it('should have correct default values', () => {
      const store = usePhotoDetailStore()

      expect(store.photo).toBeNull()
      expect(store.loading).toBe(false)
      expect(store.similarPhotos).toEqual([])
      expect(store.currentIndex).toBe(0)
    })
  })

  describe('Getters', () => {
    it('hasPhoto should return true when photo is loaded', () => {
      const store = usePhotoDetailStore()
      store.photo = { id: 1, uuid: 'test', fileName: 'test.jpg', filePath: '/test/test.jpg' } as PhotoDetail

      expect(store.hasPhoto).toBe(true)
    })

    it('hasPhoto should return false when photo is null', () => {
      const store = usePhotoDetailStore()

      expect(store.hasPhoto).toBe(false)
    })

    it('isFirst should return true when currentIndex is 0', () => {
      const store = usePhotoDetailStore()
      store.currentIndex = 0

      expect(store.isFirst).toBe(true)
    })

    it('isLast should return true when similarPhotos is empty', () => {
      const store = usePhotoDetailStore()
      store.similarPhotos = []
      store.currentIndex = 0

      expect(store.isLast).toBe(true)
    })

    it('isLast should return true when at end of photos', () => {
      const store = usePhotoDetailStore()
      store.similarPhotos = [{ id: 1 }, { id: 2 }, { id: 3 }] as PhotoDetail[]
      store.currentIndex = 3

      expect(store.isLast).toBe(true)
    })
  })

  describe('reset', () => {
    it('should reset all state to default values', () => {
      const store = usePhotoDetailStore()
      store.photo = { id: 1 } as PhotoDetail
      store.similarPhotos = [{ id: 1 }] as PhotoDetail[]
      store.currentIndex = 5

      store.reset()

      expect(store.photo).toBeNull()
      expect(store.similarPhotos).toEqual([])
      expect(store.currentIndex).toBe(0)
    })
  })

  describe('deletePhoto', () => {
    it('should have deletePhoto action', () => {
      const store = usePhotoDetailStore()
      expect(typeof store.deletePhoto).toBe('function')
    })

    it('should reset state after successful deletion', async () => {
      const store = usePhotoDetailStore()
      // Set up a photo
      store.photo = { id: 1, uuid: 'test-uuid', fileName: 'test.jpg', filePath: '/test/test.jpg' } as PhotoDetail
      store.similarPhotos = [{ id: 2 }] as PhotoDetail[]
      store.currentIndex = 1

      // Mock the IPC call
      vi.spyOn(window.photoAPI.photos, 'delete').mockResolvedValue({ success: true })

      await store.deletePhoto(1)

      expect(store.photo).toBeNull()
      expect(store.similarPhotos).toEqual([])
      expect(store.currentIndex).toBe(0)
    })

    it('should handle deletion error', async () => {
      const store = usePhotoDetailStore()
      store.photo = { id: 1, uuid: 'test-uuid', fileName: 'test.jpg', filePath: '/test/test.jpg' } as PhotoDetail

      // Mock IPC error - useResolvedValue to return error object like the real implementation
      vi.spyOn(window.photoAPI.photos, 'delete').mockResolvedValue({ success: false, error: 'Delete failed' })

      const result = await store.deletePhoto(1)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Delete failed')
      expect(store.photo).not.toBeNull() // Photo should not be cleared on error
    })
  })

  describe('exportPhoto', () => {
    it('should have exportPhoto action', () => {
      const store = usePhotoDetailStore()
      expect(typeof store.exportPhoto).toBe('function')
    })

    it('should return success on successful export', async () => {
      const store = usePhotoDetailStore()
      store.photo = { id: 1, uuid: 'test-uuid', fileName: 'test.jpg', filePath: '/test/test.jpg' } as PhotoDetail

      // Mock successful export
      vi.spyOn(window.photoAPI.photos, 'export').mockResolvedValue({
        success: true,
        exportPath: '/exported/test.jpg'
      })

      const result = await store.exportPhoto('/export/path')

      expect(result.success).toBe(true)
      expect(result.exportPath).toBe('/exported/test.jpg')
    })

    it('should handle export error', async () => {
      const store = usePhotoDetailStore()
      store.photo = { id: 1, uuid: 'test-uuid', fileName: 'test.jpg', filePath: '/test/test.jpg' } as PhotoDetail

      // Mock export error
      vi.spyOn(window.photoAPI.photos, 'export').mockResolvedValue({
        success: false,
        error: 'File not found'
      })

      const result = await store.exportPhoto('/invalid/path')

      expect(result.success).toBe(false)
      expect(result.error).toBe('File not found')
    })
  })
})
