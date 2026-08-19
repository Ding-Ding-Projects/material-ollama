import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import { buildExport, type ExportColumn } from "./exportFormats"

// Same pattern src/components/StreamingMarkdownContent.test.tsx already
// uses for this exact package: `streamdown` pulls in katex's CSS at
// import time, which Vitest's Node-based test runner can't load (node
// treats node_modules packages as external, bypassing Vite's CSS
// pipeline). Mocking the boundary lets this test prove the real thing
// that matters here -- that ExportPreview hands the real markdown STRING
// to the app's one shared renderer rather than printing it as raw text by
// default -- without re-testing Streamdown's own internal parsing (that's
// covered by its own package, and by StreamingMarkdownContent's tests for
// how *this app* configures it).
const streamdownMock = vi.hoisted(() => vi.fn((props: { children?: string }) => (
  <div data-testid="streamdown-mock">{props.children}</div>
)))
vi.mock("streamdown", () => ({ Streamdown: streamdownMock }))

// `vi.mock` above is hoisted above this import by Vitest's transform, so
// ExportPreview (and the real streamdown import inside it) resolves to
// the mock rather than the real package.
import { ExportPreview } from "./ExportPreview"

interface Row {
  id: string
  note: string
}

const rows: Row[] = [{ id: "a", note: "**bold** _italic_" }]
const columns: ExportColumn<Row>[] = [
  { key: "id", header: "ID", get: (row) => row.id },
  { key: "note", header: "Note", get: (row) => row.note },
]

// The raw-source view is the only <pre> ExportPreview ever renders, but
// its wrapping WideContentScroller <div> reports the same textContent
// (it has no other children), so a plain screen.getByText(...) call
// matches both and errors as ambiguous -- scope to the <pre> tag itself.
function getRawSourcePre(): HTMLElement | null {
  return document.querySelector("pre")
}

function renderPreview(formatId: "markdown" | "html" | "json" | "csv") {
  const result = buildExport({ formatId, rows, columns, suggestedName: "widgets" })
  render(
    <UhProvider>
      <ExportPreview result={result} />
    </UhProvider>,
  )
  return result
}

describe("ExportPreview", () => {
  beforeEach(() => {
    streamdownMock.mockClear()
  })

  it("hands Markdown to the shared renderer by default, not the raw <pre> source", () => {
    const result = renderPreview("markdown")

    expect(streamdownMock.mock.calls.length).toBeGreaterThan(0)
    // The exact, real, unmodified export content -- not a truncated or
    // re-escaped copy -- is what reaches the renderer.
    expect(streamdownMock.mock.calls[0]?.[0]).toMatchObject({ children: result.content })
    expect(screen.getByTestId("streamdown-mock")).toBeInTheDocument()

    // The raw-source view exists but isn't shown until asked for.
    expect(getRawSourcePre()).toBeNull()
    expect(screen.getByRole("button", { name: "View raw source" })).toBeInTheDocument()
  })

  it("lets a user flip to the raw source and back for Markdown", async () => {
    const user = userEvent.setup()
    const result = renderPreview("markdown")

    await user.click(screen.getByRole("button", { name: "View raw source" }))
    expect(getRawSourcePre()?.textContent).toBe(result.content)
    expect(screen.queryByTestId("streamdown-mock")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "View rendered" }))
    expect(screen.getByTestId("streamdown-mock")).toBeInTheDocument()
    expect(getRawSourcePre()).toBeNull()
  })

  it("renders HTML through a fully sandboxed iframe rather than injecting it into the page", () => {
    renderPreview("html")
    const frame = screen.getByTitle("HTML export preview") as HTMLIFrameElement
    expect(frame.tagName.toLowerCase()).toBe("iframe")
    // Empty sandbox attribute -- the maximally restrictive setting: no
    // scripts, no same-origin, no forms, no popups.
    expect(frame.getAttribute("sandbox")).toBe("")
    // The HTML source is handed to the iframe's own isolated document via
    // srcDoc, never dangerouslySetInnerHTML'd into this app's own DOM.
    expect(frame.srcdoc).toContain("<table")
    expect(streamdownMock).not.toHaveBeenCalled()
  })

  it("offers no rendered/raw toggle for data formats -- there is no 'rendered form' of a CSV row", () => {
    renderPreview("csv")
    expect(screen.queryByRole("button", { name: "View raw source" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "View rendered" })).not.toBeInTheDocument()
    expect(streamdownMock).not.toHaveBeenCalled()
  })

  it("shows JSON as labeled monospace text (this app's own generated data, not provider prose)", () => {
    const result = renderPreview("json")
    expect(getRawSourcePre()?.textContent).toBe(result.content)
  })

  it("carries an accessible region name on the preview's scroll container", () => {
    renderPreview("json")
    expect(screen.getByRole("region", { name: "Preview" })).toBeInTheDocument()
  })
})
