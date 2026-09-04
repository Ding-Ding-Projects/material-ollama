import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  AppMark,
  IconButton,
  Menu,
  NavigationRail,
  SnackbarProvider,
  TabStrip,
  type MenuItemDef,
  type NavigationRailItem,
  type TabStripTab,
} from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import type { TabDock, TabStripGroup } from "@/components/md3/TabStrip"
import { Txt, fact, useT, useUh } from "@/uh"
import { CommandPalette } from "./CommandPalette"
import { NotificationCenter } from "./NotificationCenter"
import { TabBulkCloseDialog } from "./TabBulkCloseDialog"
import { TabContextMenu, type TabContextMenuItemDef } from "./TabContextMenu"
import { TabGroupsPanel, type TabGroupsPanelMember } from "./TabGroupsPanel"
import { TabMoveToGroupPicker } from "./TabMoveToGroupPicker"
import { TabOverflowSearch } from "./TabOverflowSearch"
import { TabSearchDialog } from "./TabSearchDialog"
import { DESTINATIONS, destinationById, type DestinationId } from "./destinations"
import type { BulkCloseCandidate } from "./tabBulkClose"
import { useCloseActiveTabShortcutLabel, useShellCloseActiveTabShortcut } from "./useShellKeyboardShortcuts"
import { useShellEvents } from "./useShellEvents"
import { useShellTabs, type ShellTab } from "./useShellTabs"
import "./shell.dict"

// The app's own mark and name. Both are genuinely user-owned/renamable
// content in the design this lane implements (glyph picker, editable app
// name) — that surface lives in Settings, out of this lane's scope, so
// these are the shipped defaults rendered as static content rather than
// dictionary copy (an app name isn't prose to translate). Module-scope
// constants, not JSX literals, so a future rename only touches one place.
// The project mark itself, not a borrowed icon-font glyph. See
// app/assets/material-ollama-mark.svg for the committed vector master and
// scripts/build-app-icon.mjs for the packaged .ico generated from it.
const APP_NAME = "Material Ollama"
const SCHOOL_MODE_NAME = "School mode"

const DOCK_LABEL_KEYS: Record<TabDock, "dockLeft" | "dockRight" | "dockTop" | "dockBottom"> = {
  left: "dockLeft",
  right: "dockRight",
  top: "dockTop",
  bottom: "dockBottom",
}
const DOCK_OPTIONS: readonly TabDock[] = ["left", "right", "top", "bottom"]

interface TabContextMenuState {
  readonly x: number
  readonly y: number
  readonly tabId: string
}

