# Story E-06.2: 时间线视图

## Story Overview

**原始需求描述**:
作为用户，我希望能够按照时间线浏览我的照片，按照年/月/日层级展示，让回忆更加有序。

**描述**:
实现时间线浏览功能，支持按年、月、日分组显示照片，提供时间导航和快速跳转功能。

## Acceptance Criteria

### 功能性需求
- [ ] 按年/月/日层级展示照片
- [ ] 时间导航器（年份选择器）
- [ ] 平滑滚动浏览
- [ ] 显示时间分组标题
- [ ] 支持跳转到特定日期
- [ ] 显示日期统计（每年/每月/每日照片数）
- [ ] 支持视图切换（时间线/网格）
- [ ] 显示时间线缩略图概览

### 非功能性需求
- [ ] 支持 100,000+ 照片
- [ ] 滚动流畅无卡顿
- [ ] 懒加载照片

## Implementation Steps

### Phase 1: 时间线 Store

**文件**: `src/renderer/stores/timelineStore.ts`

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface TimelineGroup {
  year: number
  months: TimelineMonth[]
  photoCount: number
}

export interface TimelineMonth {
  year: number
  month: number
  monthName: string
  days: TimelineDay[]
  photoCount: number
}

export interface TimelineDay {
  year: number
  month: number
  day: number
  date: string
  photos: TimelinePhoto[]
  photoCount: number
}

export interface TimelinePhoto {
  id: number
  uuid: string
  thumbnailPath: string
  takenAt: string
}

export const useTimelineStore = defineStore('timeline', () => {
  const groups = ref<TimelineGroup[]>([])
  const loading = ref(false)
  const currentYear = ref(new Date().getFullYear())
  const expandedYears = ref<number[]>([])
  const selectedDate = ref<Date | null>(null)

  const totalPhotos = computed(() =>
    groups.value.reduce((sum, g) => sum + g.photoCount, 0)
  )

  const yearList = computed(() =>
    groups.value.map(g => ({
      year: g.year,
      photoCount: g.photoCount
    }))
  )

  async function loadTimeline() {
    loading.value = true
    try {
      // TODO: Implement API call
      const response = await (window as any).photoAPI.photos.getTimeline()
      groups.value = response.groups
    } finally {
      loading.value = false
    }
  }

  function toggleYear(year: number) {
    const index = expandedYears.value.indexOf(year)
    if (index >= 0) {
      expandedYears.value.splice(index, 1)
    } else {
      expandedYears.value.push(year)
    }
  }

  function isYearExpanded(year: number): boolean {
    return expandedYears.value.includes(year)
  }

  function jumpToYear(year: number) {
    currentYear.value = year
    if (!isYearExpanded(year)) {
      toggleYear(year)
    }
    // Scroll to year section
  }

  return {
    groups,
    loading,
    currentYear,
    expandedYears,
    selectedDate,
    totalPhotos,
    yearList,
    loadTimeline,
    toggleYear,
    isYearExpanded,
    jumpToYear
  }
})
```

### Phase 2: 时间线组件

**文件**: `src/renderer/views/TimelineView.vue`

```vue
<template>
  <div class="timeline-container">
    <!-- 年份导航 -->
    <div class="year-navigator">
      <button
        v-for="year in yearList"
        :key="year.year"
        :class="{ active: currentYear === year.year }"
        @click="jumpToYear(year.year)"
      >
        {{ year.year }}
        <span class="count">{{ year.photoCount }}</span>
      </button>
    </div>

    <!-- 时间线内容 -->
    <div class="timeline-content">
      <div
        v-for="group in groups"
        :key="group.year"
        class="year-section"
        :class="{ expanded: isYearExpanded(group.year) }"
      >
        <!-- 年份标题 -->
        <div class="year-header" @click="toggleYear(group.year)">
          <h2>{{ group.year }}</h2>
          <span class="photo-count">{{ group.photoCount }} 张照片</span>
        </div>

        <!-- 月份列表 -->
        <div v-if="isYearExpanded(group.year)" class="months-container">
          <div
            v-for="month in group.months"
            :key="`${group.year}-${month.month}`"
            class="month-section"
          >
            <div class="month-header">
              <h3>{{ month.monthName }}</h3>
              <span>{{ month.photoCount }} 张</span>
            </div>

            <!-- 照片网格 -->
            <div class="photos-grid">
              <div
                v-for="day in month.days"
                :key="day.date"
                class="day-section"
              >
                <div class="day-header">{{ day.day }} 日</div>
                <div class="day-photos">
                  <img
                    v-for="photo in day.photos.slice(0, 4)"
                    :key="photo.id"
                    :src="photo.thumbnailPath"
                    loading="lazy"
                    @click="$emit('photo-click', photo)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
```

## 相关文件

- `src/renderer/stores/timelineStore.ts`
- `src/renderer/views/TimelineView.vue`
- `electron/services/timelineService.ts`

## 测试用例

```typescript
describe('TimelineStore', () => {
  it('should group photos by year and month', async () => {
    const store = useTimelineStore()
    await store.loadTimeline()

    expect(store.groups.length).toBeGreaterThan(0)
    expect(store.groups[0].months.length).toBe(12)
  })

  it('should toggle year expansion', () => {
    const store = useTimelineStore()
    const year = 2024

    expect(store.isYearExpanded(year)).toBe(false)
    store.toggleYear(year)
    expect(store.isYearExpanded(year)).toBe(true)
  })
})
```
