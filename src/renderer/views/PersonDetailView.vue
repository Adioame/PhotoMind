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
            :style="{ backgroundColor: avatarColor }"
            class="person-avatar"
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

      <!-- 照片网格 -->
      <section class="photos-section">
        <PhotoGrid
          :photos="photos"
          :loading="loadingPhotos"
          @photo-click="openPhoto"
        />

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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMessage, useDialog } from 'naive-ui'
import { Edit24Regular, Merge24Regular, Delete24Regular } from '@vicons/fluent'
import { usePeopleStore, type Person } from '@/stores/peopleStore'
import BreadcrumbNav from '@/components/nav/BreadcrumbNav.vue'
import PhotoGrid from '@/components/PhotoGrid.vue'
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

// 重命名弹窗
const showRenameModal = ref(false)
const newName = ref('')

// 合并弹窗
const showMergeModal = ref(false)
const mergeTargetId = ref<number | null>(null)

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
      await loadPersonPhotos(id)
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

// 加载人物照片
async function loadPersonPhotos(personId: number) {
  loadingPhotos.value = true
  try {
    console.log(`[PersonDetail] 加载人物 ${personId} 的照片...`)
    const result = await (window as any).photoAPI.people.getPhotos({ personId })

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
   照片区域
   ================================ */
.photos-section {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  box-shadow: var(--shadow-md);
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
}
</style>
