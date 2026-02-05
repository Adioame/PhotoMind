/**
 * PhotoMind - 相册视图
 */
<template>
  <div class="albums-container">
    <header class="header">
      <h1>智能相册</h1>
      <p class="subtitle">按人物、地点自动整理</p>
      <!-- 创建相册按钮 -->
      <n-button type="primary" @click="openCreateDialog('manual')">
        <template #icon>
          <n-icon><Add24Regular /></n-icon>
        </template>
        创建相册
      </n-button>
    </header>

    <!-- 加载状态 -->
    <div class="loading-state" v-if="loading">
      <n-spin size="large" />
      <p>加载中...</p>
    </div>

    <!-- 智能相册 -->
    <template v-else>
      <!-- 地点相册 -->
      <section class="album-section" v-if="placeAlbums.length > 0">
        <div class="section-header">
          <h2>
            <n-icon><Location24Regular /></n-icon>
            按地点
          </h2>
        </div>
        <n-grid :cols="3" :x-gap="16" :y-gap="16">
          <n-gi v-for="album in placeAlbums" :key="album.id">
            <n-card class="album-card" hoverable @click="openAlbum(album)">
              <div class="album-cover">
                <div class="cover-placeholder">
                  <n-icon size="48" color="#5E6AD2">
                    <Location24Regular />
                  </n-icon>
                </div>
              </div>
              <div class="album-info">
                <h3>{{ album.name }}</h3>
                <p>{{ album.photoCount }} 张照片</p>
              </div>
            </n-card>
          </n-gi>
        </n-grid>
      </section>

      <!-- 人物相册 -->
      <section class="album-section" v-if="peopleAlbums.length > 0">
        <div class="section-header">
          <h2>
            <n-icon><People24Regular /></n-icon>
            按人物
          </h2>
        </div>
        <n-grid :cols="4" :x-gap="16" :y-gap="16">
          <n-gi v-for="album in peopleAlbums" :key="album.id">
            <n-card class="album-card" hoverable @click="openAlbum(album)">
              <div class="album-cover person-cover">
                <div class="cover-placeholder">
                  <n-icon size="48" color="#5E6AD2">
                    <Person24Regular />
                  </n-icon>
                </div>
              </div>
              <div class="album-info">
                <h3>{{ album.name }}</h3>
                <p>{{ album.photoCount }} 张照片</p>
              </div>
            </n-card>
          </n-gi>
        </n-grid>
      </section>

      <!-- 历年回忆 -->
      <section class="album-section" v-if="yearAlbums.length > 0">
        <div class="section-header">
          <h2>
            <n-icon><CalendarToday24Regular /></n-icon>
            历年回忆
          </h2>
        </div>
        <n-grid :cols="3" :x-gap="16" :y-gap="16">
          <n-gi v-for="album in yearAlbums" :key="album.id">
            <n-card class="album-card" hoverable @click="openAlbum(album)">
              <div class="album-cover year-cover">
                <div class="cover-placeholder">
                  <span class="year-text">{{ album.year }}</span>
                </div>
              </div>
              <div class="album-info">
                <h3>{{ album.name }}</h3>
                <p>{{ album.photoCount }} 张照片</p>
              </div>
            </n-card>
          </n-gi>
        </n-grid>
      </section>

      <!-- 我的相册（用户创建的） -->
      <section class="album-section" v-if="manualAlbums.length > 0">
        <div class="section-header">
          <h2>
            <n-icon><Folder24Regular /></n-icon>
            我的相册
          </h2>
        </div>
        <n-grid :cols="3" :x-gap="16" :y-gap="16">
          <n-gi v-for="album in manualAlbums" :key="album.id">
            <n-card class="album-card" hoverable @click="openAlbum(album)">
              <div class="album-cover">
                <img
                  v-if="album.coverPhotoPath"
                  :src="album.coverPhotoPath"
                  class="album-cover-image"
                />
                <div v-else class="cover-placeholder">
                  <n-icon size="48" color="#5E6AD2">
                    <Image24Regular />
                  </n-icon>
                </div>
              </div>
              <div class="album-info">
                <h3>{{ album.name }}</h3>
                <p>{{ album.photoCount }} 张照片</p>
              </div>
              <!-- 操作按钮 -->
              <div class="album-actions">
                <n-button text circle size="small" @click.stop="openCoverSelector(album)">
                  <template #icon>
                    <n-icon><Camera24Regular /></n-icon>
                  </template>
                </n-button>
                <n-button text circle size="small" @click.stop="openShareDialog(album)">
                  <template #icon>
                    <n-icon><Share24Regular /></n-icon>
                  </template>
                </n-button>
                <n-button text circle size="small" @click.stop="editAlbum(album)">
                  <template #icon>
                    <n-icon><Edit24Regular /></n-icon>
                  </template>
                </n-button>
                <n-button text circle size="small" type="error" @click.stop="confirmDelete(album)">
                  <template #icon>
                    <n-icon><Delete24Regular /></n-icon>
                  </template>
                </n-button>
              </div>
            </n-card>
          </n-gi>
        </n-grid>
      </section>

      <!-- 空状态 -->
      <div class="empty-state" v-if="allAlbums.length === 0">
        <n-empty description="暂无相册">
          <template #icon>
            <n-icon size="64" color="#ccc">
              <Image24Regular />
            </n-icon>
          </template>
          <template #extra>
            <p>同步照片后自动生成智能相册</p>
            <n-button type="primary" @click="openCreateDialog('manual')">
              创建相册
            </n-button>
          </template>
        </n-empty>
      </div>
    </template>

    <!-- 创建相册对话框 -->
    <n-modal v-model:show="showCreateDialog" preset="card" title="创建相册" style="width: 500px;">
      <n-form ref="formRef" :model="createForm" :rules="formRules" label-placement="left" label-width="100">
        <n-form-item label="相册类型" path="type">
          <n-radio-group v-model:value="createForm.type">
            <n-radio value="manual">普通相册</n-radio>
            <n-radio value="smart">智能相册</n-radio>
          </n-radio-group>
        </n-form-item>

        <n-form-item label="相册名称" path="name">
          <n-input v-model:value="createForm.name" placeholder="请输入相册名称" />
        </n-form-item>

        <n-form-item label="相册描述" path="description">
          <n-input
            v-model:value="createForm.description"
            type="textarea"
            placeholder="请输入相册描述（可选）"
            :rows="3"
          />
        </n-form-item>

        <!-- 智能相册条件 -->
        <n-form-item v-if="createForm.type === 'smart'" label="搜索条件" path="query">
          <n-input
            v-model:value="createForm.query"
            type="textarea"
            placeholder="例如: 2024 AND location:北京"
            :rows="2"
          />
          <n-p style="margin-top: 8px; color: #999;">
            支持关键词、日期、地点等搜索条件
          </n-p>
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="closeCreateDialog">取消</n-button>
          <n-button type="primary" :loading="creating" @click="handleCreate">
            创建
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 编辑相册对话框 -->
    <n-modal v-model:show="showEditDialog" preset="card" title="编辑相册" style="width: 500px;">
      <n-form v-if="editingAlbum" ref="editFormRef" :model="editForm" :rules="editRules" label-placement="left" label-width="100">
        <n-form-item label="相册名称" path="name">
          <n-input v-model:value="editForm.name" placeholder="请输入相册名称" />
        </n-form-item>

        <n-form-item label="相册描述" path="description">
          <n-input
            v-model:value="editForm.description"
            type="textarea"
            placeholder="请输入相册描述（可选）"
            :rows="3"
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="space-between">
          <n-space>
            <n-button type="error" ghost @click="confirmDelete(editingAlbum!)">
              删除相册
            </n-button>
          </n-space>
          <n-space justify="end">
            <n-button @click="closeEditDialog">取消</n-button>
            <n-button type="primary" :loading="saving" @click="handleEdit">
              保存
            </n-button>
          </n-space>
        </n-space>
      </template>
    </n-modal>

    <!-- 封面选择器对话框 -->
    <CoverPhotoSelector
      v-model:show="showCoverSelector"
      :album="coverSelectorAlbum"
      :photos="albumPhotos"
      :loading="loading"
      @select="handleCoverSelect"
    />

    <!-- 分享对话框 -->
    <AlbumShareDialog
      v-model:show="showShareDialog"
      :album="sharingAlbum"
      :progress="store.exportProgress"
      :is-exporting="store.isExporting"
      @export="handleExport"
      @copy="handleCopy"
      @close="closeShareDialog"
    />

    <!-- 删除确认对话框 -->
    <n-modal v-model:show="showDeleteDialog" preset="dialog" type="warning" title="确认删除">
      确定要删除相册「{{ deletingAlbum?.name }}」吗？此操作不可恢复。
      <template #action>
        <n-space justify="end">
          <n-button @click="showDeleteDialog = false">取消</n-button>
          <n-button type="error" :loading="deleting" @click="handleDelete">
            删除
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import {
  Location24Regular,
  People24Regular,
  Person24Regular,
  CalendarToday24Regular,
  Image24Regular,
  Add24Regular,
  Folder24Regular,
  Edit24Regular,
  Delete24Regular,
  Camera24Regular,
  Share24Regular,
  CheckmarkCircle24Regular,
  ErrorCircle24Regular,
  Settings24Regular,
  ChevronUp24Regular,
} from '@vicons/fluent'
import { useMessage, type FormRules, type FormInst } from 'naive-ui'
import { useAlbumStore, type Album, type AlbumPhoto, type ShareOptions } from '@/stores/albumStore'
import CoverPhotoSelector from '@/components/album/CoverPhotoSelector.vue'
import AlbumShareDialog from '@/components/album/AlbumShareDialog.vue'

