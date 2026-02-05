import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
export class SearchSuggestionService {
    constructor() {
        this.dataDir = resolve(__dirname, '../../data');
        this.historyFile = resolve(this.dataDir, 'search-history.json');
        this.history = [];
        this.maxHistoryLength = 50;
        this.loadHistory();
    }
    loadHistory() {
        try {
            if (existsSync(this.historyFile)) {
                const content = readFileSync(this.historyFile, 'utf-8');
                this.history = JSON.parse(content);
            }
        }
        catch (error) {
            console.error('加载搜索历史失败:', error);
            this.history = [];
        }
    }
    saveHistory() {
        try {
            const dir = dirname(this.historyFile);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
            writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2));
        }
        catch (error) {
            console.error('保存搜索历史失败:', error);
        }
    }
    addToHistory(query, resultCount = 0) {
        this.history = this.history.filter(item => item.query.toLowerCase() !== query.toLowerCase());
        this.history.unshift({
            query,
            timestamp: Date.now(),
            resultCount
        });
        if (this.history.length > this.maxHistoryLength) {
            this.history = this.history.slice(0, this.maxHistoryLength);
        }
        this.saveHistory();
    }
    getHistory(limit = 10) {
        return this.history.slice(0, limit);
    }
    clearHistory() {
        this.history = [];
        this.saveHistory();
    }
    async getSuggestions(query) {
        if (!query.trim()) {
            return this.getHistory(5).map(item => ({
                text: item.query,
                type: 'history',
                timestamp: item.timestamp
            }));
        }
        const suggestions = [];
        const lowerQuery = query.toLowerCase();
        const historyMatches = this.history
            .filter(item => item.query.toLowerCase().includes(lowerQuery))
            .slice(0, 3)
            .map(item => ({
            text: item.query,
            type: 'history',
            timestamp: item.timestamp
        }));
        suggestions.push(...historyMatches);
        const commonPlaces = ['日本', '东京', '北京', '上海', '新疆', '家里'];
        for (const place of commonPlaces) {
            if (place.toLowerCase().includes(lowerQuery)) {
                suggestions.push({
                    text: place,
                    type: 'place',
                    count: 0
                });
            }
        }
        const timePatterns = [
            `${new Date().getFullYear()}年`,
            '去年',
            '前年',
            '今年夏天',
            '去年冬天'
        ];
        for (const pattern of timePatterns) {
            if (pattern.toLowerCase().includes(lowerQuery)) {
                suggestions.push({
                    text: pattern,
                    type: 'time'
                });
            }
        }
        const peoplePatterns = ['爸爸', '妈妈', '儿子', '女儿', '全家福'];
        for (const person of peoplePatterns) {
            if (person.toLowerCase().includes(lowerQuery)) {
                suggestions.push({
                    text: person,
                    type: 'person',
                    count: 0
                });
            }
        }
        const tagPatterns = ['旅行', '美食', '风景', '人像', '宠物', '日落'];
        for (const tag of tagPatterns) {
            if (tag.toLowerCase().includes(lowerQuery)) {
                suggestions.push({
                    text: tag,
                    type: 'tag',
                    count: 0
                });
            }
        }
        return suggestions.slice(0, 8);
    }
    getPopularSearches(limit = 5) {
        const frequency = {};
        for (const item of this.history) {
            frequency[item.query] = (frequency[item.query] || 0) + 1;
        }
        return Object.entries(frequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([text, count]) => ({
            text,
            type: 'popular',
            count
        }));
    }
    async getAutocomplete(query) {
        if (!query.trim()) {
            return [];
        }
        const suggestions = await this.getSuggestions(query);
        return suggestions.map(s => s.text);
    }
    getAllSearchTerms() {
        const terms = new Set();
        for (const item of this.history) {
            terms.add(item.query);
        }
        const commonTerms = [
            '日本', '东京', '北海道', '大阪',
            '北京', '上海', '新疆',
            '2015', '2016', '2017', '2018', '2019', '2020',
            '旅行', '美食', '风景', '人像',
            '爸爸', '妈妈', '儿子', '全家福'
        ];
        for (const term of commonTerms) {
            terms.add(term);
        }
        return Array.from(terms).sort();
    }
    exportHistory() {
        return JSON.stringify(this.history, null, 2);
    }
    importHistory(jsonData) {
        try {
            const imported = JSON.parse(jsonData);
            if (Array.isArray(imported)) {
                this.history = imported.slice(0, this.maxHistoryLength);
                this.saveHistory();
                return true;
            }
            return false;
        }
        catch (error) {
            console.error('导入搜索历史失败:', error);
            return false;
        }
    }
}
export const suggestionService = new SearchSuggestionService();
//# sourceMappingURL=searchSuggestionService.js.map