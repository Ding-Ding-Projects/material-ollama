import { useMemo, useState } from "react"
import { Badge, ListItem, SearchField } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { fact, useT } from "@/uh"
import type { ConvertCategory, ConvertFormat } from "./convertApi"
import "./convert.dict"

function matchesQuery(format: ConvertFormat, query: string, regex: boolean): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  const haystack = `${format.label} ${format.id} ${(format.extensions ?? []).join(" ")}`.toLowerCase()
  if (!regex) return haystack.includes(trimmed.toLowerCase())
  try {
    return new RegExp(trimmed, "i").test(haystack)
  } catch {
    // A pattern mid-typing is a normal state, not an error to throw
    // through the render -- treat it as "no matches" like ModelsScreen's
    // matchesQuery does for the identical case.
    return false
  }
}

export interface ConvertCategoryListProps {
  category: ConvertCategory
  onSelectFormat: (formatId: string) => void
  selectedFormatId?: string
  sourceFormatId?: string
  /** True once a source file is picked -- available rows stay visible and
   * explorable either way, but only become clickable once there is
   * something to convert. */
  pickable: boolean
}

/** One category of the file-converter catalog: its own search (plain
 * text by default, an explicit `.* ` regex toggle -- the same
 * SearchField/onToggleRegex contract ModelsScreen, DocsDrawer and every
 * other list search in this app already uses) over its format rows. An
 * unavailable format is never hidden -- it is shown, disabled, with the
 * exact missing dependency and the exact path this build looked for it
 * at, per the file-converter's honesty contract. */
export function ConvertCategoryList({
  category,
  onSelectFormat,
  selectedFormatId,
  sourceFormatId,
  pickable,
}: ConvertCategoryListProps) {
  const t = useT("convert")
  const [query, setQuery] = useState("")
  const [regex, setRegex] = useState(false)

  const filtered = useMemo(
    () => category.formats.filter((format) => matchesQuery(format, query, regex)),
    [category.formats, query, regex],
  )

  const countText = fact(t("categoryFormatCount").split("{n}").join(String(category.formats.length)), "count")

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-on-surface">{category.label}</span>
        <Badge tone="neutral" variant="label">
          {countText}
        </Badge>
        <SearchField
          value={query}
          onChange={setQuery}
          label={`${t("searchFormatsLabel")} — ${category.label}`}
          placeholder={t("searchFormatsPlaceholder")}
          regex={regex}
          onToggleRegex={() => setRegex((current) => !current)}
          className="ml-auto w-[180px]"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-2 py-2 text-[11.5px] text-on-surface-variant">{t("noFormatsMatch")}</p>
      ) : (
        <div className="flex flex-col divide-y divide-outline-variant/60">
          {filtered.map((format) => {
            const isSource = format.id === sourceFormatId
            const clickable = format.available && pickable && !isSource
            const supporting = format.available
              ? [
                  isSource ? t("currentFormat") : null,
                  (format.extensions ?? []).join(" "),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : `${t("notAvailableOffline")} — ${t("missingDependency")
                  .split("{tool}")
                  .join(format.missingDependency ?? "?")
                  .split("{path}")
                  .join(format.expectedPath ?? "?")}`

            return (
              <ListItem
                key={format.id}
                shape="rounded"
                leading={
                  <Icon
                    name={format.available ? "check_circle" : "lock"}
                    size={16}
                    className={format.available ? "text-tertiary" : "text-on-surface-variant"}
                  />
                }
                title={fact(format.label, "user-input")}
                supporting={fact(supporting, "user-input")}
                selected={selectedFormatId === format.id}
                onClick={clickable ? () => onSelectFormat(format.id) : undefined}
                className={!format.available ? "opacity-70" : undefined}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
