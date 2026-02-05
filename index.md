# PhotoMind 项目索引

## 项目概述
- **名称**: PhotoMind
- **类型**: Electron 桌面应用 + Vue 3 前端
- **功能**: 智能相册管理 - 自然语言搜索 iCloud 照片
- **技术栈**: Electron + Vue 3 + TypeScript + SQLite(sql.js)

---

## electron/ - 主进程

### 入口文件
- **[main/index.ts](./electron/main/index.ts)** - Electron 主进程入口，IPC 处理器注册
- **[preload/index.ts](./electron/preload/index.ts)** - 预加载脚本，暴露 photoAPI 到渲染进程

### 数据库层
- **[database/db.ts](./electron/database/db.ts)** - SQLite 数据库封装，提供照片/人物/标签存储

### 服务层 (services/)
| 文件 | 功能 |
|------|------|
| [iCloudService.ts](./electron/services/iCloudService.ts) | iCloud Photos 集成 |
| [localPhotoService.ts](./electron/services/localPhotoService.ts) | 本地文件夹照片导入 |
| [searchService.ts](./electron/services/searchService.ts) | 自然语言搜索 (DeepSeek API) |
| [configService.ts](./electron/services/configService.ts) | 应用配置管理 |
| [thumbnailService.ts](./electron/services/thumbnailService.ts) | 缩略图生成与缓存 |
| [faceRecognitionService.ts](./electron/services/faceRecognitionService.ts) | 人脸识别 |
| [smartAlbumService.ts](./electron/services/smartAlbumService.ts) | 智能相册生成 |
| [exportService.ts](./electron/services/exportService.ts) | 照片导出功能 |
| [searchSuggestionService.ts](./electron/services/searchSuggestionService.ts) | 搜索建议与历史 |

### 类型定义
- **[types/apple-photos-js.d.ts](./electron/types/apple-photos-js.d.ts)** - apple-photos-js 类型声明

---

## src/renderer - 渲染进程

### 入口
- **[main.ts](./src/renderer/main.ts)** - Vue 应用入口
- **[App.vue](./src/renderer/App.vue)** - 根组件
- **[router/index.ts](./src/renderer/router/index.ts)** - Vue Router 配置

### 视图 (views/)
| 视图 | 路由 | 功能 |
|------|------|------|
| [HomeView.vue](./src/renderer/views/HomeView.vue) | `/` | 首页，导入/同步入口 |
| [PhotosView.vue](./src/renderer/views/PhotosView.vue) | `/photos` | 照片网格浏览 |
| [SearchView.vue](./src/renderer/views/SearchView.vue) | `/search` | 自然语言搜索 |
| [TimelineView.vue](./src/renderer/views/TimelineView.vue) | `/timeline` | 时间线浏览 |
| [AlbumsView.vue](./src/renderer/views/AlbumsView.vue) | `/albums` | 智能相册 |
| [PeopleView.vue](./src/renderer/views/PeopleView.vue) | `/people` | 人物浏览 |
| [PhotoDetailView.vue](./src/renderer/views/PhotoDetailView.vue) | `/photo/:id` | 照片详情 |
| [SettingsView.vue](./src/renderer/views/SettingsView.vue) | `/settings` | 设置 (DeepSeek API 配置) |

### 组件 (components/)
- **[PhotoGrid.vue](./src/renderer/components/PhotoGrid.vue)** - 照片网格展示组件

### 状态管理 (stores/)
| 文件 | 管理内容 |
|------|----------|
| [photoStore.ts](./src/renderer/stores/photoStore.ts) | 照片数据与导入 |
| [searchStore.ts](./src/renderer/stores/searchStore.ts) | 搜索状态 |
| [peopleStore.ts](./src/renderer/stores/peopleStore.ts) | 人物数据 |

### 样式
- **[styles/global.css](./src/renderer/styles/global.css)** - 全局样式

---

## 关键 API 通信流程

```
渲染进程 (HomeView.vue)
    │
    ▼ window.photoAPI
    │
预加载 (preload/index.ts)
    │
    ▼ ipcRenderer.invoke
    │
主进程 (main/index.ts) ◄── IPC 处理器
    │
    ▼ 调用服务
    │
localPhotoService ───► database/db.ts (SQLite)
```

---

## 索引生成时间
- 日期: 2026-02-04
- 模式: 静态分析
- 执行人: Claude (BMAD Index Docs Task)
