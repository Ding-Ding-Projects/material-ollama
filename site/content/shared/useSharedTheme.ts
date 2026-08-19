'use client'

// Reads and writes the same visitor-preference record the landing page's own settings tab
// persists (`material-ollama-landing-settings-v2`), but touches only the `theme` field. Every
// other field the landing page owns is copied through unchanged on write, so opening /docs,
// /status, or /download in the same browser never drops or corrupts an unrelated preference --
// and if that record does not exist yet, nothing is invented beyond the one field this hook owns.
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'material-ollama-landing-settings-v2'
export type ThemeMode = 'dark' | 'light'

function readTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return 'dark'
    const parsed = JSON.parse(raw)
    return parsed && (parsed.theme === 'light' || parsed.theme === 'dark') ? parsed.theme : 'dark'
  } catch {
    return 'dark'
  }
}

function writeTheme(next: ThemeMode) {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const existing = raw ? JSON.parse(raw) : {}
    const merged = existing && typeof existing === 'object' ? { ...existing, theme: next } : { theme: next }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // Local storage can be unavailable (private browsing, quota, disabled). The visible theme
    // still applies for this render; it just will not persist across a reload.
  }
}

export function useSharedTheme(): [ThemeMode, (next: ThemeMode) => void] {
  const [theme, setThemeState] = useState<ThemeMode>('dark')

  useEffect(() => {
    setThemeState(readTheme())
  }, [])

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next)
    writeTheme(next)
  }, [])

  return [theme, setTheme]
}
