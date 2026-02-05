/**
 * PhotoMind - 智能相册服务
 *
 * 功能：
 * 1. 自动按地点分类照片
 * 2. 自动按时间分类照片
 * 3. 自动按场景标签分类
 * 4. 智能相册创建和管理
 */
import { PhotoDatabase } from '../database/db.js'
import { SearchService } from './searchService.js'

export interface SmartAlbum {
  id: string | number
  name: string
  type: 'place' | 'time' | 'tag' | 'year' | 'people' | 'custom'
  coverPhoto?: any
  photoCount: number
  queryParams?: any
  createdAt?: string
}

export interface AlbumRule {
  type: 'place' | 'time' | 'tag' | 'year' | 'people'
  conditions: any[]
}

export class SmartAlbumService {
  private database: PhotoDatabase
  private searchService: SearchService

  constructor(database: PhotoDatabase, searchService: SearchService) {
    this.database = database
    this.searchService = searchService
  }

  /**
   * 获取所有智能相册
   */
  async getSmartAlbums(): Promise<SmartAlbum[]> {
    const albums: SmartAlbum[] = []

    // 1. 地点相册
    const places = await this.database.getAllPlaces()
    if (places.length > 0) {
      albums.push({
        id: 'smart-places',
        name: '按地点浏览',
        type: 'place',
        photoCount: places.reduce((sum: number, p: any) => sum + (p.photo_count || 0), 0)
      })
    }

    // 2. 人物相册
    const people = await this.database.getAllPersons()
    if (people.length > 0) {
      albums.push({
        id: 'smart-people',
        name: '按人物浏览',
        type: 'people',
        photoCount: people.reduce((sum: number, p: any) => sum + (p.face_count || 0), 0)
      })
    }

    // 3. 年度回忆
    const currentYear = new Date().getFullYear()
    const years = [currentYear - 1, currentYear - 2, currentYear - 3]
    for (const year of years) {
      const photos = await this.database.getPhotosByYear(year)
      albums.push({
        id: `smart-year-${year}`,
        name: `${year}年`,
        type: 'year',
        photoCount: photos.length,
        queryParams: { year }
      })
    }

    // 4. 热门标签
    const tags = await this.database.getAllTags()
    if (tags.length > 0) {
      const topTags = tags.slice(0, 6)
      for (const tag of topTags) {
        const photos = await this.database.getPhotosByTag(tag.id)
        if (photos.length > 0) {
          albums.push({
            id: `smart-tag-${tag.id}`,
            name: tag.name,
            type: 'tag',
            photoCount: photos.length,
            queryParams: { tagId: tag.id }
          })
        }
      }
    }

    // 5. 用户创建的相册
    const customAlbums = await this.database.getAllAlbums()
    for (const album of customAlbums) {
      albums.push({
        id: album.id,
        name: album.name,
        type: 'custom',
        photoCount: 0,
        queryParams: album.query_params
      })
    }

    return albums
  }

  /**
   * 获取地点相册详情
   */
  async getPlaceAlbums(): Promise<SmartAlbum[]> {
    const places = await this.database.getAllPlaces()
    return places.map((place: any, index: number) => ({
      id: `place-${index}`,
      name: place.place_name,
      type: 'place' as const,
      photoCount: place.photo_count,
      queryParams: { location: place.place_name }
    }))
  }

  /**
   * 获取人物相册详情
   */
  async getPeopleAlbums(): Promise<SmartAlbum[]> {
    const people = await this.database.getAllPersons()
    return people.map((person: any) => ({
      id: person.id,
      name: person.display_name || person.name,
      type: 'people' as const,
      photoCount: person.face_count,
      queryParams: { personId: person.id, personName: person.name }
    }))
  }

  /**
   * 获取年度相册
   */
  async getYearAlbums(): Promise<SmartAlbum[]> {
    const yearCounts = await this.database.getPhotoCountByYear()
    const currentYear = new Date().getFullYear()

    // 添加缺失的年份
    const years = new Set([...yearCounts.map((y: any) => parseInt(y.year)), currentYear, currentYear - 1])

    const albums: SmartAlbum[] = []
    for (const year of years) {
      const count = yearCounts.find((y: any) => parseInt(y.year) === year)?.count || 0
      albums.push({
        id: `year-${year}`,
        name: `${year}年`,
        type: 'year',
        photoCount: count,
        queryParams: { year }
      })
    }

    return albums.sort((a, b) => parseInt(b.name) - parseInt(a.name))
  }

  /**
   * 获取某相册的所有照片
   */
  async getAlbumPhotos(album: SmartAlbum): Promise<any[]> {
    switch (album.type) {
      case 'place':
        if (album.queryParams?.location) {
          return this.database.searchPhotos('', {
            location: { keywords: [album.queryParams.location] }
          })
        }
        break

      case 'people':
        if (album.queryParams?.personId) {
          return this.database.getPhotosByPerson(album.queryParams.personId)
        }
        break

      case 'year':
        if (album.queryParams?.year) {
          return this.database.getPhotosByYear(album.queryParams.year)
        }
        break

      case 'tag':
        if (album.queryParams?.tagId) {
          return this.database.getPhotosByTag(album.queryParams.tagId)
        }
        break

      case 'custom':
        if (album.queryParams) {
          return this.database.searchPhotos('', album.queryParams)
        }
        break
    }

    return []
  }

  /**
   * 创建自定义相册
   */
  async createAlbum(name: string, queryParams: any): Promise<number> {
    return this.database.addAlbum({
      name,
      type: 'custom',
      queryParams
    })
  }

  /**
   * 删除相册
   */
  async deleteAlbum(id: number): Promise<boolean> {
    return this.database.deleteAlbum(id)
  }

  /**
   * 智能推荐相册
   */
  async getRecommendedAlbums(): Promise<SmartAlbum[]> {
    const albums: SmartAlbum[] = []

    // 1. 最近访问地点
    const places = await this.database.getAllPlaces()
    if (places.length > 0) {
      albums.push({
        id: 'recent-places',
        name: '最近地点',
        type: 'place',
        photoCount: places.slice(0, 3).reduce((sum: number, p: any) => sum + (p.photo_count || 0), 0)
      })
    }

    // 2. 童年回忆（多年前的照片）
    const currentYear = new Date().getFullYear()
    const fiveYearsAgo = currentYear - 5
    const oldPhotos = await this.database.getPhotosByYear(fiveYearsAgo)
    if (oldPhotos.length > 0) {
      albums.push({
        id: 'memories',
        name: '美好回忆',
        type: 'time',
        photoCount: oldPhotos.length,
        queryParams: { year: fiveYearsAgo }
      })
    }

    // 3. 家人照片
    const people = await this.database.getAllPersons()
    if (people.length > 0) {
      albums.push({
        id: 'family',
        name: '家人',
        type: 'people',
        photoCount: people.reduce((sum: number, p: any) => sum + (p.face_count || 0), 0)
      })
    }

    // 4. 旅行照片
    const travelKeywords = ['旅行', '旅游', 'trip', 'travel']
    for (const keyword of travelKeywords) {
      const photos = await this.database.searchPhotos('', {
        tags: [keyword]
      })
      if (photos.length > 0) {
        albums.push({
          id: `travel-${keyword}`,
          name: '旅行',
          type: 'tag',
          photoCount: photos.length
        })
        break
      }
    }

    return albums
  }
}

export const smartAlbumService = (database: PhotoDatabase, searchService: SearchService) =>
  new SmartAlbumService(database, searchService)
