import { useEffect, useMemo, useState } from "react"
import { Button, SegmentedControl, Select, TextField } from "@/components/md3"
import { Txt, useT } from "@/uh"
import "./locks.dict"
import { AnchoredPanel } from "./AnchoredPanel"
import { localDataFolderPath } from "./localDataFolder"
import { generateTotpSecret } from "@/uh/locksCrypto"
import { createLock, type LockDurationChoice, type LockMethod } from "@/uh/locksStore"
import { recordHistory } from "@/uh/locksHistory"

export interface LockWizardProps {
  open: boolean
  anchorEl: HTMLElement | null
  onClose: () => void
  /** The stable id of the element being locked -- see `Lockable`. */
  elementId: string
  label: string
  onCreated: () => void
}

type DurationValue = "surface" | "minutes15" | "untilClose"

function durationChoiceFor(value: DurationValue): LockDurationChoice {
  if (value === "surface") return { kind: "surface" }
  if (value === "untilClose") return { kind: "untilClose" }
  return { kind: "minutes", minutes: 15 }
}

interface PresetDef {
  key: "presetQuickPassword" | "presetSessionTotp" | "presetTimedPassword"
  detailKey: "presetQuickPasswordDetail" | "presetSessionTotpDetail" | "presetTimedPasswordDetail"
  method: LockMethod
  duration: DurationValue
}

const PRESETS: readonly PresetDef[] = [
  { key: "presetQuickPassword", detailKey: "presetQuickPasswordDetail", method: "password", duration: "surface" },
  { key: "presetSessionTotp", detailKey: "presetSessionTotpDetail", method: "totp", duration: "untilClose" },
  { key: "presetTimedPassword", detailKey: "presetTimedPasswordDetail", method: "password", duration: "minutes15" },
]

/**
 * The anchored non-modal "Lock this element…" wizard. Opens beside the
 * exact element it targets (via `AnchoredPanel`'s live `anchorEl` rect),
 * offers the blank-slate presets contract's derived starting points, and
 * always creates an independent credential -- there is no code path here
 * that reads or reuses another lock's salt/hash/secret.
 */
export function LockWizard({ open, anchorEl, onClose, elementId, label, onCreated }: LockWizardProps) {
  const t = useT("locks")
  const [method, setMethod] = useState<LockMethod>("password")
  const [durationValue, setDurationValue] = useState<DurationValue>("surface")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [totpSecret, setTotpSecret] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) return
    // Reset only once the panel is fully closed, so a value never flashes
    // to blank while the closing transition (if any) is still visible.
    setMethod("password")
    setDurationValue("surface")
    setPassword("")
    setPasswordConfirm("")
    setTotpSecret("")
    setError(null)
    setSubmitting(false)
  }, [open])

  useEffect(() => {
    if (method === "totp" && !totpSecret) {
      setTotpSecret(generateTotpSecret())
    }
  }, [method, totpSecret])

  const durationOptions = useMemo(
    () => [
      { value: "surface", label: t("durationSurface") },
      { value: "minutes15", label: t("durationMinutes") },
      { value: "untilClose", label: t("durationUntilClose") },
    ],
    [t],
  )

  const methodOptions = useMemo(
    () => [
      { value: "password" as const, label: t("methodPassword") },
      { value: "totp" as const, label: t("methodTotp") },
    ],
    [t],
  )

  function applyPreset(preset: PresetDef) {
    setMethod(preset.method)
    setDurationValue(preset.duration)
    setError(null)
  }

  async function handleCreate() {
    setError(null)
    if (method === "password") {
      if (password.trim().length < 4) {
        setError(t("passwordTooShort"))
        return
      }
      if (password !== passwordConfirm) {
        setError(t("passwordMismatch"))
        return
      }
    }

    setSubmitting(true)
    try {
      const duration = durationChoiceFor(durationValue)
      await createLock({
        id: elementId,
        label,
        method,
        duration,
        password: method === "password" ? password : undefined,
        totpSecret: method === "totp" ? totpSecret : undefined,
      })
      recordHistory({ lockId: elementId, label, action: "created", detail: `method:${method} duration:${durationValue}` })
      onCreated()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnchoredPanel open={open} onClose={onClose} anchorEl={anchorEl} label={`${t("wizardTitleLock")} ${label}`}>
      <div className="flex items-center gap-1.5 text-[15px] font-semibold">
        <Txt ns="locks" k="wizardTitleLock" />
        <span aria-hidden="true">“</span>
        <Txt channel="fact" value={label} kind="tag" />
        <span aria-hidden="true">”</span>
      </div>

      <p className="text-[12px] leading-[1.5] text-on-surface-variant">
        <Txt ns="locks" k="toyDisclaimer" />
      </p>
      <p className="text-[11px] leading-[1.5] text-on-surface-variant">
        <Txt ns="locks" k="toyRecoveryNote" />{" "}
        <Txt channel="fact" value={localDataFolderPath()} kind="path" as="code" className="font-mono" />
      </p>

      <div className="flex flex-col gap-1.5 border-y border-outline-variant py-3">
        <div className="text-[11px] font-semibold text-on-surface-variant">
          <Txt ns="locks" k="presetsHeading" />
        </div>
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded-[10px] border border-outline-variant bg-surface-low px-2.5 py-2 text-left hover:bg-surface-high"
          >
            <div className="text-[12.5px] font-medium">
              <Txt ns="locks" k={preset.key} />
            </div>
            <div className="text-[11px] text-on-surface-variant">
              <Txt ns="locks" k={preset.detailKey} />
            </div>
          </button>
        ))}
      </div>

      <SegmentedControl
        label={t("methodLabel")}
        value={method}
        onChange={setMethod}
        options={methodOptions}
      />

      <Select
        ariaLabel={t("durationLabel")}
        value={durationValue}
        onChange={(value) => setDurationValue(value as DurationValue)}
        options={durationOptions}
      />

      {method === "password" ? (
        <>
          <TextField
            label={t("passwordLabel")}
            type="password"
            value={password}
            onChange={setPassword}
          />
          <TextField
            label={t("passwordConfirmLabel")}
            type="password"
            value={passwordConfirm}
            onChange={setPasswordConfirm}
          />
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium">
            <Txt ns="locks" k="totpSecretLabel" />
          </div>
          <div className="rounded-[10px] border border-outline-variant bg-surface-low px-3 py-2 font-mono text-[13px] break-all">
            <Txt channel="fact" value={totpSecret} kind="tag" />
          </div>
          <p className="text-[11px] text-on-surface-variant">
            <Txt ns="locks" k="totpSecretNote" />
          </p>
        </div>
      )}

      {error ? <p className="text-[12px] text-error">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="text" size="sm" onClick={onClose}>
          <Txt ns="locks" k="cancelButton" />
        </Button>
        <Button variant="filled" size="sm" onClick={handleCreate} loading={submitting}>
          <Txt ns="locks" k="createButton" />
        </Button>
      </div>
    </AnchoredPanel>
  )
}
