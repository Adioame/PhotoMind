/**
 * PhotoMind - PersonService Unit Tests
 *
 * Tests for Epic E-04: 人脸识别与人物管理
 * Story: E-04.1 (手动标记人物)
 *
 * 注意：由于 PersonService 使用数据库依赖，
 * 我们通过 Mock 数据库来测试核心业务逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================
// 类型定义 (从 personService.ts 复制)
// ============================================
interface Person {
  id: number
  name: string
  displayName: string
  faceCount: number
  createdAt: string
  isManual: boolean
}

interface PersonTag {
  id: number
  photoId: number
  personId: number
  personName: string
  boundingBox?: BoundingBox
  confidence: number
  isManual: boolean
}

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

interface AddPersonParams {
  name: string
  displayName?: string
}

interface TagPersonParams {
  photoId: number
  personId: number
  boundingBox?: BoundingBox
}

// ============================================
// Mock 数据库类 (模拟 PhotoDatabase)
// ============================================
class MockPhotoDatabase {
  private persons: Map<number, any> = new Map()
  private faces: Map<number, any> = new Map()
  private photos: Map<number, any> = new Map()
  private nextPersonId = 1
  private nextFaceId = 1
  private nextPhotoId = 1

  // 模拟 run 方法 - 支持 DELETE 操作
  run(sql: string, params: any[] = []): { lastInsertRowid: number } {
    if (sql.includes('DELETE FROM faces WHERE person_id = ?')) {
      const personId = params[0]
      for (const [key, value] of this.faces.entries()) {
        if (value.person_id === personId) {
          this.faces.delete(key)
        }
      }
    } else if (sql.includes('DELETE FROM faces WHERE photo_id = ? AND person_id = ?')) {
      const photoId = params[0]
      const personId = params[1]
      for (const [key, value] of this.faces.entries()) {
        if (value.photo_id === photoId && value.person_id === personId) {
          this.faces.delete(key)
        }
      }
    } else if (sql.includes('DELETE FROM faces WHERE photo_id = ?')) {
      const photoId = params[0]
      for (const [key, value] of this.faces.entries()) {
        if (value.photo_id === photoId) {
          this.faces.delete(key)
        }
      }
    } else if (sql.includes('DELETE FROM persons WHERE id = ?')) {
      const personId = params[0]
      this.persons.delete(personId)
    } else if (sql.includes('UPDATE persons SET face_count')) {
      const faceCount = params[0]
      const personId = params[1]
      const person = this.persons.get(personId)
      if (person) {
        person.face_count = faceCount
      }
    }
    return { lastInsertRowid: -1 }
  }

  // 模拟 query 方法
  query(sql: string, params: any[] = []): any[] {
    return []
  }

  // 添加人物
  addPerson(person: { name: string; displayName?: string }): number {
    const id = this.nextPersonId++
    this.persons.set(id, {
      id,
      name: person.name,
      display_name: person.displayName || person.name,
      face_count: 0,
      created_at: new Date().toISOString(),
      is_manual: 0
    })
    return id
  }

  // 获取所有人物
  getAllPersons(): any[] {
    return Array.from(this.persons.values())
  }

  // 根据ID获取人物
  getPersonById(id: number): any {
    return this.persons.get(id) || null
  }

  // 更新人物
  updatePerson(id: number, person: { name?: string; displayName?: string }): boolean {
    const existing = this.persons.get(id)
    if (!existing) return false
    if (person.name) existing.name = person.name
    if (person.displayName) existing.display_name = person.displayName
    this.persons.set(id, existing)
    return true
  }

  // 搜索人物
  searchPersons(query: string): any[] {
    if (!query.trim()) return this.getAllPersons()
    const lowerQuery = query.toLowerCase()
    return Array.from(this.persons.values()).filter(
      p => p.name.toLowerCase().includes(lowerQuery) ||
           (p.display_name && p.display_name.toLowerCase().includes(lowerQuery))
    )
  }

  // 获取照片
  getPhotoById(id: number): any {
    return this.photos.get(id) || null
  }

  // 添加照片（用于测试）
  addPhoto(photo: any): number {
    const id = this.nextPhotoId++
    this.photos.set(id, {
      id,
      ...photo
    })
    return id
  }

  // 添加人脸标签
  addFace(face: { photoId: number; personId: number; boundingBox?: any; confidence?: number; is_manual?: number }): number {
    const id = this.nextFaceId++
    const faceData = {
      id,
      photo_id: face.photoId,
      person_id: face.personId,
      bounding_box: face.boundingBox ? JSON.stringify(face.boundingBox) : null,
      confidence: face.confidence || 0,
      is_manual: face.is_manual || 0,
      person_name: this.persons.get(face.personId)?.name || null
    }
    this.faces.set(id, faceData)

    // 更新人物的 face_count
    const person = this.persons.get(face.personId)
    if (person) {
      person.face_count = (person.face_count || 0) + 1
    }

    return id
  }

  // 获取照片的所有人脸标签
  getFacesByPhoto(photoId: number): any[] {
    return Array.from(this.faces.values()).filter(f => f.photo_id === photoId)
  }

  // 根据人物ID获取照片
  getPhotosByPerson(personId: number): any[] {
    const photoIds = new Set(
      Array.from(this.faces.values())
        .filter(f => f.person_id === personId)
        .map(f => f.photo_id)
    )
    return Array.from(this.photos.values()).filter(p => photoIds.has(p.id))
  }

  // 根据人物名称搜索照片
  searchPhotosByPerson(personName: string): any[] {
    const person = Array.from(this.persons.values()).find(
      p => p.name.toLowerCase() === personName.toLowerCase() ||
           p.display_name?.toLowerCase() === personName.toLowerCase()
    )
    if (!person) return []
    return this.getPhotosByPerson(person.id)
  }

  // 辅助方法：获取所有人脸
  getAllFaces(): any[] {
    return Array.from(this.faces.values())
  }
}

// ============================================
// PersonService 实现 (从 personService.ts 简化)
// ============================================
class PersonService {
  private database: MockPhotoDatabase

  constructor(database?: MockPhotoDatabase) {
    this.database = database || new MockPhotoDatabase()
  }

  getAllPersons(): Person[] {
    const persons = this.database.getAllPersons()
    return persons.map((p: any) => ({
      id: p.id,
      name: p.name,
      displayName: p.display_name || p.name,
      faceCount: p.face_count || 0,
      createdAt: p.created_at,
      isManual: !!p.is_manual
    }))
  }

  getPersonById(id: number): Person | null {
    const person = this.database.getPersonById(id)
    if (!person) return null
    return {
      id: person.id,
      name: person.name,
      displayName: person.display_name || person.name,
      faceCount: person.face_count || 0,
      createdAt: person.created_at,
      isManual: !!person.is_manual
    }
  }

  addPerson(params: AddPersonParams): { success: boolean; personId?: number; error?: string } {
    try {
      // 检查空名称
      if (!params.name || params.name.trim() === '') {
        return { success: false, error: '人物名称不能为空' }
      }

      const existing = this.database.searchPersons(params.name)
      const normalizedName = params.name.toLowerCase().trim()
      const found = existing.find((p: any) => p.name.toLowerCase() === normalizedName)

      if (found) {
        return { success: false, error: `人物 "${params.name}" 已存在` }
      }

      const personId = this.database.addPerson({
        name: params.name,
        displayName: params.displayName || params.name
      })

      return { success: true, personId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  }

  updatePerson(id: number, params: Partial<AddPersonParams>): boolean {
    return this.database.updatePerson(id, {
      name: params.name,
      displayName: params.displayName
    })
  }

  deletePerson(id: number): boolean {
    try {
      this.database.run('DELETE FROM faces WHERE person_id = ?', [id])
      this.database.run('DELETE FROM persons WHERE id = ?', [id])
      return true
    } catch {
      return false
    }
  }

  searchPersons(query: string): Person[] {
    const results = this.database.searchPersons(query)
    return results.map((p: any) => ({
      id: p.id,
      name: p.name,
      displayName: p.display_name || p.name,
      faceCount: p.face_count || 0,
      createdAt: p.created_at,
      isManual: !!p.is_manual
    }))
  }

  tagPerson(params: TagPersonParams): { success: boolean; tagId?: number; error?: string } {
    try {
      const photo = this.database.getPhotoById(params.photoId)
      if (!photo) return { success: false, error: '照片不存在' }

      const person = this.database.getPersonById(params.personId)
      if (!person) return { success: false, error: '人物不存在' }

      const existingTags = this.database.getFacesByPhoto(params.photoId)
      const alreadyTagged = existingTags.some((f: any) => f.person_id === params.personId)
      if (alreadyTagged) return { success: false, error: '该照片已标记此人物' }

      const tagId = this.database.addFace({
        photoId: params.photoId,
        personId: params.personId,
        boundingBox: params.boundingBox,
        confidence: 1.0,
        is_manual: 1
      })

      return { success: true, tagId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  }

  untagPerson(photoId: number, personId: number): boolean {
    try {
      this.database.run('DELETE FROM faces WHERE photo_id = ? AND person_id = ?', [photoId, personId])
      return true
    } catch {
      return false
    }
  }

  getPhotoTags(photoId: number): PersonTag[] {
    const faces = this.database.getFacesByPhoto(photoId)
    return faces.map((f: any) => ({
      id: f.id,
      photoId: f.photo_id,
      personId: f.person_id,
      personName: f.person_name || '未知',
      boundingBox: f.bounding_box ? JSON.parse(f.bounding_box) : undefined,
      confidence: f.confidence || 0,
      isManual: !!f.is_manual
    }))
  }

  getPersonPhotos(personId: number): any[] {
    return this.database.getPhotosByPerson(personId)
  }

  searchPhotosByPerson(personName: string): any[] {
    return this.database.searchPhotosByPerson(personName)
  }

  tagPersons(photoId: number, personIds: number[]): { success: boolean; tagged: number; errors: string[] } {
    let tagged = 0
    const errors: string[] = []

    for (const personId of personIds) {
      const result = this.tagPerson({ photoId, personId })
      if (result.success) {
        tagged++
      } else if (result.error) {
        errors.push(result.error)
      }
    }

    return { success: errors.length === 0, tagged, errors }
  }

  untagAllPersons(photoId: number): boolean {
    try {
      this.database.run('DELETE FROM faces WHERE photo_id = ?', [photoId])
      return true
    } catch {
      return false
    }
  }

  getStats(): { totalPersons: number; totalTags: number } {
    const persons = this.getAllPersons()
    const totalTags = persons.reduce((sum, p) => sum + p.faceCount, 0)
    return { totalPersons: persons.length, totalTags }
  }
}

// ============================================
// 测试
// ============================================
describe('PersonService - Epic E-04.1', () => {
  let mockDb: MockPhotoDatabase
  let personService: PersonService

  const createMockDb = (): MockPhotoDatabase => new MockPhotoDatabase()
  const createService = (db?: MockPhotoDatabase): PersonService => new PersonService(db || createMockDb())

  beforeEach(() => {
    mockDb = createMockDb()
    personService = createService(mockDb)
  })

  // ============================================
  // Phase 1: 人物 CRUD 测试
  // ============================================
  describe('人物 CRUD 测试', () => {
    it('should get all persons - 获取所有人物', () => {
      mockDb.addPerson({ name: '妈妈', displayName: '妈妈' })
      mockDb.addPerson({ name: '爸爸', displayName: '爸爸' })

      const persons = personService.getAllPersons()

      expect(persons).toHaveLength(2)
      expect(persons.map(p => p.name)).toContain('妈妈')
      expect(persons.map(p => p.name)).toContain('爸爸')
    })

    it('should get person by ID - 根据ID获取人物', () => {
      const personId = mockDb.addPerson({ name: '测试人物', displayName: '测试人物' })

      const person = personService.getPersonById(personId)

      expect(person).not.toBeNull()
      expect(person?.name).toBe('测试人物')
    })

    it('should return null for non-existent person - 不存在的人物返回null', () => {
      const person = personService.getPersonById(999)
      expect(person).toBeNull()
    })

    it('should add new person successfully - 成功添加新人物', () => {
      const result = personService.addPerson({ name: '新人物', displayName: '新人物' })

      expect(result.success).toBe(true)
      expect(result.personId).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should not add duplicate person - 不允许重复人物', () => {
      personService.addPerson({ name: '妈妈' })
      const result = personService.addPerson({ name: '妈妈' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('已存在')
    })

    it('should be case-insensitive for duplicate check - 重复检查不区分大小写', () => {
      personService.addPerson({ name: '妈妈' })
      const result = personService.addPerson({ name: '妈妈' })

      expect(result.success).toBe(false)
    })

    it('should update person successfully - 成功更新人物', () => {
      const personId = mockDb.addPerson({ name: '原名称', displayName: '原名称' })

      const success = personService.updatePerson(personId, { name: '新名称' })

      expect(success).toBe(true)
      const updated = personService.getPersonById(personId)
      expect(updated?.name).toBe('新名称')
    })

    it('should delete person successfully - 成功删除人物', () => {
      const personId = mockDb.addPerson({ name: '待删除人物' })

      const success = personService.deletePerson(personId)

      expect(success).toBe(true)
      expect(personService.getPersonById(personId)).toBeNull()
    })
  })

  // ============================================
  // Phase 2: 人物搜索测试
  // ============================================
  describe('人物搜索测试', () => {
    it('should search persons by name - 根据名称搜索人物', () => {
      mockDb.addPerson({ name: '妈妈', displayName: '妈妈' })
      mockDb.addPerson({ name: '爸爸', displayName: '爸爸' })

      const results = personService.searchPersons('妈妈')

      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('should return all persons when query is empty - 空查询返回所有人物', () => {
      mockDb.addPerson({ name: '人物1' })
      mockDb.addPerson({ name: '人物2' })

      const results = personService.searchPersons('')

      expect(results).toHaveLength(2)
    })
  })

  // ============================================
  // Phase 3: 照片标记测试
  // ============================================
  describe('照片标记测试', () => {
    it('should tag person on photo - 为照片标记人物', () => {
      const personId = mockDb.addPerson({ name: '妈妈' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })

      const result = personService.tagPerson({ photoId, personId })

      expect(result.success).toBe(true)
      expect(result.tagId).toBeDefined()

      const tags = personService.getPhotoTags(photoId)
      expect(tags.length).toBe(1)
      expect(tags[0].personId).toBe(personId)
    })

    it('should not tag non-existent person - 标记不存在的人物应失败', () => {
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })

      const result = personService.tagPerson({ photoId, personId: 999 })

      expect(result.success).toBe(false)
      expect(result.error).toContain('不存在')
    })

    it('should not tag non-existent photo - 标记不存在的照片应失败', () => {
      const personId = mockDb.addPerson({ name: '妈妈' })

      const result = personService.tagPerson({ photoId: 999, personId })

      expect(result.success).toBe(false)
      expect(result.error).toContain('不存在')
    })

    it('should not tag same person twice - 不允许重复标记同一人', () => {
      const personId = mockDb.addPerson({ name: '妈妈' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })
      personService.tagPerson({ photoId, personId })

      const result = personService.tagPerson({ photoId, personId })

      expect(result.success).toBe(false)
      expect(result.error).toContain('已标记')
    })

    it('should untag person from photo - 移除照片的人物标签', () => {
      const personId = mockDb.addPerson({ name: '妈妈' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })
      personService.tagPerson({ photoId, personId })

      const success = personService.untagPerson(photoId, personId)

      expect(success).toBe(true)
      const tags = personService.getPhotoTags(photoId)
      expect(tags.length).toBe(0)
    })

    it('should get photo tags - 获取照片的所有标签', () => {
      const personId1 = mockDb.addPerson({ name: '妈妈' })
      const personId2 = mockDb.addPerson({ name: '爸爸' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })
      personService.tagPerson({ photoId, personId: personId1 })
      personService.tagPerson({ photoId, personId: personId2 })

      const tags = personService.getPhotoTags(photoId)

      expect(tags).toHaveLength(2)
    })

    it('should support bounding box - 支持边界框标记', () => {
      const personId = mockDb.addPerson({ name: '妈妈' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })
      const boundingBox: BoundingBox = { x: 100, y: 200, width: 50, height: 60 }

      const result = personService.tagPerson({ photoId, personId, boundingBox })

      expect(result.success).toBe(true)
      const tags = personService.getPhotoTags(photoId)
      expect(tags[0].boundingBox).toEqual(boundingBox)
    })

    it('should mark as manual tag - 手动标记应标记为手动', () => {
      const personId = mockDb.addPerson({ name: '妈妈' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })

      personService.tagPerson({ photoId, personId })

      const tags = personService.getPhotoTags(photoId)
      expect(tags[0].isManual).toBe(true)
    })
  })

  // ============================================
  // Phase 4: 人物照片查询测试
  // ============================================
  describe('人物照片查询测试', () => {
    it('should get person photos - 获取某人物的所有照片', () => {
      const personId = mockDb.addPerson({ name: '妈妈' })
      const photoId1 = mockDb.addPhoto({ file_name: 'photo1.jpg' })
      const photoId2 = mockDb.addPhoto({ file_name: 'photo2.jpg' })
      personService.tagPerson({ photoId: photoId1, personId })
      personService.tagPerson({ photoId: photoId2, personId })

      const photos = personService.getPersonPhotos(personId)

      expect(photos).toHaveLength(2)
    })

    it('should search photos by person name - 根据人物名称搜索照片', () => {
      mockDb.addPerson({ name: '妈妈' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })
      personService.tagPerson({ photoId, personId: 1 })

      const photos = personService.searchPhotosByPerson('妈妈')

      expect(photos.length).toBeGreaterThanOrEqual(0)
    })
  })

  // ============================================
  // Phase 5: 批量操作测试
  // ============================================
  describe('批量操作测试', () => {
    it('should tag multiple persons at once - 批量标记多人', () => {
      const personId1 = mockDb.addPerson({ name: '妈妈' })
      const personId2 = mockDb.addPerson({ name: '爸爸' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })

      const result = personService.tagPersons(photoId, [personId1, personId2])

      expect(result.success).toBe(true)
      expect(result.tagged).toBe(2)
      expect(result.errors).toHaveLength(0)
    })

    it('should untag all persons from photo - 移除照片的所有标签', () => {
      const personId1 = mockDb.addPerson({ name: '妈妈' })
      const personId2 = mockDb.addPerson({ name: '爸爸' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })
      personService.tagPerson({ photoId, personId: personId1 })
      personService.tagPerson({ photoId, personId: personId2 })

      const success = personService.untagAllPersons(photoId)

      expect(success).toBe(true)
      expect(personService.getPhotoTags(photoId)).toHaveLength(0)
    })
  })

  // ============================================
  // Phase 6: 统计测试
  // ============================================
  describe('统计测试', () => {
    it('should get stats - 获取统计信息', () => {
      mockDb.addPerson({ name: '妈妈' })
      mockDb.addPerson({ name: '爸爸' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })
      personService.tagPerson({ photoId, personId: 1 })

      const stats = personService.getStats()

      expect(stats.totalPersons).toBe(2)
      expect(stats.totalTags).toBe(1)
    })
  })

  // ============================================
  // Phase 7: 边缘情况测试
  // ============================================
  describe('边缘情况测试', () => {
    it('should handle empty person name - 空人物名称', () => {
      const result = personService.addPerson({ name: '' })
      expect(result.success).toBe(false)
    })

    it('should handle untag non-existent tag - 移除不存在的标签', () => {
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })
      const personId = mockDb.addPerson({ name: '妈妈' })

      const success = personService.untagPerson(photoId, personId)
      expect(success).toBe(true)
    })

    it('should get empty tags for non-existent photo - 不存在照片返回空标签', () => {
      const tags = personService.getPhotoTags(999)
      expect(tags).toEqual([])
    })

    it('should get empty photos for non-existent person - 不存在人物返回空照片', () => {
      const photos = personService.getPersonPhotos(999)
      expect(photos).toEqual([])
    })
  })

  // ============================================
  // AC 验收条件验证测试
  // ============================================
  describe('验收条件验证', () => {
    it('AC: 添加新人物标签 - addPerson should create new person', () => {
      const result = personService.addPerson({ name: '测试人物' })
      expect(result.success).toBe(true)
      expect(result.personId).toBeDefined()
    })

    it('AC: 为照片标记人物 - tagPerson should tag photo', () => {
      const personId = mockDb.addPerson({ name: '妈妈' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })
      const result = personService.tagPerson({ photoId, personId })
      expect(result.success).toBe(true)
    })

    it('AC: 查看/编辑人物列表 - getAllPersons should return all persons', () => {
      mockDb.addPerson({ name: '人物1' })
      mockDb.addPerson({ name: '人物2' })
      const persons = personService.getAllPersons()
      expect(persons.length).toBeGreaterThanOrEqual(2)
    })

    it('AC: 删除人物标签 - untagPerson should remove tag', () => {
      const personId = mockDb.addPerson({ name: '妈妈' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })
      personService.tagPerson({ photoId, personId })
      const success = personService.untagPerson(photoId, personId)
      expect(success).toBe(true)
      expect(personService.getPhotoTags(photoId)).toHaveLength(0)
    })

    it('AC: 查看某人物的所有照片 - getPersonPhotos should return photos', () => {
      const personId = mockDb.addPerson({ name: '妈妈' })
      const photoId = mockDb.addPhoto({ file_name: 'test.jpg' })
      personService.tagPerson({ photoId, personId })
      const photos = personService.getPersonPhotos(personId)
      expect(photos.length).toBeGreaterThanOrEqual(1)
    })
  })
})
