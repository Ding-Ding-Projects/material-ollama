import { useT } from "@/uh"
import { NotBuiltSection } from "./toolbox/NotBuiltSection"
import { RegexLabSection } from "./toolbox/RegexLabSection"
import "./toolbox/toolboxLab.dict"

/**
 * The Toolbox screen. The regex lab is a real, fully client-side feature
 * (see `RegexLabSection` / `RegexBuilder`) — nothing here is a
 * placeholder. File converter and Authenticator have no backend in this
 * build (no bundled-adapter conversion service, no OS-credential-vault
 * TOTP store) and are rendered as honest, control-free "not built yet"
 * sections naming exactly what each one needs, per this lane's brief.
 */
export default function ToolboxScreen() {
  const t = useT("tools")
  const tLab = useT("toolboxLab")

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-6 py-6" data-capture-id="toolbox" data-capture-ready="true">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-on-surface">{t("toolboxTitle")}</h1>
        <p className="text-sm text-on-surface-variant">{t("toolboxSub")}</p>
      </header>

      <RegexLabSection />

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex-1">
          <NotBuiltSection icon="sync_alt" heading={t("converter")} needs={tLab("converterNeeds")} />
        </div>
        <div className="flex-1">
          <NotBuiltSection icon="lock" heading={t("authenticator")} needs={tLab("authenticatorNeeds")} />
        </div>
      </div>
    </div>
  )
}
