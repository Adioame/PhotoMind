# Story E-04.1: 手动标记人物

## Story Overview

**原始需求描述**:
作为用户，我希望能够在照片上标记人物，为照片添加人物标签，这样我可以通过人物名称搜索相关照片。

**描述**:
用户提供手动标记人物的功能。用户可以选择照片中的人物，输入人物姓名，系统将建立照片与人物的关联关系。

## Acceptance Criteria

### 功能性需求
- [ ] 支持查看照片并标记人物
- [ ] 支持搜索现有人物
- [ ] 支持创建新人物
- [ ] 支持为人物添加头像（可选）
- [ ] 支持标记同一照片中的多个人物
- [ ] 标记后立即可搜索
- [ ] 支持编辑和删除标记
- [ ] 显示照片中已标记的人物列表

### 非功能性需求
- [ ] 标记操作响应时间 < 100ms
- [ ] 支持 100+ 人物标记
- [ ] 标记数据持久化

## Implementation Steps

### Phase 1: 数据库扩展

**文件**: `electron/database/db.ts`

```typescript
// 人物表
await db.exec(`
  CREATE TABLE IF NOT EXISTS persons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

// 照片-人物关联表
await db.exec(`
  CREATE TABLE IF NOT EXISTS photo_persons (
    photo_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (photo_id, person_id),
    FOREIGN KEY (photo_id) REFERENCES photos(id),
    FOREIGN KEY (person_id) REFERENCES persons(id)
  )
`)

// 人物操作
async function createPerson(name: string, avatarPath?: string): Promise<Person>
async function getPerson(personId: string): Promise<Person | null>
async function updatePerson(personId: string, data: Partial<Person>): Promise<void>
async function deletePerson(personId: string): Promise<void>
async function searchPersons(query: string): Promise<Person[]>
async function getAllPersons(): Promise<Person[]>

// 照片-人物关联操作
async function addPersonToPhoto(photoId: string, personId: string): Promise<void>
async function removePersonFromPhoto(photoId: string, personId: string): Promise<void>
async function getPhotoPersons(photoId: string): Promise<Person[]>
async function getPersonPhotos(personId: string): Promise<Photo[]>
async function setPhotoPersons(photoId: string, personIds: string[]): Promise<void>
```

### Phase 2: 人物服务

**文件**: `electron/services/personService.ts`

```typescript
interface Person {
  id: string
  name: string
  avatarPath?: string
  photoCount: number
  createdAt: Date
  updatedAt: Date
}

