/**
 * PhotoMind - 相册视图
 * 反AI味 · 现代极简主义设计
 */
<template>
  <div class="albums-container">
    <header class="page-header">
      <div class="header-content">
        <h1>智能相册</h1>
        <p class="subtitle">按人物、地点自动整理</p>
      </div>
      <n-space>
        <n-button type="primary" @click="openCreateDialog('manual')">
          <template #icon>
            <n-icon><Add24Regular /></n-icon>
          </template>
          创建相册
        </n-button>
        <n-button quaternary circle @click="handleRefresh" :loading="loading">
          <template #icon>
            <n-icon><ArrowSync24Regular /></n-icon>
          </template>
        </n-button>
      </n-space>
    </header>

    <!-- 加载状态 -->
    <div class="loading-state" v-if="loading && allAlbums.length === 0">
      <n-spin size="large" />
      <p>加载相册...</p>
    </div>

    <!-- 智能相册 -->
    <template v-else>
      <!-- 地点相册 -->
      <section class="album-section" v-if="placeAlbums.length > 0">
        <div class="section-header">
          <h2>
            <n-icon size="20"><Location24Regular /></n-icon>
            按地点
          </h2>
        </div>
        <div class="album-grid">
          <div
            v-for="album in placeAlbums"
            :key="album.id"
            class="album-card"
            @click="openAlbum(album)"
          >
            <div class="album-cover place-cover">
              <n-icon size="40" color="#0071E3"><Location24Regular /></n-icon>
            </div>
            <div class="album-info">
              <h3>{{ album.name }}</h3>
              <p>{{ album.photoCount }} 张照片</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 人物相册 -->
      <section class="album-section" v-if="peopleAlbums.length > 0">
        <div class="section-header">
          <h2>
            <n-icon size="20"><People24Regular /></n-icon>
            按人物
          </h2>
        </div>
        <div class="album-grid people-grid">
          <div
            v-for="album in peopleAlbums"
            :key="album.id"
            class="album-card person-card"
            @click="openAlbum(album)"
          >
            <div class="album-cover person-cover">
              <n-icon size="36" color="#AF52DE"><Person24Regular /></n-icon>
            </div>
            <div class="album-info">
              <h3>{{ album.name }}</h3>
              <p>{{ album.photoCount }} 张照片</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 历年回忆 -->
      <section class="album-section" v-if="yearAlbums.length > 0">
        <div class="section-header">
          <h2>
            <n-icon size="20"><CalendarToday24Regular /></n-icon>
            历年回忆
          </h2>
        </div>
        <div class="album-grid">
          <div
            v-for="album in yearAlbums"
            :key="album.id"
            class="album-card"
            @click="openAlbum(album)"
          >
            <div class="album-cover year-cover">
              <span class="year-text">{{ album.year }}</span>
            </div>
            <div class="album-info">
              <h3>{{ album.name }}</h3>
              <p>{{ album.photoCount }} 张照片</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 我的相册 -->
      <section class="album-section" v-if="manualAlbums.length > 0">
        <div class="section-header">
          <h2>
            <n-icon size="20"><Folder24Regular /></n-icon>
            我的相册
          </h2>
        </div>
        <div class="album-grid">
          <div
            v-for="album in manualAlbums"
            :key="album.id"
            class="album-card"
            @click="openAlbum(album)"
          >
            <div class="album-cover">
              <img
                v-if="album.coverPhotoPath"
                :src="album.coverPhotoPath"
                class="album-cover-image"
                alt="封面"
              />
              <div v-else class="cover-placeholder">
                <n-icon size="40" color="#0071E3"><Image24Regular /></n-icon>
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
          </div>
        </div>
      </section>

      <!-- 空状态 -->
      <EmptyState
        v-if="allAlbums.length === 0 && !loading"
        type="albums"
        :primary-action="{
          label: '创建相册',
          onClick: () => openCreateDialog('manual')
        }"
      />
    </template>

    <!-- 创建相册对话框 -->
    <n-modal
      v-model:show="showCreateDialog"
      preset="card"
      title="创建相册"
      class="album-modal"
      :bordered="false"
    >
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

        <n-form-item v-if="createForm.type === 'smart'" label="搜索条件" path="query">
          <n-input
            v-model:value="createForm.query"
            type="textarea"
            placeholder="例如: 2024 AND location:北京"
            :rows="2"
          />
          <p class="form-hint">支持关键词、日期、地点等搜索条件</p>
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
    <n-modal
      v-model:show="showEditDialog"
      preset="card"
      title="编辑相册"
      class="album-modal"
      :bordered="false"
    >
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
          <n-button type="error" ghost @click="confirmDelete(editingAlbum!)">
            删除相册
          </n-button>
          <n-space>
            <n-button @click="closeEditDialog">取消</n-button>
            <n-button type="primary" :loading="saving" @click="handleEdit">
              保存
            </n-button>
          </n-space>
        </n-space>
      </template>
    </n-modal>

    <!-- 封面选择器 -->
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

    <!-- 删除确认 -->
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
  ArrowSync24Regular,
} from '@vicons/fluent'
import { useMessage, type FormRules, type FormInst } from 'naive-ui'
import { useAlbumStore, type Album, type ShareOptions } from '@/stores/albumStore'
import CoverPhotoSelector from '@/components/album/CoverPhotoSelector.vue'
import AlbumShareDialog from '@/components/album/AlbumShareDialog.vue'
import EmptyState from '@/components/EmptyState.vue'

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

