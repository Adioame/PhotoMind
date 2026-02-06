/**
 * PhotoMind - People Store Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePeopleStore, type Person, type Photo } from '../../src/renderer/stores/peopleStore'

// Mock window.photoAPI
const mockPhotoAPI = {
  people: {
    getAll: vi.fn(),
    search: vi.fn(),
    add: vi.fn(),
    getPhotos: vi.fn(),
    getById: vi.fn()
  }
}

global.window = {
  photoAPI: mockPhotoAPI
} as any

describe('PeopleStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should have correct default values', () => {
      const store = usePeopleStore()

      expect(store.people).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.selectedPerson).toBe(null)
      expect(store.personPhotos).toEqual([])
    })
  })

  describe('fetchPeople', () => {
    it('should fetch people successfully', async () => {
      const mockPeople: Person[] = [
        { id: 1, name: 'John', face_count: 10 },
        { id: 2, name: 'Jane', face_count: 8 }
      ]
      mockPhotoAPI.people.getAll.mockResolvedValue(mockPeople)

      const store = usePeopleStore()
      await store.fetchPeople()

      expect(store.people).toEqual(mockPeople)
      expect(store.loading).toBe(false)
      expect(mockPhotoAPI.people.getAll).toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      mockPhotoAPI.people.getAll.mockRejectedValue(new Error('API Error'))

      const store = usePeopleStore()
      await store.fetchPeople()

      expect(store.people).toEqual([])
      expect(store.loading).toBe(false)
    })

    it('should handle null response', async () => {
      mockPhotoAPI.people.getAll.mockResolvedValue(null)

      const store = usePeopleStore()
      await store.fetchPeople()

      expect(store.people).toEqual([])
    })
  })

  describe('searchPeople', () => {
    it('should search people successfully', async () => {
      const mockPeople: Person[] = [
        { id: 1, name: 'John', face_count: 10 }
      ]
      mockPhotoAPI.people.search.mockResolvedValue(mockPeople)

      const store = usePeopleStore()
      const result = await store.searchPeople('John')

      expect(result).toEqual(mockPeople)
      expect(mockPhotoAPI.people.search).toHaveBeenCalledWith('John')
    })

    it('should return empty array on error', async () => {
      mockPhotoAPI.people.search.mockRejectedValue(new Error('Search failed'))

      const store = usePeopleStore()
      const result = await store.searchPeople('test')

      expect(result).toEqual([])
    })

    it('should handle null response', async () => {
      mockPhotoAPI.people.search.mockResolvedValue(null)

      const store = usePeopleStore()
      const result = await store.searchPeople('test')

      expect(result).toEqual([])
    })
  })

  describe('addPerson', () => {
    it('should add person successfully', async () => {
      mockPhotoAPI.people.add.mockResolvedValue(1)
      mockPhotoAPI.people.getAll.mockResolvedValue([])

      const store = usePeopleStore()
      const result = await store.addPerson({ name: 'New Person' })

      expect(result).toBe(true)
      expect(mockPhotoAPI.people.add).toHaveBeenCalledWith({ name: 'New Person' })
    })

    it('should return false when add fails', async () => {
      mockPhotoAPI.people.add.mockResolvedValue(0)

      const store = usePeopleStore()
      const result = await store.addPerson({ name: 'New Person' })

      expect(result).toBe(false)
    })

    it('should handle addPerson errors', async () => {
      mockPhotoAPI.people.add.mockRejectedValue(new Error('Add failed'))

      const store = usePeopleStore()
      const result = await store.addPerson({ name: 'New Person' })

      expect(result).toBe(false)
    })
  })

  describe('selectPerson', () => {
    it('should select person and load photos', async () => {
      const mockPhotos: Photo[] = [
        { id: 1, uuid: 'uuid-1', file_name: 'photo1.jpg', taken_at: '2024-01-01' }
      ]
      mockPhotoAPI.people.getPhotos.mockResolvedValue({ photos: mockPhotos })

      const store = usePeopleStore()
      const person: Person = { id: 1, name: 'John', face_count: 10 }
      await store.selectPerson(person)

      expect(store.selectedPerson).toEqual(person)
      expect(mockPhotoAPI.people.getPhotos).toHaveBeenCalledWith({ personId: 1 })
    })
  })

  describe('loadPersonPhotos', () => {
    it('should load person photos successfully', async () => {
      const mockPhotos: Photo[] = [
        { id: 1, uuid: 'uuid-1', file_name: 'photo1.jpg', taken_at: '2024-01-01' },
        { id: 2, uuid: 'uuid-2', file_name: 'photo2.jpg', taken_at: '2024-01-02' }
      ]
      mockPhotoAPI.people.getPhotos.mockResolvedValue({ photos: mockPhotos })

      const store = usePeopleStore()
      store.selectedPerson = { id: 1, name: 'John', face_count: 10 }
      await store.loadPersonPhotos('John')

      expect(store.personPhotos).toEqual(mockPhotos)
      expect(store.loading).toBe(false)
    })

    it('should handle errors gracefully', async () => {
      mockPhotoAPI.people.getPhotos.mockRejectedValue(new Error('Load failed'))

      const store = usePeopleStore()
      await store.loadPersonPhotos('John')

      expect(store.personPhotos).toEqual([])
      expect(store.loading).toBe(false)
    })

    it('should handle null response', async () => {
      mockPhotoAPI.people.getPhotos.mockResolvedValue(null)

      const store = usePeopleStore()
      await store.loadPersonPhotos('John')

      expect(store.personPhotos).toEqual([])
    })
  })

  describe('clearSelection', () => {
    it('should clear selected person and photos', () => {
      const store = usePeopleStore()
      store.selectedPerson = { id: 1, name: 'John', face_count: 10 }
      store.personPhotos = [{ id: 1, uuid: 'uuid-1', file_name: 'photo.jpg', taken_at: '2024-01-01' }]

      store.clearSelection()

      expect(store.selectedPerson).toBe(null)
      expect(store.personPhotos).toEqual([])
    })
  })

  describe('State Consistency', () => {
    it('should maintain loading state during async operations', async () => {
      mockPhotoAPI.people.getAll.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))

      const store = usePeopleStore()
      const promise = store.fetchPeople()

      expect(store.loading).toBe(true)
      await promise
      expect(store.loading).toBe(false)
    })

    it('should correctly reset state after operations', async () => {
      const mockPhotos: Photo[] = [
        { id: 1, uuid: 'uuid-1', file_name: 'photo1.jpg', taken_at: '2024-01-01' }
      ]
      mockPhotoAPI.people.getPhotos.mockResolvedValue({ photos: mockPhotos })

      const store = usePeopleStore()
      store.selectedPerson = { id: 1, name: 'John', face_count: 10 }
      await store.loadPersonPhotos('John')
      store.clearSelection()

      expect(store.personPhotos).toEqual([])
      expect(store.loading).toBe(false)
    })
  })

  describe('Navigation State', () => {
    it('should track last visited person', () => {
      const store = usePeopleStore()

      expect(store.lastVisitedPersonId).toBeNull()

      store.setLastVisitedPerson(123)
      expect(store.lastVisitedPersonId).toBe(123)

      store.setLastVisitedPerson(null)
      expect(store.lastVisitedPersonId).toBeNull()
    })

    it('should get person by id from cache', async () => {
      const mockPeople: Person[] = [
        { id: 1, name: 'John', face_count: 10 },
        { id: 2, name: 'Jane', face_count: 8 }
      ]
      mockPhotoAPI.people.getAll.mockResolvedValue(mockPeople)

      const store = usePeopleStore()
      await store.fetchPeople()

      const person = await store.getPersonById(1)
      expect(person).toEqual(mockPeople[0])
    })

    it('should get person by id from API when not cached', async () => {
      const mockPerson: Person = { id: 3, name: 'Bob', face_count: 5 }
      mockPhotoAPI.people.getById.mockResolvedValue(mockPerson)

      const store = usePeopleStore()
      const person = await store.getPersonById(3)

      expect(person).toEqual(mockPerson)
      expect(mockPhotoAPI.people.getById).toHaveBeenCalledWith(3)
    })

    it('should handle getPersonById error', async () => {
      mockPhotoAPI.people.getById.mockRejectedValue(new Error('Not found'))

      const store = usePeopleStore()
      const person = await store.getPersonById(999)

      expect(person).toBeNull()
    })
  })
})
