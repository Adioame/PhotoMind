/**
 * PhotoMind - 设置视图
 * 反AI味 · 现代极简主义设计
 */
<template>
  <div class="settings-container">
    <!-- 页面头部 -->
    <header class="page-header">
      <div class="header-content">
        <h1>设置</h1>
        <p class="subtitle">管理应用配置和偏好</p>
      </div>
    </header>

    <div class="settings-content">
      <!-- AI 设置 -->
      <section class="settings-section">
        <div class="section-header">
          <h2>
            <n-icon size="20"><Bot24Regular /></n-icon>
            AI 搜索配置
          </h2>
          <n-tag :type="llmConfigured ? 'success' : 'warning'" size="small">
            {{ llmConfigured ? '已配置' : '未配置' }}
          </n-tag>
        </div>

        <div class="settings-card">
          <n-form label-placement="left" label-width="120">
            <n-form-item label="API 提供商">
              <n-select
                v-model:value="config.llm.provider"
                :options="providerOptions"
                placeholder="选择 API 提供商"
              />
            </n-form-item>

            <n-form-item label="API Key">
              <n-input
                v-model:value="config.llm.apiKey"
                type="password"
                show-password-on="click"
                placeholder="输入你的 DeepSeek API Key"
              />
            </n-form-item>

            <n-form-item label="API 地址">
              <n-input
                v-model:value="config.llm.baseUrl"
                placeholder="https://api.deepseek.com"
              />
            </n-form-item>

            <n-form-item label="模型">
              <n-input
                v-model:value="config.llm.model"
                placeholder="deepseek-chat"
              />
            </n-form-item>
          </n-form>

          <div class="card-actions">
            <n-space>
              <n-button @click="testConnection" :loading="testing">
                测试连接
              </n-button>
              <n-button type="primary" @click="saveConfig" :loading="saving">
                保存配置
              </n-button>
            </n-space>
          </div>
        </div>
      </section>

      <!-- 外观设置 -->
      <section class="settings-section">
        <div class="section-header">
          <h2>
            <n-icon size="20"><Color24Regular /></n-icon>
            外观设置
          </h2>
        </div>

        <div class="settings-card">
          <n-form label-placement="left" label-width="120">
            <n-form-item label="主题">
              <n-radio-group v-model:value="config.appearance.theme" name="theme">
                <n-radio-button value="light">浅色</n-radio-button>
                <n-radio-button value="dark">深色</n-radio-button>
                <n-radio-button value="system">跟随系统</n-radio-button>
              </n-radio-group>
            </n-form-item>
          </n-form>
        </div>
      </section>

      <!-- 存储统计 -->
      <section class="settings-section">
        <div class="section-header">
          <h2>
            <n-icon size="20"><Database24Regular /></n-icon>
            存储统计
          </h2>
        </div>

        <div class="settings-card">
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-value">{{ stats.photoCount || 0 }}</span>
              <span class="stat-label">照片</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ stats.personCount || 0 }}</span>
              <span class="stat-label">人物</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ stats.albumCount || 0 }}</span>
              <span class="stat-label">相册</span>
            </div>
          </div>

          <div class="card-actions">
            <n-space>
              <n-button @click="refreshStats" :loading="refreshingStats">
                <template #icon>
                  <n-icon><ArrowSync24Regular /></n-icon>
                </template>
                刷新统计
              </n-button>
              <n-button type="error" ghost @click="clearDatabase">
                <template #icon>
                  <n-icon><Delete24Regular /></n-icon>
                </template>
                清空数据库
              </n-button>
            </n-space>
          </div>
        </div>
      </section>

      <!-- 人脸向量重新生成 -->
      <section class="settings-section">
        <div class="section-header">
          <h2>
            <n-icon size="20"><PeopleCheckmark24Regular /></n-icon>
            人脸向量重新生成
          </h2>
          <n-tag
            :type="regenerateStatus === 'completed' ? 'success' : regenerateStatus === 'running' ? 'warning' : 'default'"
            size="small"
          >
            {{ statusText }}
          </n-tag>
        </div>

        <div class="settings-card">
          <div class="progress-stats" v-if="regenerateProgress.totalFaces > 0">
            <div class="progress-stat">
              <span class="progress-label">待处理人脸</span>
              <span class="progress-value">{{ regenerateProgress.totalFaces }} 张</span>
            </div>
            <div class="progress-stat">
              <span class="progress-label">已处理</span>
              <span class="progress-value">
                {{ regenerateProgress.processedCount }} 张
                <span v-if="regenerateProgress.totalFaces > 0" class="progress-percent">
                  ({{ Math.round((regenerateProgress.processedCount / regenerateProgress.totalFaces) * 100) }}%)
                </span>
              </span>
            </div>
            <div class="progress-stat">
              <span class="progress-label">成功/失败</span>
              <span class="progress-value">
                <span class="success-text">{{ regenerateProgress.successCount }}</span>
                /
                <span class="error-text">{{ regenerateProgress.failedCount }}</span>
              </span>
            </div>
          </div>

          <n-progress
            v-if="regenerateProgress.totalFaces > 0"
            type="line"
            :percentage="Math.round((regenerateProgress.processedCount / regenerateProgress.totalFaces) * 100)"
            :indicator-placement="'inside'"
            :processing="regenerateStatus === 'running'"
            class="regenerate-progress"
          />

          <div class="card-actions">
            <n-space>
              <n-button
                type="primary"
                :loading="regenerateStatus === 'running'"
                :disabled="regenerateStatus === 'running' || regenerateProgress.totalFaces === 0"
                @click="startRegenerate"
              >
                <template #icon>
                  <n-icon><Play24Regular /></n-icon>
                </template>
                {{ regenerateStatus === 'paused' ? '继续' : '开始重新生成' }}
              </n-button>
              <n-button
                :disabled="regenerateStatus !== 'running'"
                @click="pauseRegenerate"
              >
                <template #icon>
                  <n-icon><Pause24Regular /></n-icon>
                </template>
                暂停
              </n-button>
              <n-button @click="loadRegenerateProgress">
                <template #icon>
                  <n-icon><ArrowSync24Regular /></n-icon>
                </template>
                刷新进度
              </n-button>
              <n-popconfirm @positive-click="resetRegenerate">
                <template #trigger>
                  <n-button type="warning" ghost>
                    <template #icon>
                      <n-icon><ArrowReset24Regular /></n-icon>
                    </template>
                    重置进度
                  </n-button>
                </template>
                确定要重置重新生成进度吗？这将允许从头开始重新生成所有向量。
              </n-popconfirm>
            </n-space>

            <n-divider />

            <n-space>
              <n-button @click="reclusterFaces" :loading="reclustering">
                <template #icon>
                  <n-icon><PeopleSync24Regular /></n-icon>
                </template>
                重新聚类
              </n-button>
              <n-button @click="cleanupEmptyPersons" :loading="cleaning">
                <template #icon>
                  <n-icon><Broom24Regular /></n-icon>
                </template>
                清理空人物
              </n-button>
            </n-space>
          </div>
        </div>
      </section>

      <!-- 质量验证 -->
      <section class="settings-section">
        <div class="section-header">
          <h2>
            <n-icon size="20"><CheckmarkCircle24Regular /></n-icon>
            质量验证
          </h2>
          <n-tag
            v-if="qualityReport"
            :type="qualityReport.overallScore >= 70 ? 'success' : 'warning'"
            size="small"
          >
            综合分数: {{ qualityReport.overallScore.toFixed(1) }}
          </n-tag>
        </div>

        <div class="settings-card">
          <div v-if="qualityReport" class="quality-stats">
            <div class="quality-stat">
              <span class="quality-label">人物数量</span>
              <span class="quality-value">{{ qualityReport.clustering?.totalPersons || 0 }}</span>
            </div>
            <div class="quality-stat">
              <span class="quality-label">人脸总数</span>
              <span class="quality-value">{{ qualityReport.clustering?.totalFaces || 0 }}</span>
            </div>
            <div class="quality-stat">
              <span class="quality-label">同一人相似度</span>
              <span class="quality-value">{{ qualityReport.clustering?.samePersonAvg?.toFixed(3) || 'N/A' }}</span>
            </div>
            <div class="quality-stat">
              <span class="quality-label">不同人相似度</span>
              <span class="quality-value">{{ qualityReport.clustering?.differentPersonAvg?.toFixed(3) || 'N/A' }}</span>
            </div>
            <div class="quality-stat">
              <span class="quality-label">聚类通过率</span>
              <span class="quality-value">{{ ((qualityReport.clustering?.passRate || 0) * 100).toFixed(1) }}%</span>
            </div>
            <div class="quality-stat">
              <span class="quality-label">边界案例</span>
              <span class="quality-value">{{ qualityReport.clustering?.boundaryCases?.length || 0 }} 个</span>
            </div>
          </div>

          <n-alert v-else type="info" :show-icon="false" class="settings-alert">
            尚未运行质量验证，点击下方按钮开始测试。
          </n-alert>

          <div class="card-actions">
            <n-space>
              <n-button @click="runQualityValidation" :loading="validating" type="primary">
                <template #icon>
                  <n-icon><Play24Regular /></n-icon>
                </template>
                运行质量验证
              </n-button>
              <n-button @click="checkVectorDimensions" :loading="checkingVectors">
                <template #icon>
                  <n-icon><Ruler24Regular /></n-icon>
                </template>
                检查向量维度
              </n-button>
            </n-space>
          </div>

          <!-- 建议列表 -->
          <n-collapse v-if="qualityReport?.recommendations?.length" class="recommendations">
            <n-collapse-item title="优化建议">
              <n-list>
                <n-list-item v-for="(rec, index) in qualityReport.recommendations" :key="index">
                  {{ rec }}
                </n-list-item>
              </n-list>
            </n-collapse-item>
          </n-collapse>
        </div>
      </section>

      <!-- 性能测试 -->
      <section class="settings-section">
        <div class="section-header">
          <h2>
            <n-icon size="20"><TopSpeed24Regular /></n-icon>
            性能测试
          </h2>
          <n-tag
            v-if="perfResult"
            :type="perfResult.overallScore >= 70 ? 'success' : 'warning'"
            size="small"
          >
            综合分数: {{ perfResult.overallScore.toFixed(1) }}
          </n-tag>
        </div>

        <div class="settings-card">
          <div v-if="perfResult" class="perf-stats">
            <div class="perf-stat">
              <span class="perf-label">搜索平均响应</span>
              <span class="perf-value">{{ perfResult.searchPerformance?.avgResponseTime?.toFixed(0) || 0 }}ms</span>
            </div>
            <div class="perf-stat">
              <span class="perf-label">搜索 P95</span>
              <span class="perf-value">{{ perfResult.searchPerformance?.p95ResponseTime?.toFixed(0) || 0 }}ms</span>
            </div>
            <div class="perf-stat">
              <span class="perf-label">搜索通过率</span>
              <span class="perf-value">{{ ((perfResult.searchPerformance?.passRate || 0) * 100).toFixed(1) }}%</span>
            </div>
            <div class="perf-stat">
              <span class="perf-label">内存峰值</span>
              <span class="perf-value">{{ perfResult.memoryUsage?.peakMemoryMB?.toFixed(0) || 0 }}MB</span>
            </div>
          </div>

          <n-alert v-else type="info" :show-icon="false" class="settings-alert">
            尚未运行性能测试，点击下方按钮开始测试。
          </n-alert>

          <div class="card-actions">
            <n-space>
              <n-button @click="runPerfTest" :loading="testingPerf" type="primary">
                <template #icon>
                  <n-icon><Play24Regular /></n-icon>
                </template>
                运行完整性能测试
              </n-button>
              <n-button @click="testSearchOnly" :loading="testingSearch">
                仅测试搜索
              </n-button>
              <n-button @click="testMemoryOnly" :loading="testingMemory">
                仅测试内存
              </n-button>
            </n-space>
          </div>

          <!-- 建议列表 -->
          <n-collapse v-if="perfResult?.recommendations?.length" class="recommendations">
            <n-collapse-item title="优化建议">
              <n-list>
                <n-list-item v-for="(rec, index) in perfResult.recommendations" :key="index">
                  {{ rec }}
                </n-list-item>
              </n-list>
            </n-collapse-item>
          </n-collapse>
        </div>
      </section>

      <!-- 关于 -->
      <section class="settings-section">
        <div class="section-header">
          <h2>
            <n-icon size="20"><Info24Regular /></n-icon>
            关于 PhotoMind
          </h2>
        </div>

        <div class="settings-card about-card">
          <div class="about-content">
            <div class="app-logo">
              <n-icon size="48" color="#0071E3"><Image24Regular /></n-icon>
            </div>
            <div class="app-info">
              <h3>PhotoMind</h3>
              <p class="version">版本 {{ version }}</p>
              <p class="description">智能图片管理系统 - 自然语言搜索 iCloud 照片</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMessage } from 'naive-ui'
