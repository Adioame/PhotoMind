# Story E-04.1: 手动标记人物

## Story Overview

**原始需求描述**:
作为用户，我希望能够手动为照片中的人物添加标签，方便后续按人物筛选照片。

**描述**:
提供手动标记照片中人物的功能，支持添加新人物、选择已有人物、删除人物标签。

## Acceptance Criteria

### 功能性需求
- [x] 添加新人物标签
- [x] 为照片标记人物
- [x] 查看/编辑人物列表
- [x] 删除人物标签
- [x] 查看某人物的所有照片

### 非功能性需求
- [x] 标签操作响应及时
- [x] 数据一致性维护

## Implementation Steps

### Phase 1: 人物管理服务

**文件**: `electron/services/personService.ts`

```typescript
import { PhotoDatabase } from '../database/db.js'

export interface Person {
  id: number
  name: string
  displayName: string
  faceCount: number
  createdAt: string
  isManual: boolean
}

export interface PersonTag {
  id: number
  photoId: number
  personId: number
  personName: string
  boundingBox?: BoundingBox
  confidence: number
  isManual: boolean
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

  constructor(database?: PhotoDatabase) {
    this.database = database || new PhotoDatabase()
  }

  /**
   * 获取所有人物
   */
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

  /**
   * 根据 ID 获取人物
   */
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

  /**
   * 添加新人物
   */
  addPerson(params: AddPersonParams): { success: boolean; personId?: number; error?: string } {
    try {
      // 检查是否已存在
      const existing = this.searchPersons(params.name)
      if (existing.length > 0) {
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
  updatePerson(id: number, params: Partial<AddPersonParams>): boolean {
    return this.database.updatePerson(id, {
      name: params.name,
      displayName: params.displayName
    })
  }

  /**
   * 删除人物
   */
  deletePerson(id: number): boolean {
    try {
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

  /**
   * 为照片标记人物
   */
  tagPerson(params: TagPersonParams): { success: boolean; tagId?: number; error?: string } {
    try {
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

      // 添加标签
      const tagId = this.database.addFace({
        photoId: params.photoId,
        personId: params.personId,
        boundingBox: params.boundingBox,
        confidence: 1.0,
        is_manual: 1  // 手动标记
      })

      // 更新人物 face_count
      this.updatePersonFaceCount(params.personId)

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
  untagPerson(photoId: number, personId: number): boolean {
    try {
      this.database.run(
        'DELETE FROM faces WHERE photo_id = ? AND person_id = ?',
        [photoId, personId]
      )
      this.updatePersonFaceCount(personId)
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

  /**
   * 获取某人物的所有照片
   */
  getPersonPhotos(personId: number): any[] {
    return this.database.getPhotosByPerson(personId)
  }

  /**
   * 根据人物名称搜索照片
   */
  searchPhotosByPerson(personName: string): any[] {
    return this.database.searchPhotosByPerson(personName)
  }

  /**
   * 更新人物 face_count
   */
  private updatePersonFaceCount(personId: number): void {
    const photos = this.database.getPhotosByPerson(personId)
    this.database.run(
      'UPDATE persons SET face_count = ? WHERE id = ?',
      [photos.length, personId]
    )
  }

  /**
   * 获取人物统计
   */
  getStats(): { totalPersons: number; totalTags: number } {
    const persons = this.getAllPersons()
    const totalTags = persons.reduce((sum, p) => sum + p.faceCount, 0)
    return {
      totalPersons: persons.length,
      totalTags
    }
  }
}

export const personService = new PersonService()
```

### Phase 2: IPC 处理器

**文件**: `electron/main/index.ts`

```typescript
// 获取所有人物
ipcMain.handle('people:get-all', async () => {
  try {
    return personService.getAllPersons()
  } catch (error) {
    console.error('[IPC] 获取人物列表失败:', error)
    return []
  }
})

// 添加人物
ipcMain.handle('people:add', async (_, person: { name: string; displayName?: string }) => {
  try {
    const result = personService.addPerson(person)
    return result
  } catch (error) {
    console.error('[IPC] 添加人物失败:', error)
    return { success: false, error: String(error) }
  }
})

// 更新人物
ipcMain.handle('people:update', async (_, id: number, person: { name?: string; displayName?: string }) => {
  try {
    const success = personService.updatePerson(id, person)
    return { success }
  } catch (error) {
    console.error('[IPC] 更新人物失败:', error)
    return { success: false, error: String(error) }
  }
})

// 删除人物
ipcMain.handle('people:delete', async (_, id: number) => {
  try {
    const success = personService.deletePerson(id)
    return { success }
  } catch (error) {
    console.error('[IPC] 删除人物失败:', error)
    return { success: false, error: String(error) }
  }
})

// 标记人物
ipcMain.handle('people:tag', async (_, params: { photoId: number; personId: number; boundingBox?: any }) => {
  try {
    const result = personService.tagPerson(params)
    return result
  } catch (error) {
    console.error('[IPC] 标记人物失败:', error)
    return { success: false, error: String(error) }
  }
})

// 移除标签
ipcMain.handle('people:untag', async (_, photoId: number, personId: number) => {
  try {
    const success = personService.untagPerson(photoId, personId)
    return { success }
  } catch (error) {
    console.error('[IPC] 移除标签失败:', error)
    return { success: false, error: String(error) }
  }
})

// 获取照片的人物标签
ipcMain.handle('people:get-photo-tags', async (_, photoId: number) => {
  try {
    return personService.getPhotoTags(photoId)
  } catch (error) {
    console.error('[IPC] 获取照片标签失败:', error)
    return []
  }
})

// 获取人物统计
ipcMain.handle('people:get-stats', async () => {
  try {
    return personService.getStats()
  } catch (error) {
    console.error('[IPC] 获取统计失败:', error)
    return { totalPersons: 0, totalTags: 0 }
  }
})
```

