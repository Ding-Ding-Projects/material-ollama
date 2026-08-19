import clsx from "clsx"
import type { KeyboardEvent, MouseEvent, ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Icon, type SymbolName } from "./Icon"
import { Popover } from "./Popover"
import type { AnchorPosition } from "./tokens"
import { FOCUS_RING, FOCUS_RING_INSET } from "./tokens"

/** Which edge of the app the strip is docked to. `left` is the default —
 * a screen is wider than it is tall and a tab label is wider than it is
 * high, so a vertical strip shows more tabs legibly than a horizontal one
 * ever can. Docking is an orientation change, never a rotation: nothing in
 * this file rotates a label 90 degrees. */
export type TabDock = "left" | "right" | "top" | "bottom"

export interface TabStripGroup {
  readonly id: string
  readonly name: string
  /** A CSS color, e.g. "#7cb342". */
  readonly color: string
  readonly collapsed: boolean
}

export interface TabStripTab {
  id: string
  label: string
  icon: SymbolName
  pinned?: boolean
  /** Membership in one of `groups` — a tab with no `groupId` (or one that
   * names an id not present in `groups`) renders as an ordinary ungrouped
   * tab. Consecutive tabs sharing the same `groupId` render as one visual
   * cluster; the caller (useShellTabs' moveTabToGroup) is what keeps a
   * group's members contiguous in `tabs`. */
  groupId?: string
}

export interface TabStripProps {
  tabs: TabStripTab[]
  groups?: readonly TabStripGroup[]
  activeId: string
  /** Defaults to "left" — see `TabDock` above for why. */
  dock?: TabDock
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onContextMenu?: (id: string, event: MouseEvent) => void
  /** Renders a trailing "Close all unpinned tabs" affordance. */
  onCloseAll?: () => void
  onToggleGroupCollapsed?: (groupId: string) => void
  /** Content for the strip's own search popover — always rendered (not
   * only when tabs overflow), since "search the current strip" is one of
   * the tab system's four required discovery searches regardless of
   * whether anything is actually clipped right now. The trigger button
   * picks up a tonal highlight when the strip is genuinely overflowing,
   * so it doubles as the overflow escape hatch without being gated on it. */
  overflowPanel?: ReactNode
  overflowLabel: string
  /** Only meaningful for a vertical (left/right) dock: collapses the rail
   * to icon-only rows, a user-triggered stand-in for automatic
   * narrow-width collapse (a fixed rail has no viewport to react to).
   * Omit both to skip the toggle entirely (always expanded). */
  railExpanded?: boolean
  onToggleRailExpanded?: () => void
  expandRailLabel?: string
  collapseRailLabel?: string
  className?: string
}

type StripBlock =
  | { kind: "tab"; tab: TabStripTab }
  | { kind: "group"; group: TabStripGroup; members: TabStripTab[] }

function buildBlocks(tabs: readonly TabStripTab[], groupById: Map<string, TabStripGroup>): StripBlock[] {
  const blocks: StripBlock[] = []
  let i = 0
  while (i < tabs.length) {
    const tab = tabs[i]
    const group = tab.groupId ? groupById.get(tab.groupId) : undefined
    if (!group) {
      blocks.push({ kind: "tab", tab })
      i += 1
      continue
    }
    const members: TabStripTab[] = [tab]
    let j = i + 1
    while (j < tabs.length && tabs[j].groupId === group.id) {
      members.push(tabs[j])
      j += 1
    }
    blocks.push({ kind: "group", group, members })
    i = j
  }
  return blocks
}

const DOCK_ANCHOR: Record<TabDock, AnchorPosition> = {
  left: "right start",
  right: "left start",
  top: "bottom start",
  bottom: "top start",
}

/**
 * The browser-style tab strip: docks to any of the four edges, shows an
 * overflow-safe search popover, clusters grouped tabs (with a collapse
 * affordance), and keeps a real roving-tabindex `role="tablist"` whose
 * arrow-key axis matches its orientation — `aria-orientation="vertical"`
 * plus Up/Down for a side dock, the original `aria-orientation` omitted
 * (defaults to the ARIA-implicit "horizontal") plus Left/Right for top/
 * bottom. A collapsed group renders one summary chip instead of its
 * members and is reached by Tab (ordinary button tab order), not by the
 * tablist's own arrow-key cycle — arrow keys only ever move between real,
 * individually activatable tabs.
 */
