/**
 * PhotoMind - 配置服务
 *
 * 管理应用配置，包括 API 设置
 */
import { resolve } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export interface AppConfig {
  llm: {
    provider: 'deepseek' | 'openai' | 'none'
    apiKey: string
    baseUrl: string
    model: string
  }
  appearance: {
    theme: 'light' | 'dark' | 'system'
  }
}

export class ConfigService {
  private configPath: string
  private config: AppConfig

  constructor() {
    this.configPath = resolve(__dirname, '../../data/config.json')
    this.config = this.loadConfig()
  }

  /**
   * 加载配置
   */
  private loadConfig(): AppConfig {
    const defaultConfig: AppConfig = {
      llm: {
        provider: 'none',
        apiKey: '',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat'
      },
      appearance: {
        theme: 'system'
      }
    }

    try {
      if (existsSync(this.configPath)) {
        const fileContent = readFileSync(this.configPath, 'utf-8')
        const loadedConfig = JSON.parse(fileContent)
        // 合并配置
        return {
          llm: { ...defaultConfig.llm, ...loadedConfig.llm },
          appearance: { ...defaultConfig.appearance, ...loadedConfig.appearance }
        }
      }
    } catch (error) {
      console.error('加载配置失败:', error)
    }

    return defaultConfig
  }

  /**
   * 保存配置
   */
  private saveConfig(): void {
    try {
      const dir = resolve(this.configPath, '..')
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (error) {
      console.error('保存配置失败:', error)
    }
  }

  /**
   * 获取完整配置
   */
  getConfig(): AppConfig {
    return this.config
  }

  /**
   * 获取 LLM 配置
   */
  getLLMConfig(): AppConfig['llm'] {
    return this.config.llm
  }

  /**
   * 设置 API Key
   */
  setApiKey(apiKey: string): void {
    this.config.llm.apiKey = apiKey
    if (apiKey) {
      this.config.llm.provider = 'deepseek'
    }
    this.saveConfig()
  }

  /**
   * 设置 LLM 提供商
   */
  setLLMProvider(provider: 'deepseek' | 'openai' | 'none'): void {
    this.config.llm.provider = provider
    if (provider === 'none') {
      this.config.llm.apiKey = ''
    }
    this.saveConfig()
  }

  /**
   * 设置 Base URL
   */
  setBaseUrl(baseUrl: string): void {
    this.config.llm.baseUrl = baseUrl
    this.saveConfig()
  }

  /**
   * 设置模型
   */
  setModel(model: string): void {
    this.config.llm.model = model
    this.saveConfig()
  }

  /**
   * 检查是否已配置 LLM
   */
  isLLMConfigured(): boolean {
    return !!(
      this.config.llm.apiKey &&
      this.config.llm.provider !== 'none'
    )
  }

  /**
   * 设置主题
   */
  setTheme(theme: 'light' | 'dark' | 'system'): void {
    this.config.appearance.theme = theme
    this.saveConfig()
  }

  /**
   * 获取主题
   */
  getTheme(): 'light' | 'dark' | 'system' {
    return this.config.appearance.theme
  }
}

// 导出单例
let configService: ConfigService | null = null

export function getConfigService(): ConfigService {
  if (!configService) {
    configService = new ConfigService()
  }
  return configService
}
