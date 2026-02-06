/**
 * PhotoMind - 首页
 * 反AI味 · 现代极简主义设计
 */
<template>
  <div class="home-container">
    <!-- 欢迎区域 -->
    <header class="welcome-section">
      <h1>欢迎回来</h1>
      <p class="subtitle">管理和探索你的照片记忆</p>
    </header>

    <!-- 快捷入口 -->
    <div class="quick-actions">
      <n-grid :cols="2" :x-gap="16" :y-gap="16" responsive="screen">
        <n-gi>
          <div class="action-card" @click="goToSearch">
            <div class="card-icon primary">
              <n-icon size="24" color="#FFFFFF">
                <Search24Regular />
              </n-icon>
            </div>
            <div class="card-content">
              <h3>智能搜索</h3>
              <p class="card-desc">用自然语言查找照片</p>
              <p class="card-example">"2015年日本旅游的照片"</p>
            </div>
          </div>
        </n-gi>
        <n-gi>
          <div class="action-card" @click="goToTimeline">
            <div class="card-icon secondary">
              <n-icon size="24" color="#FFFFFF">
                <CalendarToday24Regular />
              </n-icon>
            </div>
            <div class="card-content">
              <h3>时间线</h3>
              <p class="card-desc">按时间浏览回忆</p>
              <p class="card-example">查看往年今日</p>
            </div>
          </div>
        </n-gi>
        <n-gi>
          <div class="action-card" @click="goToAlbums">
            <div class="card-icon tertiary">
              <n-icon size="24" color="#FFFFFF">
                <Folder24Regular />
              </n-icon>
            </div>
            <div class="card-content">
              <h3>智能相册</h3>
              <p class="card-desc">按人物/地点自动分类</p>
              <p class="card-example">家人、地点、旅行</p>
            </div>
          </div>
        </n-gi>
        <n-gi>
          <div class="action-card" @click="goToPeople">
            <div class="card-icon quaternary">
              <n-icon size="24" color="#FFFFFF">
                <People24Regular />
              </n-icon>
            </div>
            <div class="card-content">
              <h3>人物</h3>
              <p class="card-desc">按人物浏览照片</p>
              <p class="card-example">家人、朋友合影</p>
            </div>
          </div>
        </n-gi>
      </n-grid>
    </div>

    <!-- 快速导入区 -->
    <div class="import-section">
      <div class="import-card primary" @click="openImportDialog">
        <div class="import-icon">
          <n-icon size="28" color="#FFFFFF">
            <Folder24Regular />
          </n-icon>
        </div>
        <div class="import-content">
          <h3>导入照片</h3>
          <p>从本地文件夹导入照片到图库</p>
        </div>
        <n-icon size="20" class="import-arrow" color="#0071E3">
          <ChevronRight24Regular />
        </n-icon>
      </div>
      <div class="import-card secondary" @click="syncPhotos">
        <div class="import-icon">
          <n-icon size="28" color="#FFFFFF">
            <ArrowSync24Regular />
          </n-icon>
        </div>
        <div class="import-content">
          <h3>同步照片</h3>
          <p>{{ photoStore.totalCount }} 张照片 · 从 iCloud 同步</p>
        </div>
        <n-icon size="20" class="import-arrow" color="#0071E3">
          <ChevronRight24Regular />
        </n-icon>
      </div>
    </div>

    <!-- 最近照片 -->
    <section class="recent-section">
      <div class="section-header">
        <h2>最近照片</h2>
        <n-button text type="primary" @click="goToPhotos" class="view-all-btn">
          查看全部
          <template #icon>
            <n-icon><ChevronRight24Regular /></n-icon>
          </template>
        </n-button>
      </div>
      <PhotoGrid :photos="recentPhotos" :loading="loading" @photo-click="openPhoto" />
    </section>

    <!-- 同步/导入对话框 -->
    <n-modal
      v-model:show="showSyncModal"
      preset="card"
      title="导入照片"
      :bordered="false"
      class="import-modal"
      @close="showSyncModal = false"
      @mask-click="showSyncModal = false"
    >
      <div class="sync-modal-content">
        <n-space vertical :size="16">
          <div class="import-option-card" @click="importFromLocalFolder">
            <div class="import-option-icon">
              <n-icon size="24" color="#0071E3">
                <Folder24Regular />
              </n-icon>
            </div>
            <div class="import-option-content">
              <h4>从本地文件夹导入</h4>
              <p>选择包含照片的文件夹进行导入</p>
            </div>
          </div>

          <div class="divider">
            <span>或</span>
          </div>

          <div class="import-option-card" @click="startSync">
            <div class="import-option-icon secondary">
              <n-icon size="24" color="#34C759">
                <ArrowSync24Regular />
              </n-icon>
            </div>
            <div class="import-option-content">
              <h4>从 iCloud 同步</h4>
              <p>从 iCloud Photos Library 同步照片</p>
            </div>
          </div>
        </n-space>

        <n-progress
          v-if="syncing"
          type="line"
          :percentage="syncProgress"
          :indicator-placement="'inside'"
          class="sync-progress"
        />
        <p v-if="syncing" class="sync-status">正在导入: {{ syncedCount }} 张照片</p>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search24Regular,
  CalendarToday24Regular,
  Folder24Regular,
  ArrowSync24Regular,
  ChevronRight24Regular,
  People24Regular,
} from '@vicons/fluent'
import { useMessage } from 'naive-ui'
import PhotoGrid from '../components/PhotoGrid.vue'
import { usePhotoStore } from '../stores/photoStore'