export function TabStrip({
  tabs,
  groups = [],
  activeId,
  dock = "left",
  onActivate,
  onClose,
  onContextMenu,
  onCloseAll,
  onToggleGroupCollapsed,
  overflowPanel,
  overflowLabel,
  railExpanded = true,
  onToggleRailExpanded,
  expandRailLabel,
  collapseRailLabel,
  className,
}: TabStripProps) {
  const vertical = dock === "left" || dock === "right"
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasOverflow, setHasOverflow] = useState(false)

  // ResizeObserver-driven, not measured on every render: jsdom (this
  // repo's DOM test environment) never lays out real pixel dimensions, so
  // scrollWidth/clientWidth stay 0/0 there and this simply never reports
  // overflow under test — a real Chromium runtime measures it correctly.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const measure = () => {
      setHasOverflow(vertical ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [vertical, tabs.length])

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g] as const)), [groups])
  const blocks = useMemo(() => buildBlocks(tabs, groupById), [tabs, groupById])

  // Only tabs that are actually rendered as role="tab" participate in the
  // arrow-key cycle — a tab hidden inside a collapsed group is skipped
  // entirely rather than landed on, since there is nothing there to select.
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => !(tab.groupId && groupById.get(tab.groupId)?.collapsed)),
    [tabs, groupById],
  )
  const visibleIndex = useMemo(() => {
    const map = new Map<string, number>()
    visibleTabs.forEach((tab, index) => map.set(tab.id, index))
    return map
  }, [visibleTabs])

  const move = (from: number, delta: number) => {
    if (visibleTabs.length === 0) return
    const next = visibleTabs[(from + delta + visibleTabs.length) % visibleTabs.length]
    if (next) onActivate(next.id)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const forwardKey = vertical ? "ArrowDown" : "ArrowRight"
    const backwardKey = vertical ? "ArrowUp" : "ArrowLeft"
    if (event.key === forwardKey) {
      event.preventDefault()
      move(index, 1)
    } else if (event.key === backwardKey) {
      event.preventDefault()
      move(index, -1)
    } else if (event.key === "Home") {
      event.preventDefault()
      const first = visibleTabs[0]
      if (first) onActivate(first.id)
    } else if (event.key === "End") {
      event.preventDefault()
      const last = visibleTabs[visibleTabs.length - 1]
      if (last) onActivate(last.id)
    }
  }

  const collapsedRail = vertical && !railExpanded

  function renderTabButton(tab: TabStripTab) {
    const active = tab.id === activeId
    const index = visibleIndex.get(tab.id) ?? 0
    return (
      <div
        key={tab.id}
        role="tab"
        aria-selected={active}
        aria-label={collapsedRail ? tab.label : undefined}
        title={collapsedRail ? tab.label : undefined}
        tabIndex={active ? 0 : -1}
        onClick={() => onActivate(tab.id)}
        onContextMenu={onContextMenu ? (event) => onContextMenu(tab.id, event) : undefined}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onActivate(tab.id)
            return
          }
          handleKeyDown(event, index)
        }}
        className={clsx(
          "flex flex-none cursor-pointer items-center text-[12.5px]",
          vertical
            ? clsx("w-full gap-2 rounded-[10px] py-2", collapsedRail ? "justify-center px-1.5" : "gap-2 px-3")
            : clsx(
                "h-full min-w-[56px] max-w-[200px] gap-1.5 rounded-t-[10px] border border-b-0 border-outline-variant py-[5px] pr-2 pl-3",
              ),
          active
            ? vertical
              ? "bg-secondary-container text-on-secondary-container"
              : "bg-background text-on-surface"
            : vertical
              ? "bg-transparent text-on-surface-variant hover:bg-surface-high"
              : "bg-transparent text-on-surface-variant",
          FOCUS_RING_INSET,
        )}
      >
        {!collapsedRail && tab.groupId ? (
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: groupById.get(tab.groupId)?.color }}
          />
        ) : null}
        <Icon name={tab.icon} size={16} className="shrink-0" />
        {!collapsedRail ? (
          <>
            <span className="min-w-0 flex-1 truncate whitespace-nowrap">{tab.label}</span>
            {tab.pinned ? <Icon name="keep" size={14} className="shrink-0 text-outline" /> : null}
            <button
              type="button"
              aria-label={`Close ${tab.label}`}
              onClick={(event) => {
                event.stopPropagation()
                onClose(tab.id)
              }}
              className="relative inline-flex shrink-0 items-center rounded-full p-0.5 text-outline before:absolute before:-inset-1 before:content-[''] hover:bg-surface-highest hover:text-on-surface"
            >
              <Icon name="close" size={14} />
            </button>
          </>
        ) : null}
      </div>
    )
  }

  function renderGroupHeader(group: TabStripGroup, count: number) {
    const collapseTitle = group.collapsed ? `Expand ${group.name} (${count})` : `Collapse ${group.name}`
    return (
      <button
        key={`group-header-${group.id}`}
        type="button"
        onClick={() => onToggleGroupCollapsed?.(group.id)}
        title={collapseTitle}
        aria-label={collapseTitle}
        aria-expanded={!group.collapsed}
        className={clsx(
          "flex flex-none items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium",
          "hover:bg-surface-high",
          vertical ? "w-full justify-start" : "",
          FOCUS_RING,
        )}
      >
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
        {!collapsedRail ? (
          <span className="max-w-[110px] truncate text-on-surface-variant">{group.name}</span>
        ) : null}
        {group.collapsed ? (
          <span className="rounded-full bg-surface-highest px-1.5 text-[10px] text-on-surface-variant">{count}</span>
        ) : (
          <Icon name="arrow_drop_down" size={14} className="shrink-0 text-outline" />
        )}
      </button>
    )
  }

  const dockAnchor = DOCK_ANCHOR[dock]

  return (
    <div
      className={clsx(
        "flex bg-surface-low",
        vertical
          ? clsx(
              "h-full flex-col items-stretch gap-1 overflow-y-auto p-1.5",
              collapsedRail ? "w-[64px]" : "w-[208px]",
              dock === "left" ? "border-r border-outline-variant" : "border-l border-outline-variant",
            )
          : clsx(
              "h-[38px] items-center gap-1 px-2",
              dock === "top" ? "border-b border-outline-variant" : "border-t border-outline-variant",
            ),
        className,
      )}
    >
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Open tabs"
        aria-orientation={vertical ? "vertical" : "horizontal"}
        className={clsx(
          vertical
            ? "flex min-h-0 flex-1 flex-col items-stretch gap-1 overflow-y-auto"
            : "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]",
        )}
      >
        {blocks.map((block) => {
          if (block.kind === "tab") return renderTabButton(block.tab)
          if (block.group.collapsed) {
            return renderGroupHeader(block.group, block.members.length)
          }
          return (
            <div
              key={`group-${block.group.id}`}
              className={clsx(
                "flex flex-none gap-1 rounded-[12px] border p-1",
                vertical ? "flex-col items-stretch" : "flex-row items-center",
              )}
              style={{ borderColor: block.group.color }}
            >
              {renderGroupHeader(block.group, block.members.length)}
              {block.members.map((member) => renderTabButton(member))}
            </div>
          )
        })}
      </div>

      <div className={clsx("flex flex-none items-center gap-1", vertical && "flex-col")}>
        {overflowPanel ? (
          <Popover
            anchor={dockAnchor}
            triggerLabel={overflowLabel}
            trigger={<Icon name="search" size={16} />}
            triggerClassName={clsx(
              "h-8 w-8 items-center justify-center rounded-full border-none px-0 py-0",
              hasOverflow
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface-variant hover:bg-surface-high",
            )}
            className="flex max-h-[70vh] w-[320px] flex-col gap-2 p-3"
          >
            {overflowPanel}
          </Popover>
        ) : null}
        {onCloseAll ? (
          <button
            type="button"
            onClick={onCloseAll}
            title="Close all unpinned tabs"
            aria-label="Close all unpinned tabs"
            className={clsx(
              "relative flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] text-on-surface-variant hover:bg-surface-high",
              vertical && "w-full justify-center",
              FOCUS_RING_INSET,
            )}
          >
            <Icon name="tab_close" size={16} />
            {!collapsedRail ? "Close all" : null}
          </button>
        ) : null}
        {vertical && onToggleRailExpanded ? (
          <button
            type="button"
            onClick={onToggleRailExpanded}
            title={railExpanded ? collapseRailLabel : expandRailLabel}
            aria-label={railExpanded ? collapseRailLabel : expandRailLabel}
            className={clsx(
              "relative flex h-7 w-full shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-high",
              FOCUS_RING_INSET,
            )}
          >
            <Icon
              name="arrow_drop_down"
              size={16}
              className={clsx(
                "transition-transform duration-150",
                dock === "left"
                  ? railExpanded
                    ? "-rotate-90"
                    : "rotate-90"
                  : railExpanded
                    ? "rotate-90"
                    : "-rotate-90",
              )}
            />
          </button>
        ) : null}
      </div>
    </div>
  )
}
