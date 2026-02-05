import initSqlJs from 'sql.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
export class PhotoDatabase {
    constructor() {
        this.db = null;
        this.dbPath = resolve(__dirname, '../../data/photo-mind.db');
    }
    async init() {
        try {
            const dir = resolve(__dirname, '../../data');
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
            const SqlJs = await initSqlJs();
            const SQL = SqlJs.default || SqlJs;
            console.log('[Database] sql.js loaded, constructor:', typeof SQL.Database !== 'undefined' ? 'Database' : 'PhotoDatabase');
            if (existsSync(this.dbPath)) {
                const fileBuffer = readFileSync(this.dbPath);
                console.log('[Database] Loading existing DB, size:', fileBuffer.length);
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
                console.log('[Database] Creating new DB');
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
            const checkResult = this.db.exec('SELECT COUNT(*) as count FROM photos');
            console.log('[Database] Initial photo count:', checkResult[0]?.values[0]?.[0]);
            this.createTables();
            console.log('[Database] Tables created/verified');
            this.save();
            console.log('[Database] DB saved');
        }
        catch (error) {
            console.error('数据库初始化失败:', error);
            console.log('使用内存数据库作为降级方案');
            try {
                const SqlJs = await initSqlJs();
                const SQL = SqlJs.default || SqlJs;
                this.db = new SQL.Database ? new SQL.Database() : new SQL.PhotoDatabase();
            }
            catch (e) {
                console.error('内存数据库也无法创建:', e);
            }
        }
    }
    createTables() {
        if (!this.db)
            return;
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
    `);
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
        this.db.run(`
      CREATE TABLE IF NOT EXISTS persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        display_name TEXT,
        face_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_manual INTEGER DEFAULT 0
      )
    `);
        this.db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        type TEXT,
        confidence REAL,
        parent_id INTEGER
      )
    `);
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
        this.db.run(`
      CREATE TABLE IF NOT EXISTS vectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        photo_id INTEGER,
        model_name TEXT,
        embedding BLOB,
        FOREIGN KEY (photo_id) REFERENCES photos(id)
      )
    `);
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
        this.db.run('CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_photos_cloud_id ON photos(cloud_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_persons_name ON persons(name)');
        console.log('数据库表创建完成');
    }
    save() {
        if (!this.db)
            return;
        const data = this.db.export();
        const buffer = Buffer.from(data);
        writeFileSync(this.dbPath, buffer);
    }
    query(sql, params = []) {
        if (!this.db)
            return [];
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }
    run(sql, params = []) {
        if (!this.db)
            return { lastInsertRowid: -1 };
        try {
            this.db.run(sql, params);
            this.save();
            const result = this.db.exec('SELECT last_insert_rowid()');
            const lastId = result[0]?.values[0]?.[0] || 0;
            return { lastInsertRowid: lastId };
        }
        catch (error) {
            console.error(`[Database] SQL执行失败: ${sql}`, error);
            return { lastInsertRowid: -1 };
        }
    }
    addPhoto(photo) {
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
        };
        try {
            this.run(`INSERT OR REPLACE INTO photos (uuid, cloud_id, file_path, file_name, file_size, width, height, taken_at, exif_data, location_data, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
            ]);
            const countResult = this.query('SELECT COUNT(*) as count FROM photos', []);
            console.log(`[Database] 添加照片成功: ${safePhoto.fileName}, 当前总数: ${countResult[0]?.count}`);
            return 1;
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
    getPhotosByYear(year) {
        const rows = this.query(`SELECT * FROM photos WHERE strftime('%Y', taken_at) = ? ORDER BY taken_at DESC`, [year.toString()]);
        return rows.map(row => ({
            ...row,
            exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
            location_data: row.location_data ? JSON.parse(row.location_data) : {}
        }));
    }
    getAllPhotos(limit = 100, offset = 0) {
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
    getPhotoCount() {
        const rows = this.query('SELECT COUNT(*) as count FROM photos', []);
        console.log(`[Database] 照片总数: ${rows[0]?.count || 0}`);
        return rows[0]?.count || 0;
    }
    addPerson(person) {
        const result = this.run(`INSERT OR IGNORE INTO persons (name, display_name) VALUES (?, ?)`, [person.name, person.displayName || person.name]);
        return result.lastInsertRowid;
    }
    getAllPersons() {
        return this.query(`
      SELECT p.*, COUNT(f.id) as face_count
      FROM persons p
      LEFT JOIN faces f ON p.id = f.person_id
      GROUP BY p.id
      ORDER BY face_count DESC
    `);
    }
    getPersonById(id) {
        const rows = this.query('SELECT * FROM persons WHERE id = ?', [id]);
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
            return true;
        }
        catch (error) {
            console.error('更新人物失败:', error);
            return false;
        }
    }
    addFace(face) {
        const result = this.run(`INSERT INTO faces (photo_id, person_id, bounding_box, confidence) VALUES (?, ?, ?, ?)`, [
            face.photoId,
            face.personId || null,
            face.boundingBox ? JSON.stringify(face.boundingBox) : null,
            face.confidence || 0
        ]);
        return result.lastInsertRowid;
    }
    getFacesByPhoto(photoId) {
        return this.query(`
      SELECT f.*, p.name as person_name
      FROM faces f
      LEFT JOIN persons p ON f.person_id = p.id
      WHERE f.photo_id = ?
    `, [photoId]);
    }
    getPhotosByPerson(personId) {
        const rows = this.query(`
      SELECT DISTINCT p.*
      FROM photos p
      JOIN faces f ON p.id = f.photo_id
      WHERE f.person_id = ?
      ORDER BY p.taken_at DESC
    `, [personId]);
        return rows.map(row => ({
            ...row,
            exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
            location_data: row.location_data ? JSON.parse(row.location_data) : {}
        }));
    }
    searchPhotosByPerson(personName) {
        const rows = this.query(`
      SELECT DISTINCT p.*
      FROM photos p
      JOIN faces f ON p.id = f.photo_id
      JOIN persons ps ON f.person_id = ps.id
      WHERE ps.name LIKE ? OR ps.display_name LIKE ?
      ORDER BY p.taken_at DESC
    `, [`%${personName}%`, `%${personName}%`]);
        return rows.map(row => ({
            ...row,
            exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
            location_data: row.location_data ? JSON.parse(row.location_data) : {}
        }));
    }
    searchPersons(query) {
        if (!query.trim()) {
            return this.getAllPersons();
        }
        return this.query(`
      SELECT p.*, COUNT(f.id) as face_count
      FROM persons p
      LEFT JOIN faces f ON p.id = f.person_id
      WHERE p.name LIKE ? OR p.display_name LIKE ?
      GROUP BY p.id
      ORDER BY face_count DESC
    `, [`%${query}%`, `%${query}%`]);
    }
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
    addVector(vector) {
        const embeddingBuffer = Buffer.from(new Float32Array(vector.embedding).buffer);
        const result = this.run(`INSERT INTO vectors (photo_id, model_name, embedding) VALUES (?, ?, ?)`, [vector.photoId, vector.modelName, embeddingBuffer]);
        return result.lastInsertRowid;
    }
    async saveEmbedding(photoUuid, vector, embeddingType = 'image') {
        try {
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
    async getEmbedding(photoUuid, embeddingType = 'image') {
        try {
            const result = this.query(`SELECT embedding FROM vectors WHERE photo_uuid = ? AND embedding_type = ?`, [photoUuid, embeddingType]);
            if (result.length > 0 && result[0].embedding) {
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
    getAllPlaces() {
        const rows = this.query(`
      SELECT id, location_data
      FROM photos
      WHERE location_data IS NOT NULL
        AND location_data != ''
        AND location_data != 'null'
    `);
        const placeMap = new Map();
        for (const row of rows) {
            try {
                if (row.location_data) {
                    const location = JSON.parse(row.location_data);
                    const placeName = location.name || `位置 ${location.latitude?.toFixed(2) || '?'},${location.longitude?.toFixed(2) || '?'}`;
                    placeMap.set(placeName, (placeMap.get(placeName) || 0) + 1);
                }
            }
            catch (e) {
                const placeName = row.location_data?.substring(0, 50) || '未知地点';
                placeMap.set(placeName, (placeMap.get(placeName) || 0) + 1);
            }
        }
        return Array.from(placeMap.entries())
            .map(([place_name, photo_count]) => ({ place_name, photo_count }))
            .sort((a, b) => b.photo_count - a.photo_count);
    }
    searchPhotos(query, filters) {
        let sql = 'SELECT * FROM photos WHERE 1=1';
        const params = [];
        if (filters?.year) {
            sql += ' AND strftime("%Y", taken_at) = ?';
            params.push(filters.year.toString());
        }
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
        if (filters?.location?.keywords?.length) {
            const conditions = filters.location.keywords.map((_) => {
                return '(location_data LIKE ? OR location_data LIKE ?)';
            });
            sql += ' AND (' + conditions.join(' OR ') + ')';
            for (const keyword of filters.location.keywords) {
                params.push(`%"${keyword}"%`, `%${keyword}%`);
            }
        }
        if (filters?.people?.length && filters.people.length > 0) {
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
//# sourceMappingURL=db.js.map