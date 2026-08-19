// The shared exporter: any list this app owns can be turned into JSON,
// JSONL, YAML, CSV, TSV, Markdown, or HTML by giving it rows plus a set of
// columns describing how to project each row into a value. Every format
// states its encoding (always UTF-8 -- everything here is plain text) and
// its schema in-band where the format allows a preamble, and every format's
// representational limits are computed by `describeExportCaveats()` BEFORE
// `buildExport()` ever runs, so a caller can show "CSV will flatten the
// `tags` column to JSON text" before committing to the download rather than
// silently truncating or dropping data.
import { yamlStringify, type YamlValue } from "./yamlStringify"

/** The value shapes a column may project a row into. Deliberately a closed,
 * JSON-safe union (mirroring what every one of the seven formats can
 * actually carry in some form) rather than `unknown` -- so a caller can't
 * hand this a function or a class instance and discover only at export
 * time that it serialized as `"[object Object]"`. */
export type ExportPrimitive = string | number | boolean | null
export type ExportValue =
  | ExportPrimitive
  | Date
  | readonly ExportValue[]
  | { readonly [key: string]: ExportValue }

/** JSON-only normalized form -- `Date` has already been converted to an
 * ISO-8601 string by `normalizeExportValue()`. */
type NormalizedValue =
  | ExportPrimitive
  | readonly NormalizedValue[]
  | { readonly [key: string]: NormalizedValue }

export interface ExportColumn<T> {
  /** Stable machine key -- becomes the CSV/TSV header cell, the JSON
   * object key, and the Markdown/HTML column header text. */
  readonly key: string
  /** Human-readable header. Falls back to `key` when omitted. This is
   * exported *file* content, not rendered UI chrome, so it is a plain
   * string rather than routed through the `uh` layer's `Localized` --
   * the same way a CSV header or a JSON key is never translated. */
  readonly header?: string
  readonly get: (row: T) => ExportValue
}

export type ExportFormatId = "json" | "jsonl" | "yaml" | "csv" | "tsv" | "markdown" | "html"

export interface ExportFormatDescriptor {
  readonly id: ExportFormatId
  /** Display label -- plain string for the same reason `header` above is:
   * this describes machine file formats ("JSON", "CSV"), not localized
   * prose. Callers building UI copy route the *sentence around* this
   * value through `t()`/`Txt`, e.g. `t("exports.formatLabel", {format})`. */
  readonly label: string
  readonly extension: string
  readonly mimeType: string
  /** Whether nested objects/arrays round-trip losslessly in this format.
   * `false` doesn't mean data is dropped -- every format here still emits
   * every value -- it means a lossy *representation* (JSON-text-in-a-cell)
   * is used for structure the format can't natively express, and that
   * shows up as a caveat. */
  readonly structurallyLossless: boolean
}

export const EXPORT_FORMATS: readonly ExportFormatDescriptor[] = [
  { id: "json", label: "JSON", extension: "json", mimeType: "application/json", structurallyLossless: true },
  { id: "jsonl", label: "JSONL", extension: "jsonl", mimeType: "application/x-ndjson", structurallyLossless: true },
  { id: "yaml", label: "YAML", extension: "yaml", mimeType: "application/yaml", structurallyLossless: true },
  { id: "csv", label: "CSV", extension: "csv", mimeType: "text/csv", structurallyLossless: false },
  { id: "tsv", label: "TSV", extension: "tsv", mimeType: "text/tab-separated-values", structurallyLossless: false },
  { id: "markdown", label: "Markdown", extension: "md", mimeType: "text/markdown", structurallyLossless: false },
  { id: "html", label: "HTML", extension: "html", mimeType: "text/html", structurallyLossless: true },
] as const

export function getExportFormat(id: ExportFormatId): ExportFormatDescriptor {
  const format = EXPORT_FORMATS.find((candidate) => candidate.id === id)
  if (!format) throw new Error(`exports: unknown format id "${id}"`)
  return format
}

export interface ExportCaveat {
  /** Which column this caveat is about, or omitted for a whole-export note. */
  readonly columnKey?: string
  /** Plain-text explanation of what this format cannot carry natively and
   * what happens to that data instead. Never "data was dropped" -- every
   * caveat here describes a *representation* change, because every format
   * still emits every value. */
  readonly message: string
}

function normalizeExportValue(value: ExportValue): NormalizedValue {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalizeExportValue)
  if (value !== null && typeof value === "object") {
    const out: Record<string, NormalizedValue> = {}
    for (const key of Object.keys(value)) {
      out[key] = normalizeExportValue((value as Record<string, ExportValue>)[key])
    }
    return out
  }
  return value
}

function isStructured(value: NormalizedValue): value is
  | readonly NormalizedValue[]
  | { readonly [key: string]: NormalizedValue } {
  return value !== null && typeof value === "object"
}

function columnHeader<T>(column: ExportColumn<T>): string {
  return column.header ?? column.key
}

interface ProjectedRow {
  readonly [key: string]: NormalizedValue
}

