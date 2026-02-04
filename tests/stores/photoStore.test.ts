/**
 * PhotoMind - Photo Store Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePhotoStore } from '../../src/renderer/stores/photoStore'

// Mock window.photoAPI
const mockPhotoAPI = {
  photos: {
    getList: vi.fn(),
    getDetail: vi.fn(),
    search: vi.fn()
  },
  sync: {
    start: vi.fn()
  },
  local: {
    selectFolder: vi.fn(),
    importFolder: vi.fn(),
    getCount: vi.fn(),
    onProgress: null
  }
}

global.window = {
  photoAPI: mockPhotoAPI
} as any

describe('PhotoStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('State', () => {
    it('should initialize with default values', () => {
      const store = usePhotoStore()

      expect(store.photos).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.totalCount).toBe(0)
      expect(store.hasMore).toBe(true)
      expect(store.importProgress).toBe(null)
      expect(store.isImporting).toBe(false)
    })
  })

  describe('fetchPhotos', () => {
    it('should fetch photos successfully', async () => {
      const mockPhotos = [
        { id: '1', name: 'photo1.jpg' },
        { id: '2', name: 'photo2.jpg' }
      ]
      mockPhotoAPI.photos.getList.mockResolvedValue(mockPhotos)

      const store = usePhotoStore()
      await store.fetchPhotos({ limit: 10, offset: 0 })

      expect(store.photos).toEqual(mockPhotos)
      expect(store.loading).toBe(false)
      expect(mockPhotoAPI.photos.getList).toHaveBeenCalledWith({ limit: 10, offset: 0 })
    })

    it('should append photos when offset > 0', async () => {
      const initialPhotos = [{ id: '1', name: 'photo1.jpg' }]
      const newPhotos = [{ id: '2', name: 'photo2.jpg' }]
      mockPhotoAPI.photos.getList
        .mockResolvedValueOnce(initialPhotos)
        .mockResolvedValueOnce(newPhotos)

      const store = usePhotoStore()
      await store.fetchPhotos({ limit: 10, offset: 0 })
      await store.fetchPhotos({ limit: 10, offset: 10 })

      expect(store.photos).toHaveLength(2)
      expect(store.photos[0].id).toBe('1')
      expect(store.photos[1].id).toBe('2')
    })

    it('should handle errors gracefully', async () => {
      mockPhotoAPI.photos.getList.mockRejectedValue(new Error('API Error'))

      const store = usePhotoStore()
      await store.fetchPhotos({ limit: 10 })

      expect(store.photos).toEqual([])
      expect(store.loading).toBe(false)
    })

    it('should update hasMore based on results length', async () => {
      mockPhotoAPI.photos.getList.mockResolvedValue([{ id: '1' }, { id: '2' }])

      const store = usePhotoStore()
      await store.fetchPhotos({ limit: 10 })

      expect(store.hasMore).toBe(false)
    })
  })

  describe('fetchPhotoDetail', () => {
    it('should fetch photo detail successfully', async () => {
      const mockDetail = { id: '1', name: 'photo1.jpg', metadata: { width: 1920, height: 1080 } }
      mockPhotoAPI.photos.getDetail.mockResolvedValue(mockDetail)

      const store = usePhotoStore()
      const result = await store.fetchPhotoDetail('1')

      expect(result).toEqual(mockDetail)
      expect(mockPhotoAPI.photos.getDetail).toHaveBeenCalledWith('1')
    })

    it('should return null on error', async () => {
      mockPhotoAPI.photos.getDetail.mockRejectedValue(new Error('Not found'))

      const store = usePhotoStore()
      const result = await store.fetchPhotoDetail('999')

      expect(result).toBeNull()
    })
  })

  describe('searchPhotos', () => {
    it('should search photos successfully', async () => {
      const mockResults = { results: [{ id: '1', name: 'vacation.jpg' }], total: 1 }
      mockPhotoAPI.photos.search.mockResolvedValue(mockResults)

      const store = usePhotoStore()
      const result = await store.searchPhotos('vacation')

      expect(result).toEqual(mockResults)
      expect(store.loading).toBe(false)
    })

    it('should handle search errors gracefully', async () => {
      mockPhotoAPI.photos.search.mockRejectedValue(new Error('Search failed'))

      const store = usePhotoStore()
      const result = await store.searchPhotos('test')

      expect(result).toEqual({ results: [], total: 0 })
    })
  })

  describe('syncPhotos', () => {
    it('should sync photos and refresh list', async () => {
      mockPhotoAPI.sync.start.mockResolvedValue(10)
      mockPhotoAPI.photos.getList.mockResolvedValue([{ id: '1' }])

      const store = usePhotoStore()
      const count = await store.syncPhotos()

      expect(count).toBe(10)
      expect(store.loading).toBe(false)
    })

    it('should handle sync errors', async () => {
      mockPhotoAPI.sync.start.mockRejectedValue(new Error('Sync failed'))

      const store = usePhotoStore()
      const count = await store.syncPhotos()

      expect(count).toBe(0)
    })
  })

  describe('selectAndImportFolder', () => {
    it('should return false when no folder selected', async () => {
      mockPhotoAPI.local.selectFolder.mockResolvedValue([])

      const store = usePhotoStore()
      const result = await store.selectAndImportFolder()

      expect(result).toBe(false)
    })

    it('should import folder successfully', async () => {
      mockPhotoAPI.local.selectFolder.mockResolvedValue(['/path/to/folder'])
      mockPhotoAPI.local.importFolder.mockResolvedValue({ success: true, imported: 5, errors: 0 })
      mockPhotoAPI.photos.getList.mockResolvedValue([])

      const store = usePhotoStore()
      const result = await store.selectAndImportFolder()

      expect(result).toBe(true)
      expect(store.isImporting).toBe(false)
    })
  })

  describe('importFromFolder', () => {
    it('should import folder successfully', async () => {
      mockPhotoAPI.local.importFolder.mockResolvedValue({ success: true, imported: 3, errors: 0 })
      mockPhotoAPI.photos.getList.mockResolvedValue([])
      // Mock onProgress to return false (no progress listener)
      mockPhotoAPI.local.onProgress = false

      const store = usePhotoStore()
      await store.importFromFolder('/test/path')

      expect(store.importProgress?.status).toBe('completed')
    })

    it('should handle import failure', async () => {
      mockPhotoAPI.local.importFolder.mockResolvedValue({ success: false })
      mockPhotoAPI.local.onProgress = false

      const store = usePhotoStore()
      const result = await store.importFromFolder('/test/path')

      expect(result).toBe(false)
      expect(store.importProgress?.status).toBe('error')
    })
  })

  describe('getLocalPhotoCount', () => {
    it('should return local photo count', async () => {
      mockPhotoAPI.local.getCount.mockResolvedValue(42)

      const store = usePhotoStore()
      const count = await store.getLocalPhotoCount()

      expect(count).toBe(42)
    })

    it('should return 0 on error', async () => {
      mockPhotoAPI.local.getCount.mockRejectedValue(new Error('Failed'))

      const store = usePhotoStore()
      const count = await store.getLocalPhotoCount()

      expect(count).toBe(0)
    })
  })

  describe('reset', () => {
    it('should reset all state to default values', async () => {
      const mockPhotos = [{ id: '1' }]
      mockPhotoAPI.photos.getList.mockResolvedValue(mockPhotos)

      const store = usePhotoStore()
      await store.fetchPhotos({ limit: 10 })
      store.reset()

      expect(store.photos).toEqual([])
      expect(store.totalCount).toBe(0)
      expect(store.hasMore).toBe(true)
      expect(store.importProgress).toBe(null)
      expect(store.isImporting).toBe(false)
    })
  })
})
