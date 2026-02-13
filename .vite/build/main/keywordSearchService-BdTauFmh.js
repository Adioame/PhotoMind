import { P as PhotoDatabase } from "./index-BYkeoRh9.js";
class KeywordSearchService {
  database;
  constructor(database) {
    this.database = database || new PhotoDatabase();
  }
  /**
   * 执行关键词搜索
   */
  async search(options) {
    const {
      query,
      fields = ["file_name", "folder_path", "exif_data", "location_data"],
      fuzzy = true,
      limit = 50,
      offset = 0
    } = options;
    const keywords = this.parseKeywords(query);
    if (keywords.length === 0) {
      return { results: [], total: 0, query };
    }
    const photos = this.database.getAllPhotos();
    console.log(`[KeywordSearch] 搜索 ${photos.length} 张照片，关键词: ${keywords.join(", ")}`);
    const matched = [];
    for (const photo of photos) {
      const result = this.matchPhoto(photo, keywords, fields, fuzzy);
      if (result) {
        matched.push(result);
      }
    }
    matched.sort((a, b) => b.matchScore - a.matchScore);
    const total = matched.length;
    const pagedResults = matched.slice(offset, offset + limit);
    console.log(`[KeywordSearch] 找到 ${total} 个匹配结果`);
    return {
      results: pagedResults,
      total,
      query
    };
  }
  /**
   * 解析搜索关键词
   */
  parseKeywords(query) {
    return query.toLowerCase().split(/\s+/).filter((k) => k.length > 0);
  }
  /**
   * 匹配照片
   */
  matchPhoto(photo, keywords, fields, fuzzy) {
    let bestScore = 0;
    let matchedField = "";
    let highlights = [];
    for (const field of fields) {
      const fieldValue = this.getFieldValue(photo, field);
      if (!fieldValue) continue;
      for (const keyword of keywords) {
        const matchResult = this.matchField(fieldValue, keyword, fuzzy);
        if (matchResult.match) {
          const score = this.calculateScore(fieldValue, keyword, field, fuzzy);
          if (score > bestScore) {
            bestScore = score;
            matchedField = field;
            highlights = matchResult.highlights;
          }
        }
      }
    }
    if (bestScore > 0) {
      return {
        photoUuid: photo.uuid,
        fileName: photo.file_name,
        filePath: photo.file_path,
        matchedField,
        matchScore: bestScore,
        highlights
      };
    }
    return null;
  }
  /**
   * 获取字段值
   */
  getFieldValue(photo, field) {
    switch (field) {
      case "file_name":
        return photo.file_name?.toLowerCase() || null;
      case "folder_path":
        const pathParts = photo.file_path?.split("/") || [];
        return pathParts.slice(0, -1).join("/").toLowerCase() || null;
      case "exif_data":
        if (photo.exif_data) {
          try {
            const exif = typeof photo.exif_data === "string" ? JSON.parse(photo.exif_data) : photo.exif_data;
            return JSON.stringify(exif).toLowerCase();
          } catch {
            return null;
          }
        }
        return null;
      case "location_data":
        if (photo.location_data) {
          try {
            const loc = typeof photo.location_data === "string" ? JSON.parse(photo.location_data) : photo.location_data;
            return JSON.stringify(loc).toLowerCase();
          } catch {
            return null;
          }
        }
        return null;
      default:
        return null;
    }
  }
  /**
   * 匹配字段值
   */
  matchField(fieldValue, keyword, fuzzy) {
    const highlights = [];
    if (fuzzy) {
      if (fieldValue.includes(keyword)) {
        highlights.push(keyword);
        return { match: true, highlights };
      }
      if (this.calculateSimilarity(fieldValue, keyword) > 0.6) {
        highlights.push(keyword);
        return { match: true, highlights };
      }
    } else {
      const words = fieldValue.split(/\W+/);
      for (const word of words) {
        if (word === keyword) {
          highlights.push(keyword);
          return { match: true, highlights };
        }
      }
    }
    return { match: false, highlights: [] };
  }
  /**
   * 计算匹配分数
   */
  calculateScore(fieldValue, keyword, field, fuzzy) {
    let score = 0;
    if (field === "file_name") {
      const fileName = fieldValue;
      if (fileName.startsWith(keyword)) {
        score = 100;
      } else if (fileName.includes(` ${keyword}`) || fileName.includes(`-${keyword}`)) {
        score = 80;
      } else if (fileName.includes(keyword)) {
        score = 50;
      } else {
        score = 25;
      }
    } else if (field === "folder_path") {
      score = 30;
    } else {
      score = 10;
    }
    if (fuzzy && !fieldValue.includes(keyword)) {
      score *= 0.5;
    }
    return score;
  }
  /**
   * 计算字符串相似度
   */
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1;
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }
  /**
   * Levenshtein 距离
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }
  /**
   * 快速搜索（简化版）
   */
  async quickSearch(query, limit = 20) {
    const result = await this.search({
      query,
      fuzzy: true,
      limit,
      offset: 0
    });
    return result.results;
  }
  /**
   * 获取搜索建议
   */
  getSuggestions(query, limit = 10) {
    const keywords = this.parseKeywords(query);
    const photos = this.database.getAllPhotos();
    const suggestions = /* @__PURE__ */ new Set();
    for (const photo of photos) {
      const fileName = photo.file_name?.toLowerCase() || "";
      for (const keyword of keywords) {
        const index = fileName.indexOf(keyword);
        if (index !== -1) {
          const wordMatch = fileName.match(new RegExp(`\\w{${index},${index + keyword.length + 10}}`));
          if (wordMatch) {
            suggestions.add(wordMatch[0]);
          }
        }
      }
      if (suggestions.size >= limit) break;
    }
    return Array.from(suggestions).slice(0, limit);
  }
  /**
   * 统计包含关键词的照片数量
   */
  countByKeyword(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    const photos = this.database.getAllPhotos();
    let count = 0;
    for (const photo of photos) {
      const fileName = photo.file_name?.toLowerCase() || "";
      if (fileName.includes(lowerKeyword)) {
        count++;
      }
    }
    return count;
  }
}
const keywordSearchService = new KeywordSearchService();
export {
  KeywordSearchService,
  keywordSearchService
};
//# sourceMappingURL=keywordSearchService-BdTauFmh.js.map