function projectRows<T>(rows: readonly T[], columns: readonly ExportColumn<T>[]): ProjectedRow[] {
  return rows.map((row) => {
    const projected: Record<string, NormalizedValue> = {}
    for (const column of columns) {
      projected[column.key] = normalizeExportValue(column.get(row))
    }
    return projected
  })
}

/**
 * Names, in plain language and BEFORE the export runs, everything the
 * chosen format cannot carry natively about this exact data -- so a
 * caller can show "CSV flattens `tags` to JSON text" ahead of the
 * download rather than after. Returns an empty array for a fully faithful
 * combination (every column's values are already flat scalars, or the
 * format is structurally lossless).
 */
export function describeExportCaveats<T>(
  formatId: ExportFormatId,
  rows: readonly T[],
  columns: readonly ExportColumn<T>[],
): ExportCaveat[] {
  const format = getExportFormat(formatId)
  const caveats: ExportCaveat[] = []

  if (rows.length === 0) {
    caveats.push({ message: "There is nothing to export yet -- the list is empty." })
    return caveats
  }

  if (format.structurallyLossless) return caveats

  const projected = projectRows(rows, columns)
  for (const column of columns) {
    const hasStructuredValue = projected.some((row) => isStructured(row[column.key]))
    if (!hasStructuredValue) continue

    if (formatId === "markdown") {
      caveats.push({
        columnKey: column.key,
        message: `"${columnHeader(column)}" holds nested data; each cell shows it as inline JSON text rather than a native Markdown structure.`,
      })
    } else {
      caveats.push({
        columnKey: column.key,
        message: `"${columnHeader(column)}" holds nested data; ${format.label} has no native way to carry it, so each cell holds JSON text instead.`,
      })
    }
  }

  if (formatId === "markdown") {
    const hasPipeOrNewline = projected.some((row) =>
      columns.some((column) => {
        const value = row[column.key]
        return typeof value === "string" && (value.includes("|") || value.includes("\n"))
      }),
    )
    if (hasPipeOrNewline) {
      caveats.push({
        message: "Some values contain \"|\" or a line break; both are escaped (\\| and <br>) so the table stays well-formed.",
      })
    }
  }

  return caveats
}

function scalarToText(value: NormalizedValue): string {
  if (value === null) return ""
  if (typeof value === "boolean") return value ? "true" : "false"
  if (isStructured(value)) return JSON.stringify(value)
  return String(value)
}

// --- JSON / JSONL -----------------------------------------------------

function buildJson(rows: readonly ProjectedRow[], columns: readonly string[]): string {
  const envelope = {
    $schema: "material-ollama.export/v1",
    encoding: "utf-8",
    exportedAt: new Date().toISOString(),
    columns,
    rowCount: rows.length,
    rows,
  }
  return JSON.stringify(envelope, null, 2) + "\n"
}

function buildJsonl(rows: readonly ProjectedRow[]): string {
  // Pure NDJSON -- one JSON value per line, nothing else -- because that is
  // the whole of what "JSONL" means, and a strict NDJSON reader would
  // choke on any non-JSON preamble line. Encoding/schema are stated in the
  // UI around the download, not embedded in the file.
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "")
}

// --- YAML ---------------------------------------------------------------

function buildYaml(rows: readonly ProjectedRow[], columns: readonly string[]): string {
  const header = [
    "# material-ollama export",
    "# encoding: utf-8",
    `# exportedAt: ${new Date().toISOString()}`,
    `# columns: [${columns.join(", ")}]`,
  ].join("\n")
  const body = yamlStringify({ rows: rows as unknown as YamlValue })
  return header + "\n" + body + "\n"
}

// --- CSV / TSV ------------------------------------------------------------

function csvEscapeCell(value: string, delimiter: string): string {
  const needsQuoting =
    value.includes(delimiter) || value.includes('"') || value.includes("\n") || value.includes("\r")
  if (!needsQuoting) return value
  return `"${value.replace(/"/g, '""')}"`
}

function buildDelimited(
  rows: readonly ProjectedRow[],
  columns: readonly { key: string; header: string }[],
  delimiter: string,
): string {
  const lines: string[] = []
  lines.push(columns.map((column) => csvEscapeCell(column.header, delimiter)).join(delimiter))
  for (const row of rows) {
    lines.push(
      columns.map((column) => csvEscapeCell(scalarToText(row[column.key]), delimiter)).join(delimiter),
    )
  }
  // CRLF line endings -- the RFC 4180 convention most spreadsheet
  // importers (including the one this UI's own users are most likely to
  // reach for) expect for CSV specifically. TSV keeps the same convention
  // for consistency between the two delimited formats.
  return lines.join("\r\n") + "\r\n"
}

// --- Markdown -------------------------------------------------------------

function markdownEscapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r\n|\n|\r/g, "<br>")
}

