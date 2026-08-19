import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import type { TabDock } from "@/components/md3/TabStrip"
import { DESTINATIONS, destinationById, destinationForPath, type DestinationId } from "./destinations"

export interface ShellTab {
  readonly id: string
  readonly destinationId: DestinationId
  readonly pinned: boolean
  /** Membership in one of `groups` — undefined outside a group. */
  readonly groupId?: string
}

export interface TabGroupDef {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly collapsed: boolean
}

const DEFAULT_DESTINATION_ID: DestinationId = DESTINATIONS[0].id
const GROUP_COLORS = ["#7cb342", "#5c6bc0", "#ef6c00", "#ec407a", "#00897b", "#8e24aa"]
const DEFAULT_DOCK: TabDock = "left"

let tabSeq = 0
function nextTabId(): string {
  tabSeq += 1
  return `tab-${tabSeq}`
}

let groupSeq = 0
function nextGroupId(): string {
  groupSeq += 1
  return `grp-${groupSeq}`
}

function freshTab(destinationId: DestinationId, extra?: Partial<Pick<ShellTab, "pinned" | "groupId">>): ShellTab {
  return { id: nextTabId(), destinationId, pinned: extra?.pinned ?? false, groupId: extra?.groupId }
}

// --- Persistence -----------------------------------------------------
//
// The tab strip's own docking edge is explicitly required to survive a
// restart (see TabStrip.tsx's doc comment on `TabDock`); tab groups and
// group membership are persisted alongside it, keyed by the stable
// DestinationId rather than the ephemeral per-session tab id, so a group
// a user built survives the next launch even though `tabs` itself is
// re-seeded fresh every session. Guarded throughout: a private-browsing
// context or a corrupt/foreign value in localStorage degrades to the
// documented default rather than throwing during render.

const DOCK_STORAGE_KEY = "material-ollama:tab-dock"
const LAYOUT_STORAGE_KEY = "material-ollama:tab-layout"

const VALID_DOCKS: readonly TabDock[] = ["left", "right", "top", "bottom"]

function loadDock(): TabDock {
  if (typeof localStorage === "undefined") return DEFAULT_DOCK
  try {
    const raw = localStorage.getItem(DOCK_STORAGE_KEY)
    return (VALID_DOCKS as readonly string[]).includes(raw ?? "") ? (raw as TabDock) : DEFAULT_DOCK
  } catch {
    return DEFAULT_DOCK
  }
}

function saveDock(dock: TabDock): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(DOCK_STORAGE_KEY, dock)
  } catch {
    // Storage can genuinely be unavailable (private browsing, quota) —
    // the dock setting simply doesn't survive a restart in that case.
  }
}

interface StoredLayout {
  readonly groups: readonly TabGroupDef[]
  /** DestinationId -> groupId */
  readonly membership: Readonly<Record<string, string>>
  /** DestinationId -> pinned */
  readonly pinned: Readonly<Record<string, boolean>>
}

const EMPTY_LAYOUT: StoredLayout = { groups: [], membership: {}, pinned: {} }

function isTabGroupDef(value: unknown): value is TabGroupDef {
  if (!value || typeof value !== "object") return false
  const g = value as Record<string, unknown>
  return typeof g.id === "string" && typeof g.name === "string" && typeof g.color === "string" && typeof g.collapsed === "boolean"
}

function loadLayout(): StoredLayout {
  if (typeof localStorage === "undefined") return EMPTY_LAYOUT
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return EMPTY_LAYOUT
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return EMPTY_LAYOUT
    const obj = parsed as Record<string, unknown>
    const groups = Array.isArray(obj.groups) ? obj.groups.filter(isTabGroupDef) : []
    const membership =
      obj.membership && typeof obj.membership === "object" ? (obj.membership as Record<string, unknown>) : {}
    const pinned = obj.pinned && typeof obj.pinned === "object" ? (obj.pinned as Record<string, unknown>) : {}
    const groupIds = new Set(groups.map((g) => g.id))
    const cleanMembership: Record<string, string> = {}
    for (const [destId, groupId] of Object.entries(membership)) {
      if (typeof groupId === "string" && groupIds.has(groupId)) cleanMembership[destId] = groupId
    }
    const cleanPinned: Record<string, boolean> = {}
    for (const [destId, isPinned] of Object.entries(pinned)) {
      if (isPinned === true) cleanPinned[destId] = true
    }
    return { groups, membership: cleanMembership, pinned: cleanPinned }
  } catch {
    return EMPTY_LAYOUT
  }
}