const router = useRouter()
const message = useMessage()
const photoStore = usePhotoStore()

// 状态
const loading = ref(true)
const syncing = ref(false)
const importing = ref(false)
const syncProgress = ref(0)
const syncedCount = ref(0)
const showSyncModal = ref(false)

// 使用 computed 确保响应式
const recentPhotos = computed(() => photoStore.photos)

// 检查是否有 photoAPI
const hasPhotoAPI = () => !!(window as any).photoAPI

// 模拟数据
const generateMockPhotos = (count: number) => {
  const locations = [
    { name: '日本东京', lat: 35.6762, lng: 139.6503 },
    { name: '新疆乌鲁木齐', lat: 43.8256, lng: 87.6168 },
    { name: '北京', lat: 39.9042, lng: 116.4074 },
    { name: '上海', lat: 31.2304, lng: 121.4737 },
    { name: '家里', lat: 39.9042, lng: 116.4074 }
  ]

  const photos = []
  for (let i = 0; i < count; i++) {
    const year = 2015 + Math.floor(i / 100)
    const month = (i % 12) + 1
    const day = (i % 28) + 1
    photos.push({
      id: i,
      uuid: `photo-${i}`,
      fileName: `IMG_${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}_${i}.jpg`,
      takenAt: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:30:00Z`,
      location: locations[i % locations.length],
      thumbnailPath: null
    })
  }
  return photos
}

// 导航方法
const goToSearch = () => router.push('/search')
const goToTimeline = () => router.push('/timeline')
const goToAlbums = () => router.push('/albums')
const goToPeople = () => router.push('/people')
const goToPhotos = () => router.push('/photos')

// 打开照片详情
const openPhoto = (photo: any) => {
  router.push(`/photo/${photo.id || photo.uuid}`)
}

// 显示同步/导入对话框
const openImportDialog = () => {
  showSyncModal.value = true
}

// 显示同步/导入对话框（兼容旧名称）
const syncPhotos = () => {
  showSyncModal.value = true
}

// 开始同步/导入
const startSync = async () => {
  syncing.value = true
  syncProgress.value = 0
  syncedCount.value = 0

  try {
    if (hasPhotoAPI()) {
      const success = await photoStore.selectAndImportFolder()
      if (success) {
        message.success(`导入完成，共 ${photoStore.importProgress?.importedCount || photoStore.totalCount || 0} 张照片`)
      } else {
        const result = await (window as any).photoAPI.sync.start()
        message.success(`同步完成，共 ${result} 张照片`)
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 2000))
      message.success('同步完成，共 100 张照片（模拟数据）')
    }
    await loadPhotos()
  } catch (error: any) {
    message.error(`同步失败: ${error?.message || error || '未知错误'}`)
  } finally {
    syncing.value = false
    showSyncModal.value = false
  }
}

// 从本地文件夹导入
const importFromLocalFolder = async () => {
  importing.value = true
  try {
    if (!hasPhotoAPI()) {
      message.warning('请在 Electron 环境中使用此功能')
      return
    }

    const folders = await (window as any).photoAPI.local.selectFolder()
    if (!folders || folders.length === 0) {
      return
    }

    message.info('开始导入照片...')
    const result = await photoStore.importFromFolder(folders[0])

    if (result) {
      message.success(`导入完成！共 ${photoStore.totalCount} 张照片`)
    } else {
      message.warning('导入未完成或被取消')
    }
  } catch (error: any) {
    message.error(`导入失败: ${error?.message || error || '未知错误'}`)
  } finally {
    importing.value = false
    showSyncModal.value = false
  }
}

// 加载照片
const loadPhotos = async () => {
  loading.value = true
  try {
    if (hasPhotoAPI()) {
      await photoStore.fetchPhotos({ limit: 12 })
    } else {
      photoStore.photos = generateMockPhotos(12)
      photoStore.totalCount = 100
    }
  } catch (error) {
    console.error('[HomeView] 加载照片失败:', error)
  } finally {
    loading.value = false
  }
}

// 初始化
onMounted(() => {
  loadPhotos()
})
</script>

<style scoped>
/* ================================
   容器
   ================================ */
.home-container {
  min-height: 100vh;
  background: var(--bg-primary);
  padding: calc(var(--nav-height) + var(--space-xl)) var(--space-lg) var(--space-lg);
  max-width: var(--content-max-width);
  margin: 0 auto;
}

/* ================================
   欢迎区域
   ================================ */
.welcome-section {
  margin-bottom: var(--space-xl);
}

.welcome-section h1 {
  font-size: var(--text-hero);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin: 0 0 var(--space-sm);
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: var(--text-body);
  color: var(--text-secondary);
  margin: 0;
}

/* ================================
   快捷入口卡片
   ================================ */
.quick-actions {
  margin-bottom: var(--space-xl);
}

.action-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: transform var(--duration-normal) var(--ease-default),
              box-shadow var(--duration-normal) var(--ease-default);
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-hover);
}

.card-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-icon.primary {
  background: linear-gradient(135deg, #0071E3, #00A3FF);
}

.card-icon.secondary {
  background: linear-gradient(135deg, #34C759, #30D158);
}

.card-icon.tertiary {
  background: linear-gradient(135deg, #FF9500, #FFAA33);
}

.card-icon.quaternary {
  background: linear-gradient(135deg, #AF52DE, #BF5AF2);
}

.card-content h3 {
  font-size: var(--text-h3);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--space-xs);
}

.card-desc {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin: 0 0 4px;
}

.card-example {
  font-size: var(--text-caption);
  color: var(--text-tertiary);
  margin: 0;
  font-style: italic;
}

/* ================================
   导入区域
   ================================ */
.import-section {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.import-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  display: flex;
  align-items: center;
  gap: var(--space-md);
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: all var(--duration-normal) var(--ease-default);
  border: 2px solid transparent;
}

.import-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-hover);
  border-color: var(--primary-default);
}

.import-card.primary .import-icon {
  background: linear-gradient(135deg, #0071E3, #00A3FF);
}

.import-card.secondary .import-icon {
  background: linear-gradient(135deg, #34C759, #30D158);
}

.import-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.import-content {
  flex: 1;
}

.import-content h3 {
  font-size: var(--text-h3);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0 0 4px;
}

.import-content p {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin: 0;
}

.import-arrow {
  transition: transform var(--duration-fast) var(--ease-default);
}

.import-card:hover .import-arrow {
  transform: translateX(4px);
}

/* ================================
   最近照片区域
   ================================ */
.recent-section {
  background: var(--bg-secondary);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.section-header h2 {
  margin: 0;
  font-size: var(--text-h2);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.view-all-btn {
  font-weight: var(--font-medium);
}

/* ================================
   导入对话框
   ================================ */
.import-modal {
  width: 480px;
  max-width: 90vw;
}

.sync-modal-content {
  padding: var(--space-sm) 0;
}

.import-option-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-default);
}

.import-option-card:hover {
  background: var(--primary-light);
}

.import-option-icon {
  width: 48px;
  height: 48px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.import-option-icon.secondary {
  background: rgba(52, 199, 89, 0.1);
}

.import-option-content h4 {
  font-size: var(--text-body);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0 0 4px;
}

.import-option-content p {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin: 0;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: var(--text-tertiary);
  font-size: var(--text-small);
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--border-light);
}

.divider span {
  padding: 0 var(--space-md);
}

.sync-progress {
  margin-top: var(--space-lg);
}

.sync-status {
  text-align: center;
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin-top: var(--space-sm);
}

/* ================================
   响应式
   ================================ */
@media (max-width: 640px) {
  .home-container {
    padding: calc(var(--nav-height) + var(--space-lg)) var(--space-md) var(--space-md);
  }

  .welcome-section h1 {
    font-size: var(--text-h1);
  }

  .action-card {
    padding: var(--space-md);
  }

  .card-icon {
    width: 40px;
    height: 40px;
  }

  .import-section {
    grid-template-columns: 1fr;
  }

  .import-card {
    padding: var(--space-md);
  }

  .recent-section {
    padding: var(--space-md);
    border-radius: var(--radius-lg);
  }
}
</style>
