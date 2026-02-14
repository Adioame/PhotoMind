/**
 * PhotoMind - 照片详情视图
 * 反AI味 · 现代极简主义设计
 */
<template>
  <div class="photo-detail-container">
    <!-- 面包屑导航 -->
    <div class="breadcrumb-wrapper">
      <BreadcrumbNav :items="breadcrumbItems" />
    </div>

    <!-- 加载状态 -->
    <div class="loading-state" v-if="loading">
      <n-spin size="large" />
      <p>加载照片信息...</p>
    </div>

    <!-- 照片内容 -->
    <template v-else-if="currentPhoto">
      <div class="photo-content">
        <!-- 图片预览区 -->
        <div class="image-viewer">
          <n-image
            :src="getPhotoUrl(currentPhoto)"
            :preview-src="getPhotoUrl(currentPhoto)"
            object-fit="contain"
            style="width: 100%; height: 100%;"
          />

          <!-- 导航按钮 -->
          <button
            v-if="hasPrev"
            class="nav-btn prev"
            @click="navigateTo('prev')"
          >
            <ChevronLeft24Regular />
          </button>
          <button
            v-if="hasNext"
            class="nav-btn next"
            @click="navigateTo('next')"
          >
            <ChevronRight24Regular />
          </button>

          <!-- 全屏按钮 -->
          <button
            class="nav-btn fullscreen-btn"
            @click="toggleFullscreen"
            :title="isFullscreen ? '退出全屏 (F)' : '全屏 (F)'"
          >
            <FullScreenMinimize24Regular v-if="isFullscreen" />
            <FullScreenMaximize24Regular v-else />
          </button>
        </div>

        <!-- 信息面板 -->
        <div class="info-panel">
          <div class="panel-header">
            <h2>{{ currentPhoto.fileName || currentPhoto.file_name }}</h2>
            <n-button text circle @click="goBack">
              <template #icon>
                <n-icon size="20"><Dismiss24Regular /></n-icon>
              </template>
            </n-button>
          </div>

          <div class="photo-meta">
            <!-- 拍摄时间 -->
            <div class="meta-item" v-if="currentPhoto.takenAt || currentPhoto.taken_at">
              <n-icon size="20" color="#0071E3">
                <CalendarToday24Regular />
              </n-icon>
              <div class="meta-content">
                <span class="meta-label">拍摄时间</span>
                <span class="meta-value">{{ formatDateTime(currentPhoto.takenAt || currentPhoto.taken_at) }}</span>
              </div>
            </div>

            <!-- 地点 -->
            <div class="meta-item" v-if="currentPhoto.location?.name">
              <n-icon size="20" color="#0071E3">
                <Location24Regular />
              </n-icon>
              <div class="meta-content">
                <span class="meta-label">拍摄地点</span>
                <span class="meta-value">{{ currentPhoto.location.name }}</span>
              </div>
            </div>

            <!-- 尺寸 -->
            <div class="meta-item" v-if="currentPhoto.width">
              <n-icon size="20" color="#0071E3">
                <Image24Regular />
              </n-icon>
              <div class="meta-content">
                <span class="meta-label">照片尺寸</span>
                <span class="meta-value">{{ currentPhoto.width }} x {{ currentPhoto.height }}</span>
              </div>
            </div>

            <!-- 文件大小 -->
            <div class="meta-item" v-if="currentPhoto.fileSize || currentPhoto.file_size">
              <n-icon size="20" color="#0071E3">
                <Document24Regular />
              </n-icon>
              <div class="meta-content">
                <span class="meta-label">文件大小</span>
                <span class="meta-value">{{ formatFileSize(currentPhoto.fileSize || currentPhoto.file_size) }}</span>
              </div>
            </div>
          </div>

          <!-- EXIF 信息 -->
          <n-collapse v-if="hasExifData">
            <n-collapse-item title="EXIF 信息" name="exif">
              <n-descriptions :column="1" label-placement="left">
                <n-descriptions-item label="相机" v-if="currentPhoto.metadata?.camera">
                  {{ currentPhoto.metadata.camera }}
                </n-descriptions-item>
                <n-descriptions-item label="镜头" v-if="currentPhoto.metadata?.lens">
                  {{ currentPhoto.metadata.lens }}
                </n-descriptions-item>
                <n-descriptions-item label="光圈" v-if="currentPhoto.metadata?.aperture">
                  f/{{ currentPhoto.metadata.aperture }}
                </n-descriptions-item>
                <n-descriptions-item label="ISO" v-if="currentPhoto.metadata?.iso">
                  {{ currentPhoto.metadata.iso }}
                </n-descriptions-item>
                <n-descriptions-item label="快门速度" v-if="currentPhoto.metadata?.shutterSpeed">
                  {{ currentPhoto.metadata.shutterSpeed }}s
                </n-descriptions-item>
                <n-descriptions-item label="焦距" v-if="currentPhoto.metadata?.focalLength">
                  {{ currentPhoto.metadata.focalLength }}mm
                </n-descriptions-item>
              </n-descriptions>
            </n-collapse-item>
          </n-collapse>

          <!-- 人物标签 -->
          <div v-if="currentPhoto.persons?.length" class="persons-section">
            <h3>人物</h3>
            <div class="persons-tags">
              <n-tag
                v-for="person in currentPhoto.persons"
                :key="person.id"
                round
                size="medium"
              >
                {{ person.name }}
              </n-tag>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="action-buttons">
            <n-button block @click="handleExport">
              <template #icon>
                <n-icon><ArrowDownload24Regular /></n-icon>
              </template>
              导出照片
            </n-button>
            <n-button block type="error" ghost @click="handleDelete">
              <template #icon>
                <n-icon><Delete24Regular /></n-icon>
              </template>
              删除照片
            </n-button>
          </div>

          <!-- 快捷键提示 -->
          <div class="shortcuts-hint">
            <n-divider />
            <div class="shortcuts-list">
              <div class="shortcut-item">
                <kbd>←</kbd> <kbd>→</kbd>
                <span>切换照片</span>
              </div>
              <div class="shortcut-item">
                <kbd>E</kbd>
                <span>导出</span>
              </div>
              <div class="shortcut-item">
                <kbd>Delete</kbd>
                <span>删除</span>
              </div>
              <div class="shortcut-item">
                <kbd>F</kbd>
                <span>全屏</span>
              </div>
              <div class="shortcut-item">
                <kbd>Esc</kbd>
                <span>退出全屏</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 错误状态 -->
    <EmptyState
      v-else-if="error"
      type="error"
      :title="error"
      description="该照片可能已被删除或不存在"
      :primary-action="{
        label: '返回',
        onClick: goBack
      }"
    />

    <!-- 空状态（无数据） -->
    <EmptyState
      v-else
      type="empty"
      title="无照片数据"
      description="请选择一张照片查看"
      :primary-action="{
        label: '返回',
        onClick: goBack
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Dismiss24Regular,
  CalendarToday24Regular,
  Location24Regular,
  Image24Regular,
  Document24Regular,
  ArrowDownload24Regular,
  ChevronLeft24Regular,
  ChevronRight24Regular,
  Delete24Regular,
  FullScreenMaximize24Regular,
  FullScreenMinimize24Regular,
  Home24Regular,
  People24Regular,
  Person24Regular,
  ImageMultiple24Regular
} from '@vicons/fluent'
import { useMessage, useDialog } from 'naive-ui'
import { usePhotoStore } from '@/stores/photoStore'
import { toLocalResourceProtocol } from '@/utils/localResource'
import EmptyState from '@/components/EmptyState.vue'
import BreadcrumbNav, { type BreadcrumbItem } from '@/components/nav/BreadcrumbNav.vue'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const dialog = useDialog()
const photoStore = usePhotoStore()

