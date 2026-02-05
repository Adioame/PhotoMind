# PhotoMind 源码树分析

## 项目根目录结构

```
PhotoMind/
├── electron/              # Electron 主进程代码
│   ├── main/              # 应用入口和窗口管理
│   │   └── index.ts       # 主进程入口，窗口创建、IPC 处理
│   ├── preload/           # 预加载脚本
│   │   └── index.ts       # 安全 IPC 桥接暴露
│   ├── services/          # 业务服务层
│   │   ├── iCloudService.ts   # iCloud 照片同步服务
│   │   └── searchService.ts   # 自然语言搜索服务
│   ├── database/          # 数据持久化
│   │   └── db.ts          # SQLite 数据库 (sql.js)
│   └── types/             # TypeScript 类型定义
│       └── apple-photos-js.d.ts
├── src/renderer/          # Vue 3 前端渲染进程
│   ├── main.ts            # Vue 应用入口
│   ├── App.vue            # 根组件
│   ├── router/            # Vue Router 配置
│   │   └── index.ts       # 路由定义
│   ├── stores/            # Pinia 状态管理
│   │   ├── photoStore.ts  # 照片状态管理
│   │   └── searchStore.ts # 搜索状态管理
│   ├── components/        # Vue 组件
│   │   └── PhotoGrid.vue  # 照片网格组件
│   ├── views/             # 页面视图
│   │   ├── HomeView.vue       # 首页
│   │   ├── PhotosView.vue     # 照片列表
│   │   ├── PhotoDetailView.vue # 照片详情
│   │   ├── SearchView.vue     # 智能搜索
│   │   ├── TimelineView.vue   # 时间线
│   │   └── AlbumsView.vue     # 智能相册
│   └── styles/            # 全局样式
│       └── global.css     # 全局 CSS
├── public/                # 静态资源
│   └── icon.svg           # 应用图标
├── build/                 # 构建输出 (临时)
├── dist/                  # Electron 构建输出
├── dist-electron/         # Electron 主进程构建
├── dist-renderer/         # Vite 构建输出
├── docs/                  # 项目文档
├── package.json           # 项目配置
├── vite.config.ts         # Vite 构建配置
├── tsconfig.json          # TypeScript 配置
└── tsconfig.electron.json # Electron TypeScript 配置
```

## 关键目录说明

| 目录 | 用途 | 关键文件 |
|------|------|----------|
| `electron/main` | 主进程入口 | `index.ts` - 窗口管理、IPC 处理 |
| `electron/services` | 业务逻辑 | `iCloudService.ts`, `searchService.ts` |
| `electron/database` | 数据存储 | `db.ts` - SQLite 操作 |
| `src/renderer/views` | 页面组件 | 6 个视图页面 |
| `src/renderer/stores` | 状态管理 | Pinia stores |
| `electron/preload` | IPC 桥接 | 安全通信层 |

## 入口点

| 入口 | 文件 | 描述 |
|------|------|------|
| **主进程** | `electron/main/index.ts` | Electron 应用入口 |
| **渲染进程** | `src/renderer/main.ts` | Vue 3 应用入口 |
| **构建入口** | `vite.config.ts` | Vite 构建配置 |

## 集成点

| 组件 | 集成方式 |
|------|----------|
| **iCloud** | `iCloudService.ts` - 照片同步 |
| **搜索** | `searchService.ts` - LLM + 规则解析 |
| **数据库** | `db.ts` - sql.js SQLite |
| **IPC** | `preload/index.ts` - 主/渲染进程通信 |
