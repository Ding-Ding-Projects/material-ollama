import { useMemo, useState } from "react"
import { Dialog, ListItem, SearchField } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import { DESTINATIONS, type DestinationId } from "./destinations"
import "./shell.dict"

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onSelect: (id: DestinationId) => void
}

/**
 * Ctrl+Shift+F opens this — a Dialog + SearchField + ListItem list that
 * teleports to any of the nine destinations. Plain-text filtering is the
 * default; the SearchField's own `.* ` affordance flips on a real (if
 * simple) regex mode, matching the shared regex-builder contract's "plain
 * text default, regex an explicit opt-in" rule without pulling in the full
 * anchored builder, which is a separate feature outside this lane's scope.
 */
export function CommandPalette({ open, onClose, onSelect }: CommandPaletteProps) {
  const t = useT("app")
  const tShell = useT("shell")
  const [query, setQuery] = useState("")
  const [regexMode, setRegexMode] = useState(false)

  const results = useMemo(() => {
    if (!query) return DESTINATIONS
    if (regexMode) {
      try {
        const pattern = new RegExp(query, "i")
        return DESTINATIONS.filter((destination) => pattern.test(t(destination.labelKey)))
      } catch {
        return []
      }
    }
    const needle = query.toLowerCase()
    return DESTINATIONS.filter((destination) => t(destination.labelKey).toLowerCase().includes(needle))
  }, [query, regexMode, t])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      icon="search"
      title={<Txt ns="shell" k="commandPalette" channel="copy" />}
    >
      <div className="flex flex-col gap-3" data-capture-id="command-palette" data-capture-ready="true">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t("paletteHint")}
          label={tShell("commandSearch")}
          regex={regexMode}
          onToggleRegex={() => setRegexMode((current) => !current)}
        />
        <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-on-surface-variant">
              <Txt ns="shell" k="noMatches" channel="copy" />
            </p>
          ) : (
            results.map((destination) => (
              <ListItem
                key={destination.id}
                shape="rounded"
                leading={<Icon name={destination.icon} size={18} className="text-on-surface-variant" />}
                title={t(destination.labelKey)}
                supporting={tShell("screenKind")}
                onClick={() => {
                  onSelect(destination.id)
                  setQuery("")
                  setRegexMode(false)
                }}
              />
            ))
          )}
        </div>
      </div>
    </Dialog>
  )
}
