# PhotoMind 组件清单

## 视图组件

| 组件 | 文件 | 描述 |
|------|------|------|
| **HomeView** | `views/HomeView.vue` | 应用首页，包含快捷入口、最近照片 |
| **PhotosView** | `views/PhotosView.vue` | 照片列表浏览 |
| **PhotoDetailView** | `views/PhotoDetailView.vue` | 照片详情页 |
| **SearchView** | `views/SearchView.vue` | 自然语言搜索界面 |
| **TimelineView** | `views/TimelineView.vue` | 时间线浏览 |
| **AlbumsView** | `views/AlbumsView.vue` | 智能相册页面 |

## UI 组件

| 组件 | 文件 | 描述 |
|------|------|------|
| **PhotoGrid** | `components/PhotoGrid.vue` | 照片网格展示组件 |

## 状态管理 (Pinia Stores)

| Store | 文件 | 用途 |
|-------|------|------|
| **photoStore** | `stores/photoStore.ts` | 照片数据、加载状态、同步管理 |
| **searchStore** | `stores/searchStore.ts` | 搜索查询、结果、筛选条件 |

## 路由配置

| 路由 | 组件 | 路径 |
|------|------|------|
| 首页 | HomeView | `/` |
| 照片列表 | PhotosView | `/photos` |
| 照片详情 | PhotoDetailView | `/photo/:id` |
| 搜索 | SearchView | `/search` |
| 时间线 | TimelineView | `/timeline` |
| 相册 | AlbumsView | `/albums` |

## 组件分类

| 类别 | 数量 | 组件 |
|------|------|------|
| **视图** | 6 | HomeView, PhotosView, PhotoDetailView, SearchView, TimelineView, AlbumsView |
| **UI 组件** | 1 | PhotoGrid |
| **状态管理** | 2 | photoStore, searchStore |

## 设计系统

| 项目 | 值 |
|------|-----|
| **UI 组件库** | Naive UI 2.38 |
| **图标库** | @vicons/fluent |
| **样式方案** | CSS Modules + Global CSS |
| **CSS 框架** | Native CSS (自定义) |
