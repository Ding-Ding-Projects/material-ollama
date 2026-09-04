import { useState } from "react"
import { Button, ConfirmDialog, IconButton, ProgressBar, Surface } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, fact, useT } from "@/uh"
import type { TotpAccount, TotpCodeEntry } from "./totpApi"
import "./authenticator.dict"

/** "123456" -> "123 456"; odd digit counts split with the longer half
 * first (e.g. 7 -> "1234 567"), matching how real authenticator apps
 * group codes for readability. */
function groupCode(code: string): string {
  const half = Math.ceil(code.length / 2)
  return `${code.slice(0, half)} ${code.slice(half)}`
}

export interface TotpAccountRowProps {
  account: TotpAccount
  code?: TotpCodeEntry
  onDelete: (id: string) => Promise<void>
  deleting: boolean
}

export function TotpAccountRow({ account, code, onDelete, deleting }: TotpAccountRowProps) {
  const t = useT("authenticator")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const secretMissing = code?.secretMissing ?? false
  const period = code?.period ?? account.period
  const secondsRemaining = code?.secondsRemaining ?? 0
  const pct = period > 0 ? Math.max(0, Math.min(100, (secondsRemaining / period) * 100)) : 0

  const handleDelete = async () => {
    setError(null)
    try {
      await onDelete(account.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-2.5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-on-surface">{fact(account.name, "user-input")}</p>
          <p className="text-[11px] text-on-surface-variant">
            {fact(account.algorithm, "user-input")} · {fact(account.digits, "count")} {t("digitsLabel")}
          </p>
        </div>

        {secretMissing ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-error-container px-3 py-1 text-[11px] font-semibold text-on-error-container">
            <Icon name="warning" size={13} />
            <Txt ns="authenticator" k="secretMissingWarning" channel="copy" />
          </span>
        ) : code?.code ? (
          <div className="flex flex-col items-end gap-1">
            <span className="font-mono text-xl font-semibold tracking-widest text-on-surface" aria-live="polite">
              {fact(groupCode(code.code), "user-input")}
            </span>
            <div className="flex w-[120px] items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <ProgressBar
                  value={pct}
                  height={5}
                  label={fact(`${account.name} — ${secondsRemaining}s remaining`, "user-input")}
                />
              </div>
              {/* The bar alone is never the only signal -- an explicit
               * numeric countdown sits beside it, matching the "not
               * colour-only" requirement for any countdown in this app. */}
              <span className="w-[26px] shrink-0 text-right font-mono text-[10.5px] text-on-surface-variant">
                {fact(`${secondsRemaining}s`, "count")}
              </span>
            </div>
          </div>
        ) : (
          <span className="text-[11px] text-on-surface-variant">…</span>
        )}

        <IconButton
          icon="delete"
          label={fact(`${t("deleteAccountAction")} — ${account.name}`, "user-input")}
          size="sm"
          danger
          disabled={deleting}
          onClick={() => setConfirmOpen(true)}
        />
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-error-container px-3 py-2 text-[11.5px] text-on-error-container">
          <span>{fact(error, "user-input")}</span>
          <Button variant="text" size="sm" onClick={handleDelete}>
            {t("errorRetry")}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("deleteAccountTitle")}
        body={t("deleteAccountBody")}
        keyword="REMOVE"
        actionLabel={t("deleteAccountAction")}
        onConfirm={handleDelete}
      />
    </Surface>
  )
}
