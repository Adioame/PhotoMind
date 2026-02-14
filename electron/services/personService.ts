/**
 * PhotoMind - 人物管理服务
 *
 * 功能：
 * 1. 人物 CRUD 操作
 * 2. 照片人物标记/取消标记
 * 3. 人物照片查询
 */
import { PhotoDatabase } from '../database/db.js'

export interface Person {
  id: number
  name: string
  display_name: string
  face_count: number
  created_at: string
  is_manual: boolean
}

export interface PersonTag {
  id: number
  photo_id: number
  person_id: number
  person_name: string
  bounding_box?: BoundingBox
  confidence: number
  is_manual: boolean
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface AddPersonParams {
  name: string
  displayName?: string
}

export interface TagPersonParams {
  photoId: number
  personId: number
  boundingBox?: BoundingBox
}

export class PersonService {
  private database: PhotoDatabase
  private dbInitialized: boolean = false

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureDb(): Promise<void> {
    if (!this.dbInitialized) {
      await this.database.init()
      this.dbInitialized = true
    }
  }

  /**
   * 获取所有人物
   */
  async getAllPersons(): Promise<Person[]> {
    await this.ensureDb()
    const persons = this.database.getAllPersons()
    return persons.map((p: any) => ({
      id: p.id,
      name: p.name,
      display_name: p.display_name || p.name,
      face_count: p.face_count || 0,
      created_at: p.created_at,
      is_manual: !!p.is_manual
    }))
  }

  /**
   * 根据 ID 获取人物
   */
  async getPersonById(id: number): Promise<Person | null> {
    await this.ensureDb()
    const person = this.database.getPersonById(id)
    if (!person) return null

    return {
      id: person.id,
      name: person.name,
      display_name: person.display_name || person.name,
      face_count: person.face_count || 0,
      created_at: person.created_at,
      is_manual: !!person.is_manual
    }
  }

