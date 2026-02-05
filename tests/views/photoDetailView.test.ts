/**
 * PhotoMind - PhotoDetailView 组件集成测试
 *
 * 测试文件基于 store 测试，不直接依赖 naive-ui 组件
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePhotoDetailStore, type PhotoDetail } from '../../src/renderer/stores/photoDetailStore'

// Mock window.photoAPI
vi.mocked(window).photoAPI = {
  photos: {
    getDetail: vi.fn(),
    delete: vi.fn(),
    export: vi.fn()
  }
} as any

describe('PhotoDetailView 组件功能测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  describe('Store 状态管理', () => {
    it('应该正确初始化状态', () => {
      const store = usePhotoDetailStore()

      expect(store.photo).toBeNull()
      expect(store.loading).toBe(false)
      expect(store.similarPhotos).toEqual([])
      expect(store.currentIndex).toBe(0)
    })

    it('应该正确加载照片', async () => {
      const store = usePhotoDetailStore()

      const mockPhoto = {
        id: 1,
        uuid: 'test-uuid',
        fileName: 'test.jpg',
        filePath: '/test/test.jpg'
      }

      vi.spyOn(window.photoAPI.photos, 'getDetail').mockResolvedValue(mockPhoto)

      await store.loadPhoto('1')

      expect(store.photo).not.toBeNull()
      expect(store.photo?.fileName).toBe('test.jpg')
    })
  })

  describe('导航功能', () => {
    it('应该在不是第一张时允许导航上一张', () => {
      const store = usePhotoDetailStore()

      store.similarPhotos = [
        { id: 1, uuid: '1', fileName: '1.jpg', filePath: '/1.jpg' },
        { id: 2, uuid: '2', fileName: '2.jpg', filePath: '/2.jpg' },
        { id: 3, uuid: '3', fileName: '3.jpg', filePath: '/3.jpg' }
      ] as PhotoDetail[]
      store.currentIndex = 1

      // 不是第一张
      expect(store.isFirst).toBe(false)

      // 可以导航上一张
      store.navigateTo('prev')
      expect(store.currentIndex).toBe(0)
    })

    it('在第一张时导航上一张应该无效', () => {
      const store = usePhotoDetailStore()

      store.similarPhotos = [
        { id: 1, uuid: '1', fileName: '1.jpg', filePath: '/1.jpg' },
        { id: 2, uuid: '2', fileName: '2.jpg', filePath: '/2.jpg' }
      ] as PhotoDetail[]
      store.currentIndex = 0

      store.navigateTo('prev')
      expect(store.currentIndex).toBe(0)
    })

    it('在最后一张时导航下一张应该无效', () => {
      const store = usePhotoDetailStore()

      store.similarPhotos = [
        { id: 1, uuid: '1', fileName: '1.jpg', filePath: '/1.jpg' },
        { id: 2, uuid: '2', fileName: '2.jpg', filePath: '/2.jpg' }
      ] as PhotoDetail[]
      store.currentIndex = 2

      store.navigateTo('next')
      expect(store.currentIndex).toBe(2)
    })
  })

  describe('删除功能', () => {
    it('删除成功后应该重置状态', async () => {
      const store = usePhotoDetailStore()

      store.photo = { id: 1, uuid: 'test-uuid', fileName: 'test.jpg', filePath: '/test/test.jpg' } as PhotoDetail
      store.similarPhotos = [{ id: 2 }] as PhotoDetail[]
      store.currentIndex = 1

      vi.spyOn(window.photoAPI.photos, 'delete').mockResolvedValue({ success: true })

      await store.deletePhoto(1)

      expect(store.photo).toBeNull()
      expect(store.similarPhotos).toEqual([])
      expect(store.currentIndex).toBe(0)
    })

    it('删除失败时不应该重置状态', async () => {
      const store = usePhotoDetailStore()

      store.photo = { id: 1, uuid: 'test-uuid', fileName: 'test.jpg', filePath: '/test/test.jpg' } as PhotoDetail

      vi.spyOn(window.photoAPI.photos, 'delete').mockResolvedValue({ success: false, error: '删除失败' })

      const result = await store.deletePhoto(1)

      expect(result.success).toBe(false)
      expect(store.photo).not.toBeNull()
    })
  })

  describe('导出功能', () => {
    it('导出成功应该返回导出路径', async () => {
      const store = usePhotoDetailStore()

      store.photo = { id: 1, uuid: 'test-uuid', fileName: 'test.jpg', filePath: '/test/test.jpg' } as PhotoDetail

      vi.spyOn(window.photoAPI.photos, 'export').mockResolvedValue({
        success: true,
        exportPath: '/export/test.jpg'
      })

      const result = await store.exportPhoto('/export/path')

      expect(result.success).toBe(true)
      expect(result.exportPath).toBe('/export/test.jpg')
    })

    it('导出失败应该返回错误信息', async () => {
      const store = usePhotoDetailStore()

      store.photo = { id: 1, uuid: 'test-uuid', fileName: 'test.jpg', filePath: '/test/test.jpg' } as PhotoDetail

      vi.spyOn(window.photoAPI.photos, 'export').mockResolvedValue({
        success: false,
        error: '文件不存在'
      })

      const result = await store.exportPhoto('/invalid/path')

      expect(result.success).toBe(false)
      expect(result.error).toBe('文件不存在')
    })

    it('没有照片时导出应该返回错误', async () => {
      const store = usePhotoDetailStore()

      const result = await store.exportPhoto('/path')

      expect(result.success).toBe(false)
      expect(result.error).toBe('没有选中的照片')
    })
  })

  describe('状态计算属性', () => {
    it('hasPhoto 应该在有照片时返回 true', () => {
      const store = usePhotoDetailStore()

      store.photo = { id: 1, uuid: 'test', fileName: 'test.jpg', filePath: '/test/test.jpg' } as PhotoDetail

      expect(store.hasPhoto).toBe(true)
    })

    it('hasPhoto 应该在没有照片时返回 false', () => {
      const store = usePhotoDetailStore()

      expect(store.hasPhoto).toBe(false)
    })

    it('isLast 应该在类似照片为空时返回 true', () => {
      const store = usePhotoDetailStore()

      store.similarPhotos = []
      store.currentIndex = 0

      expect(store.isLast).toBe(true)
    })
  })

  describe('重置功能', () => {
    it('reset 应该清除所有状态', () => {
      const store = usePhotoDetailStore()

      store.photo = { id: 1 } as PhotoDetail
      store.similarPhotos = [{ id: 1 }] as PhotoDetail[]
      store.currentIndex = 5

      store.reset()

      expect(store.photo).toBeNull()
      expect(store.similarPhotos).toEqual([])
      expect(store.currentIndex).toBe(0)
    })
  })

  describe('键盘导航集成', () => {
    it('导航到特定索引应该更新当前索引', () => {
      const store = usePhotoDetailStore()

      store.similarPhotos = [
        { id: 1, uuid: '1', fileName: '1.jpg', filePath: '/1.jpg' },
        { id: 2, uuid: '2', fileName: '2.jpg', filePath: '/2.jpg' },
        { id: 3, uuid: '3', fileName: '3.jpg', filePath: '/3.jpg' }
      ] as PhotoDetail[]

      store.goToPhoto(2)
      expect(store.currentIndex).toBe(2)
    })

    it('goToPhoto 应该限制索引范围', () => {
      const store = usePhotoDetailStore()

      store.similarPhotos = [
        { id: 1, uuid: '1', fileName: '1.jpg', filePath: '/1.jpg' }
      ] as PhotoDetail[]

      store.goToPhoto(5)
      expect(store.currentIndex).toBe(0)
    })
  })

  describe('当前照片计算', () => {
    it('currentPhoto 应该返回当前索引的照片', () => {
      const store = usePhotoDetailStore()

      store.photo = { id: 0, uuid: '0', fileName: '0.jpg', filePath: '/0.jpg' } as PhotoDetail
      store.similarPhotos = [
        { id: 1, uuid: '1', fileName: '1.jpg', filePath: '/1.jpg' },
        { id: 2, uuid: '2', fileName: '2.jpg', filePath: '/2.jpg' }
      ] as PhotoDetail[]
      store.currentIndex = 1

      expect(store.currentPhoto?.id).toBe(2)
    })

    it('当没有类似照片时 currentPhoto 应该返回主照片', () => {
      const store = usePhotoDetailStore()

      store.photo = { id: 1, uuid: '1', fileName: '1.jpg', filePath: '/1.jpg' } as PhotoDetail
      store.similarPhotos = []
      store.currentIndex = 0

      expect(store.currentPhoto?.id).toBe(1)
    })
  })
})
