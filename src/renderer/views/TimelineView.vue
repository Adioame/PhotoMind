/**
 * PhotoMind - 时间线视图
 */
<template>
  <div class="timeline-container">
    <!-- 头部 -->
    <header class="header">
      <div class="header-left">
        <h1>时间线</h1>
        <p class="subtitle">按时间回顾美好回忆</p>
      </div>
      <div class="header-right">
        <n-space>
          <n-date-picker
            v-model:value="selectedYearTs"
            type="year"
            placeholder="选择年份"
            clearable
            style="width: 150px;"
            @update:value="handleYearChange"
          />
          <!-- 视图切换 -->
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
      </div>
    </header>

    <!-- 年份选择器 -->
    <div class="year-tabs" v-if="years.length > 0">
      <n-tabs v-model:value="activeYear" type="card" @update:value="loadYearPhotos">
        <n-tab :name="year" v-for="year in years" :key="year">
          {{ year }} 年
        </n-tab>
      </n-tabs>
    </div>

    <!-- 内容区域 -->
    <div class="timeline-content" v-if="!loading">
      <!-- 时间线视图 -->
      <template v-if="viewMode === 'timeline'">
        <template v-if="groupedPhotos.length > 0">
          <!-- 月份分组 -->
          <div
            v-for="group in groupedPhotos"
            :key="group.month"
            class="month-group"
          >
            <div class="month-header">
              <h2>{{ group.monthName }}</h2>
              <span class="photo-count">{{ group.photoCount }} 张照片</span>
            </div>

            <!-- 日分组 -->
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
        <template v-else>
          <div class="empty-state">
            <n-empty :description="loading ? '加载中...' : '该年份暂无照片'" />
          </div>
        </template>
      </template>

      <!-- 网格视图 -->
      <template v-else>
        <template v-if="flattenedPhotos.length > 0">
          <PhotoGrid
            :photos="flattenedPhotos"
            :columns="6"
            @photo-click="openPhoto"
          />
        </template>
        <template v-else>
          <div class="empty-state">
            <n-empty :description="loading ? '加载中...' : '该年份暂无照片'" />
          </div>
        </template>
      </template>
    </div>

    <!-- 加载状态 -->
    <div class="loading-state" v-else>
      <n-spin size="large" />
      <p>加载中...</p>
    </div>

    <!-- 照片预览 -->
    <n-modal v-model:show="showPreview" preset="card" style="width: 90%; max-width: 900px;">
      <template #header>
        <span>照片详情</span>
      </template>
      <div class="photo-preview" v-if="selectedPhoto">
        <div class="preview-image">
          <n-image
            :src="selectedPhoto.thumbnailPath || selectedPhoto.thumbnail_url"
            :preview-src="selectedPhoto.thumbnailPath || selectedPhoto.thumbnail_url"
            object-fit="contain"
            style="width: 100%; max-height: 500px;"
          />
        </div>
        <div class="preview-info">
          <n-descriptions :column="1" label-placement="left">
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
import { useTimelineStore, type TimelinePhoto } from '@/stores/timelineStore'

const props = defineProps<{
  year?: number
}>()

const message = useMessage()
const store = useTimelineStore()

// Local state (sync with store)
const loading = computed(() => store.loading)
const activeYear = ref(store.currentYear)
const selectedYearTs = ref<number | null>(null)
const showPreview = ref(false)
const selectedPhoto = ref<TimelinePhoto | null>(null)
const viewMode = computed({
  get: () => store.viewMode,
  set: (val) => store.setViewMode(val)
})

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
  // Group current year photos by month and day
  const photos = store.flattenedPhotos.filter(p => {
    const photoYear = new Date(p.takenAt).getFullYear()
    return photoYear === activeYear.value
  })
  return store.groupByMonth(photos)
})

const flattenedPhotos = computed(() => {
  // Filter photos by current year for grid view
  return store.flattenedPhotos.filter(p => {
    const photoYear = new Date(p.takenAt).getFullYear()
    return photoYear === activeYear.value
  })
})

// Methods
const setViewMode = (mode: 'timeline' | 'grid') => {
  store.setViewMode(mode)
}

const getMonthName = (month: number) => {
  const names = ['一月', '二月', '三月', '四月', '五月', '六月',
                 '七月', '八月', '九月', '十月', '十一月', '十二月']
  return names[month - 1]
}

const handleYearChange = (timestamp: number | null) => {
  if (timestamp) {
    const date = new Date(timestamp)
    activeYear.value = date.getFullYear()
  }
  loadYearPhotos()
}

const loadYearPhotos = async () => {
  const photos = await store.loadYearPhotos(activeYear.value)
  // Photos are stored in store and filtered by computed properties
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
.timeline-container {
  min-height: 100vh;
  background: #f5f5f7;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header h1 {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.subtitle {
  color: #666;
  margin: 4px 0 0;
}

.year-tabs {
  margin-bottom: 24px;
}

.month-group {
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.month-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eee;
}

.month-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0;
}

.photo-count {
  color: #999;
  font-size: 14px;
}

.day-section {
  margin-bottom: 16px;
}

.day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.day-number {
  font-size: 14px;
  font-weight: 500;
  color: #666;
}

.day-count {
  font-size: 12px;
  color: #999;
}

.empty-state,
.loading-state {
  text-align: center;
  padding: 64px 0;
  color: #666;
}

.photo-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-image {
  text-align: center;
  background: #f5f5f7;
  border-radius: 8px;
  overflow: hidden;
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    gap: 16px;
  }
}
</style>
