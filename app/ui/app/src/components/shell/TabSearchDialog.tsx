import { useEffect, useMemo, useState } from "react"
import { Dialog, ListItem } from "@/components/md3"
import { Icon, type SymbolName } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import { TabSearchField } from "./TabSearchField"
import { EMPTY_TAB_SEARCH_QUERY, filterByTabQuery, type TabSearchQuery } from "./tabSearch"
import "./shell.dict"

export interface TabSearchDialogTab {
  readonly id: string
  readonly label: string
  readonly icon: SymbolName
  readonly pinned: boolean
  readonly groupName?: string
}

export interface TabSearchDialogProps {
  open: boolean
  onClose: () => void
  tabs: readonly TabSearchDialogTab[]
  activeId: string
  onActivate: (id: string) => void
}

/**
 * The tab system's fourth required discovery search: a master search
 * across every open tab the app owns, regardless of group or pinned
 * state — reachable from a dedicated title-bar affordance (see AppShell),
 * not gated behind the tab strip or any one group. Carries its own
 * RegexBuilder-backed TabSearchField and its own state, independent of
 * the other three discovery searches.
 */
export function TabSearchDialog({ open, onClose, tabs, activeId, onActivate }: TabSearchDialogProps) {
  const t = useT("shell")
  const [query, setQuery] = useState<TabSearchQuery>(EMPTY_TAB_SEARCH_QUERY)

  useEffect(() => {
    if (open) setQuery(EMPTY_TAB_SEARCH_QUERY)
  }, [open])

  const results = useMemo(() => filterByTabQuery(tabs, query), [tabs, query])

  return (
    <Dialog open={open} onClose={onClose} size="md" icon="search" title={t("searchAllTabs")}>
      <div className="flex flex-col gap-3">
        <TabSearchField
          query={query}
          onQueryChange={setQuery}
          label={t("searchAllTabs")}
          placeholder={t("searchAllTabsPlaceholder")}
        />
        <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-on-surface-variant">
              <Txt ns="shell" k="noOpenTabsMatch" channel="copy" />
            </p>
          ) : (
            results.map((tab) => (
              <ListItem
                key={tab.id}
                shape="rounded"
                selected={tab.id === activeId}
                leading={<Icon name={tab.icon} size={18} className="text-on-surface-variant" />}
                title={tab.label}
                supporting={tab.groupName}
                trailing={
                  tab.pinned ? (
                    <span className="flex items-center gap-1 text-[10.5px] text-on-surface-variant">
                      <Icon name="keep" size={14} />
                      <Txt ns="shell" k="pinnedBadge" channel="copy" />
                    </span>
                  ) : undefined
                }
                onClick={() => {
                  onActivate(tab.id)
                  onClose()
                }}
              />
            ))
          )}
        </div>
      </div>
    </Dialog>
  )
}
