import { useCallback, useEffect, useState } from 'react'

export type Theme = 'paper' | 'ink'
const KEY = 'chess-analyser:theme'

function initialTheme(): Theme {
  const current = document.documentElement.dataset.theme
  if (current === 'light') return 'paper'
  if (current === 'dark') return 'ink'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'ink' : 'paper'
}

/** Light ('paper') or dark ('ink'). Stored only in this browser. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  useEffect(() => {
    const root = document.documentElement
    const dark = theme === 'ink'
    root.dataset.theme = dark ? 'dark' : 'light'
    root.classList.toggle('dark', dark)
    root.classList.toggle('light', !dark)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#131416' : '#f4f5f7')
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try { localStorage.setItem(KEY, next) } catch { /* storage unavailable: keep for this tab */ }
  }, [])

  return { theme, setTheme }
}
