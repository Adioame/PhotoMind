/**
 * PhotoMind - 路由配置
 */
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/HomeView.vue'),
  },
  {
    path: '/photos',
    name: 'Photos',
    component: () => import('../views/PhotosView.vue'),
  },
  {
    path: '/search',
    name: 'Search',
    component: () => import('../views/SearchView.vue'),
  },
  {
    path: '/albums',
    name: 'Albums',
    component: () => import('../views/AlbumsView.vue'),
  },
  {
    path: '/photo/:id',
    name: 'PhotoDetail',
    component: () => import('../views/PhotoDetailView.vue'),
    props: true,
  },
  {
    path: '/timeline/:year?',
    name: 'Timeline',
    component: () => import('../views/TimelineView.vue'),
    props: true,
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue'),
  },
  {
    path: '/people',
    name: 'People',
    component: () => import('../views/PeopleView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
