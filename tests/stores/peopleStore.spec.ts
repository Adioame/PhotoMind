/**
 * PhotoMind - People Store Unit Tests
 *
 * Tests for Epic E-04: 人物与地点管理
 * Stories: E-04.1 (人物识别), E-04.2 (人物管理)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePeopleStore } from '@/stores/peopleStore'

// Mock window.photoAPI
const photoAPIMock = {
  people: {
    getAll: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(0),
    getPhotos: vi.fn().mockResolvedValue({ photos: [] }),
    getById: vi.fn().mockResolvedValue(null)
  }
}
Object.defineProperty(global, 'window', {
  value: { photoAPI: photoAPIMock },
  writable: true
})

describe('PeopleStore - Epic E-04', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================
  // Story E-04.1: 人物识别
  // ============================================
  describe('E-04.1: 人物识别', () => {
    it('should have initial empty state', () => {
      const store = usePeopleStore()

      expect(store.people).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.selectedPerson).toBeNull()
      expect(store.personPhotos).toEqual([])
    })

    it('should fetch all people', async () => {
      const mockPeople = [
        { id: 1, name: '妈妈', face_count: 50 },
        { id: 2, name: '爸爸', face_count: 45 }
      ]
      photoAPIMock.people.getAll.mockResolvedValue(mockPeople)

      const store = usePeopleStore()
      await store.fetchPeople()

      expect(photoAPIMock.people.getAll).toHaveBeenCalled()
      expect(store.people).toEqual(mockPeople)
      expect(store.loading).toBe(false)
    })

    it('should handle fetch error gracefully', async () => {
      photoAPIMock.people.getAll.mockRejectedValue(new Error('Fetch failed'))

      const store = usePeopleStore()
      await store.fetchPeople()

      expect(store.people).toEqual([])
    })

    it('should search people by query', async () => {
      const mockResults = [{ id: 1, name: '妈妈' }]
      photoAPIMock.people.search.mockResolvedValue(mockResults)

      const store = usePeopleStore()
      const results = await store.searchPeople('妈妈')

      expect(photoAPIMock.people.search).toHaveBeenCalledWith('妈妈')
      expect(results).toEqual(mockResults)
    })

    it('should return empty array on search error', async () => {
      photoAPIMock.people.search.mockRejectedValue(new Error('Search failed'))

      const store = usePeopleStore()
      const results = await store.searchPeople('test')

      expect(results).toEqual([])
    })
  })

  // ============================================
  // Story E-04.2: 人物管理
  // ============================================
  describe('E-04.2: 人物管理', () => {
    it('should add new person', async () => {
      photoAPIMock.people.add.mockResolvedValue(1)
      photoAPIMock.people.getAll.mockResolvedValue([{ id: 1, name: '新人物' }])

      const store = usePeopleStore()
      const result = await store.addPerson({ name: '新人物', displayName: 'New Person' })

      expect(result).toBe(true)
      expect(photoAPIMock.people.add).toHaveBeenCalledWith({ name: '新人物', displayName: 'New Person' })
    })

    it('should return false when add fails', async () => {
      photoAPIMock.people.add.mockResolvedValue(0)

      const store = usePeopleStore()
      const result = await store.addPerson({ name: '失败人物' })

      expect(result).toBe(false)
    })

    it('should select person and load photos', async () => {
      const mockPerson = { id: 1, name: '妈妈', face_count: 50 }
      const mockPhotos = [{ id: 1, uuid: 'photo-1', file_name: 'photo.jpg' }]
      photoAPIMock.people.getPhotos.mockResolvedValue({ photos: mockPhotos })

      const store = usePeopleStore()
      await store.selectPerson(mockPerson)

      expect(store.selectedPerson).toEqual(mockPerson)
      expect(store.personPhotos).toEqual(mockPhotos)
    })

    it('should load person photos by personId', async () => {
      const mockPhotos = [{ id: 1, uuid: 'photo-1' }]
      photoAPIMock.people.getPhotos.mockResolvedValue({ photos: mockPhotos })

      const store = usePeopleStore()
      store.selectedPerson = { id: 1, name: '妈妈', face_count: 50 }
      await store.loadPersonPhotos('妈妈')

      expect(photoAPIMock.people.getPhotos).toHaveBeenCalledWith({ personId: 1 })
      expect(store.personPhotos).toEqual(mockPhotos)
      expect(store.loading).toBe(false)
    })

    it('should clear selection', () => {
      const store = usePeopleStore()
      store.selectedPerson = { id: 1, name: '妈妈', face_count: 50 }
      store.personPhotos = [{ id: 1, uuid: 'photo-1' }]

      store.clearSelection()

      expect(store.selectedPerson).toBeNull()
      expect(store.personPhotos).toEqual([])
    })

    it('should handle load photos error', async () => {
      photoAPIMock.people.getPhotos.mockRejectedValue(new Error('Load failed'))

      const store = usePeopleStore()
      await store.loadPersonPhotos('妈妈')

      expect(store.personPhotos).toEqual([])
      expect(store.loading).toBe(false)
    })
  })

  // ============================================
  // Loading State Tests
  // ============================================
  describe('Loading State', () => {
    it('should set loading=true during fetchPeople', async () => {
      let resolveFetch: (val: any) => void
      const fetchPromise = new Promise(resolve => { resolveFetch = resolve })
      photoAPIMock.people.getAll.mockReturnValue(fetchPromise)

      const store = usePeopleStore()
      const fetchPromiseResult = store.fetchPeople()

      expect(store.loading).toBe(true)

      resolveFetch!([{ id: 1 }])
      await fetchPromiseResult

      expect(store.loading).toBe(false)
    })

    it('should set loading=true during loadPersonPhotos', async () => {
      let resolveLoad: (val: any) => void
      const loadPromise = new Promise(resolve => { resolveLoad = resolve })
      photoAPIMock.people.getPhotos.mockReturnValue(loadPromise)

      const store = usePeopleStore()
      store.selectedPerson = { id: 1, name: 'test', face_count: 10 }
      const loadPromiseResult = store.loadPersonPhotos('test')

      expect(store.loading).toBe(true)

      resolveLoad!({ photos: [] })
      await loadPromiseResult

      expect(store.loading).toBe(false)
    })
  })

  // ============================================
  // Edge Cases Tests
  // ============================================
  describe('Edge Cases', () => {
    it('should handle empty people list', async () => {
      photoAPIMock.people.getAll.mockResolvedValue([])

      const store = usePeopleStore()
      await store.fetchPeople()

      expect(store.people).toEqual([])
    })

    it('should handle empty search results', async () => {
      photoAPIMock.people.search.mockResolvedValue([])

      const store = usePeopleStore()
      const results = await store.searchPeople('nonexistent')

      expect(results).toEqual([])
    })

    it('should handle person with no photos', async () => {
      photoAPIMock.people.getPhotos.mockResolvedValue({ photos: [] })

      const store = usePeopleStore()
      store.selectedPerson = { id: 1, name: 'unknown', face_count: 0 }
      await store.loadPersonPhotos('unknown')

      expect(store.personPhotos).toEqual([])
    })
  })

  // ============================================
  // Navigation State Tests (New Feature)
  // ============================================
  describe('Navigation State', () => {
    it('should have initial lastVisitedPersonId as null', () => {
      const store = usePeopleStore()
      expect(store.lastVisitedPersonId).toBeNull()
    })

    it('should set and persist lastVisitedPersonId', () => {
      const store = usePeopleStore()
      store.setLastVisitedPerson(123)

      expect(store.lastVisitedPersonId).toBe(123)
      expect(localStorage.getItem('lastVisitedPersonId')).toBe('123')
    })

    it('should clear lastVisitedPersonId when set to null', () => {
      const store = usePeopleStore()
      store.setLastVisitedPerson(123)
      store.setLastVisitedPerson(null)

      expect(store.lastVisitedPersonId).toBeNull()
      expect(localStorage.getItem('lastVisitedPersonId')).toBeNull()
    })

    it('should get person by id from cache', async () => {
      const mockPeople = [
        { id: 1, name: '妈妈', face_count: 50 },
        { id: 2, name: '爸爸', face_count: 45 }
      ]
      photoAPIMock.people.getAll.mockResolvedValue(mockPeople)

      const store = usePeopleStore()
      await store.fetchPeople()

      const person = await store.getPersonById(1)
      expect(person).toEqual(mockPeople[0])
      expect(photoAPIMock.people.getById).not.toHaveBeenCalled()
    })

    it('should get person by id from API when not in cache', async () => {
      const mockPerson = { id: 3, name: '宝宝', face_count: 30 }
      photoAPIMock.people.getById.mockResolvedValue(mockPerson)

      const store = usePeopleStore()
      const person = await store.getPersonById(3)

      expect(person).toEqual(mockPerson)
      expect(photoAPIMock.people.getById).toHaveBeenCalledWith(3)
    })

    it('should handle getPersonById error', async () => {
      photoAPIMock.people.getById.mockRejectedValue(new Error('Not found'))

      const store = usePeopleStore()
      const person = await store.getPersonById(999)

      expect(person).toBeNull()
    })
  })
})
