import { useState } from "react"
import { Chip, ConfirmDialog, IconButton, Surface } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, fact, useT } from "@/uh"
import { FitBadge } from "./FitBadge"
import { formatBytes2, formatTimestamp, shortDigest } from "./format"
import type { InstalledModel, RunningModel } from "./types"
import "./modelsUi.dict"

export interface ModelCardProps {
  model: InstalledModel
  /** Present when this exact model is currently loaded (GET
   * /api/v1/models/running) — the running-specific stats (VRAM in use,
   * context window, unload time) render only when this is set. */
  running?: RunningModel
  removing: boolean
  onRemove: (name: string) => void
}

export function ModelCard({ model, running, removing, onRemove }: ModelCardProps) {
  const t = useT("modelsUi")
  const [confirmOpen, setConfirmOpen] = useState(false)

  const details = model.details
  const metaBits = [details?.parameter_size, details?.quantization_level, details?.family].filter(Boolean)

  return (
    <Surface tier="lowest" outlined radius="token" className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] font-semibold" title={model.model}>
          {fact(model.name || model.model, "model-name")}
        </span>
        <FitBadge fit={model.fit} modelLabel={model.model} />
      </div>

      {metaBits.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {metaBits.map((bit) => (
            <span
              key={bit}
              className="rounded-full bg-surface-high px-2.5 py-0.5 font-mono text-[10.5px] text-on-surface-variant"
            >
              {fact(bit as string, "tag")}
            </span>
          ))}
        </div>
      ) : null}

      {model.capabilities?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {model.capabilities.map((cap) => (
            <Chip key={cap} as="span" tone="secondary" className="!px-2.5 !py-0.5 !text-[10.5px]">
              {fact(cap, "tag")}
            </Chip>
          ))}
        </div>
      ) : null}

      {running ? (
        <div className="flex flex-col gap-0.5 rounded-lg bg-tertiary-container px-2.5 py-2 text-[11px]">
          <div className="flex items-center gap-1.5 font-semibold text-on-tertiary-container">
            <Icon name="bolt" size={13} />
            <Txt ns="modelsUi" k="runningBadge" />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-on-surface-variant">
            <span>
              {t("vramInUse")}: {fact(formatBytes2(running.size_vram), "bytes")}
            </span>
            <span>
              {t("contextWindow")}: {fact(running.context_length, "count")}
            </span>
            <span>
              {t("expiresAt")}: {fact(formatTimestamp(running.expires_at), "timestamp")}
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-2 pt-1 text-[11px] text-outline">
        <span className="font-mono">{fact(formatBytes2(model.size), "bytes")}</span>
        <span title={model.digest}>{fact(shortDigest(model.digest), "digest")}</span>
        <span className="flex-1 truncate text-right">{fact(formatTimestamp(model.modified_at), "timestamp")}</span>
        <IconButton
          icon="delete"
          label={fact(`${t("removeModel")} — ${model.model}`, "user-input")}
          size="sm"
          danger
          disabled={removing}
          onClick={() => setConfirmOpen(true)}
        />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("removeModelTitle")}
        body={`${t("removeModelBodyIntro")} ${model.model}. ${t("removeModelBodyWarning")}`}
        keyword="REMOVE"
        actionLabel={t("removeModel")}
        onConfirm={() => onRemove(model.model)}
      />
    </Surface>
  )
}
