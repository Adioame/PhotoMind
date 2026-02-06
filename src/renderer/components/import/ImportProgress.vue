<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useImportStore, type ImportProgress } from '@/stores/importStore'
import { NProgress, NButton, NIcon, NAlert, NSpin } from 'naive-ui'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'cancel'): void
}>()

const store = useImportStore()
const showErrors = ref(false)
const animateCurrentFile = ref(true)

// 格式化文件名
const formatFileName = (path: string): string => {
  if (!path) return ''
  const parts = path.split('/')
  return parts[parts.length - 1]
}

// 格式化时间
const formatTime = (seconds: number | undefined): string => {
  if (!seconds) return ''
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}分${secs}秒`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}小时${mins}分`
}

// 进度百分比
const progressPercent = computed(() => {
  if (!store.progress || store.progress.total === 0) return 0
  return Math.round((store.progress.currentIndex / store.progress.total) * 100)
})

// 阶段列表
const stages = [
  { key: 'preparing', label: '准备' },
  { key: 'importing', label: '导入' },
  { key: 'metadata', label: '元数据' },
  { key: 'thumbnails', label: '缩略图' },
  { key: 'complete', label: '完成' }
]

// 检查阶段是否完成
const isStageCompleted = (stageKey: string): boolean => {
  const stageOrder = ['preparing', 'importing', 'metadata', 'thumbnails', 'complete']
  const currentIndex = stageOrder.indexOf(store.progress?.stage || '')
  const stageIndex = stageOrder.indexOf(stageKey)
  return stageIndex < currentIndex || store.progress?.stage === stageKey
}

// 检查阶段是否激活
const isStageActive = (stageKey: string): boolean => {
  return store.progress?.stage === stageKey
}

// 关闭对话框
const handleClose = () => {
  if (!store.isImporting) {
    emit('update:visible', false)
    store.close()
  }
}

// 取消导入
const handleCancel = () => {
  emit('cancel')
}

// 监听可见性变化
watch(() => props.visible, (val) => {
  if (!val) {
    store.close()
  }
})
</script>

<template>
  <NModal
    :show="visible"
    preset="card"
    title="导入照片"
    style="width: 500px; max-width: 90vw"
    :bordered="false"
    :mask-closable="!store.isImporting"
    @close="handleClose"
  >
    <div class="import-progress-content">
      <!-- 阶段指示器 -->
      <div class="stage-indicator" v-if="store.progress">
        <div
          v-for="(stage, index) in stages"
          :key="stage.key"
          class="stage-item"
          :class="{
            completed: isStageCompleted(stage.key),
            active: isStageActive(stage.key)
          }"
        >
          <div class="stage-dot">
            <span v-if="isStageCompleted(stage.key) && stage.key !== 'complete'" class="check">✓</span>
            <span v-else-if="isStageCompleted(stage.key) && stage.key === 'complete'" class="complete-dot">✓</span>
            <span v-else class="stage-number">{{ index + 1 }}</span>
          </div>
          <span class="stage-label">{{ stage.label }}</span>
        </div>
      </div>

      <!-- 进度信息 -->
      <div class="progress-info" v-if="store.progress">
        <!-- 当前文件 -->
        <div class="current-file" v-if="store.progress.currentFile">
          <div class="file-icon">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </div>
          <div class="file-name">
            <span class="name-text" :class="{ animating: animateCurrentFile }">
              {{ formatFileName(store.progress.currentFile) }}
            </span>
          </div>
        </div>

        <!-- 统计信息 -->
        <div class="stats-row">
          <div class="stat-item success">
            <span class="stat-value">{{ store.progress.imported }}</span>
            <span class="stat-label">已导入</span>
          </div>
          <div class="stat-item" v-if="store.progress.skipped > 0">
            <span class="stat-value warning">{{ store.progress.skipped }}</span>
            <span class="stat-label">已跳过</span>
          </div>
          <div class="stat-item" v-if="store.progress.failed > 0">
            <span class="stat-value error">{{ store.progress.failed }}</span>
            <span class="stat-label">失败</span>
          </div>
        </div>

        <!-- 时间估计 -->
        <div class="time-estimate" v-if="store.progress.estimatedTimeRemaining && store.isImporting">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
          </svg>
          <span>预计剩余时间: {{ formatTime(store.progress.estimatedTimeRemaining) }}</span>
        </div>
      </div>

      <!-- 进度条 -->
      <div class="progress-section">
        <div class="progress-bar-container">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :class="{ success: store.isComplete }"
              :style="{ width: progressPercent + '%' }"
            ></div>
          </div>
          <span class="progress-text">{{ progressPercent }}%</span>
        </div>
        <div class="progress-detail">
          {{ store.progress?.currentIndex || 0 }} / {{ store.progress?.total || 0 }} 张照片
        </div>
      </div>

      <!-- 错误列表 -->
      <div class="errors-section" v-if="store.progress?.errors?.length">
        <div class="errors-header" @click="showErrors = !showErrors">
          <span>{{ store.progress.errors.length }} 个错误</span>
          <svg :class="{ rotated: showErrors }" viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M7 10l5 5 5-5z"/>
          </svg>
        </div>
        <div class="errors-list" v-if="showErrors">
          <div
            v-for="(error, index) in store.progress.errors"
            :key="index"
            class="error-item"
          >
            <span class="error-file">{{ formatFileName(error.file) }}</span>
            <span class="error-message">{{ error.error }}</span>
          </div>
        </div>
      </div>

      <!-- 加载状态 -->
      <div class="loading-state" v-if="!store.progress">
        <NSpin size="small" />
          <span>正在准备导入...</span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <template #footer>
      <div class="dialog-footer">
        <NButton
          v-if="store.isImporting"
          type="error"
          ghost
          @click="handleCancel"
        >
          取消导入
        </NButton>
        <NButton
          v-else
          type="primary"
          @click="handleClose"
        >
          {{ store.progress?.failed ? '关闭' : '完成' }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.import-progress-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 阶段指示器 */
.stage-indicator {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
}

.stage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: 0.5;
  transition: opacity 0.3s;
}

