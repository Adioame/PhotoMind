/**
 * PhotoMind - 人物视图
 * 反AI味 · 现代极简主义设计
 */
<template>
  <div class="people-container">
    <!-- 页面头部 -->
    <header class="page-header">
      <div class="header-content">
        <h1>人物</h1>
        <p class="subtitle">{{ peopleStore.people.length }} 位人物</p>
      </div>
      <n-space>
        <n-button type="primary" @click="handleAutoMatch" :loading="autoMatching">
          <template #icon>
            <n-icon><People24Regular /></n-icon>
          </template>
          自动识别
        </n-button>
        <n-button @click="handleScanFaces" :loading="scanning">
          <template #icon>
            <n-icon><Scan24Regular /></n-icon>
          </template>
          扫描人脸
        </n-button>
        <n-button quaternary circle @click="handleRefresh" :loading="peopleStore.loading">
          <template #icon>
            <n-icon><ArrowSync24Regular /></n-icon>
          </template>
        </n-button>
      </n-space>
    </header>

    <!-- 命名人脸对话框 -->
    <n-modal
      v-model:show="namingDialog.visible"
      preset="card"
      title="命名人脸"
      style="width: 400px"
      :mask-closable="false"
    >
      <div class="naming-dialog-content">
        <div class="face-preview">
          <img
            v-if="namingDialog.face?.thumbnailPath || namingDialog.face?.filePath"
            :src="`local-resource://${namingDialog.face?.thumbnailPath || namingDialog.face?.filePath}`"
            class="face-preview-img"
            alt="人脸"
          />
        </div>
        <n-input
          v-model:value="namingDialog.name"
          placeholder="输入人物名称"
          size="large"
          @keyup.enter="confirmNaming"
          ref="nameInputRef"
        />
        <p class="naming-hint">为这个人物起个名字，方便以后搜索</p>
      </div>
      <template #footer>
        <n-space justify="end">
          <n-button @click="namingDialog.visible = false">取消</n-button>
          <n-button type="primary" @click="confirmNaming" :loading="namingDialog.loading">
            确认
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 扫描进度条 -->
    <div v-if="showProgress" class="scan-progress-wrapper">
      <div class="scan-progress-card">
        <div class="progress-header">
          <span class="scan-status">{{ scanProgressData.status }}</span>
          <span class="scan-percent">{{ scanProgressData.percent }}%</span>
        </div>
        <n-progress
          type="line"
          :percentage="scanProgressData.percent"
          :show-indicator="false"
          :height="8"
          :border-radius="4"
          color="#FFFFFF"
          rail-color="rgba(255,255,255,0.3)"
        />
        <div class="progress-footer">
          <span class="scan-detail">{{ scanProgressData.current }}/{{ scanProgressData.total }} 张照片</span>
          <n-space>
            <n-button
              v-if="scanStage === 'processing'"
              size="small"
              quaternary
              text-color="rgba(255,255,255,0.8)"
              @click="cancelScan"
            >
              取消
            </n-button>
            <DiagnosticButton
              v-if="scanStage === 'processing' || scanStore.isStalled"
              :is-stalled="scanStore.isStalled"
              :is-diagnosing="scanStore.isDiagnosing"
              @diagnose="handleDiagnoseAndRestart"
            />
          </n-space>
        </div>
      </div>
    </div>

    <!-- 智能诊断气泡提示 -->
    <SmartBubble
      :message="scanStore.diagnosticMessage?.text || ''"
      :type="scanStore.diagnosticMessage?.type || 'info'"
      :visible="scanStore.diagnosticMessage?.visible || false"
      @close="scanStore.dismissDiagnostic()"
    />

    <!-- 人物列表 -->
    <section class="people-section">
      <!-- 加载状态 -->
      <div v-if="peopleStore.loading && peopleStore.people.length === 0" class="loading-state">
        <n-spin size="large" />
        <p>加载人物数据...</p>
      </div>

      <!-- 已识别人物 -->
      <div v-else-if="peopleStore.people.length > 0" class="people-grid">
        <div
          v-for="person in peopleStore.people"
          :key="person.id"
          class="person-card"
          @click="goToPersonDetail(person)"
        >
          <div class="person-avatar-wrapper">
            <n-avatar
              round
              :size="72"
              :style="{ backgroundColor: getAvatarColor(person.name) }"
            >
              {{ getInitials(person.name) }}
            </n-avatar>
          </div>
          <div class="person-info">
            <h3>{{ person.display_name || person.name }}</h3>
            <p class="photo-count">{{ person.face_count }} 张照片</p>
          </div>
        </div>
      </div>

      <!-- 未命名人物 -->
      <div v-else-if="unnamedFaces.length > 0" class="unnamed-section">
        <div class="section-header">
          <h3>未命名人物 ({{ unnamedFaceCount }} 张人脸)</h3>
          <p class="section-hint">点击下方人脸进行识别，或使用"自动识别"按钮批量处理</p>
        </div>
        <div class="people-grid">
          <div
            v-for="face in unnamedFaces.slice(0, 20)"
            :key="face.id"
            class="person-card unnamed"
            @click="openNamingDialog(face)"
          >
            <div class="person-avatar-wrapper">
              <img
                v-if="face.thumbnailPath || face.filePath"
                :src="`local-resource://${face.thumbnailPath || face.filePath}`"
                class="face-thumbnail"
                alt="人脸"
              />
              <n-avatar v-else round :size="72">?</n-avatar>
            </div>
            <div class="person-info">
              <h3>未命名</h3>
              <p class="photo-count">待识别</p>
            </div>
          </div>
        </div>
        <div v-if="unnamedFaces.length >= 20" class="more-faces">
          <n-button type="primary" @click="handleAutoMatch" :loading="autoMatching">
            还有 {{ unnamedFaceCount - 20 }} 张人脸，点击自动识别
          </n-button>
        </div>
      </div>

      <!-- 空状态 -->
      <EmptyState
        v-else
        type="people"
        :primary-action="{
          label: '扫描人脸',
          onClick: handleScanFaces
        }"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowSync24Regular, Scan24Regular, People24Regular } from '@vicons/fluent'
