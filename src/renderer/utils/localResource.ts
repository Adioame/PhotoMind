/**
 * PhotoMind - Local Resource URL Conversion Utility
 *
 * Provides utilities for converting local file paths to custom protocol URLs
 * to bypass Electron browser security restrictions on file:// protocol.
 */

/**
 * Custom protocol scheme for local resources
 * This protocol is registered in the main process to serve local files
 */
export const LOCAL_RESOURCE_PROTOCOL = 'local-resource'

/**
 * Converts an absolute file path to a local-resource protocol URL
 *
 * This function transforms a local file system path (e.g., /Users/mac/PhotoMind/data/cache/thumbnails/xxx.jpg)
 * into a custom protocol URL (e.g., local-resource:///Users/mac/PhotoMind/data/cache/thumbnails/xxx.jpg)
 * that can be safely loaded in the renderer process without triggering browser security restrictions.
 *
 * @param absolutePath - The absolute file system path to convert
 * @returns A local-resource protocol URL, or empty string if path is invalid/empty
 *
 * @example
 * // Basic usage
 * const url = toLocalResourceProtocol('/Users/mac/PhotoMind/data/cache/thumbnails/photo.jpg')
 * // Returns: 'local-resource:///Users/mac/PhotoMind/data/cache/thumbnails/photo.jpg'
 *
 * @example
 * // With Windows path
 * const url = toLocalResourceProtocol('C:\\Users\\PhotoMind\\data\\cache\\photo.jpg')
 * // Returns: 'local-resource://C:\\Users\\PhotoMind\\data\\cache\\photo.jpg'
 */
export function toLocalResourceProtocol(absolutePath: string): string {
  if (!absolutePath) {
    return ''
  }

  // Return empty string for already converted URLs or empty paths
  if (absolutePath.startsWith(`${LOCAL_RESOURCE_PROTOCOL}://`)) {
    return absolutePath
  }

  // Return as-is for web URLs (http, https, data, blob)
  if (/^(https?:\/\/|data:|blob:)/.test(absolutePath)) {
    return absolutePath
  }

  // Convert absolute file path to local-resource protocol URL
  // Note: We do NOT encode the path here because the main process will decode it
  // This preserves the original path structure including any special characters
  return `${LOCAL_RESOURCE_PROTOCOL}://${absolutePath}`
}

/**
 * Checks if a URL uses the local-resource protocol
 *
 * @param url - The URL to check
 * @returns true if the URL uses the local-resource protocol
 *
 * @example
 * isLocalResourceUrl('local-resource:///path/to/file.jpg') // true
 * isLocalResourceUrl('https://example.com/image.jpg') // false
 */
export function isLocalResourceUrl(url: string): boolean {
  if (!url) return false
  return url.startsWith(`${LOCAL_RESOURCE_PROTOCOL}://`)
}

/**
 * Extracts the original file path from a local-resource protocol URL
 *
 * @param url - The local-resource protocol URL
 * @returns The original file system path, or null if URL is invalid
 *
 * @example
 * const path = extractLocalPath('local-resource:///Users/mac/PhotoMind/data/cache/photo.jpg')
 * // Returns: '/Users/mac/PhotoMind/data/cache/photo.jpg'
 */
export function extractLocalPath(url: string): string | null {
  if (!url || !isLocalResourceUrl(url)) {
    return null
  }

  // Remove the protocol prefix
  return url.replace(`${LOCAL_RESOURCE_PROTOCOL}://`, '')
}

/**
 * Converts a photo object path to a local-resource protocol URL
 * Handles various path field names commonly used in photo objects
 *
 * @param photo - Photo object with path fields
 * @returns A local-resource protocol URL or empty string
 *
 * @example
 * const url = photoToLocalResourceUrl({
 *   thumbnailPath: '/Users/mac/PhotoMind/data/cache/thumb.jpg',
 *   filePath: '/Users/mac/PhotoMind/photos/original.jpg'
 * })
 * // Returns: 'local-resource:///Users/mac/PhotoMind/data/cache/thumb.jpg'
 */
export function photoToLocalResourceUrl(photo: {
  thumbnailPath?: string
  thumbnail_url?: string
  filePath?: string
}): string {
  if (!photo || typeof photo !== 'object') {
    return ''
  }

  // Priority: thumbnailPath > thumbnail_url > filePath
  const path = photo.thumbnailPath || photo.thumbnail_url || photo.filePath

  if (!path) {
    return ''
  }

  return toLocalResourceProtocol(path)
}
