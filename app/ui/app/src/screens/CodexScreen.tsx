import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getCodexDiscovery,
  getCodexSessions,
  openCodexEditor,
  preflightCodex,
  startCodexSession,
  type CodexProfile,
} from "@/api"
import { Button, SegmentedControl, Surface, Switch, TextField } from "@/components/md3"
import { Icon, type SymbolName } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import "./codex/codex.dict"

/**
 * The Codex CLI harness, rebuilt against the checked-in design reference
 * (design/Material Ollama.dc.html, the "cli-harness" parity row).
 *
 * This replaces a pre-rewrite screen that used raw <button>, <input> and
 * <textarea> with hard-coded Tailwind palette colours -- no Material Design 3
 * primitives, no design tokens, no localization -- and that exposed a profile
 * editor, an environment-variable table and a timeout field the design does
 * not have. The design is the specification, so the surface is the design's:
 * one run card and one history card.
 *
 * Every value shown is real. The command preview comes from the server's own
 * preflight, the binary check from live discovery, the history from recorded
 * sessions. Nothing here is sample text borrowed from the design.
 */

type RunMode = "quick" | "full" | "dry"

/**
 * The argv each mode asks the server for. The design shows three modes and one
 * argv line; this is the mapping between them, kept in one place so the
 * preview and the run can never disagree about what will execute.
 */
const MODE_ARGUMENTS: Record<RunMode, string[]> = {
  quick: ["exec", "--sandbox", "workspace-write", "--ask-for-approval", "never"],
  full: ["exec", "--sandbox", "workspace-write"],
  dry: ["exec", "--sandbox", "read-only", "--ask-for-approval", "never"],
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  const icon: SymbolName = ok ? "check_circle" : "error"
  return (
    <li className="flex items-center gap-1.5">
      <Icon name={icon} size={16} className={ok ? "shrink-0 text-primary" : "shrink-0 text-error"} />
      <span className={ok ? "text-on-surface-variant" : "text-error"}>{label}</span>
    </li>
  )
}

export default function CodexScreen() {
  const t = useT("codex")
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<RunMode>("quick")
  const [workingDirectory, setWorkingDirectory] = useState("")
  const [prompt, setPrompt] = useState("")
  const [rollbackOnFailure, setRollbackOnFailure] = useState(true)

  const discovery = useQuery({ queryKey: ["codexDiscovery"], queryFn: () => getCodexDiscovery() })
  const sessions = useQuery({ queryKey: ["codexSessions"], queryFn: getCodexSessions })

  const profile = useMemo<CodexProfile>(
    () => ({
      name: "Codex harness",
      executable: discovery.data?.executable || "codex",
      arguments: MODE_ARGUMENTS[mode],
      workingDirectory,
      environment: [],
      timeoutSeconds: 600,
    }),
    [discovery.data?.executable, mode, workingDirectory],
  )

  // The preview is the server's, not ours. Rendering a locally assembled
  // command line would show the user something the run might not actually
  // execute, which is the one thing a preview must never do.
  const preflight = useQuery({
    queryKey: ["codexPreflight", profile.executable, mode, workingDirectory, prompt],
    queryFn: () => preflightCodex(profile, prompt),
    enabled: Boolean(discovery.data?.available),
  })

  const run = useMutation({
    mutationFn: () => startCodexSession(profile, prompt, rollbackOnFailure),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["codexSessions"] }),
  })

  const editor = useMutation({
    // The editor handoff is an integration target the user chooses, not a
    // dependency: "code" is the default and the path falls back to the
    // current directory when the field is empty.
    mutationFn: () => openCodexEditor("code", workingDirectory || "."),
  })

  const available = Boolean(discovery.data?.available)
  const version = discovery.data?.version
  const recorded = sessions.data ?? []

  return (
    <div
      className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-8"
      data-capture-id="cli-harness"
      data-capture-ready="true"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-on-surface">{t("title")}</h1>
        <p className="max-w-2xl text-[13px] text-on-surface-variant">
          <Txt ns="codex" k="subtitle" channel="copy" />
        </p>
      </header>

      <Surface tier="lowest" outlined radius="token" className="flex flex-col gap-4 p-5">
        <SegmentedControl<RunMode>
          options={[
            { value: "quick", label: t("modeQuickFix") },
            { value: "full", label: t("modeFullRun") },
            { value: "dry", label: t("modeDryRun") },
          ]}
          value={mode}
          onChange={setMode}
          label={t("modeLegend")}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            value={workingDirectory}
            onChange={setWorkingDirectory}
            label={t("workingDirectory")}
            placeholder={t("workingDirectoryPlaceholder")}
            mono
          />
          <TextField
            value={prompt}
            onChange={setPrompt}
            label={t("prompt")}
            placeholder={t("promptPlaceholder")}
          />
        </div>

        <Surface
          tier="low"
          radius="token"
          className="px-4 py-3 font-mono text-[12.5px] text-on-surface-variant"
        >
          {preflight.data?.commandPreview ? (
            <Txt channel="fact" value={"$ " + preflight.data.commandPreview} kind="command" />
          ) : (
            t("commandPreviewPending")
          )}
        </Surface>

        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
          <CheckRow
            ok={available}
            label={
              available
                ? t("checkBinaryFound") + (version ? " (v" + version + ")" : "")
                : t("checkBinaryMissing")
            }
          />
          <CheckRow
            ok={Boolean(preflight.data)}
            label={preflight.data ? t("checkSandbox") : t("checkSandboxUnknown")}
          />
          <CheckRow
            ok
            label={preflight.data?.workingDirectory || t("checkDirectory")}
          />
          <CheckRow
            ok={rollbackOnFailure}
            label={rollbackOnFailure ? t("checkRollback") : t("checkRollbackOff")}
          />
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="filled"
            icon="play_arrow"
            disabled={!available || run.isPending}
            loading={run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? t("running") : t("run")}
          </Button>
          <Button variant="outlined" icon="open_in_new" onClick={() => editor.mutate()}>
            {t("openEditor")}
          </Button>
          <Switch
            checked={rollbackOnFailure}
            onChange={setRollbackOnFailure}
            label={t("rollbackOnFailure")}
            className="ml-auto"
          />
        </div>

        {discovery.error ? <p className="text-[12.5px] text-error">{t("discoveryFailed")}</p> : null}
        {run.error ? <p className="text-[12.5px] text-error">{t("runFailed")}</p> : null}
      </Surface>

      <Surface tier="lowest" outlined radius="token" className="flex flex-col gap-2 p-5">
        <h2 className="text-[15px] font-semibold text-on-surface">{t("historyTitle")}</h2>
        <p className="text-[12.5px] text-on-surface-variant">
          <Txt ns="codex" k="historyNote" channel="copy" />
        </p>
        {recorded.length === 0 ? (
          <p className="text-[13px] text-on-surface-variant">{t("historyEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-[12.5px] text-on-surface-variant">
            {recorded.slice(0, 12).map((session) => (
              <li key={session.id} className="flex items-center gap-2">
                <Icon name="terminal" size={14} className="shrink-0" />
                <Txt channel="fact" value={session.id} kind="command" />
                <span>{session.state}</span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  )
}
