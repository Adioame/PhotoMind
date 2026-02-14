/**
 * PhotoMind - 人物详情视图
 * 反AI味 · 现代极简主义设计
 */
<template>
  <div class="person-detail-container">
    <!-- 面包屑导航 -->
    <BreadcrumbNav :items="breadcrumbItems" />

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <n-spin size="large" />
      <p>加载人物信息...</p>
    </div>

    <!-- 人物不存在 -->
    <EmptyState
      v-else-if="!person"
      type="error"
      title="人物不存在"
      description="该人物可能已被删除或不存在"
      :primary-action="{
        label: '返回人物列表',
        onClick: () => $router.push('/people')
      }"
    />

    <!-- 人物详情内容 -->
    <template v-else>
      <!-- 人物头部信息 -->
      <header class="person-header">
        <div class="person-identity">
          <n-avatar
            round
            :size="80"
            :src="avatarUrl"
            :style="{ backgroundColor: avatarColor }"
            class="person-avatar"
            fallback-src="/default-avatar.png"
          >
            {{ initials }}
          </n-avatar>
          <div class="person-meta">
            <h1>{{ displayName }}</h1>
            <p class="photo-count">{{ resultTotal || photos.length }} 张照片</p>
          </div>
        </div>

        <n-space>
          <n-button @click="handleRename">
            <template #icon>
              <n-icon><Edit24Regular /></n-icon>
            </template>
            重命名
          </n-button>
          <n-button @click="showMergeModal = true">
            <template #icon>
              <n-icon><Merge24Regular /></n-icon>
            </template>
            合并人物
          </n-button>
          <n-button type="error" ghost @click="handleDelete">
            <template #icon>
              <n-icon><Delete24Regular /></n-icon>
            </template>
            删除
          </n-button>
        </n-space>
      </header>

      <!-- 过滤器 -->
      <section class="filter-section" v-if="person">
        <div class="filter-controls">
          <n-space align="center">
            <n-switch v-model:value="primaryOnly" @update:value="onFilterChange">
              <template #checked>只显示个人照</template>
              <template #unchecked>显示所有照片</template>
            </n-switch>
            <span class="filter-hint" v-if="photoStats">
              共 {{ photoStats.totalPhotos }} 张
              <span class="stats-detail">
                ({{ photoStats.primaryPhotos }} 张个人照 + {{ photoStats.groupPhotos }} 张合影)
              </span>
            </span>
          </n-space>
        </div>
      </section>

      <!-- 照片网格 -->
      <section class="photos-section">
        <!-- 人物拆分模式：自定义网格渲染 -->
        <div v-if="!loadingPhotos && photos.length > 0" class="photo-grid">
          <div
            v-for="photo in photos"
            :key="photo.id"
            class="photo-card"
            @click="openPhoto(photo)"
          >
            <img
              :src="photo.thumbnailPath || photo.filePath"
              :alt="photo.fileName"
              loading="lazy"
              @error="handleImageError"
            />
            <!-- 人物拆分按钮 -->
            <button
              class="split-face-btn"
              @click.stop="handleSplitFace(photo)"
              title="拆分出新人物"
            >
              <span class="split-icon">👤+</span>
            </button>
          </div>
        </div>

        <EmptyState
          v-if="photos.length === 0 && !loadingPhotos"
          type="photos"
          description="该人物暂无照片"
          hint="系统会自动识别包含此人物的照片"
        />
      </section>
    </template>

    <!-- 重命名弹窗 -->
    <n-modal
      v-model:show="showRenameModal"
      title="重命名人物"
      preset="dialog"
      positive-text="确认"
      negative-text="取消"
      @positive-click="confirmRename"
      @negative-click="showRenameModal = false"
    >
      <n-input
        v-model:value="newName"
        placeholder="请输入新名称"
        maxlength="50"
        show-count
      />
    </n-modal>

    <!-- 合并人物弹窗 -->
    <n-modal
      v-model:show="showMergeModal"
      title="合并人物"
      preset="card"
      class="merge-modal"
      :bordered="false"
    >
      <p class="merge-hint">选择要将 "{{ displayName }}" 合并到的人物：</p>
      <n-select
        v-model:value="mergeTargetId"
        :options="mergeOptions"
        placeholder="选择目标人物"
        filterable
      />
      <template #footer>
        <n-space justify="end">
          <n-button @click="showMergeModal = false">取消</n-button>
          <n-button type="primary" @click="confirmMerge" :disabled="!mergeTargetId">
            确认合并
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 拆分人物弹窗 -->
    <n-modal
      v-model:show="showSplitModal"
      title="标记人物"
      preset="card"
      class="split-modal"
      :bordered="false"
    >
      <n-tabs v-model:value="splitMode" type="line">
        <!-- 创建新人物 -->
        <n-tab-pane name="create" tab="创建新人物">
          <p class="split-hint">
            将这张照片中的<strong>{{ displayName }}</strong>标记为新人物
          </p>
          <n-input
            v-model:value="splitNewName"
            placeholder="输入新人物名称，例如：爸爸"
            maxlength="50"
            show-count
            @keyup.enter="confirmSplit"
          />
        </n-tab-pane>

        <!-- 分配给现有人物 -->
        <n-tab-pane name="assign" tab="分配给现有Person">
          <p class="split-hint">
            将这张照片中的<strong>{{ displayName }}</strong>迁移到已存在的人物
          </p>
          <n-select
            v-model:value="splitTargetPersonId"
            :options="splitTargetOptions"
            placeholder="选择目标人物"
            filterable
            clearable
          />
        </n-tab-pane>
      </n-tabs>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showSplitModal = false">取消</n-button>
          <n-button type="primary" @click="confirmSplit" :disabled="!canConfirmSplit">
            确认
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMessage, useDialog } from 'naive-ui'
import { Edit24Regular, Merge24Regular, Delete24Regular } from '@vicons/fluent'
import { usePeopleStore, type Person } from '@/stores/peopleStore'
import BreadcrumbNav from '@/components/nav/BreadcrumbNav.vue'
import EmptyState from '@/components/EmptyState.vue'
import { generatePersonBreadcrumb } from '@/utils/breadcrumbConfig'