import {
  Bot24Regular,
  Color24Regular,
  Database24Regular,
  PeopleCheckmark24Regular,
  CheckmarkCircle24Regular,
  TopSpeed24Regular,
  Info24Regular,
  Image24Regular,
  ArrowSync24Regular,
  Delete24Regular,
  Play24Regular,
  Pause24Regular,
  ArrowReset24Regular,
  Broom24Regular,
  Ruler24Regular
} from '@vicons/fluent'

const message = useMessage()

// 状态
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const refreshingStats = ref(false)
const version = ref('1.0.0')
const llmConfigured = ref(false)

// 重新生成相关状态
const regenerateStatus = ref<'idle' | 'running' | 'paused' | 'completed' | 'error'>('idle')
const regenerateProgress = ref({
  totalFaces: 0,
  processedCount: 0,
  successCount: 0,
  failedCount: 0,
  currentFaceId: null as string | null,
  status: 'idle' as 'idle' | 'running' | 'paused' | 'completed' | 'error',
  startTime: null as string | null,
  endTime: null as string | null,
  errors: [] as Array<{ faceId: string; error: string }>
})
const reclustering = ref(false)
const cleaning = ref(false)

// 监听重新生成进度
let unsubscribeProgress: (() => void) | null = null

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

// 状态显示文本
const statusText = computed(() => {
  const statusMap: Record<string, string> = {
    idle: '未开始',
    running: '进行中',
    paused: '已暂停',
    completed: '已完成',
    error: '出错'
  }
  return statusMap[regenerateStatus.value] || '未知'
})

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

      // 加载统计
      await refreshStats()
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
const refreshStats = async () => {
  refreshingStats.value = true
  try {
    const api = (window as any).photoAPI
    if (api?.stats?.get) {
      const result = await api.stats.get()
      stats.value = {
        photoCount: result.photoCount || 0,
        personCount: result.personCount || 0,
        albumCount: result.albumCount || 0,
        tagCount: result.tagCount || 0
      }
    }
  } catch (error) {
    console.error('刷新统计失败:', error)
  } finally {
    refreshingStats.value = false
  }
}

