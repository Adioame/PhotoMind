/**
 * PhotoMind - 时间线视图
 * 反AI味 · 现代极简主义设计
 */
<template>
  <div class="timeline-container">
    <!-- 页面头部 -->
    <header class="page-header">
      <div class="header-content">
        <h1>时间线</h1>
        <p class="subtitle">按时间回顾美好回忆</p>
      </div>
      <n-space>
        <n-date-picker
          v-model:value="selectedYearTs"
          type="year"
          placeholder="选择年份"
          clearable
          style="width: 140px;"
          @update:value="handleYearChange"
        />
        <n-button-group>
          <n-button
            :type="viewMode === 'timeline' ? 'primary' : 'default'"
            @click="setViewMode('timeline')"
          >
            <template #icon>
              <n-icon><CalendarToday24Regular /></n-icon>
            </template>
            时间线
          </n-button>
          <n-button
            :type="viewMode === 'grid' ? 'primary' : 'default'"
            @click="setViewMode('grid')"
          >
            <template #icon>
              <n-icon><Grid24Regular /></n-icon>
            </template>
            网格
          </n-button>
        </n-button-group>
      </n-space>
    </header>

    <!-- 年份选择器 -->
    <div class="year-tabs" v-if="years.length > 0">
      <n-scrollbar x-scrollable>
        <div class="year-list">
          <button
            v-for="year in years"
            :key="year"
            class="year-btn"
            :class="{ active: activeYear === year }"
            @click="loadYearPhotos(year)"
          >
            {{ year }}
          </button>
        </div>
      </n-scrollbar>
    </div>

    <!-- 内容区域 -->
    <div class="timeline-content" v-if="!loading">
      <!-- 时间线视图 -->
      <template v-if="viewMode === 'timeline'">
        <template v-if="groupedPhotos.length > 0">
          <div
            v-for="group in groupedPhotos"
            :key="group.month"
            class="month-group"
          >
            <div class="month-header">
              <h2>{{ group.monthName }}</h2>
              <span class="photo-count">{{ group.photoCount }} 张照片</span>
            </div>

            <div
              v-for="day in group.days"
              :key="day.date"
              class="day-section"
            >
              <div class="day-header">
                <span class="day-number">{{ day.day }} 日</span>
                <span class="day-count">{{ day.photos.length }} 张</span>
              </div>
              <PhotoGrid
                :photos="day.photos"
                :columns="4"
                @photo-click="openPhoto"
              />
            </div>
          </div>
        </template>

        <!-- 空状态 -->
        <EmptyState
          v-else
          type="timeline"
          description="该年份暂无照片"
          hint="导入照片后，它们会按时间自动整理"
        />
      </template>

      <!-- 网格视图 -->
      <template v-else>
        <template v-if="flattenedPhotos.length > 0">
          <PhotoGrid
            :photos="flattenedPhotos"
            :columns="5"
            @photo-click="openPhoto"
          />
        </template>

        <EmptyState
          v-else
          type="timeline"
          description="该年份暂无照片"
          hint="导入照片后，它们会按时间自动整理"
        />
      </template>
    </div>

    <!-- 加载状态 -->
    <div class="loading-state" v-else>
      <n-spin size="large" />
      <p>加载中...</p>
    </div>

    <!-- 照片预览 -->
    <n-modal
      v-model:show="showPreview"
      preset="card"
      class="preview-modal"
      :bordered="false"
    >
      <template #header>
        <span>照片详情</span>
      </template>
      <div class="photo-preview" v-if="selectedPhoto">
        <div class="preview-image">
          <n-image
            :src="getPhotoUrl(selectedPhoto)"
            :preview-src="getPhotoUrl(selectedPhoto)"
            object-fit="contain"
          />
        </div>
        <div class="preview-info">
          <n-descriptions :column="1" label-placement="left" class="photo-meta">
            <n-descriptions-item label="文件名">
              {{ selectedPhoto.fileName }}
            </n-descriptions-item>
            <n-descriptions-item label="拍摄时间">
              {{ formatDateTime(selectedPhoto.takenAt) }}
            </n-descriptions-item>
            <n-descriptions-item label="地点" v-if="selectedPhoto.location?.name">
              {{ selectedPhoto.location.name }}
            </n-descriptions-item>
          </n-descriptions>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { CalendarToday24Regular, Grid24Regular } from '@vicons/fluent'
import { useMessage } from 'naive-ui'
import PhotoGrid from '../components/PhotoGrid.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useTimelineStore, type TimelinePhoto } from '@/stores/timelineStore'
import { toLocalResourceProtocol } from '@/utils/localResource'

