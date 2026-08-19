import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ExportColumn } from "./exportFormats"
import { downloadExportResult, useExport } from "./useExport"

interface Row {
  id: string
  name: string
}

const rows: Row[] = [
  { id: "a", name: "alpha" },
  { id: "b", name: "beta" },
]

const columns: ExportColumn<Row>[] = [
  { key: "id", header: "ID", get: (row) => row.id },
  { key: "name", header: "Name", get: (row) => row.name },
]

function Harness({ initialFormat = "json" as const, data = rows }: { initialFormat?: "json" | "csv"; data?: Row[] }) {
  const { formatId, setFormatId, result, save, describeCaveatsFor } = useExport({
    rows: data,
    columns,
    suggestedName: "widgets",
    initialFormat,
  })
  const csvCaveats = describeCaveatsFor("csv")
  return (
    <div>
      <p data-testid="format">{formatId}</p>
      <p data-testid="filename">{result.filename}</p>
      <p data-testid="content">{result.content}</p>
      <p data-testid="caveat-count">{result.caveats.length}</p>
      <p data-testid="preview-caveat-count">{csvCaveats.length}</p>
      <button type="button" onClick={() => setFormatId("csv")}>
        switch to csv
      </button>
      <button
        type="button"
        onClick={() => {
          const outcome = save()
          document.title = outcome.saved ? `saved:${outcome.filename}` : `not-saved:${outcome.reason}`
        }}
      >
        save
      </button>
    </div>
  )
}

describe("useExport", () => {
  it("rebuilds the result when the selected format changes", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.getByTestId("format")).toHaveTextContent("json")
    expect(screen.getByTestId("filename")).toHaveTextContent("widgets.json")

    await user.click(screen.getByRole("button", { name: "switch to csv" }))

    expect(screen.getByTestId("format")).toHaveTextContent("csv")
    expect(screen.getByTestId("filename")).toHaveTextContent("widgets.csv")
    expect(screen.getByTestId("content")).toHaveTextContent("ID,Name")
  })

  it("exposes caveats for a format the user hasn't switched to yet", () => {
    render(<Harness />)
    // Neither column is structured in this fixture, so CSV has no caveats
    // even previewed ahead of time -- proving describeCaveatsFor really
    // runs the real check rather than always returning something.
    expect(screen.getByTestId("preview-caveat-count")).toHaveTextContent("0")
    expect(screen.getByTestId("caveat-count")).toHaveTextContent("0")
  })

  it("names the empty-export caveat on the currently selected format", () => {
    render(<Harness data={[]} />)
    expect(screen.getByTestId("caveat-count")).toHaveTextContent("1")
  })
})

describe("useExport save()", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("returns saved:false and downloads nothing for an empty list", async () => {
    const user = userEvent.setup()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click")
    render(<Harness data={[]} />)

    await user.click(screen.getByRole("button", { name: "save" }))

    expect(document.title).toBe("not-saved:empty")
    expect(clickSpy).not.toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it("really triggers a Blob-anchor download with the right filename for a non-empty list", async () => {
    const user = userEvent.setup()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "save" }))

    expect(document.title).toBe("saved:widgets.json")
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    const blobArg = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Blob
    expect(blobArg).toBeInstanceOf(Blob)
    expect(blobArg.type).toContain("application/json")
    clickSpy.mockRestore()

    // downloadExportResult() revokes the object URL on a real setTimeout(0);
    // let it fire here, while the URL stub is still installed, rather than
    // letting it leak into a later test after afterEach() has restored the
    // real (non-stubbed) URL global.
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
  })
})

describe("downloadExportResult", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("appends and removes the anchor from the document rather than leaking it", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const before = document.body.childElementCount
    downloadExportResult({
      formatId: "csv",
      filename: "out.csv",
      mimeType: "text/csv",
      encoding: "utf-8",
      schemaDescription: "",
      content: "a,b\n1,2\n",
      caveats: [],
    })
    expect(document.body.childElementCount).toBe(before)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
    // Drain the real setTimeout(0) revoke before this test's afterEach
    // unstubs URL, so nothing fires against the restored real global later.
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  it("revokes the object URL on a timer so it doesn't race the browser's download handoff", () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    downloadExportResult({
      formatId: "csv",
      filename: "out.csv",
      mimeType: "text/csv",
      encoding: "utf-8",
      schemaDescription: "",
      content: "a,b\n1,2\n",
      caveats: [],
    })
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    act(() => {
      vi.runAllTimers()
    })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
  })
})