import { useMessage } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { usePeopleStore, type Person } from '@/stores/peopleStore'
import { useScanStore } from '@/stores/scanStore'
import EmptyState from '@/components/EmptyState.vue'
import SmartBubble from '@/components/diagnostics/SmartBubble.vue'
import DiagnosticButton from '@/components/diagnostics/DiagnosticButton.vue'

const router = useRouter()
const message = useMessage()
const peopleStore = usePeopleStore()
const scanStore = useScanStore()

// 从 scanStore 解构响应式状态
const { state: scanState, stage: scanStage, progress: scanProgressData, showProgress, isScanning } = storeToRefs(scanStore)

const scanning = ref(false)
const autoMatching = ref(false)
const nameInputRef = ref<HTMLInputElement | null>(null)

// 未命名人脸
const unnamedFaces = ref<any[]>([])
const unnamedFaceCount = ref(0)

// 命名人脸对话框状态
const namingDialog = reactive({
  visible: false,
  face: null as any,
  name: '',
  loading: false
})

// 加载未命名人脸
const loadUnnamedFaces = async () => {
  try {
    const result = await (window as any).photoAPI?.face?.getUnnamedFaces?.(50)
    if (result) {
      unnamedFaces.value = result.faces || []
      unnamedFaceCount.value = result.count || 0
    }
  } catch (error) {
    console.error('[PeopleView] 加载未命名人脸失败:', error)
  }
}

// 取消扫描 - 调用 store action
const cancelScan = () => {
  scanStore.cancelScan()
  scanning.value = false
  message.info('已取消扫描')
}

// 诊断并重启
const handleDiagnoseAndRestart = async () => {
  message.info('开始诊断扫描任务...')
  await scanStore.diagnoseAndRestart()
  scanning.value = false
}

// 诊断队列状态
const diagnoseQueue = async () => {
  try {
    const status = await (window as any).photoAPI?.face?.getQueueStatus?.()
    message.info(`队列状态: isRunning=${status?.isRunning}, pending=${status?.pending}`)
    if (status?.isRunning && status?.pending > 0) {
      message.warning('检测到队列卡住，尝试重置...')
      const resetResult = await (window as any).photoAPI?.face?.resetQueue?.()
      message.success('队列已重置，请重新点击"扫描所有人脸"')
    }
  } catch (error) {
    message.error('诊断失败')
  }
}

// 头像颜色 - 更新为新的配色方案
const avatarColors = [
  '#0071E3', '#34C759', '#FF9500', '#FF3B30',
  '#AF52DE', '#5856D6', '#FF2D55', '#5AC8FA',
  '#FFCC00', '#8E8E93', '#C7C7CC', '#007AFF'
]

