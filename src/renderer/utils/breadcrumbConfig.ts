/**
 * PhotoMind - 面包屑导航配置
 */
import type { BreadcrumbItem } from '@/components/nav/BreadcrumbNav.vue'
import {
  Home24Regular,
  People24Regular,
  Image24Regular,
  Folder24Regular,
  CalendarToday24Regular,
  Search24Regular,
  Settings24Regular,
  Person24Regular
} from '@vicons/fluent'

/**
 * 基础面包屑配置
 */
export const baseBreadcrumbs: Record<string, BreadcrumbItem[]> = {
  // 首页
  'Home': [
    { label: '首页', path: '/', icon: Home24Regular }
  ],

  // 照片列表
  'Photos': [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '照片', path: '/photos', icon: Image24Regular }
  ],

  // 人物列表
  'People': [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '人物', path: '/people', icon: People24Regular }
  ],

  // 相册
  'Albums': [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '相册', path: '/albums', icon: Folder24Regular }
  ],

  // 时间线
  'Timeline': [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '时间线', path: '/timeline', icon: CalendarToday24Regular }
  ],

  // 搜索
  'Search': [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '搜索', path: '/search', icon: Search24Regular }
  ],

  // 设置
  'Settings': [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '设置', path: '/settings', icon: Settings24Regular }
  ],

  // 照片详情（基础）
  'PhotoDetail': [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '照片', path: '/photos', icon: Image24Regular },
    { label: '照片详情', icon: Image24Regular }
  ]
}

/**
 * 生成人物详情的面包屑
 */
export function generatePersonBreadcrumb(
  personName: string,
  personId?: number
): BreadcrumbItem[] {
  return [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '人物', path: '/people', icon: People24Regular },
    {
      label: personName,
      path: personId ? `/people/${personId}` : undefined,
      icon: Person24Regular
    }
  ]
}

/**
 * 生成从人物页进入的照片详情面包屑
 */
export function generatePhotoDetailFromPersonBreadcrumb(
  personName: string,
  personId: number,
  photoName?: string
): BreadcrumbItem[] {
  return [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '人物', path: '/people', icon: People24Regular },
    { label: personName, path: `/people/${personId}`, icon: Person24Regular },
    { label: photoName || '照片详情', icon: Image24Regular }
  ]
}

/**
 * 生成相册详情的面包屑
 */
export function generateAlbumBreadcrumb(
  albumName: string,
  albumId?: number
): BreadcrumbItem[] {
  return [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '相册', path: '/albums', icon: Folder24Regular },
    { label: albumName, path: albumId ? `/albums/${albumId}` : undefined }
  ]
}

/**
 * 生成时间线详情的面包屑
 */
export function generateTimelineBreadcrumb(
  dateLabel: string
): BreadcrumbItem[] {
  return [
    { label: '首页', path: '/', icon: Home24Regular },
    { label: '时间线', path: '/timeline', icon: CalendarToday24Regular },
    { label: dateLabel }
  ]
}

/**
 * 根据当前路由获取基础面包屑
 */
export function getBaseBreadcrumb(routeName: string): BreadcrumbItem[] {
  return baseBreadcrumbs[routeName] || baseBreadcrumbs['Home']
}
