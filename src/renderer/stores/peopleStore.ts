/**
 * PhotoMind - People Store
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Person {
  id: number
  name: string
  display_name?: string
  face_count: number
  created_at?: string
  is_manual?: number
}

export interface Photo {
  id: number
  uuid: string
  file_name: string
  taken_at: string
  location_data?: any
  thumbnail_path?: string
}

export const usePeopleStore = defineStore('people', () => {
  // 状态
  const people = ref<Person[]>([])
  const loading = ref(false)
  const selectedPerson = ref<Person | null>(null)
  const personPhotos = ref<Photo[]>([])

  // Actions

  /**
   * 获取所有人物
   */
  async function fetchPeople() {
    loading.value = true
    try {
      const result = await (window as any).photoAPI.people.getAll()
      people.value = result || []
    } catch (error) {
      console.error('获取人物列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 搜索人物
   */
  async function searchPeople(query: string): Promise<Person[]> {
    try {
      const result = await (window as any).photoAPI.people.search(query)
      return result || []
    } catch (error) {
      console.error('搜索人物失败:', error)
      return []
    }
  }

  /**
   * 添加人物
   */
  async function addPerson(person: { name: string; displayName?: string }): Promise<boolean> {
    try {
      const result = await (window as any).photoAPI.people.add(person)
      if (result > 0) {
        await fetchPeople()
        return true
      }
      return false
    } catch (error) {
      console.error('添加人物失败:', error)
      return false
    }
  }

  /**
   * 选择人物并加载其照片
   */
  async function selectPerson(person: Person) {
    selectedPerson.value = person
    await loadPersonPhotos(person.name)
  }

  /**
   * 加载某人物的所有照片
   */
  async function loadPersonPhotos(personName: string) {
    loading.value = true
    try {
      const result = await (window as any).photoAPI.people.searchPhotos(personName)
      personPhotos.value = result?.results || []
    } catch (error) {
      console.error('加载人物照片失败:', error)
      personPhotos.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * 清空选择
   */
  function clearSelection() {
    selectedPerson.value = null
    personPhotos.value = []
  }

  return {
    people,
    loading,
    selectedPerson,
    personPhotos,
    fetchPeople,
    searchPeople,
    addPerson,
    selectPerson,
    loadPersonPhotos,
    clearSelection,
  }
})