function buildMarkdown(
  rows: readonly ProjectedRow[],
  columns: readonly { key: string; header: string }[],
): string {
  const lines: string[] = []
  lines.push(`> Encoding: UTF-8 · Exported ${new Date().toISOString()} · ${rows.length} row${rows.length === 1 ? "" : "s"}`)
  lines.push("")
  lines.push("| " + columns.map((column) => markdownEscapeCell(column.header)).join(" | ") + " |")
  lines.push("| " + columns.map(() => "---").join(" | ") + " |")
  for (const row of rows) {
    lines.push("| " + columns.map((column) => markdownEscapeCell(scalarToText(row[column.key]))).join(" | ") + " |")
  }
  return lines.join("\n") + "\n"
}

// --- HTML -------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildHtml(
  rows: readonly ProjectedRow[],
  columns: readonly { key: string; header: string }[],
  title: string,
): string {
  const head = columns.map((column) => `      <th scope="col">${escapeHtml(column.header)}</th>`).join("\n")
  const body = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const value = row[column.key]
          const text = isStructured(value) ? JSON.stringify(value) : scalarToText(value)
          return `      <td>${escapeHtml(text)}</td>`
        })
        .join("\n")
      return `    <tr>\n${cells}\n    </tr>`
    })
    .join("\n")
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    `  <title>${escapeHtml(title)}</title>`,
    "</head>",
    "<body>",
    `  <!-- material-ollama export · encoding: utf-8 · exported ${new Date().toISOString()} · ${rows.length} row(s) -->`,
    `  <table data-export-schema="material-ollama.export/v1">`,
    "    <caption>" + escapeHtml(title) + "</caption>",
    "    <thead>",
    "      <tr>",
    head,
    "      </tr>",
    "    </thead>",
    "    <tbody>",
    body,
    "    </tbody>",
    "  </table>",
    "</body>",
    "</html>",
    "",
  ].join("\n")
}

export interface ExportResult {
  readonly formatId: ExportFormatId
  readonly filename: string
  readonly mimeType: string
  readonly encoding: "utf-8"
  /** One-line, plain-language description of this format's schema for
   * this export -- what a reader opening the file cold needs to know. */
  readonly schemaDescription: string
  readonly content: string
  readonly caveats: readonly ExportCaveat[]
}

export interface BuildExportOptions<T> {
  readonly formatId: ExportFormatId
  readonly rows: readonly T[]
  readonly columns: readonly ExportColumn<T>[]
  /** Filename stem, no extension and no path separators -- the format's
   * own extension is appended. */
  readonly suggestedName: string
}

function sanitizeFilenameStem(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]+/g, "_")
  return cleaned.length > 0 ? cleaned : "export"
}

/** Builds the real, complete file content for one format -- this is the
 * function every UI in this lane calls; it never truncates or drops a
 * value, and `describeExportCaveats()` (called with the same arguments)
 * tells a caller what representational compromises it made. */
export function buildExport<T>(options: BuildExportOptions<T>): ExportResult {
  const { formatId, rows, columns, suggestedName } = options
  const format = getExportFormat(formatId)
  const projected = projectRows(rows, columns)
  const columnMeta = columns.map((column) => ({ key: column.key, header: columnHeader(column) }))
  const columnKeys = columns.map((column) => column.key)
  const caveats = describeExportCaveats(formatId, rows, columns)
  const filename = `${sanitizeFilenameStem(suggestedName)}.${format.extension}`

  let content: string
  let schemaDescription: string

  switch (formatId) {
    case "json":
      content = buildJson(projected, columnKeys)
      schemaDescription = `A JSON object with "columns" (the field names) and "rows" (one object per record, keys: ${columnKeys.join(", ")}).`
      break
    case "jsonl":
      content = buildJsonl(projected)
      schemaDescription = `One JSON object per line (NDJSON), keys: ${columnKeys.join(", ")}.`
      break
    case "yaml":
      content = buildYaml(projected, columnKeys)
      schemaDescription = `A YAML mapping with a "rows" sequence, one mapping per record, keys: ${columnKeys.join(", ")}.`
      break
    case "csv":
      content = buildDelimited(projected, columnMeta, ",")
      schemaDescription = `The header row lists the column names (${columnMeta.map((c) => c.header).join(", ")}); every following row is one record.`
      break
    case "tsv":
      content = buildDelimited(projected, columnMeta, "\t")
      schemaDescription = `Tab-separated, same shape as CSV -- the header row lists the column names (${columnMeta.map((c) => c.header).join(", ")}).`
      break
    case "markdown":
      content = buildMarkdown(projected, columnMeta)
      schemaDescription = `A Markdown table with one row per record, columns: ${columnMeta.map((c) => c.header).join(", ")}.`
      break
    case "html":
      content = buildHtml(projected, columnMeta, suggestedName)
      schemaDescription = `An HTML <table data-export-schema="material-ollama.export/v1"> with a <thead> naming the columns and one <tr> per record.`
      break
  }

  return {
    formatId,
    filename,
    mimeType: format.mimeType,
    encoding: "utf-8",
    schemaDescription,
    content,
    caveats,
  }
}
