/**
 * PhotoMind - Timeline Store
 *
 * Manages timeline view state including:
 * - Photo grouping by year/month/day
 * - Timeline navigation
 * - Date filtering
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface TimelinePhoto {
  id: number
  uuid: string
  fileName: string
  thumbnailPath?: string
  takenAt: string
  location?: {
    name?: string
    latitude?: number
    longitude?: number
  }
}

export interface TimelineDay {
  year: number
  month: number
  day: number
  date: string
  photos: TimelinePhoto[]
  photoCount: number
}

export interface TimelineMonth {
  year: number
  month: number
  monthName: string
  days: TimelineDay[]
  photoCount: number
}

export interface TimelineGroup {
  year: number
  months: TimelineMonth[]
  photoCount: number
}

export const useTimelineStore = defineStore('timeline', () => {
  // State
  const groups = ref<TimelineGroup[]>([])
  const loading = ref(false)
  const currentYear = ref(new Date().getFullYear())
  const expandedYears = ref<number[]>([])
  const selectedDate = ref<Date | null>(null)
  const viewMode = ref<'timeline' | 'grid'>('timeline')

  // Getters
  const totalPhotos = computed(() =>
    groups.value.reduce((sum, g) => sum + g.photoCount, 0)
  )

  const yearList = computed(() =>
    groups.value.map(g => ({
      year: g.year,
      photoCount: g.photoCount
    }))
  )

  const flattenedPhotos = computed(() => {
    const photos: TimelinePhoto[] = []
    for (const group of groups.value) {
      for (const month of group.months) {
        for (const day of month.days) {
          photos.push(...day.photos)
        }
      }
    }
    return photos
  })

  // Actions
  async function loadTimeline(): Promise<void> {
    loading.value = true
    try {
      const response = await (window as any).photoAPI?.timeline?.getTimeline?.()
      if (response?.groups) {
        groups.value = response.groups
      } else {
        // Fallback to empty if no API
        groups.value = []
      }
    } catch (error) {
      console.error('Failed to load timeline:', error)
      groups.value = []
    } finally {
      loading.value = false
    }
  }

  async function loadYearPhotos(year: number): Promise<TimelinePhoto[]> {
    loading.value = true
    try {
      const response = await (window as any).photoAPI?.timeline?.getYear?.(year)
      return response || []
    } catch (error) {
      console.error('Failed to load year photos:', error)
      return []
    } finally {
      loading.value = false
    }
  }

  function toggleYear(year: number): void {
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

  function jumpToYear(year: number): void {
    currentYear.value = year
    if (!isYearExpanded(year)) {
      toggleYear(year)
    }
  }

  function setViewMode(mode: 'timeline' | 'grid'): void {
    viewMode.value = mode
  }

  function selectDate(date: Date): void {
    selectedDate.value = date
  }

  function groupPhotosByDay(photos: TimelinePhoto[]): TimelineDay[] {
    const dayMap = new Map<string, TimelineDay>()

    for (const photo of photos) {
      const date = new Date(photo.takenAt)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const day = date.getDate()
      const dateKey = `${year}-${month}-${day}`

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          year,
          month,
          day,
          date: dateKey,
          photos: [],
          photoCount: 0
        })
      }

      const timelineDay = dayMap.get(dateKey)!
      timelineDay.photos.push(photo)
      timelineDay.photoCount = timelineDay.photos.length
    }

    // Sort days by date descending
    return Array.from(dayMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }

  function groupByMonth(photos: TimelinePhoto[]): TimelineMonth[] {
    const monthMap = new Map<number, TimelineMonth>()
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月',
                        '七月', '八月', '九月', '十月', '十一月', '十二月']

    for (const photo of photos) {
      const date = new Date(photo.takenAt)
      const year = date.getFullYear()
      const month = date.getMonth() + 1

      if (!monthMap.has(month)) {
        monthMap.set(month, {
          year,
          month,
          monthName: monthNames[month - 1],
          days: [],
          photoCount: 0
        })
      }

      const timelineMonth = monthMap.get(month)!
      const days = groupPhotosByDay(photos.filter(p => {
        const d = new Date(p.takenAt)
        return d.getFullYear() === year && d.getMonth() + 1 === month
      }))
      timelineMonth.days = days
      timelineMonth.photoCount = days.reduce((sum, d) => sum + d.photoCount, 0)
    }

    return Array.from(monthMap.values()).sort((a, b) => b.month - a.month)
  }

  function groupByYear(photos: TimelinePhoto[]): TimelineGroup[] {
    const yearMap = new Map<number, TimelineGroup>()

    for (const photo of photos) {
      const year = new Date(photo.takenAt).getFullYear()

      if (!yearMap.has(year)) {
        yearMap.set(year, {
          year,
          months: [],
          photoCount: 0
        })
      }

      const yearGroup = yearMap.get(year)!
      const yearPhotos = photos.filter(p => new Date(p.takenAt).getFullYear() === year)
      yearGroup.months = groupByMonth(yearPhotos)
      yearGroup.photoCount = yearPhotos.length
    }

    return Array.from(yearMap.values()).sort((a, b) => b.year - a.year)
  }

  function reset(): void {
    groups.value = []
    currentYear.value = new Date().getFullYear()
    expandedYears.value = []
    selectedDate.value = null
  }

  return {
    // State
    groups,
    loading,
    currentYear,
    expandedYears,
    selectedDate,
    viewMode,
    // Getters
    totalPhotos,
    yearList,
    flattenedPhotos,
    // Actions
    loadTimeline,
    loadYearPhotos,
    toggleYear,
    isYearExpanded,
    jumpToYear,
    setViewMode,
    selectDate,
    groupPhotosByDay,
    groupByMonth,
    groupByYear,
    reset
  }
})
