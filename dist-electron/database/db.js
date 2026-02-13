/**
 * PhotoMind - SQLite 数据库
 * 使用 sql.js (纯 JavaScript 实现)
 */
import initSqlJs from 'sql.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from 'fs';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
// 🆕 支持传入自定义数据库路径（用于 Electron userData）
let customDbPath = null;
export function setDatabasePath(path) {
    customDbPath = path;
    console.log('[Database] 自定义路径已设置:', path);
}
export class PhotoDatabase {
    constructor() {
        this.db = null;
        this.isMemoryDb = false;
        // 🆕 优先使用自定义路径，否则使用默认路径
        this.dbPath = customDbPath || resolve(__dirname, '../../data/photo-mind.db');
        console.log('[Database] 数据库路径:', this.dbPath);
    }
    /**
     * 🆕 获取数据库诊断信息
     */
    getDiagnostics() {
        const exists = existsSync(this.dbPath);
        let size = 0;
        if (exists) {
            try {
                size = statSync(this.dbPath).size;
            }
            catch (e) {
                // ignore
            }
        }
        return {
            path: this.dbPath,
            exists,
            size,
            isMemoryDb: this.isMemoryDb,
            hasConnection: this.db !== null
        };
    }
    async init() {
        try {
            // 🆕 确保目录存在（使用数据库文件所在目录）
            const dir = resolve(this.dbPath, '..');
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
                console.log('[Database] 创建目录:', dir);
            }
            // 初始化 sql.js
            const SqlJs = await initSqlJs();
            // 兼容不同版本的 sql.js
            const SQL = SqlJs.default || SqlJs;
            console.log('[Database] sql.js loaded, constructor:', typeof SQL.Database !== 'undefined' ? 'Database' : 'PhotoDatabase');
            // 加载已有数据库或创建新的
            if (existsSync(this.dbPath)) {
                const fileBuffer = readFileSync(this.dbPath);
                console.log('[Database] Loading existing DB, size:', fileBuffer.length, 'path:', this.dbPath);
                if (typeof SQL.Database === 'function') {
                    this.db = new SQL.Database(fileBuffer);
                }
                else if (typeof SQL.PhotoDatabase === 'function') {
                    this.db = new SQL.PhotoDatabase(fileBuffer);
                }
                else {
                    throw new Error('Unknown sql.js database constructor');
                }
            }
            else {
                console.log('[Database] Creating new DB at:', this.dbPath);
                if (typeof SQL.Database === 'function') {
                    this.db = new SQL.Database();
                }
                else if (typeof SQL.PhotoDatabase === 'function') {
                    this.db = new SQL.PhotoDatabase();
                }
                else {
                    throw new Error('Unknown sql.js database constructor');
                }
            }
            this.isMemoryDb = false;
            // 先创建/验证表结构
            this.createTables();
            console.log('[Database] Tables created/verified');
            // 验证数据库是否有数据
            try {
                const checkResult = this.db.exec('SELECT COUNT(*) as count FROM photos');
                console.log('[Database] Initial photo count:', checkResult[0]?.values[0]?.[0]);
            }
            catch (e) {
                console.log('[Database] Could not query photo count (new database)');
            }
            this.save();
            console.log('[Database] DB saved');
        }
        catch (error) {
            console.error('数据库初始化失败:', error);
            // 创建内存数据库作为降级方案
            console.log('[Database] ⚠️ 使用内存数据库作为降级方案');
            try {
                const SqlJs = await initSqlJs();
                const SQL = SqlJs.default || SqlJs;
                this.db = new SQL.Database ? new SQL.Database() : new SQL.PhotoDatabase();
                this.isMemoryDb = true;
                this.createTables();
                console.log('[Database] Memory DB tables created');
            }
            catch (e) {
                console.error('内存数据库也无法创建:', e);
            }
        }
    }
    createTables() {
        if (!this.db)
            return;
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
        latitude REAL,
        longitude REAL,
        geohash TEXT,
        thumbnail_path TEXT,
        status TEXT DEFAULT 'local'
      )
    `);
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
    `);
        // 人物表
        this.db.run(`
      CREATE TABLE IF NOT EXISTS persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        display_name TEXT,
        face_count INTEGER DEFAULT 0,
        face_thumbnail TEXT,
        representative_photo_id INTEGER,
        thumbnail_manually_set INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_manual INTEGER DEFAULT 0,
        is_seed INTEGER DEFAULT 0,
        seed_created_at DATETIME,
        seed_confidence INTEGER DEFAULT 1
      )
    `);
        // 标签表
        this.db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        type TEXT,
        confidence REAL,
        parent_id INTEGER
      )
    `);
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
    `);
        // 向量表
        this.db.run(`
      CREATE TABLE IF NOT EXISTS vectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        photo_id INTEGER,
        model_name TEXT,
        embedding BLOB,
        FOREIGN KEY (photo_id) REFERENCES photos(id)
      )
    `);
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
    `);
        // 创建索引
        this.db.run('CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_photos_cloud_id ON photos(cloud_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_photos_location ON photos(latitude, longitude)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_photos_geohash ON photos(geohash)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_persons_name ON persons(name)');
        // 人脸检测结果表
        this.db.run(`
      CREATE TABLE IF NOT EXISTS detected_faces (
        id TEXT PRIMARY KEY,
        photo_id INTEGER NOT NULL,
        bbox_x REAL NOT NULL,
        bbox_y REAL NOT NULL,
        bbox_width REAL NOT NULL,
        bbox_height REAL NOT NULL,
        confidence REAL NOT NULL,
        person_id INTEGER,
        embedding BLOB,
        face_embedding BLOB,
        semantic_embedding BLOB,
        vector_version INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        processed INTEGER DEFAULT 0,
        FOREIGN KEY (photo_id) REFERENCES photos(id),
        FOREIGN KEY (person_id) REFERENCES persons(id)
      )
    `);
        // 检测结果索引
        this.db.run('CREATE INDEX IF NOT EXISTS idx_detected_faces_photo ON detected_faces(photo_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_detected_faces_processed ON detected_faces(processed)');
        // 扫描任务表
        this.db.run(`
      CREATE TABLE IF NOT EXISTS scan_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        total_photos INTEGER DEFAULT 0,
        processed_photos INTEGER DEFAULT 0,
        failed_photos INTEGER DEFAULT 0,
        last_processed_id INTEGER,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        last_heartbeat INTEGER,
        error_message TEXT
      )
    `);
        // 扫描任务索引
        this.db.run('CREATE INDEX IF NOT EXISTS idx_scan_jobs_status ON scan_jobs(status)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_scan_jobs_started_at ON scan_jobs(started_at)');
        // 执行迁移（添加新列）
        this.runMigrations();
        console.log('数据库表创建完成');
    }
    /**
     * 数据库迁移
     * 用于添加新列而无需删除现有数据
     */
    runMigrations() {
        if (!this.db)
            return;
        try {
            // 检查 detected_faces 表是否有 face_embedding 列
            const tableInfo = this.db.exec("PRAGMA table_info(detected_faces)");
            const columns = tableInfo[0]?.values.map((row) => row[1]) || [];
            // 迁移 v1: 添加 face_embedding 列
            if (!columns.includes('face_embedding')) {
                console.log('[Database] 迁移: 添加 face_embedding 列');
                this.db.run('ALTER TABLE detected_faces ADD COLUMN face_embedding BLOB');
            }
            // 迁移 v2: 添加 semantic_embedding 列
            if (!columns.includes('semantic_embedding')) {
                console.log('[Database] 迁移: 添加 semantic_embedding 列');
                this.db.run('ALTER TABLE detected_faces ADD COLUMN semantic_embedding BLOB');
            }
            // 迁移 v3: 添加 vector_version 列
            if (!columns.includes('vector_version')) {
                console.log('[Database] 迁移: 添加 vector_version 列');
                this.db.run('ALTER TABLE detected_faces ADD COLUMN vector_version INTEGER DEFAULT 0');
            }
            // 迁移 v4: 同步 persons.face_count 从 detected_faces 表
            console.log('[Database] 迁移: 同步 face_count');
            this.db.run(`
        UPDATE persons SET face_count = (
          SELECT COUNT(DISTINCT photo_id)
          FROM detected_faces
          WHERE person_id = persons.id
        )
      `);
            // 迁移 v6-v8: 添加种子人物相关字段 (E-11.1)
            const personsInfo = this.db.exec("PRAGMA table_info(persons)");
            const personColumns = personsInfo[0]?.values.map((row) => row[1]) || [];
            // 迁移 v6: 添加 is_seed 列
            if (!personColumns.includes('is_seed')) {
                console.log('[Database] 迁移: 添加 is_seed 列');
                this.db.run('ALTER TABLE persons ADD COLUMN is_seed INTEGER DEFAULT 0');
            }
            // 迁移 v7: 添加 seed_created_at 列
            if (!personColumns.includes('seed_created_at')) {
                console.log('[Database] 迁移: 添加 seed_created_at 列');
                this.db.run('ALTER TABLE persons ADD COLUMN seed_created_at DATETIME');
            }
            // 迁移 v8: 添加 seed_confidence 列
            if (!personColumns.includes('seed_confidence')) {
                console.log('[Database] 迁移: 添加 seed_confidence 列');
                this.db.run('ALTER TABLE persons ADD COLUMN seed_confidence INTEGER DEFAULT 1');
            }
            // 迁移 v9: 添加 face_thumbnail 列 (用于存储人物头像缩略图路径)
            if (!personColumns.includes('face_thumbnail')) {
                console.log('[Database] 迁移: 添加 face_thumbnail 列');
                this.db.run('ALTER TABLE persons ADD COLUMN face_thumbnail TEXT');
            }
            // 迁移 v10: 添加 representative_photo_id 列 (E-11.3: 智能缩略图选择)
            if (!personColumns.includes('representative_photo_id')) {
                console.log('[Database] 迁移: 添加 representative_photo_id 列');
                this.db.run('ALTER TABLE persons ADD COLUMN representative_photo_id INTEGER');
            }
            // 迁移 v11: 添加 thumbnail_manually_set 列 (E-11.3: 标记是否手动设置缩略图)
            if (!personColumns.includes('thumbnail_manually_set')) {
                console.log('[Database] 迁移: 添加 thumbnail_manually_set 列');
                this.db.run('ALTER TABLE persons ADD COLUMN thumbnail_manually_set INTEGER DEFAULT 0');
            }
            // 迁移 v12: 添加 confidence_score 列 (E-11.4: 聚类置信度分数)
            if (!personColumns.includes('confidence_score')) {
                console.log('[Database] 迁移: 添加 confidence_score 列');
                this.db.run('ALTER TABLE persons ADD COLUMN confidence_score REAL');
            }
            // 迁移 v13: 添加 confidence_level 列 (E-11.4: 置信度等级)
            if (!personColumns.includes('confidence_level')) {
                console.log('[Database] 迁移: 添加 confidence_level 列');
                this.db.run('ALTER TABLE persons ADD COLUMN confidence_level TEXT');
            }
            // 迁移 v14: 添加 face_bbox 列 (用于存储人脸边界框信息)
            if (!personColumns.includes('face_bbox')) {
                console.log('[Database] 迁移: 添加 face_bbox 列');
                this.db.run('ALTER TABLE persons ADD COLUMN face_bbox TEXT');
            }
            // 迁移 v5: 创建触发器自动维护 face_count（插入时）
            this.db.run(`
        CREATE TRIGGER IF NOT EXISTS trg_update_face_count_insert
        AFTER INSERT ON detected_faces
        WHEN NEW.person_id IS NOT NULL
        BEGIN
          UPDATE persons SET face_count = (
            SELECT COUNT(DISTINCT photo_id) FROM detected_faces WHERE person_id = NEW.person_id
          ) WHERE id = NEW.person_id;
        END
      `);
            // 迁移 v6: 创建触发器自动维护 face_count（更新 person_id 时）
            this.db.run(`
        CREATE TRIGGER IF NOT EXISTS trg_update_face_count_update
        AFTER UPDATE OF person_id ON detected_faces
        WHEN NEW.person_id IS NOT NULL OR OLD.person_id IS NOT NULL
        BEGIN
          UPDATE persons SET face_count = (
            SELECT COUNT(DISTINCT photo_id) FROM detected_faces WHERE person_id = NEW.person_id
          ) WHERE id = NEW.person_id;
          UPDATE persons SET face_count = (
            SELECT COUNT(DISTINCT photo_id) FROM detected_faces WHERE person_id = OLD.person_id
          ) WHERE id = OLD.person_id;
        END
      `);
            // 迁移 v7: 创建触发器自动维护 face_count（删除时）
            this.db.run(`
        CREATE TRIGGER IF NOT EXISTS trg_update_face_count_delete
        AFTER DELETE ON detected_faces
        WHEN OLD.person_id IS NOT NULL
        BEGIN
          UPDATE persons SET face_count = (
            SELECT COUNT(DISTINCT photo_id) FROM detected_faces WHERE person_id = OLD.person_id
          ) WHERE id = OLD.person_id;
        END
      `);
            console.log('[Database] 迁移完成');
        }
        catch (error) {
            console.error('[Database] 迁移失败:', error);
        }
    }
    // 保存数据库到文件
    save() {
        if (!this.db)
            return;
        const data = this.db.export();
        const buffer = Buffer.from(data);
        writeFileSync(this.dbPath, buffer);
    }
    // 查询辅助方法
    query(sql, params = []) {
        if (!this.db) {
            throw new Error('PhotoDatabase not initialized. Call init() first.');
        }
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }
    // 执行（用于 INSERT/UPDATE/DELETE）
    run(sql, params = []) {
        if (!this.db) {
            throw new Error('PhotoDatabase not initialized. Call init() first.');
        }
        try {
            this.db.run(sql, params);
            this.save();
            // 获取 lastInsertRowid
            const result = this.db.exec('SELECT last_insert_rowid()');
            const lastId = result[0]?.values[0]?.[0] || 0;
            return { lastInsertRowid: lastId };
        }
        catch (error) {
            console.error(`[Database] SQL执行失败: ${sql}`, error);
            return { lastInsertRowid: -1 };
        }
    }
    // E-08.2: 带重试机制的数据库操作（处理 SQLITE_BUSY）
    async runWithRetry(sql, params = [], maxRetries = 3, delayMs = 500) {
        if (!this.db) {
            throw new Error('PhotoDatabase not initialized. Call init() first.');
        }
        let attempts = 0;
        let lastError;
        while (attempts < maxRetries) {
            attempts++;
            try {
                this.db.run(sql, params);
                this.save();
                const result = this.db.exec('SELECT last_insert_rowid()');
                const lastId = result[0]?.values[0]?.[0] || 0;
                if (attempts > 1) {
                    console.log(`[Database] 重试成功 (${attempts}/${maxRetries}): ${sql.substring(0, 50)}...`);
                }
                return { lastInsertRowid: lastId, attempts };
            }
            catch (error) {
                lastError = error;
                const errorMessage = error?.message || String(error);
                // 检查是否是 SQLITE_BUSY 错误
                if (errorMessage.includes('BUSY') || errorMessage.includes('database is locked')) {
                    if (attempts < maxRetries) {
                        console.warn(`[Database] SQLITE_BUSY, 等待 ${delayMs}ms 后重试 (${attempts}/${maxRetries})...`);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                        continue;
                    }
                }
                // 非 BUSY 错误或已达到最大重试次数
                console.error(`[Database] SQL执行失败 (${attempts}/${maxRetries}): ${sql.substring(0, 100)}`, error);
                return { lastInsertRowid: -1, attempts };
            }
        }
        return { lastInsertRowid: -1, attempts };
    }
    // 照片操作
    addPhoto(photo) {
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
            status: photo.status || 'local',
            thumbnailPath: photo.thumbnailPath || null
        };
        try {
            this.run(`INSERT OR REPLACE INTO photos (uuid, cloud_id, file_path, file_name, file_size, width, height, taken_at, exif_data, location_data, status, thumbnail_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
                safePhoto.status,
                safePhoto.thumbnailPath
            ]);
            // INSERT OR REPLACE 会删除旧记录并插入新记录
            // 返回最后插入的 rowid（对于 REPLACE 可能是被删除记录的 id）
            const countResult = this.query('SELECT COUNT(*) as count FROM photos', []);
            console.log(`[Database] 添加照片成功: ${safePhoto.fileName}, 当前总数: ${countResult[0]?.count}`);
            return 1; // 只要执行成功就返回成功
        }
        catch (error) {
            console.error(`[Database] 添加照片失败: ${safePhoto.fileName}`, error);
            return -1;
        }
    }
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    updatePhoto(photo) {
        try {
            this.run(`UPDATE photos SET
          file_name = ?,
          file_size = ?,
          width = ?,
          height = ?,
          taken_at = ?,
          exif_data = ?,
          location_data = ?,
          status = ?
        WHERE uuid = ?`, [
                photo.fileName,
                photo.fileSize,
                photo.width || null,
                photo.height || null,
                photo.takenAt,
                JSON.stringify(photo.exif || {}),
                JSON.stringify(photo.location || {}),
                photo.status || 'local',
                photo.uuid
            ]);
            return true;
        }
        catch (error) {
            console.error('更新照片失败:', error);
            return false;
        }
    }
    deletePhoto(uuid) {
        try {
            this.run('DELETE FROM photos WHERE uuid = ?', [uuid]);
            return true;
        }
        catch (error) {
            console.error('删除照片失败:', error);
            return false;
        }
    }
    getPhotoByUuid(uuid) {
        const rows = this.query('SELECT * FROM photos WHERE uuid = ?', [uuid]);
        if (rows.length === 0)
            return null;
        const row = rows[0];
        row.exif_data = row.exif_data ? JSON.parse(row.exif_data) : {};
        row.location_data = row.location_data ? JSON.parse(row.location_data) : {};
        return row;
    }
    getPhotoById(id) {
        const rows = this.query('SELECT * FROM photos WHERE id = ?', [id]);
        if (rows.length === 0)
            return null;
        const row = rows[0];
        row.exif_data = row.exif_data ? JSON.parse(row.exif_data) : {};
        row.location_data = row.location_data ? JSON.parse(row.location_data) : {};
        return row;
    }
    getPhotoByFilePath(filePath) {
        const rows = this.query('SELECT * FROM photos WHERE file_path = ?', [filePath]);
        if (rows.length === 0)
            return null;
        const row = rows[0];
        row.exif_data = row.exif_data ? JSON.parse(row.exif_data) : {};
        row.location_data = row.location_data ? JSON.parse(row.location_data) : {};
        return row;
    }
    getPhotosByYear(year) {
        const rows = this.query(`SELECT * FROM photos WHERE strftime('%Y', taken_at) = ? ORDER BY taken_at DESC`, [year.toString()]);
        return rows.map(row => ({
            ...row,
            exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
            location_data: row.location_data ? JSON.parse(row.location_data) : {}
        }));
    }
    getAllPhotos(limit = 100, offset = 0) {
        // 使用字符串拼接方式，避免 sql.js 参数绑定问题
        const sql = `SELECT * FROM photos ORDER BY taken_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
        console.log(`[Database] 执行查询: ${sql}`);
        const rows = this.query(sql, []);
        console.log(`[Database] 查询结果: ${rows.length} 条记录`);
        return rows.map(row => ({
            ...row,
            exif_data: row.exif_data ? (typeof row.exif_data === 'string' ? JSON.parse(row.exif_data) : row.exif_data) : {},
            location_data: row.location_data ? (typeof row.location_data === 'string' ? JSON.parse(row.location_data) : row.location_data) : {}
        }));
    }
    // 获取照片总数
    getPhotoCount() {
        const rows = this.query('SELECT COUNT(*) as count FROM photos', []);
        console.log(`[Database] 照片总数: ${rows[0]?.count || 0}`);
        return rows[0]?.count || 0;
    }
    // 人物操作
    addPerson(person) {
        // First check if person already exists
        const existing = this.query('SELECT id FROM persons WHERE name = ?', [person.name]);
        if (existing.length > 0) {
            return existing[0].id;
        }
        // Insert new person
        const result = this.run(`INSERT INTO persons (name, display_name) VALUES (?, ?)`, [person.name, person.displayName || person.name]);
        if (result.lastInsertRowid <= 0) {
            // Fallback: query the id we just inserted
            const inserted = this.query('SELECT id FROM persons WHERE name = ?', [person.name]);
            if (inserted.length > 0) {
                return inserted[0].id;
            }
        }
        return result.lastInsertRowid;
    }
    getAllPersons() {
        return this.query(`
      SELECT p.*, COUNT(DISTINCT df.photo_id) as face_count
      FROM persons p
      LEFT JOIN detected_faces df ON p.id = df.person_id
      GROUP BY p.id
      ORDER BY face_count DESC
    `);
    }
    /**
     * 获取所有种子人物（按种子置信度降序）
     * E-11.1: 种子人物功能
     */
    getSeedPersons() {
        return this.query(`
      SELECT p.*, COUNT(DISTINCT df.photo_id) as face_count
      FROM persons p
      LEFT JOIN detected_faces df ON p.id = df.person_id
      WHERE p.is_seed = 1
      GROUP BY p.id
      ORDER BY p.seed_confidence DESC, p.seed_created_at DESC
    `);
    }
    /**
     * 标记人物为种子
     * E-11.1: 种子人物功能
     */
    markPersonAsSeed(personId) {
        try {
            this.run(`UPDATE persons SET is_seed = 1, seed_created_at = CURRENT_TIMESTAMP, seed_confidence = 1 WHERE id = ?`, [personId]);
            console.log(`[Database] 人物 ${personId} 已标记为种子`);
            return true;
        }
        catch (error) {
            console.error(`[Database] 标记人物 ${personId} 为种子失败:`, error);
            return false;
        }
    }
    /**
     * 取消人物种子标记
     * E-11.1: 种子人物功能
     */
    unmarkPersonAsSeed(personId) {
        try {
            this.run(`UPDATE persons SET is_seed = 0, seed_created_at = NULL, seed_confidence = 0 WHERE id = ?`, [personId]);
            console.log(`[Database] 人物 ${personId} 已取消种子标记`);
            return true;
        }
        catch (error) {
            console.error(`[Database] 取消人物 ${personId} 种子标记失败:`, error);
            return false;
        }
    }
    /**
     * 增加种子人物置信度
     * E-11.1: 当自动匹配成功时调用
     */
    incrementSeedConfidence(personId) {
        try {
            this.run(`UPDATE persons SET seed_confidence = seed_confidence + 1 WHERE id = ? AND is_seed = 1`, [personId]);
            return true;
        }
        catch (error) {
            console.error(`[Database] 增加人物 ${personId} 种子置信度失败:`, error);
            return false;
        }
    }
    getPersonById(id) {
        const rows = this.query('SELECT * FROM persons WHERE id = ?', [id]);
        return rows.length > 0 ? rows[0] : null;
    }
    /**
     * 根据名称查找人物（精确匹配）
     */
    findPersonByName(name) {
        const rows = this.query('SELECT * FROM persons WHERE name = ? OR display_name = ? LIMIT 1', [name, name]);
        return rows.length > 0 ? rows[0] : null;
    }
    updatePerson(id, person) {
        try {
            if (person.name) {
                this.run('UPDATE persons SET name = ? WHERE id = ?', [person.name, id]);
            }
            if (person.displayName) {
                this.run('UPDATE persons SET display_name = ? WHERE id = ?', [person.displayName, id]);
            }
            if (person.representativePhotoId !== undefined) {
                this.run('UPDATE persons SET representative_photo_id = ? WHERE id = ?', [person.representativePhotoId, id]);
            }
            if (person.thumbnailManuallySet !== undefined) {
                this.run('UPDATE persons SET thumbnail_manually_set = ? WHERE id = ?', [person.thumbnailManuallySet ? 1 : 0, id]);
            }
            return true;
        }
        catch (error) {
            console.error('更新人物失败:', error);
            return false;
        }
    }
    // 人脸操作
    addFace(face) {
        const result = this.run(`INSERT INTO faces (photo_id, person_id, bounding_box, confidence, is_manual) VALUES (?, ?, ?, ?, ?)`, [
            face.photoId,
            face.personId || null,
            face.boundingBox ? JSON.stringify(face.boundingBox) : null,
            face.confidence || 0,
            face.isManual ?? 0
        ]);
        return result.lastInsertRowid;
    }
    getFacesByPhoto(photoId) {
        return this.query(`
      SELECT df.*, p.name as person_name
      FROM detected_faces df
      LEFT JOIN persons p ON df.person_id = p.id
      WHERE df.photo_id = ?
    `, [photoId]);
    }
    getPhotosByPerson(personId, limit = 100) {
        // 🚨 修复：使用 detected_faces 表而不是 faces 表
        // faces 表是旧的手动标记表，detected_faces 是新的自动检测表
        const rows = this.query(`
      SELECT DISTINCT p.*
      FROM photos p
      JOIN detected_faces df ON p.id = df.photo_id
      WHERE df.person_id = ?
      ORDER BY p.taken_at DESC
      LIMIT ?
    `, [personId, limit]);
        return rows.map(row => ({
            ...row,
            exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
            location_data: row.location_data ? JSON.parse(row.location_data) : {}
        }));
    }
    /**
     * 根据人物名称搜索
     */
    searchPhotosByPerson(personName) {
        const rows = this.query(`
      SELECT DISTINCT p.*
      FROM photos p
      JOIN detected_faces df ON p.id = df.photo_id
      JOIN persons ps ON df.person_id = ps.id
      WHERE ps.name LIKE ? OR ps.display_name LIKE ?
      ORDER BY p.taken_at DESC
    `, [`%${personName}%`, `%${personName}%`]);
        return rows.map(row => ({
            ...row,
            exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
            location_data: row.location_data ? JSON.parse(row.location_data) : {}
        }));
    }
    // ============ 人脸检测结果操作 ============
    /**
     * 保存检测到的人脸
     * @param photoId 照片ID
     * @param faces 人脸检测结果数组
     */
    saveDetectedFaces(photoId, faces) {
        let savedCount = 0;
        // 先删除该照片的旧检测结果
        this.run('DELETE FROM detected_faces WHERE photo_id = ?', [photoId]);
        // 保存新检测结果
        for (const face of faces) {
            try {
                // 转换各种 embedding 为 Buffer
                const embeddingBuffer = face.embedding
                    ? Buffer.from(new Float32Array(face.embedding).buffer)
                    : null;
                const faceEmbeddingBuffer = face.face_embedding
                    ? Buffer.from(new Float32Array(face.face_embedding).buffer)
                    : null;
                const semanticEmbeddingBuffer = face.semantic_embedding
                    ? Buffer.from(new Float32Array(face.semantic_embedding).buffer)
                    : null;
                this.run(`INSERT INTO detected_faces (id, photo_id, bbox_x, bbox_y, bbox_width, bbox_height, confidence, embedding, face_embedding, semantic_embedding, vector_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    face.id,
                    photoId,
                    face.bbox_x,
                    face.bbox_y,
                    face.bbox_width,
                    face.bbox_height,
                    face.confidence,
                    embeddingBuffer,
                    faceEmbeddingBuffer,
                    semanticEmbeddingBuffer,
                    face.vector_version || 0,
                    new Date().toISOString()
                ]);
                savedCount++;
            }
            catch (error) {
                console.error('[Database] 保存检测人脸失败:', error);
            }
        }
        return savedCount;
    }
    /**
     * 获取照片的检测人脸
     * @param photoId 照片ID
     * @returns 检测到的人脸数组
     */
    getDetectedFaces(photoId) {
        const rows = this.query(`SELECT df.*, p.name as person_name
       FROM detected_faces df
       LEFT JOIN persons p ON df.person_id = p.id
       WHERE df.photo_id = ?
       ORDER BY df.confidence DESC`, [photoId]);
        return rows.map(row => {
            const face = {
                id: row.id,
                photo_id: row.photo_id,
                bbox_x: row.bbox_x,
                bbox_y: row.bbox_y,
                bbox_width: row.bbox_width,
                bbox_height: row.bbox_height,
                confidence: row.confidence,
                person_id: row.person_id,
                person_name: row.person_name,
                vector_version: row.vector_version,
                created_at: row.created_at
            };
            // 解析 embedding (兼容旧数据)
            if (row.embedding) {
                try {
                    face.embedding = Array.from(new Float32Array(row.embedding));
                }
                catch (e) {
                    face.embedding = null;
                }
            }
            // 解析 face_embedding (128维)
            if (row.face_embedding) {
                try {
                    face.face_embedding = Array.from(new Float32Array(row.face_embedding));
                }
                catch (e) {
                    face.face_embedding = null;
                }
            }
            // 解析 semantic_embedding (512维)
            if (row.semantic_embedding) {
                try {
                    face.semantic_embedding = Array.from(new Float32Array(row.semantic_embedding));
                }
                catch (e) {
                    face.semantic_embedding = null;
                }
            }
            return face;
        });
    }
    /**
     * 获取未处理检测的照片
     * @param limit 限制数量
     * @param afterId 可选，只返回id大于此值的照片（用于断点续传）
     * @returns 未处理检测的照片列表
     */
    getUnprocessedPhotos(limit = 100, afterId) {
        // 获取还没有检测结果的本地照片
        let sql = `SELECT p.id, p.uuid, p.file_path, p.file_name
       FROM photos p
       LEFT JOIN detected_faces df ON p.id = df.photo_id
       WHERE df.id IS NULL AND p.file_path IS NOT NULL`;
        const params = [];
        // 如果指定了afterId，只获取id大于此值的照片
        if (afterId !== undefined && afterId > 0) {
            sql += ` AND p.id > ?`;
            params.push(afterId);
        }
        sql += ` ORDER BY p.created_at DESC LIMIT ?`;
        params.push(limit);
        const rows = this.query(sql, params);
        return rows.map(row => ({
            id: row.id,
            uuid: row.uuid,
            file_path: row.file_path,
            file_name: row.file_name
        }));
    }
    /**
     * 标记检测结果已处理（匹配到人物）
     * @param faceId 检测人脸ID
     * @param personId 人物ID
     */
    markFaceAsProcessed(faceId, personId) {
        try {
            this.run('UPDATE detected_faces SET person_id = ?, processed = 1 WHERE id = ?', [personId, faceId]);
            return true;
        }
        catch (error) {
            console.error('[Database] 标记检测人脸处理失败:', error);
            return false;
        }
    }
    /**
     * 获取所有未匹配人物的检测人脸
     * @returns 未匹配人物的检测人脸列表
     */
    getUnmatchedDetectedFaces() {
        const rows = this.query(`SELECT df.*, p.file_path
       FROM detected_faces df
       JOIN photos p ON df.photo_id = p.id
       WHERE df.person_id IS NULL
       ORDER BY df.confidence DESC`);
        return rows.map(row => {
            const face = {
                id: row.id,
                photo_id: row.photo_id,
                file_path: row.file_path,
                bbox: {
                    x: row.bbox_x,
                    y: row.bbox_y,
                    width: row.bbox_width,
                    height: row.bbox_height
                },
                confidence: row.confidence,
                vector_version: row.vector_version
            };
            // 解析 embedding (兼容旧数据)
            if (row.embedding) {
                try {
                    face.embedding = Array.from(new Float32Array(row.embedding));
                }
                catch (e) {
                    face.embedding = null;
                }
            }
            // 解析 face_embedding (128维)
            if (row.face_embedding) {
                try {
                    face.face_embedding = Array.from(new Float32Array(row.face_embedding));
                }
                catch (e) {
                    face.face_embedding = null;
                }
            }
            // 解析 semantic_embedding (512维)
            if (row.semantic_embedding) {
                try {
                    face.semantic_embedding = Array.from(new Float32Array(row.semantic_embedding));
                }
                catch (e) {
                    face.semantic_embedding = null;
                }
            }
            return face;
        });
    }
    /**
     * 获取人脸检测统计
     */
    getDetectedFacesStats() {
        const total = this.query('SELECT COUNT(*) as count FROM detected_faces')[0]?.count || 0;
        const processed = this.query('SELECT COUNT(*) as count FROM detected_faces WHERE processed = 1')[0]?.count || 0;
        const photosWithFaces = this.query('SELECT COUNT(DISTINCT photo_id) as count FROM detected_faces')[0]?.count || 0;
        return {
            totalDetections: total,
            processedCount: processed,
            unprocessedCount: total - processed,
            photosWithFaces
        };
    }
    /**
     * 搜索人物
     */
    searchPersons(query) {
        if (!query.trim()) {
            return this.getAllPersons();
        }
        return this.query(`
      SELECT p.*, COUNT(df.id) as face_count
      FROM persons p
      LEFT JOIN detected_faces df ON p.id = df.person_id
      WHERE p.name LIKE ? OR p.display_name LIKE ?
      GROUP BY p.id
      ORDER BY face_count DESC
    `, [`%${query}%`, `%${query}%`]);
    }
    // 标签操作
    addTag(tag) {
        const result = this.run(`INSERT OR IGNORE INTO tags (name, type, parent_id) VALUES (?, ?, ?)`, [tag.name, tag.type || 'general', tag.parentId || null]);
        return result.lastInsertRowid;
    }
    getAllTags() {
        return this.query('SELECT * FROM tags ORDER BY name');
    }
    getPhotosByTag(tagId) {
        const rows = this.query(`
      SELECT DISTINCT p.*
      FROM photos p
      JOIN photo_tags pt ON p.id = pt.photo_id
      WHERE pt.tag_id = ?
      ORDER BY p.taken_at DESC
    `, [tagId]);
        return rows.map(row => ({
            ...row,
            exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
            location_data: row.location_data ? JSON.parse(row.location_data) : {}
        }));
    }
    addPhotoTag(photoId, tagId, confidence) {
        const result = this.run(`INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, confidence) VALUES (?, ?, ?)`, [photoId, tagId, confidence || 1.0]);
        return result.lastInsertRowid;
    }
    // 向量操作
    addVector(vector) {
        // 将 embedding 数组转换为 Blob
        const embeddingBuffer = Buffer.from(new Float32Array(vector.embedding).buffer);
        const result = this.run(`INSERT INTO vectors (photo_id, model_name, embedding) VALUES (?, ?, ?)`, [vector.photoId, vector.modelName, embeddingBuffer]);
        return result.lastInsertRowid;
    }
    /**
     * 保存图片嵌入向量
     * @param photoUuid 照片 UUID
     * @param vector 嵌入向量
     * @param embeddingType 嵌入类型 (默认 'image')
     * @returns 是否成功
     */
    async saveEmbedding(photoUuid, vector, embeddingType = 'image') {
        try {
            // 将向量转换为 Buffer (BLOB)
            const vectorBuffer = Buffer.from(new Float32Array(vector).buffer);
            this.run(`INSERT OR REPLACE INTO vectors (photo_uuid, embedding, embedding_type, created_at)
         VALUES (?, ?, ?, datetime('now'))`, [photoUuid, vectorBuffer, embeddingType]);
            console.log(`[Database] Saved ${embeddingType} embedding for photo: ${photoUuid}`);
            return true;
        }
        catch (error) {
            console.error('[Database] Failed to save embedding:', error);
            return false;
        }
    }
    /**
     * 批量保存嵌入向量
     * @param embeddings [{ photoUuid, vector, embeddingType }]
     * @returns 成功数量
     */
    async saveEmbeddingsBatch(embeddings) {
        let successCount = 0;
        try {
            for (const { photoUuid, vector, embeddingType } of embeddings) {
                const success = await this.saveEmbedding(photoUuid, vector, embeddingType);
                if (success)
                    successCount++;
            }
            console.log(`[Database] Batch saved ${successCount}/${embeddings.length} embeddings`);
            return successCount;
        }
        catch (error) {
            console.error('[Database] Batch save failed:', error);
            return successCount;
        }
    }
    /**
     * 获取单个照片的嵌入向量
     * @param photoUuid 照片 UUID
     * @param embeddingType 嵌入类型
     * @returns 嵌入向量或 null
     */
    async getEmbedding(photoUuid, embeddingType = 'image') {
        try {
            const result = this.query(`SELECT embedding FROM vectors WHERE photo_uuid = ? AND embedding_type = ?`, [photoUuid, embeddingType]);
            if (result.length > 0 && result[0].embedding) {
                // BLOB 转 Float32Array 再转数组
                const float32Array = new Float32Array(result[0].embedding);
                return Array.from(float32Array);
            }
            return null;
        }
        catch (error) {
            console.error('[Database] Failed to get embedding:', error);
            return null;
        }
    }
    /**
     * 获取所有嵌入向量（用于全库搜索）
     * @param embeddingType 嵌入类型
     * @returns 照片 UUID 和向量列表
     */
    async getAllEmbeddings(embeddingType = 'image') {
        try {
            const results = this.query(`SELECT photo_uuid, embedding FROM vectors WHERE embedding_type = ?`, [embeddingType]);
            return results.map(result => ({
                photoUuid: result.photo_uuid,
                vector: Array.from(new Float32Array(result.embedding))
            }));
        }
        catch (error) {
            console.error('[Database] Failed to get all embeddings:', error);
            return [];
        }
    }
    /**
     * 检查照片是否有嵌入向量
     * @param photoUuid 照片 UUID
     * @param embeddingType 嵌入类型
     * @returns 是否有嵌入
     */
    async hasEmbedding(photoUuid, embeddingType = 'image') {
        try {
            const result = this.query(`SELECT 1 FROM vectors WHERE photo_uuid = ? AND embedding_type = ? LIMIT 1`, [photoUuid, embeddingType]);
            return result.length > 0;
        }
        catch (error) {
            console.error('[Database] Failed to check embedding existence:', error);
            return false;
        }
    }
    /**
     * 删除照片的嵌入向量
     * @param photoUuid 照片 UUID
     * @param embeddingType 嵌入类型
     * @returns 是否成功
     */
    async deleteEmbedding(photoUuid, embeddingType) {
        try {
            if (embeddingType) {
                this.run(`DELETE FROM vectors WHERE photo_uuid = ? AND embedding_type = ?`, [photoUuid, embeddingType]);
            }
            else {
                this.run(`DELETE FROM vectors WHERE photo_uuid = ?`, [photoUuid]);
            }
            return true;
        }
        catch (error) {
            console.error('[Database] Failed to delete embedding:', error);
            return false;
        }
    }
    /**
     * 获取嵌入统计信息
     * @returns 统计对象
     */
    async getEmbeddingStats() {
        try {
            const totalResult = this.query(`SELECT COUNT(*) as count FROM vectors`);
            const typeResults = this.query(`SELECT embedding_type, COUNT(*) as count FROM vectors GROUP BY embedding_type`);
            return {
                totalEmbeddings: totalResult[0]?.count || 0,
                typeBreakdown: Object.fromEntries(typeResults.map((r) => [r.embedding_type, r.count]))
            };
        }
        catch (error) {
            console.error('[Database] Failed to get embedding stats:', error);
            return { totalEmbeddings: 0, typeBreakdown: {} };
        }
    }
    /**
     * 获取没有嵌入向量的照片
     * @param limit 限制数量
     * @returns 照片列表
     */
    getPhotosWithoutEmbeddings(limit = 100) {
        const photos = this.getAllPhotos(limit * 2, 0);
        return photos.filter(p => {
            const vectors = this.getVectorByPhoto(p.id);
            return !vectors || vectors.length === 0;
        }).slice(0, limit);
    }
    getVectorByPhoto(photoId) {
        return this.query('SELECT * FROM vectors WHERE photo_id = ?', [photoId]);
    }
    // 相册操作
    addAlbum(album) {
        const result = this.run(`INSERT INTO albums (name, type, query_params, cover_photo_id) VALUES (?, ?, ?, ?)`, [album.name, album.type || 'manual', album.queryParams ? JSON.stringify(album.queryParams) : null, album.coverPhotoId || null]);
        return result.lastInsertRowid;
    }
    getAllAlbums() {
        return this.query('SELECT * FROM albums ORDER BY updated_at DESC');
    }
    getAlbumById(id) {
        const rows = this.query('SELECT * FROM albums WHERE id = ?', [id]);
        if (rows.length === 0)
            return null;
        const album = rows[0];
        if (album.query_params) {
            album.query_params = JSON.parse(album.query_params);
        }
        return album;
    }
    updateAlbum(id, album) {
        try {
            if (album.name) {
                this.run('UPDATE albums SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [album.name, id]);
            }
            if (album.queryParams) {
                this.run('UPDATE albums SET query_params = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(album.queryParams), id]);
            }
            if (album.coverPhotoId) {
                this.run('UPDATE albums SET cover_photo_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [album.coverPhotoId, id]);
            }
            return true;
        }
        catch (error) {
            console.error('更新相册失败:', error);
            return false;
        }
    }
    deleteAlbum(id) {
        try {
            this.run('DELETE FROM albums WHERE id = ?', [id]);
            return true;
        }
        catch (error) {
            console.error('删除相册失败:', error);
            return false;
        }
    }
    // 统计查询
    getPhotoCountByYear() {
        return this.query(`
      SELECT strftime('%Y', taken_at) as year, COUNT(*) as count
      FROM photos
      WHERE taken_at IS NOT NULL
      GROUP BY strftime('%Y', taken_at)
      ORDER BY year DESC
    `);
    }
    getStats() {
        const photoCount = this.query('SELECT COUNT(*) as count FROM photos')[0]?.count || 0;
        const personCount = this.query('SELECT COUNT(*) as count FROM persons')[0]?.count || 0;
        const albumCount = this.query('SELECT COUNT(*) as count FROM albums')[0]?.count || 0;
        const tagCount = this.query('SELECT COUNT(*) as count FROM tags')[0]?.count || 0;
        return {
            photoCount,
            personCount,
            albumCount,
            tagCount
        };
    }
    // 地点操作
    getAllPlaces() {
        // 先获取所有有地点的照片
        const rows = this.query(`
      SELECT id, location_data
      FROM photos
      WHERE location_data IS NOT NULL
        AND location_data != ''
        AND location_data != 'null'
    `);
        // 在应用层解析 JSON 并分组
        const placeMap = new Map();
        for (const row of rows) {
            try {
                if (row.location_data) {
                    const location = JSON.parse(row.location_data);
                    // 优先使用 name 字段，如果没有则使用坐标
                    const placeName = location.name || `位置 ${location.latitude?.toFixed(2) || '?'},${location.longitude?.toFixed(2) || '?'}`;
                    placeMap.set(placeName, (placeMap.get(placeName) || 0) + 1);
                }
            }
            catch (e) {
                // JSON 解析失败，尝试从原始字符串提取
                const placeName = row.location_data?.substring(0, 50) || '未知地点';
                placeMap.set(placeName, (placeMap.get(placeName) || 0) + 1);
            }
        }
        // 转换为数组并排序
        return Array.from(placeMap.entries())
            .map(([place_name, photo_count]) => ({ place_name, photo_count }))
            .sort((a, b) => b.photo_count - a.photo_count);
    }
    // 搜索
    searchPhotos(query, filters) {
        let sql = 'SELECT * FROM photos WHERE 1=1';
        const params = [];
        // 按年份筛选
        if (filters?.year) {
            sql += ' AND strftime("%Y", taken_at) = ?';
            params.push(filters.year.toString());
        }
        // 按季节筛选
        if (filters?.season) {
            const monthMap = {
                '春天': ['03', '04', '05'],
                '夏天': ['06', '07', '08'],
                '秋天': ['09', '10', '11'],
                '冬天': ['12', '01', '02']
            };
            const months = monthMap[filters.season];
            if (months) {
                sql += ` AND strftime("%m", taken_at) IN (${months.map(() => '?').join(',')})`;
                params.push(...months);
            }
        }
        // 按地点关键词筛选
        if (filters?.location?.keywords?.length) {
            const conditions = filters.location.keywords.map((_) => {
                return '(location_data LIKE ? OR location_data LIKE ?)';
            });
            sql += ' AND (' + conditions.join(' OR ') + ')';
            for (const keyword of filters.location.keywords) {
                params.push(`%"${keyword}"%`, `%${keyword}%`);
            }
        }
        // 按人物筛选（通过 faces 表关联 persons）
        if (filters?.people?.length && filters.people.length > 0) {
            // 简化处理：搜索人物名称匹配（实际需要通过 faces 表关联）
            // 目前 persons 表是空的，后续实现人脸识别后再完善
        }
        sql += ' ORDER BY taken_at DESC LIMIT 50';
        const rows = this.query(sql, params);
        return rows.map(row => ({
            ...row,
            exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
            location_data: row.location_data ? JSON.parse(row.location_data) : {}
        }));
    }
    close() {
        if (this.db) {
            this.save();
            this.db.close();
            this.db = null;
        }
    }
}
