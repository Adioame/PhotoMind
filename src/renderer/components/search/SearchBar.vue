<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useSearchStore, type SearchMode, type SearchSuggestion, HOT_SEARCHES, SEARCH_TIPS } from '@/stores/searchStore'
import { useDebounceFn } from '@vueuse/core'

// Props
interface Props {
  placeholder?: string
  autofocus?: boolean
  showModeSwitcher?: boolean
  showSuggestions?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '搜索照片...',
  autofocus: false,
  showModeSwitcher: true,
  showSuggestions: true
})

const emit = defineEmits<{
  search: [query: string]
  clear: []
  modeChange: [mode: SearchMode]
}>()

// Store
const searchStore = useSearchStore()

// Refs
const inputRef = ref<HTMLInputElement | null>(null)
const isFocused = ref(false)
const localQuery = ref('')
const selectedSuggestionIndex = ref(-1)

// Debounced suggestion loader
const debouncedLoadSuggestions = useDebounceFn((query: string) => {
  searchStore.setQuery(query)
}, 150)

// Modes
const modes: { value: SearchMode; label: string }[] = [
  { value: 'keyword', label: '关键词' },
  { value: 'semantic', label: '语义' },
  { value: 'hybrid', label: '混合' }
]

const agentLabels: Record<string, string> = {
  keyword: '关键词',
  semantic: '语义',
  people: '人物'
}

// Computed
const canSearch = computed(() => searchStore.canSearch)
const isSearching = computed(() => searchStore.isSearching)
const suggestions = computed(() => searchStore.suggestions)
const recentSearches = computed(() => searchStore.recentSearches)
const currentMode = computed({
  get: () => searchStore.mode,
  set: (value: SearchMode) => {
    searchStore.setMode(value)
    emit('modeChange', value)
  }
})

// 是否显示实时搜索建议（有输入时）
const showRealtimeSuggestions = computed(() => {
  if (!props.showSuggestions) return false
  return isFocused.value && localQuery.value.length > 0 && suggestions.value.length > 0
})

// 是否显示搜索建议面板（包括热门搜索、提示等）
const showSuggestionsPanel = computed(() => {
  if (!props.showSuggestions) return false
  if (!isFocused.value) return false

  // 有输入时显示实时建议
  if (localQuery.value.length > 0) {
    return suggestions.value.length > 0
  }

  // 无输入时显示热门搜索和提示
  return true
})

const displayedSuggestions = computed(() => {
  const items: (SearchSuggestion | string)[] = []

  // 历史记录（无查询时显示）
  if (!localQuery.value && recentSearches.value.length > 0) {
    items.push(...recentSearches.value.slice(0, 5))
  }

  // 实时建议
  if (suggestions.value.length > 0) {
    items.push(...suggestions.value)
  }

  return items
})

// Methods
const handleInput = () => {
  selectedSuggestionIndex.value = -1
  debouncedLoadSuggestions(localQuery.value)
}

const executeSearch = async () => {
  if (!localQuery.value.trim()) return

  // 清除建议
  searchStore.suggestions = []

  // 执行搜索
  await searchStore.search(localQuery.value)
  emit('search', localQuery.value)

  // 聚焦
  inputRef.value?.blur()
}

const handleFocus = () => {
  isFocused.value = true

  // 加载历史
  if (searchStore.recentSearches.length === 0) {
    searchStore.loadHistory()
  }
}

const handleBlur = () => {
  // 延迟执行以允许点击
  setTimeout(() => {
    isFocused.value = false
  }, 200)
}

const handleKeydown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'Enter':
      event.preventDefault()
      if (selectedSuggestionIndex.value >= 0 && displayedSuggestions.value[selectedSuggestionIndex.value]) {
        selectSuggestion(displayedSuggestions.value[selectedSuggestionIndex.value])
      } else {
        executeSearch()
      }
      break
    case 'ArrowDown':
      event.preventDefault()
      selectedSuggestionIndex.value = Math.min(
        selectedSuggestionIndex.value + 1,
        displayedSuggestions.value.length - 1
      )
      break
    case 'ArrowUp':
      event.preventDefault()
      selectedSuggestionIndex.value = Math.max(selectedSuggestionIndex.value - 1, -1)
      break
    case 'Escape':
      isFocused.value = false
      inputRef.value?.blur()
      break
  }
}