const props = defineProps<{
  year?: number
}>()

const message = useMessage()
const store = useTimelineStore()

// Local state
const loading = computed(() => store.loading)
const activeYear = ref(store.currentYear)
const selectedYearTs = ref<number | null>(null)
const showPreview = ref(false)
const selectedPhoto = ref<TimelinePhoto | null>(null)
const viewMode = computed({
  get: () => store.viewMode,
  set: (val) => store.setViewMode(val)
})

// 获取照片 URL
const getPhotoUrl = (photo: any) => {
  const path = photo.thumbnailPath || photo.thumbnail_url || photo.filePath
  if (path && (path.startsWith('/') || /^[a-z]:/i.test(path))) {
    return toLocalResourceProtocol(path)
  }
  return path || ''
}

// Computed
const years = computed(() => {
  const currentYear = new Date().getFullYear()
  const result = []
  for (let y = currentYear; y >= 2015; y--) {
    result.push(y)
  }
  return result
})

const groupedPhotos = computed(() => {
  const photos = store.flattenedPhotos.filter(p => {
    const photoYear = new Date(p.takenAt).getFullYear()
    return photoYear === activeYear.value
  })
  return store.groupByMonth(photos)
})

const flattenedPhotos = computed(() => {
  return store.flattenedPhotos.filter(p => {
    const photoYear = new Date(p.takenAt).getFullYear()
    return photoYear === activeYear.value
  })
})

// Methods
const setViewMode = (mode: 'timeline' | 'grid') => {
  store.setViewMode(mode)
}

const handleYearChange = (timestamp: number | null) => {
  if (timestamp) {
    const date = new Date(timestamp)
    activeYear.value = date.getFullYear()
  }
  loadYearPhotos()
}

const loadYearPhotos = async (year?: number) => {
  if (year) {
    activeYear.value = year
    selectedYearTs.value = new Date(year, 0, 1).getTime()
  }
  await store.loadYearPhotos(activeYear.value)
}

const openPhoto = (photo: TimelinePhoto) => {
  selectedPhoto.value = photo
  showPreview.value = true
}

const formatDateTime = (dateStr?: string): string => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// Watch for route changes
watch(() => props.year, (newYear) => {
  if (newYear) {
    activeYear.value = newYear
    selectedYearTs.value = new Date(newYear, 0, 1).getTime()
    loadYearPhotos()
  }
}, { immediate: true })

// Initialize
onMounted(() => {
  if (props.year) {
    activeYear.value = props.year
    selectedYearTs.value = new Date(props.year, 0, 1).getTime()
  }
  loadYearPhotos()
})
</script>

<style scoped>
/* ================================
   容器
   ================================ */
.timeline-container {
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
   年份选择器
   ================================ */
.year-tabs {
  margin-bottom: var(--space-xl);
}

.year-list {
  display: flex;
  gap: var(--space-sm);
  padding-bottom: var(--space-sm);
}

.year-btn {
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border-default);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--text-body);
  color: var(--text-secondary);
  transition: all var(--duration-fast) var(--ease-default);
  white-space: nowrap;
}

.year-btn:hover {
  border-color: var(--primary-default);
  color: var(--primary-default);
}

.year-btn.active {
  background: var(--primary-default);
  border-color: var(--primary-default);
  color: white;
}

/* ================================
   月份分组
   ================================ */
.month-group {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  box-shadow: var(--shadow-md);
}

.month-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--border-light);
}

.month-header h2 {
  font-size: var(--text-h2);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0;
}

.photo-count {
  color: var(--text-tertiary);
  font-size: var(--text-small);
}

/* ================================
   日期分组
   ================================ */
.day-section {
  margin-bottom: var(--space-lg);
}

.day-section:last-child {
  margin-bottom: 0;
}

.day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm) 0;
  margin-bottom: var(--space-md);
}

.day-number {
  font-size: var(--text-body);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
}

.day-count {
  font-size: var(--text-small);
  color: var(--text-tertiary);
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
   预览模态框
   ================================ */
.preview-modal {
  width: 90%;
  max-width: 900px;
}

.photo-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.preview-image {
  text-align: center;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  overflow: hidden;
  max-height: 500px;
}

.preview-image :deep(img) {
  max-width: 100%;
  max-height: 500px;
  object-fit: contain;
}

.preview-info {
  padding: var(--space-md) 0;
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

  .month-group {
    padding: var(--space-md);
  }

  .month-header h2 {
    font-size: var(--text-h3);
  }
}
</style>
