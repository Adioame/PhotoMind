class SearchResultFormatter {
  /**
   * 格式化单个搜索结果
   */
  format(result) {
    const photo = result.photo || {};
    let takenYear;
    let takenMonth;
    if (photo.takenAt) {
      const date = new Date(photo.takenAt);
      takenYear = date.getFullYear();
      takenMonth = date.getMonth() + 1;
    }
    return {
      id: result.photoUuid,
      fileName: photo.fileName || "",
      filePath: photo.filePath || "",
      thumbnailUrl: photo.thumbnailPath,
      similarity: result.similarity,
      similarityPercent: Math.round(result.similarity * 100),
      similarityLabel: this.getSimilarityLabel(result.similarity),
      takenAt: photo.takenAt,
      takenYear,
      takenMonth,
      location: photo.location,
      exif: {
        camera: photo.exif?.camera,
        lens: photo.exif?.lens,
        aperture: photo.exif?.aperture,
        iso: photo.exif?.iso
      },
      rank: result.rank || 0
    };
  }
  /**
   * 批量格式化搜索结果
   */
  formatBatch(results) {
    return results.map((r, index) => ({
      ...this.format(r),
      rank: r.rank || index + 1
    }));
  }
  /**
   * 生成搜索摘要
   */
  formatSummary(result) {
    return {
      totalResults: result.total || result.results?.length || 0,
      displayedResults: result.results?.length || 0,
      page: result.page || 1,
      totalPages: Math.ceil((result.total || 0) / (result.pageSize || 20)),
      processingTimeMs: result.processingTimeMs || 0,
      query: result.query?.original || "",
      language: result.query?.language || "unknown"
    };
  }
  /**
   * 获取相似度标签
   */
  getSimilarityLabel(similarity) {
    if (similarity >= 0.7) return "high";
    if (similarity >= 0.4) return "medium";
    return "low";
  }
  /**
   * 相似度转换为百分比
   */
  similarityToPercent(similarity) {
    return Math.round(similarity * 100);
  }
  /**
   * 按年份分组结果
   */
  groupByYear(results) {
    const groups = /* @__PURE__ */ new Map();
    for (const result of results) {
      const year = result.takenYear || 0;
      if (year > 0) {
        const existing = groups.get(year) || [];
        existing.push(result);
        groups.set(year, existing);
      }
    }
    return groups;
  }
  /**
   * 按地点分组结果
   */
  groupByLocation(results) {
    const groups = /* @__PURE__ */ new Map();
    for (const result of results) {
      const locationName = result.location?.name || "未知地点";
      const existing = groups.get(locationName) || [];
      existing.push(result);
      groups.set(locationName, existing);
    }
    return groups;
  }
  /**
   * 生成高亮文本（模拟）
   */
  generateHighlightedQuery(processedQuery) {
    return processedQuery;
  }
  /**
   * 估算搜索质量
   */
  estimateSearchQuality(results) {
    if (results.length === 0) return "poor";
    const highQualityCount = results.filter((r) => r.similarity >= 0.5).length;
    const ratio = highQualityCount / results.length;
    if (ratio >= 0.8) return "excellent";
    if (ratio >= 0.5) return "good";
    if (ratio >= 0.3) return "fair";
    return "poor";
  }
}
const searchResultFormatter = new SearchResultFormatter();
export {
  SearchResultFormatter,
  searchResultFormatter
};
//# sourceMappingURL=searchResultFormatter-RYSqGMUP.js.map
