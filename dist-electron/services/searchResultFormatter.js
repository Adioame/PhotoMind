export class SearchResultFormatter {
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
            fileName: photo.fileName || '',
            filePath: photo.filePath || '',
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
    formatBatch(results) {
        return results.map((r, index) => ({
            ...this.format(r),
            rank: r.rank || index + 1
        }));
    }
    formatSummary(result) {
        return {
            totalResults: result.total || result.results?.length || 0,
            displayedResults: result.results?.length || 0,
            page: result.page || 1,
            totalPages: Math.ceil((result.total || 0) / (result.pageSize || 20)),
            processingTimeMs: result.processingTimeMs || 0,
            query: result.query?.original || '',
            language: result.query?.language || 'unknown'
        };
    }
    getSimilarityLabel(similarity) {
        if (similarity >= 0.7)
            return 'high';
        if (similarity >= 0.4)
            return 'medium';
        return 'low';
    }
    similarityToPercent(similarity) {
        return Math.round(similarity * 100);
    }
    groupByYear(results) {
        const groups = new Map();
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
    groupByLocation(results) {
        const groups = new Map();
        for (const result of results) {
            const locationName = result.location?.name || '未知地点';
            const existing = groups.get(locationName) || [];
            existing.push(result);
            groups.set(locationName, existing);
        }
        return groups;
    }
    generateHighlightedQuery(processedQuery) {
        return processedQuery;
    }
    estimateSearchQuality(results) {
        if (results.length === 0)
            return 'poor';
        const highQualityCount = results.filter(r => r.similarity >= 0.5).length;
        const ratio = highQualityCount / results.length;
        if (ratio >= 0.8)
            return 'excellent';
        if (ratio >= 0.5)
            return 'good';
        if (ratio >= 0.3)
            return 'fair';
        return 'poor';
    }
}
export const searchResultFormatter = new SearchResultFormatter();
//# sourceMappingURL=searchResultFormatter.js.map