// 加载重新生成进度
const loadRegenerateProgress = async () => {
  try {
    const api = (window as any).photoAPI
    if (api?.faceMatching?.regenerateGetProgress) {
      const progress = await api.faceMatching.regenerateGetProgress()
      if (progress) {
        regenerateProgress.value = { ...regenerateProgress.value, ...progress }
        regenerateStatus.value = progress.status || 'idle'
      }
    }
  } catch (error) {
    console.error('加载重新生成进度失败:', error)
  }
}

// 开始重新生成
const startRegenerate = async () => {
  try {
    const api = (window as any).photoAPI
    if (api?.faceMatching?.regenerateStart) {
      regenerateStatus.value = 'running'

      if (unsubscribeProgress) {
        unsubscribeProgress()
      }
      unsubscribeProgress = api.faceMatching.onRegenerateProgress((progress: any) => {
        regenerateProgress.value = { ...regenerateProgress.value, ...progress }
        regenerateStatus.value = progress.status || 'running'
      })

      await api.faceMatching.regenerateStart({ batchSize: 50, resume: true })
      message.success('重新生成任务已开始')
    } else {
      message.error('API 不可用')
    }
  } catch (error) {
    message.error('开始重新生成失败')
    console.error(error)
    regenerateStatus.value = 'error'
  }
}

