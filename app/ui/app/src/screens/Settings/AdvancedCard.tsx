import { useId, useState } from "react"
import { Badge, Button, IconButton, Select, Surface } from "@/components/md3"
import { fact, useT, type TFunction } from "@/uh"
import { SettingRow } from "./SettingRow"
import type { ScheduleRule, UIPreferences } from "./types"
import "./settingsUi.dict"

function scheduleProvenance(t: TFunction<"settingsUi">, count: number) {
  const prefix = count === 0 ? t("provenanceDefault") : t("provenanceStored")
  return fact(`${prefix} ${count}`, "count")
}

export interface AdvancedCardProps {
  preferences: UIPreferences
  patchPreferences: (partial: Partial<UIPreferences>) => void
  preferencesLoading: boolean
}

const SCHEDULE_KIND_KEY = {
  dark: "scheduleKindDark",
  light: "scheduleKindLight",
  schoolOn: "scheduleKindSchoolOn",
} as const

type ScheduleKind = keyof typeof SCHEDULE_KIND_KEY

/**
 * Scheduled settings (native `<input type="time">` plus an action picker,
 * persisted through the real Schedules field) and a read-only view of the
 * configured Ollama-compatible endpoints already tracked in preferences.
 */
export function AdvancedCard({ preferences, patchPreferences, preferencesLoading }: AdvancedCardProps) {
  const t = useT("settingsUi")
  const timeInputId = useId()
  const [draftTime, setDraftTime] = useState("18:00")
  const [draftKind, setDraftKind] = useState<ScheduleKind>("dark")

  const schedules = preferences.schedules ?? []
  // A nil Go slice marshals to JSON null, not [], so every array arriving from
  // the preferences endpoint has to be guarded here. Reading .length off the
  // raw value is what crashed the whole Settings route into the router error
  // boundary with "Cannot read properties of null".
  const endpoints = preferences.endpoints?.endpoints ?? []

  const addRule = () => {
    if (!draftTime) return
    const next: ScheduleRule = { time: draftTime, kind: draftKind }
    patchPreferences({ schedules: [...schedules, next] })
  }

  const removeRule = (index: number) => {
    patchPreferences({ schedules: schedules.filter((_, i) => i !== index) })
  }

  const disabledReason = preferencesLoading ? t("savingNow") : undefined

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-5 p-5">
      <header>
        <h2 className="text-base font-semibold text-on-surface">{t("advancedTitle")}</h2>
        <p className="text-[12.5px] text-on-surface-variant">{t("advancedSub")}</p>
      </header>

      <SettingRow
        icon="schedule"
        title={t("scheduleLabel")}
        explanation={t("scheduleExplain")}
        provenance={scheduleProvenance(t, schedules.length)}
        disabledReason={disabledReason}
      >
        <div className="flex flex-col gap-3">
          {schedules.length === 0 ? (
            <p className="text-[12px] text-on-surface-variant">{t("scheduleEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {schedules.map((rule, index) => (
                <li
                  key={`${rule.time}-${rule.kind}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-[10px] border border-outline-variant bg-surface-low px-3 py-2"
                >
                  <span className="text-[12.5px]">
                    {t("scheduleRuleFact")}{" "}
                    <span className="font-mono">{fact(rule.time, "timestamp")}</span> —{" "}
                    {t(
                      (SCHEDULE_KIND_KEY[rule.kind as ScheduleKind] ?? "scheduleKindDark") as
                        | "scheduleKindDark"
                        | "scheduleKindLight"
                        | "scheduleKindSchoolOn",
                    )}
                  </span>
                  <IconButton
                    icon="delete"
                    size="sm"
                    danger
                    label={fact(`${t("scheduleRemoveBtn")} — ${rule.time}`, "user-input")}
                    onClick={() => removeRule(index)}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={timeInputId} className="text-xs font-medium">
                {t("scheduleTimeLabel")}
              </label>
              <input
                id={timeInputId}
                type="time"
                value={draftTime}
                onChange={(event) => setDraftTime(event.target.value)}
                className="rounded-[10px] border border-outline-variant bg-surface-low px-3 py-2 text-[12.5px] outline-none"
              />
            </div>
            <Select
              value={draftKind}
              onChange={(value) => setDraftKind(value as ScheduleKind)}
              ariaLabel={t("scheduleKindLabel")}
              options={[
                { value: "dark", label: t("scheduleKindDark") },
                { value: "light", label: t("scheduleKindLight") },
                { value: "schoolOn", label: t("scheduleKindSchoolOn") },
              ]}
            />
            <Button variant="tonal" size="sm" icon="bolt" onClick={addRule} disabled={!draftTime}>
              {t("scheduleAddBtn")}
            </Button>
          </div>
        </div>
      </SettingRow>

      <SettingRow icon="cloud" title={t("endpointsLabel")} explanation={t("endpointsExplain")}>
        {endpoints.length === 0 ? (
          <p className="text-[12px] text-on-surface-variant">{t("endpointsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {endpoints.map((endpoint) => (
              <li
                key={endpoint.id}
                className="flex items-center justify-between gap-2 rounded-[10px] border border-outline-variant bg-surface-low px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-[12.5px] font-medium">{fact(endpoint.label || endpoint.id, "user-input")}</span>
                  <span className="font-mono text-[11px] text-on-surface-variant">
                    {fact(endpoint.baseUrl, "path")}
                  </span>
                </div>
                {endpoint.id === preferences.endpoints?.activeId ? (
                  <Badge variant="label" tone="tertiary">
                    {t("endpointActiveFact")}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingRow>
    </Surface>
  )
}
