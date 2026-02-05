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
        search: (query, filters) => ipcRenderer.invoke('photos:search', query, filters),
    },
    people: {
        getAll: () => ipcRenderer.invoke('people:get-all'),
        add: (person) => ipcRenderer.invoke('people:add', person),
        search: (query) => ipcRenderer.invoke('people:search', query),
        searchPhotos: (personName) => ipcRenderer.invoke('people:search-photos', personName),
    },
    places: {
        getAll: () => ipcRenderer.invoke('places:get-all'),
    },
    albums: {
        getSmart: () => ipcRenderer.invoke('albums:get-smart'),
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
        getGenStatus: () => ipcRenderer.invoke('embedding:get-status'),
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
});
ipcRenderer.on('sync:progress', (event, data) => {
    console.log('同步进度:', data);
});
ipcRenderer.on('local:import-progress', (event, data) => {
    console.log('导入进度:', data);
});
//# sourceMappingURL=index.js.map