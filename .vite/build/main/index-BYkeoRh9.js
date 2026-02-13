import { BrowserWindow, app, protocol, net, ipcMain, dialog, shell } from "electron";
import { resolve, join, basename, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { exec, execSync } from "child_process";
import { promisify } from "util";
import initSqlJs from "sql.js";
import { existsSync, statSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, promises } from "fs";
import crypto$1 from "crypto";
import sharp from "sharp";
import { EventEmitter } from "events";
import { env, pipeline } from "@xenova/transformers";
import * as faceapi from "@vladmandic/face-api";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-cpu";
const execAsync = promisify(exec);
class ICloudService {
  libraryPath = "";
  database;
  PhotosLibrary = null;
  isAvailable = false;
  constructor(database2) {
    this.database = database2;
  }
  /**
   * 检测 iCloud Photos 可用性
   */
  async checkAvailability() {
    try {
      const { stdout } = await execAsync('system_profiler SPSyncServicesDataType | grep "iCloud"');
      this.isAvailable = stdout.includes("iCloud Photos") || stdout.includes("Photos");
      return this.isAvailable;
    } catch {
      this.isAvailable = false;
      return false;
    }
  }
  /**
   * 初始化服务
   */
  async initialize(libraryPath) {
    try {
      this.libraryPath = libraryPath;
      try {
        const PhotosLib = await import("./index-C2QpSo0k.js").then((n) => n.i);
        this.PhotosLibrary = PhotosLib.default || PhotosLib.Photos;
        console.log("apple-photos-js 加载成功");
      } catch (e) {
        console.warn("apple-photos-js 未安装，使用 AppleScript 方式");
      }
      await this.checkAvailability();
      console.log("iCloud 服务初始化完成");
      return true;
    } catch (error) {
      console.error("iCloud 服务初始化失败:", error);
      return false;
    }
  }
  /**
   * 获取 iCloud 可用性状态
   */
  getIsAvailable() {
    return this.isAvailable;
  }
  /**
   * 获取相册列表
   */
  async getAlbums() {
    if (this.isAvailable) {
      try {
        const albums = await this.getAlbumsViaAppleScript();
        if (albums.length > 0) {
          return albums;
        }
      } catch (error) {
        console.warn("AppleScript 获取相册失败，使用备选方案:", error);
      }
    }
    if (this.PhotosLibrary) {
      try {
        return this.getAlbumsViaLibrary();
      } catch (error) {
        console.warn("PhotosLibrary 获取相册失败:", error);
      }
    }
    return this.getMockAlbums();
  }
  /**
   * 通过 AppleScript 获取相册
   */
  async getAlbumsViaAppleScript() {
    const script = `
      tell application "Photos"
        set albumList to {}
        repeat with a in albums
          if a is not null then
            set end of albumList to {name of a as text, count of media items of a}
          end if
        end repeat
        return albumList
      end tell
    `;
    try {
      const { stdout } = await execAsync(`osascript -e '${script.replace(/\n/g, " ")}'`);
      return this.parseAlbumList(stdout);
    } catch (error) {
      console.error("AppleScript 获取相册失败:", error);
      return [];
    }
  }
  /**
   * 通过 PhotosLibrary 获取相册
   */
  getAlbumsViaLibrary() {
    console.warn("PhotosLibrary 不支持获取相册列表");
    return [];
  }
  /**
   * 解析 AppleScript 返回的相册列表
   */
  parseAlbumList(stdout) {
    const albums = [];
    const matches = stdout.matchAll(/\{([^,]+),\s*(\d+)\}/g);
    for (const match of matches) {
      const name = match[1]?.trim().replace(/"/g, "");
      const count = parseInt(match[2], 10);
      if (name && !isNaN(count)) {
        albums.push({ name, photoCount: count });
      }
    }
    return albums;
  }
  /**
   * 获取模拟相册数据
   */
  getMockAlbums() {
    return [
      { name: "个人收藏", photoCount: 1250 },
      { name: "最近项目", photoCount: 100 },
      { name: "自拍", photoCount: 89 },
      { name: "屏幕快照", photoCount: 234 },
      { name: "视频", photoCount: 67 }
    ];
  }
  /**
   * 获取照片列表（带下载状态）
   */
  async getPhotosWithStatus(albumName, options = {}) {
    const { limit = 100, offset = 0 } = options;
    if (this.isAvailable) {
      try {
        const photos = await this.getPhotosViaAppleScript(albumName, limit + offset);
        return photos.slice(offset, offset + limit);
      } catch (error) {
        console.warn("AppleScript 获取照片失败:", error);
      }
    }
    if (this.PhotosLibrary) {
      try {
        return await this.getPhotosViaLibrary(limit, offset);
      } catch (error) {
        console.warn("PhotosLibrary 获取照片失败:", error);
      }
    }
    return this.getMockPhotos(limit, offset);
  }
  /**
   * 通过 AppleScript 获取照片
   */
  async getPhotosViaAppleScript(albumName, limit = 100) {
    let script = `
      tell application "Photos"
        set photoList to {}
    `;
    if (albumName) {
      script += `
        set targetAlbum to album named "${albumName}"
        repeat with p in media items of targetAlbum
      `;
    } else {
      script += `
        repeat with p in media items
      `;
    }
    script += `
          set end of photoList to {id of p as text, name of p as text, date of p, size of p, download status of p as text}
        end repeat
        return photoList
      end tell
    `;
    try {
      const { stdout } = await execAsync(`osascript -e '${script.replace(/\n/g, " ")}'`);
      return this.parsePhotoList(stdout).slice(0, limit);
    } catch (error) {
      console.error("AppleScript 获取照片失败:", error);
      return [];
    }
  }
  /**
   * 通过 PhotosLibrary 获取照片
   */
  async getPhotosViaLibrary(limit, offset) {
    try {
      const photos = new this.PhotosLibrary(this.libraryPath);
      const allPhotos = photos.getAllPhotos();
      return allPhotos.slice(offset, offset + limit).map(
        (photo) => this.normalizePhoto(photo)
      );
    } catch (error) {
      console.error("PhotosLibrary 获取照片失败:", error);
      return [];
    }
  }
  /**
   * 解析 AppleScript 返回的照片列表
   */
  parsePhotoList(stdout) {
    const photos = [];
    const matches = stdout.matchAll(
      /\{([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^}]+)\}/g
    );
    for (const match of matches) {
      const id = match[1]?.trim();
      const filename = match[2]?.trim();
      const dateStr = match[3]?.trim();
      const sizeStr = match[4]?.trim();
      const status = match[5]?.trim();
      if (id && filename && dateStr && sizeStr) {
        photos.push({
          id,
          filename,
          date: new Date(dateStr.replace(/:/g, "-")),
          size: parseInt(sizeStr, 10) || 0,
          cloudStatus: this.parseCloudStatus(status)
        });
      }
    }
    return photos;
  }
  /**
   * 解析下载状态
   */
  parseCloudStatus(status) {
    const lowerStatus = status?.toLowerCase() || "";
    if (lowerStatus.includes("waiting") || lowerStatus.includes("not downloaded")) {
      return "waiting";
    }
    if (lowerStatus.includes("uploading")) {
      return "uploading";
    }
    return "downloaded";
  }
  /**
   * 下载照片到本地
   */
  async downloadPhoto(photoId) {
    if (this.isAvailable) {
      try {
        return await this.downloadPhotoViaAppleScript(photoId);
      } catch (error) {
        console.error("AppleScript 下载失败:", error);
      }
    }
    console.warn("无法下载照片，照片库不可用");
    return null;
  }
  /**
   * 通过 AppleScript 下载照片
   */
  async downloadPhotoViaAppleScript(photoId) {
    const script = `
      tell application "Photos"
        try
          set targetPhoto to media item id "${photoId}"
          download targetPhoto
          return POSIX path of (image file of targetPhoto as text)
        on error
          return ""
        end try
      end tell
    `;
    try {
      const { stdout } = await execAsync(`osascript -e '${script.replace(/\n/g, " ")}'`);
      const path = stdout.trim();
      return path || null;
    } catch (error) {
      console.error("AppleScript 下载照片失败:", error);
      return null;
    }
  }
  /**
   * 获取存储空间信息
   */
  async getStorageInfo() {
    try {
      const output = execSync('df -h / | tail -1 | awk "{print $3, $4}"');
      const [used, available] = output.toString().trim().split(/\s+/);
      return {
        used: this.parseSizeToGB(used),
        available: this.parseSizeToGB(available)
      };
    } catch (error) {
      console.error("获取存储信息失败:", error);
      return null;
    }
  }
  /**
   * 将人类可读的大小转换为 GB
   */
  parseSizeToGB(sizeStr) {
    const match = sizeStr.match(/^([\d.]+)([KMGT]?)$/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    switch (unit) {
      case "T":
        return value * 1024;
      case "G":
        return value;
      case "M":
        return value / 1024;
      case "K":
        return value / (1024 * 1024);
      default:
        return value;
    }
  }
  async getPhotos(limit = 100, offset = 0) {
    if (!this.PhotosLibrary) {
      return this.getMockPhotos(limit, offset);
    }
    try {
      const photos = new this.PhotosLibrary(this.libraryPath);
      const allPhotos = photos.getAllPhotos();
      return allPhotos.slice(offset, offset + limit).map((photo) => this.normalizePhoto(photo));
    } catch (error) {
      console.error("获取照片失败:", error);
      return this.getMockPhotos(limit, offset);
    }
  }
  /**
   * 批量下载照片
   */
  async downloadPhotos(photoIds, onProgress) {
    const results = /* @__PURE__ */ new Map();
    for (let i = 0; i < photoIds.length; i++) {
      const photoId = photoIds[i];
      onProgress?.(i + 1, photoIds.length);
      try {
        const path = await this.downloadPhoto(photoId);
        results.set(photoId, path || "");
      } catch (error) {
        results.set(photoId, "");
        console.error(`下载照片 ${photoId} 失败:`, error);
      }
    }
    return results;
  }
  async getPhotoDetail(photoId) {
    if (!this.PhotosLibrary) {
      return this.getMockPhotos(1, parseInt(photoId) || 0)[0];
    }
    try {
      const photos = new this.PhotosLibrary(this.libraryPath);
      const photo = photos.getPhotoById(photoId);
      return photo ? this.normalizePhoto(photo) : null;
    } catch (error) {
      console.error("获取照片详情失败:", error);
      return this.getMockPhotos(1, parseInt(photoId) || 0)[0];
    }
  }
  async syncAll() {
    let totalSynced = 0;
    try {
      const photos = await this.getPhotos(1e4, 0);
      for (const photo of photos) {
        this.database.addPhoto(photo);
        totalSynced++;
      }
      console.log(`同步完成: ${totalSynced} 张照片`);
    } catch (error) {
      console.error("同步失败:", error);
    }
    return totalSynced;
  }
  normalizePhoto(photo) {
    return {
      uuid: photo.uuid || photo.id || crypto.randomUUID(),
      cloudId: photo.cloudId || photo.id,
      filePath: photo.filePath || photo.originalPath,
      fileName: photo.filename || photo.name,
      fileSize: photo.fileSize || photo.size,
      width: photo.width,
      height: photo.height,
      takenAt: photo.takenAt || photo.creationDate || (/* @__PURE__ */ new Date()).toISOString(),
      exif: {
        camera: photo.cameraModel,
        lens: photo.lensModel,
        iso: photo.iso,
        aperture: photo.fNumber,
        shutterSpeed: photo.exposureTime
      },
      location: photo.location ? {
        latitude: photo.location.latitude,
        longitude: photo.location.longitude
      } : null,
      status: "icloud"
    };
  }
  // 模拟数据（用于开发阶段）
  getMockPhotos(limit, offset) {
    const mockPhotos = [];
    for (let i = offset; i < offset + limit; i++) {
      const year = 2015 + Math.floor(i / 100);
      const month = i % 12 + 1;
      const day = i % 28 + 1;
      const statuses = ["downloaded", "downloaded", "waiting", "downloaded"];
      const status = statuses[i % statuses.length];
      mockPhotos.push({
        id: `photo-${i}`,
        filename: `IMG_${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}_${i}.jpg`,
        date: new Date(year, month - 1, day, 10, 30),
        size: Math.floor(Math.random() * 5e6) + 1e6,
        cloudStatus: status,
        localPath: status === "downloaded" ? `/mock/photos/${year}/photo_${i}.jpg` : void 0
      });
    }
    return mockPhotos;
  }
}
const PROJECT_ROOT$1 = process.cwd();
class PhotoDatabase {
  db = null;
  dbPath;
  isMemoryDb = false;
  constructor() {
    this.dbPath = resolve(PROJECT_ROOT$1, "data/photo-mind.db");
    console.log("[Database] 数据库路径:", this.dbPath);
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
      } catch (e) {
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
      const dir = resolve(this.dbPath, "..");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        console.log("[Database] 创建目录:", dir);
      }
      const SqlJs = await initSqlJs();
      const SQL = SqlJs.default || SqlJs;
      console.log("[Database] sql.js loaded, constructor:", typeof SQL.Database !== "undefined" ? "Database" : "PhotoDatabase");
      if (existsSync(this.dbPath)) {
        const fileBuffer = readFileSync(this.dbPath);
        console.log("[Database] Loading existing DB, size:", fileBuffer.length, "path:", this.dbPath);
        if (typeof SQL.Database === "function") {
          this.db = new SQL.Database(fileBuffer);
        } else if (typeof SQL.PhotoDatabase === "function") {
          this.db = new SQL.PhotoDatabase(fileBuffer);
        } else {
          throw new Error("Unknown sql.js database constructor");
        }
      } else {
        console.log("[Database] Creating new DB at:", this.dbPath);
        if (typeof SQL.Database === "function") {
          this.db = new SQL.Database();
        } else if (typeof SQL.PhotoDatabase === "function") {
          this.db = new SQL.PhotoDatabase();
        } else {
          throw new Error("Unknown sql.js database constructor");
        }
      }
      this.isMemoryDb = false;
      this.createTables();
      console.log("[Database] Tables created/verified");
      try {
        const checkResult = this.db.exec("SELECT COUNT(*) as count FROM photos");
        console.log("[Database] Initial photo count:", checkResult[0]?.values[0]?.[0]);
      } catch (e) {
        console.log("[Database] Could not count photos (table may be empty)");
      }
      this.save();
      console.log("[Database] DB saved");
    } catch (error) {
      console.error("数据库初始化失败:", error);
      console.log("[Database] ⚠️ 使用内存数据库作为降级方案");
      try {
        const SqlJs = await initSqlJs();
        const SQL = SqlJs.default || SqlJs;
        this.db = new SQL.Database() ? new SQL.Database() : new SQL.PhotoDatabase();
        this.isMemoryDb = true;
        this.createTables();
        console.log("[Database] Memory DB tables created");
      } catch (e) {
        console.error("内存数据库也无法创建:", e);
      }
    }
  }
  createTables() {
    if (!this.db) return;
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
    this.db.run("CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_photos_cloud_id ON photos(cloud_id)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_id)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_persons_name ON persons(name)");
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
    this.db.run("CREATE INDEX IF NOT EXISTS idx_detected_faces_photo ON detected_faces(photo_id)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_detected_faces_processed ON detected_faces(processed)");
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
    this.db.run("CREATE INDEX IF NOT EXISTS idx_scan_jobs_status ON scan_jobs(status)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_scan_jobs_started_at ON scan_jobs(started_at)");
    this.runMigrations();
    console.log("数据库表创建完成");
  }
  /**
   * 数据库迁移
   * 用于添加新列而无需删除现有数据
   */
  runMigrations() {
    if (!this.db) return;
    try {
      const tableInfo = this.db.exec("PRAGMA table_info(detected_faces)");
      const columns = tableInfo[0]?.values.map((row) => row[1]) || [];
      if (!columns.includes("face_embedding")) {
        console.log("[Database] 迁移: 添加 face_embedding 列");
        this.db.run("ALTER TABLE detected_faces ADD COLUMN face_embedding BLOB");
      }
      if (!columns.includes("semantic_embedding")) {
        console.log("[Database] 迁移: 添加 semantic_embedding 列");
        this.db.run("ALTER TABLE detected_faces ADD COLUMN semantic_embedding BLOB");
      }
      if (!columns.includes("vector_version")) {
        console.log("[Database] 迁移: 添加 vector_version 列");
        this.db.run("ALTER TABLE detected_faces ADD COLUMN vector_version INTEGER DEFAULT 0");
      }
      console.log("[Database] 迁移完成");
    } catch (error) {
      console.error("[Database] 迁移失败:", error);
    }
  }
  // 保存数据库到文件
  save() {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
  }
  // 查询辅助方法
  query(sql, params = []) {
    if (!this.db) return [];
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
    if (!this.db) return { lastInsertRowid: -1 };
    try {
      this.db.run(sql, params);
      this.save();
      const result = this.db.exec("SELECT last_insert_rowid()");
      const lastId = result[0]?.values[0]?.[0] || 0;
      return { lastInsertRowid: lastId };
    } catch (error) {
      console.error(`[Database] SQL执行失败: ${sql}`, error);
      return { lastInsertRowid: -1 };
    }
  }
  // 照片操作
  addPhoto(photo) {
    const safePhoto = {
      uuid: photo.uuid || this.generateUUID(),
      cloudId: photo.cloudId || null,
      filePath: photo.filePath || null,
      fileName: photo.fileName || null,
      fileSize: photo.fileSize || 0,
      width: photo.width || null,
      height: photo.height || null,
      takenAt: photo.takenAt || (/* @__PURE__ */ new Date()).toISOString(),
      exif: photo.exif || {},
      location: photo.location || {},
      status: photo.status || "local",
      thumbnailPath: photo.thumbnailPath || null
    };
    try {
      this.run(
        `INSERT OR REPLACE INTO photos (uuid, cloud_id, file_path, file_name, file_size, width, height, taken_at, exif_data, location_data, status, thumbnail_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          safePhoto.status,
          safePhoto.thumbnailPath
        ]
      );
      const countResult = this.query("SELECT COUNT(*) as count FROM photos", []);
      console.log(`[Database] 添加照片成功: ${safePhoto.fileName}, 当前总数: ${countResult[0]?.count}`);
      return 1;
    } catch (error) {
      console.error(`[Database] 添加照片失败: ${safePhoto.fileName}`, error);
      return -1;
    }
  }
  generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  updatePhoto(photo) {
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
          photo.status || "local",
          photo.uuid
        ]
      );
      return true;
    } catch (error) {
      console.error("更新照片失败:", error);
      return false;
    }
  }
  deletePhoto(uuid) {
    try {
      this.run("DELETE FROM photos WHERE uuid = ?", [uuid]);
      return true;
    } catch (error) {
      console.error("删除照片失败:", error);
      return false;
    }
  }
  getPhotoByUuid(uuid) {
    const rows = this.query("SELECT * FROM photos WHERE uuid = ?", [uuid]);
    if (rows.length === 0) return null;
    const row = rows[0];
    row.exif_data = row.exif_data ? JSON.parse(row.exif_data) : {};
    row.location_data = row.location_data ? JSON.parse(row.location_data) : {};
    return row;
  }
  getPhotoById(id) {
    const rows = this.query("SELECT * FROM photos WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    const row = rows[0];
    row.exif_data = row.exif_data ? JSON.parse(row.exif_data) : {};
    row.location_data = row.location_data ? JSON.parse(row.location_data) : {};
    return row;
  }
  getPhotoByFilePath(filePath) {
    const rows = this.query("SELECT * FROM photos WHERE file_path = ?", [filePath]);
    if (rows.length === 0) return null;
    const row = rows[0];
    row.exif_data = row.exif_data ? JSON.parse(row.exif_data) : {};
    row.location_data = row.location_data ? JSON.parse(row.location_data) : {};
    return row;
  }
  getPhotosByYear(year) {
    const rows = this.query(
      `SELECT * FROM photos WHERE strftime('%Y', taken_at) = ? ORDER BY taken_at DESC`,
      [year.toString()]
    );
    return rows.map((row) => ({
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
    return rows.map((row) => ({
      ...row,
      exif_data: row.exif_data ? typeof row.exif_data === "string" ? JSON.parse(row.exif_data) : row.exif_data : {},
      location_data: row.location_data ? typeof row.location_data === "string" ? JSON.parse(row.location_data) : row.location_data : {}
    }));
  }
  // 获取照片总数
  getPhotoCount() {
    const rows = this.query("SELECT COUNT(*) as count FROM photos", []);
    console.log(`[Database] 照片总数: ${rows[0]?.count || 0}`);
    return rows[0]?.count || 0;
  }
  // 人物操作
  addPerson(person) {
    const existing = this.query("SELECT id FROM persons WHERE name = ?", [person.name]);
    if (existing.length > 0) {
      return existing[0].id;
    }
    const result = this.run(
      `INSERT INTO persons (name, display_name) VALUES (?, ?)`,
      [person.name, person.displayName || person.name]
    );
    if (result.lastInsertRowid <= 0) {
      const inserted = this.query("SELECT id FROM persons WHERE name = ?", [person.name]);
      if (inserted.length > 0) {
        return inserted[0].id;
      }
    }
    return result.lastInsertRowid;
  }
  getAllPersons() {
    return this.query(`
      SELECT p.*, COUNT(df.id) as face_count
      FROM persons p
      LEFT JOIN detected_faces df ON p.id = df.person_id
      GROUP BY p.id
      ORDER BY face_count DESC
    `);
  }
  getPersonById(id) {
    const rows = this.query("SELECT * FROM persons WHERE id = ?", [id]);
    return rows.length > 0 ? rows[0] : null;
  }
  updatePerson(id, person) {
    try {
      if (person.name) {
        this.run("UPDATE persons SET name = ? WHERE id = ?", [person.name, id]);
      }
      if (person.displayName) {
        this.run("UPDATE persons SET display_name = ? WHERE id = ?", [person.displayName, id]);
      }
      return true;
    } catch (error) {
      console.error("更新人物失败:", error);
      return false;
    }
  }
  // 人脸操作
  addFace(face) {
    const result = this.run(
      `INSERT INTO faces (photo_id, person_id, bounding_box, confidence, is_manual) VALUES (?, ?, ?, ?, ?)`,
      [
        face.photoId,
        face.personId || null,
        face.boundingBox ? JSON.stringify(face.boundingBox) : null,
        face.confidence || 0,
        face.isManual ?? 0
      ]
    );
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
      JOIN detected_faces df ON p.id = df.photo_id
      WHERE df.person_id = ?
      ORDER BY p.taken_at DESC
    `, [personId]);
    return rows.map((row) => ({
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
      JOIN faces f ON p.id = f.photo_id
      JOIN persons ps ON f.person_id = ps.id
      WHERE ps.name LIKE ? OR ps.display_name LIKE ?
      ORDER BY p.taken_at DESC
    `, [`%${personName}%`, `%${personName}%`]);
    return rows.map((row) => ({
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
    this.run("DELETE FROM detected_faces WHERE photo_id = ?", [photoId]);
    for (const face of faces) {
      try {
        const embeddingBuffer = face.embedding ? Buffer.from(new Float32Array(face.embedding).buffer) : null;
        const faceEmbeddingBuffer = face.face_embedding ? Buffer.from(new Float32Array(face.face_embedding).buffer) : null;
        const semanticEmbeddingBuffer = face.semantic_embedding ? Buffer.from(new Float32Array(face.semantic_embedding).buffer) : null;
        this.run(
          `INSERT INTO detected_faces (id, photo_id, bbox_x, bbox_y, bbox_width, bbox_height, confidence, embedding, face_embedding, semantic_embedding, vector_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
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
            (/* @__PURE__ */ new Date()).toISOString()
          ]
        );
        savedCount++;
      } catch (error) {
        console.error("[Database] 保存检测人脸失败:", error);
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
    const rows = this.query(
      `SELECT df.*, p.name as person_name
       FROM detected_faces df
       LEFT JOIN persons p ON df.person_id = p.id
       WHERE df.photo_id = ?
       ORDER BY df.confidence DESC`,
      [photoId]
    );
    return rows.map((row) => {
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
      if (row.embedding) {
        try {
          face.embedding = Array.from(new Float32Array(row.embedding));
        } catch (e) {
          face.embedding = null;
        }
      }
      if (row.face_embedding) {
        try {
          face.face_embedding = Array.from(new Float32Array(row.face_embedding));
        } catch (e) {
          face.face_embedding = null;
        }
      }
      if (row.semantic_embedding) {
        try {
          face.semantic_embedding = Array.from(new Float32Array(row.semantic_embedding));
        } catch (e) {
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
    let sql = `SELECT p.id, p.uuid, p.file_path, p.file_name
       FROM photos p
       LEFT JOIN detected_faces df ON p.id = df.photo_id
       WHERE df.id IS NULL AND p.file_path IS NOT NULL`;
    const params = [];
    if (afterId !== void 0 && afterId > 0) {
      sql += ` AND p.id > ?`;
      params.push(afterId);
    }
    sql += ` ORDER BY p.created_at DESC LIMIT ?`;
    params.push(limit);
    const rows = this.query(sql, params);
    return rows.map((row) => ({
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
      this.run(
        "UPDATE detected_faces SET person_id = ?, processed = 1 WHERE id = ?",
        [personId, faceId]
      );
      return true;
    } catch (error) {
      console.error("[Database] 标记检测人脸处理失败:", error);
      return false;
    }
  }
  /**
   * 获取所有未匹配人物的检测人脸
   * @returns 未匹配人物的检测人脸列表
   */
  getUnmatchedDetectedFaces() {
    const rows = this.query(
      `SELECT df.*, p.file_path
       FROM detected_faces df
       JOIN photos p ON df.photo_id = p.id
       WHERE df.person_id IS NULL
       ORDER BY df.confidence DESC`
    );
    return rows.map((row) => {
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
      if (row.embedding) {
        try {
          face.embedding = Array.from(new Float32Array(row.embedding));
        } catch (e) {
          face.embedding = null;
        }
      }
      if (row.face_embedding) {
        try {
          face.face_embedding = Array.from(new Float32Array(row.face_embedding));
        } catch (e) {
          face.face_embedding = null;
        }
      }
      if (row.semantic_embedding) {
        try {
          face.semantic_embedding = Array.from(new Float32Array(row.semantic_embedding));
        } catch (e) {
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
    const total = this.query("SELECT COUNT(*) as count FROM detected_faces")[0]?.count || 0;
    const processed = this.query("SELECT COUNT(*) as count FROM detected_faces WHERE processed = 1")[0]?.count || 0;
    const photosWithFaces = this.query("SELECT COUNT(DISTINCT photo_id) as count FROM detected_faces")[0]?.count || 0;
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
      SELECT p.*, COUNT(f.id) as face_count
      FROM persons p
      LEFT JOIN faces f ON p.id = f.person_id
      WHERE p.name LIKE ? OR p.display_name LIKE ?
      GROUP BY p.id
      ORDER BY face_count DESC
    `, [`%${query}%`, `%${query}%`]);
  }
  // 标签操作
  addTag(tag) {
    const result = this.run(
      `INSERT OR IGNORE INTO tags (name, type, parent_id) VALUES (?, ?, ?)`,
      [tag.name, tag.type || "general", tag.parentId || null]
    );
    return result.lastInsertRowid;
  }
  getAllTags() {
    return this.query("SELECT * FROM tags ORDER BY name");
  }
  getPhotosByTag(tagId) {
    const rows = this.query(`
      SELECT DISTINCT p.*
      FROM photos p
      JOIN photo_tags pt ON p.id = pt.photo_id
      WHERE pt.tag_id = ?
      ORDER BY p.taken_at DESC
    `, [tagId]);
    return rows.map((row) => ({
      ...row,
      exif_data: row.exif_data ? JSON.parse(row.exif_data) : {},
      location_data: row.location_data ? JSON.parse(row.location_data) : {}
    }));
  }
  addPhotoTag(photoId, tagId, confidence) {
    const result = this.run(
      `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, confidence) VALUES (?, ?, ?)`,
      [photoId, tagId, confidence || 1]
    );
    return result.lastInsertRowid;
  }
  // 向量操作
  addVector(vector) {
    const embeddingBuffer = Buffer.from(new Float32Array(vector.embedding).buffer);
    const result = this.run(
      `INSERT INTO vectors (photo_id, model_name, embedding) VALUES (?, ?, ?)`,
      [vector.photoId, vector.modelName, embeddingBuffer]
    );
    return result.lastInsertRowid;
  }
  /**
   * 保存图片嵌入向量
   * @param photoUuid 照片 UUID
   * @param vector 嵌入向量
   * @param embeddingType 嵌入类型 (默认 'image')
   * @returns 是否成功
   */
  async saveEmbedding(photoUuid, vector, embeddingType = "image") {
    try {
      const vectorBuffer = Buffer.from(new Float32Array(vector).buffer);
      this.run(
        `INSERT OR REPLACE INTO vectors (photo_uuid, embedding, embedding_type, created_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [photoUuid, vectorBuffer, embeddingType]
      );
      console.log(`[Database] Saved ${embeddingType} embedding for photo: ${photoUuid}`);
      return true;
    } catch (error) {
      console.error("[Database] Failed to save embedding:", error);
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
        if (success) successCount++;
      }
      console.log(`[Database] Batch saved ${successCount}/${embeddings.length} embeddings`);
      return successCount;
    } catch (error) {
      console.error("[Database] Batch save failed:", error);
      return successCount;
    }
  }
  /**
   * 获取单个照片的嵌入向量
   * @param photoUuid 照片 UUID
   * @param embeddingType 嵌入类型
   * @returns 嵌入向量或 null
   */
  async getEmbedding(photoUuid, embeddingType = "image") {
    try {
      const result = this.query(
        `SELECT embedding FROM vectors WHERE photo_uuid = ? AND embedding_type = ?`,
        [photoUuid, embeddingType]
      );
      if (result.length > 0 && result[0].embedding) {
        const float32Array = new Float32Array(result[0].embedding);
        return Array.from(float32Array);
      }
      return null;
    } catch (error) {
      console.error("[Database] Failed to get embedding:", error);
      return null;
    }
  }
  /**
   * 获取所有嵌入向量（用于全库搜索）
   * @param embeddingType 嵌入类型
   * @returns 照片 UUID 和向量列表
   */
  async getAllEmbeddings(embeddingType = "image") {
    try {
      const results = this.query(
        `SELECT photo_uuid, embedding FROM vectors WHERE embedding_type = ?`,
        [embeddingType]
      );
      return results.map((result) => ({
        photoUuid: result.photo_uuid,
        vector: Array.from(new Float32Array(result.embedding))
      }));
    } catch (error) {
      console.error("[Database] Failed to get all embeddings:", error);
      return [];
    }
  }
  /**
   * 检查照片是否有嵌入向量
   * @param photoUuid 照片 UUID
   * @param embeddingType 嵌入类型
   * @returns 是否有嵌入
   */
  async hasEmbedding(photoUuid, embeddingType = "image") {
    try {
      const result = this.query(
        `SELECT 1 FROM vectors WHERE photo_uuid = ? AND embedding_type = ? LIMIT 1`,
        [photoUuid, embeddingType]
      );
      return result.length > 0;
    } catch (error) {
      console.error("[Database] Failed to check embedding existence:", error);
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
        this.run(
          `DELETE FROM vectors WHERE photo_uuid = ? AND embedding_type = ?`,
          [photoUuid, embeddingType]
        );
      } else {
        this.run(`DELETE FROM vectors WHERE photo_uuid = ?`, [photoUuid]);
      }
      return true;
    } catch (error) {
      console.error("[Database] Failed to delete embedding:", error);
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
      const typeResults = this.query(
        `SELECT embedding_type, COUNT(*) as count FROM vectors GROUP BY embedding_type`
      );
      return {
        totalEmbeddings: totalResult[0]?.count || 0,
        typeBreakdown: Object.fromEntries(
          typeResults.map((r) => [r.embedding_type, r.count])
        )
      };
    } catch (error) {
      console.error("[Database] Failed to get embedding stats:", error);
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
    return photos.filter((p) => {
      const vectors = this.getVectorByPhoto(p.id);
      return !vectors || vectors.length === 0;
    }).slice(0, limit);
  }
  getVectorByPhoto(photoId) {
    return this.query("SELECT * FROM vectors WHERE photo_id = ?", [photoId]);
  }
  // 相册操作
  addAlbum(album) {
    const result = this.run(
      `INSERT INTO albums (name, type, query_params, cover_photo_id) VALUES (?, ?, ?, ?)`,
      [album.name, album.type || "manual", album.queryParams ? JSON.stringify(album.queryParams) : null, album.coverPhotoId || null]
    );
    return result.lastInsertRowid;
  }
  getAllAlbums() {
    return this.query("SELECT * FROM albums ORDER BY updated_at DESC");
  }
  getAlbumById(id) {
    const rows = this.query("SELECT * FROM albums WHERE id = ?", [id]);
    if (rows.length === 0) return null;
    const album = rows[0];
    if (album.query_params) {
      album.query_params = JSON.parse(album.query_params);
    }
    return album;
  }
  updateAlbum(id, album) {
    try {
      if (album.name) {
        this.run("UPDATE albums SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [album.name, id]);
      }
      if (album.queryParams) {
        this.run("UPDATE albums SET query_params = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(album.queryParams), id]);
      }
      if (album.coverPhotoId) {
        this.run("UPDATE albums SET cover_photo_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [album.coverPhotoId, id]);
      }
      return true;
    } catch (error) {
      console.error("更新相册失败:", error);
      return false;
    }
  }
  deleteAlbum(id) {
    try {
      this.run("DELETE FROM albums WHERE id = ?", [id]);
      return true;
    } catch (error) {
      console.error("删除相册失败:", error);
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
    const photoCount = this.query("SELECT COUNT(*) as count FROM photos")[0]?.count || 0;
    const personCount = this.query("SELECT COUNT(*) as count FROM persons")[0]?.count || 0;
    const albumCount = this.query("SELECT COUNT(*) as count FROM albums")[0]?.count || 0;
    const tagCount = this.query("SELECT COUNT(*) as count FROM tags")[0]?.count || 0;
    return {
      photoCount,
      personCount,
      albumCount,
      tagCount
    };
  }
  // 地点操作
  getAllPlaces() {
    const rows = this.query(`
      SELECT id, location_data
      FROM photos
      WHERE location_data IS NOT NULL
        AND location_data != ''
        AND location_data != 'null'
    `);
    const placeMap = /* @__PURE__ */ new Map();
    for (const row of rows) {
      try {
        if (row.location_data) {
          const location = JSON.parse(row.location_data);
          const placeName = location.name || `位置 ${location.latitude?.toFixed(2) || "?"},${location.longitude?.toFixed(2) || "?"}`;
          placeMap.set(placeName, (placeMap.get(placeName) || 0) + 1);
        }
      } catch (e) {
        const placeName = row.location_data?.substring(0, 50) || "未知地点";
        placeMap.set(placeName, (placeMap.get(placeName) || 0) + 1);
      }
    }
    return Array.from(placeMap.entries()).map(([place_name, photo_count]) => ({ place_name, photo_count })).sort((a, b) => b.photo_count - a.photo_count);
  }
  // 搜索
  searchPhotos(query, filters) {
    let sql = "SELECT * FROM photos WHERE 1=1";
    const params = [];
    if (filters?.year) {
      sql += ' AND strftime("%Y", taken_at) = ?';
      params.push(filters.year.toString());
    }
    if (filters?.season) {
      const monthMap = {
        "春天": ["03", "04", "05"],
        "夏天": ["06", "07", "08"],
        "秋天": ["09", "10", "11"],
        "冬天": ["12", "01", "02"]
      };
      const months = monthMap[filters.season];
      if (months) {
        sql += ` AND strftime("%m", taken_at) IN (${months.map(() => "?").join(",")})`;
        params.push(...months);
      }
    }
    if (filters?.location?.keywords?.length) {
      const conditions = filters.location.keywords.map((_) => {
        return "(location_data LIKE ? OR location_data LIKE ?)";
      });
      sql += " AND (" + conditions.join(" OR ") + ")";
      for (const keyword of filters.location.keywords) {
        params.push(`%"${keyword}"%`, `%${keyword}%`);
      }
    }
    if (filters?.people?.length && filters.people.length > 0) ;
    sql += " ORDER BY taken_at DESC LIMIT 50";
    const rows = this.query(sql, params);
    return rows.map((row) => ({
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
const __dirname$3 = fileURLToPath(new URL(".", import.meta.url));
class ConfigService {
  configPath;
  config;
  constructor() {
    this.configPath = resolve(__dirname$3, "../../data/config.json");
    this.config = this.loadConfig();
  }
  /**
   * 加载配置
   */
  loadConfig() {
    const defaultConfig = {
      llm: {
        provider: "none",
        apiKey: "",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat"
      },
      appearance: {
        theme: "system"
      }
    };
    try {
      if (existsSync(this.configPath)) {
        const fileContent = readFileSync(this.configPath, "utf-8");
        const loadedConfig = JSON.parse(fileContent);
        return {
          llm: { ...defaultConfig.llm, ...loadedConfig.llm },
          appearance: { ...defaultConfig.appearance, ...loadedConfig.appearance }
        };
      }
    } catch (error) {
      console.error("加载配置失败:", error);
    }
    return defaultConfig;
  }
  /**
   * 保存配置
   */
  saveConfig() {
    try {
      const dir = resolve(this.configPath, "..");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("保存配置失败:", error);
    }
  }
  /**
   * 获取完整配置
   */
  getConfig() {
    return this.config;
  }
  /**
   * 获取 LLM 配置
   */
  getLLMConfig() {
    return this.config.llm;
  }
  /**
   * 设置 API Key
   */
  setApiKey(apiKey) {
    this.config.llm.apiKey = apiKey;
    if (apiKey) {
      this.config.llm.provider = "deepseek";
    }
    this.saveConfig();
  }
  /**
   * 设置 LLM 提供商
   */
  setLLMProvider(provider) {
    this.config.llm.provider = provider;
    if (provider === "none") {
      this.config.llm.apiKey = "";
    }
    this.saveConfig();
  }
  /**
   * 设置 Base URL
   */
  setBaseUrl(baseUrl) {
    this.config.llm.baseUrl = baseUrl;
    this.saveConfig();
  }
  /**
   * 设置模型
   */
  setModel(model) {
    this.config.llm.model = model;
    this.saveConfig();
  }
  /**
   * 检查是否已配置 LLM
   */
  isLLMConfigured() {
    return !!(this.config.llm.apiKey && this.config.llm.provider !== "none");
  }
  /**
   * 设置主题
   */
  setTheme(theme) {
    this.config.appearance.theme = theme;
    this.saveConfig();
  }
  /**
   * 获取主题
   */
  getTheme() {
    return this.config.appearance.theme;
  }
}
let configService$1 = null;
function getConfigService() {
  if (!configService$1) {
    configService$1 = new ConfigService();
  }
  return configService$1;
}
class SearchService {
  database;
  configService;
  constructor(database2) {
    this.database = database2;
    this.configService = getConfigService();
  }
  async search(query, filters) {
    try {
      const parsedQuery = await this.parseQuery(query);
      const searchFilters = { ...filters, ...parsedQuery };
      const results = this.database.searchPhotos(query, searchFilters);
      return {
        results,
        total: results.length
      };
    } catch (error) {
      console.error("搜索失败:", error);
      return { results: [], total: 0 };
    }
  }
  /**
   * 使用 LLM 解析自然语言查询
   */
  async parseQuery(query) {
    const llmConfig = this.configService.getLLMConfig();
    if (!this.configService.isLLMConfigured()) {
      console.log("LLM 未配置，使用规则解析");
      return this.parseQueryByRules(query);
    }
    try {
      const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${llmConfig.apiKey}`
        },
        body: JSON.stringify({
          model: llmConfig.model,
          messages: [
            {
              role: "system",
              content: `你是一个图片搜索助手。用户会用自然语言描述想要找的照片。
请将用户描述转换为结构化的搜索条件。

支持的条件：
- 时间：年份（如 2015）、季节（如去年夏天）
- 人物：人名、数量（如一家四口）
- 地点：国家/城市/地标（如日本、新疆）

输出 JSON 格式：
{
  "time_range": {"year": null, "season": null},
  "people": ["人物1", "人物2"],
  "location": {"keywords": [], "description": null},
  "tags": ["场景标签"],
  "confidence": 0.8}`
            },
            {
              role: "user",
              content: query
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      try {
        const parsed = JSON.parse(content);
        return this.convertToFilters(parsed);
      } catch {
        return this.parseQueryByRules(query);
      }
    } catch (error) {
      console.error("LLM 查询失败:", error);
      return this.parseQueryByRules(query);
    }
  }
  /**
   * 检查搜索服务是否已配置
   */
  isConfigured() {
    return this.configService.isLLMConfigured();
  }
  /**
   * 获取当前配置状态
   */
  getConfigStatus() {
    const config = this.configService.getLLMConfig();
    return {
      configured: this.configService.isLLMConfigured(),
      provider: config.provider
    };
  }
  /**
   * 规则解析（备用方案）
   */
  parseQueryByRules(query) {
    const filters = {
      people: [],
      location: { keywords: [] },
      time_range: {}
    };
    const yearMatch = query.match(/(19|20)\d{2}/);
    if (yearMatch) {
      filters.time_range = { year: parseInt(yearMatch[0]) };
    }
    const seasons = ["春天", "夏天", "秋天", "冬天"];
    for (const season of seasons) {
      if (query.includes(season)) {
        filters.time_range.season = season;
        break;
      }
    }
    const locationKeywords = ["日本", "北京", "上海", "新疆", "东京", "北海道", "大阪"];
    for (const keyword of locationKeywords) {
      if (query.includes(keyword)) {
        filters.location.keywords.push(keyword);
      }
    }
    const peoplePatterns = [
      { pattern: /一家四口/, people: ["爸爸", "妈妈", "我", "儿子"] },
      { pattern: /爸爸妈妈/, people: ["爸爸", "妈妈"] },
      { pattern: /儿子/, people: ["儿子"] },
      { pattern: /合影/, people: [] },
      { pattern: /合照/, people: [] }
    ];
    for (const { pattern, people } of peoplePatterns) {
      if (pattern.test(query)) {
        filters.people.push(...people);
      }
    }
    return filters;
  }
  /**
   * 根据人物搜索照片
   */
  async searchByPerson(personName) {
    try {
      const photos = this.database.searchPhotosByPerson(personName);
      return {
        results: photos,
        total: photos.length
      };
    } catch (error) {
      console.error("人物搜索失败:", error);
      return { results: [], total: 0 };
    }
  }
  /**
   * 搜索人物
   */
  async searchPeople(query) {
    try {
      return this.database.searchPersons(query);
    } catch (error) {
      console.error("搜索人物失败:", error);
      return [];
    }
  }
  /**
   * 转换 LLM 输出为搜索过滤器
   */
  convertToFilters(parsed) {
    const filters = {
      people: [],
      location: { keywords: [] },
      time_range: {}
    };
    if (parsed.time_range?.year) {
      filters.time_range = { year: parsed.time_range.year };
    }
    if (parsed.people) {
      filters.people = Array.isArray(parsed.people) ? parsed.people : [parsed.people];
    }
    if (parsed.location?.keywords) {
      filters.location.keywords = parsed.location.keywords;
    }
    if (parsed.location?.description) {
      filters.location.keywords.push(parsed.location.description);
    }
    if (parsed.tags) {
      filters.tags = Array.isArray(parsed.tags) ? parsed.tags : [parsed.tags];
    }
    return filters;
  }
  /**
   * 智能推荐相册
   */
  async getSmartAlbums() {
    const albums = [];
    const places = this.database.getAllPlaces();
    if (places.length > 0) {
      albums.push({
        id: "smart-places",
        name: "按地点浏览",
        type: "smart",
        items: places.slice(0, 6)
      });
    }
    const people = this.database.getAllPersons();
    if (people.length > 0) {
      albums.push({
        id: "smart-people",
        name: "按人物浏览",
        type: "smart",
        items: people.slice(0, 6)
      });
    }
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const years = [currentYear - 1, currentYear - 2, currentYear - 3];
    albums.push({
      id: "smart-years",
      name: "历年回忆",
      type: "smart",
      items: years.map((year) => ({
        year,
        name: `${year}年`
      }))
    });
    return albums;
  }
}
const PROJECT_ROOT = process.cwd();
class ThumbnailService {
  cacheDir;
  thumbnailDir;
  defaultOptions;
  constructor() {
    this.cacheDir = resolve(PROJECT_ROOT, "data/cache");
    this.thumbnailDir = join(this.cacheDir, "thumbnails");
    this.defaultOptions = {
      width: 300,
      height: 300,
      quality: 80,
      format: "jpeg"
    };
  }
  /**
   * 初始化缓存目录
   */
  async init() {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
    if (!existsSync(this.thumbnailDir)) {
      mkdirSync(this.thumbnailDir, { recursive: true });
    }
    console.log("✓ 缩略图服务初始化完成");
  }
  /**
   * 生成缩略图路径
   */
  getThumbnailPath(filePath, options) {
    const name = crypto$1.createHash("md5").update(filePath + JSON.stringify(options)).digest("hex");
    return join(this.thumbnailDir, `${name}.${options.format === "png" ? "png" : "jpg"}`);
  }
  /**
   * 检查缩略图是否存在
   */
  async exists(filePath, options) {
    const thumbnailPath = this.getThumbnailPath(filePath, { ...this.defaultOptions, ...options });
    return existsSync(thumbnailPath);
  }
  /**
   * 生成缩略图
   */
  async generate(filePath, options) {
    const opts = { ...this.defaultOptions, ...options };
    const thumbnailPath = this.getThumbnailPath(filePath, opts);
    if (existsSync(thumbnailPath)) {
      return {
        path: thumbnailPath,
        width: opts.width || 0,
        height: opts.height || 0
      };
    }
    try {
      if (!sharp) {
        console.warn("sharp 未安装，缩略图功能受限");
        return null;
      }
      await sharp(filePath).resize(opts.width, opts.height, {
        fit: "cover",
        position: "center"
      }).jpeg({ quality: opts.quality }).toFile(thumbnailPath);
      return {
        path: thumbnailPath,
        width: opts.width || 0,
        height: opts.height || 0
      };
    } catch (error) {
      console.error("生成缩略图失败:", error);
      return null;
    }
  }
  /**
   * 批量生成缩略图
   */
  async generateBatch(filePaths, onProgress) {
    let success = 0;
    let failed = 0;
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      const result = await this.generate(filePath);
      if (result) {
        success++;
      } else {
        failed++;
      }
      onProgress?.(i + 1, filePaths.length);
    }
    return { success, failed };
  }
  /**
   * 获取缩略图路径（异步）
   */
  async getThumbnailPathAsync(filePath) {
    const existsThumb = await this.exists(filePath);
    if (existsThumb) {
      return this.getThumbnailPath(filePath, this.defaultOptions);
    }
    const result = await this.generate(filePath);
    return result?.path || filePath;
  }
  /**
   * 清理过期缓存（默认 7 天）
   */
  async cleanCache(maxAge = 7 * 24 * 60 * 60 * 1e3) {
    if (!existsSync(this.thumbnailDir)) {
      return 0;
    }
    const now = Date.now();
    let cleaned = 0;
    try {
      const files = readdirSync(this.thumbnailDir);
      for (const file of files) {
        const filePath = join(this.thumbnailDir, file);
        const stats = statSync(filePath);
        if (now - stats.mtimeMs > maxAge) {
          unlinkSync(filePath);
          cleaned++;
        }
      }
    } catch (error) {
      console.error("清理缓存失败:", error);
    }
    console.log(`清理了 ${cleaned} 个过期缩略图`);
    return cleaned;
  }
  /**
   * 清空所有缓存
   */
  async clearCache() {
    if (!existsSync(this.thumbnailDir)) {
      return 0;
    }
    let count = 0;
    try {
      const files = readdirSync(this.thumbnailDir);
      for (const file of files) {
        const filePath = join(this.thumbnailDir, file);
        unlinkSync(filePath);
        count++;
      }
    } catch (error) {
      console.error("清空缓存失败:", error);
    }
    console.log(`清空了 ${count} 个缩略图`);
    return count;
  }
  /**
   * 获取缓存统计
   */
  getCacheStats() {
    if (!existsSync(this.thumbnailDir)) {
      return { count: 0, size: 0 };
    }
    let count = 0;
    let size = 0;
    try {
      const files = readdirSync(this.thumbnailDir);
      for (const file of files) {
        const filePath = join(this.thumbnailDir, file);
        const stats = statSync(filePath);
        count++;
        size += stats.size;
      }
    } catch {
      return { count: 0, size: 0 };
    }
    return { count, size };
  }
}
const thumbnailService = new ThumbnailService();
const rnds8Pool = new Uint8Array(256);
let poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    crypto$1.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}
const byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]];
}
const native = {
  randomUUID: crypto$1.randomUUID
};
function v4(options, buf, offset) {
  if (native.randomUUID && true && !options) {
    return native.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  return unsafeStringify(rnds);
}
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif", ".tiff", ".tif", ".JPG", ".JPEG", ".PNG", ".HEIC", ".WEBP", ".GIF", ".TIFF", ".TIF"];
const RAW_EXTENSIONS = [".raw", ".cr2", ".nef", ".arw", ".dng"];
class LocalPhotoService {
  database;
  thumbnailService;
  importCallback = null;
  constructor(database2, thumbnailSvc2) {
    this.database = database2;
    this.thumbnailService = thumbnailSvc2 || thumbnailService;
  }
  /**
   * 设置进度回调
   */
  onProgress(callback) {
    this.importCallback = callback;
  }
  /**
   * 通知进度更新
   */
  updateProgress(progress) {
    if (this.importCallback) {
      this.importCallback({
        current: 0,
        total: 0,
        currentFile: "",
        status: "scanning",
        importedCount: 0,
        errorCount: 0,
        skippedCount: 0,
        ...progress
      });
    }
  }
  /**
   * 扫描文件夹中的照片
   */
  async scanFolder(folderPath) {
    const photos = [];
    if (!existsSync(folderPath)) {
      throw new Error(`文件夹不存在: ${folderPath}`);
    }
    const appDir = process.cwd();
    process.env.HOME || process.env.USERPROFILE || "";
    if (folderPath === appDir || folderPath.startsWith(appDir + "/")) {
      console.warn(`[LocalPhotoService] 跳过应用程序目录: ${folderPath}`);
      return [];
    }
    const scanDirectory = (dir) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
              scanDirectory(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (PHOTO_EXTENSIONS.includes(ext) && entry.name.split(".").length > 1) {
              photos.push(fullPath);
            }
          }
        }
      } catch (error) {
        console.error(`扫描文件夹失败: ${dir}`, error);
      }
    };
    scanDirectory(folderPath);
    return photos.sort();
  }
  /**
   * 提取照片元数据
   * 支持 EXIF、GPS、相机信息等
   */
  async extractMetadata(filePath) {
    const stats = statSync(filePath);
    const fileName = basename(filePath);
    const ext = extname(filePath).toLowerCase();
    const metadata = {
      uuid: v4(),
      fileName,
      filePath,
      fileSize: stats.size,
      status: "local"
    };
    if (RAW_EXTENSIONS.includes(ext)) {
      metadata.takenAt = stats.mtime.toISOString();
      return metadata;
    }
    try {
      const exifData = await this.extractEXIFData(filePath, ext);
      if (exifData) {
        if (exifData.Make || exifData.Model) {
          metadata.exif = {
            camera: `${exifData.Make || ""} ${exifData.Model || ""}`.trim(),
            iso: exifData.ISO || exifData.ISO200 || void 0,
            aperture: exifData.FNumber,
            shutterSpeed: exifData.ExposureTime ? this.formatShutterSpeed(exifData.ExposureTime) : void 0,
            focalLength: exifData.FocalLength,
            fNumber: exifData.FNumber
          };
        }
        metadata.takenAt = exifData.DateTimeOriginal?.toISOString() || exifData.CreateDate?.toISOString() || stats.mtime.toISOString();
        if (exifData.ImageWidth || exifData.ExifImageWidth) {
          metadata.width = exifData.ImageWidth || exifData.ExifImageWidth;
        }
        if (exifData.ImageHeight || exifData.ExifImageHeight) {
          metadata.height = exifData.ImageHeight || exifData.ExifImageHeight;
        }
        if (exifData.latitude && exifData.longitude) {
          metadata.location = {
            latitude: exifData.latitude,
            longitude: exifData.longitude,
            altitude: exifData.GPSAltitude
          };
        }
      } else {
        metadata.takenAt = stats.mtime.toISOString();
      }
    } catch (error) {
      console.warn(`提取元数据失败: ${filePath}`, error);
      metadata.takenAt = stats.mtime.toISOString();
    }
    return metadata;
  }
  /**
   * 提取 EXIF 数据（增强版）
   */
  async extractEXIFData(filePath, ext) {
    try {
      const buffer = await promises.readFile(filePath);
      if (ext === ".jpg" || ext === ".jpeg") {
        if (buffer[0] !== 255 || buffer[1] !== 216) {
          return null;
        }
        return this.parseJPEGEXIF(buffer);
      }
      if (ext === ".png") {
        const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        if (!buffer.slice(0, 8).equals(pngSignature)) {
          return null;
        }
        return this.parsePNGEXIF(buffer);
      }
      if (ext === ".heic" || ext === ".heif") {
        console.warn("HEIC 格式需要专门库支持");
        return null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }
  /**
   * 解析 JPEG EXIF 数据
   */
  parseJPEGEXIF(buffer) {
    const result = {};
    let offset = 2;
    while (offset < buffer.length - 1) {
      if (buffer[offset] === 255 && buffer[offset + 1] === 225) {
        const segmentLength = buffer[offset + 2] << 8 | buffer[offset + 3];
        const exifHeader = buffer.toString("latin1", offset + 4, offset + 10);
        if (exifHeader === "Exif\0\0") {
          const tiffOffset = offset + 10;
          const byteOrder = buffer.readUInt16BE(tiffOffset);
          let ifdOffset;
          if (byteOrder === 18761) {
            ifdOffset = tiffOffset + buffer.readUInt32LE(tiffOffset + 4);
          } else {
            ifdOffset = tiffOffset + buffer.readUInt32BE(tiffOffset + 4);
          }
          this.parseEXIFIFD(buffer, ifdOffset, byteOrder, result);
          break;
        }
        offset += segmentLength + 2;
      } else if (buffer[offset] === 255 && buffer[offset + 1] !== 0) {
        const segmentLength = buffer[offset + 2] << 8 | buffer[offset + 3];
        offset += segmentLength + 2;
      } else {
        offset++;
      }
    }
    return result;
  }
  /**
   * 解析 EXIF IFD
   */
  parseEXIFIFD(buffer, offset, byteOrder, result) {
    try {
      const numEntries = byteOrder === 18761 ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
      for (let i = 0; i < numEntries; i++) {
        const entryOffset = offset + 2 + i * 12;
        const tag = byteOrder === 18761 ? buffer.readUInt16LE(entryOffset) : buffer.readUInt16BE(entryOffset);
        const type = byteOrder === 18761 ? buffer.readUInt16LE(entryOffset + 2) : buffer.readUInt16BE(entryOffset + 2);
        const count = byteOrder === 18761 ? buffer.readUInt32LE(entryOffset + 4) : buffer.readUInt32BE(entryOffset + 4);
        const value = this.readEXIFValue(buffer, entryOffset, type, count, byteOrder, result);
        this.mapEXIFTag(tag, value, result);
      }
    } catch (error) {
      console.warn("解析 EXIF IFD 失败:", error);
    }
  }
  /**
   * 映射 EXIF 标签到结果
   */
  mapEXIFTag(tag, value, result) {
    const tagMap = {
      271: "Make",
      // 相机厂商
      272: "Model",
      // 相机型号
      282: "XResolution",
      283: "YResolution",
      296: "ResolutionUnit",
      305: "Software",
      306: "DateTime",
      315: "Artist",
      33432: "Copyright",
      34665: "ExifIFDPointer",
      34853: "GPSInfoIFDPointer"
    };
    if (tagMap[tag]) {
      result[tagMap[tag]] = value;
    }
  }
  /**
   * 读取 EXIF 值
   */
  readEXIFValue(buffer, entryOffset, type, count, byteOrder, result) {
    const typeSizes = {
      1: 1,
      // BYTE
      2: 1,
      // ASCII
      3: 2,
      // SHORT
      4: 4,
      // LONG
      5: 8,
      // RATIONAL
      6: 1,
      // SBYTE
      7: 1,
      // UNDEFINED
      8: 2,
      // SSHORT
      9: 4,
      // SLONG
      10: 8
      // SRATIONAL
    };
    try {
      const typeSize = typeSizes[type] || 1;
      const valueSize = typeSize * count;
      let valueOffset = entryOffset + 8;
      if (valueSize > 4) {
        valueOffset = byteOrder === 18761 ? buffer.readUInt32LE(entryOffset + 8) : buffer.readUInt32BE(entryOffset + 8);
      }
      switch (type) {
        case 2:
          return buffer.toString("utf8", valueOffset, valueOffset + count - 1).replace(/\0+$/, "");
        case 3:
          return count === 1 ? byteOrder === 18761 ? buffer.readUInt16LE(valueOffset) : buffer.readUInt16BE(valueOffset) : void 0;
        case 4:
          return count === 1 ? byteOrder === 18761 ? buffer.readUInt32LE(valueOffset) : buffer.readUInt32BE(valueOffset) : void 0;
        case 5:
          if (count === 1) {
            const num = byteOrder === 18761 ? buffer.readUInt32LE(valueOffset) : buffer.readUInt32BE(valueOffset);
            const den = byteOrder === 18761 ? buffer.readUInt32LE(valueOffset + 4) : buffer.readUInt32BE(valueOffset + 4);
            return den ? num / den : 0;
          }
          return void 0;
        default:
          return void 0;
      }
    } catch {
      return void 0;
    }
  }
  /**
   * 解析 PNG 元数据
   */
  parsePNGEXIF(buffer) {
    const result = {};
    let offset = 8;
    while (offset < buffer.length - 8) {
      const length = buffer.readUInt32BE(offset);
      const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
      if (chunkType === "tEXt" || chunkType === "iTXt" || chunkType === "zTXt") {
        const data = buffer.slice(offset + 8, offset + 8 + length);
        const nullIndex = data.indexOf(0);
        if (nullIndex > 0) {
          const keyword = data.slice(0, nullIndex).toString("ascii");
          const text = data.slice(nullIndex + 1).toString("utf8");
          if (keyword === "Description") result.Description = text;
          if (keyword === "Title") result.Title = text;
          if (keyword === "Author") result.Artist = text;
          if (keyword === "Copyright") result.Copyright = text;
          if (keyword === "DateTime") result.DateTime = text;
        }
      }
      if (chunkType === "IEND") break;
      offset += length + 12;
    }
    return result;
  }
  /**
   * 格式化快门速度
   */
  formatShutterSpeed(seconds) {
    if (seconds >= 1) {
      return `${seconds}s`;
    }
    const denominator = Math.round(1 / seconds);
    return `1/${denominator}`;
  }
  /**
   * 导入文件夹中的所有照片
   */
  async importFolder(folderPath) {
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const importedPhotos = [];
    this.updateProgress({
      status: "scanning",
      total: 0
    });
    try {
      const photos = await this.scanFolder(folderPath);
      this.updateProgress({
        status: "importing",
        total: photos.length,
        current: 0,
        importedCount: 0,
        errorCount: 0,
        skippedCount: 0
      });
      console.log(`找到 ${photos.length} 张照片`);
      for (let i = 0; i < photos.length; i++) {
        const filePath = photos[i];
        this.updateProgress({
          current: i + 1,
          total: photos.length,
          currentFile: basename(filePath),
          importedCount,
          errorCount,
          skippedCount
        });
        try {
          const metadata = await this.extractMetadata(filePath);
          const existingPhoto = this.database.getPhotoByFilePath(filePath);
          if (existingPhoto) {
            console.log(`[LocalPhotoService] 文件已存在，跳过: ${basename(filePath)}`);
            skippedCount++;
            this.updateProgress({
              current: i + 1,
              total: photos.length,
              currentFile: basename(filePath),
              importedCount,
              errorCount,
              skippedCount
            });
            continue;
          }
          let thumbnailPath = null;
          try {
            const thumbnailResult = await this.thumbnailService.generate(filePath);
            if (thumbnailResult) {
              thumbnailPath = thumbnailResult.path;
              console.log(`[LocalPhotoService] 缩略图生成成功: ${basename(filePath)}`);
            }
          } catch (thumbError) {
            console.warn(`[LocalPhotoService] 缩略图生成失败: ${filePath}`, thumbError);
          }
          const photoData = {
            ...metadata,
            thumbnailPath
          };
          const photoId = this.database.addPhoto(photoData);
          if (photoId > 0) {
            importedCount++;
            importedPhotos.push({
              ...photoData,
              id: photoId
            });
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error(`导入照片失败: ${filePath}`, error);
          errorCount++;
        }
      }
      this.updateProgress({
        status: "completed",
        current: photos.length,
        total: photos.length,
        importedCount,
        errorCount,
        skippedCount
      });
    } catch (error) {
      console.error("扫描文件夹失败:", error);
      this.updateProgress({
        status: "error",
        errorCount: 1
      });
      throw error;
    }
    return {
      imported: importedCount,
      skipped: skippedCount,
      errors: errorCount,
      photos: importedPhotos
    };
  }
  /**
   * 导入单张照片
   */
  async importPhoto(filePath) {
    try {
      const metadata = await this.extractMetadata(filePath);
      const photoId = this.database.addPhoto(metadata);
      if (photoId > 0) {
        return {
          ...metadata,
          id: photoId
        };
      }
      return null;
    } catch (error) {
      console.error(`导入照片失败: ${filePath}`, error);
      return null;
    }
  }
  /**
   * 获取已导入的照片数量
   */
  getPhotoCount() {
    try {
      return this.database.getPhotoCount();
    } catch (error) {
      console.error("获取照片数量失败:", error);
      return 0;
    }
  }
  /**
   * 获取没有嵌入向量的照片
   */
  getPhotosWithoutEmbeddings(limit = 100) {
    try {
      const photos = this.database.getPhotosWithoutEmbeddings(limit);
      return photos.map((p) => ({
        id: p.id,
        uuid: p.uuid,
        filePath: p.file_path,
        fileName: p.file_name,
        thumbnailPath: p.thumbnail_path,
        takenAt: p.taken_at
      }));
    } catch (error) {
      console.error("获取无向量照片失败:", error);
      return [];
    }
  }
  /**
   * 获取本地照片（供 photos:get-list 调用）
   */
  getLocalPhotos(limit = 100, offset = 0) {
    try {
      console.log(`[LocalPhotoService] getLocalPhotos - limit: ${limit}, offset: ${offset}`);
      console.log(`[LocalPhotoService] database 可用: ${!!this.database}`);
      const photos = this.database.getAllPhotos(limit, offset);
      console.log(`[LocalPhotoService] getAllPhotos 返回 ${photos.length} 条记录`);
      const result = photos.map((p) => ({
        id: p.id,
        uuid: p.uuid,
        cloudId: p.cloud_id,
        filePath: p.file_path,
        fileName: p.file_name,
        fileSize: p.file_size,
        width: p.width,
        height: p.height,
        takenAt: p.taken_at,
        exif: this.parseJsonField(p.exif_data),
        location: this.parseJsonField(p.location_data),
        thumbnailPath: p.thumbnail_path,
        status: p.status || "local"
      }));
      console.log(`[LocalPhotoService] 映射后返回 ${result.length} 张照片`);
      return result;
    } catch (error) {
      console.error("[LocalPhotoService] 获取本地照片失败:", error);
      return [];
    }
  }
  /**
   * 安全解析 JSON 字段（兼容已解析的对象和 JSON 字符串）
   */
  parseJsonField(field) {
    if (!field) return {};
    if (typeof field === "object") return field;
    if (typeof field === "string") {
      try {
        return JSON.parse(field);
      } catch {
        return {};
      }
    }
    return {};
  }
  /**
   * 删除照片
   * @param photoId 照片 ID
   * @returns 是否删除成功
   */
  deletePhoto(photoId) {
    try {
      console.log(`[LocalPhotoService] 删除照片: ${photoId}`);
      const photo = this.database.getPhotoById(photoId);
      if (!photo) {
        console.warn(`[LocalPhotoService] 照片 ${photoId} 不存在于数据库`);
        return false;
      }
      const success = this.database.deletePhoto(photo.uuid);
      if (success) {
        console.log(`[LocalPhotoService] 照片 ${photoId} (uuid: ${photo.uuid}) 已从数据库删除`);
      }
      return success;
    } catch (error) {
      console.error(`[LocalPhotoService] 删除照片失败: ${photoId}`, error);
      return false;
    }
  }
}
class FolderScanner {
  supportedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".heic",
    ".heif",
    ".raw",
    ".cr2",
    ".nef",
    ".arw",
    ".tiff",
    ".tif",
    ".bmp"
  ];
  /**
   * 扫描文件夹
   */
  async scanFolder(folderPath, options = {}) {
    const {
      extensions = this.supportedExtensions,
      recursive = true,
      skipHidden = true
    } = options;
    const appDir = process.cwd();
    if (folderPath === appDir || folderPath.startsWith(appDir + "/")) {
      console.warn(`[FolderScanner] 跳过应用程序目录: ${folderPath}`);
      return [];
    }
    const files = [];
    await this.scanDirectory(folderPath, "", files, {
      extensions,
      recursive,
      skipHidden
    });
    return files;
  }
  /**
   * 递归扫描目录
   */
  async scanDirectory(rootPath, relativePath, files, options) {
    const fullPath = join(rootPath, relativePath);
    try {
      const entries = await promises.readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = join(relativePath, entry.name);
        if (entry.isDirectory()) {
          if (options.recursive && !(options.skipHidden && entry.name.startsWith("."))) {
            await this.scanDirectory(rootPath, entryPath, files, options);
          }
        } else if (entry.isFile()) {
          if (this.shouldIncludeFile(entry.name, options)) {
            const filePath = join(rootPath, entryPath);
            const stats = await promises.stat(filePath);
            files.push({
              path: filePath,
              filename: entry.name,
              extension: extname(entry.name).toLowerCase(),
              size: stats.size,
              mtime: stats.mtime
            });
          }
        }
      }
    } catch (error) {
      console.error(`扫描目录失败: ${fullPath}`, error);
      throw error;
    }
  }
  /**
   * 判断是否应该包含该文件
   */
  shouldIncludeFile(filename, options) {
    const ext = extname(filename).toLowerCase();
    if (!ext || ext === filename) {
      return false;
    }
    if (options.skipHidden && filename.startsWith(".")) {
      return false;
    }
    return options.extensions.includes(ext);
  }
  /**
   * 估算导入时间（秒）
   */
  async estimateImportTime(files) {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const estimatedSeconds = totalSize / (30 * 1024 * 1024);
    return Math.ceil(estimatedSeconds);
  }
  /**
   * 获取支持的文件扩展名
   */
  getSupportedExtensions() {
    return [...this.supportedExtensions];
  }
  /**
   * 检查文件是否是支持的图片格式
   */
  isSupportedFile(filePath) {
    const ext = extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }
}
const folderScanner = new FolderScanner();
class ImportProgressService extends EventEmitter {
  currentProgress = null;
  progressInterval = null;
  progressListeners = /* @__PURE__ */ new Set();
  lastUpdateTime = 0;
  constructor() {
    super();
  }
  /**
   * 订阅进度更新
   */
  subscribe(listener) {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }
  /**
   * 通知所有监听器
   */
  notify() {
    if (!this.currentProgress) return;
    const now = Date.now();
    if (now - this.lastUpdateTime < 500 && this.currentProgress.stage !== "complete") {
      return;
    }
    this.lastUpdateTime = now;
    for (const listener of this.progressListeners) {
      try {
        listener({ ...this.currentProgress });
      } catch (error) {
        console.error("[ImportProgress] 监听器错误:", error);
      }
    }
  }
  /**
   * 开始新的导入会话
   */
  startSession(total, stage = "preparing") {
    this.currentProgress = {
      stage,
      currentIndex: 0,
      total,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      startTime: Date.now()
    };
    this.startProgressTimer();
    this.notify();
  }
  /**
   * 启动进度定时器
   */
  startProgressTimer() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    this.progressInterval = setInterval(() => {
      this.updateEstimatedTime();
      this.notify();
    }, 1e3);
  }
  /**
   * 更新阶段
   */
  setStage(stage) {
    if (this.currentProgress) {
      this.currentProgress.stage = stage;
      this.notify();
    }
  }
  /**
   * 更新当前文件
   */
  updateCurrentFile(file) {
    if (this.currentProgress) {
      this.currentProgress.currentFile = file;
      this.notify();
    }
  }
  /**
   * 更新进度（每处理一个文件后调用）
   */
  advanceProgress(imported = true, skipped = false, failed = false) {
    if (!this.currentProgress) return;
    this.currentProgress.currentIndex++;
    if (imported) this.currentProgress.imported++;
    if (skipped) this.currentProgress.skipped++;
    if (failed) this.currentProgress.failed++;
    this.updateEstimatedTime();
    this.notify();
  }
  /**
   * 添加错误
   */
  addError(file, error) {
    if (this.currentProgress) {
      if (this.currentProgress.errors.length < 20) {
        this.currentProgress.errors.push({ file, error });
      } else if (this.currentProgress.errors.length === 20) {
        this.currentProgress.errors.push({ file, error: "更多错误已省略..." });
      }
      this.currentProgress.failed++;
      this.notify();
    }
  }
  /**
   * 计算预计剩余时间
   */
  updateEstimatedTime() {
    if (!this.currentProgress || this.currentProgress.currentIndex === 0) {
      return;
    }
    const elapsed = Date.now() - this.currentProgress.startTime;
    const avgTimePerFile = elapsed / this.currentProgress.currentIndex;
    const remaining = (this.currentProgress.total - this.currentProgress.currentIndex) * avgTimePerFile;
    this.currentProgress.estimatedTimeRemaining = Math.ceil(remaining / 1e3);
  }
  /**
   * 设置字节进度
   */
  setBytesProgress(bytesProcessed, totalBytes) {
    if (this.currentProgress) {
      this.currentProgress.bytesProcessed = bytesProcessed;
      this.currentProgress.totalBytes = totalBytes;
      this.notify();
    }
  }
  /**
   * 完成导入
   */
  complete(success = true) {
    if (!this.currentProgress) return null;
    this.currentProgress.stage = success ? "complete" : "cancelled";
    this.currentProgress.estimatedTimeRemaining = 0;
    this.stop();
    const result = { ...this.currentProgress };
    this.notify();
    return result;
  }
  /**
   * 取消导入
   */
  cancel() {
    if (this.currentProgress) {
      this.currentProgress.stage = "cancelled";
      this.stop();
      this.notify();
    }
  }
  /**
   * 停止进度追踪
   */
  stop() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }
  /**
   * 获取当前进度
   */
  getProgress() {
    return this.currentProgress ? { ...this.currentProgress } : null;
  }
  /**
   * 获取进度百分比
   */
  getPercentage() {
    if (!this.currentProgress || this.currentProgress.total === 0) return 0;
    return Math.round(this.currentProgress.currentIndex / this.currentProgress.total * 100);
  }
  /**
   * 检查是否正在导入
   */
  isActive() {
    return this.currentProgress !== null && this.currentProgress.stage !== "complete" && this.currentProgress.stage !== "cancelled";
  }
  /**
   * 格式化时间（秒）为可读字符串
   */
  static formatTime(seconds) {
    if (seconds < 60) {
      return `${seconds}秒`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}分${secs}秒`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor(seconds % 3600 / 60);
      return `${hours}小时${minutes}分`;
    }
  }
  /**
   * 格式化文件大小
   */
  static formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}
const importProgressService = new ImportProgressService();
env.allowLocalModels = false;
env.useBrowserCache = true;
env.cacheDir = "./model_cache";
class EmbeddingService {
  // 单例实例
  static instance;
  // 特征提取管道
  extractor = null;
  // 模型名称 (Hugging Face Hub)
  MODEL_NAME = "Xenova/clip-vit-base-patch32";
  // 模型缓存目录
  CACHE_DIR = "./model_cache";
  // 加载状态
  _isLoaded = false;
  _loadError = null;
  _loadStartTime = 0;
  /**
   * 获取单例实例
   */
  static getInstance() {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }
  /**
   * 私有构造函数，确保单例模式
   */
  constructor() {
    console.log("[EmbeddingService] Initialized");
  }
  /**
   * 检查模型是否已加载
   */
  get isLoaded() {
    return this._isLoaded;
  }
  /**
   * 获取加载错误信息
   */
  get loadError() {
    return this._loadError;
  }
  /**
   * 获取模型名称
   */
  get modelName() {
    return this.MODEL_NAME;
  }
  /**
   * 初始化并加载 CLIP 模型
   */
  async initialize() {
    if (this._isLoaded) {
      console.log("[EmbeddingService] Model already loaded");
      return;
    }
    if (this._loadError) {
      throw new Error(`Model load failed: ${this._loadError}`);
    }
    console.log("[EmbeddingService] Starting model initialization...");
    this._loadStartTime = Date.now();
    try {
      this.extractor = await pipeline("feature-extraction", this.MODEL_NAME);
      this._isLoaded = true;
      const loadTime = Date.now() - this._loadStartTime;
      console.log(`[EmbeddingService] Model loaded successfully in ${loadTime}ms`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._loadError = errorMessage;
      console.error("[EmbeddingService] Failed to load model:", errorMessage);
      throw error;
    }
  }
  /**
   * 文本转向量
   * @param text 输入文本
   * @returns 512 维归一化向量
   */
  async textToEmbedding(text) {
    const startTime = Date.now();
    try {
      await this.ensureModelLoaded();
      const output = await this.extractor(text, {
        pooling: "mean",
        normalize: true
      });
      const vector = Array.from(output.data);
      const processingTime = Date.now() - startTime;
      console.log(`[EmbeddingService] Text embedding generated in ${processingTime}ms`);
      return {
        success: true,
        vector,
        processingTimeMs: processingTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[EmbeddingService] Text embedding failed:", errorMessage);
      return {
        success: false,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime
      };
    }
  }
  /**
   * 图片转向量
   * @param imagePath 图片文件路径
   * @returns 512 维归一化向量
   */
  async imageToEmbedding(imagePath) {
    const startTime = Date.now();
    try {
      await this.ensureModelLoaded();
      const fs = await import("fs/promises");
      try {
        await fs.access(imagePath);
      } catch {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      const output = await this.extractor(imagePath, {
        pooling: "mean",
        normalize: true
      });
      const vector = Array.from(output.data);
      const processingTime = Date.now() - startTime;
      console.log(`[EmbeddingService] Image embedding generated in ${processingTime}ms`);
      return {
        success: true,
        vector,
        processingTimeMs: processingTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[EmbeddingService] Image embedding failed:", errorMessage);
      return {
        success: false,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime
      };
    }
  }
  /**
   * 批量处理图片转向量
   * @param imagePaths 图片路径数组
   * @param onProgress 进度回调
   * @returns 嵌入结果数组
   */
  async imageToEmbeddingsBatch(imagePaths, onProgress) {
    const results = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const result = await this.imageToEmbedding(imagePaths[i]);
      results.push(result);
      onProgress?.(i + 1, imagePaths.length);
    }
    return results;
  }
  /**
   * 获取模型状态
   */
  getModelStatus() {
    return {
      isLoaded: this._isLoaded,
      modelName: this.MODEL_NAME,
      modelPath: this.CACHE_DIR,
      loadedAt: this._isLoaded ? /* @__PURE__ */ new Date() : void 0
    };
  }
  /**
   * 确保模型已加载
   */
  async ensureModelLoaded() {
    if (!this._isLoaded) {
      await this.initialize();
    }
  }
  /**
   * 释放模型资源
   */
  async dispose() {
    if (this.extractor) {
      this.extractor = null;
      this._isLoaded = false;
      console.log("[EmbeddingService] Model disposed");
    }
  }
}
const getEmbeddingService$1 = () => EmbeddingService.getInstance();
class BackgroundVectorService {
  queue = /* @__PURE__ */ new Map();
  currentTaskId = null;
  database;
  isProcessing = false;
  constructor(database2) {
    this.database = database2 || new PhotoDatabase();
  }
  /**
   * 添加批量生成任务
   */
  addGenerateTask(photoUuids) {
    const taskId = `vector_task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.queue.set(taskId, {
      id: taskId,
      photoUuids,
      status: "pending",
      progress: 0,
      total: photoUuids.length,
      successCount: 0,
      failedCount: 0,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    });
    this.processQueue();
    return taskId;
  }
  /**
   * 添加单张照片到向量生成队列
   */
  addPhoto(photoUuid) {
    this.addGenerateTask([photoUuid]);
  }
  /**
   * 处理任务队列
   */
  async processQueue() {
    if (this.isProcessing) return;
    let pendingTask = null;
    for (const task of this.queue.values()) {
      if (task.status === "pending") {
        pendingTask = task;
        break;
      }
    }
    if (!pendingTask) {
      this.isProcessing = false;
      return;
    }
    this.isProcessing = true;
    pendingTask.status = "processing";
    pendingTask.updatedAt = /* @__PURE__ */ new Date();
    this.currentTaskId = pendingTask.id;
    const embeddingService = getEmbeddingService$1();
    if (!embeddingService.isLoaded) {
      await embeddingService.initialize();
    }
    console.log(`[BackgroundVector] 开始处理任务 ${pendingTask.id}，共 ${pendingTask.total} 个照片`);
    for (let i = 0; i < pendingTask.photoUuids.length; i++) {
      const photoUuid = pendingTask.photoUuids[i];
      try {
        const hasEmbedding = await this.database.hasEmbedding(photoUuid, "image");
        if (hasEmbedding) {
          pendingTask.progress++;
          pendingTask.successCount++;
          pendingTask.updatedAt = /* @__PURE__ */ new Date();
          continue;
        }
      } catch (error) {
        console.error(`[BackgroundVector] 检查向量存在性失败: ${photoUuid}`, error);
      }
      const photo = this.database.getPhotoByUuid(photoUuid);
      if (!photo || !photo.file_path) {
        pendingTask.progress++;
        pendingTask.failedCount++;
        pendingTask.updatedAt = /* @__PURE__ */ new Date();
        continue;
      }
      try {
        const result = await embeddingService.imageToEmbedding(photo.file_path);
        if (result.success && result.vector) {
          await this.database.saveEmbedding(photoUuid, result.vector, "image");
          pendingTask.successCount++;
          console.log(`[BackgroundVector] 向量生成成功: ${photoUuid}`);
        } else {
          pendingTask.failedCount++;
          console.error(`[BackgroundVector] 向量生成失败: ${photoUuid}`, result.error);
        }
      } catch (error) {
        pendingTask.failedCount++;
        console.error(`[BackgroundVector] 向量生成异常: ${photoUuid}`, error);
      }
      pendingTask.progress++;
      pendingTask.updatedAt = /* @__PURE__ */ new Date();
    }
    pendingTask.status = pendingTask.failedCount === pendingTask.total ? "failed" : "completed";
    pendingTask.updatedAt = /* @__PURE__ */ new Date();
    console.log(`[BackgroundVector] 任务 ${pendingTask.id} 完成: 成功 ${pendingTask.successCount}, 失败 ${pendingTask.failedCount}`);
    this.currentTaskId = null;
    this.processQueue();
  }
  /**
   * 获取任务状态
   */
  getTaskStatus(taskId) {
    return this.queue.get(taskId);
  }
  /**
   * 获取当前正在处理的任务
   */
  getCurrentTask() {
    if (this.currentTaskId) {
      return this.queue.get(this.currentTaskId) || null;
    }
    return null;
  }
  /**
   * 获取所有任务
   */
  getAllTasks() {
    return Array.from(this.queue.values());
  }
  /**
   * 取消任务
   */
  cancelTask(taskId) {
    const task = this.queue.get(taskId);
    if (task && (task.status === "pending" || task.status === "processing")) {
      task.status = "failed";
      task.updatedAt = /* @__PURE__ */ new Date();
      return true;
    }
    return false;
  }
  /**
   * 清理已完成的任务
   */
  cleanupCompletedTasks() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1e3;
    for (const [taskId, task] of this.queue.entries()) {
      if (task.status === "completed" && task.updatedAt.getTime() < oneDayAgo) {
        this.queue.delete(taskId);
      }
    }
  }
  /**
   * 获取统计信息
   */
  getStats() {
    let pending = 0, processing = 0, completed = 0, failed = 0;
    for (const task of this.queue.values()) {
      switch (task.status) {
        case "pending":
          pending++;
          break;
        case "processing":
          processing++;
          break;
        case "completed":
          completed++;
          break;
        case "failed":
          failed++;
          break;
      }
    }
    return { pending, processing, completed, failed };
  }
}
const backgroundVectorService = new BackgroundVectorService();
class HybridEmbeddingService {
  database = null;
  pendingRequests = /* @__PURE__ */ new Map();
  requestIdCounter = 0;
  _isLoaded = false;
  _loadError = null;
  _rendererAvailable = false;
  constructor(database2) {
    this.database = database2 || null;
    this.setupResponseListeners();
  }
  /**
   * 设置 IPC 响应监听器
   */
  setupResponseListeners() {
    const { ipcMain: ipcMain2 } = require("electron");
    ipcMain2.on("embedding:init-response", (event, result) => {
      this._isLoaded = result.success;
      this._loadError = result.error || null;
      this._rendererAvailable = result.success;
      console.log(`[HybridEmbedding] 渲染进程模型初始化: ${result.success ? "成功" : "失败"}`);
    });
    ipcMain2.on("embedding:status-response", (event, status) => {
      this._rendererAvailable = status.loaded;
      console.log(`[HybridEmbedding] 渲染进程状态: ${this._rendererAvailable ? "可用" : "不可用"}`);
    });
    ipcMain2.on("embedding:generate-response", (event, response) => {
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timeout);
        if (response.success) {
          pending.resolve(response);
        } else {
          pending.reject(new Error(response.error || "Unknown error"));
        }
        this.pendingRequests.delete(response.id);
      }
    });
  }
  /**
   * 获取模型状态
   */
  getModelStatus() {
    return {
      loaded: this._isLoaded,
      modelName: "Xenova/clip-vit-base-patch32",
      loadError: this._loadError,
      rendererAvailable: this._rendererAvailable
    };
  }
  /**
   * 初始化 CLIP 模型（在渲染进程中）
   */
  async initialize() {
    try {
      console.log("[HybridEmbedding] 正在初始化 CLIP 模型...");
      const { BrowserWindow: BrowserWindow2 } = require("electron");
      const windows = BrowserWindow2.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send("embedding:init-request");
        await new Promise((resolve2) => {
          const timeout = setTimeout(() => {
            console.warn("[HybridEmbedding] 渲染进程初始化超时");
            resolve2();
          }, 5e3);
          const { ipcMain: ipcMain2 } = require("electron");
          const handler = (event, result) => {
            this._isLoaded = result.success;
            this._loadError = result.error || null;
            this._rendererAvailable = result.success;
            ipcMain2.off("embedding:init-response", handler);
            clearTimeout(timeout);
            resolve2();
          };
          ipcMain2.on("embedding:init-response", handler);
        });
      } else {
        console.warn("[HybridEmbedding] 没有可用的渲染进程窗口");
        this._loadError = "No renderer window available";
      }
      if (this._isLoaded) {
        console.log("[HybridEmbedding] CLIP 模型初始化成功");
        return { success: true };
      } else {
        console.warn("[HybridEmbedding] CLIP 模型初始化失败或超时");
        return { success: false, error: this._loadError || "Initialization timeout" };
      }
    } catch (error) {
      this._loadError = error instanceof Error ? error.message : String(error);
      console.error("[HybridEmbedding] 初始化失败:", this._loadError);
      return { success: false, error: this._loadError };
    }
  }
  /**
   * 通过 IPC 请求渲染进程生成向量
   */
  async requestEmbedding(type, data) {
    const requestId = `emb_${++this.requestIdCounter}_${Date.now()}`;
    const { BrowserWindow: BrowserWindow2 } = require("electron");
    const windows = BrowserWindow2.getAllWindows();
    if (windows.length === 0 || !this._rendererAvailable) {
      return this.fallbackEmbedding(type, data);
    }
    return new Promise((resolve2, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          console.warn(`[HybridEmbedding] 请求超时: ${requestId}`);
          this.fallbackEmbedding(type, data).then(resolve2).catch(reject);
        }
      }, 12e4);
      this.pendingRequests.set(requestId, { resolve: resolve2, reject, timeout });
      windows[0].webContents.send("embedding:generate-request", {
        id: requestId,
        type,
        data
      });
    });
  }
  /**
   * 降级方案：当渲染进程不可用时使用
   */
  async fallbackEmbedding(type, data) {
    console.warn(`[HybridEmbedding] 使用降级方案: ${type}`);
    if (type === "text") {
      const words = data.toLowerCase().split(/\s+/);
      const vocabulary = /* @__PURE__ */ new Map();
      for (const word of words) {
        if (word.length > 2) {
          vocabulary.set(word, (vocabulary.get(word) || 0) + 1);
        }
      }
      const dimension = 512;
      const vector = new Array(dimension).fill(0);
      let index = 0;
      for (const [word, count] of vocabulary) {
        if (index < dimension) {
          const hash = this.hashString(word);
          vector[index % dimension] += count * Math.sin(hash);
          vector[(index + 1) % dimension] += count * Math.cos(hash);
        }
        index++;
      }
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      if (norm > 0) {
        for (let i = 0; i < vector.length; i++) {
          vector[i] /= norm;
        }
      }
      return {
        success: true,
        vector: {
          values: vector,
          dimension
        },
        processingTimeMs: 0
      };
    } else {
      return {
        success: false,
        error: "Renderer not available, cannot process images",
        processingTimeMs: 0
      };
    }
  }
  /**
   * 字符串哈希
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  /**
   * 文本转向量
   */
  async textToEmbedding(text) {
    console.log(`[HybridEmbedding] 文本转向量: "${text.substring(0, 50)}..."`);
    return await this.requestEmbedding("text", text);
  }
  /**
   * 图片转向量
   */
  async imageToEmbedding(imagePath) {
    console.log(`[HybridEmbedding] 图片转向量: ${imagePath}`);
    const result = await this.requestEmbedding("image", imagePath);
    if (result.success && result.vector && this.database) {
      try {
        const photoUuid = this.extractPhotoUuidFromPath(imagePath);
        if (photoUuid) {
          const vectorValues = result.vector.values || result.vector;
          await this.database.saveEmbedding(photoUuid, vectorValues, "image");
          console.log(`[HybridEmbedding] 向量已保存: ${photoUuid}`);
        }
      } catch (error) {
        console.error("[HybridEmbedding] 保存向量失败:", error);
      }
    }
    return result;
  }
  /**
   * 从文件路径提取照片 UUID
   */
  extractPhotoUuidFromPath(path) {
    const match = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return match ? match[1] : null;
  }
}
let embeddingInstance = null;
function getEmbeddingService() {
  if (!embeddingInstance) {
    embeddingInstance = new HybridEmbeddingService();
  }
  return embeddingInstance;
}
class FaceDetectionService {
  modelsPath;
  isLoaded = false;
  abortController = null;
  minConfidence = 0.5;
  maxFaces = 10;
  tfBackendReady = false;
  constructor(config) {
    this.modelsPath = config?.modelsPath || resolve(
      process.cwd(),
      "node_modules/@vladmandic/face-api/model"
    );
    if (config?.minConfidence) this.minConfidence = config.minConfidence;
    if (config?.maxFaces) this.maxFaces = config.maxFaces;
  }
  async ensureTfBackend() {
    if (!this.tfBackendReady) {
      await tf.setBackend("cpu");
      await tf.ready();
      this.tfBackendReady = true;
      console.log("[FaceDetection] TF.js 后端已设置为 CPU 模式");
      const numTensors = tf.memory().numTensors;
      if (numTensors > 100) {
        console.warn(`[FaceDetection] 检测到 ${numTensors} 个未释放的 tensor，执行清理`);
        tf.disposeVariables();
      }
    }
  }
  /**
   * 加载检测模型
   */
  async loadModels() {
    if (this.isLoaded) {
      return { success: true };
    }
    try {
      await this.ensureTfBackend();
      console.log("[FaceDetection] 加载 face-api.js 模型...");
      console.log(`[FaceDetection] 📁 模型路径: ${this.modelsPath}`);
      const requiredModels = [
        "tiny_face_detector_model-weights_manifest.json",
        "face_landmark_68_model-weights_manifest.json",
        "face_recognition_model-weights_manifest.json"
      ];
      for (const model of requiredModels) {
        const modelPath = resolve(this.modelsPath, model);
        const exists = existsSync(modelPath);
        console.log(`[FaceDetection] ${exists ? "✅" : "❌"} ${model}`);
        if (!exists) {
          return { success: false, error: `模型文件不存在: ${model}` };
        }
      }
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromDisk(this.modelsPath),
        faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelsPath),
        faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelsPath)
      ]);
      this.isLoaded = true;
      console.log("[FaceDetection] 模型加载成功");
      return { success: true };
    } catch (error) {
      console.error("[FaceDetection] 模型加载失败:", error);
      return { success: false, error: String(error) };
    }
  }
  /**
   * 检查模型状态
   */
  getModelStatus() {
    return {
      loaded: this.isLoaded,
      modelsPath: this.modelsPath,
      configured: this.isLoaded
    };
  }
  /**
   * 检测照片中的人脸
   */
  async detect(imagePath, options = {}) {
    const startTime = Date.now();
    const { minConfidence = this.minConfidence } = options;
    console.log(`[FaceDetection] 🎯 开始检测: ${imagePath.split("/").pop()}`);
    if (!existsSync(imagePath)) {
      console.error(`[FaceDetection] ❌ 文件不存在: ${imagePath}`);
      return {
        success: false,
        detections: [],
        error: "图片文件不存在",
        processingTimeMs: Date.now() - startTime
      };
    }
    try {
      const loadResult = await this.loadModels();
      if (!loadResult.success) {
        console.error(`[FaceDetection] ❌ 模型加载失败: ${loadResult.error}`);
        return {
          success: false,
          detections: [],
          error: `模型加载失败: ${loadResult.error}`,
          processingTimeMs: Date.now() - startTime
        };
      }
      console.log(`[FaceDetection] 🤖 模型就绪，开始处理图像...`);
      const { data, info } = await sharp(imagePath).raw().ensureAlpha().resize(416, 416, { fit: "inside" }).toBuffer({ resolveWithObject: true });
      const { width, height } = info;
      const rgbData = new Uint8Array(width * height * 3);
      for (let i = 0; i < width * height; i++) {
        rgbData[i * 3] = data[i * 4];
        rgbData[i * 3 + 1] = data[i * 4 + 1];
        rgbData[i * 3 + 2] = data[i * 4 + 2];
      }
      const imageTensor = tf.tensor3d(rgbData, [height, width, 3]);
      let detections = [];
      try {
        const detectionPromise = faceapi.detectAllFaces(imageTensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: minConfidence })).withFaceLandmarks().withFaceDescriptors();
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("人脸检测超时 (45s)")), 45e3)
        );
        detections = await Promise.race([detectionPromise, timeoutPromise]);
        console.log(`[FaceDetection] 📊 原始检测结果: ${detections.length} 张人脸`);
      } finally {
        imageTensor.dispose();
      }
      const faces = detections.filter((d) => d.descriptor && d.descriptor.length === 128).map((d) => ({
        box: {
          x: d.detection.box.x,
          y: d.detection.box.y,
          width: d.detection.box.width,
          height: d.detection.box.height
        },
        confidence: d.detection.score,
        landmarks: this.convertLandmarks(d.landmarks),
        descriptor: Array.from(d.descriptor)
        // Float32Array -> number[] (128维)
      }));
      console.log(`[FaceDetection] 📊 有有效描述符的人脸: ${faces.length}/${detections.length}`);
      const limitedFaces = faces.slice(0, this.maxFaces);
      console.log(`[FaceDetection] ✅ 检测完成: ${limitedFaces.length} 张人脸 (${Date.now() - startTime}ms)`);
      return {
        success: true,
        detections: limitedFaces,
        processingTimeMs: Date.now() - startTime
      };
    } catch (error) {
      console.error("[FaceDetection] 检测失败:", error);
      return {
        success: false,
        detections: [],
        error: error instanceof Error ? error.message : "检测失败",
        processingTimeMs: Date.now() - startTime
      };
    }
  }
  /**
   * 转换 face-api.js 的 landmarks 到内部格式
   */
  convertLandmarks(landmarks) {
    const positions = landmarks.positions;
    return {
      jawOutline: positions.slice(0, 17).map((p) => ({ x: p.x, y: p.y })),
      nose: positions.slice(27, 36).map((p) => ({ x: p.x, y: p.y })),
      mouth: positions.slice(48, 68).map((p) => ({ x: p.x, y: p.y })),
      leftEye: positions.slice(36, 42).map((p) => ({ x: p.x, y: p.y })),
      rightEye: positions.slice(42, 48).map((p) => ({ x: p.x, y: p.y }))
    };
  }
  /**
   * 批量检测
   */
  async detectBatch(imagePaths, options = {}, onProgress) {
    const startTime = Date.now();
    const results = /* @__PURE__ */ new Map();
    let totalDetected = 0;
    this.abortController = new AbortController();
    for (let i = 0; i < imagePaths.length; i++) {
      if (this.abortController?.signal.aborted) {
        console.log("[FaceDetection] 检测任务已取消");
        break;
      }
      const imagePath = imagePaths[i];
      const filename = imagePath.split("/").pop() || `photo_${i}`;
      onProgress?.({
        current: i + 1,
        total: imagePaths.length,
        currentPhoto: filename,
        detectedFaces: totalDetected,
        status: "processing"
      });
      const result = await this.detect(imagePath, options);
      results.set(imagePath, result);
      if (result.success) {
        totalDetected += result.detections.length;
      }
      console.log(`[FaceDetection] ${i + 1}/${imagePaths.length}: ${filename} - ${result.detections.length} 张人脸`);
    }
    onProgress?.({
      current: imagePaths.length,
      total: imagePaths.length,
      currentPhoto: "",
      detectedFaces: totalDetected,
      status: this.abortController?.signal.aborted ? "cancelled" : "completed"
    });
    return {
      results,
      totalDetected,
      processingTimeMs: Date.now() - startTime
    };
  }
  /**
   * 取消检测任务
   */
  cancel() {
    this.abortController?.abort();
    console.log("[FaceDetection] 检测任务已取消");
  }
  /**
   * 检测并保存到数据库（双向量版本）
   * 同时生成 128维 face_embedding 和 512维 semantic_embedding
   */
  async detectAndSave(imagePath, database2) {
    const startTime = Date.now();
    if (!existsSync(imagePath)) {
      console.warn(`[FaceDetection] 文件不存在，跳过: ${imagePath}`);
      return {
        success: false,
        detections: [],
        error: "文件不存在",
        processingTimeMs: Date.now() - startTime
      };
    }
    const result = await this.detect(imagePath, {});
    if (result.success && result.detections.length > 0) {
      const photo = database2.getPhotoByFilePath(imagePath);
      if (!photo) {
        console.warn(`[FaceDetection] 数据库中未找到照片: ${imagePath}`);
        return result;
      }
      const photoId = photo.id ?? null;
      if (!photoId) {
        console.warn(`[FaceDetection] 照片缺少 id，跳过: ${imagePath}`);
        return result;
      }
      const imageInfo = await sharp(imagePath).metadata();
      const imgWidth = imageInfo.width || 1;
      const imgHeight = imageInfo.height || 1;
      const sharpInstance = sharp(imagePath);
      const facesToSave = [];
      for (let index = 0; index < result.detections.length; index++) {
        const face = result.detections[index];
        const faceId = `${photoId}_${index}_${Date.now()}`;
        const absX = Math.round(face.box.x / 416 * imgWidth);
        const absY = Math.round(face.box.y / 416 * imgHeight);
        const absWidth = Math.round(face.box.width / 416 * imgWidth);
        const absHeight = Math.round(face.box.height / 416 * imgHeight);
        const cropX = Math.max(0, absX);
        const cropY = Math.max(0, absY);
        const cropWidth = Math.min(absWidth, imgWidth - cropX);
        const cropHeight = Math.min(absHeight, imgHeight - cropY);
        let semanticEmbedding = void 0;
        try {
          const faceBuffer = await sharpInstance.clone().extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight }).resize(224, 224, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
          const faceBase64 = `data:image/jpeg;base64,${faceBuffer.toString("base64")}`;
          const embeddingService = getEmbeddingService();
          const clipResult = await embeddingService.imageToEmbedding(faceBase64);
          if (clipResult.success && clipResult.vector) {
            semanticEmbedding = clipResult.vector.values || clipResult.vector;
            console.log(`[FaceDetection] 生成 CLIP 向量成功: ${faceId}, 维度: ${semanticEmbedding?.length}`);
          } else {
            console.warn(`[FaceDetection] CLIP 向量生成失败: ${faceId}, 错误: ${clipResult.error}`);
          }
        } catch (clipError) {
          console.warn(`[FaceDetection] 生成语义向量失败: ${faceId}`, clipError);
        }
        facesToSave.push({
          id: faceId,
          bbox_x: face.box.x,
          bbox_y: face.box.y,
          bbox_width: face.box.width,
          bbox_height: face.box.height,
          confidence: face.confidence,
          embedding: face.descriptor,
          // 128 维 face-api 向量 (兼容旧字段)
          face_embedding: face.descriptor,
          // 128 维 face-api 向量
          semantic_embedding: semanticEmbedding,
          // 512 维 CLIP 向量
          vector_version: semanticEmbedding ? 2 : 1
          // 2=双向量, 1=只有face向量
        });
      }
      try {
        database2.saveDetectedFaces(photoId, facesToSave);
        const withSemantic = facesToSave.filter((f) => f.semantic_embedding).length;
        console.log(`[FaceDetection] 保存 ${facesToSave.length} 张人脸: ${withSemantic} 张有语义向量, ${facesToSave.length - withSemantic} 张只有人脸向量`);
      } catch (e) {
        console.error(`[FaceDetection] 保存人脸失败: ${imagePath}`, e);
      }
    }
    return result;
  }
  /**
   * 检测照片中的人脸并返回边界框（简化版）
   */
  async detectFaces(imagePath) {
    const result = await this.detect(imagePath);
    return {
      faces: result.detections.map((d) => d.box),
      processingTimeMs: result.processingTimeMs
    };
  }
  /**
   * 获取检测统计
   */
  getStats() {
    return {
      modelLoaded: this.isLoaded,
      configured: this.isLoaded
    };
  }
}
const faceDetectionService = new FaceDetectionService();
const faceDetectionService$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  FaceDetectionService,
  faceDetectionService
}, Symbol.toStringTag, { value: "Module" }));
class ScanJobService {
  db;
  constructor(db) {
    this.db = db;
  }
  /**
   * 创建新的扫描任务
   * @param totalPhotos 总照片数
   * @returns 任务ID
   */
  createJob(totalPhotos) {
    const id = v4();
    const now = Date.now();
    this.db.run(
      `
      INSERT INTO scan_jobs (id, status, total_photos, processed_photos, failed_photos,
                            last_processed_id, started_at, completed_at, last_heartbeat, error_message)
      VALUES (?, 'detecting', ?, 0, 0, NULL, ?, NULL, ?, NULL)
    `,
      [id, totalPhotos, now, now]
    );
    console.log("[ScanJobService] Created job:", id, "totalPhotos:", totalPhotos);
    return id;
  }
  /**
   * 更新任务进度
   * @param jobId 任务ID
   * @param processed 已处理数量
   * @param lastPhotoId 最后处理的照片ID
   */
  updateProgress(jobId, processed, lastPhotoId) {
    const now = Date.now();
    this.db.run(
      `
      UPDATE scan_jobs
      SET processed_photos = ?, last_processed_id = ?, last_heartbeat = ?
      WHERE id = ?
    `,
      [processed, lastPhotoId, now, jobId]
    );
    console.log(`[ScanJobService] Updated progress: ${processed}, lastPhotoId: ${lastPhotoId}`);
  }
  /**
   * 更新心跳时间（每处理一张照片时调用）
   * @param jobId 任务ID
   */
  updateHeartbeat(jobId) {
    const now = Date.now();
    this.db.run(
      `
      UPDATE scan_jobs
      SET last_heartbeat = ?
      WHERE id = ?
    `,
      [now, jobId]
    );
  }
  /**
   * 增加失败计数
   * @param jobId 任务ID
   */
  incrementFailedCount(jobId) {
    this.db.run(
      `
      UPDATE scan_jobs
      SET failed_photos = failed_photos + 1, last_heartbeat = ?
      WHERE id = ?
    `,
      [Date.now(), jobId]
    );
  }
  /**
   * 完成任务
   * @param jobId 任务ID
   * @param detectedFaces 检测到的人脸数量
   */
  completeJob(jobId, detectedFaces) {
    const now = Date.now();
    this.db.run(
      `
      UPDATE scan_jobs
      SET status = 'completed', completed_at = ?, last_heartbeat = ?
      WHERE id = ?
    `,
      [now, now, jobId]
    );
    console.log("[ScanJobService] Completed job:", jobId, "detectedFaces:", detectedFaces);
  }
  /**
   * 标记任务为失败
   * @param jobId 任务ID
   * @param error 错误信息
   */
  failJob(jobId, error) {
    const now = Date.now();
    this.db.run(
      `
      UPDATE scan_jobs
      SET status = 'failed', error_message = ?, last_heartbeat = ?
      WHERE id = ?
    `,
      [error, now, jobId]
    );
    console.log("[ScanJobService] Failed job:", jobId, "error:", error);
  }
  /**
   * 取消任务
   * @param jobId 任务ID
   */
  cancelJob(jobId) {
    const now = Date.now();
    this.db.run(
      `
      UPDATE scan_jobs
      SET status = 'cancelled', completed_at = ?, last_heartbeat = ?
      WHERE id = ?
    `,
      [now, now, jobId]
    );
    console.log("[ScanJobService] Cancelled job:", jobId);
  }
  /**
   * 获取活跃任务（未完成的任务）
   * @returns 活跃任务或null
   */
  getActiveJob() {
    const result = this.db.query(
      `
      SELECT * FROM scan_jobs
      WHERE status NOT IN ('completed', 'failed', 'cancelled')
      ORDER BY started_at DESC
      LIMIT 1
    `
    );
    if (result.length === 0) return null;
    return this.rowToScanJob(result[0]);
  }
  /**
   * 根据ID获取任务
   * @param jobId 任务ID
   * @returns 任务或null
   */
  getJobById(jobId) {
    const result = this.db.query("SELECT * FROM scan_jobs WHERE id = ?", [jobId]);
    if (result.length === 0) return null;
    return this.rowToScanJob(result[0]);
  }
  /**
   * 检查任务是否过期（超过5分钟没有心跳）
   * @param job 任务
   * @returns 是否过期
   */
  isJobStale(job) {
    const fiveMinutes = 5 * 60 * 1e3;
    return Date.now() - job.lastHeartbeat > fiveMinutes;
  }
  /**
   * 标记任务为失败（用于过期任务）
   * @param jobId 任务ID
   */
  markJobAsFailed(jobId) {
    this.failJob(jobId, "Task timed out - no heartbeat for 5 minutes");
  }
  /**
   * 获取所有任务（用于管理界面）
   * @param limit 限制数量
   * @returns 任务列表
   */
  getAllJobs(limit = 100) {
    const result = this.db.query(
      `
      SELECT * FROM scan_jobs
      ORDER BY started_at DESC
      LIMIT ?
    `,
      [limit]
    );
    return result.map((row) => this.rowToScanJob(row));
  }
  /**
   * 获取任务统计
   * @returns 统计信息
   */
  getStats() {
    const total = this.db.query("SELECT COUNT(*) as count FROM scan_jobs")[0]?.count || 0;
    const active = this.db.query(
      "SELECT COUNT(*) as count FROM scan_jobs WHERE status NOT IN ('completed', 'failed', 'cancelled')"
    )[0]?.count || 0;
    const completed = this.db.query("SELECT COUNT(*) as count FROM scan_jobs WHERE status = 'completed'")[0]?.count || 0;
    const failed = this.db.query("SELECT COUNT(*) as count FROM scan_jobs WHERE status = 'failed'")[0]?.count || 0;
    const cancelled = this.db.query("SELECT COUNT(*) as count FROM scan_jobs WHERE status = 'cancelled'")[0]?.count || 0;
    return { total, active, completed, failed, cancelled };
  }
  /**
   * 删除旧任务（清理历史记录）
   * @param beforeDate 删除此日期之前的任务（时间戳）
   * @returns 删除的任务数
   */
  cleanupOldJobs(beforeDate) {
    const result = this.db.run("DELETE FROM scan_jobs WHERE started_at < ?", [beforeDate]);
    console.log("[ScanJobService] Cleaned up old jobs before:", beforeDate);
    return result.lastInsertRowid >= 0 ? 1 : 0;
  }
  /**
   * 将数据库行转换为ScanJob对象
   */
  rowToScanJob(row) {
    return {
      id: row.id,
      status: row.status,
      totalPhotos: row.total_photos,
      processedPhotos: row.processed_photos,
      failedPhotos: row.failed_photos,
      lastProcessedId: row.last_processed_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      lastHeartbeat: row.last_heartbeat,
      errorMessage: row.error_message
    };
  }
}
let scanJobService = null;
function initializeScanJobService(db) {
  scanJobService = new ScanJobService(db);
  console.log("[ScanJobService] Initialized");
  return scanJobService;
}
function blobToArray(blob) {
  if (!blob) return null;
  try {
    console.log("[blobToArray] 输入类型:", typeof blob, "构造函数:", blob?.constructor?.name, "长度:", blob?.length);
    if (blob instanceof Uint8Array) {
      console.log("[blobToArray] 检测到 Uint8Array");
      return Array.from(new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4));
    }
    if (typeof blob === "object" && blob.constructor === Buffer) {
      console.log("[blobToArray] 检测到 Buffer");
      return Array.from(new Float32Array(blob));
    }
    if (blob instanceof ArrayBuffer) {
      console.log("[blobToArray] 检测到 ArrayBuffer");
      return Array.from(new Float32Array(blob));
    }
    if (ArrayBuffer.isView(blob)) {
      console.log("[blobToArray] 检测到 ArrayBufferView");
      return Array.from(new Float32Array(blob.buffer));
    }
    if (Array.isArray(blob)) {
      console.log("[blobToArray] 检测到普通数组");
      return blob;
    }
    console.log("[blobToArray] 无法识别的类型，返回 null");
    return null;
  } catch (e) {
    console.error("[blobToArray] 转换失败:", e);
    return null;
  }
}
class FaceMatchingService {
  database;
  constructor(database2) {
    this.database = database2 || new PhotoDatabase();
  }
  /**
   * 获取所有人脸描述符（从 detected_faces 表获取 128维 face_embedding）
   */
  async getAllFaceDescriptors() {
    const descriptors = [];
    const detectedFaces = this.database.query(`
      SELECT df.*, p.id as person_id, p.name as person_name
      FROM detected_faces df
      LEFT JOIN persons p ON df.person_id = p.id
      ORDER BY df.confidence DESC
    `);
    for (const row of detectedFaces) {
      let faceEmbedding = blobToArray(row.face_embedding);
      if (!faceEmbedding || faceEmbedding.length === 0) {
        faceEmbedding = blobToArray(row.embedding);
      }
      descriptors.push({
        faceId: row.id,
        photoId: row.photo_id,
        personId: row.person_id,
        descriptor: faceEmbedding || [],
        boundingBox: {
          x: row.bbox_x,
          y: row.bbox_y,
          width: row.bbox_width,
          height: row.bbox_height
        },
        confidence: row.confidence || 0,
        isManual: !!row.is_manual
      });
    }
    return descriptors;
  }
  /**
   * 获取未匹配的人脸（没有分配给人物的人脸）
   */
  async getUnmatchedFaces() {
    const detectedFaces = this.database.query(`
      SELECT df.*, p.id as person_id
      FROM detected_faces df
      LEFT JOIN persons p ON df.person_id = p.id
      WHERE df.person_id IS NULL
      ORDER BY df.confidence DESC
    `);
    return detectedFaces.map((row) => {
      let faceEmbedding = blobToArray(row.face_embedding);
      if (!faceEmbedding || faceEmbedding.length === 0) {
        faceEmbedding = blobToArray(row.embedding);
      }
      return {
        faceId: row.id,
        photoId: row.photo_id,
        personId: row.person_id,
        descriptor: faceEmbedding || [],
        boundingBox: {
          x: row.bbox_x,
          y: row.bbox_y,
          width: row.bbox_width,
          height: row.bbox_height
        },
        confidence: row.confidence || 0,
        isManual: !!row.is_manual
      };
    });
  }
  /**
   * 计算两个人脸的相似度（余弦相似度）
   */
  calculateSimilarity(descriptor1, descriptor2) {
    if (!descriptor1 || !descriptor2 || descriptor1.length === 0 || descriptor2.length === 0) {
      return 0;
    }
    const length = Math.min(descriptor1.length, descriptor2.length);
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < length; i++) {
      dotProduct += descriptor1[i] * descriptor2[i];
      norm1 += descriptor1[i] * descriptor1[i];
      norm2 += descriptor2[i] * descriptor2[i];
    }
    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
  /**
   * 查找相似人脸
   */
  async findSimilarFaces(faceId, options = {}) {
    const { minSimilarity = 0.4, threshold = 0.45 } = options;
    const targetFace = await this.getFaceById(faceId);
    if (!targetFace || !targetFace.descriptor || targetFace.descriptor.length === 0) {
      console.log("[FaceMatching] 目标人脸不存在或没有嵌入向量");
      return [];
    }
    const allFaces = await this.getAllFaceDescriptors();
    const targetDescriptor = targetFace.descriptor;
    const similarities = [];
    for (const face of allFaces) {
      if (String(face.faceId) === String(faceId)) continue;
      if (!face.descriptor || face.descriptor.length === 0) continue;
      const similarity = this.calculateSimilarity(targetDescriptor, face.descriptor);
      if (similarity >= minSimilarity) {
        similarities.push({
          faceId: face.faceId,
          similarity,
          photoId: face.photoId
        });
      }
    }
    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.filter((s) => s.similarity >= threshold);
  }
  /**
   * 计算人物中心点（centroid）
   */
  calculatePersonCentroid(personId) {
    const faces = this.database.query(`
      SELECT face_embedding, embedding
      FROM detected_faces
      WHERE person_id = ? AND (face_embedding IS NOT NULL OR embedding IS NOT NULL)
    `, [personId]);
    if (faces.length === 0) return null;
    const vectors = [];
    for (const face of faces) {
      let vec = blobToArray(face.face_embedding);
      if (!vec || vec.length === 0) {
        vec = blobToArray(face.embedding);
      }
      if (vec && vec.length > 0) {
        vectors.push(vec);
      }
    }
    if (vectors.length === 0) return null;
    const dimension = vectors[0].length;
    const centroid = new Array(dimension).fill(0);
    for (const vec of vectors) {
      for (let i = 0; i < dimension; i++) {
        centroid[i] += vec[i];
      }
    }
    for (let i = 0; i < dimension; i++) {
      centroid[i] /= vectors.length;
    }
    return centroid;
  }
  /**
   * 获取所有已命名人物及其中心点
   */
  getNamedPersonsWithCentroids() {
    const persons = this.database.query(`
      SELECT id, name FROM persons WHERE name IS NOT NULL AND name != ''
    `);
    const result = [];
    for (const person of persons) {
      const centroid = this.calculatePersonCentroid(person.id);
      if (centroid) {
        result.push({ id: person.id, name: person.name, centroid });
      }
    }
    return result;
  }
  /**
   * 查找最相似的已命名人物
   */
  findBestMatchingPerson(faceDescriptor, namedPersons, threshold) {
    let bestMatch = null;
    let bestSimilarity = threshold;
    for (const person of namedPersons) {
      const similarity = this.calculateSimilarity(faceDescriptor, person.centroid);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = { id: person.id, name: person.name, similarity };
      }
    }
    return bestMatch;
  }
  /**
   * 分批处理辅助函数 - 避免阻塞事件循环
   */
  async processInBatches(items, batchSize, processor, onProgress) {
    const results = [];
    const total = items.length;
    for (let i = 0; i < total; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((item, idx) => processor(item, i + idx))
      );
      results.push(...batchResults);
      onProgress?.(Math.min(i + batchSize, total), total);
      if (i + batchSize < total) {
        await new Promise((resolve2) => setTimeout(resolve2, 0));
      }
    }
    return results;
  }
  /**
   * 自动匹配所有人脸（锚点匹配算法）
   * 1. 优先匹配到已命名人物
   * 2. 未匹配的创建为 Pending Person
   */
  async autoMatch(options = {}) {
    const startTime = Date.now();
    const {
      threshold = 0.45,
      // 🚨 降低到 0.45，提高匹配率
      maxClusterSize = 100,
      onProgress
    } = options;
    console.log("[FaceMatching] 开始自动匹配（锚点匹配算法）...");
    const unmatchedFaces = await this.getUnmatchedFaces();
    console.log(`[FaceMatching] 找到 ${unmatchedFaces.length} 张未匹配的人脸`);
    if (unmatchedFaces.length === 0) {
      return { matched: 0, clusters: [], processingTimeMs: Date.now() - startTime, message: "没有未匹配的人脸" };
    }
    const facesWithEmbeddings = unmatchedFaces.filter((f) => f.descriptor && f.descriptor.length > 0);
    console.log(`[FaceMatching] 其中 ${facesWithEmbeddings.length} 张有人脸嵌入向量`);
    if (facesWithEmbeddings.length === 0) {
      return {
        matched: 0,
        clusters: [],
        processingTimeMs: Date.now() - startTime,
        warning: "没有人脸嵌入向量，请先运行人脸检测和特征提取"
      };
    }
    const namedPersons = this.getNamedPersonsWithCentroids();
    console.log(`[FaceMatching] 已命名人物数量: ${namedPersons.length}`);
    const clusters = [];
    const assigned = /* @__PURE__ */ new Set();
    const total = facesWithEmbeddings.length;
    const BATCH_SIZE = 50;
    for (let i = 0; i < facesWithEmbeddings.length; i += BATCH_SIZE) {
      const batch = facesWithEmbeddings.slice(i, Math.min(i + BATCH_SIZE, facesWithEmbeddings.length));
      for (const face of batch) {
        onProgress?.(assigned.size, total);
        if (assigned.has(face.faceId)) continue;
        if (namedPersons.length > 0) {
          const bestMatch = this.findBestMatchingPerson(face.descriptor, namedPersons, threshold);
          if (bestMatch) {
            clusters.push({
              personId: bestMatch.id,
              faces: [face],
              confidence: bestMatch.similarity,
              suggestedName: bestMatch.name
            });
            assigned.add(face.faceId);
            continue;
          }
        }
        const cluster = {
          faces: [face],
          confidence: face.confidence
        };
        assigned.add(face.faceId);
        for (const otherFace of facesWithEmbeddings) {
          if (assigned.has(otherFace.faceId)) continue;
          if (cluster.faces.length >= maxClusterSize) break;
          const similarity = this.calculateSimilarity(
            face.descriptor || [],
            otherFace.descriptor || []
          );
          if (similarity >= threshold) {
            cluster.faces.push(otherFace);
            assigned.add(otherFace.faceId);
            cluster.confidence = Math.min(cluster.confidence, similarity);
          }
        }
        if (cluster.faces.length > 0) {
          clusters.push(cluster);
        }
      }
      if (i + BATCH_SIZE < facesWithEmbeddings.length) {
        await new Promise((resolve2) => setTimeout(resolve2, 0));
      }
    }
    console.log(`[FaceMatching] 锚点匹配完成，生成 ${clusters.length} 个聚类`);
    let personsCreated = 0;
    let pendingIndex = 1;
    const PERSON_BATCH_SIZE = 10;
    for (let i = 0; i < clusters.length; i += PERSON_BATCH_SIZE) {
      const batch = clusters.slice(i, i + PERSON_BATCH_SIZE);
      await Promise.all(batch.map(async (cluster) => {
        if (cluster.personId) {
          for (const face of cluster.faces) {
            await this.assignFaceToPerson(face.faceId, cluster.personId);
          }
          return;
        }
        const personName = `未命名 ${pendingIndex++}`;
        try {
          const result = await this.createPersonFromCluster(cluster, personName);
          if (result.success && result.personId) {
            personsCreated++;
            cluster.personId = result.personId;
            cluster.suggestedName = personName;
          }
        } catch (error) {
          console.error(`[FaceMatching] 创建人物 "${personName}" 失败:`, error);
        }
      }));
      if (i + PERSON_BATCH_SIZE < clusters.length) {
        await new Promise((resolve2) => setTimeout(resolve2, 0));
      }
    }
    if (personsCreated > 0) {
      console.log(`[FaceMatching] 自动创建了 ${personsCreated} 位未命名人物`);
    }
    return {
      matched: assigned.size,
      clusters,
      processingTimeMs: Date.now() - startTime,
      personsCreated,
      message: `匹配完成：${assigned.size}/${facesWithEmbeddings.length} 张人脸已匹配或聚类`
    };
  }
  /**
   * 为聚类创建新人物
   */
  async createPersonFromCluster(cluster, personName) {
    try {
      const personId = this.database.addPerson({
        name: personName,
        displayName: personName
      });
      console.log(`[FaceMatching] 创建人物 "${personName}" (ID: ${personId})`);
      let assignedCount = 0;
      for (const face of cluster.faces) {
        const success = await this.assignFaceToPerson(face.faceId, personId);
        if (success) assignedCount++;
      }
      console.log(`[FaceMatching] 创建人物 "${personName}"，关联 ${assignedCount}/${cluster.faces.length} 张人脸`);
      if (assignedCount === 0) {
        console.warn(`[FaceMatching] 人物 "${personName}" 未关联任何人脸，删除空人物`);
        this.database.run("DELETE FROM persons WHERE id = ?", [personId]);
        return { success: false, error: "未成功分配任何人脸" };
      }
      return { success: true, personId };
    } catch (error) {
      console.error("[FaceMatching] 创建人物失败:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "创建失败"
      };
    }
  }
  /**
   * 获取人脸详情
   */
  async getFaceById(faceId) {
    const rows = this.database.query(
      "SELECT df.*, p.id as person_id FROM detected_faces df LEFT JOIN persons p ON df.person_id = p.id WHERE df.id = ?",
      [faceId]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    let faceEmbedding = blobToArray(row.face_embedding);
    if (!faceEmbedding || faceEmbedding.length === 0) {
      faceEmbedding = blobToArray(row.embedding);
    }
    return {
      faceId: row.id,
      photoId: row.photo_id,
      personId: row.person_id,
      descriptor: faceEmbedding || [],
      boundingBox: {
        x: row.bbox_x,
        y: row.bbox_y,
        width: row.bbox_width,
        height: row.bbox_height
      },
      confidence: row.confidence || 0,
      isManual: !!row.is_manual
    };
  }
  /**
   * 将单个人脸分配给人物
   */
  async assignFaceToPerson(faceId, personId) {
    try {
      const success = this.database.markFaceAsProcessed(String(faceId), personId);
      if (success) {
        console.log(`[FaceMatching] 人脸 ${faceId} 已分配给人物 ${personId}`);
      }
      return success;
    } catch (error) {
      console.error("[FaceMatching] 分配人脸失败:", error);
      return false;
    }
  }
  /**
   * 将多个人脸分配给人物
   */
  async assignToPerson(faceIds, personId) {
    try {
      let assigned = 0;
      for (const faceId of faceIds) {
        const success = await this.assignFaceToPerson(faceId, personId);
        if (success) assigned++;
      }
      return { success: true, assigned };
    } catch (error) {
      console.error("[FaceMatching] 批量分配失败:", error);
      return {
        success: false,
        assigned: 0,
        error: String(error)
      };
    }
  }
  /**
   * 取消人脸匹配（解除人物关联）
   */
  async unmatchFace(faceId) {
    try {
      this.database.run(
        "UPDATE detected_faces SET person_id = NULL, processed = 0 WHERE id = ?",
        [faceId]
      );
      console.log(`[FaceMatching] 取消人脸 ${faceId} 的匹配`);
      return true;
    } catch (error) {
      console.error("[FaceMatching] 取消匹配失败:", error);
      return false;
    }
  }
  /**
   * 获取某人物的所有人脸
   */
  async getPersonFaces(personId) {
    const detectedFaces = this.database.query(`
      SELECT df.*, p.id as person_id
      FROM detected_faces df
      LEFT JOIN persons p ON df.person_id = p.id
      WHERE df.person_id = ?
      ORDER BY df.confidence DESC
    `, [personId]);
    return detectedFaces.map((row) => {
      let faceEmbedding = blobToArray(row.face_embedding);
      if (!faceEmbedding || faceEmbedding.length === 0) {
        faceEmbedding = blobToArray(row.embedding);
      }
      return {
        faceId: row.id,
        photoId: row.photo_id,
        personId: row.person_id,
        descriptor: faceEmbedding || [],
        boundingBox: {
          x: row.bbox_x,
          y: row.bbox_y,
          width: row.bbox_width,
          height: row.bbox_height
        },
        confidence: row.confidence || 0,
        isManual: !!row.is_manual
      };
    });
  }
  /**
   * 合并两个人物（将源人物的所有人脸合并到目标人物）
   */
  async mergePersons(sourcePersonId, targetPersonId) {
    try {
      const sourceFaces = await this.getPersonFaces(sourcePersonId);
      if (sourceFaces.length === 0) {
        return { success: true, merged: 0 };
      }
      let merged = 0;
      for (const face of sourceFaces) {
        const success = await this.assignFaceToPerson(face.faceId, targetPersonId);
        if (success) merged++;
      }
      this.database.run("DELETE FROM persons WHERE id = ?", [sourcePersonId]);
      console.log(`[FaceMatching] 合并人物 ${sourcePersonId} 到 ${targetPersonId}，合并 ${merged} 张人脸`);
      return { success: true, merged };
    } catch (error) {
      console.error("[FaceMatching] 合并失败:", error);
      return {
        success: false,
        merged: 0,
        error: String(error)
      };
    }
  }
  /**
   * 获取匹配统计
   */
  getStats() {
    const totalFaces = this.database.query("SELECT COUNT(*) as count FROM detected_faces")[0]?.count || 0;
    const matchedFaces = this.database.query("SELECT COUNT(*) as count FROM detected_faces WHERE person_id IS NOT NULL")[0]?.count || 0;
    return {
      totalFaces,
      matchedFaces,
      unmatchedFaces: totalFaces - matchedFaces,
      matchRate: totalFaces > 0 ? matchedFaces / totalFaces : 0
    };
  }
  /**
   * 获取检测统计（便捷方法）
   */
  getDetectionStats() {
    return this.database.getDetectedFacesStats();
  }
}
const faceMatchingService = new FaceMatchingService();
const faceMatchingService$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  FaceMatchingService,
  faceMatchingService
}, Symbol.toStringTag, { value: "Module" }));
class FaceDetectionQueue {
  service;
  database;
  queue = [];
  processingCount = 0;
  maxConcurrent;
  onProgress;
  onComplete;
  isRunning = false;
  abortController = null;
  hasCompleted = false;
  // 🆕 扫描任务持久化相关
  currentJobId = null;
  processedCount = 0;
  detectedFacesCount = 0;
  constructor(database2, options) {
    this.service = new FaceDetectionService();
    this.database = database2;
    this.maxConcurrent = options?.maxConcurrent || 1;
    this.onProgress = options?.onProgress;
    this.onComplete = options?.onComplete;
    this.hasCompleted = false;
    setInterval(() => {
      this.reportProgress();
    }, 500);
  }
  /**
   * 添加单个检测任务
   */
  async addTask(photoId, uuid, filePath) {
    const task = {
      photoId,
      uuid,
      filePath,
      status: "pending"
    };
    this.queue.push(task);
    console.log(`[FaceDetectionQueue] 添加任务: ${photoId} (${this.queue.length} 待处理)`);
    if (!this.isRunning) {
      await this.processQueue();
    }
  }
  /**
   * 批量添加检测任务
   */
  async addBatch(tasks) {
    for (const task of tasks) {
      await this.addTask(task.photoId, task.uuid, task.filePath);
    }
  }
  /**
   * 从数据库添加未处理的照片
   * @param limit 限制数量
   * @param afterId 可选，只添加id大于此值的照片（用于断点续传）
   */
  async addFromDatabase(limit = 100, afterId) {
    const photos = this.database.getUnprocessedPhotos(limit, afterId);
    for (const photo of photos) {
      await this.addTask(
        photo.id.toString(),
        photo.uuid,
        photo.file_path
      );
    }
    console.log(`[FaceDetectionQueue] 从数据库添加 ${photos.length} 个任务${afterId ? ` (afterId: ${afterId})` : ""}`);
    return photos.length;
  }
  /**
   * 🆕 从断点续传（恢复扫描）
   * @param lastProcessedId 最后处理的照片ID
   * @param limit 限制数量
   * @returns 添加的任务数
   */
  async resumeFromCheckpoint(lastProcessedId, limit = 100) {
    console.log(`[FaceDetectionQueue] 从断点续传: lastProcessedId=${lastProcessedId}`);
    return await this.addFromDatabase(limit, lastProcessedId);
  }
  /**
   * 🆕 创建扫描任务（开始新的扫描）
   * @param totalPhotos 总照片数
   */
  startScanJob(totalPhotos) {
    if (!scanJobService) {
      console.warn("[FaceDetectionQueue] ScanJobService not available");
      return null;
    }
    this.currentJobId = scanJobService.createJob(totalPhotos);
    this.processedCount = 0;
    this.detectedFacesCount = 0;
    console.log(`[FaceDetectionQueue] Started scan job: ${this.currentJobId}`);
    return this.currentJobId;
  }
  /**
   * 🆕 检查是否有未聚类的人脸（已有检测数据但 person_id 为 NULL）
   */
  hasUnclusteredFaces() {
    const result = this.database.query(`
      SELECT COUNT(*) as count FROM detected_faces WHERE person_id IS NULL
    `);
    return (result[0]?.count || 0) > 0;
  }
  /**
   * 🆕 获取未聚类的人脸数量
   */
  getUnclusteredFaceCount() {
    const result = this.database.query(`
      SELECT COUNT(*) as count FROM detected_faces WHERE person_id IS NULL
    `);
    return result[0]?.count || 0;
  }
  /**
   * 🆕 仅执行聚类（不重新扫描）
   */
  async clusterExistingFaces() {
    const unclusteredCount = this.getUnclusteredFaceCount();
    console.log(`[FaceDetectionQueue] 发现 ${unclusteredCount} 个未聚类人脸，开始聚类...`);
    if (unclusteredCount === 0) {
      return { success: true, matched: 0, personsCreated: 0, message: "没有需要聚类的人脸" };
    }
    try {
      const matchResult = await faceMatchingService.autoMatch({
        threshold: 0.45,
        onProgress: (current, total) => {
          console.log(`[FaceMatching] 聚类进度: ${current}/${total}`);
        }
      });
      console.log(`[FaceMatching] 聚类完成: ${matchResult.matched} 张人脸已匹配, 创建 ${matchResult.personsCreated} 位人物`);
      return {
        success: true,
        matched: matchResult.matched,
        personsCreated: matchResult.personsCreated || 0,
        message: matchResult.message
      };
    } catch (error) {
      console.error("[FaceMatching] 聚类失败:", error);
      return {
        success: false,
        matched: 0,
        personsCreated: 0,
        message: error instanceof Error ? error.message : "聚类失败"
      };
    }
  }
  /**
   * 🆕 获取当前扫描任务ID
   */
  getCurrentJobId() {
    return this.currentJobId;
  }
  /**
   * 处理队列 - 🚨 详细诊断版本
   */
  async processQueue() {
    console.log(`[Worker] >>> processQueue() ENTER`);
    console.log(`[Worker] isRunning=${this.isRunning}, queue.length=${this.queue.length}`);
    const pendingCount = this.queue.filter((t) => t.status === "pending").length;
    const processingCount = this.queue.filter((t) => t.status === "processing").length;
    const completedCount = this.queue.filter((t) => t.status === "completed").length;
    console.log(`[Worker] 任务统计: pending=${pendingCount}, processing=${processingCount}, completed=${completedCount}`);
    if (this.isRunning && !this.hasPendingTasks()) {
      console.log("[Worker] 🔧 检测到状态死锁，强制重置 isRunning=false");
      this.isRunning = false;
    }
    if (this.isRunning) {
      console.log("[Worker] ⚠️ isRunning=true，退出");
      return;
    }
    this.isRunning = true;
    this.abortController = new AbortController();
    console.log(`[Worker] 🚀 开始处理，共 ${this.queue.length} 张照片`);
    let processed = 0;
    const totalCount = this.queue.length;
    if (this.currentJobId && scanJobService) {
      console.log(`[FaceDetectionQueue] 扫描任务 ${this.currentJobId} 开始处理`);
    }
    try {
      while (this.hasPendingTasks() && !this.abortController.signal.aborted) {
        await this.waitForSlot();
        if (this.abortController.signal.aborted) {
          console.log("[Worker] ⚠️ 信号中止");
          break;
        }
        const task = this.getNextTask();
        if (!task) {
          console.log("[Worker] ⚠️ getNextTask() 返回 null");
          break;
        }
        console.log(`[Worker] 📸 ${task.photoId} (${processed + 1}/${totalCount})`);
        await this.processTask(task);
        processed++;
        this.processedCount++;
        if (this.currentJobId && scanJobService && this.processedCount % 50 === 0) {
          const photoIdNum = parseInt(task.photoId, 10);
          if (!isNaN(photoIdNum)) {
            scanJobService.updateProgress(this.currentJobId, this.processedCount, photoIdNum);
            console.log(`[FaceDetectionQueue] 更新进度: ${this.processedCount}, lastPhotoId: ${photoIdNum}`);
          }
        }
        if (this.currentJobId && scanJobService) {
          scanJobService.updateHeartbeat(this.currentJobId);
        }
      }
      if (!this.hasPendingTasks()) {
        console.log("[Worker] ✅ 所有任务完成");
      }
    } catch (error) {
      if (this.currentJobId && scanJobService) {
        const errorMsg = error instanceof Error ? error.message : "未知错误";
        scanJobService.failJob(this.currentJobId, errorMsg);
        console.error(`[FaceDetectionQueue] 扫描任务失败: ${errorMsg}`);
      }
      throw error;
    } finally {
      this.isRunning = false;
      console.log(`[Worker] <<< processQueue() EXIT (processed=${processed}/${totalCount})`);
      if (this.currentJobId && scanJobService) {
        const stats = this.getStats();
        const detectedFaces = this.queue.reduce((sum, t) => sum + (t.faces || 0), 0);
        if (this.abortController?.signal.aborted) {
          scanJobService.cancelJob(this.currentJobId);
          console.log(`[FaceDetectionQueue] 扫描任务被取消: ${this.currentJobId}`);
        } else if (stats.failed === stats.total && stats.total > 0) {
          scanJobService.failJob(this.currentJobId, "All tasks failed");
          console.log(`[FaceDetectionQueue] 扫描任务失败: ${this.currentJobId}`);
        } else {
          scanJobService.completeJob(this.currentJobId, detectedFaces);
          console.log(`[FaceDetectionQueue] 扫描任务完成: ${this.currentJobId}, 检测到 ${detectedFaces} 张人脸`);
          if (detectedFaces > 0) {
            console.log("[FaceDetectionQueue] 开始自动聚类...");
            const clusterStartTime = Date.now();
            try {
              const matchResult = await faceMatchingService.autoMatch({
                threshold: 0.45,
                onProgress: (current, total) => {
                  console.log(`[FaceMatching] 聚类进度: ${current}/${total}`);
                }
              });
              const clusterDuration = Date.now() - clusterStartTime;
              const avgFacesPerPerson = matchResult.personsCreated > 0 ? matchResult.matched / matchResult.personsCreated : 0;
              console.log(`[FaceMatching] 聚类完成: ${matchResult.matched} 张人脸已匹配, 创建 ${matchResult.personsCreated} 位人物`);
              console.log(`[Analytics] face_clustering_completed:`, {
                total_faces: detectedFaces,
                matched_faces: matchResult.matched,
                persons_created: matchResult.personsCreated,
                avg_faces_per_person: avgFacesPerPerson.toFixed(2),
                clustering_duration_ms: clusterDuration,
                threshold_used: 0.45
              });
              if (avgFacesPerPerson > 20) {
                console.warn(`[Analytics] ⚠️ 聚类过于激进: avg_faces_per_person=${avgFacesPerPerson.toFixed(2)} > 20`);
              }
              if (matchResult.personsCreated > 0 && matchResult.matched / detectedFaces < 0.1) {
                console.warn(`[Analytics] ⚠️ 聚类过于保守: match_rate=${(matchResult.matched / detectedFaces).toFixed(2)} < 0.1`);
              }
              if (clusterDuration > 3e4) {
                console.warn(`[Analytics] ⚠️ 聚类性能瓶颈: duration=${clusterDuration}ms > 30000ms`);
              }
            } catch (clusterError) {
              console.error("[FaceMatching] 聚类失败:", clusterError);
            }
          }
        }
        this.currentJobId = null;
        this.processedCount = 0;
      }
      if (!this.hasCompleted && this.onComplete) {
        this.hasCompleted = true;
        const stats = this.getStats();
        const detectedFaces = this.queue.reduce((sum, t) => sum + (t.faces || 0), 0);
        console.log(`[Worker] 🎉 触发 onComplete: total=${stats.total}, completed=${stats.completed}, failed=${stats.failed}, faces=${detectedFaces}`);
        this.onComplete({
          total: stats.total,
          completed: stats.completed,
          failed: stats.failed,
          detectedFaces
        });
      }
    }
  }
  /**
   * 检查是否有待处理任务
   */
  hasPendingTasks() {
    return this.queue.some((t) => t.status === "pending");
  }
  /**
   * 获取下一个待处理任务
   */
  getNextTask() {
    return this.queue.find((t) => t.status === "pending");
  }
  /**
   * 等待有可用的处理槽
   */
  waitForSlot() {
    return new Promise((resolve2) => {
      const check = () => {
        if (this.processingCount < this.maxConcurrent) {
          resolve2();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
  /**
   * 处理单个任务
   */
  async processTask(task) {
    task.status = "processing";
    this.processingCount++;
    this.reportProgress();
    try {
      console.log(`[FaceDetectionQueue] 处理中: ${task.photoId}`);
      if (!task.filePath) {
        throw new Error("任务缺少文件路径");
      }
      if (!task.photoId) {
        throw new Error("任务缺少 photoId");
      }
      const fs = await import("fs");
      console.log(`[DEBUG] 🎯 开始检测: ${task.photoId}`);
      console.log(`[DEBUG] 📁 原始路径: ${task.filePath}`);
      console.log(`[DEBUG] 🔍 路径类型: ${task.filePath?.startsWith("local-resource://") ? "协议URL" : "绝对路径"}`);
      const absolutePath = task.filePath?.startsWith("local-resource://") ? task.filePath.replace("local-resource://", "") : task.filePath;
      console.log(`[DEBUG] 📂 转换后路径: ${absolutePath}`);
      const exists = fs.existsSync(absolutePath);
      console.log(`[DEBUG] 📂 文件存在: ${exists}`);
      if (!exists) {
        console.error(`[DEBUG] ❌ 文件不存在，跳过检测: ${absolutePath}`);
        task.status = "failed";
        task.error = "文件不存在";
        task.faces = 0;
        return;
      }
      console.log(`[DEBUG] 🤖 调用检测模型...`);
      const result = await this.service.detect(absolutePath);
      console.log(`[DEBUG] ✅ 检测完成: success=${result.success}, detections=${result.detections.length}`);
      if (!result.success) {
        console.error(`[DEBUG] 💥 检测失败: ${result.error}`);
      } else if (result.detections.length === 0) {
        console.warn(`[DEBUG] ⚠️ 检测成功但返回0张人脸 - 可能原因: 模型未加载/图片模糊/无人脸`);
      }
      if (result.success && result.detections.length > 0) {
        const photoIdNum = parseInt(task.photoId, 10);
        if (isNaN(photoIdNum)) {
          console.warn(`[FaceDetectionQueue] 无效的 photoId: ${task.photoId}`);
          task.status = "failed";
          task.error = "无效的 photoId";
          return;
        }
        const faces = result.detections.map((detection, index) => ({
          id: `${task.uuid}-face-${index}`,
          bbox_x: detection.box.x,
          bbox_y: detection.box.y,
          bbox_width: detection.box.width,
          bbox_height: detection.box.height,
          confidence: detection.confidence,
          embedding: detection.landmarks ? this.extractEmbedding(detection.landmarks) : void 0,
          face_embedding: detection.descriptor
          // ✅ 128维人脸特征向量，用于人物匹配
        }));
        this.database.saveDetectedFaces(photoIdNum, faces);
        task.faces = faces.length;
        console.log(`[FaceDetectionQueue] 检测到 ${faces.length} 张人脸: ${task.photoId}`);
        console.log(`[DEBUG] 💾 已保存到数据库: ${faces.length} 张人脸, photoId=${photoIdNum}`);
      } else {
        task.faces = 0;
        console.log(`[FaceDetectionQueue] 未检测到人脸: ${task.photoId}`);
        console.log(`[DEBUG] ⚠️ 检测结果为空: success=${result.success}, error=${result.error || "无"}`);
      }
      task.status = "completed";
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : "未知错误";
      console.error(`[FaceDetectionQueue] 处理失败: ${task.photoId}`, error);
    } finally {
      this.processingCount--;
      this.reportProgress();
    }
  }
  /**
   * 从地标点提取简化的 embedding
   */
  extractEmbedding(landmarks) {
    const embedding = [];
    if (landmarks.nose && landmarks.nose.length > 0) {
      embedding.push(landmarks.nose[0].x, landmarks.nose[0].y);
    }
    if (landmarks.leftEye && landmarks.leftEye.length > 0) {
      const leftEyeX = landmarks.leftEye.reduce((sum, p) => sum + p.x, 0) / landmarks.leftEye.length;
      const leftEyeY = landmarks.leftEye.reduce((sum, p) => sum + p.y, 0) / landmarks.leftEye.length;
      embedding.push(leftEyeX, leftEyeY);
    }
    if (landmarks.rightEye && landmarks.rightEye.length > 0) {
      const rightEyeX = landmarks.rightEye.reduce((sum, p) => sum + p.x, 0) / landmarks.rightEye.length;
      const rightEyeY = landmarks.rightEye.reduce((sum, p) => sum + p.y, 0) / landmarks.rightEye.length;
      embedding.push(rightEyeX, rightEyeY);
    }
    return embedding;
  }
  /**
   * 报告进度
   */
  reportProgress() {
    const stats = this.getStats();
    const detectedFaces = this.queue.reduce((sum, t) => sum + (t.faces || 0), 0);
    const isCompleted = !this.isRunning && stats.total > 0 && stats.completed === stats.total;
    if (isCompleted && !this.hasCompleted && this.onComplete) {
      this.hasCompleted = true;
      console.log(`[Worker] 🎉 reportProgress 检测到完成，触发 onComplete: total=${stats.total}, completed=${stats.completed}, failed=${stats.failed}, faces=${detectedFaces}`);
      this.onComplete({
        total: stats.total,
        completed: stats.completed,
        failed: stats.failed,
        detectedFaces
      });
    }
    if (!this.onProgress) return;
    const progress = {
      ...stats,
      currentPhoto: this.queue.find((t) => t.status === "processing")?.filePath || void 0,
      detectedFaces,
      status: this.isRunning ? "running" : isCompleted ? "completed" : "idle"
    };
    this.onProgress(progress);
  }
  /**
   * 获取队列统计信息
   */
  getStats() {
    return {
      total: this.queue.length,
      pending: this.queue.filter((t) => t.status === "pending").length,
      processing: this.queue.filter((t) => t.status === "processing").length,
      completed: this.queue.filter((t) => t.status === "completed").length,
      failed: this.queue.filter((t) => t.status === "failed").length
    };
  }
  /**
   * 获取队列状态（暴露给 IPC）- 🚨 状态诊断专用
   */
  getDetailedStatus() {
    const stats = this.getStats();
    return {
      isRunning: this.isRunning,
      queueLength: this.queue.length,
      hasPending: this.hasPendingTasks(),
      processingCount: this.processingCount,
      ...stats
    };
  }
  /**
   * 强制重置状态（用于恢复卡住的队列）
   */
  forceReset() {
    const wasRunning = this.isRunning;
    this.isRunning = false;
    this.abortController = null;
    console.log(`[FaceDetectionQueue] 强制重置: 之前运行=${wasRunning}, 队列长度=${this.queue.length}`);
  }
  /**
   * 强制启动队列（绕过 addTask 自动触发）
   */
  async forceStart() {
    console.log(`[Worker] === forceStart() ===`);
    console.log(`[Worker] this.isRunning = ${this.isRunning}`);
    console.log(`[Worker] this.queue.length = ${this.queue.length}`);
    const pendingBefore = this.queue.filter((t) => t.status === "pending").length;
    console.log(`[Worker] pending before = ${pendingBefore}`);
    if (this.isRunning) {
      console.log("[Worker] ⚠️ isRunning=true，跳过");
      return;
    }
    const hasPending = this.hasPendingTasks();
    console.log(`[Worker] hasPendingTasks() = ${hasPending}`);
    if (!hasPending) {
      console.log("[Worker] ⚠️ 没有 pending 任务，跳过");
      return;
    }
    console.log("[Worker] 🚀 调用 processQueue()...");
    await this.processQueue();
    console.log("[Worker] === forceStart() 完成 ===");
  }
  /**
   * 取消处理
   */
  cancel() {
    this.abortController?.abort();
    this.isRunning = false;
    console.log("[FaceDetectionQueue] 取消处理");
    if (this.currentJobId && scanJobService) {
      scanJobService.cancelJob(this.currentJobId);
      console.log(`[FaceDetectionQueue] 扫描任务已取消: ${this.currentJobId}`);
      this.currentJobId = null;
    }
    for (const task of this.queue) {
      if (task.status === "pending") {
        task.status = "pending";
      }
    }
  }
  /**
   * 清空队列
   */
  clear() {
    this.cancel();
    this.queue = [];
    this.reportProgress();
    console.log("[FaceDetectionQueue] 队列已清空");
  }
  /**
   * 获取所有任务
   */
  getTasks() {
    return [...this.queue];
  }
  /**
   * 获取失败的任务
   */
  getFailedTasks() {
    return this.queue.filter((t) => t.status === "failed");
  }
  /**
   * 重试失败的任务
   */
  async retryFailed() {
    const failedTasks = this.getFailedTasks();
    for (const task of failedTasks) {
      task.status = "pending";
      task.error = void 0;
    }
    console.log(`[FaceDetectionQueue] 重试 ${failedTasks.length} 个失败任务`);
    await this.processQueue();
  }
}
const faceDetectionQueue = new FaceDetectionQueue(new PhotoDatabase());
const faceDetectionQueue$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  FaceDetectionQueue,
  faceDetectionQueue
}, Symbol.toStringTag, { value: "Module" }));
class ImportService {
  database;
  isImporting = false;
  cancelImport = false;
  constructor(database2) {
    this.database = database2;
  }
  /**
   * 设置进度回调（兼容旧接口）
   */
  onProgress(callback) {
    return importProgressService.subscribe(callback);
  }
  /**
   * 从文件夹导入照片
   */
  async importFromFolder(folderPath, options = {}) {
    if (this.isImporting) {
      throw new Error("导入已在进行中");
    }
    this.isImporting = true;
    this.cancelImport = false;
    const startTime = Date.now();
    const result = {
      success: true,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      duration: 0
    };
    try {
      console.log(`[Import] 开始扫描文件夹: ${folderPath}`);
      importProgressService.setStage("scanning");
      const files = await folderScanner.scanFolder(folderPath);
      if (files.length === 0) {
        console.log("[Import] 未找到支持的照片文件");
        importProgressService.complete(true);
        return result;
      }
      console.log(`[Import] 找到 ${files.length} 个文件`);
      importProgressService.setStage("preparing");
      const toImport = options.skipDuplicates ? await this.filterDuplicates(files) : files;
      console.log(`[Import] 将导入 ${toImport.length} 个文件（${options.skipDuplicates ? `过滤了 ${files.length - toImport.length} 个重复文件` : "不过滤重复"}）`);
      importProgressService.startSession(toImport.length, "importing");
      const total = toImport.length;
      for (let i = 0; i < toImport.length; i++) {
        if (this.cancelImport) {
          result.success = false;
          importProgressService.cancel();
          break;
        }
        const file = toImport[i];
        importProgressService.updateCurrentFile(file.filename);
        try {
          try {
            await promises.access(file.path);
          } catch {
            importProgressService.addError(file.path, "文件不存在");
            continue;
          }
          const fileHash = await this.calculateFileHash(file.path);
          const existingPhoto = this.findExistingPhoto(file.path, fileHash);
          if (existingPhoto) {
            importProgressService.advanceProgress(false, true, false);
            console.log(`[Import] 跳过已存在的照片: ${file.filename}`);
            continue;
          }
          const photoData = {
            uuid: this.generateUUID(),
            fileName: file.filename,
            filePath: file.path,
            fileSize: file.size,
            width: null,
            height: null,
            takenAt: file.mtime.toISOString(),
            exif: {},
            location: {},
            status: "local"
          };
          const photoId = this.database.addPhoto(photoData);
          if (photoId > 0) {
            importProgressService.advanceProgress(true, false, false);
            console.log(`[Import] 成功导入: ${file.filename}`);
          } else {
            importProgressService.addError(file.path, "数据库插入失败");
          }
        } catch (error) {
          importProgressService.addError(file.path, error instanceof Error ? error.message : "未知错误");
          console.error(`[Import] 导入文件失败: ${file.path}`, error);
        }
      }
      importProgressService.complete(true);
      return result;
    } finally {
      this.isImporting = false;
      result.duration = Date.now() - startTime;
      console.log(`[Import] 导入完成: 成功 ${result.imported}, 跳过 ${result.skipped}, 失败 ${result.failed}, 耗时 ${result.duration}ms`);
    }
  }
  /**
   * 过滤已存在的照片
   */
  async filterDuplicates(files) {
    const existingPhotos = this.database.query("SELECT file_path, file_size FROM photos");
    const existingMap = /* @__PURE__ */ new Set();
    for (const photo of existingPhotos) {
      const key = `${photo.file_path}_${photo.file_size}`;
      existingMap.add(key);
    }
    const toImport = [];
    for (const file of files) {
      const key = `${file.path}_${file.size}`;
      if (!existingMap.has(key)) {
        toImport.push(file);
      }
    }
    return toImport;
  }
  /**
   * 查找已存在的照片
   */
  findExistingPhoto(filePath, fileHash) {
    const photos = this.database.query(
      "SELECT * FROM photos WHERE file_path = ? OR uuid = ?",
      [filePath, fileHash]
    );
    return photos.length > 0 ? photos[0] : null;
  }
  /**
   * 计算文件哈希
   */
  async calculateFileHash(filePath) {
    try {
      const buffer = await promises.readFile(filePath);
      return crypto$1.createHash("md5").update(buffer).digest("hex");
    } catch {
      return "";
    }
  }
  /**
   * 生成 UUID
   */
  generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  /**
   * 取消导入
   */
  cancel() {
    this.cancelImport = true;
    console.log("[Import] 收到取消信号，将在当前文件处理完成后停止");
  }
  /**
   * 获取是否正在导入
   */
  getIsImporting() {
    return this.isImporting;
  }
  // ==================== 向量生成相关方法 ====================
  /**
   * 导入单张照片并自动生成向量
   * 注意：向量生成是异步的，不会阻塞导入流程
   */
  async importPhotoWithVector(filePath, options = {}) {
    try {
      try {
        await promises.access(filePath);
      } catch {
        return { success: false };
      }
      const fileHash = await this.calculateFileHash(filePath);
      const existingPhoto = this.findExistingPhoto(filePath, fileHash);
      if (existingPhoto) {
        console.log(`[Import] 照片已存在: ${filePath}`);
        return { success: true, photoUuid: existingPhoto.uuid, vectorQueued: false };
      }
      const filename = filePath.split("/").pop() || "unknown";
      const stats = await promises.stat(filePath);
      const photoData = {
        uuid: this.generateUUID(),
        fileName: filename,
        filePath,
        fileSize: stats.size,
        width: null,
        height: null,
        takenAt: stats.mtime.toISOString(),
        exif: {},
        location: {},
        status: "local"
      };
      const photoId = this.database.addPhoto(photoData);
      if (photoId > 0) {
        console.log(`[Import] 照片导入成功: ${photoData.uuid}`);
        backgroundVectorService.addPhoto(photoData.uuid);
        this.triggerFaceDetection(photoId, photoData.uuid, filePath);
        return {
          success: true,
          photoUuid: photoData.uuid,
          vectorQueued: true
        };
      }
      return { success: false };
    } catch (error) {
      console.error(`[Import] 导入照片失败: ${filePath}`, error);
      return { success: false };
    }
  }
  /**
   * 批量导入文件夹并为每张照片生成向量
   */
  async importFolderWithVectors(folderPath, options = {}) {
    const importResult = await this.importFromFolder(folderPath, options);
    if (importResult.imported > 0) {
      const recentPhotos = this.database.query(
        `SELECT uuid FROM photos WHERE status = 'local' ORDER BY id DESC LIMIT ?`,
        [importResult.imported]
      );
      if (recentPhotos.length > 0) {
        const photoUuids = recentPhotos.map((p) => p.uuid);
        const taskId = backgroundVectorService.addGenerateTask(photoUuids);
        console.log(`[Import] 已添加 ${photoUuids.length} 张照片到向量生成队列，任务ID: ${taskId}`);
        await this.triggerFaceDetectionBatch(photoUuids);
        return {
          importResult,
          vectorTaskId: taskId
        };
      }
    }
    return { importResult };
  }
  /**
   * 获取当前向量生成状态
   */
  getVectorGenerationStatus() {
    const currentTask = backgroundVectorService.getCurrentTask();
    return {
      hasActiveTask: currentTask !== null,
      currentTask,
      stats: backgroundVectorService.getStats()
    };
  }
  /**
   * 获取待生成向量的照片数量
   */
  getPendingVectorCount() {
    const stats = backgroundVectorService.getStats();
    return stats.pending;
  }
  /**
   * 触发人脸检测
   * 异步执行，不阻塞导入流程
   */
  async triggerFaceDetection(photoId, photoUuid, filePath) {
    try {
      await faceDetectionQueue.addTask(
        photoId.toString(),
        photoUuid,
        filePath
      );
      console.log(`[Import] 已添加到人脸检测队列: ${photoUuid}`);
    } catch (error) {
      console.error(`[Import] 人脸检测触发失败: ${photoUuid}`, error);
    }
  }
  /**
   * 批量触发人脸检测
   */
  async triggerFaceDetectionBatch(photoUuids) {
    if (photoUuids.length === 0) return;
    try {
      const photos = this.database.query(
        `SELECT id, uuid, file_path FROM photos WHERE uuid IN (${photoUuids.map(() => "?").join(",")})`,
        photoUuids
      );
      for (const photo of photos) {
        await this.triggerFaceDetection(photo.id, photo.uuid, photo.file_path);
      }
      console.log(`[Import] 已批量添加 ${photos.length} 张照片到人脸检测队列`);
    } catch (error) {
      console.error("[Import] 批量人脸检测触发失败:", error);
    }
  }
}
let importService = null;
function initializeImportService(database2) {
  importService = new ImportService(database2);
  return importService;
}
class VectorGenerationService {
  isGenerating = false;
  abortController = null;
  database;
  constructor(database2) {
    this.database = database2 || new PhotoDatabase();
  }
  /**
   * 生成所有照片的向量
   */
  async generateAll(options = {}) {
    if (this.isGenerating) {
      throw new Error("生成任务已在进行中");
    }
    this.isGenerating = true;
    this.abortController = new AbortController();
    const { batchSize = 50, onProgress } = options;
    let success = 0;
    let failed = 0;
    let total = 0;
    let processed = 0;
    const errors = [];
    try {
      const photos = this.database.getPhotosWithoutEmbeddings(1e4);
      total = photos.length;
      console.log(`[VectorGeneration] 开始生成 ${total} 张照片的向量`);
      if (total === 0) {
        console.log("[VectorGeneration] 所有照片已有向量，无需生成");
        return { success: 0, failed, total, errors, cancelled: false };
      }
      for (let i = 0; i < total; i += batchSize) {
        if (this.abortController?.signal.aborted) {
          console.log("[VectorGeneration] 生成任务已取消");
          break;
        }
        const batch = photos.slice(i, i + batchSize);
        for (const photo of batch) {
          if (this.abortController?.signal.aborted) {
            break;
          }
          try {
            const hasEmbedding = await this.database.hasEmbedding(photo.uuid, "image");
            if (hasEmbedding) {
              processed++;
              continue;
            }
            const result = await this.callRendererEmbedding(photo.file_path);
            if (result.success && result.vector) {
              await this.database.saveEmbedding(photo.uuid, result.vector.values, "image");
              success++;
            } else {
              failed++;
              errors.push({
                photoUuid: photo.uuid,
                error: result.error || "Unknown error"
              });
            }
          } catch (error) {
            failed++;
            errors.push({
              photoUuid: photo.uuid,
              error: error instanceof Error ? error.message : "Unknown error"
            });
          }
          processed++;
          const progress = {
            total,
            processed,
            currentPhotoUuid: photo.uuid,
            percentComplete: Math.round(processed / total * 100)
          };
          onProgress?.(progress);
        }
      }
      console.log(`[VectorGeneration] 生成完成: 成功 ${success}, 失败 ${failed}`);
      return { success, failed, total, errors, cancelled: this.abortController?.signal.aborted || false };
    } catch (error) {
      console.error("[VectorGeneration] 生成失败:", error);
      return {
        success,
        failed,
        total,
        errors,
        cancelled: false
      };
    } finally {
      this.isGenerating = false;
      this.abortController = null;
    }
  }
  /**
   * 通过渲染进程生成向量
   */
  async callRendererEmbedding(imagePath) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      return { success: false, error: "No renderer window available" };
    }
    try {
      const timeoutMs = 6e4;
      const executePromise = windows[0].webContents.executeJavaScript(`
        (async () => {
          try {
            if (window.embeddingAPI && window.embeddingAPI.imageToEmbedding) {
              const result = await window.embeddingAPI.imageToEmbedding(\`${imagePath.replace(/`/g, "\\`")}\`)
              return JSON.stringify(result)
            } else {
              return JSON.stringify({success: false, error: 'Embedding API not available', processingTimeMs: 0})
            }
          } catch (err) {
            return JSON.stringify({success: false, error: err.message || String(err), processingTimeMs: 0})
          }
        })()
      `);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Embedding timeout after 60s")), timeoutMs);
      });
      const result = await Promise.race([executePromise, timeoutPromise]);
      return JSON.parse(result);
    } catch (error) {
      console.error("[VectorGeneration] 调用渲染进程失败:", error);
      return { success: false, error: String(error) };
    }
  }
  /**
   * 生成单张照片的向量
   */
  async generateOne(photoUuid) {
    const photo = this.database.getPhotoByUuid(photoUuid);
    if (!photo) {
      throw new Error(`照片不存在: ${photoUuid}`);
    }
    const hasEmbedding = await this.database.hasEmbedding(photoUuid, "image");
    if (hasEmbedding) {
      console.log(`[VectorGeneration] 照片已有向量，跳过: ${photoUuid}`);
      return true;
    }
    const result = await this.callRendererEmbedding(photo.file_path);
    if (result.success && result.vector) {
      await this.database.saveEmbedding(photoUuid, result.vector.values, "image");
      console.log(`[VectorGeneration] 成功生成向量: ${photoUuid}`);
      return true;
    }
    return false;
  }
  /**
   * 批量生成指定照片的向量
   */
  async generateBatch(photoUuids, options = {}) {
    if (this.isGenerating) {
      throw new Error("生成任务已在进行中");
    }
    this.isGenerating = true;
    this.abortController = new AbortController();
    const { batchSize = 10, onProgress } = options;
    let success = 0;
    let failed = 0;
    const errors = [];
    const total = photoUuids.length;
    let processed = 0;
    try {
      for (const photoUuid of photoUuids) {
        if (this.abortController?.signal.aborted) {
          break;
        }
        try {
          const photo = this.database.getPhotoByUuid(photoUuid);
          if (!photo) {
            failed++;
            errors.push({ photoUuid, error: "照片不存在" });
            continue;
          }
          const result = await this.callRendererEmbedding(photo.file_path);
          if (result.success && result.vector) {
            await this.database.saveEmbedding(photoUuid, result.vector.values, "image");
            success++;
          } else {
            failed++;
            errors.push({ photoUuid, error: result.error || "Unknown error" });
          }
        } catch (error) {
          failed++;
          errors.push({
            photoUuid,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
        processed++;
        const progress = {
          total,
          processed,
          currentPhotoUuid: photoUuid,
          percentComplete: Math.round(processed / total * 100)
        };
        onProgress?.(progress);
      }
      return { success, failed, total, errors, cancelled: this.abortController?.signal.aborted || false };
    } finally {
      this.isGenerating = false;
      this.abortController = null;
    }
  }
  /**
   * 取消生成任务
   */
  cancel() {
    console.log("[VectorGeneration] 收到取消信号");
    this.abortController?.abort();
  }
  /**
   * 获取生成状态
   */
  getStatus() {
    if (!this.isGenerating) {
      return { isGenerating: false };
    }
    const pending = this.database.getPhotosWithoutEmbeddings(1).length;
    return { isGenerating: true, totalPending: pending };
  }
  /**
   * 获取待生成的照片数量
   */
  async getPendingCount() {
    const photos = this.database.getPhotosWithoutEmbeddings(1e4);
    return photos.length;
  }
}
new VectorGenerationService();
class SimilarityService {
  /**
   * 计算余弦相似度
   */
  cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      console.warn("[Similarity] 向量维度不匹配");
      return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;
    return dotProduct / denominator;
  }
  /**
   * 计算欧氏距离
   */
  euclideanDistance(a, b) {
    if (a.length !== b.length) {
      return Infinity;
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }
  /**
   * 计算点积
   */
  dotProduct(a, b) {
    if (a.length !== b.length) {
      return 0;
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }
  /**
   * 计算向量范数
   */
  norm(vector) {
    return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  }
  /**
   * 批量计算相似度
   */
  batchSimilarity(queryVector, targetVectors) {
    return targetVectors.map((item) => ({
      id: item.photoUuid,
      similarity: this.cosineSimilarity(queryVector, item.vector)
    }));
  }
  /**
   * 排序并返回 top-k 结果
   */
  topK(similarities, k, minSimilarity = 0) {
    return similarities.filter((s) => s.similarity >= minSimilarity).sort((a, b) => b.similarity - a.similarity).slice(0, k);
  }
  /**
   * 语义搜索（向量 + 数据库）
   */
  async semanticSearch(queryVector, getAllEmbeddings, options = {}) {
    const { topK = 50, minSimilarity = 0.1 } = options;
    const embeddings = await getAllEmbeddings();
    const similarities = this.batchSimilarity(queryVector, embeddings);
    const topResults = this.topK(similarities, topK, minSimilarity);
    return topResults.map((item, index) => ({
      photoUuid: item.id,
      similarity: item.similarity,
      rank: index + 1
    }));
  }
  /**
   * 多查询融合搜索
   */
  async multiQuerySearch(queryVectors, getAllEmbeddings, options = {}) {
    const { topK = 50, minSimilarity = 0.1, weights } = options;
    const embeddings = await getAllEmbeddings();
    const vectorWeights = weights || queryVectors.map(() => 1 / queryVectors.length);
    const scoreMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < queryVectors.length; i++) {
      const similarities = this.batchSimilarity(queryVectors[i], embeddings);
      for (const sim of similarities) {
        const existing = scoreMap.get(sim.id) || { totalScore: 0, count: 0 };
        existing.totalScore += sim.similarity * vectorWeights[i];
        existing.count += 1;
        scoreMap.set(sim.id, existing);
      }
    }
    const results = [];
    for (const [id, data] of scoreMap.entries()) {
      results.push({
        id,
        similarity: data.totalScore / data.count
      });
    }
    const topResults = this.topK(results, topK, minSimilarity);
    return topResults.map((item, index) => ({
      photoUuid: item.id,
      similarity: item.similarity,
      rank: index + 1
    }));
  }
  /**
   * 相似度分数转换（0-1 到百分比）
   */
  similarityToPercent(similarity) {
    return Math.round(similarity * 100);
  }
  /**
   * 判断相似度等级
   */
  getSimilarityLevel(similarity) {
    if (similarity >= 0.7) return "high";
    if (similarity >= 0.4) return "medium";
    return "low";
  }
}
const similarityService = new SimilarityService();
const similarityService$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  SimilarityService,
  similarityService
}, Symbol.toStringTag, { value: "Module" }));
class TextPreprocessor {
  /**
   * 预处理搜索文本
   */
  preprocess(text) {
    return {
      original: text,
      processed: this.cleanText(text),
      keywords: this.extractKeywords(text),
      language: this.detectLanguage(text)
    };
  }
  /**
   * 清洗文本
   */
  cleanText(text) {
    return text.replace(/[^\w\s\u4e00-\u9fff\-]/g, " ").replace(/\s+/g, " ").trim();
  }
  /**
   * 提取关键词
   */
  extractKeywords(text) {
    return text.split(/[\s,]+/).map((w) => w.trim()).filter((w) => w.length > 0);
  }
  /**
   * 检测语言
   */
  detectLanguage(text) {
    const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
    const total = chineseCount + englishCount;
    if (total === 0) return "en";
    const chineseRatio = chineseCount / total;
    const englishRatio = englishCount / total;
    if (chineseRatio > 0.3 && englishRatio > 0.3) return "mixed";
    if (chineseRatio > 0.5) return "zh";
    return "en";
  }
  /**
   * 扩展搜索词（同义词等）
   */
  expandQuery(text) {
    const queries = [text];
    const expansions = {
      "照片": ["photo", "图片", "image"],
      "家庭": ["family", "家人", "home"],
      "朋友": ["friends", "friend", "友情"],
      "旅行": ["travel", "trip", "journey", "旅游"],
      "日落": ["sunset", "夕陽"],
      "日出": ["sunrise", "日出", "晨曦"],
      "风景": ["scenery", "landscape", "景色", "山水"],
      "美食": ["food", "delicious", "好吃", "餐饮"]
    };
    for (const [key, values] of Object.entries(expansions)) {
      if (text.toLowerCase().includes(key.toLowerCase())) {
        for (const value of values) {
          queries.push(`${key} ${value}`);
        }
      }
    }
    return queries;
  }
}
const textPreprocessor = new TextPreprocessor();
const textPreprocessor$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  TextPreprocessor,
  textPreprocessor
}, Symbol.toStringTag, { value: "Module" }));
class SemanticSearchService {
  database;
  constructor(database2) {
    this.database = database2 || new PhotoDatabase();
  }
  /**
   * 执行语义搜索
   */
  async search(options) {
    const startTime = Date.now();
    const { query, topK = 50, minSimilarity = 0.1, page = 1, pageSize = 20 } = options;
    const processed = textPreprocessor.preprocess(query);
    const embeddingService = getEmbeddingService$1();
    const textResult = await embeddingService.textToEmbedding(processed.processed);
    if (!textResult.success || !textResult.vector) {
      console.log("[SemanticSearch] 文本转向量失败");
      return {
        results: [],
        total: 0,
        page,
        pageSize,
        processingTimeMs: Date.now() - startTime,
        query: {
          original: query,
          processed: processed.processed,
          language: processed.language
        }
      };
    }
    console.log(`[SemanticSearch] 向量生成成功，维度: ${textResult.vector.length}`);
    const allEmbeddings = await this.database.getAllEmbeddings("image");
    console.log(`[SemanticSearch] 获取到 ${allEmbeddings.length} 个向量`);
    if (allEmbeddings.length === 0) {
      return {
        results: [],
        total: 0,
        page,
        pageSize,
        processingTimeMs: Date.now() - startTime,
        query: {
          original: query,
          processed: processed.processed,
          language: processed.language
        }
      };
    }
    const similarities = similarityService.batchSimilarity(textResult.vector, allEmbeddings);
    console.log(`[SemanticSearch] 相似度计算完成`);
    const sorted = similarityService.topK(similarities, topK, minSimilarity);
    console.log(`[SemanticSearch] 排序完成，前 ${sorted.length} 个结果`);
    const results = [];
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const photo = this.database.getPhotoByUuid(item.id);
      if (photo) {
        results.push({
          photoUuid: item.id,
          similarity: item.similarity,
          rank: i + 1,
          photo: this.formatPhoto(photo)
        });
      }
    }
    const startIndex = (page - 1) * pageSize;
    const pagedResults = results.slice(startIndex, startIndex + pageSize);
    const processingTime = Date.now() - startTime;
    console.log(`[SemanticSearch] 搜索完成，耗时 ${processingTime}ms`);
    return {
      results: pagedResults,
      total: results.length,
      page,
      pageSize,
      processingTimeMs: processingTime,
      query: {
        original: query,
        processed: processed.processed,
        language: processed.language
      }
    };
  }
  /**
   * 批量搜索（多个查询）
   */
  async multiQuerySearch(queries, options = {}) {
    const { topK = 50, minSimilarity = 0.1, weights } = options;
    const processedQueries = queries.map((q) => ({
      original: q,
      processed: textPreprocessor.preprocess(q).processed
    }));
    const embeddingService = getEmbeddingService$1();
    const vectors = [];
    for (const q of processedQueries) {
      const result = await embeddingService.textToEmbedding(q.processed);
      if (result.success && result.vector) {
        vectors.push(result.vector);
      }
    }
    if (vectors.length === 0) {
      return {
        results: [],
        total: 0,
        page: 1,
        pageSize: 20,
        processingTimeMs: 0,
        query: {
          original: queries.join(" "),
          processed: processedQueries.map((q) => q.processed).join(" "),
          language: "mixed"
        }
      };
    }
    const allEmbeddings = await this.database.getAllEmbeddings("image");
    const defaultWeights = weights || vectors.map(() => 1 / vectors.length);
    const scoreMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < vectors.length; i++) {
      const similarities = similarityService.batchSimilarity(vectors[i], allEmbeddings);
      for (const sim of similarities) {
        const existing = scoreMap.get(sim.id) || { totalScore: 0, count: 0 };
        existing.totalScore += sim.similarity * defaultWeights[i];
        existing.count += 1;
        scoreMap.set(sim.id, existing);
      }
    }
    const results = [];
    for (const [id, data] of scoreMap.entries()) {
      const avgScore = data.totalScore / data.count;
      if (avgScore >= minSimilarity) {
        const photo = this.database.getPhotoByUuid(id);
        if (photo) {
          results.push({
            photoUuid: id,
            similarity: avgScore,
            rank: 0,
            photo: this.formatPhoto(photo)
          });
        }
      }
    }
    results.sort((a, b) => b.similarity - a.similarity);
    results.forEach((r, i) => r.rank = i + 1);
    return {
      results: results.slice(0, topK),
      total: results.length,
      page: 1,
      pageSize: topK,
      processingTimeMs: 0,
      query: {
        original: queries.join(" "),
        processed: processedQueries.map((q) => q.processed).join(" "),
        language: "mixed"
      }
    };
  }
  /**
   * 格式化照片数据
   */
  formatPhoto(photo) {
    return {
      uuid: photo.uuid,
      fileName: photo.file_name,
      filePath: photo.file_path,
      fileSize: photo.file_size,
      width: photo.width,
      height: photo.height,
      takenAt: photo.taken_at,
      exif: photo.exif_data && typeof photo.exif_data === "string" ? JSON.parse(photo.exif_data) : photo.exif_data || {},
      location: photo.location_data && typeof photo.location_data === "string" ? JSON.parse(photo.location_data) : photo.location_data || {},
      thumbnailPath: photo.thumbnail_path
    };
  }
  /**
   * 快速搜索（不返回照片详情）
   */
  async quickSearch(query, topK = 10) {
    const processed = textPreprocessor.preprocess(query);
    const embeddingService = getEmbeddingService$1();
    const textResult = await embeddingService.textToEmbedding(processed.processed);
    if (!textResult.success || !textResult.vector) {
      return [];
    }
    const allEmbeddings = await this.database.getAllEmbeddings("image");
    const similarities = similarityService.batchSimilarity(textResult.vector, allEmbeddings);
    return similarityService.topK(similarities, topK, 0).map((item, index) => ({
      photoUuid: item.id,
      similarity: item.similarity
    }));
  }
}
new SemanticSearchService();
const __dirname$2 = fileURLToPath(new URL(".", import.meta.url));
class SearchSuggestionService {
  dataDir;
  historyFile;
  history;
  maxHistoryLength;
  constructor() {
    this.dataDir = resolve(__dirname$2, "../../data");
    this.historyFile = resolve(this.dataDir, "search-history.json");
    this.history = [];
    this.maxHistoryLength = 50;
    this.loadHistory();
  }
  /**
   * 加载搜索历史
   */
  loadHistory() {
    try {
      if (existsSync(this.historyFile)) {
        const content = readFileSync(this.historyFile, "utf-8");
        this.history = JSON.parse(content);
      }
    } catch (error) {
      console.error("加载搜索历史失败:", error);
      this.history = [];
    }
  }
  /**
   * 保存搜索历史
   */
  saveHistory() {
    try {
      const dir = dirname(this.historyFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2));
    } catch (error) {
      console.error("保存搜索历史失败:", error);
    }
  }
  /**
   * 添加搜索记录
   */
  addToHistory(query, resultCount = 0) {
    this.history = this.history.filter((item) => item.query.toLowerCase() !== query.toLowerCase());
    this.history.unshift({
      query,
      timestamp: Date.now(),
      resultCount
    });
    if (this.history.length > this.maxHistoryLength) {
      this.history = this.history.slice(0, this.maxHistoryLength);
    }
    this.saveHistory();
  }
  /**
   * 获取搜索历史
   */
  getHistory(limit = 10) {
    return this.history.slice(0, limit);
  }
  /**
   * 清空搜索历史
   */
  clearHistory() {
    this.history = [];
    this.saveHistory();
  }
  /**
   * 获取搜索建议
   */
  async getSuggestions(query) {
    if (!query.trim()) {
      return this.getHistory(5).map((item) => ({
        text: item.query,
        type: "history",
        timestamp: item.timestamp
      }));
    }
    const suggestions = [];
    const lowerQuery = query.toLowerCase();
    const historyMatches = this.history.filter((item) => item.query.toLowerCase().includes(lowerQuery)).slice(0, 3).map((item) => ({
      text: item.query,
      type: "history",
      timestamp: item.timestamp
    }));
    suggestions.push(...historyMatches);
    const commonPlaces = ["日本", "东京", "北京", "上海", "新疆", "家里"];
    for (const place of commonPlaces) {
      if (place.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: place,
          type: "place",
          count: 0
        });
      }
    }
    const timePatterns = [
      `${(/* @__PURE__ */ new Date()).getFullYear()}年`,
      "去年",
      "前年",
      "今年夏天",
      "去年冬天"
    ];
    for (const pattern of timePatterns) {
      if (pattern.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: pattern,
          type: "time"
        });
      }
    }
    const peoplePatterns = ["爸爸", "妈妈", "儿子", "女儿", "全家福"];
    for (const person of peoplePatterns) {
      if (person.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: person,
          type: "person",
          count: 0
        });
      }
    }
    const tagPatterns = ["旅行", "美食", "风景", "人像", "宠物", "日落"];
    for (const tag of tagPatterns) {
      if (tag.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: tag,
          type: "tag",
          count: 0
        });
      }
    }
    return suggestions.slice(0, 8);
  }
  /**
   * 获取热门搜索
   */
  getPopularSearches(limit = 5) {
    const frequency = {};
    for (const item of this.history) {
      frequency[item.query] = (frequency[item.query] || 0) + 1;
    }
    return Object.entries(frequency).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([text, count]) => ({
      text,
      type: "popular",
      count
    }));
  }
  /**
   * 获取搜索建议（用于自动补全）
   */
  async getAutocomplete(query) {
    if (!query.trim()) {
      return [];
    }
    const suggestions = await this.getSuggestions(query);
    return suggestions.map((s) => s.text);
  }
  /**
   * 获取所有唯一的搜索词
   */
  getAllSearchTerms() {
    const terms = /* @__PURE__ */ new Set();
    for (const item of this.history) {
      terms.add(item.query);
    }
    const commonTerms = [
      "日本",
      "东京",
      "北海道",
      "大阪",
      "北京",
      "上海",
      "新疆",
      "2015",
      "2016",
      "2017",
      "2018",
      "2019",
      "2020",
      "旅行",
      "美食",
      "风景",
      "人像",
      "爸爸",
      "妈妈",
      "儿子",
      "全家福"
    ];
    for (const term of commonTerms) {
      terms.add(term);
    }
    return Array.from(terms).sort();
  }
  /**
   * 导出搜索历史
   */
  exportHistory() {
    return JSON.stringify(this.history, null, 2);
  }
  /**
   * 导入搜索历史
   */
  importHistory(jsonData) {
    try {
      const imported = JSON.parse(jsonData);
      if (Array.isArray(imported)) {
        this.history = imported.slice(0, this.maxHistoryLength);
        this.saveHistory();
        return true;
      }
      return false;
    } catch (error) {
      console.error("导入搜索历史失败:", error);
      return false;
    }
  }
}
const suggestionService = new SearchSuggestionService();
const __dirname$1 = (() => {
  try {
    if (process.env.VITE_DEV_SERVER_URL) {
      return fileURLToPath(new URL("data:video/mp2t;base64,LyoqCiAqIFBob3RvTWluZCAtIEVsZWN0cm9uIOS4u+i/m+eoi+WFpeWPowogKi8KaW1wb3J0IHsgYXBwLCBCcm93c2VyV2luZG93LCBpcGNNYWluLCBkaWFsb2csIHNoZWxsLCBwcm90b2NvbCwgbmV0IH0gZnJvbSAnZWxlY3Ryb24nCmltcG9ydCB7IHJlc29sdmUsIGRpcm5hbWUsIGJhc2VuYW1lIH0gZnJvbSAncGF0aCcKaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gJ3VybCcKaW1wb3J0IHsgSUNsb3VkU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2lDbG91ZFNlcnZpY2UuanMnCmltcG9ydCB7IFBob3RvRGF0YWJhc2UgfSBmcm9tICcuLi9kYXRhYmFzZS9kYi5qcycKaW1wb3J0IHsgU2VhcmNoU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3NlYXJjaFNlcnZpY2UuanMnCmltcG9ydCB7IExvY2FsUGhvdG9TZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvbG9jYWxQaG90b1NlcnZpY2UuanMnCmltcG9ydCB7IGZvbGRlclNjYW5uZXIgfSBmcm9tICcuLi9zZXJ2aWNlcy9mb2xkZXJTY2FubmVyLmpzJwppbXBvcnQgeyBpbXBvcnRTZXJ2aWNlLCBpbml0aWFsaXplSW1wb3J0U2VydmljZSwgSW1wb3J0T3B0aW9ucywgSW1wb3J0UmVzdWx0IH0gZnJvbSAnLi4vc2VydmljZXMvaW1wb3J0U2VydmljZS5qcycKaW1wb3J0IHsgaW1wb3J0UHJvZ3Jlc3NTZXJ2aWNlLCBJbXBvcnRQcm9ncmVzcyB9IGZyb20gJy4uL3NlcnZpY2VzL2ltcG9ydFByb2dyZXNzU2VydmljZS5qcycKaW1wb3J0IHsgZ2V0RW1iZWRkaW5nU2VydmljZSwgSHlicmlkRW1iZWRkaW5nU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2h5YnJpZEVtYmVkZGluZ1NlcnZpY2UuanMnCmltcG9ydCB7IFZlY3RvckdlbmVyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvdmVjdG9yR2VuZXJhdGlvblNlcnZpY2UuanMnCmltcG9ydCB7IFNlbWFudGljU2VhcmNoU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3NlbWFudGljU2VhcmNoU2VydmljZS5qcycKaW1wb3J0IHsgU2VhcmNoUmVzdWx0Rm9ybWF0dGVyIH0gZnJvbSAnLi4vc2VydmljZXMvc2VhcmNoUmVzdWx0Rm9ybWF0dGVyLmpzJwppbXBvcnQgeyBDb25maWdTZXJ2aWNlLCBnZXRDb25maWdTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvY29uZmlnU2VydmljZS5qcycKaW1wb3J0IHsgdGh1bWJuYWlsU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3RodW1ibmFpbFNlcnZpY2UuanMnCmltcG9ydCB7IHN1Z2dlc3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvc2VhcmNoU3VnZ2VzdGlvblNlcnZpY2UuanMnCmltcG9ydCB7IGluaXRpYWxpemVTY2FuSm9iU2VydmljZSwgc2NhbkpvYlNlcnZpY2UsIFNjYW5Kb2IgfSBmcm9tICcuLi9zZXJ2aWNlcy9zY2FuSm9iU2VydmljZS5qcycKCi8vIOWuieWFqOiOt+WPliBfX2Rpcm5hbWUgLSDlhbzlrrkgRWxlY3Ryb24gRm9yZ2Ug5p6E5bu6546v5aKDCmNvbnN0IF9fZGlybmFtZSA9ICgoKSA9PiB7CiAgdHJ5IHsKICAgIC8vIEVsZWN0cm9uIEZvcmdlIFZpdGUg5o+S5Lu25Lya6K6+572u5LiA5Lqb546v5aKD5Y+Y6YePCiAgICAvLyDmo4Dmn6XmmK/lkKblnKjlvIDlj5HmqKHlvI8KICAgIGlmIChwcm9jZXNzLmVudi5WSVRFX0RFVl9TRVJWRVJfVVJMKSB7CiAgICAgIC8vIOW8gOWPkeaooeW8j++8muS9v+eUqCBpbXBvcnQubWV0YS51cmwKICAgICAgcmV0dXJuIGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLicsIGltcG9ydC5tZXRhLnVybCkpCiAgICB9CiAgfSBjYXRjaCB7CiAgICAvLyDlv73nlaXplJnor68KICB9CiAgLy8g55Sf5Lqn5qih5byP5oiW5p6E5bu65ZCO77ya5L2/55SoIHByb2Nlc3MuY3dkKCkg5oiWIGFwcC5nZXRBcHBQYXRoKCkKICByZXR1cm4gcHJvY2Vzcy5jd2QoKQp9KSgpCgovLyA9PT09PT09PT09PT09PT09PT09PSBFbGVjdHJvbi1Gb3JnZSDms6jlhaXnmoTluLjph48gPT09PT09PT09PT09PT09PT09PT0KLy8gRm9yZ2Ug5Zyo5p6E5bu65pe25Lya6Ieq5Yqo5rOo5YWl6L+Z5Lqb5bi46YePCmRlY2xhcmUgY29uc3QgTUFJTl9XSU5ET1dfVklURV9ERVZfU0VSVkVSX1VSTDogc3RyaW5nIHwgdW5kZWZpbmVkCmRlY2xhcmUgY29uc3QgTUFJTl9XSU5ET1dfUFJFTE9BRF9XRUJQQUNLX0VOVFJZOiBzdHJpbmcgfCB1bmRlZmluZWQKCi8vIPCfhpUg5YWo5bGA5a2Y5YKo5rS76LeD5omr5o+P5Lu75Yqh77yI55So5LqO5YmN56uv5oGi5aSN77yJCmRlY2xhcmUgZ2xvYmFsIHsKICB2YXIgYWN0aXZlU2NhbkpvYjogU2NhbkpvYiB8IG51bGwKfQpnbG9iYWwuYWN0aXZlU2NhbkpvYiA9IG51bGwKCi8vIOiOt+WPluS4u+eql+WPo+W8leeUqO+8iOeUqOS6juWPkemAgei/m+W6pua2iOaBr++8iQpsZXQgbWFpbldpbmRvdzogQnJvd3NlcldpbmRvdyB8IG51bGwgPSBudWxsCgovLyA9PT09PT09PT09PT09PT09PT09PSDoh6rlrprkuYnljY/orq7ms6jlhowgPT09PT09PT09PT09PT09PT09PT0KbGV0IGRhdGFiYXNlOiBQaG90b0RhdGFiYXNlIHwgbnVsbCA9IG51bGwKbGV0IGlDbG91ZFNlcnZpY2U6IElDbG91ZFNlcnZpY2UgfCBudWxsID0gbnVsbApsZXQgc2VhcmNoU2VydmljZTogU2VhcmNoU2VydmljZSB8IG51bGwgPSBudWxsCmxldCBsb2NhbFBob3RvU2VydmljZTogTG9jYWxQaG90b1NlcnZpY2UgfCBudWxsID0gbnVsbApsZXQgY29uZmlnU2VydmljZTogQ29uZmlnU2VydmljZSB8IG51bGwgPSBudWxsCmltcG9ydCB0eXBlIHsgVGh1bWJuYWlsU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3RodW1ibmFpbFNlcnZpY2UnCmltcG9ydCB0eXBlIHsgU2VhcmNoU3VnZ2VzdGlvblNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9zZWFyY2hTdWdnZXN0aW9uU2VydmljZScKbGV0IHRodW1ibmFpbFN2YzogVGh1bWJuYWlsU2VydmljZSB8IG51bGwgPSBudWxsCmxldCBzdWdnZXN0aW9uU3ZjOiBTZWFyY2hTdWdnZXN0aW9uU2VydmljZSB8IG51bGwgPSBudWxsCgovLyDlvIDlj5HmqKHlvI/vvJrpgJrov4cgYXBwLmlzUGFja2FnZWQg5Yik5pat77yIRWxlY3Ryb24g5qCH5YeG5pa55byP77yJCi8vIOaJk+WMheWQjuS4uiBmYWxzZe+8jOW8gOWPkeaXtuS4uiB0cnVlCmNvbnN0IGlzRGV2ID0gIWFwcC5pc1BhY2thZ2VkCgovLyA9PT09PT09PT09PT09PT09PT09PSDoh6rlrprkuYnljY/orq7ms6jlhowgPT09PT09PT09PT09PT09PT09PT0KCi8qKgogKiDms6jlhozmnKzlnLDotYTmupDoh6rlrprkuYnljY/orq4KICog5bCGIGxvY2FsLXJlc291cmNlOi8vIOWNj+iuruaYoOWwhOWIsOacrOWcsOaWh+S7tuezu+e7n+i3r+W+hAogKiDov5nmoLflj6/ku6Xnu5Xov4fmtY/op4jlmajnmoQgZmlsZTovLyDljY/orq7lronlhajpmZDliLYKICovCmZ1bmN0aW9uIHJlZ2lzdGVyTG9jYWxSZXNvdXJjZVByb3RvY29sKCkgewogIC8vIPCfhpUg5L2/55SoIGhhbmRsZSBBUEkg5pu/5LujIHJlZ2lzdGVyRmlsZVByb3RvY29s77yIRWxlY3Ryb24gMjUrIOaOqOiNkO+8iQogIHByb3RvY29sLmhhbmRsZSgnbG9jYWwtcmVzb3VyY2UnLCBhc3luYyAocmVxdWVzdCkgPT4gewogICAgdHJ5IHsKICAgICAgLy8g56e76Zmk5Y2P6K6u5YmN57yACiAgICAgIGNvbnN0IHVybCA9IHJlcXVlc3QudXJsLnJlcGxhY2UoL15sb2NhbC1yZXNvdXJjZTpcL1wvLywgJycpCgogICAgICAvLyDop6PnoIEgVVJMIOe8lueggeeahOi3r+W+hO+8iOWkhOeQhuS4reaWh+etieeJueauiuWtl+espu+8iQogICAgICBjb25zdCBkZWNvZGVkVXJsID0gZGVjb2RlVVJJQ29tcG9uZW50KHVybCkKCiAgICAgIGNvbnNvbGUubG9nKGBbbG9jYWwtcmVzb3VyY2VdIOivt+axgjogJHtkZWNvZGVkVXJsfWApCgogICAgICAvLyDwn4aVIOajgOafpeaWh+S7tuaYr+WQpuWtmOWcqAogICAgICBjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMnKQogICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZGVjb2RlZFVybCkpIHsKICAgICAgICBjb25zb2xlLmVycm9yKGBbbG9jYWwtcmVzb3VyY2VdIOaWh+S7tuS4jeWtmOWcqDogJHtkZWNvZGVkVXJsfWApCiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZSgnRmlsZSBub3QgZm91bmQnLCB7IHN0YXR1czogNDA0IH0pCiAgICAgIH0KCiAgICAgIGNvbnNvbGUubG9nKGBbbG9jYWwtcmVzb3VyY2VdIOaWh+S7tuWtmOWcqO+8jOi/lOWbnjogJHtkZWNvZGVkVXJsLnN1YnN0cmluZygwLCA2MCl9Li4uYCkKCiAgICAgIC8vIOS9v+eUqCBuZXQuZmV0Y2gg6L+U5Zue5paH5Lu25YaF5a65CiAgICAgIHJldHVybiBhd2FpdCBuZXQuZmV0Y2goJ2ZpbGU6Ly8nICsgZGVjb2RlZFVybCkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tsb2NhbC1yZXNvdXJjZV0g5aSE55CG5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKCdOb3QgZm91bmQnLCB7IHN0YXR1czogNDA0IH0pCiAgICB9CiAgfSkKCiAgY29uc29sZS5sb2coJ+KckyDoh6rlrprkuYnljY/orq4gbG9jYWwtcmVzb3VyY2U6Ly8g5bey5rOo5YaMIChoYW5kbGUgQVBJKScpCn0KCi8vIOi3r+W+hOi+heWKqeWHveaVsCAtIOmAgumFjSBFbGVjdHJvbi1Gb3JnZQpmdW5jdGlvbiBnZXRSZW5kZXJlclBhdGgoKTogc3RyaW5nIHsKICAvLyDlvIDlj5HmqKHlvI/vvJrkvb/nlKggRm9yZ2Ug5o+Q5L6b55qEIERldiBTZXJ2ZXIgVVJMCiAgaWYgKGlzRGV2KSB7CiAgICBpZiAodHlwZW9mIE1BSU5fV0lORE9XX1ZJVEVfREVWX1NFUlZFUl9VUkwgIT09ICd1bmRlZmluZWQnKSB7CiAgICAgIGNvbnNvbGUubG9nKCdbTWFpbl0g5byA5Y+R5qih5byP77ya5L2/55SoIEZvcmdlIFVSTDonLCBNQUlOX1dJTkRPV19WSVRFX0RFVl9TRVJWRVJfVVJMKQogICAgICByZXR1cm4gTUFJTl9XSU5ET1dfVklURV9ERVZfU0VSVkVSX1VSTAogICAgfQogICAgLy8g5LuO546v5aKD5Y+Y6YeP6I635Y+W56uv5Y+j77yM6buY6K6kIDUxNzMKICAgIGNvbnN0IHBvcnQgPSBwcm9jZXNzLmVudi5WSVRFX0RFVl9TRVJWRVJfUE9SVCB8fCAnNTE3MycKICAgIGNvbnNvbGUubG9nKCdbTWFpbl0g5byA5Y+R5qih5byP77ya5L2/55SoIGxvY2FsaG9zdDonLCBwb3J0KQogICAgcmV0dXJuIGBodHRwOi8vbG9jYWxob3N0OiR7cG9ydH1gCiAgfQogIC8vIOeUn+S6p+aooeW8j++8muS7juaehOW7uuebruW9leWKoOi9vQogIC8vIEVsZWN0cm9uIEZvcmdlIFZpdGUg5p6E5bu65ZCO77yMcmVuZGVyZXIg5ZyoIGFwcC5hc2FyIOWGhQogIGNvbnN0IHByb2RQYXRoID0gcmVzb2x2ZShfX2Rpcm5hbWUsICcuLi8uLi9yZW5kZXJlci9tYWluX3dpbmRvdy9pbmRleC5odG1sJykKICBjb25zb2xlLmxvZygnW01haW5dIOeUn+S6p+aooeW8j++8muWKoOi9veacrOWcsOaWh+S7tjonLCBwcm9kUGF0aCkKICByZXR1cm4gcHJvZFBhdGgKfQoKZnVuY3Rpb24gZ2V0UHJlbG9hZFBhdGgoKTogc3RyaW5nIHsKICAvLyBGb3JnZSBWaXRlIOaPkuS7tuS8muiHquWKqOWkhOeQhiBwcmVsb2FkIOi3r+W+hAogIGlmICh0eXBlb2YgTUFJTl9XSU5ET1dfUFJFTE9BRF9XRUJQQUNLX0VOVFJZICE9PSAndW5kZWZpbmVkJykgewogICAgcmV0dXJuIE1BSU5fV0lORE9XX1BSRUxPQURfV0VCUEFDS19FTlRSWQogIH0KICAvLyDlvIDlj5HmqKHlvI/lm57pgIDot6/lvoQgLSDkvb/nlKggLnZpdGUvYnVpbGQvcHJlbG9hZCDnm67lvZUKICByZXR1cm4gcmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCAnLnZpdGUvYnVpbGQvcHJlbG9hZC9pbmRleC5qcycpCn0KCmZ1bmN0aW9uIGNyZWF0ZVdpbmRvdygpIHsKICAvLyBDU1Ag562W55Wl6YWN572uCiAgY29uc3QgY3NwUG9saWN5ID0gewogICAgJ2RlZmF1bHQtc3JjJzogWyInc2VsZiciXSwKICAgICdzY3JpcHQtc3JjJzogWyInc2VsZiciLCAiJ3Vuc2FmZS1pbmxpbmUnIiwgIid1bnNhZmUtZXZhbCciXSwKICAgICdzdHlsZS1zcmMnOiBbIidzZWxmJyIsICIndW5zYWZlLWlubGluZSciLCAiaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbSJdLAogICAgJ2ltZy1zcmMnOiBbIidzZWxmJyIsICJkYXRhOiIsICJibG9iOiIsICJodHRwczoiLCAibG9jYWwtcmVzb3VyY2U6Il0sCiAgICAnZm9udC1zcmMnOiBbIidzZWxmJyIsICJodHRwczovL2ZvbnRzLmdzdGF0aWMuY29tIl0sCiAgICAnY29ubmVjdC1zcmMnOiBbIidzZWxmJyIsICJodHRwOi8vbG9jYWxob3N0OioiLCAiaHR0cHM6Ly9odWdnaW5nZmFjZS5jbyIsICJodHRwczovL2Nkbi5qc2RlbGl2ci5uZXQiXQogIH0KCiAgbWFpbldpbmRvdyA9IG5ldyBCcm93c2VyV2luZG93KHsKICAgIHdpZHRoOiAxMjAwLAogICAgaGVpZ2h0OiA4MDAsCiAgICBtaW5XaWR0aDogOTAwLAogICAgbWluSGVpZ2h0OiA2MDAsCiAgICB3ZWJQcmVmZXJlbmNlczogewogICAgICBwcmVsb2FkOiBnZXRQcmVsb2FkUGF0aCgpLAogICAgICBub2RlSW50ZWdyYXRpb246IGZhbHNlLAogICAgICBjb250ZXh0SXNvbGF0aW9uOiB0cnVlLAogICAgICBzYW5kYm94OiBmYWxzZSwKICAgICAgd2ViU2VjdXJpdHk6IHRydWUsICAvLyDnlJ/kuqfnjq/looPlu7rorq7orr7kuLogdHJ1ZQogICAgICBhbGxvd1J1bm5pbmdJbnNlY3VyZUNvbnRlbnQ6IGZhbHNlCiAgICB9LAogICAgdGl0bGVCYXJTdHlsZTogJ2hpZGRlbicsCiAgICB0aXRsZUJhck92ZXJsYXk6IHsKICAgICAgY29sb3I6ICcjZmZmZmZmJywKICAgICAgc3ltYm9sQ29sb3I6ICcjNUU2QUQyJywKICAgICAgaGVpZ2h0OiA0MAogICAgfSwKICAgIGJhY2tncm91bmRDb2xvcjogJyNmNWY1ZjcnLAogICAgc2hvdzogZmFsc2UsCiAgICBmcmFtZTogZmFsc2UKICB9KQoKICAvLyDorr7nva4gQ1NQIOWktAogIGlmIChpc0RldikgewogICAgLy8g5byA5Y+R546v5aKD77ya5a695p2+55qEIENTUCDlhYHorrjng63ph43ovb0KICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uQmVmb3JlU2VuZEhlYWRlcnMoCiAgICAgIChkZXRhaWxzLCBjYWxsYmFjaykgPT4gewogICAgICAgIGNhbGxiYWNrKHsgcmVxdWVzdEhlYWRlcnM6IGRldGFpbHMucmVxdWVzdEhlYWRlcnMgfSkKICAgICAgfQogICAgKQogIH0gZWxzZSB7CiAgICAvLyDnlJ/kuqfnjq/looPvvJrkuKXmoLwgQ1NQCiAgICBtYWluV2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVNlbmRIZWFkZXJzKAogICAgICAoZGV0YWlscywgY2FsbGJhY2spID0+IHsKICAgICAgICBjb25zdCBjc3BIZWFkZXIgPSBPYmplY3QuZW50cmllcyhjc3BQb2xpY3kpCiAgICAgICAgICAubWFwKChba2V5LCB2YWx1ZXNdKSA9PiBgJHtrZXl9ICR7dmFsdWVzLmpvaW4oJyAnKX1gKQogICAgICAgICAgLmpvaW4oJzsgJykKICAgICAgICBjYWxsYmFjayh7CiAgICAgICAgICByZXF1ZXN0SGVhZGVyczogewogICAgICAgICAgICAuLi5kZXRhaWxzLnJlcXVlc3RIZWFkZXJzLAogICAgICAgICAgICAnQ29udGVudC1TZWN1cml0eS1Qb2xpY3knOiBjc3BIZWFkZXIKICAgICAgICAgIH0KICAgICAgICB9KQogICAgICB9CiAgICApCiAgfQoKICAvLyDlvIDlj5HmqKHlvI/liqDovb3mnKzlnLDmnI3liqHlmajvvIznlJ/kuqfmqKHlvI/liqDovb3mnoTlu7rmlofku7YKICBjb25zdCByZW5kZXJlclVybCA9IGdldFJlbmRlcmVyUGF0aCgpCiAgY29uc29sZS5sb2coJ1tNYWluXSBMb2FkaW5nIHJlbmRlcmVyIGZyb206JywgcmVuZGVyZXJVcmwpCgogIG1haW5XaW5kb3cubG9hZFVSTChyZW5kZXJlclVybCkuY2F0Y2goZXJyID0+IHsKICAgIGNvbnNvbGUuZXJyb3IoJ1tNYWluXSBGYWlsZWQgdG8gbG9hZCBVUkw6JywgZXJyKQogIH0pCgogIC8vIOW8gOWPkeaooeW8j+aJk+W8gCBEZXZUb29scwogIGlmIChpc0RldikgewogICAgbWFpbldpbmRvdy53ZWJDb250ZW50cy5vcGVuRGV2VG9vbHMoeyBtb2RlOiAnZGV0YWNoJyB9KQogIH0KCiAgbWFpbldpbmRvdy5vbmNlKCdyZWFkeS10by1zaG93JywgKCkgPT4gewogICAgY29uc29sZS5sb2coJ1tNYWluXSBXaW5kb3cgcmVhZHkgdG8gc2hvdycpCiAgICBtYWluV2luZG93Py5zaG93KCkKICAgIG1haW5XaW5kb3c/LmZvY3VzKCkKICB9KQoKICAvLyDlpITnkIbliqDovb3lpLHotKUKICBtYWluV2luZG93LndlYkNvbnRlbnRzLm9uKCdkaWQtZmFpbC1sb2FkJywgKGV2ZW50LCBlcnJvckNvZGUsIGVycm9yRGVzY3JpcHRpb24pID0+IHsKICAgIGNvbnNvbGUuZXJyb3IoJ1tNYWluXSBGYWlsZWQgdG8gbG9hZDonLCBlcnJvckNvZGUsIGVycm9yRGVzY3JpcHRpb24pCiAgfSkKCiAgLy8g5by65Yi25pi+56S656qX5Y+j77yI5aaC5p6cIDMg56eS5ZCO6L+Y5rKh5pyJ5pi+56S677yJCiAgc2V0VGltZW91dCgoKSA9PiB7CiAgICBpZiAobWFpbldpbmRvdyAmJiAhbWFpbldpbmRvdy5pc1Zpc2libGUoKSkgewogICAgICBjb25zb2xlLmxvZygnW01haW5dIEZvcmNlIHNob3dpbmcgd2luZG93IGFmdGVyIDNzJykKICAgICAgbWFpbldpbmRvdy5zaG93KCkKICAgICAgbWFpbldpbmRvdy5mb2N1cygpCiAgICB9CiAgfSwgMzAwMCkKCiAgLy8g5aSE55CG5aSW6YOo6ZO+5o6lCiAgbWFpbldpbmRvdy53ZWJDb250ZW50cy5zZXRXaW5kb3dPcGVuSGFuZGxlcigoeyB1cmwgfSkgPT4gewogICAgc2hlbGwub3BlbkV4dGVybmFsKHVybCkKICAgIHJldHVybiB7IGFjdGlvbjogJ2RlbnknIH0KICB9KQoKICBtYWluV2luZG93Lm9uKCdjbG9zZWQnLCAoKSA9PiB7CiAgICBtYWluV2luZG93ID0gbnVsbAogIH0pCn0KCi8vIOWIneWni+WMluacjeWKoQphc3luYyBmdW5jdGlvbiBpbml0U2VydmljZXMoKSB7CiAgY29uc29sZS5sb2coJ+ato+WcqOWIneWni+WMluacjeWKoS4uLicpCgogIHRyeSB7CiAgICAvLyDliJ3lp4vljJbphY3nva7mnI3liqEKICAgIGNvbmZpZ1NlcnZpY2UgPSBuZXcgQ29uZmlnU2VydmljZSgpCiAgICBjb25zb2xlLmxvZygn4pyTIOmFjee9ruacjeWKoeWIneWni+WMluWujOaIkCcpCgogICAgLy8g5Yid5aeL5YyW5pWw5o2u5bqTIC0g5L2/55So6buY6K6k6Lev5b6E77yI6aG555uu55uu5b2V5LiL55qEIGRhdGEvcGhvdG8tbWluZC5kYu+8iQogICAgLy8g5rOo5oSP77ya5LiN6KaB5L+u5pS55pWw5o2u5bqT6Lev5b6E77yM5ZCm5YiZ5bey5a+85YWl55qE54Wn54mH5pWw5o2u5Lya5Lii5aSxCiAgICBkYXRhYmFzZSA9IG5ldyBQaG90b0RhdGFiYXNlKCkKICAgIGF3YWl0IGRhdGFiYXNlLmluaXQoKQogICAgY29uc29sZS5sb2coJ+KckyDmlbDmja7lupPliJ3lp4vljJblrozmiJAnKQoKICAgIC8vIOWIneWni+WMluaQnOe0ouacjeWKoQogICAgc2VhcmNoU2VydmljZSA9IG5ldyBTZWFyY2hTZXJ2aWNlKGRhdGFiYXNlKQogICAgY29uc29sZS5sb2coJ+KckyDmkJzntKLmnI3liqHliJ3lp4vljJblrozmiJAnKQoKICAgIC8vIOWIneWni+WMlue8qeeVpeWbvuacjeWKoQogICAgdGh1bWJuYWlsU3ZjID0gdGh1bWJuYWlsU2VydmljZQogICAgYXdhaXQgdGh1bWJuYWlsU3ZjLmluaXQoKQogICAgY29uc29sZS5sb2coJ+KckyDnvKnnlaXlm77mnI3liqHliJ3lp4vljJblrozmiJAnKQoKICAgIC8vIOWIneWni+WMluaQnOe0ouW7uuiuruacjeWKoQogICAgc3VnZ2VzdGlvblN2YyA9IHN1Z2dlc3Rpb25TZXJ2aWNlCiAgICBjb25zb2xlLmxvZygn4pyTIOaQnOe0ouW7uuiuruacjeWKoeWIneWni+WMluWujOaIkCcpCgogICAgLy8g5Yid5aeL5YyWIGlDbG91ZCDmnI3liqEKICAgIGlmIChkYXRhYmFzZSkgewogICAgICBpQ2xvdWRTZXJ2aWNlID0gbmV3IElDbG91ZFNlcnZpY2UoZGF0YWJhc2UpCiAgICAgIGNvbnN0IGluaXRpYWxpemVkID0gYXdhaXQgaUNsb3VkU2VydmljZS5pbml0aWFsaXplKCcnKQogICAgICBpZiAoaW5pdGlhbGl6ZWQpIHsKICAgICAgICBjb25zb2xlLmxvZygn4pyTIGlDbG91ZCDmnI3liqHliJ3lp4vljJblrozmiJAnKQogICAgICB9IGVsc2UgewogICAgICAgIGNvbnNvbGUubG9nKCfinJMgaUNsb3VkIOacjeWKoeW3suWwsee7qu+8iOS9v+eUqOaooeaLn+aVsOaNru+8iScpCiAgICAgIH0KCiAgICAgIC8vIOWIneWni+WMluacrOWcsOeFp+eJh+acjeWKoQogICAgICBsb2NhbFBob3RvU2VydmljZSA9IG5ldyBMb2NhbFBob3RvU2VydmljZShkYXRhYmFzZSwgdGh1bWJuYWlsU3ZjKQogICAgICBjb25zb2xlLmxvZygn4pyTIOacrOWcsOeFp+eJh+acjeWKoeWIneWni+WMluWujOaIkCcpCgogICAgICAvLyDliJ3lp4vljJblr7zlhaXmnI3liqHvvIjkvb/nlKjnm7jlkIznmoTmlbDmja7lupPlrp7kvovvvIkKICAgICAgaW5pdGlhbGl6ZUltcG9ydFNlcnZpY2UoZGF0YWJhc2UpCiAgICAgIGNvbnNvbGUubG9nKCfinJMg5a+85YWl5pyN5Yqh5Yid5aeL5YyW5a6M5oiQJykKCiAgICAgIC8vIPCfhpUg5Yid5aeL5YyW5omr5o+P5Lu75Yqh5pyN5YqhCiAgICAgIGluaXRpYWxpemVTY2FuSm9iU2VydmljZShkYXRhYmFzZSkKICAgICAgY29uc29sZS5sb2coJ+KckyDmiavmj4/ku7vliqHmnI3liqHliJ3lp4vljJblrozmiJAnKQogICAgfQoKICAgIGNvbnNvbGUubG9nKCfmiYDmnInmnI3liqHliJ3lp4vljJblrozmiJDvvIEnKQogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICBjb25zb2xlLmVycm9yKCfmnI3liqHliJ3lp4vljJblpLHotKU6JywgZXJyb3IpCiAgfQp9CgovLyDwn4aVIOajgOafpeW5tuaBouWkjeaJq+aPj+S7u+WKoQphc3luYyBmdW5jdGlvbiBjaGVja0FuZFJlY292ZXJTY2FuSm9iKCkgewogIGlmICghc2NhbkpvYlNlcnZpY2UpIHsKICAgIGNvbnNvbGUubG9nKCdbTWFpbl0gU2NhbkpvYlNlcnZpY2Ugbm90IGF2YWlsYWJsZSwgc2tpcHBpbmcgcmVjb3ZlcnkgY2hlY2snKQogICAgcmV0dXJuCiAgfQoKICBjb25zdCBhY3RpdmVKb2IgPSBzY2FuSm9iU2VydmljZS5nZXRBY3RpdmVKb2IoKQoKICBpZiAoIWFjdGl2ZUpvYikgewogICAgY29uc29sZS5sb2coJ1tNYWluXSBObyBhY3RpdmUgc2NhbiBqb2IgdG8gcmVjb3ZlcicpCiAgICBnbG9iYWwuYWN0aXZlU2NhbkpvYiA9IG51bGwKICAgIHJldHVybgogIH0KCiAgY29uc29sZS5sb2coJ1tNYWluXSBGb3VuZCBhY3RpdmUgc2NhbiBqb2I6JywgYWN0aXZlSm9iLmlkLCAnc3RhdHVzOicsIGFjdGl2ZUpvYi5zdGF0dXMpCgogIGlmIChzY2FuSm9iU2VydmljZS5pc0pvYlN0YWxlKGFjdGl2ZUpvYikpIHsKICAgIGNvbnNvbGUubG9nKCdbTWFpbl0gU2NhbiBqb2IgaXMgc3RhbGUgKD41bWluIG5vIGhlYXJ0YmVhdCksIG1hcmtpbmcgYXMgZmFpbGVkJykKICAgIHNjYW5Kb2JTZXJ2aWNlLm1hcmtKb2JBc0ZhaWxlZChhY3RpdmVKb2IuaWQpCiAgICBnbG9iYWwuYWN0aXZlU2NhbkpvYiA9IG51bGwKICB9IGVsc2UgewogICAgY29uc29sZS5sb2coJ1tNYWluXSBTY2FuIGpvYiBpcyBzdGlsbCBhY3RpdmUgKDw1bWluKSwgY2FuIGJlIHJlc3VtZWQnKQogICAgLy8g5a2Y5YKo5Yiw5YWo5bGA5Y+Y6YeP77yM5L6b5YmN56uv5p+l6K+iCiAgICBnbG9iYWwuYWN0aXZlU2NhbkpvYiA9IGFjdGl2ZUpvYgogIH0KfQoKLy8gSVBDIOWkhOeQhueoi+W6jwpmdW5jdGlvbiBzZXR1cElQQ0hhbmRsZXJzKCkgewogIC8vID09PT09PT09PT09PT09PT09PT09IGlDbG91ZCDnm7jlhbMgPT09PT09PT09PT09PT09PT09PT0KCiAgLy8g6YCJ5oupIFBob3RvcyBMaWJyYXJ5CiAgaXBjTWFpbi5oYW5kbGUoJ2ljbG91ZDpzZWxlY3QtbGlicmFyeScsIGFzeW5jICgpID0+IHsKICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpYWxvZy5zaG93T3BlbkRpYWxvZyh7CiAgICAgIHByb3BlcnRpZXM6IFsnb3BlbkRpcmVjdG9yeSddLAogICAgICB0aXRsZTogJ+mAieaLqSBpQ2xvdWQgUGhvdG9zIExpYnJhcnknLAogICAgICBkZWZhdWx0UGF0aDogYC9Vc2Vycy8ke3Byb2Nlc3MuZW52LlVTRVJ9L1BpY3R1cmVzL1Bob3RvcyBMaWJyYXJ5LnBob3Rvc2xpYnJhcnlgCiAgICB9KQoKICAgIGlmICghcmVzdWx0LmNhbmNlbGVkICYmIHJlc3VsdC5maWxlUGF0aHMubGVuZ3RoID4gMCkgewogICAgICBjb25zdCBsaWJyYXJ5UGF0aCA9IHJlc3VsdC5maWxlUGF0aHNbMF0KICAgICAgLy8g5Yid5aeL5YyWIGlDbG91ZCDmnI3liqEKICAgICAgaWYgKGlDbG91ZFNlcnZpY2UpIHsKICAgICAgICBhd2FpdCBpQ2xvdWRTZXJ2aWNlLmluaXRpYWxpemUobGlicmFyeVBhdGgpCiAgICAgIH0KICAgICAgcmV0dXJuIGxpYnJhcnlQYXRoCiAgICB9CiAgICByZXR1cm4gbnVsbAogIH0pCgogIC8vID09PT09PT09PT09PT09PT09PT09IOeFp+eJh+ebuOWFsyA9PT09PT09PT09PT09PT09PT09PQoKICAvLyDojrflj5bnhafniYfliJfooaggLSDmgLvmmK/ku47mnKzlnLDmlbDmja7lupPojrflj5YKICBpcGNNYWluLmhhbmRsZSgncGhvdG9zOmdldC1saXN0JywgYXN5bmMgKGV2ZW50LCBvcHRpb25zKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCBsaW1pdCA9IG9wdGlvbnM/LmxpbWl0IHx8IDEwMAogICAgICBjb25zdCBvZmZzZXQgPSBvcHRpb25zPy5vZmZzZXQgfHwgMAoKICAgICAgY29uc29sZS5sb2coYFtJUENdIHBob3RvczpnZXQtbGlzdCAtIGxpbWl0OiAke2xpbWl0fSwgb2Zmc2V0OiAke29mZnNldH1gKQogICAgICBjb25zb2xlLmxvZyhgW0lQQ10gbG9jYWxQaG90b1NlcnZpY2Ug5Y+v55SoOiAkeyEhbG9jYWxQaG90b1NlcnZpY2V9YCkKCiAgICAgIC8vIOaAu+aYr+S7juacrOWcsOaVsOaNruW6k+iOt+WPluW3suWvvOWFpeeahOeFp+eJhwogICAgICBpZiAobG9jYWxQaG90b1NlcnZpY2UpIHsKICAgICAgICB0cnkgewogICAgICAgICAgY29uc3QgbG9jYWxQaG90b3MgPSBsb2NhbFBob3RvU2VydmljZS5nZXRMb2NhbFBob3RvcyhsaW1pdCwgb2Zmc2V0KQogICAgICAgICAgY29uc29sZS5sb2coYFtJUENdIOS7juacrOWcsOaVsOaNruW6k+iOt+WPliAke2xvY2FsUGhvdG9zLmxlbmd0aH0g5byg54Wn54mHYCkKICAgICAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDliY0z5byg54Wn54mHOmAsIGxvY2FsUGhvdG9zLnNsaWNlKDAsIDMpKQogICAgICAgICAgcmV0dXJuIGxvY2FsUGhvdG9zCiAgICAgICAgfSBjYXRjaCAoaW5uZXJFcnJvcikgewogICAgICAgICAgY29uc29sZS5lcnJvcignW0lQQ10gZ2V0TG9jYWxQaG90b3Mg5aSx6LSlOicsIGlubmVyRXJyb3IpCiAgICAgICAgICByZXR1cm4gW10KICAgICAgICB9CiAgICAgIH0KCiAgICAgIC8vIOWmguaenOayoeacieacrOWcsOacjeWKoe+8jOWwneivlSBpQ2xvdWQKICAgICAgaWYgKGlDbG91ZFNlcnZpY2UpIHsKICAgICAgICByZXR1cm4gYXdhaXQgaUNsb3VkU2VydmljZS5nZXRQaG90b3MobGltaXQsIG9mZnNldCkKICAgICAgfQoKICAgICAgLy8g5ZCm5YiZ6L+U5Zue56m65pWw57uE77yI5LiN5piv5qih5ouf5pWw5o2u77yJCiAgICAgIGNvbnNvbGUubG9nKCdbSVBDXSDmsqHmnInmnKzlnLDnhafniYfvvIzov5Tlm57nqbrmlbDnu4QnKQogICAgICByZXR1cm4gW10KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOiOt+WPlueFp+eJh+WIl+ihqOWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIFtdCiAgICB9CiAgfSkKCiAgLy8g6I635Y+W54Wn54mH5oC75pWwCiAgaXBjTWFpbi5oYW5kbGUoJ3Bob3RvczpnZXQtY291bnQnLCBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBpZiAobG9jYWxQaG90b1NlcnZpY2UpIHsKICAgICAgICBjb25zdCBjb3VudCA9IGxvY2FsUGhvdG9TZXJ2aWNlLmdldFBob3RvQ291bnQoKQogICAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDnhafniYfmgLvmlbA6ICR7Y291bnR9YCkKICAgICAgICByZXR1cm4geyB0b3RhbDogY291bnQgfQogICAgICB9CiAgICAgIHJldHVybiB7IHRvdGFsOiAwIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOiOt+WPlueFp+eJh+aAu+aVsOWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgdG90YWw6IDAgfQogICAgfQogIH0pCgogIC8vIOiOt+WPluayoeacieWQkemHj+eahOeFp+eJh++8iOeUqOS6juaJuemHj+eUn+aIkO+8iQogIGlwY01haW4uaGFuZGxlKCdwaG90b3M6Z2V0LXdpdGhvdXQtZW1iZWRkaW5ncycsIGFzeW5jIChldmVudCwgbGltaXQ6IG51bWJlciA9IDEwMCkgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKGxvY2FsUGhvdG9TZXJ2aWNlKSB7CiAgICAgICAgY29uc3QgcGhvdG9zID0gbG9jYWxQaG90b1NlcnZpY2UuZ2V0UGhvdG9zV2l0aG91dEVtYmVkZGluZ3MobGltaXQpCiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgcGhvdG9zIH0KICAgICAgfQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgcGhvdG9zOiBbXSwgZXJyb3I6ICdsb2NhbFBob3RvU2VydmljZSBub3QgYXZhaWxhYmxlJyB9CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDojrflj5bml6DlkJHph4/nhafniYflpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBwaG90b3M6IFtdLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9CiAgICB9CiAgfSkKCiAgLy8g5L+d5a2Y54Wn54mH5ZCR6YePCiAgaXBjTWFpbi5oYW5kbGUoJ3Bob3RvczpzYXZlLWVtYmVkZGluZycsIGFzeW5jIChldmVudCwgcGhvdG9VdWlkOiBzdHJpbmcsIHZlY3RvcjogbnVtYmVyW10pID0+IHsKICAgIHRyeSB7CiAgICAgIGlmIChkYXRhYmFzZSkgewogICAgICAgIGF3YWl0IGRhdGFiYXNlLnNhdmVFbWJlZGRpbmcocGhvdG9VdWlkLCB2ZWN0b3IsICdpbWFnZScpCiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9CiAgICAgIH0KICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnRGF0YWJhc2Ugbm90IGF2YWlsYWJsZScgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5L+d5a2Y5ZCR6YeP5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOiOt+WPlueFp+eJh+ivpuaDhQogIGlwY01haW4uaGFuZGxlKCdwaG90b3M6Z2V0LWRldGFpbCcsIGFzeW5jIChldmVudCwgcGhvdG9JZCkgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKCFpQ2xvdWRTZXJ2aWNlKSB7CiAgICAgICAgcmV0dXJuIGdlbmVyYXRlTW9ja1Bob3RvcygxLCBwYXJzZUludChwaG90b0lkKSB8fCAwKVswXQogICAgICB9CiAgICAgIHJldHVybiBhd2FpdCBpQ2xvdWRTZXJ2aWNlLmdldFBob3RvRGV0YWlsKHBob3RvSWQpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCfojrflj5bnhafniYfor6bmg4XlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiBudWxsCiAgICB9CiAgfSkKCiAgLy8g5Yig6Zmk54Wn54mHCiAgaXBjTWFpbi5oYW5kbGUoJ3Bob3RvczpkZWxldGUnLCBhc3luYyAoZXZlbnQsIHBob3RvSWQ6IG51bWJlcikgPT4gewogICAgdHJ5IHsKICAgICAgY29uc29sZS5sb2coYFtJUENdIOWIoOmZpOeFp+eJhzogJHtwaG90b0lkfWApCgogICAgICAvLyDkvJjlhYjkvb/nlKjmnKzlnLDnhafniYfmnI3liqHliKDpmaQKICAgICAgaWYgKGxvY2FsUGhvdG9TZXJ2aWNlKSB7CiAgICAgICAgY29uc3Qgc3VjY2VzcyA9IGxvY2FsUGhvdG9TZXJ2aWNlLmRlbGV0ZVBob3RvKHBob3RvSWQpCiAgICAgICAgaWYgKHN1Y2Nlc3MpIHsKICAgICAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDnhafniYcgJHtwaG90b0lkfSDlt7Lku47mnKzlnLDmlbDmja7lupPliKDpmaRgKQogICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9CiAgICAgICAgfQogICAgICB9CgogICAgICAvLyDlpoLmnpzmnKzlnLDmnI3liqHliKDpmaTlpLHotKXvvIzlsJ3or5UgaUNsb3VkIOacjeWKoQogICAgICBpZiAoaUNsb3VkU2VydmljZSAmJiAnZGVsZXRlUGhvdG8nIGluIGlDbG91ZFNlcnZpY2UpIHsKICAgICAgICBjb25zdCBzdWNjZXNzID0gYXdhaXQgKGlDbG91ZFNlcnZpY2UgYXMgYW55KS5kZWxldGVQaG90byhwaG90b0lkKQogICAgICAgIHJldHVybiB7IHN1Y2Nlc3MgfQogICAgICB9CgogICAgICAvLyDmsqHmnInlj6/nlKjnmoTmnI3liqHml7bov5Tlm57plJnor68KICAgICAgY29uc29sZS53YXJuKCdbSVBDXSDmsqHmnInlj6/nlKjnmoTnhafniYfmnI3liqHvvIzml6Dms5XliKDpmaTnhafniYcnKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICfmsqHmnInlj6/nlKjnmoTnhafniYfmnI3liqEnIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOWIoOmZpOeFp+eJh+Wksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyDlr7zlh7rnhafniYcKICBpcGNNYWluLmhhbmRsZSgncGhvdG9zOmV4cG9ydCcsIGFzeW5jIChldmVudCwgcGFyYW1zOiB7IHBob3RvSWQ6IG51bWJlcjsgZmlsZVBhdGg6IHN0cmluZzsgZXhwb3J0UGF0aDogc3RyaW5nIH0pID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcGhvdG9JZCwgZmlsZVBhdGgsIGV4cG9ydFBhdGggfSA9IHBhcmFtcwogICAgICBjb25zb2xlLmxvZyhgW0lQQ10g5a+85Ye654Wn54mHOiAke3Bob3RvSWR9IC0+ICR7ZXhwb3J0UGF0aH1gKQoKICAgICAgLy8g5L2/55SoIGRpYWxvZyDorqnnlKjmiLfpgInmi6nlr7zlh7rot6/lvoQKICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGlhbG9nLnNob3dTYXZlRGlhbG9nKHsKICAgICAgICB0aXRsZTogJ+mAieaLqeWvvOWHuuS9jee9ricsCiAgICAgICAgZGVmYXVsdFBhdGg6IGV4cG9ydFBhdGgsCiAgICAgICAgYnV0dG9uTGFiZWw6ICfkv53lrZgnCiAgICAgIH0pCgogICAgICBpZiAocmVzdWx0LmNhbmNlbGVkKSB7CiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAn55So5oi35Y+W5raI5a+85Ye6JyB9CiAgICAgIH0KCiAgICAgIGNvbnN0IHRhcmdldFBhdGggPSByZXN1bHQuZmlsZVBhdGgKICAgICAgaWYgKCF0YXJnZXRQYXRoKSB7CiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAn5pyq6YCJ5oup5a+85Ye66Lev5b6EJyB9CiAgICAgIH0KCiAgICAgIC8vIOWvvOWFpSBmcyDmqKHlnZflpI3liLbmlofku7YKICAgICAgY29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzJykKCiAgICAgIC8vIOajgOafpea6kOaWh+S7tuaYr+WQpuWtmOWcqAogICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZmlsZVBhdGgpKSB7CiAgICAgICAgY29uc29sZS5lcnJvcihgW0lQQ10g5rqQ5paH5Lu25LiN5a2Y5ZyoOiAke2ZpbGVQYXRofWApCiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAn5rqQ5paH5Lu25LiN5a2Y5ZyoJyB9CiAgICAgIH0KCiAgICAgIC8vIOWkjeWItuaWh+S7tgogICAgICBmcy5jb3B5RmlsZVN5bmMoZmlsZVBhdGgsIHRhcmdldFBhdGgpCiAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDnhafniYflt7Llr7zlh7rliLA6ICR7dGFyZ2V0UGF0aH1gKQoKICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZXhwb3J0UGF0aDogdGFyZ2V0UGF0aCB9CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDlr7zlh7rnhafniYflpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9CiAgICB9CiAgfSkKCiAgLy8gPT09PT09PT09PT09PT09PT09PT0g5pCc57Si55u45YWzID09PT09PT09PT09PT09PT09PT09CgogIC8vIOaQnOe0oueFp+eJhwogIGlwY01haW4uaGFuZGxlKCdwaG90b3M6c2VhcmNoJywgYXN5bmMgKGV2ZW50LCBxdWVyeSwgZmlsdGVycykgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKCFzZWFyY2hTZXJ2aWNlKSB7CiAgICAgICAgLy8g5qih5ouf5pCc57Si57uT5p6cCiAgICAgICAgcmV0dXJuIHsgcmVzdWx0czogZ2VuZXJhdGVNb2NrUGhvdG9zKDEwLCAwKSwgdG90YWw6IDEwIH0KICAgICAgfQogICAgICByZXR1cm4gYXdhaXQgc2VhcmNoU2VydmljZS5zZWFyY2gocXVlcnksIGZpbHRlcnMpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCfmkJzntKLlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHJlc3VsdHM6IFtdLCB0b3RhbDogMCB9CiAgICB9CiAgfSkKCiAgLy8g6I635Y+W5pm66IO955u45YaMCiAgaXBjTWFpbi5oYW5kbGUoJ2FsYnVtczpnZXQtc21hcnQnLCBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBpZiAoIXNlYXJjaFNlcnZpY2UpIHsKICAgICAgICByZXR1cm4gZ2VuZXJhdGVNb2NrQWxidW1zKCkKICAgICAgfQogICAgICByZXR1cm4gYXdhaXQgc2VhcmNoU2VydmljZS5nZXRTbWFydEFsYnVtcygpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCfojrflj5bmmbrog73nm7jlhozlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiBbXQogICAgfQogIH0pCgogIC8vIOWIt+aWsOaZuuiDveebuOWGjO+8iOmAmuefpeWJjeerr+mHjeaWsOiOt+WPlu+8iQogIGlwY01haW4uaGFuZGxlKCdhbGJ1bXM6cmVmcmVzaCcsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIC8vIOaZuuiDveebuOWGjOaYr+WKqOaAgeiuoeeul+eahO+8jOS4jemcgOimgemineWkluaTjeS9nAogICAgICAvLyDliY3nq6/osIPnlKggZ2V0U21hcnRBbGJ1bXMg5pe25Lya6Ieq5Yqo6YeN5paw6K6h566XCiAgICAgIGNvbnNvbGUubG9nKCdbSVBDXSDmlLbliLDnm7jlhozliLfmlrDor7fmsYInKQogICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnQWxidW1zIHJlZnJlc2hlZCcgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcign5Yi35paw55u45YaM5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vID09PT09PT09PT09PT09PT09PT09IOS6uueJqeebuOWFsyA9PT09PT09PT09PT09PT09PT09PQoKICAvLyDojrflj5bmiYDmnInkurrniakKICBpcGNNYWluLmhhbmRsZSgncGVvcGxlOmdldC1hbGwnLCBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBpZiAoIWRhdGFiYXNlKSB7CiAgICAgICAgcmV0dXJuIGdlbmVyYXRlTW9ja1Blb3BsZSgpCiAgICAgIH0KICAgICAgcmV0dXJuIGRhdGFiYXNlLmdldEFsbFBlcnNvbnMoKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcign6I635Y+W5Lq654mp5YiX6KGo5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gW10KICAgIH0KICB9KQoKICAvLyDmt7vliqDkurrniakKICBpcGNNYWluLmhhbmRsZSgncGVvcGxlOmFkZCcsIGFzeW5jIChldmVudCwgcGVyc29uKSA9PiB7CiAgICB0cnkgewogICAgICBpZiAoIWRhdGFiYXNlKSByZXR1cm4gLTEKICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkZFBlcnNvbihwZXJzb24pCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCfmt7vliqDkurrnianlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiAtMQogICAgfQogIH0pCgogIC8vIOaQnOe0ouS6uueJqSAo566A5Y2VKQogIGlwY01haW4uaGFuZGxlKCdwZW9wbGU6c2VhcmNoLXNpbXBsZScsIGFzeW5jIChldmVudCwgcXVlcnk6IHN0cmluZykgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKCFzZWFyY2hTZXJ2aWNlKSB7CiAgICAgICAgcmV0dXJuIGdlbmVyYXRlTW9ja1Blb3BsZSgpLmZpbHRlcihwID0+CiAgICAgICAgICBwLm5hbWUuaW5jbHVkZXMocXVlcnkpIHx8IHAuZGlzcGxheV9uYW1lPy5pbmNsdWRlcyhxdWVyeSkKICAgICAgICApCiAgICAgIH0KICAgICAgcmV0dXJuIGF3YWl0IHNlYXJjaFNlcnZpY2Uuc2VhcmNoUGVvcGxlKHF1ZXJ5KQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcign5pCc57Si5Lq654mp5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gW10KICAgIH0KICB9KQoKICAvLyDmoLnmja7kurrnianmkJzntKLnhafniYcKICBpcGNNYWluLmhhbmRsZSgncGVvcGxlOnNlYXJjaC1waG90b3MnLCBhc3luYyAoZXZlbnQsIHBlcnNvbk5hbWU6IHN0cmluZykgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKCFzZWFyY2hTZXJ2aWNlKSB7CiAgICAgICAgcmV0dXJuIHsgcmVzdWx0czogZ2VuZXJhdGVNb2NrUGhvdG9zKDEwLCAwKSwgdG90YWw6IDEwIH0KICAgICAgfQogICAgICByZXR1cm4gYXdhaXQgc2VhcmNoU2VydmljZS5zZWFyY2hCeVBlcnNvbihwZXJzb25OYW1lKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcign5qC55o2u5Lq654mp5pCc57Si54Wn54mH5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyByZXN1bHRzOiBbXSwgdG90YWw6IDAgfQogICAgfQogIH0pCgogIC8vIOabtOaWsOS6uueJqeS/oeaBrwogIGlwY01haW4uaGFuZGxlKCdwZW9wbGU6dXBkYXRlJywgYXN5bmMgKGV2ZW50LCBpZDogbnVtYmVyLCBwZXJzb246IHsgbmFtZT86IHN0cmluZzsgZGlzcGxheU5hbWU/OiBzdHJpbmcgfSkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBwZXJzb25TZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3BlcnNvblNlcnZpY2UuanMnKQogICAgICBjb25zdCBzdWNjZXNzID0gcGVyc29uU2VydmljZS51cGRhdGVQZXJzb24oaWQsIHBlcnNvbikKICAgICAgcmV0dXJuIHsgc3VjY2VzcyB9CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDmm7TmlrDkurrnianlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9CiAgICB9CiAgfSkKCiAgLy8g5Yig6Zmk5Lq654mpCiAgaXBjTWFpbi5oYW5kbGUoJ3Blb3BsZTpkZWxldGUnLCBhc3luYyAoZXZlbnQsIGlkOiBudW1iZXIpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcGVyc29uU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9wZXJzb25TZXJ2aWNlLmpzJykKICAgICAgY29uc3Qgc3VjY2VzcyA9IHBlcnNvblNlcnZpY2UuZGVsZXRlUGVyc29uKGlkKQogICAgICByZXR1cm4geyBzdWNjZXNzIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOWIoOmZpOS6uueJqeWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyDmoIforrDkurrniakKICBpcGNNYWluLmhhbmRsZSgncGVvcGxlOnRhZycsIGFzeW5jIChldmVudCwgcGFyYW1zOiB7IHBob3RvSWQ6IG51bWJlcjsgcGVyc29uSWQ6IG51bWJlcjsgYm91bmRpbmdCb3g/OiBhbnkgfSkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBwZXJzb25TZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3BlcnNvblNlcnZpY2UuanMnKQogICAgICBjb25zdCByZXN1bHQgPSBwZXJzb25TZXJ2aWNlLnRhZ1BlcnNvbihwYXJhbXMpCiAgICAgIHJldHVybiByZXN1bHQKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOagh+iusOS6uueJqeWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyDnp7vpmaTmoIfnrb4KICBpcGNNYWluLmhhbmRsZSgncGVvcGxlOnVudGFnJywgYXN5bmMgKGV2ZW50LCBwaG90b0lkOiBudW1iZXIsIHBlcnNvbklkOiBudW1iZXIpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcGVyc29uU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9wZXJzb25TZXJ2aWNlLmpzJykKICAgICAgY29uc3Qgc3VjY2VzcyA9IHBlcnNvblNlcnZpY2UudW50YWdQZXJzb24ocGhvdG9JZCwgcGVyc29uSWQpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3MgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g56e76Zmk5qCH562+5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOiOt+WPlueFp+eJh+eahOS6uueJqeagh+etvgogIGlwY01haW4uaGFuZGxlKCdwZW9wbGU6Z2V0LXBob3RvLXRhZ3MnLCBhc3luYyAoZXZlbnQsIHBob3RvSWQ6IG51bWJlcikgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBwZXJzb25TZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3BlcnNvblNlcnZpY2UuanMnKQogICAgICByZXR1cm4gcGVyc29uU2VydmljZS5nZXRQaG90b1RhZ3MocGhvdG9JZCkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOiOt+WPlueFp+eJh+agh+etvuWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIFtdCiAgICB9CiAgfSkKCiAgLy8g6I635Y+W5p+Q5Lq654mp55qE5omA5pyJ54Wn54mHCiAgaXBjTWFpbi5oYW5kbGUoJ3Blb3BsZTpnZXQtcGVyc29uLXBob3RvcycsIGFzeW5jIChldmVudCwgcGVyc29uSWQ6IG51bWJlcikgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBwZXJzb25TZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3BlcnNvblNlcnZpY2UuanMnKQogICAgICByZXR1cm4gcGVyc29uU2VydmljZS5nZXRQZXJzb25QaG90b3MocGVyc29uSWQpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDojrflj5bkurrniannhafniYflpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiBbXQogICAgfQogIH0pCgogIC8vIOiOt+WPluS6uueJqee7n+iuoQogIGlwY01haW4uaGFuZGxlKCdwZW9wbGU6Z2V0LXN0YXRzJywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBwZXJzb25TZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3BlcnNvblNlcnZpY2UuanMnKQogICAgICByZXR1cm4gcGVyc29uU2VydmljZS5nZXRTdGF0cygpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDojrflj5bnu5/orqHlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHRvdGFsUGVyc29uczogMCwgdG90YWxUYWdzOiAwIH0KICAgIH0KICB9KQoKICAvLyA9PT09PT09PT09PT09PT09PT09PSDlnLDngrnnm7jlhbMgPT09PT09PT09PT09PT09PT09PT0KCiAgLy8g6I635Y+W5omA5pyJ5Zyw54K5CiAgaXBjTWFpbi5oYW5kbGUoJ3BsYWNlczpnZXQtYWxsJywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKCFkYXRhYmFzZSkgewogICAgICAgIHJldHVybiBnZW5lcmF0ZU1vY2tQbGFjZXMoKQogICAgICB9CiAgICAgIHJldHVybiBkYXRhYmFzZS5nZXRBbGxQbGFjZXMoKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcign6I635Y+W5Zyw54K55YiX6KGo5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gW10KICAgIH0KICB9KQoKICAvLyA9PT09PT09PT09PT09PT09PT09PSDml7bpl7Tnur/nm7jlhbMgPT09PT09PT09PT09PT09PT09PT0KCiAgLy8g6I635Y+W5p+Q5bm054Wn54mHCiAgaXBjTWFpbi5oYW5kbGUoJ3RpbWVsaW5lOmdldCcsIGFzeW5jIChldmVudCwgeWVhcikgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKCFkYXRhYmFzZSkgewogICAgICAgIHJldHVybiBnZW5lcmF0ZU1vY2tQaG90b3MoMjAsIHllYXIgPyB5ZWFyICogMTAgOiAwKQogICAgICB9CiAgICAgIHJldHVybiBkYXRhYmFzZS5nZXRQaG90b3NCeVllYXIoeWVhciB8fCBuZXcgRGF0ZSgpLmdldEZ1bGxZZWFyKCkpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCfojrflj5bml7bpl7Tnur/lpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiBbXQogICAgfQogIH0pCgogIC8vID09PT09PT09PT09PT09PT09PT09IOWQjOatpeebuOWFsyA9PT09PT09PT09PT09PT09PT09PQoKICAvLyDlvIDlp4vlkIzmraUKICBpcGNNYWluLmhhbmRsZSgnc3luYzpzdGFydCcsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGlmICghaUNsb3VkU2VydmljZSkgewogICAgICAgIC8vIOaooeaLn+WQjOatpQogICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAyMDAwKSkKICAgICAgICByZXR1cm4gMTAwICAvLyDov5Tlm57mqKHmi5/lkIzmraXmlbDph48KICAgICAgfQogICAgICByZXR1cm4gYXdhaXQgaUNsb3VkU2VydmljZS5zeW5jQWxsKCkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ+WQjOatpeWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIDAKICAgIH0KICB9KQoKICAvLyDojrflj5blkIzmraXov5vluqYKICBpcGNNYWluLmhhbmRsZSgnc3luYzpnZXQtcHJvZ3Jlc3MnLCBhc3luYyAoKSA9PiB7CiAgICAvLyDov5Tlm57mqKHmi5/ov5vluqYKICAgIHJldHVybiB7IGN1cnJlbnQ6IDAsIHRvdGFsOiAwLCBzdGF0dXM6ICdpZGxlJyB9CiAgfSkKCiAgLy8gPT09PT09PT09PT09PT09PT09PT0g5pys5Zyw54Wn54mH5a+85YWl55u45YWzID09PT09PT09PT09PT09PT09PT09CgogIC8vIOmAieaLqeWvvOWFpeaWh+S7tuWkueaIluaWh+S7tgogIGlwY01haW4uaGFuZGxlKCdsb2NhbDpzZWxlY3QtZm9sZGVyJywgYXN5bmMgKCkgPT4gewogICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGlhbG9nLnNob3dPcGVuRGlhbG9nKHsKICAgICAgcHJvcGVydGllczogWydvcGVuRmlsZScsICdvcGVuRGlyZWN0b3J5JywgJ211bHRpU2VsZWN0aW9ucyddLAogICAgICB0aXRsZTogJ+mAieaLqeimgeWvvOWFpeeahOeFp+eJh+aIluaWh+S7tuWkuScsCiAgICAgIGJ1dHRvbkxhYmVsOiAn6YCJ5oupJywKICAgICAgZmlsdGVyczogWwogICAgICAgIHsgbmFtZTogJ+WbvueJh+aWh+S7ticsIGV4dGVuc2lvbnM6IFsnanBnJywgJ2pwZWcnLCAncG5nJywgJ2dpZicsICd3ZWJwJywgJ2hlaWMnLCAndGlmZiddIH0sCiAgICAgICAgeyBuYW1lOiAn5omA5pyJ5paH5Lu2JywgZXh0ZW5zaW9uczogWycqJ10gfQogICAgICBdCiAgICB9KQoKICAgIGlmICghcmVzdWx0LmNhbmNlbGVkICYmIHJlc3VsdC5maWxlUGF0aHMubGVuZ3RoID4gMCkgewogICAgICByZXR1cm4gcmVzdWx0LmZpbGVQYXRocwogICAgfQogICAgcmV0dXJuIFtdCiAgfSkKCiAgLy8g5byA5aeL5a+85YWl54Wn54mH77yI5pSv5oyB5paH5Lu25aS55oiW5Y2V5Liq5paH5Lu277yJCiAgaXBjTWFpbi5oYW5kbGUoJ2xvY2FsOmltcG9ydC1mb2xkZXInLCBhc3luYyAoZXZlbnQsIGZvbGRlclBhdGg6IHN0cmluZykgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKCFsb2NhbFBob3RvU2VydmljZSkgewogICAgICAgIHRocm93IG5ldyBFcnJvcign5pys5Zyw54Wn54mH5pyN5Yqh5pyq5Yid5aeL5YyWJykKICAgICAgfQoKICAgICAgY29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzJykKICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKGZvbGRlclBhdGgpCgogICAgICAvLyDorr7nva7ov5vluqblm57osIMKICAgICAgbG9jYWxQaG90b1NlcnZpY2Uub25Qcm9ncmVzcygocHJvZ3Jlc3MpID0+IHsKICAgICAgICBldmVudC5zZW5kZXIuc2VuZCgnbG9jYWw6aW1wb3J0LXByb2dyZXNzJywgcHJvZ3Jlc3MpCiAgICAgIH0pCgogICAgICBsZXQgcmVzdWx0CiAgICAgIGlmIChzdGF0LmlzRmlsZSgpKSB7CiAgICAgICAgLy8g5a+85YWl5Y2V5Liq5paH5Lu2CiAgICAgICAgY29uc29sZS5sb2coYFtJUENdIOWvvOWFpeWNleW8oOeFp+eJhzogJHtmb2xkZXJQYXRofWApCiAgICAgICAgY29uc3QgcGhvdG8gPSBhd2FpdCBsb2NhbFBob3RvU2VydmljZS5pbXBvcnRQaG90byhmb2xkZXJQYXRoKQogICAgICAgIHJlc3VsdCA9IHsKICAgICAgICAgIGltcG9ydGVkOiBwaG90byA/IDEgOiAwLAogICAgICAgICAgc2tpcHBlZDogMCwKICAgICAgICAgIGVycm9yczogcGhvdG8gPyAwIDogMSwKICAgICAgICAgIHBob3RvczogcGhvdG8gPyBbcGhvdG9dIDogW10KICAgICAgICB9CiAgICAgIH0gZWxzZSB7CiAgICAgICAgLy8g5a+85YWl5paH5Lu25aS5CiAgICAgICAgcmVzdWx0ID0gYXdhaXQgbG9jYWxQaG90b1NlcnZpY2UuaW1wb3J0Rm9sZGVyKGZvbGRlclBhdGgpCiAgICAgIH0KCiAgICAgIHJldHVybiB7CiAgICAgICAgc3VjY2VzczogdHJ1ZSwKICAgICAgICBpbXBvcnRlZDogcmVzdWx0LmltcG9ydGVkLAogICAgICAgIGVycm9yczogcmVzdWx0LmVycm9ycwogICAgICB9CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCflr7zlhaXnhafniYflpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7CiAgICAgICAgc3VjY2VzczogZmFsc2UsCiAgICAgICAgZXJyb3I6IChlcnJvciBhcyBFcnJvcikubWVzc2FnZSwKICAgICAgICBpbXBvcnRlZDogMCwKICAgICAgICBlcnJvcnM6IDEKICAgICAgfQogICAgfQogIH0pCgogIC8vIOWvvOWFpeWNleW8oOeFp+eJhwogIGlwY01haW4uaGFuZGxlKCdsb2NhbDppbXBvcnQtcGhvdG8nLCBhc3luYyAoZXZlbnQsIGZpbGVQYXRoOiBzdHJpbmcpID0+IHsKICAgIHRyeSB7CiAgICAgIGlmICghbG9jYWxQaG90b1NlcnZpY2UpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ+acrOWcsOeFp+eJh+acjeWKoeacquWIneWni+WMlicpCiAgICAgIH0KCiAgICAgIGNvbnN0IHBob3RvID0gYXdhaXQgbG9jYWxQaG90b1NlcnZpY2UuaW1wb3J0UGhvdG8oZmlsZVBhdGgpCiAgICAgIHJldHVybiBwaG90bwogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcign5a+85YWl5Y2V5byg54Wn54mH5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gbnVsbAogICAgfQogIH0pCgogIC8vIOiOt+WPluacrOWcsOeFp+eJh+aVsOmHjwogIGlwY01haW4uaGFuZGxlKCdsb2NhbDpnZXQtY291bnQnLCBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBpZiAoIWxvY2FsUGhvdG9TZXJ2aWNlKSB7CiAgICAgICAgcmV0dXJuIDAKICAgICAgfQogICAgICByZXR1cm4gbG9jYWxQaG90b1NlcnZpY2UuZ2V0UGhvdG9Db3VudCgpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICByZXR1cm4gMAogICAgfQogIH0pCgogIC8vID09PT09PT09PT09PT09PT09PT09IOWvvOWFpeebuOWFsyAo5pawKSA9PT09PT09PT09PT09PT09PT09PQoKICAvLyDmiavmj4/mlofku7blpLkKICBpcGNNYWluLmhhbmRsZSgnaW1wb3J0OnNjYW4tZm9sZGVyJywgYXN5bmMgKF8sIGZvbGRlclBhdGg6IHN0cmluZykgPT4gewogICAgdHJ5IHsKICAgICAgY29uc29sZS5sb2coYFtJUENdIOaJq+aPj+aWh+S7tuWkuTogJHtmb2xkZXJQYXRofWApCiAgICAgIGNvbnN0IGZpbGVzID0gYXdhaXQgZm9sZGVyU2Nhbm5lci5zY2FuRm9sZGVyKGZvbGRlclBhdGgpCiAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDmib7liLAgJHtmaWxlcy5sZW5ndGh9IOS4quaWh+S7tmApCiAgICAgIHJldHVybiBmaWxlcwogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5omr5o+P5paH5Lu25aS55aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gW10KICAgIH0KICB9KQoKICAvLyDlvIDlp4vlr7zlhaUKICBpcGNNYWluLmhhbmRsZSgnaW1wb3J0OnN0YXJ0JywgYXN5bmMgKGV2ZW50LCBmb2xkZXJQYXRoOiBzdHJpbmcsIG9wdGlvbnM6IEltcG9ydE9wdGlvbnMpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDlvIDlp4vlr7zlhaU6ICR7Zm9sZGVyUGF0aH1gKQoKICAgICAgLy8g6aqM6K+BIGltcG9ydFNlcnZpY2Ug5bey5Yid5aeL5YyWCiAgICAgIGlmICghaW1wb3J0U2VydmljZSkgewogICAgICAgIHRocm93IG5ldyBFcnJvcign5a+85YWl5pyN5Yqh5pyq5Yid5aeL5YyWJykKICAgICAgfQoKICAgICAgLy8g5L2/55So5paw55qE6L+b5bqm5pyN5Yqh6K6i6ZiF6L+b5bqm5pu05pawCiAgICAgIGNvbnN0IHVuc3Vic2NyaWJlID0gaW1wb3J0UHJvZ3Jlc3NTZXJ2aWNlLnN1YnNjcmliZSgocHJvZ3Jlc3M6IEltcG9ydFByb2dyZXNzKSA9PiB7CiAgICAgICAgZXZlbnQuc2VuZGVyLnNlbmQoJ2ltcG9ydDpwcm9ncmVzcycsIHByb2dyZXNzKQogICAgICB9KQoKICAgICAgLy8g6K6+572u6L+b5bqm5Zue6LCDCiAgICAgIGltcG9ydFNlcnZpY2Uub25Qcm9ncmVzcygocHJvZ3Jlc3MpID0+IHsKICAgICAgICBldmVudC5zZW5kZXIuc2VuZCgnaW1wb3J0OnByb2dyZXNzJywgcHJvZ3Jlc3MpCiAgICAgIH0pCgogICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBpbXBvcnRTZXJ2aWNlLmltcG9ydEZyb21Gb2xkZXIoZm9sZGVyUGF0aCwgb3B0aW9ucykKCiAgICAgIC8vIOWujOaIkOWQjuWPlua2iOiuoumYhQogICAgICB1bnN1YnNjcmliZSgpCgogICAgICBjb25zb2xlLmxvZyhgW0lQQ10g5a+85YWl5a6M5oiQOiDmiJDlip8gJHtyZXN1bHQuaW1wb3J0ZWR9LCDot7Pov4cgJHtyZXN1bHQuc2tpcHBlZH0sIOWksei0pSAke3Jlc3VsdC5mYWlsZWR9YCkKCiAgICAgIHJldHVybiByZXN1bHQKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOWvvOWFpeWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsKICAgICAgICBzdWNjZXNzOiBmYWxzZSwKICAgICAgICBpbXBvcnRlZDogMCwKICAgICAgICBza2lwcGVkOiAwLAogICAgICAgIGZhaWxlZDogMCwKICAgICAgICBlcnJvcnM6IFt7IGZpbGU6IGZvbGRlclBhdGgsIGVycm9yOiAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UgfV0sCiAgICAgICAgZHVyYXRpb246IDAKICAgICAgfSBhcyBJbXBvcnRSZXN1bHQKICAgIH0KICB9KQoKICAvLyDlj5bmtojlr7zlhaUKICBpcGNNYWluLmhhbmRsZSgnaW1wb3J0OmNhbmNlbCcsIGFzeW5jICgpID0+IHsKICAgIGNvbnNvbGUubG9nKCdbSVBDXSDmlLbliLDlj5bmtojlr7zlhaXkv6Hlj7cnKQogICAgaW1wb3J0U2VydmljZT8uY2FuY2VsKCkKICAgIGltcG9ydFByb2dyZXNzU2VydmljZS5jYW5jZWwoKQogICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9CiAgfSkKCiAgLy8g6I635Y+W5a+85YWl54q25oCBCiAgaXBjTWFpbi5oYW5kbGUoJ2ltcG9ydDpnZXQtcHJvZ3Jlc3MnLCBhc3luYyAoKSA9PiB7CiAgICBjb25zdCBwcm9ncmVzcyA9IGltcG9ydFByb2dyZXNzU2VydmljZS5nZXRQcm9ncmVzcygpCiAgICByZXR1cm4gewogICAgICBpc0ltcG9ydGluZzogaW1wb3J0U2VydmljZT8uZ2V0SXNJbXBvcnRpbmcoKSB8fCBmYWxzZSwKICAgICAgcHJvZ3Jlc3M6IHByb2dyZXNzIHx8IG51bGwKICAgIH0KICB9KQoKICAvLyA9PT09PT09PT09PT09PT09PT09PSDltYzlhaXmnI3liqHnm7jlhbPvvIjmt7flkIjmnrbmnoTvvJrmuLLmn5Pov5vnqIvmiafooYzvvIk9PT09PT09PT09PT09PT09PT09CgogIC8vIOWIneWni+WMliBDTElQIOaooeWei++8iOmAmui/h+a4suafk+i/m+eoi++8iQogIGlwY01haW4uaGFuZGxlKCdlbWJlZGRpbmc6aW5pdGlhbGl6ZScsIGFzeW5jICgpID0+IHsKICAgIGNvbnNvbGUubG9nKCdbSVBDXSDmlLbliLAgZW1iZWRkaW5nOmluaXRpYWxpemUg6K+35rGCJykKCiAgICAvLyDlj5HpgIHliLDmuLLmn5Pov5vnqIvlpITnkIYKICAgIGNvbnN0IHsgQnJvd3NlcldpbmRvdyB9ID0gcmVxdWlyZSgnZWxlY3Ryb24nKQogICAgY29uc3Qgd2luZG93cyA9IEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpCgogICAgaWYgKHdpbmRvd3MubGVuZ3RoID4gMCkgewogICAgICAvLyDlj5HpgIHmtojmga/liLDmuLLmn5Pov5vnqIsKICAgICAgd2luZG93c1swXS53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdChgCiAgICAgICAgaWYgKHdpbmRvdy5lbWJlZGRpbmdBUEkgJiYgd2luZG93LmVtYmVkZGluZ0FQSS5pbml0aWFsaXplKSB7CiAgICAgICAgICB3aW5kb3cuZW1iZWRkaW5nQVBJLmluaXRpYWxpemUoKQogICAgICAgIH0gZWxzZSB7CiAgICAgICAgICBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ0VtYmVkZGluZyBBUEkgbm90IGF2YWlsYWJsZScpKQogICAgICAgIH0KICAgICAgYCkudGhlbigocmVzdWx0OiBhbnkpID0+IHsKICAgICAgICBjb25zb2xlLmxvZygnW0lQQ10g5riy5p+T6L+b56iL5qih5Z6L5Yid5aeL5YyW57uT5p6cOicsIHJlc3VsdCkKICAgICAgfSkuY2F0Y2goKGVycm9yOiBFcnJvcikgPT4gewogICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOa4suafk+i/m+eoi+aooeWei+WIneWni+WMluWksei0pTonLCBlcnJvcikKICAgICAgfSkKICAgIH0KCiAgICAvLyDnlLHkuo7mmK/lvILmraXmk43kvZzvvIznm7TmjqXov5Tlm57ov5vooYzkuK3nirbmgIEKICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICfliJ3lp4vljJbor7fmsYLlt7Llj5HpgIHliLDmuLLmn5Pov5vnqIsnIH0KICB9KQoKICAvLyDojrflj5bmqKHlnovnirbmgIHvvIjpgJrov4fmuLLmn5Pov5vnqIvvvIkKICBpcGNNYWluLmhhbmRsZSgnZW1iZWRkaW5nOmdldC1zdGF0dXMnLCBhc3luYyAoKSA9PiB7CiAgICBjb25zdCB7IEJyb3dzZXJXaW5kb3cgfSA9IHJlcXVpcmUoJ2VsZWN0cm9uJykKICAgIGNvbnN0IHdpbmRvd3MgPSBCcm93c2VyV2luZG93LmdldEFsbFdpbmRvd3MoKQoKICAgIGlmICh3aW5kb3dzLmxlbmd0aCA+IDApIHsKICAgICAgdHJ5IHsKICAgICAgICBjb25zdCBzdGF0dXMgPSBhd2FpdCB3aW5kb3dzWzBdLndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0KGAKICAgICAgICAgIGlmICh3aW5kb3cuZW1iZWRkaW5nQVBJICYmIHdpbmRvdy5lbWJlZGRpbmdBUEkuZ2V0U3RhdHVzKSB7CiAgICAgICAgICAgIHdpbmRvdy5lbWJlZGRpbmdBUEkuZ2V0U3RhdHVzKCkKICAgICAgICAgIH0gZWxzZSB7CiAgICAgICAgICAgIG51bGwKICAgICAgICAgIH0KICAgICAgICBgKQogICAgICAgIGlmIChzdGF0dXMpIHsKICAgICAgICAgIHJldHVybiBzdGF0dXMKICAgICAgICB9CiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6I635Y+W5qih5Z6L54q25oCB5aSx6LSlOicsIGVycm9yKQogICAgICB9CiAgICB9CgogICAgcmV0dXJuIHsgbG9hZGVkOiBmYWxzZSwgbW9kZWxOYW1lOiAnWGVub3ZhL2NsaXAtdml0LWJhc2UtcGF0Y2gzMicsIHJlbmRlcmVyQXZhaWxhYmxlOiBmYWxzZSB9CiAgfSkKCiAgLy8g5paH5pys6L2s5ZCR6YeP77yI6YCa6L+H5riy5p+T6L+b56iL77yJCiAgaXBjTWFpbi5oYW5kbGUoJ2VtYmVkZGluZzp0ZXh0LXRvLXZlY3RvcicsIGFzeW5jIChfLCB0ZXh0OiBzdHJpbmcpID0+IHsKICAgIGNvbnN0IHsgQnJvd3NlcldpbmRvdyB9ID0gcmVxdWlyZSgnZWxlY3Ryb24nKQogICAgY29uc3Qgd2luZG93cyA9IEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpCgogICAgaWYgKHdpbmRvd3MubGVuZ3RoID4gMCkgewogICAgICB0cnkgewogICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHdpbmRvd3NbMF0ud2ViQ29udGVudHMuZXhlY3V0ZUphdmFTY3JpcHQoYAogICAgICAgICAgaWYgKHdpbmRvdy5lbWJlZGRpbmdBUEkgJiYgd2luZG93LmVtYmVkZGluZ0FQSS50ZXh0VG9FbWJlZGRpbmcpIHsKICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkod2luZG93LmVtYmVkZGluZ0FQSS50ZXh0VG9FbWJlZGRpbmcoXGAke3RleHQucmVwbGFjZSgvYC9nLCAnXFxgJyl9XGApKQogICAgICAgICAgfSBlbHNlIHsKICAgICAgICAgICAgJ3sic3VjY2VzcyI6ZmFsc2UsImVycm9yIjoiRW1iZWRkaW5nIEFQSSBub3QgYXZhaWxhYmxlIn0nCiAgICAgICAgICB9CiAgICAgICAgYCkKICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQpCiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5paH5pys6L2s5ZCR6YeP5aSx6LSlOicsIGVycm9yKQogICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSwgcHJvY2Vzc2luZ1RpbWVNczogMCB9CiAgICAgIH0KICAgIH0KCiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyByZW5kZXJlciB3aW5kb3cgYXZhaWxhYmxlJywgcHJvY2Vzc2luZ1RpbWVNczogMCB9CiAgfSkKCiAgLy8g5Zu+54mH6L2s5ZCR6YeP77yI6YCa6L+H5riy5p+T6L+b56iL77yJCiAgaXBjTWFpbi5oYW5kbGUoJ2VtYmVkZGluZzppbWFnZS10by12ZWN0b3InLCBhc3luYyAoXywgaW1hZ2VQYXRoOiBzdHJpbmcpID0+IHsKICAgIGNvbnN0IHsgQnJvd3NlcldpbmRvdyB9ID0gcmVxdWlyZSgnZWxlY3Ryb24nKQogICAgY29uc3Qgd2luZG93cyA9IEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpCgogICAgaWYgKHdpbmRvd3MubGVuZ3RoID4gMCkgewogICAgICB0cnkgewogICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHdpbmRvd3NbMF0ud2ViQ29udGVudHMuZXhlY3V0ZUphdmFTY3JpcHQoYAogICAgICAgICAgaWYgKHdpbmRvdy5lbWJlZGRpbmdBUEkgJiYgd2luZG93LmVtYmVkZGluZ0FQSS5pbWFnZVRvRW1iZWRkaW5nKSB7CiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHdpbmRvdy5lbWJlZGRpbmdBUEkuaW1hZ2VUb0VtYmVkZGluZyhcYCR7aW1hZ2VQYXRoLnJlcGxhY2UoL2AvZywgJ1xcYCcpfVxgKSkKICAgICAgICAgIH0gZWxzZSB7CiAgICAgICAgICAgICd7InN1Y2Nlc3MiOmZhbHNlLCJlcnJvciI6IkVtYmVkZGluZyBBUEkgbm90IGF2YWlsYWJsZSJ9JwogICAgICAgICAgfQogICAgICAgIGApCiAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZXN1bHQpCgogICAgICAgIC8vIOWmguaenOaIkOWKn++8jOiHquWKqOS/neWtmOWIsOaVsOaNruW6kwogICAgICAgIGlmIChwYXJzZWQuc3VjY2VzcyAmJiBwYXJzZWQudmVjdG9yICYmIGRhdGFiYXNlKSB7CiAgICAgICAgICBjb25zdCBwaG90b1V1aWQgPSBleHRyYWN0UGhvdG9VdWlkRnJvbVBhdGgoaW1hZ2VQYXRoKQogICAgICAgICAgaWYgKHBob3RvVXVpZCkgewogICAgICAgICAgICB0cnkgewogICAgICAgICAgICAgIGF3YWl0IGRhdGFiYXNlLnNhdmVFbWJlZGRpbmcocGhvdG9VdWlkLCBwYXJzZWQudmVjdG9yLCAnaW1hZ2UnKQogICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDlkJHph4/lt7Lkv53lrZg6ICR7cGhvdG9VdWlkfWApCiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5L+d5a2Y5ZCR6YeP5aSx6LSlOicsIGVycm9yKQogICAgICAgICAgICB9CiAgICAgICAgICB9CiAgICAgICAgfQoKICAgICAgICByZXR1cm4gcGFyc2VkCiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5Zu+54mH6L2s5ZCR6YeP5aSx6LSlOicsIGVycm9yKQogICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSwgcHJvY2Vzc2luZ1RpbWVNczogMCB9CiAgICAgIH0KICAgIH0KCiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyByZW5kZXJlciB3aW5kb3cgYXZhaWxhYmxlJywgcHJvY2Vzc2luZ1RpbWVNczogMCB9CiAgfSkKCiAgLy8g55Sf5oiQ5omA5pyJ54Wn54mH55qE5bWM5YWl5ZCR6YePCiAgaXBjTWFpbi5oYW5kbGUoJ2VtYmVkZGluZzpnZW5lcmF0ZS1hbGwnLCBhc3luYyAoZXZlbnQpID0+IHsKICAgIGNvbnNvbGUubG9nKCdbSVBDXSDlvIDlp4vmibnph4/nlJ/miJDltYzlhaXlkJHph48nKQoKICAgIGlmICghZGF0YWJhc2UpIHsKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnRGF0YWJhc2Ugbm90IGluaXRpYWxpemVkJywgc3VjY2Vzc0NvdW50OiAwLCBmYWlsZWRDb3VudDogMCwgdG90YWw6IDAsIGVycm9yczogW10sIGNhbmNlbGxlZDogZmFsc2UgfQogICAgfQoKICAgIGNvbnN0IHZlY3RvclNlcnZpY2UgPSBuZXcgVmVjdG9yR2VuZXJhdGlvblNlcnZpY2UoZGF0YWJhc2UpCgogICAgdHJ5IHsKICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdmVjdG9yU2VydmljZS5nZW5lcmF0ZUFsbCh7CiAgICAgICAgb25Qcm9ncmVzczogKHByb2dyZXNzKSA9PiB7CiAgICAgICAgICBldmVudC5zZW5kZXIuc2VuZCgnZW1iZWRkaW5nOnByb2dyZXNzJywgcHJvZ3Jlc3MpCiAgICAgICAgfQogICAgICB9KQoKICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgc3VjY2Vzc0NvdW50OiByZXN1bHQuc3VjY2VzcywgZmFpbGVkQ291bnQ6IHJlc3VsdC5mYWlsZWQsIHRvdGFsOiByZXN1bHQudG90YWwsIGVycm9yczogcmVzdWx0LmVycm9ycywgY2FuY2VsbGVkOiByZXN1bHQuY2FuY2VsbGVkIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpLCBzdWNjZXNzQ291bnQ6IDAsIGZhaWxlZENvdW50OiAwLCB0b3RhbDogMCwgZXJyb3JzOiBbXSwgY2FuY2VsbGVkOiBmYWxzZSB9CiAgICB9CiAgfSkKCiAgLy8g55Sf5oiQ5Y2V5byg54Wn54mH55qE5ZCR6YePCiAgaXBjTWFpbi5oYW5kbGUoJ2VtYmVkZGluZzpnZW5lcmF0ZS1vbmUnLCBhc3luYyAoXywgcGhvdG9VdWlkKSA9PiB7CiAgICBpZiAoIWRhdGFiYXNlKSB7CiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0RhdGFiYXNlIG5vdCBpbml0aWFsaXplZCcgfQogICAgfQogICAgY29uc3QgdmVjdG9yU2VydmljZSA9IG5ldyBWZWN0b3JHZW5lcmF0aW9uU2VydmljZShkYXRhYmFzZSkKICAgIHRyeSB7CiAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB2ZWN0b3JTZXJ2aWNlLmdlbmVyYXRlT25lKHBob3RvVXVpZCkKICAgICAgcmV0dXJuIHsgc3VjY2VzcyB9CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSB9CiAgICB9CiAgfSkKCiAgLy8g5Y+W5raI5ZCR6YeP55Sf5oiQCiAgaXBjTWFpbi5oYW5kbGUoJ2VtYmVkZGluZzpjYW5jZWwnLCBhc3luYyAoKSA9PiB7CiAgICBjb25zdCB2ZWN0b3JTZXJ2aWNlID0gbmV3IFZlY3RvckdlbmVyYXRpb25TZXJ2aWNlKCkKICAgIHZlY3RvclNlcnZpY2UuY2FuY2VsKCkKICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfQogIH0pCgogIC8vIOiOt+WPluWQkemHj+eUn+aIkOeKtuaAgQogIGlwY01haW4uaGFuZGxlKCdlbWJlZGRpbmc6Z2V0LWdlbmVyYXRpb24tc3RhdHVzJywgYXN5bmMgKCkgPT4gewogICAgY29uc3QgdmVjdG9yU2VydmljZSA9IG5ldyBWZWN0b3JHZW5lcmF0aW9uU2VydmljZSgpCiAgICByZXR1cm4gdmVjdG9yU2VydmljZS5nZXRTdGF0dXMoKQogIH0pCgogIC8vID09PT09PT09PT09PT09PT09PT09IOaWh+acrOaQnOe0ouebuOWFsyA9PT09PT09PT09PT09PT09PT09PQoKICAvLyDpooTlpITnkIbmkJzntKLmlofmnKwKICBpcGNNYWluLmhhbmRsZSgnc2VhcmNoOnByZXByb2Nlc3MnLCBhc3luYyAoXywgdGV4dDogc3RyaW5nKSA9PiB7CiAgICBjb25zdCB7IHRleHRQcmVwcm9jZXNzb3IgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvdGV4dFByZXByb2Nlc3Nvci5qcycpCiAgICByZXR1cm4gdGV4dFByZXByb2Nlc3Nvci5wcmVwcm9jZXNzKHRleHQpCiAgfSkKCiAgLy8g5paH5pys6L2s5ZCR6YePCiAgaXBjTWFpbi5oYW5kbGUoJ3NlYXJjaDp0ZXh0LXRvLXZlY3RvcicsIGFzeW5jIChfLCB0ZXh0OiBzdHJpbmcpID0+IHsKICAgIGNvbnN0IHsgdGV4dFZlY3RvclNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvdGV4dFZlY3RvclNlcnZpY2UuanMnKQogICAgcmV0dXJuIGF3YWl0IHRleHRWZWN0b3JTZXJ2aWNlLnRleHRUb1ZlY3Rvcih0ZXh0KQogIH0pCgogIC8vIOivreS5ieaQnOe0oiAo5pen5a6e546wKQogIGlwY01haW4uaGFuZGxlKCdzZWFyY2g6c2VtYW50aWMtbGVnYWN5JywgYXN5bmMgKF8sIHF1ZXJ5OiBzdHJpbmcsIG9wdGlvbnM/OiB7IHRvcEs/OiBudW1iZXI7IG1pblNpbWlsYXJpdHk/OiBudW1iZXIgfSkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyB0ZXh0VmVjdG9yU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy90ZXh0VmVjdG9yU2VydmljZS5qcycpCiAgICAgIGNvbnN0IHsgc2ltaWxhcml0eVNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvc2ltaWxhcml0eVNlcnZpY2UuanMnKQoKICAgICAgLy8gMS4g6aKE5aSE55CGCiAgICAgIGNvbnN0IHsgdGV4dFByZXByb2Nlc3NvciB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy90ZXh0UHJlcHJvY2Vzc29yLmpzJykKICAgICAgY29uc3QgcHJvY2Vzc2VkID0gdGV4dFByZXByb2Nlc3Nvci5wcmVwcm9jZXNzKHF1ZXJ5KQoKICAgICAgLy8gMi4g6L2s5ZCR6YePCiAgICAgIGNvbnN0IHRleHRSZXN1bHQgPSBhd2FpdCB0ZXh0VmVjdG9yU2VydmljZS50ZXh0VG9WZWN0b3IocXVlcnkpCiAgICAgIGlmICghdGV4dFJlc3VsdC52ZWN0b3IpIHsKICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdGYWlsZWQgdG8gZ2VuZXJhdGUgdmVjdG9yJywgcmVzdWx0czogW10gfQogICAgICB9CgogICAgICAvLyAzLiDnm7jkvLzluqbmkJzntKIKICAgICAgY29uc3QgZ2V0RW1iZWRkaW5ncyA9IGFzeW5jICgpID0+IHsKICAgICAgICBpZiAoIWRhdGFiYXNlKSByZXR1cm4gW10KICAgICAgICByZXR1cm4gYXdhaXQgZGF0YWJhc2UuZ2V0QWxsRW1iZWRkaW5ncygnaW1hZ2UnKQogICAgICB9CgogICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgc2ltaWxhcml0eVNlcnZpY2Uuc2VtYW50aWNTZWFyY2goCiAgICAgICAgdGV4dFJlc3VsdC52ZWN0b3IsCiAgICAgICAgZ2V0RW1iZWRkaW5ncywKICAgICAgICBvcHRpb25zCiAgICAgICkKCiAgICAgIHJldHVybiB7CiAgICAgICAgc3VjY2VzczogdHJ1ZSwKICAgICAgICBwcm9jZXNzZWQ6IHsKICAgICAgICAgIG9yaWdpbmFsOiBwcm9jZXNzZWQub3JpZ2luYWwsCiAgICAgICAgICBwcm9jZXNzZWQ6IHByb2Nlc3NlZC5wcm9jZXNzZWQsCiAgICAgICAgICBrZXl3b3JkczogcHJvY2Vzc2VkLmtleXdvcmRzLAogICAgICAgICAgbGFuZ3VhZ2U6IHByb2Nlc3NlZC5sYW5ndWFnZQogICAgICAgIH0sCiAgICAgICAgcmVzdWx0cywKICAgICAgICBwcm9jZXNzaW5nVGltZU1zOiB0ZXh0UmVzdWx0LnByb2Nlc3NpbmdUaW1lTXMKICAgICAgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6K+t5LmJ5pCc57Si5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSwgcmVzdWx0czogW10gfQogICAgfQogIH0pCgogIC8vIOa4hemZpOaWh+acrOWQkemHj+e8k+WtmAogIGlwY01haW4uaGFuZGxlKCdzZWFyY2g6Y2xlYXItY2FjaGUnLCBhc3luYyAoKSA9PiB7CiAgICBjb25zdCB7IHRleHRWZWN0b3JTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3RleHRWZWN0b3JTZXJ2aWNlLmpzJykKICAgIHRleHRWZWN0b3JTZXJ2aWNlLmNsZWFyQ2FjaGUoKQogICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9CiAgfSkKCiAgLy8g6I635Y+W57yT5a2Y54q25oCBCiAgaXBjTWFpbi5oYW5kbGUoJ3NlYXJjaDpnZXQtY2FjaGUtc3RhdHMnLCBhc3luYyAoKSA9PiB7CiAgICBjb25zdCB7IHRleHRWZWN0b3JTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3RleHRWZWN0b3JTZXJ2aWNlLmpzJykKICAgIHJldHVybiB0ZXh0VmVjdG9yU2VydmljZS5nZXRDYWNoZVN0YXRzKCkKICB9KQoKICAvLyA9PT09PT09PT09PT09PT09PT09PSDor63kuYnmkJzntKLnm7jlhbMgPT09PT09PT09PT09PT09PT09PT0KCiAgLy8g5omn6KGM6K+t5LmJ5pCc57SiCiAgaXBjTWFpbi5oYW5kbGUoJ3NlYXJjaDpzZW1hbnRpYycsIGFzeW5jIChfLCBvcHRpb25zOiB7IHF1ZXJ5OiBzdHJpbmc7IHRvcEs/OiBudW1iZXI7IG1pblNpbWlsYXJpdHk/OiBudW1iZXI7IHBhZ2U/OiBudW1iZXI7IHBhZ2VTaXplPzogbnVtYmVyIH0pID0+IHsKICAgIHRyeSB7CiAgICAgIGlmICghZGF0YWJhc2UpIHsKICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdEYXRhYmFzZSBub3QgaW5pdGlhbGl6ZWQnLCByZXN1bHRzOiBbXSB9CiAgICAgIH0KCiAgICAgIGNvbnN0IHNlYXJjaFNlcnZpY2UgPSBuZXcgU2VtYW50aWNTZWFyY2hTZXJ2aWNlKGRhdGFiYXNlKQogICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBzZWFyY2hTZXJ2aWNlLnNlYXJjaChvcHRpb25zKQoKICAgICAgLy8g5qC85byP5YyW57uT5p6cCiAgICAgIGNvbnN0IHsgc2VhcmNoUmVzdWx0Rm9ybWF0dGVyIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3NlYXJjaFJlc3VsdEZvcm1hdHRlci5qcycpCiAgICAgIGNvbnN0IGZvcm1hdHRlZFJlc3VsdHMgPSBzZWFyY2hSZXN1bHRGb3JtYXR0ZXIuZm9ybWF0QmF0Y2gocmVzdWx0LnJlc3VsdHMpCiAgICAgIGNvbnN0IHN1bW1hcnkgPSBzZWFyY2hSZXN1bHRGb3JtYXR0ZXIuZm9ybWF0U3VtbWFyeShyZXN1bHQpCgogICAgICByZXR1cm4gewogICAgICAgIHN1Y2Nlc3M6IHRydWUsCiAgICAgICAgLi4uc3VtbWFyeSwKICAgICAgICByZXN1bHRzOiBmb3JtYXR0ZWRSZXN1bHRzCiAgICAgIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOivreS5ieaQnOe0ouWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksIHJlc3VsdHM6IFtdIH0KICAgIH0KICB9KQoKICAvLyDlv6vpgJ/mkJzntKLvvIjkuI3ov5Tlm57or6bmg4XvvIkKICBpcGNNYWluLmhhbmRsZSgnc2VhcmNoOnF1aWNrJywgYXN5bmMgKF8sIHF1ZXJ5OiBzdHJpbmcsIHRvcEs6IG51bWJlciA9IDEwKSA9PiB7CiAgICB0cnkgewogICAgICBpZiAoIWRhdGFiYXNlKSByZXR1cm4gW10KICAgICAgY29uc3Qgc2VhcmNoU2VydmljZSA9IG5ldyBTZW1hbnRpY1NlYXJjaFNlcnZpY2UoZGF0YWJhc2UpCiAgICAgIHJldHVybiBhd2FpdCBzZWFyY2hTZXJ2aWNlLnF1aWNrU2VhcmNoKHF1ZXJ5LCB0b3BLKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5b+r6YCf5pCc57Si5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gW10KICAgIH0KICB9KQoKICAvLyDlpJrmn6Xor6Lono3lkIjmkJzntKIKICBpcGNNYWluLmhhbmRsZSgnc2VhcmNoOm11bHRpJywgYXN5bmMgKF8sIHF1ZXJpZXM6IHN0cmluZ1tdLCBvcHRpb25zPzogeyB0b3BLPzogbnVtYmVyOyBtaW5TaW1pbGFyaXR5PzogbnVtYmVyIH0pID0+IHsKICAgIHRyeSB7CiAgICAgIGlmICghZGF0YWJhc2UpIHsKICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdEYXRhYmFzZSBub3QgaW5pdGlhbGl6ZWQnLCByZXN1bHRzOiBbXSB9CiAgICAgIH0KCiAgICAgIGNvbnN0IHNlYXJjaFNlcnZpY2UgPSBuZXcgU2VtYW50aWNTZWFyY2hTZXJ2aWNlKGRhdGFiYXNlKQogICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBzZWFyY2hTZXJ2aWNlLm11bHRpUXVlcnlTZWFyY2gocXVlcmllcywgb3B0aW9ucykKCiAgICAgIHJldHVybiB7CiAgICAgICAgc3VjY2VzczogdHJ1ZSwKICAgICAgICB0b3RhbDogcmVzdWx0LnRvdGFsLAogICAgICAgIHJlc3VsdHM6IHJlc3VsdC5yZXN1bHRzCiAgICAgIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOWkmuafpeivouaQnOe0ouWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksIHJlc3VsdHM6IFtdIH0KICAgIH0KICB9KQoKICAvLyA9PT09PT09PT09PT09PT09PT09PSDmn6Xor6Lop6PmnpDnm7jlhbMgPT09PT09PT09PT09PT09PT09PT0KCiAgLy8g6Kej5p6Q55So5oi35p+l6K+iCiAgaXBjTWFpbi5oYW5kbGUoJ3F1ZXJ5OnBhcnNlJywgYXN5bmMgKF8sIHF1ZXJ5OiBzdHJpbmcpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcXVlcnlQYXJzZXJTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3F1ZXJ5UGFyc2VyU2VydmljZS5qcycpCiAgICAgIHJldHVybiBhd2FpdCBxdWVyeVBhcnNlclNlcnZpY2UucGFyc2UocXVlcnkpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDmn6Xor6Lop6PmnpDlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiBudWxsCiAgICB9CiAgfSkKCiAgLy8g5riF6Zmk5p+l6K+i6Kej5p6Q57yT5a2YCiAgaXBjTWFpbi5oYW5kbGUoJ3F1ZXJ5OmNsZWFyLWNhY2hlJywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBxdWVyeVBhcnNlclNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvcXVlcnlQYXJzZXJTZXJ2aWNlLmpzJykKICAgICAgcXVlcnlQYXJzZXJTZXJ2aWNlLmNsZWFyQ2FjaGUoKQogICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOa4hemZpOafpeivoue8k+WtmOWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOiOt+WPluafpeivouino+aekOe8k+WtmOe7n+iuoQogIGlwY01haW4uaGFuZGxlKCdxdWVyeTpnZXQtY2FjaGUtc3RhdHMnLCBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHF1ZXJ5UGFyc2VyU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9xdWVyeVBhcnNlclNlcnZpY2UuanMnKQogICAgICByZXR1cm4gcXVlcnlQYXJzZXJTZXJ2aWNlLmdldENhY2hlU3RhdHMoKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6I635Y+W57yT5a2Y57uf6K6h5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gbnVsbAogICAgfQogIH0pCgogIC8vID09PT09PT09PT09PT09PT09PT09IOWFs+mUruivjeaQnOe0ouebuOWFsyA9PT09PT09PT09PT09PT09PT09PQoKICAvLyDlhbPplK7or43mkJzntKIKICBpcGNNYWluLmhhbmRsZSgnc2VhcmNoOmtleXdvcmQnLCBhc3luYyAoXywgb3B0aW9uczogewogICAgcXVlcnk6IHN0cmluZwogICAgZmllbGRzPzogc3RyaW5nW10KICAgIGZ1enp5PzogYm9vbGVhbgogICAgbGltaXQ/OiBudW1iZXIKICAgIG9mZnNldD86IG51bWJlcgogIH0pID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsga2V5d29yZFNlYXJjaFNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMva2V5d29yZFNlYXJjaFNlcnZpY2UuanMnKQogICAgICByZXR1cm4gYXdhaXQga2V5d29yZFNlYXJjaFNlcnZpY2Uuc2VhcmNoKG9wdGlvbnMpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDlhbPplK7or43mkJzntKLlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHJlc3VsdHM6IFtdLCB0b3RhbDogMCwgcXVlcnk6IG9wdGlvbnMucXVlcnkgfQogICAgfQogIH0pCgogIC8vIOW/q+mAn+WFs+mUruivjeaQnOe0ogogIGlwY01haW4uaGFuZGxlKCdzZWFyY2g6a2V5d29yZC1xdWljaycsIGFzeW5jIChfLCBxdWVyeTogc3RyaW5nLCBsaW1pdDogbnVtYmVyID0gMjApID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsga2V5d29yZFNlYXJjaFNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMva2V5d29yZFNlYXJjaFNlcnZpY2UuanMnKQogICAgICByZXR1cm4gYXdhaXQga2V5d29yZFNlYXJjaFNlcnZpY2UucXVpY2tTZWFyY2gocXVlcnksIGxpbWl0KQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5b+r6YCf5pCc57Si5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gW10KICAgIH0KICB9KQoKICAvLyDojrflj5bmkJzntKLlu7rorq4KICBpcGNNYWluLmhhbmRsZSgnc2VhcmNoOnN1Z2dlc3Rpb25zJywgYXN5bmMgKF8sIHF1ZXJ5OiBzdHJpbmcsIGxpbWl0OiBudW1iZXIgPSAxMCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBrZXl3b3JkU2VhcmNoU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9rZXl3b3JkU2VhcmNoU2VydmljZS5qcycpCiAgICAgIHJldHVybiBrZXl3b3JkU2VhcmNoU2VydmljZS5nZXRTdWdnZXN0aW9ucyhxdWVyeSwgbGltaXQpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDojrflj5bmkJzntKLlu7rorq7lpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiBbXQogICAgfQogIH0pCgogIC8vID09PT09PT09PT09PT09PT09PT09IOWFqOWxgOWQkemHj+aQnOe0ouebuOWFsyA9PT09PT09PT09PT09PT09PT09PQoKICAvLyDlhajlsYDlkJHph4/mkJzntKIKICBpcGNNYWluLmhhbmRsZSgnc2VhcmNoOmdsb2JhbCcsIGFzeW5jIChfLCBvcHRpb25zOiB7CiAgICBxdWVyeTogc3RyaW5nCiAgICB0b3BLPzogbnVtYmVyCiAgICBtaW5TaW1pbGFyaXR5PzogbnVtYmVyCiAgICBwYWdlPzogbnVtYmVyCiAgICBwYWdlU2l6ZT86IG51bWJlcgogIH0pID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZ2xvYmFsU2VhcmNoU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9nbG9iYWxTZWFyY2hTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IGdsb2JhbFNlYXJjaFNlcnZpY2Uuc2VhcmNoKG9wdGlvbnMpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDlhajlsYDmkJzntKLlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7CiAgICAgICAgcmVzdWx0czogW10sCiAgICAgICAgdG90YWw6IDAsCiAgICAgICAgcGFnZTogMSwKICAgICAgICBwYWdlU2l6ZTogMjAsCiAgICAgICAgcHJvY2Vzc2luZ1RpbWVNczogMCwKICAgICAgICBxdWVyeTogeyBvcmlnaW5hbDogb3B0aW9ucy5xdWVyeSwgcHJvY2Vzc2VkOiAnJywgdmVjdG9yRGltZW5zaW9uOiAwIH0KICAgICAgfQogICAgfQogIH0pCgogIC8vIOW/q+mAn+WFqOWxgOaQnOe0ogogIGlwY01haW4uaGFuZGxlKCdzZWFyY2g6Z2xvYmFsLXF1aWNrJywgYXN5bmMgKF8sIHF1ZXJ5OiBzdHJpbmcsIHRvcEs6IG51bWJlciA9IDEwKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IGdsb2JhbFNlYXJjaFNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvZ2xvYmFsU2VhcmNoU2VydmljZS5qcycpCiAgICAgIHJldHVybiBhd2FpdCBnbG9iYWxTZWFyY2hTZXJ2aWNlLnF1aWNrU2VhcmNoKHF1ZXJ5LCB0b3BLKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5b+r6YCf5pCc57Si5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gW10KICAgIH0KICB9KQoKICAvLyDmn6Xmib7nm7jkvLznhafniYcKICBpcGNNYWluLmhhbmRsZSgnc2VhcmNoOnNpbWlsYXInLCBhc3luYyAoXywgcGhvdG9VdWlkOiBzdHJpbmcsIHRvcEs6IG51bWJlciA9IDEwKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IGdsb2JhbFNlYXJjaFNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvZ2xvYmFsU2VhcmNoU2VydmljZS5qcycpCiAgICAgIHJldHVybiBhd2FpdCBnbG9iYWxTZWFyY2hTZXJ2aWNlLmZpbmRTaW1pbGFyUGhvdG9zKHBob3RvVXVpZCwgdG9wSykKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOebuOS8vOeFp+eJh+aQnOe0ouWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIFtdCiAgICB9CiAgfSkKCiAgLy8g5om56YeP5pCc57SiCiAgaXBjTWFpbi5oYW5kbGUoJ3NlYXJjaDpiYXRjaCcsIGFzeW5jIChfLCBxdWVyaWVzOiBzdHJpbmdbXSwgb3B0aW9ucz86IHsgdG9wSz86IG51bWJlcjsgbWluU2ltaWxhcml0eT86IG51bWJlciB9KSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IGdsb2JhbFNlYXJjaFNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvZ2xvYmFsU2VhcmNoU2VydmljZS5qcycpCiAgICAgIHJldHVybiBhd2FpdCBnbG9iYWxTZWFyY2hTZXJ2aWNlLmJhdGNoU2VhcmNoKHF1ZXJpZXMsIG9wdGlvbnMpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDmibnph4/mkJzntKLlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiBbXQogICAgfQogIH0pCgogIC8vID09PT09PT09PT09PT09PT09PT09IOe7k+aenOiejeWQiOebuOWFsyA9PT09PT09PT09PT09PT09PT09PQoKICAvLyDmt7flkIjmkJzntKLvvIjono3lkIjnu5PmnpzvvIkKICBpcGNNYWluLmhhbmRsZSgnc2VhcmNoOmh5YnJpZCcsIGFzeW5jIChfLCBvcHRpb25zOiB7CiAgICBxdWVyeTogc3RyaW5nCiAgICBrZXl3b3JkV2VpZ2h0PzogbnVtYmVyCiAgICB2ZWN0b3JXZWlnaHQ/OiBudW1iZXIKICAgIGxpbWl0PzogbnVtYmVyCiAgICBtaW5TY29yZT86IG51bWJlcgogIH0pID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcmVzdWx0TWVyZ2VTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3Jlc3VsdE1lcmdlU2VydmljZS5qcycpCiAgICAgIHJldHVybiBhd2FpdCByZXN1bHRNZXJnZVNlcnZpY2Uuc2VhcmNoKG9wdGlvbnMpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDmt7flkIjmkJzntKLlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7CiAgICAgICAgcmVzdWx0czogW10sCiAgICAgICAgdG90YWw6IDAsCiAgICAgICAgcXVlcnk6IG9wdGlvbnMucXVlcnksCiAgICAgICAgcHJvY2Vzc2luZ1RpbWVNczogMCwKICAgICAgICBzdGF0czogeyBrZXl3b3JkQ291bnQ6IDAsIHNlbWFudGljQ291bnQ6IDAsIG1lcmdlZENvdW50OiAwIH0KICAgICAgfQogICAgfQogIH0pCgogIC8vIOa3t+WQiOaQnOe0ou+8iOW4puaEj+Wbvu+8iQogIGlwY01haW4uaGFuZGxlKCdzZWFyY2g6aHlicmlkLWludGVudCcsIGFzeW5jIChfLCBxdWVyeTogc3RyaW5nKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHJlc3VsdE1lcmdlU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9yZXN1bHRNZXJnZVNlcnZpY2UuanMnKQogICAgICByZXR1cm4gYXdhaXQgcmVzdWx0TWVyZ2VTZXJ2aWNlLnNlYXJjaFdpdGhJbnRlbnQocXVlcnkpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDluKbmhI/lm77mkJzntKLlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7CiAgICAgICAgcmVzdWx0czogW10sCiAgICAgICAgdG90YWw6IDAsCiAgICAgICAgcXVlcnksCiAgICAgICAgcHJvY2Vzc2luZ1RpbWVNczogMCwKICAgICAgICBzdGF0czogeyBrZXl3b3JkQ291bnQ6IDAsIHNlbWFudGljQ291bnQ6IDAsIG1lcmdlZENvdW50OiAwIH0KICAgICAgfQogICAgfQogIH0pCgogIC8vIOmHjeaWsOaOkuW6jwogIGlwY01haW4uaGFuZGxlKCdzZWFyY2g6cmVvcmRlcicsIGFzeW5jIChfLCByZXN1bHRzOiBhbnlbXSwgc29ydEJ5OiBzdHJpbmcpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcmVzdWx0TWVyZ2VTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3Jlc3VsdE1lcmdlU2VydmljZS5qcycpCiAgICAgIHJldHVybiByZXN1bHRNZXJnZVNlcnZpY2UucmVvcmRlclJlc3VsdHMocmVzdWx0cywgc29ydEJ5IGFzICdrZXl3b3JkJyB8ICdzZW1hbnRpYycgfCAnbWl4ZWQnIHwgJ3JlY2VuY3knKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6YeN5paw5o6S5bqP5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gcmVzdWx0cwogICAgfQogIH0pCgogIC8vID09PT09PT09PT09PT09PT09PT09IOS6uuiEuOajgOa1i+ebuOWFsyA9PT09PT09PT09PT09PT09PT09PQoKICAvLyDliqDovb3kurrohLjmo4DmtYvmqKHlnosKICBpcGNNYWluLmhhbmRsZSgnZmFjZTpsb2FkLW1vZGVscycsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZURldGVjdGlvblNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvZmFjZURldGVjdGlvblNlcnZpY2UuanMnKQogICAgICByZXR1cm4gYXdhaXQgZmFjZURldGVjdGlvblNlcnZpY2UubG9hZE1vZGVscygpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDliqDovb3mqKHlnovlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9CiAgICB9CiAgfSkKCiAgLy8g6I635Y+W5qih5Z6L54q25oCBCiAgaXBjTWFpbi5oYW5kbGUoJ2ZhY2U6Z2V0LXN0YXR1cycsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZURldGVjdGlvblNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvZmFjZURldGVjdGlvblNlcnZpY2UuanMnKQogICAgICByZXR1cm4gZmFjZURldGVjdGlvblNlcnZpY2UuZ2V0TW9kZWxTdGF0dXMoKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgcmV0dXJuIHsgbG9hZGVkOiBmYWxzZSwgbW9kZWxzUGF0aDogJycsIGNvbmZpZ3VyZWQ6IGZhbHNlIH0KICAgIH0KICB9KQoKICAvLyDmo4DmtYvljZXlvKDnhafniYcKICBpcGNNYWluLmhhbmRsZSgnZmFjZTpkZXRlY3QnLCBhc3luYyAoXywgaW1hZ2VQYXRoOiBzdHJpbmcpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZURldGVjdGlvblNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvZmFjZURldGVjdGlvblNlcnZpY2UuanMnKQogICAgICByZXR1cm4gYXdhaXQgZmFjZURldGVjdGlvblNlcnZpY2UuZGV0ZWN0KGltYWdlUGF0aCkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBkZXRlY3Rpb25zOiBbXSwgZXJyb3I6IFN0cmluZyhlcnJvciksIHByb2Nlc3NpbmdUaW1lTXM6IDAgfQogICAgfQogIH0pCgogIC8vIOaJuemHj+ajgOa1iwogIGlwY01haW4uaGFuZGxlKCdmYWNlOmRldGVjdC1iYXRjaCcsIGFzeW5jIChldmVudCwgaW1hZ2VQYXRoczogc3RyaW5nW10pID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZURldGVjdGlvblNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvZmFjZURldGVjdGlvblNlcnZpY2UuanMnKQoKICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmFjZURldGVjdGlvblNlcnZpY2UuZGV0ZWN0QmF0Y2goCiAgICAgICAgaW1hZ2VQYXRocywKICAgICAgICB7fSwKICAgICAgICAocHJvZ3Jlc3MpID0+IHsKICAgICAgICAgIGV2ZW50LnNlbmRlci5zZW5kKCdmYWNlOnByb2dyZXNzJywgcHJvZ3Jlc3MpCiAgICAgICAgfQogICAgICApCgogICAgICByZXR1cm4gewogICAgICAgIHN1Y2Nlc3M6IHRydWUsCiAgICAgICAgdG90YWxEZXRlY3RlZDogcmVzdWx0LnRvdGFsRGV0ZWN0ZWQsCiAgICAgICAgcHJvY2Vzc2luZ1RpbWVNczogcmVzdWx0LnByb2Nlc3NpbmdUaW1lTXMKICAgICAgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5om56YeP5qOA5rWL5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgdG90YWxEZXRlY3RlZDogMCwgcHJvY2Vzc2luZ1RpbWVNczogMCwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOWPlua2iOajgOa1iwogIGlwY01haW4uaGFuZGxlKCdmYWNlOmNhbmNlbCcsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZURldGVjdGlvblNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvZmFjZURldGVjdGlvblNlcnZpY2UuanMnKQogICAgICBmYWNlRGV0ZWN0aW9uU2VydmljZS5jYW5jZWwoKQogICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH0KICAgIH0KICB9KQoKICAvLyDwn4aVIOmHjee9ruS6uuiEuOaJq+aPj+eKtuaAge+8iOWIoOmZpCBkZXRlY3RlZF9mYWNlcyDorrDlvZXvvIzlhYHorrjph43mlrDmiavmj4/vvIkKICBpcGNNYWluLmhhbmRsZSgnZmFjZTpyZXNldC1zY2FuLXN0YXR1cycsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGlmICghZGF0YWJhc2UpIHsKICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICfmlbDmja7lupPmnKrliJ3lp4vljJYnIH0KICAgICAgfQoKICAgICAgY29uc29sZS5sb2coJ1tJUENdIOa3seW6pumHjee9ruS6uuiEuOaJq+aPj+eKtuaAgS4uLicpCgogICAgICAvLyAxLiDojrflj5blvZPliY3nu5/orqEKICAgICAgY29uc3QgYmVmb3JlRmFjZXMgPSBkYXRhYmFzZS5xdWVyeShgU0VMRUNUIENPVU5UKCopIGFzIGNvdW50IEZST00gZGV0ZWN0ZWRfZmFjZXNgKVswXQogICAgICBjb25zdCBiZWZvcmVQZXJzb25zID0gZGF0YWJhc2UucXVlcnkoYFNFTEVDVCBDT1VOVCgqKSBhcyBjb3VudCBGUk9NIHBlcnNvbnNgKVswXQogICAgICBjb25zdCBiZWZvcmVQaG90b3MgPSBkYXRhYmFzZS5xdWVyeShgU0VMRUNUIENPVU5UKCopIGFzIGNvdW50IEZST00gcGhvdG9zIFdIRVJFIGZpbGVfcGF0aCBJUyBOT1QgTlVMTGApWzBdCiAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDph43nva7liY3nu5/orqE6ICR7YmVmb3JlRmFjZXM/LmNvdW50IHx8IDB9IOS6uuiEuCwgJHtiZWZvcmVQZXJzb25zPy5jb3VudCB8fCAwfSDkurrniaksICR7YmVmb3JlUGhvdG9zPy5jb3VudCB8fCAwfSDnhafniYdgKQoKICAgICAgLy8gMi4g5Yig6Zmk5omA5pyJ5Lq66IS45pWw5o2uCiAgICAgIGRhdGFiYXNlLnJ1bignREVMRVRFIEZST00gZGV0ZWN0ZWRfZmFjZXMnKQogICAgICBkYXRhYmFzZS5ydW4oJ0RFTEVURSBGUk9NIHBlcnNvbnMnKSAgLy8g5Lmf5Yig6Zmk5Lq654mp77yM5Zug5Li65Lq66IS45rKh5LqG5Lq654mp5Lmf5rKh5oSP5LmJCgogICAgICAvLyAzLiDjgJDlhbPplK7jgJHph43nva7miYDmnInnhafniYfnmoTmiavmj4/nirbmgIHvvIjorqlnZXRVbnByb2Nlc3NlZFBob3Rvc+iDvemHjeaWsOiOt+WPlu+8iQogICAgICAvLyBkZXRlY3RlZF9mYWNlc+ihqOS4uuepuuaXtu+8jExFRlQgSk9JTuS8mui/lOWbnk5VTEzvvIznhafniYfoh6rnhLbooqvop4bkuLoi5pyq5aSE55CGIgogICAgICAvLyDkvYbkuLrkuoblvbvlupXph43nva7vvIzmiJHku6znoa7kv51waG90b3PooajmsqHmnInooqvmhI/lpJbmoIforrAKCiAgICAgIC8vIDQuIOmqjOivgeWIoOmZpOe7k+aenAogICAgICBjb25zdCBhZnRlckZhY2VzID0gZGF0YWJhc2UucXVlcnkoYFNFTEVDVCBDT1VOVCgqKSBhcyBjb3VudCBGUk9NIGRldGVjdGVkX2ZhY2VzYClbMF0KICAgICAgY29uc3QgYWZ0ZXJQZXJzb25zID0gZGF0YWJhc2UucXVlcnkoYFNFTEVDVCBDT1VOVCgqKSBhcyBjb3VudCBGUk9NIHBlcnNvbnNgKVswXQoKICAgICAgLy8gNS4g5qOA5p+lZ2V0VW5wcm9jZXNzZWRQaG90b3PkvJrov5Tlm57lpJrlsJHlvKAKICAgICAgY29uc3QgdW5wcm9jZXNzZWRQaG90b3MgPSBkYXRhYmFzZS5nZXRVbnByb2Nlc3NlZFBob3RvcygxMDAwKQoKICAgICAgY29uc29sZS5sb2coYFtJUENdIOa3seW6pumHjee9ruWujOaIkDpgKQogICAgICBjb25zb2xlLmxvZyhgICAtIOWIoOmZpOS6uuiEuDogJHtiZWZvcmVGYWNlcz8uY291bnQgfHwgMH0g4oaSICR7YWZ0ZXJGYWNlcz8uY291bnQgfHwgMH1gKQogICAgICBjb25zb2xlLmxvZyhgICAtIOWIoOmZpOS6uueJqTogJHtiZWZvcmVQZXJzb25zPy5jb3VudCB8fCAwfSDihpIgJHthZnRlclBlcnNvbnM/LmNvdW50IHx8IDB9YCkKICAgICAgY29uc29sZS5sb2coYCAgLSDlj6/ph43mlrDmiavmj4/nhafniYc6ICR7dW5wcm9jZXNzZWRQaG90b3MubGVuZ3RofWApCgogICAgICByZXR1cm4gewogICAgICAgIHN1Y2Nlc3M6IHRydWUsCiAgICAgICAgZGVsZXRlZENvdW50OiBiZWZvcmVGYWNlcz8uY291bnQgfHwgMCwKICAgICAgICByZXNldFBob3RvczogdW5wcm9jZXNzZWRQaG90b3MubGVuZ3RoLAogICAgICAgIG1lc3NhZ2U6IGDlt7LmuIXnkIYgJHtiZWZvcmVGYWNlcz8uY291bnQgfHwgMH0g5Lq66IS444CBJHtiZWZvcmVQZXJzb25zPy5jb3VudCB8fCAwfSDkurrnianvvIwke3VucHJvY2Vzc2VkUGhvdG9zLmxlbmd0aH0g5byg54Wn54mH5Y+v6YeN5paw5omr5o+PYAogICAgICB9CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDph43nva7miavmj4/nirbmgIHlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7CiAgICAgICAgc3VjY2VzczogZmFsc2UsCiAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ+mHjee9ruWksei0pScKICAgICAgfQogICAgfQogIH0pCgogIC8vIPCfhpUg6K+K5patQVBJ77ya6I635Y+W5pWw5o2u5bqT54q25oCB77yIQ1RP6KaB5rGC55qE6aqM6K+B77yJCiAgaXBjTWFpbi5oYW5kbGUoJ2RpYWdub3N0aWM6Z2V0LWRiLXN0YXRzJywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKCFkYXRhYmFzZSkgewogICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ+aVsOaNruW6k+acquWIneWni+WMlicgfQogICAgICB9CgogICAgICBjb25zdCBzdGF0cyA9IHsKICAgICAgICBwaG90b3M6IHsKICAgICAgICAgIHRvdGFsOiBkYXRhYmFzZS5xdWVyeSgnU0VMRUNUIENPVU5UKCopIGFzIGNvdW50IEZST00gcGhvdG9zJylbMF0/LmNvdW50IHx8IDAsCiAgICAgICAgICB3aXRoRmlsZVBhdGg6IGRhdGFiYXNlLnF1ZXJ5KCdTRUxFQ1QgQ09VTlQoKikgYXMgY291bnQgRlJPTSBwaG90b3MgV0hFUkUgZmlsZV9wYXRoIElTIE5PVCBOVUxMJylbMF0/LmNvdW50IHx8IDAsCiAgICAgICAgICB1bnByb2Nlc3NlZDogZGF0YWJhc2UuZ2V0VW5wcm9jZXNzZWRQaG90b3MoMTAwMCkubGVuZ3RoCiAgICAgICAgfSwKICAgICAgICBkZXRlY3RlZF9mYWNlczogewogICAgICAgICAgdG90YWw6IGRhdGFiYXNlLnF1ZXJ5KCdTRUxFQ1QgQ09VTlQoKikgYXMgY291bnQgRlJPTSBkZXRlY3RlZF9mYWNlcycpWzBdPy5jb3VudCB8fCAwLAogICAgICAgICAgdW5hc3NpZ25lZDogZGF0YWJhc2UucXVlcnkoJ1NFTEVDVCBDT1VOVCgqKSBhcyBjb3VudCBGUk9NIGRldGVjdGVkX2ZhY2VzIFdIRVJFIHBlcnNvbl9pZCBJUyBOVUxMJylbMF0/LmNvdW50IHx8IDAsCiAgICAgICAgICBhc3NpZ25lZDogZGF0YWJhc2UucXVlcnkoJ1NFTEVDVCBDT1VOVCgqKSBhcyBjb3VudCBGUk9NIGRldGVjdGVkX2ZhY2VzIFdIRVJFIHBlcnNvbl9pZCBJUyBOT1QgTlVMTCcpWzBdPy5jb3VudCB8fCAwCiAgICAgICAgfSwKICAgICAgICBwZXJzb25zOiB7CiAgICAgICAgICB0b3RhbDogZGF0YWJhc2UucXVlcnkoJ1NFTEVDVCBDT1VOVCgqKSBhcyBjb3VudCBGUk9NIHBlcnNvbnMnKVswXT8uY291bnQgfHwgMAogICAgICAgIH0KICAgICAgfQoKICAgICAgY29uc29sZS5sb2coJ1tEaWFnbm9zdGljXSDmlbDmja7lupPnirbmgIE6Jywgc3RhdHMpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHN0YXRzIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tEaWFnbm9zdGljXSDojrflj5bnu5/orqHlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9CiAgICB9CiAgfSkKCiAgLy8g5omr5o+P5omA5pyJ5pyq5aSE55CG55qE54Wn54mH77yI5Lq66IS45qOA5rWL77yJLSDlhajpk77ot6/pgI/mmI7ljJbniYjmnKwKICBpcGNNYWluLmhhbmRsZSgnZmFjZTpzY2FuLWFsbCcsIGFzeW5jIChldmVudCkgPT4gewogICAgdHJ5IHsKICAgICAgLy8g8J+UtCDlvLnnqpfnoa7orqTvvJpJUEMg56Gu5a6e6KKr6Kem5Y+R5LqGCiAgICAgIGNvbnNvbGUubG9nKCdbSVBDXSBmYWNlOnNjYW4tYWxsIOiiq+inpuWPkScpCiAgICAgIGlmIChtYWluV2luZG93KSB7CiAgICAgICAgbWFpbldpbmRvdy53ZWJDb250ZW50cy5zZW5kKCdmYWNlOnN0YXR1cycsIHsgc3RhZ2U6ICdzdGFydGVkJywgbWVzc2FnZTogJ+W8gOWni+aJq+aPjy4uLicgfSkKICAgICAgfQoKICAgICAgaWYgKCFkYXRhYmFzZSkgewogICAgICAgIGNvbnN0IGVyciA9ICfmlbDmja7lupPmnKrliJ3lp4vljJYnCiAgICAgICAgY29uc29sZS5lcnJvcignW0lQQ10nLCBlcnIpCiAgICAgICAgaWYgKG1haW5XaW5kb3cpIHsKICAgICAgICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgnZmFjZTpzdGF0dXMnLCB7IHN0YWdlOiAnZXJyb3InLCBlcnJvcjogZXJyIH0pCiAgICAgICAgfQogICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBjb3VudDogMCwgZXJyb3I6IGVyciB9CiAgICAgIH0KCiAgICAgIC8vIPCfmqgg5by65Yi26YeN572u6Zif5YiX54q25oCB77yI6Kej5Yaz54q25oCB5q276ZSB77yJCiAgICAgIGNvbnN0IHsgRmFjZURldGVjdGlvblF1ZXVlLCBmYWNlRGV0ZWN0aW9uUXVldWU6IGV4aXN0aW5nUXVldWUgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvZmFjZURldGVjdGlvblF1ZXVlLmpzJykKCiAgICAgIC8vIOS9v+eUqOaWsOeahOmYn+WIl+WunuS+i++8jOS8oOWFpeS4u+i/m+eoi+eahOaVsOaNruW6k+WSjOi/m+W6puWbnuiwgwogICAgICBjb25zdCBxdWV1ZSA9IG5ldyBGYWNlRGV0ZWN0aW9uUXVldWUoZGF0YWJhc2UsIHsKICAgICAgICBtYXhDb25jdXJyZW50OiAxLAogICAgICAgIG9uUHJvZ3Jlc3M6IChwcm9ncmVzcykgPT4gewogICAgICAgICAgLy8g8J+aqCDlrp7ml7bkuIrmiqXov5vluqbliLDliY3nq68KICAgICAgICAgIGlmIChtYWluV2luZG93KSB7CiAgICAgICAgICAgIGNvbnN0IHN0YXRzID0gcXVldWUuZ2V0U3RhdHMoKQogICAgICAgICAgICBjb25zdCBwZXJjZW50ID0gc3RhdHMudG90YWwgPiAwID8gTWF0aC5yb3VuZCgoc3RhdHMuY29tcGxldGVkIC8gc3RhdHMudG90YWwpICogMTAwKSA6IDAKICAgICAgICAgICAgY29uc29sZS5sb2coYFtJUENdIPCfk4og6Zif5YiX6L+b5bqmOiAke3N0YXRzLmNvbXBsZXRlZH0vJHtzdGF0cy50b3RhbH0gKCR7cGVyY2VudH0lKWApCiAgICAgICAgICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgnZmFjZTpwcm9ncmVzcycsIHsKICAgICAgICAgICAgICBjdXJyZW50OiBzdGF0cy5jb21wbGV0ZWQsCiAgICAgICAgICAgICAgdG90YWw6IHN0YXRzLnRvdGFsLAogICAgICAgICAgICAgIHBlcmNlbnQ6IHBlcmNlbnQsCiAgICAgICAgICAgICAgc3RhdHVzOiBwcm9ncmVzcy5zdGF0dXMKICAgICAgICAgICAgfSkKICAgICAgICAgIH0KICAgICAgICB9LAogICAgICAgIG9uQ29tcGxldGU6IChzdGF0cykgPT4gewogICAgICAgICAgLy8g8J+aqCDmiavmj4/lrozmiJDml7bop6blj5EKICAgICAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDwn46JIOS6uuiEuOajgOa1i+WujOaIkDogJHtzdGF0cy5jb21wbGV0ZWR9LyR7c3RhdHMudG90YWx9LCDmo4DmtYvliLAgJHtzdGF0cy5kZXRlY3RlZEZhY2VzfSDlvKDkurrohLhgKQogICAgICAgICAgaWYgKG1haW5XaW5kb3cpIHsKICAgICAgICAgICAgbWFpbldpbmRvdy53ZWJDb250ZW50cy5zZW5kKCdmYWNlOnNjYW4tY29tcGxldGUnLCB7CiAgICAgICAgICAgICAgdG90YWw6IHN0YXRzLnRvdGFsLAogICAgICAgICAgICAgIGNvbXBsZXRlZDogc3RhdHMuY29tcGxldGVkLAogICAgICAgICAgICAgIGZhaWxlZDogc3RhdHMuZmFpbGVkLAogICAgICAgICAgICAgIGRldGVjdGVkRmFjZXM6IHN0YXRzLmRldGVjdGVkRmFjZXMKICAgICAgICAgICAgfSkKICAgICAgICAgICAgbWFpbldpbmRvdy53ZWJDb250ZW50cy5zZW5kKCdmYWNlOnN0YXR1cycsIHsKICAgICAgICAgICAgICBzdGFnZTogJ2NvbXBsZXRlZCcsCiAgICAgICAgICAgICAgdG90YWw6IHN0YXRzLnRvdGFsLAogICAgICAgICAgICAgIGRldGVjdGVkRmFjZXM6IHN0YXRzLmRldGVjdGVkRmFjZXMsCiAgICAgICAgICAgICAgbWVzc2FnZTogYOaJq+aPj+WujOaIkO+8jOWFsSAke3N0YXRzLmNvbXBsZXRlZH0g5byg54Wn54mH77yM5qOA5rWL5YiwICR7c3RhdHMuZGV0ZWN0ZWRGYWNlc30g5byg5Lq66IS4YAogICAgICAgICAgICB9KQogICAgICAgICAgfQogICAgICAgIH0KICAgICAgfSkKICAgICAgY29uc3QgcHJldlN0YXR1cyA9IHF1ZXVlLmdldERldGFpbGVkU3RhdHVzKCkKICAgICAgY29uc29sZS5sb2coYFtJUENdIOS5i+WJjemYn+WIl+eKtuaAgTogaXNSdW5uaW5nPSR7cHJldlN0YXR1cy5pc1J1bm5pbmd9LCBxdWV1ZUxlbmd0aD0ke3ByZXZTdGF0dXMucXVldWVMZW5ndGh9YCkKCiAgICAgIGlmIChwcmV2U3RhdHVzLmlzUnVubmluZykgewogICAgICAgIGNvbnNvbGUubG9nKCdbSVBDXSDmo4DmtYvliLDpmJ/liJfljaHkvY/vvIzlvLrliLbph43nva4uLi4nKQogICAgICAgIHF1ZXVlLmZvcmNlUmVzZXQoKQogICAgICB9CgogICAgICAvLyDwn5qoIOiwg+ivle+8muajgOafpeaVsOaNruW6k+S4reW3suWkhOeQhiB2cyDmnKrlpITnkIbnmoTnhafniYcKICAgICAgY29uc3QgdG90YWxQaG90b3MgPSBkYXRhYmFzZS5xdWVyeSgnU0VMRUNUIENPVU5UKCopIGFzIGNudCBGUk9NIHBob3RvcyBXSEVSRSBmaWxlX3BhdGggSVMgTk9UIE5VTEwnKQogICAgICBjb25zdCBwcm9jZXNzZWRQaG90b3MgPSBkYXRhYmFzZS5xdWVyeSgnU0VMRUNUIENPVU5UKERJU1RJTkNUIHAuaWQpIGFzIGNudCBGUk9NIHBob3RvcyBwIEpPSU4gZGV0ZWN0ZWRfZmFjZXMgZGYgT04gcC5pZCA9IGRmLnBob3RvX2lkIFdIRVJFIHAuZmlsZV9wYXRoIElTIE5PVCBOVUxMJykKICAgICAgY29uc29sZS5sb2coYFtJUENdIOaVsOaNruW6k+e7n+iuoTog5oC75pWwPSR7dG90YWxQaG90b3NbMF0/LmNudH0sIOW3suWkhOeQhj0ke3Byb2Nlc3NlZFBob3Rvc1swXT8uY250fWApCgogICAgICAvLyDkvb/nlKjkuLvov5vnqIvnmoTmlbDmja7lupPlrp7kvovojrflj5bmnKrlpITnkIbnmoTnhafniYcKICAgICAgY29uc3QgdW5wcm9jZXNzZWRMaW1pdCA9IDEwMDAKICAgICAgY29uc3QgcGhvdG9zID0gZGF0YWJhc2UuZ2V0VW5wcm9jZXNzZWRQaG90b3ModW5wcm9jZXNzZWRMaW1pdCkKICAgICAgY29uc29sZS5sb2coYFtJUENdIGdldFVucHJvY2Vzc2VkUGhvdG9zKCR7dW5wcm9jZXNzZWRMaW1pdH0pIOi/lOWbnjogJHtwaG90b3MubGVuZ3RofSDlvKBgKQoKICAgICAgaWYgKG1haW5XaW5kb3cpIHsKICAgICAgICBtYWluV2luZG93LndlYkNvbnRlbnRzLnNlbmQoJ2ZhY2U6c3RhdHVzJywgewogICAgICAgICAgc3RhZ2U6ICdxdWV1ZWQnLAogICAgICAgICAgdG90YWw6IHBob3Rvcy5sZW5ndGgsCiAgICAgICAgICBtZXNzYWdlOiBg5bey5re75YqgICR7cGhvdG9zLmxlbmd0aH0g5byg54Wn54mH5Yiw5omr5o+P6Zif5YiXYAogICAgICAgIH0pCiAgICAgIH0KCiAgICAgIGlmIChwaG90b3MubGVuZ3RoID09PSAwKSB7CiAgICAgICAgLy8g8J+GlSDmo4Dmn6XmmK/lkKblt7LmnInmo4DmtYvmlbDmja7kvYbmnKrogZrnsbsKICAgICAgICBjb25zdCB1bmNsdXN0ZXJlZENvdW50ID0gcXVldWUuZ2V0VW5jbHVzdGVyZWRGYWNlQ291bnQoKQogICAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDmsqHmnInmlrDnhafniYfpnIDopoHmiavmj4/vvIzkvYbmnKrogZrnsbvkurrohLjmlbA6ICR7dW5jbHVzdGVyZWRDb3VudH1gKQoKICAgICAgICBpZiAodW5jbHVzdGVyZWRDb3VudCA+IDApIHsKICAgICAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDlj5HnjrAgJHt1bmNsdXN0ZXJlZENvdW50fSDkuKrmnKrogZrnsbvkurrohLjvvIznm7TmjqXop6blj5HogZrnsbsuLi5gKQoKICAgICAgICAgIGlmIChtYWluV2luZG93KSB7CiAgICAgICAgICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgnZmFjZTpzdGF0dXMnLCB7CiAgICAgICAgICAgICAgc3RhZ2U6ICdwcm9jZXNzaW5nJywKICAgICAgICAgICAgICBtZXNzYWdlOiBg5Y+R546wICR7dW5jbHVzdGVyZWRDb3VudH0g5Liq5pyq6K+G5Yir5Lq66IS477yM5q2j5Zyo6IGa57G7Li4uYAogICAgICAgICAgICB9KQogICAgICAgICAgfQoKICAgICAgICAgIC8vIOebtOaOpeaJp+ihjOiBmuexuwogICAgICAgICAgY29uc3QgY2x1c3RlclJlc3VsdCA9IGF3YWl0IHF1ZXVlLmNsdXN0ZXJFeGlzdGluZ0ZhY2VzKCkKCiAgICAgICAgICBpZiAobWFpbldpbmRvdykgewogICAgICAgICAgICBtYWluV2luZG93LndlYkNvbnRlbnRzLnNlbmQoJ2ZhY2U6c3RhdHVzJywgewogICAgICAgICAgICAgIHN0YWdlOiAnY29tcGxldGVkJywKICAgICAgICAgICAgICBtZXNzYWdlOiBg6IGa57G75a6M5oiQ77yB6K+G5Yir5LqGICR7Y2x1c3RlclJlc3VsdC5tYXRjaGVkfSDlvKDkurrohLjvvIzliJvlu7rkuoYgJHtjbHVzdGVyUmVzdWx0LnBlcnNvbnNDcmVhdGVkfSDkvY3kurrnialgCiAgICAgICAgICAgIH0pCiAgICAgICAgICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgnZmFjZTpzY2FuLWNvbXBsZXRlJywgewogICAgICAgICAgICAgIHRvdGFsOiB1bmNsdXN0ZXJlZENvdW50LAogICAgICAgICAgICAgIGNvbXBsZXRlZDogdW5jbHVzdGVyZWRDb3VudCwKICAgICAgICAgICAgICBmYWlsZWQ6IDAsCiAgICAgICAgICAgICAgZGV0ZWN0ZWRGYWNlczogY2x1c3RlclJlc3VsdC5tYXRjaGVkCiAgICAgICAgICAgIH0pCiAgICAgICAgICAgIC8vIPCfhpUg6YCa55+l5YmN56uv5Yi35paw5Lq654mp5YiX6KGoCiAgICAgICAgICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgncGVvcGxlOnVwZGF0ZWQnKQogICAgICAgICAgfQoKICAgICAgICAgIHJldHVybiB7CiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsCiAgICAgICAgICAgIGNvdW50OiAwLAogICAgICAgICAgICBkZXRlY3RlZEZhY2VzOiBjbHVzdGVyUmVzdWx0Lm1hdGNoZWQsCiAgICAgICAgICAgIHBlcnNvbnNDcmVhdGVkOiBjbHVzdGVyUmVzdWx0LnBlcnNvbnNDcmVhdGVkLAogICAgICAgICAgICBtZXNzYWdlOiBg6IGa57G75a6M5oiQ77yB5Yib5bu65LqGICR7Y2x1c3RlclJlc3VsdC5wZXJzb25zQ3JlYXRlZH0g5L2N5Lq654mpYAogICAgICAgICAgfQogICAgICAgIH0KCiAgICAgICAgaWYgKG1haW5XaW5kb3cpIHsKICAgICAgICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgnZmFjZTpzdGF0dXMnLCB7IHN0YWdlOiAnY29tcGxldGVkJywgbWVzc2FnZTogJ+ayoeaciemcgOimgeWkhOeQhueahOeFp+eJhycgfSkKICAgICAgICB9CiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgY291bnQ6IDAsIG1lc3NhZ2U6ICfmsqHmnInpnIDopoHlpITnkIbnmoTnhafniYcnIH0KICAgICAgfQoKICAgICAgLy8g8J+GlSDliJvlu7rmiavmj4/ku7vliqHorrDlvZUKICAgICAgY29uc3Qgam9iSWQgPSBxdWV1ZS5zdGFydFNjYW5Kb2IocGhvdG9zLmxlbmd0aCkKICAgICAgY29uc29sZS5sb2coYFtJUENdIOWIm+W7uuaJq+aPj+S7u+WKoTogJHtqb2JJZH1gKQoKICAgICAgLy8g5om56YeP5re75Yqg5Yiw6Zif5YiXCiAgICAgIGxldCBwcm9jZXNzZWQgPSAwCiAgICAgIGNvbnN0IHRvdGFsUGhvdG9zVG9Qcm9jZXNzID0gcGhvdG9zLmxlbmd0aAoKICAgICAgZm9yIChjb25zdCBwaG90byBvZiBwaG90b3MpIHsKICAgICAgICBjb25zb2xlLmxvZyhgW0lQQ10g5re75Yqg54Wn54mH5Yiw6Zif5YiXOiAke3Bob3RvLmlkfSAoJHtwcm9jZXNzZWQgKyAxfS8ke3RvdGFsUGhvdG9zVG9Qcm9jZXNzfSlgKQogICAgICAgIGF3YWl0IHF1ZXVlLmFkZFRhc2soCiAgICAgICAgICBwaG90by5pZC50b1N0cmluZygpLAogICAgICAgICAgcGhvdG8udXVpZCwKICAgICAgICAgIHBob3RvLmZpbGVfcGF0aAogICAgICAgICkKICAgICAgICBwcm9jZXNzZWQrKwogICAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDlt7LlpITnkIY6ICR7cHJvY2Vzc2VkfS8ke3RvdGFsUGhvdG9zVG9Qcm9jZXNzfWApCgogICAgICAgIC8vIOavj+WkhOeQhiAxIOW8oOWwseS4iuaKpei/m+W6pu+8iOWunuaXtuWPjemmiO+8iQogICAgICAgIGlmIChtYWluV2luZG93ICYmIHByb2Nlc3NlZCAlIDEgPT09IDApIHsKICAgICAgICAgIGNvbnN0IHBlcmNlbnQgPSBNYXRoLnJvdW5kKChwcm9jZXNzZWQgLyB0b3RhbFBob3Rvc1RvUHJvY2VzcykgKiAxMDApCiAgICAgICAgICBjb25zb2xlLmxvZyhgW0lQQ10g8J+TiiDlj5HpgIHov5vluqY6ICR7cHJvY2Vzc2VkfS8ke3RvdGFsUGhvdG9zVG9Qcm9jZXNzfSAoJHtwZXJjZW50fSUpYCkKICAgICAgICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgnZmFjZTpwcm9ncmVzcycsIHsKICAgICAgICAgICAgY3VycmVudDogcHJvY2Vzc2VkLAogICAgICAgICAgICB0b3RhbDogdG90YWxQaG90b3NUb1Byb2Nlc3MsCiAgICAgICAgICAgIHBlcmNlbnQ6IHBlcmNlbnQKICAgICAgICAgIH0pCiAgICAgICAgfQogICAgICB9CgogICAgICBjb25zb2xlLmxvZyhgW0lQQ10g5bey5re75YqgICR7cHJvY2Vzc2VkfSDlvKDnhafniYfliLDpmJ/liJdgKQoKICAgICAgLy8g8J+aqCDmmL7lvI/osIPnlKggZm9yY2VTdGFydCgpIOiAjOmdnuS+nei1liBhZGRUYXNrIOiHquWKqOinpuWPkQogICAgICBjb25zb2xlLmxvZygnW0lQQ10g6LCD55SoIHF1ZXVlLmZvcmNlU3RhcnQoKSDlkK/liqjlpITnkIblvJXmk44uLi4nKQogICAgICBhd2FpdCBxdWV1ZS5mb3JjZVN0YXJ0KCkKCiAgICAgIGNvbnNvbGUubG9nKCdbSVBDXSBmb3JjZVN0YXJ0KCkg6L+U5Zue77yM562J5b6F6Zif5YiX5aSE55CG5a6M5oiQLi4uJykKCiAgICAgIC8vIPCfmqgg5rOo5oSP77ya5a6M5oiQ54q25oCB546w5Zyo55SxIHF1ZXVlLm9uQ29tcGxldGUg5Zue6LCD5Y+R6YCBCiAgICAgIC8vIOetieW+heS4gOWwj+auteaXtumXtOehruS/nSBvbkNvbXBsZXRlIOW3sue7j+inpuWPkQogICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSkKCiAgICAgIGNvbnN0IGZpbmFsU3RhdHMgPSBxdWV1ZS5nZXRTdGF0cygpCiAgICAgIGNvbnN0IGRldGVjdGVkRmFjZXMgPSBxdWV1ZS5nZXRUYXNrcygpLnJlZHVjZSgoc3VtLCB0KSA9PiBzdW0gKyAodC5mYWNlcyB8fCAwKSwgMCkKCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGNvdW50OiBwcm9jZXNzZWQsIGRldGVjdGVkRmFjZXMsIHRvdGFsOiBmaW5hbFN0YXRzLnRvdGFsIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnN0IGVyck1zZyA9IFN0cmluZyhlcnJvcikKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5omr5o+P5aSx6LSlOicsIGVycm9yKQogICAgICBpZiAobWFpbldpbmRvdykgewogICAgICAgIG1haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgnZmFjZTpzdGF0dXMnLCB7IHN0YWdlOiAnZXJyb3InLCBlcnJvcjogZXJyTXNnIH0pCiAgICAgIH0KICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGNvdW50OiAwLCBlcnJvcjogZXJyTXNnIH0KICAgIH0KICB9KQoKICAvLyDwn5qoIOiOt+WPluS6uuiEuOajgOa1i+mYn+WIl+eKtuaAge+8iOeUqOS6juiviuaWre+8iQogIGlwY01haW4uaGFuZGxlKCdmYWNlOmdldC1xdWV1ZS1zdGF0dXMnLCBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IGZhY2VEZXRlY3Rpb25RdWV1ZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9mYWNlRGV0ZWN0aW9uUXVldWUuanMnKQogICAgICByZXR1cm4gZmFjZURldGVjdGlvblF1ZXVlLmdldERldGFpbGVkU3RhdHVzKCkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOiOt+WPlumYn+WIl+eKtuaAgeWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIG51bGwKICAgIH0KICB9KQoKICAvLyDwn5qoIOW8uuWItumHjee9rumYn+WIl+eKtuaAge+8iOeUqOS6juaBouWkjeWNoeatu+eahOmYn+WIl++8iQogIGlwY01haW4uaGFuZGxlKCdmYWNlOnJlc2V0LXF1ZXVlJywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBmYWNlRGV0ZWN0aW9uUXVldWUgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvZmFjZURldGVjdGlvblF1ZXVlLmpzJykKICAgICAgY29uc3Qgc3RhdHVzID0gZmFjZURldGVjdGlvblF1ZXVlLmdldERldGFpbGVkU3RhdHVzKCkKICAgICAgZmFjZURldGVjdGlvblF1ZXVlLmZvcmNlUmVzZXQoKQogICAgICBjb25zb2xlLmxvZygnW0lQQ10g6Zif5YiX54q25oCB5bey5by65Yi26YeN572uJykKICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgcHJldmlvdXNTdGF0dXM6IHN0YXR1cyB9CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDph43nva7pmJ/liJflpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9CiAgICB9CiAgfSkKCiAgLy8g8J+GlSDojrflj5bmnKrlkb3lkI3nmoTkurrohLjvvIjmnKrogZrnsbvnmoTkurrohLjvvIznlKjkuo7mmL7npLrkuLoi5pyq5ZG95ZCN5Lq654mpIu+8iQogIGlwY01haW4uaGFuZGxlKCdmYWNlOmdldC11bm5hbWVkLWZhY2VzJywgYXN5bmMgKF8sIGxpbWl0OiBudW1iZXIgPSA1MCkgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKCFkYXRhYmFzZSkgcmV0dXJuIHsgZmFjZXM6IFtdLCBjb3VudDogMCB9CgogICAgICBjb25zdCBmYWNlcyA9IGRhdGFiYXNlLnF1ZXJ5KGAKICAgICAgICBTRUxFQ1QgZGYuaWQsIGRmLnBob3RvX2lkLCBkZi5iYm94X3gsIGRmLmJib3hfeSwgZGYuYmJveF93aWR0aCwgZGYuYmJveF9oZWlnaHQsCiAgICAgICAgICAgICAgIGRmLmNvbmZpZGVuY2UsIHAuZmlsZV9wYXRoLCBwLnRodW1ibmFpbF9wYXRoCiAgICAgICAgRlJPTSBkZXRlY3RlZF9mYWNlcyBkZgogICAgICAgIEpPSU4gcGhvdG9zIHAgT04gZGYucGhvdG9faWQgPSBwLmlkCiAgICAgICAgV0hFUkUgZGYucGVyc29uX2lkIElTIE5VTEwKICAgICAgICBPUkRFUiBCWSBkZi5jb25maWRlbmNlIERFU0MKICAgICAgICBMSU1JVCA/CiAgICAgIGAsIFtsaW1pdF0pCgogICAgICBjb25zdCBjb3VudCA9IGRhdGFiYXNlLnF1ZXJ5KCdTRUxFQ1QgQ09VTlQoKikgYXMgY291bnQgRlJPTSBkZXRlY3RlZF9mYWNlcyBXSEVSRSBwZXJzb25faWQgSVMgTlVMTCcpWzBdPy5jb3VudCB8fCAwCgogICAgICByZXR1cm4gewogICAgICAgIGZhY2VzOiBmYWNlcy5tYXAoKGY6IGFueSkgPT4gKHsKICAgICAgICAgIGlkOiBmLmlkLAogICAgICAgICAgcGhvdG9JZDogZi5waG90b19pZCwKICAgICAgICAgIGJib3g6IHsgeDogZi5iYm94X3gsIHk6IGYuYmJveF95LCB3aWR0aDogZi5iYm94X3dpZHRoLCBoZWlnaHQ6IGYuYmJveF9oZWlnaHQgfSwKICAgICAgICAgIGNvbmZpZGVuY2U6IGYuY29uZmlkZW5jZSwKICAgICAgICAgIGZpbGVQYXRoOiBmLmZpbGVfcGF0aCwKICAgICAgICAgIHRodW1ibmFpbFBhdGg6IGYudGh1bWJuYWlsX3BhdGgKICAgICAgICB9KSksCiAgICAgICAgY291bnQKICAgICAgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6I635Y+W5pyq5ZG95ZCN5Lq66IS45aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBmYWNlczogW10sIGNvdW50OiAwLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9CiAgICB9CiAgfSkKCiAgLy8gPT09PT09PT09PT09PT09PT09PT0g6K+K5pat5bel5YW355u45YWzID09PT09PT09PT09PT09PT09PT09CgogIC8vIPCfmqgg6I635Y+W5Lq66IS45qOA5rWL57uf6K6h77yI55So5LqO6K+K5pat77yJCiAgaXBjTWFpbi5oYW5kbGUoJ2RpYWdub3N0aWM6ZmFjZS1zdGF0cycsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGlmICghZGF0YWJhc2UpIHJldHVybiB7IGVycm9yOiAn5pWw5o2u5bqT5pyq5Yid5aeL5YyWJyB9CgogICAgICBjb25zdCBzdGF0cyA9IHsKICAgICAgICBwaG90b3M6IGRhdGFiYXNlLnF1ZXJ5KCdTRUxFQ1QgQ09VTlQoKikgYXMgY291bnQgRlJPTSBwaG90b3MnKVswXT8uY291bnQgfHwgMCwKICAgICAgICBkZXRlY3RlZEZhY2VzOiBkYXRhYmFzZS5xdWVyeSgnU0VMRUNUIENPVU5UKCopIGFzIGNvdW50IEZST00gZGV0ZWN0ZWRfZmFjZXMnKVswXT8uY291bnQgfHwgMCwKICAgICAgICBwZXJzb25zOiBkYXRhYmFzZS5xdWVyeSgnU0VMRUNUIENPVU5UKCopIGFzIGNvdW50IEZST00gcGVyc29ucycpWzBdPy5jb3VudCB8fCAwLAogICAgICAgIGZhY2VzOiBkYXRhYmFzZS5xdWVyeSgnU0VMRUNUIENPVU5UKCopIGFzIGNvdW50IEZST00gZmFjZXMnKVswXT8uY291bnQgfHwgMCwKICAgICAgfQoKICAgICAgLy8g5qOA5p+lIGRldGVjdGVkX2ZhY2VzIOS4reaYr+WQpuaciSBlbWJlZGRpbmcKICAgICAgY29uc3Qgd2l0aEVtYmVkZGluZyA9IGRhdGFiYXNlLnF1ZXJ5KGAKICAgICAgICBTRUxFQ1QgQ09VTlQoKikgYXMgY291bnQgRlJPTSBkZXRlY3RlZF9mYWNlcyBXSEVSRSBlbWJlZGRpbmcgSVMgTk9UIE5VTEwKICAgICAgYClbMF0/LmNvdW50IHx8IDAKCiAgICAgIC8vIOiOt+WPluagt+acrOaVsOaNrgogICAgICBjb25zdCBzYW1wbGUgPSBkYXRhYmFzZS5xdWVyeShgCiAgICAgICAgU0VMRUNUIGlkLCBwaG90b19pZCwgY29uZmlkZW5jZSwKICAgICAgICAgICAgICAgQ0FTRSBXSEVOIGVtYmVkZGluZyBJUyBOVUxMIFRIRU4gJ05VTEwnIEVMU0UgJ+acieaVsOaNricgRU5EIGFzIGVtYl9zdGF0dXMKICAgICAgICBGUk9NIGRldGVjdGVkX2ZhY2VzIExJTUlUIDMKICAgICAgYCkKCiAgICAgIGNvbnNvbGUubG9nKCdbRGlhZ25vc3RpY10g5Lq66IS45qOA5rWL57uf6K6hOicsIHsgLi4uc3RhdHMsIHdpdGhFbWJlZGRpbmcgfSkKICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgc3RhdHM6IHsgLi4uc3RhdHMsIHdpdGhFbWJlZGRpbmcgfSwgc2FtcGxlIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tEaWFnbm9zdGljXSDojrflj5bnu5/orqHlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9CiAgICB9CiAgfSkKCiAgLy8g8J+aqCDmuIXnkIbmiYDmnInkurrohLjmlbDmja7vvIjnlKjkuo7ph43nva7vvIkKICBpcGNNYWluLmhhbmRsZSgnZGlhZ25vc3RpYzpjbGVhci1mYWNlLWRhdGEnLCBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBpZiAoIWRhdGFiYXNlKSByZXR1cm4geyBlcnJvcjogJ+aVsOaNruW6k+acquWIneWni+WMlicgfQoKICAgICAgY29uc29sZS5sb2coJ1tEaWFnbm9zdGljXSDlvIDlp4vmuIXnkIbkurrohLjmlbDmja4uLi4nKQoKICAgICAgLy8g5riF55CG6KGo77yI5oyJ5L6d6LWW6aG65bqP77yJCiAgICAgIGRhdGFiYXNlLnJ1bignREVMRVRFIEZST00gZGV0ZWN0ZWRfZmFjZXMnKQogICAgICBkYXRhYmFzZS5ydW4oJ0RFTEVURSBGUk9NIGZhY2VzJykKICAgICAgZGF0YWJhc2UucnVuKCdERUxFVEUgRlJPTSBwZXJzb25zJykKCiAgICAgIGNvbnNvbGUubG9nKCdbRGlhZ25vc3RpY10g5Lq66IS45pWw5o2u5bey5riF55CGJykKICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogJ+aJgOacieS6uuiEuOaVsOaNruW3sua4heeQhicgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0RpYWdub3N0aWNdIOa4heeQhuaVsOaNruWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyDwn5qoIOmHjee9ruS6uueJqeWFs+iBlO+8iOeUqOS6jumHjeaWsOiBmuexu++8iQogIGlwY01haW4uaGFuZGxlKCdkaWFnbm9zdGljOnJlc2V0LXBlcnNvbi1saW5rcycsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGlmICghZGF0YWJhc2UpIHJldHVybiB7IGVycm9yOiAn5pWw5o2u5bqT5pyq5Yid5aeL5YyWJyB9CgogICAgICBjb25zb2xlLmxvZygnW0RpYWdub3N0aWNdIOmHjee9ruS6uueJqeWFs+iBlC4uLicpCgogICAgICAvLyDmuIXpmaQgZGV0ZWN0ZWRfZmFjZXMg55qEIHBlcnNvbl9pZAogICAgICBkYXRhYmFzZS5ydW4oJ1VQREFURSBkZXRlY3RlZF9mYWNlcyBTRVQgcGVyc29uX2lkID0gTlVMTCwgcHJvY2Vzc2VkID0gMCcpCiAgICAgIC8vIOa4hemZpCBwZXJzb25zIOihqAogICAgICBkYXRhYmFzZS5ydW4oJ0RFTEVURSBGUk9NIHBlcnNvbnMnKQoKICAgICAgY29uc29sZS5sb2coJ1tEaWFnbm9zdGljXSDkurrnianlhbPogZTlt7Lph43nva4nKQogICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAn5Lq654mp5YWz6IGU5bey6YeN572u77yM5Y+v5Lul6YeN5paw6IGa57G7JyB9CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbRGlhZ25vc3RpY10g6YeN572u5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIPCfmqgg5omn6KGM5Y6f5aeLU1FM5p+l6K+i77yI5LuF6ZmQU0VMRUNU77yM55So5LqO6K+K5pat77yJCiAgaXBjTWFpbi5oYW5kbGUoJ2RpYWdub3N0aWM6cXVlcnknLCBhc3luYyAoXywgc3FsOiBzdHJpbmcpID0+IHsKICAgIHRyeSB7CiAgICAgIGlmICghZGF0YWJhc2UpIHJldHVybiB7IGVycm9yOiAn5pWw5o2u5bqT5pyq5Yid5aeL5YyWJyB9CgogICAgICAvLyDlronlhajmo4Dmn6XvvJrlj6rlhYHorrggU0VMRUNUIOivreWPpQogICAgICBjb25zdCB0cmltbWVkU3FsID0gc3FsLnRyaW0oKS50b1VwcGVyQ2FzZSgpCiAgICAgIGlmICghdHJpbW1lZFNxbC5zdGFydHNXaXRoKCdTRUxFQ1QnKSkgewogICAgICAgIHJldHVybiB7IGVycm9yOiAn5Y+q5YWB6K645omn6KGMIFNFTEVDVCDmn6Xor6InIH0KICAgICAgfQoKICAgICAgY29uc3QgcmVzdWx0ID0gZGF0YWJhc2UucXVlcnkoc3FsKQogICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCByZXN1bHQgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0RpYWdub3N0aWNdIFNRTOafpeivouWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyA9PT09PT09PT09PT09PT09PT09PSDkurrohLjljLnphY3nm7jlhbMgPT09PT09PT09PT09PT09PT09PT0KCiAgLy8g6Ieq5Yqo5Yy56YWNCiAgaXBjTWFpbi5oYW5kbGUoJ2ZhY2U6YXV0by1tYXRjaCcsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZU1hdGNoaW5nU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9mYWNlTWF0Y2hpbmdTZXJ2aWNlLmpzJykKICAgICAgLy8g8J+aqCDosIPor5XvvJrlhYjmo4Dmn6XmnKrljLnphY3kurrohLgKICAgICAgY29uc3QgdW5tYXRjaGVkID0gYXdhaXQgZmFjZU1hdGNoaW5nU2VydmljZS5nZXRVbm1hdGNoZWRGYWNlcygpCiAgICAgIGNvbnNvbGUubG9nKGBbSVBDXSDmnKrljLnphY3kurrohLjmlbDph486ICR7dW5tYXRjaGVkLmxlbmd0aH1gKQogICAgICBpZiAodW5tYXRjaGVkLmxlbmd0aCA+IDApIHsKICAgICAgICBjb25zb2xlLmxvZyhgW0lQQ10g5qC35pys5Lq66IS4IGRlc2NyaXB0b3Ig6ZW/5bqmOiAke3VubWF0Y2hlZFswXS5kZXNjcmlwdG9yPy5sZW5ndGh9YCkKICAgICAgfQogICAgICAvLyDkvb/nlKjpu5jorqTpmIjlgLwgMC40NQogICAgICByZXR1cm4gYXdhaXQgZmFjZU1hdGNoaW5nU2VydmljZS5hdXRvTWF0Y2goKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6Ieq5Yqo5Yy56YWN5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBtYXRjaGVkOiAwLCBjbHVzdGVyczogW10sIHByb2Nlc3NpbmdUaW1lTXM6IDAsIG1lc3NhZ2U6ICfoh6rliqjljLnphY3lpLHotKUnIH0KICAgIH0KICB9KQoKICAvLyDmn6Xmib7nm7jkvLzkurrohLgKICBpcGNNYWluLmhhbmRsZSgnZmFjZTpmaW5kLXNpbWlsYXInLCBhc3luYyAoXywgZmFjZUlkOiBudW1iZXIpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZU1hdGNoaW5nU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9mYWNlTWF0Y2hpbmdTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IGZhY2VNYXRjaGluZ1NlcnZpY2UuZmluZFNpbWlsYXJGYWNlcyhmYWNlSWQpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDmn6Xmib7nm7jkvLzkurrohLjlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiBbXQogICAgfQogIH0pCgogIC8vIOS4uuiBmuexu+WIm+W7uuS6uueJqQogIGlwY01haW4uaGFuZGxlKCdmYWNlOmNyZWF0ZS1wZXJzb24nLCBhc3luYyAoXywgY2x1c3RlcjogYW55LCBwZXJzb25OYW1lOiBzdHJpbmcpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZU1hdGNoaW5nU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9mYWNlTWF0Y2hpbmdTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IGZhY2VNYXRjaGluZ1NlcnZpY2UuY3JlYXRlUGVyc29uRnJvbUNsdXN0ZXIoY2x1c3RlciwgcGVyc29uTmFtZSkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOWIm+W7uuS6uueJqeWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyDlsIbkurrohLjliIbphY3nu5nkurrniakKICBpcGNNYWluLmhhbmRsZSgnZmFjZTphc3NpZ24nLCBhc3luYyAoXywgZmFjZUlkczogbnVtYmVyW10sIHBlcnNvbklkOiBudW1iZXIpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZU1hdGNoaW5nU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9mYWNlTWF0Y2hpbmdTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IGZhY2VNYXRjaGluZ1NlcnZpY2UuYXNzaWduVG9QZXJzb24oZmFjZUlkcywgcGVyc29uSWQpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDliIbphY3kurrohLjlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBhc3NpZ25lZDogMCwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOWPlua2iOWMuemFjQogIGlwY01haW4uaGFuZGxlKCdmYWNlOnVubWF0Y2gnLCBhc3luYyAoXywgZmFjZUlkOiBudW1iZXIpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZU1hdGNoaW5nU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9mYWNlTWF0Y2hpbmdTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IGZhY2VNYXRjaGluZ1NlcnZpY2UudW5tYXRjaEZhY2UoZmFjZUlkKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5Y+W5raI5Yy56YWN5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gZmFsc2UKICAgIH0KICB9KQoKICAvLyDlkIjlubbkurrniakKICBpcGNNYWluLmhhbmRsZSgnZmFjZTptZXJnZS1wZXJzb25zJywgYXN5bmMgKF8sIHNvdXJjZVBlcnNvbklkOiBudW1iZXIsIHRhcmdldFBlcnNvbklkOiBudW1iZXIpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZU1hdGNoaW5nU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9mYWNlTWF0Y2hpbmdTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IGZhY2VNYXRjaGluZ1NlcnZpY2UubWVyZ2VQZXJzb25zKHNvdXJjZVBlcnNvbklkLCB0YXJnZXRQZXJzb25JZCkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOWQiOW5tuS6uueJqeWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIG1lcmdlZDogMCwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOiOt+WPluWMuemFjee7n+iuoQogIGlwY01haW4uaGFuZGxlKCdmYWNlOmdldC1tYXRjaGluZy1zdGF0cycsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZU1hdGNoaW5nU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9mYWNlTWF0Y2hpbmdTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGZhY2VNYXRjaGluZ1NlcnZpY2UuZ2V0U3RhdHMoKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgcmV0dXJuIHsgdG90YWxGYWNlczogMCwgbWF0Y2hlZEZhY2VzOiAwLCB1bm1hdGNoZWRGYWNlczogMCwgbWF0Y2hSYXRlOiAwIH0KICAgIH0KICB9KQoKICAvLyA9PT09PT09PT09PT09PT09PT09PSDotKjph4/pqozor4Hnm7jlhbMgPT09PT09PT09PT09PT09PT09PT0KCiAgLy8g6aqM6K+B6IGa57G76LSo6YePCiAgaXBjTWFpbi5oYW5kbGUoJ3F1YWxpdHk6dmFsaWRhdGUtY2x1c3RlcmluZycsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcXVhbGl0eVZhbGlkYXRpb25TZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3F1YWxpdHlWYWxpZGF0aW9uU2VydmljZS5qcycpCiAgICAgIHJldHVybiBhd2FpdCBxdWFsaXR5VmFsaWRhdGlvblNlcnZpY2UudmFsaWRhdGVDbHVzdGVyaW5nKCkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOiBmuexu+i0qOmHj+mqjOivgeWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOa1i+ivleivreS5ieaQnOe0ogogIGlwY01haW4uaGFuZGxlKCdxdWFsaXR5OnRlc3Qtc2VtYW50aWMnLCBhc3luYyAoXywgcXVlcnk6IHN0cmluZykgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBxdWFsaXR5VmFsaWRhdGlvblNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvcXVhbGl0eVZhbGlkYXRpb25TZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IHF1YWxpdHlWYWxpZGF0aW9uU2VydmljZS50ZXN0U2VtYW50aWNTZWFyY2gocXVlcnkpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDor63kuYnmkJzntKLmtYvor5XlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyDov5DooYzmoIflh4bmtYvor5Xpm4YKICBpcGNNYWluLmhhbmRsZSgncXVhbGl0eTpydW4tdGVzdHMnLCBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHF1YWxpdHlWYWxpZGF0aW9uU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9xdWFsaXR5VmFsaWRhdGlvblNlcnZpY2UuanMnKQogICAgICByZXR1cm4gYXdhaXQgcXVhbGl0eVZhbGlkYXRpb25TZXJ2aWNlLnJ1blN0YW5kYXJkVGVzdHMoKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6L+Q6KGM5qCH5YeG5rWL6K+V5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBlcnJvcjogU3RyaW5nKGVycm9yKSB9CiAgICB9CiAgfSkKCiAgLy8g55Sf5oiQ5a6M5pW06LSo6YeP5oql5ZGKCiAgaXBjTWFpbi5oYW5kbGUoJ3F1YWxpdHk6Z2VuZXJhdGUtcmVwb3J0JywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBxdWFsaXR5VmFsaWRhdGlvblNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvcXVhbGl0eVZhbGlkYXRpb25TZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IHF1YWxpdHlWYWxpZGF0aW9uU2VydmljZS5nZW5lcmF0ZVJlcG9ydCgpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDnlJ/miJDotKjph4/miqXlkYrlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyDmo4Dmn6XlkJHph4/nu7TluqYKICBpcGNNYWluLmhhbmRsZSgncXVhbGl0eTpjaGVjay12ZWN0b3JzJywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBxdWFsaXR5VmFsaWRhdGlvblNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvcXVhbGl0eVZhbGlkYXRpb25TZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IHF1YWxpdHlWYWxpZGF0aW9uU2VydmljZS5jaGVja1ZlY3RvckRpbWVuc2lvbnMoKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5qOA5p+l5ZCR6YeP57u05bqm5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBlcnJvcjogU3RyaW5nKGVycm9yKSB9CiAgICB9CiAgfSkKCiAgLy8gPT09PT09PT09PT09PT09PT09PT0g5oCn6IO95rWL6K+V55u45YWzID09PT09PT09PT09PT09PT09PT09CgogIC8vIOa1i+ivleaQnOe0ouaAp+iDvQogIGlwY01haW4uaGFuZGxlKCdwZXJmOnRlc3Qtc2VhcmNoJywgYXN5bmMgKF8sIHF1ZXJ5Q291bnQ/OiBudW1iZXIpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcGVyZm9ybWFuY2VUZXN0U2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9wZXJmb3JtYW5jZVRlc3RTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IHBlcmZvcm1hbmNlVGVzdFNlcnZpY2UudGVzdFNlYXJjaFBlcmZvcm1hbmNlKHF1ZXJ5Q291bnQgfHwgNTApCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDmkJzntKLmgKfog73mtYvor5XlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyDmtYvor5XlhoXlrZjljaDnlKgKICBpcGNNYWluLmhhbmRsZSgncGVyZjp0ZXN0LW1lbW9yeScsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcGVyZm9ybWFuY2VUZXN0U2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9wZXJmb3JtYW5jZVRlc3RTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IHBlcmZvcm1hbmNlVGVzdFNlcnZpY2UudGVzdE1lbW9yeVVzYWdlKCkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOWGheWtmOa1i+ivleWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOa1i+ivleW5tuWPkQogIGlwY01haW4uaGFuZGxlKCdwZXJmOnRlc3QtY29uY3VycmVuY3knLCBhc3luYyAoXywgY29uY3VycmVudENvdW50PzogbnVtYmVyKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHBlcmZvcm1hbmNlVGVzdFNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvcGVyZm9ybWFuY2VUZXN0U2VydmljZS5qcycpCiAgICAgIHJldHVybiBhd2FpdCBwZXJmb3JtYW5jZVRlc3RTZXJ2aWNlLnRlc3RDb25jdXJyZW5jeShjb25jdXJyZW50Q291bnQgfHwgNSkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOW5tuWPkea1i+ivleWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOa1i+ivleaooeWei+WKoOi9vQogIGlwY01haW4uaGFuZGxlKCdwZXJmOnRlc3QtbW9kZWxzJywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBwZXJmb3JtYW5jZVRlc3RTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3BlcmZvcm1hbmNlVGVzdFNlcnZpY2UuanMnKQogICAgICByZXR1cm4gYXdhaXQgcGVyZm9ybWFuY2VUZXN0U2VydmljZS50ZXN0TW9kZWxMb2FkaW5nKCkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOaooeWei+WKoOi9vea1i+ivleWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOi/kOihjOWujOaVtOaAp+iDvea1i+ivlQogIGlwY01haW4uaGFuZGxlKCdwZXJmOnJ1bi1mdWxsJywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBwZXJmb3JtYW5jZVRlc3RTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3BlcmZvcm1hbmNlVGVzdFNlcnZpY2UuanMnKQogICAgICByZXR1cm4gYXdhaXQgcGVyZm9ybWFuY2VUZXN0U2VydmljZS5ydW5GdWxsVGVzdCgpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDlrozmlbTmgKfog73mtYvor5XlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyA9PT09PT09PT09PT09PT09PT09PSDkurrohLjlkJHph4/ph43mlrDnlJ/miJDnm7jlhbMgPT09PT09PT09PT09PT09PT09PT0KCiAgLy8g5byA5aeL6YeN5paw55Sf5oiQ5Lu75YqhCiAgaXBjTWFpbi5oYW5kbGUoJ2ZhY2U6cmVnZW5lcmF0ZS1zdGFydCcsIGFzeW5jIChldmVudCwgb3B0aW9uczogeyBiYXRjaFNpemU/OiBudW1iZXI7IHJlc3VtZT86IGJvb2xlYW4gfSkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBmYWNlRW1iZWRkaW5nUmVnZW5lcmF0b3IgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2NyaXB0cy9yZWdlbmVyYXRlRmFjZUVtYmVkZGluZ3MuanMnKQogICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmYWNlRW1iZWRkaW5nUmVnZW5lcmF0b3Iuc3RhcnQoewogICAgICAgIGJhdGNoU2l6ZTogb3B0aW9ucz8uYmF0Y2hTaXplIHx8IDUwLAogICAgICAgIHJlc3VtZUZyb21DaGVja3BvaW50OiBvcHRpb25zPy5yZXN1bWUgIT09IGZhbHNlLAogICAgICAgIG9uUHJvZ3Jlc3M6IChwcm9ncmVzcykgPT4gewogICAgICAgICAgZXZlbnQuc2VuZGVyLnNlbmQoJ2ZhY2U6cmVnZW5lcmF0ZS1wcm9ncmVzcycsIHByb2dyZXNzKQogICAgICAgIH0KICAgICAgfSkKICAgICAgcmV0dXJuIHJlc3VsdAogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5byA5aeL6YeN5paw55Sf5oiQ5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOaaguWBnOmHjeaWsOeUn+aIkOS7u+WKoQogIGlwY01haW4uaGFuZGxlKCdmYWNlOnJlZ2VuZXJhdGUtcGF1c2UnLCBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IGZhY2VFbWJlZGRpbmdSZWdlbmVyYXRvciB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zY3JpcHRzL3JlZ2VuZXJhdGVGYWNlRW1iZWRkaW5ncy5qcycpCiAgICAgIGZhY2VFbWJlZGRpbmdSZWdlbmVyYXRvci5wYXVzZSgpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5pqC5YGc6YeN5paw55Sf5oiQ5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOiOt+WPlumHjeaWsOeUn+aIkOi/m+W6pgogIGlwY01haW4uaGFuZGxlKCdmYWNlOnJlZ2VuZXJhdGUtcHJvZ3Jlc3MnLCBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IGZhY2VFbWJlZGRpbmdSZWdlbmVyYXRvciB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zY3JpcHRzL3JlZ2VuZXJhdGVGYWNlRW1iZWRkaW5ncy5qcycpCiAgICAgIHJldHVybiBmYWNlRW1iZWRkaW5nUmVnZW5lcmF0b3IuZ2V0UHJvZ3Jlc3MoKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6I635Y+W6YeN5paw55Sf5oiQ6L+b5bqm5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdGF0dXM6ICdlcnJvcicsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyDph43nva7ph43mlrDnlJ/miJDov5vluqYKICBpcGNNYWluLmhhbmRsZSgnZmFjZTpyZWdlbmVyYXRlLXJlc2V0JywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBmYWNlRW1iZWRkaW5nUmVnZW5lcmF0b3IgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2NyaXB0cy9yZWdlbmVyYXRlRmFjZUVtYmVkZGluZ3MuanMnKQogICAgICBmYWNlRW1iZWRkaW5nUmVnZW5lcmF0b3IucmVzZXQoKQogICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOmHjee9rumHjeaWsOeUn+aIkOWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyDmiafooYzph43mlrDogZrnsbsKICBpcGNNYWluLmhhbmRsZSgnZmFjZTpyZWdlbmVyYXRlLXJlY2x1c3RlcicsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZUVtYmVkZGluZ1JlZ2VuZXJhdG9yIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NjcmlwdHMvcmVnZW5lcmF0ZUZhY2VFbWJlZGRpbmdzLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IGZhY2VFbWJlZGRpbmdSZWdlbmVyYXRvci5yZWNsdXN0ZXIoKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6YeN5paw6IGa57G75aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOa4heeQhuepuuS6uueJqQogIGlwY01haW4uaGFuZGxlKCdmYWNlOmNsZWFudXAtcGVyc29ucycsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZmFjZUVtYmVkZGluZ1JlZ2VuZXJhdG9yIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NjcmlwdHMvcmVnZW5lcmF0ZUZhY2VFbWJlZGRpbmdzLmpzJykKICAgICAgcmV0dXJuIGZhY2VFbWJlZGRpbmdSZWdlbmVyYXRvci5jbGVhbnVwRW1wdHlQZXJzb25zKCkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOa4heeQhuepuuS6uueJqeWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgZGVsZXRlZDogMCwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vID09PT09PT09PT09PT09PT09PT09IOaJq+aPj+S7u+WKoeebuOWFsyA9PT09PT09PT09PT09PT09PT09PQoKICAvLyDojrflj5bmtLvot4Pmiavmj4/ku7vliqEKICBpcGNNYWluLmhhbmRsZSgnc2Nhbi1qb2I6Z2V0LWFjdGl2ZScsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGlmICghc2NhbkpvYlNlcnZpY2UpIHsKICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdTY2FuSm9iU2VydmljZSBub3QgYXZhaWxhYmxlJywgam9iOiBudWxsIH0KICAgICAgfQogICAgICBjb25zdCBqb2IgPSBzY2FuSm9iU2VydmljZS5nZXRBY3RpdmVKb2IoKQogICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBqb2IgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6I635Y+W5rS76LeD5omr5o+P5Lu75Yqh5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvciksIGpvYjogbnVsbCB9CiAgICB9CiAgfSkKCiAgLy8g5oGi5aSN5omr5o+P5Lu75YqhCiAgaXBjTWFpbi5oYW5kbGUoJ3NjYW4tam9iOnJlc3VtZScsIGFzeW5jIChldmVudCwgam9iSWQ6IHN0cmluZykgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKCFzY2FuSm9iU2VydmljZSB8fCAhZGF0YWJhc2UpIHsKICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdTZXJ2aWNlcyBub3QgYXZhaWxhYmxlJyB9CiAgICAgIH0KCiAgICAgIGNvbnN0IGpvYiA9IHNjYW5Kb2JTZXJ2aWNlLmdldEpvYkJ5SWQoam9iSWQpCiAgICAgIGlmICgham9iKSB7CiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnSm9iIG5vdCBmb3VuZCcgfQogICAgICB9CgogICAgICBpZiAoam9iLnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcgfHwgam9iLnN0YXR1cyA9PT0gJ2ZhaWxlZCcgfHwgam9iLnN0YXR1cyA9PT0gJ2NhbmNlbGxlZCcpIHsKICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdKb2IgaXMgbm90IHJlc3VtYWJsZScsIHN0YXR1czogam9iLnN0YXR1cyB9CiAgICAgIH0KCiAgICAgIC8vIOajgOafpeaYr+WQpui/h+acnwogICAgICBpZiAoc2NhbkpvYlNlcnZpY2UuaXNKb2JTdGFsZShqb2IpKSB7CiAgICAgICAgc2NhbkpvYlNlcnZpY2UubWFya0pvYkFzRmFpbGVkKGpvYklkKQogICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0pvYiBpcyBzdGFsZSAoPjVtaW4gbm8gaGVhcnRiZWF0KSwgbWFya2VkIGFzIGZhaWxlZCcgfQogICAgICB9CgogICAgICBjb25zb2xlLmxvZyhgW0lQQ10g5oGi5aSN5omr5o+P5Lu75YqhOiAke2pvYklkfSwg5LuOIGxhc3RQcm9jZXNzZWRJZDogJHtqb2IubGFzdFByb2Nlc3NlZElkfWApCgogICAgICAvLyDkvb/nlKggRmFjZURldGVjdGlvblF1ZXVlIOS7juaWreeCuee7reS8oAogICAgICBjb25zdCB7IEZhY2VEZXRlY3Rpb25RdWV1ZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9mYWNlRGV0ZWN0aW9uUXVldWUuanMnKQogICAgICBjb25zdCBxdWV1ZSA9IG5ldyBGYWNlRGV0ZWN0aW9uUXVldWUoZGF0YWJhc2UsIHsKICAgICAgICBtYXhDb25jdXJyZW50OiAxLAogICAgICAgIG9uUHJvZ3Jlc3M6IChwcm9ncmVzcykgPT4gewogICAgICAgICAgaWYgKG1haW5XaW5kb3cpIHsKICAgICAgICAgICAgbWFpbldpbmRvdy53ZWJDb250ZW50cy5zZW5kKCdmYWNlOnByb2dyZXNzJywgewogICAgICAgICAgICAgIGN1cnJlbnQ6IHByb2dyZXNzLmNvbXBsZXRlZCwKICAgICAgICAgICAgICB0b3RhbDogcHJvZ3Jlc3MudG90YWwsCiAgICAgICAgICAgICAgcGVyY2VudDogcHJvZ3Jlc3MudG90YWwgPiAwID8gTWF0aC5yb3VuZCgocHJvZ3Jlc3MuY29tcGxldGVkIC8gcHJvZ3Jlc3MudG90YWwpICogMTAwKSA6IDAsCiAgICAgICAgICAgICAgc3RhdHVzOiBwcm9ncmVzcy5zdGF0dXMKICAgICAgICAgICAgfSkKICAgICAgICAgIH0KICAgICAgICB9LAogICAgICAgIG9uQ29tcGxldGU6IChzdGF0cykgPT4gewogICAgICAgICAgY29uc29sZS5sb2coYFtJUENdIOaBouWkjeaJq+aPj+WujOaIkDogJHtzdGF0cy5jb21wbGV0ZWR9LyR7c3RhdHMudG90YWx9LCDmo4DmtYvliLAgJHtzdGF0cy5kZXRlY3RlZEZhY2VzfSDlvKDkurrohLhgKQogICAgICAgICAgaWYgKG1haW5XaW5kb3cpIHsKICAgICAgICAgICAgbWFpbldpbmRvdy53ZWJDb250ZW50cy5zZW5kKCdmYWNlOnNjYW4tY29tcGxldGUnLCB7CiAgICAgICAgICAgICAgdG90YWw6IHN0YXRzLnRvdGFsLAogICAgICAgICAgICAgIGNvbXBsZXRlZDogc3RhdHMuY29tcGxldGVkLAogICAgICAgICAgICAgIGZhaWxlZDogc3RhdHMuZmFpbGVkLAogICAgICAgICAgICAgIGRldGVjdGVkRmFjZXM6IHN0YXRzLmRldGVjdGVkRmFjZXMKICAgICAgICAgICAgfSkKICAgICAgICAgIH0KICAgICAgICB9CiAgICAgIH0pCgogICAgICAvLyDorr7nva7lvZPliY3ku7vliqFJRAogICAgICBxdWV1ZS5zdGFydFNjYW5Kb2Ioam9iLnRvdGFsUGhvdG9zKQoKICAgICAgLy8g5LuO5pat54K557ut5LygCiAgICAgIGNvbnN0IGFkZGVkQ291bnQgPSBhd2FpdCBxdWV1ZS5yZXN1bWVGcm9tQ2hlY2twb2ludChqb2IubGFzdFByb2Nlc3NlZElkIHx8IDAsIDEwMDApCgogICAgICBpZiAoYWRkZWRDb3VudCA9PT0gMCkgewogICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdObyBtb3JlIHBob3RvcyB0byBwcm9jZXNzJywgYWRkZWRDb3VudDogMCB9CiAgICAgIH0KCiAgICAgIC8vIOWQr+WKqOWkhOeQhgogICAgICBhd2FpdCBxdWV1ZS5mb3JjZVN0YXJ0KCkKCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdKb2IgcmVzdW1lZCcsIGFkZGVkQ291bnQsIGpvYklkIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOaBouWkjeaJq+aPj+S7u+WKoeWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0KICAgIH0KICB9KQoKICAvLyDojrflj5bmiavmj4/ku7vliqHnu5/orqEKICBpcGNNYWluLmhhbmRsZSgnc2Nhbi1qb2I6Z2V0LXN0YXRzJywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgaWYgKCFzY2FuSm9iU2VydmljZSkgewogICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ1NjYW5Kb2JTZXJ2aWNlIG5vdCBhdmFpbGFibGUnIH0KICAgICAgfQogICAgICBjb25zdCBzdGF0cyA9IHNjYW5Kb2JTZXJ2aWNlLmdldFN0YXRzKCkKICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgc3RhdHMgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6I635Y+W5omr5o+P5Lu75Yqh57uf6K6h5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfQogICAgfQogIH0pCgogIC8vIOiOt+WPluaJgOacieaJq+aPj+S7u+WKoQogIGlwY01haW4uaGFuZGxlKCdzY2FuLWpvYjpnZXQtYWxsJywgYXN5bmMgKF8sIGxpbWl0PzogbnVtYmVyKSA9PiB7CiAgICB0cnkgewogICAgICBpZiAoIXNjYW5Kb2JTZXJ2aWNlKSB7CiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnU2NhbkpvYlNlcnZpY2Ugbm90IGF2YWlsYWJsZScsIGpvYnM6IFtdIH0KICAgICAgfQogICAgICBjb25zdCBqb2JzID0gc2NhbkpvYlNlcnZpY2UuZ2V0QWxsSm9icyhsaW1pdCB8fCAxMDApCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGpvYnMgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6I635Y+W5omr5o+P5Lu75Yqh5YiX6KGo5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvciksIGpvYnM6IFtdIH0KICAgIH0KICB9KQoKICAvLyA9PT09PT09PT09PT09PT09PT09PSDkurrnianmkJzntKLnm7jlhbMgPT09PT09PT09PT09PT09PT09PT0KCiAgLy8g5pCc57Si5Lq654mpCiAgaXBjTWFpbi5oYW5kbGUoJ3Blb3BsZTpzZWFyY2gnLCBhc3luYyAoXywgb3B0aW9uczogeyBxdWVyeTogc3RyaW5nOyBsaW1pdD86IG51bWJlcjsgb2Zmc2V0PzogbnVtYmVyOyBzb3J0Qnk/OiAnY291bnQnIHwgJ3JlY2VudCcgfCAnb2xkZXN0JyB9KSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHBlcnNvblNlYXJjaFNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvcGVyc29uU2VhcmNoU2VydmljZS5qcycpCiAgICAgIHJldHVybiBhd2FpdCBwZXJzb25TZWFyY2hTZXJ2aWNlLnNlYXJjaChvcHRpb25zKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g5pCc57Si5Lq654mp5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyByZXN1bHRzOiBbXSwgdG90YWw6IDAsIHF1ZXJ5OiBvcHRpb25zLnF1ZXJ5LCBwcm9jZXNzaW5nVGltZU1zOiAwIH0KICAgIH0KICB9KQoKICAvLyDojrflj5bkurrniannhafniYcKICBpcGNNYWluLmhhbmRsZSgncGVvcGxlOmdldC1waG90b3MnLCBhc3luYyAoXywgZmlsdGVyOiB7IHBlcnNvbklkOiBudW1iZXI7IHllYXI/OiBudW1iZXI7IG1vbnRoPzogbnVtYmVyOyBsaW1pdD86IG51bWJlcjsgb2Zmc2V0PzogbnVtYmVyIH0pID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcGVyc29uU2VhcmNoU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9wZXJzb25TZWFyY2hTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIGF3YWl0IHBlcnNvblNlYXJjaFNlcnZpY2UuZ2V0UGVyc29uUGhvdG9zKGZpbHRlcikKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ1tJUENdIOiOt+WPluS6uueJqeeFp+eJh+Wksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIG51bGwKICAgIH0KICB9KQoKICAvLyDojrflj5bkurrnianml7bpl7Tnur8KICBpcGNNYWluLmhhbmRsZSgncGVvcGxlOmdldC10aW1lbGluZScsIGFzeW5jIChfLCBwZXJzb25JZDogbnVtYmVyKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHBlcnNvblNlYXJjaFNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvcGVyc29uU2VhcmNoU2VydmljZS5qcycpCiAgICAgIHJldHVybiBhd2FpdCBwZXJzb25TZWFyY2hTZXJ2aWNlLmdldFBlcnNvblRpbWVsaW5lKHBlcnNvbklkKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcignW0lQQ10g6I635Y+W5pe26Ze057q/5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4ge30KICAgIH0KICB9KQoKICAvLyDojrflj5bmkJzntKLlu7rorq4KICBpcGNNYWluLmhhbmRsZSgncGVvcGxlOmdldC1zdWdnZXN0aW9ucycsIGFzeW5jIChfLCBxdWVyeTogc3RyaW5nLCBsaW1pdD86IG51bWJlcikgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBwZXJzb25TZWFyY2hTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3BlcnNvblNlYXJjaFNlcnZpY2UuanMnKQogICAgICByZXR1cm4gcGVyc29uU2VhcmNoU2VydmljZS5nZXRTdWdnZXN0aW9ucyhxdWVyeSwgbGltaXQpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDojrflj5blu7rorq7lpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiBbXQogICAgfQogIH0pCgogIC8vIOiOt+WPlueDremXqOS6uueJqQogIGlwY01haW4uaGFuZGxlKCdwZW9wbGU6Z2V0LXBvcHVsYXInLCBhc3luYyAoXywgbGltaXQ/OiBudW1iZXIpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcGVyc29uU2VhcmNoU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9wZXJzb25TZWFyY2hTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIHBlcnNvblNlYXJjaFNlcnZpY2UuZ2V0UG9wdWxhclBlcnNvbnMobGltaXQpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCdbSVBDXSDojrflj5bng63pl6jkurrnianlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiBbXQogICAgfQogIH0pCgogIC8vIOiOt+WPluS6uueJqee7n+iuoQogIGlwY01haW4uaGFuZGxlKCdwZW9wbGU6Z2V0LXNlYXJjaC1zdGF0cycsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcGVyc29uU2VhcmNoU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9wZXJzb25TZWFyY2hTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIHBlcnNvblNlYXJjaFNlcnZpY2UuZ2V0U3RhdHMoKQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgcmV0dXJuIHsgdG90YWxQZXJzb25zOiAwLCB0b3RhbFRhZ2dlZFBob3RvczogMCwgYXZnUGhvdG9zUGVyUGVyc29uOiAwIH0KICAgIH0KICB9KQoKICAvLyDojrflj5bmkJzntKLljoblj7IKICBpcGNNYWluLmhhbmRsZSgncGVvcGxlOmdldC1zZWFyY2gtaGlzdG9yeScsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgcGVyc29uU2VhcmNoU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9zZXJ2aWNlcy9wZXJzb25TZWFyY2hTZXJ2aWNlLmpzJykKICAgICAgcmV0dXJuIHBlcnNvblNlYXJjaFNlcnZpY2UuZ2V0U2VhcmNoSGlzdG9yeSgpCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICByZXR1cm4gW10KICAgIH0KICB9KQoKICAvLyDmt7vliqDmkJzntKLljoblj7IKICBpcGNNYWluLmhhbmRsZSgncGVvcGxlOmFkZC1zZWFyY2gtaGlzdG9yeScsIGFzeW5jIChfLCBxdWVyeTogc3RyaW5nKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHBlcnNvblNlYXJjaFNlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnLi4vc2VydmljZXMvcGVyc29uU2VhcmNoU2VydmljZS5qcycpCiAgICAgIHBlcnNvblNlYXJjaFNlcnZpY2UuYWRkVG9IaXN0b3J5KHF1ZXJ5KQogICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH0KICAgIH0KICB9KQoKICAvLyDmuIXnqbrmkJzntKLljoblj7IKICBpcGNNYWluLmhhbmRsZSgncGVvcGxlOmNsZWFyLXNlYXJjaC1oaXN0b3J5JywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyBwZXJzb25TZWFyY2hTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL3NlcnZpY2VzL3BlcnNvblNlYXJjaFNlcnZpY2UuanMnKQogICAgICBwZXJzb25TZWFyY2hTZXJ2aWNlLmNsZWFySGlzdG9yeSgpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UgfQogICAgfQogIH0pCgogIC8vID09PT09PT09PT09PT09PT09PT09IOmFjee9ruebuOWFsyA9PT09PT09PT09PT09PT09PT09PQoKICAvLyDojrflj5blupTnlKjphY3nva4KICBpcGNNYWluLmhhbmRsZSgnY29uZmlnOmdldCcsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBnZXRDb25maWdTZXJ2aWNlKCkKICAgICAgcmV0dXJuIGNvbmZpZ1NlcnZpY2UuZ2V0Q29uZmlnKCkKICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ+iOt+WPlumFjee9ruWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIG51bGwKICAgIH0KICB9KQoKICAvLyDorr7nva4gQVBJIEtleQogIGlwY01haW4uaGFuZGxlKCdjb25maWc6c2V0LWFwaS1rZXknLCBhc3luYyAoZXZlbnQsIGFwaUtleTogc3RyaW5nKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCBjb25maWdTZXJ2aWNlID0gZ2V0Q29uZmlnU2VydmljZSgpCiAgICAgIGNvbmZpZ1NlcnZpY2Uuc2V0QXBpS2V5KGFwaUtleSkKICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCforr7nva4gQVBJIEtleSDlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0KICAgIH0KICB9KQoKICAvLyDojrflj5YgTExNIOmFjee9rueKtuaAgQogIGlwY01haW4uaGFuZGxlKCdjb25maWc6Z2V0LWxsbS1zdGF0dXMnLCBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCBjb25maWdTZXJ2aWNlID0gZ2V0Q29uZmlnU2VydmljZSgpCiAgICAgIGNvbnN0IGNvbmZpZyA9IGNvbmZpZ1NlcnZpY2UuZ2V0TExNQ29uZmlnKCkKICAgICAgcmV0dXJuIHsKICAgICAgICBjb25maWd1cmVkOiBjb25maWdTZXJ2aWNlLmlzTExNQ29uZmlndXJlZCgpLAogICAgICAgIHByb3ZpZGVyOiBjb25maWcucHJvdmlkZXIsCiAgICAgICAgaGFzQXBpS2V5OiAhIWNvbmZpZy5hcGlLZXkKICAgICAgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcign6I635Y+WIExMTSDnirbmgIHlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IGNvbmZpZ3VyZWQ6IGZhbHNlLCBwcm92aWRlcjogJ25vbmUnLCBoYXNBcGlLZXk6IGZhbHNlIH0KICAgIH0KICB9KQoKICAvLyDorr7nva7kuLvpopgKICBpcGNNYWluLmhhbmRsZSgnY29uZmlnOnNldC10aGVtZScsIGFzeW5jIChldmVudCwgdGhlbWU6IHN0cmluZykgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgY29uZmlnU2VydmljZSA9IGdldENvbmZpZ1NlcnZpY2UoKQogICAgICBjb25maWdTZXJ2aWNlLnNldFRoZW1lKHRoZW1lIGFzICdsaWdodCcgfCAnZGFyaycgfCAnc3lzdGVtJykKICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCforr7nva7kuLvpopjlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlIH0KICAgIH0KICB9KQoKICAvLyA9PT09PT09PT09PT09PT09PT09PSDmkJzntKLlu7rorq7nm7jlhbMgPT09PT09PT09PT09PT09PT09PT0KCiAgLy8g6I635Y+W5pCc57Si5bu66K6uCiAgaXBjTWFpbi5oYW5kbGUoJ3N1Z2dlc3Rpb25zOmdldCcsIGFzeW5jIChldmVudCwgcXVlcnk6IHN0cmluZykgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3Qgc3VnZ2VzdGlvbnMgPSBzdWdnZXN0aW9uU2VydmljZT8uZ2V0U3VnZ2VzdGlvbnMocXVlcnkpIHx8IFtdCiAgICAgIHJldHVybiBzdWdnZXN0aW9ucwogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcign6I635Y+W5pCc57Si5bu66K6u5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gW10KICAgIH0KICB9KQoKICAvLyDmt7vliqDmkJzntKLliLDljoblj7IKICBpcGNNYWluLmhhbmRsZSgnc3VnZ2VzdGlvbnM6YWRkLWhpc3RvcnknLCBhc3luYyAoZXZlbnQsIHF1ZXJ5OiBzdHJpbmcsIHJlc3VsdENvdW50OiBudW1iZXIpID0+IHsKICAgIHRyeSB7CiAgICAgIHN1Z2dlc3Rpb25TZXJ2aWNlPy5hZGRUb0hpc3RvcnkocXVlcnksIHJlc3VsdENvdW50KQogICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH0KICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgIGNvbnNvbGUuZXJyb3IoJ+a3u+WKoOaQnOe0ouWOhuWPsuWksei0pTonLCBlcnJvcikKICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UgfQogICAgfQogIH0pCgogIC8vIOiOt+WPluaQnOe0ouWOhuWPsgogIGlwY01haW4uaGFuZGxlKCdzdWdnZXN0aW9uczpnZXQtaGlzdG9yeScsIGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIHJldHVybiBzdWdnZXN0aW9uU2VydmljZT8uZ2V0SGlzdG9yeSgpIHx8IFtdCiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zb2xlLmVycm9yKCfojrflj5bmkJzntKLljoblj7LlpLHotKU6JywgZXJyb3IpCiAgICAgIHJldHVybiBbXQogICAgfQogIH0pCgogIC8vIOa4heepuuaQnOe0ouWOhuWPsgogIGlwY01haW4uaGFuZGxlKCdzdWdnZXN0aW9uczpjbGVhci1oaXN0b3J5JywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgc3VnZ2VzdGlvblNlcnZpY2U/LmNsZWFySGlzdG9yeSgpCiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcign5riF56m65pCc57Si5Y6G5Y+y5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSB9CiAgICB9CiAgfSkKCiAgLy8g6I635Y+W54Ot6Zeo5pCc57SiCiAgaXBjTWFpbi5oYW5kbGUoJ3N1Z2dlc3Rpb25zOmdldC1wb3B1bGFyJywgYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgcmV0dXJuIHN1Z2dlc3Rpb25TZXJ2aWNlPy5nZXRQb3B1bGFyU2VhcmNoZXMoKSB8fCBbXQogICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgY29uc29sZS5lcnJvcign6I635Y+W54Ot6Zeo5pCc57Si5aSx6LSlOicsIGVycm9yKQogICAgICByZXR1cm4gW10KICAgIH0KICB9KQoKICAvLyA9PT09PT09PT09PT09PT09PT09PSDns7vnu5/nm7jlhbMgPT09PT09PT09PT09PT09PT09PT0KCiAgLy8g6I635Y+W5bqU55So54mI5pysCiAgaXBjTWFpbi5oYW5kbGUoJ2FwcDpnZXQtdmVyc2lvbicsICgpID0+IHsKICAgIHJldHVybiBhcHAuZ2V0VmVyc2lvbigpCiAgfSkKCiAgLy8g5pyA5bCP5YyW56qX5Y+jCiAgaXBjTWFpbi5oYW5kbGUoJ3dpbmRvdzptaW5pbWl6ZScsICgpID0+IHsKICAgIG1haW5XaW5kb3c/Lm1pbmltaXplKCkKICB9KQoKICAvLyDmnIDlpKfljJYv6L+Y5Y6f56qX5Y+jCiAgaXBjTWFpbi5oYW5kbGUoJ3dpbmRvdzptYXhpbWl6ZScsICgpID0+IHsKICAgIGlmIChtYWluV2luZG93KSB7CiAgICAgIGlmIChtYWluV2luZG93LmlzTWF4aW1pemVkKCkpIHsKICAgICAgICBtYWluV2luZG93LnVubWF4aW1pemUoKQogICAgICB9IGVsc2UgewogICAgICAgIG1haW5XaW5kb3cubWF4aW1pemUoKQogICAgICB9CiAgICB9CiAgfSkKCiAgLy8g5YWz6Zet56qX5Y+jCiAgaXBjTWFpbi5oYW5kbGUoJ3dpbmRvdzpjbG9zZScsICgpID0+IHsKICAgIG1haW5XaW5kb3c/LmNsb3NlKCkKICB9KQoKICBjb25zb2xlLmxvZygnSVBDIOWkhOeQhueoi+W6j+W3suazqOWGjCcpCn0KCi8vID09PT09PT09PT09PT09PT09PT09IOaooeaLn+aVsOaNrueUn+aIkOWZqCA9PT09PT09PT09PT09PT09PT09PQoKZnVuY3Rpb24gZ2VuZXJhdGVNb2NrUGhvdG9zKGxpbWl0OiBudW1iZXIsIG9mZnNldDogbnVtYmVyKTogYW55W10gewogIGNvbnN0IHBob3RvczogYW55W10gPSBbXQogIGNvbnN0IGxvY2F0aW9ucyA9IFsKICAgIHsgbmFtZTogJ+aXpeacrOS4nOS6rCcsIGxhdDogMzUuNjc2MiwgbG5nOiAxMzkuNjUwMyB9LAogICAgeyBuYW1lOiAn5paw55aG5LmM6bKB5pyo6b2QJywgbGF0OiA0My44MjU2LCBsbmc6IDg3LjYxNjggfSwKICAgIHsgbmFtZTogJ+WMl+S6rCcsIGxhdDogMzkuOTA0MiwgbG5nOiAxMTYuNDA3NCB9LAogICAgeyBuYW1lOiAn5LiK5rW3JywgbGF0OiAzMS4yMzA0LCBsbmc6IDEyMS40NzM3IH0sCiAgICB7IG5hbWU6ICflrrbph4wnLCBsYXQ6IDM5LjkwNDIsIGxuZzogMTE2LjQwNzQgfQogIF0KCiAgZm9yIChsZXQgaSA9IG9mZnNldDsgaSA8IG9mZnNldCArIGxpbWl0OyBpKyspIHsKICAgIGNvbnN0IHllYXIgPSAyMDE1ICsgTWF0aC5mbG9vcihpIC8gMTAwKQogICAgY29uc3QgbW9udGggPSAoaSAlIDEyKSArIDEKICAgIGNvbnN0IGRheSA9IChpICUgMjgpICsgMQoKICAgIHBob3Rvcy5wdXNoKHsKICAgICAgaWQ6IGksCiAgICAgIHV1aWQ6IGBwaG90by0ke2l9YCwKICAgICAgY2xvdWRJZDogYGNsb3VkLSR7aX1gLAogICAgICBmaWxlTmFtZTogYElNR18ke3llYXJ9JHtTdHJpbmcobW9udGgpLnBhZFN0YXJ0KDIsICcwJyl9JHtTdHJpbmcoZGF5KS5wYWRTdGFydCgyLCAnMCcpfV8ke2l9LmpwZ2AsCiAgICAgIGZpbGVTaXplOiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiA1MDAwMDAwKSArIDEwMDAwMDAsCiAgICAgIHdpZHRoOiA0MDMyLAogICAgICBoZWlnaHQ6IDMwMjQsCiAgICAgIHRha2VuQXQ6IGAke3llYXJ9LSR7U3RyaW5nKG1vbnRoKS5wYWRTdGFydCgyLCAnMCcpfS0ke1N0cmluZyhkYXkpLnBhZFN0YXJ0KDIsICcwJyl9VDEwOjMwOjAwWmAsCiAgICAgIGV4aWY6IHsKICAgICAgICBjYW1lcmE6ICdpUGhvbmUgMTUgUHJvIE1heCcsCiAgICAgICAgbGVuczogJ2YvMS44JywKICAgICAgICBpc286IDEwMCwKICAgICAgICBhcGVydHVyZTogMS44LAogICAgICAgIHNodXR0ZXJTcGVlZDogJzEvMTIwJwogICAgICB9LAogICAgICBsb2NhdGlvbjogbG9jYXRpb25zW2kgJSBsb2NhdGlvbnMubGVuZ3RoXSwKICAgICAgc3RhdHVzOiAnaWNsb3VkJywKICAgICAgdGh1bWJuYWlsUGF0aDogbnVsbAogICAgfSkKICB9CgogIHJldHVybiBwaG90b3MKfQoKZnVuY3Rpb24gZ2VuZXJhdGVNb2NrUGVvcGxlKCk6IGFueVtdIHsKICByZXR1cm4gWwogICAgeyBpZDogMSwgbmFtZTogJ+eIuOeIuCcsIGZhY2VfY291bnQ6IDE1NiB9LAogICAgeyBpZDogMiwgbmFtZTogJ+WmiOWmiCcsIGZhY2VfY291bnQ6IDE0MiB9LAogICAgeyBpZDogMywgbmFtZTogJ+WEv+WtkCcsIGZhY2VfY291bnQ6IDg5IH0sCiAgICB7IGlkOiA0LCBuYW1lOiAn5oiRJywgZmFjZV9jb3VudDogMjM0IH0sCiAgICB7IGlkOiA1LCBuYW1lOiAn54i354i35aW25aW2JywgZmFjZV9jb3VudDogNjcgfQogIF0KfQoKZnVuY3Rpb24gZ2VuZXJhdGVNb2NrUGxhY2VzKCk6IGFueVtdIHsKICByZXR1cm4gWwogICAgeyBwbGFjZV9uYW1lOiAn5pel5pys5Lic5LqsJywgcGhvdG9fY291bnQ6IDI0NSB9LAogICAgeyBwbGFjZV9uYW1lOiAn5paw55aGJywgcGhvdG9fY291bnQ6IDE4OSB9LAogICAgeyBwbGFjZV9uYW1lOiAn5YyX5LqsJywgcGhvdG9fY291bnQ6IDE1NiB9LAogICAgeyBwbGFjZV9uYW1lOiAn5LiK5rW3JywgcGhvdG9fY291bnQ6IDk4IH0sCiAgICB7IHBsYWNlX25hbWU6ICflrrbph4wnLCBwaG90b19jb3VudDogNDIzIH0KICBdCn0KCmZ1bmN0aW9uIGdlbmVyYXRlTW9ja0FsYnVtcygpOiBhbnlbXSB7CiAgcmV0dXJuIFsKICAgIHsgaWQ6ICdzbWFydC1wbGFjZXMnLCBuYW1lOiAn5oyJ5Zyw54K55rWP6KeIJywgdHlwZTogJ3NtYXJ0JywgaXRlbXM6IGdlbmVyYXRlTW9ja1BsYWNlcygpIH0sCiAgICB7IGlkOiAnc21hcnQtcGVvcGxlJywgbmFtZTogJ+aMieS6uueJqea1j+iniCcsIHR5cGU6ICdzbWFydCcsIGl0ZW1zOiBnZW5lcmF0ZU1vY2tQZW9wbGUoKSB9CiAgXQp9CgovKioKICog5LuO5paH5Lu26Lev5b6E5o+Q5Y+W54Wn54mHIFVVSUQKICovCmZ1bmN0aW9uIGV4dHJhY3RQaG90b1V1aWRGcm9tUGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHsKICAvLyDlgYforr7ot6/lvoTmoLzlvI86IC9wYXRoL3RvL3Bob3Rvcy97VVVJRH0ve2ZpbGVuYW1lfQogIGNvbnN0IG1hdGNoID0gcGF0aC5tYXRjaCgvKFswLTlhLWZdezh9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezR9LVswLTlhLWZdezEyfSkvaSkKICByZXR1cm4gbWF0Y2ggPyBtYXRjaFsxXSA6IG51bGwKfQoKLy8gPT09PT09PT09PT09PT09PT09PT0g5bqU55So55Sf5ZG95ZGo5pyfID09PT09PT09PT09PT09PT09PT09CgphcHAud2hlblJlYWR5KCkudGhlbihhc3luYyAoKSA9PiB7CiAgLy8g5rOo5YaM6Ieq5a6a5LmJ5Y2P6K6u77yI5b+F6aG75Zyo5Yib5bu656qX5Y+j5LmL5YmN77yJCiAgcmVnaXN0ZXJMb2NhbFJlc291cmNlUHJvdG9jb2woKQoKICAvLyDliJvlu7rnqpflj6PliY3lhYjliJ3lp4vljJbmnI3liqEKICBhd2FpdCBpbml0U2VydmljZXMoKQoKICAvLyDwn4aVIOajgOafpeW5tuaBouWkjeacquWujOaIkOeahOaJq+aPj+S7u+WKoQogIGF3YWl0IGNoZWNrQW5kUmVjb3ZlclNjYW5Kb2IoKQoKICBzZXR1cElQQ0hhbmRsZXJzKCkKICBjcmVhdGVXaW5kb3coKQoKICBhcHAub24oJ2FjdGl2YXRlJywgKCkgPT4gewogICAgaWYgKEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpLmxlbmd0aCA9PT0gMCkgewogICAgICBjcmVhdGVXaW5kb3coKQogICAgfQogIH0pCn0pCgphcHAub24oJ3dpbmRvdy1hbGwtY2xvc2VkJywgKCkgPT4gewogIC8vIOWFs+mXreaVsOaNruW6k+i/nuaOpQogIGRhdGFiYXNlPy5jbG9zZSgpCgogIGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSAnZGFyd2luJykgewogICAgYXBwLnF1aXQoKQogIH0KfSkKCmFwcC5vbignYmVmb3JlLXF1aXQnLCAoKSA9PiB7CiAgZGF0YWJhc2U/LmNsb3NlKCkKfSkKCi8vIOacquaNleiOt+eahOW8guW4uOWkhOeQhgpwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIChlcnJvcikgPT4gewogIGNvbnNvbGUuZXJyb3IoJ+acquaNleiOt+eahOW8guW4uDonLCBlcnJvcikKfSkKCnByb2Nlc3Mub24oJ3VuaGFuZGxlZFJlamVjdGlvbicsIChyZWFzb24sIHByb21pc2UpID0+IHsKICBjb25zb2xlLmVycm9yKCfmnKrlpITnkIbnmoQgUHJvbWlzZSDmi5Lnu506JywgcmVhc29uKQp9KQo=", import.meta.url));
    }
  } catch {
  }
  return process.cwd();
})();
global.activeScanJob = null;
let mainWindow = null;
let database = null;
let iCloudService = null;
let searchService = null;
let localPhotoService = null;
let configService = null;
let thumbnailSvc = null;
let suggestionSvc = null;
const isDev = !app.isPackaged;
function registerLocalResourceProtocol() {
  protocol.handle("local-resource", async (request) => {
    try {
      const url = request.url.replace(/^local-resource:\/\//, "");
      const decodedUrl = decodeURIComponent(url);
      console.log(`[local-resource] 请求: ${decodedUrl}`);
      const fs = await import("fs");
      if (!fs.existsSync(decodedUrl)) {
        console.error(`[local-resource] 文件不存在: ${decodedUrl}`);
        return new Response("File not found", { status: 404 });
      }
      console.log(`[local-resource] 文件存在，返回: ${decodedUrl.substring(0, 60)}...`);
      return await net.fetch("file://" + decodedUrl);
    } catch (error) {
      console.error("[local-resource] 处理失败:", error);
      return new Response("Not found", { status: 404 });
    }
  });
  console.log("✓ 自定义协议 local-resource:// 已注册 (handle API)");
}
function getRendererPath() {
  if (isDev) {
    {
      console.log("[Main] 开发模式：使用 Forge URL:", "http://localhost:5173");
      return "http://localhost:5173";
    }
  }
  const prodPath = resolve(__dirname$1, "../../renderer/main_window/index.html");
  console.log("[Main] 生产模式：加载本地文件:", prodPath);
  return prodPath;
}
function getPreloadPath() {
  if (typeof MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY !== "undefined") {
    return MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY;
  }
  return resolve(process.cwd(), ".vite/build/preload/index.js");
}
function createWindow() {
  const cspPolicy = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": ["'self'", "data:", "blob:", "https:", "local-resource:"],
    "font-src": ["'self'", "https://fonts.gstatic.com"],
    "connect-src": ["'self'", "http://localhost:*", "https://huggingface.co", "https://cdn.jsdelivr.net"]
  };
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      // 生产环境建议设为 true
      allowRunningInsecureContent: false
    },
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#ffffff",
      symbolColor: "#5E6AD2",
      height: 40
    },
    backgroundColor: "#f5f5f7",
    show: false,
    frame: false
  });
  if (isDev) {
    mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
      (details, callback) => {
        callback({ requestHeaders: details.requestHeaders });
      }
    );
  } else {
    mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
      (details, callback) => {
        const cspHeader = Object.entries(cspPolicy).map(([key, values]) => `${key} ${values.join(" ")}`).join("; ");
        callback({
          requestHeaders: {
            ...details.requestHeaders,
            "Content-Security-Policy": cspHeader
          }
        });
      }
    );
  }
  const rendererUrl = getRendererPath();
  console.log("[Main] Loading renderer from:", rendererUrl);
  mainWindow.loadURL(rendererUrl).catch((err) => {
    console.error("[Main] Failed to load URL:", err);
  });
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
  mainWindow.once("ready-to-show", () => {
    console.log("[Main] Window ready to show");
    mainWindow?.show();
    mainWindow?.focus();
  });
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error("[Main] Failed to load:", errorCode, errorDescription);
  });
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log("[Main] Force showing window after 3s");
      mainWindow.show();
      mainWindow.focus();
    }
  }, 3e3);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
async function initServices() {
  console.log("正在初始化服务...");
  try {
    configService = new ConfigService();
    console.log("✓ 配置服务初始化完成");
    database = new PhotoDatabase();
    await database.init();
    console.log("✓ 数据库初始化完成");
    searchService = new SearchService(database);
    console.log("✓ 搜索服务初始化完成");
    thumbnailSvc = thumbnailService;
    await thumbnailSvc.init();
    console.log("✓ 缩略图服务初始化完成");
    suggestionSvc = suggestionService;
    console.log("✓ 搜索建议服务初始化完成");
    if (database) {
      iCloudService = new ICloudService(database);
      const initialized = await iCloudService.initialize("");
      if (initialized) {
        console.log("✓ iCloud 服务初始化完成");
      } else {
        console.log("✓ iCloud 服务已就绪（使用模拟数据）");
      }
      localPhotoService = new LocalPhotoService(database, thumbnailSvc);
      console.log("✓ 本地照片服务初始化完成");
      initializeImportService(database);
      console.log("✓ 导入服务初始化完成");
      initializeScanJobService(database);
      console.log("✓ 扫描任务服务初始化完成");
    }
    console.log("所有服务初始化完成！");
  } catch (error) {
    console.error("服务初始化失败:", error);
  }
}
async function checkAndRecoverScanJob() {
  if (!scanJobService) {
    console.log("[Main] ScanJobService not available, skipping recovery check");
    return;
  }
  const activeJob = scanJobService.getActiveJob();
  if (!activeJob) {
    console.log("[Main] No active scan job to recover");
    global.activeScanJob = null;
    return;
  }
  console.log("[Main] Found active scan job:", activeJob.id, "status:", activeJob.status);
  if (scanJobService.isJobStale(activeJob)) {
    console.log("[Main] Scan job is stale (>5min no heartbeat), marking as failed");
    scanJobService.markJobAsFailed(activeJob.id);
    global.activeScanJob = null;
  } else {
    console.log("[Main] Scan job is still active (<5min), can be resumed");
    global.activeScanJob = activeJob;
  }
}
function setupIPCHandlers() {
  ipcMain.handle("icloud:select-library", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "选择 iCloud Photos Library",
      defaultPath: `/Users/${process.env.USER}/Pictures/Photos Library.photoslibrary`
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const libraryPath = result.filePaths[0];
      if (iCloudService) {
        await iCloudService.initialize(libraryPath);
      }
      return libraryPath;
    }
    return null;
  });
  ipcMain.handle("photos:get-list", async (event, options) => {
    try {
      const limit = options?.limit || 100;
      const offset = options?.offset || 0;
      console.log(`[IPC] photos:get-list - limit: ${limit}, offset: ${offset}`);
      console.log(`[IPC] localPhotoService 可用: ${!!localPhotoService}`);
      if (localPhotoService) {
        try {
          const localPhotos = localPhotoService.getLocalPhotos(limit, offset);
          console.log(`[IPC] 从本地数据库获取 ${localPhotos.length} 张照片`);
          console.log(`[IPC] 前3张照片:`, localPhotos.slice(0, 3));
          return localPhotos;
        } catch (innerError) {
          console.error("[IPC] getLocalPhotos 失败:", innerError);
          return [];
        }
      }
      if (iCloudService) {
        return await iCloudService.getPhotos(limit, offset);
      }
      console.log("[IPC] 没有本地照片，返回空数组");
      return [];
    } catch (error) {
      console.error("[IPC] 获取照片列表失败:", error);
      return [];
    }
  });
  ipcMain.handle("photos:get-count", async () => {
    try {
      if (localPhotoService) {
        const count = localPhotoService.getPhotoCount();
        console.log(`[IPC] 照片总数: ${count}`);
        return { total: count };
      }
      return { total: 0 };
    } catch (error) {
      console.error("[IPC] 获取照片总数失败:", error);
      return { total: 0 };
    }
  });
  ipcMain.handle("photos:get-without-embeddings", async (event, limit = 100) => {
    try {
      if (localPhotoService) {
        const photos = localPhotoService.getPhotosWithoutEmbeddings(limit);
        return { success: true, photos };
      }
      return { success: false, photos: [], error: "localPhotoService not available" };
    } catch (error) {
      console.error("[IPC] 获取无向量照片失败:", error);
      return { success: false, photos: [], error: String(error) };
    }
  });
  ipcMain.handle("photos:save-embedding", async (event, photoUuid, vector) => {
    try {
      if (database) {
        await database.saveEmbedding(photoUuid, vector, "image");
        return { success: true };
      }
      return { success: false, error: "Database not available" };
    } catch (error) {
      console.error("[IPC] 保存向量失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("photos:get-detail", async (event, photoId) => {
    try {
      if (!iCloudService) {
        return generateMockPhotos(1, parseInt(photoId) || 0)[0];
      }
      return await iCloudService.getPhotoDetail(photoId);
    } catch (error) {
      console.error("获取照片详情失败:", error);
      return null;
    }
  });
  ipcMain.handle("photos:delete", async (event, photoId) => {
    try {
      console.log(`[IPC] 删除照片: ${photoId}`);
      if (localPhotoService) {
        const success = localPhotoService.deletePhoto(photoId);
        if (success) {
          console.log(`[IPC] 照片 ${photoId} 已从本地数据库删除`);
          return { success: true };
        }
      }
      if (iCloudService && "deletePhoto" in iCloudService) {
        const success = await iCloudService.deletePhoto(photoId);
        return { success };
      }
      console.warn("[IPC] 没有可用的照片服务，无法删除照片");
      return { success: false, error: "没有可用的照片服务" };
    } catch (error) {
      console.error("[IPC] 删除照片失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("photos:export", async (event, params) => {
    try {
      const { photoId, filePath, exportPath } = params;
      console.log(`[IPC] 导出照片: ${photoId} -> ${exportPath}`);
      const result = await dialog.showSaveDialog({
        title: "选择导出位置",
        defaultPath: exportPath,
        buttonLabel: "保存"
      });
      if (result.canceled) {
        return { success: false, error: "用户取消导出" };
      }
      const targetPath = result.filePath;
      if (!targetPath) {
        return { success: false, error: "未选择导出路径" };
      }
      const fs = await import("fs");
      if (!fs.existsSync(filePath)) {
        console.error(`[IPC] 源文件不存在: ${filePath}`);
        return { success: false, error: "源文件不存在" };
      }
      fs.copyFileSync(filePath, targetPath);
      console.log(`[IPC] 照片已导出到: ${targetPath}`);
      return { success: true, exportPath: targetPath };
    } catch (error) {
      console.error("[IPC] 导出照片失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("photos:search", async (event, query, filters) => {
    try {
      if (!searchService) {
        return { results: generateMockPhotos(10, 0), total: 10 };
      }
      return await searchService.search(query, filters);
    } catch (error) {
      console.error("搜索失败:", error);
      return { results: [], total: 0 };
    }
  });
  ipcMain.handle("albums:get-smart", async () => {
    try {
      if (!searchService) {
        return generateMockAlbums();
      }
      return await searchService.getSmartAlbums();
    } catch (error) {
      console.error("获取智能相册失败:", error);
      return [];
    }
  });
  ipcMain.handle("albums:refresh", async () => {
    try {
      console.log("[IPC] 收到相册刷新请求");
      return { success: true, message: "Albums refreshed" };
    } catch (error) {
      console.error("刷新相册失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("people:get-all", async () => {
    try {
      if (!database) {
        return generateMockPeople();
      }
      return database.getAllPersons();
    } catch (error) {
      console.error("获取人物列表失败:", error);
      return [];
    }
  });
  ipcMain.handle("people:add", async (event, person) => {
    try {
      if (!database) return -1;
      return database.addPerson(person);
    } catch (error) {
      console.error("添加人物失败:", error);
      return -1;
    }
  });
  ipcMain.handle("people:search-simple", async (event, query) => {
    try {
      if (!searchService) {
        return generateMockPeople().filter(
          (p) => p.name.includes(query) || p.display_name?.includes(query)
        );
      }
      return await searchService.searchPeople(query);
    } catch (error) {
      console.error("搜索人物失败:", error);
      return [];
    }
  });
  ipcMain.handle("people:search-photos", async (event, personName) => {
    try {
      if (!searchService) {
        return { results: generateMockPhotos(10, 0), total: 10 };
      }
      return await searchService.searchByPerson(personName);
    } catch (error) {
      console.error("根据人物搜索照片失败:", error);
      return { results: [], total: 0 };
    }
  });
  ipcMain.handle("people:update", async (event, id, person) => {
    try {
      const { personService } = await import("./personService-BIW1ThMf.js");
      const success = personService.updatePerson(id, person);
      return { success };
    } catch (error) {
      console.error("[IPC] 更新人物失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("people:delete", async (event, id) => {
    try {
      const { personService } = await import("./personService-BIW1ThMf.js");
      const success = personService.deletePerson(id);
      return { success };
    } catch (error) {
      console.error("[IPC] 删除人物失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("people:tag", async (event, params) => {
    try {
      const { personService } = await import("./personService-BIW1ThMf.js");
      const result = personService.tagPerson(params);
      return result;
    } catch (error) {
      console.error("[IPC] 标记人物失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("people:untag", async (event, photoId, personId) => {
    try {
      const { personService } = await import("./personService-BIW1ThMf.js");
      const success = personService.untagPerson(photoId, personId);
      return { success };
    } catch (error) {
      console.error("[IPC] 移除标签失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("people:get-photo-tags", async (event, photoId) => {
    try {
      const { personService } = await import("./personService-BIW1ThMf.js");
      return personService.getPhotoTags(photoId);
    } catch (error) {
      console.error("[IPC] 获取照片标签失败:", error);
      return [];
    }
  });
  ipcMain.handle("people:get-person-photos", async (event, personId) => {
    try {
      const { personService } = await import("./personService-BIW1ThMf.js");
      return personService.getPersonPhotos(personId);
    } catch (error) {
      console.error("[IPC] 获取人物照片失败:", error);
      return [];
    }
  });
  ipcMain.handle("people:get-stats", async () => {
    try {
      const { personService } = await import("./personService-BIW1ThMf.js");
      return personService.getStats();
    } catch (error) {
      console.error("[IPC] 获取统计失败:", error);
      return { totalPersons: 0, totalTags: 0 };
    }
  });
  ipcMain.handle("places:get-all", async () => {
    try {
      if (!database) {
        return generateMockPlaces();
      }
      return database.getAllPlaces();
    } catch (error) {
      console.error("获取地点列表失败:", error);
      return [];
    }
  });
  ipcMain.handle("timeline:get", async (event, year) => {
    try {
      if (!database) {
        return generateMockPhotos(20, year ? year * 10 : 0);
      }
      return database.getPhotosByYear(year || (/* @__PURE__ */ new Date()).getFullYear());
    } catch (error) {
      console.error("获取时间线失败:", error);
      return [];
    }
  });
  ipcMain.handle("sync:start", async () => {
    try {
      if (!iCloudService) {
        await new Promise((resolve2) => setTimeout(resolve2, 2e3));
        return 100;
      }
      return await iCloudService.syncAll();
    } catch (error) {
      console.error("同步失败:", error);
      return 0;
    }
  });
  ipcMain.handle("sync:get-progress", async () => {
    return { current: 0, total: 0, status: "idle" };
  });
  ipcMain.handle("local:select-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "openDirectory", "multiSelections"],
      title: "选择要导入的照片或文件夹",
      buttonLabel: "选择",
      filters: [
        { name: "图片文件", extensions: ["jpg", "jpeg", "png", "gif", "webp", "heic", "tiff"] },
        { name: "所有文件", extensions: ["*"] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths;
    }
    return [];
  });
  ipcMain.handle("local:import-folder", async (event, folderPath) => {
    try {
      if (!localPhotoService) {
        throw new Error("本地照片服务未初始化");
      }
      const fs = await import("fs");
      const stat = fs.statSync(folderPath);
      localPhotoService.onProgress((progress) => {
        event.sender.send("local:import-progress", progress);
      });
      let result;
      if (stat.isFile()) {
        console.log(`[IPC] 导入单张照片: ${folderPath}`);
        const photo = await localPhotoService.importPhoto(folderPath);
        result = {
          imported: photo ? 1 : 0,
          skipped: 0,
          errors: photo ? 0 : 1,
          photos: photo ? [photo] : []
        };
      } else {
        result = await localPhotoService.importFolder(folderPath);
      }
      return {
        success: true,
        imported: result.imported,
        errors: result.errors
      };
    } catch (error) {
      console.error("导入照片失败:", error);
      return {
        success: false,
        error: error.message,
        imported: 0,
        errors: 1
      };
    }
  });
  ipcMain.handle("local:import-photo", async (event, filePath) => {
    try {
      if (!localPhotoService) {
        throw new Error("本地照片服务未初始化");
      }
      const photo = await localPhotoService.importPhoto(filePath);
      return photo;
    } catch (error) {
      console.error("导入单张照片失败:", error);
      return null;
    }
  });
  ipcMain.handle("local:get-count", async () => {
    try {
      if (!localPhotoService) {
        return 0;
      }
      return localPhotoService.getPhotoCount();
    } catch (error) {
      return 0;
    }
  });
  ipcMain.handle("import:scan-folder", async (_, folderPath) => {
    try {
      console.log(`[IPC] 扫描文件夹: ${folderPath}`);
      const files = await folderScanner.scanFolder(folderPath);
      console.log(`[IPC] 找到 ${files.length} 个文件`);
      return files;
    } catch (error) {
      console.error("[IPC] 扫描文件夹失败:", error);
      return [];
    }
  });
  ipcMain.handle("import:start", async (event, folderPath, options) => {
    try {
      console.log(`[IPC] 开始导入: ${folderPath}`);
      if (!importService) {
        throw new Error("导入服务未初始化");
      }
      const unsubscribe = importProgressService.subscribe((progress) => {
        event.sender.send("import:progress", progress);
      });
      importService.onProgress((progress) => {
        event.sender.send("import:progress", progress);
      });
      const result = await importService.importFromFolder(folderPath, options);
      unsubscribe();
      console.log(`[IPC] 导入完成: 成功 ${result.imported}, 跳过 ${result.skipped}, 失败 ${result.failed}`);
      return result;
    } catch (error) {
      console.error("[IPC] 导入失败:", error);
      return {
        success: false,
        imported: 0,
        skipped: 0,
        failed: 0,
        errors: [{ file: folderPath, error: error.message }],
        duration: 0
      };
    }
  });
  ipcMain.handle("import:cancel", async () => {
    console.log("[IPC] 收到取消导入信号");
    importService?.cancel();
    importProgressService.cancel();
    return { success: true };
  });
  ipcMain.handle("import:get-progress", async () => {
    const progress = importProgressService.getProgress();
    return {
      isImporting: importService?.getIsImporting() || false,
      progress: progress || null
    };
  });
  ipcMain.handle("embedding:initialize", async () => {
    console.log("[IPC] 收到 embedding:initialize 请求");
    const { BrowserWindow: BrowserWindow2 } = require("electron");
    const windows = BrowserWindow2.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.executeJavaScript(`
        if (window.embeddingAPI && window.embeddingAPI.initialize) {
          window.embeddingAPI.initialize()
        } else {
          Promise.reject(new Error('Embedding API not available'))
        }
      `).then((result) => {
        console.log("[IPC] 渲染进程模型初始化结果:", result);
      }).catch((error) => {
        console.error("[IPC] 渲染进程模型初始化失败:", error);
      });
    }
    return { success: true, message: "初始化请求已发送到渲染进程" };
  });
  ipcMain.handle("embedding:get-status", async () => {
    const { BrowserWindow: BrowserWindow2 } = require("electron");
    const windows = BrowserWindow2.getAllWindows();
    if (windows.length > 0) {
      try {
        const status = await windows[0].webContents.executeJavaScript(`
          if (window.embeddingAPI && window.embeddingAPI.getStatus) {
            window.embeddingAPI.getStatus()
          } else {
            null
          }
        `);
        if (status) {
          return status;
        }
      } catch (error) {
        console.error("[IPC] 获取模型状态失败:", error);
      }
    }
    return { loaded: false, modelName: "Xenova/clip-vit-base-patch32", rendererAvailable: false };
  });
  ipcMain.handle("embedding:text-to-vector", async (_, text) => {
    const { BrowserWindow: BrowserWindow2 } = require("electron");
    const windows = BrowserWindow2.getAllWindows();
    if (windows.length > 0) {
      try {
        const result = await windows[0].webContents.executeJavaScript(`
          if (window.embeddingAPI && window.embeddingAPI.textToEmbedding) {
            JSON.stringify(window.embeddingAPI.textToEmbedding(\`${text.replace(/`/g, "\\`")}\`))
          } else {
            '{"success":false,"error":"Embedding API not available"}'
          }
        `);
        return JSON.parse(result);
      } catch (error) {
        console.error("[IPC] 文本转向量失败:", error);
        return { success: false, error: String(error), processingTimeMs: 0 };
      }
    }
    return { success: false, error: "No renderer window available", processingTimeMs: 0 };
  });
  ipcMain.handle("embedding:image-to-vector", async (_, imagePath) => {
    const { BrowserWindow: BrowserWindow2 } = require("electron");
    const windows = BrowserWindow2.getAllWindows();
    if (windows.length > 0) {
      try {
        const result = await windows[0].webContents.executeJavaScript(`
          if (window.embeddingAPI && window.embeddingAPI.imageToEmbedding) {
            JSON.stringify(window.embeddingAPI.imageToEmbedding(\`${imagePath.replace(/`/g, "\\`")}\`))
          } else {
            '{"success":false,"error":"Embedding API not available"}'
          }
        `);
        const parsed = JSON.parse(result);
        if (parsed.success && parsed.vector && database) {
          const photoUuid = extractPhotoUuidFromPath(imagePath);
          if (photoUuid) {
            try {
              await database.saveEmbedding(photoUuid, parsed.vector, "image");
              console.log(`[IPC] 向量已保存: ${photoUuid}`);
            } catch (error) {
              console.error("[IPC] 保存向量失败:", error);
            }
          }
        }
        return parsed;
      } catch (error) {
        console.error("[IPC] 图片转向量失败:", error);
        return { success: false, error: String(error), processingTimeMs: 0 };
      }
    }
    return { success: false, error: "No renderer window available", processingTimeMs: 0 };
  });
  ipcMain.handle("embedding:generate-all", async (event) => {
    console.log("[IPC] 开始批量生成嵌入向量");
    if (!database) {
      return { success: false, error: "Database not initialized", successCount: 0, failedCount: 0, total: 0, errors: [], cancelled: false };
    }
    const vectorService = new VectorGenerationService(database);
    try {
      const result = await vectorService.generateAll({
        onProgress: (progress) => {
          event.sender.send("embedding:progress", progress);
        }
      });
      return { success: true, successCount: result.success, failedCount: result.failed, total: result.total, errors: result.errors, cancelled: result.cancelled };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), successCount: 0, failedCount: 0, total: 0, errors: [], cancelled: false };
    }
  });
  ipcMain.handle("embedding:generate-one", async (_, photoUuid) => {
    if (!database) {
      return { success: false, error: "Database not initialized" };
    }
    const vectorService = new VectorGenerationService(database);
    try {
      const success = await vectorService.generateOne(photoUuid);
      return { success };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("embedding:cancel", async () => {
    const vectorService = new VectorGenerationService();
    vectorService.cancel();
    return { success: true };
  });
  ipcMain.handle("embedding:get-generation-status", async () => {
    const vectorService = new VectorGenerationService();
    return vectorService.getStatus();
  });
  ipcMain.handle("search:preprocess", async (_, text) => {
    const { textPreprocessor: textPreprocessor2 } = await Promise.resolve().then(() => textPreprocessor$1);
    return textPreprocessor2.preprocess(text);
  });
  ipcMain.handle("search:text-to-vector", async (_, text) => {
    const { textVectorService } = await import("./textVectorService-D6srauE3.js");
    return await textVectorService.textToVector(text);
  });
  ipcMain.handle("search:semantic-legacy", async (_, query, options) => {
    try {
      const { textVectorService } = await import("./textVectorService-D6srauE3.js");
      const { similarityService: similarityService2 } = await Promise.resolve().then(() => similarityService$1);
      const { textPreprocessor: textPreprocessor2 } = await Promise.resolve().then(() => textPreprocessor$1);
      const processed = textPreprocessor2.preprocess(query);
      const textResult = await textVectorService.textToVector(query);
      if (!textResult.vector) {
        return { success: false, error: "Failed to generate vector", results: [] };
      }
      const getEmbeddings = async () => {
        if (!database) return [];
        return await database.getAllEmbeddings("image");
      };
      const results = await similarityService2.semanticSearch(
        textResult.vector,
        getEmbeddings,
        options
      );
      return {
        success: true,
        processed: {
          original: processed.original,
          processed: processed.processed,
          keywords: processed.keywords,
          language: processed.language
        },
        results,
        processingTimeMs: textResult.processingTimeMs
      };
    } catch (error) {
      console.error("[IPC] 语义搜索失败:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error), results: [] };
    }
  });
  ipcMain.handle("search:clear-cache", async () => {
    const { textVectorService } = await import("./textVectorService-D6srauE3.js");
    textVectorService.clearCache();
    return { success: true };
  });
  ipcMain.handle("search:get-cache-stats", async () => {
    const { textVectorService } = await import("./textVectorService-D6srauE3.js");
    return textVectorService.getCacheStats();
  });
  ipcMain.handle("search:semantic", async (_, options) => {
    try {
      if (!database) {
        return { success: false, error: "Database not initialized", results: [] };
      }
      const searchService2 = new SemanticSearchService(database);
      const result = await searchService2.search(options);
      const { searchResultFormatter } = await import("./searchResultFormatter-RYSqGMUP.js");
      const formattedResults = searchResultFormatter.formatBatch(result.results);
      const summary = searchResultFormatter.formatSummary(result);
      return {
        success: true,
        ...summary,
        results: formattedResults
      };
    } catch (error) {
      console.error("[IPC] 语义搜索失败:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error), results: [] };
    }
  });
  ipcMain.handle("search:quick", async (_, query, topK = 10) => {
    try {
      if (!database) return [];
      const searchService2 = new SemanticSearchService(database);
      return await searchService2.quickSearch(query, topK);
    } catch (error) {
      console.error("[IPC] 快速搜索失败:", error);
      return [];
    }
  });
  ipcMain.handle("search:multi", async (_, queries, options) => {
    try {
      if (!database) {
        return { success: false, error: "Database not initialized", results: [] };
      }
      const searchService2 = new SemanticSearchService(database);
      const result = await searchService2.multiQuerySearch(queries, options);
      return {
        success: true,
        total: result.total,
        results: result.results
      };
    } catch (error) {
      console.error("[IPC] 多查询搜索失败:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error), results: [] };
    }
  });
  ipcMain.handle("query:parse", async (_, query) => {
    try {
      const { queryParserService } = await import("./queryParserService-GRPgjsFW.js");
      return await queryParserService.parse(query);
    } catch (error) {
      console.error("[IPC] 查询解析失败:", error);
      return null;
    }
  });
  ipcMain.handle("query:clear-cache", async () => {
    try {
      const { queryParserService } = await import("./queryParserService-GRPgjsFW.js");
      queryParserService.clearCache();
      return { success: true };
    } catch (error) {
      console.error("[IPC] 清除查询缓存失败:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("query:get-cache-stats", async () => {
    try {
      const { queryParserService } = await import("./queryParserService-GRPgjsFW.js");
      return queryParserService.getCacheStats();
    } catch (error) {
      console.error("[IPC] 获取缓存统计失败:", error);
      return null;
    }
  });
  ipcMain.handle("search:keyword", async (_, options) => {
    try {
      const { keywordSearchService } = await import("./keywordSearchService-BdTauFmh.js");
      return await keywordSearchService.search(options);
    } catch (error) {
      console.error("[IPC] 关键词搜索失败:", error);
      return { results: [], total: 0, query: options.query };
    }
  });
  ipcMain.handle("search:keyword-quick", async (_, query, limit = 20) => {
    try {
      const { keywordSearchService } = await import("./keywordSearchService-BdTauFmh.js");
      return await keywordSearchService.quickSearch(query, limit);
    } catch (error) {
      console.error("[IPC] 快速搜索失败:", error);
      return [];
    }
  });
  ipcMain.handle("search:suggestions", async (_, query, limit = 10) => {
    try {
      const { keywordSearchService } = await import("./keywordSearchService-BdTauFmh.js");
      return keywordSearchService.getSuggestions(query, limit);
    } catch (error) {
      console.error("[IPC] 获取搜索建议失败:", error);
      return [];
    }
  });
  ipcMain.handle("search:global", async (_, options) => {
    try {
      const { globalSearchService } = await import("./globalSearchService-DwFw3EOb.js");
      return await globalSearchService.search(options);
    } catch (error) {
      console.error("[IPC] 全局搜索失败:", error);
      return {
        results: [],
        total: 0,
        page: 1,
        pageSize: 20,
        processingTimeMs: 0,
        query: { original: options.query, processed: "", vectorDimension: 0 }
      };
    }
  });
  ipcMain.handle("search:global-quick", async (_, query, topK = 10) => {
    try {
      const { globalSearchService } = await import("./globalSearchService-DwFw3EOb.js");
      return await globalSearchService.quickSearch(query, topK);
    } catch (error) {
      console.error("[IPC] 快速搜索失败:", error);
      return [];
    }
  });
  ipcMain.handle("search:similar", async (_, photoUuid, topK = 10) => {
    try {
      const { globalSearchService } = await import("./globalSearchService-DwFw3EOb.js");
      return await globalSearchService.findSimilarPhotos(photoUuid, topK);
    } catch (error) {
      console.error("[IPC] 相似照片搜索失败:", error);
      return [];
    }
  });
  ipcMain.handle("search:batch", async (_, queries, options) => {
    try {
      const { globalSearchService } = await import("./globalSearchService-DwFw3EOb.js");
      return await globalSearchService.batchSearch(queries, options);
    } catch (error) {
      console.error("[IPC] 批量搜索失败:", error);
      return [];
    }
  });
  ipcMain.handle("search:hybrid", async (_, options) => {
    try {
      const { resultMergeService } = await import("./resultMergeService-nY3OCcJw.js");
      return await resultMergeService.search(options);
    } catch (error) {
      console.error("[IPC] 混合搜索失败:", error);
      return {
        results: [],
        total: 0,
        query: options.query,
        processingTimeMs: 0,
        stats: { keywordCount: 0, semanticCount: 0, mergedCount: 0 }
      };
    }
  });
  ipcMain.handle("search:hybrid-intent", async (_, query) => {
    try {
      const { resultMergeService } = await import("./resultMergeService-nY3OCcJw.js");
      return await resultMergeService.searchWithIntent(query);
    } catch (error) {
      console.error("[IPC] 带意图搜索失败:", error);
      return {
        results: [],
        total: 0,
        query,
        processingTimeMs: 0,
        stats: { keywordCount: 0, semanticCount: 0, mergedCount: 0 }
      };
    }
  });
  ipcMain.handle("search:reorder", async (_, results, sortBy) => {
    try {
      const { resultMergeService } = await import("./resultMergeService-nY3OCcJw.js");
      return resultMergeService.reorderResults(results, sortBy);
    } catch (error) {
      console.error("[IPC] 重新排序失败:", error);
      return results;
    }
  });
  ipcMain.handle("face:load-models", async () => {
    try {
      const { faceDetectionService: faceDetectionService2 } = await Promise.resolve().then(() => faceDetectionService$1);
      return await faceDetectionService2.loadModels();
    } catch (error) {
      console.error("[IPC] 加载模型失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("face:get-status", async () => {
    try {
      const { faceDetectionService: faceDetectionService2 } = await Promise.resolve().then(() => faceDetectionService$1);
      return faceDetectionService2.getModelStatus();
    } catch (error) {
      return { loaded: false, modelsPath: "", configured: false };
    }
  });
  ipcMain.handle("face:detect", async (_, imagePath) => {
    try {
      const { faceDetectionService: faceDetectionService2 } = await Promise.resolve().then(() => faceDetectionService$1);
      return await faceDetectionService2.detect(imagePath);
    } catch (error) {
      return { success: false, detections: [], error: String(error), processingTimeMs: 0 };
    }
  });
  ipcMain.handle("face:detect-batch", async (event, imagePaths) => {
    try {
      const { faceDetectionService: faceDetectionService2 } = await Promise.resolve().then(() => faceDetectionService$1);
      const result = await faceDetectionService2.detectBatch(
        imagePaths,
        {},
        (progress) => {
          event.sender.send("face:progress", progress);
        }
      );
      return {
        success: true,
        totalDetected: result.totalDetected,
        processingTimeMs: result.processingTimeMs
      };
    } catch (error) {
      console.error("[IPC] 批量检测失败:", error);
      return { success: false, totalDetected: 0, processingTimeMs: 0, error: String(error) };
    }
  });
  ipcMain.handle("face:cancel", async () => {
    try {
      const { faceDetectionService: faceDetectionService2 } = await Promise.resolve().then(() => faceDetectionService$1);
      faceDetectionService2.cancel();
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  });
  ipcMain.handle("face:reset-scan-status", async () => {
    try {
      if (!database) {
        return { success: false, error: "数据库未初始化" };
      }
      console.log("[IPC] 深度重置人脸扫描状态...");
      const beforeFaces = database.query(`SELECT COUNT(*) as count FROM detected_faces`)[0];
      const beforePersons = database.query(`SELECT COUNT(*) as count FROM persons`)[0];
      const beforePhotos = database.query(`SELECT COUNT(*) as count FROM photos WHERE file_path IS NOT NULL`)[0];
      console.log(`[IPC] 重置前统计: ${beforeFaces?.count || 0} 人脸, ${beforePersons?.count || 0} 人物, ${beforePhotos?.count || 0} 照片`);
      database.run("DELETE FROM detected_faces");
      database.run("DELETE FROM persons");
      const afterFaces = database.query(`SELECT COUNT(*) as count FROM detected_faces`)[0];
      const afterPersons = database.query(`SELECT COUNT(*) as count FROM persons`)[0];
      const unprocessedPhotos = database.getUnprocessedPhotos(1e3);
      console.log(`[IPC] 深度重置完成:`);
      console.log(`  - 删除人脸: ${beforeFaces?.count || 0} → ${afterFaces?.count || 0}`);
      console.log(`  - 删除人物: ${beforePersons?.count || 0} → ${afterPersons?.count || 0}`);
      console.log(`  - 可重新扫描照片: ${unprocessedPhotos.length}`);
      return {
        success: true,
        deletedCount: beforeFaces?.count || 0,
        resetPhotos: unprocessedPhotos.length,
        message: `已清理 ${beforeFaces?.count || 0} 人脸、${beforePersons?.count || 0} 人物，${unprocessedPhotos.length} 张照片可重新扫描`
      };
    } catch (error) {
      console.error("[IPC] 重置扫描状态失败:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "重置失败"
      };
    }
  });
  ipcMain.handle("diagnostic:get-db-stats", async () => {
    try {
      if (!database) {
        return { success: false, error: "数据库未初始化" };
      }
      const stats = {
        photos: {
          total: database.query("SELECT COUNT(*) as count FROM photos")[0]?.count || 0,
          withFilePath: database.query("SELECT COUNT(*) as count FROM photos WHERE file_path IS NOT NULL")[0]?.count || 0,
          unprocessed: database.getUnprocessedPhotos(1e3).length
        },
        detected_faces: {
          total: database.query("SELECT COUNT(*) as count FROM detected_faces")[0]?.count || 0,
          unassigned: database.query("SELECT COUNT(*) as count FROM detected_faces WHERE person_id IS NULL")[0]?.count || 0,
          assigned: database.query("SELECT COUNT(*) as count FROM detected_faces WHERE person_id IS NOT NULL")[0]?.count || 0
        },
        persons: {
          total: database.query("SELECT COUNT(*) as count FROM persons")[0]?.count || 0
        }
      };
      console.log("[Diagnostic] 数据库状态:", stats);
      return { success: true, stats };
    } catch (error) {
      console.error("[Diagnostic] 获取统计失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("face:scan-all", async (event) => {
    try {
      console.log("[IPC] face:scan-all 被触发");
      if (mainWindow) {
        mainWindow.webContents.send("face:status", { stage: "started", message: "开始扫描..." });
      }
      if (!database) {
        const err = "数据库未初始化";
        console.error("[IPC]", err);
        if (mainWindow) {
          mainWindow.webContents.send("face:status", { stage: "error", error: err });
        }
        return { success: false, count: 0, error: err };
      }
      const { FaceDetectionQueue: FaceDetectionQueue2, faceDetectionQueue: existingQueue } = await Promise.resolve().then(() => faceDetectionQueue$1);
      const queue = new FaceDetectionQueue2(database, {
        maxConcurrent: 1,
        onProgress: (progress) => {
          if (mainWindow) {
            const stats = queue.getStats();
            const percent = stats.total > 0 ? Math.round(stats.completed / stats.total * 100) : 0;
            console.log(`[IPC] 📊 队列进度: ${stats.completed}/${stats.total} (${percent}%)`);
            mainWindow.webContents.send("face:progress", {
              current: stats.completed,
              total: stats.total,
              percent,
              status: progress.status
            });
          }
        },
        onComplete: (stats) => {
          console.log(`[IPC] 🎉 人脸检测完成: ${stats.completed}/${stats.total}, 检测到 ${stats.detectedFaces} 张人脸`);
          if (mainWindow) {
            mainWindow.webContents.send("face:scan-complete", {
              total: stats.total,
              completed: stats.completed,
              failed: stats.failed,
              detectedFaces: stats.detectedFaces
            });
            mainWindow.webContents.send("face:status", {
              stage: "completed",
              total: stats.total,
              detectedFaces: stats.detectedFaces,
              message: `扫描完成，共 ${stats.completed} 张照片，检测到 ${stats.detectedFaces} 张人脸`
            });
          }
        }
      });
      const prevStatus = queue.getDetailedStatus();
      console.log(`[IPC] 之前队列状态: isRunning=${prevStatus.isRunning}, queueLength=${prevStatus.queueLength}`);
      if (prevStatus.isRunning) {
        console.log("[IPC] 检测到队列卡住，强制重置...");
        queue.forceReset();
      }
      const totalPhotos = database.query("SELECT COUNT(*) as cnt FROM photos WHERE file_path IS NOT NULL");
      const processedPhotos = database.query("SELECT COUNT(DISTINCT p.id) as cnt FROM photos p JOIN detected_faces df ON p.id = df.photo_id WHERE p.file_path IS NOT NULL");
      console.log(`[IPC] 数据库统计: 总数=${totalPhotos[0]?.cnt}, 已处理=${processedPhotos[0]?.cnt}`);
      const unprocessedLimit = 1e3;
      const photos = database.getUnprocessedPhotos(unprocessedLimit);
      console.log(`[IPC] getUnprocessedPhotos(${unprocessedLimit}) 返回: ${photos.length} 张`);
      if (mainWindow) {
        mainWindow.webContents.send("face:status", {
          stage: "queued",
          total: photos.length,
          message: `已添加 ${photos.length} 张照片到扫描队列`
        });
      }
      if (photos.length === 0) {
        const unclusteredCount = queue.getUnclusteredFaceCount();
        console.log(`[IPC] 没有新照片需要扫描，但未聚类人脸数: ${unclusteredCount}`);
        if (unclusteredCount > 0) {
          console.log(`[IPC] 发现 ${unclusteredCount} 个未聚类人脸，直接触发聚类...`);
          if (mainWindow) {
            mainWindow.webContents.send("face:status", {
              stage: "processing",
              message: `发现 ${unclusteredCount} 个未识别人脸，正在聚类...`
            });
          }
          const clusterResult = await queue.clusterExistingFaces();
          if (mainWindow) {
            mainWindow.webContents.send("face:status", {
              stage: "completed",
              message: `聚类完成！识别了 ${clusterResult.matched} 张人脸，创建了 ${clusterResult.personsCreated} 位人物`
            });
            mainWindow.webContents.send("face:scan-complete", {
              total: unclusteredCount,
              completed: unclusteredCount,
              failed: 0,
              detectedFaces: clusterResult.matched
            });
            mainWindow.webContents.send("people:updated");
          }
          return {
            success: true,
            count: 0,
            detectedFaces: clusterResult.matched,
            personsCreated: clusterResult.personsCreated,
            message: `聚类完成！创建了 ${clusterResult.personsCreated} 位人物`
          };
        }
        if (mainWindow) {
          mainWindow.webContents.send("face:status", { stage: "completed", message: "没有需要处理的照片" });
        }
        return { success: true, count: 0, message: "没有需要处理的照片" };
      }
      const jobId = queue.startScanJob(photos.length);
      console.log(`[IPC] 创建扫描任务: ${jobId}`);
      let processed = 0;
      const totalPhotosToProcess = photos.length;
      for (const photo of photos) {
        console.log(`[IPC] 添加照片到队列: ${photo.id} (${processed + 1}/${totalPhotosToProcess})`);
        await queue.addTask(
          photo.id.toString(),
          photo.uuid,
          photo.file_path
        );
        processed++;
        console.log(`[IPC] 已处理: ${processed}/${totalPhotosToProcess}`);
        if (mainWindow && processed % 1 === 0) {
          const percent = Math.round(processed / totalPhotosToProcess * 100);
          console.log(`[IPC] 📊 发送进度: ${processed}/${totalPhotosToProcess} (${percent}%)`);
          mainWindow.webContents.send("face:progress", {
            current: processed,
            total: totalPhotosToProcess,
            percent
          });
        }
      }
      console.log(`[IPC] 已添加 ${processed} 张照片到队列`);
      console.log("[IPC] 调用 queue.forceStart() 启动处理引擎...");
      await queue.forceStart();
      console.log("[IPC] forceStart() 返回，等待队列处理完成...");
      await new Promise((resolve2) => setTimeout(resolve2, 100));
      const finalStats = queue.getStats();
      const detectedFaces = queue.getTasks().reduce((sum, t) => sum + (t.faces || 0), 0);
      return { success: true, count: processed, detectedFaces, total: finalStats.total };
    } catch (error) {
      const errMsg = String(error);
      console.error("[IPC] 扫描失败:", error);
      if (mainWindow) {
        mainWindow.webContents.send("face:status", { stage: "error", error: errMsg });
      }
      return { success: false, count: 0, error: errMsg };
    }
  });
  ipcMain.handle("face:get-queue-status", async () => {
    try {
      const { faceDetectionQueue: faceDetectionQueue2 } = await Promise.resolve().then(() => faceDetectionQueue$1);
      return faceDetectionQueue2.getDetailedStatus();
    } catch (error) {
      console.error("[IPC] 获取队列状态失败:", error);
      return null;
    }
  });
  ipcMain.handle("face:reset-queue", async () => {
    try {
      const { faceDetectionQueue: faceDetectionQueue2 } = await Promise.resolve().then(() => faceDetectionQueue$1);
      const status = faceDetectionQueue2.getDetailedStatus();
      faceDetectionQueue2.forceReset();
      console.log("[IPC] 队列状态已强制重置");
      return { success: true, previousStatus: status };
    } catch (error) {
      console.error("[IPC] 重置队列失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("face:get-unnamed-faces", async (_, limit = 50) => {
    try {
      if (!database) return { faces: [], count: 0 };
      const faces = database.query(`
        SELECT df.id, df.photo_id, df.bbox_x, df.bbox_y, df.bbox_width, df.bbox_height,
               df.confidence, p.file_path, p.thumbnail_path
        FROM detected_faces df
        JOIN photos p ON df.photo_id = p.id
        WHERE df.person_id IS NULL
        ORDER BY df.confidence DESC
        LIMIT ?
      `, [limit]);
      const count = database.query("SELECT COUNT(*) as count FROM detected_faces WHERE person_id IS NULL")[0]?.count || 0;
      return {
        faces: faces.map((f) => ({
          id: f.id,
          photoId: f.photo_id,
          bbox: { x: f.bbox_x, y: f.bbox_y, width: f.bbox_width, height: f.bbox_height },
          confidence: f.confidence,
          filePath: f.file_path,
          thumbnailPath: f.thumbnail_path
        })),
        count
      };
    } catch (error) {
      console.error("[IPC] 获取未命名人脸失败:", error);
      return { faces: [], count: 0, error: String(error) };
    }
  });
  ipcMain.handle("diagnostic:face-stats", async () => {
    try {
      if (!database) return { error: "数据库未初始化" };
      const stats = {
        photos: database.query("SELECT COUNT(*) as count FROM photos")[0]?.count || 0,
        detectedFaces: database.query("SELECT COUNT(*) as count FROM detected_faces")[0]?.count || 0,
        persons: database.query("SELECT COUNT(*) as count FROM persons")[0]?.count || 0,
        faces: database.query("SELECT COUNT(*) as count FROM faces")[0]?.count || 0
      };
      const withEmbedding = database.query(`
        SELECT COUNT(*) as count FROM detected_faces WHERE embedding IS NOT NULL
      `)[0]?.count || 0;
      const sample = database.query(`
        SELECT id, photo_id, confidence,
               CASE WHEN embedding IS NULL THEN 'NULL' ELSE '有数据' END as emb_status
        FROM detected_faces LIMIT 3
      `);
      console.log("[Diagnostic] 人脸检测统计:", { ...stats, withEmbedding });
      return { success: true, stats: { ...stats, withEmbedding }, sample };
    } catch (error) {
      console.error("[Diagnostic] 获取统计失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("diagnostic:clear-face-data", async () => {
    try {
      if (!database) return { error: "数据库未初始化" };
      console.log("[Diagnostic] 开始清理人脸数据...");
      database.run("DELETE FROM detected_faces");
      database.run("DELETE FROM faces");
      database.run("DELETE FROM persons");
      console.log("[Diagnostic] 人脸数据已清理");
      return { success: true, message: "所有人脸数据已清理" };
    } catch (error) {
      console.error("[Diagnostic] 清理数据失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("diagnostic:reset-person-links", async () => {
    try {
      if (!database) return { error: "数据库未初始化" };
      console.log("[Diagnostic] 重置人物关联...");
      database.run("UPDATE detected_faces SET person_id = NULL, processed = 0");
      database.run("DELETE FROM persons");
      console.log("[Diagnostic] 人物关联已重置");
      return { success: true, message: "人物关联已重置，可以重新聚类" };
    } catch (error) {
      console.error("[Diagnostic] 重置失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("diagnostic:query", async (_, sql) => {
    try {
      if (!database) return { error: "数据库未初始化" };
      const trimmedSql = sql.trim().toUpperCase();
      if (!trimmedSql.startsWith("SELECT")) {
        return { error: "只允许执行 SELECT 查询" };
      }
      const result = database.query(sql);
      return { success: true, result };
    } catch (error) {
      console.error("[Diagnostic] SQL查询失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("face:auto-match", async () => {
    try {
      const { faceMatchingService: faceMatchingService2 } = await Promise.resolve().then(() => faceMatchingService$1);
      const unmatched = await faceMatchingService2.getUnmatchedFaces();
      console.log(`[IPC] 未匹配人脸数量: ${unmatched.length}`);
      if (unmatched.length > 0) {
        console.log(`[IPC] 样本人脸 descriptor 长度: ${unmatched[0].descriptor?.length}`);
      }
      return await faceMatchingService2.autoMatch();
    } catch (error) {
      console.error("[IPC] 自动匹配失败:", error);
      return { matched: 0, clusters: [], processingTimeMs: 0, message: "自动匹配失败" };
    }
  });
  ipcMain.handle("face:find-similar", async (_, faceId) => {
    try {
      const { faceMatchingService: faceMatchingService2 } = await Promise.resolve().then(() => faceMatchingService$1);
      return await faceMatchingService2.findSimilarFaces(faceId);
    } catch (error) {
      console.error("[IPC] 查找相似人脸失败:", error);
      return [];
    }
  });
  ipcMain.handle("face:create-person", async (_, cluster, personName) => {
    try {
      const { faceMatchingService: faceMatchingService2 } = await Promise.resolve().then(() => faceMatchingService$1);
      return await faceMatchingService2.createPersonFromCluster(cluster, personName);
    } catch (error) {
      console.error("[IPC] 创建人物失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("face:assign", async (_, faceIds, personId) => {
    try {
      const { faceMatchingService: faceMatchingService2 } = await Promise.resolve().then(() => faceMatchingService$1);
      return await faceMatchingService2.assignToPerson(faceIds, personId);
    } catch (error) {
      console.error("[IPC] 分配人脸失败:", error);
      return { success: false, assigned: 0, error: String(error) };
    }
  });
  ipcMain.handle("face:unmatch", async (_, faceId) => {
    try {
      const { faceMatchingService: faceMatchingService2 } = await Promise.resolve().then(() => faceMatchingService$1);
      return await faceMatchingService2.unmatchFace(faceId);
    } catch (error) {
      console.error("[IPC] 取消匹配失败:", error);
      return false;
    }
  });
  ipcMain.handle("face:merge-persons", async (_, sourcePersonId, targetPersonId) => {
    try {
      const { faceMatchingService: faceMatchingService2 } = await Promise.resolve().then(() => faceMatchingService$1);
      return await faceMatchingService2.mergePersons(sourcePersonId, targetPersonId);
    } catch (error) {
      console.error("[IPC] 合并人物失败:", error);
      return { success: false, merged: 0, error: String(error) };
    }
  });
  ipcMain.handle("face:get-matching-stats", async () => {
    try {
      const { faceMatchingService: faceMatchingService2 } = await Promise.resolve().then(() => faceMatchingService$1);
      return faceMatchingService2.getStats();
    } catch (error) {
      return { totalFaces: 0, matchedFaces: 0, unmatchedFaces: 0, matchRate: 0 };
    }
  });
  ipcMain.handle("quality:validate-clustering", async () => {
    try {
      const { qualityValidationService } = await import("./qualityValidationService-Ch5EaGkJ.js");
      return await qualityValidationService.validateClustering();
    } catch (error) {
      console.error("[IPC] 聚类质量验证失败:", error);
      return { error: String(error) };
    }
  });
  ipcMain.handle("quality:test-semantic", async (_, query) => {
    try {
      const { qualityValidationService } = await import("./qualityValidationService-Ch5EaGkJ.js");
      return await qualityValidationService.testSemanticSearch(query);
    } catch (error) {
      console.error("[IPC] 语义搜索测试失败:", error);
      return { error: String(error) };
    }
  });
  ipcMain.handle("quality:run-tests", async () => {
    try {
      const { qualityValidationService } = await import("./qualityValidationService-Ch5EaGkJ.js");
      return await qualityValidationService.runStandardTests();
    } catch (error) {
      console.error("[IPC] 运行标准测试失败:", error);
      return { error: String(error) };
    }
  });
  ipcMain.handle("quality:generate-report", async () => {
    try {
      const { qualityValidationService } = await import("./qualityValidationService-Ch5EaGkJ.js");
      return await qualityValidationService.generateReport();
    } catch (error) {
      console.error("[IPC] 生成质量报告失败:", error);
      return { error: String(error) };
    }
  });
  ipcMain.handle("quality:check-vectors", async () => {
    try {
      const { qualityValidationService } = await import("./qualityValidationService-Ch5EaGkJ.js");
      return await qualityValidationService.checkVectorDimensions();
    } catch (error) {
      console.error("[IPC] 检查向量维度失败:", error);
      return { error: String(error) };
    }
  });
  ipcMain.handle("perf:test-search", async (_, queryCount) => {
    try {
      const { performanceTestService } = await import("./performanceTestService-DWdX-NSS.js");
      return await performanceTestService.testSearchPerformance(queryCount || 50);
    } catch (error) {
      console.error("[IPC] 搜索性能测试失败:", error);
      return { error: String(error) };
    }
  });
  ipcMain.handle("perf:test-memory", async () => {
    try {
      const { performanceTestService } = await import("./performanceTestService-DWdX-NSS.js");
      return await performanceTestService.testMemoryUsage();
    } catch (error) {
      console.error("[IPC] 内存测试失败:", error);
      return { error: String(error) };
    }
  });
  ipcMain.handle("perf:test-concurrency", async (_, concurrentCount) => {
    try {
      const { performanceTestService } = await import("./performanceTestService-DWdX-NSS.js");
      return await performanceTestService.testConcurrency(concurrentCount || 5);
    } catch (error) {
      console.error("[IPC] 并发测试失败:", error);
      return { error: String(error) };
    }
  });
  ipcMain.handle("perf:test-models", async () => {
    try {
      const { performanceTestService } = await import("./performanceTestService-DWdX-NSS.js");
      return await performanceTestService.testModelLoading();
    } catch (error) {
      console.error("[IPC] 模型加载测试失败:", error);
      return { error: String(error) };
    }
  });
  ipcMain.handle("perf:run-full", async () => {
    try {
      const { performanceTestService } = await import("./performanceTestService-DWdX-NSS.js");
      return await performanceTestService.runFullTest();
    } catch (error) {
      console.error("[IPC] 完整性能测试失败:", error);
      return { error: String(error) };
    }
  });
  ipcMain.handle("face:regenerate-start", async (event, options) => {
    try {
      const { faceEmbeddingRegenerator } = await import("./regenerateFaceEmbeddings-C6rYBiYF.js");
      const result = await faceEmbeddingRegenerator.start({
        batchSize: options?.batchSize || 50,
        resumeFromCheckpoint: options?.resume !== false,
        onProgress: (progress) => {
          event.sender.send("face:regenerate-progress", progress);
        }
      });
      return result;
    } catch (error) {
      console.error("[IPC] 开始重新生成失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("face:regenerate-pause", async () => {
    try {
      const { faceEmbeddingRegenerator } = await import("./regenerateFaceEmbeddings-C6rYBiYF.js");
      faceEmbeddingRegenerator.pause();
      return { success: true };
    } catch (error) {
      console.error("[IPC] 暂停重新生成失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("face:regenerate-progress", async () => {
    try {
      const { faceEmbeddingRegenerator } = await import("./regenerateFaceEmbeddings-C6rYBiYF.js");
      return faceEmbeddingRegenerator.getProgress();
    } catch (error) {
      console.error("[IPC] 获取重新生成进度失败:", error);
      return { status: "error", error: String(error) };
    }
  });
  ipcMain.handle("face:regenerate-reset", async () => {
    try {
      const { faceEmbeddingRegenerator } = await import("./regenerateFaceEmbeddings-C6rYBiYF.js");
      faceEmbeddingRegenerator.reset();
      return { success: true };
    } catch (error) {
      console.error("[IPC] 重置重新生成失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("face:regenerate-recluster", async () => {
    try {
      const { faceEmbeddingRegenerator } = await import("./regenerateFaceEmbeddings-C6rYBiYF.js");
      return await faceEmbeddingRegenerator.recluster();
    } catch (error) {
      console.error("[IPC] 重新聚类失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("face:cleanup-persons", async () => {
    try {
      const { faceEmbeddingRegenerator } = await import("./regenerateFaceEmbeddings-C6rYBiYF.js");
      return faceEmbeddingRegenerator.cleanupEmptyPersons();
    } catch (error) {
      console.error("[IPC] 清理空人物失败:", error);
      return { deleted: 0, error: String(error) };
    }
  });
  ipcMain.handle("scan-job:get-active", async () => {
    try {
      if (!scanJobService) {
        return { success: false, error: "ScanJobService not available", job: null };
      }
      const job = scanJobService.getActiveJob();
      return { success: true, job };
    } catch (error) {
      console.error("[IPC] 获取活跃扫描任务失败:", error);
      return { success: false, error: String(error), job: null };
    }
  });
  ipcMain.handle("scan-job:resume", async (event, jobId) => {
    try {
      if (!scanJobService || !database) {
        return { success: false, error: "Services not available" };
      }
      const job = scanJobService.getJobById(jobId);
      if (!job) {
        return { success: false, error: "Job not found" };
      }
      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
        return { success: false, error: "Job is not resumable", status: job.status };
      }
      if (scanJobService.isJobStale(job)) {
        scanJobService.markJobAsFailed(jobId);
        return { success: false, error: "Job is stale (>5min no heartbeat), marked as failed" };
      }
      console.log(`[IPC] 恢复扫描任务: ${jobId}, 从 lastProcessedId: ${job.lastProcessedId}`);
      const { FaceDetectionQueue: FaceDetectionQueue2 } = await Promise.resolve().then(() => faceDetectionQueue$1);
      const queue = new FaceDetectionQueue2(database, {
        maxConcurrent: 1,
        onProgress: (progress) => {
          if (mainWindow) {
            mainWindow.webContents.send("face:progress", {
              current: progress.completed,
              total: progress.total,
              percent: progress.total > 0 ? Math.round(progress.completed / progress.total * 100) : 0,
              status: progress.status
            });
          }
        },
        onComplete: (stats) => {
          console.log(`[IPC] 恢复扫描完成: ${stats.completed}/${stats.total}, 检测到 ${stats.detectedFaces} 张人脸`);
          if (mainWindow) {
            mainWindow.webContents.send("face:scan-complete", {
              total: stats.total,
              completed: stats.completed,
              failed: stats.failed,
              detectedFaces: stats.detectedFaces
            });
          }
        }
      });
      queue.startScanJob(job.totalPhotos);
      const addedCount = await queue.resumeFromCheckpoint(job.lastProcessedId || 0, 1e3);
      if (addedCount === 0) {
        return { success: true, message: "No more photos to process", addedCount: 0 };
      }
      await queue.forceStart();
      return { success: true, message: "Job resumed", addedCount, jobId };
    } catch (error) {
      console.error("[IPC] 恢复扫描任务失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("scan-job:get-stats", async () => {
    try {
      if (!scanJobService) {
        return { success: false, error: "ScanJobService not available" };
      }
      const stats = scanJobService.getStats();
      return { success: true, stats };
    } catch (error) {
      console.error("[IPC] 获取扫描任务统计失败:", error);
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle("scan-job:get-all", async (_, limit) => {
    try {
      if (!scanJobService) {
        return { success: false, error: "ScanJobService not available", jobs: [] };
      }
      const jobs = scanJobService.getAllJobs(limit || 100);
      return { success: true, jobs };
    } catch (error) {
      console.error("[IPC] 获取扫描任务列表失败:", error);
      return { success: false, error: String(error), jobs: [] };
    }
  });
  ipcMain.handle("people:search", async (_, options) => {
    try {
      const { personSearchService } = await import("./personSearchService-DSriwG67.js");
      return await personSearchService.search(options);
    } catch (error) {
      console.error("[IPC] 搜索人物失败:", error);
      return { results: [], total: 0, query: options.query, processingTimeMs: 0 };
    }
  });
  ipcMain.handle("people:get-photos", async (_, filter) => {
    try {
      const { personSearchService } = await import("./personSearchService-DSriwG67.js");
      return await personSearchService.getPersonPhotos(filter);
    } catch (error) {
      console.error("[IPC] 获取人物照片失败:", error);
      return null;
    }
  });
  ipcMain.handle("people:get-timeline", async (_, personId) => {
    try {
      const { personSearchService } = await import("./personSearchService-DSriwG67.js");
      return await personSearchService.getPersonTimeline(personId);
    } catch (error) {
      console.error("[IPC] 获取时间线失败:", error);
      return {};
    }
  });
  ipcMain.handle("people:get-suggestions", async (_, query, limit) => {
    try {
      const { personSearchService } = await import("./personSearchService-DSriwG67.js");
      return personSearchService.getSuggestions(query, limit);
    } catch (error) {
      console.error("[IPC] 获取建议失败:", error);
      return [];
    }
  });
  ipcMain.handle("people:get-popular", async (_, limit) => {
    try {
      const { personSearchService } = await import("./personSearchService-DSriwG67.js");
      return personSearchService.getPopularPersons(limit);
    } catch (error) {
      console.error("[IPC] 获取热门人物失败:", error);
      return [];
    }
  });
  ipcMain.handle("people:get-search-stats", async () => {
    try {
      const { personSearchService } = await import("./personSearchService-DSriwG67.js");
      return personSearchService.getStats();
    } catch (error) {
      return { totalPersons: 0, totalTaggedPhotos: 0, avgPhotosPerPerson: 0 };
    }
  });
  ipcMain.handle("people:get-search-history", async () => {
    try {
      const { personSearchService } = await import("./personSearchService-DSriwG67.js");
      return personSearchService.getSearchHistory();
    } catch (error) {
      return [];
    }
  });
  ipcMain.handle("people:add-search-history", async (_, query) => {
    try {
      const { personSearchService } = await import("./personSearchService-DSriwG67.js");
      personSearchService.addToHistory(query);
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  });
  ipcMain.handle("people:clear-search-history", async () => {
    try {
      const { personSearchService } = await import("./personSearchService-DSriwG67.js");
      personSearchService.clearHistory();
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  });
  ipcMain.handle("config:get", async () => {
    try {
      const configService2 = getConfigService();
      return configService2.getConfig();
    } catch (error) {
      console.error("获取配置失败:", error);
      return null;
    }
  });
  ipcMain.handle("config:set-api-key", async (event, apiKey) => {
    try {
      const configService2 = getConfigService();
      configService2.setApiKey(apiKey);
      return { success: true };
    } catch (error) {
      console.error("设置 API Key 失败:", error);
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle("config:get-llm-status", async () => {
    try {
      const configService2 = getConfigService();
      const config = configService2.getLLMConfig();
      return {
        configured: configService2.isLLMConfigured(),
        provider: config.provider,
        hasApiKey: !!config.apiKey
      };
    } catch (error) {
      console.error("获取 LLM 状态失败:", error);
      return { configured: false, provider: "none", hasApiKey: false };
    }
  });
  ipcMain.handle("config:set-theme", async (event, theme) => {
    try {
      const configService2 = getConfigService();
      configService2.setTheme(theme);
      return { success: true };
    } catch (error) {
      console.error("设置主题失败:", error);
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle("suggestions:get", async (event, query) => {
    try {
      const suggestions = suggestionService?.getSuggestions(query) || [];
      return suggestions;
    } catch (error) {
      console.error("获取搜索建议失败:", error);
      return [];
    }
  });
  ipcMain.handle("suggestions:add-history", async (event, query, resultCount) => {
    try {
      suggestionService?.addToHistory(query, resultCount);
      return { success: true };
    } catch (error) {
      console.error("添加搜索历史失败:", error);
      return { success: false };
    }
  });
  ipcMain.handle("suggestions:get-history", async () => {
    try {
      return suggestionService?.getHistory() || [];
    } catch (error) {
      console.error("获取搜索历史失败:", error);
      return [];
    }
  });
  ipcMain.handle("suggestions:clear-history", async () => {
    try {
      suggestionService?.clearHistory();
      return { success: true };
    } catch (error) {
      console.error("清空搜索历史失败:", error);
      return { success: false };
    }
  });
  ipcMain.handle("suggestions:get-popular", async () => {
    try {
      return suggestionService?.getPopularSearches() || [];
    } catch (error) {
      console.error("获取热门搜索失败:", error);
      return [];
    }
  });
  ipcMain.handle("app:get-version", () => {
    return app.getVersion();
  });
  ipcMain.handle("window:minimize", () => {
    mainWindow?.minimize();
  });
  ipcMain.handle("window:maximize", () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  ipcMain.handle("window:close", () => {
    mainWindow?.close();
  });
  console.log("IPC 处理程序已注册");
}
function generateMockPhotos(limit, offset) {
  const photos = [];
  const locations = [
    { name: "日本东京", lat: 35.6762, lng: 139.6503 },
    { name: "新疆乌鲁木齐", lat: 43.8256, lng: 87.6168 },
    { name: "北京", lat: 39.9042, lng: 116.4074 },
    { name: "上海", lat: 31.2304, lng: 121.4737 },
    { name: "家里", lat: 39.9042, lng: 116.4074 }
  ];
  for (let i = offset; i < offset + limit; i++) {
    const year = 2015 + Math.floor(i / 100);
    const month = i % 12 + 1;
    const day = i % 28 + 1;
    photos.push({
      id: i,
      uuid: `photo-${i}`,
      cloudId: `cloud-${i}`,
      fileName: `IMG_${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}_${i}.jpg`,
      fileSize: Math.floor(Math.random() * 5e6) + 1e6,
      width: 4032,
      height: 3024,
      takenAt: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T10:30:00Z`,
      exif: {
        camera: "iPhone 15 Pro Max",
        lens: "f/1.8",
        iso: 100,
        aperture: 1.8,
        shutterSpeed: "1/120"
      },
      location: locations[i % locations.length],
      status: "icloud",
      thumbnailPath: null
    });
  }
  return photos;
}
function generateMockPeople() {
  return [
    { id: 1, name: "爸爸", face_count: 156 },
    { id: 2, name: "妈妈", face_count: 142 },
    { id: 3, name: "儿子", face_count: 89 },
    { id: 4, name: "我", face_count: 234 },
    { id: 5, name: "爷爷奶奶", face_count: 67 }
  ];
}
function generateMockPlaces() {
  return [
    { place_name: "日本东京", photo_count: 245 },
    { place_name: "新疆", photo_count: 189 },
    { place_name: "北京", photo_count: 156 },
    { place_name: "上海", photo_count: 98 },
    { place_name: "家里", photo_count: 423 }
  ];
}
function generateMockAlbums() {
  return [
    { id: "smart-places", name: "按地点浏览", type: "smart", items: generateMockPlaces() },
    { id: "smart-people", name: "按人物浏览", type: "smart", items: generateMockPeople() }
  ];
}
function extractPhotoUuidFromPath(path) {
  const match = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : null;
}
app.whenReady().then(async () => {
  registerLocalResourceProtocol();
  await initServices();
  await checkAndRecoverScanJob();
  setupIPCHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  database?.close();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  database?.close();
});
process.on("uncaughtException", (error) => {
  console.error("未捕获的异常:", error);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("未处理的 Promise 拒绝:", reason);
});
export {
  PhotoDatabase as P,
  getConfigService as a,
  getEmbeddingService as b,
  faceDetectionService as c,
  faceMatchingService as f,
  getEmbeddingService$1 as g,
  similarityService as s,
  textPreprocessor as t
};
//# sourceMappingURL=index-BYkeoRh9.js.map
