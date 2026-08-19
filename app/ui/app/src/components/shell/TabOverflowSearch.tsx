import { useClose } from "@headlessui/react"
import { useMemo, useState } from "react"
import { ListItem } from "@/components/md3"
import { Icon, type SymbolName } from "@/components/md3/Icon"
import { useT } from "@/uh"
import { TabSearchField } from "./TabSearchField"
import { filterByTabQuery, EMPTY_TAB_SEARCH_QUERY, type TabSearchQuery } from "./tabSearch"
import "./shell.dict"

export interface TabOverflowSearchTab {
  readonly id: string
  readonly label: string
  readonly icon: SymbolName
  readonly pinned: boolean
  readonly groupName?: string
}

export interface TabOverflowSearchProps {
  tabs: readonly TabOverflowSearchTab[]
  activeId: string
  onActivate: (id: string) => void
}

/**
 * Content for the tab strip's own search popover (discovery search #1:
 * "search the current strip"). Lists every open tab — visible or scrolled
 * out of view — with its own RegexBuilder-backed TabSearchField, so this
 * popover doubles as the overflow escape hatch without being gated on
 * whether the strip is actually overflowing right now.
 *
 * Rendered as `children` of the shared `Popover` primitive (see
 * TabStrip.tsx), so `useClose()` from Headless UI finds that Popover's
 * context and can close it the moment a result is picked, without this
 * component needing an `onClose` prop threaded down from its parent.
 */
export function TabOverflowSearch({ tabs, activeId, onActivate }: TabOverflowSearchProps) {
  const t = useT("shell")
  const close = useClose()
  const [query, setQuery] = useState<TabSearchQuery>(EMPTY_TAB_SEARCH_QUERY)

  const results = useMemo(() => filterByTabQuery(tabs, query), [tabs, query])

  return (
    <div className="flex flex-col gap-2">
      <TabSearchField
        query={query}
        onQueryChange={setQuery}
        label={t("searchCurrentStripLabel")}
        placeholder={t("searchCurrentStripPlaceholder")}
        align="end"
      />
      <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
        {results.length === 0 ? (
          <p className="px-2 py-4 text-center text-[12px] text-on-surface-variant">{t("noOpenTabsMatch")}</p>
        ) : (
          results.map((tab) => (
            <ListItem
              key={tab.id}
              shape="rounded"
              selected={tab.id === activeId}
              leading={<Icon name={tab.icon} size={16} className="text-on-surface-variant" />}
              title={tab.label}
              supporting={tab.groupName}
              trailing={tab.pinned ? <Icon name="keep" size={14} className="text-outline" /> : undefined}
              onClick={() => {
                onActivate(tab.id)
                close()
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}