function getAvatarColor(name: string): string {
  const index = name.charCodeAt(0) % avatarColors.length
  return avatarColors[index]
}

function getInitials(name: string): string {
  return name.charAt(0).toUpperCase()
}

// 跳转到人物详情页
const goToPersonDetail = (person: Person) => {
  router.push(`/people/${person.id}`)
}

// 刷新人物列表
const handleRefresh = async () => {
  await peopleStore.fetchPeople()
  message.success('人物已刷新')
}

// 扫描所有照片进行人脸检测
const handleScanFaces = async () => {
  scanning.value = true
  scanStore.startScan()
  try {
    const result = await (window as any).photoAPI?.face?.scanAll?.()
    if (result?.success) {
      message.success(`已添加 ${result.count} 张照片到扫描队列`)
    } else if (result?.error) {
      message.error('扫描失败: ' + result.error)
      scanStore.resetScan()
    } else {
      message.error('扫描启动失败')
      scanStore.resetScan()
    }
  } catch (error: any) {
    message.error('扫描失败: ' + (error?.message || error))
    scanStore.resetScan()
  } finally {
    scanning.value = false
  }
}

// 自动识别人物
const handleAutoMatch = async () => {
  autoMatching.value = true
  try {
    const result = await (window as any).photoAPI?.faceMatching?.autoMatch?.()
    if (result?.personsCreated > 0) {
      message.success(`成功识别 ${result.matched} 张人脸，创建了 ${result.personsCreated} 位人物`)
      await peopleStore.fetchPeople()
    } else if (result?.warning) {
      message.warning(result.warning)
    } else {
      message.info('没有新的面孔需要识别')
    }
  } catch (error: any) {
    message.error('自动识别失败: ' + (error?.message || error))
  } finally {
    autoMatching.value = false
    await loadUnnamedFaces()
  }
}

// 打开命名人脸对话框
const openNamingDialog = (face: any) => {
  namingDialog.face = face
  namingDialog.name = ''
  namingDialog.visible = true
  namingDialog.loading = false

  // 自动聚焦输入框
  setTimeout(() => {
    nameInputRef.value?.focus()
  }, 100)
}

// 确认命名
const confirmNaming = async () => {
  if (!namingDialog.name.trim()) {
    message.error('请输入人物名称')
    return
  }

  namingDialog.loading = true
  try {
    // 创建新人物并分配人脸
    const result = await (window as any).photoAPI?.people?.add?.({
      name: namingDialog.name.trim(),
      displayName: namingDialog.name.trim()
    })

    if (result && result > 0) {
      // 分配人脸给新人物
      await (window as any).photoAPI?.faceMatching?.assign?.([namingDialog.face.id], result)

      message.success(`已创建人物 "${namingDialog.name.trim()}"`)
      namingDialog.visible = false

      // 刷新数据
      await peopleStore.fetchPeople()
      await loadUnnamedFaces()

      // 查找相似人脸提示合并
      await findSimilarFacesForMerge(namingDialog.face, namingDialog.name.trim(), result)
    } else {
      message.error('创建人物失败')
    }
  } catch (error: any) {
    message.error('命名失败: ' + (error?.message || error))
  } finally {
    namingDialog.loading = false
  }
}

// 查找相似人脸提示合并
const findSimilarFacesForMerge = async (anchorFace: any, personName: string, personId: number) => {
  try {
    const similar = await (window as any).photoAPI?.faceMatching?.findSimilar?.(anchorFace.id)
    if (similar && similar.length > 0) {
      // 过滤出相似度 > 0.4 且未命名的人脸
      const candidates = similar.filter((s: any) => s.similarity > 0.4)
      if (candidates.length > 0) {
        // 提示用户是否合并
        const merge = await new Promise<boolean>((resolve) => {
          // 使用对话框询问用户
          const d = (window as any).$dialog?.warning({
            title: '发现相似人脸',
            content: `找到 ${candidates.length} 张可能也是 "${personName}" 的人脸，是否合并？`,
            positiveText: '合并',
            negativeText: '跳过',
            onPositiveClick: () => resolve(true),
            onNegativeClick: () => resolve(false),
            onClose: () => resolve(false)
          })
          // 如果没有 $dialog，自动 resolve false
          if (!d) {
            resolve(false)
          }
        })

        if (merge) {
          const faceIds = candidates.map((c: any) => c.faceId)
          await (window as any).photoAPI?.faceMatching?.assign?.(faceIds, personId)
          message.success(`已合并 ${faceIds.length} 张人脸`)
          await loadUnnamedFaces()
        }
      }
    }
  } catch (error) {
    console.error('[PeopleView] 查找相似人脸失败:', error)
  }
}

