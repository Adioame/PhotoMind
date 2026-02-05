<script setup lang="ts">
/**
 * PhotoMind - Album Share Dialog Component
 *
 * Allows users to share/export albums in various formats
 */
import { ref, computed, reactive, watch } from 'vue'
import { useMessage } from 'naive-ui'
import {
  CheckmarkCircle24Regular,
  ErrorCircle24Regular,
  Settings24Regular,
  ChevronUp24Regular
} from '@vicons/fluent'
import type { Album, ShareOptions, ExportProgress } from '@/stores/albumStore'

const props = defineProps<{
  show: boolean
  album: Album | null
  progress: ExportProgress
  isExporting: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'export', type: 'zip' | 'html' | 'pdf', options: ShareOptions): void
  (e: 'copy'): void
  (e: 'close'): void
}>()

// Safe message usage - won't throw in test environment
let message: ReturnType<typeof useMessage> | null = null
try {
  message = useMessage()
} catch (e) {
  // Message provider not available - this is fine for tests
}

// Local state
const selectedType = ref<'zip' | 'html' | 'pdf' | 'clipboard'>('zip')
const showOptions = ref(false)

// Options form
const options = reactive<ShareOptions>({
  quality: 'original',
  sortBy: 'date',
  includeExif: false,
  watermark: false
})

// Computed
const canExport = computed(() => !props.isExporting)
const progressPercentage = computed(() => props.progress.percentage)
const isComplete = computed(() => props.progress.status === 'completed')
const isError = computed(() => props.progress.status === 'error')

// Methods
const close = () => {
  if (!props.isExporting) {
    emit('update:show', false)
    emit('close')
  }
}

const toggleOptions = () => {
  showOptions.value = !showOptions.value
}

const handleExport = () => {
  emit('export', selectedType.value, { ...options })
}

const handleCopy = () => {
  emit('copy')
}

const handleSelectType = (type: 'zip' | 'html' | 'pdf' | 'clipboard') => {
  selectedType.value = type
}