// 暂停重新生成
const pauseRegenerate = async () => {
  try {
    const api = (window as any).photoAPI
    if (api?.faceMatching?.regeneratePause) {
      await api.faceMatching.regeneratePause()
      regenerateStatus.value = 'paused'
      message.info('任务已暂停')
    }
  } catch (error) {
    message.error('暂停失败')
    console.error(error)
  }
}

// 重置重新生成
const resetRegenerate = async () => {
  try {
    const api = (window as any).photoAPI
    if (api?.faceMatching?.regenerateReset) {
      await api.faceMatching.regenerateReset()
      regenerateStatus.value = 'idle'
      regenerateProgress.value = {
        totalFaces: 0,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        currentFaceId: null,
        status: 'idle',
        startTime: null,
        endTime: null,
        errors: []
      }
      message.success('进度已重置')
    }
  } catch (error) {
    message.error('重置失败')
    console.error(error)
  }
}

// 重新聚类
const reclusterFaces = async () => {
  reclustering.value = true
  try {
    const api = (window as any).photoAPI
    if (api?.faceMatching?.regenerateRecluster) {
      const result = await api.faceMatching.regenerateRecluster()
      if (result.success) {
        message.success(`聚类完成: 创建 ${result.personsCreated} 个人物`)
      } else {
        message.error(`聚类失败: ${result.error}`)
      }
    }
  } catch (error) {
    message.error('重新聚类失败')
    console.error(error)
  } finally {
    reclustering.value = false
  }
}

