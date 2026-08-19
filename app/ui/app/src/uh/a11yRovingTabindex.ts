import { useCallback, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react"

// Roving tabindex per the WAI-ARIA Authoring Practices pattern: exactly
// one item in the group is a Tab stop (tabIndex 0); every other item is
// tabIndex -1 and reachable only via arrow keys once the group has focus.
// This is what powers BulkSelectableList's keyboard equivalent for
// multi-select (see components/bulk/BulkSelectableList.tsx) -- Tab enters
// and leaves the list ONCE, and Up/Down (or Left/Right) move within it,
// exactly the way a real listbox or toolbar behaves.

export type RovingOrientation = "vertical" | "horizontal"

export interface UseRovingTabindexOptions {
  /** Number of items in the group. Changing this clamps `activeIndex` back
   * into range rather than leaving it dangling on a removed item. */
  count: number
  orientation?: RovingOrientation
  /** Fires when the active (Tab-stop) item changes via keyboard
   * navigation -- never for the initial value, and never for a plain
   * click (roving tabindex only reassigns Tab stops on arrow-key/Home/End
   * navigation; a click handler is the caller's own business). */
  onActiveIndexChange?: (index: number) => void
}

export interface RovingItemProps {
  readonly tabIndex: 0 | -1
  readonly onKeyDown: (event: ReactKeyboardEvent) => void
  readonly onFocus: () => void
  readonly "data-roving-index": number
}

export interface UseRovingTabindexResult {
  readonly activeIndex: number
  readonly getItemProps: (index: number) => RovingItemProps
  readonly containerRef: RefObject<HTMLElement | null>
}

const NEXT_KEYS: Record<RovingOrientation, string> = { vertical: "ArrowDown", horizontal: "ArrowRight" }
const PREV_KEYS: Record<RovingOrientation, string> = { vertical: "ArrowUp", horizontal: "ArrowLeft" }

export function useRovingTabindex(options: UseRovingTabindexOptions): UseRovingTabindexResult {
  const { count, orientation = "vertical", onActiveIndexChange } = options
  const [activeIndex, setActiveIndexState] = useState(0)
  const containerRef = useRef<HTMLElement>(null)
  const clamped = count > 0 ? Math.min(activeIndex, count - 1) : 0

  const focusItem = useCallback((index: number) => {
    const container = containerRef.current
    if (!container) return
    const target = container.querySelector<HTMLElement>(`[data-roving-index="${index}"]`)
    target?.focus()
  }, [])

  const moveTo = useCallback(
    (index: number) => {
      if (count === 0) return
      const next = Math.max(0, Math.min(count - 1, index))
      setActiveIndexState(next)
      onActiveIndexChange?.(next)
      focusItem(next)
    },
    [count, focusItem, onActiveIndexChange],
  )

  const getItemProps = useCallback(
    (index: number): RovingItemProps => ({
      tabIndex: index === clamped ? 0 : -1,
      "data-roving-index": index,
      onFocus: () => {
        // Clicking (or programmatically focusing) an item makes IT the
        // Tab stop too -- roving tabindex tracks "the last-focused item",
        // not only "the item arrow keys landed on".
        if (index !== clamped) {
          setActiveIndexState(index)
          onActiveIndexChange?.(index)
        }
      },
      onKeyDown: (event) => {
        if (event.key === NEXT_KEYS[orientation]) {
          event.preventDefault()
          moveTo(index + 1)
        } else if (event.key === PREV_KEYS[orientation]) {
          event.preventDefault()
          moveTo(index - 1)
        } else if (event.key === "Home") {
          event.preventDefault()
          moveTo(0)
        } else if (event.key === "End") {
          event.preventDefault()
          moveTo(count - 1)
        }
      },
    }),
    [clamped, count, moveTo, onActiveIndexChange, orientation],
  )

  return { activeIndex: clamped, getItemProps, containerRef }
}