interface Props {
  personId: string
}

const props = defineProps<Props>()
const router = useRouter()
const route = useRoute()
const message = useMessage()
const dialog = useDialog()
const peopleStore = usePeopleStore()

// 状态
const person = ref<Person | null>(null)
const photos = ref<any[]>([])
const resultTotal = ref<number | null>(null)
const loading = ref(false)
const loadingPhotos = ref(false)
let isLoadingData = false // 防止竞态条件的执行标志

// 过滤器状态
// TODO: 当前默认显示所有照片，因为 is_primary 标记尚未实现
// 后续需要根据人脸大小/位置自动标记主要人脸，或提供手动标记功能
const primaryOnly = ref(false) // 默认显示所有照片（包括合影）
const photoStats = ref<{
  totalPhotos: number
  primaryPhotos: number
  groupPhotos: number
  avgConfidence: number
} | null>(null)

// 重命名弹窗
const showRenameModal = ref(false)
const newName = ref('')

// 合并弹窗
const showMergeModal = ref(false)
const mergeTargetId = ref<number | null>(null)

// 拆分弹窗
const showSplitModal = ref(false)
const splitMode = ref<'create' | 'assign'>('create')
const splitNewName = ref('')
const splitTargetPersonId = ref<number | null>(null)
const splitTargetPhoto = ref<any>(null)

// 头像颜色映射 - 使用新的配色方案
const avatarColors = [
  '#0071E3', '#34C759', '#FF9500', '#FF3B30',
  '#AF52DE', '#5856D6', '#FF2D55', '#5AC8FA',
  '#FFCC00', '#8E8E93', '#C7C7CC', '#007AFF'
]

// 计算属性
const displayName = computed(() => {
  return person.value?.display_name || person.value?.name || ''
})

const initials = computed(() => {
  const name = person.value?.name || ''
  return name.charAt(0).toUpperCase()
})

const avatarColor = computed(() => {
  const name = person.value?.name || ''
  const index = name.charCodeAt(0) % avatarColors.length
  return avatarColors[index]
})

// 头像 URL - 转换为 local-resource 协议
const avatarUrl = computed(() => {
  const path = person.value?.avatar_path
  if (!path) return null

  // 已经是完整协议路径
  if (path.startsWith('local-resource://')) return path

  // 绝对路径转为 local-resource 协议
  if (path.startsWith('/')) {
    return `local-resource://${path}`
  }

  // 相对路径（如 thumbnails/faces/xxx.jpg）转为 local-resource
  return `local-resource:///${path}`
})

