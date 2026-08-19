import { useT } from "@/uh"
import { AuthenticatorSection } from "./toolbox/AuthenticatorSection"
import { ConverterSection } from "./toolbox/ConverterSection"
import { RegexLabSection } from "./toolbox/RegexLabSection"
import "./toolbox/toolboxLab.dict"

/**
 * The Toolbox screen. Every section here is a real, fully wired feature:
 * the regex lab is client-side only (see `RegexLabSection` /
 * `RegexBuilder`), the file converter drives the real
 * `/api/v1/convert/*` catalog/probe/job-queue backend (see
 * `ConverterSection`), and the authenticator drives the real
 * `/api/v1/uh/totp/*` OS-credential-vault backend plus an in-process QR
 * pairing renderer (see `AuthenticatorSection`). Nothing here is a
 * placeholder.
 */
export default function ToolboxScreen() {
  const t = useT("tools")

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-6 py-6" data-capture-id="toolbox" data-capture-ready="true">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-on-surface">{t("toolboxTitle")}</h1>
        <p className="text-sm text-on-surface-variant">{t("toolboxSub")}</p>
      </header>

      <RegexLabSection />

      <ConverterSection />

      <AuthenticatorSection />
    </div>
  )
}
