/**
 * PhotoMind - AlbumShareDialog Component Tests
 *
 * Tests for album sharing functionality
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import AlbumShareDialog from '@/components/album/AlbumShareDialog.vue'
import type { Album, ExportProgress } from '@/stores/albumStore'

describe('AlbumShareDialog Component', () => {
  let wrapper: VueWrapper

  const mockAlbum: Album = {
    id: 1,
    name: 'Beach Vacation',
    type: 'manual',
    photoCount: 25
  }

  const createWrapper = (options: any = {}) => {
    return mount(AlbumShareDialog, {
      props: {
        show: true,
        album: mockAlbum,
        progress: {
          current: 0,
          total: 0,
          percentage: 0,
          status: 'idle' as const,
          message: ''
        },
        isExporting: false,
        ...options
      },
      global: {
        stubs: {
          NModal: {
            props: ['show', 'preset', 'title', 'style', 'maskClosable', 'closable', 'closeOnEscape'],
            emits: ['close', 'maskClick', 'update:show'],
            template: `
              <div class="n-modal-mock" :class="{ 'n-modal-show': show }">
                <div class="n-modal-header">{{ title }}</div>
                <div class="n-modal-content"><slot></slot></div>
                <div class="n-modal-footer"><slot name="footer"></slot></div>
              </div>
            `
          },
          NButton: {
            props: ['type', 'text', 'quaternary', 'size', 'disabled', 'loading'],
            emits: ['click'],
            template: `<button class="n-btn" :class="type" :disabled="disabled" :quaternary="quaternary" @click="$emit('click')"><slot></slot></button>`
          },
          NButtonGroup: {
            template: `<div class="n-btn-group"><slot></slot></div>`
          },
          NIcon: {
            props: ['size', 'color'],
            template: `<span class="n-icon-mock"><slot></slot></span>`
          },
          NProgress: {
            props: ['type', 'percentage', 'showIndicator', 'height'],
            template: `<div class="n-progress" :class="type" :style="{ height: height + 'px' }"></div>`
          },
          NRadioGroup: {
            props: ['value'],
            emits: ['update:value'],
            template: `<div class="n-radio-group"><slot></slot></div>`
          },
          NRadio: {
            props: ['value'],
            template: `<span class="n-radio"><slot></slot></span>`
          },
          NCheckbox: {
            props: ['checked'],
            emits: ['update:checked'],
            template: `<span class="n-checkbox" :class="{ checked: checked }"><slot></slot></span>`
          },
          NForm: {
            props: ['model', 'rules', 'labelPlacement'],
            template: `<div class="n-form"><slot></slot></div>`
          },
          NFormItem: {
            props: ['label', 'labelPlacement'],
            template: `<div class="n-form-item"><span class="n-form-item-label">{{ label }}</span><slot></slot></div>`
          },
          NSpace: {
            props: ['justify', 'align'],
            template: `<div class="n-space" :class="['justify-' + justify, 'align-' + align]"><slot></slot></div>`
          },
          NDescriptions: {
            props: ['column', 'size'],
            template: `<div class="n-descriptions"><slot></slot></div>`
          },
          NDescriptionsItem: {
            props: ['label'],
            template: `<div class="n-descriptions-item"><span class="label">{{ label }}</span><slot></slot></div>`
          }
        }
      }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.restoreAllMocks()
  })

  describe('Component Properties', () => {
    it('should have correct props', () => {
      const wrapper = createWrapper()
      expect(wrapper.props().show).toBe(true)
      expect(wrapper.props().album).toEqual(mockAlbum)
      expect(wrapper.props().isExporting).toBe(false)
    })

    it('should display album name in title', () => {
      const wrapper = createWrapper()
      expect(wrapper.text()).toContain('Beach Vacation')
    })
  })

  describe('Selected Type State', () => {
    it('should have selectedType ref', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any
      expect(vm.selectedType).toBe('zip')
    })

    it('should update selectedType', async () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.selectedType = 'html'
      expect(vm.selectedType).toBe('html')

      vm.selectedType = 'pdf'
      expect(vm.selectedType).toBe('pdf')
    })
  })

  describe('Options State', () => {
    it('should have options ref', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any
      expect(vm.options).toEqual({
        quality: 'original',
        sortBy: 'date',
        includeExif: false,
        watermark: false
      })
    })

    it('should update options', async () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.options.quality = 'compressed'
      expect(vm.options.quality).toBe('compressed')

      vm.options.includeExif = true
      expect(vm.options.includeExif).toBe(true)
    })
  })

  describe('Computed Properties', () => {
    it('should have canExport computed', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any
      expect(vm.canExport).toBe(true)
    })

    it('should return false when isExporting', () => {
      const wrapper = createWrapper({ isExporting: true })
      const vm = wrapper.vm as any
      expect(vm.canExport).toBe(false)
    })
  })

  describe('Methods', () => {
    it('should have close method', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any
      expect(typeof vm.close).toBe('function')
    })

    it('should have toggleOptions method', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any
      expect(typeof vm.toggleOptions).toBe('function')
    })

    it('should have handleExport method', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any
      expect(typeof vm.handleExport).toBe('function')
    })

    it('should have handleCopy method', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any
      expect(typeof vm.handleCopy).toBe('function')
    })

    it('should have handleSelectType method', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any
      expect(typeof vm.handleSelectType).toBe('function')
    })

    it('close should emit update:show false when not exporting', () => {
      const wrapper = createWrapper({ isExporting: false })
      const vm = wrapper.vm as any

      vm.close()

      expect(wrapper.emitted('update:show')).toBeTruthy()
      expect(wrapper.emitted('update:show')[0]).toEqual([false])
    })

    it('toggleOptions should flip showOptions', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      expect(vm.showOptions).toBe(false)

      vm.toggleOptions()
      expect(vm.showOptions).toBe(true)

      vm.toggleOptions()
      expect(vm.showOptions).toBe(false)
    })

    it('handleSelectType should update selectedType', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.handleSelectType('html')
      expect(vm.selectedType).toBe('html')

      vm.handleSelectType('pdf')
      expect(vm.selectedType).toBe('pdf')
    })

    it('handleExport should emit export event', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.handleExport()

      expect(wrapper.emitted('export')).toBeTruthy()
      expect(wrapper.emitted('export')[0]).toContain('zip')
    })

    it('handleCopy should emit copy event', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.handleCopy()

      expect(wrapper.emitted('copy')).toBeTruthy()
    })
  })

  describe('Watchers', () => {
    it('should reset options when dialog opens', async () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.options.quality = 'compressed'
      vm.options.includeExif = true
      vm.showOptions = true

      await wrapper.setProps({ show: false })
      await wrapper.setProps({ show: true })

      expect(vm.options.quality).toBe('original')
      expect(vm.options.includeExif).toBe(false)
      expect(vm.showOptions).toBe(false)
    })
  })

  describe('Exposed Methods', () => {
    it('should expose required methods', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      expect(typeof vm.close).toBe('function')
      expect(typeof vm.toggleOptions).toBe('function')
      expect(typeof vm.handleExport).toBe('function')
      expect(typeof vm.handleCopy).toBe('function')
      expect(typeof vm.handleSelectType).toBe('function')
    })
  })
})
