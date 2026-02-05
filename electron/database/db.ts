/**
 * PhotoMind - SQLite 数据库
 * 使用 sql.js (纯 JavaScript 实现)
 */
import initSqlJs from 'sql.js'
import type { PhotoDatabase as SqlJsPhotoDatabase } from 'sql.js'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export class PhotoDatabase {
  private db: SqlJsPhotoDatabase | null = null
  private dbPath: string

  constructor() {
    this.dbPath = resolve(__dirname, '../../data/photo-mind.db')
  }

  async init() {
    try {
      // 确保目录存在
      const dir = resolve(__dirname, '../../data')
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      // 初始化 sql.js
      const SqlJs = await initSqlJs()

      // 兼容不同版本的 sql.js
      // 新版本使用 .default 或直接导出
      const SQL = SqlJs.default || SqlJs
      console.log('[Database] sql.js loaded, constructor:', typeof SQL.Database !== 'undefined' ? 'Database' : 'PhotoDatabase')

      // 加载已有数据库或创建新的
      if (existsSync(this.dbPath)) {
        const fileBuffer = readFileSync(this.dbPath)
        console.log('[Database] Loading existing DB, size:', fileBuffer.length)
        // 尝试不同的构造函数名称
        if (typeof SQL.Database === 'function') {
          this.db = new SQL.Database(fileBuffer)
        } else if (typeof SQL.PhotoDatabase === 'function') {
          this.db = new SQL.PhotoDatabase(fileBuffer)
        } else {
          throw new Error('Unknown sql.js database constructor')
        }
      } else {
        console.log('[Database] Creating new DB')
        if (typeof SQL.Database === 'function') {
          this.db = new SQL.Database()
        } else if (typeof SQL.PhotoDatabase === 'function') {
          this.db = new SQL.PhotoDatabase()
        } else {
          throw new Error('Unknown sql.js database constructor')
        }
      }

      // 验证数据库是否有数据
      const checkResult = this.db.exec('SELECT COUNT(*) as count FROM photos')
      console.log('[Database] Initial photo count:', checkResult[0]?.values[0]?.[0])

      this.createTables()
      console.log('[Database] Tables created/verified')
      this.save()
      console.log('[Database] DB saved')
    } catch (error) {
      console.error('数据库初始化失败:', error)
      // 创建内存数据库作为降级方案
      console.log('使用内存数据库作为降级方案')
      try {
        const SqlJs = await initSqlJs()
        const SQL = SqlJs.default || SqlJs
        this.db = new SQL.Database ? new SQL.Database() : new SQL.PhotoDatabase()
      } catch (e) {
        console.error('内存数据库也无法创建:', e)
      }
    }
  }

  private createTables() {
    if (!this.db) return

    // 照片表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        cloud_id TEXT,
        file_path TEXT,
        file_name TEXT,
        file_size INTEGER,
        width INTEGER,
        height INTEGER,
        taken_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        exif_data TEXT,
        location_data TEXT,
        thumbnail_path TEXT,
        status TEXT DEFAULT 'local'
      )
    `)

    // 人脸表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS faces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        photo_id INTEGER,
        person_id INTEGER,
        bounding_box TEXT,
        confidence REAL,
        is_manual INTEGER DEFAULT 0,
        FOREIGN KEY (photo_id) REFERENCES photos(id),
        FOREIGN KEY (person_id) REFERENCES persons(id)
      )
    `)

    // 人物表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        display_name TEXT,
        face_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_manual INTEGER DEFAULT 0
      )
    `)

    // 标签表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        type TEXT,
        confidence REAL,
        parent_id INTEGER
      )
    `)

    // 照片标签关联表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS photo_tags (
        photo_id INTEGER,
        tag_id INTEGER,
        confidence REAL,
        is_manual INTEGER DEFAULT 0,
        PRIMARY KEY (photo_id, tag_id),
        FOREIGN KEY (photo_id) REFERENCES photos(id),
        FOREIGN KEY (tag_id) REFERENCES tags(id)
      )
    `)

    // 向量表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS vectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        photo_id INTEGER,
        model_name TEXT,
        embedding BLOB,
        FOREIGN KEY (photo_id) REFERENCES photos(id)
      )
    `)

    // 相册表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        type TEXT,
        query_params TEXT,
        cover_photo_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 创建索引
    this.db.run('CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_photos_cloud_id ON photos(cloud_id)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_id)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_persons_name ON persons(name)')

    console.log('数据库表创建完成')
  }

  // 保存数据库到文件
  private save() {
    if (!this.db) return
    const data = this.db.export()
    const buffer = Buffer.from(data)
    writeFileSync(this.dbPath, buffer)
  }

  // 查询辅助方法
  public query(sql: string, params: any[] = []): any[] {
    if (!this.db) return []
    const stmt = this.db.prepare(sql)
    stmt.bind(params)

    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
  }

  // 执行（用于 INSERT/UPDATE/DELETE）
  run(sql: string, params: any[] = []) {
    if (!this.db) return { lastInsertRowid: -1 }
    try {
      this.db.run(sql, params)
      this.save()
      // 获取 lastInsertRowid
      const result = this.db.exec('SELECT last_insert_rowid()')
      const lastId = result[0]?.values[0]?.[0] || 0
      return { lastInsertRowid: lastId }
    } catch (error) {
      console.error(`[Database] SQL执行失败: ${sql}`, error)
      return { lastInsertRowid: -1 }
    }
  }

  // 照片操作
  addPhoto(photo: any): number {
    // 确保所有值都不是 undefined
    const safePhoto = {
      uuid: photo.uuid || this.generateUUID(),
      cloudId: photo.cloudId || null,
      filePath: photo.filePath || null,
      fileName: photo.fileName || null,
      fileSize: photo.fileSize || 0,
      width: photo.width || null,
      height: photo.height || null,
      takenAt: photo.takenAt || new Date().toISOString(),
      exif: photo.exif || {},
      location: photo.location || {},
      status: photo.status || 'local'
    }

    try {
      this.run(
        `INSERT OR REPLACE INTO photos (uuid, cloud_id, file_path, file_name, file_size, width, height, taken_at, exif_data, location_data, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          safePhoto.uuid,
          safePhoto.cloudId,
          safePhoto.filePath,
          safePhoto.fileName,
          safePhoto.fileSize,
          safePhoto.width,
          safePhoto.height,
          safePhoto.takenAt,
          JSON.stringify(safePhoto.exif),
          JSON.stringify(safePhoto.location),
          safePhoto.status
        ]
      )
      // INSERT OR REPLACE 会删除旧记录并插入新记录
      // 返回最后插入的 rowid（对于 REPLACE 可能是被删除记录的 id）
      const countResult = this.query('SELECT COUNT(*) as count FROM photos', [])
      console.log(`[Database] 添加照片成功: ${safePhoto.fileName}, 当前总数: ${countResult[0]?.count}`)
      return 1 // 只要执行成功就返回成功
    } catch (error) {
      console.error(`[Database] 添加照片失败: ${safePhoto.fileName}`, error)
      return -1
    }
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  updatePhoto(photo: any): boolean {
    try {
      this.run(
        `UPDATE photos SET
          file_name = ?,
          file_size = ?,
          width = ?,
          height = ?,
          taken_at = ?,
          exif_data = ?,
          location_data = ?,
          status = ?
        WHERE uuid = ?`,
        [
          photo.fileName,
          photo.fileSize,
          photo.width || null,
          photo.height || null,
          photo.takenAt,
          JSON.stringify(photo.exif || {}),
          JSON.stringify(photo.location || {}),
          photo.status || 'local',
          photo.uuid
        ]
      )
      return true
    } catch (error) {
      console.error('更新照片失败:', error)
      return false
    }
  }

  deletePhoto(uuid: string): boolean {
    try {
      this.run('DELETE FROM photos WHERE uuid = ?', [uuid])
      return true
    } catch (error) {
      console.error('删除照片失败:', error)
      return false
    }
  }

  getPhotoByUuid(uuid: string): any {
    const rows = this.query('SELECT * FROM photos WHERE uuid = ?', [uuid])
    if (rows.length === 0) return null

    const row = rows[0]
    row.exif_data = row.exif_data ? JSON.parse(row.exif_data) : {}
    row.location_data = row.location_data ? JSON.parse(row.location_data) : {}
    return row
  }

  getPhotosByYear(year: number): any[] {
    const rows = this.query(
      `SELECT * FROM photos WHERE strftime('%Y', taken_at) = ? ORDER BY taken_at DESC`,
      [year.toString()]
    )
    return rows.map(row => ({
      ...row,
      exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
      location_data: row.location_data ? JSON.parse(row.location_data) : {}
    }))
  }

  getAllPhotos(limit: number = 100, offset: number = 0): any[] {
    // 使用字符串拼接方式，避免 sql.js 参数绑定问题
    const sql = `SELECT * FROM photos ORDER BY taken_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    console.log(`[Database] 执行查询: ${sql}`)
    const rows = this.query(sql, [])
    console.log(`[Database] 查询结果: ${rows.length} 条记录`)
    return rows.map(row => ({
      ...row,
      exif_data: row.exif_data ? (typeof row.exif_data === 'string' ? JSON.parse(row.exif_data) : row.exif_data) : {},
      location_data: row.location_data ? (typeof row.location_data === 'string' ? JSON.parse(row.location_data) : row.location_data) : {}
    }))
  }

  // 获取照片总数
  getPhotoCount(): number {
    const rows = this.query('SELECT COUNT(*) as count FROM photos', [])
    console.log(`[Database] 照片总数: ${rows[0]?.count || 0}`)
    return rows[0]?.count || 0
  }

  // 人物操作
  addPerson(person: { name: string; displayName?: string }): number {
    const result = this.run(
      `INSERT OR IGNORE INTO persons (name, display_name) VALUES (?, ?)`,
      [person.name, person.displayName || person.name]
    )
    return result.lastInsertRowid
  }

  getAllPersons(): any[] {
    return this.query(`
      SELECT p.*, COUNT(f.id) as face_count
      FROM persons p
      LEFT JOIN faces f ON p.id = f.person_id
      GROUP BY p.id
      ORDER BY face_count DESC
    `)
  }

  getPersonById(id: number): any {
    const rows = this.query('SELECT * FROM persons WHERE id = ?', [id])
    return rows.length > 0 ? rows[0] : null
  }

  updatePerson(id: number, person: { name?: string; displayName?: string }): boolean {
    try {
      if (person.name) {
        this.run('UPDATE persons SET name = ? WHERE id = ?', [person.name, id])
      }
      if (person.displayName) {
        this.run('UPDATE persons SET display_name = ? WHERE id = ?', [person.displayName, id])
      }
      return true
    } catch (error) {
      console.error('更新人物失败:', error)
      return false
    }
  }

  // 人脸操作
  addFace(face: { photoId: number; personId?: number; boundingBox?: any; confidence?: number }): number {
    const result = this.run(
      `INSERT INTO faces (photo_id, person_id, bounding_box, confidence) VALUES (?, ?, ?, ?)`,
      [
        face.photoId,
        face.personId || null,
        face.boundingBox ? JSON.stringify(face.boundingBox) : null,
        face.confidence || 0
      ]
    )
    return result.lastInsertRowid
  }

  getFacesByPhoto(photoId: number): any[] {
    return this.query(`
      SELECT f.*, p.name as person_name
      FROM faces f
      LEFT JOIN persons p ON f.person_id = p.id
      WHERE f.photo_id = ?
    `, [photoId])
  }

  getPhotosByPerson(personId: number): any[] {
    const rows = this.query(`
      SELECT DISTINCT p.*
      FROM photos p
      JOIN faces f ON p.id = f.photo_id
      WHERE f.person_id = ?
      ORDER BY p.taken_at DESC
    `, [personId])
    return rows.map(row => ({
      ...row,
      exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
      location_data: row.location_data ? JSON.parse(row.location_data) : {}
    }))
  }

  /**
   * 根据人物名称搜索
   */
  searchPhotosByPerson(personName: string): any[] {
    const rows = this.query(`
      SELECT DISTINCT p.*
      FROM photos p
      JOIN faces f ON p.id = f.photo_id
      JOIN persons ps ON f.person_id = ps.id
      WHERE ps.name LIKE ? OR ps.display_name LIKE ?
      ORDER BY p.taken_at DESC
    `, [`%${personName}%`, `%${personName}%`])
    return rows.map(row => ({
      ...row,
      exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
      location_data: row.location_data ? JSON.parse(row.location_data) : {}
    }))
  }

  /**
   * 搜索人物
   */
  searchPersons(query: string): any[] {
    if (!query.trim()) {
      return this.getAllPersons()
    }
    return this.query(`
      SELECT p.*, COUNT(f.id) as face_count
      FROM persons p
      LEFT JOIN faces f ON p.id = f.person_id
      WHERE p.name LIKE ? OR p.display_name LIKE ?
      GROUP BY p.id
      ORDER BY face_count DESC
    `, [`%${query}%`, `%${query}%`])
  }

  // 标签操作
  addTag(tag: { name: string; type?: string; parentId?: number }): number {
    const result = this.run(
      `INSERT OR IGNORE INTO tags (name, type, parent_id) VALUES (?, ?, ?)`,
      [tag.name, tag.type || 'general', tag.parentId || null]
    )
    return result.lastInsertRowid
  }

  getAllTags(): any[] {
    return this.query('SELECT * FROM tags ORDER BY name')
  }

  getPhotosByTag(tagId: number): any[] {
    const rows = this.query(`
      SELECT DISTINCT p.*
      FROM photos p
      JOIN photo_tags pt ON p.id = pt.photo_id
      WHERE pt.tag_id = ?
      ORDER BY p.taken_at DESC
    `, [tagId])
    return rows.map(row => ({
      ...row,
      exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
      location_data: row.location_data ? JSON.parse(row.location_data) : {}
    }))
  }

  addPhotoTag(photoId: number, tagId: number, confidence?: number): number {
    const result = this.run(
      `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, confidence) VALUES (?, ?, ?)`,
      [photoId, tagId, confidence || 1.0]
    )
    return result.lastInsertRowid
  }

  // 向量操作
  addVector(vector: { photoId: number; modelName: string; embedding: number[] }): number {
    // 将 embedding 数组转换为 Blob
    const embeddingBuffer = Buffer.from(new Float32Array(vector.embedding).buffer)
    const result = this.run(
      `INSERT INTO vectors (photo_id, model_name, embedding) VALUES (?, ?, ?)`,
      [vector.photoId, vector.modelName, embeddingBuffer]
    )
    return result.lastInsertRowid
  }

  /**
   * 保存图片嵌入向量
   * @param photoUuid 照片 UUID
   * @param vector 嵌入向量
   * @param embeddingType 嵌入类型 (默认 'image')
   * @returns 是否成功
   */
  async saveEmbedding(
    photoUuid: string,
    vector: number[],
    embeddingType: string = 'image'
  ): Promise<boolean> {
    try {
      // 将向量转换为 Buffer (BLOB)
      const vectorBuffer = Buffer.from(new Float32Array(vector).buffer)

      this.run(
        `INSERT OR REPLACE INTO vectors (photo_uuid, embedding, embedding_type, created_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [photoUuid, vectorBuffer, embeddingType]
      )

      console.log(`[Database] Saved ${embeddingType} embedding for photo: ${photoUuid}`)
      return true
    } catch (error) {
      console.error('[Database] Failed to save embedding:', error)
      return false
    }
  }

  /**
   * 批量保存嵌入向量
   * @param embeddings [{ photoUuid, vector, embeddingType }]
   * @returns 成功数量
   */
  async saveEmbeddingsBatch(
    embeddings: Array<{ photoUuid: string; vector: number[]; embeddingType?: string }>
  ): Promise<number> {
    let successCount = 0

    try {
      for (const { photoUuid, vector, embeddingType } of embeddings) {
        const success = await this.saveEmbedding(photoUuid, vector, embeddingType)
        if (success) successCount++
      }
      console.log(`[Database] Batch saved ${successCount}/${embeddings.length} embeddings`)
      return successCount
    } catch (error) {
      console.error('[Database] Batch save failed:', error)
      return successCount
    }
  }

  /**
   * 获取单个照片的嵌入向量
   * @param photoUuid 照片 UUID
   * @param embeddingType 嵌入类型
   * @returns 嵌入向量或 null
   */
  async getEmbedding(
    photoUuid: string,
    embeddingType: string = 'image'
  ): Promise<number[] | null> {
    try {
      const result = this.query(
        `SELECT embedding FROM vectors WHERE photo_uuid = ? AND embedding_type = ?`,
        [photoUuid, embeddingType]
      )

      if (result.length > 0 && result[0].embedding) {
        // BLOB 转 Float32Array 再转数组
        const float32Array = new Float32Array(result[0].embedding)
        return Array.from(float32Array)
      }

      return null
    } catch (error) {
      console.error('[Database] Failed to get embedding:', error)
      return null
    }
  }

  /**
   * 获取所有嵌入向量（用于全库搜索）
   * @param embeddingType 嵌入类型
   * @returns 照片 UUID 和向量列表
   */
  async getAllEmbeddings(
    embeddingType: string = 'image'
  ): Promise<Array<{ photoUuid: string; vector: number[] }>> {
    try {
      const results = this.query(
        `SELECT photo_uuid, embedding FROM vectors WHERE embedding_type = ?`,
        [embeddingType]
      )

      return results.map(result => ({
        photoUuid: result.photo_uuid,
        vector: Array.from(new Float32Array(result.embedding))
      }))
    } catch (error) {
      console.error('[Database] Failed to get all embeddings:', error)
      return []
    }
  }

  /**
   * 检查照片是否有嵌入向量
   * @param photoUuid 照片 UUID
   * @param embeddingType 嵌入类型
   * @returns 是否有嵌入
   */
  async hasEmbedding(
    photoUuid: string,
    embeddingType: string = 'image'
  ): Promise<boolean> {
    try {
      const result = this.query(
        `SELECT 1 FROM vectors WHERE photo_uuid = ? AND embedding_type = ? LIMIT 1`,
        [photoUuid, embeddingType]
      )
      return result.length > 0
    } catch (error) {
      console.error('[Database] Failed to check embedding existence:', error)
      return false
    }
  }

  /**
   * 删除照片的嵌入向量
   * @param photoUuid 照片 UUID
   * @param embeddingType 嵌入类型
   * @returns 是否成功
   */
  async deleteEmbedding(
    photoUuid: string,
    embeddingType?: string
  ): Promise<boolean> {
    try {
      if (embeddingType) {
        this.run(
          `DELETE FROM vectors WHERE photo_uuid = ? AND embedding_type = ?`,
          [photoUuid, embeddingType]
        )
      } else {
        this.run(`DELETE FROM vectors WHERE photo_uuid = ?`, [photoUuid])
      }
      return true
    } catch (error) {
      console.error('[Database] Failed to delete embedding:', error)
      return false
    }
  }

  /**
   * 获取嵌入统计信息
   * @returns 统计对象
   */
  async getEmbeddingStats(): Promise<{
    totalEmbeddings: number
    typeBreakdown: Record<string, number>
  }> {
    try {
      const totalResult = this.query(`SELECT COUNT(*) as count FROM vectors`)
      const typeResults = this.query(
        `SELECT embedding_type, COUNT(*) as count FROM vectors GROUP BY embedding_type`
      )

      return {
        totalEmbeddings: totalResult[0]?.count || 0,
        typeBreakdown: Object.fromEntries(
          typeResults.map((r: any) => [r.embedding_type, r.count])
        )
      }
    } catch (error) {
      console.error('[Database] Failed to get embedding stats:', error)
      return { totalEmbeddings: 0, typeBreakdown: {} }
    }
  }

  /**
   * 获取没有嵌入向量的照片
   * @param limit 限制数量
   * @returns 照片列表
   */
  getPhotosWithoutEmbeddings(limit: number = 100): any[] {
    const photos = this.getAllPhotos(limit * 2, 0)
    return photos.filter(p => {
      const vectors = this.getVectorByPhoto(p.id)
      return !vectors || vectors.length === 0
    }).slice(0, limit)
  }

  getVectorByPhoto(photoId: number): any[] {
    return this.query('SELECT * FROM vectors WHERE photo_id = ?', [photoId])
  }

  // 相册操作
  addAlbum(album: { name: string; type?: string; queryParams?: any; coverPhotoId?: number }): number {
    const result = this.run(
      `INSERT INTO albums (name, type, query_params, cover_photo_id) VALUES (?, ?, ?, ?)`,
      [album.name, album.type || 'manual', album.queryParams ? JSON.stringify(album.queryParams) : null, album.coverPhotoId || null]
    )
    return result.lastInsertRowid
  }

  getAllAlbums(): any[] {
    return this.query('SELECT * FROM albums ORDER BY updated_at DESC')
  }

  getAlbumById(id: number): any {
    const rows = this.query('SELECT * FROM albums WHERE id = ?', [id])
    if (rows.length === 0) return null
    const album = rows[0]
    if (album.query_params) {
      album.query_params = JSON.parse(album.query_params)
    }
    return album
  }

  updateAlbum(id: number, album: { name?: string; queryParams?: any; coverPhotoId?: number }): boolean {
    try {
      if (album.name) {
        this.run('UPDATE albums SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [album.name, id])
      }
      if (album.queryParams) {
        this.run('UPDATE albums SET query_params = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(album.queryParams), id])
      }
      if (album.coverPhotoId) {
        this.run('UPDATE albums SET cover_photo_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [album.coverPhotoId, id])
      }
      return true
    } catch (error) {
      console.error('更新相册失败:', error)
      return false
    }
  }

  deleteAlbum(id: number): boolean {
    try {
      this.run('DELETE FROM albums WHERE id = ?', [id])
      return true
    } catch (error) {
      console.error('删除相册失败:', error)
      return false
    }
  }

  // 统计查询
  getPhotoCountByYear(): any[] {
    return this.query(`
      SELECT strftime('%Y', taken_at) as year, COUNT(*) as count
      FROM photos
      WHERE taken_at IS NOT NULL
      GROUP BY strftime('%Y', taken_at)
      ORDER BY year DESC
    `)
  }

  getStats(): any {
    const photoCount = this.query('SELECT COUNT(*) as count FROM photos')[0]?.count || 0
    const personCount = this.query('SELECT COUNT(*) as count FROM persons')[0]?.count || 0
    const albumCount = this.query('SELECT COUNT(*) as count FROM albums')[0]?.count || 0
    const tagCount = this.query('SELECT COUNT(*) as count FROM tags')[0]?.count || 0

    return {
      photoCount,
      personCount,
      albumCount,
      tagCount
    }
  }

  // 地点操作
  getAllPlaces(): any[] {
    // 先获取所有有地点的照片
    const rows = this.query(`
      SELECT id, location_data
      FROM photos
      WHERE location_data IS NOT NULL
        AND location_data != ''
        AND location_data != 'null'
    `)

    // 在应用层解析 JSON 并分组
    const placeMap = new Map<string, number>()

    for (const row of rows) {
      try {
        if (row.location_data) {
          const location = JSON.parse(row.location_data)
          // 优先使用 name 字段，如果没有则使用坐标
          const placeName = location.name || `位置 ${location.latitude?.toFixed(2) || '?'},${location.longitude?.toFixed(2) || '?'}`
          placeMap.set(placeName, (placeMap.get(placeName) || 0) + 1)
        }
      } catch (e) {
        // JSON 解析失败，尝试从原始字符串提取
        const placeName = row.location_data?.substring(0, 50) || '未知地点'
        placeMap.set(placeName, (placeMap.get(placeName) || 0) + 1)
      }
    }

    // 转换为数组并排序
    return Array.from(placeMap.entries())
      .map(([place_name, photo_count]) => ({ place_name, photo_count }))
      .sort((a, b) => b.photo_count - a.photo_count)
  }

  // 搜索
  searchPhotos(query: string, filters?: any): any[] {
    let sql = 'SELECT * FROM photos WHERE 1=1'
    const params: any[] = []

    // 按年份筛选
    if (filters?.year) {
      sql += ' AND strftime("%Y", taken_at) = ?'
      params.push(filters.year.toString())
    }

    // 按季节筛选
    if (filters?.season) {
      const monthMap: Record<string, string[]> = {
        '春天': ['03', '04', '05'],
        '夏天': ['06', '07', '08'],
        '秋天': ['09', '10', '11'],
        '冬天': ['12', '01', '02']
      }
      const months = monthMap[filters.season]
      if (months) {
        sql += ` AND strftime("%m", taken_at) IN (${months.map(() => '?').join(',')})`
        params.push(...months)
      }
    }

    // 按地点关键词筛选
    if (filters?.location?.keywords?.length) {
      const conditions = filters.location.keywords.map((_: string) => {
        return '(location_data LIKE ? OR location_data LIKE ?)'
      })
      sql += ' AND (' + conditions.join(' OR ') + ')'
      for (const keyword of filters.location.keywords) {
        params.push(`%"${keyword}"%`, `%${keyword}%`)
      }
    }

    // 按人物筛选（通过 faces 表关联 persons）
    if (filters?.people?.length && filters.people.length > 0) {
      // 简化处理：搜索人物名称匹配（实际需要通过 faces 表关联）
      // 目前 persons 表是空的，后续实现人脸识别后再完善
    }

    sql += ' ORDER BY taken_at DESC LIMIT 50'

    const rows = this.query(sql, params)
    return rows.map(row => ({
      ...row,
      exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
      location_data: row.location_data ? JSON.parse(row.location_data) : {}
    }))
  }

  close() {
    if (this.db) {
      this.save()
      this.db.close()
      this.db = null
    }
  }
}
