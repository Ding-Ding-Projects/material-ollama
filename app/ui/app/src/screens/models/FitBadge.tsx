import { useState } from "react"
import { Badge, Dialog } from "@/components/md3"
import { Txt, fact, useT } from "@/uh"
import type { FitVerdict, FitVerdictKind } from "./types"
import "./modelsUi.dict"

const TONE_BY_VERDICT = {
  "runs-well": "tertiary",
  "runs-with-limits": "secondary",
  unlikely: "error",
  unknown: "neutral",
} as const

const LABEL_KEY_BY_VERDICT = {
  "runs-well": "fitRunsWell",
  "runs-with-limits": "fitRunsWithLimits",
  unlikely: "fitUnlikely",
  unknown: "fitUnknown",
} as const satisfies Record<FitVerdictKind, string>

export interface FitBadgeProps {
  fit: FitVerdict
  /** Used only to build this badge's accessible name (e.g. "Why this
   * verdict? — llama3.3:latest"), never rendered as its own text. */
  modelLabel: string
}

/**
 * The colored fit-verdict pill plus its evidence. Per the brief, a badge
 * alone is not enough — the server's real reasoning (evidence, the
 * assumptions it made, and anything it couldn't measure) must be visible,
 * not just implied by color. Tapping the badge opens it in full; when the
 * server returned nothing beyond the bare verdict, the badge renders as a
 * plain, non-interactive pill instead of a dead button.
 */
export function FitBadge({ fit, modelLabel }: FitBadgeProps) {
  const t = useT("modelsUi")
  const [open, setOpen] = useState(false)
  const hasDetails =
    (fit.evidence?.length ?? 0) + (fit.assumptions?.length ?? 0) + (fit.missingData?.length ?? 0) > 0

  const pill = (
    <Badge tone={TONE_BY_VERDICT[fit.verdict]} variant="label">
      <Txt ns="modelsUi" k={LABEL_KEY_BY_VERDICT[fit.verdict]} />
    </Badge>
  )

  if (!hasDetails) return pill

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={fact(`${t("fitDetailsTitle")} — ${modelLabel}`, "user-input")}
        className="rounded-full focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--p)]"
      >
        {pill}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} icon="memory" title={t("fitDetailsTitle")} size="sm">
        <div className="flex flex-col gap-3 text-[12.5px]">
          {fit.evidence?.length ? (
            <div>
              <div className="mb-1 font-semibold text-on-surface-variant">
                <Txt ns="modelsUi" k="evidence" />
              </div>
              <ul className="flex flex-col gap-1">
                {fit.evidence.map((line, i) => (
                  <li key={i} className="text-on-surface">
                    {fact(line, "user-input")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {fit.assumptions?.length ? (
            <div>
              <div className="mb-1 font-semibold text-on-surface-variant">
                <Txt ns="modelsUi" k="assumptions" />
              </div>
              <ul className="flex flex-col gap-1">
                {fit.assumptions.map((line, i) => (
                  <li key={i} className="text-on-surface-variant">
                    {fact(line, "user-input")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {fit.missingData?.length ? (
            <div>
              <div className="mb-1 font-semibold text-on-surface-variant">
                <Txt ns="modelsUi" k="missingData" />
              </div>
              <ul className="flex flex-col gap-1">
                {fit.missingData.map((line, i) => (
                  <li key={i} className="text-on-surface-variant">
                    {fact(line, "user-input")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}