const breadcrumbItems = computed(() => {
  return generatePersonBreadcrumb(displayName.value, person.value?.id)
})

const mergeOptions = computed(() => {
  return peopleStore.people
    .filter(p => p.id !== person.value?.id)
    .map(p => ({
      label: p.display_name || p.name,
      value: p.id
    }))
})

// 拆分目标人物选项（排除当前人物）
const splitTargetOptions = computed(() => {
  console.log('[splitTargetOptions] peopleStore.people:', peopleStore.people.length, 'current person:', person.value?.id)
  const options = peopleStore.people
    .filter(p => p.id !== person.value?.id)
    .map(p => ({
      label: `${p.display_name || p.name} (${p.face_count}张照片)`,
      value: p.id
    }))
  console.log('[splitTargetOptions] filtered options:', options.length)
  return options
})

// 是否可以确认拆分
const canConfirmSplit = computed(() => {
  if (splitMode.value === 'create') {
    return splitNewName.value.trim().length > 0
  }
  return splitTargetPersonId.value !== null
})

// 加载人物数据
async function loadPersonData() {
  // 防止竞态条件：如果已经在加载中，跳过
  if (isLoadingData) {
    console.log('[PersonDetail] 加载已在进行中，跳过重复调用')
    return
  }

  console.log('[PersonDetail] props.personId:', props.personId, '类型:', typeof props.personId)
  const id = Number(props.personId)
  console.log('[PersonDetail] 转换后 id:', id, '类型:', typeof id)
  if (!id) {
    person.value = null
    console.log('[PersonDetail] id 无效，跳过')
    return
  }

  isLoadingData = true
  loading.value = true

  try {
    person.value = await peopleStore.getPersonById(id)
    console.log('[PersonDetail] getPersonById 返回:', person.value)

    if (person.value) {
      peopleStore.setLastVisitedPerson(id)
      await Promise.all([
        loadPersonPhotos(id),
        loadPhotoStats(id)
      ])
    } else {
      console.log('[PersonDetail] 人物不存在，停止加载照片')
    }
  } catch (error) {
    console.error('[PersonDetail] 加载人物数据失败:', error)
    message.error('加载人物数据失败')
  } finally {
    loading.value = false
    isLoadingData = false
  }
}

// 加载人物照片统计
async function loadPhotoStats(personId: number) {
  try {
    const stats = await (window as any).photoAPI?.people?.getPhotoStats?.(personId)
    if (stats) {
      photoStats.value = stats
    }
  } catch (error) {
    console.error('[PersonDetail] 加载照片统计失败:', error)
  }
}

// 加载人物照片
async function loadPersonPhotos(personId: number) {
  loadingPhotos.value = true
  try {
    console.log(`[PersonDetail] 加载人物 ${personId} 的照片...`)
    console.log(`[PersonDetail] 过滤器: primaryOnly=${primaryOnly.value}`)

    const result = await (window as any).photoAPI.people.getPhotos({
      personId,
      primaryOnly: primaryOnly.value
    })

    console.log('[PersonDetail] API 返回结果:', result)
    console.log('[PersonDetail] photos 数量:', result?.photos?.length || 0)
    console.log('[PersonDetail] total:', result?.total)

    // 从返回的包装对象中提取 photo 字段
    photos.value = result?.photos?.map((p: any) => p.photo) || []
    resultTotal.value = result?.total || photos.value.length

    console.log('[PersonDetail] 提取后的照片数量:', photos.value.length)
    if (photos.value.length > 0) {
      console.log('[PersonDetail] 第一张照片数据:', JSON.stringify(photos.value[0], null, 2))
      console.log('[PersonDetail] thumbnailPath:', photos.value[0]?.thumbnailPath)
      console.log('[PersonDetail] filePath:', photos.value[0]?.filePath)
    }
  } catch (error) {
    console.error('[PersonDetail] 加载人物照片失败:', error)
    photos.value = []
  } finally {
    loadingPhotos.value = false
  }
}

// 过滤器变化时重新加载
async function onFilterChange() {
  if (person.value) {
    await loadPersonPhotos(person.value.id)
  }
}

// 图片加载失败处理
function handleImageError(e: Event) {
  const img = e.target as HTMLImageElement
  img.src = '/placeholder-image.png'
}

