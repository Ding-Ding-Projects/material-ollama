import { Button } from "@/components/md3"
import { Txt, useT } from "@/uh"
import "./bulk.dict"
import { BulkCheckbox } from "./BulkCheckbox"
import type { UseBulkSelectionResult } from "./useBulkSelection"

export interface BulkSelectAllHeaderProps {
  /** The loaded page's ids -- same set passed to `useBulkSelection`. */
  readonly ids: readonly string[]
  readonly selection: UseBulkSelectionResult
}

/**
 * The one control that can actually GET a user from "nothing selected"
 * to "everything selected" -- unlike BulkActionBar (which only appears
 * once something is already selected, since its job is offering actions
 * on an existing selection), this header is always visible whenever the
 * list has anything in it. A tri-state master checkbox (unchecked / all
 * on this page / indeterminate for a partial selection), plus "Select
 * all N matching" as a distinct, explicitly-labeled second action the
 * instant there's more to select than what's loaded -- never a single
 * ambiguous "select all" that quietly means different things depending
 * on how many pages exist.
 */
export function BulkSelectAllHeader({ ids, selection }: BulkSelectAllHeaderProps) {
  const t = useT("bulk")
  if (ids.length === 0) return null

  const allOnPageSelected = ids.every((id) => selection.isSelected(id))
  const someSelected = selection.count > 0

  return (
    <div className="flex items-center gap-2.5">
      <BulkCheckbox
        checked={allOnPageSelected}
        indeterminate={someSelected && !allOnPageSelected}
        onChange={(checked) => {
          if (checked) selection.selectPage()
          else selection.clear()
        }}
        ariaLabel={t("selectAllOnPage")}
      />
      {selection.hasMoreThanLoaded && allOnPageSelected && selection.scope !== "all" ? (
        <Button variant="text" size="sm" onClick={selection.selectAllMatching}>
          <Txt ns="bulk" k="selectAllMatching" channel="label" />
        </Button>
      ) : null}
    </div>
  )
}
