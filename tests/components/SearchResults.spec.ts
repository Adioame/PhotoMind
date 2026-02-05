/**
 * PhotoMind - SearchResults Component Unit Tests
 *
 * Tests for Epic E-05: 用户界面增强
 * Stories: E-05.2 (搜索结果展示)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import SearchResults from '@/components/search/SearchResults.vue'
import { useSearchStore } from '@/stores/searchStore'

describe('SearchResults Component - Epic E-05', () => {
  let wrapper: VueWrapper
  let searchStore: ReturnType<typeof useSearchStore>

  const createWrapper = (options = {}) => {
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      stubActions: false
    })

    wrapper = mount(SearchResults, {
      global: {
        plugins: [pinia],
        stubs: {
          Transition: {
            template: '<div><slot /></div>'
          }
        }
      },
      ...options
    })

    searchStore = useSearchStore()
    return wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.restoreAllMocks()
  })

  // ============================================
  // Story E-05.2: 搜索结果展示
  // ============================================
  describe('E-05.2: 搜索结果展示', () => {
    it('should display results count when search is complete (AC: 显示结果列表)', async () => {
      createWrapper()

      // Setup search results
      searchStore.results = [
        { photoUuid: '1', fileName: 'photo1.jpg' },
        { photoUuid: '2', fileName: 'photo2.jpg' },
        { photoUuid: '3', fileName: 'photo3.jpg' }
      ]
      searchStore.totalResults = 3
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const countText = wrapper.find('.results-count')
      expect(countText.text()).toContain('3')
    })

    it('should display search time (AC: 显示搜索耗时)', async () => {
      createWrapper()

      searchStore.results = [{ photoUuid: '1' }]
      searchStore.totalResults = 1
      searchStore.hasSearched = true
      searchStore.searchTime = 156

      await wrapper.vm.$nextTick()

      const timeText = wrapper.find('.results-time')
      expect(timeText.text()).toContain('156ms')
    })

    it('should display results in grid layout (AC: 以网格形式展示照片缩略图)', async () => {
      createWrapper()

      searchStore.results = [
        { photoUuid: '1', fileName: 'photo1.jpg', thumbnailPath: '/path/to/thumb1.jpg' },
        { photoUuid: '2', fileName: 'photo2.jpg', thumbnailPath: '/path/to/thumb2.jpg' }
      ]
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const grid = wrapper.find('.results-grid.grid')
      expect(grid.exists()).toBe(true)

      const cards = wrapper.findAll('.result-card')
      expect(cards.length).toBe(2)
    })

    it('should display similarity badge for each result (AC: 每张照片显示置信度指示器)', async () => {
      createWrapper()

      searchStore.results = [
        {
          photoUuid: '1',
          fileName: 'photo1.jpg',
          thumbnailPath: '/path/to/thumb1.jpg',
          similarity: 0.92
        },
        {
          photoUuid: '2',
          fileName: 'photo2.jpg',
          thumbnailPath: '/path/to/thumb2.jpg',
          similarity: 0.65
        }
      ]
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const badges = wrapper.findAll('.similarity-badge')
      expect(badges.length).toBe(2)
      expect(badges[0].text()).toContain('非常相似')
      expect(badges[1].text()).toContain('相似')
    })

    it('should display source badges (AC: 显示匹配原因标签)', async () => {
      createWrapper()

      searchStore.results = [
        {
          photoUuid: '1',
          fileName: 'photo1.jpg',
          thumbnailPath: '/path/to/thumb1.jpg',
          sources: [
            { type: 'keyword' },
            { type: 'semantic' }
          ]
        }
      ]
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const sourceBadges = wrapper.findAll('.source-badge')
      expect(sourceBadges.length).toBe(2)
    })

    it('should emit photoClick when result is clicked (AC: 支持点击放大查看)', async () => {
      createWrapper()

      searchStore.results = [
        {
          photoUuid: 'test-uuid',
          fileName: 'test.jpg',
          thumbnailPath: '/path/to/thumb.jpg'
        }
      ]
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const card = wrapper.find('.result-card')
      await card.trigger('click')

      expect(wrapper.emitted('photoClick')).toBeTruthy()
      expect(wrapper.emitted('photoClick')[0][0]).toMatchObject({
        photoUuid: 'test-uuid'
      })
    })

    it('should show empty state when no results found', async () => {
      createWrapper()

      searchStore.results = []
      searchStore.totalResults = 0
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const emptyState = wrapper.find('.empty-state')
      expect(emptyState.exists()).toBe(true)
      expect(emptyState.text()).toContain('未找到匹配的照片')
    })

    it('should show loading state during search', async () => {
      createWrapper()

      searchStore.isSearching = true
      searchStore.results = []
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const loadingState = wrapper.find('.loading-state')
      expect(loadingState.exists()).toBe(true)
      expect(loadingState.text()).toContain('正在搜索...')
    })

    it('should display query tag (AC: 以网格形式展示照片缩略图)', async () => {
      createWrapper()

      searchStore.results = [{ photoUuid: '1' }]
      searchStore.hasSearched = true
      searchStore.query = 'beach sunset'

      await wrapper.vm.$nextTick()

      const queryTag = wrapper.find('.query-tag')
      expect(queryTag.text()).toContain('beach sunset')
    })

    it('should show similarity score (AC: 置信度指示器)', async () => {
      createWrapper()

      searchStore.results = [
        {
          photoUuid: '1',
          fileName: 'photo1.jpg',
          thumbnailPath: '/path/to/thumb1.jpg',
          similarity: 0.85
        }
      ]
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const scoreText = wrapper.find('.similarity-score')
      expect(scoreText.text()).toContain('85%')
    })

    it('should clear search when clear button is clicked', async () => {
      createWrapper()

      // Setup some results
      searchStore.query = 'test'
      searchStore.results = [{ photoUuid: '1' }]
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const clearButton = wrapper.find('.action-button')
      await clearButton.trigger('click')

      expect(searchStore.query).toBe('')
    })
  })

  // ============================================
  // Layout Options Tests
  // ============================================
  describe('SearchResults Layout Options', () => {
    it('should support grid layout (default)', async () => {
      createWrapper({
        props: { layout: 'grid' }
      })

      searchStore.results = [{ photoUuid: '1' }]
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const grid = wrapper.find('.results-grid.grid')
      expect(grid.exists()).toBe(true)
    })

    it('should support list layout', async () => {
      createWrapper({
        props: { layout: 'list' }
      })

      searchStore.results = [{ photoUuid: '1' }]
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const list = wrapper.find('.results-grid.list')
      expect(list.exists()).toBe(true)
    })

    it('should support masonry layout', async () => {
      createWrapper({
        props: { layout: 'masonry' }
      })

      searchStore.results = [{ photoUuid: '1' }]
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const masonry = wrapper.find('.results-grid.masonry')
      expect(masonry.exists()).toBe(true)
    })

    it('should hide stats when showStats is false', async () => {
      createWrapper({
        props: { showStats: false }
      })

      searchStore.results = [{ photoUuid: '1' }]
      searchStore.hasSearched = true

      await wrapper.vm.$nextTick()

      const header = wrapper.find('.results-header')
      expect(header.exists()).toBe(false)
    })

    it('should hide filters when showFilters is false', async () => {
      createWrapper({
        props: { showFilters: false }
      })

      searchStore.results = [{ photoUuid: '1' }]
      searchStore.hasSearched = true
      searchStore.query = 'test'

      await wrapper.vm.$nextTick()

      const filters = wrapper.find('.filter-tags')
      expect(filters.exists()).toBe(false)
    })
  })

  // ============================================
  // Utility Functions Tests
  // ============================================
  describe('SearchResults Utility Functions', () => {
    it('should format time correctly (ms)', async () => {
      createWrapper()

      expect(wrapper.vm.formatTime(500)).toBe('500ms')
      expect(wrapper.vm.formatTime(1500)).toBe('1.50s')
    })

    it('should return correct similarity labels', async () => {
      createWrapper()

      expect(wrapper.vm.getSimilarityLabel(0.9)).toBe('非常相似')
      expect(wrapper.vm.getSimilarityLabel(0.7)).toBe('相似')
      expect(wrapper.vm.getSimilarityLabel(0.5)).toBe('一般')
      expect(wrapper.vm.getSimilarityLabel(0.3)).toBe('较低')
    })

    it('should return correct source icons', async () => {
      createWrapper()

      expect(wrapper.vm.getSourceIcon('keyword')).toBe('🔤')
      expect(wrapper.vm.getSourceIcon('semantic')).toBe('🧠')
      expect(wrapper.vm.getSourceIcon('other')).toBe('📷')
    })

    it('should return correct source labels', async () => {
      createWrapper()

      expect(wrapper.vm.getSourceLabel('keyword')).toBe('关键词')
      expect(wrapper.vm.getSourceLabel('semantic')).toBe('语义')
      expect(wrapper.vm.getSourceLabel('custom')).toBe('custom')
    })
  })
})
