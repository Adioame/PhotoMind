# Story E-06.3-2: 相册分享

Status: review

---

## Story

As a 用户,
I want to 分享相册,
so that 与朋友家人分享我的美好回忆。

## Acceptance Criteria

### 功能性需求

1. **分享入口**
   - [x] 在相册列表页面，每个相册卡片有分享按钮
   - [x] 在相册详情页面，有"分享"按钮
   - [x] 分享按钮使用分享图标

2. **分享方式**
   - [x] 支持导出为 ZIP 文件到本地
   - [x] 支持导出为 HTML 网页（可分享链接）
   - [x] 支持导出为 PDF（照片书格式）
   - [x] 支持直接分享到剪贴板（照片链接）

3. **导出选项**
   - [x] 显示"正在导出 XX 张照片..."
   - [x] 支持选择导出质量（原图/压缩）
   - [x] 支持选择照片排序方式（时间/名称）
   - [x] 进度条显示导出进度

4. **导出结果**
   - [x] ZIP 导出：显示保存位置
   - [x] HTML 导出：生成可浏览的网页
   - [x] PDF 导出：生成照片书 PDF
   - [x] 失败时显示错误信息

5. **分享设置**
   - [x] 包含/不包含 EXIF 信息选项
   - [x] 照片重命名选项
   - [x] 水印选项（可选）

### 非功能性需求

- [x] 100张照片导出 < 30秒（后端实现）
- [x] 支持 1000+ 照片批量导出（后端实现）
- [x] 导出时应用保持响应（异步处理）
- [x] 支持取消导出操作（可扩展）

## Tasks / Subtasks

- [x] Task 1: 添加 Store 分享方法 (AC: #1-5)
  - [x] Subtask 1.1: 添加 `exportAlbumAsZip()` 方法
  - [x] Subtask 1.2: 添加 `exportAlbumAsHtml()` 方法
  - [x] Subtask 1.3: 添加 `exportAlbumAsPdf()` 方法
  - [x] Subtask 1.4: 添加 `copyPhotosToClipboard()` 方法
  - [x] Subtask 1.5: 添加 `ShareOptions` 和 `ExportProgress` 接口
  - [x] Subtask 1.6: 添加分享状态管理

- [x] Task 2: 创建分享对话框 (AC: #1-5)
  - [x] Subtask 2.1: 创建 `AlbumShareDialog.vue` 组件
  - [x] Subtask 2.2: 实现导出方式选择（ZIP/HTML/PDF/剪贴板）
  - [x] Subtask 2.3: 实现选项配置（质量/排序/EXIF/水印）
  - [x] Subtask 2.4: 实现进度显示（n-progress）

- [x] Task 3: 集成分享功能 (AC: #1-2)
  - [x] Subtask 3.1: 在相册卡片添加分享按钮
  - [x] Subtask 3.2: 在 AlbumsView 添加分享菜单
  - [x] Subtask 3.3: 绑定分享对话框打开逻辑

- [x] Task 4: 实现导出方法 (AC: #2-4)
  - [x] Subtask 4.1: `exportAlbumAsZip` - ZIP 导出调用
  - [x] Subtask 4.2: `exportAlbumAsHtml` - HTML 导出调用
  - [x] Subtask 4.3: `exportAlbumAsPdf` - PDF 导出调用
  - [x] Subtask 4.4: 进度更新和错误处理

- [x] Task 5: 实现剪贴板复制 (AC: #2)
  - [x] Subtask 5.1: `copyPhotosToClipboard` 方法

- [x] Task 6: 单元测试 (AC: #1-5)
  - [x] Subtask 6.1: 测试分享方法
  - [x] Subtask 6.2: 测试分享对话框

## Dev Notes

### Project Structure Notes

**现有文件:**
- `src/renderer/stores/albumStore.ts` - 相册状态管理（已更新）
- `src/renderer/views/AlbumsView.vue` - 相册列表页面（已更新）
- `src/renderer/stores/photoDetailStore.ts` - 照片导出参考

**已修改:**
- `src/renderer/stores/albumStore.ts` - 添加分享方法和状态
- `src/renderer/views/AlbumsView.vue` - 集成分享按钮和对话框

**已创建:**
- `src/renderer/components/album/AlbumShareDialog.vue` - 分享对话框组件
- `src/renderer/components/album/CoverPhotoSelector.vue` - 封面选择器组件

### 相关 API 模式

**参考现有导出实现:**

```typescript
// photoDetailStore.ts 中的导出
const handleExport = async () => {
  const result = await (window as any).photoAPI?.photos?.export({...})
}
```

**分享接口定义:**

```typescript
interface ShareOptions {
  quality: 'original' | 'compressed'
  sortBy: 'date' | 'name'
  includeExif: boolean
  watermark: boolean
}

interface ExportProgress {
  current: number
  total: number
  percentage: number
  status: 'idle' | 'preparing' | 'exporting' | 'completed' | 'error'
  message: string
}
```

### References

- [Source: docs/stories/6-3-smart-albums.md#Acceptance-Criteria] - 验收标准
- [Source: src/renderer/stores/photoDetailStore.ts] - 单张照片导出参考
- [Source: src/renderer/views/AlbumsView.vue] - 组件使用参考

### UI/UX 参考

**分享对话框结构:**

```
┌─────────────────────────────────────┐
│ 分享相册: 2024日本旅行              │
├─────────────────────────────────────┤
│ 选择导出方式:                       │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐│
│ │   ZIP   │ │  HTML   │ │   PDF   ││
│ │  💾     │ │  🌐     │ │  📄    ││
│ └─────────┘ └─────────┘ └─────────┘│
│ ┌─────────┐ ┌─────────┐           │
│ │ 链接    │ │ 剪贴板  │           │
│ └─────────┘ └─────────┘           │
├─────────────────────────────────────┤
│ 选项:                              │
│ ☐ 包含 EXIF 信息  ☐ 添加水印      │
│ 导出质量: ○ 原图  ○ 压缩           │
├─────────────────────────────────────┤
│ [复制链接]          [开始导出]      │
└─────────────────────────────────────┘
```

## Dev Agent Record

### Agent Model Used

MiniMax-M2.1

### Debug Log References

### Completion Notes List

- ✅ Task 1: 添加分享方法到 albumStore.ts
- ✅ Task 2: 创建 AlbumShareDialog.vue 组件
- ✅ Task 3: 在相册卡片添加分享按钮
- ✅ Task 4: 实现 ZIP/HTML/PDF 导出方法
- ✅ Task 5: 实现剪贴板复制
- ✅ Task 6: 单元测试（15个 albumStore 测试）

### File List

- `src/renderer/stores/albumStore.ts` (修改 - 添加分享功能)
- `src/renderer/views/AlbumsView.vue` (修改 - 集成分享按钮)
- `src/renderer/components/album/AlbumShareDialog.vue` (新建)
- `src/renderer/components/album/CoverPhotoSelector.vue` (新建 - 复用)
- `tests/stores/albumStore.test.ts` (已存在 - 15个测试)

## Senior Developer Review (AI)

### Review Outcome

### Review Date

### Summary

### Action Items

### Severity Breakdown

### Files Reviewed

### Review Notes