// 清理空人物
const cleanupEmptyPersons = async () => {
  cleaning.value = true
  try {
    const api = (window as any).photoAPI
    if (api?.faceMatching?.cleanupPersons) {
      const result = await api.faceMatching.cleanupPersons()
      message.success(`清理了 ${result.deleted} 个空人物`)
    }
  } catch (error) {
    message.error('清理失败')
    console.error(error)
  } finally {
    cleaning.value = false
  }
}

// 质量验证状态
const qualityReport = ref<any>(null)
const validating = ref(false)
const checkingVectors = ref(false)

// 运行质量验证
const runQualityValidation = async () => {
  validating.value = true
  try {
    const api = (window as any).photoAPI
    if (api?.quality?.generateReport) {
      const result = await api.quality.generateReport()
      if (result && !result.error) {
        qualityReport.value = result
        message.success(`质量验证完成，综合分数: ${result.overallScore.toFixed(1)}`)
      } else {
        message.error(`验证失败: ${result?.error || '未知错误'}`)
      }
    } else {
      message.error('质量验证 API 不可用')
    }
  } catch (error) {
    message.error('质量验证失败')
    console.error(error)
  } finally {
    validating.value = false
  }
}

// 检查向量维度
const checkVectorDimensions = async () => {
  checkingVectors.value = true
  try {
    const api = (window as any).photoAPI
    if (api?.quality?.checkVectors) {
      const result = await api.quality.checkVectors()
      if (result && !result.error) {
        message.success(
          `人脸向量: ${result.faceEmbeddingDim}维 (${result.validFaces}张有效), 语义向量: ${result.semanticEmbeddingDim}维`
        )
      } else {
        message.error(`检查失败: ${result?.error || '未知错误'}`)
      }
    } else {
      message.error('向量检查 API 不可用')
    }
  } catch (error) {
    message.error('向量检查失败')
    console.error(error)
  } finally {
    checkingVectors.value = false
  }
}

// 性能测试状态
const perfResult = ref<any>(null)
const testingPerf = ref(false)
const testingSearch = ref(false)
const testingMemory = ref(false)

// 运行完整性能测试
const runPerfTest = async () => {
  testingPerf.value = true
  try {
    const api = (window as any).photoAPI
    if (api?.perf?.runFull) {
      message.info('性能测试进行中，请稍候...')
      const result = await api.perf.runFull()
      if (result && !result.error) {
        perfResult.value = result
        message.success(`性能测试完成，综合分数: ${result.overallScore.toFixed(1)}`)
      } else {
        message.error(`测试失败: ${result?.error || '未知错误'}`)
      }
    } else {
      message.error('性能测试 API 不可用')
    }
  } catch (error) {
    message.error('性能测试失败')
    console.error(error)
  } finally {
    testingPerf.value = false
  }
}

// 仅测试搜索
const testSearchOnly = async () => {
  testingSearch.value = true
  try {
    const api = (window as any).photoAPI
    if (api?.perf?.testSearch) {
      const result = await api.perf.testSearch(50)
      if (result && !result.error) {
        message.success(
          `搜索测试完成: 平均${result.avgResponseTime.toFixed(0)}ms, P95=${result.p95ResponseTime.toFixed(0)}ms`
        )
      } else {
        message.error(`测试失败: ${result?.error || '未知错误'}`)
      }
    } else {
      message.error('搜索测试 API 不可用')
    }
  } catch (error) {
    message.error('搜索测试失败')
    console.error(error)
  } finally {
    testingSearch.value = false
  }
}