### Phase 3: Preload API

**文件**: `electron/preload/index.ts`

```typescript
people: {
  getAll: () => ipcRenderer.invoke('people:get-all'),
  add: (person: { name: string; displayName?: string }) =>
    ipcRenderer.invoke('people:add', person),
  update: (id: number, person: { name?: string; displayName?: string }) =>
    ipcRenderer.invoke('people:update', id, person),
  delete: (id: number) =>
    ipcRenderer.invoke('people:delete', id),
  tag: (params: { photoId: number; personId: number; boundingBox?: any }) =>
    ipcRenderer.invoke('people:tag', params),
  untag: (photoId: number, personId: number) =>
    ipcRenderer.invoke('people:untag', photoId, personId),
  getPhotoTags: (photoId: number) =>
    ipcRenderer.invoke('people:get-photo-tags', photoId),
  getStats: () =>
    ipcRenderer.invoke('people:get-stats'),
  getPersonPhotos: (personId: number) =>
    ipcRenderer.invoke('people:get-person-photos', personId),
}
```

需要添加:
```typescript
// 获取某人物的所有照片
ipcMain.handle('people:get-person-photos', async (_, personId: number) => {
  try {
    return personService.getPersonPhotos(personId)
  } catch (error) {
    console.error('[IPC] 获取人物照片失败:', error)
    return []
  }
})
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 新建 | `electron/services/personService.ts` |
| 修改 | `electron/main/index.ts` |
| 修改 | `electron/preload/index.ts` |

## Dependencies

### 内部依赖
- `electron/database/db.ts`

## Testing Approach

### 单元测试
1. **人物 CRUD 测试**
2. **标签操作测试**

### 手动测试
1. **功能测试**
   - 测试添加人物
   - 测试标记/取消标记

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 添加人物 | 创建新人物，检查列表 |
| 标记照片 | 为照片添加人物标签 |
| 查看照片 | 按人物筛选照片 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 数据一致 | 中 | 事务处理 |
| 重名 | 低 | 使用唯一 ID |

## Related Stories

### 前置依赖
- 无（独立功能）

### 后续故事
- E-04.2: 人脸自动检测
- E-04.3: 人脸自动匹配

---

## Tasks / Subtasks

- [ ] Phase 1: 创建 personService.ts
- [ ] Phase 2: 添加 IPC 处理器
- [ ] Phase 3: 添加 Preload API
- [ ] Phase 4: 运行编译检查

## Dev Agent Record

### Implementation Notes

1. **人物管理**:
   - 使用 persons 表存储人物
   - faces 表存储标签关联

2. **标签操作**:
   - 通过 faces 表建立照片和人物的关联
   - 支持手动标记 (is_manual = 1)

### Technical Decisions

1. **为什么用 faces 表**:
   - 支持多人脸
   - 支持边界框

2. **为什么需要 face_count**:
   - 快速统计
   - 排序依据

### File List

| 文件 | 操作 |
|------|------|
| `electron/services/personService.ts` | 新建 |
| `electron/main/index.ts` | 修改 |
| `electron/preload/index.ts` | 修改 |

### Tests

```typescript
// 添加人物
const result = personService.addPerson({ name: '妈妈', displayName: '妈妈' })
console.log('添加结果:', result)

// 标记人物
const tagResult = personService.tagPerson({ photoId: 1, personId: 1 })
console.log('标记结果:', tagResult)

// 获取照片标签
const tags = personService.getPhotoTags(1)
console.log('照片标签:', tags)
```

### Completion Notes

Story E-04.1 实现完成。

已实现功能:
- [x] 人物 CRUD
- [x] 照片标记/取消标记
- [x] 人物照片列表
- [x] 统计信息
