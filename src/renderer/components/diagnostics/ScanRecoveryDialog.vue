/**
 * ScanRecoveryDialog - 扫描恢复决策弹窗
 * E-10.4: 智能诊断与自愈提示 (AC-2)
 *
 * 注意: 此组件需要 E-10.3 (数据库持久化) 完成后才能完全使用
 * 当前作为占位组件，展示恢复决策界面
 */
<template>
  <n-modal
    v-model:show="visible"
    preset="dialog"
    title="检测到未完成的扫描任务"
    :mask-closable="false"
    :closable="false"
    class="recovery-dialog"
  >
    <template #icon>
      <n-icon color="#ffc107" :size="24">
        <Warning24Regular />
      </n-icon>
    </template>

    <div class="recovery-content">
      <p class="recovery-message">
        上次扫描还有 <strong>{{ remainingCount }}</strong> 张照片未完成，是否继续？
      </p>

      <div class="progress-info">
        <n-progress
          type="line"
          :percentage="progressPercent"
          :indicator-placement="'inside'"
          :height="20"
          :border-radius="4"
          color="#0071E3"
        />
        <p class="progress-detail">
          已完成 {{ completedCount }}/{{ totalCount }} 张
        </p>
      </div>

      <n-alert
        v-if="isTaskStalled"
        type="warning"
        :show-icon="true"
        class="stalled-alert"
      >
        检测到任务已停滞超过5分钟，建议重新开始。
      </n-alert>
    </div>

    <template #action>
      <n-space justify="end">
        <n-button @click="handleRestart">
          重新开始
        </n-button>
        <n-button
          type="primary"
          :disabled="isTaskStalled"
          @click="handleContinue"
        >
          继续扫描
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { Warning24Regular } from '@vicons/fluent'

interface Props {
  visible: boolean
  totalCount: number
  completedCount: number
  isTaskStalled?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  continue: []
  restart: []
}>()

const remainingCount = computed(() => Math.max(0, props.totalCount - props.completedCount))

const progressPercent = computed(() => {
  if (props.totalCount === 0) return 0
  return Math.round((props.completedCount / props.totalCount) * 100)
})

function handleContinue() {
  emit('continue')
  emit('update:visible', false)
}

function handleRestart() {
  emit('restart')
  emit('update:visible', false)
}
</script>

<script lang="ts">
import { computed } from 'vue'
</script>

<style scoped>
.recovery-dialog :deep(.n-dialog__title) {
  display: flex;
  align-items: center;
  gap: 8px;
}

.recovery-content {
  padding: 8px 0;
}

.recovery-message {
  font-size: 14px;
  line-height: 1.5;
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.recovery-message strong {
  color: #0071E3;
  font-weight: 600;
}

.progress-info {
  margin-bottom: 16px;
}

.progress-detail {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 8px 0 0 0;
  text-align: right;
}

.stalled-alert {
  margin-top: 12px;
}
</style>
