# Story E-06.1: 照片详情页

## Story Overview

**原始需求描述**:
作为用户，我希望能够查看单张照片的详细信息，包括 EXIF 元数据、拍摄地点、人物标签等，并且可以对这个照片进行编辑和操作。

**描述**:
实现照片详情页面，展示照片的高清预览、完整的元数据信息、人物标签、相关照片推荐，以及编辑操作（删除、导出、设为封面等）。

## Acceptance Criteria

### 功能性需求
- [x] 显示高清照片预览
- [x] 展示完整 EXIF 元数据
- [x] 显示拍摄地点（地图或地址）
- [x] 显示人物标签
- [ ] 支持放大/缩小/旋转
- [ ] 支持全屏查看
- [ ] 支持照片导出
- [ ] 支持删除照片
- [ ] 显示相似照片推荐
- [ ] 支持键盘快捷键导航

### 非功能性需求
- [ ] 照片加载 < 2秒（网络正常）
- [ ] 界面响应流畅
- [ ] 支持 4K 分辨率显示
- [ ] 键盘导航支持

## Tasks/Subtasks

### Phase 1: Store 层实现
- [x] **T-01** 创建 `photoDetailStore.ts` 状态管理
- [x] **T-02** 实现 `loadPhoto` 加载照片详情
- [x] **T-03** 实现 `loadSimilarPhotos` 加载相似照片
- [x] **T-04** 实现 `navigateTo` 导航功能

### Phase 2: 组件层实现
- [x] **T-05** 更新 `PhotoDetailView.vue` 集成 store
- [ ] **T-06** 实现照片预览区（缩放、旋转、全屏）
- [x] **T-07** 实现信息面板（EXIF、地点、人物）
- [x] **T-08** 实现导航控制

### Phase 3: 操作功能
- [x] **T-09** 实现照片导出功能
- [x] **T-10** 实现照片删除功能
- [x] **T-11** 实现键盘快捷键

### Phase 4: 测试
- [x] **T-12** 编写 Store 单元测试
- [x] **T-13** 编写组件集成测试

## Implementation Steps

### Phase 1: 照片详情 Store

**文件**: `src/renderer/stores/photoDetailStore.ts`

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface PhotoDetail {
  id: number
  uuid: string
  fileName: string
  filePath: string
  thumbnailPath?: string
  takenAt?: string
  width?: number
  height?: number
  location?: {
    name?: string
    latitude?: number
    longitude?: number
  }
  metadata?: {
    camera?: string
    lens?: string
    aperture?: string
    iso?: number
    shutterSpeed?: string
    focalLength?: string
  }
  persons?: Array<{
    id: number
    name: string
  }>
}

export const usePhotoDetailStore = defineStore('photoDetail', () => {
  const photo = ref<PhotoDetail | null>(null)
  const loading = ref(false)
  const similarPhotos = ref<PhotoDetail[]>([])
  const currentIndex = ref(0)

  const hasPhoto = computed(() => photo.value !== null)
  const isFirst = computed(() => currentIndex.value === 0)
  const isLast = computed(() => !similarPhotos.value.length || currentIndex.value >= similarPhotos.value.length - 1)

  async function loadPhoto(id: string) {
    loading.value = true
    try {
      const response = await (window as any).photoAPI.photos.getDetail(id)
      photo.value = response
      await loadSimilarPhotos(id)
    } finally {
      loading.value = false
    }
  }

  async function loadSimilarPhotos(photoId: string) {
    similarPhotos.value = []
  }

  function navigateTo(direction: 'prev' | 'next') {
    if (direction === 'prev' && !isFirst.value) {
      currentIndex.value--
    } else if (direction === 'next' && !isLast.value) {
      currentIndex.value++
    }
  }

  function reset() {
    photo.value = null
    similarPhotos.value = []
    currentIndex.value = 0
  }

  return {
    photo,
    loading,
    similarPhotos,
    currentIndex,
    hasPhoto,
    isFirst,
    isLast,
    loadPhoto,
    loadSimilarPhotos,
    navigateTo,
    reset
  }
})
```

### Phase 2: 照片详情组件

**文件**: `src/renderer/views/PhotoDetailView.vue`

```vue
<template>
  <div class="photo-detail-container">
    <n-spin v-if="loading" size="large" />

    <template v-else-if="photo">
      <div class="photo-content">
        <!-- 图片预览区 -->
        <div class="image-viewer">
          <n-image
            :src="photo.thumbnailPath"
            :preview-src="photo.filePath"
            object-fit="contain"
          />

          <!-- 导航按钮 -->
          <button class="nav-btn prev" @click="navigateTo('prev')">
            <ChevronLeft24Regular />
          </button>
          <button class="nav-btn next" @click="navigateTo('next')">
            <ChevronRight24Regular />
          </button>
        </div>

        <!-- 信息面板 -->
        <div class="info-panel">
          <h2>{{ photo.fileName }}</h2>

          <!-- 元数据 -->
          <div class="metadata-section">
            <h3>基本信息</h3>
            <n-descriptions :column="1">
              <n-descriptions-item label="拍摄时间">
                {{ formatDateTime(photo.takenAt) }}
              </n-descriptions-item>
              <n-descriptions-item label="尺寸">
                {{ photo.width }} x {{ photo.height }}
              </n-descriptions-item>
            </n-descriptions>
          </div>

          <!-- 地点 -->
          <div v-if="photo.location" class="location-section">
            <h3>拍摄地点</h3>
            <p>{{ photo.location.name }}</p>
          </div>

          <!-- 人物标签 -->
          <div v-if="photo.persons?.length" class="persons-section">
            <h3>人物</h3>
            <n-tag v-for="person in photo.persons" :key="person.id">
              {{ person.name }}
            </n-tag>
          </div>
        </div>
      </div>
    </template>
  </template>