// Forms
const createForm = reactive({
  type: 'manual' as 'manual' | 'smart',
  name: '',
  description: '',
  query: ''
})

const formRules: FormRules = {
  name: { required: true, message: '请输入相册名称', trigger: ['blur', 'input'] }
}

const editForm = reactive({ name: '', description: '' })
const editRules: FormRules = { name: { required: true, message: '请输入相册名称', trigger: ['blur', 'input'] } }

// Methods
const handleRefresh = async () => {
  await store.refresh()
  message.success('智能相册已刷新')
}

const openCreateDialog = (type: 'manual' | 'smart') => {
  createForm.type = type
  createForm.name = ''
  createForm.description = ''
  createForm.query = ''
  store.openCreateDialog(type)
}

const closeCreateDialog = () => store.closeCreateDialog()

const handleCreate = async () => {
  try {
    await formRef.value?.validate()
  } catch { return }

  creating.value = true
  try {
    const result = createForm.type === 'smart'
      ? await store.createSmartAlbum(createForm.name, createForm.query)
      : await store.createManualAlbum(createForm.name, createForm.description)

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
  } catch { return }

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

const openShareDialog = (album: Album) => {
  sharingAlbum.value = album
  store.openShareDialog(album)
}

const closeShareDialog = () => store.closeShareDialog()

const handleExport = async (type: 'zip' | 'html' | 'pdf', options: ShareOptions) => {
  let result
  switch (type) {
    case 'zip': result = await store.exportAlbumAsZip(options); break
    case 'html': result = await store.exportAlbumAsHtml(options); break
    case 'pdf': result = await store.exportAlbumAsPdf(options); break
  }
  if (result?.success) {
    message.success(`已导出到: ${result.exportPath}`)
  } else {
    message.error(result?.error || '导出失败')
  }
}

const handleCopy = async () => {
  const success = await store.copyPhotosToClipboard()
  message.success(success ? '已复制到剪贴板' : '复制失败')
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
onMounted(() => store.loadAlbums())
</script>

<style scoped>
/* ================================
   容器
   ================================ */
.albums-container {
  min-height: 100vh;
  background: var(--bg-primary);
  padding: calc(var(--nav-height) + var(--space-xl)) var(--space-lg) var(--space-lg);
  max-width: var(--content-max-width);
  margin: 0 auto;
}

/* ================================
   页面头部
   ================================ */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xl);
}

.header-content h1 {
  font-size: var(--text-hero);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin: 0 0 var(--space-xs);
  letter-spacing: -0.5px;
}

.subtitle {
  color: var(--text-secondary);
  margin: 0;
  font-size: var(--text-body);
}

/* ================================
   加载状态
   ================================ */
.loading-state {
  text-align: center;
  padding: var(--space-3xl) 0;
  color: var(--text-secondary);
}

.loading-state p {
  margin-top: var(--space-md);
}

/* ================================
   相册区块
   ================================ */
.album-section {
  margin-bottom: var(--space-2xl);
}

.section-header {
  margin-bottom: var(--space-lg);
}

.section-header h2 {
  font-size: var(--text-h2);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin: 0;
}

/* ================================
   相册网格
   ================================ */
.album-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-md);
}

.people-grid {
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}

/* ================================
   相册卡片
   ================================ */
.album-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: transform var(--duration-normal) var(--ease-default),
              box-shadow var(--duration-normal) var(--ease-default);
  position: relative;
}

.album-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-hover);
}

.album-cover {
  aspect-ratio: 16/10;
  background: linear-gradient(135deg, #f5f5f7, #e8e8ed);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.place-cover {
  background: linear-gradient(135deg, #E8F4FD, #D1E9FF);
}

.person-cover {
  aspect-ratio: 1;
  background: linear-gradient(135deg, #F3E8FF, #E9D5FF);
  border-radius: 50%;
  margin: var(--space-md);
}

.year-cover {
  background: linear-gradient(135deg, #0071E3, #00A3FF);
}

.year-text {
  font-size: 32px;
  font-weight: var(--font-bold);
  color: white;
}

.album-cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}

.album-info {
  padding: var(--space-md);
}

.album-info h3 {
  font-size: var(--text-body);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-info p {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin: 0;
}

/* ================================
   相册操作
   ================================ */
.album-actions {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  display: none;
  gap: 4px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: var(--radius-sm);
  padding: 4px;
}

.album-card:hover .album-actions {
  display: flex;
}

/* ================================
   模态框
   ================================ */
.album-modal {
  width: 500px;
  max-width: 90vw;
}

.form-hint {
  font-size: var(--text-caption);
  color: var(--text-tertiary);
  margin: var(--space-xs) 0 0;
}

/* ================================
   响应式
   ================================ */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-md);
  }

  .album-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .people-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
