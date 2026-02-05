# PhotoMind 架构文档

## 执行摘要

PhotoMind 是一个基于 Electron 的智能图片管理桌面应用，支持自然语言搜索 iCloud 照片。项目采用 Vue 3 + TypeScript 技术栈，使用 sql.js 嵌入式 SQLite 数据库存储照片元数据。

## 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | Electron 35 |
| 前端框架 | Vue 3 + Composition API |
| 构建工具 | Vite 5 |
| 类型系统 | TypeScript 5.3 |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| UI 组件库 | Naive UI 2.38 |
| 数据库 | sql.js (SQLite) |
| AI 集成 | OpenAI SDK |

## 架构模式

```
┌─────────────────────────────────────────────────┐
│                  PhotoMind App                    │
├─────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐    │
│  │         Electron 主进程                  │    │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ │    │
│  │  │Main Window│ │IPC Handler│ │ Services│ │    │
│  │  └──────────┘ └──────────┘ └─────────┘ │    │
│  │  ┌──────────┐ ┌──────────┐            │    │
│  │  │Database   │ │iCloud Sync│            │    │
│  │  │(sql.js)   │ │Service    │            │    │
│  │  └──────────┘ └──────────┘            │    │
│  └─────────────────────────────────────────┘    │
│                    ▲                            │
│         IPC (Preload Bridge)                     │
│                    ▼                            │
│  ┌─────────────────────────────────────────┐    │
│  │         Vue 3 渲染进程                  │    │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ │    │
│  │  │Vue Router │ │Pinia      │ │Views     │ │    │
│  │  │           │ │Stores     │ │&Components│ │    │
│  │  └──────────┘ └──────────┘ └─────────┘ │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

## 数据架构

### 数据库 schema

| 表名 | 用途 |
|------|------|
| `photos` | 照片元数据 |
| `faces` | 人脸识别数据 |
| `persons` | 人物信息 |
| `tags` | 照片标签 |
| `photo_tags` | 照片-标签关联 |
| `vectors` | 向量嵌入存储 |
| `albums` | 智能相册 |

### 数据流

```
iCloud Photos Library → iCloudService → SQLite → SearchService → UI
                           ↓
                      Photos Store
                           ↓
                    Vue Components
```

## API 设计

### IPC 接口

| 命名空间 | 方法 | 描述 |
|----------|------|------|
| `icloud:select-library` | 选择 Photos Library | 选择 iCloud 照片库 |
| `photos:get-list` | 获取照片列表 | 分页获取 |
| `photos:get-detail` | 获取照片详情 | 单张照片详情 |
| `photos:search` | 搜索照片 | 自然语言搜索 |
| `sync:start` | 开始同步 | 同步 iCloud 照片 |
| `people:get-all` | 获取人物列表 | 人脸识别人物 |
| `places:get-all` | 获取地点列表 | 照片地点 |

## 源文件结构

```
electron/
├── main/index.ts        # 主进程入口
├── preload/index.ts      # IPC 桥接
├── services/
│   ├── iCloudService.ts  # iCloud 照片服务
│   └── searchService.ts # 搜索服务
└── database/
    └── db.ts            # SQLite 操作

src/renderer/
├── main.ts              # Vue 入口
├── App.vue              # 根组件
├── router/index.ts      # 路由配置
├── stores/
│   ├── photoStore.ts    # 照片状态
│   └── searchStore.ts   # 搜索状态
├── views/
│   ├── HomeView.vue     # 首页
│   ├── PhotosView.vue   # 照片列表
│   ├── SearchView.vue   # 搜索页
│   └── ...
└── components/
    └── PhotoGrid.vue    # 照片网格
```

## 开发工作流

### 本地开发

```bash
npm run dev  # 启动开发服务器
```

### 生产构建

```bash
npm run build      # 构建所有
npm run build:mac  # 构建 macOS
```

## 部署架构

### macOS 构建

```json
{
  "category": "public.app-category.photography",
  "target": "default"
}
```

### 应用包结构

```
PhotoMind.app/
└── Contents/
    ├── MacOS/PhotoMind
    ├── Resources/
    └── Frameworks/
```
