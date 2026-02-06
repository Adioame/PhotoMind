/**
 * PhotoMind - Local Resource Utility Unit Tests
 */
import { describe, it, expect } from 'vitest'
import {
  toLocalResourceProtocol,
  isLocalResourceUrl,
  extractLocalPath,
  photoToLocalResourceUrl,
  LOCAL_RESOURCE_PROTOCOL
} from '../../src/renderer/utils/localResource'

describe('localResource.ts', () => {
  describe('toLocalResourceProtocol', () => {
    it('should convert absolute Unix path to local-resource URL', () => {
      const path = '/Users/mac/PhotoMind/data/cache/thumbnails/photo.jpg'
      const result = toLocalResourceProtocol(path)
      expect(result).toBe('local-resource:///Users/mac/PhotoMind/data/cache/thumbnails/photo.jpg')
    })

    it('should convert absolute Windows path to local-resource URL', () => {
      const path = 'C:\\Users\\PhotoMind\\data\\cache\\photo.jpg'
      const result = toLocalResourceProtocol(path)
      expect(result).toBe('local-resource://C:\\Users\\PhotoMind\\data\\cache\\photo.jpg')
    })

    it('should return empty string for empty path', () => {
      expect(toLocalResourceProtocol('')).toBe('')
      expect(toLocalResourceProtocol(null as any)).toBe('')
      expect(toLocalResourceProtocol(undefined as any)).toBe('')
    })

    it('should return URL as-is for http URLs', () => {
      const url = 'https://example.com/image.jpg'
      expect(toLocalResourceProtocol(url)).toBe(url)
    })

    it('should return URL as-is for https URLs', () => {
      const url = 'https://cdn.example.com/photo.jpg'
      expect(toLocalResourceProtocol(url)).toBe(url)
    })

    it('should return URL as-is for data URLs', () => {
      const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      expect(toLocalResourceProtocol(url)).toBe(url)
    })

    it('should return URL as-is for blob URLs', () => {
      const url = 'blob:http://localhost:5177/550e8400-e29b-41d4-a716-446655440000'
      expect(toLocalResourceProtocol(url)).toBe(url)
    })

    it('should return already converted URL unchanged', () => {
      const url = 'local-resource:///Users/mac/PhotoMind/data/cache/photo.jpg'
      expect(toLocalResourceProtocol(url)).toBe(url)
    })

    it('should handle paths with spaces', () => {
      const path = '/Users/mac/PhotoMind/my photos/vacation.jpg'
      const result = toLocalResourceProtocol(path)
      expect(result).toBe('local-resource:///Users/mac/PhotoMind/my photos/vacation.jpg')
    })

    it('should handle paths with special characters', () => {
      const path = '/Users/mac/PhotoMind/照片/旅行.jpg'
      const result = toLocalResourceProtocol(path)
      expect(result).toBe('local-resource:///Users/mac/PhotoMind/照片/旅行.jpg')
    })
  })

  describe('isLocalResourceUrl', () => {
    it('should return true for local-resource URLs', () => {
      expect(isLocalResourceUrl('local-resource:///path/to/file.jpg')).toBe(true)
    })

    it('should return false for http URLs', () => {
      expect(isLocalResourceUrl('https://example.com/image.jpg')).toBe(false)
    })

    it('should return false for empty strings', () => {
      expect(isLocalResourceUrl('')).toBe(false)
      expect(isLocalResourceUrl(null as any)).toBe(false)
      expect(isLocalResourceUrl(undefined as any)).toBe(false)
    })

    it('should return false for regular file URLs', () => {
      expect(isLocalResourceUrl('file:///Users/mac/PhotoMind/photo.jpg')).toBe(false)
    })
  })

  describe('extractLocalPath', () => {
    it('should extract path from local-resource URL', () => {
      const url = 'local-resource:///Users/mac/PhotoMind/data/cache/photo.jpg'
      const result = extractLocalPath(url)
      expect(result).toBe('/Users/mac/PhotoMind/data/cache/photo.jpg')
    })

    it('should return null for non-local-resource URLs', () => {
      expect(extractLocalPath('https://example.com/image.jpg')).toBe(null)
      expect(extractLocalPath('file:///path/to/file.jpg')).toBe(null)
    })

    it('should return null for empty or invalid URLs', () => {
      expect(extractLocalPath('')).toBe(null)
      expect(extractLocalPath(null as any)).toBe(null)
      expect(extractLocalPath(undefined as any)).toBe(null)
    })
  })

  describe('photoToLocalResourceUrl', () => {
    it('should convert photo with thumbnailPath', () => {
      const photo = {
        thumbnailPath: '/Users/mac/PhotoMind/data/cache/thumb.jpg',
        filePath: '/Users/mac/PhotoMind/photos/original.jpg'
      }
      const result = photoToLocalResourceUrl(photo)
      expect(result).toBe('local-resource:///Users/mac/PhotoMind/data/cache/thumb.jpg')
    })

    it('should use thumbnail_url if thumbnailPath is not available', () => {
      const photo = {
        thumbnail_url: '/Users/mac/PhotoMind/data/cache/thumb.jpg'
      }
      const result = photoToLocalResourceUrl(photo)
      expect(result).toBe('local-resource:///Users/mac/PhotoMind/data/cache/thumb.jpg')
    })

    it('should use filePath as fallback', () => {
      const photo = {
        filePath: '/Users/mac/PhotoMind/photos/original.jpg'
      }
      const result = photoToLocalResourceUrl(photo)
      expect(result).toBe('local-resource:///Users/mac/PhotoMind/photos/original.jpg')
    })

    it('should return empty string for empty photo object', () => {
      expect(photoToLocalResourceUrl({} as any)).toBe('')
      expect(photoToLocalResourceUrl(null as any)).toBe('')
      expect(photoToLocalResourceUrl(undefined as any)).toBe('')
    })

    it('should return web URLs unchanged', () => {
      const photo = {
        thumbnailPath: 'https://example.com/image.jpg'
      }
      const result = photoToLocalResourceUrl(photo)
      expect(result).toBe('https://example.com/image.jpg')
    })
  })

  describe('LOCAL_RESOURCE_PROTOCOL constant', () => {
    it('should equal "local-resource"', () => {
      expect(LOCAL_RESOURCE_PROTOCOL).toBe('local-resource')
    })
  })
})
