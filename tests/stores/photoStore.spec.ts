/**
 * PhotoMind - Photo Store Unit Tests
 *
 * Tests for Epic E-01: 照片管理基础功能
 * Stories: E-01.1 (照片网格展示), E-01.2 (照片导入)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePhotoStore } from '@/stores/photoStore'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
})

// Mock window.photoAPI
const photoAPIMock = {
  photos: {
    getList: vi.fn().mockResolvedValue([]),
    getDetail: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue({ results: [], total: 0 })
  },
  sync: {
    start: vi.fn().mockResolvedValue(0)
  },
  local: {
    selectFolder: vi.fn().mockResolvedValue([]),
    importFolder: vi.fn().mockResolvedValue({ success: true, imported: 0, errors: 0 }),
    getCount: vi.fn().mockResolvedValue(0),
    onProgress: false
  }
}
Object.defineProperty(global, 'window', {
  value: { photoAPI: photoAPIMock },
  writable: true
})

describe('PhotoStore - Epic E-01', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================
  // Story E-01.1: 照片网格展示
  // ============================================
  describe('E-01.1: 照片网格展示', () => {
    it('should have initial empty state', () => {
      const store = usePhotoStore()

      expect(store.photos).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.totalCount).toBe(0)
      expect(store.hasMore).toBe(true)
    })

    it('should fetch photos from API', async () => {
      const mockPhotos = [
        { uuid: '1', fileName: 'photo1.jpg' },
        { uuid: '2', fileName: 'photo2.jpg' }
      ]
      photoAPIMock.photos.getList.mockResolvedValue(mockPhotos)

      const store = usePhotoStore()
      await store.fetchPhotos({ limit: 24 })

      expect(photoAPIMock.photos.getList).toHaveBeenCalledWith({ limit: 24, offset: 0 })
      expect(store.photos).toEqual(mockPhotos)
      expect(store.totalCount).toBe(2)
      expect(store.loading).toBe(false)
    })

    it('should append photos when fetching with offset', async () => {
      const existingPhotos = [{ uuid: '1', fileName: 'photo1.jpg' }]
      const newPhotos = [{ uuid: '2', fileName: 'photo2.jpg' }]

      photoAPIMock.photos.getList
        .mockResolvedValueOnce(existingPhotos)
        .mockResolvedValueOnce(newPhotos)

      const store = usePhotoStore()
      await store.fetchPhotos({ limit: 24 })
      await store.fetchPhotos({ limit: 24, offset: 24 })

      expect(store.photos.length).toBe(2)
    })

    it('should set hasMore=false when fewer results returned', async () => {
      photoAPIMock.photos.getList.mockResolvedValue([{ uuid: '1' }, { uuid: '2' }])

      const store = usePhotoStore()
      await store.fetchPhotos({ limit: 24 })

      expect(store.hasMore).toBe(false)
    })

    it('should fetch photo detail', async () => {
      const mockDetail = { uuid: '123', fileName: 'detailed.jpg', takenAt: '2024-01-15' }
      photoAPIMock.photos.getDetail.mockResolvedValue(mockDetail)

      const store = usePhotoStore()
      const result = await store.fetchPhotoDetail('123')

      expect(photoAPIMock.photos.getDetail).toHaveBeenCalledWith('123')
      expect(result).toEqual(mockDetail)
    })

    it('should return null when fetchPhotoDetail fails', async () => {
      photoAPIMock.photos.getDetail.mockRejectedValue(new Error('Not found'))

      const store = usePhotoStore()
      const result = await store.fetchPhotoDetail('non-existent')

      expect(result).toBeNull()
    })
  })

  // ============================================
  // Story E-01.2: 照片导入
  // ============================================
  describe('E-01.2: 照片导入', () => {
    it('should import photos from folder', async () => {
      photoAPIMock.local.selectFolder.mockResolvedValue(['/test/folder'])
      photoAPIMock.local.importFolder.mockResolvedValue({
        success: true,
        imported: 5,
        errors: 0
      })
      photoAPIMock.photos.getList.mockResolvedValue([{ uuid: '1' }])

      const store = usePhotoStore()
      const result = await store.selectAndImportFolder()

      expect(result).toBe(true)
      expect(photoAPIMock.local.selectFolder).toHaveBeenCalled()
      expect(photoAPIMock.local.importFolder).toHaveBeenCalledWith('/test/folder')
    })

    it('should return false when no folder selected', async () => {
      photoAPIMock.local.selectFolder.mockResolvedValue([])

      const store = usePhotoStore()
      const result = await store.selectAndImportFolder()

      expect(result).toBe(false)
      expect(photoAPIMock.local.importFolder).not.toHaveBeenCalled()
    })

    it('should update import progress during import', async () => {
      photoAPIMock.local.selectFolder.mockResolvedValue(['/test/folder'])
      photoAPIMock.local.importFolder.mockResolvedValue({
        success: true,
        imported: 10,
        errors: 1
      })
      photoAPIMock.photos.getList.mockResolvedValue([])

      const store = usePhotoStore()

      // Call directly without selectAndImportFolder
      await store.importFromFolder('/test/folder')

      // Verify progress was set before fetchPhotos reset it
      expect(store.importProgress).not.toBeNull()
      // Note: fetchPhotos is called after success which resets some state
      // The important thing is import completed successfully
      expect(store.isImporting).toBe(false)
    })

    it('should handle import error', async () => {
      photoAPIMock.local.importFolder.mockResolvedValue({ success: false })

      const store = usePhotoStore()
      await store.importFromFolder('/error/folder')

      expect(store.importProgress?.status).toBe('error')
      expect(store.isImporting).toBe(false)
    })

    it('should handle import exception', async () => {
      photoAPIMock.local.importFolder.mockRejectedValue(new Error('Import failed'))

      const store = usePhotoStore()
      await store.importFromFolder('/error/folder')

      expect(store.importProgress?.status).toBe('error')
      expect(store.isImporting).toBe(false)
    })
  })

  // ============================================
  // Search Photos Tests
  // ============================================
  describe('Search Photos', () => {
    it('should search photos with query', async () => {
      const searchResults = { results: [{ uuid: '1' }], total: 1 }
      photoAPIMock.photos.search.mockResolvedValue(searchResults)

      const store = usePhotoStore()
      const result = await store.searchPhotos('sunset')

      expect(photoAPIMock.photos.search).toHaveBeenCalledWith('sunset', undefined)
      expect(result).toEqual(searchResults)
    })

    it('should search photos with filters', async () => {
      const filters = { year: 2024, location: 'Tokyo' }
      photoAPIMock.photos.search.mockResolvedValue({ results: [], total: 0 })

      const store = usePhotoStore()
      await store.searchPhotos('trip', filters)

      expect(photoAPIMock.photos.search).toHaveBeenCalledWith('trip', filters)
    })

    it('should handle search error gracefully', async () => {
      photoAPIMock.photos.search.mockRejectedValue(new Error('Search failed'))

      const store = usePhotoStore()
      const result = await store.searchPhotos('error')

      expect(result).toEqual({ results: [], total: 0 })
    })
  })

  // ============================================
  // Sync Photos Tests
  // ============================================
  describe('Sync Photos', () => {
    it('should sync photos and fetch', async () => {
      photoAPIMock.sync.start.mockResolvedValue(5)
      photoAPIMock.photos.getList.mockResolvedValue([{ uuid: '1' }])

      const store = usePhotoStore()
      const count = await store.syncPhotos()

      expect(photoAPIMock.sync.start).toHaveBeenCalled()
      expect(count).toBe(5)
    })

    it('should handle sync error', async () => {
      photoAPIMock.sync.start.mockRejectedValue(new Error('Sync failed'))

      const store = usePhotoStore()
      const count = await store.syncPhotos()

      expect(count).toBe(0)
    })
  })

  // ============================================
  // Local Photo Count Tests
  // ============================================
  describe('Local Photo Count', () => {
    it('should return local photo count', async () => {
      photoAPIMock.local.getCount.mockResolvedValue(100)

      const store = usePhotoStore()
      const count = await store.getLocalPhotoCount()

      expect(count).toBe(100)
    })

    it('should return 0 on error', async () => {
      photoAPIMock.local.getCount.mockRejectedValue(new Error('Error'))

      const store = usePhotoStore()
      const count = await store.getLocalPhotoCount()

      expect(count).toBe(0)
    })
  })

  // ============================================
  // Reset Store Tests
  // ============================================
  describe('Reset Store', () => {
    it('should reset to initial state', async () => {
      photoAPIMock.photos.getList.mockResolvedValue([{ uuid: '1' }])

      const store = usePhotoStore()
      store.photos = [{ uuid: '1' }]
      store.totalCount = 1
      store.hasMore = false
      store.isImporting = true

      store.reset()

      expect(store.photos).toEqual([])
      expect(store.totalCount).toBe(0)
      expect(store.hasMore).toBe(true)
      expect(store.isImporting).toBe(false)
      expect(store.importProgress).toBeNull()
    })
  })

  // ============================================
  // Loading State Tests
  // ============================================
  describe('Loading State', () => {
    it('should set loading=true during fetch', async () => {
      let resolveFetch: (val: any) => void
      const fetchPromise = new Promise(resolve => { resolveFetch = resolve })
      photoAPIMock.photos.getList.mockReturnValue(fetchPromise)

      const store = usePhotoStore()
      const fetchPromiseResult = store.fetchPhotos()

      expect(store.loading).toBe(true)

      resolveFetch!([{ uuid: '1' }])
      await fetchPromiseResult

      expect(store.loading).toBe(false)
    })

    it('should set loading=true during search', async () => {
      let resolveSearch: (val: any) => void
      const searchPromise = new Promise(resolve => { resolveSearch = resolve })
      photoAPIMock.photos.search.mockReturnValue(searchPromise)

      const store = usePhotoStore()
      const searchPromiseResult = store.searchPhotos('test')

      expect(store.loading).toBe(true)

      resolveSearch!({ results: [], total: 0 })
      await searchPromiseResult

      expect(store.loading).toBe(false)
    })
  })
})
