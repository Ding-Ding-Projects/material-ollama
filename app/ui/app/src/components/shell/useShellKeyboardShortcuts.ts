import { useEffect, useMemo } from "react"

/**
 * The tab system's one wired-and-real keyboard shortcut: Ctrl+W (Cmd+W on
 * macOS) closes the active tab. It exists so the "context-menu-shortcuts"
 * contract has something true to display — a context menu is only allowed
 * to show a shortcut column next to an item where that shortcut genuinely
 * fires in that exact context, and Ctrl+W genuinely only ever closes the
 * *active* tab, never an arbitrary right-clicked background one. Kept to
 * one shortcut deliberately rather than inventing several without a real,
 * widely-recognized convention behind them.
 */
export function useShellCloseActiveTabShortcut(onCloseActiveTab: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && key === "w") {
        event.preventDefault()
        onCloseActiveTab()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onCloseActiveTab])
}

/** Platform-appropriate display text for the close-tab shortcut — "⌘W" on
 * a Mac, "Ctrl+W" everywhere else. Read once (the platform can't change
 * mid-session), so a plain function rather than a hook is enough; callers
 * that want it reactive to a re-render still get a memoized value via
 * `useCloseActiveTabShortcutLabel()` below. */
function detectMac(): boolean {
  if (typeof navigator === "undefined") return false
  const platform = navigator.platform || navigator.userAgent || ""
  return /Mac|iPhone|iPad|iPod/i.test(platform)
}

export function useCloseActiveTabShortcutLabel(): string {
  return useMemo(() => (detectMac() ? "⌘W" : "Ctrl+W"), [])
}
