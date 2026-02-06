/**
 * SmartBubble - 智能诊断气泡提示组件
 * E-10.4: 智能诊断与自愈提示
 */
<template>
  <Transition name="bubble">
    <div
      v-if="visible"
      class="smart-bubble"
      :class="`type-${type}`"
      @click="handleClick"
    >
      <n-icon class="bubble-icon" :size="20">
        <component :is="iconComponent" />
      </n-icon>
      <span class="bubble-message">{{ message }}</span>
      <button class="bubble-close" @click.stop="handleClose">
        <n-icon :size="14"><Dismiss24Regular /></n-icon>
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  CheckmarkCircle24Regular,
  Warning24Regular,
  Info24Regular,
  Dismiss24Regular
} from '@vicons/fluent'

interface Props {
  message: string
  type: 'success' | 'warning' | 'info'
  visible: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  click: []
}>()

const iconComponent = computed(() => {
  switch (props.type) {
    case 'success':
      return CheckmarkCircle24Regular
    case 'warning':
      return Warning24Regular
    case 'info':
    default:
      return Info24Regular
  }
})

function handleClose() {
  emit('close')
}

function handleClick() {
  emit('click')
}
</script>

<style scoped>
.smart-bubble {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 280px;
  max-width: 400px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.smart-bubble:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

/* 成功类型 - 绿色 */
.type-success {
  background: #107c10;
  color: white;
}

/* 警告类型 - 黄色 */
.type-warning {
  background: #ffc107;
  color: #333;
}

.type-warning .bubble-close {
  color: #666;
}

.type-warning .bubble-close:hover {
  background: rgba(0, 0, 0, 0.1);
}

/* 信息类型 - 蓝色 */
.type-info {
  background: #0078d4;
  color: white;
}

.bubble-icon {
  flex-shrink: 0;
}

.bubble-message {
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
}

.bubble-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  border-radius: 4px;
  transition: opacity 0.2s, background 0.2s;
  flex-shrink: 0;
}

.bubble-close:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.2);
}

/* 过渡动画 */
.bubble-enter-active,
.bubble-leave-active {
  transition: all 0.2s ease;
}

.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* 响应式 */
@media (max-width: 480px) {
  .smart-bubble {
    left: 16px;
    right: 16px;
    bottom: 16px;
    min-width: auto;
    max-width: none;
  }
}
</style>