const router = useRouter()
const message = useMessage()
const store = useAlbumStore()

// Computed
const loading = computed(() => store.loading)
const placeAlbums = computed(() => store.placeAlbums)
const peopleAlbums = computed(() => store.peopleAlbums)
const yearAlbums = computed(() => store.yearAlbums)
const manualAlbums = computed(() => store.manualAlbums)
const allAlbums = computed(() => store.allAlbums)
const albumPhotos = computed(() => store.albumPhotos)

// Dialog states
const showCreateDialog = computed({
  get: () => store.showCreateDialog,
  set: (val) => val ? store.openCreateDialog('manual') : store.closeCreateDialog()
})
const showEditDialog = ref(false)
const showDeleteDialog = ref(false)
const showCoverSelector = ref(false)
const showShareDialog = computed({
  get: () => store.showShareDialog,
  set: (val) => val ? store.openShareDialog(sharingAlbum.value!) : store.closeShareDialog()
})
const creating = ref(false)
const saving = ref(false)
const deleting = ref(false)

// Form refs
const formRef = ref<FormInst | null>(null)
const editFormRef = ref<FormInst | null>(null)

// Editing state
const editingAlbum = ref<Album | null>(null)
const deletingAlbum = ref<Album | null>(null)
const coverSelectorAlbum = ref<Album | null>(null)
const sharingAlbum = computed(() => store.sharingAlbum)