// 打开照片
function openPhoto(photo: any) {
  router.push({
    path: `/photo/${photo.id || photo.uuid}`,
    query: {
      from: 'person',
      personId: props.personId
    }
  })
}

// 重命名
function handleRename() {
  newName.value = displayName.value
  showRenameModal.value = true
}

async function confirmRename() {
  if (!newName.value.trim() || !person.value) return

  try {
    const result = await (window as any).photoAPI?.people?.update?.(person.value.id, {
      name: newName.value.trim(),
      displayName: newName.value.trim()
    })

    if (result?.success) {
      message.success('重命名成功')
      person.value.display_name = newName.value.trim()
      person.value.name = newName.value.trim()
      await peopleStore.fetchPeople()
    } else {
      message.error(result?.error || '重命名失败')
    }
  } catch (error) {
    console.error('重命名失败:', error)
    message.error('重命名失败')
  } finally {
    showRenameModal.value = false
  }
}

// 合并人物
async function confirmMerge() {
  if (!mergeTargetId.value || !person.value) return

  const targetPerson = peopleStore.people.find(p => p.id === mergeTargetId.value)

  dialog.warning({
    title: '确认合并',
    content: `确定要将 "${displayName.value}" 合并到 "${targetPerson?.display_name || targetPerson?.name}" 吗？此操作不可撤销。`,
    positiveText: '确认合并',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        // 使用 faceMatching.mergePersons API
        const result = await (window as any).photoAPI?.faceMatching?.mergePersons?.(
          person.value?.id,
          mergeTargetId.value
        )

        if (result?.success) {
          message.success(`合并成功，共合并 ${result.merged} 张人脸`)
          await peopleStore.fetchPeople()
          router.push('/people')
        } else {
          message.error(result?.error || '合并失败')
        }
      } catch (error) {
        console.error('合并失败:', error)
        message.error('合并失败')
      }
    }
  })

  showMergeModal.value = false
}

// 拆分人物
async function handleSplitFace(photo: any) {
  splitTargetPhoto.value = photo
  splitMode.value = 'create'
  splitNewName.value = ''
  splitTargetPersonId.value = null

  // 确保人物列表已加载
  if (peopleStore.people.length === 0) {
    await peopleStore.fetchPeople()
  }

  showSplitModal.value = true
}

async function confirmSplit() {
  if (!person.value || !splitTargetPhoto.value) {
    return false
  }

  // 验证输入
  if (splitMode.value === 'create' && !splitNewName.value.trim()) {
    message.error('请输入新人物名称')
    return false
  }
  if (splitMode.value === 'assign' && !splitTargetPersonId.value) {
    message.error('请选择目标人物')
    return false
  }

  try {
    const result = await (window as any).photoAPI?.people?.splitFace?.(
      splitTargetPhoto.value.id,
      person.value.id,
      splitMode.value === 'create' ? splitNewName.value.trim() : '',
      splitMode.value === 'assign' ? splitTargetPersonId.value : undefined
    )

    if (result?.success) {
      const targetName = splitMode.value === 'create'
        ? splitNewName.value.trim()
        : splitTargetOptions.value.find(o => o.value === splitTargetPersonId.value)?.label.split(' (')[0]
      message.success(`已将照片迁移到 "${targetName}"`)
      // 刷新数据
      await Promise.all([
        loadPersonData(),
        peopleStore.fetchPeople()
      ])
    } else if (result?.error?.startsWith('EXISTING_PERSON:')) {
      // 人物已存在，提示用户切换到"分配给现有人物"模式
      const existingId = parseInt(result.error.split(':')[1])
      const existingName = splitNewName.value.trim()
      dialog.info({
        title: '人物已存在',
        content: `人物 "${existingName}" 已存在。是否将照片分配给该人物？`,
        positiveText: '分配给该人物',
        negativeText: '取消',
        onPositiveClick: async () => {
          // 自动切换到assign模式并选择该人物
          splitMode.value = 'assign'
          splitTargetPersonId.value = existingId
          await confirmSplit()
        }
      })
      return false
    } else {
      message.error(result?.error || '拆分失败')
    }
  } catch (error) {
    console.error('拆分失败:', error)
    message.error('拆分失败')
  } finally {
    showSplitModal.value = false
    splitTargetPhoto.value = null
    splitTargetPersonId.value = null
    splitNewName.value = ''
  }
  return true
}

