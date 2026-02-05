/**
 * PhotoMind - 文本预处理服务
 *
 * 功能：
 * 1. 文本清洗
 * 2. 关键词提取
 * 3. 语言检测
 */
export interface TextQuery {
  original: string
  processed: string
  keywords: string[]
  language: 'zh' | 'en' | 'mixed'
}

export class TextPreprocessor {
  /**
   * 预处理搜索文本
   */
  preprocess(text: string): TextQuery {
    return {
      original: text,
      processed: this.cleanText(text),
      keywords: this.extractKeywords(text),
      language: this.detectLanguage(text)
    }
  }

  /**
   * 清洗文本
   */
  private cleanText(text: string): string {
    // 移除特殊字符，保留中英文、数字、空格、连字符
    return text
      .replace(/[^\w\s\u4e00-\u9fff\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 简单关键词提取 - 按空格和逗号分词
    return text
      .split(/[\s,]+/)
      .map(w => w.trim())
      .filter(w => w.length > 0)
  }

  /**
   * 检测语言
   */
  private detectLanguage(text: string): 'zh' | 'en' | 'mixed' {
    const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const englishCount = (text.match(/[a-zA-Z]/g) || []).length
    const total = chineseCount + englishCount

    if (total === 0) return 'en'

    const chineseRatio = chineseCount / total
    const englishRatio = englishCount / total

    if (chineseRatio > 0.3 && englishRatio > 0.3) return 'mixed'
    if (chineseRatio > 0.5) return 'zh'
    return 'en'
  }

  /**
   * 扩展搜索词（同义词等）
   */
  expandQuery(text: string): string[] {
    const queries: string[] = [text]

    // 常见中文扩展
    const expansions: Record<string, string[]> = {
      '照片': ['photo', '图片', 'image'],
      '家庭': ['family', '家人', 'home'],
      '朋友': ['friends', 'friend', '友情'],
      '旅行': ['travel', 'trip', 'journey', '旅游'],
      '日落': ['sunset', '夕陽'],
      '日出': ['sunrise', '日出', '晨曦'],
      '风景': ['scenery', 'landscape', '景色', '山水'],
      '美食': ['food', 'delicious', '好吃', '餐饮']
    }

    // 检查是否有可扩展的词
    for (const [key, values] of Object.entries(expansions)) {
      if (text.toLowerCase().includes(key.toLowerCase())) {
        for (const value of values) {
          queries.push(`${key} ${value}`)
        }
      }
    }

    return queries
  }
}

export const textPreprocessor = new TextPreprocessor()
