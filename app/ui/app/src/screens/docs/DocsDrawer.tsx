import { ListItem, SearchField } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, fact, useT } from "@/uh"
import type { DocsFeature } from "@/api"
import { filterFeatures, groupFeaturesAlphabetically } from "./groupFeatures"
import "./docs.dict"

export interface DocsDrawerProps {
  features: DocsFeature[]
  selectedId: string | null
  onSelect: (id: string) => void
  query: string
  onQueryChange: (query: string) => void
  regexMode: boolean
  onToggleRegex: () => void
}

/**
 * The 300px feature list: a plain/regex search bar (the SearchField's own
 * `.* ` toggle -- see command-palette.md for the shared inline-regex
 * pattern this reuses) over an A-Z grouped, scrollable list of all 85
 * shared-contract features. Each row shows a real written/scaffold status,
 * never just a name -- a reader browsing the drawer can tell at a glance
 * which of the 85 rows actually has documentation yet.
 */
export function DocsDrawer({
  features,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  regexMode,
  onToggleRegex,
}: DocsDrawerProps) {
  const t = useT("docs")
  const filtered = filterFeatures(features, query, regexMode)
  const groups = groupFeaturesAlphabetically(filtered)
  const countText = fact(t("matchCount").split("{n}").join(String(filtered.length)), "count")

  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col border-r border-outline-variant bg-surface-low">
      <div className="flex flex-col gap-2 border-b border-outline-variant p-3">
        <SearchField
          value={query}
          onChange={onQueryChange}
          placeholder={t("searchPlaceholder")}
          label={t("searchLabel")}
          regex={regexMode}
          onToggleRegex={onToggleRegex}
        />
        <p className="px-1 text-[11px] text-on-surface-variant">{countText}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-on-surface-variant">
            <Txt ns="docs" k="noMatches" channel="copy" />
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.letter} className="mb-1">
              <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant">
                {group.letter}
              </div>
              {group.features.map((feature) => (
                <ListItem
                  key={feature.id}
                  shape="pill"
                  selected={feature.id === selectedId}
                  leading={
                    <Icon
                      name={feature.written ? "check_circle" : "construction"}
                      size={16}
                      className={feature.written ? "text-tertiary" : "text-on-surface-variant"}
                    />
                  }
                  title={feature.title}
                  supporting={feature.written ? t("writtenBadge") : t("scaffoldBadge")}
                  onClick={() => onSelect(feature.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