  /**
   * 添加新人物
   */
  async addPerson(params: AddPersonParams): Promise<{ success: boolean; personId?: number; error?: string }> {
    try {
      await this.ensureDb()
      // 检查是否已存在（不区分大小写）
      const existing = await this.searchPersons(params.name)
      const normalizedName = params.name.toLowerCase().trim()
      const found = existing.find(p => p.name.toLowerCase() === normalizedName)

      if (found) {
        return {
          success: false,
          error: `人物 "${params.name}" 已存在`
        }
      }

      const personId = this.database.addPerson({
        name: params.name,
        displayName: params.displayName || params.name
      })

      console.log(`[PersonService] 添加新人物: ${params.name} (ID: ${personId})`)
      return { success: true, personId }
    } catch (error) {
      console.error('[PersonService] 添加人物失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 更新人物信息
   */
  async updatePerson(id: number, params: Partial<AddPersonParams>): Promise<boolean> {
    await this.ensureDb()
    return this.database.updatePerson(id, {
      name: params.name,
      displayName: params.displayName
    })
  }

  /**
   * 删除人物
   */
  async deletePerson(id: number): Promise<boolean> {
    try {
      await this.ensureDb()
      this.database.run('DELETE FROM faces WHERE person_id = ?', [id])
      this.database.run('DELETE FROM persons WHERE id = ?', [id])
      console.log(`[PersonService] 删除人物 ID: ${id}`)
      return true
    } catch (error) {
      console.error('[PersonService] 删除人物失败:', error)
      return false
    }
  }

  /**
   * 搜索人物
   */
  async searchPersons(query: string): Promise<Person[]> {
    await this.ensureDb()
    const results = this.database.searchPersons(query)
    return results.map((p: any) => ({
      id: p.id,
      name: p.name,
      display_name: p.display_name || p.name,
      face_count: p.face_count || 0,
      created_at: p.created_at,
      is_manual: !!p.is_manual
    }))
  }

  /**
   * 为照片标记人物
   */
  async tagPerson(params: TagPersonParams): Promise<{ success: boolean; tagId?: number; error?: string }> {
    try {
      await this.ensureDb()
      // 验证照片存在
      const photo = this.database.getPhotoById(params.photoId)
      if (!photo) {
        return { success: false, error: '照片不存在' }
      }

      // 验证人物存在
      const person = this.database.getPersonById(params.personId)
      if (!person) {
        return { success: false, error: '人物不存在' }
      }

      // 检查是否已标记
      const existingTags = this.database.getFacesByPhoto(params.photoId)
      const alreadyTagged = existingTags.some((f: any) => f.person_id === params.personId)
      if (alreadyTagged) {
        return { success: false, error: '该照片已标记此人物' }
      }

      // 添加标签
      const tagId = this.database.addFace({
        photoId: params.photoId,
        personId: params.personId,
        boundingBox: params.boundingBox,
        confidence: 1.0,
        isManual: 1  // 手动标记
      })

      // 更新人物 face_count
      await this.updatePersonFaceCount(params.personId)

      console.log(`[PersonService] 为照片 ${params.photoId} 标记人物: ${person.name}`)
      return { success: true, tagId }
    } catch (error) {
      console.error('[PersonService] 标记人物失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 移除照片的人物标签
   */
  async untagPerson(photoId: number, personId: number): Promise<boolean> {
    try {
      await this.ensureDb()
      this.database.run(
        'DELETE FROM faces WHERE photo_id = ? AND person_id = ?',
        [photoId, personId]
      )
      await this.updatePersonFaceCount(personId)
      console.log(`[PersonService] 移除照片 ${photoId} 的人物标签`)
      return true
    } catch (error) {
      console.error('[PersonService] 移除标签失败:', error)
      return false
    }
  }

  /**
   * 获取照片的所有人物标签
   */
  async getPhotoTags(photoId: number): Promise<PersonTag[]> {
    await this.ensureDb()
    const faces = this.database.getFacesByPhoto(photoId)
    return faces.map((f: any) => ({
      id: f.id,
      photo_id: f.photo_id,
      person_id: f.person_id,
      person_name: f.person_name || '未知',
      bounding_box: f.bounding_box ? JSON.parse(f.bounding_box) : undefined,
      confidence: f.confidence || 0,
      is_manual: !!f.is_manual
    }))
  }

  /**
   * 获取某人物的所有照片
   */
  async getPersonPhotos(personId: number): Promise<any[]> {
    await this.ensureDb()
    return this.database.getPhotosByPerson(personId)
  }

  /**
   * 根据人物名称搜索照片
   */
  async searchPhotosByPerson(personName: string): Promise<any[]> {
    await this.ensureDb()
    return this.database.searchPhotosByPerson(personName)
  }

  /**
   * 更新人物 face_count
   */
  private async updatePersonFaceCount(personId: number): Promise<void> {
    const photos = this.database.getPhotosByPerson(personId)
    this.database.run(
      'UPDATE persons SET face_count = ? WHERE id = ?',
      [photos.length, personId]
    )
  }

  /**
   * 获取人物统计
   */
  async getStats(): Promise<{ totalPersons: number; totalTags: number }> {
    await this.ensureDb()
    const persons = await this.getAllPersons()
    const totalTags = persons.reduce((sum, p) => sum + p.face_count, 0)
    return {
      totalPersons: persons.length,
      totalTags
    }
  }

  /**
   * 批量标记人物
   */
  async tagPersons(photoId: number, personIds: number[]): Promise<{ success: boolean; tagged: number; errors: string[] }> {
    let tagged = 0
    const errors: string[] = []

    for (const personId of personIds) {
      const result = await this.tagPerson({ photoId, personId })
      if (result.success) {
        tagged++
      } else if (result.error) {
        errors.push(result.error)
      }
    }

    return { success: errors.length === 0, tagged, errors }
  }

  /**
   * 移除照片的所有人物标签
   */
  async untagAllPersons(photoId: number): Promise<boolean> {
    try {
      await this.ensureDb()
      // 获取所有标签以更新对应的 person face_count
      const tags = await this.getPhotoTags(photoId)
      const personIds = [...new Set(tags.map(t => t.person_id))]

      this.database.run('DELETE FROM faces WHERE photo_id = ?', [photoId])

      // 更新每个相关人物的 face_count
      for (const personId of personIds) {
        await this.updatePersonFaceCount(personId)
      }

      console.log(`[PersonService] 移除照片 ${photoId} 的所有人物标签`)
      return true
    } catch (error) {
      console.error('[PersonService] 移除所有标签失败:', error)
      return false
    }
  }
}

export const personService = new PersonService()