// 当前照片状态
const currentPhoto = ref<any>(null)
const loading = ref(false)
const error = ref('')

// 全屏状态
const isFullscreen = ref(false)

// 统一字段映射：将数据库下划线命名转换为前端驼峰命名
const normalizePhotoFields = (photo: any) => {
  if (!photo) return null

  return {
    ...photo,
    // 统一转换为驼峰命名（前端标准）
    filePath: photo.filePath || photo.file_path,
    thumbnailPath: photo.thumbnailPath || photo.thumbnail_path || photo.thumbnail_url,
    // 保留原始字段以防万一
    file_path: photo.file_path || photo.filePath,
    thumbnail_path: photo.thumbnail_path || photo.thumbnailPath,
  }
}

// 获取照片 URL - 优先使用原图，回退缩略图
const getPhotoUrl = (photo: any) => {
  if (!photo) return ''

  // 先统一字段映射
  const normalizedPhoto = normalizePhotoFields(photo)

  // 尝试所有可能的路径字段（按优先级）
  const possiblePaths = [
    normalizedPhoto.filePath,           // 驼峰原图
    normalizedPhoto.file_path,          // 下划线原图
    normalizedPhoto.thumbnailPath,      // 驼峰缩略图
    normalizedPhoto.thumbnail_path,     // 下划线缩略图
    normalizedPhoto.thumbnail_url,      // 其他命名
  ]

  // 找到第一个有效的
  const validPath = possiblePaths.find(p => p && typeof p === 'string' && p.length > 0)

  if (!validPath) {
    console.error('[PhotoDetailView] 未找到任何有效路径，照片对象:', photo)
    return ''
  }

  console.log('[PhotoDetailView] 使用路径:', validPath)

  if (validPath && (validPath.startsWith('/') || /^[a-z]:/i.test(validPath))) {
    const url = toLocalResourceProtocol(validPath)
    console.log('[PhotoDetailView] 生成URL:', url)
    return url
  }

  return validPath || ''
}

