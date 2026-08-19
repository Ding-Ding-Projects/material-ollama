import { useState } from "react"
import { Button, ConfirmDialog } from "@/components/md3"
import type { SymbolName } from "@/components/md3/Icon"
import { Txt, useT, type Localized } from "@/uh"
import "./bulk.dict"
import { BulkActionPreviewDialog } from "./BulkActionPreviewDialog"
import type { UseBulkSelectionResult } from "./useBulkSelection"

export interface BulkActionConfirm {
  readonly kind: "preview" | "destructive"
  /** Required, and only meaningful, for `kind: "destructive"` -- the
   * exact word the user must type before the action arms (see
   * md3/ConfirmDialog.tsx). */
  readonly keyword?: "DELETE" | "REMOVE" | "RESET" | "CLEAR"
  readonly body: Localized
}

export interface BulkAction {
  readonly key: string
  readonly label: Localized
  readonly icon?: SymbolName
  /** Runs against the exact ids currently selected AND loaded (see
   * BulkActionBar's own doc comment for the "all matching" boundary). */
  readonly run: (selectedIds: readonly string[]) => void | Promise<void>
  /** Omit for an action simple/reversible enough to run immediately on
   * click (e.g. "Export selected"). `{kind: "preview"}` shows the exact
   * affected count first; `{kind: "destructive"}` additionally requires
   * the typed-keyword super-confirmation gate. */
  readonly confirm?: BulkActionConfirm
}

export interface BulkActionBarProps {
  /** The loaded page's ids -- same set passed to `useBulkSelection`.
   * Needed here to resolve `selection`'s scope-based membership (which,
   * for `scope !== "none"`, isn't stored as an explicit id set) into the
   * concrete array every `BulkAction.run()` needs. */
  readonly ids: readonly string[]
  readonly selection: UseBulkSelectionResult
  readonly actions: readonly BulkAction[]
}

/**
 * Appears only once something is selected, and disappears the instant
 * nothing is -- never left behind describing a selection that no longer
 * exists. Carries the honestly-scoped select-all pair ("this page" vs
 * "every match", only both offered when they'd actually differ), clear,
 * invert, and every supplied action -- gated behind a reviewable preview
 * or the full destructive super-confirmation per that action's own
 * `confirm` setting.
 */
export function BulkActionBar({ ids, selection, actions }: BulkActionBarProps) {
  const t = useT("bulk")
  const [previewAction, setPreviewAction] = useState<BulkAction | null>(null)
  const [destructiveAction, setDestructiveAction] = useState<BulkAction | null>(null)

  if (selection.count === 0) return null

  const selectedOnPage = ids.filter((id) => selection.isSelected(id))

  const scopeLabel =
    selection.scope === "page"
      ? t("selectedCountPage")
      : selection.scope === "all"
        ? t("selectedCountAll")
        : t("selectedCountPlain")

  const handleActionClick = (action: BulkAction) => {
    if (action.confirm?.kind === "destructive") {
      setDestructiveAction(action)
    } else if (action.confirm?.kind === "preview") {
      setPreviewAction(action)
    } else {
      void action.run(selectedOnPage)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-outline-variant bg-surface-high px-3 py-2.5">
      <span className="text-[13px] font-semibold">
        {selection.count} {scopeLabel}
      </span>

      <span className="mx-1 h-4 w-px bg-outline-variant" aria-hidden="true" />

      {/* "Select all"/"Select all matching" live in BulkSelectAllHeader,
          not here -- that header is always visible (this bar is not,
          see the early return above), so it's the only honest place to
          put the one control that can get a user from zero selected to
          the whole page/every match in the first place. */}
      <Button variant="text" size="sm" onClick={selection.invert}>
        <Txt ns="bulk" k="invertSelection" channel="label" />
      </Button>
      <Button variant="text" size="sm" onClick={selection.clear}>
        <Txt ns="bulk" k="clearSelection" channel="label" />
      </Button>

      <span className="mx-1 h-4 w-px bg-outline-variant" aria-hidden="true" />

      {actions.map((action) => (
        <Button
          key={action.key}
          variant={action.confirm?.kind === "destructive" ? "danger" : "outlined"}
          size="sm"
          icon={action.icon}
          onClick={() => handleActionClick(action)}
        >
          {action.label}
        </Button>
      ))}

      {previewAction ? (
        <BulkActionPreviewDialog
          open
          onClose={() => setPreviewAction(null)}
          onConfirm={() => {
            void previewAction.run(selectedOnPage)
            setPreviewAction(null)
          }}
          title={previewAction.label}
          affectedCount={selectedOnPage.length}
          selectedCount={selection.count}
          confirmLabel={t("confirmAction")}
        />
      ) : null}

      {destructiveAction?.confirm?.keyword ? (
        <ConfirmDialog
          open
          onClose={() => setDestructiveAction(null)}
          title={destructiveAction.label}
          body={destructiveAction.confirm.body}
          keyword={destructiveAction.confirm.keyword}
          actionLabel={destructiveAction.label}
          onConfirm={() => {
            void destructiveAction.run(selectedOnPage)
          }}
        />
      ) : null}
    </div>
  )
}
