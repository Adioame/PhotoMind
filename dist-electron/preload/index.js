"use strict";
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('photoAPI', {
    iCloud: {
        selectLibrary: () => ipcRenderer.invoke('icloud:select-library'),
    },
    photos: {
        getList: (options) => ipcRenderer.invoke('photos:get-list', options),
        getCount: () => ipcRenderer.invoke('photos:get-count'),
        getDetail: (photoId) => ipcRenderer.invoke('photos:get-detail', photoId),
        getWithoutEmbeddings: (limit) => ipcRenderer.invoke('photos:get-without-embeddings', limit),
        saveEmbedding: (photoUuid, vector) => ipcRenderer.invoke('photos:save-embedding', photoUuid, vector),
        search: (query, filters) => ipcRenderer.invoke('photos:search', query, filters),
        delete: (photoId) => ipcRenderer.invoke('photos:delete', photoId),
        export: (params) => ipcRenderer.invoke('photos:export', params),
    },
    people: {
        getAll: () => ipcRenderer.invoke('people:get-all'),
        add: (person) => ipcRenderer.invoke('people:add', person),
        update: (id, person) => ipcRenderer.invoke('people:update', id, person),
        delete: (id) => ipcRenderer.invoke('people:delete', id),
        search: (options) => ipcRenderer.invoke('people:search', options),
        getPhotos: (filter) => ipcRenderer.invoke('people:get-photos', filter),
        getTimeline: (personId) => ipcRenderer.invoke('people:get-timeline', personId),
        getSuggestions: (query, limit) => ipcRenderer.invoke('people:get-suggestions', query, limit),
        getPopular: (limit) => ipcRenderer.invoke('people:get-popular', limit),
        getSearchStats: () => ipcRenderer.invoke('people:get-search-stats'),
        getSearchHistory: () => ipcRenderer.invoke('people:get-search-history'),
        addSearchHistory: (query) => ipcRenderer.invoke('people:add-search-history', query),
        clearSearchHistory: () => ipcRenderer.invoke('people:clear-search-history'),
    },
    places: {
        getAll: () => ipcRenderer.invoke('places:get-all'),
    },
    albums: {
        getSmart: () => ipcRenderer.invoke('albums:get-smart'),
        refresh: () => ipcRenderer.invoke('albums:refresh'),
    },
    timeline: {
        get: (year) => ipcRenderer.invoke('timeline:get', year),
    },
    sync: {
        start: () => ipcRenderer.invoke('sync:start'),
        getProgress: () => ipcRenderer.invoke('sync:get-progress'),
    },
    local: {
        selectFolder: () => ipcRenderer.invoke('local:select-folder'),
        importFolder: (folderPath) => ipcRenderer.invoke('local:import-folder', folderPath),
        importPhoto: (filePath) => ipcRenderer.invoke('local:import-photo', filePath),
        getCount: () => ipcRenderer.invoke('local:get-count'),
        onProgress: (callback) => {
            const listener = (_, progress) => callback(progress);
            ipcRenderer.on('local:import-progress', listener);
            return () => ipcRenderer.off('local:import-progress', listener);
        },
    },
    config: {
        get: () => ipcRenderer.invoke('config:get'),
        setApiKey: (apiKey) => ipcRenderer.invoke('config:set-api-key', apiKey),
        getLlmStatus: () => ipcRenderer.invoke('config:get-llm-status'),
        setTheme: (theme) => ipcRenderer.invoke('config:set-theme', theme),
    },
    suggestions: {
        get: (query) => ipcRenderer.invoke('suggestions:get', query),
        addHistory: (query, resultCount) => ipcRenderer.invoke('suggestions:add-history', query, resultCount),
        getHistory: () => ipcRenderer.invoke('suggestions:get-history'),
        clearHistory: () => ipcRenderer.invoke('suggestions:clear-history'),
        getPopular: () => ipcRenderer.invoke('suggestions:get-popular'),
    },
    face: {
        loadModels: () => ipcRenderer.invoke('face:load-models'),
        getStatus: () => ipcRenderer.invoke('face:get-status'),
        detect: (imagePath) => ipcRenderer.invoke('face:detect', imagePath),
        detectBatch: (imagePaths) => ipcRenderer.invoke('face:detect-batch', imagePaths),
        cancel: () => ipcRenderer.invoke('face:cancel'),
        scanAll: () => ipcRenderer.invoke('face:scan-all'),
        getQueueStatus: () => ipcRenderer.invoke('face:get-queue-status'),
        resetQueue: () => ipcRenderer.invoke('face:reset-queue'),
        getUnnamedFaces: (limit) => ipcRenderer.invoke('face:get-unnamed-faces', limit),
        onProgress: (callback) => {
            const listener = (_, progress) => callback(progress);
            ipcRenderer.on('face:progress', listener);
            return () => ipcRenderer.off('face:progress', listener);
        },
        onStatus: (callback) => {
            const listener = (_, status) => callback(status);
            ipcRenderer.on('face:status', listener);
            return () => ipcRenderer.off('face:status', listener);
        },
        onScanComplete: (callback) => {
            const listener = (_, result) => callback(result);
            ipcRenderer.on('face:scan-complete', listener);
            return () => ipcRenderer.off('face:scan-complete', listener);
        },
    },
    diagnostic: {
        getFaceStats: () => ipcRenderer.invoke('diagnostic:face-stats'),
        clearFaceData: () => ipcRenderer.invoke('diagnostic:clear-face-data'),
        resetPersonLinks: () => ipcRenderer.invoke('diagnostic:reset-person-links'),
        query: (sql) => ipcRenderer.invoke('diagnostic:query', sql),
    },
    faceMatching: {
        autoMatch: () => ipcRenderer.invoke('face:auto-match'),
        findSimilar: (faceId) => ipcRenderer.invoke('face:find-similar', faceId),
        createPerson: (cluster, personName) => ipcRenderer.invoke('face:create-person', cluster, personName),
        assign: (faceIds, personId) => ipcRenderer.invoke('face:assign', faceIds, personId),
        unmatch: (faceId) => ipcRenderer.invoke('face:unmatch', faceId),
        getStats: () => ipcRenderer.invoke('face:get-matching-stats'),
        regenerateStart: (options) => ipcRenderer.invoke('face:regenerate-start', options),
        regeneratePause: () => ipcRenderer.invoke('face:regenerate-pause'),
        regenerateGetProgress: () => ipcRenderer.invoke('face:regenerate-progress'),
        regenerateReset: () => ipcRenderer.invoke('face:regenerate-reset'),
        regenerateRecluster: () => ipcRenderer.invoke('face:regenerate-recluster'),
        cleanupPersons: () => ipcRenderer.invoke('face:cleanup-persons'),
        onRegenerateProgress: (callback) => {
            const listener = (_, progress) => callback(progress);
            ipcRenderer.on('face:regenerate-progress', listener);
            return () => ipcRenderer.off('face:regenerate-progress', listener);
        },
        mergePersons: (sourcePersonId, targetPersonId) => ipcRenderer.invoke('face:merge-persons', sourcePersonId, targetPersonId),
    },
    quality: {
        validateClustering: () => ipcRenderer.invoke('quality:validate-clustering'),
        testSemantic: (query) => ipcRenderer.invoke('quality:test-semantic', query),
        runTests: () => ipcRenderer.invoke('quality:run-tests'),
        generateReport: () => ipcRenderer.invoke('quality:generate-report'),
        checkVectors: () => ipcRenderer.invoke('quality:check-vectors'),
    },
    perf: {
        testSearch: (queryCount) => ipcRenderer.invoke('perf:test-search', queryCount),
        testMemory: () => ipcRenderer.invoke('perf:test-memory'),
        testConcurrency: (concurrentCount) => ipcRenderer.invoke('perf:test-concurrency', concurrentCount),
        testModels: () => ipcRenderer.invoke('perf:test-models'),
        runFull: () => ipcRenderer.invoke('perf:run-full'),
    },
    app: {
        getVersion: () => ipcRenderer.invoke('app:get-version'),
    },
    window: {
        minimize: () => ipcRenderer.invoke('window:minimize'),
        maximize: () => ipcRenderer.invoke('window:maximize'),
        close: () => ipcRenderer.invoke('window:close'),
    },
    embedding: {
        initialize: () => ipcRenderer.invoke('embedding:initialize'),
        getStatus: () => ipcRenderer.invoke('embedding:get-status'),
        textToEmbedding: (text) => ipcRenderer.invoke('embedding:text-to-vector', text),
        imageToEmbedding: (imagePath) => ipcRenderer.invoke('embedding:image-to-vector', imagePath),
        generateAll: () => ipcRenderer.invoke('embedding:generate-all'),
        generateOne: (photoUuid) => ipcRenderer.invoke('embedding:generate-one', photoUuid),
        cancel: () => ipcRenderer.invoke('embedding:cancel'),
        getGenStatus: () => ipcRenderer.invoke('embedding:get-generation-status'),
        onProgress: (callback) => {
            const listener = (_, progress) => callback(progress);
            ipcRenderer.on('embedding:progress', listener);
            return () => ipcRenderer.off('embedding:progress', listener);
        },
    },
    search: {
        preprocess: (text) => ipcRenderer.invoke('search:preprocess', text),
        textToVector: (text) => ipcRenderer.invoke('search:text-to-vector', text),
        semantic: (options) => ipcRenderer.invoke('search:semantic', options),
        quick: (query, topK) => ipcRenderer.invoke('search:quick', query, topK),
        multi: (queries, options) => ipcRenderer.invoke('search:multi', queries, options),
        clearCache: () => ipcRenderer.invoke('search:clear-cache'),
        getCacheStats: () => ipcRenderer.invoke('search:get-cache-stats'),
    },
    query: {
        parse: (query) => ipcRenderer.invoke('query:parse', query),
        clearCache: () => ipcRenderer.invoke('query:clear-cache'),
        getCacheStats: () => ipcRenderer.invoke('query:get-cache-stats'),
    },
    keywordSearch: {
        search: (options) => ipcRenderer.invoke('search:keyword', options),
        quick: (query, limit) => ipcRenderer.invoke('search:keyword-quick', query, limit),
        suggestions: (query, limit) => ipcRenderer.invoke('search:suggestions', query, limit),
    },
    globalSearch: {
        search: (options) => ipcRenderer.invoke('search:global', options),
        quick: (query, topK) => ipcRenderer.invoke('search:global-quick', query, topK),
        similar: (photoUuid, topK) => ipcRenderer.invoke('search:similar', photoUuid, topK),
        batch: (queries, options) => ipcRenderer.invoke('search:batch', queries, options),
    },
    hybridSearch: {
        search: (options) => ipcRenderer.invoke('search:hybrid', options),
        searchWithIntent: (query) => ipcRenderer.invoke('search:hybrid-intent', query),
        reorder: (results, sortBy) => ipcRenderer.invoke('search:reorder', results, sortBy),
    },
    import: {
        scanFolder: (folderPath) => ipcRenderer.invoke('import:scan-folder', folderPath),
        start: (folderPath, options) => ipcRenderer.invoke('import:start', folderPath, options),
        cancel: () => ipcRenderer.invoke('import:cancel'),
        getProgress: () => ipcRenderer.invoke('import:get-progress'),
        onProgress: (callback) => {
            const listener = (_, progress) => callback(progress);
            ipcRenderer.on('import:progress', listener);
            return () => ipcRenderer.off('import:progress', listener);
        },
    },
    scanJob: {
        getActive: () => ipcRenderer.invoke('scan-job:get-active'),
        resume: (jobId) => ipcRenderer.invoke('scan-job:resume', jobId),
        getStats: () => ipcRenderer.invoke('scan-job:get-stats'),
        getAll: (limit) => ipcRenderer.invoke('scan-job:get-all', limit),
    },
});
ipcRenderer.on('sync:progress', (event, data) => {
    console.log('同步进度:', data);
});
console.log('[Preload] API 已注册完成');
//# sourceMappingURL=index.js.map