// 图片加载错误处理
const imageError = ref(false)
const currentImageUrl = ref('')

const handleImageError = () => {
  console.error('[PhotoDetailView] 图片加载失败，尝试缩略图')
  const thumbnailPath = currentPhoto.value?.thumbnailPath || currentPhoto.value?.thumbnail_path
  if (thumbnailPath) {
    currentImageUrl.value = toLocalResourceProtocol(thumbnailPath)
    imageError.value = false
  } else {
    imageError.value = true
  }
}

// 检查是否有 EXIF 数据
const hasExifData = computed(() => {
  const meta = currentPhoto.value?.metadata || currentPhoto.value?.exif
  return !!(meta?.camera || meta?.lens || meta?.aperture || meta?.iso || meta?.shutterSpeed)
})

// 导航状态
const currentIndex = computed(() => {
  return photoStore.photos.findIndex(p => String(p.id) === String(route.params.id))
})

const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < photoStore.photos.length - 1)

const navigateTo = (direction: 'prev' | 'next') => {
  const currentIdx = currentIndex.value
  if (currentIdx === -1) return

  const newIndex = direction === 'prev' ? currentIdx - 1 : currentIdx + 1
  if (newIndex >= 0 && newIndex < photoStore.photos.length) {
    const nextPhoto = photoStore.photos[newIndex]
    router.push(`/photo/${nextPhoto.id}`)
    // 更新当前照片
    currentPhoto.value = nextPhoto
  }
}

// 面包屑项
const breadcrumbItems = computed((): BreadcrumbItem[] => {
  const from = route.query.from as string
  const personId = route.query.personId as string

  if (from === 'person' && personId) {
    const personName = currentPhoto.value?.persons?.find(p => String(p.id) === personId)?.name || '人物'
    return [
      { label: '首页', path: '/', icon: Home24Regular },
      { label: '人物', path: '/people', icon: People24Regular },
      { label: personName, path: `/people/${personId}`, icon: Person24Regular },
      { label: '照片详情' }
    ]
  }

  return [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '照片', path: '/photos', icon: ImageMultiple24Regular },
    { label: '照片详情' }
  ]
})

// 加载照片 - 直接调用 API，不依赖缓存
const loadPhoto = async () => {
  const id = route.params.id as string
  loading.value = true
  error.value = ''

  console.log('[PhotoDetailView] 加载照片, ID:', id)

  // 🎯 修正：直接通过 IPC 调用获取照片详情，不依赖 photoStore 缓存
  // 从人物详情页进入时 photoStore.photos 为空，必须从 API 获取
  try {
    const result = await (window as any).photoAPI?.photos?.getDetail(id)
    console.log('[PhotoDetailView] API 返回:', result)

    if (result && (result.id || result.photo_id)) {
      console.log('[PhotoDetailView] ✅ 照片加载成功:', result.id || result.photo_id)
      currentPhoto.value = result
    } else {
      console.error('[PhotoDetailView] 照片不存在或返回空数据:', id)
      error.value = '照片不存在'
    }
  } catch (err) {
    console.error('[PhotoDetailView] 加载失败:', err)
    error.value = '加载失败'
  } finally {
    loading.value = false
  }
}

// 智能返回
const goBack = () => {
  const from = route.query.from as string
  const personId = route.query.personId as string

  if (from === 'person' && personId) {
    router.push(`/people/${personId}`)
  } else {
    router.back()
  }
}

// 格式化日期时间
const formatDateTime = (dateStr?: string): string => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// 格式化文件大小
const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 导出照片
const handleExport = async () => {
  if (!currentPhoto.value) return

  const photo = currentPhoto.value
  const result = await (window as any).photoAPI?.photos?.export({
    photoId: photo.id || photo.photo_id,
    filePath: photo.filePath || photo.file_path,
    exportPath: photo.fileName || photo.file_name
  })

  if (result?.success) {
    message.success(`照片已导出到: ${result.exportPath}`)
  } else {
    message.error(result?.error || '导出失败')
  }
}

