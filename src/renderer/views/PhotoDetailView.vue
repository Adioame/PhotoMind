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
    <div class="loading-state" v-if="photoStore.loading">
      <n-spin size="large" />
      <p>加载照片信息...</p>
    </div>

    <!-- 照片内容 -->
    <template v-else-if="photoStore.photo">
      <div class="photo-content">
        <!-- 图片预览区 -->
        <div class="image-viewer">
          <n-image
            :src="getPhotoUrl(photoStore.photo)"
            :preview-src="getPhotoUrl(photoStore.photo)"
            object-fit="contain"
            style="width: 100%; height: 100%;"
          />

          <!-- 导航按钮 -->
          <button
            v-if="!photoStore.isFirst"
            class="nav-btn prev"
            @click="photoStore.navigateTo('prev')"
          >
            <ChevronLeft24Regular />
          </button>
          <button
            v-if="!photoStore.isLast"
            class="nav-btn next"
            @click="photoStore.navigateTo('next')"
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
            <h2>{{ photoStore.photo.fileName }}</h2>
            <n-button text circle @click="goBack">
              <template #icon>
                <n-icon size="20"><Dismiss24Regular /></n-icon>
              </template>
            </n-button>
          </div>

          <div class="photo-meta">
            <!-- 拍摄时间 -->
            <div class="meta-item" v-if="photoStore.photo.takenAt">
              <n-icon size="20" color="#0071E3">
                <CalendarToday24Regular />
              </n-icon>
              <div class="meta-content">
                <span class="meta-label">拍摄时间</span>
                <span class="meta-value">{{ formatDateTime(photoStore.photo.takenAt) }}</span>
              </div>
            </div>

            <!-- 地点 -->
            <div class="meta-item" v-if="photoStore.photo.location?.name">
              <n-icon size="20" color="#0071E3">
                <Location24Regular />
              </n-icon>
              <div class="meta-content">
                <span class="meta-label">拍摄地点</span>
                <span class="meta-value">{{ photoStore.photo.location.name }}</span>
              </div>
            </div>

            <!-- 尺寸 -->
            <div class="meta-item" v-if="photoStore.photo.width">
              <n-icon size="20" color="#0071E3">
                <Image24Regular />
              </n-icon>
              <div class="meta-content">
                <span class="meta-label">照片尺寸</span>
                <span class="meta-value">{{ photoStore.photo.width }} x {{ photoStore.photo.height }}</span>
              </div>
            </div>

            <!-- 文件大小 -->
            <div class="meta-item" v-if="photoStore.photo.fileSize">
              <n-icon size="20" color="#0071E3">
                <Document24Regular />
              </n-icon>
              <div class="meta-content">
                <span class="meta-label">文件大小</span>
                <span class="meta-value">{{ formatFileSize(photoStore.photo.fileSize) }}</span>
              </div>
            </div>
          </div>

          <!-- EXIF 信息 -->
          <n-collapse v-if="hasExifData">
            <n-collapse-item title="EXIF 信息" name="exif">
              <n-descriptions :column="1" label-placement="left">
                <n-descriptions-item label="相机" v-if="photoStore.photo.metadata?.camera">
                  {{ photoStore.photo.metadata.camera }}
                </n-descriptions-item>
                <n-descriptions-item label="镜头" v-if="photoStore.photo.metadata?.lens">
                  {{ photoStore.photo.metadata.lens }}
                </n-descriptions-item>
                <n-descriptions-item label="光圈" v-if="photoStore.photo.metadata?.aperture">
                  f/{{ photoStore.photo.metadata.aperture }}
                </n-descriptions-item>
                <n-descriptions-item label="ISO" v-if="photoStore.photo.metadata?.iso">
                  {{ photoStore.photo.metadata.iso }}
                </n-descriptions-item>
                <n-descriptions-item label="快门速度" v-if="photoStore.photo.metadata?.shutterSpeed">
                  {{ photoStore.photo.metadata.shutterSpeed }}s
                </n-descriptions-item>
                <n-descriptions-item label="焦距" v-if="photoStore.photo.metadata?.focalLength">
                  {{ photoStore.photo.metadata.focalLength }}mm
                </n-descriptions-item>
              </n-descriptions>
            </n-collapse-item>
          </n-collapse>

          <!-- 人物标签 -->
          <div v-if="photoStore.photo.persons?.length" class="persons-section">
            <h3>人物</h3>
            <div class="persons-tags">
              <n-tag
                v-for="person in photoStore.photo.persons"
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

    <!-- 空状态 -->
    <EmptyState
      v-else
      type="error"
      title="照片不存在"
      description="该照片可能已被删除或不存在"
      :primary-action="{
        label: '返回',
        onClick: goBack
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
import { usePhotoDetailStore } from '@/stores/photoDetailStore'
import { toLocalResourceProtocol } from '@/utils/localResource'
import EmptyState from '@/components/EmptyState.vue'
import BreadcrumbNav, { type BreadcrumbItem } from '@/components/nav/BreadcrumbNav.vue'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const dialog = useDialog()
const photoStore = usePhotoDetailStore()

// 全屏状态
const isFullscreen = ref(false)

// 获取照片 URL
const getPhotoUrl = (photo: any) => {
  const path = photo.thumbnailPath || photo.thumbnail_url || photo.filePath
  if (path && (path.startsWith('/') || /^[a-z]:/i.test(path))) {
    return toLocalResourceProtocol(path)
  }
  return path || ''
}

// 检查是否有 EXIF 数据
const hasExifData = computed(() => {
  const meta = photoStore.photo?.metadata
  return !!(meta?.camera || meta?.lens || meta?.aperture || meta?.iso || meta?.shutterSpeed)
})

// 面包屑项
const breadcrumbItems = computed((): BreadcrumbItem[] => {
  const from = route.query.from as string
  const personId = route.query.personId as string

  if (from === 'person' && personId) {
    const personName = photoStore.photo?.persons?.find(p => String(p.id) === personId)?.name || '人物'
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

// 加载照片
const loadPhoto = async () => {
  const id = route.params.id as string
  await photoStore.loadPhoto(id)

  if (!photoStore.photo) {
    message.warning('照片不存在')
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
  if (!photoStore.photo) return

  const result = await (window as any).photoAPI?.photos?.export({
    photoId: photoStore.photo.id,
    filePath: photoStore.photo.filePath,
    exportPath: photoStore.photo.fileName
  })

  if (result?.success) {
    message.success(`照片已导出到: ${result.exportPath}`)
  } else {
    message.error(result?.error || '导出失败')
  }
}

// 删除照片
const handleDelete = async () => {
  if (!photoStore.photo) return

  dialog.warning({
    title: '确认删除',
    content: `确定要删除「${photoStore.photo.fileName}」吗？此操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const photoId = photoStore.photo?.id
      if (!photoId) return

      const result = await photoStore.deletePhoto(photoId)

      if (result.success) {
        message.success('照片已删除')
        router.back()
      } else {
        message.error(result.error || '删除失败')
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
      if (!photoStore.isFirst) {
        photoStore.navigateTo('prev')
      }
      break
    case 'ArrowRight':
      if (!photoStore.isLast) {
        photoStore.navigateTo('next')
      }
      break
    case 'Delete':
    case 'Backspace':
      if (photoStore.photo) {
        event.preventDefault()
        handleDelete()
      }
      break
    case 'e':
    case 'E':
      if (photoStore.photo) {
        event.preventDefault()
        handleExport()
      }
      break
    case 'f':
    case 'F':
      if (photoStore.photo) {
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
