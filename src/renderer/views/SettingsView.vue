<template>
  <div class="settings-container">
    <header class="header">
      <h1>设置</h1>
    </header>

    <div class="settings-content">
      <!-- AI 设置 -->
      <n-card title="AI 搜索配置" class="settings-card">
        <template #header-extra>
          <n-tag :type="llmConfigured ? 'success' : 'warning'">
            {{ llmConfigured ? '已配置' : '未配置' }}
          </n-tag>
        </template>

        <n-form label-placement="left" label-width="120">
          <!-- API Provider -->
          <n-form-item label="API 提供商">
            <n-select
              v-model:value="config.llm.provider"
              :options="providerOptions"
              placeholder="选择 API 提供商"
            />
          </n-form-item>

          <!-- API Key -->
          <n-form-item label="API Key">
            <n-input
              v-model:value="config.llm.apiKey"
              type="password"
              show-password-on="click"
              placeholder="输入你的 DeepSeek API Key"
            />
          </n-form-item>

          <!-- Base URL -->
          <n-form-item label="API 地址">
            <n-input
              v-model:value="config.llm.baseUrl"
              placeholder="https://api.deepseek.com"
            />
          </n-form-item>

          <!-- Model -->
          <n-form-item label="模型">
            <n-input
              v-model:value="config.llm.model"
              placeholder="deepseek-chat"
            />
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button @click="testConnection" :loading="testing">
              测试连接
            </n-button>
            <n-button type="primary" @click="saveConfig" :loading="saving">
              保存配置
            </n-button>
          </n-space>
        </template>
      </n-card>

      <!-- 主题设置 -->
      <n-card title="外观设置" class="settings-card">
        <n-form label-placement="left" label-width="120">
          <n-form-item label="主题">
            <n-radio-group v-model:value="config.appearance.theme" name="theme">
              <n-radio-button value="light">浅色</n-radio-button>
              <n-radio-button value="dark">深色</n-radio-button>
              <n-radio-button value="system">跟随系统</n-radio-button>
            </n-radio-group>
          </n-form-item>
        </n-form>
      </n-card>

      <!-- 存储设置 -->
      <n-card title="存储设置" class="settings-card">
        <n-descriptions :column="1" label-placement="left">
          <n-descriptions-item label="照片数量">
            {{ stats.photoCount || 0 }} 张
          </n-descriptions-item>
          <n-descriptions-item label="人物数量">
            {{ stats.personCount || 0 }} 人
          </n-descriptions-item>
          <n-descriptions-item label="相册数量">
            {{ stats.albumCount || 0 }} 个
          </n-descriptions-item>
        </n-descriptions>

        <n-divider />

        <n-space>
          <n-button @click="clearDatabase" type="error" ghost>
            清空数据库
          </n-button>
          <n-button @click="refreshStats">
            刷新统计
          </n-button>
        </n-space>
      </n-card>

      <!-- 关于 -->
      <n-card title="关于 PhotoMind" class="settings-card">
        <n-descriptions :column="1" label-placement="left">
          <n-descriptions-item label="版本">
            {{ version }}
          </n-descriptions-item>
          <n-descriptions-item label="描述">
            智能图片管理系统 - 自然语言搜索 iCloud 照片
          </n-descriptions-item>
        </n-descriptions>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'

const message = useMessage()

// 状态
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const version = ref('')
const llmConfigured = ref(false)

const config = ref({
  llm: {
    provider: 'none',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat'
  },
  appearance: {
    theme: 'system' as 'light' | 'dark' | 'system'
  }
})

const stats = ref({
  photoCount: 0,
  personCount: 0,
  albumCount: 0,
  tagCount: 0
})

const providerOptions = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'OpenAI', value: 'openai' },
  { label: '不使用 AI', value: 'none' }
]

// 检查是否有 photoAPI
const hasPhotoAPI = () => !!(window as any).photoAPI

// 加载配置
const loadConfig = async () => {
  try {
    if (hasPhotoAPI()) {
      const loadedConfig = await (window as any).photoAPI.config.get()
      if (loadedConfig) {
        config.value = loadedConfig
      }

      const status = await (window as any).photoAPI.config.getLlmStatus()
      llmConfigured.value = status?.configured || false

      const appVersion = await (window as any).photoAPI.app.getVersion()
      version.value = appVersion || '1.0.0'
    }
  } catch (error) {
    console.error('加载配置失败:', error)
  } finally {
    loading.value = false
  }
}

// 保存配置
const saveConfig = async () => {
  saving.value = true
  try {
    if (hasPhotoAPI()) {
      await (window as any).photoAPI.config.setApiKey(config.value.llm.apiKey)
      await (window as any).photoAPI.config.setTheme(config.value.appearance.theme)
      message.success('配置已保存')
    }
  } catch (error) {
    message.error('保存配置失败')
    console.error(error)
  } finally {
    saving.value = false
  }
}

// 测试连接
const testConnection = async () => {
  testing.value = true
  try {
    if (!config.value.llm.apiKey) {
      message.warning('请先输入 API Key')
      return
    }

    // 简单测试 API 是否可访问
    const response = await fetch(`${config.value.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.value.llm.apiKey}`
      },
      body: JSON.stringify({
        model: config.value.llm.model,
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 5
      })
    })

    if (response.ok) {
      message.success('API 连接成功！')
    } else {
      message.error('API 连接失败，请检查配置')
    }
  } catch (error) {
    message.error('API 连接失败')
    console.error(error)
  } finally {
    testing.value = false
  }
}

// 清空数据库
const clearDatabase = async () => {
  message.info('此功能暂未实现')
}

// 刷新统计
const refreshStats = () => {
  message.info('此功能暂未实现')
}

// 初始化
onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
.settings-container {
  min-height: 100vh;
  background: #f5f5f7;
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
}

.header {
  margin-bottom: 24px;
}

.header h1 {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.settings-card {
  margin-bottom: 16px;
}
</style>
