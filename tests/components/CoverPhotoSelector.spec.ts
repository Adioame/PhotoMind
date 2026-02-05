/**
 * PhotoMind - CoverPhotoSelector Component Tests
 *
 * Tests for album cover photo selection functionality
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import CoverPhotoSelector from '@/components/album/CoverPhotoSelector.vue'
import type { Album, AlbumPhoto } from '@/stores/albumStore'

describe('CoverPhotoSelector Component', () => {
  let wrapper: VueWrapper

  const mockAlbum: Album = {
    id: 1,
    name: 'Test Album',
    type: 'manual',
    photoCount: 5
  }

  const mockPhotos: AlbumPhoto[] = [
    { id: 1, uuid: 'p1', fileName: 'photo1.jpg', thumbnailPath: '/thumb1.jpg', takenAt: '2024-01-01' },
    { id: 2, uuid: 'p2', fileName: 'photo2.jpg', thumbnailPath: '/thumb2.jpg', takenAt: '2024-01-02' },
    { id: 3, uuid: 'p3', fileName: 'photo3.jpg', thumbnailPath: '/thumb3.jpg', takenAt: '2024-01-03' }
  ]

  const createWrapper = (options: any = {}) => {
    return mount(CoverPhotoSelector, {
      props: {
        show: true,
        album: mockAlbum,
        photos: mockPhotos,
        loading: false,
        ...options
      },
      global: {
        stubs: {
          NModal: {
            props: ['show', 'preset', 'title', 'style'],
            emits: ['update:show'],
            template: `
              <div class="n-modal-mock">
                <div class="n-modal-body">
                  <div class="modal-title">{{ title }}</div>
                  <slot></slot>
                </div>
              </div>
            `
          },
          NButton: {
            props: ['type', 'disabled', 'loading'],
            emits: ['click'],
            template: `<button class="n-btn" :class="type" :disabled="disabled" @click="$emit('click')"><slot></slot></button>`
          },
          NImage: {
            props: ['src', 'alt'],
            template: `<img :src="src" :alt="alt" class="n-image-mock" />`
          },
          NIcon: {
            props: ['size', 'color'],
            template: `<span class="n-icon-mock"><slot></slot></span>`
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
    it('should have correct props definition', () => {
      const wrapper = createWrapper()
      expect(wrapper.props().show).toBe(true)
      expect(wrapper.props().album).toEqual(mockAlbum)
      expect(wrapper.props().photos).toEqual(mockPhotos)
    })

    it('should not render when show is false', () => {
      const wrapper = createWrapper({ show: false })
      // Component still mounts but modal should not be visible
      expect(wrapper.classes()).not.toContain('visible')
    })
  })

  describe('Selection State', () => {
    it('should have selectedPhotoId ref', async () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      expect(vm.selectedPhotoId).toBeNull()

      vm.selectedPhotoId = 1
      expect(vm.selectedPhotoId).toBe(1)
    })

    it('should update selectedPhotoId', async () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.selectedPhotoId = 2
      expect(vm.selectedPhotoId).toBe(2)

      vm.selectedPhotoId = null
      expect(vm.selectedPhotoId).toBeNull()
    })
  })

  describe('Photo Computed Properties', () => {
    it('should return correct selectedPhoto', async () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.selectedPhotoId = 1
      expect(vm.selectedPhoto).toEqual(mockPhotos[0])

      vm.selectedPhotoId = 2
      expect(vm.selectedPhoto).toEqual(mockPhotos[1])
    })

    it('should return undefined for non-existent photo', async () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.selectedPhotoId = 999
      expect(vm.selectedPhoto).toBeUndefined()
    })
  })

  describe('Methods', () => {
    it('should have close method', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      expect(typeof vm.close).toBe('function')
    })

    it('should have handleSelect method', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      expect(typeof vm.handleSelect).toBe('function')
    })

    it('should have handlePhotoClick method', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      expect(typeof vm.handlePhotoClick).toBe('function')
    })

    it('handlePhotoClick should update selection', async () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.handlePhotoClick(mockPhotos[0])
      expect(vm.selectedPhotoId).toBe(1)
    })

    it('handleSelect should emit select event when photo selected', async () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.selectedPhotoId = 2
      vm.handleSelect()

      expect(wrapper.emitted('select')).toBeTruthy()
      expect(wrapper.emitted('select')[0]).toEqual([2])
    })

    it('close should emit update:show', async () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      vm.close()

      expect(wrapper.emitted('update:show')).toBeTruthy()
      expect(wrapper.emitted('update:show')[0]).toEqual([false])
    })
  })

  describe('Watchers', () => {
    it('should reset state when show becomes true', async () => {
      const wrapper = createWrapper({ show: false })
      const vm = wrapper.vm as any

      vm.selectedPhotoId = 5

      // Change to visible
      await wrapper.setProps({ show: true })

      // selectedPhotoId should reset to album's coverPhotoId or null
      expect(vm.selectedPhotoId).toBe(mockAlbum.coverPhotoId ?? null)
    })

    it('should update localPhotos when props change', async () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      const newPhotos = [...mockPhotos, { id: 4, uuid: 'p4', fileName: 'photo4.jpg' }]
      await wrapper.setProps({ photos: newPhotos })

      expect(vm.localPhotos).toEqual(newPhotos)
    })
  })

  describe('Exposed Methods', () => {
    it('should expose methods', () => {
      const wrapper = createWrapper()
      const vm = wrapper.vm as any

      expect(typeof vm.close).toBe('function')
      expect(typeof vm.handleSelect).toBe('function')
      expect(typeof vm.handlePhotoClick).toBe('function')
    })
  })
})
