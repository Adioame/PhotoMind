# PhotoMind 项目概览

## 项目信息

| 项目 | 值 |
|------|-----|
| **名称** | PhotoMind |
| **描述** | 智能图片管理系统 - 自然语言搜索 iCloud 照片 |
| **类型** | Electron 桌面应用 |
| **许可证** | MIT |
| **版本** | 1.0.0 |

## 执行摘要

PhotoMind 是一个 macOS 桌面智能图片管理系统，支持从 iCloud Photos Library 导入照片，并提供自然语言搜索功能。项目采用 Vue 3 前端 + Electron 桌面框架 + TypeScript 技术栈，使用 sql.js 嵌入式 SQLite 数据库存储照片元数据。

## 技术栈总览

| 层级 | 技术 | 说明 |
|------|------|------|
| **桌面框架** | Electron 35 | 跨平台桌面应用框架 |
| **前端框架** | Vue 3.4 | Composition API |
| **构建工具** | Vite 5 | 快速构建工具 |
| **类型系统** | TypeScript 5.3 | 类型安全 |
| **状态管理** | Pinia 2.1 | Vue 状态管理 |
| **路由** | Vue Router 4.2 | SPA 路由 |
| **UI 组件库** | Naive UI 2.38 | Vue 3 组件库 |
| **数据库** | sql.js 1.10 | SQLite JavaScript 实现 |
| **AI** | OpenAI SDK 4.28 | 自然语言处理 |
| **日期处理** | dayjs 1.11 | 日期格式化 |

## 架构类型

| 分类 | 值 |
|------|-----|
| **仓库类型** | Monolith（单体应用） |
| **应用架构** | Electron 桌面应用 |
| **前端架构** | Vue 3 组件化 |
| **后端架构** | Electron 主进程 + 服务层 |
| **数据存储** | 嵌入式 SQLite |

## 功能模块

| 模块 | 描述 | 状态 |
|------|------|------|
| iCloud 照片同步 | 从 iCloud Photos Library 导入 | ⚠️ 部分实现 |
| 自然语言搜索 | 使用 LLM 理解查询意图 | ⚠️ 部分实现 |
| 照片浏览 | 时间线、网格视图 | ✅ 实现 |
| 智能相册 | 按人物/地点自动分类 | ⚠️ 部分实现 |
| 人脸识别 | 人物识别和分组 | 📋 计划中 |

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build

# 构建 macOS
npm run build:mac
```

## 相关文档

- [架构文档](./architecture.md)
- [源码树分析](./source-tree-analysis.md)
- [开发指南](./development-guide.md)
