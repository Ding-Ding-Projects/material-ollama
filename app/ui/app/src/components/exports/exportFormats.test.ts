import { describe, expect, it } from "vitest"
import {
  buildExport,
  describeExportCaveats,
  EXPORT_FORMATS,
  getExportFormat,
  type ExportColumn,
} from "./exportFormats"

interface Row {
  id: string
  name: string
  size: number
  active: boolean
  tags: string[]
  installedAt: Date
  note: string | null
}

const rows: Row[] = [
  {
    id: "m1",
    name: "llama3",
    size: 4_700_000_000,
    active: true,
    tags: ["chat", "8b"],
    installedAt: new Date("2026-01-02T03:04:05.000Z"),
    note: null,
  },
  {
    id: "m2",
    name: 'model "two" | pipes\nand a newline',
    size: 1200,
    active: false,
    tags: [],
    installedAt: new Date("2026-02-03T04:05:06.000Z"),
    note: "has a comma, right here",
  },
]

const columns: ExportColumn<Row>[] = [
  { key: "id", header: "ID", get: (row) => row.id },
  { key: "name", header: "Name", get: (row) => row.name },
  { key: "size", header: "Size (bytes)", get: (row) => row.size },
  { key: "active", header: "Active", get: (row) => row.active },
  { key: "tags", header: "Tags", get: (row) => row.tags },
  { key: "installedAt", header: "Installed", get: (row) => row.installedAt },
  { key: "note", header: "Note", get: (row) => row.note },
]

describe("EXPORT_FORMATS", () => {
  it("lists exactly the seven required formats", () => {
    expect(EXPORT_FORMATS.map((f) => f.id).sort()).toEqual(
      ["csv", "html", "json", "jsonl", "markdown", "tsv", "yaml"].sort(),
    )
  })

  it("getExportFormat throws on an unknown id rather than returning undefined silently", () => {
    // @ts-expect-error -- deliberately an invalid id
    expect(() => getExportFormat("xml")).toThrow(/unknown format id/)
  })
})

describe("describeExportCaveats", () => {
  it("names the empty-list case before any format-specific work", () => {
    const caveats = describeExportCaveats("csv", [], columns)
    expect(caveats).toHaveLength(1)
    expect(caveats[0]?.message).toMatch(/nothing to export/i)
  })

  it("is empty for lossless formats even though `tags` is nested", () => {
    expect(describeExportCaveats("json", rows, columns)).toEqual([])
    expect(describeExportCaveats("jsonl", rows, columns)).toEqual([])
    expect(describeExportCaveats("yaml", rows, columns)).toEqual([])
    expect(describeExportCaveats("html", rows, columns)).toEqual([])
  })

  it("names the exact column that will be flattened for CSV/TSV, before export runs", () => {
    const caveats = describeExportCaveats("csv", rows, columns)
    const tagsCaveat = caveats.find((c) => c.columnKey === "tags")
    expect(tagsCaveat).toBeDefined()
    expect(tagsCaveat?.message).toContain("Tags")
    expect(tagsCaveat?.message.toLowerCase()).toContain("json text")
    // Only the structured column is called out -- id/name/size/active/note
    // are all flat scalars and need no caveat.
    expect(caveats.filter((c) => c.columnKey).map((c) => c.columnKey)).toEqual(["tags"])
  })

  it("flags markdown's pipe/newline escaping only when a value actually needs it", () => {
    const withPipe = describeExportCaveats("markdown", rows, columns)
    expect(withPipe.some((c) => c.message.includes("|"))).toBe(true)

    const plainRows: Row[] = [{ ...rows[0]!, name: "plain", tags: [], note: null }]
    const plainCaveats = describeExportCaveats("markdown", plainRows, columns.filter((c) => c.key !== "tags"))
    expect(plainCaveats).toEqual([])
  })
})

