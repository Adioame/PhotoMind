import { P as PhotoDatabase } from "./index-BYkeoRh9.js";
class PersonService {
  database;
  constructor(database) {
    this.database = database || new PhotoDatabase();
  }
  /**
   * 获取所有人物
   */
  getAllPersons() {
    const persons = this.database.getAllPersons();
    return persons.map((p) => ({
      id: p.id,
      name: p.name,
      display_name: p.display_name || p.name,
      face_count: p.face_count || 0,
      created_at: p.created_at,
      is_manual: !!p.is_manual
    }));
  }
  /**
   * 根据 ID 获取人物
   */
  getPersonById(id) {
    const person = this.database.getPersonById(id);
    if (!person) return null;
    return {
      id: person.id,
      name: person.name,
      display_name: person.display_name || person.name,
      face_count: person.face_count || 0,
      created_at: person.created_at,
      is_manual: !!person.is_manual
    };
  }
  /**
   * 添加新人物
   */
  addPerson(params) {
    try {
      const existing = this.searchPersons(params.name);
      const normalizedName = params.name.toLowerCase().trim();
      const found = existing.find((p) => p.name.toLowerCase() === normalizedName);
      if (found) {
        return {
          success: false,
          error: `人物 "${params.name}" 已存在`
        };
      }
      const personId = this.database.addPerson({
        name: params.name,
        displayName: params.displayName || params.name
      });
      console.log(`[PersonService] 添加新人物: ${params.name} (ID: ${personId})`);
      return { success: true, personId };
    } catch (error) {
      console.error("[PersonService] 添加人物失败:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误"
      };
    }
  }
  /**
   * 更新人物信息
   */
  updatePerson(id, params) {
    return this.database.updatePerson(id, {
      name: params.name,
      displayName: params.displayName
    });
  }
  /**
   * 删除人物
   */
  deletePerson(id) {
    try {
      this.database.run("DELETE FROM faces WHERE person_id = ?", [id]);
      this.database.run("DELETE FROM persons WHERE id = ?", [id]);
      console.log(`[PersonService] 删除人物 ID: ${id}`);
      return true;
    } catch (error) {
      console.error("[PersonService] 删除人物失败:", error);
      return false;
    }
  }
  /**
   * 搜索人物
   */
  searchPersons(query) {
    const results = this.database.searchPersons(query);
    return results.map((p) => ({
      id: p.id,
      name: p.name,
      display_name: p.display_name || p.name,
      face_count: p.face_count || 0,
      created_at: p.created_at,
      is_manual: !!p.is_manual
    }));
  }
  /**
   * 为照片标记人物
   */
  tagPerson(params) {
    try {
      const photo = this.database.getPhotoById(params.photoId);
      if (!photo) {
        return { success: false, error: "照片不存在" };
      }
      const person = this.database.getPersonById(params.personId);
      if (!person) {
        return { success: false, error: "人物不存在" };
      }
      const existingTags = this.database.getFacesByPhoto(params.photoId);
      const alreadyTagged = existingTags.some((f) => f.person_id === params.personId);
      if (alreadyTagged) {
        return { success: false, error: "该照片已标记此人物" };
      }
      const tagId = this.database.addFace({
        photoId: params.photoId,
        personId: params.personId,
        boundingBox: params.boundingBox,
        confidence: 1,
        isManual: 1
        // 手动标记
      });
      this.updatePersonFaceCount(params.personId);
      console.log(`[PersonService] 为照片 ${params.photoId} 标记人物: ${person.name}`);
      return { success: true, tagId };
    } catch (error) {
      console.error("[PersonService] 标记人物失败:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误"
      };
    }
  }
  /**
   * 移除照片的人物标签
   */
  untagPerson(photoId, personId) {
    try {
      this.database.run(
        "DELETE FROM faces WHERE photo_id = ? AND person_id = ?",
        [photoId, personId]
      );
      this.updatePersonFaceCount(personId);
      console.log(`[PersonService] 移除照片 ${photoId} 的人物标签`);
      return true;
    } catch (error) {
      console.error("[PersonService] 移除标签失败:", error);
      return false;
    }
  }
  /**
   * 获取照片的所有人物标签
   */
  getPhotoTags(photoId) {
    const faces = this.database.getFacesByPhoto(photoId);
    return faces.map((f) => ({
      id: f.id,
      photo_id: f.photo_id,
      person_id: f.person_id,
      person_name: f.person_name || "未知",
      bounding_box: f.bounding_box ? JSON.parse(f.bounding_box) : void 0,
      confidence: f.confidence || 0,
      is_manual: !!f.is_manual
    }));
  }
  /**
   * 获取某人物的所有照片
   */
  getPersonPhotos(personId) {
    return this.database.getPhotosByPerson(personId);
  }
  /**
   * 根据人物名称搜索照片
   */
  searchPhotosByPerson(personName) {
    return this.database.searchPhotosByPerson(personName);
  }
  /**
   * 更新人物 face_count
   */
  updatePersonFaceCount(personId) {
    const photos = this.database.getPhotosByPerson(personId);
    this.database.run(
      "UPDATE persons SET face_count = ? WHERE id = ?",
      [photos.length, personId]
    );
  }
  /**
   * 获取人物统计
   */
  getStats() {
    const persons = this.getAllPersons();
    const totalTags = persons.reduce((sum, p) => sum + p.face_count, 0);
    return {
      totalPersons: persons.length,
      totalTags
    };
  }
  /**
   * 批量标记人物
   */
  tagPersons(photoId, personIds) {
    let tagged = 0;
    const errors = [];
    for (const personId of personIds) {
      const result = this.tagPerson({ photoId, personId });
      if (result.success) {
        tagged++;
      } else if (result.error) {
        errors.push(result.error);
      }
    }
    return { success: errors.length === 0, tagged, errors };
  }
  /**
   * 移除照片的所有人物标签
   */
  untagAllPersons(photoId) {
    try {
      const tags = this.getPhotoTags(photoId);
      const personIds = [...new Set(tags.map((t) => t.person_id))];
      this.database.run("DELETE FROM faces WHERE photo_id = ?", [photoId]);
      for (const personId of personIds) {
        this.updatePersonFaceCount(personId);
      }
      console.log(`[PersonService] 移除照片 ${photoId} 的所有人物标签`);
      return true;
    } catch (error) {
      console.error("[PersonService] 移除所有标签失败:", error);
      return false;
    }
  }
}
const personService = new PersonService();
export {
  PersonService,
  personService
};
//# sourceMappingURL=personService-BIW1ThMf.js.map