class PersonService {
  async createPerson(name: string, avatarPath?: string): Promise<Person> {
    const id = crypto.randomUUID()

    await db.run(
      `INSERT INTO persons (id, name, avatar_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      name,
      avatarPath || null,
      new Date().toISOString(),
      new Date().toISOString()
    )

    return {
      id,
      name,
      avatarPath,
      photoCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  async addPersonToPhoto(photoId: string, personId: string): Promise<void> {
    // 检查人物是否存在
    const person = await db.getPerson(personId)
    if (!person) {
      throw new Error('Person not found')
    }

    // 检查照片是否存在
    const photo = await db.getPhotoById(photoId)
    if (!photo) {
      throw new Error('Photo not found')
    }

    // 添加关联
    await db.run(
      `INSERT OR IGNORE INTO photo_persons (photo_id, person_id, created_at)
       VALUES (?, ?, ?)`,
      photoId,
      personId,
      new Date().toISOString()
    )
  }

  async setPhotoPersons(photoId: string, personIds: string[]): Promise<void> {
    // 事务操作
    await db.exec('BEGIN TRANSACTION')

    try {
      // 删除现有关联
      await db.run('DELETE FROM photo_persons WHERE photo_id = ?', photoId)

      // 添加新关联
      for (const personId of personIds) {
        await this.addPersonToPhoto(photoId, personId)
      }

      await db.exec('COMMIT')
    } catch (error) {
      await db.exec('ROLLBACK')
      throw error
    }
  }

  async searchPersons(query: string): Promise<Person[]> {
    const persons = await db.all(
      `SELECT p.*,
        COUNT(pp.photo_id) as photo_count
       FROM persons p
       LEFT JOIN photo_persons pp ON p.id = pp.person_id
       WHERE p.name LIKE ?
       GROUP BY p.id
       ORDER BY p.name ASC`,
      `%${query}%`
    )

    return persons.map(this.mapRowToPerson)
  }

  async getPersonPhotos(personId: string): Promise<Photo[]> {
    const photos = await db.all(
      `SELECT p.* FROM photos p
       JOIN photo_persons pp ON p.id = pp.photo_id
       WHERE pp.person_id = ?
       ORDER BY p.date_taken DESC`,
      personId
    )

    return photos.map(this.mapRowToPhoto)
  }

  private mapRowToPerson(row: any): Person {
    return {
      id: row.id,
      name: row.name,
      avatarPath: row.avatar_path,
      photoCount: row.photo_count || 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}

export const personService = new PersonService()
```

### Phase 3: IPC 接口

**文件**: `electron/main/index.ts`

```typescript
// 人物管理
ipcMain.handle('persons:create', async (_, name: string, avatarPath?: string) => {
  return await personService.createPerson(name, avatarPath)
})

ipcMain.handle('persons:get', async (_, personId: string) => {
  return await personService.getPerson(personId)
})

ipcMain.handle('persons:search', async (_, query: string) => {
  return await personService.searchPersons(query)
})

ipcMain.handle('persons:get-all', async () => {
  return await personService.getAllPersons()
})

ipcMain.handle('persons:delete', async (_, personId: string) => {
  return await personService.deletePerson(personId)
})

// 照片-人物关联
ipcMain.handle('photos:add-person', async (_, photoId: string, personId: string) => {
  await personService.addPersonToPhoto(photoId, personId)
})

ipcMain.handle('photos:remove-person', async (_, photoId: string, personId: string) => {
  await personService.removePersonFromPhoto(photoId, personId)
})

ipcMain.handle('photos:get-persons', async (_, photoId: string) => {
  return await personService.getPhotoPersons(photoId)
})

ipcMain.handle('photos:set-persons', async (_, photoId: string, personIds: string[]) => {
  await personService.setPhotoPersons(photoId, personIds)
})

ipcMain.handle('persons:get-photos', async (_, personId: string) => {
  return await personService.getPersonPhotos(personId)
})
```

## File Changes Summary

| 操作 | 文件路径 |
|------|----------|
| 修改 | `electron/database/db.ts` |
| 新建 | `electron/services/personService.ts` |
| 修改 | `electron/main/index.ts` |

## Dependencies

### 内部依赖
- `electron/database/types.ts`

### 外部依赖
- 无新增外部依赖

## Testing Approach

### 单元测试
1. **人物 CRUD 测试**
   - 创建人物
   - 更新人物
   - 删除人物
   - 搜索人物

2. **关联测试**
   - 添加/移除关联
   - 设置关联列表
   - 批量操作

### 集成测试
1. **端到端测试**
   - 从创建人物到搜索的完整流程
   - 标记照片并搜索

## Acceptance Criteria Verification

| 验收条件 | 验证方法 |
|----------|----------|
| 支持标记人物 | 创建人物，添加到照片，验证关联存在 |
| 支持搜索人物 | 搜索 "张"，验证返回匹配人物 |
| 支持多人物标记 | 添加多个人物到同一照片 |
| 标记后立即可搜索 | 标记后立即搜索该人物，返回照片 |

## Risk Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 人物名称重复 | 低 | 不限制，允许同名人物 |
| 性能问题 | 中 | 添加数据库索引 |

## Related Stories

### 前置依赖
- 无

### 后续故事
- E-04.2: 人脸自动检测 - 自动检测未标记的人脸
- E-04.4: 人物搜索 - 支持按人物搜索照片

### 相关故事
- E-05.2: 搜索结果展示 - 展示人物标签
