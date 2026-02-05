/**
 * PhotoMind - Search Hotkeys Composable
 *
 * Provides keyboard shortcuts for search functionality:
 * - Cmd/Ctrl + K: Open/focus search
 * - Escape: Close search
 * - Arrow keys: Navigate suggestions
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useSearchStore } from '@/stores/searchStore'

export function useSearchHotkeys() {
  const searchStore = useSearchStore()
  const isSearchOpen = ref(false)
  const searchInputRef = ref<HTMLInputElement | null>(null)

  const handleKeydown = (event: KeyboardEvent) => {
    // Cmd/Ctrl + K: Open search
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      openSearch()
    }

    // Escape: Close search
    if (event.key === 'Escape' && isSearchOpen.value) {
      closeSearch()
    }
  }

  const openSearch = () => {
    isSearchOpen.value = true
    // Focus the search input
    setTimeout(() => {
      searchInputRef.value?.focus()
    }, 50)
  }

  const closeSearch = () => {
    isSearchOpen.value = false
  }

  const setSearchInput = (input: HTMLInputElement | null) => {
    searchInputRef.value = input
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  return {
    isSearchOpen,
    searchInputRef,
    openSearch,
    closeSearch,
    setSearchInput
  }
}

/**
 * Global keyboard shortcuts for the entire app
 */
export function useAppHotkeys() {
  const handleKeydown = (event: KeyboardEvent) => {
    // Ignore if typing in input fields
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    // Cmd/Ctrl + K: Focus search
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      // Emit event or call store action
      const searchStore = useSearchStore()
      searchStore.search()
    }

    // Cmd/Ctrl + F: Toggle fullscreen
    if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
      event.preventDefault()
      // Handle fullscreen toggle
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
