/**
 * PhotoMind - Search Store Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSearchStore, type SearchMode, type SearchSuggestion } from '../../src/renderer/stores/searchStore'

// Mock window.photoAPI
const mockPhotoAPI = {
  keywordSearch: {
    suggestions: vi.fn(),
    search: vi.fn()
  },
  people: {
    getSuggestions: vi.fn()
  },
  globalSearch: {
    quick: vi.fn()
  },
  hybridSearch: {
    searchWithIntent: vi.fn()
  }
}

global.window = {
  photoAPI: mockPhotoAPI
} as any

describe('SearchStore', () => {
  let mockLocalStorage: Record<string, string> = {}

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockLocalStorage = {}

    // Mock localStorage with fresh state each test
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      return mockLocalStorage[key] || null
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      mockLocalStorage[key] = value
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
      delete mockLocalStorage[key]
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Initial State', () => {
    it('should have correct default values', () => {
      const store = useSearchStore()

      expect(store.query).toBe('')
      expect(store.mode).toBe('hybrid')
      expect(store.activeAgents).toEqual(['keyword', 'semantic', 'people'])
      expect(store.isSearching).toBe(false)
      expect(store.searchProgress).toBe(0)
      expect(store.suggestions).toEqual([])
      expect(store.recentSearches).toEqual([])
      expect(store.results).toEqual([])
      expect(store.totalResults).toBe(0)
      expect(store.hasSearched).toBe(false)
      expect(store.filters).toEqual({})
    })
  })

  describe('Getters', () => {
    it('canSearch should return true when query has content and not searching', () => {
      const store = useSearchStore()
      store.query = 'test'

      expect(store.canSearch).toBe(true)
    })

    it('canSearch should return false when query is empty', () => {
      const store = useSearchStore()

      expect(store.canSearch).toBe(false)
    })

    it('canSearch should return false when isSearching is true', () => {
      const store = useSearchStore()
      store.query = 'test'
      store.isSearching = true

      expect(store.canSearch).toBe(false)
    })

    it('hasSuggestions should return true when suggestions exist', () => {
      const store = useSearchStore()
      store.suggestions = [{ text: 'test', type: 'keyword' }]

      expect(store.hasSuggestions).toBe(true)
    })

    it('hasSuggestions should return true when recentSearches exist', () => {
      const store = useSearchStore()
      store.recentSearches = ['previous search']

      expect(store.hasSuggestions).toBe(true)
    })

    it('activeAgentCount should return correct count', () => {
      const store = useSearchStore()
      store.activeAgents = ['keyword', 'semantic']

      expect(store.activeAgentCount).toBe(2)
    })

    it('searchParams should return correct object', () => {
      const store = useSearchStore()
      store.query = 'test query'
      store.mode = 'semantic'
      store.activeAgents = ['keyword']
      store.filters = { date: '2024' }

      const params = store.searchParams

      expect(params).toEqual({
        query: 'test query',
        mode: 'semantic',
        agents: ['keyword'],
        filters: { date: '2024' }
      })
    })
  })

  describe('setQuery', () => {
    it('should update query', () => {
      const store = useSearchStore()
      store.setQuery('vacation photos')

      expect(store.query).toBe('vacation photos')
    })

    it('should clear suggestions when query is short', () => {
      const store = useSearchStore()
      store.suggestions = [{ text: 'test', type: 'keyword' }]
      store.setQuery('a')

      expect(store.suggestions).toEqual([])
    })
  })

  describe('setMode', () => {
    it('should set search mode', () => {
      const store = useSearchStore()
      store.setMode('semantic')

      expect(store.mode).toBe('semantic')
    })

    it('should accept all valid modes', () => {
      const store = useSearchStore()

      ;(['keyword', 'semantic', 'hybrid'] as SearchMode[]).forEach(mode => {
        store.setMode(mode)
        expect(store.mode).toBe(mode)
      })
    })
  })

  describe('toggleAgent', () => {
    it('should add agent when not present', () => {
      const store = useSearchStore()
      store.activeAgents = ['keyword']
      store.toggleAgent('semantic')

      expect(store.activeAgents).toContain('semantic')
    })

    it('should remove agent when present', () => {
      const store = useSearchStore()
      store.activeAgents = ['keyword', 'semantic']
      store.toggleAgent('semantic')

      expect(store.activeAgents).not.toContain('semantic')
    })

    it('should not remove last agent', () => {
      const store = useSearchStore()
      store.activeAgents = ['keyword']
      store.toggleAgent('keyword')

      expect(store.activeAgents).toContain('keyword')
    })
  })

  describe('setActiveAgents', () => {
    it('should replace active agents', () => {
      const store = useSearchStore()
      store.setActiveAgents(['semantic', 'people'])

      expect(store.activeAgents).toEqual(['semantic', 'people'])
    })

    it('should not set empty array', () => {
      const store = useSearchStore()
      store.setActiveAgents([])

      expect(store.activeAgents).toEqual(['keyword', 'semantic', 'people'])
    })
  })

  describe('loadSuggestions', () => {
    it('should load suggestions from both keyword and people sources', async () => {
      mockPhotoAPI.keywordSearch.suggestions.mockResolvedValue(['beach', 'mountain'])
      mockPhotoAPI.people.getSuggestions.mockResolvedValue([{ name: 'John' }])

      const store = useSearchStore()
      await store.loadSuggestions('b')

      expect(store.suggestions.length).toBeGreaterThan(0)
      expect(mockPhotoAPI.keywordSearch.suggestions).toHaveBeenCalledWith('b')
      expect(mockPhotoAPI.people.getSuggestions).toHaveBeenCalledWith('b', 5)
    })

    it('should handle errors gracefully', async () => {
      mockPhotoAPI.keywordSearch.suggestions.mockRejectedValue(new Error('Failed'))
      mockPhotoAPI.people.getSuggestions.mockResolvedValue([])

      const store = useSearchStore()
      await store.loadSuggestions('test')

      expect(store.suggestions).toEqual([])
    })

    it('should limit suggestions to 10', async () => {
      mockPhotoAPI.keywordSearch.suggestions.mockResolvedValue([
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'
      ])
      mockPhotoAPI.people.getSuggestions.mockResolvedValue([])

      const store = useSearchStore()
      await store.loadSuggestions('a')

      expect(store.suggestions.length).toBeLessThanOrEqual(10)
    })
  })

  describe('search', () => {
    it('should perform keyword search', async () => {
      const mockResult = { results: [{ id: '1' }], total: 1 }
      mockPhotoAPI.keywordSearch.search.mockResolvedValue(mockResult)

      const store = useSearchStore()
      store.setMode('keyword')
      const result = await store.search('test')

      expect(result).toEqual(mockResult)
      expect(store.hasSearched).toBe(true)
    })

    it('should perform semantic search', async () => {
      const mockResult = { results: [], total: 0 }
      mockPhotoAPI.globalSearch.quick.mockResolvedValue(mockResult)

      const store = useSearchStore()
      store.setMode('semantic')
      await store.search('test')

      expect(mockPhotoAPI.globalSearch.quick).toHaveBeenCalled()
    })

    it('should perform hybrid search by default', async () => {
      const mockResult = { results: [{ id: '1' }], total: 1 }
      mockPhotoAPI.hybridSearch.searchWithIntent.mockResolvedValue(mockResult)

      const store = useSearchStore()
      await store.search('test')

      expect(mockPhotoAPI.hybridSearch.searchWithIntent).toHaveBeenCalled()
    })

    it('should return empty when query is empty', async () => {
      const store = useSearchStore()
      const result = await store.search('')

      expect(result).toEqual({ results: [], total: 0 })
    })

    it('should update searchTime and searchProgress', async () => {
      const mockResult = { results: [], total: 0 }
      mockPhotoAPI.hybridSearch.searchWithIntent.mockResolvedValue(mockResult)

      const store = useSearchStore()
      await store.search('test')

      expect(store.searchTime).toBeGreaterThanOrEqual(0)
      expect(store.searchProgress).toBe(100)
    })
  })

  describe('addToHistory', () => {
    it('should add query to recent searches', () => {
      const store = useSearchStore()
      store.addToHistory('test query')

      expect(store.recentSearches).toContain('test query')
    })

    it('should move existing query to front', () => {
      const store = useSearchStore()
      store.recentSearches = ['old', 'test query', 'another']
      store.addToHistory('test query')

      expect(store.recentSearches[0]).toBe('test query')
    })

    it('should limit history to 20 items', () => {
      const store = useSearchStore()
      for (let i = 0; i < 25; i++) {
        store.addToHistory(`query ${i}`)
      }

      expect(store.recentSearches.length).toBeLessThanOrEqual(20)
    })

    it('should not add empty queries', () => {
      const store = useSearchStore()
      store.addToHistory('   ')

      expect(store.recentSearches).toEqual([])
    })
  })

  describe('loadHistory', () => {
    it('should load history from localStorage', () => {
      mockLocalStorage['photoMind_search_history'] = JSON.stringify(['query1', 'query2'])

      const store = useSearchStore()
      store.loadHistory()

      expect(store.recentSearches).toEqual(['query1', 'query2'])
    })

    it('should handle invalid JSON gracefully', () => {
      mockLocalStorage['photoMind_search_history'] = 'invalid json'

      const store = useSearchStore()
      store.loadHistory()

      expect(store.recentSearches).toEqual([])
    })
  })

  describe('clearHistory', () => {
    it('should clear all history', () => {
      const store = useSearchStore()
      store.recentSearches = ['query1', 'query2']
      store.clearHistory()

      expect(store.recentSearches).toEqual([])
    })
  })

  describe('selectSuggestion', () => {
    it('should accept string suggestion', async () => {
      const mockResult = { results: [], total: 0 }
      mockPhotoAPI.hybridSearch.searchWithIntent.mockResolvedValue(mockResult)

      const store = useSearchStore()
      store.selectSuggestion('test suggestion')

      expect(store.query).toBe('test suggestion')
    })

    it('should accept object suggestion', async () => {
      const mockResult = { results: [], total: 0 }
      mockPhotoAPI.hybridSearch.searchWithIntent.mockResolvedValue(mockResult)

      const store = useSearchStore()
      const suggestion: SearchSuggestion = { text: 'object suggestion', type: 'keyword' }
      store.selectSuggestion(suggestion)

      expect(store.query).toBe('object suggestion')
    })
  })

  describe('setFilters and clearFilters', () => {
    it('should set filters', () => {
      const store = useSearchStore()
      store.setFilters({ date: '2024', type: 'jpg' })

      expect(store.filters).toEqual({ date: '2024', type: 'jpg' })
    })

    it('should clear filters', () => {
      const store = useSearchStore()
      store.setFilters({ date: '2024' })
      store.clearFilters()

      expect(store.filters).toEqual({})
    })
  })

  describe('clearSearch', () => {
    it('should clear all search state', () => {
      const store = useSearchStore()
      store.query = 'test'
      store.results = [{ id: '1' }]
      store.totalResults = 1
      store.hasSearched = true
      store.filters = { date: '2024' }

      store.clearSearch()

      expect(store.query).toBe('')
      expect(store.results).toEqual([])
      expect(store.totalResults).toBe(0)
      expect(store.hasSearched).toBe(false)
      expect(store.searchTime).toBe(0)
      expect(store.searchProgress).toBe(0)
      expect(store.filters).toEqual({})
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      const store = useSearchStore()
      store.query = 'modified'
      store.mode = 'keyword'
      store.activeAgents = ['people']
      store.results = [{ id: '1' }]

      store.reset()

      expect(store.query).toBe('')
      expect(store.mode).toBe('hybrid')
      expect(store.activeAgents).toEqual(['keyword', 'semantic', 'people'])
      expect(store.results).toEqual([])
      expect(store.hasSearched).toBe(false)
    })
  })
})
