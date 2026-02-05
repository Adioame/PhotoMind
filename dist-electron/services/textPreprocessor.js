export class TextPreprocessor {
    preprocess(text) {
        return {
            original: text,
            processed: this.cleanText(text),
            keywords: this.extractKeywords(text),
            language: this.detectLanguage(text)
        };
    }
    cleanText(text) {
        return text
            .replace(/[^\w\s\u4e00-\u9fff\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    extractKeywords(text) {
        return text
            .split(/[\s,]+/)
            .map(w => w.trim())
            .filter(w => w.length > 0);
    }
    detectLanguage(text) {
        const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
        const total = chineseCount + englishCount;
        if (total === 0)
            return 'en';
        const chineseRatio = chineseCount / total;
        const englishRatio = englishCount / total;
        if (chineseRatio > 0.3 && englishRatio > 0.3)
            return 'mixed';
        if (chineseRatio > 0.5)
            return 'zh';
        return 'en';
    }
    expandQuery(text) {
        const queries = [text];
        const expansions = {
            '照片': ['photo', '图片', 'image'],
            '家庭': ['family', '家人', 'home'],
            '朋友': ['friends', 'friend', '友情'],
            '旅行': ['travel', 'trip', 'journey', '旅游'],
            '日落': ['sunset', '夕陽'],
            '日出': ['sunrise', '日出', '晨曦'],
            '风景': ['scenery', 'landscape', '景色', '山水'],
            '美食': ['food', 'delicious', '好吃', '餐饮']
        };
        for (const [key, values] of Object.entries(expansions)) {
            if (text.toLowerCase().includes(key.toLowerCase())) {
                for (const value of values) {
                    queries.push(`${key} ${value}`);
                }
            }
        }
        return queries;
    }
}
export const textPreprocessor = new TextPreprocessor();
//# sourceMappingURL=textPreprocessor.js.map