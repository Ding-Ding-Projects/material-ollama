import { useMemo, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Badge, SearchField, Surface } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import type { CommandCapability, CommandFlagCapability } from "@/lib/cli-config"
import { MODELS_ROUTE, isRoutedGuiRoute, useTextFilter } from "./lib"
import "./devtools.dict"

export interface CommandParityPanelProps {
  commands: CommandCapability[]
}

function commandHaystack(command: CommandCapability): string {
  return [command.id, command.name, command.use, command.description ?? "", ...(command.aliases ?? [])].join(" ")
}

/**
 * The CLI to GUI parity table: every command the live Cobra tree reports,
 * searchable in plain text or regex, with hidden commands carrying their
 * own distinct badge (included on purpose -- this is the surface that
 * exists specifically so a hidden command still has somewhere to live) and
 * each row's GUIRoute rendered as a real link when this build actually
 * routes there, or an honest non-interactive path label when it does not.
 */
export function CommandParityPanel({ commands }: CommandParityPanelProps) {
  const t = useT("devtools")
  const [query, setQuery] = useState("")
  const [regexMode, setRegexMode] = useState(false)
  const filter = useTextFilter(query, regexMode)

  const filtered = useMemo(
    () => commands.filter((command) => filter.test(commandHaystack(command))),
    [commands, filter],
  )
  const hiddenCount = useMemo(() => commands.filter((command) => command.hidden).length, [commands])

  return (
    <Surface tier="low" outlined radius="lg" className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
          <Icon name="terminal" size={19} className="text-primary" />
          {t("parityHeading")}
        </h2>
        <p className="max-w-2xl text-[12.5px] text-on-surface-variant">
          <Txt ns="devtools" k="parityIntro" channel="copy" />
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Badge variant="label" tone="neutral">
          <Txt channel="fact" value={commands.length} kind="count" /> {t("commandsCount")}
        </Badge>
        <Badge variant="label" tone="tertiary">
          <Icon name="lock" size={11} /> <Txt channel="fact" value={hiddenCount} kind="count" /> {t("hiddenCount")}
        </Badge>
      </div>

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={t("searchCommandsPlaceholder")}
        label={t("searchCommandsLabel")}
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
          <Txt ns="devtools" k="noCommandsMatch" channel="copy" />
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/60">
          {filtered.map((command) => (
            <CommandRow key={command.id} command={command} />
          ))}
        </ul>
      )}
    </Surface>
  )
}

function CommandRow({ command }: { command: CommandCapability }) {
  const t = useT("devtools")
  const routed = isRoutedGuiRoute(command.guiRoute)

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
          <Icon
            name="arrow_drop_down"
            size={18}
            className="mt-0.5 shrink-0 text-on-surface-variant transition-transform duration-150 group-open:rotate-180"
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <Txt
                channel="fact"
                value={command.use}
                kind="command"
                as="span"
                className="truncate font-mono text-[13px] font-medium text-on-surface"
              />
              {command.hidden ? (
                <Badge variant="label" tone="tertiary">
                  <Icon name="lock" size={11} /> {t("hiddenBadge")}
                </Badge>
              ) : null}
            </span>
            <span className="block truncate text-[11.5px] text-on-surface-variant">
              {command.description ? (
                <Txt channel="fact" value={command.description} kind="command" />
              ) : (
                <Txt ns="devtools" k="noDescription" channel="copy" />
              )}
            </span>
          </span>
          <span className="mt-0.5 shrink-0">
            {routed ? (
              <Link
                to={MODELS_ROUTE}
                onClick={(event) => event.stopPropagation()}
                title={t("openRoute")}
                className="inline-flex items-center gap-1 rounded-full border border-outline-variant px-2.5 py-1 font-mono text-[10.5px] text-primary hover:bg-surface-high"
              >
                <Icon name="open_in_new" size={12} />
                <Txt channel="fact" value={command.guiRoute} kind="path" />
              </Link>
            ) : (
              <span
                title={t("routeNotWired")}
                className="inline-flex items-center gap-1 rounded-full border border-outline-variant px-2.5 py-1 font-mono text-[10.5px] text-on-surface-variant"
              >
                <Txt channel="fact" value={command.guiRoute} kind="path" />
              </span>
            )}
          </span>
        </summary>
        <div className="mt-2.5 flex flex-col gap-2.5 pl-[26px]">
          {command.aliases && command.aliases.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-on-surface-variant">{t("aliasesLabel")}:</span>
              {command.aliases.map((alias) => (
                <Txt
                  key={alias}
                  channel="fact"
                  value={alias}
                  kind="command"
                  as="span"
                  className="rounded-full bg-surface-highest px-2 py-0.5 font-mono text-on-surface"
                />
              ))}
            </div>
          ) : null}
          {command.flags && command.flags.length > 0 ? (
            <FlagsList flags={command.flags} />
          ) : (
            <p className="text-[11px] text-on-surface-variant">
              <Txt ns="devtools" k="noFlags" channel="copy" />
            </p>
          )}
        </div>
      </details>
    </li>
  )
}

function FlagsList({ flags }: { flags: CommandFlagCapability[] }) {
  const t = useT("devtools")
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold tracking-wide text-on-surface-variant uppercase">
        {t("flagsLabel")}
      </span>
      <ul className="flex flex-col gap-1">
        {flags.map((flag) => (
          <li
            key={flag.name}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-token bg-surface-highest px-2.5 py-1.5 text-[11.5px]"
          >
            <Txt
              channel="fact"
              value={`--${flag.name}`}
              kind="command"
              as="span"
              className="font-mono font-medium text-on-surface"
            />
            {flag.shorthand ? (
              <Txt
                channel="fact"
                value={`-${flag.shorthand}`}
                kind="command"
                as="span"
                className="font-mono text-on-surface-variant"
              />
            ) : null}
            <Badge variant="label" tone="neutral">
              <Txt channel="fact" value={flag.type} kind="command" />
            </Badge>
            {flag.persistent ? (
              <Badge variant="label" tone="secondary">
                {t("persistentFlag")}
              </Badge>
            ) : null}
            {flag.usage ? (
              <span className="w-full text-on-surface-variant">
                <Txt channel="fact" value={flag.usage} kind="command" />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
