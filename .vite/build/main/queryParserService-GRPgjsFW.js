import { a as getConfigService } from "./index-BYkeoRh9.js";
class QueryParserService {
  configService = getConfigService();
  cache = /* @__PURE__ */ new Map();
  CACHE_TTL = 5 * 60 * 1e3;
  // 5分钟
  CACHE_MAX_SIZE = 500;
  /**
   * 解析用户查询
   */
  async parse(query) {
    const cached = this.getCachedResult(query);
    if (cached) {
      return cached;
    }
    if (this.configService.isLLMConfigured()) {
      try {
        const result2 = await this.parseWithLLM(query);
        this.cacheResult(query, result2);
        return result2;
      } catch (error) {
        console.error("[QueryParser] LLM 解析失败，降级到规则匹配", error);
      }
    }
    const result = this.parseWithRules(query);
    this.cacheResult(query, result);
    return result;
  }
  /**
   * 使用 LLM 解析查询
   */
  async parseWithLLM(query) {
    this.configService.getLLMConfig();
    const prompt = this.buildPrompt(query);
    const response = await this.callLLM(prompt, 3e3);
    if (!response.success) {
      throw new Error(response.error);
    }
    return this.parseLLMResponse(query, response.result);
  }
  /**
   * 构建 LLM Prompt
   */
  buildPrompt(query) {
    return `分析以下照片搜索查询，提取结构化信息：

查询: "${query}"

请以 JSON 格式返回分析结果：
{
  "type": "keyword|semantic|time|location|people|mixed",
  "confidence": 0.0-1.0,
  "entities": [
    {"type": "person|time|location|event|object|emotion", "value": "具体内容", "confidence": 0.0-1.0}
  ],
  "refinedQuery": "优化后的搜索查询",
  "searchHints": [
    {"type": "year|month|place|person|album|keyword", "value": "提示信息"}
  ]
}

只返回 JSON，不要其他内容。`;
  }
  /**
   * 调用 LLM API
   */
  async callLLM(prompt, timeout) {
    const config = this.configService.getLLMConfig();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.1
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `API 错误: ${error}` };
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      return { success: true, result: content };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误"
      };
    }
  }
  /**
   * 解析 LLM 响应
   */
  parseLLMResponse(original, response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          original,
          parsed: {
            type: parsed.type || "mixed",
            confidence: parsed.confidence || 0.5,
            entities: parsed.entities || [],
            refinedQuery: parsed.refinedQuery || original,
            searchHints: parsed.searchHints || []
          },
          timestamp: Date.now(),
          fallbackUsed: false
        };
      }
    } catch (error) {
      console.error("[QueryParser] JSON 解析失败", error);
    }
    return this.parseWithRules(original);
  }
  /**
   * 规则匹配解析
   */
  parseWithRules(query) {
    const lowerQuery = query.toLowerCase();
    const entities = [];
    const searchHints = [];
    const yearPattern = /(?:在|于|年份)?(\d{4})年?/;
    const monthPattern = /(\d{1,2})月/;
    const yearMatch = query.match(yearPattern);
    const monthMatch = query.match(monthPattern);
    if (yearMatch) {
      entities.push({
        type: "time",
        value: yearMatch[1],
        confidence: 0.9
      });
      searchHints.push({ type: "year", value: yearMatch[1] });
    }
    if (monthMatch) {
      entities.push({
        type: "time",
        value: `${yearMatch?.[1] || "未知"}-${monthMatch[1]}`,
        confidence: 0.8
      });
      searchHints.push({ type: "month", value: monthMatch[1] });
    }
    const personPatterns = [
      { pattern: /(?:和|跟|与|带)\s*(.+?)\s*(?:的|合影|照片|图片)/, extract: 1 },
      { pattern: /(.+?)\s*(?:妈妈|爸爸|朋友|家人|同事|宝贝)/, extract: 1 },
      { pattern: /(?:和|跟|与|带)\s*(.+)/, extract: 1 }
    ];
    for (const { pattern, extract } of personPatterns) {
      const match = query.match(pattern);
      if (match && match[extract]) {
        const value = match[extract].trim();
        if (value.length > 0 && value.length < 20) {
          entities.push({
            type: "person",
            value,
            confidence: 0.7
          });
          searchHints.push({ type: "person", value });
          break;
        }
      }
    }
    const locations = ["日本", "美国", "欧洲", "国内", "北京", "上海", "东京", "纽约", "巴黎", "海边", "山", "城市", "乡村"];
    for (const location of locations) {
      if (lowerQuery.includes(location)) {
        entities.push({
          type: "location",
          value: location,
          confidence: 0.7
        });
        searchHints.push({ type: "place", value: location });
        break;
      }
    }
    const emotionWords = ["好看", "美丽", "漂亮", "温暖", "开心", "快乐", "幸福", "悲伤", "浪漫", "可爱"];
    const hasEmotion = emotionWords.some((word) => lowerQuery.includes(word));
    let type = "keyword";
    if (entities.length > 0) {
      type = "mixed";
    } else if (hasEmotion) {
      type = "semantic";
    }
    const keywords = this.extractKeywords(query);
    return {
      original: query,
      parsed: {
        type,
        confidence: entities.length > 0 ? 0.8 : 0.5,
        entities,
        refinedQuery: keywords.join(" "),
        searchHints
      },
      timestamp: Date.now(),
      fallbackUsed: true
    };
  }
  /**
   * 提取关键词
   */
  extractKeywords(query) {
    const stopWords = ["的", "是", "在", "和", "与", "跟", "我", "你", "他", "她", "它", "这", "那", "照片", "图片", "影像", "拍摄", "拍"];
    return query.toLowerCase().split(/\s+/).filter((word) => word.length > 1 && !stopWords.includes(word));
  }
  /**
   * 缓存查询结果
   */
  cacheResult(query, result) {
    this.cache.set(query, result);
    if (this.cache.size > this.CACHE_MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }
  /**
   * 获取缓存结果
   */
  getCachedResult(query) {
    const cached = this.cache.get(query);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached;
    }
    if (cached) {
      this.cache.delete(query);
    }
    return null;
  }
  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear();
  }
  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.CACHE_MAX_SIZE
    };
  }
}
const queryParserService = new QueryParserService();
export {
  QueryParserService,
  queryParserService
};
//# sourceMappingURL=queryParserService-GRPgjsFW.js.map
