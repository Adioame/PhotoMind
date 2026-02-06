<!--
  PhotoMind Empty State Component
  情感化空状态组件 - 反AI味设计

  使用场景：
  - 照片列表为空
  - 搜索结果为空
  - 相册为空
  - 人物照片为空
  - 网络错误/加载失败

  设计原则：
  1. 插图使用柔和的线条风格
  2. 文案友好、鼓励性
  3. 提供明确的下一步操作
-->
<template>
  <div class="empty-state" :class="[`empty-state--${type}`, { 'empty-state--compact': compact }]">
    <!-- 插图区域 -->
    <div class="empty-state__illustration">
      <slot name="illustration">
        <!-- 默认插图：照片 -->
        <svg v-if="type === 'photos'" viewBox="0 0 120 120" fill="none" class="illustration-svg">
          <rect x="20" y="30" width="80" height="60" rx="8" stroke="currentColor" stroke-width="2" opacity="0.3"/>
          <circle cx="45" cy="55" r="8" stroke="currentColor" stroke-width="2" opacity="0.4"/>
          <path d="M20 80L45 55L65 70L85 50L100 65V85C100 89.4183 96.4183 93 92 93H28C23.5817 93 20 89.4183 20 85V80Z" fill="currentColor" opacity="0.1"/>
          <path d="M20 80L45 55L65 70L85 50L100 65" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>
          <circle cx="95" cy="38" r="6" stroke="currentColor" stroke-width="2" opacity="0.3"/>
        </svg>

        <!-- 搜索插图 -->
        <svg v-else-if="type === 'search'" viewBox="0 0 120 120" fill="none" class="illustration-svg">
          <circle cx="55" cy="55" r="25" stroke="currentColor" stroke-width="2" opacity="0.3"/>
          <path d="M75 75L95 95" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.4"/>
          <circle cx="55" cy="55" r="18" stroke="currentColor" stroke-width="1.5" opacity="0.2" stroke-dasharray="4 4"/>
          <path d="M45 50H65M55 40V60" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.15"/>
        </svg>

        <!-- 相册插图 -->
        <svg v-else-if="type === 'albums'" viewBox="0 0 120 120" fill="none" class="illustration-svg">
          <rect x="25" y="35" width="50" height="40" rx="6" stroke="currentColor" stroke-width="2" opacity="0.3"/>
          <rect x="35" y="25" width="50" height="40" rx="6" stroke="currentColor" stroke-width="2" opacity="0.4"/>
          <rect x="45" y="45" width="50" height="40" rx="6" fill="currentColor" opacity="0.08" stroke="currentColor" stroke-width="2"/>
          <circle cx="65" cy="60" r="8" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
          <path d="M55 70L62 63L70 71L80 60" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>
        </svg>

        <!-- 人物插图 -->
        <svg v-else-if="type === 'people'" viewBox="0 0 120 120" fill="none" class="illustration-svg">
          <circle cx="60" cy="45" r="18" stroke="currentColor" stroke-width="2" opacity="0.3"/>
          <path d="M30 95C30 75 43 65 60 65C77 65 90 75 90 95" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
          <circle cx="52" cy="42" r="2" fill="currentColor" opacity="0.4"/>
          <circle cx="68" cy="42" r="2" fill="currentColor" opacity="0.4"/>
          <path d="M54 52C56 54 64 54 66 52" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>
          <circle cx="35" cy="55" r="10" stroke="currentColor" stroke-width="1.5" opacity="0.2"/>
          <circle cx="85" cy="55" r="10" stroke="currentColor" stroke-width="1.5" opacity="0.2"/>
        </svg>

        <!-- 时间线插图 -->
        <svg v-else-if="type === 'timeline'" viewBox="0 0 120 120" fill="none" class="illustration-svg">
          <circle cx="35" cy="35" r="8" stroke="currentColor" stroke-width="2" opacity="0.4"/>
          <circle cx="35" cy="60" r="8" stroke="currentColor" stroke-width="2" opacity="0.4"/>
          <circle cx="35" cy="85" r="8" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="2"/>
          <path d="M35 43V52" stroke="currentColor" stroke-width="2" opacity="0.2"/>
          <path d="M35 68V77" stroke="currentColor" stroke-width="2" opacity="0.2"/>
          <rect x="50" y="28" width="45" height="14" rx="4" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
          <rect x="50" y="53" width="35" height="14" rx="4" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
          <rect x="50" y="78" width="40" height="14" rx="4" fill="currentColor" opacity="0.08" stroke="currentColor" stroke-width="1.5"/>
        </svg>

        <!-- 错误插图 -->
        <svg v-else-if="type === 'error'" viewBox="0 0 120 120" fill="none" class="illustration-svg">
          <circle cx="60" cy="60" r="35" stroke="currentColor" stroke-width="2" opacity="0.2"/>
          <circle cx="50" cy="52" r="4" fill="currentColor" opacity="0.4"/>
          <circle cx="70" cy="52" r="4" fill="currentColor" opacity="0.4"/>
          <path d="M48 75C52 70 68 70 72 75" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
          <path d="M42 38L78 82" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.15"/>
        </svg>

        <!-- 导入插图 -->
        <svg v-else-if="type === 'import'" viewBox="0 0 120 120" fill="none" class="illustration-svg">
          <rect x="30" y="25" width="60" height="70" rx="8" stroke="currentColor" stroke-width="2" opacity="0.3"/>
          <path d="M45 55L60 70L85 45" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>
          <path d="M50 85H70" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
          <circle cx="85" cy="30" r="12" fill="var(--primary-default)" opacity="0.9"/>
          <path d="M81 30H89M85 26V34" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>

        <!-- 通用插图 -->
        <svg v-else viewBox="0 0 120 120" fill="none" class="illustration-svg">
          <rect x="30" y="30" width="60" height="60" rx="12" stroke="currentColor" stroke-width="2" opacity="0.3"/>
          <circle cx="60" cy="60" r="15" stroke="currentColor" stroke-width="2" opacity="0.2" stroke-dasharray="4 4"/>
          <circle cx="60" cy="60" r="8" fill="currentColor" opacity="0.1"/>
        </svg>
      </slot>
    </div>

    <!-- 标题 -->
    <h3 class="empty-state__title">
      <slot name="title">{{ defaultTitle }}</slot>
    </h3>

    <!-- 描述 -->
    <p class="empty-state__description">
      <slot name="description">{{ defaultDescription }}</slot>
    </p>

    <!-- 操作按钮区域 -->
    <div v-if="$slots.actions || primaryAction || secondaryAction" class="empty-state__actions">
      <slot name="actions">
        <n-button
          v-if="primaryAction"
          type="primary"
          size="large"
          @click="handlePrimaryAction"
        >
          <template #icon v-if="primaryAction.icon">
            <n-icon :component="primaryAction.icon" />
          </template>
          {{ primaryAction.label }}
        </n-button>
        <n-button
          v-if="secondaryAction"
          text
          size="large"
          @click="handleSecondaryAction"
        >
          {{ secondaryAction.label }}
        </n-button>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NIcon } from 'naive-ui'