// Create form
const createForm = reactive({
  type: 'manual' as 'manual' | 'smart',
  name: '',
  description: '',
  query: ''
})

const formRules: FormRules = {
  name: {
    required: true,
    message: '请输入相册名称',
    trigger: ['blur', 'input']
  }
}

const editForm = reactive({
  name: '',
  description: ''
})

const editRules: FormRules = {
  name: {
    required: true,
    message: '请输入相册名称',
    trigger: ['blur', 'input']
  }
}

// Methods
const openCreateDialog = (type: 'manual' | 'smart') => {
  createForm.type = type
  createForm.name = ''
  createForm.description = ''
  createForm.query = ''
  store.openCreateDialog(type)
}

const closeCreateDialog = () => {
  store.closeCreateDialog()
}

const handleCreate = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  creating.value = true
  try {
    let result: Album | null = null

    if (createForm.type === 'smart') {
      result = await store.createSmartAlbum(createForm.name, createForm.query)
    } else {
      result = await store.createManualAlbum(createForm.name, createForm.description)
    }

    if (result) {
      message.success('相册创建成功')
      closeCreateDialog()
    } else {
      message.error('相册创建失败')
    }
  } finally {
    creating.value = false
  }
}

const openAlbum = (album: Album) => {
  if (album.type === 'year') {
    router.push(`/timeline/${album.year}`)
  } else if (album.type === 'person') {
    router.push('/people')
  } else {
    router.push(`/search?type=${album.type}&q=${encodeURIComponent(album.name)}`)
  }
}

