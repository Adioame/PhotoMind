# Story E-06.3: 智能相册

## Story Overview

**原始需求描述**:
作为用户，我希望能够创建智能相册，根据条件自动筛选照片，比如"2024年日本旅行"、"儿子的照片"等。

**描述**:
实现智能相册功能，支持创建基于搜索条件的自动相册，以及手动管理的普通相册。

## Acceptance Criteria

### 功能性需求
- [ ] 创建智能相册（基于搜索条件）
- [ ] 创建普通相册（手动添加照片）
- [ ] 智能相册自动更新
- [ ] 相册封面设置
- [ ] 相册描述编辑
- [ ] 相册排序（创建时间/照片数量）
- [ ] 相册分享（导出）
- [ ] 相册删除
- [ ] 显示相册照片列表

### 非功能性需求
- [ ] 智能更新 < 10秒（1000张照片）
- [ ] 支持 100+ 相册

## Implementation Steps

### Phase 1: 相册 Store

**文件**: `src/renderer/stores/albumStore.ts`

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Album {
  id: number
  uuid: string
  name: string
  description?: string
  coverPhotoId?: number
  coverPhotoPath?: string
  type: 'smart' | 'manual'
  query?: string  // 智能相册的搜索条件
  photoCount: number
  createdAt: string
  updatedAt: string
}

export const useAlbumStore = defineStore('album', () => {
  const albums = ref<Album[]>([])
  const currentAlbum = ref<Album | null>(null)
  const loading = ref(false)
  const albumPhotos = ref<any[]>([])

  const smartAlbums = computed(() =>
    albums.value.filter(a => a.type === 'smart')
  )

  const manualAlbums = computed(() =>
    albums.value.filter(a => a.type === 'manual')
  )

  async function loadAlbums() {
    loading.value = true
    try {
      const response = await (window as any).photoAPI.albums.getAll()
      albums.value = response || []
    } finally {
      loading.value = false
    }
  }

  async function createSmartAlbum(name: string, query: string) {
    const response = await (window as any).photoAPI.albums.createSmart(name, query)
    albums.value.push(response)
    return response
  }

  async function createManualAlbum(name: string) {
    const response = await (window as any).photoAPI.albums.createManual(name)
    albums.value.push(response)
    return response
  }

  async function loadAlbumPhotos(albumId: string) {
    const response = await (window as any).photoAPI.albums.getPhotos(albumId)
    albumPhotos.value = response || []
  }

  async function deleteAlbum(albumId: number) {
    await (window as any).photoAPI.albums.delete(albumId)
    albums.value = albums.value.filter(a => a.id !== albumId)
  }

  async function updateAlbum(albumId: number, updates: Partial<Album>) {
    const response = await (window as any).photoAPI.albums.update(albumId, updates)
    const index = albums.value.findIndex(a => a.id === albumId)
    if (index >= 0) {
      albums.value[index] = response
    }
  }

  return {
    albums,
    currentAlbum,
    loading,
    albumPhotos,
    smartAlbums,
    manualAlbums,
    loadAlbums,
    createSmartAlbum,
    createManualAlbum,
    loadAlbumPhotos,
    deleteAlbum,
    updateAlbum
  }
})
```

### Phase 2: 相册视图

**文件**: `src/renderer/views/AlbumsView.vue`

```vue
<template>
  <div class="albums-container">
    <!-- 智能相册 -->
    <section class="album-section">
      <h2>智能相册</h2>
      <div class="albums-grid">
        <div
          v-for="album in smartAlbums"
          :key="album.id"
          class="album-card smart"
          @click="openAlbum(album)"
        >
          <div class="album-cover">
            <img :src="album.coverPhotoPath" />
            <span class="album-type">智能</span>
          </div>
          <div class="album-info">
            <h3>{{ album.name }}</h3>
            <p>{{ album.photoCount }} 张照片</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 普通相册 -->
    <section class="album-section">
      <h2>我的相册</h2>
      <div class="albums-grid">
        <div
          v-for="album in manualAlbums"
          :key="album.id"
          class="album-card"
          @click="openAlbum(album)"
        >
          <div class="album-cover">
            <img :src="album.coverPhotoPath" />
          </div>
          <div class="album-info">
            <h3>{{ album.name }}</h3>
            <p>{{ album.photoCount }} 张照片</p>
          </div>
        </div>

        <!-- 创建相册 -->
        <div class="album-card create" @click="showCreateDialog = true">
          <div class="create-icon">+</div>
          <p>创建相册</p>
        </div>
      </div>
    </section>
  </div>
</template>
```

## 相关文件

- `src/renderer/stores/albumStore.ts`
- `src/renderer/views/AlbumsView.vue`
- `electron/services/albumService.ts`
- `electron/services/smartAlbumService.ts`

## 测试用例

```typescript
describe('AlbumStore', () => {
  it('should create smart album', async () => {
    const store = useAlbumStore()
    const album = await store.createSmartAlbum(
      'Japan 2024',
      '2024 AND location:Japan'
    )

    expect(album.type).toBe('smart')
    expect(album.query).toBe('2024 AND location:Japan')
  })

  it('should filter albums by type', () => {
    const store = useAlbumStore()
    expect(store.smartAlbums.every(a => a.type === 'smart')).toBe(true)
    expect(store.manualAlbums.every(a => a.type === 'manual')).toBe(true)
  })
})
```