.stage-item.completed,
.stage-item.active {
  opacity: 1;
}

.stage-item.active .stage-dot {
  background: #18a058;
  color: white;
}

.stage-item.completed .stage-dot {
  background: #18a058;
  color: white;
}

.stage-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.3s;
}

.check,
.complete-dot {
  font-size: 14px;
}

.stage-number {
  font-weight: 600;
}

.stage-label {
  font-size: 11px;
  color: #666;
}

/* 进度信息 */
.progress-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.current-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f5f5f7;
  border-radius: 8px;
}

.file-icon {
  color: #5E6AD2;
}

.file-name {
  flex: 1;
  overflow: hidden;
}

.name-text {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
}

.name-text.animating {
  animation: marquee 8s linear infinite;
}

@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-100%); }
}

.stats-row {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px;
  background: #f5f5f7;
  border-radius: 8px;
  min-width: 70px;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.stat-value.success {
  color: #18a058;
}

.stat-value.warning {
  color: #f0a020;
}

.stat-value.error {
  color: #d03050;
}

.stat-label {
  font-size: 11px;
  color: #888;
  margin-top: 2px;
}

.time-estimate {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #666;
  padding: 6px 0;
}

/* 进度条 */
.progress-section {
  padding: 12px 0;
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #5E6AD2;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-fill.success {
  background: #18a058;
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  min-width: 45px;
  text-align: right;
}

.progress-detail {
  text-align: center;
  font-size: 12px;
  color: #888;
  margin-top: 6px;
}

/* 错误列表 */
.errors-section {
  border-top: 1px solid #eee;
  padding-top: 12px;
}

.errors-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 8px 0;
  font-size: 13px;
  color: #d03050;
}

.errors-header svg {
  transition: transform 0.3s;
}

.errors-header svg.rotated {
  transform: rotate(180deg);
}

.errors-list {
  max-height: 150px;
  overflow-y: auto;
}

.error-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  background: #fff1f0;
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 12px;
}

.error-file {
  color: #333;
  font-weight: 500;
}

.error-message {
  color: #d03050;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  color: #666;
  font-size: 13px;
}

/* 底部按钮 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
