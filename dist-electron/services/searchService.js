import { getConfigService } from './configService.js';
export class SearchService {
    constructor(database) {
        this.database = database;
        this.configService = getConfigService();
    }
    async search(query, filters) {
        try {
            const parsedQuery = await this.parseQuery(query);
            const searchFilters = { ...filters, ...parsedQuery };
            const results = this.database.searchPhotos(query, searchFilters);
            return {
                results,
                total: results.length
            };
        }
        catch (error) {
            console.error('搜索失败:', error);
            return { results: [], total: 0 };
        }
    }
    async parseQuery(query) {
        const llmConfig = this.configService.getLLMConfig();
        if (!this.configService.isLLMConfigured()) {
            console.log('LLM 未配置，使用规则解析');
            return this.parseQueryByRules(query);
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
            });
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '{}';
            try {
                const parsed = JSON.parse(content);
                return this.convertToFilters(parsed);
            }
            catch {
                return this.parseQueryByRules(query);
            }
        }
        catch (error) {
            console.error('LLM 查询失败:', error);
            return this.parseQueryByRules(query);
        }
    }
    isConfigured() {
        return this.configService.isLLMConfigured();
    }
    getConfigStatus() {
        const config = this.configService.getLLMConfig();
        return {
            configured: this.configService.isLLMConfigured(),
            provider: config.provider
        };
    }
    parseQueryByRules(query) {
        const filters = {
            people: [],
            location: { keywords: [] },
            time_range: {}
        };
        const yearMatch = query.match(/(19|20)\d{2}/);
        if (yearMatch) {
            filters.time_range = { year: parseInt(yearMatch[0]) };
        }
        const seasons = ['春天', '夏天', '秋天', '冬天'];
        for (const season of seasons) {
            if (query.includes(season)) {
                filters.time_range.season = season;
                break;
            }
        }
        const locationKeywords = ['日本', '北京', '上海', '新疆', '东京', '北海道', '大阪'];
        for (const keyword of locationKeywords) {
            if (query.includes(keyword)) {
                filters.location.keywords.push(keyword);
            }
        }
        const peoplePatterns = [
            { pattern: /一家四口/, people: ['爸爸', '妈妈', '我', '儿子'] },
            { pattern: /爸爸妈妈/, people: ['爸爸', '妈妈'] },
            { pattern: /儿子/, people: ['儿子'] },
            { pattern: /合影/, people: [] },
            { pattern: /合照/, people: [] }
        ];
        for (const { pattern, people } of peoplePatterns) {
            if (pattern.test(query)) {
                filters.people.push(...people);
            }
        }
        return filters;
    }
    async searchByPerson(personName) {
        try {
            const photos = this.database.searchPhotosByPerson(personName);
            return {
                results: photos,
                total: photos.length
            };
        }
        catch (error) {
            console.error('人物搜索失败:', error);
            return { results: [], total: 0 };
        }
    }
    async searchPeople(query) {
        try {
            return this.database.searchPersons(query);
        }
        catch (error) {
            console.error('搜索人物失败:', error);
            return [];
        }
    }
    convertToFilters(parsed) {
        const filters = {
            people: [],
            location: { keywords: [] },
            time_range: {}
        };
        if (parsed.time_range?.year) {
            filters.time_range = { year: parsed.time_range.year };
        }
        if (parsed.people) {
            filters.people = Array.isArray(parsed.people) ? parsed.people : [parsed.people];
        }
        if (parsed.location?.keywords) {
            filters.location.keywords = parsed.location.keywords;
        }
        if (parsed.location?.description) {
            filters.location.keywords.push(parsed.location.description);
        }
        if (parsed.tags) {
            filters.tags = Array.isArray(parsed.tags) ? parsed.tags : [parsed.tags];
        }
        return filters;
    }
    async getSmartAlbums() {
        const albums = [];
        const places = this.database.getAllPlaces();
        if (places.length > 0) {
            albums.push({
                id: 'smart-places',
                name: '按地点浏览',
                type: 'smart',
                items: places.slice(0, 6)
            });
        }
        const people = this.database.getAllPersons();
        if (people.length > 0) {
            albums.push({
                id: 'smart-people',
                name: '按人物浏览',
                type: 'smart',
                items: people.slice(0, 6)
            });
        }
        const currentYear = new Date().getFullYear();
        const years = [currentYear - 1, currentYear - 2, currentYear - 3];
        albums.push({
            id: 'smart-years',
            name: '历年回忆',
            type: 'smart',
            items: years.map(year => ({
                year,
                name: `${year}年`
            }))
        });
        return albums;
    }
}
//# sourceMappingURL=searchService.js.map