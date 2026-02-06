/**
 * PhotoMind - ImportProgress Component Unit Tests
 *
 * Tests for Epic E-06: 导入功能增强
 * Stories: E-06.3 (导入进度可视化)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia, createPinia } from 'pinia'
import ImportProgress from '@/components/import/ImportProgress.vue'
import { useImportStore } from '@/stores/importStore'

describe('ImportProgress Component - Epic E-06', () => {
  let wrapper: VueWrapper
  let importStore: ReturnType<typeof useImportStore>
  let testPinia: any

  const createWrapper = (options = {}) => {
    testPinia = createTestingPinia({
      createSpy: vi.fn,
      stubActions: false
    })
    setActivePinia(testPinia)

    wrapper = mount(ImportProgress, {
      global: {
        plugins: [testPinia],
        stubs: {
          'NModal': {
            props: ['show', 'preset', 'title', 'style', 'bordered', 'mask-closable'],
            emits: ['update:visible', 'close'],
            template: '<div class="n-modal-stub" :style="{ display: show ? \'block\' : \'none\' }"><slot /><slot name="footer" /></div>'
          },
          'NButton': {
            props: ['type', 'ghost'],
            emits: ['click'],
            template: '<button class="n-button-stub" @click="$emit(\'click\')"><slot /></button>'
          },
          'NProgress': {
            props: ['percentage', 'showIndicator', 'bordered'],
            template: '<div class="n-progress-stub"></div>'
          },
          'NIcon': {
            template: '<span class="n-icon-stub"><slot /></span>'
          },
          'NAlert': {
            props: ['type', 'title', 'showIcon'],
            template: '<div class="n-alert-stub"><slot /></div>'
          },
          'NSpin': {
            props: ['size'],
            template: '<div class="n-spin-stub"></div>'
          }
        }
      },
      props: {
        visible: true,
        ...options
      },
      ...options
    })

    importStore = useImportStore()
    return wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    importStore = useImportStore()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.restoreAllMocks()
  })

  // ============================================
  // Story E-06.3: 导入进度可视化
  // ============================================
  describe('E-06.3: 导入进度可视化', () => {
    it('should render modal structure', () => {
      createWrapper({
        props: { visible: true }
      })

      expect(wrapper.find('.import-progress-content').exists()).toBe(true)
      expect(wrapper.find('.n-modal-stub').exists()).toBe(true)
    })

    it('should render loading state initially', () => {
      createWrapper({
        props: { visible: true }
      })

      expect(wrapper.find('.loading-state').exists()).toBe(true)
    })

    it('should render progress section structure', () => {
      createWrapper({
        props: { visible: true }
      })

      expect(wrapper.find('.progress-section').exists()).toBe(true)
    })

    it('should render dialog footer', () => {
      createWrapper({
        props: { visible: true }
      })

      expect(wrapper.find('.dialog-footer').exists()).toBe(true)
    })
  })

  // ============================================
  // Utility Functions Tests
  // ============================================
  describe('Utility Functions', () => {
    it('should format file name from path', () => {
      createWrapper({
        props: { visible: true }
      })

      expect(wrapper.vm.formatFileName('/Users/photos/vacation/image.jpg')).toBe('image.jpg')
    })

    it('should handle empty path', () => {
      createWrapper({
        props: { visible: true }
      })

      expect(wrapper.vm.formatFileName('')).toBe('')
    })

    it('should format time in seconds', () => {
      createWrapper({
        props: { visible: true }
      })

      expect(wrapper.vm.formatTime(30)).toBe('30秒')
    })

    it('should format time in minutes', () => {
      createWrapper({
        props: { visible: true }
      })

      expect(wrapper.vm.formatTime(90)).toBe('1分30秒')
    })

    it('should format time in hours', () => {
      createWrapper({
        props: { visible: true }
      })

      expect(wrapper.vm.formatTime(3660)).toBe('1小时1分')
    })

    it('should handle undefined time', () => {
      createWrapper({
        props: { visible: true }
      })

      expect(wrapper.vm.formatTime(undefined)).toBe('')
    })
  })

  // ============================================
  // Visibility Tests
  // ============================================
  describe('Visibility', () => {
    it('should handle visible prop changes', () => {
      createWrapper({
        props: { visible: false }
      })

      const modal = wrapper.find('.n-modal-stub')
      expect(modal.attributes('style')).toContain('display: none')
    })
  })

  // ============================================
  // Progress Percentage Tests
  // ============================================
  describe('Progress Percentage', () => {
    it('should calculate 0% for empty progress', () => {
      createWrapper({
        props: { visible: true }
      })

      expect(wrapper.vm.progressPercent).toBe(0)
    })
  })
})