// 监听扫描完成状态
watch(() => scanState.value, async (newState, oldState) => {
  if (newState === 'completed' && oldState === 'scanning') {
    message.success('扫描完成')
    await peopleStore.fetchPeople()
    setTimeout(async () => {
      await handleAutoMatch()
      await loadUnnamedFaces()
    }, 500)
  } else if (newState === 'failed') {
    scanning.value = false
    message.error('扫描失败: ' + (scanStore.error || '未知错误'))
  }
})

// 初始化
onMounted(() => {
  console.log('[PeopleView] ========== 组件挂载开始 ==========')
  console.log('[PeopleView] peopleStore:', peopleStore)
  console.log('[PeopleView] scanStore:', scanStore)

  try {
    peopleStore.fetchPeople()
    console.log('[PeopleView] fetchPeople() 已调用')
  } catch (e) {
    console.error('[PeopleView] fetchPeople() 失败:', e)
  }

  try {
    loadUnnamedFaces()
    console.log('[PeopleView] loadUnnamedFaces() 已调用')
  } catch (e) {
    console.error('[PeopleView] loadUnnamedFaces() 失败:', e)
  }

  // 确保扫描状态可见性正确
  try {
    scanStore.showProgressIfActive()
    console.log('[PeopleView] showProgressIfActive() 已调用')
  } catch (e) {
    console.error('[PeopleView] showProgressIfActive() 失败:', e)
  }

  console.log('[PeopleView] ========== 组件挂载完成 ==========')

  // 🆕 监听人物更新事件（聚类完成后自动刷新）
  const unsubscribePeopleUpdated = (window as any).photoAPI?.face?.onPeopleUpdated?.(() => {
    console.log('[PeopleView] 收到 people:updated 事件，刷新人物列表')
    peopleStore.fetchPeople()
    loadUnnamedFaces()
    message.success('人物识别完成！')
  })

  // 组件卸载时取消监听
  return () => {
    unsubscribePeopleUpdated?.()
  }
})
</script>

<style scoped>
/* ================================
   容器
   ================================ */
.people-container {
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
   扫描进度
   ================================ */
.scan-progress-wrapper {
  margin-bottom: var(--space-xl);
}

.scan-progress-card {
  background: linear-gradient(135deg, #0071E3 0%, #00C6FF 100%);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  color: white;
  box-shadow: var(--shadow-md);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.scan-status {
  font-weight: var(--font-medium);
  font-size: var(--text-body);
}

.scan-percent {
  font-weight: var(--font-semibold);
  opacity: 0.9;
}

.progress-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--space-sm);
}

.scan-detail {
  font-size: var(--text-small);
  opacity: 0.8;
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
   人物网格
   ================================ */
.people-section {
  margin-top: var(--space-lg);
}

.people-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-md);
}

/* ================================
   人物卡片
   ================================ */
.person-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  text-align: center;
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: transform var(--duration-normal) var(--ease-default),
              box-shadow var(--duration-normal) var(--ease-default);
}

.person-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-hover);
}

.person-avatar-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-md);
}

.person-info h3 {
  font-size: var(--text-body);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--space-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photo-count {
  color: var(--text-secondary);
  font-size: var(--text-small);
  margin: 0;
}

/* ================================
   未命名人脸
   ================================ */
.unnamed-section {
  margin-top: var(--space-2xl);
}

.section-header {
  margin-bottom: var(--space-lg);
}

.section-header h3 {
  font-size: var(--text-h3);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--space-xs);
}

.section-hint {
  color: var(--text-secondary);
  font-size: var(--text-small);
  margin: 0;
}

.person-card.unnamed {
  border: 2px dashed var(--border-default);
}

.person-card.unnamed:hover {
  border-color: var(--primary-default);
}

.face-thumbnail {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
}

.more-faces {
  text-align: center;
  margin-top: var(--space-xl);
}

/* ================================
   命名人脸对话框
   ================================ */
.naming-dialog-content {
  padding: var(--space-md) 0;
}

.face-preview {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-lg);
}

.face-preview-img {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: var(--shadow-md);
}

.naming-hint {
  color: var(--text-secondary);
  font-size: var(--text-small);
  margin: var(--space-sm) 0 0;
  text-align: center;
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

  .people-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 480px) {
  .people-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
