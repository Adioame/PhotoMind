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

  // 🆕 最后访问的人物 ID（用于恢复状态）
  const lastVisitedPersonId = ref<number | null>(
    Number(localStorage.getItem('lastVisitedPersonId')) || null
  )

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
      const result = await (window as any).photoAPI.people.getPhotos({
        personId: selectedPerson.value?.id
      })
      // 🚨 修复：后端返回的是 { photo: {...}, taggedAt: ..., confidence: ... }
      // 需要提取 photo 属性
      const photos = result?.photos || []
      personPhotos.value = photos.map((p: any) => p.photo || p)
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

  /**
   * 🆕 根据 ID 获取人物信息
   */
  async function getPersonById(personId: number): Promise<Person | null> {
    // 如果本地已有，直接返回
    const cached = people.value.find(p => p.id === personId)
    if (cached) return cached

    // 否则从 API 获取
    try {
      const result = await (window as any).photoAPI.people.getById?.(personId)
      return result || null
    } catch (error) {
      console.error('获取人物详情失败:', error)
      return null
    }
  }

  /**
   * 🆕 记录最后访问的人物
   */
  function setLastVisitedPerson(personId: number | null) {
    lastVisitedPersonId.value = personId
    if (personId) {
      localStorage.setItem('lastVisitedPersonId', String(personId))
    } else {
      localStorage.removeItem('lastVisitedPersonId')
    }
  }

  return {
    people,
    loading,
    selectedPerson,
    personPhotos,
    lastVisitedPersonId,
    fetchPeople,
    searchPeople,
    addPerson,
    selectPerson,
    loadPersonPhotos,
    clearSelection,
    getPersonById,
    setLastVisitedPerson,
  }
})
