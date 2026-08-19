import clsx from "clsx"
import { useEffect, useRef, useState } from "react"
import { SearchField } from "@/components/md3"
import { RegexBuilder } from "@/components/md3/RegexBuilder"
import { OVERLAY_RADIUS, OVERLAY_SURFACE } from "@/components/md3/tokens"
import { useT } from "@/uh"
import type { TabSearchQuery } from "./tabSearch"
import "./shell.dict"

export interface TabSearchFieldProps {
  query: TabSearchQuery
  onQueryChange: (query: TabSearchQuery) => void
  label: string
  placeholder: string
  /** Which side the builder panel opens toward — "end" for a field that
   * sits near the right edge of its container (so the panel doesn't run
   * off-screen). */
  align?: "start" | "end"
  className?: string
}

/**
 * The one search field every discovery search in the tab system (current
 * strip, within a group, groups-by-name, and the master search across
 * every open tab) is built from — a plain SearchField for the default
 * substring mode, plus its own anchored panel holding the real
 * RegexBuilder primitive so "each with its own RegexBuilder affordance and
 * its own state" holds literally: every call site owns an independent
 * `TabSearchQuery` (via the `query`/`onQueryChange` props), so opening one
 * search's builder can never leak into another's.
 *
 * The panel is a hand-built overlay (own surface, own radius, own
 * elevation, viewport-bounded via a max-height + internal scroll, Escape
 * and click-outside to close) rather than the shared `Popover` primitive:
 * `Popover` only opens in response to a click on the trigger button it
 * itself renders, and SearchField's own `.* ` affordance is a *different*
 * button living inside SearchField — there is no trigger element for
 * `Popover` to attach its Headless-UI-managed open state to here.
 *
 * Typing directly into the field is always plain-text substring matching
 * (regexMode stays false) — regex is only ever an explicit opt-in via
 * "Apply" inside the builder, matching the SearchField contract everywhere
 * else in this app.
 */
export function TabSearchField({
  query,
  onQueryChange,
  label,
  placeholder,
  align = "start",
  className,
}: TabSearchFieldProps) {
  const t = useT("shell")
  const [builderOpen, setBuilderOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!builderOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setBuilderOpen(false)
    }
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setBuilderOpen(false)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("mousedown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("mousedown", onPointerDown)
    }
  }, [builderOpen])

  return (
    <div ref={containerRef} className={clsx("relative", className)}>
      <SearchField
        value={query.text}
        onChange={(text) => onQueryChange({ text, regexMode: false, flags: "" })}
        placeholder={placeholder}
        label={label}
        regex={query.regexMode}
        onOpenBuilder={() => setBuilderOpen((open) => !open)}
      />
      {builderOpen ? (
        <div
          role="dialog"
          aria-label={t("regexBuilderLabel")}
          className={clsx(
            "absolute z-[75] mt-2 max-h-[60vh] w-[min(420px,88vw)] overflow-y-auto p-4",
            align === "end" ? "right-0" : "left-0",
            OVERLAY_SURFACE,
            OVERLAY_RADIUS.panel,
            "elev-2",
          )}
        >
          <RegexBuilder
            initialPattern={query.regexMode ? query.text : ""}
            initialFlags={query.flags}
            onApply={(pattern: string, flags: string) => {
              onQueryChange({ text: pattern, regexMode: true, flags })
              setBuilderOpen(false)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
