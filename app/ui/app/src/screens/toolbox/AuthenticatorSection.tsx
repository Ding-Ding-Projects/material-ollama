import { useState } from "react"
import { Button, Surface } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, fact, useT } from "@/uh"
import { PairingDialog } from "./PairingDialog"
import { TotpAccountRow } from "./TotpAccountRow"
import { useTotpAccounts } from "./useTotpAccounts"
import "./authenticator.dict"

/**
 * The Toolbox screen's built-in authenticator: real accounts stored in
 * this computer's OS credential vault (app/ui/totp.go's SecretStore),
 * real RFC 6238 codes computed server-side, and QR-based pairing drawn
 * entirely in-process (see qrcode.ts) -- nothing here is simulated, and
 * no secret is ever cached in this component's own state beyond the one
 * documented pairing-preview reveal.
 */
export function AuthenticatorSection() {
  const t = useT("authenticator")
  const tTools = useT("tools")
  const [dialogOpen, setDialogOpen] = useState(false)

  const { accounts, codesById, clockSkew, loading, error, refresh, createAccount, deleteAccount, deletingIds, creating } =
    useTotpAccounts()

  return (
    <Surface outlined radius="lg" className="flex flex-1 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Icon name="phone_locked" size={20} className="shrink-0 text-on-surface-variant" />
        <h2 className="text-base font-semibold text-on-surface">{tTools("authenticator")}</h2>
        <Button variant="tonal" size="sm" onClick={() => setDialogOpen(true)} className="ml-auto">
          {t("addAccount")}
        </Button>
      </div>
      <p className="text-[12.5px] text-on-surface-variant">
        <Txt ns="tools" k="totpHonest" channel="copy" />
      </p>

      {clockSkew?.likely ? (
        <div className="flex items-start gap-2 rounded-lg bg-error-container px-3 py-2 text-[11.5px] text-on-error-container">
          <Icon name="warning" size={15} className="mt-0.5 shrink-0" />
          <span>
            <Txt ns="authenticator" k="clockSkewWarning" channel="copy" />
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-error-container px-3 py-2 text-[11.5px] text-on-error-container">
          <span>{fact(error, "user-input")}</span>
          <button type="button" className="font-semibold underline" onClick={refresh}>
            {t("errorRetry")}
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="py-4 text-center text-[12.5px] text-on-surface-variant">{t("loadingAccounts")}</p>
      ) : accounts.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-on-surface-variant">{t("noAccounts")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <TotpAccountRow
              key={account.id}
              account={account}
              code={codesById.get(account.id)}
              onDelete={deleteAccount}
              deleting={deletingIds.has(account.id)}
            />
          ))}
        </div>
      )}

      <PairingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={createAccount}
        creating={creating}
      />
    </Surface>
  )
}
