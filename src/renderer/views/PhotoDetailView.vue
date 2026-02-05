/**
 * PhotoMind - 照片详情视图
 */
<template>
  <div class="photo-detail-container">
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
            :src="photoStore.photo.thumbnailPath || photoStore.photo.filePath"
            :preview-src="photoStore.photo.filePath"
            object-fit="contain"
            style="width: 100%; height: 100%;"
            preview-disabled
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
              <n-icon size="20" color="#5E6AD2">
                <CalendarToday24Regular />
              </n-icon>
              <div class="meta-content">
                <span class="meta-label">拍摄时间</span>
                <span class="meta-value">{{ formatDateTime(photoStore.photo.takenAt) }}</span>
              </div>
            </div>

            <!-- 地点 -->
            <div class="meta-item" v-if="photoStore.photo.location?.name">
              <n-icon size="20" color="#5E6AD2">
                <Location24Regular />
              </n-icon>
              <div class="meta-content">
                <span class="meta-label">拍摄地点</span>
                <span class="meta-value">{{ photoStore.photo.location.name }}</span>
              </div>
            </div>

            <!-- 尺寸 -->
            <div class="meta-item" v-if="photoStore.photo.width">
              <n-icon size="20" color="#5E6AD2">
                <Image24Regular />
              </n-icon>
              <div class="meta-content">
                <span class="meta-label">照片尺寸</span>
                <span class="meta-value">{{ photoStore.photo.width }} x {{ photoStore.photo.height }}</span>
              </div>
            </div>

            <!-- 文件大小 -->
            <div class="meta-item" v-if="photoStore.photo.fileSize">
              <n-icon size="20" color="#5E6AD2">
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
    <template v-else>
      <n-empty description="照片不存在或已被删除">
        <template #extra>
          <n-button type="primary" @click="goBack">返回</n-button>
        </template>
      </n-empty>
    </template>
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
} from '@vicons/fluent'
import { useMessage, useDialog } from 'naive-ui'
import { usePhotoDetailStore, type PhotoDetail } from '@/stores/photoDetailStore'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const dialog = useDialog()
const photoStore = usePhotoDetailStore()

// 全屏状态
const isFullscreen = ref(false)

// 检查是否有 EXIF 数据
const hasExifData = computed(() => {
  const meta = photoStore.photo?.metadata
  return !!(meta?.camera || meta?.lens || meta?.aperture || meta?.iso || meta?.shutterSpeed)
})

// 加载照片
const loadPhoto = async () => {
  const id = route.params.id as string
  await photoStore.loadPhoto(id)

  if (!photoStore.photo) {
    message.warning('照片不存在')
  }
}

// 返回
const goBack = () => {
  router.back()
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

  // 使用 save dialog 让用户选择导出位置
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
  // 如果用户在输入框中，不触发快捷键
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    return
  }

  switch (event.key) {
    case 'ArrowLeft':
      // 左箭头：上一张
      if (!photoStore.isFirst) {
        photoStore.navigateTo('prev')
      }
      break

    case 'ArrowRight':
      // 右箭头：下一张
      if (!photoStore.isLast) {
        photoStore.navigateTo('next')
      }
      break

    case 'Delete':
    case 'Backspace':
      // Delete/Backspace：删除照片
      if (photoStore.photo) {
        event.preventDefault()
        handleDelete()
      }
      break

    case 'e':
    case 'E':
      // E 键：导出照片
      if (photoStore.photo) {
        event.preventDefault()
        handleExport()
      }
      break

    case 'f':
    case 'F':
      // F 键：全屏
      if (photoStore.photo) {
        event.preventDefault()
        toggleFullscreen()
      }
      break

    case 'Escape':
      // Esc：退出全屏
      if (document.fullscreenElement) {
        document.exitFullscreen()
        isFullscreen.value = false
      }
      break

    default:
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
.photo-detail-container {
  height: 100vh;
  background: #1a1a1a;
  display: flex;
  flex-direction: column;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #999;
}

.loading-state p {
  margin-top: 16px;
}

.photo-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

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
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.nav-btn.prev {
  left: 24px;
}

.nav-btn.next {
  right: 24px;
}

.info-panel {
  width: 380px;
  background: white;
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.panel-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
  flex: 1;
  word-break: break-all;
}

.photo-meta {
  margin-bottom: 24px;
}

.meta-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
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
  font-size: 12px;
  color: #999;
}

.meta-value {
  font-size: 14px;
  color: #1a1a1a;
}

.persons-section {
  margin-bottom: 24px;
}

.persons-section h3 {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 12px;
}

.persons-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.action-buttons {
  margin-top: auto;
  padding-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shortcuts-hint {
  margin-top: 16px;
}

.shortcuts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: #666;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shortcut-item kbd {
  display: inline-block;
  padding: 2px 6px;
  font-size: 11px;
  font-family: monospace;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  color: #666;
}

.shortcut-item span {
  color: #999;
}

.nav-btn.fullscreen-btn {
  position: absolute;
  top: 24px;
  right: 24px;
}

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
    left: 12px;
  }

  .nav-btn.next {
    right: 12px;
  }
}
</style>
