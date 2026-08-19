import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  AppMark,
  ContextMenu,
  NavigationRail,
  SnackbarProvider,
  TabStrip,
  type MenuItemDef,
  type NavigationRailItem,
  type TabStripTab,
} from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, fact, useT, useUh, type Localized } from "@/uh"
import { CommandPalette } from "./CommandPalette"
import { NotificationCenter } from "./NotificationCenter"
import { DESTINATIONS, destinationById, type DestinationId } from "./destinations"
import { useShellEvents } from "./useShellEvents"
import { useShellTabs } from "./useShellTabs"
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

interface TabContextMenuState {
  readonly x: number
  readonly y: number
  readonly tabId: string
}

/**
 * The three-band chrome: a 44px title bar, a 38px browser-style tab strip,
 * and an 84px navigation rail beside the routed content. Wraps everything
 * in SnackbarProvider (the one place in the tree that needs to) and owns
 * the command palette + notification center overlays.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT("app")
  const voice = useUh()
  const tabs = useShellTabs()
  const events = useShellEvents()

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<TabContextMenuState | null>(null)
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

  const searchTitle = `${t("palette")} (⇧⌘F)`

  function describeTabAction(tabId: string, actionKey: "pin" | "unpin" | "group" | "ungroup" | "closeTab"): Localized {
    const tab = tabs.tabs.find((candidate) => candidate.id === tabId)
    const label = tab ? t(destinationById(tab.destinationId).labelKey) : ""
    return fact(`${t(actionKey)} · ${label}`, "user-input")
  }

  function closeTabWithEvent(tabId: string) {
    const description = describeTabAction(tabId, "closeTab")
    tabs.closeTab(tabId)
    events.record("close", description)
  }

  function closeContextMenu() {
    setCtxMenu(null)
    // Custom overlay (not Headless UI), so focus restoration is ours to do:
    // land back on whichever tab ends up active rather than dropping focus
    // to <body>.
    requestAnimationFrame(() => {
      tabStripRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
    })
  }

  function buildTabMenuItems(tabId: string): MenuItemDef[] {
    const tab = tabs.tabs.find((candidate) => candidate.id === tabId)
    if (!tab) return []
    return [
      {
        label: t(tab.pinned ? "unpin" : "pin"),
        icon: "keep",
        onClick: () => {
          const description = describeTabAction(tabId, tab.pinned ? "unpin" : "pin")
          tabs.togglePin(tabId)
          events.record("keep", description)
        },
      },
      {
        label: t(tab.groupColor ? "ungroup" : "group"),
        icon: "folder",
        onClick: () => {
          const description = describeTabAction(tabId, tab.groupColor ? "ungroup" : "group")
          tabs.toggleGroup(tabId)
          events.record("folder", description)
        },
      },
      { label: t("closeOthers"), icon: "tab_close", onClick: () => tabs.closeOthers(tabId) },
      { label: t("closeRight"), icon: "arrow_range", onClick: () => tabs.closeRight(tabId) },
      { label: t("closeTab"), icon: "close", danger: true, onClick: () => closeTabWithEvent(tabId) },
    ]
  }

  const tabStripTabs: TabStripTab[] = tabs.tabs.map((tab) => {
    const destination = destinationById(tab.destinationId)
    return {
      id: tab.id,
      label: t(destination.labelKey),
      icon: destination.icon,
      pinned: tab.pinned,
      groupColor: tab.groupColor,
    }
  })

  const railItems: NavigationRailItem[] = DESTINATIONS.map((destination) => ({
    id: destination.id,
    icon: destination.icon,
    label: t(destination.labelKey),
    to: destination.path,
  }))

  return (
    <SnackbarProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-sm text-on-surface">
        <div className="flex h-11 flex-none items-center gap-2.5 bg-surface-low pr-3 pl-4">
          <AppMark size={20} className="shrink-0" title={APP_NAME} />
          <span className="text-sm font-semibold tracking-[.1px]">
            <Txt channel="content" as="span">
              {APP_NAME}
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

        <div ref={tabStripRef}>
          <TabStrip
            tabs={tabStripTabs}
            activeId={tabs.activeTabId ?? ""}
            onActivate={tabs.activateTab}
            onClose={closeTabWithEvent}
            onContextMenu={(id, event) => {
              event.preventDefault()
              setCtxMenu({ x: event.clientX, y: event.clientY, tabId: id })
            }}
            onCloseAll={tabs.closeAllUnpinned}
          />
        </div>

        <div className="flex min-h-0 flex-1">
          <NavigationRail
            items={railItems}
            activeId={tabs.activeDestinationId}
            onNavigate={(item) => tabs.openDestination(item.id as DestinationId)}
          />
          <main className="min-w-0 flex-1 overflow-auto bg-background">{children}</main>
        </div>
      </div>

      {ctxMenu ? (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={buildTabMenuItems(ctxMenu.tabId)} onClose={closeContextMenu} filterable />
      ) : null}

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
