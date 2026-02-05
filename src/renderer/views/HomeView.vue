/**
 * PhotoMind - 首页
 */
<template>
  <div class="home-container">
    <!-- 头部 -->
    <header class="header">
      <div class="header-content">
        <h1 class="logo">PhotoMind</h1>
        <p class="subtitle">智能相册管理</p>
      </div>
      <div class="header-actions">
        <n-button quaternary circle @click="goToSettings">
          <template #icon>
            <n-icon size="20"><Settings24Regular /></n-icon>
          </template>
        </n-button>
      </div>
    </header>

    <!-- 快捷入口 -->
    <div class="quick-actions">
      <n-grid :cols="2" :x-gap="16" :y-gap="16">
        <n-gi>
          <n-card class="action-card" hoverable @click="goToSearch">
            <template #header>
              <div class="card-header">
                <n-icon size="24" color="#5E6AD2">
                  <Search24Regular />
                </n-icon>
                <span>智能搜索</span>
              </div>
            </template>
            <p class="card-desc">用自然语言查找照片</p>
            <p class="card-example">"2015年日本旅游的照片"</p>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card class="action-card" hoverable @click="goToTimeline">
            <template #header>
              <div class="card-header">
                <n-icon size="24" color="#5E6AD2">
                  <CalendarToday24Regular />
                </n-icon>
                <span>时间线</span>
              </div>
            </template>
            <p class="card-desc">按时间浏览回忆</p>
            <p class="card-example">查看往年今日</p>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card class="action-card" hoverable @click="goToAlbums">
            <template #header>
              <div class="card-header">
                <n-icon size="24" color="#5E6AD2">
                  <Image24Regular />
                </n-icon>
                <span>智能相册</span>
              </div>
            </template>
            <p class="card-desc">按人物/地点自动分类</p>
            <p class="card-example">家人、地点、旅行</p>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card class="action-card" hoverable @click="goToPeople">
            <template #header>
              <div class="card-header">
                <n-icon size="24" color="#5E6AD2">
                  <People24Regular />
                </n-icon>
                <span>人物</span>
              </div>
            </template>
            <p class="card-desc">按人物浏览照片</p>
            <p class="card-example">家人、朋友合影</p>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card class="action-card" hoverable @click="openImportDialog" style="border-color: #5E6AD2;">
            <template #header>
              <div class="card-header">
                <n-icon size="24" color="#5E6AD2">
                  <Folder24Regular />
                </n-icon>
                <span style="color: #5E6AD2;">导入照片</span>
              </div>
            </template>
            <p class="card-desc">从本地文件夹导入</p>
            <p class="card-example">点击选择照片文件夹</p>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card class="action-card" hoverable @click="syncPhotos">
            <template #header>
              <div class="card-header">
                <n-icon size="24" color="#5E6AD2">
                  <ArrowSync24Regular />
                </n-icon>
                <span>同步照片</span>
              </div>
            </template>
            <p class="card-desc">从 iCloud 同步照片</p>
            <p class="card-example">{{ photoCount }} 张照片</p>
          </n-card>
        </n-gi>
      </n-grid>
    </div>

    <!-- 最近照片 -->
    <section class="recent-section">
      <div class="section-header">
        <h2>最近照片</h2>
        <n-button text type="primary" @click="goToPhotos">
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
      style="width: 480px; max-width: 90vw;"
      @close="showSyncModal = false"
      @mask-click="showSyncModal = false"
    >
      <div class="sync-modal-content">
        <n-space vertical :size="16">
          <n-card
            size="small"
            hoverable
            @click="importFromLocalFolder"
            class="import-option"
          >
            <template #header>
              <div class="import-option-header">
                <n-icon size="24" color="#5E6AD2">
                  <Folder24Regular />
                </n-icon>
                <span>从本地文件夹导入</span>
              </div>
            </template>
            <p class="import-desc">选择包含照片的文件夹进行导入</p>
          </n-card>

          <n-divider>或</n-divider>

          <n-card size="small" hoverable @click="startSync" class="import-option">
            <template #header>
              <div class="import-option-header">
                <n-icon size="24" color="#5E6AD2">
                  <ArrowSync24Regular />
                </n-icon>
                <span>从 iCloud 同步</span>
              </div>
            </template>
            <p class="import-desc">从 iCloud Photos Library 同步照片</p>
          </n-card>
        </n-space>

        <n-progress
          v-if="syncing"
          type="line"
          :percentage="syncProgress"
          :indicator-placement="'inside'"
          style="margin-top: 16px;"
        />
        <p v-if="syncing">正在导入: {{ syncedCount }} 张照片</p>
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
  Image24Regular,
  ArrowSync24Regular,
  ChevronRight24Regular,
  Folder24Regular,
  People24Regular,
  Settings24Regular,
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
const importedCount = ref(0)
const totalToImport = ref(0)
const syncedCount = ref(0)
const showSyncModal = ref(false)
const photoCount = ref(0)
const recentPhotos = ref<any[]>([])
const importProgress = ref(0)

// 检查是否有 photoAPI (Electron 环境)
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

// 跳转到搜索
const goToSearch = () => {
  router.push('/search')
}

// 跳转到时间线
const goToTimeline = () => {
  router.push('/timeline')
}

// 跳转到相册
const goToAlbums = () => {
  console.log('[Navigation] 跳转到相册')
  router.push('/albums')
}

