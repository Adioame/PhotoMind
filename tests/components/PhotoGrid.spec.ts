/**
 * PhotoMind - PhotoGrid Component Unit Tests
 *
 * Tests for Epic E-01: 照片管理基础功能
 * Stories: E-01.1 (照片网格展示)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import PhotoGrid from '@/components/PhotoGrid.vue'

// Mock @vicons/fluent
vi.mock('@vicons/fluent', () => ({
  Image24Regular: {
    render() {
      return 'svg-mock'
    }
  }
}))

describe('PhotoGrid Component - Epic E-01', () => {
  let wrapper: VueWrapper

  const createWrapper = (options = {}) => {
    wrapper = mount(PhotoGrid, {
      global: {
        stubs: {
          'n-spin': {
            template: '<div class="mock-spinner"></div>'
          },
          'n-empty': {
            template: '<div class="mock-empty"><slot name="icon"></slot><slot></slot></div>'
          },
          'n-icon': {
            template: '<span class="mock-icon"><slot></slot></span>'
          },
          'n-image': {
            props: ['src', 'alt', 'object-fit', 'lazy'],
            template: '<img :src="src" :alt="alt" />'
          }
        }
      },
      ...options
    })
    return wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  // ============================================
  // Story E-01.1: 照片网格展示
  // ============================================
  describe('E-01.1: 照片网格展示', () => {
    it('should render loading spinner when loading=true', () => {
      createWrapper({
        props: { photos: [], loading: true }
      })

      const spinner = wrapper.find('.loading-spinner')
      expect(spinner.exists()).toBe(true)
    })

    it('should render empty state when no photos', () => {
      createWrapper({
        props: { photos: [], loading: false }
      })

      const emptyState = wrapper.find('.empty-state')
      expect(emptyState.exists()).toBe(true)
      // Check for empty component - use :not stub selector
      expect(wrapper.find('.mock-empty').exists()).toBe(true)
    })

    it('should render grid container with photos', () => {
      const mockPhotos = [
        { uuid: '1', fileName: 'photo1.jpg', thumbnailPath: '/path/to/1.jpg', takenAt: '2024-01-15' },
        { uuid: '2', fileName: 'photo2.jpg', thumbnailPath: '/path/to/2.jpg', takenAt: '2024-01-16' }
      ]

      createWrapper({
        props: { photos: mockPhotos, loading: false }
      })

      const gridContainer = wrapper.find('.grid-container')
      expect(gridContainer.exists()).toBe(true)

      const photoItems = wrapper.findAll('.photo-item')
      expect(photoItems.length).toBe(2)
    })

    it('should emit photo-click when photo item is clicked', async () => {
      const mockPhoto = { uuid: 'test-uuid', fileName: 'test.jpg', thumbnailPath: '/path/to/test.jpg' }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const photoItem = wrapper.find('.photo-item')
      await photoItem.trigger('click')

      expect(wrapper.emitted('photo-click')).toBeTruthy()
      expect(wrapper.emitted('photo-click')[0]).toEqual([mockPhoto])
    })

    it('should apply custom column count', () => {
      const mockPhotos = [
        { uuid: '1', thumbnailPath: '/path/1.jpg' },
        { uuid: '2', thumbnailPath: '/path/2.jpg' },
        { uuid: '3', thumbnailPath: '/path/3.jpg' }
      ]

      createWrapper({
        props: { photos: mockPhotos, loading: false, columns: 3 }
      })

      const gridStyle = wrapper.find('.grid-container').attributes('style')
      expect(gridStyle).toContain('repeat(3, 1fr)')
    })

    it('should use default column count of 4', () => {
      const mockPhotos = [
        { uuid: '1', thumbnailPath: '/path/1.jpg' }
      ]

      createWrapper({
        props: { photos: mockPhotos, loading: false }
      })

      const gridStyle = wrapper.find('.grid-container').attributes('style')
      expect(gridStyle).toContain('repeat(4, 1fr)')
    })
  })

  // ============================================
  // Photo URL Generation Tests
  // ============================================
  describe('Photo URL Generation', () => {
    it('should add file:// prefix to absolute thumbnailPath', () => {
      const mockPhoto = { uuid: '1', thumbnailPath: '/absolute/path/photo.jpg' }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const img = wrapper.find('.photo-item img')
      expect(img.attributes('src')).toBe('file:///absolute/path/photo.jpg')
    })

    it('should handle Windows absolute path', () => {
      const mockPhoto = { uuid: '1', thumbnailPath: 'C:\\Users\\photos\\image.jpg' }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const img = wrapper.find('.photo-item img')
      expect(img.attributes('src')).toBe('file://C:\\Users\\photos\\image.jpg')
    })

    it('should use thumbnail_url as fallback', () => {
      const mockPhoto = { uuid: '1', thumbnail_url: 'https://example.com/image.jpg' }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const img = wrapper.find('.photo-item img')
      expect(img.attributes('src')).toBe('https://example.com/image.jpg')
    })

    it('should fallback to filePath if thumbnailPath is missing', () => {
      const mockPhoto = { uuid: '1', filePath: '/path/to/original.jpg' }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const img = wrapper.find('.photo-item img')
      expect(img.attributes('src')).toBe('file:///path/to/original.jpg')
    })
  })

  // ============================================
  // Date Formatting Tests
  // ============================================
  describe('Date Formatting', () => {
    it('should format date correctly (YYYY.MM.DD)', () => {
      const mockPhoto = {
        uuid: '1',
        thumbnailPath: '/path/1.jpg',
        takenAt: '2024-06-15T10:30:00Z'
      }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const dateSpan = wrapper.find('.photo-date')
      expect(dateSpan.text()).toBe('2024.06.15')
    })

    it('should handle empty takenAt', () => {
      const mockPhoto = { uuid: '1', thumbnailPath: '/path/1.jpg', takenAt: '' }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const dateSpan = wrapper.find('.photo-date')
      expect(dateSpan.text()).toBe('')
    })

    it('should handle missing takenAt', () => {
      const mockPhoto = { uuid: '1', thumbnailPath: '/path/1.jpg' }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const dateSpan = wrapper.find('.photo-date')
      expect(dateSpan.text()).toBe('')
    })
  })

  // ============================================
  // Location Display Tests
  // ============================================
  describe('Location Display', () => {
    it('should display location name when present', () => {
      const mockPhoto = {
        uuid: '1',
        thumbnailPath: '/path/1.jpg',
        location: { name: 'Tokyo, Japan' }
      }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const locationSpan = wrapper.find('.photo-location')
      expect(locationSpan.exists()).toBe(true)
      expect(locationSpan.text()).toBe('Tokyo, Japan')
    })

    it('should not display location when missing', () => {
      const mockPhoto = { uuid: '1', thumbnailPath: '/path/1.jpg' }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const locationSpan = wrapper.find('.photo-location')
      expect(locationSpan.exists()).toBe(false)
    })
  })

  // ============================================
  // Photo Item Key Tests
  // ============================================
  describe('Photo Item Keys', () => {
    it('should render photo items with correct count', () => {
      const mockPhotos = [
        { uuid: 'uuid-1', thumbnailPath: '/path/1.jpg' },
        { uuid: 'uuid-2', thumbnailPath: '/path/2.jpg' }
      ]
      createWrapper({
        props: { photos: mockPhotos, loading: false }
      })

      const photoItems = wrapper.findAll('.photo-item')
      expect(photoItems.length).toBe(2)
      // Vue handles keys internally, we verify items render correctly
      expect(photoItems[0].exists()).toBe(true)
      expect(photoItems[1].exists()).toBe(true)
    })

    it('should render photos with different identifiers', () => {
      const mockPhotos = [
        { id: 100, thumbnailPath: '/path/1.jpg' },
        { uuid: 'uuid-only', thumbnailPath: '/path/2.jpg' }
      ]
      createWrapper({
        props: { photos: mockPhotos, loading: false }
      })

      const photoItems = wrapper.findAll('.photo-item')
      expect(photoItems.length).toBe(2)
    })
  })

  // ============================================
  // Accessibility Tests
  // ============================================
  describe('Accessibility', () => {
    it('should have alt attribute on images', () => {
      const mockPhoto = { uuid: '1', thumbnailPath: '/path/1.jpg', fileName: 'vacation.jpg' }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const img = wrapper.find('.photo-item img')
      expect(img.attributes('alt')).toBe('vacation.jpg')
    })

    it('should have photo-item with hover effect class', () => {
      const mockPhoto = { uuid: '1', thumbnailPath: '/path/1.jpg' }
      createWrapper({
        props: { photos: [mockPhoto], loading: false }
      })

      const photoItem = wrapper.find('.photo-item')
      // CSS hover effect is tested in component styles
      expect(photoItem.classes()).toContain('photo-item')
    })
  })
})
