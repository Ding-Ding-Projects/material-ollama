import { useCallback, useEffect, useState } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { DESTINATIONS, destinationById, destinationForPath, type DestinationId } from "./destinations"

export interface ShellTab {
  readonly id: string
  readonly destinationId: DestinationId
  readonly pinned: boolean
  /** A CSS color once a tab has been dropped into a group; `undefined` outside one. */
  readonly groupColor?: string
}

const DEFAULT_DESTINATION_ID: DestinationId = DESTINATIONS[0].id
const GROUP_COLORS = ["#7cb342", "#5c6bc0", "#ef6c00", "#ec407a"]

let tabSeq = 0
function nextTabId(): string {
  tabSeq += 1
  return `tab-${tabSeq}`
}

function freshTab(destinationId: DestinationId): ShellTab {
  return { id: nextTabId(), destinationId, pinned: false }
}

export interface UseShellTabsResult {
  readonly tabs: readonly ShellTab[]
  /** The destination the router is currently on — the single source of
   * truth for "which tab/rail item is active", derived from the URL rather
   * than tracked as separate state that could drift from it. */
  readonly activeDestinationId: DestinationId
  readonly activeTabId: string | undefined
  /** Opens a destination fresh (rail click, palette pick) — reactivates its
   * tab if one is already open rather than creating a duplicate. */
  readonly openDestination: (id: DestinationId) => void
  readonly activateTab: (tabId: string) => void
  readonly closeTab: (tabId: string) => void
  readonly closeAllUnpinned: () => void
  readonly closeOthers: (tabId: string) => void
  readonly closeRight: (tabId: string) => void
  readonly togglePin: (tabId: string) => void
  readonly toggleGroup: (tabId: string) => void
}

/**
 * Owns the open-tabs strip. Tabs track *destinations* (one of the nine rail
 * items), not exact URLs — every `/c/*` chat lives inside the one "Chat"
 * tab, matching the design's screen-not-route model. The router's current
 * pathname is the only source of truth for which tab/rail item is active;
 * this hook only adds the bookkeeping browser-style tabs need on top of
 * that (open/closed, pinned, grouped) and keeps a tab open for wherever
 * navigation actually lands, even when something other than this hook
 * (e.g. a chat-list link) drove it there.
 */
export function useShellTabs(): UseShellTabsResult {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()
  const activeDestinationId = destinationForPath(pathname).id

  const [tabs, setTabs] = useState<ShellTab[]>(() => [freshTab(activeDestinationId)])

  // Pure and idempotent (only ever returns the same array back or a strict
  // superset), so it stays safe even if StrictMode invokes it twice.
  useEffect(() => {
    setTabs((current) => {
      if (current.some((tab) => tab.destinationId === activeDestinationId)) return current
      return [...current, freshTab(activeDestinationId)]
    })
  }, [activeDestinationId])

  const activeTabId = tabs.find((tab) => tab.destinationId === activeDestinationId)?.id

  const openDestination = useCallback(
    (id: DestinationId) => {
      navigate({ to: destinationById(id).path })
    },
    [navigate],
  )

  const activateTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((candidate) => candidate.id === tabId)
      if (tab) openDestination(tab.destinationId)
    },
    [tabs, openDestination],
  )

  const closeTab = useCallback(
    (tabId: string) => {
      const closing = tabs.find((candidate) => candidate.id === tabId)
      if (!closing) return
      let next = tabs.filter((candidate) => candidate.id !== tabId)
      if (next.length === 0) next = [freshTab(DEFAULT_DESTINATION_ID)]
      setTabs(next)
      if (closing.destinationId === activeDestinationId) {
        openDestination(next[next.length - 1].destinationId)
      }
    },
    [tabs, activeDestinationId, openDestination],
  )

  const closeAllUnpinned = useCallback(() => {
    let next = tabs.filter((tab) => tab.pinned)
    if (next.length === 0) next = [freshTab(DEFAULT_DESTINATION_ID)]
    setTabs(next)
    if (!next.some((tab) => tab.destinationId === activeDestinationId)) {
      openDestination(next[0].destinationId)
    }
  }, [tabs, activeDestinationId, openDestination])

  const closeOthers = useCallback(
    (tabId: string) => {
      const keep = tabs.filter((tab) => tab.id === tabId || tab.pinned)
      if (keep.length === 0) return
      setTabs(keep)
      const target = keep.find((tab) => tab.id === tabId) ?? keep[0]
      if (target.destinationId !== activeDestinationId) {
        openDestination(target.destinationId)
      }
    },
    [tabs, activeDestinationId, openDestination],
  )

  const closeRight = useCallback(
    (tabId: string) => {
      const idx = tabs.findIndex((tab) => tab.id === tabId)
      if (idx === -1) return
      const clicked = tabs[idx]
      const keep = tabs.filter((tab, i) => i <= idx || tab.pinned)
      setTabs(keep)
      if (!keep.some((tab) => tab.destinationId === activeDestinationId)) {
        openDestination(clicked.destinationId)
      }
    },
    [tabs, activeDestinationId, openDestination],
  )

  const togglePin = useCallback((tabId: string) => {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, pinned: !tab.pinned } : tab)))
  }, [])

  const toggleGroup = useCallback((tabId: string) => {
    setTabs((current) =>
      current.map((tab, index) =>
        tab.id === tabId
          ? { ...tab, groupColor: tab.groupColor ? undefined : GROUP_COLORS[index % GROUP_COLORS.length] }
          : tab,
      ),
    )
  }, [])

  return {
    tabs,
    activeDestinationId,
    activeTabId,
    openDestination,
    activateTab,
    closeTab,
    closeAllUnpinned,
    closeOthers,
    closeRight,
    togglePin,
    toggleGroup,
  }
}
