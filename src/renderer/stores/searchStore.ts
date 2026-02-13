/**
 * PhotoMind - Search Store
 *
 * Enhanced search store with:
 * - Real-time suggestions
 * - Search modes (keyword/semantic/hybrid)
 * - Search history
 * - Party Mode support
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type SearchMode = 'keyword' | 'semantic' | 'hybrid'

export interface SearchSuggestion {
  text: string
  type: 'person' | 'keyword' | 'location' | 'time' | 'album'
  icon?: string
}

export interface SearchState {
  query: string
  mode: SearchMode
  activeAgents: string[]
  isSearching: boolean
  searchProgress: number
  suggestions: SearchSuggestion[]
  recentSearches: string[]
  results: any[]
  totalResults: number
  searchTime: number
  hasSearched: boolean
  filters: Record<string, any>
}

export const useSearchStore = defineStore('search', {
  state: (): SearchState => ({
    query: '',
    mode: 'hybrid',
    activeAgents: ['keyword', 'semantic', 'people'],
    isSearching: false,
    searchProgress: 0,
    suggestions: [],
    recentSearches: [],
    results: [],
    totalResults: 0,
    searchTime: 0,
    hasSearched: false,
    filters: {}
  }),

  getters: {
    canSearch: (state): boolean => {
      return state.query.trim().length > 0 && !state.isSearching
    },

    hasSuggestions: (state): boolean => {
      return state.suggestions.length > 0 || state.recentSearches.length > 0
    },

    activeAgentCount: (state): number => {
      return state.activeAgents.length
    },

    searchParams: (state) => ({
      query: state.query,
      mode: state.mode,
      agents: state.activeAgents,
      filters: state.filters
    })
  },

  actions: {
    // 设置查询
    setQuery(query: string) {
      this.query = query

      // 加载建议（防抖在调用处处理）
      if (query.length > 1) {
        this.loadSuggestions(query)
      } else {
        this.suggestions = []
      }
    },

    // 设置搜索模式
    setMode(mode: SearchMode) {
      this.mode = mode
    },

    // 切换代理
    toggleAgent(agent: string) {
      const index = this.activeAgents.indexOf(agent)
      if (index === -1) {
        // 至少保留一个代理
        if (this.activeAgents.length >= 1) {
          this.activeAgents.push(agent)
        }
      } else if (this.activeAgents.length > 1) {
        this.activeAgents.splice(index, 1)
      }
    },

    // 设置活跃代理
    setActiveAgents(agents: string[]) {
      if (agents.length > 0) {
        this.activeAgents = agents
      }
    },

    // 加载搜索建议
    async loadSuggestions(query: string) {
      try {
        // 并行加载多种建议
        const [keywordSuggestions, personSuggestions] = await Promise.all([
          (window as any).photoAPI.keywordSearch.suggestions?.(query) || [],
          (window as any).photoAPI.people.getSuggestions?.(query, 5) || []
        ])

        // 合并建议
        const suggestions: SearchSuggestion[] = []

        // 添加人物建议
        for (const p of personSuggestions) {
          suggestions.push({
            text: p.name,
            type: 'person',
            icon: 'person'
          })
        }

        // 添加关键词建议
        for (const s of keywordSuggestions) {
          if (!suggestions.find(sg => sg.text === s)) {
            suggestions.push({
              text: s,
              type: 'keyword',
              icon: 'search'
            })
          }
        }

        this.suggestions = suggestions.slice(0, 10)
      } catch (error) {
        console.error('加载建议失败:', error)
      }
    },

    // 执行搜索
    async search(newQuery?: string) {
      if (newQuery) {
        this.query = newQuery
      }

      if (!this.query.trim()) {
        return { results: [], total: 0 }
      }

      this.isSearching = true
      this.searchProgress = 0
      this.hasSearched = true

      const startTime = performance.now()

      try {
        // 根据模式选择搜索方法
        let result

        switch (this.mode) {
          case 'keyword':
            result = await (window as any).photoAPI.keywordSearch.search({
              query: this.query,
              limit: 50
            })
            break
          case 'semantic':
            result = await (window as any).photoAPI.globalSearch.quick?.(this.query, 50) || {
              results: [],
              total: 0
            }
            break
          case 'hybrid':
          default:
            // 混合搜索
            result = await (window as any).photoAPI.hybridSearch.searchWithIntent?.(this.query) || {
              results: [],
              total: 0
            }
            break
        }

        this.results = result.results || []
        this.totalResults = result.total || 0
        this.searchTime = Math.round(performance.now() - startTime)
        this.searchProgress = 100

        // 添加到历史
        this.addToHistory(this.query)

        return result
      } catch (error) {
        console.error('搜索失败:', error)
        this.results = []
        this.totalResults = 0
        return { results: [], total: 0 }
      } finally {
        this.isSearching = false
      }
    },

    // 执行混合搜索（带意图）
    async searchWithIntent() {
      if (!this.query.trim()) {
        return { results: [], total: 0 }
      }

      this.isSearching = true
      this.searchProgress = 0
      this.hasSearched = true

      const startTime = performance.now()

      try {
        const result = await (window as any).photoAPI.hybridSearch.searchWithIntent(this.query)

        this.results = result.results || []
        this.totalResults = result.total || 0
        this.searchTime = Math.round(performance.now() - startTime)
        this.searchProgress = 100

        // 添加到历史
        this.addToHistory(this.query)

        return result
      } catch (error) {
        console.error('混合搜索失败:', error)
        // 降级到普通搜索
        return this.search()
      } finally {
        this.isSearching = false
      }
    },

    // 添加到搜索历史
    addToHistory(query: string) {
      if (!query.trim()) return

      // 移除重复
      this.recentSearches = this.recentSearches.filter(h => h !== query)

      // 添加到开头
      this.recentSearches.unshift(query)

      // 限制历史数量
      if (this.recentSearches.length > 20) {
        this.recentSearches = this.recentSearches.slice(0, 20)
      }

      // 保存到本地存储
      try {
        localStorage.setItem('photoMind_search_history', JSON.stringify(this.recentSearches))
      } catch {
        // 忽略存储错误
      }
    },

    // 加载历史
    loadHistory() {
      try {
        const saved = localStorage.getItem('photoMind_search_history')
        if (saved) {
          this.recentSearches = JSON.parse(saved)
        }
      } catch {
        this.recentSearches = []
      }
    },

    // 清空历史
    clearHistory() {
      this.recentSearches = []
      try {
        localStorage.removeItem('photoMind_search_history')
      } catch {
        // 忽略
      }
    },

    // 选择建议
    selectSuggestion(suggestion: string | SearchSuggestion) {
      const text = typeof suggestion === 'string' ? suggestion : suggestion.text
      this.query = text
      this.search()
    },

    // 设置筛选器
    setFilters(filters: Record<string, any>) {
      this.filters = filters
    },

    // 清空筛选器
    clearFilters() {
      this.filters = {}
    },

    // 清空搜索
    clearSearch() {
      this.query = ''
      this.suggestions = []
      this.results = []
      this.totalResults = 0
      this.hasSearched = false
      this.searchTime = 0
      this.searchProgress = 0
      this.filters = {}
    },

    // 重置状态
    reset() {
      this.query = ''
      this.mode = 'hybrid'
      this.activeAgents = ['keyword', 'semantic', 'people']
      this.suggestions = []
      this.results = []
      this.totalResults = 0
      this.hasSearched = false
      this.filters = {}
    }
  }
})
