import { useId, useState } from "react"
import type { ReactNode } from "react"
import { IconButton, Surface } from "@/components/md3"
import { Icon, type SymbolName } from "@/components/md3/Icon"
import { fact, Txt, useT, type Localized } from "@/uh"
import "./settingsUi.dict"

export interface SettingRowProps {
  icon: SymbolName
  /** The row's visible label — already localized (from `t()`/`Txt`). */
  title: Localized
  /**
   * The progressive-disclosure explanation: hidden until the info toggle is
   * opened, per the "settings explain themselves" contract. Every control
   * on this screen carries one — it states what the setting actually does,
   * not a restatement of `title`.
   */
  explanation: Localized
  /**
   * The truthful provenance line: whether the current value came from a
   * stored preference or is the compiled-in default, naming the real
   * default value rather than the bare word "default". Built by
   * `./provenance`'s `provenanceFact()` so every row phrases it the same
   * way. Omit only for a row with no bindable value at all (a pure action
   * or an informational statement, e.g. Data & privacy's export button) —
   * every row that carries a persisted setting must pass one.
   */
  provenance?: Localized
  /** Exact reason the control is unusable right now (e.g. "waiting for
   * preferences to load"). Rendered instead of the control, per the guided-
   * forms contract: a disabled control always names its unmet condition. */
  disabledReason?: Localized
  children: ReactNode
  className?: string
}

/**
 * The one row shape every card on this screen builds settings controls
 * from: an icon, a title, a collapsed-by-default explanation (tap the
 * lightbulb), a provenance line, and the real control. Centralizing this
 * is what makes "every control carries an explanation and a provenance
 * line" checkable in one place instead of by convention across six cards.
 */
export function SettingRow({
  icon,
  title,
  explanation,
  provenance,
  disabledReason,
  children,
  className,
}: SettingRowProps) {
  const t = useT("settingsUi")
  const [expanded, setExpanded] = useState(false)
  const explanationId = useId()

  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <Icon name={icon} size={19} className="mt-0.5 shrink-0 text-on-surface-variant" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-on-surface">{title}</span>
            <IconButton
              icon="lightbulb"
              size="sm"
              label={fact(`${t("explainToggle")} — ${title}`, "user-input")}
              selected={expanded}
              aria-expanded={expanded}
              aria-controls={explanationId}
              onClick={() => setExpanded((current) => !current)}
            />
          </div>
          {expanded ? (
            <p id={explanationId} className="mt-1 text-[12px] leading-[1.5] text-on-surface-variant">
              {explanation}
            </p>
          ) : null}
          {provenance ? <p className="mt-1 text-[11px] text-outline">{provenance}</p> : null}
          <div className="mt-2">
            {disabledReason ? (
              <Surface tier="high" radius="lg" className="px-3 py-2 text-[12px] text-on-surface-variant">
                <Txt ns="settingsUi" k="disabledPrefix" /> {disabledReason}
              </Surface>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
