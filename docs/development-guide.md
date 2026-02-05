# PhotoMind 开发指南

## 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18.0.0 | 推荐 LTS 版本 |
| npm | >= 9.0.0 | 随 Node.js 附带 |
| Git | >= 2.0 | 版本控制 |

## 安装步骤

```bash
# 克隆项目
git clone <repository-url>
cd PhotoMind

# 安装依赖
npm install
```

## 开发命令

| 命令 | 描述 |
|------|------|
| `npm run dev` | 启动开发服务器 (Vite + Electron) |
| `npm run build` | 构建生产版本 |
| `npm run build:mac` | 构建 macOS 应用 |
| `npm run preview` | 预览生产构建 |

### 开发服务器

```bash
npm run dev
```

- **前端**: http://localhost:5177 (Vite)
- **DevTools**: 自动打开开发者工具

## 构建命令

### 生产构建

```bash
# 构建所有组件
npm run build

# 仅构建 macOS
npm run build:mac
```

构建输出：
- `dist-electron/` - Electron 主进程
- `dist-renderer/` - 前端资源
- `dist/` - 最终应用包

## TypeScript 配置

| 配置文件 | 用途 |
|----------|------|
| `tsconfig.json` | 通用 TypeScript 配置 |
| `tsconfig.electron.json` | Electron 主进程配置 |
| `tsconfig.node.json` | Node.js 环境配置 |

## 依赖说明

### 核心依赖

| 包名 | 用途 |
|------|------|
| `vue` ^3.4 | 前端框架 |
| `electron` ^35 | 桌面应用框架 |
| `vite` ^5.0 | 构建工具 |
| `typescript` ^5.3 | 类型系统 |

### 功能依赖

| 包名 | 用途 |
|------|------|
| `pinia` | 状态管理 |
| `vue-router` | 路由管理 |
| `naive-ui` | UI 组件库 |
| `openai` | LLM API 集成 |
| `sql.js` | SQLite 数据库 |
| `@vicons/fluent` | Fluent UI 图标 |

## 项目结构约定

### Vue 组件

- 组件放在 `src/renderer/components/`
- 视图放在 `src/renderer/views/`
- 使用 Composition API (`<script setup>`)

### 状态管理

- Pinia stores 放在 `src/renderer/stores/`
- 按功能模块划分 store

### Electron 服务

- 服务逻辑放在 `electron/services/`
- 数据库操作在 `electron/database/`

## 常用开发任务

### 添加新视图

1. 在 `src/renderer/views/` 创建 `.vue` 文件
2. 在 `src/renderer/router/index.ts` 添加路由
3. 更新导航组件

### 添加新服务

1. 在 `electron/services/` 创建服务文件
2. 在 `electron/main/index.ts` 注册 IPC 处理
3. 在 `electron/preload/index.ts` 暴露 API

### 数据库操作

1. 在 `electron/database/db.ts` 添加方法
2. 使用 sql.js API
3. 通过服务层调用

## 测试

> Quick Scan 未检测到测试配置