import type { Component } from 'vue'

interface Action {
  label: string
  icon?: Component
  onClick?: () => void
}

interface Props {
  type?: 'photos' | 'search' | 'albums' | 'people' | 'timeline' | 'error' | 'import' | 'default'
  compact?: boolean
  primaryAction?: Action
  secondaryAction?: Action
}

const props = withDefaults(defineProps<Props>(), {
  type: 'default',
  compact: false
})

// 默认文案配置
const defaultTitles: Record<string, string> = {
  photos: '还没有照片呢',
  search: '没有找到相关照片',
  albums: '还没有相册',
  people: '还没有识别人物',
  timeline: '时间线为空',
  error: '出错了',
  import: '开始导入照片',
  default: '这里空空如也'
}

const defaultDescriptions: Record<string, string> = {
  photos: '点击下方的导入按钮，开始整理你的美好回忆吧～',
  search: '换个关键词试试，或者检查一下拼写是否正确',
  albums: '创建相册可以更好地整理和分享你的照片',
  people: '导入照片后，我们会自动识别照片中的人物',
  timeline: '导入照片后，时间线会自动生成',
  error: '请检查网络连接或稍后重试',
  import: '选择本地文件夹或从 iCloud 同步，开始整理你的照片库',
  default: '暂时没有内容'
}

const defaultTitle = computed(() => defaultTitles[props.type])
const defaultDescription = computed(() => defaultDescriptions[props.type])

// 处理操作
const handlePrimaryAction = () => {
  props.primaryAction?.onClick?.()
}

const handleSecondaryAction = () => {
  props.secondaryAction?.onClick?.()
}
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl) var(--space-lg);
  text-align: center;
  color: var(--text-secondary);
}

.empty-state--compact {
  padding: var(--space-xl) var(--space-md);
}

/* 插图 */
.empty-state__illustration {
  margin-bottom: var(--space-lg);
  color: var(--primary-default);
}

.illustration-svg {
  width: 120px;
  height: 120px;
}

.empty-state--compact .illustration-svg {
  width: 80px;
  height: 80px;
}

/* 标题 */
.empty-state__title {
  margin: 0 0 var(--space-sm);
  font-size: var(--text-h2);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  line-height: var(--leading-snug);
}

.empty-state--compact .empty-state__title {
  font-size: var(--text-h3);
}

/* 描述 */
.empty-state__description {
  margin: 0 0 var(--space-lg);
  font-size: var(--text-body);
  color: var(--text-secondary);
  line-height: var(--leading-relaxed);
  max-width: 360px;
}

.empty-state--compact .empty-state__description {
  font-size: var(--text-small);
  margin-bottom: var(--space-md);
}

/* 操作按钮 */
.empty-state__actions {
  display: flex;
  gap: var(--space-md);
  align-items: center;
}

/* 特定类型样式 */
.empty-state--error {
  color: var(--error);
}

.empty-state--error .empty-state__title {
  color: var(--error);
}

.empty-state--import .empty-state__illustration {
  animation: gentle-pulse 3s ease-in-out infinite;
}

@keyframes gentle-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.02);
    opacity: 0.9;
  }
}

/* 响应式 */
@media (max-width: 640px) {
  .empty-state {
    padding: var(--space-2xl) var(--space-md);
  }

  .illustration-svg {
    width: 100px;
    height: 100px;
  }

  .empty-state__title {
    font-size: var(--text-h3);
  }

  .empty-state__description {
    font-size: var(--text-small);
  }
}
</style>
