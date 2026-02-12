/**
 * PhotoMind - i18n 国际化 Composable
 * Sprint-C-S3: 最小化实现，避免应用崩溃
 */
import { ref, computed } from 'vue'

// 可用语言列表
export const availableLocales = [
  { code: 'zh', name: '简体中文' },
  { code: 'en', name: 'English' }
]

// 翻译字典
const messages: Record<string, Record<string, string>> = {
  zh: {
    // 通用
    'common.loading': '加载中...',
    'common.save': '保存',
    'common.cancel': '取消',
    'common.confirm': '确认',
    'common.delete': '删除',
    'common.edit': '编辑',
    'common.back': '返回',
    'common.search': '搜索',
    'common.settings': '设置',
    'common.photos': '照片',
    'common.albums': '相册',
    'common.people': '人物',
    'common.timeline': '时间线',
    'common.home': '首页',

    // 首页
    'home.welcome': '欢迎回来',
    'home.subtitle': '你的智能照片库',
    'home.smartAlbums': '智能相册',
    'home.albumsDesc': '按时间、地点、人物自动整理',
    'home.albumsExample': '2024年春节、北京旅行',
    'home.people': '人物',
    'home.peopleDesc': '自动识别并聚合人物照片',
    'home.peopleExample': '家人、朋友、同事',
    'home.importPhotos': '导入照片',
    'home.importLocalDesc': '从本地文件夹导入照片',
    'home.syncPhotos': '同步照片',
    'home.syncCloudDesc': '从云端同步照片',
    'home.recentPhotos': '最近照片',
    'home.viewAll': '查看全部',
    'home.smartSearch': '智能搜索',
    'home.searchDesc': '通过自然语言搜索照片',
    'home.searchExample': '例如：2024年春天的樱花',
    'home.timeline': '时间线',
    'home.timelineDesc': '按时间顺序浏览照片',
    'home.timelineExample': '从最新到最旧',
    'home.photosCount': '{{ count }} 张照片',
    'home.synciCloudDesc': '从 iCloud 同步照片',
    'home.importFromLocal': '从本地文件夹导入',
    'home.or': '或',
    'home.syncFromiCloud': '从 iCloud 同步',
    'home.importing': '正在导入',

    // 导航栏
    'nav.home': '首页',
    'nav.photos': '照片',
    'nav.albums': '相册',
    'nav.timeline': '时间线',
    'nav.people': '人物',
    'nav.search': '搜索',
    'nav.settings': '设置',

    // 设置页面
    'settings.title': '设置',
    'settings.subtitle': '管理应用配置和偏好',
    'settings.ai.title': 'AI 搜索配置',
    'settings.ai.provider': 'API 提供商',
    'settings.ai.apiKey': 'API Key',
    'settings.ai.baseUrl': 'API 地址',
    'settings.ai.model': '模型',
    'settings.ai.timeout': '超时时间',

    // 照片相关
    'photos.title': '照片',
    'photos.empty': '暂无照片',
    'photos.import': '导入照片',

    // 相册相关
    'albums.title': '相册',
    'albums.empty': '暂无相册',
    'albums.year': '年度相册',
    'albums.location': '地点相册',
    'albums.person': '人物相册',

    // 人物相关
    'people.title': '人物',
    'people.empty': '暂无人物',
    'people.clustering': '人物聚类',
    'people.detail.title': '人物详情',

    // 搜索相关
    'search.title': '搜索',
    'search.placeholder': '搜索照片...',
    'search.empty': '没有找到匹配的照片',

    // 时间线
    'timeline.title': '时间线',
    'timeline.empty': '该年份暂无照片',

    // 空状态
    'empty.noPhotos': '还没有照片',
    'empty.noPhotosDesc': '点击上方按钮导入你的第一张照片',
    'empty.noResults': '没有找到结果',
    'empty.noResultsDesc': '尝试调整搜索条件',
    // EmptyState 组件用
    'emptyState.default.title': '暂无内容',
    'emptyState.default.description': '这里还没有任何内容',
    'emptyState.photos.title': '还没有照片',
    'emptyState.photos.description': '点击上方按钮导入你的第一张照片',
    'emptyState.search.title': '没有找到结果',
    'emptyState.search.description': '尝试调整搜索条件',
    'emptyState.albums.title': '暂无相册',
    'emptyState.albums.description': '创建你的第一个相册来整理照片',
    'emptyState.people.title': '暂无人物',
    'emptyState.people.description': '导入照片后，系统会自动识别照片中的人物',
    'emptyState.timeline.title': '该年份暂无照片',
    'emptyState.timeline.description': '选择其他年份或导入更多照片',
    'emptyState.error.title': '出错了',
    'emptyState.error.description': '请稍后重试',
    'emptyState.import.title': '导入照片',
    'emptyState.import.description': '选择文件夹导入你的照片',

    // 错误
    'error.title': '出错了',
    'error.retry': '重试',
  },
  en: {
    // Common
    'common.loading': 'Loading...',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.back': 'Back',
    'common.search': 'Search',
    'common.settings': 'Settings',
    'common.photos': 'Photos',
    'common.albums': 'Albums',
    'common.people': 'People',
    'common.timeline': 'Timeline',
    'common.home': 'Home',

    // Home
    'home.welcome': 'Welcome',
    'home.subtitle': 'Your smart photo library',
    'home.smartAlbums': 'Smart Albums',
    'home.albumsDesc': 'Auto-organized by time, location, people',
    'home.albumsExample': 'Spring Festival 2024, Beijing Trip',
    'home.people': 'People',
    'home.peopleDesc': 'Auto-detect and group people photos',
    'home.peopleExample': 'Family, Friends, Colleagues',
    'home.importPhotos': 'Import Photos',
    'home.importLocalDesc': 'Import from local folders',
    'home.syncPhotos': 'Sync Photos',
    'home.syncCloudDesc': 'Sync from cloud storage',
    'home.recentPhotos': 'Recent Photos',
    'home.viewAll': 'View All',
    'home.smartSearch': 'Smart Search',
    'home.searchDesc': 'Search photos with natural language',
    'home.searchExample': 'e.g. cherry blossoms in spring 2024',
    'home.timeline': 'Timeline',
    'home.timelineDesc': 'Browse photos in chronological order',
    'home.timelineExample': 'From newest to oldest',
    'home.photosCount': '{{ count }} photos',
    'home.synciCloudDesc': 'Sync photos from iCloud',
    'home.importFromLocal': 'Import from local folder',
    'home.or': 'or',
    'home.syncFromiCloud': 'Sync from iCloud',
    'home.importing': 'Importing...',

    // Nav
    'nav.home': 'Home',
    'nav.photos': 'Photos',
    'nav.albums': 'Albums',
    'nav.timeline': 'Timeline',
    'nav.people': 'People',
    'nav.search': 'Search',
    'nav.settings': 'Settings',

    // Settings
    'settings.title': 'Settings',
    'settings.subtitle': 'Manage app configuration and preferences',
    'settings.ai.title': 'AI Search Configuration',
    'settings.ai.provider': 'API Provider',
    'settings.ai.apiKey': 'API Key',
    'settings.ai.baseUrl': 'API URL',
    'settings.ai.model': 'Model',
    'settings.ai.timeout': 'Timeout',

    // Photos
    'photos.title': 'Photos',
    'photos.empty': 'No photos yet',
    'photos.import': 'Import Photos',

    // Albums
    'albums.title': 'Albums',
    'albums.empty': 'No albums yet',
    'albums.year': 'Year Albums',
    'albums.location': 'Location Albums',
    'albums.person': 'Person Albums',

    // People
    'people.title': 'People',
    'people.empty': 'No people yet',
    'people.clustering': 'Person Clustering',
    'people.detail.title': 'Person Details',

    // Search
    'search.title': 'Search',
    'search.placeholder': 'Search photos...',
    'search.empty': 'No matching photos found',

    // Timeline
    'timeline.title': 'Timeline',
    'timeline.empty': 'No photos for this year',

    // Empty states
    'empty.noPhotos': 'No photos yet',
    'empty.noPhotosDesc': 'Click the button above to import your first photo',
    'empty.noResults': 'No results found',
    'empty.noResultsDesc': 'Try adjusting your search criteria',
    // EmptyState component
    'emptyState.default.title': 'No Content',
    'emptyState.default.description': 'There is nothing here yet',
    'emptyState.photos.title': 'No Photos Yet',
    'emptyState.photos.description': 'Click the button above to import your first photo',
    'emptyState.search.title': 'No Results Found',
    'emptyState.search.description': 'Try adjusting your search criteria',
    'emptyState.albums.title': 'No Albums Yet',
    'emptyState.albums.description': 'Create your first album to organize photos',
    'emptyState.people.title': 'No People Yet',
    'emptyState.people.description': 'The system will automatically recognize people after you import photos',
    'emptyState.timeline.title': 'No Photos for This Year',
    'emptyState.timeline.description': 'Select another year or import more photos',
    'emptyState.error.title': 'Error Occurred',
    'emptyState.error.description': 'Please try again later',
    'emptyState.import.title': 'Import Photos',
    'emptyState.import.description': 'Select a folder to import your photos',

    // Errors
    'error.title': 'Error',
    'error.retry': 'Retry',
  }
}

// 当前语言状态
const currentLocale = ref('zh')

// 初始化语言设置
export function useI18n() {
  // 翻译函数
  const t = (key: string, fallback?: string): string => {
    const localeMessages = messages[currentLocale.value] || messages['zh']
    return localeMessages[key] || fallback || key
  }

  // 设置语言
  const setLocale = (locale: string) => {
    if (messages[locale]) {
      currentLocale.value = locale
      // 保存到本地存储
      try {
        localStorage.setItem('photomind-locale', locale)
      } catch {
        // 忽略存储错误
      }
    }
  }

  // 初始化语言（从本地存储读取）
  const initLocale = () => {
    try {
      const saved = localStorage.getItem('photomind-locale')
      if (saved && messages[saved]) {
        currentLocale.value = saved
      } else {
        // 检测浏览器语言
        const browserLang = navigator.language.toLowerCase()
        if (browserLang.startsWith('zh')) {
          currentLocale.value = 'zh'
        } else {
          currentLocale.value = 'en'
        }
      }
    } catch {
      // 使用默认中文
      currentLocale.value = 'zh'
    }
  }

  return {
    t,
    locale: currentLocale,
    setLocale,
    initLocale
  }
}

// 默认导出
export default useI18n
