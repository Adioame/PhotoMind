import { keywordSearchService } from "./keywordSearchService-BdTauFmh.js";
import { globalSearchService } from "./globalSearchService-DwFw3EOb.js";
import { queryParserService } from "./queryParserService-GRPgjsFW.js";
import { P as PhotoDatabase } from "./index-BYkeoRh9.js";
class ResultMergeService {
  keywordWeight = 0.3;
  vectorWeight = 0.7;
  database;
  constructor(database) {
    this.database = database || new PhotoDatabase();
  }
  /**
   * 执行混合搜索（融合关键词和向量搜索）
   */
  async search(options) {
    const startTime = Date.now();
    const {
      query,
      queryIntent,
      keywordWeight = this.keywordWeight,
      vectorWeight = this.vectorWeight,
      limit = 50,
      minScore = 0.1,
      enableDeduplication = true
    } = options;
    this.keywordWeight = keywordWeight;
    this.vectorWeight = vectorWeight;
    console.log(`[ResultMerge] 开始混合搜索: "${query}"`);
    const [keywordResults, semanticResults] = await Promise.all([
      this.keywordSearch(query),
      this.semanticSearch(query)
    ]);
    console.log(`[ResultMerge] 关键词搜索: ${keywordResults.length}, 向量搜索: ${semanticResults.length}`);
    const merged = this.mergeResults(
      keywordResults,
      semanticResults,
      keywordWeight,
      vectorWeight,
      enableDeduplication
    );
    const filtered = merged.filter((r) => r.score >= minScore).sort((a, b) => b.score - a.score).slice(0, limit);
    filtered.forEach((r, i) => r.rank = i + 1);
    await this.enrichResults(filtered);
    const processingTime = Date.now() - startTime;
    console.log(`[ResultMerge] 融合完成，返回 ${filtered.length} 个结果，耗时 ${processingTime}ms`);
    return {
      results: filtered,
      total: filtered.length,
      query,
      intent: queryIntent,
      processingTimeMs: processingTime,
      stats: {
        keywordCount: keywordResults.length,
        semanticCount: semanticResults.length,
        mergedCount: filtered.length
      }
    };
  }
  /**
   * 执行混合搜索（带意图解析）
   */
  async searchWithIntent(query) {
    const parseResult = await queryParserService.parse(query);
    const intent = parseResult.parsed;
    console.log(`[ResultMerge] 查询意图: ${intent.type}, 置信度: ${intent.confidence}`);
    let keywordWeight = 0.3;
    let vectorWeight = 0.7;
    switch (intent.type) {
      case "keyword":
        keywordWeight = 0.7;
        vectorWeight = 0.3;
        break;
      case "semantic":
        keywordWeight = 0.2;
        vectorWeight = 0.8;
        break;
      case "people":
      case "location":
      case "time":
        keywordWeight = 0.5;
        vectorWeight = 0.5;
        break;
    }
    return this.search({
      query,
      queryIntent: intent,
      keywordWeight,
      vectorWeight,
      limit: 50,
      enableDeduplication: true
    });
  }
  /**
   * 关键词搜索
   */
  async keywordSearch(query) {
    try {
      const result = await keywordSearchService.search({
        query,
        fuzzy: true,
        limit: 100
      });
      return result.results;
    } catch (error) {
      console.error("[ResultMerge] 关键词搜索失败:", error);
      return [];
    }
  }
  /**
   * 向量搜索
   */
  async semanticSearch(query) {
    try {
      const result = await globalSearchService.search({
        query,
        topK: 100,
        minSimilarity: 0.1
      });
      return result.results;
    } catch (error) {
      console.error("[ResultMerge] 向量搜索失败:", error);
      return [];
    }
  }
  /**
   * 融合结果
   */
  mergeResults(keywordResults, semanticResults, keywordWeight, vectorWeight, enableDeduplication) {
    const scoreMap = /* @__PURE__ */ new Map();
    for (const item of keywordResults) {
      const normalizedScore = this.normalizeKeywordScore(item.matchScore);
      const weightedScore = normalizedScore * keywordWeight;
      scoreMap.set(item.photoUuid, {
        photoUuid: item.photoUuid,
        fileName: item.fileName,
        filePath: item.filePath,
        score: weightedScore,
        rank: 0,
        sources: [{
          type: "keyword",
          score: normalizedScore,
          weight: keywordWeight,
          weightedScore
        }],
        highlights: item.highlights
      });
    }
    for (const item of semanticResults) {
      const normalizedScore = this.normalizeVectorScore(item.similarity);
      const weightedScore = normalizedScore * vectorWeight;
      const existing = scoreMap.get(item.photoUuid);
      if (existing) {
        existing.sources.push({
          type: "semantic",
          score: normalizedScore,
          weight: vectorWeight,
          weightedScore
        });
        existing.score = this.calculateTotalScore(existing.sources);
        const existingHighlights = existing.highlights || [];
        const itemHighlights = item.highlights || [];
        existing.highlights = [.../* @__PURE__ */ new Set([...existingHighlights, ...itemHighlights])];
      } else {
        scoreMap.set(item.photoUuid, {
          photoUuid: item.photoUuid,
          fileName: item.fileName,
          filePath: item.filePath,
          score: weightedScore,
          rank: 0,
          sources: [{
            type: "semantic",
            score: normalizedScore,
            weight: vectorWeight,
            weightedScore
          }],
          highlights: item.highlights || []
        });
      }
    }
    if (enableDeduplication) {
      return Array.from(scoreMap.values());
    }
    return Array.from(scoreMap.values());
  }
  /**
   * 标准化关键词分数 (0-1)
   */
  normalizeKeywordScore(matchScore) {
    return Math.min(matchScore / 100, 1);
  }
  /**
   * 标准化向量分数 (0-1)
   */
  normalizeVectorScore(similarity) {
    return Math.min(Math.max(similarity, 0), 1);
  }
  /**
   * 计算总分
   */
  calculateTotalScore(sources) {
    return sources.reduce((total, source) => total + source.weightedScore, 0);
  }
  /**
   * 丰富结果
   */
  async enrichResults(results) {
    for (const r of results) {
      const photo = this.database.getPhotoByUuid(r.photoUuid);
      if (photo) {
        r.thumbnailPath = photo.thumbnail_path;
        r.takenAt = photo.taken_at;
      }
    }
  }
  /**
   * 重新排序结果
   */
  reorderResults(results, sortBy) {
    const sorted = [...results];
    switch (sortBy) {
      case "keyword":
        sorted.sort((a, b) => {
          const aKeyword = a.sources.find((s) => s.type === "keyword")?.weightedScore || 0;
          const bKeyword = b.sources.find((s) => s.type === "keyword")?.weightedScore || 0;
          return bKeyword - aKeyword;
        });
        break;
      case "semantic":
        sorted.sort((a, b) => {
          const aSemantic = a.sources.find((s) => s.type === "semantic")?.weightedScore || 0;
          const bSemantic = b.sources.find((s) => s.type === "semantic")?.weightedScore || 0;
          return bSemantic - aSemantic;
        });
        break;
      case "recency":
        sorted.sort((a, b) => {
          const dateA = a.takenAt ? new Date(a.takenAt).getTime() : 0;
          const dateB = b.takenAt ? new Date(b.takenAt).getTime() : 0;
          return dateB - dateA;
        });
        break;
      case "mixed":
      default:
        sorted.sort((a, b) => b.score - a.score);
    }
    sorted.forEach((r, i) => r.rank = i + 1);
    return sorted;
  }
  /**
   * 获取结果统计
   */
  getStats(results) {
    let withBothSources = 0;
    let keywordOnly = 0;
    let semanticOnly = 0;
    let totalScore = 0;
    for (const r of results) {
      const hasKeyword = r.sources.some((s) => s.type === "keyword");
      const hasSemantic = r.sources.some((s) => s.type === "semantic");
      if (hasKeyword && hasSemantic) {
        withBothSources++;
      } else if (hasKeyword) {
        keywordOnly++;
      } else if (hasSemantic) {
        semanticOnly++;
      }
      totalScore += r.score;
    }
    return {
      total: results.length,
      withBothSources,
      keywordOnly,
      semanticOnly,
      avgScore: results.length > 0 ? totalScore / results.length : 0
    };
  }
}
const resultMergeService = new ResultMergeService();
export {
  ResultMergeService,
  resultMergeService
};
//# sourceMappingURL=resultMergeService-nY3OCcJw.js.map
