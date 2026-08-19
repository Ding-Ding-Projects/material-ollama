import { useCallback, useMemo, useRef, useState } from "react"

// The engine behind every bulk-action surface in this lane: multi-select
// with click, shift-click ranges and a keyboard equivalent (the keyboard
// equivalent is `toggle()`/`toggleRange()` wired to a real key, see
// BulkSelectableList.tsx, which pairs this with the roving-tabindex hook);
// a select-all that says plainly whether it means "this page" or "every
// match"; and inverse selection.

export type BulkSelectionScope = "none" | "page" | "all"

export interface UseBulkSelectionOptions {
  /** Ordered ids currently loaded/visible -- the selectable universe for
   * shift-click ranges, "select this page", and inverse selection. */
  readonly ids: readonly string[]
  /** Total items matching the current filter, when it's larger than
   * `ids` (e.g. a server-paginated list). Omit, or set equal to
   * `ids.length`, when the full result set is already loaded -- then
   * "this page" and "every match" are the same thing and a caller should
   * offer only one select-all action. */
  readonly totalMatchCount?: number
}

export interface UseBulkSelectionResult {
  readonly scope: BulkSelectionScope
  /** Only meaningful for `scope === "none"` -- the explicitly clicked ids. */
  readonly selectedIds: ReadonlySet<string>
  /** Only meaningful for `scope === "page"`/`"all"` -- ids explicitly
   * removed from an otherwise-total selection. */
  readonly excludedIds: ReadonlySet<string>
  /** The exact count of what's currently selected -- honest for `"all"`
   * even when `totalMatchCount` is larger than the loaded page. */
  readonly count: number
  /** Whether `totalMatchCount` names more items than are actually loaded
   * in `ids` right now -- the signal a caller uses to decide whether
   * "Select all N matching" is offered as a DIFFERENT action from
   * "Select all N on this page". */
  readonly hasMoreThanLoaded: boolean
  readonly isSelected: (id: string) => boolean
  /** Plain click / keyboard toggle: flips exactly one id and makes it the
   * shift-click anchor for the next `toggleRange()` call. */
  readonly toggle: (id: string) => void
  /** Shift-click / keyboard range-extend: selects every id between the
   * last `toggle()`/`toggleRange()` anchor and `id` (inclusive), in the
   * order they appear in `ids` -- the same "extend, never deselect
   * within the range" behavior a file explorer's shift-click has. */
  readonly toggleRange: (id: string) => void
  /** "Select all N on this page" -- exactly the loaded `ids`, nothing more. */
  readonly selectPage: () => void
  /** "Select all N matching" -- everything the filter matches, including
   * items not yet loaded. Only meaningful when `hasMoreThanLoaded` is true;
   * calling it otherwise behaves identically to `selectPage()`. */
  readonly selectAllMatching: () => void
  readonly clear: () => void
  /**
   * Inverts the selection over the currently KNOWN universe (`ids`) --
   * this is the honest boundary: for `scope === "all"` with more matches
   * than are loaded, this cannot know about ids it has never seen, so it
   * inverts only what it can actually see. The result for any id in
   * `ids` is exactly the complement of `isSelected()` before the call.
   */
  readonly invert: () => void
}

interface SelectionState {
  readonly scope: BulkSelectionScope
  readonly selectedIds: ReadonlySet<string>
  readonly excludedIds: ReadonlySet<string>
}

const EMPTY_STATE: SelectionState = { scope: "none", selectedIds: new Set(), excludedIds: new Set() }

export function useBulkSelection(options: UseBulkSelectionOptions): UseBulkSelectionResult {
  const { ids, totalMatchCount } = options
  const [state, setState] = useState<SelectionState>(EMPTY_STATE)
  const anchorRef = useRef<string | null>(null)

  const isSelected = useCallback(
    (id: string): boolean => {
      if (state.scope === "none") return state.selectedIds.has(id)
      if (state.scope === "page") return ids.includes(id) && !state.excludedIds.has(id)
      // scope === "all": every match is selected unless explicitly
      // excluded, including ids this hook has never seen loaded.
      return !state.excludedIds.has(id)
    },
    [state, ids],
  )

  const toggle = useCallback((id: string) => {
    anchorRef.current = id
    setState((current) => {
      if (current.scope === "none") {
        const next = new Set(current.selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { scope: "none", selectedIds: next, excludedIds: current.excludedIds }
      }
      // page/all: toggling flips exclusion, not membership.
      const next = new Set(current.excludedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { scope: current.scope, selectedIds: current.selectedIds, excludedIds: next }
    })
  }, [])

  const toggleRange = useCallback(
    (id: string) => {
      const anchor = anchorRef.current
      anchorRef.current = id
      if (anchor === null || anchor === id) {
        toggle(id)
        return
      }
      const anchorIndex = ids.indexOf(anchor)
      const targetIndex = ids.indexOf(id)
      if (anchorIndex === -1 || targetIndex === -1) {
        toggle(id)
        return
      }
      const [start, end] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
      const rangeIds = ids.slice(start, end + 1)

      setState((current) => {
        if (current.scope === "none") {
          const next = new Set(current.selectedIds)
          for (const rangeId of rangeIds) next.add(rangeId)
          return { scope: "none", selectedIds: next, excludedIds: current.excludedIds }
        }
        const next = new Set(current.excludedIds)
        for (const rangeId of rangeIds) next.delete(rangeId)
        return { scope: current.scope, selectedIds: current.selectedIds, excludedIds: next }
      })
    },
    [ids, toggle],
  )

  const selectPage = useCallback(() => {
    anchorRef.current = null
    setState({ scope: "page", selectedIds: new Set(), excludedIds: new Set() })
  }, [])

  const selectAllMatching = useCallback(() => {
    anchorRef.current = null
    setState({ scope: "all", selectedIds: new Set(), excludedIds: new Set() })
  }, [])

  const clear = useCallback(() => {
    anchorRef.current = null
    setState(EMPTY_STATE)
  }, [])

  const invert = useCallback(() => {
    anchorRef.current = null
    setState((current) => {
      // The complement, computed over `ids` only -- see the doc comment
      // on `invert` above for why that's the honest boundary.
      const newlySelected = new Set(ids.filter((id) => !isSelectedWithState(current, ids, id)))
      return { scope: "none", selectedIds: newlySelected, excludedIds: new Set() }
    })
  }, [ids])

  const count = useMemo(() => {
    if (state.scope === "none") return state.selectedIds.size
    if (state.scope === "page") return Math.max(0, ids.length - state.excludedIds.size)
    const total = totalMatchCount ?? ids.length
    return Math.max(0, total - state.excludedIds.size)
  }, [state, ids, totalMatchCount])

  const hasMoreThanLoaded = (totalMatchCount ?? ids.length) > ids.length

  return {
    scope: state.scope,
    selectedIds: state.selectedIds,
    excludedIds: state.excludedIds,
    count,
    hasMoreThanLoaded,
    isSelected,
    toggle,
    toggleRange,
    selectPage,
    selectAllMatching,
    clear,
    invert,
  }
}

function isSelectedWithState(state: SelectionState, ids: readonly string[], id: string): boolean {
  if (state.scope === "none") return state.selectedIds.has(id)
  if (state.scope === "page") return ids.includes(id) && !state.excludedIds.has(id)
  return !state.excludedIds.has(id)
}