function saveLayout(layout: StoredLayout): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Same non-fatal degradation as saveDock() above.
  }
}

/** Rewrites `tabs` so every group's members sit contiguously, inserted at
 * the group's first (lowest-index) member's original position — exactly
 * how a real browser physically clusters a tab the moment it joins a
 * group. Ungrouped tabs, and each group's own relative appearance order
 * among ungrouped tabs and other groups, are otherwise left untouched. */
function regroup(tabs: readonly ShellTab[]): ShellTab[] {
  const membersByGroup = new Map<string, ShellTab[]>()
  for (const tab of tabs) {
    if (!tab.groupId) continue
    const bucket = membersByGroup.get(tab.groupId) ?? []
    bucket.push(tab)
    membersByGroup.set(tab.groupId, bucket)
  }

  const result: ShellTab[] = []
  const placedGroups = new Set<string>()
  for (const tab of tabs) {
    if (!tab.groupId) {
      result.push(tab)
      continue
    }
    if (placedGroups.has(tab.groupId)) continue // this group's whole run was already inserted
    placedGroups.add(tab.groupId)
    result.push(...(membersByGroup.get(tab.groupId) ?? [tab]))
  }
  return result
}

export interface UseShellTabsResult {
  readonly tabs: readonly ShellTab[]
  readonly groups: readonly TabGroupDef[]
  readonly dock: TabDock
  readonly setDock: (dock: TabDock) => void
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
  readonly closeTabs: (tabIds: readonly string[]) => void
  readonly closeAllUnpinned: () => void
  readonly closeOthers: (tabId: string) => void
  readonly closeRight: (tabId: string) => void
  readonly togglePin: (tabId: string) => void
  readonly createGroup: (name: string) => string
  readonly renameGroup: (groupId: string, name: string) => void
  readonly setGroupColor: (groupId: string, color: string) => void
  readonly toggleGroupCollapsed: (groupId: string) => void
  readonly removeGroup: (groupId: string) => void
  readonly moveTabToGroup: (tabId: string, groupId: string | null) => void
  readonly reorderGroup: (groupId: string, direction: "up" | "down") => void
  readonly reorderTabWithinGroup: (tabId: string, direction: "up" | "down") => void
}

/**
 * Owns the open-tabs strip. Tabs track *destinations* (one of the nine rail
 * items), not exact URLs — every `/c/*` chat lives inside the one "Chat"
 * tab, matching the design's screen-not-route model. The router's current
 * pathname is the only source of truth for which tab/rail item is active;
 * this hook only adds the bookkeeping browser-style tabs need on top of
 * that (open/closed, pinned, grouped, docked) and keeps a tab open for
 * wherever navigation actually lands, even when something other than this
 * hook (e.g. a chat-list link) drove it there.
 */
