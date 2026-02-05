/**
 * PhotoMind - 搜索服务
 *
 * 处理自然语言搜索，将查询转换为数据库查询
 */
import { PhotoDatabase } from '../database/db.js'
import { getConfigService } from './configService.js'

export class SearchService {
  private database: PhotoDatabase
  private configService: ReturnType<typeof getConfigService>

  constructor(database: PhotoDatabase) {
    this.database = database
    this.configService = getConfigService()
  }

  async search(query: string, filters?: any): Promise<{ results: any[]; total: number }> {
    try {
      // 1. 使用 LLM 理解查询意图
      const parsedQuery = await this.parseQuery(query)

      // 2. 构建搜索条件
      const searchFilters = { ...filters, ...parsedQuery }

      // 3. 执行搜索
      const results = this.database.searchPhotos(query, searchFilters)

      return {
        results,
        total: results.length
      }
    } catch (error) {
      console.error('搜索失败:', error)
      return { results: [], total: 0 }
    }
  }

  /**
   * 使用 LLM 解析自然语言查询
   */
  private async parseQuery(query: string): Promise<any> {
    const llmConfig = this.configService.getLLMConfig()

    // 如果没有配置 LLM，使用规则解析
    if (!this.configService.isLLMConfigured()) {
      console.log('LLM 未配置，使用规则解析')
      return this.parseQueryByRules(query)
    }

    try {
      const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmConfig.apiKey}`
        },
        body: JSON.stringify({
          model: llmConfig.model,
          messages: [
            {
              role: 'system',
              content: `你是一个图片搜索助手。用户会用自然语言描述想要找的照片。
请将用户描述转换为结构化的搜索条件。

支持的条件：
- 时间：年份（如 2015）、季节（如去年夏天）
- 人物：人名、数量（如一家四口）
- 地点：国家/城市/地标（如日本、新疆）

输出 JSON 格式：
{
  "time_range": {"year": null, "season": null},
  "people": ["人物1", "人物2"],
  "location": {"keywords": [], "description": null},
  "tags": ["场景标签"],
  "confidence": 0.8}`
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      })

      const data = await response.json() as any
      const content = data.choices?.[0]?.message?.content || '{}'

      // 尝试解析 JSON
      try {
        const parsed = JSON.parse(content)
        return this.convertToFilters(parsed)
      } catch {
        return this.parseQueryByRules(query)
      }
    } catch (error) {
      console.error('LLM 查询失败:', error)
      return this.parseQueryByRules(query)
    }
  }

  /**
   * 检查搜索服务是否已配置
   */
  isConfigured(): boolean {
    return this.configService.isLLMConfigured()
  }

  /**
   * 获取当前配置状态
   */
  getConfigStatus(): { configured: boolean; provider: string } {
    const config = this.configService.getLLMConfig()
    return {
      configured: this.configService.isLLMConfigured(),
      provider: config.provider
    }
  }

  /**
   * 规则解析（备用方案）
   */
  private parseQueryByRules(query: string): any {
    const filters: any = {
      people: [],
      location: { keywords: [] },
      time_range: {}
    }

    // 提取年份
    const yearMatch = query.match(/(19|20)\d{2}/)
    if (yearMatch) {
      filters.time_range = { year: parseInt(yearMatch[0]) }
    }

    // 提取季节
    const seasons = ['春天', '夏天', '秋天', '冬天']
    for (const season of seasons) {
      if (query.includes(season)) {
        filters.time_range.season = season
        break
      }
    }

    // 提取地点关键词
    const locationKeywords = ['日本', '北京', '上海', '新疆', '东京', '北海道', '大阪']
    for (const keyword of locationKeywords) {
      if (query.includes(keyword)) {
        filters.location.keywords.push(keyword)
      }
    }

    // 提取人物关系
    const peoplePatterns = [
      { pattern: /一家四口/, people: ['爸爸', '妈妈', '我', '儿子'] },
      { pattern: /爸爸妈妈/, people: ['爸爸', '妈妈'] },
      { pattern: /儿子/, people: ['儿子'] },
      { pattern: /合影/, people: [] },
      { pattern: /合照/, people: [] }
    ]

    for (const { pattern, people } of peoplePatterns) {
      if (pattern.test(query)) {
        filters.people.push(...people)
      }
    }

    return filters
  }

  /**
   * 根据人物搜索照片
   */
  async searchByPerson(personName: string): Promise<{ results: any[]; total: number }> {
    try {
      const photos = this.database.searchPhotosByPerson(personName)
      return {
        results: photos,
        total: photos.length
      }
    } catch (error) {
      console.error('人物搜索失败:', error)
      return { results: [], total: 0 }
    }
  }

  /**
   * 搜索人物
   */
  async searchPeople(query: string): Promise<any[]> {
    try {
      return this.database.searchPersons(query)
    } catch (error) {
      console.error('搜索人物失败:', error)
      return []
    }
  }

  /**
   * 转换 LLM 输出为搜索过滤器
   */
  private convertToFilters(parsed: any): any {
    const filters: any = {
      people: [],
      location: { keywords: [] },
      time_range: {}
    }

    if (parsed.time_range?.year) {
      filters.time_range = { year: parsed.time_range.year }
    }

    if (parsed.people) {
      filters.people = Array.isArray(parsed.people) ? parsed.people : [parsed.people]
    }

    if (parsed.location?.keywords) {
      filters.location.keywords = parsed.location.keywords
    }

    if (parsed.location?.description) {
      filters.location.keywords.push(parsed.location.description)
    }

    if (parsed.tags) {
      filters.tags = Array.isArray(parsed.tags) ? parsed.tags : [parsed.tags]
    }

    return filters
  }

  /**
   * 智能推荐相册
   */
  async getSmartAlbums(): Promise<any[]> {
    const albums: any[] = []

    // 获取热门地点
    const places = this.database.getAllPlaces()
    if (places.length > 0) {
      albums.push({
        id: 'smart-places',
        name: '按地点浏览',
        type: 'smart',
        items: places.slice(0, 6)
      })
    }

    // 获取人物
    const people = this.database.getAllPersons()
    if (people.length > 0) {
      albums.push({
        id: 'smart-people',
        name: '按人物浏览',
        type: 'smart',
        items: people.slice(0, 6)
      })
    }

    // 近年回忆
    const currentYear = new Date().getFullYear()
    const years = [currentYear - 1, currentYear - 2, currentYear - 3]
    albums.push({
      id: 'smart-years',
      name: '历年回忆',
      type: 'smart',
      items: years.map(year => ({
        year,
        name: `${year}年`
      }))
    })

    return albums
  }
}