// Reset options when dialog opens
watch(() => props.show, (newVal) => {
  if (newVal) {
    options.quality = 'original'
    options.sortBy = 'date'
    options.includeExif = false
    options.watermark = false
    showOptions.value = false
  }
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    :title="album ? `分享相册: ${album.name}` : '分享相册'"
    style="width: 600px; max-width: 90vw;"
    :mask-closable="!isExporting"
    :closable="!isExporting"
    :close-on-escape="!isExporting"
    @close="close"
    @mask-click="close"
  >
    <!-- Progress State -->
    <div v-if="isExporting || isComplete || isError" class="progress-container">
      <div v-if="isComplete" class="progress-complete">
        <n-icon size="64" color="#52c41a">
          <CheckmarkCircle24Regular />
        </n-icon>
        <p>导出完成！</p>
        <p class="export-path" v-if="progress.message">
          {{ progress.message }}
        </p>
      </div>

      <div v-else-if="isError" class="progress-error">
        <n-icon size="64" color="#ff4d4f">
          <ErrorCircle24Regular />
        </n-icon>
        <p>导出失败</p>
        <p class="error-message">{{ progress.message }}</p>
      </div>

      <div v-else class="progress-exporting">
        <n-spin size="large" />
        <p>{{ progress.message || '正在导出...' }}</p>
        <n-progress
          type="line"
          :percentage="progressPercentage"
          :show-indicator="true"
          :height="8"
        />
        <p class="progress-detail">
          {{ progress.current }} / {{ progress.total }} 张照片
        </p>
      </div>
    </div>

    <!-- Export Type Selection -->
    <div v-else class="share-content">
      <!-- Type Selection -->
      <div class="type-section">
        <h4>选择分享方式</h4>
        <div class="type-grid">
          <div
            class="type-item"
            :class="{ selected: selectedType === 'zip' }"
            @click="handleSelectType('zip')"
          >
            <div class="type-icon">💾</div>
            <span class="type-name">ZIP</span>
            <span class="type-desc">导出到本地</span>
          </div>

          <div
            class="type-item"
            :class="{ selected: selectedType === 'html' }"
            @click="handleSelectType('html')"
          >
            <div class="type-icon">🌐</div>
            <span class="type-name">HTML</span>
            <span class="type-desc">生成网页</span>
          </div>

          <div
            class="type-item"
            :class="{ selected: selectedType === 'pdf' }"
            @click="handleSelectType('pdf')"
          >
            <div class="type-icon">📄</div>
            <span class="type-name">PDF</span>
            <span class="type-desc">照片书</span>
          </div>

          <div
            class="type-item"
            :class="{ selected: selectedType === 'clipboard' }"
            @click="handleSelectType('clipboard')"
          >
            <div class="type-icon">📋</div>
            <span class="type-name">链接</span>
            <span class="type-desc">复制到剪贴板</span>
          </div>
        </div>
      </div>

      <!-- Options Toggle -->
      <div class="options-toggle">
        <n-button text type="primary" @click="toggleOptions">
          <template #icon>
            <n-icon>
              <Settings24Regular v-if="!showOptions" />
              <ChevronUp24Regular v-else />
            </n-icon>
          </template>
          {{ showOptions ? '收起选项' : '展开选项' }}
        </n-button>
      </div>

      <!-- Options Panel -->
      <div v-if="showOptions" class="options-panel">
        <n-form label-placement="left" label-width="120">
          <n-form-item label="导出质量">
            <n-radio-group v-model:value="options.quality">
              <n-radio value="original">原图</n-radio>
              <n-radio value="compressed">压缩</n-radio>
            </n-radio-group>
          </n-form-item>

          <n-form-item label="照片排序">
            <n-radio-group v-model:value="options.sortBy">
              <n-radio value="date">按时间</n-radio>
              <n-radio value="name">按名称</n-radio>
            </n-radio-group>
          </n-form-item>

          <n-form-item>
            <n-checkbox v-model:checked="options.includeExif">
              包含 EXIF 信息
            </n-checkbox>
          </n-form-item>

          <n-form-item>
            <n-checkbox v-model:checked="options.watermark">
              添加水印
            </n-checkbox>
          </n-form-item>
        </n-form>
      </div>

      <!-- Album Info -->
      <div class="album-info" v-if="album">
        <n-descriptions :column="1" size="small">
          <n-descriptions-item label="照片数量">
            {{ album.photoCount }} 张
          </n-descriptions-item>
          <n-descriptions-item label="类型">
            {{ album.type === 'smart' ? '智能相册' : '普通相册' }}
          </n-descriptions-item>
        </n-descriptions>
      </div>
    </div>

    <!-- Footer -->
    <template #footer>
      <n-space v-if="isExporting || isComplete || isError" justify="end">
        <n-button @click="close">关闭</n-button>
        <n-button v-if="isComplete" type="primary" @click="close">
          完成
        </n-button>
        <n-button v-if="isError" type="primary" @click="close">
          重试
        </n-button>
      </n-space>
      <n-space v-else justify="space-between">
        <n-button
          type="primary"
          quaternary
          :loading="isExporting"
          @click="handleCopy"
        >
          复制照片链接
        </n-button>
        <n-space justify="end">
          <n-button @click="close">取消</n-button>
          <n-button
            type="primary"
            :disabled="!canExport"
            :loading="isExporting"
            @click="handleExport"
          >
            开始导出
          </n-button>
        </n-space>
      </n-space>
    </template>
  </n-modal>
</template>

<style scoped>
.share-content {
  padding: 8px 0;
}

.type-section h4 {
  margin: 0 0 16px;
  font-size: 14px;
  color: #666;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.type-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 8px;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.type-item:hover {
  border-color: #5E6AD2;
  background: #f5f5f7;
}

.type-item.selected {
  border-color: #5E6AD2;
  background: rgba(94, 106, 210, 0.1);
}

.type-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.type-name {
  font-weight: 600;
  font-size: 14px;
  color: #333;
  margin-bottom: 4px;
}

.type-desc {
  font-size: 11px;
  color: #999;
}

.options-toggle {
  text-align: center;
  margin-bottom: 16px;
}

.options-panel {
  background: #f5f5f7;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.album-info {
  background: #f5f5f7;
  border-radius: 8px;
  padding: 12px 16px;
}

.progress-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.progress-complete,
.progress-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.export-path {
  color: #666;
  font-size: 14px;
  margin-top: 8px;
}

.error-message {
  color: #ff4d4f;
  font-size: 14px;
  margin-top: 8px;
}

.progress-exporting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.progress-exporting p {
  margin: 0;
}

.progress-detail {
  font-size: 12px;
  color: #999;
}

@media (max-width: 540px) {
  .type-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
