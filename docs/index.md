# PhotoMind 项目文档索引

## 项目概览

| 项目 | 值 |
|------|-----|
| **类型** | Desktop Application (Electron) |
| **仓库结构** | Monolith |
| **主要语言** | TypeScript |
| **架构类型** | Electron + Vue 3 |

## 快速参考

| 项目 | 值 |
|------|-----|
| **技术栈** | Vue 3 + Electron 35 + TypeScript |
| **入口点** | `electron/main/index.ts` |
| **前端入口** | `src/renderer/main.ts` |
| **构建工具** | Vite 5 |
| **数据库** | sql.js (SQLite) |

## 生成的文档

### 核心文档

- [项目概览](./project-overview.md) - 项目基本信息和技术栈总览
- [架构文档](./architecture.md) - 详细系统架构设计
- [源码树分析](./source-tree-analysis.md) - 目录结构和关键文件说明
- [组件清单](./component-inventory.md) - Vue 组件和状态管理清单

### 开发文档

- [开发指南](./development-guide.md) - 环境配置、开发命令、结构约定

## 项目功能

| 模块 | 描述 |
|------|------|
| iCloud 照片同步 | 从 iCloud Photos Library 导入照片 |
| 自然语言搜索 | 使用 LLM 理解查询意图 |
| 照片浏览 | 时间线、网格视图 |
| 智能相册 | 按人物/地点自动分类 |

## 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | Electron 35 |
| 前端框架 | Vue 3.4 |
| 状态管理 | Pinia |
| UI 组件库 | Naive UI |
| 数据库 | sql.js |
| AI | OpenAI SDK |

## 开始使用

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## 文档更新

本文档通过 BMad Document Project Workflow 自动生成。

- **扫描模式**: Quick Scan
- **生成时间**: 2026-02-04
- **下次更新**: 修改代码库后重新运行文档生成
