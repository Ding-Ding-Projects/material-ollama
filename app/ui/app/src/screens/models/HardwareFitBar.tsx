import { Badge, Surface } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, fact, useT } from "@/uh"
import type { ByteValue, Confidence, HardwareResponse } from "./types"
import "./modelsUi.dict"

const CONFIDENCE_TONE = {
  measured: "tertiary",
  parsed: "secondary",
  assumed: "neutral",
  unknown: "error",
} as const satisfies Record<Confidence, "tertiary" | "secondary" | "neutral" | "error">

const CONFIDENCE_KEY = {
  measured: "measured",
  parsed: "parsed",
  assumed: "assumed",
  unknown: "unknownValue",
} as const satisfies Record<Confidence, string>

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <Badge tone={CONFIDENCE_TONE[confidence]} variant="label">
      <Txt ns="modelsUi" k={CONFIDENCE_KEY[confidence]} />
    </Badge>
  )
}

/** A single labeled fact: a value straight from the server plus the
 * confidence badge that says how it was obtained — never a bare number
 * with no provenance, per the brief. `value` is `undefined` for "unknown",
 * which renders the explicit Unknown state rather than a hidden 0. */
function Stat({ labelKey, value }: { labelKey: "ram" | "vram" | "storage"; value: ByteValue | undefined }) {
  const t = useT("modelsUi")
  return (
    <div className="flex min-w-[150px] flex-col gap-0.5">
      <span className="text-[11px] font-medium text-on-surface-variant">
        <Txt ns="modelsUi" k={labelKey} />
      </span>
      {value ? (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[13px]">{fact(value.display, "bytes")}</span>
          <ConfidenceBadge confidence={value.confidence} />
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] text-on-surface-variant">
            <Txt ns="modelsUi" k="unknownValue" />
          </span>
        </div>
      )}
      {value ? (
        <span className="text-[10.5px] text-outline" title={fact(value.source, "path")}>
          {fact(value.source, "path")}
        </span>
      ) : (
        <span className="text-[10.5px] text-outline">{t("devicesUnknown")}</span>
      )}
    </div>
  )
}

export interface HardwareFitBarProps {
  hardware: HardwareResponse | undefined
  isLoading: boolean
}

/**
 * The real hardware snapshot from GET /api/v1/hardware, rendered honestly:
 * every value carries its Source/Confidence label, an empty Devices array
 * reads as "not detected yet" rather than "no GPU", and any degraded
 * sub-probe (server.GetInferenceInfo timing out, a free-disk syscall
 * failing) shows up as a real warning line instead of being swallowed.
 */
export function HardwareFitBar({ hardware, isLoading }: HardwareFitBarProps) {
  const t = useT("modelsUi")

  if (!hardware) {
    return (
      <Surface tier="lowest" outlined radius="token" className="flex items-center gap-3 p-4">
        <Icon name="memory" size={20} className="shrink-0 text-on-surface-variant" />
        <span className="text-[13px] text-on-surface-variant">
          {isLoading ? t("unknownValue") : t("devicesUnknown")}
        </span>
      </Surface>
    )
  }

  const overrideEntries: Array<[string, string]> = []
  if (hardware.overrides.models) overrideEntries.push(["OLLAMA_MODELS", hardware.overrides.models])
  if (hardware.overrides.cudaVisibleDevices)
    overrideEntries.push(["CUDA_VISIBLE_DEVICES", hardware.overrides.cudaVisibleDevices])
  if (hardware.overrides.hipVisibleDevices)
    overrideEntries.push(["HIP_VISIBLE_DEVICES", hardware.overrides.hipVisibleDevices])
  if (hardware.overrides.rocrVisibleDevices)
    overrideEntries.push(["ROCR_VISIBLE_DEVICES", hardware.overrides.rocrVisibleDevices])
  if (hardware.overrides.vkVisibleDevices)
    overrideEntries.push(["VK_VISIBLE_DEVICES", hardware.overrides.vkVisibleDevices])

  return (
    <Surface tier="lowest" outlined radius="token" className="flex flex-col gap-3.5 p-4">
      <div className="flex items-center gap-2">
        <Icon name="memory" size={20} className="shrink-0 text-on-surface-variant" />
        <span className="text-[13px] font-semibold">
          <Txt ns="models" k="hardwareFit" />
        </span>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat labelKey="ram" value={hardware.systemRam} />
        {hardware.devices.length === 0 ? (
          <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
            <span className="text-[11px] font-medium text-on-surface-variant">
              <Txt ns="modelsUi" k="vram" />
            </span>
            <div className="flex items-start gap-1.5">
              <Icon name="warning" size={14} className="mt-0.5 shrink-0 text-on-surface-variant" />
              <span className="text-[12px] leading-[1.5] text-on-surface-variant">{t("devicesUnknown")}</span>
            </div>
          </div>
        ) : (
          hardware.devices.map((device) => (
            <div key={device.id} className="flex min-w-[150px] flex-col gap-0.5">
              <span className="truncate text-[11px] font-medium text-on-surface-variant" title={device.name}>
                {fact(device.name, "path")}
              </span>
              {device.totalVram ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[13px]">{fact(device.totalVram.display, "bytes")}</span>
                  <ConfidenceBadge confidence={device.totalVram.confidence} />
                </div>
              ) : (
                <span className="text-[13px] text-on-surface-variant">
                  <Txt ns="modelsUi" k="unknownValue" />
                </span>
              )}
              <span className="text-[10.5px] text-outline">
                {fact(`${device.library} · ${device.compute}`, "path")}
              </span>
            </div>
          ))
        )}
        <Stat labelKey="storage" value={hardware.storage.free} />
        <div className="flex min-w-[190px] flex-col gap-0.5">
          <span className="text-[11px] font-medium text-on-surface-variant">
            <Txt ns="modelsUi" k="contextLength" />
          </span>
          <span className="font-mono text-[13px]">{fact(hardware.effective.contextLength, "count")}</span>
          <span className="text-[10.5px] text-outline">
            {hardware.effective.contextLengthSource === "override" ? t("contextOverride") : t("contextAssumed")}
          </span>
        </div>
      </div>

      {overrideEntries.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-outline-variant pt-2.5">
          {overrideEntries.map(([key, value]) => (
            <span
              key={key}
              className="rounded-full bg-surface-high px-2.5 py-1 font-mono text-[10.5px] text-on-surface-variant"
            >
              {fact(`${key}=${value}`, "path")}
            </span>
          ))}
        </div>
      ) : null}

      {hardware.warnings?.length ? (
        <div className="flex flex-col gap-1 border-t border-outline-variant pt-2.5">
          <span className="text-[11px] font-medium text-on-surface-variant">
            <Txt ns="modelsUi" k="hardwareWarnings" />
          </span>
          {hardware.warnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <Icon name="warning" size={13} className="mt-0.5 shrink-0 text-on-surface-variant" />
              <span className="text-[11.5px] leading-[1.5] text-on-surface-variant">
                {fact(warning, "user-input")}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Surface>
  )
}
