import { useEffect, useRef, type RefObject } from "react"

// A reusable focus-trap hook for overlays (dialogs, the export/bulk
// preview panels) — Tab from the last focusable element wraps to the
// first, Shift+Tab from the first wraps to the last, focus lands inside
// the container the moment it activates, and the element that had focus
// before activation gets it back on deactivation. Headless UI's own
// <Dialog> already does this for the md3/ overlays this lane can't edit;
// this hook exists for the surfaces THIS lane owns (ExportPreview's
// standalone regions, any bespoke overlay in components/bulk/**) that
// aren't built on Headless UI's Dialog.

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

function isVisible(element: HTMLElement): boolean {
  // Deliberately NOT `offsetParent !== null` -- that check requires a real
  // layout pass (always null in jsdom, and also wrongly excludes
  // `position: fixed` elements in a real browser). Checking the explicit
  // hidden signals instead works identically in a test environment and a
  // real one, and is what actually determines "should this be reachable
  // by Tab" rather than "did the layout engine place it somewhere".
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false
  if (element.style.display === "none" || element.style.visibility === "hidden") return false
  return true
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible)
}

/**
 * Attach the returned ref to the overlay's outermost element. While
 * `active` is true, Tab/Shift+Tab cycle only through focusable descendants
 * of that element; when `active` becomes false (or the component
 * unmounts), focus returns to whatever had it beforehand.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean): RefObject<T | null> {
  const containerRef = useRef<T>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusable = getFocusable(container)
    if (focusable.length > 0 && !container.contains(document.activeElement)) {
      focusable[0]?.focus()
    } else if (focusable.length === 0) {
      container.tabIndex = -1
      container.focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const items = getFocusable(container)
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const current = document.activeElement

      if (event.shiftKey) {
        if (current === first || !container.contains(current)) {
          event.preventDefault()
          last.focus()
        }
      } else if (current === last || !container.contains(current)) {
        event.preventDefault()
        first.focus()
      }
    }

    container.addEventListener("keydown", handleKeyDown)
    return () => {
      container.removeEventListener("keydown", handleKeyDown)
      const restore = previouslyFocusedRef.current
      if (restore && document.contains(restore)) restore.focus()
    }
  }, [active])

  return containerRef
}