// 仅测试内存
const testMemoryOnly = async () => {
  testingMemory.value = true
  try {
    const api = (window as any).photoAPI
    if (api?.perf?.testMemory) {
      const result = await api.perf.testMemory()
      if (result && !result.error) {
        message.success(`内存测试完成: 峰值${result.peakMemoryMB.toFixed(0)}MB ${result.pass ? '(通过)' : '(超标)'}`)
      } else {
        message.error(`测试失败: ${result?.error || '未知错误'}`)
      }
    } else {
      message.error('内存测试 API 不可用')
    }
  } catch (error) {
    message.error('内存测试失败')
    console.error(error)
  } finally {
    testingMemory.value = false
  }
}

// 初始化
onMounted(() => {
  loadConfig()
  loadRegenerateProgress()

  return () => {
    if (unsubscribeProgress) {
      unsubscribeProgress()
    }
  }
})
</script>

<style scoped>
/* ================================
   容器
   ================================ */
.settings-container {
  min-height: 100vh;
  background: var(--bg-primary);
  padding: calc(var(--nav-height) + var(--space-xl)) var(--space-lg) var(--space-lg);
  max-width: 800px;
  margin: 0 auto;
}

/* ================================
   页面头部
   ================================ */
.page-header {
  margin-bottom: var(--space-xl);
}

.header-content h1 {
  font-size: var(--text-hero);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin: 0 0 var(--space-xs);
  letter-spacing: -0.5px;
}

.subtitle {
  color: var(--text-secondary);
  margin: 0;
  font-size: var(--text-body);
}

/* ================================
   设置区块
   ================================ */
.settings-section {
  margin-bottom: var(--space-xl);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.section-header h2 {
  font-size: var(--text-h3);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.settings-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
}

.card-actions {
  margin-top: var(--space-lg);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--border-light);
}

/* ================================
   统计网格
   ================================ */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-lg);
  padding: var(--space-md) 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.stat-value {
  font-size: 32px;
  font-weight: var(--font-bold);
  color: var(--primary-default);
  line-height: 1.2;
}

.stat-label {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin-top: var(--space-xs);
}

/* ================================
   进度统计
   ================================ */
.progress-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.progress-stat {
  display: flex;
  flex-direction: column;
}

.progress-label {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin-bottom: var(--space-xs);
}

.progress-value {
  font-size: var(--text-h3);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.progress-percent {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin-left: var(--space-xs);
}

.success-text {
  color: var(--success-default);
}

.error-text {
  color: var(--error-default);
}

.regenerate-progress {
  margin-bottom: var(--space-lg);
}

/* ================================
   质量/性能统计
   ================================ */
.quality-stats,
.perf-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.quality-stat,
.perf-stat {
  display: flex;
  flex-direction: column;
  padding: var(--space-md);
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
}

.quality-label,
.perf-label {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin-bottom: var(--space-xs);
}

.quality-value,
.perf-value {
  font-size: var(--text-body);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

/* ================================
   警告框
   ================================ */
.settings-alert {
  margin-bottom: var(--space-lg);
  background: var(--primary-light) !important;
  border: none !important;
}

.settings-alert :deep(.n-alert-body) {
  color: var(--text-secondary);
}

/* ================================
   建议列表
   ================================ */
.recommendations {
  margin-top: var(--space-lg);
}

/* ================================
   关于卡片
   ================================ */
.about-card {
  padding: var(--space-xl);
}

.about-content {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
}

.app-logo {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #0071E3 0%, #00C6FF 100%);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-info h3 {
  font-size: var(--text-h2);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin: 0 0 var(--space-xs);
}

.version {
  font-size: var(--text-small);
  color: var(--text-secondary);
  margin: 0 0 var(--space-xs);
}

.description {
  font-size: var(--text-body);
  color: var(--text-secondary);
  margin: 0;
}

/* ================================
   响应式
   ================================ */
@media (max-width: 768px) {
  .stats-grid,
  .progress-stats,
  .quality-stats,
  .perf-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .about-content {
    flex-direction: column;
    text-align: center;
  }
}

@media (max-width: 480px) {
  .stats-grid,
  .progress-stats,
  .quality-stats,
  .perf-stats {
    grid-template-columns: 1fr;
  }
}
</style>
