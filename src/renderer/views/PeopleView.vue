/**
 * PhotoMind - 人物视图
 */
<template>
  <div class="people-container">
    <!-- 头部 -->
    <header class="header">
      <div class="header-content">
        <h1>人物</h1>
        <p class="subtitle">{{ peopleStore.people.length }} 位人物</p>
      </div>
    </header>

    <!-- 人物列表 -->
    <section class="people-section" v-if="!peopleStore.selectedPerson">
      <div v-if="peopleStore.loading && peopleStore.people.length === 0" class="loading">
        <n-spin size="large" />
        <p>加载人物数据...</p>
      </div>

      <div v-else-if="peopleStore.people.length > 0" class="people-grid">
        <n-card
          v-for="person in peopleStore.people"
          :key="person.id"
          class="person-card"
          hoverable
          @click="selectPerson(person)"
        >
          <template #header>
            <div class="person-avatar">
              <n-avatar round size="large" :style="{ backgroundColor: getAvatarColor(person.name) }">
                {{ getInitials(person.name) }}
              </n-avatar>
            </div>
          </template>
          <div class="person-info">
            <h3>{{ person.display_name || person.name }}</h3>
            <p class="photo-count">{{ person.face_count }} 张照片</p>
          </div>
        </n-card>
      </div>

      <n-empty v-else description="暂无人物信息">
        <template #extra>
          <p class="hint">导入照片后，人物信息会自动显示</p>
        </template>
      </n-empty>
    </section>

    <!-- 人物详情（显示该人物的照片） -->
    <section v-else class="person-detail">
      <div class="detail-header">
        <n-button @click="clearSelection" type="primary" quaternary>
          <template #icon>
            <n-icon><ArrowLeft24Regular /></n-icon>
          </template>
          返回人物列表
        </n-button>
        <h2>{{ peopleStore.selectedPerson.display_name || peopleStore.selectedPerson.name }}</h2>
      </div>

      <div v-if="peopleStore.loading" class="loading">
        <n-spin size="large" />
      </div>

      <PhotoGrid
        v-else
        :photos="peopleStore.personPhotos"
        :loading="peopleStore.loading"
        @photo-click="openPhoto"
      />

      <n-empty
        v-if="peopleStore.personPhotos.length === 0 && !peopleStore.loading"
        description="该人物暂无照片"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft24Regular } from '@vicons/fluent'
import { usePeopleStore, type Person } from '@/stores/peopleStore'
import PhotoGrid from '../components/PhotoGrid.vue'

const router = useRouter()
const peopleStore = usePeopleStore()

// 颜色映射
const avatarColors = [
  '#5E6AD2', '#8B9EFF', '#FF6B6B', '#4ECDC4',
  '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
]

function getAvatarColor(name: string): string {
  const index = name.charCodeAt(0) % avatarColors.length
  return avatarColors[index]
}

function getInitials(name: string): string {
  return name.charAt(0).toUpperCase()
}

// 选择人物
const selectPerson = async (person: Person) => {
  await peopleStore.selectPerson(person)
}

// 清空选择
const clearSelection = () => {
  peopleStore.clearSelection()
}

// 打开照片详情
const openPhoto = (photo: any) => {
  router.push(`/photo/${photo.id || photo.uuid}`)
}

// 初始化
onMounted(() => {
  peopleStore.fetchPeople()
})
</script>

<style scoped>
.people-container {
  min-height: 100vh;
  background: #f5f5f7;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  text-align: center;
  padding: 32px 0;
}

.header h1 {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.subtitle {
  color: #666;
  margin-top: 8px;
}

.people-section {
  margin-top: 24px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: #666;
}

.people-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.person-card {
  cursor: pointer;
  text-align: center;
  transition: transform 0.2s;
}

.person-card:hover {
  transform: translateY(-2px);
}

.person-avatar {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.person-info h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px;
}

.photo-count {
  color: #666;
  font-size: 14px;
  margin: 0;
}

.hint {
  color: #999;
  font-size: 14px;
}

.person-detail {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.detail-header h2 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}
</style>