</template>
```

## Dev Notes

### 技术决策
- 使用 Pinia Store 管理照片详情状态
- 支持多照片导航
- 与 photoStore 解耦

### 已知问题
- 相似照片功能待后端支持
- 全屏查看需额外组件

## File List

- `src/renderer/stores/photoDetailStore.ts` (修改 - 添加 deletePhoto, exportPhoto)
- `src/renderer/views/PhotoDetailView.vue` (修改 - 实现删除、导出、键盘快捷键、全屏)
- `tests/stores/photoDetailStore.test.ts` (修改 - 添加删除和导出测试)
- `tests/views/photoDetailView.test.ts` (新建 - 18 个组件集成测试)
- `electron/preload/index.ts` (修改 - 添加 photos:delete, photos:export IPC)
- `electron/main/index.ts` (修改 - 添加 photos:delete, photos:export handler)
- `electron/services/localPhotoService.ts` (修改 - 添加 deletePhoto 方法)
- `vitest.config.ts` (修改 - 添加路径别名配置)

## Dev Agent Record

### Debug Log

### Implementation Plan

**T-10: 照片删除功能实现**
- 在 `photoDetailStore.ts` 中添加 `deletePhoto` action
- 调用 IPC 接口 `photos:delete` 删除照片
- 删除成功后清除 store 状态并返回上一页
- 在 `PhotoDetailView.vue` 中实现删除确认对话框
- 添加 3 个单元测试验证删除功能

### Completion Notes

**T-10 已完成**:
- Store 层添加 deletePhoto action (src/renderer/stores/photoDetailStore.ts)
- IPC 接口添加 photos:delete (electron/preload/index.ts)
- IPC Handler 添加 photos:delete 处理 (electron/main/index.ts)
- LocalPhotoService 添加 deletePhoto 方法 (electron/services/localPhotoService.ts)
- PhotoDetailView.vue 更新 handleDelete 函数
- 新增 3 个单元测试

**T-09 已完成**:
- Store 层添加 exportPhoto action (src/renderer/stores/photoDetailStore.ts)
- IPC 接口添加 photos:export (electron/preload/index.ts)
- IPC Handler 添加 photos:export 处理 (electron/main/index.ts)
- PhotoDetailView.vue 更新 handleExport 函数
- 新增 3 个单元测试

**T-11 已完成**:
- 添加键盘快捷键支持 (PhotoDetailView.vue)
- ← / →: 导航上/下一张照片
- Delete: 删除照片
- E: 导出照片
- F: 全屏切换
- Esc: 退出全屏
- 添加全屏按钮和快捷键提示面板

**T-13 已完成**:
- 新建 tests/views/photoDetailView.test.ts
- 18 个组件功能测试覆盖全部核心功能
- 所有 127 个测试通过

**T-01~T-04: Store 层实现**
- 创建 `photoDetailStore.ts`，包含 PhotoDetail 接口定义
- 实现状态管理：photo, loading, similarPhotos, currentIndex
- 实现 getter：hasPhoto, isFirst, isLast, currentPhoto
- 实现 actions：loadPhoto, loadSimilarPhotos, navigateTo, goToPhoto, reset

**T-05~T-08: 组件层实现**
- 更新 `PhotoDetailView.vue` 集成 photoDetailStore
- 实现照片预览区（支持 navigation）
- 实现信息面板（EXIF、地点、人物标签）
- 实现导航按钮控制

## Change Log

- 2026-02-05: 实现 T-10 照片删除功能
  - 添加 Store 层 deletePhoto action
  - 添加 IPC 接口和 Handler
  - 添加 LocalPhotoService deletePhoto 方法
  - 更新 PhotoDetailView 删除交互
  - 新增 3 个单元测试

- 2026-02-05: 实现 T-09 照片导出功能
  - 添加 Store 层 exportPhoto action
  - 添加 IPC photos:export 接口和 Handler
  - 更新 PhotoDetailView 导出交互
  - 新增 3 个单元测试

- 2026-02-05: 实现 T-11 键盘快捷键
  - 添加键盘事件监听
  - 支持 ←/→ 导航、Delete 删除、E 导出、F 全屏
  - 添加全屏按钮和快捷键提示面板

- 2026-02-05: 实现 T-13 组件集成测试
  - 新建 tests/views/photoDetailView.test.ts
  - 18 个组件功能测试

## Status: in-progress
