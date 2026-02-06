/**
 * DiagnosticButton - 诊断并重启按钮组件
 * E-10.4: 智能诊断与自愈提示
 */
<template>
  <n-button
    class="diagnostic-btn"
    :type="isStalled ? 'warning' : 'default'"
    :loading="isDiagnosing"
    :disabled="isDiagnosing"
    @click="handleDiagnose"
  >
    <template #icon>
      <n-icon v-if="!isDiagnosing">
        <Wrench24Regular />
      </n-icon>
    </template>
    {{ buttonText }}
  </n-button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Wrench24Regular } from '@vicons/fluent'

interface Props {
  isStalled: boolean
  isDiagnosing: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  diagnose: []
}>()

const buttonText = computed(() => {
  if (props.isDiagnosing) {
    return '诊断中...'
  }
  if (props.isStalled) {
    return '诊断并重启'
  }
  return '诊断'
})

function handleDiagnose() {
  emit('diagnose')
}
</script>

<style scoped>
.diagnostic-btn {
  /* 诊断按钮样式 */
}

/* 停滞状态下的脉冲动画 */
:deep(.n-button--warning-type) {
  animation: pulse-warning 2s infinite;
}

@keyframes pulse-warning {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 193, 7, 0.4);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(255, 193, 7, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 193, 7, 0);
  }
}
</style>
