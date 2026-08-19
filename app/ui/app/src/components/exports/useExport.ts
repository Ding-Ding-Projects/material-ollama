import { useCallback, useMemo, useState } from "react"
import {
  buildExport,
  describeExportCaveats,
  EXPORT_FORMATS,
  type ExportColumn,
  type ExportFormatId,
  type ExportResult,
} from "./exportFormats"

export interface UseExportOptions<T> {
  readonly rows: readonly T[]
  readonly columns: readonly ExportColumn<T>[]
  readonly suggestedName: string
  readonly initialFormat?: ExportFormatId
}

export type SaveOutcome =
  | { readonly saved: true; readonly filename: string }
  | { readonly saved: false; readonly reason: "empty" }

export interface UseExportResult {
  readonly formats: typeof EXPORT_FORMATS
  readonly formatId: ExportFormatId
  readonly setFormatId: (id: ExportFormatId) => void
  /** The full built export for the currently selected format -- content,
   * filename, mime type, encoding, schema description, and caveats --
   * recomputed whenever the format or the underlying data changes. */
  readonly result: ExportResult
  /** Real browser download: creates a same-content Blob, a temporary
   * object URL, and clicks a real anchor with a `download` attribute —
   * this is the standard, functioning save mechanism for a page running
   * in an actual browser/WebView2 host (this app), not a sandboxed
   * preview surface. Returns `{saved: false}` without downloading
   * anything when there is genuinely nothing to export. */
  readonly save: () => SaveOutcome
  /** Caveats for a format OTHER than the currently selected one — lets a
   * format picker show "CSV will flatten `tags`" while the user is still
   * looking at the JSON preview, before they've switched anything. */
  readonly describeCaveatsFor: (candidateFormatId: ExportFormatId) => ReturnType<typeof describeExportCaveats>
}

/** Real, working client-side download: Blob + object URL + a programmatic
 * anchor click. Exported separately from the hook so callers (and tests)
 * can reuse it without also carrying the hook's format-selection state. */
export function downloadExportResult(result: ExportResult): void {
  const blob = new Blob([result.content], { type: `${result.mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = result.filename
    // Not attached to the document in most browsers' documented pattern,
    // but Firefox specifically requires the anchor to be in the DOM for
    // `.click()` to trigger a download rather than a no-op navigation.
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  } finally {
    // Revoke on a timeout, not immediately -- revoking synchronously can
    // race the browser's own download handoff in some engines.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/**
 * The exporter's stateful half: format selection plus the live built
 * result for whatever data the caller owns. Every format in
 * `EXPORT_FORMATS` is always offered (this hook never narrows the list) —
 * `result.caveats` is what tells the UI what THIS format will do to THIS
 * data, computed fresh on every render from the real serializer, never a
 * static description that could drift from what actually gets written.
 */
export function useExport<T>(options: UseExportOptions<T>): UseExportResult {
  const { rows, columns, suggestedName, initialFormat = "json" } = options
  const [formatId, setFormatId] = useState<ExportFormatId>(initialFormat)

  const result = useMemo(
    () => buildExport({ formatId, rows, columns, suggestedName }),
    [formatId, rows, columns, suggestedName],
  )

  const describeCaveatsFor = useCallback(
    (candidateFormatId: ExportFormatId) => describeExportCaveats(candidateFormatId, rows, columns),
    [rows, columns],
  )

  const save = useCallback((): SaveOutcome => {
    if (rows.length === 0) return { saved: false, reason: "empty" }
    downloadExportResult(result)
    return { saved: true, filename: result.filename }
  }, [rows.length, result])

  return { formats: EXPORT_FORMATS, formatId, setFormatId, result, save, describeCaveatsFor }
}
