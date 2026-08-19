import { Icon } from "@/components/md3/Icon"
import type { SymbolName } from "@/components/md3/Icon"
import { Txt, type Localized } from "@/uh"
import "@/components/shell/shell.dict"

export interface PlaceholderScreenProps {
  icon: SymbolName
  heading: Localized
  subheading?: Localized
}

/**
 * The shared shape for every destination this lane wires into navigation
 * but does not implement: a real heading (and, where the design already
 * has one, a real subheading) plus an explicit, localized "not built yet"
 * state. No buttons, no fake data, no spinner that resolves to nothing —
 * a purely informational screen carries zero risk of looking interactive
 * and doing nothing.
 */
export function PlaceholderScreen({ icon, heading, subheading }: PlaceholderScreenProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto px-8 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-high text-on-surface-variant">
        <Icon name={icon} size={30} />
      </span>
      <h1 className="text-xl font-semibold text-on-surface">{heading}</h1>
      {subheading ? <p className="max-w-md text-sm text-on-surface-variant">{subheading}</p> : null}
      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-tertiary-container px-3 py-1 text-xs font-semibold text-on-tertiary-container">
        <Icon name="construction" size={14} />
        <Txt ns="shell" k="notBuiltYet" channel="copy" />
      </span>
      <p className="max-w-md text-[12.5px] text-on-surface-variant">
        <Txt ns="shell" k="notBuiltYetBody" channel="copy" />
      </p>
    </div>
  )
}
