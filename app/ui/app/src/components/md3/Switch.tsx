import * as Headless from "@headlessui/react"
import clsx from "clsx"
import { FOCUS_RING } from "./tokens"

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

/**
 * 48×28 track, 2px border, 20px knob riding on elev-1 — exactly the
 * dimensions and on/off palette (primary track+border+on-primary knob when
 * on; surface-highest track / outline border+knob when off) the mockup uses
 * for every toggle row in Settings. Headless UI 2.2's Switch doesn't emit a
 * `data-checked` attribute in this version, so the on/off classes are driven
 * directly from the `checked` prop rather than a CSS attribute selector.
 */
export function Switch({ checked, onChange, label, disabled = false, className }: SwitchProps) {
  return (
    <Headless.Field className={clsx("flex items-center gap-3", className)} disabled={disabled}>
      <Headless.Label className="cursor-pointer text-sm font-medium select-none">
        {label}
      </Headless.Label>
      <Headless.Switch
        checked={checked}
        onChange={onChange}
        className={clsx(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 p-0",
          "transition-colors duration-150",
          "disabled:opacity-38 disabled:pointer-events-none",
          checked ? "border-primary bg-primary" : "border-outline bg-surface-highest",
          FOCUS_RING,
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            "elev-1 pointer-events-none block h-5 w-5 rounded-full",
            "transition-transform duration-150",
            checked ? "translate-x-6 bg-on-primary" : "translate-x-0.5 bg-outline",
          )}
        />
      </Headless.Switch>
    </Headless.Field>
  )
}