export function useShellTabs(): UseShellTabsResult {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()
  const activeDestinationId = destinationForPath(pathname).id

  const [dock, setDockState] = useState<TabDock>(() => loadDock())
  const [layout] = useState<StoredLayout>(() => loadLayout())
  const [groups, setGroups] = useState<TabGroupDef[]>(() => [...layout.groups])
  const [tabs, setTabs] = useState<ShellTab[]>(() =>
    regroup([
      freshTab(activeDestinationId, {
        pinned: layout.pinned[activeDestinationId] === true,
        groupId: layout.membership[activeDestinationId],
      }),
    ]),
  )

  const setDock = useCallback((next: TabDock) => {
    setDockState(next)
    saveDock(next)
  }, [])

  // Pure and idempotent (only ever returns the same array back or a strict
  // superset), so it stays safe even if StrictMode invokes it twice.
  useEffect(() => {
    setTabs((current) => {
      if (current.some((tab) => tab.destinationId === activeDestinationId)) return current
      return regroup([
        ...current,
        freshTab(activeDestinationId, {
          pinned: layout.pinned[activeDestinationId] === true,
          groupId: layout.membership[activeDestinationId],
        }),
      ])
    })
    // `layout` is captured once at mount (see the useState initializer
    // above) and never changes identity afterward, so it's intentionally
    // left out of this dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDestinationId])

  // Persist groups + per-destination pin/group membership whenever either
  // changes. Deliberately does NOT persist tab open/close/order — a tab is
  // re-derived from whatever destination the router actually lands on,
  // exactly as before this lane; only the docking edge, the set of groups,
  // and which destinations belong to them survive a restart.
  useEffect(() => {
    const membership: Record<string, string> = {}
    const pinned: Record<string, boolean> = {}
    for (const tab of tabs) {
      if (tab.groupId) membership[tab.destinationId] = tab.groupId
      if (tab.pinned) pinned[tab.destinationId] = true
    }
    saveLayout({ groups, membership, pinned })
  }, [groups, tabs])

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

  const closeTabs = useCallback(
    (tabIds: readonly string[]) => {
      const closingIds = new Set(tabIds)
      if (closingIds.size === 0) return
      const closingActive = tabs.some((tab) => closingIds.has(tab.id) && tab.destinationId === activeDestinationId)
      let next = tabs.filter((tab) => !closingIds.has(tab.id))
      if (next.length === 0) next = [freshTab(DEFAULT_DESTINATION_ID)]
      setTabs(next)
      if (closingActive) {
        openDestination(next[next.length - 1].destinationId)
      }
    },
    [tabs, activeDestinationId, openDestination],
  )

  const closeTab = useCallback((tabId: string) => closeTabs([tabId]), [closeTabs])

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

  const createGroup = useCallback((name: string): string => {
    const id = nextGroupId()
    const trimmed = name.trim()
    setGroups((current) => [
      ...current,
      { id, name: trimmed || `Group ${current.length + 1}`, color: GROUP_COLORS[current.length % GROUP_COLORS.length], collapsed: false },
    ])
    return id
  }, [])

  const renameGroup = useCallback((groupId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group)))
  }, [])

  const setGroupColor = useCallback((groupId: string, color: string) => {
    setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, color } : group)))
  }, [])

  const toggleGroupCollapsed = useCallback((groupId: string) => {
    setGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, collapsed: !group.collapsed } : group)),
    )
  }, [])

  const removeGroup = useCallback((groupId: string) => {
    setGroups((current) => current.filter((group) => group.id !== groupId))
    setTabs((current) => current.map((tab) => (tab.groupId === groupId ? { ...tab, groupId: undefined } : tab)))
  }, [])

  const moveTabToGroup = useCallback((tabId: string, groupId: string | null) => {
    setTabs((current) => regroup(current.map((tab) => (tab.id === tabId ? { ...tab, groupId: groupId ?? undefined } : tab))))
  }, [])

  const reorderGroup = useCallback((groupId: string, direction: "up" | "down") => {
    setGroups((current) => {
      const index = current.findIndex((group) => group.id === groupId)
      if (index === -1) return current
      const swapWith = direction === "up" ? index - 1 : index + 1
      if (swapWith < 0 || swapWith >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(swapWith, 0, moved)
      return next
    })
  }, [])

  const reorderTabWithinGroup = useCallback((tabId: string, direction: "up" | "down") => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId)
      if (index === -1) return current
      const groupId = current[index].groupId
      if (!groupId) return current
      const swapWith = direction === "up" ? index - 1 : index + 1
      if (swapWith < 0 || swapWith >= current.length) return current
      if (current[swapWith].groupId !== groupId) return current
      const next = [...current]
      const tmp = next[index]
      next[index] = next[swapWith]
      next[swapWith] = tmp
      return next
    })
  }, [])

  return useMemo(
    () => ({
      tabs,
      groups,
      dock,
      setDock,
      activeDestinationId,
      activeTabId,
      openDestination,
      activateTab,
      closeTab,
      closeTabs,
      closeAllUnpinned,
      closeOthers,
      closeRight,
      togglePin,
      createGroup,
      renameGroup,
      setGroupColor,
      toggleGroupCollapsed,
      removeGroup,
      moveTabToGroup,
      reorderGroup,
      reorderTabWithinGroup,
    }),
    [
      tabs,
      groups,
      dock,
      setDock,
      activeDestinationId,
      activeTabId,
      openDestination,
      activateTab,
      closeTab,
      closeTabs,
      closeAllUnpinned,
      closeOthers,
      closeRight,
      togglePin,
      createGroup,
      renameGroup,
      setGroupColor,
      toggleGroupCollapsed,
      removeGroup,
      moveTabToGroup,
      reorderGroup,
      reorderTabWithinGroup,
    ],
  )
}