const selectSuggestion = (item: SearchSuggestion | string) => {
  const text = typeof item === 'string' ? item : item.text
  localQuery.value = text
  selectedSuggestionIndex.value = -1
  searchStore.suggestions = []
  executeSearch()
}

// 选择热门搜索
const selectHotSearch = (suggestion: SearchSuggestion) => {
  localQuery.value = suggestion.text
  executeSearch()
}

const clearSearch = () => {
  localQuery.value = ''
  searchStore.clearSearch()
  emit('clear')
  inputRef.value?.focus()
}

const handleModeChange = (mode: SearchMode) => {
  currentMode.value = mode
}

// Expose
defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur()
})

// Lifecycle
onMounted(() => {
  // 加载搜索历史
  searchStore.loadHistory()

  if (props.autofocus) {
    inputRef.value?.focus()
  }
})

// Watch for external query changes
watch(() => searchStore.query, (newQuery) => {
  if (newQuery !== localQuery.value) {
    localQuery.value = newQuery
  }
})
</script>

<template>
  <div class="search-container" :class="{ focused: isFocused }">
    <!-- 模式指示器 -->
    <div v-if="showModeSwitcher && searchStore.activeAgents.length > 0" class="mode-indicator">
      <span
        v-for="agent in searchStore.activeAgents"
        :key="agent"
        class="agent-badge"
        :class="agent"
      >
        {{ agentLabels[agent] || agent }}
      </span>
    </div>

    <!-- 搜索输入框 -->
    <div class="search-input-wrapper">
      <svg class="search-icon" viewBox="0 0 24 24">
        <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 0 0 1.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 0 0-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 0 0 5.34-1.48l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>

      <input
        ref="inputRef"
        v-model="localQuery"
        type="text"
        :placeholder="placeholder"
        class="search-input"
        @input="handleInput"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeydown"
      />

      <!-- 清除按钮 -->
      <button
        v-if="localQuery"
        class="icon-button clear-button"
        @click="clearSearch"
      >
        <svg viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>

      <!-- 搜索按钮 -->
      <button
        class="icon-button search-button"
        :disabled="!canSearch"
        @click="executeSearch"
      >
        <svg v-if="!isSearching" viewBox="0 0 24 24">
          <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 0 0 1.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 0 0-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 0 0 5.34-1.48l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <span v-else class="spinner"></span>
      </button>
    </div>

    <!-- 搜索建议 -->
    <Transition name="slide-up">
      <div v-if="showSuggestionsPanel" class="suggestions-panel">
        <!-- 热门搜索（无输入时显示） -->
        <div v-if="!localQuery" class="suggestion-section hot-searches">
          <div class="section-title">
            <span class="title-icon">🔥</span>
            热门搜索
          </div>
          <div class="hot-search-tags">
            <button
              v-for="(suggestion, index) in HOT_SEARCHES"
              :key="'hot-' + index"
              class="hot-search-tag"
              @mousedown.prevent="selectHotSearch(suggestion)"
            >
              <span class="tag-icon">{{ suggestion.icon }}</span>
              <span class="tag-text">{{ suggestion.text }}</span>
            </button>
          </div>
        </div>

        <!-- 搜索提示（无输入时显示） -->
        <div v-if="!localQuery" class="suggestion-section search-tips">
          <div class="section-title">
            <span class="title-icon">💡</span>
            搜索提示
          </div>
          <div class="tip-items">
            <div
              v-for="(tip, index) in SEARCH_TIPS"
              :key="'tip-' + index"
              class="tip-item"
            >
              <span class="tip-icon">{{ tip.icon }}</span>
              <span class="tip-text">{{ tip.text }}</span>
            </div>
          </div>
        </div>

        <!-- 历史记录（无查询时显示） -->
        <div v-if="recentSearches.length > 0 && !localQuery" class="suggestion-section">
          <div class="section-title">
            <span class="title-icon">🕐</span>
            最近搜索
          </div>
          <div
            v-for="(search, index) in recentSearches.slice(0, 5)"
            :key="'history-' + index"
            class="suggestion-item"
            :class="{ selected: selectedSuggestionIndex === index }"
            @mousedown="selectSuggestion(search)"
          >
            <svg class="suggestion-icon" viewBox="0 0 24 24">
              <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
            </svg>
            {{ search }}
          </div>
        </div>

        <!-- 实时建议 -->
        <div v-if="suggestions.length > 0 && localQuery" class="suggestion-section">
          <div class="section-title">建议</div>
          <div
            v-for="(suggestion, index) in suggestions"
            :key="'suggestion-' + index"
            class="suggestion-item"
            :class="{ selected: selectedSuggestionIndex === index }"
            @mousedown="selectSuggestion(suggestion)"
          >
            <svg v-if="suggestion.type === 'person'" class="suggestion-icon" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
            <svg v-else class="suggestion-icon" viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 0 0 1.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 0 0-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 0 0 5.34-1.48l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            {{ suggestion.text }}
            <span class="suggestion-type">{{ suggestion.type }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 模式切换 -->
    <div v-if="showModeSwitcher" class="mode-switcher">
      <button
        v-for="mode in modes"
        :key="mode.value"
        class="mode-button"
        :class="{ active: currentMode === mode.value }"
        @click="handleModeChange(mode.value)"
      >
        {{ mode.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-container {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.search-container.focused {
  background: var(--bg-primary, #fff);
  box-shadow: 0 0 0 2px var(--primary-color, #007aff);
}

.mode-indicator {
  display: flex;
  gap: 6px;
}

.agent-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  background: var(--bg-tertiary, #e8e8e8);
}

.agent-badge.keyword {
  background: #e3f2fd;
  color: #1976d2;
}

.agent-badge.semantic {
  background: #f3e5f5;
  color: #7b1fa2;
}

.agent-badge.people {
  background: #e8f5e9;
  color: #388e3c;
}

.search-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-icon {
  width: 20px;
  height: 20px;
  fill: var(--text-secondary, #666);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--text-primary, #333);
  outline: none;
}

.search-input::placeholder {
  color: var(--text-tertiary, #999);
}

.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.icon-button svg {
  width: 18px;
  height: 18px;
  fill: var(--text-secondary, #666);
}

.icon-button:hover {
  background: var(--bg-tertiary, #e8e8e8);
}

.icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-color, #ddd);
  border-top-color: var(--primary-color, #007aff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.suggestions-panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 8px;
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  z-index: 1000;
}

.suggestion-section {
  padding: 8px 0;
}

.suggestion-section:not(:last-child) {
  border-bottom: 1px solid var(--border-color, #eee);
}

.section-title {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #666);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.title-icon {
  font-size: 14px;
}

/* Hot searches */
.hot-searches {
  padding: 8px 0;
}

.hot-search-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 16px 12px;
}

.hot-search-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: var(--bg-secondary, #f5f5f5);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 16px;
  font-size: 13px;
  color: var(--text-primary, #333);
  cursor: pointer;
  transition: all 0.2s ease;
}

.hot-search-tag:hover {
  background: var(--primary-light, #e3f2fd);
  border-color: var(--primary-color, #007aff);
  color: var(--primary-color, #007aff);
}

.tag-icon {
  font-size: 14px;
}

.tag-text {
  white-space: nowrap;
}

/* Search tips */
.search-tips {
  padding: 8px 0;
  background: linear-gradient(to right, rgba(255, 243, 224, 0.3), rgba(255, 248, 225, 0.3));
}

.tip-items {
  padding: 4px 16px 8px;
}

.tip-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: var(--text-secondary, #666);
  line-height: 1.5;
}

.tip-icon {
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

.tip-text {
  flex: 1;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.suggestion-item:hover,
.suggestion-item.selected {
  background: var(--bg-secondary, #f5f5f5);
}

.suggestion-icon {
  width: 18px;
  height: 18px;
  fill: var(--text-tertiary, #999);
}

.suggestion-type {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary, #999);
  text-transform: capitalize;
}

.mode-switcher {
  display: flex;
  gap: 4px;
}

.mode-button {
  padding: 6px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary, #666);
  cursor: pointer;
  transition: all 0.2s;
}

.mode-button:hover {
  background: var(--bg-tertiary, #e8e8e8);
}

.mode-button.active {
  background: var(--primary-color, #007aff);
  color: #fff;
}

/* Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
