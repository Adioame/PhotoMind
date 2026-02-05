/**
 * PhotoMind - 搜索建议服务
 *
 * 功能：
 * 1. 搜索历史记录
 * 2. 热门搜索词
 * 3. 搜索自动补全
 * 4. 基于照片内容的建议
 */
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export interface SearchSuggestion {
  text: string
  type: 'history' | 'popular' | 'tag' | 'place' | 'person' | 'time'
  count?: number
  timestamp?: number
}

export interface SearchHistoryItem {
  query: string
  timestamp: number
  resultCount: number
}

export class SearchSuggestionService {
  private dataDir: string
  private historyFile: string
  private history: SearchHistoryItem[]
  private maxHistoryLength: number

  constructor() {
    this.dataDir = resolve(__dirname, '../../data')
    this.historyFile = resolve(this.dataDir, 'search-history.json')
    this.history = []
    this.maxHistoryLength = 50
    this.loadHistory()
  }

  /**
   * 加载搜索历史
   */
  private loadHistory(): void {
    try {
      if (existsSync(this.historyFile)) {
        const content = readFileSync(this.historyFile, 'utf-8')
        this.history = JSON.parse(content)
      }
    } catch (error) {
      console.error('加载搜索历史失败:', error)
      this.history = []
    }
  }

  /**
   * 保存搜索历史
   */
  private saveHistory(): void {
    try {
      const dir = dirname(this.historyFile)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2))
    } catch (error) {
      console.error('保存搜索历史失败:', error)
    }
  }

  /**
   * 添加搜索记录
   */
  addToHistory(query: string, resultCount: number = 0): void {
    // 移除重复项
    this.history = this.history.filter(item => item.query.toLowerCase() !== query.toLowerCase())

    // 添加到开头
    this.history.unshift({
      query,
      timestamp: Date.now(),
      resultCount
    })

    // 限制长度
    if (this.history.length > this.maxHistoryLength) {
      this.history = this.history.slice(0, this.maxHistoryLength)
    }

    this.saveHistory()
  }

  /**
   * 获取搜索历史
   */
  getHistory(limit: number = 10): SearchHistoryItem[] {
    return this.history.slice(0, limit)
  }

  /**
   * 清空搜索历史
   */
  clearHistory(): void {
    this.history = []
    this.saveHistory()
  }

  /**
   * 获取搜索建议
   */
  async getSuggestions(query: string): Promise<SearchSuggestion[]> {
    if (!query.trim()) {
      // 空查询返回历史记录
      return this.getHistory(5).map(item => ({
        text: item.query,
        type: 'history' as const,
        timestamp: item.timestamp
      }))
    }

    const suggestions: SearchSuggestion[] = []
    const lowerQuery = query.toLowerCase()

    // 1. 从历史中匹配
    const historyMatches = this.history
      .filter(item => item.query.toLowerCase().includes(lowerQuery))
      .slice(0, 3)
      .map(item => ({
        text: item.query,
        type: 'history' as const,
        timestamp: item.timestamp
      }))
    suggestions.push(...historyMatches)

    // 2. TODO: 从地点中匹配（需要从数据库获取）
    // 建议包含常见地点
    const commonPlaces = ['日本', '东京', '北京', '上海', '新疆', '家里']
    for (const place of commonPlaces) {
      if (place.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: place,
          type: 'place',
          count: 0
        })
      }
    }

    // 3. 时间相关建议
    const timePatterns = [
      `${new Date().getFullYear()}年`,
      '去年',
      '前年',
      '今年夏天',
      '去年冬天'
    ]
    for (const pattern of timePatterns) {
      if (pattern.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: pattern,
          type: 'time'
        })
      }
    }

    // 4. 人物相关建议
    const peoplePatterns = ['爸爸', '妈妈', '儿子', '女儿', '全家福']
    for (const person of peoplePatterns) {
      if (person.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: person,
          type: 'person',
          count: 0
        })
      }
    }

    // 5. 场景标签建议
    const tagPatterns = ['旅行', '美食', '风景', '人像', '宠物', '日落']
    for (const tag of tagPatterns) {
      if (tag.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: tag,
          type: 'tag',
          count: 0
        })
      }
    }

    return suggestions.slice(0, 8)
  }

  /**
   * 获取热门搜索
   */
  getPopularSearches(limit: number = 5): SearchSuggestion[] {
    // 基于历史频率计算热门搜索
    const frequency: Record<string, number> = {}

    for (const item of this.history) {
      frequency[item.query] = (frequency[item.query] || 0) + 1
    }

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([text, count]) => ({
        text,
        type: 'popular' as const,
        count
      }))
  }

  /**
   * 获取搜索建议（用于自动补全）
   */
  async getAutocomplete(query: string): Promise<string[]> {
    if (!query.trim()) {
      return []
    }

    const suggestions = await this.getSuggestions(query)
    return suggestions.map(s => s.text)
  }

  /**
   * 获取所有唯一的搜索词
   */
  getAllSearchTerms(): string[] {
    const terms = new Set<string>()

    // 从历史中添加
    for (const item of this.history) {
      terms.add(item.query)
    }

    // 添加常见搜索词
    const commonTerms = [
      '日本', '东京', '北海道', '大阪',
      '北京', '上海', '新疆',
      '2015', '2016', '2017', '2018', '2019', '2020',
      '旅行', '美食', '风景', '人像',
      '爸爸', '妈妈', '儿子', '全家福'
    ]

    for (const term of commonTerms) {
      terms.add(term)
    }

    return Array.from(terms).sort()
  }

  /**
   * 导出搜索历史
   */
  exportHistory(): string {
    return JSON.stringify(this.history, null, 2)
  }

  /**
   * 导入搜索历史
   */
  importHistory(jsonData: string): boolean {
    try {
      const imported = JSON.parse(jsonData)
      if (Array.isArray(imported)) {
        this.history = imported.slice(0, this.maxHistoryLength)
        this.saveHistory()
        return true
      }
      return false
    } catch (error) {
      console.error('导入搜索历史失败:', error)
      return false
    }
  }
}

export const suggestionService = new SearchSuggestionService()
