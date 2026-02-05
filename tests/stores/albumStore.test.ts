/**
 * PhotoMind - AlbumStore Tests
 *
 * Tests for AlbumStore including cover setting functionality
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAlbumStore, type Album, type AlbumPhoto } from '../../src/renderer/stores/albumStore'

// Mock window.photoAPI
vi.mocked(window).photoAPI = {
  albums: {
    getAll: vi.fn(),
    getPhotos: vi.fn(),
    createSmart: vi.fn(),
    createManual: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    setCoverPhoto: vi.fn(),
    addPhotos: vi.fn(),
    removePhoto: vi.fn()
  }
} as any

describe('AlbumStore - Cover Setting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  describe('Initial State', () => {
    it('should have correct default values', () => {
      const store = useAlbumStore()

      expect(store.albums).toEqual([])
      expect(store.currentAlbum).toBeNull()
      expect(store.loading).toBe(false)
      expect(store.albumPhotos).toEqual([])
    })
  })

  describe('Getters', () => {
    it('should filter smart albums', () => {
      const store = useAlbumStore()
      store.albums = [
        { id: 1, name: 'Smart 1', type: 'smart' } as Album,
        { id: 2, name: 'Manual 1', type: 'manual' } as Album,
        { id: 3, name: 'Smart 2', type: 'smart' } as Album
      ]

      expect(store.smartAlbums.length).toBe(2)
      expect(store.smartAlbums.every(a => a.type === 'smart')).toBe(true)
    })

    it('should filter manual albums', () => {
      const store = useAlbumStore()
      store.albums = [
        { id: 1, name: 'Manual 1', type: 'manual' } as Album,
        { id: 2, name: 'Smart 1', type: 'smart' } as Album,
        { id: 3, name: 'Manual 2', type: 'manual' } as Album
      ]

      expect(store.manualAlbums.length).toBe(2)
      expect(store.manualAlbums.every(a => a.type === 'manual')).toBe(true)
    })
  })

  describe('setCoverPhoto', () => {
    it('should have setCoverPhoto action', () => {
      const store = useAlbumStore()
      expect(typeof store.setCoverPhoto).toBe('function')
    })

    it('should update album cover photo successfully', async () => {
      const store = useAlbumStore()

      // Setup mock albums with one manual album
      const mockAlbum = {
        id: 1,
        uuid: 'test-uuid',
        name: 'Test Album',
        type: 'manual' as const,
        photoCount: 10,
        coverPhotoId: undefined,
        coverPhotoPath: undefined
      }
      store.albums = [mockAlbum]

      // Mock successful API call
      vi.spyOn(window.photoAPI.albums, 'update').mockResolvedValue({
        ...mockAlbum,
        coverPhotoId: 100,
        coverPhotoPath: '/path/to/cover.jpg'
      })

      const result = await store.setCoverPhoto(1, 100)

      expect(result).toBe(true)
      expect(store.albums[0].coverPhotoId).toBe(100)
      expect(store.albums[0].coverPhotoPath).toBe('/path/to/cover.jpg')
    })

    it('should handle update failure', async () => {
      const store = useAlbumStore()

      store.albums = [{ id: 1, name: 'Test', type: 'manual' } as Album]

      // Mock failed API call
      vi.spyOn(window.photoAPI.albums, 'update').mockResolvedValue(null)

      const result = await store.setCoverPhoto(1, 100)

      expect(result).toBe(false)
    })
  })

  describe('updateAlbum', () => {
    it('should have updateAlbum action', () => {
      const store = useAlbumStore()
      expect(typeof store.updateAlbum).toBe('function')
    })

    it('should update album successfully', async () => {
      const store = useAlbumStore()

      store.albums = [{ id: 1, name: 'Old Name', type: 'manual' } as Album]

      vi.spyOn(window.photoAPI.albums, 'update').mockResolvedValue({
        id: 1,
        name: 'New Name',
        type: 'manual',
        photoCount: 10
      })

      const result = await store.updateAlbum(1, { name: 'New Name' })

      expect(result).not.toBeNull()
      expect(store.albums[0].name).toBe('New Name')
    })

    it('should handle update error', async () => {
      const store = useAlbumStore()

      store.albums = [{ id: 1, name: 'Test', type: 'manual' } as Album]

      vi.spyOn(window.photoAPI.albums, 'update').mockRejectedValue(new Error('Update failed'))

      const result = await store.updateAlbum(1, { name: 'New Name' })

      expect(result).toBeNull()
    })
  })

  describe('loadAlbumPhotos', () => {
    it('should have loadAlbumPhotos action', () => {
      const store = useAlbumStore()
      expect(typeof store.loadAlbumPhotos).toBe('function')
    })

    it('should load album photos successfully', async () => {
      const store = useAlbumStore()

      const mockPhotos: AlbumPhoto[] = [
        { id: 1, uuid: 'p1', fileName: 'photo1.jpg', thumbnailPath: '/thumb1.jpg' },
        { id: 2, uuid: 'p2', fileName: 'photo2.jpg', thumbnailPath: '/thumb2.jpg' }
      ]

      vi.spyOn(window.photoAPI.albums, 'getPhotos').mockResolvedValue(mockPhotos)

      const result = await store.loadAlbumPhotos(1)

      expect(result.length).toBe(2)
      expect(store.albumPhotos.length).toBe(2)
    })

    it('should handle load error', async () => {
      const store = useAlbumStore()

      vi.spyOn(window.photoAPI.albums, 'getPhotos').mockResolvedValue([])

      const result = await store.loadAlbumPhotos(999)

      expect(result).toEqual([])
      expect(store.albumPhotos).toEqual([])
    })
  })

  describe('deleteAlbum', () => {
    it('should have deleteAlbum action', () => {
      const store = useAlbumStore()
      expect(typeof store.deleteAlbum).toBe('function')
    })

    it('should delete album successfully', async () => {
      const store = useAlbumStore()

      store.albums = [
        { id: 1, name: 'To Delete', type: 'manual' } as Album,
        { id: 2, name: 'To Keep', type: 'manual' } as Album
      ]

      vi.spyOn(window.photoAPI.albums, 'delete').mockResolvedValue(undefined)

      const result = await store.deleteAlbum(1)

      expect(result).toBe(true)
      expect(store.albums.length).toBe(1)
      expect(store.albums[0].id).toBe(2)
    })
  })

  describe('reset', () => {
    it('should reset all state to default', () => {
      const store = useAlbumStore()

      // Modify state
      store.albums = [{ id: 1 }] as Album[]
      store.currentAlbum = {} as Album
      store.albumPhotos = [{ id: 1 }] as AlbumPhoto[]
      store.showCreateDialog = true

      store.reset()

      expect(store.albums).toEqual([])
      expect(store.currentAlbum).toBeNull()
      expect(store.albumPhotos).toEqual([])
      expect(store.showCreateDialog).toBe(false)
    })
  })
})
