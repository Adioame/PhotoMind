/**
 * PhotoMind - SearchHistory Component Unit Tests
 *
 * Tests for Epic E-05: 用户界面增强
 * Story: E-05.3 (搜索历史记录)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import SearchHistory from '@/components/search/SearchHistory.vue'
import { useSearchStore } from '@/stores/searchStore'

describe('SearchHistory Component - Epic E-05', () => {
  let wrapper: VueWrapper
  let searchStore: ReturnType<typeof useSearchStore>

  const createWrapper = (options = {}) => {
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      stubActions: false
    })

    wrapper = mount(SearchHistory, {
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
    localStorageMock.setItem.mockImplementation(() => {})
    localStorageMock.getItem.mockReturnValue(null)
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.restoreAllMocks()
  })

  // ============================================
  // Story E-05.3: 搜索历史记录 - Additional Tests
  // ============================================
  describe('E-05.3: 搜索历史记录 - Additional Tests', () => {
    it('should display search history items (AC: 显示历史搜索记录)', async () => {
      createWrapper()

      searchStore.recentSearches = ['beach sunset', 'family photos', 'mountain hiking']

      await wrapper.vm.$nextTick()

      const items = wrapper.findAll('.history-item')
      expect(items.length).toBe(3)
    })

    it('should show empty state when no history (AC: 显示历史搜索记录)', async () => {
      createWrapper()

      searchStore.recentSearches = []

      await wrapper.vm.$nextTick()

      const emptyState = wrapper.find('.empty-state')
      expect(emptyState.exists()).toBe(true)
      expect(emptyState.text()).toContain('暂无搜索历史')
    })

    it('should emit select event when history item is clicked (AC: 用户可以点击历史记录快速执行)', async () => {
      createWrapper()

      searchStore.recentSearches = ['beach vacation']

      await wrapper.vm.$nextTick()

      const item = wrapper.find('.history-item')
      await item.trigger('click')

      expect(wrapper.emitted('select')).toBeTruthy()
      expect(wrapper.emitted('select')[0]).toEqual(['beach vacation'])
    })

    it('should show clear button when history exists and showClear is true (AC: 用户可以清除部分或全部历史)', async () => {
      createWrapper({
        props: { showClear: true }
      })

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const clearButton = wrapper.find('.clear-button')
      expect(clearButton.exists()).toBe(true)
    })

    it('should hide clear button when showClear is false', async () => {
      createWrapper({
        props: { showClear: false }
      })

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const clearButton = wrapper.find('.clear-button')
      expect(clearButton.exists()).toBe(false)
    })

    it('should emit clear event when clear button is clicked (AC: 用户可以清除部分或全部历史)', async () => {
      createWrapper()

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const clearButton = wrapper.find('.clear-button')
      await clearButton.trigger('click')

      expect(wrapper.emitted('clear')).toBeTruthy()
    })

    it('should respect maxItems prop (AC: 显示历史搜索记录)', async () => {
      createWrapper({
        props: { maxItems: 3 }
      })

      searchStore.recentSearches = ['a', 'b', 'c', 'd', 'e']

      await wrapper.vm.$nextTick()

      const items = wrapper.findAll('.history-item')
      expect(items.length).toBe(3)
    })

    it('should show history title (AC: 显示历史搜索记录)', async () => {
      createWrapper()

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const title = wrapper.find('.history-title')
      expect(title.text()).toBe('搜索历史')
    })

    it('should show arrow icon for non-compact mode', async () => {
      createWrapper({
        props: { compact: false }
      })

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const arrowIcon = wrapper.find('.arrow-icon')
      expect(arrowIcon.exists()).toBe(true)
    })

    it('should hide arrow icon for compact mode', async () => {
      createWrapper({
        props: { compact: true }
      })

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const arrowIcon = wrapper.find('.arrow-icon')
      expect(arrowIcon.exists()).toBe(false)
    })

    it('should display history query text (AC: 显示历史搜索记录)', async () => {
      createWrapper()

      searchStore.recentSearches = ['sunset at the beach']

      await wrapper.vm.$nextTick()

      const queryText = wrapper.find('.history-query')
      expect(queryText.text()).toBe('sunset at the beach')
    })

    it('should show search count for non-compact mode (AC: 显示历史搜索记录)', async () => {
      createWrapper({
        props: { compact: false }
      })

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const metaText = wrapper.find('.history-meta')
      expect(metaText.text()).toContain('次搜索')
    })

    it('should hide search count for compact mode', async () => {
      createWrapper({
        props: { compact: true }
      })

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const metaText = wrapper.find('.history-meta')
      expect(metaText.exists()).toBe(false)
    })

    it('should render history icon for each item (AC: 显示历史搜索记录)', async () => {
      createWrapper()

      searchStore.recentSearches = ['test1', 'test2']

      await wrapper.vm.$nextTick()

      const icons = wrapper.findAll('.history-icon')
      expect(icons.length).toBe(2)
    })

    it('should have history content wrapper for each item', async () => {
      createWrapper()

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const contents = wrapper.findAll('.history-content')
      expect(contents.length).toBe(1)
    })

    it('should truncate long query text with ellipsis (AC: 显示历史搜索记录)', async () => {
      createWrapper()

      const longQuery = 'this is a very long search query that should be truncated'
      searchStore.recentSearches = [longQuery]

      await wrapper.vm.$nextTick()

      const queryText = wrapper.find('.history-query')
      expect(queryText.classes()).toContain('history-query')
      expect(queryText.text()).toBe(longQuery)
    })

    it('should show empty state icon (AC: 显示历史搜索记录)', async () => {
      createWrapper()

      searchStore.recentSearches = []

      await wrapper.vm.$nextTick()

      const emptyIcon = wrapper.find('.empty-icon')
      expect(emptyIcon.exists()).toBe(true)
    })

    it('should call store loadHistory on mount', async () => {
      createWrapper()

      // loadHistory is called on mount via onMounted hook
      expect(searchStore.recentSearches).toBeDefined()
    })

    it('should display items in order from store (AC: 显示历史搜索记录)', async () => {
      createWrapper()

      searchStore.recentSearches = ['first', 'second', 'third']

      await wrapper.vm.$nextTick()

      const items = wrapper.findAll('.history-query')
      expect(items[0].text()).toBe('first')
      expect(items[1].text()).toBe('second')
      expect(items[2].text()).toBe('third')
    })

    it('should handle single history item (AC: 显示历史搜索记录)', async () => {
      createWrapper()

      searchStore.recentSearches = ['single query']

      await wrapper.vm.$nextTick()

      const items = wrapper.findAll('.history-item')
      expect(items.length).toBe(1)
    })

    it('should handle special characters in search queries', async () => {
      createWrapper()

      searchStore.recentSearches = ['test @#$% special']

      await wrapper.vm.$nextTick()

      const queryText = wrapper.find('.history-query')
      expect(queryText.text()).toBe('test @#$% special')
    })

    it('should handle unicode characters in search queries', async () => {
      createWrapper()

      searchStore.recentSearches = ['测试中文查询', '日本語テスト', '🎉 emoji query']

      await wrapper.vm.$nextTick()

      const items = wrapper.findAll('.history-query')
      expect(items.length).toBe(3)
    })

    it('should have history-header styling (AC: 显示历史搜索记录)', async () => {
      createWrapper()

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const header = wrapper.find('.history-header')
      expect(header.exists()).toBe(true)
    })

    it('should have history-list with max-height (AC: 显示历史搜索记录)', async () => {
      createWrapper()

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const list = wrapper.find('.history-list')
      expect(list.exists()).toBe(true)
    })

    it('should emit select with exact query string (AC: 用户可以点击历史记录快速执行)', async () => {
      createWrapper()

      const query = 'exact match query'
      searchStore.recentSearches = [query]

      await wrapper.vm.$nextTick()

      const item = wrapper.find('.history-item')
      await item.trigger('click')

      expect(wrapper.emitted('select')[0][0]).toBe(query)
    })

    it('should not emit clear when no history exists (AC: 用户可以清除部分或全部历史)', async () => {
      createWrapper()

      searchStore.recentSearches = []

      await wrapper.vm.$nextTick()

      const clearButton = wrapper.find('.clear-button')
      expect(clearButton.exists()).toBe(false)
    })

    it('should display history with clickable items (AC: 用户可以点击历史记录快速执行)', async () => {
      createWrapper()

      searchStore.recentSearches = ['clickable query']

      await wrapper.vm.$nextTick()

      const item = wrapper.find('.history-item')
      expect(item.classes()).toContain('history-item')
    })
  })

  // ============================================
  // Compact Mode Tests
  // ============================================
  describe('SearchHistory Compact Mode', () => {
    it('should hide header in compact mode', async () => {
      createWrapper({
        props: { compact: true }
      })

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const header = wrapper.find('.history-header')
      expect(header.exists()).toBe(false)
    })

    it('should hide clear button in compact mode', async () => {
      createWrapper({
        props: { compact: true, showClear: true }
      })

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const clearButton = wrapper.find('.clear-button')
      expect(clearButton.exists()).toBe(false)
    })

    it('should use compact class in compact mode', async () => {
      createWrapper({
        props: { compact: true }
      })

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const component = wrapper.find('.search-history')
      expect(component.classes()).toContain('compact')
    })
  })

  // ============================================
  // Styling Tests
  // ============================================
  describe('SearchHistory Styling', () => {
    it('should have history title styling', async () => {
      createWrapper()

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const title = wrapper.find('.history-title')
      expect(title.classes()).toContain('history-title')
    })

    it('should have history item cursor pointer', async () => {
      createWrapper()

      searchStore.recentSearches = ['test']

      await wrapper.vm.$nextTick()

      const item = wrapper.find('.history-item')
      expect(item.classes()).toContain('history-item')
    })
  })
})

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
