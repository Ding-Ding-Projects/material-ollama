import { useCallback, useRef, useState } from "react"
import { SearchField, Surface, useSnackbar } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { RegexBuilder, type RegexBuilderHandle } from "@/components/md3/RegexBuilder"
import { Txt, useT } from "@/uh"
import "./toolboxLab.dict"

/**
 * The Toolbox screen's real, fully client-side regex laboratory. Two real
 * consumers wired to the one shared `RegexBuilder` primitive so the
 * "reusable component" and "apply to search" contract is genuinely
 * exercised, not just built and left dark:
 *
 *  - the demo `SearchField`'s `.* ` affordance calls `onOpenBuilder`, which
 *    scrolls to and focuses the builder below (`RegexBuilder`'s imperative
 *    handle) — exactly what every other search bar in the app will do once
 *    it's wired to this same component;
 *  - the builder's "Apply to search" action writes the built pattern back
 *    into that same search field and confirms with a real, non-blocking
 *    snackbar — a genuine round trip, no backend involved anywhere.
 */
export function RegexLabSection() {
  const tTools = useT("tools")
  const tLab = useT("toolboxLab")
  const snackbar = useSnackbar()
  const builderRef = useRef<RegexBuilderHandle>(null)
  const [demoValue, setDemoValue] = useState("")

  const handleApply = useCallback(
    (pattern: string, flags: string) => {
      setDemoValue(`/${pattern}/${flags}`)
      snackbar.show(tLab("appliedToast"))
    },
    [snackbar, tLab],
  )

  const openBuilder = useCallback(() => {
    builderRef.current?.focusPattern()
  }, [])

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2.5">
        <Icon name="regular_expression" size={20} className="shrink-0 text-on-surface-variant" />
        <h2 className="text-base font-semibold text-on-surface">{tTools("regexLab")}</h2>
      </div>
      <p className="text-[12.5px] text-on-surface-variant">
        <Txt ns="toolboxLab" k="regexLabSub" channel="copy" />
      </p>

      <div className="flex flex-col gap-1.5">
        <SearchField
          value={demoValue}
          onChange={setDemoValue}
          placeholder={tLab("demoSearchPlaceholder")}
          label={tLab("demoSearchLabel")}
          onOpenBuilder={openBuilder}
        />
        <p className="text-[11px] text-on-surface-variant">
          <Txt ns="toolboxLab" k="demoSearchHint" channel="copy" />
        </p>
      </div>

      <div className="h-px bg-outline-variant" />

      <RegexBuilder ref={builderRef} onApply={handleApply} />
    </Surface>
  )
}