/**
 * The three-band chrome: a 44px title bar, a browser-style tab strip that
 * docks to any of the four edges (left by default), and an 84px
 * navigation rail beside the routed content. Wraps everything in
 * SnackbarProvider (the one place in the tree that needs to) and owns the
 * command palette, notification center, and the tab system's own
 * overlays: the per-tab context menu (with its right-aligned keyboard-
 * shortcut column), the move-into-group picker, the groups manager, the
 * master tab search, and the bulk-close-by-text dialog.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT("app")
  const tShell = useT("shell")
  const voice = useUh()
  // The user's chosen name if they set one, otherwise the shipped name.
  // Display only -- APP_NAME remains the identity anything diagnostic
  // should report, so a renamed install is still recognisable in a log.
  const displayName = voice.appName || APP_NAME
  const tabs = useShellTabs()
  const events = useShellEvents()

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<TabContextMenuState | null>(null)
  const [moveToGroupTabId, setMoveToGroupTabId] = useState<string | null>(null)
  const [groupsPanelOpen, setGroupsPanelOpen] = useState(false)
  const [tabSearchOpen, setTabSearchOpen] = useState(false)
  const [bulkCloseOpen, setBulkCloseOpen] = useState(false)
  const [railExpanded, setRailExpanded] = useState(true)
  const tabStripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "F" || event.key === "f")) {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const closeActiveTabShortcutLabel = useCloseActiveTabShortcutLabel()

  const searchTitle = `${t("palette")} (⇧⌘F)`

  function labelFor(tab: ShellTab): string {
    return t(destinationById(tab.destinationId).labelKey)
  }

  function closeTabWithEvent(tabId: string) {
    const tab = tabs.tabs.find((candidate) => candidate.id === tabId)
    const description = fact(`${t("closeTab")} · ${tab ? labelFor(tab) : ""}`, "user-input")
    tabs.closeTab(tabId)
    events.record("close", description)
  }

  useShellCloseActiveTabShortcut(() => {
    if (tabs.activeTabId) closeTabWithEvent(tabs.activeTabId)
  })

  function closeContextMenu() {
    setCtxMenu(null)
    // Custom overlay (not Headless UI), so focus restoration is ours to do:
    // land back on whichever tab ends up active rather than dropping focus
    // to <body>.
    requestAnimationFrame(() => {
      tabStripRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
    })
  }

  function buildTabMenuItems(tabId: string): TabContextMenuItemDef[] {
    const idx = tabs.tabs.findIndex((candidate) => candidate.id === tabId)
    const tab = tabs.tabs[idx]
    if (!tab) return []
    const canMoveUp = tab.groupId !== undefined && idx > 0 && tabs.tabs[idx - 1].groupId === tab.groupId
    const canMoveDown =
      tab.groupId !== undefined && idx < tabs.tabs.length - 1 && tabs.tabs[idx + 1].groupId === tab.groupId
    const isActiveTab = tabId === tabs.activeTabId

    const items: TabContextMenuItemDef[] = [
      {
        key: "pin",
        label: t(tab.pinned ? "unpin" : "pin"),
        icon: "keep",
        onClick: () => {
          const description = fact(`${t(tab.pinned ? "unpin" : "pin")} · ${labelFor(tab)}`, "user-input")
          tabs.togglePin(tabId)
          events.record("keep", description)
        },
      },
      {
        key: "move-to-group",
        label: tShell("addToGroup"),
        icon: "folder",
        onClick: () => setMoveToGroupTabId(tabId),
      },
    ]

    if (tab.groupId) {
      items.push(
        {
          key: "remove-from-group",
          label: tShell("removeFromGroup"),
          icon: "folder",
          onClick: () => {
            const description = fact(`${tShell("tabUngrouped")} · ${labelFor(tab)}`, "user-input")
            tabs.moveTabToGroup(tabId, null)
            events.record("folder", description)
          },
        },
        {
          key: "move-up",
          label: tShell("moveTabUp"),
          icon: "arrow_upward",
          disabled: !canMoveUp,
          onClick: () => tabs.reorderTabWithinGroup(tabId, "up"),
        },
        {
          key: "move-down",
          label: tShell("moveTabDown"),
          icon: "arrow_upward",
          disabled: !canMoveDown,
          onClick: () => tabs.reorderTabWithinGroup(tabId, "down"),
        },
      )
    }

    items.push(
      { key: "close-others", label: t("closeOthers"), icon: "tab_close", onClick: () => tabs.closeOthers(tabId) },
      { key: "close-right", label: t("closeRight"), icon: "arrow_range", onClick: () => tabs.closeRight(tabId) },
      {
        key: "close-tab",
        label: t("closeTab"),
        icon: "close",
        danger: true,
        // Ctrl+W genuinely only ever closes the *active* tab — showing the
        // shortcut on a right-clicked background tab would be a lie about
        // what pressing it actually does.
        shortcut: isActiveTab ? closeActiveTabShortcutLabel : undefined,
        onClick: () => closeTabWithEvent(tabId),
      },
    )

    return items
  }

  const tabStripTabs: TabStripTab[] = tabs.tabs.map((tab) => {
    const destination = destinationById(tab.destinationId)
    return {
      id: tab.id,
      label: t(destination.labelKey),
      icon: destination.icon,
      pinned: tab.pinned,
      groupId: tab.groupId,
    }
  })

  const tabStripGroups: TabStripGroup[] = tabs.groups.map((group) => ({ ...group }))

  const overflowTabs = tabs.tabs.map((tab) => ({
    id: tab.id,
    label: labelFor(tab),
    icon: destinationById(tab.destinationId).icon,
    pinned: tab.pinned,
    groupName: tab.groupId ? tabs.groups.find((group) => group.id === tab.groupId)?.name : undefined,
  }))

  const membersByGroup = new Map<string, TabGroupsPanelMember[]>()
  for (const tab of tabs.tabs) {
    if (!tab.groupId) continue
    const list = membersByGroup.get(tab.groupId) ?? []
    list.push({ id: tab.id, label: labelFor(tab), icon: destinationById(tab.destinationId).icon })
    membersByGroup.set(tab.groupId, list)
  }
  const memberCountByGroup = new Map<string, number>()
  for (const [groupId, members] of membersByGroup) memberCountByGroup.set(groupId, members.length)

  const bulkCloseCandidates: BulkCloseCandidate[] = tabs.tabs.map((tab) => ({
    tabId: tab.id,
    label: labelFor(tab),
    pinned: tab.pinned,
  }))

  const moveToGroupTab = moveToGroupTabId ? tabs.tabs.find((tab) => tab.id === moveToGroupTabId) : undefined

  const dockMenuItems: MenuItemDef[] = DOCK_OPTIONS.map((option) => ({
    label: tShell(DOCK_LABEL_KEYS[option]),
    icon: option === tabs.dock ? "check_circle" : "arrow_range",
    onClick: () => {
      const description = fact(`${tShell("dockChanged")} · ${tShell(DOCK_LABEL_KEYS[option])}`, "user-input")
      tabs.setDock(option)
      events.record("sync_alt", description)
    },
  }))

  const railItems: NavigationRailItem[] = DESTINATIONS.map((destination) => ({
    id: destination.id,
    icon: destination.icon,
    label: t(destination.labelKey),
    to: destination.path,
  }))

  const dockedTabStrip = (
    <div ref={tabStripRef} className="flex-none">
      <TabStrip
        tabs={tabStripTabs}
        groups={tabStripGroups}
        activeId={tabs.activeTabId ?? ""}
        dock={tabs.dock}
        onActivate={tabs.activateTab}
        onClose={closeTabWithEvent}
        onContextMenu={(id, event) => {
          event.preventDefault()
          setCtxMenu({ x: event.clientX, y: event.clientY, tabId: id })
        }}
        onCloseAll={tabs.closeAllUnpinned}
        onToggleGroupCollapsed={tabs.toggleGroupCollapsed}
        overflowPanel={
          <TabOverflowSearch tabs={overflowTabs} activeId={tabs.activeTabId ?? ""} onActivate={tabs.activateTab} />
        }
        overflowLabel={tShell("searchCurrentStripLabel")}
        railExpanded={railExpanded}
        onToggleRailExpanded={() => setRailExpanded((expanded) => !expanded)}
        expandRailLabel={tShell("expandRail")}
        collapseRailLabel={tShell("collapseRail")}
      />
    </div>
  )

  return (
    <SnackbarProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-sm text-on-surface">
        <div className="flex h-11 flex-none items-center gap-2.5 bg-surface-low pr-3 pl-4">
          <AppMark size={20} className="shrink-0" title={displayName} />
          <span className="text-sm font-semibold tracking-[.1px]">
            <Txt channel="content" as="span">
              {displayName}
            </Txt>
          </span>
          <span
            className="h-full flex-1"
            onMouseDown={() => window.drag?.()}
            onDoubleClick={() => window.doubleClick?.()}
          />
          {voice.schoolOn ? (
            <span className="flex items-center gap-1.5 rounded-full border border-outline-variant bg-secondary-container px-3 py-1 text-xs font-medium text-on-secondary-container">
              <Icon name="lock" size={16} />
              <Txt channel="content" as="span">
                {SCHOOL_MODE_NAME}
              </Txt>
            </span>
          ) : null}
          <Menu
            trigger={
              <>
                <Icon name="arrow_range" size={16} />
                <span>{tShell(DOCK_LABEL_KEYS[tabs.dock])}</span>
              </>
            }
            triggerLabel={tShell("dockLabel")}
            items={dockMenuItems}
          />
          <IconButton label={tShell("bulkClose")} icon="tab_close" size="sm" onClick={() => setBulkCloseOpen(true)} />
          <IconButton label={tShell("manageGroups")} icon="folder" size="sm" onClick={() => setGroupsPanelOpen(true)} />
          <IconButton label={tShell("searchAllTabs")} icon="search" size="sm" onClick={() => setTabSearchOpen(true)} />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            title={searchTitle}
            aria-label={searchTitle}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-highest px-3 py-1.5 text-xs text-on-surface-variant hover:bg-surface-high"
          >
            <Icon name="search" size={16} />
            <Txt ns="app" k="palette" channel="copy" />
            <span className="font-mono text-[10px] text-outline">
              <Txt channel="fact" value="⇧⌘F" kind="command" />
            </span>
          </button>
          <NotificationCenter events={events.events} hasUnread={events.hasUnread} onClearAll={events.clearAll} />
        </div>

        {tabs.dock === "top" ? dockedTabStrip : null}

        <div className="flex min-h-0 flex-1">
          {tabs.dock === "left" ? dockedTabStrip : null}
          <NavigationRail
            items={railItems}
            activeId={tabs.activeDestinationId}
            onNavigate={(item) => tabs.openDestination(item.id as DestinationId)}
          />
          <main className="min-w-0 flex-1 overflow-auto bg-background">{children}</main>
          {tabs.dock === "right" ? dockedTabStrip : null}
        </div>

        {tabs.dock === "bottom" ? dockedTabStrip : null}
      </div>

      {ctxMenu ? (
        <TabContextMenu x={ctxMenu.x} y={ctxMenu.y} items={buildTabMenuItems(ctxMenu.tabId)} onClose={closeContextMenu} />
      ) : null}

      {moveToGroupTab ? (
        <TabMoveToGroupPicker
          open
          onClose={() => setMoveToGroupTabId(null)}
          groups={tabs.groups}
          currentGroupId={moveToGroupTab.groupId}
          memberCountByGroup={memberCountByGroup}
          onPick={(groupId) => {
            const description = fact(
              `${groupId ? tShell("tabMoved") : tShell("tabUngrouped")} · ${labelFor(moveToGroupTab)}`,
              "user-input",
            )
            tabs.moveTabToGroup(moveToGroupTab.id, groupId)
            events.record("folder", description)
          }}
          onCreateAndPick={(name) => {
            const groupId = tabs.createGroup(name)
            tabs.moveTabToGroup(moveToGroupTab.id, groupId)
            const description = fact(`${tShell("groupCreated")} · ${name}`, "user-input")
            events.record("folder", description)
          }}
        />
      ) : null}

      <TabGroupsPanel
        open={groupsPanelOpen}
        onClose={() => setGroupsPanelOpen(false)}
        groups={tabs.groups}
        membersByGroup={membersByGroup}
        onCreateGroup={(name) => {
          tabs.createGroup(name)
          events.record("folder", fact(`${tShell("groupCreated")} · ${name}`, "user-input"))
        }}
        onRenameGroup={tabs.renameGroup}
        onSetGroupColor={tabs.setGroupColor}
        onToggleCollapsed={tabs.toggleGroupCollapsed}
        onDeleteGroup={(groupId) => {
          const name = tabs.groups.find((group) => group.id === groupId)?.name ?? ""
          tabs.removeGroup(groupId)
          events.record("folder", fact(`${tShell("groupDeleted")} · ${name}`, "user-input"))
        }}
        onReorderGroup={tabs.reorderGroup}
        onRemoveTabFromGroup={(tabId) => tabs.moveTabToGroup(tabId, null)}
        onActivateTab={(tabId) => {
          tabs.activateTab(tabId)
          setGroupsPanelOpen(false)
        }}
      />

      <TabSearchDialog
        open={tabSearchOpen}
        onClose={() => setTabSearchOpen(false)}
        tabs={overflowTabs}
        activeId={tabs.activeTabId ?? ""}
        onActivate={tabs.activateTab}
      />

      <TabBulkCloseDialog
        open={bulkCloseOpen}
        onClose={() => setBulkCloseOpen(false)}
        candidates={bulkCloseCandidates}
        onConfirm={(tabIds) => {
          tabs.closeTabs(tabIds)
          events.record("tab_close", fact(`${tShell("bulkClosed")} · ${tabIds.length}`, "user-input"))
        }}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(id) => {
          tabs.openDestination(id)
          setPaletteOpen(false)
        }}
      />
    </SnackbarProvider>
  )
}
