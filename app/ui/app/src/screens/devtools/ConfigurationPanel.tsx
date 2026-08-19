import { useMemo, useState } from "react"
import { Badge, SearchField, Surface } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import type { ConfigurationOption } from "@/lib/cli-config"
import { SOURCE_DICT_KEY, SOURCE_TONE, useTextFilter } from "./lib"
import "./devtools.dict"

export interface ConfigurationPanelProps {
  configuration: ConfigurationOption[]
}

function optionHaystack(option: ConfigurationOption): string {
  return `${option.name} ${option.description ?? ""}`
}

/**
 * The provenance panel: every configuration option the running service
 * knows about, and exactly where its current value came from -- the
 * process environment, this app's own config-profile layer, both, or
 * Ollama's compiled-in default. Read-only by design: changing a value
 * happens through a named profile in ConfigProfilesPanel, never here.
 */
export function ConfigurationPanel({ configuration }: ConfigurationPanelProps) {
  const t = useT("devtools")
  const [query, setQuery] = useState("")
  const [regexMode, setRegexMode] = useState(false)
  const filter = useTextFilter(query, regexMode)

  const filtered = useMemo(
    () => configuration.filter((option) => filter.test(optionHaystack(option))),
    [configuration, filter],
  )

  return (
    <Surface tier="low" outlined radius="lg" className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
          <Icon name="dictionary" size={19} className="text-primary" />
          {t("configHeading")}
        </h2>
        <p className="max-w-2xl text-[12.5px] text-on-surface-variant">
          <Txt ns="devtools" k="configIntro" channel="copy" />
        </p>
      </div>

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={t("searchConfigPlaceholder")}
        label={t("searchConfigLabel")}
        regex={regexMode}
        onToggleRegex={() => setRegexMode((current) => !current)}
      />
      {filter.error ? (
        <p className="text-[11px] text-error">
          <Txt ns="devtools" k="invalidPattern" channel="copy" />
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-on-surface-variant">
          <Txt ns="devtools" k="noConfigMatch" channel="copy" />
        </p>
      ) : (
        <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
          {filtered.map((option) => (
            <ConfigurationRow key={option.name} option={option} />
          ))}
        </ul>
      )}
    </Surface>
  )
}

export function ConfigurationRow({ option }: { option: ConfigurationOption }) {
  const t = useT("devtools")
  return (
    <li className="flex flex-col gap-1.5 rounded-token border border-outline-variant bg-surface-lowest px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Txt
          channel="fact"
          value={option.name}
          kind="command"
          as="span"
          className="font-mono text-[12.5px] font-semibold text-on-surface"
        />
        <Badge variant="label" tone="neutral">
          <Txt channel="fact" value={option.type} kind="command" />
        </Badge>
        <Badge variant="label" tone={SOURCE_TONE[option.source]}>
          {t(SOURCE_DICT_KEY[option.source])}
        </Badge>
        {option.restartRequired ? (
          <Badge variant="label" tone="error">
            <Icon name="restart_alt" size={11} /> {t("restartBadge")}
          </Badge>
        ) : null}
      </div>
      {option.description ? (
        <p className="text-[11.5px] text-on-surface-variant">
          <Txt channel="fact" value={option.description} kind="command" />
        </p>
      ) : null}
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-on-surface-variant">{t("effectiveValueLabel")}:</span>
        {option.effectiveValue ? (
          <Txt
            channel="fact"
            value={option.effectiveValue}
            kind="command"
            as="span"
            className="truncate font-mono text-on-surface"
          />
        ) : (
          <Txt ns="devtools" k="emptyValue" channel="label" as="span" className="italic text-on-surface-variant" />
        )}
      </div>
    </li>
  )
}