const editAlbum = (album: Album) => {
  editingAlbum.value = album
  editForm.name = album.name
  editForm.description = album.description || ''
  showEditDialog.value = true
}

const closeEditDialog = () => {
  showEditDialog.value = false
  editingAlbum.value = null
}

const handleEdit = async () => {
  if (!editingAlbum.value) return

  try {
    await editFormRef.value?.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    const result = await store.updateAlbum(editingAlbum.value.id, {
      name: editForm.name,
      description: editForm.description
    })

    if (result) {
      message.success('相册更新成功')
      closeEditDialog()
    } else {
      message.error('相册更新失败')
    }
  } finally {
    saving.value = false
  }
}

// Cover selector methods
const openCoverSelector = async (album: Album) => {
  if (album.type !== 'manual') {
    message.info('智能相册封面由系统自动更新')
    return
  }

  coverSelectorAlbum.value = album
  showCoverSelector.value = true

  await store.loadAlbumPhotos(album.id)
}

const handleCoverSelect = async (photoId: number) => {
  if (!coverSelectorAlbum.value) return

  const success = await store.setCoverPhoto(coverSelectorAlbum.value.id, photoId)

  if (success) {
    message.success('封面设置成功')
    showCoverSelector.value = false
    await store.loadAlbums()
  } else {
    message.error('封面设置失败')
  }
}

// Share methods
const openShareDialog = (album: Album) => {
  sharingAlbum.value = album
  store.openShareDialog(album)
}

const closeShareDialog = () => {
  store.closeShareDialog()
}

const handleExport = async (type: 'zip' | 'html' | 'pdf', options: ShareOptions) => {
  let result

  switch (type) {
    case 'zip':
      result = await store.exportAlbumAsZip(options)
      break
    case 'html':
      result = await store.exportAlbumAsHtml(options)
      break
    case 'pdf':
      result = await store.exportAlbumAsPdf(options)
      break
  }

  if (result?.success) {
    message.success(`已导出到: ${result.exportPath}`)
  } else {
    message.error(result?.error || '导出失败')
  }
}

const handleCopy = async () => {
  const success = await store.copyPhotosToClipboard()
  if (success) {
    message.success('已复制到剪贴板')
  } else {
    message.error('复制失败')
  }
}

const confirmDelete = (album: Album) => {
  deletingAlbum.value = album
  showDeleteDialog.value = true
}

const handleDelete = async () => {
  if (!deletingAlbum.value) return

  deleting.value = true
  try {
    const success = await store.deleteAlbum(deletingAlbum.value.id)
    if (success) {
      message.success('相册已删除')
      showDeleteDialog.value = false
    } else {
      message.error('删除失败')
    }
  } finally {
    deleting.value = false
  }
}

// Initialize
onMounted(() => {
  store.loadAlbums()
})
</script>

<style scoped>
.albums-container {
  min-height: 100vh;
  background: #f5f5f7;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  text-align: center;
  padding: 32px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.header h1 {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.subtitle {
  color: #666;
  margin: 0;
}

.loading-state {
  text-align: center;
  padding: 64px 0;
  color: #666;
}

.album-section {
  margin-bottom: 32px;
}

.section-header {
  margin-bottom: 16px;
}

.section-header h2 {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
}

.album-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
}

.album-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.album-cover {
  aspect-ratio: 16/9;
  background: linear-gradient(135deg, #f0f0f5, #e8e8f0);
  border-radius: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 12px;
  overflow: hidden;
}

.album-cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
}

.person-cover {
  aspect-ratio: 1;
  border-radius: 50%;
}

.year-cover {
  background: linear-gradient(135deg, #5E6AD2, #8B9EFF);
}

.year-text {
  font-size: 32px;
  font-weight: 700;
  color: white;
}

.album-info h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 4px;
}

.album-info p {
  font-size: 14px;
  color: #999;
  margin: 0;
}

.album-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: none;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 4px;
  gap: 4px;
}

.album-card:hover .album-actions {
  display: flex;
}

.empty-state {
  text-align: center;
  padding: 64px 0;
}

@media (max-width: 768px) {
  .n-grid {
    grid-template-columns: repeat(2, 1fr) !important;
  }
}
</style>