// 删除人物
function handleDelete() {
  if (!person.value) return

  dialog.error({
    title: '确认删除',
    content: `确定要删除人物 "${displayName.value}" 吗？该人物的所有照片关联将被移除，但照片本身不会被删除。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const result = await (window as any).photoAPI?.people?.delete?.(person.value?.id)

        if (result?.success) {
          message.success('人物已删除')
          await peopleStore.fetchPeople()
          router.push('/people')
        } else {
          message.error(result?.error || '删除失败')
        }
      } catch (error) {
        console.error('删除失败:', error)
        message.error('删除失败')
      }
    }
  })
}

// 监听路由参数变化
watch(() => props.personId, loadPersonData)

// 初始化
onMounted(() => {
  loadPersonData()
  if (peopleStore.people.length === 0) {
    peopleStore.fetchPeople()
  }
})
</script>

<style scoped>
/* ================================
   容器
   ================================ */
.person-detail-container {
  min-height: 100vh;
  background: var(--bg-primary);
  padding: calc(var(--nav-height) + var(--space-xl)) var(--space-lg) var(--space-lg);
  max-width: var(--content-max-width);
  margin: 0 auto;
}

/* ================================
   加载状态
   ================================ */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl) 0;
  color: var(--text-secondary);
}

.loading-state p {
  margin-top: var(--space-md);
}

/* ================================
   人物头部
   ================================ */
.person-header {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  margin-top: var(--space-lg);
  margin-bottom: var(--space-xl);
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: var(--shadow-md);
}

.person-identity {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.person-avatar {
  font-size: 32px;
  font-weight: var(--font-semibold);
  box-shadow: var(--shadow-md);
}

.person-meta h1 {
  font-size: var(--text-h1);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin: 0;
}

.photo-count {
  color: var(--text-secondary);
  margin: var(--space-xs) 0 0;
  font-size: var(--text-body);
}

/* ================================
   过滤器区域
   ================================ */
.filter-section {
  margin-bottom: var(--space-lg);
}

.filter-controls {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-md) var(--space-lg);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filter-hint {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.stats-detail {
  color: var(--text-tertiary);
  margin-left: var(--space-xs);
}

/* ================================
   照片区域
   ================================ */
.photos-section {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  box-shadow: var(--shadow-md);
}

/* ================================
   照片网格
   ================================ */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-md);
}

.photo-card {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-tertiary);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.photo-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.photo-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.photo-card:hover img {
  transform: scale(1.05);
}

/* 拆分按钮 */
.split-face-btn {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s ease;
  z-index: 10;
}

.photo-card:hover .split-face-btn {
  opacity: 1;
  transform: scale(1);
}

.split-face-btn:hover {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  transform: scale(1.1) !important;
}

.split-icon {
  font-size: 16px;
  line-height: 1;
}

/* 拆分弹窗样式 */
.split-modal {
  width: 480px;
  max-width: 90vw;
}

.split-hint {
  margin-bottom: var(--space-md);
  color: var(--text-secondary);
  font-size: var(--text-body);
  line-height: 1.6;
}

.split-hint strong {
  color: var(--text-primary);
}

/* ================================
   合并弹窗
   ================================ */
.merge-modal {
  width: 480px;
  max-width: 90vw;
}

.merge-hint {
  margin-bottom: var(--space-md);
  color: var(--text-secondary);
  font-size: var(--text-body);
}

/* ================================
   响应式
   ================================ */
@media (max-width: 768px) {
  .person-detail-container {
    padding: calc(var(--nav-height) + var(--space-lg)) var(--space-md) var(--space-md);
  }

  .person-header {
    flex-direction: column;
    gap: var(--space-md);
    align-items: flex-start;
  }

  .person-identity {
    gap: var(--space-md);
  }

  .person-avatar {
    width: 64px;
    height: 64px;
    font-size: 24px;
  }

  .person-meta h1 {
    font-size: var(--text-h2);
  }

  .photos-section {
    padding: var(--space-md);
  }

  .photo-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-sm);
  }

  .split-face-btn {
    opacity: 1;
    transform: scale(1);
    width: 32px;
    height: 32px;
  }

  .filter-controls {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-sm);
  }
}
</style>