describe("buildExport", () => {
  it("names the file with the format's own extension and sanitizes an unsafe suggested name", () => {
    const result = buildExport({
      formatId: "csv",
      rows,
      columns,
      suggestedName: 'models: "installed"/list',
    })
    // Consecutive unsafe characters collapse into a single "_" (":" then
    // the boundary between the closing quote and "/" is one run) rather
    // than piling up underscores one-per-character.
    expect(result.filename).toBe("models_ _installed_list.csv")
    expect(result.mimeType).toBe("text/csv")
    expect(result.encoding).toBe("utf-8")
  })

  it("round-trips every row through JSON with no data loss", () => {
    const result = buildExport({ formatId: "json", rows, columns, suggestedName: "models" })
    const parsed = JSON.parse(result.content) as { columns: string[]; rows: Record<string, unknown>[] }
    expect(parsed.columns).toEqual(["id", "name", "size", "active", "tags", "installedAt", "note"])
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]).toMatchObject({
      id: "m1",
      name: "llama3",
      size: 4_700_000_000,
      active: true,
      tags: ["chat", "8b"],
      installedAt: "2026-01-02T03:04:05.000Z",
      note: null,
    })
  })

  it("emits valid NDJSON for jsonl -- one parseable object per line, nothing else", () => {
    const result = buildExport({ formatId: "jsonl", rows, columns, suggestedName: "models" })
    const lines = result.content.trimEnd().split("\n")
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
    const first = JSON.parse(lines[0]!) as Record<string, unknown>
    expect(first.id).toBe("m1")
  })

  it("produces a YAML document whose rows sequence matches the source data", () => {
    const result = buildExport({ formatId: "yaml", rows, columns, suggestedName: "models" })
    expect(result.content).toContain("# encoding: utf-8")
    expect(result.content).toContain("rows:")
    expect(result.content).toContain("id: m1")
    expect(result.content).toContain('name: llama3')
    // The quoted, comma-and-pipe-bearing name round-trips through JSON's
    // escaping, which is valid YAML double-quoted scalar syntax.
    expect(result.content).toContain(JSON.stringify(rows[1]!.name))
  })

  it("escapes CSV cells containing the delimiter, quotes, or newlines per RFC 4180 and uses CRLF lines", () => {
    const result = buildExport({ formatId: "csv", rows, columns, suggestedName: "models" })
    expect(result.content.startsWith("ID,Name,Size (bytes)")).toBe(true)
    expect(result.content).toContain("\r\n")
    // model "two" | pipes\nand a newline -> quoted, internal quotes doubled
    expect(result.content).toContain('"model ""two"" | pipes\nand a newline"')
    // tags flattened to JSON text, then CSV-quoted because it contains a comma
    expect(result.content).toContain('"[""chat"",""8b""]"')
    // a null note becomes an empty cell, not the literal word "null"
    const lines = result.content.trim().split("\r\n")
    expect(lines[1]!.endsWith(",")).toBe(true)
  })

  it("uses tabs instead of commas for TSV, and only quotes cells containing a tab/quote/newline", () => {
    const result = buildExport({ formatId: "tsv", rows, columns, suggestedName: "models" })
    expect(result.content.startsWith("ID\tName\tSize (bytes)")).toBe(true)
    // A comma alone (in row 2's note) must NOT trigger TSV quoting.
    expect(result.content).toContain("has a comma, right here")
    expect(result.content).not.toContain('"has a comma, right here"')
  })

  it("escapes markdown table cells and states the row count in a leading blockquote", () => {
    const result = buildExport({ formatId: "markdown", rows, columns, suggestedName: "models" })
    expect(result.content).toMatch(/^> Encoding: UTF-8 · Exported .* · 2 rows/)
    expect(result.content).toContain("| ID | Name |")
    // The pipe in "two | pipes" is escaped; the newline becomes <br>.
    // (Markdown table cells don't need quote-escaping, unlike CSV.)
    expect(result.content).toContain('model "two" \\| pipes<br>and a newline')
  })

  it("emits an HTML table with escaped cell content and a schema attribute", () => {
    const result = buildExport({ formatId: "html", rows, columns, suggestedName: "models" })
    expect(result.content).toContain('<table data-export-schema="material-ollama.export/v1">')
    expect(result.content).toContain("<th scope=\"col\">ID</th>")
    // "&" "<" ">" "\"" all get escaped in cell content.
    expect(result.content).toContain("model &quot;two&quot; | pipes")
    expect(result.content).not.toContain("<script")
  })

  it("never drops a row or a column across any of the seven formats", () => {
    for (const format of EXPORT_FORMATS) {
      const result = buildExport({ formatId: format.id, rows, columns, suggestedName: "models" })
      // Every row's id must appear somewhere in the content, for every format.
      for (const row of rows) {
        expect(result.content).toContain(row.id)
      }
    }
  })
})