// 跳转到人物
const goToPeople = () => {
  console.log('[Navigation] 跳转到人物')
  router.push('/people')
}

// 跳转到设置
const goToSettings = () => {
  router.push('/settings')
}

// 跳转到照片列表
const goToPhotos = () => {
  router.push('/photos')
}

// 打开照片详情
const openPhoto = (photo: any) => {
  router.push(`/photo/${photo.id || photo.uuid}`)
}

// 显示同步/导入对话框
const openImportDialog = () => {
  console.log('[ImportDialog] 打开导入对话框')
  showSyncModal.value = true
}

// 显示同步/导入对话框（兼容旧名称）
const syncPhotos = () => {
  console.log('[ImportDialog] 打开同步对话框')
  showSyncModal.value = true
}

// 开始同步/导入
const startSync = async () => {
  syncing.value = true
  syncProgress.value = 0
  syncedCount.value = 0

  try {
    if (hasPhotoAPI()) {
      // 先尝试本地导入
      const success = await photoStore.selectAndImportFolder()
      if (success) {
        message.success(`导入完成，共 ${photoStore.importProgress?.importedCount || photoStore.totalCount || 0} 张照片`)
      } else {
        // 如果用户取消或导入失败，尝试 iCloud 同步
        const result = await (window as any).photoAPI.sync.start()
        message.success(`同步完成，共 ${result} 张照片`)
      }
    } else {
      // 模拟同步
      await new Promise(resolve => setTimeout(resolve, 2000))
      message.success('同步完成，共 100 张照片（模拟数据）')
    }
    await loadPhotos()
  } catch (error: any) {
    console.error('[Sync] 同步失败:', error)
    message.error(`同步失败: ${error?.message || error || '未知错误'}`)
  } finally {
    syncing.value = false
    showSyncModal.value = false
  }
}

// 从本地文件夹导入
const importFromLocalFolder = async () => {
  importing.value = true
  importedCount.value = 0

  try {
    if (!hasPhotoAPI()) {
      message.warning('请在 Electron 环境中使用此功能')
      importing.value = false
      return
    }

    // 选择文件夹
    console.log('[Import] 正在选择文件夹...')
    const folders = await (window as any).photoAPI.local.selectFolder()
    console.log('[Import] 选择的文件夹:', folders)

    if (!folders || folders.length === 0) {
      console.log('[Import] 用户取消选择文件夹')
      importing.value = false
      return
    }

    message.info('开始导入照片...')

    // 执行导入
    console.log('[Import] 开始导入文件夹:', folders[0])
    const result = await (window as any).photoAPI.local.importFolder(folders[0])
    console.log('[Import] 导入结果:', result)

    if (result && result.success) {
      message.success(`导入完成！共导入 ${result.imported} 张照片`)
      await loadPhotos()
    } else if (result) {
      message.warning(`导入完成，但有 ${result.errors} 张照片导入失败`)
    } else {
      message.error('导入结果为空')
    }
  } catch (error: any) {
    console.error('[Import] 导入失败:', error)
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
      // 优先从本地数据库加载
      await photoStore.fetchPhotos({ limit: 12 })
      recentPhotos.value = photoStore.photos
      photoCount.value = photoStore.totalCount

      // 如果没有本地照片，尝试获取 iCloud 照片
      if (photoCount.value === 0) {
        const photos = await (window as any).photoAPI.photos.getList({ limit: 12 })
        recentPhotos.value = photos || []
        photoCount.value = photos?.length || 0
      }
    } else {
      // 使用模拟数据
      recentPhotos.value = generateMockPhotos(12)
      photoCount.value = 100
    }
  } catch (error) {
    console.error('加载照片失败:', error)
    // 降级使用模拟数据
    recentPhotos.value = generateMockPhotos(12)
    photoCount.value = 100
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
.home-container {
  min-height: 100vh;
  background: #f5f5f7;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  text-align: center;
  padding: 32px 0;
  position: relative;
}

.header-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.header-actions {
  position: absolute;
  top: 24px;
  right: 24px;
}

.logo {
  font-size: 36px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
  background: linear-gradient(135deg, #5E6AD2, #8B9EFF);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  color: #666;
  margin-top: 8px;
  font-size: 16px;
}

.quick-actions {
  margin-bottom: 32px;
}

.action-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.action-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(94, 106, 210, 0.15);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 600;
}

.card-desc {
  color: #666;
  margin: 8px 0 4px;
  font-size: 14px;
}

.card-example {
  color: #999;
  font-size: 12px;
  margin: 0;
  font-style: italic;
}

.recent-section {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
}

.sync-modal-content {
  padding: 16px 0;
}

.import-option {
  cursor: pointer;
  transition: all 0.2s;
}

.import-option:hover {
  border-color: #5E6AD2;
}

.import-option-header {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  font-weight: 600;
}

.import-desc {
  color: #666;
  margin: 8px 0 0 36px;
  font-size: 14px;
}

.import-option-card {
  cursor: pointer;
  transition: all 0.2s;
}

.import-option-card:hover {
  border-color: #5E6AD2;
  transform: translateY(-2px);
}

.import-option-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.import-option-content h3 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
}

.import-option-content p {
  margin: 0;
  color: #666;
  font-size: 14px;
}
</style>