// 删除照片
const handleDelete = async () => {
  if (!currentPhoto.value) return

  const photo = currentPhoto.value
  const photoId = photo.id || photo.photo_id
  const fileName = photo.fileName || photo.file_name

  dialog.warning({
    title: '确认删除',
    content: `确定要删除「${fileName}」吗？此操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      if (!photoId) return

      try {
        const result = await (window as any).photoAPI?.photos?.delete(photoId)

        if (result?.success) {
          message.success('照片已删除')
          router.back()
        } else {
          message.error(result?.error || '删除失败')
        }
      } catch (err) {
        console.error('删除失败:', err)
        message.error('删除失败')
      }
    }
  })
}

// 切换全屏
const toggleFullscreen = () => {
  const container = document.querySelector('.photo-detail-container') as HTMLElement
  if (!container) return

  if (!document.fullscreenElement) {
    container.requestFullscreen()
    isFullscreen.value = true
  } else {
    document.exitFullscreen()
    isFullscreen.value = false
  }
}

// 键盘快捷键处理
const handleKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    return
  }

  switch (event.key) {
    case 'ArrowLeft':
      if (hasPrev.value) {
        navigateTo('prev')
      }
      break
    case 'ArrowRight':
      if (hasNext.value) {
        navigateTo('next')
      }
      break
    case 'Delete':
    case 'Backspace':
      if (currentPhoto.value) {
        event.preventDefault()
        handleDelete()
      }
      break
    case 'e':
    case 'E':
      if (currentPhoto.value) {
        event.preventDefault()
        handleExport()
      }
      break
    case 'f':
    case 'F':
      if (currentPhoto.value) {
        event.preventDefault()
        toggleFullscreen()
      }
      break
    case 'Escape':
      if (document.fullscreenElement) {
        document.exitFullscreen()
        isFullscreen.value = false
      }
      break
  }
}

// 监听全屏变化
const handleFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
}

// 监听路由参数变化（在同一组件内切换照片）
watch(() => route.params.id, (newId, oldId) => {
  if (newId && newId !== oldId) {
    console.log('[PhotoDetailView] 路由参数变化，重新加载:', newId)
    loadPhoto()
  }
}, { immediate: false })

// 初始化
onMounted(() => {
  loadPhoto()
  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

// 清理
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})
</script>

<style scoped>
/* ================================
   容器
   ================================ */
.photo-detail-container {
  height: 100vh;
  background: #1a1a1a;
  display: flex;
  flex-direction: column;
}

.breadcrumb-wrapper {
  background: var(--bg-secondary);
  padding: var(--space-sm) var(--space-lg);
  border-bottom: 1px solid var(--border-light);
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: var(--text-tertiary);
}

.loading-state p {
  margin-top: var(--space-md);
}

.photo-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ================================
   图片查看器
   ================================ */
.image-viewer {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  position: relative;
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-default);
  backdrop-filter: blur(10px);
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-50%) scale(1.05);
}

.nav-btn.prev {
  left: var(--space-lg);
}

.nav-btn.next {
  right: var(--space-lg);
}

.nav-btn.fullscreen-btn {
  top: var(--space-lg);
  right: var(--space-lg);
  left: auto;
  transform: none;
}

.nav-btn.fullscreen-btn:hover {
  transform: scale(1.05);
}

/* ================================
   信息面板
   ================================ */
.info-panel {
  width: 380px;
  background: var(--bg-secondary);
  padding: var(--space-lg);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-lg);
}

.panel-header h2 {
  font-size: var(--text-h3);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0;
  flex: 1;
  word-break: break-all;
}

.photo-meta {
  margin-bottom: var(--space-lg);
}

.meta-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--border-light);
}

.meta-item:last-child {
  border-bottom: none;
}

.meta-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meta-label {
  font-size: var(--text-small);
  color: var(--text-tertiary);
}

.meta-value {
  font-size: var(--text-body);
  color: var(--text-primary);
}

.persons-section {
  margin-bottom: var(--space-lg);
}

.persons-section h3 {
  font-size: var(--text-body);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--space-sm);
}

.persons-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.action-buttons {
  margin-top: auto;
  padding-top: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.shortcuts-hint {
  margin-top: var(--space-md);
}

.shortcuts-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--text-small);
  color: var(--text-secondary);
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.shortcut-item kbd {
  display: inline-block;
  padding: 2px 6px;
  font-size: 11px;
  font-family: var(--font-mono);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  min-width: 24px;
  text-align: center;
}

.shortcut-item span {
  color: var(--text-tertiary);
}

/* ================================
   响应式
   ================================ */
@media (max-width: 768px) {
  .photo-content {
    flex-direction: column;
  }

  .info-panel {
    width: 100%;
    height: 50%;
  }

  .nav-btn {
    width: 40px;
    height: 40px;
  }

  .nav-btn.prev {
    left: var(--space-md);
  }

  .nav-btn.next {
    right: var(--space-md);
  }

  .nav-btn.fullscreen-btn {
    top: var(--space-md);
    right: var(--space-md);
  }
}
</style>
