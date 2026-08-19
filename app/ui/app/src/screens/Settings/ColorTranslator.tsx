import { useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react"
import { Badge, Button, Surface, TextField } from "@/components/md3"
import { hexToOklch } from "@/theme/oklch"
import { fact, useT } from "@/uh"
import {
  BLACK,
  WHITE,
  contrastRatio,
  hexToRgb,
  hslToRgb,
  hsvToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  type Rgb,
} from "./colorMath"
import "./settingsUi.dict"

export interface ColorTranslatorProps {
  /** The colour currently being edited, as "#rrggbb". */
  value: string
  onChange: (hex: string) => void
  /** "Use as seed colour" — omit to hide the action (e.g. this translator
   * is being used for something other than picking the app's seed). */
  onUseAsSeed?: () => void
  className?: string
}

type ActiveSpace = "hex" | "rgb" | "hsl"

function formatOklch(hex: string): string {
  const { L, c, h } = hexToOklch(hex)
  return `oklch(${L.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * The infinite colour picker: a continuous saturation/value field plus a
 * hue strip (drag-operable and keyboard-operable), synced bidirectionally
 * with numeric hex/RGB/HSL entry and a read-only OKLCH readout (via
 * `@/theme/oklch`'s already-shipped `hexToOklch` — reused, not
 * reimplemented, per the brief). Never a swatch-only chooser: every
 * pixel of the field and every degree of hue is reachable.
 */
export function ColorTranslator({ value, onChange, onUseAsSeed, className }: ColorTranslatorProps) {
  const t = useT("settingsUi")
  const fieldRef = useRef<HTMLDivElement>(null)
  const [activeSpace, setActiveSpace] = useState<ActiveSpace>("hex")
  const [hexDraft, setHexDraft] = useState(value)

  const rgb = useMemo<Rgb>(() => hexToRgb(value) ?? { r: 0, g: 0, b: 0 }, [value])
  const hsl = useMemo(() => rgbToHsl(rgb), [rgb])
  const hsv = useMemo(() => rgbToHsv(rgb), [rgb])

  useEffect(() => {
    setHexDraft(value)
  }, [value])

  const commitRgb = (next: Rgb) => onChange(rgbToHex(next))

  const handleFieldPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const field = fieldRef.current
    if (!field) return
    // Optional-chained: jsdom (this lane's DOM test environment) doesn't
    // implement pointer capture at all — guard rather than crash a test
    // that happens to fire a pointerdown on this field.
    field.setPointerCapture?.(event.pointerId)
    const move = (clientX: number, clientY: number) => {
      const rect = field.getBoundingClientRect()
      const x = clamp((clientX - rect.left) / rect.width, 0, 1)
      const y = clamp((clientY - rect.top) / rect.height, 0, 1)
      commitRgb(hsvToRgb({ h: hsv.h, s: x * 100, v: (1 - y) * 100 }))
    }
    move(event.clientX, event.clientY)
    const onMove = (moveEvent: PointerEvent) => move(moveEvent.clientX, moveEvent.clientY)
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  const nudgeField = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2
    let ds = 0
    let dv = 0
    if (event.key === "ArrowRight") ds = step
    else if (event.key === "ArrowLeft") ds = -step
    else if (event.key === "ArrowUp") dv = step
    else if (event.key === "ArrowDown") dv = -step
    else return
    event.preventDefault()
    commitRgb(hsvToRgb({ h: hsv.h, s: clamp(hsv.s + ds, 0, 100), v: clamp(hsv.v + dv, 0, 100) }))
  }

  const contrastWhite = contrastRatio(rgb, WHITE)
  const contrastBlack = contrastRatio(rgb, BLACK)

  const fieldBackground = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${rgbToHex(
    hsvToRgb({ h: hsv.h, s: 100, v: 100 }),
  )})`

  return (
    <Surface tier="high" radius="lg" className={`flex flex-col gap-4 p-4 ${className ?? ""}`}>
      <div>
        <h3 className="text-[13px] font-semibold text-on-surface">{t("colorTranslatorTitle")}</h3>
        <p className="mt-0.5 text-[11.5px] text-on-surface-variant">{t("colorTranslatorExplain")}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div
          ref={fieldRef}
          role="slider"
          tabIndex={0}
          aria-label={t("fieldLabel")}
          aria-valuetext={fact(`S ${Math.round(hsv.s)}% V ${Math.round(hsv.v)}%`, "user-input")}
          onPointerDown={handleFieldPointer}
          onKeyDown={nudgeField}
          className="relative h-[160px] w-full shrink-0 cursor-crosshair rounded-[10px] outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--p)] sm:w-[200px]"
          style={{ background: fieldBackground }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{ left: `${hsv.s}%`, bottom: `${hsv.v}%` }}
          />
        </div>

        <div className="flex flex-1 flex-col justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-9 w-9 shrink-0 rounded-full border border-outline-variant"
              style={{ backgroundColor: value }}
            />
            <div className="min-w-0 flex-1">
              <label className="text-[11px] font-medium text-on-surface-variant" htmlFor="color-translator-hue">
                {t("hueLabel")}
              </label>
              <input
                id="color-translator-hue"
                type="range"
                min={0}
                max={360}
                step={1}
                value={hsv.h}
                onChange={(event) => commitRgb(hsvToRgb({ h: Number(event.target.value), s: hsv.s, v: hsv.v }))}
                className="h-2.5 w-full cursor-pointer appearance-none rounded-full"
                style={{
                  background:
                    "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 text-[11px]">
            <span className="font-medium text-on-surface-variant">{t("contrastLabel")}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-on-surface-variant">{t("contrastVsWhite")}</span>
              <Badge variant="label" tone={contrastWhite >= 4.5 ? "tertiary" : "error"}>
                {fact(`${contrastWhite.toFixed(2)}:1`, "count")} — {contrastWhite >= 4.5 ? t("contrastPass") : t("contrastFail")}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-on-surface-variant">{t("contrastVsBlack")}</span>
              <Badge variant="label" tone={contrastBlack >= 4.5 ? "tertiary" : "error"}>
                {fact(`${contrastBlack.toFixed(2)}:1`, "count")} — {contrastBlack >= 4.5 ? t("contrastPass") : t("contrastFail")}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <TextField
            value={activeSpace === "hex" ? hexDraft : value}
            onChange={(next) => {
              setActiveSpace("hex")
              setHexDraft(next)
              const normalized = normalizeHex(next)
              if (normalized) onChange(normalized)
            }}
            mono
            label={t("hexFieldLabel")}
            error={activeSpace === "hex" && !normalizeHex(hexDraft) ? t("seedHexInvalid") : undefined}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-on-surface-variant">{t("rgbFieldLabel")}</span>
          <div className="flex gap-1.5">
            {(["r", "g", "b"] as const).map((channel) => (
              <TextField
                key={channel}
                value={String(rgb[channel])}
                onChange={(next) => {
                  setActiveSpace("rgb")
                  const parsed = clamp(Number(next) || 0, 0, 255)
                  commitRgb({ ...rgb, [channel]: parsed })
                }}
                type="number"
                mono
                label={t(`${channel}Channel` as "rChannel" | "gChannel" | "bChannel")}
                className="min-w-0 flex-1"
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-on-surface-variant">{t("hslFieldLabel")}</span>
          <div className="flex gap-1.5">
            <TextField
              value={String(Math.round(hsl.h))}
              onChange={(next) => {
                setActiveSpace("hsl")
                commitRgb(hslToRgb({ ...hsl, h: clamp(Number(next) || 0, 0, 360) }))
              }}
              type="number"
              mono
              label={t("hChannel")}
              className="min-w-0 flex-1"
            />
            <TextField
              value={String(Math.round(hsl.s))}
              onChange={(next) => {
                setActiveSpace("hsl")
                commitRgb(hslToRgb({ ...hsl, s: clamp(Number(next) || 0, 0, 100) }))
              }}
              type="number"
              mono
              label={t("sChannel")}
              className="min-w-0 flex-1"
            />
            <TextField
              value={String(Math.round(hsl.l))}
              onChange={(next) => {
                setActiveSpace("hsl")
                commitRgb(hslToRgb({ ...hsl, l: clamp(Number(next) || 0, 0, 100) }))
              }}
              type="number"
              mono
              label={t("lChannel")}
              className="min-w-0 flex-1"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-on-surface-variant">
        <span>
          {t("oklchFieldLabel")}: <span className="font-mono text-on-surface">{fact(formatOklch(value), "user-input")}</span>
        </span>
        <span>
          {t("activeSpaceLabel")}: <span className="font-mono text-on-surface">{fact(activeSpace.toUpperCase(), "user-input")}</span>
        </span>
      </div>

      {onUseAsSeed ? (
        <div className="flex justify-end">
          <Button variant="tonal" size="sm" icon="palette" onClick={onUseAsSeed}>
            {t("useAsSeedBtn")}
          </Button>
        </div>
      ) : null}
    </Surface>
  )
}
