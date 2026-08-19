import { Surface } from "@/components/md3"
import { Icon, type SymbolName } from "@/components/md3/Icon"
import { Txt, type Localized } from "@/uh"
import "@/components/shell/shell.dict"

export interface NotBuiltSectionProps {
  icon: SymbolName
  heading: Localized
  /** Names exactly what real backend this section needs before it can
   * carry any controls — never a description of behavior it doesn't have. */
  needs: Localized
}

/**
 * The File converter and Authenticator sections of the Toolbox screen have
 * no backend in this build and must not fake one. This renders the same
 * honest "not built yet" badge `PlaceholderScreen` uses (via the `shell`
 * dictionary), plus a section-specific sentence naming the real service
 * this exact feature needs — and zero controls, on purpose.
 */
export function NotBuiltSection({ icon, heading, needs }: NotBuiltSectionProps) {
  return (
    <Surface outlined radius="lg" className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Icon name={icon} size={20} className="shrink-0 text-on-surface-variant" />
        <h2 className="text-base font-semibold text-on-surface">{heading}</h2>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-tertiary-container px-3 py-1 text-xs font-semibold text-on-tertiary-container">
          <Icon name="construction" size={14} />
          <Txt ns="shell" k="notBuiltYet" channel="copy" />
        </span>
      </div>
      <p className="text-[12.5px] text-on-surface-variant">{needs}</p>
    </Surface>
  )
}
