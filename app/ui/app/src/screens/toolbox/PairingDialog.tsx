import { useState } from "react"
import { Button, Dialog, SegmentedControl, Select, TextField } from "@/components/md3"
import { Txt, fact, useT } from "@/uh"
import { QrCode } from "./QrCode"
import { previewTotpPairing, type CreateTotpAccountRequest, type TotpPairingResponse } from "./totpApi"
import "./authenticator.dict"

export interface PairingDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (request: CreateTotpAccountRequest) => Promise<unknown>
  creating: boolean
}

const ALGORITHMS = ["SHA1", "SHA256", "SHA512"] as const
const DIGIT_OPTIONS = [
  { value: "6", label: "6" },
  { value: "7", label: "7" },
  { value: "8", label: "8" },
]

/** Groups a base32 secret into 4-character blocks for manual entry --
 * "JBSWY3DPEHPK3PXP" -> "JBSW Y3DP EHPK 3PXP" -- matching how every
 * authenticator app already displays a manual-entry secret. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim()
}

/**
 * New-account pairing: a name+algorithm+digits+period form, a "Preview
 * pairing" step that asks the server for a fresh random secret and its
 * `otpauth://` URI (nothing persisted yet), an in-process QR render of
 * that URI plus the manual secret behind an explicit reveal, and a final
 * "Confirm & store secret" step that is the only call that actually
 * writes the secret into this computer's OS credential vault.
 */
export function PairingDialog({ open, onClose, onConfirm, creating }: PairingDialogProps) {
  const t = useT("authenticator")
  const tTools = useT("tools")

  const [name, setName] = useState("")
  const [algorithm, setAlgorithm] = useState<(typeof ALGORITHMS)[number]>("SHA1")
  const [digits, setDigits] = useState("6")
  const [period, setPeriod] = useState("30")
  const [preview, setPreview] = useState<TotpPairingResponse | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [copyNotice, setCopyNotice] = useState(false)

  const reset = () => {
    setName("")
    setAlgorithm("SHA1")
    setDigits("6")
    setPeriod("30")
    setPreview(null)
    setRevealed(false)
    setError(null)
    setCopyNotice(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handlePreview = async () => {
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t("nameRequired"))
      return
    }
    setPreviewing(true)
    try {
      const result = await previewTotpPairing({
        name: trimmed,
        algorithm,
        digits: Number(digits),
        period: Number(period),
      })
      setPreview(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPreviewing(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview) return
    setError(null)
    try {
      await onConfirm({
        name: preview.name,
        secret: preview.secret,
        algorithm: preview.algorithm,
        digits: preview.digits,
        period: preview.period,
      })
      handleClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleCopySecret = async () => {
    if (!preview) return
    try {
      await navigator.clipboard.writeText(preview.secret)
      setCopyNotice(true)
      setTimeout(() => setCopyNotice(false), 2000)
    } catch {
      // Clipboard access can be refused by the platform; the secret stays
      // visible on screen for manual selection either way, so this is a
      // soft failure rather than one that blocks pairing.
      setError(t("copyFailed"))
    }
  }

  const actions = !preview ? (
    <>
      <Button variant="text" onClick={handleClose}>
        {t("cancelPairing")}
      </Button>
      <Button variant="filled" loading={previewing} onClick={handlePreview}>
        {t("previewPairing")}
      </Button>
    </>
  ) : (
    <>
      <Button variant="text" onClick={handleClose}>
        {t("cancelPairing")}
      </Button>
      <Button variant="filled" loading={creating} onClick={handleConfirm}>
        {t("confirmPairing")}
      </Button>
    </>
  )

  return (
    <Dialog open={open} onClose={handleClose} icon="lock" title={t("pairingDialogTitle")} size="md" actions={actions}>
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] leading-[1.5] text-on-surface-variant">
          <Txt ns="authenticator" k="pairingDialogIntro" channel="copy" />
        </p>

        {!preview ? (
          <div className="flex flex-col gap-3">
            <TextField
              value={name}
              onChange={setName}
              label={tTools("acctName")}
              placeholder={t("nameFieldPlaceholder")}
              disabled={previewing}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">{t("algorithmLabel")}</span>
              <SegmentedControl
                label={t("algorithmLabel")}
                value={algorithm}
                onChange={(v) => setAlgorithm(v as (typeof ALGORITHMS)[number])}
                options={ALGORITHMS.map((a) => ({ value: a, label: a }))}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="text-xs font-medium">{t("digitsLabel")}</span>
                <Select value={digits} onChange={setDigits} options={DIGIT_OPTIONS} ariaLabel={t("digitsLabel")} />
              </div>
              <TextField
                value={period}
                onChange={setPeriod}
                type="number"
                label={t("periodLabel")}
                className="flex-1"
                disabled={previewing}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <QrCode value={preview.uri} size={200} label={t("qrAltText")} />
            <p className="text-center text-[11px] text-on-surface-variant">
              <Txt ns="authenticator" k="secretHiddenNotice" channel="copy" />
            </p>
            {revealed ? (
              <div className="flex w-full flex-col items-center gap-2">
                <code className="rounded-lg bg-surface-high px-3 py-2 text-center font-mono text-sm tracking-wider select-all">
                  {fact(groupSecret(preview.secret), "user-input")}
                </code>
                <div className="flex gap-2">
                  <Button variant="text" size="sm" onClick={handleCopySecret}>
                    {copyNotice ? t("copiedSecret") : t("copySecret")}
                  </Button>
                  <Button variant="text" size="sm" onClick={() => setRevealed(false)}>
                    {t("hideSecret")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outlined" size="sm" icon="lock_open" onClick={() => setRevealed(true)}>
                {t("revealSecret")}
              </Button>
            )}
          </div>
        )}

        {error ? <p className="text-[11.5px] text-error">{fact(error, "user-input")}</p> : null}
      </div>
    </Dialog>
  )
}
