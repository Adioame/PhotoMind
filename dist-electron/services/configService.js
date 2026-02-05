import { resolve } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
export class ConfigService {
    constructor() {
        this.configPath = resolve(__dirname, '../../data/config.json');
        this.config = this.loadConfig();
    }
    loadConfig() {
        const defaultConfig = {
            llm: {
                provider: 'none',
                apiKey: '',
                baseUrl: 'https://api.deepseek.com',
                model: 'deepseek-chat'
            },
            appearance: {
                theme: 'system'
            }
        };
        try {
            if (existsSync(this.configPath)) {
                const fileContent = readFileSync(this.configPath, 'utf-8');
                const loadedConfig = JSON.parse(fileContent);
                return {
                    llm: { ...defaultConfig.llm, ...loadedConfig.llm },
                    appearance: { ...defaultConfig.appearance, ...loadedConfig.appearance }
                };
            }
        }
        catch (error) {
            console.error('加载配置失败:', error);
        }
        return defaultConfig;
    }
    saveConfig() {
        try {
            const dir = resolve(this.configPath, '..');
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
            writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        }
        catch (error) {
            console.error('保存配置失败:', error);
        }
    }
    getConfig() {
        return this.config;
    }
    getLLMConfig() {
        return this.config.llm;
    }
    setApiKey(apiKey) {
        this.config.llm.apiKey = apiKey;
        if (apiKey) {
            this.config.llm.provider = 'deepseek';
        }
        this.saveConfig();
    }
    setLLMProvider(provider) {
        this.config.llm.provider = provider;
        if (provider === 'none') {
            this.config.llm.apiKey = '';
        }
        this.saveConfig();
    }
    setBaseUrl(baseUrl) {
        this.config.llm.baseUrl = baseUrl;
        this.saveConfig();
    }
    setModel(model) {
        this.config.llm.model = model;
        this.saveConfig();
    }
    isLLMConfigured() {
        return !!(this.config.llm.apiKey &&
            this.config.llm.provider !== 'none');
    }
    setTheme(theme) {
        this.config.appearance.theme = theme;
        this.saveConfig();
    }
    getTheme() {
        return this.config.appearance.theme;
    }
}
let configService = null;
export function getConfigService() {
    if (!configService) {
        configService = new ConfigService();
    }
    return configService;
}
//# sourceMappingURL=configService.js.map