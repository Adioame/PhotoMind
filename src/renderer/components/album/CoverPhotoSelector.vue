<script setup lang="ts">
/**
 * PhotoMind - Cover Photo Selector Component
 *
 * Allows users to select a cover photo for their album
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { CheckmarkCircle24Regular } from '@vicons/fluent'
import type { Album, AlbumPhoto } from '@/stores/albumStore'

const props = defineProps<{
  show: boolean
  album: Album | null
  photos: AlbumPhoto[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'select', photoId: number): void
}>()

// Safe message usage - won't throw in test environment
let message: ReturnType<typeof useMessage> | null = null
try {
  message = useMessage()
} catch (e) {
  // Message provider not available - this is fine for tests
}

// Local state
const selectedPhotoId = ref<number | null>(null)
const localLoading = ref(false)
const localPhotos = ref<AlbumPhoto[]>([])

// Computed
const hasPhotos = computed(() => localPhotos.value.length > 0)
const selectedPhoto = computed(() =>
  localPhotos.value.find(p => p.id === selectedPhotoId.value)
)

// Methods
const close = () => {
  emit('update:show', false)
}

const handleSelect = async () => {
  if (selectedPhotoId.value === null) {
    message.warning('请选择一张照片作为封面')
    return
  }

  emit('select', selectedPhotoId.value)
}

const handlePhotoClick = (photo: AlbumPhoto) => {
  selectedPhotoId.value = photo.id
}

const handlePreview = (photo: AlbumPhoto) => {
  // Could open a larger preview modal
  message.info(`预览: ${photo.fileName}`)
}

// Watch for props changes
watch(() => props.show, (newVal) => {
  if (newVal) {
    // Reset state when dialog opens
    selectedPhotoId.value = props.album?.coverPhotoId || null
    localPhotos.value = props.photos || []
  }
})

watch(() => props.photos, (newPhotos) => {
  localPhotos.value = newPhotos || []
})

// Initialize
onMounted(() => {
  selectedPhotoId.value = props.album?.coverPhotoId || null
  localPhotos.value = props.photos || []
})
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="选择封面照片"
    style="width: 800px; max-width: 90vw;"
    :mask-closable="true"
    :closable="true"
    @close="close"
    @mask-click="close"
  >
    <template #header-extra>
      <n-button
        type="primary"
        :disabled="selectedPhotoId === null"
        :loading="loading || localLoading"
        @click="handleSelect"
      >
        设为封面
      </n-button>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="loading-container">
      <n-spin size="large" />
      <p>加载照片中...</p>
    </div>

    <!-- Photos Grid -->
    <div v-else-if="hasPhotos" class="photos-container">
      <div class="photos-grid">
        <div
          v-for="photo in localPhotos"
          :key="photo.id"
          class="photo-item"
          :class="{ selected: selectedPhotoId === photo.id }"
          @click="handlePhotoClick(photo)"
        >
          <div class="photo-wrapper">
            <n-image
              :src="photo.thumbnailPath"
              :alt="photo.fileName"
              object-fit="cover"
              style="width: 100%; height: 100%;"
              preview-disabled
            />
            <div class="photo-overlay">
              <div v-if="selectedPhotoId === photo.id" class="check-icon">
                <n-icon size="24" color="#fff">
                  <CheckmarkCircle24Regular />
                </n-icon>
              </div>
            </div>
          </div>
          <div class="photo-date" v-if="photo.takenAt">
            {{ new Date(photo.takenAt).toLocaleDateString() }}
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <n-empty v-else description="该相册暂无照片" />

    <!-- Footer -->
    <template #footer>
      <div class="modal-footer">
        <n-space justify="space-between" align="center">
          <span v-if="selectedPhoto" class="selected-info">
            已选择: {{ selectedPhoto.fileName }}
          </span>
          <n-space justify="end">
            <n-button @click="close">取消</n-button>
            <n-button
              type="primary"
              :disabled="selectedPhotoId === null"
              :loading="loading || localLoading"
              @click="handleSelect"
            >
              设为封面
            </n-button>
          </n-space>
        </n-space>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: #999;
}

.loading-container p {
  margin-top: 16px;
}

.photos-container {
  max-height: 60vh;
  overflow-y: auto;
}

.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  padding: 8px;
}

.photo-item {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
  border: 2px solid transparent;
  position: relative;
}

.photo-item:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.photo-item.selected {
  border-color: #5E6AD2;
}

.photo-wrapper {
  aspect-ratio: 1;
  position: relative;
  background: #f5f5f5;
}

.photo-overlay {
  position: absolute;
  inset: 0;
  background: rgba(94, 106, 210, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.photo-item.selected .photo-overlay {
  opacity: 1;
}

.check-icon {
  background: #5E6AD2;
  border-radius: 50%;
  padding: 8px;
}

.photo-date {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: white;
  font-size: 11px;
  text-align: center;
}

.modal-footer {
  padding-top: 16px;
  border-top: 1px solid #eee;
}

.selected-info {
  color: #666;
  font-size: 14px;
}
</style>
