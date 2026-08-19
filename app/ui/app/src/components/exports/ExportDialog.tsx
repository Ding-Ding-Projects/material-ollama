import { useEffect, useState } from "react"
import { Button, Dialog, Select } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import "./exports.dict"
import { ExportPreview } from "./ExportPreview"
import type { ExportColumn, ExportFormatId } from "./exportFormats"
import { copyPathToClipboard, openInExternalEditor, type OpenInEditorOutcome } from "./openInEditor"
import { useExport } from "./useExport"

export interface ExportDialogProps<T> {
  readonly open: boolean
  readonly onClose: () => void
  readonly rows: readonly T[]
  readonly columns: readonly ExportColumn<T>[]
  readonly suggestedName: string
  readonly initialFormat?: ExportFormatId
}

type EditorHandoffState =
  | { readonly kind: "idle" }
  | { readonly kind: "opening" }
  | { readonly kind: "result"; readonly outcome: OpenInEditorOutcome }
  | { readonly kind: "copied" }
  | { readonly kind: "copy-failed" }

/**
 * The full export flow: pick a format, see exactly what it will and won't
 * carry, preview it (rendered for Markdown/HTML, labeled monospace for
 * everything else), save it as a real file, then optionally hand the
 * saved file off to VS Code -- honestly, per openInEditor.ts's contract.
 */
export function ExportDialog<T>({
  open,
  onClose,
  rows,
  columns,
  suggestedName,
  initialFormat,
}: ExportDialogProps<T>) {
  const t = useT("exports")
  const tApp = useT("app")
  const { formats, formatId, setFormatId, result, save } = useExport({
    rows,
    columns,
    suggestedName,
    initialFormat,
  })
  const [savedFilename, setSavedFilename] = useState<string | null>(null)
  const [editorState, setEditorState] = useState<EditorHandoffState>({ kind: "idle" })

  // A fresh save (or switching format/reopening) invalidates any earlier
  // "opened in VS Code"/"copied" state -- it described the PREVIOUS file.
  useEffect(() => {
    setSavedFilename(null)
    setEditorState({ kind: "idle" })
  }, [formatId, open])

  const handleSave = () => {
    const outcome = save()
    if (outcome.saved) {
      setSavedFilename(outcome.filename)
      setEditorState({ kind: "idle" })
    }
  }

  const handleOpenInEditor = async () => {
    if (!savedFilename) return
    setEditorState({ kind: "opening" })
    const outcome = await openInExternalEditor({ path: savedFilename, kind: "file" })
    setEditorState({ kind: "result", outcome })
  }

  const handleCopyPath = async () => {
    if (!savedFilename) return
    const ok = await copyPathToClipboard(savedFilename)
    setEditorState(ok ? { kind: "copied" } : { kind: "copy-failed" })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      icon="download"
      title={t("title")}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {tApp("cancel")}
          </Button>
          <Button variant="filled" icon="download" onClick={handleSave} disabled={rows.length === 0}>
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-on-surface-variant">
          <Txt ns="exports" k="subtitle" channel="copy" />
        </p>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tracking-wide text-on-surface-variant uppercase">
            <Txt ns="exports" k="formatLabel" channel="label" />
          </span>
          <Select
            value={formatId}
            onChange={(value) => setFormatId(value as ExportFormatId)}
            options={formats.map((format) => ({ value: format.id, label: format.label }))}
            ariaLabel={t("formatLabel")}
          />
        </div>

        <CaveatsPanel caveats={result.caveats} />

        <ExportPreview result={result} />

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px] text-on-surface-variant">
          <dt className="font-semibold">
            <Txt ns="exports" k="encodingLabel" channel="label" />
          </dt>
          {/* "UTF-8" is a fixed technical encoding name, identical in
              every language -- fact() with kind "tag" (the nearest of
              the fixed FactKind set to "short technical label"; kind is
              documentation-only, see uh/localized.ts) rather than a raw
              JSX string, which the uh/no-unlocalized-text lint rule
              would otherwise (rightly) flag. */}
          <dd>
            <Txt channel="fact" value="UTF-8" kind="tag" />
          </dd>
          <dt className="font-semibold">
            <Txt ns="exports" k="schemaLabel" channel="label" />
          </dt>
          <dd className="font-mono">{result.schemaDescription}</dd>
        </dl>

        {savedFilename ? (
          <EditorHandoff filename={savedFilename} state={editorState} onOpen={handleOpenInEditor} onCopy={handleCopyPath} />
        ) : null}
      </div>
    </Dialog>
  )
}

function CaveatsPanel({ caveats }: { caveats: readonly { readonly message: string }[] }) {
  const t = useT("exports")
  if (caveats.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-[10px] bg-surface-high px-3 py-2.5 text-[12px] text-on-surface-variant">
        <Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-primary" />
        <span>{t("noCaveats")}</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] bg-tertiary-container px-3 py-2.5 text-on-tertiary-container">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold">
        <Icon name="warning" size={16} className="shrink-0" />
        <span>{t("caveatsHeading")}</span>
      </div>
      <ul className="flex flex-col gap-1 pl-[22px] text-[12px] leading-[1.5] list-disc">
        {caveats.map((caveat, index) => (
          <li key={index}>{caveat.message}</li>
        ))}
      </ul>
    </div>
  )
}

function EditorHandoff({
  filename,
  state,
  onOpen,
  onCopy,
}: {
  filename: string
  state: EditorHandoffState
  onOpen: () => void
  onCopy: () => void
}) {
  const t = useT("exports")
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-outline-variant px-3 py-2.5">
      <div className="flex items-center gap-2 text-[12.5px]">
        <Icon name="check_circle" size={16} className="shrink-0 text-primary" />
        <span>
          <Txt ns="exports" k="saved" channel="label" /> <span className="font-mono">{filename}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outlined" size="sm" icon="code" onClick={onOpen} loading={state.kind === "opening"}>
          {t("openInEditor")}
        </Button>
        <Button variant="text" size="sm" onClick={onCopy}>
          {t("copyPath")}
        </Button>
      </div>
      <EditorHandoffStatus state={state} />
    </div>
  )
}

function EditorHandoffStatus({ state }: { state: EditorHandoffState }) {
  const t = useT("exports")
  if (state.kind === "copied") {
    return <p className="text-[11.5px] text-primary">{t("pathCopied")}</p>
  }
  if (state.kind === "copy-failed") {
    return <p className="text-[11.5px] text-error">{t("pathCopyFailed")}</p>
  }
  if (state.kind === "result" && !state.outcome.ok) {
    const message =
      state.outcome.reason === "not-installed"
        ? t("editorNotInstalled")
        : state.outcome.reason === "launch-failed"
          ? t("editorLaunchFailed")
          : t("editorBridgeUnavailable")
    return <p className="text-[11.5px] text-error">{message}</p>
  }
  return null
}
